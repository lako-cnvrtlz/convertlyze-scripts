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
    },
  };
  // Supabase-Client – wird in init() erstellt sobald SDK geladen ist
  var sb = null;
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
  function depsReady() {
    return !!window.$memberstackDom && !!window.supabase?.createClient;
  }
  // NEU: Cookie-Utilities, um den Plan-Wunsch zu lesen, den das Register-Script
  // vor dem Signup/Login als 'cvz_plan'/'cvz_billing' gesetzt hat.
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? match[1] : null;
  }
  function clearCookie(name) {
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  }
  // ── Data layer ───────────────────────────────────────────────────────────────
  async function fetchCurrentPriceId(memberstackId) {
    var res = await sb
      .from('users')
      .select('current_price_id')
      .eq('memberstack_id', memberstackId)
      .single();
    if (res.error) console.warn('[CVZ] fetchCurrentPriceId error:', res.error);
    return res.data?.current_price_id || null;
  }
  async function fetchStripePortalUrl(memberstackId) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/stripe-portal', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey,
      },
      body: JSON.stringify({ memberstackId }),
    });
    var data = await res.json();
    return data?.url || null;
  }
  // NEU: gleicher pending_checkouts-Fallback wie im Register-Script, falls das
  // 'cvz_plan'-Cookie mal fehlt (z.B. Login-Code in anderem Browser eingegeben).
  async function fetchPendingCheckout(email) {
    if (!email) return null;
    try {
      var res = await fetch(
        CONFIG.supabaseUrl + '/rest/v1/pending_checkouts?email=eq.' + encodeURIComponent(email) + '&limit=1',
        { headers: { 'apikey': CONFIG.supabaseAnonKey, 'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey } }
      );
      var data = await res.json();
      return data?.[0] || null;
    } catch (e) {
      console.warn('[CVZ] fetchPendingCheckout error:', e);
      return null;
    }
  }
  async function deletePendingCheckout(email) {
    if (!email) return;
    try {
      await fetch(
        CONFIG.supabaseUrl + '/rest/v1/pending_checkouts?email=eq.' + encodeURIComponent(email),
        { method: 'DELETE', headers: { 'apikey': CONFIG.supabaseAnonKey, 'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey } }
      );
    } catch (e) {
      console.warn('[CVZ] deletePendingCheckout error:', e);
    }
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
  // Fuer externe Scripts zugaenglich machen (toast.js etc.)
  window.cvzShowModal       = Modal.show;
  window.cvzCloseModal      = Modal.close;
  window.cvzShowMemberModal = Modal.showMemberError;
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
  async function handlePlanClick(btn, memberstackId, priceId) {
    setBtnLoading(btn);
    try {
      var currentPriceId = await fetchCurrentPriceId(memberstackId);
      var isPPU          = CONFIG.ppuPriceIds.indexOf(priceId) !== -1;
      var isAufbauPPU    = isPPU && priceId.indexOf('aufbau') !== -1;
      var isStrategiePPU = isPPU && priceId.indexOf('strategie') !== -1;
      // PPU kann immer direkt gekauft werden - kein Portal noetig
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
        text:  'Es konnte keine Verbindung zum Server hergestellt werden. Bitte prüfe deine Internetverbindung.',
      });
    }
  }
  // NEU: löst den Checkout automatisch aus, wenn vor dem Signup/Login schon ein
  // Plan gewählt wurde (Cookie 'cvz_plan'/'cvz_billing', gesetzt vom Register-
  // Script). Damit muss auf der Willkommens-Seite niemand die Preis-Karte noch
  // einmal anklicken. Bei einem bestehenden Abo (Starter/Pro/Enterprise) wird
  // NICHT automatisch das Billing-Portal geöffnet - da bleibt der manuelle
  // Klick nötig, das soll niemanden ungefragt dorthin schicken.
  async function autoResumeCheckout(memberstackId) {
    if (!memberstackId) return;
    var plan       = getCookie('cvz_plan');
    var billing    = getCookie('cvz_billing') || 'monthly';
    var fromCookie = !!plan;
    if (!plan) {
      try {
        var member = await window.$memberstackDom.getCurrentMember();
        var email  = member?.data?.auth?.email || member?.data?.email;
        var pending = await fetchPendingCheckout(email);
        if (pending) {
          plan    = pending.plan;
          billing = pending.billing || 'monthly';
          await deletePendingCheckout(email);
        }
      } catch (e) {
        console.warn('[CVZ] autoResumeCheckout fallback error:', e);
      }
    }
    if (fromCookie) { clearCookie('cvz_plan'); clearCookie('cvz_billing'); }
    if (!plan) return;
    var billingKey = billing === 'annual' ? 'annual' : 'monthly';
    var priceId    = CONFIG.priceIds[plan]?.[billingKey];
    if (!priceId) {
      console.warn('[CVZ] autoResumeCheckout: unbekannter Plan-Key', plan);
      return;
    }
    var isPPU          = CONFIG.ppuPriceIds.indexOf(priceId) !== -1;
    var currentPriceId = await fetchCurrentPriceId(memberstackId);
    if (currentPriceId && !isPPU) return;
    try {
      await window.$memberstackDom.purchasePlansWithCheckout({
        priceId:    priceId,
        successUrl: window.location.origin + '/member/danke',
      });
    } catch (e) {
      console.error('[CVZ] autoResumeCheckout Checkout error:', e);
    }
  }
  async function initPlanButtons() {
    // Member-Status ermitteln - null wenn nicht eingeloggt
    var member        = await window.$memberstackDom.getCurrentMember();
    var memberstackId = member?.data?.id || null;
    // Handler immer anhaengen, unabhaengig vom Login-Status
    document.querySelectorAll('a[href*="/register?plan="]').forEach(function (btn) {
      btn.dataset.originalText = btn.textContent;
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
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
        var priceId    = CONFIG.priceIds[plan]?.[billingKey];
        if (!priceId) return;
        await handlePlanClick(btn, memberstackId, priceId);
      });
    });
    return memberstackId; // NEU: fuer autoResumeCheckout weiterreichen
  }
  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    initPricingToggle();
    retry(depsReady, 30, 300)
      .then(function () {
        // Supabase-Client initialisieren sobald SDK bereit ist
        sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
        return initPlanButtons();
      })
      .then(function (memberstackId) {
        return autoResumeCheckout(memberstackId); // NEU
      })
      .catch(function (err) { console.warn('[CVZ] Init failed:', err); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
