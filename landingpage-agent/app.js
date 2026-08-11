// ==================== KONFIGURATION ====================
const API_BASE = 'https://convertlyze-agent-api-production.up.railway.app';

// ==================== IDENTITAET (echter Memberstack-Login) ====================
let cvzMemberstackId = null;
let cvzResolvedUserId = null;

function cvzAuthHeaders() {
  return {
    'Authorization': `Bearer ${cvzMemberstackId}`,
    'Content-Type': 'application/json'
  };
}
function cvzUserId() {
  return cvzResolvedUserId;
}

function cvzWaitForMemberstack(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.$memberstackDom) return resolve(window.$memberstackDom);
      if (Date.now() - start > timeoutMs) return reject(new Error('Memberstack wurde nicht geladen.'));
      setTimeout(check, 100);
    };
    check();
  });
}

async function cvzResolveIdentity() {
  try {
    const memberstackDom = await cvzWaitForMemberstack();
    const { data: member } = await memberstackDom.getCurrentMember();
    if (!member) return false;

    cvzMemberstackId = member.id;

    const res = await fetch(`${API_BASE}/api/page-agent/me`, {
      headers: { 'Authorization': `Bearer ${cvzMemberstackId}` }
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.user_id) return false;

    cvzResolvedUserId = data.user_id;
    return true;
  } catch (e) {
    console.error('Identitaets-Aufloesung fehlgeschlagen:', e.message);
    return false;
  }
}

// ==================== FORMULAR-STATE ====================
const cvzState = {
  step: 0,
  keyword: '',
  // Entweder ein fester Slug (z.B. 'saas') oder der Freitext aus
  // "Eigene Eingabe" - beides landet in derselben DB-Spalte.
  business_type: '',
  target_audience: '',
  conversion_goal: '',
  funnel_stage: '',
  usps: [],
  features: [],
  existing_content: '',
  reference_urls: [],
  brand_reference_url: '',
  brand_color: '',
  customer_reasons: '',
  no_customer_reasons: false,
  pdfExtracts: [],
  competitorSuggestions: [],
  // Vom URL-Filter aussortierte Vorschlaege - bleiben einklappbar sichtbar,
  // damit ein faelschlich gefilterter Treffer nicht verloren geht.
  filteredOutCompetitors: [],
  manualCompetitors: []
};

const STEP_LABELS = ['Thema', 'Ziel', 'Angebot', 'Wettbewerber'];

function cvzRenderSteps() {
  const el = document.getElementById('cvz-steps');
  el.innerHTML = STEP_LABELS.map((label, i) => {
    const cls = i === cvzState.step ? 'active' : (i < cvzState.step ? 'done' : '');
    return `<div class="step ${cls}">${i + 1} · ${label}</div>`;
  }).join('');
}

function cvzShowError(msg) {
  const el = document.getElementById('cvz-error');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

// ==================== SCHRITT 0: THEMA ====================

// ACHTUNG - DIE VERBINDLICHE LISTE LIEGT IM BACKEND.
// value = Wert, der an /api/page-agent/brief geschickt und in Supabase
//         (Spalte business_type, text null - kein Constraint) gespeichert wird.
// label = reiner Anzeigetext im Formular.
//
// Die fuenf festen Slugs muessen der Whitelist in der Flask-Validierung
// entsprechen - dort, wo "Ungueltiger Business-Typ" geworfen wird.
// Sie sind GERATEN und vor dem Deploy gegen den Backend-Code abzugleichen.
//
// Bei "Eigene Eingabe" wird der Freitext DIREKT als business_type
// gespeichert. Voraussetzung: die Flask-Whitelist laesst freie Werte zu
// (siehe Chat) - sonst kippt der Launch mit "Ungueltiger Business-Typ".
//
// Preis dieser Entscheidung: in der Spalte stehen ab jetzt Slugs UND
// Freitext gemischt. Auswertungen nach Kategorie funktionieren nur noch
// fuer die fuenf festen Werte, alles andere ist ein Sammelbecken mit
// Varianten wie "Ausbildungsanbieter" und "Ausbildungs-Anbieter".
const CVZ_BUSINESS_TYPES = [
  { value: 'saas',               label: 'SaaS / Software' },
  { value: 'beratung',           label: 'Beratung / Agentur' },
  { value: 'dienstleistung',     label: 'Dienstleistung' },
  { value: 'physisches_produkt', label: 'Physisches Produkt' },
  { value: 'marktplatz',         label: 'Marktplatz / Plattform' }
];
// Nur ein Marker fuer die Dropdown-Option - wird NIE gespeichert oder
// verschickt. Der doppelte Unterstrich macht eine Kollision mit einer
// echten Nutzereingabe praktisch unmoeglich.
const CVZ_BUSINESS_TYPE_CUSTOM = '__custom__';
const CVZ_BUSINESS_TYPE_MAXLEN = 60;

// Freitext liegt vor, wenn ein Wert gesetzt ist, der nicht zu den festen
// Slugs gehoert. So ueberlebt die Auswahl auch das Zurueckspringen von
// Schritt 2 auf Schritt 1, bei dem das Formular neu gerendert wird.
function cvzBusinessTypeIsCustom() {
  return !!cvzState.business_type &&
    !CVZ_BUSINESS_TYPES.some(t => t.value === cvzState.business_type);
}

function cvzRenderBusinessTypeField() {
  const isCustom = cvzBusinessTypeIsCustom();

  const options = CVZ_BUSINESS_TYPES.map(t => `
    <option value="${cvzEsc(t.value)}" ${cvzState.business_type === t.value ? 'selected' : ''}>${cvzEsc(t.label)}</option>
  `).join('');

  return `
    <label class="cvz-label">Produktkategorie</label>
    <div class="cvz-select-wrap">
      <select class="cvz-input" id="cvz-in-business-type" onchange="cvzToggleBusinessTypeCustom(this.value)">
        <option value="" ${!cvzState.business_type ? 'selected' : ''}>Bitte wählen …</option>
        ${options}
        <option value="${CVZ_BUSINESS_TYPE_CUSTOM}" ${isCustom ? 'selected' : ''}>→ Eigene Eingabe …</option>
      </select>
    </div>
    <input class="cvz-input ${isCustom ? '' : 'cvz-hidden'}" id="cvz-in-business-type-custom"
      type="text" maxlength="${CVZ_BUSINESS_TYPE_MAXLEN}"
      placeholder="z.B. Ausbildungsanbieter" aria-label="Eigene Produktkategorie"
      value="${isCustom ? cvzEsc(cvzState.business_type) : ''}">
    <p class="cvz-hint">Bestimmt, welche Vergleichsmaßstäbe für Hero, Conversion und Differenzierung angelegt werden.</p>
  `;
}

function cvzToggleBusinessTypeCustom(value) {
  const custom = document.getElementById('cvz-in-business-type-custom');
  if (!custom) return;
  const isCustom = value === CVZ_BUSINESS_TYPE_CUSTOM;
  custom.classList.toggle('cvz-hidden', !isCustom);
  if (isCustom) {
    custom.focus();
  } else {
    custom.value = '';
  }
}

// Schreibt den finalen Wert in den State: entweder einen festen Slug oder
// den bereinigten Freitext.
//
// Die Bereinigung hier ist Komfort, kein Schutz - maxlength und dieser
// slice sind clientseitig und trivial umgehbar. Der Wert landet spaeter
// im SP1-Prompt und ist das einzige voellig freie Feld im Briefing, die
// verbindliche Pruefung gehoert deshalb in die Flask-Schicht.
function cvzReadBusinessType() {
  const select = document.getElementById('cvz-in-business-type');
  const custom = document.getElementById('cvz-in-business-type-custom');
  if (!select) return;

  if (select.value !== CVZ_BUSINESS_TYPE_CUSTOM) {
    cvzState.business_type = select.value;
    return;
  }

  cvzState.business_type = String(custom ? custom.value : '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, CVZ_BUSINESS_TYPE_MAXLEN);
}

function cvzRenderStep0() {
  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Worum geht es?</h1>
    <p class="cvz-subtitle">Da eure Landingpage noch nicht existiert: Gib das Thema/Ziel-Keyword ein, nicht eine URL.</p>
    <label class="cvz-label">Thema / Ziel-Keyword</label>
    <input class="cvz-input" id="cvz-in-keyword" placeholder="z.B. landingpage analyse" value="${cvzEsc(cvzState.keyword)}">
    ${cvzRenderBusinessTypeField()}
    <label class="cvz-label">Hauptzielgruppe (Persona)</label>
    <input class="cvz-input" id="cvz-in-audience" placeholder="z.B. Marketing-Leiter in KMUs" value="${cvzEsc(cvzState.target_audience)}">
    <p class="cvz-hint"><a href="https://www.convertlyze.com/content-hub/icp-generator" target="_blank" rel="noopener" style="color:var(--cvz-teal);">Unsicher bei deiner Zielgruppe? → Kostenloser ICP- & Persona-Assistent</a></p>
  `;
  document.getElementById('cvz-btn-back').style.visibility = 'hidden';
}

// ==================== SCHRITT 1: ZIEL ====================

const CONVERSION_GOAL_GROUPS = {
  'Primary Conversions (Sales & Umsatz)': [
    'Demo-Anfrage', 'Angebotsanfrage / Pricing Request', 'Audit / Assessment buchen',
    'Kostenlose Analyse / Ersteinschätzung beauftragen', 'Software-Lizenz / SaaS-Abo (Kauf)',
    'Produktkauf (physisch oder digital)', 'Upgrade / Planwechsel', 'Terminanfrage'
  ],
  'Product-Led Conversions (PLG)': [
    'Freemium (Free Plan gestartet)', 'Kostenlose Testversion (Trial)',
    'Product Signup (ohne Sales-Kontakt)', 'Early Access / Beta Signup'
  ],
  'Leads, Events & Subscriptions': [
    'Content Download (Lead Magnet)', 'Webinar-Anmeldung', 'Event-Registrierung (kostenlos)',
    'Event-Ticket / Schulungsbuchung', 'Newsletter-Anmeldung'
  ],
  'Kontakt & Interaktion': [
    'Beratungsanfrage (Pre Sales)', 'Live-Chat gestartet (Pre Sales)', 'Support-Anfrage (Bestandskunden)'
  ],
  'Engagement & Intent (Micro-Conversions)': [
    'Pricing-Seite besucht', 'Produktvergleich angesehen', 'Interaktives Tool / Calculator genutzt',
    'Video Completion', 'Ressourcen- oder Blog-Seite besucht', 'Externe Weiterleitung'
  ]
};

function cvzRenderStep1() {
  const optgroups = Object.entries(CONVERSION_GOAL_GROUPS).map(([group, options]) => `
    <optgroup label="${cvzEsc(group)}">
      ${options.map(o => `<option value="${cvzEsc(o)}" ${cvzState.conversion_goal === o ? 'selected' : ''}>${cvzEsc(o)}</option>`).join('')}
    </optgroup>
  `).join('');

  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Was soll auf der Seite passieren?</h1>
    <p class="cvz-subtitle">Conversion-Ziel und Phase der Kaufentscheidung.</p>
    <label class="cvz-label">Conversion-Ziel</label>
    <div class="cvz-select-wrap">
      <select class="cvz-input" id="cvz-in-goal">
        <option value="" disabled ${!cvzState.conversion_goal ? 'selected' : ''}>Conversion-Ziel auswählen …</option>
        ${optgroups}
      </select>
    </div>
    <label class="cvz-label">Funnel-Stage</label>
    <div class="cvz-choice-row" id="cvz-funnel-choices">
      ${[
        { v: 'awareness', l: 'Awareness' },
        { v: 'consideration', l: 'Consideration' },
        { v: 'decision', l: 'Decision' },
        { v: 'full_journey', l: 'Komplette Journey' }
      ].map(({ v, l }) => `
        <div class="cvz-choice ${cvzState.funnel_stage === v ? 'selected' : ''}" data-value="${v}" onclick="cvzSelectFunnel('${v}')">
          ${l}
        </div>`).join('')}
    </div>
  `;
  document.getElementById('cvz-btn-back').style.visibility = 'visible';
}
function cvzSelectFunnel(value) {
  cvzState.funnel_stage = value;
  document.querySelectorAll('#cvz-funnel-choices .cvz-choice').forEach(el => {
    el.classList.toggle('selected', el.dataset.value === value);
  });
}

// ==================== SCHRITT 2: ANGEBOT ====================

function cvzRenderStep2() {
  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Was macht euch aus?</h1>
    <p class="cvz-subtitle">USPs und Features einzeln eintragen, Enter druecken zum Hinzufuegen.</p>
    <label class="cvz-label">USPs</label>
    <input class="cvz-input" id="cvz-in-usp" placeholder="USP eingeben, Enter druecken" onkeydown="cvzAddChipOnEnter(event,'usps','cvz-usp-chips')">
    <div class="cvz-chip-row" id="cvz-usp-chips">${cvzRenderChips(cvzState.usps, 'usps')}</div>
    <label class="cvz-label">Features</label>
    <input class="cvz-input" id="cvz-in-feature" placeholder="Feature eingeben, Enter druecken" onkeydown="cvzAddChipOnEnter(event,'features','cvz-feature-chips')">
    <div class="cvz-chip-row" id="cvz-feature-chips">${cvzRenderChips(cvzState.features, 'features')}</div>

    <label class="cvz-label">Häufigste Kauf-/Wechselgründe von Kunden (optional)</label>
    <textarea class="cvz-input" id="cvz-in-customer-reasons" placeholder="Was hast du von Kunden im Verkaufsgespräch oder Support am häufigsten als Grund gehört?" ${cvzState.no_customer_reasons ? 'disabled' : ''}>${cvzEsc(cvzState.customer_reasons)}</textarea>
    <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:0.85rem; color:var(--cvz-text-muted); cursor:pointer; font-weight:400;">
      <input type="checkbox" id="cvz-in-no-customer-reasons" ${cvzState.no_customer_reasons ? 'checked' : ''} onchange="cvzToggleNoCustomerReasons(this.checked)">
      Keine Informationen vorhanden
    </label>
    <p class="cvz-hint">Das ist die Kundenperspektive, nicht eure eigene - oft aussagekräftiger als USPs/Features fürs Storytelling.</p>

    <label class="cvz-label">Referenz-Links (optional)</label>
    <input class="cvz-input" id="cvz-in-refurl" placeholder="URL eingeben, Enter druecken (Seite oder YouTube-Video)" onkeydown="cvzAddRefUrlOnEnter(event)">
    <div class="cvz-chip-row" id="cvz-refurl-chips">${cvzRenderRefUrlChips()}</div>
    <p class="cvz-hint">Bis zu 3 Links werden vom Assistenten tatsaechlich abgerufen.</p>

    <label class="cvz-label">PDF hochladen (optional)</label>
    <input type="file" accept="application/pdf" id="cvz-in-pdf" onchange="cvzUploadPdf(event)">
    <div id="cvz-pdf-status" style="margin-top:8px;"></div>
    <div class="cvz-chip-row" id="cvz-pdf-chips">${cvzRenderPdfChips()}</div>

    <label class="cvz-label">Eure Markenfarbe (optional)</label>
    <div style="display:flex; gap:10px; align-items:center;">
      <input type="color" id="cvz-in-brand-color-picker" value="${/^#([0-9a-fA-F]{6})$/.test(cvzState.brand_color) ? cvzState.brand_color : '#4f46e5'}" style="width:44px; height:40px; padding:2px; border-radius:8px; border:1px solid var(--cvz-border); background:var(--cvz-bg); cursor:pointer;" oninput="cvzSyncBrandColorFromPicker(this.value)">
      <input class="cvz-input" id="cvz-in-brand-color" placeholder="#4f46e5" value="${cvzEsc(cvzState.brand_color)}" style="flex:1;" oninput="cvzSyncBrandColorFromText(this.value)">
    </div>
    <p class="cvz-hint">Direkte Eingabe hat Vorrang vor der automatischen Erkennung aus der Website unten - keine Bestaetigung im Chat noetig, da hier eindeutig.</p>

    <label class="cvz-label">Eure Website fuer den Marken-Look (optional)</label>
    <input class="cvz-input" id="cvz-in-brand-url" placeholder="https://eure-website.de" value="${cvzEsc(cvzState.brand_reference_url)}">
    <p class="cvz-hint">Nur relevant, wenn oben keine Farbe eingetragen ist - dann versucht der Assistent, sie automatisch zu erkennen und schlaegt sie dir zur Bestaetigung vor.</p>

    <label class="cvz-label">Sonstiger Kontext (optional)</label>
    <textarea class="cvz-input" id="cvz-in-existing" placeholder="Weitere Hinweise fuer den Assistenten, die nicht in ein Feld oben passen">${cvzEsc(cvzState.existing_content)}</textarea>
  `;
}

function cvzRenderRefUrlChips() {
  return cvzState.reference_urls.map((url, i) => `
    <span class="cvz-chip">${cvzEsc(url)} <button onclick="cvzRemoveRefUrl(${i})">×</button></span>
  `).join('');
}
function cvzAddRefUrlOnEnter(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const val = event.target.value.trim();
  if (!val) return;
  try {
    new URL(val);
  } catch {
    cvzShowError(`"${val}" ist keine gueltige URL (mit https:// beginnen).`);
    return;
  }
  cvzShowError(null);
  cvzState.reference_urls.push(val);
  event.target.value = '';
  document.getElementById('cvz-refurl-chips').innerHTML = cvzRenderRefUrlChips();
}
function cvzRemoveRefUrl(i) {
  cvzState.reference_urls.splice(i, 1);
  document.getElementById('cvz-refurl-chips').innerHTML = cvzRenderRefUrlChips();
}

function cvzRenderPdfChips() {
  return cvzState.pdfExtracts.map((p, i) => `
    <span class="cvz-chip">📄 ${cvzEsc(p.filename)} <button onclick="cvzRemovePdf(${i})">×</button></span>
  `).join('');
}
async function cvzUploadPdf(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('cvz-pdf-status');
  statusEl.innerHTML = '<p class="cvz-hint">Extrahiere Text …</p>';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/api/page-agent/upload-pdf`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cvzMemberstackId}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen');

    cvzState.pdfExtracts.push({ filename: data.filename, text: data.text });
    document.getElementById('cvz-pdf-chips').innerHTML = cvzRenderPdfChips();
    statusEl.innerHTML = `<p class="cvz-hint" style="color:var(--cvz-teal);">Text aus "${cvzEsc(data.filename)}" erfolgreich extrahiert.</p>`;
  } catch (err) {
    statusEl.innerHTML = `<p class="cvz-hint" style="color:var(--cvz-danger);">${cvzEsc(err.message)}</p>`;
  } finally {
    event.target.value = '';
  }
}
function cvzRemovePdf(i) {
  cvzState.pdfExtracts.splice(i, 1);
  document.getElementById('cvz-pdf-chips').innerHTML = cvzRenderPdfChips();
}
function cvzRenderChips(list, field) {
  return list.map((val, i) => `
    <span class="cvz-chip">${cvzEsc(val)} <button onclick="cvzRemoveChip('${field}', ${i})">×</button></span>
  `).join('');
}
function cvzAddChipOnEnter(event, field, containerId) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const val = event.target.value.trim();
  if (!val) return;
  cvzState[field].push(val);
  event.target.value = '';
  document.getElementById(containerId).innerHTML = cvzRenderChips(cvzState[field], field);
}
function cvzRemoveChip(field, index) {
  cvzState[field].splice(index, 1);
  const containerId = field === 'usps' ? 'cvz-usp-chips' : 'cvz-feature-chips';
  document.getElementById(containerId).innerHTML = cvzRenderChips(cvzState[field], field);
}

// Escaped jetzt auch Anfuehrungszeichen. Vorher brach ein " im Wert
// (z.B. in einer USP oder einem Keyword) aus value="..." aus und
// zerlegte das Markup - der Fehler war still, das Feld blieb nur leer.
function cvzEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================== SCHRITT 3: WETTBEWERBER ====================
//
// Die Vorschlaege aus suggest-competitors enthalten regelmaessig
// YouTube-Videos, Blogartikel und Glossarseiten - URLs, die zum Keyword
// ranken, aber keine Landingpages sind. Werden sie mitanalysiert, kosten
// sie Credits und produzieren einen Vergleich ohne Aussagekraft.
//
// Filter in drei Stufen:
//   1. Host-Blocklist    - Plattformen, die nie Wettbewerber-LP sein koennen
//   2. Pfad-Blocklist    - Content- und Rechtsseiten derselben Domain
//   3. Scoring + Dedupe  - eine URL pro Domain, beste zuerst

const CVZ_MAX_COMPETITORS = 5;       // Hartes Limit fuer die Analyse
const CVZ_PRESELECT_COUNT = 3;       // Vorausgewaehlt beim ersten Rendern
const CVZ_MAX_SUGGESTIONS_SHOWN = 8; // Wie viele Vorschlaege angezeigt werden

// Suffix-Match: "youtube.com" trifft auch "www." und "m.youtube.com".
const CVZ_BLOCKED_HOSTS = [
  'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'twitch.tv',
  'wikipedia.org', 'wikimedia.org', 'wiktionary.org',
  'reddit.com', 'quora.com', 'gutefrage.net', 'stackexchange.com', 'stackoverflow.com',
  'linkedin.com', 'xing.com', 'facebook.com', 'instagram.com', 'threads.net',
  'twitter.com', 'x.com', 'tiktok.com', 'pinterest.com', 'pinterest.de',
  'medium.com', 'substack.com', 'blogspot.com', 'wordpress.com', 'tumblr.com',
  'github.com', 'gitlab.com', 'slideshare.net', 'scribd.com', 'issuu.com',
  'amazon.de', 'amazon.com', 'ebay.de', 'etsy.com', 'otto.de',
  'google.com', 'google.de', 'bing.com',
  'capterra.com', 'capterra.com.de', 'g2.com', 'omr.com', 'trustpilot.com',
  'chip.de', 'computerbild.de', 'heise.de', 'golem.de', 't3n.de',
  'handelsblatt.com', 'wiwo.de', 'spiegel.de', 'zeit.de', 'faz.net',
  'apple.com', 'play.google.com', 'apps.apple.com',
  'eventbrite.de', 'meetup.com', 'spotify.com'
];

// Segmentweiser Vergleich, KEIN includes() - sonst wuerde "news"
// in "/newsletter-software/" treffen und eine gueltige Seite wegwerfen.
const CVZ_BLOCKED_PATH_SEGMENTS = [
  'blog', 'blogs', 'news', 'newsroom', 'presse', 'press', 'pressemitteilung',
  'magazin', 'magazine', 'journal', 'insights', 'stories',
  'glossar', 'glossary', 'lexikon', 'wiki', 'wissen', 'wissensdatenbank',
  'ratgeber', 'guide', 'guides', 'tipps', 'tutorial', 'tutorials',
  'artikel', 'article', 'articles', 'beitrag', 'post', 'posts',
  'academy', 'akademie', 'kurs', 'kurse', 'webinar', 'webinare',
  'podcast', 'podcasts', 'video', 'videos', 'mediathek',
  'event', 'events', 'veranstaltung', 'veranstaltungen', 'messe',
  'karriere', 'career', 'careers', 'jobs', 'stellenangebote',
  'impressum', 'datenschutz', 'datenschutzerklaerung', 'privacy',
  'agb', 'terms', 'legal', 'cookie', 'cookies', 'nutzungsbedingungen',
  'kontakt', 'contact', 'ueber-uns', 'about', 'about-us', 'team',
  'faq', 'hilfe', 'help', 'support', 'docs', 'doku', 'dokumentation',
  'changelog', 'release-notes', 'status',
  'category', 'kategorie', 'tag', 'tags', 'author', 'autor',
  'suche', 'search', 'sitemap',
  'login', 'signin', 'anmelden', 'register', 'registrieren', 'account',
  'download', 'downloads', 'whitepaper', 'ebook', 'checkliste', 'vorlage', 'vorlagen'
];

// Sprechen fuer eine echte Angebotsseite - positiv im Scoring, keine Pflicht.
const CVZ_BONUS_PATH_SEGMENTS = [
  'produkt', 'produkte', 'product', 'products',
  'software', 'tool', 'tools', 'plattform', 'platform',
  'loesung', 'loesungen', 'solution', 'solutions',
  'leistungen', 'services', 'service',
  'features', 'funktionen', 'funktionsumfang',
  'preise', 'pricing', 'preis', 'tarife', 'kosten',
  'demo', 'testen', 'trial'
];

const CVZ_BLOCKED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
  '.mp4', '.mp3', '.xml', '.json', '.csv'
];

// Prueft eine einzelne URL.
// -> { ok, reason, host, path, url }
function cvzInspectUrl(rawUrl) {
  const result = { ok: false, reason: '', host: '', path: '', url: '' };
  let input = String(rawUrl || '').trim();
  if (!input) {
    result.reason = 'leer';
    return result;
  }

  // Ohne Protokoll parst der URL-Konstruktor nicht.
  if (!/^https?:\/\//i.test(input)) input = 'https://' + input;

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    result.reason = 'ungültige URL';
    return result;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.toLowerCase();

  result.host = host;
  result.path = path;
  result.url = parsed.origin + parsed.pathname + parsed.search;

  if (CVZ_BLOCKED_HOSTS.some(b => host === b || host.endsWith('.' + b))) {
    result.reason = 'keine Wettbewerber-Seite';
    return result;
  }

  if (CVZ_BLOCKED_EXTENSIONS.some(ext => path.endsWith(ext))) {
    result.reason = 'kein HTML';
    return result;
  }

  const segments = path.split('/').filter(Boolean);
  let hit = null;
  for (const seg of segments) {
    if (CVZ_BLOCKED_PATH_SEGMENTS.includes(seg)) { hit = seg; break; }
    // Datumspfade wie /2024/03/ sind praktisch immer Blog-Archive.
    if (/^(19|20)\d{2}$/.test(seg)) { hit = seg; break; }
  }
  if (hit) {
    result.reason = `Content-Seite (/${hit}/)`;
    return result;
  }

  result.ok = true;
  return result;
}

// Hoeher = eher eine echte Landingpage.
function cvzScoreUrl(info) {
  let score = 100;
  const segments = info.path.split('/').filter(Boolean);

  score -= segments.length * 12;                       // Tiefe im Baum
  if (segments.length === 0) score += 25;              // Startseite
  if (segments.some(s => CVZ_BONUS_PATH_SEGMENTS.includes(s))) score += 20;

  const last = segments[segments.length - 1] || '';
  if (last.length > 40) score -= 15;                   // Artikel-Slug
  if ((last.match(/-/g) || []).length >= 5) score -= 12;
  if ((info.host.match(/\./g) || []).length > 1) score -= 10; // Subdomain

  return score;
}

// Filtert, dedupliziert und sortiert die Rohvorschlaege.
// -> { items: [...], removed: [{url, reason}] }
function cvzFilterCompetitorSuggestions(rawList) {
  const items = [];
  const removed = [];
  const seenHosts = new Set();

  (rawList || []).forEach(entry => {
    const rawUrl = typeof entry === 'string' ? entry : (entry && entry.url) || '';
    const title = (entry && entry.title) || '';

    const info = cvzInspectUrl(rawUrl);
    if (!info.ok) {
      removed.push({ url: rawUrl, reason: info.reason });
      return;
    }

    // Eine URL pro Domain: drei Unterseiten desselben Anbieters
    // verbrauchen drei Slots fuer eine einzige Erkenntnis.
    if (seenHosts.has(info.host)) {
      removed.push({ url: rawUrl, reason: 'Domain bereits enthalten' });
      return;
    }
    seenHosts.add(info.host);

    items.push({
      url: info.url,
      host: info.host,
      title: title || info.host,
      score: cvzScoreUrl(info),
      selected: false,
      recommended: false
    });
  });

  items.sort((a, b) => b.score - a.score);
  return { items, removed };
}

function cvzTotalCompetitorCount() {
  return cvzState.competitorSuggestions.filter(s => s.selected).length + cvzState.manualCompetitors.length;
}

async function cvzRenderStep3() {
  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Wettbewerber bestätigen</h1>
    <p class="cvz-subtitle">Basierend auf eurem Thema — Vorschläge abwählen oder eigene ergänzen.</p>
    <div id="cvz-competitor-list"><p class="cvz-hint">Lade Vorschläge …</p></div>
    <div id="cvz-filtered-box"></div>
    <label class="cvz-label">Weiteren Wettbewerber manuell hinzufügen</label>
    <input class="cvz-input" id="cvz-in-manual-competitor" placeholder="URL eines Wettbewerbers, z.B. https://wettbewerber.de" onkeydown="cvzAddManualCompetitorOnEnter(event)">
    <p class="cvz-hint">Nicht eure eigene Seite — eine Seite, mit der ihr um dieselben Kunden konkurriert. Maximal ${CVZ_MAX_COMPETITORS} Wettbewerber insgesamt, eigene Eintraege haben Vorrang vor Vorschlaegen.</p>
  `;

  const nothingLoadedYet =
    cvzState.competitorSuggestions.length === 0 &&
    cvzState.filteredOutCompetitors.length === 0;

  if (nothingLoadedYet) {
    try {
      const res = await fetch(`${API_BASE}/api/page-agent/suggest-competitors`, {
        method: 'POST', headers: cvzAuthHeaders(),
        body: JSON.stringify({
          keyword: cvzState.keyword,
          business_type: cvzState.business_type || null
        })
      });
      const data = await res.json();

      // WICHTIG: erst filtern, dann kuerzen. Vorher wurde auf 5 gekuerzt
      // und danach gefiltert - dabei gingen gute Kandidaten auf Position
      // 6+ verloren, sobald oben Blog- oder Video-Treffer standen.
      const filtered = cvzFilterCompetitorSuggestions(data.suggestions || []);

      cvzState.competitorSuggestions = filtered.items
        .slice(0, CVZ_MAX_SUGGESTIONS_SHOWN)
        .map((s, i) => ({
          ...s,
          selected: i < CVZ_PRESELECT_COUNT,
          recommended: i < CVZ_PRESELECT_COUNT
        }));
      cvzState.filteredOutCompetitors = filtered.removed;
    } catch (e) {
      console.error('suggest-competitors failed', e);
      document.getElementById('cvz-competitor-list').innerHTML =
        `<p class="cvz-hint">Vorschläge konnten nicht geladen werden (${cvzEsc(e.message)}). Bitte Wettbewerber manuell unten ergänzen.</p>`;
      return;
    }
  }
  cvzRenderCompetitorList();
}

function cvzRenderCompetitorList() {
  const container = document.getElementById('cvz-competitor-list');
  const total = cvzTotalCompetitorCount();
  const atCap = total >= CVZ_MAX_COMPETITORS;

  const counter = `
    <p class="cvz-selection-count ${atCap ? 'limit' : ''}">
      ${total} von ${CVZ_MAX_COMPETITORS} ausgewählt${atCap ? ' – mehr geht nicht' : ' – du kannst weitere ergänzen oder abwählen'}
    </p>`;

  const suggested = cvzState.competitorSuggestions.map((s, i) => {
    const locked = atCap && !s.selected;
    const badge = s.recommended ? '<span class="cvz-badge">Empfohlen</span>' : '';
    return `
    <div class="cvz-competitor-item ${s.selected ? 'selected' : ''} ${locked ? 'locked' : ''}" onclick="${locked ? '' : `cvzToggleCompetitor(${i})`}">
      <input type="checkbox" ${s.selected ? 'checked' : ''} ${locked ? 'disabled' : ''} onclick="event.stopPropagation(); cvzToggleCompetitor(${i})">
      <div class="cvz-competitor-body">
        <div class="title">${cvzEsc(s.title)}${badge}</div>
        <div class="url">${cvzEsc(s.url)}</div>
      </div>
    </div>
  `;
  }).join('');

  const manual = cvzState.manualCompetitors.map((url, i) => `
    <div class="cvz-competitor-item selected">
      <input type="checkbox" checked disabled>
      <div class="cvz-competitor-body"><div class="url">${cvzEsc(url)}</div></div>
      <button onclick="cvzRemoveManualCompetitor(${i})" style="background:none;border:none;color:var(--cvz-text-muted);cursor:pointer;">×</button>
    </div>
  `).join('');

  const list = (suggested + manual) || '<p class="cvz-hint">Keine Vorschläge übrig — bitte manuell ergänzen.</p>';
  container.innerHTML = counter + list;

  cvzRenderFilteredBox();
}

// Aussortierte Vorschlaege bleiben nachvollziehbar und rueckholbar.
// Ohne das waere ein Fehlgriff des Filters fuer den Nutzer unsichtbar.
function cvzRenderFilteredBox() {
  const box = document.getElementById('cvz-filtered-box');
  if (!box) return;

  if (cvzState.filteredOutCompetitors.length === 0) {
    box.innerHTML = '';
    return;
  }

  const rows = cvzState.filteredOutCompetitors.map((entry, i) => `
    <li>
      <span>${cvzEsc(entry.url)}</span>
      <span class="reason">${cvzEsc(entry.reason)}</span>
      <button onclick="cvzRestoreFilteredCompetitor(${i})">Trotzdem prüfen</button>
    </li>
  `).join('');

  box.innerHTML = `
    <details class="cvz-filtered-box">
      <summary>${cvzState.filteredOutCompetitors.length} Vorschläge ausgeblendet (Videos, Blog- und Glossarseiten)</summary>
      <ul class="cvz-filtered-list">${rows}</ul>
    </details>
  `;
}

function cvzRestoreFilteredCompetitor(i) {
  const entry = cvzState.filteredOutCompetitors[i];
  if (!entry) return;

  const info = cvzInspectUrl(entry.url);
  cvzState.filteredOutCompetitors.splice(i, 1);
  cvzState.competitorSuggestions.push({
    url: info.url || entry.url,
    host: info.host,
    title: info.host || entry.url,
    score: 0,
    selected: false,
    recommended: false
  });
  cvzRenderCompetitorList();
}

function cvzToggleCompetitor(i) {
  const s = cvzState.competitorSuggestions[i];
  if (!s.selected && cvzTotalCompetitorCount() >= CVZ_MAX_COMPETITORS) {
    cvzShowError(`Maximal ${CVZ_MAX_COMPETITORS} Wettbewerber möglich - wähle zuerst einen anderen ab.`);
    return;
  }
  cvzShowError(null);
  s.selected = !s.selected;
  cvzRenderCompetitorList();
}

function cvzAddManualCompetitorOnEnter(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const val = event.target.value.trim();
  if (!val) return;

  const info = cvzInspectUrl(val);
  if (!info.host) {
    cvzShowError(`"${val}" ist keine gueltige URL.`);
    return;
  }

  // Doppelte Domains verbrauchen zwei Slots fuer eine Erkenntnis.
  const dupSuggestion = cvzState.competitorSuggestions.some(s => s.selected && s.host === info.host);
  const dupManual = cvzState.manualCompetitors.some(u => cvzInspectUrl(u).host === info.host);
  if (dupSuggestion || dupManual) {
    cvzShowError('Diese Domain ist schon in der Auswahl.');
    return;
  }

  if (cvzState.manualCompetitors.length >= CVZ_MAX_COMPETITORS) {
    cvzShowError(`Maximal ${CVZ_MAX_COMPETITORS} eigene Wettbewerber möglich - entferne zuerst einen.`);
    return;
  }
  cvzShowError(null);

  cvzState.manualCompetitors.push(info.url);
  event.target.value = '';

  // Eigene Eintraege haben Vorrang: bei Ueberlauf werden Vorschlaege
  // von hinten abgewaehlt.
  for (let i = cvzState.competitorSuggestions.length - 1; i >= 0 && cvzTotalCompetitorCount() > CVZ_MAX_COMPETITORS; i--) {
    if (cvzState.competitorSuggestions[i].selected) cvzState.competitorSuggestions[i].selected = false;
  }

  cvzRenderCompetitorList();
}

function cvzRemoveManualCompetitor(i) {
  cvzState.manualCompetitors.splice(i, 1);
  cvzRenderCompetitorList();
}

// ==================== NAVIGATION ====================
function cvzSyncStep0Fields() {
  cvzState.keyword = document.getElementById('cvz-in-keyword').value.trim();
  cvzState.target_audience = document.getElementById('cvz-in-audience').value.trim();
  cvzReadBusinessType();
}
function cvzSyncStep1Fields() {
  cvzState.conversion_goal = document.getElementById('cvz-in-goal').value.trim();
}
function cvzSyncStep2Fields() {
  cvzState.existing_content = document.getElementById('cvz-in-existing').value.trim();
  cvzState.brand_reference_url = document.getElementById('cvz-in-brand-url').value.trim();
  cvzState.brand_color = document.getElementById('cvz-in-brand-color').value.trim();
  if (!cvzState.no_customer_reasons) {
    cvzState.customer_reasons = document.getElementById('cvz-in-customer-reasons').value.trim();
  }
}

function cvzSyncBrandColorFromPicker(hex) {
  cvzState.brand_color = hex;
  document.getElementById('cvz-in-brand-color').value = hex;
}
function cvzSyncBrandColorFromText(value) {
  cvzState.brand_color = value.trim();
  if (/^#([0-9a-fA-F]{6})$/.test(cvzState.brand_color)) {
    document.getElementById('cvz-in-brand-color-picker').value = cvzState.brand_color;
  }
}

function cvzToggleNoCustomerReasons(checked) {
  cvzState.no_customer_reasons = checked;
  const textarea = document.getElementById('cvz-in-customer-reasons');
  textarea.disabled = checked;
  if (checked) {
    textarea.value = '';
    cvzState.customer_reasons = '';
  }
}

function cvzBuildExistingContent() {
  const parts = [];
  if (cvzState.existing_content) parts.push(cvzState.existing_content);
  if (cvzState.reference_urls.length > 0) parts.push('Referenz-Links:\n' + cvzState.reference_urls.join('\n'));
  cvzState.pdfExtracts.forEach(p => parts.push(`[PDF: ${p.filename}]\n${p.text}`));
  return parts.join('\n\n');
}

function cvzValidateStep() {
  if (cvzState.step === 0) {
    cvzSyncStep0Fields();
    if (!cvzState.keyword) return 'Bitte ein Thema/Keyword eingeben.';
    // Bei "Eigene Eingabe" mit leerem Textfeld bleibt business_type leer,
    // die erste Pruefung greift also fuer beide Faelle. Die zweite gibt
    // nur die passendere Meldung aus.
    const btSelect = document.getElementById('cvz-in-business-type');
    if (btSelect && btSelect.value === CVZ_BUSINESS_TYPE_CUSTOM && !cvzState.business_type) {
      return 'Bitte deine Produktkategorie eingeben.';
    }
    if (!cvzState.business_type) return 'Bitte eine Produktkategorie auswaehlen.';
    if (!cvzState.target_audience) return 'Bitte eine Zielgruppe angeben.';
  }
  if (cvzState.step === 1) {
    cvzSyncStep1Fields();
    if (!cvzState.conversion_goal) return 'Bitte ein Conversion-Ziel angeben.';
    if (!cvzState.funnel_stage) return 'Bitte eine Funnel-Stage auswaehlen.';
  }
  if (cvzState.step === 2) {
    cvzSyncStep2Fields();
    if (cvzState.usps.length === 0) return 'Bitte mindestens eine USP eintragen.';
    if (cvzState.features.length === 0) return 'Bitte mindestens ein Feature eintragen.';
    if (cvzState.brand_color && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cvzState.brand_color)) {
      return `"${cvzState.brand_color}" ist kein gueltiger Hex-Farbcode (z.B. #4f46e5) - oder das Feld leer lassen.`;
    }
    if (cvzState.brand_reference_url) {
      try {
        new URL(cvzState.brand_reference_url);
      } catch {
        return `"${cvzState.brand_reference_url}" ist keine gueltige URL (mit https:// beginnen) - oder das Feld leer lassen.`;
      }
    }
  }
  if (cvzState.step === 3) {
    const total = cvzTotalCompetitorCount();
    if (total === 0) return 'Bitte mindestens einen Wettbewerber auswaehlen oder ergaenzen.';
    if (total > CVZ_MAX_COMPETITORS) return `Maximal ${CVZ_MAX_COMPETITORS} Wettbewerber moeglich - bitte welche abwaehlen.`;
  }
  return null;
}

async function cvzGoNext() {
  const error = cvzValidateStep();
  if (error) { cvzShowError(error); return; }
  cvzShowError(null);

  if (cvzState.step < STEP_LABELS.length - 1) {
    cvzState.step++;
    cvzRenderStep();
    document.getElementById('cvz-btn-next').textContent = cvzState.step === STEP_LABELS.length - 1 ? 'Launch →' : 'Weiter →';
  } else {
    await cvzLaunch();
  }
}
function cvzGoBack() {
  if (cvzState.step === 0) return;
  cvzState.step--;
  cvzShowError(null);
  cvzRenderStep();
  document.getElementById('cvz-btn-next').textContent = cvzState.step === STEP_LABELS.length - 1 ? 'Launch →' : 'Weiter →';
}
function cvzRenderStep() {
  cvzRenderSteps();
  if (cvzState.step === 0) cvzRenderStep0();
  if (cvzState.step === 1) cvzRenderStep1();
  if (cvzState.step === 2) cvzRenderStep2();
  if (cvzState.step === 3) cvzRenderStep3();
}

// ==================== LAUNCH ====================
const CVZ_KICKOFF_MESSAGES = [
  'Hier wird die nächsten 2-3 Minuten malocht. Hol dir in der Zeit gerne einen Kaffee',
  'Kaffee schon geholt? Wir wühlen noch in Keywords und Wettbewerbern',
  'Buying-Center-Rollen werden einsortiert',
  'Fast durch, letzte Erkenntnisse werden zusammengetragen'
];
const CVZ_STRUCTURE_MESSAGES = [
  'Denkt nach',
  'Baut Sektion für Sektion auf',
  'Bei einer kompletten Seite dauert das schon mal 2-3 Minuten',
  'Feilt an Überschriften und Trust-Signalen',
  'Fast fertig, letzte Handgriffe'
];

function cvzStartProgressTicker(baseText, messages, onUpdate) {
  const startTime = Date.now();
  let msgIndex = 0;
  const tick = () => {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    let text = elapsedSec >= 8 ? `${messages[Math.min(msgIndex, messages.length - 1)]} …` : baseText;
    if (elapsedSec >= 30) text += ` (${elapsedSec}s)`;
    onUpdate(text);
  };
  tick();
  const messageTimer = setInterval(() => { msgIndex++; }, 20000);
  const tickTimer = setInterval(tick, 1000);
  return () => { clearInterval(messageTimer); clearInterval(tickTimer); };
}

let cvzLoadingStopTicker = null;
function cvzShowLoading(text) {
  document.getElementById('cvz-form-card').style.display = 'none';
  document.getElementById('cvz-loading').style.display = 'block';
  if (cvzLoadingStopTicker) cvzLoadingStopTicker();
  cvzLoadingStopTicker = cvzStartProgressTicker(text, CVZ_KICKOFF_MESSAGES, t => {
    document.getElementById('cvz-loading-text').textContent = t;
  });
}

async function cvzLaunch() {
  const headers = cvzAuthHeaders();
  const userId = cvzUserId();
  const competitorUrls = [
    ...cvzState.competitorSuggestions.filter(s => s.selected).map(s => s.url),
    ...cvzState.manualCompetitors
  ].slice(0, CVZ_MAX_COMPETITORS);

  try {
    cvzShowLoading('Projekt wird angelegt …');
    const projectRes = await fetch(`${API_BASE}/api/page-agent/project`, {
      method: 'POST', headers,
      body: JSON.stringify({ user_id: userId, name: cvzState.keyword })
    });
    if (!projectRes.ok) throw new Error((await projectRes.json()).error || 'Projekt konnte nicht angelegt werden');
    const { page_project_id } = await projectRes.json();

    cvzShowLoading('Briefing wird gespeichert …');
    const briefRes = await fetch(`${API_BASE}/api/page-agent/brief`, {
      method: 'POST', headers,
      body: JSON.stringify({
        user_id: userId, page_project_id,
        funnel_stage: cvzState.funnel_stage,
        conversion_goal: cvzState.conversion_goal,
        target_audience: cvzState.target_audience,
        // Fester Slug ODER Freitext - siehe Kommentar bei
        // CVZ_BUSINESS_TYPES. Nie der Anzeigetext der festen Optionen.
        business_type: cvzState.business_type || null,
        usps: cvzState.usps,
        features: cvzState.features,
        keyword: cvzState.keyword,
        competitor_urls: competitorUrls,
        existing_content: cvzBuildExistingContent() || null,
        brand_reference_url: cvzState.brand_reference_url || null,
        brand_color: cvzState.brand_color || null,
        customer_reasons: cvzState.no_customer_reasons ? 'Keine Informationen vorhanden' : (cvzState.customer_reasons || null)
      })
    });
    if (!briefRes.ok) {
      const err = await briefRes.json();
      throw new Error(err.error + (err.missing_fields ? ` (${err.missing_fields.join(', ')})` : ''));
    }

    cvzShowLoading('Hier wird die nächsten 2-3 Minuten malocht. Hol dir in der Zeit gerne einen Kaffee …');
    const sessionRes = await fetch(`${API_BASE}/api/page-agent/start-session`, {
      method: 'POST', headers,
      body: JSON.stringify({ user_id: userId, page_project_id })
    });
    if (!sessionRes.ok) throw new Error((await sessionRes.json()).error || 'Analyse fehlgeschlagen');
    const sessionData = await sessionRes.json();

    cvzState.session_id = sessionData.session_id;
    cvzState.page_project_id = page_project_id;
    cvzOpenChat(sessionData);
  } catch (err) {
    if (cvzLoadingStopTicker) { cvzLoadingStopTicker(); cvzLoadingStopTicker = null; }
    document.getElementById('cvz-loading').style.display = 'none';
    document.getElementById('cvz-form-card').style.display = 'block';
    cvzShowError(err.message);
  }
}

// ==================== SESSION-WIEDERAUFNAHME ====================
async function cvzTryResume() {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('new')) {
    window.history.replaceState({}, '', window.location.pathname);
    return false;
  }

  const explicitProjectId = urlParams.get('project');

  const userId = cvzUserId();
  const headers = cvzAuthHeaders();
  let url = `${API_BASE}/api/page-agent/resume?user_id=${encodeURIComponent(userId)}`;
  if (explicitProjectId) url += `&page_project_id=${encodeURIComponent(explicitProjectId)}`;

  try {
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) return false;

    const data = await res.json();
    cvzState.session_id = data.session_id;
    cvzState.page_project_id = data.page_project_id;

    document.getElementById('cvz-form-app').style.display = 'none';
    document.getElementById('cvz-workspace').style.display = 'flex';
    cvzUpdateQuota(data.sessions_remaining, data.sessions_limit);

    (data.messages || []).forEach(m => cvzAppendMessage(m.role, m.content));
    if (data.structure_html_document) {
      cvzUpdatePreviewPanel(data.structure_html_document, data.structure_version);
    }
    document.getElementById('cvz-chat-messages').scrollTop = document.getElementById('cvz-chat-messages').scrollHeight;
    return true;
  } catch (e) {
    console.error('Resume fehlgeschlagen:', e);
    return false;
  }
}

