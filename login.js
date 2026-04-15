// ==================== LOGIN SCRIPT ====================
(function() {
  if (window._cvlyLoginInit) return;
  window._cvlyLoginInit = true;

  var urlParams   = new URLSearchParams(window.location.search);
  var inviteToken = urlParams.get('invite');
  var emailParam  = urlParams.get('email') ? decodeURIComponent(urlParams.get('email')) : '';
  var plan        = urlParams.get('plan');
  var billing     = urlParams.get('billing') || 'monthly';

  // ── Cookie Helpers ─────────────────────────────────────────────────────────
  function setInviteCookie(token) {
    var expires = new Date(Date.now() + 30 * 60 * 1000).toUTCString();
    document.cookie = 'cvz_invite=' + token + ';expires=' + expires + ';path=/;SameSite=Lax';
  }

  function setPlanCookie(p, b) {
    var expires = new Date(Date.now() + 10 * 60 * 1000).toUTCString();
    document.cookie = 'cvz_plan='    + p + ';expires=' + expires + ';path=/;SameSite=Lax';
    document.cookie = 'cvz_billing=' + b + ';expires=' + expires + ';path=/;SameSite=Lax';
  }

  // ── 1. Invite-Token sichern ────────────────────────────────────────────────
  if (inviteToken) {
    setInviteCookie(inviteToken);
    console.log('[CVZ] Login: Invite-Token gesichert (Cookie):', inviteToken);
  }

  // ── 2. DOMContentLoaded ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    var loginForm = document.querySelector('[data-ms-form="login"]');
    if (!loginForm) return;

    // E-Mail prefill
    if (emailParam) {
      var emailInput = loginForm.querySelector('input[type="email"]');
      if (emailInput) {
        emailInput.value = emailParam;
        emailInput.dispatchEvent(new Event('input',  { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[CVZ] Login: E-Mail prefilled:', emailParam);
      }
    }

    // Plan in Cookie sichern
    if (plan) {
      setPlanCookie(plan, billing);
      try {
        localStorage.setItem('selected_plan', plan);
        localStorage.setItem('selected_billing', billing);
      } catch(e) {}
      console.log('[CVZ] Login: Plan gesichert | plan:', plan, '| billing:', billing);
    }

    // Register-Link anreichern
    document.querySelectorAll('a[href*="/register"]').forEach(function(link) {
      var params = [];
      if (inviteToken) params.push('invite=' + inviteToken);
      if (emailParam)  params.push('email=' + encodeURIComponent(emailParam));
      if (plan)        params.push('plan=' + plan + '&billing=' + billing);
      if (params.length) link.href = '/register?' + params.join('&');
    });

    // Form Submit (Magic Link)
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var emailInput = loginForm.querySelector('input[type="email"]');
      var emailValue = emailInput.value;

      var oldMessage = document.querySelector('.memberstack-custom-message');
      if (oldMessage) oldMessage.remove();

      try {
        await $memberstackDOM.sendMagicLink({ email: emailValue });
        showMagicLinkSentMessage(loginForm);
      } catch (error) {
        if (error.code === 'MEMBER_NOT_FOUND' || error.message.includes('not found')) {
          showNotRegisteredMessage(emailValue, loginForm);
        } else {
          showErrorMessage(loginForm, error.message);
        }
      }
    });
  });

  // ── Helper-Funktionen ──────────────────────────────────────────────────────
  function showNotRegisteredMessage(email, formElement) {
    var div = document.createElement('div');
    div.className = 'memberstack-custom-message';
    div.style.cssText = 'margin-top:20px;padding:20px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;text-align:center;';
    var registerHref = '/register?email=' + encodeURIComponent(email);
    if (inviteToken) registerHref += '&invite=' + inviteToken;
    div.innerHTML = '<p style="margin:0 0 15px 0;color:#495057;font-size:16px;">Diese E-Mail-Adresse ist noch nicht registriert.</p>'
      + '<p style="margin:0 0 20px 0;color:#6c757d;font-size:14px;">Möchten Sie ein Konto erstellen?</p>'
      + '<a href="' + registerHref + '" style="display:inline-block;padding:12px 30px;background:linear-gradient(135deg,#0066FF 0%,#00CC88 100%);color:white;text-decoration:none;border-radius:6px;font-weight:500;">Jetzt registrieren</a>';
    formElement.parentElement.appendChild(div);
  }

  function showMagicLinkSentMessage(formElement) {
    var div = document.createElement('div');
    div.className = 'memberstack-custom-message';
    div.style.cssText = 'margin-top:20px;padding:20px;background:#d4edda;border:1px solid #c3e6cb;border-radius:8px;text-align:center;';
    div.innerHTML = '<p style="margin:0;color:#155724;font-size:16px;">✓ Magic Link wurde versendet! Bitte prüfen Sie Ihr E-Mail-Postfach.</p>';
    formElement.parentElement.appendChild(div);
  }

  function showErrorMessage(formElement, errorMsg) {
    var div = document.createElement('div');
    div.className = 'memberstack-custom-message';
    div.style.cssText = 'margin-top:20px;padding:20px;background:#f8d7da;border:1px solid #f5c6cb;border-radius:8px;text-align:center;';
    div.innerHTML = '<p style="margin:0;color:#721c24;font-size:16px;">Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.</p>';
    formElement.parentElement.appendChild(div);
  }

})();
