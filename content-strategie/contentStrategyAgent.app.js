// routes/contentStrategyAgent.ts
//
// Content-Strategie-Agent: eigenständiges Feature (siehe Chat-Verlauf), kein Teil von
// pageAgent.ts. Nimmt ein Thema (+ optional eigene Domain) entgegen und liefert einen
// Content-Cluster - EINE Conversion-Seite + mehrere unterstützende Seiten mit Seitentyp,
// Rolle (coverage/citation/existing), interner Verlinkung und GEO-Strategie (welche Portale
// zitieren das Thema bereits, optional echter Prompt-Test).
//
// ABHÄNGIGKEITEN, DIE VOR DEM ERSTEN ECHTEN LAUF GEPRÜFT WERDEN SOLLTEN:
// - migrations/content_strategy_quota.sql und migrations/content_strategy_sessions.sql
//   müssen in Supabase ausgeführt sein.
// - services/googleSearchConsole.ts setzt GOOGLE_OAUTH_CLIENT_ID/_SECRET/_REDIRECT_URI und
//   GSC_TOKEN_ENCRYPTION_KEY voraus (siehe env.example) - ohne GSC-Verbindung fällt
//   analyze_domain_footprint automatisch auf den DataForSEO-Fallback zurück, das ist kein
//   Fehlerfall.
// - services/contentStrategyGeo.ts: Feldpfade der ai_optimization-Antworten sind NICHT gegen
//   echte DataForSEO-Responses geprüft (siehe Hinweis dort) - vor Produktivbetrieb einmal
//   gegen einen echten Call verifizieren.
//
// NACHTRAG: /generate lief hier ursprünglich synchron. Das ist inzwischen auf dasselbe
// turnJobs-Muster wie in pageAgent.ts umgestellt (siehe unten) - Grund: analyze_topic +
// analyze_domain_footprint + analyze_geo_visibility (ggf. mit bis zu 3 SEQUENZIELLEN echten
// LLM-Prompt-Tests über DataForSEO) + der Claude-Tool-Loop selbst sind realistisch 20-90+
// Sekunden, mit Prompt-Test eher am oberen Ende. Ein Reverse-Proxy/Ladenbalancer, der die
// Verbindung vorher kappt (das war in genau diesem Repo schon einmal der Grund für das
// turnJobs-Muster bei pageAgent.ts, siehe Kommentar dort bei BACKGROUND_TURN_TIMEOUT_MS),
// würde sonst einen erfolgreich bezahlten/reservierten Lauf als Fehler an den User zurückgeben,
// obwohl er im Hintergrund fertig würde. Deshalb hier NICHT synchron gelassen.

import express, { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { z } from 'zod';

// Reiner Typ-Import, kein Laufzeit-Effekt: aktiviert die globale
// `Express.Request.authenticatedUserId`-Deklaration aus pageAgent.types.ts, damit
// `req.authenticatedUserId` unten typsicher ist, ohne die Augmentierung hier zu duplizieren.
import type {} from './pageAgent.types';

import rateLimit from 'express-rate-limit';

import { supabase } from '../services/supabase';
import { authenticateUser, authorizeUser } from '../middleware/auth';
import { getTeamUserIds, getBillingProfile } from '../services/access';
import { getBrowser } from '../services/browserPool';
import { buildContentStrategyExportHTML } from '../services/contentStrategyExportBuilder';

import {
  AnalyzeTopicInputSchema,
  AnalyzeDomainFootprintInputSchema,
  AnalyzeGeoVisibilityInputSchema,
  GenerateContentClusterInputSchema,
  ContentClusterResultSchema,
  type ContentClusterResult,
  toInputSchema,
  formatZodError,
} from './contentStrategyAgent.schemas';

import { buildTopicCandidates, formatTopicCandidatesForAgent, fetchDomainRankedKeywords, findExistingCoverage } from '../services/contentStrategyDataForSeo';

import { fetchGeoPortals, formatGeoPortalsForAgent, runGeoPromptTests, MAX_GEO_TEST_PROMPTS, type GeoPromptTest, type GeoTestPhase, type GeoPortalResult } from '../services/contentStrategyGeo';

// NEU (siehe Chat-Verlauf, Strategie-Tiefe v2): echter Google-AI-Overview-/Top-SERP-Check und
// Wettbewerber-Content-Struktur-Analyse, siehe Begründung/Kosten-Deckel in den jeweiligen Dateien.
import { fetchSerpAndAiOverview, formatSerpAndAiOverviewForAgent, domainInTopResults, type TopSerpResult } from '../services/contentStrategyAiOverview';
import { analyzeCompetitorContent, formatCompetitorContentForAgent, MAX_COMPETITOR_PAGES } from '../services/contentStrategyContentParsing';

import {
  getValidAccessTokenForDomain,
  fetchTopQueries,
  findNearMissOpportunities,
  fetchQueryPageMatrix,
  topCurrentStateRows,
} from '../services/googleSearchConsole';

// ==================== NEU: geo_strategy-ROBUSTHEIT ====================
// Hintergrund (siehe Chat-Verlauf, Live-Fehler "generate_content_cluster ungültig ... geo_strategy:
// Invalid input: expected object, received string", 10/10 Versuche gescheitert, Lauf komplett
// abgebrochen): Claude hat geo_strategy als STRING statt als Objekt geliefert. Der bisherige
// Retry-Text gab in diesem Fall nur die rohe, unspezifische Zod-Meldung zurück, ohne zu sagen,
// welche Struktur erwartet wird - Claude konnte den Fehler dadurch nicht gezielt beheben und hat
// denselben Fehler wiederholt, bis MAX_TOOL_CALLS erschöpft war.
//
// Bewusst KEIN Versuch, echten Fließtext automatisch in Objekt-Felder zu pressen (siehe
// Chat-Begründung) - das würde bei einem falschen Rateergebnis einen äußerlich "gültigen", aber
// inhaltlich unvollständigen bezahlten Report erzeugen, ohne dass es irgendwo auffällt. Deshalb
// zwei getrennte Bausteine:
//   (A) coerceDoubleEncodedObjectFields: NUR der sichere Fall - Claude hat ein korrektes
//       JSON-Objekt versehentlich als String verpackt (z.B. "{\"top_serp_results\": [...]}").
//       Das lässt sich verlustfrei per JSON.parse reparieren. Schlägt JSON.parse fehl (= es war
//       kein JSON, sondern echter Fließtext), bleibt der Wert unverändert und der normale
//       Zod-Fehler + Retry-Pfad greift unverändert weiter.
//   (B) buildObjectShapeHints: für den verbleibenden Fall (echter Fließtext) liest die erwartete
//       Objekt-Struktur direkt aus dem Zod-Schema aus (bleibt automatisch synchron mit
//       ContentClusterResultSchema, statt Feldnamen hart zu codieren) und gibt Claude im Retry
//       genau die erwarteten Schlüssel mit - das war dem Modell beim ersten Auftreten dieses
//       Fehlers nicht bekannt.
// (C) Zusätzliches Diagnose-Logging: loggt den ROHEN Wert eines betroffenen Feldes (nicht nur die
//     gekürzte Zod-Meldung wie bisher) - beim ersten Auftreten dieses Fehlers gab es dazu keine
//     Sichtbarkeit, wodurch unklar blieb, ob es sich um Fall (A) oder Fall (B) handelte.

function coerceDoubleEncodedObjectFields(input: any): { input: any; changedFields: string[] } {
  if (!input || typeof input !== 'object') return { input, changedFields: [] };
  // Nur echte Objekt-Pflichtfelder von ContentClusterResultSchema prüfen (siehe
  // contentStrategyAgent.schemas.ts) - bei einer künftigen Schema-Erweiterung um weitere
  // Objekt-Felder hier ergänzen.
  const OBJECT_FIELDS = ['geo_strategy', 'current_state'] as const;
  const changedFields: string[] = [];
  const result = { ...input };
  for (const field of OBJECT_FIELDS) {
    if (typeof result[field] === 'string') {
      try {
        const decoded = JSON.parse(result[field]);
        if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
          result[field] = decoded;
          changedFields.push(field);
        }
      } catch {
        // Kein valides JSON - vermutlich echter Fließtext, nicht anfassen. Der normale
        // Zod-Fehler samt Retry-Logik (inkl. buildObjectShapeHints) greift unverändert weiter.
      }
    }
  }
  return { input: result, changedFields };
}

function describeExpectedObjectShape(schema: z.ZodTypeAny, path: (string | number)[]): string | null {
  let current: z.ZodTypeAny = schema;
  for (const key of path) {
    while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap();
    }
    if (current instanceof z.ZodObject) {
      const shape = current.shape as Record<string, z.ZodTypeAny>;
      current = shape[key as string];
    } else if (current instanceof z.ZodArray) {
      current = current.element;
    } else {
      return null;
    }
    if (!current) return null;
  }
  while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
    current = current.unwrap();
  }
  if (current instanceof z.ZodObject) {
    const keys = Object.keys(current.shape);
    return `Erwartete Objekt-Struktur für dieses Feld: { ${keys.join(', ')} }`;
  }
  return null;
}

// Liest den tatsächlichen Laufzeit-Wert an einem Zod-Issue-Pfad aus dem geprüften Input aus -
// z.B. path ['geo_strategy'] -> input.geo_strategy. Robuster Fallback über reduce statt fester
// Verschachtelungstiefe, damit es auch für verschachtelte Pfade (z.B. innerhalb eines Arrays)
// funktioniert.
function getValueAtPath(input: any, path: (string | number)[]): any {
  return path.reduce((obj: any, key) => (obj == null ? obj : obj[key]), input);
}

// BUGFIX (siehe Chat-Verlauf, Lasse: Diagnose-Logging für geo_strategy-Fehler ist nach dem
// Deploy NIE aufgetreten, obwohl der exakte Fehler viermal in Folge geloggt wurde): die vorige
// Fassung prüfte issue.expected === 'object' && issue.received === 'string' - das setzt eine
// bestimmte Zod-Issue-Feldstruktur voraus (Zod v3-Namensgebung). Die Fehlermeldung in den Logs
// ("Invalid input: expected object, received string") ist das Zod-v4-Standardformat, dessen
// Issue-Objekte diese Felder unter Umständen anders benennen oder befüllen - dadurch hat die
// Bedingung nie zugeschlagen, obwohl der Fehler nachweislich auftrat (kein einziger
// severity=error-Eintrag im Log, obwohl console.warn bei einem Treffer sicher dorthin
// geschrieben hätte). Neue Fassung verlässt sich NICHT mehr auf Zod-interne Feldnamen, sondern
// ausschließlich auf zwei Dinge, die unabhängig von der Zod-Version sicher feststehen: (1) das
// Schema sagt an diesem Pfad ein Objekt voraus (describeExpectedObjectShape liefert etwas), UND
// (2) der tatsächliche Laufzeit-Wert an diesem Pfad ist ein String. Das ist version-unabhängig
// robust, weil es nur auf Schema-Struktur und dem echten Input-Wert basiert, nicht auf Zods
// interner Fehler-Metadaten-Benennung.
function findStringWhereObjectExpected(error: z.ZodError, rootSchema: z.ZodTypeAny, input: any): { path: string; shape: string }[] {
  const results: { path: string; shape: string }[] = [];
  const seenPaths = new Set<string>();
  for (const issue of error.issues) {
    if (issue.code !== 'invalid_type') continue;
    const pathKey = issue.path.join('.');
    if (seenPaths.has(pathKey)) continue; // ein Pfad kann in error.issues mehrfach auftauchen
    const shape = describeExpectedObjectShape(rootSchema, issue.path);
    if (!shape) continue; // Schema erwartet an dieser Stelle gar kein Objekt - nicht unser Fall
    const runtimeValue = getValueAtPath(input, issue.path);
    if (typeof runtimeValue === 'string') {
      seenPaths.add(pathKey);
      results.push({ path: pathKey, shape });
    }
  }
  return results;
}

function buildObjectShapeHints(violations: { path: string; shape: string }[]): string {
  if (violations.length === 0) return '';
  const hints = violations.map(
    v =>
      `Feld "${v.path}" wurde als Text-String übergeben, nicht als Objekt. ${v.shape}. ` +
      `Baue hier ein ECHTES Objekt mit genau diesen Schlüsseln, gefüllt aus dem vorherigen Tool-Ergebnis - keine zusammenfassende Textbeschreibung.`
  );
  return '\n\n' + hints.join('\n');
}

// ==================== NEU: GEDANKENSTRICH-DURCHSETZUNG (ANTI-SLOP) ====================
// Hintergrund (siehe Chat-Verlauf, Lasse: "LLM hält sich nicht an die Anti-Slop-Regel und nutzt
// sehr viele Gedankenstriche"): eine reine Prompt-Anweisung ("verwende keine Gedankenstriche")
// reicht bei diesem Muster erfahrungsgemäß NICHT aus - der Gedankenstrich ist ein derart starkes
// Trainingsdaten-Muster, dass Modelle ihn trotz expliziten Verbots regelmäßig weiter verwenden.
// Deshalb hier zusätzlich zur verschärften Prompt-Regel (siehe ANTI_SLOP_STYLE_GUIDE) eine
// PROGRAMMATISCHE Nachkontrolle, nach demselben Muster wie die geo_strategy-Validierung oben:
// nach erfolgreicher Zod-Validierung wird das komplette Ergebnis rekursiv nach "–"/"—"
// durchsucht. Bei einem Fund wird NICHT automatisch ersetzt (ein Regex-Ersatz kann grammatikalisch
// kaputte Sätze erzeugen, siehe Chat-Begründung) - stattdessen wird Claude wie bei einem
// Schema-Fehler ein weiterer Versuch mit den exakten Fundstellen abverlangt, damit die Umformulierung
// inhaltlich sauber bleibt statt mechanisch zusammengeklebt zu werden.
//
// Bewusst mit eigenem, kleinerem Budget (MAX_SLOP_FIX_ATTEMPTS) statt unbegrenzt über
// MAX_TOOL_CALLS: Gedankenstriche sind ein Stil-, kein Korrektheitsproblem - ein bezahlter,
// inhaltlich korrekter Report soll nicht an hartnäckigen Gedankenstrichen scheitern (siehe
// "fail open" unten). Zählt trotzdem zusätzlich gegen toolCallCount, weil es ein echter weiterer
// generate_content_cluster-Aufruf ist, der denselben Turn-/Kosten-Rahmen belegt.
const MAX_SLOP_FIX_ATTEMPTS = 2;
const EM_DASH_PATTERN = /[\u2013\u2014]/; // – (U+2013, Halbgeviertstrich) und — (U+2014, Geviertstrich). Normaler ASCII-Bindestrich "-" ist NICHT betroffen.

interface EmDashViolation {
  path: string;
  excerpt: string;
}

// Läuft rekursiv über das GESAMTE Ergebnis-Objekt (nicht nur bekannte Fließtext-Felder) - robuster
// als eine feste Feld-Liste, die bei einer künftigen Schema-Erweiterung sonst gepflegt werden
// müsste. Zerlegt jeden Treffer-String in Sätze, damit Claude im Retry-Hinweis den genauen Satz
// sieht statt eines ganzen Absatzes suchen zu müssen.
function findEmDashViolations(value: any, path: string[] = [], results: EmDashViolation[] = []): EmDashViolation[] {
  if (typeof value === 'string') {
    if (EM_DASH_PATTERN.test(value)) {
      const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean);
      const offendingSentences = sentences.filter(s => EM_DASH_PATTERN.test(s));
      // Fallback, falls der Satz-Split aus irgendeinem Grund nichts Passendes liefert (z.B. ein
      // einzelner Stichpunkt ohne Satzzeichen, wie in content_brief üblich) - dann den ganzen
      // String als Fundstelle nehmen, damit der Verstoß nicht stillschweigend übergangen wird.
      const excerpts = offendingSentences.length > 0 ? offendingSentences : [value];
      for (const excerpt of excerpts) {
        results.push({ path: path.join('.'), excerpt: excerpt.trim().slice(0, 300) });
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => findEmDashViolations(v, [...path, String(i)], results));
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      findEmDashViolations(value[key], [...path, key], results);
    }
  }
  return results;
}

function buildEmDashRetryText(violations: EmDashViolation[]): string {
  const shown = violations.slice(0, 10);
  const lines = shown.map(v => `- Feld "${v.path}": "${v.excerpt}"`);
  const moreNote = violations.length > shown.length ? `\n... und ${violations.length - shown.length} weitere Fundstelle(n).` : '';
  return (
    `Formatfehler (kein Schema-Fehler, dein Ergebnis wurde inhaltlich korrekt validiert): das Ergebnis enthält verbotene Gedankenstriche ("–" oder "—") an ${violations.length} Stelle(n), siehe SCHREIBSTIL-Regel im System-Prompt.\n\n` +
    `Betroffene Stellen:\n${lines.join('\n')}${moreNote}\n\n` +
    `Rufe generate_content_cluster ERNEUT auf, mit dem KOMPLETTEN, inhaltlich unveränderten Ergebnis - aber formuliere JEDEN der oben genannten Sätze so um, dass er OHNE Gedankenstrich auskommt (Punkt, Komma, Doppelpunkt, Klammern oder zwei separate Sätze verwenden, siehe Beispiele im System-Prompt). Prüfe zusätzlich alle anderen Felder auf weitere Gedankenstriche, die hier nicht einzeln aufgeführt sind, und korrigiere auch diese.`
  );
}

const router: Router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AGENT_MODEL = 'claude-sonnet-4-5-20250929';
// analyze_topic + analyze_domain_footprint + analyze_geo_visibility + generate_content_cluster
// = 4 im Normalfall, Puffer für Wiederholungen bei ungültiger generate_content_cluster-Eingabe.
// Von 8 auf 10 angehoben (siehe Chat-Verlauf, Live-Fehler "geo_strategy ... received undefined"
// bis MAX_TOOL_CALLS erschöpft) - reine zusätzliche Sicherheitsmarge, der eigentliche Fix ist
// der jetzt gezielte Korrektur-Hinweis (siehe geoVisibilityCalled in runContentStrategyLoop) und
// das jetzt optionale own_domain, nicht dieser Wert allein.
const MAX_TOOL_CALLS = 10;

// ==================== REPORT-CHAT (siehe Chat-Verlauf, Lasse: "KI-Agent, der Fragen des Users
// zu dem Report beantworten kann") ====================
// Produktentscheidung (siehe Chat-Verlauf, per AskUserQuestion bestätigt): voller Agent mit
// Live-Tool-Zugriff (kann bei Bedarf neue Analysen nachschieben, nicht nur den Report abschreiben),
// Kosten-Deckel über eine feste Nachrichten-Obergrenze PRO REPORT statt eines neuen Credit-Systems.
const MAX_CHAT_MESSAGES_PER_SESSION = 20;
// Kleiner als MAX_TOOL_CALLS: eine einzelne Chat-Antwort sollte höchstens 1-2 Tools brauchen
// (der echte Prompt-Test läuft hier nie, siehe CHAT_TOOLS/allowPromptTest unten - das war der
// mit Abstand langsamste Teil). Reine Sicherheitsmarge gegen eine ausufernde Tool-Kaskade für
// EINE Antwort, kein Normalfall.
const MAX_CHAT_TOOL_CALLS = 6;

