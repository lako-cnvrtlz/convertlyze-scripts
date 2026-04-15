(function() {
  if (window._cvlyPostLoginCheckout) return;
  window._cvlyPostLoginCheckout = true;

  var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

  var PRICE_IDS = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      }
  };

  // ── TEMPORÄRER DEBUG-LISTENER ──────────────────────────────────────────────
  window.addEventListener('memberstack:auth:login', function(event) {
    console.log('[CVZ] DEBUG memberstack:auth:login fired:', JSON.stringify(event.detail));
    console.log('[CVZ] DEBUG sessionStorage token:', sessionStorage.getItem('pending_invite_token'));
  });

  // ── HAUPT-LISTENER ─────────────────────────────────────────────────────────
  window.addEventListener('memberstack:auth:login', async function(event) {
    var memberstackId = event?.detail?.member?.id || event?.detail?.id;
    console.log('[CVZ] Post-Login detected, memberstackId:', memberstackId);

    // ── INVITE FLOW ──────────────────────────────────────────────────────────
    var token = sessionStorage.getItem('pending_invite_token');
    console.log('[CVZ] pending_invite_token:', token);

    if (token) {
      sessionStorage.removeItem('pending_invite_token');
      console.log('[CVZ] Invite-Flow nach Login – rufe accept-team-invite auf...');

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
        console.error('[CVZ] ❌ accept-team-invite fehlgeschlagen:', err);
      }

      window.location.href = '/willkommen';
      return;
    }

    // ── NORMALER POST-LOGIN CHECKOUT FLOW ────────────────────────────────────
    var urlParams      = new URLSearchParams(window.location.search);
    var currentPlan    = urlParams.get('plan') || localStorage.getItem('selected_plan');
    var currentBilling = urlParams.get('billing') || localStorage.getItem('selected_billing') || 'monthly';
    var billingKey     = currentBilling === 'annual' ? 'annual' : 'monthly';
    var priceId        = PRICE_IDS[currentPlan]?.[billingKey];

    console.log('[CVZ] Post-Login | plan:', currentPlan, '| billing:', currentBilling, '| priceId:', priceId);

    localStorage.removeItem('selected_plan');
    localStorage.removeItem('selected_billing');

    if (!priceId) {
      console.log('[CVZ] Kein Plan – normaler Login-Redirect');
      return;
    }

    try {
      var dbRes = await fetch(
        SUPABASE_URL + '/rest/v1/users?select=current_price_id&memberstack_id=eq.' + memberstackId,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
      );
      var users = await dbRes.json();
      var hasActivePlan = users?.[0]?.current_price_id;
      console.log('[CVZ] Post-Login | hasActivePlan:', hasActivePlan);

      if (hasActivePlan) {
        var portalRes = await fetch(SUPABASE_URL + '/functions/v1/stripe-portal', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ memberstackId: memberstackId })
        });
        var portalData = await portalRes.json();
        if (portalData.url) {
          window.location.href = portalData.url;
          return;
        }
      } else {
        await window.$memberstackDom.purchasePlansWithCheckout({
          priceIds:   [{ id: priceId }],
          successUrl: window.location.origin + '/member/danke'
        });
      }
    } catch (err) {
      console.error('[CVZ] ❌ Post-Login Checkout Fehler:', err);
      window.location.href = '/member/dashboard';
    }
  });

})();
