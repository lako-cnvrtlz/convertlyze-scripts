"""
Convertlyze Visibility Tracker – Railway-Service

Endpunkte:
    GET  /health                        – simpler Erreichbarkeits-Check
    POST /topics                        – NEU: Topic anlegen (mit Limit-Check),
                                           Datensammlung läuft im Hintergrund,
                                           so wie ein echter Nutzer es später aufrufen würde
    POST /run-topic                     – alte, synchrone Variante (Topic anlegen
                                           UND sofort Daten sammeln, blockiert
                                           10-20s). Für lokale Tests noch nutzbar,
                                           nicht mehr der empfohlene Weg fürs Frontend.
    GET  /topics                        – Liste aller Topics für die Dashboard-Übersicht
    GET  /topics/{topic_id}             – Detail: Topic + Opportunities + Keyword-Übersicht
                                           + Content-Ideen (siehe content_ideas.py, NEU:
                                           erkannte Personalisierungs-Angebote aus AI-Antworten)
    GET  /topics/{topic_id}/prompts/{prompt_id}/citations
                                         – NEU (13.09.2026): letzte Läufe (ChatGPT/Gemini) für
                                           EINEN Prompt inkl. voller Antwort + zitierter Quellen,
                                           siehe _extract_run_answer. Lazy geladen vom Frontend
                                           beim Aufklappen eines Prompts im Prompts-Tab.
    GET  /topics/{topic_id}/competitor-citations
                                         – NEU: wöchentlicher Verlauf, wer wie oft zitiert wurde,
                                           eigener Endpunkt, vom Frontend nur bei Bedarf geladen.
                                           GEÄNDERT (13.09.2026): liefert jetzt zusätzlich
                                           Modell (chat_gpt/gemini) und die zugehörigen Prompts
                                           pro Domain und Woche, siehe _get_competitor_citation_trend.
    GET  /account/topic-status          – NEU: aktueller Stand + Limit, damit das Frontend VOR
                                           dem Anlege-Versuch weiß, ob noch Platz ist
    POST /generate-opportunities/{id}   – Opportunity-Analyse manuell erneut anstoßen
    POST /topics/{id}/generate-action-plan
                                         – NEU (17.09.2026): Aktionsplan manuell (neu)
                                           generieren, z.B. wenn der erste automatische
                                           Lauf kein Ergebnis produziert hat.
    POST /topics/{id}/retry-step        – NEU (20.09.2026): startet GENAU EINEN fehlgeschlagenen oder
                                           fehlenden Analyse-Schritt neu (z.B. Zusammenfassung,
                                           Aktionsplan), nicht den ganzen Lauf, siehe step_tracker.py.
                                           Der Status pro Schritt kommt als step_status in GET /topics/{id}.
    POST /cron/weekly                   – von Supabase pg_cron angestoßen, ChatGPT-Refresh
                                           für alle fälligen Topics (Header X-Cron-Secret statt
                                           Authorization)
    POST /cron/monthly                  – wie oben, Related Keywords + Google AI Overview
    POST /cron/retry-failed             – NEU (14.09.2026): arbeitet die Retry-Queue
                                           (Tabelle failed_tasks) ab, siehe retry_failed_tasks()
                                           in run_topic.py. Sollte HÄUFIGER laufen als
                                           weekly/monthly (empfohlen alle 15-30 Min), Header
                                           X-Cron-Secret wie bei den anderen Cron-Endpunkten.
    GET  /topics/{topic_id}/competitor-suggestions
                                         – NEU (14.09.2026): automatisch aus SERP-Rankings +
                                           AI-Zitationen abgeleitete Wettbewerber-Kandidaten für
                                           dieses Topic, siehe competitor_suggestions.py. Vom
                                           Frontend zur Bestätigung/Auswahl angezeigt, siehe
                                           POST .../confirm-competitors.
    POST /topics/{topic_id}/confirm-competitors
                                         – NEU (14.09.2026): übernimmt die vom User bestätigte
                                           Wettbewerber-Auswahl aus den obigen Vorschlägen.
                                           GEÄNDERT (15.09.2026): schreibt auf ai_visibility_topics.
                                           competitor_domains DIESES Topics (siehe
                                           _get_topic_competitor_domains unten, vorher auf
                                           projects.competitor_domains, zurückgenommen weil ein
                                           Projekt fachlich unabhängige Themen mit unterschiedlichen
                                           Wettbewerbern haben kann), und stößt danach die
                                           Quellen-Analyse sowie Opportunities/Lücken-Analyse für
                                           dieses Topic erneut an.

Alle Endpunkte außer /health und /cron/* erfordern EINEN Header:
    Authorization  – "Bearer <memberstack-jwt>", wird über require_member
                     (siehe memberstack_auth.py) echt gegen die Memberstack-API
                     verifiziert, nicht mehr nur als Header-Wert vertraut. Aus
                     der verifizierten Antwort wird die Member-ID gelesen,
                     daraus wird automatisch das Team aufgelöst (users.team_id),
                     genau wie bei euren bestehenden RLS-Policies. Keine
                     Team-ID mehr fest im Code/in den Env-Vars, jeder
                     Request bekommt sein eigenes Team.

Logging: jede Anfrage wird geloggt (Methode, Pfad, Dauer, Status). Ein
globaler Exception-Handler sorgt dafür, dass JEDE unerwartete Exception mit
vollem Traceback geloggt wird, bevor eine 500-Antwort rausgeht, damit nichts
still im Hintergrund fehlschlägt, ohne dass es in den Railway-Logs auftaucht.
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from memberstack_auth import require_member
from run_topic import (
    run, supabase, get_team_id_for_member, check_topic_limit, get_topic_usage, create_topic,
    collect_topic_data, collect_weekly_data, collect_monthly_data, refresh_gsc_data,
    get_due_topics, get_topic_prompts, find_or_create_prompt, get_owner_user_row_for_billing,
    enforce_expired_downgrades, create_project, get_project, get_team_projects, _normalize_search_domain,
    retry_failed_tasks, send_failure_alert_email,
    enforce_scheduled_archivals, get_next_reservable_slot_at, _looks_like_bare_keyword,
)
from opportunities import generate_opportunities, generate_content_recommendations
from keyword_status import STRONG_RANK_MAX, classify_keyword, to_number
from claude_summary import generate_summary
# NEU (20.09.2026): Schritt-Tracking mit gezieltem Retry, KI-Wissens-Check,
# Wirkungsmessung der Nutzer-Änderungen, Bereinigung interner Feldnamen.
from ai_knowledge import get_ai_knowledge_for_topic
from change_history import build_change_assessment_for_ui, get_change_assessment
from outreach_targets import get_outreach_targets, targets_for_ui
from step_tracker import (
    STEPS, get_step_states, is_step_running, log_pipeline_error, mark_step_running, retry_step, run_step, run_tracked,
)
from text_style import sanitize_user_payload, sanitize_user_text
from prompt_discovery import generate_prompts_for_topic, fill_underrepresented_roles, get_prompt_budget
from buying_center import suggest_buying_center, save_topic_buying_center, get_topic_buying_center
from content_ideas import get_content_ideas_for_topic
from source_analysis import get_source_profiles_for_topic, analyze_sources_for_topic
from dashboard import get_dashboard_data
from gap_analysis import generate_gap_analysis, get_content_gaps_for_topic, get_competitor_insights_for_topic
# NEU (16.09.2026): Claude-generierter Aktionsplan ersetzt die statische
# Opportunities-Analyse als zentrales Handlungsempfehlungs-Modul.
# Integriert KI-Sichtbarkeit, GSC-Rankings, Wettbewerb und Content-Lücken
# in einem einzigen, priorisierten Aktionsplan pro Topic.
from action_plan import generate_action_plan, get_action_plan_for_topic
from competitor_suggestions import (
    generate_competitor_suggestions, get_competitor_suggestions_for_topic, mark_suggestions_reviewed,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("visibility_tracker.api")

# API-Key-Check komplett entfernt (siehe memberstack_auth.py): das Frontend
# liegt jetzt in einem öffentlichen GitHub-Repo, ein dort eingebetteter Key
# wäre kein Geheimnis mehr. Schutz läuft ausschließlich über das
# Bearer-JWT (require_member), CRON_SECRET bleibt getrennt und rein
# server-seitig.
CRON_SECRET = os.environ["CRON_SECRET"]

# Ab diesem Faktor gilt ein anderes erfasstes Keyword als "deutlich
# höheres Suchvolumen" als das seed_keyword des Topics, und wird als
# Positionierungs-Hinweis vorgeschlagen. Willkürlich gewählter Startwert,
# nicht an echten Daten kalibriert, siehe _compute_positioning_insight.
POSITIONING_VOLUME_FACTOR = 1.5

# Wie viele historische Läufe je Engine (ChatGPT/Gemini) im Prompt-Detail
# (GET /topics/{id}/prompts/{id}/citations) abrufbar sind. Nutzerentscheid
# (13.09.2026): die letzten 5 reichen, kein Deckel im Frontend nötig, siehe
# renderPromptExpansion in script.js.
PROMPT_CITATION_RUN_LIMIT = 5

# NEU (14.09.2026): ab wann gilt ein Thema in status='collecting' als
# hängengeblieben statt "läuft noch normal" (siehe retry_topic_endpoint).
# Nach der Parallelisierung von collect_weekly_data (siehe run_topic.py)
# sollte ein normaler Erstlauf deutlich darunter liegen, das hier ist
# bewusst mit Puffer gewählt, nicht scharf an der neuen Erwartungszeit.
STUCK_COLLECTING_THRESHOLD_MINUTES = 45

# NEU (15.09.2026): siehe _auto_confirm_top_competitor_suggestions. Wie
# viele der automatisch erkannten Wettbewerber-Vorschläge ohne manuelle
# Bestätigung direkt in ai_visibility_topics.competitor_domains (pro
# Topic) übernommen werden.
MAX_AUTO_CONFIRMED_COMPETITORS = 5

# NEU (15.09.2026): manuell hinzugefügte Prompts (siehe CreateManualPromptRequest,
# create_manual_prompt_endpoint) sind ein EIGENES, zusätzliches Kontingent
# zu den bis zu 16 automatisch generierten Stable-Core-Prompts (siehe
# prompt_discovery.py: MAX_STABLE_CORE_PROMPTS) — macht zusammen bis zu 20,
# wie vom Kunden am 15.09.2026 gewünscht. Bewusst getrennt gezählt (über
# prompts.source = 'manual'), NICHT einfach das bestehende 16er-Limit für
# stable_core auf 20 angehoben: das hätte auch das automatische Promoten
# eines Discovery-Prompts (siehe set_prompt_type_endpoint) auf bis zu 20
# erlaubt, was hier nicht gefragt war.
MAX_MANUAL_PROMPTS = 4
# GEÄNDERT (23.09.2026): MAX_MANUAL_PROMPTS ist nur noch der Normalfall
# (20 System-Prompts + 4 eigene). Maßgeblich ist der gemeinsame Topf von
# 24 aktiven Stable-Core-Prompts, siehe prompt_discovery.get_prompt_budget.
# Deaktivierte System-Prompts machen also Platz für mehr eigene.

# NEU (16.09.2026): analoges Limit für manuell hinzugefügte Keywords (siehe
# Chat-Verlauf 16.09.2026 — "bei Prompts, Keywords und GSC-Performance-
# Keywords sollten User die Möglichkeit haben, diese zu entfernen und
# eigene hinzuzufügen"). Über search_queries.source = 'manual' gezählt,
# unabhängig von den automatisch gesammelten Keywords/PAA/GSC-Zeilen.
MAX_MANUAL_KEYWORDS = 10

# Dieselben vier Phasen wie prompt_discovery.py: exploration (Verständnis
# des Problems), evaluation (Bewertung von Lösungsansätzen), comparison
# (Vergleich von Anbietern), decision (kaufnahe Fragen). Absichtlich hier
# dupliziert statt importiert, um main.py <-> prompt_discovery.py nicht zu
# einem Zirkelbezug zu machen (main.py importiert bereits
# generate_prompts_for_topic aus prompt_discovery.py).
MESSYMIDDLE_PHASES = ("exploration", "evaluation", "comparison", "decision")


def _stuck_collecting_minutes(topic: dict) -> float:
    """
    Wie lange hängt ein Topic schon in status='collecting'? Gemeinsam
    genutzt von archive_topic_endpoint und retry_topic_endpoint (siehe
    Chat-Verlauf 14.09.2026), damit beide dieselbe Definition von
    "hängengeblieben" verwenden, statt sie zweimal leicht unterschiedlich
    zu implementieren.

    Fallback auf created_at für Themen, die schon vor Einführung von
    collecting_started_at angelegt/zuletzt gestartet wurden (siehe
    create_topic in run_topic.py) — sonst könnten gerade die Themen, die
    JETZT hängen, mangels Zeitstempel nie erkannt werden. Ist auch das
    nicht lesbar, wird ein Wert über der Schwelle zurückgegeben (im
    Zweifel als hängengeblieben behandeln, nicht blockieren).
    """
    started_at_raw = topic.get("collecting_started_at") or topic.get("created_at")
    try:
        started_at = datetime.fromisoformat(started_at_raw.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - started_at).total_seconds() / 60
    except Exception:
        return STUCK_COLLECTING_THRESHOLD_MINUTES + 1

app = FastAPI(title="Convertlyze Visibility Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # KORRIGIERT (14.09.2026): DELETE fehlte hier — jeder DELETE-Aufruf
    # (Changelog-Eintrag löschen, seit 13.09.2026, und jetzt auch Thema
    # ganz löschen) scheiterte dadurch schon am CORS-Preflight (OPTIONS),
    # bevor die Anfrage den Server überhaupt erreichte. Zeigte sich im
    # Frontend nur als generisches "Failed to fetch" (siehe Chat-Verlauf
    # 14.09.2026), nicht als normaler Fehler-Response vom Server.
    # KORRIGIERT (16.09.2026): dasselbe Muster jetzt bei PATCH — seit
    # /topics/{topic_id}/keywords/{keyword_id}/phase (15.09.2026) gibt es
    # den ersten PATCH-Endpunkt, PATCH stand aber nie in dieser Liste,
    # exakt derselbe CORS-Preflight-Fehler wie beim DELETE-Fund oben,
    # siehe Chat-Verlauf 16.09.2026 (Screenshot "Failed to fetch" beim
    # Phase-Ändern eines Keywords).
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    try:
        response = await call_next(request)
    except Exception:
        # Sicherheitsnetz: sollte durch den Exception-Handler unten schon
        # abgefangen werden, aber falls doch etwas durchrutscht, hier noch
        # einmal explizit geloggt statt komplett zu verschwinden.
        logger.exception("Unbehandelte Exception in %s %s", request.method, request.url.path)
        raise
    duration_ms = (time.monotonic() - start) * 1000
    logger.info("%s %s -> %d (%.0f ms)", request.method, request.url.path, response.status_code, duration_ms)
    return response


@app.exception_handler(Exception)
async def log_unhandled_exceptions(request: Request, exc: Exception):
    logger.exception("Unbehandelte Exception bei %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": f"Interner Fehler: {exc}"})


def _check_cron_secret(x_cron_secret: str) -> None:
    """
    Eigenes Secret statt Memberstack-Auth: Der Cron ruft nicht im Namen
    eines eingeloggten Users auf, sondern verarbeitet Topics über ALLE
    Teams hinweg. Ein Team-Scope ergibt hier keinen Sinn.
    """
    if x_cron_secret != CRON_SECRET:
        logger.warning("Ungültiger Cron-Secret-Versuch")
        raise HTTPException(status_code=401, detail="Ungültiges Cron-Secret")


def _resolve_team_id(member_id: str) -> str:
    """
    Löst die (jetzt bereits verifizierte) Member-ID auf ein Team auf.
    Wandelt ein ValueError (kein User/Team gefunden) in eine 403-Antwort
    um, statt eine 500er-Exception hochzureichen, das ist ein
    Berechtigungsfall, kein interner Fehler.
    """
    try:
        return get_team_id_for_member(member_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))


def _check_topic_belongs_to_team(topic: dict, team_id: str) -> None:
    if not topic or topic.get("team_id") != team_id:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")


def _week_start_label(iso_timestamp: str) -> str:
    """Montag der Kalenderwoche, als YYYY-MM-DD. Menschenlesbarer und robuster als reine ISO-Wochennummern."""
    dt = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    monday = dt.date() - timedelta(days=dt.weekday())
    return monday.isoformat()


def _get_competitor_citation_trend(topic_id: str, weeks: int = 12) -> list[dict]:
    """
    Gruppiert ai_sources (über ai_runs.collected_at) nach Kalenderwoche und
    Domain, zählt Zitationen pro Woche. Nutzt ECHTE historische Daten:
    jeder wöchentliche Lauf legt NEUE ai_runs-Zeilen an (save_llm_run macht
    immer insert, nie update), die Historie ist also bereits vorhanden, nur
    bisher nicht aggregiert abgefragt worden.

    GEÄNDERT (13.09.2026): liefert pro (Woche, Domain) jetzt zusätzlich
    eine Aufschlüsselung nach Modell (chat_gpt/gemini, über ai_runs.source)
    und die Liste der Prompt-Texte, bei denen die Domain zitiert wurde
    (über ai_runs.prompt_id -> prompts.prompt_text). Vorher wusste das
    Frontend nur "diese Domain wurde X-mal zitiert", nicht "bei welchem
    Modell/Thema", und konnte deshalb im Wettbewerber-Tab nur eine
    unstrukturierte Logo-Liste zeigen.

    GEÄNDERT (13.09.2026), zweite Korrektur: filterte zunächst zusätzlich
    auf ai_sources.is_competitor = true, eine Spalte, die schon beim
    Speichern eines Laufs berechnet wird (siehe _save_ai_run_with_sources
    in run_topic.py). Vorher zählte diese Funktion JEDE zitierte Domain,
    auch neutrale Wissensquellen wie SAP-Hilfeportal oder Reddit, die keine
    Wettbewerber sind (sichtbar im Screenshot vom 13.09., wo diese Domains
    als "häufigste Wettbewerber" auftauchten).

    GEÄNDERT (14.09.2026), dritte Korrektur: is_competitor wird EINMALIG
    beim Speichern gegen den zu diesem Zeitpunkt gültigen Wettbewerber-
    Stand berechnet und NIE rückwirkend aktualisiert. Jede Zitation, die
    VOR dem Bestätigen einer Wettbewerber-Domain gespeichert wurde, blieb
    dadurch für immer is_competitor=false, selbst nachdem der Kunde die
    Domain bestätigt hat (siehe Chat-Verlauf 14.09.2026, derselbe Bug wie
    in gap_analysis.py: _compute_top_competitor_domains, dort schon
    behoben). Filtert jetzt LIVE gegen _get_topic_competitor_domains
    statt gegen das eingefrorene Flag, dadurch sofort korrekt für jede
    schon gesammelte Zitation.

    GEÄNDERT (15.09.2026): liest jetzt direkt ai_visibility_topics.
    competitor_domains statt über den Umweg project_id -> projects.
    competitor_domains (siehe _get_topic_competitor_domains, Wettbewerber
    sind jetzt ein Topic-Attribut, kein Projekt-Attribut mehr).
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(weeks=weeks)).isoformat()

    try:
        topic = supabase.table("ai_visibility_topics").select("competitor_domains").eq("id", topic_id).single().execute().data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden von competitor_domains für Topic %s", topic_id)
        raise
    competitor_norms = {
        _normalize_search_domain(d) for d in ((topic or {}).get("competitor_domains") or [])
    }
    if not competitor_norms:
        return []

    try:
        runs = (
            supabase.table("ai_runs")
            .select("id, collected_at, source, prompt_id, prompts(prompt_text)")
            .eq("topic_id", topic_id)
            .gte("collected_at", cutoff)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der ai_runs-Historie für Topic %s", topic_id)
        raise

    # run_id -> {week, model, prompt_text}. "prompts" kommt hier als
    # eingebettetes Objekt zurück (dict), nicht als Liste, weil jeder
    # ai_run genau EINEN prompt_id hat (n:1-Beziehung). Kann None sein
    # (z.B. bei google_ai_overview-Runs, die über search_query_id statt
    # prompt_id verknüpft sind).
    run_meta = {
        r["id"]: {
            "week": _week_start_label(r["collected_at"]),
            "model": r.get("source"),
            "prompt_text": (r.get("prompts") or {}).get("prompt_text"),
        }
        for r in runs if r.get("collected_at")
    }
    run_ids = list(run_meta.keys())
    if not run_ids:
        return []

    try:
        sources = (
            supabase.table("ai_sources")
            .select("ai_run_id, domain, url")
            .in_("ai_run_id", run_ids)
            .eq("cited", True)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der ai_sources-Historie für Topic %s", topic_id)
        raise

    # week -> domain -> {citations, url, by_model, prompts}
    counts: dict[str, dict[str, dict]] = {}
    for s in sources:
        meta = run_meta.get(s["ai_run_id"])
        domain = s.get("domain")
        if not meta or not domain:
            continue
        # Live-Filter statt des eingefrorenen is_competitor-Flags, siehe
        # Docstring oben.
        if _normalize_search_domain(domain) not in competitor_norms:
            continue
        week = meta["week"]
        bucket = counts.setdefault(week, {}).setdefault(domain, {
            "citations": 0,
            "url": s.get("url"),
            "by_model": {},    # z.B. {"chat_gpt": 3, "gemini": 1}
            "prompts": set(),  # welche Prompt-Texte zu dieser Zitation geführt haben
        })
        bucket["citations"] += 1
        model = meta["model"] or "unbekannt"
        bucket["by_model"][model] = bucket["by_model"].get(model, 0) + 1
        if meta["prompt_text"]:
            bucket["prompts"].add(meta["prompt_text"])

    return [
        {
            "week": week,
            "domains": [
                {
                    "domain": d,
                    "citations": v["citations"],
                    "url": v["url"],
                    "by_model": v["by_model"],
                    "prompts": sorted(v["prompts"]),  # set() ist nicht JSON-fähig, deshalb sortierte Liste
                }
                for d, v in sorted(domains.items(), key=lambda kv: -kv[1]["citations"])
            ],
        }
        for week, domains in sorted(counts.items())
    ]


def _get_cited_platforms_overview(topic_id: str, weeks: int = 12) -> list[dict]:
    """
    NEU (16.09.2026): Kundenwunsch (siehe Chat-Verlauf 16.09.2026) — zeigt
    ALLE zitierten Domains dieses Themas, gruppiert nach Content-Typ
    (siehe source_analysis.py: content_type — review_plattform,
    vergleichsartikel, produktseite, erklaerseite, fachartikel, video,
    forum, sonstiges), NICHT nur die als Wettbewerber bestätigten (siehe
    _get_competitor_citation_trend für die Wettbewerber-spezifische
    Variante mit Wochen-Historie). Ziel: sichtbar machen, welche ART von
    Plattformen für dieses Thema überhaupt zitiert wird (z.B. Reddit/
    Foren, YouTube/Video, OMR Reviews/Bewertungsplattformen) —
    unabhängig davon, ob das "Wettbewerber" sind — als Grundlage für eine
    eigene Off-Page-/On-Page-Strategie (z.B. gezielt in Foren/auf
    Bewertungsplattformen präsent werden, wenn genau diese Plattform-
    Typen hier oft zitiert werden).

    Bewusst eine reine Gesamt-Aggregation über den Lookback-Zeitraum
    (keine Wochen-Historie wie beim Wettbewerber-Tab) — hier geht es um
    "welche Plattform-Arten insgesamt", nicht um einen zeitlichen
    Verlauf.

    GEÄNDERT (18.09.2026): Gruppierung erfolgt jetzt pro (domain,
    content_type)-Kombination statt nur pro Domain (siehe Chat-Verlauf
    18.09.2026: source_content_profiles cacht jetzt pro URL statt pro
    Domain, weil eine Domain mehrere Content-Typen gleichzeitig haben
    kann, z.B. Blog UND Preisseite). Eine Domain kann dadurch in
    mehreren Gruppen auftauchen — das ist gewollt: zeigt z.B. korrekt,
    dass hubspot.com sowohl als Fachartikel-Quelle als auch als
    Produktseite zitiert wird, statt einen der beiden Typen zu
    unterschlagen.

    URLs ohne Quellen-Analyse (source_analysis.py noch nicht gelaufen,
    z.B. weil der nächste Monatslauf das erst nachholt) bekommen
    content_type=None und landen in einer eigenen Gruppe im Frontend,
    statt zu verschwinden.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(weeks=weeks)).isoformat()

    try:
        runs = (
            supabase.table("ai_runs")
            .select("id, prompt_id, prompts(prompt_text)")
            .eq("topic_id", topic_id)
            .gte("collected_at", cutoff)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der ai_runs für Plattform-Übersicht (topic_id=%s)", topic_id)
        raise

    prompt_text_by_run = {r["id"]: (r.get("prompts") or {}).get("prompt_text") for r in runs}
    run_ids = list(prompt_text_by_run.keys())
    if not run_ids:
        return []

    try:
        sources = (
            supabase.table("ai_sources")
            .select("ai_run_id, domain, url")
            .in_("ai_run_id", run_ids)
            .eq("cited", True)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der ai_sources für Plattform-Übersicht (topic_id=%s)", topic_id)
        raise

    if not sources:
        return []

    urls = list({
        (s.get("url") or f"https://{s['domain']}")
        for s in sources
        if s.get("domain")
    })

    try:
        profiles = (
            supabase.table("source_content_profiles")
            .select("analyzed_url, content_type")
            .in_("analyzed_url", urls)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der Quellen-Analysen für Plattform-Übersicht (topic_id=%s)", topic_id)
        profiles = []
    content_type_by_url = {p["analyzed_url"]: p.get("content_type") for p in profiles}

    combo_stats: dict[tuple[str, str | None], dict] = {}
    for s in sources:
        domain = s.get("domain")
        if not domain:
            continue
        url = s.get("url") or f"https://{domain}"
        content_type = content_type_by_url.get(url)
        prompt_text = prompt_text_by_run.get(s["ai_run_id"])
        bucket = combo_stats.setdefault((domain, content_type), {"citations": 0, "prompts": set()})
        bucket["citations"] += 1
        if prompt_text:
            bucket["prompts"].add(prompt_text)

    by_type: dict = {}
    for (domain, content_type), stats in combo_stats.items():
        by_type.setdefault(content_type, []).append({
            "domain": domain,
            "citations": stats["citations"],
            "prompts": sorted(stats["prompts"]),
        })

    result = []
    for content_type, domains in by_type.items():
        domains.sort(key=lambda d: -d["citations"])
        result.append({"content_type": content_type, "domains": domains})
    result.sort(key=lambda g: -sum(d["citations"] for d in g["domains"]))
    return result


def _get_topic_competitor_domains(topic_id: str | None) -> list[str]:
    """
    GEÄNDERT (15.09.2026): Wettbewerber-Domains leben jetzt PRO TOPIC
    (ai_visibility_topics.competitor_domains), nicht mehr auf
    projects.competitor_domains. Grund (siehe Chat-Verlauf 15.09.2026):
    ein Projekt/Kunde kann mehrere fachlich völlig unabhängige Themen
    haben (z.B. bei AKQUINET: Colocation vs. SAP-Beratung), deren
    Wettbewerber sich nicht überschneiden — eine gemeinsame, projektweite
    Liste hätte bedeutet, dass ein für Thema A bewusst ausgeschlossener
    Wettbewerber bei Thema B trotzdem wieder auftaucht, sobald er dort
    unter den Top-Zitationen landet. Das war der Stand vom 13./14.09.2026
    ("einzige Quelle der Wahrheit" auf Projekt-Ebene), wird hiermit
    zurückgenommen.

    Betrifft auch run_topic.py: _get_topic_competitor_domains (identische
    Umstellung, dort bisher trotz des Namens fälschlich vom Projekt
    gelesen), gap_analysis.py und opportunities.py (jeweils eigene lokale
    Kopie dieser Funktion) sowie competitor_suggestions.py:
    _get_already_competitor_norms.

    ────────────────────────────────────────────────────────────────────
    NOCH NICHT AUSGEFÜHRTE MIGRATION, bitte gegen euer Schema prüfen:

        alter table ai_visibility_topics
          add column competitor_domains text[] not null default '{}';

        -- Einmalige Datenübernahme, damit schon kuratierte Projekt-Listen
        -- nicht verloren gehen: kopiert den bisherigen Projekt-Stand auf
        -- alle zugehörigen Topics.
        update ai_visibility_topics t
        set competitor_domains = p.competitor_domains
        from projects p
        where t.project_id = p.id
          and coalesce(array_length(p.competitor_domains, 1), 0) > 0;

    projects.competitor_domains und projects.excluded_competitor_domains
    werden ab jetzt nirgends mehr gelesen oder geschrieben — könnt ihr
    behalten (harmlos) oder bei Gelegenheit per Migration entfernen, ganz
    wie ihr wollt, eilt nicht.
    ────────────────────────────────────────────────────────────────────

    Gibt bei fehlendem/ungültigem Topic bewusst eine leere Liste zurück
    (kein Fehler), der Aufrufer entscheidet dann selbst, wie er mit
    "keine Wettbewerber hinterlegt" umgeht.
    """
    if not topic_id:
        return []
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("competitor_domains")
            .eq("id", topic_id)
            .single()
            .execute()
        ).data
    except Exception:
        logger.exception("Fehler beim Laden der Wettbewerber-Domains für Topic %s", topic_id)
        return []
    return (topic or {}).get("competitor_domains") or []


def _extract_run_answer(run: dict, own_domain_normalized: str | None) -> dict | None:
    """
    raw_response ist bei chat_gpt/gemini eine Liste mit GENAU EINEM Element,
    das 'markdown' (voller Antworttext) trägt (DataForSEO llm_scraper-
    Format). Die Quellenliste kommt NICHT mehr aus raw_response, sondern
    aus den echten ai_sources-Zeilen (siehe run["_sources"], befüllt in
    _get_recent_runs_for_prompt unten).

    GEÄNDERT (13.09.2026), Korrektur: `cited`, `mentioned`, `recommended`
    und `is_competitor` werden bereits beim Speichern des Laufs in
    ai_sources berechnet (siehe _save_ai_run_with_sources in run_topic.py),
    inklusive einer echten Claude-Klassifizierung für "mentioned" bei
    Wettbewerber-/eigenen Domains, nicht nur einer Substring-Heuristik.
    Frühere Version dieser Funktion hat das selbst aus raw_response neu
    (und schlechter) hergeleitet, das war unnötig, jetzt entfernt.

    own_domain_normalized wird nur genutzt, um die eigene Domain aus der
    "sources"-Liste herauszufiltern: sie taucht dort sonst als weitere
    Zeile auf, obwohl sie schon separat über own_domain_cited/mentioned/
    recommended abgedeckt ist, das wäre eine doppelte Anzeige im Frontend.
    """
    raw = run.get("raw_response")
    if not raw or not isinstance(raw, list) or not raw:
        return None
    item = raw[0]

    sources = []
    for s in run.get("_sources", []):
        domain_norm = _normalize_search_domain(s.get("domain"))
        if own_domain_normalized and domain_norm == own_domain_normalized:
            continue  # eigene Domain: schon über own_domain_* abgedeckt, nicht doppelt zeigen
        sources.append({
            "domain": s.get("domain"),
            "url": s.get("url"),
            "title": s.get("title"),
            "cited": s.get("cited"),
            "mentioned": s.get("mentioned"),
            "recommended": s.get("recommended"),
            "is_competitor": s.get("is_competitor"),
        })

    return {
        "run_id": run["id"],
        "collected_at": run["collected_at"],
        "answer_markdown": item.get("markdown"),
        "sources": sources,
        "own_domain_mentioned": run.get("own_domain_mentioned"),
        "own_domain_cited": run.get("own_domain_cited"),
        "own_domain_citation_position": run.get("own_domain_citation_position"),
        "own_domain_recommended": run.get("own_domain_recommended"),
    }


def _get_recent_runs_for_prompt(topic_id: str, prompt_id: str, source: str, limit: int = PROMPT_CITATION_RUN_LIMIT) -> list:
    """
    GEÄNDERT (13.09.2026): lädt zusätzlich die echten ai_sources-Zeilen pro
    Lauf (ein zweiter Query über die eingesammelten ai_run_ids, kein Join
    nötig) und hängt sie unter "_sources" an jeden Lauf. _extract_run_answer
    liest daraus die Quellenliste, statt sie aus raw_response neu
    herzuleiten.
    """
    try:
        runs = (
            supabase.table("ai_runs")
            .select(
                "id, collected_at, raw_response, own_domain_mentioned, own_domain_cited, "
                "own_domain_citation_position, own_domain_recommended"
            )
            .eq("topic_id", topic_id)
            .eq("prompt_id", prompt_id)
            .eq("source", source)
            .order("collected_at", desc=True)
            .limit(limit)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der Läufe für Prompt %s (source=%s)", prompt_id, source)
        raise

    if not runs:
        return runs

    run_ids = [r["id"] for r in runs]
    try:
        sources = (
            supabase.table("ai_sources")
            .select("ai_run_id, domain, url, title, position, cited, mentioned, recommended, is_competitor")
            .in_("ai_run_id", run_ids)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der Quellen für Prompt %s", prompt_id)
        sources = []

    sources_by_run: dict[str, list] = {}
    for s in sources:
        sources_by_run.setdefault(s["ai_run_id"], []).append(s)

    for r in runs:
        run_sources = sources_by_run.get(r["id"], [])
        # Zitierte Quellen zuerst (nach Position), nur-erwähnte (position
        # ist bei denen None) danach.
        run_sources.sort(key=lambda s: (s.get("position") is None, s.get("position") or 0))
        r["_sources"] = run_sources

    return runs


def _compute_visibility_status_by_prompt(topic_id: str, prompt_ids: list[str]) -> dict[str, str]:
    """
    NEU (13.09.2026): visibility_status pro Prompt stand im Frontend bisher
    IMMER fest auf null (siehe script.js loadTopicDetail, hartcodiert), weil
    es serverseitig nie berechnet wurde. Berechnet hier aus own_domain_cited/
    own_domain_mentioned auf ai_runs, exakt derselben Datenbasis, die auch
    der neue /citations-Endpoint nutzt.

    Nimmt bewusst den JEWEILS NEUESTEN Lauf pro Prompt (über beide Engines
    hinweg, nach collected_at DESC sortiert): die Liste wird absteigend
    geladen, daher zählt nur der ERSTE Treffer je prompt_id. Google AI
    Overview (source='google_ai_overview') bleibt außen vor, da dort
    prompt_id null ist (hängt an search_query_id statt am Prompt, siehe
    Datenmodell in run_topic.py).

    GEÄNDERT NICHT (18.09.2026): grün bleibt bewusst die breite Definition
    (own_domain_cited, "als Quelle genannt"), unabhängig davon ob mit Link.
    Die engere "mit Link zitiert"-Unterscheidung liefert stattdessen
    _compute_unlinked_citation_by_prompt separat, siehe dort — damit die
    Ampel-Farben stabil bleiben und nicht rückwirkend strenger werden.
    """
    if not prompt_ids:
        return {}

    try:
        status_runs = (
            supabase.table("ai_runs")
            .select("prompt_id, own_domain_cited, own_domain_mentioned, collected_at")
            .eq("topic_id", topic_id)
            .in_("prompt_id", prompt_ids)
            .in_("source", ["chat_gpt", "gemini"])
            .order("collected_at", desc=True)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Berechnen der Sichtbarkeits-Status für Topic %s", topic_id)
        return {}

    status_by_prompt: dict[str, str] = {}
    for run in status_runs:
        pid = run.get("prompt_id")
        if not pid or pid in status_by_prompt:
            continue  # bereits vom neuesten Lauf dieses Prompts belegt (Liste ist DESC sortiert)
        if run.get("own_domain_cited"):
            status_by_prompt[pid] = "green"
        elif run.get("own_domain_mentioned"):
            status_by_prompt[pid] = "yellow"
        else:
            status_by_prompt[pid] = "red"

    return status_by_prompt


def _compute_unlinked_citation_by_prompt(topic_id: str, prompt_ids: list[str]) -> dict[str, bool]:
    """
    NEU (18.09.2026): Markiert Prompts, bei denen der JEWEILS NEUESTE Lauf
    die eigene Domain zwar als Quelle nennt (own_domain_cited=true), aber
    OHNE dass die KI einen echten Link gesetzt hat (own_domain_cited_
    with_url=false) — siehe Chat-Verlauf 18.09.2026: "das ist der
    entscheidende Unterschied", diese Prompts sollen im Frontend als
    priorisierter Marker sichtbar sein.

    Gleiches "neuester Lauf pro Prompt"-Muster wie
    _compute_visibility_status_by_prompt (separate Funktion statt Erweiterung
    von dort, damit deren Rückgabewert/Signatur für bestehende Aufrufer
    unverändert bleibt).

    Rückgabe: nur Prompts, bei denen der Marker zutrifft (True) — Prompts
    ohne Zitierung oder mit Link-Zitierung fehlen im Dict, statt explizit
    auf False zu stehen (schlanker fürs Frontend, das ohnehin nur auf
    Vorhandensein prüft).
    """
    if not prompt_ids:
        return {}

    try:
        status_runs = (
            supabase.table("ai_runs")
            .select("prompt_id, own_domain_cited, own_domain_cited_with_url, collected_at")
            .eq("topic_id", topic_id)
            .in_("prompt_id", prompt_ids)
            .in_("source", ["chat_gpt", "gemini"])
            .order("collected_at", desc=True)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Berechnen der Ohne-Link-Markierung für Topic %s", topic_id)
        return {}

    seen: set[str] = set()
    unlinked_by_prompt: dict[str, bool] = {}
    for run in status_runs:
        pid = run.get("prompt_id")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        if run.get("own_domain_cited") and not run.get("own_domain_cited_with_url"):
            unlinked_by_prompt[pid] = True

    return unlinked_by_prompt


def _compute_citation_counts_by_prompt(topic_id: str, prompt_ids: list[str]) -> dict[str, dict]:
    """
    NEU (13.09.2026): anders als _compute_visibility_status_by_prompt (nur
    der NEUESTE Lauf) zählt diese Funktion über ALLE ausgewerteten Läufe
    hinweg, wie oft own_domain tatsächlich zitiert wurde. Für die direkte
    Anzeige "3 von 5 Läufen zitiert" in der Prompt-Liste, ohne dass man
    dafür erst den Prompt aufklappen muss.
    """
    if not prompt_ids:
        return {}

    try:
        runs = (
            supabase.table("ai_runs")
            .select("prompt_id, own_domain_cited")
            .eq("topic_id", topic_id)
            .in_("prompt_id", prompt_ids)
            .in_("source", ["chat_gpt", "gemini"])
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Zählen der Zitierungen pro Prompt für Topic %s", topic_id)
        return {}

    counts: dict[str, dict] = {}
    for run in runs:
        pid = run.get("prompt_id")
        if not pid:
            continue
        entry = counts.setdefault(pid, {"cited_count": 0, "total_runs": 0})
        entry["total_runs"] += 1
        if run.get("own_domain_cited"):
            entry["cited_count"] += 1
    return counts


def _compute_top_cited_domain_by_prompt(topic_id: str, prompt_ids: list[str]) -> dict[str, str]:
    """
    NEU (14.09.2026): für die Anreicherung der Prompt-Zeile mit "welche
    Quelle wird hier am häufigsten zitiert, und was für ein Content-Typ ist
    das" (siehe source_analysis.py: source_content_profiles, im Frontend
    als Badge in renderPromptsByPhase). Zählt Zitationen PRO Domain über
    ALLE ausgewerteten Läufe eines Prompts hinweg (anders als
    _compute_visibility_status_by_prompt, das nur den neuesten Lauf nimmt),
    gibt pro Prompt die Domain mit den meisten Zitationen zurück.

    Bewusst NICHT auf Wettbewerber-Domains beschränkt: eine neutrale, oft
    zitierte Quelle (z.B. ein Fachportal) ist für "welcher Content-Typ
    funktioniert hier" genauso aufschlussreich wie ein bestätigter
    Wettbewerber, und die Einschränkung auf Wettbewerber würde bei Themen
    ohne bestätigte Wettbewerber-Domains immer leer bleiben.

    GEÄNDERT (18.09.2026): zählt zusätzlich Zitationen pro URL (nicht nur
    pro Domain) und gibt in "top_url" die meistzitierte URL INNERHALB der
    Top-Domain zurück. Grund: source_content_profiles cacht jetzt pro URL
    (siehe source_analysis.py), eine Domain kann also mehrere Content-Typen
    haben — der Aufrufer muss das Content-Typ-Badge über top_url auflösen,
    nicht mehr pauschal über die Domain, sonst zeigt das Badge ggf. den
    Content-Typ einer ganz anderen Seite derselben Domain.
    """
    if not prompt_ids:
        return {}

    try:
        runs = (
            supabase.table("ai_runs")
            .select("id, prompt_id")
            .eq("topic_id", topic_id)
            .in_("prompt_id", prompt_ids)
            .in_("source", ["chat_gpt", "gemini"])
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der Läufe für Top-Zitations-Domain, Topic %s", topic_id)
        return {}

    prompt_by_run_id = {r["id"]: r["prompt_id"] for r in runs if r.get("prompt_id")}
    run_ids = list(prompt_by_run_id.keys())
    if not run_ids:
        return {}

    try:
        sources = (
            supabase.table("ai_sources")
            .select("ai_run_id, domain, url")
            .in_("ai_run_id", run_ids)
            .eq("cited", True)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der Quellen für Top-Zitations-Domain, Topic %s", topic_id)
        return {}

    # prompt_id -> {domain -> {"count": int, "urls": {url: count}}}
    counts: dict[str, dict[str, dict]] = {}
    for s in sources:
        prompt_id = prompt_by_run_id.get(s.get("ai_run_id"))
        domain = s.get("domain")
        if not prompt_id or not domain:
            continue
        url = s.get("url") or f"https://{domain}"
        bucket = counts.setdefault(prompt_id, {})
        domain_bucket = bucket.setdefault(domain, {"count": 0, "urls": {}})
        domain_bucket["count"] += 1
        domain_bucket["urls"][url] = domain_bucket["urls"].get(url, 0) + 1

    # Gibt pro Prompt die nach Zitations-Häufigkeit sortierten Top-Domains
    # zurück. "top" ist die meistzitierte Domain (bisheriges Verhalten),
    # "all" ist die vollständige sortierte Liste (für das Frontend, um
    # mehrere Favicons anzuzeigen), "top_url" die meistzitierte URL
    # innerhalb der Top-Domain (für die korrekte Content-Typ-Auflösung).
    result = {}
    for prompt_id, domains in counts.items():
        if not domains:
            continue
        sorted_domains = [
            d for d, _ in sorted(domains.items(), key=lambda kv: kv[1]["count"], reverse=True)
        ]
        top_domain = sorted_domains[0]
        top_domain_urls = domains[top_domain]["urls"]
        top_url = max(top_domain_urls.items(), key=lambda kv: kv[1])[0] if top_domain_urls else None
        result[prompt_id] = {"top": top_domain, "all": sorted_domains, "top_url": top_url}
    return result


def _compute_positioning_insight(topic: dict, search_queries: list[dict]) -> dict | None:
    """
    Vergleicht das Suchvolumen des seed_keyword mit allen anderen für dieses
    Topic erfassten Keywords (related_keywords/keyword_ideas/keyword_suggestions,
    also NICHT gsc/paa/seed_keyword selbst, das sind andere Quellen mit
    anderer Bedeutung). Findet sich ein thematisch verwandtes Keyword mit
    deutlich höherem Suchvolumen, ist das ein Hinweis, dass die
    Topic-Positionierung ggf. am falschen Begriff hängt, z.B. "AI as a
    Service" vs. "KI-Beratung", wenn Letzteres viel mehr gesucht wird.

    Bewusst reine Zahlen-Auswertung bereits vorliegender Daten, kein neuer
    API-Call, keine Claude-Klassifizierung, also deutlich geringeres
    Hallunzinationsrisiko als bei den Content-Ideen. Die "thematische
    Verwandtschaft" kommt dabei nicht von uns, sondern steckt schon in der
    DataForSEO-Auswahl (related_keywords/keyword_ideas/keyword_suggestions
    sind bereits algorithmisch auf das seed_keyword bezogen generiert),
    wir werten hier nur ihre Suchvolumen aus, wir bewerten nicht selbst,
    ob zwei Begriffe wirklich zusammengehören.

    Gibt None zurück, wenn kein Kandidat gefunden wird oder das
    seed_keyword selbst kein erfasstes Suchvolumen hat (dann fehlt die
    Vergleichsbasis). Seit dem Fix in run_topic.py (get_keyword_overview,
    13.09.2026) hat das seed_keyword nach einem neuen monatlichen Lauf
    tatsächlich ein search_volume, vorher stand hier immer None.
    """
    seed_keyword_norm = (topic.get("seed_keyword") or "").strip().lower()
    seed_volume = None
    for q in search_queries:
        if (q.get("keyword") or "").strip().lower() == seed_keyword_norm:
            seed_volume = q.get("search_volume")
            break

    if seed_volume is None:
        return None

    candidates = [
        q for q in search_queries
        if (q.get("keyword") or "").strip().lower() != seed_keyword_norm
        and q.get("search_volume") is not None
        # GEÄNDERT (23.09.2026): keyword_ideas ausgenommen. Das ist bei DataforSEO
        # eine Kategorie-Suche und schlug bei "Infor Schulungen" allen Ernstes
        # "SAP Schulungen" als treffendere Positionierung vor. related_keywords
        # (SERP-Nähe) und keyword_suggestions (enthalten das Seed) bleiben.
        and q.get("source") in ("related_keywords", "keyword_suggestions")
    ]
    if not candidates:
        return None

    best = max(candidates, key=lambda q: q["search_volume"])
    threshold = seed_volume * POSITIONING_VOLUME_FACTOR
    if best["search_volume"] <= threshold:
        return None

    return {
        "seed_keyword": topic.get("seed_keyword"),
        "seed_volume": seed_volume,
        "suggested_keyword": best["keyword"],
        "suggested_volume": best["search_volume"],
        "factor": round(best["search_volume"] / seed_volume, 1) if seed_volume else None,
    }


class RunTopicRequest(BaseModel):
    topic_name: str
    seed_keyword: str
    own_domain: str
    sample_prompts: list[str]


class CreateProjectRequest(BaseModel):
    name: str
    domain: str
    language_code: str = "de"
    location_name: str = "Germany"
    target_group: str | None = None      # fließt in die Claude-Prompt-Generierung ein
    conversion_goal: str | None = None   # fließt in die Claude-Prompt-Generierung ein
    competitor_domains: list[str] = []


class BuyingCenterRoleInput(BaseModel):
    # NEU (23.09.2026): eine vom Nutzer bestätigte Buying-Center-Rolle,
    # siehe buying_center.py. Feldnamen wie im Vorschlag, damit das Frontend
    # den Vorschlag unverändert zurückschicken kann.
    rolle: str
    ist_champion: bool = False
    motivation: str | None = None
    einwand: str | None = None
    # NEU (23.09.2026): exploration|evaluation|comparison|decision, Standard exploration
    einstiegsphase: str | None = None


class CreateTopicRequest(BaseModel):
    project_id: str  # NEU: Topics gehören jetzt zu einem Projekt (Agentur-Anwendungsfall, mehrere Kunden pro Team)
    topic_name: str
    seed_keyword: str
    sample_prompts: list[str] = []  # leer = automatische Stable-Core-Generierung (siehe prompt_discovery.py)
    # NEU (23.09.2026): Zielgruppe und Buying Center pro Topic. Werden VOR dem
    # Hintergrund-Datenlauf gespeichert, damit die Prompt-Generierung sie nutzen kann.
    target_group: str | None = None
    buying_center: list[BuyingCenterRoleInput] = []


class BuyingCenterSuggestRequest(BaseModel):
    topic_name: str
    seed_keyword: str
    target_group: str | None = None
    offer_url: str | None = None  # optionale Angebotsseite, muss auf der Projekt-Domain liegen


class SaveBuyingCenterRequest(BaseModel):
    rollen: list[BuyingCenterRoleInput]


class SetPromptRoleRequest(BaseModel):
    role_id: str | None = None  # None = Rolle entfernen


class CreateChangelogEntryRequest(BaseModel):
    entry_text: str
    # NEU (14.09.2026): optionale Verknüpfung mit konkreten Keywords/Prompts
    # dieses Topics (siehe Chat-Verlauf 14.09.2026: "wann hat sich WELCHES
    # Keyword/WELCHER Prompt durch diese Änderung verändert" statt nur
    # eines zeitlichen Zufallstreffers über alle Charts hinweg). Mehrere
    # Änderungen pro Keyword/Prompt sind normal und explizit erwünscht,
    # daher ein Array-Feld statt einer 1:1-Beziehung.
    #
    # ────────────────────────────────────────────────────────────────────
    # NOCH NICHT AUSGEFÜHRTE MIGRATION, bitte gegen euer Schema prüfen:
    #
    #     alter table topic_changelog
    #       add column linked_search_query_ids uuid[] not null default '{}';
    #     alter table topic_changelog
    #       add column linked_prompt_ids uuid[] not null default '{}';
    # ────────────────────────────────────────────────────────────────────
    linked_search_query_ids: list[str] = []
    linked_prompt_ids: list[str] = []


class CreateManualPromptRequest(BaseModel):
    # NEU (15.09.2026): manuelles Hinzufügen von Prompts, siehe Chat-
    # Verlauf 15.09.2026 — zusätzlich zu den bis zu 16 automatisch von
    # Claude generierten Stable-Core-Prompts (prompt_discovery.py) sollen
    # Nutzer bis zu MAX_MANUAL_PROMPTS eigene Prompts anlegen können, mit
    # frei gewählter Phase statt Claudes automatischer Einordnung.
    prompt_text: str
    messymiddle_phase: str  # exploration|evaluation|comparison|decision, siehe MESSYMIDDLE_PHASES
    # NEU (23.09.2026): optionale Buying-Center-Rolle des Topics
    role_id: str | None = None
    # NEU (16.09.2026): siehe _looks_like_bare_keyword in run_topic.py —
    # der Endpunkt lehnt kurze, keyword-artige Eingaben standardmäßig ab
    # (422), damit nicht versehentlich ein SEO-Keyword statt einer echten
    # AI-Prompt-Frage gespeichert wird. Falls das Frontend dem Nutzer
    # später eine "trotzdem speichern"-Bestätigung anbietet, kann es das
    # hierüber erzwingen.
    force: bool = False


class CreateManualKeywordRequest(BaseModel):
    # NEU (16.09.2026): manuelles Hinzufügen eines Keywords, analog zu
    # CreateManualPromptRequest oben, siehe Chat-Verlauf 16.09.2026.
    # messymiddle_phase optional: anders als bei Prompts kennt ein
    # manuell eingetragenes Keyword seine Phase evtl. noch nicht, dann
    # bleibt sie leer, bis der Nutzer sie später über
    # update_keyword_phase_endpoint setzt (dasselbe Formular, das es für
    # automatisch gesammelte Keywords schon gibt).
    keyword: str
    messymiddle_phase: str | None = None


class CreateContentChangeRequest(BaseModel):
    # NEU (16.09.2026): Content-Änderungen für den Dashboard Change Log.
    # Nutzer tragen ein, wann sie welchen Inhalt veröffentlicht/geändert haben,
    # damit diese Ereignisse als Marker in den Trend-Charts erscheinen und man
    # Korrelationen zwischen Inhaltsänderungen und Visibility-Verläufen sehen kann.
    #
    # ────────────────────────────────────────────────────────────────────
    # MIGRATION (ausführen vor dem ersten POST auf diesen Endpoint):
    #
    #     create table content_changes (
    #         id uuid primary key default gen_random_uuid(),
    #         topic_id uuid not null references ai_visibility_topics(id) on delete cascade,
    #         changed_at date not null,
    #         change_type text not null check (
    #             change_type in ('neue_seite', 'ueberarbeitung', 'kampagne', 'sonstiges')
    #         ),
    #         description text not null,
    #         url text,
    #         created_at timestamptz not null default now()
    #     );
    #     create index content_changes_topic_id_idx on content_changes(topic_id);
    # ────────────────────────────────────────────────────────────────────
    changed_at: str       # ISO-Datum: "2026-09-10"
    change_type: str      # "neue_seite" | "ueberarbeitung" | "kampagne" | "sonstiges"
    description: str      # was wurde geändert / veröffentlicht
    url: str | None = None  # optional: die betroffene URL
    # NEU (20.09.2026): Verknüpfung mit konkreten Keywords/Prompts. Das
    # Frontend schickt diese Felder schon lange mit, das Backend hat sie bisher
    # verworfen. Ohne sie lässt sich die Wirkung einer Änderung nicht auf die
    # betroffenen Prompts/Keywords messen (siehe change_history.py). Braucht die
    # Migration migration_2026_09_20.sql.
    linked_search_query_ids: list[str] = []
    linked_prompt_ids: list[str] = []


class UpdateKeywordPhaseRequest(BaseModel):
    # NEU (15.09.2026): manuelle Korrektur einer automatisch zugeordneten
    # Messy-Middle-Phase bei Keywords/PAA-Fragen (siehe Chat-Verlauf
    # 15.09.2026: "Keywords und PAA auch den Messy Middle Phasen
    # zuordnen, die dann von den Usern aber geändert werden können, falls
    # falsch zugeordnet"). Setzt zusätzlich phase_manually_set=true (siehe
    # run_topic.py: save_search_queries), damit ein künftiger Sammel-Lauf
    # diese Korrektur nicht wieder überschreibt.
    messymiddle_phase: str  # exploration|evaluation|comparison|decision, siehe MESSYMIDDLE_PHASES


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/projects")
def create_project_endpoint(payload: CreateProjectRequest, member_id: str = Depends(require_member)):
    team_id = _resolve_team_id(member_id)
    try:
        project_id = create_project(
            team_id, payload.name, payload.domain, payload.language_code, payload.location_name,
            target_group=payload.target_group, conversion_goal=payload.conversion_goal,
            competitor_domains=payload.competitor_domains,
        )
    except Exception as e:
        logger.exception("Fehler beim Anlegen des Projekts '%s'", payload.name)
        raise HTTPException(status_code=500, detail=f"Projekt konnte nicht angelegt werden: {e}")
    return {"status": "ok", "project_id": project_id}


@app.get("/projects")
def list_projects_endpoint(member_id: str = Depends(require_member)):
    team_id = _resolve_team_id(member_id)
    try:
        projects = get_team_projects(team_id)
    except Exception as e:
        logger.exception("Fehler beim Laden der Projekte für Team %s", team_id)
        raise HTTPException(status_code=500, detail=f"Projekte konnten nicht geladen werden: {e}")
    return {"projects": projects}


@app.get("/account/topic-status")
def get_topic_status_endpoint(member_id: str = Depends(require_member)):
    """
    NEU: Liefert aktuellen Stand + Limit, damit das Frontend VOR dem
    Öffnen des Anlege-Formulars weiß, ob überhaupt noch Platz ist, statt
    das erst beim Absenden per 403 zu erfahren (siehe check_topic_limit
    in run_topic.py, nutzt intern dieselbe get_topic_usage()-Funktion,
    damit beide Stellen garantiert dieselbe Zahl sehen).
    """
    team_id = _resolve_team_id(member_id)
    try:
        usage = get_topic_usage(team_id)
    except Exception as e:
        logger.exception("Fehler beim Laden des Topic-Status für Team %s", team_id)
        raise HTTPException(status_code=500, detail=f"Konnte Topic-Status nicht laden: {e}")

    # GEÄNDERT (14.09.2026): can_queue + next_slot_at mit ausliefern, siehe
    # get_topic_usage/get_next_reservable_slot_at in run_topic.py.
    can_create = usage["current_count"] < usage["limit"]
    next_slot_at = None
    if not can_create and usage.get("queueable"):
        try:
            next_slot_at = get_next_reservable_slot_at(team_id)
        except Exception:
            logger.exception("Fehler beim Ermitteln des nächsten freien Slots für Team %s", team_id)

    return {
        "current_count": usage["current_count"],
        "limit": usage["limit"],
        "can_create": can_create,
        "can_queue": bool(usage.get("queueable")),
        "next_slot_at": next_slot_at,
    }


def _record_topic_run_error(topic_id: str, step: str, error: Exception) -> None:
    """
    NEU (16.09.2026): Kundenwunsch (siehe Chat-Verlauf 16.09.2026) —
    speichert die tatsächliche Fehlermeldung eines fehlgeschlagenen
    Hintergrund-Schritts direkt auf der Topic-Zeile, nicht nur im
    Railway-Log. Vorher war ein fehlgeschlagener Lauf (egal ob kompletter
    Abbruch oder nur ein einzelner Analyse-Schritt) für den User im
    Frontend nicht diagnostizierbar, ohne Zugriff auf die Server-Logs zu
    haben.

    Überschreibt einen evtl. vorherigen Fehler — nur der ZULETZT in einem
    Lauf aufgetretene Fehler bleibt erhalten, kein vollständiges
    Audit-Log (dafür bleiben die Log-Zeilen selbst da). Reicht für die
    eigentliche Absicht: ohne Log-Zugriff sehen können, WARUM der letzte
    Lauf (teilweise) fehlgeschlagen ist. step benennt, welcher Teilschritt
    betroffen war (z.B. "collect_monthly_data", "generate_summary"),
    damit die Meldung im Frontend einordbar ist, statt nur ein rohes
    Python-Exception-Text zu sein.

    Best effort: schlägt sogar dieses Update fehl, wird das nur geloggt,
    nie weitergeworfen — ein Fehler beim Fehler-Speichern soll den
    eigentlichen Hintergrund-Lauf nicht zusätzlich stören.

    ──────────────────────────────────────────────────────────────────
    NOCH NICHT AUSGEFÜHRTE MIGRATION, bitte gegen euer Schema prüfen:

        alter table ai_visibility_topics add column last_run_error text;
        alter table ai_visibility_topics add column last_run_error_at timestamptz;
    ──────────────────────────────────────────────────────────────────
    """
    message = f"[{step}] {error}"[:2000]  # gedeckelt, falls eine Exception-Message unerwartet riesig ist (z.B. eine komplette HTML-Fehlerseite in einer requests-Exception)
    try:
        supabase.table("ai_visibility_topics").update({
            "last_run_error": message,
            "last_run_error_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", topic_id).execute()
    except Exception:
        logger.exception("Konnte Fehlermeldung für Topic %s nicht speichern (step=%s)", topic_id, step)


def _clear_topic_run_error(topic_id: str) -> None:
    """
    Wird nach einem VOLLSTÄNDIG fehlerfreien Lauf aufgerufen (siehe
    _record_topic_run_error) — ein alter, längst behobener Fehler soll
    nicht für immer im Frontend stehen bleiben, nur weil seitdem kein
    neuer Fehler aufgetreten ist.
    """
    try:
        supabase.table("ai_visibility_topics").update({
            "last_run_error": None,
            "last_run_error_at": None,
        }).eq("id", topic_id).execute()
    except Exception:
        logger.exception("Konnte last_run_error für Topic %s nicht zurücksetzen", topic_id)


def _collect_and_analyze_background(topic_id: str, seed_keyword: str, own_domain: str,
                                     language_code: str, location_name: str,
                                     sample_prompts: list[str], team_id: str | None) -> None:
    """
    Läuft als FastAPI-BackgroundTask NACH dem Response an den Client, also
    kann kein HTTPException mehr beim User ankommen. Jeder Fehler MUSS hier
    daher explizit geloggt werden, sonst verschwindet er spurlos, das ist
    genau der Fall, vor dem das Logging-Setup schützen soll.

    language_code/location_name kommen jetzt vom Projekt statt hartcodiert
    "de"/"Germany" zu sein, das war vorher eine Vereinfachung, die mit
    mehrsprachigen Agentur-Projekten nicht mehr passt.

    GEÄNDERT (14.09.2026): letzter Parameter hieß vorher billing_user_id
    (ein einzelner, per get_team_owner_id aufgelöster User), siehe
    run_topic.py: collect_monthly_data für die Begründung der Umstellung
    auf team_id.

    GEÄNDERT (16.09.2026): jeder Fehlschlag (kompletter Abbruch ODER ein
    einzelner Analyse-Schritt) wird jetzt zusätzlich per
    _record_topic_run_error auf der Topic-Zeile gespeichert, siehe dort.
    Lief der komplette Durchlauf fehlerfrei durch, wird ein evtl. alter
    Fehler am Ende gelöscht (_clear_topic_run_error).
    """
    # GEÄNDERT (20.09.2026), siehe Chat-Verlauf 20.09.2026: alle Analyse-
    # Schritte laufen jetzt über run_step (step_tracker.py). Jeder Schritt
    # bekommt so einen eigenen Status und jeder Fehler landet mit Traceback in
    # pipeline_error_log. Ein fehlgeschlagener Schritt zeigt dem Nutzer einen
    # "Erneut erstellen"-Button genau für dieses Feld, statt nur eine
    # Sammel-Fehlermeldung (last_run_error) zu hinterlassen. Reihenfolge und
    # Abhängigkeiten sind unverändert, neu ist nur der KI-Wissens-Check vor
    # Aktionsplan und Zusammenfassung.
    had_any_error = False

    try:
        collect_topic_data(topic_id, seed_keyword, own_domain, language_code, location_name, sample_prompts, team_id)
        # Rohdaten fertig — Analysen laufen jetzt noch (generate_opportunities,
        # gap_analysis, action_plan, summary). "analyzing" hält das Frontend
        # davon ab, den Report zu öffnen, bis wirklich alles vorliegt.
        # "active" wird erst ganz am Ende dieser Funktion gesetzt.
        supabase.table("ai_visibility_topics").update({"status": "analyzing"}).eq("id", topic_id).execute()
    except Exception as e:
        logger.exception("Hintergrund-Datenlauf fehlgeschlagen für Topic %s", topic_id)
        _record_topic_run_error(topic_id, "collect_topic_data", e)
        try:
            supabase.table("ai_visibility_topics").update({"status": "error"}).eq("id", topic_id).execute()
        except Exception:
            logger.exception("Konnte Fehler-Status für Topic %s nicht einmal speichern", topic_id)
        return

    def _step(step: str):
        nonlocal had_any_error
        result = run_step(topic_id, step, triggered_by="first_run")
        if not result.ok:
            had_any_error = True
        return result

    _step("opportunities")
    _step("gap_analysis")

    # NEU (14.09.2026): Wettbewerber-Vorschläge aus den gerade gesammelten
    # Daten (SERP-Rankings + AI-Zitationen), siehe competitor_suggestions.py.
    # Ein Fehlschlag hier blockiert nichts anderes, betrifft nur die
    # Bestätigungs-UI im Frontend.
    if _step("competitor_suggestions").ok:
        # NEU (15.09.2026): siehe _auto_confirm_top_competitor_suggestions für
        # die ausführliche Begründung. Kurz: ohne das blieb die Wettbewerber-
        # Liste des Topics für immer leer, und gap_analysis/Opportunity 4
        # liefen oben bereits OHNE Wettbewerber-Domains durch, deshalb hier
        # per _reanalyze_after_competitor_confirmation nachholen.
        try:
            got_new_domains = _auto_confirm_top_competitor_suggestions(topic_id)
            if got_new_domains:
                # GEÄNDERT (20.09.2026): ohne Aktionsplan. Der wird unten
                # ohnehin nach dem KI-Wissens-Check erzeugt, ein zweiter
                # Claude-Aufruf hier wäre reine Verschwendung.
                if not _reanalyze_after_competitor_confirmation(
                    topic_id, include_action_plan=False, triggered_by="first_run",
                ):
                    had_any_error = True
        except Exception as e:
            had_any_error = True
            logger.exception("Automatische Wettbewerber-Übernahme fehlgeschlagen für Topic %s", topic_id)
            log_pipeline_error(topic_id, "competitor_suggestions", "first_run", e)

    # NEU (20.09.2026): KI-Wissens-Check. Bewusst NACH der Wettbewerber-
    # Übernahme (der Vergleichs-Prompt nennt die Wettbewerber) und VOR
    # Aktionsplan und Zusammenfassung, die beide sein Ergebnis nutzen.
    _step("ai_knowledge")
    _step("action_plan")

    # GEÄNDERT (15.09.2026): generate_summary bewusst ans ENDE verschoben,
    # NACH der automatischen Wettbewerber-Übernahme oben, weil die
    # Zusammenfassung competitor_insights/content_gaps braucht.
    _step("summary")

    if not had_any_error:
        _clear_topic_run_error(topic_id)

    # Alle Analysen abgeschlossen — jetzt erst "active" setzen, damit das
    # Frontend den Report erst öffnet, wenn auch Aktionsplan, Summary und
    # Lückenanalyse vollständig vorliegen (vorher stand "active" schon nach
    # collect_topic_data, was zu einem leeren Report geführt hat).
    try:
        supabase.table("ai_visibility_topics").update({"status": "active"}).eq("id", topic_id).execute()
    except Exception:
        logger.exception("Konnte Status für Topic %s nicht auf \"active\" setzen", topic_id)


def _auto_confirm_top_competitor_suggestions(topic_id: str) -> bool:
    """
    NEU (15.09.2026): übernimmt bis zu MAX_AUTO_CONFIRMED_COMPETITORS der
    automatisch erkannten Wettbewerber-Vorschläge (die am häufigsten
    zitierten ECHTEN Wettbewerber-Domains, siehe competitor_suggestions.py:
    likely_competitor) direkt in ai_visibility_topics.competitor_domains
    DIESES Topics — OHNE auf eine manuelle Bestätigung durch den Nutzer zu
    warten.

    Grund (siehe Chat-Verlauf 15.09.2026): Der ursprüngliche Plan war "im
    Erstlauf automatisch bis zu 5 Wettbewerber setzen, Nutzer kann sie
    danach austauschen" — vorher passierte aber gar nichts von selbst,
    die Liste blieb leer, bis JEMAND von Hand POST /confirm-competitors
    aufruft. Ohne Frontend-UI dafür (die gibt es aktuell nicht, siehe
    Chat-Verlauf) hieß das: für immer leer, und damit liefen gap_analysis
    und Opportunity 4 (ai_visible_competitor_dominates) dauerhaft ins Leere.

    GEÄNDERT (15.09.2026), zweite Änderung: Wettbewerber sind jetzt ein
    Topic-Attribut, kein Projekt-Attribut mehr (siehe
    _get_topic_competitor_domains) — braucht deshalb keine project_id
    mehr als Parameter, und die vorherige projects.
    excluded_competitor_domains-Zwischenlösung entfällt ersatzlos: das
    Problem, das sie lösen sollte (ein für Thema A entfernter Wettbewerber
    taucht bei Thema B wieder auf), kann strukturell gar nicht mehr
    auftreten, wenn jedes Thema seine eigene Liste hat.

    WICHTIG, Unterschied zu confirm_competitors_endpoint: ruft bewusst
    NICHT mark_suggestions_reviewed auf. Der Endpunkt dort markiert alle
    NICHT ausgewählten offenen Vorschläge als 'dismissed' — das ist beim
    MANUELLEN Review korrekt (der Nutzer hat sie sich angesehen und
    bewusst nicht gewählt), wäre hier aber falsch: die übrigen Kandidaten
    sollen weiterhin als Alternativen sichtbar bleiben, damit der Nutzer
    die automatische Auswahl später über GET .../competitor-suggestions
    einsehen und einzelne Domains austauschen kann, ohne dass der Rest
    schon unwiderruflich verworfen wurde.

    Gibt zurück, ob mindestens eine neue Domain übernommen wurde (der
    Aufrufer nutzt das, um zu entscheiden, ob sich eine erneute Analyse
    überhaupt lohnt).
    """
    try:
        suggestions = get_competitor_suggestions_for_topic(topic_id)
    except Exception:
        logger.exception(
            "Fehler beim Laden der Wettbewerber-Vorschläge für Topic %s (automatische Übernahme)", topic_id,
        )
        return False

    likely = [s for s in suggestions if s.get("likely_competitor") and s.get("domain")]
    # Häufigste Zitation zuerst — die repräsentativsten Wettbewerber für
    # dieses Thema, keine willkürliche Reihenfolge.
    likely.sort(key=lambda s: s.get("citation_count") or 0, reverse=True)
    top_domains = [s["domain"] for s in likely[:MAX_AUTO_CONFIRMED_COMPETITORS]]

    if not top_domains:
        logger.info("Keine geeigneten Wettbewerber-Vorschläge zur automatischen Übernahme für Topic %s", topic_id)
        return False

    try:
        topic_row = (
            supabase.table("ai_visibility_topics")
            .select("competitor_domains")
            .eq("id", topic_id)
            .single()
            .execute()
        ).data
    except Exception:
        logger.exception("Fehler beim Laden von Topic %s für automatische Wettbewerber-Übernahme", topic_id)
        return False

    # Ergänzt die bestehende Topic-Liste, ersetzt sie nicht (z.B. falls
    # generate_competitor_suggestions ein zweites Mal für dasselbe Topic
    # läuft und schon vorher etwas übernommen wurde).
    existing = (topic_row or {}).get("competitor_domains") or []
    existing_normed = {_normalize_search_domain(d) for d in existing}
    merged = list(existing)
    for d in top_domains:
        normed = _normalize_search_domain(d)
        if normed not in existing_normed:
            merged.append(d)
            existing_normed.add(normed)

    if merged == existing:
        logger.info(
            "Automatisch ausgewählte Wettbewerber für Topic %s waren schon bekannt, nichts zu tun", topic_id,
        )
        return False

    try:
        supabase.table("ai_visibility_topics").update({"competitor_domains": merged}).eq("id", topic_id).execute()
    except Exception:
        logger.exception("Fehler beim automatischen Speichern der Wettbewerber für Topic %s", topic_id)
        return False

    logger.info(
        "Automatisch %d Wettbewerber-Domain(s) für Topic %s übernommen: %s",
        len(top_domains), topic_id, ", ".join(top_domains),
    )
    return True


def _reanalyze_after_competitor_confirmation(
    topic_id: str, include_action_plan: bool = True, triggered_by: str = "reanalysis",
) -> bool:
    """
    NEU (14.09.2026): Läuft als Background-Task NACH POST
    /topics/{id}/confirm-competitors. Holt KEINE neuen Rohdaten (die sind
    schon da, aus dem ersten Sammel-Lauf), stößt nur die Analysen erneut
    an, die von der Wettbewerber-Liste abhängen:

    1. analyze_sources_for_topic: baut Content-Profile für die gerade
       bestätigten Domains, falls die noch fehlen (siehe source_analysis.py,
       dort gecacht pro Domain, ein zweiter Aufruf hier kostet für schon
       analysierte Domains nichts).
    2. generate_opportunities: Opportunity 4 (ai_visible_competitor_
       dominates) kann jetzt erst greifen, weil sie die bestätigten
       Wettbewerber-Domains braucht.
    3. generate_gap_analysis: competitor_insights war bis jetzt leer
       (siehe generate_gap_analysis-Guard "keine Wettbewerber-Daten"),
       kann jetzt erst etwas liefern.

    generate_summary wird HIER bewusst NICHT erneut angestoßen: dieser
    Endpunkt kann jederzeit durch eine MANUELLE Bestätigung ausgelöst
    werden (POST /confirm-competitors), nicht nur beim Erstlauf, und die
    Zusammenfassung soll laut Kundenentscheid vom 15.09.2026 NUR monatlich
    laufen (siehe claude_summary.py), nicht bei jeder Wettbewerber-
    Anpassung neu. Sie zieht mit der nächsten monatlichen Generierung
    nach. GEÄNDERT (15.09.2026): seit demselben Tag hängt generate_summary
    inhaltlich SEHR WOHL an competitor_domains (competitor_strength/
    phase_summaries brauchen competitor_insights/content_gaps) — deshalb
    ruft _collect_and_analyze_background (main.py) generate_summary jetzt
    bewusst ERST NACH dieser Funktion auf, einmalig beim Erstlauf, siehe
    dort.
    
    GEÄNDERT (20.09.2026): läuft über den Step-Tracker (siehe step_tracker.py),
    jeder Teilschritt hat damit einen eigenen Status und einen gezielten Retry.
    include_action_plan=False wird vom Erstlauf genutzt, der den Aktionsplan
    danach ohnehin selbst erzeugt. Gibt True zurück, wenn alle Schritte
    erfolgreich waren.
    """
    steps = ["source_analysis", "opportunities", "gap_analysis"]
    # NEU (16.09.2026): Aktionsplan nach Wettbewerber-Bestätigung neu
    # generieren, damit die frisch bestätigten Wettbewerber sofort in den
    # Empfehlungen berücksichtigt werden.
    if include_action_plan:
        steps.append("action_plan")
    all_ok = True
    for step in steps:
        if not run_step(topic_id, step, triggered_by=triggered_by).ok:
            all_ok = False
    return all_ok


@app.post("/topics")
def create_topic_endpoint(
    payload: CreateTopicRequest,
    background_tasks: BackgroundTasks,
    member_id: str = Depends(require_member),
):
    """
    So wie ein echter Nutzer es später aufrufen würde: Topic sofort anlegen
    (inkl. Limit-Check), Datensammlung + Opportunity-Analyse laufen im
    Hintergrund weiter. Antwort kommt in Millisekunden, nicht erst nach
    10-20 Sekunden.

    GEÄNDERT (14.09.2026): ist kein Slot mehr frei, wird nicht mehr sofort
    mit 403 abgelehnt, sondern geprüft, ob sich zumindest ein Platz
    reservieren lässt (usage['queueable'], siehe get_topic_usage in
    run_topic.py: mehr anstehende Deaktivierungen als bereits wartende
    Themen). Wenn ja: Thema wird mit status='queued' angelegt, KEIN
    Hintergrund-Datenlauf wird gestartet (das passiert erst bei der
    Beförderung, siehe enforce_scheduled_archivals in run_topic.py).
    Beförderung erfolgt, sobald ein Slot wirklich frei ist: entweder weil ein
    deaktiviertes Thema am Ende seines Monatszyklus archiviert wurde (bis dahin
    läuft es weiter und hält den Slot) oder weil ein Slot dazugekauft wurde
    (dann beim nächsten Lauf des Retry-Crons, ohne Verzögerung). Ist
    wirklich gar nichts reservierbar, bleibt es beim bisherigen 403.

    GEÄNDERT: ruft dafür get_topic_usage() jetzt direkt auf statt wie
    vorher check_topic_limit() (das intern dieselbe Funktion aufruft, aber
    nur wirft/nicht wirft, ohne den usage-dict inkl. queueable
    zurückzugeben) — vermeidet einen zweiten, redundanten Datenbank-Call im
    "kein Slot frei"-Fall. Fehlertext ist bewusst identisch zu vorher
    (check_topic_limit's ValueError-Text), damit sich am Frontend
    (state.createError = e.message) nichts ändert.
    """
    team_id = _resolve_team_id(member_id)

    try:
        usage = get_topic_usage(team_id)
    except Exception as e:
        logger.exception("Fehler beim Limit-Check für Team %s", team_id)
        raise HTTPException(status_code=500, detail=f"Limit-Check fehlgeschlagen: {e}")

    is_queued = False
    if usage["current_count"] >= usage["limit"]:
        if not usage.get("queueable"):
            raise HTTPException(
                status_code=403,
                detail=f"Topic-Limit erreicht ({usage['current_count']}/{usage['limit']}). Weiteres Topic-Slot nötig.",
            )
        is_queued = True

    try:
        project = get_project(payload.project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Fehler beim Laden des Projekts %s", payload.project_id)
        raise HTTPException(status_code=500, detail=f"Projekt konnte nicht geladen werden: {e}")

    if project["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    try:
        topic_id = create_topic(
            team_id, payload.project_id, payload.topic_name, payload.seed_keyword,
            status="queued" if is_queued else "collecting",
        )
    except Exception as e:
        logger.exception("Fehler beim Anlegen des Topics '%s'", payload.topic_name)
        raise HTTPException(status_code=500, detail=f"Topic konnte nicht angelegt werden: {e}")

    # NEU (23.09.2026): Zielgruppe und Buying Center speichern, BEVOR der
    # Hintergrund-Lauf die Prompts generiert. Ein Fehler hier bricht das
    # Anlegen nicht ab, das Topic läuft dann ohne Rollen (bisheriges Verhalten).
    if payload.target_group:
        try:
            supabase.table("ai_visibility_topics").update(
                {"target_group": payload.target_group}
            ).eq("id", topic_id).execute()
        except Exception:
            logger.exception("Konnte target_group für Topic %s nicht speichern", topic_id)
    if payload.buying_center:
        try:
            save_topic_buying_center(
                topic_id, payload.project_id, [r.model_dump() for r in payload.buying_center],
            )
        except Exception:
            logger.exception("Konnte Buying Center für Topic %s nicht speichern", topic_id)

    if is_queued:
        return {"status": "queued", "topic_id": topic_id}

    # GEÄNDERT (14.09.2026): früher wurde hier erst der Team-Owner aufgelöst
    # (get_team_owner_id) und NUR dessen GSC-Verbindung berücksichtigt. Das
    # schlug fehl, wenn ein anderes Team-Mitglied die GSC-Verbindung
    # hergestellt hatte (siehe Chat-Verlauf 14.09.2026). google_search_console.py
    # berücksichtigt jetzt Verbindungen ALLER Team-Mitglieder, deshalb reicht
    # hier direkt team_id, kein Auflösen/Fehlerfall mehr nötig.
    background_tasks.add_task(
        _collect_and_analyze_background, topic_id, payload.seed_keyword, project["domain"],
        project["language_code"], project["location_name"], payload.sample_prompts, team_id,
    )

    return {"status": "collecting", "topic_id": topic_id}

# ── NEU (23.09.2026): Buying Center ─────────────────────────────────────────

@app.post("/projects/{project_id}/buying-center/suggest")
def suggest_buying_center_endpoint(
    project_id: str, payload: BuyingCenterSuggestRequest, member_id: str = Depends(require_member),
):
    """
    Buying-Center-Vorschlag für ein Topic, das gerade im Anlege-Dialog steht
    (deshalb project_id statt topic_id). Speichert nichts, der Nutzer
    bestätigt/ändert und schickt die Rollen mit POST /topics mit.
    Synchroner Claude-Call, dauert ca. 10-20 Sekunden.
    """
    team_id = _resolve_team_id(member_id)
    try:
        project = get_project(project_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    if project["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    try:
        return suggest_buying_center(
            project, payload.topic_name, payload.seed_keyword, payload.target_group, payload.offer_url,
        )
    except Exception as e:
        logger.exception("Buying-Center-Vorschlag fehlgeschlagen für Projekt %s", project_id)
        raise HTTPException(status_code=502, detail=f"Vorschlag konnte nicht erstellt werden: {e}")


def _topic_role_names(topic_id: str) -> dict[str, str]:
    """role_id -> Rollenname für alle Rollen des Topics."""
    return {r["role_id"]: r["rolle"] for r in get_topic_buying_center(topic_id)}


def _load_topic_for_member(topic_id: str, member_id: str) -> dict:
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics").select("id, team_id, project_id").eq("id", topic_id).single().execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)
    return topic


def _buying_center_response(topic: dict) -> dict:
    roles = get_topic_buying_center(topic["id"])
    active = (
        supabase.table("prompts").select("id, role_id, source").eq("topic_id", topic["id"])
        .eq("prompt_type", "stable_core").eq("is_active", True).execute()
    ).data
    counts: dict[str, int] = {}
    for p in active:
        if p.get("role_id"):
            counts[p["role_id"]] = counts.get(p["role_id"], 0) + 1
    for r in roles:
        r["prompt_count"] = counts.get(r["role_id"], 0)
    library = (
        supabase.table("buying_center_roles").select("name").eq("project_id", topic["project_id"]).order("name").execute()
    ).data
    return {
        "topic_id": topic["id"],
        "rollen": roles,
        "bibliothek": [row["name"] for row in library],
        "budget": get_prompt_budget(topic["id"], active),
        "prompts_ohne_rolle": sum(1 for p in active if not p.get("role_id")),
    }


def _fill_roles_safely(topic_id: str) -> dict:
    try:
        return fill_underrepresented_roles(topic_id)
    except Exception as e:
        logger.exception("Rollen-Prompts für Topic %s konnten nicht ergänzt werden", topic_id)
        return {"erstellt": {}, "fehlende_plaetze": {}, "grund": "fehler", "fehler": str(e)}


@app.get("/topics/{topic_id}/buying-center")
def get_buying_center_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    topic = _load_topic_for_member(topic_id, member_id)
    return _buying_center_response(topic)


@app.put("/topics/{topic_id}/buying-center")
def save_buying_center_endpoint(
    topic_id: str, payload: SaveBuyingCenterRequest, member_id: str = Depends(require_member),
):
    """
    Buying Center eines bestehenden Topics ersetzen. Arbeitet mit derselben
    Logik wie das manuelle Deaktivieren/Hinzufügen von Prompts und gilt ab
    dem nächsten regulären Lauf:
    - Prompts einer ENTFERNTEN Rolle werden deaktiviert (Historie bleibt).
    - Für Rollen mit weniger als 2 Prompts werden neue Prompts erzeugt,
      soweit freie System-Plätze vorhanden sind (siehe get_prompt_budget).
    - Motivation/Einwand ändern lässt bestehende Prompts unangetastet.
    Synchron, damit der Nutzer direkt sieht, was passiert ist.
    """
    topic = _load_topic_for_member(topic_id, member_id)
    old_role_ids = set(_topic_role_names(topic_id).keys())
    if len(payload.rollen) > 3:
        raise HTTPException(status_code=400, detail="Höchstens 3 Rollen je Thema.")

    try:
        save_topic_buying_center(topic_id, topic["project_id"], [r.model_dump() for r in payload.rollen])
    except Exception as e:
        logger.exception("Buying Center für Topic %s konnte nicht gespeichert werden", topic_id)
        raise HTTPException(status_code=500, detail=f"Speichern fehlgeschlagen: {e}")

    removed = list(old_role_ids - set(_topic_role_names(topic_id).keys()))
    deactivated = 0
    if removed:
        try:
            rows = (
                supabase.table("prompts").update({"is_active": False})
                .eq("topic_id", topic_id).eq("is_active", True).in_("role_id", removed).execute()
            ).data
            deactivated = len(rows or [])
        except Exception:
            logger.exception("Prompts entfernter Rollen für Topic %s nicht deaktivierbar", topic_id)

    # NEU (23.09.2026): Wurde eine Einstiegsphase nach hinten verschoben,
    # werden die Prompts dieser Rolle in Phasen davor deaktiviert. Sonst stünden
    # Messwerte in Zellen, die "steigt später ein" anzeigen.
    phase_order = ["exploration", "evaluation", "comparison", "decision"]
    for role in get_topic_buying_center(topic_id):
        entry = role.get("einstiegsphase") or "exploration"
        earlier = phase_order[:phase_order.index(entry)] if entry in phase_order else []
        if not earlier:
            continue
        try:
            rows = (
                supabase.table("prompts").update({"is_active": False})
                .eq("topic_id", topic_id).eq("is_active", True).eq("role_id", role["role_id"])
                .in_("messymiddle_phase", earlier).execute()
            ).data
            deactivated += len(rows or [])
        except Exception:
            logger.exception("Prompts vor der Einstiegsphase für Topic %s nicht deaktivierbar", topic_id)

    fill = _fill_roles_safely(topic_id)
    return {**_buying_center_response(topic), "deaktiviert": deactivated, "ergaenzung": fill}


@app.post("/topics/{topic_id}/buying-center/fill")
def fill_buying_center_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    """Fehlende Rollen-Prompts erneut ergänzen, z. B. nachdem der Nutzer
    Prompts deaktiviert hat, um Plätze frei zu machen."""
    topic = _load_topic_for_member(topic_id, member_id)
    fill = _fill_roles_safely(topic_id)
    return {**_buying_center_response(topic), "deaktiviert": 0, "ergaenzung": fill}


@app.patch("/topics/{topic_id}/prompts/{prompt_id}/role")
def set_prompt_role_endpoint(
    topic_id: str, prompt_id: str, payload: SetPromptRoleRequest, member_id: str = Depends(require_member),
):
    """
    Einem bestehenden Prompt eine Rolle zuordnen. Ändert den Prompt-Text
    nicht, der Verlauf bleibt erhalten. Wichtigster Weg, um Themen, die vor
    dem Buying Center angelegt wurden, nachträglich Rollen zu geben.
    """
    _load_topic_for_member(topic_id, member_id)
    role_name = None
    if payload.role_id:
        role_name = _topic_role_names(topic_id).get(payload.role_id)
        if not role_name:
            raise HTTPException(status_code=400, detail="Diese Rolle gehört nicht zu diesem Thema")
    try:
        prompt_row = supabase.table("prompts").select("id, topic_id").eq("id", prompt_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Prompt nicht gefunden")
    if not prompt_row or prompt_row.get("topic_id") != topic_id:
        raise HTTPException(status_code=404, detail="Prompt gehört nicht zu diesem Topic")

    supabase.table("prompts").update({"role_id": payload.role_id, "persona": role_name}).eq("id", prompt_id).execute()
    return {"status": "ok", "prompt_id": prompt_id, "role_id": payload.role_id, "persona": role_name}


@app.post("/topics/{topic_id}/archive")
def archive_topic_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    """
    GEÄNDERT (14.09.2026): Deaktivieren archiviert nicht mehr sofort,
    sondern markiert das Thema nur zur Deaktivierung vor
    (archive_effective_at = Ende des laufenden Monatszyklus). status
    bleibt bewusst 'active', damit der Cron (get_due_topics) bis dahin
    ganz normal weiterläuft — das Thema soll ja "den Monatszyklus zu
    Ende" laufen. Die tatsächliche Archivierung übernimmt
    enforce_scheduled_archivals() (siehe run_topic.py), aufgerufen aus
    _retry_failed_background unten, alle 15-30 Minuten.

    Begründung fürs Timing: eine sofortige Archivierung + sofortiges
    Anlegen eines neuen Themas hätte sonst einen laufenden Monatszyklus
    verworfen (Geld für DataForSEO/ChatGPT/Gemini-Calls schon
    ausgegeben) UND dem neuen Thema sofort einen weiteren vollen Lauf
    beschert (siehe create_topic_endpoint/enforce_scheduled_archivals
    für die zweite Hälfte der Lösung).

    status='queued' ist ein Sonderfall: ein wartendes Thema hat noch NIE
    einen Zyklus gestartet (kein Slot, kein Cron-Lauf, keine Kosten
    angefallen), "zu Ende laufen lassen" ergibt hier keinen Sinn -> wird
    sofort archiviert, wie im alten Verhalten.

    GEÄNDERT (14.09.2026): status='collecting' blockiert nur noch, wenn
    es INNERHALB der erwarteten Dauer liegt (siehe
    _stuck_collecting_minutes) — läuft ein Thema länger als
    STUCK_COLLECTING_THRESHOLD_MINUTES, gilt es als hängengeblieben (z.B.
    Server-Neustart mitten im Erstlauf, siehe Chat-Verlauf 14.09.2026) und
    lässt sich wie ein 'queued'-Thema sofort deaktivieren, statt auf einen
    Task zu warten, der gar nicht mehr läuft.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id, status, last_monthly_collection_at, created_at, collecting_started_at")
            .eq("id", topic_id)
            .single()
            .execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    if topic["status"] == "archived":
        return {"status": "archived", "topic_id": topic_id}  # idempotent

    if topic["status"] == "collecting":
        stuck_minutes = _stuck_collecting_minutes(topic)
        if stuck_minutes < STUCK_COLLECTING_THRESHOLD_MINUTES:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Thema läuft gerade noch (erster Datenlauf, seit {int(stuck_minutes)} Minute(n)), "
                    "bitte warten bis das abgeschlossen ist."
                ),
            )
        logger.warning(
            "Topic %s hing %d Minute(n) in 'collecting', wird über /archive sofort deaktiviert",
            topic_id, int(stuck_minutes),
        )
        try:
            supabase.table("ai_visibility_topics").update({"status": "archived"}).eq("id", topic_id).execute()
        except Exception as e:
            logger.exception("Fehler beim Deaktivieren des hängengebliebenen Topics %s", topic_id)
            raise HTTPException(status_code=500, detail=f"Thema konnte nicht deaktiviert werden: {e}")
        return {"status": "archived", "topic_id": topic_id}

    if topic["status"] == "queued":
        try:
            supabase.table("ai_visibility_topics").update({"status": "archived"}).eq("id", topic_id).execute()
        except Exception as e:
            logger.exception("Fehler beim Archivieren von wartendem Topic %s", topic_id)
            raise HTTPException(status_code=500, detail=f"Thema konnte nicht deaktiviert werden: {e}")
        return {"status": "archived", "topic_id": topic_id}

    # status == 'active': Deaktivierung vormerken statt sofort ausführen.
    anchor = topic.get("last_monthly_collection_at") or topic["created_at"]
    try:
        anchor_dt = datetime.fromisoformat(anchor.replace("Z", "+00:00"))
    except Exception:
        anchor_dt = datetime.now(timezone.utc)
    effective_at = anchor_dt + timedelta(days=30)

    try:
        supabase.table("ai_visibility_topics").update({
            "archive_effective_at": effective_at.isoformat(),
        }).eq("id", topic_id).execute()
    except Exception as e:
        logger.exception("Fehler beim Vormerken der Deaktivierung für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Thema konnte nicht zur Deaktivierung vorgemerkt werden: {e}")

    return {"status": "active", "topic_id": topic_id, "archive_effective_at": effective_at.isoformat()}


