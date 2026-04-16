// ==================== DASHBOARD V5 ====================
(function () {
  var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

  // ── Hilfsfunktionen ─────────────────────────────────────────────────────────
  function db(attr) {
    return document.querySelector('[data-dashboard="' + attr + '"]');
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function supabaseFetch(path) {
    return fetch(SUPABASE_URL + '/rest/v1/' + path, {
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      }
    }).then(function (r) { return r.json(); });
  }

  // ── Stat-Karten befüllen ────────────────────────────────────────────────────
  function renderStats(user) {
    var creditsUsed  = parseFloat(user.credits_used_current_period) || 0;
    var reserved     = parseFloat(user.reserved_credits) || 0;
    var creditsLimit = parseFloat(user.credits_limit) || 0;
    var remaining    = Math.max(0, creditsLimit - creditsUsed - reserved);
    var ppuCredits   = parseFloat(user.ppu_credits) || 0;
    var licenseType  = user.license_type || 'Free';

    // Analysen diesen Monat
    var elUsed = db('credits_used_current_period');
    if (elUsed) elUsed.textContent = creditsUsed;

    // Verbleibende Analysen
    var elRemaining = db('credits-remaining');
    if (elRemaining) elRemaining.textContent = remaining;

    // Aktiver Plan
    var elPlan = db('plan-name');
    if (elPlan) elPlan.textContent = licenseType;

    // Pay-per-Use Analysen
    var elPpu = db('ppu-credits');
    if (elPpu) elPpu.textContent = ppuCredits;

    // Fortschrittsbalken
    var progressBar  = db('progress-bar');
    var progressFill = document.querySelector('.progress-fill');
    if (progressBar && creditsLimit > 0) {
      var pct = Math.min(100, Math.round(((creditsUsed + reserved) / creditsLimit) * 100));
      if (progressFill) {
        progressFill.style.width = pct + '%';
        progressFill.style.background = pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#4fd1c5';
      }
    }
  }

  // ── Analysen-Tabelle befüllen ───────────────────────────────────────────────
  function renderAnalyses(analyses, memberstackId) {
    var tableList = document.querySelector('.table-list');
    if (!tableList) return;

    // Vorhandene Datenzeilen leeren (Template-Zeile behalten)
    var templateRow = tableList.querySelector('.table-row');
    if (!templateRow) return;

    // Alle bisherigen geklonten Zeilen entfernen
    var existingRows = tableList.querySelectorAll('.table-row[data-cloned]');
    existingRows.forEach(function (r) { r.remove(); });

    if (!analyses || analyses.length === 0) {
      templateRow.style.display = 'none';
      return;
    }

    templateRow.style.display = 'none';

    analyses.forEach(function (analysis) {
      var row = templateRow.cloneNode(true);
      row.setAttribute('data-cloned', 'true');
      row.style.display = '';

      // URL
      var urlEl = row.querySelector('.analysis-url');
      if (urlEl) {
        var displayUrl = (analysis.landing_page_url || '—').replace(/^https?:\/\//, '').replace(/\/$/, '');
        urlEl.textContent = displayUrl;
        urlEl.title       = analysis.landing_page_url || '';
      }

      // Keyword
      var kwEl = row.querySelector('.analysis-keyword');
      if (kwEl) kwEl.textContent = analysis.keyword || '—';

      // Status
      var statusEl = row.querySelector('.analysis-status');
      if (statusEl) {
        var status = analysis.status || 'unbekannt';
        var label  = status === 'completed' ? 'Abgeschlossen'
                   : status === 'processing' ? 'In Bearbeitung'
                   : status === 'failed' ? 'Fehlgeschlagen'
                   : status;
        statusEl.textContent = label;
        statusEl.style.background =
          status === 'completed'  ? 'rgba(79,209,197,0.15)' :
          status === 'processing' ? 'rgba(251,191,36,0.15)' :
          status === 'failed'     ? 'rgba(248,113,113,0.15)' :
          'rgba(42,53,80,0.6)';
        statusEl.style.color =
          status === 'completed'  ? '#4fd1c5' :
          status === 'processing' ? '#fbbf24' :
          status === 'failed'     ? '#f87171' : '#7a8ba8';
        statusEl.style.borderRadius = '99px';
        statusEl.style.padding      = '4px 10px';
        statusEl.style.fontSize     = '12px';
        statusEl.style.fontWeight   = '600';
      }

      // Datum
      var dateEl = row.querySelector('.analysis-date');
      if (dateEl) dateEl.textContent = formatDate(analysis.created_at);

      // Ansicht-Link (Analyse öffnen)
      var aktionLink = row.querySelector('.aktion-link');
      if (aktionLink && analysis.id) {
        aktionLink.href = '/member/analyse?id=' + analysis.id;
        aktionLink.style.display = analysis.status === 'completed' ? '' : 'none';
      }

      // KI-Agent Link
      var agentLink = row.querySelector('.agent-link');
      if (agentLink && analysis.id) {
        agentLink.href = '/member/ki-agent?id=' + analysis.id;
        agentLink.style.display = analysis.status === 'completed' ? '' : 'none';
      }

      // PDF Download Link – nur wenn pdf_url existiert
      var downloadLink = row.querySelector('.download-link');
      if (downloadLink) {
        if (analysis.status === 'completed' && analysis.pdf_url) {
          downloadLink.href = analysis.pdf_url;
          downloadLink.target = '_blank';
          downloadLink.style.display = '';
        } else {
          downloadLink.style.display = 'none';
        }
      }

      tableList.appendChild(row);
    });
  }

  // ── User aus Supabase laden mit Retry ──────────────────────────────────────
  async function fetchUserWithSmartRetry(memberstackId, maxAttempts) {
    var attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;
      try {
        var users = await supabaseFetch(
          'users?select=id,email,full_name,license_type,license_status,license_expires_at,' +
          'credits_limit,credits_used_current_period,credits_remaining,reserved_credits,' +
          'chat_messages_limit,chat_messages_used_current_period,period_start_date,' +
          'next_credit_reset_date,plan_price,owner_user_id,team_role,ppu_credits' +
          '&memberstack_id=eq.' + memberstackId
        );
        if (users && users.length > 0) {
          console.log('✅ User aus Supabase geladen');
          return users[0];
        }
        console.warn('⚠️ Versuch ' + attempts + ': User noch nicht in Supabase');
      } catch (e) {
        console.warn('⚠️ Versuch ' + attempts + ' error:', e);
      }
      if (attempts < maxAttempts) {
        await new Promise(function (r) { setTimeout(r, 1500); });
      }
    }
    return null;
  }

  async function fetchUserFast(memberstackId) {
    try {
      var users = await supabaseFetch(
        'users?select=id,email,full_name,license_type,license_status,license_expires_at,' +
        'credits_limit,credits_used_current_period,credits_remaining,reserved_credits,' +
        'chat_messages_limit,chat_messages_used_current_period,period_start_date,' +
        'next_credit_reset_date,plan_price,owner_user_id,team_role,ppu_credits' +
        '&memberstack_id=eq.' + memberstackId
      );
      if (users && users.length > 0) return users[0];
      return null;
    } catch (e) {
      console.warn('⚠️ fetchUserFast error:', e);
      return null;
    }
  }

  // ── Analysen aus Supabase laden ────────────────────────────────────────────
  async function fetchAnalyses(userId) {
    try {
      var analyses = await supabaseFetch(
        'analyses?select=id,landing_page_url,keyword,status,created_at,overall_score,pdf_url,pdf_generated_at' +
        '&user_id=eq.' + userId +
        '&order=created_at.desc' +
        '&limit=20'
      );
      return analyses || [];
    } catch (e) {
      console.warn('⚠️ fetchAnalyses error:', e);
      return [];
    }
  }

  // ── Hauptlogik ──────────────────────────────────────────────────────────────
  async function init() {
    // Auf Memberstack warten
    var attempts = 0;
    while (!window.$memberstackDom && attempts < 50) {
      await new Promise(function (r) { setTimeout(r, 100); });
      attempts++;
    }
    if (!window.$memberstackDom) {
      console.error('❌ Memberstack nicht geladen');
      return;
    }

    var result = await window.$memberstackDom.getCurrentMember();
    var member = result && result.data;
    if (!member || !member.id) {
      console.warn('⚠️ Kein eingeloggter User');
      return;
    }

    var memberstackId = member.id;
    console.log('✅ Member ID:', memberstackId);

    // Schneller Versuch, dann Retry falls User noch nicht in Supabase
    var user = await fetchUserFast(memberstackId);
    if (!user) {
      console.log('📦 User nicht sofort gefunden – starte Retry...');
      user = await fetchUserWithSmartRetry(memberstackId, 5);
    }

    if (!user) {
      console.error('❌ User nach allen Versuchen nicht in Supabase gefunden');
      return;
    }

    console.log('📦 User aus Supabase:', user);

    // Stats rendern
    renderStats(user);

    // Analysen laden und rendern
    var analyses = await fetchAnalyses(user.id);
    renderAnalyses(analyses, memberstackId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
