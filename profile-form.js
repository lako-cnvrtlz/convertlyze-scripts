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

  function setFieldValue(id, value) {
    var el = document.getElementById(id);
    if (el && value != null) el.value = value;
  }

  function getFieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function getBtnText(btn) {
    return btn.tagName === 'INPUT' ? btn.value : btn.textContent;
  }

  function setBtnText(btn, text) {
    if (btn.tagName === 'INPUT') btn.value = text;
    else btn.textContent = text;
  }

  function setBtnState(btn, state) {
    switch (state) {
      case 'loading':
        btn.dataset.originalText = getBtnText(btn);
        setBtnText(btn, 'Wird gespeichert…');
        btn.style.opacity        = '0.6';
        btn.style.pointerEvents  = 'none';
        break;
      case 'success':
        setBtnText(btn, 'Änderungen gespeichert ✓');
        btn.style.opacity       = '1';
        btn.style.pointerEvents = 'none';
        setTimeout(function () { setBtnState(btn, 'idle'); }, 2000);
        break;
      case 'error':
        setBtnText(btn, 'Fehler – nochmal versuchen');
        btn.style.opacity       = '1';
        btn.style.pointerEvents = 'auto';
        break;
      case 'idle':
        setBtnText(btn, btn.dataset.originalText || 'Speichern');
        btn.style.opacity       = '1';
        btn.style.pointerEvents = 'auto';
        break;
    }
  }


  // ── Data layer ───────────────────────────────────────────────────────────────

  async function saveProfile(memberstackId, formData) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/update-profile', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(Object.assign({ memberstackId }, formData)),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Speichern fehlgeschlagen');
    return data;
  }

  // ── App ──────────────────────────────────────────────────────────────────────

  async function run() {
    var member        = await window.$memberstackDom.getCurrentMember();
    var memberstackId = member?.data?.id;
    if (!memberstackId) throw new Error('No member ID');

    var email        = member?.data?.auth?.email || '';
    var customFields = member?.data?.customFields || {};

    // Formular befüllen
    setFieldValue('profile-salutation', customFields.salutation);
    setFieldValue('profile-firstname',  customFields['first-name']);
    setFieldValue('profile-lastname',   customFields['last-name']);

    // E-Mail als read-only setzen
    var emailField = document.getElementById('profile-email');
    if (emailField) {
      emailField.value    = email;
      emailField.readOnly = true;
      emailField.style.cssText += ';opacity:1!important;cursor:not-allowed;background-color:#1a2234;color:#e8edf5';
    }

    // Save-Button registrieren
    var btn = document.getElementById('profile-save');
    if (!btn) return;

    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      setBtnState(btn, 'loading');

      try {
        await saveProfile(memberstackId, {
          salutation: getFieldValue('profile-salutation'),
          firstname:  getFieldValue('profile-firstname'),
          lastname:   getFieldValue('profile-lastname'),
        });
        setBtnState(btn, 'success');
      } catch (err) {
        console.error('[CVZ] Profile save error:', err);
        setBtnState(btn, 'error');
      }
    });
  }

  function init() {
    retry(depsReady, 30, 300)
      .then(function () { return run(); })
      .catch(function (err) { console.error('[CVZ] Profile init failed:', err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