// ==================== KONTINGENT ====================
// Spiegelt getOrResetSessionQuota/reserveSessionSlot/releaseSessionSlot/
// reserveAufbauPpuCredit/releaseAufbauPpuCredit aus pageAgent.ts, siehe
// migrations/content_strategy_quota.sql.
// GEÄNDERT (siehe Chat-Verlauf): nutzt jetzt eine EIGENE Limit-Spalte
// (plans.content_strategy_sessions_limit / _recurring, siehe
// migrations/content_strategy_plan_limit.sql), NICHT mehr gespiegelt von
// plans.page_agent_sessions_limit. Lasse wollte pro Plan einen eigenen Wert
// für Strategie-Sessions setzen können, unabhaengig vom Aufbau-Kontingent.

interface ContentStrategyQuota {
  billingUserId: string;
  limit: number;
  used: number;
  remaining: number;
  periodStart: Date;
  recurring: boolean;
}

// Spiegelt getOrResetSessionQuota aus pageAgent.ts 1:1 (gleiche Reset-Logik bei Monatswechsel),
// nur auf die content_strategy_*-Spalten aus migrations/content_strategy_quota.sql umgelegt.
// Wird sowohl von /generate (Reservierung) als auch von /quota (reine Anzeige) gebraucht -
// deshalb hier zentral und mit used/remaining/periodStart, nicht nur limit/recurring wie in der
// ursprünglichen ersten Fassung dieser Datei.
async function getOrResetContentStrategyQuota(userId: string): Promise<ContentStrategyQuota | null> {
  const { data: userData, error: userError } = await supabase.from('users').select('license_type, owner_user_id').eq('id', userId).single();
  if (userError || !userData) return null;

  let billingUserId = userId;
  let licenseType = userData.license_type as string;
  if (userData.owner_user_id) {
    billingUserId = userData.owner_user_id as string;
    const { data: ownerData } = await supabase.from('users').select('license_type').eq('id', billingUserId).single();
    if (ownerData) licenseType = ownerData.license_type as string;
  }

  const { data: planData, error: planError } = await supabase
    .from('plans')
    .select('content_strategy_sessions_limit, content_strategy_sessions_recurring')
    .ilike('license_type', licenseType)
    .limit(1)
    .maybeSingle();
  if (planError || !planData) return null;

  const limit = Number(planData.content_strategy_sessions_limit || 0);
  const recurring = planData.content_strategy_sessions_recurring !== false;

  const { data: billingUser, error: billingError } = await supabase
    .from('users')
    .select('content_strategy_sessions_used_current_period, content_strategy_sessions_period_start')
    .eq('id', billingUserId)
    .single();
  if (billingError || !billingUser) return null;

  let used = Number(billingUser.content_strategy_sessions_used_current_period || 0);
  let periodStart = billingUser.content_strategy_sessions_period_start ? new Date(billingUser.content_strategy_sessions_period_start) : new Date();

  if (recurring) {
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    if (new Date() >= periodEnd) {
      used = 0;
      periodStart = new Date();
      await supabase
        .from('users')
        .update({ content_strategy_sessions_used_current_period: 0, content_strategy_sessions_period_start: periodStart.toISOString() })
        .eq('id', billingUserId);
    }
  }

  return { billingUserId, limit, used, remaining: Math.max(limit - used, 0), periodStart, recurring };
}

interface ReservationResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

async function reserveContentStrategySlot(billingUserId: string, limit: number, recurring: boolean): Promise<ReservationResult | null> {
  const { data, error } = await supabase.rpc('increment_content_strategy_session_usage', {
    p_billing_user_id: billingUserId,
    p_limit: limit,
    p_recurring: recurring,
  });
  if (error) {
    console.error('reserveContentStrategySlot RPC error:', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { allowed: row.allowed, used: row.used, limit: row.limit_value, remaining: row.remaining };
}

async function releaseContentStrategySlot(billingUserId: string): Promise<void> {
  const { error } = await supabase.rpc('decrement_content_strategy_session_usage', { p_billing_user_id: billingUserId });
  if (error) console.error('releaseContentStrategySlot RPC error:', error);
}

async function reservePpuStrategyCredit(billingUserId: string): Promise<{ allowed: boolean; remaining: number } | null> {
  const { data, error } = await supabase.rpc('reserve_ppu_strategy_credit', { p_billing_user_id: billingUserId });
  if (error) {
    console.error('reservePpuStrategyCredit RPC error:', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row || { allowed: false, remaining: 0 };
}

async function releasePpuStrategyCredit(billingUserId: string): Promise<void> {
  const { error } = await supabase.rpc('release_ppu_strategy_credit', { p_billing_user_id: billingUserId });
  if (error) console.error('releasePpuStrategyCredit RPC error:', error);
}

async function releaseFunding(billingUserId: string, fundingSource: 'plan' | 'ppu_strategy'): Promise<void> {
  if (fundingSource === 'ppu_strategy') {
    await releasePpuStrategyCredit(billingUserId);
    return;
  }
  await releaseContentStrategySlot(billingUserId);
}

// ==================== ASYNCHRONE VERARBEITUNG (siehe Datei-Kopf) ====================
// Bewusst schlanker als turnJobs in pageAgent.ts (kein preview/lastSentPreviewVersion, kein
// activeSessionRequests-Lock - ein Content-Cluster-Lauf ist ein einzelner, nicht fortsetzbarer
// Turn, keine mehrstufige Konversation), aber gleiches Grundmuster: In-Memory-Map,
// Job-ID beim Start zurückgeben, Ergebnis per Polling abholen. Gleiche Einschränkung wie dort:
// Multi-Replica-Betrieb (mehr als 1 Railway-Instanz) sieht diese Map nicht geteilt - für v1
// wie im Rest des Repos bewusst in Kauf genommen.
interface ContentStrategyTurnJob {
  status: 'processing' | 'done' | 'error';
  createdAt: number;
  finishedAt?: number;
  startedByUserId: string; // für den Zugriffs-Check in GET /status/:turn_id
  // NEU (siehe Chat-Verlauf, Lasse: Session blieb nach einem Deployment auf status='in_progress'
  // hängen, Credit wurde nicht freigegeben - reconcileStaleContentStrategySessions greift dafür
  // erst nach STALE_SESSION_THRESHOLD_MS/35 Minuten): sessionId/billingUserId/fundingSource
  // werden hier zusätzlich gehalten, damit ein SIGTERM-Handler (siehe
  // gracefulShutdownContentStrategy weiter unten) beim Herunterfahren des Prozesses SOFORT
  // weiß, welche Sessions/Reservierungen aufzuräumen sind, statt bis zur nächsten
  // Stale-Session-Sweep zu warten.
  sessionId?: string;
  billingUserId?: string;
  fundingSource?: 'plan' | 'ppu_strategy';
  result?: { session_id: string; result: ContentClusterResult; funded_by: 'plan' | 'ppu_strategy' };
  error?: string;
}

const contentStrategyTurnJobs = new Map<string, ContentStrategyTurnJob>();
const CONTENT_STRATEGY_TURN_JOB_TTL_MS = 30 * 60 * 1000; // 30 Minuten, wie in pageAgent.ts

function createContentStrategyTurnJob(
  startedByUserId: string,
  sessionId: string,
  billingUserId: string,
  fundingSource: 'plan' | 'ppu_strategy'
): string {
  const turnId = crypto.randomUUID();
  contentStrategyTurnJobs.set(turnId, { status: 'processing', createdAt: Date.now(), startedByUserId, sessionId, billingUserId, fundingSource });
  return turnId;
}

function finishContentStrategyTurnJob(turnId: string, patch: Partial<ContentStrategyTurnJob>): void {
  const existing = contentStrategyTurnJobs.get(turnId);
  if (!existing) return; // Job wurde bereits abgeholt/aufgeräumt (Client hat GET /status nach 'done' nicht mehr aufgerufen)
  contentStrategyTurnJobs.set(turnId, { ...existing, ...patch, finishedAt: Date.now() });
}

const contentStrategyTurnJobCleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of contentStrategyTurnJobs.entries()) {
    if (now - job.createdAt > CONTENT_STRATEGY_TURN_JOB_TTL_MS) contentStrategyTurnJobs.delete(id);
  }
}, 5 * 60 * 1000);
contentStrategyTurnJobCleanup.unref?.();

// Gleiches Software-Sicherheitsnetz wie withTimeout in pageAgent.ts (dort nicht importierbar,
// weil pageAgent.ts keine eigenen Exports für Helfer hat - siehe `export =`-Hinweis - deshalb
// hier bewusst dupliziert statt künstlich geteilt).
// ANGEHOBEN von 15 auf 20 Minuten (siehe Chat-Verlauf, Lasse: "Strategie-Erstellung dauert jetzt
// über 10 Minuten") - mit dem GEO-Prompt-Test jetzt standardmäßig aktiv (statt Opt-in) kommen bis
// zu 3 SEQUENZIELLE echte LLM-Calls zu einem ohnehin schon mehrstufigen Tool-Loop dazu. 15
// Minuten war bereits knapp bemessen für den alten, selteneren Opt-in-Fall - als Standardfall
// wäre das ein reales Risiko, echte, bereits bezahlte/reservierte Läufe kurz vor dem Ziel
// abzubrechen.
//
// ERNEUT ANGEHOBEN von 20 auf 30 Minuten (siehe Chat-Verlauf, Lasse: "Timeout wird knapp, so viel
// wie da passiert") - seit der letzten Anhebung sind weitere SEQUENZIELLE, echte Calls dazugekommen,
// die alle im selben analyze_geo_visibility-Tool-Aufruf laufen: bis zu 3 zusätzliche
// content_parsing/live-Calls für die Wettbewerber-Struktur-Analyse (services/
// contentStrategyContentParsing.ts, jeweils ein voller Seiten-Fetch+Parse), plus ein größerer
// System-Prompt (Anti-Slop-Stilguide, Digital-PR-Hinweis, Convertlyze-Landingpage-Patterns) und
// ein höheres max_tokens-Limit bei generate_content_cluster (4000 → 8000) - beides verlängert
// tendenziell auch die reine Claude-Antwortzeit pro Turn. In Summe reicht das, um 20 Minuten in
// ungünstigen Fällen (mehrere langsame DataForSEO-Antworten hintereinander) tatsächlich zu
// sprengen. WICHTIG: das ist eine begründete Reaktion auf real dazugekommene Arbeit, kein reines
// "Symptom verschieben" wie bei einem unbestätigten Bug - falls trotzdem weiterhin abgebrochene
// Läufe auftauchen, bitte die Server-Logs (siehe Diagnose-Logging aus dem vorherigen Update)
// schicken, dann lässt sich sehen, WO genau die Zeit verloren geht, statt weiter an der Zahl zu
// drehen. Muss synchron mit CONFIG.pollTimeoutMs in contentStrategyAgent.app.js bleiben, und zwar
// mit etwas Puffer NACH oben (siehe dortiger Kommentar) - sonst gewinnt beim Wettlauf manchmal der
// generische Frontend-Timeout-Text statt der echten Backend-Fehlermeldung.
const BACKGROUND_TURN_TIMEOUT_MS = 1_800_000; // 30 Minuten
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} nach ${ms}ms abgebrochen (Timeout-Schutz gegen eine hängende Agent-Loop)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ==================== REPORT-CHAT: TURN-JOBS (eigene Map, gleiches Muster wie oben) ====================
// NEU (siehe Chat-Verlauf, Lasse: "KI-Agent, der Fragen des Users zu dem Report beantworten
// kann"). EIGENE Map statt contentStrategyTurnJobs wiederzuverwenden - andere Ergebnis-Form
// (reply-Text statt ContentClusterResult), und eine Chat-Antwort ist wie oben bewusst
// asynchron/Polling statt eines synchronen Requests: derselbe Reverse-Proxy/Ladenbalancer-Grund
// wie bei /generate (siehe Datei-Kopf) - auch eine Chat-Antwort kann durch Live-Tool-Aufrufe
// (analyze_topic/analyze_domain_footprint/analyze_geo_visibility) in den Bereich kommen
// (mehrere Sekunden bis über eine Minute), der dort schon für einen synchronen Request riskant
// war. CHAT_TURN_TIMEOUT_MS bewusst viel kleiner als BACKGROUND_TURN_TIMEOUT_MS - der Chat lässt
// den langsamsten Teil (echter GEO-Prompt-Test) ja komplett weg.
interface ContentStrategyChatTurnJob {
  status: 'processing' | 'done' | 'error';
  createdAt: number;
  finishedAt?: number;
  startedByUserId: string;
  result?: { reply: string; messages_used: number; messages_limit: number };
  error?: string;
}
const contentStrategyChatTurnJobs = new Map<string, ContentStrategyChatTurnJob>();

function createContentStrategyChatTurnJob(startedByUserId: string): string {
  const turnId = crypto.randomUUID();
  contentStrategyChatTurnJobs.set(turnId, { status: 'processing', createdAt: Date.now(), startedByUserId });
  return turnId;
}
function finishContentStrategyChatTurnJob(turnId: string, patch: Partial<ContentStrategyChatTurnJob>): void {
  const existing = contentStrategyChatTurnJobs.get(turnId);
  if (!existing) return; // Job wurde bereits abgeholt/aufgeräumt
  contentStrategyChatTurnJobs.set(turnId, { ...existing, ...patch, finishedAt: Date.now() });
}
const contentStrategyChatTurnJobCleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of contentStrategyChatTurnJobs.entries()) {
    if (now - job.createdAt > CONTENT_STRATEGY_TURN_JOB_TTL_MS) contentStrategyChatTurnJobs.delete(id);
  }
}, 5 * 60 * 1000);
contentStrategyChatTurnJobCleanup.unref?.();

const CHAT_TURN_TIMEOUT_MS = 90_000; // 90 Sekunden

// ==================== WIEDERHERSTELLUNG VERWAISTER SESSIONS ====================
// NEU (siehe Chat-Verlauf, Lasse: eine gestartete Session wurde durch ein Deployment
// unterbrochen, tauchte nirgends auf, Credit war trotzdem weg - siehe ausführliche Begründung in
// migrations/content_strategy_sessions_recovery.sql).
//
// Der try/catch in runContentStrategyInBackground fängt jeden JS-Fehler ab (Timeout, Zod-Fehler,
// Netzwerkfehler) und setzt dann sauber status='error' + releaseFunding(). Was er NICHT fängt:
// der Node-Prozess selbst stirbt mitten im Lauf (Deployment/Neustart/Absturz) - dann bleibt die
// Zeile für immer auf status='in_progress' stehen UND die Kontingent-/PPU-Reservierung bleibt für
// immer reserviert, weil releaseFunding() nie aufgerufen wird. Diese Funktion räumt genau das auf:
// jede in_progress-Zeile, die älter ist als die maximal mögliche echte Laufzeit
// (BACKGROUND_TURN_TIMEOUT_MS), KANN unmöglich noch legitim laufen - ein lebender Prozess hätte
// sie über withTimeout spätestens dort auf 'error' gesetzt. STALE_THRESHOLD_MS liegt bewusst
// spürbar über BACKGROUND_TURN_TIMEOUT_MS (5 Minuten Puffer), um keine Zeile zu erwischen, die der
// aktuelle Prozess gerade noch selbst abschließt.
//
// MEHRERE INSTANZEN (Multi-Replica): anders als die in-memory contentStrategyTurnJobs-Map (siehe
// Kommentar dort, "bewusst in Kauf genommen") ist diese Wiederherstellung DB-basiert und damit
// instanzübergreifend sicher - jede Instanz kann jede verwaiste Zeile finden, unabhängig davon,
// welche Instanz sie ursprünglich angelegt hat. Um zu verhindern, dass zwei Instanzen dieselbe
// Zeile gleichzeitig aufräumen und die Reservierung DOPPELT freigeben, wird der Übergang als
// bedingtes UPDATE (status='in_progress' als WHERE-Bedingung, nicht nur als Filter beim SELECT)
// ausgeführt - nur die Instanz, deren UPDATE tatsächlich eine Zeile trifft, ruft anschließend
// releaseFunding() auf. Die jeweils andere(n) Instanz(en) laufen bei genau dieser Zeile leer.
const STALE_SESSION_THRESHOLD_MS = BACKGROUND_TURN_TIMEOUT_MS + 5 * 60 * 1000; // 35 Minuten (skaliert automatisch mit BACKGROUND_TURN_TIMEOUT_MS)

