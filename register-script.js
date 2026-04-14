(function() {
  if (window._cvlyCheckoutStarted) return;

  var PRICE_IDS = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      }
  };

  // URL-Parameter in localStorage schreiben + Login-Link anpassen
  document.addEventListener('DOMContentLoaded', function() {
    var urlParams = new URLSearchParams(window.location.search);
    var plan    = urlParams.get('plan');
    var billing = urlParams.get('billing') || 'monthly';

    if (plan) {
      localStorage.setItem('selected_plan', plan);
      localStorage.setItem('selected_billing', billing);
      console.log('[CVZ] Register: localStorage gesetzt | plan:', plan, '| billing:', billing);

      // Login-Links mit Plan-Parametern versehen
      document.querySelectorAll('a[href*="/login"]').forEach(function(link) {
        link.href = '/login?plan=' + plan + '&billing=' + billing;
        console.log('[CVZ] Login-Link aktualisiert:', link.href);
      });
    }
  });

  async function triggerCheckout() {
    if (window._cvlyCheckoutStarted) return;
    window._cvlyCheckoutStarted = true;

    // URL-Parameter als primäre Quelle, localStorage als Fallback
    var urlParams  = new URLSearchParams(window.location.search);
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
      console.error('❌ Checkout Fehler:', err);
      window.location.href = '/member/dashboard';
    }
  }

  // Nur nach erfolgreichem Signup triggern
  window.addEventListener('memberstack:auth:signup', triggerCheckout);
})();
