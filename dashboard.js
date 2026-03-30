// ── Sofort verstecken wenn Plan im sessionStorage ──────────────────────────
(function() {
  if (sessionStorage.getItem('selected_plan')) {
    document.documentElement.style.visibility = 'hidden';
  }
})();

(function() {
  function fixStickyHeader() {
    var header = document.querySelector('.analysis-row-header');
    if (!header) return;

    var nav = document.querySelector('nav') || document.querySelector('.navbar') || document.querySelector('.w-nav');
    var navHeight = nav ? nav.offsetHeight : 60;

    var parent = header.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      var style = window.getComputedStyle(parent);
      var ov = style.overflow + ' ' + style.overflowX + ' ' + style.overflowY;
      if (ov.indexOf('auto') !== -1 || ov.indexOf('scroll') !== -1 || ov.indexOf('hidden') !== -1) {
        parent.style.overflow = 'visible';
        parent.style.overflowX = 'visible';
        parent.style.overflowY = 'visible';
        parent.style.maxHeight = 'none';
      }
      parent = parent.parentElement;
    }

    header.style.position = 'sticky';
    header.style.top = navHeight + 'px';
    header.style.zIndex = '100';
    header.style.backgroundColor = '#ffffff';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixStickyHeader);
  } else {
    fixStickyHeader();
  }
  setTimeout(fixStickyHeader, 500);
  setTimeout(fixStickyHeader, 1500);
})();