async function reconcileStaleContentStrategySessions(): Promise<void> {
  try {
    const cutoffIso = new Date(Date.now() - STALE_SESSION_THRESHOLD_MS).toISOString();
    const { data: staleRows, error } = await supabase
      .from('content_strategy_sessions')
      .select('id, billing_user_id, funding_source, created_at')
      .eq('status', 'in_progress')
      .lt('created_at', cutoffIso);

    if (error) {
      console.error('reconcileStaleContentStrategySessions: Suche fehlgeschlagen:', error.message);
      return;
    }
    if (!staleRows || staleRows.length === 0) return;

    for (const row of staleRows) {
      // Bedingtes UPDATE (siehe Kommentar oben) - .select().single() liefert nur dann eine Zeile
      // zurück, wenn DIESER Aufruf den Übergang tatsächlich vorgenommen hat.
      const { data: claimed, error: claimError } = await supabase
        .from('content_strategy_sessions')
        .update({
          status: 'error',
          error_message: 'Automatisch als fehlgeschlagen erkannt (Server-Neustart oder Absturz während der Verarbeitung, kein regulärer Abschluss).',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('status', 'in_progress')
        .select()
        .single();

      if (claimError || !claimed) continue; // andere Instanz war schneller, oder Zeile wurde inzwischen regulär fertig

      if (row.billing_user_id && row.funding_source) {
        await releaseFunding(row.billing_user_id, row.funding_source as 'plan' | 'ppu_strategy');
        console.warn(`reconcileStaleContentStrategySessions: Session ${row.id} als verwaist erkannt, Reservierung (${row.funding_source}) freigegeben.`);
      } else {
        // Zeile stammt aus dem kurzen Zeitfenster zwischen dem status-Update (letzte Runde) und
        // diesem billing_user_id/funding_source-Update (diese Runde), oder aus einer noch
        // älteren Version ohne status-Spalte überhaupt - kann nicht automatisch zugeordnet
        // werden. Bewusst NICHT stillschweigend übergangen: taucht als "Fehler" im Dashboard auf
        // (siehe status-Update oben), aber die Kontingent-/PPU-Reservierung bleibt in diesem
        // Sonderfall bestehen und muss manuell in Supabase korrigiert werden.
        console.warn(`reconcileStaleContentStrategySessions: Session ${row.id} als verwaist erkannt, aber OHNE billing_user_id/funding_source - Reservierung konnte NICHT automatisch freigegeben werden, bitte manuell prüfen.`);
      }
    }
  } catch (err) {
    console.error('reconcileStaleContentStrategySessions: unerwarteter Fehler:', (err as Error).message);
  }
}

// Einmal beim Prozess-Start (genau der Moment, in dem ein Deployment die vorige Instanz ersetzt -
// also genau dann, wenn typischerweise verwaiste Zeilen von der VORHERIGEN Instanz liegen
// geblieben sind) UND danach periodisch als Sicherheitsnetz (z.B. bei einem Absturz ohne
// Neustart-Deployment). Kein sofortiger Aufruf beim Modul-Laden, sondern mit kurzer Verzögerung -
// vermeidet, dass diese Abfrage den Server-Start selbst verlangsamt/blockiert.
setTimeout(() => { reconcileStaleContentStrategySessions(); }, 10_000).unref?.();
const staleSessionSweepInterval = setInterval(() => { reconcileStaleContentStrategySessions(); }, 15 * 60 * 1000);
staleSessionSweepInterval.unref?.();

// ==================== NEU: PROAKTIVES AUFRÄUMEN BEIM SHUTDOWN (SIGTERM) ====================
// Hintergrund (siehe Chat-Verlauf, Lasse: Session blieb nach einem Deployment mitten im Lauf auf
// status='in_progress' hängen, Credit wurde nicht freigegeben): reconcileStaleContentStrategySessions
// oben ist als Sicherheitsnetz gut, greift aber laut STALE_SESSION_THRESHOLD_MS erst nach 35
// Minuten - für den HÄUFIGSTEN Fall (ein normales Deployment, kein Absturz) ist das unnötig lang.
// Bei einem regulären Deployment schickt die Plattform (Railway) VOR dem harten Beenden des
// Prozesses ein SIGTERM mit einer kurzen Karenzzeit - genug Zeit für ein paar schnelle
// Supabase-Aufrufe, um die eigenen, gerade laufenden Sessions SOFORT sauber abzuschließen, statt
// sie der 35-Minuten-Sweep der NÄCHSTEN Instanz zu überlassen.
//
// WICHTIG, EHRLICHER HINWEIS: das ist eine Verbesserung, kein Ersatz für
// reconcileStaleContentStrategySessions - die bleibt als Sicherheitsnetz für Fälle, in denen gar
// kein SIGTERM ankommt (harter Absturz, OOM-Kill, Netzwerk-Partition). Falls server.js an anderer
// Stelle bereits einen eigenen SIGTERM-Handler registriert (z.B. für HTTP-Server-Shutdown/DB-
// Verbindungen schließen), unbedingt prüfen, dass diese Aufräum-Routine VOR einem möglichen
// Schließen der Supabase-Verbindung läuft, sonst schlagen die Updates hier fehl.
async function gracefulShutdownContentStrategy(signal: string): Promise<void> {
  const stillProcessing = Array.from(contentStrategyTurnJobs.entries()).filter(
    ([, job]) => job.status === 'processing' && job.sessionId && job.billingUserId && job.fundingSource
  );
  if (stillProcessing.length === 0) {
    console.log(`content-strategy: ${signal} empfangen, keine laufenden Content-Strategie-Sessions zum sofortigen Aufräumen.`);
    return;
  }
  console.warn(`content-strategy: ${signal} empfangen, räume ${stillProcessing.length} noch laufende Session(s) proaktiv auf, statt auf die 35-Minuten-Stale-Sweep zu warten.`);
  await Promise.all(
    stillProcessing.map(async ([turnId, job]) => {
      try {
        await releaseFunding(job.billingUserId as string, job.fundingSource as 'plan' | 'ppu_strategy');
        // Bedingtes UPDATE (status='in_progress' als WHERE-Bedingung, nicht nur Filter) -
        // gleiches Prinzip wie in reconcileStaleContentStrategySessions: falls der Lauf in der
        // Millisekunde zwischen Signal-Empfang und diesem Update doch noch regulär fertig wurde,
        // überschreiben wir dessen Erfolg nicht.
        await supabase
          .from('content_strategy_sessions')
          .update({
            status: 'error',
            error_message: 'Automatisch als fehlgeschlagen erkannt (Server wurde während der Verarbeitung heruntergefahren, z.B. durch ein Deployment).',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.sessionId as string)
          .eq('status', 'in_progress');
        console.warn(`content-strategy: Session ${job.sessionId} beim Shutdown aufgeräumt, Reservierung (${job.fundingSource}) freigegeben.`);
      } catch (err) {
        // Best effort: schlägt das Aufräumen hier fehl (z.B. weil die Supabase-Verbindung schon
        // dabei ist zu schließen), bleibt die Session als Fallback für
        // reconcileStaleContentStrategySessions (35 Minuten später) erhalten - kein Datenverlust,
        // nur ein längeres Warten.
        console.error(`content-strategy: Aufräumen von Session ${job.sessionId} beim Shutdown fehlgeschlagen (Sicherheitsnetz reconcileStaleContentStrategySessions greift später):`, (err as Error).message);
      }
    })
  );
}

let contentStrategyShuttingDown = false;
async function handleContentStrategyShutdownSignal(signal: string): Promise<void> {
  if (contentStrategyShuttingDown) return; // z.B. SIGTERM gefolgt von SIGINT - nur einmal aufräumen
  contentStrategyShuttingDown = true;
  await gracefulShutdownContentStrategy(signal);
}
// Bewusst OHNE process.exit() hier - falls server.js bereits eigene SIGTERM/SIGINT-Handler
// registriert (z.B. für den HTTP-Server oder andere Aufräumarbeiten), soll dieser Handler sich
// NICHT den Prozess-Exit selbst anmaßen und dadurch mit der bestehenden Shutdown-Logik
// kollidieren - er hängt sich nur zusätzlich an dieselben Signale und beendet seine eigene
// Aufräumarbeit asynchron im Hintergrund.
process.on('SIGTERM', () => { handleContentStrategyShutdownSignal('SIGTERM'); });
process.on('SIGINT', () => { handleContentStrategyShutdownSignal('SIGINT'); });

// ==================== TOOLS ====================

const CONTENT_STRATEGY_TOOLS: Anthropic.Tool[] = [
  {
    name: 'analyze_topic',
    description: `Liefert Suchvolumen, verwandte Keywords, "People Also Ask"-Fragen und Suchintent für ein Thema - die Rohdaten für den Cluster.
Rufe dieses Tool IMMER zuerst auf, mit dem Ziel-Thema aus der Anfrage.`,
    input_schema: toInputSchema(AnalyzeTopicInputSchema) as Anthropic.Tool.InputSchema,
  },
  {
    name: 'analyze_domain_footprint',
    description: `Prüft, für welche der von dir identifizierten Themen-Kandidaten die eigene Domain schon Sichtbarkeit hat (Google Search Console, falls verbunden - sonst DataForSEO-Fallback, etwas ungenauer und ein paar Tage im Rückstand). Liefert ZUSÄTZLICH einen Ist-Zustand-Überblick (welche Seiten aktuell für welche Queries mit welcher Position/CTR/Impressionen ranken, bei GSC-Verbindung echte Zahlen, sonst eine klar als Schätzung gekennzeichnete Position ohne echte CTR-Daten) - das ist die Grundlage für current_state im Endergebnis.
Rufe dieses Tool NACH analyze_topic auf und übergib die Kandidaten-Begriffe, die du als Cluster-relevant einstufst (6-10 Stück, nicht alle).
Ein Treffer bedeutet: diese Seite/Query existiert schon - im Cluster-Ergebnis als role "existing" markieren, NICHT als neue Seite vorschlagen.`,
    input_schema: toInputSchema(AnalyzeDomainFootprintInputSchema) as Anthropic.Tool.InputSchema,
  },
  {
    name: 'analyze_geo_visibility',
    description: `Liefert die komplette GEO-Analyse in einem Aufruf: (1) welche Domains/Portale für das Kern-Thema bereits in LLM-Antworten zitiert werden (DataForSEO llm_mentions), (2) die echten organischen Top-SEO-Ergebnisse bei Google für das Kern-Thema, (3) ob/wie Google für das Kern-Thema ein AI Overview zeigt und WELCHE Quellen es MIT LINK zitiert (kein AI Overview oder eines ohne zitierte Quellen = starkes Commodity-Signal), (4) eine Struktur-Analyse der Top-${MAX_COMPETITOR_PAGES}-Wettbewerber-Seiten (Wortzahl, Tabellen, Listen, FAQ-Muster - was sie konkret enthalten, nicht nur dass sie ranken), und (5) optional einen echten Prompt-Test gegen ein Modell (nur wenn run_prompt_test=true, hart auf ${MAX_GEO_TEST_PROMPTS} Prompts gedeckelt wegen variabler, nicht vorab kalkulierbarer Kosten).
Rufe dieses Tool NACH analyze_topic auf. Setze run_prompt_test grundsätzlich auf true (das ist inzwischen der Normalfall, siehe System-Prompt-Hinweis in der aktuellen User-Nachricht) - ob der Test tatsächlich ausgeführt wird, entscheidet ohnehin ausschließlich der Server (siehe allowPromptTest), niemals dieser Tool-Aufruf selbst.
Nutze ALLE fünf Datenpunkte für geo_strategy im Endergebnis, insbesondere für eine konkrete citation_strategy_note (welche Struktur/welches Format hat hier Zitier-Chancen) statt nur top_portals aufzulisten.`,
    input_schema: toInputSchema(AnalyzeGeoVisibilityInputSchema) as Anthropic.Tool.InputSchema,
  },
  {
    name: 'generate_content_cluster',
    description: `Liefert das fertige Ergebnis als durchgehenden Bericht: Ausgangslage, Executive Summary, EINE Conversion-Seite + mehrere unterstützende Seiten mit Seitentyp, Rolle (coverage/citation/existing), Messy-Middle-Phase (exploration/evaluation/decision), Content-Brief, Commodity-Einschätzung, interner Verlinkung, Ist-Zustand und GEO-Strategie.
NUR aufrufen, nachdem analyze_topic, analyze_domain_footprint (falls eine Domain bekannt ist) UND analyze_geo_visibility gelaufen sind. ausgangslage und executive_summary werden ZULETZT geschrieben, nachdem alle anderen Felder feststehen - sie sind eine Zusammenfassung der übrigen Felder, keine unabhängige Einschätzung. Jede supporting_page braucht: eine Begründung (reasoning) UND einen content_brief (2-6 konkrete Stichpunkte, was auf der Seite stehen muss) UND eine commodity_risk-Einschätzung (true, wenn das Thema laut AI-Overview-/Trainingsdaten-Signalen ohne Quellen-Klick voll beantwortbar wirkt) UND eine messy_middle_phase-Einschätzung (siehe eigener Abschnitt unten - der Cluster MUSS mindestens eine "exploration"- und eine "evaluation"-Seite enthalten, sonst schlägt die Validierung fehl) - alles gestützt auf die tatsächlichen Tool-Ergebnisse, keine generischen Vorschläge ohne Datenbezug. current_state.source muss ehrlich "google_search_console", "dataforseo_estimate" oder "none" sein, je nachdem was analyze_domain_footprint tatsächlich geliefert hat. geo_strategy.citation_strategy_note muss sich konkret auf ai_overview/top_serp_results/competitor_content_notes beziehen. Mindestens ein internal_links-Eintrag pro supporting_page zur conversion_page (from_index -1 oder to_index -1 für die conversion_page).`,
    input_schema: toInputSchema(GenerateContentClusterInputSchema) as Anthropic.Tool.InputSchema,
    // Cache-Breakpoint (siehe Chat-Herleitung zu den Lauf-Kosten): dieses Tool-Array ist über
    // alle Turns EINES Laufs identisch, wird aber bisher bei jedem der bis zu 4 API-Calls neu
    // als voller Preis mitgeschickt. cache_control auf dem LETZTEN Tool markiert "alles bis
    // hierhin cachen" - ab dem zweiten Call kostet dieser Block nur noch cache_read ($0,30/Mio.
    // Tokens) statt vollem input-Preis ($3,00/Mio.). Wirkt nur, wenn der gecachte Block die
    // Mindestgröße für Sonnet (1024 Tokens) erreicht - falls nicht, hat das Feld einfach keinen
    // Effekt, es entstehen KEINE Zusatzkosten dadurch.
    cache_control: { type: 'ephemeral' },
  },
];

// CHAT_TOOLS: dieselben drei Analyse-Tools wie beim Report-Lauf, OHNE generate_content_cluster -
// der Chat antwortet in normaler Sprache statt eines starren Ausgabe-Schemas (siehe
// runContentStrategyChatLoop), braucht dieses Tool also nicht. Eigener cache_control-Breakpoint
// auf dem jetzt letzten Tool (analyze_geo_visibility) - der Breakpoint auf
// CONTENT_STRATEGY_TOOLS sitzt auf generate_content_cluster, das hier fehlt, sonst würde für den
// Chat gar nicht gecacht.
const CHAT_TOOLS: Anthropic.Tool[] = CONTENT_STRATEGY_TOOLS.filter(t => t.name !== 'generate_content_cluster').map((t, i, arr) =>
  i === arr.length - 1 ? { ...t, cache_control: { type: 'ephemeral' as const } } : t
);

// ==================== TOOL-IMPLEMENTIERUNGEN ====================

async function toolAnalyzeTopic(input: z.infer<typeof AnalyzeTopicInputSchema>): Promise<string> {
  const candidates = await buildTopicCandidates(input.keyword, input.country || 'de');
  return formatTopicCandidatesForAgent(input.keyword, candidates);
}

async function toolAnalyzeDomainFootprint(input: z.infer<typeof AnalyzeDomainFootprintInputSchema>, billingUserId: string): Promise<string> {
  // GSC bevorzugt, wenn verbunden - echte Impressionsdaten statt modelliertem Index, siehe
  // Chat-Herleitung. Scheitert die GSC-Abfrage (z.B. Verbindung widerrufen), fällt der Code
  // auf den DataForSEO-Fallback zurück statt hart zu scheitern.
  const gscConnection = await getValidAccessTokenForDomain(billingUserId, input.domain).catch(() => null);
  if (gscConnection) {
    try {
      const queries = await fetchTopQueries(gscConnection.siteUrl, gscConnection.accessToken);
      const nearMisses = findNearMissOpportunities(queries);

      const lines = input.candidate_topics.map(topic => {
        const firstWord = topic.toLowerCase().split(' ')[0];
        const hit = queries.find(q => q.impressions > 0 && q.query.toLowerCase().includes(firstWord));
        return hit
          ? `- "${topic}": bereits Impressionen (${hit.impressions}, Ø Position ${hit.position.toFixed(1)}) - vorhandene Abdeckung`
          : `- "${topic}": keine Impressionen in Search Console gefunden - echte Lücke`;
      });

      const nearMissBlock =
        nearMisses.length > 0
          ? `\n\nZUSÄTZLICH (nicht in deinen Kandidaten, aber starkes Search-Console-Signal): ${nearMisses
              .slice(0, 5)
              .map(n => `"${n.query}" (${n.impressions} Impressionen, Ø Position ${n.position.toFixed(1)})`)
              .join(', ')} - Google zieht die Domain hier schon in Betracht, es fehlt aber eine gut rankende Seite. Erwäge, daraus eine eigene supporting_page zu machen.`
          : '';

      // NEU (siehe Chat-Verlauf, "Ist-Zustand"): zusätzlich zur reinen Kandidaten-Abdeckung oben
      // ein echter Seite+Query-Überblick mit Position/CTR - Grundlage für current_state im
      // Endergebnis. Eigener try/catch, weil diese Zusatz-Abfrage (dimensions ['page','query'])
      // NICHT dieselbe ist wie fetchTopQueries oben und unabhängig scheitern kann, ohne die
      // bereits erfolgreiche Kandidaten-Abdeckung oben zu verlieren.
      let currentStateBlock = '';
      try {
        const pageQueryMatrix = await fetchQueryPageMatrix(gscConnection.siteUrl, gscConnection.accessToken);
        const topRows = topCurrentStateRows(pageQueryMatrix);
        if (topRows.length > 0) {
          const rowLines = topRows.map(
            r =>
              `- ${r.page} | Query: "${r.query}" | Ø Position ${r.position.toFixed(1)} | CTR ${(r.ctr * 100).toFixed(1)}% | ${r.impressions} Impressionen | ${r.clicks} Klicks`
          );
          currentStateBlock = `\n\nIST-ZUSTAND (echte Search-Console-Daten, letzte 90 Tage, Top ${topRows.length} nach Impressionen - für current_state im Endergebnis, source="google_search_console"):\n${rowLines.join('\n')}`;
        } else {
          currentStateBlock = '\n\nIST-ZUSTAND: Search Console verbunden, aber keine Impressionen in den letzten 90 Tagen gefunden (current_state.source="google_search_console", rows=[]).';
        }
      } catch (err) {
        console.warn('fetchQueryPageMatrix fehlgeschlagen (nicht kritisch):', (err as Error).message);
        currentStateBlock = '\n\nIST-ZUSTAND: konnte nicht geladen werden (current_state.source="none", rows=[]).';
      }

      return `Domain-Abdeckung für "${input.domain}" (Quelle: Google Search Console, echte Such-Daten der letzten 90 Tage):\n${lines.join('\n')}${nearMissBlock}${currentStateBlock}`;
    } catch (err) {
      console.warn('GSC-Abfrage fehlgeschlagen, Fallback auf DataForSEO:', (err as Error).message);
    }
  }

  const rankedPages = await fetchDomainRankedKeywords(input.domain, input.country || 'de');
  if (rankedPages.length === 0) {
    return `Keine Domain-Daten für "${input.domain}" verfügbar (weder Search Console verbunden noch DataForSEO-Treffer). Behandle alle Kandidaten als potenzielle Lücken, kennzeichne das aber als unbelegte Annahme. IST-ZUSTAND: current_state.source="none", rows=[].`;
  }
  const lines = input.candidate_topics.map(topic => {
    const coverage = findExistingCoverage(topic, rankedPages);
    return coverage
      ? `- "${topic}": bereits abgedeckt durch ${coverage.url} (Position ${coverage.position})`
      : `- "${topic}": keine bestehende Seite gefunden - Lücke`;
  });
  // Ist-Zustand-Fallback ohne GSC: nur geschätzte Position aus dem Index, KEINE echten
  // CTR-/Klick-/Impressionsdaten - deshalb ctr/impressions/clicks im Endergebnis explizit null,
  // nicht geraten (siehe CurrentStateRowSchema-Kommentar in contentStrategyAgent.schemas.ts).
  const estimateRows = rankedPages
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, 15)
    .map(p => `- ${p.url} | Keyword: "${p.keyword}" | geschätzte Position ${p.position} | CTR/Impressionen/Klicks: nicht verfügbar (keine Search-Console-Verbindung)`);
  const estimateBlock = estimateRows.length > 0
    ? `\n\nIST-ZUSTAND (Schätzung, current_state.source="dataforseo_estimate", ctr/impressions/clicks je Zeile = null):\n${estimateRows.join('\n')}`
    : '\n\nIST-ZUSTAND: keine Daten (current_state.source="none", rows=[]).';
  return `Domain-Abdeckung für "${input.domain}" (Quelle: DataForSEO Labs, Index-basiert, kein Live-Crawl, keine Search-Console-Verbindung vorhanden):\n${lines.join('\n')}${estimateBlock}`;
}

// allowPromptTest kommt NICHT vom Modell, sondern vom Request-Body von POST /generate (siehe
// runContentStrategyLoop-Aufruf unten) und wird hier hart durchgesetzt. Grund: input.run_prompt_test
// wird vom Agenten selbst gesetzt (das Zod-Schema erlaubt es ihm, unabhängig vom System-Prompt-
// Hinweis) - ohne diese harte serverseitige Sperre könnte der Agent einen echten,
// kostenpflichtigen LLM-Prompt-Test auslösen, den der Server gar nicht erlaubt hat.
// Bei DataForSEOs llm_responses-Endpunkt sind das echte, variable Kosten, kein fixer
// DataForSEO-Preis - das darf nicht allein von der Modell-Entscheidung abhängen.
//
// NEU (siehe Chat-Verlauf, Lasse: Checkbox im Formular entfernt, GEO-Prompt-Test läuft jetzt
// standardmäßig für jeden Lauf mit - Kosten sind laut Lasses eigener Beobachtung vernachlässigbar,
// 17 Cent DataForSEO-Gesamtkosten für 3 Läufe an einem Tag): isGeoPromptTestGloballyEnabled()
// ist ein rein operativer Not-Aus, kein Kosten-Schutz mehr (der ist mit der Checkbox-Entfernung
// hinfällig) - für den Fall, dass sich z.B. DataForSEOs llm_responses-Endpunkt als unzuverlässig
// erweist oder unerwartet teuer wird, kann der Test ohne Code-Deploy per ENV-Variable
// abgeschaltet werden. Bewusst LIVE pro Request geprüft (nicht einmalig beim Modul-Start
// gecacht), damit eine geänderte Railway-ENV-Variable ohne Neustart wirkt.
function isGeoPromptTestGloballyEnabled(): boolean {
  return process.env.CONTENT_STRATEGY_GEO_PROMPT_TEST_ENABLED !== 'false';
}
// Feste Formulierung pro Messy-Middle-Phase statt vom Modell frei erfundener Prompts (siehe
// Begründung in services/contentStrategyGeo.ts bei runGeoPromptTests) - garantiert, dass bei
// aktivem Prompt-Test IMMER alle drei Phasen mindestens einmal getestet werden, unabhängig
// davon, wie das Modell das Thema sonst einordnet.
const GEO_TEST_PROMPT_TEMPLATES: { phase: GeoTestPhase; build: (keyword: string) => string }[] = [
  { phase: 'exploration', build: keyword => `Was ist ${keyword} und wofür wird es gebraucht?` },
  { phase: 'evaluation', build: keyword => `${keyword} im Vergleich, worauf sollte ich achten?` },
  { phase: 'decision', build: keyword => `Was ist der beste Anbieter für ${keyword}?` },
];

// rawPromptTestCollector (letzter Parameter): sammelt die ECHTEN, unveränderten
// Prompt-Test-Ergebnisse serverseitig ein (siehe Chat-Verlauf, Lasse: "getestete Prompts
// zumindest für mich in Supabase ablegen, damit ich sie prüfen kann") - unabhängig davon, ob/wie
// akkurat Claude dieselben Daten später in generate_content_cluster zurückschreibt. Wird von
// runContentStrategyLoop durchgereicht und nach Lauf-Ende in
// content_strategy_geo_prompt_tests gespeichert UND zum Überschreiben von
// result.geo_strategy.prompt_tests verwendet (siehe runContentStrategyInBackground) - die
// Modell-Version dieses Felds ist dadurch nur noch eine Zwischenstufe, nie die letzte Quelle.
// NEU (siehe Chat-Verlauf, Lasse: "Digital-PR-Tipp - Top-10-SERP-Domains als Linkbuilding-Ziele").
// Bewusst als reine Text-Ergänzung ohne neues Schema-Feld (siehe Rückfrage-Antwort) - keine
// zusätzlichen Kosten, top_results liegt aus fetchSerpAndAiOverview() ohnehin schon vor. Zeigt
// Domains, die für das Kern-Thema organisch gut ranken, aber laut den llm_mentions-Daten NOCH
// NICHT in LLM-Antworten zitiert werden - das ist die eigentlich interessante Schnittmenge für
// Digital PR (schon Autorität aufgebaut, aber noch keine KI-Präsenz), keine reine Kopie der
// Top-10-Liste. Domains, die schon zitiert werden, tauchen bewusst NICHT hier auf - für die
// braucht es keinen PR-Tipp mehr, siehe formatGeoPortalsForAgent.
function formatDigitalPrCandidates(keyword: string, portals: GeoPortalResult[], topResults: TopSerpResult[], ownDomain: string | undefined): string | null {
  if (topResults.length === 0) return null;
  const normalize = (d: string) => d.replace(/^www\./, '').toLowerCase();
  const citedDomains = new Set(portals.map(p => normalize(p.domain)));
  const cleanOwnDomain = ownDomain ? normalize(ownDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')) : null;
  const candidates = topResults
    .filter(r => {
      const d = normalize(r.domain);
      return d && d !== cleanOwnDomain && !citedDomains.has(d);
    })
    .slice(0, 5); // gedeckelt, gleicher Grund wie überall in dieser Datei: Token-Budget der Tool-Result-Texte
  if (candidates.length === 0) return null;
  const lines = candidates.map(r => `- ${r.domain} (Position ${r.position}) – "${r.title}"`);
  return (
    `Digital-PR-Kandidaten für "${keyword}" (ranken organisch gut, wurden aber laut den LLM-Zitations-Daten oben NOCH NICHT in LLM-Antworten zitiert):\n${lines.join('\n')}\n\n` +
    `Das ist eine etablierte Digital-PR-Taktik (Gastbeitrag/Erwähnung/Backlink auf einer bereits gut rankenden Seite kann mittelfristig auch zu einer KI-Zitierung führen), KEIN gemessener Zitier-Erfolg - im citation_strategy_note entsprechend als Hinweis/Möglichkeit formulieren, nicht als Zusage. Schlage nur Domains vor, die nach Titel erkennbar Medien/Fachportale/Verzeichnisse sind - keine direkten Wettbewerber (bieten dasselbe Produkt/dieselbe Dienstleistung an) und keine Plattformen, die grundsätzlich keine Gastbeiträge/Backlinks vergeben (z.B. Wikipedia, YouTube, Reddit, große Marktplätze). Wirkt keine der obigen Domains dafür geeignet, lass diesen Punkt in citation_strategy_note einfach weg.`
  );
}

async function toolAnalyzeGeoVisibility(
  input: z.infer<typeof AnalyzeGeoVisibilityInputSchema>,
  allowPromptTest: boolean,
  rawPromptTestCollector: GeoPromptTest[]
): Promise<string> {
  // NEU (siehe Chat-Verlauf, Live-Timeout-Fehler ohne erkennbare Ursache): dieser Tool-Aufruf
  // war schon vor diesem Update als "langsamster Teil" bekannt (bis zu 3 sequenzielle echte
  // LLM-Prompt-Tests) - seit dem Portale-Fix (platform 'google' statt 'chat_gpt') liefert
  // fetchGeoPortals jetzt außerdem tatsächlich echte, größere Daten statt sofort leer
  // zurückzukommen. Beides zusammen macht diese Funktion zum naheliegendsten Kandidaten für eine
  // insgesamt zu lange Laufzeit - Logging hier, um das beim nächsten Timeout zu bestätigen statt
  // zu vermuten.
  const geoStartedAt = Date.now();
  const { portals, ownDomainCited } = await fetchGeoPortals(input.keyword, input.own_domain, 'de');
  let text = formatGeoPortalsForAgent(input.keyword, portals, ownDomainCited);
  console.log(`content-strategy: fetchGeoPortals abgeschlossen nach ${Date.now() - geoStartedAt}ms (${portals.length} Portale)`);

  // NEU (siehe Chat-Verlauf, Strategie-Tiefe v2): echter AI-Overview-/Top-SERP-Check, EIN Call
  // für das Kern-Thema (Kosten-Deckel, siehe services/contentStrategyAiOverview.ts). Läuft immer
  // mit, nicht nur bei run_prompt_test - anders als der Prompt-Test hat dieser Call einen
  // fixen, sehr niedrigen Preis (~0,0012 $), keine Notwendigkeit für ein separates Opt-in.
  try {
    const serpAndAio = await fetchSerpAndAiOverview(input.keyword, 'de');
    text += '\n\n' + formatSerpAndAiOverviewForAgent(input.keyword, serpAndAio, input.own_domain);

    const digitalPrText = formatDigitalPrCandidates(input.keyword, portals, serpAndAio.top_results, input.own_domain);
    if (digitalPrText) text += '\n\n' + digitalPrText;

    // Wettbewerber-Content-Struktur: die Top-organischen URLs (ohne die eigene Domain, falls
    // sie schon rankt - die braucht keine Struktur-Analyse ihrer selbst) an analyzeCompetitorContent
    // übergeben, hart gedeckelt auf MAX_COMPETITOR_PAGES (siehe dortige Kosten-Begründung).
    const ownHit = domainInTopResults(serpAndAio.top_results, input.own_domain);
    const competitorUrls = serpAndAio.top_results
      .filter(r => !ownHit || r.url !== ownHit.url)
      .slice(0, MAX_COMPETITOR_PAGES)
      .map(r => r.url);
    if (competitorUrls.length > 0) {
      const signals = await analyzeCompetitorContent(competitorUrls);
      text += '\n\n' + formatCompetitorContentForAgent(signals);
    }
  } catch (err) {
    console.warn('AI-Overview-/Wettbewerber-Content-Analyse fehlgeschlagen (nicht kritisch):', (err as Error).message);
    text += '\n\nAI-Overview-/Top-SERP-/Wettbewerber-Content-Analyse konnte nicht geladen werden.';
  }

  if (input.run_prompt_test && !allowPromptTest) {
    text += '\n\n(Prompt-Test vom Agenten angefragt, aber vom User im Formular nicht aktiviert - übersprungen.)';
  }

  if (input.run_prompt_test && allowPromptTest) {
    // Einfache, realistische Nutzer-Formulierungen statt SEO-Keywords - je eine pro
    // Messy-Middle-Phase (siehe GEO_TEST_PROMPT_TEMPLATES), damit "für jede Phase mindestens ein
    // Prompt" nicht vom Zufall abhängt. .slice bleibt als Sicherheitsnetz, siehe Kommentar dort.
    const prompts = GEO_TEST_PROMPT_TEMPLATES.map(t => ({ prompt: t.build(input.keyword), phase: t.phase })).slice(0, MAX_GEO_TEST_PROMPTS);

    const promptTestStartedAt = Date.now();
    const results = await runGeoPromptTests(prompts, input.own_domain);
    console.log(`content-strategy: runGeoPromptTests abgeschlossen nach ${Date.now() - promptTestStartedAt}ms (${results.length}/${prompts.length} erfolgreich)`);
    rawPromptTestCollector.push(...results);
    if (results.length > 0) {
      const lines = results.map(
        r =>
          `- [${r.messy_middle_phase}] "${r.prompt}" (${r.llm_type}): eigene Domain zitiert: ${r.own_domain_cited ? 'ja' : 'nein'} | zitierte Domains: ${
            r.cited_domains.join(', ') || 'keine'
          } | wirkt aus Trainingsdaten beantwortbar: ${r.answerable_from_training_data ? 'ja' : 'nein'}`
      );
      text += `\n\nPrompt-Test (${results.length} Prompts, je einer pro Messy-Middle-Phase):\n${lines.join('\n')}`;
    } else {
      text += '\n\nPrompt-Test angefordert, aber fehlgeschlagen oder kein Modell verfügbar.';
    }
  }

  console.log(`content-strategy: toolAnalyzeGeoVisibility komplett abgeschlossen nach ${Date.now() - geoStartedAt}ms`);
  return text;
}

// ==================== SYSTEM-PROMPT ====================

// NEU (siehe Chat-Verlauf, Lasse: "Prompt-Regeln ergänzen, damit sich das nach uns anhört, nicht
// nach AI Slop") - eine EINZIGE geteilte Konstante statt Duplikat in buildSystemPrompt UND
// buildChatSystemPrompt (gleiche Begründung wie bei duration_seconds vorhin: zwei Kopien
// derselben Vorgabe laufen bei einer künftigen Änderung sonst auseinander). Gilt für JEDES
// Fließtext-Feld, das Claude selbst formuliert - ausgangslage, executive_summary, reasoning,
// citation_strategy_note, roadmap.begruendung, Chat-Antworten. Betrifft NICHT die reinen
// Tool-Ergebnis-Texte (die kommen unverändert aus DataForSEO/GSC), sondern nur das, was Claude
// selbst schreibt.
const ANTI_SLOP_STYLE_GUIDE = `# SCHREIBSTIL (gilt für jeden Fließtext-Abschnitt, den DU formulierst: ausgangslage, executive_summary, jede reasoning, citation_strategy_note, roadmap.begruendung, Chat-Antworten)
Der Bericht ist ein bezahltes Convertlyze-Produkt. Klingt er nach austauschbarem KI-Text, untergräbt das genau den Preis, den er rechtfertigen soll. Konkret:

## HARTE REGEL, KEINE STILEMPFEHLUNG: GEDANKENSTRICHE SIND VERBOTEN
Verwende NIRGENDS im gesamten Ergebnis die Zeichen "–" (Halbgeviertstrich) oder "—" (Geviertstrich) - weder als Pausen-Ersatz, noch als Parenthese, noch als Aufzählungs-Bindestrich. Das gilt für JEDES Feld ohne Ausnahme, auch für kurze Stichpunkte in content_brief oder roadmap. Diese Regel wird nach deiner Antwort AUTOMATISIERT per Zeichen-Suche geprüft (nicht nur gelesen) - eine einzige Fundstelle im gesamten Ergebnis zählt als Verstoß und löst eine Pflicht-Korrektur aus, bevor der Lauf abgeschlossen werden kann.
Ersetze JEDEN Gedankenstrich-Impuls durch eine der folgenden Alternativen, je nachdem was der Satz braucht:
- Parenthetische Einschübe: Klammern oder Kommas statt "Text – wie hier – Text" -> "Text (wie hier) Text" oder "Text, wie hier, Text".
- Pause/Konsequenz zwischen zwei Aussagen: Punkt und neuer Satz statt "Aussage eins – Aussage zwei" -> "Aussage eins. Aussage zwei." oder ein Doppelpunkt, wenn Aussage zwei die erste konkret auflöst.
- Aufzählungen/Ranges: "von X bis Y" ausschreiben statt "X–Y", "bzw." oder "beziehungsweise" statt eines Gedankenstrichs als Verknüpfung.
Bevor du generate_content_cluster aufrufst, geh dein komplettes Ergebnis gedanklich noch einmal durch und suche gezielt nach "–"/"—" - findest du eine Stelle, formuliere den Satz um, poste ihn NICHT unverändert.

- Keine "Es geht nicht um X, sondern um Y"-Konstruktionen.
- Keine rhythmischen Dreier-Aufzählungen ohne echten inhaltlichen Grund ("schneller, einfacher, besser").
- Keine leeren Eröffnungs-/Übergangsfloskeln ("In der heutigen schnelllebigen Welt", "Eines ist klar:", "Zusammenfassend lässt sich sagen").
- Kein aufgeblähtes/abstraktes Vokabular ("Effizienzsteigerung", "ganzheitliche Lösung", "Mehrwert generieren", "nahtlos", "revolutionär") - stattdessen das konkrete, messbare Ergebnis benennen.
- Kein Coach-/Pathos-Register ("volles Potenzial entfalten", "der Teil, über den niemand spricht").
- Keine überhöflichen Hedges ("es sei angemerkt, dass", "man könnte argumentieren") - Position direkt beziehen.
- Kein Rundum-Fazit ohne Haltung ("letztlich kommt es darauf an") - eine konkrete Einschätzung geben, auch eine unbequeme (siehe WICHTIGSTE REGEL zu Commodity-Themen).
- Keine erfundene Präzision: nur Zahlen nennen, die tatsächlich aus einem Tool-Ergebnis stammen. Ist ein Wert unbekannt, das offen benennen statt eine plausibel klingende Zahl zu erfinden.
- Satzlängen variieren statt durchgehend Subjekt-Prädikat-Objekt in gleicher Länge zu bauen.
- Nenne NIEMALS interne Funktions-, Tool- oder Parameternamen (z.B. "analyze_topic", "analyze_domain_footprint", "analyze_geo_visibility", "generate_content_cluster", "run_prompt_test") und sag nie, dass du "ein Tool aufrufst" oder "eine Funktion nutzt". Beschreibe jeden eigenen Arbeitsschritt in normaler Sprache, so wie ein Mensch seine Vorgehensweise erklären würde - z.B. "Ich schaue kurz nach, ob danach überhaupt gesucht wird" statt "Ich rufe analyze_topic auf", oder "Ich prüfe, wer aktuell für den Begriff rankt und wie die Seiten aufgebaut sind" statt "Ich rufe analyze_geo_visibility auf". Das gilt auch für Umschreibungen wie "Funktion X" oder "Endpunkt Y" - der User soll nie merken, dass hier technische Funktionsnamen im Spiel sind.`;
function buildSystemPrompt(seedTopic: string, domain: string | undefined): string {
  return `Du bist ein Content-Stratege für B2B-SaaS-Landingpages im DACH-Markt (Convertlyze).

# AUFGABE
Baue für das Thema "${seedTopic}"${domain ? ` (Domain: ${domain})` : ''} einen Content-Cluster: EINE Conversion-Seite (die zentrale, verkaufende Landingpage, meist das Ausgangsthema selbst) plus mehrere unterstützende Seiten - INKLUSIVE Ist-Zustand, konkreten Content-Briefs, Commodity-Einschätzung und einer auf echten Daten gestützten GEO-Strategie. Das Ergebnis muss einen Preis rechtfertigen, der über einer reinen Themenliste liegt - generische Aussagen ohne Bezug zu den Tool-Ergebnissen sind ein Fehlschlag, keine akzeptable Kürzung.

# WICHTIGSTE REGEL
Schlage keine reinen Lehrbuch-Themen ("was ist X", "wie funktioniert X") als Hauptargument vor - das sind Themen, die ein LLM bereits aus Trainingsdaten beantwortet, ohne eine Quelle zu zitieren. Solche Themen dürfen als role "coverage" auftauchen (Themenabdeckung/Trust), der eigentliche Wert liegt aber bei role "citation": Vergleichs-, Preis-, Rechner-, Vorlagen-, Use-Case-, Test- und Integrations-Seiten - Formate, die tatsächlich Suchvolumen abgreifen UND als Quelle zitierfähig sind.

${ANTI_SLOP_STYLE_GUIDE}

# ABLAUF (PFLICHT, in dieser Reihenfolge)
1. analyze_topic mit dem Ziel-Thema aufrufen.
2. Aus den Kandidaten die relevantesten 6 bis 10 auswählen${domain ? ', analyze_domain_footprint damit aufrufen (liefert auch den Ist-Zustand).' : ' (analyze_domain_footprint entfällt, keine Domain bekannt - current_state.source dann "none", rows=[], note entsprechend ehrlich formulieren).'}
3. analyze_geo_visibility mit dem Kern-Thema aufrufen (liefert Portale, Top-SERP, AI Overview UND Wettbewerber-Content-Struktur in einem Call). IMMER aufrufen, auch OHNE eigene Domain - own_domain dann einfach weglassen, das Tool funktioniert auch ohne (own_domain_already_cited wird dann false). geo_strategy ist ein PFLICHTFELD bei generate_content_cluster - ohne diesen Tool-Aufruf kannst du es nicht befüllen.
4. generate_content_cluster mit dem fertigen Ergebnis aufrufen.

# ANFORDERUNGEN AN JEDE supporting_page UND DIE conversion_page
- content_brief: 2-6 KONKRETE Stichpunkte, was auf der Seite stehen muss (Elemente/Abschnitte, keine fertigen Sätze). Stütze dich dabei auf: PAA-Fragen aus analyze_topic, die Struktur der Wettbewerber-Seiten (competitor_content_notes - z.B. "Wettbewerber X hat eine Tabelle mit 8 Kriterien, mach eine mit mindestens genauso vielen relevanten Kriterien plus einem, das fehlt") und ggf. zitierte AI-Overview-Referenzen. KEIN generischer Brief wie "Vorteile erklären, CTA einbauen".
- commodity_risk: true, wenn das AI Overview für das Kern-Thema OHNE Quellen-Referenzen antwortet (siehe analyze_geo_visibility-Ergebnis) UND die Seite eine reine Definitions-/Erklär-Seite wäre - dann eher NICHT als eigenständige neue Seite empfehlen bzw. explizit als geringe Priorität kennzeichnen. Bei Vergleichs-/Rechner-/Preis-/Use-Case-Seiten i.d.R. false, außer die Tool-Ergebnisse zeigen klar das Gegenteil.

# CONVERSION-BRIEF NACH CONVERTLYZE-LANDINGPAGE-PATTERNS
NEU (siehe Chat-Verlauf, Lasse: "Convertlyze Patterns für optimale Landingpages einbeziehen" - Beispiel-Brief, das nur GEO-/SEO-Struktur widerspiegelte, keine Conversion-Logik). Gilt für die conversion_page (IMMER, sie ist die zentrale verkaufende Landingpage) UND jede supporting_page mit page_type "conversion_landingpage" - das ist der einzige Seitentyp, der später 1:1 über den Convertlyze-Landingpage-Builder gebaut wird (Sektionen: hero, problem_agitate, usp_grid, feature_block, how_it_works, comparison_table, pricing, trust, faq, cta, ggf. team/case_study/logo_cloud/stats/lead_form). content_brief darf sich für diese Seiten NICHT auf reine GEO-/SEO-Struktur beschränken (Leistungsübersicht, Zertifizierungen, FAQ, CTA als lose Liste) - stattdessen an den bewährten Convertlyze-Mustern für diese Sektionen ausrichten, die die Tool-Ergebnisse konkret befüllen:
- HERO: EIN Outcome/Nutzenversprechen, nicht mehrere Merkmale aneinandergereiht - bei mehreren gleichwertigen Signalen (z.B. mehrere Standorte/Zertifizierungen) eines für die Headline wählen, den Rest in Feature-Block oder Stats verschieben. Trust-Line direkt daneben braucht ein KONKRETES Signal (Zahl, Zertifikat, Standort), keine Floskel.
- TRUST/SOCIAL PROOF: unterliegt Belegpflicht - nur Zertifizierungen/Kennzahlen aufnehmen, die die Tool-Ergebnisse oder bekannte Fakten hergeben, nichts erfinden. Liegen (noch) keine echten Referenzen/Kundenzahlen vor, das im Brief als ehrliche "im Aufbau"-Positionierung vorsehen statt eine Lücke zu verschweigen.
- BUYING CENTER/EINWÄNDE (z.B. Datenschutz, IT-Sicherheit, Compliance): NICHT als eigene sichtbare Sektion mit Rollen-Überschriften vorsehen (liest sich wie eine durchgesickerte Vertriebs-Checkliste) - stattdessen implizit über Trust (Zertifikate/Datenstandort) oder als konkrete FAQ-Frage einweben (z.B. "Wo werden unsere Daten gespeichert?").
- FAQ: neben den inhaltlichen PAA-Fragen auch die Fragen aufnehmen, die die Kaufentscheidungs-Hemmschwelle senken - Preismodell/Rechenbeispiel, typischer Ablauf, Vertragsbindung/Setup-Zeit ("Wie schnell kann ich starten?"). Reine Definitionsfragen allein reichen hier nicht.
- CTA: EIN klarer Primary-CTA. Bei Themen, die noch in einer frühen Phase der Kaufentscheidung stecken (siehe MESSY MIDDLE unten - exploration/evaluation), zusätzlich einen niedrigschwelligeren Secondary-CTA vorsehen (z.B. "Beispielrechnung anfragen" statt nur "Jetzt kaufen") - im Brief als klar nachrangig kennzeichnen, nie gleichwertig zum Primary-CTA.
- USP-GRID vs. FEATURE-BLOCK: im Brief nicht beide mit derselben Aussage in anderen Worten füllen - klar trennen, welcher Punkt die Differenzierung zum Wettbewerb trägt (usp_grid) und welcher ein reines Leistungsmerkmal beschreibt (feature_block).
Diese Convertlyze-Muster ERSETZEN nicht die Pflicht aus dem Abschnitt oben (Bezug zu PAA-Fragen/Wettbewerber-Struktur/AI-Overview) - beides zusammen ergibt den Brief: WAS inhaltlich rein muss (aus den Tool-Ergebnissen) UND WIE es nach bewährtem Conversion-Muster strukturiert gehört.

# PILLAR-PAGES (page_type "pillar_page") - wann sinnvoll
NEU: eine Pillar-Page ist eine breite, umfassende Übersichtsseite zu einem Kern-Thema, die mehrere thematisch verwandte supporting_pages bündelt und zu ihnen verlinkt (Themen-Hub-Modell) - anders als "topic_coverage" (eine einzelne, eng gefasste Informationsseite) ist sie bewusst breit angelegt und dient als zentrale interne Verlinkungs-Drehscheibe für einen ganzen Teilbereich des Clusters.
Schlage "pillar_page" NUR vor, wenn es sich wirklich lohnt: das Kern-Thema muss breit genug sein, dass mindestens 3 der übrigen supporting_pages thematisch darunter fallen und sinnvoll dorthin verlinken können. Bei einem engen Nischen-Thema mit insgesamt nur 4-5 supporting_pages ist eine zusätzliche Hub-Seite meist unnötiger Umfang - dann lieber weglassen, nicht erzwingen.
Wenn du eine pillar_page vorschlägst:
- reasoning MUSS zuerst kurz UND VERSTÄNDLICH erklären, was eine Pillar-Page überhaupt ist (der Kunde ist kein SEO-Experte) - nicht nur, warum sie hier passt. Beispiel-Formulierung: "Eine Pillar-Page ist eine breite Übersichtsseite, die mehrere verwandte Unterseiten bündelt und zu ihnen verlinkt - das baut Themenautorität auf. Für [Thema] lohnt sich das, weil ..."
- content_brief muss die Hub-Funktion widerspiegeln (z.B. "Ein Abschnitt pro Unterthema mit Verlinkung zur jeweiligen Vertiefungs-Seite", "Inhaltsverzeichnis mit Sprungmarken"), nicht wie eine gewöhnliche Themenseite aussehen.
- internal_links sollte mehrere Verlinkungen zu/von dieser Seite enthalten (nicht nur eine) - eine Pillar-Page mit nur einem einzigen internen Link erfüllt ihre Hub-Funktion nicht.
- messy_middle_phase ist bei einer Pillar-Page fast immer "exploration" (sie schafft Breite/Bewusstsein), außer die Tool-Ergebnisse zeigen für dieses Thema klar etwas anderes.

# ZIELGRUPPEN / BUYING CENTER (primary_audience)
NEU (siehe Chat-Verlauf, Lasse: "Zielgruppen mit reinnehmen und Inhalten/Seiten zuordnen" - nach Rückfrage bewusst als leichte Ergänzung, keine volle Zielgruppen-Matrix): jede supporting_page UND die conversion_page bekommen ein primary_audience-Feld - wer diese Seite hauptsächlich anspricht (Buying-Center-Rolle, z.B. "Architekt (Initiator/User)" oder "Büroinhaber (Decider)").
WICHTIGE EINSCHRÄNKUNG (Lasses eigener, richtiger Einwand): primary_audience beschreibt eine BEREITS aus Suchvolumen/Zitier-Chancen gerechtfertigte Seite genauer - es ist KEIN Grund, zusätzliche Seiten zu erfinden, nur damit jede Buying-Center-Rolle eine eigene Seite hat. Eine Rolle, die kein eigenes Suchvolumen hat und nur einen kurzen Hinweis braucht (klassisches Beispiel: ein Datenschutzverantwortlicher, der nur einen DSGVO-Absatz sehen will, keine eigene "DSGVO"-Seite), bekommt KEINE eigene supporting_page. Stattdessen gehört das als Punkt in roadmap (z.B. "DSGVO-Hinweis auf Conversion-Seite ergänzen", siehe Abschnitt EMPFOHLENE ROADMAP unten) - eine Sektion auf einer bestehenden Seite, kein neuer Content. Die WICHTIGSTE REGEL (Suchvolumen/Zitier-Chancen rechtfertigen eine Seite, nicht Zielgruppen-Vollständigkeit) gilt weiterhin uneingeschränkt.

# MESSY MIDDLE (messy_middle_phase) - Journey-Abdeckung sicherstellen
Jede supporting_page bekommt zusätzlich zu page_type/role eine messy_middle_phase (Googles "Messy Middle"-Modell, hier auf 3 praktische Stufen vereinfacht):
- "exploration": schafft Breite/Bewusstsein für das Thema, beantwortet noch offene Grundlagenfragen, öffnet den Möglichkeitsraum. Typisch bei page_type "topic_coverage", "use_case", "pillar_page".
- "evaluation": hilft beim Eingrenzen/Vergleichen - Vergleichs-, Preis-/ROI-, Rechner-, Referenz-/Review-Seiten. Das ist meist der wertvollste Teil des Clusters.
- "decision": unmittelbar vor der Kaufentscheidung, aber NICHT die conversion_page selbst (z.B. eine separate Preis- oder Buchungs-nahe Seite, falls sinnvoll) - darf fehlen, wenn die conversion_page diese Rolle bereits allein abdeckt.
WICHTIG: Schätze das für JEDES Thema neu ein, leite es NICHT automatisch aus page_type ab (ein "comparison" kann je nach Thema auch noch explorativ sein, wenn der Markt für den Kunden neu ist). Der Cluster MUSS mindestens eine "exploration"- und eine "evaluation"-Seite enthalten (harte Validierungsregel) - wenn dir das mit den bisher gewählten Themen nicht gelingt, wähle bei Schritt 2 gezielt einen zusätzlichen Kandidaten aus analyze_topic, der die fehlende Phase abdeckt, statt die Regel zu ignorieren.

# IST-ZUSTAND (current_state)
Übertrage die Ist-Zustand-Zeilen aus dem analyze_domain_footprint-Ergebnis 1:1 in current_state.rows. source muss exakt widerspiegeln, was das Tool geliefert hat ("google_search_console" nur bei echten GSC-Daten, sonst "dataforseo_estimate" oder "none" bei fehlender Domain). Erfinde NIEMALS CTR/Impressionen/Klicks, wenn das Tool sie nicht geliefert hat - dann null setzen, nicht schätzen.

# GEO-STRATEGIE (geo_strategy)
top_serp_results und ai_overview 1:1 aus dem analyze_geo_visibility-Ergebnis übernehmen. citation_strategy_note ist die wichtigste Zeile im ganzen GEO-Abschnitt: eine konkrete, mehrsätzige Einschätzung, WELCHES Format/welche Struktur hier Zitier-Chancen hat (Tabelle? Zahlen/Statistik? FAQ? Schritt-für-Schritt?), basierend auf ai_overview.references (welche Art Seite wird zitiert) UND competitor_content_notes (was Wettbewerber tatsächlich gebaut haben) - keine allgemeine GEO-Erklärung ohne diesen Bezug. Wenn ai_overview.present=false oder references=[], das explizit als Commodity-/Chance-Signal benennen statt es zu übergehen.
Enthält das analyze_geo_visibility-Ergebnis einen Abschnitt "Digital-PR-Kandidaten", baue dessen wichtigste 1-2 Domain(s) als knappen Zusatz-Tipp in citation_strategy_note ein (nicht als eigener Bericht-Abschnitt) - inklusive der dort genannten Einschränkung (Hypothese, kein gemessener Effekt; keine Wettbewerber/nicht-verlinkbare Plattformen vorschlagen). Fehlt der Abschnitt oder wirkt keine der genannten Domains geeignet, einfach weglassen statt einen Tipp zu erzwingen.

geo_strategy MUSS als strukturiertes JSON-OBJEKT mit den im Schema definierten Feldern geliefert werden (z.B. top_serp_results, ai_overview, citation_strategy_note, prompt_tests) - NIEMALS als zusammenfassender Fließtext-String. Ein einzelner Absatz, der alles in Prosa zusammenfasst, ist KEIN gültiger Wert für dieses Feld, selbst wenn er inhaltlich alle Informationen enthält.

# EMPFOHLENE ROADMAP (roadmap) - letzter Berichts-Abschnitt
NEU (siehe Chat-Verlauf, Lasse: "Empfohlene Roadmap ... so wie wir es in der Analyse machen, nur mit weniger Inhalt"): eine priorisierte Verdichtung der wichtigsten nächsten Schritte aus dem GESAMTEN Report, in dieselben 4 Aufwand/Impact-Quadranten sortiert wie im Analyse-Tool:
- sofort_umsetzen: hoher Impact, geringer Aufwand.
- quick_wins: geringer Aufwand, aber nur mittlerer Impact.
- als_naechstes: hoher Impact, aber höherer Aufwand.
- spaeter: geringerer Impact oder abhängig von den Schritten oben.
WICHTIG: Das ist reine SYNTHESE, keine neue Analyse - jeder Punkt muss sich auf einen Befund beziehen, den du an anderer Stelle im Report bereits genannt hast (current_state-Lücke, eine bestimmte supporting_page zuerst bauen, ein GEO-/Citation-Befund aus geo_strategy, oder eine Buying-Center-Rolle aus dem Abschnitt ZIELGRUPPEN, die nur eine Sektion auf einer bestehenden Seite braucht statt einer eigenen supporting_page - z.B. "DSGVO-Hinweis auf Conversion-Seite ergänzen"). Erfinde keine neuen Maßnahmen, die nirgendwo sonst im Report vorkommen. Maximal 2 Punkte pro Bucket, insgesamt ca. 6-8 Punkte über alle vier Buckets - ein leerer Bucket ist völlig in Ordnung (z.B. "spaeter" bleibt bei einem kleinen Cluster oft leer), erzwinge NICHT künstlich mindestens einen Eintrag pro Bucket. Pro Punkt: titel = kurzer Aktionstitel (max. 8-10 Wörter, kein ganzer Satz), begruendung = GENAU EIN Satz. Bewusst knapp gehalten, damit dieser zusätzliche Abschnitt nicht das ohnehin schon ausgereizte Token-Budget von generate_content_cluster sprengt.

# BERICHTS-RAHMEN (ausgangslage + executive_summary)
Das Ergebnis wird dem Kunden als durchgehender Bericht angezeigt, nicht als isolierte Widget-Bausteine - ausgangslage und executive_summary sind die ersten beiden Abschnitte, die der Kunde liest, und müssen entsprechend eigenständig lesbar sein.
- ausgangslage: 3-6 Sätze, WO die Domain/das Thema heute steht. Nutze current_state (echte Rankings/Impressionen ODER die Schätzung, mit korrekter Einordnung der Datenqualität) und ggf. den generellen Wettbewerbskontext aus analyze_topic/analyze_geo_visibility. Bei fehlender Domain: klar sagen, dass keine eigene Bestandsaufnahme möglich war.
  ZUSÄTZLICH (siehe Chat-Verlauf, Lasse: "Einschätzung, wie sinnvoll eine Content-Strategie in Bezug auf Besucher ist"): ausgangslage endet mit einer ehrlichen Einschätzung des Traffic-Potenzials, gestützt auf die AGGREGIERTEN Suchvolumina aus analyze_topic (Hauptkeyword + kompletter Kandidaten-Pool, nicht nur die später tatsächlich ausgewählten Themen). Ist das Volumen über den Pool hinweg durchgängig gering oder unbekannt, das offen benennen UND einen KONKRETEN Vorschlag machen, wie sich das Thema leicht anpassen/erweitern ließe, um mehr Besucher-Potenzial zu erschließen (z.B. ein breiteres, aber noch relevantes Oberthema statt der engen Ausgangsformulierung, eine andere Facette desselben Themas mit höherem Suchvolumen) - keine bloße Enttäuschungs-Feststellung ohne Lösungsvorschlag. Ist das Volumen gut, das ebenso explizit als positives Signal benennen, nicht nur implizit lassen. WICHTIG: diese Einschätzung ist nur so ehrlich wie die zugrunde liegenden Zahlen - erscheint das Suchvolumen bei praktisch JEDEM Kandidaten als "unbekannt" (nicht nur bei einzelnen Long-Tail-/Fragen-Themen), ist das eher ein Hinweis auf einen Datenabruf-Fehler als auf ein tatsächlich fehlendes Thema, das bitte NICHT als "kein Besucher-Potenzial" fehlinterpretieren, sondern als Dateneinschränkung benennen.
- executive_summary: NACHDEM du den Rest des Ergebnisses fertig durchdacht hast, in dieser Struktur (Details/Pflichtfelder siehe Schema-Beschreibung des Tools) - Stärken (was current_state bereits hergibt, ehrlich "noch nichts" falls source="none"), Schwächen (Lücken/Commodity-Anteil im eigenen Cluster-Vorschlag), Wettbewerb (was die stärksten Wettbewerber laut competitor_content_notes/top_serp_results bereits besser machen) und Chancen (die konkrete größte unbesetzte Chance, z.B. eine AI-Overview-Zitation ohne Konkurrenz). Wo einzelne supporting_pages gegen starke Wettbewerber ehrlich kaum Ranking-Chancen haben, das offen benennen - aber einordnen, ob sie trotzdem für interne Verlinkung/Trust/Themenautorität sinnvoll bleiben, statt sie nur als aussichtslos abzutun.

# TONALITÄT
Direkt, konkret, mit Zahlen aus den Tool-Ergebnissen belegt, keine generischen Content-Strategie-Floskeln.`;
}

// ==================== AGENT-LOOP ====================

// Führt EINEN tool_use-Block aus (alles außer generate_content_cluster, das im Loop selbst
// behandelt wird) und liefert IMMER einen tool_result-Block zurück, auch im Fehlerfall - siehe
// Begründung bei runContentStrategyLoop, warum das für JEDEN tool_use-Block eines Turns gelten
// muss, nicht nur für den ersten.
async function executeToolUseBlock(
  block: Anthropic.ToolUseBlock,
  billingUserId: string,
  allowPromptTest: boolean,
  rawPromptTestCollector: GeoPromptTest[]
): Promise<Anthropic.MessageParam> {
  let toolResult: string;
  // NEU (siehe Chat-Verlauf, Lasse: Live-Fehler "Content-Cluster-Generierung nach 1200000ms
  // abgebrochen" - ohne erkennbaren Grund, weil es bisher KEIN Logging dazu gab, wie lange die
  // einzelnen Bausteine eines Laufs tatsächlich brauchen): reines console.log mit Laufzeit pro
  // Tool-Aufruf, keine Verhaltensänderung. Ohne das ist ein Timeout-Abbruch nicht
  // diagnostizierbar - man weiß nicht, ob z.B. analyze_geo_visibility (mit bis zu 3
  // sequenziellen echten LLM-Prompt-Tests, dem schon dokumentierten "langsamsten Teil")
  // ungewöhnlich lange gebraucht hat, oder ob viele generate_content_cluster-Wiederholungen die
  // Ursache waren (siehe Logging weiter unten in runContentStrategyLoop).
  const toolStartedAt = Date.now();
  try {
    if (block.name === 'analyze_topic') {
      toolResult = await toolAnalyzeTopic(AnalyzeTopicInputSchema.parse(block.input));
    } else if (block.name === 'analyze_domain_footprint') {
      toolResult = await toolAnalyzeDomainFootprint(AnalyzeDomainFootprintInputSchema.parse(block.input), billingUserId);
    } else if (block.name === 'analyze_geo_visibility') {
      toolResult = await toolAnalyzeGeoVisibility(AnalyzeGeoVisibilityInputSchema.parse(block.input), allowPromptTest, rawPromptTestCollector);
    } else {
      toolResult = `Unbekanntes Tool: ${block.name}`;
    }
  } catch (err) {
    toolResult = `Fehler: ${(err as Error).message}`;
  }
  console.log(`content-strategy: Tool ${block.name} abgeschlossen nach ${Date.now() - toolStartedAt}ms`);
  return { type: 'tool_result', tool_use_id: block.id, content: toolResult } as unknown as Anthropic.MessageParam;
}

// HINWEIS: kein `export` vor dieser Funktion - `export =` (siehe Dateiende) verträgt sich in
// TS nicht mit anderen `export`-Statements in derselben Datei, exakt dasselbe Problem, das
// pageAgent.ts am eigenen Dateiende dokumentiert. Falls diese Funktion von außerhalb (z.B.
// einem Test) gebraucht wird, gleiche Lösung wie dort: als Property an router hängen.
async function runContentStrategyLoop(
  seedTopic: string,
  domain: string | undefined,
  billingUserId: string,
  allowPromptTest: boolean
): Promise<{ result: ContentClusterResult; rawPromptTests: GeoPromptTest[] }> {
  // Sammelt die ECHTEN Prompt-Test-Ergebnisse aus toolAnalyzeGeoVisibility ein, unabhängig vom
  // Loop-Ausgang - siehe Kommentar dort. EIN Array für den kompletten Lauf, auch wenn
  // analyze_geo_visibility (bei einem misslungenen ersten generate_content_cluster-Versuch)
  // theoretisch kein zweites Mal aufgerufen wird - normalerweise passiert das genau einmal pro
  // Lauf.
  const rawPromptTests: GeoPromptTest[] = [];
  let messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Baue einen Content-Cluster für das Thema "${seedTopic}".${
        domain ? ` Eigene Domain: ${domain}.` : ' Keine Domain angegeben, überspringe den Domain-Gap-Check.'
      } ${
        allowPromptTest
          ? 'Setze run_prompt_test bei analyze_geo_visibility auf true (Normalfall).'
          : 'Der GEO-Prompt-Test ist für diesen Lauf serverseitig deaktiviert - lass run_prompt_test bei analyze_geo_visibility auf false (wird ohnehin erzwungen).'
      }`,
    },
  ];
  let toolCallCount = 0;
  // NEU (siehe GEDANKENSTRICH-DURCHSETZUNG oben): eigener, kleinerer Zähler für Gedankenstrich-
  // Korrektur-Versuche, getrennt von toolCallCount/MAX_TOOL_CALLS (siehe Begründung dort).
  let slopFixAttempts = 0;
  // NEU (siehe Chat-Verlauf, Live-Fehler "geo_strategy: Invalid input: expected object, received
  // undefined", wiederholt bis MAX_TOOL_CALLS erschöpft war): verfolgt, ob analyze_geo_visibility
  // in diesem Lauf überhaupt schon (in irgendeinem Turn) aufgerufen wurde - unabhängig vom
  // Ergebnis. Grund: die reine Zod-Fehlermeldung "geo_strategy: ... received undefined" sagt
  // Claude NICHT, WARUM das Feld fehlt bzw. was zu tun ist - wenn der eigentliche Grund ist, dass
  // der Tool-Aufruf schlicht nie stattfand (z.B. weil das jetzt korrigierte Pflichtfeld own_domain
  // ohne Domain nicht befüllbar war), half die generische Meldung nicht weiter und Claude hat
  // denselben unvollständigen Aufruf einfach wiederholt. Siehe Korrektur-Text weiter unten.
  let geoVisibilityCalled = false;
  // NEU (siehe Chat-Verlauf, Live-Timeout-Fehler ohne erkennbare Ursache): misst die
  // Gesamtlaufzeit dieser Funktion UND jeden einzelnen Claude-Turn, damit ein künftiger
  // 20-Minuten-Abbruch anhand der Server-Logs tatsächlich diagnostizierbar ist, statt raten zu
  // müssen, ob es an vielen generate_content_cluster-Wiederholungen lag oder schlicht an
  // langsamen Tool-Aufrufen (siehe Logging in executeToolUseBlock).
  const loopStartedAt = Date.now();
  let turnNumber = 0;
  console.log(`content-strategy: Lauf gestartet für "${seedTopic}"`);

  while (true) {
    turnNumber++;
    const turnStartedAt = Date.now();
    const response = await anthropic.messages.create({
      model: AGENT_MODEL,
      // Angehoben von 4000 auf 8000, jetzt auf 16000 (siehe Chat-Verlauf, Live-Fehler
      // "internal_links: ... received undefined | geo_strategy: ... received undefined" -
      // genau die beiden größten/letzten Felder im Schema, current_state dazwischen aber
      // vollständig vorhanden): 8000 hat bei einem umfangreicheren Cluster nicht mehr gereicht,
      // response.stop_reason war 'max_tokens' - Claude wurde mitten in internal_links/
      // geo_strategy abgeschnitten, BEVOR es fertig war (siehe truncated-Erkennung weiter
      // unten für den Fall, dass selbst 16000 mal nicht reicht). Kein bekanntes Kostenrisiko
      // durch die Anhebung selbst - abgerechnet wird nach TATSÄCHLICH generierten Tokens, das
      // Limit ist nur eine Obergrenze, kein Fixpreis.
      max_tokens: 16000,
      // Als Block mit eigenem Cache-Breakpoint statt einfachem String (siehe Cache-Hinweis bei
      // CONTENT_STRATEGY_TOOLS oben): buildSystemPrompt() liefert innerhalb EINES Laufs bei
      // jedem der bis zu 4 Calls denselben Text (seedTopic/domain ändern sich im Loop nicht) -
      // Anthropic matcht den Cache über den Inhalt, nicht über Objekt-Identität, ein erneuter
      // Funktionsaufruf pro Turn ist also unproblematisch.
      system: [{ type: 'text', text: buildSystemPrompt(seedTopic, domain), cache_control: { type: 'ephemeral' } }],
      messages,
      tools: CONTENT_STRATEGY_TOOLS,
    });

    // BUGFIX (siehe Chat-Verlauf, Live-Fehler "tool_use ids were found without tool_result
    // blocks"): Claude ruft gelegentlich MEHRERE Tools in einem einzigen Turn parallel auf,
    // nicht nur eins. Die vorherige Fassung nahm mit .find() nur den ERSTEN tool_use-Block,
    // beantwortete aber trotzdem die komplette response.content (mit allen Tool-Aufrufen) als
    // Assistant-Turn - der zweite (unbeantwortete) tool_use-Block ließ dann den NÄCHSTEN
    // Anthropic-Aufruf mit HTTP 400 scheitern, weil jeder tool_use zwingend einen tool_result
    // im direkt folgenden User-Turn braucht. Jetzt: ALLE tool_use-Blöcke eines Turns einsammeln
    // und für JEDEN einen tool_result liefern.
    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUseBlocks.some(b => b.name === 'analyze_geo_visibility')) geoVisibilityCalled = true;
    console.log(
      `content-strategy: Turn ${turnNumber} (${Date.now() - turnStartedAt}ms, gesamt ${Date.now() - loopStartedAt}ms) - ` +
        `stop_reason=${response.stop_reason}, Tools: ${toolUseBlocks.map(b => b.name).join(', ') || 'keine'}`
    );

    if (toolUseBlocks.length === 0) {
      throw new Error('Agent hat generate_content_cluster nicht aufgerufen (kein tool_use-Block in der Antwort).');
    }

    // generate_content_cluster gewinnt, falls es (ggf. neben anderen Tools) in diesem Turn
    // aufgerufen wird - bei gültiger Eingabe endet der Loop hier, offene tool_result-Antworten
    // für andere tool_use-Blöcke desselben Turns sind dann irrelevant, weil kein weiterer
    // Anthropic-Aufruf mehr folgt.
    const clusterBlock = toolUseBlocks.find(b => b.name === 'generate_content_cluster');
    if (clusterBlock) {
      // NEU (siehe geo_strategy-ROBUSTHEIT oben): sicheren Auto-Fix zuerst versuchen, BEVOR
      // überhaupt validiert wird - repariert nur den Fall "korrektes JSON-Objekt versehentlich
      // als String verpackt", lässt echten Fließtext unverändert (dann greift Validierung +
      // Retry-Hinweis wie gehabt).
      const { input: coercedClusterInput, changedFields } = coerceDoubleEncodedObjectFields(clusterBlock.input);
      if (changedFields.length > 0) {
        console.log(`content-strategy: doppelt kodierte(s) Objekt-Feld(er) automatisch repariert: ${changedFields.join(', ')}`);
      }

      const parsed = ContentClusterResultSchema.safeParse(coercedClusterInput);
      if (parsed.success) {
        // NEU (siehe GEDANKENSTRICH-DURCHSETZUNG oben): Schema-Validierung ist bestanden, das
        // Ergebnis kann aber trotzdem verbotene Gedankenstriche enthalten - dafür reicht Zod
        // nicht aus (Zod prüft Struktur, nicht Zeichen-Inhalt). Erst NACH diesem Zeichen-Check
        // gilt der Lauf als wirklich fertig.
        const emDashViolations = findEmDashViolations(parsed.data);
        if (emDashViolations.length > 0 && slopFixAttempts < MAX_SLOP_FIX_ATTEMPTS) {
          slopFixAttempts++;
          toolCallCount++; // zählt trotzdem gegen das Gesamt-Budget, siehe Begründung oben
          console.log(
            `content-strategy: ${emDashViolations.length} Gedankenstrich-Verstoß/Verstöße gefunden (Korrektur-Versuch ${slopFixAttempts}/${MAX_SLOP_FIX_ATTEMPTS}), erste Fundstelle: ${emDashViolations[0].path} = "${emDashViolations[0].excerpt.slice(0, 100)}"`
          );
          if (toolCallCount >= MAX_TOOL_CALLS) {
            // Gesamt-Budget für diesen Lauf erschöpft, obwohl die Struktur längst gültig ist -
            // lieber den inhaltlich korrekten Report mit ein paar Gedankenstrichen ausliefern
            // als den bezahlten Lauf jetzt noch scheitern zu lassen (siehe "fail open"-Prinzip
            // oben). Restliche Fundstellen bleiben im Log sichtbar für eine manuelle Prüfung.
            console.warn(`content-strategy: MAX_TOOL_CALLS erschöpft trotz gültiger Struktur - Ergebnis mit ${emDashViolations.length} verbleibendem/n Gedankenstrich(en) wird dennoch übernommen.`);
            return { result: parsed.data, rawPromptTests };
          }
          const slopErrorText = buildEmDashRetryText(emDashViolations);
          const toolResults = await Promise.all(
            toolUseBlocks.map(block =>
              block.id === clusterBlock.id
                ? Promise.resolve({
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: slopErrorText,
                    is_error: true,
                  } as unknown as Anthropic.MessageParam)
                : executeToolUseBlock(block, billingUserId, allowPromptTest, rawPromptTests)
            )
          );
          messages = [...messages, { role: 'assistant', content: response.content }, { role: 'user', content: toolResults as any }];
          continue;
        }
        if (emDashViolations.length > 0) {
          // MAX_SLOP_FIX_ATTEMPTS erschöpft, aber weiterhin Verstöße vorhanden - bewusst "fail
          // open" statt den Lauf abzubrechen (siehe Begründung oben): der Report ist inhaltlich
          // fertig und bezahlt, ein paar verbliebene Gedankenstriche sind ein Stil-Makel, kein
          // Grund, dem User einen kompletten Fehlschlag anzuzeigen.
          console.warn(`content-strategy: ${emDashViolations.length} Gedankenstrich(e) nach ${MAX_SLOP_FIX_ATTEMPTS} Korrektur-Versuchen weiterhin vorhanden - Ergebnis wird dennoch übernommen. Fundstellen: ${emDashViolations.map(v => v.path).join(', ')}`);
        }
        console.log(`content-strategy: Lauf erfolgreich abgeschlossen nach ${Date.now() - loopStartedAt}ms, ${turnNumber} Turn(s), ${toolCallCount} fehlgeschlagene(r) generate_content_cluster-Versuch(e).`);
        return { result: parsed.data, rawPromptTests };
      }

      toolCallCount++;
      const zodErrorText = formatZodError(parsed.error);

      // NEU/KORRIGIERT (siehe findStringWhereObjectExpected-Kommentar oben): version-robuste
      // Erkennung von "Objekt erwartet, String erhalten" statt der Zod-Issue-Feldnamen zu
      // vertrauen. console.log statt console.warn, damit die Sichtbarkeit garantiert der von
      // "generate_content_cluster ungültig" direkt darunter entspricht (kein Rätselraten mehr,
      // ob eine andere Log-Severity die Zeile herausgefiltert hat).
      const objectShapeViolations = findStringWhereObjectExpected(parsed.error, ContentClusterResultSchema, coercedClusterInput);
      for (const v of objectShapeViolations) {
        const rawValue = getValueAtPath(coercedClusterInput, v.path.split('.'));
        console.log(`content-strategy: Feld "${v.path}" als String statt Objekt erhalten, roher Inhalt (erste 500 Zeichen): ${String(rawValue).slice(0, 500)}`);
      }
      // Zusätzliche, ungefilterte Absicherung: die vollständigen rohen Zod-Issues einmal pro
      // fehlgeschlagenem Versuch als JSON loggen. Unabhängig von jeder Annahme über Zods
      // Issue-Feldnamen (siehe Bugfix-Begründung oben) - falls sich künftig ein neues,
      // unbekanntes Fehlermuster zeigt, ist die exakte Zod-Issue-Struktur dann sofort einsehbar,
      // statt erneut zu raten.
      try {
        console.log(`content-strategy: rohe Zod-Issues (Versuch ${toolCallCount}): ${JSON.stringify(parsed.error.issues).slice(0, 1500)}`);
      } catch {
        // JSON.stringify sollte für Zod-Issues nie fehlschlagen, aber rein defensiv: ein
        // Logging-Fehler darf niemals den eigentlichen Retry-Ablauf unterbrechen.
      }

      console.log(`content-strategy: generate_content_cluster ungültig (Versuch ${toolCallCount}/${MAX_TOOL_CALLS}, truncated=${response.stop_reason === 'max_tokens'}): ${zodErrorText.slice(0, 200)}`);
      if (toolCallCount >= MAX_TOOL_CALLS) throw new Error('Zu viele fehlgeschlagene generate_content_cluster-Versuche: ' + zodErrorText);

      // NEU (siehe Chat-Verlauf, zweiter Live-Fehler direkt nach dem own_domain-Fix:
      // "internal_links: ... received undefined | geo_strategy: ... received undefined", beides
      // Felder gegen Ende des Schemas, current_state dazwischen aber vollständig vorhanden):
      // response.stop_reason === 'max_tokens' erkennt zuverlässig, ob der eigentliche Grund eine
      // wegen des Token-Limits abgeschnittene Antwort war, statt fehlender Vorarbeit. Ohne
      // diesen Hinweis hätte Claude beim nächsten Versuch denselben Umfang nochmal probiert und
      // wäre in dieselbe Wand gelaufen, bis MAX_TOOL_CALLS erschöpft ist (genau das ist beim
      // zweiten Lauf passiert). Truncation-Erkennung hat Vorrang vor der geoVisibilityCalled-
      // Prüfung darunter - eine abgeschnittene Antwort ist die spezifischere, zutreffendere
      // Diagnose, auch wenn geo_strategy zufällig eines der abgeschnittenen Felder ist.
      const truncated = response.stop_reason === 'max_tokens';
      let clusterErrorText: string;
      if (truncated) {
        clusterErrorText = `Ungültige Eingabe: ${zodErrorText}\n\nDeine Antwort wurde wegen der Token-Grenze abgeschnitten, BEVOR alle Pflichtfelder fertig waren (fehlende Felder siehe oben). Fasse dich beim nächsten Versuch bewusst kürzer: weniger supporting_pages (5-6 reichen, nicht bis zu 8), kürzere content_briefs (2-3 statt 6 Stichpunkte je Seite), eine knappere citation_strategy_note, und bei roadmap höchstens 1 Punkt pro Bucket statt 2. Vollständigkeit ALLER Pflichtfelder ist wichtiger als ausführliche Formulierungen in einzelnen Feldern.`;
      } else if (!geoVisibilityCalled && zodErrorText.includes('geo_strategy')) {
        clusterErrorText = `Ungültige Eingabe: ${zodErrorText}\n\nDu hast generate_content_cluster aufgerufen, ohne vorher analyze_geo_visibility aufzurufen - geo_strategy ist ein Pflichtfeld und kann ohne dessen Ergebnis nicht befüllt werden. Rufe JETZT ZUERST analyze_geo_visibility mit dem Kern-Thema auf (own_domain weglassen, falls keine Domain bekannt ist), bevor du generate_content_cluster erneut versuchst.`;
      } else {
        // NEU (siehe geo_strategy-ROBUSTHEIT oben): schemabasierte Zusatz-Hinweise, jetzt
        // version-robust über findStringWhereObjectExpected() statt Zod-Issue-Feldnamen (siehe
        // Bugfix-Begründung dort) - fehlen bei jedem anderen Zod-Fehler einfach (dann liefert
        // buildObjectShapeHints einen leeren String und clusterErrorText bleibt wie bisher nur
        // die rohe Zod-Meldung).
        clusterErrorText = `Ungültige Eingabe: ${zodErrorText}${buildObjectShapeHints(objectShapeViolations)}`;
      }

      const toolResults = await Promise.all(
        toolUseBlocks.map(block =>
          block.id === clusterBlock.id
            ? Promise.resolve({
                type: 'tool_result',
                tool_use_id: block.id,
                content: clusterErrorText,
                is_error: true,
              } as unknown as Anthropic.MessageParam)
            : executeToolUseBlock(block, billingUserId, allowPromptTest, rawPromptTests)
        )
      );
      messages = [...messages, { role: 'assistant', content: response.content }, { role: 'user', content: toolResults as any }];
      continue;
    }

    if (toolCallCount + toolUseBlocks.length > MAX_TOOL_CALLS) {
      throw new Error('Tool-Limit erreicht, ohne dass generate_content_cluster aufgerufen wurde.');
    }
    toolCallCount += toolUseBlocks.length;

    const toolResults = await Promise.all(toolUseBlocks.map(block => executeToolUseBlock(block, billingUserId, allowPromptTest, rawPromptTests)));
    messages = [...messages, { role: 'assistant', content: response.content }, { role: 'user', content: toolResults as any }];
  }
}

// ==================== REPORT-CHAT: SYSTEM-PROMPT + AGENT-LOOP ====================
// NEU (siehe Chat-Verlauf, Lasse: "KI-Agent, der Fragen des Users zu dem Report beantworten
// kann"). Bewusst eine EIGENE, einfachere Loop-Funktion statt runContentStrategyLoop
// wiederzuverwenden: der Chat braucht kein starres generate_content_cluster-Ausgabe-Schema mit
// Zod-Validierung/Retry-Logik (siehe die zwei Live-Fehler von eben) - eine normale Text-Antwort
// (stop_reason 'end_turn', kein tool_use mehr im letzten Turn) reicht als Abschluss.

function buildChatSystemPrompt(seedTopic: string, domain: string | undefined, result: ContentClusterResult): string {
  return `Du bist derselbe Content-Stratege für B2B-SaaS-Landingpages im DACH-Markt (Convertlyze), der den folgenden Content-Cluster-Report für das Thema "${seedTopic}"${domain ? ` (Domain: ${domain})` : ''} bereits erstellt hat. Ein User stellt jetzt Rückfragen dazu.

# DEIN REPORT (bereits fertig - NICHT neu erfinden, als Grundlage für deine Antworten nutzen)
${JSON.stringify(result)}

# REGELN
- Beantworte Fragen GRUNDSÄTZLICH anhand der obigen Report-Daten. Erfinde keine Zahlen/Fakten, die dort nicht stehen - "das steht so nicht im Report, dazu müsste ich neu prüfen" ist eine bessere Antwort als eine geratene Zahl.
- Geht eine Frage über den Report hinaus (z.B. ein komplett neues Keyword, das im Cluster nicht vorkommt), darfst du eine erneute eigene Prüfung anstoßen, um eine ECHTE, aktuelle Antwort zu liefern - aber nur, wenn es die Frage wirklich erfordert, nicht bei jeder Rückfrage zum bestehenden Report. Sag dem User in normaler Sprache, wenn eine Antwort auf einer neuen, frischen Prüfung beruht statt auf dem ursprünglichen Report (z.B. "Das habe ich gerade nochmal frisch nachgeprüft, aktuell sieht das so aus: ..." statt irgendeines internen Namens für den Prüfschritt).
- Du kannst den gespeicherten Report NICHT verändern - keine neuen Seiten hinzufügen, keine Felder überschreiben, das hier ist nur ein Gespräch über den Report, keine Bearbeitung. Wünscht der User eine inhaltliche Änderung, erkläre das offen und schlage vor, das Thema in einer neuen Strategie-Session zu berücksichtigen.
- Antworte kurz und konkret, keine Wiederholung des ganzen Reports auf jede Frage - der User hat den Report bereits gelesen.

${ANTI_SLOP_STYLE_GUIDE}`;
}

async function runContentStrategyChatLoop(
  seedTopic: string,
  domain: string | undefined,
  result: ContentClusterResult,
  billingUserId: string,
  history: Anthropic.MessageParam[],
  userMessage: string
): Promise<string> {
  let messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userMessage }];
  let toolCallCount = 0;
  // Bleibt in der Praxis immer leer: allowPromptTest ist unten hart auf false gesetzt, echte
  // Prompt-Test-Ergebnisse können im Chat also gar nicht entstehen. executeToolUseBlock
  // verlangt trotzdem einen Collector-Parameter (geteilte Signatur mit dem Report-Loop).
  const chatRawPromptTests: GeoPromptTest[] = [];

  while (true) {
    const response = await anthropic.messages.create({
      model: AGENT_MODEL,
      // Deutlich kleiner als bei generate_content_cluster (16000) - eine Chat-Antwort ist
      // Fließtext, keine große verschachtelte JSON-Struktur.
      max_tokens: 2000,
      system: [{ type: 'text', text: buildChatSystemPrompt(seedTopic, domain, result), cache_control: { type: 'ephemeral' } }],
      messages,
      tools: CHAT_TOOLS,
    });

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
      const reply = textBlocks.map(b => b.text).join('\n\n').trim();
      if (!reply) throw new Error('Agent hat keine Text-Antwort geliefert.');
      return reply;
    }

    toolCallCount += toolUseBlocks.length;
    if (toolCallCount > MAX_CHAT_TOOL_CALLS) {
      throw new Error('Zu viele Tool-Aufrufe für eine einzelne Chat-Antwort.');
    }

    // allowPromptTest HART auf false - siehe buildChatSystemPrompt: der echte, kostenpflichtige
    // GEO-Prompt-Test bleibt dem einmaligen Report-Lauf vorbehalten, nie dem freien Chat danach.
    // Exakt derselbe serverseitige Sperr-Mechanismus wie bei runContentStrategyLoop, hier nur
    // ohne Request-Body-Eingabe überhaupt erst zuzulassen.
    const toolResults = await Promise.all(toolUseBlocks.map(block => executeToolUseBlock(block, billingUserId, false, chatRawPromptTests)));
    messages = [...messages, { role: 'assistant', content: response.content }, { role: 'user', content: toolResults as any }];
  }
}

// ==================== ENDPUNKTE ====================

// Identisch zu GET /api/page-agent/me (gleiche authenticateUser-Logik, gleiche Antwortform),
// hier bewusst dupliziert statt vom Frontend gegen die page-agent-Route aufrufen zu lassen -
// dieses Feature soll nicht implizit von der Existenz der page-agent-Route abhängen.
router.get('/me', authenticateUser, (req: Request, res: Response) => {
  res.json({ user_id: req.authenticatedUserId });
});

// Läuft NACH dem res.status(202) im Hintergrund weiter - siehe Datei-Kopf zur Begründung.
// Übernimmt bei Erfolg das Speichern der Session, bei Fehler das Freigeben des reservierten
// Kontingents (identisches Verhalten zur vorherigen synchronen Fassung, nur zeitlich entkoppelt).
async function runContentStrategyInBackground(params: {
  turnId: string;
  sessionId: string;
  topic: string;
  domain: string | undefined;
  billingUserId: string;
  fundingSource: 'plan' | 'ppu_strategy';
  allowPromptTest: boolean;
}): Promise<void> {
  // userId wird hier NICHT mehr gebraucht (kein .insert() mehr an dieser Stelle, siehe unten) -
  // die Platzhalter-Zeile inkl. user_id entsteht bereits in POST /generate, bevor diese Funktion
  // überhaupt aufgerufen wird.
  const { turnId, sessionId, topic, domain, billingUserId, fundingSource, allowPromptTest } = params;
  // NEU (siehe Chat-Verlauf, Lasse: "Dauer der Erstellung speichern") - Startzeit HIER erfasst,
  // nicht aus created_at der Platzhalter-Zeile berechnet: beide liegen zwar nur Millisekunden
  // auseinander (die Zeile entsteht in POST /generate unmittelbar bevor diese Funktion gestartet
  // wird), aber so hängt die Messung nicht von einer DB-Zeit ab, die durch Uhren-Drift zwischen
  // App-Server und Datenbank leicht abweichen könnte.
  const startedAt = Date.now();
  try {
    const { result, rawPromptTests } = await withTimeout(
      runContentStrategyLoop(topic, domain, billingUserId, allowPromptTest),
      BACKGROUND_TURN_TIMEOUT_MS,
      'Content-Cluster-Generierung'
    );

    // ÜBERSCHREIBT geo_strategy.prompt_tests mit den ECHTEN, serverseitig gemessenen Werten
    // statt Claudes eigener Abschrift zu vertrauen (siehe Kommentar bei toolAnalyzeGeoVisibility)
    // - dieselben Daten, die gleich darunter auch in content_strategy_geo_prompt_tests landen,
    // damit Bericht und Supabase-Audit-Trail garantiert übereinstimmen, nicht zwei potenziell
    // widersprüchliche Versionen derselben Zahlen.
    if (rawPromptTests.length > 0) {
      result.geo_strategy.prompt_tests = rawPromptTests.map(r => ({
        prompt: r.prompt,
        llm_type: r.llm_type,
        messy_middle_phase: r.messy_middle_phase,
        own_domain_cited: r.own_domain_cited,
        cited_domains: r.cited_domains,
        answerable_from_training_data: r.answerable_from_training_data,
      }));
    }

    // UPDATE der bereits VOR dem Agent-Lauf angelegten Platzhalter-Zeile (siehe POST /generate)
    // statt eines neuen INSERT - dieselbe Session-ID, die dem User schon in der 202-Antwort und
    // im Dashboard als "In Bearbeitung" angezeigt wurde, wird hier fertiggestellt. Kein
    // .insert() mehr an dieser Stelle.
    const { data: session, error: sessionError } = await supabase
      .from('content_strategy_sessions')
      .update({
        result,
        status: 'done',
        duration_seconds: Math.round((Date.now() - startedAt) / 1000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (sessionError) throw new Error(sessionError.message);

    // Bewusst NICHT Teil des kritischen Pfads: schlägt dieser Insert fehl, ist das ärgerlich für
    // den Audit-Trail, aber kein Grund, die bereits erfolgreich gespeicherte und bezahlte Session
    // als Fehler an den User zurückzugeben - deshalb eigenes try/catch statt im äußeren try oben.
    if (rawPromptTests.length > 0) {
      try {
        await supabase.from('content_strategy_geo_prompt_tests').insert(
          rawPromptTests.map(r => ({
            session_id: session.id,
            seed_topic: topic,
            messy_middle_phase: r.messy_middle_phase,
            prompt: r.prompt,
            llm_type: r.llm_type,
            own_domain_cited: r.own_domain_cited,
            cited_domains: r.cited_domains,
            answerable_from_training_data: r.answerable_from_training_data,
          }))
        );
      } catch (auditErr) {
        console.warn('content_strategy_geo_prompt_tests-Insert fehlgeschlagen (nicht kritisch):', (auditErr as Error).message);
      }
    }

    finishContentStrategyTurnJob(turnId, { status: 'done', result: { session_id: session.id, result, funded_by: fundingSource } });
  } catch (err) {
    console.error('content-strategy background job error:', (err as Error).message);
    await releaseFunding(billingUserId, fundingSource);
    // Platzhalter-Zeile bleibt bewusst erhalten statt gelöscht zu werden (status='error' statt
    // .delete()) - genau wie bei Analysen (STATUS_STYLES.error/failed im Dashboard-Script) soll
    // ein gescheiterter Lauf für den User sichtbar als "Fehler" auftauchen, statt spurlos aus der
    // Liste zu verschwinden. Best-effort: schlägt sogar dieses Update fehl, bleibt die Zeile
    // fälschlich auf 'in_progress' stehen - ärgerlich, aber kein Grund, den ohnehin schon
    // gescheiterten Lauf zusätzlich eskalieren zu lassen.
    try {
      await supabase
        .from('content_strategy_sessions')
        .update({
          status: 'error',
          error_message: (err as Error).message,
          duration_seconds: Math.round((Date.now() - startedAt) / 1000),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    } catch (statusErr) {
      console.warn('content_strategy_sessions status=error-Update fehlgeschlagen:', (statusErr as Error).message);
    }
    finishContentStrategyTurnJob(turnId, { status: 'error', error: (err as Error).message });
  }
}

router.post('/generate', authenticateUser, authorizeUser, async (req: Request, res: Response) => {
  const { user_id, topic, domain, run_prompt_test } = req.body as { user_id?: string; topic?: string; domain?: string; run_prompt_test?: boolean };
  // GEÄNDERT (siehe Chat-Verlauf, Checkbox im Formular entfernt): run_prompt_test defaultet jetzt
  // auf true, statt wie vorher auf false, wenn es fehlt - das Frontend schickt es zwar ohnehin
  // immer als true mit, aber andere Aufrufer (z.B. ein zukünftiger API-Client) sollen den Test
  // weiterhin explizit mit run_prompt_test:false abbestellen können, ohne dass das Feld dafür
  // Pflicht wird. isGeoPromptTestGloballyEnabled() ist der eigentliche, jetzt primäre Schalter -
  // rein operativ, kein User-Wunsch mehr (siehe Kommentar dort).
  const allowPromptTest = run_prompt_test !== false && isGeoPromptTestGloballyEnabled();
  if (!user_id || !topic) {
    res.status(400).json({ error: 'user_id und topic erforderlich' });
    return;
  }

  const quota = await getOrResetContentStrategyQuota(user_id);
  if (!quota) {
    res.status(500).json({ error: 'Kontingent konnte nicht ermittelt werden' });
    return;
  }

  let fundingSource: 'plan' | 'ppu_strategy' = 'plan';
  const reservation = await reserveContentStrategySlot(quota.billingUserId, quota.limit, quota.recurring);

  if (!reservation || !reservation.allowed) {
    const ppuReservation = await reservePpuStrategyCredit(quota.billingUserId);
    if (!ppuReservation || !ppuReservation.allowed) {
      res.status(402).json({
        error: 'Kein Strategie-Kontingent verfügbar',
        sessions_used: reservation?.used ?? quota.used,
        sessions_limit: reservation?.limit ?? quota.limit,
        ppu_strategy_credits_remaining: 0,
      });
      return;
    }
    fundingSource = 'ppu_strategy';
  }

  // Platzhalter-Session SOFORT anlegen, status='in_progress' (siehe Chat-Verlauf, Lasse:
  // "Content-Strategie-Sessions sollen im Dashboard genauso wie Analysen/Aufbau-Sessions
  // angelegt werden, sobald sie in Bearbeitung sind") - vorher entstand die Zeile erst NACH dem
  // kompletten, oft 10+ Minuten dauernden Lauf (siehe runContentStrategyInBackground), ein
  // laufender Auftrag war im Dashboard bis dahin unsichtbar. Migration
  // content_strategy_sessions_status.sql macht result nullable und ergänzt status/error_message.
  const { data: pendingSession, error: pendingSessionError } = await supabase
    .from('content_strategy_sessions')
    // billing_user_id/funding_source werden HIER festgehalten (nicht erst beim Abschluss), damit
    // eine verwaiste in_progress-Zeile (Server-Neustart mitten im Lauf, siehe
    // reconcileStaleContentStrategySessions weiter unten) später weiß, wessen Kontingent/PPU-
    // Guthaben freigegeben werden muss - siehe migrations/content_strategy_sessions_recovery.sql.
    .insert({ user_id, seed_topic: topic, domain: domain || null, status: 'in_progress', billing_user_id: quota.billingUserId, funding_source: fundingSource })
    .select('id')
    .single();

  if (pendingSessionError || !pendingSession) {
    // Reservierung wieder freigeben - sonst verliert der User einen bezahlten Slot, ohne dass
    // überhaupt ein Lauf gestartet wurde.
    await releaseFunding(quota.billingUserId, fundingSource);
    res.status(500).json({ error: 'Session konnte nicht angelegt werden: ' + (pendingSessionError?.message || 'unbekannter Fehler') });
    return;
  }

  // Reservierung ist jetzt gebucht (bezahlter Zustand) - ab hier NICHT mehr auf den
  // HTTP-Response warten, sondern sofort 202 zurückgeben und im Hintergrund weiterlaufen.
  // sessionId/billingUserId/fundingSource werden jetzt mit übergeben (siehe
  // PROAKTIVES AUFRÄUMEN BEIM SHUTDOWN oben) - der SIGTERM-Handler braucht sie, falls der
  // Prozess während dieses Laufs heruntergefahren wird.
  const turnId = createContentStrategyTurnJob(user_id, pendingSession.id, quota.billingUserId, fundingSource);
  runContentStrategyInBackground({ turnId, sessionId: pendingSession.id, topic, domain, billingUserId: quota.billingUserId, fundingSource, allowPromptTest });

  res.status(202).json({
    turn_id: turnId,
    session_id: pendingSession.id,
    status: 'processing',
    funded_by: fundingSource,
    sessions_used: reservation?.used ?? quota.used,
    sessions_limit: reservation?.limit ?? quota.limit,
    sessions_remaining: reservation ? Math.max(reservation.limit - reservation.used, 0) : quota.remaining,
  });
});

// Polling-Endpunkt fürs Frontend, exakt analog zu GET /api/page-agent/chat/status/:turn_id -
// alle 2-3s aufrufen, bis status !== 'processing'.
router.get('/status/:turn_id', authenticateUser, async (req: Request, res: Response) => {
  const turn_id = req.params.turn_id as string;
  const job = contentStrategyTurnJobs.get(turn_id);
  if (!job) {
    res.status(404).json({
      error: 'Die Verarbeitung wurde unterbrochen (z.B. durch einen Server-Neustart) oder ist abgelaufen.',
      code: 'turn_lost',
    });
    return;
  }

  const teamIds = await getTeamUserIds(req.authenticatedUserId as string);
  if (!teamIds.includes(job.startedByUserId)) {
    res.status(403).json({ error: 'Kein Zugriff auf diesen Turn' });
    return;
  }

  if (job.status === 'processing') {
    res.json({ status: 'processing' });
    return;
  }
  if (job.status === 'error') {
    contentStrategyTurnJobs.delete(turn_id);
    res.status(502).json({ status: 'error', error: job.error });
    return;
  }
  contentStrategyTurnJobs.delete(turn_id);
  res.json({ status: 'done', ...job.result });
});

// Quota-Vorschau fürs Frontend, analog zu GET /api/page-agent/quota - wird VOR dem Absenden des
// Formulars gebraucht, um den Button zu deaktivieren/die Restanzahl anzuzeigen, ohne dafür schon
// eine Session zu reservieren.
router.get('/quota', authenticateUser, async (req: Request, res: Response) => {
  const { user_id } = req.query as { user_id?: string };
  if (!user_id) {
    res.status(400).json({ error: 'user_id fehlt' });
    return;
  }
  if (user_id !== req.authenticatedUserId) {
    res.status(403).json({ error: 'Zugriff verweigert' });
    return;
  }
  const quota = await getOrResetContentStrategyQuota(user_id);
  if (!quota) {
    res.status(404).json({ error: 'Kein Plan-Kontingent gefunden' });
    return;
  }
  let nextReset: string | null = null;
  if (quota.recurring) {
    const reset = new Date(quota.periodStart);
    reset.setMonth(reset.getMonth() + 1);
    nextReset = reset.toISOString();
  }
  const { data: ppuRow } = await supabase.from('users').select('ppu_strategy_credits, reserved_ppu_strategy_credits').eq('id', quota.billingUserId).single();
  const ppuStrategyAvailable = Math.max(Number(ppuRow?.ppu_strategy_credits || 0) - Number(ppuRow?.reserved_ppu_strategy_credits || 0), 0);
  res.json({
    sessions_used: quota.used,
    sessions_limit: quota.limit,
    sessions_remaining: quota.remaining,
    recurring: quota.recurring,
    period_start: quota.periodStart,
    next_reset: nextReset,
    ppu_strategy_credits_available: ppuStrategyAvailable,
    can_start_session: quota.remaining > 0 || ppuStrategyAvailable > 0,
  });
});

// NEU (siehe Chat-Verlauf, Dashboard-Konsolidierung: Analysen/Strategien/Aufbau-Sessions +
// "Zuletzt aktiv" sollen zusammen im Dashboard erscheinen). Leichte, team-gescopte Liste für die
// Dashboard-Übersicht - bewusst OHNE das teils große `result`-jsonb (das braucht nur die
// Detail-Ansicht über GET /:id unten, nicht die Listen-/Kachel-Ansicht). Muss VOR der
// GET /:id-Route stehen, sonst würde Express "/sessions" als :id-Wert an die Route darunter
// durchreichen (Express matcht Routen der Reihe nach, "/:id" ist sonst ein Catch-all für jeden
// einzelnen Pfad-Abschnitt).
// WHY .in('user_id', teamIds) statt nur eq(eigene ID): Content-Strategie-Sessions sind wie
// Analysen team-weit sichtbar (siehe getTeamUserIds-Nutzung in GET /:id und GET /status/:turn_id
// weiter unten/oben) - anders als die Aufbau-Projekte (page_projects), die laut Kommentar im
// Dashboard-Script aktuell NUR user-eigen sichtbar sind, weil dort noch keine team-fähige
// Abfrage existiert.
router.get('/sessions', authenticateUser, async (req: Request, res: Response) => {
  const teamIds = await getTeamUserIds(req.authenticatedUserId as string);
  const { data, error } = await supabase
    .from('content_strategy_sessions')
    .select('id, seed_topic, domain, status, duration_seconds, created_at, updated_at')
    .in('user_id', teamIds)
    .order('updated_at', { ascending: false })
    .limit(200); // gleicher Deckel-Gedanke wie DOMAIN_FOOTPRINT_LIMIT etc. - fürs Dashboard reicht das, kein Anwendungsfall für mehr auf einmal.

  if (error) {
    res.status(500).json({ error: 'Strategie-Sessions konnten nicht geladen werden: ' + error.message });
    return;
  }
  res.json({ sessions: data || [] });
});

router.get('/:id', authenticateUser, async (req: Request, res: Response) => {
  const { data: session, error } = await supabase.from('content_strategy_sessions').select('*').eq('id', req.params.id).single();
  if (error || !session) {
    res.status(404).json({ error: 'Nicht gefunden' });
    return;
  }
  const teamIds = await getTeamUserIds(req.authenticatedUserId as string);
  if (!teamIds.includes(session.user_id)) {
    res.status(403).json({ error: 'Zugriff verweigert' });
    return;
  }
  res.json(session);
});

// ==================== PDF-EXPORT ====================
// NEU (siehe Chat-Verlauf, Lasse: "Export einbauen ... Pro/Enterprise White-Label, Pay-per-Use
// bleibt beim Convertlyze-PDF-Stil"). Rendert denselben ContentClusterResult, der ohnehin schon
// als result-jsonb gespeichert ist, über services/contentStrategyExportBuilder.js in ein PDF -
// dieselbe Puppeteer/browserPool-Infrastruktur wie der bestehende PDF-Export in routes/
// pdfExport.js (dort: pageAgent-Briefings/Landingpages), hier für den Content-Strategie-Bericht.
//
// Theme-Entscheidung (Pro/Enterprise -> white_label, alles andere -> convertlyze) läuft über
// getBillingProfile() (services/access.js) - liest license_type/Branding IMMER vom Team-Owner,
// nicht vom einzelnen Team-Mitglied, das den Export gerade auslöst (dieselbe Owner-Vererbung wie
// überall sonst in diesem Projekt).
const CONTENT_STRATEGY_EXPORT_TIMEOUT_MS = 20_000; // gleiche Größenordnung wie PDF_TIMEOUT_MS in routes/pdfExport.js
const contentStrategyExportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req: Request) => (req.authenticatedUserId as string) || req.ip || 'unknown',
  message: { error: 'Zu viele Export-Anfragen, bitte kurz warten.' },
});

router.post('/:id/export', authenticateUser, contentStrategyExportLimiter, async (req: Request, res: Response) => {
  const { data: session, error } = await supabase.from('content_strategy_sessions').select('*').eq('id', req.params.id).single();
  if (error || !session) {
    res.status(404).json({ error: 'Nicht gefunden' });
    return;
  }
  const teamIds = await getTeamUserIds(req.authenticatedUserId as string);
  if (!teamIds.includes(session.user_id)) {
    res.status(403).json({ error: 'Zugriff verweigert' });
    return;
  }

  const billing = await getBillingProfile(req.authenticatedUserId as string);
  // BUGFIX (siehe Chat-Verlauf, Lasse: "Hintergrund ist standardmäßig weiß"): weiss war NICHT
  // kaputt, sondern exakt so gebaut - Pro/Enterprise ist automatisch "white_label", SOBALD der
  // Plan stimmt, unabhängig davon, ob überhaupt schon ein eigenes Logo/eine eigene Farbe
  // hinterlegt ist. Ohne hinterlegtes Branding sieht der Export dann schlechter aus als das
  // fertig designte dunkle Convertlyze-Theme (blasses Weiß + Fallback-Blau + Convertlyze-Logo -
  // wirkt wie ein halbfertiger Export, nicht wie bewusstes White-Label). Fix: white_label erst
  // dann verwenden, wenn WIRKLICH etwas Eigenes hinterlegt ist (Logo ODER Akzentfarbe) - vorher
  // bleibt es beim ausgereiften dunklen Standard-Theme, obwohl der Account technisch schon
  // berechtigt wäre. Sobald über die neue Einstellungen-Seite (contentStrategyWhiteLabel.app.js)
  // eines von beiden gesetzt wird, kippt der Export automatisch auf White-Label um.
  const hasOwnBranding = Boolean(billing.white_label_logo_url) || Boolean(billing.white_label_accent_color);
  const theme = billing.white_label_eligible && hasOwnBranding ? 'white_label' : 'convertlyze';

  let page;
  try {
    const html = buildContentStrategyExportHTML({
      result: session.result as ContentClusterResult,
      domain: session.domain,
      theme,
      logoUrl: billing.white_label_logo_url,
      accentColor: billing.white_label_accent_color,
    });

    // <any> explizit, weil browserPool.js (wie die uebrigen .js-Service-Module hier) ohne eigene
    // Typdeklaration importiert wird - withTimeout<T> wuerde T sonst als unknown inferieren.
    const browser = await withTimeout<any>(getBrowser(), 10_000, 'Browser-Start');
    page = await browser.newPage();
    await withTimeout(page.setContent(html, { waitUntil: 'networkidle0' }), CONTENT_STRATEGY_EXPORT_TIMEOUT_MS, 'Seiten-Rendering');
    await page.emulateMediaType('print');
    const pdfBuffer = await withTimeout(
      page.pdf({ format: 'A4', printBackground: true, margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' } }),
      CONTENT_STRATEGY_EXPORT_TIMEOUT_MS,
      'PDF-Erstellung'
    );

    const timestamp = Date.now();
    const storagePath = `${session.user_id}/${session.id}/content-strategie-${timestamp}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('pdf-exports')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf' });
    if (uploadError) throw uploadError;

    const downloadFilename = `convertlyze-content-strategie-${timestamp}.pdf`;
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('pdf-exports')
      .createSignedUrl(storagePath, 60, { download: downloadFilename });
    if (signedUrlError) throw signedUrlError;

    res.json({ url: signedUrlData.signedUrl, filename: downloadFilename, theme });
  } catch (err) {
    console.error('Content-Strategie-PDF-Export fehlgeschlagen:', err);
    res.status(500).json({ error: 'PDF konnte nicht erstellt werden. Bitte erneut versuchen.' });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

const PageStatusUpdateSchema = z.object({ status: z.enum(['vorgeschlagen', 'geplant', 'in_arbeit', 'live']) });

// Für die editierbare Tabelle im Frontend: Status EINER supporting_page ändern, ohne das
// ganze Cluster-Ergebnis neu zu generieren. v1 bewusst einfach (ganzes result-jsonb lesen,
// Index patchen, zurückschreiben) statt einer normalisierten Kind-Tabelle - siehe Hinweis in
// migrations/content_strategy_sessions.sql.
router.patch('/:id/pages/:index', authenticateUser, async (req: Request, res: Response) => {
  const pageIndex = Number(req.params.index);
  const parsedBody = PageStatusUpdateSchema.safeParse(req.body);
  if (!parsedBody.success || Number.isNaN(pageIndex)) {
    res.status(400).json({ error: 'Ungültige Eingabe' });
    return;
  }

  const { data: session, error } = await supabase.from('content_strategy_sessions').select('user_id, result').eq('id', req.params.id).single();
  if (error || !session) {
    res.status(404).json({ error: 'Nicht gefunden' });
    return;
  }
  const teamIds = await getTeamUserIds(req.authenticatedUserId as string);
  if (!teamIds.includes(session.user_id)) {
    res.status(403).json({ error: 'Zugriff verweigert' });
    return;
  }

  const result = session.result as ContentClusterResult;
  if (!result.supporting_pages[pageIndex]) {
    res.status(400).json({ error: 'Seiten-Index existiert nicht' });
    return;
  }
  result.supporting_pages[pageIndex].status = parsedBody.data.status;

  const { error: updateError } = await supabase
    .from('content_strategy_sessions')
    .update({ result, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);

  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }
  res.json({ success: true, result });
});

// ==================== REPORT-CHAT: HINTERGRUND-VERARBEITUNG + ENDPUNKTE ====================

async function runContentStrategyChatInBackground(params: {
  turnId: string;
  sessionId: string;
  billingUserId: string;
  seedTopic: string;
  domain: string | undefined;
  result: ContentClusterResult;
  history: Anthropic.MessageParam[];
  userMessage: string;
  messagesUsedBefore: number;
}): Promise<void> {
  const { turnId, sessionId, billingUserId, seedTopic, domain, result, history, userMessage, messagesUsedBefore } = params;
  try {
    const reply = await withTimeout(
      runContentStrategyChatLoop(seedTopic, domain, result, billingUserId, history, userMessage),
      CHAT_TURN_TIMEOUT_MS,
      'Report-Chat-Antwort'
    );

    // Frage UND Antwort werden erst NACH erfolgreicher Generierung gemeinsam persistiert - schlägt
    // die Antwort fehl (Timeout/Fehler), landet nichts in der Tabelle und der Versuch zählt NICHT
    // gegen MAX_CHAT_MESSAGES_PER_SESSION. Gleicher Gedanke wie releaseFunding bei einem
    // fehlgeschlagenen Report-Lauf: ein interner Fehler soll nicht zulasten des User-Kontingents
    // gehen.
    const { error: insertError } = await supabase.from('content_strategy_chat_messages').insert([
      { session_id: sessionId, role: 'user', content: userMessage },
      { session_id: sessionId, role: 'assistant', content: reply },
    ]);
    if (insertError) throw new Error(insertError.message);

    finishContentStrategyChatTurnJob(turnId, {
      status: 'done',
      result: { reply, messages_used: messagesUsedBefore + 1, messages_limit: MAX_CHAT_MESSAGES_PER_SESSION },
    });
  } catch (err) {
    console.warn('content-strategy chat background job error:', (err as Error).message);
    finishContentStrategyChatTurnJob(turnId, { status: 'error', error: (err as Error).message });
  }
}

const ChatMessageInputSchema = z.object({ message: z.string().min(1).max(2000) });

// Startet EINEN Chat-Turn asynchron (siehe Begründung bei den Turn-Jobs oben) - Antwort per
// GET /chat/status/:turn_id abholen, exakt analog zu POST /generate + GET /status/:turn_id.
router.post('/:id/chat', authenticateUser, authorizeUser, async (req: Request, res: Response) => {
  const parsedBody = ChatMessageInputSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: 'Ungültige Eingabe: ' + formatZodError(parsedBody.error) });
    return;
  }

  const { data: session, error: sessionError } = await supabase
    .from('content_strategy_sessions')
    .select('id, user_id, seed_topic, domain, status, result, billing_user_id')
    .eq('id', req.params.id)
    .single();
  if (sessionError || !session) {
    res.status(404).json({ error: 'Nicht gefunden' });
    return;
  }
  // GEÄNDERT (siehe Chat-Verlauf, Lasse: "nur derjenige, der die Struktur erstellt hat, sollte
  // chatten können, damit Nachrichten nicht mehrfach verbraucht werden") - bewusst NICHT der
  // teamweite getTeamUserIds-Check wie bei GET /:id (der Report selbst bleibt teamweit sichtbar,
  // NUR der Chat ist auf den Ersteller beschränkt). Exakter Vergleich statt Team-Zugehörigkeit,
  // weil das gemeinsame MAX_CHAT_MESSAGES_PER_SESSION-Kontingent sonst von mehreren
  // Team-Mitgliedern gleichzeitig verbraucht werden könnte, ohne dass die anderen das mitbekommen.
  if (session.user_id !== req.authenticatedUserId) {
    res.status(403).json({ error: 'Nur der Ersteller dieser Strategie kann den Chat dazu nutzen.' });
    return;
  }
  if (session.status !== 'done' || !session.result) {
    res.status(409).json({ error: 'Diese Strategie ist noch nicht fertig oder fehlgeschlagen - Chat ist erst nach Fertigstellung möglich.' });
    return;
  }

  const { count, error: countError } = await supabase
    .from('content_strategy_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('role', 'user');
  if (countError) {
    res.status(500).json({ error: 'Nachrichten-Zähler konnte nicht geladen werden: ' + countError.message });
    return;
  }
  const messagesUsed = count || 0;
  if (messagesUsed >= MAX_CHAT_MESSAGES_PER_SESSION) {
    res.status(402).json({
      error: 'Frage-Kontingent für diesen Report erreicht.',
      messages_used: messagesUsed,
      messages_limit: MAX_CHAT_MESSAGES_PER_SESSION,
    });
    return;
  }

  const { data: historyRows, error: historyError } = await supabase
    .from('content_strategy_chat_messages')
    .select('role, content')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true });
  if (historyError) {
    res.status(500).json({ error: 'Chat-Verlauf konnte nicht geladen werden: ' + historyError.message });
    return;
  }
  const history: Anthropic.MessageParam[] = (historyRows || []).map((r: any) => ({ role: r.role as 'user' | 'assistant', content: r.content as string }));

  const turnId = createContentStrategyChatTurnJob(req.authenticatedUserId as string);
  // billing_user_id kann bei sehr alten Sessions (vor content_strategy_sessions_recovery.sql)
  // fehlen - Fallback auf user_id, exakt wie schon bei toolAnalyzeDomainFootprint an anderer
  // Stelle nötig (GSC-Verbindung ist an den billing_user_id geknüpft).
  runContentStrategyChatInBackground({
    turnId,
    sessionId: session.id,
    billingUserId: session.billing_user_id || session.user_id,
    seedTopic: session.seed_topic,
    domain: session.domain || undefined,
    result: session.result as ContentClusterResult,
    history,
    userMessage: parsedBody.data.message,
    messagesUsedBefore: messagesUsed,
  });

  res.status(202).json({ turn_id: turnId, status: 'processing' });
});

