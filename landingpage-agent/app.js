// ==================== KONFIGURATION ====================
const API_BASE = 'https://convertlyze-agent-api-production.up.railway.app';

// ==================== IDENTITÄT (echter Memberstack-Login) ====================
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
    console.error('Identitäts-Auflösung fehlgeschlagen:', e.message);
    return false;
  }
}

// ==================== SESSIONS-KONTINGENT (Anzeige vor Formularstart) ====================
// NEU: zeigt vorab an, wie viele Sessions in diesem Monat noch verfügbar
// sind, und sperrt den Weiter/Launch-Button, wenn nichts mehr uebrig ist.
// Verhindert, dass jemand das komplette 4-Schritte-Formular ausfuellt und
// erst beim finalen Launch-Klick den 402-Fehler sieht.
//
// GEÄNDERT: Sperr-Entscheidung beruht jetzt auf canStart (Plan-Kontingent
// ODER gekaufte Aufbau-PPU-Credits), nicht mehr allein auf remaining
// (Plan-Kontingent). Vorher wurde der Button hart gesperrt, sobald das
// monatliche Kontingent aufgebraucht war - selbst wenn noch bezahlte
// Aufbau-Pay-per-Use-Credits vorhanden waren, die /start-session laengst
// als Fallback akzeptiert. Der servereitige /quota-Endpoint liefert dafuer
// jetzt zusaetzlich ppu_aufbau_credits_available und can_start_session.
let cvzQuota = { remaining: null, limit: null, recurring: null, next_reset: null, ppuAufbauAvailable: 0, canStart: null };

