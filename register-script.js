(function () {
  'use strict';

  // GEÄNDERT (23.10.2026): Der gewählte Plan wird nicht mehr direkt in die
  // Supabase-Tabelle pending_checkouts geschrieben (öffentlicher Key, jeder
  // konnte fremde Zeilen lesen, überschreiben und löschen), sondern über
  // POST /api/user/pending-checkout. Der Server prüft Plan und E-Mail-Format,
  // begrenzt die Anfragen pro IP und antwortet ohne Inhalt.
  // Entfernt: fetchPendingCheckout, deletePendingCheckout und resolvePlan.
  // Das war toter Code, nichts hat ihn aufgerufen. Abgeholt wird der Plan im
  // Site-Footer-Skript (CVZ CHECKOUT RESUME) über /api/user/pending-checkout/claim.

  // ── Konfiguration ────────────────────────────────────────────────────────────
  var CONFIG = {
    apiBase:        'https://convertlyze-agent-api-production.up.railway.app',
    cookieMaxAgeMs: 30 * 60 * 1000, // 30 Minuten
    priceIds: {
      'starter':      { monthly: 'prc_starter-monthly-udf40q28',   annual: 'prc_starter-yearly-uu680b3d'   },
      'pro':          { monthly: 'prc_pro-monthly-9q502rg',        annual: 'prc_pro-yearly-l4c0gnw'        },
      'enterprise':   { monthly: 'prc_enterprise-monthly-ftd0gbp', annual: 'prc_enterprise-yearly-zv6022j' },
      'pay-per-use':  { monthly: 'prc_pay-per-use-14750y0n',       annual: 'prc_pay-per-use-14750y0n'      },
      'analyse-5':    { monthly: 'prc_pay-per-use-5-analysen--el1dg0ay4', annual: 'prc_pay-per-use-5-analysen--el1dg0ay4' },
      'analyse-10':   { monthly: 'prc_pay-per-use-10-analysen-131g30jzh', annual: 'prc_pay-per-use-10-analysen-131g30jzh' },
      'aufbau-1':     { monthly: 'prc_pay-per-use-aufbau-1--ad1fj0jrg',   annual: 'prc_pay-per-use-aufbau-1--ad1fj0jrg'   },
      'aufbau-5':     { monthly: 'prc_pay-per-use-aufbau-5--mq1hg07on',   annual: 'prc_pay-per-use-aufbau-5--mq1hg07on'   },
      'aufbau-10':    { monthly: 'prc_pay-per-use-aufbau-10--7g1dk0atm',  annual: 'prc_pay-per-use-aufbau-10--7g1dk0atm'  },
      'strategie-1':  { monthly: 'prc_strategie-1--kpn10a65',  annual: 'prc_strategie-1--kpn10a65'  },
      'strategie-5':  { monthly: 'prc_strategie-5--05mj0j7r',  annual: 'prc_strategie-5--05mj0j7r'  },
      'strategie-10': { monthly: 'prc_strategie-10--1jn30a61', annual: 'prc_strategie-10--1jn30a61' },
      // Customer Journey Tracker (ein Preis, Menge wird im Checkout gewählt)
      'tracker':      { monthly: 'prc_conversion-journey-1--gj1oi0uck', annual: 'prc_conversion-journey-1--gj1oi0uck' },
    },
  };
  // HINWEIS: Diese Map wird in diesem Script aktuell nicht gelesen. Den Checkout nach dem Signup
  // startet das site-weite "CVZ CHECKOUT RESUME"-Script im Webflow-Site-Footer (eigene PRICE_IDS-Map).
  // Beide Maps müssen synchron bleiben, sonst startet nach der Registrierung kein Checkout.

  // ── URL-Parameter ────────────────────────────────────────────────────────────
  var params = new URLSearchParams(window.location.search);
  var urlEmail       = params.get('email')   ? decodeURIComponent(params.get('email')) : '';
  var urlPlan        = params.get('plan')    || '';
  var urlBilling     = params.get('billing') || 'monthly';
  var urlInviteToken = params.get('invite')  || '';

  // ── Guard: verhindert Doppelausführung von handleAfterSignup ─────────────────
  var checkoutStarted = false;

  // ── Utilities ────────────────────────────────────────────────────────────────
  function pollUntil(fn, intervalMs, maxAttempts) {
    var attempts = 0;
    var timer = setInterval(function () {
      fn();
      if (++attempts >= maxAttempts) clearInterval(timer);
    }, intervalMs);
  }

  // ── Cookie layer ─────────────────────────────────────────────────────────────
  var Cookies = {
    set: function (name, value) {
      var expires = new Date(Date.now() + CONFIG.cookieMaxAgeMs).toUTCString();
      document.cookie = name + '=' + value + ';expires=' + expires + ';path=/;SameSite=Lax';
    },
    get: function (name) {
      var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? match[1] : null;
    },
    clear: function (name) {
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    },
  };

  function savePlanToCookie(plan, billing) {
    Cookies.set('cvz_plan', plan);
    Cookies.set('cvz_billing', billing);
  }

  // ── Data layer ───────────────────────────────────────────────────────────────
  // Speichert den gewählten Plan serverseitig als Fallback für den Fall, dass das
  // Cookie verloren geht (z.B. Link aus der Bestätigungsmail in einem anderen
  // Browser). Der Server antwortet bei Erfolg mit 204 ohne Inhalt.
  async function savePendingCheckout(email) {
    if (!urlPlan || !email) return;
    try {
      var res = await fetch(CONFIG.apiBase + '/api/user/pending-checkout', {
        method:    'POST',
        headers:   { 'Content-Type': 'application/json' },
        body:      JSON.stringify({ email: email, plan: urlPlan, billing: urlBilling }),
        keepalive: true, // Formular-Submit navigiert weg, die Anfrage soll trotzdem noch rausgehen
      });
      if (!res.ok) console.warn('[CVZ] savePendingCheckout failed:', res.status);
    } catch (e) {
      console.warn('[CVZ] savePendingCheckout error:', e);
    }
  }

  // ── UI layer ─────────────────────────────────────────────────────────────────
  function prefillEmail() {
    if (!urlEmail) return;

    var display = document.querySelector('[data-invite="email-display"]');
    if (display) display.textContent = urlEmail;

    var input = document.querySelector('[data-ms-form="passwordless-signup"] input[type="email"]')
              || document.querySelector('input[type="email"]');
    if (input) {
      input.value = urlEmail;
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function enrichLoginLinks() {
    document.querySelectorAll('a[href*="/login"]').forEach(function (link) {
      var parts = [];
      if (urlInviteToken) parts.push('invite=' + urlInviteToken);
      if (urlEmail)       parts.push('email=' + encodeURIComponent(urlEmail));
      if (urlPlan)        parts.push('plan=' + urlPlan + '&billing=' + urlBilling);
      if (parts.length)   link.href = '/login?' + parts.join('&');
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function handleAfterSignup() {
    if (checkoutStarted) return;
    checkoutStarted = true;
    // Cookie bleibt gesetzt, das site-weite Script auf der Zielseite übernimmt den Checkout
    console.log('[CVZ] Signup erkannt, Checkout wird auf Zielseite gestartet');
  }

  // ── Erkennung "Signup abgeschlossen" ─────────────────────────────────────────
  // Es gibt KEIN Browser-Event "memberstack:auth:signup" (im echten memberstack.js-Bundle
  // geprüft). Memberstack stellt stattdessen $memberstackDom.onAuthChange() bereit, das bei
  // Login/Signup mit dem Member-Objekt aufgerufen wird. Zur Absicherung läuft zusätzlich ein
  // kurzes Polling auf getCurrentMember(). Das schadet nicht, weil handleAfterSignup() durch
  // checkoutStarted ohnehin nur einmal etwas tut.
  function startMemberWatch() {
    if (window.$memberstackDom && typeof window.$memberstackDom.onAuthChange === 'function') {
      window.$memberstackDom.onAuthChange(function (member) {
        if (member) handleAfterSignup();
      });
    } else {
      console.warn('[CVZ] $memberstackDom.onAuthChange nicht gefunden, nur Polling-Fallback aktiv');
    }

    var pollAttempts = 0;
    var pollTimer = setInterval(function () {
      pollAttempts++;
      if (checkoutStarted || pollAttempts >= 20) { // max. 20 x 500ms = 10 Sekunden
        clearInterval(pollTimer);
        return;
      }
      if (!window.$memberstackDom) return;
      window.$memberstackDom.getCurrentMember().then(function (res) {
        if (res && res.data) {
          clearInterval(pollTimer);
          handleAfterSignup();
        }
      }).catch(function () {});
    }, 500);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    prefillEmail();

    // Memberstack rendert Login-Links verzögert, deshalb mehrfach pollen
    enrichLoginLinks();
    pollUntil(enrichLoginLinks, 500, 4);

    // Plan in Cookie sichern, damit er nach dem Signup noch verfügbar ist
    if (urlPlan) savePlanToCookie(urlPlan, urlBilling);

    // E-Mail ins Prefill nochmal versuchen, falls DOM noch nicht bereit
    pollUntil(prefillEmail, 400, 3);

    // pending_checkout speichern, wenn das Formular abgeschickt wird
    if (urlPlan) {
      var form = document.querySelector('[data-ms-form="passwordless-signup"]');
      if (form) {
        form.addEventListener('submit', function () {
          var emailInput = form.querySelector('input[type="email"]');
          var email = emailInput ? emailInput.value.trim() : urlEmail;
          if (email) savePendingCheckout(email);
        });
      }
    }

    startMemberWatch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
