(function () {
  'use strict';

  // ── Konfiguration ────────────────────────────────────────────────────────────

  var CONFIG = {
    supabaseUrl:     'https://zpkifipmyeunorhtepzq.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU',
    cookieMaxAgeMs:  30 * 60 * 1000, // 30 Minuten
    priceIds: {
      'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
      'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
      'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
      'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      },
    },
  };

  // ── URL-Parameter ────────────────────────────────────────────────────────────

  var params = new URLSearchParams(window.location.search);
  var urlEmail       = params.get('email')   ? decodeURIComponent(params.get('email')) : '';
  var urlPlan        = params.get('plan')    || '';
  var urlBilling     = params.get('billing') || 'monthly';
  var urlInviteToken = params.get('invite')  || '';

  // ── Guard: verhindert Doppelausführung von handleAfterSignup ─────────────────

  var checkoutStarted = false;

  // ── Utilities ────────────────────────────────────────────────────────────────

  function pollUntil(fn, intervalMs, maxAttempts) {
    var attempts = 0;
    var timer = setInterval(function () {
      fn();
      if (++attempts >= maxAttempts) clearInterval(timer);
    }, intervalMs);
  }

  // ── Cookie layer ─────────────────────────────────────────────────────────────

  var Cookies = {
    set: function (name, value) {
      var expires = new Date(Date.now() + CONFIG.cookieMaxAgeMs).toUTCString();
      document.cookie = name + '=' + value + ';expires=' + expires + ';path=/;SameSite=Lax';
    },
    get: function (name) {
      var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? match[1] : null;
    },
    clear: function (name) {
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    },
  };

  function savePlanToCookie(plan, billing) {
    Cookies.set('cvz_plan', plan);
    Cookies.set('cvz_billing', billing);
  }

  function clearPlanCookies() {
    Cookies.clear('cvz_plan');
    Cookies.clear('cvz_billing');
  }

  function getPlanFromCookie() {
    var plan    = Cookies.get('cvz_plan');
    var billing = Cookies.get('cvz_billing') || 'monthly';
    return plan ? { plan: plan, billing: billing } : null;
  }

  // ── Data layer ───────────────────────────────────────────────────────────────

  async function savePendingCheckout(email) {
    if (!urlPlan || !email) return;
    try {
      var res = await fetch(CONFIG.supabaseUrl + '/rest/v1/pending_checkouts', {
        method:  'POST',
        headers: {
          'apikey':        CONFIG.supabaseAnonKey,
          'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates',
        },
        body: JSON.stringify({ email: email, plan: urlPlan, billing: urlBilling }),
      });
      if (!res.ok) console.warn('[CVZ] savePendingCheckout failed:', res.status);
    } catch (e) {
      console.warn('[CVZ] savePendingCheckout error:', e);
    }
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

  // Gibt { plan, billing } zurück – Cookie zuerst, dann Supabase als Fallback
  async function resolvePlan() {
    var fromCookie = getPlanFromCookie();
    if (fromCookie) return fromCookie;

    try {
      var member = await window.$memberstackDom.getCurrentMember();
      var email  = member?.data?.auth?.email || member?.data?.email;
      if (!email) return null;

      var pending = await fetchPendingCheckout(email);
      if (pending) {
        await deletePendingCheckout(email);
        return { plan: pending.plan, billing: pending.billing || 'monthly' };
      }
    } catch (e) {
      console.warn('[CVZ] resolvePlan fallback error:', e);
    }

    return null;
  }

  // ── UI layer ─────────────────────────────────────────────────────────────────

  function prefillEmail() {
    if (!urlEmail) return;

    var display = document.querySelector('[data-invite="email-display"]');
    if (display) display.textContent = urlEmail;

    var input = document.querySelector('[data-ms-form="passwordless-signup"] input[type="email"]')
              || document.querySelector('input[type="email"]');
    if (input) {
      input.value = urlEmail;
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function enrichLoginLinks() {
    document.querySelectorAll('a[href*="/login"]').forEach(function (link) {
      var parts = [];
      if (urlInviteToken) parts.push('invite=' + urlInviteToken);
      if (urlEmail)       parts.push('email=' + encodeURIComponent(urlEmail));
      if (urlPlan)        parts.push('plan=' + urlPlan + '&billing=' + urlBilling);
      if (parts.length)   link.href = '/login?' + parts.join('&');
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleAfterSignup() {
    if (checkoutStarted) return;
    checkoutStarted = true;

    var resolved = await resolvePlan();
    clearPlanCookies();

    if (!resolved) {
      window.location.href = '/willkommen';
      return;
    }

    var billingKey = resolved.billing === 'annual' ? 'annual' : 'monthly';
    var priceId    = CONFIG.priceIds[resolved.plan]?.[billingKey];

    if (!priceId) {
      window.location.href = '/willkommen';
      return;
    }

    try {
      await window.$memberstackDom.purchasePlansWithCheckout({
        priceId:    priceId,
        successUrl: window.location.origin + '/member/danke',
      });
    } catch (e) {
      console.error('[CVZ] Checkout error:', e);
      window.location.href = '/member/dashboard';
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    prefillEmail();

    // Memberstack rendert Login-Links verzögert – mehrfach pollen
    enrichLoginLinks();
    pollUntil(enrichLoginLinks, 500, 4);

    // Plan in Cookie sichern damit er nach dem Signup noch verfügbar ist
    if (urlPlan) savePlanToCookie(urlPlan, urlBilling);

    // E-Mail ins Prefill nochmal versuchen falls DOM noch nicht bereit
    pollUntil(prefillEmail, 400, 3);

    // pending_checkout speichern wenn Formular abgeschickt wird
    if (urlPlan) {
      var form = document.querySelector('[data-ms-form="passwordless-signup"]');
      if (form) {
        form.addEventListener('submit', function () {
          var emailInput = form.querySelector('input[type="email"]');
          var email = emailInput ? emailInput.value.trim() : urlEmail;
          if (email) savePendingCheckout(email);
        });
      }
    }

    window.addEventListener('memberstack:auth:signup', handleAfterSignup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
