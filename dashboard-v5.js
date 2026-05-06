// Sofort verstecken wenn Plan im sessionStorage
(function () {
  if (sessionStorage.getItem('selected_plan')) {
    document.documentElement.style.visibility = 'hidden';
  }
})();

// ==================== DASHBOARD LOGIK ====================
(function () {

  var PDF_SERVICE_URL = 'https://convertlyze-pdf-service-production.up.railway.app';
  var PDF_SECRET      = 'cvl-pdf-2026-geheim';
  var PAGE_SIZE       = 10;

  var analysesData         = [];
  var currentPage          = 1;
  var totalPages           = 1;
  var paginationEl         = null;
  var globalSupabaseUserId = null;
  var globalMemberstackId  = null;
  var globalLicenseType    = null;
  var globalHasPdfAccess   = false;
  var globalContainer      = null;
  var realtimeChannel      = null;
  var pdfUrlCache          = {};

  var PDF_ACCESS_SOURCES = ['starter', 'pro', 'enterprise', 'pay-per-use', 'beta', 'agency'];

  // ── Utilities ────────────────────────────────────────────────────────────────

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

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

  // FIX: escapeHtml für XSS-Schutz bei User-Daten in innerHTML
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
      if (window.supabase && typeof window.supabase.from === 'function' &&
          window.$memberstackDom && typeof window.$memberstackDom.getCurrentMember === 'function') {
        return true;
      }
      await sleep(100);
    }
    console.warn('[CVZ] Timeout: Supabase oder Memberstack nicht geladen.');
    return false;
  }

  // ── Data layer ────────────────────────────────────────────────────────────────

  function checkPdfAccess(user) {
    var billingUser = user._billingUser || user;
    var type    = billingUser.license_type   || '';
    var status  = billingUser.license_status || '';
    var expires = billingUser.license_expires_at;
    var paidPlans = ['Starter', 'Growth', 'Pro', 'Professional', 'Enterprise', 'Agency'];
    if (paidPlans.indexOf(type) !== -1) {
      if (status === 'active') return true;
      if (status === 'canceling' && expires && new Date(expires) > new Date()) return true;
    }
    return false;
  }

  function canAccessPdf(analysis) {
    var source = (analysis.analysis_source || '').toLowerCase();
    return PDF_ACCESS_SOURCES.indexOf(source) !== -1 || globalHasPdfAccess;
  }

  function getInitials(name) {
    if (!name || typeof name !== 'string') return '';
    var parts = name.trim().split(/\s+/);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // FIX: window.supabase statt globalem supabase
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
    data.forEach(function (a) { if (a.pdf_url) pdfUrlCache[a.id] = a.pdf_url; });
    return data;
  }

  async function triggerCreditResetIfPaid(user) {
    try {
      var billingUser = user._billingUser || user;
      var paid = ['Starter', 'Growth', 'Pro', 'Professional', 'Enterprise'].indexOf(billingUser.license_type) !== -1;
      if (!paid) return false;
      var result = await window.supabase.rpc('reset_user_credits_if_due', { p_user_id: billingUser.id });
      if (result.error) { console.warn('[CVZ] reset_user_credits_if_due:', result.error); return false; }
      var row = Array.isArray(result.data) ? result.data[0] : result.data;
      return !!row?.did_reset;
    } catch (e) {
      console.warn('[CVZ] reset_user_credits_if_due exception:', e);
      return false;
    }
  }

  // ── UI: Dashboard render ──────────────────────────────────────────────────────

  function renderUserDashboard(user) {
    var billingUser    = user._billingUser || user;
    var isTeamMember   = !!user.owner_user_id;
    var reservedCredits = Math.round(Number(billingUser.reserved_credits || 0));
    var analysesUsed    = Math.round(Number(billingUser.credits_used_current_period || 0));
    var analysesLimit   = Math.round(Number(billingUser.credits_limit || 0));
    var ppuCredits      = Math.round(Number(user.ppu_credits || 0));

    var analysesLeft = billingUser.credits_remaining != null
      ? Math.max(0, Math.round(Number(billingUser.credits_remaining)) - reservedCredits)
      : Math.max(0, analysesLimit - analysesUsed - reservedCredits);

    var chatUsed  = Math.round(Number(user.chat_messages_used_current_period || 0));
    var chatLimit = Math.round(Number(user.chat_messages_limit || 0));
    var chatLeft  = Math.max(chatLimit - chatUsed, 0);

    var percentRaw    = analysesLimit ? ((analysesUsed + reservedCredits) / analysesLimit) * 100 : 0;
    var percentForBar = Math.min(percentRaw, 100);

    function setText(selector, value) {
      var el = document.querySelector(selector);
      if (el) el.textContent = value != null ? value : '';
    }

    var usedDisplay = reservedCredits > 0
      ? (analysesUsed + '/' + analysesLimit + ' Analysen (' + reservedCredits + ' in Bearbeitung)')
      : (analysesUsed + '/' + analysesLimit + ' Analysen');
    setText('[data-dashboard="credits_used_current_period"]', usedDisplay);
    setText('[data-dashboard="analyses-percent"]', Math.round(percentRaw) + '% des Limits genutzt');

    var progressBar = document.querySelector('[data-dashboard="progress-bar"]');
    if (progressBar) progressBar.style.width = percentForBar + '%';

    setText('[data-dashboard="credits-remaining"]', analysesLeft);
    setText('[data-dashboard="chat-messages-remaining"]', chatLeft);
    setText('[data-dashboard="chat-messages-used"]', chatUsed + '/' + chatLimit);

    var ppuReserved  = Math.round(Number(user.reserved_ppu_credits || 0));
    var ppuAvailable = Math.max(ppuCredits - ppuReserved, 0);
    setText('[data-dashboard="ppu-credits"]', ppuAvailable);

    var ppuLabelText = ppuCredits === 0
      ? 'Keine Pay-per-Use Analysen'
      : ppuReserved > 0 && ppuAvailable === 0
        ? 'Analyse wird gerade verarbeitet...'
        : ppuReserved > 0
          ? ppuAvailable + ' verf\u00fcgbar (' + ppuReserved + ' in Bearbeitung)'
          : ppuCredits + ' Pay-per-Use Analyse' + (ppuCredits > 1 ? 'n' : '') + ' verf\u00fcgbar';
    setText('[data-dashboard="ppu-label"]', ppuLabelText);

    var ppuCard = document.querySelector('[data-dashboard="ppu-card"]');
    if (ppuCard) ppuCard.style.display = ppuCredits > 0 ? 'block' : 'none';

    var isPaidPlan  = ['Starter', 'Growth', 'Pro', 'Professional', 'Enterprise'].indexOf(billingUser.license_type) !== -1;
    var isFreePlan  = billingUser.license_type === 'Free';
    var isBetaPlan  = billingUser.license_type === 'Beta';
    var isPayPerUse = billingUser.license_type === 'Pay-per-Use';

    var renewalLabel = 'Analysen erneuern sich am';
    var renewalText  = '';

    if (isPaidPlan) {
      var renewalDate = null;
      if (billingUser.license_expires_at) {
        renewalDate = new Date(billingUser.license_expires_at).toLocaleDateString('de-DE');
      } else if (billingUser.next_credit_reset_date) {
        renewalDate = new Date(billingUser.next_credit_reset_date).toLocaleDateString('de-DE');
      } else if (billingUser.period_start_date) {
        var d = new Date(billingUser.period_start_date);
        d.setMonth(d.getMonth() + 1);
        renewalDate = d.toLocaleDateString('de-DE');
      }
      renewalText = renewalDate || '-';
    } else if (isFreePlan) {
      renewalLabel = 'Analyse-Status';
      renewalText  = analysesLeft > 0 ? '1 kostenlose Analyse verf\u00fcgbar' : 'Kostenlose Analyse bereits genutzt';
    } else if (isPayPerUse) {
      renewalLabel = 'Analyse-Status';
      renewalText  = analysesLeft > 0 ? '1 Analyse verf\u00fcgbar' : 'Analyse bereits genutzt - jetzt neue Analyse kaufen';
    } else if (isBetaPlan) {
      renewalLabel = 'Analyse-Status';
      renewalText  = 'Beta-Analysen erneuern sich nicht automatisch';
    }

    setText('[data-dashboard="credits-renewal-label"]', renewalLabel);
    setText('[data-dashboard="credits-renewal"]', renewalText);

    var planName = billingUser.license_type || '-';
    if (typeof planName === 'string' && planName.length > 0 && !isPayPerUse) {
      planName = planName.charAt(0).toUpperCase() + planName.slice(1);
    }
    if (isTeamMember) planName += ' (Team)';
    setText('[data-dashboard="plan-name"]', planName);

    if (analysesLimit) {
      setText('[data-dashboard="plan-description"]', isPaidPlan
        ? analysesLimit + ' Analysen pro Monat'
        : isPayPerUse ? '1 Analyse, kein Abo'
        : analysesLimit + ' Analyse(n)');
    } else {
      setText('[data-dashboard="plan-description"]', '');
    }

    setText('[data-user="name"]',  user.full_name || 'Unbekannt');
    setText('[data-user="email"]', user.email || '');

    var avatarEl = document.querySelector('[data-user="avatar"]');
    if (avatarEl) {
      avatarEl.textContent = getInitials(user.full_name || '');
      avatarEl.style.cssText += ';display:flex;align-items:center;justify-content:center';
    }

    var teamPlans   = ['Starter', 'Pro', 'Professional', 'Enterprise'];
    var hasTeam     = teamPlans.indexOf(billingUser.license_type) !== -1;
    var teamBtn     = document.getElementById('open-team-modal');
    var teamSection = document.getElementById('team-section');
    if (teamBtn)     teamBtn.style.display     = hasTeam ? '' : 'none';
    if (teamSection) teamSection.style.display = hasTeam ? '' : 'none';
  }

  // ── UI: Skeleton / empty states ───────────────────────────────────────────────

  function removeLoadingSkeleton() {
    if (!globalContainer) return;
    var skeleton = globalContainer.querySelector('.loading-skeleton');
    if (skeleton) skeleton.remove();
  }

  function showLoadingSkeleton() {
    if (!globalContainer) return;
    globalContainer.innerHTML =
      '<div class="loading-skeleton">' +
        '<div class="spinner"></div>' +
        '<p style="margin-top:16px;color:#7a8ba8;">Lade Dashboard...</p>' +
      '</div>';
  }

  function showNoUserMessage() {
    if (!globalContainer) return;
    removeLoadingSkeleton();
    globalContainer.innerHTML =
      '<div style="grid-column:1/-1;padding:60px 20px;text-align:center;color:#f87171;">' +
        '<p style="font-weight:600;margin-bottom:8px;">Account nicht gefunden</p>' +
        '<p style="font-size:14px;color:#7a8ba8;">Bitte melde dich erneut an oder kontaktiere den Support.</p>' +
      '</div>';
  }

  function showEmptyState() {
    if (!globalContainer) return;
    removeLoadingSkeleton();
    globalContainer.innerHTML =
      '<div style="grid-column:1/-1;padding:60px 20px;text-align:center;color:#7a8ba8;">' +
        '<p style="margin:0 0 10px;font-weight:500;">Noch keine Analysen vorhanden</p>' +
        '<p style="margin:0;font-size:14px;">Starte deine erste Analyse!</p>' +
      '</div>';
  }

  // ── UI: Sticky header fix ─────────────────────────────────────────────────────

  function fixStickyHeader() {
    var header = document.querySelector('.analysis-row-header');
    if (!header) return;
    var nav = document.querySelector('nav') || document.querySelector('.navbar') || document.querySelector('.w-nav');
    var navHeight = nav ? nav.offsetHeight : 60;
    var parent = header.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      var style = window.getComputedStyle(parent);
      var ov    = style.overflow + ' ' + style.overflowX + ' ' + style.overflowY;
      if (ov.indexOf('auto') !== -1 || ov.indexOf('scroll') !== -1 || ov.indexOf('hidden') !== -1) {
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
    if (paginationEl) return;
    paginationEl = document.createElement('div');
    paginationEl.className = 'pagination-wrapper';
    paginationEl.innerHTML =
      '<button class="pagination-btn pagination-prev" type="button">Zur\u00fcck</button>' +
      '<span class="pagination-info"></span>' +
      '<button class="pagination-btn pagination-next" type="button">N\u00e4chste Seite</button>';
    container.parentElement.appendChild(paginationEl);
    paginationEl.querySelector('.pagination-prev').addEventListener('click', function () {
      if (currentPage > 1) { currentPage -= 1; renderAnalysesPage(globalContainer, currentPage); }
    });
    paginationEl.querySelector('.pagination-next').addEventListener('click', function () {
      if (currentPage < totalPages) { currentPage += 1; renderAnalysesPage(globalContainer, currentPage); }
    });
    updatePaginationInfo();
  }

  function updatePaginationInfo() {
    if (!paginationEl) return;
    var info    = paginationEl.querySelector('.pagination-info');
    var prevBtn = paginationEl.querySelector('.pagination-prev');
    var nextBtn = paginationEl.querySelector('.pagination-next');
    info.textContent = 'Seite ' + currentPage + ' von ' + totalPages;
    if (currentPage <= 1) prevBtn.setAttribute('disabled', 'disabled'); else prevBtn.removeAttribute('disabled');
    if (currentPage >= totalPages) nextBtn.setAttribute('disabled', 'disabled'); else nextBtn.removeAttribute('disabled');
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

  var downloadSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v13m0 0l-4-4m4 4l4-4" stroke="#e8edf5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="#e8edf5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var eyeSvg      = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C6.5 4.5 2.15 8 0.75 12c1.4 4 5.75 7.5 11.25 7.5s9.85-3.5 11.25-7.5C21.85 8 17.5 4.5 12 4.5z" fill="#e8edf5"/><circle cx="12" cy="12" r="3.2" fill="#252d3d"/></svg>';
  var aiAgentSvg  = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="8" width="12" height="10" rx="2" fill="#e8edf5"/><circle cx="9" cy="12" r="1.5" fill="#252d3d"/><circle cx="15" cy="12" r="1.5" fill="#252d3d"/><rect x="10" y="15" width="4" height="1.5" rx="0.75" fill="#252d3d"/><rect x="11" y="4" width="2" height="4" rx="1" fill="#e8edf5"/><circle cx="12" cy="5" r="2" fill="#e8edf5"/></svg>';

  // FIX: XSS-sichere Row-Erstellung – User-Daten per textContent statt innerHTML
  function createAnalysisRow(analysis) {
    var row        = document.createElement('div');
    row.className  = 'table-list';
    var isMobile   = window.innerWidth <= 768;
    var isCompleted = analysis.status === 'completed';
    var actionClass = isCompleted ? '' : 'action-disabled';
    var canDownload = isCompleted && canAccessPdf(analysis);

    var statusText  = 'Abgeschlossen';
    var statusClass = 'completed';
    if (analysis.status === 'processing') { statusText = 'In Bearbeitung'; statusClass = 'processing'; }
    else if (analysis.status === 'error' || analysis.status === 'failed') { statusText = 'Fehler'; statusClass = 'error'; }

    var formattedDate = '-';
    try { formattedDate = new Date(analysis.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) {}

    var downloadTitle = !isCompleted
      ? 'Analyse muss abgeschlossen sein'
      : !canAccessPdf(analysis)
        ? 'PDF-Report nur f\u00fcr kostenpflichtige Pl\u00e4ne oder Pay-per-Use verf\u00fcgbar'
        : (pdfUrlCache[analysis.id] ? 'Report \u00f6ffnen' : 'Report generieren & herunterladen');

    // Grundstruktur mit sicheren Platzhaltern – User-Daten NICHT in innerHTML
    if (isMobile) {
      row.innerHTML =
        '<div class="analysis-url"><div class="text-block-url"></div></div>' +
        '<div class="analysis-keyword"><div class="text-block-keyword"></div></div>' +
        '<div class="analysis-status"><div class="status-badge status-' + statusClass + '"></div></div>' +
        '<div class="analysis-date"><div class="text-block-date"></div></div>' +
        '<div class="action-cell" style="display:flex;justify-content:center;gap:16px;width:100%;margin-top:8px;">' +
          '<a href="#" class="aktion-link w-inline-block ' + actionClass + '" target="_blank">' + eyeSvg + '</a>' +
          '<a href="#" class="aktion-link w-inline-block ' + actionClass + '" target="_blank">' + aiAgentSvg + '</a>' +
          '<button class="aktion-link download-link ' + (canDownload ? '' : 'action-disabled') + '" aria-label="Report herunterladen" title="' + escapeHtml(downloadTitle) + '"' + (canDownload ? '' : ' disabled') + '>' + downloadSvg + '</button>' +
        '</div>';
    } else {
      row.innerHTML =
        '<div class="analysis-url"><div class="text-block-url"></div></div>' +
        '<div class="analysis-keyword"><div class="text-block-keyword"></div></div>' +
        '<div class="analysis-status"><div class="status-badge status-' + statusClass + '"></div></div>' +
        '<div class="analysis-date"><div class="text-block-date"></div></div>' +
        '<div class="action-cell"><a href="#" class="aktion-link w-inline-block ' + actionClass + '" target="_blank">' + eyeSvg + '</a></div>' +
        '<div class="action-cell"><a href="#" class="aktion-link w-inline-block ' + actionClass + '" target="_blank">' + aiAgentSvg + '</a></div>' +
        '<div class="action-cell"><button class="aktion-link download-link ' + (canDownload ? '' : 'action-disabled') + '" aria-label="Report herunterladen" title="' + escapeHtml(downloadTitle) + '"' + (canDownload ? '' : ' disabled') + '>' + downloadSvg + '</button></div>';
    }

    // XSS-safe: User-Daten per textContent setzen
    var maxUrl     = isMobile ? 40 : 70;
    var maxKeyword = isMobile ? 25 : 40;
    row.querySelector('.text-block-url').textContent     = truncate(analysis.landing_page_url, maxUrl);
    row.querySelector('.text-block-keyword').textContent = truncate(analysis.keyword, maxKeyword);
    row.querySelector('.status-badge').textContent       = statusText;
    row.querySelector('.text-block-date').textContent    = formattedDate;

    // Links per href setzen (nicht innerHTML) – analysis.id ist UUID, trotzdem sauber
    var links = row.querySelectorAll('a.aktion-link');
    if (links[0]) links[0].href = '/analyse/resultat?id=' + encodeURIComponent(analysis.id);
    if (links[1]) links[1].href = '/analyse/optimization-agent?analysis_id=' + encodeURIComponent(analysis.id);
    if (!isCompleted) {
      Array.from(links).forEach(function (l) { l.title = 'Analyse ist noch nicht abgeschlossen'; });
    }

    if (canDownload) {
      var dlBtn = row.querySelector('.download-link');
      if (dlBtn) {
        dlBtn.addEventListener('click', function () { handleReportDownload(dlBtn, analysis.id); });
      }
    }

    return row;
  }

  function renderAnalysesPage(container, page) {
    currentPage = page;
    ensureHeaderExists(container);
    var rows = container.querySelectorAll('.table-list');
    for (var i = 0; i < rows.length; i++) rows[i].remove();
    var items = analysesData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    for (var j = 0; j < items.length; j++) container.appendChild(createAnalysisRow(items[j]));
    updatePaginationInfo();
  }

  async function loadAndRenderAnalyses(keepPage) {
    if (!globalContainer || !globalMemberstackId) { showEmptyState(); return; }
    var data   = await fetchAnalysesForMember(globalMemberstackId);
    analysesData = data || [];
    totalPages   = Math.max(1, Math.ceil(analysesData.length / PAGE_SIZE));
    if (!analysesData.length) { showEmptyState(); return; }
    removeLoadingSkeleton();
    currentPage = keepPage ? Math.min(currentPage, totalPages) : 1;
    renderAnalysesPage(globalContainer, currentPage);
  }

  // ── PDF download ──────────────────────────────────────────────────────────────

  async function triggerBlobDownload(url, fileName) {
    var fileRes = await fetch(url);
    var blob    = await fileRes.blob();
    var blobUrl = URL.createObjectURL(blob);
    var a       = document.createElement('a');
    a.href      = blobUrl;
    a.download  = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 5000);
  }

  async function handleReportDownload(btn, analysisId) {
    if (!globalSupabaseUserId) return;
    var analysis = analysesData.find(function (a) { return a.id === analysisId; });
    if (!canAccessPdf(analysis)) return;

    var isAgency = (globalLicenseType || '').toLowerCase() === 'agency';
    btn.classList.add('loading');
    btn.title = 'Wird generiert...';

    try {
      var domain   = 'report';
      var datetime = '';
      try {
        domain   = new URL(analysis.landing_page_url).hostname.replace('www.', '');
        var d    = new Date(analysis.created_at);
        datetime = '-' + d.toISOString().slice(0, 10) + '-' + d.toISOString().slice(11, 16).replace(':', '-');
      } catch (e) {}
      var ext      = isAgency ? 'docx' : 'pdf';
      var fileName = 'convertlyze-' + domain + datetime + '.' + ext;

      var existingUrl = pdfUrlCache[analysisId] || null;
      if (existingUrl) {
        await triggerBlobDownload(existingUrl, fileName);
        btn.classList.remove('loading');
        btn.title = 'Report herunterladen';
        return;
      }

      var response = await fetch(PDF_SERVICE_URL + (isAgency ? '/generate-word' : '/generate-pdf'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-pdf-secret': PDF_SECRET },
        body:    JSON.stringify({ userId: globalSupabaseUserId, analysisId: analysisId }),
      });

      if (!response.ok) {
        var err = await response.json();
        throw new Error(err.error || 'Generierung fehlgeschlagen');
      }

      var data        = await response.json();
      var downloadUrl = data.downloadUrl;
      pdfUrlCache[analysisId] = downloadUrl;

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

  // ── Realtime ──────────────────────────────────────────────────────────────────

  function subscribeToAnalysisChanges(userId) {
    try {
      if (!window.supabase?.channel) return;
      if (realtimeChannel) window.supabase.removeChannel(realtimeChannel);
      realtimeChannel = window.supabase
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
      globalContainer    = firstTableList ? firstTableList.parentElement : null;
      if (globalContainer) showLoadingSkeleton();

      var memberstackId = null;
      try {
        var member    = await window.$memberstackDom.getCurrentMember();
        memberstackId = member?.data?.id || null;
      } catch (e) {
        console.error('[CVZ] Memberstack Fehler:', e);
      }

      if (!memberstackId) {
        if (globalContainer) showNoUserMessage();
        document.body.classList.add('content-loaded');
        return;
      }

      globalMemberstackId = memberstackId;

      // Checkout aus sessionStorage
      var CHECKOUT_PRICE_IDS = {
        'starter':    { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
        'pro':        { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
        'enterprise': { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
      };
      var savedPlan       = sessionStorage.getItem('selected_plan');
      var savedBilling    = sessionStorage.getItem('selected_billing') || 'monthly';
      var checkoutPriceId = CHECKOUT_PRICE_IDS[savedPlan]?.[savedBilling];
      sessionStorage.removeItem('selected_plan');
      sessionStorage.removeItem('selected_billing');

      if (checkoutPriceId) {
        window.$memberstackDom.purchasePlansWithCheckout({
          priceId:    checkoutPriceId,
          successUrl: window.location.origin + '/member/danke',
        }).catch(function () { document.documentElement.style.visibility = 'visible'; });
        return;
      }

      document.documentElement.style.visibility = 'visible';

      var currentUser = await fetchUser(memberstackId, 1);
      if (!currentUser) currentUser = await fetchUser(memberstackId, 5);

      if (!currentUser) {
        if (globalContainer) showNoUserMessage();
        document.body.classList.add('content-loaded');
        return;
      }

      globalSupabaseUserId = currentUser.id;
      globalLicenseType    = (currentUser._billingUser || currentUser).license_type || '';
      globalHasPdfAccess   = checkPdfAccess(currentUser);

      // Team-Invite nach Login annehmen
      var pendingInvite = getCookie('cvz_invite');
      if (pendingInvite) {
        try {
          var inviteRes  = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/accept-team-invite', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU' },
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
        } catch (inviteErr) {
          console.error('[CVZ] Team-Invite Fehler:', inviteErr);
        }
      }

      var didReset = await triggerCreditResetIfPaid(currentUser);
      if (didReset) {
        var refreshed = await fetchUser(memberstackId, 1);
        if (refreshed) currentUser = refreshed;
      }

      renderUserDashboard(currentUser);

      if (globalContainer) {
        initPagination(globalContainer);
        await loadAndRenderAnalyses(false);
        subscribeToAnalysisChanges(currentUser.id);
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

  var PAY_PER_USE_PRICE_ID = 'prc_pay-per-use-14750y0n';

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

  // FIX: retry() statt manuellem Counter
  function depsReady() { return !!window.$memberstackDom; }

  function init() {
    retry(depsReady, 10, 500)
      .then(function () { initPPUButton(); })
      .catch(function () { console.warn('[CVZ] PPU: Memberstack nicht geladen.'); });
  }

  // retry ist im Dashboard-IIFE definiert – hier nochmal lokal für Unabhängigkeit
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
