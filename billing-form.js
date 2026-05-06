(function () {
  'use strict';

  // ── Konfiguration ────────────────────────────────────────────────────────────

  var CONFIG = {
    supabaseUrl: 'https://zpkifipmyeunorhtepzq.supabase.co',
    fields: [
      'billing-salutation',
      'billing-firstname',
      'billing-lastname',
      'billing-company',
      'billing-vat',
      'billing-street',
      'billing-zip',
      'billing-city',
      'billing-country',
    ],
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

  function getFieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function setFieldValue(id, value) {
    var el = document.getElementById(id);
    if (el && value != null) el.value = value;
  }

  function getFormValues() {
    return {
      salutation: getFieldValue('billing-salutation'),
      firstname:  getFieldValue('billing-firstname'),
      lastname:   getFieldValue('billing-lastname'),
      company:    getFieldValue('billing-company'),
      vat_id:     getFieldValue('billing-vat'),
      street:     getFieldValue('billing-street'),
      zip:        getFieldValue('billing-zip'),
      city:       getFieldValue('billing-city'),
      country:    getFieldValue('billing-country'),
    };
  }

  function setBtnState(btn, state) {
    switch (state) {
      case 'loading':
        btn.dataset.originalText = btn.textContent;
        btn.textContent          = 'Wird gespeichert\u2026';
        btn.style.opacity        = '0.6';
        btn.style.pointerEvents  = 'none';
        break;
      case 'success':
        btn.textContent         = 'Gespeichert \u2713';
        btn.style.opacity       = '1';
        btn.style.pointerEvents = 'none';
        setTimeout(function () { setBtnState(btn, 'idle'); }, 2000);
        break;
      case 'error':
        btn.textContent         = 'Fehler \u2013 nochmal versuchen';
        btn.style.opacity       = '1';
        btn.style.pointerEvents = 'auto';
        break;
      case 'idle':
        btn.textContent         = btn.dataset.originalText || 'Speichern';
        btn.style.opacity       = '1';
        btn.style.pointerEvents = 'auto';
        break;
    }
  }

  // ── Data layer ───────────────────────────────────────────────────────────────

  async function fetchBillingData(memberstackId) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/get-user-billing', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey },
      body:    JSON.stringify({ memberstackId }),
    });
    var json = await res.json();
    return json.data || null;
  }

  async function saveBillingData(payload) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/update-billing', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey },
      body:    JSON.stringify(payload),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Speichern fehlgeschlagen');
    return data;
  }

  // ── App ──────────────────────────────────────────────────────────────────────

  async function run() {
    // Member + Token einmal laden
    var member           = await window.$memberstackDom.getCurrentMember();
    var memberstackId    = member?.data?.id;
    var stripeCustomerId = member?.data?.stripeCustomerId;
    if (!memberstackId) throw new Error('No member ID');

    // Billing-Daten laden und Formular befüllen
    var user = await fetchBillingData(memberstackId);
    if (user) {
      setFieldValue('billing-salutation', user.salutation);
      setFieldValue('billing-firstname',  user.firstname);
      setFieldValue('billing-lastname',   user.lastname);
      setFieldValue('billing-company',    user.billing_company);
      setFieldValue('billing-vat',        user.billing_vat_id);
      setFieldValue('billing-street',     user.billing_street);
      setFieldValue('billing-zip',        user.billing_zip);
      setFieldValue('billing-city',       user.billing_city);
      setFieldValue('billing-country',    user.billing_country);
    }

    // Save-Button registrieren
    var btn = document.getElementById('billing-save');
    if (!btn) return;

    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      setBtnState(btn, 'loading');

      try {
        await saveBillingData(
          Object.assign({ memberstackId, stripeCustomerId }, getFormValues())
        );
        setBtnState(btn, 'success');
      } catch (err) {
        console.error('[CVZ] Billing save error:', err);
        setBtnState(btn, 'error');
      }
    });
  }

  function init() {
    retry(depsReady, 30, 300)
      .then(function () { return run(); })
      .catch(function (err) { console.error('[CVZ] Billing init failed:', err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
