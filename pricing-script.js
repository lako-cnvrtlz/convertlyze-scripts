(function () {
  'use strict';

  // ── Konfiguration ────────────────────────────────────────────────────────────

  var CONFIG = {
    supabaseUrl:     'https://zpkifipmyeunorhtepzq.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU',
    ppuPriceId:      'prc_pay-per-use-14750y0n',
    priceIds: {
      'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
      'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
      'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
      'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      },
    },
  };

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
    return !!window.$memberstackDom && typeof window.supabase?.from === 'function';
  }

  // ── Data layer ───────────────────────────────────────────────────────────────

  async function fetchCurrentPriceId(memberstackId) {
    var res = await window.supabase
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
      closeBtn.textContent = 'Schlie\u00dfen';
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
        text:  'Plan-\u00c4nderungen k\u00f6nnen nur vom Account-Inhaber vorgenommen werden. Wende dich an deinen Administrator.',
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
  window.cvzShowModal      = Modal.show;
  window.cvzCloseModal     = Modal.close;
  window.cvzShowMemberModal = Modal.showMemberError;

  // ── UI: Plan Buttons ─────────────────────────────────────────────────────────

  function setBtnLoading(btn) {
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent          = 'Wird geladen\u2026';
    btn.style.opacity        = '0.6';
    btn.style.pointerEvents  = 'none';
  }

  function resetBtn(btn) {
    btn.textContent         = btn.dataset.originalText || 'Plan w\u00e4hlen';
    btn.style.opacity       = '1';
    btn.style.pointerEvents = 'auto';
  }

  async function handlePlanClick(btn, memberstackId, priceId) {
    setBtnLoading(btn);

    try {
      var currentPriceId = await fetchCurrentPriceId(memberstackId);
      var isPPU          = priceId === CONFIG.ppuPriceId;

      // PPU kann immer direkt gekauft werden – kein Portal nötig
      if (currentPriceId && !isPPU) {
        var portalUrl = await fetchStripePortalUrl(memberstackId);
        if (portalUrl) {
          window.location.href = portalUrl;
          return;
        }
        resetBtn(btn);
        Modal.show({
          title: 'Fehler beim \u00d6ffnen',
          text:  'Das Abrechnungsportal konnte nicht ge\u00f6ffnet werden. Bitte versuche es erneut oder kontaktiere den Support.',
        });
        return;
      }

      resetBtn(btn);
      window.$memberstackDom.purchasePlansWithCheckout({
        priceId:    priceId,
        successUrl: window.location.origin + (isPPU ? '/analyse/formular' : '/member/danke'),
      }).catch(function (e) { console.error('[CVZ] Checkout error:', e); });

    } catch (e) {
      console.error('[CVZ] handlePlanClick error:', e);
      resetBtn(btn);
      Modal.show({
        title: 'Verbindungsfehler',
        text:  'Es konnte keine Verbindung zum Server hergestellt werden. Bitte pr\u00fcfe deine Internetverbindung.',
      });
    }
  }

  async function initPlanButtons() {
    var member = await window.$memberstackDom.getCurrentMember();
    if (!member?.data?.id) return;

    var memberstackId = member.data.id;

    document.querySelectorAll('a[href*="/register?plan="]').forEach(function (btn) {
      btn.dataset.originalText = btn.textContent;

      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        var url        = new URL(btn.href);
        var plan       = url.searchParams.get('plan');
        var billing    = url.searchParams.get('billing') || 'monthly';
        var billingKey = billing === 'annual' ? 'annual' : 'monthly';
        var priceId    = CONFIG.priceIds[plan]?.[billingKey];
        if (!priceId) return;
        await handlePlanClick(btn, memberstackId, priceId);
      });
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    initPricingToggle();
    retry(depsReady, 30, 300)
      .then(function () { return initPlanButtons(); })
      .catch(function (err) { console.warn('[CVZ] Init failed:', err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
