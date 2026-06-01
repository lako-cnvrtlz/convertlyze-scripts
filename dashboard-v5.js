/**
 * dashboard-v5.js
 * ----------------
 * Member-Dashboard: Analysen-Liste, User-Stats, PDF-Download, Team-Einladungen.
 *
 * Seite: /member/dashboard
 * Embedding: jsDelivr
 * Dependencies: window.supabase (global), window.$memberstackDom
 *
 * Features:
 * - Skeleton-Loading (Shimmer-Effekt) bis Daten geladen
 * - Pagination (10 Analysen pro Seite)
 * - Realtime-Updates via Supabase Postgres Changes
 * - Polling-Fallback (10s) wenn Analysen im Status "processing"
 * - PDF/Word Download via convertlyze-pdf-service
 * - Team-Einladungen annehmen (Cookie cvz_invite)
 * - PPU Pay-per-Use Checkout Button
 * - Purchase Success Modal nach Kauf
 *
 * KRITISCH: PDF_SECRET liegt hier als Klartext.
 * Bei Rotation: dashboard-v5.js + Railway PDF Service ENV aktualisieren.
 *
 * Webflow-Selektoren:
 * - Container: erstes .table-list parent
 * - Analyse-Rows: .table-list
 * - User-Daten: [data-dashboard="..."], [data-user="..."]
 */

// ── Sofort verstecken wenn Plan im sessionStorage ─────────────────────────────
(function () {
  if (sessionStorage.getItem('selected_plan')) {
    document.documentElement.style.visibility = 'hidden';
  }
})();

