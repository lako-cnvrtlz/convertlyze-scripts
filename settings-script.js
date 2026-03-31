<script>
(function() {
  console.log('🚀 Settings Page Script loaded');

  const SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

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

  function setBtnText(btn, text) {
    if (btn.value !== undefined && btn.value !== '') btn.value = text;
    else btn.textContent = text;
  }

  function getBtnText(btn) {
    return (btn.value !== undefined && btn.value !== '') ? btn.value : btn.textContent;
  }

  // ── Team Section: über Edge Function laden ────────────────────────────────
  async function initTeamSection() {
    try {
      const memberData = await getMemberData();
      const memberstackId = memberData.id;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-user-billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberstackId })
      });

      const { data: user } = await res.json();
      if (!user) return;

      const teamPlans = ['Starter', 'Pro', 'Professional', 'Enterprise'];
      const isOwner   = !user.owner_user_id;
      const hasTeam   = isOwner && teamPlans.indexOf(user.license_type) !== -1;

      const teamBtn     = document.getElementById('open-team-modal');
      const teamSection = document.getElementById('team-section');
      if (teamBtn)     teamBtn.style.display     = hasTeam ? '' : 'none';
      if (teamSection) teamSection.style.display = hasTeam ? '' : 'none';

      console.log('✅ Team section:', hasTeam ? 'sichtbar' : 'ausgeblendet');
    } catch (err) {
      console.warn('⚠️ initTeamSection error:', err);
    }
  }

  // ── Profil Update: über Edge Function ────────────────────────────────────
  async function initProfileForm() {
    const form = document.querySelector('[data-profile-form]') ||
                 document.querySelector('#profile-form') ||
                 document.querySelector('form');

    const submitBtn = document.getElementById('submit') ||
                      form?.querySelector('[type="submit"]') ||
                      form?.querySelector('button');

    if (!form || !submitBtn) return;

    const emailInput = form.querySelector('input[type="email"]');
    if (emailInput) {
      try {
        const memberData = await getMemberData();
        const email = memberData.auth?.email || memberData.email || '';
        if (email) {
          emailInput.value = email;
          emailInput.readOnly = true;
          emailInput.style.backgroundColor = '#f3f4f6';
          emailInput.style.cursor = 'not-allowed';
          emailInput.style.opacity = '0.7';
        }
      } catch (error) {
        console.error('❌ Email setup failed:', error);
      }
    }

    const handleProfileSubmit = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const originalText = getBtnText(submitBtn);
      const originalBg   = submitBtn.style.backgroundColor;
      setBtnText(submitBtn, 'Wird gespeichert...');
      submitBtn.disabled = true;

      try {
        const memberData    = await getMemberData();
        const memberstackId = memberData.id;
        const inputs        = form.querySelectorAll('input[type="text"], input:not([type])');
        const select        = form.querySelector('select');

        const formData = {
          salutation: select?.value || '',
          firstname:  inputs[0]?.value || '',
          lastname:   inputs[1]?.value || '',
        };

        if (!formData.firstname || !formData.lastname) throw new Error('Vorname und Nachname sind erforderlich');

        const res = await fetch(`${SUPABASE_URL}/functions/v1/update-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberstackId, ...formData })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Update fehlgeschlagen');

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
  }

  // ── E-Mail Präferenzen: über Edge Function ────────────────────────────────
  async function initPreferencesForm() {
    const allForms = Array.from(document.querySelectorAll('form'));
    const preferencesForm = allForms.find(form => {
      return form.querySelectorAll('input[type="checkbox"]').length > 0
          && form.querySelector('#save-preferences') !== null;
    });

    if (!preferencesForm) return;

    preferencesForm.style.opacity = '0';
    preferencesForm.style.transition = 'opacity 0.3s ease-in';

    const allCheckboxes = Array.from(preferencesForm.querySelectorAll('input[type="checkbox"]'));
    if (allCheckboxes.length < 4) {
      preferencesForm.style.opacity = '1';
      return;
    }

    const emailCheckboxes = {
      analysis:  allCheckboxes[allCheckboxes.length - 4],
      account:   allCheckboxes[allCheckboxes.length - 3],
      updates:   allCheckboxes[allCheckboxes.length - 2],
      marketing: allCheckboxes[allCheckboxes.length - 1]
    };

    const preferencesBtn = preferencesForm.querySelector('#save-preferences') ||
                           preferencesForm.querySelector('[type="submit"]');
    if (!preferencesBtn) {
      preferencesForm.style.opacity = '1';
      return;
    }

    let isSaving = false;

    // Präferenzen laden
    try {
      const memberData    = await getMemberData();
      const memberstackId = memberData.id;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-user-billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberstackId })
      });
      const { data: user } = await res.json();

      if (user?.email_preferences) {
        emailCheckboxes.analysis.checked  = user.email_preferences.analysis_notifications ?? true;
        emailCheckboxes.account.checked   = user.email_preferences.account_notifications  ?? true;
        emailCheckboxes.updates.checked   = user.email_preferences.product_updates        ?? false;
        emailCheckboxes.marketing.checked = user.email_preferences.marketing_tips         ?? false;
      }
    } catch (error) {
      console.error('❌ Load preferences error:', error);
    }

    preferencesForm.style.opacity = '1';

    // Präferenzen speichern
    async function savePreferences() {
      if (isSaving) return;
      isSaving = true;

      const originalValue = getBtnText(preferencesBtn);
      const originalBg    = preferencesBtn.style.backgroundColor;
      setBtnText(preferencesBtn, 'Wird gespeichert...');
      preferencesBtn.disabled = true;

      try {
        const memberData    = await getMemberData();
        const memberstackId = memberData.id;

        const res = await fetch(`${SUPABASE_URL}/functions/v1/update-email-preferences`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberstackId,
            product_updates: emailCheckboxes.updates.checked,
            marketing_tips:  emailCheckboxes.marketing.checked,
          })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Speichern fehlgeschlagen');

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
        setTimeout(() => {
          setBtnText(preferencesBtn, originalValue);
          preferencesBtn.style.backgroundColor = originalBg;
          preferencesBtn.style.color = '';
          preferencesBtn.disabled = false;
          isSaving = false;
        }, 2000);
      }
    }

    preferencesBtn.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); await savePreferences(); });
    preferencesForm.addEventListener('submit', async (e) => { e.preventDefault(); e.stopPropagation(); await savePreferences(); });
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function tryInit(attempts = 0) {
    if (attempts > 15) return;
    if (!window.$memberstackDom || document.querySelectorAll('form').length === 0) {
      setTimeout(() => tryInit(attempts + 1), 500);
      return;
    }
    initProfileForm();
    initPreferencesForm();
    initTeamSection();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(tryInit, 1000));
  } else {
    setTimeout(tryInit, 1000);
  }
})();
</script>
