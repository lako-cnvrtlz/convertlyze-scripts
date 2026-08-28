// routes/contentStrategyAgent.schemas.ts
//
// Zod-Schemas für den neuen, eigenständigen Content-Strategie-Agenten (Cluster aus
// Conversion-Seite + unterstützenden Seiten, Domain-Gap-Check, GEO/LLM-Zitations-Layer).
// Gleiches Muster wie routes/pageAgent.schemas.ts: EIN Satz Schemas für Laufzeit-Validierung,
// TypeScript-Typen (z.infer) und das input_schema, das Claude als Tool-Vertrag sieht.
//
// BEWUSST ENTKOPPELT von pageAgent.schemas.ts: kein gemeinsames Brief-Schema, keine
// gemeinsame Sektionsstruktur - dieser Agent bekommt ein Thema/Keyword rein und liefert
// eine Cluster-Strategie raus, kein Landingpage-Briefing. Die einzige Berührung mit
// pageAgent: page_type 'conversion_landingpage' ist der einzige Typ, der später eine
// "Jetzt bauen"-Aktion Richtung pageAgent bekommt (siehe Chat-Verlauf) - alle anderen
// Typen haben noch keinen Builder.

import { z } from 'zod';
import { toInputSchema, formatZodError } from './pageAgent.schemas';

export { toInputSchema, formatZodError };

// ==================== TOOL: analyze_topic (Suchvolumen + PAA + Intent) ====================
export const AnalyzeTopicInputSchema = z.object({
  keyword: z.string().min(1).describe('Ziel-Thema/Haupt-Keyword, um das sich der Cluster aufbaut.'),
  country: z.string().optional().describe("z.B. 'de', 'at', 'ch'. Default 'de'."),
});
export type AnalyzeTopicInput = z.infer<typeof AnalyzeTopicInputSchema>;

// ==================== TOOL: analyze_domain_footprint (Gap-Check gegen eigene Domain) ====================
export const AnalyzeDomainFootprintInputSchema = z.object({
  domain: z.string().min(1).describe("Eigene Domain OHNE https:// und www., z.B. 'convertlyze.com'."),
  candidate_topics: z.array(z.string().min(1)).min(1).describe(
    'Themen-/Keyword-Kandidaten aus analyze_topic, gegen die die eigene Domain auf bereits vorhandene Abdeckung geprüft werden soll.'
  ),
  country: z.string().optional(),
});
export type AnalyzeDomainFootprintInput = z.infer<typeof AnalyzeDomainFootprintInputSchema>;

// ==================== TOOL: analyze_geo_visibility (Portale + optionaler Prompt-Test) ====================
export const AnalyzeGeoVisibilityInputSchema = z.object({
  keyword: z.string().min(1).describe('Kern-Thema des Clusters, für das geprüft wird, welche Domains/Seiten in LLM-Antworten dazu zitiert werden.'),
  // GEÄNDERT (siehe Chat-Verlauf, Live-Fehler "geo_strategy: Invalid input: expected object,
  // received undefined"): war vorher ein PFLICHTfeld, obwohl der User beim Formular-Start gar
  // keine Domain angeben muss (siehe domainInput in contentStrategyAgent.app.js, optional) und
  // der System-Prompt analyze_geo_visibility trotzdem UNBEDINGT für jedes Thema aufrufen lässt,
  // unabhängig von einer Domain. Diagnose: ohne Domain konnte Claude dieses Pflichtfeld nicht
  // sauber befüllen, hat das Tool vermutlich deshalb nie erfolgreich aufgerufen und ist am Ende
  // ohne jede geo_strategy-Grundlage bei generate_content_cluster gelandet - bis
  // MAX_TOOL_CALLS erschöpft war (siehe Kommentar bei runContentStrategyLoop). own_domain ist
  // jetzt optional, exakt wie schon bei analyze_domain_footprint/AnalyzeDomainFootprintInputSchema.
  own_domain: z.string().min(1).optional().describe(
    "Eigene Domain OHNE https:// und www., um zu prüfen, ob sie selbst schon zitiert wird. Weglassen, wenn der " +
    "User keine Domain angegeben hat - die restliche GEO-Analyse (Portale/AI-Overview/Wettbewerber) läuft dann " +
    "trotzdem ganz normal, nur own_domain_already_cited wird dann false."
  ),
  run_prompt_test: z.boolean().optional().describe(
    'Ob zusätzlich zur Portale-Analyse (immer inklusive) auch echte Prompts gegen ein LLM getestet werden sollen. ' +
    'Standardmäßig true (Normalfall) - ob der Test tatsächlich ausgeführt wird, entscheidet ausschließlich der ' +
    'Server (siehe allowPromptTest in contentStrategyAgent.ts), niemals dieser Wert allein. Hart gedeckelt auf ' +
    'MAX_GEO_TEST_PROMPTS Prompts, ein günstiges Modell.'
  ),
});
export type AnalyzeGeoVisibilityInput = z.infer<typeof AnalyzeGeoVisibilityInputSchema>;