// ==================== CHAT ====================
function cvzOpenChat(sessionData) {
  if (cvzLoadingStopTicker) { cvzLoadingStopTicker(); cvzLoadingStopTicker = null; }
  document.getElementById('cvz-form-app').style.display = 'none';
  document.getElementById('cvz-workspace').style.display = 'flex';
  cvzUpdateQuota(sessionData.sessions_remaining, sessionData.sessions_limit);
  cvzAppendMessage('assistant', sessionData.message);
}
function cvzUpdateQuota(remaining, limit) {
  document.getElementById('cvz-quota').textContent = `${remaining}/${limit} Sessions übrig`;
}

function cvzRenderStructureIframe(container, htmlDocument, onLoaded) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.setAttribute('title', 'Landingpage-Vorschau');
  iframe.srcdoc = htmlDocument;
  iframe.addEventListener('load', () => {
    let measuredHeight = null;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      measuredHeight = doc.documentElement.scrollHeight;
      iframe.style.height = measuredHeight + 'px';
    } catch (e) {
      console.warn('Iframe-Hoehe konnte nicht ermittelt werden:', e.message);
    }
    if (onLoaded) onLoaded(measuredHeight);
  });
  container.appendChild(iframe);
  return iframe;
}

const CVZ_DEVICE_WIDTHS = { desktop: 1440, mobile: 390 };
let cvzPreviewDevice = window.innerWidth < 768 ? 'mobile' : 'desktop';
let cvzPreviewContentHeight = 0;

