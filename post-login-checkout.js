(function() {
  if (window._cvlyPostLoginCheckout) return;
  window._cvlyPostLoginCheckout = true;

  var SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

  var urlParams = new URLSearchParams(window.location.search);

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? match[1] : null;
  }

  function clearCookie(name) {
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  }

  async function handlePostLogin(memberstackId) {
    if (!memberstackId) return;

    // ── INVITE FLOW ──────────────────────────────────────────────────────────
    var token = getCookie('cvz_invite') || urlParams.get('invite');
    if (!token) return;

    clearCookie('cvz_invite');
    console.log('[CVZ] Invite-Flow nach Login...');

    try {
      var res = await fetch(SUPABASE_URL + '/functions/v1/accept-team-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ token, memberstack_id: memberstackId })
      });
      var data = await res.json();
      console.log('[CVZ] accept-team-invite Response:', data);
    } catch (err) {
      console.error('[CVZ] ❌ accept-team-invite fehlgeschlagen:', err);
    }

    window.location.href = '/willkommen';
  }

  async function checkOnLoad() {
    var memberstackReady = !!window.$memberstackDom;
    if (!memberstackReady) { setTimeout(checkOnLoad, 300); return; }

    var token = getCookie('cvz_invite') || urlParams.get('invite');
    if (!token) return;

    try {
      var result = await window.$memberstackDom.getCurrentMember();
      var memberstackId = result?.data?.id;
      if (memberstackId) handlePostLogin(memberstackId);
    } catch(e) {}
  }

  window.addEventListener('memberstack:auth:login', function(event) {
    var memberstackId = event?.detail?.member?.id || event?.detail?.id;
    handlePostLogin(memberstackId);
  });

  window.addEventListener('memberstack:auth:signup', function(event) {
    var memberstackId = event?.detail?.member?.id || event?.detail?.id;
    handlePostLogin(memberstackId);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkOnLoad);
  } else {
    checkOnLoad();
  }

  console.log('[CVZ] Post-Login-Script geladen');
})();