// ==================== ERGEBNIS-FORM: ContentClusterResult ====================
// Das ist die STRUKTUR, die der Agent am Ende als generate_content_cluster-Tool-Aufruf
// liefert - Analogie zu generate_page_structure in pageAgent.schemas.ts.

export const ClusterPageTypeSchema = z.enum([
  'conversion_landingpage', // einziger Typ mit Builder-Anbindung heute (pageAgent)
  'comparison',
  'pricing_roi',
  'calculator_tool',
  'template_download',
  'use_case',
  'review',
  'integration',
  'topic_coverage', // reine informationelle Themenseite, PAA-getrieben
  // NEU (siehe Chat-Verlauf, Lasse: "auch Typen wie Pillar Pages vorschlagen, wenn sinnvoll, und
  // erklären"): breite Themen-Hub-Seite, die mehrere verwandte supporting_pages bündelt und zu
  // ihnen verlinkt - anders als "topic_coverage" (eine einzelne, eng gefasste Informationsseite)
  // bewusst breit angelegt und als zentrale interne Verlinkungs-Drehscheibe gedacht. Wann das
  // sinnvoll ist und wie es zu erklären ist, steht im System-Prompt (buildSystemPrompt), nicht
  // hier - das Schema kennt nur die erlaubten Werte, keine Auswahlkriterien.
  'pillar_page',
]);
export type ClusterPageType = z.infer<typeof ClusterPageTypeSchema>;

export const ClusterPageRoleSchema = z.enum(['coverage', 'citation', 'existing']);
export type ClusterPageRole = z.infer<typeof ClusterPageRoleSchema>;

// NEU (siehe Chat-Verlauf, Lasse: "Phasen des Messy Middle reinbringen ... um eine volle
// Abdeckung zu gewährleisten"): eigenständige dritte Klassifizierung NEBEN page_type (Format)
// und role (SEO-/GEO-Funktion) - bildet ab, WELCHEN Schritt in Googles "Messy Middle"-Modell
// (Exploration ⇄ Evaluation, gerahmt von Trigger/Entscheidung) diese Seite im Cluster bedient.
// BEWUSST ein eigenes Pflichtfeld statt client-seitig aus page_type abgeleitet: page_type
// bestimmt das FORMAT (z.B. "comparison"), sagt aber nicht zuverlässig, ob eine Seite in DIESEM
// Cluster eher der Explorations- oder der Evaluations-Phase dient - das hängt vom jeweiligen
// Thema ab. Ein eigenes Feld zwingt das Modell, das für jede Seite bewusst einzuschätzen, statt
// dass das Frontend eine Vermutung anhand des Formats rät. Praxis-Adaption mit 3 Stufen statt
// des vollen 6-Heuristiken-Modells aus Googles Originalpapier - bewusst so vereinfacht, damit es
// tatsächlich als Planungs- und Vollständigkeits-Check nutzbar ist (siehe superRefine bei
// ContentClusterResultSchema weiter unten, das mind. eine "exploration"- UND eine
// "evaluation"-Seite erzwingt).
export const MessyMiddlePhaseSchema = z.enum(['exploration', 'evaluation', 'decision']);
export type MessyMiddlePhase = z.infer<typeof MessyMiddlePhaseSchema>;

export const ClusterPageStatusSchema = z.enum(['vorgeschlagen', 'geplant', 'in_arbeit', 'live']);
export type ClusterPageStatus = z.infer<typeof ClusterPageStatusSchema>;

export const ExistingCoverageSchema = z.object({
  url: z.string().min(1),
  position: z.number().int().min(1).max(100),
});
export type ExistingCoverage = z.infer<typeof ExistingCoverageSchema>;

