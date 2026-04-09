<!-- Convertlyze Settings Widget – Dark Theme (#0d1117 / #252d3d / #4fd1c5) -->

<style>
  #cvly-settings {
    --c-bg:        #0d1117;
    --c-surface:   #161b27;
    --c-card:      #1a2133;
    --c-border:    #2a3550;
    --c-text:      #e8edf5;
    --c-muted:     #7a8ba8;
    --c-teal:      #4fd1c5;
    --c-teal-dk:   #38b2a8;
    --c-green:     #4fd1c5;
    --c-green-dk:  #38b2a8;
    --c-red:       #f87171;
    --c-red-bg:    #1f1215;
    --c-red-bdr:   #4a1f1f;
    --c-orange:    #fbbf24;
    --c-orange-bg: #1f1a0e;
    --c-orange-bdr:#4a3a10;
    --radius:      14px;
    --radius-sm:   10px;
    font-family: inherit;
    color: var(--c-text);
  }
  #cvly-settings .cvly-card {
    background: var(--c-card);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: 28px 32px;
    margin-bottom: 16px;
  }
  @media (max-width: 480px) { #cvly-settings .cvly-card { padding: 20px 16px; } }
  #cvly-settings .cvly-card-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px; flex-wrap: wrap; gap: 10px;
  }
  #cvly-settings .cvly-card-title { font-size: 16px; font-weight: 700; color: var(--c-text); margin: 0; }
  #cvly-settings .cvly-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: 600;
  }
  #cvly-settings .cvly-badge-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  #cvly-settings .cvly-badge.active    { background: rgba(79,209,197,0.12); color: #4fd1c5; border: 1px solid rgba(79,209,197,0.25); }
  #cvly-settings .cvly-badge.active .cvly-badge-dot { background: #4fd1c5; }
  #cvly-settings .cvly-badge.canceling { background: var(--c-red-bg); color: #f87171; border: 1px solid var(--c-red-bdr); }
  #cvly-settings .cvly-badge.canceling .cvly-badge-dot { background: var(--c-red); }
  #cvly-settings .cvly-badge.pending   { background: var(--c-orange-bg); color: #fbbf24; border: 1px solid var(--c-orange-bdr); }
  #cvly-settings .cvly-badge.pending .cvly-badge-dot { background: var(--c-orange); }
  #cvly-settings .cvly-badge.free      { background: rgba(42,53,80,0.6); color: var(--c-muted); border: 1px solid var(--c-border); }
  #cvly-settings .cvly-badge.free .cvly-badge-dot { background: var(--c-muted); }
  #cvly-settings .cvly-plan-row { display: flex; align-items: flex-start; gap: 16px; }
  #cvly-settings .cvly-plan-icon {
    width: 48px; height: 48px; border-radius: 12px;
    background: rgba(79,209,197,0.1); border: 1px solid rgba(79,209,197,0.2);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  #cvly-settings .cvly-plan-icon svg { width: 22px; height: 22px; }
  #cvly-settings .cvly-plan-name { font-size: 20px; font-weight: 700; margin: 0 0 4px; color: var(--c-text); }
  #cvly-settings .cvly-plan-meta { font-size: 13px; color: var(--c-muted); margin: 0; line-height: 1.6; }
  #cvly-settings .cvly-credits-row {
    margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--c-border);
    display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
  }
  #cvly-settings .cvly-credits-label { font-size: 13px; color: var(--c-muted); margin-bottom: 6px; }
  #cvly-settings .cvly-credits-count { font-size: 22px; font-weight: 700; color: var(--c-text); }
  #cvly-settings .cvly-credits-count span { font-size: 14px; font-weight: 400; color: var(--c-muted); }
  #cvly-settings .cvly-progress-wrap { flex: 1; min-width: 160px; }
  #cvly-settings .cvly-progress-track { height: 6px; background: rgba(42,53,80,0.8); border-radius: 99px; overflow: hidden; }
  #cvly-settings .cvly-progress-bar { height: 100%; border-radius: 99px; background: var(--c-teal); transition: width 0.5s ease; }
  #cvly-settings .cvly-progress-bar.warn { background: var(--c-orange); }
  #cvly-settings .cvly-progress-bar.crit { background: var(--c-red); }
  #cvly-settings .cvly-reset-date { font-size: 12px; color: var(--c-muted); margin-top: 5px; }
  #cvly-settings .cvly-notice {
    border-radius: var(--radius-sm); padding: 12px 16px; font-size: 14px;
    display: flex; align-items: flex-start; gap: 10px; line-height: 1.6; margin-bottom: 0;
  }
  #cvly-settings .cvly-notice svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px; }
  #cvly-settings .cvly-notice.warn   { background: var(--c-orange-bg); border: 1px solid var(--c-orange-bdr); color: #fbbf24; }
  #cvly-settings .cvly-notice.danger { background: var(--c-red-bg);    border: 1px solid var(--c-red-bdr);   color: #f87171; }
  #cvly-settings .cvly-notice.info   { background: rgba(79,209,197,0.06); border: 1px solid rgba(79,209,197,0.2); color: #4fd1c5; }
  #cvly-settings .cvly-action-row {
    margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--c-border);
    display: flex; gap: 12px; flex-wrap: wrap;
  }
  #cvly-settings .cvly-action-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 18px; border-radius: var(--radius-sm);
    font-size: 14px; font-weight: 500; cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    border: 1px solid var(--c-border); background: #252d3d; color: var(--c-text);
  }
  #cvly-settings .cvly-action-btn:hover { background: #2e3850; border-color: #3a4a6a; }
  #cvly-settings .cvly-action-btn svg { width: 16px; height: 16px; flex-shrink: 0; }
  #cvly-settings .cvly-action-btn.primary { background: var(--c-teal); border-color: var(--c-teal); color: #0d1117; font-weight: 600; }
  #cvly-settings .cvly-action-btn.primary:hover { background: var(--c-teal-dk); border-color: var(--c-teal-dk); }
  #cvly-settings .cvly-action-btn.upgrade { background: rgba(79,209,197,0.12); border-color: rgba(79,209,197,0.3); color: #4fd1c5; }
  #cvly-settings .cvly-action-btn.upgrade:hover { background: rgba(79,209,197,0.2); border-color: rgba(79,209,197,0.5); }
  #cvly-settings .cvly-cancel-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px;
    border-radius: var(--radius-sm); border: 1px solid var(--c-red-bdr);
    background: transparent; color: var(--c-red); font-size: 14px; font-weight: 500;
    cursor: pointer; transition: background 0.15s;
  }
  #cvly-settings .cvly-cancel-btn:hover { background: var(--c-red-bg); }
  #cvly-settings .cvly-cancel-btn svg { width: 15px; height: 15px; }

  /* Modal */
  #cvly-modal-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.7); z-index: 9999;
    align-items: center; justify-content: center;
  }
  #cvly-modal-overlay.active { display: flex; }
  #cvly-modal-box {
    background: #1a2133; border: 1px solid #2a3550;
    border-radius: 20px; padding: 36px;
    max-width: 480px; width: 92%;
    box-shadow: 0 24px 60px rgba(0,0,0,0.5); font-family: inherit;
  }
  #cvly-modal-box .m-icon { width: 52px; height: 52px; border-radius: 13px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }
  #cvly-modal-box .m-icon svg { width: 24px; height: 24px; }
  #cvly-modal-box h3 { font-size: 20px; font-weight: 700; color: #e8edf5; margin: 0 0 8px; }
  #cvly-modal-box p  { font-size: 14px; color: #7a8ba8; line-height: 1.7; margin: 0 0 12px; }
  #cvly-modal-box .m-notice { border-radius: 10px; padding: 12px 14px; font-size: 13px; margin-bottom: 24px; display: flex; align-items: flex-start; gap: 8px; line-height: 1.6; }
  #cvly-modal-box .m-notice svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; }
  #cvly-modal-box .m-notice.red { background: #1f1215; border: 1px solid #4a1f1f; color: #f87171; }
  #cvly-modal-box .m-buttons { display: flex; gap: 10px; }
  #cvly-modal-box .m-cancel { flex: 1; padding: 12px; border-radius: 10px; border: 1px solid #2a3550; background: #252d3d; color: #e8edf5; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
  #cvly-modal-box .m-cancel:hover { background: #2e3850; }
  #cvly-modal-box .m-confirm { flex: 2; padding: 12px; border-radius: 10px; border: none; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
  #cvly-modal-box .m-confirm.red  { background: #dc2626; }
  #cvly-modal-box .m-confirm.red:hover  { background: #b91c1c; }
  #cvly-modal-box .m-confirm      { background: #4fd1c5; color: #0d1117; }
  #cvly-modal-box .m-confirm:hover { background: #38b2a8; }

  /* Skeleton */
  @keyframes cvly-shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }
  #cvly-settings .skeleton { background: linear-gradient(90deg, #1a2133 25%, #252d3d 50%, #1a2133 75%); background-size: 600px 100%; animation: cvly-shimmer 1.4s infinite; border-radius: 6px; }
  #cvly-settings .sk-line { height: 16px; margin-bottom: 8px; }
  #cvly-settings .sk-line.lg { height: 24px; }
  #cvly-settings .sk-line.sm { height: 12px; }
