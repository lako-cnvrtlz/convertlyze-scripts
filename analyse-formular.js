(function () {
  'use strict';

  // ── Konfiguration ────────────────────────────────────────────────────────────

  var CONFIG = {
    supabaseUrl:     'https://zpkifipmyeunorhtepzq.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU',
    webhookUrl:      'https://hook.eu2.make.com/2lsybme5qm0fw8cw1ua9a4xcjx94xg29',
    webhookSecret:   'cvl_whsec_2f8a9b4e7d1c3f6a',
    maxInitAttempts: 30,
    initRetryMs:     300,
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
    return !!window.$memberstackDom && typeof window.supabase?.from === 'function';
  }

  // ── Data layer ───────────────────────────────────────────────────────────────

  async function getCurrentMember() {
    var result = await window.$memberstackDom.getCurrentMember();
    return {
      id:    result?.data?.id    || null,
      email: result?.data?.auth?.email || result?.data?.email || null,
    };
  }

  async function fetchCredits(memberstackId) {
    var res = await window.supabase
      .from('user_effective_credits')
      .select('credits_limit, credits_used_current_period, reserved_credits, ppu_credits, reserved_ppu_credits')
      .eq('memberstack_id', memberstackId)
      .single();
    if (res.error) console.warn('[CVZ] fetchCredits error:', res.error);
    return res.data || null;
  }

  function calcCredits(d) {
    var plan = Math.max(0,
      (parseFloat(d.credits_limit) || 0) -
      (parseFloat(d.credits_used_current_period) || 0) -
      (parseFloat(d.reserved_credits) || 0)
    );
    var ppu = Math.max(0,
      (parseInt(d.ppu_credits) || 0) -
      (parseInt(d.reserved_ppu_credits) || 0)
    );
    return plan + ppu;
  }

  async function submitAnalysis(formEl, memberstackId) {
    // Credits nochmal prüfen direkt vor Submit (serverseitige Absicherung)
    var credits = await fetchCredits(memberstackId);
    if (!credits || calcCredits(credits) <= 0) {
      window.location.href = '/analyse/fehler';
      return;
    }

    var formData = new FormData(formEl);
    formData.append('webhook_secret', CONFIG.webhookSecret);

    var res = await fetch(CONFIG.webhookUrl, { method: 'POST', body: formData });
    window.location.href = res.ok ? '/analyse/in-arbeit' : '/analyse/fehler';
  }

  // ── UI layer ─────────────────────────────────────────────────────────────────

  function renderCredits(total) {
    var el = document.querySelector('[data-field="credits_remaining"]');
    if (el) {
      el.textContent = total;
      el.style.color = total === 0 ? '#f87171' : total <= 3 ? '#fbbf24' : '#34d399';
    }
    var box = document.getElementById('credits-info');
    if (box) box.style.opacity = '1';
  }

  function setSubmitButton(state, label) {
    var btn = document.querySelector('.analyseformular-button');
    if (!btn) return;
    btn.textContent         = label || btn.textContent;
    btn.style.opacity       = state === 'loading' ? '0.6' : state === 'disabled' ? '0.5' : '1';
    btn.style.pointerEvents = (state === 'loading' || state === 'disabled') ? 'none' : 'auto';
  }

  function showUrlError() {
    var urlInput = document.querySelector('input[name="landing_page_url"]');
    if (urlInput) {
      urlInput.style.borderColor = '#f87171';
      urlInput.placeholder = 'Bitte URL eingeben';
      urlInput.focus();
    }
  }

  function initDropdown() {
    var select = document.getElementById('conversion_goal');
    if (!select) return;
    select.innerHTML = [
      '<option value="">Conversion-Ziel auswählen...</option>',
      '<optgroup label="PRIMARY CONVERSIONS (Sales &amp; Umsatz)">',
        '<option value="Demo-Anfrage">Demo-Anfrage</option>',
        '<option value="Angebotsanfrage / Pricing Request">Angebotsanfrage / Pricing Request</option>',
        '<option value="Audit / Assessment buchen">Audit / Assessment buchen</option>',
        '<option value="Software-Lizenz / SaaS-Abo (Kauf)">Software-Lizenz / SaaS-Abo (Kauf)</option>',
        '<option value="Produktkauf (physisch oder digital)">Produktkauf (physisch oder digital)</option>',
        '<option value="Upgrade / Planwechsel">Upgrade / Planwechsel</option>',
        '<option value="Terminanfrage">Terminanfrage</option>',
      '</optgroup>',
      '<optgroup label="PRODUCT-LED CONVERSIONS (PLG)">',
        '<option value="Freemium (Free Plan gestartet)">Freemium (Free Plan gestartet)</option>',
        '<option value="Kostenlose Testversion (Trial)">Kostenlose Testversion (Trial)</option>',
        '<option value="Product Signup (ohne Sales-Kontakt)">Product Signup (ohne Sales-Kontakt)</option>',
        '<option value="Early Access / Beta Signup">Early Access / Beta Signup</option>',
      '</optgroup>',
      '<optgroup label="LEADS, EVENTS &amp; SUBSCRIPTIONS">',
        '<option value="Content Download (Whitepaper, Case Study, E-Book)">Content Download (Lead Magnet)</option>',
        '<option value="Webinar-Anmeldung">Webinar-Anmeldung</option>',
        '<option value="Event-Registrierung (kostenlos)">Event-Registrierung (kostenlos)</option>',
        '<option value="Event-Ticket / Schulungsbuchung">Event-Ticket / Schulungsbuchung</option>',
        '<option value="Newsletter-Anmeldung">Newsletter-Anmeldung</option>',
      '</optgroup>',
      '<optgroup label="KONTAKT &amp; INTERAKTION">',
        '<option value="Sales-Kontaktanfrage (High Intent)">Sales-Kontaktanfrage (High Intent)</option>',
        '<option value="Live-Chat gestartet (Pre-Sales)">Live-Chat gestartet (Pre-Sales)</option>',
        '<option value="Support-Anfrage (Bestandskunden)">Support-Anfrage (Bestandskunden)</option>',
      '</optgroup>',
      '<optgroup label="ENGAGEMENT &amp; INTENT (Micro-Conversions)">',
        '<option value="Pricing-Seite besucht">Pricing-Seite besucht</option>',
        '<option value="Produktvergleich angesehen">Produktvergleich angesehen</option>',
        '<option value="Interaktives Tool / Calculator genutzt">Interaktives Tool / Calculator genutzt</option>',
        '<option value="Video Completion">Video Completion</option>',
        '<option value="Ressourcen- oder Blog-Seite besucht">Ressourcen- oder Blog-Seite besucht</option>',
        '<option value="Externe Weiterleitung (Partner, Marketplace, App Store)">Externe Weiterleitung</option>',
      '</optgroup>',
    ].join('');
  }

  function injectHiddenFields(formEl, member) {
    function setHidden(name, value) {
      var existing = formEl.querySelector('input[name="' + name + '"]');
      if (existing) { existing.value = value; return; }
      var input = document.createElement('input');
      input.type  = 'hidden';
      input.name  = name;
      input.value = value;
      formEl.appendChild(input);
    }
    setHidden('memberstack_id', member.id);
    setHidden('email', member.email || '');
  }

  // ── App ──────────────────────────────────────────────────────────────────────

  async function run() {
    var member = await getCurrentMember();
    if (!member.id) {
      window.location.href = '/analyse/fehler';
      return;
    }

    // Dropdown + Hidden Fields initialisieren
    initDropdown();
    injectHiddenFields(document.querySelector('form'), member);

    // Credits laden und anzeigen
    var credits = await fetchCredits(member.id);
    var total   = credits ? calcCredits(credits) : 0;
    renderCredits(total);

    if (total <= 0) {
      setSubmitButton('disabled', 'Keine Analysen verfügbar');
      return;
    }

    // Submit-Handler einmalig registrieren
    var form = document.querySelector('form');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      var urlValue = (form.querySelector('input[name="landing_page_url"]')?.value || '').trim();
      if (!urlValue) {
        showUrlError();
        return;
      }

      setSubmitButton('loading', 'Wird gestartet...');

      try {
        await submitAnalysis(form, member.id);
      } catch (err) {
        console.error('[CVZ] Submit error:', err);
        setSubmitButton('idle', 'Analyse starten');
        window.location.href = '/analyse/fehler';
      }
    });
  }

  function init() {
    retry(depsReady, CONFIG.maxInitAttempts, CONFIG.initRetryMs)
      .then(function () { return run(); })
      .catch(function (err) {
        console.error('[CVZ] Init failed:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