@app.delete("/topics/{topic_id}")
def delete_topic_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    """
    NEU (14.09.2026): endgültiges Löschen, NUR für Themen ohne einen
    einzigen ausgewerteten Lauf (siehe Chat-Verlauf 14.09.2026: "aus der
    Warteschlange deaktiviert, bevor der erste Durchlauf stattfand").

    Bewusst über die tatsächliche ai_runs-Anzahl geprüft, nicht nur über
    status == 'queued' — deckt damit auch ältere, schon archivierte
    Themen mit ab, die nie einen Lauf hatten (z.B. vor dieser Änderung
    archiviert), ohne sich auf einen historisch korrekten Status
    verlassen zu müssen. Sobald auch nur ein Lauf existiert, gilt ein
    Thema als historisch wertvoll — dafür bleibt es bei archivieren/
    reaktivieren (siehe archive_topic_endpoint), ein Hard-Delete würde
    diese Historie unwiderruflich verlieren.

    Kaskadiert über die bestehenden ON DELETE CASCADE-Fremdschlüssel auf
    prompts/search_queries/opportunities/content_ideas/topic_changelog/
    content_gaps/competitor_insights — kein manuelles Aufräumen dieser
    Tabellen nötig.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id, status")
            .eq("id", topic_id)
            .single()
            .execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    if topic["status"] == "collecting":
        raise HTTPException(
            status_code=409,
            detail="Thema läuft gerade noch (erster Datenlauf), bitte warten oder danach löschen.",
        )

    try:
        run_count = (
            supabase.table("ai_runs")
            .select("id", count="exact")
            .eq("topic_id", topic_id)
            .execute()
        ).count or 0
    except Exception:
        logger.exception("Fehler beim Prüfen vorhandener Läufe für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail="Konnte nicht prüfen, ob das Thema bereits Läufe hat")

    if run_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Thema hat bereits ausgewertete Läufe und kann nicht gelöscht werden, nur archiviert.",
        )

    try:
        supabase.table("ai_visibility_topics").delete().eq("id", topic_id).execute()
    except Exception as e:
        logger.exception("Fehler beim Löschen von Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Thema konnte nicht gelöscht werden: {e}")

    return {"status": "deleted", "topic_id": topic_id}


@app.post("/topics/{topic_id}/cancel-archive")
def cancel_archive_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    """
    NEU (14.09.2026): Gegenstück zur Vormerkung oben — "Deaktivierung
    abbrechen", solange das Thema noch 'active' ist und archive_effective_at
    noch nicht erreicht wurde (enforce_scheduled_archivals hätte es sonst
    schon archiviert). Setzt archive_effective_at zurück auf NULL, der
    Cron läuft für dieses Thema unverändert normal weiter, als wäre nie
    deaktiviert worden.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id, status, archive_effective_at")
            .eq("id", topic_id)
            .single()
            .execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    if topic["status"] != "active" or not topic.get("archive_effective_at"):
        raise HTTPException(
            status_code=409,
            detail="Für dieses Thema steht aktuell keine Deaktivierung aus.",
        )

    try:
        supabase.table("ai_visibility_topics").update({"archive_effective_at": None}).eq("id", topic_id).execute()
    except Exception as e:
        logger.exception("Fehler beim Abbrechen der Deaktivierung für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Deaktivierung konnte nicht abgebrochen werden: {e}")

    return {"status": "active", "topic_id": topic_id}

