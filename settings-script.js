(function () {
  'use strict';

  // ── Konfiguration ────────────────────────────────────────────────────────────

  var CONFIG = {
    supabaseUrl:     'https://zpkifipmyeunorhtepzq.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU',
    teamPlans:       ['Starter', 'Pro', 'Professional', 'Enterprise'],
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
    return !!window.$memberstackDom && document.querySelectorAll('form').length > 0;
  }

  // ── Data layer ───────────────────────────────────────────────────────────────

  async function getCurrentMember() {
    var result = await window.$memberstackDom.getCurrentMember();
    if (!result?.data) throw new Error('No member data');
    return {
      id:    result.data.id,
      email: result.data.auth?.email || result.data.email || '',
    };
  }

  async function fetchUserBilling(memberstackId) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/get-user-billing', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ memberstackId }),
    });
    var json = await res.json();
    return json.data || null;
  }

  async function updateProfile(memberstackId, formData) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/update-profile', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ memberstackId, ...formData }),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Update fehlgeschlagen');
    return data;
  }

  async function updateEmailPreferences(memberstackId, preferences) {
    var res = await fetch(CONFIG.supabaseUrl + '/functions/v1/update-email-preferences', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ memberstackId, ...preferences }),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Speichern fehlgeschlagen');
    return data;
  }

  // ── UI layer ─────────────────────────────────────────────────────────────────

  function getBtnText(btn) {
    return btn.tagName === 'INPUT' ? btn.value : btn.textContent;
  }

  function setBtnText(btn, text) {
    if (btn.tagName === 'INPUT') btn.value = text;
    else btn.textContent = text;
  }

  function setBtnState(btn, state, label) {
    switch (state) {
      case 'loading':
        btn.dataset.originalText = getBtnText(btn);
        btn.dataset.originalBg   = btn.style.backgroundColor;
        btn.dataset.originalColor = btn.style.color;
        setBtnText(btn, label || 'Wird gespeichert\u2026');
        btn.disabled            = true;
        btn.style.opacity       = '0.7';
        break;
      case 'success':
        setBtnText(btn, label || '\u2713 Gespeichert!');
        btn.style.backgroundColor = '#10b981';
        btn.style.color           = '#ffffff';
        break;
      case 'error':
        setBtnText(btn, label || '\u2717 Fehler');
        btn.style.backgroundColor = '#ef4444';
        btn.style.color           = '#ffffff';
        break;
      case 'idle':
        setBtnText(btn, btn.dataset.originalText || getBtnText(btn));
        btn.style.backgroundColor = btn.dataset.originalBg   || '';
        btn.style.color           = btn.dataset.originalColor || '';
        btn.style.opacity         = '';
        btn.disabled              = false;
        break;
    }
  }

  function resetBtnAfter(btn, ms) {
    setTimeout(function () { setBtnState(btn, 'idle'); }, ms || 2000);
  }

  function showToast(type, message) {
    if (typeof window.cvzShowToast === 'function') {
      window.cvzShowToast(type, message);
    } else {
      console.warn('[CVZ] Toast not available:', type, message);
    }
  }

  // ── Profile form ─────────────────────────────────────────────────────────────

  async function initProfileForm(member) {
    var form = document.querySelector('[data-profile-form]')
            || document.querySelector('#profile-form')
            || document.querySelector('form');
    if (!form) return;

    var submitBtn = document.getElementById('submit')
                 || form.querySelector('[type="submit"]')
                 || form.querySelector('button');
    if (!submitBtn) return;

    // E-Mail als read-only prefüllen
    var emailInput = form.querySelector('input[type="email"]');
    if (emailInput && member.email) {
      emailInput.value           = member.email;
      emailInput.readOnly        = true;
      emailInput.style.cssText  += ';background-color:#f3f4f6;cursor:not-allowed;opacity:0.7';
    }

    // Submit nur einmal registrieren – auf form, nicht zusätzlich auf button
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      e.stopPropagation();

      // Felder per data-Attribut oder Fallback per Position
      var salutationEl = form.querySelector('[name="salutation"], select');
      var firstnameEl  = form.querySelector('[name="firstname"]') || form.querySelectorAll('input[type="text"], input:not([type])')[0];
      var lastnameEl   = form.querySelector('[name="lastname"]')  || form.querySelectorAll('input[type="text"], input:not([type])')[1];

      var formData = {
        salutation: salutationEl?.value || '',
        firstname:  firstnameEl?.value  || '',
        lastname:   lastnameEl?.value   || '',
      };

      if (!formData.firstname || !formData.lastname) {
        showToast('error', 'Vorname und Nachname sind erforderlich.');
        return;
      }

      setBtnState(submitBtn, 'loading');

      try {
        await updateProfile(member.id, formData);
        setBtnState(submitBtn, 'success');
        resetBtnAfter(submitBtn);
      } catch (err) {
        console.error('[CVZ] Profile update error:', err);
        setBtnState(submitBtn, 'error');
        showToast('error', 'Fehler beim Speichern: ' + err.message);
        resetBtnAfter(submitBtn);
      }
    });
  }

  // ── Preferences form ─────────────────────────────────────────────────────────

  async function initPreferencesForm(member) {
    // Preferences-Formular: hat Checkboxes und einen #save-preferences Button
    var form = Array.from(document.querySelectorAll('form')).find(function (f) {
      return f.querySelectorAll('input[type="checkbox"]').length >= 4
          && f.querySelector('#save-preferences') !== null;
    });
    if (!form) return;

    var checkboxes = Array.from(form.querySelectorAll('input[type="checkbox"]'));
    var map = {
      analysis:  checkboxes[checkboxes.length - 4],
      account:   checkboxes[checkboxes.length - 3],
      updates:   checkboxes[checkboxes.length - 2],
      marketing: checkboxes[checkboxes.length - 1],
    };

    var saveBtn = form.querySelector('#save-preferences') || form.querySelector('[type="submit"]');
    if (!saveBtn) return;

    form.style.opacity    = '0';
    form.style.transition = 'opacity 0.3s ease-in';

    // Gespeicherte Präferenzen laden
    try {
      var user = await fetchUserBilling(member.id);
      if (user?.email_preferences) {
        map.analysis.checked  = user.email_preferences.analysis_notifications ?? true;
        map.account.checked   = user.email_preferences.account_notifications  ?? true;
        map.updates.checked   = user.email_preferences.product_updates        ?? false;
        map.marketing.checked = user.email_preferences.marketing_tips         ?? false;
      }
    } catch (err) {
      console.warn('[CVZ] Load preferences error:', err);
    }

    form.style.opacity = '1';

    var isSaving = false;

    async function savePreferences() {
      if (isSaving) return;
      isSaving = true;
      setBtnState(saveBtn, 'loading');

      try {
        await updateEmailPreferences(member.id, {
          product_updates: map.updates.checked,
          marketing_tips:  map.marketing.checked,
        });
        setBtnState(saveBtn, 'success');
        resetBtnAfter(saveBtn, 2000);
      } catch (err) {
        console.error('[CVZ] Save preferences error:', err);
        setBtnState(saveBtn, 'error');
        showToast('error', 'Fehler beim Speichern: ' + err.message);
        resetBtnAfter(saveBtn, 2000);
      } finally {
        isSaving = false;
      }
    }

    saveBtn.addEventListener('click',  function (e) { e.preventDefault(); e.stopPropagation(); savePreferences(); });
    form.addEventListener('submit',    function (e) { e.preventDefault(); e.stopPropagation(); savePreferences(); });
  }

  // ── Team section ─────────────────────────────────────────────────────────────

  async function initTeamSection(member) {
    try {
      var user     = await fetchUserBilling(member.id);
      if (!user) return;

      var isOwner  = !user.owner_user_id;
      var hasTeam  = isOwner && CONFIG.teamPlans.indexOf(user.license_type) !== -1;

      var teamBtn     = document.getElementById('open-team-modal');
      var teamSection = document.getElementById('team-section');
      if (teamBtn)     teamBtn.style.display     = hasTeam ? '' : 'none';
      if (teamSection) teamSection.style.display = hasTeam ? '' : 'none';
    } catch (err) {
      console.warn('[CVZ] initTeamSection error:', err);
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  async function run() {
    // Member einmal laden – ID an alle Sektionen weitergeben
    var member = await getCurrentMember();

    // Parallel initialisieren – fetchUserBilling wird intern je einmal pro Sektion aufgerufen
    // Team und Preferences teilen sich denselben Billing-Call nicht, aber beide sind fire-and-forget
    await Promise.all([
      initProfileForm(member),
      initPreferencesForm(member),
      initTeamSection(member),
    ]);
  }

  function init() {
    retry(depsReady, 30, 300)
      .then(function () { return run(); })
      .catch(function (err) { console.error('[CVZ] Settings init failed:', err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