async function cvzLoadQuota() {
  try {
    const res = await fetch(`${API_BASE}/api/page-agent/quota?user_id=${encodeURIComponent(cvzUserId())}`, {
      headers: cvzAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cvzQuota = {
      remaining: data.sessions_remaining,
      limit: data.sessions_limit,
      recurring: data.recurring,
      next_reset: data.next_reset,
      ppuAufbauAvailable: data.ppu_aufbau_credits_available ?? 0,
      canStart: data.can_start_session ?? null
    };
  } catch (e) {
    console.error('Kontingent konnte nicht geladen werden:', e.message);
    // Bei einem fehlgeschlagenen Quota-Request bleibt canStart=null - der
    // Button wird dann NICHT gesperrt (siehe cvzUpdateNextButtonState),
    // damit ein einzelner Netzwerkfehler niemanden aussperrt, der
    // tatsaechlich noch Kontingent haette. Die verbindliche Pruefung
    // passiert ohnehin serverseitig beim Launch-Request selbst.
    cvzQuota = { remaining: null, limit: null, recurring: null, next_reset: null, ppuAufbauAvailable: 0, canStart: null };
  }
  cvzRenderQuotaBanner();
  cvzUpdateNextButtonState();
}

function cvzFormatNextReset(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

// Erstellt (beim ersten Aufruf) oder aktualisiert eine Banner-Zeile direkt
// über dem Formular. Wird per JS eingehaengt statt fest ins HTML-Embed
// geschrieben, damit diese Aenderung ohne Anpassung von frontend/embed.html
// auskommt - falls das Embed spaeter einen festen Container dafuer bekommt
// (z.B. <div id="cvz-quota-banner"></div> direkt ueber #cvz-steps), wird
// dieser automatisch verwendet statt einen neuen zu erzeugen.
function cvzRenderQuotaBanner() {
  const formCard = document.getElementById('cvz-form-card');
  if (!formCard) return;

  let banner = document.getElementById('cvz-quota-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'cvz-quota-banner';
    formCard.insertBefore(banner, formCard.firstChild);
  }

  if (cvzQuota.remaining === null) {
    banner.style.display = 'none';
    banner.textContent = '';
    return;
  }

  // depleted = wirklich nichts mehr verfuegbar, weder Plan-Kontingent noch
  // gekaufte Aufbau-PPU-Credits. canStart===null (Request fehlgeschlagen)
  // gilt bewusst NICHT als depleted, siehe Kommentar in cvzLoadQuota.
  const depleted = cvzQuota.canStart === false;
  const planDepletedButHasPpu = cvzQuota.remaining <= 0 && cvzQuota.ppuAufbauAvailable > 0;

  banner.style.display = 'block';
  banner.style.cssText = `
    display: block;
    margin-bottom: 16px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    line-height: 1.4;
    border: 1px solid ${depleted ? 'var(--cvz-danger)' : 'var(--cvz-border)'};
    color: ${depleted ? 'var(--cvz-danger)' : 'var(--cvz-text-muted)'};
    background: var(--cvz-bg);
  `;

  if (depleted) {
    const resetHint = cvzQuota.recurring && cvzQuota.next_reset
      ? ` Naechste Zuruecksetzung am ${cvzFormatNextReset(cvzQuota.next_reset)}.`
      : '';
    banner.textContent = `Kein Sessions-Kontingent mehr verfügbar (0 von ${cvzQuota.limit}).${resetHint}`;
  } else if (planDepletedButHasPpu) {
    banner.textContent = `Monatliches Kontingent aufgebraucht (0 von ${cvzQuota.limit}) - du hast aber noch ${cvzQuota.ppuAufbauAvailable} gekaufte Aufbau-Session${cvzQuota.ppuAufbauAvailable > 1 ? 's' : ''} übrig, die jetzt automatisch genutzt wird.`;
  } else {
    banner.textContent = `${cvzQuota.remaining} von ${cvzQuota.limit} Sessions in diesem Monat verfügbar.`;
  }
}

// Sperrt den Weiter/Launch-Button optisch UND funktional, solange kein
// Kontingent mehr verfügbar ist. disabled=true allein wuerde in manchen
// Browsern/Themes visuell kaum auffallen, deshalb zusätzlich Opacity und
// Cursor direkt gesetzt statt nur auf eine CSS-Klasse zu vertrauen, die im
// Embed moeglicherweise noch nicht existiert.
function cvzUpdateNextButtonState() {
  const btn = document.getElementById('cvz-btn-next');
  if (!btn) return;

  const depleted = cvzQuota.canStart === false;
  btn.disabled = depleted;
  btn.style.opacity = depleted ? '0.5' : '';
  btn.style.cursor = depleted ? 'not-allowed' : '';
  btn.title = depleted ? 'Kein Sessions-Kontingent mehr verfügbar in diesem Monat.' : '';
}

// ==================== FORMULAR-STATE ====================
const cvzState = {
  step: 0,
  keyword: '',
  // key aus GET /form-options, z.B. 'saas_self_service'.
  business_type: '',
  // Frei eingetippte Kategorie. Nur gefüllt, wenn der gewählte Typ
  // allows_custom_label hat (aktuell 'sonstiges'). Geht als eigenes Feld
  // an /brief, NICHT als business_type - dort wäre ein freier Wert
  // ungültig und würde alle typabhängigen Regeln aushebeln.
  business_type_custom: '',
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

// Die Auswahllisten kommen zur Laufzeit aus GET /api/page-agent/form-options
// und damit aus DERSELBEN Konstante (services/businessTypes.js), gegen die
// /brief validiert. Deshalb steht hier keine Liste mehr fest eingetragen:
// eine zweite Kopie im Frontend läuft früher oder später auseinander und
// produziert dann ein 400 "Ungültiger Business-Typ" für einen Wert, der im
// Dropdown völlig legitim aussah.
//
// business_type_groups kommt gruppiert:
//   [{ key, label, hint, types: [{ key, label, allows_custom_label }] }]
// Aktuell liefert das Backend nur die Geschäftsmodell-Gruppe plus den
// Freitext-Eintrag. Die Struktur bleibt trotzdem gruppiert, damit eine
// spätere zweite Gruppe ohne Frontend-Änderung erscheinen kann.
//
// FREITEXT: Bei einer Option mit allows_custom_label (aktuell 'sonstiges')
// blendet das Formular ein Textfeld ein. Der eingetragene Wert geht als
// business_type_custom mit, NICHT als business_type – dort ist nur ein Key
// aus der Liste gültig. Der Agent bekommt die Kategorie trotzdem und muss
// nicht nachfragen.
let cvzBusinessTypeGroups = [];
let cvzFunnelStages = [];

// Fallback, falls /form-options nicht erreichbar ist. Bewusst nur die
// Funnel-Stages: ohne sie wäre Schritt 1 komplett unbedienbar. Für
// business_type gibt es KEINEN Fallback – eine geratene Liste ist genau
// der Fehler, der hier abgestellt werden soll. Dann lieber ein sichtbarer
// Hinweis als ein Dropdown, das beim Launch scheitert.
const CVZ_FUNNEL_STAGES_FALLBACK = [
  { key: 'awareness',     label: 'Awareness' },
  { key: 'consideration', label: 'Consideration' },
  { key: 'decision',      label: 'Decision' },
  { key: 'full_journey',  label: 'Komplette Journey' }
];

const CVZ_BUSINESS_TYPE_CUSTOM_MAXLEN = 60;

async function cvzLoadFormOptions() {
  try {
    const res = await fetch(`${API_BASE}/api/page-agent/form-options`, {
      headers: cvzAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    cvzBusinessTypeGroups = Array.isArray(data.business_type_groups)
      ? data.business_type_groups
      : [];
    cvzFunnelStages = Array.isArray(data.funnel_stages) && data.funnel_stages.length > 0
      ? data.funnel_stages
      : CVZ_FUNNEL_STAGES_FALLBACK;
  } catch (e) {
    console.error('form-options konnten nicht geladen werden:', e.message);
    cvzBusinessTypeGroups = [];
    cvzFunnelStages = CVZ_FUNNEL_STAGES_FALLBACK;
  }
}

// true, wenn der aktuell gewählte Typ ein Freitextfeld verlangt.
function cvzBusinessTypeAllowsCustom(key) {
  if (!key) return false;
  return cvzBusinessTypeGroups.some(g =>
    (g.types || []).some(t => t.key === key && t.allows_custom_label)
  );
}

function cvzRenderBusinessTypeField() {
  const total = cvzBusinessTypeGroups.reduce((n, g) => n + (g.types || []).length, 0);
  if (total === 0) {
    return `
      <label class="cvz-label">Produktkategorie</label>
      <p class="cvz-error" style="margin-top:6px;">
        Die Auswahlliste konnte nicht geladen werden. Bitte die Seite neu laden.
        Falls das Problem bleibt, melde dich bei uns.
      </p>
    `;
  }

  const showCustom = cvzBusinessTypeAllowsCustom(cvzState.business_type);

  // optgroup-label trägt zusätzlich den Gruppen-Hinweis, damit er direkt an
  // der Stelle steht, an der entschieden wird. Ein Hinweis unter dem Feld
  // wird beim Aufklappen des Dropdowns nicht mitgelesen.
  const groups = cvzBusinessTypeGroups.map(g => {
    const options = (g.types || []).map(t => `
      <option value="${cvzEsc(t.key)}" ${cvzState.business_type === t.key ? 'selected' : ''}>${cvzEsc(t.label)}</option>
    `).join('');
    const groupLabel = g.hint ? `${g.label} — ${g.hint}` : g.label;
    return `<optgroup label="${cvzEsc(groupLabel)}">${options}</optgroup>`;
  }).join('');

  return `
    <label class="cvz-label">Produktkategorie</label>
    <div class="cvz-select-wrap">
      <select class="cvz-input" id="cvz-in-business-type" onchange="cvzToggleBusinessTypeCustom(this.value)">
        <option value="" ${!cvzState.business_type ? 'selected' : ''}>Bitte wählen …</option>
        ${groups}
      </select>
    </div>
    <input class="cvz-input ${showCustom ? '' : 'cvz-hidden'}" id="cvz-in-business-type-custom"
      type="text" maxlength="${CVZ_BUSINESS_TYPE_CUSTOM_MAXLEN}"
      placeholder="z.B. Tierärztliche Praxis, Ausbildungsanbieter"
      aria-label="Eigene Produktkategorie"
      value="${cvzEsc(cvzState.business_type_custom)}">
    <p class="cvz-hint">Bestimmt Argumentationsframework, Pflicht-Nutzenebenen und Vertrauenssignale der Struktur. Gefragt ist das Geschäftsmodell, nicht die Branche – die steckt bereits im Thema oben.</p>
  `;
}

function cvzToggleBusinessTypeCustom(value) {
  const custom = document.getElementById('cvz-in-business-type-custom');
  if (!custom) return;
  const showCustom = cvzBusinessTypeAllowsCustom(value);
  custom.classList.toggle('cvz-hidden', !showCustom);
  if (showCustom) {
    custom.focus();
  } else {
    custom.value = '';
    cvzState.business_type_custom = '';
  }
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

// Kurzbeschreibungen je Funnel-Stage, ausschliesslich fuer die Hint-Zeile
// unter dem Dropdown - /form-options liefert nur key+label, keine
// Beschreibung (siehe cvzLoadFormOptions). Rein clientseitige Deko, hat
// keinen Einfluss auf den gesendeten Wert (immer der key aus dem Dropdown).
const CVZ_FUNNEL_STAGE_HINTS = {
  awareness: 'Problem noch nicht bewusst oder gerade erst erkannt.',
  consideration: 'Problem klar, Lösungswege werden verglichen.',
  decision: 'Anbieter stehen zur Wahl, Entscheidung steht an.',
  full_journey: 'Seite bedient alle Phasen.'
};

function cvzFunnelStageHint(key) {
  return CVZ_FUNNEL_STAGE_HINTS[key] || '';
}

function cvzOnFunnelStageChange(value) {
  cvzState.funnel_stage = value;
  const hint = document.getElementById('cvz-funnel-stage-hint');
  if (hint) hint.textContent = cvzFunnelStageHint(value);
}

function cvzRenderStep1() {
  const optgroups = Object.entries(CONVERSION_GOAL_GROUPS).map(([group, options]) => `
    <optgroup label="${cvzEsc(group)}">
      ${options.map(o => `<option value="${cvzEsc(o)}" ${cvzState.conversion_goal === o ? 'selected' : ''}>${cvzEsc(o)}</option>`).join('')}
    </optgroup>
  `).join('');

  // Funnel-Stage jetzt als Dropdown statt Auswahl-Kacheln, konsistent mit
  // dem Conversion-Ziel-Feld direkt darueber (gleiche cvz-select-wrap/
  // cvz-input-Struktur).
  const funnelOptions = cvzFunnelStages.map(s => `
    <option value="${cvzEsc(s.key)}" ${cvzState.funnel_stage === s.key ? 'selected' : ''}>${cvzEsc(s.label)}</option>
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
    <div class="cvz-select-wrap">
      <select class="cvz-input" id="cvz-in-funnel-stage" onchange="cvzOnFunnelStageChange(this.value)">
        <option value="" disabled ${!cvzState.funnel_stage ? 'selected' : ''}>Funnel-Stage auswählen …</option>
        ${funnelOptions}
      </select>
    </div>
    <p class="cvz-hint" id="cvz-funnel-stage-hint">${cvzEsc(cvzFunnelStageHint(cvzState.funnel_stage))}</p>
  `;
  document.getElementById('cvz-btn-back').style.visibility = 'visible';
}

// ==================== SCHRITT 2: ANGEBOT ====================

function cvzRenderStep2() {
  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Was macht euch aus?</h1>
    <p class="cvz-subtitle">USPs und Features einzeln eintragen, Enter drücken zum Hinzufügen.</p>
    <label class="cvz-label">USPs</label>
    <input class="cvz-input" id="cvz-in-usp" placeholder="USP eingeben, Enter drücken" onkeydown="cvzAddChipOnEnter(event,'usps','cvz-usp-chips')">
    <div class="cvz-chip-row" id="cvz-usp-chips">${cvzRenderChips(cvzState.usps, 'usps')}</div>
    <label class="cvz-label">Features</label>
    <input class="cvz-input" id="cvz-in-feature" placeholder="Feature eingeben, Enter drücken" onkeydown="cvzAddChipOnEnter(event,'features','cvz-feature-chips')">
    <div class="cvz-chip-row" id="cvz-feature-chips">${cvzRenderChips(cvzState.features, 'features')}</div>

    <label class="cvz-label">Häufigste Kauf-/Wechselgründe von Kunden (optional)</label>
    <textarea class="cvz-input" id="cvz-in-customer-reasons" placeholder="Was hast du von Kunden im Verkaufsgespräch oder Support am häufigsten als Grund gehört?" ${cvzState.no_customer_reasons ? 'disabled' : ''}>${cvzEsc(cvzState.customer_reasons)}</textarea>
    <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:0.85rem; color:var(--cvz-text-muted); cursor:pointer; font-weight:400;">
      <input type="checkbox" id="cvz-in-no-customer-reasons" ${cvzState.no_customer_reasons ? 'checked' : ''} onchange="cvzToggleNoCustomerReasons(this.checked)">
      Keine Informationen vorhanden
    </label>
    <p class="cvz-hint">Das ist die Kundenperspektive, nicht eure eigene - oft aussagekräftiger als USPs/Features fürs Storytelling.</p>

    <label class="cvz-label">Referenz-Links (optional)</label>
    <input class="cvz-input" id="cvz-in-refurl" placeholder="URL eingeben, Enter drücken (Seite oder YouTube-Video)" onkeydown="cvzAddRefUrlOnEnter(event)">
    <div class="cvz-chip-row" id="cvz-refurl-chips">${cvzRenderRefUrlChips()}</div>
    <p class="cvz-hint">Bis zu 3 Links werden vom Assistenten tatsächlich abgerufen.</p>

    <label class="cvz-label">PDF hochladen (optional)</label>
    <input type="file" accept="application/pdf" id="cvz-in-pdf" onchange="cvzUploadPdf(event)">
    <div id="cvz-pdf-status" style="margin-top:8px;"></div>
    <div class="cvz-chip-row" id="cvz-pdf-chips">${cvzRenderPdfChips()}</div>

    <label class="cvz-label">Eure Markenfarbe (optional)</label>
    <div style="display:flex; gap:10px; align-items:center;">
      <input type="color" id="cvz-in-brand-color-picker" value="${/^#([0-9a-fA-F]{6})$/.test(cvzState.brand_color) ? cvzState.brand_color : '#4f46e5'}" style="width:44px; height:40px; padding:2px; border-radius:8px; border:1px solid var(--cvz-border); background:var(--cvz-bg); cursor:pointer;" oninput="cvzSyncBrandColorFromPicker(this.value)">
      <input class="cvz-input" id="cvz-in-brand-color" placeholder="#4f46e5" value="${cvzEsc(cvzState.brand_color)}" style="flex:1;" oninput="cvzSyncBrandColorFromText(this.value)">
    </div>
    <p class="cvz-hint">Direkte Eingabe hat Vorrang vor der automatischen Erkennung aus der Website unten - keine Bestätigung im Chat nötig, da hier eindeutig.</p>

    <label class="cvz-label">Eure Website für den Marken-Look (optional)</label>
    <input class="cvz-input" id="cvz-in-brand-url" placeholder="https://eure-website.de" value="${cvzEsc(cvzState.brand_reference_url)}">
    <p class="cvz-hint">Nur relevant, wenn oben keine Farbe eingetragen ist - dann versucht der Assistent, sie automatisch zu erkennen und schlägt sie dir zur Bestätigung vor.</p>

    <label class="cvz-label">Sonstiger Kontext (optional)</label>
    <textarea class="cvz-input" id="cvz-in-existing" placeholder="Weitere Hinweise für den Assistenten, die nicht in ein Feld oben passen">${cvzEsc(cvzState.existing_content)}</textarea>
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
    cvzShowError(`"${val}" ist keine gültige URL (mit https:// beginnen).`);
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
//   1. Host-Blocklist    - Plattformen, die nie Wettbewerber-LP sein können
//   2. Pfad-Blocklist    - Content- und Rechtsseiten derselben Domain
//   3. Scoring + Dedupe  - eine URL pro Domain, beste zuerst

const CVZ_MAX_COMPETITORS = 5;       // Hartes Limit für die Analyse
const CVZ_PRESELECT_COUNT = 3;       // Vorausgewählt beim ersten Rendern
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

// Segmentweiser Vergleich, KEIN includes() - sonst würde "news"
// in "/newsletter-software/" treffen und eine gültige Seite wegwerfen.
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

// Sprechen für eine echte Angebotsseite - positiv im Scoring, keine Pflicht.
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

// Prüft eine einzelne URL.
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
    // verbrauchen drei Slots für eine einzige Erkenntnis.
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
    <p class="cvz-hint">Nicht eure eigene Seite — eine Seite, mit der ihr um dieselben Kunden konkurriert. Maximal ${CVZ_MAX_COMPETITORS} Wettbewerber insgesamt, eigene Einträge haben Vorrang vor Vorschlägen.</p>
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
// Ohne das wäre ein Fehlgriff des Filters für den Nutzer unsichtbar.
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
    cvzShowError(`"${val}" ist keine gültige URL.`);
    return;
  }

  // Doppelte Domains verbrauchen zwei Slots für eine Erkenntnis.
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

  // Eigene Einträge haben Vorrang: bei Ueberlauf werden Vorschlaege
  // von hinten abgewählt.
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
  const btSelect = document.getElementById('cvz-in-business-type');
  cvzState.business_type = btSelect ? btSelect.value : '';

  // Bereinigung hier ist Komfort, kein Schutz - maxlength und dieser slice
  // sind clientseitig und trivial umgehbar. Der Wert geht in den System-
  // Prompt, die verbindliche Prüfung läuft serverseitig in
  // cleanBusinessTypeCustom (services/businessTypes.js).
  if (cvzBusinessTypeAllowsCustom(cvzState.business_type)) {
    const custom = document.getElementById('cvz-in-business-type-custom');
    cvzState.business_type_custom = String(custom ? custom.value : '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, CVZ_BUSINESS_TYPE_CUSTOM_MAXLEN);
  } else {
    cvzState.business_type_custom = '';
  }
}
function cvzSyncStep1Fields() {
  cvzState.conversion_goal = document.getElementById('cvz-in-goal').value.trim();
  const funnelSelect = document.getElementById('cvz-in-funnel-stage');
  cvzState.funnel_stage = funnelSelect ? funnelSelect.value : '';
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
    if (!cvzState.business_type) return 'Bitte eine Produktkategorie auswählen.';
    if (cvzBusinessTypeAllowsCustom(cvzState.business_type) && !cvzState.business_type_custom) {
      return 'Bitte deine Produktkategorie eintragen.';
    }
    if (!cvzState.target_audience) return 'Bitte eine Zielgruppe angeben.';
  }
  if (cvzState.step === 1) {
    cvzSyncStep1Fields();
    if (!cvzState.conversion_goal) return 'Bitte ein Conversion-Ziel angeben.';
    if (!cvzState.funnel_stage) return 'Bitte eine Funnel-Stage auswählen.';
  }
  if (cvzState.step === 2) {
    cvzSyncStep2Fields();
    if (cvzState.usps.length === 0) return 'Bitte mindestens eine USP eintragen.';
    if (cvzState.features.length === 0) return 'Bitte mindestens ein Feature eintragen.';
    if (cvzState.brand_color && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cvzState.brand_color)) {
      return `"${cvzState.brand_color}" ist kein gültiger Hex-Farbcode (z.B. #4f46e5) - oder das Feld leer lassen.`;
    }
    if (cvzState.brand_reference_url) {
      try {
        new URL(cvzState.brand_reference_url);
      } catch {
        return `"${cvzState.brand_reference_url}" ist keine gültige URL (mit https:// beginnen) - oder das Feld leer lassen.`;
      }
    }
  }
  if (cvzState.step === 3) {
    const total = cvzTotalCompetitorCount();
    if (total === 0) return 'Bitte mindestens einen Wettbewerber auswählen oder ergänzen.';
    if (total > CVZ_MAX_COMPETITORS) return `Maximal ${CVZ_MAX_COMPETITORS} Wettbewerber möglich - bitte welche abwählen.`;
  }
  return null;
}

async function cvzGoNext() {
  // GEÄNDERT: Sperre jetzt anhand von canStart (Plan-Kontingent ODER
  // gekaufte Aufbau-PPU-Credits), nicht mehr allein anhand von remaining -
  // sonst waere ein Kunde mit aufgebrauchtem Plan-Kontingent, aber noch
  // vorhandenen PPU-Credits, hier faelschlich blockiert worden, obwohl
  // /start-session seinen Kauf laengst als Fallback akzeptiert.
  if (cvzQuota.canStart === false) {
    cvzShowError('Kein Sessions-Kontingent mehr verfügbar in diesem Monat.');
    return;
  }

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
  // Banner/Button-Zustand nach jedem Render-Wechsel erneut anwenden - der
  // Button selbst liegt ausserhalb von #cvz-step-content und wird beim
  // Schrittwechsel nicht neu erzeugt, aber diese Zeile macht die Funktion
  // robust gegen ein spaeteres Embed, das den Button doch neu rendert.
  cvzRenderQuotaBanner();
  cvzUpdateNextButtonState();
}

// ==================== ASYNCHRONE TURNS: POLLING (siehe Chat-Begründung) ====================
// /start-session (Kickoff) und /chat antworten seit dem Backend-Umbau nicht
// mehr sofort mit dem fertigen Ergebnis, sondern mit 202 + { turn_id,
// status: 'processing' }. Der eigentliche Agent-Lauf läuft im Hintergrund
// weiter, das Ergebnis muss über GET /chat/status/:turn_id abgeholt werden.
//
// GENAU DAS fehlte bisher: cvzOpenChat() und cvzSendMessage() haben die
// 202-Antwort direkt an marked() weitergereicht, die aber kein message-Feld
// enthält - daher "marked(): input parameter is undefined or null".
//
// cvzPollTurnStatus() kapselt das Warten: fragt in Intervallen nach, bis
// status "done" (liefert das Ergebnis) oder "error" (wirft) zurückkommt.
const CVZ_POLL_INTERVAL_MS = 2500;
// 15 Minuten - synchron zum serverseitigen Sicherheitsnetz
// BACKGROUND_TURN_TIMEOUT_MS in pageAgent.js. Laenger warten hat keinen
// Sinn, der Server hätte den Turn bis dahin ohnehin selbst abgebrochen.
const CVZ_POLL_MAX_MS = 15 * 60 * 1000;

async function cvzPollTurnStatus(turnId) {
  const headers = cvzAuthHeaders();
  const start = Date.now();

  while (true) {
    if (Date.now() - start > CVZ_POLL_MAX_MS) {
      throw new Error('Zeitüberschreitung - die Antwort hat zu lange gedauert. Bitte erneut versuchen.');
    }

    const res = await fetch(`${API_BASE}/api/page-agent/chat/status/${turnId}`, {
      method: 'GET',
      headers
    });
    const data = await res.json();

    if (!res.ok && data.status !== 'error') {
      // 403/404/500 auf den Status-Endpoint selbst, nicht zu verwechseln
      // mit einem Turn, der MIT status:'error' erfolgreich zu Ende kam.
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    if (data.status === 'processing') {
      await new Promise(r => setTimeout(r, CVZ_POLL_INTERVAL_MS));
      continue;
    }

    if (data.status === 'error') {
      throw new Error(data.error || 'Unbekannter Fehler bei der Verarbeitung.');
    }

    // status === 'done' - data enthaelt message, sessions_used/limit/
    // remaining und ggf. structure_html_document/structure_version, exakt
    // dieselben Felder wie frueher der synchrone Response-Body.
    return data;
  }
}

// ==================== LAUNCH ====================

// ==================== FORTSCHRITTS-TEXTE (zeitbasiert statt fester 20s-Takt) ====================
// GEÄNDERT (siehe Chat-Begründung): Vorher rückte die Nachricht alle 20s
// weiter, unabhängig von der Array-Länge - bei 4 Einträgen stand nach 80s
// bereits die LETZTE Nachricht ("Fast durch...") fest, obwohl der Kickoff
// real typischerweise ~350s dauert. Jetzt trägt jede Nachricht einen eigenen
// "ab wann sichtbar"-Zeitpunkt (Sekunden), an der tatsächlichen typischen
// Dauer ausgerichtet. "Fast fertig"-Formulierungen stehen jetzt bewusst erst
// kurz vor den üblichen ~350s, nicht mehr pauschal nach 80s.
//
// Format: { at: Sekunden-Schwelle, text: Anzeigetext }
// Die Liste MUSS nach "at" aufsteigend sortiert sein.
const CVZ_KICKOFF_MESSAGES = [
  { at: 8,   text: 'Hier wird die nächsten Minuten malocht. Hol dir in der Zeit gerne einen Kaffee' },
  { at: 30,  text: 'Keyword-Daten und Suchintent werden geprüft' },
  { at: 70,  text: 'Kaffee schon geholt? Wir wühlen noch in Wettbewerber-Seiten' },
  { at: 120, text: 'Buying-Center-Rollen werden einsortiert' },
  { at: 180, text: 'Content-Gap-Analyse läuft' },
  { at: 250, text: 'Letzte Erkenntnisse werden zusammengetragen' },
  { at: 320, text: 'Fast durch, gleich ist die Analyse fertig' },
  { at: 420, text: 'Läuft noch - bei umfangreichen Briefings kann das schon mal 6-7 Minuten dauern' },
  { at: 600, text: 'Braucht in diesem Fall spürbar länger als sonst, bitte noch etwas Geduld' }
];

// Struktur-Turns sind erfahrungsgemäß deutlich kürzer (2-3 Minuten) als der
// Kickoff, deshalb eigene, engere Schwellen.
const CVZ_STRUCTURE_MESSAGES = [
  { at: 8,   text: 'Denkt nach' },
  { at: 20,  text: 'Baut Sektion für Sektion auf' },
  { at: 45,  text: 'Bei einer kompletten Seite dauert das schon mal 2 bis 3 Minuten' },
  { at: 90,  text: 'Feilt an Überschriften und Trust-Signalen' },
  { at: 140, text: 'Fast fertig, letzte Handgriffe' },
  { at: 200, text: 'Läuft noch - bei umfangreichen Strukturen kann das etwas länger dauern' }
];

// Wählt die Nachricht, deren "at"-Schwelle zuletzt unterschritten wurde -
// also die "aktuellste" für die verstrichene Zeit. Vor der ersten Schwelle
// (elapsedSec < messages[0].at) wird baseText verwendet, nicht die erste
// Nachricht - das entspricht dem bisherigen Verhalten (baseText für die
// ersten paar Sekunden).
function cvzPickTimedMessage(messages, elapsedSec) {
  let chosen = null;
  for (const entry of messages) {
    if (elapsedSec >= entry.at) chosen = entry;
    else break; // Liste ist aufsteigend sortiert, weitere Einträge liegen noch in der Zukunft
  }
  return chosen;
}

function cvzStartProgressTicker(baseText, messages, onUpdate) {
  const startTime = Date.now();
  const tick = () => {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const picked = cvzPickTimedMessage(messages, elapsedSec);
    let text = picked ? `${picked.text} …` : baseText;
    if (elapsedSec >= 30) text += ` (${elapsedSec}s)`;
    onUpdate(text);
  };
  tick();
  const tickTimer = setInterval(tick, 1000);
  // Kein separater messageTimer mehr nötig - cvzPickTimedMessage wertet
  // elapsedSec bei jedem tick() (jede Sekunde) direkt neu aus, statt in
  // einem festen 20s-Takt unabhängig hochzuzählen.
  return () => { clearInterval(tickTimer); };
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

// NEU: Ladezustand fuer die allererste Sekunde nach Seitenaufruf, bevor
// feststeht, ob ueberhaupt ein Formular gezeigt wird (neues Projekt) oder
// direkt in einen bestehenden Workspace gewechselt wird (Resume). Vorher
// stand das leere Formular schon sichtbar da, waehrend Identitaet,
// Formularoptionen und der Resume-Check noch liefen - das wirkte wie ein
// kaputtes/leeres Formular, teils mehrere Sekunden lang. Nutzt bewusst
// dieselben #cvz-loading/#cvz-loading-text-Elemente wie cvzShowLoading,
// aber ohne Ticker-Nachrichten - die KICKOFF/STRUCTURE-Texte ("Kaffee schon
// geholt? ...") passen inhaltlich nicht zu einem simplen Seiten-Ladevorgang.
function cvzShowInitialLoading() {
  const formCard = document.getElementById('cvz-form-card');
  const loading = document.getElementById('cvz-loading');
  const loadingText = document.getElementById('cvz-loading-text');
  if (formCard) formCard.style.display = 'none';
  if (loadingText) loadingText.textContent = 'Wird geladen …';
  if (loading) loading.style.display = 'block';
}
function cvzHideInitialLoading() {
  const loading = document.getElementById('cvz-loading');
  if (loading) loading.style.display = 'none';
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
        // Immer ein key aus /form-options, nie ein Anzeigetext und nie
        // Freitext - siehe Kommentar bei cvzLoadFormOptions.
        business_type: cvzState.business_type || null,
        // Frei eingetippte Kategorie, nur bei Typen mit requires_custom_text.
        // Setzt die Spalte business_type_custom in page_briefs voraus.
        business_type_custom: cvzState.business_type_custom || null,
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

    cvzShowLoading('Hier wird die nächsten Minuten malocht. Hol dir in der Zeit gerne einen Kaffee …');
    const sessionRes = await fetch(`${API_BASE}/api/page-agent/start-session`, {
      method: 'POST', headers,
      body: JSON.stringify({ user_id: userId, page_project_id })
    });
    if (!sessionRes.ok) {
      const err = await sessionRes.json();
      // Bei 402 (Kontingent aufgebraucht) lokalen Quota-Stand sofort
      // korrigieren, damit Banner und Button auch dann konsistent sind,
      // falls der User in einem zweiten Tab noch ein Kontingent gesehen
      // hatte, das inzwischen woanders verbraucht wurde. canStart wird
      // hier bewusst NICHT hart auf false gesetzt, sondern per erneutem
      // cvzLoadQuota() neu ermittelt - falls parallel doch noch ein
      // PPU-Credit gekauft wurde, soll das sofort wieder freischalten.
      if (sessionRes.status === 402) {
        cvzQuota.remaining = 0;
        cvzLoadQuota();
      }
      throw new Error(err.error || 'Analyse fehlgeschlagen');
    }
    const sessionData = await sessionRes.json();

    cvzState.session_id = sessionData.session_id;
    cvzState.page_project_id = page_project_id;

    // FIX: URL jetzt auf dieses konkrete neue Projekt festnageln. Ohne das
    // stand hier weiterhin ?new=1 (oder gar nichts) in der Adresszeile -
    // ein Reload ab jetzt landet wieder ohne ID im Resume-Aufruf und laedt
    // faelschlich das "letzte" Projekt statt dieses gerade erst gestartete.
    window.history.replaceState({}, '', window.location.pathname + '?project=' + encodeURIComponent(page_project_id));

    // /start-session antwortet für eine WIRKLICH NEUE Session sofort mit
    // turn_id + status:'processing' (kein message-Feld). Nur der
    // "reused"-Pfad (bereits aktive Session) liefert weiterhin synchron ein
    // vollstaendiges message-Feld direkt - dort gibt es keine turn_id, dann
    // ist nichts abzuwarten.
    let finalSessionData = sessionData;
    if (sessionData.turn_id) {
      finalSessionData = await cvzPollTurnStatus(sessionData.turn_id);
    }

    cvzOpenChat(finalSessionData);
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
    // FIX: ?new=1 bleibt bewusst in der URL stehen, solange noch KEIN
    // echtes Projekt existiert (cvzState.page_project_id wird erst in
    // cvzLaunch() gesetzt). Vorher wurde der Parameter hier sofort per
    // replaceState entfernt - ein Reload waehrend des Formular-Ausfuellens
    // hatte dann weder ?new=1 noch ?project=..., landete also im
    // Resume-Aufruf ohne ID und lud faelschlich das letzte fertige Projekt.
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

    // Die erste Nachricht ist der von start-session erzeugte Kickoff-Prompt.
    // Er gehoert in die Historie fuer das Modell, aber nicht in die Ansicht -
    // der Verlauf soll direkt mit der Analyse der Ausgangslage beginnen.
    //
    // ANNAHME ueber die API: der Kickoff-Prompt ist immer das erste Element
    // von data.messages und hat role 'user'. Sauberer waere, wenn der Server
    // ihn gar nicht erst zurueckgibt oder mit einem Flag markiert - dann
    // pruefen wir hier ein Feld statt eines Index.
    let lastBubble = null;
    (data.messages || []).forEach((m, i) => {
      if (i === 0 && m.role === 'user') return;
      lastBubble = cvzAppendMessage(m.role, m.content, null, null, { scroll: 'none' });
    });

    if (data.structure_html_document) {
      cvzUpdatePreviewPanel(data.structure_html_document, data.structure_version);
    }

    // Einmal am Schluss scrollen statt bei jeder Nachricht: der ANFANG der
    // letzten Antwort steht oben, nicht deren Ende.
    cvzScrollChatTo(lastBubble, 'top');
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
  // Nur die Antwort des Assistenten wird gerendert - der Kickoff-Prompt
  // entsteht serverseitig und taucht hier ohnehin nicht auf.
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
      console.warn('Iframe-Höhe konnte nicht ermittelt werden:', e.message);
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
  // 32px = das horizontale Padding von .cvz-preview-body (2x16px).
  // Unter 768px reduziert die CSS-Datei das auf 2x8px - der kleine
  // Unterschied kostet nur ein paar Pixel Skalierung und ist bewusst
  // nicht nachgezogen, um hier keine zweite Quelle fuer denselben Wert
  // zu haben.
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
    console.warn('Iframe-Höhe nach Geräte-Wechsel konnte nicht neu ermittelt werden:', e.message);
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

// Scrollsteuerung fuer das Chatfenster.
//   mode 'end' - ans untere Ende
//   mode 'top' - der ANFANG von el steht oben im sichtbaren Bereich
//
// Hintergrund: Antworten des Assistenten sind regelmaessig laenger als das
// Chatfenster. Scrollt man wie bisher immer ans Ende, landet der Nutzer
// mitten im Text und muss erst zurueckscrollen, um den Anfang zu lesen.
function cvzScrollChatTo(el, mode) {
  const wrap = document.getElementById('cvz-chat-messages');
  if (!wrap) return;

  if (mode === 'end' || !el) {
    wrap.scrollTop = wrap.scrollHeight;
    return;
  }

  // getBoundingClientRect statt offsetTop: offsetTop bezieht sich auf den
  // naechsten POSITIONIERTEN Vorfahren. .cvz-chat-messages ist static, der
  // Wert waere also nicht der Abstand innerhalb des Chatfensters.
  const delta = el.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
  wrap.scrollTop += delta - 12; // 12px Luft ueber der Nachricht
}

// options.scroll:
//   'auto' (Standard) - eigene Nachrichten ans Ende, Antworten des
//                       Assistenten an ihren ANFANG
//   'end'             - immer ans Ende (Ladeblase: Spinner soll sichtbar bleiben)
//   'none'            - gar nicht scrollen (Aufbau des Verlaufs beim Resume,
//                       dort wird einmal am Schluss gescrollt)
function cvzAppendMessage(role, text, structureHtmlDocument, structureVersion, options = {}) {
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

  const mode = options.scroll || 'auto';
  if (mode === 'end') {
    cvzScrollChatTo(null, 'end');
  } else if (mode === 'auto') {
    cvzScrollChatTo(bubble, role === 'assistant' ? 'top' : 'end');
  }

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
  // scroll:'end' - die Ladeblase ist kurz, ihr Spinner soll unten sichtbar
  // stehen. Mit 'auto' wuerde sie als Assistenten-Nachricht behandelt und
  // koennte aus dem Bild rutschen.
  const loadingBubble = cvzAppendMessage('assistant', 'Denkt nach …', null, null, { scroll: 'end' });
  loadingBubble.classList.add('loading');
  loadingBubble.innerHTML = '<span class="cvz-spinner-inline"></span><span class="cvz-loading-label">Denkt nach …</span>';
  const loadingLabel = loadingBubble.querySelector('.cvz-loading-label');
  const stopTicker = cvzStartProgressTicker('Denkt nach …', CVZ_STRUCTURE_MESSAGES, t => { loadingLabel.textContent = t; });

  // /chat antwortet sofort mit 202 + { turn_id, status: 'processing' }, OHNE
  // message-Feld. Das eigentliche Ergebnis kommt erst über
  // cvzPollTurnStatus() zurück.
  try {
    const res = await fetch(`${API_BASE}/api/page-agent/chat`, {
      method: 'POST', headers: cvzAuthHeaders(),
      body: JSON.stringify({ user_id: cvzUserId(), session_id: cvzState.session_id, message })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    // data = { turn_id, status: 'processing' } - jetzt auf das eigentliche
    // Ergebnis warten, waehrend die Ladeblase/der Ticker weiterlaeuft.
    const finalData = await cvzPollTurnStatus(data.turn_id);

    stopTicker();
    loadingBubble.remove();
    cvzAppendMessage('assistant', finalData.message, finalData.structure_html_document, finalData.structure_version);
    cvzUpdateQuota(finalData.sessions_remaining, finalData.sessions_limit);
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
// KEIN zusätzliches addEventListener für dieselben IDs - das würde zu
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
      // Das Anchor-Element MUSS im DOM haengen: Firefox ignoriert click()
      // auf nicht eingehaengten Anchors, der Download passierte dort
      // stillschweigend nicht. Gleiches Vorgehen wie in
      // cvzDownloadCurrentStructure.
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

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
// Sofort beim Laden, noch vor jedem await: Formular ausblenden und einen
// simplen Ladezustand zeigen. Ohne das war für die Dauer von
// cvzResolveIdentity + cvzLoadFormOptions + cvzTryResume (Netzwerk-
// Roundtrips, teils mehrere Sekunden) das leere, unbefuellte Formular
// sichtbar, bevor überhaupt feststand, ob es gezeigt werden soll.
cvzShowInitialLoading();

cvzResolveIdentity().then(identityOk => {
  if (!identityOk) {
    cvzHideInitialLoading();
    document.getElementById('cvz-auth-gate').style.display = 'block';
    document.getElementById('cvz-form-card').style.display = 'none';
    return;
  }
  // Auswahllisten VOR dem ersten Render laden - cvzRenderStep0 und
  // cvzRenderStep1 lesen sie synchron aus cvzBusinessTypeGroups/cvzFunnelStages.
  cvzLoadFormOptions().then(() => cvzTryResume()).then(resumed => {
    cvzHideInitialLoading();
    if (!resumed) {
      // cvzShowInitialLoading() hatte cvz-form-card ausgeblendet - jetzt,
      // wo feststeht dass das Formular tatsächlich gezeigt wird, wieder
      // einblenden, bevor cvzRenderStep() es befuellt.
      const formCard = document.getElementById('cvz-form-card');
      if (formCard) formCard.style.display = 'block';
      cvzRenderStep();
      // Kontingent erst NACH dem ersten Render laden, damit
      // cvzRenderQuotaBanner() bereits ein vorhandenes #cvz-form-card
      // vorfindet und der Banner nicht ins Leere versucht einzuhaengen.
      cvzLoadQuota();
    }
    // Falls resumed === true, hat cvzTryResume() bereits selbst zu
    // #cvz-workspace gewechselt - hier ist nichts weiter zu tun.
  });
});