@app.post("/topics/{topic_id}/reactivate")
def reactivate_topic_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    """
    NEU (14.09.2026): Gegenstück zu archive_topic_endpoint. Reaktiviert nur,
    wenn noch ein freier Topic-Slot verfügbar ist — dieselbe Prüfung wie
    beim Neuanlegen (siehe check_topic_limit in create_topic_endpoint),
    damit sich das Limit auf keinem der beiden Wege umgehen lässt.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id, status").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    if topic["status"] != "archived":
        raise HTTPException(
            status_code=409,
            detail=f"Reaktivieren nur für archivierte Topics möglich (aktuell: '{topic['status']}').",
        )

    try:
        check_topic_limit(team_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.exception("Fehler beim Limit-Check für Team %s (Reaktivieren)", team_id)
        raise HTTPException(status_code=500, detail=f"Limit-Check fehlgeschlagen: {e}")

    try:
        supabase.table("ai_visibility_topics").update({"status": "active"}).eq("id", topic_id).execute()
    except Exception as e:
        logger.exception("Fehler beim Reaktivieren von Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Thema konnte nicht aktiviert werden: {e}")

    return {"status": "active", "topic_id": topic_id}


@app.post("/run-topic")
def run_topic_endpoint(payload: RunTopicRequest, member_id: str = Depends(require_member)):
    team_id = _resolve_team_id(member_id)

    try:
        topic_id = run(
            team_id=team_id,
            topic_name=payload.topic_name,
            seed_keyword=payload.seed_keyword,
            own_domain=payload.own_domain,
            sample_prompts=payload.sample_prompts,
        )
    except Exception as e:
        logger.exception("Fehler beim Datenlauf für Topic '%s'", payload.topic_name)
        raise HTTPException(status_code=500, detail=f"Datenlauf fehlgeschlagen: {e}")

    opportunities_created = 0
    try:
        opportunities_created = generate_opportunities(topic_id)
    except Exception:
        # Datenlauf war erfolgreich, nur die Opportunity-Analyse ist
        # fehlgeschlagen. Nicht den ganzen Request als Fehler zurückgeben,
        # aber klar loggen und im Response sichtbar machen.
        logger.exception("Opportunity-Analyse fehlgeschlagen für Topic %s", topic_id)

    try:
        generate_summary(topic_id)
    except Exception:
        logger.exception("Claude-Zusammenfassung fehlgeschlagen für Topic %s", topic_id)

    try:
        generate_gap_analysis(topic_id)
    except Exception:
        logger.exception("Lücken-Analyse fehlgeschlagen für Topic %s", topic_id)

    return {
        "status": "ok",
        "topic_id": topic_id,
        "opportunities_created": opportunities_created,
    }


@app.post("/generate-opportunities/{topic_id}")
def generate_opportunities_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    team_id = _resolve_team_id(member_id)

    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception as e:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        created = generate_opportunities(topic_id)
    except Exception as e:
        logger.exception("Fehler bei Opportunity-Analyse für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Opportunity-Analyse fehlgeschlagen: {e}")

    try:
        generate_summary(topic_id)
    except Exception:
        logger.exception("Claude-Zusammenfassung fehlgeschlagen für Topic %s", topic_id)

    try:
        generate_gap_analysis(topic_id)
    except Exception:
        logger.exception("Lücken-Analyse fehlgeschlagen für Topic %s", topic_id)

    return {"status": "ok", "topic_id": topic_id, "opportunities_created": created}


@app.post("/topics/{topic_id}/generate-action-plan")
def generate_action_plan_endpoint(
    topic_id: str,
    background_tasks: BackgroundTasks,
    member_id: str = Depends(require_member),
):
    """Aktionsplan für ein Topic manuell (neu) generieren.

    Nützlich wenn der erste automatische Lauf ohne Ergebnis blieb (z.B. weil
    die Prompts noch keine Phasenzuordnung hatten). Prüft Team-Zugehörigkeit
    und startet die Generierung im Hintergrund (gibt sofort 202 zurück).
    Das Frontend pollt /topics/{id} bis action_plan.generated_at gesetzt ist.

    NEU (17.09.2026): Async via BackgroundTasks (war synchron → 60s Timeout).
    """
    team_id = _resolve_team_id(member_id)

    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id, status")
            .eq("id", topic_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    if topic.get("status") in ("collecting", "analyzing"):
        raise HTTPException(
            status_code=409,
            detail="Das Thema wird gerade analysiert. Bitte warten, bis der Lauf abgeschlossen ist.",
        )

    # GEÄNDERT (20.09.2026): läuft über den Step-Tracker, damit Status und
    # Fehlerprotokoll wie bei jedem anderen Schritt geführt werden.
    mark_step_running(topic_id, "action_plan")
    background_tasks.add_task(retry_step, topic_id, "action_plan")
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=202,
        content={"status": "pending", "topic_id": topic_id},
    )


# ── Action-Plan: Erledigt-Toggle ───────────────────────────────────────────────

class ToggleActionPlanItemRequest(BaseModel):
    """NEU (17.09.2026): Markiert ein Aktionsplan-Item als erledigt oder offen.

    item_index: 0-basierter Index des Items im items[]-Array des Plans.
    item_title: Titel des Items (fuer den Changelog-Eintrag / Chart-Marker).
    item_phase: Phase des Items ("exploration" | "evaluation" | "comparison" | "decision").
    complete: True = erledigt markieren, False = Erledigung rueckgaengig machen.
    """
    item_index: int
    item_title: str
    item_phase: str
    complete: bool


@app.post("/topics/{topic_id}/action-plan/toggle-item")
def toggle_action_plan_item_endpoint(
    topic_id: str,
    payload: ToggleActionPlanItemRequest,
    member_id: str = Depends(require_member),
):
    """NEU (17.09.2026): Markiert ein Aktionsplan-Item als erledigt/offen.

    GEAENDERT (18.09.2026): Frueher wurden bei complete=True ZWEI Eintraege
    angelegt (content_changes UND topic_changelog). Da die "Aenderungs-
    Chronik" im Frontend beide Quellen zu einer gemeinsamen Timeline
    zusammenfuehrt (siehe renderMessyMiddleTab, "combined"-Array), erschien
    die Erledigung dort faktisch doppelt, zusaetzlich zum eigenen Eintrag in
    "Content-Aenderungen & Events". Jetzt wird NUR NOCH content_changes
    befuellt, mit dem eigenen change_type='aktionsplan' (statt 'sonstiges'),
    damit das Frontend diese Eintraege gezielt aus der kombinierten
    Aenderungs-Chronik herausfiltern kann (sie bleiben dort exklusiv in
    "Content-Aenderungen & Events" sichtbar) und im Trend-Chart trotzdem als
    Marker erscheinen — dafuer werden content_changes-Eintraege weiterhin
    genutzt.

    GEAENDERT (18.09.2026), zweite Aenderung: Bei complete=False (Erledigung
    rueckgaengig) wird der zugehoerige content_changes-Eintrag jetzt WIEDER
    ENTFERNT. Die Zuordnung Action-Item -> content_change-Zeile liegt dafuer
    in der neuen Spalte action_plans.completed_item_content_change_ids
    (JSONB-Objekt {"<item_index>": "<content_change.id>"}), siehe
    ALTER-TABLE-Statement:

        ALTER TABLE action_plans
          ADD COLUMN IF NOT EXISTS completed_item_content_change_ids JSONB NOT NULL DEFAULT '{}'::jsonb;

    Fuer Items, die VOR dieser Migration erledigt wurden (also keinen
    Eintrag in dieser Spalte haben), faellt der Code auf den alten Text-
    Match (Topic + exakte Beschreibung) zurueck — kein Backfill noetig.
    Zur Sicherheit werden dabei auch evtl. noch vorhandene topic_changelog-
    Eintraege aus der Zeit vor der ersten Aenderung (Soft-Delete, wie im
    regulaeren delete_changelog_entry_endpoint) mit aufgeraeumt; dafuer gab
    es nie eine id-Spalte, hier bleibt der Text-Match dauerhaft bestehen.
    """
    team_id = _resolve_team_id(member_id)

    # Sicherheitscheck: Topic gehoert zu diesem Team
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id, name")
            .eq("id", topic_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    # Action-Plan-Zeile fuer dieses Topic holen (neuester Plan)
    try:
        plan_rows = (
            supabase.table("action_plans")
            .select("id, items, completed_item_indices, completed_item_content_change_ids")
            .eq("topic_id", topic_id)
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
        ).data
    except Exception:
        logger.exception("Fehler beim Laden des Action-Plans fuer Toggle (topic_id=%s)", topic_id)
        raise HTTPException(status_code=500, detail="Konnte Aktionsplan nicht laden")

    if not plan_rows:
        raise HTTPException(status_code=404, detail="Kein Aktionsplan fuer dieses Topic gefunden")

    plan_row = plan_rows[0]
    plan_id = plan_row["id"]
    current_completed: list[int] = plan_row.get("completed_item_indices") or []
    # JSONB-Objekt {"<item_index>": "<content_change.id>"} — Keys sind immer
    # Strings (JSON kennt keine numerischen Objektschluessel), item_index
    # deshalb bei jedem Zugriff ueber idx_key in einen String umgewandelt.
    content_change_map: dict[str, str] = plan_row.get("completed_item_content_change_ids") or {}

    # Toggle: hinzufuegen oder entfernen
    idx = payload.item_index
    idx_key = str(idx)
    if payload.complete:
        if idx not in current_completed:
            current_completed = sorted(set(current_completed) | {idx})
    else:
        current_completed = [i for i in current_completed if i != idx]

    # completed_item_indices in Supabase aktualisieren — das ist der
    # kritische Teil (Erledigt-Status selbst), Fehler hier brechen die
    # Anfrage ab. Die Aktualisierung von completed_item_content_change_ids
    # erfolgt bewusst spaeter separat und nicht-fatal (siehe unten).
    try:
        supabase.table("action_plans").update({
            "completed_item_indices": current_completed,
        }).eq("id", plan_id).execute()
    except Exception:
        logger.exception("Fehler beim Aktualisieren von completed_item_indices (plan_id=%s)", plan_id)
        raise HTTPException(status_code=500, detail="Konnte Erledigt-Status nicht speichern")

    content_change = None
    removed_content_change_ids: list[str] = []
    removed_changelog_ids: list[str] = []

    # Deterministischer Text nur noch als Fallback fuer Items ohne Eintrag
    # in content_change_map (vor dieser Migration erledigt) sowie fuer den
    # topic_changelog-Altlasten-Cleanup, siehe Docstring oben.
    description_cc = f"✓ Aktionsplan erledigt [{payload.item_phase}]: {payload.item_title}"[:500]
    description_cl = f"✓ Aktionsplan-Item als erledigt markiert [{payload.item_phase.capitalize()}]: {payload.item_title}"[:1000]

    if payload.complete:
        if idx_key in content_change_map:
            # Schon verknuepft (z.B. Doppel-Klick) — nichts erneut anlegen.
            logger.info(
                "content_change fuer Action-Item bereits verknuepft, ueberspringe Neuanlage (topic_id=%s, item_index=%d)",
                topic_id, idx,
            )
        else:
            # content_changes — erscheint als Marker im Verlaufs-Chart UND in
            # der Liste "Content-Aenderungen & Events". change_type=
            # 'aktionsplan' (nicht mehr 'sonstiges'), damit Frontend/Label
            # diese Eintraege gezielt unterscheiden koennen.
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            # NEU (20.09.2026): die Empfehlung des Items wird als "details"
            # mitgespeichert. Der Aktionsplan wird monatlich neu erzeugt (das
            # alte Item verschwindet), im Änderungsprotokoll stünde sonst nur
            # der Titel. Mit den Details weiß Claude beim nächsten Plan genau,
            # WAS umgesetzt wurde, und empfiehlt es nicht erneut (siehe
            # change_history.py).
            item_details = None
            try:
                raw_items = plan_row.get("items")
                plan_items = json.loads(raw_items) if isinstance(raw_items, str) else (raw_items or [])
                if 0 <= idx < len(plan_items):
                    item_details = (plan_items[idx].get("recommendation") or "").strip()[:800] or None
            except Exception:
                logger.warning("Empfehlung des Action-Items %d konnte nicht gelesen werden (topic_id=%s)", idx, topic_id)
            try:
                cc_result = (
                    supabase.table("content_changes")
                    .insert({
                        "topic_id": topic_id,
                        "changed_at": today_str,
                        "change_type": "aktionsplan",
                        "description": description_cc,
                        "details": item_details,
                        "url": None,
                    })
                    .execute()
                ).data
                content_change = cc_result[0] if cc_result else None
                if content_change:
                    content_change_map[idx_key] = content_change["id"]
                logger.info(
                    "content_change angelegt fuer erledigtes Action-Item (topic_id=%s, item_index=%d)",
                    topic_id, idx,
                )
            except Exception:
                logger.exception(
                    "Fehler beim Anlegen der content_change fuer Action-Item (topic_id=%s, item_index=%d)",
                    topic_id, idx,
                )
                # Nicht fatal — completed_item_indices wurde schon gesetzt
    else:
        # Erledigt-Markierung wurde entfernt: zugehoerigen content_changes-
        # Eintrag wieder loeschen. Bevorzugt ueber die in content_change_map
        # gespeicherte id (robust, funktioniert auch wenn item_title sich
        # zwischenzeitlich geaendert hat); nur wenn die Zuordnung fehlt
        # (Item wurde vor der Migration erledigt), Fallback auf Text-Match.
        cc_id = content_change_map.pop(idx_key, None)
        if cc_id:
            try:
                del_result = (
                    supabase.table("content_changes")
                    .delete()
                    .eq("id", cc_id)
                    .execute()
                ).data
                removed_content_change_ids = [row["id"] for row in (del_result or [])]
            except Exception:
                logger.exception(
                    "Fehler beim Entfernen der content_change (id=%s) fuer zurueckgesetztes Action-Item (topic_id=%s, item_index=%d)",
                    cc_id, topic_id, idx,
                )
                # Nicht fatal — completed_item_indices wurde schon aktualisiert
        else:
            try:
                del_result = (
                    supabase.table("content_changes")
                    .delete()
                    .eq("topic_id", topic_id)
                    .eq("description", description_cc)
                    .execute()
                ).data
                removed_content_change_ids = [row["id"] for row in (del_result or [])]
            except Exception:
                logger.exception(
                    "Fehler beim Entfernen der content_change (Text-Match) fuer zurueckgesetztes Action-Item (topic_id=%s, item_index=%d)",
                    topic_id, idx,
                )
                # Nicht fatal — completed_item_indices wurde schon aktualisiert

        if removed_content_change_ids:
            logger.info(
                "content_change(s) entfernt fuer zurueckgesetztes Action-Item (topic_id=%s, item_index=%d, ids=%s)",
                topic_id, idx, removed_content_change_ids,
            )

        # Ebenso etwaige topic_changelog-Eintraege aus der Zeit vor dieser
        # Aenderung aufraeumen (Soft-Delete, wie delete_changelog_entry_endpoint).
        try:
            deleter = _resolve_member_user(member_id)
            cl_del_result = (
                supabase.table("topic_changelog")
                .update({
                    "deleted_at": datetime.now(timezone.utc).isoformat(),
                    "deleted_by_name": deleter.get("firstname"),
                    "deleted_by_member_id": deleter.get("id"),
                })
                .eq("topic_id", topic_id)
                .eq("entry_text", description_cl)
                .is_("deleted_at", "null")
                .execute()
            ).data
            removed_changelog_ids = [row["id"] for row in (cl_del_result or [])]
            if removed_changelog_ids:
                logger.info(
                    "topic_changelog-Eintrag(e) entfernt fuer zurueckgesetztes Action-Item (topic_id=%s, item_index=%d, ids=%s)",
                    topic_id, idx, removed_changelog_ids,
                )
        except Exception:
            logger.exception(
                "Fehler beim Entfernen des changelog-Eintrags fuer zurueckgesetztes Action-Item (topic_id=%s, item_index=%d)",
                topic_id, idx,
            )
            # Nicht fatal

    # completed_item_content_change_ids separat und nicht-fatal speichern:
    # der wichtige Erledigt-Status (completed_item_indices) ist zu diesem
    # Zeitpunkt bereits persistiert; schlaegt dieser Schreibvorgang fehl,
    # faellt der naechste Toggle-Versuch fuer dieses Item einfach wieder auf
    # den Text-Match-Fallback zurueck (siehe oben).
    try:
        supabase.table("action_plans").update({
            "completed_item_content_change_ids": content_change_map,
        }).eq("id", plan_id).execute()
    except Exception:
        logger.exception(
            "Fehler beim Aktualisieren von completed_item_content_change_ids (plan_id=%s)", plan_id,
        )

    return {
        "status": "ok",
        "completed_item_indices": current_completed,
        "content_change": content_change,
        "removed_content_change_ids": removed_content_change_ids,
        "removed_changelog_ids": removed_changelog_ids,
    }


@app.get("/topics")
def list_topics(member_id: str = Depends(require_member)):
    team_id = _resolve_team_id(member_id)
    try:
        topics = (
            supabase.table("ai_visibility_topics")
            .select("id, project_id, name, seed_keyword, own_domain, status, created_at, archive_effective_at, last_monthly_collection_at, collecting_started_at")
            .eq("team_id", team_id)
            .order("created_at", desc=True)
            .execute()
        ).data
    except Exception as e:
        logger.exception("Fehler beim Laden der Topic-Liste")
        raise HTTPException(status_code=500, detail=f"Konnte Topics nicht laden: {e}")

    # Opportunity-Anzahl: eine einzige Batch-Abfrage statt N+1 per-topic-Queries.
    # Vorher: für jedes Topic SELECT count(*) WHERE topic_id = X  -> N Requests
    # Jetzt:  SELECT topic_id WHERE topic_id IN (...) -> 1 Request + Zaehlen in Python
    topic_ids = [t["id"] for t in topics]
    opp_counts: dict = {t["id"]: 0 for t in topics}
    if topic_ids:
        try:
            opp_rows = (
                supabase.table("opportunities")
                .select("topic_id")
                .in_("topic_id", topic_ids)
                .execute()
            ).data
            for row in (opp_rows or []):
                tid = row.get("topic_id")
                if tid in opp_counts:
                    opp_counts[tid] += 1
        except Exception:
            logger.exception("Fehler beim Batch-Zaehlen der Opportunities")
            opp_counts = {t["id"]: None for t in topics}
    for topic in topics:
        topic["opportunities_count"] = opp_counts.get(topic["id"], 0)

    return {"topics": topics}


@app.get("/topics/{topic_id}")
def get_topic_detail(topic_id: str, member_id: str = Depends(require_member)):
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics").select("*").eq("id", topic_id).single().execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        opportunities = (
            supabase.table("opportunities")
            .select("*")
            .eq("topic_id", topic_id)
            .order("created_at", desc=True)
            .execute()
        ).data
        # ANMERKUNG (14.09.2026): Opportunities bewusst NICHT mit Phase
        # getaggt, anders als content_ideas unten. Die opportunities-
        # Tabelle hat weder eine prompt_id- noch eine search_query_id-
        # Spalte (nur topic_id/opportunity_type/title/description/
        # supporting_data/status), und ob/wie supporting_data einen
        # Prompt- oder Keyword-Bezug trägt, entscheidet opportunities.py
        # (liegt hier nicht vor). Ohne das zu raten, bräuchte eine
        # Phasen-Zuordnung entweder eine Schema-Erweiterung (z.B.
        # prompt_id/search_query_id-Spalte auf opportunities) oder eine
        # bestätigte supporting_data-Struktur, aus der main.py den Bezug
        # ableiten könnte.

        # GEÄNDERT (13.09.2026): organic_rank/gsc_impressions/gsc_position/
        # first_seen_at neu dabei, fürs aufklappbare Keyword-Detail im
        # Frontend (siehe renderKeywordExpansion in script.js). Vorher
        # wurden diese Spalten geladen (opportunities.py nutzt sie längst),
        # aber nie ans Frontend durchgereicht.
        # GEÄNDERT (14.09.2026): gsc_clicks dazu — fehlte hier, obwohl
        # save_gsc_near_miss (run_topic.py) es längst mit speichert.
        # Notwendig, damit die GSC-Tabelle im Frontend eine Klick-Spalte
        # zeigen kann (siehe Chat-Verlauf 14.09.2026: gsc_rows kam bis
        # hierhin nie an, war clientseitig fest auf [] gesetzt).
        # GEÄNDERT (15.09.2026): top_serp_results/serp_features/
        # serp_checked_at dazu (siehe run_topic.py: save_keyword_serp_
        # analysis) — Kundenwunsch: schnelle Einschätzung, ob ein
        # Wettbewerber oder eine neutrale Quelle (z.B. Wikipedia) die SERP
        # dominiert, plus SERP-Feature-Typen fürs Commodity-Risiko.
        search_queries = (
            supabase.table("search_queries")
            .select(
                "id, keyword, search_volume, source, organic_rank, gsc_impressions, gsc_clicks, gsc_position, "
                "page_url, is_near_miss, "
                "first_seen_at, top_serp_results, serp_features, serp_checked_at, "
                "messymiddle_phase, phase_manually_set"
            )
            .eq("topic_id", topic_id)
            # NEU (16.09.2026): deaktivierte Keywords (siehe deactivate_keyword_
            # endpoint) aus der Ansicht ausblenden, analog zum bestehenden
            # is_active-Filter bei prompts weiter unten. Braucht dieselbe
            # Migration (search_queries.is_active), siehe create_manual_
            # keyword_endpoint.
            .eq("is_active", True)
            .order("search_volume", desc=True)
            .execute()
        ).data

        # NEU (20.09.2026): einheitliche Keyword-Einschätzung (siehe
        # keyword_status.py) direkt an jede Zeile angehängt, damit das
        # Frontend nicht selbst nochmal eigene Schwellen für "rankt schon /
        # knapp an Seite 1 / nur Nachfrage / reine Idee" nachbauen muss.
        for q in search_queries:
            status = classify_keyword(q)
            q["keyword_status"] = status["status"]
            q["keyword_status_label"] = status["label"]

        prompts = (
            supabase.table("prompts")
            # NEU (14.09.2026): persona dazu (siehe Migration unten im
            # Modul-Docstring-Bereich sowie prompt_discovery.py) — fürs
            # Rollen-Filter im Prompts-Tab (renderPromptsByPhase).
            # NEU (15.09.2026): ai_search_volume dazu (siehe
            # ai_search_questions.py) — sonst kommt beim Frontend nie an,
            # dass ein Prompt aus einer echten AI-Overview-Frage stammt.
            # NEU (23.09.2026): role_id dazu (Sichtbarkeit je Rolle im Frontend).
            .select("id, prompt_text, prompt_type, messymiddle_phase, persona, role_id, relevance_reason, is_active, intent_cluster_id, source, ai_search_volume, intent_clusters(name, phase)")
            .eq("topic_id", topic_id)
            # GEFIXT (23.09.2026): deactivate_prompt_endpoint verspricht, dass
            # deaktivierte Prompts aus der Ansicht verschwinden, dieser Filter
            # fehlte aber. Deaktivierte Prompts wurden weiter angezeigt.
            .eq("is_active", True)
            .order("prompt_type")
            .execute()
        ).data
    except Exception as e:
        logger.exception("Fehler beim Laden des Topic-Details für %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Konnte Topic-Detail nicht laden: {e}")

    # Bonus-Fix (13.09.2026): visibility_status pro Prompt war bisher immer
    # null (siehe script.js loadTopicDetail, hartcodiert). Jetzt berechnet,
    # siehe _compute_visibility_status_by_prompt. Mutiert die Dicts in
    # `prompts` direkt, das ist dieselbe Liste, die unten zurückgegeben wird.
    status_by_prompt = _compute_visibility_status_by_prompt(topic_id, [p["id"] for p in prompts])
    # NEU (18.09.2026): separater Marker fuer "als Quelle genannt, aber ohne
    # echten Link" — siehe _compute_unlinked_citation_by_prompt.
    unlinked_by_prompt = _compute_unlinked_citation_by_prompt(topic_id, [p["id"] for p in prompts])
    citation_counts_by_prompt = _compute_citation_counts_by_prompt(topic_id, [p["id"] for p in prompts])
    # NEU (23.09.2026): Prompt-Budget fürs Frontend (freie Plätze für eigene Prompts)
    try:
        prompt_budget = get_prompt_budget(topic_id, [p for p in prompts if p.get("prompt_type") == "stable_core"])
    except Exception:
        logger.exception("Prompt-Budget für Topic %s nicht berechenbar", topic_id)
        prompt_budget = None
    for p in prompts:
        p["visibility_status"] = status_by_prompt.get(p["id"])
        p["cited_without_link"] = unlinked_by_prompt.get(p["id"], False)
        counts = citation_counts_by_prompt.get(p["id"])
        p["cited_count"] = counts["cited_count"] if counts else None
        p["total_runs"] = counts["total_runs"] if counts else None

    try:
        content_ideas = get_content_ideas_for_topic(topic_id)
    except Exception:
        # Zusatzauswertung, kein Kernvorgang: ein Fehler hier soll die
        # restliche Detail-Ansicht nicht blockieren, nur leer bleiben.
        logger.exception("Fehler beim Laden der Content-Ideen für Topic %s, Rest der Antwort bleibt unberührt", topic_id)
        content_ideas = []

    # NEU (14.09.2026): Content-Ideen mit der Phase ihres zugehörigen
    # Prompts taggen (content_ideas.prompt_id -> prompts.messymiddle_phase),
    # damit Content-Ideen wie Prompts nach Journey-Phase priorisierbar
    # sind (siehe Chat-Verlauf 14.09.2026). Kein neuer Endpunkt, keine
    # Schema-Änderung nötig, content_ideas.prompt_id ist bereits eine
    # NOT-NULL-Fremdschlüssel-Spalte. Läuft über die bereits geladenen
    # `prompts` statt eines zusätzlichen Datenbank-Roundtrips.
    phase_by_prompt_id = {p["id"]: p.get("messymiddle_phase") for p in prompts}
    for idea in content_ideas:
        idea["phase"] = phase_by_prompt_id.get(idea.get("prompt_id"))

    positioning_insight = _compute_positioning_insight(topic, search_queries)

    try:
        source_profiles = get_source_profiles_for_topic(topic_id)
    except Exception:
        logger.exception("Fehler beim Laden der Quellen-Analysen für Topic %s, Rest der Antwort bleibt unberührt", topic_id)
        source_profiles = []

    # NEU (16.09.2026): Kundenwunsch (siehe Chat-Verlauf 16.09.2026) —
    # Plattform-Übersicht über ALLE zitierten Quellen (nicht nur
    # bestätigte Wettbewerber), gruppiert nach Content-Typ (Forum, Video,
    # Review-Plattform, ...), siehe _get_cited_platforms_overview.
    try:
        cited_platforms = _get_cited_platforms_overview(topic_id)
    except Exception:
        logger.exception("Fehler beim Laden der Plattform-Übersicht für Topic %s, Rest der Antwort bleibt unberührt", topic_id)
        cited_platforms = []

    # NEU (14.09.2026): pro Prompt die meistzitierte Quelle + deren
    # Content-Typ anreichern (siehe _compute_top_cited_domain_by_prompt),
    # fürs "was für Inhalte helfen"-Badge in der Prompt-Zeile
    # (renderPromptsByPhase). profile_by_url nutzt dieselben
    # source_profiles, die auch der Wettbewerber-Tab schon zeigt — keine
    # doppelte Datenhaltung, nur eine zusätzliche Zuordnung pro Prompt.
    # GEÄNDERT (18.09.2026): Zuordnung läuft jetzt über analyzed_url
    # (domain_data["top_url"]) statt über die Domain, weil eine Domain
    # mehrere Content-Typen haben kann (siehe source_analysis.py) — das
    # Badge soll den Typ der tatsächlich meistzitierten Seite zeigen, nicht
    # irgendeinen zufällig zuerst analysierten Typ derselben Domain.
    cited_domain_data_by_prompt = _compute_top_cited_domain_by_prompt(topic_id, [p["id"] for p in prompts])
    profile_by_url = {sp["analyzed_url"]: sp for sp in source_profiles if sp.get("analyzed_url")}
    for p in prompts:
        domain_data = cited_domain_data_by_prompt.get(p["id"])
        top_domain = domain_data["top"] if domain_data else None
        all_domains = domain_data["all"] if domain_data else []
        top_url = domain_data.get("top_url") if domain_data else None
        profile = profile_by_url.get(top_url) if top_url else None
        p["top_cited_domain"] = top_domain
        p["cited_domains"] = all_domains  # Alle zitierten Domains sortiert nach Häufigkeit
        p["top_cited_content_type"] = profile.get("content_type") if profile else None

    # NEU (13.09.2026): fürs Frontend, um die Wettbewerber-Auswertung auf
    # echte Wettbewerber zu filtern statt auf alle zitierten Domains (siehe
    # renderCompetitorInsightSection in script.js).
    # GEÄNDERT (15.09.2026): steht jetzt direkt auf dem Topic (select("*")
    # oben hat die Spalte schon mitgeladen), kein zusätzlicher Query mehr
    # nötig — Wettbewerber sind jetzt ein Topic-Attribut, kein Projekt-
    # Attribut mehr, siehe _get_topic_competitor_domains.
    competitor_domains = topic.get("competitor_domains") or []

    # get_content_gaps_for_topic/get_competitor_insights_for_topic fangen
    # ihre Fehler bereits selbst ab und geben im Fehlerfall [] zurück
    # (siehe gap_analysis.py), daher hier kein zusätzliches try/except nötig.
    content_gaps = get_content_gaps_for_topic(topic_id)
    competitor_insights = get_competitor_insights_for_topic(topic_id)

    # NEU (16.09.2026): Claude-generierter Aktionsplan laden.
    # get_action_plan_for_topic gibt {"items": [], "generated_at": null}
    # zurück wenn noch kein Plan existiert (erster Lauf noch nicht fertig).
    try:
        action_plan = get_action_plan_for_topic(topic_id)
    except Exception:
        logger.exception("Fehler beim Laden des Aktionsplans für Topic %s, Rest der Antwort bleibt unberührt", topic_id)
        action_plan = {"items": [], "generated_at": None}

    try:
        changelog = _get_changelog_for_topic(topic_id)
    except Exception:
        # Wie content_ideas/source_profiles: Zusatzinfo, kein Kernvorgang.
        logger.exception("Fehler beim Laden des Changelogs für Topic %s, Rest der Antwort bleibt unberührt", topic_id)
        changelog = []

    # NEU (15.09.2026): Auf/Ab-Signal pro verknüpftem Keyword, siehe
    # _compute_changelog_keyword_deltas. Fehler hier sollen die restliche
    # Detail-Ansicht nicht blockieren, nur ohne Deltas bleiben.
    try:
        keyword_deltas = _compute_changelog_keyword_deltas(topic_id, changelog, search_queries)
    except Exception:
        logger.exception("Änderungs-Deltas konnten nicht berechnet werden für Topic %s, Rest der Antwort bleibt unberührt", topic_id)
        keyword_deltas = {}
    for entry in changelog:
        entry["keyword_deltas"] = keyword_deltas.get(entry["id"], {})

    # NEU (15.09.2026): "beste Content-Chancen", siehe Chat-Verlauf
    # 15.09.2026 und _compute_best_content_chances weiter unten. Rein
    # deterministisch aus bereits geladenen search_queries/prompts
    # berechnet, kein neuer Query, kein Claude-Call.
    best_content_chances = _compute_best_content_chances(search_queries, prompts)

    # NEU (20.09.2026): Ergänzungen, alle nach dem Muster "Fehler hier
    # blockieren nie die restliche Detail-Ansicht".
    # - ai_knowledge: neuester KI-Wissens-Check (siehe ai_knowledge.py).
    # - change_assessment: Umsetzungsstand und gemessene Wirkung der
    #   Nutzer-Änderungen (siehe change_history.py).
    # - step_status: Schritte, die fehlgeschlagen sind, fehlen oder gerade
    #   laufen, fürs Frontend: pro Eintrag ein "Erneut erstellen"-Button
    #   (siehe step_tracker.py, POST /topics/{id}/retry-step).
    try:
        ai_knowledge = get_ai_knowledge_for_topic(topic_id)
    except Exception:
        logger.exception("KI-Wissens-Check konnte nicht geladen werden (Topic %s), Rest der Antwort bleibt unberührt", topic_id)
        ai_knowledge = None
    try:
        change_assessment = build_change_assessment_for_ui(get_change_assessment(topic_id))
    except Exception:
        logger.exception("Änderungs-Bewertung konnte nicht berechnet werden (Topic %s), Rest der Antwort bleibt unberührt", topic_id)
        change_assessment = {"summary": {"anzahl": 0}, "items": []}
    step_status = get_step_states(topic_id, topic)
    # NEU (20.09.2026): Ziele fuer Bewertungen und Digital PR (zitierte Quellen
    # und Rankings), siehe outreach_targets.py.
    try:
        outreach_targets = targets_for_ui(get_outreach_targets(topic_id))
    except Exception:
        logger.exception("Zielliste konnte nicht geladen werden (Topic %s), Rest der Antwort bleibt unberührt", topic_id)
        outreach_targets = None

    # NEU (20.09.2026): interne Feldnamen aus Nutzertexten entfernen, auch für
    # bereits gespeicherte Altdaten (siehe text_style.sanitize_user_payload).
    # Berührt nur Fließtext-Felder, keine IDs, Enums oder URLs.
    topic["last_run_error"] = sanitize_user_text(topic.get("last_run_error"))
    return sanitize_user_payload({
        "topic": topic, "opportunities": opportunities, "search_queries": search_queries,
        "prompts": prompts, "prompt_budget": prompt_budget, "content_ideas": content_ideas, "positioning_insight": positioning_insight,
        "source_profiles": source_profiles, "competitor_domains": competitor_domains,
        "content_gaps": content_gaps, "competitor_insights": competitor_insights,
        "changelog": changelog, "best_content_chances": best_content_chances,
        "cited_platforms": cited_platforms,
        # NEU (16.09.2026): Claude-generierter Aktionsplan.
        "action_plan": action_plan,
        "ai_knowledge": ai_knowledge,
        "change_assessment": change_assessment,
        "step_status": step_status,
        "outreach_targets": outreach_targets,
    })


def _compute_best_content_chances(search_queries: list, prompts: list) -> list:
    """
    NEU (15.09.2026): Kundenwunsch (siehe Chat-Verlauf 15.09.2026) — eine
    hervorgehobene, sortierte Auswahl der aussichtsreichsten Content-
    Chancen, rein deterministisch aus bereits geladenen Rohdaten berechnet
    (kein neuer Query, kein Claude-Call, gleiches Prinzip wie
    opportunities.py). Zwei vom Kunden konkret genannte Kriterien:

    1. "seo_naeher_top10": Keywords, die organisch bereits in den Top 10
       ranken (organic_rank <= STRONG_RANK_MAX) UND ein tatsächlich
       gemessenes Suchvolumen haben, sortiert nach Suchvolumen absteigend.
       Verwandt mit Opportunity 3 in opportunities.py
       (google_visible_ai_invisible), hier aber als eigene, nach Volumen
       sortierte Rangliste statt einer einzelnen Karte — der SEO-Erfolg
       ist schon da, nur die KI-Sichtbarkeit fehlt noch.
    2. "erste_ki_zitierung": Prompts, bei denen die eigene Domain BEREITS
       mindestens einmal zitiert wurde (cited_count > 0), aber noch nicht
       durchgehend (cited_count < total_runs) — ein erster Fuß in der
       Tür, den gezielter Content ausbauen kann, statt komplett bei null
       anzufangen.

    Absichtlich nicht in opportunities.py selbst (keine eigene
    persistente Tabellen-Zeile, kein Duplikat-Schutz nötig) — das ist
    eine sortierte HERVORHEBUNG bereits vorhandener Signale fürs
    Frontend, kein neu ENTDECKTER Befund wie eine echte Opportunity.

    GEÄNDERT (20.09.2026): nutzte bisher eine eigene, lokale Schwelle
    NEAR_TOP10_RANK_THRESHOLD = 15, während opportunities.py für dieselbe
    Frage ("Google sichtbar?") ORGANIC_VISIBLE_RANK = 10 nutzte — zwei
    unterschiedliche Antworten auf dieselbe Frage im selben Tool. Jetzt
    beide auf STRONG_RANK_MAX (siehe keyword_status.py) vereinheitlicht.
    Das engt "seo_naeher_top10" von Position 15 auf Position 10 ein.

    GEÄNDERT (23.09.2026): dasselbe Keyword kann mehrfach in search_queries
    stehen (save_search_queries dedupliziert nur pro Keyword+Source, siehe
    run_topic.py) — z. B. einmal aus 'gsc_near_miss', einmal aus
    'related_keywords'/'keyword_suggestions', teils mit abweichender
    Groß-/Kleinschreibung. Ohne Dedup erschien dieselbe Content-Chance
    mehrfach als eigene Karte. Jetzt Dedup auf normalisierten Keyword-Text
    (strip + lower), bevor sortiert und auf Top 5 gekürzt wird.
    """

    seen_keywords = set()
    seo_chances = []
    for q in search_queries:
        if (
            q.get("organic_rank") is None
            or q["organic_rank"] > STRONG_RANK_MAX
            or q.get("search_volume") is None
        ):
            continue
        key = q["keyword"].strip().lower()
        if key in seen_keywords:
            continue
        seen_keywords.add(key)
        seo_chances.append(q)
    seo_chances.sort(key=lambda q: q["search_volume"], reverse=True)

    citation_chances = [
        p for p in prompts
        if p.get("cited_count") is not None and p.get("total_runs")
        and 0 < p["cited_count"] < p["total_runs"]
    ]
    citation_chances.sort(key=lambda p: p["cited_count"], reverse=True)

    chances = []
    for q in seo_chances[:5]:
        chances.append({
            "kind": "seo_naeher_top10",
            "label": q["keyword"],
            "detail": f"Google-Position {q['organic_rank']}, {q['search_volume']} Suchen/Monat",
        })
    for p in citation_chances[:5]:
        chances.append({
            "kind": "erste_ki_zitierung",
            "label": p["prompt_text"],
            "detail": f"{p['cited_count']} von {p['total_runs']} ausgewerteten L\u00e4ufen zitiert",
        })
    return chances


def _get_domain_visibility_trend(topic_ids: list[str], weeks: int = 26) -> list[dict]:
    """
    Wie _get_own_visibility_trend, aber über mehrere Themen einer Domain
    aggregiert: EIN Roundtrip mit in_("topic_id", topic_ids) statt N
    Einzelabfragen (siehe getDomainDashboardData-Kommentar in script.js
    zur Kosten-Begründung). Zählt Läufe wochenweise über alle übergebenen
    Themen hinweg auf.
    """
    if not topic_ids:
        return []
    cutoff = (datetime.now(timezone.utc) - timedelta(weeks=weeks)).isoformat()
    try:
        runs = (
            supabase.table("ai_runs")
            .select("collected_at, source, own_domain_mentioned, own_domain_cited, own_domain_recommended")
            .in_("topic_id", topic_ids)
            .in_("source", ["chat_gpt", "gemini"])
            .gte("collected_at", cutoff)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden des Domain-Sichtbarkeits-Verlaufs für Themen %s", topic_ids)
        raise

    buckets: dict[str, dict] = {}
    for r in runs:
        if not r.get("collected_at"):
            continue
        week = _week_start_label(r["collected_at"])
        bucket = buckets.setdefault(week, {"mentioned": 0, "cited": 0, "recommended": 0, "total": 0})
        bucket["total"] += 1
        if r.get("own_domain_mentioned"):
            bucket["mentioned"] += 1
        if r.get("own_domain_cited"):
            bucket["cited"] += 1
        if r.get("own_domain_recommended") is True:
            bucket["recommended"] += 1

    return [{"week": week, **counts} for week, counts in sorted(buckets.items())]


@app.get("/projects/{project_id}/dashboard")
def get_project_dashboard_endpoint(project_id: str, member_id: str = Depends(require_member)):
    """
    Aggregations-Endpunkt für die Domain-Übersicht (Ebene 1+2), bisher
    ausschließlich über MOCK_TOPIC_DETAIL im Frontend simuliert (siehe
    getDomainDashboardData in script.js). Liefert Trend, Opportunities und
    Content-Ideen über ALLE AKTIVEN Themen einer Domain, in EINEM Request
    statt N Einzelaufrufen von GET /topics/{id} (bei vielen Themen sonst
    langsam/teuer, siehe Kommentar im Frontend).

    Bewusst NUR diese drei: Wettbewerber-/Keyword-/Prompt-Aggregation auf
    Domain-Ebene ist derselbe Bug (getDomainDashboardData hängt auch dort
    an MOCK_TOPIC_DETAIL), braucht aber Einblick in gap_analysis.py/
    source_analysis.py/prompt_discovery.py, um bestehende Einzel-Themen-
    Funktionen korrekt zu bündeln statt deren Rückgabeform zu raten (Stand
    14.09.2026: diese Dateien lagen bei der Implementierung nicht vor).
    Folgt als zweiter Schritt.

    GEÄNDERT (14.09.2026): content_ideas tragen jetzt zusätzlich `phase`
    (aus prompts.messymiddle_phase über content_ideas.prompt_id), analog
    zu get_topic_detail. opportunities bewusst NICHT phasengetaggt, siehe
    Kommentar dort, warum das ohne opportunities.py nicht sicher geht.

    Archivierte Themen fließen NICHT ein (siehe Frontend-Kommentar vom
    14.09.2026: aggregierte Ansichten sollen den aktuell relevanten Hebel
    zeigen, nicht von pausierten Themen verwässert werden).
    """
    team_id = _resolve_team_id(member_id)
    try:
        project = get_project(project_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Domain nicht gefunden")
    if not project or project.get("team_id") != team_id:
        raise HTTPException(status_code=404, detail="Domain nicht gefunden")

    try:
        active_topics = (
            supabase.table("ai_visibility_topics")
            .select("id, name")
            .eq("project_id", project_id)
            .eq("team_id", team_id)
            .neq("status", "archived")
            .execute()
        ).data
    except Exception as e:
        logger.exception("Fehler beim Laden der aktiven Themen für Domain %s", project_id)
        raise HTTPException(status_code=500, detail=f"Konnte Themen nicht laden: {e}")

    topic_ids = [t["id"] for t in active_topics]
    topic_name_by_id = {t["id"]: t["name"] for t in active_topics}

    if not topic_ids:
        return {"project_id": project_id, "trend": [], "opportunities": [], "content_ideas": []}

    try:
        trend = _get_domain_visibility_trend(topic_ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Konnte Sichtbarkeits-Verlauf nicht laden: {e}")

    try:
        # Kein Status-Filter, analog zu get_topic_detail (liefert dort auch
        # alle Status, keine Einschränkung auf 'new'), damit sich Single-
        # Topic- und Domain-Ansicht identisch verhalten.
        opportunities = (
            supabase.table("opportunities")
            .select("*")
            .in_("topic_id", topic_ids)
            .order("created_at", desc=True)
            .execute()
        ).data
    except Exception as e:
        logger.exception("Fehler beim Laden der Opportunities für Domain %s", project_id)
        raise HTTPException(status_code=500, detail=f"Konnte Opportunities nicht laden: {e}")
    for opp in opportunities:
        opp["topic_name"] = topic_name_by_id.get(opp["topic_id"], "")

    try:
        # ANNAHME (nicht verifiziert, content_ideas.py lag bei der
        # Implementierung nicht vor): hier nur die Rohtabelle mit
        # offer_detected=true. Falls get_content_ideas_for_topic
        # zusätzliche Anreicherung/Filterung macht, hier angleichen.
        content_ideas = (
            supabase.table("content_ideas")
            .select("*")
            .in_("topic_id", topic_ids)
            .eq("offer_detected", True)
            .order("detected_at", desc=True)
            .execute()
        ).data
    except Exception as e:
        logger.exception("Fehler beim Laden der Content-Ideen für Domain %s", project_id)
        raise HTTPException(status_code=500, detail=f"Konnte Content-Ideen nicht laden: {e}")
    for idea in content_ideas:
        idea["topic_name"] = topic_name_by_id.get(idea["topic_id"], "")

    # NEU (14.09.2026): dieselbe Phasen-Anreicherung wie in get_topic_detail
    # (content_ideas.prompt_id -> prompts.messymiddle_phase), damit die
    # Domain-Übersicht Content-Ideen genauso nach Journey-Phase zeigen kann
    # wie die Topic-Detailansicht.
    idea_prompt_ids = list({idea["prompt_id"] for idea in content_ideas if idea.get("prompt_id")})
    if idea_prompt_ids:
        try:
            idea_prompts = (
                supabase.table("prompts")
                .select("id, messymiddle_phase")
                .in_("id", idea_prompt_ids)
                .execute()
            ).data
        except Exception:
            logger.exception("Fehler beim Laden der Prompt-Phasen für Content-Ideen, Domain %s", project_id)
            idea_prompts = []
        phase_by_prompt_id = {p["id"]: p.get("messymiddle_phase") for p in idea_prompts}
        for idea in content_ideas:
            idea["phase"] = phase_by_prompt_id.get(idea.get("prompt_id"))

    return {
        "project_id": project_id,
        "trend": trend,
        "opportunities": opportunities,
        "content_ideas": content_ideas,
    }


@app.get("/topics/{topic_id}/prompts/{prompt_id}/citations")
def get_prompt_citations_endpoint(topic_id: str, prompt_id: str, member_id: str = Depends(require_member)):
    """
    NEU (13.09.2026): Liefert die letzten PROMPT_CITATION_RUN_LIMIT Läufe je
    Engine (ChatGPT/Gemini) für EINEN Prompt, inkl. voller Antwort
    (raw_response[0].markdown) und zitierter Quellen. Google AI Overview
    bewusst ausgeschlossen: hängt an search_query_id statt prompt_id (siehe
    Datenmodell in ai_runs), lässt sich also nicht sauber einem einzelnen
    Prompt zuordnen.

    Lazy geladen, NICHT Teil von GET /topics/{id}: raw_response ist pro Lauf
    groß (volles Antwort-Markdown + komplette Quellenliste), das soll nur
    beim tatsächlichen Aufklappen eines Prompts im Frontend abgerufen
    werden (analog zu /competitor-citations, siehe maybeLoadCitationTrend /
    togglePromptExpansion in script.js), nicht bei jedem Topic-Detail-Load.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id, own_domain").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        prompt = (
            supabase.table("prompts").select("id, prompt_text")
            .eq("id", prompt_id).eq("topic_id", topic_id).single().execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Prompt nicht gefunden")

    own_domain_normalized = _normalize_search_domain(topic.get("own_domain"))

    try:
        chat_gpt_runs = _get_recent_runs_for_prompt(topic_id, prompt_id, "chat_gpt")
        gemini_runs = _get_recent_runs_for_prompt(topic_id, prompt_id, "gemini")
    except Exception:
        logger.exception("Fehler beim Laden der Läufe für Prompt %s", prompt_id)
        raise HTTPException(status_code=500, detail="Konnte Läufe nicht laden")

    return {
        "prompt_id": prompt_id,
        "prompt_text": prompt["prompt_text"],
        "chat_gpt": [e for e in (_extract_run_answer(r, own_domain_normalized) for r in chat_gpt_runs) if e],
        "gemini": [e for e in (_extract_run_answer(r, own_domain_normalized) for r in gemini_runs) if e],
    }


