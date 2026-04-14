(function() {
  if (window._cvlyCheckoutStarted) return;

  var PRICE_IDS = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      }
  };

  async function triggerCheckout() {
    if (window._cvlyCheckoutStarted) return;
    window._cvlyCheckoutStarted = true;

    var plan       = sessionStorage.getItem('selected_plan');
    var billing    = sessionStorage.getItem('selected_billing') || 'monthly';
    var billingKey = billing === 'annual' ? 'annual' : 'monthly';
    var priceId    = PRICE_IDS[plan]?.[billingKey];

    sessionStorage.removeItem('selected_plan');
    sessionStorage.removeItem('selected_billing');

    if (!priceId) {
      window.location.href = '/willkommen';
      return;
    }

    try {
  await window.$memberstackDom.purchasePlansWithCheckout({
    priceIds:   [{ id: priceId }],  // ← so
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
