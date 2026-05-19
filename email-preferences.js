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

  // ── DOI Pending Hinweis ───────────────────────────────────────────────────────

  function renderDoiPendingHint(memberstackId) {
    if (document.getElementById('cvz-doi-pending')) return;

    var container = document.getElementById('pref-save')?.closest('form')
                 || document.getElementById('pref-save')?.parentElement;
    if (!container) return;

    var hint = document.createElement('div');
    hint.id = 'cvz-doi-pending';
    hint.style.cssText = [
      'margin-top:16px',
      'padding:14px 16px',
      'background:#fffbeb',
      'border:1px solid #fde68a',
      'border-left:3px solid #f59e0b',
      'border-radius:8px',
      'font-size:13px',
      'color:#92400e',
      'line-height:1.6',
    ].join(';');

    var text = document.createElement('p');
    text.style.cssText = 'margin:0 0 10px 0;';
    text.textContent   = 'Bitte bestätige deine Auswahl per E-Mail. Schau kurz in deinen Posteingang.';

    var resendBtn = document.createElement('button');
    resendBtn.type          = 'button';
    resendBtn.textContent   = 'Bestätigungs-E-Mail erneut senden';
    resendBtn.style.cssText = [
      'display:inline-block',
      'padding:8px 16px',
      'background:#f59e0b',
      'color:#ffffff',
      'border:none',
      'border-radius:6px',
      'font-size:13px',
      'font-weight:600',
      'cursor:pointer',
    ].join(';');

    var isSending = false;

    resendBtn.addEventListener('click', async function () {
      if (isSending) return;
      isSending              = true;
      resendBtn.disabled     = true;
      resendBtn.style.opacity = '0.7';
      resendBtn.textContent  = 'Wird gesendet\u2026';

      try {
        var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/resend-doi-email', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ memberstackId }),
        });
        var data = await res.json();
        if (!data.success) throw new Error(data.error || 'Fehler');

        resendBtn.textContent      = '\u2713 E-Mail gesendet';
        resendBtn.style.background = '#10b981';
        resendBtn.style.opacity    = '1';
      } catch (err) {
        console.error('[CVZ] Resend DOI error:', err);
        resendBtn.textContent      = '\u2717 Fehler \u2013 bitte erneut versuchen';
        resendBtn.style.background = '#ef4444';
        resendBtn.style.opacity    = '1';
        setTimeout(function () {
          resendBtn.textContent      = 'Bestätigungs-E-Mail erneut senden';
          resendBtn.style.background = '#f59e0b';
          resendBtn.disabled         = false;
          isSending                  = false;
        }, 3000);
        return;
      }

      isSending = false;
    });

    hint.appendChild(text);
    hint.appendChild(resendBtn);
    container.appendChild(hint);
  }

  function removeDoiPendingHint() {
    var hint = document.getElementById('cvz-doi-pending');
    if (hint) hint.remove();
  }

  // ── Data layer ───────────────────────────────────────────────────────────────

  async function fetchPreferences(memberstackId) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/get-user-billing', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ memberstackId }),
    });
    var json = await res.json();
    return json.data || null;
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

    // Gespeicherte Präferenzen + DOI-Status laden
    var doiConfirmedAt = null;
    var userData = await fetchPreferences(memberstackId);

    if (userData?.email_preferences) {
      setCheckbox('pref-product-updates', userData.email_preferences.product_updates);
      setCheckbox('pref-marketing-tips',  userData.email_preferences.marketing_tips);
    }

    doiConfirmedAt = userData?.doi_confirmed_at || null;

    // DOI pending beim Laden prüfen
    var marketingActive = getCheckbox('pref-product-updates') || getCheckbox('pref-marketing-tips');
    if (marketingActive && !doiConfirmedAt) {
      renderDoiPendingHint(memberstackId);
    }

    // Save-Button registrieren
    var btn = document.getElementById('pref-save');
    if (!btn) return;

    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      setBtnState(btn, 'loading');

      var productUpdates = getCheckbox('pref-product-updates');
      var marketingTips  = getCheckbox('pref-marketing-tips');

      try {
        await savePreferences(memberstackId, {
          product_updates: productUpdates,
          marketing_tips:  marketingTips,
        });
        setBtnState(btn, 'success');
        showSuccessMessage();

        // Hinweis anzeigen oder entfernen
        var nowActive = productUpdates || marketingTips;
        if (nowActive && !doiConfirmedAt) {
          renderDoiPendingHint(memberstackId);
        } else {
          removeDoiPendingHint();
        }
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