@app.get("/topics/{topic_id}/competitor-citations")
def get_competitor_citation_trend_endpoint(
    topic_id: str,
    weeks: Literal[4, 12, 26] = 12,
    member_id: str = Depends(require_member),
):
    """
    Wöchentlicher Verlauf, wer wie oft zitiert wurde (siehe
    _get_competitor_citation_trend). Bewusst ein EIGENER Endpunkt statt Teil
    von GET /topics/{id}, weil diese Auswertung mehr Datenbank-Last erzeugt
    (Historie über mehrere Wochen statt nur des aktuellen Stands) und vom
    Frontend nur bei Bedarf geladen werden soll (z.B. wenn der
    entsprechende Tab geöffnet wird), nicht bei jedem Seitenaufruf.

    GEÄNDERT (25.09.2026, Kundenwunsch): weeks jetzt als Query-Parameter
    statt fest auf den Default von _get_competitor_citation_trend()
    verdrahtet -- Frontend kann damit zwischen Presets (4/12/26 Wochen)
    wählen, für einen GA4-ähnlichen Zeitraum-Picker in der
    Wettbewerbsvergleich-Grafik. Bewusst Literal[4, 12, 26] statt einem
    freien int: ein beliebig hoher Wert (z.B. ?weeks=9999) würde einen
    unbeschränkt großen ai_runs-Scan auslösen -- _get_competitor_citation_trend
    filtert erst NACH dem Laden aller Zeilen im Cutoff-Zeitraum, es gibt
    kein LIMIT in der zugrundeliegenden Query. FastAPI validiert
    Literal-Werte automatisch (422 bei ungültigem Wert), kein manueller
    Check nötig, und die erlaubten Werte erscheinen automatisch in der
    OpenAPI-Doku (/openapi.json, /docs).
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        weekly_data = _get_competitor_citation_trend(topic_id, weeks=weeks)
    except Exception as e:
        logger.exception("Fehler beim Laden des Zitations-Verlaufs für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Konnte Zitations-Verlauf nicht laden: {e}")

    return {"topic_id": topic_id, "weeks": weekly_data}


@app.get("/topics/{topic_id}/monthly-overview-trend")
def get_monthly_overview_trend_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    """
    NEU (15.09.2026): kombinierte Monats-Grafik für die Übersicht (siehe
    Chat-Verlauf 15.09.2026) — Prompt-Zitierungen, GSC-Klicks/Impressionen
    und neue Keywords, alle nach Kalendermonat gebündelt. Eigener
    Endpunkt, gleicher Grund wie /visibility-trend: mehr Datenbank-Last
    als der normale Topic-Detail-Load, nur bei Bedarf geladen.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        months = _get_monthly_overview_trend(topic_id)
    except Exception as e:
        logger.exception("Fehler beim Laden der Monatsübersicht für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Konnte Monatsübersicht nicht laden: {e}")

    return {"topic_id": topic_id, "months": months}


