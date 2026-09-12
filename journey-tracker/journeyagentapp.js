(function () {
  'use strict';

  // =========================================================================
  // KONFIGURATION
  // =========================================================================
  var CONFIG = {
    apiBaseUrl: 'https://<railway-service>.up.railway.app',
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
        { keyword: 'landingpage optimierung', search_volume: 260, source: 'keyword' },
        { keyword: 'landingpage optimierung tools', search_volume: 340, source: 'gsc' },
        { keyword: 'landingpage optimierung checkliste', search_volume: 190, source: 'gsc' },
        { keyword: 'landingpage optimierung agentur', search_volume: 210, source: 'gsc' },
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
        { id: 'p1', phase: 'exploration', prompt_text: 'Was ist Landingpage-Optimierung?', source: 'stable_core', visibility_status: 'green' },
        { id: 'p2', phase: 'exploration', prompt_text: 'Warum konvertiert meine Landingpage nicht?', source: 'stable_core', visibility_status: 'red' },
        { id: 'p3', phase: 'exploration', prompt_text: 'Wie finde ich heraus, wo meine Landingpage schwächelt?', source: 'discovery', visibility_status: 'yellow' },
        { id: 'p4', phase: 'exploration', prompt_text: 'Landingpage-Optimierung Checkliste', source: 'stable_core', visibility_status: 'red' },
        { id: 'p5', phase: 'evaluation', prompt_text: 'Beste Tools für Landingpage-Optimierung im B2B-Bereich', source: 'stable_core', visibility_status: 'red' },
        { id: 'p6', phase: 'evaluation', prompt_text: 'Was kostet eine professionelle Landingpage-Optimierung?', source: 'stable_core', visibility_status: 'yellow' },
        { id: 'p7', phase: 'evaluation', prompt_text: 'Lohnt sich ein CRO-Tool oder reicht Google Analytics?', source: 'discovery', visibility_status: 'red' },
        { id: 'p8', phase: 'evaluation', prompt_text: 'Landingpage-Optimierung: Agentur vs. Inhouse', source: 'stable_core', visibility_status: 'red' },
        { id: 'p9', phase: 'comparison', prompt_text: 'Convertlyze vs. VWO für Landingpage-Optimierung', source: 'stable_core', visibility_status: 'red' },
        { id: 'p10', phase: 'comparison', prompt_text: 'Landingpage-Optimierung Software im Vergleich', source: 'stable_core', visibility_status: 'red' },
        { id: 'p11', phase: 'comparison', prompt_text: 'Unterschied zwischen A/B-Testing und CRO-Beratung', source: 'discovery', visibility_status: 'yellow' },
        { id: 'p12', phase: 'comparison', prompt_text: 'Welche Landingpage-Analyse-Tools sind DACH-kalibriert?', source: 'stable_core', visibility_status: 'green' },
        { id: 'p13', phase: 'decision', prompt_text: 'Landingpage-Optimierung für B2B SaaS beauftragen', source: 'stable_core', visibility_status: 'red' },
        { id: 'p14', phase: 'decision', prompt_text: 'Wie starte ich eine Landingpage-Analyse?', source: 'stable_core', visibility_status: 'yellow' },
        { id: 'p15', phase: 'decision', prompt_text: 'Landingpage-Optimierung ohne Agentur-Vertrag', source: 'discovery', visibility_status: 'red' },
        { id: 'p16', phase: 'decision', prompt_text: 'Kostenlose Landingpage-Analyse testen', source: 'stable_core', visibility_status: 'yellow' },
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
        { keyword: 'cro beratung', search_volume: 90, source: 'keyword' },
        { keyword: 'cro beratung agentur', search_volume: 120, source: 'gsc' },
      ],
      prompts: [
        { id: 'p17', phase: 'decision', prompt_text: 'CRO Beratung buchen, worauf achten?', source: 'stable_core', visibility_status: 'yellow' },
      ],
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
  // vom Backend-Fortschritt gebaut werden kann.
  var MOCK_CITATION_TREND = {
    'topic-1': [
      { week: '2026-07-13', domains: [
        { domain: 'vwo.com', citations: 2, url: 'https://vwo.com/blog/cro-tools/' },
        { domain: 'hubspot.de', citations: 1, url: 'https://hubspot.de/blog/landingpage-optimierung' },
      ] },
      { week: '2026-07-20', domains: [
        { domain: 'vwo.com', citations: 2, url: 'https://vwo.com/blog/cro-tools/' },
        { domain: 'hubspot.de', citations: 1, url: 'https://hubspot.de/blog/landingpage-optimierung' },
        { domain: 'konversion.digital', citations: 1, url: 'https://konversion.digital/ratgeber/' },
      ] },
      { week: '2026-07-27', domains: [
        { domain: 'vwo.com', citations: 3, url: 'https://vwo.com/blog/cro-tools/' },
        { domain: 'konversion.digital', citations: 1, url: 'https://konversion.digital/ratgeber/' },
      ] },
      { week: '2026-08-03', domains: [
        { domain: 'vwo.com', citations: 2, url: 'https://vwo.com/blog/cro-tools/' },
        { domain: 'hubspot.de', citations: 2, url: 'https://hubspot.de/blog/landingpage-optimierung' },
        { domain: 'diemarkenmacher.ch', citations: 1, url: 'https://diemarkenmacher.ch/insights/' },
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
      search_queries: data.search_queries || [],
      competitors: [],
      gsc_rows: [],
      prompts: (data.prompts || []).map(function (p) {
        return Object.assign({ visibility_status: null }, p);
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

  var KEYWORD_SOURCE_LABELS = {
    gsc:     'Google Search Console',
    keyword: 'Keyword-Recherche',
    paa:     'People Also Ask',
    context: 'Kontext',
    manual:  'Manuell',
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
    var logo = event.target.closest('[data-cvz-source-url]');
    if (logo) {
      window.open(logo.getAttribute('data-cvz-source-url'), '_blank', 'noopener');
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
      // Mock-Fall: einfach lokal auf 'active' setzen, es gibt kein echtes
      // Backend, das hier etwas neu berechnen könnte.
      var mockTopic = getTopicById(topicId);
      if (mockTopic) mockTopic.status = 'active';
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
        tabContent.appendChild(renderCompetitorTable(data.competitors));
        tabContent.appendChild(renderSourceProfilesSection(data.sourceProfiles));
        break;
      case 'keywords':
        tabContent.appendChild(renderKeywordsTable(data.keywords));
        var domainPositioning = renderPositioningInsightsList(data.positioningInsights);
        if (domainPositioning) tabContent.appendChild(domainPositioning);
        break;
      case 'prompts':
        tabContent.appendChild(renderPromptsByPhase(data.prompts));
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
        '<td><span class="cvz-status-badge ' + status.className + '">' + status.label + '</span>' +
          (topic.status === 'collecting' ? '<span class="cvz-status-hint">Erster Durchlauf l\u00e4uft, kann bis zu 60 Sek. dauern</span>' : '') +
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
    wrap.appendChild(renderTabNav(TOPIC_TABS, state.activeSubTab));

    var tabContent = document.createElement('div');
    tabContent.className = 'cvz-tab-content';

    switch (state.activeSubTab) {
      case 'wettbewerber':
        tabContent.appendChild(renderCompetitorCitationTimeline(state.citationTrendCache[state.activeTopicId], state.isLoadingCitationTrend));
        tabContent.appendChild(renderCompetitorTable(detail.competitors));
        tabContent.appendChild(renderSourceProfilesSection(detail.source_profiles));
        break;
      case 'keywords':
        tabContent.appendChild(renderKeywordsTable(detail.search_queries));
        var positioning = renderPositioningInsight(detail.positioning_insight);
        if (positioning) tabContent.appendChild(positioning);
        break;
      case 'prompts':
        tabContent.appendChild(renderPromptsByPhase(detail.prompts));
        break;
      case 'gsc':
        tabContent.appendChild(renderGscBlock(detail.gsc_rows));
        break;
      case 'uebersicht':
      default:
        tabContent.appendChild(renderOpportunitySection(detail.opportunities));
        tabContent.appendChild(renderContentIdeasSection(detail.content_ideas));
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

  var WEEKDAY_MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  function formatShortDate(isoDate) {
    var parts = isoDate.split('-');
    var monthIndex = parseInt(parts[1], 10) - 1;
    return parseInt(parts[2], 10) + '. ' + (WEEKDAY_MONTHS_DE[monthIndex] || parts[1]);
  }

  function renderCompetitorCitationTimeline(weeks, isLoading) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Wettbewerber-Zitationen im Verlauf';
    section.appendChild(heading);

    if (isLoading) {
      var loading = document.createElement('p');
      loading.className = 'cvz-card-placeholder-text';
      loading.textContent = 'Lädt...';
      section.appendChild(loading);
      return section;
    }

    if (!weeks || weeks.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Zitations-Historie verfügbar.';
      section.appendChild(empty);
      return section;
    }

    var card = document.createElement('div');
    card.className = 'cvz-card cvz-timeline-card';

    var track = document.createElement('div');
    track.className = 'cvz-timeline-track';

    weeks.forEach(function (weekEntry) {
      var col = document.createElement('div');
      col.className = 'cvz-timeline-week';

      var stack = document.createElement('div');
      stack.className = 'cvz-timeline-stack';

      // Meistzitierte zuerst (Sortierung kommt schon so vom Backend/Mock).
      // Kein Deckel mehr: Stapel wächst mit der Anzahl zitierter Domains,
      // Übereinanderlegen (siehe CSS) hält es trotzdem kompakt.
      weekEntry.domains.forEach(function (d) {
        var img = document.createElement('img');
        img.className = 'cvz-timeline-logo';
        img.src = 'https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(d.domain);
        img.alt = d.domain;
        img.title = d.domain + ' (' + d.citations + 'x zitiert)';
        img.setAttribute('data-cvz-source-url', d.url || ('https://' + d.domain));
        stack.appendChild(img);
      });

      col.appendChild(stack);

      var label = document.createElement('span');
      label.className = 'cvz-timeline-week-label';
      label.textContent = formatShortDate(weekEntry.week);
      col.appendChild(label);

      track.appendChild(col);
    });

    card.appendChild(track);
    section.appendChild(card);
    return section;
  }

  function renderCompetitorTable(competitors) {
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

  function renderKeywordsTable(keywords) {
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

    var table = document.createElement('table');
    table.className = 'cvz-table';
    table.innerHTML = '<thead><tr><th>Keyword</th><th>Suchvolumen</th><th>Quelle</th></tr></thead>';
    var tbody = document.createElement('tbody');
    keywords.forEach(function (kw) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(kw.keyword) + '</td>' +
        '<td>' + (kw.search_volume == null ? '\u2013' : escapeHtml(kw.search_volume)) + '</td>' +
        '<td>' + escapeHtml(KEYWORD_SOURCE_LABELS[kw.source] || kw.source) + '</td>';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  function renderPromptsByPhase(prompts) {
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

        var row = document.createElement('div');
        row.className = 'cvz-prompt-row';
        row.innerHTML =
          '<span class="cvz-dot ' + dotClass + '" title="' + escapeHtml(statusLabel) + '"></span>' +
          '<span class="cvz-prompt-text">' + escapeHtml(prompt.prompt_text) + '</span>' +
          '<span class="cvz-prompt-source">' +
            (prompt.source === 'stable_core' ? 'Stable Core' : 'Discovery') +
            (prompt.topic_name ? ' · ' + escapeHtml(prompt.topic_name) : '') +
          '</span>';
        list.appendChild(row);
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
      '}' +
      '#cvz-visibility-app h3 { font-family: "Syne", sans-serif; }' +

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

      '.cvz-timeline-card { overflow-x: auto; }' +
      '.cvz-timeline-track { display: flex; gap: 20px; align-items: flex-end; padding: 8px 4px 4px; min-width: max-content; }' +
      '.cvz-timeline-week { display: flex; flex-direction: column; align-items: center; gap: 6px; }' +
      '.cvz-timeline-stack { display: flex; flex-direction: column-reverse; align-items: center; }' +
      '.cvz-timeline-logo {' +
        'width: 24px; height: 24px; border-radius: 0; border: 1px solid var(--cvz-navy);' +
        'background: var(--cvz-text); margin-top: -8px; cursor: pointer; display: block;' +
      '}' +
      '.cvz-timeline-logo:first-child { margin-top: 0; }' +
      '.cvz-timeline-logo:hover { outline: 2px solid var(--cvz-teal); position: relative; z-index: 5; }' +
      '.cvz-timeline-week-label { font-size: 11px; color: var(--cvz-text-muted); white-space: nowrap; }' +

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

      '.cvz-dot { width: 8px; height: 8px; flex-shrink: 0; display: inline-block; }' +
      '.cvz-dot-green { background: var(--cvz-green); }' +
      '.cvz-dot-yellow { background: var(--cvz-amber); }' +
      '.cvz-dot-red { background: var(--cvz-red); }' +
      '.cvz-dot-unknown { background: var(--cvz-border); }' +

      '.cvz-chart-svg { width: 100%; height: auto; display: block; }' +
      '.cvz-chart-axis { stroke: var(--cvz-border); stroke-width: 1; }' +
      '.cvz-chart-line { fill: none; stroke: var(--cvz-teal); stroke-width: 2; }' +
      '.cvz-chart-dot { fill: var(--cvz-teal); }' +
      '.cvz-chart-caption { font-size: 12px; color: var(--cvz-text-muted); margin: 8px 0 0; }';

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