// NEU (siehe Chat-Verlauf, Lasse: "genau nennen, was auf der Seite zu sehen sein soll" +
// "Commodity Content identifizieren, der sich langfristig evtl. nicht mehr lohnt, weil aus
// LLM-Trainingsdaten abrufbar") - zwei eigene Felder statt das in die bestehende `reasoning`
// hineinzuschreiben, damit das Frontend beides unterschiedlich darstellen kann (Brief als
// Stichpunkt-Liste, Commodity als Warn-Badge) statt aus Fließtext parsen zu müssen.
export const ContentBriefSchema = z
  .array(z.string().min(1))
  .min(2)
  .max(6)
  .describe(
    'Konkrete, umsetzbare Stichpunkte, was auf DIESER Seite stehen muss (Abschnitte/Elemente, keine fertigen Sätze) - ' +
      'z.B. "Vergleichstabelle mit mind. 5 Kriterien", "Rechenbeispiel mit echten Zahlen", "FAQ-Block mit den 3 häufigsten Einwänden". ' +
      'Muss sich auf die tatsächlichen Tool-Ergebnisse stützen (PAA-Fragen, AI-Overview-Referenzen, Wettbewerber-Struktur-Analyse), nicht generisch sein.'
  );
export type ContentBrief = z.infer<typeof ContentBriefSchema>;

export const ClusterSupportingPageSchema = z.object({
  page_type: ClusterPageTypeSchema,
  topic: z.string().min(1).describe('Kurzer, konkreter Arbeitstitel der Seite, keine fertige Headline.'),
  keyword: z.string().min(1),
  estimated_volume: z.number().int().min(0).nullable(),
  role: ClusterPageRoleSchema,
  messy_middle_phase: MessyMiddlePhaseSchema.describe(
    'Welchen Schritt im "Messy Middle" (Google-Modell: Exploration ⇄ Evaluation, gerahmt von Trigger/Entscheidung) diese Seite ' +
      'für DIESES Thema bedient: "exploration" = schafft Breite/Bewusstsein, beantwortet noch offene Grundlagenfragen; ' +
      '"evaluation" = hilft beim Eingrenzen/Vergleichen (Vergleich, Preis, ROI, Referenzen); "decision" = unmittelbar vor der ' +
      'Kaufentscheidung (z.B. Preis-/Buchungs-nahe Seite, die nicht selbst die conversion_page ist). Nicht automatisch vom ' +
      'page_type ableiten, sondern für dieses konkrete Thema einschätzen.'
  ),
  existing_coverage: ExistingCoverageSchema.optional().describe('Nur bei role "existing" - welche eigene URL dafür bereits rankt.'),
  status: ClusterPageStatusSchema.default('vorgeschlagen'),
  reasoning: z.string().min(1).describe('Ein bis zwei Sätze, warum genau dieser Seitentyp zu diesem Suchbegriff passt.'),
  content_brief: ContentBriefSchema,
  commodity_risk: z.boolean().describe(
    'true, wenn dieses Thema aus LLM-Trainingsdaten/einem AI-Overview-Snippet ohne Klick auf eine Quelle vollständig beantwortbar wirkt ' +
      '(reine Definitions-/"was ist"-Fragen ohne Tabellen/Rechner/Vergleich) - Signal, dass sich langfristige Investition hier eher NICHT lohnt.'
  ),
  commodity_reasoning: z.string().optional().describe('Nur bei commodity_risk=true: ein Satz, worauf sich die Einschätzung stützt (z.B. AI-Overview ohne Quellen-Link zu genau diesem Thema).'),
})
  // GEFIXT (siehe Chat-Verlauf, "ist alles immer mit Begründung?"): commodity_reasoning war bis
  // hierhin nur per Textbeschreibung an "nur bei commodity_risk=true" gebunden, im Zod-Schema
  // selbst aber uneingeschränkt optional - Claude hätte also eine Warn-Badge ohne jede Begründung
  // liefern können, ohne dass die Validierung das je bemerkt hätte. superRefine erzwingt das jetzt
  // tatsächlich: commodity_risk=true OHNE commodity_reasoning lässt generate_content_cluster mit
  // einem Zod-Fehler scheitern (Loop fordert dann automatisch eine korrigierte Version an, siehe
  // runContentStrategyLoop).
  .superRefine((page, ctx) => {
    if (page.commodity_risk && !page.commodity_reasoning) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['commodity_reasoning'],
        message: 'commodity_reasoning ist Pflicht, wenn commodity_risk=true ist - eine Warnung ohne Begründung ist nicht zulässig.',
      });
    }
  });