function cvzApplyPreviewScale() {
  const outer = document.getElementById('cvz-preview-frame-outer');
  const inner = document.getElementById('cvz-preview-frame-inner');
  if (!outer || !inner || !cvzPreviewContentHeight) return;

  const deviceWidth = CVZ_DEVICE_WIDTHS[cvzPreviewDevice];
  const body = document.getElementById('cvz-preview-body');
  const availableWidth = body.clientWidth - 32;
  const scale = Math.min(1, Math.max(availableWidth, 100) / deviceWidth);

  inner.style.width = deviceWidth + 'px';
  inner.style.height = cvzPreviewContentHeight + 'px';
  inner.style.transform = `scale(${scale})`;
  outer.style.width = Math.round(deviceWidth * scale) + 'px';
  outer.style.height = Math.round(cvzPreviewContentHeight * scale) + 'px';
}

let cvzResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(cvzResizeTimer);
  cvzResizeTimer = setTimeout(() => {
    if (window.innerWidth < 768 && cvzPreviewDevice === 'desktop') {
      cvzSetPreviewDevice('mobile');
    } else {
      cvzApplyPreviewScale();
    }
  }, 150);
});

function cvzSetPreviewDevice(device) {
  cvzPreviewDevice = device;
  document.getElementById('cvz-device-desktop').classList.toggle('active', device === 'desktop');
  document.getElementById('cvz-device-mobile').classList.toggle('active', device === 'mobile');

  const iframe = document.querySelector('#cvz-preview-frame-inner iframe');
  if (!iframe) return;
  iframe.style.width = CVZ_DEVICE_WIDTHS[device] + 'px';
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    cvzPreviewContentHeight = doc.documentElement.scrollHeight;
    iframe.style.height = cvzPreviewContentHeight + 'px';
  } catch (e) {
    console.warn('Iframe-Hoehe nach Geraete-Wechsel konnte nicht neu ermittelt werden:', e.message);
  }
  cvzApplyPreviewScale();
}
cvzSetPreviewDevice(cvzPreviewDevice);

