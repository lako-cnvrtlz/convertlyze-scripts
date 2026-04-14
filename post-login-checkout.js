(function() {
  if (window._cvlyPostLoginCheckout) return;
  window._cvlyPostLoginCheckout = true;

  var PRICE_IDS = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      }
  };

  async function triggerPostLoginCheckout() {
    var plan       = sessionStorage.getItem('selected_plan');
    var billing    = sessionStorage.getItem('selected_billing') || 'monthly';
    var billingKey = billing === 'annual' ? 'annual' : 'monthly';
    var priceId    = PRICE_IDS[plan]?.[billingKey];

    if (!priceId) return;

    sessionStorage.removeItem('selected_plan');
    sessionStorage.removeItem('selected_billing');

    var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

    try {
      var member = await window.$memberstackDom.getCurrentMember();
      var memberstackId = member?.data?.id;
      if (!memberstackId) return;

      var dbRes = await fetch(
        SUPABASE_URL + '/rest/v1/users?select=current_price_id&memberstack_id=eq.' + memberstackId,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
      );
      var users = await dbRes.json();
      var hasActivePlan = users?.[0]?.current_price_id;

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
      console.error('[CVZ] Post-Login Checkout Fehler:', err);
      window.location.href = '/member/dashboard';
    }
  }

  window.addEventListener('memberstack:auth:login', triggerPostLoginCheckout);
})();