def _get_monthly_overview_trend(topic_id: str) -> list[dict]:
    """
    NEU (15.09.2026): kombiniert drei bisher getrennte Datenquellen zu
    einer gemeinsamen Monats-Zeitachse:
    - own_domain_cited/total_runs aus ai_runs (Prompt-Zitierungen)
    - gsc_clicks/gsc_impressions aus search_rank_snapshots (siehe
      run_topic.py: save_rank_snapshot, gsc_clicks dort am 15.09.2026
      ergänzt, vorher fehlte das für diese Grafik)
    - new_keywords aus search_queries.first_seen_at

    BEWUSST Kalendermonate (YYYY-MM aus dem Zeitstempel), nicht dieselben
    rollierenden 30-Tage-Fenster wie claude_summary.py: für eine Grafik
    mit mehreren Monaten Verlauf sind feste Kalendermonate einfacher lesbar
    und vergleichbar, auch wenn der eigentliche Monatslauf nicht exakt
    kalenderausgerichtet läuft (der Unterschied ist für eine grobe
    Trend-Grafik unerheblich).
    """
    try:
        ai_runs = (
            supabase.table("ai_runs")
            .select("collected_at, own_domain_cited")
            .eq("topic_id", topic_id)
            .in_("source", ["chat_gpt", "gemini"])
            .execute()
        ).data

        rank_snapshots = (
            supabase.table("search_rank_snapshots")
            .select("gsc_clicks, gsc_impressions, snapshot_at")
            .eq("topic_id", topic_id)
            .execute()
        ).data

        keywords = (
            supabase.table("search_queries")
            .select("first_seen_at")
            .eq("topic_id", topic_id)
            .in_("source", ["related_keywords", "keyword_ideas", "keyword_suggestions", "paa"])
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der Monatsübersicht für Topic %s", topic_id)
        raise

    def _month_key(dt_str: str) -> str:
        return dt_str[:7]  # "YYYY-MM"

    months: set[str] = set()
    cited_by_month: dict[str, int] = {}
    total_by_month: dict[str, int] = {}
    for r in ai_runs:
        if not r.get("collected_at"):
            continue
        m = _month_key(r["collected_at"])
        months.add(m)
        total_by_month[m] = total_by_month.get(m, 0) + 1
        if r.get("own_domain_cited"):
            cited_by_month[m] = cited_by_month.get(m, 0) + 1

    clicks_by_month: dict[str, int] = {}
    impressions_by_month: dict[str, int] = {}
    for s in rank_snapshots:
        if not s.get("snapshot_at"):
            continue
        m = _month_key(s["snapshot_at"])
        months.add(m)
        clicks_by_month[m] = clicks_by_month.get(m, 0) + (s.get("gsc_clicks") or 0)
        impressions_by_month[m] = impressions_by_month.get(m, 0) + (s.get("gsc_impressions") or 0)

    new_keywords_by_month: dict[str, int] = {}
    for k in keywords:
        if not k.get("first_seen_at"):
            continue
        m = _month_key(k["first_seen_at"])
        months.add(m)
        new_keywords_by_month[m] = new_keywords_by_month.get(m, 0) + 1

    return [
        {
            "month": m,
            "own_domain_cited": cited_by_month.get(m, 0),
            "total_runs": total_by_month.get(m, 0),
            "gsc_clicks": clicks_by_month.get(m, 0),
            "gsc_impressions": impressions_by_month.get(m, 0),
            "new_keywords": new_keywords_by_month.get(m, 0),
        }
        for m in sorted(months)
    ]


def _get_own_visibility_trend(topic_id: str, weeks: int = 26) -> list[dict]:
    """
    NEU (13.09.2026): wöchentlicher Verlauf der EIGENEN Sichtbarkeit
    (own_domain_mentioned/own_domain_cited/own_domain_recommended), analog
    zu _get_competitor_citation_trend, aber für die eigene Domain und ohne
    den Umweg über ai_sources (own_domain_* stehen direkt auf ai_runs).
    Grundlage für die Zeitleiste in der Übersicht (siehe Chat vom
    13.09.2026: "wie sich Zitierungen, Nennungen ... im Laufe der Zeit
    geändert haben").
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(weeks=weeks)).isoformat()
    try:
        runs = (
            supabase.table("ai_runs")
            .select("collected_at, source, own_domain_mentioned, own_domain_cited, own_domain_recommended")
            .eq("topic_id", topic_id)
            .in_("source", ["chat_gpt", "gemini"])
            .gte("collected_at", cutoff)
            .execute()
        ).data
    except Exception:
        logger.exception("Supabase-Fehler beim Laden des Sichtbarkeits-Verlaufs für Topic %s", topic_id)
        raise

    # week -> {mentioned, cited, recommended, total}
    buckets: dict[str, dict] = {}
    for r in runs:
        if not r.get("collected_at"):
            continue
        week = _week_start_label(r["collected_at"])
        bucket = buckets.setdefault(week, {"mentioned": 0, "cited": 0, "recommended": 0, "total": 0})
        bucket["total"] += 1
        if r.get("own_domain_mentioned"):
            bucket["mentioned"] += 1
        if r.get("own_domain_cited"):
            bucket["cited"] += 1
        if r.get("own_domain_recommended") is True:
            bucket["recommended"] += 1

    return [
        {"week": week, **counts}
        for week, counts in sorted(buckets.items())
    ]


@app.get("/topics/{topic_id}/visibility-trend")
def get_visibility_trend_endpoint(
    topic_id: str,
    weeks: Literal[4, 12, 26] = 26,
    member_id: str = Depends(require_member),
):
    """
    Eigener Endpunkt aus demselben Grund wie /competitor-citations: mehr
    Datenbank-Last als der normale Topic-Detail-Load, deshalb nur bei
    Bedarf geladen (Übersicht-Tab), nicht Teil von GET /topics/{id}.

    GEÄNDERT (25.09.2026, Kundenwunsch): weeks jetzt als Query-Parameter,
    analog zu /competitor-citations -- selbes Preset-Set (4/12/26 Wochen)
    für einen konsistenten Zeitraum-Picker über beide Grafiken hinweg.
    Default bewusst weiterhin 26 (nicht 12 wie bei /competitor-citations),
    identisch zum bisherigen Default von _get_own_visibility_trend, damit
    sich am aktuellen Verhalten ohne den neuen Parameter nichts ändert.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        weekly_data = _get_own_visibility_trend(topic_id, weeks=weeks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Konnte Sichtbarkeits-Verlauf nicht laden: {e}")

    return {"topic_id": topic_id, "weeks": weekly_data}


def _get_week_detail(topic_id: str, week: str) -> dict:
    """
    NEU (13.09.2026): Detailauflösung für EINE Woche, angestoßen durch
    Klick auf einen Punkt/Marker im Übersicht-Chart (siehe script.js:
    showWeekDetail). Anders als /visibility-trend (nur Wochen-Summen)
    liefert das hier pro Prompt und pro Keyword den Stand DIESER Woche
    UND den jeweils letzten Stand DAVOR, damit das Frontend direkt
    "verbessert/verschlechtert seit letzter Woche" anzeigen kann, ohne
    selbst die komplette Historie laden zu müssen.

    week: Montag-der-Woche als ISO-Datum (z.B. "2026-08-10"), exakt das
    Format, das _week_start_label/_get_own_visibility_trend produzieren.

    Bewusst je zwei Abfragen (Läufe/Snapshots DIESER Woche, dann EINE
    weitere Abfrage für "davor" über alle betroffenen prompt_ids/Keywords
    zusammen, nicht pro Prompt/Keyword einzeln), um kein N+1 zu bauen.
    """
    try:
        week_start = datetime.fromisoformat(week).replace(tzinfo=timezone.utc)
    except ValueError:
        raise ValueError(f"Ungültiges Wochenformat: {week}")
    week_end = week_start + timedelta(days=7)

    try:
        runs = (
            supabase.table("ai_runs")
            .select("id, prompt_id, source, collected_at, own_domain_cited, own_domain_mentioned, "
                    "own_domain_recommended, prompts(prompt_text, messymiddle_phase)")
            .eq("topic_id", topic_id)
            .in_("source", ["chat_gpt", "gemini"])
            .gte("collected_at", week_start.isoformat())
            .lt("collected_at", week_end.isoformat())
            .execute()
        ).data
    except Exception:
        logger.exception("Fehler beim Laden der Läufe für Wochendetail (topic_id=%s, week=%s)", topic_id, week)
        raise

    prompt_ids = list({r["prompt_id"] for r in runs if r.get("prompt_id")})
    # GEÄNDERT (13.09.2026): speichert jetzt die ganze Vorlauf-Zeile (nicht
    # nur own_domain_cited), damit das Frontend auch own_domain_mentioned
    # und vor allem collected_at anzeigen kann. Ohne das Datum war "davor
    # zitiert" mehrdeutig, wenn der letzte Lauf für einen Prompt schon
    # Wochen zurücklag (z.B. nach einer Pause), siehe Chat vom 13.09.2026.
    previous_by_key: dict[tuple, dict] = {}
    if prompt_ids:
        try:
            previous_runs = (
                supabase.table("ai_runs")
                .select("prompt_id, source, own_domain_cited, own_domain_mentioned, collected_at")
                .eq("topic_id", topic_id)
                .in_("prompt_id", prompt_ids)
                .in_("source", ["chat_gpt", "gemini"])
                .lt("collected_at", week_start.isoformat())
                .order("collected_at", desc=True)
                .execute()
            ).data
        except Exception:
            logger.exception("Fehler beim Laden der Vorwochen-Läufe für Wochendetail (topic_id=%s)", topic_id)
            previous_runs = []
        for pr in previous_runs:
            key = (pr["prompt_id"], pr["source"])
            if key not in previous_by_key:  # Liste ist DESC, erster Treffer = neuester
                previous_by_key[key] = pr

    prompts_detail = []
    for r in runs:
        prompt = r.get("prompts") or {}
        previous = previous_by_key.get((r.get("prompt_id"), r.get("source")))
        prompts_detail.append({
            "prompt_text": prompt.get("prompt_text"),
            "phase": prompt.get("messymiddle_phase"),
            "engine": r.get("source"),
            "cited": r.get("own_domain_cited"),
            "mentioned": r.get("own_domain_mentioned"),
            "recommended": r.get("own_domain_recommended"),
            "previous_cited": (previous or {}).get("own_domain_cited"),
            "previous_mentioned": (previous or {}).get("own_domain_mentioned"),
            "previous_collected_at": (previous or {}).get("collected_at"),
        })

    try:
        keyword_snapshots = (
            supabase.table("search_rank_snapshots")
            .select("keyword, organic_rank, gsc_position, gsc_impressions, snapshot_at")
            .eq("topic_id", topic_id)
            .gte("snapshot_at", week_start.isoformat())
            .lt("snapshot_at", week_end.isoformat())
            .execute()
        ).data
    except Exception:
        logger.exception("Fehler beim Laden der Keyword-Snapshots für Wochendetail (topic_id=%s)", topic_id)
        raise

    keyword_names = list({s["keyword"] for s in keyword_snapshots})
    previous_by_keyword: dict[str, dict] = {}
    if keyword_names:
        try:
            previous_snapshots = (
                supabase.table("search_rank_snapshots")
                .select("keyword, organic_rank, gsc_position, snapshot_at")
                .eq("topic_id", topic_id)
                .in_("keyword", keyword_names)
                .lt("snapshot_at", week_start.isoformat())
                .order("snapshot_at", desc=True)
                .execute()
            ).data
        except Exception:
            logger.exception("Fehler beim Laden der Vorwochen-Snapshots für Wochendetail (topic_id=%s)", topic_id)
            previous_snapshots = []
        for ps in previous_snapshots:
            if ps["keyword"] not in previous_by_keyword:  # Liste ist DESC, erster Treffer = neuester
                previous_by_keyword[ps["keyword"]] = ps

    keywords_detail = []
    for s in keyword_snapshots:
        previous = previous_by_keyword.get(s["keyword"])
        keywords_detail.append({
            "keyword": s["keyword"],
            "organic_rank": s.get("organic_rank"),
            "gsc_position": s.get("gsc_position"),
            "gsc_impressions": s.get("gsc_impressions"),
            "previous_organic_rank": (previous or {}).get("organic_rank"),
            "previous_gsc_position": (previous or {}).get("gsc_position"),
            "previous_snapshot_at": (previous or {}).get("snapshot_at"),
        })

    try:
        changelog = (
            supabase.table("topic_changelog")
            .select("entry_text, author_name, created_at")
            .eq("topic_id", topic_id)
            .gte("created_at", week_start.isoformat())
            .lt("created_at", week_end.isoformat())
            .execute()
        ).data
    except Exception:
        logger.exception("Fehler beim Laden der Changelog-Einträge für Wochendetail (topic_id=%s)", topic_id)
        raise

    return {"week": week, "prompts": prompts_detail, "keywords": keywords_detail, "changelog": changelog}


@app.get("/topics/{topic_id}/week-detail")
def get_week_detail_endpoint(topic_id: str, week: str, member_id: str = Depends(require_member)):
    """
    Eigener Endpunkt, nur bei Klick auf einen Chart-Punkt/-Marker
    abgerufen (siehe script.js: showWeekDetail), nicht Teil der übrigen
    Lazy-Load-Endpunkte.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        detail = _get_week_detail(topic_id, week)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Konnte Wochendetail nicht laden: {e}")

    return detail


def _get_rank_history(topic_id: str, keyword: str | None = None, weeks: int = 26) -> list[dict]:
    """
    NEU (13.09.2026): liest search_rank_snapshots (siehe run_topic.py:
    save_rank_snapshot). Ohne keyword: alle historisierten Keywords
    gruppiert nach Woche (fürs Übersicht-Chart, i.d.R. dominiert vom
    Seed-Keyword, da das aktuell einzige mit organic_rank ist). Mit
    keyword: nur dessen Verlauf (fürs Aufklappen eines einzelnen
    Keywords im Keywords-Tab).
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(weeks=weeks)).isoformat()
    try:
        query = (
            supabase.table("search_rank_snapshots")
            # GEÄNDERT (15.09.2026): gsc_clicks ergänzt — fehlte hier, obwohl
            # save_rank_snapshot (run_topic.py) es längst mit speichert und
            # das Frontend (renderGscRowExpansion) es für die
            # GSC-Verlaufsgrafik längst erwartet. War bisher immer
            # undefined/leer angekommen.
            .select("keyword, organic_rank, gsc_impressions, gsc_clicks, gsc_position, snapshot_at")
            .eq("topic_id", topic_id)
            .gte("snapshot_at", cutoff)
            .order("snapshot_at")
        )
        if keyword:
            query = query.eq("keyword", keyword)
        return query.execute().data or []
    except Exception:
        logger.exception("Supabase-Fehler beim Laden der Rank-Historie für Topic %s", topic_id)
        raise


def _compute_changelog_keyword_deltas(topic_id: str, changelog: list[dict], search_queries: list[dict]) -> dict:
    """
    NEU (15.09.2026): Kundenwunsch (siehe Chat-Verlauf 15.09.2026) — pro
    Änderungsprotokoll-Eintrag UND pro damit verknüpftem Keyword ein
    einfaches Auf/Ab-Signal: hat sich die Position dieses Keywords seit
    dem Eintrag verbessert oder verschlechtert? Bewusst KEINE Einschränkung
    auf ein Keyword pro Eintrag (siehe Chat-Verlauf 15.09.2026) — ein
    Eintrag kann mehrere verknüpfte Keywords haben, jedes bekommt sein
    eigenes Signal.

    Vergleicht den Rank-Snapshot kurz VOR/AM Eintrag (Baseline) mit dem
    aktuellsten verfügbaren Snapshot (aktueller Stand). Niedrigere Position
    ist besser (sowohl organic_rank als auch gsc_position), organic_rank
    hat Vorrang, falls beide vorliegen. Gibt {entry_id: {keyword_id:
    "up"|"down"|"neutral"}} zurück — ein Keyword ohne ausreichende
    Snapshot-Historie (weniger als 2 Punkte insgesamt, oder Baseline ==
    aktueller Stand) taucht in der inneren Map einfach nicht auf, kein
    erratener Wert.
    """
    keyword_text_by_id = {q["id"]: q["keyword"] for q in search_queries}
    has_any_link = any(entry.get("linked_search_query_ids") for entry in changelog)
    if not has_any_link:
        return {}

    try:
        snapshots = _get_rank_history(topic_id)
    except Exception:
        logger.exception("Rank-Historie für Änderungs-Deltas konnte nicht geladen werden (topic_id=%s)", topic_id)
        return {}

    snapshots_by_keyword: dict[str, list[dict]] = {}
    for s in snapshots:
        snapshots_by_keyword.setdefault(s["keyword"], []).append(s)
    for rows in snapshots_by_keyword.values():
        rows.sort(key=lambda r: r["snapshot_at"])

    def _rank_value(row: dict):
        # GEÄNDERT (20.09.2026): gsc_position kommt von Supabase als String
        # ("25.00", numeric(5,2)-Spalte), organic_rank als int. Unkonvertiert
        # führte das je nach Snapshot-Mix entweder zu TypeError (int vs.
        # str) oder zu falschen "up"/"down"-Signalen (String-Vergleich:
        # "9.00" > "25.00" ist lexikografisch True, numerisch aber falsch).
        # to_number() (keyword_status.py) macht beide Seiten vergleichbar.
        organic = to_number(row.get("organic_rank"))
        return organic if organic is not None else to_number(row.get("gsc_position"))

    def _parse(dt_str: str) -> datetime:
        return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))

    result: dict[str, dict[str, str]] = {}
    for entry in changelog:
        linked_ids = entry.get("linked_search_query_ids") or []
        entry_created_at = entry.get("created_at")
        if not linked_ids or not entry_created_at:
            continue
        entry_dt = _parse(entry_created_at)
        entry_map: dict[str, str] = {}
        for kw_id in linked_ids:
            keyword_text = keyword_text_by_id.get(kw_id)
            if not keyword_text:
                continue
            rows = snapshots_by_keyword.get(keyword_text) or []
            if len(rows) < 2:
                continue
            baseline_rows = [r for r in rows if _parse(r["snapshot_at"]) <= entry_dt]
            baseline = baseline_rows[-1] if baseline_rows else rows[0]
            current = rows[-1]
            if baseline is current:
                continue
            baseline_value = _rank_value(baseline)
            current_value = _rank_value(current)
            if baseline_value is None or current_value is None:
                continue
            if current_value < baseline_value:
                entry_map[kw_id] = "up"
            elif current_value > baseline_value:
                entry_map[kw_id] = "down"
            else:
                entry_map[kw_id] = "neutral"
        if entry_map:
            result[entry["id"]] = entry_map
    return result