/* ==================== DASHBOARD LOGIK ==================== */
(function() {

  var PDF_SERVICE_URL = 'https://convertlyze-pdf-service-production.up.railway.app';
  var PDF_SECRET      = 'cvl-pdf-2026-geheim';

  var PAGE_SIZE = 10;

  var analysesData = [];
  var currentPage = 1;
  var totalPages = 1;
  var paginationEl = null;

  var globalSupabaseUserId = null;
  var globalMemberstackId = null;
  var globalLicenseType   = null;
  var globalHasPdfAccess  = false;
  var globalContainer = null;
  var realtimeChannel = null;

  var pdfUrlCache = {};

  function sleep(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }

  // ── Warten bis Supabase-Client UND Memberstack bereit sind ──
  async function waitForDependencies() {
    for (var i = 0; i < 100; i++) {
      var supabaseOk    = window.supabase && typeof window.supabase.from === 'function';
      var memberstackOk = window.$memberstackDom && typeof window.$memberstackDom.getCurrentMember === 'function';
      if (supabaseOk && memberstackOk) {
        console.log('✅ Supabase & Memberstack bereit nach ' + (i * 100) + 'ms');
        return true;
      }
      await sleep(100);
    }
    console.warn('⚠️ Timeout: Supabase oder Memberstack nicht bereit nach 10s');
    return false;
  }

  function checkPdfAccess(user) {
    var billingUser = user._billingUser || user;
    var type    = billingUser.license_type   || '';
    var status  = billingUser.license_status || '';
    var expires = billingUser.license_expires_at;

    var paidPlans = ['Starter', 'Growth', 'Pro', 'Professional', 'Enterprise', 'Agency'];
    if (paidPlans.indexOf(type) === -1) return false;

    if (status === 'active') return true;
    if (status === 'canceling' && expires && new Date(expires) > new Date()) return true;

    return false;
  }

  function getInitials(name) {
    if (!name || typeof name !== 'string') return '';
    var parts = name.trim().split(/\s+/);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  async function fetchUserFast(memberstackId) {
    var result = await supabase
      .from('users')
      .select('id, email, full_name, license_type, license_status, license_expires_at, credits_limit, credits_used_current_period, credits_remaining, reserved_credits, chat_messages_limit, chat_messages_used_current_period, period_start_date, next_credit_reset_date, plan_price, owner_user_id, team_role, ppu_credits')
      .eq('memberstack_id', memberstackId)
      .single();

    if (!result.data) {
      if (result.error) console.warn('⚠️ fetchUserFast error:', result.error);
      return null;
    }

    if (result.data.owner_user_id) {
      var ownerResult = await supabase
        .from('users')
        .select('id, credits_limit, credits_used_current_period, credits_remaining, reserved_credits, license_type, license_status, license_expires_at, next_credit_reset_date, period_start_date, plan_price, ppu_credits')
        .eq('id', result.data.owner_user_id)
        .single();

      if (ownerResult.data) {
        result.data._billingUser = ownerResult.data;
      }
    }

    return result.data;
  }

  async function fetchUserWithSmartRetry(memberstackId) {
    var maxAttempts = 5;
    var delayMs = 300;

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      var result = await supabase
        .from('users')
        .select('id, email, full_name, license_type, license_status, license_expires_at, credits_limit, credits_used_current_period, credits_remaining, reserved_credits, chat_messages_limit, chat_messages_used_current_period, period_start_date, next_credit_reset_date, plan_price, owner_user_id, team_role, ppu_credits')
        .eq('memberstack_id', memberstackId)
        .single();

      if (result.data) {
        if (result.data.owner_user_id) {
          var ownerResult = await supabase
            .from('users')
            .select('id, credits_limit, credits_used_current_period, credits_remaining, reserved_credits, license_type, license_status, license_expires_at, next_credit_reset_date, period_start_date, plan_price, ppu_credits')
            .eq('id', result.data.owner_user_id)
            .single();

          if (ownerResult.data) {
            result.data._billingUser = ownerResult.data;
          }
        }
        return result.data;
      }

      if (result.error) console.warn('⚠️ Versuch ' + attempt + ' error:', result.error);
      if (attempt < maxAttempts) await sleep(delayMs);
    }
    return null;
  }

  async function fetchAnalysesForMember(memberstackId) {
    if (!memberstackId) return [];

    var result = await supabase.rpc('get_analyses_for_member', { p_memberstack_id: memberstackId });

    if (result.error) {
      console.error('❌ Fehler beim Laden der Analysen (RPC):', result.error);
      return [];
    }

    var data = result.data || [];
    data.forEach(function(a) {
      if (a.pdf_url) pdfUrlCache[a.id] = a.pdf_url;
    });

    return data;
  }

  async function triggerCreditResetIfPaid(user) {
    try {
      var billingUser = user._billingUser || user;
      var paid = ['Starter', 'Growth', 'Pro', 'Professional', 'Enterprise'].indexOf(billingUser.license_type) !== -1;
      if (!paid) return false;

      var result = await supabase.rpc('reset_user_credits_if_due', { p_user_id: billingUser.id });

      if (result.error) {
        console.warn('⚠️ reset_user_credits_if_due:', result.error);
        return false;
      }

      var row = Array.isArray(result.data) ? result.data[0] : result.data;
      return !!row?.did_reset;
    } catch (e) {
      console.warn('⚠️ reset_user_credits_if_due exception:', e);
      return false;
    }
  }

  function renderUserDashboard(user) {
    var billingUser = user._billingUser || user;
    var isTeamMember = !!user.owner_user_id;

    var reservedCredits = Math.round(Number(billingUser.reserved_credits || 0));
    var analysesUsed    = Math.round(Number(billingUser.credits_used_current_period || 0));
    var analysesLimit   = Math.round(Number(billingUser.credits_limit || 0));
    var ppuCredits      = Math.round(Number(billingUser.ppu_credits || 0));

    var analysesLeft;
    if (billingUser.credits_remaining !== null && billingUser.credits_remaining !== undefined) {
      analysesLeft = Math.max(0, Math.round(Number(billingUser.credits_remaining)) - reservedCredits);
    } else {
      analysesLeft = Math.max(0, analysesLimit - analysesUsed - reservedCredits);
    }

    var chatUsed  = Math.round(Number(user.chat_messages_used_current_period || 0));
    var chatLimit = Math.round(Number(user.chat_messages_limit || 0));
    var chatLeft  = Math.max(chatLimit - chatUsed, 0);

    var percentRaw = analysesLimit ? ((analysesUsed + reservedCredits) / analysesLimit) * 100 : 0;
    var percentText   = Math.round(percentRaw);
    var percentForBar = Math.min(percentRaw, 100);

    function setText(selector, value) {
      var el = document.querySelector(selector);
      if (el) el.textContent = value ?? '';
    }

    var usedDisplay = reservedCredits > 0
      ? (analysesUsed + '/' + analysesLimit + ' Analysen (' + reservedCredits + ' in Bearbeitung)')
      : (analysesUsed + '/' + analysesLimit + ' Analysen');
    setText('[data-dashboard="credits_used_current_period"]', usedDisplay);
    setText('[data-dashboard="analyses-percent"]', percentText + '% des Limits genutzt');

    var progressBar = document.querySelector('[data-dashboard="progress-bar"]');
    if (progressBar) progressBar.style.width = percentForBar + '%';

    setText('[data-dashboard="credits-remaining"]', analysesLeft);
    setText('[data-dashboard="chat-messages-remaining"]', chatLeft);
    setText('[data-dashboard="chat-messages-used"]', chatUsed + '/' + chatLimit);

    setText('[data-dashboard="ppu-credits"]', ppuCredits);
    setText('[data-dashboard="ppu-label"]', ppuCredits > 0
      ? ppuCredits + ' Pay-per-Use Analyse' + (ppuCredits > 1 ? 'n' : '') + ' verfügbar'
      : 'Keine Pay-per-Use Analysen');

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
      renewalText = renewalDate || '–';
    } else if (isFreePlan) {
      renewalLabel = 'Analyse-Status';
      renewalText  = analysesLeft > 0
        ? '1 kostenlose Analyse verfügbar'
        : 'Kostenlose Analyse bereits genutzt';
    } else if (isPayPerUse) {
      renewalLabel = 'Analyse-Status';
      renewalText  = analysesLeft > 0
        ? '1 Analyse verfügbar'
        : 'Analyse bereits genutzt – jetzt neue Analyse kaufen';
    } else if (isBetaPlan) {
      renewalLabel = 'Analyse-Status';
      renewalText  = 'Beta-Analysen erneuern sich nicht automatisch';
    }

    setText('[data-dashboard="credits-renewal-label"]', renewalLabel);
    setText('[data-dashboard="credits-renewal"]', renewalText);

    var planName = billingUser.license_type || '–';
    if (typeof planName === 'string' && planName.length > 0 && !isPayPerUse) {
      planName = planName.charAt(0).toUpperCase() + planName.slice(1);
    }

    if (isTeamMember) planName += ' (Team)';

    setText('[data-dashboard="plan-name"]', planName);

    if (analysesLimit) {
      var planDesc = isPaidPlan
        ? analysesLimit + ' Analysen pro Monat'
        : isPayPerUse
          ? '1 Analyse, kein Abo'
          : analysesLimit + ' Analyse(n)';
      setText('[data-dashboard="plan-description"]', planDesc);
    } else {
      setText('[data-dashboard="plan-description"]', '');
    }

    var fullName = user.full_name || 'Unbekannt';
    var email    = user.email || '';
    var initials = getInitials(fullName);

    setText('[data-user="name"]', fullName);
    setText('[data-user="email"]', email);

    var avatarEl = document.querySelector('[data-user="avatar"]');
    if (avatarEl) {
      avatarEl.textContent = initials;
      avatarEl.style.display = 'flex';
      avatarEl.style.alignItems = 'center';
      avatarEl.style.justifyContent = 'center';
    }

    // ── Team-Button: nur bei bezahlten Plänen mit Team-Feature ──
    var teamPlans = ['Starter', 'Pro', 'Professional', 'Enterprise'];
    var hasTeam   = teamPlans.indexOf(billingUser.license_type) !== -1;
    var teamBtn     = document.getElementById('open-team-modal');
    var teamSection = document.getElementById('team-section');
    if (teamBtn)     teamBtn.style.display     = hasTeam ? '' : 'none';
    if (teamSection) teamSection.style.display = hasTeam ? '' : 'none';
  }

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
        '<p style="margin-top: 16px; color: #6b7280;">Lade Dashboard...</p>' +
      '</div>';
  }

  function showNoUserMessage() {
    if (!globalContainer) return;
    removeLoadingSkeleton();
    globalContainer.innerHTML =
      '<div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: #ef4444;">' +
        '<p style="font-weight: 600; margin-bottom: 8px;">Account nicht gefunden</p>' +
        '<p style="font-size: 14px; color: #6b7280;">Bitte melde dich erneut an oder kontaktiere den Support.</p>' +
      '</div>';
  }

  function showEmptyState() {
    if (!globalContainer) return;
    removeLoadingSkeleton();
    globalContainer.innerHTML =
      '<div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: #6b7280;">' +
        '<p style="margin: 0 0 10px 0; font-weight: 500;">Noch keine Analysen vorhanden</p>' +
        '<p style="margin: 0; font-size: 14px;">Starte deine erste Analyse! 🚀</p>' +
      '</div>';
  }

  function initPagination(container) {
    if (paginationEl) return;

    paginationEl = document.createElement('div');
    paginationEl.className = 'pagination-wrapper';
    paginationEl.innerHTML =
      '<button class="pagination-btn pagination-prev" type="button">« Zurück</button>' +
      '<span class="pagination-info"></span>' +
      '<button class="pagination-btn pagination-next" type="button">Nächste Seite »</button>';

    container.parentElement.appendChild(paginationEl);

    paginationEl.querySelector('.pagination-prev').addEventListener('click', function() {
      if (currentPage > 1) { currentPage -= 1; renderAnalysesPage(globalContainer, currentPage); }
    });

    paginationEl.querySelector('.pagination-next').addEventListener('click', function() {
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

  async function triggerBlobDownload(url, fileName) {
    var fileRes = await fetch(url);
    var blob = await fileRes.blob();
    var blobUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 5000);
  }

  async function handleReportDownload(btn, analysisId) {
    if (!globalSupabaseUserId) return;
    if (!globalHasPdfAccess) return;

    var isAgency = (globalLicenseType || '').toLowerCase() === 'agency';

    btn.classList.add('loading');
    btn.title = 'Wird generiert...';

    try {
      var analysis = analysesData.find(function(a) { return a.id === analysisId; });
      var domain = 'report';
      var datetime = '';
      try {
        domain = new URL(analysis.landing_page_url).hostname.replace('www.', '');
        var d = new Date(analysis.created_at);
        var date = d.toISOString().slice(0, 10);
        var time = d.toISOString().slice(11, 16).replace(':', '-');
        datetime = '-' + date + '-' + time;
      } catch(e) {}
      var ext = isAgency ? 'docx' : 'pdf';
      var fileName = 'convertlyze-' + domain + datetime + '.' + ext;

      var existingUrl = pdfUrlCache[analysisId] || null;
      if (existingUrl) {
        await triggerBlobDownload(existingUrl, fileName);
        btn.classList.remove('loading');
        btn.title = 'Report herunterladen';
        return;
      }

      var endpoint = isAgency ? '/generate-word' : '/generate-pdf';

      var response = await fetch(PDF_SERVICE_URL + endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pdf-secret': PDF_SECRET
        },
        body: JSON.stringify({
          userId: globalSupabaseUserId,
          analysisId: analysisId
        })
      });

      if (!response.ok) {
        var err = await response.json();
        throw new Error(err.error || 'Generierung fehlgeschlagen');
      }

      var data = await response.json();
      var downloadUrl = data.downloadUrl;
      pdfUrlCache[analysisId] = downloadUrl;
      supabase
        .from('analyses')
        .update({ pdf_url: downloadUrl, pdf_generated_at: new Date().toISOString() })
        .eq('id', analysisId)
        .then(function() {});

      await triggerBlobDownload(downloadUrl, fileName);
      btn.classList.remove('loading');
      btn.title = 'Report herunterladen';

    } catch (err) {
      console.error('❌ Report-Download Fehler:', err);
      btn.classList.remove('loading');
      btn.title = 'Fehler – erneut versuchen';
      btn.style.backgroundColor = '#fee2e2';
      setTimeout(function() { btn.style.backgroundColor = ''; }, 2500);
    }
  }

  var downloadSvg =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 3v13m0 0l-4-4m4 4l4-4" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  var eyeSvg =
    '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 4.5C6.5 4.5 2.15 8 0.75 12c1.4 4 5.75 7.5 11.25 7.5s9.85-3.5 11.25-7.5C21.85 8 17.5 4.5 12 4.5z" fill="#1f2937"/>' +
      '<circle cx="12" cy="12" r="3.2" fill="#EFF6FF"/>' +
    '</svg>';

  var aiAgentSvg =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<rect x="6" y="8" width="12" height="10" rx="2" fill="#1f2937"/>' +
      '<circle cx="9" cy="12" r="1.5" fill="#FFFFFF"/>' +
      '<circle cx="15" cy="12" r="1.5" fill="#FFFFFF"/>' +
      '<rect x="10" y="15" width="4" height="1.5" rx="0.75" fill="#FFFFFF"/>' +
      '<rect x="11" y="4" width="2" height="4" rx="1" fill="#1f2937"/>' +
      '<circle cx="12" cy="5" r="2" fill="#A78BFA"/>' +
    '</svg>';

  function createAnalysisRow(analysis) {
    var row = document.createElement('div');
    row.className = 'table-list';

    var formattedDate = '-';
    try {
      formattedDate = new Date(analysis.created_at).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
    } catch(e) {}

    var statusText  = 'Abgeschlossen';
    var statusClass = 'completed';

    if (analysis.status === 'processing') {
      statusText  = 'In Bearbeitung';
      statusClass = 'processing';
    } else if (analysis.status === 'error' || analysis.status === 'failed') {
      statusText  = 'Fehler';
      statusClass = 'error';
    }

    var isCompleted = analysis.status === 'completed';
    var actionClass = isCompleted ? '' : 'action-disabled';
    var actionTitle = isCompleted ? '' : 'title="Analyse ist noch nicht abgeschlossen"';

    var isMobile = window.innerWidth <= 768;

    var displayUrl = analysis.landing_page_url || '-';
    var maxUrlLength = isMobile ? 40 : 70;
    if (displayUrl.length > maxUrlLength) displayUrl = displayUrl.substring(0, maxUrlLength - 3) + '...';

    var displayKeyword = analysis.keyword || '-';
    var maxKeywordLength = isMobile ? 25 : 40;
    if (displayKeyword.length > maxKeywordLength) displayKeyword = displayKeyword.substring(0, maxKeywordLength - 3) + '...';

    var canDownload = isCompleted && globalHasPdfAccess;

    var downloadTitle = !isCompleted
      ? 'Analyse muss abgeschlossen sein'
      : !globalHasPdfAccess
        ? 'Kein aktiver Plan – bitte Plan verlängern'
        : (pdfUrlCache[analysis.id] ? 'Report öffnen' : 'Report generieren & herunterladen');

    var downloadBtnHtml =
      '<button class="aktion-link download-link ' + (canDownload ? '' : 'action-disabled') + '" ' +
        'aria-label="Report herunterladen" ' +
        'title="' + downloadTitle + '" ' +
        'data-analysis-id="' + analysis.id + '"' +
        (canDownload ? '' : ' disabled') +
      '>' + downloadSvg + '</button>';

    if (isMobile) {
      row.innerHTML =
        '<div class="analysis-url"><div class="text-block-url">' + displayUrl + '</div></div>' +
        '<div class="analysis-keyword"><div class="text-block-keyword">' + displayKeyword + '</div></div>' +
        '<div class="analysis-status"><div class="status-badge status-' + statusClass + '">' + statusText + '</div></div>' +
        '<div class="analysis-date"><div class="text-block-date">' + formattedDate + '</div></div>' +
        '<div class="action-cell" style="display:flex;justify-content:center;gap:16px;width:100%;margin-top:8px;">' +
          '<a href="/analyse/resultat?id=' + analysis.id + '" class="aktion-link w-inline-block ' + actionClass + '" target="_blank" ' + actionTitle + '>' + eyeSvg + '</a>' +
          '<a href="/analyse/optimization-agent?analysis_id=' + analysis.id + '" class="aktion-link w-inline-block ' + actionClass + '" target="_blank" ' + actionTitle + '>' + aiAgentSvg + '</a>' +
          downloadBtnHtml +
        '</div>';
    } else {
      row.innerHTML =
        '<div class="analysis-url"><div class="text-block-url">' + displayUrl + '</div></div>' +
        '<div class="analysis-keyword"><div class="text-block-keyword">' + displayKeyword + '</div></div>' +
        '<div class="analysis-status"><div class="status-badge status-' + statusClass + '">' + statusText + '</div></div>' +
        '<div class="analysis-date"><div class="text-block-date">' + formattedDate + '</div></div>' +
        '<div class="action-cell"><a href="/analyse/resultat?id=' + analysis.id + '" class="aktion-link w-inline-block ' + actionClass + '" target="_blank" ' + actionTitle + '>' + eyeSvg + '</a></div>' +
        '<div class="action-cell"><a href="/analyse/optimization-agent?analysis_id=' + analysis.id + '" class="aktion-link w-inline-block ' + actionClass + '" target="_blank" ' + actionTitle + '>' + aiAgentSvg + '</a></div>' +
        '<div class="action-cell">' + downloadBtnHtml + '</div>';
    }

    if (canDownload) {
      var dlBtn = row.querySelector('.download-link');
      if (dlBtn) {
        dlBtn.addEventListener('click', function() {
          handleReportDownload(dlBtn, analysis.id);
        });
      }
    }

    return row;
  }

  function renderAnalysesPage(container, page) {
    currentPage = page;
    ensureHeaderExists(container);

    var rows = container.querySelectorAll('.table-list');
    for (var i = 0; i < rows.length; i++) rows[i].remove();

    var startIdx = (page - 1) * PAGE_SIZE;
    var endIdx   = startIdx + PAGE_SIZE;
    var items    = analysesData.slice(startIdx, endIdx);

    for (var j = 0; j < items.length; j++) {
      container.appendChild(createAnalysisRow(items[j]));
    }
    updatePaginationInfo();
  }

  async function loadAndRenderAnalyses(keepPage) {
    if (!globalContainer) return;

    if (!globalMemberstackId) {
      showEmptyState();
      return;
    }

    var data = await fetchAnalysesForMember(globalMemberstackId);
    analysesData = data || [];
    totalPages   = Math.max(1, Math.ceil(analysesData.length / PAGE_SIZE));

    if (!analysesData.length) {
      showEmptyState();
      return;
    }

    removeLoadingSkeleton();

    if (!keepPage) currentPage = 1;
    else currentPage = Math.min(currentPage, totalPages);

    renderAnalysesPage(globalContainer, currentPage);
  }

  function subscribeToAnalysisChanges(userId) {
    if (!supabase?.channel) return;

    if (realtimeChannel) supabase.removeChannel(realtimeChannel);

    realtimeChannel = supabase
      .channel('analyses-realtime-' + userId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'analyses', filter: 'user_id=eq.' + userId },
        async function() { await loadAndRenderAnalyses(true); }
      )
      .subscribe();
  }

  // ── Hauptfunktion ─────────────────────────────────────────────────────────
  async function initDashboard() {
    try {
      console.log('🔍 Dashboard init...');

      var ready = await waitForDependencies();
      if (!ready) return;

      var firstTableList = document.querySelector('.table-list');
      var container = firstTableList ? firstTableList.parentElement : null;
      globalContainer = container;
      console.log('📋 Container gefunden:', container ? 'ja' : 'nein');

      if (container) showLoadingSkeleton();

      var memberstackId = null;
      try {
        var member = await window.$memberstackDom.getCurrentMember();
        memberstackId = member?.data?.id || null;
      } catch (e) {
        console.error('❌ Memberstack Fehler:', e);
      }

      console.log('👤 Memberstack ID:', memberstackId || 'KEINE ID');

      if (!memberstackId) {
        if (container) showNoUserMessage();
        document.body.classList.add('content-loaded');
        return;
      }

      globalMemberstackId = memberstackId;

      // ── Checkout nach Registrierung triggern (nur Abo-Pläne, KEIN Pay-per-Use) ──
      var CHECKOUT_PRICE_IDS = {
        'starter':    { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
        'pro':        { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
        'enterprise': { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' }
      };
      var savedPlan       = sessionStorage.getItem('selected_plan');
      var savedBilling    = sessionStorage.getItem('selected_billing') || 'monthly';
      var checkoutPriceId = CHECKOUT_PRICE_IDS[savedPlan]?.[savedBilling];

      if (checkoutPriceId) {
        sessionStorage.removeItem('selected_plan');
        sessionStorage.removeItem('selected_billing');
        window.$memberstackDom.purchasePlansWithCheckout({
          priceId: checkoutPriceId,
          successUrl: window.location.origin + '/member/danke'
        }).catch(function() {
          document.documentElement.style.visibility = 'visible';
        });
        return;
      }

      // Kein Checkout → alten sessionStorage-Wert aufräumen und weitermachen
      sessionStorage.removeItem('selected_plan');
      sessionStorage.removeItem('selected_billing');
      document.documentElement.style.visibility = 'visible';

      console.log('📡 Lade User aus Supabase...');
      var currentUser = await fetchUserFast(memberstackId);
      if (!currentUser) currentUser = await fetchUserWithSmartRetry(memberstackId);
      console.log('📦 User aus Supabase:', currentUser);

      if (!currentUser) {
        if (container) showNoUserMessage();
        document.body.classList.add('content-loaded');
        return;
      }

      globalSupabaseUserId = currentUser.id;
      globalLicenseType    = (currentUser._billingUser || currentUser).license_type || '';
      globalHasPdfAccess   = checkPdfAccess(currentUser);

      console.log('✅ User geladen:', currentUser.email, '| Plan:', globalLicenseType);

      var didReset = await triggerCreditResetIfPaid(currentUser);
      if (didReset) {
        var refreshed = await fetchUserFast(memberstackId);
        if (refreshed) currentUser = refreshed;
      }

      renderUserDashboard(currentUser);
      console.log('✅ Dashboard gerendert');

      if (container) {
        initPagination(container);
        await loadAndRenderAnalyses(false);
        subscribeToAnalysisChanges(currentUser.id);
      }

      document.body.classList.add('content-loaded');
    } catch (err) {
      console.error('❌ Dashboard-Fehler:', err);
      document.body.classList.add('content-loaded');
    }
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }

})();

// ── Pay-per-Use Button ────────────────────────────────────────────────────
(function() {
  var PAY_PER_USE_PRICE_ID = 'prc_pay-per-use-14750y0n';

  function initPPUButton() {
    if (!window.$memberstackDom) return;

    document.querySelectorAll('[data-plan-upgrade="' + PAY_PER_USE_PRICE_ID + '"], [data-upgrade-plan="' + PAY_PER_USE_PRICE_ID + '"]').forEach(function(el) {
      var btn = el.tagName === 'A' ? el : el.closest('a');
      if (!btn) return;

      btn.href = '#';
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        window.$memberstackDom.purchasePlansWithCheckout({
          priceId: PAY_PER_USE_PRICE_ID
          successUrl: 'https://www.convertlyze.com/analyse/formular'
        }).catch(function(err) {
          console.error('Pay-per-Use Checkout error:', err);
        });
      });
    });
  }

  var attempts = 0;
  function tryInit() {
    attempts++;
    if (window.$memberstackDom) {
      initPPUButton();
    } else if (attempts < 5) {
      setTimeout(tryInit, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    setTimeout(tryInit, 500);
  }
})();
