(function () {
  'use strict';

  // =========================================================================
  // KONFIGURATION
  // =========================================================================
  var CONFIG = {
    apiBaseUrl: 'https://visibility-tracker-production-741c.up.railway.app',
    // Separate Supabase Edge Function fürs Topic-Slot-Pay-per-Use, NICHT
    // Teil des Railway-Backends. Annahme (nicht bestätigt, Code nie
    // gesehen): quantity = wie viele Slots ZUSÄTZLICH gekauft werden
    // sollen, nicht die neue Gesamtmenge. Falls falsch, muss submitBuyTopicSlot
    // unten die aktuelle purchased-Menge dazuzählen.
    stripeCheckoutUrl: 'https://<euer-supabase-projekt>.supabase.co/functions/v1/stripe-topic-slot-checkout',
    // Kein apiKey mehr (siehe Chat-Verlauf): das Script liegt jetzt in
    // einem öffentlichen GitHub-Repo, ein hier eingebetteter Key wäre kein
    // Geheimnis mehr gewesen. Auth läuft ausschließlich über
    // state.memberToken (echtes Memberstack-JWT), siehe apiFetch weiter
    // unten. Der Server verifiziert es gegen die echte Memberstack-API
    // (POST /members/verify-token, siehe memberstack_auth.py) und liest
    // die Member-ID selbst aus der verifizierten Antwort.

    // Solange das Backend nicht end-to-end getestet ist, arbeiten wir hier
    // bewusst gegen Mock-Daten. Umschalten auf false, sobald ihr gemeinsam
    // ein echtes Topic erfolgreich durchlaufen lassen habt.
    //
    // WICHTIG: Selbst bei false liefert GET /topics/{id} aktuell KEINE
    // competitors/gsc_rows und KEIN visibility_status pro Prompt, siehe
    // loadTopicDetail weiter unten.
    useMockData: false,  // TODO: für den echten Test
  };

  // NEU (13.09.2026): muss zu main.py: CHANGELOG_DELETED_RETENTION_DAYS
  // passen, nur fürs Anzeigen im Bestätigungsdialog, keine eigene Logik.
  var CHANGELOG_DELETED_RETENTION_DAYS = 90;

  // =========================================================================
  // MOCK-DATEN: Übersicht (Ebene 1+2)
  // =========================================================================
  var MOCK_PROJECTS = [
    { id: 'proj-1', name: 'Kunde A GmbH', domain: 'kunde-a.de' },
    { id: 'proj-2', name: 'Kunde B AG', domain: 'kunde-b.de' },
  ];

  var MOCK_TOPICS = [
    { id: 'topic-1', project_id: 'proj-1', name: 'Landingpage-Optimierung', seed_keyword: 'landingpage optimierung', status: 'active', opportunities_count: 4, created_at: '2026-08-20T09:00:00Z' },
    { id: 'topic-2', project_id: 'proj-1', name: 'CRO Beratung', seed_keyword: 'cro beratung', status: 'active', opportunities_count: 1, created_at: '2026-08-25T14:30:00Z' },
    { id: 'topic-3', project_id: 'proj-1', name: 'Conversion Funnel', seed_keyword: 'conversion funnel b2b', status: 'collecting', opportunities_count: 0, created_at: new Date(Date.now() - 15000).toISOString() },
    { id: 'topic-4', project_id: 'proj-2', name: 'SaaS Onboarding', seed_keyword: 'saas onboarding optimierung', status: 'error', opportunities_count: 0, created_at: '2026-09-01T11:00:00Z' },
  ];

  // =========================================================================
  // MOCK-DATEN: Topic-Detail (Ebene 3)
  // =========================================================================
  var MOCK_TOPIC_DETAIL = {
    'topic-1': {
      topic: {
        id: 'topic-1',
        name: 'Landingpage-Optimierung',
        seed_keyword: 'landingpage optimierung',
        own_domain: 'kunde-a.de',
        status: 'active',
        latest_summary:
          'Bei "landingpage optimierung" seid ihr weder in ChatGPT noch in der ' +
          'Google AI Overview präsent, obwohl VWO in beiden Quellen dominiert. ' +
          'Organisch rankt ihr für "landingpage optimierung checkliste" gut ' +
          '(Position 6,4), aber Klicks bleiben aus. Größter Hebel: ein ' +
          'Vergleichs-Artikel im Tabellenformat, das Format, mit dem VWO aktuell zitiert wird.',
      },
      opportunities: [
        { id: 'opp-1', type: 'high_demand_low_visibility', description: '"landingpage optimierung tools": 340 Impressionen/Monat, Position 11,8, keine KI-Zitierung. Ein strukturierter Tool-Vergleich ist hier der Hebel.' },
        { id: 'opp-2', type: 'competitor_citation', description: 'VWO wird sowohl in ChatGPT als auch in der Google AI Overview zitiert, ihr in keiner der beiden Quellen. VWOs Artikel nutzt durchgängig Tabellenformat statt Fließtext.' },
        { id: 'opp-3', type: 'google_visible_ai_invisible', description: 'Für "landingpage optimierung checkliste" rankt ihr organisch auf Position 6,4, taucht aber in keiner KI-Antwort auf. Meist ein Formatierungs-, kein Relevanzproblem.' },
        { id: 'opp-4', type: 'near_miss_ranking', description: '"landingpage optimierung agentur": Position 14,2, knapp außerhalb der Top 10. Mit gezieltem Content-Update realistisch auf Seite 1 zu bringen.' },
      ],
      competitors: [
        { domain: 'vwo.com', citations: 9, phases: ['exploration', 'evaluation', 'comparison'] },
        { domain: 'hubspot.de', citations: 5, phases: ['evaluation', 'decision'] },
        { domain: 'konversion.digital', citations: 3, phases: ['exploration'] },
      ],
      // Würde im echten Backend über source_analysis.py per Live-Web-Search
      // gefüllt (monatlich, gecacht pro Domain), hier von Hand als
      // plausibles Beispiel gesetzt, keine echte Analyse.
      source_profiles: [
        {
          domain: 'vwo.com', content_type: 'vergleichsartikel',
          summary: 'Listet mehrere CRO-Tools in einer strukturierten Tabelle mit Preis- und Feature-Vergleich.',
          differentiation_suggestion: 'Eigener Vergleich könnte zusätzlich DACH-spezifische Kriterien einbauen (Impressum/DSGVO/Sprachregister), die hier fehlen.',
        },
        {
          domain: 'hubspot.de', content_type: 'fachartikel',
          summary: 'Allgemeiner Ratgeber-Artikel zu Landingpage-Optimierung mit HubSpot-eigenen Tool-Verweisen.',
          differentiation_suggestion: 'Eigener Artikel könnte konkrete Vorher-Nachher-Beispiele aus echten B2B-Analysen zeigen statt allgemeiner Tipps.',
        },
      ],
      // Manuell beobachtet an EINEM echten Beispiel-Prompt, keine
      // automatisierte Erkennung (die bräuchte einen eigenen
      // Claude-Klassifizierungs-Call, siehe Chat-Verlauf). Deshalb
      // strukturell getrennt von den echten `opportunities`.
      content_ideas: [
        {
          id: 'idea-1',
          description: 'ChatGPT bietet in seiner Antwort explizit an, bei Angabe von Branche, monatlichem Traffic und Ziel eine personalisierte Tool-Empfehlung zu geben. Keine der zitierten Quellen deckt das ab. Möglicher Content-Typ: ein kurzer interaktiver Konfigurator "Welcher CRO-Stack passt zu dir?".',
        },
      ],
      gsc_rows: [
        { query: 'landingpage optimierung agentur', clicks: 3, impressions: 210, ctr: 0.014, position: 14.2 },
        { query: 'landingpage optimierung b2b', clicks: 0, impressions: 85, ctr: 0.0, position: 22.7 },
        { query: 'landingpage optimierung tools', clicks: 1, impressions: 340, ctr: 0.003, position: 11.8 },
        { query: 'landingpage optimierung checkliste', clicks: 12, impressions: 190, ctr: 0.063, position: 6.4 },
      ],
      search_queries: [
        { keyword: 'landingpage optimierung', search_volume: 260, source: 'seed_keyword' },
        { keyword: 'landingpage optimierung tools', search_volume: 340, source: 'gsc_near_miss' },
        { keyword: 'landingpage optimierung checkliste', search_volume: 190, source: 'gsc_near_miss' },
        { keyword: 'landingpage optimierung agentur', search_volume: 210, source: 'gsc_near_miss' },
        // Demonstriert den Positionierungs-Hinweis: höheres Suchvolumen bei
        // einem thematisch verwandten, aber anders formulierten Begriff.
        { keyword: 'conversion rate optimierung', search_volume: 480, source: 'related_keywords' },
      ],
      // Würde im echten Backend von _compute_positioning_insight (main.py)
      // berechnet, hier fürs Mock von Hand passend zu obigem Eintrag gesetzt.
      positioning_insight: {
        seed_keyword: 'landingpage optimierung',
        seed_volume: 260,
        suggested_keyword: 'conversion rate optimierung',
        suggested_volume: 480,
        factor: 1.8,
      },
      prompts: [
        { id: 'p1', phase: 'exploration', prompt_text: 'Was ist Landingpage-Optimierung?', prompt_type: 'stable_core', visibility_status: 'green' },
        { id: 'p2', phase: 'exploration', prompt_text: 'Warum konvertiert meine Landingpage nicht?', prompt_type: 'stable_core', visibility_status: 'red' },
        { id: 'p3', phase: 'exploration', prompt_text: 'Wie finde ich heraus, wo meine Landingpage schwächelt?', prompt_type: 'discovery', visibility_status: 'yellow' },
        { id: 'p4', phase: 'exploration', prompt_text: 'Landingpage-Optimierung Checkliste', prompt_type: 'stable_core', visibility_status: 'red' },
        { id: 'p5', phase: 'evaluation', prompt_text: 'Beste Tools für Landingpage-Optimierung im B2B-Bereich', prompt_type: 'stable_core', visibility_status: 'red' },
        { id: 'p6', phase: 'evaluation', prompt_text: 'Was kostet eine professionelle Landingpage-Optimierung?', prompt_type: 'stable_core', visibility_status: 'yellow' },
        { id: 'p7', phase: 'evaluation', prompt_text: 'Lohnt sich ein CRO-Tool oder reicht Google Analytics?', prompt_type: 'discovery', visibility_status: 'red' },
        { id: 'p8', phase: 'evaluation', prompt_text: 'Landingpage-Optimierung: Agentur vs. Inhouse', prompt_type: 'stable_core', visibility_status: 'red' },
        { id: 'p9', phase: 'comparison', prompt_text: 'Convertlyze vs. VWO für Landingpage-Optimierung', prompt_type: 'stable_core', visibility_status: 'red' },
        { id: 'p10', phase: 'comparison', prompt_text: 'Landingpage-Optimierung Software im Vergleich', prompt_type: 'stable_core', visibility_status: 'red' },
        { id: 'p11', phase: 'comparison', prompt_text: 'Unterschied zwischen A/B-Testing und CRO-Beratung', prompt_type: 'discovery', visibility_status: 'yellow' },
        { id: 'p12', phase: 'comparison', prompt_text: 'Welche Landingpage-Analyse-Tools sind DACH-kalibriert?', prompt_type: 'stable_core', visibility_status: 'green' },
        { id: 'p13', phase: 'decision', prompt_text: 'Landingpage-Optimierung für B2B SaaS beauftragen', prompt_type: 'stable_core', visibility_status: 'red' },
        { id: 'p14', phase: 'decision', prompt_text: 'Wie starte ich eine Landingpage-Analyse?', prompt_type: 'stable_core', visibility_status: 'yellow' },
        { id: 'p15', phase: 'decision', prompt_text: 'Landingpage-Optimierung ohne Agentur-Vertrag', prompt_type: 'discovery', visibility_status: 'red' },
        { id: 'p16', phase: 'decision', prompt_text: 'Kostenlose Landingpage-Analyse testen', prompt_type: 'stable_core', visibility_status: 'yellow' },
      ],
    },
    'topic-2': {
      topic: {
        id: 'topic-2',
        name: 'CRO Beratung',
        seed_keyword: 'cro beratung',
        own_domain: 'kunde-a.de',
        status: 'active',
        latest_summary: 'Für "CRO Beratung" seid ihr in der Decision-Phase sichtbar, VWO wird aber in derselben Phase deutlich häufiger empfohlen.',
      },
      opportunities: [
        { id: 'opp-5', type: 'ai_visible_competitor_dominates', description: 'Bei "cro beratung buchen" werdet ihr zwar erwähnt, aber VWO steht in der Antwort an erster Stelle, ihr an dritter.' },
      ],
      competitors: [
        { domain: 'vwo.com', citations: 2, phases: ['decision'] },
      ],
      gsc_rows: [
        { query: 'cro beratung agentur', clicks: 5, impressions: 120, ctr: 0.042, position: 9.1 },
      ],
      search_queries: [
        { keyword: 'cro beratung', search_volume: 90, source: 'seed_keyword' },
        { keyword: 'cro beratung agentur', search_volume: 120, source: 'gsc_near_miss' },
      ],
      prompts: [
        { id: 'p17', phase: 'decision', prompt_text: 'CRO Beratung buchen, worauf achten?', prompt_type: 'stable_core', visibility_status: 'yellow' },
      ],
    },
    // NEU: Demo-Einträge für 'collecting'/'error', damit die Vorschau die
    // neuen Banner in renderTopicDetailView überhaupt zeigen kann. Nur
    // Keywords vorhanden (typisch für den frühen Stand eines echten Laufs),
    // alles andere bewusst leer, um genau den Zustand nachzustellen, der
    // den Hinweis-Banner nötig gemacht hat.
    'topic-3': {
      topic: { id: 'topic-3', name: 'Conversion Funnel', status: 'collecting' },
      opportunities: [],
      content_ideas: [],
      positioning_insight: null,
      source_profiles: [],
      search_queries: [
        { keyword: 'conversion funnel b2b', search_volume: 70, source: 'seed_keyword' },
      ],
      competitors: [],
      gsc_rows: [],
      prompts: [],
    },
    'topic-4': {
      topic: { id: 'topic-4', name: 'SaaS Onboarding', status: 'error' },
      opportunities: [],
      content_ideas: [],
      positioning_insight: null,
      source_profiles: [],
      search_queries: [
        { keyword: 'saas onboarding optimierung', search_volume: 40, source: 'seed_keyword' },
      ],
      competitors: [],
      gsc_rows: [],
      prompts: [],
    },
  };

  // =========================================================================
  // MOCK-DATEN: Wöchentliche Sichtbarkeits-Entwicklung
  // =========================================================================
  // KOMPLETT ERFUNDEN. Es gibt aktuell KEINE Backend-Datenquelle dafür,
  // auch nicht ansatzweise (anders als z.B. bei competitors/gsc_rows, wo
  // wenigstens die Rohdaten in ai_sources/GSC existieren, nur nicht
  // aggregiert). Für echte Wochen-Historie müsste main.py bei jedem
  // /cron/weekly-Lauf einen Snapshot persistieren, das passiert aktuell
  // nicht, es wird nur der jeweils letzte Stand verwendet.
  var MOCK_DOMAIN_TREND = {
    'proj-1': {
      total_prompts: 17,
      weeks: [
        { week: '2026-07-13', visible_prompts: 2 },
        { week: '2026-07-20', visible_prompts: 2 },
        { week: '2026-07-27', visible_prompts: 3 },
        { week: '2026-08-03', visible_prompts: 3 },
        { week: '2026-08-10', visible_prompts: 4 },
        { week: '2026-08-17', visible_prompts: 4 },
        { week: '2026-08-24', visible_prompts: 5 },
        { week: '2026-08-31', visible_prompts: 5 },
      ],
    },
    'proj-2': { total_prompts: 0, weeks: [] },
  };

  // =========================================================================
  // MOCK-DATEN: Wettbewerber-Zitations-Verlauf (Logo-Zeitleiste)
  // =========================================================================
  // Im echten Backend kommt das aus GET /topics/{id}/competitor-citations
  // (main.py, _get_competitor_citation_trend), berechnet aus ECHTER
  // ai_runs/ai_sources-Historie, kein erfundener Wert wie beim
  // Sichtbarkeits-Trend oben. Hier nur als Mock, damit die UI unabhängig
  // vom Backend-Fortschritt gebaut werden kann. Jetzt (13.09.2026) mit
  // by_model/prompts angereichert, analog zum echten Backend.
  var MOCK_CITATION_TREND = {
    'topic-1': [
      { week: '2026-07-13', domains: [
        { domain: 'vwo.com', citations: 2, url: 'https://vwo.com/blog/cro-tools/', by_model: { chat_gpt: 1, gemini: 1 }, prompts: ['Beste Tools für Landingpage-Optimierung im B2B-Bereich'] },
        { domain: 'hubspot.de', citations: 1, url: 'https://hubspot.de/blog/landingpage-optimierung', by_model: { chat_gpt: 1 }, prompts: ['Was ist Landingpage-Optimierung?'] },
      ] },
      { week: '2026-07-20', domains: [
        { domain: 'vwo.com', citations: 2, url: 'https://vwo.com/blog/cro-tools/', by_model: { chat_gpt: 2 }, prompts: ['Beste Tools für Landingpage-Optimierung im B2B-Bereich'] },
        { domain: 'hubspot.de', citations: 1, url: 'https://hubspot.de/blog/landingpage-optimierung', by_model: { gemini: 1 }, prompts: ['Was ist Landingpage-Optimierung?'] },
        { domain: 'konversion.digital', citations: 1, url: 'https://konversion.digital/ratgeber/', by_model: { chat_gpt: 1 }, prompts: ['Warum konvertiert meine Landingpage nicht?'] },
      ] },
      { week: '2026-07-27', domains: [
        { domain: 'vwo.com', citations: 3, url: 'https://vwo.com/blog/cro-tools/', by_model: { chat_gpt: 2, gemini: 1 }, prompts: ['Beste Tools für Landingpage-Optimierung im B2B-Bereich', 'Convertlyze vs. VWO für Landingpage-Optimierung'] },
        { domain: 'konversion.digital', citations: 1, url: 'https://konversion.digital/ratgeber/', by_model: { chat_gpt: 1 }, prompts: ['Warum konvertiert meine Landingpage nicht?'] },
      ] },
      { week: '2026-08-03', domains: [
        { domain: 'vwo.com', citations: 2, url: 'https://vwo.com/blog/cro-tools/', by_model: { gemini: 2 }, prompts: ['Beste Tools für Landingpage-Optimierung im B2B-Bereich'] },
        { domain: 'hubspot.de', citations: 2, url: 'https://hubspot.de/blog/landingpage-optimierung', by_model: { chat_gpt: 1, gemini: 1 }, prompts: ['Was ist Landingpage-Optimierung?'] },
        { domain: 'diemarkenmacher.ch', citations: 1, url: 'https://diemarkenmacher.ch/insights/', by_model: { chat_gpt: 1 }, prompts: ['Landingpage-Optimierung: Agentur vs. Inhouse'] },
      ] },
    ],
  };

  // =========================================================================
  // STATE
  // =========================================================================
  var state = {
    memberstackId: null,
    memberToken:   null,
    projects:      [],
    activeProjectId: null,
    allTopics:     [],
    activeView:       'overview', // 'overview' | 'topic-detail'
    activeTopicId:    null,
    activeSubTab:     'uebersicht', // Tab innerhalb der jeweiligen Ansicht
    topicDetailCache: {},
    isLoadingDetail:  false,
    citationTrendCache: {},  // topicId -> weeks[], nur bei Bedarf geladen (siehe maybeLoadCitationTrend)
    isLoadingCitationTrend: false,
    showCreateForm: false,   // ob das "Neues Thema anlegen"-Formular gerade offen ist
    isCreating:     false,
    createError:    null,
    limitReached:   false,  // true, wenn der letzte Anlege-Versuch am Plan-Limit (403) gescheitert ist
    isBuyingSlot:   false,
    topicUsage:     null,   // { current_count, limit, can_create }, siehe loadTopicUsage
    pollTimer:      null,   // siehe maybeStartPolling
    retryingTopicId: null,  // Topic-ID, für die gerade ein Retry läuft, siehe retryTopic
    // NEU (13.09.2026): Zitationen je Prompt, direkt im Prompts-Tab
    // aufklappbar (nur Topic-Detailansicht, siehe togglePromptExpansion).
    promptCitationsCache: {},      // promptId -> { chat_gpt: [...], gemini: [...] } | null
    loadingPromptCitations: {},    // promptId -> bool
    expandedPromptId: null,        // nur ein Prompt gleichzeitig aufgeklappt
    expandedPromptEngine: {},      // promptId -> 'chat_gpt' | 'gemini'
    expandedPromptRunIndex: {},    // promptId -> Index im Lauf-Verlauf (0 = neuester)
    // NEU (13.09.2026): Keywords im selben Stil aufklappbar, aber ohne
    // Nachladen nötig (SERP-/GSC-Felder stecken schon in search_queries).
    keywordRankHistoryCache: {},   // keyword.id -> snapshots[] | null
    loadingKeywordRankHistory: {}, // keyword.id -> bool
    expandedKeywordId: null,       // nur ein Keyword gleichzeitig aufgeklappt (Kachel selbst)
    // NEU (13.09.2026): Rank-Historie ÜBER ALLE Keywords eines Topics
    // (kein ?keyword=-Filter), Grundlage für die übergreifende Grafik.
    topicRankHistoryCache: {},     // topicId -> snapshots[]
    isLoadingTopicRankHistory: false,
    // NEU (13.09.2026): Wochendetail, angestoßen durch Klick auf einen
    // Chart-Punkt/-Marker in der Übersicht (siehe showWeekDetail).
    weekDetailCache: {},           // "topicId|week" -> Detail-Objekt | null
    isLoadingWeekDetail: false,
    selectedWeekDetailKey: null,   // "topicId|week" der gerade offenen Kachel, oder null
    // GEÄNDERT (13.09.2026): Changelog kommt jetzt mit dem Topic-Detail
    // (siehe loadTopicDetail/detail.changelog), kein eigener Cache mehr
    // nötig, nur noch der Absende-Zustand fürs Formular.
    isSubmittingChangelog: false,
    // NEU (13.09.2026): zeigt standardmäßig nur die letzten 10 Einträge,
    // "Weitere anzeigen" erhöht pro Topic um jeweils 10.
    changelogVisibleCount: {},     // topicId -> Anzahl sichtbarer Einträge (Default 10)
    // NEU (13.09.2026): Soft-Delete/Archiv-Ansicht fürs Änderungsprotokoll.
    showDeletedChangelog: {},      // topicId -> bool, ob die Archiv-Liste offen ist
    deletedChangelogCache: {},     // topicId -> gelöschte Einträge[]
    isLoadingDeletedChangelog: false,
    changelogDraft: '',   // nur zum Überleben des Lade-Renders beim Absenden, siehe submitChangelogEntry
    // NEU (13.09.2026): eigener Sichtbarkeits-Verlauf über die Zeit, lazy
    // geladen wenn die Übersicht geöffnet wird (siehe maybeLoadVisibilityTrend).
    visibilityTrendCache: {},      // topicId -> weeks[]
    isLoadingVisibilityTrend: false,
  };

  // =========================================================================
  // HELPER: State-Lookups
  // =========================================================================
  function getProjectById(id) {
    return state.projects.filter(function (p) { return p.id === id; })[0] || null;
  }
  function getTopicById(id) {
    return state.allTopics.filter(function (t) { return t.id === id; })[0] || null;
  }

  function updateUrlParams(params) {
    var url = new URL(window.location.href);
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === null || value === undefined) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });
    window.history.replaceState({}, '', url);
  }

  // =========================================================================
  // INIT
  // =========================================================================
  async function init() {
    var memberstackId = null;

    try {
      var member = await window.$memberstackDom.getCurrentMember();
      memberstackId = (member && member.data && member.data.id) ? member.data.id : null;
      state.memberToken = await window.$memberstackDom.getMemberCookie();
    } catch (e) {
      console.error('[CVZ Visibility] Memberstack Fehler:', e);
    }

    if (!memberstackId) {
      showNoUserMessage();
      return;
    }

    state.memberstackId = memberstackId;

    try {
      await loadProjects();
      await loadTopics();
      await loadTopicUsage();
    } catch (e) {
      console.error('[CVZ Visibility] Daten konnten nicht geladen werden:', e);
      showErrorMessage('Deine Daten konnten nicht geladen werden. Bitte lade die Seite neu.');
      return;
    }

    maybeStartPolling();

    injectStyles();

    var paramTab = new URLSearchParams(window.location.search).get('cvz_tab');
    if (paramTab) state.activeSubTab = paramTab;

    // Deep-Link: wenn die URL bereits ein Topic referenziert (z.B. Reload
    // in der Detail-Ansicht, oder geteilter Link), direkt dort öffnen statt
    // erst auf der Übersicht zu landen.
    var paramTopicId = new URLSearchParams(window.location.search).get('cvz_topic');
    if (paramTopicId && getTopicById(paramTopicId)) {
      await openTopicDetail(paramTopicId, /* resetTab */ false);
      if (state.activeSubTab === 'wettbewerber') {
        maybeLoadCitationTrend(paramTopicId);
      }
      return;
    }

    render();
  }

  // =========================================================================
  // API-CALLS
  // =========================================================================
  async function apiFetch(path, options) {
    options = options || {};
    var headers = Object.assign(
      {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.memberToken,
      },
      options.headers || {}
    );

    var response = await fetch(CONFIG.apiBaseUrl + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      var errBody = {};
      try { errBody = await response.json(); } catch (e) {}
      var err = new Error(errBody.detail || errBody.error || ('Request fehlgeschlagen (' + response.status + ')'));
      err.status = response.status;
      err.code = errBody.code;
      throw err;
    }

    return response.json();
  }

  async function loadProjects() {
    var projects;
    if (CONFIG.useMockData) {
      projects = MOCK_PROJECTS;
    } else {
      var data = await apiFetch('/projects');
      projects = data.projects || [];
    }
    state.projects = projects;

    var paramProjectId = new URLSearchParams(window.location.search).get('cvz_project');
    var validParamProject = projects.some(function (p) { return p.id === paramProjectId; });
    if (validParamProject) {
      state.activeProjectId = paramProjectId;
    } else if (projects.length > 0) {
      state.activeProjectId = projects[0].id;
    }
  }

  async function loadTopics() {
    if (CONFIG.useMockData) {
      state.allTopics = MOCK_TOPICS;
      return;
    }
    var data = await apiFetch('/topics');
    state.allTopics = data.topics || [];
  }

  async function loadTopicUsage() {
    if (CONFIG.useMockData) {
      // Mock-Limit bewusst höher als die Anzahl der Mock-Topics gesetzt,
      // damit die Standard-Demo weiterhin normal anlegen kann. Zum Testen
      // des "Limit erreicht"-Zustands hier den Wert auf state.allTopics.length setzen.
      state.topicUsage = { current_count: state.allTopics.length, limit: 5, can_create: state.allTopics.length < 5 };
      return;
    }
    var data = await apiFetch('/account/topic-status');
    state.topicUsage = data;
  }

  // Läuft irgendein Thema noch (status='collecting'), alle paar Sekunden
  // GET /topics neu abfragen, bis alle fertig sind, statt den Nutzer manuell
  // neu laden zu lassen. Bewusst nur bei useMockData:false, im Mock-Modus
  // bleibt 'collecting' sowieso für immer stehen, das Pollen wäre sinnlos.
  function maybeStartPolling() {
    if (CONFIG.useMockData || state.pollTimer) return;

    var hasCollecting = state.allTopics.some(function (t) { return t.status === 'collecting'; });
    if (!hasCollecting) return;

    state.pollTimer = setInterval(async function () {
      try {
        await loadTopics();
        // Falls die gerade geöffnete Detail-Ansicht genau das Thema ist,
        // das inzwischen fertig ist: Cache verwerfen und neu laden, damit
        // aus "collecting"-Platzhalter echte Daten werden, ohne dass der
        // Nutzer den Tab wechseln oder neu laden muss.
        if (state.activeView === 'topic-detail' && state.activeTopicId) {
          var current = getTopicById(state.activeTopicId);
          if (current && current.status !== 'collecting' && state.topicDetailCache[state.activeTopicId]) {
            var cachedTopic = state.topicDetailCache[state.activeTopicId].topic;
            if (cachedTopic && cachedTopic.status === 'collecting') {
              delete state.topicDetailCache[state.activeTopicId];
              await openTopicDetail(state.activeTopicId, false);
            }
          }
        }
      } catch (e) {
        console.error('[CVZ Visibility] Polling fehlgeschlagen:', e);
      }

      var stillCollecting = state.allTopics.some(function (t) { return t.status === 'collecting'; });
      if (!stillCollecting) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
      }
      render();
    }, 5000);
  }

  async function loadTopicDetail(topicId) {
    if (CONFIG.useMockData) {
      return MOCK_TOPIC_DETAIL[topicId] || null;
    }
    var data = await apiFetch('/topics/' + topicId);
    return {
      topic: data.topic,
      opportunities: data.opportunities || [],
      content_ideas: data.content_ideas || [],
      positioning_insight: data.positioning_insight || null,
      source_profiles: data.source_profiles || [],
      // NEU (13.09.2026): Wettbewerber-Domains des Projekts, um die
      // Zitations-Auswertung auf echte Wettbewerber zu filtern statt auf
      // alle zitierten Quellen (siehe renderCompetitorInsightSection).
      competitor_domains: data.competitor_domains || [],
      // NEU (13.09.2026): dedizierte, themenweite Lücken-Analyse (siehe
      // gap_analysis.py), getrennt von der pro-Domain-Differenzierungs-
      // Idee in source_profiles.
      content_gaps: data.content_gaps || [],
      // NEU (13.09.2026): Stärken/Schwächen/Chancen pro Wettbewerber-
      // Domain, topic-spezifisch (siehe gap_analysis.py-Docstring, warum
      // getrennt von source_profiles).
      competitor_insights: data.competitor_insights || [],
      // GEÄNDERT (13.09.2026): Changelog kommt jetzt direkt mit dem
      // Topic-Detail statt per Lazy-Load (siehe Begründung im Chat vom
      // 13.09.: ein paar Textzeilen pro Topic, kein großer Datensatz wie
      // Zitations-/Sichtbarkeits-Verlauf). Dadurch überall verfügbar, auch
      // im Keywords-Tab für die Rank-Verlauf-Marker, nicht nur in der
      // Übersicht.
      changelog: data.changelog || [],
      search_queries: data.search_queries || [],
      competitors: [],
      gsc_rows: [],
      prompts: (data.prompts || []).map(function (p) {
        // GEÄNDERT (13.09.2026): Backend liefert die Phase als
        // "messymiddle_phase", renderPromptsByPhase gruppiert aber nach
        // "phase". Ohne dieses Mapping war der Prompts-Tab immer leer,
        // obwohl die Prompts im Backend längst vorhanden waren.
        // visibility_status kommt jetzt (13.09.2026) tatsächlich vom
        // Backend berechnet mit (siehe get_topic_detail in main.py),
        // vorher stand hier immer hart null.
        return Object.assign({ visibility_status: null }, p, { phase: p.messymiddle_phase || null });
      }),
    };
  }

  async function loadCompetitorCitationTrend(topicId) {
    if (CONFIG.useMockData) {
      return MOCK_CITATION_TREND[topicId] || [];
    }
    var data = await apiFetch('/topics/' + topicId + '/competitor-citations');
    return data.weeks || [];
  }

  async function maybeLoadCitationTrend(topicId) {
    if (!topicId || state.citationTrendCache[topicId]) return; // schon geladen oder gecacht
    state.isLoadingCitationTrend = true;
    render();
    try {
      state.citationTrendCache[topicId] = await loadCompetitorCitationTrend(topicId);
    } catch (e) {
      console.error('[CVZ Visibility] Zitations-Verlauf konnte nicht geladen werden:', e);
      state.citationTrendCache[topicId] = [];
    }
    state.isLoadingCitationTrend = false;
    render();
  }

  // NEU (13.09.2026): eigener Sichtbarkeits-Verlauf (own_domain_mentioned/
  // cited/recommended pro Woche), analog zum Wettbewerber-Zitations-
  // Verlauf, aber über /visibility-trend (main.py: _get_own_visibility_trend).
  async function loadVisibilityTrend(topicId) {
    if (CONFIG.useMockData) {
      return [];
    }
    var data = await apiFetch('/topics/' + topicId + '/visibility-trend');
    return data.weeks || [];
  }

  async function maybeLoadVisibilityTrend(topicId) {
    if (!topicId || state.visibilityTrendCache[topicId]) return;
    state.isLoadingVisibilityTrend = true;
    render();
    try {
      state.visibilityTrendCache[topicId] = await loadVisibilityTrend(topicId);
    } catch (e) {
      console.error('[CVZ Visibility] Sichtbarkeits-Verlauf konnte nicht geladen werden:', e);
      state.visibilityTrendCache[topicId] = [];
    }
    state.isLoadingVisibilityTrend = false;
    render();
  }

  // NEU (13.09.2026): Rank-Verlauf für ein einzelnes Keyword, lazy geladen
  // beim Aufklappen (siehe togglePromptExpansion-Pendant unten).
  async function loadKeywordRankHistory(topicId, keyword) {
    if (CONFIG.useMockData) return [];
    var data = await apiFetch('/topics/' + topicId + '/rank-history?keyword=' + encodeURIComponent(keyword));
    return data.snapshots || [];
  }

  // NEU (13.09.2026): Rank-Verlauf ÜBER ALLE Keywords (kein ?keyword=),
  // für die übergreifende Grafik in der Übersicht.
  async function loadTopicRankHistory(topicId) {
    if (CONFIG.useMockData) return [];
    var data = await apiFetch('/topics/' + topicId + '/rank-history');
    return data.snapshots || [];
  }

  async function maybeLoadTopicRankHistory(topicId) {
    if (!topicId || state.topicRankHistoryCache[topicId]) return;
    state.isLoadingTopicRankHistory = true;
    render();
    try {
      state.topicRankHistoryCache[topicId] = await loadTopicRankHistory(topicId);
    } catch (e) {
      console.error('[CVZ Visibility] Topic-weite Rank-Historie konnte nicht geladen werden:', e);
      state.topicRankHistoryCache[topicId] = [];
    }
    state.isLoadingTopicRankHistory = false;
    render();
  }

  // NEU (13.09.2026): Wochendetail (siehe main.py: /topics/{id}/week-detail),
  // angestoßen durch Klick auf einen Punkt/Marker im Übersicht-Chart.
  async function loadWeekDetail(topicId, week) {
    if (CONFIG.useMockData) return null;
    return apiFetch('/topics/' + topicId + '/week-detail?week=' + encodeURIComponent(week));
  }

  async function showWeekDetail(topicId, week) {
    var key = topicId + '|' + week;
    if (state.selectedWeekDetailKey === key) {
      state.selectedWeekDetailKey = null; // erneuter Klick auf denselben Punkt schließt wieder
      render();
      return;
    }
    state.selectedWeekDetailKey = key;
    if (!state.weekDetailCache[key]) {
      state.isLoadingWeekDetail = true;
      render();
      try {
        state.weekDetailCache[key] = await loadWeekDetail(topicId, week);
      } catch (e) {
        console.error('[CVZ Visibility] Wochendetail konnte nicht geladen werden:', e);
        state.weekDetailCache[key] = null;
      }
      state.isLoadingWeekDetail = false;
    }
    render();
  }

  async function toggleKeywordExpansion(topicId, keywordRowId, keywordText) {
    if (state.expandedKeywordId === keywordRowId) {
      state.expandedKeywordId = null;
      render();
      return;
    }
    state.expandedKeywordId = keywordRowId;
    if (!state.keywordRankHistoryCache[keywordRowId]) {
      state.loadingKeywordRankHistory[keywordRowId] = true;
      render();
      try {
        state.keywordRankHistoryCache[keywordRowId] = await loadKeywordRankHistory(topicId, keywordText);
      } catch (e) {
        console.error('[CVZ Visibility] Rank-Verlauf konnte nicht geladen werden:', e);
        state.keywordRankHistoryCache[keywordRowId] = [];
      }
      state.loadingKeywordRankHistory[keywordRowId] = false;
    }
    render();
  }

  async function submitChangelogEntry(topicId) {
    // GEÄNDERT (13.09.2026): liest den Wert direkt aus dem Textfeld (wie
    // submitCreateForm), aber merkt ihn sich zusätzlich kurz in
    // state.changelogDraft: der Klick auf "Absenden" löst selbst schon
    // einen render() für den Lade-Zustand aus, der würde das Textfeld
    // sonst sofort leeren, bevor überhaupt klar ist, ob das Speichern
    // geklappt hat.
    var textarea = document.getElementById('cvz-changelog-input');
    var entryText = ((textarea && textarea.value) || '').trim();
    if (!entryText || state.isSubmittingChangelog) return;

    state.changelogDraft = entryText;
    state.isSubmittingChangelog = true;
    render();

    try {
      if (CONFIG.useMockData) {
        var mockEntry = { id: 'entry-' + Date.now(), entry_text: entryText, author_name: null, created_at: new Date().toISOString() };
        _prependChangelogEntry(topicId, mockEntry);
      } else {
        var data = await apiFetch('/topics/' + topicId + '/changelog', {
          method: 'POST',
          body: { entry_text: entryText },
        });
        _prependChangelogEntry(topicId, data.entry);
      }
      state.changelogDraft = ''; // nur bei Erfolg leeren, bei Fehler bleibt der Entwurf erhalten
    } catch (e) {
      console.error('[CVZ Visibility] Changelog-Eintrag konnte nicht gespeichert werden:', e);
      // Bewusst kein showErrorMessage(): würde die komplette App
      // überschreiben, nur weil ein Formular-Submit fehlschlug. Entwurf
      // bleibt im Textfeld stehen, der Nutzer kann es erneut versuchen.
    }

    state.isSubmittingChangelog = false;
    render();
  }

  // NEU (13.09.2026): schreibt einen neu angelegten Eintrag direkt in den
  // bereits geladenen topicDetailCache (dort lebt detail.changelog jetzt,
  // siehe loadTopicDetail), es gibt keinen separaten Changelog-Cache mehr.
  function _prependChangelogEntry(topicId, entry) {
    var cached = state.topicDetailCache[topicId];
    if (!cached) return;
    cached.changelog = [entry].concat(cached.changelog || []);
  }

  // NEU (13.09.2026): Soft-Delete. Fragt kurz nach (native confirm reicht
  // hier, kein eigenes Modal nötig für eine wiederherstellbare Aktion),
  // entfernt den Eintrag danach aus der sichtbaren Liste.
  async function deleteChangelogEntry(topicId, entryId) {
    if (!window.confirm('Diesen Eintrag l\u00f6schen? Er bleibt ' + CHANGELOG_DELETED_RETENTION_DAYS + ' Tage lang unter "Gel\u00f6schte Eintr\u00e4ge" wiederherstellbar.')) {
      return;
    }
    try {
      await apiFetch('/topics/' + topicId + '/changelog/' + entryId, { method: 'DELETE' });
      var cached = state.topicDetailCache[topicId];
      if (cached && cached.changelog) {
        cached.changelog = cached.changelog.filter(function (e) { return e.id !== entryId; });
      }
      // Archiv-Cache verwerfen, damit er beim nächsten Öffnen den frisch
      // gelöschten Eintrag mit anzeigt, statt einen veralteten Stand zu zeigen.
      delete state.deletedChangelogCache[topicId];
    } catch (e) {
      console.error('[CVZ Visibility] Eintrag konnte nicht gel\u00f6scht werden:', e);
    }
    render();
  }

  // NEU (13.09.2026): macht einen Soft-Delete rückgängig. Baut den
  // wiederhergestellten Eintrag aus dem bereits geladenen Archiv-Cache
  // zusammen (der hat entry_text/author_name/created_at schon), kein
  // zusätzlicher Request nötig, um ihn zurück in die Hauptliste zu holen.
  async function restoreChangelogEntry(topicId, entryId) {
    try {
      await apiFetch('/topics/' + topicId + '/changelog/' + entryId + '/restore', { method: 'POST' });
      var deletedList = state.deletedChangelogCache[topicId] || [];
      var restored = deletedList.filter(function (e) { return e.id === entryId; })[0];
      state.deletedChangelogCache[topicId] = deletedList.filter(function (e) { return e.id !== entryId; });
      var cached = state.topicDetailCache[topicId];
      if (cached && restored) {
        cached.changelog = [
          { id: restored.id, entry_text: restored.entry_text, author_name: restored.author_name, created_at: restored.created_at },
        ].concat(cached.changelog || []).sort(function (a, b) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }
    } catch (e) {
      console.error('[CVZ Visibility] Eintrag konnte nicht wiederhergestellt werden:', e);
    }
    render();
  }

  // NEU (13.09.2026): Archiv-Ansicht auf-/zuklappen, lazy geladen beim
  // ersten Öffnen (siehe main.py: /topics/{id}/changelog/deleted).
  async function toggleDeletedChangelog(topicId) {
    state.showDeletedChangelog[topicId] = !state.showDeletedChangelog[topicId];
    if (state.showDeletedChangelog[topicId] && !state.deletedChangelogCache[topicId]) {
      state.isLoadingDeletedChangelog = true;
      render();
      try {
        var data = await apiFetch('/topics/' + topicId + '/changelog/deleted');
        state.deletedChangelogCache[topicId] = data.entries || [];
      } catch (e) {
        console.error('[CVZ Visibility] Gel\u00f6schte Eintr\u00e4ge konnten nicht geladen werden:', e);
        state.deletedChangelogCache[topicId] = [];
      }
      state.isLoadingDeletedChangelog = false;
    }
    render();
  }

  // =========================================================================
  // NEU (13.09.2026): Zitationen je Prompt (Antwort + Quellen, letzte
  // PROMPT_CITATION_RUN_LIMIT Läufe je Engine), lazy geladen beim Aufklappen
  // eines Prompts im Prompts-Tab. Nur in der Topic-Detailansicht nutzbar,
  // siehe renderPromptsByPhase(prompts, enableCitations).
  // =========================================================================
  async function loadPromptCitations(topicId, promptId) {
    if (CONFIG.useMockData) {
      // Mock-Modus liefert keine echten Läufe, siehe MOCK_TOPIC_DETAIL.
      // Leerer, aber gültiger Zustand, damit die UI nicht bricht.
      return { prompt_id: promptId, prompt_text: '', chat_gpt: [], gemini: [] };
    }
    return apiFetch('/topics/' + topicId + '/prompts/' + promptId + '/citations');
  }

  async function togglePromptExpansion(promptId) {
    if (state.expandedPromptId === promptId) {
      state.expandedPromptId = null;
      render();
      return;
    }
    state.expandedPromptId = promptId;
    if (!state.promptCitationsCache[promptId]) {
      state.loadingPromptCitations[promptId] = true;
      render();
      try {
        var data = await loadPromptCitations(state.activeTopicId, promptId);
        state.promptCitationsCache[promptId] = data;
        state.expandedPromptEngine[promptId] =
          (data.chat_gpt && data.chat_gpt.length) ? 'chat_gpt' :
          (data.gemini && data.gemini.length) ? 'gemini' : 'chat_gpt';
        state.expandedPromptRunIndex[promptId] = 0;
      } catch (e) {
        console.error('[CVZ Visibility] Prompt-Zitationen konnten nicht geladen werden:', e);
        state.promptCitationsCache[promptId] = null;
      }
      state.loadingPromptCitations[promptId] = false;
    }
    render();
  }

  async function openTopicDetail(topicId, resetTab) {
    if (resetTab !== false) state.activeSubTab = 'uebersicht';
    state.activeView = 'topic-detail';
    state.activeTopicId = topicId;
    var topic = getTopicById(topicId);
    if (topic) state.activeProjectId = topic.project_id;
    state.isLoadingDetail = true;
    updateUrlParams({ cvz_topic: topicId, cvz_project: state.activeProjectId, cvz_tab: resetTab !== false ? null : state.activeSubTab });
    render();

    try {
      if (!state.topicDetailCache[topicId]) {
        state.topicDetailCache[topicId] = await loadTopicDetail(topicId);
      }
    } catch (e) {
      console.error('[CVZ Visibility] Topic-Detail konnte nicht geladen werden:', e);
      state.topicDetailCache[topicId] = null;
    }

    state.isLoadingDetail = false;
    render();

    // GEÄNDERT (13.09.2026): Changelog lazy-load rausgenommen, kommt jetzt
    // direkt mit dem Topic-Detail (siehe loadTopicDetail). Sichtbarkeits-
    // und Rank-Verlauf bleiben lazy, siehe maybeLoadCitationTrend für den
    // Wettbewerber-Tab als Vorbild.
    if (state.activeSubTab === 'uebersicht') {
      maybeLoadVisibilityTrend(topicId);
      maybeLoadTopicRankHistory(topicId);
    }
  }

  function backToOverview() {
    state.activeView = 'overview';
    state.activeTopicId = null;
    state.activeSubTab = 'uebersicht';
    updateUrlParams({ cvz_topic: null, cvz_tab: null });
    render();
  }

  // Zentrale Auswahl-Funktion für die Such-Combobox: "project:<id>" zeigt
  // die Domain-Übersicht, "topic:<id>" springt direkt in die Detail-Ansicht.
  function selectFromPicker(rawValue) {
    var separatorIndex = rawValue.indexOf(':');
    var kind = rawValue.slice(0, separatorIndex);
    var id = rawValue.slice(separatorIndex + 1);

    if (kind === 'project') {
      state.activeProjectId = id;
      state.activeView = 'overview';
      state.activeTopicId = null;
      state.activeSubTab = 'uebersicht';
      updateUrlParams({ cvz_project: id, cvz_topic: null, cvz_tab: null });
      render();
    } else if (kind === 'topic') {
      openTopicDetail(id);
    }
  }

  var STATUS_LABELS = {
    active:     { label: 'Aktiv',         className: 'cvz-status-active' },
    collecting: { label: 'Sammelt Daten', className: 'cvz-status-collecting' },
    error:      { label: 'Fehler',        className: 'cvz-status-error' },
    archived:   { label: 'Archiviert',    className: 'cvz-status-archived' },
  };

  var OPPORTUNITY_TYPE_LABELS = {
    high_demand_low_visibility:      'Hohe Nachfrage, wenig Sichtbarkeit',
    competitor_citation:             'Wettbewerber wird zitiert',
    google_visible_ai_invisible:     'Google sichtbar, KI unsichtbar',
    ai_visible_competitor_dominates: 'KI-sichtbar, Wettbewerber dominiert',
    new_question:                    'Neue Frage entdeckt',
    near_miss_ranking:               'Knapp an Seite 1 vorbei',
  };

  var PHASE_LABELS = {
    exploration: 'Exploration',
    evaluation:  'Evaluation',
    comparison:  'Vergleich',
    decision:    'Entscheidung',
  };
  var PHASE_ORDER = ['exploration', 'evaluation', 'comparison', 'decision'];

  var VISIBILITY_LABELS = {
    green:  'Zitiert',
    yellow: 'Erwähnt, nicht zitiert',
    red:    'Nicht vorhanden',
  };

  // NEU (13.09.2026): für die dedizierte Lücken-Analyse (content_gaps).
  var GAP_PRIORITY_LABELS = {
    hoch:    'Hohe Priorität',
    mittel:  'Mittlere Priorität',
    niedrig: 'Niedrige Priorität',
  };

  // GEÄNDERT (13.09.2026): Die alten Keys 'gsc'/'keyword' existierten in
  // den echten Backend-Daten nie (die echten source-Werte sind
  // seed_keyword/related_keywords/keyword_ideas/keyword_suggestions/paa/
  // gsc_near_miss), deshalb zeigte die Keywords-Tabelle vorher überall
  // rohe technische Bezeichner statt Labels. Außerdem auf Wunsch
  // umgangssprachlicher benannt: "Primäres Keyword" statt "seed_keyword",
  // "Keyword-Idee" statt "related_keywords".
  // GEÄNDERT (13.09.2026): "paa" ergänzt um den ausdrücklichen Hinweis,
  // dass diese Fragen von Google kommen (People-Also-Ask aus der
  // organischen SERP, nicht von ChatGPT/Gemini), das war vorher aus dem
  // Label allein nicht ersichtlich.
  var KEYWORD_SOURCE_LABELS = {
    seed_keyword:         'Primäres Keyword',
    related_keywords:     'Keyword-Idee',
    keyword_ideas:        'Keyword-Idee',
    keyword_suggestions:  'Keyword-Idee',
    paa:                  'Häufig gefragt (von Google)',
    gsc_near_miss:        'Google Search Console',
  };

  // NEU (13.09.2026): für die Modell-Aufschlüsselung im Wettbewerber-Tab
  // und für die Engine-Tabs im aufgeklappten Prompt.
  var MODEL_LABELS = {
    chat_gpt: 'ChatGPT',
    gemini:   'Gemini',
  };

  var TOPIC_TABS = [
    { id: 'uebersicht', label: 'Übersicht' },
    { id: 'wettbewerber', label: 'Wettbewerber & Quellen' },
    { id: 'keywords', label: 'Keywords' },
    { id: 'prompts', label: 'Prompts' },
    { id: 'gsc', label: 'GSC-Performance' },
  ];

  var DOMAIN_TABS = [
    { id: 'uebersicht', label: 'Übersicht' },
    { id: 'wettbewerber', label: 'Wettbewerber & Quellen' },
    { id: 'keywords', label: 'Keywords' },
    { id: 'prompts', label: 'Prompts' },
    { id: 'themen', label: 'Themen' },
  ];

  // =========================================================================
  // UI: Dispatcher
  // =========================================================================
  function render() {
    var container = document.getElementById('cvz-visibility-app');
    if (!container) {
      console.error('[CVZ Visibility] Container #cvz-visibility-app nicht gefunden.');
      return;
    }

    container.innerHTML = '';
    if (state.activeView === 'topic-detail') {
      container.appendChild(renderTopicDetailView());
    } else {
      container.appendChild(renderOverview());
    }

    container.onclick = handleContainerClick;
  }

  function handleContainerClick(event) {
    var createToggle = event.target.closest('[data-cvz-create-toggle]');
    if (createToggle) {
      state.showCreateForm = !state.showCreateForm;
      state.createError = null;
      state.limitReached = false;
      render();
      return;
    }
    var createSubmit = event.target.closest('[data-cvz-create-submit]');
    if (createSubmit) {
      submitCreateForm();
      return;
    }
    var buySlot = event.target.closest('[data-cvz-buy-slot]');
    if (buySlot) {
      submitBuyTopicSlot();
      return;
    }
    // NEU (13.09.2026): Klicks innerhalb der aufgeklappten Prompt-Zitationen
    // (Lauf-Auswahl, Engine-Tab, Aufklappen/Zuklappen der Zeile selbst).
    // Bewusst VOR data-cvz-tab geprüft, alle drei sitzen strukturell nicht
    // ineinander verschachtelt, Reihenfolge ist hier unkritisch, aber so
    // bleiben verwandte Prompt-Handler beieinander.
    var runSelect = event.target.closest('[data-cvz-run-select]');
    if (runSelect) {
      var runOwner = runSelect.getAttribute('data-cvz-run-owner');
      state.expandedPromptRunIndex[runOwner] = parseInt(runSelect.getAttribute('data-cvz-run-select'), 10);
      render();
      return;
    }
    var engineTab = event.target.closest('[data-cvz-prompt-engine]');
    if (engineTab) {
      var engineOwner = engineTab.getAttribute('data-cvz-prompt-engine-owner');
      state.expandedPromptEngine[engineOwner] = engineTab.getAttribute('data-cvz-prompt-engine');
      state.expandedPromptRunIndex[engineOwner] = 0;
      render();
      return;
    }
    var promptToggle = event.target.closest('[data-cvz-prompt-toggle]');
    if (promptToggle) {
      togglePromptExpansion(promptToggle.getAttribute('data-cvz-prompt-toggle'));
      return;
    }
    // NEU (13.09.2026): Keyword-Zeilen im selben Auf-/Zuklapp-Stil.
    var keywordToggle = event.target.closest('[data-cvz-keyword-toggle]');
    if (keywordToggle) {
      toggleKeywordExpansion(
        state.activeTopicId,
        keywordToggle.getAttribute('data-cvz-keyword-toggle'),
        keywordToggle.getAttribute('data-cvz-keyword-text'),
      );
      return;
    }
    // NEU (13.09.2026): Changelog-Formular absenden.
    var changelogSubmit = event.target.closest('[data-cvz-changelog-submit]');
    if (changelogSubmit) {
      submitChangelogEntry(state.activeTopicId);
      return;
    }
    // NEU (13.09.2026): "Weitere anzeigen" im Änderungsprotokoll, zeigt
    // pro Klick 10 mehr, pro Topic getrennt gezählt.
    var changelogMore = event.target.closest('[data-cvz-changelog-more]');
    if (changelogMore) {
      var moreTopicId = changelogMore.getAttribute('data-cvz-changelog-more');
      state.changelogVisibleCount[moreTopicId] = (state.changelogVisibleCount[moreTopicId] || 10) + 10;
      render();
      return;
    }
    // NEU (13.09.2026): Changelog-Eintrag löschen/wiederherstellen, Archiv
    // auf-/zuklappen.
    var changelogDelete = event.target.closest('[data-cvz-changelog-delete]');
    if (changelogDelete) {
      deleteChangelogEntry(state.activeTopicId, changelogDelete.getAttribute('data-cvz-changelog-delete'));
      return;
    }
    var changelogRestore = event.target.closest('[data-cvz-changelog-restore]');
    if (changelogRestore) {
      restoreChangelogEntry(state.activeTopicId, changelogRestore.getAttribute('data-cvz-changelog-restore'));
      return;
    }
    var changelogToggleDeleted = event.target.closest('[data-cvz-changelog-toggle-deleted]');
    if (changelogToggleDeleted) {
      toggleDeletedChangelog(state.activeTopicId);
      return;
    }
    // NEU (13.09.2026): Klick auf einen Chart-Punkt/-Marker öffnet die
    // Wochendetail-Kachel (Prompts/Keywords/Changelog dieser Woche).
    var weekDetailPoint = event.target.closest('[data-cvz-week-detail]');
    if (weekDetailPoint) {
      showWeekDetail(state.activeTopicId, weekDetailPoint.getAttribute('data-cvz-week-detail'));
      return;
    }
    var weekDetailClose = event.target.closest('[data-cvz-week-detail-close]');
    if (weekDetailClose) {
      state.selectedWeekDetailKey = null;
      render();
      return;
    }
    var tabBtn = event.target.closest('[data-cvz-tab]');
    if (tabBtn) {
      var newTab = tabBtn.getAttribute('data-cvz-tab');
      state.activeSubTab = newTab;
      updateUrlParams({ cvz_tab: newTab });
      if (newTab === 'wettbewerber' && state.activeView === 'topic-detail') {
        maybeLoadCitationTrend(state.activeTopicId);
      }
      if (newTab === 'uebersicht' && state.activeView === 'topic-detail') {
        maybeLoadVisibilityTrend(state.activeTopicId);
        maybeLoadTopicRankHistory(state.activeTopicId);
      }
      render();
      return;
    }
    var pickerItem = event.target.closest('[data-cvz-picker-select]');
    if (pickerItem) {
      selectFromPicker(pickerItem.getAttribute('data-cvz-picker-select'));
      return;
    }
    var backBtn = event.target.closest('[data-cvz-back]');
    if (backBtn) {
      backToOverview();
      return;
    }
    var retryBtn = event.target.closest('[data-cvz-retry-topic]');
    if (retryBtn) {
      retryTopic(retryBtn.getAttribute('data-cvz-retry-topic'));
      return; // WICHTIG: vor der Zeilen-Navigation prüfen, der Button sitzt
              // innerhalb einer Zeile, die selbst auch data-cvz-topic-id trägt.
    }
    var topicCard = event.target.closest('[data-cvz-topic-id]');
    if (topicCard) {
      openTopicDetail(topicCard.getAttribute('data-cvz-topic-id'));
      return;
    }
  }

  function renderTabNav(tabs, activeTabId) {
    var nav = document.createElement('div');
    nav.className = 'cvz-tab-nav';
    tabs.forEach(function (tab) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cvz-tab-btn' + (tab.id === activeTabId ? ' cvz-tab-btn-active' : '');
      btn.setAttribute('data-cvz-tab', tab.id);
      btn.textContent = tab.label;
      nav.appendChild(btn);
    });
    return nav;
  }

  // =========================================================================
  // UI: Such-Combobox (Domain + Topic in einem Feld)
  // =========================================================================
  function renderProjectPicker() {
    var wrap = document.createElement('div');
    wrap.className = 'cvz-picker';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'cvz-picker-input';
    input.placeholder = 'Domain oder Thema suchen…';
    input.setAttribute('autocomplete', 'off');

    var activeProject = getProjectById(state.activeProjectId);
    var activeTopic = state.activeTopicId ? getTopicById(state.activeTopicId) : null;
    input.value = activeTopic ? activeTopic.name : (activeProject ? activeProject.domain : '');

    var dropdown = document.createElement('div');
    dropdown.className = 'cvz-picker-dropdown';
    dropdown.hidden = true;

    // Direkt an DIESES Input-Element gebunden statt über Event-Delegation
    // am Container, weil 'input'/'focus'/'blur' entweder gar nicht bubbeln
    // (focus/blur) oder bei jedem Tastendruck einen kompletten render()
    // auslösen würden, was den Cursor/Fokus im Feld zerstören würde.
    input.addEventListener('focus', function () {
      input.select();
      updatePickerDropdown(dropdown, '');
      dropdown.hidden = false;
    });
    input.addEventListener('input', function () {
      updatePickerDropdown(dropdown, input.value);
      dropdown.hidden = false;
    });
    input.addEventListener('blur', function () {
      // Kurze Verzögerung, sonst schließt das Dropdown, bevor der Klick
      // auf ein Ergebnis überhaupt ankommt (blur feuert vor click).
      setTimeout(function () { dropdown.hidden = true; }, 150);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        var firstItem = dropdown.querySelector('[data-cvz-picker-select]');
        if (firstItem) {
          selectFromPicker(firstItem.getAttribute('data-cvz-picker-select'));
          input.blur();
        }
      } else if (event.key === 'Escape') {
        input.blur();
      }
    });

    wrap.appendChild(input);
    wrap.appendChild(dropdown);
    return wrap;
  }

  function updatePickerDropdown(dropdown, query) {
    var q = query.trim().toLowerCase();

    var projectMatches = state.projects.filter(function (p) {
      return !q || p.name.toLowerCase().indexOf(q) !== -1 || p.domain.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8);

    var topicMatches = state.allTopics.filter(function (t) {
      return !q || t.name.toLowerCase().indexOf(q) !== -1 || t.seed_keyword.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8);

    dropdown.innerHTML = '';

    if (projectMatches.length === 0 && topicMatches.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cvz-picker-empty';
      empty.textContent = 'Keine Treffer.';
      dropdown.appendChild(empty);
      return;
    }

    if (projectMatches.length > 0) {
      var domainLabel = document.createElement('div');
      domainLabel.className = 'cvz-picker-group-label';
      domainLabel.textContent = 'Domains';
      dropdown.appendChild(domainLabel);

      projectMatches.forEach(function (project) {
        var item = document.createElement('div');
        item.className = 'cvz-picker-item';
        item.setAttribute('data-cvz-picker-select', 'project:' + project.id);
        item.innerHTML =
          '<span class="cvz-picker-item-title">' + escapeHtml(project.domain) + '</span>' +
          '<span class="cvz-picker-item-sub">' + escapeHtml(project.name) + '</span>';
        dropdown.appendChild(item);
      });
    }

    if (topicMatches.length > 0) {
      var topicLabel = document.createElement('div');
      topicLabel.className = 'cvz-picker-group-label';
      topicLabel.textContent = 'Themen';
      dropdown.appendChild(topicLabel);

      topicMatches.forEach(function (topic) {
        var parentProject = getProjectById(topic.project_id);
        var item = document.createElement('div');
        item.className = 'cvz-picker-item';
        item.setAttribute('data-cvz-picker-select', 'topic:' + topic.id);
        item.innerHTML =
          '<span class="cvz-picker-item-title">' + escapeHtml(topic.name) + '</span>' +
          '<span class="cvz-picker-item-sub">' + escapeHtml(parentProject ? parentProject.domain : '') + '</span>';
        dropdown.appendChild(item);
      });
    }
  }

  async function submitCreateForm() {
    var domainSelect = document.getElementById('cvz-create-domain-select');
    var newDomainInput = document.getElementById('cvz-create-domain-new');
    var topicInput = document.getElementById('cvz-create-topic');
    var topicText = (topicInput.value || '').trim();

    // Entweder eine bestehende Domain per Picklist gewählt (Wert = project_id),
    // oder "+ Neue Domain" mit Freitext daneben.
    var selectedValue = domainSelect.value;
    var isNewDomain = selectedValue === '__new__';
    var newDomainText = (newDomainInput.value || '').trim();

    if ((isNewDomain && !newDomainText) || !topicText) {
      state.createError = isNewDomain
        ? 'Bitte neue Domain und Thema ausf\u00fcllen.'
        : 'Bitte Thema ausf\u00fcllen.';
      render();
      return;
    }

    state.isCreating = true;
    state.createError = null;
    render();

    try {
      var project;
      if (isNewDomain) {
        // Freitext-Fall: nur hier überhaupt ein neues Projekt anlegen, bei
        // Auswahl aus der Picklist existiert es per Definition schon.
        if (CONFIG.useMockData) {
          project = { id: 'proj-' + Date.now(), name: newDomainText, domain: newDomainText };
        } else {
          var projectData = await apiFetch('/projects', {
            method: 'POST',
            body: { name: newDomainText, domain: newDomainText, language_code: 'de', location_name: 'Germany' },
          });
          project = { id: projectData.project_id, name: newDomainText, domain: newDomainText };
        }
        state.projects.push(project);
      } else {
        project = getProjectById(selectedValue);
        if (!project) {
          state.isCreating = false;
          state.createError = 'Ausgewählte Domain nicht gefunden, bitte Seite neu laden.';
          render();
          return;
        }
      }

      var newTopic;
      if (CONFIG.useMockData) {
        newTopic = { id: 'topic-' + Date.now(), project_id: project.id, name: topicText, seed_keyword: topicText, status: 'collecting', opportunities_count: 0 };
      } else {
        // sample_prompts bewusst leer: löst die automatische Stable-Core-
        // Generierung im Backend aus (siehe prompt_discovery.py), statt
        // dass wir hier im Formular 16 Prompts von Hand abfragen müssten.
        var topicData = await apiFetch('/topics', {
          method: 'POST',
          body: { project_id: project.id, topic_name: topicText, seed_keyword: topicText, sample_prompts: [] },
        });
        newTopic = { id: topicData.topic_id, project_id: project.id, name: topicText, seed_keyword: topicText, status: 'collecting', opportunities_count: 0 };
      }
      state.allTopics.push(newTopic);
      state.activeProjectId = project.id;

      // Nutzungsstand lokal nachziehen, damit das Formular beim nächsten
      // Öffnen sofort den richtigen Zustand zeigt, ohne erst neu laden zu
      // müssen (bei useMockData:false wäre ein Refetch zwar korrekter,
      // aber unnötig, current_count hat sich ja genau um 1 erhöht).
      if (state.topicUsage) {
        state.topicUsage.current_count += 1;
        state.topicUsage.can_create = state.topicUsage.current_count < state.topicUsage.limit;
      }

      state.isCreating = false;
      state.showCreateForm = false;
      maybeStartPolling(); // neues Thema ist 'collecting', Live-Nachladen anstoßen
      openTopicDetail(newTopic.id); // Detailansicht zeigt "collecting", bis der Hintergrundlauf fertig ist, das ist erwartetes Verhalten
    } catch (e) {
      console.error('[CVZ Visibility] Anlegen fehlgeschlagen:', e);
      state.isCreating = false;
      if (e.status === 403) {
        // check_topic_limit() im Backend wirft genau das bei erreichtem
        // Plan-Limit, e.message enthält dank des apiFetch-Fixes jetzt den
        // echten Backend-Text (inkl. aktuellem Stand, z.B. "3/3").
        state.createError = e.message;
        state.limitReached = true;
      } else {
        state.createError = 'Anlegen fehlgeschlagen: ' + (e.message || 'Unbekannter Fehler');
        state.limitReached = false;
      }
      render();
    }
  }

  async function retryTopic(topicId) {
    if (CONFIG.useMockData) {
      // Mock-Fall: sowohl die Listen- als auch die Detail-Cache-Kopie
      // aktualisieren, das sind im Mock zwei getrennte Objekte (echtes
      // Backend hätte natürlich nur eine Quelle der Wahrheit).
      var mockTopic = getTopicById(topicId);
      if (mockTopic) mockTopic.status = 'active';
      if (state.topicDetailCache[topicId]) state.topicDetailCache[topicId].topic.status = 'active';
      render();
      return;
    }

    state.retryingTopicId = topicId;
    render();

    try {
      await apiFetch('/topics/' + topicId + '/retry', { method: 'POST' });
      await loadTopics(); // Status ist jetzt 'collecting', Tabelle soll das sofort zeigen
      maybeStartPolling();
    } catch (e) {
      console.error('[CVZ Visibility] Retry fehlgeschlagen f\u00fcr Topic ' + topicId + ':', e);
      // Bewusst KEIN showErrorMessage() hier, das würde die komplette App
      // überschreiben, nur weil ein einzelner Retry-Klick fehlschlug. Status
      // bleibt serverseitig 'error' (falls die PATCH-Query nicht durchkam)
      // oder 'collecting' (falls sie durchkam, aber der Rest scheiterte),
      // ein erneuter Klick ist in beiden Fällen sicher möglich.
    }

    state.retryingTopicId = null;
    render();
  }

  async function submitBuyTopicSlot() {
    state.isBuyingSlot = true;
    render();

    try {
      var response = await fetch(CONFIG.stripeCheckoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberstack_token: state.memberToken, quantity: 1 }),
      });
      var data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.detail || ('Checkout fehlgeschlagen (' + response.status + ')'));
      }

      if (data.mode === 'checkout_created' && data.checkout_url) {
        window.location.href = data.checkout_url; // Erstkauf: zu Stripe weiterleiten
        return;
      }
      if (data.mode === 'quantity_updated') {
        // Nachkauf: sofort bestätigt, kein Redirect nötig. Limit-Fehler
        // zurücksetzen UND topicUsage neu laden (nicht nur lokal
        // hochzählen, der neue Grenzwert kommt ja vom Server/Stripe, den
        // kennen wir hier nicht sicher), damit die Vorab-Sperre im
        // Formular sofort wieder aufgehoben ist.
        state.limitReached = false;
        state.createError = 'Slot gekauft (jetzt ' + data.new_quantity + ' insgesamt).';
        try {
          await loadTopicUsage();
        } catch (e) {
          console.error('[CVZ Visibility] Nutzungsstand konnte nach Kauf nicht neu geladen werden:', e);
        }
      }
    } catch (e) {
      console.error('[CVZ Visibility] Slot-Kauf fehlgeschlagen:', e);
      state.createError = 'Slot-Kauf fehlgeschlagen: ' + (e.message || 'Unbekannter Fehler');
    }

    state.isBuyingSlot = false;
    render();
  }

  function renderCreateTopicForm() {
    var wrap = document.createElement('div');
    wrap.className = 'cvz-create-form';

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'cvz-create-toggle-btn';
    toggleBtn.setAttribute('data-cvz-create-toggle', '');
    toggleBtn.textContent = state.showCreateForm ? '\u2212 Formular schlie\u00dfen' : '+ Neues Thema anlegen';
    wrap.appendChild(toggleBtn);

    if (!state.showCreateForm) return wrap;

    var form = document.createElement('div');
    form.className = 'cvz-create-form-fields';

    // NEU: Wenn wir schon VOR jedem Anlege-Versuch wissen, dass kein Platz
    // mehr ist (state.topicUsage von loadTopicUsage), zeigen wir gar nicht
    // erst die Eingabefelder, sondern direkt Meldung + Kauf-Button. Der
    // Nutzer kann so gar nicht erst auf "Anlegen" klicken, um dann einen
    // Fehler zu bekommen, das war der Wunsch.
    var limitReachedUpfront = state.topicUsage && !state.topicUsage.can_create && !state.limitReached;
    if (limitReachedUpfront) {
      var upfrontMsg = document.createElement('p');
      upfrontMsg.className = 'cvz-create-error';
      upfrontMsg.textContent =
        'Euer Plan-Limit ist erreicht (' + state.topicUsage.current_count + '/' + state.topicUsage.limit + '). ' +
        'Weiteres Topic-Slot nötig, um ein neues Thema anzulegen.';
      form.appendChild(upfrontMsg);

      var upfrontBuyBtn = document.createElement('button');
      upfrontBuyBtn.type = 'button';
      upfrontBuyBtn.className = 'cvz-create-buy-btn';
      upfrontBuyBtn.setAttribute('data-cvz-buy-slot', '');
      upfrontBuyBtn.disabled = state.isBuyingSlot;
      upfrontBuyBtn.textContent = state.isBuyingSlot ? 'Wird bearbeitet \u2026' : '+ 1 Topic-Slot kaufen';
      form.appendChild(upfrontBuyBtn);

      wrap.appendChild(form);
      return wrap;
    }

    var domainSelect = document.createElement('select');
    domainSelect.id = 'cvz-create-domain-select';
    domainSelect.className = 'cvz-create-input';

    state.projects.forEach(function (project) {
      var option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.domain;
      if (project.id === state.activeProjectId) option.selected = true;
      domainSelect.appendChild(option);
    });

    var newOption = document.createElement('option');
    newOption.value = '__new__';
    newOption.textContent = '+ Neue Domain';
    // Wenn's noch gar keine Domain gibt (allererstes Projekt überhaupt),
    // ist "+ Neue Domain" automatisch die einzig sinnvolle Vorauswahl.
    if (state.projects.length === 0) newOption.selected = true;
    domainSelect.appendChild(newOption);

    var newDomainInput = document.createElement('input');
    newDomainInput.type = 'text';
    newDomainInput.id = 'cvz-create-domain-new';
    newDomainInput.className = 'cvz-create-input';
    newDomainInput.placeholder = 'Neue Domain (z.B. kunde-c.de)';
    // Nur sichtbar, wenn "+ Neue Domain" ausgewählt ist, siehe Listener unten.
    newDomainInput.style.display = (domainSelect.value === '__new__') ? '' : 'none';

    domainSelect.addEventListener('change', function () {
      newDomainInput.style.display = (domainSelect.value === '__new__') ? '' : 'none';
      if (domainSelect.value === '__new__') newDomainInput.focus();
    });

    var topicInput = document.createElement('input');
    topicInput.type = 'text';
    topicInput.id = 'cvz-create-topic';
    topicInput.className = 'cvz-create-input';
    topicInput.placeholder = 'Thema / Seed-Keyword (z.B. landingpage optimierung)';

    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'cvz-create-submit-btn';
    submitBtn.setAttribute('data-cvz-create-submit', '');
    submitBtn.disabled = state.isCreating;
    submitBtn.textContent = state.isCreating ? 'Wird angelegt \u2026' : 'Anlegen';

    form.appendChild(domainSelect);
    form.appendChild(newDomainInput);
    form.appendChild(topicInput);
    form.appendChild(submitBtn);

    if (state.createError) {
      var err = document.createElement('p');
      err.className = 'cvz-create-error';
      err.textContent = state.createError;
      form.appendChild(err);

      if (state.limitReached) {
        var buyBtn = document.createElement('button');
        buyBtn.type = 'button';
        buyBtn.className = 'cvz-create-buy-btn';
        buyBtn.setAttribute('data-cvz-buy-slot', '');
        buyBtn.disabled = state.isBuyingSlot;
        buyBtn.textContent = state.isBuyingSlot ? 'Wird bearbeitet \u2026' : '+ 1 Topic-Slot kaufen';
        form.appendChild(buyBtn);
      }
    }

    wrap.appendChild(form);
    return wrap;
  }

  // =========================================================================
  // UI: Ebene 1+2 (Domain-Dashboard, aggregiert über alle Themen der Domain)
  // =========================================================================
  function renderOverview() {
    var wrap = document.createElement('div');
    wrap.appendChild(renderProjectPicker());
    var usageBadge = renderTopicUsageBadge();
    if (usageBadge) wrap.appendChild(usageBadge);
    wrap.appendChild(renderCreateTopicForm());
    wrap.appendChild(renderDomainDashboard(getProjectById(state.activeProjectId)));
    return wrap;
  }

  function renderTopicUsageBadge() {
    if (!state.topicUsage) return null;
    var available = Math.max(0, state.topicUsage.limit - state.topicUsage.current_count);
    var badge = document.createElement('p');
    badge.className = 'cvz-topic-usage-badge';
    badge.textContent =
      'Team-weit: ' + state.topicUsage.current_count + ' von ' + state.topicUsage.limit +
      ' Themen genutzt \u00b7 ' + available + ' verf\u00fcgbar';
    return badge;
  }

  // NUR MOCK: aggregiert MOCK_TOPIC_DETAIL über alle Themen einer Domain.
  // Für useMockData:false gibt's dafür noch KEINE echte Implementierung,
  // weil eine korrekte Aggregation einen eigenen Backend-Endpunkt braucht
  // (client-seitiges Zusammenrechnen über N einzelne GET /topics/{id}-
  // Aufrufe wäre bei vielen Themen langsam und teuer, siehe Chat-Verlauf).
  function getDomainDashboardData(projectId) {
    var topics = state.allTopics.filter(function (t) { return t.project_id === projectId; });
    var opportunities = [];
    var contentIdeas = [];
    var positioningInsights = [];
    var sourceProfileMap = {};
    var competitorMap = {};
    var keywordMap = {};
    var prompts = [];

    topics.forEach(function (topic) {
      var detail = MOCK_TOPIC_DETAIL[topic.id];
      if (!detail) return;

      (detail.opportunities || []).forEach(function (opp) {
        opportunities.push(Object.assign({ topic_name: topic.name }, opp));
      });

      (detail.content_ideas || []).forEach(function (idea) {
        contentIdeas.push(Object.assign({ topic_name: topic.name }, idea));
      });

      if (detail.positioning_insight) {
        positioningInsights.push(Object.assign({ topic_name: topic.name }, detail.positioning_insight));
      }

      // Pro Domain nur einmal, die Analyse ist domainweit gecacht, nicht
      // pro Topic unterschiedlich, mehrfaches Anzeigen wäre nur Duplikat.
      (detail.source_profiles || []).forEach(function (profile) {
        if (!sourceProfileMap[profile.domain]) {
          sourceProfileMap[profile.domain] = profile;
        }
      });

      (detail.competitors || []).forEach(function (comp) {
        if (!competitorMap[comp.domain]) {
          competitorMap[comp.domain] = { domain: comp.domain, citations: 0, phasesSet: {} };
        }
        competitorMap[comp.domain].citations += comp.citations;
        (comp.phases || []).forEach(function (phase) { competitorMap[comp.domain].phasesSet[phase] = true; });
      });

      // Dedupe über Themen hinweg: dasselbe Keyword kann bei zwei Themen
      // auftauchen (z.B. weil beide Themen thematisch überlappen), dann
      // zählt der höhere Suchvolumen-Wert.
      (detail.search_queries || []).forEach(function (kw) {
        if (!keywordMap[kw.keyword] || (kw.search_volume || 0) > (keywordMap[kw.keyword].search_volume || 0)) {
          keywordMap[kw.keyword] = kw;
        }
      });

      (detail.prompts || []).forEach(function (p) {
        prompts.push(Object.assign({ topic_name: topic.name }, p));
      });
    });

    var competitors = Object.keys(competitorMap).map(function (domain) {
      var entry = competitorMap[domain];
      return { domain: entry.domain, citations: entry.citations, phases: Object.keys(entry.phasesSet) };
    }).sort(function (a, b) { return b.citations - a.citations; });

    var keywords = Object.keys(keywordMap).map(function (k) { return keywordMap[k]; })
      .sort(function (a, b) { return (b.search_volume || 0) - (a.search_volume || 0); });

    return {
      topics: topics, opportunities: opportunities, contentIdeas: contentIdeas,
      positioningInsights: positioningInsights, sourceProfiles: Object.values(sourceProfileMap),
      competitors: competitors, keywords: keywords, prompts: prompts,
    };
  }

  function renderDomainDashboard(project) {
    var wrap = document.createElement('div');

    if (!project) {
      var emptyMsg = document.createElement('p');
      emptyMsg.className = 'cvz-card-placeholder-text';
      emptyMsg.textContent = 'Keine Domain ausgewählt.';
      wrap.appendChild(emptyMsg);
      return wrap;
    }

    var data = getDomainDashboardData(project.id);

    var header = document.createElement('div');
    header.className = 'cvz-domain-header';
    header.innerHTML =
      '<h3 class="cvz-section-title">' + escapeHtml(project.name) + '</h3>' +
      '<p class="cvz-card-eyebrow">' + escapeHtml(project.domain) + '</p>';
    wrap.appendChild(header);

    wrap.appendChild(renderTabNav(DOMAIN_TABS, state.activeSubTab));

    var tabContent = document.createElement('div');
    tabContent.className = 'cvz-tab-content';

    switch (state.activeSubTab) {
      case 'wettbewerber':
        tabContent.appendChild(renderDomainCompetitorTable(data.competitors));
        tabContent.appendChild(renderSourceProfilesSection(data.sourceProfiles));
        break;
      case 'keywords':
        tabContent.appendChild(renderKeywordsTable(data.keywords, false));
        var domainPositioning = renderPositioningInsightsList(data.positioningInsights);
        if (domainPositioning) tabContent.appendChild(domainPositioning);
        break;
      case 'prompts':
        // enableCitations=false: die Domain-Übersicht aggregiert Prompts
        // über mehrere Topics hinweg (siehe getDomainDashboardData), ein
        // einzelner Prompt hier hat kein eindeutiges topic_id mehr, das
        // der /citations-Endpoint bräuchte. Aufklappen nur in der
        // Topic-Detailansicht (siehe renderTopicDetailView weiter unten).
        tabContent.appendChild(renderPromptsByPhase(data.prompts, false));
        break;
      case 'themen':
        tabContent.appendChild(renderTopicStatusTable(data.topics));
        break;
      case 'uebersicht':
      default:
        tabContent.appendChild(renderTrendChart(MOCK_DOMAIN_TREND[project.id]));
        tabContent.appendChild(renderDomainOpportunitySection(data.opportunities));
        tabContent.appendChild(renderContentIdeasSection(data.contentIdeas));
        break;
    }

    wrap.appendChild(tabContent);
    return wrap;
  }

  function renderDomainOpportunitySection(opportunities) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Opportunities über alle Themen dieser Domain';
    section.appendChild(heading);

    if (opportunities.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Aktuell keine offenen Opportunities für diese Domain.';
      section.appendChild(empty);
      return section;
    }

    var grid = document.createElement('div');
    grid.className = 'cvz-opportunity-grid';
    opportunities.forEach(function (opp) {
      var card = document.createElement('div');
      card.className = 'cvz-card cvz-opportunity-card';
      card.innerHTML =
        '<p class="cvz-opportunity-type">' + escapeHtml(OPPORTUNITY_TYPE_LABELS[opp.type] || opp.type) + '</p>' +
        '<p class="cvz-opportunity-description">' + escapeHtml(opp.description || '') + '</p>' +
        '<p class="cvz-opportunity-topic">' + escapeHtml(opp.topic_name) + '</p>';
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  function renderTopicStatusTable(topics) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Themen in dieser Domain';
    section.appendChild(heading);

    if (topics.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Für diese Domain gibt es noch keine Themen.';
      section.appendChild(empty);
      return section;
    }

    var table = document.createElement('table');
    table.className = 'cvz-table cvz-table-clickable';
    table.innerHTML = '<thead><tr><th>Thema</th><th>Status</th><th>Gestartet</th><th>Opportunities</th></tr></thead>';
    var tbody = document.createElement('tbody');
    topics.forEach(function (topic) {
      var status = STATUS_LABELS[topic.status] || { label: topic.status, className: '' };
      var tr = document.createElement('tr');
      tr.setAttribute('data-cvz-topic-id', topic.id);
      tr.innerHTML =
        '<td>' + escapeHtml(topic.name) + '</td>' +
        '<td><span class="cvz-status-badge ' + status.className + '">' +
          (topic.status === 'collecting' ? '<span class="cvz-spinner"></span>' : '') +
          status.label + '</span>' +
          (topic.status === 'collecting' ? '<span class="cvz-status-hint">Kann bis zu 60 Sek. dauern</span>' : '') +
          (topic.status === 'error' ? (
            '<button type="button" class="cvz-retry-btn" data-cvz-retry-topic="' + topic.id + '"' +
              (state.retryingTopicId === topic.id ? ' disabled' : '') + '>' +
              (state.retryingTopicId === topic.id ? 'Wird erneut versucht \u2026' : 'Erneut versuchen') +
            '</button>'
          ) : '') +
        '</td>' +
        '<td>' + formatRelativeTime(topic.created_at) + '</td>' +
        '<td>' + (topic.opportunities_count === null ? '\u2013' : escapeHtml(topic.opportunities_count)) + '</td>';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  // =========================================================================
  // UI: Ebene 3 (Topic-Detail)
  // =========================================================================
  function renderTopicDetailView() {
    var wrap = document.createElement('div');

    wrap.appendChild(renderProjectPicker());

    var backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'cvz-back-btn';
    backBtn.setAttribute('data-cvz-back', '');
    backBtn.textContent = '← Zur Domain-Übersicht';
    wrap.appendChild(backBtn);

    if (state.isLoadingDetail) {
      var loading = document.createElement('p');
      loading.className = 'cvz-card-placeholder-text';
      loading.textContent = 'Lädt...';
      wrap.appendChild(loading);
      return wrap;
    }

    var detail = state.topicDetailCache[state.activeTopicId];
    if (!detail) {
      var errorMsg = document.createElement('div');
      errorMsg.className = 'cvz-card cvz-card-placeholder';
      errorMsg.innerHTML = '<p class="cvz-card-placeholder-text">Für dieses Thema liegen noch keine Detaildaten vor (Status noch nicht "Aktiv", oder ein Ladefehler ist aufgetreten).</p>';
      wrap.appendChild(errorMsg);
      return wrap;
    }

    wrap.appendChild(renderSummaryCard(detail.topic));

    if (detail.topic.status === 'collecting') {
      // Bewusst KEINE Tabs/Tab-Inhalte rendern, solange noch gesammelt wird,
      // die wären ohnehin größtenteils leer und würden nur wie ein Fehler
      // aussehen ("überall steht leer"). Stattdessen nur der Banner mit
      // Spinner, das war explizit der Wunsch.
      var loadingBanner = document.createElement('div');
      loadingBanner.className = 'cvz-card cvz-collecting-banner';
      loadingBanner.innerHTML =
        '<p class="cvz-collecting-banner-text">' +
          '<span class="cvz-spinner"></span>' +
          'Erster Datenlauf l\u00e4uft noch, kann bis zu 60 Sekunden dauern. ' +
          'Diese Seite aktualisiert sich automatisch, sobald der Lauf fertig ist.' +
        '</p>';
      wrap.appendChild(loadingBanner);
      return wrap;
    }

    if (detail.topic.status === 'error') {
      var errorBanner = document.createElement('div');
      errorBanner.className = 'cvz-card cvz-collecting-banner cvz-error-banner';
      errorBanner.innerHTML =
        '<p class="cvz-collecting-banner-text">' +
          '\u26a0\ufe0f Der Datenlauf f\u00fcr dieses Thema ist fehlgeschlagen. Bereits gesammelte Daten unten ' +
          'k\u00f6nnen unvollst\u00e4ndig sein.' +
        '</p>' +
        '<button type="button" class="cvz-retry-btn" data-cvz-retry-topic="' + detail.topic.id + '"' +
          (state.retryingTopicId === detail.topic.id ? ' disabled' : '') + '>' +
          (state.retryingTopicId === detail.topic.id ? 'Wird erneut versucht \u2026' : 'Erneut versuchen') +
        '</button>';
      wrap.appendChild(errorBanner);
    }

    wrap.appendChild(renderTabNav(TOPIC_TABS, state.activeSubTab));

    var tabContent = document.createElement('div');
    tabContent.className = 'cvz-tab-content';

    switch (state.activeSubTab) {
      case 'wettbewerber':
        // GEÄNDERT (13.09.2026): Favicon-Wand raus (Favicons sitzen jetzt
        // im Prompts-Tab direkt neben den Quellen, siehe
        // renderPromptExpansion). Zitations-Tabelle und Quellen-Analyse
        // sind zu EINER Ansicht zusammengeführt: häufigste ECHTE
        // Wettbewerber (gefiltert auf detail.competitor_domains) inkl.
        // ihrer Stärken und eurer Differenzierungs-Chance.
        var weeksData = state.citationTrendCache[state.activeTopicId];
        tabContent.appendChild(renderCompetitorInsightSection(weeksData, state.isLoadingCitationTrend, detail.source_profiles, detail.competitor_domains, detail.competitor_insights));
        tabContent.appendChild(renderContentGapsSection(detail.content_gaps));
        break;
      case 'keywords':
        tabContent.appendChild(renderKeywordsTable(detail.search_queries, true, detail.changelog));
        var positioning = renderPositioningInsight(detail.positioning_insight);
        if (positioning) tabContent.appendChild(positioning);
        break;
      case 'prompts':
        // enableCitations=true: nur hier ist jedem Prompt eindeutig SEIN
        // Topic (state.activeTopicId) zugeordnet, das der /citations-
        // Endpoint braucht. Siehe renderPromptsByPhase.
        tabContent.appendChild(renderPromptsByPhase(detail.prompts, true));
        break;
      case 'gsc':
        tabContent.appendChild(renderGscBlock(detail.gsc_rows));
        break;
      case 'uebersicht':
      default:
        // GEÄNDERT (13.09.2026): detail.changelog kommt jetzt fest mit dem
        // Topic-Detail (kein eigener Lazy-Load-Cache mehr, siehe
        // loadTopicDetail). Sichtbarkeits- und Rank-Verlauf bleiben lazy.
        tabContent.appendChild(renderCombinedTrendSection(
          state.visibilityTrendCache[state.activeTopicId],
          state.topicRankHistoryCache[state.activeTopicId],
          detail.changelog,
          state.isLoadingVisibilityTrend || state.isLoadingTopicRankHistory,
        ));
        tabContent.appendChild(renderVisibilityTrendSection(
          state.visibilityTrendCache[state.activeTopicId], state.isLoadingVisibilityTrend,
          detail.changelog,
        ));
        tabContent.appendChild(renderOpportunitySection(detail.opportunities));
        tabContent.appendChild(renderContentIdeasSection(detail.content_ideas));
        tabContent.appendChild(renderChangelogSection(detail.changelog, state.activeTopicId));
        break;
    }

    wrap.appendChild(tabContent);
    return wrap;
  }

  function renderTrendChart(trendData) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Sichtbarkeits-Entwicklung über die Wochen';
    section.appendChild(heading);

    if (!trendData || !trendData.weeks || trendData.weeks.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine wöchentliche Historie verfügbar.';
      section.appendChild(empty);
      return section;
    }

    var card = document.createElement('div');
    card.className = 'cvz-card';
    card.innerHTML = buildTrendChartSvg(trendData);
    section.appendChild(card);
    return section;
  }

  // Bewusst handgebautes SVG statt einer Chart-Library: für eine einzelne
  // Linie mit ein paar Datenpunkten lohnt sich keine zusätzliche
  // Abhängigkeit, die im Webflow-Embed nachgeladen werden müsste.
  function buildTrendChartSvg(trendData) {
    var width = 640, height = 180, padding = 32;
    var weeks = trendData.weeks;
    var maxValue = Math.max(trendData.total_prompts, 1);
    var stepX = weeks.length > 1 ? (width - padding * 2) / (weeks.length - 1) : 0;

    function xFor(i) { return padding + i * stepX; }
    function yFor(value) { return height - padding - (value / maxValue) * (height - padding * 2); }

    var points = weeks.map(function (w, i) {
      return xFor(i).toFixed(1) + ',' + yFor(w.visible_prompts).toFixed(1);
    }).join(' ');

    var dots = weeks.map(function (w, i) {
      var x = xFor(i).toFixed(1);
      var y = yFor(w.visible_prompts).toFixed(1);
      return '<circle cx="' + x + '" cy="' + y + '" r="3" class="cvz-chart-dot">' +
        '<title>' + escapeHtml(w.week) + ': ' + w.visible_prompts + ' von ' + trendData.total_prompts + ' Prompts sichtbar</title>' +
        '</circle>';
    }).join('');

    var baselineY = height - padding;

    return (
      '<svg viewBox="0 0 ' + width + ' ' + height + '" class="cvz-chart-svg" preserveAspectRatio="xMidYMid meet">' +
        '<line x1="' + padding + '" y1="' + baselineY + '" x2="' + (width - padding) + '" y2="' + baselineY + '" class="cvz-chart-axis"></line>' +
        '<polyline points="' + points + '" class="cvz-chart-line"></polyline>' +
        dots +
      '</svg>' +
      '<p class="cvz-chart-caption">Sichtbare Stable-Core-Prompts pro Woche, von ' + trendData.total_prompts + ' insgesamt. ' +
      'Komplett erfundene Werte, siehe Kommentar bei MOCK_DOMAIN_TREND im Code.</p>'
    );
  }

  var WEEKDAY_MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  function formatShortDate(isoDate) {
    var parts = isoDate.split(/[-T]/);
    var monthIndex = parseInt(parts[1], 10) - 1;
    return parseInt(parts[2], 10) + '. ' + (WEEKDAY_MONTHS_DE[monthIndex] || parts[1]);
  }

  // NEU (13.09.2026): generischer Mehrfach-Linien-Chart für echte
  // Zeitreihen (Sichtbarkeits-Verlauf, Rank-Historie), anders als
  // buildTrendChartSvg oben (an MOCK_DOMAIN_TREND fest gebunden, bleibt
  // unverändert für die Domain-Übersicht). seriesList: [{ label, values,
  // color }], values parallel zu xLabels, null-Werte werden übersprungen
  // (Lücke in der Linie statt falscher Nullpunkt).
  // NEU (13.09.2026): generischer Mehrfach-Linien-Chart für echte
  // Zeitreihen (Sichtbarkeits-Verlauf, Rank-Historie), anders als
  // buildTrendChartSvg oben (an MOCK_DOMAIN_TREND fest gebunden, bleibt
  // unverändert für die Domain-Übersicht). seriesList: [{ label, values,
  // color }], values parallel zu xLabels, null-Werte werden übersprungen
  // (Lücke in der Linie statt falscher Nullpunkt).
  //
  // GEÄNDERT (13.09.2026): opts.markers ergänzt: [{ index, label, date }],
  // rendert eine vertikale Linie + einen Punkt am jeweiligen x-Index, mit
  // Tooltip. Für Changelog-Einträge auf dem übergreifenden Verlauf (siehe
  // renderCombinedTrendSection), bewusst VOR den Datenserien gezeichnet,
  // damit sie im Hintergrund liegen und die Linien/Punkte nicht verdecken.
  function buildLineChartSvg(seriesList, xLabels, opts) {
    opts = opts || {};
    var width = opts.width || 640, height = opts.height || 180, padding = 32;
    var n = xLabels.length;
    var stepX = n > 1 ? (width - padding * 2) / (n - 1) : 0;

    var maxValue = opts.maxY;
    if (maxValue == null) {
      maxValue = 1;
      seriesList.forEach(function (s) {
        s.values.forEach(function (v) { if (v != null && v > maxValue) maxValue = v; });
      });
    }

    function xFor(i) { return padding + i * stepX; }
    function yFor(value) { return height - padding - (value / maxValue) * (height - padding * 2); }
    var baselineY = height - padding;

    var parts = [
      '<svg viewBox="0 0 ' + width + ' ' + height + '" class="cvz-chart-svg" preserveAspectRatio="xMidYMid meet">',
      '<line x1="' + padding + '" y1="' + baselineY + '" x2="' + (width - padding) + '" y2="' + baselineY + '" class="cvz-chart-axis"></line>',
    ];

    (opts.markers || []).forEach(function (m) {
      var x = xFor(m.index).toFixed(1);
      var weekKey = opts.xKeys ? opts.xKeys[m.index] : null;
      parts.push(
        '<line x1="' + x + '" y1="' + padding + '" x2="' + x + '" y2="' + baselineY + '" class="cvz-chart-marker-line"></line>' +
        (weekKey
          ? '<circle cx="' + x + '" cy="' + padding + '" r="9" fill="transparent" class="cvz-chart-hit" data-cvz-week-detail="' + escapeHtml(weekKey) + '"></circle>'
          : '') +
        '<circle cx="' + x + '" cy="' + padding + '" r="4" class="cvz-chart-marker-dot">' +
          '<title>' + escapeHtml(m.date ? formatShortDate(m.date) + ': ' : '') + escapeHtml(m.label) + '</title>' +
        '</circle>'
      );
    });

    seriesList.forEach(function (s) {
      var color = s.color || 'var(--cvz-teal)';
      var segment = [];
      var polylines = [];
      s.values.forEach(function (v, i) {
        if (v == null) {
          if (segment.length > 1) polylines.push(segment.join(' '));
          segment = [];
          return;
        }
        segment.push(xFor(i).toFixed(1) + ',' + yFor(v).toFixed(1));
      });
      if (segment.length > 1) polylines.push(segment.join(' '));

      polylines.forEach(function (points) {
        parts.push('<polyline points="' + points + '" class="cvz-chart-line" style="stroke:' + color + '"></polyline>');
      });

      // NEU (13.09.2026): unsichtbare, größere Trefferfläche (r=9) für den
      // Klick auf einen Datenpunkt, nur wenn opts.xKeys mitgegeben wurde
      // (bei den Übersicht-Charts der Fall, beim Mock-Chart/Domain-
      // Dashboard und dem Pro-Keyword-Chart bewusst nicht).
      s.values.forEach(function (v, i) {
        if (v == null) return;
        var cx = xFor(i).toFixed(1), cy = yFor(v).toFixed(1);
        if (opts.xKeys && opts.xKeys[i] != null) {
          parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="9" fill="transparent" class="cvz-chart-hit" data-cvz-week-detail="' + escapeHtml(opts.xKeys[i]) + '"></circle>');
        }
        parts.push(
          '<circle cx="' + cx + '" cy="' + cy + '" r="3" class="cvz-chart-dot" style="fill:' + color + '">' +
          '<title>' + escapeHtml(s.label) + ' \u00b7 ' + escapeHtml(xLabels[i]) + ': ' + v + '</title></circle>'
        );
      });
    });

    parts.push('</svg>');
    return parts.join('');
  }

  // NEU (13.09.2026): Montag-der-Woche für ein ISO-Datum, JS-Pendant zu
  // main.py: _week_start_label. Für die Bucket-Zuordnung von Rank-
  // Snapshots und Changelog-Einträgen auf dieselben Wochen wie der
  // Sichtbarkeits-Verlauf (der vom Backend schon wochenweise kommt).
  function weekStartLabel(isoDateStr) {
    var d = new Date(isoDateStr);
    var day = d.getUTCDay(); // 0=So .. 6=Sa
    var diff = day === 0 ? 6 : day - 1; // Tage seit letztem Montag
    var monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
    return monday.toISOString().slice(0, 10);
  }

  // NEU (13.09.2026): grobe, transparente Umrechnung einer Position
  // (organic_rank oder gsc_position, niedriger = besser) in einen 0-100-
  // "Sichtbarkeits-Index" (höher = besser), nur damit Keywords- und
  // Prompts-Linie auf derselben Achse vergleichbar sind. KEINE exakte
  // Kennzahl, nur für die visuelle Richtung gedacht: Position 1 -> 100,
  // Position 26 oder schlechter -> 0, linear dazwischen. Exakte Werte
  // stehen im Tooltip/den Detail-Charts, nicht hier.
  function rankToVisibilityScore(rank) {
    if (rank == null) return null;
    return Math.max(0, Math.min(100, Math.round(100 - (rank - 1) * 4)));
  }

  // NEU (13.09.2026): mittelt den Sichtbarkeits-Index pro Woche über ALLE
  // Keyword-Snapshots dieser Woche (organic_rank bevorzugt, sonst
  // gsc_position). Mehrere Keywords in derselben Woche fließen alle mit
  // ein, das ist bewusst ein grober Gesamteindruck, keine Einzel-Keyword-
  // Analyse (die gibt's separat pro Keyword im Keywords-Tab).
  function computeKeywordScoreByWeek(snapshots) {
    var byWeek = {};
    (snapshots || []).forEach(function (s) {
      var rankValue = s.organic_rank != null ? s.organic_rank : s.gsc_position;
      if (rankValue == null) return;
      var week = weekStartLabel(s.snapshot_at);
      var score = rankToVisibilityScore(rankValue);
      var bucket = byWeek[week] || (byWeek[week] = { total: 0, count: 0 });
      bucket.total += score;
      bucket.count += 1;
    });
    var result = {};
    Object.keys(byWeek).forEach(function (week) {
      result[week] = Math.round(byWeek[week].total / byWeek[week].count);
    });
    return result;
  }

  // NEU (13.09.2026): gemeinsamer Helper fürs Marker-Mapping, vorher an
  // zwei Stellen dupliziert (übergreifende Grafik, detaillierter
  // Sichtbarkeits-Chart). Bildet jeden Changelog-Eintrag auf den
  // zeitlich nächstgelegenen Index in xDates ab (exakter Treffer, falls
  // vorhanden, sonst die geringste Differenz). xDates kann Wochen-Starts
  // ODER einzelne Snapshot-Zeitstempel enthalten, beides sind einfach
  // ISO-Datumsstrings.
  function mapChangelogToMarkers(changelogEntries, xDates) {
    return (changelogEntries || []).map(function (entry) {
      var exactIndex = xDates.indexOf(weekStartLabel(entry.created_at));
      if (exactIndex !== -1) {
        return { index: exactIndex, label: entry.entry_text, date: entry.created_at };
      }
      var entryTime = new Date(entry.created_at).getTime();
      var closestIndex = 0, closestDiff = Infinity;
      xDates.forEach(function (d, i) {
        var diff = Math.abs(new Date(d).getTime() - entryTime);
        if (diff < closestDiff) { closestDiff = diff; closestIndex = i; }
      });
      return { index: closestIndex, label: entry.entry_text, date: entry.created_at };
    });
  }

  // NEU (13.09.2026): übergreifende Grafik, Prompts (Zitationsrate) und
  // Keywords (Sichtbarkeits-Index) auf derselben Zeitachse, plus die
  // eigenen Changelog-Einträge als Marker. Beantwortet direkt "hat unsere
  // Änderung etwas gebracht": ein Marker, nach dem die Linien nach oben
  // drehen, ist ein Hinweis (keine Kausalität, nur Korrelation).
  function renderCombinedTrendSection(promptWeeks, rankSnapshots, changelogEntries, isLoading) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Gesamtentwicklung: Keywords & Prompts';
    section.appendChild(heading);

    if (isLoading) {
      var loading = document.createElement('p');
      loading.className = 'cvz-card-placeholder-text';
      loading.textContent = 'Lädt...';
      section.appendChild(loading);
      return section;
    }

    var promptRateByWeek = {};
    (promptWeeks || []).forEach(function (w) {
      promptRateByWeek[w.week] = w.total ? Math.round((w.cited / w.total) * 100) : null;
    });
    var keywordScoreByWeek = computeKeywordScoreByWeek(rankSnapshots);

    var allWeeksSet = {};
    Object.keys(promptRateByWeek).forEach(function (w) { allWeeksSet[w] = true; });
    Object.keys(keywordScoreByWeek).forEach(function (w) { allWeeksSet[w] = true; });
    var allWeeks = Object.keys(allWeeksSet).sort();

    if (allWeeks.length < 2) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch nicht genug Verlaufsdaten für eine gemeinsame Ansicht.';
      section.appendChild(empty);
      return section;
    }

    var xLabels = allWeeks.map(function (w) { return formatShortDate(w); });
    var promptSeries = allWeeks.map(function (w) { return promptRateByWeek[w] != null ? promptRateByWeek[w] : null; });
    var keywordSeries = allWeeks.map(function (w) { return keywordScoreByWeek[w] != null ? keywordScoreByWeek[w] : null; });
    var markers = mapChangelogToMarkers(changelogEntries, allWeeks);

    var card = document.createElement('div');
    card.className = 'cvz-card';
    card.innerHTML =
      buildLineChartSvg([
        { label: 'Prompts: Zitationsrate', values: promptSeries, color: 'var(--cvz-teal)' },
        { label: 'Keywords: Sichtbarkeits-Index', values: keywordSeries, color: 'var(--cvz-amber)' },
      ], xLabels, { maxY: 100, markers: markers, xKeys: allWeeks }) +
      '<div class="cvz-chart-legend">' +
        '<span class="cvz-chart-legend-item"><span class="cvz-legend-dot" style="background: var(--cvz-teal)"></span>Prompts: Zitationsrate</span>' +
        '<span class="cvz-chart-legend-item"><span class="cvz-legend-dot" style="background: var(--cvz-amber)"></span>Keywords: Sichtbarkeits-Index</span>' +
        (markers.length ? '<span class="cvz-chart-legend-item"><span class="cvz-legend-marker"></span>Eure Eintr\u00e4ge im \u00c4nderungsprotokoll</span>' : '') +
      '</div>' +
      '<p class="cvz-chart-caption">Zitationsrate: Anteil ausgewerteter ChatGPT/Gemini-L\u00e4ufe pro Woche, in dem eure Domain zitiert wurde. ' +
      'Sichtbarkeits-Index: grobe, aus Google-Position/GSC-Position abgeleitete Kennzahl (0\u2013100, h\u00f6her ist besser), gemittelt \u00fcber alle ' +
      'in dieser Woche erfassten Keywords, keine exakte Messgr\u00f6\u00dfe. Gestrichelte Linien markieren eure Eintr\u00e4ge im \u00c4nderungsprotokoll ' +
      '(Datum wird auf die n\u00e4chstgelegene Woche gerundet). Zeigt Korrelation, keine Kausalit\u00e4t. ' +
      'Klickt auf einen Punkt oder eine Markierung f\u00fcr die Details dieser Woche.</p>';
    section.appendChild(card);

    if (state.selectedWeekDetailKey && state.selectedWeekDetailKey.indexOf(state.activeTopicId + '|') === 0) {
      section.appendChild(renderWeekDetailPanel(state.activeTopicId, state.selectedWeekDetailKey.split('|')[1]));
    }

    return section;
  }

  // NEU (13.09.2026): Wochendetail-Kachel, aufgerufen durch Klick auf
  // einen Punkt/Marker in einem der beiden Übersicht-Charts. Zeigt pro
  // Prompt und Keyword den Stand dieser Woche PLUS den Vergleich zur
  // Vorwoche (kommt schon so vom Backend, siehe main.py: _get_week_detail),
  // damit hier keine eigene Delta-Berechnung nötig ist.
  function renderWeekDetailPanel(topicId, week) {
    var key = topicId + '|' + week;
    var wrap = document.createElement('div');
    wrap.className = 'cvz-card cvz-week-detail';

    if (state.isLoadingWeekDetail) {
      wrap.innerHTML = '<p class="cvz-card-placeholder-text">L\u00e4dt...</p>';
      return wrap;
    }

    var detail = state.weekDetailCache[key];
    var headerHtml =
      '<div class="cvz-week-detail-header">' +
        '<p class="cvz-opportunity-type">Woche vom ' + escapeHtml(formatShortDate(week)) + '</p>' +
        '<button type="button" class="cvz-week-detail-close-btn" data-cvz-week-detail-close aria-label="Schlie\u00dfen">\u00d7</button>' +
      '</div>';

    if (!detail) {
      wrap.innerHTML = headerHtml + '<p class="cvz-card-placeholder-text">Details konnten nicht geladen werden.</p>';
      return wrap;
    }

    var html = headerHtml;

    if (detail.prompts && detail.prompts.length) {
      html += '<p class="cvz-section-label" style="margin-top:12px;">Prompts</p>';
      detail.prompts.forEach(function (p) {
        var statusLabel = p.cited ? 'zitiert' : (p.mentioned ? 'erw\u00e4hnt, nicht zitiert' : 'nicht vorhanden');
        var change;
        if (p.previous_collected_at) {
          var previousLabel = p.previous_cited ? 'zitiert' : (p.previous_mentioned ? 'erw\u00e4hnt, nicht zitiert' : 'nicht vorhanden');
          change = ' \u2013 davor am ' + formatShortDate(p.previous_collected_at) + ': ' + previousLabel;
        } else {
          change = ' \u2013 erster erfasster Lauf';
        }
        html +=
          '<p class="cvz-week-detail-row"><strong>' + escapeHtml(MODEL_LABELS[p.engine] || p.engine) + ':</strong> ' +
          escapeHtml(p.prompt_text) + ' \u2013 ' + statusLabel + escapeHtml(change) + '</p>';
      });
    }

    if (detail.keywords && detail.keywords.length) {
      html += '<p class="cvz-section-label" style="margin-top:12px;">Keywords</p>';
      detail.keywords.forEach(function (k) {
        var current = k.organic_rank != null ? k.organic_rank : k.gsc_position;
        var previous = k.previous_organic_rank != null ? k.previous_organic_rank : k.previous_gsc_position;
        var changeText;
        if (current != null && previous != null && k.previous_snapshot_at) {
          var delta = previous - current;
          var deltaLabel = delta > 0
            ? 'verbessert um ' + delta
            : (delta < 0 ? 'verschlechtert um ' + Math.abs(delta) : 'unver\u00e4ndert');
          changeText = ' \u2013 davor Position ' + previous + ' am ' + formatShortDate(k.previous_snapshot_at) + ' (' + deltaLabel + ')';
        } else {
          changeText = ' \u2013 erste Messung';
        }
        html +=
          '<p class="cvz-week-detail-row">' + escapeHtml(k.keyword) + ': Position ' +
          (current != null ? escapeHtml(current) : '\u2013') + escapeHtml(changeText) + '</p>';
      });
    }

    if (detail.changelog && detail.changelog.length) {
      html += '<p class="cvz-section-label" style="margin-top:12px;">Eure Eintr\u00e4ge</p>';
      detail.changelog.forEach(function (entry) {
        html += '<p class="cvz-week-detail-row">' + escapeHtml(entry.entry_text) + '</p>';
      });
    }

    if (!(detail.prompts && detail.prompts.length) && !(detail.keywords && detail.keywords.length) && !(detail.changelog && detail.changelog.length)) {
      html += '<p class="cvz-card-placeholder-text">Keine Daten f\u00fcr diese Woche.</p>';
    }

    wrap.innerHTML = html;
    return wrap;
  }

  function renderSummaryCard(topic) {
    var card = document.createElement('div');
    card.className = 'cvz-card cvz-summary-card';
    card.innerHTML =
      '<h3 class="cvz-section-title">' + escapeHtml(topic.name) + '</h3>' +
      '<p class="cvz-card-eyebrow">' + escapeHtml(topic.seed_keyword) + ' · ' + escapeHtml(topic.own_domain) + '</p>' +
      '<p class="cvz-summary-text">' + escapeHtml(topic.latest_summary || 'Noch keine Zusammenfassung vorhanden.') + '</p>';
    return card;
  }

  function renderOpportunitySection(opportunities) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Opportunities';
    section.appendChild(heading);

    if (opportunities.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Aktuell keine offenen Opportunities für dieses Thema.';
      section.appendChild(empty);
      return section;
    }

    var grid = document.createElement('div');
    grid.className = 'cvz-opportunity-grid';
    opportunities.forEach(function (opp) {
      var card = document.createElement('div');
      card.className = 'cvz-card cvz-opportunity-card';
      card.innerHTML =
        '<p class="cvz-opportunity-type">' + escapeHtml(OPPORTUNITY_TYPE_LABELS[opp.type] || opp.type) + '</p>' +
        '<p class="cvz-opportunity-description">' + escapeHtml(opp.description || '') + '</p>';
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  var CONTENT_TYPE_LABELS = {
    review_plattform:    'Review-Plattform',
    vergleichsartikel:   'Vergleichsartikel',
    produktseite:        'Produktseite',
    fachartikel:         'Fachartikel',
    video:                'Video',
    forum:                'Forum',
    sonstiges:            'Sonstiges',
  };

  function renderSourceProfilesSection(profiles) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Quellen-Analyse (Live-Web-Search, gecacht pro Domain)';
    section.appendChild(heading);

    if (!profiles || profiles.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Quellen-Analyse verfügbar.';
      section.appendChild(empty);
      return section;
    }

    var grid = document.createElement('div');
    grid.className = 'cvz-opportunity-grid';
    profiles.forEach(function (profile) {
      var card = document.createElement('div');
      card.className = 'cvz-card cvz-idea-card';
      card.innerHTML =
        '<p class="cvz-opportunity-type">' + escapeHtml(profile.domain) +
          (profile.content_type ? ' \u00b7 ' + escapeHtml(CONTENT_TYPE_LABELS[profile.content_type] || profile.content_type) : '') +
        '</p>' +
        (profile.summary ? '<p class="cvz-opportunity-description">' + escapeHtml(profile.summary) + '</p>' : '') +
        (profile.differentiation_suggestion ? '<p class="cvz-opportunity-description"><strong>Differenzierung:</strong> ' + escapeHtml(profile.differentiation_suggestion) + '</p>' : '');
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  // Für die Mock-only Domain-Übersicht (aggregiert über detail.competitors,
  // das nur im Mock-Datensatz existiert). Für die echte Topic-Detailansicht
  // siehe renderCompetitorInsightSection weiter unten.
  function renderDomainCompetitorTable(competitors) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Wettbewerber-Zitationen';
    section.appendChild(heading);

    if (!competitors || competitors.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Wettbewerber-Zitationsdaten verfügbar.';
      section.appendChild(empty);
      return section;
    }

    var table = document.createElement('table');
    table.className = 'cvz-table';
    table.innerHTML = '<thead><tr><th>Domain</th><th>Zitationen</th><th>Phasen</th></tr></thead>';
    var tbody = document.createElement('tbody');
    competitors.forEach(function (comp) {
      var row = document.createElement('tr');
      var phaseLabels = (comp.phases || []).map(function (p) { return PHASE_LABELS[p] || p; }).join(', ');
      row.innerHTML =
        '<td>' + escapeHtml(comp.domain) + '</td>' +
        '<td>' + escapeHtml(comp.citations) + '</td>' +
        '<td>' + escapeHtml(phaseLabels) + '</td>';
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  // NEU (13.09.2026): aggregiert die von /competitor-citations gelieferten
  // Wochen (jede mit ihrer eigenen by_model/prompts-Aufschlüsselung pro
  // Domain) zu EINER Domain-Tabelle über den ganzen geladenen Zeitraum.
  function aggregateCompetitorDomains(weeks) {
    if (!weeks || weeks.length === 0) return [];
    var byDomain = {};
    weeks.forEach(function (week) {
      (week.domains || []).forEach(function (d) {
        if (!byDomain[d.domain]) {
          byDomain[d.domain] = { domain: d.domain, citations: 0, by_model: {}, prompts: {} };
        }
        var entry = byDomain[d.domain];
        entry.citations += d.citations;
        Object.keys(d.by_model || {}).forEach(function (model) {
          entry.by_model[model] = (entry.by_model[model] || 0) + d.by_model[model];
        });
        (d.prompts || []).forEach(function (p) { entry.prompts[p] = true; });
      });
    });
    return Object.keys(byDomain).map(function (domain) {
      var e = byDomain[domain];
      return { domain: e.domain, citations: e.citations, by_model: e.by_model, prompts: Object.keys(e.prompts) };
    }).sort(function (a, b) { return b.citations - a.citations; });
  }

  function normalizeDomainForMatch(domain) {
    return (domain || '').toLowerCase().replace(/^www\./, '');
  }

  // GEÄNDERT (13.09.2026): ersetzt die reine "wer wird wie oft genannt"-
  // Tabelle. Filtert auf die im Projekt hinterlegten Wettbewerber-Domains
  // (sonst landen auch neutrale Wissensquellen wie SAP-Hilfeportal/Reddit/
  // YouTube hier, siehe Beispiel-ai_runs vom 13.09., die keine echten
  // Wettbewerber sind) und reichert jeden Treffer mit der bestehenden
  // Quellen-Analyse an (source_profiles: Stärken + Differenzierungs-Chance),
  // statt beides als zwei getrennte Listen zu zeigen.
  function renderCompetitorInsightSection(weeks, isLoading, sourceProfiles, competitorDomains, competitorInsights) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Häufigste Wettbewerber: Stärken, Schwächen, Chancen';
    section.appendChild(heading);

    if (isLoading) {
      var loading = document.createElement('p');
      loading.className = 'cvz-card-placeholder-text';
      loading.textContent = 'Lädt...';
      section.appendChild(loading);
      return section;
    }

    // GEÄNDERT (13.09.2026): main.py filtert /competitor-citations jetzt
    // serverseitig auf ai_sources.is_competitor = true (siehe
    // _get_competitor_citation_trend). allDomains enthält also schon NUR
    // echte Wettbewerber, keine clientseitige Nachfilterung mehr nötig.
    var allDomains = aggregateCompetitorDomains(weeks);

    if (allDomains.length === 0) {
      var hintOrEmpty = document.createElement('p');
      hintOrEmpty.className = 'cvz-card-placeholder-text';
      hintOrEmpty.textContent = (competitorDomains && competitorDomains.length > 0)
        ? 'Keiner eurer hinterlegten Wettbewerber wurde im geladenen Zeitraum zitiert.'
        : 'Für dieses Projekt sind noch keine Wettbewerber-Domains hinterlegt, deshalb gibt es hier noch nichts zu zeigen.';
      section.appendChild(hintOrEmpty);
      return section;
    }

    var profileByDomain = {};
    (sourceProfiles || []).forEach(function (p) {
      profileByDomain[normalizeDomainForMatch(p.domain)] = p;
    });
    // NEU (13.09.2026): topic-spezifische Stärken/Schwächen/Chancen (siehe
    // gap_analysis.py: competitor_insights), getrennt von der domain-
    // globalen source_analysis.py-Zusammenfassung oben.
    var insightByDomain = {};
    (competitorInsights || []).forEach(function (i) {
      insightByDomain[normalizeDomainForMatch(i.domain)] = i;
    });

    var grid = document.createElement('div');
    grid.className = 'cvz-opportunity-grid';
    allDomains.slice(0, 8).forEach(function (comp) {
      var normDomain = normalizeDomainForMatch(comp.domain);
      var profile = profileByDomain[normDomain];
      var insight = insightByDomain[normDomain];
      var byModel = comp.by_model || {};
      var modelParts = [];
      if (byModel.chat_gpt) modelParts.push(byModel.chat_gpt + '\u00d7 ' + MODEL_LABELS.chat_gpt);
      if (byModel.gemini) modelParts.push(byModel.gemini + '\u00d7 ' + MODEL_LABELS.gemini);
      var promptList = comp.prompts || [];

      var card = document.createElement('div');
      card.className = 'cvz-card cvz-idea-card';
      card.innerHTML =
        '<p class="cvz-opportunity-type">' +
          '<img class="cvz-inline-favicon" src="https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(comp.domain) + '" alt="">' +
          escapeHtml(comp.domain) + ' \u00b7 ' + comp.citations + ' Zitationen' +
        '</p>' +
        (modelParts.length ? '<p class="cvz-opportunity-topic">' + escapeHtml(modelParts.join(' \u00b7 ')) + '</p>' : '') +
        (profile && profile.content_type
          ? '<p class="cvz-opportunity-topic">' + escapeHtml(CONTENT_TYPE_LABELS[profile.content_type] || profile.content_type) + '</p>'
          : '') +
        (insight && insight.strength
          ? '<p class="cvz-opportunity-description"><strong>St\u00e4rke:</strong> ' + escapeHtml(insight.strength) + '</p>'
          : (profile && profile.summary
            ? '<p class="cvz-opportunity-description"><strong>Quellen-Analyse:</strong> ' + escapeHtml(profile.summary) + '</p>'
            : '<p class="cvz-card-placeholder-text">Noch keine Analyse f\u00fcr diese Domain.</p>')) +
        (insight && insight.weakness
          ? '<p class="cvz-opportunity-description"><strong>Schw\u00e4che:</strong> ' + escapeHtml(insight.weakness) + '</p>'
          : '') +
        (insight && insight.opportunity
          ? '<p class="cvz-opportunity-description"><strong>Chance f\u00fcr euch:</strong> ' + escapeHtml(insight.opportunity) + '</p>'
          : (profile && profile.differentiation_suggestion
            ? '<p class="cvz-opportunity-description"><strong>Differenzierungs-Idee:</strong> ' + escapeHtml(profile.differentiation_suggestion) + '</p>'
            : '')) +
        (promptList.length
          ? '<p class="cvz-opportunity-topic" title="' + escapeHtml(promptList.join(' | ')) + '">Genannt bei ' + promptList.length + ' Prompt' + (promptList.length === 1 ? '' : 's') + '</p>'
          : '');
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  // NEU (13.09.2026): dedizierte, themenweite Lücken-Analyse (siehe
  // gap_analysis.py, Tabelle content_gaps). Anders als die
  // Differenzierungs-Idee pro Wettbewerber-Karte oben schaut das über ALLE
  // zitierten Quellen und die eigene Prompt-Abdeckung hinweg (z.B. eine
  // ganze Sichtbarkeits-Phase, die bei niemandem besetzt ist).
  function renderContentGapsSection(gaps) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Content-Lücken (themenweite Analyse)';
    section.appendChild(heading);

    if (!gaps || gaps.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Lücken-Analyse verfügbar.';
      section.appendChild(empty);
      return section;
    }

    var grid = document.createElement('div');
    grid.className = 'cvz-opportunity-grid';
    gaps.forEach(function (gap) {
      var priorityClass = gap.priority ? ' cvz-gap-priority-' + gap.priority : '';
      var card = document.createElement('div');
      card.className = 'cvz-card cvz-idea-card' + priorityClass;
      card.innerHTML =
        (gap.priority
          ? '<p class="cvz-opportunity-type">' + escapeHtml(GAP_PRIORITY_LABELS[gap.priority] || gap.priority) + '</p>'
          : '') +
        '<p class="cvz-opportunity-description">' + escapeHtml(gap.gap_description || '') + '</p>' +
        (gap.evidence
          ? '<p class="cvz-opportunity-description"><strong>Beleg:</strong> ' + escapeHtml(gap.evidence) + '</p>'
          : '') +
        (gap.recommended_content_type
          ? '<p class="cvz-opportunity-topic"><strong>Empfehlung:</strong> ' + escapeHtml(gap.recommended_content_type) + '</p>'
          : '');
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  function renderContentIdeasSection(ideas) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Content-Ideen (manuell beobachtet, keine automatisierte Erkennung)';
    section.appendChild(heading);

    if (!ideas || ideas.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Aktuell keine notierten Content-Ideen.';
      section.appendChild(empty);
      return section;
    }

    var grid = document.createElement('div');
    grid.className = 'cvz-opportunity-grid';
    ideas.forEach(function (idea) {
      var card = document.createElement('div');
      card.className = 'cvz-card cvz-idea-card';
      card.innerHTML =
        '<p class="cvz-opportunity-description">' + escapeHtml(idea.description || '') + '</p>' +
        (idea.topic_name ? '<p class="cvz-opportunity-topic">' + escapeHtml(idea.topic_name) + '</p>' : '');
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  // NEU (13.09.2026): echter Sichtbarkeits-Verlauf (own_domain_mentioned/
  // cited/recommended pro Woche, siehe main.py: /visibility-trend). Zeigt
  // Anteile statt Rohzahlen, weil die Anzahl ausgewerteter Läufe pro Woche
  // schwanken kann (neue Prompts, verpasste Cron-Läufe), absolute Zahlen
  // wären dann nicht vergleichbar.
  function renderVisibilityTrendSection(weeks, isLoading, changelogEntries) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Sichtbarkeits-Verlauf im Detail';
    section.appendChild(heading);

    if (isLoading) {
      var loading = document.createElement('p');
      loading.className = 'cvz-card-placeholder-text';
      loading.textContent = 'Lädt...';
      section.appendChild(loading);
      return section;
    }

    if (!weeks || weeks.length < 2) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch kein Verlauf verfügbar, braucht mindestens zwei Wochen mit ausgewerteten Läufen.';
      section.appendChild(empty);
      return section;
    }

    var xLabels = weeks.map(function (w) { return formatShortDate(w.week); });
    var mentionedRate = weeks.map(function (w) { return w.total ? Math.round((w.mentioned / w.total) * 100) : null; });
    var citedRate = weeks.map(function (w) { return w.total ? Math.round((w.cited / w.total) * 100) : null; });
    var recommendedRate = weeks.map(function (w) { return w.total ? Math.round((w.recommended / w.total) * 100) : null; });
    var weekLabelsOnly = weeks.map(function (w) { return w.week; });
    var markers = mapChangelogToMarkers(changelogEntries, weekLabelsOnly);

    var card = document.createElement('div');
    card.className = 'cvz-card';
    card.innerHTML =
      buildLineChartSvg([
        { label: 'Erwähnt', values: mentionedRate, color: 'var(--cvz-amber)' },
        { label: 'Zitiert', values: citedRate, color: 'var(--cvz-teal)' },
        { label: 'Empfohlen', values: recommendedRate, color: 'var(--cvz-red)' },
      ], xLabels, { maxY: 100, markers: markers, xKeys: weekLabelsOnly }) +
      '<div class="cvz-chart-legend">' +
        '<span class="cvz-chart-legend-item"><span class="cvz-legend-dot" style="background: var(--cvz-amber)"></span>Erwähnt</span>' +
        '<span class="cvz-chart-legend-item"><span class="cvz-legend-dot" style="background: var(--cvz-teal)"></span>Zitiert</span>' +
        '<span class="cvz-chart-legend-item"><span class="cvz-legend-dot" style="background: var(--cvz-red)"></span>Empfohlen</span>' +
      '</div>' +
      '<p class="cvz-chart-caption">Anteil der ausgewerteten ChatGPT/Gemini-L\u00e4ufe pro Woche (0\u2013100\u202f%), in dem die eigene Domain erw\u00e4hnt, zitiert bzw. aktiv empfohlen wurde. Klickt auf einen Punkt f\u00fcr die Details dieser Woche (Kachel erscheint oben bei der Gesamtentwicklung).</p>';
    section.appendChild(card);
    // GEÄNDERT: die Wochendetail-Kachel selbst wird nur EINMAL gerendert,
    // direkt unter der übergreifenden Grafik (siehe renderCombinedTrendSection),
    // damit sie nicht doppelt erscheint, egal in welchem der beiden Charts
    // geklickt wurde (beide teilen sich denselben state.selectedWeekDetailKey).
    return section;
  }

  // NEU (13.09.2026): Changelog (siehe main.py: /topics/{id}/changelog).
  // Rein informativ, keine automatische Verkn\u00fcpfung zum Verlauf oben,
  // der Nutzer legt beides gedanklich selbst nebeneinander.
  // GEÄNDERT (13.09.2026): kein isLoading-Parameter mehr, entries kommt
  // jetzt fest mit dem Topic-Detail (siehe main.py: /topics/{id}), der
  // äußere "Lädt..."-Zustand von renderTopicDetailView deckt das schon ab.
  // GEÄNDERT (13.09.2026): kein isLoading-Parameter mehr, entries kommt
  // jetzt fest mit dem Topic-Detail (siehe main.py: /topics/{id}), der
  // äußere "Lädt..."-Zustand von renderTopicDetailView deckt das schon ab.
  // GEÄNDERT (13.09.2026): zeigt standardmäßig nur die letzten 10
  // Einträge (state.changelogVisibleCount), "Weitere anzeigen" lädt
  // jeweils 10 mehr nach. Braucht topicId, um den Zähler pro Topic
  // getrennt zu halten (sonst würde das Aufklappen bei einem Topic auch
  // beim nächsten wieder mehr als 10 zeigen).
  function renderChangelogSection(entries, topicId) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = '\u00c4nderungsprotokoll';
    section.appendChild(heading);

    var form = document.createElement('div');
    form.className = 'cvz-changelog-form';
    form.innerHTML =
      '<textarea id="cvz-changelog-input" class="cvz-changelog-input" rows="2" ' +
        'placeholder="Was habt ihr ge\u00e4ndert? (z.B. Landingpage-Text \u00fcberarbeitet)">' +
        escapeHtml(state.changelogDraft || '') +
      '</textarea>' +
      '<button type="button" class="cvz-changelog-submit-btn" data-cvz-changelog-submit ' +
        (state.isSubmittingChangelog ? 'disabled' : '') + '>' +
        (state.isSubmittingChangelog ? 'Wird gespeichert \u2026' : 'Eintragen') +
      '</button>';
    section.appendChild(form);

    if (!entries || entries.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Eintr\u00e4ge.';
      section.appendChild(empty);
    } else {
      var visibleCount = state.changelogVisibleCount[topicId] || 10;
      var visibleEntries = entries.slice(0, visibleCount);

      var list = document.createElement('div');
      list.className = 'cvz-changelog-list';
      visibleEntries.forEach(function (entry) {
        var item = document.createElement('div');
        item.className = 'cvz-changelog-item';
        item.innerHTML =
          '<div class="cvz-changelog-item-row">' +
            '<p class="cvz-changelog-text">' + escapeHtml(entry.entry_text) + '</p>' +
            '<button type="button" class="cvz-changelog-delete-btn" data-cvz-changelog-delete="' + escapeHtml(entry.id) + '" aria-label="L\u00f6schen">\u00d7</button>' +
          '</div>' +
          '<p class="cvz-changelog-meta">' +
            formatRelativeTime(entry.created_at) +
            (entry.author_name ? ' \u00b7 ' + escapeHtml(entry.author_name) : '') +
          '</p>';
        list.appendChild(item);
      });
      section.appendChild(list);

      if (entries.length > visibleCount) {
        var moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'cvz-changelog-more-btn';
        moreBtn.setAttribute('data-cvz-changelog-more', topicId);
        moreBtn.textContent = 'Weitere anzeigen (noch ' + (entries.length - visibleCount) + ')';
        section.appendChild(moreBtn);
      }
    }

    // NEU (13.09.2026): Archiv-Ansicht für weich gelöschte Einträge, siehe
    // toggleDeletedChangelog/main.py: /topics/{id}/changelog/deleted.
    var isDeletedOpen = !!state.showDeletedChangelog[topicId];
    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'cvz-changelog-toggle-deleted-btn';
    toggleBtn.setAttribute('data-cvz-changelog-toggle-deleted', '');
    toggleBtn.textContent = isDeletedOpen ? 'Gel\u00f6schte Eintr\u00e4ge ausblenden' : 'Gel\u00f6schte Eintr\u00e4ge anzeigen';
    section.appendChild(toggleBtn);

    if (isDeletedOpen) {
      if (state.isLoadingDeletedChangelog) {
        var loadingDeleted = document.createElement('p');
        loadingDeleted.className = 'cvz-card-placeholder-text';
        loadingDeleted.textContent = 'L\u00e4dt...';
        section.appendChild(loadingDeleted);
      } else {
        var deletedEntries = state.deletedChangelogCache[topicId] || [];
        if (deletedEntries.length === 0) {
          var noneDeleted = document.createElement('p');
          noneDeleted.className = 'cvz-card-placeholder-text';
          noneDeleted.textContent = 'Keine gel\u00f6schten Eintr\u00e4ge der letzten ' + CHANGELOG_DELETED_RETENTION_DAYS + ' Tage.';
          section.appendChild(noneDeleted);
        } else {
          var deletedList = document.createElement('div');
          deletedList.className = 'cvz-changelog-list';
          deletedEntries.forEach(function (entry) {
            var item = document.createElement('div');
            item.className = 'cvz-changelog-item cvz-changelog-item-deleted';
            item.innerHTML =
              '<div class="cvz-changelog-item-row">' +
                '<p class="cvz-changelog-text">' + escapeHtml(entry.entry_text) + '</p>' +
                '<button type="button" class="cvz-changelog-restore-btn" data-cvz-changelog-restore="' + escapeHtml(entry.id) + '">Wiederherstellen</button>' +
              '</div>' +
              '<p class="cvz-changelog-meta">' +
                'Erstellt ' + formatRelativeTime(entry.created_at) +
                (entry.author_name ? ' von ' + escapeHtml(entry.author_name) : '') +
                ' \u00b7 gel\u00f6scht ' + formatRelativeTime(entry.deleted_at) +
                (entry.deleted_by_name ? ' von ' + escapeHtml(entry.deleted_by_name) : '') +
              '</p>';
            deletedList.appendChild(item);
          });
          section.appendChild(deletedList);
        }
      }
    }

    return section;
  }

  function renderPositioningInsightsList(insights) {
    if (!insights || insights.length === 0) return null;

    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Positionierungs-Hinweise';
    section.appendChild(heading);

    insights.forEach(function (insight) {
      var card = document.createElement('div');
      card.className = 'cvz-card cvz-idea-card';
      card.innerHTML =
        '<p class="cvz-opportunity-description">' +
          '\u201E' + escapeHtml(insight.seed_keyword) + '\u201C (' + escapeHtml(insight.seed_volume) + '/Monat) vs. ' +
          '\u201E' + escapeHtml(insight.suggested_keyword) + '\u201C (' + escapeHtml(insight.suggested_volume) +
          '/Monat, ' + escapeHtml(insight.factor) + 'x h\u00e4ufiger gesucht).' +
        '</p>' +
        '<p class="cvz-opportunity-topic">' + escapeHtml(insight.topic_name) + '</p>';
      section.appendChild(card);
    });

    return section;
  }

  function renderPositioningInsight(insight) {
    if (!insight) return null; // kein Leerzustand, ist ein Bonus-Hinweis wie schon Content-Ideen

    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Positionierungs-Hinweis';
    section.appendChild(heading);

    var card = document.createElement('div');
    card.className = 'cvz-card cvz-idea-card';
    card.innerHTML =
      '<p class="cvz-opportunity-description">' +
        'Das Thema zielt auf \u201E' + escapeHtml(insight.seed_keyword) + '\u201C (' + escapeHtml(insight.seed_volume) + ' Suchen/Monat), ' +
        'aber \u201E' + escapeHtml(insight.suggested_keyword) + '\u201C wird mit ' + escapeHtml(insight.suggested_volume) +
        ' Suchen/Monat rund ' + escapeHtml(insight.factor) + 'x h\u00e4ufiger gesucht. ' +
        'M\u00f6glicherweise die treffendere Positionierung.' +
      '</p>';
    section.appendChild(card);
    return section;
  }

  function renderKeywordsTable(keywords, enableExpansion, changelogEntries) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Thematisch passende Keywords';
    section.appendChild(heading);

    if (!keywords || keywords.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Keyword-Daten verfügbar.';
      section.appendChild(empty);
      return section;
    }

    // GEÄNDERT (13.09.2026): von einer flachen Tabelle auf aufklappbare
    // Zeilen umgestellt, im selben Stil/Layout wie die Prompts-Liste
    // (cvz-prompt-list/-row wiederverwendet). Aufgeklappt zeigt eine
    // Zeile SERP-/GSC-Detail (organic_rank/gsc_impressions/gsc_position/
    // first_seen_at) plus, wo verfügbar, den Rank-Verlauf über die Zeit.
    var list = document.createElement('div');
    list.className = 'cvz-prompt-list';
    keywords.forEach(function (kw) {
      var rowId = kw.id || (kw.keyword + '|' + kw.source);
      var hasDetail = kw.organic_rank != null || kw.gsc_impressions != null || kw.gsc_position != null || kw.first_seen_at;
      var canExpand = !!(enableExpansion && hasDetail);

      var row = document.createElement('div');
      row.className = 'cvz-prompt-row' + (canExpand ? ' cvz-prompt-row-clickable' : '');
      if (canExpand) {
        row.setAttribute('data-cvz-keyword-toggle', rowId);
        row.setAttribute('data-cvz-keyword-text', kw.keyword);
      }
      row.innerHTML =
        '<span class="cvz-prompt-text">' + escapeHtml(kw.keyword) + '</span>' +
        '<span class="cvz-prompt-citation-count">' +
          (kw.search_volume == null ? '\u2013' : escapeHtml(kw.search_volume) + '/Monat') +
        '</span>' +
        '<span class="cvz-prompt-source">' + escapeHtml(KEYWORD_SOURCE_LABELS[kw.source] || kw.source) + '</span>' +
        (canExpand
          ? '<span class="cvz-prompt-expand-chevron">' + (state.expandedKeywordId === rowId ? '\u25be' : '\u25b8') + '</span>'
          : '');
      list.appendChild(row);

      if (canExpand && state.expandedKeywordId === rowId) {
        list.appendChild(renderKeywordExpansion(kw, rowId, changelogEntries));
      }
    });
    section.appendChild(list);
    return section;
  }

  function renderKeywordExpansion(kw, rowId, changelogEntries) {
    var wrap = document.createElement('div');
    wrap.className = 'cvz-prompt-expansion';

    var lines = [];
    if (kw.organic_rank != null) {
      lines.push(
        '<p class="cvz-opportunity-description"><strong>Google-Position (organisch):</strong> ' +
        escapeHtml(kw.organic_rank) + '</p>'
      );
    }
    if (kw.gsc_impressions != null || kw.gsc_position != null) {
      var gscParts = [];
      if (kw.gsc_impressions != null) gscParts.push(escapeHtml(kw.gsc_impressions) + ' Impressionen');
      if (kw.gsc_position != null) gscParts.push('Position ' + escapeHtml(Number(kw.gsc_position).toFixed(1)));
      lines.push('<p class="cvz-opportunity-description"><strong>Google Search Console:</strong> ' + gscParts.join(', ') + '</p>');
    }
    if (kw.source === 'paa') {
      lines.push('<p class="cvz-opportunity-topic">H\u00e4ufig gefragt laut Google (People Also Ask), nicht von ChatGPT/Gemini.</p>');
    }
    if (kw.first_seen_at) {
      lines.push('<p class="cvz-opportunity-topic">Erstmals erfasst: ' + formatRelativeTime(kw.first_seen_at) + '</p>');
    }
    wrap.innerHTML = lines.join('');

    if (state.loadingKeywordRankHistory[rowId]) {
      var loading = document.createElement('p');
      loading.className = 'cvz-card-placeholder-text';
      loading.textContent = 'Lädt Verlauf...';
      wrap.appendChild(loading);
      return wrap;
    }

    var snapshots = state.keywordRankHistoryCache[rowId];
    if (snapshots && snapshots.length >= 2) {
      var snapshotDates = snapshots.map(function (s) { return s.snapshot_at; });
      var xLabels = snapshotDates.map(function (d) { return formatShortDate(d); });
      var rankValues = snapshots.map(function (s) { return s.organic_rank; });
      var gscPositionValues = snapshots.map(function (s) { return s.gsc_position; });
      var hasRank = rankValues.some(function (v) { return v != null; });
      var hasGsc = gscPositionValues.some(function (v) { return v != null; });
      if (hasRank || hasGsc) {
        var series = [];
        if (hasRank) series.push({ label: 'Google-Position', values: rankValues, color: 'var(--cvz-teal)' });
        if (hasGsc) series.push({ label: 'GSC-Position', values: gscPositionValues, color: 'var(--cvz-amber)' });
        // NEU (13.09.2026): Changelog-Marker auch hier, gemappt auf die
        // tatsächlichen Snapshot-Zeitpunkte dieses Keywords (nicht auf
        // Wochen-Buckets wie bei den beiden Übersicht-Charts).
        var markers = mapChangelogToMarkers(changelogEntries, snapshotDates);
        var chartWrap = document.createElement('div');
        chartWrap.className = 'cvz-card';
        chartWrap.innerHTML =
          buildLineChartSvg(series, xLabels, { markers: markers }) +
          '<p class="cvz-chart-caption">Position im Verlauf, niedriger ist besser. Historie beginnt mit eurem ersten ' +
          'Monatslauf nach Einf\u00fchrung dieser Auswertung, keine r\u00fcckwirkenden Daten. Gestrichelte Linien sind eure ' +
          'Eintr\u00e4ge im \u00c4nderungsprotokoll.</p>';
        wrap.appendChild(chartWrap);
      }
    } else if (snapshots && snapshots.length === 1) {
      var single = document.createElement('p');
      single.className = 'cvz-card-placeholder-text';
      single.textContent = 'Nur ein Messpunkt bisher, Verlauf entsteht mit dem n\u00e4chsten Monatslauf.';
      wrap.appendChild(single);
    }

    return wrap;
  }

  // =========================================================================
  // NEU (13.09.2026): leichter Markdown-Renderer für Prompt-Antworten aus
  // DataForSEO (raw_response[0].markdown). Keine externe Library, deckt
  // aber Links, Fettschrift, Überschriften und Listen ab, was in den
  // gesehenen ChatGPT/Gemini-Antworten praktisch immer ausreicht.
  // =========================================================================
  function renderMarkdownLite(markdown) {
    if (!markdown) return '';
    var escaped = escapeHtml(markdown);
    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, text, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>';
    });
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/^###\s+(.+)$/gm, '<h5>$1</h5>');
    escaped = escaped.replace(/^##\s+(.+)$/gm, '<h4>$1</h4>');

    var html = '', inList = false;
    escaped.split('\n').forEach(function (line) {
      var t = line.trim();
      if (t.indexOf('- ') === 0) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + t.slice(2) + '</li>';
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        if (t === '') return;
        html += (t.indexOf('<h4>') === 0 || t.indexOf('<h5>') === 0) ? t : '<p>' + t + '</p>';
      }
    });
    if (inList) html += '</ul>';
    return html;
  }

  // NEU (13.09.2026): der aufgeklappte Bereich unter einem Prompt im
  // Prompts-Tab (nur Topic-Detailansicht), Engine-Tabs (ChatGPT/Gemini),
  // Lauf-Auswahl (letzte PROMPT_CITATION_RUN_LIMIT Läufe), volle Antwort
  // und zitierte Quellen. Ersetzt die "Modal mit Pfeilen"-Idee aus dem
  // Referenz-Screenshot bewusst durch Inline-Aufklappen in der bestehenden
  // Tab-Struktur, wie gewünscht.
  function renderPromptExpansion(prompt) {
    var wrap = document.createElement('div');
    wrap.className = 'cvz-prompt-expansion';

    if (state.loadingPromptCitations[prompt.id]) {
      wrap.innerHTML = '<p class="cvz-card-placeholder-text">Lädt...</p>';
      return wrap;
    }
    var data = state.promptCitationsCache[prompt.id];
    if (!data) {
      wrap.innerHTML = '<p class="cvz-card-placeholder-text">Für diesen Prompt liegen noch keine Antwort-Daten vor.</p>';
      return wrap;
    }

    var engines = [
      { id: 'chat_gpt', label: MODEL_LABELS.chat_gpt, runs: data.chat_gpt || [] },
      { id: 'gemini', label: MODEL_LABELS.gemini, runs: data.gemini || [] },
    ];

    var engineNav = document.createElement('div');
    engineNav.className = 'cvz-prompt-engine-nav';
    engines.forEach(function (engine) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cvz-prompt-engine-btn' + (state.expandedPromptEngine[prompt.id] === engine.id ? ' cvz-prompt-engine-btn-active' : '');
      btn.setAttribute('data-cvz-prompt-engine', engine.id);
      btn.setAttribute('data-cvz-prompt-engine-owner', prompt.id);
      btn.textContent = engine.label + ' (' + engine.runs.length + ')';
      engineNav.appendChild(btn);
    });
    wrap.appendChild(engineNav);

    var activeEngine = engines.filter(function (e) { return e.id === state.expandedPromptEngine[prompt.id]; })[0] || engines[0];
    var runIndex = state.expandedPromptRunIndex[prompt.id] || 0;
    var run = activeEngine.runs[runIndex];

    if (!run) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Für ' + activeEngine.label + ' liegt noch kein Lauf vor.';
      wrap.appendChild(empty);
      return wrap;
    }

    if (activeEngine.runs.length > 1) {
      var runNav = document.createElement('div');
      runNav.className = 'cvz-prompt-run-nav';
      activeEngine.runs.forEach(function (r, i) {
        var runBtn = document.createElement('button');
        runBtn.type = 'button';
        runBtn.className = 'cvz-prompt-run-btn' + (i === runIndex ? ' cvz-prompt-run-btn-active' : '');
        runBtn.setAttribute('data-cvz-run-select', i);
        runBtn.setAttribute('data-cvz-run-owner', prompt.id);
        runBtn.textContent = formatRelativeTime(r.collected_at);
        runNav.appendChild(runBtn);
      });
      wrap.appendChild(runNav);
    }

    var statusLine = document.createElement('p');
    statusLine.className = 'cvz-prompt-run-status';
    statusLine.textContent = run.own_domain_cited
      ? '\u2713 zitiert' + (run.own_domain_citation_position ? ' (Position ' + run.own_domain_citation_position + ')' : '')
      : (run.own_domain_mentioned ? '\u2013 nur erw\u00e4hnt, nicht zitiert' : '\u2717 nicht vorhanden');
    if (run.own_domain_recommended === true) statusLine.textContent += ' \u00b7 aktiv empfohlen';
    wrap.appendChild(statusLine);

    var answerBlock = document.createElement('div');
    answerBlock.className = 'cvz-prompt-answer';
    answerBlock.innerHTML = renderMarkdownLite(run.answer_markdown);
    wrap.appendChild(answerBlock);

    var sourcesHeading = document.createElement('p');
    sourcesHeading.className = 'cvz-section-label';
    sourcesHeading.textContent = 'Zitierte Quellen (' + run.sources.length + ')';
    wrap.appendChild(sourcesHeading);

    if (run.sources.length === 0) {
      var noSources = document.createElement('p');
      noSources.className = 'cvz-card-placeholder-text';
      noSources.textContent = 'Keine Quellen in dieser Antwort.';
      wrap.appendChild(noSources);
    } else {
      var sourceList = document.createElement('div');
      sourceList.className = 'cvz-prompt-source-list';
      run.sources.forEach(function (s) {
        var item = document.createElement('a');
        item.className = 'cvz-prompt-source-item' + (s.is_competitor ? ' cvz-prompt-source-competitor' : '');
        item.href = s.url || '#';
        item.target = '_blank';
        item.rel = 'noopener';
        item.innerHTML =
          '<img class="cvz-timeline-logo" src="https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(s.domain || '') + '" alt="">' +
          '<span>' + escapeHtml(s.title || s.domain || s.url) + '</span>' +
          (s.is_competitor ? '<span class="cvz-competitor-badge">Wettbewerber</span>' : '');
        sourceList.appendChild(item);
      });
      wrap.appendChild(sourceList);
    }

    // NEU (13.09.2026): Wettbewerber, die im Antworttext vorkommen, aber
    // nicht als Quelle verlinkt sind (siehe _extract_run_answer in main.py).
    if (run.competitor_mentioned_only && run.competitor_mentioned_only.length) {
      var mentionedNote = document.createElement('p');
      mentionedNote.className = 'cvz-card-placeholder-text cvz-prompt-mentioned-note';
      mentionedNote.textContent = 'Im Text erw\u00e4hnt, aber nicht als Quelle zitiert: ' + run.competitor_mentioned_only.join(', ');
      wrap.appendChild(mentionedNote);
    }

    return wrap;
  }

  // GEÄNDERT (13.09.2026): zweiter Parameter enableCitations steuert, ob
  // Prompt-Zeilen aufklappbar sind. Nur in der Topic-Detailansicht true
  // (siehe renderTopicDetailView), da nur dort ein Prompt eindeutig einem
  // Topic zugeordnet ist, das der /citations-Endpoint braucht. In der
  // Domain-Übersicht sind Prompts über mehrere Topics aggregiert.
  function renderPromptsByPhase(prompts, enableCitations) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Prompts nach Phase';
    section.appendChild(heading);

    PHASE_ORDER.forEach(function (phase) {
      var promptsInPhase = prompts.filter(function (p) { return p.phase === phase; });
      if (promptsInPhase.length === 0) return;

      var phaseHeading = document.createElement('p');
      phaseHeading.className = 'cvz-phase-heading';
      phaseHeading.textContent = PHASE_LABELS[phase] || phase;
      section.appendChild(phaseHeading);

      var list = document.createElement('div');
      list.className = 'cvz-prompt-list';
      promptsInPhase.forEach(function (prompt) {
        var dotClass = prompt.visibility_status ? 'cvz-dot-' + prompt.visibility_status : 'cvz-dot-unknown';
        var statusLabel = prompt.visibility_status ? VISIBILITY_LABELS[prompt.visibility_status] : 'Unbekannt';
        // NEU (13.09.2026): Zitierungs-Anzahl direkt in der Zeile, statt
        // erst nach dem Aufklappen sichtbar zu sein. cited_count/total_runs
        // kommen vom Backend (main.py: _compute_citation_counts_by_prompt),
        // können null sein, wenn noch keine Läufe für diesen Prompt
        // existieren.
        var citationBadge = (prompt.total_runs !== null && prompt.total_runs !== undefined && prompt.total_runs > 0)
          ? '<span class="cvz-prompt-citation-count">' + prompt.cited_count + '/' + prompt.total_runs + ' zitiert</span>'
          : '';

        var row = document.createElement('div');
        row.className = 'cvz-prompt-row' + (enableCitations ? ' cvz-prompt-row-clickable' : '');
        if (enableCitations) row.setAttribute('data-cvz-prompt-toggle', prompt.id);
        row.innerHTML =
          '<span class="cvz-dot ' + dotClass + '" title="' + escapeHtml(statusLabel) + '"></span>' +
          '<span class="cvz-prompt-text">' + escapeHtml(prompt.prompt_text) + '</span>' +
          citationBadge +
          '<span class="cvz-prompt-source">' +
            // GEÄNDERT (13.09.2026): war prompt.source (Herkunft, z.B.
            // "manual"), gemeint war aber prompt.prompt_type
            // (stable_core/discovery). Vorher stand hier bei JEDEM Prompt
            // "Discovery", egal was tatsächlich hinterlegt war.
            (prompt.prompt_type === 'stable_core' ? 'Stable Core' : 'Discovery') +
            (prompt.topic_name ? ' · ' + escapeHtml(prompt.topic_name) : '') +
          '</span>' +
          (enableCitations ? '<span class="cvz-prompt-expand-chevron">' + (state.expandedPromptId === prompt.id ? '\u25be' : '\u25b8') + '</span>' : '');
        list.appendChild(row);

        if (enableCitations && state.expandedPromptId === prompt.id) {
          list.appendChild(renderPromptExpansion(prompt));
        }
      });
      section.appendChild(list);
    });

    return section;
  }

  function renderGscBlock(gscRows) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Google-Search-Console-Performance';
    section.appendChild(heading);

    if (!gscRows || gscRows.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine GSC-Daten verfügbar.';
      section.appendChild(empty);
      return section;
    }

    var table = document.createElement('table');
    table.className = 'cvz-table';
    table.innerHTML = '<thead><tr><th>Suchanfrage</th><th>Klicks</th><th>Impressionen</th><th>CTR</th><th>Position</th></tr></thead>';
    var tbody = document.createElement('tbody');
    gscRows.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(row.query) + '</td>' +
        '<td>' + escapeHtml(row.clicks) + '</td>' +
        '<td>' + escapeHtml(row.impressions) + '</td>' +
        '<td>' + escapeHtml((row.ctr * 100).toFixed(1)) + '%</td>' +
        '<td>' + escapeHtml(row.position.toFixed(1)) + '</td>';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return '\u2013';
    var diffSeconds = Math.round((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSeconds < 5) return 'gerade eben';
    if (diffSeconds < 60) return 'vor ' + diffSeconds + ' Sek.';
    var diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return 'vor ' + diffMinutes + ' Min.';
    var diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return 'vor ' + diffHours + ' Std.';
    var diffDays = Math.round(diffHours / 24);
    return 'vor ' + diffDays + ' Tag' + (diffDays === 1 ? '' : 'en');
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // =========================================================================
  // STYLES
  // =========================================================================
  function injectStyles() {
    if (document.getElementById('cvz-visibility-styles')) return;

    var style = document.createElement('style');
    style.id = 'cvz-visibility-styles';
    style.textContent =
      '#cvz-visibility-app {' +
        '--cvz-navy: #0d1117;' +
        '--cvz-navy-raised: #141b24;' +
        '--cvz-teal: #4fd1c5;' +
        '--cvz-red: #e5484d;' +
        '--cvz-amber: #f2b13d;' +
        '--cvz-green: #4fd1c5;' +
        '--cvz-text: #e6edf3;' +
        '--cvz-text-muted: #8b98a5;' +
        '--cvz-border: #232b36;' +
        'font-family: "Geist", sans-serif;' +
        'color: var(--cvz-text);' +
        // Fester Mindestplatz, damit die Seite (und damit der Footer
        // darunter) nicht bei jedem Render-Wechsel springt, z.B. wenn ein
        // "Sammelt Daten"-Zustand kurz ist und die volle Detailansicht viel
        // länger. Wächst bei Bedarf noch darüber hinaus, schrumpft aber nie
        // darunter.
        'min-height: 640px;' +
      '}' +
      '#cvz-visibility-app h3 { font-family: "Syne", sans-serif; }' +

      '@keyframes cvz-spin { to { transform: rotate(360deg); } }' +
      '.cvz-spinner {' +
        'display: inline-block; width: 14px; height: 14px; margin-right: 8px; vertical-align: middle;' +
        'border: 2px solid var(--cvz-border); border-top-color: var(--cvz-teal); border-radius: 50%;' +
        'animation: cvz-spin 0.8s linear infinite;' +
      '}' +

      '.cvz-picker { position: relative; margin-bottom: 16px; max-width: 360px; }' +
      '.cvz-picker-input {' +
        'width: 100%; box-sizing: border-box; font-family: "Geist", sans-serif; font-size: 14px;' +
        'padding: 10px 12px; background: var(--cvz-navy-raised); color: var(--cvz-text);' +
        'border: 1px solid var(--cvz-border); border-radius: 0;' +
      '}' +
      '.cvz-picker-input:focus { outline: none; border-color: var(--cvz-teal); }' +
      '.cvz-picker-dropdown {' +
        'position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10;' +
        'background: var(--cvz-navy-raised); border: 1px solid var(--cvz-border);' +
        'max-height: 320px; overflow-y: auto;' +
      '}' +
      '.cvz-picker-group-label { font-size: 11px; color: var(--cvz-text-muted); padding: 8px 12px 4px; }' +
      '.cvz-picker-item { display: flex; flex-direction: column; padding: 8px 12px; cursor: pointer; }' +
      '.cvz-picker-item:hover { background: rgba(79, 209, 197, 0.08); }' +
      '.cvz-picker-item-title { font-size: 14px; color: var(--cvz-text); }' +
      '.cvz-picker-item-sub { font-size: 12px; color: var(--cvz-text-muted); }' +
      '.cvz-picker-empty { padding: 12px; font-size: 13px; color: var(--cvz-text-muted); }' +

      '.cvz-topic-usage-badge { font-size: 13px; color: var(--cvz-text-muted); margin: 0 0 16px; }' +

      '.cvz-collecting-banner {' +
        'border-left: 3px solid var(--cvz-teal); padding: 12px 16px; margin: 0 0 16px; display: flex;' +
        'align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;' +
      '}' +
      '.cvz-collecting-banner-text { font-size: 13px; color: var(--cvz-text); margin: 0; flex: 1 1 320px; }' +
      '.cvz-error-banner { border-left-color: var(--cvz-red); }' +

      '.cvz-create-form { margin-bottom: 16px; }' +
      '.cvz-create-toggle-btn {' +
        'font-family: "Geist", sans-serif; font-size: 13px; color: var(--cvz-teal);' +
        'background: none; border: 1px solid var(--cvz-teal); padding: 8px 14px; border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-create-form-fields { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }' +
      '.cvz-create-input {' +
        'font-family: "Geist", sans-serif; font-size: 14px; padding: 8px 10px; flex: 1; min-width: 180px;' +
        'background: var(--cvz-navy-raised); color: var(--cvz-text); border: 1px solid var(--cvz-border); border-radius: 0;' +
      '}' +
      '.cvz-create-submit-btn {' +
        'font-family: "Geist", sans-serif; font-size: 14px; padding: 8px 16px;' +
        'background: var(--cvz-teal); color: var(--cvz-navy); border: none; border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-create-submit-btn:disabled { opacity: 0.6; cursor: default; }' +
      '.cvz-create-error { width: 100%; font-size: 13px; color: var(--cvz-red); margin: 6px 0 0; }' +
      '.cvz-create-buy-btn {' +
        'font-family: "Geist", sans-serif; font-size: 14px; padding: 8px 16px; margin-top: 8px;' +
        'background: none; color: var(--cvz-teal); border: 1px solid var(--cvz-teal); border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-create-buy-btn:disabled { opacity: 0.6; cursor: default; }' +

      '.cvz-back-btn {' +
        'font-family: "Geist", sans-serif; font-size: 13px; color: var(--cvz-text-muted);' +
        'background: none; border: none; cursor: pointer; padding: 0 0 16px; display: block;' +
      '}' +
      '.cvz-back-btn:hover { color: var(--cvz-teal); }' +

      '.cvz-card {' +
        'background: var(--cvz-navy-raised); border: 1px solid var(--cvz-border);' +
        'border-radius: 0; padding: 20px; cursor: default;' +
      '}' +
      '.cvz-card-placeholder { margin-bottom: 16px; }' +
      '.cvz-card-placeholder-text { color: var(--cvz-text-muted); font-size: 14px; margin: 0; }' +
      '.cvz-card-eyebrow { font-size: 12px; color: var(--cvz-text-muted); margin: 0 0 8px; }' +
      '.cvz-domain-header { margin-bottom: 24px; }' +

      '.cvz-tab-nav { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--cvz-border); margin-bottom: 20px; }' +
      '.cvz-tab-btn {' +
        'font-family: "Geist", sans-serif; font-size: 14px; padding: 10px 16px; margin-bottom: -1px;' +
        'background: none; color: var(--cvz-text-muted); border: none; border-bottom: 2px solid transparent;' +
        'border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-tab-btn:hover { color: var(--cvz-text); }' +
      '.cvz-tab-btn-active { color: var(--cvz-teal); border-bottom-color: var(--cvz-teal); }' +

      // GEÄNDERT (13.09.2026): Timeline (Favicon-Wand) entfernt, siehe
      // renderCompetitorInsightSection. .cvz-timeline-logo bleibt bestehen,
      // wird jetzt für die freistehenden Favicons in Prompt-Quellen und
      // Wettbewerber-Karten genutzt (kein Stapel mehr, daher vereinfacht).
      '.cvz-timeline-logo {' +
        'width: 20px; height: 20px; border-radius: 0; border: 1px solid var(--cvz-border);' +
        'background: var(--cvz-text); cursor: pointer; display: inline-block; vertical-align: middle;' +
      '}' +
      '.cvz-inline-favicon {' +
        'width: 16px; height: 16px; border-radius: 0; border: 1px solid var(--cvz-border);' +
        'background: var(--cvz-text); vertical-align: middle; margin-right: 6px;' +
      '}' +

      '.cvz-status-badge { font-size: 12px; padding: 3px 8px; border: 1px solid; }' +
      '.cvz-status-hint { display: block; font-size: 11px; color: var(--cvz-text-muted); margin-top: 4px; }' +
      '.cvz-retry-btn {' +
        'display: block; margin-top: 4px; font-family: "Geist", sans-serif; font-size: 11px; padding: 2px 8px;' +
        'background: none; color: var(--cvz-teal); border: 1px solid var(--cvz-teal); border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-retry-btn:disabled { opacity: 0.6; cursor: default; }' +
      '.cvz-status-active { color: var(--cvz-teal); border-color: var(--cvz-teal); }' +
      '.cvz-status-collecting { color: var(--cvz-amber); border-color: var(--cvz-amber); }' +
      '.cvz-status-error { color: var(--cvz-red); border-color: var(--cvz-red); }' +
      '.cvz-status-archived { color: var(--cvz-text-muted); border-color: var(--cvz-border); }' +

      '.cvz-section { margin-bottom: 24px; }' +
      '.cvz-section-label { font-size: 12px; color: var(--cvz-text-muted); margin: 0 0 8px; }' +
      '.cvz-section-title { margin: 0 0 4px; font-size: 22px; }' +

      '.cvz-summary-card { margin-bottom: 24px; }' +
      '.cvz-summary-text { font-size: 15px; line-height: 1.5; margin: 12px 0 0; }' +

      '.cvz-opportunity-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }' +
      '.cvz-opportunity-card { border-left: 3px solid var(--cvz-red); padding: 16px; }' +
      '.cvz-idea-card { border-left: 3px solid var(--cvz-teal); padding: 16px; }' +
      '.cvz-opportunity-type { margin: 0 0 6px; font-size: 13px; font-weight: 600; color: var(--cvz-red); }' +
      '.cvz-opportunity-description { margin: 0 0 8px; font-size: 14px; line-height: 1.4; color: var(--cvz-text); }' +
      '.cvz-opportunity-topic { margin: 0; font-size: 11px; color: var(--cvz-text-muted); }' +

      // NEU (13.09.2026): Prioritäts-Färbung für Content-Lücken-Karten.
      '.cvz-gap-priority-hoch { border-left-color: var(--cvz-red); }' +
      '.cvz-gap-priority-mittel { border-left-color: var(--cvz-amber); }' +
      '.cvz-gap-priority-niedrig { border-left-color: var(--cvz-teal); }' +
      '.cvz-gap-priority-hoch .cvz-opportunity-type { color: var(--cvz-red); }' +
      '.cvz-gap-priority-mittel .cvz-opportunity-type { color: var(--cvz-amber); }' +
      '.cvz-gap-priority-niedrig .cvz-opportunity-type { color: var(--cvz-teal); }' +

      '.cvz-table { width: 100%; border-collapse: collapse; font-size: 14px; }' +
      '.cvz-table th { text-align: left; font-weight: 600; color: var(--cvz-text-muted); font-size: 12px; padding: 8px 12px; border-bottom: 1px solid var(--cvz-border); }' +
      '.cvz-table td { padding: 8px 12px; border-bottom: 1px solid var(--cvz-border); }' +
      '.cvz-table-clickable tbody tr { cursor: pointer; }' +
      '.cvz-table-clickable tbody tr:hover { background: rgba(79, 209, 197, 0.06); }' +

      '.cvz-phase-heading { font-family: "Syne", sans-serif; font-size: 14px; margin: 16px 0 8px; color: var(--cvz-text-muted); }' +
      '.cvz-prompt-list { display: flex; flex-direction: column; gap: 4px; }' +
      '.cvz-prompt-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 14px; }' +
      '.cvz-prompt-text { flex: 1; }' +
      '.cvz-prompt-source { font-size: 11px; color: var(--cvz-text-muted); }' +
      '.cvz-prompt-citation-count { font-size: 11px; color: var(--cvz-teal); white-space: nowrap; }' +

      // NEU (13.09.2026): aufklappbare Prompt-Zeile + Engine-/Lauf-Tabs +
      // Antwort- und Quellen-Darstellung im Prompts-Tab.
      '.cvz-prompt-row-clickable { cursor: pointer; }' +
      '.cvz-prompt-row-clickable:hover { background: rgba(79, 209, 197, 0.06); }' +
      '.cvz-prompt-expand-chevron { color: var(--cvz-text-muted); font-size: 11px; }' +
      '.cvz-prompt-expansion { margin: 4px 0 12px 18px; padding: 14px; border-left: 2px solid var(--cvz-teal); background: rgba(79, 209, 197, 0.03); }' +
      '.cvz-prompt-engine-nav, .cvz-prompt-run-nav { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }' +
      '.cvz-prompt-engine-btn, .cvz-prompt-run-btn {' +
        'font-family: "Geist", sans-serif; font-size: 12px; padding: 4px 10px;' +
        'background: none; color: var(--cvz-text-muted); border: 1px solid var(--cvz-border); border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-prompt-engine-btn-active, .cvz-prompt-run-btn-active { color: var(--cvz-teal); border-color: var(--cvz-teal); }' +
      '.cvz-prompt-run-status { font-size: 13px; margin: 0 0 10px; color: var(--cvz-text); }' +
      '.cvz-prompt-answer { font-size: 13px; line-height: 1.5; margin-bottom: 14px; }' +
      '.cvz-prompt-answer h4, .cvz-prompt-answer h5 { font-size: 13px; margin: 10px 0 4px; color: var(--cvz-text-muted); }' +
      '.cvz-prompt-answer p { margin: 0 0 8px; }' +
      '.cvz-prompt-answer ul { margin: 0 0 8px; padding-left: 18px; }' +
      '.cvz-prompt-answer a { color: var(--cvz-teal); }' +
      '.cvz-prompt-source-list { display: flex; flex-direction: column; gap: 6px; }' +
      '.cvz-prompt-source-item {' +
        'display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--cvz-text); text-decoration: none;' +
      '}' +
      '.cvz-prompt-source-item:hover { color: var(--cvz-teal); }' +
      '.cvz-prompt-source-competitor { font-weight: 600; }' +
      '.cvz-competitor-badge {' +
        'font-size: 10px; padding: 1px 6px; border: 1px solid var(--cvz-red); color: var(--cvz-red); margin-left: 4px;' +
      '}' +
      '.cvz-prompt-mentioned-note { margin-top: 8px; }' +

      '.cvz-dot { width: 8px; height: 8px; flex-shrink: 0; display: inline-block; }' +
      '.cvz-dot-green { background: var(--cvz-green); }' +
      '.cvz-dot-yellow { background: var(--cvz-amber); }' +
      '.cvz-dot-red { background: var(--cvz-red); }' +
      '.cvz-dot-unknown { background: var(--cvz-border); }' +

      '.cvz-chart-svg { width: 100%; height: auto; display: block; }' +
      '.cvz-chart-axis { stroke: var(--cvz-border); stroke-width: 1; }' +
      '.cvz-chart-line { fill: none; stroke: var(--cvz-teal); stroke-width: 2; }' +
      '.cvz-chart-dot { fill: var(--cvz-teal); }' +
      '.cvz-chart-caption { font-size: 12px; color: var(--cvz-text-muted); margin: 8px 0 0; }' +

      // NEU (13.09.2026): Legende für den Mehrfach-Linien-Chart
      // (Sichtbarkeits-Verlauf, Rank-Verlauf).
      '.cvz-chart-legend { display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap; }' +
      '.cvz-chart-legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--cvz-text-muted); }' +
      '.cvz-legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }' +
      '.cvz-legend-marker { width: 2px; height: 10px; background: var(--cvz-text-muted); display: inline-block; }' +
      '.cvz-chart-marker-line { stroke: var(--cvz-text-muted); stroke-width: 1; stroke-dasharray: 3,3; opacity: 0.7; }' +
      '.cvz-chart-marker-dot { fill: var(--cvz-text-muted); cursor: pointer; }' +
      '.cvz-chart-hit { cursor: pointer; }' +
      '.cvz-chart-dot { cursor: pointer; }' +

      // NEU (13.09.2026): Wochendetail-Kachel.
      '.cvz-week-detail { margin-top: 12px; border-left: 2px solid var(--cvz-teal); }' +
      '.cvz-week-detail-header { display: flex; align-items: center; justify-content: space-between; }' +
      '.cvz-week-detail-close-btn {' +
        'background: none; border: none; color: var(--cvz-text-muted); font-size: 20px; line-height: 1; cursor: pointer; padding: 0 4px;' +
      '}' +
      '.cvz-week-detail-row { font-size: 13px; margin: 4px 0; color: var(--cvz-text); }' +

      // NEU (13.09.2026): Changelog-Formular + Liste.
      '.cvz-changelog-form { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: flex-start; }' +
      '.cvz-changelog-input {' +
        'flex: 1; min-width: 240px; font-family: "Geist", sans-serif; font-size: 14px; padding: 8px 10px;' +
        'background: var(--cvz-navy-raised); color: var(--cvz-text); border: 1px solid var(--cvz-border); border-radius: 0;' +
        'resize: vertical;' +
      '}' +
      '.cvz-changelog-submit-btn {' +
        'font-family: "Geist", sans-serif; font-size: 14px; padding: 8px 16px;' +
        'background: var(--cvz-teal); color: var(--cvz-navy); border: none; border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-changelog-submit-btn:disabled { opacity: 0.6; cursor: default; }' +
      '.cvz-changelog-more-btn {' +
        'margin-top: 10px; font-family: "Geist", sans-serif; font-size: 13px; padding: 6px 14px;' +
        'background: none; color: var(--cvz-teal); border: 1px solid var(--cvz-teal); border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-changelog-list { display: flex; flex-direction: column; gap: 10px; }' +
      '.cvz-changelog-item { border-left: 2px solid var(--cvz-border); padding: 4px 0 4px 12px; }' +
      '.cvz-changelog-item-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }' +
      '.cvz-changelog-text { font-size: 14px; margin: 0 0 2px; flex: 1; }' +
      '.cvz-changelog-meta { font-size: 11px; color: var(--cvz-text-muted); margin: 0; }' +
      '.cvz-changelog-delete-btn {' +
        'background: none; border: none; color: var(--cvz-text-muted); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px; flex-shrink: 0;' +
      '}' +
      '.cvz-changelog-delete-btn:hover { color: var(--cvz-red); }' +
      '.cvz-changelog-toggle-deleted-btn {' +
        'margin-top: 14px; font-family: "Geist", sans-serif; font-size: 12px; padding: 4px 0;' +
        'background: none; color: var(--cvz-text-muted); border: none; text-decoration: underline; cursor: pointer;' +
      '}' +
      '.cvz-changelog-item-deleted { border-left-color: var(--cvz-border); opacity: 0.75; }' +
      '.cvz-changelog-restore-btn {' +
        'font-family: "Geist", sans-serif; font-size: 11px; padding: 3px 10px; flex-shrink: 0;' +
        'background: none; color: var(--cvz-teal); border: 1px solid var(--cvz-teal); border-radius: 0; cursor: pointer;' +
      '}';

    document.head.appendChild(style);
  }

  function showNoUserMessage() {
    var container = document.getElementById('cvz-visibility-app');
    if (container) {
      container.innerHTML = '<p>Bitte logge dich ein, um das Dashboard zu sehen.</p>';
    }
  }

  function showErrorMessage(message) {
    var container = document.getElementById('cvz-visibility-app');
    if (container) {
      container.innerHTML = '<p>' + message + '</p>';
    }
  }

  // =========================================================================
  // START
  // =========================================================================
  document.addEventListener('DOMContentLoaded', init);
})();
