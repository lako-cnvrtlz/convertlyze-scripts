<!-- Webflow Custom Code für Settings-Seite (Profil + E-Mail-Präferenzen) -->
<!-- Füge diesen Code in Page Settings → Before </body> tag ein -->

<script>
(function() {
  console.log('🚀 Settings Page Script loaded');

  const SUPABASE_URL     = 'https://zpkifipmyeunorhtepzq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

  // ==================== HELPER: GET MEMBER DATA ====================
  async function getMemberData() {
    try {
      const memberstack = window.$memberstackDom;
      if (!memberstack) throw new Error('Memberstack not loaded');
      await new Promise(resolve => setTimeout(resolve, 500));
      const member = await memberstack.getCurrentMember();
      if (!member?.data) throw new Error('No member data');
      return member.data;
    } catch (error) {
      console.error('❌ Member auth failed:', error);
      throw error;
    }
  }

  // ==================== HELPER: SET BUTTON TEXT ====================
  function setBtnText(btn, text) {
    if (btn.value !== undefined && btn.value !== '') {
      btn.value = text;
    } else {
      btn.textContent = text;
    }
  }

  function getBtnText(btn) {
    return (btn.value !== undefined && btn.value !== '') ? btn.value : btn.textContent;
  }

  // ==================== TEAM SECTION VISIBILITY ====================
  async function initTeamSection() {
    try {
      const memberData = await getMemberData();
      const memberstackId = memberData.id;

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/users?memberstack_id=eq.${memberstackId}&select=license_type,owner_user_id`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
          }
        }
      );

      const users = await res.json();
      const user = users?.[0];
      if (!user) return;

      // Team-Feature nur für Owner mit passendem Plan
      const teamPlans = ['Starter', 'Pro', 'Professional', 'Enterprise'];
      const isOwner   = !user.owner_user_id;
      const hasTeam   = isOwner && teamPlans.indexOf(user.license_type) !== -1;

      const teamBtn     = document.getElementById('open-team-modal');
      const teamSection = document.getElementById('team-section');

      if (teamBtn)     teamBtn.style.display     = hasTeam ? '' : 'none';
      if (teamSection) teamSection.style.display = hasTeam ? '' : 'none';

      console.log('✅ Team section:', hasTeam ? 'sichtbar' : 'ausgeblendet', '| Plan:', user.license_type);
    } catch (err) {
      console.warn('⚠️ initTeamSection error:', err);
    }
  }

  // ==================== PROFIL UPDATE ====================
  async function initProfileForm() {
    const form = document.querySelector('[data-profile-form]') ||
                 document.querySelector('#profile-form') ||
                 document.querySelector('form');

    const submitBtn = document.getElementById('submit') ||
                     form?.querySelector('[type="submit"]') ||
                     form?.querySelector('button');

    if (!form || !submitBtn) {
      console.log('⏭️ No profile form found, skipping...');
      return;
    }

    console.log('✅ Profile form found');

    const emailInput = form.querySelector('input[type="email"]');

    if (emailInput) {
      try {
        console.log('📧 Setting up email field...');
        const memberData = await getMemberData();
        const email = memberData.auth?.email || memberData.email || '';
        if (email) {
          emailInput.value = email;
          emailInput.readOnly = true;
          emailInput.style.backgroundColor = '#f3f4f6';
          emailInput.style.cursor = 'not-allowed';
          emailInput.style.opacity = '0.7';
          console.log('✅ Email field set to readonly:', email);
        } else {
          console.warn('⚠️ No email found in Memberstack');
        }
      } catch (error) {
        console.error('❌ Email setup failed:', error);
      }
    }

    const handleProfileSubmit = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const originalText = getBtnText(submitBtn);
      const originalBg = submitBtn.style.backgroundColor;

      setBtnText(submitBtn, 'Wird gespeichert...');
      submitBtn.disabled = true;

      try {
        const memberData = await getMemberData();
        const memberstackId = memberData.id;

        const inputs = form.querySelectorAll('input[type="text"], input:not([type])');
        const select = form.querySelector('select');

        const formData = {
          salutation: select?.value || '',
          firstname: inputs[0]?.value || '',
          lastname: inputs[1]?.value || '',
          company: inputs[2]?.value || '',
          email: memberData.auth?.email || memberData.email || ''
        };

        console.log('📦 Profile data:', formData);

        if (!formData.firstname || !formData.lastname) throw new Error('Vorname und Nachname sind erforderlich');
        if (!formData.email) throw new Error('Email konnte nicht abgerufen werden');

        console.log('📤 Updating Supabase...');
        const supabaseResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/users?memberstack_id=eq.${memberstackId}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              salutation: formData.salutation,
              firstname: formData.firstname,
              lastname: formData.lastname,
              company: formData.company,
              email: formData.email
            })
          }
        );

        if (!supabaseResponse.ok) throw new Error('Supabase-Update fehlgeschlagen: ' + supabaseResponse.status);
        console.log('✅ Supabase updated');

        console.log('📤 Updating Memberstack...');
        await window.$memberstackDom.updateMember({
          customFields: {
            salutation: formData.salutation,
            firstname: formData.firstname,
            lastname: formData.lastname,
            company: formData.company
          }
        });
        console.log('✅ Memberstack updated');

        try {
          await fetch('https://hook.eu2.make.com/1jpkdp048x6tphg2xe4rgwsj3rjp488w', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: formData.email,
              salutation: formData.salutation,
              firstname: formData.firstname,
              lastname: formData.lastname,
              company: formData.company,
              profile_updated_at: new Date().toISOString()
            })
          });
          console.log('✅ Brevo sync triggered');
        } catch (err) {
          console.warn('⚠️ Brevo sync failed (non-critical):', err);
        }

        setBtnText(submitBtn, '✓ Gespeichert!');
        submitBtn.style.backgroundColor = '#10b981';
        submitBtn.style.color = '#ffffff';

        setTimeout(() => {
          setBtnText(submitBtn, originalText);
          submitBtn.style.backgroundColor = originalBg;
          submitBtn.style.color = '';
          submitBtn.disabled = false;
        }, 2000);

      } catch (error) {
        console.error('❌ Profile update error:', error);
        setBtnText(submitBtn, '✗ Fehler');
        submitBtn.style.backgroundColor = '#ef4444';
        submitBtn.style.color = '#ffffff';
        alert('Fehler: ' + error.message);
        setTimeout(() => {
          setBtnText(submitBtn, originalText);
          submitBtn.style.backgroundColor = originalBg;
          submitBtn.style.color = '';
          submitBtn.disabled = false;
        }, 2000);
      }
    };

    form.addEventListener('submit', handleProfileSubmit);
    submitBtn.addEventListener('click', handleProfileSubmit);
    console.log('✅ Profile form handlers attached');
  }

  // ==================== E-MAIL PRÄFERENZEN ====================
  async function initPreferencesForm() {
    console.log('🔍 Looking for preferences form...');

    const allForms = Array.from(document.querySelectorAll('form'));
    console.log('📋 Found', allForms.length, 'forms total');

    const preferencesForm = allForms.find(form => {
      const hasCheckboxes = form.querySelectorAll('input[type="checkbox"]').length > 0;
      const hasPrefsButton = form.querySelector('#save-preferences') !== null;
      return hasCheckboxes && hasPrefsButton;
    });

    if (!preferencesForm) {
      console.log('⏭️ No preferences form found with checkboxes and button');
      return;
    }

    console.log('✅ Preferences form found (actual form element)');

    preferencesForm.style.opacity = '0';
    preferencesForm.style.transition = 'opacity 0.3s ease-in';

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'preferences-loading';
    loadingDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280; font-size: 14px;">⏳ Lade Einstellungen...</div>';
    preferencesForm.parentNode.insertBefore(loadingDiv, preferencesForm);

    const allCheckboxes = Array.from(preferencesForm.querySelectorAll('input[type="checkbox"]'));
    console.log('📋 Found', allCheckboxes.length, 'checkboxes in form');

    if (allCheckboxes.length < 4) {
      console.log('⏭️ Not enough checkboxes found:', allCheckboxes.length);
      preferencesForm.style.opacity = '1';
      if (loadingDiv) loadingDiv.remove();
      return;
    }

    const emailCheckboxes = {
      analysis: allCheckboxes[allCheckboxes.length - 4],
      account:  allCheckboxes[allCheckboxes.length - 3],
      updates:  allCheckboxes[allCheckboxes.length - 2],
      marketing: allCheckboxes[allCheckboxes.length - 1]
    };

    const preferencesBtn = preferencesForm.querySelector('#save-preferences') ||
                           preferencesForm.querySelector('[type="submit"]');

    if (!preferencesBtn) {
      console.log('❌ No preferences button found');
      preferencesForm.style.opacity = '1';
      if (loadingDiv) loadingDiv.remove();
      return;
    }

    console.log('✅ Preferences button found:', getBtnText(preferencesBtn));

    let isLoading = false;
    let isSaving  = false;

    async function loadPreferences() {
      if (isLoading) return;
      isLoading = true;
      try {
        console.log('📥 Loading preferences...');
        const memberData = await getMemberData();
        const memberstackId = memberData.id;

        const response = await fetch('https://convertlyze-agent-api-production.up.railway.app/api/user/preferences', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${memberstackId}` }
        });

        if (!response.ok) throw new Error('Load failed: ' + response.status);

        const preferences = await response.json();
        console.log('✅ Preferences loaded:', preferences);

        emailCheckboxes.analysis.checked  = preferences.analysis_notifications;
        emailCheckboxes.account.checked   = preferences.account_notifications;
        emailCheckboxes.updates.checked   = preferences.product_updates;
        emailCheckboxes.marketing.checked = preferences.marketing_tips;

        setTimeout(() => {
          preferencesForm.style.opacity = '1';
          if (loadingDiv && loadingDiv.parentNode) loadingDiv.remove();
          console.log('✅ Preferences form visible');
        }, 100);

      } catch (error) {
        console.error('❌ Load error:', error);
        preferencesForm.style.opacity = '1';
        if (loadingDiv && loadingDiv.parentNode) loadingDiv.remove();
      } finally {
        isLoading = false;
      }
    }

    async function savePreferences() {
      if (isSaving) return;
      isSaving = true;

      const originalValue = getBtnText(preferencesBtn);
      const originalBg = preferencesBtn.style.backgroundColor;

      setBtnText(preferencesBtn, 'Wird gespeichert...');
      preferencesBtn.disabled = true;

      try {
        console.log('📤 Saving preferences...');
        const memberData = await getMemberData();
        const memberstackId = memberData.id;

        const preferences = {
          analysis_notifications: emailCheckboxes.analysis.checked,
          account_notifications:  emailCheckboxes.account.checked,
          product_updates:        emailCheckboxes.updates.checked,
          marketing_tips:         emailCheckboxes.marketing.checked
        };

        console.log('📦 Preferences to save:', preferences);

        const response = await fetch('https://convertlyze-agent-api-production.up.railway.app/api/user/preferences', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${memberstackId}`
          },
          body: JSON.stringify(preferences)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Speichern fehlgeschlagen');
        }

        console.log('✅ Saved successfully');

        try {
          await fetch('https://hook.eu2.make.com/u43g239xg0j60bxku96bh4xlwuu3benl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: memberData.auth?.email || memberData.email,
              analysis_notifications: preferences.analysis_notifications,
              account_notifications:  preferences.account_notifications,
              product_updates:        preferences.product_updates,
              marketing_tips:         preferences.marketing_tips,
              updated_at:             new Date().toISOString()
            })
          });
          console.log('✅ Brevo sync triggered');
        } catch (err) {
          console.warn('⚠️ Brevo sync failed (non-critical):', err);
        }

        setBtnText(preferencesBtn, '✓ Gespeichert!');
        preferencesBtn.style.backgroundColor = '#10b981';
        preferencesBtn.style.color = '#ffffff';

        setTimeout(() => {
          setBtnText(preferencesBtn, originalValue);
          preferencesBtn.style.backgroundColor = originalBg;
          preferencesBtn.style.color = '';
          preferencesBtn.disabled = false;
          isSaving = false;
        }, 2000);

      } catch (error) {
        console.error('❌ Save error:', error);
        setBtnText(preferencesBtn, '✗ Fehler');
        preferencesBtn.style.backgroundColor = '#ef4444';
        preferencesBtn.style.color = '#ffffff';
        alert('Fehler: ' + error.message);
        setTimeout(() => {
          setBtnText(preferencesBtn, originalValue);
          preferencesBtn.style.backgroundColor = originalBg;
          preferencesBtn.style.color = '';
          preferencesBtn.disabled = false;
          isSaving = false;
        }, 2000);
      }
    }

    await loadPreferences();

    preferencesBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isSaving) return;
      await savePreferences();
    });

    preferencesForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isSaving) return;
      await savePreferences();
    });

    console.log('✅ Preferences handlers attached');
  }

  // ==================== INIT ====================
  function tryInit(attempts = 0) {
    if (attempts > 15) {
      console.error('❌ Init failed after 15 attempts');
      return;
    }

    const memberstack = window.$memberstackDom;
    const forms = document.querySelectorAll('form');

    if (!memberstack || forms.length === 0) {
      console.log(`⏳ Retry ${attempts + 1}/15`);
      setTimeout(() => tryInit(attempts + 1), 500);
      return;
    }

    console.log('✅ Initializing...');

    initProfileForm();
    initPreferencesForm();
    initTeamSection(); // ← NEU
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(tryInit, 1000));
  } else {
    setTimeout(tryInit, 1000);
  }
})();
</script>