@app.get("/topics/{topic_id}/rank-history")
def get_rank_history_endpoint(topic_id: str, keyword: str | None = None, member_id: str = Depends(require_member)):
    """
    Eigener Endpunkt, gleicher Grund wie /visibility-trend/-competitor-
    citations: nur bei Bedarf geladen. Optionaler ?keyword=-Parameter für
    den Einzel-Keyword-Verlauf im aufgeklappten Keywords-Tab.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        snapshots = _get_rank_history(topic_id, keyword)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Konnte Rank-Historie nicht laden: {e}")

    return {"topic_id": topic_id, "snapshots": snapshots}


# ══════════════════════════════════════════════════════════════════════════
# ACHTUNG (gefunden beim Zusammenbauen 14.09.2026, nicht Teil des von mir
# angefragten Themas): Diese Funktion hatte in eurer eingefügten Version
# KEINEN @app.-Decorator über sich (direkt nach dem return von
# get_rank_history_endpoint, ohne Leerzeile/Dekorator). Das ist gültiges
# Python, aber FastAPI registriert die Route dann NICHT – der Endpoint war
# schlicht nie erreichbar. Ich habe hier einen Decorator ergänzt, ABER die
# Route (POST /topics/{topic_id}/generate-prompts) ist geraten, angelehnt
# an eure Namenskonvention (z.B. /topics/{topic_id}/retry). Bitte prüfen,
# ob euer Frontend an genau dieser URL etwas aufruft – falls nicht, den
# Pfad unten entsprechend anpassen.
# ══════════════════════════════════════════════════════════════════════════
@app.post("/topics/{topic_id}/generate-prompts")
def generate_prompts_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    """
    Manueller Trigger für Stable-Core/Discovery-Prompt-Generierung. Läuft
    normalerweise automatisch bei der Topic-Erstellung; dieser Endpunkt ist
    für den Fall gedacht, dass ihr neue Discovery-Prompt-Kandidaten sehen
    wollt, ohne ein neues Topic anzulegen. Bewusst NICHT Teil des
    monatlichen Crons, damit der Stable Core nicht unkontrolliert wächst
    (siehe Kappung in prompt_discovery.py).
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        result = generate_prompts_for_topic(topic_id)
    except Exception as e:
        logger.exception("Fehler bei Prompt-Generierung für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Prompt-Generierung fehlgeschlagen: {e}")
    return {"status": "ok", "topic_id": topic_id, **result}


# ══════════════════════════════════════════════════════════════════════════
# Changelog: der Kunde dokumentiert selbst, wann er was am eigenen Content
# geändert hat (z.B. "Landingpage-Text am 01.09. überarbeitet"). NEU
# (13.09.2026). Rein informativ, keine automatische Verknüpfung zu
# Sichtbarkeits-Änderungen, das müsste der Kunde selbst im Sichtbarkeits-
# Verlauf danebenlegen (siehe /visibility-trend, gleiche Zeitachse: Woche).
#
# GEÄNDERT (13.09.2026): Löschen ist SOFT-DELETE (deleted_at/deleted_by_name
# gesetzt, Zeile bleibt in der DB), damit nachvollziehbar bleibt, wer wann
# was gelöscht hat, und damit ein Eintrag innerhalb der Aufbewahrungsfrist
# (CHANGELOG_DELETED_RETENTION_DAYS) wiederhergestellt werden kann. Nach
# Ablauf der Frist wird nichts automatisch hart gelöscht, die Zeile bleibt
# bestehen, verschwindet nur aus der "Gelöschte Einträge"-Ansicht. Wollt
# ihr echtes Hart-Löschen nach Ablauf der Frist, bräuchte es einen
# zusätzlichen Cron-Job, der ist hier bewusst nicht gebaut.
# ══════════════════════════════════════════════════════════════════════════

CHANGELOG_DELETED_RETENTION_DAYS = 90


