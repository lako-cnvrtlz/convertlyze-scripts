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

    switcher.style.position     = 'absolute';
    switcher.style.top          = '2px';
    switcher.style.left         = '2px';
    switcher.style.width        = 'calc(50% - 3px)';
    switcher.style.height       = 'calc(100% - 4px)';
    switcher.style.transition   = 'transform 0.3s ease';
    switcher.style.zIndex       = '1';
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


// ==================== MODAL ====================
(function() {
  function createModal() {
    if (document.getElementById('cvz-member-modal')) return;

    var overlay = document.createElement('div');
    overlay.id = 'cvz-member-modal';
    overlay.style.cssText = [
      'display: none',
      'position: fixed',
      'inset: 0',
      'background: rgba(0,0,0,0.6)',
      'z-index: 9999',
      'align-items: center',
      'justify-content: center',
      'backdrop-filter: blur(4px)',
    ].join(';');

    var box = document.createElement('div');
    box.id = 'cvz-member-modal-box';
    box.style.cssText = [
      'background: #0d1117',
      'border: 1px solid #2d3748',
      'border-radius: 12px',
      'padding: 32px',
      'max-width: 420px',
      'width: 90%',
      'text-align: center',
      'font-family: Geist, sans-serif',
    ].join(';');

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeModal();
    });
  }

  function showModal(cfg) {
    var overlay = document.getElementById('cvz-member-modal');
    var box     = document.getElementById('cvz-member-modal-box');
    if (!overlay || !box) return;

    box.innerHTML = '';

    var icon = document.createElement('div');
    icon.textContent = cfg.icon || 'ℹ️';
    icon.style.cssText = 'font-size: 32px; margin-bottom: 16px;';

    var title = document.createElement('h3');
    title.textContent = cfg.title || '';
    title.style.cssText = 'color: #e8edf5; font-size: 18px; font-weight: 600; margin: 0 0 12px;';

    var text = document.createElement('p');
    text.textContent = cfg.text || '';
    text.style.cssText = 'color: #8b98a5; font-size: 14px; line-height: 1.6; margin: 0 0 24px;';

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 10px; justify-content: center;';

    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Schließen';
    closeBtn.style.cssText = 'background: #252d3d; color: #e8edf5; border: 1px solid #2a3550; border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: 500; cursor: pointer;';
    closeBtn.addEventListener('click', closeModal);

    btnRow.appendChild(closeBtn);

    if (cfg.confirmLabel && cfg.onConfirm) {
      var confirmBtn = document.createElement('button');
      confirmBtn.textContent = cfg.confirmLabel;
      confirmBtn.style.cssText = 'background: #4fd1c5; color: #0d1117; border: none; border-radius: 8px; padding: 10px 24px; font-size: 14px; font-weight: 600; cursor: pointer;';
      confirmBtn.addEventListener('click', function() { closeModal(); cfg.onConfirm(); });
      btnRow.appendChild(confirmBtn);
    }

    box.appendChild(icon);
    box.appendChild(title);
    box.appendChild(text);
    box.appendChild(btnRow);

    overlay.style.display = 'flex';
  }

  function closeModal() {
    var modal = document.getElementById('cvz-member-modal');
    if (modal) modal.style.display = 'none';
  }

  window.cvzShowModal    = showModal;
  window.cvzCloseModal   = closeModal;

  // Legacy-Kompatibilität
  window.cvzShowMemberModal = function() {
    showModal({
      icon: '🔒',
      title: 'Keine Berechtigung',
      text: 'Plan-Änderungen können nur vom Account-Inhaber vorgenommen werden. Wende dich an deinen Administrator.',
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createModal);
  } else {
    createModal();
  }
})();


