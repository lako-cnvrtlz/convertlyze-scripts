(function() {

  var WEBHOOK_URL = 'https://hook.eu2.make.com/2lsybme5qm0fw8cw1ua9a4xcjx94xg29';
  var currentMemberId = null;

  // ── Dropdown befüllen ─────────────────────────────────────────────────────
  function initDropdown() {
    var select = document.getElementById('conversion_goal');
    if (!select) return;
    select.innerHTML = `
      <option value="">Conversion-Ziel auswählen...</option>
      <optgroup label="PRIMARY CONVERSIONS (Sales & Umsatz)">
        <option value="Demo-Anfrage">Demo-Anfrage</option>
        <option value="Angebotsanfrage / Pricing Request">Angebotsanfrage / Pricing Request</option>
        <option value="Audit / Assessment buchen">Audit / Assessment buchen</option>
        <option value="Software-Lizenz / SaaS-Abo (Kauf)">Software-Lizenz / SaaS-Abo (Kauf)</option>
        <option value="Produktkauf (physisch oder digital)">Produktkauf (physisch oder digital)</option>
        <option value="Upgrade / Planwechsel">Upgrade / Planwechsel</option>
        <option value="Terminanfrage">Terminanfrage</option>
      </optgroup>
      <optgroup label="PRODUCT-LED CONVERSIONS (PLG)">
        <option value="Freemium (Free Plan gestartet)">Freemium (Free Plan gestartet)</option>
        <option value="Kostenlose Testversion (Trial)">Kostenlose Testversion (Trial)</option>
        <option value="Product Signup (ohne Sales-Kontakt)">Product Signup (ohne Sales-Kontakt)</option>
        <option value="Early Access / Beta Signup">Early Access / Beta Signup</option>
      </optgroup>
      <optgroup label="LEADS, EVENTS & SUBSCRIPTIONS">
        <option value="Content Download (Whitepaper, Case Study, E-Book)">Content Download (Lead Magnet)</option>
        <option value="Webinar-Anmeldung">Webinar-Anmeldung</option>
        <option value="Event-Registrierung (kostenlos)">Event-Registrierung (kostenlos)</option>
        <option value="Event-Ticket / Schulungsbuchung">Event-Ticket / Schulungsbuchung</option>
        <option value="Newsletter-Anmeldung">Newsletter-Anmeldung</option>
      </optgroup>
      <optgroup label="KONTAKT & INTERAKTION">
        <option value="Sales-Kontaktanfrage (High Intent)">Sales-Kontaktanfrage (High Intent)</option>
        <option value="Live-Chat gestartet (Pre-Sales)">Live-Chat gestartet (Pre-Sales)</option>
        <option value="Support-Anfrage (Bestandskunden)">Support-Anfrage (Bestandskunden)</option>
      </optgroup>
      <optgroup label="ENGAGEMENT & INTENT (Micro-Conversions)">
        <option value="Pricing-Seite besucht">Pricing-Seite besucht</option>
        <option value="Produktvergleich angesehen">Produktvergleich angesehen</option>
        <option value="Interaktives Tool / Calculator genutzt">Interaktives Tool / Calculator genutzt</option>
        <option value="Video Completion">Video Completion</option>
        <option value="Ressourcen- oder Blog-Seite besucht">Ressourcen- oder Blog-Seite besucht</option>
        <option value="Externe Weiterleitung (Partner, Marketplace, App Store)">Externe Weiterleitung</option>
      </optgroup>
    `;
  }

  // ── Credit-Berechnung ─────────────────────────────────────────────────────
  function calcCredits(d) {
    var planCredits = Math.max(0,
      (parseFloat(d.credits_limit) || 0)
      - (parseFloat(d.credits_used_current_period) || 0)
      - (parseFloat(d.reserved_credits) || 0)
    );
    var ppuCredits = parseInt(d.ppu_credits) || 0;
    return planCredits + ppuCredits;
  }

  // ── Credits laden und anzeigen ────────────────────────────────────────────
  function loadCredits() {
    window.$memberstackDom.getCurrentMember().then(function(result) {
      var member = result?.data;
      if (!member?.id) return;

      currentMemberId = member.id;

      window.supabase
        .from('users')
        .select('credits_limit, credits_used_current_period, reserved_credits, ppu_credits')
        .eq('memberstack_id', member.id)
        .single()
        .then(function(res) {
          if (!res.data) return;

          var total = calcCredits(res.data);
          var display = document.querySelector('[data-field="credits_remaining"]');
          if (display) {
            display.textContent = total;
            display.style.color = total === 0 ? '#f87171' : total <= 3 ? '#fbbf24' : '#34d399';
          }

          var box = document.getElementById('credits-info');
          if (box) box.style.opacity = '1';

          if (total <= 0) {
            var btn = document.querySelector('.analyseformular-button');
            if (btn) {
              btn.style.opacity = '0.5';
              btn.style.pointerEvents = 'none';
              btn.textContent = 'Keine Analysen verfügbar';
            }
          }
        })
        .catch(function(err) {
          console.warn('Credits laden fehlgeschlagen:', err);
          var box = document.getElementById('credits-info');
          if (box) box.style.opacity = '1';
        });
    }).catch(function() {});
  }

  // ── Memberstack-Felder ins Formular injizieren ────────────────────────────
  function injectMemberstackFields() {
    window.$memberstackDom.getCurrentMember().then(function(result) {
      var member = result?.data;
      if (!member?.id) return;

      var form = document.querySelector('form');
      if (!form) return;

      function setHidden(name, value) {
        var existing = form.querySelector('input[name="' + name + '"]');
        if (existing) { existing.value = value; return; }
        var input = document.createElement('input');
        input.type = 'hidden'; input.name = name; input.value = value;
        form.appendChild(input);
      }

      setHidden('memberstack_id', member.id);
      setHidden('email', member.auth?.email || member.email || '');
      console.log('Memberstack fields injected:', member.id);
    }).catch(function() {});
  }

  // ── Submit-Handler mit Live-Credit-Prüfung ────────────────────────────────
  function initSubmitHandler() {
    var form = document.querySelector('form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      if (!currentMemberId) { window.location.href = '/analyse/fehler'; return; }

      window.supabase
        .from('users')
        .select('credits_limit, credits_used_current_period, reserved_credits, ppu_credits')
        .eq('memberstack_id', currentMemberId)
        .single()
        .then(function(res) {
          if (!res.data) { window.location.href = '/analyse/fehler'; return; }

          var total = calcCredits(res.data);
          if (total <= 0) { window.location.href = '/analyse/fehler'; return; }

          fetch(WEBHOOK_URL, { method: 'POST', body: new FormData(form) })
            .then(function(response) {
              window.location.href = response.ok ? '/analyse/in-arbeit' : '/analyse/fehler';
            })
            .catch(function() { window.location.href = '/analyse/fehler'; });
        })
        .catch(function() { window.location.href = '/analyse/fehler'; });
    });
  }

  // ── Init mit Timing-Fix ───────────────────────────────────────────────────
  var attempts = 0;
  function init() {
    var memberstackReady = !!window.$memberstackDom;
    var supabaseReady    = !!window.supabase && typeof window.supabase.from === 'function';

    if (memberstackReady && supabaseReady) {
      initDropdown();
      loadCredits();
      injectMemberstackFields();
      initSubmitHandler();
    } else if (attempts < 30) {
      attempts++;
      setTimeout(init, 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