export type ClusterSupportingPage = z.infer<typeof ClusterSupportingPageSchema>;

export const InternalLinkSuggestionSchema = z.object({
  from_index: z.number().int().min(-1).describe('Index in supporting_pages, oder -1 für die conversion_page als Quelle.'),
  to_index: z.number().int().min(-1).describe('Index in supporting_pages, oder -1 für die conversion_page als Ziel.'),
  anchor_text_idea: z.string().min(1),
  reason: z.string().min(1),
});
export type InternalLinkSuggestion = z.infer<typeof InternalLinkSuggestionSchema>;

export const GeoPortalSchema = z.object({
  domain: z.string().min(1),
  mention_count: z.number().int().min(0),
  example_url: z.string().optional(),
  note: z.string().optional().describe('Kurze Einordnung, z.B. "Bewertungsportal", "Branchen-Wiki", "Forum".'),
});
export type GeoPortal = z.infer<typeof GeoPortalSchema>;

export const GeoPromptTestResultSchema = z.object({
  prompt: z.string().min(1),
  llm_type: z.string().min(1),
  // Optional statt Pflichtfeld (siehe Chat-Verlauf, "Prompt pro Messy-Middle-Phase"): der
  // eigentliche Wert dieses Felds kommt aus dem serverseitigen Prompt-Test-Lauf selbst (siehe
  // toolAnalyzeGeoVisibility/GEO_TEST_PROMPT_TEMPLATES in routes/contentStrategyAgent.ts), der
  // die Phase bereits FEST vorgibt und das Feld nach dem Agent-Lauf ohnehin überschreibt -
  // Pflicht hier hieße nur, dass eine ungenaue/vergessene Modell-Abschrift dieses einen Felds
  // unnötig den kompletten generate_content_cluster-Aufruf scheitern lassen könnte.
  messy_middle_phase: MessyMiddlePhaseSchema.optional(),
  own_domain_cited: z.boolean(),
  cited_domains: z.array(z.string()),
  answerable_from_training_data: z.boolean().describe(
    'Heuristische Einschätzung: kam die Antwort ohne Quellenangabe/Websuche aus (eher ja) oder hat das Modell ' +
    'sichtbar auf externe Quellen zurückgegriffen (eher nein, = Zitier-Chance).'
  ),
});
export type GeoPromptTestResult = z.infer<typeof GeoPromptTestResultSchema>;

// NEU (siehe Chat-Verlauf): echte Google-SERP-Daten aus services/contentStrategyAiOverview.ts -
// eigenständig neben top_portals (DataForSEOs llm_mentions-Aggregat, ChatGPT-only, siehe Hinweis
// dort), weil beide unterschiedliche, sich ergänzende Signale liefern (Google AI Overview selbst
// vs. allgemeine LLM-Erwähnungs-Statistik). Bewusst NICHT top_portals ersetzt, um bestehende
// Sessions/Frontend-Konsumenten dieses Felds nicht zu brechen.
export const TopSerpResultSchema = z.object({
  position: z.number().int().min(1),
  url: z.string().min(1),
  domain: z.string().min(1),
  title: z.string(),
});
export type TopSerpResult = z.infer<typeof TopSerpResultSchema>;

export const AiOverviewReferenceSchema = z.object({
  domain: z.string().min(1),
  url: z.string().min(1),
  title: z.string().optional(),
  text_snippet: z.string().optional(),
});
export type AiOverviewReference = z.infer<typeof AiOverviewReferenceSchema>;

export const AiOverviewSchema = z.object({
  present: z.boolean().describe('Ob Google für dieses Keyword überhaupt ein AI Overview anzeigt.'),
  own_domain_cited: z.boolean(),
  references: z.array(AiOverviewReferenceSchema).describe('Quellen MIT LINK, die das AI Overview tatsächlich zitiert - leer, wenn kein AI Overview vorhanden ist oder es ohne Quellenangabe antwortet (= Commodity-Signal).'),
});
export type AiOverview = z.infer<typeof AiOverviewSchema>;

