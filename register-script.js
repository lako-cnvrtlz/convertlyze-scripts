const SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';
const PORTAL_ENDPOINT   = SUPABASE_URL + '/functions/v1/stripe-portal';

const PLAN_DATA = {
  'starter':     { monthly: { name: 'Starter',    price: '€149/Monat',  priceId: 'prc_starter-monthly-udf40q28'   }, annual: { name: 'Starter',    price: '€1.490/Jahr', priceId: 'prc_starter-yearly-uu680b3d'   } },
  'pro':         { monthly: { name: 'Pro',         price: '€299/Monat',  priceId: 'prc_pro-monthly-9q502rg'        }, annual: { name: 'Pro',         price: '€2.990/Jahr', priceId: 'prc_pro-yearly-l4c0gnw'        } },
  'enterprise':  { monthly: { name: 'Enterprise',  price: '€499/Monat',  priceId: 'prc_enterprise-monthly-ftd0gbp' }, annual: { name: 'Enterprise',  price: '€4.990/Jahr', priceId: 'prc_enterprise-yearly-zv6022j' } },
  'pay-per-use': { monthly: { name: 'Pay-per-Use', price: '€29',         priceId: 'prc_pay-per-use-14750y0n'       }, annual: { name: 'Pay-per-Use', price: '€29',         priceId: 'prc_pay-per-use-14750y0n'       } }
};

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function revealContent() {
  const heroBlock = document.querySelector('.content_hero');
  if (heroBlock) {
    heroBlock.style.transition = 'opacity 0.4s ease';
    heroBlock.style.opacity    = '1';
  }
  document.body.classList.add('content-loaded');
}

// ── Modal ─────────────────────────────────────────────────────────────────────

(function () {
  function createModal() {
    if (document.getElementById('cvz-welcome-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'cvz-welcome-modal';
    overlay.style.cssText = [
      'display:none',
      'position:fixed',
      'inset:0',
      'background:rgba(0,0,0,0.6)',
      'z-index:9999',
      'align-items:center',
      'justify-content:center',
      'backdrop-filter:blur(4px)'
    ].join(';');

    const box = document.createElement('div');
    box.id = 'cvz-welcome-modal-box';
    box.style.cssText = [
      'background:#0d1117',
      'border:1px solid #2d3748',
      'border-radius:12px',
      'padding:32px',
      'max-width:440px',
      'width:90%',
      'text-align:center',
      'font-family:Geist,sans-serif'
    ].join(';');

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
  }

  function showModal(cfg) {
    const overlay = document.getElementById('cvz-welcome-modal');
    const box     = document.getElementById('cvz-welcome-modal-box');
    if (!overlay || !box) return;

    box.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent   = cfg.title || '';
    title.style.cssText = 'color:#e8edf5;font-size:18px;font-weight:600;margin:0 0 10px;';

    const text = document.createElement('p');
    text.textContent   = cfg.text || '';
    text.style.cssText = 'color:#8b98a5;font-size:14px;line-height:1.6;margin:0 0 24px;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;';

    if (!cfg.hideClose) {
      const closeBtn = document.createElement('button');
      closeBtn.textContent   = cfg.closeLabel || 'Schließen';
      closeBtn.style.cssText = 'background:#252d3d;color:#e8edf5;border:1px solid #2a3550;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:500;cursor:pointer;';
      closeBtn.addEventListener('click', function () {
        closeModal();
        if (typeof cfg.onClose === 'function') cfg.onClose();
      });
      btnRow.appendChild(closeBtn);
    }

    (cfg.buttons || []).forEach(function (btnCfg) {
      const btn = document.createElement('button');
      btn.textContent   = btnCfg.label;
      btn.style.cssText = btnCfg.primary
        ? 'background:#4fd1c5;color:#0d1117;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;'
        : 'background:#252d3d;color:#e8edf5;border:1px solid #2a3550;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:500;cursor:pointer;';
      btn.addEventListener('click', function () {
        closeModal();
        if (typeof btnCfg.onClick === 'function') btnCfg.onClick();
      });
      btnRow.appendChild(btn);
    });

    box.appendChild(title);
    box.appendChild(text);
    box.appendChild(btnRow);

    overlay.style.display = 'flex';
  }

  function closeModal() {
    const modal = document.getElementById('cvz-welcome-modal');
    if (modal) modal.style.display = 'none';
  }

  window.cvzWelcomeModal    = { show: showModal, close: closeModal };
  window.cvzShowModal       = showModal;
  window.cvzCloseModal      = closeModal;
  window.cvzShowMemberModal = function () {
    showModal({
      title: 'Keine Berechtigung',
      text:  'Plan-Änderungen können nur vom Account-Inhaber vorgenommen werden. Wende dich an deinen Administrator.',
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createModal);
  } else {
    createModal();
  }
})();

// ── Supabase: User laden ──────────────────────────────────────────────────────

async function fetchUserFast(memberstackId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, firstname, owner_user_id, current_price_id, email')
    .eq('memberstack_id', memberstackId)
    .single();
  if (data) return data;
  if (error) console.warn('⚠️ fetchUserFast error:', error);
  return null;
}

async function fetchUserWithSmartRetry(memberstackId) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data, error } = await supabase
      .from('users')
      .select('id, firstname, owner_user_id, current_price_id, email')
      .eq('memberstack_id', memberstackId)
      .single();
    if (data) return data;
    if (error) console.warn(`⚠️ Versuch ${attempt} error:`, error);
    if (attempt < 5) await sleep(1500);
  }
  return null;
}