// ==================== PLAN BUTTONS FÜR EINGELOGGTE USER ====================
(function() {
  var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';
  var PLAN_SWAP_ENDPOINT = SUPABASE_URL + '/functions/v1/stripe-plan-swap';

  var PLAN_DATA = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      }
  };

  function startCheckout(priceId) {
    return window.$memberstackDom.purchasePlansWithCheckout({
      priceId:    priceId,
      successUrl: window.location.origin + '/member/danke'
    });
  }

  function resetBtn(btn) {
    if (!btn) return;
    btn.textContent         = btn.dataset.originalText || 'Plan wählen';
    btn.style.opacity       = '1';
    btn.style.pointerEvents = 'auto';
  }

  function setBtnLoading(btn) {
    if (!btn) return;
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent          = 'Wird geladen…';
    btn.style.opacity        = '0.6';
    btn.style.pointerEvents  = 'none';
  }

  async function handlePlanClick(btn, memberstackId, priceId, plan) {
    // Pay-per-Use → immer direkt zum Checkout
    if (plan === 'pay-per-use') {
      if (priceId) startCheckout(priceId).catch(function(err) { console.error('Checkout Fehler:', err); });
      return;
    }

    setBtnLoading(btn);

    try {
      // stripe-plan-swap aufrufen – updated Stripe + triggert Memberstack Webhook → Supabase
      var res = await fetch(PLAN_SWAP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ memberstack_id: memberstackId, new_price_id: priceId })
      });

      var data = await res.json();

      resetBtn(btn);

      // Erfolg
      if (data && data.success) {
        if (data.isDowngrade) {
          window.cvzShowModal({
            icon: '✅',
            title: 'Downgrade geplant',
            text: 'Dein Plan wird zum ' + data.periodEndFormatted + ' auf ' + (data.message || 'den neuen Plan') + ' geändert.',
          });
        } else {
          window.cvzShowModal({
            icon: '🎉',
            title: 'Plan erfolgreich geändert',
            text: 'Dein neuer Plan ist sofort aktiv. Du wirst zu deinem Dashboard weitergeleitet.',
            confirmLabel: 'Zum Dashboard',
            onConfirm: function() { window.location.href = '/member/dashboard'; }
          });
        }
        return;
      }

      // Kein aktives Abo → erster Kauf, Checkout starten
      if (data && data.error === 'Keine aktive Subscription gefunden') {
        if (priceId) startCheckout(priceId).catch(function(err) { console.error('Checkout Fehler:', err); });
        return;
      }

      // Bereits auf diesem Plan
      if (data && data.error === 'Dieser Plan ist bereits aktiv') {
        window.cvzShowModal({
          icon: 'ℹ️',
          title: 'Plan bereits aktiv',
          text: 'Du nutzt diesen Plan bereits. Wechsle zu einem anderen Plan oder verwalte dein Abonnement in den Einstellungen.',
          confirmLabel: 'Zu den Einstellungen',
          onConfirm: function() { window.location.href = '/member/einstellungen'; }
        });
        return;
      }

      // Jährlich → monatlich Warnung
      if (data && data.error === 'yearly_to_monthly') {
        window.cvzShowModal({
          icon: '⚠️',
          title: 'Wechsel zu monatlichem Plan',
          text: 'Du hast aktuell einen Jahresplan. Ein Wechsel zu monatlich ist erst ab ' + (data.periodEndFormatted || 'Ende des Abrechnungszeitraums') + ' möglich.',
        });
        return;
      }

      // Kein Memberstack → Team-Member ohne Berechtigung
      if (data && data.error === 'Memberstack API Fehler') {
        window.cvzShowMemberModal();
        return;
      }

      // Sonstiger Fehler
      window.cvzShowModal({
        icon: '❌',
        title: 'Fehler beim Plan-Wechsel',
        text: data.error || 'Ein unbekannter Fehler ist aufgetreten. Bitte versuche es erneut oder kontaktiere den Support.',
      });

    } catch (err) {
      console.error('Plan-Wechsel Fehler:', err);
      resetBtn(btn);
      window.cvzShowModal({
        icon: '❌',
        title: 'Verbindungsfehler',
        text: 'Es konnte keine Verbindung zum Server hergestellt werden. Bitte prüfe deine Internetverbindung.',
      });
    }
  }

  async function initPlanButtons() {
    var attempts = 0;
    while (!window.$memberstackDom && attempts < 50) {
      await new Promise(function(r) { setTimeout(r, 100); });
      attempts++;
    }
    if (!window.$memberstackDom) return;

    var member = await window.$memberstackDom.getCurrentMember();
    if (!member?.data?.id) return; // Nicht eingeloggt → normale Links bleiben

    var memberstackId = member.data.id;
    console.log('User eingeloggt:', memberstackId);

    document.querySelectorAll('a[href*="/register?plan="]').forEach(function(btn) {
      btn.dataset.originalText = btn.textContent;

      btn.addEventListener('click', async function(e) {
        e.preventDefault();

        var url        = new URL(btn.href);
        var plan       = url.searchParams.get('plan');
        var billing    = url.searchParams.get('billing') || 'monthly';
        var billingKey = billing === 'annual' ? 'annual' : 'monthly';
        var priceId    = PLAN_DATA[plan]?.[billingKey];

        await handlePlanClick(btn, memberstackId, priceId, plan);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlanButtons);
  } else {
    initPlanButtons();
  }
})();
