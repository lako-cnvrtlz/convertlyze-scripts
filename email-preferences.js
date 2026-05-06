(function () {
  'use strict';

  // ── Konfiguration ────────────────────────────────────────────────────────────

  var CONFIG = {
    supabaseUrl:        'https://zpkifipmyeunorhtepzq.supabase.co',
    requiredCheckboxes: ['pref-analysis', 'pref-account'],
    optionalCheckboxes: ['pref-product-updates', 'pref-marketing-tips'],
    successMsgMs:       3000,
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

  function setCheckbox(id, value) {
    var el = document.getElementById(id);
    if (el) el.checked = !!value;
  }

  function getCheckbox(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }

  function setBtnState(btn, state) {
    switch (state) {
      case 'loading':
        btn.dataset.originalText = btn.value || btn.textContent;
        btn.value                = 'Wird gespeichert\u2026';
        btn.style.opacity        = '0.6';
        btn.style.pointerEvents  = 'none';
        break;
      case 'success':
        btn.value               = btn.dataset.originalText || 'Speichern';
        btn.style.opacity       = '1';
        btn.style.pointerEvents = 'auto';
        break;
      case 'error':
        btn.value               = 'Fehler \u2013 nochmal versuchen';
        btn.style.opacity       = '1';
        btn.style.pointerEvents = 'auto';
        break;
    }
  }

  function showSuccessMessage() {
    var msg = document.getElementById('pref-success');
    if (!msg) return;
    msg.style.display = 'block';
    setTimeout(function () { msg.style.display = 'none'; }, CONFIG.successMsgMs);
  }

  // ── Data layer ───────────────────────────────────────────────────────────────

  async function fetchPreferences(memberstackId) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/get-user-billing', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ memberstackId }),
    });
    var json = await res.json();
    return json.data?.email_preferences || null;
  }

  async function savePreferences(memberstackId, preferences) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/update-email-preferences', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(Object.assign({ memberstackId }, preferences)),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Speichern fehlgeschlagen');
    return data;
  }

  // ── App ──────────────────────────────────────────────────────────────────────

  async function run() {
    // Webflow Form-Submit abfangen
    var form = document.querySelector('form[data-action="save-preferences"]')
            || document.getElementById('pref-save')?.closest('form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); });

    // Erfolgsmeldung initial verstecken
    var msg = document.getElementById('pref-success');
    if (msg) msg.style.display = 'none';

    // Pflicht-Checkboxen sperren – immer checked, nicht klickbar
    CONFIG.requiredCheckboxes.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.checked = true;
      el.addEventListener('click', function (e) { e.preventDefault(); });
    });

    // Member laden
    var member        = await window.$memberstackDom.getCurrentMember();
    var memberstackId = member?.data?.id;
    if (!memberstackId) throw new Error('No member ID');

    // Gespeicherte Präferenzen laden
    var prefs = await fetchPreferences(memberstackId);
    if (prefs) {
      setCheckbox('pref-product-updates', prefs.product_updates);
      setCheckbox('pref-marketing-tips',  prefs.marketing_tips);
    }

    // Save-Button registrieren
    var btn = document.getElementById('pref-save');
    if (!btn) return;

    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      setBtnState(btn, 'loading');

      try {
        await savePreferences(memberstackId, {
          product_updates: getCheckbox('pref-product-updates'),
          marketing_tips:  getCheckbox('pref-marketing-tips'),
        });
        setBtnState(btn, 'success');
        showSuccessMessage();
      } catch (err) {
        console.error('[CVZ] Save preferences error:', err);
        setBtnState(btn, 'error');
      }
    });
  }

  function init() {
    retry(depsReady, 30, 300)
      .then(function () { return run(); })
      .catch(function (err) { console.error('[CVZ] Preferences init failed:', err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