// Polling-Endpunkt fürs Frontend, exakt analog zu GET /status/:turn_id oben.
router.get('/chat/status/:turn_id', authenticateUser, async (req: Request, res: Response) => {
  const turn_id = req.params.turn_id as string;
  const job = contentStrategyChatTurnJobs.get(turn_id);
  if (!job) {
    res.status(404).json({ error: 'Die Verarbeitung wurde unterbrochen (z.B. durch einen Server-Neustart) oder ist abgelaufen.', code: 'turn_lost' });
    return;
  }
  // GEÄNDERT: exakter Vergleich statt getTeamUserIds - siehe Kommentar bei POST /:id/chat, der
  // Chat-Turn selbst kann nur vom Ersteller gestartet worden sein (dort schon geprüft), diese
  // zweite Prüfung ist die Verteidigungslinie beim Abholen des Ergebnisses.
  if (job.startedByUserId !== req.authenticatedUserId) {
    res.status(403).json({ error: 'Kein Zugriff auf diesen Turn' });
    return;
  }
  if (job.status === 'processing') {
    res.json({ status: 'processing' });
    return;
  }
  if (job.status === 'error') {
    contentStrategyChatTurnJobs.delete(turn_id);
    res.status(502).json({ status: 'error', error: job.error });
    return;
  }
  contentStrategyChatTurnJobs.delete(turn_id);
  res.json({ status: 'done', ...job.result });
});

