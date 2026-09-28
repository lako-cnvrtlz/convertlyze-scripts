/**
 * pricing-script.js
 *
 * GEÄNDERT (28.09.2026):
 *  1. Supabase-Abfragen senden jetzt den Header x-memberstack-id. Die RLS-Policy
 *     auf "users" prüft ihn; ohne ihn lieferte jede Abfrage 0 Zeilen. Folge vorher:
 *     Tracker zeigte "Verbindungsfehler", und fetchCurrentPriceId lieferte still
 *     null, wodurch Kunden MIT Abo in einen zweiten Checkout statt ins Portal kamen.
 *  2. fetchCurrentPriceId wirft bei Fehlern, statt still null zurückzugeben.
 *  3. Team-Mitglieder (team_role = 'member') sehen die Tracker-Buttons ausgegraut
 *     mit Tooltip. Topics für das Team kann nur der Owner kaufen.
 *
 * Der automatische Checkout nach Registrierung/Login läuft NICHT hier, sondern
 * ausschließlich im site-weiten "CVZ CHECKOUT RESUME"-Script im Webflow-Site-Footer.
 */
(function () {
  'use strict';
 
  // ── Konfiguration ────────────────────────────────────────────────────────────
  var CONFIG = {
    supabaseUrl:     'https://zpkifipmyeunorhtepzq.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU',
    ppuPriceIds: [
      'prc_pay-per-use-14750y0n',
      'prc_pay-per-use-5-analysen--el1dg0ay4',
      'prc_pay-per-use-10-analysen-131g30jzh',
      'prc_pay-per-use-aufbau-1--ad1fj0jrg',
      'prc_pay-per-use-aufbau-5--mq1hg07on',
      'prc_pay-per-use-aufbau-10--7g1dk0atm',
      'prc_strategie-1--kpn10a65',
      'prc_strategie-5--05mj0j7r',
      'prc_strategie-10--1jn30a61',
    ],
    // Customer Journey Tracker. Eigener Memberstack-Plan, läuft NIE durch das
    // Haupt-Plan-Portal-Routing, siehe handleTrackerClick.
    trackerPriceIds: [
      'prc_conversion-journey-1--gj1oi0uck',
    ],
    priceIds: {
      'starter':      { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
      'pro':          { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
      'enterprise':   { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
      'pay-per-use':  { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      },
      'analyse-5':    { monthly: 'prc_pay-per-use-5-analysen--el1dg0ay4', annual: 'prc_pay-per-use-5-analysen--el1dg0ay4' },
      'analyse-10':   { monthly: 'prc_pay-per-use-10-analysen-131g30jzh', annual: 'prc_pay-per-use-10-analysen-131g30jzh' },
      'aufbau-1':     { monthly: 'prc_pay-per-use-aufbau-1--ad1fj0jrg',   annual: 'prc_pay-per-use-aufbau-1--ad1fj0jrg'   },
      'aufbau-5':     { monthly: 'prc_pay-per-use-aufbau-5--mq1hg07on',   annual: 'prc_pay-per-use-aufbau-5--mq1hg07on'   },
      'aufbau-10':    { monthly: 'prc_pay-per-use-aufbau-10--7g1dk0atm',  annual: 'prc_pay-per-use-aufbau-10--7g1dk0atm'  },
      'strategie-1':  { monthly: 'prc_strategie-1--kpn10a65',  annual: 'prc_strategie-1--kpn10a65'  },
      'strategie-5':  { monthly: 'prc_strategie-5--05mj0j7r',  annual: 'prc_strategie-5--05mj0j7r'  },
      'strategie-10': { monthly: 'prc_strategie-10--1jn30a61', annual: 'prc_strategie-10--1jn30a61' },
      'tracker':      { monthly: 'prc_conversion-journey-1--gj1oi0uck', annual: 'prc_conversion-journey-1--gj1oi0uck' },
    },
  };
 
  // Nach dem Tracker-Checkout landet der Kunde in den Einstellungen,
  // dort gibt es den Portal-Button, um die Anzahl der Topics zu ändern.
  var TRACKER_SUCCESS_PATH = '/member/einstellungen';
 
  // NEU: Selektor und Texte für die Owner-Sperre beim Tracker
  var TRACKER_BTN_SELECTOR = 'a[href*="/register?plan=tracker"]';
  var TRACKER_LOCK_TEXT    = 'Topics für das Team kann nur der Account-Inhaber buchen. Wende dich an deinen Admin.';
 
  // ── Supabase ─────────────────────────────────────────────────────────────────
  // Ein Client je Memberstack-ID. Der Header x-memberstack-id ist Pflicht,
  // weil die RLS-Policy auf "users" ihn prüft.
  var sbClients = {};
  function getSb(memberstackId) {
    var key = memberstackId || '_anon';
    if (!sbClients[key]) {
      sbClients[key] = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
        global: { headers: { 'x-memberstack-id': memberstackId || '' } },
        auth:   { persistSession: false, autoRefreshToken: false, storageKey: 'cvz-pricing-' + key },
      });
    }
    return sbClients[key];
  }
 
  // ── Utilities ────────────────────────────────────────────────────────────────
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
 
  function sleep(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }
 
  function depsReady() {
    return !!window.$memberstackDom && !!(window.supabase && window.supabase.createClient);
  }
 
  // Memberstack braucht nach dem Laden kurz, um die Session wiederherzustellen.
  // Deshalb mehrfach fragen, bevor wir "nicht eingeloggt" annehmen.
  async function getMemberstackIdWithRetry(maxAttempts, intervalMs) {
    for (var i = 0; i < maxAttempts; i++) {
      try {
        var member = await window.$memberstackDom.getCurrentMember();
        if (member && member.data && member.data.id) return member.data.id;
      } catch (e) {}
      await sleep(intervalMs);
    }
    return null;
  }
 
  // ── Data layer ───────────────────────────────────────────────────────────────
  // Wirft bei Fehlern, statt still null zurückzugeben. Sonst würden Kunden
  // mit Abo bei einem Datenbankfehler in einen ZWEITEN Checkout geschickt.
  async function fetchCurrentPriceId(memberstackId) {
    var res = await getSb(memberstackId)
      .from('users')
      .select('current_price_id')
      .eq('memberstack_id', memberstackId)
      .maybeSingle();
    if (res.error) {
      console.error('[CVZ] fetchCurrentPriceId error:', res.error.code, res.error.message);
      throw res.error;
    }
    if (!res.data) {
      console.error('[CVZ] fetchCurrentPriceId: keine users-Zeile für', memberstackId);
      throw new Error('users row not found');
    }
    return res.data.current_price_id || null;
  }
 
  // Rolle und bereits gebuchte Topics. Bei Fehler oder fehlender Zeile null,
  // damit wir im Zweifel NICHT einen zweiten Tracker-Checkout starten.
  async function fetchTrackerContext(memberstackId) {
    var res = await getSb(memberstackId)
      .from('users')
      .select('team_role, ai_visibility_topics_purchased')
      .eq('memberstack_id', memberstackId)
      .maybeSingle();
    if (res.error || !res.data) {
      console.error('[CVZ] fetchTrackerContext error:',
        res.error ? (res.error.code + ' ' + res.error.message) : 'keine users-Zeile für ' + memberstackId);
      return null;
    }
    return {
      teamRole:        res.data.team_role || null,
      topicsPurchased: res.data.ai_visibility_topics_purchased || 0,
    };
  }
 
  async function fetchStripePortalUrl(memberstackId) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/stripe-portal', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        CONFIG.supabaseAnonKey,
        'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey,
      },
      body: JSON.stringify({ memberstackId: memberstackId }),
    });
    var data = await res.json();
    return (data && data.url) || null;
  }
 
  // ── UI: Pricing Toggle ───────────────────────────────────────────────────────
  function initPricingToggle() {
    var switcher = document.querySelector('.switcher');
    var leftBtn  = document.querySelector('.switch .left');
    var rightBtn = document.querySelector('.switch .right');
    var monthly  = document.querySelector('.monthly');
    var annually = document.querySelector('.annually');
    if (!switcher || !monthly || !annually) return;
 
    var switchContainer = document.querySelector('.switch');
    if (switchContainer) {
      switchContainer.style.position = 'relative';
      switchContainer.style.overflow = 'hidden';
    }
 
    switcher.style.position     = 'absolute';
    switcher.style.top          = '2px';
    switcher.style.left         = '2px';
    switcher.style.width        = 'calc(50% - 3px)';
    switcher.style.height       = 'calc(100% - 4px)';
    switcher.style.transition   = 'transform 0.3s ease';
    switcher.style.zIndex       = '1';
    switcher.style.borderRadius = 'inherit';
 
    [leftBtn, rightBtn].forEach(function (b) {
      if (b) { b.style.position = 'relative'; b.style.zIndex = '2'; b.style.cursor = 'pointer'; }
    });
 
    function showMonthly() {
      monthly.style.display  = 'block';
      annually.style.display = 'none';
      if (leftBtn)  leftBtn.classList.add('active');
      if (rightBtn) rightBtn.classList.remove('active');
      switcher.style.transform = 'translateX(0px)';
      switcher.classList.remove('is-annual');
    }
 
    function showAnnually() {
      monthly.style.display  = 'none';
      annually.style.display = 'block';
      if (leftBtn)  leftBtn.classList.remove('active');
      if (rightBtn) rightBtn.classList.add('active');
      var offset = document.querySelector('.switch').offsetWidth - switcher.offsetWidth - 2;
      switcher.style.transform = 'translateX(' + offset + 'px)';
      switcher.classList.add('is-annual');
    }
 
    showMonthly();
 
    if (leftBtn)  leftBtn.addEventListener('click', showMonthly);
    if (rightBtn) rightBtn.addEventListener('click', showAnnually);
    switcher.addEventListener('click', function () {
      switcher.classList.contains('is-annual') ? showMonthly() : showAnnually();
    });
  }
 
  // ── UI: Modal ────────────────────────────────────────────────────────────────
  var Modal = (function () {
    var overlay, box;
 
    function build() {
      if (document.getElementById('cvz-modal')) return;
 
      overlay = document.createElement('div');
      overlay.id = 'cvz-modal';
      overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
 
      box = document.createElement('div');
      box.style.cssText = 'background:#0d1117;border:1px solid #2d3748;border-radius:12px;padding:32px;max-width:420px;width:90%;text-align:center;font-family:Geist,sans-serif';
 
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }
 
    function show(cfg) {
      if (!overlay || !box) return;
      box.innerHTML = '';
 
      var h = document.createElement('h3');
      h.textContent = cfg.title || '';
      h.style.cssText = 'color:#e8edf5;font-size:18px;font-weight:600;margin:0 0 12px';
 
      var p = document.createElement('p');
      p.textContent = cfg.text || '';
      p.style.cssText = 'color:#8b98a5;font-size:14px;line-height:1.6;margin:0 0 24px';
 
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;justify-content:center';
 
      var closeBtn = document.createElement('button');
      closeBtn.textContent = 'Schließen';
      closeBtn.style.cssText = 'background:#252d3d;color:#e8edf5;border:1px solid #2a3550;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:500;cursor:pointer';
      closeBtn.onclick = close;
      row.appendChild(closeBtn);
 
      if (cfg.confirmLabel && cfg.onConfirm) {
        var confirmBtn = document.createElement('button');
        confirmBtn.textContent = cfg.confirmLabel;
        confirmBtn.style.cssText = 'background:#4fd1c5;color:#0d1117;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer';
        confirmBtn.onclick = function () { close(); cfg.onConfirm(); };
        row.appendChild(confirmBtn);
      }
 
      box.append(h, p, row);
      overlay.style.display = 'flex';
    }
 
    function close() {
      if (overlay) overlay.style.display = 'none';
    }
 
    function showMemberError() {
      show({
        title: 'Keine Berechtigung',
        text:  'Plan-Änderungen können nur vom Account-Inhaber vorgenommen werden. Wende dich an deinen Administrator.',
      });
    }
 
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', build);
    } else {
      build();
    }
 
    return { show: show, close: close, showMemberError: showMemberError };
  })();
 
  // Für externe Scripts zugänglich machen (toast.js etc.)
  window.cvzShowModal       = Modal.show;
  window.cvzCloseModal      = Modal.close;
  window.cvzShowMemberModal = Modal.showMemberError;
 
  // ── UI: Tooltip für gesperrte Buttons (NEU) ──────────────────────────────────
  // Eigenes Element im <body> statt CSS ::after am Button, damit der Tooltip
  // nicht von Karten mit overflow:hidden abgeschnitten wird.
  var Tooltip = (function () {
    var el = null;
    var hideTimer = null;
 
    function ensure() {
      if (el) return el;
      el = document.createElement('div');
      el.id = 'cvz-tooltip';
      el.setAttribute('role', 'tooltip');
      el.style.cssText = [
        'position:fixed', 'z-index:10000', 'max-width:260px', 'padding:10px 12px',
        'background:#0d1117', 'color:#e8edf5', 'border:1px solid #2d3748', 'border-radius:8px',
        'font-family:Geist,sans-serif', 'font-size:13px', 'line-height:1.5', 'text-align:left',
        'box-shadow:0 8px 24px rgba(0,0,0,0.4)', 'pointer-events:none',
        'opacity:0', 'transition:opacity 0.15s ease', 'display:none',
      ].join(';');
      document.body.appendChild(el);
      return el;
    }
 
    function show(target, text, autoHideMs) {
      var t = ensure();
      clearTimeout(hideTimer);
      t.textContent = text;
      t.style.display = 'block';
 
      // Über dem Button zentriert, bei Platzmangel darunter; nie aus dem Viewport
      var r   = target.getBoundingClientRect();
      var tw  = t.offsetWidth;
      var th  = t.offsetHeight;
      var gap = 8;
      var left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
      var top  = r.top - th - gap;
      if (top < 8) top = r.bottom + gap;
      t.style.left = left + 'px';
      t.style.top  = top + 'px';
      t.style.opacity = '1';
 
      if (autoHideMs) hideTimer = setTimeout(hide, autoHideMs);
    }
 
    function hide() {
      if (!el) return;
      el.style.opacity = '0';
      el.style.display = 'none';
    }
 
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
 
    return { show: show, hide: hide };
  })();
 
  // ── UI: Plan Buttons ─────────────────────────────────────────────────────────
  function setBtnLoading(btn) {
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent          = 'Wird geladen…';
    btn.style.opacity        = '0.6';
    btn.style.pointerEvents  = 'none';
  }
 
  function resetBtn(btn) {
    btn.textContent         = btn.dataset.originalText || 'Plan wählen';
    btn.style.opacity       = '1';
    btn.style.pointerEvents = 'auto';
  }
 
  // NEU: Tracker-Buttons für Team-Mitglieder sperren. Der Button bleibt
  // fokussier- und hoverbar (kein pointer-events:none), damit der Tooltip
  // per Maus, Tastatur und Tippen auf dem Handy erreichbar ist.
  function lockTrackerButtons() {
    document.querySelectorAll(TRACKER_BTN_SELECTOR).forEach(function (btn, i) {
      if (btn.dataset.cvzLocked === '1') return;
      btn.dataset.cvzLocked = '1';
      btn.setAttribute('aria-disabled', 'true');
 
      // Unsichtbarer Text für Screenreader
      var descId = 'cvz-tracker-lock-desc-' + i;
      var desc = document.createElement('span');
      desc.id = descId;
      desc.textContent = TRACKER_LOCK_TEXT;
      desc.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
      btn.appendChild(desc);
      btn.setAttribute('aria-describedby', descId);
 
      btn.style.opacity = '0.45';
      btn.style.cursor  = 'not-allowed';
      btn.style.filter  = 'grayscale(1)';
 
      btn.addEventListener('mouseenter', function () { Tooltip.show(btn, TRACKER_LOCK_TEXT); });
      btn.addEventListener('mouseleave', Tooltip.hide);
      btn.addEventListener('focus',      function () { Tooltip.show(btn, TRACKER_LOCK_TEXT); });
      btn.addEventListener('blur',       Tooltip.hide);
    });
  }
 
  function isLocked(btn) {
    return btn.dataset.cvzLocked === '1';
  }
 
  // Tracker-Kauf. Drei Wege:
  //  1. Team-Mitglied     -> gesperrt (Button ist schon ausgegraut, hier nur Absicherung)
  //  2. hat schon Tracker -> Stripe-Portal (Menge ändern/kündigen), KEIN zweiter Checkout
  //  3. sonst             -> Memberstack-Checkout
  async function handleTrackerClick(btn, memberstackId, priceId) {
    var ctx = await fetchTrackerContext(memberstackId);
    if (!ctx) {
      resetBtn(btn);
      Modal.show({
        title: 'Verbindungsfehler',
        text:  'Dein Konto konnte nicht geprüft werden. Bitte versuche es in einem Moment erneut.',
      });
      return;
    }
 
    if (ctx.teamRole === 'member') {
      resetBtn(btn);
      lockTrackerButtons();
      Tooltip.show(btn, TRACKER_LOCK_TEXT, 4000);
      return;
    }
 
    if (ctx.topicsPurchased > 0) {
      var portalUrl = await fetchStripePortalUrl(memberstackId);
      if (portalUrl) {
        window.location.href = portalUrl;
        return;
      }
      resetBtn(btn);
      Modal.show({
        title: 'Fehler beim Öffnen',
        text:  'Das Abrechnungsportal konnte nicht geöffnet werden. Bitte versuche es erneut oder kontaktiere den Support.',
      });
      return;
    }
 
    resetBtn(btn);
    window.$memberstackDom.purchasePlansWithCheckout({
      priceId:    priceId,
      successUrl: window.location.origin + TRACKER_SUCCESS_PATH,
    }).catch(function (e) {
      console.error('[CVZ] Tracker checkout error:', e);
      Modal.show({
        title: 'Checkout nicht möglich',
        text:  'Der Checkout konnte nicht gestartet werden. Bitte versuche es später erneut oder kontaktiere den Support.',
      });
    });
  }
 
  async function handlePlanClick(btn, memberstackId, priceId) {
    setBtnLoading(btn);
    try {
      // Tracker hat einen eigenen Ablauf und muss VOR dem Haupt-Plan-Routing
      // abgefangen werden, sonst landen Kunden mit Abo im falschen Portal-Flow.
      if (CONFIG.trackerPriceIds.indexOf(priceId) !== -1) {
        await handleTrackerClick(btn, memberstackId, priceId);
        return;
      }
 
      var currentPriceId = await fetchCurrentPriceId(memberstackId);
      var isPPU          = CONFIG.ppuPriceIds.indexOf(priceId) !== -1;
      var isAufbauPPU    = isPPU && priceId.indexOf('aufbau') !== -1;
      var isStrategiePPU = isPPU && priceId.indexOf('strategie') !== -1;
 
      // PPU kann immer direkt gekauft werden - kein Portal nötig
      if (currentPriceId && !isPPU) {
        var portalUrl = await fetchStripePortalUrl(memberstackId);
        if (portalUrl) {
          window.location.href = portalUrl;
          return;
        }
        resetBtn(btn);
        Modal.show({
          title: 'Fehler beim Öffnen',
          text:  'Das Abrechnungsportal konnte nicht geöffnet werden. Bitte versuche es erneut oder kontaktiere den Support.',
        });
        return;
      }
 
      resetBtn(btn);
      var successPath = '/member/danke';
      if (isAufbauPPU)         successPath = '/member/landingpage-assistant';
      else if (isStrategiePPU) successPath = '/member/content-strategie';
      else if (isPPU)          successPath = '/analyse/formular';
 
      window.$memberstackDom.purchasePlansWithCheckout({
        priceId:    priceId,
        successUrl: window.location.origin + successPath,
      }).catch(function (e) { console.error('[CVZ] Checkout error:', e); });
    } catch (e) {
      console.error('[CVZ] handlePlanClick error:', e);
      resetBtn(btn);
      Modal.show({
        title: 'Verbindungsfehler',
        text:  'Dein Konto konnte nicht geprüft werden. Bitte versuche es in einem Moment erneut.',
      });
    }
  }
 
  function initPlanButtons() {
    // Handler immer anhängen, unabhängig vom Login-Status
    document.querySelectorAll('a[href*="/register?plan="]').forEach(function (btn) {
      btn.dataset.originalText = btn.textContent;
 
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
 
        // NEU: Gesperrter Tracker-Button. Auf dem Handy gibt es kein Hover,
        // deshalb zeigt ein Tippen den Tooltip für ein paar Sekunden.
        if (isLocked(btn)) {
          Tooltip.show(btn, TRACKER_LOCK_TEXT, 4000);
          return;
        }
 
        // Member-Status wird beim Klick frisch abgefragt, nicht beim Laden
        // zwischengespeichert (Memberstack stellt die Session verzögert her).
        var member        = await window.$memberstackDom.getCurrentMember();
        var memberstackId = (member && member.data && member.data.id) || null;
 
        // Nicht eingeloggt → normaler Redirect auf Register
        if (!memberstackId) {
          window.location.href = btn.href;
          return;
        }
 
        // Eingeloggt → Plan-Flow
        var url        = new URL(btn.href);
        var plan       = url.searchParams.get('plan');
        var billing    = url.searchParams.get('billing') || 'monthly';
        var billingKey = billing === 'annual' ? 'annual' : 'monthly';
        var priceId    = (CONFIG.priceIds[plan] || {})[billingKey];
        if (!priceId) return;
 
        await handlePlanClick(btn, memberstackId, priceId);
      });
    });
  }
 
  // NEU: Beim Laden prüfen, ob der eingeloggte Nutzer Team-Mitglied ist,
  // und die Tracker-Buttons dann sofort ausgrauen.
  async function applyTrackerLockForMembers() {
    if (!document.querySelector(TRACKER_BTN_SELECTOR)) return;
 
    var memberstackId = await getMemberstackIdWithRetry(10, 300);
    if (!memberstackId) return; // nicht eingeloggt: Button bleibt aktiv
 
    var ctx = await fetchTrackerContext(memberstackId);
    if (ctx && ctx.teamRole === 'member') lockTrackerButtons();
  }
 
  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    initPricingToggle();
 
    retry(depsReady, 30, 300)
      .then(function () {
        initPlanButtons();
        return applyTrackerLockForMembers();
      })
      .catch(function (err) { console.warn('[CVZ] Init failed:', err); });
  }
 
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
 