</style>

<!-- Modal -->
<div id="cvly-modal-overlay">
  <div id="cvly-modal-box">
    <div class="m-icon" id="m-icon"></div>
    <h3 id="m-title"></h3>
    <p id="m-text"></p>
    <div class="m-notice" id="m-notice">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span id="m-notice-text"></span>
    </div>
    <div class="m-buttons">
      <button class="m-cancel" id="m-cancel">Abbrechen</button>
      <button class="m-confirm" id="m-confirm"></button>
    </div>
  </div>
</div>

<!-- Widget -->
<div id="cvly-settings">
  <div id="cvly-skeleton">
    <div class="cvly-card">
      <div class="skeleton sk-line lg" style="width:40%;margin-bottom:20px"></div>
      <div class="skeleton sk-line" style="width:60%"></div>
      <div class="skeleton sk-line sm" style="width:45%"></div>
    </div>
  </div>
  <div id="cvly-content" style="display:none">
    <div class="cvly-card">
      <div class="cvly-card-header">
        <p class="cvly-card-title">Aktueller Plan</p>
        <span class="cvly-badge" id="cvly-status-badge">
          <span class="cvly-badge-dot"></span>
          <span id="cvly-status-text">Aktiv</span>
        </span>
      </div>
      <div class="cvly-plan-row">
        <div class="cvly-plan-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#4fd1c5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <p class="cvly-plan-name" id="cvly-plan-name">—</p>
          <p class="cvly-plan-meta" id="cvly-plan-meta">—</p>
        </div>
      </div>
      <div class="cvly-credits-row" id="cvly-credits-row" style="display:none">
        <div>
          <p class="cvly-credits-label">Analysen diesen Monat</p>
          <p class="cvly-credits-count">
            <span id="cvly-credits-used">0</span>
            <span> / <span id="cvly-credits-limit">0</span> genutzt</span>
          </p>
        </div>
        <div class="cvly-progress-wrap">
          <div class="cvly-progress-track">
            <div class="cvly-progress-bar" id="cvly-progress-bar" style="width:0%"></div>
          </div>
          <p class="cvly-reset-date" id="cvly-reset-date"></p>
        </div>
      </div>
      <div id="cvly-plan-notice" style="margin-top:16px;display:none"></div>
      <div class="cvly-action-row" id="cvly-action-row">
        <button class="cvly-action-btn primary" id="cvly-portal-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          Rechnungen
        </button>
        <button class="cvly-action-btn" id="cvly-team-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Team verwalten
        </button>
      </div>
    </div>
    <div class="cvly-card" id="cvly-cancel-card">
      <div class="cvly-card-header"><p class="cvly-card-title">Abonnement kündigen</p></div>
      <p style="font-size:14px;color:#7a8ba8;margin:0 0 16px;line-height:1.6">
        Dein Plan bleibt bis zum Ende des aktuellen Abrechnungszeitraums aktiv. Danach wechselst du automatisch in den kostenlosen Plan.
      </p>
      <button class="cvly-cancel-btn" id="cvly-cancel-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        Abonnement kündigen
      </button>
    </div>
  </div>