let cvzLatestStructureHtml = null;
function cvzUpdatePreviewPanel(htmlDocument, version) {
  if (!htmlDocument) return;
  cvzLatestStructureHtml = htmlDocument;

  const body = document.getElementById('cvz-preview-body');
  body.innerHTML = '<div class="cvz-preview-frame-outer" id="cvz-preview-frame-outer"><div class="cvz-preview-frame-inner" id="cvz-preview-frame-inner"></div></div>';
  const inner = document.getElementById('cvz-preview-frame-inner');

  const iframe = cvzRenderStructureIframe(inner, htmlDocument, measuredHeight => {
    if (measuredHeight) cvzPreviewContentHeight = measuredHeight;
    cvzApplyPreviewScale();
    body.scrollTop = 0;
    body.scrollLeft = 0;
  });
  iframe.style.width = CVZ_DEVICE_WIDTHS[cvzPreviewDevice] + 'px';

  document.getElementById('cvz-preview-version').textContent = version ? `Version ${version}` : '';
  document.getElementById('cvz-preview-download').disabled = false;
  // PDF-Export: Landingpage-Button erst klickbar, sobald eine Struktur
  // existiert - genau wie der HTML-Download-Button direkt darüber.
  document.getElementById('cvz-export-landingpage-pdf').disabled = false;
}

