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
  var inviteToken = urlParams.get('invite');
  var emailParam  = urlParams.get('email') ? decodeURIComponent(urlParams.get('email')) : '';
  var plan        = urlParams.get('plan');
  var billing     = urlParams.get('billing') || 'monthly';

  // ── 1. Invite-Token in sessionStorage sichern ──────────────────────────────
  if (inviteToken) {
    sessionStorage.setItem('pending_invite_token', inviteToken);
    console.log('[CVZ] Invite-Token gesichert:', inviteToken);
  }

  // ── 2. E-Mail prefill (Display-Element + Input-Feld) ──────────────────────
  function prefillEmail() {
    if (!emailParam) return false;

    // a) Text-Display-Element (falls vorhanden)
    var display = document.querySelector('[data-invite="email-display"]');
    if (display) display.textContent = emailParam;

    // b) Memberstack Signup-Formular Input-Feld
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

  // ── 3. DOMContentLoaded ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {

    // E-Mail prefill mit Retry (Memberstack rendert Formular async)
    if (!prefillEmail()) {
      setTimeout(prefillEmail, 400);
      setTimeout(prefillEmail, 900);
      setTimeout(prefillEmail, 1800);
    }

    // Plan-Parameter für normalen Signup-Flow in localStorage sichern
    if (plan) {
      localStorage.setItem('selected_plan', plan);
      localStorage.setItem('selected_billing', billing);
      console.log('[CVZ] Plan gesichert | plan:', plan, '| billing:', billing);
    }

    // Login-Links anreichern (Plan UND Invite-Token + E-Mail mitgeben)
    document.querySelectorAll('a[href*="/login"]').forEach(function(link) {
      var params = [];
      if (inviteToken) params.push('invite=' + inviteToken);
      if (emailParam)  params.push('email=' + encodeURIComponent(emailParam));
      if (plan)        params.push('plan=' + plan + '&billing=' + billing);
      if (params.length) link.href = '/login?' + params.join('&');
      console.log('[CVZ] Login-Link aktualisiert:', link.href);
    });
  });

  // ── 4. Nach Signup: Invite annehmen ODER Checkout starten ─────────────────
  async function handleAfterSignup(event) {
    if (window._cvlyCheckoutStarted) return;
    window._cvlyCheckoutStarted = true;

    var memberstackId = event?.detail?.member?.id || event?.detail?.id;
    console.log('[CVZ] Signup detected, memberstackId:', memberstackId);

    var token = sessionStorage.getItem('pending_invite_token')
         || urlParams.get('invite');

    // ── INVITE FLOW ──
    if (token) {
      sessionStorage.removeItem('pending_invite_token');
      console.log('[CVZ] Invite-Flow: rufe accept-team-invite auf...');

      // Warten bis Memberstack-Webhook den User in Supabase angelegt hat
      await new Promise(function(r) { setTimeout(r, 1500); });

      try {
        var res = await fetch(SUPABASE_URL + '/functions/v1/accept-team-invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            token:          token,
            memberstack_id: memberstackId
          })
        });

        var data = await res.json();
        console.log('[CVZ] accept-team-invite Response:', data);

        if (data.success) {
          console.log('[CVZ] ✅ Team-Invite angenommen');
        } else {
          console.error('[CVZ] ❌ Invite-Fehler:', data.error);
        }
      } catch (err) {
        console.error('[CVZ] ❌ accept-team-invite Request fehlgeschlagen:', err);
      }

      // Team Members bekommen keinen Checkout – direkt zu /willkommen
      window.location.href = '/willkommen';
      return;
    }

    // ── NORMALER CHECKOUT FLOW ──
    var currentPlan    = urlParams.get('plan') || localStorage.getItem('selected_plan');
    var currentBilling = urlParams.get('billing') || localStorage.getItem('selected_billing') || 'monthly';
    var billingKey     = currentBilling === 'annual' ? 'annual' : 'monthly';
    var priceId        = PRICE_IDS[currentPlan]?.[billingKey];

    localStorage.removeItem('selected_plan');
    localStorage.removeItem('selected_billing');

    if (!priceId) {
      console.log('[CVZ] Kein priceId – weiterleiten zu /willkommen');
      window.location.href = '/willkommen';
      return;
    }

    console.log('[CVZ] Starte Checkout | plan:', currentPlan, '| billing:', currentBilling);

    try {
      await window.$memberstackDom.purchasePlansWithCheckout({
        priceIds:   [{ id: priceId }],
        successUrl: window.location.origin + '/member/danke'
      });
    } catch (err) {
      console.error('[CVZ] ❌ Checkout Fehler:', err);
      window.location.href = '/member/dashboard';
    }
  }

  window.addEventListener('memberstack:auth:signup', handleAfterSignup);
})();