export const CompetitorContentNoteSchema = z.object({
  domain: z.string().min(1),
  url: z.string().min(1),
  structure_summary: z.string().min(1).describe('Ein Satz zur tatsächlichen Struktur, z.B. "Vergleichstabelle mit 8 Anbietern, ca. 2.100 Wörter, kein FAQ-Block" - keine allgemeine Qualitätsaussage.'),
});
export type CompetitorContentNote = z.infer<typeof CompetitorContentNoteSchema>;

export const GeoStrategySchema = z.object({
  top_portals: z.array(GeoPortalSchema).describe('Aus llm_mentions/top_domains - wo das Thema in LLM-Antworten schon präsent ist.'),
  own_domain_already_cited: z.boolean(),
  prompt_tests: z.array(GeoPromptTestResultSchema).optional().describe(
    'Nur vorhanden, wenn run_prompt_test angefordert wurde. Übernimm die Prompt-Test-Zeilen aus dem ' +
    'analyze_geo_visibility-Ergebnis 1:1 (Prompt, zitierte Domains, Messy-Middle-Phase je Zeile) - erfinde keine ' +
    'zusätzlichen Prompts und lasse keine der gelieferten Zeilen weg. Wird serverseitig zusätzlich anhand der ' +
    'echten Testdaten überschrieben, deine Abschrift ist also nur eine Zwischenstufe, keine unabhängige Quelle.'
  ),
  top_serp_results: z.array(TopSerpResultSchema).describe('Top organische Google-Ergebnisse für das Kern-Thema, aus demselben Call wie ai_overview.'),
  ai_overview: AiOverviewSchema,
  competitor_content_notes: z.array(CompetitorContentNoteSchema).max(3).describe('Struktur-Analyse der (max. 3) Top-Wettbewerber-Seiten - was sie konkret enthalten, nicht nur dass sie ranken.'),
  citation_strategy_note: z.string().min(1).describe(
    'Konkrete, auf die obigen Daten gestützte Aussage: WELCHE Art Content hat für dieses Thema hohe Zitier-Chancen (Struktur/Format), ' +
      'und was machen Wettbewerber bereits in diese Richtung. Keine generische GEO-Floskel ohne Bezug zu top_serp_results/ai_overview/competitor_content_notes.'
  ),
});
export type GeoStrategy = z.infer<typeof GeoStrategySchema>;

// NEU (siehe Chat-Verlauf, "Ist-Zustand": welche Seiten ranken schon wie). Eigenes Schema statt
// nur ein Array, weil "source" mit ausgeliefert werden muss - Frontend/Nutzer müssen erkennen
// können, ob es echte Search-Console-Zahlen sind oder eine DataForSEO-Schätzung ohne echte
// CTR-Daten (siehe Chat-Herleitung, warum das nicht wie ein Fakt aussehen darf).
export const CurrentStateSourceSchema = z.enum(['google_search_console', 'dataforseo_estimate', 'none']);
export type CurrentStateSource = z.infer<typeof CurrentStateSourceSchema>;

export const CurrentStateRowSchema = z.object({
  page_url: z.string().min(1),
  query: z.string().min(1),
  avg_position: z.number().min(0).nullable(),
  ctr: z.number().min(0).max(1).nullable().describe('Als Anteil (0.034 = 3,4%), nicht als Prozent-Zahl. null, wenn nicht verfügbar (dataforseo_estimate liefert keine echte CTR).'),
  impressions: z.number().int().min(0).nullable(),
  clicks: z.number().int().min(0).nullable(),
});
export type CurrentStateRow = z.infer<typeof CurrentStateRowSchema>;

export const CurrentStateSchema = z.object({
  source: CurrentStateSourceSchema,
  rows: z.array(CurrentStateRowSchema),
  note: z.string().min(1).describe('Kurzer Klartext-Hinweis zur Datenqualität, z.B. "Echte Search-Console-Daten, letzte 90 Tage" oder "Keine Search-Console-Verbindung - Positionen geschätzt (DataForSEO-Index), keine echten Klick-/CTR-Daten verfügbar".'),
});
export type CurrentState = z.infer<typeof CurrentStateSchema>;

export const ConversionPageSchema = z.object({
  topic: z.string().min(1),
  keyword: z.string().min(1),
  estimated_volume: z.number().int().min(0).nullable(),
  content_brief: ContentBriefSchema,
});
export type ConversionPage = z.infer<typeof ConversionPageSchema>;