def _resolve_member_user(member_id: str) -> dict:
    """
    GEÄNDERT (13.09.2026): liefert jetzt id UND firstname (vorher nur
    firstname), damit Aufrufer sowohl den lesbaren Namen (author_name/
    deleted_by_name, Text) als auch den echten Fremdschlüssel
    (author_member_id/deleted_by_member_id, siehe topic_changelog_schema.sql)
    setzen können. Gibt bei Fehlschlag {} zurück (nicht None), damit
    Aufrufer immer .get() nutzen können, ohne extra None-Check.
    """
    try:
        user = (
            supabase.table("users")
            .select("id, firstname")
            .eq("memberstack_id", member_id)
            .is_("deleted_at", "null")
            .single()
            .execute()
        ).data
        return user or {}
    except Exception:
        logger.warning("Konnte User-Datensatz für member_id=%s nicht auflösen", member_id, exc_info=True)
        return {}


@app.post("/topics/{topic_id}/changelog")
def create_changelog_entry_endpoint(
    topic_id: str, payload: CreateChangelogEntryRequest, member_id: str = Depends(require_member),
):
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    entry_text = payload.entry_text.strip()
    if not entry_text:
        raise HTTPException(status_code=400, detail="Eintrag darf nicht leer sein")

    # NEU (14.09.2026): eingehende Keyword-/Prompt-IDs LIVE gegen dieses
    # Topic validieren, statt sie blind zu übernehmen — sonst könnte ein
    # Client (versehentlich oder absichtlich) eine ID aus einem fremden
    # Topic verlinken. Ungültige IDs werden still verworfen (kein Fehler),
    # analog zum Umgang mit einer ungültigen `priority` bei content_gaps.
    linked_search_query_ids = []
    if payload.linked_search_query_ids:
        try:
            valid_queries = (
                supabase.table("search_queries")
                .select("id")
                .eq("topic_id", topic_id)
                .in_("id", payload.linked_search_query_ids)
                .execute()
            ).data
            linked_search_query_ids = [q["id"] for q in valid_queries]
        except Exception:
            logger.exception("Fehler beim Validieren der verknüpften Keywords für Topic %s", topic_id)

    linked_prompt_ids = []
    if payload.linked_prompt_ids:
        try:
            valid_prompts = (
                supabase.table("prompts")
                .select("id")
                .eq("topic_id", topic_id)
                .in_("id", payload.linked_prompt_ids)
                .execute()
            ).data
            linked_prompt_ids = [p["id"] for p in valid_prompts]
        except Exception:
            logger.exception("Fehler beim Validieren der verknüpften Prompts für Topic %s", topic_id)

    # GEÄNDERT (13.09.2026): speichert jetzt zusätzlich author_member_id
    # (echter Fremdschlüssel, siehe topic_changelog_schema.sql), damit ein
    # Konto-Löschen (einzelnes Mitglied, Team bleibt bestehen) diesen
    # Eintrag automatisch per ON DELETE CASCADE mitentfernt. author_name
    # bleibt als lesbare Beschriftung parallel bestehen.
    author = _resolve_member_user(member_id)

    try:
        inserted = (
            supabase.table("topic_changelog")
            .insert({
                "topic_id": topic_id,
                "entry_text": entry_text,
                "author_name": author.get("firstname"),
                "author_member_id": author.get("id"),
                "linked_search_query_ids": linked_search_query_ids,
                "linked_prompt_ids": linked_prompt_ids,
            })
            .execute()
        )
    except Exception as e:
        logger.exception("Fehler beim Speichern des Changelog-Eintrags für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Eintrag konnte nicht gespeichert werden: {e}")

    return {"status": "ok", "entry": inserted.data[0]}


def _get_changelog_entry_for_topic(topic_id: str, entry_id: str) -> dict:
    try:
        entry = (
            supabase.table("topic_changelog")
            .select("id, topic_id")
            .eq("id", entry_id)
            .eq("topic_id", topic_id)
            .single()
            .execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    return entry


@app.delete("/topics/{topic_id}/changelog/{entry_id}")
def delete_changelog_entry_endpoint(topic_id: str, entry_id: str, member_id: str = Depends(require_member)):
    """
    Soft-Delete: setzt deleted_at/deleted_by_name, entfernt die Zeile NICHT
    physisch. Wer gelöscht hat, bleibt damit nachvollziehbar (siehe
    Modul-Kommentar oben).
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)
    _get_changelog_entry_for_topic(topic_id, entry_id)

    # GEÄNDERT (13.09.2026): speichert zusätzlich deleted_by_member_id
    # (ON DELETE SET NULL, siehe topic_changelog_schema.sql und die
    # Begründung dort, warum das anders behandelt wird als author_member_id).
    deleter = _resolve_member_user(member_id)

    try:
        supabase.table("topic_changelog").update({
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by_name": deleter.get("firstname"),
            "deleted_by_member_id": deleter.get("id"),
        }).eq("id", entry_id).eq("topic_id", topic_id).execute()
    except Exception as e:
        logger.exception("Fehler beim Löschen des Changelog-Eintrags %s (Topic %s)", entry_id, topic_id)
        raise HTTPException(status_code=500, detail=f"Eintrag konnte nicht gelöscht werden: {e}")

    return {"status": "ok", "entry_id": entry_id}


@app.post("/topics/{topic_id}/changelog/{entry_id}/restore")
def restore_changelog_entry_endpoint(topic_id: str, entry_id: str, member_id: str = Depends(require_member)):
    """Macht einen Soft-Delete rückgängig (innerhalb der Aufbewahrungsfrist), siehe Modul-Kommentar oben."""
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)
    _get_changelog_entry_for_topic(topic_id, entry_id)

    try:
        supabase.table("topic_changelog").update({
            "deleted_at": None,
            "deleted_by_name": None,
            "deleted_by_member_id": None,
        }).eq("id", entry_id).eq("topic_id", topic_id).execute()
    except Exception as e:
        logger.exception("Fehler beim Wiederherstellen des Changelog-Eintrags %s (Topic %s)", entry_id, topic_id)
        raise HTTPException(status_code=500, detail=f"Eintrag konnte nicht wiederhergestellt werden: {e}")

    return {"status": "ok", "entry_id": entry_id}


@app.get("/topics/{topic_id}/changelog/deleted")
def get_deleted_changelog_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    """
    "Archiv"-Ansicht: gelöschte Einträge der letzten
    CHANGELOG_DELETED_RETENTION_DAYS Tage, mit Autor UND Löscher. Eigener
    Endpunkt, nur bei Bedarf geladen (z.B. Klick auf "Gelöschte Einträge"),
    nicht Teil der normalen Changelog-Liste.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=CHANGELOG_DELETED_RETENTION_DAYS)).isoformat()
    try:
        entries = (
            supabase.table("topic_changelog")
            .select("id, entry_text, author_name, deleted_by_name, deleted_at, created_at, linked_search_query_ids, linked_prompt_ids")
            .eq("topic_id", topic_id)
            .not_.is_("deleted_at", "null")
            .gte("deleted_at", cutoff)
            .order("deleted_at", desc=True)
            .execute()
        ).data
    except Exception as e:
        logger.exception("Fehler beim Laden der gelöschten Changelog-Einträge für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Konnte gelöschte Einträge nicht laden: {e}")

    return {"topic_id": topic_id, "entries": entries, "retention_days": CHANGELOG_DELETED_RETENTION_DAYS}