// ==================== DASHBOARD LOGIK ====================
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────────

  var CONFIG = {
    // WHY: PDF_SERVICE_URL und PDF_SECRET wurden aus dem Frontend entfernt.
    // generate-pdf-report Edge Function fügt das Secret serverseitig hinzu.
    // Analog zu trigger-analysis.ts für den Webhook-Secret (2026-05).
    generateReportUrl: 'https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/generate-pdf-report',
    SUPABASE_URL:     'https://zpkifipmyeunorhtepzq.supabase.co',
    SUPABASE_ANON:    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU',
    PAGE_SIZE:        10,
    POLL_INTERVAL_MS: 10000,
    PDF_ACCESS_SOURCES: ['starter', 'pro', 'enterprise', 'pay-per-use', 'beta', 'agency'],
    PAID_PLANS:       ['Starter', 'Growth', 'Pro', 'Professional', 'Enterprise'],
    TEAM_PLANS:       ['Starter', 'Pro', 'Professional', 'Enterprise'],
    CHECKOUT_PRICE_IDS: {
      starter:    { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
      pro:        { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
      enterprise: { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    },
  };

  // ── State ─────────────────────────────────────────────────────────────────────

  var state = {
    analysesData:    [],
    currentPage:     1,
    totalPages:      1,
    paginationEl:    null,
    supabaseUserId:  null,
    memberstackId:   null,
    licenseType:     null,
    hasPdfAccess:    false,
    container:       null,
    realtimeChannel: null,
    pdfUrlCache:     {},
    pollingTimer:    null,
  };

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function retry(fn, maxAttempts, intervalMs) {
    var attempts = 0;
    return new Promise(function (resolve, reject) {
      (function attempt() {
        if (fn()) return resolve();
        if (++attempts >= maxAttempts) return reject(new Error('Max retry attempts reached'));
        setTimeout(attempt, intervalMs);
      })();
    });
  }

  // WHY escapeHtml: User-Daten (URLs, Keywords) nie direkt als innerHTML setzen.
  // XSS-Schutz — alle User-Inhalte werden durch diese Funktion gefiltert.
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

  function setText(selector, value) {
    var el = document.querySelector(selector);
    if (el) el.textContent = (value != null) ? value : '';
  }

  function showEl(el, show, displayValue) {
    if (el) el.style.display = show ? (displayValue || '') : 'none';
  }

  function getParam(key) {
    return new URLSearchParams(window.location.search).get(key);
  }

  // ── Cookie helpers ────────────────────────────────────────────────────────────

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function deleteCookie(name) {
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax';
  }

  // ── Deps ──────────────────────────────────────────────────────────────────────

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

  // ── Data layer ────────────────────────────────────────────────────────────────

  // WHY _billingUser: Bei Team-Members läuft Billing über den Owner.
  // Plan-Felder müssen vom Owner geholt werden, nicht vom Member selbst.
  function checkPdfAccess(user) {
    var bu     = user._billingUser || user;
    var type   = bu.license_type   || '';
    var status = bu.license_status || '';
    if (CONFIG.PAID_PLANS.concat(['Agency']).indexOf(type) === -1) return false;
    if (status === 'active') return true;
    // WHY canceling-Check: Gekündigte User behalten PDF-Zugang bis license_expires_at.
    // Entspricht ADR 009 — Zugang bis Periodenende.
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
        .select('id, email, full_name, license_type, license_status, license_expires_at, credits_limit, credits_used_current_period, credits_remaining, reserved_credits, chat_messages_limit, chat_messages_used_current_period, period_start_date, next_credit_reset_date, plan_price, owner_user_id, team_role, ppu_credits, reserved_ppu_credits')
        .eq('memberstack_id', memberstackId)
        .single();

      if (result.data) {
        if (result.data.owner_user_id) {
          var ownerResult = await window.supabase
            .from('users')
            .select('id, credits_limit, credits_used_current_period, credits_remaining, reserved_credits, license_type, license_status, license_expires_at, next_credit_reset_date, period_start_date, plan_price')
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

  async function fetchAnalysesForMember(memberstackId) {
    if (!memberstackId) return [];
    var result = await window.supabase.rpc('get_analyses_for_member', { p_memberstack_id: memberstackId });
    if (result.error) {
      console.error('[CVZ] Analysen laden fehlgeschlagen:', result.error);
      return [];
    }
    var data = result.data || [];
    data.forEach(function (a) { if (a.pdf_url) state.pdfUrlCache[a.id] = a.pdf_url; });
    return data;
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

  // ── Purchase Success Modal ────────────────────────────────────────────────────

  function showPurchaseSuccessModal(licenseType) {
    var planName = licenseType || 'deinen neuen Plan';

    var overlay = document.createElement('div');
    overlay.id = 'cvz-purchase-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';

    var box = document.createElement('div');
    box.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px;max-width:480px;width:90%;text-align:center;font-family:Geist,sans-serif;position:relative';

    var xBtn = document.createElement('button');
    xBtn.textContent = '\u2715';
    xBtn.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:#8b98a5;font-size:16px;cursor:pointer;line-height:1;padding:0';
    xBtn.onclick = function () { overlay.remove(); };

    var emoji = document.createElement('div');
    emoji.textContent = '\uD83C\uDF89';
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
    p2.textContent = 'Dein Konto ist jetzt aktiv \u2013 analysiere deine erste Landing Page.';
    p2.style.cssText = 'margin:0 0 28px;color:#8b98a5;font-size:14px';

    var ctaBtn = document.createElement('button');
    ctaBtn.textContent = 'Erste Analyse starten';
    ctaBtn.style.cssText = 'background:#4fd1c5;color:#0d1117;border:none;border-radius:8px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer;width:100%';
    ctaBtn.onclick = function () {
      overlay.remove();
      window.location.href = '/analyse/formular';
    };

    box.append(xBtn, emoji, h, p1, p2, ctaBtn);
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ── UI: Dashboard render ──────────────────────────────────────────────────────

  function renderUserDashboard(user) {
    // FIX: skeletons verbergen bevor Daten gesetzt werden (mobil critical)
    hideDashboardSkeletons();

    var bu           = user._billingUser || user;
    var isTeamMember = !!user.owner_user_id;
    var reserved     = Math.max(0, Math.round(Number(bu.reserved_credits || 0)));
    var used         = Math.round(Number(bu.credits_used_current_period || 0));
    var limit        = Math.round(Number(bu.credits_limit || 0));
    var ppuCredits   = Math.round(Number(user.ppu_credits || 0));
    var ppuReserved  = Math.round(Number(user.reserved_ppu_credits || 0));
    var ppuAvailable = Math.max(ppuCredits - ppuReserved, 0);

    var analysesLeft = bu.credits_remaining != null
      ? Math.max(0, Math.round(Number(bu.credits_remaining)) - reserved)
      : Math.max(0, limit - used - reserved);

    var chatUsed  = Math.round(Number(user.chat_messages_used_current_period || 0));
    var chatLimit = Math.round(Number(user.chat_messages_limit || 0));
    var chatLeft  = Math.max(chatLimit - chatUsed, 0);

    var percentRaw = limit ? ((used + reserved) / limit) * 100 : 0;

    // Credits & progress
    var usedDisplay = reserved > 0
      ? (used + '/' + limit + ' Analysen (' + reserved + ' in Bearbeitung)')
      : (used + '/' + limit + ' Analysen');
    setText('[data-dashboard="credits_used_current_period"]', usedDisplay);
    setText('[data-dashboard="analyses-percent"]', Math.round(percentRaw) + '% des Limits genutzt');

    var progressBar = document.querySelector('[data-dashboard="progress-bar"]');
    if (progressBar) progressBar.style.width = Math.min(percentRaw, 100) + '%';

    setText('[data-dashboard="credits-remaining"]',      analysesLeft);
    setText('[data-dashboard="chat-messages-remaining"]', chatLeft);
    setText('[data-dashboard="chat-messages-used"]',      chatUsed + '/' + chatLimit);

    // PPU
    setText('[data-dashboard="ppu-credits"]', ppuAvailable);
    var ppuLabelText = ppuCredits === 0
      ? 'Keine Pay-per-Use Analysen'
      : ppuReserved > 0 && ppuAvailable === 0
        ? 'Analyse wird gerade verarbeitet...'
        : ppuReserved > 0
          ? ppuAvailable + ' verfügbar (' + ppuReserved + ' in Bearbeitung)'
          : ppuCredits + ' Pay-per-Use Analyse' + (ppuCredits > 1 ? 'n' : '') + ' verfügbar';
    setText('[data-dashboard="ppu-label"]', ppuLabelText);
    showEl(document.querySelector('[data-dashboard="ppu-card"]'), ppuCredits > 0, 'block');

    // Plan type flags
    var isPaid      = CONFIG.PAID_PLANS.indexOf(bu.license_type) !== -1;
    var isPayPerUse = bu.license_type === 'Pay-per-Use';
    var isFreePlan  = bu.license_type === 'Free';
    var isBetaPlan  = bu.license_type === 'Beta';

    // Renewal
    var renewalLabel = 'Analysen erneuern sich am';
    var renewalText  = '';
    if (isPaid) {
      var renewalDate = null;
      if (bu.license_expires_at)       renewalDate = new Date(bu.license_expires_at).toLocaleDateString('de-DE');
      else if (bu.next_credit_reset_date) renewalDate = new Date(bu.next_credit_reset_date).toLocaleDateString('de-DE');
      else if (bu.period_start_date) {
        var d = new Date(bu.period_start_date);
        d.setMonth(d.getMonth() + 1);
        renewalDate = d.toLocaleDateString('de-DE');
      }
      renewalText = renewalDate || '-';
    } else if (isFreePlan) {
      renewalLabel = 'Analyse-Status';
      renewalText  = analysesLeft > 0 ? '1 kostenlose Analyse verfügbar' : 'Kostenlose Analyse bereits genutzt';
    } else if (isPayPerUse) {
      renewalLabel = 'Analyse-Status';
      renewalText  = analysesLeft > 0 ? '1 Analyse verfügbar' : 'Analyse bereits genutzt - jetzt neue Analyse kaufen';
    } else if (isBetaPlan) {
      renewalLabel = 'Analyse-Status';
      renewalText  = 'Beta-Analysen erneuern sich nicht automatisch';
    }
    setText('[data-dashboard="credits-renewal-label"]', renewalLabel);
    setText('[data-dashboard="credits-renewal"]',       renewalText);

    // Plan name & description
    var planName = bu.license_type || '-';
    if (planName.length > 0 && !isPayPerUse) planName = planName.charAt(0).toUpperCase() + planName.slice(1);
    if (isTeamMember) planName += ' (Team)';
    setText('[data-dashboard="plan-name"]', planName);
    setText('[data-dashboard="plan-description"]', limit
      ? (isPaid ? limit + ' Analysen pro Monat' : isPayPerUse ? '1 Analyse, kein Abo' : limit + ' Analyse(n)')
      : '');

    // User info
    setText('[data-user="name"]',  user.full_name || 'Unbekannt');
    setText('[data-user="email"]', user.email     || '');

    var avatarEl = document.querySelector('[data-user="avatar"]');
    if (avatarEl) {
      avatarEl.textContent = getInitials(user.full_name || '');
      avatarEl.style.cssText += ';display:flex;align-items:center;justify-content:center';
    }

    // Team section
    var hasTeam = CONFIG.TEAM_PLANS.indexOf(bu.license_type) !== -1;
    showEl(document.getElementById('open-team-modal'), hasTeam);
    showEl(document.getElementById('team-section'),    hasTeam);

    // Pre-Shimmer deaktivieren – echte Werte sind jetzt gesetzt
    document.body.classList.add('content-loaded');
  }

  // ── UI: Skeleton ──────────────────────────────────────────────────────────────

  var SKELETON_STYLE_ID = 'cvz-skeleton-style';
  var SHIMMER_BG   = 'linear-gradient(90deg,#1a2133 25%,#252d3d 50%,#1a2133 75%)';
  var SHIMMER_ANIM = 'cvz-shimmer 1.4s infinite';

  function injectSkeletonStyle() {
    if (document.getElementById(SKELETON_STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = SKELETON_STYLE_ID;
    s.textContent =
      '@keyframes cvz-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}' +
      '@keyframes cvz-spin{0%{transform-origin:50% 50%;transform:rotate(0deg)}100%{transform-origin:50% 50%;transform:rotate(360deg)}}' +
      '@keyframes cvz-pulse{0%,100%{opacity:1}50%{opacity:0.55}}';
    document.head.appendChild(s);
  }

  function applySkeletonStyle(el, minWidth) {
    el.dataset.cvzOrigColor      = el.style.color           || '';
    el.dataset.cvzOrigBackground = el.style.background      || '';
    el.dataset.cvzOrigMinWidth   = el.style.minWidth        || '';
    el.dataset.cvzOrigAnim       = el.style.animation       || '';
    el.dataset.cvzOrigBgSize     = el.style.backgroundSize  || '';
    el.dataset.cvzOrigRadius     = el.style.borderRadius    || '';
    el.dataset.cvzOrigOpacity    = el.style.opacity         || '';
    el.dataset.cvzSkeleton       = '1';
    el.style.opacity        = '1';
    el.style.color          = 'transparent';
    el.style.background     = SHIMMER_BG;
    el.style.backgroundSize = '400px 100%';
    el.style.animation      = SHIMMER_ANIM;
    el.style.borderRadius   = '6px';
    el.style.minWidth       = minWidth || '60px';
    el.style.display        = el.style.display || 'inline-block';
  }

  function removeSkeletonStyle(el) {
    if (!el.dataset.cvzSkeleton) return;
    el.style.opacity        = el.dataset.cvzOrigOpacity || '';
    el.style.color          = el.dataset.cvzOrigColor;
    el.style.background     = el.dataset.cvzOrigBackground;
    el.style.backgroundSize = el.dataset.cvzOrigBgSize;
    el.style.animation      = el.dataset.cvzOrigAnim;
    el.style.borderRadius   = el.dataset.cvzOrigRadius;
    el.style.minWidth       = el.dataset.cvzOrigMinWidth;
    delete el.dataset.cvzSkeleton;
  }

  var SKELETON_WIDTHS = {
    'credits_used_current_period': '140px',
    'analyses-percent':            '120px',
    'credits-remaining':           '40px',
    'credits-renewal':             '80px',
    'plan-name':                   '80px',
    'plan-description':            '120px',
    'ppu-credits':                 '40px',
    'ppu-label':                   '100px',
  };

  function showDashboardSkeletons() {
    injectSkeletonStyle();
    document.querySelectorAll('[data-dashboard]').forEach(function (el) {
      var key = el.getAttribute('data-dashboard');
      if (key === 'progress-bar') {
        el.style.opacity        = '1';
        el.style.background     = SHIMMER_BG;
        el.style.backgroundSize = '400px 100%';
        el.style.animation      = SHIMMER_ANIM;
        el.style.width          = '30%';
        el.dataset.cvzSkeleton  = '1';
      } else {
        applySkeletonStyle(el, SKELETON_WIDTHS[key] || '80px');
      }
    });
    document.querySelectorAll('[data-user="name"], [data-user="email"]').forEach(function (el) {
      applySkeletonStyle(el, el.getAttribute('data-user') === 'name' ? '100px' : '140px');
    });
  }

  function hideDashboardSkeletons() {
    document.querySelectorAll('[data-dashboard], [data-user]').forEach(function (el) {
      if (!el.dataset.cvzSkeleton) return;
      if (el.getAttribute('data-dashboard') === 'progress-bar') {
        el.style.background     = '';
        el.style.backgroundSize = '';
        el.style.animation      = '';
        el.style.width          = '';
        delete el.dataset.cvzSkeleton;
      } else {
        removeSkeletonStyle(el);
      }
    });
  }

  // SVG assets
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
    '<div id="cvz-dots-loader" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;grid-column:1/-1;">' +
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

  // ── UI: Empty / error states ──────────────────────────────────────────────────

  function removeLoadingSkeleton() {
    if (!state.container) return;
    var skeleton = state.container.querySelector('.loading-skeleton');
    if (skeleton) skeleton.remove();
  }

  function showLoadingSkeleton() {
    if (!state.container) return;
    state.container.innerHTML =
      '<div class="loading-skeleton" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;">' +
        CVZ_SPINNER_SVG +
        '<p style="margin-top:20px;color:#7a8ba8;font-size:14px;">Lade Dashboard...</p>' +
      '</div>';
  }

  function showNoUserMessage() {
    if (!state.container) return;
    removeLoadingSkeleton();
    state.container.innerHTML =
      '<div style="grid-column:1/-1;padding:60px 20px;text-align:center;color:#f87171;">' +
        '<p style="font-weight:600;margin-bottom:8px;">Account nicht gefunden</p>' +
        '<p style="font-size:14px;color:#7a8ba8;">Bitte melde dich erneut an oder kontaktiere den Support.</p>' +
      '</div>';
  }

  function showEmptyState() {
    if (!state.container) return;
    removeLoadingSkeleton();
    state.container.innerHTML =
      '<div style="grid-column:1/-1;padding:60px 20px;text-align:center;color:#7a8ba8;">' +
        '<p style="margin:0 0 10px;font-weight:500;">Noch keine Analysen vorhanden</p>' +
        '<p style="margin:0;font-size:14px;">Starte deine erste Analyse!</p>' +
      '</div>';
  }

  // Skeleton beim Scriptstart setzen – verhindert dass Webflow-Platzhalter sichtbar werden
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showDashboardSkeletons);
  } else {
    showDashboardSkeletons();
  }

  // ── UI: Sticky header ─────────────────────────────────────────────────────────

  function fixStickyHeader() {
    var header = document.querySelector('.analysis-row-header');
    if (!header) return;
    var nav       = document.querySelector('nav, .navbar, .w-nav');
    var navHeight = nav ? nav.offsetHeight : 60;
    var parent    = header.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      var ov = window.getComputedStyle(parent);
      if (/auto|scroll|hidden/.test(ov.overflow + ov.overflowX + ov.overflowY)) {
        parent.style.overflow  = 'visible';
        parent.style.overflowX = 'visible';
        parent.style.overflowY = 'visible';
        parent.style.maxHeight = 'none';
      }
      parent = parent.parentElement;
    }
    header.style.position        = 'sticky';
    header.style.top             = navHeight + 'px';
    header.style.zIndex          = '100';
    header.style.backgroundColor = '#0d1117';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixStickyHeader);
  } else {
    fixStickyHeader();
  }
  setTimeout(fixStickyHeader, 500);
  setTimeout(fixStickyHeader, 1500);

  // ── UI: Pagination ────────────────────────────────────────────────────────────

  function initPagination(container) {
    if (state.paginationEl) return;
    state.paginationEl = document.createElement('div');
    state.paginationEl.className = 'pagination-wrapper';
    state.paginationEl.innerHTML =
      '<button class="pagination-btn pagination-prev" type="button">Zurück</button>' +
      '<span class="pagination-info"></span>' +
      '<button class="pagination-btn pagination-next" type="button">Nächste Seite</button>';
    container.parentElement.appendChild(state.paginationEl);
    state.paginationEl.querySelector('.pagination-prev').addEventListener('click', function () {
      if (state.currentPage > 1) renderAnalysesPage(state.container, state.currentPage - 1);
    });
    state.paginationEl.querySelector('.pagination-next').addEventListener('click', function () {
      if (state.currentPage < state.totalPages) renderAnalysesPage(state.container, state.currentPage + 1);
    });
    updatePaginationInfo();
  }

  function updatePaginationInfo() {
    if (!state.paginationEl) return;
    var info    = state.paginationEl.querySelector('.pagination-info');
    var prevBtn = state.paginationEl.querySelector('.pagination-prev');
    var nextBtn = state.paginationEl.querySelector('.pagination-next');
    info.textContent = 'Seite ' + state.currentPage + ' von ' + state.totalPages;
    prevBtn.disabled = state.currentPage <= 1;
    nextBtn.disabled = state.currentPage >= state.totalPages;
  }

  // ── UI: Analysis rows ─────────────────────────────────────────────────────────

  function ensureHeaderExists(container) {
    var header = container.querySelector('.analysis-row-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'analysis-row-header';
      header.innerHTML =
        '<div class="header-cell">URL</div>' +
        '<div class="header-cell">KEYWORD</div>' +
        '<div class="header-cell">STATUS</div>' +
        '<div class="header-cell">DATUM</div>' +
        '<div class="header-cell">ANSICHT</div>' +
        '<div class="header-cell">KI-AGENT</div>' +
        '<div class="header-cell">REPORT</div>';
      container.insertBefore(header, container.firstChild);
    }
    return header;
  }

  var ICONS = {
    download: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v13m0 0l-4-4m4 4l4-4" stroke="#e8edf5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="#e8edf5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    eye:      '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C6.5 4.5 2.15 8 0.75 12c1.4 4 5.75 7.5 11.25 7.5s9.85-3.5 11.25-7.5C21.85 8 17.5 4.5 12 4.5z" fill="#e8edf5"/><circle cx="12" cy="12" r="3.2" fill="#252d3d"/></svg>',
    agent:    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="8" width="12" height="10" rx="2" fill="#e8edf5"/><circle cx="9" cy="12" r="1.5" fill="#252d3d"/><circle cx="15" cy="12" r="1.5" fill="#252d3d"/><rect x="10" y="15" width="4" height="1.5" rx="0.75" fill="#252d3d"/><rect x="11" y="4" width="2" height="4" rx="1" fill="#e8edf5"/><circle cx="12" cy="5" r="2" fill="#e8edf5"/></svg>',
  };

  var STATUS_MAP = {
    completed:  { text: 'Abgeschlossen', cls: 'status-completed' },
    processing: { text: 'In Bearbeitung', cls: 'status-processing' },
    error:      { text: 'Fehler',         cls: 'status-error' },
    failed:     { text: 'Fehler',         cls: 'status-error' },
  };

  function createAnalysisRow(analysis) {
    var isMobile    = window.innerWidth <= 768;
    var isCompleted = analysis.status === 'completed';
    var canDownload = isCompleted && canAccessPdf(analysis);
    var actionClass = isCompleted ? '' : 'action-disabled';

    var statusInfo  = STATUS_MAP[analysis.status] || STATUS_MAP.completed;
    var formattedDate = '-';
    try {
      formattedDate = new Date(analysis.created_at).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
    } catch (e) {}

    var downloadTitle = !isCompleted
      ? 'Analyse muss abgeschlossen sein'
      : !canAccessPdf(analysis)
        ? 'PDF-Report nur für kostenpflichtige Pläne oder Pay-per-Use verfügbar'
        : (state.pdfUrlCache[analysis.id] ? 'Report öffnen' : 'Report generieren & herunterladen');

    var dlBtnHtml =
      '<button class="aktion-link download-link ' + (canDownload ? '' : 'action-disabled') + '"' +
      ' aria-label="Report herunterladen" title="' + escapeHtml(downloadTitle) + '"' +
      (canDownload ? '' : ' disabled') + '>' + ICONS.download + '</button>';

    var row = document.createElement('div');
    row.className = 'table-list';

    if (isMobile) {
      row.innerHTML =
        '<div class="analysis-url"><div class="text-block-url"></div></div>' +
        '<div class="analysis-keyword"><div class="text-block-keyword"></div></div>' +
        '<div class="analysis-status"><div class="status-badge ' + statusInfo.cls + '"></div></div>' +
        '<div class="analysis-date"><div class="text-block-date"></div></div>' +
        '<div class="action-cell" style="display:flex;justify-content:center;gap:16px;width:100%;margin-top:8px;">' +
          '<a href="#" class="aktion-link w-inline-block ' + actionClass + '" target="_blank">' + ICONS.eye + '</a>' +
          '<a href="#" class="aktion-link w-inline-block ' + actionClass + '" target="_blank">' + ICONS.agent + '</a>' +
          dlBtnHtml +
        '</div>';
    } else {
      row.innerHTML =
        '<div class="analysis-url"><div class="text-block-url"></div></div>' +
        '<div class="analysis-keyword"><div class="text-block-keyword"></div></div>' +
        '<div class="analysis-status"><div class="status-badge ' + statusInfo.cls + '"></div></div>' +
        '<div class="analysis-date"><div class="text-block-date"></div></div>' +
        '<div class="action-cell"><a href="#" class="aktion-link w-inline-block ' + actionClass + '" target="_blank">' + ICONS.eye + '</a></div>' +
        '<div class="action-cell"><a href="#" class="aktion-link w-inline-block ' + actionClass + '" target="_blank">' + ICONS.agent + '</a></div>' +
        '<div class="action-cell">' + dlBtnHtml + '</div>';
    }

    // XSS-safe: User-Daten per textContent
    var maxUrl     = isMobile ? 40 : 70;
    var maxKeyword = isMobile ? 25 : 40;
    row.querySelector('.text-block-url').textContent     = truncate(analysis.landing_page_url, maxUrl);
    row.querySelector('.text-block-keyword').textContent = truncate(analysis.keyword, maxKeyword);
    row.querySelector('.status-badge').textContent       = statusInfo.text;
    row.querySelector('.text-block-date').textContent    = formattedDate;

    // Links per href (kein innerHTML)
    var links = row.querySelectorAll('a.aktion-link');
    if (links[0]) links[0].href = '/analyse/resultat?id=' + encodeURIComponent(analysis.id);
    if (links[1]) links[1].href = '/analyse/optimization-agent?analysis_id=' + encodeURIComponent(analysis.id);
    if (!isCompleted) {
      Array.from(links).forEach(function (l) { l.title = 'Analyse ist noch nicht abgeschlossen'; });
    }

    if (canDownload) {
      var dlBtn = row.querySelector('.download-link');
      if (dlBtn) dlBtn.addEventListener('click', function () { handleReportDownload(dlBtn, analysis.id); });
    }

    return row;
  }

  function renderAnalysesPage(container, page) {
    state.currentPage = page;

    // Header sicherstellen und explizit sichtbar machen
    var header = ensureHeaderExists(container);
    if (header) {
      header.style.display    = '';
      header.style.visibility = '';
      header.style.opacity    = '';
    }

    // Alte Rows entfernen
    container.querySelectorAll('.table-list').forEach(function (r) { r.remove(); });

    // Neue Rows einfügen – FIX: explizites display/visibility/opacity für mobile Webflow-CSS
    var items = state.analysesData.slice((page - 1) * CONFIG.PAGE_SIZE, page * CONFIG.PAGE_SIZE);
    items.forEach(function (item) {
      var row = createAnalysisRow(item);
      row.setAttribute('data-analysis-id', item.id);
      row.style.display    = '';
      row.style.visibility = '';
      row.style.opacity    = '';
      container.appendChild(row);
    });

    updatePaginationInfo();
  }

  // ── UI: Dots loader ───────────────────────────────────────────────────────────

  function showDotsLoader() {
    if (!state.container || document.getElementById('cvz-dots-loader')) return;
    state.container.querySelectorAll('.table-list').forEach(function (r) { r.style.opacity = '0.4'; });
    state.container.insertAdjacentHTML('afterbegin', CVZ_DOTS_LOADER);
  }

  function hideDotsLoader() {
    var loader = document.getElementById('cvz-dots-loader');
    if (loader) loader.remove();
    if (state.container) {
      state.container.querySelectorAll('.table-list').forEach(function (r) { r.style.opacity = ''; });
    }
  }

  // ── Data load & render ────────────────────────────────────────────────────────

  async function loadAndRenderAnalyses(keepPage) {
    if (!state.container || !state.memberstackId) { showEmptyState(); return; }
    if (keepPage) showDotsLoader();

    var data         = await fetchAnalysesForMember(state.memberstackId);
    state.analysesData = data || [];
    state.totalPages   = Math.max(1, Math.ceil(state.analysesData.length / CONFIG.PAGE_SIZE));

    hideDotsLoader();

    if (!state.analysesData.length) { showEmptyState(); return; }
    removeLoadingSkeleton();
    state.currentPage = keepPage ? Math.min(state.currentPage, state.totalPages) : 1;
    renderAnalysesPage(state.container, state.currentPage);
  }

  // ── PDF download ──────────────────────────────────────────────────────────────

  async function triggerBlobDownload(url, fileName) {
    var blob   = await (await fetch(url)).blob();
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
    btn.classList.add('loading');
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
      var cached   = state.pdfUrlCache[analysisId];

      if (cached) {
        await triggerBlobDownload(cached, fileName);
        btn.classList.remove('loading');
        btn.title = 'Report herunterladen';
        return;
      }

      var response = await fetch(
        CONFIG.generateReportUrl,
        {
          method:  'POST',
          headers: {
            'Content-Type':    'application/json',
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
      state.pdfUrlCache[analysisId] = downloadUrl;

      // Async persistieren – kein await nötig
      window.supabase
        .from('analyses')
        .update({ pdf_url: downloadUrl, pdf_generated_at: new Date().toISOString() })
        .eq('id', analysisId)
        .then(function () {});

      await triggerBlobDownload(downloadUrl, fileName);
      btn.classList.remove('loading');
      btn.title = 'Report herunterladen';

    } catch (err) {
      console.error('[CVZ] Report-Download Fehler:', err);
      btn.classList.remove('loading');
      btn.title = 'Fehler - erneut versuchen';
      btn.style.backgroundColor = '#1f1215';
      setTimeout(function () { btn.style.backgroundColor = ''; }, 2500);
    }
  }

  // ── Realtime + Polling ────────────────────────────────────────────────────────

  // WHY Polling als Fallback: Supabase Realtime kann bei Verbindungsproblemen
  // ausfallen. Polling alle 10s stellt sicher dass Status-Updates ankommen.
  // Polling stoppt automatisch wenn keine Analysen mehr processing sind.
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

      // Status-Badge direkt patchen
      var badge    = row.querySelector('.status-badge');
      var newInfo  = STATUS_MAP[fresh.status] || STATUS_MAP.completed;
      if (badge) {
        badge.textContent = newInfo.text;
        badge.className   = 'status-badge ' + newInfo.cls;
      }
      // Bei Abschluss oder Fehler: Row neu aufbauen um Buttons zu aktivieren
      if (fresh.status === 'completed' || fresh.status === 'error') {
        var newRow = createAnalysisRow(fresh);
        newRow.setAttribute('data-analysis-id', fresh.id);
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

  // ── Init ──────────────────────────────────────────────────────────────────────

  async function initDashboard() {
    try {
      var ready = await waitForDependencies();
      if (!ready) return;

      var firstTableList = document.querySelector('.table-list');
      state.container    = firstTableList ? firstTableList.parentElement : null;
      if (state.container) showLoadingSkeleton();

      var memberstackId = null;
      try {
        var member    = await window.$memberstackDom.getCurrentMember();
        memberstackId = (member && member.data && member.data.id) ? member.data.id : null;
      } catch (e) {
        console.error('[CVZ] Memberstack Fehler:', e);
      }

      if (!memberstackId) {
        if (state.container) showNoUserMessage();
        document.body.classList.add('content-loaded');
        return;
      }

      state.memberstackId = memberstackId;

      // Checkout aus sessionStorage
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

      // ── Purchase Success Modal ─────────────────────────────────────────────
      var isPurchaseSuccess = getParam('purchase') === 'success';
      if (isPurchaseSuccess) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      var currentUser = await fetchUser(memberstackId, 1) || await fetchUser(memberstackId, 5);
      if (!currentUser) {
        if (state.container) showNoUserMessage();
        document.body.classList.add('content-loaded');
        return;
      }

      state.supabaseUserId = currentUser.id;
      state.licenseType    = (currentUser._billingUser || currentUser).license_type || '';
      state.hasPdfAccess   = checkPdfAccess(currentUser);

      // Modal nach fetchUser zeigen, damit Plan-Name verfügbar ist
      if (isPurchaseSuccess) {
        showPurchaseSuccessModal(state.licenseType);
      }

      // Team-Invite annehmen
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

      renderUserDashboard(currentUser);

      if (state.container) {
        initPagination(state.container);
        await loadAndRenderAnalyses(false);
        subscribeToAnalysisChanges(currentUser.id);
        startPolling();
      }

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

// ==================== PAY-PER-USE BUTTON ====================
(function () {
  'use strict';

  var PAY_PER_USE_PRICE_ID = 'prc_pay-per-use-14750y0n';

  function retry(fn, maxAttempts, intervalMs) {
    var attempts = 0;
    return new Promise(function (resolve, reject) {
      (function attempt() {
        if (fn()) return resolve();
        if (++attempts >= maxAttempts) return reject(new Error('Max retry attempts reached'));
        setTimeout(attempt, intervalMs);
      })();
    });
  }

  function initPPUButton() {
    document.querySelectorAll(
      '[data-plan-upgrade="' + PAY_PER_USE_PRICE_ID + '"], [data-upgrade-plan="' + PAY_PER_USE_PRICE_ID + '"]'
    ).forEach(function (el) {
      var btn = el.tagName === 'A' ? el : el.closest('a');
      if (!btn) return;
      btn.href = '#';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        window.$memberstackDom.purchasePlansWithCheckout({
          priceId:    PAY_PER_USE_PRICE_ID,
          successUrl: window.location.origin + '/analyse/formular',
        }).catch(function (err) { console.error('[CVZ] PPU Checkout error:', err); });
      });
    });
  }

  function init() {
    retry(function () { return !!window.$memberstackDom; }, 10, 500)
      .then(initPPUButton)
      .catch(function () { console.warn('[CVZ] PPU: Memberstack nicht geladen.'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