// NEU (siehe Chat-Verlauf, Lasse: "Empfohlene Roadmap ... so wie wir es in der Analyse machen,
// nur mit weniger Inhalt") - dieselbe Aufwand/Impact-Quadranten-Logik wie roadmap_matrix im
// Analyse-Tool (sofort_umsetzen/quick_wins/als_naechstes/spaeter), aber bewusst stark
// verschlankt: keine eigenen effort/impact/category/cross_category-Felder pro Punkt (die
// Bucket-Zugehörigkeit selbst codiert das schon) und kein neuer Tool-Aufruf nötig (reine
// Synthese der bereits im Report vorhandenen Befunde aus current_state/supporting_pages/
// geo_strategy). Arrays bewusst mit .max(2) gedeckelt statt mit .min() erzwungen - ein leeres
// Bucket ist erlaubt (z.B. "spaeter" bleibt bei einem kleinen Cluster manchmal leer), und die
// Obergrenze hält diesen neuen Abschnitt klein, damit er das ohnehin schon knappe
// max_tokens-Budget von generate_content_cluster nicht wieder Richtung Truncation treibt (siehe
// Chat-Verlauf zum max_tokens-Bug).
export const RoadmapItemSchema = z.object({
  titel: z.string().min(1).describe(
    'Kurzer, konkreter Aktionstitel (max. ca. 8-10 Wörter), z.B. "Pillar-Page Angebotsvergleich zuerst bauen" oder ' +
      '"FAQ-Schema für GEO-Sichtbarkeit ergänzen" - kein ganzer Satz, keine Wiederholung von reasoning-Texten aus supporting_pages.'
  ),
  begruendung: z.string().min(1).describe(
    'GENAU EIN Satz, warum das jetzt priorisiert werden sollte - bezieht sich auf einen bereits an anderer Stelle im Report ' +
      'genannten Befund (Ist-Zustand, Cluster, GEO). Keine neue Analyse und keine Wiederholung der Executive Summary.'
  ),
});
export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;

export const ContentRoadmapSchema = z.object({
  sofort_umsetzen: z.array(RoadmapItemSchema).max(2).describe('Hoher Impact, geringer Aufwand - jetzt sofort angehen.'),
  quick_wins: z.array(RoadmapItemSchema).max(2).describe('Geringer Aufwand, aber nur mittlerer Impact - schnell nebenbei erledigen.'),
  als_naechstes: z.array(RoadmapItemSchema).max(2).describe('Hoher Impact, aber höherer Aufwand - als Nächstes einplanen.'),
  spaeter: z.array(RoadmapItemSchema).max(2).describe('Geringerer Impact oder von den Schritten oben abhängig - später angehen.'),
});
export type ContentRoadmap = z.infer<typeof ContentRoadmapSchema>;

