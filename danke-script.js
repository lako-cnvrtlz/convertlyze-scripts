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

  // ── MutationObserver: verhindert dass Memberstack den Hero versteckt ──
  function keepHeroVisible() {
    var hero = document.querySelector('#danke-hero');
    if (!hero) return;

    var observer = new MutationObserver(function() {
      var computed = window.getComputedStyle(hero).visibility;
      if (computed === 'hidden' || hero.style.visibility === 'hidden') {
        hero.style.setProperty('visibility', 'visible', 'important');
      }
    });

    observer.observe(hero, { attributes: true, attributeFilter: ['style', 'class'] });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });

    // Nach 5 Sekunden Observer stoppen
    setTimeout(function() { observer.disconnect(); }, 5000);
  }

  async function initDankePage() {
    var attempts = 0;
    while ((!window.$memberstackDom || !window.supabase) && attempts < 30) {
      await new Promise(function(r) { setTimeout(r, 300); });
      attempts++;
    }
    if (!window.$memberstackDom) return;

    // Observer sofort starten
    keepHeroVisible();

    var params   = new URLSearchParams(window.location.search);
    var priceId  = params.get('msPriceId') || params.get('stripePriceId') || '';
    var planInfo = PLAN_DATA[priceId] || null;

    var result = await window.$memberstackDom.getCurrentMember();
    var member = result?.data;
    if (!member) return;

    var supabaseResult = await window.supabase
      .from('users')
      .select('firstname, license_type, ppu_credits')
      .eq('memberstack_id', member.id)
      .single();

    var user = supabaseResult?.data;
    if (!user) return;

    if (!planInfo) {
      var isPaidPlan = ['Starter', 'Pro', 'Professional', 'Enterprise'].indexOf(user.license_type) !== -1;
      if (!isPaidPlan && user.ppu_credits > 0) {
        planInfo = PLAN_BY_LICENSE['Pay-per-Use'];
      } else {
        planInfo = PLAN_BY_LICENSE[user.license_type] || PLAN_BY_LICENSE['Free'];
      }
    }

    // ── Vorname setzen ──
    var firstnameEl = document.querySelector('[data-danke="firstname"]');
    if (firstnameEl && user.firstname) {
      firstnameEl.textContent = 'Willkommen an Bord, ' + user.firstname + '!';
    }

    // ── Plan-Text setzen ──
    var planTextEl = document.querySelector('[data-danke="plan-text"]');
    if (planTextEl) planTextEl.textContent = planInfo.text;

    // ── Hero sichtbar halten ──
    var hero = document.querySelector('#danke-hero');
    if (hero) hero.style.setProperty('visibility', 'visible', 'important');

  } // ← initDankePage schließt hier

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDankePage);
  } else {
    initDankePage();
  }

})();
