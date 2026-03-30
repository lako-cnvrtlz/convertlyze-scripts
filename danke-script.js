// ==================== DANKE-SEITE SCRIPT ====================
(function() {

  var PLAN_DATA = {
    'prc_starter-monthly-udf40q28':   { name: 'Starter-Plan',    text: 'Dein Starter-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_starter-yearly-uu680b3d':    { name: 'Starter-Plan',    text: 'Dein Starter-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_pro-monthly-9q502rg':        { name: 'Pro-Plan',        text: 'Dein Pro-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_pro-yearly-l4c0gnw':         { name: 'Pro-Plan',        text: 'Dein Pro-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_enterprise-monthly-ftd0gbp': { name: 'Enterprise-Plan', text: 'Dein Enterprise-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_enterprise-yearly-zv6022j':  { name: 'Enterprise-Plan', text: 'Dein Enterprise-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'prc_pay-per-use-14750y0n':       { name: 'Pay-per-Use',     text: 'Deine Analyse ist bereit. Starte jetzt direkt.' }
  };

  var PLAN_BY_LICENSE = {
    'Free':         { name: 'Free-Plan',         text: 'Dein Free-Plan ist aktiv. Du hast eine kostenlose Analyse verfügbar.' },
    'Starter':      { name: 'Starter-Plan',      text: 'Dein Starter-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'Pro':          { name: 'Pro-Plan',          text: 'Dein Pro-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'Professional': { name: 'Professional-Plan', text: 'Dein Professional-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'Enterprise':   { name: 'Enterprise-Plan',   text: 'Dein Enterprise-Plan ist jetzt aktiv. Du kannst sofort mit deiner ersten Landingpage-Analyse starten.' },
    'Pay-per-Use':  { name: 'Pay-per-Use',       text: 'Deine Analyse ist bereit. Starte jetzt direkt.' }
  };

  // ── Elemente sofort verstecken ──
  var style = document.createElement('style');
  style.textContent =
    '[data-danke="firstname"],' +
    '[data-danke="plan-name"],' +
    '[data-danke="plan-text"] {' +
      'visibility: hidden;' +
    '}';
  document.head.appendChild(style);

  async function initDankePage() {
    var attempts = 0;
    while ((!window.$memberstackDom || !window.supabase) && attempts < 30) {
      await new Promise(function(r) { setTimeout(r, 300); });
      attempts++;
    }
    if (!window.$memberstackDom) return;

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

    var firstnameEl = document.querySelector('[data-danke="firstname"]');
    if (firstnameEl && user.firstname) {
      firstnameEl.textContent = 'Willkommen an Bord, ' + user.firstname + '!';
    }

    var planNameEl = document.querySelector('[data-danke="plan-name"]');
    if (planNameEl) planNameEl.textContent = planInfo.name;

    var planTextEl = document.querySelector('[data-danke="plan-text"]');
    if (planTextEl) planTextEl.textContent = planInfo.text;

    // ── Elemente einblenden ──
   document.querySelectorAll('[data-danke="firstname"], [data-danke="plan-name"], [data-danke="plan-text"]').forEach(function(el) {
  el.style.opacity = '1';
});

  } // ← initDankePage schließt hier

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDankePage);
  } else {
    initDankePage();
  }

})();