function cvzDownloadCurrentStructure() {
  if (!cvzLatestStructureHtml) return;
  const blob = new Blob([cvzLatestStructureHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'landingpage.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function cvzAppendMessage(role, text, structureHtmlDocument, structureVersion) {
  const wrap = document.getElementById('cvz-chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `cvz-msg ${role}`;
  if (role === 'assistant' && typeof marked !== 'undefined') {
    bubble.innerHTML = marked.parse(text);
  } else {
    bubble.textContent = text;
  }
  wrap.appendChild(bubble);

  if (structureHtmlDocument) {
    cvzUpdatePreviewPanel(structureHtmlDocument, structureVersion);
    const note = document.createElement('div');
    note.className = 'cvz-hint';
    note.style.textAlign = 'center';
    note.textContent = structureVersion ? `Vorschau aktualisiert (Version ${structureVersion})` : 'Vorschau aktualisiert';
    wrap.appendChild(note);
  }
  wrap.scrollTop = wrap.scrollHeight;
  return bubble;
}

let cvzIsSending = false;

async function cvzSendMessage() {
  if (cvzIsSending) return;
  const input = document.getElementById('cvz-chat-input');
  const message = input.value.trim();
  if (!message) return;
  cvzIsSending = true;
  input.value = '';
  input.disabled = true;
  document.getElementById('cvz-chat-send').disabled = true;

  cvzAppendMessage('user', message);
  const loadingBubble = cvzAppendMessage('assistant', 'Denkt nach …');
  loadingBubble.classList.add('loading');
  loadingBubble.innerHTML = '<span class="cvz-spinner-inline"></span><span class="cvz-loading-label">Denkt nach …</span>';
  const loadingLabel = loadingBubble.querySelector('.cvz-loading-label');
  const stopTicker = cvzStartProgressTicker('Denkt nach …', CVZ_STRUCTURE_MESSAGES, t => { loadingLabel.textContent = t; });

  try {
    const res = await fetch(`${API_BASE}/api/page-agent/chat`, {
      method: 'POST', headers: cvzAuthHeaders(),
      body: JSON.stringify({ user_id: cvzUserId(), session_id: cvzState.session_id, message })
    });
    const data = await res.json();
    stopTicker();
    loadingBubble.remove();

    if (!res.ok) {
      cvzAppendMessage('assistant', `Fehler: ${data.error || res.status}`);
    } else {
      cvzAppendMessage('assistant', data.message, data.structure_html_document, data.structure_version);
      cvzUpdateQuota(data.sessions_remaining, data.sessions_limit);
    }
  } catch (err) {
    stopTicker();
    loadingBubble.remove();
    cvzAppendMessage('assistant', `Fehler: ${err.message}`);
  } finally {
    cvzIsSending = false;
    input.disabled = false;
    document.getElementById('cvz-chat-send').disabled = false;
  }
}
document.getElementById('cvz-chat-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cvzSendMessage(); }
});

function cvzStartNewProject() {
  window.location.href = window.location.pathname + '?new=1';
}

// ==================== PDF-EXPORT ====================
// Buttons werden per onclick direkt im HTML-Embed verdrahtet (siehe
// frontend/embed.html: id="cvz-export-briefing-pdf" bzw.
// id="cvz-export-landingpage-pdf", jeweils mit onclick="cvzExportPdf({...})") -
// passend zum bestehenden Stil dieser Datei (onclick="cvzGoBack()" usw.).
// KEIN zusaetzliches addEventListener fuer dieselben IDs - das wuerde zu
// doppelter Ausfuehrung pro Klick fuehren. Der Server laedt Briefing-Text
// und Struktur-HTML selbst aus Supabase (page_agent_messages bzw.
// page_structures) - hier wird nur cvzState.page_project_id und
// cvzAuthHeaders() gebraucht, beide bereits weiter oben definiert.
async function cvzExportPdf({ buttonEl, errorEl, type, downloadName }) {
  const label = buttonEl.querySelector('.btn-label') || buttonEl;
  const originalText = label.textContent;
  if (errorEl) errorEl.hidden = true;
  buttonEl.disabled = true;
  label.textContent = 'PDF wird erstellt…';

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/pdf/export`, {
        method: 'POST',
        headers: cvzAuthHeaders(),
        body: JSON.stringify({ pageProjectId: cvzState.page_project_id, type }),
      });

      if (response.status === 409) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Noch nicht bereit für den Export.');
      }
      if (response.status === 429) {
        throw new Error('Zu viele Anfragen. Bitte kurz warten und erneut versuchen.');
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Export fehlgeschlagen');
      }

      const { url } = await response.json();
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.click();

      label.textContent = originalText;
      buttonEl.disabled = false;
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error(err);
        if (errorEl) {
          errorEl.textContent = err.message || 'PDF konnte nicht erstellt werden.';
          errorEl.hidden = false;
        }
        label.textContent = originalText;
        buttonEl.disabled = false;
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

// ==================== INIT ====================
cvzResolveIdentity().then(identityOk => {
  if (!identityOk) {
    document.getElementById('cvz-auth-gate').style.display = 'block';
    document.getElementById('cvz-form-card').style.display = 'none';
    return;
  }
  cvzTryResume().then(resumed => {
    if (!resumed) cvzRenderStep();
  });
});