// Lädt den bisherigen Chat-Verlauf (z.B. beim Öffnen eines schon einmal befragten Reports) -
// getrennt von GET /:id, damit die (potenziell große) result-jsonb nicht bei jedem Chat-Öffnen
// nochmal mitgeschickt werden muss.
router.get('/:id/chat', authenticateUser, async (req: Request, res: Response) => {
  const { data: session, error } = await supabase.from('content_strategy_sessions').select('id, user_id').eq('id', req.params.id).single();
  if (error || !session) {
    res.status(404).json({ error: 'Nicht gefunden' });
    return;
  }
  // GEÄNDERT: exakter Vergleich statt getTeamUserIds - siehe Kommentar bei POST /:id/chat.
  if (session.user_id !== req.authenticatedUserId) {
    res.status(403).json({ error: 'Nur der Ersteller dieser Strategie kann den Chat dazu nutzen.' });
    return;
  }
  const { data: messages, error: messagesError } = await supabase
    .from('content_strategy_chat_messages')
    .select('role, content, created_at')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true });
  if (messagesError) {
    res.status(500).json({ error: messagesError.message });
    return;
  }
  const messagesUsed = (messages || []).filter((m: any) => m.role === 'user').length;
  res.json({ messages: messages || [], messages_used: messagesUsed, messages_limit: MAX_CHAT_MESSAGES_PER_SESSION });
});

