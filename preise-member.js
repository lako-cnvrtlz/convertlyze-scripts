(function () {
  'use strict';

  // ── Konfiguration ────────────────────────────────────────────────────────────

  var CONFIG = {
    supabaseUrl:     'https://zpkifipmyeunorhtepzq.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU',
    ppuPriceId:      'prc_pay-per-use-14750y0n',
    maxInitAttempts: 30,
    initRetryMs:     300,
    plans: {
      'starter':     { monthly: { name: 'Starter',    price: '\u20ac149/Monat',  priceId: 'prc_starter-monthly-udf40q28'   }, annual: { name: 'Starter',    price: '\u20ac1.490/Jahr', priceId: 'prc_starter-yearly-uu680b3d'   } },
      'pro':         { monthly: { name: 'Pro',         price: '\u20ac299/Monat',  priceId: 'prc_pro-monthly-9q502rg'        }, annual: { name: 'Pro',         price: '\u20ac2.990/Jahr', priceId: 'prc_pro-yearly-l4c0gnw'        } },
      'enterprise':  { monthly: { name: 'Enterprise',  price: '\u20ac499/Monat',  priceId: 'prc_enterprise-monthly-ftd0gbp' }, annual: { name: 'Enterprise',  price: '\u20ac4.990/Jahr', priceId: 'prc_enterprise-yearly-zv6022j' } },
      'pay-per-use': { monthly: { name: 'Pay-per-Use', price: '\u20ac29',         priceId: 'prc_pay-per-use-14750y0n'       }, annual: { name: 'Pay-per-Use', price: '\u20ac29',         priceId: 'prc_pay-per-use-14750y0n'       } },
    },
  };

  // ── Utilities ────────────────────────────────────────────────────────────────

  function getParam(key) {
    return new URLSearchParams(window.location.search).get(key);
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

  function depsReady() {
    return !!window.$memberstackDom && typeof window.supabase?.from === 'function';
  }

  // ── Data layer ───────────────────────────────────────────────────────────────

  async function getCurrentMember() {
    var result = await window.$memberstackDom.getCurrentMember();
    return {
      id:    result?.data?.id    || null,
      email: result?.data?.auth?.email || result?.data?.email || null,
    };
  }

  async function fetchUser(memberstackId, options) {
    var maxAttempts = (options && options.maxAttempts) || 1;
    for (var i = 0; i < maxAttempts; i++) {
      var res = await window.supabase
        .from('users')
        .select('id, firstname, email, owner_user_id, current_price_id')
        .eq('memberstack_id', memberstackId)
        .single();
      if (res.data) return res.data;
      if (i < maxAttempts - 1) await new Promise(function (r) { setTimeout(r, 1500); });
      else console.warn('[CVZ] fetchUser error:', res.error);
    }
    return null;
  }

  async function fetchCredits(memberstackId) {
    var res = await window.supabase
      .from('user_effective_credits')
      .select('credits_limit, credits_used_current_period, reserved_credits, ppu_credits, reserved_ppu_credits')
      .eq('memberstack_id', memberstackId)
      .single();
    if (res.error) console.warn('[CVZ] fetchCredits error:', res.error);
    return res.data || null;
  }

  function calcCredits(d) {
    var plan = Math.max(0,
      (parseFloat(d.credits_limit) || 0) -
      (parseFloat(d.credits_used_current_period) || 0) -
      (parseFloat(d.reserved_credits) || 0)
    );
    var ppu = Math.max(0,
      (parseInt(d.ppu_credits) || 0) -
      (parseInt(d.reserved_ppu_credits) || 0)
    );
    return plan + ppu;
  }

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

  async function fetchStripePortalUrl(memberstackId) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/stripe-portal', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey },
      body:    JSON.stringify({ memberstackId }),
    });
    var data = await res.json();
    return data?.url || null;
  }

  // ── UI layer ─────────────────────────────────────────────────────────────────

  var Modal = (function () {
    var overlay, box;

    function build() {
      if (document.getElementById('cvz-modal')) return;
      overlay = document.createElement('div');
      overlay.id = 'cvz-modal';
      overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

      box = document.createElement('div');
      box.style.cssText = 'background:#0d1117;border:1px solid #2d3748;border-radius:12px;padding:32px;max-width:440px;width:90%;text-align:center;font-family:Geist,sans-serif;position:relative';

      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    function show(cfg) {
      if (!overlay || !box) return;
      box.innerHTML = '';

      var xBtn = document.createElement('button');
      xBtn.textContent = '\u2715';
      xBtn.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:#8b98a5;font-size:16px;cursor:pointer;line-height:1;padding:0';
      xBtn.onclick = function () { close(); if (cfg.onClose) cfg.onClose(); };

      var h = document.createElement('h3');
      h.textContent = cfg.title || '';
      h.style.cssText = 'color:#e8edf5;font-size:18px;font-weight:600;margin:0 0 10px';

      var p = document.createElement('p');
      p.textContent = cfg.text || '';
      p.style.cssText = 'color:#8b98a5;font-size:14px;line-height:1.6;margin:0 0 24px;white-space:pre-line';

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap';

      (cfg.buttons || []).forEach(function (def) {
        var btn = document.createElement('button');
        btn.textContent = def.label;
        btn.style.cssText = def.primary
          ? 'background:#4fd1c5;color:#0d1117;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer'
          : 'background:#252d3d;color:#e8edf5;border:1px solid #2a3550;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:500;cursor:pointer';
        btn.onclick = function () { close(); if (def.onClick) def.onClick(); };
        row.appendChild(btn);
      });

      box.append(xBtn, h, p, row);
      overlay.style.display = 'flex';
    }

    function close() {
      if (overlay) overlay.style.display = 'none';
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', build);
    } else {
      build();
    }

    return { show: show, close: close };
  })();

  function revealPage() {
    var hero = document.querySelector('.content_hero');
    if (hero) { hero.style.transition = 'opacity 0.4s ease'; hero.style.opacity = '1'; }
    document.body.classList.add('content-loaded');
  }

  function hidePlanSection() {
    ['[data-welcome="buy-btn"]', '[data-welcome="free-btn"]', '[data-welcome="plan-box"]', '[data-welcome="plan-info"]']
      .forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.style.display = 'none';
      });
  }

  function setCheckoutButtons(state) {
    document.querySelectorAll('[data-ms-modal="checkout"]').forEach(function (btn) {
      if (state === 'locked') {
        btn.style.pointerEvents = 'auto';
        btn.style.opacity       = '0.5';
        btn.style.cursor        = 'not-allowed';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          Modal.show(MODALS.memberBlock);
        }, true);
      } else {
        btn.style.pointerEvents = state === 'unlocked' ? 'auto' : 'none';
        btn.style.opacity       = '';
        btn.style.cursor        = '';
      }
    });
  }

  function renderCredits(total) {
    var el = document.querySelector('[data-field="credits_remaining"]');
    if (el) {
      el.textContent = total;
      el.style.color = total === 0 ? '#f87171' : total <= 3 ? '#fbbf24' : '#34d399';
    }
    var box = document.getElementById('credits-info');
    if (box) box.style.opacity = '1';
  }

  function renderFirstName(firstname) {
    var el = document.querySelector('[data-welcome="firstname"]');
    if (el) el.textContent = (firstname || 'Member') + '!';
  }

  // ── Modal-Definitionen ───────────────────────────────────────────────────────

  var MODALS = {
    memberBlock: {
      title: 'Plan-Buchung nicht möglich',
      text:  'Als Team-Mitglied kannst du keine Abonnements buchen oder verwalten.\n\nFür persönliche Einzelanalysen kannst du Pay-per-Use-Analysen (\u20ac29/Stück) hinzukaufen.',
      buttons: [
        { label: 'Pay-per-Use kaufen', primary: false, onClick: function () { startPpuCheckout(); } },
        { label: 'Zum Dashboard \u2192',   primary: true,  onClick: function () { window.location.href = '/member/dashboard'; } },
      ],
    },
    teamMember: {
      title: 'Du bist als Team-Member eingeladen',
      text:  'Plan-Buchungen sind nur für den Account-Inhaber möglich.\n\nFür persönliche Einzelanalysen kannst du Pay-per-Use-Analysen (\u20ac29/Stück) hinzukaufen.',
      buttons: [
        { label: 'Pay-per-Use kaufen', primary: false, onClick: function () { startPpuCheckout(); } },
        { label: 'Analyse starten \u2192',  primary: true,  onClick: function () { window.location.href = '/analyse/formular'; } },
      ],
    },
    hasActivePlan: function (memberstackId) {
      return {
        title: 'Du hast bereits einen aktiven Plan',
        text:  'Möchtest du deinen Plan ändern oder deine Abrechnung verwalten? Das kannst du direkt im Kundenportal erledigen.',
        onClose: function () { window.location.href = '/member/dashboard'; },
        buttons: [
          { label: 'Abrechnung verwalten \u2192', primary: true, onClick: function () { openPortal(memberstackId); } },
        ],
      };
    },
    planCheckout: function (plan) {
      return {
        title: 'Willkommen bei Convertlyze!',
        text:  'Du hast dich für den ' + plan.name + '-Plan interessiert. Starte direkt oder teste erst eine kostenlose Analyse.',
        buttons: [
          { label: 'Erst kostenlos testen',              primary: false, onClick: function () { window.location.href = '/analyse/formular'; } },
          { label: plan.name + ' kaufen \u2013 ' + plan.price, primary: true,  onClick: function () { startCheckout(plan.priceId); } },
        ],
      };
    },
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  function startPpuCheckout() {
    window.$memberstackDom.purchasePlansWithCheckout({
      priceId:    CONFIG.ppuPriceId,
      successUrl: window.location.origin + '/analyse/formular',
    }).catch(function (e) { console.error('[CVZ] PPU checkout error:', e); });
  }

  function startCheckout(priceId) {
    var isPPU = priceId === CONFIG.ppuPriceId;
    window.$memberstackDom.purchasePlansWithCheckout({
      priceId:    priceId,
      successUrl: window.location.origin + (isPPU ? '/analyse/formular' : '/member/danke'),
    }).catch(function (e) { console.error('[CVZ] Checkout error:', e); });
  }

  async function openPortal(memberstackId) {
    try {
      var url = await fetchStripePortalUrl(memberstackId);
      if (url) { window.location.href = url; return; }
    } catch (e) { console.error('[CVZ] Portal error:', e); }
    Modal.show({ title: 'Portal nicht erreichbar', text: 'Bitte versuche es erneut oder kontaktiere den Support.' });
  }

  // ── Pricing Toggle ───────────────────────────────────────────────────────────

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

  // ── App ──────────────────────────────────────────────────────────────────────

  async function run() {
    setCheckoutButtons('disabled');

    var hero = document.querySelector('.content_hero');
    if (hero) hero.style.opacity = '0';

    var member = await getCurrentMember();
    var user   = member.id ? await fetchUser(member.id, { maxAttempts: 5 }) : null;
    var email  = user?.email || member.email;

    renderFirstName(user?.firstname);

    if (member.id) {
      fetchCredits(member.id).then(function (credits) {
        if (credits) renderCredits(calcCredits(credits));
      });
    }

    // ── State 1: Team-Member ─────────────────────────────────────────────────
    if (user?.owner_user_id) {
      hidePlanSection();
      setCheckoutButtons('locked');
      revealPage();
      Modal.show(MODALS.teamMember);
      return;
    }

    // ── State 2: Aktiver Plan ────────────────────────────────────────────────
    if (user?.current_price_id) {
      hidePlanSection();
      setCheckoutButtons('unlocked');
      revealPage();
      Modal.show(MODALS.hasActivePlan(member.id));
      return;
    }

    // ── State 3: Neuer User ──────────────────────────────────────────────────
    var planKey = getParam('plan');
    var billing = getParam('billing') || 'monthly';

    if (!planKey && email) {
      var pending = await fetchPendingCheckout(email);
      if (pending) {
        planKey = pending.plan;
        billing = pending.billing || 'monthly';
        await deletePendingCheckout(email);
      }
    }

    hidePlanSection();
    setCheckoutButtons('unlocked');
    revealPage();

    var planDef = CONFIG.plans[planKey];
    if (planDef) {
      var billingKey = billing === 'annual' ? 'annual' : 'monthly';
      Modal.show(MODALS.planCheckout(planDef[billingKey] || planDef.monthly));
    } else {
      var freeBtn = document.querySelector('[data-welcome="free-btn"]');
      if (freeBtn) {
        freeBtn.style.display = 'flex';
        freeBtn.addEventListener('click', function () { window.location.href = '/analyse/formular'; });
      }
    }
  }

  function init() {
    retry(depsReady, CONFIG.maxInitAttempts, CONFIG.initRetryMs)
      .then(function () { return run(); })
      .catch(function (err) {
        console.error('[CVZ] Init failed:', err);
        setCheckoutButtons('unlocked');
        revealPage();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initPricingToggle();
      init();
    });
  } else {
    initPricingToggle();
    init();
  }

})();