// NEU (siehe Chat-Verlauf, "richtiger Bericht": Ausgangslage → Executive Summary → Rest).
// Bewusst als von CLAUDE GESCHRIEBENER Fließtext im Schema, nicht erst clientseitig aus den
// anderen Feldern zusammengebaut: (1) eine gute Ausgangslage/Executive Summary ist Synthese-
// Arbeit, die das Modell mit vollem Tool-Kontext leisten kann, ein Frontend-Zusammenbau aus
// Einzelfeldern kann das nicht; (2) dieselbe Textquelle wird später für den geplanten
// Word-Export gebraucht (siehe Chat-Verlauf: Agenturen sollen die ganze Strategie
// herunterladen und verändern können) - wenn der Fließtext schon jetzt strukturiert im
// gespeicherten result-JSON steht, kann ein späterer Export-Endpunkt ihn 1:1 in ein .docx
// übernehmen, statt die Synthese-Logik ein zweites Mal (in der Export-Pipeline) nachzubauen.
export const ContentClusterResultSchema = z.object({
  seed_topic: z.string().min(1),
  ausgangslage: z.string().min(1).describe(
    'Berichts-Abschnitt "Ausgangslage": 3-5 Sätze Fließtext, WO die Domain/das Thema heute steht - gestützt auf current_state ' +
      '(vorhandene Rankings/Sichtbarkeit) und den Domain-Footprint-Check. Bei fehlender Domain/GSC-Verbindung ehrlich benennen, ' +
      'dass es sich um eine Einschätzung ohne eigene Bestandsdaten handelt. Kein generisches "Der Markt für X wächst"-Geschwurbel.'
  ),
  // GEÄNDERT (siehe Chat-Verlauf, Lasse: "Stärken, Schwächen, Wettbewerb, Chancen
  // herausgearbeitet"): von 4 freien Stichpunkten zu einer SWOT-artigen Struktur verschärft,
  // inkl. der Nuance, dass eine einzelne Seite gegen starke Wettbewerber ehrlich wenig
  // Ranking-Chancen haben kann, für das Cluster als Ganzes (interne Verlinkung/Trust/
  // Themenautorität) aber trotzdem sinnvoll sein kann - das soll NICHT verschwiegen werden.
  executive_summary: z.string().min(1).describe(
    'Berichts-Abschnitt "Executive Summary": Fließtext, der explizit auf Stärken, Schwächen, Wettbewerb und Chancen eingeht ' +
      '(SWOT-artig, aber als zusammenhängender Text, keine Stichpunkt-Liste) - jeweils 1-2 Sätze pro Aspekt, mit konkreten Zahlen/' +
      'Befunden aus den Tool-Ergebnissen (Suchvolumen, Positionen, Zitier-Chancen), keine austauschbare Berater-Prosa: ' +
      'Stärken = was die eigene Domain laut current_state bereits mitbringt (oder ehrlich: noch nichts, falls current_state.source ' +
      '"none" ist); Schwächen = Lücken/Commodity-Anteil im vorgeschlagenen Cluster; Wettbewerb = was laut competitor_content_notes/' +
      'top_serp_results die stärksten Wettbewerber bereits besser machen; Chancen = die konkrete größte, noch unbesetzte Chance ' +
      '(z.B. eine AI-Overview-Zitation ohne Konkurrenz oder eine Ranking-Lücke mit hohem Volumen). Wenn für einzelne stark umkämpfte ' +
      'supporting_pages ehrlicherweise nur geringe Ranking-Chancen gegen etablierte Wettbewerber bestehen, das offen benennen - ABER ' +
      'gleichzeitig einordnen, ob die Seite trotzdem sinnvoll bleibt (interne Verlinkung zur conversion_page, Trust-/Themenautorität-' +
      'Aufbau, Grundlage für spätere GEO-Zitate), statt sie einfach nur als aussichtslos abzutun.'
  ),
  conversion_page: ConversionPageSchema,
  supporting_pages: z.array(ClusterSupportingPageSchema).min(1).max(8),
  internal_links: z.array(InternalLinkSuggestionSchema),
  current_state: CurrentStateSchema,
  geo_strategy: GeoStrategySchema,
  roadmap: ContentRoadmapSchema.describe(
    'Letzter Berichts-Abschnitt "Empfohlene Roadmap" - priorisierte Verdichtung der wichtigsten nächsten Schritte aus dem ' +
      'GESAMTEN Report (Ist-Zustand, Cluster, GEO), sortiert in dieselben 4 Aufwand/Impact-Quadranten wie im Analyse-Tool. ' +
      'Insgesamt maximal ca. 6-8 Punkte über alle vier Buckets - KEINE neuen Erkenntnisse, nur eine priorisierte ' +
      'Zusammenfassung des bereits an anderer Stelle im Report Gesagten.'
  ),
})
  // NEU (siehe Chat-Verlauf, "volle Abdeckung gewährleisten"): erzwingt, dass der Cluster
  // mindestens eine "exploration"- UND eine "evaluation"-Seite enthält, statt sich zufällig
  // nur auf eine Messy-Middle-Phase zu konzentrieren und Lücken in der Journey zu lassen.
  // "decision" bleibt bewusst optional - viele Cluster brauchen dafür keine eigene
  // supporting_page, weil die conversion_page selbst schon die Entscheidungs-Seite ist.
  .superRefine((result, ctx) => {
    const phases = new Set(result.supporting_pages.map((p) => p.messy_middle_phase));
    (['exploration', 'evaluation'] as const).forEach((required) => {
      if (!phases.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['supporting_pages'],
          message: `Der Cluster deckt die Messy-Middle-Phase "${required}" nicht ab - mindestens eine supporting_page mit messy_middle_phase="${required}" ist Pflicht, sonst bleibt eine Lücke in der Customer Journey.`,
        });
      }
    });
  });
export type ContentClusterResult = z.infer<typeof ContentClusterResultSchema>;

// ==================== TOOL: generate_content_cluster ====================
export const GenerateContentClusterInputSchema = ContentClusterResultSchema;
export type GenerateContentClusterInput = z.infer<typeof GenerateContentClusterInputSchema>;