// NEU (siehe Chat-Verlauf, Property-Auswahl beim GSC-Connect): serverseitige Prüfung, ob ein
// User eine neue Content-Strategie-Session starten könnte - wiederverwendet von routes/
// googleIntegration.ts GET /connect, damit ein User ohne Plan-Kontingent nicht per direktem
// API-Call (unter Umgehung der Frontend-Sperre) trotzdem eine GSC-Verbindung anlegen kann.
async function canStartContentStrategySession(userId: string): Promise<boolean> {
  const quota = await getOrResetContentStrategyQuota(userId);
  if (!quota) return false;
  const { data: ppuRow } = await supabase
    .from('users')
    .select('ppu_strategy_credits, reserved_ppu_strategy_credits')
    .eq('id', quota.billingUserId)
    .single();
  const ppuStrategyAvailable = Math.max(Number(ppuRow?.ppu_strategy_credits || 0) - Number(ppuRow?.reserved_ppu_strategy_credits || 0), 0);
  return quota.remaining > 0 || ppuStrategyAvailable > 0;
}

// Für Tests/Wiederverwendung erreichbar machen, ohne einen zweiten `export`-Weg zu öffnen
// (siehe Hinweis bei der Funktionsdefinition oben) - exakt das Muster aus pageAgent.ts.
(router as any).runContentStrategyLoop = runContentStrategyLoop;
(router as any).canStartContentStrategySession = canStartContentStrategySession;

// `export =` statt `export default`, damit server.js es per CommonJS `require(...)` ohne
// `.default` bekommt - gleiche Konvention wie routes/pageAgent.ts (siehe dortiger Kommentar
// am Dateiende: `export default` und `export =` vertragen sich in TS nicht miteinander).
export = router;
