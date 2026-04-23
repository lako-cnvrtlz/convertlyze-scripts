// ==================== REGISTER SCRIPT ====================
(function() {
  if (window._cvlyCheckoutStarted) return;

  var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

  var PRICE_IDS = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      }
  };

  var urlParams   = new URLSearchParams(window.location.search);
  var emailParam  = urlParams.get('email') ? decodeURIComponent(urlParams.get('email')) : '';
  var plan        = urlParams.get('plan');
  var billing     = urlParams.get('billing') || 'monthly';
  var inviteToken = urlParams.get('invite') || '';

  // ── Cookie Helpers ─────────────────────────────────────────────────────────
  function setPlanCookie(p, b) {
    var expires = new Date(Date.now() + 30 * 60 * 1000).toUTCString(); // 30 Min
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

  // ── pending_checkouts: speichern ──────────────────────────────────────────
  async function savePendingCheckout(email) {
    if (!plan || !email) return;
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/pending_checkouts', {
        method:  'POST',
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates'
        },
        body: JSON.stringify({ email: email, plan: plan, billing: billing })
      });
      if (res.ok) console.log('[CVZ] ✅ pending_checkout gespeichert:', email, plan, billing);
      else        console.error('[CVZ] ❌ pending_checkout Fehler:', res.status);
    } catch(err) {
      console.error('[CVZ] ❌ pending_checkout Exception:', err);
    }
  }

  // ── pending_checkouts: lesen ──────────────────────────────────────────────
  async function getPendingCheckout(email) {
    if (!email) return null;
    try {
      var res = await fetch(
        SUPABASE_URL + '/rest/v1/pending_checkouts?email=eq.' + encodeURIComponent(email) + '&limit=1',
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
      );
      var data = await res.json();
      return data?.[0] || null;
    } catch(err) {
      console.error('[CVZ] ❌ pending_checkout lesen Fehler:', err);
      return null;
    }
  }

  // ── pending_checkouts: löschen ────────────────────────────────────────────
  async function deletePendingCheckout(email) {
    if (!email) return;
    try {
      await fetch(
        SUPABASE_URL + '/rest/v1/pending_checkouts?email=eq.' + encodeURIComponent(email),
        {
          method:  'DELETE',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
        }
      );
    } catch(err) {
      console.error('[CVZ] ❌ pending_checkout löschen Fehler:', err);
    }
  }

  // ── 1. E-Mail prefill ──────────────────────────────────────────────────────
  function prefillEmail() {
    if (!emailParam) return false;

    var display = document.querySelector('[data-invite="email-display"]');
    if (display) display.textContent = emailParam;

    var selectors = [
      '[data-ms-form="passwordless-signup"] input[type="email"]',
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

    // Plan in Cookie sichern
    if (plan) {
      setPlanCookie(plan, billing);
      console.log('[CVZ] Plan in Cookie gesichert | plan:', plan, '| billing:', billing);
    }

    // Login-Links anreichern
    document.querySelectorAll('a[href*="/login"]').forEach(function(link) {
      var params = [];
      if (inviteToken) params.push('invite=' + inviteToken);
      if (emailParam)  params.push('email=' + encodeURIComponent(emailParam));
      if (plan)        params.push('plan=' + plan + '&billing=' + billing);
      if (params.length) link.href = '/login?' + params.join('&');
      console.log('[CVZ] Login-Link aktualisiert:', link.href);
    });

    // Form Submit – E-Mail lesen und pending_checkout in Supabase speichern
    if (plan) {
      var form = document.querySelector('[data-ms-form="passwordless-signup"]');
      if (form) {
        form.addEventListener('submit', function() {
          var emailInput = form.querySelector('input[type="email"]');
          var email = emailInput ? emailInput.value.trim() : emailParam;
          if (email) savePendingCheckout(email);
        });
        console.log('[CVZ] Form submit Handler registriert');
      }
    }
  });

  // ── 3. Nach Signup: Checkout starten ──────────────────────────────────────
  async function handleAfterSignup() {
    if (window._cvlyCheckoutStarted) return;
    window._cvlyCheckoutStarted = true;

    // 1. Cookie als primäre Quelle
    var currentPlan    = getPlanCookie('cvz_plan');
    var currentBilling = getPlanCookie('cvz_billing') || 'monthly';

    // 2. Fallback: pending_checkout in Supabase
    if (!currentPlan) {
      console.log('[CVZ] Kein Cookie – suche pending_checkout in Supabase...');
      try {
        var member = await window.$memberstackDom.getCurrentMember();
        var email  = member?.data?.auth?.email || member?.data?.email;
        if (email) {
          var pending = await getPendingCheckout(email);
          if (pending) {
            currentPlan    = pending.plan;
            currentBilling = pending.billing || 'monthly';
            console.log('[CVZ] ✅ pending_checkout gefunden:', currentPlan, currentBilling);
            await deletePendingCheckout(email);
          }
        }
      } catch(e) {
        console.warn('[CVZ] pending_checkout Fallback Fehler:', e);
      }
    }

    clearPlanCookies();

    if (!currentPlan) {
      console.log('[CVZ] Kein Plan gefunden – weiterleiten zu /willkommen');
      window.location.href = '/willkommen';
      return;
    }

    var billingKey = currentBilling === 'annual' ? 'annual' : 'monthly';
    var priceId    = PRICE_IDS[currentPlan]?.[billingKey];

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

  console.log('[CVZ] Register-Script geladen');
})();
