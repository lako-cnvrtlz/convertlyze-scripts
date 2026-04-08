// ==================== CHECKOUT REDIRECT NACH SIGNUP ====================
// Dieses Script läuft auf /member/checkout-redirect
// Liest den gespeicherten Plan aus sessionStorage und startet den Stripe Checkout

(function() {
  var PRICE_IDS = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      }
  };

  async function triggerCheckout() {
    // Auf Memberstack warten
    var attempts = 0;
    while (!window.$memberstackDom && attempts < 50) {
      await new Promise(function(r) { setTimeout(r, 100); });
      attempts++;
    }

    if (!window.$memberstackDom) {
      console.error('❌ Memberstack nicht geladen');
      window.location.href = '/willkommen';
      return;
    }

    // Sicherstellen dass User eingeloggt ist
    var member = await window.$memberstackDom.getCurrentMember();
    if (!member?.data?.id) {
      console.warn('⚠️ Kein eingeloggter User – weiterleiten');
      window.location.href = '/register';
      return;
    }

    // Plan aus sessionStorage lesen
    var plan       = sessionStorage.getItem('selected_plan');
    var billing    = sessionStorage.getItem('selected_billing') || 'monthly';
    var billingKey = billing === 'annual' ? 'annual' : 'monthly';
    var priceId    = PRICE_IDS[plan]?.[billingKey];

    // sessionStorage leeren
    sessionStorage.removeItem('selected_plan');
    sessionStorage.removeItem('selected_billing');

    if (!priceId) {
      // Kein Plan gewählt → direkt zur Willkommensseite
      console.log('ℹ️ Kein Plan in sessionStorage – weiterleiten zu /willkommen');
      window.location.href = '/willkommen';
      return;
    }

    console.log('🛒 Starte Checkout nach Signup für:', plan, billing, priceId);

    try {
      await window.$memberstackDom.purchasePlansWithCheckout({
        priceId: priceId,
        successUrl: window.location.origin + '/member/danke'
      });
    } catch (err) {
      console.error('❌ Checkout Fehler:', err);
      window.location.href = '/member/dashboard';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', triggerCheckout);
  } else {
    triggerCheckout();
  }
})();
