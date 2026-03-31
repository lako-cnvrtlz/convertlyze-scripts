// ==================== MEMBER INVITE SCRIPT ====================
(function() {

  var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

  var params     = new URLSearchParams(window.location.search);
  var token      = params.get('invite');
  var emailParam = params.get('email') ? decodeURIComponent(params.get('email')) : '';

  // ── E-Mail als Text anzeigen ──
  function setEmailDisplay() {
    var el = document.querySelector('[data-invite="email-display"]');
    if (el && emailParam) {
      el.textContent = emailParam;
      return true;
    }
    return false;
  }

  if (!setEmailDisplay()) {
    setTimeout(setEmailDisplay, 300);
    setTimeout(setEmailDisplay, 800);
    setTimeout(setEmailDisplay, 1500);
  }

  async function initInvitePage() {
    var attempts = 0;
    while (!window.$memberstackDom && attempts < 30) {
      await new Promise(function(r) { setTimeout(r, 300); });
      attempts++;
    }

    setEmailDisplay();

    if (!token) {
      showStatus('Ungültiger Einladungslink.', 'error');
      return;
    }

    var form = document.querySelector('[data-invite="form"]');
    var btn  = document.querySelector('[data-invite="accept-btn"]');

    async function handleAccept(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (btn) { btn.value = 'Wird verarbeitet…'; btn.disabled = true; }

      try {
        var member = await window.$memberstackDom.getCurrentMember();
        var memberstackId = member?.data?.id;

        if (!memberstackId) {
          window.location.href = '/register?invite=' + token + '&email=' + encodeURIComponent(emailParam);
          return;
        }

        var response = await fetch(SUPABASE_URL + '/functions/v1/accept-team-invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            token: token,
            memberstack_id: memberstackId
          })
        });

        var data = await response.json();

        if (data.success) {
          showStatus('Einladung angenommen – du wirst weitergeleitet.', 'success');
          setTimeout(function() {
            window.location.href = '/member/dashboard';
          }, 1500);
        } else {
          showStatus(data.error || 'Fehler beim Annehmen der Einladung.', 'error');
          if (btn) { btn.value = 'Einladung annehmen'; btn.disabled = false; }
        }

      } catch (err) {
        console.error('Invite error:', err);
        showStatus('Verbindungsfehler. Bitte erneut versuchen.', 'error');
        if (btn) { btn.value = 'Einladung annehmen'; btn.disabled = false; }
      }
    }

    if (form) form.addEventListener('submit', handleAccept);
    if (btn && !form) btn.addEventListener('click', handleAccept);
  }

  function showStatus(msg, type) {
    var el = document.querySelector('[data-invite="status"]');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.padding = '12px 16px';
    el.style.borderRadius = '8px';
    el.style.marginTop = '12px';
    el.style.fontSize = '14px';
    if (type === 'success') {
      el.style.background = '#EAF3DE';
      el.style.color = '#27500A';
      el.style.border = '0.5px solid #C0DD97';
    } else {
      el.style.background = '#FCEBEB';
      el.style.color = '#501313';
      el.style.border = '0.5px solid #F7C1C1';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInvitePage);
  } else {
    initInvitePage();
  }

})();
