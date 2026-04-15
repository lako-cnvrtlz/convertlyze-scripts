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

  // ── 1. Invite-Token in sessionStorage sichern ──────────────────────────────
  if (inviteToken) {
    sessionStorage.setItem('pending_invite_token', inviteToken);
    console.log('[CVZ] Invite-Token gesichert:', inviteToken);
  }

  // ── 2. E-Mail prefill (Display + Input-Feld) ───────────────────────────────
  function prefillEmail() {
    if (!emailParam) return;

    // a) Text-Display-Element (falls vorhanden)
    var display = document.querySelector('[data-invite="email-display"]');
    if (display) display.textContent = emailParam;

    // b) Memberstack Signup-Formular Input-Feld
    var selectors = [
      '[data-ms-form="signup"] input[type="email"]',
      '[data-ms-form="signup"] input[name="email"]',
      'input[type="email"]'
    ];
    for (var s of selectors) {
      var input = document.querySelector(s);
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

  // Mit Retry – Memberstack rendert das Formular async
  document.addEventListener('DOMContentLoaded', function() {
    if (!prefillEmail()) {
      setTimeout(prefillEmail, 400);
      setTimeout(prefillEmail, 900);
      setTimeout(prefillEmail, 1800);
    }

    // Plan-Parameter für normalen Signup-Flow
    var plan    = urlParams.get('plan');
    var billing = urlParams.get('billing') || 'monthly';
    if (plan) {
      localStorage.setItem('selected_plan', plan);
      localStorage.setItem('selected_billing', billing);
      document.querySelectorAll('a[href*="/login"]').forEach(function(link) {
        link.href = '/login?plan=' + plan + '&billing=' + billing;
      });
    }
  });

  // ── 3. Nach Signup: Invite annehmen ODER Checkout starten ─────────────────
  async function handleAfterSignup(event) {
    if (window._cvlyCheckoutStarted) return;
    window._cvlyCheckoutStarted = true;

    var memberstackId = event?.detail?.member?.id || event?.detail?.id;
    console.log('[CVZ] Signup detected, memberstackId:', memberstackId);

    var token = sessionStorage.getItem('pending_invite_token');

    // ── INVITE FLOW ──
    if (token) {
      sessionStorage.removeItem('pending_invite_token');
      console.log('[CVZ] Invite-Flow: rufe accept-team-invite auf...');

      // Kurz warten bis Memberstack den User in der DB hat
      await new Promise(r => setTimeout(r, 1500));

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
          console.log('[CVZ] ✅ Team-Invite angenommen – weiterleiten zu /willkommen');
          window.location.href = '/willkommen';
        } else {
          console.error('[CVZ] ❌ Invite-Fehler:', data.error);
          // Trotzdem weiterleiten, nicht hängen lassen
          window.location.href = '/willkommen';
        }
      } catch (err) {
        console.error('[CVZ] ❌ accept-team-invite Request fehlgeschlagen:', err);
        window.location.href = '/willkommen';
      }
      return; // Kein Checkout für Team Members
    }

    // ── NORMALER CHECKOUT FLOW ──
    var plan       = urlParams.get('plan') || localStorage.getItem('selected_plan');
    var billing    = urlParams.get('billing') || localStorage.getItem('selected_billing') || 'monthly';
    var billingKey = billing === 'annual' ? 'annual' : 'monthly';
    var priceId    = PRICE_IDS[plan]?.[billingKey];

    localStorage.removeItem('selected_plan');
    localStorage.removeItem('selected_billing');

    if (!priceId) {
      window.location.href = '/willkommen';
      return;
    }

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
