(function () {
  'use strict';

  // ── Konfiguration ────────────────────────────────────────────────────────────

  var CONFIG = {
    supabaseUrl: 'https://zpkifipmyeunorhtepzq.supabase.co',
  };

  // ── Utilities ────────────────────────────────────────────────────────────────

  function retry(fn, maxAttempts, intervalMs) {
    var attempts = 0;
    return new Promise(function (resolve, reject) {
      (function attempt() {
        if (fn()) return resolve();
        if (++attempts >= maxAttempts) return reject(new Error('Max retry attempts reached'));
        setTimeout(attempt, intervalMs);
      })();
    });
  }

  function depsReady() {
    return !!window.$memberstackDom;
  }

  // ── UI helpers ───────────────────────────────────────────────────────────────

  function setBtnState(btn, state) {
    switch (state) {
      case 'loading':
        btn.dataset.originalText = btn.textContent;
        btn.textContent          = 'Wird geladen\u2026';
        btn.style.opacity        = '0.6';
        btn.style.pointerEvents  = 'none';
        break;
      case 'error':
        btn.textContent         = 'Fehler \u2013 nochmal versuchen';
        btn.style.opacity       = '1';
        btn.style.pointerEvents = 'auto';
        break;
      case 'idle':
        btn.textContent         = btn.dataset.originalText || 'Portal öffnen';
        btn.style.opacity       = '1';
        btn.style.pointerEvents = 'auto';
        break;
    }
  }

  // ── Data layer ───────────────────────────────────────────────────────────────

  async function fetchPortalUrl(memberstackId, stripeCustomerId) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/stripe-portal', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ memberstackId, stripeCustomerId }),
    });
    var data = await res.json();
    return data?.url || null;
  }

  // ── App ──────────────────────────────────────────────────────────────────────

  async function run() {
    var btn = document.getElementById('portal-btn');
    if (!btn) return;

    var member           = await window.$memberstackDom.getCurrentMember();
    var memberstackId    = member?.data?.id;
    var stripeCustomerId = member?.data?.stripeCustomerId;

    if (!memberstackId || !stripeCustomerId) {
      console.warn('[CVZ] Portal: kein Member oder Stripe ID');
      return;
    }

    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      setBtnState(btn, 'loading');

      try {
        var url = await fetchPortalUrl(memberstackId, stripeCustomerId);
        if (url) {
          window.location.href = url;
        } else {
          setBtnState(btn, 'error');
        }
      } catch (err) {
        console.error('[CVZ] Portal error:', err);
        setBtnState(btn, 'error');
      }
    });
  }

  function init() {
    retry(depsReady, 30, 300)
      .then(function () { return run(); })
      .catch(function (err) { console.error('[CVZ] Portal init failed:', err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