</div>

<script>
(function () {
  var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';
  var CANCEL_ENDPOINT   = SUPABASE_URL + '/functions/v1/stripe-cancel-subscription';
  var PORTAL_ENDPOINT   = SUPABASE_URL + '/functions/v1/stripe-portal';
  var TEAM_PLANS        = ['Starter', 'Pro', 'Professional', 'Enterprise'];

  var state = {
    memberId: null, stripeCustomerId: null,
    currentPriceId: null, licenseType: null,
    licenseStatus: null, licenseExpiresAt: null,
    creditsUsed: 0, reservedCredits: 0, creditsLimit: 0,
    nextResetDate: null, billingCycle: null,
    isTeamMember: false, ppuCredits: 0,
  };

  function qs(id) { return document.getElementById(id); }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function showToast(msg, type) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a2133;color:#e8edf5;padding:12px 20px;border-radius:10px;font-size:14px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:420px;text-align:center;line-height:1.5;border:1px solid ' + (type === 'error' ? '#4a1f1f' : 'rgba(79,209,197,0.3)') + ';border-left:3px solid ' + (type === 'error' ? '#f87171' : '#4fd1c5');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4500);
  }

  function showModal(cfg, onConfirm) {
    var overlay = qs('cvly-modal-overlay');
    qs('m-icon').style.background   = cfg.iconBg;
    qs('m-icon').innerHTML          = cfg.iconSvg;
    qs('m-title').textContent       = cfg.title;
    qs('m-text').textContent        = cfg.text;
    qs('m-notice-text').textContent = cfg.noticeText;
    qs('m-notice').className        = 'm-notice ' + cfg.noticeColor;
    qs('m-confirm').textContent     = cfg.confirmLabel;
    qs('m-confirm').className       = 'm-confirm ' + cfg.confirmColor;
    overlay.classList.add('active');
    function close() {
      overlay.classList.remove('active');
      qs('m-confirm').removeEventListener('click', handleConfirm);
      qs('m-cancel').removeEventListener('click', close);
      overlay.removeEventListener('click', handleOverlay);
    }
    function handleConfirm() { close(); onConfirm(); }
    function handleOverlay(e) { if (e.target === overlay) close(); }
    qs('m-confirm').addEventListener('click', handleConfirm);
    qs('m-cancel').addEventListener('click', close);
    overlay.addEventListener('click', handleOverlay);
  }

  function render() {
    var badge    = qs('cvly-status-badge');
    var bKey = state.licenseStatus === 'canceling' ? 'canceling'
             : state.licenseType === 'Free' ? 'free' : 'active';
    var badgeMap = { active: ['active','Aktiv'], canceling: ['canceling','Läuft aus'], free: ['free','Kostenlos'] };
    badge.className = 'cvly-badge ' + badgeMap[bKey][0];
    qs('cvly-status-text').textContent = badgeMap[bKey][1];

    var cycle = state.billingCycle === 'yearly' ? 'Jährlich' : 'Monatlich';
    var planName = state.licenseType || 'Free';
    if (state.isTeamMember) planName += ' (Team)';
    qs('cvly-plan-name').textContent = planName;
    qs('cvly-plan-meta').textContent = state.currentPriceId
      ? cycle + ' · ' + (state.licenseType || '') + ' Plan'
      : 'Kein bezahlter Plan aktiv';

    if (state.creditsLimit > 0) {
      qs('cvly-credits-row').style.display = '';
      var usedDisplay = state.creditsUsed +
        (state.reservedCredits > 0 ? ' (+' + state.reservedCredits + ' in Bearbeitung)' : '');
      qs('cvly-credits-used').textContent  = usedDisplay;
      qs('cvly-credits-limit').textContent = state.creditsLimit;
      var pct = Math.min(100, Math.round(((state.creditsUsed + state.reservedCredits) / state.creditsLimit) * 100));
      var bar = qs('cvly-progress-bar');
      bar.style.width = pct + '%';
      bar.className   = 'cvly-progress-bar' + (pct >= 90 ? ' crit' : pct >= 70 ? ' warn' : '');
      qs('cvly-reset-date').textContent = state.nextResetDate ? 'Reset am ' + formatDate(state.nextResetDate) : '';
    }

    var noticeEl = qs('cvly-plan-notice');
    noticeEl.style.display = 'none'; noticeEl.innerHTML = '';
    var infoSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    if (state.licenseStatus === 'canceling') {
      noticeEl.style.display = '';
      noticeEl.innerHTML = '<div class="cvly-notice danger">' + infoSvg +
        '<span>Dein Abonnement läuft am ' + (state.licenseExpiresAt ? formatDate(state.licenseExpiresAt) : '—') +
        ' aus. Danach kannst du einen neuen Plan wählen.</span></div>';
    }

    var cancelCard = qs('cvly-cancel-card');
    if (!state.currentPriceId || state.licenseStatus === 'canceling' || state.isTeamMember) {
      cancelCard.style.display = 'none';
    } else {
      cancelCard.style.display = '';
    }

    var portalBtn = qs('cvly-portal-btn');
    var teamBtn   = qs('cvly-team-btn');

    if (state.isTeamMember) {
      portalBtn.style.display = 'none';
      teamBtn.style.display   = 'none';

      var actionRow = qs('cvly-action-row');
      var existingPpuRow = document.getElementById('cvly-ppu-member-row');
      if (existingPpuRow) existingPpuRow.remove();

      var ppuRow = document.createElement('div');
      ppuRow.id = 'cvly-ppu-member-row';
      ppuRow.style.cssText = 'width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';
      ppuRow.innerHTML =
        '<div>' +
          '<p style="font-size:13px;color:#7a8ba8;margin:0 0 4px">Eigene Pay-per-Use Analysen</p>' +
          '<p style="font-size:20px;font-weight:700;margin:0;color:#e8edf5">' + state.ppuCredits +
            '<span style="font-size:14px;font-weight:400;color:#7a8ba8"> verfügbar</span></p>' +
        '</div>' +
        '<button id="cvly-ppu-buy-btn" class="cvly-action-btn upgrade" style="flex-shrink:0">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px">' +
          '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' +
          ' Analyse kaufen' +
        '</button>';
      actionRow.appendChild(ppuRow);

      document.getElementById('cvly-ppu-buy-btn').addEventListener('click', function() {
        if (window.$memberstackDom) {
          window.$memberstackDom.purchasePlansWithCheckout({
            priceId: 'prc_pay-per-use-14750y0n'
          }).catch(function(err) { console.error('PPU checkout error:', err); });
        }
      });
    } else {
      portalBtn.style.display = '';

      var hasTeam = TEAM_PLANS.indexOf(state.licenseType) !== -1;
      if (hasTeam) {
        teamBtn.style.display = '';
        teamBtn.className = 'cvly-action-btn';
        teamBtn.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
          '<path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
          ' Team verwalten';
        teamBtn.onclick = function() { if (window.openTeamModal) window.openTeamModal(); };
      } else {
        // Kein Team-Plan → "Plan upgraden" Button zeigen
        teamBtn.style.display = '';
        teamBtn.className = 'cvly-action-btn upgrade';
        teamBtn.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px">' +
          '<polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>' +
          'Plan upgraden';
        teamBtn.onclick = function() { window.location.href = '/preise'; };
      }
    }
  }

  function handleCancelClick() {
    showModal({
      iconBg: '#1f1215',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      title: 'Abonnement wirklich kündigen?',
      text: 'Du kannst Convertlyze bis zum Ende des aktuellen Abrechnungszeitraums weiter nutzen.',
      noticeText: 'Diese Aktion kann nicht rückgängig gemacht werden.',
      noticeColor: 'red', confirmLabel: 'Ja, kündigen', confirmColor: 'red',
    }, function () {
      var btn = qs('cvly-cancel-btn');
      btn.textContent = 'Wird bearbeitet…'; btn.disabled = true;
      fetch(CANCEL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ memberstack_id: state.memberId })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.success) {
          state.licenseStatus    = 'canceling';
          state.licenseExpiresAt = data.cancelAt ? new Date(data.cancelAt * 1000).toISOString() : null;
          render();
          showToast('Kündigung eingeleitet. Dein Plan bleibt bis ' + data.cancelAtFormatted + ' aktiv.', 'success');
        } else {
          btn.textContent = 'Abonnement kündigen'; btn.disabled = false;
          showToast((data && data.error) || 'Fehler', 'error');
        }
      })
      .catch(function () {
        btn.textContent = 'Abonnement kündigen'; btn.disabled = false;
        showToast('Verbindungsfehler.', 'error');
      });
    });
  }

  function handlePortalClick() {
    var btn = qs('cvly-portal-btn');
    btn.textContent = 'Wird geladen…';
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';

    function resetBtn() {
      btn.textContent = 'Rechnungen';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }

    fetch(PORTAL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ memberstackId: state.memberId })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.url) {
        window.location.href = data.url;
        return;
      }

      resetBtn();

      // Fehler-Modals je nach Fehlertyp
      if (data && data.error === 'no_customer') {
        showModal({
          iconBg: 'rgba(79,209,197,0.1)',
          iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="#4fd1c5" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
          title: 'Noch keine Rechnungen',
          text: 'Für deinen aktuellen Plan sind keine Rechnungen vorhanden. Rechnungen werden nach dem Kauf eines bezahlten Plans hier angezeigt.',
          noticeText: 'Rechnungen stehen nur für bezahlte Pläne zur Verfügung.',
          noticeColor: 'red',
          confirmLabel: 'Pläne ansehen',
          confirmColor: '',
        }, function () {
          window.location.href = '/preise';
        });
      } else if (data && data.error === 'no_permission') {
        showModal({
          iconBg: '#1f1215',
          iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
          title: 'Keine Berechtigung',
          text: 'Als Team-Mitglied kannst du das Abrechnungsportal nicht öffnen. Bitte wende dich an den Team-Owner.',
          noticeText: 'Nur der Team-Owner hat Zugriff auf Rechnungen und Abonnements.',
          noticeColor: 'red',
          confirmLabel: 'Verstanden',
          confirmColor: '',
        }, function () {});
      } else {
        showModal({
          iconBg: '#1f1215',
          iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
          title: 'Fehler beim Öffnen',
          text: 'Das Abrechnungsportal konnte nicht geöffnet werden. Bitte versuche es erneut oder kontaktiere den Support.',
          noticeText: 'Falls der Fehler weiterhin auftritt, schreib uns an hallo@convertlyze.com.',
          noticeColor: 'red',
          confirmLabel: 'Schließen',
          confirmColor: '',
        }, function () {});
      }
    })
    .catch(function () {
      resetBtn();
      showModal({
        iconBg: '#1f1215',
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        title: 'Verbindungsfehler',
        text: 'Es konnte keine Verbindung zum Server hergestellt werden. Bitte prüfe deine Internetverbindung.',
        noticeText: 'Falls der Fehler weiterhin auftritt, schreib uns an hallo@convertlyze.com.',
        noticeColor: 'red',
        confirmLabel: 'Schließen',
        confirmColor: '',
      }, function () {});
    });
  }

  function init() {
    if (!window.$memberstackDom || !window.supabase) return;
    window.$memberstackDom.getCurrentMember().then(function (result) {
      var member = result && result.data;
      if (!member || !member.id) return;
      state.memberId         = member.id;
      state.stripeCustomerId = member.stripeCustomerId || null;

      window.supabase
        .from('users')
        .select('license_type, license_status, license_expires_at, current_price_id, credits_used_current_period, reserved_credits, credits_limit, next_credit_reset_date, billing_cycle, stripe_customer_id, owner_user_id, ppu_credits')
        .eq('memberstack_id', member.id)
        .single()
        .then(function (res) {
          if (!res.data) {
            qs('cvly-skeleton').innerHTML = '<div class="cvly-card"><p style="color:#f87171;font-size:14px">Fehler beim Laden. Bitte Seite neu laden.</p></div>';
            return;
          }

          var userData     = res.data;
          state.isTeamMember = !!userData.owner_user_id;

          if (res.data.stripe_customer_id) state.stripeCustomerId = res.data.stripe_customer_id;

          if (state.isTeamMember) {
            state.ppuCredits = parseFloat(userData.ppu_credits) || 0;
            window.supabase
              .from('users')
              .select('license_type, license_status, license_expires_at, current_price_id, credits_used_current_period, reserved_credits, credits_limit, next_credit_reset_date, billing_cycle, stripe_customer_id')
              .eq('id', userData.owner_user_id)
              .single()
              .then(function (ownerRes) {
                var ownerData = ownerRes.data || userData;
                state.licenseType      = ownerData.license_type;
                state.licenseStatus    = ownerData.license_status;
                state.licenseExpiresAt = ownerData.license_expires_at;
                state.currentPriceId   = ownerData.current_price_id;
                state.creditsUsed      = parseFloat(ownerData.credits_used_current_period) || 0;
                state.reservedCredits  = parseFloat(ownerData.reserved_credits) || 0;
                state.creditsLimit     = parseFloat(ownerData.credits_limit) || 0;
                state.nextResetDate    = ownerData.next_credit_reset_date;
                state.billingCycle     = ownerData.billing_cycle;

                qs('cvly-skeleton').style.display = 'none';
                qs('cvly-content').style.display  = '';
                qs('cvly-portal-btn').addEventListener('click', handlePortalClick);
                qs('cvly-cancel-btn').addEventListener('click', handleCancelClick);
                render();
              });
          } else {
            state.licenseType      = userData.license_type;
            state.licenseStatus    = userData.license_status;
            state.licenseExpiresAt = userData.license_expires_at;
            state.currentPriceId   = userData.current_price_id;
            state.creditsUsed      = parseFloat(userData.credits_used_current_period) || 0;
            state.reservedCredits  = parseFloat(userData.reserved_credits) || 0;
            state.creditsLimit     = parseFloat(userData.credits_limit) || 0;
            state.nextResetDate    = userData.next_credit_reset_date;
            state.billingCycle     = userData.billing_cycle;
            state.ppuCredits       = parseFloat(userData.ppu_credits) || 0;

            qs('cvly-skeleton').style.display = 'none';
            qs('cvly-content').style.display  = '';
            qs('cvly-portal-btn').addEventListener('click', handlePortalClick);
            qs('cvly-cancel-btn').addEventListener('click', handleCancelClick);
            render();
          }
        })
        .catch(function () {
          qs('cvly-skeleton').innerHTML = '<div class="cvly-card"><p style="color:#f87171;font-size:14px">Fehler beim Laden. Bitte Seite neu laden.</p></div>';
        });
    }).catch(function () {});
  }

  var attempts = 0;
  function tryInit() {
    attempts++;
    var supabaseReady    = window.supabase && typeof window.supabase.from === 'function';
    var memberstackReady = window.$memberstackDom && typeof window.$memberstackDom.getCurrentMember === 'function';
    if (supabaseReady && memberstackReady) { init(); }
    else if (attempts < 20) { setTimeout(tryInit, 500); }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', tryInit); }
  else { tryInit(); }

  window.addEventListener('pageshow', function () {
    var btn = qs('cvly-portal-btn');
    if (btn) { btn.textContent = 'Rechnungen'; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
  });
})();
</script>
