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
  var PORTAL_ENDPOINT   = SUPABASE_URL + '/functions/v1/stripe-portal';

  var PLAN_DATA = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      }
  };

  // FIX: priceIds als Array von Objekten statt einzelner priceId-String
  function startCheckout(priceId) {
    console.log('[CVZ] startCheckout aufgerufen mit priceId:', priceId);
    return window.$memberstackDom.purchasePlansWithCheckout({
      priceIds:   [{ id: priceId }],
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

  async function handlePlanClick(btn, memberstackId, priceId) {
    console.log('[CVZ] handlePlanClick → memberstackId:', memberstackId, '| priceId:', priceId);

    if (!priceId) {
      console.error('[CVZ] Kein priceId ermittelt – Plan oder Billing-Key fehlt im PLAN_DATA.');
      window.cvzShowModal({
        icon: '❌',
        title: 'Konfigurationsfehler',
        text: 'Für diesen Plan konnte kein Preis ermittelt werden. Bitte kontaktiere den Support.',
      });
      return;
    }

    setBtnLoading(btn);

    try {
      // Supabase: hat User aktiven Plan?
      var dbRes = await fetch(
        SUPABASE_URL + '/rest/v1/users?select=current_price_id&memberstack_id=eq.' + memberstackId,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
      );
      var users = await dbRes.json();
      console.log('[CVZ] Supabase User-Response:', users);

      var hasActivePlan = users?.[0]?.current_price_id;
      console.log('[CVZ] current_price_id:', hasActivePlan, '→', hasActivePlan ? 'Portal-Flow' : 'Checkout-Flow');

      if (hasActivePlan) {
        // Bestehender Plan → Customer Portal für Plan-Wechsel
        var portalRes = await fetch(PORTAL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ memberstackId: memberstackId })
        });
        var portalData = await portalRes.json();
        console.log('[CVZ] Portal-Response:', portalData);

        if (portalData.url) {
          window.location.href = portalData.url;
          return;
        }

        // Portal-Fehler
        resetBtn(btn);
        window.cvzShowModal({
          icon: '❌',
          title: 'Fehler beim Öffnen',
          text: 'Das Abrechnungsportal konnte nicht geöffnet werden. Bitte versuche es erneut oder kontaktiere den Support.',
        });

      } else {
        // Kein aktiver Plan → Stripe Checkout via Memberstack
        resetBtn(btn);
        startCheckout(priceId).catch(function(err) {
          // Erweitertes Fehler-Logging
          console.error('[CVZ] Checkout Fehler (raw):', err);
          console.error('[CVZ] Checkout Fehler message:', err?.message);
          console.error('[CVZ] Checkout Fehler status:', err?.status);
          console.error('[CVZ] Checkout Fehler body:', err?.body);
          console.error('[CVZ] Checkout Fehler JSON:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
        });
      }

    } catch (err) {
      console.error('[CVZ] handlePlanClick Exception:', err);
      console.error('[CVZ] Exception message:', err?.message);
      console.error('[CVZ] Exception JSON:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
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
    if (!window.$memberstackDom) {
      console.warn('[CVZ] $memberstackDom nicht gefunden nach 5s.');
      return;
    }

    var member = await window.$memberstackDom.getCurrentMember();
    console.log('[CVZ] getCurrentMember:', member?.data?.id || 'nicht eingeloggt');
    if (!member?.data?.id) return; // Nicht eingeloggt → normale Links bleiben

    var memberstackId = member.data.id;

    document.querySelectorAll('a[href*="/register?plan="]').forEach(function(btn) {
      btn.dataset.originalText = btn.textContent;

      btn.addEventListener('click', async function(e) {
        e.preventDefault();

        var url        = new URL(btn.href);
        var plan       = url.searchParams.get('plan');
        var billing    = url.searchParams.get('billing') || 'monthly';
        var billingKey = billing === 'annual' ? 'annual' : 'monthly';
        var priceId    = PLAN_DATA[plan]?.[billingKey];

        console.log('[CVZ] Button geklickt → plan:', plan, '| billing:', billingKey, '| priceId:', priceId);

        await handlePlanClick(btn, memberstackId, priceId);
      });
    });

    console.log('[CVZ] Plan-Buttons initialisiert für User:', memberstackId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlanButtons);
  } else {
    initPlanButtons();
  }
})();
