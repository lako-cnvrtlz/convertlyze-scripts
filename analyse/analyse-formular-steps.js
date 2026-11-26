/**
 * Convertlyze: Analyse-Formular in Schritten (Embed-Variante)
 *
 * Ersetzt das Webflow-Formular. Der Start der Analyse bleibt wie in analyse-formular.js:
 * Credits-Check, Memberstack-Token, POST an den Analyse-Worker, Weiterleitung.
 *
 * Einbindung in Webflow (Embed-Element an der Stelle des Formulars):
 *   <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@COMMIT/analyse-formular-steps.css">
 *   <div id="cvz-analyse-app"></div>
 *   <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@COMMIT/analyse-formular-steps.js"></script>
 * Das alte Form-Element und analyse-formular.js von der Seite nehmen.
 *
 * Feldnamen: abgeglichen mit dem Webflow-Formular "analyzer" (keyword, landing_page_url, target_audience,
 * conversion_goal, competitor_url). memberstack_id und email schickt wie bisher das Script.
 */
(function () {
  'use strict';

  var CONFIG = {
    apiBase:   'https://convertlyze-agent-api-production.up.railway.app',
    workerUrl: 'https://convertlyze-analysis-worker-production.up.railway.app/api/analyze',
    mountId:   'cvz-analyse-app',
    draftKey:  'cvz_analyse_draft_v1',
    // Feldnamen im Body an den Worker (wie im Webflow-Formular "analyzer").
    fields: {
      url:        'landing_page_url',
      keyword:    'keyword',
      goal:       'conversion_goal',
      audience:   'target_audience',
      competitor: 'competitor_url'
    },
    // Pflichtfelder. Wettbewerber optional, bis klar ist, ob der Worker ihn zwingend braucht.
    required: { url: true, keyword: true, goal: true, audience: false, competitor: false },
    maxInitAttempts: 30,
    initRetryMs: 300
  };

  var GOALS = [
    ['PRIMARY CONVERSIONS (Sales & Umsatz)', ['Demo-Anfrage', 'Angebotsanfrage / Pricing Request', 'Audit / Assessment buchen', 'Kostenloses Analyse / Ersteinschätzung beauftragen', 'Software-Lizenz / SaaS-Abo (Kauf)', 'Produktkauf (physisch oder digital)', 'Upgrade / Planwechsel', 'Terminanfrage']],
    ['PRODUCT-LED CONVERSIONS (PLG)', ['Freemium (Free Plan gestartet)', 'Kostenlose Testversion (Trial)', 'Product Signup (ohne Sales-Kontakt)', 'Early Access / Beta Signup']],
    ['LEADS, EVENTS & SUBSCRIPTIONS', ['Content Download (Whitepaper, Case Study, E-Book)', 'Webinar-Anmeldung', 'Event-Registrierung (kostenlos)', 'Event-Ticket / Schulungsbuchung', 'Newsletter-Anmeldung']],
    ['KONTAKT & INTERAKTION', ['Beratungsanfrage (Pre Sales)', 'Live-Chat gestartet (Pre Sales)', 'Support-Anfrage (Bestandskunden)']],
    ['ENGAGEMENT & INTENT (Micro-Conversions)', ['Pricing-Seite besucht', 'Produktvergleich angesehen', 'Interaktives Tool / Calculator genutzt', 'Video Completion', 'Ressourcen- oder Blog-Seite besucht', 'Externe Weiterleitung (Partner, Marketplace, App Store)']]
  ];

  var STEPS = ['Seite', 'Ziel', 'Wettbewerber', 'Start'];
  var state = { step: 0, url: '', keyword: '', goal: '', audience: '', competitor: '', credits: null, busy: false, error: '' };
  var member = null;
  var root = null;

  // ── Hilfen ─────────────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function retry(fn, n, ms) { return new Promise(function (res, rej) { var i = 0; (function t() { if (fn()) return res(); if (++i >= n) return rej(new Error('timeout')); setTimeout(t, ms); })(); }); }
  function depsReady() { return !!window.$memberstackDom && typeof window.$memberstackDom.getMemberCookie === 'function'; }
  function saveDraft() { try { sessionStorage.setItem(CONFIG.draftKey, JSON.stringify({ step: state.step, url: state.url, keyword: state.keyword, goal: state.goal, audience: state.audience, competitor: state.competitor })); } catch (e) {} }
  function loadDraft() { try { var d = JSON.parse(sessionStorage.getItem(CONFIG.draftKey) || 'null'); if (d) { ['url', 'keyword', 'goal', 'audience', 'competitor'].forEach(function (k) { state[k] = d[k] || ''; }); state.step = Math.min(d.step || 0, STEPS.length - 1); } } catch (e) {} }
  function clearDraft() { try { sessionStorage.removeItem(CONFIG.draftKey); } catch (e) {} }

  function normalizeUrl(v) {
    v = (v || '').trim();
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try { var u = new URL(v); if (!u.hostname || u.hostname.indexOf('.') === -1) return ''; return u.href; } catch (e) { return ''; }
  }

  // ── Daten (wie analyse-formular.js) ────────────────────────────────────────
  async function getMember() {
    var r = await window.$memberstackDom.getCurrentMember();
    return { id: r && r.data && r.data.id || null, email: r && r.data && (r.data.auth && r.data.auth.email || r.data.email) || null };
  }
  async function getToken() {
    try { var c = await window.$memberstackDom.getMemberCookie(); return typeof c === 'string' ? c : (c && c.data) || null; } catch (e) { return null; }
  }
  async function fetchCredits() {
    var token = await getToken(); if (!token) return null;
    try {
      var res = await fetch(CONFIG.apiBase + '/api/user/effective-credits', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) return null;
      var d = await res.json(); return d.credits || null;
    } catch (e) { return null; }
  }
  function calcCredits(d) {
    var plan = Math.max(0, (parseFloat(d.credits_limit) || 0) - (parseFloat(d.credits_used_current_period) || 0) - (parseFloat(d.reserved_credits) || 0));
    var ppu = Math.max(0, (parseInt(d.ppu_credits) || 0) - (parseInt(d.reserved_ppu_credits) || 0));
    return plan + ppu;
  }
  function track(credits, next) {
    var done = false; function go() { if (done) return; done = true; next(); }
    try {
      var planLeft = Math.max(0, (parseFloat(credits.credits_limit) || 0) - (parseFloat(credits.credits_used_current_period) || 0) - (parseFloat(credits.reserved_credits) || 0));
      var lic = String(credits.license_type || '').toLowerCase();
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'analysis_start', plan: planLeft > 0 ? (lic === 'free' ? 'test' : 'plan') : 'ppu', eventCallback: go, eventTimeout: 1500 });
    } catch (e) {}
    setTimeout(go, 1500);
  }

  async function submit() {
    state.busy = true; state.error = ''; render();
    try {
      var credits = await fetchCredits();
      if (!credits || calcCredits(credits) <= 0) { window.location.href = '/analyse/fehler'; return; }
      var token = await getToken();
      if (!token) { window.location.href = '/analyse/fehler'; return; }
      var f = CONFIG.fields, payload = { memberstack_id: member.id, email: member.email || '' };
      payload[f.url] = normalizeUrl(state.url); payload[f.keyword] = state.keyword.trim(); payload[f.goal] = state.goal;
      payload[f.audience] = state.audience.trim(); payload[f.competitor] = normalizeUrl(state.competitor);
      var res = await fetch(CONFIG.workerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) });
      var data = null; try { data = await res.json(); } catch (e) {}
      if (res.ok && data && data.success === true) { clearDraft(); track(credits, function () { window.location.href = '/analyse/in-arbeit'; }); return; }
      if (res.status === 503) { state.busy = false; state.error = (data && data.message) || 'Gerade sind sehr viele Analysen in Arbeit. Bitte versuche es in ein paar Minuten erneut.'; render(); return; }
      window.location.href = '/analyse/fehler';
    } catch (e) {
      console.error('[CVZ] Submit error:', e);
      window.location.href = '/analyse/fehler';
    }
  }

  // ── Validierung ────────────────────────────────────────────────────────────
  function validate(step) {
    var bad = [], msg = '';
    if (step === 0) {
      if (!normalizeUrl(state.url)) { bad.push('url'); msg = 'Bitte gib die URL deiner Landingpage ein, zum Beispiel https://deine-seite.de.'; }
      else if (CONFIG.required.keyword && !state.keyword.trim()) { bad.push('keyword'); msg = 'Bitte nenne das Thema oder Keyword der Seite.'; }
    }
    if (step === 1) {
      if (CONFIG.required.goal && !state.goal) { bad.push('goal'); msg = 'Bitte wähle das wichtigste Conversion-Ziel.'; }
      else if (CONFIG.required.audience && !state.audience.trim()) { bad.push('audience'); msg = 'Bitte beschreibe die Zielgruppe.'; }
    }
    if (step === 2) {
      var c = state.competitor.trim();
      if (c && !normalizeUrl(c)) { bad.push('competitor'); msg = 'Das ist keine gültige URL.'; }
      else if (CONFIG.required.competitor && !c) { bad.push('competitor'); msg = 'Bitte gib einen Wettbewerber an.'; }
    }
    return { bad: bad, msg: msg };
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function field(id, label, input, hint) { return '<label for="cvz-an-' + id + '">' + label + '</label>' + input + (hint ? '<p class="cvz-an-hint">' + hint + '</p>' : ''); }
  function textInput(id, ph, val, type) { return '<input id="cvz-an-' + id + '" data-k="' + id + '" type="' + (type || 'text') + '" placeholder="' + esc(ph) + '" value="' + esc(val) + '" autocomplete="off">'; }
  function goalSelect() {
    var o = '<option value="">Conversion-Ziel auswählen ...</option>';
    GOALS.forEach(function (g) { o += '<optgroup label="' + esc(g[0]) + '">' + g[1].map(function (x) { return '<option value="' + esc(x) + '"' + (state.goal === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</optgroup>'; });
    return '<select id="cvz-an-goal" data-k="goal">' + o + '</select>';
  }
  function row(k, v) { return '<div class="cvz-an-row"><div class="cvz-an-k">' + k + '</div><div class="cvz-an-v">' + (v ? esc(v) : '<span style="color:#8b949e">nicht angegeben</span>') + '</div></div>'; }

  function body() {
    if (state.step === 0) return '<h2>Welche Seite soll geprüft werden?</h2><p class="cvz-an-sub">Öffentlich erreichbare Seiten, keine Installation nötig.</p>' +
      field('url', 'URL der Landingpage', textInput('url', 'https://deine-landingpage.de', state.url)) +
      field('keyword', 'Thema oder primäres Keyword', textInput('keyword', 'z. B. B2B Marketing Automation', state.keyword), 'Daran misst die Analyse den Search Intent.');
    if (state.step === 1) return '<h2>Was soll ein Besucher tun?</h2><p class="cvz-an-sub">Ziel und Zielgruppe bestimmen den Maßstab der Analyse.</p>' +
      field('goal', 'Primäres Conversion-Ziel', goalSelect()) +
      field('audience', 'Hauptzielgruppe (Persona), optional', textInput('audience', 'z. B. Marketing-Leiter in KMUs', state.audience), '<a href="https://www.convertlyze.com/content-hub/icp-generator" target="_blank" rel="noopener" style="color:#4fd1c5">Unsicher? Kostenloser ICP- und Persona-Assistent</a>');
    if (state.step === 2) return '<h2>Wer ist dein wichtigster Wettbewerber?</h2><p class="cvz-an-sub">Für die Differenzierungsanalyse.</p>' +
      field('competitor', 'Wettbewerber-URL' + (CONFIG.required.competitor ? '' : ', optional'), textInput('competitor', 'https://dein-wichtigster-wettbewerber.de', state.competitor), 'Die Seite des Wettbewerbers wird mit deiner verglichen.');
    var c = state.credits;
    return '<h2>Alles bereit?</h2><p class="cvz-an-sub">Die Analyse dauert 8 bis 10 Minuten. Du kannst den Tab schließen.</p><div class="cvz-an-sum">' +
      row('URL', normalizeUrl(state.url)) + row('Thema', state.keyword) + row('Conversion-Ziel', state.goal) + row('Zielgruppe', state.audience) + row('Wettbewerber', normalizeUrl(state.competitor)) + '</div>' +
      (c == null ? '' : '<div class="cvz-an-credits">Verfügbare Analysen: <b>' + c + '</b></div>');
  }

  function render() {
    if (!root) return;
    var last = state.step === STEPS.length - 1;
    var noCredits = state.credits != null && state.credits <= 0;
    var steps = STEPS.map(function (s, i) { return '<div class="cvz-an-step ' + (i === state.step ? 'active' : i < state.step ? 'done' : '') + '">' + (i + 1) + ' · ' + s + '</div>'; }).join('');
    root.innerHTML = '<div class="cvz-an"><div class="cvz-an-card"><div class="cvz-an-steps">' + steps + '</div>' + body() +
      '<p class="cvz-an-err" role="alert">' + esc(state.error) + '</p>' +
      '<div class="cvz-an-nav"><button type="button" class="cvz-an-back" data-act="back" style="visibility:' + (state.step === 0 ? 'hidden' : 'visible') + '">← Zurück</button>' +
      '<button type="button" class="cvz-an-primary" data-act="next"' + ((state.busy || (last && noCredits)) ? ' disabled' : '') + '>' + (state.busy ? 'Wird gestartet ...' : last ? (noCredits ? 'Keine Analysen verfügbar' : 'Analyse starten') : 'Weiter →') + '</button></div></div></div>';
  }

  function onInput(e) { var k = e.target && e.target.getAttribute('data-k'); if (!k) return; state[k] = e.target.value; e.target.classList.remove('cvz-an-bad'); saveDraft(); }
  function onClick(e) {
    var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act'); if (!act || state.busy) return;
    if (act === 'back') { state.step = Math.max(0, state.step - 1); state.error = ''; saveDraft(); render(); return; }
    var v = validate(state.step);
    if (v.msg) { state.error = v.msg; render(); v.bad.forEach(function (k) { var el = document.getElementById('cvz-an-' + k); if (el) { el.classList.add('cvz-an-bad'); } }); var f = document.getElementById('cvz-an-' + v.bad[0]); if (f) f.focus(); return; }
    state.error = '';
    if (state.step === STEPS.length - 1) { submit(); return; }
    state.step += 1; saveDraft(); render();
    try { root.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (x) {}
  }
  function onKey(e) { if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') { e.preventDefault(); var b = root.querySelector('[data-act="next"]'); if (b) b.click(); } }

  async function run() {
    root = document.getElementById(CONFIG.mountId);
    if (!root) { console.warn('[CVZ] Mount #' + CONFIG.mountId + ' fehlt'); return; }
    member = await getMember();
    if (!member.id) { window.location.href = '/analyse/fehler'; return; }
    loadDraft(); render();
    root.addEventListener('input', onInput); root.addEventListener('change', onInput);
    root.addEventListener('click', onClick); root.addEventListener('keydown', onKey);
    var c = await fetchCredits();
    state.credits = c ? calcCredits(c) : 0; render();
  }

  function init() { retry(depsReady, CONFIG.maxInitAttempts, CONFIG.initRetryMs).then(run).catch(function (e) { console.error('[CVZ] Init failed:', e); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
