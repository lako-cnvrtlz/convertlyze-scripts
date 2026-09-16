(function () {
  'use strict';

  // =========================================================================
  // KONFIGURATION
  // =========================================================================
  var CONFIG = {
    apiBaseUrl: 'https://visibility-tracker-production-741c.up.railway.app',
    stripeCheckoutUrl: 'https://<euer-supabase-projekt>.supabase.co/functions/v1/stripe-topic-slot-checkout',
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
    // NEU (16.09.2026): Journey-Map-Tab
    dashboardDataCache: {},
    isLoadingDashboard: false,
    isSubmittingContentChange: false,
    contentChangeDraft: { changed_at: '', change_type: 'neue_seite', description: '', url: '' },
    contentChangesCache: {},
    isLoadingContentChanges: false,
    journeyActivePhase: null,
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

    var hasCollecting = state.allTopics.some(function (t) { return t.status === 'collecting'; });
    if (!hasCollecting) return;

    state.pollTimer = setInterval(async function () {
      try {
        await loadTopics();
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
        phase_scores: {
          exploration: { chat_gpt: { score: 62, cited: 5, total: 8 }, gemini: { score: 75, cited: 6, total: 8 }, google_ai: { score: 50, cited: 4, total: 8 }, google_organic: { score: 44, cited: 4, total: 9 } },
          evaluation:  { chat_gpt: { score: 40, cited: 4, total: 10 }, gemini: { score: 55, cited: 6, total: 11 }, google_ai: { score: 36, cited: 4, total: 11 }, google_organic: { score: 39, cited: 4, total: 10 } },
          comparison:  { chat_gpt: { score: 22, cited: 2, total: 9 }, gemini: { score: 33, cited: 3, total: 9 }, google_ai: { score: 11, cited: 1, total: 9 }, google_organic: { score: 28, cited: 3, total: 11 } },
          decision:    { chat_gpt: { score: 14, cited: 1, total: 7 }, gemini: { score: 28, cited: 2, total: 7 }, google_ai: { score: 0, cited: 0, total: 7 }, google_organic: { score: 17, cited: 1, total: 6 } },
        },
        weekly_timeseries: { weeks: [], series: {} },
        share_of_voice: {
          exploration: [{ domain: 'hotjar.com', citation_rate: 0.75, cited_count: 6, total_runs: 8, content_type: 'produktseite', summary: 'Heatmap-Tool mit Fokus auf Nutzerverhaltensanalyse.', differentiation_suggestion: 'KI-gestützte Interpretation der Heatmap-Daten hervorheben.' }],
          evaluation:  [{ domain: 'optimizely.com', citation_rate: 0.6, cited_count: 6, total_runs: 10, content_type: 'produktseite', summary: 'Enterprise A/B-Testing Plattform.', differentiation_suggestion: 'Einstiegshürde und Self-Service-Fokus betonen.' }],
          comparison:  [{ domain: 'vwo.com', citation_rate: 0.55, cited_count: 5, total_runs: 9, content_type: 'vergleichsartikel', summary: 'Vergleichsseiten für CRO-Tools.', differentiation_suggestion: 'Eigene Vergleichsseite mit neutralem Ton aufbauen.' }],
          decision:    [{ domain: 'capterra.de', citation_rate: 0.42, cited_count: 3, total_runs: 7, content_type: 'review_plattform', summary: 'Software-Bewertungsplattform.', differentiation_suggestion: 'Mehr verifizierte Reviews für höhere Sichtbarkeit auf Review-Plattformen sammeln.' }],
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
      state.dashboardDataCache[topicId] = null;
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
        };
        state.contentChangesCache[topicId] = [mockChange].concat(state.contentChangesCache[topicId] || []);
      }
      state.contentChangeDraft = { changed_at: '', change_type: 'neue_seite', description: '', url: '' };
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
    if (topic && topic.status === 'collecting') {
      maybeStartPolling();
    }
    state.isLoadingDetail = true;
    updateUrlParams({ cvz_topic: topicId, cvz_project: state.activeProjectId, cvz_tab: resetTab !== false ? null : state.activeSubTab });
    render();

    try {
      var cachedDetail = state.topicDetailCache[topicId];
      if (!cachedDetail || (cachedDetail.topic && cachedDetail.topic.status === 'collecting')) {
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
    exploration: '#6366f1',
    evaluation:  '#0ea5e9',
    comparison:  '#10b981',
    decision:    '#f59e0b',
  };

  var CHANNEL_ORDER = ['chat_gpt', 'gemini', 'google_ai', 'google_organic'];
  var CHANNEL_LABELS = {
    chat_gpt:       'ChatGPT',
    gemini:         'Gemini',
    google_ai:      'Google AI Overview',
    google_organic: 'Google Organic',
  };

  var CONTENT_CHANGE_TYPE_LABELS = {
    neue_seite:   'Neue Seite',
    ueberarbeitung: 'Überarbeitung',
    kampagne:     'Kampagne',
    sonstiges:    'Sonstiges',
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
    fachartikel:       'Fachartikel',
    video:             'Video',
    forum:             'Forum',
    sonstiges:         'Sonstiges',
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

  // GEÄNDERT (16.09.2026): 7 Tabs → 4 fokussierte Views (Kundenwunsch:
  // Marketer-freundliches Frontend mit klarer Struktur).
  var TOPIC_TABS = [
    { id: 'situation', label: 'Situation' },
    { id: 'journey', label: 'Journey Map' },
    { id: 'aktionsplan', label: 'Aktionsplan' },
    { id: 'verlauf', label: 'Verlauf' },
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
    section.appendChild(table);
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
            ? '<br><span class="cvz-run-error-detail">' + escapeHtml(detail.topic.last_run_error) + '</span>'
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
          ':<br><span class="cvz-run-error-detail">' + escapeHtml(detail.topic.last_run_error) + '</span>' +
        '</p>';
      wrap.appendChild(softErrorBanner);
    }

    wrap.appendChild(renderTabNav(TOPIC_TABS, state.activeSubTab));

    var tabContent = document.createElement('div');
    tabContent.className = 'cvz-tab-content';

    // GEÄNDERT (16.09.2026): 4 fokussierte Views statt 7 Tabs
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
      archivedNotice = '<p class="cvz-archived-notice">Archiviert – es werden aktuell keine neuen Datenläufe für dieses Thema gestartet. Alle bisher gesammelten Daten bleiben unten sichtbar.</p>';
    } else if (topic.status === 'active' && topic.archive_effective_at) {
      var archiveDate = formatShortDate(topic.archive_effective_at);
      archivedNotice = '<p class="cvz-archived-notice">Deaktivierung vorgemerkt' +
        (archiveDate ? ' für ' + archiveDate : '') +
        ' – bis dahin laufen die regulären Datenläufe für dieses Thema noch normal weiter.</p>';
    } else if (topic.status === 'queued') {
      archivedNotice = '<p class="cvz-archived-notice">Wartet auf einen freien Themen-Slot – der erste Datenlauf startet automatisch, kann nach Freiwerden eines Slots aber bis zu 30 Minuten dauern.</p>';
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

    var THIN_DATA_NOTE = '<p class="cvz-thin-data-note">Datenbasis hierf\u00fcr noch d\u00fcnn \u2014 die Einschätzung wird mit mehr gesammelten Daten pr\u00e4ziser.</p>';

    var strength = detail.competitor_strength;
    if (strength && strength.strongest_domain) {
      html += '<div class="cvz-summary-subsection">' +
        '<p class="cvz-section-label">St\u00e4rkster Wettbewerber</p>' +
        '<p class="cvz-summary-text"><strong>' + escapeHtml(strength.strongest_domain) + '</strong>' +
        (strength.reasoning ? ' \u2014 ' + escapeHtml(strength.reasoning) : '') +
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
      var phaseRowsHtml = PHASE_ORDER.map(function (phase) {
        var p = phaseSummaries[phase];
        if (!p || !p.summary) return '';
        var chips = (p.recommended_content_types || []).map(function (ct) {
          return '<span class="cvz-persona-chip">' + escapeHtml(ct) + '</span>';
        }).join('');
        return (
          '<tr>' +
            '<td><strong>' + escapeHtml(PHASE_LABELS[phase] || phase) + '</strong></td>' +
            '<td>' + escapeHtml(p.summary) + (phasenDuenn[phase] ? THIN_DATA_NOTE : '') + '</td>' +
            '<td>' + (chips ? '<div class="cvz-persona-filter" style="margin:0;">' + chips + '</div>' : '\u2013') + '</td>' +
          '</tr>'
        );
      }).join('');
      if (phaseRowsHtml) {
        html += '<div class="cvz-summary-subsection">' +
          '<p class="cvz-section-label">Je Phase</p>' +
          '<table class="cvz-table"><thead><tr><th>Phase</th><th>Einsch\u00e4tzung</th><th>Empfohlene Content-Typen</th></tr></thead>' +
          '<tbody>' + phaseRowsHtml + '</tbody></table>' +
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

    return html;
  }

  // NEU (15.09.2026): siehe main.py: _compute_best_content_chances.
  var CONTENT_CHANCE_KIND_LABELS = {
    seo_naeher_top10: 'Nah an/in Google Top 10, KI-unsichtbar',
    erste_ki_zitierung: 'Erste KI-Zitierung, ausbaufähig',
  };

  function renderBestContentChancesSection(chances) {
    if (!chances || chances.length === 0) return null;

    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Beste Content-Chancen';
    section.appendChild(heading);

    var grid = document.createElement('div');
    grid.className = 'cvz-opportunity-grid';
    chances.forEach(function (chance) {
      var card = document.createElement('div');
      card.className = 'cvz-card cvz-idea-card';
      card.innerHTML =
        '<p class="cvz-opportunity-type">' + escapeHtml(CONTENT_CHANCE_KIND_LABELS[chance.kind] || chance.kind) + '</p>' +
        '<p class="cvz-opportunity-description">' + escapeHtml(chance.label) + '</p>' +
        '<p class="cvz-opportunity-topic">' + escapeHtml(chance.detail) + '</p>';
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
        'Keywords, fuer die Google eure Domain bereits rankt (GSC oder organisch), sortiert nach Suchvolumen. ' +
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
              (ownPos != null && ownPos <= 10 ? 'color:#16a34a;font-weight:600;' : 'color:var(--cvz-text-muted,#6b7280);') + '">' +
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
      heading.textContent = 'Chancen: Zitierungs-Luecken';
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
      platHeading.textContent = 'Plattformen mit Veroeffentlichungs-Chance';
      wrap.appendChild(platHeading);

      var platIntro = document.createElement('p');
      platIntro.className = 'cvz-card-placeholder-text';
      platIntro.style.marginBottom = '16px';
      platIntro.textContent =
        'Diese Plattformen wurden von KI-Modellen als Quellen zitiert und normale Nutzer koennen dort eigene Inhalte veroeffentlichen (z. B. Foren, Bewertungsportale, YouTube, Wikipedia).';
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

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'cvz-create-toggle-btn';
    toggleBtn.setAttribute('data-cvz-competitor-manage-toggle', topicId);
    toggleBtn.textContent = (isOpen ? '\u2212 ' : '+ ') + 'Wettbewerber bearbeiten (' + activeDomains.length + ' aktiv)';
    section.appendChild(toggleBtn);

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
      '<input type="text" id="cvz-competitor-manual-input" class="cvz-changelog-input" placeholder="eigene-domain.de">' +
      '<button type="button" class="cvz-create-toggle-btn" data-cvz-competitor-manual-add="' + topicId + '">Hinzuf\u00fcgen</button>';
    section.appendChild(manualRow);

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

    var profileByDomain = {};
    (sourceProfiles || []).forEach(function (p) {
      profileByDomain[normalizeDomainForMatch(p.domain)] = p;
    });
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

    var form = document.createElement('div');
    form.className = 'cvz-changelog-form';
    form.innerHTML =
      '<textarea id="cvz-changelog-input" class="cvz-changelog-input" rows="2" ' +
        'placeholder="Was habt ihr ge\u00e4ndert? (z.B. Preistabelle als Vergleichstabelle umgebaut)">' +
        escapeHtml(state.changelogDraft || '') +
      '</textarea>' +
      '<button type="button" class="cvz-changelog-submit-btn" data-cvz-changelog-submit ' +
        (state.isSubmittingChangelog ? 'disabled' : '') + '>' +
        (state.isSubmittingChangelog ? 'Wird gespeichert \u2026' : 'Eintragen') +
      '</button>';
    section.appendChild(form);
    var textareaEl = form.querySelector('#cvz-changelog-input');
    textareaEl.addEventListener('input', function () {
      state.changelogDraft = textareaEl.value;
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
      var phaseColor = PHASE_COLORS[phase] || '#94a3b8';

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
      noneHeading.style.borderLeftColor = '#94a3b8';
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

    var statusLine = document.createElement('p');
    statusLine.className = 'cvz-prompt-run-status';
    statusLine.textContent = run.own_domain_cited
      ? '\u2713 zitiert' + (run.own_domain_citation_position ? ' (Position ' + run.own_domain_citation_position + ')' : '')
      : (run.own_domain_mentioned ? '\u2013 nur erw\u00e4hnt, nicht zitiert' : '\u2717 in dieser Antwort nicht sichtbar');
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
      var inPhase = prompts.filter(function (p) { return p.phase === phase; });
      var counts = { green: 0, yellow: 0, red: 0, unknown: 0 };
      inPhase.forEach(function (p) {
        var key = p.visibility_status || 'unknown';
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
    clarification.textContent = 'Zeigt, ob eure eigene Domain zitiert wurde \u2014 ein zitierter Wettbewerber im selben Prompt z\u00e4hlt hier nicht mit (siehe Wettbewerber-Tab).';
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
        '<p class="cvz-phase-rollup-count">' + row.counts.green + ' von ' + row.total + ' zitiert</p>';
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

    wrap.innerHTML =
      '<input type="text" id="cvz-manual-keyword-input" class="cvz-changelog-custom-input" style="flex:1;min-width:140px;" ' +
        'placeholder="Eigenes Keyword hinzuf\u00fcgen (' + manualCount + '/' + MAX_MANUAL_KEYWORDS + ')" ' +
        'value="' + escapeHtml(state.manualKeywordDraftText || '') + '">' +
      '<button type="button" class="cvz-changelog-submit-btn" data-cvz-manual-keyword-submit="' + topicId + '" ' +
        (state.isSubmittingManualKeyword ? 'disabled' : '') + '>' +
        (state.isSubmittingManualKeyword ? 'Wird gespeichert \u2026' : 'Hinzuf\u00fcgen') +
      '</button>';

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

    var phaseOptionsHtml = PHASE_ORDER.map(function (phase) {
      return '<option value="' + phase + '"' + (state.manualPromptDraftPhase === phase ? ' selected' : '') + '>' +
        escapeHtml(PHASE_LABELS[phase] || phase) + '</option>';
    }).join('');

    wrap.innerHTML =
      '<textarea id="cvz-manual-prompt-input" class="cvz-changelog-input" rows="1" ' +
        'placeholder="Eigenen Prompt hinzuf\u00fcgen (' + manualCount + '/' + MAX_MANUAL_PROMPTS + ')">' +
        escapeHtml(state.manualPromptDraftText || '') +
      '</textarea>' +
      '<select id="cvz-manual-prompt-phase" class="cvz-changelog-custom-input" style="max-width:160px;">' +
        phaseOptionsHtml +
      '</select>' +
      '<button type="button" class="cvz-changelog-submit-btn" data-cvz-manual-prompt-submit="' + topicId + '" ' +
        (state.isSubmittingManualPrompt ? 'disabled' : '') + '>' +
        (state.isSubmittingManualPrompt ? 'Wird gespeichert \u2026' : 'Hinzuf\u00fcgen') +
      '</button>';

    var textareaEl = wrap.querySelector('#cvz-manual-prompt-input');
    textareaEl.addEventListener('input', function () {
      state.manualPromptDraftText = textareaEl.value;
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
          ? '<span class="cvz-prompt-citation-count">' + prompt.cited_count + '/' + prompt.total_runs + ' zitiert</span>'
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

        var row = document.createElement('div');
        row.className = 'cvz-prompt-row' + (enableCitations ? ' cvz-prompt-row-clickable' : '');
        if (enableCitations) row.setAttribute('data-cvz-prompt-toggle', prompt.id);
        row.innerHTML =
          '<span class="cvz-dot ' + dotClass + '" title="' + escapeHtml(statusLabel) + '"></span>' +
          '<span class="cvz-prompt-text">' + escapeHtml(prompt.prompt_text) + '</span>' +
          citationBadge +
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

  function renderGscBlock(gscRows, topicId, changelogEntries) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Google-Search-Console-Performance';
    section.appendChild(heading);

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
    section.appendChild(table);
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
    sub.textContent = 'Wie oft wird eure Domain pro Phase und Kanal zitiert (0–100 %).';
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
        if (ch.total > 0) {
          num.title = ch.cited + ' von ' + ch.total + ' Prompts zitiert';
        }
        row.appendChild(num);

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
          var pct = Math.round((comp.citation_rate || 0) * 100);
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
        phaseBlock.appendChild(table);
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

  function renderContentChangesSection(topicId) {
    var section = document.createElement('div');
    section.className = 'cvz-section';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Content-Änderungen & Events';
    section.appendChild(heading);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '12px';
    sub.textContent = 'Halte fest, wann ihr was geändert habt — so könnt ihr später sehen, ob sich die Sichtbarkeit danach verändert hat.';
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

    // List
    var changes = state.contentChangesCache[topicId] || [];
    if (state.isLoadingContentChanges) {
      var loadEl = document.createElement('p');
      loadEl.className = 'cvz-card-placeholder-text';
      loadEl.style.marginTop = '12px';
      loadEl.innerHTML = '<span class="cvz-spinner"></span>Lädt…';
      section.appendChild(loadEl);
    } else if (changes.length === 0) {
      var emptyEl = document.createElement('p');
      emptyEl.className = 'cvz-card-placeholder-text';
      emptyEl.style.marginTop = '12px';
      emptyEl.textContent = 'Noch keine Änderungen eingetragen.';
      section.appendChild(emptyEl);
    } else {
      var list = document.createElement('div');
      list.className = 'cvz-content-change-list';
      changes.forEach(function (ch) {
        var item = document.createElement('div');
        item.className = 'cvz-content-change-item';
        var dateStr = ch.changed_at ? ch.changed_at.slice(0, 10) : '';
        var typeLabel = CONTENT_CHANGE_TYPE_LABELS[ch.change_type] || ch.change_type || '';
        item.innerHTML =
          '<span class="cvz-content-change-date">' + escapeHtml(dateStr) + '</span>' +
          '<span class="cvz-opportunity-type">' + escapeHtml(typeLabel) + '</span>' +
          '<span class="cvz-content-change-desc">' + escapeHtml(ch.description || '') + '</span>' +
          (ch.url ? '<a class="cvz-content-change-url" href="' + escapeHtml(ch.url) + '" target="_blank" rel="noopener">Link ↗</a>' : '');
        list.appendChild(item);
      });
      section.appendChild(list);
    }

    return section;
  }

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
      '.cvz-collecting-banner-text { font-size: 13px; color: var(--cvz-text); margin: 0; flex: 1 1 320px; }' +
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

      '.cvz-tab-nav { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--cvz-border); margin-bottom: 20px; }' +
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
      '.cvz-status-error { color: var(--cvz-red); border-color: var(--cvz-red); }' +
      '.cvz-status-archived { color: var(--cvz-text-muted); border-color: var(--cvz-border); }' +
      '.cvz-status-queued { color: var(--cvz-text-muted); border-color: var(--cvz-border); }' +
      '.cvz-create-info { width: 100%; font-size: 13px; color: var(--cvz-text-muted); margin: 6px 0 0; }' +
      '.cvz-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 16px; }' +
      '.cvz-modal-box { background: #141b24; border: 1px solid #232b36; border-radius: 4px; padding: 20px; max-width: 380px; width: 100%; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }' +
      '.cvz-modal-title { font-family: "Geist", sans-serif; font-size: 15px; font-weight: 600; color: #e6edf3; margin: 0 0 8px; }' +
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
      '.cvz-section-title { margin: 0 0 4px; font-size: 22px; }' +

      '.cvz-summary-card { margin-bottom: 24px; }' +
      '.cvz-summary-text { font-size: 15px; line-height: 1.5; margin: 12px 0 0; }' +
      '.cvz-summary-subsection { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--cvz-border); }' +
      '.cvz-summary-phase-block { margin-top: 12px; }' +
      '.cvz-thin-data-note { font-size: 12px; color: var(--cvz-text-muted); font-style: italic; margin: 6px 0 0; }' +

      '.cvz-opportunity-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }' +
      '.cvz-opportunity-card { border-left: 3px solid var(--cvz-red); padding: 16px; }' +
      '.cvz-idea-card { border-left: 3px solid var(--cvz-teal); padding: 16px; }' +
      '.cvz-opportunity-type { margin: 0 0 6px; font-size: 13px; font-weight: 600; color: var(--cvz-red); }' +
      '.cvz-opportunity-description { margin: 0 0 8px; font-size: 14px; line-height: 1.4; color: var(--cvz-text); }' +
      '.cvz-opportunity-topic { margin: 0; font-size: 11px; color: var(--cvz-text-muted); }' +
      '.cvz-action-recommendation { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--cvz-border); }' +
      '.cvz-competitor-prompt-list { margin: 2px 0 8px; padding-left: 16px; font-size: 12px; color: var(--cvz-text-muted); }' +
      '.cvz-competitor-prompt-list li { margin: 2px 0; }' +

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
      '.cvz-gsc-page-url { color: var(--cvz-teal); font-size: 11px; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; display: inline-block; vertical-align: middle; }' +
        '.cvz-gsc-cell-url { max-width: 150px; overflow: hidden; }' +
        '.cvz-gsc-cell-linked { color: var(--cvz-teal); max-width: 280px; }' +
      '.cvz-gsc-row-clickable { cursor: pointer; }' +
      '.cvz-gsc-row-clickable:hover { background: rgba(79, 209, 197, 0.06); }' +

      '.cvz-phase-heading { font-family: "Syne", sans-serif; font-size: 14px; margin: 16px 0 8px; color: var(--cvz-text-muted); }' +
      '.cvz-prompt-list { display: flex; flex-direction: column; gap: 4px; }' +
      '.cvz-prompt-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 14px; }' +
      '.cvz-prompt-text { flex: 1; }' +
      '.cvz-prompt-source { font-size: 11px; color: var(--cvz-text-muted); }' +
      '.cvz-prompt-citation-count { font-size: 11px; color: var(--cvz-teal); white-space: nowrap; }' +
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

      '.cvz-phase-rollup-grid { display: flex; flex-wrap: wrap; gap: 16px; margin: 8px 0 20px; }' +
      '.cvz-phase-rollup-card { flex: 1; min-width: 140px; }' +
      '.cvz-phase-rollup-label { font-size: 13px; margin: 0 0 6px; color: var(--cvz-text); }' +
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
      '.cvz-week-detail-row { font-size: 13px; margin: 4px 0; color: var(--cvz-text); }' +

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
      '.cvz-changelog-cell-linked { color: var(--cvz-teal); white-space: nowrap; }' +
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
      '.cvz-changelog-linked { font-size: 11px; color: var(--cvz-teal); margin: 2px 0; }' +
      '.cvz-changelog-linked-badge { color: var(--cvz-teal); font-size: 12px; }' +
      '.cvz-prompt-linked-changelog { margin: 0 0 12px; }' +
      '.cvz-serp-results-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }' +
      '.cvz-serp-results-list li { display: flex; align-items: center; gap: 6px; font-size: 12px; }' +
      '.cvz-serp-results-list a { color: var(--cvz-text); text-decoration: none; }' +
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
        'flex: 0 0 32px; text-align: right; font-size: 11px; color: var(--cvz-text); font-variant-numeric: tabular-nums;' +
      '}' +

      '.cvz-sov-phase-block { margin-bottom: 8px; border: 1px solid var(--cvz-border); }' +
      '.cvz-sov-phase-header {' +
        'width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 16px;' +
        'background: var(--cvz-navy-raised); border: none; color: var(--cvz-text); cursor: pointer; text-align: left;' +
        'font-family: "Geist", sans-serif; font-size: 14px;' +
      '}' +
      '.cvz-sov-phase-header:hover { background: var(--cvz-navy); }' +
      '.cvz-sov-phase-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }' +
      '.cvz-sov-phase-title { font-weight: 600; flex: 1; }' +
      '.cvz-sov-phase-count { font-size: 12px; color: var(--cvz-text-muted); }' +
      '.cvz-sov-chevron { font-size: 11px; color: var(--cvz-text-muted); }' +
      '.cvz-sov-table { width: 100%; border-collapse: collapse; font-size: 13px; }' +
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
      '.cvz-prompt-phase-heading {font-family: "Syne", sans-serif; font-size: 13px; margin: 16px 0 6px; padding-left: 8px; border-left: 3px solid var(--cvz-teal); color: var(--cvz-text-muted); }' +
      '.cvz-prompt-source-summary {font-size: 12px; color: var(--cvz-text-muted); margin-bottom: 8px; padding: 5px 8px; background: var(--cvz-navy-raised); border-radius: 4px; font-variant-numeric: tabular-nums; }' +
      '.cvz-competitor-url-row { overflow: hidden; white-space: nowrap; max-width: 100%; }' +
      '.cvz-competitor-url {display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cvz-teal); font-size: 12px; text-decoration: none; max-width: 100%; }' +
      '.cvz-competitor-url:hover { text-decoration: underline; }';

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
  function renderSituationTab(topicId, detail) {
    var wrap = document.createElement('div');

    // Phase-Score-Übersicht (Dashboard-Daten, falls geladen)
    var dashData = state.dashboardDataCache[topicId];
    if (state.isLoadingDashboard) {
      var loadEl = document.createElement('p');
      loadEl.className = 'cvz-card-placeholder-text';
      loadEl.innerHTML = '<span class="cvz-spinner"></span>KI-Sichtbarkeit wird geladen…';
      wrap.appendChild(loadEl);
    } else if (dashData && dashData.phase_scores) {
      // Kompakte Phasen-Scorecard (eigene Zitierrate als Balken)
      var phaseSection = document.createElement('div');
      phaseSection.className = 'cvz-section';
      var phaseHeading = document.createElement('p');
      phaseHeading.className = 'cvz-section-label';
      phaseHeading.textContent = 'KI-Sichtbarkeit nach Journey-Phase';
      phaseSection.appendChild(phaseHeading);
      var phaseSub = document.createElement('p');
      phaseSub.className = 'cvz-card-placeholder-text';
      phaseSub.style.marginBottom = '12px';
      phaseSub.textContent = 'Anteil der KI-Prompts pro Phase, in denen eure Domain zitiert wird (0–10 = schwach, 40+ = stark).';
      phaseSection.appendChild(phaseSub);
      var phaseGrid = document.createElement('div');
      phaseGrid.className = 'cvz-journey-phase-grid';
      PHASE_ORDER.forEach(function (phase) {
        var scores = (dashData.phase_scores || {})[phase] || {};
        var color = PHASE_COLORS[phase] || '#8b98a5';
        // Top competitor for this phase
        var topComp = ((dashData.share_of_voice || {})[phase] || [])[0];
        var card = document.createElement('div');
        card.className = 'cvz-journey-phase-card';
        card.style.borderTopColor = color;
        var nameEl = document.createElement('p');
        nameEl.className = 'cvz-journey-phase-name';
        nameEl.style.color = color;
        nameEl.textContent = PHASE_LABELS[phase] || phase;
        card.appendChild(nameEl);
        // Own score: average across channels
        var totalScore = 0, channelCount = 0;
        CHANNEL_ORDER.forEach(function (ch) {
          var s = scores[ch];
          if (s && s.total > 0) { totalScore += (s.score || 0); channelCount++; }
        });
        var avgScore = channelCount > 0 ? Math.round(totalScore / channelCount) : 0;
        var ownRow = document.createElement('div');
        ownRow.className = 'cvz-journey-channel-row';
        ownRow.innerHTML =
          '<span class="cvz-journey-channel-label" style="font-weight:600;">Eure Domain</span>' +
          '<div class="cvz-journey-bar-wrap"><div class="cvz-journey-bar-fill" style="width:' + avgScore + '%;background:' + color + '"></div></div>' +
          '<span class="cvz-journey-channel-num" style="font-weight:600;">' + avgScore + '%</span>';
        card.appendChild(ownRow);
        // Top competitor bar
        if (topComp) {
          var compPct = Math.round((topComp.citation_rate || 0) * 100);
          var compRow = document.createElement('div');
          compRow.className = 'cvz-journey-channel-row';
          compRow.innerHTML =
            '<span class="cvz-journey-channel-label" style="color:var(--cvz-text-muted,#6b7280);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(topComp.domain) + '">' + escapeHtml(topComp.domain) + '</span>' +
            '<div class="cvz-journey-bar-wrap"><div class="cvz-journey-bar-fill" style="width:' + compPct + '%;background:#e5e7eb"></div></div>' +
            '<span class="cvz-journey-channel-num" style="color:var(--cvz-text-muted,#6b7280);">' + compPct + '%</span>';
          card.appendChild(compRow);
          var vsLabel = document.createElement('p');
          vsLabel.style.cssText = 'margin:4px 0 0;font-size:10px;color:var(--cvz-text-muted,#6b7280);';
          var diff = avgScore - compPct;
          vsLabel.textContent = diff >= 0
            ? '+' + diff + 'pp vor Top-Wettbewerber'
            : diff + 'pp hinter ' + topComp.domain;
          vsLabel.style.color = diff >= 0 ? '#16a34a' : '#dc2626';
          card.appendChild(vsLabel);
        }
        phaseGrid.appendChild(card);
      });
      phaseSection.appendChild(phaseGrid);
      wrap.appendChild(phaseSection);
    } else if (!dashData) {
      // Fallback: show phase rollup from prompts
      var rollup = renderPhaseRollup(detail.prompts);
      if (rollup) wrap.appendChild(rollup);
    }

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
      var oppHeading = document.createElement('p');
      oppHeading.className = 'cvz-section-label';
      oppHeading.textContent = 'Wichtigste Handlungsfelder';
      oppSection.appendChild(oppHeading);
      var oppGrid = document.createElement('div');
      oppGrid.className = 'cvz-opportunity-grid';
      var PRIORITY_ORDER = [
        'near_miss_ranking', 'high_demand_low_visibility',
        'google_visible_ai_invisible', 'competitor_citation',
        'ai_visible_competitor_dominates', 'new_question',
      ];
      var sorted = openOpps.slice().sort(function (a, b) {
        return PRIORITY_ORDER.indexOf(a.opportunity_type) - PRIORITY_ORDER.indexOf(b.opportunity_type);
      }).slice(0, 4);
      sorted.forEach(function (opp) {
        var card = document.createElement('div');
        card.className = 'cvz-card cvz-opportunity-card';
        card.innerHTML =
          '<p class="cvz-opportunity-type">' + escapeHtml(OPPORTUNITY_TYPE_LABELS[opp.opportunity_type] || opp.opportunity_type) + '</p>' +
          '<p class="cvz-opportunity-description">' + escapeHtml(opp.description || '') + '</p>' +
          (opp.content_recommendation
            ? '<p style="margin:6px 0 0;font-size:12px;font-weight:600;color:var(--cvz-teal,#0d9488);">' + escapeHtml(opp.content_recommendation) + '</p>'
            : '');
        oppGrid.appendChild(card);
      });
      oppSection.appendChild(oppGrid);
      if (openOpps.length > 4) {
        var moreLink = document.createElement('p');
        moreLink.className = 'cvz-card-placeholder-text';
        moreLink.style.marginTop = '8px';
        moreLink.textContent = 'Alle ' + openOpps.length + ' Handlungsfelder im Aktionsplan-Tab.';
        oppSection.appendChild(moreLink);
      }
      wrap.appendChild(oppSection);
    }

    // Wettbewerber & Quellen (kompakt, nur Manage-Sektion)
    wrap.appendChild(renderCompetitorManageSection(detail, topicId));

    return wrap;
  }

  // ─── JOURNEY MAP ──────────────────────────────────────────────────────────
  // Detaillierte Phasenanalyse: Eigene Sichtbarkeit + welche Wettbewerber-
  // Inhalte dominieren pro Phase + Wettbewerber-Detailtabellen.
  function renderJourneyMapTab(topicId, detail) {
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
      errEl.innerHTML = '<p class="cvz-card-placeholder-text">Noch keine Journey-Map-Daten vorhanden. Diese entstehen nach dem ersten vollstaendigen Analyse-Lauf.</p>' +
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
          var compPct = Math.round((comp.citation_rate || 0) * 100);
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

    // Detaillierte Wettbewerber-Tabellen pro Phase (aufklappbar)
    wrap.appendChild(renderJourneyShareOfVoice(data.share_of_voice));

    // Content-Lücken aus Gap-Analyse
    wrap.appendChild(renderContentGapsSection(detail.content_gaps));

    // Quellen-Analyse (Source Profiles)
    if (detail.source_profiles && detail.source_profiles.length > 0) {
      wrap.appendChild(renderSourceProfilesSection(detail.source_profiles));
    }

    return wrap;
  }

  // ─── AKTIONSPLAN ──────────────────────────────────────────────────────────
  // Priorisierte, unified Action-Liste: alle Opportunities + Content-Ideen
  // + Keywords mit Ranking-Chance, nach Impact-Priorität sortiert.
  function renderAktionsplanTab(detail) {
    var wrap = document.createElement('div');

    var intro = document.createElement('p');
    intro.className = 'cvz-card-placeholder-text';
    intro.style.marginBottom = '20px';
    intro.textContent = 'Alle konkreten Aktionen nach Hebel-Wirkung sortiert. Oben = groesster Impact zuerst.';
    wrap.appendChild(intro);

    var PRIORITY_ORDER = [
      'near_miss_ranking', 'high_demand_low_visibility',
      'google_visible_ai_invisible', 'competitor_citation',
      'ai_visible_competitor_dominates', 'new_question',
    ];
    var PRIORITY_IMPACT = {
      near_miss_ranking:               { label: 'Hoch', color: '#dc2626' },
      high_demand_low_visibility:      { label: 'Hoch', color: '#dc2626' },
      google_visible_ai_invisible:     { label: 'Mittel', color: '#d97706' },
      competitor_citation:             { label: 'Mittel', color: '#d97706' },
      ai_visible_competitor_dominates: { label: 'Mittel', color: '#d97706' },
      new_question:                    { label: 'Niedrig', color: '#6b7280' },
    };

    // Build unified action list
    var items = [];

    // 1. Opportunities
    var openOpps = (detail.opportunities || []).filter(function (o) {
      return o.status === 'new' || o.status === 'reviewed';
    });
    openOpps.forEach(function (opp) {
      var impact = PRIORITY_IMPACT[opp.opportunity_type] || { label: 'Mittel', color: '#d97706' };
      items.push({
        priority: PRIORITY_ORDER.indexOf(opp.opportunity_type),
        impactLabel: impact.label,
        impactColor: impact.color,
        category: OPPORTUNITY_TYPE_LABELS[opp.opportunity_type] || opp.opportunity_type,
        title: opp.content_recommendation || opp.description || '',
        detail: opp.description || '',
        extra: null,
        opp: opp,
      });
    });

    // 2. Near-miss keywords (organic_rank 6-20 = push to page 1 candidate)
    var nearMissKws = (detail.search_queries || []).filter(function (kw) {
      var rank = kw.organic_rank != null ? kw.organic_rank : kw.gsc_position;
      return rank != null && rank >= 6 && rank <= 20;
    }).sort(function (a, b) {
      return (b.search_volume || 0) - (a.search_volume || 0);
    }).slice(0, 8);
    nearMissKws.forEach(function (kw) {
      var rank = kw.organic_rank != null ? kw.organic_rank : kw.gsc_position;
      items.push({
        priority: 0.5, // between near_miss_ranking and high_demand
        impactLabel: 'Hoch',
        impactColor: '#dc2626',
        category: 'Google-Ranking ausbauen',
        title: 'Seite 1 möglich: "' + kw.keyword + '"',
        detail: 'Aktuell auf Position ' + Math.round(rank * 10) / 10 + (kw.search_volume ? ' · ' + Number(kw.search_volume).toLocaleString('de-DE') + ' Suchen/Mo.' : '') + '. Wenig Optimierungsaufwand nötig.',
        extra: kw,
      });
    });

    // 3. Content-Ideen
    (detail.content_ideas || []).forEach(function (idea) {
      var colonIdx = (idea.description || '').indexOf(': ');
      var title = colonIdx >= 0 ? idea.description.substring(0, colonIdx) : (idea.description || '');
      var reason = colonIdx >= 0 ? idea.description.substring(colonIdx + 2) : '';
      items.push({
        priority: 10, // after opportunities
        impactLabel: 'Niedrig',
        impactColor: '#6b7280',
        category: (idea.phase ? PHASE_LABELS[idea.phase] + ' · ' : '') + (MODEL_LABELS[idea.provider] || idea.provider || 'KI-Idee'),
        title: title,
        detail: reason,
        extra: null,
      });
    });

    // Sort by priority
    items.sort(function (a, b) { return a.priority - b.priority; });

    if (items.length === 0) {
      var emptyEl = document.createElement('p');
      emptyEl.className = 'cvz-card-placeholder-text';
      emptyEl.textContent = 'Noch keine Aktionen verfügbar. Warte auf den nächsten Analyse-Lauf.';
      wrap.appendChild(emptyEl);
      return wrap;
    }

    // Render as card list with visual priority indicator
    var list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    items.forEach(function (item, idx) {
      var card = document.createElement('div');
      card.className = 'cvz-card';
      card.style.cssText = 'display:flex;gap:12px;align-items:flex-start;padding:14px 16px;';

      // Priority badge (left side)
      var badge = document.createElement('div');
      badge.style.cssText =
        'flex-shrink:0;width:36px;display:flex;flex-direction:column;align-items:center;gap:2px;padding-top:2px;';
      var numEl = document.createElement('span');
      numEl.style.cssText = 'font-size:11px;font-weight:700;color:var(--cvz-text-muted,#6b7280);';
      numEl.textContent = String(idx + 1);
      var impactDot = document.createElement('span');
      impactDot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:' + item.impactColor + ';margin-top:2px;';
      impactDot.title = item.impactLabel + ' Impact';
      badge.appendChild(numEl);
      badge.appendChild(impactDot);
      card.appendChild(badge);

      // Content (right side)
      var content = document.createElement('div');
      content.style.cssText = 'flex:1 1 0;min-width:0;';

      var catEl = document.createElement('p');
      catEl.style.cssText = 'margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--cvz-text-muted,#6b7280);';
      catEl.textContent = item.category;
      content.appendChild(catEl);

      var titleEl = document.createElement('p');
      titleEl.style.cssText = 'margin:0 0 4px;font-size:14px;font-weight:600;line-height:1.4;';
      titleEl.textContent = item.title;
      content.appendChild(titleEl);

      if (item.detail && item.detail !== item.title) {
        var detailEl = document.createElement('p');
        detailEl.style.cssText = 'margin:0;font-size:13px;color:var(--cvz-text-muted,#6b7280);line-height:1.5;';
        detailEl.textContent = item.detail;
        content.appendChild(detailEl);
      }

      // SERP context for near-miss keywords
      if (item.extra && item.extra.keyword && item.extra.top_serp_results && item.extra.top_serp_results.length > 0) {
        var serpSummary = document.createElement('div');
        serpSummary.style.cssText = 'margin-top:8px;font-size:12px;color:var(--cvz-text-muted,#6b7280);';
        serpSummary.innerHTML = renderSerpSummaryBlock(item.extra);
        content.appendChild(serpSummary);
      }

      card.appendChild(content);
      list.appendChild(card);
    });

    wrap.appendChild(list);

    // Plattformen-Chancen (can_publish)
    var publishable = (detail.source_profiles || []).filter(function (p) { return p.can_publish === true; });
    if (publishable.length > 0) {
      var platSection = document.createElement('div');
      platSection.className = 'cvz-section';
      platSection.style.marginTop = '28px';
      var platHeading = document.createElement('p');
      platHeading.className = 'cvz-section-label';
      platHeading.textContent = 'Plattformen mit Veroeffentlichungs-Chance';
      platSection.appendChild(platHeading);
      var platSub = document.createElement('p');
      platSub.className = 'cvz-card-placeholder-text';
      platSub.style.marginBottom = '12px';
      platSub.textContent = 'Von KI-Modellen zitierte Plattformen, auf denen normale Nutzer eigene Inhalte veroeffentlichen koennen (Foren, Bewertungsportale, YouTube etc.).';
      platSection.appendChild(platSub);
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
          (p.content_type ? '<p class="cvz-opportunity-description" style="font-size:12px;color:#888;margin-bottom:4px;">' + escapeHtml(CONTENT_TYPE_LABELS[p.content_type] || p.content_type) + '</p>' : '') +
          (p.summary ? '<p class="cvz-opportunity-description">' + escapeHtml(p.summary) + '</p>' : '') +
          (p.differentiation_suggestion ? '<div class="cvz-action-recommendation"><p class="cvz-changelog-guided-label">Abgrenzung</p><p class="cvz-opportunity-description">' + escapeHtml(p.differentiation_suggestion) + '</p></div>' : '');
        platGrid.appendChild(card);
      });
      platSection.appendChild(platGrid);
      wrap.appendChild(platSection);
    }

    return wrap;
  }

  // ─── VERLAUF ──────────────────────────────────────────────────────────────
  // Monats-Timeline aus Timeseries-Daten + Content-Aenderungen als Marker.
  // Ziel: Marketer kann Aenderungen schnell mit Sichtbarkeits-Effekten korrelieren.
  function renderVerlaufTab(topicId, detail) {
    var wrap = document.createElement('div');

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
        buildLineChartSvg(series, xLabels, { maxY: 100, markers: markers }) +
        '<div class="cvz-chart-legend">' +
          PHASE_ORDER.map(function (phase) {
            return '<span class="cvz-chart-legend-item"><span class="cvz-legend-dot" style="background:' + PHASE_COLORS[phase] + '"></span>' + escapeHtml(PHASE_LABELS[phase] || phase) + '</span>';
          }).join('') +
        '</div>' +
        '<p class="cvz-chart-caption">Durchschnittliche KI-Zitierrate (0–100 %) pro Journey-Phase und Woche, gemittelt über alle KI-Kanäle. Senkrechte Linien markieren eingetragene Content-Änderungen.</p>';
      chartSection.appendChild(chartCard);
    }
    wrap.appendChild(chartSection);

    // Timeline: Content-Änderungen (user-logged) + detail.changelog (system)
    var combined = [];
    (state.contentChangesCache[topicId] || []).forEach(function (ch) {
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
        color: '#6366f1',
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

    // Form to add new content change
    wrap.appendChild(renderContentChangesSection(topicId));

    // Visibility trend from prompt data (weekly cite/mention rates)
    var visWeeks = state.visibilityTrendCache[topicId];
    if (visWeeks && visWeeks.length >= 2) {
      wrap.appendChild(renderVisibilityTrendSection(visWeeks, false, detail.changelog));
    }

    return wrap;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
