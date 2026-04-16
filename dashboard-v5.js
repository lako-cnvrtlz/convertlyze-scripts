/* ============================================================
   CONVERTLYZE DASHBOARD v6.0
   Performance-optimiert:
   - Kein Polling: MutationObserver + Event statt setTimeout-Loop
   - Parallele Supabase-Calls mit Promise.all
   - Skeleton-UI sofort beim Laden
   - PDF-URL-Cache
   - Realtime-Kanal für Live-Updates
   ============================================================ */
(function () {

  /* ── Konfiguration ─────────────────────────────────────── */
  var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';
  var PDF_SERVICE_URL   = 'https://convertlyze-pdf-service-production.up.railway.app';
  var PDF_SECRET        = 'cvl-pdf-2026-geheim';
  var PAGE_SIZE         = 10;

  /* ── State ──────────────────────────────────────────────── */
  var state = {
    supabaseUserId:  null,
    memberstackId:   null,
    licenseType:     null,
    pdfAccess:       false,
    analyses:        [],
    currentPage:     1,
    totalPages:      1,
    pdfUrlCache:     {},
    realtimeChannel: null
  };

  /* ── Supabase-Helper ────────────────────────────────────── */
  function sbFetch(path, opts) {
    var options = opts || {};
    var headers = Object.assign({
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type':  'application/json'
    }, options.headers || {});
    return fetch(SUPABASE_URL + path, Object.assign({}, options, { headers: headers }));
  }

  /* ── Skeleton sofort einblenden ─────────────────────────── */
  function showSkeleton() {
    var container = document.querySelector('[data-dashboard-container]');
    if (!container) return;
    var rows = '';
    for (var i = 0; i < PAGE_SIZE; i++) {
      rows += '<div class="cvz-skeleton-row" style="' +
        'display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid #1e2736;' +
        'animation:cvzPulse 1.4s ease-in-out ' + (i * 0.06) + 's infinite;">' +
        '<div style="width:36%;height:14px;background:#252d3d;border-radius:4px;"></div>' +
        '<div style="width:18%;height:14px;background:#252d3d;border-radius:4px;"></div>' +
        '<div style="width:14%;height:14px;background:#252d3d;border-radius:4px;"></div>' +
        '<div style="width:12%;height:14px;background:#252d3d;border-radius:4px;"></div>' +
        '<div style="width:12%;height:14px;background:#252d3d;border-radius:4px;"></div>' +
        '</div>';
    }
    container.innerHTML = '<style>@keyframes cvzPulse{0%,100%{opacity:.4}50%{opacity:.9}}</style>' + rows;
  }

  /* ── Warten bis Memberstack bereit ist (kein Polling) ───── */
  function waitForMemberstack() {
    return new Promise(function (resolve) {
      // Bereits vorhanden?
      if (window.$memberstackDom) { resolve(window.$memberstackDom); return; }

      // MutationObserver auf window-Property
      var maxWait = setTimeout(function () {
        observer.disconnect();
        resolve(null); // Timeout nach 5s
      }, 5000);

      // Memberstack setzt sich selbst auf window – Observer auf body reicht
      var observer = new MutationObserver(function () {
        if (window.$memberstackDom) {
          clearTimeout(maxWait);
          observer.disconnect();
          resolve(window.$memberstackDom);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });

      // Zusätzlich: Memberstack feuert ein Custom Event wenn es bereit ist
      window.addEventListener('memberstack:ready', function handler() {
        window.removeEventListener('memberstack:ready', handler);
        clearTimeout(maxWait);
        observer.disconnect();
        resolve(window.$memberstackDom);
      });
    });
  }

  /* ── Init ────────────────────────────────────────────────── */
  async function init() {
    console.log('🔍 Dashboard init...');

    // Skeleton sofort zeigen – noch bevor irgendwas geladen ist
    showSkeleton();

    // Memberstack ohne Polling abwarten
    var ms = await waitForMemberstack();
    if (!ms) {
      console.error('❌ Memberstack nicht verfügbar');
      renderError('Authentifizierung nicht verfügbar. Bitte Seite neu laden.');
      return;
    }

    var result = await ms.getCurrentMember();
    var memberId = result && result.data && result.data.id;
    if (!memberId) {
      window.location.href = '/login';
      return;
    }

    state.memberstackId = memberId;
    console.log('👤 Memberstack ID:', memberId);

    // ── Supabase-User + Analysen PARALLEL laden ────────────
    console.log('📡 Lade User + Analysen parallel...');

    var [userRes, analysesRes] = await Promise.all([
      sbFetch('/rest/v1/users?select=*&memberstack_id=eq.' + memberId),
      sbFetch(
        '/rest/v1/analyses?select=*&memberstack_id=eq.' + memberId +
        '&order=created_at.desc&limit=200'
      )
    ]);

    var [users, analyses] = await Promise.all([
      userRes.json(),
      analysesRes.json()
    ]);

    var user = users && users[0];
    if (!user) {
      console.warn('⚠️ Kein User in Supabase gefunden');
      renderError('Benutzerdaten nicht gefunden.');
      return;
    }

    state.supabaseUserId = user.id;
    state.licenseType    = user.license_type || 'Free';
    state.pdfAccess      = !!user.pdf_access_global;
    state.analyses       = Array.isArray(analyses) ? analyses : [];

    console.log('✅ User geladen:', user.email, '| Plan:', state.licenseType, '| PDF-Zugriff global:', state.pdfAccess);

    // UI befüllen
    renderUserInfo(user);
    renderCreditBar(user);
    renderAnalyses();
    setupRealtime(memberId);

    console.log('✅ Dashboard gerendert');
  }

  /* ── User-Info rendern ──────────────────────────────────── */
  function renderUserInfo(user) {
    setText('[data-user-name]',     user.full_name || user.email);
    setText('[data-user-email]',    user.email);
    setText('[data-user-plan]',     state.licenseType);
    setText('[data-user-initials]', getInitials(user.full_name));
  }

  /* ── Credit-Balken ──────────────────────────────────────── */
  function renderCreditBar(user) {
    var used  = user.credits_used_this_month  || 0;
    var limit = user.credits_limit            || 0;
    var pct   = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    setText('[data-credits-used]',  used);
    setText('[data-credits-limit]', limit);
    setText('[data-credits-pct]',   pct + '%');

    var bar = document.querySelector('[data-credits-bar]');
    if (bar) bar.style.width = pct + '%';
  }

  /* ── Analysen-Tabelle rendern ───────────────────────────── */
  function renderAnalyses() {
    var container = document.querySelector('[data-dashboard-container]');
    if (!container) return;

    // Styles einmalig einfügen
    injectStyles();

    state.totalPages = Math.max(1, Math.ceil(state.analyses.length / PAGE_SIZE));
    state.currentPage = Math.min(state.currentPage, state.totalPages);

    var start = (state.currentPage - 1) * PAGE_SIZE;
    var page  = state.analyses.slice(start, start + PAGE_SIZE);

    if (page.length === 0) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7a95;">' +
        'Noch keine Analysen vorhanden. Starte deine erste Analyse!</div>';
      renderPagination();
      return;
    }

    var html = '';
    page.forEach(function (a, i) {
      var score      = a.overall_score != null ? Math.round(a.overall_score) : '–';
      var scoreColor = score >= 70 ? '#4fd1c5' : score >= 40 ? '#f6ad55' : '#fc8181';
      var date       = a.created_at ? new Date(a.created_at).toLocaleDateString('de-DE') : '–';
      var status     = a.status || 'completed';
      var url        = a.url || a.landing_page_url || '–';
      var domain     = url !== '–' ? (url.replace(/^https?:\/\//, '').split('/')[0]) : '–';

      html +=
        '<div class="cvz-row" data-analysis-id="' + a.id + '" style="' +
        'display:flex;align-items:center;gap:12px;padding:14px 16px;' +
        'border-bottom:1px solid #1e2736;cursor:pointer;' +
        'animation:cvzFadeIn .25s ease ' + (i * 0.04) + 's both;">' +

        '<div style="flex:0 0 36px;height:36px;border-radius:50%;background:#1e2736;' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-size:11px;font-weight:700;color:#4fd1c5;">' +
        getInitials(url) + '</div>' +

        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(domain) + '</div>' +
        '<div style="font-size:11px;color:#6b7a95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(url) + '</div>' +
        '</div>' +

        '<div style="flex:0 0 80px;font-size:22px;font-weight:700;color:' + scoreColor + ';text-align:center;">' +
        score + '</div>' +

        '<div style="flex:0 0 90px;font-size:12px;color:#6b7a95;">' + escHtml(date) + '</div>' +

        '<div style="flex:0 0 90px;">' +
        '<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;' +
        'background:' + (status === 'completed' ? 'rgba(79,209,197,.15)' : 'rgba(246,173,85,.15)') + ';' +
        'color:' + (status === 'completed' ? '#4fd1c5' : '#f6ad55') + ';">' +
        escHtml(status) + '</span></div>' +

        (state.pdfAccess ?
          '<div style="flex:0 0 40px;text-align:right;">' +
          '<button class="cvz-pdf-btn" data-id="' + a.id + '" style="' +
          'background:none;border:1px solid #2d3748;border-radius:6px;' +
          'padding:5px 8px;cursor:pointer;color:#6b7a95;font-size:11px;' +
          'transition:all .15s;" title="PDF herunterladen">PDF</button></div>'
          : '') +

        '</div>';
    });

    container.innerHTML = html;

    // Click-Handler für Zeilen
    container.querySelectorAll('.cvz-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('.cvz-pdf-btn')) return;
        var id = row.getAttribute('data-analysis-id');
        if (id) window.location.href = '/analyse/ergebnis?id=' + id;
      });
      row.addEventListener('mouseenter', function () {
        row.style.background = '#131b2a';
      });
      row.addEventListener('mouseleave', function () {
        row.style.background = '';
      });
    });

    // PDF-Buttons
    if (state.pdfAccess) {
      container.querySelectorAll('.cvz-pdf-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          handlePdfDownload(btn.getAttribute('data-id'), btn);
        });
      });
    }

    renderPagination();
  }

  /* ── PDF-Download ───────────────────────────────────────── */
  async function handlePdfDownload(analysisId, btn) {
    if (state.pdfUrlCache[analysisId]) {
      window.open(state.pdfUrlCache[analysisId], '_blank');
      return;
    }
    btn.textContent = '...';
    btn.disabled = true;
    try {
      var res = await fetch(PDF_SERVICE_URL + '/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-secret': PDF_SECRET },
        body: JSON.stringify({ analysis_id: analysisId, supabase_user_id: state.supabaseUserId })
      });
      var data = await res.json();
      if (data.pdf_url) {
        state.pdfUrlCache[analysisId] = data.pdf_url;
        window.open(data.pdf_url, '_blank');
      }
    } catch (err) {
      console.error('❌ PDF-Fehler:', err);
    }
    btn.textContent = 'PDF';
    btn.disabled = false;
  }

  /* ── Pagination ─────────────────────────────────────────── */
  function renderPagination() {
    var el = document.querySelector('[data-pagination]');
    if (!el) return;
    if (state.totalPages <= 1) { el.innerHTML = ''; return; }

    var html = '<div style="display:flex;gap:8px;align-items:center;justify-content:center;padding:16px;">';
    html += '<button data-page="prev" style="' + paginBtnStyle(state.currentPage === 1) + '">‹</button>';

    for (var p = 1; p <= state.totalPages; p++) {
      var active = p === state.currentPage;
      html += '<button data-page="' + p + '" style="' + paginBtnStyle(false, active) + '">' + p + '</button>';
    }

    html += '<button data-page="next" style="' + paginBtnStyle(state.currentPage === state.totalPages) + '">›</button>';
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = btn.getAttribute('data-page');
        if (val === 'prev' && state.currentPage > 1)                   state.currentPage--;
        else if (val === 'next' && state.currentPage < state.totalPages) state.currentPage++;
        else if (!isNaN(parseInt(val, 10)))                              state.currentPage = parseInt(val, 10);
        renderAnalyses();
      });
    });
  }

  function paginBtnStyle(disabled, active) {
    return 'background:' + (active ? '#4fd1c5' : '#1e2736') + ';' +
      'color:' + (active ? '#0d1117' : (disabled ? '#3a4560' : '#a0aec0')) + ';' +
      'border:none;border-radius:6px;padding:6px 12px;cursor:' + (disabled ? 'default' : 'pointer') + ';' +
      'font-size:13px;font-weight:' + (active ? '700' : '400') + ';' +
      'pointer-events:' + (disabled ? 'none' : 'auto') + ';transition:background .15s;';
  }

  /* ── Realtime – neue Analysen live einblenden ────────────── */
  function setupRealtime(memberId) {
    if (!window.supabase || state.realtimeChannel) return;
    try {
      state.realtimeChannel = window.supabase
        .createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        .channel('analyses-' + memberId)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'analyses',
          filter: 'memberstack_id=eq.' + memberId
        }, function (payload) {
          console.log('🔄 Realtime Update:', payload.eventType);
          if (payload.eventType === 'INSERT') {
            state.analyses.unshift(payload.new);
          } else if (payload.eventType === 'UPDATE') {
            var idx = state.analyses.findIndex(function (a) { return a.id === payload.new.id; });
            if (idx !== -1) state.analyses[idx] = payload.new;
          } else if (payload.eventType === 'DELETE') {
            state.analyses = state.analyses.filter(function (a) { return a.id !== payload.old.id; });
          }
          state.totalPages = Math.max(1, Math.ceil(state.analyses.length / PAGE_SIZE));
          renderAnalyses();
        })
        .subscribe();
    } catch (e) {
      console.warn('⚠️ Realtime nicht verfügbar:', e.message);
    }
  }

  /* ── Fehler-Anzeige ─────────────────────────────────────── */
  function renderError(msg) {
    var container = document.querySelector('[data-dashboard-container]');
    if (container) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:#fc8181;">' +
        '⚠️ ' + escHtml(msg) + '</div>';
    }
  }

  /* ── Sticky Header ──────────────────────────────────────── */
  function fixStickyHeader() {
    var header = document.querySelector('.analysis-row-header');
    if (!header) return;
    var nav = document.querySelector('nav, .navbar, .w-nav');
    var navH = nav ? nav.offsetHeight : 60;
    var parent = header.parentElement;
    while (parent && parent !== document.body) {
      var s = window.getComputedStyle(parent);
      var ov = s.overflow + ' ' + s.overflowX + ' ' + s.overflowY;
      if (/auto|scroll|hidden/.test(ov)) {
        parent.style.overflow = 'visible';
        parent.style.overflowY = 'visible';
        parent.style.maxHeight = 'none';
      }
      parent = parent.parentElement;
    }
    header.style.cssText = 'position:sticky;top:' + navH + 'px;z-index:100;background-color:#0d1117;';
  }

  /* ── CSS einmalig injizieren ────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('cvz-dash-styles')) return;
    var style = document.createElement('style');
    style.id = 'cvz-dash-styles';
    style.textContent = '@keyframes cvzFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(style);
  }

  /* ── Utils ──────────────────────────────────────────────── */
  function setText(selector, val) {
    document.querySelectorAll(selector).forEach(function (el) { el.textContent = val != null ? val : ''; });
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function getInitials(str) {
    if (!str) return '';
    var clean = str.replace(/^https?:\/\//, '').split('/')[0].split('.')[0];
    return clean.substring(0, 2).toUpperCase();
  }

  /* ── Start ───────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      fixStickyHeader();
      init();
    });
  } else {
    fixStickyHeader();
    init();
  }

})();
