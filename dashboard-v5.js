<script>
(function() {
  var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

  var PLAN_NAMES = {
    'starter':    'Starter',
    'pro':        'Pro',
    'enterprise': 'Enterprise'
  };

  var PRICE_IDS = {
    'starter':     { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
    'pro':         { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
    'enterprise':  { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' }
  };

  var PLAN_CREDITS = {
    'starter':   '10 Analysen',
    'pro':       '25 Analysen',
    'enterprise': '30 Analysen'
  };

  // ── Modal anzeigen ─────────────────────────────────────────────────────────
  function showUpgradeModal(plan, billing, priceId) {
    var planName   = PLAN_NAMES[plan]   || plan;
    var credits    = PLAN_CREDITS[plan] || '';
    var billingText = billing === 'annual' ? 'jährlich' : 'monatlich';

    var modal = document.createElement('div');
    modal.id = 'cvz-upgrade-modal';
    modal.style.cssText = 'display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:9999; align-items:center; justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff; border-radius:12px; padding:40px 32px; max-width:480px; width:90%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.2);">
        <h3 style="margin:0 0 12px; font-size:22px; color:#0d1117;">Du hast den ${planName}-Plan gewählt</h3>
        <p style="margin:0 0 8px; color:#555; line-height:1.6;">Schalte jetzt <strong>${credits} pro Monat</strong> frei und optimiere deine Landingpages mit KI.</p>
        <p style="margin:0 0 28px; color:#888; font-size:14px;">Abrechnung ${billingText} – jederzeit kündbar.</p>
        <div style="display:flex; gap:12px; justify-content:center;">
          <button id="cvz-upgrade-confirm" style="background:#4fd1c5; color:#0d1117; border:none; border-radius:8px; padding:14px 28px; cursor:pointer; font-size:15px; font-weight:600;">Jetzt upgraden</button>
          <button id="cvz-upgrade-dismiss" style="background:#f1f5f9; color:#555; border:none; border-radius:8px; padding:14px 28px; cursor:pointer; font-size:15px;">Später</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('cvz-upgrade-confirm').addEventListener('click', async function() {
      try {
        await window.$memberstackDom.purchasePlansWithCheckout({
          priceIds:   [{ id: priceId }],
          successUrl: window.location.origin + '/member/danke'
        });
      } catch(err) {
        console.error('[CVZ] ❌ Checkout Fehler:', err);
      }
    });

    document.getElementById('cvz-upgrade-dismiss').addEventListener('click', function() {
      modal.remove();
    });

    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });
  }

  // ── Pending Checkout aus Supabase laden ───────────────────────────────────
  async function getPendingCheckout(email) {
    try {
      var res = await fetch(
        SUPABASE_URL + '/rest/v1/pending_checkouts?email=eq.' + encodeURIComponent(email) + '&limit=1',
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
      );
      var data = await res.json();
      return data?.[0] || null;
    } catch(err) {
      console.error('[CVZ] ❌ pending_checkout laden fehlgeschlagen:', err);
      return null;
    }
  }

  // ── Pending Checkout löschen ──────────────────────────────────────────────
  async function deletePendingCheckout(email) {
    try {
      await fetch(
        SUPABASE_URL + '/rest/v1/pending_checkouts?email=eq.' + encodeURIComponent(email),
        {
          method: 'DELETE',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
        }
      );
      console.log('[CVZ] ✅ pending_checkout gelöscht');
    } catch(err) {
      console.error('[CVZ] ❌ pending_checkout löschen fehlgeschlagen:', err);
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    var memberstackReady = !!window.$memberstackDom;
    if (!memberstackReady) {
      setTimeout(init, 300);
      return;
    }

    try {
      var result = await window.$memberstackDom.getCurrentMember();
      var memberstackId = result?.data?.id;
      if (!memberstackId) return;

      var email = result?.data?.auth?.email;
      if (!email) return;

      // URL-Parameter prüfen (Login-Flow)
      var urlParams  = new URLSearchParams(window.location.search);
      var urlPlan    = urlParams.get('plan');
      var urlBilling = urlParams.get('billing') || 'monthly';

      var plan    = urlPlan;
      var billing = urlBilling;

      // Supabase pending_checkout prüfen (Signup-Flow)
      if (!plan) {
        var pending = await getPendingCheckout(email);
        if (pending) {
          plan    = pending.plan;
          billing = pending.billing || 'monthly';
          console.log('[CVZ] pending_checkout gefunden:', plan, billing);
        }
      }

      if (!plan) {
        console.log('[CVZ] Kein pending Plan – kein Modal');
        return;
      }

      // Pending Checkout löschen
      await deletePendingCheckout(email);

      // Prüfen ob User bereits einen aktiven Plan hat
      var dbRes = await fetch(
        SUPABASE_URL + '/rest/v1/users?select=current_price_id&memberstack_id=eq.' + memberstackId,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
      );
      var users = await dbRes.json();
      var hasActivePlan = users?.[0]?.current_price_id;

      if (hasActivePlan) {
        console.log('[CVZ] User hat bereits aktiven Plan – kein Modal');
        return;
      }

      var billingKey = billing === 'annual' ? 'annual' : 'monthly';
      var priceId    = PRICE_IDS[plan]?.[billingKey];

      if (!priceId) {
        console.log('[CVZ] Kein priceId für Plan:', plan);
        return;
      }

      console.log('[CVZ] Zeige Upgrade-Modal für:', plan, billing);
      showUpgradeModal(plan, billing, priceId);

    } catch(e) {
      console.error('[CVZ] Dashboard-Modal Fehler:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[CVZ] Dashboard-Modal-Script geladen');
})();
</script>
