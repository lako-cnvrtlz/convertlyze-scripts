// ==================== LOGIN SCRIPT ====================
(function () {
  if (window._cvlyLoginInit) return;
  window._cvlyLoginInit = true;

  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

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

  // ── Toast Helpers ──────────────────────────────────────────────────────────
  function suppressMsToast() {
    [0, 100, 300].forEach(function (delay) {
      setTimeout(function () {
        document.querySelectorAll(
          '[class*="ms-toast"],[class*="memberstack-toast"],[id*="ms-toast"],.ms-notification'
        ).forEach(function (el) {
          el.style.cssText = 'display:none!important;visibility:hidden!important';
        });
      }, delay);
    });
  }

  function showToast(type, message) {
    suppressMsToast();
    if (window.cvzShowToast) {
      window.cvzShowToast(type, message);
    } else {
      console.warn('[CVZ] cvzShowToast nicht verfügbar:', type, message);
    }
  }

  // ── Helper: Nicht-registriert-Nachricht ───────────────────────────────────
  function showNotRegisteredMessage(email, formElement) {
    var existing = document.querySelector('.memberstack-custom-message');
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.className = 'memberstack-custom-message';
    div.style.cssText = 'margin-top:20px;padding:16px 20px;background:#1a2133;border:1px solid #2a3550;border-left:3px solid #f87171;border-radius:10px;text-align:center;font-family:inherit;';
    var registerHref = '/register?email=' + encodeURIComponent(email);
    if (inviteToken) registerHref += '&invite=' + inviteToken;
    if (plan)        registerHref += '&plan=' + plan + '&billing=' + billing;
    div.innerHTML =
      '<p style="margin:0 0 12px;color:#e8edf5;font-size:14px;line-height:1.5">Diese E-Mail-Adresse ist noch nicht registriert.</p>' +
      '<a href="' + registerHref + '" style="display:inline-block;padding:10px 24px;background:#4fd1c5;color:#0d1117;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Jetzt registrieren →</a>';
    formElement.parentElement.appendChild(div);
  }

  // ── 2. Form binden ─────────────────────────────────────────────────────────
  function bindLoginForm() {
    var loginForm = document.querySelector(
      '[data-ms-form="login-with-token"], [data-ms-form="login"], [data-ms-form="signup"]'
    );
    if (!loginForm) return false;
    var submitBtn = loginForm.querySelector(
      '[data-ms-passwordless-login], input[type="submit"], button[type="submit"]'
    );
    if (!submitBtn) return false;

    console.log('[CVZ] Form + Button gefunden, binde Handler...');

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

    // Plan sichern
    if (plan) {
      setPlanCookie(plan, billing);
      console.log('[CVZ] Login: Plan gesichert | plan:', plan, '| billing:', billing);
    }

    // Register-Links anreichern
    document.querySelectorAll('a[href*="/register"]').forEach(function (link) {
      var params = [];
      if (inviteToken) params.push('invite=' + inviteToken);
      if (emailParam)  params.push('email=' + encodeURIComponent(emailParam));
      if (plan)        params.push('plan=' + plan + '&billing=' + billing);
      if (params.length) link.href = '/register?' + params.join('&');
    });

    // Submit-Handler – nur Validierung, Memberstack's eigener Flow bleibt intakt
    submitBtn.addEventListener('click', function (e) {
      var emailInput = loginForm.querySelector('input[type="email"]');
      var emailValue = emailInput ? emailInput.value.trim() : '';

      var oldMsg = document.querySelector('.memberstack-custom-message');
      if (oldMsg) oldMsg.remove();

      // Nur bei leerer E-Mail abbrechen
      if (!emailValue) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showToast('error', 'Bitte gib deine E-Mail-Adresse ein.');
        return;
      }

      // Memberstack's eigenen Handler laufen lassen (öffnet Code-Eingabefeld)
    });

    // Memberstack Fehler abfangen
    window.addEventListener('memberstack:error', function (evt) {
      var code = evt?.detail?.code || '';
      var msg  = (evt?.detail?.message || '').toLowerCase();
      suppressMsToast();
      if (code === 'MEMBER_NOT_FOUND' || msg.includes('not found') || msg.includes('no member')) {
        showToast('error', 'Kein Account mit dieser E-Mail gefunden.');
        showNotRegisteredMessage(emailParam, loginForm);
      } else if (code === 'INVALID_EMAIL' || msg.includes('invalid email')) {
        showToast('error', 'Ungültige E-Mail-Adresse. Bitte prüfe deine Eingabe.');
      } else if (code === 'TOO_MANY_REQUESTS' || msg.includes('too many')) {
        showToast('warning', 'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.');
      } else if (code === 'INVALID_TOKEN' || msg.includes('invalid token')) {
        showToast('error', 'Ungültiger Token. Bitte fordere einen neuen Login-Link an.');
      } else {
        showToast('error', 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
      }
    });

    return true;
  }

  // ── 3. Retry-Logik für Memberstack-gerendertes Form ────────────────────────
  var bindAttempts = 0;
  function tryBindLoginForm() {
    bindAttempts++;
    if (bindLoginForm()) return;
    if (bindAttempts < 20) setTimeout(tryBindLoginForm, 300);
    else console.warn('[CVZ] Login: Form nach 6s nicht gefunden');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryBindLoginForm);
  } else {
    tryBindLoginForm();
  }

  // ── 4. Nach Login: Invite annehmen ────────────────────────────────────────
  window.addEventListener('memberstack:auth:login', async function () {
    var match = document.cookie.match(/(^| )cvz_invite=([^;]+)/);
    var pendingInvite = match ? decodeURIComponent(match[2]) : null;
    if (!pendingInvite) return;

    try {
      var member = await window.$memberstackDom.getCurrentMember();
      var memberstackId = member?.data?.id;
      if (!memberstackId) return;

      console.log('[CVZ] Login: Invite wird angenommen...', pendingInvite);

      var res = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/accept-team-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ token: pendingInvite, memberstack_id: memberstackId })
      });

      var data = await res.json();
      if (data.success) {
        document.cookie = 'cvz_invite=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax';
        console.log('[CVZ] Login: Team-Einladung angenommen');
        window.location.href = '/member/dashboard';
      } else {
        console.warn('[CVZ] Login: Invite fehlgeschlagen:', data.error);
        document.cookie = 'cvz_invite=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax';
        window.location.href = '/member/dashboard';
      }
    } catch (err) {
      console.error('[CVZ] Login: Invite-Fehler:', err);
      window.location.href = '/member/dashboard';
    }
  });

  console.log('[CVZ] Login-Script geladen');

})();
