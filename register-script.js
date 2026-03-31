(function() {
  const PLAN_LABELS = {
    'starter':     { headline: 'Starter-Plan freischalten',    sub: 'Erstelle deinen Account und starte sofort.' },
    'pro':         { headline: 'Pro-Plan freischalten',        sub: 'Erstelle deinen Account und starte sofort.' },
    'enterprise':  { headline: 'Enterprise-Plan freischalten', sub: 'Erstelle deinen Account und starte sofort.' },
    'pay-per-use': { headline: 'Analyse freischalten',         sub: 'Erstelle deinen Account und starte sofort.' }
  };
  const DEFAULT = {
    headline: 'Kostenlos starten.',
    sub: 'Erhalte deinen kostenlosen CRO-Report und sieh sofort, wo du Conversions verlierst.'
  };
  const INVITE_LABEL = {
    headline: 'Team-Einladung annehmen',
    sub: 'Erstelle deinen Account und tritt dem Team bei.'
  };
  const PRICE_IDS = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
    'pay-per-use': { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      }
  };

  var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

  function initRegisterPage() {
    const params     = new URLSearchParams(window.location.search);
    const plan       = params.get('plan');
    const billing    = params.get('billing') || 'monthly';
    const inviteToken = params.get('invite');
    const inviteEmail = params.get('email');

    // ── Invite-Token speichern ──
    if (inviteToken) {
      sessionStorage.setItem('invite_token', inviteToken);
      sessionStorage.setItem('invite_email', inviteEmail || '');
    }

    // ── Plan in sessionStorage speichern ──
    if (plan) {
      sessionStorage.setItem('selected_plan', plan);
      sessionStorage.setItem('selected_billing', billing);
    }

    // ── Headline und Subline setzen ──
    const label      = inviteToken ? INVITE_LABEL : (PLAN_LABELS[plan] || DEFAULT);
    const headlineEl = document.querySelector('[data-register="headline"]');
    const subEl      = document.querySelector('[data-register="subline"]');
    if (headlineEl) headlineEl.textContent = label.headline;
    if (subEl)      subEl.textContent      = label.sub;

    // ── E-Mail vorausfüllen bei Einladung ──
    if (inviteEmail) {
      var emailInput = document.querySelector('input[type="email"]');
      if (emailInput) {
        emailInput.value = decodeURIComponent(inviteEmail);
        emailInput.readOnly = true;
        emailInput.style.backgroundColor = '#f3f4f6';
        emailInput.style.cursor = 'not-allowed';
      }
    }

    // ── Trust-Signale ──
    const trustEl = document.querySelector('[data-register="trust"]');
    if (trustEl) {
      trustEl.innerHTML = '✓ Keine Kreditkarte &nbsp;·&nbsp; ✓ DSGVO-konform &nbsp;·&nbsp; ✓ Sofort loslegen';
    }

    // ── Nach Signup ──
    window.addEventListener('memberstack:signup:success', async function() {
      const savedInviteToken = sessionStorage.getItem('invite_token');
      const savedPlan        = sessionStorage.getItem('selected_plan');
      const savedBilling     = sessionStorage.getItem('selected_billing') || 'monthly';
      const priceId          = PRICE_IDS[savedPlan]?.[savedBilling];

      // ── Invite annehmen falls Token vorhanden ──
      if (savedInviteToken) {
        sessionStorage.removeItem('invite_token');
        sessionStorage.removeItem('invite_email');

        try {
          var member = await window.$memberstackDom.getCurrentMember();
          var memberstackId = member?.data?.id;

          if (memberstackId) {
            var response = await fetch(SUPABASE_URL + '/functions/v1/accept-team-invite', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
              },
              body: JSON.stringify({
                token: savedInviteToken,
                memberstack_id: memberstackId
              })
            });

            var data = await response.json();

            if (data.success) {
              window.location.href = '/member/dashboard';
              return;
            } else {
              console.error('Invite annehmen fehlgeschlagen:', data.error);
            }
          }
        } catch (err) {
          console.error('Invite error:', err);
        }

        // Fallback wenn Invite fehlschlägt
        window.location.href = '/member/dashboard';
        return;
      }

      // ── Normaler Checkout ──
      if (priceId) {
        window.$memberstackDom.purchasePlansWithCheckout({ priceId: priceId });
      } else {
        window.location.href = '/willkommen';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRegisterPage);
  } else {
    initRegisterPage();
  }
})();
