/**
 * dashboard-v9.js
 * ----------------
 * Member-Dashboard: Stat-Karten, Aktions-Buttons, Analysen-Liste, PDF-Download,
 * Team-Einladungen (Sichtbarkeit), "Zuletzt aktiv"-Uebersicht - komplett aus JS
 * generiert, kein Custom-Attribute-Bauplan mehr in Webflow noetig.
 *
 * Seite: /member/dashboard
 * Embedding: jsDelivr (<script src=".../dashboard-v9.js">)
 * Dependencies: window.supabase (global), window.$memberstackDom
 *
 * ÄNDERUNGEN ggü. v8 (RLS-Bugfix "Zuletzt aktiv"):
 *   - BUGFIX: "Zuletzt aktiv" zeigte in v8 nur Analysen, nie Aufbau-Projekte
 *     oder KI-Agent-Chats, obwohl beide vorhanden waren. Ursache: v8 fragte
 *     page_projects/ai_chat_sessions per direktem Tabellen-Select ab. Diese
 *     Tabellen sind RLS-geschuetzt, das Frontend authentifiziert sich aber
 *     ueber Memberstack + Anon-Key statt echtem Supabase Auth - auth.uid()
 *     ist bei jedem Request also null, RLS filtert dadurch still ALLE Zeilen
 *     raus (200 OK, leeres Array, kein Fehler im Log). get_analyses_for_member
 *     umgeht das schon laenger ueber eine SECURITY DEFINER RPC - genau dieses
 *     Muster fehlte bei den zwei neuen Quellen. Fix: zwei neue RPCs
 *     get_recent_page_projects(p_user_id, p_limit) und
 *     get_recent_agent_sessions(p_user_id, p_limit), beide SECURITY DEFINER,
 *     muessen VOR diesem Script per SQL in Supabase angelegt werden (siehe
 *     recent-activity-rpcs.sql). fetchRecentPageProjects/
 *     fetchRecentAgentSessions rufen jetzt diese RPCs statt .from(...).select(...) auf.
 *   - get_recent_agent_sessions liefert landing_page_url/keyword jetzt als
 *     flache Felder (SQL JOIN in der RPC) statt als verschachteltes
 *     PostgREST-Embed wie in v8 (s.analyses.keyword) - buildAgentActivityItems()
 *     entsprechend angepasst.
 *
 * ÄNDERUNGEN ggü. v7 (neue Section "Zuletzt aktiv"):
 *   - NEU: Section "Zuletzt aktiv" oberhalb der Stat-Karten. Zeigt die
 *     jeweils letzten Aktivitaeten aus drei Quellen zusammengefuehrt und
 *     nach Zeitstempel sortiert (neueste zuerst, max. CONFIG.RECENT_ACTIVITY_LIMIT
 *     Eintraege): Analysen (aus den ohnehin geladenen state.analysesData),
 *     Aufbau-Projekte (Tabelle page_projects) und KI-Agent-Chats (Tabelle
 *     ai_chat_sessions, nur Sessions mit total_messages > 0, damit leere,
 *     nie genutzte Sessions nicht auftauchen). Klick auf einen Eintrag
 *     oeffnet die jeweilige Zielseite in einem neuen Tab, genauso wie die
 *     bestehenden Ansicht-/KI-Agent-Icons in der Analysen-Tabelle.
 *   - ANNAHME (bitte pruefen): Die URL fuer ein bestehendes Aufbau-Projekt
 *     wurde als '/member/landingpage-assistant?project_id=<id>' geraten,
 *     abgeleitet aus dem Muster von CONFIG.NEW_LANDINGPAGE_URL. Falls die
 *     tatsaechliche Route anders aussieht: siehe buildAufbauProjectUrl().
 *   - EINSCHRAENKUNG: Aufbau-Projekte werden per .eq('user_id', ...) nur
 *     fuer den eingeloggten User selbst geladen. Laut bisherigen Notizen
 *     sind Aufbau-Projekte inzwischen team-weit sichtbar (analog zum
 *     Session-Kontingent) - dafuer gibt es aber (anders als
 *     get_analyses_for_member fuer Analysen) noch keine team-faehige RPC,
 *     und page_projects hat aktuell keine erkennbare Team-Spalte.
 *     Team-Mitglieder sehen hier also NUR ihre eigenen Aufbau-Projekte,
 *     nicht die des ganzen Teams. Bewusst NICHT den Filter entfernt und
 *     auf RLS verlassen, da unklar ist, ob die RLS-Policy auf page_projects
 *     bereits team-scoped ist - im Zweifel lieber zu wenig zeigen als
 *     versehentlich fremde Projekte anzuzeigen. Falls Team-Sichtbarkeit
 *     hier wichtig ist: RPC analog zu get_analyses_for_member bauen.
 *   - KI-Agent-Sessions werden bewusst weiterhin nur fuer den eingeloggten
 *     User geladen (kein Team-Fall) - das deckt sich mit der bestehenden
 *     Regel, dass der KI-Agent nur dem Ersteller der Analyse zur Verfuegung
 *     steht (siehe agentEnabled = isCompleted && isCreator weiter unten).
 *   - "Zuletzt aktiv" aktualisiert sich NICHT live ueber Realtime/Polling,
 *     anders als die Analysen-Tabelle - nur beim initialen Laden der Seite.
 *     Bewusste Vereinfachung fuer den ersten Wurf; bei Bedarf laesst sich
 *     ein Aufruf von loadRecentActivity() leicht in silentRefresh() ergaenzen.
 *
 * In Webflow wird NUR EIN leerer Container gebraucht:
 *   <div id="cvz-dashboard-app"></div>
 * Alle bisherigen Custom-Attribute-Elemente ([data-dashboard="..."], .table-list,
 * .analysis-row-header, Pagination-Wrapper, "Neue Analyse"/"Analyse kaufen"-Buttons)
 * koennen aus Webflow entfernt werden - dieses Script baut Karten, Buttons, Tabelle
 * und Pagination selbst und haengt sie in #cvz-dashboard-app ein.
 *
 * WEITERHIN IN WEBFLOW GEPFLEGT (unveraendert, dieses Script liest/befuellt nur):
 * - [data-user="name"], [data-user="email"], [data-user="avatar"]  (Kopfbereich)
 * - Team-Einladungs-Modal ist auf die Einstellungen-Seite umgezogen, wird hier
 *   nicht mehr referenziert.
 *
 * Features:
 * - Skeleton-Loading (Shimmer) fuer Stat-Karten + Analysen-Tabelle + "Zuletzt aktiv"
 * - Pagination (10 Analysen pro Seite)
 * - Realtime-Updates via Supabase Postgres Changes + Polling-Fallback (10s)
 * - PDF/Word Download via convertlyze-pdf-service
 * - PPU Pay-per-Use Checkout ("Analyse kaufen"-Button, direkt verdrahtet)
 * - "Neue Analyse" / "Neue Landingpage" Buttons
 * - Purchase Success Modal nach Kauf
 * - Aufbau-Sessions-Kontingent (Landingpage-Creation-Agent), Limit aus plans.page_agent_sessions_limit
 * - "Zuletzt aktiv": kombinierte Uebersicht aus Analysen, Aufbau-Projekten, KI-Agent-Chats
 *
 * KRITISCH: PDF_SECRET liegt hier als Klartext.
 * Bei Rotation: dashboard-v8.js + Railway PDF Service ENV aktualisieren.
 *
 * OFFENE FRAGE (nicht automatisch geloest): chat_messages_used_current_period /
 * chat_messages_limit werden weiterhin geladen und berechnet, aber NICHT mehr in
 * einer eigenen Karte angezeigt - im Screenshot, an dem sich dieses Redesign
 * orientiert, gab es keine "Chat-Nachrichten"-Karte. Falls die doch irgendwo
 * gebraucht wird, bitte Bescheid geben.
 *
 * WHY PDF_ACCESS_SOURCES dupliziert: Dieselbe Liste liegt zusaetzlich in
 * report.js (PDF_ACCESS_SOURCES) und in der generate-pdf-report Edge
 * Function (dort der eigentliche Sicherheits-Check). Bei Aenderung (neuer
 * Plan-Name o.ae.) IMMER alle drei Stellen synchron halten.
 *
 * WHY get_recent_page_projects als eigene RPC statt der Page-Agent-API (wie
 * in page-projects-embed.html): Fuer die "Zuletzt aktiv"-Vorschau reichen 5
 * Datensaetze mit 3 Feldern - ein zusaetzlicher API-Roundtrip waere hier
 * unnoetig. WICHTIG: Falls die Page-Agent-API zusaetzliche Business-Logik
 * anwendet (z.B. Status-Berechnung, Soft-Deletes), die die rohe Tabelle nicht
 * abbildet, kann diese Vorschau von der vollen Liste in page-projects-embed.html
 * abweichen. Falls das auffaellt: RPC entsprechend erweitern oder auf die
 * gleiche API umstellen.
 *
 * VORAUSSETZUNG: Die SQL-Funktionen get_recent_page_projects und
 * get_recent_agent_sessions muessen in Supabase existieren, bevor dieses
 * Script live geht (siehe recent-activity-rpcs.sql). Ohne sie liefert
 * "Zuletzt aktiv" wieder nur Analysen, mit einem console.warn pro fehlgeschlagenem
 * RPC-Call ("function ... does not exist").
 */
 
// -- Sofort verstecken wenn Plan im sessionStorage --------------------------
(function () {
  if (sessionStorage.getItem('selected_plan')) {
    document.documentElement.style.visibility = 'hidden';
  }
})();
 
