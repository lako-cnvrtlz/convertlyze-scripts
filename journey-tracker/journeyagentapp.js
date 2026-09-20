(function () {
  'use strict';

  // =========================================================================
  // KONFIGURATION
  // =========================================================================
  var CONFIG = {
    // GEFIXT (20.09.2026): Es stand ein En-Dash (–) statt eines normalen
    // Bindestrichs in der Domain ("visibility–-tracker"), dadurch liefen
    // ALLE apiFetch()-Calls gegen eine nicht existierende Adresse.
    apiBaseUrl: 'https://visibility-tracker-production-741c.up.railway.app',
    // GEFIXT (20.09.2026): Platzhalter durch die echte Supabase-Projekt-URL ersetzt.
    stripeCheckoutUrl: 'https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/stripe-topic-slot-checkout',
    useMockData: false,  // TODO: für den echten Test
  };

  var CHANGELOG_DELETED_RETENTION_DAYS = 90;

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

  var MOCK_TOPIC_DETAIL = {};

  var MOCK_DOMAIN_TREND = {
    'proj-1': { total_prompts: 17, weeks: [] },
    'proj-2': { total_prompts: 0, weeks: [] },
  };

  var MOCK_CITATION_TREND = {};

  var state = {
    memberstackId: null,
    memberToken:   null,
    projects:      [],
    activeProjectId: null,
    allTopics:     [],
    activeView:       'overview',
    activeTopicId:    null,
    activeSubTab:     'themen',
    topicDetailCache: {},
    isLoadingDetail:  false,
    activePersonaFilter: null,
    domainDashboardCache: {},
    isLoadingDomainDashboard: false,
    isRefreshingGsc: false,
    competitorSuggestionsCache: {},
    isLoadingCompetitorSuggestions: false,
    competitorManageOpen: {},
    competitorDraftDomains: {},
    isSubmittingCompetitors: false,
    manualPromptDraftText: '',
    manualPromptDraftPhase: 'exploration',
    isSubmittingManualPrompt: false,
    manualKeywordDraftText: '',
    isSubmittingManualKeyword: false,
    citationTrendCache: {},
    isLoadingCitationTrend: false,
    showCreateForm: false,
    isCreating:     false,
    createError:    null,
    limitReached:   false,
    isBuyingSlot:   false,
    topicUsage:     null,
    pollTimer:      null,
    retryingTopicId: null,
    archivingTopicId: null,
    promptCitationsCache: {},
    loadingPromptCitations: {},
    expandedPromptId: null,
    expandedPromptEngine: {},
    expandedPromptRunIndex: {},
    keywordRankHistoryCache: {},
    loadingKeywordRankHistory: {},
    expandedKeywordId: null,
    topicRankHistoryCache: {},
    isLoadingTopicRankHistory: false,
    weekDetailCache: {},
    isLoadingWeekDetail: false,
    selectedWeekDetailKey: null,
    isSubmittingChangelog: false,
    changelogVisibleCount: {},
    showDeletedChangelog: {},
    deletedChangelogCache: {},
    isLoadingDeletedChangelog: false,
    changelogDraft: '',
    changelogLocationDraft: null,
    changelogEffectDraft: null,
    changelogLocationCustomText: '',
    changelogEffectCustomText: '',
    changelogLinkSectionOpen: { keywords: false, prompts: false },
    changelogDraftLinkedIds: { keywords: [], prompts: [] },
    visibilityTrendCache: {},
    monthlyOverviewTrendCache: {},
    isLoadingMonthlyOverviewTrend: false,
    isLoadingVisibilityTrend: false,
    gscRankHistoryCache: {},
    loadingGscRankHistory: {},
    expandedGscRowId: null,
    expandedOppId: null,
    // NEU (16.09.2026): Journey-Map-Tab
    dashboardDataCache: {},
    isLoadingDashboard: false,
    isSubmittingContentChange: false,
    contentChangeDraft: { changed_at: '', change_type: 'neue_seite', description: '', url: '' },
    contentChangesCache: {},
    isLoadingContentChanges: false,
    journeyActivePhase: null,
    // NEU (17.09.2026): Phase-Filter fuer Content-Luecken und Quellen-Analyse
    gapPhaseFilter: null,
    sourcePhaseFilter: null,
    // NEU (17.09.2026): Pro-Topic gepinnte Wettbewerber fuer den Vergleichs-Chart
    chartPinnedComps: {},
    // NEU (20.09.2026): Gezielter Retry einzelner Schritte (retryStep/renderStepNotice).
    // Fehlte bisher hier, dadurch crashte retryStep beim ersten Klick
    // ("Cannot read properties of undefined").
    retryingSteps: {},
    stepPollTimer: null,
  };

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

  async function init() {
    injectStyles();
    renderInitialLoadingState();

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

    var paramTab = new URLSearchParams(window.location.search).get('cvz_tab');
    if (paramTab) state.activeSubTab = paramTab;

    var paramTopicId = new URLSearchParams(window.location.search).get('cvz_topic');
    if (paramTopicId && getTopicById(paramTopicId)) {
      await openTopicDetail(paramTopicId, false);
      if (state.activeSubTab === 'wettbewerber') {
        maybeLoadCitationTrend(paramTopicId);
      }
      return;
    }

    render();
    loadDomainDashboard(state.activeProjectId);
  }

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
      state.topicUsage = { current_count: state.allTopics.length, limit: 5, can_create: state.allTopics.length < 5 };
      return;
    }
    var data = await apiFetch('/account/topic-status');
    state.topicUsage = data;
  }

  function maybeStartPolling() {
  if (CONFIG.useMockData || state.pollTimer) return;

  var hasCollecting = state.allTopics.some(function (t) { return t.status === 'collecting' || t.status === 'analyzing'; });
  if (!hasCollecting) return;

  state.pollTimer = setInterval(async function () {
    try {
      await loadTopics();
      if (state.activeView === 'topic-detail' && state.activeTopicId) {
        var current = getTopicById(state.activeTopicId);
        if (current && current.status !== 'collecting' && current.status !== 'analyzing' && state.topicDetailCache[state.activeTopicId]) {
          var cachedTopic = state.topicDetailCache[state.activeTopicId].topic;
          if (cachedTopic && (cachedTopic.status === 'collecting' || cachedTopic.status === 'analyzing')) {
            delete state.topicDetailCache[state.activeTopicId];
            delete state.dashboardDataCache[state.activeTopicId];
            delete state.contentChangesCache[state.activeTopicId];
            delete state.visibilityTrendCache[state.activeTopicId];
            delete state.monthlyOverviewTrendCache[state.activeTopicId];
            delete state.topicRankHistoryCache[state.activeTopicId];
            await openTopicDetail(state.activeTopicId, false);
          }
        }
      }
    } catch (e) {
      console.error('[CVZ Visibility] Polling fehlgeschlagen:', e);
    }

    var stillCollecting = state.allTopics.some(function (t) { return t.status === 'collecting' || t.status === 'analyzing'; });
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
      competitor_domains: data.competitor_domains || [],
      content_gaps: data.content_gaps || [],
      competitor_insights: data.competitor_insights || [],
      changelog: data.changelog || [],
      search_queries: data.search_queries || [],
      // NEU (15.09.2026): "beste Content-Chancen", siehe main.py:
      // _compute_best_content_chances.
      best_content_chances: data.best_content_chances || [],
      // NEU (16.09.2026): Plattform-Übersicht, siehe main.py:
      // _get_cited_platforms_overview.
      cited_platforms: data.cited_platforms || [],
      // NEU (17.09.2026): KI-generierter Aktionsplan — FEHLTE bisher hier,
      // deshalb war detail.action_plan immer undefined und der Tab immer leer.
      action_plan: data.action_plan || null,
      // GEFIXT (20.09.2026): fehlten bisher komplett hier, genau wie
      // vorher schon bei action_plan (siehe Kommentar oben) — dadurch
      // waren detail.ai_knowledge / .change_assessment / .step_status /
      // .outreach_targets immer undefined und renderKnowledgeSection,
      // renderChangeAssessmentSection, renderStepNotice und
      // renderOutreachTargetsSection zeigten nie etwas an, obwohl das
      // Backend (ai_knowledge.py, change_history.py, step_tracker.py,
      // outreach_targets.py) diese Daten längst liefert.
      ai_knowledge: data.ai_knowledge || null,
      change_assessment: data.change_assessment || { summary: { anzahl: 0 }, items: [] },
      step_status: data.step_status || [],
      outreach_targets: data.outreach_targets || null,
      competitors: [],
      gsc_rows: (data.search_queries || [])
        .filter(function (q) { return q.source === 'gsc_near_miss'; })
        .map(function (q) {
          var impressions = q.gsc_impressions || 0;
          var clicks = q.gsc_clicks || 0;
          return {
            id: q.id,
            query: q.keyword,
            clicks: clicks,
            impressions: impressions,
            ctr: impressions > 0 ? clicks / impressions : 0,
            position: q.gsc_position || 0,
            // NEU (15.09.2026): SERP-Ergebnisse/-Features auch für
            // GSC-Zeilen durchreichen, siehe renderGscRowExpansion.
            top_serp_results: q.top_serp_results || null,
            serp_features: q.serp_features || null,
            serp_checked_at: q.serp_checked_at || null,
            // NEU (16.09.2026): URL der rankenden Seite durchreichen.
            // Verschiedene Backend-Feldnamen probieren (gsc_page, page_url, top_url).
            page_url: q.page_url || q.gsc_page || q.top_url || q.ranking_url || null,
          };
        }),
      prompts: (data.prompts || []).map(function (p) {
        return Object.assign({ visibility_status: null }, p, { phase: p.messymiddle_phase || null });
      }),
    };
  }

  async function loadDomainDashboardData(projectId) {
    var data = await apiFetch('/projects/' + projectId + '/dashboard');
    return {
      trend: data.trend || [],
      opportunities: data.opportunities || [],
      contentIdeas: data.content_ideas || [],
    };
  }

  async function loadDomainDashboard(projectId, force) {
    if (!projectId || CONFIG.useMockData) return;
    if (!force && (state.domainDashboardCache[projectId] || state.isLoadingDomainDashboard)) return;

    state.isLoadingDomainDashboard = true;
    render();

    try {
      state.domainDashboardCache[projectId] = await loadDomainDashboardData(projectId);
    } catch (e) {
      console.error('[CVZ Visibility] Domain-Dashboard konnte nicht geladen werden:', e);
      state.domainDashboardCache[projectId] = { trend: [], opportunities: [], contentIdeas: [] };
    }

    state.isLoadingDomainDashboard = false;
    render();
  }

  async function loadCompetitorCitationTrend(topicId) {
    if (CONFIG.useMockData) {
      return MOCK_CITATION_TREND[topicId] || [];
    }
    var data = await apiFetch('/topics/' + topicId + '/competitor-citations');
    return data.weeks || [];
  }

  async function maybeLoadCitationTrend(topicId) {
    if (!topicId || state.citationTrendCache[topicId]) return;
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

  async function loadMonthlyOverviewTrend(topicId) {
    if (CONFIG.useMockData) {
      return [];
    }
    var data = await apiFetch('/topics/' + topicId + '/monthly-overview-trend');
    return data.months || [];
  }

  async function maybeLoadMonthlyOverviewTrend(topicId) {
    if (!topicId || state.monthlyOverviewTrendCache[topicId]) return;
    state.isLoadingMonthlyOverviewTrend = true;
    render();
    try {
      state.monthlyOverviewTrendCache[topicId] = await loadMonthlyOverviewTrend(topicId);
    } catch (e) {
      console.error('[CVZ Visibility] Monatsübersicht konnte nicht geladen werden:', e);
      state.monthlyOverviewTrendCache[topicId] = [];
    }
    state.isLoadingMonthlyOverviewTrend = false;
    render();
  }

  // NEU (16.09.2026): Journey-Map-Tab — lädt aggregierte Phase-Scores,
  // Share-of-Voice und Content-Changes in einem einzigen API-Call.
  async function loadDashboardData(topicId) {
    if (CONFIG.useMockData) {
      return {
        // GEÄNDERT (20.09.2026): 'google_organic' pro Phase entfernt — kein
        // Feld, das die echte API (dashboard.py) je liefert, siehe
        // CHANNEL_ORDER-Kommentar oben.
        phase_scores: {
          exploration: { chat_gpt: { score: 62, cited: 5, total: 8 }, gemini: { score: 75, cited: 6, total: 8 }, google_ai: { score: 50, cited: 4, total: 8 } },
          evaluation:  { chat_gpt: { score: 40, cited: 4, total: 10 }, gemini: { score: 55, cited: 6, total: 11 }, google_ai: { score: 36, cited: 4, total: 11 } },
          comparison:  { chat_gpt: { score: 22, cited: 2, total: 9 }, gemini: { score: 33, cited: 3, total: 9 }, google_ai: { score: 11, cited: 1, total: 9 } },
          decision:    { chat_gpt: { score: 14, cited: 1, total: 7 }, gemini: { score: 28, cited: 2, total: 7 }, google_ai: { score: 0, cited: 0, total: 7 } },
        },
        weekly_timeseries: { weeks: [], series: {} },
        share_of_voice: {
          exploration: [{ domain: 'hotjar.com', citation_rate: 75.0, cited_count: 6, total_runs: 8, content_type: 'produktseite', summary: 'Heatmap-Tool mit Fokus auf Nutzerverhaltensanalyse.', differentiation_suggestion: 'KI-gestützte Interpretation der Heatmap-Daten hervorheben.' }],
          evaluation:  [{ domain: 'optimizely.com', citation_rate: 60.0, cited_count: 6, total_runs: 10, content_type: 'produktseite', summary: 'Enterprise A/B-Testing Plattform.', differentiation_suggestion: 'Einstiegshürde und Self-Service-Fokus betonen.' }],
          comparison:  [{ domain: 'vwo.com', citation_rate: 55.0, cited_count: 5, total_runs: 9, content_type: 'vergleichsartikel', summary: 'Vergleichsseiten für CRO-Tools.', differentiation_suggestion: 'Eigene Vergleichsseite mit neutralem Ton aufbauen.' }],
          decision:    [{ domain: 'capterra.de', citation_rate: 42.0, cited_count: 3, total_runs: 7, content_type: 'review_plattform', summary: 'Software-Bewertungsplattform.', differentiation_suggestion: 'Mehr verifizierte Reviews für höhere Sichtbarkeit auf Review-Plattformen sammeln.' }],
        },
        google_organic: { score: 32, keyword_count: 6, top_keyword: 'conversion rate optimierung software' },
        content_changes: [],
      };
    }
    var data = await apiFetch('/topics/' + topicId + '/dashboard-data');
    return data;
  }

  async function maybeLoadDashboardData(topicId) {
    if (!topicId || state.dashboardDataCache[topicId]) return;
    state.isLoadingDashboard = true;
    render();
    try {
      state.dashboardDataCache[topicId] = await loadDashboardData(topicId);
    } catch (e) {
      console.error('[CVZ Visibility] Journey-Map-Daten konnten nicht geladen werden:', e);
      // Sentinel-Objekt statt null: truthy, damit maybeLoadDashboardData nicht bei
      // jedem Render einen neuen Request startet (null wäre falsy -> Endlosschleife).
      state.dashboardDataCache[topicId] = { _error: true };
    }
    state.isLoadingDashboard = false;
    render();
  }

  async function loadContentChanges(topicId) {
    if (CONFIG.useMockData) return [];
    var data = await apiFetch('/topics/' + topicId + '/content-changes');
    return data.changes || [];
  }

  async function maybeLoadContentChanges(topicId) {
    if (!topicId || state.contentChangesCache[topicId]) return;
    state.isLoadingContentChanges = true;
    render();
    try {
      state.contentChangesCache[topicId] = await loadContentChanges(topicId);
    } catch (e) {
      console.error('[CVZ Visibility] Content-Änderungen konnten nicht geladen werden:', e);
      state.contentChangesCache[topicId] = [];
    }
    state.isLoadingContentChanges = false;
    render();
  }

  async function submitContentChange(topicId) {
    var d = state.contentChangeDraft;
    if (!d.description || !d.description.trim()) return;
    if (!d.changed_at) {
      d.changed_at = new Date().toISOString().slice(0, 10);
    }
    state.isSubmittingContentChange = true;
    render();
    try {
      if (!CONFIG.useMockData) {
        var created = await apiFetch('/topics/' + topicId + '/content-changes', {
          method: 'POST',
          body: {
            changed_at: d.changed_at,
            change_type: d.change_type,
            description: d.description.trim(),
            url: d.url ? d.url.trim() : null,
            linked_search_query_ids: state.changelogDraftLinkedIds.keywords.slice(),
            linked_prompt_ids: state.changelogDraftLinkedIds.prompts.slice(),
          },
        });
        var existing = state.contentChangesCache[topicId] || [];
        state.contentChangesCache[topicId] = [created.change || created].concat(existing);
      } else {
        var mockChange = {
          id: 'mock-' + Date.now(),
          changed_at: d.changed_at,
          change_type: d.change_type,
          description: d.description.trim(),
          url: d.url ? d.url.trim() : null,
          created_at: new Date().toISOString(),
          linked_search_query_ids: state.changelogDraftLinkedIds.keywords.slice(),
          linked_prompt_ids: state.changelogDraftLinkedIds.prompts.slice(),
        };
        state.changelogDraftLinkedIds = { keywords: [], prompts: [] };
        state.changelogLinkSectionOpen = { keywords: false, prompts: false };
        state.contentChangesCache[topicId] = [mockChange].concat(state.contentChangesCache[topicId] || []);
      }
      state.contentChangeDraft = { changed_at: '', change_type: 'neue_seite', description: '', url: '' };
      state.changelogDraftLinkedIds = { keywords: [], prompts: [] };
      state.changelogLinkSectionOpen = { keywords: false, prompts: false };
    } catch (e) {
      console.error('[CVZ Visibility] Content-Änderung konnte nicht gespeichert werden:', e);
    }
    state.isSubmittingContentChange = false;
    render();
  }

  async function loadKeywordRankHistory(topicId, keyword) {
    if (CONFIG.useMockData) return [];
    var data = await apiFetch('/topics/' + topicId + '/rank-history?keyword=' + encodeURIComponent(keyword));
    return data.snapshots || [];
  }

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

  async function loadWeekDetail(topicId, week) {
    if (CONFIG.useMockData) return null;
    return apiFetch('/topics/' + topicId + '/week-detail?week=' + encodeURIComponent(week));
  }

  async function showWeekDetail(topicId, week) {
    var key = topicId + '|' + week;
    if (state.selectedWeekDetailKey === key) {
      state.selectedWeekDetailKey = null;
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

  // NEU (15.09.2026): GSC-Zeilen im selben Auf-/Zuklapp-Stil wie Keywords
  // (siehe toggleKeywordExpansion), damit auch hier die Entwicklung über
  // die Zeit sichtbar wird (Kundenwunsch: "GSC-Daten ... in dem Stil, nur
  // mit den zusätzlichen Tabellendaten"). Nutzt denselben rank-history-
  // Endpunkt wie Keywords — dieselben Suchanfrage-Texte, dieselbe
  // Datenquelle (search_rank_snapshots), kein neuer Endpunkt nötig.
  async function toggleGscRowExpansion(topicId, rowId, keywordText) {
    if (state.expandedGscRowId === rowId) {
      state.expandedGscRowId = null;
      render();
      return;
    }
    state.expandedGscRowId = rowId;
    if (!state.gscRankHistoryCache[rowId]) {
      state.loadingGscRankHistory[rowId] = true;
      render();
      try {
        state.gscRankHistoryCache[rowId] = await loadKeywordRankHistory(topicId, keywordText);
      } catch (e) {
        console.error('[CVZ Visibility] GSC-Verlauf konnte nicht geladen werden:', e);
        state.gscRankHistoryCache[rowId] = [];
      }
      state.loadingGscRankHistory[rowId] = false;
    }
    render();
  }

  function toggleOppExpansion(oppId) {
    state.expandedOppId = (state.expandedOppId === oppId) ? null : oppId;
    render();
  }

  function composeChangelogEntryText(rawText, location, effect, locationCustom, effectCustom) {
    var locationLabel = location === 'sonstiges' && (locationCustom || '').trim()
      ? locationCustom.trim()
      : (CHANGELOG_LOCATION_LABELS[location] || location);
    var effectLabel = effect === 'sonstiges' && (effectCustom || '').trim()
      ? effectCustom.trim()
      : (CHANGELOG_EFFECT_LABELS[effect] || effect);
    var prefix = location ? '[' + locationLabel + '] ' : '';
    var suffix = effect ? ' \u00b7 Erwarteter Effekt: ' + effectLabel : '';
    return prefix + rawText + suffix;
  }

  async function submitChangelogEntry(topicId) {
    var textarea = document.getElementById('cvz-changelog-input');
    var rawText = ((textarea && textarea.value) || '').trim();
    if (!rawText || state.isSubmittingChangelog) return;

    var entryText = composeChangelogEntryText(
      rawText, state.changelogLocationDraft, state.changelogEffectDraft,
      state.changelogLocationCustomText, state.changelogEffectCustomText,
    );
    var linkedKeywordIds = state.changelogDraftLinkedIds.keywords.slice();
    var linkedPromptIds = state.changelogDraftLinkedIds.prompts.slice();

    state.changelogDraft = rawText;
    state.isSubmittingChangelog = true;
    render();

    try {
      if (CONFIG.useMockData) {
        var mockEntry = {
          id: 'entry-' + Date.now(), entry_text: entryText, author_name: null, created_at: new Date().toISOString(),
          linked_search_query_ids: linkedKeywordIds, linked_prompt_ids: linkedPromptIds,
        };
        _prependChangelogEntry(topicId, mockEntry);
      } else {
        var data = await apiFetch('/topics/' + topicId + '/changelog', {
          method: 'POST',
          body: {
            entry_text: entryText,
            linked_search_query_ids: linkedKeywordIds,
            linked_prompt_ids: linkedPromptIds,
          },
        });
        _prependChangelogEntry(topicId, data.entry);
      }
      state.changelogDraft = '';
      state.changelogLocationDraft = null;
      state.changelogEffectDraft = null;
      state.changelogLocationCustomText = '';
      state.changelogEffectCustomText = '';
      state.changelogDraftLinkedIds = { keywords: [], prompts: [] };
      state.changelogLinkSectionOpen = { keywords: false, prompts: false };
    } catch (e) {
      console.error('[CVZ Visibility] Changelog-Eintrag konnte nicht gespeichert werden:', e);
    }

    state.isSubmittingChangelog = false;
    render();
  }

  function _prependChangelogEntry(topicId, entry) {
    var cached = state.topicDetailCache[topicId];
    if (!cached) return;
    cached.changelog = [entry].concat(cached.changelog || []);
  }

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
      delete state.deletedChangelogCache[topicId];
    } catch (e) {
      console.error('[CVZ Visibility] Eintrag konnte nicht gel\u00f6scht werden:', e);
      await showCvzAlert('Eintrag konnte nicht gel\u00f6scht werden: ' + (e.message || 'Unbekannter Fehler'));
    }
    render();
  }

  async function restoreChangelogEntry(topicId, entryId) {
    try {
      await apiFetch('/topics/' + topicId + '/changelog/' + entryId + '/restore', { method: 'POST' });
      var deletedList = state.deletedChangelogCache[topicId] || [];
      var restored = deletedList.filter(function (e) { return e.id === entryId; })[0];
      state.deletedChangelogCache[topicId] = deletedList.filter(function (e) { return e.id !== entryId; });
      var cached = state.topicDetailCache[topicId];
      if (cached && restored) {
        cached.changelog = [
          {
            id: restored.id, entry_text: restored.entry_text, author_name: restored.author_name,
            created_at: restored.created_at,
            linked_search_query_ids: restored.linked_search_query_ids || [],
            linked_prompt_ids: restored.linked_prompt_ids || [],
          },
        ].concat(cached.changelog || []).sort(function (a, b) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }
    } catch (e) {
      console.error('[CVZ Visibility] Eintrag konnte nicht wiederhergestellt werden:', e);
      await showCvzAlert('Eintrag konnte nicht wiederhergestellt werden: ' + (e.message || 'Unbekannter Fehler'));
    }
    render();
  }

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

  async function loadPromptCitations(topicId, promptId) {
    if (CONFIG.useMockData) {
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
    if (resetTab !== false) {
      state.activeSubTab = 'situation';
    } else if (TOPIC_TABS.every(function (t) { return t.id !== state.activeSubTab; })) {
      state.activeSubTab = 'situation';
    }
    state.activeView = 'topic-detail';
    if (state.activeTopicId !== topicId) {
      state.activePersonaFilter = null;
      state.changelogDraftLinkedIds = { keywords: [], prompts: [] };
      state.changelogLinkSectionOpen = { keywords: false, prompts: false };
      state.changelogLocationDraft = null;
      state.changelogEffectDraft = null;
      state.changelogLocationCustomText = '';
      state.changelogEffectCustomText = '';
    }
    state.activeTopicId = topicId;
    var topic = getTopicById(topicId);
    if (topic) state.activeProjectId = topic.project_id;
    if (topic && (topic.status === 'collecting' || topic.status === 'analyzing')) {
      maybeStartPolling();
    }
    state.isLoadingDetail = true;
    updateUrlParams({ cvz_topic: topicId, cvz_project: state.activeProjectId, cvz_tab: resetTab !== false ? null : state.activeSubTab });
    render();

    try {
      var cachedDetail = state.topicDetailCache[topicId];
      if (!cachedDetail || (cachedDetail.topic && (cachedDetail.topic.status === 'collecting' || cachedDetail.topic.status === 'analyzing'))) {
        state.topicDetailCache[topicId] = await loadTopicDetail(topicId);
      }
    } catch (e) {
      console.error('[CVZ Visibility] Topic-Detail konnte nicht geladen werden:', e);
      state.topicDetailCache[topicId] = null;
    }

    state.isLoadingDetail = false;
    render();

    if (state.activeSubTab === 'situation') {
      maybeLoadVisibilityTrend(topicId);
      maybeLoadTopicRankHistory(topicId);
      maybeLoadMonthlyOverviewTrend(topicId);
      maybeLoadDashboardData(topicId);
      maybeLoadContentChanges(topicId);
    }
    if (state.activeSubTab === 'journey' || state.activeSubTab === 'verlauf') {
      maybeLoadDashboardData(topicId);
      maybeLoadContentChanges(topicId);
    }
    if (state.activeSubTab === 'verlauf') {
      maybeLoadVisibilityTrend(topicId);
    }
  }

  function backToOverview() {
    state.activeView = 'overview';
    state.activeTopicId = null;
    state.activeSubTab = 'themen';
    updateUrlParams({ cvz_topic: null, cvz_tab: 'themen' });
    render();
    loadDomainDashboard(state.activeProjectId);
  }

  function selectFromPicker(rawValue) {
    var separatorIndex = rawValue.indexOf(':');
    var kind = rawValue.slice(0, separatorIndex);
    var id = rawValue.slice(separatorIndex + 1);

    if (kind === 'project') {
      state.activeProjectId = id;
      state.activeView = 'overview';
      state.activeTopicId = null;
      state.activeSubTab = 'themen';
      updateUrlParams({ cvz_project: id, cvz_topic: null, cvz_tab: 'themen' });
      render();
      loadDomainDashboard(id);
    } else if (kind === 'topic') {
      openTopicDetail(id);
    }
  }

  var STATUS_LABELS = {
    active:     { label: 'Aktiv',         className: 'cvz-status-active' },
    collecting: { label: 'Sammelt Daten', className: 'cvz-status-collecting' },
    analyzing:  { label: 'Analysiert',    className: 'cvz-status-analyzing' },
    error:      { label: 'Fehler',        className: 'cvz-status-error' },
    archived:   { label: 'Archiviert',    className: 'cvz-status-archived' },
    queued:     { label: 'Wartet',        className: 'cvz-status-queued' },
  };

  var OPPORTUNITY_TYPE_LABELS = {
    high_demand_low_visibility:      'Hohe Nachfrage, wenig Sichtbarkeit',
    competitor_citation:             'Wettbewerber wird zitiert',
    google_visible_ai_invisible:     'Google sichtbar, KI unsichtbar',
    ai_visible_competitor_dominates: 'KI-sichtbar, Wettbewerber dominiert',
    new_question:                    'Neue Frage entdeckt',
    near_miss_ranking:               'Knapp an Seite 1 vorbei',
  };

  // Farb- und Label-Konfiguration fuer Opportunity-Typen.
  // Wird in renderSituationTab (Wichtigste Handlungsfelder) verwendet.
  var OPP_TYPE_CONFIG = {
    near_miss_ranking:               { color: '#c98e2a', bg: 'rgba(201,142,42,.09)', border: 'rgba(201,142,42,.3)' },
    high_demand_low_visibility:      { color: '#5aacd2', bg: 'rgba(90,172,210,.09)', border: 'rgba(90,172,210,.3)' },
    google_visible_ai_invisible:     { color: '#8878ca', bg: 'rgba(136,120,202,.09)', border: 'rgba(136,120,202,.3)' },
    competitor_citation:             { color: '#de5b50', bg: 'rgba(222,91,80,.09)', border: 'rgba(222,91,80,.3)' },
    ai_visible_competitor_dominates: { color: '#c87a38', bg: 'rgba(200,122,56,.09)', border: 'rgba(200,122,56,.3)' },
    new_question:                    { color: '#4ec68a', bg: 'rgba(78,198,138,.09)', border: 'rgba(78,198,138,.3)' },
  };

  // Farb- und Hinweis-Konfiguration fuer Beste-Content-Chancen-Typen.
  var CONTENT_CHANCE_CONFIG = {
    erste_ki_zitierung: {
      label: 'Erste KI-Zitierung, ausbaufaehig',
      color: '#4fd1c5',
      bg: 'rgba(79,209,197,.08)',
      border: 'rgba(79,209,197,.3)',
      tip: 'Jetzt ausbauen: Thema tiefer abdecken, um Zitierrate dauerhaft zu steigern.',
    },
    seo_naeher_top10: {
      label: 'Nah an Google Top 10',
      color: '#c98e2a',
      bg: 'rgba(201,142,42,.08)',
      border: 'rgba(201,142,42,.3)',
      tip: 'SEO-Potenzial: Inhalt und interne Verlinkung ausbauen für Top-10-Einstieg.',
    },
  };

  var PHASE_LABELS = {
    exploration: 'Exploration',
    evaluation:  'Evaluation',
    comparison:  'Vergleich',
    decision:    'Entscheidung',
  };
  var PHASE_ORDER = ['exploration', 'evaluation', 'comparison', 'decision'];

  // NEU (16.09.2026): Journey-Map-Tab — Phasenfarben und Kanal-Reihenfolge
  // für renderMessyMiddleTab / renderPhaseScoreGrid.
  var PHASE_COLORS = {
    exploration: '#8878ca',
    evaluation:  '#5aacd2',
    comparison:  '#4ec68a',
    decision:    '#c98e2a',
  };

  // GEÄNDERT (20.09.2026): 'google_organic' entfernt — dashboard.py:
  // _compute_phase_scores() liefert pro Phase nur chat_gpt/gemini/
  // google_ai (siehe AI_CHANNELS + "google_ai" dort). Ein "google_organic"-
  // Kanal existierte nur in den Mock-Daten (CONFIG.useMockData) dieser
  // Datei, nie in der echten API-Antwort — die Journey-Map-Karten zeigten
  // dadurch pro Phase eine vierte Zeile "Google Organic: 0 %", die wie eine
  // echte Messung aussah, aber nie etwas anderes als 0 anzeigen konnte.
  var CHANNEL_ORDER = ['chat_gpt', 'gemini', 'google_ai'];
  var CHANNEL_LABELS = {
    chat_gpt:       'ChatGPT',
    gemini:         'Gemini',
    google_ai:      'Google AI Overview',
  };

  var CONTENT_CHANGE_TYPE_LABELS = {
    neue_seite:   'Neue Seite',
    ueberarbeitung: 'Überarbeitung',
    kampagne:     'Kampagne',
    sonstiges:    'Sonstiges',
    // NEU (18.09.2026): automatisch vom Backend gesetzt, wenn ein
    // Aktionsplan-Item als erledigt markiert wird (main.py,
    // toggle_action_plan_item_endpoint). Bewusst NICHT in
    // CONTENT_CHANGE_TYPE_ORDER, damit es nicht im manuellen
    // "Content-Änderung eintragen"-Formular als Option auftaucht.
    aktionsplan:  'Aktions-Plan',
  };
  var CONTENT_CHANGE_TYPE_ORDER = ['neue_seite', 'ueberarbeitung', 'kampagne', 'sonstiges'];

  var VISIBILITY_LABELS = {
    green:  'Zitiert',
    yellow: 'Erwähnt, nicht zitiert',
    // GEÄNDERT (15.09.2026): war "Nicht vorhanden" — unklar, WAS nicht
    // vorhanden ist (siehe Chat-Verlauf 15.09.2026). Gemeint ist: die
    // eigene Domain taucht in den ausgewerteten ChatGPT/Gemini-Antworten
    // zu diesem Prompt nicht auf, weder erwähnt noch zitiert.
    red:    'In KI-Antworten nicht sichtbar',
  };

  var CHANGELOG_LOCATION_LABELS = {
    landingpage: 'Landingpage',
    blogartikel: 'Blogartikel',
    preisseite:  'Preisseite',
    meta:        'Meta-Daten',
    sonstiges:   'Sonstiges',
  };
  var CHANGELOG_LOCATION_ORDER = ['landingpage', 'blogartikel', 'preisseite', 'meta', 'sonstiges'];

  var CHANGELOG_EFFECT_LABELS = {
    mehr_zitierungen: 'Mehr KI-Zitierungen',
    bessere_position: 'Bessere Google-Position',
    beides:           'Beides',
    unklar:           'Unklar',
    sonstiges:        'Sonstiges',
  };
  var CHANGELOG_EFFECT_ORDER = ['mehr_zitierungen', 'bessere_position', 'beides', 'unklar', 'sonstiges'];

  var CONTENT_TYPE_LABELS = {
    review_plattform:  'Review-Plattform',
    vergleichsartikel: 'Vergleichsartikel',
    produktseite:      'Produktseite',
    // NEU (18.09.2026): siehe source_analysis.py _ALLOWED_CONTENT_TYPES —
    // deckt Behörden-/Verbands-/Institutionsseiten und reine "So
    // funktioniert's"-Seiten ohne Verkaufsabsicht ab, die vorher
    // zwangsläufig auf 'fachartikel' oder 'produktseite' fielen.
    erklaerseite:      'Erklärseite',
    fachartikel:       'Fachartikel',
    video:             'Video',
    forum:             'Forum',
    sonstiges:         'Sonstiges',
    // NEU (18.09.2026): zwei deterministisch (ohne Claude-Call) erkannte
    // Sonderfälle, siehe source_analysis.py _looks_like_asset/_analyze_url —
    // ersetzen das bisherige leere "–", wenn eine zitierte URL entweder ein
    // reiner Datei-Download ist oder automatisiert gar nicht auslesbar war
    // (z.B. Bot-Schutz). Ebenfalls bewusst NICHT in CONTENT_CHANGE_TYPE_ORDER/
    // manuell wählbar, da nie von Claude, sondern nur code-seitig gesetzt.
    dokument_download: 'Datei-Download (PDF/Bild/etc.)',
    nicht_abrufbar:    'Nicht automatisiert auslesbar',
    // NEU (18.09.2026): LinkedIn/X/Facebook/Instagram/TikTok/Pinterest/
    // Medium/GitHub — bewusst eine eigene, plattform- statt seitentyp-
    // bezogene Kategorie (siehe source_analysis.py _KNOWN_PLATFORM_DOMAINS),
    // weil der konkrete Seitentyp je Pfad zu unterschiedlich wäre, die
    // Kernaussage "hier lohnt sich Präsenz" aber unabhängig davon gilt.
    social_media:      'Social-Media-Plattform',
  };

  var GAP_PRIORITY_LABELS = {
    hoch:    'Hohe Priorität',
    mittel:  'Mittlere Priorität',
    niedrig: 'Niedrige Priorität',
  };

  var KEYWORD_SOURCE_LABELS = {
    seed_keyword:         'Primäres Keyword',
    related_keywords:     'Keyword-Idee',
    keyword_ideas:        'Keyword-Idee',
    keyword_suggestions:  'Keyword-Idee',
    paa:                  'Häufig gefragt (von Google)',
    gsc_near_miss:        'Google Search Console',
  };

  // NEU (20.09.2026): Farben für die Keyword-Einschätzung, die main.py
  // jetzt pro Zeile mitliefert (keyword_status/keyword_status_label, siehe
  // keyword_status.py). Reihenfolge/Bedeutung siehe dort.
  var KEYWORD_STATUS_COLORS = {
    rankt_bereits:          '#35a86b',
    knapp_seite_1:          '#c98e2a',
    nachfrage_unsichtbar:   '#5aacd2',
    reine_idee:             '#8b98a5',
  };

  var MODEL_LABELS = {
    chat_gpt: 'ChatGPT',
    gemini:   'Gemini',
  };

  // NEU (15.09.2026): Kundenwunsch (siehe Chat-Verlauf 15.09.2026) — Top-
  // SERP-Ergebnisse + SERP-Feature-Typen bei Keywords/GSC-Keywords, siehe
  // run_topic.py: check_serp_for_top_keywords/_extract_serp_summary.
  var SERP_FEATURE_LABELS = {
    organic: 'Organisch',
    people_also_ask: '\u00c4hnliche Fragen',
    featured_snippet: 'Featured Snippet',
    answer_box: 'Antwortbox',
    ai_overview: 'AI Overview',
    knowledge_graph: 'Knowledge Panel',
    video: 'Video',
    images: 'Bilder',
    local_pack: 'Local Pack',
    top_stories: 'Top Stories',
    shopping: 'Shopping',
  };
  // Feature-Typen, die typischerweise bedeuten "Google beantwortet die
  // Frage schon direkt, ohne Klick" — nur zur Einordnung, keine
  // abschließende Liste aller möglichen DataForSEO-Typen.
  var SERP_ZERO_CLICK_FEATURE_TYPES = ['featured_snippet', 'answer_box', 'ai_overview', 'knowledge_graph'];

  // Gemeinsam genutzt von renderKeywordExpansion (Keywords-Tab) und
  // renderGscRowExpansion (GSC-Performance-Tab) — dieselbe Datenquelle
  // (search_queries.top_serp_results/serp_features), zwei Anzeigeorte.
  function renderSerpSummaryBlock(row) {
    if (!row.top_serp_results || row.top_serp_results.length === 0) return '';

    var hasZeroClickFeature = (row.serp_features || []).some(function (f) {
      return SERP_ZERO_CLICK_FEATURE_TYPES.indexOf(f) !== -1;
    });

    var resultsHtml = row.top_serp_results.map(function (r) {
      return '<li>' +
        '<img class="cvz-inline-favicon" src="https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(r.domain || '') + '" alt="">' +
        '<a href="' + escapeHtml(r.url || '#') + '" target="_blank" rel="noopener">' + escapeHtml(r.domain || r.url || '') + '</a>' +
        (r.rank ? ' <span class="cvz-serp-rank">Position ' + escapeHtml(r.rank) + '</span>' : '') +
      '</li>';
    }).join('');

    var featuresHtml = (row.serp_features || []).map(function (f) {
      var isZeroClick = SERP_ZERO_CLICK_FEATURE_TYPES.indexOf(f) !== -1;
      return '<span class="cvz-persona-chip' + (isZeroClick ? ' cvz-serp-feature-risk' : '') + '">' +
        escapeHtml(SERP_FEATURE_LABELS[f] || f) + '</span>';
    }).join('');

    return (
      '<p class="cvz-changelog-guided-label">Top-SERP-Ergebnisse' +
        (hasZeroClickFeature ? ' (Zero-Click-Risiko, siehe Features unten)' : '') +
      '</p>' +
      '<ul class="cvz-serp-results-list">' + resultsHtml + '</ul>' +
      (featuresHtml ? '<div class="cvz-persona-filter" style="margin-top:6px;">' + featuresHtml + '</div>' : '') +
      (row.serp_checked_at ? '<p class="cvz-opportunity-topic">SERP gepr\u00fcft: ' + formatRelativeTime(row.serp_checked_at) + '</p>' : '')
    );
  }

  // GEÄNDERT (16.09.2026): 7 Tabs → 5 fokussierte Views (Kundenwunsch:
  // Marketer-freundliches Frontend mit klarer Struktur; "Daten"-Tab
  // bewahrt den Zugang zu Keywords, Prompts und GSC).
  var TOPIC_TABS = [
    { id: 'situation', label: 'Situation' },
    { id: 'journey', label: 'Journey Map' },
    { id: 'aktionsplan', label: 'Aktionsplan' },
    { id: 'verlauf', label: 'Verlauf & Änderungen' },
    { id: 'daten', label: 'Daten' },
  ];

  var DOMAIN_TABS = [
    { id: 'themen', label: 'Themen' },
    { id: 'uebersicht', label: 'Übersicht' },
  ];

  function render() {
    var container = document.getElementById('cvz-visibility-app');
    if (!container) {
      console.error('[CVZ Visibility] Container #cvz-visibility-app nicht gefunden.');
      return;
    }

    var focusedId = null, selectionStart = null, selectionEnd = null;
    var activeEl = document.activeElement;
    if (activeEl && activeEl.id && container.contains(activeEl)) {
      focusedId = activeEl.id;
      if (typeof activeEl.selectionStart === 'number') {
        selectionStart = activeEl.selectionStart;
        selectionEnd = activeEl.selectionEnd;
      }
    }

    container.innerHTML = '';
    if (state.activeView === 'topic-detail') {
      // GEAENDERT (18.09.2026): JS-basiertes sticky Tab-Nav (17.09.2026,
      // IntersectionObserver-Loesung) wieder entfernt, siehe Chat-Verlauf
      // 18.09.2026 — sah in der Praxis nicht gut aus (Nav blieb beim
      // Fixieren ueber Content stehen/ueberlappte). Tab-Nav ist jetzt
      // wieder normaler Teil des Flows, ohne Sticky-Verhalten.
      container.appendChild(renderTopicDetailView());
    } else {
      container.appendChild(renderOverview());
    }

    container.onclick = handleContainerClick;

    if (focusedId) {
      var toRefocus = document.getElementById(focusedId);
      if (toRefocus) {
        toRefocus.focus();
        if (selectionStart !== null && typeof toRefocus.setSelectionRange === 'function') {
          try { toRefocus.setSelectionRange(selectionStart, selectionEnd); } catch (e) { }
        }
      }
    }
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
    var promptDelete = event.target.closest('[data-cvz-prompt-delete]');
    if (promptDelete) {
      deactivatePrompt(state.activeTopicId, promptDelete.getAttribute('data-cvz-prompt-delete'));
      return;
    }
    var promptToggle = event.target.closest('[data-cvz-prompt-toggle]');
    if (promptToggle) {
      togglePromptExpansion(promptToggle.getAttribute('data-cvz-prompt-toggle'));
      return;
    }
    var personaFilter = event.target.closest('[data-cvz-persona-filter]');
    if (personaFilter) {
      var personaValue = personaFilter.getAttribute('data-cvz-persona-filter');
      state.activePersonaFilter = personaValue || null;
      render();
      return;
    }
    // NEU (17.09.2026): Phase-Filter fuer Content-Luecken
    var gapPhaseFilter = event.target.closest('[data-cvz-gap-phase-filter]');
    if (gapPhaseFilter) {
      state.gapPhaseFilter = gapPhaseFilter.getAttribute('data-cvz-gap-phase-filter') || null;
      render();
      return;
    }
    // NEU (17.09.2026): Phase-Filter fuer Quellen-Analyse
    var sourcePhaseFilter = event.target.closest('[data-cvz-source-phase-filter]');
    if (sourcePhaseFilter) {
      state.sourcePhaseFilter = sourcePhaseFilter.getAttribute('data-cvz-source-phase-filter') || null;
      render();
      return;
    }
    var kwDeactivate = event.target.closest('[data-cvz-keyword-deactivate]');
    if (kwDeactivate) {
      deactivateKeyword(state.activeTopicId, kwDeactivate.getAttribute('data-cvz-keyword-deactivate'));
      return;
    }
    var manualKeywordSubmit = event.target.closest('[data-cvz-manual-keyword-submit]');
    if (manualKeywordSubmit) {
      submitManualKeyword(manualKeywordSubmit.getAttribute('data-cvz-manual-keyword-submit'));
      return;
    }
    var keywordToggle = event.target.closest('[data-cvz-keyword-toggle]');
    if (keywordToggle) {
      toggleKeywordExpansion(
        state.activeTopicId,
        keywordToggle.getAttribute('data-cvz-keyword-toggle'),
        keywordToggle.getAttribute('data-cvz-keyword-text'),
      );
      return;
    }
    // NEU (15.09.2026): manuelle Phasen-Korrektur bei Keywords/PAA-Fragen.
    var keywordPhaseSet = event.target.closest('[data-cvz-keyword-phase-set]');
    if (keywordPhaseSet) {
      updateKeywordPhase(
        state.activeTopicId,
        keywordPhaseSet.getAttribute('data-cvz-keyword-phase-id'),
        keywordPhaseSet.getAttribute('data-cvz-keyword-phase-set'),
      );
      return;
    }
    var changelogSubmit = event.target.closest('[data-cvz-changelog-submit]');
    if (changelogSubmit) {
      submitChangelogEntry(state.activeTopicId);
      return;
    }
    var changelogLocation = event.target.closest('[data-cvz-changelog-location]');
    if (changelogLocation) {
      var locationValue = changelogLocation.getAttribute('data-cvz-changelog-location');
      state.changelogLocationDraft = (state.changelogLocationDraft === locationValue) ? null : locationValue;
      render();
      return;
    }
    var changelogEffect = event.target.closest('[data-cvz-changelog-effect]');
    if (changelogEffect) {
      var effectValue = changelogEffect.getAttribute('data-cvz-changelog-effect');
      state.changelogEffectDraft = (state.changelogEffectDraft === effectValue) ? null : effectValue;
      render();
      return;
    }
    var changelogLinkToggle = event.target.closest('[data-cvz-changelog-link-toggle]');
    if (changelogLinkToggle) {
      var linkKind = changelogLinkToggle.getAttribute('data-cvz-changelog-link-toggle');
      state.changelogLinkSectionOpen[linkKind] = !state.changelogLinkSectionOpen[linkKind];
      render();
      return;
    }
    var changelogLinkChip = event.target.closest('[data-cvz-changelog-link-chip]');
    if (changelogLinkChip) {
      var chipKind = changelogLinkChip.getAttribute('data-cvz-changelog-link-kind');
      var chipId = changelogLinkChip.getAttribute('data-cvz-changelog-link-chip');
      var currentIds = state.changelogDraftLinkedIds[chipKind];
      var idIndex = currentIds.indexOf(chipId);
      if (idIndex === -1) {
        currentIds.push(chipId);
      } else {
        currentIds.splice(idIndex, 1);
      }
      render();
      return;
    }
    var changelogMore = event.target.closest('[data-cvz-changelog-more]');
    if (changelogMore) {
      var moreTopicId = changelogMore.getAttribute('data-cvz-changelog-more');
      state.changelogVisibleCount[moreTopicId] = (state.changelogVisibleCount[moreTopicId] || 10) + 10;
      render();
      return;
    }
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
    // NEU (20.09.2026): Klick-Handler für den "Jetzt erstellen"/"Erneut
    // erstellen"-Button aus renderStepNotice — fehlte bisher komplett,
    // der Button (data-cvz-retry-step) tat also nichts.
    var retryStepBtn = event.target.closest('[data-cvz-retry-step]');
    if (retryStepBtn) {
      retryStep(state.activeTopicId, retryStepBtn.getAttribute('data-cvz-retry-step'));
      return;
    }
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
      if (newTab === 'situation' && state.activeView === 'topic-detail') {
        maybeLoadVisibilityTrend(state.activeTopicId);
        maybeLoadTopicRankHistory(state.activeTopicId);
        maybeLoadMonthlyOverviewTrend(state.activeTopicId);
        maybeLoadDashboardData(state.activeTopicId);
        maybeLoadContentChanges(state.activeTopicId);
      }
      if ((newTab === 'journey' || newTab === 'verlauf') && state.activeView === 'topic-detail') {
        maybeLoadDashboardData(state.activeTopicId);
        maybeLoadContentChanges(state.activeTopicId);
      }
      if (newTab === 'verlauf' && state.activeView === 'topic-detail') {
        maybeLoadVisibilityTrend(state.activeTopicId);
      }
      // NEU (17.09.2026): Aktionsplan-Tab — Cache-Busting.
      // Re-fetch NUR wenn action_plan komplett fehlt ODER wenn noch keine Items vorhanden
      // UND generated_at ebenfalls fehlt (= Plan wurde noch nie generiert).
      // NICHT re-fetchen wenn Items vorhanden sind (auch wenn generated_at null ist) —
      // das wuerde bei einem NULL-generated_at in der DB eine Endlos-Schleife erzeugen.
      if (newTab === 'aktionsplan' && state.activeView === 'topic-detail') {
        var _apCached = state.topicDetailCache[state.activeTopicId];
        var _apObj = _apCached && _apCached.action_plan;
        var _apHasItems = _apObj && Array.isArray(_apObj.items) && _apObj.items.length > 0;
        var _apMissing = !_apCached || !_apObj || (!_apHasItems && !_apObj.generated_at);
        if (_apMissing) {
          delete state.topicDetailCache[state.activeTopicId];
          openTopicDetail(state.activeTopicId, false); // async, neu laden + rendern
          return;
        }
      }
      render();
      return;
    }

    // Journey-Map Retry-Button
    var journeyRetryBtn = event.target.closest('[data-cvz-journey-retry]');
    if (journeyRetryBtn) {
      var retryTopicId = journeyRetryBtn.getAttribute('data-cvz-journey-retry');
      delete state.dashboardDataCache[retryTopicId];
      maybeLoadDashboardData(retryTopicId);
      maybeLoadContentChanges(retryTopicId);
      return;
    }

    // NEU (16.09.2026): Journey-Map-Tab — Phasenwechsel
    var journeyPhaseBtn = event.target.closest('[data-cvz-journey-phase]');
    if (journeyPhaseBtn) {
      var newPhase = journeyPhaseBtn.getAttribute('data-cvz-journey-phase');
      state.journeyActivePhase = (state.journeyActivePhase === newPhase) ? null : newPhase;
      render();
      return;
    }

    // NEU (16.09.2026): Journey-Map-Tab — Content-Änderung einreichen
    var contentChangeSubmit = event.target.closest('[data-cvz-content-change-submit]');
    if (contentChangeSubmit) {
      submitContentChange(state.activeTopicId);
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
      return;
    }
    var archiveBtn = event.target.closest('[data-cvz-archive-topic]');
    if (archiveBtn) {
      setTopicArchiveStatus(archiveBtn.getAttribute('data-cvz-archive-topic'), true);
      return;
    }
    var reactivateBtn = event.target.closest('[data-cvz-reactivate-topic]');
    if (reactivateBtn) {
      setTopicArchiveStatus(reactivateBtn.getAttribute('data-cvz-reactivate-topic'), false);
      return;
    }
    var cancelArchiveBtn = event.target.closest('[data-cvz-cancel-archive-topic]');
    if (cancelArchiveBtn) {
      cancelArchiveTopic(cancelArchiveBtn.getAttribute('data-cvz-cancel-archive-topic'));
      return;
    }
    var deleteTopicBtn = event.target.closest('[data-cvz-delete-topic]');
    if (deleteTopicBtn) {
      deleteTopicPermanently(deleteTopicBtn.getAttribute('data-cvz-delete-topic'));
      return;
    }
    var refreshGscBtn = event.target.closest('[data-cvz-refresh-gsc]');
    if (refreshGscBtn) {
      refreshGscData(refreshGscBtn.getAttribute('data-cvz-refresh-gsc'));
      return;
    }
    var competitorManageToggle = event.target.closest('[data-cvz-competitor-manage-toggle]');
    if (competitorManageToggle) {
      var manageTopicId = competitorManageToggle.getAttribute('data-cvz-competitor-manage-toggle');
      var cachedForManage = state.topicDetailCache[manageTopicId];
      toggleCompetitorManage(manageTopicId, (cachedForManage && cachedForManage.competitor_domains) || []);
      return;
    }
    var competitorChip = event.target.closest('[data-cvz-competitor-chip]');
    if (competitorChip) {
      var chipTopicId = competitorChip.getAttribute('data-cvz-competitor-topic');
      var chipDomain = competitorChip.getAttribute('data-cvz-competitor-chip');
      var draftDomains = state.competitorDraftDomains[chipTopicId] || [];
      var chipIndex = draftDomains.indexOf(chipDomain);
      if (chipIndex === -1) {
        draftDomains.push(chipDomain);
      } else {
        draftDomains.splice(chipIndex, 1);
      }
      state.competitorDraftDomains[chipTopicId] = draftDomains;
      render();
      return;
    }
    var competitorManualAdd = event.target.closest('[data-cvz-competitor-manual-add]');
    if (competitorManualAdd) {
      var manualAddTopicId = competitorManualAdd.getAttribute('data-cvz-competitor-manual-add');
      var manualInput = document.getElementById('cvz-competitor-manual-input');
      var manualDomain = ((manualInput && manualInput.value) || '').trim();
      if (manualDomain) {
        var currentDraft = state.competitorDraftDomains[manualAddTopicId] || [];
        if (currentDraft.indexOf(manualDomain) === -1) {
          currentDraft.push(manualDomain);
        }
        state.competitorDraftDomains[manualAddTopicId] = currentDraft;
        if (manualInput) manualInput.value = '';
        render();
      }
      return;
    }
    var competitorSubmit = event.target.closest('[data-cvz-competitor-submit]');
    if (competitorSubmit) {
      submitCompetitorSelection(competitorSubmit.getAttribute('data-cvz-competitor-submit'));
      return;
    }
    var manualPromptSubmit = event.target.closest('[data-cvz-manual-prompt-submit]');
    if (manualPromptSubmit) {
      submitManualPrompt(manualPromptSubmit.getAttribute('data-cvz-manual-prompt-submit'));
      return;
    }
    // NEU (15.09.2026): GSC-Zeilen im selben Auf-/Zuklapp-Stil wie Keywords,
    // siehe renderGscBlock/toggleGscRowExpansion.
    var gscToggle = event.target.closest('[data-cvz-gsc-toggle]');
    if (gscToggle) {
      toggleGscRowExpansion(
        state.activeTopicId,
        gscToggle.getAttribute('data-cvz-gsc-toggle'),
        gscToggle.getAttribute('data-cvz-gsc-text'),
      );
      return;
    }
    var oppToggle = event.target.closest('[data-cvz-opp-toggle]');
    if (oppToggle) {
      toggleOppExpansion(oppToggle.getAttribute('data-cvz-opp-toggle'));
      return;
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

  function renderDomainAndTopicPicker() {
    var wrap = document.createElement('div');
    wrap.className = 'cvz-picker-row';

    var activeProject = getProjectById(state.activeProjectId);

    var domainSelect = document.createElement('select');
    domainSelect.className = 'cvz-picker-select';
    domainSelect.setAttribute('aria-label', 'Domain w\u00e4hlen');
    if (state.projects.length === 0) {
      var noDomainOption = document.createElement('option');
      noDomainOption.value = '';
      noDomainOption.textContent = 'Keine Domains vorhanden';
      domainSelect.appendChild(noDomainOption);
      domainSelect.disabled = true;
    } else {
      state.projects.forEach(function (project) {
        var option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.domain;
        if (project.id === state.activeProjectId) option.selected = true;
        domainSelect.appendChild(option);
      });
    }
    domainSelect.addEventListener('change', function () {
      if (domainSelect.value) selectFromPicker('project:' + domainSelect.value);
    });

    var topicsForActiveDomain = state.allTopics.filter(function (t) { return t.project_id === state.activeProjectId; });

    var topicSelect = document.createElement('select');
    topicSelect.className = 'cvz-picker-select';
    topicSelect.setAttribute('aria-label', 'Thema w\u00e4hlen');

    var placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = topicsForActiveDomain.length
      ? (state.activeTopicId ? '\u2192 Zur Domain-\u00dcbersicht' : 'Thema w\u00e4hlen \u2026')
      : (activeProject ? 'Noch keine Themen f\u00fcr ' + activeProject.domain : 'Erst Domain w\u00e4hlen');
    placeholderOption.selected = !state.activeTopicId;
    topicSelect.appendChild(placeholderOption);

    topicsForActiveDomain.forEach(function (topic) {
      var option = document.createElement('option');
      option.value = topic.id;
      option.textContent = topic.name;
      if (topic.id === state.activeTopicId) option.selected = true;
      topicSelect.appendChild(option);
    });
    topicSelect.disabled = topicsForActiveDomain.length === 0;

    topicSelect.addEventListener('change', function () {
      if (topicSelect.value) {
        selectFromPicker('topic:' + topicSelect.value);
      } else if (state.activeTopicId) {
        backToOverview();
      }
    });

    wrap.appendChild(domainSelect);
    wrap.appendChild(topicSelect);
    return wrap;
  }

  async function submitCreateForm() {
    var domainSelect = document.getElementById('cvz-create-domain-select');
    var newDomainInput = document.getElementById('cvz-create-domain-new');
    var topicInput = document.getElementById('cvz-create-topic');
    var topicText = (topicInput.value || '').trim();

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
        var topicData = await apiFetch('/topics', {
          method: 'POST',
          body: { project_id: project.id, topic_name: topicText, seed_keyword: topicText, sample_prompts: [] },
        });
        newTopic = { id: topicData.topic_id, project_id: project.id, name: topicText, seed_keyword: topicText, status: topicData.status || 'collecting', opportunities_count: 0 };
      }
      state.allTopics.push(newTopic);
      state.activeProjectId = project.id;

      if (state.topicUsage && newTopic.status !== 'queued') {
        state.topicUsage.current_count += 1;
        state.topicUsage.can_create = state.topicUsage.current_count < state.topicUsage.limit;
      }

      state.isCreating = false;
      state.showCreateForm = false;
      if (newTopic.status !== 'queued') {
        maybeStartPolling();
      }
      openTopicDetail(newTopic.id);
    } catch (e) {
      console.error('[CVZ Visibility] Anlegen fehlgeschlagen:', e);
      state.isCreating = false;
      if (e.status === 403) {
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
      await loadTopics();
      maybeStartPolling();
    } catch (e) {
      console.error('[CVZ Visibility] Retry fehlgeschlagen f\u00fcr Topic ' + topicId + ':', e);
      await showCvzAlert('Erneut versuchen fehlgeschlagen: ' + (e.message || 'Unbekannter Fehler'));
    }

    state.retryingTopicId = null;
    render();
  }

  async function setTopicArchiveStatus(topicId, archive) {
    var confirmTitle = archive ? 'Thema deaktivieren?' : 'Thema wieder aktivieren?';
    var confirmBody = archive
      ? 'Es werden dann keine neuen Datenläufe mehr gestartet, alle bisherigen Daten bleiben aber sichtbar. Du kannst das Thema jederzeit wieder aktivieren.'
      : 'Ab dem nächsten wöchentlichen Lauf werden wieder neue Daten gesammelt.';
    var confirmed = await showCvzConfirm(confirmBody, {
      title: confirmTitle,
      confirmLabel: archive ? 'Deaktivieren' : 'Aktivieren',
    });
    if (!confirmed) return;

    state.archivingTopicId = topicId;
    render();

    try {
      if (CONFIG.useMockData) {
        var mockTopic = getTopicById(topicId);
        if (mockTopic) mockTopic.status = archive ? 'archived' : 'active';
        if (state.topicDetailCache[topicId]) {
          state.topicDetailCache[topicId].topic.status = archive ? 'archived' : 'active';
        }
      } else {
        await apiFetch('/topics/' + topicId + '/' + (archive ? 'archive' : 'reactivate'), { method: 'POST' });
        await loadTopics();
        await loadTopicUsage();
      }

      var affectedTopic = getTopicById(topicId);
      if (affectedTopic) {
        delete state.domainDashboardCache[affectedTopic.project_id];
        if (state.activeView === 'overview' && state.activeProjectId === affectedTopic.project_id) {
          loadDomainDashboard(affectedTopic.project_id, true);
        }
      }

      if (state.activeView === 'topic-detail' && state.activeTopicId === topicId) {
        delete state.topicDetailCache[topicId];
        await openTopicDetail(topicId, false);
      }
    } catch (e) {
      console.error('[CVZ Visibility] Status konnte nicht geändert werden:', e);
      await showCvzAlert('Status konnte nicht geändert werden: ' + (e.message || 'Unbekannter Fehler'));
    }

    state.archivingTopicId = null;
    render();
  }

  async function deleteTopicPermanently(topicId) {
    var confirmed = await showCvzConfirm(
      'Dieses Thema wurde nie gestartet und kann folgenlos entfernt werden. Das ist NICHT r\u00fcckg\u00e4ngig zu machen.',
      { title: 'Thema endg\u00fcltig l\u00f6schen?', confirmLabel: 'Endg\u00fcltig l\u00f6schen' }
    );
    if (!confirmed) return;

    var affectedTopic = getTopicById(topicId);
    state.archivingTopicId = topicId;
    render();

    try {
      if (CONFIG.useMockData) {
        state.allTopics = state.allTopics.filter(function (t) { return t.id !== topicId; });
      } else {
        await apiFetch('/topics/' + topicId, { method: 'DELETE' });
        await loadTopics();
        await loadTopicUsage();
      }
      delete state.topicDetailCache[topicId];
      if (affectedTopic) delete state.domainDashboardCache[affectedTopic.project_id];
      if (state.activeView === 'topic-detail' && state.activeTopicId === topicId) {
        backToOverview();
      }
    } catch (e) {
      console.error('[CVZ Visibility] Thema konnte nicht gel\u00f6scht werden:', e);
      await showCvzAlert('Thema konnte nicht gel\u00f6scht werden: ' + (e.message || 'Unbekannter Fehler'));
    }

    state.archivingTopicId = null;
    render();
  }

  async function refreshGscData(topicId) {
    if (state.isRefreshingGsc) return;
    state.isRefreshingGsc = true;
    render();

    try {
      if (CONFIG.useMockData) {
        await showCvzAlert('Im Mock-Modus nicht verf\u00fcgbar.');
      } else {
        await apiFetch('/topics/' + topicId + '/refresh-gsc', { method: 'POST' });
        await new Promise(function (resolve) { setTimeout(resolve, 6000); });
        delete state.topicDetailCache[topicId];
        if (state.activeView === 'topic-detail' && state.activeTopicId === topicId) {
          await openTopicDetail(topicId, false);
        }
      }
    } catch (e) {
      console.error('[CVZ Visibility] GSC-Daten konnten nicht nachgezogen werden:', e);
      await showCvzAlert('GSC-Daten konnten nicht nachgezogen werden: ' + (e.message || 'Unbekannter Fehler'));
    }

    state.isRefreshingGsc = false;
    render();
  }

  async function loadCompetitorSuggestions(topicId) {
    if (state.isLoadingCompetitorSuggestions) return;
    state.isLoadingCompetitorSuggestions = true;
    render();

    try {
      if (CONFIG.useMockData) {
        state.competitorSuggestionsCache[topicId] = [];
      } else {
        var data = await apiFetch('/topics/' + topicId + '/competitor-suggestions');
        state.competitorSuggestionsCache[topicId] = data.suggestions || [];
      }
    } catch (e) {
      console.error('[CVZ Visibility] Wettbewerber-Vorschl\u00e4ge konnten nicht geladen werden:', e);
      state.competitorSuggestionsCache[topicId] = [];
    }

    state.isLoadingCompetitorSuggestions = false;
    render();
  }

  function toggleCompetitorManage(topicId, currentActiveDomains) {
    var isOpening = !state.competitorManageOpen[topicId];
    state.competitorManageOpen[topicId] = isOpening;
    if (isOpening) {
      if (!state.competitorDraftDomains[topicId]) {
        state.competitorDraftDomains[topicId] = currentActiveDomains.slice();
      }
      if (!state.competitorSuggestionsCache[topicId]) {
        loadCompetitorSuggestions(topicId);
      }
    }
    render();
  }

  async function submitCompetitorSelection(topicId) {
    if (state.isSubmittingCompetitors) return;
    var domains = state.competitorDraftDomains[topicId] || [];
    state.isSubmittingCompetitors = true;
    render();

    try {
      if (CONFIG.useMockData) {
        await showCvzAlert('Im Mock-Modus nicht verf\u00fcgbar.');
      } else {
        await apiFetch('/topics/' + topicId + '/confirm-competitors', {
          method: 'POST',
          body: { competitor_domains: domains },
        });
        delete state.topicDetailCache[topicId];
        state.competitorManageOpen[topicId] = false;
        delete state.competitorDraftDomains[topicId];
        delete state.competitorSuggestionsCache[topicId];
        await openTopicDetail(topicId, false);
      }
    } catch (e) {
      console.error('[CVZ Visibility] Wettbewerber konnten nicht gespeichert werden:', e);
      await showCvzAlert('Wettbewerber konnten nicht gespeichert werden: ' + (e.message || 'Unbekannter Fehler'));
    }

    state.isSubmittingCompetitors = false;
    render();
  }

  async function submitManualPrompt(topicId) {
    if (state.isSubmittingManualPrompt) return;
    var promptText = (state.manualPromptDraftText || '').trim();
    if (!promptText) return;
    var phase = state.manualPromptDraftPhase || 'exploration';

    state.isSubmittingManualPrompt = true;
    render();

    try {
      if (CONFIG.useMockData) {
        await showCvzAlert('Im Mock-Modus nicht verf\u00fcgbar.');
      } else {
        await apiFetch('/topics/' + topicId + '/prompts', {
          method: 'POST',
          body: { prompt_text: promptText, messymiddle_phase: phase },
        });
        state.manualPromptDraftText = '';
        delete state.topicDetailCache[topicId];
        await openTopicDetail(topicId, false);
      }
    } catch (e) {
      console.error('[CVZ Visibility] Prompt konnte nicht angelegt werden:', e);
      await showCvzAlert('Prompt konnte nicht angelegt werden: ' + (e.message || 'Unbekannter Fehler'));
    }

    state.isSubmittingManualPrompt = false;
    render();
  }

  async function deactivatePrompt(topicId, promptId) {
    var confirmed = await showCvzConfirm(
      'Diesen Prompt wirklich deaktivieren?',
      { title: 'Prompt deaktivieren?', confirmLabel: 'Deaktivieren' }
    );
    if (!confirmed) return;

    if (CONFIG.useMockData) {
      await showCvzAlert('Im Mock-Modus nicht verfügbar.');
      return;
    }

    try {
      await apiFetch('/topics/' + topicId + '/prompts/' + promptId + '/deactivate', { method: 'PATCH' });
      state.manualPromptDraftText = '';
      delete state.topicDetailCache[topicId];
      await openTopicDetail(topicId, false);
    } catch (e) {
      console.error('[CVZ Visibility] Prompt konnte nicht deaktiviert werden:', e);
      await showCvzAlert('Prompt konnte nicht deaktiviert werden: ' + (e.message || 'Unbekannter Fehler'));
    }
  }

  async function deactivateKeyword(topicId, keywordId) {
    var confirmed = await showCvzConfirm(
      'Dieses Keyword wirklich deaktivieren?',
      { title: 'Keyword deaktivieren?', confirmLabel: 'Deaktivieren' }
    );
    if (!confirmed) return;

    if (CONFIG.useMockData) {
      await showCvzAlert('Im Mock-Modus nicht verfügbar.');
      return;
    }

    try {
      await apiFetch('/topics/' + topicId + '/keywords/' + keywordId + '/deactivate', { method: 'PATCH' });
      state.manualKeywordDraftText = '';
      delete state.topicDetailCache[topicId];
      await openTopicDetail(topicId, false);
    } catch (e) {
      console.error('[CVZ Visibility] Keyword konnte nicht deaktiviert werden:', e);
      await showCvzAlert('Keyword konnte nicht deaktiviert werden: ' + (e.message || 'Unbekannter Fehler'));
    }
  }

  async function submitManualKeyword(topicId) {
    if (state.isSubmittingManualKeyword) return;
    var kw = (state.manualKeywordDraftText || '').trim();
    if (!kw) return;

    state.isSubmittingManualKeyword = true;
    render();

    try {
      if (CONFIG.useMockData) {
        await showCvzAlert('Im Mock-Modus nicht verfügbar.');
      } else {
        await apiFetch('/topics/' + topicId + '/keywords', {
          method: 'POST',
          body: { keyword: kw },
        });
        state.manualKeywordDraftText = '';
        delete state.topicDetailCache[topicId];
        await openTopicDetail(topicId, false);
      }
    } catch (e) {
      console.error('[CVZ Visibility] Keyword konnte nicht angelegt werden:', e);
      await showCvzAlert('Keyword konnte nicht angelegt werden: ' + (e.message || 'Unbekannter Fehler'));
    }

    state.isSubmittingManualKeyword = false;
    render();
  }

  async function cancelArchiveTopic(topicId) {
    state.archivingTopicId = topicId;
    render();

    try {
      if (CONFIG.useMockData) {
        var mockTopic = getTopicById(topicId);
        if (mockTopic) mockTopic.archive_effective_at = null;
        if (state.topicDetailCache[topicId]) {
          state.topicDetailCache[topicId].topic.archive_effective_at = null;
        }
      } else {
        await apiFetch('/topics/' + topicId + '/cancel-archive', { method: 'POST' });
        await loadTopics();
      }

      if (state.activeView === 'topic-detail' && state.activeTopicId === topicId) {
        delete state.topicDetailCache[topicId];
        await openTopicDetail(topicId, false);
      }
    } catch (e) {
      console.error('[CVZ Visibility] Deaktivierung konnte nicht abgebrochen werden:', e);
      await showCvzAlert('Deaktivierung konnte nicht abgebrochen werden: ' + (e.message || 'Unbekannter Fehler'));
    }

    state.archivingTopicId = null;
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
        window.location.href = data.checkout_url;
        return;
      }
      if (data.mode === 'quantity_updated') {
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

    var limitReachedUpfront = state.topicUsage && !state.topicUsage.can_create && !state.topicUsage.can_queue && !state.limitReached;
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
      upfrontBuyBtn.textContent = state.isBuyingSlot ? 'Wird bearbeitet …' : '+ 1 Topic-Slot kaufen';
      form.appendChild(upfrontBuyBtn);

      wrap.appendChild(form);
      return wrap;
    }

    var queueNotice = state.topicUsage && !state.topicUsage.can_create && state.topicUsage.can_queue;
    if (queueNotice) {
      var queueMsg = document.createElement('p');
      queueMsg.className = 'cvz-create-info';
      var queueDate = formatShortDate(state.topicUsage.next_slot_at);
      queueMsg.textContent =
        'Euer Plan-Limit ist aktuell ausgeschöpft (' + state.topicUsage.current_count + '/' + state.topicUsage.limit + '). ' +
        'Das Thema wird angelegt und startet automatisch, sobald ein Slot frei wird' +
        (queueDate ? ' (voraussichtlich ab ' + queueDate + ')' : '') +
        ', das kann nach dem Freiwerden eines Slots noch bis zu 30 Minuten dauern.';
      form.appendChild(queueMsg);
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
    if (state.projects.length === 0) newOption.selected = true;
    domainSelect.appendChild(newOption);

    var newDomainInput = document.createElement('input');
    newDomainInput.type = 'text';
    newDomainInput.id = 'cvz-create-domain-new';
    newDomainInput.className = 'cvz-create-input';
    newDomainInput.placeholder = 'Neue Domain (z.B. kunde-c.de)';
    newDomainInput.style.display = (domainSelect.value === '__new__') ? '' : 'none';

    domainSelect.addEventListener('change', function () {
      newDomainInput.style.display = (domainSelect.value === '__new__') ? '' : 'none';
      if (domainSelect.value === '__new__') newDomainInput.focus();
    });

    var TOPIC_MAX_CHARS = 80;
    var topicInput = document.createElement('input');
    topicInput.type = 'text';
    topicInput.id = 'cvz-create-topic';
    topicInput.className = 'cvz-create-input';
    topicInput.placeholder = 'Thema / Seed-Keyword (z.B. landingpage optimierung)';
    topicInput.maxLength = TOPIC_MAX_CHARS;

    var topicHint = document.createElement('p');
    topicHint.style.cssText = 'margin:-2px 0 6px;font-size:11px;color:var(--cvz-text-muted,#8b98a5);';
    topicHint.textContent = 'max. ' + TOPIC_MAX_CHARS + ' Zeichen';

    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'cvz-create-submit-btn';
    submitBtn.setAttribute('data-cvz-create-submit', '');
    submitBtn.disabled = state.isCreating;
    submitBtn.textContent = state.isCreating ? 'Wird angelegt \u2026' : 'Anlegen';

    form.appendChild(domainSelect);
    form.appendChild(newDomainInput);
    form.appendChild(topicInput);
    form.appendChild(topicHint);
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

  function renderOverview() {
    var wrap = document.createElement('div');
    wrap.appendChild(renderDomainAndTopicPicker());
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

  function getDomainDashboardData(projectId) {
    var topics = state.allTopics.filter(function (t) { return t.project_id === projectId; });
    var activeTopics = topics.filter(function (t) { return t.status !== 'archived'; });

    var live = CONFIG.useMockData ? null : state.domainDashboardCache[projectId];

    var opportunities = live ? live.opportunities.slice() : [];
    var contentIdeas = live ? live.contentIdeas.slice() : [];

    var trend = live ? live.trend : null;

    return {
      topics: topics, opportunities: opportunities, contentIdeas: contentIdeas, trend: trend,
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
      case 'themen':
        tabContent.appendChild(renderTopicStatusTable(data.topics));
        break;
      case 'uebersicht':
      default:
        if (CONFIG.useMockData) {
          tabContent.appendChild(renderTrendChart(MOCK_DOMAIN_TREND[project.id]));
        } else {
          tabContent.appendChild(renderDomainTrendChart(data.trend, state.isLoadingDomainDashboard));
        }
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
        '<p class="cvz-opportunity-type">' + escapeHtml(OPPORTUNITY_TYPE_LABELS[opp.opportunity_type] || opp.opportunity_type) + '</p>' +
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
    table.innerHTML = '<thead><tr><th>Thema</th><th>Status</th><th>Gestartet</th><th>Opportunities</th><th>Aktion</th></tr></thead>';
    var tbody = document.createElement('tbody');
    topics.forEach(function (topic) {
      var status = STATUS_LABELS[topic.status] || { label: topic.status, className: '' };
      var isBusy = state.archivingTopicId === topic.id;
      var noSlotAvailable = !!(state.topicUsage && !state.topicUsage.can_create);
      var reactivateDisabled = isBusy || noSlotAvailable;
      var reactivateTitle = (!isBusy && noSlotAvailable)
        ? ' title="Alle ' + state.topicUsage.limit + ' Topic-Slots sind aktuell belegt (' +
          state.topicUsage.current_count + '/' + state.topicUsage.limit +
          '). Erst ein anderes Thema deaktivieren oder ein weiteres Slot kaufen."'
        : '';
      var pendingArchival = topic.status === 'active' && !!topic.archive_effective_at;
      var neverRan = topic.status === 'queued' || (topic.status === 'archived' && !topic.last_monthly_collection_at);
      var actionCell;
      if (topic.status === 'archived') {
        actionCell =
          '<button type="button" class="cvz-retry-btn" data-cvz-reactivate-topic="' + topic.id + '"' +
            (reactivateDisabled ? ' disabled' : '') + reactivateTitle + '>' +
            (isBusy ? 'Wird aktiviert …' : 'Aktivieren') +
          '</button>';
      } else if (pendingArchival) {
        actionCell =
          '<button type="button" class="cvz-archive-btn" data-cvz-cancel-archive-topic="' + topic.id + '"' +
            (isBusy ? ' disabled' : '') + '>' +
            (isBusy ? 'Wird bearbeitet …' : 'Deaktivierung abbrechen') +
          '</button>';
      } else {
        actionCell =
          '<button type="button" class="cvz-archive-btn" data-cvz-archive-topic="' + topic.id + '"' +
            (isBusy ? ' disabled' : '') + '>' +
            (isBusy
              ? (topic.status === 'queued' ? 'Wird entfernt …' : 'Wird deaktiviert …')
              : (topic.status === 'queued' ? 'Aus Warteschlange entfernen' : 'Deaktivieren')) +
          '</button>';
      }
      if (neverRan) {
        actionCell += '<button type="button" class="cvz-delete-topic-btn" data-cvz-delete-topic="' + topic.id + '"' +
          (isBusy ? ' disabled' : '') + '>' +
          (isBusy ? 'Wird gel\u00f6scht …' : 'Ganz l\u00f6schen') +
        '</button>';
      }
      var extraStatusHint = '';
      if (pendingArchival) {
        var archiveDate = formatShortDate(topic.archive_effective_at);
        extraStatusHint = '<span class="cvz-status-hint">Wird deaktiviert' +
          (archiveDate ? ' am ' + archiveDate : '') + ', bisherige Daten bleiben erhalten.</span>';
      } else if (topic.status === 'queued') {
        extraStatusHint = '<span class="cvz-status-hint">Wartet auf einen freien Themen-Slot. Startet automatisch, kann nach Freiwerden eines Slots aber bis zu 30 Minuten dauern.</span>';
      }
      var STUCK_COLLECTING_THRESHOLD_MINUTES = 45;
      var isStuckCollecting = false;
      if (topic.status === 'collecting') {
        var startedAtRaw = topic.collecting_started_at || topic.created_at;
        var startedAtMs = startedAtRaw ? new Date(startedAtRaw).getTime() : NaN;
        if (!isNaN(startedAtMs)) {
          isStuckCollecting = (Date.now() - startedAtMs) / 60000 >= STUCK_COLLECTING_THRESHOLD_MINUTES;
        }
      }
      var tr = document.createElement('tr');
      tr.setAttribute('data-cvz-topic-id', topic.id);
      tr.innerHTML =
        '<td>' + escapeHtml(topic.name) + '</td>' +
        '<td><span class="cvz-status-badge ' + status.className + '">' +
          (topic.status === 'collecting' ? '<span class="cvz-spinner"></span>' : '') +
          status.label + '</span>' +
          (topic.status === 'collecting' && !isStuckCollecting ? '<span class="cvz-status-hint">Das wird mehrere Minuten dauern. Sobald der Lauf fertig ist, aktualisiert sich die Seite automatisch.</span>' : '') +
          (isStuckCollecting ? '<span class="cvz-status-hint">L\u00e4uft ungew\u00f6hnlich lange, wirkt h\u00e4ngengeblieben (z. B. durch einen Server-Neustart mittendrin).</span>' : '') +
          extraStatusHint +
          (topic.status === 'error' || isStuckCollecting ? (
            '<button type="button" class="cvz-retry-btn" data-cvz-retry-topic="' + topic.id + '"' +
              (state.retryingTopicId === topic.id ? ' disabled' : '') + '>' +
              (state.retryingTopicId === topic.id ? 'Wird erneut versucht …' : 'Erneut versuchen') +
            '</button>'
          ) : '') +
        '</td>' +
        '<td>' + formatRelativeTime(topic.created_at) + '</td>' +
        '<td>' + (topic.opportunities_count === null ? '–' : escapeHtml(topic.opportunities_count)) + '</td>' +
        '<td>' + actionCell + '</td>';
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var _scrollWrap = document.createElement('div');
    _scrollWrap.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;';
    _scrollWrap.appendChild(table);
    section.appendChild(_scrollWrap);
    return section;
  }

  function renderTopicDetailView() {
    var wrap = document.createElement('div');

    wrap.appendChild(renderDomainAndTopicPicker());

    var backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'cvz-back-btn';
    backBtn.setAttribute('data-cvz-back', '');
    backBtn.textContent = '← Zur Domain-Übersicht';

    var currentTopicListEntry = getTopicById(state.activeTopicId);
    var topActionRow = document.createElement('div');
    topActionRow.className = 'cvz-top-action-row';
    topActionRow.appendChild(backBtn);
    if (currentTopicListEntry) {
      var isArchivedNow = currentTopicListEntry.status === 'archived';
      var isQueuedNow = currentTopicListEntry.status === 'queued';
      var isBusyNow = state.archivingTopicId === currentTopicListEntry.id;
      var noSlotAvailableNow = !!(state.topicUsage && !state.topicUsage.can_create);
      var pendingArchivalNow = currentTopicListEntry.status === 'active' && !!currentTopicListEntry.archive_effective_at;
      var archiveToggleBtn = document.createElement('button');
      archiveToggleBtn.type = 'button';
      if (isArchivedNow) {
        archiveToggleBtn.className = 'cvz-retry-btn';
        archiveToggleBtn.setAttribute('data-cvz-reactivate-topic', currentTopicListEntry.id);
        archiveToggleBtn.disabled = isBusyNow || noSlotAvailableNow;
        if (!isBusyNow && noSlotAvailableNow) {
          archiveToggleBtn.title =
            'Alle ' + state.topicUsage.limit + ' Topic-Slots sind aktuell belegt (' +
            state.topicUsage.current_count + '/' + state.topicUsage.limit +
            '). Erst ein anderes Thema deaktivieren oder ein weiteres Slot kaufen.';
        }
        archiveToggleBtn.textContent = isBusyNow ? 'Wird aktiviert …' : 'Thema aktivieren';
      } else if (pendingArchivalNow) {
        archiveToggleBtn.className = 'cvz-archive-btn';
        archiveToggleBtn.setAttribute('data-cvz-cancel-archive-topic', currentTopicListEntry.id);
        archiveToggleBtn.disabled = isBusyNow;
        archiveToggleBtn.textContent = isBusyNow ? 'Wird bearbeitet …' : 'Deaktivierung abbrechen';
      } else {
        archiveToggleBtn.className = 'cvz-archive-btn';
        archiveToggleBtn.setAttribute('data-cvz-archive-topic', currentTopicListEntry.id);
        archiveToggleBtn.disabled = isBusyNow;
        archiveToggleBtn.textContent = isBusyNow
          ? (isQueuedNow ? 'Wird entfernt …' : 'Wird deaktiviert …')
          : (isQueuedNow ? 'Aus Warteschlange entfernen' : 'Thema deaktivieren');
      }
      topActionRow.appendChild(archiveToggleBtn);
    }
    wrap.appendChild(topActionRow);

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

    if (detail.topic.status === 'analyzing') {
      var analyzingBanner = document.createElement('div');
      analyzingBanner.className = 'cvz-card cvz-collecting-banner';
      analyzingBanner.innerHTML =
        '<p class="cvz-collecting-banner-text">' +
          '<span class="cvz-spinner"></span>' +
          'Daten gesammelt — Aktionsplan, Zusammenfassung und Lükenanalyse werden jetzt erstellt. ' +
          'Diese Seite aktualisiert sich automatisch.' +
        '</p>';
      wrap.appendChild(analyzingBanner);
      return wrap;
    }

    if (detail.topic.status === 'collecting') {
      var STUCK_COLLECTING_THRESHOLD_MINUTES_DETAIL = 45;
      var detailStartedAtRaw = detail.topic.collecting_started_at || detail.topic.created_at;
      var detailStartedAtMs = detailStartedAtRaw ? new Date(detailStartedAtRaw).getTime() : NaN;
      var isDetailStuck = !isNaN(detailStartedAtMs) &&
        (Date.now() - detailStartedAtMs) / 60000 >= STUCK_COLLECTING_THRESHOLD_MINUTES_DETAIL;

      var loadingBanner = document.createElement('div');
      loadingBanner.className = 'cvz-card cvz-collecting-banner';
      if (isDetailStuck) {
        loadingBanner.innerHTML =
          '<p class="cvz-collecting-banner-text">' +
            '\u26a0\ufe0f L\u00e4uft ungew\u00f6hnlich lange, wirkt h\u00e4ngengeblieben (z. B. durch einen Server-Neustart mittendrin).' +
          '</p>' +
          '<button type="button" class="cvz-retry-btn" data-cvz-retry-topic="' + detail.topic.id + '"' +
            (state.retryingTopicId === detail.topic.id ? ' disabled' : '') + '>' +
            (state.retryingTopicId === detail.topic.id ? 'Wird erneut versucht \u2026' : 'Erneut versuchen') +
          '</button>';
      } else {
        loadingBanner.innerHTML =
          '<p class="cvz-collecting-banner-text">' +
            '<span class="cvz-spinner"></span>' +
            'Erster Datenlauf l\u00e4uft noch, kann mehrere Minuten dauern. ' +
            'Diese Seite aktualisiert sich automatisch, sobald der Lauf fertig ist.' +
          '</p>';
      }
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
          // NEU (16.09.2026): zeigt die tats\u00e4chlich gespeicherte
          // Fehlermeldung (siehe main.py: _record_topic_run_error),
          // statt nur "ist fehlgeschlagen" ohne jeden Grund.
          (detail.topic.last_run_error
            ? '<br><span class="cvz-run-error-detail">' + escapeHtml(sanitizeRunError(detail.topic.last_run_error)) + '</span>'
            : '') +
        '</p>' +
        '<button type="button" class="cvz-retry-btn" data-cvz-retry-topic="' + detail.topic.id + '"' +
          (state.retryingTopicId === detail.topic.id ? ' disabled' : '') + '>' +
          (state.retryingTopicId === detail.topic.id ? 'Wird erneut versucht \u2026' : 'Erneut versuchen') +
        '</button>';
      wrap.appendChild(errorBanner);
    } else if (detail.topic.last_run_error) {
      // NEU (16.09.2026): Thema ist insgesamt weiter 'active' (es gibt
      // brauchbare Bestandsdaten), aber der ZULETZT versuchte Lauf (oder
      // ein einzelner Analyse-Schritt darin) ist fehlgeschlagen — dezenter
      // Hinweis statt der vollen roten Fehler-Leiste, die für einen
      // kompletten Erstlauf-Abbruch reserviert bleibt.
      var softErrorBanner = document.createElement('div');
      softErrorBanner.className = 'cvz-card cvz-collecting-banner cvz-soft-error-banner';
      softErrorBanner.innerHTML =
        '<p class="cvz-collecting-banner-text">' +
          '\u26a0\ufe0f Der letzte Lauf hatte ein Problem' +
          (detail.topic.last_run_error_at ? ' (' + formatRelativeTime(detail.topic.last_run_error_at) + ')' : '') +
          ':<br><span class="cvz-run-error-detail">' + escapeHtml(sanitizeRunError(detail.topic.last_run_error)) + '</span>' +
        '</p>';
      wrap.appendChild(softErrorBanner);
    }

    wrap.appendChild(renderTabNav(TOPIC_TABS, state.activeSubTab));

    var tabContent = document.createElement('div');
    tabContent.className = 'cvz-tab-content';

    // GEÄNDERT (16.09.2026): 5 fokussierte Views statt 7 Tabs
    switch (state.activeSubTab) {
      case 'journey':
        tabContent.appendChild(renderJourneyMapTab(state.activeTopicId, detail));
        break;
      case 'aktionsplan':
        tabContent.appendChild(renderAktionsplanTab(detail));
        break;
      case 'verlauf':
        tabContent.appendChild(renderVerlaufTab(state.activeTopicId, detail));
        break;
      case 'daten': {
        // NEU (20.09.2026): Retry-Hinweis, falls die GSC-Daten fehlen oder
        // der letzte Nachzieh-Versuch fehlgeschlagen ist.
        var datenStepNotice = renderStepNotice(detail, ['gsc']);
        if (datenStepNotice) tabContent.appendChild(datenStepNotice);
        // Content-Änderungen (mit verlinkten Keywords/Prompts) als Marker aufbereiten
        var _ccMarkers = (state.contentChangesCache[state.activeTopicId] || []).map(function (ch) {
          return {
            linked_search_query_ids: ch.linked_search_query_ids || [],
            linked_prompt_ids: ch.linked_prompt_ids || [],
            entry_text: ch.description,
            created_at: ch.changed_at,
            keyword_deltas: {},
          };
        });
        var _allEntries = (detail.changelog || []).concat(_ccMarkers);
        // Keywords (thematische, ohne GSC near-miss)
        var thematicKws = (detail.search_queries || []).filter(function (q) { return q.source !== 'gsc_near_miss'; });
        tabContent.appendChild(renderKeywordsTable(thematicKws, true, _allEntries));
        var posInsight = renderPositioningInsight(detail.positioning_insight);
        if (posInsight) tabContent.appendChild(posInsight);
        // Prompts nach Phase
        tabContent.appendChild(renderPromptsByPhase(detail.prompts, true, _allEntries));
        // GSC-Performance (mit Relevanzfilter)
        var _gscFiltered = filterGscByTopicRelevance(detail.gsc_rows, detail);
        tabContent.appendChild(renderGscBlock(_gscFiltered, state.activeTopicId, _allEntries));
        break;
      }
      case 'situation':
      default:
        tabContent.appendChild(renderSituationTab(state.activeTopicId, detail));
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
      '<p class="cvz-chart-caption">Sichtbare Stable-Core-Prompts pro Woche, von ' + trendData.total_prompts + ' insgesamt.</p>'
    );
  }

  function renderDomainTrendChart(weeks, isLoading) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Sichtbarkeits-Entwicklung über die Wochen';
    section.appendChild(heading);

    if (isLoading) {
      var loading = document.createElement('p');
      loading.className = 'cvz-card-placeholder-text';
      loading.textContent = 'Lädt...';
      section.appendChild(loading);
      return section;
    }

    if (!weeks || weeks.length < 2) {
      var emptyCard = document.createElement('div');
      emptyCard.className = 'cvz-card';
      emptyCard.innerHTML =
        buildEmptyChartSvg() +
        '<p class="cvz-chart-caption">Es liegen noch nicht genügend Daten vor. Ab der zweiten Woche mit ausgewerteten Läufen siehst du hier den Sichtbarkeits-Verlauf.</p>';
      section.appendChild(emptyCard);
      return section;
    }

    var xLabels = weeks.map(function (w) { return formatShortDate(w.week); });
    var mentionedRate = weeks.map(function (w) { return w.total ? Math.round((w.mentioned / w.total) * 100) : null; });
    var citedRate = weeks.map(function (w) { return w.total ? Math.round((w.cited / w.total) * 100) : null; });
    var recommendedRate = weeks.map(function (w) { return w.total ? Math.round((w.recommended / w.total) * 100) : null; });

    var card = document.createElement('div');
    card.className = 'cvz-card';
    card.innerHTML =
      buildLineChartSvg([
        { label: 'Erwähnt', values: mentionedRate, color: 'var(--cvz-amber)' },
        { label: 'Zitiert', values: citedRate, color: 'var(--cvz-teal)' },
        { label: 'Empfohlen', values: recommendedRate, color: 'var(--cvz-red)' },
      ], xLabels, { maxY: 100 }) +
      '<div class="cvz-chart-legend">' +
        '<span class="cvz-chart-legend-item"><span class="cvz-legend-dot" style="background: var(--cvz-amber)"></span>Erwähnt</span>' +
        '<span class="cvz-chart-legend-item"><span class="cvz-legend-dot" style="background: var(--cvz-teal)"></span>Zitiert</span>' +
        '<span class="cvz-chart-legend-item"><span class="cvz-legend-dot" style="background: var(--cvz-red)"></span>Empfohlen</span>' +
      '</div>' +
      '<p class="cvz-chart-caption">Anteil der ausgewerteten ChatGPT/Gemini-L\u00e4ufe pro Woche (0\u2013100\u202f%), \u00fcber alle aktiven Themen dieser Domain aufsummiert, in dem die eigene Domain erw\u00e4hnt, zitiert bzw. aktiv empfohlen wurde.</p>';
    section.appendChild(card);
    return section;
  }

  var WEEKDAY_MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  function formatShortDateISO(isoDate) {
    var parts = isoDate.split(/[-T]/);
    var monthIndex = parseInt(parts[1], 10) - 1;
    return parseInt(parts[2], 10) + '. ' + (WEEKDAY_MONTHS_DE[monthIndex] || parts[1]);
  }

  function buildEmptyChartSvg() {
    var width = 640, height = 180, padding = 32;
    var baselineY = height - padding;
    return (
      '<svg viewBox="0 0 ' + width + ' ' + height + '" class="cvz-chart-svg" preserveAspectRatio="xMidYMid meet">' +
        '<line x1="' + padding + '" y1="' + baselineY + '" x2="' + (width - padding) + '" y2="' + baselineY + '" class="cvz-chart-axis"></line>' +
      '</svg>'
    );
  }

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

    // NEU (19.09.2026): Wenn mehrere Serien beim selben X-Wert denselben Score
    // haben (z.B. alle Phasen bei 0%, siehe Chat-Verlauf 19.09.2026 — erster
    // Analyse-Lauf eines Topics, alle vier Phasen landen exakt übereinander),
    // zeichnet SVG in Dokumentreihenfolge — die zuletzt gezeichnete Serie
    // verdeckt optisch alle darunterliegenden identischen Punkte vollständig.
    // Fix: jede Serie bekommt einen kleinen, konstanten horizontalen Versatz
    // je nach Position in seriesList, damit deckungsgleiche Punkte sichtbar
    // nebeneinander liegen statt sich zu überdecken. Bei unterschiedlichen
    // Werten ist der Versatz (wenige Pixel) nicht wahrnehmbar.
    var DOT_SPACING = 3;
    function offsetForSeries(si) {
      return (si - (seriesList.length - 1) / 2) * DOT_SPACING;
    }

    function xFor(i, si) { return padding + i * stepX + (si != null ? offsetForSeries(si) : 0); }
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

    seriesList.forEach(function (s, si) {
      var color = s.color || 'var(--cvz-teal)';
      var segment = [];
      var polylines = [];
      s.values.forEach(function (v, i) {
        if (v == null) {
          if (segment.length > 1) polylines.push(segment.join(' '));
          segment = [];
          return;
        }
        segment.push(xFor(i, si).toFixed(1) + ',' + yFor(v).toFixed(1));
      });
      if (segment.length > 1) polylines.push(segment.join(' '));

      polylines.forEach(function (points) {
        var dashAttr = s.dashed ? ' stroke-dasharray="6 4"' : '';
        parts.push('<polyline points="' + points + '"' + dashAttr + ' class="cvz-chart-line" style="stroke:' + color + ';opacity:' + (s.dashed ? '.7' : '1') + '"></polyline>');
      });

      s.values.forEach(function (v, i) {
        if (v == null) return;
        var cx = xFor(i, si).toFixed(1), cy = yFor(v).toFixed(1);
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

  function weekStartLabel(isoDateStr) {
    var d = new Date(isoDateStr);
    var day = d.getUTCDay();
    var diff = day === 0 ? 6 : day - 1;
    var monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
    return monday.toISOString().slice(0, 10);
  }

  function rankToVisibilityScore(rank) {
    if (rank == null) return null;
    return Math.max(0, Math.min(100, Math.round(100 - (rank - 1) * 4)));
  }

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
    var archivedNotice = '';
    if (topic.status === 'archived') {
      archivedNotice = '<p class="cvz-archived-notice">Archiviert. Es werden aktuell keine neuen Datenläufe für dieses Thema gestartet. Alle bisher gesammelten Daten bleiben unten sichtbar.</p>';
    } else if (topic.status === 'active' && topic.archive_effective_at) {
      var archiveDate = formatShortDate(topic.archive_effective_at);
      archivedNotice = '<p class="cvz-archived-notice">Deaktivierung vorgemerkt.' +
        (archiveDate ? ' für ' + archiveDate : '') +
        ' Bis dahin laufen die regulären Datenläufe für dieses Thema noch normal weiter.</p>';
    } else if (topic.status === 'queued') {
      archivedNotice = '<p class="cvz-archived-notice">Wartet auf einen freien Themen-Slot. Der erste Datenlauf startet automatisch, kann nach Freiwerden eines Slots aber bis zu 30 Minuten dauern.</p>';
    }
    card.innerHTML =
      '<h3 class="cvz-section-title">' + escapeHtml(topic.name) + '</h3>' +
      '<p class="cvz-card-eyebrow">' + escapeHtml(topic.seed_keyword) + ' · ' + escapeHtml(topic.own_domain) + '</p>' +
      archivedNotice +
      '<p class="cvz-summary-text">' + escapeHtml(topic.latest_summary || 'Noch keine Zusammenfassung vorhanden.') + '</p>' +
      renderSummaryDetailSections(topic.summary_detail);
    return card;
  }

  function renderSummaryDetailSections(detail) {
    if (!detail) return '';
    var html = '';
    var maturity = detail.data_maturity || {};

    var THIN_DATA_NOTE = '<p class="cvz-thin-data-note">Datenbasis hierf\u00fcr noch d\u00fcnn, die Einsch\u00e4tzung wird mit mehr gesammelten Daten pr\u00e4ziser.</p>';

    var strength = detail.competitor_strength;
    if (strength && strength.strongest_domain) {
      html += '<div class="cvz-summary-subsection">' +
        '<p class="cvz-section-label">St\u00e4rkster Wettbewerber</p>' +
        '<p class="cvz-summary-text"><strong>' + escapeHtml(strength.strongest_domain) + '</strong>' +
        (strength.reasoning ? ': ' + escapeHtml(strength.reasoning) : '') +
        '</p>' +
        (maturity.wettbewerber_duenn ? THIN_DATA_NOTE : '') +
        '</div>';
    }

    var phaseSummaries = detail.phase_summaries;
    if (phaseSummaries) {
      var phasenDuenn = maturity.phasen_duenn || {};
      // GEÄNDERT (15.09.2026): echte Tabelle statt gestapelter Blöcke,
      // Kundenwunsch: "eine Tabelle, die in die unterschiedlichen Phasen
      // geht und dort eine Einschätzung gibt".
      // GE\u00c4NDERT (20.09.2026): Spalte "Empfohlene Content-Typen" entfernt \u2014
      // sie kam aus einer eigenen, von claude_summary.py unabh\u00e4ngigen
      // Claude-Generierung und konnte damit vom (separat generierten)
      // Aktionsplan abweichen. Die Zusammenfassungs-Card ist reine
      // Bestandsaufnahme ("wo stehen wir"), Handlungsempfehlungen mit
      // Priorit\u00e4t und Beleg geh\u00f6ren ausschlie\u00dflich in den Aktionsplan-Tab.
      var phaseRowsHtml = PHASE_ORDER.map(function (phase) {
        var p = phaseSummaries[phase];
        if (!p || !p.summary) return '';
        return (
          '<tr>' +
            '<td style="color:var(--cvz-text-muted,#8b98a5);"><strong>' + escapeHtml(PHASE_LABELS[phase] || phase) + '</strong></td>' +
            '<td style="color:var(--cvz-text-muted,#8b98a5);">' + escapeHtml(p.summary) + (phasenDuenn[phase] ? THIN_DATA_NOTE : '') + '</td>' +
          '</tr>'
        );
      }).join('');
      if (phaseRowsHtml) {
        html += '<div class="cvz-summary-subsection">' +
          '<p class="cvz-section-label">Je Phase</p>' +
          '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">' +
          '<table class="cvz-table" style="min-width:360px;"><thead><tr><th>Phase</th><th>Einsch\u00e4tzung</th></tr></thead>' +
          '<tbody>' + phaseRowsHtml + '</tbody></table>' +
          '</div>' +
          (maturity.content_luecken_duenn ? THIN_DATA_NOTE : '') +
          '</div>';
      }
    }

    if (detail.keyword_opportunities) {
      html += '<div class="cvz-summary-subsection">' +
        '<p class="cvz-section-label">Keyword-Chancen &amp; -Schw\u00e4chen</p>' +
        '<p class="cvz-summary-text">' + escapeHtml(detail.keyword_opportunities) + '</p>' +
        (maturity.keyword_chancen_duenn ? THIN_DATA_NOTE : '') +
        '</div>';
    }

    html += '<p class="cvz-ai-attribution">Zusammenfassung erstellt mit Claude (Anthropic)</p>';
    return html;
  }

  // NEU (15.09.2026): siehe main.py: _compute_best_content_chances.
  // VERBESSERT (16.09.2026): visuell aussagekraeftiger, Zitierrate als Balken.
  function renderBestContentChancesSection(chances) {
    if (!chances || chances.length === 0) return null;

    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Beste Content-Chancen';
    section.appendChild(heading);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '12px';
    sub.textContent = 'Prompts und Keywords mit dem höchsten Hebel für mehr Sichtbarkeit.';
    section.appendChild(sub);

    var grid = document.createElement('div');
    grid.className = 'cvz-opportunity-grid';

    chances.forEach(function (chance) {
      var cfg = CONTENT_CHANCE_CONFIG[chance.kind] || {
        label: chance.kind,
        color: '#8b98a5',
        bg: 'rgba(139,152,165,.08)',
        border: 'rgba(139,152,165,.3)',
        tip: '',
      };

      var card = document.createElement('div');
      card.className = 'cvz-card cvz-idea-card';
      card.style.cssText = 'border-left:3px solid ' + cfg.color + ';padding:0;overflow:hidden;';

      var inner = document.createElement('div');
      inner.style.cssText = 'padding:12px 14px;display:flex;flex-direction:column;gap:10px;';

      // Kind-Chip
      var chip = document.createElement('span');
      chip.style.cssText =
        'display:inline-flex;align-items:center;align-self:flex-start;' +
        'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;' +
        'padding:2px 8px;border-radius:9999px;' +
        'color:' + cfg.color + ';background:' + cfg.bg + ';border:1px solid ' + cfg.border + ';';
      chip.textContent = cfg.label;
      inner.appendChild(chip);

      // Prompt / Keyword als Zitat
      var lbl = document.createElement('p');
      lbl.style.cssText = 'margin:0;font-size:13px;font-weight:600;color:var(--cvz-text-muted,#8b98a5);line-height:1.45;font-style:italic;';
      lbl.textContent = '„' + chance.label + '“';
      inner.appendChild(lbl);

      // Zitierrate parsen ("N von M ausgewerteten Laeufen zitiert")
      var m = chance.detail ? chance.detail.match(/(\d+)\s+von\s+(\d+)/) : null;
      if (m) {
        var cited = parseInt(m[1], 10);
        var total = parseInt(m[2], 10);
        var pct   = total > 0 ? Math.round((cited / total) * 100) : 0;

        var statRow = document.createElement('div');
        statRow.style.cssText = 'display:flex;align-items:center;gap:12px;';

        var statBox = document.createElement('div');
        statBox.style.cssText = 'flex-shrink:0;text-align:center;min-width:44px;';
        statBox.innerHTML =
          '<div style="font-size:22px;font-weight:800;line-height:1;color:' + cfg.color + ';">' + cited + '/' + total + '</div>' +
          '<div style="font-size:10px;margin-top:2px;color:var(--cvz-text-muted,#8b98a5);">Laeufe</div>';
        statRow.appendChild(statBox);

        var barCol = document.createElement('div');
        barCol.style.cssText = 'flex:1 1 0;';
        var barTrack = document.createElement('div');
        barTrack.style.cssText = 'height:6px;background:var(--cvz-border,#232b36);border-radius:3px;overflow:hidden;margin-bottom:3px;';
        var barFill = document.createElement('div');
        barFill.style.cssText = 'height:100%;width:' + pct + '%;background:' + cfg.color + ';border-radius:3px;';
        barTrack.appendChild(barFill);
        barCol.appendChild(barTrack);
        var rateLbl = document.createElement('p');
        rateLbl.style.cssText = 'margin:0;font-size:11px;color:var(--cvz-text-muted,#8b98a5);';
        rateLbl.textContent = pct + '% Zitierrate';
        barCol.appendChild(rateLbl);
        statRow.appendChild(barCol);

        inner.appendChild(statRow);
      } else if (chance.detail) {
        var detailTxt = document.createElement('p');
        detailTxt.style.cssText = 'margin:0;font-size:12px;color:var(--cvz-text-muted,#8b98a5);';
        detailTxt.textContent = chance.detail;
        inner.appendChild(detailTxt);
      }

      // Tipp / naechster Schritt
      if (cfg.tip) {
        var tipEl = document.createElement('p');
        tipEl.style.cssText =
          'margin:0;font-size:11px;color:' + cfg.color + ';' +
          'border-top:1px solid ' + cfg.border + ';padding-top:8px;';
        tipEl.textContent = cfg.tip;
        inner.appendChild(tipEl);
      }

      card.appendChild(inner);
      grid.appendChild(card);
    });

    section.appendChild(grid);
    return section;
  }


  // GEÄNDERT (16.09.2026 II): Zwei fokussierte Tabellen statt Einheitstabelle.
  // Tabelle 1: Keywords mit bestehendem Ranking, gewichtet nach Suchvolumen.
  // Tabelle 2: Prompts / Chancen, bei denen Wettbewerber zitiert werden, nicht wir.
  // Tabelle 3: Content-Ideen.
  // Keine Em-Dashes. Kein "Naechster Schritt" fuer Opportunities (immer leer).
  function renderActionTab(opportunities, contentIdeas, keywords, sourceProfiles) {
    var wrap = document.createElement('div');

    // ── Tabelle 1: Keyword-Chancen ───────────────────────────────────────────
    (function () {
      var heading = document.createElement('p');
      heading.className = 'cvz-section-label';
      heading.textContent = 'Keywords mit bestehendem Ranking';
      wrap.appendChild(heading);

      var intro = document.createElement('p');
      intro.className = 'cvz-card-placeholder-text';
      intro.style.marginBottom = '12px';
      intro.textContent =
        'Keywords, für die Google eure Domain bereits rankt (GSC oder organisch), sortiert nach Suchvolumen. ' +
        'Aufklappen zeigt die Top-SERP-Ergebnisse.';
      wrap.appendChild(intro);

      var rankedKws = (keywords || []).filter(function (kw) {
        return kw.organic_rank != null || kw.gsc_position != null;
      }).sort(function (a, b) {
        return (b.search_volume || 0) - (a.search_volume || 0);
      });

      if (rankedKws.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'cvz-card-placeholder-text';
        empty.textContent = 'Noch keine Keywords mit Ranking vorhanden.';
        wrap.appendChild(empty);
      } else {
        var list = document.createElement('div');
        list.className = 'cvz-prompt-list';
        list.style.marginBottom = '4px';

        // Table header row
        var headerRow = document.createElement('div');
        headerRow.style.cssText =
          'display:flex;gap:8px;padding:4px 12px 6px;font-size:11px;font-weight:600;' +
          'text-transform:uppercase;letter-spacing:.05em;color:var(--cvz-text-muted,#6b7280);' +
          'border-bottom:1px solid var(--cvz-border,#e5e7eb);';
        headerRow.innerHTML =
          '<span style="flex:1 1 0;">Keyword</span>' +
          '<span style="width:110px;text-align:right;">Suchen/Mo.</span>' +
          '<span style="width:100px;text-align:right;">Eigene Pos.</span>' +
          '<span style="width:24px;"></span>';
        list.appendChild(headerRow);

        rankedKws.forEach(function (kw) {
          var rowId = 'action-kw-' + (kw.id || kw.keyword);
          var ownPos = kw.organic_rank != null ? kw.organic_rank : kw.gsc_position;
          var posStr = ownPos != null ? String(Math.round(ownPos * 10) / 10) : '';
          var hasSerpData = kw.top_serp_results && kw.top_serp_results.length > 0;
          var expanded = state.expandedKeywordId === rowId;

          // Main row
          var row = document.createElement('div');
          row.className = 'cvz-prompt-row' + (hasSerpData ? ' cvz-prompt-row-clickable' : '');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;';
          if (hasSerpData) {
            row.setAttribute('data-cvz-keyword-toggle', rowId);
            row.setAttribute('data-cvz-keyword-text', kw.keyword);
          }
          row.innerHTML =
            '<span class="cvz-prompt-text" style="flex:1 1 0;">' + escapeHtml(kw.keyword) + '</span>' +
            '<span style="width:110px;text-align:right;font-size:13px;color:var(--cvz-text-muted,#6b7280);">' +
              (kw.search_volume != null
                ? Number(kw.search_volume).toLocaleString('de-DE')
                : '<span style="opacity:.4;">-</span>') +
            '</span>' +
            '<span style="width:100px;text-align:right;font-size:13px;' +
              (ownPos != null && ownPos <= 10 ? 'color:#35a86b;font-weight:600;' : 'color:var(--cvz-text-muted,#6b7280);') + '">' +
              (posStr ? 'Pos. ' + posStr : '<span style="opacity:.4;">-</span>') +
            '</span>' +
            '<span style="width:24px;text-align:center;font-size:11px;color:var(--cvz-text-muted,#6b7280);">' +
              (hasSerpData ? (expanded ? '▾' : '▸') : '') +
            '</span>';
          list.appendChild(row);

          // SERP expansion
          if (hasSerpData && expanded) {
            var expRow = document.createElement('div');
            expRow.className = 'cvz-keyword-expansion';
            expRow.style.cssText = 'padding:8px 12px 12px 12px;background:var(--cvz-card-bg,#f9fafb);border-bottom:1px solid var(--cvz-border,#e5e7eb);';
            expRow.innerHTML = renderSerpSummaryBlock(kw);
            list.appendChild(expRow);
          }
        });

        wrap.appendChild(list);
      }
    })();

    // ── Tabelle 2: Zitierungs-Luecken ────────────────────────────────────────
    // GEÄNDERT (16.09.2026): Zeigt jetzt Beschreibung + Empfehlung als
    // Hauptinhalt; Wettbewerber-Domains nur kompakt als kleine Chips darunter.
    // Vorher wurde nur die Domain-Liste als Blob gezeigt ohne Kontext.
    (function () {
      var citationTypes = ['competitor_citation', 'ai_visible_competitor_dominates'];
      var citationOpps = (opportunities || []).filter(function (o) {
        return citationTypes.indexOf(o.opportunity_type) !== -1 &&
               (o.status === 'new' || o.status === 'reviewed');
      });

      if (citationOpps.length === 0) return;

      var heading = document.createElement('p');
      heading.className = 'cvz-section-label';
      heading.style.marginTop = '28px';
      heading.textContent = 'Chancen: Zitierungs-Lücken';
      wrap.appendChild(heading);

      citationOpps.forEach(function (opp) {
        var sd = opp.supporting_data || {};
        var compDomains = opp.opportunity_type === 'competitor_citation'
          ? (sd.cited_domains || [])
          : (sd.competitor_domains_cited || []);

        // Show max 5 domains to keep card compact
        var domainsToShow = compDomains.slice(0, 5);
        var moreCount = compDomains.length - domainsToShow.length;

        var typeLabel = OPPORTUNITY_TYPE_LABELS[opp.opportunity_type] || opp.opportunity_type;

        // Description: keep full text (it contains the actionable insight)
        var desc = (opp.description || '').trim();

        // Content recommendation
        var rec = (opp.content_recommendation || '').trim();

        var domainsChipsHtml = domainsToShow.map(function (d) {
          return '<span style="display:inline-flex;align-items:center;gap:3px;' +
            'background:var(--cvz-chip-bg,#f3f4f6);border-radius:4px;' +
            'padding:2px 6px;font-size:11px;margin:2px 4px 2px 0;">' +
            '<img src="https://www.google.com/s2/favicons?sz=12&domain=' + encodeURIComponent(d) + '" ' +
            'style="width:12px;height:12px;">' +
            escapeHtml(d) + '</span>';
        }).join('') + (moreCount > 0
          ? '<span style="font-size:11px;color:var(--cvz-text-muted,#6b7280);padding:2px 4px;">+' + moreCount + ' weitere</span>'
          : '');

        var card = document.createElement('div');
        card.className = 'cvz-card';
        card.style.marginBottom = '8px';

        card.innerHTML =
          '<p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;' +
              'letter-spacing:.05em;color:var(--cvz-text-muted,#6b7280);">' + escapeHtml(typeLabel) + '</p>' +
          (desc
            ? '<p style="margin:0 0 8px;font-size:13px;line-height:1.5;">' + escapeHtml(desc) + '</p>'
            : '') +
          (rec
            ? '<p style="margin:0 0 8px;font-size:13px;font-weight:600;' +
              'color:var(--cvz-teal,#0d9488);">' + escapeHtml(rec) + '</p>'
            : '') +
          (domainsChipsHtml
            ? '<p style="margin:4px 0 0;font-size:11px;color:var(--cvz-text-muted,#6b7280);font-weight:600;' +
              'text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Zitierte Wettbewerber</p>' +
              '<div style="display:flex;flex-wrap:wrap;gap:2px;">' + domainsChipsHtml + '</div>'
            : '');

        wrap.appendChild(card);
      });
    })();

    // ── Tabelle 3: Content-Ideen ─────────────────────────────────────────────
    (function () {
      if (!contentIdeas || contentIdeas.length === 0) return;

      var heading = document.createElement('p');
      heading.className = 'cvz-section-label';
      heading.style.marginTop = '28px';
      heading.textContent = 'Content-Ideen aus KI-Analysen';
      wrap.appendChild(heading);

      var grid = document.createElement('div');
      grid.className = 'cvz-opportunity-grid';

      contentIdeas.forEach(function (idea) {
        var phaseLabel    = idea.phase    ? (PHASE_LABELS[idea.phase]       || idea.phase)    : '';
        var providerLabel = idea.provider ? (MODEL_LABELS[idea.provider]    || idea.provider) : '';

        var colonIdx   = (idea.description || '').indexOf(': ');
        var ideaTitle  = colonIdx >= 0 ? idea.description.substring(0, colonIdx) : (idea.description || '');
        var ideaReason = colonIdx >= 0 ? idea.description.substring(colonIdx + 2) : '';

        var card = document.createElement('div');
        card.className = 'cvz-card cvz-idea-card';
        card.innerHTML =
          (phaseLabel
            ? '<p class="cvz-opportunity-type">' + escapeHtml(phaseLabel) + '</p>'
            : '') +
          '<p style="margin:0 0 4px;font-weight:600;font-size:13px;">' + escapeHtml(ideaTitle) + '</p>' +
          (ideaReason
            ? '<p class="cvz-opportunity-description">' + escapeHtml(ideaReason) + '</p>'
            : '') +
          (providerLabel
            ? '<p style="margin:6px 0 0;font-size:12px;color:#6b7280;">Quelle: ' + escapeHtml(providerLabel) + '</p>'
            : '');
        grid.appendChild(card);
      });

      wrap.appendChild(grid);
    })();

    // ── Plattformen mit Veroeffentlichungs-Chance ────────────────────────────
    var publishable = (sourceProfiles || []).filter(function (p) { return p.can_publish === true; });
    if (publishable.length > 0) {
      var platHeading = document.createElement('p');
      platHeading.className = 'cvz-section-label';
      platHeading.style.marginTop = '32px';
      platHeading.textContent = 'Plattformen mit Veröffentlichungs-Chance';
      wrap.appendChild(platHeading);

      var platIntro = document.createElement('p');
      platIntro.className = 'cvz-card-placeholder-text';
      platIntro.style.marginBottom = '16px';
      platIntro.textContent =
        'Diese Plattformen wurden von KI-Modellen als Quellen zitiert und normale Nutzer können dort eigene Inhalte veröffentlichen (z. B. Foren, Bewertungsportale, YouTube, Wikipedia).';
      wrap.appendChild(platIntro);

      var platGrid = document.createElement('div');
      platGrid.className = 'cvz-opportunity-grid';
      publishable.forEach(function (p) {
        var card = document.createElement('div');
        card.className = 'cvz-card cvz-idea-card';
        card.innerHTML =
          '<p class="cvz-opportunity-type">' +
            '<img src="https://www.google.com/s2/favicons?sz=16&domain=' + encodeURIComponent(p.domain) + '" ' +
            'style="width:16px;height:16px;vertical-align:middle;margin-right:6px;">' +
            escapeHtml(p.domain) +
          '</p>' +
          '<p class="cvz-opportunity-description" style="font-size:12px;color:#888;margin-bottom:4px;">' +
            escapeHtml(p.content_type || '') +
          '</p>' +
          (p.summary ? '<p class="cvz-opportunity-description">' + escapeHtml(p.summary) + '</p>' : '') +
          (p.differentiation_suggestion
            ? '<div class="cvz-action-recommendation"><p class="cvz-changelog-guided-label">Abgrenzung</p>' +
              '<p class="cvz-opportunity-description">' + escapeHtml(p.differentiation_suggestion) + '</p></div>'
            : '');
        platGrid.appendChild(card);
      });
      wrap.appendChild(platGrid);
    }

    return wrap;
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
        '<p class="cvz-opportunity-type">' + escapeHtml(OPPORTUNITY_TYPE_LABELS[opp.opportunity_type] || opp.opportunity_type) + '</p>' +
        '<p class="cvz-opportunity-description">' + escapeHtml(opp.description || '') + '</p>';
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  // --- NEU (17.09.2026): Phase-Heuristik + localStorage-Overrides ---
  function _detectGapPhase(description) {
    if (!description) return null;
    var d = description.toLowerCase();
    if (/vergleich|versus|\bvs\b|alternativ|unterschied|gegenüber|brownfield.*greenfield|greenfield.*brownfield|verschiedene.*ansätz|ansätz.*vergleich|migrationsansätz/.test(d)) return 'comparison';
    if (/anforderung|compliance|dsgvo|rechtlich|gesetz|regulier|prüfung|audit|zertifizier|bewertungs.*kriterien|beurteilung/.test(d)) return 'evaluation';
    if (/implementierung|deployment|einführung|rollout|projektplan|zeitplan|meilenstein|performance.*nach|monitoring.*nach|nach.*implementierung|nach.*archivierung|betrieb/.test(d)) return 'decision';
    if (/was ist|grundlagen|überblick|einführung.*thema|definition|konzept|grundsätzlich|wie funktioniert|warum.*archivierung/.test(d)) return 'exploration';
    return null;
  }

  function _gapLsKey(topicId, desc) {
    return 'cvz-gap-phase:' + (topicId || '') + ':' + (desc || '').substring(0, 60);
  }
  function _getGapPhase(topicId, desc) {
    try { return localStorage.getItem(_gapLsKey(topicId, desc)) || null; } catch (e) { return null; }
  }
  function _setGapPhase(topicId, desc, phase) {
    try {
      if (phase) { localStorage.setItem(_gapLsKey(topicId, desc), phase); }
      else { localStorage.removeItem(_gapLsKey(topicId, desc)); }
    } catch (e) {}
  }

  // --- NEU (17.09.2026): Quellen-Analyse phase-gruppiert ---
  function renderSourceProfilesSection(profiles, topicId, sovData) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Quellen-Analyse (Live-Web-Search, gecacht pro URL)';
    section.appendChild(heading);

    // Wenn share_of_voice-Daten vorhanden: phase-gruppierte Ansicht
    var hasSov = sovData && PHASE_ORDER.some(function (p) { return sovData[p] && sovData[p].length; });
    if (hasSov) {
      _renderSourcesByPhase(section, sovData);
      return section;
    }

    // Fallback: flache Liste
    if (!profiles || profiles.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Quellen-Analyse verfügbar.';
      section.appendChild(empty);
      return section;
    }
    var table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';
    var thead = document.createElement('thead');
    var hrow = document.createElement('tr');
    ['Domain', 'Content-Typ', 'Zusammenfassung', 'Differenzierung'].forEach(function (label, i) {
      var th = document.createElement('th');
      th.textContent = label;
      th.style.cssText = 'text-align:left;padding:7px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--cvz-text-muted,#8b98a5);border-bottom:1px solid var(--cvz-border,#30363d);white-space:nowrap;' + (i === 0 ? 'width:160px;' : '');
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    var _visibleProfiles = profiles.filter(function (p) { return p.summary || p.content_type; });
    _visibleProfiles.forEach(function (profile, idx) {
      var borderBottom = idx === _visibleProfiles.length - 1 ? 'none' : '1px solid var(--cvz-border,#30363d)';
      var tr = document.createElement('tr');
      var tdDomain = document.createElement('td');
      tdDomain.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-weight:600;';
      tdDomain.innerHTML = '<img style="width:14px;height:14px;border-radius:2px;vertical-align:middle;margin-right:5px;object-fit:contain;" src="https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(profile.domain) + '" alt="">' + escapeHtml(profile.domain);
      tr.appendChild(tdDomain);
      var tdType = document.createElement('td');
      tdType.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-size:12px;color:var(--cvz-text-muted,#8b98a5);';
      tdType.textContent = profile.content_type ? (CONTENT_TYPE_LABELS[profile.content_type] || profile.content_type) : '';
      tr.appendChild(tdType);
      var tdSum = document.createElement('td');
      tdSum.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-size:12px;line-height:1.4;';
      tdSum.textContent = profile.summary || '';
      tr.appendChild(tdSum);
      var tdDiff = document.createElement('td');
      tdDiff.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-size:12px;line-height:1.4;color:var(--cvz-text-muted,#8b98a5);';
      tdDiff.textContent = profile.differentiation_suggestion || '';
      tr.appendChild(tdDiff);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  function _renderSourcesByPhase(section, sov) {
    var activeFilter = state.sourcePhaseFilter;

    // Phase-Filter-Chips
    var filterRow = document.createElement('div');
    filterRow.className = 'cvz-persona-filter';
    filterRow.style.marginBottom = '12px';
    var allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'cvz-persona-chip' + (activeFilter === null ? ' cvz-persona-chip-active' : '');
    allChip.setAttribute('data-cvz-source-phase-filter', '');
    allChip.textContent = 'Alle';
    filterRow.appendChild(allChip);
    PHASE_ORDER.forEach(function (phase) {
      var count = (sov[phase] || []).length;
      if (!count) return;
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cvz-persona-chip' + (activeFilter === phase ? ' cvz-persona-chip-active' : '');
      chip.style.borderLeftColor = PHASE_COLORS[phase] || '';
      chip.setAttribute('data-cvz-source-phase-filter', phase);
      chip.textContent = (PHASE_LABELS[phase] || phase) + ' (' + count + ')';
      filterRow.appendChild(chip);
    });
    section.appendChild(filterRow);

    // Tabelle
    var table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';
    var thead = document.createElement('thead');
    var hrow = document.createElement('tr');
    var COLS = ['Domain', 'Phase', 'Zitierrate', 'Content-Typ', 'Zusammenfassung', 'Differenzierung'];
    var COL_WIDTHS = ['150px', '130px', '80px', '110px', '', ''];
    COLS.forEach(function (label, i) {
      var th = document.createElement('th');
      th.textContent = label;
      th.style.cssText = 'text-align:left;padding:7px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--cvz-text-muted,#8b98a5);border-bottom:1px solid var(--cvz-border,#30363d);white-space:nowrap;' + (COL_WIDTHS[i] ? 'width:' + COL_WIDTHS[i] + ';' : '');
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');

    var phasesToRender = activeFilter ? [activeFilter] : PHASE_ORDER;
    phasesToRender.forEach(function (phase) {
      var sources = sov[phase] || [];
      if (!sources.length) return;
      var phaseColor = PHASE_COLORS[phase] || '#4a5568';
      var _visibleSources = sources.filter(function (s) { return s.summary || s.content_type; });
      _visibleSources.forEach(function (src, idx) {
        var isLast = !activeFilter
          ? (idx === _visibleSources.length - 1 && phase === phasesToRender[phasesToRender.length - 1])
          : idx === _visibleSources.length - 1;
        var borderBottom = isLast ? 'none' : '1px solid var(--cvz-border,#30363d)';
        var citePct = Math.round(src.citation_rate || 0);
        var tr = document.createElement('tr');

        // Domain
        var tdDomain = document.createElement('td');
        tdDomain.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';';
        tdDomain.innerHTML = '<img style="width:14px;height:14px;border-radius:2px;vertical-align:middle;margin-right:5px;object-fit:contain;" src="https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(src.domain) + '" alt=""><span style="font-weight:600;">' + escapeHtml(src.domain) + '</span>';
        tr.appendChild(tdDomain);

        // Phase
        var tdPhase = document.createElement('td');
        tdPhase.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-size:11px;white-space:nowrap;color:var(--cvz-text-muted,#8b98a5);';
        tdPhase.innerHTML = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + phaseColor + ';margin-right:5px;vertical-align:middle;flex-shrink:0;"></span>' + escapeHtml(PHASE_LABELS[phase] || phase);
        tr.appendChild(tdPhase);

        // Zitierrate
        var tdCite = document.createElement('td');
        tdCite.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-weight:700;';
        tdCite.textContent = citePct + '%';
        tr.appendChild(tdCite);

        // Content-Typ
        var tdType = document.createElement('td');
        tdType.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-size:12px;color:var(--cvz-text-muted,#8b98a5);';
        tdType.textContent = src.content_type ? (CONTENT_TYPE_LABELS[src.content_type] || src.content_type) : '';
        tr.appendChild(tdType);

        // Zusammenfassung
        var tdSum = document.createElement('td');
        tdSum.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-size:12px;line-height:1.4;';
        tdSum.textContent = src.summary || '';
        tr.appendChild(tdSum);

        // Differenzierung
        var tdDiff = document.createElement('td');
        tdDiff.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-size:12px;line-height:1.4;color:var(--cvz-text-muted,#8b98a5);';
        tdDiff.textContent = src.differentiation_suggestion || '';
        tr.appendChild(tdDiff);

        tbody.appendChild(tr);
      });
    });
    table.appendChild(tbody);
    var _scrollWrap = document.createElement('div');
    _scrollWrap.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;';
    _scrollWrap.appendChild(table);
    section.appendChild(_scrollWrap);
  }

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

  function aggregateCompetitorDomains(weeks) {
    if (!weeks || weeks.length === 0) return [];
    var byDomain = {};
    weeks.forEach(function (week) {
      (week.domains || []).forEach(function (d) {
        if (!byDomain[d.domain]) {
          byDomain[d.domain] = { domain: d.domain, citations: 0, by_model: {}, prompts: {}, url: d.url };
        }
        var entry = byDomain[d.domain];
        entry.citations += d.citations;
        // GEÄNDERT (15.09.2026): url wird jetzt mit durchgereicht (kam vom
        // Backend schon immer mit, siehe main.py: _get_competitor_
        // citation_trend, wurde hier aber bisher verworfen) — Kundenwunsch:
        // "genaue URLs, die zitiert werden, sichtbar machen". Neuere Woche
        // gewinnt, falls sich die zitierte URL über die Zeit geändert hat.
        if (d.url) entry.url = d.url;
        Object.keys(d.by_model || {}).forEach(function (model) {
          entry.by_model[model] = (entry.by_model[model] || 0) + d.by_model[model];
        });
        (d.prompts || []).forEach(function (p) { entry.prompts[p] = true; });
      });
    });
    return Object.keys(byDomain).map(function (domain) {
      var e = byDomain[domain];
      return { domain: e.domain, citations: e.citations, by_model: e.by_model, prompts: Object.keys(e.prompts), url: e.url };
    }).sort(function (a, b) { return b.citations - a.citations; });
  }

  function normalizeDomainForMatch(domain) {
    return (domain || '').toLowerCase().replace(/^www\./, '');
  }

  function renderCompetitorManageSection(detail, topicId) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var activeDomains = detail.competitor_domains || [];
    var isOpen = !!state.competitorManageOpen[topicId];

    var competitorToggleRow = document.createElement('div');
    competitorToggleRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'cvz-create-toggle-btn';
    toggleBtn.setAttribute('data-cvz-competitor-manage-toggle', topicId);
    toggleBtn.textContent = (isOpen ? '\u2212 ' : '+ ') + 'Wettbewerber bearbeiten (' + activeDomains.length + ' aktiv)';
    competitorToggleRow.appendChild(toggleBtn);
    competitorToggleRow.appendChild(makeTip(
      'Wettbewerber-Domains, die du hier eintr\u00e4gst, werden f\u00fcr den hochpriorit\u00e4ren Alert \u201eWettbewerber \u00fcberholt euch\u201c genutzt und in der Journey Map als Share of Voice analysiert. Die Grafik \u201eSichtbarkeit im Wettbewerbsvergleich\u201c zeigt dagegen ALLE Domains, die KI-Systeme tats\u00e4chlich zitiert haben \u2013 auch bisher nicht best\u00e4tigte. Bereits zitierte Domains werden als Vorschl\u00e4ge angezeigt.'
    ));
    section.appendChild(competitorToggleRow);

    if (!isOpen) return section;

    if (state.isLoadingCompetitorSuggestions) {
      var loading = document.createElement('p');
      loading.className = 'cvz-card-placeholder-text';
      loading.textContent = 'L\u00e4dt Vorschl\u00e4ge \u2026';
      section.appendChild(loading);
    }

    var draft = state.competitorDraftDomains[topicId] || activeDomains.slice();
    var suggestions = state.competitorSuggestionsCache[topicId] || [];

    var citationByDomain = {};
    var domainSet = {};
    activeDomains.forEach(function (d) { domainSet[d] = true; });
    suggestions.forEach(function (s) {
      if (s.domain) {
        domainSet[s.domain] = true;
        citationByDomain[s.domain] = s.citation_count;
      }
    });
    var allDomains = Object.keys(domainSet).sort(function (a, b) {
      return (citationByDomain[b] || 0) - (citationByDomain[a] || 0);
    });

    if (allDomains.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Vorschl\u00e4ge und keine aktiven Wettbewerber. F\u00fcge unten eine eigene Domain hinzu.';
      section.appendChild(empty);
    } else {
      var chipList = document.createElement('div');
      chipList.className = 'cvz-persona-filter';
      allDomains.forEach(function (domain) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'cvz-persona-chip' + (draft.indexOf(domain) !== -1 ? ' cvz-persona-chip-active' : '');
        chip.setAttribute('data-cvz-competitor-chip', domain);
        chip.setAttribute('data-cvz-competitor-topic', topicId);
        var hint = citationByDomain[domain] ? ' (' + citationByDomain[domain] + '\u00d7 zitiert)' : '';
        chip.textContent = domain + hint;
        chipList.appendChild(chip);
      });
      section.appendChild(chipList);
    }

    var manualRow = document.createElement('div');
    manualRow.className = 'cvz-changelog-form';
    manualRow.innerHTML =
      '<input type="text" id="cvz-competitor-manual-input" class="cvz-changelog-input" maxlength="100" placeholder="eigene-domain.de">' +
      '<button type="button" class="cvz-create-toggle-btn" data-cvz-competitor-manual-add="' + topicId + '">Hinzuf\u00fcgen</button>';
    section.appendChild(manualRow);
    var compInputHint = document.createElement('p');
    compInputHint.style.cssText = 'margin:2px 0 0;font-size:11px;color:var(--cvz-text-muted,#8b98a5);';
    compInputHint.textContent = 'max. 100 Zeichen';
    section.appendChild(compInputHint);

    // NEU (15.09.2026): Kundenwunsch (siehe Chat-Verlauf 15.09.2026) —
    // klarstellen, ab wann für einen Wettbewerber tatsächlich Daten
    // vorliegen. Zitationsdaten existieren rückwirkend NUR, wenn die
    // Domain in bisherigen Läufen bereits (unabhängig vom Wettbewerber-
    // Status) zitiert wurde — eine neu hinzugefügte, bisher nie zitierte
    // Domain taucht im Wettbewerber-Tab erst ab dem nächsten Datenlauf
    // auf, in dem sie tatsächlich vorkommt. Direkt über dem
    // Speichern-Button, damit die Erwartung VOR dem Klick gesetzt wird.
    var dataWindowNote = document.createElement('p');
    dataWindowNote.className = 'cvz-card-placeholder-text';
    dataWindowNote.style.marginTop = '8px';
    dataWindowNote.textContent =
      'Hinweis: Eine neu hinzugef\u00fcgte Domain zeigt hier nur Daten, wenn sie in bisherigen L\u00e4ufen bereits ' +
      'zitiert wurde. Wurde sie bisher nie zitiert, erscheint sie erst ab dem n\u00e4chsten Datenlauf, in dem das ' +
      'tats\u00e4chlich passiert \u2014 nicht sofort nach dem Speichern.';
    section.appendChild(dataWindowNote);

    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'cvz-changelog-submit-btn';
    submitBtn.setAttribute('data-cvz-competitor-submit', topicId);
    submitBtn.disabled = state.isSubmittingCompetitors;
    submitBtn.textContent = state.isSubmittingCompetitors
      ? 'Wird gespeichert \u2026'
      : 'Speichern (' + draft.length + ' ausgew\u00e4hlt)';
    section.appendChild(submitBtn);

    return section;
  }

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

    // GEÄNDERT (18.09.2026): source_profiles cachen jetzt pro URL statt pro
    // Domain (Backend: source_analysis.py) — eine Domain kann also mehrere
    // Content-Typen haben (Blog UND Produktseite). profileByUrl matcht
    // deshalb primär über comp.url (die tatsächlich zitierte URL), nur wenn
    // die exakt nicht analysiert ist, Fallback auf irgendein Profil dieser
    // Domain (profileByDomainFallback), besser als gar nichts zu zeigen.
    var profileByUrl = {};
    var profileByDomainFallback = {};
    (sourceProfiles || []).forEach(function (p) {
      if (p.analyzed_url) profileByUrl[p.analyzed_url] = p;
      var nd = normalizeDomainForMatch(p.domain);
      if (!profileByDomainFallback[nd]) profileByDomainFallback[nd] = p;
    });
    var insightByDomain = {};
    (competitorInsights || []).forEach(function (i) {
      insightByDomain[normalizeDomainForMatch(i.domain)] = i;
    });

    var grid = document.createElement('div');
    grid.className = 'cvz-opportunity-grid';
    allDomains.slice(0, 8).forEach(function (comp) {
      var normDomain = normalizeDomainForMatch(comp.domain);
      var lookupUrl = comp.url || ('https://' + comp.domain);
      var profile = profileByUrl[lookupUrl] || profileByDomainFallback[normDomain];
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
        // NEU (15.09.2026): tatsächlich zitierte URL, nicht nur die
        // Domain — Kundenwunsch: "damit man sich gleich informieren kann,
        // wie die zitierten Inhalte aufgebaut sind". Nur die zuletzt
        // gesehene URL (siehe aggregateCompetitorDomains), eine Domain
        // kann über mehrere Wochen mit unterschiedlichen URLs zitiert
        // worden sein, hier bewusst keine vollständige Liste.
        (comp.url
          ? '<p class="cvz-opportunity-topic cvz-competitor-url-row"><a class="cvz-competitor-url" href="' + escapeHtml(comp.url) + '" target="_blank" rel="noopener" title="' + escapeHtml(comp.url) + '">' + escapeHtml(comp.url.replace(/^https?:\/\//, '')) + '</a></p>'
          : '') +
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
          // GEÄNDERT (15.09.2026): vorher nur eine Zahl mit den vollen
          // Prompt-Texten versteckt im title-Tooltip — der Kunde will
          // aber direkt sehen, BEI WELCHEN Prompts ein Wettbewerber
          // genannt wird, nicht nur wie oft (siehe Chat-Verlauf
          // 15.09.2026).
          ? '<p class="cvz-opportunity-topic"><strong>Genannt bei:</strong></p>' +
            '<ul class="cvz-competitor-prompt-list">' +
              promptList.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') +
            '</ul>'
          : '');
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  // NEU (16.09.2026): Kundenwunsch (siehe Chat-Verlauf 16.09.2026) —
  // Plattform-Übersicht über ALLE zitierten Quellen (nicht nur
  // bestätigte Wettbewerber), gruppiert nach Content-Typ, damit User
  // daraus ihre eigene On-/Off-Page-Strategie ableiten können (z.B.
  // "Reddit/Foren werden hier oft zitiert -> in Foren präsent werden").
  function renderCitedPlatformsSection(platforms) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Zitierte Plattform-Typen';
    section.appendChild(heading);

    var intro = document.createElement('p');
    intro.className = 'cvz-card-placeholder-text';
    intro.style.marginBottom = '12px';
    intro.textContent =
      'Alle in KI-Antworten zitierten Quellen zu diesem Thema, gruppiert nach Art der Plattform \u2014 ' +
      'unabh\u00e4ngig davon, ob es sich um einen best\u00e4tigten Wettbewerber handelt. Hilft einzusch\u00e4tzen, ' +
      'wo eine eigene Pr\u00e4senz (z.B. in Foren, auf Bewertungsplattformen, per Video) lohnt.';
    section.appendChild(intro);

    if (!platforms || platforms.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine zitierten Quellen f\u00fcr dieses Thema.';
      section.appendChild(empty);
      return section;
    }

    var grid = document.createElement('div');
    grid.className = 'cvz-opportunity-grid';
    platforms.forEach(function (group) {
      var typeLabel = group.content_type
        ? (CONTENT_TYPE_LABELS[group.content_type] || group.content_type)
        : 'Noch nicht analysiert';
      var totalCitations = group.domains.reduce(function (sum, d) { return sum + d.citations; }, 0);

      var card = document.createElement('div');
      card.className = 'cvz-card cvz-idea-card';
      var domainsHtml = group.domains.map(function (d) {
        var promptTitle = d.prompts && d.prompts.length ? ' title="' + escapeHtml(d.prompts.join(' | ')) + '"' : '';
        return '<li' + promptTitle + '>' +
          '<img class="cvz-inline-favicon" src="https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(d.domain) + '" alt="">' +
          escapeHtml(d.domain) + ' \u00b7 ' + d.citations + '\u00d7' +
        '</li>';
      }).join('');
      card.innerHTML =
        '<p class="cvz-opportunity-type">' + escapeHtml(typeLabel) + ' \u00b7 ' + totalCitations + ' Zitationen</p>' +
        '<ul class="cvz-serp-results-list">' + domainsHtml + '</ul>';
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  // GEAENDERT (17.09.2026): Phase-Tabs + manuelle Phase-Overrides per localStorage
  function renderContentGapsSection(gaps, topicId) {
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

    // Phase-Filter-Chips
    var activeFilter = state.gapPhaseFilter;
    var filterRow = document.createElement('div');
    filterRow.className = 'cvz-persona-filter';
    filterRow.style.marginBottom = '12px';
    var allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'cvz-persona-chip' + (activeFilter === null ? ' cvz-persona-chip-active' : '');
    allChip.setAttribute('data-cvz-gap-phase-filter', '');
    allChip.textContent = 'Alle';
    filterRow.appendChild(allChip);
    PHASE_ORDER.forEach(function (phase) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cvz-persona-chip' + (activeFilter === phase ? ' cvz-persona-chip-active' : '');
      chip.style.borderLeftColor = PHASE_COLORS[phase] || '';
      chip.setAttribute('data-cvz-gap-phase-filter', phase);
      chip.textContent = PHASE_LABELS[phase] || phase;
      filterRow.appendChild(chip);
    });
    section.appendChild(filterRow);

    // Gaps in Phasen gruppieren (localStorage-Override > Heuristik)
    var grouped = {};
    PHASE_ORDER.forEach(function (p) { grouped[p] = []; });
    grouped._unknown = [];
    gaps.forEach(function (gap) {
      var phase = _getGapPhase(topicId, gap.gap_description) || _detectGapPhase(gap.gap_description);
      var bucket = (phase && grouped[phase]) ? phase : '_unknown';
      grouped[bucket].push({ gap: gap, phase: phase });
    });

    // Tabelle aufbauen
    var table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';

    var thead = document.createElement('thead');
    var hrow = document.createElement('tr');
    var COLS = ['Priorität', 'Phase', 'Content-Lücke', 'Beleg', 'Empfehlung'];
    var COL_WIDTHS = ['90px', '140px', '', '', '180px'];
    COLS.forEach(function (label, i) {
      var th = document.createElement('th');
      th.textContent = label;
      th.style.cssText = 'text-align:left;padding:7px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--cvz-text-muted,#8b98a5);border-bottom:1px solid var(--cvz-border,#30363d);white-space:nowrap;' + (COL_WIDTHS[i] ? 'width:' + COL_WIDTHS[i] + ';' : '');
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var PRIORITY_COLORS = { hoch: '#de5b50', mittel: '#c87a38', niedrig: '#5aacd2' };

    function _buildGapRow(item, isLast) {
      var gap = item.gap;
      var currentPhase = item.phase || '';
      var phaseColor = PHASE_COLORS[currentPhase] || 'var(--cvz-border,#30363d)';
      var prioColor = PRIORITY_COLORS[gap.priority] || 'var(--cvz-text-muted,#8b98a5)';
      var tr = document.createElement('tr');
      var borderBottom = isLast ? 'none' : '1px solid var(--cvz-border,#30363d)';

      // Prioritaet
      var tdPrio = document.createElement('td');
      tdPrio.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';';
      tdPrio.innerHTML = gap.priority ? '<span style="font-size:11px;font-weight:700;color:' + prioColor + ';">' + escapeHtml(GAP_PRIORITY_LABELS[gap.priority] || gap.priority) + '</span>' : '<span style="color:var(--cvz-text-muted,#8b98a5);font-size:11px;">–</span>';
      tr.appendChild(tdPrio);

      // Phase (editable)
      var tdPhase = document.createElement('td');
      tdPhase.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';';
      var sel = document.createElement('select');
      sel.style.cssText = 'font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid ' + phaseColor + ';background:var(--cvz-card,#161b22);color:var(--cvz-text,#e6edf3);cursor:pointer;width:100%;';
      var phaseOpts = [{ value: '', label: '– keine Phase –' }];
      PHASE_ORDER.forEach(function (p) { phaseOpts.push({ value: p, label: PHASE_LABELS[p] || p }); });
      phaseOpts.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (currentPhase === opt.value) o.selected = true;
        sel.appendChild(o);
      });
      (function (desc) {
        sel.onchange = function () {
          _setGapPhase(topicId, desc, sel.value || null);
          render();
        };
      })(gap.gap_description);
      tdPhase.appendChild(sel);
      tr.appendChild(tdPhase);

      // Content-Luecke
      var tdDesc = document.createElement('td');
      tdDesc.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';line-height:1.5;color:var(--cvz-text,#e6edf3);';
      tdDesc.textContent = gap.gap_description || '';
      tr.appendChild(tdDesc);

      // Beleg
      var tdEvid = document.createElement('td');
      tdEvid.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-size:12px;color:var(--cvz-text-muted,#8b98a5);line-height:1.4;';
      tdEvid.textContent = gap.evidence || '';
      tr.appendChild(tdEvid);

      // Empfehlung
      var tdRec = document.createElement('td');
      tdRec.style.cssText = 'padding:10px 10px;vertical-align:top;border-bottom:' + borderBottom + ';font-size:12px;color:var(--cvz-text-muted,#8b98a5);line-height:1.4;';
      tdRec.textContent = gap.recommended_content_type || '';
      tr.appendChild(tdRec);

      return tr;
    }

    var allRows = [];
    var phasesToRender = activeFilter ? [activeFilter] : PHASE_ORDER.concat(['_unknown']);
    phasesToRender.forEach(function (phase) {
      (grouped[phase] || []).forEach(function (item) { allRows.push(item); });
    });

    if (!allRows.length) {
      var noMatch = document.createElement('p');
      noMatch.className = 'cvz-card-placeholder-text';
      noMatch.textContent = 'Keine Content-Lücken in dieser Phase.';
      section.appendChild(noMatch);
      return section;
    }

    allRows.forEach(function (item, idx) {
      tbody.appendChild(_buildGapRow(item, idx === allRows.length - 1));
    });
    table.appendChild(tbody);
    var _scrollWrap = document.createElement('div');
    _scrollWrap.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;';
    _scrollWrap.appendChild(table);
    section.appendChild(_scrollWrap);

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
      // GEÄNDERT (15.09.2026): zeigt jetzt, WELCHE KI das Angebot gemacht
      // hat (idea.provider, siehe content_ideas.py — fehlte bisher im
      // main.py-Select, "Welche KI?" ließ sich vorher gar nicht
      // beantworten, siehe Chat-Verlauf 15.09.2026).
      var providerLabel = idea.provider ? (MODEL_LABELS[idea.provider] || idea.provider) : null;
      card.innerHTML =
        (idea.phase ? '<p class="cvz-opportunity-type">' + escapeHtml(PHASE_LABELS[idea.phase] || idea.phase) + '</p>' : '') +
        '<p class="cvz-opportunity-description">' +
          (providerLabel ? '<strong>' + escapeHtml(providerLabel) + ':</strong> ' : '') +
          escapeHtml(idea.description || '') +
        '</p>' +
        (idea.topic_name ? '<p class="cvz-opportunity-topic">' + escapeHtml(idea.topic_name) + '</p>' : '');
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

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
    return section;
  }

  // GEÄNDERT (15.09.2026): gibt jetzt ZWEI getrennte Sections als Array
  // zurück (vorher eine gemeinsame Section mit beiden Karten gestapelt) —
  // Kundenwunsch: alle Übersicht-Grafiken sollen auf Desktop nebeneinander
  // und kleiner dargestellt werden (siehe cvz-charts-grid am Aufrufer).
  // Damit jede Grafik ein gleich großes Grid-Element ist, statt einer
  // doppelt so hohen Zelle mit zwei gestapelten Karten.
  function renderMonthlyOverviewChart(months, isLoading) {
    var citationSection = document.createElement('div');
    citationSection.className = 'cvz-section';
    var citationHeading = document.createElement('p');
    citationHeading.className = 'cvz-section-label';
    citationHeading.textContent = 'Prompt-Zitierungen im Zeitverlauf';
    citationSection.appendChild(citationHeading);

    var gscSection = document.createElement('div');
    gscSection.className = 'cvz-section';
    var gscHeading = document.createElement('p');
    gscHeading.className = 'cvz-section-label';
    gscHeading.textContent = 'GSC-Performance im Zeitverlauf';
    gscSection.appendChild(gscHeading);

    if (isLoading) {
      var loading1 = document.createElement('p');
      loading1.className = 'cvz-card-placeholder-text';
      loading1.textContent = 'Lädt...';
      citationSection.appendChild(loading1);
      var loading2 = document.createElement('p');
      loading2.className = 'cvz-card-placeholder-text';
      loading2.textContent = 'Lädt...';
      gscSection.appendChild(loading2);
      return [citationSection, gscSection];
    }

    if (!months || months.length < 2) {
      var emptyNoticeText = 'Noch kein Verlauf verf\u00fcgbar, braucht mindestens zwei Kalendermonate mit ausgewerteten L\u00e4ufen.';

      var emptyCitationCard = document.createElement('div');
      emptyCitationCard.className = 'cvz-card';
      emptyCitationCard.innerHTML = buildEmptyChartSvg() + '<p class="cvz-chart-caption">' + emptyNoticeText + '</p>';
      citationSection.appendChild(emptyCitationCard);

      var emptyGscCard = document.createElement('div');
      emptyGscCard.className = 'cvz-card';
      emptyGscCard.innerHTML = buildEmptyChartSvg() + '<p class="cvz-chart-caption">' + emptyNoticeText + '</p>';
      gscSection.appendChild(emptyGscCard);

      return [citationSection, gscSection];
    }

    var xLabels = months.map(function (m) { return m.month; });

    var citationCard = document.createElement('div');
    citationCard.className = 'cvz-card';
    citationCard.innerHTML =
      buildLineChartSvg([
        { label: 'Zitiert', values: months.map(function (m) { return m.own_domain_cited; }), color: 'var(--cvz-teal)' },
        { label: 'Ausgewertete L\u00e4ufe', values: months.map(function (m) { return m.total_runs; }), color: 'var(--cvz-border)' },
      ], xLabels, {}) +
      '<p class="cvz-chart-caption">Wie viele ausgewertete ChatGPT/Gemini-L\u00e4ufe pro Kalendermonat die eigene Domain zitiert haben, gegen die Gesamtzahl ausgewerteter L\u00e4ufe.</p>';
    citationSection.appendChild(citationCard);

    var newKeywordsLine = document.createElement('p');
    newKeywordsLine.className = 'cvz-chart-caption';
    newKeywordsLine.textContent = 'Neue Keywords je Monat: ' +
      months.map(function (m) { return m.month + ': ' + m.new_keywords; }).join(' \u00b7 ');
    citationSection.appendChild(newKeywordsLine);

    var gscCard = document.createElement('div');
    gscCard.className = 'cvz-card';
    gscCard.innerHTML =
      buildLineChartSvg([
        { label: 'Klicks', values: months.map(function (m) { return m.gsc_clicks; }), color: 'var(--cvz-teal)' },
        { label: 'Impressionen', values: months.map(function (m) { return m.gsc_impressions; }), color: 'var(--cvz-amber)' },
      ], xLabels, {}) +
      '<p class="cvz-chart-caption">Google-Search-Console-Klicks/Impressionen pro Kalendermonat, summiert \u00fcber alle GSC-Near-Miss-Keywords dieses Themas.</p>';
    gscSection.appendChild(gscCard);

    return [citationSection, gscSection];

    return section;
  }

  function renderChangelogLinkPicker(kind, items, getLabel) {
    var wrap = document.createElement('div');
    wrap.className = 'cvz-changelog-link-picker';

    var isOpen = !!state.changelogLinkSectionOpen[kind];
    var selectedIds = state.changelogDraftLinkedIds[kind];
    var kindLabel = kind === 'keywords' ? 'Keywords' : 'Prompts';

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'cvz-create-toggle-btn';
    toggleBtn.setAttribute('data-cvz-changelog-link-toggle', kind);
    var countSuffix = selectedIds.length ? ' (' + selectedIds.length + ')' : '';
    toggleBtn.textContent = (isOpen ? '\u2212 ' : '+ ') + 'Mit ' + kindLabel + ' verkn\u00fcpfen (optional)' + countSuffix;
    wrap.appendChild(toggleBtn);

    if (!isOpen) return wrap;

    if (!items || items.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Keine ' + kindLabel + ' in diesem Thema vorhanden.';
      wrap.appendChild(empty);
      return wrap;
    }

    var chipList = document.createElement('div');
    chipList.className = 'cvz-persona-filter cvz-changelog-link-chip-list';
    items.forEach(function (item) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cvz-persona-chip' + (selectedIds.indexOf(item.id) !== -1 ? ' cvz-persona-chip-active' : '');
      chip.setAttribute('data-cvz-changelog-link-chip', item.id);
      chip.setAttribute('data-cvz-changelog-link-kind', kind);
      chip.textContent = getLabel(item);
      chipList.appendChild(chip);
    });
    wrap.appendChild(chipList);
    return wrap;
  }

  function renderChangelogSection(entries, topicId, searchQueries, prompts) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = '\u00c4nderungsprotokoll';
    section.appendChild(heading);

    var CHANGELOG_MAX_CHARS = 1000;
    var form = document.createElement('div');
    form.className = 'cvz-changelog-form';
    form.innerHTML =
      '<textarea id="cvz-changelog-input" class="cvz-changelog-input" rows="2" ' +
        'maxlength="' + CHANGELOG_MAX_CHARS + '" ' +
        'placeholder="Was habt ihr ge\u00e4ndert? (z.B. Preistabelle als Vergleichstabelle umgebaut)">' +
        escapeHtml(state.changelogDraft || '') +
      '</textarea>' +
      '<button type="button" class="cvz-changelog-submit-btn" data-cvz-changelog-submit ' +
        (state.isSubmittingChangelog ? 'disabled' : '') + '>' +
        (state.isSubmittingChangelog ? 'Wird gespeichert \u2026' : 'Eintragen') +
      '</button>';
    section.appendChild(form);
    var changelogCharHint = document.createElement('p');
    changelogCharHint.id = 'cvz-changelog-char-hint';
    changelogCharHint.style.cssText = 'margin:4px 0 8px;font-size:11px;color:var(--cvz-text-muted,#8b98a5);';
    changelogCharHint.textContent = 'max. ' + CHANGELOG_MAX_CHARS + ' Zeichen';
    section.appendChild(changelogCharHint);
    var textareaEl = form.querySelector('#cvz-changelog-input');
    textareaEl.addEventListener('input', function () {
      state.changelogDraft = textareaEl.value;
      var remaining = CHANGELOG_MAX_CHARS - textareaEl.value.length;
      changelogCharHint.textContent = remaining < 100
        ? remaining + ' Zeichen \u00fcbrig'
        : 'max. ' + CHANGELOG_MAX_CHARS + ' Zeichen';
      changelogCharHint.style.color = remaining < 30
        ? 'var(--cvz-red,#de5b50)'
        : 'var(--cvz-text-muted,#8b98a5)';
    });

    var locationLabel = document.createElement('p');
    locationLabel.className = 'cvz-changelog-guided-label';
    locationLabel.textContent = 'Wo? (optional)';
    section.appendChild(locationLabel);

    var locationChips = document.createElement('div');
    locationChips.className = 'cvz-persona-filter';
    CHANGELOG_LOCATION_ORDER.forEach(function (loc) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cvz-persona-chip' + (state.changelogLocationDraft === loc ? ' cvz-persona-chip-active' : '');
      chip.setAttribute('data-cvz-changelog-location', loc);
      chip.textContent = CHANGELOG_LOCATION_LABELS[loc];
      locationChips.appendChild(chip);
    });
    section.appendChild(locationChips);

    if (state.changelogLocationDraft === 'sonstiges') {
      var locationCustomInput = document.createElement('input');
      locationCustomInput.type = 'text';
      locationCustomInput.id = 'cvz-changelog-location-custom';
      locationCustomInput.className = 'cvz-changelog-custom-input';
      locationCustomInput.placeholder = 'Wo genau? (z.B. FAQ-Seite)';
      locationCustomInput.value = state.changelogLocationCustomText || '';
      locationCustomInput.addEventListener('input', function () {
        state.changelogLocationCustomText = locationCustomInput.value;
      });
      section.appendChild(locationCustomInput);
    }

    var effectLabel = document.createElement('p');
    effectLabel.className = 'cvz-changelog-guided-label';
    effectLabel.textContent = 'Erwarteter Effekt (optional)';
    section.appendChild(effectLabel);

    var effectChips = document.createElement('div');
    effectChips.className = 'cvz-persona-filter';
    CHANGELOG_EFFECT_ORDER.forEach(function (effect) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cvz-persona-chip' + (state.changelogEffectDraft === effect ? ' cvz-persona-chip-active' : '');
      chip.setAttribute('data-cvz-changelog-effect', effect);
      chip.textContent = CHANGELOG_EFFECT_LABELS[effect];
      effectChips.appendChild(chip);
    });
    section.appendChild(effectChips);

    if (state.changelogEffectDraft === 'sonstiges') {
      var effectCustomInput = document.createElement('input');
      effectCustomInput.type = 'text';
      effectCustomInput.id = 'cvz-changelog-effect-custom';
      effectCustomInput.className = 'cvz-changelog-custom-input';
      effectCustomInput.placeholder = 'Welcher Effekt genau?';
      effectCustomInput.value = state.changelogEffectCustomText || '';
      effectCustomInput.addEventListener('input', function () {
        state.changelogEffectCustomText = effectCustomInput.value;
      });
      section.appendChild(effectCustomInput);
    }

    section.appendChild(renderChangelogLinkPicker('keywords', searchQueries, function (q) { return q.keyword; }));
    section.appendChild(renderChangelogLinkPicker('prompts', prompts, function (p) {
      return p.prompt_text.length > 60 ? p.prompt_text.slice(0, 57) + '\u2026' : p.prompt_text;
    }));

    if (!entries || entries.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Eintr\u00e4ge.';
      section.appendChild(empty);
    } else {
      var visibleCount = state.changelogVisibleCount[topicId] || 10;
      var visibleEntries = entries.slice(0, visibleCount);

      var keywordTextById = {};
      (searchQueries || []).forEach(function (q) { keywordTextById[q.id] = q.keyword; });
      var promptTextById = {};
      (prompts || []).forEach(function (p) { promptTextById[p.id] = p.prompt_text; });

      var tableWrap = document.createElement('div');
      tableWrap.className = 'cvz-changelog-table-wrap';
      var rowsHtml = visibleEntries.map(function (entry) {
        // GEÄNDERT (15.09.2026): verknüpfte Keywords bekommen jetzt einen
        // Pfeil, wenn main.py ein Auf/Ab-Signal berechnet hat (siehe
        // entry.keyword_deltas, main.py: _compute_changelog_keyword_deltas).
        // Bewusst pro Keyword einzeln, ein Eintrag kann mehrere verknüpfte
        // Keywords mit unterschiedlicher Richtung haben.
        var keywordDeltas = entry.keyword_deltas || {};
        var linkedKeywordItems = (entry.linked_search_query_ids || []).map(function (id) {
          var text = keywordTextById[id];
          if (!text) return null;
          var direction = keywordDeltas[id];
          var arrowHtml = '';
          if (direction === 'up') {
            arrowHtml = ' <span class="cvz-delta-up" title="Position seit dieser \u00c4nderung verbessert">\u25b2</span>';
          } else if (direction === 'down') {
            arrowHtml = ' <span class="cvz-delta-down" title="Position seit dieser \u00c4nderung verschlechtert">\u25bc</span>';
          }
          return escapeHtml(text) + arrowHtml;
        }).filter(Boolean);
        var linkedPromptItems = (entry.linked_prompt_ids || []).map(function (id) {
          var text = promptTextById[id];
          return text ? escapeHtml(text) : null;
        }).filter(Boolean);
        var linkedHtml = linkedKeywordItems.concat(linkedPromptItems).join(', ');
        return (
          '<tr>' +
            '<td class="cvz-changelog-cell-text">' + escapeHtml(entry.entry_text) + '</td>' +
            '<td class="cvz-changelog-cell-linked">' + (linkedHtml || '\u2013') + '</td>' +
            '<td class="cvz-changelog-cell-meta">' + formatRelativeTime(entry.created_at) + '</td>' +
            '<td class="cvz-changelog-cell-meta">' + (entry.author_name ? escapeHtml(entry.author_name) : '\u2013') + '</td>' +
            '<td class="cvz-changelog-cell-action">' +
              '<button type="button" class="cvz-changelog-delete-btn" data-cvz-changelog-delete="' + escapeHtml(entry.id) + '" aria-label="L\u00f6schen">\u00d7</button>' +
            '</td>' +
          '</tr>'
        );
      }).join('');
      tableWrap.innerHTML =
        '<table class="cvz-changelog-table">' +
          '<thead><tr>' +
            '<th>\u00c4nderung</th><th>Verkn\u00fcpft mit</th><th>Wann</th><th>Von</th><th></th>' +
          '</tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>';
      section.appendChild(tableWrap);

      if (entries.length > visibleCount) {
        var moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'cvz-changelog-more-btn';
        moreBtn.setAttribute('data-cvz-changelog-more', topicId);
        moreBtn.textContent = 'Weitere anzeigen (noch ' + (entries.length - visibleCount) + ')';
        section.appendChild(moreBtn);
      }
    }

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
          var deletedTableWrap = document.createElement('div');
          deletedTableWrap.className = 'cvz-changelog-table-wrap';
          var deletedRowsHtml = deletedEntries.map(function (entry) {
            return (
              '<tr class="cvz-changelog-row-deleted">' +
                '<td class="cvz-changelog-cell-text">' + escapeHtml(entry.entry_text) + '</td>' +
                '<td class="cvz-changelog-cell-meta">' +
                  'Erstellt ' + formatRelativeTime(entry.created_at) +
                  (entry.author_name ? ' von ' + escapeHtml(entry.author_name) : '') +
                '</td>' +
                '<td class="cvz-changelog-cell-meta">' +
                  'Gel\u00f6scht ' + formatRelativeTime(entry.deleted_at) +
                  (entry.deleted_by_name ? ' von ' + escapeHtml(entry.deleted_by_name) : '') +
                '</td>' +
                '<td class="cvz-changelog-cell-action">' +
                  '<button type="button" class="cvz-changelog-restore-btn" data-cvz-changelog-restore="' + escapeHtml(entry.id) + '">Wiederherstellen</button>' +
                '</td>' +
              '</tr>'
            );
          }).join('');
          deletedTableWrap.innerHTML =
            '<table class="cvz-changelog-table">' +
              '<thead><tr><th>\u00c4nderung</th><th>Erstellt</th><th>Gel\u00f6scht</th><th></th></tr></thead>' +
              '<tbody>' + deletedRowsHtml + '</tbody>' +
            '</table>';
          section.appendChild(deletedTableWrap);
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
    if (!insight) return null;

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

    // NEU (16.09.2026): manuelles Keyword-Formular, analog zu renderManualPromptForm
    if (state.activeTopicId) {
      section.appendChild(renderManualKeywordForm(keywords, state.activeTopicId));
    }

    if (!keywords || keywords.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Keyword-Daten verfügbar.';
      section.appendChild(empty);
      return section;
    }

    // Helper: render one keyword row + optional expansion
    function _renderKwRow(kw, list) {
      var rowId = kw.id || (kw.keyword + '|' + kw.source);
      var linkedCount = (changelogEntries || []).filter(function (entry) {
        return (entry.linked_search_query_ids || []).indexOf(kw.id) !== -1;
      }).length;
      var hasDetail = kw.organic_rank != null || kw.gsc_impressions != null || kw.gsc_position != null || kw.first_seen_at || linkedCount > 0 || (kw.top_serp_results && kw.top_serp_results.length > 0) || !!kw.messymiddle_phase;
      var canExpand = !!(enableExpansion && hasDetail);

      var row = document.createElement('div');
      row.className = 'cvz-prompt-row' + (canExpand ? ' cvz-prompt-row-clickable' : '');
      if (canExpand) {
        row.setAttribute('data-cvz-keyword-toggle', rowId);
        row.setAttribute('data-cvz-keyword-text', kw.keyword);
      }
      row.innerHTML =
        '<span class="cvz-prompt-text">' + escapeHtml(kw.keyword) +
          (linkedCount > 0
            ? ' <span class="cvz-changelog-linked-badge" title="' + linkedCount + ' verknüpfte Änderung(en)">✎</span>'
            : '') +
        '</span>' +
        '<span class="cvz-prompt-citation-count">' +
          (kw.search_volume == null ? '–' : escapeHtml(kw.search_volume) + '/Monat') +
        '</span>' +
        // NEU (20.09.2026): Einschätzung (rankt bereits/knapp an Seite 1/
        // Nachfrage unsichtbar/reine Idee), einheitlich aus dem Backend
        // (keyword_status.py) statt einer eigenen Frontend-Schwelle.
        (kw.keyword_status_label
          ? '<span style="display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;' +
            'letter-spacing:.04em;padding:3px 8px;border-radius:9999px;white-space:nowrap;' +
            'color:' + (KEYWORD_STATUS_COLORS[kw.keyword_status] || '#8b98a5') + ';' +
            'background:' + (KEYWORD_STATUS_COLORS[kw.keyword_status] || '#8b98a5') + '1a;">' +
            escapeHtml(kw.keyword_status_label) + '</span>'
          : '') +
        '<span class="cvz-prompt-source">' + escapeHtml(KEYWORD_SOURCE_LABELS[kw.source] || kw.source) + '</span>' +
        (kw.id
          ? '<button type="button" class="cvz-prompt-delete-btn" data-cvz-keyword-deactivate="' + kw.id + '" aria-label="Keyword deaktivieren" title="Keyword deaktivieren">\u00d7</button>'
          : '') +
        (canExpand
          ? '<span class="cvz-prompt-expand-chevron">' + (state.expandedKeywordId === rowId ? '▾' : '▸') + '</span>'
          : '');
      list.appendChild(row);

      if (canExpand && state.expandedKeywordId === rowId) {
        list.appendChild(renderKeywordExpansion(kw, rowId, changelogEntries));
      }
    }

    // Group keywords by messymiddle_phase
    var grouped = {};
    PHASE_ORDER.forEach(function (p) { grouped[p] = []; });
    grouped['__none__'] = [];
    keywords.forEach(function (kw) {
      var p = kw.messymiddle_phase;
      if (p && grouped[p]) {
        grouped[p].push(kw);
      } else {
        grouped['__none__'].push(kw);
      }
    });

    // Check if any keywords have a phase assigned
    var hasAnyPhase = PHASE_ORDER.some(function (p) { return grouped[p].length > 0; });

    if (!hasAnyPhase) {
      // No phase data yet — render flat list as before
      var flatList = document.createElement('div');
      flatList.className = 'cvz-prompt-list';
      keywords.forEach(function (kw) { _renderKwRow(kw, flatList); });
      section.appendChild(flatList);
      return section;
    }

    // Render phase groups
    PHASE_ORDER.forEach(function (phase) {
      if (grouped[phase].length === 0) return;
      var phaseColor = PHASE_COLORS[phase] || '#4a5568';

      var groupHeading = document.createElement('p');
      groupHeading.className = 'cvz-prompt-phase-heading';
      groupHeading.style.borderLeftColor = phaseColor;
      groupHeading.textContent = PHASE_LABELS[phase] || phase;
      section.appendChild(groupHeading);

      var phaseList = document.createElement('div');
      phaseList.className = 'cvz-prompt-list';
      grouped[phase].forEach(function (kw) { _renderKwRow(kw, phaseList); });
      section.appendChild(phaseList);
    });

    // "Nicht zugeordnet" group
    if (grouped['__none__'].length > 0) {
      var noneHeading = document.createElement('p');
      noneHeading.className = 'cvz-prompt-phase-heading';
      noneHeading.style.borderLeftColor = '#4a5568';
      noneHeading.textContent = 'Nicht zugeordnet';
      section.appendChild(noneHeading);

      var noneList = document.createElement('div');
      noneList.className = 'cvz-prompt-list';
      grouped['__none__'].forEach(function (kw) { _renderKwRow(kw, noneList); });
      section.appendChild(noneList);
    }

    return section;
  }

  // NEU (15.09.2026): manuelle Korrektur der Messy-Middle-Phase eines
  // Keywords/einer PAA-Frage, siehe main.py: update_keyword_phase_endpoint.
  async function updateKeywordPhase(topicId, keywordId, phase) {
    try {
      await apiFetch('/topics/' + topicId + '/keywords/' + keywordId + '/phase', {
        method: 'PATCH',
        body: { messymiddle_phase: phase },
      });
      var cached = state.topicDetailCache[topicId];
      var kw = cached && (cached.search_queries || []).filter(function (q) { return q.id === keywordId; })[0];
      if (kw) {
        kw.messymiddle_phase = phase;
        kw.phase_manually_set = true;
      }
    } catch (e) {
      console.error('[CVZ Visibility] Phase konnte nicht gespeichert werden:', e);
      await showCvzAlert('Phase konnte nicht gespeichert werden: ' + (e.message || 'Unbekannter Fehler'));
    }
    render();
  }

  function renderKeywordExpansion(kw, rowId, changelogEntries) {
    var wrap = document.createElement('div');
    wrap.className = 'cvz-prompt-expansion';

    var linkedEntries = (changelogEntries || []).filter(function (entry) {
      return (entry.linked_search_query_ids || []).indexOf(kw.id) !== -1;
    });
    var linkedHtml = '';
    if (linkedEntries.length > 0) {
      linkedHtml = '<div class="cvz-prompt-linked-changelog">' +
        '<p class="cvz-changelog-guided-label">Verkn\u00fcpfte \u00c4nderungen</p>' +
        linkedEntries.map(function (entry) {
          return '<p class="cvz-changelog-linked">' + formatRelativeTime(entry.created_at) + ': ' + escapeHtml(entry.entry_text) + '</p>';
        }).join('') +
      '</div>';
    }

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

    // NEU (15.09.2026): Korrektur-Chips für die Messy-Middle-Phase (siehe
    // Chat-Verlauf 15.09.2026) — Claude ordnet Keywords/PAA-Fragen
    // automatisch einer Phase zu, hier kann der Nutzer das korrigieren.
    var phaseChipsHtml = '';
    if (kw.id) {
      phaseChipsHtml =
        '<p class="cvz-changelog-guided-label">Phase' + (kw.phase_manually_set ? ' (manuell gesetzt)' : '') + '</p>' +
        '<div class="cvz-persona-filter">' +
          PHASE_ORDER.map(function (phase) {
            var isActive = kw.messymiddle_phase === phase;
            return '<button type="button" class="cvz-persona-chip' + (isActive ? ' cvz-persona-chip-active' : '') + '" ' +
              'data-cvz-keyword-phase-set="' + phase + '" data-cvz-keyword-phase-id="' + escapeHtml(kw.id) + '">' +
              escapeHtml(PHASE_LABELS[phase]) + '</button>';
          }).join('') +
        '</div>';
    }

    wrap.innerHTML = linkedHtml + lines.join('') + renderSerpSummaryBlock(kw) + phaseChipsHtml;

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
        var markers = mapChangelogToMarkers(linkedEntries, snapshotDates);
        var chartWrap = document.createElement('div');
        chartWrap.className = 'cvz-card';
        chartWrap.innerHTML =
          buildLineChartSvg(series, xLabels, { markers: markers }) +
          '<p class="cvz-chart-caption">Position im Verlauf, niedriger ist besser. Historie beginnt mit eurem ersten ' +
          'Monatslauf nach Einf\u00fchrung dieser Auswertung, keine r\u00fcckwirkenden Daten. Gestrichelte Linien sind ' +
          'Eintr\u00e4ge im \u00c4nderungsprotokoll, die ihr explizit mit diesem Keyword verkn\u00fcpft habt.</p>';
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

  function renderPromptExpansion(prompt, changelogEntries) {
    var wrap = document.createElement('div');
    wrap.className = 'cvz-prompt-expansion';

    var linkedEntries = (changelogEntries || []).filter(function (entry) {
      return (entry.linked_prompt_ids || []).indexOf(prompt.id) !== -1;
    });
    var linkedHtml = '';
    if (linkedEntries.length > 0) {
      linkedHtml = '<div class="cvz-prompt-linked-changelog">' +
        '<p class="cvz-changelog-guided-label">Verkn\u00fcpfte \u00c4nderungen</p>' +
        linkedEntries.map(function (entry) {
          return '<p class="cvz-changelog-linked">' + formatRelativeTime(entry.created_at) + ': ' + escapeHtml(entry.entry_text) + '</p>';
        }).join('') +
      '</div>';
    }

    if (state.loadingPromptCitations[prompt.id]) {
      wrap.innerHTML = linkedHtml + '<p class="cvz-card-placeholder-text">Lädt...</p>';
      return wrap;
    }
    var data = state.promptCitationsCache[prompt.id];
    if (!data) {
      wrap.innerHTML = linkedHtml + '<p class="cvz-card-placeholder-text">Für diesen Prompt liegen noch keine Antwort-Daten vor.</p>';
      return wrap;
    }
    if (linkedHtml) wrap.innerHTML = linkedHtml;

    // Quellen-Zusammenfassung: wie viele Quellen wurden pro Engine zitiert?
    // Hilft dem User einzuschätzen, welche Prompts priorisiert werden sollten.
    var cptRuns = data.chat_gpt || [];
    var gemRuns = data.gemini || [];
    var cptSources = cptRuns.length > 0 && cptRuns[0].sources ? cptRuns[0].sources.length : null;
    var gemSources = gemRuns.length > 0 && gemRuns[0].sources ? gemRuns[0].sources.length : null;
    if (cptSources !== null || gemSources !== null) {
      var sourceSummary = document.createElement('p');
      sourceSummary.className = 'cvz-prompt-source-summary';
      var parts = [];
      if (cptSources !== null) parts.push(MODEL_LABELS.chat_gpt + ': ' + cptSources + ' Quellen');
      if (gemSources !== null) parts.push(MODEL_LABELS.gemini + ': ' + gemSources + ' Quellen');
      sourceSummary.textContent = parts.join(' · ');
      wrap.appendChild(sourceSummary);
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

    var _statusText = run.own_domain_cited
      ? '\u2713 zitiert' + (run.own_domain_citation_position ? ' (Position ' + run.own_domain_citation_position + ')' : '')
      : (run.own_domain_mentioned ? '\u2013 nur erw\u00e4hnt, nicht zitiert' : '');
    if (run.own_domain_recommended === true) _statusText += ' \u00b7 aktiv empfohlen';
    if (_statusText) {
      var statusLine = document.createElement('p');
      statusLine.className = 'cvz-prompt-run-status';
      statusLine.textContent = _statusText;
      wrap.appendChild(statusLine);
    }

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

    if (run.competitor_mentioned_only && run.competitor_mentioned_only.length) {
      var mentionedNote = document.createElement('p');
      mentionedNote.className = 'cvz-card-placeholder-text cvz-prompt-mentioned-note';
      mentionedNote.textContent = 'Im Text erw\u00e4hnt, aber nicht als Quelle zitiert: ' + run.competitor_mentioned_only.join(', ');
      wrap.appendChild(mentionedNote);
    }

    return wrap;
  }

  function computePhaseRollup(prompts) {
    return PHASE_ORDER.map(function (phase) {
      var inPhase = prompts.filter(function (p) { return (p.messymiddle_phase || p.phase) === phase; });
      var counts = { green: 0, yellow: 0, red: 0, unknown: 0 };
      inPhase.forEach(function (p) {
        var key = (p.total_runs == null || p.total_runs === 0)
          ? 'unknown'
          : (p.cited_count > 0 ? 'green' : 'red');
        counts[key] = (counts[key] || 0) + 1;
      });
      return { phase: phase, total: inPhase.length, counts: counts };
    }).filter(function (row) { return row.total > 0; });
  }

  function renderPhaseRollup(prompts) {
    var rollup = computePhaseRollup(prompts);
    if (rollup.length === 0) return null;

    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Sichtbarkeit über die Journey-Phasen';
    section.appendChild(heading);

    // NEU (15.09.2026): Klarstellung, siehe Chat-Verlauf 15.09.2026 — die
    // Balken hier messen AUSSCHLIESSLICH, ob die EIGENE Domain zitiert
    // wurde, nicht ob überhaupt irgendeine Zitierung stattfand. Ein
    // Wettbewerber kann im selben Prompt zitiert werden, ohne dass sich
    // das hier niederschlägt — beides sind bewusst getrennte Kennzahlen
    // (siehe Wettbewerber-Tab für die andere Seite).
    var clarification = document.createElement('p');
    clarification.className = 'cvz-card-placeholder-text';
    clarification.style.marginBottom = '8px';
    clarification.textContent = 'Zeigt, in welchen Phasen der Customer Journey ihr erwähnt werdet.';
    section.appendChild(clarification);

    var grid = document.createElement('div');
    grid.className = 'cvz-phase-rollup-grid';
    rollup.forEach(function (row) {
      var greenPct = Math.round((row.counts.green / row.total) * 100);
      var yellowPct = Math.round((row.counts.yellow / row.total) * 100);
      var redPct = Math.max(0, 100 - greenPct - yellowPct);

      var card = document.createElement('div');
      card.className = 'cvz-phase-rollup-card';
      card.innerHTML =
        '<p class="cvz-phase-rollup-label">' + escapeHtml(PHASE_LABELS[row.phase] || row.phase) + '</p>' +
        '<div class="cvz-phase-rollup-bar">' +
          (greenPct ? '<span class="cvz-phase-rollup-segment cvz-dot-green" style="width:' + greenPct + '%" title="' + row.counts.green + ' zitiert"></span>' : '') +
          (yellowPct ? '<span class="cvz-phase-rollup-segment cvz-dot-yellow" style="width:' + yellowPct + '%" title="' + row.counts.yellow + ' erwähnt, nicht zitiert"></span>' : '') +
          (redPct ? '<span class="cvz-phase-rollup-segment cvz-dot-red" style="width:' + redPct + '%" title="' + (row.counts.red + row.counts.unknown) + ' nicht vorhanden/unbekannt"></span>' : '') +
        '</div>' +
        '<p class="cvz-phase-rollup-count">' + (row.counts.green > 0 ? row.counts.green + ' von ' + row.total + ' zitiert' : 'Eigene Domain nicht sichtbar') + '</p>';
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  function getDistinctPersonas(prompts) {
    var seen = {};
    var personas = [];
    prompts.forEach(function (p) {
      if (p.persona && !seen[p.persona]) {
        seen[p.persona] = true;
        personas.push(p.persona);
      }
    });
    return personas.sort();
  }

  function renderPersonaFilterChips(prompts) {
    var personas = getDistinctPersonas(prompts);
    if (personas.length === 0) return null;

    var wrap = document.createElement('div');
    wrap.className = 'cvz-persona-filter';

    var allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'cvz-persona-chip' + (!state.activePersonaFilter ? ' cvz-persona-chip-active' : '');
    allChip.setAttribute('data-cvz-persona-filter', '');
    allChip.textContent = 'Alle';
    wrap.appendChild(allChip);

    personas.forEach(function (persona) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cvz-persona-chip' + (state.activePersonaFilter === persona ? ' cvz-persona-chip-active' : '');
      chip.setAttribute('data-cvz-persona-filter', persona);
      chip.textContent = persona;
      wrap.appendChild(chip);
    });

    return wrap;
  }

  var MAX_MANUAL_KEYWORDS = 10;

  function renderManualKeywordForm(keywords, topicId) {
    var manualCount = (keywords || []).filter(function (k) { return k.source === 'manual'; }).length;
    var wrap = document.createElement('div');
    wrap.className = 'cvz-changelog-form';
    wrap.style.marginBottom = '16px';

    if (manualCount >= MAX_MANUAL_KEYWORDS) {
      wrap.innerHTML =
        '<p class="cvz-card-placeholder-text">Maximal ' + MAX_MANUAL_KEYWORDS + ' manuell hinzugef\u00fcgte Keywords erreicht ' +
        '(' + manualCount + '/' + MAX_MANUAL_KEYWORDS + '). Erst ein bestehendes manuelles Keyword deaktivieren.</p>';
      return wrap;
    }

    // Label mit Tooltip
    var kwLabelRow = document.createElement('div');
    kwLabelRow.style.cssText = 'display:flex;align-items:center;margin-bottom:6px;';
    var kwLabel = document.createElement('span');
    kwLabel.className = 'cvz-section-label';
    kwLabel.style.margin = '0';
    kwLabel.textContent = 'Eigenes Keyword hinzuf\u00fcgen';
    kwLabelRow.appendChild(kwLabel);
    var kwSlotBadge = document.createElement('span');
    kwSlotBadge.style.cssText = 'margin-left:8px;font-size:11px;color:var(--cvz-text-muted,#8b98a5);font-weight:400;';
    kwSlotBadge.textContent = manualCount + '\u202fvon\u202f' + MAX_MANUAL_KEYWORDS + ' Slots';
    kwLabelRow.appendChild(kwSlotBadge);
    kwLabelRow.appendChild(makeTip(
      'Keywords, die du hier hinzuf\u00fcgst, werden beim n\u00e4chsten Datenlauf in die GSC-Abfrage einbezogen und mit KI-Pr\u00e4senz verglichen. Sie erscheinen sofort in der Liste, bekommen aber erst Daten, wenn der n\u00e4chste Lauf abgeschlossen ist.'
    ));
    wrap.appendChild(kwLabelRow);

    var KW_MAX_CHARS = 80;
    var kwInputRow = document.createElement('div');
    kwInputRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
    kwInputRow.innerHTML =
      '<input type="text" id="cvz-manual-keyword-input" class="cvz-changelog-custom-input" style="flex:1;min-width:140px;" ' +
        'maxlength="' + KW_MAX_CHARS + '" ' +
        'placeholder="z.B. landingpage optimierung" ' +
        'value="' + escapeHtml(state.manualKeywordDraftText || '') + '">' +
      '<button type="button" class="cvz-changelog-submit-btn" data-cvz-manual-keyword-submit="' + topicId + '" ' +
        (state.isSubmittingManualKeyword ? 'disabled' : '') + '>' +
        (state.isSubmittingManualKeyword ? 'Wird gespeichert \u2026' : 'Hinzuf\u00fcgen') +
      '</button>';
    wrap.appendChild(kwInputRow);
    var kwHint = document.createElement('p');
    kwHint.style.cssText = 'margin:4px 0 0;font-size:11px;color:var(--cvz-text-muted,#8b98a5);';
    kwHint.textContent = 'max. ' + KW_MAX_CHARS + ' Zeichen';
    wrap.appendChild(kwHint);

    var inputEl = wrap.querySelector('#cvz-manual-keyword-input');
    inputEl.addEventListener('input', function () {
      state.manualKeywordDraftText = inputEl.value;
    });

    return wrap;
  }

  var MAX_MANUAL_PROMPTS = 4;

  function renderManualPromptForm(prompts, topicId) {
    var manualCount = (prompts || []).filter(function (p) { return p.source === 'manual'; }).length;
    var wrap = document.createElement('div');
    wrap.className = 'cvz-changelog-form';
    wrap.style.marginBottom = '16px';

    if (manualCount >= MAX_MANUAL_PROMPTS) {
      wrap.innerHTML =
        '<p class="cvz-card-placeholder-text">Maximal ' + MAX_MANUAL_PROMPTS + ' manuell hinzugef\u00fcgte Prompts erreicht ' +
        '(' + manualCount + '/' + MAX_MANUAL_PROMPTS + '). Erst einen bestehenden manuellen Prompt deaktivieren.</p>';
      return wrap;
    }

    // Zwei Zeilen: Label+Tooltip oben, Eingabe unten
    var promptLabelRow = document.createElement('div');
    promptLabelRow.style.cssText = 'display:flex;align-items:center;margin-bottom:6px;';
    var promptLabel = document.createElement('span');
    promptLabel.className = 'cvz-section-label';
    promptLabel.style.margin = '0';
    promptLabel.textContent = 'Eigenen Prompt hinzuf\u00fcgen';
    promptLabelRow.appendChild(promptLabel);
    var promptAvail = MAX_MANUAL_PROMPTS - manualCount;
    var promptSlotBadge = document.createElement('span');
    promptSlotBadge.style.cssText = 'margin-left:8px;font-size:11px;color:var(--cvz-text-muted,#8b98a5);font-weight:400;';
    promptSlotBadge.textContent = 'noch\u202f' + promptAvail + '\u202fvon\u202f' + MAX_MANUAL_PROMPTS + ' frei';
    promptLabelRow.appendChild(promptSlotBadge);
    promptLabelRow.appendChild(makeTip(
      'Prompts sind die konkreten Fragen, die potenzielle Kunden bei ChatGPT, Gemini & Co. stellen. Das System sendet sie in regelm\u00e4\u00dfigen Abst\u00e4nden an die KI-Systeme und pr\u00fcft, ob deine Domain in der Antwort vorkommt. Neue Prompts bekommen erst Daten nach dem n\u00e4chsten Lauf.'
    ));
    wrap.appendChild(promptLabelRow);

    var phaseLabelRow = document.createElement('div');
    phaseLabelRow.style.cssText = 'display:flex;align-items:center;margin-bottom:6px;';
    var phaseLabel = document.createElement('span');
    phaseLabel.className = 'cvz-section-label';
    phaseLabel.style.margin = '0';
    phaseLabel.textContent = 'Journey-Phase';
    phaseLabelRow.appendChild(phaseLabel);
    phaseLabelRow.appendChild(makeTip(
      'Exploration: breite, informationelle Fragen ("Was ist..."). Evaluation: konkrete Anbieter- oder Produktfragen. Vergleich: Alternativen gegeneinander. Entscheidung: kaufbereit, sucht letzten Anstoss. Die Phase bestimmt, wo dein Prompt im Dashboard angezeigt wird.'
    ));
    wrap.appendChild(phaseLabelRow);

    var phaseOptionsHtml = PHASE_ORDER.map(function (phase) {
      return '<option value="' + phase + '"' + (state.manualPromptDraftPhase === phase ? ' selected' : '') + '>' +
        escapeHtml(PHASE_LABELS[phase] || phase) + '</option>';
    }).join('');

    var PROMPT_MAX_CHARS = 400;
    var promptInputRow = document.createElement('div');
    promptInputRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;';
    promptInputRow.innerHTML =
      '<textarea id="cvz-manual-prompt-input" class="cvz-changelog-input" rows="1" ' +
        'maxlength="' + PROMPT_MAX_CHARS + '" ' +
        'placeholder="z.B. Welches CRO-Tool lohnt sich f\u00fcr B2B-SaaS?">' +
        escapeHtml(state.manualPromptDraftText || '') +
      '</textarea>' +
      '<select id="cvz-manual-prompt-phase" class="cvz-changelog-custom-input" style="max-width:160px;">' +
        phaseOptionsHtml +
      '</select>' +
      '<button type="button" class="cvz-changelog-submit-btn" data-cvz-manual-prompt-submit="' + topicId + '" ' +
        (state.isSubmittingManualPrompt ? 'disabled' : '') + '>' +
        (state.isSubmittingManualPrompt ? 'Wird gespeichert \u2026' : 'Hinzuf\u00fcgen') +
      '</button>';
    wrap.appendChild(promptInputRow);

    var promptCharHint = document.createElement('p');
    promptCharHint.id = 'cvz-prompt-char-hint';
    promptCharHint.style.cssText = 'margin:4px 0 0;font-size:11px;color:var(--cvz-text-muted,#8b98a5);';
    promptCharHint.textContent = 'max. ' + PROMPT_MAX_CHARS + ' Zeichen';
    wrap.appendChild(promptCharHint);

    var textareaEl = wrap.querySelector('#cvz-manual-prompt-input');
    textareaEl.addEventListener('input', function () {
      state.manualPromptDraftText = textareaEl.value;
      var remaining = PROMPT_MAX_CHARS - textareaEl.value.length;
      promptCharHint.textContent = remaining < 50
        ? remaining + ' Zeichen \u00fcbrig'
        : 'max. ' + PROMPT_MAX_CHARS + ' Zeichen';
      promptCharHint.style.color = remaining < 20
        ? 'var(--cvz-red,#de5b50)'
        : 'var(--cvz-text-muted,#8b98a5)';
    });
    var selectEl = wrap.querySelector('#cvz-manual-prompt-phase');
    selectEl.addEventListener('change', function () {
      state.manualPromptDraftPhase = selectEl.value;
    });

    return wrap;
  }

  function renderPromptsByPhase(prompts, enableCitations, changelogEntries) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Prompts nach Phase';
    section.appendChild(heading);

    var personaChips = renderPersonaFilterChips(prompts);
    if (personaChips) section.appendChild(personaChips);

    var filteredPrompts = state.activePersonaFilter
      ? prompts.filter(function (p) { return p.persona === state.activePersonaFilter; })
      : prompts;

    var rollup = renderPhaseRollup(filteredPrompts);
    if (rollup) section.appendChild(rollup);

    section.appendChild(renderManualPromptForm(prompts, state.activeTopicId));

    PHASE_ORDER.forEach(function (phase) {
      var promptsInPhase = filteredPrompts.filter(function (p) { return p.phase === phase; });
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
        var citationBadge = (prompt.total_runs !== null && prompt.total_runs !== undefined && prompt.total_runs > 0)
          ? (prompt.cited_count > 0
              ? '<span class="cvz-prompt-citation-count">' + prompt.cited_count + '/' + prompt.total_runs + ' zitiert</span>'
              : '<span class="cvz-prompt-citation-count" style="color:var(--cvz-text-muted,#8b98a5);">Eigene Domain nicht sichtbar</span>')
          : '';

        // NEU (18.09.2026): priorisierter Marker fuer Prompts, bei denen die
        // eigene Domain zwar als Quelle genannt wird, aber ohne echten Link
        // (siehe main.py: _compute_unlinked_citation_by_prompt). Bewusst
        // visuell auffaelliger als contentTypeBadge (Warn-Farbe), weil das
        // laut Kundenwunsch der entscheidende, priorisiert zu behebende
        // Unterschied ist.
        var unlinkedBadge = prompt.cited_without_link
          ? '<span class="cvz-prompt-citation-count" style="color:var(--cvz-orange,#e0a030);border:1px solid var(--cvz-orange,#e0a030);border-radius:4px;padding:1px 6px;" title="Wird als Quelle genannt, aber die KI setzt keinen echten Link \u2014 priorisiert beheben (z.B. Struktur/Schema.org/Crawlability pruefen)">\u26a0 ohne Link zitiert</span>'
          : '';

        var contentTypeBadge = prompt.top_cited_content_type
          ? '<span class="cvz-prompt-content-type" title="Typ der meistzitierten Quelle: ' + escapeHtml(CONTENT_TYPE_LABELS[prompt.top_cited_content_type] || prompt.top_cited_content_type) + ' (' + escapeHtml(prompt.top_cited_domain || '') + ')">' +
              (CONTENT_TYPE_LABELS[prompt.top_cited_content_type] || escapeHtml(prompt.top_cited_content_type)) +
            '</span>'
          : '';

        var personaBadge = prompt.persona
          ? '<span class="cvz-prompt-persona">' + escapeHtml(prompt.persona) + '</span>'
          : '';

        var aiSearchVolumeBadge = prompt.ai_search_volume != null
          ? '<span class="cvz-prompt-persona" title="Echte AI-Overview-Frage, laut DataForSEO ca. ' +
              escapeHtml(prompt.ai_search_volume) + 'x/Monat gestellt">\u2713 ' +
              escapeHtml(prompt.ai_search_volume) + '/Monat</span>'
          : '';

        // Changelog-Badge: shows an edit icon when this prompt is linked to changelog entries.
        var promptLinkedCount = (changelogEntries || []).filter(function (entry) {
          return (entry.linked_prompt_ids || []).indexOf(prompt.id) !== -1;
        }).length;
        var changelogBadgeHtml = promptLinkedCount > 0
          ? ' <span class="cvz-changelog-linked-badge" title="' + promptLinkedCount + ' verknüpfte Änderung(en)">✎</span>'
          : '';

        // Favicons: cited_domains kommt direkt vom Backend (alle zitierten Domains
        // sortiert nach Häufigkeit). Fallback auf top_cited_domain für ältere Responses.
        var _favDomains = (prompt.cited_domains && prompt.cited_domains.length > 0)
          ? prompt.cited_domains.slice(0, 6)
          : (prompt.top_cited_domain ? [prompt.top_cited_domain] : []);
        var faviconHtml = _favDomains.length > 0
          ? '<span style="display:inline-flex;align-items:center;gap:2px;flex-shrink:0;">' +
              _favDomains.map(function (d) {
                return '<img src="https://www.google.com/s2/favicons?sz=14&domain=' + encodeURIComponent(d) + '" ' +
                  'style="width:14px;height:14px;border-radius:2px;" ' +
                  'onerror="this.style.display=\'none\'" ' +
                  'title="' + escapeHtml(d) + '">';
              }).join('') +
            '</span>'
          : '';

        var row = document.createElement('div');
        row.className = 'cvz-prompt-row' + (enableCitations ? ' cvz-prompt-row-clickable' : '');
        if (enableCitations) row.setAttribute('data-cvz-prompt-toggle', prompt.id);
        row.innerHTML =
          '<span class="cvz-dot ' + dotClass + '" title="' + escapeHtml(statusLabel) + '"></span>' +
          '<span class="cvz-prompt-text">' + escapeHtml(prompt.prompt_text) + changelogBadgeHtml + '</span>' +
          faviconHtml +
          citationBadge +
          unlinkedBadge +
          contentTypeBadge +
          personaBadge +
          aiSearchVolumeBadge +
          '<span class="cvz-prompt-source">' +
            (prompt.prompt_type === 'stable_core' ? '' : 'Discovery') +
            (prompt.topic_name ? ' · ' + escapeHtml(prompt.topic_name) : '') +
          '</span>' +
          '<button type="button" class="cvz-prompt-delete-btn" data-cvz-prompt-delete="' + prompt.id + '" aria-label="Prompt deaktivieren" title="Prompt deaktivieren">\u00d7</button>' +
          (enableCitations ? '<span class="cvz-prompt-expand-chevron">' + (state.expandedPromptId === prompt.id ? '\u25be' : '\u25b8') + '</span>' : '');
        list.appendChild(row);

        if (enableCitations && state.expandedPromptId === prompt.id) {
          list.appendChild(renderPromptExpansion(prompt, changelogEntries));
        }
      });
      section.appendChild(list);
    });

    return section;
  }

  // GSC-Keywords auf Themen-Relevanz filtern.
  // Deutsches Compound-Matching: Topic-Term als Teilstring der Suchanfrage ODER
  // ein Wort der Suchanfrage als Teilstring eines Topic-Terms.
  function filterGscByTopicRelevance(gscRows, detail) {
    if (!gscRows || gscRows.length === 0) return gscRows;

    // Extended stop words: function words + generic IT/business terms that appear in
    // nearly every tech topic and must NOT drive the relevance filter.
    var STOP = [
      // German function words
      'und', 'der', 'die', 'das', 'von', 'mit', 'bei', 'zur', 'zum', 'ein', 'eine',
      'ist', 'sind', 'oder', 'wie', 'was', 'als', 'fuer', 'auch', 'nach', 'noch',
      // English function words
      'for', 'the', 'and', 'of', 'vs', 'with', 'from', 'that', 'this', 'are', 'not',
      // Generic IT / business terms too common to discriminate
      'service', 'services', 'management', 'cloud', 'digital', 'system', 'systems',
      'platform', 'platforms', 'solution', 'solutions', 'migration', 'strategie',
      'beratung', 'ansatz', 'helpdesk', 'software', 'enterprise', 'business', 'support',
      'infrastructure', 'infrastruktur', 'application', 'applications', 'applikation',
      'integration', 'transformation', 'outsourcing', 'consulting', 'dienstleistung',
      'provider', 'vendor', 'managed', 'hybrid', 'online', 'network', 'netzwerk',
      'security', 'sicherheit', 'data', 'daten', 'analyse', 'analysis', 'marketing',
      'tool', 'tools', 'produkt', 'produkte', 'anbieter', 'losung', 'losungen',
    ];

    var terms = [];   // specific terms (min length varies by source)
    var abbrevs = []; // uppercase abbreviations from topic name / seed_keyword (e.g. "TI", "ERP")

    function extractAbbrevs(str) {
      // Capture 2-4 letter ALL-CAPS words from the original string before lowercasing
      (str || '').split(/[\s\-_\/\.,;:+()\[\]]+/).forEach(function (w) {
        if (w.length >= 2 && w.length <= 4 && w === w.toUpperCase() && /^[A-Z]+$/.test(w)) {
          var lw = w.toLowerCase();
          if (abbrevs.indexOf(lw) === -1) abbrevs.push(lw);
        }
      });
    }

    function addTerms(str, minLen) {
      var min = minLen || 6;
      (str || '').toLowerCase().split(/[\s\-_\/\.,;:+()\[\]]+/).forEach(function (w) {
        if (w.length >= min && STOP.indexOf(w) === -1 && terms.indexOf(w) === -1) terms.push(w);
      });
    }

    // Primary signal: seed_keyword (most discriminating; allow min 5 so specific
    // short product names like "ariba" still qualify).
    var seedKw = (detail.topic && detail.topic.seed_keyword) || '';
    extractAbbrevs(seedKw);
    addTerms(seedKw, 5);

    // Topic name
    var topicName = (detail.topic && detail.topic.name) || '';
    extractAbbrevs(topicName);
    addTerms(topicName, 6);

    // Curated search queries (source !== 'gsc_near_miss' = hand-picked or AI-generated,
    // not derived from GSC itself, so they carry stronger topic signal).
    (detail.search_queries || []).forEach(function (q) {
      if (q.source !== 'gsc_near_miss') addTerms(q.keyword || '', 7);
    });

    if (terms.length === 0 && abbrevs.length === 0) return gscRows;

    return gscRows.filter(function (row) {
      var q = (row.query || '').toLowerCase();
      var qWords = q.split(/[\s\-_\/\.,;:+()\[\]]+/);

      // Abbreviation match: whole-word only (e.g. topic "TI as a Service" -> "ti"
      // must appear as a standalone word in the query, not inside a longer token).
      if (abbrevs.some(function (ab) { return qWords.indexOf(ab) !== -1; })) return true;

      return terms.some(function (term) {
        if (term.length >= 10) {
          // Long compound (e.g. "telematikinfrastruktur"): substring match is fine.
          if (q.indexOf(term) !== -1) return true;
        } else {
          // Shorter specific term: require whole-word match to avoid "service"
          // matching "application management services".
          if (qWords.indexOf(term) !== -1) return true;
        }
        // Reverse direction: a query word appears as a component of a topic term
        // (German compound decomposition, e.g. query "infrastruktur" in topic "telematikinfrastruktur").
        return qWords.some(function (qw) {
          return qw.length >= 6 && STOP.indexOf(qw) === -1 && term.indexOf(qw) !== -1;
        });
      });
    });
  }

  function renderGscBlock(gscRows, topicId, changelogEntries) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var gscHeadRow = document.createElement('div');
    gscHeadRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:10px;';
    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.style.margin = '0';
    heading.textContent = 'Google-Search-Console-Performance';
    gscHeadRow.appendChild(heading);
    gscHeadRow.appendChild(makeTip(
      'Hier siehst du Keywords, bei denen du in Google auf Position 20+ rankst und mindestens 50 Impressionen hast ("Near-Miss"-Keywords). Das sind Seiten, die knapp an Seite 1 vorbeischrammen, mit gezielter Optimierung oft schnell verbesserbar.'
    ));
    section.appendChild(gscHeadRow);

    var refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'cvz-create-toggle-btn';
    refreshBtn.setAttribute('data-cvz-refresh-gsc', topicId);
    refreshBtn.disabled = state.isRefreshingGsc;
    refreshBtn.textContent = state.isRefreshingGsc ? 'Wird nachgezogen \u2026' : 'GSC-Daten jetzt nachziehen';
    section.appendChild(refreshBtn);

    if (!gscRows || gscRows.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine GSC-Daten verf\u00fcgbar. Falls die GSC-Verbindung erst k\u00fcrzlich hergestellt wurde, oben auf "GSC-Daten jetzt nachziehen" klicken, statt auf den n\u00e4chsten Monatslauf zu warten.';
      section.appendChild(empty);
      return section;
    }

    // GEÄNDERT (15.09.2026): von einer reinen Tabelle auf aufklappbare
    // Zeilen umgestellt (gleiches Prinzip wie Keywords/Prompts).
    // GEÄNDERT (16.09.2026): URL-Spalte und Deactivate-Button ergänzt (page_url
    // aus search_queries, gespeichert via save_gsc_near_miss in run_topic.py).
    var table = document.createElement('table');
    table.className = 'cvz-table';
    table.innerHTML = '<thead><tr><th></th><th>Suchanfrage</th><th>Rankende URL</th><th>Klicks</th><th>Impressionen</th><th>CTR</th><th>Position</th><th>Verkn\u00fcpfte \u00c4nderungen</th><th></th></tr></thead>';
    var tbody = document.createElement('tbody');
    gscRows.forEach(function (row) {
      var linkedEntries = (changelogEntries || []).filter(function (entry) {
        return row.id && (entry.linked_search_query_ids || []).indexOf(row.id) !== -1;
      });
      var linkedCell = linkedEntries.length
        ? escapeHtml(linkedEntries.map(function (e) { return e.entry_text; }).join('; '))
        : '\u2013';
      var rowId = row.id || row.query;
      var isExpanded = state.expandedGscRowId === rowId;
      var tr = document.createElement('tr');
      tr.className = 'cvz-gsc-row-clickable';
      tr.setAttribute('data-cvz-gsc-toggle', rowId);
      tr.setAttribute('data-cvz-gsc-text', row.query);
      var pageUrlHtml = row.page_url
        ? '<a href="' + escapeHtml(row.page_url) + '" target="_blank" rel="noopener" class="cvz-gsc-page-url" title="' + escapeHtml(row.page_url) + '">' +
            escapeHtml(row.page_url.replace(/^https?:\/\/[^\/]+/, '').slice(0, 40) || '/') + '</a>'
        : '\u2013';
      tr.innerHTML =
        '<td class="cvz-prompt-expand-chevron">' + (isExpanded ? '\u25be' : '\u25b8') + '</td>' +
        '<td>' + escapeHtml(row.query) + '</td>' +
        '<td class="cvz-gsc-cell-url">' + pageUrlHtml + '</td>' +
        '<td>' + escapeHtml(row.clicks) + '</td>' +
        '<td>' + escapeHtml(row.impressions) + '</td>' +
        '<td>' + escapeHtml((row.ctr * 100).toFixed(1)) + '%</td>' +
        '<td>' + escapeHtml(row.position.toFixed(1)) + '</td>' +
        '<td class="cvz-gsc-cell-linked">' + linkedCell + '</td>' +
        '<td><button type="button" class="cvz-prompt-delete-btn" data-cvz-keyword-deactivate="' + (row.id || '') + '" aria-label="Keyword deaktivieren" title="Keyword deaktivieren">\u00d7</button></td>';
      tbody.appendChild(tr);

      if (isExpanded) {
        var expansionTr = document.createElement('tr');
        var expansionTd = document.createElement('td');
        expansionTd.colSpan = 9;
        expansionTd.appendChild(renderGscRowExpansion(row, rowId));
        expansionTr.appendChild(expansionTd);
        tbody.appendChild(expansionTr);
      }
    });
    table.appendChild(tbody);
    var tableScroll = document.createElement('div');
    tableScroll.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;';
    tableScroll.appendChild(table);
    section.appendChild(tableScroll);
    return section;
  }

  // NEU (15.09.2026): Entwicklung über die Zeit für eine GSC-Suchanfrage,
  // dieselbe Datenquelle wie der Keyword-Rank-Verlauf (search_rank_
  // snapshots über /rank-history, jetzt inkl. gsc_clicks).
  function renderGscRowExpansion(row, rowId) {
    var wrap = document.createElement('div');
    wrap.className = 'cvz-prompt-expansion';

    // NEU (15.09.2026): SERP-Block zuerst gebaut, nicht direkt angehängt —
    // die folgenden früh-verlassenden Zustände (lädt/kein Verlauf) setzen
    // wrap.innerHTML komplett neu, das würde einen bereits angehängten
    // SERP-Block sonst überschreiben.
    var serpHtml = renderSerpSummaryBlock(row);

    if (state.loadingGscRankHistory[rowId]) {
      wrap.innerHTML = serpHtml + '<p class="cvz-card-placeholder-text">L\u00e4dt Verlauf...</p>';
      return wrap;
    }

    var snapshots = state.gscRankHistoryCache[rowId];
    if (!snapshots || snapshots.length < 2) {
      wrap.innerHTML = serpHtml + '<p class="cvz-card-placeholder-text">Noch kein Verlauf verf\u00fcgbar, braucht mindestens zwei Monatsl\u00e4ufe mit Daten f\u00fcr diese Suchanfrage.</p>';
      return wrap;
    }

    var xLabels = snapshots.map(function (s) { return formatShortDate(s.snapshot_at); });
    var clicksValues = snapshots.map(function (s) { return s.gsc_clicks; });
    var impressionsValues = snapshots.map(function (s) { return s.gsc_impressions; });
    var positionValues = snapshots.map(function (s) { return s.gsc_position; });

    var hasClicks = clicksValues.some(function (v) { return v != null; });
    var hasImpressions = impressionsValues.some(function (v) { return v != null; });
    var hasPosition = positionValues.some(function (v) { return v != null; });

    if (!hasClicks && !hasImpressions && !hasPosition) {
      wrap.innerHTML = serpHtml + '<p class="cvz-card-placeholder-text">Keine historisierten GSC-Werte f\u00fcr diese Suchanfrage.</p>';
      return wrap;
    }

    wrap.innerHTML = serpHtml;

    var series = [];
    if (hasClicks) series.push({ label: 'Klicks', values: clicksValues, color: 'var(--cvz-teal)' });
    if (hasImpressions) series.push({ label: 'Impressionen', values: impressionsValues, color: 'var(--cvz-amber)' });

    var chartWrap = document.createElement('div');
    chartWrap.className = 'cvz-card';
    chartWrap.innerHTML =
      buildLineChartSvg(series, xLabels, {}) +
      '<p class="cvz-chart-caption">Klicks/Impressionen im Verlauf. Historie beginnt mit eurem ersten Monatslauf nach ' +
      'Einf\u00fchrung dieser Auswertung, keine r\u00fcckwirkenden Daten.</p>';
    wrap.appendChild(chartWrap);

    if (hasPosition) {
      var posChartWrap = document.createElement('div');
      posChartWrap.className = 'cvz-card';
      posChartWrap.innerHTML =
        buildLineChartSvg([{ label: 'GSC-Position', values: positionValues, color: 'var(--cvz-red)' }], xLabels, {}) +
        '<p class="cvz-chart-caption">Position im Verlauf, niedriger ist besser.</p>';
      wrap.appendChild(posChartWrap);
    }

    return wrap;
  }

  function formatShortDate(isoString) {
    if (!isoString) return null;
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function showCvzModal(message, options) {
    options = options || {};
    var isConfirm = options.mode !== 'alert';

    return new Promise(function(resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'cvz-modal-overlay';

      var box = document.createElement('div');
      box.className = 'cvz-modal-box';

      if (options.title) {
        var titleEl = document.createElement('p');
        titleEl.className = 'cvz-modal-title';
        titleEl.textContent = options.title;
        box.appendChild(titleEl);
      }

      var textEl = document.createElement('p');
      textEl.className = 'cvz-modal-text';
      textEl.textContent = message;
      box.appendChild(textEl);

      var actions = document.createElement('div');
      actions.className = 'cvz-modal-actions';

      function close(result) {
        overlay.removeEventListener('click', onOverlayClick);
        document.removeEventListener('keydown', onKeyDown);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(result);
      }

      if (isConfirm) {
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'cvz-modal-btn cvz-modal-btn-secondary';
        cancelBtn.textContent = options.cancelLabel || 'Abbrechen';
        cancelBtn.addEventListener('click', function() { close(false); });
        actions.appendChild(cancelBtn);
      }

      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'cvz-modal-btn cvz-modal-btn-primary';
      okBtn.textContent = options.confirmLabel || 'OK';
      okBtn.addEventListener('click', function() { close(true); });
      actions.appendChild(okBtn);

      box.appendChild(actions);
      overlay.appendChild(box);
      document.documentElement.appendChild(overlay);
      okBtn.focus();

      function onOverlayClick(e) {
        if (e.target === overlay) close(false);
      }
      overlay.addEventListener('click', onOverlayClick);

      function onKeyDown(e) {
        if (e.key === 'Escape') close(false);
      }
      document.addEventListener('keydown', onKeyDown);
    });
  }

  function showCvzConfirm(message, options) {
    return showCvzModal(message, options);
  }

  function showCvzAlert(message, options) {
    var alertOptions = { mode: 'alert' };
    if (options) {
      for (var key in options) {
        if (Object.prototype.hasOwnProperty.call(options, key)) alertOptions[key] = options[key];
      }
    }
    return showCvzModal(message, alertOptions);
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return '–';
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

  /**
   * Erstellt ein [?]-Tooltip-Icon als DOM-Element.
   * @param {string} text  Der Erklaerungstext der im Hover-Popup erscheint.
   * @param {string} [dir] Optional: 'right' oeffnet den Tooltip nach rechts statt oben.
   */
  function makeTip(text, dir) {
    var span = document.createElement('span');
    span.className = 'cvz-tip' + (dir === 'right' ? ' cvz-tip-right' : '');
    span.textContent = '?';
    span.setAttribute('data-cvz-tip', text);
    span.setAttribute('aria-label', text);
    return span;
  }

  // =========================================================================
  // NEU (16.09.2026): JOURNEY-MAP-TAB
  // Zeigt Phase-Scores (Zitierrate 0-100 % pro Kanal), Share-of-Voice der
  // Wettbewerber und ein einfaches Content-Change-Log.
  // API-Endpunkt: GET /topics/{id}/dashboard-data (siehe dashboard.py)
  //               POST /topics/{id}/content-changes
  // =========================================================================

  function renderMessyMiddleTab(topicId) {
    var wrap = document.createElement('div');

    if (state.isLoadingDashboard) {
      var loadEl = document.createElement('p');
      loadEl.className = 'cvz-card-placeholder-text';
      loadEl.innerHTML = '<span class="cvz-spinner"></span>Journey-Map wird geladen…';
      wrap.appendChild(loadEl);
      return wrap;
    }

    var data = state.dashboardDataCache[topicId];
    if (!data) {
      var errEl = document.createElement('div');
      errEl.className = 'cvz-card cvz-card-placeholder';
      // GEÄNDERT (16.09.2026): cvz-btn-secondary war nirgends in CSS definiert
      // (Button erschien weiß auf weiß). Inline-Styles statt fehlender Klasse.
      errEl.innerHTML = '<p class="cvz-card-placeholder-text">Noch keine Journey-Map-Daten vorhanden. Diese entstehen nach dem ersten vollstaendigen Analyse-Lauf.</p>' +
        '<p style="margin-top:8px;"><button type="button" ' +
        'style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid var(--cvz-border,#e5e7eb);' +
        'background:transparent;color:var(--cvz-text,#374151);cursor:pointer;" ' +
        'data-cvz-journey-retry="' + topicId + '">Erneut laden</button></p>';
      wrap.appendChild(errEl);
      return wrap;
    }

    wrap.appendChild(renderPhaseScoreGrid(data.phase_scores));
    wrap.appendChild(renderJourneyShareOfVoice(data.share_of_voice));
    wrap.appendChild(renderContentChangesSection(topicId));
    return wrap;
  }

  function renderPhaseScoreGrid(phaseScores) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'KI-Sichtbarkeit nach Journey-Phase';
    section.appendChild(heading);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '12px';
    sub.textContent = 'Wie oft wird eure Domain pro Phase und Kanal als Quelle genannt (heller Balken) bzw. mit echtem Link zitiert (dunkler Balken), 0–100 %.';
    section.appendChild(sub);

    var grid = document.createElement('div');
    grid.className = 'cvz-journey-phase-grid';

    PHASE_ORDER.forEach(function (phase) {
      var scores = (phaseScores || {})[phase] || {};
      var color = PHASE_COLORS[phase] || '#8b98a5';

      var card = document.createElement('div');
      card.className = 'cvz-journey-phase-card';
      card.style.borderTopColor = color;

      var phaseLabel = document.createElement('p');
      phaseLabel.className = 'cvz-journey-phase-name';
      phaseLabel.style.color = color;
      phaseLabel.textContent = PHASE_LABELS[phase] || phase;
      card.appendChild(phaseLabel);

      CHANNEL_ORDER.forEach(function (channel) {
        var ch = scores[channel] || { score: 0, cited: 0, total: 0, score_with_url: 0, cited_with_url: 0 };
        var pct = Math.round(ch.score || 0);
        // NEU (18.09.2026): engere Definition (own_domain_cited_with_url)
        // als zweiter, kleinerer Balken innerhalb desselben Balkens, plus
        // im Tooltip aufgeschluesselt. score_with_url ist immer <= score.
        var pctLinked = Math.round(ch.score_with_url || 0);

        var row = document.createElement('div');
        row.className = 'cvz-journey-channel-row';

        var lbl = document.createElement('span');
        lbl.className = 'cvz-journey-channel-label';
        lbl.textContent = CHANNEL_LABELS[channel] || channel;
        row.appendChild(lbl);

        var barWrap = document.createElement('div');
        barWrap.className = 'cvz-journey-bar-wrap';
        barWrap.style.position = 'relative';

        var bar = document.createElement('div');
        bar.className = 'cvz-journey-bar-fill';
        bar.style.width = pct + '%';
        bar.style.backgroundColor = color;
        bar.style.opacity = '.45';
        barWrap.appendChild(bar);

        var barLinked = document.createElement('div');
        barLinked.className = 'cvz-journey-bar-fill';
        barLinked.style.width = pctLinked + '%';
        barLinked.style.backgroundColor = color;
        barLinked.style.position = 'absolute';
        barLinked.style.left = '0';
        barLinked.style.top = '0';
        barWrap.appendChild(barLinked);
        row.appendChild(barWrap);

        var num = document.createElement('span');
        num.className = 'cvz-journey-channel-num';
        num.textContent = pct + '%';
        if (ch.total > 0) {
          num.title = ch.cited + ' von ' + ch.total + ' Prompts als Quelle genannt, davon ' + ch.cited_with_url + ' mit echtem Link zitiert (' + pctLinked + '%)';
        }
        row.appendChild(num);

        // NEU (18.09.2026): prozentuale Entwicklung ggue. dem vorherigen
        // Zeitraum gleicher Laenge (dashboard.py: _add_phase_score_deltas).
        // null heisst "kein Vergleich moeglich" (z.B. Topic juenger als
        // 2x der Fenstergroesse) und wird bewusst nicht angezeigt statt
        // einer irrefuehrenden 0%-Aenderung.
        if (ch.delta_pct != null) {
          var deltaEl = document.createElement('span');
          var deltaUp = ch.delta_pct > 0;
          var deltaFlat = ch.delta_pct === 0;
          deltaEl.className = 'cvz-journey-channel-delta ' + (deltaFlat ? 'cvz-delta-flat' : (deltaUp ? 'cvz-delta-up' : 'cvz-delta-down'));
          deltaEl.textContent = (deltaFlat ? '\u2192 ' : (deltaUp ? '\u25b2 ' : '\u25bc ')) + Math.abs(ch.delta_pct) + ' Pp';
          deltaEl.title = 'Vs. vorherige Periode gleicher Länge: ' + (deltaUp ? '+' : '') + ch.delta_pct + ' Prozentpunkte (als Quelle genannt)';
          row.appendChild(deltaEl);
        }

        card.appendChild(row);
      });

      grid.appendChild(card);
    });

    section.appendChild(grid);
    return section;
  }

  function renderJourneyShareOfVoice(shareOfVoice) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Wettbewerber-Sichtbarkeit pro Phase';
    section.appendChild(heading);

    var hasAny = false;
    PHASE_ORDER.forEach(function (phase) {
      var competitors = ((shareOfVoice || {})[phase] || []);
      if (competitors.length === 0) return;
      hasAny = true;

      var phaseColor = PHASE_COLORS[phase] || '#8b98a5';

      var phaseBlock = document.createElement('div');
      phaseBlock.className = 'cvz-sov-phase-block';

      var phaseHeader = document.createElement('button');
      phaseHeader.type = 'button';
      phaseHeader.className = 'cvz-sov-phase-header';
      phaseHeader.setAttribute('data-cvz-journey-phase', phase);
      phaseHeader.innerHTML =
        '<span class="cvz-sov-phase-dot" style="background:' + phaseColor + '"></span>' +
        '<span class="cvz-sov-phase-title">' + escapeHtml(PHASE_LABELS[phase] || phase) + '</span>' +
        '<span class="cvz-sov-phase-count">' + competitors.length + ' Wettbewerber</span>' +
        '<span class="cvz-sov-chevron">' + (state.journeyActivePhase === phase ? '▲' : '▼') + '</span>';
      phaseBlock.appendChild(phaseHeader);

      if (state.journeyActivePhase === phase) {
        var table = document.createElement('table');
        table.className = 'cvz-sov-table';
        table.innerHTML =
          '<thead><tr>' +
            '<th>Domain</th>' +
            '<th>Typ</th>' +
            '<th>Zitierrate</th>' +
            '<th>Differenzierungstipp</th>' +
          '</tr></thead>';

        var tbody = document.createElement('tbody');
        competitors.forEach(function (comp) {
          var pct = Math.round(comp.citation_rate || 0);
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td class="cvz-sov-domain">' + escapeHtml(comp.domain || '') + '</td>' +
            '<td><span class="cvz-opportunity-type">' + escapeHtml(CONTENT_TYPE_LABELS[comp.content_type] || comp.content_type || '–') + '</span></td>' +
            '<td class="cvz-sov-rate">' +
              '<div class="cvz-journey-bar-wrap cvz-sov-bar-wrap">' +
                '<div class="cvz-journey-bar-fill" style="width:' + pct + '%;background:' + phaseColor + '"></div>' +
              '</div>' +
              '<span>' + pct + '%</span>' +
            '</td>' +
            '<td class="cvz-sov-tip">' + escapeHtml(comp.differentiation_suggestion || '–') + '</td>';
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        var sovScrollWrap = document.createElement('div');
        // NEU (18.09.2026): horizontales Scrollen innerhalb der Card auf
        // Mobile — Tabelle war vorher breiter als der Viewport und die
        // Spalten (Typ/Zitierrate/Differenzierungstipp) liefen einfach ab,
        // ohne Möglichkeit sie zu erreichen. Gleiches Muster wie bei den
        // anderen scrollbaren Tabellen (z.B. GSC-Tabelle).
        sovScrollWrap.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;';
        sovScrollWrap.appendChild(table);
        phaseBlock.appendChild(sovScrollWrap);
      }

      section.appendChild(phaseBlock);
    });

    if (!hasAny) {
      var empty = document.createElement('p');
      empty.className = 'cvz-card-placeholder-text';
      empty.textContent = 'Noch keine Wettbewerber-Analysen verfügbar. Beim nächsten Monatslauf werden neue Domains automatisch analysiert.';
      section.appendChild(empty);
    }

    return section;
  }

  function renderContentChangesSection(topicId, searchQueries, prompts) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Content-Änderungen & Events';
    section.appendChild(heading);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '12px';
    sub.textContent = 'Halte fest, wann ihr was geändert habt, so könnt ihr später sehen, ob sich die Sichtbarkeit danach verändert hat.';
    section.appendChild(sub);

    // Form
    var formCard = document.createElement('div');
    formCard.className = 'cvz-card cvz-content-change-form';

    var formRow = document.createElement('div');
    formRow.className = 'cvz-content-change-fields';

    var d = state.contentChangeDraft;

    var dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'cvz-create-input';
    dateInput.value = d.changed_at || new Date().toISOString().slice(0, 10);
    dateInput.addEventListener('input', function () {
      state.contentChangeDraft.changed_at = dateInput.value;
    });
    formRow.appendChild(dateInput);

    var typeSelect = document.createElement('select');
    typeSelect.className = 'cvz-picker-select cvz-content-change-type-select';
    CONTENT_CHANGE_TYPE_ORDER.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = CONTENT_CHANGE_TYPE_LABELS[t] || t;
      if (t === d.change_type) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener('change', function () {
      state.contentChangeDraft.change_type = typeSelect.value;
    });
    formRow.appendChild(typeSelect);

    var descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'cvz-create-input';
    descInput.placeholder = 'Was habt ihr geändert? (z.B. Headline der CRO-Landingpage überarbeitet)';
    descInput.value = d.description;
    descInput.addEventListener('input', function () {
      state.contentChangeDraft.description = descInput.value;
    });
    formRow.appendChild(descInput);

    var urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.className = 'cvz-create-input';
    urlInput.placeholder = 'URL (optional)';
    urlInput.value = d.url;
    urlInput.addEventListener('input', function () {
      state.contentChangeDraft.url = urlInput.value;
    });
    formRow.appendChild(urlInput);

    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'cvz-create-submit-btn';
    submitBtn.setAttribute('data-cvz-content-change-submit', '');
    submitBtn.disabled = state.isSubmittingContentChange;
    submitBtn.textContent = state.isSubmittingContentChange ? 'Speichert…' : 'Speichern';
    formRow.appendChild(submitBtn);

    formCard.appendChild(formRow);
    section.appendChild(formCard);

    // Link-Picker: Keywords und Prompts mit dieser Änderung verknüpfen
    var _thKws = (searchQueries || []).filter(function (q) { return q.source !== 'gsc_near_miss'; });
    section.appendChild(renderChangelogLinkPicker('keywords', _thKws, function (q) { return q.keyword; }));
    section.appendChild(renderChangelogLinkPicker('prompts', prompts || [], function (p) {
      return p.prompt_text && p.prompt_text.length > 60 ? p.prompt_text.slice(0, 57) + '…' : (p.prompt_text || '');
    }));

    // GEÄNDERT (20.09.2026): Die separate Liste eingetragener Änderungen an
    // dieser Stelle wurde entfernt — sie duplizierte 1:1 die weiter unten im
    // Verlauf-Tab gerenderte "Änderungs-Chronik" (die zusätzlich auch
    // System-Erkennungen zeigt, also die vollständigere Ansicht ist).
    if (state.isLoadingContentChanges) {
      var loadEl = document.createElement('p');
      loadEl.className = 'cvz-card-placeholder-text';
      loadEl.style.marginTop = '12px';
      loadEl.innerHTML = '<span class="cvz-spinner"></span>Lädt…';
      section.appendChild(loadEl);
    } else {
      var hintEl = document.createElement('p');
      hintEl.className = 'cvz-card-placeholder-text';
      hintEl.style.marginTop = '12px';
      hintEl.textContent = 'Eingetragene Änderungen erscheinen unten in der Änderungs-Chronik.';
      section.appendChild(hintEl);
    }

    return section;
  }
    // =========================================================================
  // NEU (20.09.2026): Gezielter Retry einzelner Felder, KI-Wissens-Check,
  // Wirkung der Änderungen. Backend: step_tracker.py, ai_knowledge.py,
  // change_history.py, POST /topics/{id}/retry-step.
  // =========================================================================

  // --- Retry eines einzelnen Schritts -------------------------------------

  async function retryStep(topicId, step) {
    var key = topicId + '|' + step;
    if (state.retryingSteps[key]) return;
    state.retryingSteps[key] = true;
    render();
    try {
      await apiFetch('/topics/' + topicId + '/retry-step', { method: 'POST', body: { step: step } });
      // Sofort als "läuft" markieren, damit der Fehler-Button nicht kurz wieder aufblitzt.
      var cached = state.topicDetailCache[topicId];
      if (cached) {
        cached.step_status = (cached.step_status || []).map(function (s) {
          return s.step === step ? Object.assign({}, s, { state: 'running', message: null }) : s;
        });
      }
      startStepPolling(topicId);
    } catch (e) {
      console.error('[CVZ Visibility] Schritt konnte nicht gestartet werden:', e);
      await showCvzAlert('Der Vorgang konnte nicht gestartet werden: ' + (e.message || 'Unbekannter Fehler'));
    }
    delete state.retryingSteps[key];
    render();
  }

  // Lädt das Topic-Detail alle 5 Sekunden neu, solange ein Schritt läuft.
  // Sobald ein Schritt erfolgreich war, fehlt er in step_status und sein Button verschwindet.
  function startStepPolling(topicId) {
    if (state.stepPollTimer) return;
    var attempts = 0;
    state.stepPollTimer = setInterval(async function () {
      attempts++;
      try {
        var fresh = await loadTopicDetail(topicId);
        if (fresh) state.topicDetailCache[topicId] = fresh;
      } catch (e) {
        console.error('[CVZ Visibility] Aktualisierung während eines Schritts fehlgeschlagen:', e);
      }
      var cachedNow = state.topicDetailCache[topicId];
      var stillRunning = !!cachedNow && (cachedNow.step_status || []).some(function (s) { return s.state === 'running'; });
      if (!stillRunning || attempts >= 40) {
        clearInterval(state.stepPollTimer);
        state.stepPollTimer = null;
      }
      render();
    }, 5000);
  }

  // Hinweis mit Button für Schritte, die fehlgeschlagen sind, fehlen oder gerade laufen.
  // stepKeys: welche Schritte an dieser Stelle der Oberfläche relevant sind.
  function renderStepNotice(detail, stepKeys) {
    var entries = (detail.step_status || []).filter(function (s) { return stepKeys.indexOf(s.step) !== -1; });
    if (entries.length === 0) return null;
    var topicId = detail.topic.id;
    var wrap = document.createElement('div');
    entries.forEach(function (entry) {
      var busy = entry.state === 'running' || !!state.retryingSteps[topicId + '|' + entry.step];
      var box = document.createElement('div');
      box.className = 'cvz-card cvz-collecting-banner' + (entry.state === 'failed' && !busy ? ' cvz-error-banner' : '');
      var text = document.createElement('p');
      text.className = 'cvz-collecting-banner-text';
      if (busy) {
        text.innerHTML = '<span class="cvz-spinner"></span>' + escapeHtml(entry.label) +
          ' wird gerade erstellt. Diese Seite aktualisiert sich automatisch.';
        box.appendChild(text);
      } else {
        text.textContent = entry.state === 'failed'
          ? '\u26a0\ufe0f ' + entry.label + ' konnte nicht erstellt werden. ' + (entry.message || '')
          : (entry.message || (entry.label + ' fehlt noch.'));
        box.appendChild(text);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cvz-retry-btn';
        btn.setAttribute('data-cvz-retry-step', entry.step);
        btn.textContent = entry.state === 'failed' ? 'Erneut erstellen' : 'Jetzt erstellen';
        box.appendChild(btn);
      }
      wrap.appendChild(box);
    });
    return wrap;
  }

  // --- KI-Wissens-Check ---------------------------------------------------

  var KNOWLEDGE_LEVELS = {
    bekannt:          { label: 'Bekannt',         color: '#4ec68a' },
    teilweise:        { label: 'Teilweise',       color: '#c98e2a' },
    unbekannt:        { label: 'Unbekannt',       color: '#de5b50' },
    widerspruechlich: { label: 'Widersprüchlich', color: '#8878ca' },
    nicht_geprueft:   { label: 'Nicht geprüft',   color: '#8b98a5' },
  };
  var KNOWLEDGE_PRIORITY_COLORS = { hoch: '#de5b50', mittel: '#c98e2a', niedrig: '#8b98a5' };

  function knowledgeBadge(level) {
    var cfg = KNOWLEDGE_LEVELS[level] || KNOWLEDGE_LEVELS.unbekannt;
    return '<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;' +
      'white-space:nowrap;color:' + cfg.color + ';border:1px solid ' + cfg.color + ';">' + cfg.label + '</span>';
  }

  function renderKnowledgeSection(detail) {
    var k = detail.ai_knowledge;
    if (!k) return null;

    var section = document.createElement('div');
    section.className = 'cvz-section';
    section.style.marginBottom = '32px';

    var headRow = document.createElement('div');
    headRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.style.margin = '0';
    heading.textContent = 'Was ChatGPT und Gemini über euer Angebot wissen';
    headRow.appendChild(heading);
    headRow.appendChild(makeTip(
      'Einmal im Monat fragen wir ChatGPT und Gemini, was sie über euer Unternehmen wissen und wie sie euch mit Wettbewerbern vergleichen würden. ' +
      'Die Modelle nutzen dabei auch die Websuche. Ihr seht also, was ein Nutzer heute als Antwort bekommt. ' +
      'Ob die Angaben stimmen, prüfen wir nicht. Wir zeigen nur Lücken und Widersprüche zwischen den Modellen.'
    ));
    section.appendChild(headRow);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '12px';
    sub.textContent = 'Geprüft am ' + (formatShortDate(k.checked_at) || '') + '. Abdeckung: Wie vollständig kennen die Modelle die acht wichtigsten Wissensbereiche.';
    section.appendChild(sub);

    var card = document.createElement('div');
    card.className = 'cvz-card';

    // Abdeckung je Modell
    [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini']].forEach(function (pair) {
      var pct = k.coverage ? k.coverage[pair[0]] : null;
      var prev = k.previous_coverage ? k.previous_coverage[pair[0]] : null;
      var row = document.createElement('div');
      row.className = 'cvz-journey-channel-row';
      var deltaHtml = '';
      if (pct != null && prev != null) {
        var diff = pct - prev;
        deltaHtml = '<span class="cvz-journey-channel-delta ' + (diff === 0 ? 'cvz-delta-flat' : (diff > 0 ? 'cvz-delta-up' : 'cvz-delta-down')) +
          '" title="Veränderung zur vorherigen Prüfung">' + (diff === 0 ? '\u2192 ' : (diff > 0 ? '\u25b2 ' : '\u25bc ')) + Math.abs(diff) + ' Pp</span>';
      }
      row.innerHTML =
        '<span class="cvz-journey-channel-label" style="font-weight:600;">' + pair[1] + '</span>' +
        '<div class="cvz-journey-bar-wrap"><div class="cvz-journey-bar-fill" style="width:' + (pct || 0) + '%;background:#4fd1c5"></div></div>' +
        '<span class="cvz-journey-channel-num" style="font-weight:600;">' + (pct == null ? '\u2013' : pct + '%') + '</span>' + deltaHtml;
      card.appendChild(row);
    });

    if (k.overall) {
      var overall = document.createElement('p');
      overall.className = 'cvz-summary-text';
      overall.style.margin = '12px 0 0';
      overall.textContent = k.overall;
      card.appendChild(overall);
    }
    if (k.engines_failed && k.engines_failed.length) {
      var failedNote = document.createElement('p');
      failedNote.className = 'cvz-thin-data-note';
      failedNote.textContent = 'Nicht alle Modelle konnten abgefragt werden: ' +
        k.engines_failed.map(function (e) { return e === 'chatgpt' ? 'ChatGPT' : 'Gemini'; }).join(', ') + '.';
      card.appendChild(failedNote);
    }

    // Tabelle je Wissensbereich
    var rowsHtml = (k.dimensions || []).map(function (d) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(d.label) + '</strong></td>' +
        '<td>' + knowledgeBadge(d.chatgpt) + '</td>' +
        '<td>' + knowledgeBadge(d.gemini) + '</td>' +
        '<td style="color:var(--cvz-text-muted,#8b98a5);">' + escapeHtml(d.missing || d.conflict || d.known || '') + '</td>' +
      '</tr>';
    }).join('');
    if (rowsHtml) {
      var tableWrap = document.createElement('div');
      tableWrap.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:14px;';
      tableWrap.innerHTML =
        '<table class="cvz-table" style="min-width:560px;"><thead><tr><th>Bereich</th><th>ChatGPT</th><th>Gemini</th><th>Was fehlt bzw. was bekannt ist</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table>';
      card.appendChild(tableWrap);
    }
    section.appendChild(card);

    // Fehlende Informationen für einen vollständigen Vergleich
    var blockers = k.comparison_blockers || [];
    if (blockers.length) {
      var blockLabel = document.createElement('p');
      blockLabel.className = 'cvz-changelog-guided-label';
      blockLabel.style.marginTop = '16px';
      blockLabel.textContent = 'Das fehlt für einen vollständigen Vergleich mit Wettbewerbern';
      section.appendChild(blockLabel);
      var grid = document.createElement('div');
      grid.className = 'cvz-opportunity-grid cvz-opportunity-grid-stacked';
      blockers.forEach(function (b) {
        var color = KNOWLEDGE_PRIORITY_COLORS[b.priority] || '#8b98a5';
        var c = document.createElement('div');
        c.className = 'cvz-card cvz-idea-card';
        c.style.borderLeftColor = color;
        c.innerHTML =
          '<p class="cvz-opportunity-type" style="color:' + color + ';">' + escapeHtml(b.info) + '</p>' +
          (b.why ? '<p class="cvz-opportunity-description">' + escapeHtml(b.why) + '</p>' : '') +
          (b.where_to_publish
            ? '<div class="cvz-action-recommendation"><p class="cvz-changelog-guided-label">Wo veröffentlichen</p>' +
              '<p class="cvz-opportunity-description">' + escapeHtml(b.where_to_publish) + '</p></div>'
            : '');
        var targetList = renderTargetList(b.targets);
        if (targetList) c.appendChild(targetList);
        grid.appendChild(c);
      });
      section.appendChild(grid);
    }

    // Widersprüche zwischen den Modellen
    var wrong = k.wrong_or_outdated || [];
    if (wrong.length) {
      var wrongLabel = document.createElement('p');
      wrongLabel.className = 'cvz-changelog-guided-label';
      wrongLabel.style.marginTop = '16px';
      wrongLabel.textContent = 'Widersprüchliche Angaben, bitte prüfen';
      section.appendChild(wrongLabel);
      wrong.forEach(function (w) {
        var p = document.createElement('p');
        p.className = 'cvz-opportunity-description';
        p.textContent = (w.model === 'chatgpt' ? 'ChatGPT: ' : (w.model === 'gemini' ? 'Gemini: ' : 'Beide Modelle: ')) +
          w.statement + (w.correction_hint ? ' (' + w.correction_hint + ')' : '');
        section.appendChild(p);
      });
    }

    if (k.changes_effect) {
      var eff = document.createElement('p');
      eff.className = 'cvz-summary-text';
      eff.textContent = k.changes_effect;
      section.appendChild(eff);
    }

    // Quellen, auf die sich die Modelle stützen
    if (k.sources) {
      var srcParts = [];
      [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini']].forEach(function (pair) {
        var domains = (k.sources[pair[0]] || []).map(function (s) { return s.domain; });
        var ownUsed = k.own_domain_in_sources && k.own_domain_in_sources[pair[0]];
        if (domains.length) {
          srcParts.push(pair[1] + ': ' + domains.join(', ') + (ownUsed ? ' (eure Seite ist dabei)' : ' (eure Seite ist nicht dabei)'));
        }
      });
      if (srcParts.length) {
        var src = document.createElement('p');
        src.className = 'cvz-thin-data-note';
        src.textContent = 'Quellen, auf die sich die Modelle bei dieser Prüfung stützen. ' + srcParts.join(' | ');
        section.appendChild(src);
      }
    }
    return section;
  }

  // --- Ziele für Bewertungen und Digital PR ---------------------------------
  // Backend: outreach_targets.py. Ziele stammen aus zitierten Quellen und Google-Rankings,
  // nie von Claude erfunden. Einträge mit checked === false sind Ranking-Kandidaten, deren
  // Typ noch nicht eingeordnet ist.

  function targetLink(target) {
    var href = target.url && /^https?:\/\//i.test(target.url) ? target.url : 'https://' + target.domain;
    var a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.cssText = 'font-weight:600;color:var(--cvz-teal,#4fd1c5);text-decoration:none;';
    a.textContent = target.domain;
    return a;
  }

  function renderTargetList(targets) {
    if (!Array.isArray(targets) || targets.length === 0) return null;
    var wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:10px;padding-top:8px;border-top:1px solid var(--cvz-border,#232b36);';
    var label = document.createElement('p');
    label.className = 'cvz-changelog-guided-label';
    label.style.margin = '0 0 6px';
    label.textContent = 'Mögliche Ziele';
    wrap.appendChild(label);

    targets.forEach(function (t) {
      var row = document.createElement('div');
      row.style.cssText = 'margin-bottom:8px;';
      var head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;';
      var icon = document.createElement('img');
      icon.className = 'cvz-inline-favicon';
      icon.alt = '';
      icon.src = 'https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(t.domain);
      head.appendChild(icon);
      head.appendChild(targetLink(t));
      var chips = [t.content_type_label];
      if (t.checked === false) chips.push('noch zu prüfen');
      if (t.can_publish === true) chips.push('selbst veröffentlichen möglich');
      chips.forEach(function (c) {
        if (!c) return;
        var chip = document.createElement('span');
        chip.className = 'cvz-persona-chip';
        chip.style.cursor = 'default';
        chip.textContent = c;
        head.appendChild(chip);
      });
      row.appendChild(head);
      if (t.reason) {
        var reason = document.createElement('p');
        reason.style.cssText = 'margin:2px 0 0;font-size:12px;color:var(--cvz-text-muted,#8b98a5);line-height:1.4;';
        reason.textContent = t.reason;
        row.appendChild(reason);
      }
      wrap.appendChild(row);
    });

    var note = document.createElement('p');
    note.className = 'cvz-thin-data-note';
    note.textContent = 'Kandidaten aus euren Daten. Ob dort eine Listung, Bewertung oder ein Beitrag möglich ist, ist nicht geprüft.';
    wrap.appendChild(note);
    return wrap;
  }

  var OUTREACH_GROUP_TITLES = {
    bewertungsportale: 'Bewertungsportale (für Bewertungen und Kundenstimmen)',
    medien: 'Medien und Fachartikel (für Digital PR, Gastbeiträge, Listungen)',
    community: 'Community und Video (für aktive Beteiligung)',
  };

  function renderOutreachTargetsSection(detail) {
    var o = detail.outreach_targets;
    if (!o) return null;
    var groups = o.groups || {};
    var hasAny = ['bewertungsportale', 'medien', 'community'].some(function (g) { return (groups[g] || []).length; }) ||
      (o.zu_pruefen || []).length;
    if (!hasAny) return null;

    var section = document.createElement('div');
    section.className = 'cvz-section';
    section.style.marginTop = '28px';

    var headRow = document.createElement('div');
    headRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.style.margin = '0';
    heading.textContent = 'Mögliche Ziele für Bewertungen und Digital PR';
    headRow.appendChild(heading);
    headRow.appendChild(makeTip(
      'Diese Portale, Medien und Communities werden von ChatGPT, Gemini oder Google AI Overview zu diesem Thema als Quelle genannt oder stehen in den Google-Top-10 zu euren Keywords. ' +
      'Wettbewerber, eure eigene Seite und Anbieter-Seiten sind ausgeschlossen. Ob eine Listung oder Bewertung dort möglich ist, ist nicht geprüft.'
    ));
    section.appendChild(headRow);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '12px';
    sub.textContent = 'Berechnet aus den Quellen der KI-Antworten (' + (o.prompts_gesamt || 0) + ' Prompts) und den Google-Rankings zu ' +
      (o.keywords_mit_serp || 0) + ' Keywords.' +
      (o.nicht_eingeordnet_anzahl ? ' ' + o.nicht_eingeordnet_anzahl + ' weitere zitierte Quellen sind noch nicht eingeordnet und werden mit dem nächsten Monatslauf geprüft.' : '');
    section.appendChild(sub);

    ['bewertungsportale', 'medien', 'community'].forEach(function (g) {
      var list = renderTargetList(groups[g]);
      if (!list) return;
      var card = document.createElement('div');
      card.className = 'cvz-card';
      card.style.marginBottom = '10px';
      var title = document.createElement('p');
      title.style.cssText = 'margin:0;font-size:13px;font-weight:600;';
      title.textContent = OUTREACH_GROUP_TITLES[g];
      card.appendChild(title);
      // Überschrift und Hinweis der Liste je Gruppe nicht wiederholen
      list.removeChild(list.firstChild);
      list.removeChild(list.lastChild);
      card.appendChild(list);
      section.appendChild(card);
    });

    var check = renderTargetList((o.zu_pruefen || []).map(function (t) { return Object.assign({}, t, { checked: false }); }));
    if (check) {
      var checkCard = document.createElement('div');
      checkCard.className = 'cvz-card';
      var checkTitle = document.createElement('p');
      checkTitle.style.cssText = 'margin:0;font-size:13px;font-weight:600;';
      checkTitle.textContent = 'Noch zu prüfen (ranken gut zu Keywords, Typ noch nicht eingeordnet)';
      checkCard.appendChild(checkTitle);
      check.removeChild(check.firstChild);
      checkCard.appendChild(check);
      section.appendChild(checkCard);
    }
    return section;
  }

  // --- Umgesetzte Änderungen und ihre Wirkung -----------------------------

  var VERDICT_COLORS = {
    verbessert: '#4ec68a', verschlechtert: '#de5b50', gemischt: '#c98e2a',
    unveraendert: '#c98e2a', zu_frueh: '#8b98a5', zu_wenig_daten: '#8b98a5',
  };

  function renderChangeAssessmentSection(detail) {
    var ca = detail.change_assessment;
    if (!ca || !ca.items || ca.items.length === 0) return null;

    var section = document.createElement('div');
    section.className = 'cvz-section';
    section.style.marginTop = '28px';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Bereits umgesetzt und was sich seitdem getan hat';
    section.appendChild(heading);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '12px';
    sub.textContent = 'Diese Maßnahmen empfehlen wir nicht erneut. Bewertet wird frühestens nach 4 Wochen. ' +
      'Gemessen wird ein zeitlicher Zusammenhang, kein Beweis für Ursache und Wirkung.';
    section.appendChild(sub);

    ca.items.forEach(function (it) {
      var color = VERDICT_COLORS[it.verdict] || '#8b98a5';
      var card = document.createElement('div');
      card.className = 'cvz-card';
      card.style.cssText = 'padding:12px 16px;margin-bottom:8px;border-left:3px solid ' + color + ';';
      var weeks = it.weeks_since < 1 ? 'diese Woche' : 'vor ' + it.weeks_since + (it.weeks_since === 1 ? ' Woche' : ' Wochen');
      card.innerHTML =
        '<p style="margin:0 0 4px;font-size:11px;color:var(--cvz-text-muted,#8b98a5);">' +
          escapeHtml(formatShortDate(it.date) || '') + ' (' + weeks + ') \u00b7 ' + escapeHtml(it.type_label) + '</p>' +
        '<p style="margin:0 0 6px;font-size:14px;">' + escapeHtml(it.description) +
          (it.url ? ' <a class="cvz-content-change-url" href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener">Link \u2197</a>' : '') + '</p>' +
        '<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;color:' + color +
          ';border:1px solid ' + color + ';">' + escapeHtml(it.verdict_label) + '</span>' +
        (it.evidence || []).map(function (e) {
          return '<p style="margin:6px 0 0;font-size:12px;color:var(--cvz-text-muted,#8b98a5);">' + escapeHtml(e) + '</p>';
        }).join('') +
        (it.stagnation
          ? '<p style="margin:8px 0 0;font-size:12px;color:#c98e2a;">Seit mindestens 8 Wochen umgesetzt, aber keine erkennbare Wirkung. ' +
            'Mögliche Ursachen (Vermutung): Der Inhalt ist noch nicht stark genug, es fehlen Bewertungen und Kundenstimmen, ' +
            'es fehlen Erwähnungen auf Drittseiten (Digital PR) oder die Seite ist für KI-Systeme schwer erfassbar.</p>'
          : '');
      section.appendChild(card);
    });
    return section;
  }



  function injectStyles() {
    if (document.getElementById('cvz-visibility-styles')) return;

    var style = document.createElement('style');
    style.id = 'cvz-visibility-styles';
    style.textContent =
      // Force the host page to always reserve scrollbar space so the layout
      // never shifts when content expands or collapses and a scrollbar appears.
      'html { overflow-y: scroll; }' +

      '#cvz-visibility-app {' +
        '--cvz-navy: #0d1117;' +
        '--cvz-navy-raised: #141b24;' +
        '--cvz-teal: #4fd1c5;' +
        '--cvz-red: #de5b50;' +
        '--cvz-amber: #c98e2a;' +
        '--cvz-green: #4ec68a;' +
        '--cvz-text: #e6edf3;' +
        '--cvz-text-muted: #8b98a5;' +
        '--cvz-border: #232b36;' +
        'font-family: "Geist", sans-serif;' +
        'color: var(--cvz-text);' +
        'min-height: 640px;' +
      '}' +
      '#cvz-visibility-app h3 { font-family: "Syne", sans-serif; }' +

      '@keyframes cvz-spin { to { transform: rotate(360deg); } }' +
      '.cvz-spinner {' +
        'display: inline-block; width: 14px; height: 14px; margin-right: 8px; vertical-align: middle;' +
        'border: 2px solid var(--cvz-border); border-top-color: var(--cvz-teal); border-radius: 50%;' +
        'animation: cvz-spin 0.8s linear infinite;' +
      '}' +

      '.cvz-initial-loading {' +
        'min-height: 640px; display: flex; align-items: center; justify-content: center;' +
      '}' +
      '.cvz-spinner-lg {' +
        'width: 40px; height: 40px; border: 3px solid var(--cvz-border); border-top-color: var(--cvz-teal);' +
        'border-radius: 50%; animation: cvz-spin 0.8s linear infinite;' +
      '}' +

      '.cvz-picker-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }' +
      '.cvz-picker-select {' +
        'flex: 1; min-width: 160px; max-width: 280px; box-sizing: border-box;' +
        'font-family: "Geist", sans-serif; font-size: 14px; padding: 10px 12px;' +
        'background: var(--cvz-navy-raised); color: var(--cvz-text);' +
        'border: 1px solid var(--cvz-border); border-radius: 0;' +
      '}' +
      '.cvz-picker-select:focus { outline: none; border-color: var(--cvz-teal); }' +
      '.cvz-picker-select:disabled { opacity: 0.5; cursor: default; }' +

      '.cvz-topic-usage-badge { font-size: 13px; color: var(--cvz-text-muted); margin: 0 0 16px; }' +

      '.cvz-collecting-banner {' +
        'border-left: 3px solid var(--cvz-teal); padding: 12px 16px; margin: 0 0 16px; display: flex;' +
        'align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;' +
      '}' +
      '.cvz-collecting-banner-text { font-size: 13px; color: var(--cvz-text-muted); margin: 0; flex: 1 1 320px; }' +
      '.cvz-error-banner { border-left-color: var(--cvz-red); }' +
      '.cvz-soft-error-banner { border-left-color: var(--cvz-amber); }' +
      '.cvz-run-error-detail { font-size: 12px; color: var(--cvz-text-muted); font-family: monospace; }' +

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

      '.cvz-tab-nav { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--cvz-border); margin-bottom: 20px; background: var(--cvz-navy); padding-top: 8px; }' +
      '@media (max-width: 600px) { .cvz-opp-rec-col { display: none; } .cvz-opp-rec-header { display: none; } }' +
      '.cvz-tab-btn {' +
        'font-family: "Geist", sans-serif; font-size: 14px; padding: 10px 16px; margin-bottom: -1px;' +
        'background: none; color: var(--cvz-text-muted); border: none; border-bottom: 2px solid transparent;' +
        'border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-tab-btn:hover { color: var(--cvz-text); }' +
      '.cvz-tab-btn-active { color: var(--cvz-teal); border-bottom-color: var(--cvz-teal); }' +

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
      '.cvz-archive-btn {' +
        'font-family: "Geist", sans-serif; font-size: 12px; padding: 4px 10px;' +
        'background: none; color: var(--cvz-text-muted); border: 1px solid var(--cvz-border); border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-archive-btn:hover { color: var(--cvz-text); border-color: var(--cvz-text-muted); }' +
      '.cvz-archive-btn:disabled { opacity: 0.6; cursor: default; }' +
      '.cvz-delete-topic-btn {' +
        'font-family: "Geist", sans-serif; font-size: 11px; padding: 4px 0 4px 10px;' +
        'background: none; color: var(--cvz-text-muted); border: none; text-decoration: underline; cursor: pointer;' +
      '}' +
      '.cvz-delete-topic-btn:hover { color: var(--cvz-red); }' +
      '.cvz-delete-topic-btn:disabled { opacity: 0.6; cursor: default; }' +
      '.cvz-top-action-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }' +
      '.cvz-top-action-row .cvz-back-btn { padding: 0; margin: 0; }' +
      '.cvz-archived-notice { font-size: 13px; color: var(--cvz-text-muted); margin: 0 0 8px; font-style: italic; }' +
      '.cvz-status-active { color: var(--cvz-teal); border-color: var(--cvz-teal); }' +
      '.cvz-status-collecting { color: var(--cvz-amber); border-color: var(--cvz-amber); }' +
      '.cvz-status-analyzing { color: var(--cvz-amber); border-color: var(--cvz-amber); }' +
      '.cvz-status-error { color: var(--cvz-red); border-color: var(--cvz-red); }' +
      '.cvz-status-archived { color: var(--cvz-text-muted); border-color: var(--cvz-border); }' +
      '.cvz-status-queued { color: var(--cvz-text-muted); border-color: var(--cvz-border); }' +
      '.cvz-create-info { width: 100%; font-size: 13px; color: var(--cvz-text-muted); margin: 6px 0 0; }' +
      '.cvz-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 16px; }' +
      '.cvz-modal-box { background: #141b24; border: 1px solid #232b36; border-radius: 4px; padding: 20px; max-width: 380px; width: 100%; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }' +
      '.cvz-modal-title { font-family: "Geist", sans-serif; font-size: 15px; font-weight: 600; color: var(--cvz-text-muted); margin: 0 0 8px; hyphens: auto; -webkit-hyphens: auto; -ms-hyphens: auto; overflow-wrap: break-word; }' +
      '.cvz-modal-text { font-family: "Geist", sans-serif; font-size: 13px; color: #8b98a5; margin: 0 0 20px; line-height: 1.5; }' +
      '.cvz-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }' +
      '.cvz-modal-btn { font-family: "Geist", sans-serif; font-size: 12px; padding: 6px 14px; border-radius: 0; cursor: pointer; border: 1px solid transparent; }' +
      '.cvz-modal-btn-secondary { background: none; color: #8b98a5; border-color: #232b36; }' +
      '.cvz-modal-btn-secondary:hover { color: #e6edf3; border-color: #8b98a5; }' +
      '.cvz-modal-btn-primary { background: none; color: #4fd1c5; border-color: #4fd1c5; }' +
      '.cvz-modal-btn-primary:hover { background: #4fd1c5; color: #0d1117; }' +

      '.cvz-section { margin-bottom: 24px; }' +
      // NEU (15.09.2026): Kundenwunsch — Grafiken der Übersichtsseite auf
      // Desktop kleiner und nebeneinander statt einzeln über volle Breite.
      // auto-fit/minmax fällt auf schmalen Bildschirmen automatisch auf
      // eine Spalte zurück, keine eigene Media-Query nötig. Die einzelnen
      // .cvz-section-Elemente darin behalten ihren eigenen margin-bottom
      // nicht (siehe Regel direkt darunter), das Grid-"gap" übernimmt den
      // Abstand stattdessen.
      '.cvz-charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; align-items: start; }' +
      '.cvz-charts-grid > .cvz-section { margin-bottom: 0; }' +
      '.cvz-section-label { font-size: 12px; color: var(--cvz-text-muted); margin: 0 0 8px; }' +
      '.cvz-section-title { margin: 0 0 4px; font-size: 22px; hyphens: auto; -webkit-hyphens: auto; -ms-hyphens: auto; overflow-wrap: break-word; }' +

      '.cvz-summary-card { margin-bottom: 24px; }' +
      '.cvz-ai-attribution { margin: 20px 0 0; padding-top: 12px; border-top: 1px solid var(--cvz-border); font-size: 11px; color: var(--cvz-text-muted); opacity: 0.6; }' +
      '.cvz-summary-text { font-size: 15px; line-height: 1.5; margin: 12px 0 0; color: var(--cvz-text-muted); }' +
      '.cvz-summary-subsection { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--cvz-border); }' +
      '.cvz-summary-phase-block { margin-top: 12px; }' +
      '.cvz-thin-data-note { font-size: 12px; color: var(--cvz-text-muted); font-style: italic; margin: 6px 0 0; }' +

      '.cvz-opportunity-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }' +
      '.cvz-opportunity-grid-stacked { grid-template-columns: 1fr; }' +
      '.cvz-opportunity-card { border-left: 3px solid var(--cvz-red); padding: 16px; }' +
      '.cvz-idea-card { border-left: 3px solid var(--cvz-teal); padding: 16px; }' +
      '.cvz-opportunity-type { margin: 0 0 6px; font-size: 13px; font-weight: 600; color: var(--cvz-red); }' +
      '.cvz-opportunity-description { margin: 0 0 8px; font-size: 14px; line-height: 1.4; color: var(--cvz-text-muted); }' +
      '.cvz-opportunity-topic { margin: 0; font-size: 11px; color: var(--cvz-text-muted); }' +
      '.cvz-action-recommendation { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--cvz-border); }' +
      '.cvz-competitor-prompt-list { margin: 2px 0 8px; padding-left: 16px; font-size: 12px; color: var(--cvz-text-muted); }' +
      '.cvz-competitor-prompt-list li { margin: 2px 0; }' +

      '.cvz-phase-section-heading { margin: 16px 0 8px; hyphens: auto; -webkit-hyphens: auto; -ms-hyphens: auto; overflow-wrap: break-word; }' +
      '.cvz-inline-favicon { width:16px;height:16px;border-radius:2px;vertical-align:middle;margin-right:4px;object-fit:contain; }' +
      '.cvz-gap-priority-hoch { border-left-color: var(--cvz-red); }' +
      '.cvz-gap-priority-mittel { border-left-color: var(--cvz-amber); }' +
      '.cvz-gap-priority-niedrig { border-left-color: var(--cvz-teal); }' +
      '.cvz-gap-priority-hoch .cvz-opportunity-type { color: var(--cvz-red); }' +
      '.cvz-gap-priority-mittel .cvz-opportunity-type { color: var(--cvz-amber); }' +
      '.cvz-gap-priority-niedrig .cvz-opportunity-type { color: var(--cvz-text-muted); }' +

      '.cvz-table { width: 100%; border-collapse: collapse; font-size: 14px; }' +
      '.cvz-table th { text-align: left; font-weight: 600; color: var(--cvz-text-muted); font-size: 12px; padding: 8px 12px; border-bottom: 1px solid var(--cvz-border); }' +
      '.cvz-table td { padding: 8px 12px; border-bottom: 1px solid var(--cvz-border); }' +
      '.cvz-table-clickable tbody tr { cursor: pointer; }' +
      '.cvz-table-clickable tbody tr:hover { background: rgba(79, 209, 197, 0.06); }' +
      '.cvz-gsc-page-url { color: var(--cvz-teal); font-size: 11px; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; display: inline-block; vertical-align: middle; }' +
        '.cvz-gsc-cell-url { max-width: 150px; overflow: hidden; }' +
        '.cvz-gsc-cell-linked { color: var(--cvz-teal); max-width: 280px; }' +
      '.cvz-gsc-row-clickable { cursor: pointer; }' +
      '.cvz-gsc-row-clickable:hover { background: rgba(79, 209, 197, 0.06); }' +

      '.cvz-phase-heading { font-family: "Syne", sans-serif; font-size: 14px; margin: 16px 0 8px; color: var(--cvz-text-muted); hyphens: auto; -webkit-hyphens: auto; -ms-hyphens: auto; overflow-wrap: break-word; }' +
      '.cvz-prompt-list { display: flex; flex-direction: column; gap: 4px; overflow-x: auto; -webkit-overflow-scrolling: touch; }' +
      '.cvz-prompt-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 14px; min-width: max-content; }' +
      '.cvz-prompt-text { flex: 1; min-width: 160px; color: var(--cvz-text-muted); }' +
      '.cvz-prompt-source { font-size: 11px; color: var(--cvz-text-muted); }' +
      '.cvz-prompt-citation-count { font-size: 11px; color: var(--cvz-text-muted); white-space: nowrap; }' +
      '.cvz-prompt-delete-btn {' +
        'background: none; border: none; color: var(--cvz-text-muted); font-size: 16px; line-height: 1;' +
        'cursor: pointer; padding: 0 2px; flex-shrink: 0;' +
      '}' +
      '.cvz-prompt-delete-btn:hover { color: var(--cvz-red); }' +

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
      '.cvz-prompt-run-status { font-size: 13px; margin: 0 0 10px; color: var(--cvz-text-muted); }' +
      '.cvz-prompt-answer { font-size: 13px; line-height: 1.5; margin-bottom: 14px; }' +
      '.cvz-prompt-answer h4, .cvz-prompt-answer h5 { font-size: 13px; margin: 10px 0 4px; color: var(--cvz-text-muted); }' +
      '.cvz-prompt-answer p { margin: 0 0 8px; }' +
      '.cvz-prompt-answer ul { margin: 0 0 8px; padding-left: 18px; }' +
      '.cvz-prompt-answer a { color: var(--cvz-teal); }' +
      '.cvz-prompt-source-list { display: flex; flex-direction: column; gap: 6px; }' +
      '.cvz-prompt-source-item {' +
        'display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--cvz-text-muted); text-decoration: none;' +
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

      '.cvz-phase-rollup-grid { display: flex; flex-wrap: wrap; gap: 16px; margin: 8px 0 20px; }' +
      '.cvz-phase-rollup-card { flex: 1; min-width: 140px; }' +
      '.cvz-phase-rollup-label { font-size: 13px; margin: 0 0 6px; color: var(--cvz-text-muted); }' +
      '.cvz-phase-rollup-bar { display: flex; height: 8px; width: 100%; background: var(--cvz-border); overflow: hidden; }' +
      '.cvz-phase-rollup-segment { height: 100%; }' +
      '.cvz-phase-rollup-count { font-size: 11px; margin: 4px 0 0; color: var(--cvz-text-muted); }' +

      '.cvz-persona-filter { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 16px; }' +
      '.cvz-persona-chip {' +
        'font-family: "Geist", sans-serif; font-size: 12px; padding: 4px 10px;' +
        'background: none; color: var(--cvz-text-muted); border: 1px solid var(--cvz-border); border-radius: 0; cursor: pointer;' +
      '}' +
      '.cvz-persona-chip-active { color: var(--cvz-teal); border-color: var(--cvz-teal); }' +

      '.cvz-prompt-content-type {' +
        'font-size: 11px; color: var(--cvz-amber); white-space: nowrap;' +
      '}' +
      '.cvz-prompt-persona {' +
        'font-size: 11px; color: var(--cvz-text-muted); white-space: nowrap; border-left: 1px solid var(--cvz-border); padding-left: 8px;' +
      '}' +

      '.cvz-chart-svg { width: 100%; height: auto; display: block; }' +
      '.cvz-chart-axis { stroke: var(--cvz-border); stroke-width: 1; }' +
      '.cvz-chart-line { fill: none; stroke: var(--cvz-teal); stroke-width: 2; }' +
      '.cvz-chart-dot { fill: var(--cvz-teal); }' +
      '.cvz-chart-caption { font-size: 12px; color: var(--cvz-text-muted); margin: 8px 0 0; }' +

      '.cvz-chart-legend { display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap; }' +
      '.cvz-chart-legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--cvz-text-muted); }' +
      '.cvz-legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }' +
      '.cvz-legend-marker { width: 2px; height: 10px; background: var(--cvz-text-muted); display: inline-block; }' +
      '.cvz-chart-marker-line { stroke: var(--cvz-text-muted); stroke-width: 1; stroke-dasharray: 3,3; opacity: 0.7; }' +
      '.cvz-chart-marker-dot { fill: var(--cvz-text-muted); cursor: pointer; }' +
      '.cvz-chart-hit { cursor: pointer; }' +
      '.cvz-chart-dot { cursor: pointer; }' +

      '.cvz-week-detail { margin-top: 12px; border-left: 2px solid var(--cvz-teal); }' +
      '.cvz-week-detail-header { display: flex; align-items: center; justify-content: space-between; }' +
      '.cvz-week-detail-close-btn {' +
        'background: none; border: none; color: var(--cvz-text-muted); font-size: 20px; line-height: 1; cursor: pointer; padding: 0 4px;' +
      '}' +
      '.cvz-week-detail-row { font-size: 13px; margin: 4px 0; color: var(--cvz-text-muted); }' +

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
      '.cvz-changelog-table-wrap { overflow-x: auto; margin-top: 4px; }' +
      '.cvz-changelog-table { width: 100%; border-collapse: collapse; font-size: 13px; }' +
      '.cvz-changelog-table th {' +
        'text-align: left; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em;' +
        'color: var(--cvz-text-muted); padding: 6px 10px; border-bottom: 1px solid var(--cvz-border); white-space: nowrap;' +
      '}' +
      '.cvz-changelog-table td { padding: 8px 10px; border-bottom: 1px solid var(--cvz-border); vertical-align: top; }' +
      '.cvz-changelog-cell-text { min-width: 220px; }' +
      '.cvz-changelog-cell-linked { color: var(--cvz-text-muted); white-space: nowrap; }' +
      '.cvz-delta-up { color: var(--cvz-teal); font-weight: 700; }' +
      '.cvz-delta-down { color: var(--cvz-red); font-weight: 700; }' +
      '.cvz-changelog-cell-meta { color: var(--cvz-text-muted); white-space: nowrap; }' +
      '.cvz-changelog-cell-action { text-align: right; white-space: nowrap; }' +
      '.cvz-changelog-row-deleted td { opacity: 0.75; }' +
      '.cvz-changelog-guided-label { font-size: 12px; color: var(--cvz-text-muted); margin: 10px 0 4px; }' +
      '.cvz-changelog-custom-input {' +
        'display: block; width: 100%; max-width: 320px; margin: 6px 0 0;' +
        'font-family: "Geist", sans-serif; font-size: 13px; padding: 6px 8px;' +
        'background: var(--cvz-navy-raised); color: var(--cvz-text); border: 1px solid var(--cvz-border); border-radius: 0;' +
      '}' +
      '.cvz-changelog-link-picker { margin: 10px 0; }' +
      '.cvz-changelog-link-chip-list { margin-top: 8px; }' +
      '.cvz-changelog-linked { font-size: 11px; color: var(--cvz-text-muted); margin: 2px 0; }' +
      '.cvz-changelog-linked-badge { color: var(--cvz-text-muted); font-size: 12px; }' +
      '.cvz-prompt-linked-changelog { margin: 0 0 12px; }' +
      '.cvz-serp-results-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }' +
      '.cvz-serp-results-list li { display: flex; align-items: center; gap: 6px; font-size: 12px; }' +
      '.cvz-serp-results-list a { color: var(--cvz-text-muted); text-decoration: none; }' +
      '.cvz-serp-results-list a:hover { color: var(--cvz-teal); }' +
      '.cvz-serp-rank { color: var(--cvz-text-muted); font-size: 11px; }' +
      '.cvz-serp-feature-risk { color: var(--cvz-red); border-color: var(--cvz-red); }' +
      '.cvz-changelog-delete-btn {' +
        'background: none; border: none; color: var(--cvz-text-muted); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px; flex-shrink: 0;' +
      '}' +
      '.cvz-changelog-delete-btn:hover { color: var(--cvz-red); }' +
      '.cvz-changelog-toggle-deleted-btn {' +
        'margin-top: 14px; font-family: "Geist", sans-serif; font-size: 12px; padding: 4px 0;' +
        'background: none; color: var(--cvz-text-muted); border: none; text-decoration: underline; cursor: pointer;' +
      '}' +
      '.cvz-changelog-restore-btn {' +
        'font-family: "Geist", sans-serif; font-size: 11px; padding: 3px 10px; flex-shrink: 0;' +
        'background: none; color: var(--cvz-teal); border: 1px solid var(--cvz-teal); border-radius: 0; cursor: pointer;' +
      '}' +

      /* NEU (16.09.2026): Journey-Map-Tab */
      '.cvz-journey-phase-grid {' +
        'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 4px;' +
      '}' +
      '.cvz-journey-phase-card {' +
        'background: var(--cvz-navy-raised); border: 1px solid var(--cvz-border); border-top: 3px solid; padding: 16px;' +
      '}' +
      '.cvz-journey-phase-name {' +
        'font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 12px;' +
      '}' +
      '.cvz-journey-channel-row {' +
        'display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px;' +
      '}' +
      '.cvz-journey-channel-label {' +
        'flex: 0 0 120px; color: var(--cvz-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' +
      '}' +
      '.cvz-journey-bar-wrap {' +
        'flex: 1; height: 6px; background: var(--cvz-border); border-radius: 3px; overflow: hidden;' +
      '}' +
      '.cvz-journey-bar-fill {' +
        'height: 100%; border-radius: 3px; transition: width 0.3s ease;' +
      '}' +
      '.cvz-journey-channel-num {' +
        'flex: 0 0 32px; text-align: right; font-size: 11px; color: var(--cvz-text-muted); font-variant-numeric: tabular-nums;' +
      '}' +

      // NEU (18.09.2026): Delta-Badge im Phasen-Score-Grid, siehe Chat-Verlauf
      // 18.09.2026 ("prozentuale Entwicklung pro Journey-Phase").
      '.cvz-journey-channel-delta {' +
        'flex: 0 0 auto; font-size: 10px; font-weight: 600; margin-left: 4px; padding: 1px 5px; border-radius: 3px; white-space: nowrap;' +
      '}' +
      '.cvz-delta-up { color: var(--cvz-teal); background: rgba(13,148,136,0.12); }' +
      '.cvz-delta-down { color: var(--cvz-red); background: rgba(222,91,80,0.12); }' +
      '.cvz-delta-flat { color: var(--cvz-text-muted); background: rgba(139,152,165,0.12); }' +

      '.cvz-sov-phase-block { margin-bottom: 8px; border: 1px solid var(--cvz-border); }' +
      '.cvz-sov-phase-header {' +
        'width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 16px;' +
        'background: var(--cvz-navy-raised); border: none; color: var(--cvz-text); cursor: pointer; text-align: left;' +
        'font-family: "Geist", sans-serif; font-size: 14px;' +
      '}' +
      '.cvz-sov-phase-header:hover { background: var(--cvz-navy); }' +
      '.cvz-sov-phase-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }' +
      '.cvz-sov-phase-title { font-weight: 600; flex: 1; hyphens: auto; -webkit-hyphens: auto; -ms-hyphens: auto; overflow-wrap: break-word; }' +
      '.cvz-sov-phase-count { font-size: 12px; color: var(--cvz-text-muted); }' +
      '.cvz-sov-chevron { font-size: 11px; color: var(--cvz-text-muted); }' +
      '.cvz-sov-table { width: 100%; min-width: 640px; border-collapse: collapse; font-size: 13px; }' +
      '.cvz-sov-table th {' +
        'text-align: left; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em;' +
        'color: var(--cvz-text-muted); padding: 8px 16px; border-bottom: 1px solid var(--cvz-border);' +
      '}' +
      '.cvz-sov-table td { padding: 10px 16px; border-bottom: 1px solid var(--cvz-border); vertical-align: top; }' +
      '.cvz-sov-table tr:last-child td { border-bottom: none; }' +
      '.cvz-sov-domain { font-weight: 500; }' +
      '.cvz-sov-rate { display: flex; align-items: center; gap: 8px; white-space: nowrap; }' +
      '.cvz-sov-bar-wrap { width: 80px; flex-shrink: 0; }' +
      '.cvz-sov-tip { color: var(--cvz-text-muted); max-width: 300px; }' +

      '.cvz-content-change-form { margin-bottom: 12px; }' +
      '.cvz-content-change-fields {' +
        'display: flex; gap: 8px; flex-wrap: wrap; align-items: center;' +
      '}' +
      '.cvz-content-change-type-select {' +
        'flex: 0 0 160px; min-width: 140px; max-width: 160px;' +
      '}' +
      '.cvz-content-change-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }' +
      '.cvz-content-change-linked { display:block;margin-top:3px;font-size:11px;color:var(--cvz-text-muted,#8b98a5);font-style:italic; }' +
      '.cvz-content-change-item {' +
        'display: flex; align-items: baseline; gap: 10px; padding: 10px 0;' +
        'border-bottom: 1px solid var(--cvz-border); flex-wrap: wrap; font-size: 13px;' +
      '}' +
      '.cvz-content-change-date {' +
        'flex: 0 0 auto; color: var(--cvz-text-muted); font-size: 12px; font-variant-numeric: tabular-nums;' +
      '}' +
      '.cvz-content-change-desc { flex: 1; min-width: 140px; }' +
      '.cvz-content-change-url {' +
        'color: var(--cvz-teal); font-size: 12px; text-decoration: none; white-space: nowrap;' +
      '}' +
      '.cvz-content-change-url:hover { text-decoration: underline; }' +
      '.cvz-prompt-phase-heading {font-family: "Syne", sans-serif; font-size: 13px; margin: 16px 0 6px; padding-left: 8px; border-left: 3px solid var(--cvz-teal); color: var(--cvz-text-muted); hyphens: auto; -webkit-hyphens: auto; -ms-hyphens: auto; overflow-wrap: break-word; }' +
      '.cvz-prompt-source-summary {font-size: 12px; color: var(--cvz-text-muted); margin-bottom: 8px; padding: 5px 8px; background: var(--cvz-navy-raised); border-radius: 4px; font-variant-numeric: tabular-nums; }' +
      '.cvz-competitor-url-row { overflow: hidden; white-space: nowrap; max-width: 100%; }' +
      '.cvz-competitor-url {display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cvz-teal); font-size: 12px; text-decoration: none; max-width: 100%; }' +
      '.cvz-competitor-url:hover { text-decoration: underline; }' +

      /* Tooltip-Komponente: [?] Icon mit Hover-Popup */
      '.cvz-tip {' +
        'position:relative;display:inline-block;' +
        'font-size:11px;font-weight:700;line-height:1;' +
        'width:16px;height:16px;text-align:center;' +
        'border-radius:50%;border:1px solid var(--cvz-border,#232b36);' +
        'color:var(--cvz-text-muted,#8b98a5);background:var(--cvz-navy-raised,#141b24);' +
        'cursor:default;vertical-align:middle;margin-left:5px;flex-shrink:0;' +
        'user-select:none;' +
      '}' +
      '.cvz-tip::after {' +
        'content:attr(data-cvz-tip);' +
        'position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);' +
        'min-width:200px;max-width:280px;' +
        'padding:8px 10px;' +
        'background:#1e2a36;border:1px solid var(--cvz-border,#232b36);border-radius:4px;' +
        'font-size:12px;font-weight:400;line-height:1.5;' +
        'color:var(--cvz-text,#e6edf3);text-align:left;white-space:normal;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.4);' +
        'pointer-events:none;opacity:0;transition:opacity .15s ease;' +
        'z-index:1000;' +
      '}' +
      '.cvz-tip:hover::after { opacity:1; }' +
      /* Pfeil nach unten zeigend */
      '.cvz-tip::before {' +
        'content:"";' +
        'position:absolute;bottom:calc(100% + 2px);left:50%;transform:translateX(-50%);' +
        'border:5px solid transparent;border-top:5px solid var(--cvz-border,#232b36);' +
        'pointer-events:none;opacity:0;transition:opacity .15s ease;z-index:1001;' +
      '}' +
      '.cvz-tip:hover::before { opacity:1; }' +
      /* Variante: Tooltip öffnet sich nach rechts (für Elemente am linken Rand) */
      '.cvz-tip-right::after {' +
        'left:calc(100% + 8px);bottom:auto;top:50%;transform:translateY(-50%);' +
      '}' +
      '.cvz-tip-right::before {' +
        'left:calc(100% + 0px);bottom:auto;top:50%;transform:translateY(-50%);' +
        'border:5px solid transparent;border-right:5px solid var(--cvz-border,#232b36);border-top:none;' +
      '}';

    document.head.appendChild(style);
  }

  function renderInitialLoadingState() {
    var container = document.getElementById('cvz-visibility-app');
    if (!container) return;
    container.innerHTML =
      '<div class="cvz-initial-loading">' +
        '<div class="cvz-spinner-lg" role="status" aria-label="Convertlyze Visibility Tracker lädt"></div>' +
      '</div>';
  }

  function showNoUserMessage() {
    var container = document.getElementById('cvz-visibility-app');
    if (container) {
      container.innerHTML =
        '<div class="cvz-initial-loading"><p class="cvz-card-placeholder-text">Bitte logge dich ein, um das Dashboard zu sehen.</p></div>';
    }
  }

  function showErrorMessage(message) {
    var container = document.getElementById('cvz-visibility-app');
    if (container) {
      container.innerHTML =
        '<div class="cvz-initial-loading"><p class="cvz-card-placeholder-text">' + escapeHtml(message) + '</p></div>';
    }
  }

  // =========================================================================
  // NEU (16.09.2026): 4 NEUE HAUPT-VIEWS
  // =========================================================================

  // ─── SITUATION ────────────────────────────────────────────────────────────
  // Schnell-Übersicht: Wo stehen wir in jeder Phase + Top-Chancen auf einen
  // Blick. Ziel: Marketer bekommt in 30 Sekunden das Wichtigste.
  // NEU (16.09.2026): interne Fehlermeldungen aus main.py (z.B.
  // "[generate_summary] Claude-Antwort war kein valides JSON") nutzerfreundlich
  // aufbereiten, bevor sie im Frontend angezeigt werden. Rohe Step-Namen und
  // technische Detail-Strings sollen nicht beim Endnutzer ankommen.
  function sanitizeRunError(raw) {
    if (!raw) return '';
    // Internen Step-Namen "[step_name] " am Anfang entfernen
    var cleaned = raw.replace(/^\[[^\]]+\]\s*/, '');
    // Bekannte technische Muster auf nutzerfreundliche Texte mappen
    var MAP = [
      ['kein valides JSON', 'Analyse konnte nicht vollständig abgeschlossen werden. Beim nächsten Lauf wird es erneut versucht.'],
      ['Claude-API-Fehler', 'Claude-API vorübergehend nicht erreichbar. Beim nächsten Lauf wird es erneut versucht.'],
      ['timeout', 'Zeitüberschreitung beim Analyse-Lauf. Beim nächsten Lauf wird es erneut versucht.'],
      ['connection', 'Verbindungsproblem beim Analyse-Lauf. Beim nächsten Lauf wird es erneut versucht.'],
    ];
    for (var i = 0; i < MAP.length; i++) {
      if (cleaned.toLowerCase().indexOf(MAP[i][0].toLowerCase()) !== -1) return MAP[i][1];
    }
    return cleaned;
  }

  // --- VISIBILITY COMPARISON CHART ---
  // Zeigt per Liniendiagramm: eigene Zitierrate pro Journey-Phase vs. Top-5-Wettbewerber.
  // X-Achse = 4 Journey-Phasen, Y-Achse = Zitierrate 0-100 %.
  function renderVisibilityComparisonChart(topicId, detail) {
    var dashData = state.dashboardDataCache[topicId];
    if (!dashData || dashData._error || !dashData.phase_scores) return null;

    var sov = dashData.share_of_voice || {};

    // Top-5-Wettbewerber: Summe der citation_rate ueber alle Phasen
    var compTotals = {};
    PHASE_ORDER.forEach(function (phase) {
      (sov[phase] || []).forEach(function (c) {
        if (c.domain) compTotals[c.domain] = (compTotals[c.domain] || 0) + (c.citation_rate || 0);
      });
    });
    var topComps = Object.keys(compTotals)
      .sort(function (a, b) { return compTotals[b] - compTotals[a]; })
      .slice(0, 5);

    // (Show chart even without competitor data, just own domain)

    // NEU (17.09.2026): Gepinnte Wettbewerber aus localStorage laden
    var _pinnedKey = 'cvz_chart_pins_' + topicId;
    var pinnedComps = [];
    try { pinnedComps = JSON.parse(localStorage.getItem(_pinnedKey) || '[]'); } catch (e) { pinnedComps = []; }
    // Nur Domains anzeigen, die nicht bereits unter den Auto-Top-5 sind (max. 3)
    var extraComps = pinnedComps.filter(function (d) { return topComps.indexOf(d) === -1; }).slice(0, 3);

    // 5 Auto-Farben + 3 Extra-Farben fuer gepinnte Wettbewerber
    var COMP_COLORS = ['#c98e2a', '#de5b50', '#8878ca', '#4ec68a', '#5aacd2', '#e8855b', '#a3c97a', '#c97ab5'];
    var ownDomain = (detail.topic && detail.topic.own_domain) ? detail.topic.own_domain : 'Eure Domain';

    var section = document.createElement('div');
    section.className = 'cvz-section';
    section.style.marginTop = '24px';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Sichtbarkeit im Wettbewerbsvergleich';
    section.appendChild(heading);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '14px';
    sub.textContent = 'Wer wird in welcher Journey-Phase von KI-Systemen zitiert? Eigene Domain vs. alle tats\u00e4chlich zitierten Domains (Zitierrate in %). ';
    section.appendChild(sub);

    // Favicon-Hilfsfunktion
    function _faviconImg(domain) {
      var img = document.createElement('img');
      img.src = 'https://www.google.com/s2/favicons?sz=16&domain=' + encodeURIComponent(domain);
      img.style.cssText = 'width:14px;height:14px;flex-shrink:0;border-radius:2px;';
      img.onerror = function () { this.style.display = 'none'; };
      return img;
    }

    // Legende
    var legend = document.createElement('div');
    legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;';

    function _legendItem(label, color, own, domain) {
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;' +
        (own ? 'color:var(--cvz-text,#e6edf3);font-weight:600;' : 'color:var(--cvz-text-muted,#8b98a5);');
      var swatch = document.createElement('span');
      swatch.style.cssText = 'width:24px;height:3px;border-radius:2px;background:' + color + ';flex-shrink:0;' + (own ? '' : 'opacity:.75;');
      item.appendChild(swatch);
      if (domain) item.appendChild(_faviconImg(domain));
      item.appendChild(document.createTextNode(label));
      return item;
    }

    function _legendItemDashed(label, color, domain) {
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;color:var(--cvz-text-muted,#8b98a5);';
      var swatch = document.createElement('span');
      swatch.style.cssText =
        'width:24px;height:3px;border-radius:2px;flex-shrink:0;opacity:.7;' +
        'background:repeating-linear-gradient(90deg,' + color + ' 0,' + color + ' 5px,transparent 5px,transparent 9px);';
      item.appendChild(swatch);
      if (domain) item.appendChild(_faviconImg(domain));
      item.appendChild(document.createTextNode(label));
      return item;
    }

    legend.appendChild(_legendItem(ownDomain, '#4fd1c5', true, ownDomain));
    topComps.forEach(function (domain, i) {
      legend.appendChild(_legendItem(domain, COMP_COLORS[i], false, domain));
    });
    extraComps.forEach(function (domain, i) {
      legend.appendChild(_legendItemDashed(domain, COMP_COLORS[5 + i], domain));
    });
    section.appendChild(legend);

    // Datenpunkte aufbauen
    var SVG_W = 580, SVG_P = 32;

    // Nur Phasen mit tatsaechlichen Daten als X-Achse zeigen.
    // Phasen ohne Laeufe (total=0 fuer alle Kanaele UND kein Wettbewerber) werden ausgeblendet.
    var PHASE_LABEL_MAP = { exploration: 'Exploration', evaluation: 'Evaluation', comparison: 'Vergleich', decision: 'Entscheidung' };
    var activePhases = PHASE_ORDER.filter(function (phase) {
      var scores = dashData.phase_scores[phase] || {};
      var hasOwnData = CHANNEL_ORDER.some(function (ch) { var s = scores[ch]; return s && s.total > 0; });
      var hasCompData = (sov[phase] || []).length > 0;
      return hasOwnData || hasCompData;
    });

    // Wenn keine Phase Daten hat: Platzhalter statt leerem Chart
    if (activePhases.length === 0) {
      var noDataMsg = document.createElement('p');
      noDataMsg.className = 'cvz-card-placeholder-text';
      noDataMsg.style.cssText = 'margin-top:8px;font-style:italic;';
      noDataMsg.textContent = 'Noch keine Vergleichsdaten vorhanden. Der Chart erscheint, sobald die erste Analyse abgeschlossen ist.';
      section.appendChild(noDataMsg);
      return section;
    }

    var xLabels = activePhases.map(function (p) { return PHASE_LABEL_MAP[p] || p; });

    // Eigene Zitierrate: Durchschnitt ueber Kanaele mit Daten (null fuer inaktive Phasen)
    var ownValues = activePhases.map(function (phase) {
      var scores = dashData.phase_scores[phase] || {};
      var total = 0, count = 0;
      CHANNEL_ORDER.forEach(function (ch) {
        var s = scores[ch];
        if (s && s.total > 0) { total += (s.score || 0); count++; }
      });
      return count > 0 ? Math.round(total / count) : 0;
    });

    var seriesList = [{ label: ownDomain, color: '#4fd1c5', values: ownValues }];

    // Wettbewerber-Zitierraten pro aktiver Phase
    topComps.forEach(function (domain, i) {
      var values = activePhases.map(function (phase) {
        var entry = (sov[phase] || []).filter(function (c) { return c.domain === domain; })[0];
        return entry ? Math.round(entry.citation_rate || 0) : 0;
      });
      seriesList.push({ label: domain, color: COMP_COLORS[i], values: values });
    });
    // NEU (17.09.2026): Gepinnte Extra-Wettbewerber (gestrichelte Linien)
    extraComps.forEach(function (domain, i) {
      var values = activePhases.map(function (phase) {
        var entry = (sov[phase] || []).filter(function (c) { return c.domain === domain; })[0];
        return entry ? Math.round(entry.citation_rate || 0) : 0;
      });
      seriesList.push({ label: domain, color: COMP_COLORS[5 + i], values: values, dashed: true });
    });

    // Chart-Karte
    var chartCard = document.createElement('div');
    chartCard.className = 'cvz-card';
    chartCard.style.cssText = 'padding:16px 18px;';

    // SVG einbetten
    var svgWrap = document.createElement('div');
    svgWrap.style.cssText = 'position:relative;';
    svgWrap.innerHTML = buildLineChartSvg(seriesList, xLabels, { maxY: 100, height: 200, width: SVG_W });
    var svgNode = svgWrap.querySelector('svg');
    if (svgNode) {
      svgNode.style.cssText = 'width:100%;display:block;';
      svgNode.removeAttribute('width');
      svgNode.removeAttribute('height');
    }

    // X-Achsen-Labels: als absolut positionierte Spans unter dem SVG
    // Die Chart-Punkte liegen bei x = SVG_P + i * stepX (in SVG-Koordinaten)
    // => als % von SVG_W gibt das die korrekte Position im responsiven SVG.
    var stepX = xLabels.length > 1 ? (SVG_W - SVG_P * 2) / (xLabels.length - 1) : 0;
    var labelRow = document.createElement('div');
    labelRow.style.cssText = 'position:relative;height:18px;margin-top:3px;';
    xLabels.forEach(function (lbl, i) {
      var pct = ((SVG_P + i * stepX) / SVG_W * 100).toFixed(2) + '%';
      var el = document.createElement('span');
      el.style.cssText =
        'position:absolute;left:' + pct + ';transform:translateX(-50%);' +
        'font-size:10px;color:var(--cvz-text-muted,#8b98a5);white-space:nowrap;';
      el.textContent = lbl;
      labelRow.appendChild(el);
    });
    svgWrap.appendChild(labelRow);

    chartCard.appendChild(svgWrap);
    section.appendChild(chartCard);

    // NEU (17.09.2026): Pin-Verwaltungs-UI unter dem Chart
    var pinWrap = document.createElement('div');
    pinWrap.style.cssText = 'margin-top:12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;';

    var pinLabel = document.createElement('span');
    pinLabel.style.cssText = 'font-size:11px;color:var(--cvz-text-muted,#8b98a5);flex-shrink:0;';
    pinLabel.textContent = 'Weitere Wettbewerber:';
    pinWrap.appendChild(pinLabel);

    // Alle bekannten Domains aus sov (ausser ownDomain und top-5) fuer Autocomplete
    var _knownDomains = [];
    PHASE_ORDER.forEach(function (phase) {
      (sov[phase] || []).forEach(function (c) {
        if (c.domain && c.domain !== ownDomain && topComps.indexOf(c.domain) === -1 && _knownDomains.indexOf(c.domain) === -1) {
          _knownDomains.push(c.domain);
        }
      });
    });
    _knownDomains.sort();

    function _rebuildPinUi() {
      while (pinWrap.firstChild) pinWrap.removeChild(pinWrap.firstChild);
      pinWrap.appendChild(pinLabel);

      try { pinnedComps = JSON.parse(localStorage.getItem(_pinnedKey) || '[]'); } catch (e) { pinnedComps = []; }
      var currentExtra = pinnedComps.filter(function (d) { return topComps.indexOf(d) === -1; }).slice(0, 3);

      currentExtra.forEach(function (domain) {
        var chip = document.createElement('span');
        chip.style.cssText =
          'display:inline-flex;align-items:center;gap:4px;padding:2px 6px 2px 5px;' +
          'border-radius:20px;border:1px dashed var(--cvz-border,#30363d);' +
          'font-size:11px;color:var(--cvz-text-muted,#8b98a5);background:var(--cvz-card-bg,#161b22);';
        chip.appendChild(_faviconImg(domain));
        chip.appendChild(document.createTextNode(domain));
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.style.cssText =
          'background:none;border:none;padding:0 0 0 3px;cursor:pointer;line-height:1;' +
          'font-size:12px;color:var(--cvz-text-muted,#8b98a5);';
        rm.textContent = '✕';
        rm.title = 'Entfernen';
        rm.onclick = function () {
          try {
            var arr = JSON.parse(localStorage.getItem(_pinnedKey) || '[]');
            arr = arr.filter(function (d) { return d !== domain; });
            localStorage.setItem(_pinnedKey, JSON.stringify(arr));
          } catch (e) {}
          render();
        };
        chip.appendChild(rm);
        pinWrap.appendChild(chip);
      });

      if (currentExtra.length < 3) {
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.style.cssText =
          'display:inline-flex;align-items:center;gap:3px;padding:2px 8px;' +
          'border-radius:20px;border:1px dashed var(--cvz-border,#30363d);' +
          'font-size:11px;color:var(--cvz-text-muted,#8b98a5);background:none;cursor:pointer;';
        addBtn.textContent = '+ Wettbewerber hinzufügen';
        addBtn.onclick = function () {
          pinWrap.removeChild(addBtn);

          var datalistId = 'cvz-pin-dl-' + topicId;
          if (!document.getElementById(datalistId)) {
            var dl = document.createElement('datalist');
            dl.id = datalistId;
            _knownDomains.forEach(function (d) {
              var opt = document.createElement('option');
              opt.value = d;
              dl.appendChild(opt);
            });
            pinWrap.appendChild(dl);
          }

          var inp = document.createElement('input');
          inp.type = 'text';
          inp.placeholder = 'domain.com';
          inp.setAttribute('list', datalistId);
          inp.style.cssText =
            'font-size:11px;padding:2px 8px;border-radius:20px;' +
            'border:1px solid var(--cvz-border,#30363d);background:var(--cvz-card-bg,#161b22);' +
            'color:var(--cvz-text,#e6edf3);outline:none;width:145px;';

          var okBtn = document.createElement('button');
          okBtn.type = 'button';
          okBtn.textContent = '✓';
          okBtn.style.cssText =
            'padding:2px 7px;border-radius:4px;border:none;background:var(--cvz-accent,#4fd1c5);' +
            'color:#000;font-size:11px;cursor:pointer;';

          function _commit() {
            var val = inp.value.trim().toLowerCase()
              .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
            if (!val) { _rebuildPinUi(); return; }
            try {
              var arr = JSON.parse(localStorage.getItem(_pinnedKey) || '[]');
              var extra = arr.filter(function (d) { return topComps.indexOf(d) === -1; });
              if (arr.indexOf(val) === -1 && extra.length < 3) arr.push(val);
              localStorage.setItem(_pinnedKey, JSON.stringify(arr));
            } catch (e) {}
            render();
          }

          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); _commit(); }
            if (e.key === 'Escape') { _rebuildPinUi(); }
          });
          okBtn.onclick = _commit;

          pinWrap.appendChild(inp);
          pinWrap.appendChild(okBtn);
          inp.focus();
        };
        pinWrap.appendChild(addBtn);
      }
    }

    _rebuildPinUi();
    section.appendChild(pinWrap);

    return section;
  }

  function renderSituationTab(topicId, detail) {
    var wrap = document.createElement('div');

    // NEU (20.09.2026): Hinweis + Retry-Button für Schritte, die hier auf
    // dieser Seite auftauchen (Zusammenfassung, Handlungsfelder,
    // KI-Wissens-Check) und fehlgeschlagen sind, fehlen oder gerade laufen.
    var situationStepNotice = renderStepNotice(detail, ['summary', 'opportunities', 'ai_knowledge']);
    if (situationStepNotice) wrap.appendChild(situationStepNotice);

    // Phase-Score-Übersicht (Dashboard-Daten, falls geladen)
    // dashData === { _error: true }  → Ladefehler, einmalig gespeichert damit kein Endlos-Retry
    // dashData === undefined          → noch nicht geladen (kommt nie hier an, da maybeLoad vorher)
    var dashData = state.dashboardDataCache[topicId];
    var dashError = dashData && dashData._error;
    if (state.isLoadingDashboard) {
      var loadEl = document.createElement('p');
      loadEl.className = 'cvz-card-placeholder-text';
      loadEl.innerHTML = '<span class="cvz-spinner"></span>KI-Sichtbarkeit wird geladen…';
      wrap.appendChild(loadEl);
    } else if (dashError) {
      var errEl = document.createElement('p');
      errEl.className = 'cvz-card-placeholder-text';
      errEl.style.cssText = 'margin-bottom:12px;';
      errEl.innerHTML =
        'KI-Sichtbarkeitsdaten konnten nicht geladen werden. ' +
        '<button type="button" data-cvz-journey-retry="' + escapeHtml(topicId) + '" ' +
        'class="cvz-link-btn" style="font-size:inherit;">Erneut versuchen</button>';
      wrap.appendChild(errEl);
    } else if (!dashData || dashError) {
      // Fallback: Phasen-Rollup aus den Prompts des Topic-Detaildatensatzes
      var rollup = renderPhaseRollup(detail.prompts);
      if (rollup) wrap.appendChild(rollup);
    }
    // GEÄNDERT (20.09.2026): Die kompakte Phasen-Scorecard, die hier stand,
    // ist entfernt — sie zeigte dieselbe Kennzahl (Zitierrate pro Phase inkl.
    // Top-Wettbewerber) doppelt: einmal hier als Karten, direkt darunter noch
    // einmal als vollständiger Chart (Wettbewerbsvergleich). Die identische
    // Karten-Variante gab es außerdem nochmal im Journey-Map-Tab. Diese
    // zweite Version bleibt dort (inkl. Kanal-Aufschlüsselung), hier reicht
    // der Chart als einzige Quelle für "Zitierrate pro Phase".

    // Wettbewerbs-Sichtbarkeitsvergleich (Chart)
    var compChart = renderVisibilityComparisonChart(topicId, detail);
    if (compChart) wrap.appendChild(compChart);

    // VERSCHOBEN (20.09.2026): Die Wettbewerber-Tabelle mit Differenzierungs-
    // Tipps pro Phase stand bisher nur im Journey-Map-Tab, war dort aber
    // eingeklappt und stand hinter mehreren anderen Abschnitten — für eine
    // so wichtige Analyse zu gut versteckt. Sie steht jetzt direkt hier,
    // gleich hinter dem Wettbewerbsvergleich, im ersten Tab.
    wrap.appendChild(renderJourneyShareOfVoice(dashData && dashData.share_of_voice));

    // Beste Content-Chancen
    var bestChances = renderBestContentChancesSection(detail.best_content_chances);
    if (bestChances) wrap.appendChild(bestChances);

    // Top Opportunities (max 3, kompakt)
    var openOpps = (detail.opportunities || []).filter(function (o) {
      return o.status === 'new' || o.status === 'reviewed';
    });
    if (openOpps.length > 0) {
      var oppSection = document.createElement('div');
      oppSection.className = 'cvz-section';

      // Heading mit Tooltip
      var oppHeadRow = document.createElement('div');
      oppHeadRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
      var oppHeading = document.createElement('p');
      oppHeading.className = 'cvz-section-label';
      oppHeading.style.margin = '0';
      oppHeading.textContent = 'Wichtigste Handlungsfelder';
      oppHeadRow.appendChild(oppHeading);
      oppHeadRow.appendChild(makeTip(
        'Das System erkennt automatisch Chancen aus deinen KI-Sichtbarkeits- und GSC-Daten: wo du fast rankst, wo Konkurrenten dich verdrängen, wo neue Fragen auftauchen. Jede Zeile aufklappen, um die konkreten Keywords oder Domains dahinter zu sehen.'
      ));
      oppSection.appendChild(oppHeadRow);

      // Subtitle
      var oppSub = document.createElement('p');
      oppSub.className = 'cvz-card-placeholder-text';
      oppSub.style.marginBottom = '14px';
      oppSub.textContent = 'Automatisch erkannte Chancen auf Basis eurer KI-Sichtbarkeits- und GSC-Daten, sortiert nach Priorität. Konkrete Umsetzungsempfehlungen im Aktionsplan-Tab.';
      oppSection.appendChild(oppSub);

      // Sort by priority
      var PRIORITY_ORDER = [
        'near_miss_ranking', 'high_demand_low_visibility',
        'google_visible_ai_invisible', 'competitor_citation',
        'ai_visible_competitor_dominates', 'new_question',
      ];
      var sortedOpps = openOpps.slice().sort(function (a, b) {
        return PRIORITY_ORDER.indexOf(a.opportunity_type) - PRIORITY_ORDER.indexOf(b.opportunity_type);
      });

      // Fallback-Empfehlungen pro Opportunity-Typ (wenn content_recommendation noch leer)
      var OPP_FALLBACK_RECOMMENDATION = {
        'near_miss_ranking': 'Content gezielt auf diese Keywords optimieren: Meta-Title/H1 schärfen, Suchintention prüfen (informationell vs. transaktional), interne Verlinkung stärken. Ziel: von Position 20+ in die Top 10.',
        'high_demand_low_visibility': 'Dedizierten Content für diese Keywords erstellen oder bestehende Seiten ausbauen. Format: FAQ, Ratgeber oder Vergleichsseite je nach Suchintention.',
        'google_visible_ai_invisible': 'Bestehende Seiten so ausbauen, dass KI-Systeme sie als zitierwürdige Quelle einordnen: klare Autorenschaft, konkrete Aussagen mit Zahlen, strukturierte Antworten auf die Fragen hinter dem Keyword.',
        'competitor_citation': 'Analysieren, welche Inhalte die häufig zitierten Domains zu diesem Thema haben, und ähnliche Inhalte mit klarer Differenzierung erstellen (eigene Daten, Expertise, Perspektive).',
        'ai_visible_competitor_dominates': 'Eigene Leitseite zum Thema erstellen: strukturierte Antwort auf die Top-Fragen, mit nachprüfbaren Fakten und klarer Autorenschaft, damit KI-Systeme sie als Alternative zitieren.',
        'new_question': 'Diese neuen Suchintentionen frühzeitig besetzen: dedizierten Content erstellen, bevor der Wettbewerb aufholt. FAQ-Block oder eigenständige Seite je nach Volumen.',
      };

      // Erklaerungstexte fuer die Typ-Chips (werden als Tooltip am Chip angezeigt)
      var OPP_TYPE_TOOLTIPS = {
        'near_miss_ranking': 'Ihr ranktet schon auf Seite 2 für dieses Keyword (Position 20+, mind. 50 Impressionen). Kleine SEO-Hebel können hier schnell auf Seite 1 bringen.',
        'high_demand_low_visibility': 'Dieses Keyword hat viel Suchvolumen, aber ihr seid weder in Google noch in KI-Antworten sichtbar. Großes Potenzial, noch kein Fuß in der Tür.',
        'google_visible_ai_invisible': 'Ihr ranktet gut in Google, aber KI-Systeme wie ChatGPT zitieren euch nicht. Bestehender Content muss "KI-tauglicher" werden.',
        'competitor_citation': 'Eine konkrete Wettbewerber-Domain wird regelmäßig an eurer Stelle zitiert. Hier lohnt sich ein direkter Inhaltsvergleich.',
        'ai_visible_competitor_dominates': 'KI-Systeme zitieren euch zwar, aber ein Wettbewerber deutlich häufiger. Eure Positionierung oder Tiefe reicht noch nicht aus.',
        'new_question': 'Neue Fragen, die in KI-Prompts auftauchen und die ihr noch nicht beantwortet. Frühzeitig Content erstellen, bevor Wettbewerber das Thema besetzen.',
      };

      // Table wrapper (mobile scrollable)
      var oppTableWrap = document.createElement('div');
      oppTableWrap.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;';

      var oppTable = document.createElement('table');
      oppTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';

      // Header: toggle | Typ | Was wir sehen | Empfohlene Massnahme
      var oppThead = document.createElement('thead');
      var oppHeaderRow = document.createElement('tr');
      [['', 'width:24px;', ''], ['Typ', 'width:148px;white-space:nowrap;', ''], ['Was wir sehen', '', ''], ['Empfohlene Massnahme', 'width:28%;', 'cvz-opp-rec-header']].forEach(function (pair) {
        var th = document.createElement('th');
        th.textContent = pair[0];
        if (pair[2]) th.className = pair[2];
        th.style.cssText =
          'text-align:left;padding:7px 10px;' +
          'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;' +
          'color:var(--cvz-text-muted,#8b98a5);' +
          'border-bottom:1px solid var(--cvz-border,#232b36);' + pair[1];
        oppHeaderRow.appendChild(th);
      });
      oppThead.appendChild(oppHeaderRow);
      oppTable.appendChild(oppThead);

      // Body
      var oppTbody = document.createElement('tbody');
      sortedOpps.forEach(function (opp, idx) {
        var tcfg = OPP_TYPE_CONFIG[opp.opportunity_type] || { color: '#8b98a5', bg: 'rgba(139,152,165,.08)', border: 'rgba(139,152,165,.3)' };
        var typeLabel = OPPORTUNITY_TYPE_LABELS[opp.opportunity_type] || opp.opportunity_type;
        var oppId = opp.id || (opp.opportunity_type + '_' + idx);
        var isExpanded = state.expandedOppId === oppId;
        var rowBg = idx % 2 === 1 ? 'rgba(255,255,255,.025)' : 'transparent';

        var tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid var(--cvz-border,#232b36);cursor:pointer;background:' + rowBg + ';';
        tr.setAttribute('data-cvz-opp-toggle', oppId);

        // Col 0: chevron toggle
        var tdToggle = document.createElement('td');
        tdToggle.style.cssText = 'padding:12px 6px 12px 10px;vertical-align:top;color:var(--cvz-text-muted,#8b98a5);font-size:11px;user-select:none;';
        tdToggle.textContent = isExpanded ? '▾' : '▸';
        tr.appendChild(tdToggle);

        // Col 1: Typ chip (mit Tooltip)
        var tdTyp = document.createElement('td');
        tdTyp.style.cssText = 'padding:12px 10px;vertical-align:top;';
        var chipWrap = document.createElement('div');
        chipWrap.style.cssText = 'display:flex;align-items:center;gap:5px;';
        var chip = document.createElement('span');
        chip.textContent = typeLabel;
        chip.style.cssText =
          'display:inline-block;' +
          'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;' +
          'padding:3px 8px;border-radius:9999px;white-space:nowrap;' +
          'color:' + tcfg.color + ';background:' + tcfg.bg + ';border:1px solid ' + tcfg.border + ';';
        chipWrap.appendChild(chip);
        var tipText = OPP_TYPE_TOOLTIPS[opp.opportunity_type];
        if (tipText) chipWrap.appendChild(makeTip(tipText));
        tdTyp.appendChild(chipWrap);
        tr.appendChild(tdTyp);

        // Col 2: Beschreibung (max 3 Zeilen, Rest per Expand sichtbar)
        var tdDesc = document.createElement('td');
        tdDesc.style.cssText = 'padding:12px 10px;vertical-align:top;line-height:1.65;color:var(--cvz-text-muted,#8b98a5);';
        var descInner = document.createElement('div');
        // GEAENDERT (18.09.2026): Klammerung (line-clamp:3) faellt weg, wenn
        // die Zeile aufgeklappt ist — vorher blieb der Text auch nach dem
        // Klick auf 3 Zeilen begrenzt, das Aufklappen zeigte nur die
        // Keywords/Domains-Tabelle darunter, nicht den vollen Beschreibungs-
        // text. Auf Mobile (keine Maus fuer Hover/Tooltip) war der
        // abgeschnittene Text dadurch nirgends vollstaendig lesbar.
        if (!isExpanded) {
          descInner.style.cssText = 'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;';
        }
        descInner.textContent = opp.description || '';
        tdDesc.appendChild(descInner);
        tr.appendChild(tdDesc);

        // Col 3: Massnahme — auf Mobile ausgeblendet (steht ausführlich im Aktionsplan-Tab)
        var tdRec = document.createElement('td');
        tdRec.className = 'cvz-opp-rec-col';
        tdRec.style.cssText = 'padding:12px 10px;vertical-align:top;line-height:1.5;font-size:12px;';
        var recText = opp.content_recommendation || OPP_FALLBACK_RECOMMENDATION[opp.opportunity_type] || '';
        var recInner = document.createElement('div');
        // GEAENDERT (18.09.2026): gleiche Begruendung wie bei descInner oben.
        if (!isExpanded) {
          recInner.style.cssText = 'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;';
        }
        recInner.style.color = 'var(--cvz-text-muted,#8b98a5)';
        recInner.textContent = recText || '-';
        tdRec.appendChild(recInner);
        tr.appendChild(tdRec);
        oppTbody.appendChild(tr);

        // Expansion row: Keywords oder Domains aus supporting_data
        if (isExpanded) {
          var expTr = document.createElement('tr');
          expTr.style.cssText = 'background:' + rowBg + ';';
          var expTd = document.createElement('td');
          expTd.colSpan = 4;
          expTd.style.cssText = 'padding:0 10px 14px 38px;';

          var sd = opp.supporting_data || {};
          var expContent = document.createElement('div');
          expContent.style.cssText = 'padding:10px 0 2px;';

          if (sd.keywords && sd.keywords.length > 0) {
            // Keywords-Tabelle (near_miss_ranking, high_demand_low_visibility, google_visible_ai_invisible, new_question)
            var kwTable = document.createElement('table');
            kwTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;max-width:560px;';
            var kwHead = document.createElement('thead');
            var kwHr = document.createElement('tr');
            var kwCols = [];
            var first = sd.keywords[0];
            if (first.search_volume !== undefined) kwCols = [['Keyword', ''], ['Suchvolumen/Monat', 'width:140px;text-align:right;']];
            else if (first.organic_rank !== undefined) kwCols = [['Keyword', ''], ['Google-Position', 'width:130px;text-align:right;']];
            else kwCols = [['Keyword', ''], ['Impressionen', 'width:100px;text-align:right;'], ['Position', 'width:80px;text-align:right;']];
            kwCols.forEach(function (c) {
              var th = document.createElement('th');
              th.textContent = c[0];
              th.style.cssText = 'padding:4px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--cvz-text-muted,#8b98a5);border-bottom:1px solid var(--cvz-border,#232b36);text-align:left;' + c[1];
              kwHr.appendChild(th);
            });
            kwHead.appendChild(kwHr);
            kwTable.appendChild(kwHead);
            var kwBody = document.createElement('tbody');
            sd.keywords.forEach(function (k, ki) {
              var ktr = document.createElement('tr');
              ktr.style.cssText = ki % 2 === 1 ? 'background:rgba(255,255,255,.02);' : '';
              var cells = [];
              if (first.search_volume !== undefined) {
                cells = [[k.keyword || '', 'text-align:left;'], [k.search_volume != null ? String(k.search_volume) : '-', 'text-align:right;color:var(--cvz-teal,#4fd1c5);']];
              } else if (first.organic_rank !== undefined) {
                cells = [[k.keyword || '', 'text-align:left;'], [k.organic_rank != null ? String(k.organic_rank) : '-', 'text-align:right;color:var(--cvz-amber,#c98e2a);']];
              } else {
                cells = [
                  [k.keyword || '', 'text-align:left;'],
                  [k.impressions != null ? String(k.impressions) : '-', 'text-align:right;color:var(--cvz-teal,#4fd1c5);'],
                  [k.position != null ? Number(k.position).toFixed(1) : '-', 'text-align:right;color:var(--cvz-amber,#c98e2a);'],
                ];
              }
              cells.forEach(function (cell) {
                var ktd = document.createElement('td');
                ktd.textContent = cell[0];
                ktd.style.cssText = 'padding:5px 8px;border-bottom:1px solid rgba(35,43,54,.5);' + cell[1];
                ktr.appendChild(ktd);
              });
              kwBody.appendChild(ktr);
            });
            kwTable.appendChild(kwBody);
            expContent.appendChild(kwTable);

          } else if ((sd.cited_domains || sd.competitor_domains_cited) && (sd.cited_domains || sd.competitor_domains_cited).length > 0) {
            // Domains-Liste (competitor_citation, ai_visible_competitor_dominates)
            var domains = sd.cited_domains || sd.competitor_domains_cited;
            var domLabel = document.createElement('p');
            domLabel.style.cssText = 'margin:0 0 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--cvz-text-muted,#8b98a5);';
            domLabel.textContent = 'Zitierte Domains';
            expContent.appendChild(domLabel);
            var domList = document.createElement('div');
            domList.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
            domains.forEach(function (d) {
              var pill = document.createElement('span');
              pill.textContent = d;
              pill.style.cssText = 'display:inline-block;padding:3px 10px;border-radius:9999px;font-size:11px;background:rgba(139,152,165,.1);border:1px solid rgba(139,152,165,.25);color:var(--cvz-text-muted,#8b98a5);';
              domList.appendChild(pill);
            });
            expContent.appendChild(domList);

          } else {
            var noData = document.createElement('p');
            noData.style.cssText = 'margin:0;font-size:12px;color:var(--cvz-text-muted,#8b98a5);';
            noData.textContent = 'Keine Detail-Daten verfügbar.';
            expContent.appendChild(noData);
          }

          expTd.appendChild(expContent);
          expTr.appendChild(expTd);
          oppTbody.appendChild(expTr);
        }
      });
      oppTable.appendChild(oppTbody);
      oppTableWrap.appendChild(oppTable);
      oppSection.appendChild(oppTableWrap);
      wrap.appendChild(oppSection);
    }

    // NEU (20.09.2026): KI-Wissens-Check — was ChatGPT/Gemini über euch
    // wissen. War bisher nur als Funktion vorhanden, wurde aber in keinem
    // Tab tatsächlich angezeigt.
    var knowledgeSection = renderKnowledgeSection(detail);
    if (knowledgeSection) wrap.appendChild(knowledgeSection);

    return wrap;
  }

  // ─── JOURNEY MAP ──────────────────────────────────────────────────────────
  // Detaillierte Phasenanalyse: Eigene Sichtbarkeit + welche Wettbewerber-
  // Inhalte dominieren pro Phase + Wettbewerber-Detailtabellen.
  function renderJourneyMapTab(topicId, detail) {
    var wrap = document.createElement('div');

    // NEU (20.09.2026): Retry-Hinweis für die Schritte, die in diesem Tab
    // dargestellt werden (Content-Lücken, Quellen-Analyse, SERP-Check,
    // Wettbewerber-Vorschläge).
    var journeyStepNotice = renderStepNotice(detail, ['gap_analysis', 'source_analysis', 'serp_check', 'competitor_suggestions']);
    if (journeyStepNotice) wrap.appendChild(journeyStepNotice);

    if (state.isLoadingDashboard) {
      var loadEl = document.createElement('p');
      loadEl.className = 'cvz-card-placeholder-text';
      loadEl.innerHTML = '<span class="cvz-spinner"></span>Journey-Map wird geladen…';
      wrap.appendChild(loadEl);
      return wrap;
    }

    var data = state.dashboardDataCache[topicId];
    if (!data || data._error) {
      var errEl = document.createElement('div');
      errEl.className = 'cvz-card cvz-card-placeholder';
      var errMsg = data && data._error
        ? 'Journey-Map-Daten konnten nicht geladen werden.'
        : 'Noch keine Journey-Map-Daten vorhanden. Diese entstehen nach dem ersten vollstaendigen Analyse-Lauf.';
      errEl.innerHTML = '<p class="cvz-card-placeholder-text">' + escapeHtml(errMsg) + '</p>' +
        '<p style="margin-top:8px;"><button type="button" ' +
        'style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid var(--cvz-border,#e5e7eb);' +
        'background:transparent;color:var(--cvz-text,#374151);cursor:pointer;" ' +
        'data-cvz-journey-retry="' + topicId + '">Erneut laden</button></p>';
      wrap.appendChild(errEl);
      return wrap;
    }

    // Phasen-Detail-Grid: Pro Phase eigene Zitierrate + Kanal-Aufschluss + Top-Wettbewerber-Inhalt
    var phaseSection = document.createElement('div');
    phaseSection.className = 'cvz-section';
    var phaseHeading = document.createElement('p');
    phaseHeading.className = 'cvz-section-label';
    phaseHeading.textContent = 'KI-Sichtbarkeit nach Journey-Phase';
    phaseSection.appendChild(phaseHeading);
    var phaseSub = document.createElement('p');
    phaseSub.className = 'cvz-card-placeholder-text';
    phaseSub.style.marginBottom = '12px';
    phaseSub.textContent = 'Wie oft wird eure Domain pro Phase und KI-Kanal zitiert (0-100 %). Darunter: dominierender Wettbewerber-Content.';
    phaseSection.appendChild(phaseSub);

    var phaseGrid = document.createElement('div');
    phaseGrid.className = 'cvz-journey-phase-grid';

    PHASE_ORDER.forEach(function (phase) {
      var scores = (data.phase_scores || {})[phase] || {};
      var color = PHASE_COLORS[phase] || '#8b98a5';
      var competitors = ((data.share_of_voice || {})[phase] || []);
      var promptCount = (data.prompt_count_by_phase || {})[phase] || 0;

      var card = document.createElement('div');
      card.className = 'cvz-journey-phase-card';
      card.style.borderTopColor = color;

      var nameEl = document.createElement('p');
      nameEl.className = 'cvz-journey-phase-name';
      nameEl.style.color = color;
      nameEl.textContent = PHASE_LABELS[phase] || phase;
      if (promptCount > 0) {
        nameEl.textContent += ' (' + promptCount + ')';
      }
      card.appendChild(nameEl);

      // Per-channel rows
      CHANNEL_ORDER.forEach(function (channel) {
        var ch = scores[channel] || { score: 0, cited: 0, total: 0 };
        var pct = Math.round(ch.score || 0);
        var row = document.createElement('div');
        row.className = 'cvz-journey-channel-row';
        var lbl = document.createElement('span');
        lbl.className = 'cvz-journey-channel-label';
        lbl.textContent = CHANNEL_LABELS[channel] || channel;
        row.appendChild(lbl);
        var barWrap = document.createElement('div');
        barWrap.className = 'cvz-journey-bar-wrap';
        var bar = document.createElement('div');
        bar.className = 'cvz-journey-bar-fill';
        bar.style.width = pct + '%';
        bar.style.backgroundColor = color;
        barWrap.appendChild(bar);
        row.appendChild(barWrap);
        var num = document.createElement('span');
        num.className = 'cvz-journey-channel-num';
        num.textContent = pct + '%';
        if (ch.total > 0) num.title = ch.cited + ' von ' + ch.total + ' Prompts zitiert';
        row.appendChild(num);
        card.appendChild(row);
      });

      // Top competitor for this phase
      if (competitors.length > 0) {
        var divider = document.createElement('div');
        divider.style.cssText = 'margin:8px 0 6px;border-top:1px solid var(--cvz-border,#e5e7eb);';
        card.appendChild(divider);
        var compLabel = document.createElement('p');
        compLabel.style.cssText = 'margin:0 0 4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cvz-text-muted,#6b7280);';
        compLabel.textContent = 'Top-Wettbewerber';
        card.appendChild(compLabel);
        competitors.slice(0, 2).forEach(function (comp) {
          var compPct = Math.round(comp.citation_rate || 0);
          var compRow = document.createElement('div');
          compRow.className = 'cvz-journey-channel-row';
          compRow.innerHTML =
            '<span class="cvz-journey-channel-label" style="color:var(--cvz-text-muted,#6b7280);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(comp.domain) + '">' + escapeHtml(comp.domain) + '</span>' +
            '<div class="cvz-journey-bar-wrap"><div class="cvz-journey-bar-fill" style="width:' + compPct + '%;background:#d1d5db"></div></div>' +
            '<span class="cvz-journey-channel-num" style="color:var(--cvz-text-muted,#6b7280);">' + compPct + '%</span>';
          card.appendChild(compRow);
          if (comp.content_type) {
            var typeEl = document.createElement('p');
            typeEl.style.cssText = 'margin:1px 0 3px;font-size:10px;color:var(--cvz-text-muted,#9ca3af);padding-left:4px;';
            typeEl.textContent = CONTENT_TYPE_LABELS[comp.content_type] || comp.content_type;
            card.appendChild(typeEl);
          }
        });
      }

      phaseGrid.appendChild(card);
    });

    phaseSection.appendChild(phaseGrid);
    wrap.appendChild(phaseSection);

    // VERSCHOBEN (20.09.2026): Die detaillierte Wettbewerber-Tabelle pro
    // Phase (mit Differenzierungs-Tipps) steht jetzt im Situation-Tab, gleich
    // hinter dem Wettbewerbsvergleichs-Chart — dort ist sie sofort sichtbar
    // statt hier hinter mehreren anderen Abschnitten versteckt.

    // Content-Lücken aus Gap-Analyse (GEAENDERT 17.09.2026: topicId + Phase-Filter)
    wrap.appendChild(renderContentGapsSection(detail.content_gaps, topicId));

    // Quellen-Analyse (GEAENDERT 17.09.2026: phase-gruppiert via share_of_voice)
    var _sov = data.share_of_voice || {};
    var _hasSov = PHASE_ORDER.some(function (p) { return _sov[p] && _sov[p].length; });
    if (_hasSov || (detail.source_profiles && detail.source_profiles.length > 0)) {
      wrap.appendChild(renderSourceProfilesSection(detail.source_profiles, topicId, _sov));
    }

    // VERSCHOBEN (17.09.2026): Wettbewerber-Verwaltung gehoert zur Journey Map,
    // weil die bestaetigten Domains den Alert „Wettbewerber ueberholt euch" und
    // die Share-of-Voice-Analyse in diesem Tab steuern.
    var compManageWrap = document.createElement('div');
    compManageWrap.style.cssText = 'margin-top:28px;padding-top:20px;border-top:1px solid var(--cvz-border,#30363d);';
    var compManageHeading = document.createElement('p');
    compManageHeading.className = 'cvz-section-label';
    compManageHeading.textContent = 'Beobachtete Wettbewerber';
    compManageWrap.appendChild(compManageHeading);
    var compManageSub = document.createElement('p');
    compManageSub.className = 'cvz-card-placeholder-text';
    compManageSub.style.marginBottom = '10px';
    compManageSub.textContent =
      'Diese Domains steuern den Alert „Wettbewerber überholt euch“ ' +
      'und werden in der Share-of-Voice-Analyse oben gesondert hervorgehoben. ' +
      'Der Vergleichs-Chart im Überblick zeigt davon unabhängig alle KI-zitierten Domains.';
    compManageWrap.appendChild(compManageSub);
    compManageWrap.appendChild(renderCompetitorManageSection(detail, topicId));
    wrap.appendChild(compManageWrap);

    return wrap;
  }

  // ─── SUPPORTING DATA TABLE ────────────────────────────────────────────────
  // Baut eine kleine Datentabelle (DOM), die die Rohdaten hinter einem
  // Aktionsplan-Item auflistet: je nach Kategorie Prompts, Keywords oder
  // Wettbewerber.
  function _buildSupportingDataTable(catKey, phase, detail) {
    var rows = [];
    var headers = [];

    if (catKey === 'ki_sichtbarkeit') {
      var prompts = (detail.prompts || []).filter(function (p) {
        return (phase === 'alle_phasen' || p.messymiddle_phase === phase)
          && p.total_runs > 0;
      }).sort(function (a, b) { return (b.cited_count || 0) - (a.cited_count || 0); });
      if (prompts.length === 0) return null;
      headers = ['Prompt', 'Zitiert', 'Läufe', 'Rate'];
      rows = prompts.map(function (p) {
        var rate = p.total_runs > 0 ? Math.round((p.cited_count / p.total_runs) * 100) : 0;
        return [
          p.prompt_text || '',
          String(p.cited_count || 0),
          String(p.total_runs || 0),
          rate + '%'
        ];
      });
    } else if (catKey === 'google_ranking') {
      var kws = (detail.search_queries || []).filter(function (q) {
        return (phase === 'alle_phasen' || q.messymiddle_phase === phase)
          && q.gsc_position != null;
      }).sort(function (a, b) { return (a.gsc_position || 999) - (b.gsc_position || 999); });
      if (kws.length === 0) return null;
      headers = ['Keyword', 'Position', 'Impressionen'];
      rows = kws.map(function (q) {
        return [
          q.keyword || '',
          q.gsc_position != null ? (Math.round(q.gsc_position * 10) / 10).toLocaleString('de-DE') : '',
          q.gsc_impressions != null ? Number(q.gsc_impressions).toLocaleString('de-DE') : ''
        ];
      });
    } else if (catKey === 'wettbewerb') {
      var comps = (detail.competitor_insights || []).filter(function (c) { return c.domain; });
      if (comps.length === 0) return null;
      headers = ['Wettbewerber', 'Stärke', 'Schwäche'];
      rows = comps.map(function (c) {
        return [
          c.domain || '',
          c.strength || '',
          c.weakness || ''
        ];
      });
    } else if (catKey === 'content_luecke') {
      var gaps = (detail.prompts || []).filter(function (p) {
        return (phase === 'alle_phasen' || p.messymiddle_phase === phase)
          && p.cited_count === 0 && p.total_runs > 0;
      });
      if (gaps.length === 0) return null;
      headers = ['Prompt ohne eigene Zitierung', 'Läufe'];
      rows = gaps.map(function (p) {
        return [p.prompt_text || '', String(p.total_runs || 0)];
      });
    }

    if (rows.length === 0) return null;

    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top:4px;';

    var lbl = document.createElement('p');
    lbl.style.cssText = 'margin:0 0 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--cvz-text-muted,#8b98a5);';
    lbl.textContent = 'Zugrunde liegende Daten';
    wrapper.appendChild(lbl);

    var tbl = document.createElement('table');
    tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    headers.forEach(function (h, hi) {
      var th = document.createElement('th');
      th.style.cssText = 'text-align:' + (hi === 0 ? 'left' : 'right') + ';padding:4px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--cvz-text-muted,#8b98a5);border-bottom:1px solid var(--cvz-border,#232b36);white-space:nowrap;';
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tbl.appendChild(thead);

    var tbody = document.createElement('tbody');
    rows.forEach(function (row, ri) {
      var tr = document.createElement('tr');
      tr.style.cssText = (ri % 2 === 0 ? 'background:transparent;' : 'background:rgba(255,255,255,.03);');
      row.forEach(function (cell, ci) {
        var td = document.createElement('td');
        td.style.cssText = 'padding:5px 8px;color:var(--cvz-text-muted,#8b98a5);vertical-align:top;' +
          (ci === 0 ? 'text-align:left;word-break:break-word;max-width:220px;' : 'text-align:right;white-space:nowrap;');
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);

    var scrollWrap = document.createElement('div');
    scrollWrap.style.cssText = 'overflow-x:auto;border:1px solid var(--cvz-border,#232b36);border-radius:6px;';
    scrollWrap.appendChild(tbl);
    wrapper.appendChild(scrollWrap);
    return wrapper;
  }

  // ─── AKTIONSPLAN ──────────────────────────────────────────────────────────
  // Strukturierte Aktions-Karten: Situation / Was rankt & wird zitiert / Empfehlung.
  // Priorisiert nach Impact; near-miss Keywords mit URL, Position und SERP-Kontext.
  // NEU (16.09.2026): Aktionsplan-Tab liest jetzt detail.action_plan statt
  // detail.opportunities + detail.content_ideas. Claude generiert die Items
  // phasengerecht mit typisierten Evidence-Bloecken.
  function renderAktionsplanTab(detail) {
    var wrap = document.createElement('div');

    // NEU (20.09.2026): Retry-Hinweis, falls die Aktionsplan-Generierung
    // fehlgeschlagen ist oder noch fehlt.
    var apStepNotice = renderStepNotice(detail, ['action_plan']);
    if (apStepNotice) wrap.appendChild(apStepNotice);

    var PHASE_ORDER = ['alle_phasen', 'exploration', 'evaluation', 'comparison', 'decision'];
    var PHASE_LABEL_MAP = {
      exploration: 'Exploration',
      evaluation:  'Bewertung',
      comparison:  'Vergleich',
      decision:    'Entscheidung',
      alle_phasen: 'Alle Phasen',
    };
    var PHASE_COLOR_MAP = {
      exploration: '#8878ca',
      evaluation:  '#5aacd2',
      comparison:  '#4ec68a',
      decision:    '#c98e2a',
      alle_phasen: '#4a5568',
    };
    var CAT_LABEL_MAP = {
      ki_sichtbarkeit: 'KI-Sichtbarkeit',
      google_ranking:  'Google-Ranking',
      wettbewerb:      'Wettbewerb',
      content_luecke:  'Content-Lücke',
    };
    var IMPACT_COLOR_MAP = { hoch: '#de5b50', mittel: '#c98e2a', niedrig: '#4a5568' };
    var IMPACT_LABEL_MAP = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' };

    var ap = detail.action_plan || {};
    // DIAGNOSE-LOG (17.09.2026): zeigt im Browser-DevTools-Console was der Server liefert.
    // Kann nach Bestätigung dass alles funktioniert wieder entfernt werden.
    console.log('[CVZ] renderAktionsplanTab — action_plan vom Server:', JSON.stringify(ap).slice(0, 500));
    var items = ap.items || [];
    // NEU (17.09.2026): erledigte Items — Array mit 0-basierten Original-Indizes
    var completedIndices = ap.completed_item_indices || [];

    // ----- Empty / waiting state -----
    if (items.length === 0) {
      var emptyWrap = document.createElement('div');
      emptyWrap.style.cssText = 'text-align:center;padding:48px 24px;';
      var emptyTxt = document.createElement('p');
      emptyTxt.className = 'cvz-card-placeholder-text';
      if (ap.generated_at) {
        // Plan existiert, aber ohne Items — mehr Daten nötig
        emptyTxt.textContent = 'Der Aktionsplan wurde generiert, enthält aber noch keine konkreten Empfehlungen. Es werden mehr Daten benötigt (mindestens einige ausgewertete Prompts und GSC-Daten). Empfehlungen erscheinen nach dem nächsten Analyse-Lauf mit ausreichend Datenlage.';
      } else {
        // Noch gar kein Plan — Generierung anbieten
        emptyTxt.textContent = 'Für dieses Topic wurde noch kein Aktionsplan generiert.';
        // Manueller Trigger-Button: ruft POST /topics/{id}/generate-action-plan auf.
        // Der Endpunkt startet die KI-Generierung im Hintergrund (202) und dauert ~30–60 s.
        var genBtn = document.createElement('button');
        genBtn.style.cssText = 'display:inline-block;margin-top:16px;padding:10px 22px;background:var(--cvz-accent,#5aacd2);color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;';
        genBtn.textContent = 'Aktionsplan jetzt generieren';
        (function(btn, statusEl, topicId) {
          btn.addEventListener('click', function() {
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.textContent = 'Wird generiert …';
            apiFetch('/topics/' + topicId + '/generate-action-plan', { method: 'POST' })
              .then(function() {
                statusEl.textContent = 'Generierung gestartet. Das dauert einige Minuten. Die Seite wird automatisch neu geladen …';
                btn.style.display = 'none';
                // Pollt alle 10 s max. 12x (2 min), bricht ab wenn generated_at gesetzt
                var attempts = 0;
                var poller = setInterval(function() {
                  attempts++;
                  delete state.topicDetailCache[topicId];
                  loadTopicDetail(topicId)
                    .then(function(freshDetail) {
                      if (freshDetail && freshDetail.action_plan && freshDetail.action_plan.generated_at) {
                        clearInterval(poller);
                        state.topicDetailCache[topicId] = freshDetail;
                        state.isLoadingDetail = false;
                        render();
                      } else if (attempts >= 12) {
                        clearInterval(poller);
                        statusEl.textContent = 'Generierung läuft noch oder ist fehlgeschlagen — bitte Seite manuell neu laden.';
                      }
                    })
                    .catch(function() {
                      if (attempts >= 12) clearInterval(poller);
                    });
                }, 10000);
              })
              .catch(function(err) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.textContent = 'Aktionsplan jetzt generieren';
                statusEl.textContent = 'Fehler beim Starten der Generierung — bitte erneut versuchen.';
                console.error('[CVZ] generate-action-plan Fehler:', err);
              });
          });
        })(genBtn, emptyTxt, state.activeTopicId);
        emptyWrap.appendChild(emptyTxt);
        emptyWrap.appendChild(genBtn);
        wrap.appendChild(emptyWrap);
        return wrap; // früher return, emptyTxt wurde bereits angehängt
      }
      emptyWrap.appendChild(emptyTxt);
      wrap.appendChild(emptyWrap);
    } else {
      // Intro line with generation timestamp
      if (ap.generated_at) {
        var introEl = document.createElement('p');
        introEl.className = 'cvz-card-placeholder-text';
        introEl.style.cssText = 'margin-bottom:20px;font-size:12px;';
        var genDate = new Date(ap.generated_at);
        introEl.textContent = 'Zuletzt generiert: ' + genDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + genDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr. ' + items.length + ' Massnahmen priorisiert nach Phase und Impact.';
        wrap.appendChild(introEl);
      }

      // Group by phase — NEU (17.09.2026): _origIdx merken, damit completed_item_indices korrekt sind
      var itemsWithIdx = items.map(function(item, idx) {
        return Object.assign({}, item, { _origIdx: idx });
      });
      var groups = {};
      itemsWithIdx.forEach(function (item) {
        var ph = item.phase || 'alle_phasen';
        if (!groups[ph]) groups[ph] = [];
        groups[ph].push(item);
      });

      PHASE_ORDER.forEach(function (ph) {
        if (!groups[ph] || groups[ph].length === 0) return;
        var phItems = groups[ph].slice().sort(function (a, b) { return (a.priority || 99) - (b.priority || 99); });
        var phColor = PHASE_COLOR_MAP[ph] || '#6b7280';

        var phSection = document.createElement('div');
        phSection.style.marginBottom = '32px';

        // Phase section heading
        var phHdr = document.createElement('div');
        phHdr.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid ' + phColor + ';';
        var phDot = document.createElement('span');
        phDot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:' + phColor + ';flex-shrink:0;display:inline-block;';
        var phLbl = document.createElement('span');
        phLbl.style.cssText = 'font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:' + phColor + ';';
        phLbl.textContent = (PHASE_LABEL_MAP[ph] || ph) + ' (' + phItems.length + ')';
        phHdr.appendChild(phDot);
        phHdr.appendChild(phLbl);
        phSection.appendChild(phHdr);

        var phList = document.createElement('div');
        phList.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

        phItems.forEach(function (item, cardIdx) {
          // NEU (17.09.2026): Erledigt-Status prüfen
          var origIdx    = item._origIdx;
          var isCompleted = completedIndices.indexOf(origIdx) !== -1;

          var card = document.createElement('div');
          card.className = 'cvz-card';
          card.style.cssText = 'padding:0;overflow:hidden;' + (isCompleted ? 'opacity:0.45;' : '');

          var impactLvl = (item.impact || 'mittel').toLowerCase();
          var impColor  = IMPACT_COLOR_MAP[impactLvl] || '#d97706';
          var impLabel  = IMPACT_LABEL_MAP[impactLvl] || 'Mittel';
          var catKey    = item.category || 'ki_sichtbarkeit';
          var catLabel  = CAT_LABEL_MAP[catKey] || catKey;
          var ev        = item.evidence || {};

          // ---- Header ----
          var hdr = document.createElement('div');
          hdr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--cvz-border,#232b36);background:var(--cvz-navy,#0d1117);flex-wrap:wrap;';

          var numSp = document.createElement('span');
          numSp.style.cssText = 'font-size:11px;font-weight:700;color:var(--cvz-text-muted,#8b98a5);min-width:24px;flex-shrink:0;';
          numSp.textContent = '#' + (item.priority || (cardIdx + 1));
          hdr.appendChild(numSp);

          var impBadge = document.createElement('span');
          impBadge.style.cssText = 'display:inline-flex;align-items:center;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;color:#fff;background:' + impColor + ';flex-shrink:0;';
          impBadge.textContent = impLabel;
          hdr.appendChild(impBadge);

          var catSp = document.createElement('span');
          catSp.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--cvz-text-muted,#8b98a5);';
          catSp.textContent = catLabel;
          hdr.appendChild(catSp);

          // NEU (17.09.2026): Erledigt-Toggle — rechts im Header
          var spacer = document.createElement('span');
          spacer.style.cssText = 'flex:1;';
          hdr.appendChild(spacer);

          var doneBtn = document.createElement('button');
          doneBtn.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 10px;border-radius:9999px;cursor:pointer;transition:all .15s;border:1px solid;flex-shrink:0;' +
            (isCompleted
              ? 'background:rgba(78,198,138,.12);border-color:rgba(78,198,138,.45);color:#4ec68a;'
              : 'background:transparent;border-color:var(--cvz-border,#232b36);color:var(--cvz-text-muted,#8b98a5);');
          doneBtn.innerHTML = isCompleted
            ? '<span style="font-size:13px;">✓</span> Erledigt'
            : '<span style="font-size:11px;">○</span> Als erledigt markieren';
          doneBtn.title = isCompleted ? 'Erledigt-Markierung aufheben' : 'Item als erledigt markieren';

          // Closure: Klick-Handler mit aktuellem Kontext
          (function(btn, topicId, itemOrigIdx, itemTitle, itemPhase, itemIsCompleted, apObj) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              btn.disabled = true;
              btn.style.opacity = '0.5';
              var newComplete = !itemIsCompleted;
              apiFetch('/topics/' + topicId + '/action-plan/toggle-item', {
                method: 'POST',
                // apiFetch ruft selbst JSON.stringify(options.body) auf — kein manuelles Stringify hier!
                body: {
                  item_index: itemOrigIdx,
                  item_title: itemTitle || ('Item #' + (itemOrigIdx + 1)),
                  item_phase: itemPhase || 'alle_phasen',
                  complete: newComplete,
                },
              }).then(function(resp) {
                // Cache aktualisieren
                var cached = state.topicDetailCache[topicId];
                if (cached && cached.action_plan) {
                  cached.action_plan.completed_item_indices = resp.completed_item_indices || [];
                }
                // Wenn ein content_change zurückkam, contentChangesCache updaten
                if (resp.content_change && state.contentChangesCache) {
                  if (!state.contentChangesCache[topicId]) {
                    state.contentChangesCache[topicId] = [];
                  }
                  state.contentChangesCache[topicId].push(resp.content_change);
                }
                // NEU (18.09.2026): Beim Zurücksetzen entfernt das Backend die
                // zugehörigen content_changes-/topic_changelog-Einträge wieder
                // (siehe main.py toggle_action_plan_item_endpoint) — Caches
                // hier entsprechend bereinigen, sonst bleiben die Einträge bis
                // zum nächsten vollständigen Neuladen sichtbar.
                if (resp.removed_content_change_ids && resp.removed_content_change_ids.length && state.contentChangesCache[topicId]) {
                  state.contentChangesCache[topicId] = state.contentChangesCache[topicId].filter(function (ch) {
                    return resp.removed_content_change_ids.indexOf(ch.id) === -1;
                  });
                }
                if (resp.removed_changelog_ids && resp.removed_changelog_ids.length && cached && cached.changelog) {
                  cached.changelog = cached.changelog.filter(function (e) {
                    return resp.removed_changelog_ids.indexOf(e.id) === -1;
                  });
                }
                render();
              }).catch(function(err) {
                console.error('[CVZ] toggle-action-plan-item Fehler:', err);
                btn.disabled = false;
                btn.style.opacity = '1';
              });
            });
          })(doneBtn, state.activeTopicId, origIdx, item.title, item.phase, isCompleted, ap);

          hdr.appendChild(doneBtn);
          card.appendChild(hdr);

          // ---- Body ----
          var body = document.createElement('div');
          body.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:14px;';

          // Title — NEU (17.09.2026): durchgestrichen wenn erledigt
          if (item.title) {
            var titleEl = document.createElement('p');
            titleEl.style.cssText = 'margin:0;font-size:15px;font-weight:700;line-height:1.4;color:var(--cvz-text-muted,#8b98a5);' + (isCompleted ? 'text-decoration:line-through;' : '');
            titleEl.textContent = item.title;
            body.appendChild(titleEl);
          }

          // ---- SITUATION ----
          if (item.situation) {
            var sitDiv = document.createElement('div');
            var sitLbl = document.createElement('p');
            sitLbl.style.cssText = 'margin:0 0 5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--cvz-text-muted,#8b98a5);';
            sitLbl.textContent = 'Situation';
            var sitTxt = document.createElement('p');
            sitTxt.style.cssText = 'margin:0;font-size:13px;color:var(--cvz-text-muted,#8b98a5);line-height:1.55;';
            sitTxt.textContent = item.situation;
            sitDiv.appendChild(sitLbl);
            sitDiv.appendChild(sitTxt);
            body.appendChild(sitDiv);
          }

          // ---- EVIDENCE (kategorie-spezifisch) ----
          if (Object.keys(ev).length > 0) {
            var evDiv = document.createElement('div');
            var evSectionLbl = document.createElement('p');
            evSectionLbl.style.cssText = 'margin:0 0 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--cvz-text-muted,#8b98a5);';
            evSectionLbl.textContent =
              catKey === 'google_ranking' ? 'Ranking-Daten' :
              catKey === 'content_luecke' ? 'Beispiel-Frage' :
              'Zitierungsrate';
            evDiv.appendChild(evSectionLbl);

            if (catKey === 'ki_sichtbarkeit' || catKey === 'wettbewerb') {
              // Citation rate comparison boxes
              var rateRow = document.createElement('div');
              rateRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;';
              if (ev.own_citation_rate_pct != null) {
                var ownBox = document.createElement('div');
                ownBox.style.cssText = 'background:rgba(79,209,197,.1);border:1px solid rgba(79,209,197,.35);border-radius:6px;padding:6px 12px;min-width:90px;';
                ownBox.innerHTML = '<div style="font-size:10px;font-weight:700;color:#4fd1c5;text-transform:uppercase;margin-bottom:2px;">Eure Rate</div><div style="font-size:22px;font-weight:800;color:#4fd1c5;">' + ev.own_citation_rate_pct + '%</div>';
                rateRow.appendChild(ownBox);
              }
              if (ev.top_competitor && ev.competitor_citation_rate_pct != null) {
                var compBox = document.createElement('div');
                compBox.style.cssText = 'background:rgba(229,72,77,.1);border:1px solid rgba(229,72,77,.35);border-radius:6px;padding:6px 12px;min-width:90px;';
                compBox.innerHTML = '<div style="font-size:10px;font-weight:700;color:#de5b50;text-transform:uppercase;margin-bottom:2px;">' + escapeHtml(ev.top_competitor) + '</div><div style="font-size:22px;font-weight:800;color:#de5b50;">' + ev.competitor_citation_rate_pct + '%</div>';
                rateRow.appendChild(compBox);
              }
              evDiv.appendChild(rateRow);
              if (ev.example_prompt) {
                var epBox = document.createElement('div');
                epBox.style.cssText = 'background:var(--cvz-navy,#0d1117);border:1px solid var(--cvz-border,#232b36);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--cvz-text-muted,#8b98a5);font-style:italic;line-height:1.5;';
                epBox.textContent = '"' + ev.example_prompt + '"';
                evDiv.appendChild(epBox);
              }
            } else if (catKey === 'google_ranking') {
              // Position + impressions stats
              var statsRow = document.createElement('div');
              statsRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;';
              if (ev.position != null) {
                var posStat = document.createElement('div');
                posStat.style.cssText = 'background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.35);border-radius:6px;padding:6px 12px;';
                posStat.innerHTML = '<div style="font-size:10px;font-weight:700;color:#5aacd2;text-transform:uppercase;margin-bottom:2px;">Position</div><div style="font-size:22px;font-weight:800;color:#5aacd2;">' + (Math.round(ev.position * 10) / 10) + '</div>';
                statsRow.appendChild(posStat);
              }
              if (ev.impressions != null) {
                var impStat = document.createElement('div');
                impStat.style.cssText = 'background:var(--cvz-navy,#0d1117);border:1px solid var(--cvz-border,#232b36);border-radius:6px;padding:6px 12px;';
                impStat.innerHTML = '<div style="font-size:10px;font-weight:700;color:var(--cvz-text-muted,#8b98a5);text-transform:uppercase;margin-bottom:2px;">Impressionen</div><div style="font-size:22px;font-weight:800;color:var(--cvz-text,#e6edf3);">' + Number(ev.impressions).toLocaleString('de-DE') + '</div>';
                statsRow.appendChild(impStat);
              }
              evDiv.appendChild(statsRow);
              if (ev.page_url) {
                var pgUrlRow = document.createElement('div');
                pgUrlRow.style.cssText = 'display:flex;align-items:baseline;gap:6px;margin-bottom:8px;flex-wrap:wrap;';
                var pgUrlLbl = document.createElement('span');
                pgUrlLbl.style.cssText = 'font-size:11px;font-weight:600;color:var(--cvz-text-muted,#8b98a5);flex-shrink:0;';
                pgUrlLbl.textContent = 'Rankende Seite:';
                var pgUrlVal = document.createElement('span');
                pgUrlVal.style.cssText = 'font-size:12px;font-family:monospace;color:#5aacd2;word-break:break-all;';
                pgUrlVal.textContent = ev.page_url;
                pgUrlRow.appendChild(pgUrlLbl);
                pgUrlRow.appendChild(pgUrlVal);
                evDiv.appendChild(pgUrlRow);
              }
              if (ev.serp_top3 && ev.serp_top3.length > 0) {
                var serpRowLbl = document.createElement('p');
                serpRowLbl.style.cssText = 'margin:0 0 5px;font-size:11px;font-weight:600;color:var(--cvz-text-muted,#8b98a5);';
                serpRowLbl.textContent = 'Top-Ergebnisse auf der SERP:';
                evDiv.appendChild(serpRowLbl);
                var serpChips = document.createElement('div');
                serpChips.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
                ev.serp_top3.forEach(function (dom) {
                  var chip = document.createElement('span');
                  chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:3px 8px;background:var(--cvz-navy,#0d1117);border:1px solid var(--cvz-border,#232b36);border-radius:6px;color:var(--cvz-text-muted,#8b98a5);';
                  chip.innerHTML = '<img src="https://www.google.com/s2/favicons?sz=12&domain=' + encodeURIComponent(dom) + '" style="width:12px;height:12px;flex-shrink:0;" onerror="this.style.display=\'none\'">' + escapeHtml(dom);
                  serpChips.appendChild(chip);
                });
                evDiv.appendChild(serpChips);
              }
            } else if (catKey === 'content_luecke') {
              if (ev.example_prompt) {
                var gapQ = document.createElement('div');
                gapQ.style.cssText = 'background:rgba(136,120,202,.12);border:1px solid rgba(136,120,202,.35);border-radius:6px;padding:10px 12px;font-size:13px;color:#8878ca;font-style:italic;line-height:1.55;';
                gapQ.textContent = '"' + ev.example_prompt + '"';
                evDiv.appendChild(gapQ);
              }
            }
            body.appendChild(evDiv);
          }

          // ---- ZUGRUNDE LIEGENDE DATEN ----
          var dataTable = _buildSupportingDataTable(catKey, item.phase || 'alle_phasen', detail);
          if (dataTable) body.appendChild(dataTable);

          // ---- EMPFEHLUNG — NEU (17.09.2026): durchgestrichen wenn erledigt ----
          if (item.recommendation) {
            var recDiv = document.createElement('div');
            recDiv.style.cssText = 'background:rgba(79,209,197,.1);border-left:3px solid #4fd1c5;border-radius:0 4px 4px 0;padding:10px 12px;';
            var recLbl = document.createElement('p');
            recLbl.style.cssText = 'margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#4fd1c5;';
            recLbl.textContent = isCompleted ? 'Empfehlung (erledigt)' : 'Empfehlung';
            var recTxt = document.createElement('p');
            recTxt.style.cssText = 'margin:0;font-size:13px;color:#4fd1c5;line-height:1.55;' + (isCompleted ? 'text-decoration:line-through;' : '');
            recTxt.textContent = item.recommendation;
            recDiv.appendChild(recLbl);
            recDiv.appendChild(recTxt);
            body.appendChild(recDiv);
          }

          card.appendChild(body);
          phList.appendChild(card);
        });

        phSection.appendChild(phList);
        wrap.appendChild(phSection);
      });
    }

    // ENTFERNT (20.09.2026): "Plattformen mit Veröffentlichungs-Chance" stand
    // hier direkt über der neuen Outreach-Targets-Sektion und deckte im Kern
    // dieselbe Frage ab ("wo können wir veröffentlichen") — nur aus einer
    // anderen, schmaleren Datenquelle (source_profiles statt der dedizierten
    // outreach_targets.py-Logik mit Bewertungsportale/Medien/Community-
    // Gruppierung). Zwei Listen mit vermutlich überlappenden Domains
    // nebeneinander wirkten nicht vollständiger, sondern unklar. Die
    // strukturierte Sektion unten bleibt die einzige Quelle dafür.

    // NEU (20.09.2026): Mögliche Ziele für Bewertungen und Digital PR
    // (outreach_targets.py) — war bisher nur als Funktion vorhanden, wurde
    // aber in keinem Tab tatsächlich angezeigt.
    var outreachSection = renderOutreachTargetsSection(detail);
    if (outreachSection) wrap.appendChild(outreachSection);

    return wrap;
  }

  // ─── VERLAUF ──────────────────────────────────────────────────────────────
  // Monats-Timeline aus Timeseries-Daten + Content-Aenderungen als Marker.
  // Ziel: Marketer kann Aenderungen schnell mit Sichtbarkeits-Effekten korrelieren.
  function renderVerlaufTab(topicId, detail) {
    var wrap = document.createElement('div');

    // GEÄNDERT (20.09.2026): Formular zum Eintragen einer Änderung steht
    // jetzt ganz oben im Tab (vorher stand es hinter Wirkungs-Analyse, Chart
    // und Chronik — dadurch war es kaum auffindbar, obwohl es der einzige
    // Ort ist, an dem man aktiv etwas eintragen kann statt nur zu lesen).
    wrap.appendChild(renderContentChangesSection(topicId, detail.search_queries, detail.prompts));

    // NEU (20.09.2026): Bereits umgesetzte Änderungen und ihre gemessene
    // Wirkung (change_history.py) — war bisher nur als Funktion vorhanden,
    // wurde aber in keinem Tab tatsächlich angezeigt.
    var changeAssessmentSection = renderChangeAssessmentSection(detail);
    if (changeAssessmentSection) wrap.appendChild(changeAssessmentSection);

    // Chart section
    var data = state.dashboardDataCache[topicId];
    var isLoading = state.isLoadingDashboard;

    var chartSection = document.createElement('div');
    chartSection.className = 'cvz-section';
    var chartHeading = document.createElement('p');
    chartHeading.className = 'cvz-section-label';
    chartHeading.textContent = 'Sichtbarkeits-Verlauf pro Phase';
    chartSection.appendChild(chartHeading);

    if (isLoading) {
      var loadEl = document.createElement('p');
      loadEl.className = 'cvz-card-placeholder-text';
      loadEl.innerHTML = '<span class="cvz-spinner"></span>Verlauf wird geladen…';
      chartSection.appendChild(loadEl);
    } else if (!data || !data.timeseries || !data.timeseries.weeks || data.timeseries.weeks.length < 2) {
      var emptyEl = document.createElement('p');
      emptyEl.className = 'cvz-card-placeholder-text';
      emptyEl.textContent = 'Noch kein Verlauf verfügbar. Es werden mindestens zwei Wochen mit Analyse-Läufen benötigt.';
      chartSection.appendChild(emptyEl);
    } else {
      var ts = data.timeseries;
      var weeks = ts.weeks; // ["2026-W28", ...]
      // Convert week keys to short display labels
      var xLabels = weeks.map(function (w) {
        var m = w.match(/^(\d{4})-W(\d{2})$/);
        if (!m) return w;
        return 'KW' + m[2];
      });

      // Build series: per phase, average across channels for that week
      var series = PHASE_ORDER.map(function (phase) {
        var phaseSeries = (ts.series || {})[phase] || {};
        var values = weeks.map(function (w, wi) {
          var total = 0, count = 0;
          CHANNEL_ORDER.forEach(function (ch) {
            var arr = phaseSeries[ch];
            if (arr && arr[wi] != null) { total += arr[wi]; count++; }
          });
          return count > 0 ? Math.round(total / count) : null;
        });
        return { label: PHASE_LABELS[phase] || phase, values: values, color: PHASE_COLORS[phase] };
      });

      // NEU (18.09.2026): zweite, gestrichelte Linie pro Phase — die engere
      // Definition own_domain_cited_with_url ("mit echtem Link zitiert"),
      // aus ts.series_with_url (dashboard.py: _compute_weekly_timeseries).
      // Gleiche Farbe wie die durchgezogene Linie derselben Phase, damit die
      // Zuordnung klar bleibt; dashed:true wird von buildLineChartSvg direkt
      // unterstützt (Strichelung + reduzierte Deckkraft).
      var seriesWithUrl = PHASE_ORDER.map(function (phase) {
        var phaseSeries = (ts.series_with_url || {})[phase] || {};
        var values = weeks.map(function (w, wi) {
          var total = 0, count = 0;
          CHANNEL_ORDER.forEach(function (ch) {
            var arr = phaseSeries[ch];
            if (arr && arr[wi] != null) { total += arr[wi]; count++; }
          });
          return count > 0 ? Math.round(total / count) : null;
        });
        return { label: (PHASE_LABELS[phase] || phase) + ' (mit Link zitiert)', values: values, color: PHASE_COLORS[phase], dashed: true };
      });

      // Markers from content changes
      var contentChanges = state.contentChangesCache[topicId] || [];
      var markers = contentChanges.map(function (ch) {
        var chDate = ch.changed_at;
        var chTime = new Date(chDate).getTime();
        var closestIndex = 0, closestDiff = Infinity;
        weeks.forEach(function (wk, i) {
          // Convert "2026-W28" to a comparable date
          var m2 = wk.match(/^(\d{4})-W(\d{2})$/);
          if (!m2) return;
          var year2 = parseInt(m2[1]), week2 = parseInt(m2[2]);
          var jan4 = new Date(Date.UTC(year2, 0, 4));
          var dow = jan4.getUTCDay() || 7;
          var weekMs = jan4.getTime() + (week2 - 1) * 7 * 86400000 - (dow - 1) * 86400000;
          var diff = Math.abs(weekMs - chTime);
          if (diff < closestDiff) { closestDiff = diff; closestIndex = i; }
        });
        return {
          index: closestIndex,
          label: (CONTENT_CHANGE_TYPE_LABELS[ch.change_type] || ch.change_type) + ': ' + ch.description,
          date: chDate,
        };
      });

      var chartCard = document.createElement('div');
      chartCard.className = 'cvz-card';
      chartCard.innerHTML =
        buildLineChartSvg(series.concat(seriesWithUrl), xLabels, { maxY: 100, markers: markers }) +
        '<div class="cvz-chart-legend">' +
          PHASE_ORDER.map(function (phase) {
            return '<span class="cvz-chart-legend-item"><span class="cvz-legend-dot" style="background:' + PHASE_COLORS[phase] + '"></span>' + escapeHtml(PHASE_LABELS[phase] || phase) + '</span>';
          }).join('') +
        '</div>' +
        '<p class="cvz-chart-caption">Durchgezogene Linie: als Quelle genannt (own_domain_cited). Gestrichelte Linie: davon mit echtem Link zitiert (own_domain_cited_with_url) — beides 0–100 % pro Journey-Phase und Woche, gemittelt über alle KI-Kanäle. Senkrechte Linien markieren eingetragene Content-Änderungen.</p>';
      chartSection.appendChild(chartCard);
    }
    wrap.appendChild(chartSection);

    // Timeline: Content-Änderungen (user-logged) + detail.changelog (system)
    // GEAENDERT (18.09.2026): Eintraege mit change_type 'aktionsplan'
    // (automatisch beim Erledigen eines Aktionsplan-Items angelegt, siehe
    // main.py toggle_action_plan_item_endpoint) werden hier bewusst
    // ausgeblendet. Sie bleiben in "Content-Änderungen & Events" sowie als
    // Marker im Trend-Chart sichtbar, sollen aber nicht zusätzlich in der
    // Änderungs-Chronik auftauchen.
    var combined = [];
    (state.contentChangesCache[topicId] || []).forEach(function (ch) {
      if (ch.change_type === 'aktionsplan') return;
      combined.push({
        date: ch.changed_at,
        type: 'change',
        typeLabel: CONTENT_CHANGE_TYPE_LABELS[ch.change_type] || ch.change_type,
        text: ch.description,
        url: ch.url || null,
        color: '#0d9488',
      });
    });
    (detail.changelog || []).forEach(function (entry) {
      combined.push({
        date: entry.created_at ? entry.created_at.slice(0, 10) : '',
        type: 'system',
        typeLabel: 'System-Erkennung',
        text: entry.entry_text || '',
        url: null,
        color: '#8878ca',
      });
    });
    // Sort by date descending
    combined.sort(function (a, b) { return b.date.localeCompare(a.date); });

    if (combined.length > 0) {
      var timelineSection = document.createElement('div');
      timelineSection.className = 'cvz-section';
      var tlHeading = document.createElement('p');
      tlHeading.className = 'cvz-section-label';
      tlHeading.textContent = 'Änderungs-Chronik';
      timelineSection.appendChild(tlHeading);
      var tlSub = document.createElement('p');
      tlSub.className = 'cvz-card-placeholder-text';
      tlSub.style.marginBottom = '12px';
      tlSub.textContent = 'Alle eingetragenen Content-Änderungen und System-Erkennungen, chronologisch.';
      timelineSection.appendChild(tlSub);

      var timeline = document.createElement('div');
      timeline.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
      combined.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'cvz-card';
        row.style.cssText = 'display:flex;gap:12px;align-items:flex-start;padding:10px 14px;';

        var dot = document.createElement('div');
        dot.style.cssText = 'flex-shrink:0;width:10px;height:10px;border-radius:50%;background:' + item.color + ';margin-top:3px;';
        row.appendChild(dot);

        var inner = document.createElement('div');
        inner.style.cssText = 'flex:1 1 0;';

        var meta = document.createElement('p');
        meta.style.cssText = 'margin:0 0 2px;font-size:11px;color:var(--cvz-text-muted,#6b7280);';
        meta.textContent = item.date + ' · ' + item.typeLabel;
        inner.appendChild(meta);

        var text = document.createElement('p');
        text.style.cssText = 'margin:0;font-size:13px;line-height:1.4;';
        text.textContent = item.text;
        inner.appendChild(text);

        if (item.url) {
          var link = document.createElement('a');
          link.href = item.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.style.cssText = 'font-size:12px;color:var(--cvz-teal,#0d9488);word-break:break-all;';
          link.textContent = item.url;
          inner.appendChild(link);
        }

        row.appendChild(inner);
        timeline.appendChild(row);
      });
      timelineSection.appendChild(timeline);
      wrap.appendChild(timelineSection);
    }

    // Visibility trend from prompt data (weekly cite/mention rates)
    var visWeeks = state.visibilityTrendCache[topicId];
    if (visWeeks && visWeeks.length >= 2) {
      wrap.appendChild(renderVisibilityTrendSection(visWeeks, false, detail.changelog));
    }

    return wrap;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
