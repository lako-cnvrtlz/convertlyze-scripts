// ── Hero sofort verstecken ────────────────────────────────────────────────
(function() {
  var hero = document.querySelector('#danke-hero');
  if (hero) hero.style.opacity = '0';
})();

// ==================== DANKE-SEITE SCRIPT ====================
(function() {

  var PLAN_DATA = {
    'prc_starter-monthly-udf40q28':   { text: 'Dein Starter-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_starter-yearly-uu680b3d':    { text: 'Dein Starter-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_pro-monthly-9q502rg':        { text: 'Dein Pro-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_pro-yearly-l4c0gnw':         { text: 'Dein Pro-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_enterprise-monthly-ftd0gbp': { text: 'Dein Enterprise-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_enterprise-yearly-zv6022j':  { text: 'Dein Enterprise-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_pay-per-use-14750y0n':       { text: 'Deine Analyse ist bereit. Starte jetzt direkt.' }
  };

  var PLAN_BY_LICENSE = {
    'Free':         { text: 'Dein Free-Plan ist aktiv. Du hast eine kostenlose Analyse verfügbar.' },
    'Starter':      { text: 'Dein Starter-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'Pro':          { text: 'Dein Pro-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'Professional': { text: 'Dein Professional-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'Enterprise':   { text: 'Dein Enterprise-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'Pay-per-Use':  { text: 'Deine Analyse ist bereit. Starte jetzt direkt.' }
  };

  function revealHero() {
    var hero = document.querySelector('#danke-hero');
    if (hero) {
      hero.style.transition = 'opacity 0.4s ease';
      hero.style.opacity = '1';
    }
  }

  async function initDankePage() {
    var attempts = 0;
    while (!window.$memberstackDom && attempts < 30) {
      await new Promise(function(r) { setTimeout(r, 300); });
      attempts++;
    }

    if (!window.$memberstackDom) { revealHero(); return; }

    // ── Token holen ────────────────────────────────────────────────────────────
    var tokenResult = await window.$memberstackDom.getMemberJSON();
    var token = tokenResult?.data?._token;

    if (!token) { revealHero(); return; }

    // ── User-Daten per Edge Function laden (kein direkter Supabase-Zugriff) ────
    var res = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/get-user-info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });

    if (!res.ok) { revealHero(); return; }

    var result = await res.json();
    var user = result?.data;

    if (!user) { revealHero(); return; }

    // ── Plan-Text bestimmen ────────────────────────────────────────────────────
    var params   = new URLSearchParams(window.location.search);
    var priceId  = params.get('msPriceId') || params.get('stripePriceId') || '';
    var planInfo = PLAN_DATA[priceId] || null;

    if (!planInfo) {
      var isPaidPlan = ['Starter', 'Pro', 'Professional', 'Enterprise'].indexOf(user.license_type) !== -1;
      if (!isPaidPlan && user.ppu_credits > 0) {
        planInfo = PLAN_BY_LICENSE['Pay-per-Use'];
      } else {
        planInfo = PLAN_BY_LICENSE[user.license_type] || PLAN_BY_LICENSE['Free'];
      }
    }

    // ── Begrüßung setzen ───────────────────────────────────────────────────────
    var firstnameEl = document.querySelector('[data-danke="firstname"]');
    if (firstnameEl) {
      firstnameEl.textContent = 'Vielen Dank, ' + (user.firstname || 'Member') + '!';
      firstnameEl.style.setProperty('color', '#ffffff', 'important');
    }

    // ── Plan-Text setzen ───────────────────────────────────────────────────────
    var planTextEl = document.querySelector('[data-danke="plan-text"]');
    if (planTextEl) {
      planTextEl.textContent = planInfo.text;
      planTextEl.style.setProperty('color', '#ffffff', 'important');
    }

    revealHero();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDankePage);
  } else {
    initDankePage();
  }

})();
