// ==================== REGISTER SCRIPT ====================
(function() {
  if (window._cvlyCheckoutStarted) return;

  var PRICE_IDS = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      }
  };

  var urlParams  = new URLSearchParams(window.location.search);
  var emailParam = urlParams.get('email') ? decodeURIComponent(urlParams.get('email')) : '';
  var plan       = urlParams.get('plan');
  var billing    = urlParams.get('billing') || 'monthly';

  // ── Cookie Helpers ─────────────────────────────────────────────────────────
  function setPlanCookie(p, b) {
    var expires = new Date(Date.now() + 10 * 60 * 1000).toUTCString(); // 10 Min
    document.cookie = 'cvz_plan='    + p + ';expires=' + expires + ';path=/;SameSite=Lax';
    document.cookie = 'cvz_billing=' + b + ';expires=' + expires + ';path=/;SameSite=Lax';
  }

  function clearPlanCookies() {
    document.cookie = 'cvz_plan=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    document.cookie = 'cvz_billing=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  }

  function getPlanCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? match[1] : null;
  }

  // ── 1. E-Mail prefill ──────────────────────────────────────────────────────
  function prefillEmail() {
    if (!emailParam) return false;

    var display = document.querySelector('[data-invite="email-display"]');
    if (display) display.textContent = emailParam;

    var selectors = [
      '[data-ms-form="signup"] input[type="email"]',
      '[data-ms-form="signup"] input[name="email"]',
      'input[type="email"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var input = document.querySelector(selectors[i]);
      if (input) {
        input.value = emailParam;
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[CVZ] E-Mail prefilled:', emailParam);
        return true;
      }
    }
    return false;
  }

  // ── 2. DOMContentLoaded ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {

    if (!prefillEmail()) {
      setTimeout(prefillEmail, 400);
      setTimeout(prefillEmail, 900);
      setTimeout(prefillEmail, 1800);
    }

    // Plan in Cookie + localStorage sichern (doppelte Absicherung)
    if (plan) {
      setPlanCookie(plan, billing);
      try {
        localStorage.setItem('selected_plan', plan);
        localStorage.setItem('selected_billing', billing);
      } catch(e) {}
      console.log('[CVZ] Plan gesichert | plan:', plan, '| billing:', billing);
    }

    // Login-Links anreichern
    document.querySelectorAll('a[href*="/login"]').forEach(function(link) {
      var params = [];
      if (emailParam) params.push('email=' + encodeURIComponent(emailParam));
      if (plan)       params.push('plan=' + plan + '&billing=' + billing);
      if (params.length) link.href = '/login?' + params.join('&');
      console.log('[CVZ] Login-Link aktualisiert:', link.href);
    });
  });

  // ── 3. Nach Signup: Checkout starten ──────────────────────────────────────
  async function handleAfterSignup(event) {
    if (window._cvlyCheckoutStarted) return;
    window._cvlyCheckoutStarted = true;

    // Cookie als primäre Quelle, localStorage + URL als Fallback
    var currentPlan    = getPlanCookie('cvz_plan')
                      || urlParams.get('plan')
                      || (() => { try { return localStorage.getItem('selected_plan'); } catch(e) { return null; } })();
    var currentBilling = getPlanCookie('cvz_billing')
                      || urlParams.get('billing')
                      || (() => { try { return localStorage.getItem('selected_billing'); } catch(e) { return null; } })()
                      || 'monthly';

    var billingKey = currentBilling === 'annual' ? 'annual' : 'monthly';
    var priceId    = PRICE_IDS[currentPlan]?.[billingKey];

    clearPlanCookies();
    try { localStorage.removeItem('selected_plan'); localStorage.removeItem('selected_billing'); } catch(e) {}

    if (!priceId) {
      console.log('[CVZ] Kein priceId – weiterleiten zu /willkommen');
      window.location.href = '/willkommen';
      return;
    }

    console.log('[CVZ] Starte Checkout | plan:', currentPlan, '| billing:', currentBilling, '| priceId:', priceId);

    try {
      await window.$memberstackDom.purchasePlansWithCheckout({
        priceId:    priceId,
        successUrl: window.location.origin + '/member/danke'
      });
    } catch (err) {
      console.error('[CVZ] ❌ Checkout Fehler:', err);
      window.location.href = '/member/dashboard';
    }
  }

  window.addEventListener('memberstack:auth:signup', handleAfterSignup);
})();