// ── Supabase: pending_checkout ────────────────────────────────────────────────

async function getPendingCheckout(email) {
  if (!email) return null;
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/pending_checkouts?email=eq.' + encodeURIComponent(email) + '&limit=1',
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
    );
    const data = await res.json();
    return data?.[0] || null;
  } catch (e) {
    console.warn('[CVZ] pending_checkout lesen Fehler:', e);
    return null;
  }
}

async function deletePendingCheckout(email) {
  if (!email) return;
  try {
    await fetch(
      SUPABASE_URL + '/rest/v1/pending_checkouts?email=eq.' + encodeURIComponent(email),
      {
        method:  'DELETE',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
      }
    );
  } catch (e) {
    console.warn('[CVZ] pending_checkout löschen Fehler:', e);
  }
}

// ── Stripe Portal ─────────────────────────────────────────────────────────────

async function openStripePortal(memberstackId) {
  try {
    const res  = await fetch(PORTAL_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body:    JSON.stringify({ memberstackId })
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      cvzShowModal({
        title: 'Portal nicht erreichbar',
        text:  'Das Abrechnungsportal konnte nicht geöffnet werden. Bitte versuche es erneut oder kontaktiere den Support.',
      });
    }
  } catch (e) {
    console.error('[CVZ] Portal Fehler:', e);
    cvzShowModal({
      title: 'Verbindungsfehler',
      text:  'Es konnte keine Verbindung zum Server hergestellt werden. Bitte prüfe deine Internetverbindung.',
    });
  }
}

// ── UI-Hilfsfunktionen ────────────────────────────────────────────────────────

function applyPlanData(plan) {
  if (!plan) return;

  const planInfoEl = document.querySelector('[data-welcome="plan-info"]');
  if (planInfoEl) planInfoEl.textContent = `Du hast dich für den ${plan.name}-Plan interessiert · ${plan.price}`;

  const buyBtn = document.querySelector('[data-welcome="buy-btn"]');
  if (buyBtn) {
    buyBtn.setAttribute('data-ms-price:update', plan.priceId);
    buyBtn.setAttribute('data-ms-modal', 'checkout');
    buyBtn.style.display = 'flex';
    const buyLabel = buyBtn.querySelector('[data-welcome="buy-label"]');
    if (buyLabel) buyLabel.textContent = `${plan.name} kaufen – ${plan.price}`;
  }

  const planBox = document.querySelector('[data-welcome="plan-box"]');
  if (planBox) planBox.style.display = 'block';
}

