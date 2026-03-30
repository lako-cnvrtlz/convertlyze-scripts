// ==================== PRICING TOGGLE ====================
(function() {
  function initPricingToggle() {
    var switcher = document.querySelector('.switcher');
    var leftBtn  = document.querySelector('.switch .left');
    var rightBtn = document.querySelector('.switch .right');
    var monthly  = document.querySelector('.monthly');
    var annually = document.querySelector('.annually');

    if (!switcher || !monthly || !annually) return;

    function showMonthly() {
      monthly.style.display = 'block';
      annually.style.display = 'none';
      if (leftBtn)  leftBtn.classList.add('active');
      if (rightBtn) rightBtn.classList.remove('active');
      switcher.style.transform = 'translateX(0px)';
      switcher.classList.remove('is-annual');
    }

    function showAnnually() {
      monthly.style.display = 'none';
      annually.style.display = 'block';
      if (leftBtn)  leftBtn.classList.remove('active');
      if (rightBtn) rightBtn.classList.add('active');
      var switchWidth   = document.querySelector('.switch').offsetWidth;
      var switcherWidth = switcher.offsetWidth;
      switcher.style.transform = 'translateX(' + (switchWidth - switcherWidth - 2) + 'px)';
      switcher.classList.add('is-annual');
    }

    switcher.style.position    = 'absolute';
    switcher.style.top         = '2px';
    switcher.style.left        = '2px';
    switcher.style.width       = 'calc(50% - 3px)';
    switcher.style.height      = 'calc(100% - 4px)';
    switcher.style.transition  = 'transform 0.3s ease';
    switcher.style.zIndex      = '1';
    switcher.style.borderRadius = 'inherit';

    var switchContainer = document.querySelector('.switch');
    if (switchContainer) {
      switchContainer.style.position = 'relative';
      switchContainer.style.overflow = 'hidden';
    }

    if (leftBtn)  { leftBtn.style.position  = 'relative'; leftBtn.style.zIndex  = '2'; leftBtn.style.cursor  = 'pointer'; }
    if (rightBtn) { rightBtn.style.position = 'relative'; rightBtn.style.zIndex = '2'; rightBtn.style.cursor = 'pointer'; }

    showMonthly();

    if (leftBtn)  leftBtn.addEventListener('click', showMonthly);
    if (rightBtn) rightBtn.addEventListener('click', showAnnually);
    if (switcher) switcher.addEventListener('click', function() {
      if (switcher.classList.contains('is-annual')) showMonthly();
      else showAnnually();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPricingToggle);
  } else {
    initPricingToggle();
  }
})();


// ==================== PLAN BUTTONS FÜR EINGELOGGTE USER ====================
(function() {
  var PLAN_DATA = {
    'starter':    { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':        { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise': { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' }
  };

  async function initPlanButtons() {
    // Auf Memberstack warten
    var attempts = 0;
    while (!window.$memberstackDom && attempts < 50) {
      await new Promise(function(r) { setTimeout(r, 100); });
      attempts++;
    }

    if (!window.$memberstackDom) return;

    // Prüfen ob User eingeloggt
    var member = await window.$memberstackDom.getCurrentMember();
    if (!member?.data?.id) return; // Nicht eingeloggt → normale Links bleiben

    console.log('✅ User eingeloggt – Plan-Buttons auf Checkout umleiten');

    // Alle Plan-Buttons abfangen
    document.querySelectorAll('a[href*="/register?plan="]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();

        var url        = new URL(btn.href);
        var plan       = url.searchParams.get('plan');
        var billing    = url.searchParams.get('billing') || 'monthly';
        var billingKey = billing === 'annual' ? 'annual' : 'monthly';

        var priceId = PLAN_DATA[plan]?.[billingKey];
        if (!priceId) {
          console.warn('⚠️ Kein priceId für Plan:', plan, billing);
          return;
        }

        console.log('🛒 Starte Checkout für:', plan, billing, priceId);

        window.$memberstackDom.purchasePlansWithCheckout({
          priceId: priceId,
          successUrl: window.location.origin + '/member/danke'
        }).catch(function(err) {
          console.error('❌ Checkout Fehler:', err);
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlanButtons);
  } else {
    initPlanButtons();
  }
})();