def _get_changelog_for_topic(topic_id: str) -> list[dict]:
    """
    GEÄNDERT (13.09.2026): aus get_changelog_endpoint herausgezogen, damit
    get_topic_detail dieselbe Query nutzen kann. Changelog-Einträge sind
    ein paar Textzeilen pro Topic, keine große Historie wie ai_runs/
    ai_sources, daher NICHT mehr per Lazy-Load in main.py behandeln,
    sondern direkt Teil von GET /topics/{id} (siehe dort). Der
    eigenständige GET-Endpunkt unten bleibt trotzdem bestehen, für
    spätere Anwendungsfälle wie eine eigene Changelog-Ansicht.

    GEÄNDERT (13.09.2026), zweite Änderung: filtert jetzt weiche gelöschte
    Einträge raus (deleted_at gesetzt), siehe delete_changelog_entry_endpoint.
    Die gelöschten selbst stehen in get_deleted_changelog_endpoint.
    """
    return (
        supabase.table("topic_changelog")
        .select("id, entry_text, author_name, created_at, linked_search_query_ids, linked_prompt_ids")
        .eq("topic_id", topic_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    ).data


@app.get("/topics/{topic_id}/changelog")
def get_changelog_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        entries = _get_changelog_for_topic(topic_id)
    except Exception as e:
        logger.exception("Fehler beim Laden des Changelogs für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Konnte Changelog nicht laden: {e}")

    return {"topic_id": topic_id, "entries": entries}


# ── Content Changes (Dashboard-Marker) ────────────────────────────────────────

def _clean_uuid_list(values: list[str]) -> list[str]:
    """Behält nur gültige UUIDs, ohne Duplikate. Verhindert einen 500er durch eine kaputte ID im Array."""
    import uuid
    cleaned: list[str] = []
    for value in values or []:
        try:
            normalized = str(uuid.UUID(str(value)))
        except ValueError:
            continue
        if normalized not in cleaned:
            cleaned.append(normalized)
    return cleaned


@app.post("/topics/{topic_id}/content-changes")
def create_content_change_endpoint(
    topic_id: str,
    payload: CreateContentChangeRequest,
    member_id: str = Depends(require_member),
):
    """
    NEU (16.09.2026): Nutzer trägt eine Content-Änderung ein (neue Seite,
    Überarbeitung, Kampagne, Sonstiges). Diese erscheint später als vertikaler
    Marker in den Trend-Charts des Dashboards, damit man Korrelationen zwischen
    Inhaltsänderungen und Visibility-Verläufen erkennen kann.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id")
            .eq("id", topic_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    valid_types = {"neue_seite", "ueberarbeitung", "kampagne", "sonstiges"}
    if payload.change_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Ungültiger change_type. Erlaubt: {', '.join(sorted(valid_types))}",
        )
    description = payload.description.strip()
    if not description:
        raise HTTPException(status_code=400, detail="description darf nicht leer sein")

    try:
        inserted = (
            supabase.table("content_changes")
            .insert({
                "topic_id": topic_id,
                "changed_at": payload.changed_at,
                "change_type": payload.change_type,
                "description": description,
                "url": payload.url or None,
                "linked_search_query_ids": _clean_uuid_list(payload.linked_search_query_ids),
                "linked_prompt_ids": _clean_uuid_list(payload.linked_prompt_ids),
            })
            .execute()
        ).data
    except Exception as e:
        logger.exception("Fehler beim Speichern der Content-Änderung für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Konnte Content-Änderung nicht speichern: {e}")

    return {"ok": True, "change": inserted[0] if inserted else None}


@app.get("/topics/{topic_id}/content-changes")
def get_content_changes_endpoint(
    topic_id: str,
    member_id: str = Depends(require_member),
):
    """
    NEU (16.09.2026): Gibt alle eingetragenen Content-Änderungen für dieses
    Topic zurück, chronologisch sortiert. Wird vom Dashboard-Frontend genutzt,
    um Marker in Trend-Charts zu rendern.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id")
            .eq("id", topic_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        changes = (
            supabase.table("content_changes")
            .select("id, changed_at, change_type, description, url, created_at, linked_search_query_ids, linked_prompt_ids")
            .eq("topic_id", topic_id)
            .order("changed_at", desc=False)
            .execute()
        ).data
    except Exception as e:
        logger.exception("Fehler beim Laden der Content-Änderungen für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Konnte Content-Änderungen nicht laden: {e}")

    return {"topic_id": topic_id, "changes": changes}


@app.get("/topics/{topic_id}/dashboard-data")
def get_topic_dashboard_data_endpoint(
    topic_id: str,
    weeks: int = 12,
    member_id: str = Depends(require_member),
):
    """
    NEU (16.09.2026): Aggregierter Dashboard-Endpoint — liefert alle Kennzahlen
    für das Messy-Middle-Dashboard in einem einzigen API-Call:
      - Phase Visibility Scores (0–100) pro Phase und Channel
      - Wöchentliche Zeitreihen (Sparklines, Trend-Charts)
      - Share of Voice pro Phase (Wettbewerber)
      - Google Organic Score
      - Content Gaps und Opportunities
      - Content Changes (für Marker in Charts)

    `weeks` steuert den Betrachtungszeitraum (Standard: 12 Wochen).
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id")
            .eq("id", topic_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        data = get_dashboard_data(topic_id, weeks=max(4, min(52, weeks)))
    except Exception as e:
        logger.exception("Fehler beim Aggregieren der Dashboard-Daten für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Konnte Dashboard-Daten nicht aggregieren: {e}")

    # NEU (20.09.2026): siehe get_topic_detail, Bereinigung interner Feldnamen.
    return sanitize_user_payload(data)


@app.post("/topics/{topic_id}/retry")
def retry_topic_endpoint(topic_id: str, background_tasks: BackgroundTasks, member_id: str = Depends(require_member)):
    """
    NEU: Für Topics mit status='error' (der komplette Erstlauf ist
    fehlgeschlagen, z.B. weil prompt_discovery.py von Claude kein valides
    JSON zurückbekam, siehe Chat-Verlauf vom 12.09.). Stößt collect_topic_data
    noch einmal komplett neu an, nicht nur die Prompt-Generierung.

    Sicher, weil die Datensammlung darin bereits idempotent ist (Keywords/
    PAA werden per find-or-create/upsert behandelt, siehe Logs "20 neue,
    0 aktualisierte"), schon gespeichertes Material wird also nicht
    doppelt eingekauft oder dupliziert, nur das, was beim letzten Versuch
    fehlte, wird ergänzt.

    GEÄNDERT (14.09.2026): erlaubt jetzt ZUSÄTZLICH status='collecting',
    wenn collecting_started_at länger als STUCK_COLLECTING_THRESHOLD_MINUTES
    zurückliegt — deckt den Fall ab, dass der Hintergrund-Task mitten im
    Lauf abgewürgt wurde (z.B. Server-Neustart/Absturz während des
    Erstlaufs, siehe Chat-Verlauf 14.09.2026: ein Thema blieb dadurch
    dauerhaft in 'collecting' hängen, ohne dass je status='error' gesetzt
    wurde — das passiert nur bei einem sauber abgefangenen Fehler, nicht
    bei einem hart getöteten Prozess). Ein GERADE ERST gestartetes
    'collecting' (innerhalb der Schwelle) bleibt weiterhin blockiert, da
    läuft mit hoher Wahrscheinlichkeit noch ein echter Hintergrund-Task.

    NICHT für status='active' gedacht (dafür gibt's die regulären
    Cron-Läufe).
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id, status, seed_keyword, own_domain, language_code, location_name, collecting_started_at, created_at")
            .eq("id", topic_id).single().execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    if topic["status"] in ("collecting", "analyzing"):
        stuck_minutes = _stuck_collecting_minutes(topic)
        if stuck_minutes < STUCK_COLLECTING_THRESHOLD_MINUTES:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Läuft seit {int(stuck_minutes)} Minute(n), noch innerhalb der erwarteten Dauer. "
                    f"Erst ab {STUCK_COLLECTING_THRESHOLD_MINUTES} Minuten als hängengeblieben behandelbar."
                ),
            )
        logger.warning(
            "Topic %s hing %d Minute(n) in 'collecting', wird über /retry manuell neu gestartet",
            topic_id, int(stuck_minutes),
        )
    elif topic["status"] != "error":
        raise HTTPException(
            status_code=409,
            detail=f"Retry nur für Topics mit Status 'error' oder hängengebliebenem 'collecting' möglich (aktuell: '{topic['status']}').",
        )

    # GEÄNDERT (14.09.2026): kein Auflösen mehr auf den Team-Owner, siehe
    # create_topic_endpoint oben für die Begründung. team_id ist hier über
    # _resolve_team_id ohnehin schon bekannt.
    supabase.table("ai_visibility_topics").update({
        "status": "collecting",
        "collecting_started_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", topic_id).execute()

    background_tasks.add_task(
        _collect_and_analyze_background, topic_id, topic["seed_keyword"], topic["own_domain"],
        topic["language_code"], topic["location_name"], [], team_id,
    )

    return {"status": "collecting", "topic_id": topic_id}


class RetryStepRequest(BaseModel):
    step: str


@app.post("/topics/{topic_id}/retry-step")
def retry_step_endpoint(
    topic_id: str,
    payload: RetryStepRequest,
    background_tasks: BackgroundTasks,
    member_id: str = Depends(require_member),
):
    """
    NEU (20.09.2026): Kundenwunsch (siehe Chat-Verlauf 20.09.2026). Startet
    GENAU EINEN Analyse-Schritt neu (z.B. "summary", "action_plan",
    "gap_analysis"), nicht den gesamten Lauf. Gedacht für Felder, die beim
    regulären Lauf nicht geliefert wurden. Der Status pro Schritt kommt als
    step_status aus GET /topics/{id}, das Frontend zeigt den Button nur für
    Einträge mit state "failed" oder "missing" und blendet ihn aus, sobald der
    Schritt erfolgreich lief.

    Schutzregeln (der Endpunkt löst kostenpflichtige Claude-/DataForSEO-Aufrufe
    aus):
    - nur für Schritte, die im Registry als user_retryable markiert sind,
    - nur wenn der Schritt tatsächlich fehlgeschlagen ist oder sein Ergebnis
      fehlt, ein Klick auf ein intaktes Feld startet nichts,
    - nur für aktive Topics und nur, wenn nicht schon ein Schritt läuft.
    Läuft als Hintergrund-Task und antwortet sofort mit 202, das Frontend fragt
    GET /topics/{id} ab, bis der Schritt nicht mehr "running" ist.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("id, team_id, status, latest_summary")
            .eq("id", topic_id).single().execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    definition = STEPS.get(payload.step)
    if not definition or not definition.user_retryable:
        raise HTTPException(status_code=400, detail="Dieser Schritt kann nicht einzeln gestartet werden.")
    if topic["status"] != "active":
        raise HTTPException(
            status_code=409,
            detail="Nur für aktive Themen möglich. Läuft gerade eine Analyse, bitte kurz warten.",
        )
    if is_step_running(topic_id):
        raise HTTPException(status_code=409, detail="Es läuft bereits ein Vorgang für dieses Thema.")

    current = {entry["step"]: entry for entry in get_step_states(topic_id, topic)}
    if payload.step not in current or current[payload.step]["state"] not in ("failed", "missing"):
        raise HTTPException(status_code=409, detail="Für dieses Feld ist kein erneuter Start nötig.")

    mark_step_running(topic_id, payload.step)
    background_tasks.add_task(retry_step, topic_id, payload.step)
    return JSONResponse(status_code=202, content={"status": "running", "topic_id": topic_id, "step": payload.step})


@app.post("/topics/{topic_id}/refresh-gsc")
def refresh_gsc_endpoint(topic_id: str, background_tasks: BackgroundTasks, member_id: str = Depends(require_member)):
    """
    NEU (14.09.2026): manueller Nachzieh-Trigger für GSC-Near-Miss-Daten,
    unabhängig vom turnusmäßigen Monatslauf. Gedacht für den Fall, dass
    die GSC-Verbindung ERST NACH dem Anlegen eines Themas hergestellt
    wurde (siehe Chat-Verlauf 14.09.2026) — ohne diesen Endpunkt hätte man
    bis zu 30 Tage auf den nächsten fälligen collect_monthly_data-Lauf
    warten müssen. Läuft NUR den GSC-Teil (refresh_gsc_data in
    run_topic.py), nicht den teuren Rest von collect_monthly_data
    (Keywords/AI-Overview/SERP-Check werden dabei NICHT neu abgefragt).

    Läuft als Hintergrund-Task, weil der GSC-API-Call ein paar Sekunden
    dauern kann — die Antwort kommt sofort, das Ergebnis erscheint beim
    nächsten Laden der Themen-Detailansicht (search_queries mit
    source='gsc_near_miss').
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id, status, own_domain, seed_keyword")
            .eq("id", topic_id)
            .single()
            .execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    if topic["status"] not in ("active", "error"):
        raise HTTPException(
            status_code=409,
            detail=f"GSC-Nachziehen nur für aktive oder fehlgeschlagene Themen möglich (aktuell: '{topic['status']}').",
        )

    # GEÄNDERT (15.09.2026): seed_keyword mitgegeben, siehe run_topic.py:
    # refresh_gsc_data — sonst würde der manuelle Trigger auf die
    # Themenrelevanz-Filterung verzichten und ALLE GSC-Anfragen
    # übernehmen, während der automatische Monatslauf gefiltert speichert.
    background_tasks.add_task(refresh_gsc_data, topic_id, topic["own_domain"], team_id, topic.get("seed_keyword"))
    return {"status": "refreshing", "topic_id": topic_id}

@app.get("/topics/{topic_id}/competitor-suggestions")
def get_competitor_suggestions_endpoint(topic_id: str, member_id: str = Depends(require_member)):
    """
    NEU (14.09.2026): siehe competitor_suggestions.py. Liefert nur die noch
    offenen ('pending') Vorschläge, kein erneuter Claude-Call, die
    Generierung läuft bereits automatisch im Hintergrund nach dem ersten
    Sammel-Lauf (siehe _collect_and_analyze_background).
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        suggestions = get_competitor_suggestions_for_topic(topic_id)
    except Exception as e:
        logger.exception("Fehler beim Laden der Wettbewerber-Vorschläge für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Konnte Vorschläge nicht laden: {e}")

    return {"topic_id": topic_id, "suggestions": suggestions}


class ConfirmCompetitorsRequest(BaseModel):
    competitor_domains: list[str]


@app.post("/topics/{topic_id}/confirm-competitors")
def confirm_competitors_endpoint(
    topic_id: str, payload: ConfirmCompetitorsRequest, background_tasks: BackgroundTasks,
    member_id: str = Depends(require_member),
):
    """
    NEU (14.09.2026): Übernimmt die vom User zusammengestellte Wettbewerber-
    Liste (siehe GET .../competitor-suggestions für die Vorschläge, dazu).

    GEÄNDERT (15.09.2026): schreibt jetzt auf ai_visibility_topics.
    competitor_domains DIESES Topics, nicht mehr auf projects.
    competitor_domains (siehe _get_topic_competitor_domains für die
    ausführliche Begründung: ein Projekt kann fachlich unabhängige Themen
    mit unterschiedlichen Wettbewerbern haben). Die vorherige projects.
    excluded_competitor_domains-Zwischenlösung entfällt damit ersatzlos —
    das Problem, das sie lösen sollte, kann strukturell nicht mehr
    auftreten, wenn jedes Topic seine eigene Liste hat.

    payload.competitor_domains ist die VOLLSTÄNDIGE gewünschte Liste und
    ERSETZT ai_visibility_topics.competitor_domains (dedupliziert,
    case-insensitiv/ohne 'www.' normalisiert) — kein Additiv-Merge, damit
    sich eine Domain auch wieder entfernen lässt ("echtes Austauschen",
    siehe Chat-Verlauf 15.09.2026).

    Markiert danach die zugehörigen Vorschlagszeilen als entschieden
    (mark_suggestions_reviewed, siehe competitor_suggestions.py: bestätigte
    Domains -> 'confirmed', der Rest der bisher offenen Vorschläge für
    dieses Topic -> 'dismissed') und stößt Quellen-Analyse, Opportunities
    und Lücken-Analyse für DIESES Topic erneut an, damit die Bestätigung
    sich sofort auswirkt, statt erst beim nächsten Cron-Lauf.
    """
    team_id = _resolve_team_id(member_id)
    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("team_id")
            .eq("id", topic_id).single().execute()
        ).data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    # Dedupliziert die vom Frontend geschickte Endliste (normalisiert,
    # keine Duplikate).
    seen_normed: set[str] = set()
    final_domains: list[str] = []
    for d in payload.competitor_domains:
        if not d:
            continue
        normed = _normalize_search_domain(d)
        if normed not in seen_normed:
            final_domains.append(d)
            seen_normed.add(normed)

    try:
        supabase.table("ai_visibility_topics").update({"competitor_domains": final_domains}).eq("id", topic_id).execute()
    except Exception:
        logger.exception("Fehler beim Speichern der bestätigten Wettbewerber für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail="Wettbewerber konnten nicht gespeichert werden")

    try:
        mark_suggestions_reviewed(topic_id, final_domains)
    except Exception:
        logger.exception("Konnte Wettbewerber-Vorschläge für Topic %s nicht als entschieden markieren", topic_id)

    for step_key in ("source_analysis", "opportunities", "gap_analysis", "action_plan"):
        mark_step_running(topic_id, step_key)

    background_tasks.add_task(_reanalyze_after_competitor_confirmation, topic_id)

    return {"status": "ok", "competitor_domains": final_domains}


class PromptStatusUpdate(BaseModel):
    prompt_type: str  # "stable_core" oder "discovery"


@app.post("/topics/{topic_id}/prompts")
def create_manual_prompt_endpoint(
    topic_id: str, payload: CreateManualPromptRequest, member_id: str = Depends(require_member),
):
    """
    NEU (15.09.2026): manuelles Anlegen eines Stable-Core-Prompts mit frei
    gewählter Phase (siehe Chat-Verlauf 15.09.2026). Eigenes Kontingent von
    MAX_MANUAL_PROMPTS, zusätzlich zu den automatisch generierten (siehe
    Konstanten-Kommentar oben) — macht zusammen bis zu 20 Stable-Core-
    Prompts pro Topic.

    prompt_type ist fest 'stable_core' (nicht 'discovery'): eine frei
    gewählte Phase ergibt für 'discovery' keinen Sinn, dessen Phase ist
    laut prompt_discovery.py implizit immer 'discovery' selbst.

    find_or_create_prompt ist idempotent (siehe run_topic.py) — legt ein
    Nutzer denselben Text an, der schon (mit welchem source auch immer)
    existiert, wird kein Duplikat erzeugt und kein zusätzlicher manueller
    Slot verbraucht.
    """
    team_id = _resolve_team_id(member_id)

    prompt_text = (payload.prompt_text or "").strip()
    if not prompt_text:
        raise HTTPException(status_code=400, detail="prompt_text darf nicht leer sein")
    if payload.messymiddle_phase not in MESSYMIDDLE_PHASES:
        raise HTTPException(
            status_code=400,
            detail=f"messymiddle_phase muss eines von {', '.join(MESSYMIDDLE_PHASES)} sein",
        )
    if not payload.force and _looks_like_bare_keyword(prompt_text):
        raise HTTPException(
            status_code=422,
            detail=(
                f"'{prompt_text}' sieht eher nach einem Keyword als nach einer echten "
                "Frage/Aufforderung aus. Bitte so formulieren, wie ein Nutzer es an ChatGPT "
                "stellen würde (z.B. 'Welche KI-Beratung passt zu meinem Unternehmen?' statt "
                "'ki beratung mittelstand'). Falls das wirklich so gewollt ist: mit "
                "force=true erneut senden."
            ),
        )

    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    # GEÄNDERT (23.09.2026): gemeinsamer Topf von 20 statt fester 4 eigener
    # Plätze. Wer System-Prompts deaktiviert, kann entsprechend mehr eigene anlegen.
    try:
        budget = get_prompt_budget(topic_id)
    except Exception as e:
        logger.exception("Fehler beim Berechnen des Prompt-Budgets für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Zählung fehlgeschlagen: {e}")

    if budget["frei_eigene"] <= 0:
        raise HTTPException(
            status_code=409,
            detail=f"Alle {budget['max_gesamt']} Prompt-Plätze sind belegt. "
                    "Erst einen bestehenden Prompt deaktivieren.",
        )

    role_name = None
    if payload.role_id:
        role_name = _topic_role_names(topic_id).get(payload.role_id)
        if not role_name:
            raise HTTPException(status_code=400, detail="Diese Rolle gehört nicht zu diesem Thema")

    try:
        prompt_id = find_or_create_prompt(
            topic_id, prompt_text, prompt_type="stable_core",
            messymiddle_phase=payload.messymiddle_phase, source="manual",
            persona=role_name, role_id=payload.role_id,
        )
    except Exception as e:
        logger.exception("Fehler beim manuellen Anlegen eines Prompts für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Prompt konnte nicht angelegt werden: {e}")

    return {"status": "ok", "prompt_id": prompt_id, "messymiddle_phase": payload.messymiddle_phase}


@app.patch("/topics/{topic_id}/keywords/{keyword_id}/phase")
def update_keyword_phase_endpoint(
    topic_id: str, keyword_id: str, payload: UpdateKeywordPhaseRequest, member_id: str = Depends(require_member),
):
    """
    NEU (15.09.2026): manuelle Korrektur der Messy-Middle-Phase eines
    Keywords/einer PAA-Frage (siehe Chat-Verlauf 15.09.2026, UpdateKeyword
    PhaseRequest oben für die Begründung). Setzt phase_manually_set=true,
    damit run_topic.py: save_search_queries diese Korrektur bei
    künftigen Sammel-Läufen respektiert und nicht überschreibt.
    """
    team_id = _resolve_team_id(member_id)

    if payload.messymiddle_phase not in MESSYMIDDLE_PHASES:
        raise HTTPException(
            status_code=400,
            detail=f"messymiddle_phase muss eines von {', '.join(MESSYMIDDLE_PHASES)} sein",
        )

    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        keyword_row = (
            supabase.table("search_queries")
            .select("id, topic_id")
            .eq("id", keyword_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Keyword nicht gefunden")
    if not keyword_row or keyword_row.get("topic_id") != topic_id:
        raise HTTPException(status_code=404, detail="Keyword geh\u00f6rt nicht zu diesem Topic")

    try:
        supabase.table("search_queries").update({
            "messymiddle_phase": payload.messymiddle_phase,
            "phase_manually_set": True,
        }).eq("id", keyword_id).execute()
    except Exception as e:
        logger.exception("Fehler beim Speichern der manuellen Phasen-Korrektur (keyword_id=%s)", keyword_id)
        raise HTTPException(status_code=500, detail=f"Phase konnte nicht gespeichert werden: {e}")

    return {"status": "ok", "keyword_id": keyword_id, "messymiddle_phase": payload.messymiddle_phase}


@app.post("/topics/{topic_id}/keywords")
def create_manual_keyword_endpoint(
    topic_id: str, payload: CreateManualKeywordRequest, member_id: str = Depends(require_member),
):
    """
    NEU (16.09.2026): manuelles Anlegen eines Keywords, analog zu
    create_manual_prompt_endpoint oben, siehe Chat-Verlauf 16.09.2026.
    source='manual' unterscheidet diese Zeilen von automatisch
    gesammelten (related_keywords/keyword_ideas/keyword_suggestions/paa/
    gsc_near_miss), damit z.B. save_search_queries bei künftigen Läufen
    nicht versehentlich mit ihnen kollidiert.

    ──────────────────────────────────────────────────────────────────
    NOCH NICHT AUSGEFÜHRTE MIGRATION, bitte gegen euer Schema prüfen:

        alter table search_queries add column is_active boolean not null default true;

    Ohne diese Spalte schlägt sowohl dieser Endpunkt als auch
    deactivate_keyword_endpoint (siehe unten) sowie der is_active-Filter
    in get_topic_detail fehl — exakt dasselbe Muster wie der
    content_recommendation-Fund vom 16.09.2026 (opportunities.py), bitte
    diesmal VOR dem Deploy ausführen, nicht erst nach dem nächsten
    "warum ist X leer"-Vorfall.
    ──────────────────────────────────────────────────────────────────
    """
    team_id = _resolve_team_id(member_id)

    keyword = (payload.keyword or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword darf nicht leer sein")
    if payload.messymiddle_phase is not None and payload.messymiddle_phase not in MESSYMIDDLE_PHASES:
        raise HTTPException(
            status_code=400,
            detail=f"messymiddle_phase muss eines von {', '.join(MESSYMIDDLE_PHASES)} sein",
        )

    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        manual_count = (
            supabase.table("search_queries")
            .select("id", count="exact")
            .eq("topic_id", topic_id)
            .eq("source", "manual")
            .eq("is_active", True)
            .execute()
        ).count or 0
    except Exception as e:
        logger.exception("Fehler beim Zählen der manuellen Keywords für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Zählung fehlgeschlagen: {e}")

    if manual_count >= MAX_MANUAL_KEYWORDS:
        raise HTTPException(
            status_code=409,
            detail=f"Bereits {manual_count}/{MAX_MANUAL_KEYWORDS} manuell hinzugefügte Keywords. "
                    "Erst ein bestehendes manuelles Keyword deaktivieren.",
        )

    try:
        existing = (
            supabase.table("search_queries")
            .select("id")
            .eq("topic_id", topic_id)
            .eq("keyword", keyword)
            .limit(1)
            .execute()
        ).data
        if existing:
            keyword_id = existing[0]["id"]
        else:
            inserted = (
                supabase.table("search_queries")
                .insert({
                    "topic_id": topic_id,
                    "keyword": keyword,
                    "source": "manual",
                    "messymiddle_phase": payload.messymiddle_phase,
                    "phase_manually_set": payload.messymiddle_phase is not None,
                    "is_active": True,
                })
                .execute()
            )
            keyword_id = inserted.data[0]["id"]
    except Exception as e:
        logger.exception("Fehler beim manuellen Anlegen eines Keywords für Topic %s", topic_id)
        raise HTTPException(status_code=500, detail=f"Keyword konnte nicht angelegt werden: {e}")

    return {"status": "ok", "keyword_id": keyword_id, "messymiddle_phase": payload.messymiddle_phase}


@app.patch("/topics/{topic_id}/keywords/{keyword_id}/deactivate")
def deactivate_keyword_endpoint(topic_id: str, keyword_id: str, member_id: str = Depends(require_member)):
    """
    NEU (16.09.2026): Keyword/GSC-Performance-Keyword für dieses Topic
    entfernen, siehe Chat-Verlauf 16.09.2026. Soft-Delete über
    is_active=false statt eines echten DELETE — dieselbe Begründung wie
    bei Prompts (deactivate_prompt_endpoint unten): search_queries.id
    kann von intent_clusters/changelog referenziert sein, ein harter
    DELETE würde dort Fremdschlüssel-Verweise brechen oder eine
    ON-DELETE-Kaskade auslösen, die mehr mitreißt als gewollt.

    Braucht dieselbe Migration wie create_manual_keyword_endpoint oben
    (search_queries.is_active).
    """
    team_id = _resolve_team_id(member_id)

    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        keyword_row = (
            supabase.table("search_queries").select("id, topic_id").eq("id", keyword_id).single().execute().data
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Keyword nicht gefunden")
    if not keyword_row or keyword_row.get("topic_id") != topic_id:
        raise HTTPException(status_code=404, detail="Keyword gehört nicht zu diesem Topic")

    try:
        supabase.table("search_queries").update({"is_active": False}).eq("id", keyword_id).execute()
    except Exception as e:
        logger.exception("Fehler beim Deaktivieren des Keywords (keyword_id=%s)", keyword_id)
        raise HTTPException(status_code=500, detail=f"Keyword konnte nicht entfernt werden: {e}")

    return {"status": "ok", "keyword_id": keyword_id}


@app.patch("/topics/{topic_id}/prompts/{prompt_id}/deactivate")
def deactivate_prompt_endpoint(topic_id: str, prompt_id: str, member_id: str = Depends(require_member)):
    """
    NEU (16.09.2026): Prompt für dieses Topic entfernen, siehe Chat-
    Verlauf 16.09.2026 ("bei Prompts, Keywords und GSC-Performance-
    Keywords sollten User die Möglichkeit haben, diese zu entfernen").
    Soft-Delete über is_active=false (Spalte existiert bereits, siehe
    schema_full.sql: prompts.is_active) statt eines echten DELETE: ein
    Prompt kann bereits ai_runs/content_ideas/opportunities-Verweise
    haben (prompt_id-Fremdschlüssel), die für die historische Auswertung
    (Zitationsverlauf, Content-Ideen) erhalten bleiben sollen, auch wenn
    der Prompt selbst nicht mehr aktiv getrackt wird. get_topic_detail
    filtert bereits serverseitig auf is_active=true, ein deaktivierter
    Prompt verschwindet also direkt aus der Prompts-Ansicht.
    """
    team_id = _resolve_team_id(member_id)

    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    try:
        prompt_row = (
            supabase.table("prompts").select("id, topic_id").eq("id", prompt_id).single().execute().data
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Prompt nicht gefunden")
    if not prompt_row or prompt_row.get("topic_id") != topic_id:
        raise HTTPException(status_code=404, detail="Prompt gehört nicht zu diesem Topic")

    try:
        supabase.table("prompts").update({"is_active": False}).eq("id", prompt_id).execute()
    except Exception as e:
        logger.exception("Fehler beim Deaktivieren des Prompts (prompt_id=%s)", prompt_id)
        raise HTTPException(status_code=500, detail=f"Prompt konnte nicht entfernt werden: {e}")

    return {"status": "ok", "prompt_id": prompt_id}


@app.post("/topics/{topic_id}/prompts/{prompt_id}/set-type")
def set_prompt_type_endpoint(
    topic_id: str, prompt_id: str, payload: PromptStatusUpdate,
    member_id: str = Depends(require_member),
):
    """
    Promote (discovery -> stable_core) oder Demote (stable_core -> discovery).
    Bei Promote wird das 16er-Limit hart durchgesetzt, kein automatisches
    Verdrängen eines anderen Prompts, das müsst ihr bewusst separat tun
    (erst demoten, dann promoten).
    """
    team_id = _resolve_team_id(member_id)

    if payload.prompt_type not in ("stable_core", "discovery"):
        raise HTTPException(status_code=400, detail="prompt_type muss 'stable_core' oder 'discovery' sein")

    try:
        topic = supabase.table("ai_visibility_topics").select("team_id").eq("id", topic_id).single().execute().data
    except Exception:
        raise HTTPException(status_code=404, detail="Topic nicht gefunden")
    _check_topic_belongs_to_team(topic, team_id)

    if payload.prompt_type == "stable_core":
        # GEÄNDERT (23.09.2026): gemeinsames Budget, hochgestufte Discovery-
        # Prompts zählen als System-Prompts (max. 16, insgesamt max. 20).
        try:
            budget = get_prompt_budget(topic_id)
        except Exception as e:
            logger.exception("Fehler beim Zählen der Stable-Core-Prompts für Topic %s", topic_id)
            raise HTTPException(status_code=500, detail=f"Zählung fehlgeschlagen: {e}")
        if budget["frei_system"] <= 0:
            raise HTTPException(
                status_code=409,
                detail=f"Keine freien Plätze: {budget['aktiv_system']}/{budget['max_system']} System-Prompts, "
                        f"{budget['aktiv_gesamt']}/{budget['max_gesamt']} insgesamt. Erst einen anderen demoten.",
            )

    try:
        supabase.table("prompts").update({"prompt_type": payload.prompt_type}).eq("id", prompt_id).eq("topic_id", topic_id).execute()
    except Exception as e:
        logger.exception("Fehler beim Ändern des Prompt-Typs (prompt_id=%s)", prompt_id)
        raise HTTPException(status_code=500, detail=f"Konnte Prompt-Typ nicht ändern: {e}")

    return {"status": "ok", "prompt_id": prompt_id, "prompt_type": payload.prompt_type}


# ══════════════════════════════════════════════════════════════════════════
# Downgrade-Entscheidung (§ Kunde wählt, welche Themen bei Downgrade wegfallen)
# ══════════════════════════════════════════════════════════════════════════

@app.get("/account/downgrade-status")
def downgrade_status_endpoint(member_id: str = Depends(require_member)):
    """
    Liefert, ob gerade eine Downgrade-Entscheidung offen ist (der Webhook
    hat die Menge reduziert, aber es gibt mehr aktive Themen als die neue
    Menge erlaubt), und falls ja, aus welchen Themen der Owner wählen kann.
    Nur der Team-Owner darf das abfragen, siehe get_owner_user_row_for_billing.
    """
    try:
        user = get_owner_user_row_for_billing(member_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if not user.get("topics_over_limit"):
        return {"over_limit": False}

    try:
        topics = (
            supabase.table("ai_visibility_topics")
            .select("id, name, seed_keyword, own_domain, created_at")
            .eq("team_id", user["team_id"])
            .eq("status", "active")
            .order("created_at")
            .execute()
        ).data
    except Exception as e:
        logger.exception("Fehler beim Laden der Downgrade-Themen für Team %s", user["team_id"])
        raise HTTPException(status_code=500, detail=f"Konnte Themen nicht laden: {e}")

    return {
        "over_limit": True,
        "pending_limit": user.get("pending_topics_limit"),
        "effective_at": user.get("downgrade_effective_at"),
        "topics": topics,
    }


class ResolveDowngradeRequest(BaseModel):
    keep_topic_ids: list[str]  # welche der aktuell aktiven Themen behalten werden sollen


@app.post("/account/resolve-downgrade")
def resolve_downgrade_endpoint(payload: ResolveDowngradeRequest, member_id: str = Depends(require_member)):
    """
    Vorzeitige Auflösung EINES offenen Downgrades (der Kunde muss die Frist
    downgrade_effective_at nicht abwarten, trifft er rechtzeitig eine Wahl,
    wird sofort archiviert statt erst zum Stichtag). Archiviert (NICHT hart
    löschen, Daten bleiben für einen eventuellen späteren Neukauf erhalten)
    alle nicht ausgewählten aktiven Themen, senkt danach erst das
    tatsächliche Limit. Reihenfolge bewusst so: Limit wird erst gesenkt,
    wenn die Auswahl schon vollzogen ist, sonst könnte ein zwischenzeit-
    licher Fehler das Team ohne aktive Themen, aber mit korrektem Limit
    zurücklassen. Trifft der Kunde KEINE Wahl bis zur Frist, übernimmt
    stattdessen automatisch enforce_expired_downgrades() (siehe
    /cron/enforce-downgrades).
    """
    try:
        user = get_owner_user_row_for_billing(member_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if not user.get("topics_over_limit"):
        raise HTTPException(status_code=400, detail="Keine offene Downgrade-Entscheidung vorhanden")

    pending_limit = user.get("pending_topics_limit") or 0
    if len(payload.keep_topic_ids) > pending_limit:
        raise HTTPException(
            status_code=400,
            detail=f"Euer neues Limit erlaubt maximal {pending_limit} Themen, ausgewählt: {len(payload.keep_topic_ids)}",
        )

    try:
        active_topics = (
            supabase.table("ai_visibility_topics")
            .select("id")
            .eq("team_id", user["team_id"])
            .eq("status", "active")
            .execute()
        ).data
    except Exception as e:
        logger.exception("Fehler beim Laden der aktiven Themen für Team %s", user["team_id"])
        raise HTTPException(status_code=500, detail=f"Konnte Themen nicht laden: {e}")

    active_ids = {t["id"] for t in active_topics}
    keep_ids = set(payload.keep_topic_ids)
    invalid_ids = keep_ids - active_ids
    if invalid_ids:
        raise HTTPException(status_code=400, detail=f"Unbekannte oder nicht betroffene Topic-IDs: {sorted(invalid_ids)}")

    archive_ids = list(active_ids - keep_ids)

    try:
        if archive_ids:
            supabase.table("ai_visibility_topics").update({"status": "archived"}).in_("id", archive_ids).execute()

        supabase.table("users").update({
            "ai_visibility_topics_limit": pending_limit,
            "topics_over_limit": False,
            "pending_topics_limit": None,
            "downgrade_effective_at": None,
        }).eq("id", user["id"]).execute()
    except Exception as e:
        logger.exception("Fehler beim Auflösen des Downgrades für User %s", user["id"])
        raise HTTPException(status_code=500, detail=f"Downgrade konnte nicht aufgelöst werden: {e}")

    return {"status": "ok", "kept": sorted(keep_ids), "archived": sorted(archive_ids), "new_limit": pending_limit}


@app.post("/cron/enforce-downgrades")
def cron_enforce_downgrades_endpoint(x_cron_secret: str = Header(...)):
    """
    Fallback-Kadenz (empfohlen: täglich) für Kunden, die bis zur Frist
    keine eigene Wahl getroffen haben. Siehe enforce_expired_downgrades().
    """
    _check_cron_secret(x_cron_secret)
    try:
        results = enforce_expired_downgrades()
    except Exception as e:
        logger.exception("Fehler beim automatischen Durchsetzen überfälliger Downgrades")
        raise HTTPException(status_code=500, detail=f"Downgrade-Enforcement fehlgeschlagen: {e}")
    return {"status": "ok", "processed": len(results), "details": results}


# ══════════════════════════════════════════════════════════════════════════
# Cron-Endpunkte: werden von Supabase pg_cron über eine Edge Function
# angestoßen, nicht direkt von Nutzern. Verarbeiten alle fälligen Topics
# über alle Teams hinweg, daher kein Memberstack-Auth nötig, stattdessen
# ein eigenes CRON_SECRET.
# ══════════════════════════════════════════════════════════════════════════

def _weekly_background(topic_id: str, own_domain: str) -> None:
    # GEÄNDERT (16.09.2026): siehe _record_topic_run_error/
    # _clear_topic_run_error weiter oben — dieselbe Fehler-Persistenz wie
    # beim Erstlauf, damit ein fehlgeschlagener wöchentlicher Lauf auch
    # ohne Log-Zugriff diagnostizierbar ist.
    # GEÄNDERT (20.09.2026): die Analyse läuft über den Step-Tracker.
    try:
        prompts = get_topic_prompts(topic_id)
        if not prompts:
            logger.warning("Topic %s hat keine Stable-Core-Prompts, weekly-Lauf übersprungen", topic_id)
            return
        collect_weekly_data(topic_id, own_domain, prompts, "de", "Germany")
    except Exception as e:
        logger.exception("Weekly Cron-Lauf fehlgeschlagen für Topic %s", topic_id)
        _record_topic_run_error(topic_id, "weekly_background", e)
        return

    # GEÄNDERT (15.09.2026): generate_summary lief hier bisher auch mit,
    # lief also faktisch WÖCHENTLICH statt monatlich — obwohl die
    # Zusammenfassung explizit auf einen Monatsvergleich ausgelegt ist
    # (siehe claude_summary.py). Auf Kundenwunsch vom 15.09.2026 jetzt
    # NUR NOCH im monatlichen Lauf, siehe _monthly_background unten.
    if run_step(topic_id, "opportunities", triggered_by="weekly").ok:
        _clear_topic_run_error(topic_id)


def _monthly_background(topic_id: str, seed_keyword: str, own_domain: str, team_id: str) -> None:
    """
    GEÄNDERT (20.09.2026), siehe Chat-Verlauf 20.09.2026:
    - Jeder Analyse-Schritt läuft einzeln über den Step-Tracker. Vorher lag
      alles in EINEM try-Block: scheiterte die Lücken-Analyse, wurden
      Aktionsplan und Empfehlungen gar nicht mehr gestartet.
    - Die Zusammenfassung läuft wieder monatlich (am 16.09.2026 war sie hier
      auskommentiert). Sie enthält jetzt zusätzlich den Umsetzungsstand der
      Nutzer-Änderungen und den Stand des KI-Wissens-Checks.
    - Neu: monatlicher KI-Wissens-Check, VOR Aktionsplan und Zusammenfassung,
      weil beide sein Ergebnis nutzen.
    Reihenfolge: Datenerhebung, Handlungsfelder, Lücken-Analyse (nutzt die
    frisch aktualisierten Quellen-Profile), Empfehlungen zu den Handlungs-
    feldern, KI-Wissens-Check, Aktionsplan (nutzt alles davor), Zusammenfassung.
    """
    # GEÄNDERT (14.09.2026): kein Auflösen mehr auf den Team-Owner, siehe
    # create_topic_endpoint für die Begründung. team_id kommt hier ohnehin
    # schon als Parameter rein.
    collected = run_tracked(
        topic_id, "collect",
        lambda: collect_monthly_data(topic_id, seed_keyword, own_domain, "de", "Germany", team_id, triggered_by="monthly"),
        triggered_by="monthly",
    )
    if not collected.ok:
        logger.error("Monthly Cron-Lauf: Datenerhebung fehlgeschlagen für Topic %s, Analysen werden übersprungen", topic_id)
        _record_topic_run_error(topic_id, "monthly_background", collected.error)
        return

    all_ok = True
    # NEU (13.09.2026): Lücken-Analyse bewusst NUR im monatlichen, NICHT im
    # wöchentlichen Cron: source_profiles, ihre Haupt-Eingabe, werden nur
    # monatlich aktualisiert. Aktionsplan (NEU 17.09.2026) nutzt deren Output
    # mit, Content-Empfehlungen (NEU 15.09.2026) brauchen die frisch
    # generierte Opportunity-Liste.
    for step in ("opportunities", "gap_analysis", "content_recommendations", "ai_knowledge", "action_plan", "summary"):
        if not run_step(topic_id, step, triggered_by="monthly").ok:
            all_ok = False

    if all_ok:
        _clear_topic_run_error(topic_id)


@app.post("/cron/weekly")
def cron_weekly(background_tasks: BackgroundTasks, x_cron_secret: str = Header(...)):
    _check_cron_secret(x_cron_secret)
    try:
        due_topics = get_due_topics("weekly")
    except Exception as e:
        logger.exception("Fehler beim Ermitteln fälliger Weekly-Topics")
        raise HTTPException(status_code=500, detail=f"Konnte fällige Topics nicht laden: {e}")

    for topic in due_topics:
        background_tasks.add_task(_weekly_background, topic["id"], topic["own_domain"])

    logger.info("Weekly Cron gestartet für %d Topic(s)", len(due_topics))
    return {"status": "ok", "queued": len(due_topics)}


@app.post("/cron/monthly")
def cron_monthly(background_tasks: BackgroundTasks, x_cron_secret: str = Header(...)):
    _check_cron_secret(x_cron_secret)
    try:
        due_topics = get_due_topics("monthly")
    except Exception as e:
        logger.exception("Fehler beim Ermitteln fälliger Monthly-Topics")
        raise HTTPException(status_code=500, detail=f"Konnte fällige Topics nicht laden: {e}")

    for topic in due_topics:
        background_tasks.add_task(_monthly_background, topic["id"], topic["seed_keyword"], topic["own_domain"], topic["team_id"])

    logger.info("Monthly Cron gestartet für %d Topic(s)", len(due_topics))
    return {"status": "ok", "queued": len(due_topics)}


def _start_first_run_for_promoted_topic(topic_id: str) -> None:
    """
    NEU (20.09.2026): startet den Erstlauf für ein Thema, das gerade aus der
    Warteschlange befördert wurde (status 'collecting', siehe
    enforce_scheduled_archivals). Gleiche Parameter wie beim regulären Anlegen
    (create_topic_endpoint), Projekt-Sprache und -Standort kommen aus dem Topic.
    """
    import threading

    try:
        topic = (
            supabase.table("ai_visibility_topics")
            .select("id, team_id, seed_keyword, own_domain, language_code, location_name")
            .eq("id", topic_id).single().execute()
        ).data
    except Exception:
        logger.exception("Beförderten Topic %s konnte nicht geladen werden, Erstlauf nicht gestartet", topic_id)
        try:
            supabase.table("ai_visibility_topics").update({"status": "error"}).eq("id", topic_id).execute()
        except Exception:
            logger.exception("Konnte Fehler-Status für Topic %s nicht setzen", topic_id)
        return

    threading.Thread(
        target=_collect_and_analyze_background,
        args=(
            topic_id, topic["seed_keyword"], topic["own_domain"],
            topic["language_code"], topic["location_name"], [], topic["team_id"],
        ),
        daemon=True,
        name=f"first-run-{topic_id}",
    ).start()
    logger.info("Erstlauf für beförderten Topic %s gestartet", topic_id)


def _retry_failed_background() -> None:
    """
    NEU (14.09.2026): Läuft als BackgroundTask, aus demselben Grund wie
    _weekly_background/_monthly_background: retry_failed_tasks() kann je
    nach Anzahl offener Einträge mehrere Sekunden bis Minuten dauern.

    Stürzt retry_failed_tasks() komplett ab (z.B. weil Supabase nicht
    erreichbar ist, nicht nur ein einzelner Task fehlschlägt), geht dafür
    zusätzlich zum Log eine Alarm-Mail raus. Das ist der Fall, den einzelne
    gave_up-Alarme (siehe _send_gave_up_alert in run_topic.py) NICHT
    abdecken: dort läuft die Funktion ja noch, hier bricht sie komplett ab,
    bevor überhaupt Tasks abgearbeitet werden.

    GEÄNDERT (14.09.2026): ruft danach zusätzlich enforce_scheduled_
    archivals() auf (siehe run_topic.py) — huckepack auf demselben Cron
    statt eines eigenen pg_cron-Eintrags, aus genau dem Grund, aus dem
    auch retry-failed selbst diese Kadenz nutzt (alle 15-30 Minuten,
    häufig genug, dass eine vorgemerkte Deaktivierung nicht tagelang
    hängen bleibt). Eigener try/except, damit ein Fehler hier NICHT den
    Retry-Teil oben nachträglich als fehlgeschlagen erscheinen lässt.
    """
    try:
        result = retry_failed_tasks()
        logger.info("Retry-Cron abgeschlossen: %s", result)
    except Exception as e:
        logger.exception("Retry-Cron-Lauf komplett fehlgeschlagen")
        send_failure_alert_email(
            subject="🔥 Visibility Tracker: Retry-Cron komplett abgestürzt",
            html_body=(
                f"<p>retry_failed_tasks() ist mit einem Fehler abgebrochen, "
                f"BEVOR Tasks abgearbeitet werden konnten:</p><p><code>{e}</code></p>"
                f"<p>Bitte Railway-Logs prüfen.</p>"
            ),
        )

    try:
        archival_result = enforce_scheduled_archivals()
        if archival_result:
            logger.info("Vorgemerkte Deaktivierungen/Warteschlange verarbeitet: %s", archival_result)
        # GEÄNDERT (20.09.2026): beförderte Themen bekommen jetzt ihren Erstlauf.
        # Vorher wurden sie nur auf 'active' gesetzt und nie gestartet, siehe
        # run_topic.py: enforce_scheduled_archivals. Jeder Erstlauf läuft in
        # einem eigenen Thread, damit der Retry-Cron nicht minutenlang blockiert.
        for entry in archival_result:
            if entry.get("promoted_topic_id"):
                _start_first_run_for_promoted_topic(entry["promoted_topic_id"])
    except Exception:
        logger.exception("Durchsetzen vorgemerkter Deaktivierungen fehlgeschlagen")


@app.post("/cron/retry-failed")
def cron_retry_failed(background_tasks: BackgroundTasks, x_cron_secret: str = Header(...)):
    """
    NEU (14.09.2026): Arbeitet die Retry-Queue (Tabelle failed_tasks) ab:
    fehlgeschlagene related_keywords/google_ai_overview/chat_gpt/gemini-
    Requests aus collect_monthly_data/collect_weekly_data werden hier
    erneut versucht (siehe log_failed_task/retry_failed_tasks in
    run_topic.py).

    Sollte HÄUFIGER laufen als /cron/weekly bzw. /cron/monthly (empfohlen:
    alle 15-30 Minuten), sonst bleibt ein fehlgeschlagener Request bis zum
    nächsten regulären Lauf (7 bzw. 30 Tage) einfach liegen.
    """
    _check_cron_secret(x_cron_secret)
    background_tasks.add_task(_retry_failed_background)
    logger.info("Retry-Cron gestartet")
    return {"status": "ok"}