function hidePlanSection() {
  ['[data-welcome="buy-btn"]', '[data-welcome="free-btn"]',
   '[data-welcome="plan-box"]', '[data-welcome="plan-info"]'].forEach(function (sel) {
    const el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  });
  const noPlanSection = document.querySelector('[data-welcome="no-plan"]');
  if (noPlanSection) noPlanSection.style.display = 'block';
}

function setFirstName(firstname) {
  const el = document.querySelector('[data-welcome="firstname"]');
  if (el) el.textContent = (firstname || 'Member') + '!';
}

// ── Hauptlogik ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function () {
  const heroBlock = document.querySelector('.content_hero');
  if (heroBlock) heroBlock.style.opacity = '0';

  try {
    let memberstackId = null;
    let memberEmail   = null;
    try {
      if (window.$memberstackDom) {
        const member = await window.$memberstackDom.getCurrentMember();
        memberstackId = member?.data?.id || null;
        memberEmail   = member?.data?.auth?.email || member?.data?.email || null;
      }
    } catch (e) {
      console.error('[CVZ] Memberstack Fehler:', e);
    }

    let currentUser = null;
    if (memberstackId && typeof supabase !== 'undefined') {
      currentUser = await fetchUserFast(memberstackId);
      if (!currentUser) currentUser = await fetchUserWithSmartRetry(memberstackId);
    }

    const email = currentUser?.email || memberEmail;

    setFirstName(currentUser?.firstname || '');

    // ── State 1: Team-Member ─────────────────────────────────────────────────
    if (currentUser?.owner_user_id) {
      hidePlanSection();
      revealContent();

      cvzShowModal({
        title:      'Du bist als Team-Member eingeladen',
        text:       'Plan-Buchungen sind nur für Account-Inhaber möglich. Starte direkt deine erste Analyse, oder prüfe, welche Landingpages dein Team bereits analysiert hat.',
        closeLabel: 'Schließen',
        buttons: [
          {
            label:   'Zum Dashboard →',
            primary: false,
            onClick: function () { window.location.href = '/member/dashboard'; }
          },
          {
            label:   'Analyse starten →',
            primary: true,
            onClick: function () { window.location.href = '/member/analyse'; }
          }
        ]
      });

      return;
    }

    // ── State 2: Aktiver Plan vorhanden ──────────────────────────────────────
    if (currentUser?.current_price_id) {
      hidePlanSection();
      revealContent();

      cvzShowModal({
        title:      'Du hast bereits einen aktiven Plan',
        text:       'Möchtest du deinen Plan ändern oder deine Abrechnung verwalten? Das kannst du direkt im Kundenportal erledigen.',
        closeLabel: 'Zum Dashboard',
        onClose:    function () { window.location.href = '/member/dashboard'; },
        buttons: [
          {
            label:   'Abrechnung verwalten →',
            primary: true,
            onClick: function () { openStripePortal(memberstackId); }
          }
        ]
      });

      return;
    }

    // ── State 3: Neuer User – kein Modal, Plan-Section sichtbar ─────────────
    let planKey = getParam('plan');
    let billing = getParam('billing') || 'monthly';

    if (!planKey && email) {
      const pending = await getPendingCheckout(email);
      if (pending) {
        planKey = pending.plan;
        billing = pending.billing || 'monthly';
        await deletePendingCheckout(email);
      }
    }

    const planVariants = PLAN_DATA[planKey] || null;
    const plan         = planVariants ? (planVariants[billing] || planVariants.monthly) : null;

    if (plan) {
      applyPlanData(plan);
    } else {
      hidePlanSection();
    }

    revealContent();

  } catch (err) {
    console.error('[CVZ] Fehler:', err);
    setFirstName('');
    revealContent();
  }
});