// ==================== DASHBOARD LOGIK ====================
(function () {
  'use strict';
 
  // -- Config -----------------------------------------------------------------
 
  var CONFIG = {
    // WHY: PDF_SERVICE_URL und PDF_SECRET wurden aus dem Frontend entfernt.
    // generate-pdf-report Edge Function fuegt das Secret serverseitig hinzu.
    generateReportUrl: 'https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/generate-pdf-report',
    SUPABASE_URL:      'https://zpkifipmyeunorhtepzq.supabase.co',
    SUPABASE_ANON:     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU',
    PAGE_SIZE:         10,
    POLL_INTERVAL_MS:  10000,
    RECENT_ACTIVITY_LIMIT: 5,
    PDF_ACCESS_SOURCES: ['starter', 'pro', 'enterprise', 'pay-per-use', 'beta', 'agency'],
    PAID_PLANS:        ['Starter', 'Pro', 'Enterprise'],
    NEW_ANALYSIS_URL:  '/analyse/formular',
    // TODO: echten Pfad eintragen, sobald die Chat-Seite unter convertlyze.com liegt.
    // WHY doppelt gepflegt: page-projects-embed.html hat dieselbe Konstante,
    // laueft aber als eigenstaendiges, unabhaengiges Script - beide manuell synchron halten.
    NEW_LANDINGPAGE_URL: '/member/landingpage-assistant?new=1',
    // WHY dreifach gepflegt: pageAgentApiBase steht identisch auch in
    // page-projects-embed.html (CONFIG.pageAgentApiBase) und als
    // DEFAULT_CONFIG.apiBaseUrl / window.CVZ_CONTENT_STRATEGY_CONFIG.apiBaseUrl
    // in contentStrategyAgent.app.js - alle drei Stellen bei einem Domain-Wechsel
    // (z.B. Railway -> eigene Domain) manuell synchron halten.
    pageAgentApiBase: 'https://convertlyze-agent-api-production.up.railway.app',
    // TODO: echten Pfad eintragen, sobald die Content-Strategie-Seite unter
    // convertlyze.com liegt (dieselbe Seite, auf der contentStrategyAgent.app.js
    // eingebettet ist - das Script dort liest bereits ?session_id= aus der URL,
    // siehe loadExistingSession() in contentStrategyAgent.app.js).
    CONTENT_STRATEGY_PAGE_URL: '/member/content-strategie',
    PAY_PER_USE_PRICE_ID: 'prc_pay-per-use-14750y0n',
    // Fuer den sessionStorage-Checkout-Flow: User waehlt Plan auf der Preise-Seite
    // vor Login, landet nach Login/Registrierung hier, Checkout wird dann sofort ausgeloest.
    CHECKOUT_PRICE_IDS: {
      starter:    { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
      pro:        { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
      enterprise: { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    },
  };
 
  // -- State ------------------------------------------------------------------
 
  var state = {
    analysesData:    [],
    currentPage:     1,
    totalPages:      1,
    supabaseUserId:  null,
    memberstackId:   null,
    licenseType:     null,
    hasPdfAccess:    false,
    container:       null, // #cvz-a-body - Elternelement der Analyse-Zeilen
    realtimeChannel: null,
    pollingTimer:    null,
    // -- NEU: Tabs (Analysen/Strategien/Aufbau) --------------------------------
    // WHY memberToken separat von memberstackId: memberstackId ist nur der rohe
    // Identifier fuer Supabase-Filter/RLS-Header. Die Node/Railway-API
    // (Content-Strategie + Page-Agent) verifiziert dagegen ein echtes,
    // signiertes JWT (getMemberCookie()) - siehe SICHERHEITS-FIX-Kommentar in
    // page-projects-embed.html. Wird nur geholt, wenn mindestens ein Tab
    // Zugriff auf diese API braucht.
    memberToken:        null,
    hasStrategyAccess:  false,
    hasAufbauAccess:    false,
    activeTab:          'analysen',
    strategySessions:   [],
    strategyLoadFailed: false,
    strategyPage:       1,
    strategyTotalPages: 1,
    strategyLoaded:     false, // eager geladen (siehe loadRecentActivity), Tab selbst laedt nicht nochmal nach
    aufbauProjects:     [],
    aufbauPage:         1,
    aufbauTotalPages:   1,
    aufbauLoaded:       false, // lazy - erst beim ersten Oeffnen des Tabs geladen
  };
 
  // -- Utilities --------------------------------------------------------------
 
  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }
 
  // WHY escapeHtml: User-Daten (URLs, Keywords) nie direkt als innerHTML setzen.
  // XSS-Schutz - alle User-Inhalte werden durch diese Funktion gefiltert.
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
 
  function truncate(str, max) {
    if (!str) return '-';
    return str.length > max ? str.substring(0, max - 3) + '...' : str;
  }
 
  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) { el.classList.remove('cvz-d-skel'); el.textContent = (value != null) ? value : ''; }
  }
 
  function showEl(el, show, displayValue) {
    if (el) el.style.display = show ? (displayValue || '') : 'none';
  }
 
  function getParam(key) {
    return new URLSearchParams(window.location.search).get(key);
  }
 
  // WHY eigene relative Zeitfunktion (kein Datepicker/Library): Der Bedarf ist
  // simpel genug (Minuten/Stunden/Tage), eine kleine Library nur dafuer waere
  // unnoetig Overhead fuer ein Webflow-Embed-Script.
  function formatRelativeTime(dateStr) {
    if (!dateStr) return '-';
    var diffMs = Date.now() - new Date(dateStr).getTime();
    var diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'gerade eben';
    if (diffMin < 60) return 'vor ' + diffMin + ' Min.';
    var diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return 'vor ' + diffH + ' Std.';
    var diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'gestern';
    if (diffD < 7) return 'vor ' + diffD + ' Tagen';
    return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
 
  // -- Cookie helpers -----------------------------------------------------------
 
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }
 
  function deleteCookie(name) {
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax';
  }
 
  // -- Deps -----------------------------------------------------------------
 
  async function waitForDependencies() {
    for (var i = 0; i < 100; i++) {
      if (
        window.supabase && typeof window.supabase.from === 'function' &&
        window.$memberstackDom && typeof window.$memberstackDom.getCurrentMember === 'function'
      ) return true;
      await sleep(100);
    }
    console.warn('[CVZ] Timeout: Supabase oder Memberstack nicht geladen.');
    return false;
  }
 
  // -- Data layer -------------------------------------------------------------
 
  // WHY _billingUser: Bei Team-Members laeuft Billing ueber den Owner.
  // Plan-Felder muessen vom Owner geholt werden, nicht vom Member selbst.
  function checkPdfAccess(user) {
    var bu     = user._billingUser || user;
    var type   = bu.license_type   || '';
    var status = bu.license_status || '';
    if (CONFIG.PAID_PLANS.concat(['Agency']).indexOf(type) === -1) return false;
    if (status === 'active') return true;
    // WHY canceling-Check: Gekuendigte User behalten PDF-Zugang bis license_expires_at.
    if (status === 'canceling' && bu.license_expires_at && new Date(bu.license_expires_at) > new Date()) return true;
    return false;
  }
 
  function canAccessPdf(analysis) {
    var source = (analysis.analysis_source || '').toLowerCase();
    return CONFIG.PDF_ACCESS_SOURCES.indexOf(source) !== -1 || state.hasPdfAccess;
  }
 
  function getInitials(name) {
    if (!name || typeof name !== 'string') return '';
    var parts = name.trim().split(/\s+/);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
 
  async function fetchUser(memberstackId, maxAttempts) {
    maxAttempts = maxAttempts || 1;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      var result = await window.supabase
        .from('users')
        .select('id, email, full_name, license_type, license_status, license_expires_at, credits_limit, credits_used_current_period, credits_remaining, reserved_credits, chat_messages_limit, chat_messages_used_current_period, period_start_date, next_credit_reset_date, plan_price, owner_user_id, team_role, ppu_credits, reserved_ppu_credits, ppu_aufbau_credits, reserved_ppu_aufbau_credits, ppu_strategy_credits, reserved_ppu_strategy_credits, page_agent_sessions_used_current_period, page_agent_sessions_period_start, content_strategy_sessions_used_current_period, content_strategy_sessions_period_start')
        .eq('memberstack_id', memberstackId)
        .single();

      if (result.data) {
        if (result.data.owner_user_id) {
          var ownerResult = await window.supabase
            .from('users')
            // ERGÄNZT (siehe Chat-Verlauf, Content-Strategie-Stat-Karten): fehlte bisher hier,
            // obwohl page_agent_sessions_used_current_period/_period_start (das exakte Aufbau-
            // Pendant) schon immer mitgeholt wurde - ohne diese beiden Felder waeren die neuen
            // Karten 8/9 fuer Team-Members (billing laeuft ueber bu, siehe WHY-Kommentar oben)
            // immer leer geblieben.
            .select('id, credits_limit, credits_used_current_period, credits_remaining, reserved_credits, license_type, license_status, license_expires_at, next_credit_reset_date, period_start_date, plan_price, page_agent_sessions_used_current_period, page_agent_sessions_period_start, content_strategy_sessions_used_current_period, content_strategy_sessions_period_start')
            .eq('id', result.data.owner_user_id)
            .single();
          if (ownerResult.data) result.data._billingUser = ownerResult.data;
        }
        return result.data;
      }
      if (result.error) console.warn('[CVZ] fetchUser attempt ' + attempt + ':', result.error);
      if (attempt < maxAttempts) await sleep(300);
    }
    return null;
  }
 
  // Monatliches Aufbau-Session-Kontingent des Plans laden.
  // Das Limit liegt bewusst NICHT denormalisiert auf users (wie credits_limit),
  // sondern wird live aus plans.page_agent_sessions_limit gelesen.
  // WHY limit(1) statt maybeSingle/single: plans enthaelt aktuell doppelte Zeilen
  // pro Plan-Name (z.B. zwei "Enterprise"-Zeilen) - maybeSingle() wirft dabei einen
  // Fehler ("multiple rows returned") und das Kontingent faellt still auf 0 zurueck.
  // limit(1) nimmt einfach die erste Treffer-Zeile, bricht also nicht.
  // WICHTIG: Das behebt nur das Symptom hier - die Duplikate in plans sollten in
  // Supabase direkt bereinigt werden, sonst kann das an anderer Stelle wieder zuschlagen.
  async function fetchPlanSessionsLimit(planName) {
    if (!planName) return 0;
    var result = await window.supabase
      .from('plans')
      .select('page_agent_sessions_limit')
      .eq('name', planName)
      .limit(1);
    if (result.error) {
      console.warn('[CVZ] fetchPlanSessionsLimit:', result.error);
      return 0;
    }
    var row = result.data && result.data[0];
    return row ? Math.round(Number(row.page_agent_sessions_limit || 0)) : 0;
  }

  // Analog zu fetchPlanSessionsLimit, nur fuer das Content-Strategie-Kontingent
  // (plans.content_strategy_sessions_limit, siehe migrations/content_strategy_plan_limit.sql).
  // Gleicher limit(1)-Workaround wegen doppelter plans-Zeilen pro Plan-Name.
  async function fetchPlanContentStrategyLimit(planName) {
    if (!planName) return 0;
    var result = await window.supabase
      .from('plans')
      .select('content_strategy_sessions_limit')
      .eq('name', planName)
      .limit(1);
    if (result.error) {
      console.warn('[CVZ] fetchPlanContentStrategyLimit:', result.error);
      return 0;
    }
    var row = result.data && result.data[0];
    return row ? Math.round(Number(row.content_strategy_sessions_limit || 0)) : 0;
  }

  async function fetchAnalysesForMember(memberstackId) {
    if (!memberstackId) return [];
    var result = await window.supabase.rpc('get_analyses_for_member', { p_memberstack_id: memberstackId });
    if (result.error) {
      console.error('[CVZ] Analysen laden fehlgeschlagen:', result.error);
      return [];
    }
    return result.data || [];
  }
 
  // Letzte Aufbau-Projekte fuer "Zuletzt aktiv". Laeuft ueber eine SECURITY
  // DEFINER RPC (nicht .from('page_projects').select(...)), weil das Frontend
  // per Memberstack + Anon-Key arbeitet, nicht per echtem Supabase Auth -
  // auth.uid() ist bei jedem Request null, ein direkter Select wuerde daher
  // durch RLS still leer zurueckkommen (200 OK, 0 Zeilen, kein Fehler). Siehe
  // recent-activity-rpcs.sql fuer die Funktionsdefinition.
  async function fetchRecentPageProjects(userId, limit) {
    if (!userId) return [];
    var result = await window.supabase.rpc('get_recent_page_projects', {
      p_user_id: userId,
      p_limit:   limit,
    });
    if (result.error) {
      console.warn('[CVZ] fetchRecentPageProjects:', result.error);
      return [];
    }
    return result.data || [];
  }
 
  // Letzte KI-Agent-Sessions fuer "Zuletzt aktiv" - gleiches RLS-Problem wie
  // bei fetchRecentPageProjects, gleiche Loesung ueber eine RPC. Die RPC
  // joint analyses direkt in SQL und liefert landing_page_url/keyword als
  // flache Felder zurueck (kein PostgREST-Embed hier, weil RPC-Rueckgaben
  // keine Foreign-Table-Embeds unterstuetzen). Nur Sessions mit
  // total_messages > 0, damit gestartete-aber-nie-genutzte Sessions die
  // Liste nicht mit leeren Eintraegen fuellen (Filter sitzt in der RPC).
  async function fetchRecentAgentSessions(userId, limit) {
    if (!userId) return [];
    var result = await window.supabase.rpc('get_recent_agent_sessions', {
      p_user_id: userId,
      p_limit:   limit,
    });
    if (result.error) {
      console.warn('[CVZ] fetchRecentAgentSessions:', result.error);
      return [];
    }
    return result.data || [];
  }

  // -- Content-Strategie-Sessions & Aufbau-Projekte (Node/Railway-API) ---------
  // Beide Calls laufen NICHT ueber Supabase, sondern direkt gegen die
  // convertlyze-agent-api (dieselbe API wie contentStrategyAgent.app.js und
  // das bisherige page-projects-embed.html) - Auth per echtem Memberstack-JWT
  // (state.memberToken), nicht per Supabase-Anon-Key.

  // Volle Liste (bis zu 200, server-seitig gedeckelt), team-weit sichtbar
  // (Backend nutzt getTeamUserIds - siehe GET /api/content-strategy/sessions).
  // Wird sowohl fuer den Strategien-Tab als auch fuer "Zuletzt aktiv"
  // wiederverwendet (ein Fetch, kein Extra-Roundtrip fuer die Vorschau).
  async function fetchContentStrategySessions(memberToken) {
    try {
      var res = await fetch(CONFIG.pageAgentApiBase + '/api/content-strategy/sessions', {
        method:  'GET',
        headers: { 'Authorization': 'Bearer ' + memberToken },
      });
      if (!res.ok) { console.warn('[CVZ] fetchContentStrategySessions:', res.status); return null; }
      var data = await res.json();
      return data.sessions || [];
    } catch (e) {
      console.error('[CVZ] fetchContentStrategySessions Fehler:', e);
      return null;
    }
  }

  // 1:1 aus page-projects-embed.html uebernommen (dort SICHERHEITS-FIX:
  // echtes JWT statt roher Member-ID). NUR fuer den eingeloggten User selbst
  // (user_id-Query-Param), analog zur bisherigen Einschraenkung dort - die
  // Node-API kennt aktuell keine Team-weite Sicht auf Aufbau-Projekte.
  async function fetchPageProjects(memberToken, userId) {
    try {
      var res = await fetch(
        CONFIG.pageAgentApiBase + '/api/page-agent/projects?user_id=' + encodeURIComponent(userId),
        { method: 'GET', headers: { 'Authorization': 'Bearer ' + memberToken } }
      );
      if (!res.ok) { console.warn('[CVZ] fetchPageProjects:', res.status); return null; }
      var data = await res.json();
      return data.projects || [];
    } catch (e) {
      console.error('[CVZ] fetchPageProjects Fehler:', e);
      return null;
    }
  }

  async function triggerCreditResetIfPaid(user) {
    try {
      var bu = user._billingUser || user;
      if (CONFIG.PAID_PLANS.indexOf(bu.license_type) === -1) return false;
      var result = await window.supabase.rpc('reset_user_credits_if_due', { p_user_id: bu.id });
      if (result.error) { console.warn('[CVZ] reset_user_credits_if_due:', result.error); return false; }
      var row = Array.isArray(result.data) ? result.data[0] : result.data;
      return !!(row && row.did_reset);
    } catch (e) {
      console.warn('[CVZ] reset_user_credits_if_due exception:', e);
      return false;
    }
  }
 
  // -- Purchase Success Modal -------------------------------------------------
 
  function showPurchaseSuccessModal(licenseType) {
    var planName = licenseType || 'deinen neuen Plan';
 
    var overlay = document.createElement('div');
    overlay.id = 'cvz-purchase-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
 
    var box = document.createElement('div');
    box.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px;max-width:480px;width:90%;text-align:center;font-family:Geist,sans-serif;position:relative';
 
    var xBtn = document.createElement('button');
    xBtn.textContent = '✕';
    xBtn.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:#8b98a5;font-size:16px;cursor:pointer;line-height:1;padding:0';
    xBtn.onclick = function () { overlay.remove(); };
 
    var emoji = document.createElement('div');
    emoji.textContent = '🎉';
    emoji.style.cssText = 'font-size:48px;margin-bottom:16px';
 
    var h = document.createElement('h2');
    h.textContent = 'Willkommen an Bord!';
    h.style.cssText = 'margin:0 0 12px;font-size:22px;color:#4fd1c5;font-weight:700';
 
    var p1 = document.createElement('p');
    p1.style.cssText = 'margin:0 0 8px;color:#8b98a5;font-size:15px';
    var strong = document.createElement('strong');
    strong.textContent = planName + '-Plan';
    strong.style.color = '#e6edf3';
    p1.appendChild(document.createTextNode('Du hast erfolgreich den '));
    p1.appendChild(strong);
    p1.appendChild(document.createTextNode(' gebucht.'));
 
    var p2 = document.createElement('p');
    p2.textContent = 'Dein Konto ist jetzt aktiv – analysiere deine erste Landingpage.';
    p2.style.cssText = 'margin:0 0 28px;color:#8b98a5;font-size:14px';
 
    var ctaBtn = document.createElement('button');
    ctaBtn.textContent = 'Erste Analyse starten';
    ctaBtn.style.cssText = 'background:#4fd1c5;color:#0d1117;border:none;border-radius:8px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer;width:100%';
    ctaBtn.onclick = function () {
      overlay.remove();
      window.location.href = CONFIG.NEW_ANALYSIS_URL;
    };
 
    box.append(xBtn, emoji, h, p1, p2, ctaBtn);
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }
 
  // -- UI: Style injection ------------------------------------------------------
 
  var STYLE_ID = 'cvz-dash-style';
 
  function injectDashboardStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '@keyframes cvz-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}' +
      '@keyframes cvz-spin{0%{transform-origin:50% 50%;transform:rotate(0deg)}100%{transform-origin:50% 50%;transform:rotate(360deg)}}' +
      '@keyframes cvz-pulse{0%,100%{opacity:1}50%{opacity:0.55}}' +
      '#cvz-dashboard-app{' +
        '--cvz-bg:#0d1117;--cvz-card:#161b22;--cvz-border:#30363d;--cvz-row-border:#21262d;' +
        '--cvz-teal:#4fd1c5;--cvz-teal-dim:rgba(79,209,197,0.12);--cvz-muted:#8b98a5;--cvz-text:#e6edf3;' +
        'font-family:Geist,ui-sans-serif,-apple-system,BlinkMacSystemFont,sans-serif;width:100%;box-sizing:border-box;' +
      '}' +
      '#cvz-dashboard-app *{box-sizing:border-box;}' +
      '.cvz-d-skel{border-radius:6px;color:transparent!important;background:linear-gradient(90deg,#1a2133 25%,#252d3d 50%,#1a2133 75%);' +
        'background-size:400px 100%;animation:cvz-shimmer 1.4s infinite;display:inline-block;min-width:70px;}' +
      '.cvz-d-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-bottom:28px;}' +
      '.cvz-d-card{background:var(--cvz-card);border:1px solid var(--cvz-border);border-radius:14px;padding:28px 24px;' +
        'display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;}' +
      '.cvz-d-icon{width:44px;height:44px;border-radius:12px;background:var(--cvz-teal-dim);display:flex;align-items:center;justify-content:center;margin-bottom:4px;}' +
      '.cvz-d-label{font-size:13px;color:var(--cvz-muted);font-weight:500;}' +
      '.cvz-d-value{font-size:26px;font-weight:700;color:var(--cvz-text);line-height:1.2;}' +
      '.cvz-d-sub{font-size:13px;color:var(--cvz-muted);}' +
      '.cvz-d-bar-track{width:100%;height:6px;border-radius:999px;background:var(--cvz-border);margin-top:6px;overflow:hidden;}' +
      '.cvz-d-bar-fill{height:100%;background:var(--cvz-teal);border-radius:999px;width:0%;transition:width .3s ease;}' +
      '.cvz-d-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin-bottom:36px;}' +
      '.cvz-d-btn{font-family:inherit;font-size:15px;font-weight:600;padding:14px 28px;border-radius:999px;cursor:pointer;' +
        'text-decoration:none;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;}' +
      '.cvz-d-btn-primary{background:var(--cvz-teal);color:var(--cvz-bg);}' +
      '.cvz-d-btn-outline{background:transparent;color:var(--cvz-teal);border-color:var(--cvz-teal);' +
        'text-transform:uppercase;letter-spacing:.03em;font-size:13px;}' +
      '.cvz-d-title{font-size:22px;font-weight:700;color:var(--cvz-text);margin:0 0 16px;}' +
      '.cvz-a-card{background:var(--cvz-card);border:1px solid var(--cvz-border);border-radius:14px;overflow:hidden;}' +
      '.cvz-a-header{display:grid;grid-template-columns:minmax(160px,1.6fr) minmax(110px,1fr) 120px 90px 56px 56px 56px 70px;' +
        'gap:8px;padding:14px 20px;background:#10141b;text-transform:uppercase;letter-spacing:.06em;font-size:11px;' +
        'font-weight:600;color:var(--cvz-muted);}' +
      '.cvz-a-body-empty{padding:60px 20px;text-align:center;color:var(--cvz-muted);}' +
      '.cvz-a-body-error{padding:60px 20px;text-align:center;color:#f87171;}' +
      '.cvz-a-body-error .cvz-a-error-sub{font-size:14px;color:var(--cvz-muted);margin-top:8px;}' +
      '.cvz-a-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;}' +
      '.cvz-a-loading p{margin-top:20px;color:var(--cvz-muted);font-size:14px;}' +
      '.cvz-a-row{display:grid;grid-template-columns:minmax(160px,1.6fr) minmax(110px,1fr) 120px 90px 56px 56px 56px 70px;' +
        'gap:8px;padding:16px 20px;align-items:center;border-top:1px solid var(--cvz-row-border);}' +
      '.cvz-a-row:hover{background:rgba(255,255,255,0.02);}' +
      '.cvz-a-url{color:var(--cvz-teal);font-size:14px;word-break:break-word;}' +
      '.cvz-a-keyword{color:#c9d1d9;font-size:14px;word-break:break-word;}' +
      '.cvz-a-date{color:var(--cvz-muted);font-size:14px;}' +
      '.cvz-a-badge{display:inline-flex;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;}' +
      '.cvz-a-actions{display:contents;}' +
      '.cvz-a-icon-btn{width:36px;height:36px;border-radius:999px;background:#21262d;border:none;display:flex;' +
        'align-items:center;justify-content:center;cursor:pointer;color:#e8edf5;text-decoration:none;}' +
      '.cvz-a-icon-btn.cvz-a-disabled{opacity:.35;cursor:not-allowed;}' +
      '.cvz-a-icon-btn.cvz-a-loading-btn svg{animation:cvz-spin 1s linear infinite;}' +
      '.cvz-a-score-cell{display:flex;align-items:center;justify-content:center;}' +
      '.cvz-a-pagination{display:none;align-items:center;justify-content:center;gap:12px;margin-top:20px;}' +
      '.cvz-a-pagebtn{background:var(--cvz-card);border:1px solid var(--cvz-border);color:var(--cvz-muted);' +
        'font-family:inherit;font-size:.85rem;font-weight:600;padding:8px 18px;border-radius:999px;cursor:pointer;}' +
      '.cvz-a-pagebtn:disabled{opacity:.4;cursor:not-allowed;}' +
      '.cvz-a-pagebtn.cvz-a-pagebtn-accent:not(:disabled){color:var(--cvz-teal);border-color:var(--cvz-teal);}' +
      '.cvz-a-pageinfo{background:var(--cvz-card);border:1px solid var(--cvz-border);color:var(--cvz-text);' +
        'font-size:.85rem;font-weight:600;padding:8px 18px;border-radius:999px;}' +
      '.cvz-click-hint{' +
        'position:fixed;z-index:10000;max-width:220px;' +
        'background:var(--cvz-card);border:1px solid var(--cvz-border);color:var(--cvz-text);' +
        'font-family:Geist,sans-serif;font-size:12px;line-height:1.4;' +
        'padding:8px 12px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.4);' +
        'pointer-events:none;opacity:0;transform:translateY(4px);' +
        'transition:opacity .15s ease,transform .15s ease;' +
      '}' +
      '.cvz-click-hint.cvz-click-hint-visible{opacity:1;transform:translateY(0);}' +
      // -- NEU: "Zuletzt aktiv" -------------------------------------------------
      '.cvz-ract-list{display:flex;flex-direction:column;gap:8px;margin-bottom:32px;}' +
      '.cvz-ract-item{display:flex;align-items:center;gap:14px;background:var(--cvz-card);' +
        'border:1px solid var(--cvz-border);border-radius:12px;padding:12px 16px;' +
        'text-decoration:none;transition:border-color .15s ease,background .15s ease;}' +
      '.cvz-ract-item:hover{border-color:var(--cvz-teal);background:rgba(79,209,197,0.04);}' +
      '.cvz-ract-icon{width:36px;height:36px;border-radius:10px;background:var(--cvz-teal-dim);' +
        'display:flex;align-items:center;justify-content:center;flex-shrink:0;}' +
      '.cvz-ract-main{flex:1;min-width:0;}' +
      '.cvz-ract-type{font-size:12px;font-weight:600;color:var(--cvz-teal);text-transform:uppercase;letter-spacing:.03em;}' +
      '.cvz-ract-context{font-size:14px;color:var(--cvz-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.cvz-ract-time{font-size:13px;color:var(--cvz-muted);flex-shrink:0;white-space:nowrap;}' +
      '.cvz-ract-item.cvz-ract-skel{height:56px;background:linear-gradient(90deg,#1a2133 25%,#252d3d 50%,#1a2133 75%);' +
        'background-size:400px 100%;animation:cvz-shimmer 1.4s infinite;pointer-events:none;}' +
      // -- NEU: Tab-Leiste (Analysen/Strategien/Aufbau) -------------------------
      '.cvz-tabs{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px;border-bottom:1px solid var(--cvz-border);padding-bottom:0;}' +
      '.cvz-tab-btn{font-family:inherit;background:transparent;border:none;border-bottom:2px solid transparent;' +
        'color:var(--cvz-muted);font-size:14px;font-weight:600;padding:10px 4px 12px;margin-bottom:-1px;cursor:pointer;' +
        'display:inline-flex;align-items:center;transition:color .15s ease,border-color .15s ease;}' +
      '.cvz-tab-btn:hover{color:var(--cvz-text);}' +
      '.cvz-tab-btn.cvz-tab-active{color:var(--cvz-teal);border-bottom-color:var(--cvz-teal);}' +
      '.cvz-tab-panel{width:100%;}' +
      // -- NEU: Content-Strategien-/Aufbau-Tab (aus page-projects-embed.html
      // uebernommen, cvz-p-Praefix beibehalten fuer identisches Aussehen) ------
      '.cvz-p-card{background:var(--cvz-card);border:1px solid var(--cvz-border);border-radius:14px;padding:16px;}' +
      '.cvz-p-row{display:flex;justify-content:space-between;align-items:center;cursor:pointer;' +
        'background:var(--cvz-bg);border:1px solid var(--cvz-row-border);border-radius:12px;' +
        'padding:18px 20px;margin-bottom:10px;transition:border-color .15s ease;}' +
      '.cvz-p-row:last-child{margin-bottom:0;}' +
      '.cvz-p-row:hover{border-color:var(--cvz-teal);}' +
      // NEU: nicht-klickbare Zeilen (Content-Strategie noch in Bearbeitung oder fehlgeschlagen,
      // siehe renderStrategyPage) - gleiches Karten-Layout, aber ohne Pointer-Cursor/Hover-Effekt,
      // damit nicht suggeriert wird, dass ein Klick etwas oeffnet.
      '.cvz-p-row-disabled{cursor:default;}' +
      '.cvz-p-row-disabled:hover{border-color:var(--cvz-row-border);}' +
      '.cvz-p-name{font-weight:600;font-size:15px;color:var(--cvz-text);margin-bottom:4px;}' +
      '.cvz-p-meta{font-size:13px;color:var(--cvz-muted);}' +
      '.cvz-p-badge{font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;' +
        'text-transform:uppercase;letter-spacing:.03em;background:var(--cvz-teal-dim);color:var(--cvz-teal);white-space:nowrap;}' +
      '.cvz-p-new-btn{display:inline-block;margin-top:6px;background:var(--cvz-teal);color:var(--cvz-bg);' +
        'font-weight:600;padding:12px 24px;border-radius:10px;text-decoration:none;}' +
      '.cvz-p-empty{text-align:center;padding:60px 20px;color:var(--cvz-muted);}' +
      '.cvz-p-error{text-align:center;padding:60px 20px;color:#f87171;}' +
      '.cvz-p-error .cvz-p-error-sub{font-size:14px;color:var(--cvz-muted);margin-top:8px;}' +
      '.cvz-p-pagination{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:20px;}' +
      '.cvz-p-pagebtn{background:var(--cvz-card);border:1px solid var(--cvz-border);color:var(--cvz-muted);' +
        'font-family:inherit;font-size:.85rem;font-weight:600;padding:8px 18px;border-radius:999px;cursor:pointer;}' +
      '.cvz-p-pagebtn:disabled{opacity:.4;cursor:not-allowed;}' +
      '.cvz-p-pagebtn.cvz-p-pagebtn-accent:not(:disabled){color:var(--cvz-teal);border-color:var(--cvz-teal);}' +
      '.cvz-p-pageinfo{background:var(--cvz-card);border:1px solid var(--cvz-border);color:var(--cvz-text);' +
        'font-size:.85rem;font-weight:600;padding:8px 18px;border-radius:999px;}' +
      '.cvz-p-skeleton-row{display:flex;justify-content:space-between;align-items:center;' +
        'background:var(--cvz-bg);border:1px solid var(--cvz-row-border);border-radius:12px;padding:18px 20px;margin-bottom:10px;}' +
      '.cvz-p-skeleton-block{border-radius:6px;background:linear-gradient(90deg,#1a2133 25%,#252d3d 50%,#1a2133 75%);' +
        'background-size:400px 100%;animation:cvz-shimmer 1.4s infinite;}' +
      '@media (max-width:768px){' +
        '.cvz-a-header{display:none;}' +
        '.cvz-a-row{grid-template-columns:1fr 1fr;row-gap:10px;padding:18px 16px;}' +
        '.cvz-a-url,.cvz-a-keyword{grid-column:1/-1;}' +
        '.cvz-a-date{text-align:right;}' +
        '.cvz-a-score-cell{grid-column:1/-1;margin-top:4px;}' +
        '.cvz-a-actions{display:flex!important;grid-column:1/-1;justify-content:center;gap:20px;margin-top:8px;}' +
        '.cvz-ract-time{display:none;}' +
        '.cvz-p-row{flex-direction:column;align-items:flex-start;gap:8px;}' +
      '}';
    document.head.appendChild(s);
  }
 
  // -- UI: Shell (Stat-Karten + Buttons + Analysen-Card) -------------------------
 
  var ICONS = {
    download:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v13m0 0l-4-4m4 4l4-4" stroke="#e8edf5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="#e8edf5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    eye:       '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C6.5 4.5 2.15 8 0.75 12c1.4 4 5.75 7.5 11.25 7.5s9.85-3.5 11.25-7.5C21.85 8 17.5 4.5 12 4.5z" fill="#e8edf5"/><circle cx="12" cy="12" r="3.2" fill="#252d3d"/></svg>',
    agent:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="8" width="12" height="10" rx="2" fill="#e8edf5"/><circle cx="9" cy="12" r="1.5" fill="#252d3d"/><circle cx="15" cy="12" r="1.5" fill="#252d3d"/><rect x="10" y="15" width="4" height="1.5" rx="0.75" fill="#252d3d"/><rect x="11" y="4" width="2" height="4" rx="1" fill="#e8edf5"/><circle cx="12" cy="5" r="2" fill="#e8edf5"/></svg>',
    barChart:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="12" width="4" height="8" rx="1" fill="#4fd1c5"/><rect x="10" y="7" width="4" height="13" rx="1" fill="#4fd1c5"/><rect x="16" y="3" width="4" height="17" rx="1" fill="#4fd1c5"/></svg>',
    check:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#4fd1c5" stroke-width="2"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke="#4fd1c5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plan:      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" stroke="#4fd1c5" stroke-width="2" stroke-linejoin="round"/><path d="M4 12.5L12 17l8-4.5" stroke="#4fd1c5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 16.5L12 21l8-4.5" stroke="#4fd1c5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cart:      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="20" r="1.4" fill="#4fd1c5"/><circle cx="18" cy="20" r="1.4" fill="#4fd1c5"/><path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h8.4a2 2 0 002-1.6L21 8H6.2" stroke="#4fd1c5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    aufbau:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" stroke="#4fd1c5" stroke-width="2"/><path d="M3.5 9.5h17" stroke="#4fd1c5" stroke-width="2"/><path d="M8 9.5V20" stroke="#4fd1c5" stroke-width="2"/></svg>',
    strategy:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 19V9.5l8-5 8 5V19" stroke="#4fd1c5" stroke-width="2" stroke-linejoin="round"/><path d="M9 19v-6h6v6" stroke="#4fd1c5" stroke-width="2" stroke-linejoin="round"/><path d="M4 12h16" stroke="#4fd1c5" stroke-width="2"/></svg>',
  };
 
  function statCardHtml(opts) {
    // opts: { wrapperId, iconKey, label, valueId, subId, withBar, barFillId, hidden }
    return (
      '<div id="' + opts.wrapperId + '" class="cvz-d-card"' + (opts.hidden ? ' style="display:none"' : '') + '>' +
        '<div class="cvz-d-icon">' + ICONS[opts.iconKey] + '</div>' +
        '<div class="cvz-d-label">' + escapeHtml(opts.label) + '</div>' +
        '<div class="cvz-d-value"><span id="' + opts.valueId + '" class="cvz-d-skel">--</span></div>' +
        '<div class="cvz-d-sub"><span id="' + opts.subId + '" class="cvz-d-skel">--</span></div>' +
        (opts.withBar
          ? '<div class="cvz-d-bar-track"><div id="' + opts.barFillId + '" class="cvz-d-bar-fill"></div></div>'
          : '') +
      '</div>'
    );
  }
 
  function buildDashboardShell(root) {
    injectDashboardStyle();
 
    root.innerHTML =
      // GEÄNDERT (siehe Chat-Verlauf, Lasse: "der Bereich [Kontingent-Karten + Buttons] sollte
      // über 'Zuletzt aktiv' angesiedelt werden, statt darunter"): Kontingent-Übersicht (jetzt
      // mit eigener Headline "Übersicht") + Aktions-Buttons stehen jetzt VOR "Zuletzt aktiv",
      // nicht mehr danach - "Zuletzt aktiv" (cvz-ract-wrap) ist entsprechend weiter unten in
      // dieser Kette verschoben, keine eigene Logik-Änderung an der Activity-Section selbst.
      '<h2 class="cvz-d-title">Übersicht</h2>' +
      '<div class="cvz-d-stats">' +
        statCardHtml({ wrapperId: 'cvz-d-c1', iconKey: 'barChart', label: 'Analysen diesen Monat',        valueId: 'cvz-d-c1-value', subId: 'cvz-d-c1-sub', withBar: true, barFillId: 'cvz-d-c1-bar' }) +
        statCardHtml({ wrapperId: 'cvz-d-c2', iconKey: 'check',    label: 'Verbleibende Analysen',         valueId: 'cvz-d-c2-value', subId: 'cvz-d-c2-sub', withBar: false }) +
        statCardHtml({ wrapperId: 'cvz-d-c3', iconKey: 'plan',     label: 'Aktiver Plan',                   valueId: 'cvz-d-c3-value', subId: 'cvz-d-c3-sub', withBar: false }) +
        statCardHtml({ wrapperId: 'cvz-d-c4', iconKey: 'aufbau',   label: 'Aufbau-Sessions diesen Monat',   valueId: 'cvz-d-c4-value', subId: 'cvz-d-c4-sub', withBar: true, barFillId: 'cvz-d-c4-bar', hidden: true }) +
        statCardHtml({ wrapperId: 'cvz-d-c5', iconKey: 'check',    label: 'Verbleibende Aufbau-Sessions',  valueId: 'cvz-d-c5-value', subId: 'cvz-d-c5-sub', withBar: false, hidden: true }) +
        statCardHtml({ wrapperId: 'cvz-d-c6', iconKey: 'cart',     label: 'Pay-per-Use Analysen',          valueId: 'cvz-d-c6-value', subId: 'cvz-d-c6-sub', withBar: false, hidden: true }) +
        statCardHtml({ wrapperId: 'cvz-d-c7', iconKey: 'cart',     label: 'Pay-per-Use Aufbau-Sessions',   valueId: 'cvz-d-c7-value', subId: 'cvz-d-c7-sub', withBar: false, hidden: true }) +
        // NEU (siehe Chat-Verlauf, Lasse: "Bei den Informationen sollten wir auch Strategie mit
        // reinnehmen") - exakt dasselbe Drei-Karten-Muster wie Aufbau (4/5/7): Verbrauch diesen
        // Monat mit Balken, Verbleibend, Pay-per-Use. Alle drei starten hidden, showEl() in
        // renderStatCards() blendet sie nur ein, wenn der Plan ueberhaupt ein Content-Strategie-
        // Kontingent oder PPU-Guthaben hat (gleiche Logik wie showAufbauCards/Karte 6-7).
        statCardHtml({ wrapperId: 'cvz-d-c8', iconKey: 'strategy', label: 'Content-Strategien diesen Monat', valueId: 'cvz-d-c8-value', subId: 'cvz-d-c8-sub', withBar: true, barFillId: 'cvz-d-c8-bar', hidden: true }) +
        statCardHtml({ wrapperId: 'cvz-d-c9', iconKey: 'check',    label: 'Verbleibende Content-Strategien', valueId: 'cvz-d-c9-value', subId: 'cvz-d-c9-sub', withBar: false, hidden: true }) +
        statCardHtml({ wrapperId: 'cvz-d-c10', iconKey: 'cart',    label: 'Pay-per-Use Content-Strategien', valueId: 'cvz-d-c10-value', subId: 'cvz-d-c10-sub', withBar: false, hidden: true }) +
      '</div>' +
      '<div class="cvz-d-actions">' +
        '<a id="cvz-d-btn-new-analysis" class="cvz-d-btn cvz-d-btn-primary" href="' + CONFIG.NEW_ANALYSIS_URL + '">NEUE ANALYSE</a>' +
        '<a id="cvz-d-btn-new-page" class="cvz-d-btn cvz-d-btn-primary" href="' + CONFIG.NEW_LANDINGPAGE_URL + '">LANDINGPAGE AUFBAUEN</a>' +
        // GEÄNDERT (siehe Chat-Verlauf, Lasse: "Plan ändern kann raus, dafür Content-Strategie
        // erstellen rein") - "Plan ändern" (Link auf /preise) ist damit nicht mehr direkt aus
        // dem Dashboard erreichbar. Gleiche Sichtbarkeits-Logik wie die anderen beiden CTA-
        // Buttons: immer sichtbar, unabhaengig von hasStrategyAccess - Zugriffs-/Kontingent-
        // Pruefung passiert auf der Zielseite selbst (siehe fehlendes Kontingent -> 402 in
        // routes/contentStrategyAgent.ts), nicht durch Verstecken des Einstiegspunkts.
        '<a id="cvz-d-btn-new-strategy" class="cvz-d-btn cvz-d-btn-primary" href="' + CONFIG.CONTENT_STRATEGY_PAGE_URL + '">CONTENT-STRATEGIE ERSTELLEN</a>' +
      '</div>' +
      // "Zuletzt aktiv" startet unsichtbar (display:none) - wird von loadRecentActivity()
      // eingeblendet, sobald geladen wird / Daten da sind. So flackert beim ersten Rendern keine
      // leere Section auf. Jetzt NACH Kontingent-Karten+Buttons statt davor (siehe Kommentar bei
      // "Übersicht"-Headline oben).
      '<div id="cvz-ract-wrap" style="display:none"></div>' +
      // -- NEU: Tab-Leiste -----------------------------------------------------
      // Startet unsichtbar - applyTabVisibility() (in initDashboard, sobald die
      // Zugriffsrechte bekannt sind) blendet nur die Buttons ein, auf die der
      // User laut Plan/PPU-Guthaben Zugriff hat, und die Leiste selbst nur,
      // wenn dadurch ueberhaupt mehr als ein Tab uebrig bleibt.
      '<div class="cvz-tabs" id="cvz-tabs" style="display:none">' +
        '<button type="button" class="cvz-tab-btn cvz-tab-active" id="cvz-tab-btn-analysen" data-tab="analysen">Analysen</button>' +
        '<button type="button" class="cvz-tab-btn" id="cvz-tab-btn-strategien" data-tab="strategien" style="display:none">Content-Strategien</button>' +
        '<button type="button" class="cvz-tab-btn" id="cvz-tab-btn-aufbau" data-tab="aufbau" style="display:none">Aufbau-Sessions</button>' +
      '</div>' +

      '<div id="cvz-tab-panel-analysen" class="cvz-tab-panel">' +
        '<h2 class="cvz-d-title" id="cvz-analysen-title">Meine Analysen</h2>' +
        '<div class="cvz-a-card">' +
          '<div class="cvz-a-header">' +
            '<div>URL</div><div>KEYWORD</div><div>STATUS</div><div>DATUM</div>' +
            '<div style="text-align:center">ANSICHT</div><div style="text-align:center">KI-AGENT</div>' +
            '<div style="text-align:center">REPORT</div><div style="text-align:center">SCORE</div>' +
          '</div>' +
          '<div id="cvz-a-body"></div>' +
        '</div>' +
        '<div id="cvz-a-pagination" class="cvz-a-pagination">' +
          '<button id="cvz-a-prev" class="cvz-a-pagebtn" type="button">Zurück</button>' +
          '<span id="cvz-a-pageinfo" class="cvz-a-pageinfo"></span>' +
          '<button id="cvz-a-next" class="cvz-a-pagebtn cvz-a-pagebtn-accent" type="button">Nächste Seite</button>' +
        '</div>' +
      '</div>' +

      // Content-Strategien-Panel - startet versteckt, wird erst per
      // applyTabVisibility() gezeigt (nur bei hasStrategyAccess).
      '<div id="cvz-tab-panel-strategien" class="cvz-tab-panel" style="display:none">' +
        '<h2 class="cvz-d-title" id="cvz-strategien-title">Meine Content-Strategien</h2>' +
        '<div class="cvz-p-card">' +
          '<div id="cvz-s-body"></div>' +
        '</div>' +
        '<div id="cvz-s-pagination" class="cvz-p-pagination" style="display:none">' +
          '<button id="cvz-s-prev" class="cvz-p-pagebtn" type="button">Zurück</button>' +
          '<span id="cvz-s-pageinfo" class="cvz-p-pageinfo"></span>' +
          '<button id="cvz-s-next" class="cvz-p-pagebtn cvz-p-pagebtn-accent" type="button">Nächste Seite</button>' +
        '</div>' +
      '</div>' +

      // Aufbau-Sessions-Panel - ersetzt das bisherige eigenstaendige
      // page-projects-embed.html (siehe Auslieferungshinweise: dieses Embed
      // kann in Webflow entfernt werden, sobald dieser Tab live ist).
      '<div id="cvz-tab-panel-aufbau" class="cvz-tab-panel" style="display:none">' +
        '<h2 class="cvz-d-title" id="cvz-aufbau-title">Meine Aufbau-Sessions</h2>' +
        '<div class="cvz-p-card">' +
          '<div id="cvz-p-body"></div>' +
        '</div>' +
        '<div id="cvz-p-pagination" class="cvz-p-pagination" style="display:none">' +
          '<button id="cvz-p-prev" class="cvz-p-pagebtn" type="button">Zurück</button>' +
          '<span id="cvz-p-pageinfo" class="cvz-p-pageinfo"></span>' +
          '<button id="cvz-p-next" class="cvz-p-pagebtn cvz-p-pagebtn-accent" type="button">Nächste Seite</button>' +
        '</div>' +
      '</div>';

    state.container = document.getElementById('cvz-a-body');

    document.getElementById('cvz-a-prev').addEventListener('click', function () {
      if (state.currentPage > 1) renderAnalysesPage(state.currentPage - 1);
    });
    document.getElementById('cvz-a-next').addEventListener('click', function () {
      if (state.currentPage < state.totalPages) renderAnalysesPage(state.currentPage + 1);
    });

    document.getElementById('cvz-s-prev').addEventListener('click', function () {
      if (state.strategyPage > 1) renderStrategyPage(state.strategyPage - 1);
    });
    document.getElementById('cvz-s-next').addEventListener('click', function () {
      if (state.strategyPage < state.strategyTotalPages) renderStrategyPage(state.strategyPage + 1);
    });

    document.getElementById('cvz-p-prev').addEventListener('click', function () {
      if (state.aufbauPage > 1) renderAufbauPage(state.aufbauPage - 1);
    });
    document.getElementById('cvz-p-next').addEventListener('click', function () {
      if (state.aufbauPage < state.aufbauTotalPages) renderAufbauPage(state.aufbauPage + 1);
    });

    Array.prototype.forEach.call(document.querySelectorAll('.cvz-tab-btn'), function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.getAttribute('data-tab')); });
    });

    showAnalysesLoading();
  }

  // -- UI: Tab-Umschaltung ------------------------------------------------------

  function switchTab(tabName) {
    if (state.activeTab === tabName) return;
    state.activeTab = tabName;

    Array.prototype.forEach.call(document.querySelectorAll('.cvz-tab-btn'), function (btn) {
      var isActive = btn.getAttribute('data-tab') === tabName;
      btn.classList.toggle('cvz-tab-active', isActive);
    });
    ['analysen', 'strategien', 'aufbau'].forEach(function (name) {
      var panel = document.getElementById('cvz-tab-panel-' + name);
      if (panel) panel.style.display = (name === tabName) ? '' : 'none';
    });

    // Aufbau-Tab laedt lazy (erst beim ersten Oeffnen) - siehe WHY-Kommentar
    // bei fetchPageProjects/state.aufbauLoaded weiter oben. Strategien-Tab
    // braucht das nicht: state.strategySessions ist schon eager geladen
    // (loadRecentActivity/initDashboard), renderStrategyPage() paginiert nur
    // ueber den bereits vorhandenen Array.
    if (tabName === 'aufbau' && !state.aufbauLoaded) loadAndRenderAufbauProjects();
  }

  // Blendet nur die Tabs/Panels ein, auf die der User Zugriff hat, und zeigt
  // die Tab-Leiste selbst nur, wenn dadurch ueberhaupt mehr als ein Tab
  // uebrig bleibt (Ein-Tab-Fall = exakt das bisherige Aussehen ohne Tabs).
  function applyTabVisibility() {
    var tabsBar = document.getElementById('cvz-tabs');
    var btnStrategien = document.getElementById('cvz-tab-btn-strategien');
    var btnAufbau     = document.getElementById('cvz-tab-btn-aufbau');
    showEl(btnStrategien, state.hasStrategyAccess, 'inline-flex');
    showEl(btnAufbau,     state.hasAufbauAccess,   'inline-flex');

    var visibleCount = 1 + (state.hasStrategyAccess ? 1 : 0) + (state.hasAufbauAccess ? 1 : 0);
    var showTabs = visibleCount > 1;
    showEl(tabsBar, showTabs, 'flex');

    // Panel-eigene Ueberschrift nur zeigen, wenn KEINE Tab-Leiste da ist -
    // sonst sagt der aktive Tab-Button bereits "Analysen"/"Content-
    // Strategien"/"Aufbau-Sessions", eine zusaetzliche H2 waere redundant.
    showEl(document.getElementById('cvz-analysen-title'),   !showTabs, 'block');
    showEl(document.getElementById('cvz-strategien-title'), !showTabs, 'block');
    showEl(document.getElementById('cvz-aufbau-title'),     !showTabs, 'block');

    if (!state.hasStrategyAccess && state.activeTab === 'strategien') switchTab('analysen');
    if (!state.hasAufbauAccess && state.activeTab === 'aufbau') switchTab('analysen');
  }
 
  // -- UI: Stat-Karten befuellen -------------------------------------------------
 
  function renderStatCards(user, sessionsLimit, contentStrategyLimit) {
    var bu           = user._billingUser || user;
    var reserved     = Math.max(0, Math.round(Number(bu.reserved_credits || 0)));
    var used         = Math.round(Number(bu.credits_used_current_period || 0));
    var limit        = Math.round(Number(bu.credits_limit || 0));
    var ppuCredits   = Math.round(Number(user.ppu_credits || 0));
    var ppuReserved  = Math.round(Number(user.reserved_ppu_credits || 0));
    var ppuAvailable = Math.max(ppuCredits - ppuReserved, 0);
    // Aufbau-PPU liegt wie ppu_credits auf der eigenen users-Zeile des Members
    // (nicht auf bu/billingUser) - siehe Kommentar bei Karte 6/7 weiter unten.
    var ppuAufbauCredits   = Math.round(Number(user.ppu_aufbau_credits || 0));
    var ppuAufbauReserved  = Math.round(Number(user.reserved_ppu_aufbau_credits || 0));
    var ppuAufbauAvailable = Math.max(ppuAufbauCredits - ppuAufbauReserved, 0);
    // Strategie-PPU liegt genau wie ppu_aufbau_credits auf der eigenen users-Zeile des Members,
    // nicht auf bu/billingUser - siehe Kommentar bei Karte 10 weiter unten.
    var ppuStrategyCredits   = Math.round(Number(user.ppu_strategy_credits || 0));
    var ppuStrategyReserved  = Math.round(Number(user.reserved_ppu_strategy_credits || 0));
    var ppuStrategyAvailable = Math.max(ppuStrategyCredits - ppuStrategyReserved, 0);
 
    var analysesLeft = bu.credits_remaining != null
      ? Math.max(0, Math.round(Number(bu.credits_remaining)) - reserved)
      : Math.max(0, limit - used - reserved);
 
    // Chat-Kontingent wird weiterhin berechnet (falls an anderer Stelle noch gebraucht),
    // aber aktuell in keiner Karte angezeigt - siehe Hinweis im Dateikopf.
    var chatUsed  = Math.round(Number(user.chat_messages_used_current_period || 0));
    var chatLimit = Math.round(Number(user.chat_messages_limit || 0));
    void chatUsed; void chatLimit;
 
    var percentRaw = limit ? ((used + reserved) / limit) * 100 : 0;
 
    // Karte 1: Analysen diesen Monat
    var usedDisplay = reserved > 0
      ? (used + '/' + limit + ' Analysen (' + reserved + ' in Bearbeitung)')
      : (used + '/' + limit + ' Analysen');
    setText('cvz-d-c1-value', usedDisplay);
    setText('cvz-d-c1-sub', Math.round(percentRaw) + '% des Limits genutzt');
    var bar1 = document.getElementById('cvz-d-c1-bar');
    if (bar1) bar1.style.width = Math.min(percentRaw, 100) + '%';
 
    // Plan-Flags
    var isPaid      = CONFIG.PAID_PLANS.indexOf(bu.license_type) !== -1;
    var isPayPerUse = bu.license_type === 'Pay-per-Use';
    var isFreePlan  = bu.license_type === 'Free';
    var isBetaPlan  = bu.license_type === 'Beta';
 
    // Karte 2: Verbleibende Analysen (Wert + Renewal/Status als ein Satz)
    var renewalSub = '';
    if (isPaid) {
      var renewalDate = null;
      if (bu.license_expires_at)          renewalDate = new Date(bu.license_expires_at).toLocaleDateString('de-DE');
      else if (bu.next_credit_reset_date) renewalDate = new Date(bu.next_credit_reset_date).toLocaleDateString('de-DE');
      else if (bu.period_start_date) {
        var d = new Date(bu.period_start_date);
        d.setMonth(d.getMonth() + 1);
        renewalDate = d.toLocaleDateString('de-DE');
      }
      renewalSub = renewalDate ? ('Erneuert sich am ' + renewalDate) : '-';
    } else if (isFreePlan) {
      renewalSub = analysesLeft > 0 ? '1 kostenlose Analyse verfügbar' : 'Kostenlose Analyse bereits genutzt';
    } else if (isPayPerUse) {
      renewalSub = analysesLeft > 0 ? '1 Analyse verfügbar' : 'Analyse bereits genutzt – jetzt neue kaufen';
    } else if (isBetaPlan) {
      renewalSub = 'Beta-Analysen erneuern sich nicht automatisch';
    }
    setText('cvz-d-c2-value', analysesLeft);
    setText('cvz-d-c2-sub', renewalSub);
 
    // Karte 3: Aktiver Plan
    var planName = bu.license_type || '-';
    if (planName.length > 0 && !isPayPerUse) planName = planName.charAt(0).toUpperCase() + planName.slice(1);
    if (!!user.owner_user_id) planName += ' (Team)';
    setText('cvz-d-c3-value', planName);
    setText('cvz-d-c3-sub', limit
      ? (isPaid ? limit + ' Analysen pro Monat' : isPayPerUse ? '1 Analyse, kein Abo' : limit + ' Analyse(n)')
      : '');
 
    // Karte 4+5: Aufbau-Sessions (nur wenn Plan ueberhaupt Kontingent hat), im gleichen
    // Zwei-Karten-Muster wie die Analysen (Verbrauch diesen Monat + Verbleibend).
    // WHY eigenes Reset-Datum: Aufbau-Sessions laufen auf einer eigenen Periode
    // (page_agent_sessions_period_start), nicht auf der Analysen-Credits-Periode.
    var sessionsUsed     = Math.round(Number(bu.page_agent_sessions_used_current_period || 0));
    var sessionsLimitNum = Math.round(Number(sessionsLimit || 0));
    var sessionsLeft     = Math.max(sessionsLimitNum - sessionsUsed, 0);
    var sessionsPercent  = sessionsLimitNum ? (sessionsUsed / sessionsLimitNum) * 100 : 0;
    var showAufbauCards  = sessionsLimitNum > 0;
 
    setText('cvz-d-c4-value', sessionsUsed + '/' + sessionsLimitNum + ' Aufbau-Sessions');
    setText('cvz-d-c4-sub', Math.round(sessionsPercent) + '% des Kontingents genutzt');
    var bar4 = document.getElementById('cvz-d-c4-bar');
    if (bar4) bar4.style.width = Math.min(sessionsPercent, 100) + '%';
    showEl(document.getElementById('cvz-d-c4'), showAufbauCards, 'flex');
 
    var aufbauRenewalSub = '';
    if (isFreePlan) {
      aufbauRenewalSub = sessionsLeft > 0 ? '1 kostenlose Aufbau-Session verfügbar' : 'Kostenlose Aufbau-Session bereits genutzt';
    } else if (bu.page_agent_sessions_period_start) {
      var aufbauRenewalDate = new Date(bu.page_agent_sessions_period_start);
      aufbauRenewalDate.setMonth(aufbauRenewalDate.getMonth() + 1);
      aufbauRenewalSub = 'Erneuert sich am ' + aufbauRenewalDate.toLocaleDateString('de-DE');
    } else {
      aufbauRenewalSub = '-';
    }
    setText('cvz-d-c5-value', sessionsLeft);
    setText('cvz-d-c5-sub', aufbauRenewalSub);
    showEl(document.getElementById('cvz-d-c5'), showAufbauCards, 'flex');
 
    // Karte 6: Pay-per-Use (nur wenn vorhanden)
    var ppuLabelText = ppuCredits === 0
      ? 'Keine Pay-per-Use Analysen'
      : ppuReserved > 0 && ppuAvailable === 0
        ? 'Analyse wird gerade verarbeitet...'
        : ppuReserved > 0
          ? ppuAvailable + ' verfügbar (' + ppuReserved + ' in Bearbeitung)'
          : ppuCredits + ' Pay-per-Use Analyse' + (ppuCredits > 1 ? 'n' : '') + ' verfügbar';
    setText('cvz-d-c6-value', ppuAvailable);
    setText('cvz-d-c6-sub', ppuLabelText);
    showEl(document.getElementById('cvz-d-c6'), ppuCredits > 0, 'flex');
    // Karte 7: Pay-per-Use Aufbau-Sessions (nur wenn vorhanden) - exakt dasselbe
    // Muster wie Karte 6, nur fuer ppu_aufbau_credits statt ppu_credits.
    var ppuAufbauLabelText = ppuAufbauCredits === 0
      ? 'Keine Pay-per-Use Aufbau-Sessions'
      : ppuAufbauReserved > 0 && ppuAufbauAvailable === 0
        ? 'Session wird gerade verarbeitet...'
        : ppuAufbauReserved > 0
          ? ppuAufbauAvailable + ' verfügbar (' + ppuAufbauReserved + ' in Bearbeitung)'
          : ppuAufbauCredits + ' Pay-per-Use Aufbau-Session' + (ppuAufbauCredits > 1 ? 's' : '') + ' verfügbar';
    setText('cvz-d-c7-value', ppuAufbauAvailable);
    setText('cvz-d-c7-sub', ppuAufbauLabelText);
    showEl(document.getElementById('cvz-d-c7'), ppuAufbauCredits > 0, 'flex');

    // Karte 8+9: Content-Strategien (nur wenn Plan ueberhaupt Kontingent hat) - exakt dasselbe
    // Muster wie Karte 4+5 (Aufbau-Sessions), nur fuer content_strategy_sessions_* statt
    // page_agent_sessions_*. Eigene Periode (content_strategy_sessions_period_start), nicht die
    // Analysen-Credits-Periode - siehe migrations/content_strategy_quota.sql.
    var strategyUsed     = Math.round(Number(bu.content_strategy_sessions_used_current_period || 0));
    var strategyLimitNum = Math.round(Number(contentStrategyLimit || 0));
    var strategyLeft     = Math.max(strategyLimitNum - strategyUsed, 0);
    var strategyPercent  = strategyLimitNum ? (strategyUsed / strategyLimitNum) * 100 : 0;
    var showStrategyCards = strategyLimitNum > 0;

    setText('cvz-d-c8-value', strategyUsed + '/' + strategyLimitNum + ' Content-Strategien');
    setText('cvz-d-c8-sub', Math.round(strategyPercent) + '% des Kontingents genutzt');
    var bar8 = document.getElementById('cvz-d-c8-bar');
    if (bar8) bar8.style.width = Math.min(strategyPercent, 100) + '%';
    showEl(document.getElementById('cvz-d-c8'), showStrategyCards, 'flex');

    var strategyRenewalSub = '';
    if (isFreePlan) {
      strategyRenewalSub = strategyLeft > 0 ? '1 kostenlose Content-Strategie verfügbar' : 'Kostenlose Content-Strategie bereits genutzt';
    } else if (bu.content_strategy_sessions_period_start) {
      var strategyRenewalDate = new Date(bu.content_strategy_sessions_period_start);
      strategyRenewalDate.setMonth(strategyRenewalDate.getMonth() + 1);
      strategyRenewalSub = 'Erneuert sich am ' + strategyRenewalDate.toLocaleDateString('de-DE');
    } else {
      strategyRenewalSub = '-';
    }
    setText('cvz-d-c9-value', strategyLeft);
    setText('cvz-d-c9-sub', strategyRenewalSub);
    showEl(document.getElementById('cvz-d-c9'), showStrategyCards, 'flex');

    // Karte 10: Pay-per-Use Content-Strategien (nur wenn vorhanden) - exakt dasselbe Muster wie
    // Karte 6/7, nur fuer ppu_strategy_credits statt ppu_credits/ppu_aufbau_credits.
    var ppuStrategyLabelText = ppuStrategyCredits === 0
      ? 'Keine Pay-per-Use Content-Strategien'
      : ppuStrategyReserved > 0 && ppuStrategyAvailable === 0
        ? 'Strategie wird gerade erstellt...'
        : ppuStrategyReserved > 0
          ? ppuStrategyAvailable + ' verfügbar (' + ppuStrategyReserved + ' in Bearbeitung)'
          : ppuStrategyCredits + ' Pay-per-Use Content-Strategie' + (ppuStrategyCredits > 1 ? 'n' : '') + ' verfügbar';
    setText('cvz-d-c10-value', ppuStrategyAvailable);
    setText('cvz-d-c10-sub', ppuStrategyLabelText);
    showEl(document.getElementById('cvz-d-c10'), ppuStrategyCredits > 0, 'flex');

    // User-Kopfbereich (weiterhin Webflow-Elemente, unveraendert)
    setUserHeader(user);
  }
 
  function setUserHeader(user) {
    var nameEl  = document.querySelector('[data-user="name"]');
    var emailEl = document.querySelector('[data-user="email"]');
    if (nameEl)  nameEl.textContent  = user.full_name || 'Unbekannt';
    if (emailEl) emailEl.textContent = user.email     || '';
 
    var avatarEl = document.querySelector('[data-user="avatar"]');
    if (avatarEl) {
      avatarEl.textContent = getInitials(user.full_name || '');
      avatarEl.style.cssText += ';display:flex;align-items:center;justify-content:center';
    }
  }
 
  // -- UI: Klick-Hinweis (Ersatz/Ergaenzung fuer Hover) -----------------------
  // WHY: title-Tooltips loesen nur bei Hover aus - auf Touch-Geraeten (kein
  // Hover) und offenbar teils auch auf Desktop (siehe die pointer-events-
  // Debugging-Runde weiter oben) kommt die Erklaerung sonst nie an. Bei Klick
  // auf einen deaktivierten Button zeigen wir den title-Text zusaetzlich als
  // kleine Sprechblase an - unabhaengig davon, ob Hover ueberhaupt geklappt
  // haette. Ein zweiter Klick woanders auf der Seite oder ein Timeout
  // schliesst sie wieder.
  var CVZ_CLICK_HINT_ID = 'cvz-click-hint';
  var cvzClickHintTimer = null;
 
  function hideClickHint() {
    if (cvzClickHintTimer) { clearTimeout(cvzClickHintTimer); cvzClickHintTimer = null; }
    var existing = document.getElementById(CVZ_CLICK_HINT_ID);
    if (existing) existing.remove();
    document.removeEventListener('click', handleDocClickForHint, true);
  }
 
  function handleDocClickForHint(e) {
    var hint = document.getElementById(CVZ_CLICK_HINT_ID);
    if (hint && !hint.contains(e.target)) hideClickHint();
  }
 
  function showClickHint(anchorEl, text) {
    if (!text) return;
    hideClickHint();
 
    var hint = document.createElement('div');
    hint.id = CVZ_CLICK_HINT_ID;
    hint.className = 'cvz-click-hint';
    hint.setAttribute('role', 'status');
    hint.textContent = text;
    document.body.appendChild(hint);
 
    var rect     = anchorEl.getBoundingClientRect();
    var hintRect = hint.getBoundingClientRect();
    var top  = rect.top - hintRect.height - 8;
    if (top < 8) top = rect.bottom + 8; // nicht genug Platz oben -> unterhalb anzeigen
    var left = rect.left + (rect.width / 2) - (hintRect.width / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - hintRect.width - 8));
    hint.style.top  = top + 'px';
    hint.style.left = left + 'px';
 
    requestAnimationFrame(function () { hint.classList.add('cvz-click-hint-visible'); });
 
    cvzClickHintTimer = setTimeout(hideClickHint, 3000);
    // WHY setTimeout(...,0): verhindert, dass der Klick, der showClickHint
    // ausgeloest hat, den Listener sofort wieder selbst feuert.
    setTimeout(function () { document.addEventListener('click', handleDocClickForHint, true); }, 0);
  }
 
  // -- UI: Analysen-Tabelle -------------------------------------------------------
 
  var STATUS_STYLES = {
    completed:  { text: 'Abgeschlossen',  color: '#4fd1c5', bg: 'rgba(79,209,197,0.15)' },
    processing: { text: 'In Bearbeitung', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    error:      { text: 'Fehler',         color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
    failed:     { text: 'Fehler',         color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
  };
 
  // 8-10 = gruen, 6-7.9 = tuerkis, 4-5.9 = orange, 0-3.9 = rot
  function getScoreColor(score) {
    if (score >= 8) return '#059669';
    if (score >= 6) return '#4fd1c5';
    if (score >= 4) return '#f59e0b';
    return '#ef4444';
  }
 
  function createScoreBadge(score) {
    var hasScore = typeof score === 'number' && !isNaN(score);
    var badge = document.createElement('div');
    if (hasScore) {
      var color = getScoreColor(score);
      badge.textContent = score.toFixed(1);
      badge.style.cssText =
        'display:inline-flex;align-items:center;justify-content:center;' +
        'min-width:44px;padding:8px 14px;border-radius:9999px;' +
        'font-weight:700;font-size:13px;line-height:1;' +
        'background:' + color + ';color:#0d1117;';
    } else {
      badge.textContent = '-';
      badge.style.cssText =
        'display:inline-flex;align-items:center;justify-content:center;' +
        'min-width:44px;padding:8px 14px;border-radius:9999px;' +
        'font-weight:700;font-size:13px;line-height:1;' +
        'background:#252d3d;color:#7a8ba8;';
    }
    return badge;
  }
 
  function createAnalysisRow(analysis) {
    var isCompleted = analysis.status === 'completed';
    var canDownload = isCompleted && canAccessPdf(analysis);
 
    // Ist der eingeloggte User der Ersteller dieser Analyse?
    // KI-Agent ist NUR fuer den Ersteller (Backend erzwingt das ohnehin via
    // verifyAnalysisOwnership -> 403 NOT_ANALYSIS_OWNER). Hier nur UX: Button sperren.
    var isCreator = !!state.supabaseUserId && analysis.user_id === state.supabaseUserId;
 
    var statusInfo = STATUS_STYLES[analysis.status] || STATUS_STYLES.completed;
    var formattedDate = '-';
    try {
      formattedDate = new Date(analysis.created_at).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
    } catch (e) {}
 
    var row = document.createElement('div');
    row.className = 'cvz-a-row';
    row.setAttribute('data-analysis-id', analysis.id);
 
    // URL
    var urlCell = document.createElement('div');
    urlCell.className = 'cvz-a-url';
    urlCell.textContent = truncate(analysis.landing_page_url, 90);
    row.appendChild(urlCell);
 
    // Keyword
    var kwCell = document.createElement('div');
    kwCell.className = 'cvz-a-keyword';
    kwCell.textContent = truncate(analysis.keyword, 50);
    row.appendChild(kwCell);
 
    // Status
    var statusCell = document.createElement('div');
    var badge = document.createElement('span');
    badge.className = 'cvz-a-badge';
    badge.textContent = statusInfo.text;
    badge.style.background = statusInfo.bg;
    badge.style.color      = statusInfo.color;
    statusCell.appendChild(badge);
    row.appendChild(statusCell);
 
    // Datum
    var dateCell = document.createElement('div');
    dateCell.className = 'cvz-a-date';
    dateCell.textContent = formattedDate;
    row.appendChild(dateCell);
 
    // Aktionen (Ansicht / KI-Agent / Report) - display:contents auf Desktop,
    // flex-Reihe auf Mobile (siehe CSS)
    var actionsCell = document.createElement('div');
    actionsCell.className = 'cvz-a-actions';
 
    var viewBtn = document.createElement('a');
    viewBtn.className = 'cvz-a-icon-btn' + (isCompleted ? '' : ' cvz-a-disabled');
    viewBtn.innerHTML = ICONS.eye;
    viewBtn.target = '_blank';
    if (isCompleted) {
      viewBtn.href = '/analyse/resultat?id=' + encodeURIComponent(analysis.id);
      viewBtn.title = 'Ansehen';
    } else {
      // WHY href='#' + preventDefault statt nur pointer-events:none: Die CSS-Regel
      // pointer-events:none wurde entfernt, damit der native title-Tooltip auf
      // ausgegrauten Icons wieder per Hover ausgeloest wird (pointer-events:none
      // unterdrueckt auch mouseover, nicht nur click). Der Klickschutz muss daher
      // jetzt hier explizit passieren, sonst waere der Button trotz "disabled"-
      // Optik navigierbar.
      viewBtn.href = '#';
      viewBtn.setAttribute('aria-disabled', 'true');
      // WHY pointer-events:auto !important inline: Auf der Seite existiert
      // vermutlich eine Regel wie a[aria-disabled="true"]{pointer-events:none
      // !important;} (gaengiges Pattern fuer nicht-native disabled-Links,
      // z.B. aus Memberstack/Webflow-Nav-Komponenten). Ein einfaches
      // style.pointerEvents='auto' (ohne !important) verliert gegen eine
      // !important-Regel im externen Stylesheet, unabhaengig von Spezifitaet -
      // nur ein ebenfalls mit !important gesetzter Inline-Wert gewinnt
      // zuverlaessig dagegen.
      viewBtn.style.setProperty('pointer-events', 'auto', 'important');
      viewBtn.title = 'Analyse ist noch nicht abgeschlossen';
      viewBtn.addEventListener('click', function (e) {
        e.preventDefault();
        showClickHint(viewBtn, viewBtn.title);
      });
    }
    actionsCell.appendChild(viewBtn);
 
    var agentEnabled = isCompleted && isCreator;
    var agentBtn = document.createElement('a');
    agentBtn.className = 'cvz-a-icon-btn' + (agentEnabled ? '' : ' cvz-a-disabled');
    agentBtn.innerHTML = ICONS.agent;
    agentBtn.target = '_blank';
    if (agentEnabled) {
      agentBtn.href = '/analyse/optimization-agent?analysis_id=' + encodeURIComponent(analysis.id);
      agentBtn.title = 'Mit KI-Agent optimieren';
    } else {
      agentBtn.href = '#';
      agentBtn.setAttribute('aria-disabled', 'true');
      // WHY !important: siehe Kommentar bei viewBtn weiter oben. Betrifft hier
      // vermutlich haeufiger sichtbar, weil der Agent-Button in der Praxis
      // oefter im disabled-Zustand getestet wird (Nicht-Ersteller) als der
      // View-Button.
      agentBtn.style.setProperty('pointer-events', 'auto', 'important');
      agentBtn.title = !isCompleted
        ? 'Analyse ist noch nicht abgeschlossen'
        : 'Der KI-Agent steht nur dem Ersteller der Analyse zur Verfügung';
      agentBtn.addEventListener('click', function (e) {
        e.preventDefault();
        showClickHint(agentBtn, agentBtn.title);
      });
    }
    actionsCell.appendChild(agentBtn);
 
    var isFreeAnalysis = (analysis.analysis_source || '').toLowerCase() === 'free';
    var downloadTitle = !isCompleted
      ? 'Analyse muss abgeschlossen sein'
      : !canAccessPdf(analysis)
        ? (isFreeAnalysis
            ? 'PDF-Report ist im Free Plan nicht enthalten'
            : 'PDF-Report nur für kostenpflichtige Pläne oder Pay-per-Use verfügbar')
        : 'Report herunterladen';
    var dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'cvz-a-icon-btn' + (canDownload ? '' : ' cvz-a-disabled');
    dlBtn.innerHTML = ICONS.download;
    dlBtn.setAttribute('aria-label', 'Report herunterladen');
    dlBtn.title = downloadTitle;
    if (canDownload) {
      dlBtn.addEventListener('click', function () { handleReportDownload(dlBtn, analysis.id); });
    } else {
      // WHY eigener Handler statt Wegfall: vorher passierte bei Klick auf den
      // deaktivierten Button gar nichts - keine Rueckmeldung, warum. Jetzt
      // zeigt der Klick denselben Text wie der (Hover-)Tooltip.
      dlBtn.addEventListener('click', function () { showClickHint(dlBtn, downloadTitle); });
    }
    actionsCell.appendChild(dlBtn);
 
    row.appendChild(actionsCell);
 
    // Score
    var scoreCell = document.createElement('div');
    scoreCell.className = 'cvz-a-score-cell';
    var scoreVal = parseFloat(analysis.overall_score_weighted);
    scoreCell.appendChild(createScoreBadge(scoreVal));
    row.appendChild(scoreCell);
 
    return row;
  }
 
  function renderAnalysesPage(page) {
    state.currentPage = page;
    state.container.innerHTML = '';
    var items = state.analysesData.slice((page - 1) * CONFIG.PAGE_SIZE, page * CONFIG.PAGE_SIZE);
    items.forEach(function (item) { state.container.appendChild(createAnalysisRow(item)); });
    updatePaginationInfo();
  }
 
  function updatePaginationInfo() {
    var paginationEl = document.getElementById('cvz-a-pagination');
    var info    = document.getElementById('cvz-a-pageinfo');
    var prevBtn = document.getElementById('cvz-a-prev');
    var nextBtn = document.getElementById('cvz-a-next');
    if (!paginationEl) return;
    if (state.totalPages <= 1) { paginationEl.style.display = 'none'; return; }
    paginationEl.style.display = 'flex';
    info.textContent = 'Seite ' + state.currentPage + ' von ' + state.totalPages;
    prevBtn.disabled = state.currentPage <= 1;
    nextBtn.disabled = state.currentPage >= state.totalPages;
  }

  // -- UI: Tab "Content-Strategien" ---------------------------------------------
  // Gleiches Karten-Layout wie das bisherige page-projects-embed.html
  // (cvz-p-*-Klassen, siehe injectDashboardStyle). GEÄNDERT (siehe Chat-Verlauf, Lasse:
  // "Content-Strategie-Sessions sollen im Dashboard genauso wie Analysen/Aufbau-Sessions
  // angelegt werden, sobald sie in Bearbeitung sind, Status soll sich auf 'Strategie erstellt'
  // ändern"): Strategie-Sessions haben jetzt genau wie Aufbau-Projekte einen Lebenszyklus-Status
  // (siehe STRATEGY_STATUS_MAP unten) statt immer nur "Ansehen" zu zeigen.

  var STRATEGY_STATUS_MAP = {
    in_progress: { text: 'In Bearbeitung',     color: '#f59e0b' },
    done:        { text: 'Strategie erstellt', color: '#4fd1c5' },
    error:       { text: 'Fehler',             color: '#ef4444' },
  };

  function strategySessionUrl(sessionId) {
    return CONFIG.CONTENT_STRATEGY_PAGE_URL + '?session_id=' + encodeURIComponent(sessionId);
  }

  function renderStrategyEmpty(el) {
    el.innerHTML =
      '<div class="cvz-p-empty">' +
        '<p style="margin:0;">Noch keine Content-Strategie erstellt.</p>' +
      '</div>';
  }

  function renderStrategyError(el) {
    el.innerHTML =
      '<div class="cvz-p-error">' +
        '<p style="font-weight:600;margin:0;">Strategien konnten nicht geladen werden</p>' +
        '<p class="cvz-p-error-sub">Bitte lade die Seite neu oder versuche es später erneut.</p>' +
      '</div>';
  }

  function renderStrategyPage(page) {
    state.strategyPage = page;
    var el = document.getElementById('cvz-s-body');
    if (!el) return;
    var start = (page - 1) * CONFIG.PAGE_SIZE;
    var items = state.strategySessions.slice(start, start + CONFIG.PAGE_SIZE);
    el.innerHTML = '';
    items.forEach(function (s) {
      // Fallback auf 'done' fuer den (nach der Migration eigentlich nicht mehr vorkommenden)
      // Fall, dass status aus irgendeinem Grund fehlt - sicherer Default ist "klickbar/fertig"
      // statt eine echte, laengst abgeschlossene Strategie faelschlich als haengengeblieben zu
      // zeigen.
      var status = s.status || 'done';
      var statusInfo = STRATEGY_STATUS_MAP[status] || { text: status, color: '#8b98a5' };
      var isClickable = status === 'done';
      var row = document.createElement('div');
      row.className = 'cvz-p-row' + (isClickable ? '' : ' cvz-p-row-disabled');
      row.innerHTML =
        '<div>' +
          '<div class="cvz-p-name"></div>' +
          '<div class="cvz-p-meta"></div>' +
        '</div>' +
        '<span class="cvz-p-badge" style="color:' + statusInfo.color + ';"></span>';
      row.querySelector('.cvz-p-name').textContent = s.seed_topic || 'Unbenanntes Thema';
      row.querySelector('.cvz-p-meta').textContent = (s.domain ? s.domain + ' · ' : '') + 'Zuletzt aktualisiert: ' + formatRelativeTime(s.updated_at);
      row.querySelector('.cvz-p-badge').textContent = statusInfo.text;
      if (isClickable) {
        row.addEventListener('click', function () {
          window.open(strategySessionUrl(s.id), '_blank', 'noopener');
        });
      }
      el.appendChild(row);
    });
    updateGenericPaginationInfo('cvz-s-pagination', 'cvz-s-pageinfo', 'cvz-s-prev', 'cvz-s-next', state.strategyPage, state.strategyTotalPages);
  }

  // Rendert den Strategien-Tab aus dem bereits geladenen state.strategySessions
  // (eager geladen in loadRecentActivity/initDashboard - kein Extra-Fetch hier).
  function renderStrategyTabFromCache() {
    var el = document.getElementById('cvz-s-body');
    if (!el) return;
    if (state.strategyLoadFailed) { renderStrategyError(el); return; }
    if (!state.strategySessions.length) { renderStrategyEmpty(el); return; }
    state.strategyTotalPages = Math.max(1, Math.ceil(state.strategySessions.length / CONFIG.PAGE_SIZE));
    renderStrategyPage(1);
  }

  // -- UI: Tab "Aufbau-Sessions" --------------------------------------------------
  // Fast 1:1 aus page-projects-embed.html uebernommen (Status-Badge inkl.
  // STATUS_MAP, Klick oeffnet den Landingpage-Assistenten mit ?project=<id>).
  // WHY lazy statt eager: anders als Content-Strategie-Sessions gibt es hier
  // keinen ohnehin schon benoetigten Nebeneffekt (die "Zuletzt aktiv"-Vorschau
  // nutzt bereits die leichte RPC get_recent_page_projects, nicht diese volle
  // Liste) - ein Fetch gegen die Node-API nur, wenn der User den Tab wirklich
  // oeffnet.

  var AUFBAU_STATUS_MAP = {
    in_progress:     { text: 'In Bearbeitung',    color: '#f59e0b' },
    structure_ready: { text: 'Struktur erstellt', color: '#4fd1c5' },
    done:            { text: 'Fertig',            color: '#059669' },
  };

  function renderAufbauSkeleton(el) {
    var rows = '';
    for (var i = 0; i < 3; i++) {
      rows +=
        '<div class="cvz-p-skeleton-row">' +
          '<div class="cvz-p-skeleton-block" style="width:180px;height:16px;"></div>' +
          '<div class="cvz-p-skeleton-block" style="width:80px;height:22px;border-radius:999px;"></div>' +
        '</div>';
    }
    el.innerHTML = rows;
  }

  function renderAufbauEmpty(el) {
    el.innerHTML =
      '<div class="cvz-p-empty">' +
        '<p style="margin:0 0 20px;">Noch keine Landingpage-Projekte vorhanden.</p>' +
        '<a class="cvz-p-new-btn" href="' + CONFIG.NEW_LANDINGPAGE_URL + '">Erste Landingpage starten</a>' +
      '</div>';
  }

  function renderAufbauError(el) {
    el.innerHTML =
      '<div class="cvz-p-error">' +
        '<p style="font-weight:600;margin:0;">Projekte konnten nicht geladen werden</p>' +
        '<p class="cvz-p-error-sub">Bitte lade die Seite neu oder versuche es später erneut.</p>' +
      '</div>';
  }

  function renderAufbauPage(page) {
    state.aufbauPage = page;
    var el = document.getElementById('cvz-p-body');
    if (!el) return;
    var start = (page - 1) * CONFIG.PAGE_SIZE;
    var items = state.aufbauProjects.slice(start, start + CONFIG.PAGE_SIZE);
    el.innerHTML = '';
    items.forEach(function (p) {
      var statusInfo = AUFBAU_STATUS_MAP[p.status] || { text: p.status || '-', color: '#8b98a5' };
      var row = document.createElement('div');
      row.className = 'cvz-p-row';
      row.innerHTML =
        '<div>' +
          '<div class="cvz-p-name"></div>' +
          '<div class="cvz-p-meta"></div>' +
        '</div>' +
        '<span class="cvz-p-badge" style="color:' + statusInfo.color + ';"></span>';
      row.querySelector('.cvz-p-name').textContent = p.name || 'Unbenanntes Projekt';
      row.querySelector('.cvz-p-meta').textContent = 'Zuletzt bearbeitet: ' + formatRelativeTime(p.updated_at);
      row.querySelector('.cvz-p-badge').textContent = statusInfo.text;
      row.addEventListener('click', function () {
        window.location.href = buildAufbauProjectUrl(p.id);
      });
      el.appendChild(row);
    });
    var newBtn = document.createElement('a');
    newBtn.className = 'cvz-p-new-btn';
    newBtn.href = CONFIG.NEW_LANDINGPAGE_URL;
    newBtn.textContent = '+ Neue Landingpage';
    el.appendChild(newBtn);
    updateGenericPaginationInfo('cvz-p-pagination', 'cvz-p-pageinfo', 'cvz-p-prev', 'cvz-p-next', state.aufbauPage, state.aufbauTotalPages);
  }

  // Laedt die volle Aufbau-Projekte-Liste ueber die Node-API (nicht die
  // RPC-Vorschau) - wird nur beim ersten Oeffnen des Tabs aufgerufen
  // (state.aufbauLoaded), siehe switchTab().
  async function loadAndRenderAufbauProjects() {
    var el = document.getElementById('cvz-p-body');
    if (!el || !state.memberToken || !state.supabaseUserId) return;
    renderAufbauSkeleton(el);
    var projects = await fetchPageProjects(state.memberToken, state.supabaseUserId);
    state.aufbauLoaded = true;
    if (projects === null) { renderAufbauError(el); return; }
    state.aufbauProjects   = projects;
    state.aufbauTotalPages = Math.max(1, Math.ceil(projects.length / CONFIG.PAGE_SIZE));
    if (!projects.length) {
      renderAufbauEmpty(el);
      document.getElementById('cvz-p-pagination').style.display = 'none';
      return;
    }
    renderAufbauPage(1);
  }

  // Gemeinsame Pagination-Anzeige fuer Strategien- und Aufbau-Tab (gleiches
  // Muster wie updatePaginationInfo() fuer die Analysen-Tabelle, nur
  // parametrisiert statt fest verdrahtet auf die cvz-a-*-IDs).
  function updateGenericPaginationInfo(paginationId, infoId, prevId, nextId, currentPage, totalPages) {
    var paginationEl = document.getElementById(paginationId);
    var info    = document.getElementById(infoId);
    var prevBtn = document.getElementById(prevId);
    var nextBtn = document.getElementById(nextId);
    if (!paginationEl) return;
    if (totalPages <= 1) { paginationEl.style.display = 'none'; return; }
    paginationEl.style.display = 'flex';
    info.textContent = 'Seite ' + currentPage + ' von ' + totalPages;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  }

  // -- UI: "Zuletzt aktiv" ----------------------------------------------------
  // Kombiniert drei Aktivitaets-Quellen (Analyse, Aufbau-Projekt, KI-Agent-Chat)
  // zu einer einzigen, nach Zeitstempel sortierten Liste. Jede build...-Funktion
  // wandelt die rohen DB-Zeilen einer Quelle in ein einheitliches Item-Format um:
  // { type, iconKey, title, context, timestamp, href }
 
  // Bestaetigtes URL-Muster fuer ein bestehendes Aufbau-Projekt: Parameter
  // heisst 'project' (nicht 'project_id'), Wert ist die page_projects.id.
  function buildAufbauProjectUrl(projectId) {
    return '/member/landingpage-assistant?project=' + encodeURIComponent(projectId);
  }
 
  // state.analysesData ist bereits geladen (siehe loadAndRenderAnalyses) - hier
  // kein weiterer Netzwerk-Call noetig, nur sortieren und die ersten `limit` nehmen.
  function buildAnalyseActivityItems(limit) {
    var sorted = state.analysesData.slice().sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return sorted.slice(0, limit).map(function (a) {
      return {
        type:      'analyse',
        iconKey:   'barChart',
        title:     'Analyse',
        context:   truncate(a.landing_page_url || a.keyword || '-', 60),
        timestamp: a.created_at,
        href:      '/analyse/resultat?id=' + encodeURIComponent(a.id),
      };
    });
  }
 
  function buildAufbauActivityItems(projects) {
    return projects.map(function (p) {
      return {
        type:      'aufbau',
        iconKey:   'aufbau',
        title:     'Aufbau-Session',
        context:   truncate(p.name || 'Unbenanntes Projekt', 60),
        timestamp: p.updated_at,
        href:      buildAufbauProjectUrl(p.id),
      };
    });
  }
 
  function buildAgentActivityItems(sessions) {
    return sessions.map(function (s) {
      // WHY flach statt s.analyses.keyword: get_recent_agent_sessions liefert
      // landing_page_url/keyword per SQL-JOIN als eigene Spalten zurueck,
      // nicht als verschachteltes Objekt wie beim frueheren PostgREST-Embed.
      var ctx = s.keyword || s.landing_page_url || '-';
      return {
        type:      'agent',
        iconKey:   'agent',
        title:     'KI-Agent',
        context:   truncate(ctx, 60),
        timestamp: s.updated_at,
        href:      '/analyse/optimization-agent?analysis_id=' + encodeURIComponent(s.analysis_id),
      };
    });
  }
 
  // NEU: Content-Strategie-Sessions als 4. Quelle fuer "Zuletzt aktiv" -
  // state.strategySessions ist zu diesem Zeitpunkt schon geladen (siehe
  // loadRecentActivity), kein weiterer Fetch noetig.
  function buildStrategyActivityItems(limit) {
    var sorted = state.strategySessions.slice().sort(function (a, b) {
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
    return sorted.slice(0, limit).map(function (s) {
      return {
        type:      'strategie',
        iconKey:   'strategy',
        title:     'Content-Strategie',
        context:   truncate(s.seed_topic || s.domain || '-', 60),
        timestamp: s.updated_at,
        href:      strategySessionUrl(s.id),
      };
    });
  }

  // WHY Array-von-Arrays statt fixer Parameter: mit der 4. Quelle
  // (Content-Strategie) waere eine feste Parameterliste (a, b, c, d, limit)
  // unuebersichtlich geworden - itemGroups laesst sich beliebig erweitern,
  // ohne die Signatur nochmal anzufassen.
  function mergeActivityItems(itemGroups, limit) {
    var all = [].concat.apply([], itemGroups);
    all.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    return all.slice(0, limit);
  }
 
  function renderRecentActivity(items) {
    var wrap = document.getElementById('cvz-ract-wrap');
    if (!wrap) return;
 
    // Leer -> Section komplett ausblenden statt eine leere Box zu zeigen.
    if (!items.length) {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      return;
    }
 
    wrap.style.display = '';
    var html = '<h2 class="cvz-d-title" style="margin-bottom:12px;">Zuletzt aktiv</h2><div class="cvz-ract-list">';
    items.forEach(function (item) {
      html +=
        '<a class="cvz-ract-item" href="' + item.href + '" target="_blank" rel="noopener">' +
          '<div class="cvz-ract-icon">' + ICONS[item.iconKey] + '</div>' +
          '<div class="cvz-ract-main">' +
            '<div class="cvz-ract-type">' + escapeHtml(item.title) + '</div>' +
            '<div class="cvz-ract-context">' + escapeHtml(item.context) + '</div>' +
          '</div>' +
          '<div class="cvz-ract-time">' + escapeHtml(formatRelativeTime(item.timestamp)) + '</div>' +
        '</a>';
    });
    html += '</div>';
    wrap.innerHTML = html;
  }
 
  // Orchestriert das Laden der "Zuletzt aktiv"-Section: Skeleton anzeigen,
  // Aufbau-Projekte + KI-Agent-Sessions parallel laden (Analysen sind schon da),
  // zusammenfuehren, rendern.
  async function loadRecentActivity(userId) {
    var wrap = document.getElementById('cvz-ract-wrap');
    if (wrap) {
      wrap.style.display = '';
      wrap.innerHTML =
        '<h2 class="cvz-d-title" style="margin-bottom:12px;">Zuletzt aktiv</h2>' +
        '<div class="cvz-ract-list">' +
          '<div class="cvz-ract-item cvz-ract-skel"></div>' +
          '<div class="cvz-ract-item cvz-ract-skel"></div>' +
          '<div class="cvz-ract-item cvz-ract-skel"></div>' +
        '</div>';
    }
 
    // Content-Strategie-Sessions nur laden, wenn der User ueberhaupt Zugriff
    // hat (state.hasStrategyAccess wird in initDashboard VOR diesem Aufruf
    // gesetzt) - sonst waere es ein Fetch gegen die Node-API ins Leere.
    var strategyPromise = state.hasStrategyAccess && state.memberToken
      ? fetchContentStrategySessions(state.memberToken)
      : Promise.resolve([]);

    var results = await Promise.all([
      fetchRecentPageProjects(userId, CONFIG.RECENT_ACTIVITY_LIMIT),
      fetchRecentAgentSessions(userId, CONFIG.RECENT_ACTIVITY_LIMIT),
      strategyPromise,
    ]);

    var aufbauItems  = buildAufbauActivityItems(results[0]);
    var agentItems   = buildAgentActivityItems(results[1]);
    var analyseItems = buildAnalyseActivityItems(CONFIG.RECENT_ACTIVITY_LIMIT);

    // state.strategySessions wird hier einmalig befuellt - der Strategien-Tab
    // (renderStrategyTabFromCache) paginiert spaeter ueber genau diesen Array,
    // ohne selbst nochmal zu fetchen (siehe WHY-Kommentar bei
    // fetchContentStrategySessions weiter oben).
    // WHY strategyLoadFailed separat: null (Fetch-Fehler) und [] (echt keine
    // Sessions) sehen nach "|| []" gleich aus - ohne das Flag wuerde ein
    // API-Fehler im Strategien-Tab faelschlich als "Noch keine Content-
    // Strategie erstellt" angezeigt statt als Fehlermeldung.
    state.strategyLoadFailed = state.hasStrategyAccess && results[2] === null;
    state.strategySessions   = results[2] || [];
    var strategyItems = state.hasStrategyAccess ? buildStrategyActivityItems(CONFIG.RECENT_ACTIVITY_LIMIT) : [];

    var merged = mergeActivityItems([analyseItems, aufbauItems, agentItems, strategyItems], CONFIG.RECENT_ACTIVITY_LIMIT);
    renderRecentActivity(merged);

    // Strategien-Tab kann jetzt (falls sichtbar) direkt aus dem Cache rendern -
    // renderStrategyTabFromCache() ist ein No-Op, solange der Tab noch nicht
    // im DOM sichtbar ist (Panel-Wechsel per switchTab() zeigt es dann einfach an).
    if (state.hasStrategyAccess) renderStrategyTabFromCache();
  }
 
  // -- UI: Loading / Empty / Error States -----------------------------------------
 
  var CVZ_SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 100 100" fill="none">' +
      '<defs><style>' +
        '.cvz-c-group{animation:cvz-spin 1.4s cubic-bezier(0.4,0,0.6,1) infinite}' +
        '.cvz-c-glow{animation:cvz-pulse 1.4s ease-in-out infinite}' +
      '</style>' +
      '<filter id="cvz-glow" x="-30%" y="-30%" width="160%" height="160%">' +
        '<feGaussianBlur stdDeviation="3.5" result="blur"/>' +
        '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '</filter></defs>' +
      '<circle class="cvz-c-glow" cx="50" cy="50" r="44" stroke="#4fd1c5" stroke-width="1.5" stroke-dasharray="180 96" stroke-linecap="round" opacity="0.25"/>' +
      '<g class="cvz-c-group" filter="url(#cvz-glow)">' +
        '<path d="M 78 28 A 36 36 0 1 0 78 72" stroke="#4fd1c5" stroke-width="10" stroke-linecap="butt" fill="none" opacity="0.9"/>' +
        '<polygon points="76,20 85,28 76,28" fill="#4fd1c5" opacity="0.95"/>' +
        '<polygon points="76,80 85,72 76,72" fill="#38b2a8" opacity="0.85"/>' +
        '<path d="M 74 31 A 30 30 0 1 0 74 69" stroke="#7ee8e0" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.35"/>' +
      '</g>' +
    '</svg>';
 
  var CVZ_DOTS_LOADER =
    '<div id="cvz-dots-loader" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="16" viewBox="0 0 80 20" fill="none">' +
        '<defs><style>' +
          '@keyframes cvz-dot{0%,80%,100%{transform:scale(0.6);opacity:0.3}40%{transform:scale(1);opacity:1}}' +
          '.cvzd1{animation:cvz-dot 1.2s ease-in-out 0s infinite;transform-origin:10px 10px}' +
          '.cvzd2{animation:cvz-dot 1.2s ease-in-out 0.2s infinite;transform-origin:40px 10px}' +
          '.cvzd3{animation:cvz-dot 1.2s ease-in-out 0.4s infinite;transform-origin:70px 10px}' +
        '</style>' +
        '<filter id="cvz-df"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
        '</defs>' +
        '<g filter="url(#cvz-df)">' +
          '<circle class="cvzd1" cx="10" cy="10" r="7" fill="#4fd1c5"/>' +
          '<circle class="cvzd2" cx="40" cy="10" r="7" fill="#4fd1c5"/>' +
          '<circle class="cvzd3" cx="70" cy="10" r="7" fill="#4fd1c5"/>' +
        '</g>' +
      '</svg>' +
    '</div>';
 
  function showAnalysesLoading() {
    if (!state.container) return;
    state.container.innerHTML =
      '<div class="cvz-a-loading">' + CVZ_SPINNER_SVG + '<p>Lade Dashboard...</p></div>';
  }
 
  function showNoUserMessage() {
    if (!state.container) return;
    state.container.innerHTML =
      '<div class="cvz-a-body-error">' +
        '<p style="font-weight:600;margin-bottom:8px;">Account nicht gefunden</p>' +
        '<p class="cvz-a-error-sub">Bitte melde dich erneut an oder kontaktiere den Support.</p>' +
      '</div>';
  }
 
  function showEmptyState() {
    if (!state.container) return;
    state.container.innerHTML =
      '<div class="cvz-a-body-empty">' +
        '<p style="margin:0 0 10px;font-weight:500;">Noch keine Analysen vorhanden</p>' +
        '<p style="margin:0;font-size:14px;">Starte deine erste Analyse!</p>' +
      '</div>';
  }
 
  function showDotsLoader() {
    if (!state.container || document.getElementById('cvz-dots-loader')) return;
    Array.prototype.forEach.call(state.container.querySelectorAll('.cvz-a-row'), function (r) { r.style.opacity = '0.4'; });
    state.container.insertAdjacentHTML('afterbegin', CVZ_DOTS_LOADER);
  }
 
  function hideDotsLoader() {
    var loader = document.getElementById('cvz-dots-loader');
    if (loader) loader.remove();
    if (state.container) {
      Array.prototype.forEach.call(state.container.querySelectorAll('.cvz-a-row'), function (r) { r.style.opacity = ''; });
    }
  }
 
  // -- Data load & render -----------------------------------------------------
 
  async function loadAndRenderAnalyses(keepPage) {
    if (!state.container || !state.memberstackId) { showEmptyState(); return; }
    if (keepPage) showDotsLoader();
 
    var data           = await fetchAnalysesForMember(state.memberstackId);
    state.analysesData = data || [];
    state.totalPages   = Math.max(1, Math.ceil(state.analysesData.length / CONFIG.PAGE_SIZE));
 
    hideDotsLoader();
 
    if (!state.analysesData.length) { showEmptyState(); updatePaginationInfo(); return; }
    state.currentPage = keepPage ? Math.min(state.currentPage, state.totalPages) : 1;
    renderAnalysesPage(state.currentPage);
  }
 
  // -- PDF download -----------------------------------------------------------
 
  async function triggerBlobDownload(url, fileName) {
    var res = await fetch(url);
 
    if (!res.ok) {
      var errText = await res.text();
      throw new Error('Download fehlgeschlagen (' + res.status + '): ' + errText.slice(0, 200));
    }
 
    // Storage liefert bei Fehlern JSON statt PDF - abfangen bevor es als .pdf landet
    var contentType = res.headers.get('content-type') || '';
    if (contentType.indexOf('application/json') !== -1) {
      var body = await res.text();
      throw new Error('Unerwartete Antwort: ' + body.slice(0, 200));
    }
 
    var blob    = await res.blob();
    var blobUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href     = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 5000);
  }
 
  async function handleReportDownload(btn, analysisId) {
    if (!state.supabaseUserId) return;
    var analysis = state.analysesData.find(function (a) { return a.id === analysisId; });
    if (!analysis || !canAccessPdf(analysis)) return;
 
    var isAgency = (state.licenseType || '').toLowerCase() === 'agency';
    btn.classList.add('cvz-a-loading-btn');
    btn.title = 'Wird generiert...';
 
    try {
      var domain = 'report', datetime = '';
      try {
        domain   = new URL(analysis.landing_page_url).hostname.replace('www.', '');
        var d    = new Date(analysis.created_at);
        datetime = '-' + d.toISOString().slice(0, 10) + '-' + d.toISOString().slice(11, 16).replace(':', '-');
      } catch (e) {}
 
      var ext      = isAgency ? 'docx' : 'pdf';
      var fileName = 'convertlyze-' + domain + datetime + '.' + ext;
 
      var response = await fetch(
        CONFIG.generateReportUrl,
        {
          method:  'POST',
          headers: {
            'Content-Type':     'application/json',
            'x-memberstack-id': state.memberstackId,
          },
          body: JSON.stringify({
            userId:     state.supabaseUserId,
            analysisId: analysisId,
            type:       isAgency ? 'word' : 'pdf',
          }),
        }
      );
      if (!response.ok) {
        var errBody = await response.json();
        var err = new Error(errBody.error || 'Generierung fehlgeschlagen');
        err.code = errBody.code;
        throw err;
      }
 
      var downloadUrl = (await response.json()).downloadUrl;
 
      await triggerBlobDownload(downloadUrl, fileName);
      btn.classList.remove('cvz-a-loading-btn');
      btn.title = 'Report herunterladen';
 
    } catch (err) {
      console.error('[CVZ] Report-Download Fehler:', err);
      btn.classList.remove('cvz-a-loading-btn');
      // WHY code statt Text-Match: err.code kommt direkt aus der Edge
      // Function (PLAN_RESTRICTED) - stabil gegen spaetere Aenderungen am
      // Fehlertext. Gleiche Logik wie in report.js.
      var isPlanError = err.code === 'PLAN_RESTRICTED';
      btn.title = isPlanError ? 'Nur mit bezahltem Plan verfügbar' : 'Fehler - erneut versuchen';
      btn.style.backgroundColor = '#3a1a1e';
      setTimeout(function () { btn.style.backgroundColor = ''; }, 2500);
    }
  }
 
  // -- Realtime + Polling -----------------------------------------------------
 
  // WHY Polling als Fallback: Supabase Realtime kann bei Verbindungsproblemen
  // ausfallen. Polling alle 10s stellt sicher dass Status-Updates ankommen.
  function hasProcessingAnalyses() {
    return state.analysesData.some(function (a) { return a.status === 'processing'; });
  }
 
  async function silentRefresh() {
    if (!state.memberstackId) return;
    var freshData = await fetchAnalysesForMember(state.memberstackId);
    if (!freshData) return;
 
    var changed = false;
    freshData.forEach(function (fresh) {
      var idx = state.analysesData.findIndex(function (a) { return a.id === fresh.id; });
      if (idx === -1) {
        state.analysesData.unshift(fresh);
        changed = true;
        return;
      }
      if (state.analysesData[idx].status === fresh.status) return;
 
      state.analysesData[idx] = fresh;
      changed = true;
 
      var row = state.container
        ? state.container.querySelector('[data-analysis-id="' + fresh.id + '"]')
        : null;
      if (!row) return;
 
      var badge   = row.querySelector('.cvz-a-badge');
      var newInfo = STATUS_STYLES[fresh.status] || STATUS_STYLES.completed;
      if (badge) {
        badge.textContent   = newInfo.text;
        badge.style.background = newInfo.bg;
        badge.style.color      = newInfo.color;
      }
      // Bei Abschluss oder Fehler: Row neu aufbauen um Buttons zu aktivieren
      if (fresh.status === 'completed' || fresh.status === 'error') {
        var newRow = createAnalysisRow(fresh);
        row.parentNode.replaceChild(newRow, row);
      }
    });
 
    if (changed) {
      state.totalPages = Math.max(1, Math.ceil(state.analysesData.length / CONFIG.PAGE_SIZE));
      updatePaginationInfo();
    }
    if (!hasProcessingAnalyses()) stopPolling();
  }
 
  function startPolling() {
    stopPolling();
    if (!hasProcessingAnalyses()) return;
    state.pollingTimer = setInterval(silentRefresh, CONFIG.POLL_INTERVAL_MS);
  }
 
  function stopPolling() {
    if (state.pollingTimer) { clearInterval(state.pollingTimer); state.pollingTimer = null; }
  }
 
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopPolling();
    } else if (hasProcessingAnalyses()) {
      silentRefresh().then(startPolling);
    }
  });
 
  function subscribeToAnalysisChanges(userId) {
    try {
      if (!window.supabase || !window.supabase.channel) return;
      if (state.realtimeChannel) window.supabase.removeChannel(state.realtimeChannel);
      state.realtimeChannel = window.supabase
        .channel('analyses-realtime-' + userId)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'analyses', filter: 'user_id=eq.' + userId },
          async function () { await loadAndRenderAnalyses(true); }
        )
        .on('system', {}, function (status) {
          if (status === 'SUBSCRIBED') loadAndRenderAnalyses(true);
        })
        .subscribe();
    } catch (e) {
      console.warn('[CVZ] Realtime-Subscription fehlgeschlagen:', e);
    }
  }
 
  // -- Init -------------------------------------------------------------------
 
  async function initDashboard() {
    try {
      var ready = await waitForDependencies();
      if (!ready) return;
 
      var appRoot = document.getElementById('cvz-dashboard-app');
      if (!appRoot) {
        console.error('[CVZ] #cvz-dashboard-app nicht im DOM gefunden - Webflow-Container fehlt.');
        return;
      }
      buildDashboardShell(appRoot);
 
      var memberstackId = null;
      try {
        var member    = await window.$memberstackDom.getCurrentMember();
        memberstackId = (member && member.data && member.data.id) ? member.data.id : null;
        // Echtes, signiertes JWT fuer die Node/Railway-API (Content-Strategie-
        // und Aufbau-Tab) - siehe SICHERHEITS-FIX-Kommentar bei
        // fetchPageProjects/fetchContentStrategySessions weiter oben. Wird
        // hier unconditional geholt (wie im bisherigen page-projects-
        // embed.html), auch wenn der User am Ende gar keinen der beiden
        // Tabs sieht - guenstiger lokaler SDK-Call, kein Grund fuer
        // bedingte Sonderlogik an dieser Stelle.
        state.memberToken = await window.$memberstackDom.getMemberCookie();
      } catch (e) {
        console.error('[CVZ] Memberstack Fehler:', e);
      }

      if (!memberstackId) {
        showNoUserMessage();
        document.body.classList.add('content-loaded');
        return;
      }

      state.memberstackId = memberstackId;
 
      // Checkout aus sessionStorage (Preis-Auswahl vor Login/Registrierung):
      // Wenn ein Plan gewaehlt wurde, wird der Stripe-Checkout hier sofort ausgeloest,
      // bevor der Rest des Dashboards ueberhaupt sichtbar wird.
      var savedPlan       = sessionStorage.getItem('selected_plan');
      var savedBilling    = sessionStorage.getItem('selected_billing') || 'monthly';
      var checkoutPriceId = (savedPlan && CONFIG.CHECKOUT_PRICE_IDS[savedPlan]) ? CONFIG.CHECKOUT_PRICE_IDS[savedPlan][savedBilling] : null;
      sessionStorage.removeItem('selected_plan');
      sessionStorage.removeItem('selected_billing');
 
      if (checkoutPriceId) {
        window.$memberstackDom.purchasePlansWithCheckout({
          priceId:    checkoutPriceId,
          successUrl: window.location.origin + '/member/dashboard?purchase=success',
        }).catch(function () { document.documentElement.style.visibility = 'visible'; });
        return;
      }
 
      document.documentElement.style.visibility = 'visible';
 
      // -- Purchase Success Modal --------------------------------------------
      var isPurchaseSuccess = getParam('purchase') === 'success';
      if (isPurchaseSuccess) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
 
      var currentUser = await fetchUser(memberstackId, 1) || await fetchUser(memberstackId, 5);
      if (!currentUser) {
        showNoUserMessage();
        document.body.classList.add('content-loaded');
        return;
      }
 
      state.supabaseUserId = currentUser.id;
      state.licenseType    = (currentUser._billingUser || currentUser).license_type || '';
      state.hasPdfAccess   = checkPdfAccess(currentUser);
 
      if (isPurchaseSuccess) {
        showPurchaseSuccessModal(state.licenseType);
      }
 
      // Team-Invite annehmen (Cookie wird nach wie vor unterstuetzt, auch wenn
      // das Team-Modal selbst jetzt auf der Einstellungen-Seite lebt)
      var pendingInvite = getCookie('cvz_invite');
      if (pendingInvite) {
        try {
          var inviteRes  = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/accept-team-invite', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.SUPABASE_ANON },
            body:    JSON.stringify({ token: pendingInvite, memberstack_id: memberstackId }),
          });
          var inviteData = await inviteRes.json();
          if (inviteData.success) {
            deleteCookie('cvz_invite');
            currentUser = await fetchUser(memberstackId, 1) || currentUser;
          } else {
            console.warn('[CVZ] Team-Invite fehlgeschlagen:', inviteData.error);
            deleteCookie('cvz_invite');
          }
        } catch (e) {
          console.error('[CVZ] Team-Invite Fehler:', e);
        }
      }
 
      // Credit-Reset
      if (await triggerCreditResetIfPaid(currentUser)) {
        currentUser = await fetchUser(memberstackId, 1) || currentUser;
      }
 
      // Aufbau-Sessions-Kontingent des Plans laden
      var sessionsLimit        = await fetchPlanSessionsLimit(state.licenseType);
      var contentStrategyLimit = await fetchPlanContentStrategyLimit(state.licenseType);

      // -- Zugriffsrechte fuer die Tabs ---------------------------------------
      // WICHTIG (bitte vor dem Live-Schalten prüfen): content_strategy_sessions_limit
      // wurde per Migration (content_strategy_plan_limit.sql) initial fuer JEDEN
      // Plan mit dem Wert von page_agent_sessions_limit vorbefuellt - das war nur
      // ein Platzhalter. Solange das in Supabase (Tabelle plans) nicht pro Plan
      // korrigiert ist (0 fuer Free/Starter/Beta, >0 fuer Pro/Enterprise), zeigt
      // dieses Gating faelschlich den Strategien-Tab auch fuer Plaene, die laut
      // Chat-Vorgabe ("ohne Pay-per-Use-Strategie oder Pro oder Enterprise Plan
      // sollen die Strategien gar nicht angezeigt werden") keinen Zugriff haben
      // sollen. War schon im letzten Deployment-Hinweis dokumentiert, hier nochmal
      // explizit, weil es jetzt direkt die Tab-Sichtbarkeit steuert.
      var ppuStrategyCredits = Math.round(Number(currentUser.ppu_strategy_credits || 0));
      state.hasStrategyAccess = contentStrategyLimit > 0 || ppuStrategyCredits > 0;

      // Gleiches Muster wie die bestehenden Aufbau-Stat-Karten (showAufbauCards
      // in renderStatCards) - Free-Plan hat hier laut bestehendem Code z.B. 1
      // kostenlose Aufbau-Session, daher limit-basiert statt hart auf
      // Plan-Namen geprueft.
      var ppuAufbauCredits = Math.round(Number(currentUser.ppu_aufbau_credits || 0));
      state.hasAufbauAccess = sessionsLimit > 0 || ppuAufbauCredits > 0;

      applyTabVisibility();

      renderStatCards(currentUser, sessionsLimit, contentStrategyLimit);

      await loadAndRenderAnalyses(false);
      // "Zuletzt aktiv" erst NACH loadAndRenderAnalyses(), weil
      // buildAnalyseActivityItems() auf state.analysesData zugreift.
      // Laedt (bei hasStrategyAccess) gleich auch die Content-Strategie-Sessions
      // mit und befuellt damit sowohl "Zuletzt aktiv" als auch den Strategien-Tab.
      await loadRecentActivity(currentUser.id);
      subscribeToAnalysisChanges(currentUser.id);
      startPolling();
 
      document.body.classList.add('content-loaded');
 
    } catch (err) {
      console.error('[CVZ] Dashboard-Fehler:', err);
      document.body.classList.add('content-loaded');
    }
  }
 
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }
 
})();
