/**
 * dashboard-v6.js
 * ----------------
 * Member-Dashboard: Stat-Karten, Aktions-Buttons, Analysen-Liste, PDF-Download,
 * Team-Einladungen (Sichtbarkeit) - komplett aus JS generiert, kein Custom-Attribute-
 * Bauplan mehr in Webflow noetig.
 *
 * Seite: /member/dashboard
 * Embedding: jsDelivr (<script src=".../dashboard-v6.js">)
 * Dependencies: window.supabase (global), window.$memberstackDom
 *
 * BREAKING CHANGE ggue. dashboard-v5.js:
 * In Webflow wird NUR NOCH EIN leerer Container gebraucht:
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
 * - Skeleton-Loading (Shimmer) fuer Stat-Karten + Analysen-Tabelle
 * - Pagination (10 Analysen pro Seite)
 * - Realtime-Updates via Supabase Postgres Changes + Polling-Fallback (10s)
 * - PDF/Word Download via convertlyze-pdf-service
 * - PPU Pay-per-Use Checkout ("Analyse kaufen"-Button, direkt verdrahtet)
 * - "Neue Analyse" / "Neue Landingpage" Buttons
 * - Purchase Success Modal nach Kauf
 * - Aufbau-Sessions-Kontingent (Landingpage-Creation-Agent), Limit aus plans.page_agent_sessions_limit
 *
 * KRITISCH: PDF_SECRET liegt hier als Klartext.
 * Bei Rotation: dashboard-v6.js + Railway PDF Service ENV aktualisieren.
 *
 * OFFENE FRAGE (nicht automatisch geloest): chat_messages_used_current_period /
 * chat_messages_limit werden weiterhin geladen und berechnet, aber NICHT mehr in
 * einer eigenen Karte angezeigt - im Screenshot, an dem sich dieses Redesign
 * orientiert, gab es keine "Chat-Nachrichten"-Karte. Falls die doch irgendwo
 * gebraucht wird, bitte Bescheid geben.
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
    PDF_ACCESS_SOURCES: ['starter', 'pro', 'enterprise', 'pay-per-use', 'beta', 'agency'],
    PAID_PLANS:        ['Starter', 'Growth', 'Pro', 'Professional', 'Enterprise'],
    NEW_ANALYSIS_URL:  '/analyse/formular',
    // TODO: echten Pfad eintragen, sobald die Chat-Seite unter convertlyze.com liegt.
    // WHY doppelt gepflegt: page-projects-embed.html hat dieselbe Konstante,
    // laueft aber als eigenstaendiges, unabhaengiges Script - beide manuell synchron halten.
    NEW_LANDINGPAGE_URL: '/member/landingpage-assistant?new=1',
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
        .select('id, email, full_name, license_type, license_status, license_expires_at, credits_limit, credits_used_current_period, credits_remaining, reserved_credits, chat_messages_limit, chat_messages_used_current_period, period_start_date, next_credit_reset_date, plan_price, owner_user_id, team_role, ppu_credits, reserved_ppu_credits, page_agent_sessions_used_current_period')
        .eq('memberstack_id', memberstackId)
        .single();
 
      if (result.data) {
        if (result.data.owner_user_id) {
          var ownerResult = await window.supabase
            .from('users')
            .select('id, credits_limit, credits_used_current_period, credits_remaining, reserved_credits, license_type, license_status, license_expires_at, next_credit_reset_date, period_start_date, plan_price, page_agent_sessions_used_current_period')
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
  // WHY maybeSingle statt single: nicht jeder license_type hat zwingend eine Zeile in plans
  // (z.B. Pay-per-Use, Beta) - dann ist das Kontingent einfach 0, kein Fehler.
  async function fetchPlanSessionsLimit(planName) {
    if (!planName) return 0;
    var result = await window.supabase
      .from('plans')
      .select('page_agent_sessions_limit')
      .eq('name', planName)
      .maybeSingle();
    if (result.error) {
      console.warn('[CVZ] fetchPlanSessionsLimit:', result.error);
      return 0;
    }
    return result.data ? Math.round(Number(result.data.page_agent_sessions_limit || 0)) : 0;
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
      '.cvz-a-icon-btn.cvz-a-disabled{opacity:.35;pointer-events:none;cursor:not-allowed;}' +
      '.cvz-a-icon-btn.cvz-a-loading-btn svg{animation:cvz-spin 1s linear infinite;}' +
      '.cvz-a-score-cell{display:flex;align-items:center;justify-content:center;}' +
      '.cvz-a-pagination{display:none;align-items:center;justify-content:center;gap:12px;margin-top:20px;}' +
      '.cvz-a-pagebtn{background:var(--cvz-card);border:1px solid var(--cvz-border);color:var(--cvz-muted);' +
        'font-family:inherit;font-size:.85rem;font-weight:600;padding:8px 18px;border-radius:999px;cursor:pointer;}' +
      '.cvz-a-pagebtn:disabled{opacity:.4;cursor:not-allowed;}' +
      '.cvz-a-pagebtn.cvz-a-pagebtn-accent:not(:disabled){color:var(--cvz-teal);border-color:var(--cvz-teal);}' +
      '.cvz-a-pageinfo{background:var(--cvz-card);border:1px solid var(--cvz-border);color:var(--cvz-text);' +
        'font-size:.85rem;font-weight:600;padding:8px 18px;border-radius:999px;}' +
      '@media (max-width:768px){' +
        '.cvz-a-header{display:none;}' +
        '.cvz-a-row{grid-template-columns:1fr 1fr;row-gap:10px;padding:18px 16px;}' +
        '.cvz-a-url,.cvz-a-keyword{grid-column:1/-1;}' +
        '.cvz-a-date{text-align:right;}' +
        '.cvz-a-score-cell{grid-column:1/-1;margin-top:4px;}' +
        '.cvz-a-actions{display:flex!important;grid-column:1/-1;justify-content:center;gap:20px;margin-top:8px;}' +
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
      '<div class="cvz-d-stats">' +
        statCardHtml({ wrapperId: 'cvz-d-c1', iconKey: 'barChart', label: 'Analysen diesen Monat', valueId: 'cvz-d-c1-value', subId: 'cvz-d-c1-sub', withBar: true, barFillId: 'cvz-d-c1-bar' }) +
        statCardHtml({ wrapperId: 'cvz-d-c2', iconKey: 'check',    label: 'Verbleibende Analysen',  valueId: 'cvz-d-c2-value', subId: 'cvz-d-c2-sub', withBar: false }) +
        statCardHtml({ wrapperId: 'cvz-d-c3', iconKey: 'plan',     label: 'Aktiver Plan',            valueId: 'cvz-d-c3-value', subId: 'cvz-d-c3-sub', withBar: false }) +
        statCardHtml({ wrapperId: 'cvz-d-c4', iconKey: 'cart',     label: 'Pay-per-Use Analysen',    valueId: 'cvz-d-c4-value', subId: 'cvz-d-c4-sub', withBar: false, hidden: true }) +
        statCardHtml({ wrapperId: 'cvz-d-c5', iconKey: 'aufbau',   label: 'Aufbau-Sessions',         valueId: 'cvz-d-c5-value', subId: 'cvz-d-c5-sub', withBar: true, barFillId: 'cvz-d-c5-bar', hidden: true }) +
      '</div>' +
      '<div class="cvz-d-actions">' +
        '<a id="cvz-d-btn-new-analysis" class="cvz-d-btn cvz-d-btn-primary" href="' + CONFIG.NEW_ANALYSIS_URL + '">Neue Analyse</a>' +
        '<a id="cvz-d-btn-new-page" class="cvz-d-btn cvz-d-btn-primary" href="' + CONFIG.NEW_LANDINGPAGE_URL + '">Neue Landingpage</a>' +
        '<button id="cvz-d-btn-buy-ppu" type="button" class="cvz-d-btn cvz-d-btn-outline">Analyse kaufen</button>' +
      '</div>' +
      '<h2 class="cvz-d-title">Meine Analysen</h2>' +
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
      '</div>';
 
    state.container = document.getElementById('cvz-a-body');
 
    // "Analyse kaufen" direkt verdrahten (statt ueber die generische
    // [data-plan-upgrade]-Attribut-Suche - vermeidet eine Race Condition,
    // falls diese Karte erst nach dem Memberstack-Ready-Check im DOM landet).
    document.getElementById('cvz-d-btn-buy-ppu').addEventListener('click', function () {
      if (!window.$memberstackDom) return;
      window.$memberstackDom.purchasePlansWithCheckout({
        priceId:    CONFIG.PAY_PER_USE_PRICE_ID,
        successUrl: window.location.origin + CONFIG.NEW_ANALYSIS_URL,
      }).catch(function (err) { console.error('[CVZ] PPU Checkout error:', err); });
    });
 
    document.getElementById('cvz-a-prev').addEventListener('click', function () {
      if (state.currentPage > 1) renderAnalysesPage(state.currentPage - 1);
    });
    document.getElementById('cvz-a-next').addEventListener('click', function () {
      if (state.currentPage < state.totalPages) renderAnalysesPage(state.currentPage + 1);
    });
 
    showAnalysesLoading();
  }
 
  // -- UI: Stat-Karten befuellen -------------------------------------------------
 
  function renderStatCards(user, sessionsLimit) {
    var bu           = user._billingUser || user;
    var reserved     = Math.max(0, Math.round(Number(bu.reserved_credits || 0)));
    var used         = Math.round(Number(bu.credits_used_current_period || 0));
    var limit        = Math.round(Number(bu.credits_limit || 0));
    var ppuCredits   = Math.round(Number(user.ppu_credits || 0));
    var ppuReserved  = Math.round(Number(user.reserved_ppu_credits || 0));
    var ppuAvailable = Math.max(ppuCredits - ppuReserved, 0);
 
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
 
    // Karte 4: Pay-per-Use (nur wenn vorhanden)
    var ppuLabelText = ppuCredits === 0
      ? 'Keine Pay-per-Use Analysen'
      : ppuReserved > 0 && ppuAvailable === 0
        ? 'Analyse wird gerade verarbeitet...'
        : ppuReserved > 0
          ? ppuAvailable + ' verfügbar (' + ppuReserved + ' in Bearbeitung)'
          : ppuCredits + ' Pay-per-Use Analyse' + (ppuCredits > 1 ? 'n' : '') + ' verfügbar';
    setText('cvz-d-c4-value', ppuAvailable);
    setText('cvz-d-c4-sub', ppuLabelText);
    showEl(document.getElementById('cvz-d-c4'), ppuCredits > 0, 'flex');
 
    // Karte 5: Aufbau-Sessions (nur wenn Plan ueberhaupt Kontingent hat)
    var sessionsUsed     = Math.round(Number(bu.page_agent_sessions_used_current_period || 0));
    var sessionsLimitNum = Math.round(Number(sessionsLimit || 0));
    var sessionsLeft     = Math.max(sessionsLimitNum - sessionsUsed, 0);
    var sessionsPercent  = sessionsLimitNum ? (sessionsUsed / sessionsLimitNum) * 100 : 0;
 
    setText('cvz-d-c5-value', sessionsUsed + '/' + sessionsLimitNum + ' Aufbau-Sessions');
    var aufbauSub = isFreePlan
      ? (sessionsLeft > 0 ? '1 kostenlose Aufbau-Session verfügbar' : 'Kostenlose Aufbau-Session bereits genutzt')
      : (Math.round(sessionsPercent) + '% des Kontingents genutzt');
    setText('cvz-d-c5-sub', aufbauSub);
    var bar5 = document.getElementById('cvz-d-c5-bar');
    if (bar5) bar5.style.width = Math.min(sessionsPercent, 100) + '%';
    showEl(document.getElementById('cvz-d-c5'), sessionsLimitNum > 0, 'flex');
 
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
    viewBtn.href = '/analyse/resultat?id=' + encodeURIComponent(analysis.id);
    viewBtn.target = '_blank';
    viewBtn.title = isCompleted ? 'Ansehen' : 'Analyse ist noch nicht abgeschlossen';
    actionsCell.appendChild(viewBtn);
 
    var agentEnabled = isCompleted && isCreator;
    var agentBtn = document.createElement('a');
    agentBtn.className = 'cvz-a-icon-btn' + (agentEnabled ? '' : ' cvz-a-disabled');
    agentBtn.innerHTML = ICONS.agent;
    agentBtn.target = '_blank';
    if (agentEnabled) {
      agentBtn.href = '/analyse/optimization-agent?analysis_id=' + encodeURIComponent(analysis.id);
    } else {
      agentBtn.href = '#';
      agentBtn.setAttribute('aria-disabled', 'true');
      agentBtn.title = !isCompleted
        ? 'Analyse ist noch nicht abgeschlossen'
        : 'Der KI-Agent steht nur dem Ersteller der Analyse zur Verfügung';
      agentBtn.addEventListener('click', function (e) { e.preventDefault(); });
    }
    actionsCell.appendChild(agentBtn);
 
    var downloadTitle = !isCompleted
      ? 'Analyse muss abgeschlossen sein'
      : !canAccessPdf(analysis)
        ? 'PDF-Report nur für kostenpflichtige Pläne oder Pay-per-Use verfügbar'
        : 'Report herunterladen';
    var dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'cvz-a-icon-btn' + (canDownload ? '' : ' cvz-a-disabled');
    dlBtn.innerHTML = ICONS.download;
    dlBtn.setAttribute('aria-label', 'Report herunterladen');
    dlBtn.title = downloadTitle;
    if (canDownload) dlBtn.addEventListener('click', function () { handleReportDownload(dlBtn, analysis.id); });
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
        var err = await response.json();
        throw new Error(err.error || 'Generierung fehlgeschlagen');
      }
 
      var downloadUrl = (await response.json()).downloadUrl;
 
      await triggerBlobDownload(downloadUrl, fileName);
      btn.classList.remove('cvz-a-loading-btn');
      btn.title = 'Report herunterladen';
 
    } catch (err) {
      console.error('[CVZ] Report-Download Fehler:', err);
      btn.classList.remove('cvz-a-loading-btn');
      btn.title = 'Fehler - erneut versuchen';
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
      var sessionsLimit = await fetchPlanSessionsLimit(state.licenseType);
 
      renderStatCards(currentUser, sessionsLimit);
 
      await loadAndRenderAnalyses(false);
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
 
