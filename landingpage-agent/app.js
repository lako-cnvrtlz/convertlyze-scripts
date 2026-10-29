// ==================== KONFIGURATION ====================
const API_BASE = 'https://convertlyze-agent-api-production.up.railway.app';
// ==================== IDENTITÄT (echter Memberstack-Login) ====================
// WICHTIG (Sicherheits-Fix, siehe Chat-Verlauf): cvzMemberstackToken enthaelt
// NICHT mehr member.id (die pure, unsignierte Member-ID - keine echte
// Authentifizierung), sondern das echte, von Memberstack signierte JWT aus
// getMemberCookie(). Der Server verifiziert dieses Token jetzt kryptographisch
// (services/memberstackAuth.js), bevor er der enthaltenen ID glaubt. Vorher
// reichte hier die bekannte Member-ID eines fremden Accounts als Bearer-Token,
// um an dessen Daten zu kommen - live gegen die Produktions-API bestaetigt.
let cvzMemberstackToken = null;
let cvzResolvedUserId = null;
function cvzAuthHeaders() {
  return {
    'Authorization': `Bearer ${cvzMemberstackToken}`,
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
    // getCurrentMember() bleibt noetig, um "eingeloggt oder nicht" zu pruefen
    // (getMemberCookie() liefert bei keiner Session einfach null/leer).
    // getMemberCookie() liefert trotz des Namens kein Cookie, sondern das
    // tatsaechliche signierte JWT (aus localStorage) - das ist das Token,
    // das der Server jetzt verifiziert.
    const [{ data: member }, token] = await Promise.all([
      memberstackDom.getCurrentMember(),
      memberstackDom.getMemberCookie()
    ]);
    if (!member || !token) return false;
    cvzMemberstackToken = token;
    const res = await fetch(`${API_BASE}/api/page-agent/me`, {
      headers: { 'Authorization': `Bearer ${cvzMemberstackToken}` }
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
    border-radius: 0px;
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
  } else if (cvzQuota.ppuAufbauAvailable > 0) {
    // Plan-Kontingent ist noch nicht aufgebraucht, aber es liegen zusaetzlich
    // gekaufte Aufbau-PPU-Credits bereit - die sollen direkt nach dem Kauf
    // sichtbar sein, nicht erst wenn das Plan-Kontingent auf 0 faellt. Sonst
    // wirkt ein bezahlter Credit fuer den Kunden wie "verschwunden".
    banner.textContent = `${cvzQuota.remaining} von ${cvzQuota.limit} Sessions in diesem Monat verfügbar. Zusätzlich: ${cvzQuota.ppuAufbauAvailable} gekaufte Aufbau-Session${cvzQuota.ppuAufbauAvailable > 1 ? 's' : ''} in Reserve.`;
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
  // Wie die Vorschläge zustande kamen, für die Erklärung über der Liste:
  // { keyword, commercialQuery: string|null, validFromKeyword: number }
  competitorSearchInfo: null,
  manualCompetitors: [],
  // Seitentyp: 'landingpage' (Standard) oder 'pillar'. Die Auswahl erscheint
  // nur, wenn GET /form-options mehr als einen Typ liefert (Feature-Flag
  // PAGE_TYPES_ENABLED im Backend).
  page_type: 'landingpage',
  // Nur Pillar Page:
  conversion_target_kind: 'text',   // 'url' oder 'text'
  conversion_target_value: '',
  messy_middle_phase: '',
  sender_name: '',
  cluster_text: '',                 // eine Unterseite pro Zeile: "Keyword" oder "Keyword | https://url"
  // Aus der Content-Strategie übernommen (optional): { session_id, pillar_index, label, child_count }
  strategy: null,
  strategy_context: ''
};
// Die Schritte hängen vom Seitentyp ab. cvzState.step bleibt ein Index, der
// Inhalt kommt über den Schritt-Schlüssel. Die Landingpage-Schritte sind
// unverändert, nur 'type' kommt davor, wenn mehr als ein Typ aktiv ist.
const CVZ_STEP_LABELS = {
  type: 'Seitentyp',
  topic: 'Thema', goal: 'Ziel', offer: 'Angebot', competitors: 'Wettbewerber',
  p_topic: 'Thema', p_goal: 'Ziel & Cluster', p_context: 'Kontext'
};
function cvzStepKeys() {
  const keys = cvzState.page_type === 'pillar'
    ? ['p_topic', 'p_goal', 'p_context']
    : ['topic', 'goal', 'offer', 'competitors'];
  if (cvzPageTypes.length > 1) keys.unshift('type');
  return keys;
}
function cvzCurrentStepKey() {
  return cvzStepKeys()[cvzState.step];
}
function cvzRenderSteps() {
  const el = document.getElementById('cvz-steps');
  el.innerHTML = cvzStepKeys().map(k => CVZ_STEP_LABELS[k]).map((label, i) => {
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
// [{ key, label, has_interview, preview_title, download_base_name }] aus
// /form-options. Fehlt das Feld (altes Backend), bleibt es bei der Landingpage.
let cvzPageTypes = [];
// Fallback, falls /form-options nicht erreichbar ist. Bewusst nur die
// Funnel-Stages: ohne sie wäre Schritt 1 komplett unbedienbar. Für
// business_type gibt es KEINEN Fallback – eine geratene Liste ist genau
// der Fehler, der hier abgestellt werden soll. Dann lieber ein sichtbarer
// Hinweis als ein Dropdown, das beim Launch scheitert.
// Phasen nach dem Messy-Middle-Modell, dieselben vier wie im Strategie-Tool
// und im Customer Journey Tracker. Der Wert geht als funnel_stage ans Backend.
const CVZ_FUNNEL_STAGES_FALLBACK = [
  { key: 'exploration',  label: 'Erforschung' },
  { key: 'evaluation',   label: 'Bewertung' },
  { key: 'comparison',   label: 'Vergleich' },
  { key: 'decision',     label: 'Entscheidung' },
  { key: 'full_journey', label: 'Komplette Journey' }
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
    cvzPageTypes = Array.isArray(data.page_types) ? data.page_types : [];
  } catch (e) {
    console.error('form-options konnten nicht geladen werden:', e.message);
    cvzBusinessTypeGroups = [];
    cvzFunnelStages = CVZ_FUNNEL_STAGES_FALLBACK;
    cvzPageTypes = [];
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
  exploration: 'Besucher lernen Thema oder Problem erst kennen. Typische Suchen: „was ist …“, „wie funktioniert …“.',
  evaluation: 'Besucher prüfen, ob sich die Lösungsart für sie lohnt. Typische Suchen: Kosten, Nutzen, Erfahrungen.',
  comparison: 'Besucher vergleichen konkrete Anbieter oder Alternativen. Typische Suchen: Vergleich, Alternativen, „X vs. Y“.',
  decision: 'Besucher wollen kaufen oder beauftragen. Typische Suchen: Anbieter, Angebot, Demo, Preise.',
  full_journey: 'Die Seite bedient alle vier Phasen, typisch für die zentrale Angebotsseite.'
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
    <p class="cvz-subtitle">Conversion-Ziel und Phase in der Customer Journey.</p>
    <label class="cvz-label">Conversion-Ziel</label>
    <div class="cvz-select-wrap">
      <select class="cvz-input" id="cvz-in-goal">
        <option value="" disabled ${!cvzState.conversion_goal ? 'selected' : ''}>Conversion-Ziel auswählen …</option>
        ${optgroups}
      </select>
    </div>
    <label class="cvz-label">In welcher Phase sind die Besucher dieser Seite?</label>
    <div class="cvz-select-wrap">
      <select class="cvz-input" id="cvz-in-funnel-stage" onchange="cvzOnFunnelStageChange(this.value)">
        <option value="" disabled ${!cvzState.funnel_stage ? 'selected' : ''}>Phase auswählen …</option>
        ${funnelOptions}
      </select>
    </div>
    <p class="cvz-hint" id="cvz-funnel-stage-hint">${cvzEsc(cvzFunnelStageHint(cvzState.funnel_stage))}</p>
  `;
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
    <label class="cvz-label">Eigene Inhalte als Quelle (optional)</label>
    <input class="cvz-input" id="cvz-in-refurl" placeholder="URL eurer Seite eingeben, Enter drücken (Seite oder YouTube-Video)" onkeydown="cvzAddRefUrlOnEnter(event)">
    <div class="cvz-chip-row" id="cvz-refurl-chips">${cvzRenderRefUrlChips()}</div>
    <p class="cvz-hint">Eure eigenen Seiten mit Fakten zum Angebot: Produktseite, Case Study, Referenzprojekt, Webinar. Zahlen und Aussagen daraus darf der Assistent auf die Landingpage übernehmen. Wettbewerber gehören nicht hierher, die tragt ihr im Wettbewerber-Schritt ein. Bis zu 3 Links werden tatsächlich abgerufen.</p>
    <label class="cvz-label">PDF hochladen (optional)</label>
    <input type="file" accept="application/pdf" id="cvz-in-pdf" onchange="cvzUploadPdf(event)">
    <div id="cvz-pdf-status" style="margin-top:8px;"></div>
    <div class="cvz-chip-row" id="cvz-pdf-chips">${cvzRenderPdfChips()}</div>
    <label class="cvz-label">Eure Markenfarbe (optional)</label>
    <input class="cvz-input" id="cvz-in-brand-color" placeholder="#4f46e5" value="${cvzEsc(cvzState.brand_color)}" oninput="cvzSyncBrandColorFromText(this.value)">
    <p class="cvz-hint">Nur ausfüllen, wenn die Akzentfarbe von eurer Website abweichen soll. Eine Farbe hier hat Vorrang vor der Farbe, die von der Website übernommen wird.</p>
    <label class="cvz-label">Eure Website für den Marken-Look (optional)</label>
    <input class="cvz-input" id="cvz-in-brand-url" placeholder="https://eure-website.de" value="${cvzEsc(cvzState.brand_reference_url)}">
    <p class="cvz-hint">Die Vorschau übernimmt Farben, Schrift, Button-Form und Logo eurer Startseite. Sie ist an eure Marke angelehnt, keine exakte Kopie. Einige Seiten blockieren das automatische Auslesen, dann bleibt das Standard-Design.</p>
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
      headers: { 'Authorization': `Bearer ${cvzMemberstackToken}` },
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
// ==================== TABELLEN IM CHAT MOBILTAUGLICH MACHEN ====================
// Kopiert die <thead>-Überschriften als data-label auf jede <td>-Zelle.
// Das CSS blendet ab <=1080px den Header aus und zeigt das Label über
// dem jeweiligen Wert - aus einer Zeile wird eine Karte.
// Greift nur bei Tabellen, die auch einen thead haben.
// Wird direkt aus cvzAppendMessage() aufgerufen, kein MutationObserver nötig.
function cvzLabelTablesForCards(container) {
  var tables = container.querySelectorAll('table:not([data-cvz-labeled])');
  for (var t = 0; t < tables.length; t++) {
    var table = tables[t];
    var headCells = table.querySelectorAll('thead th');
    if (!headCells.length) continue;
    var labels = [];
    for (var h = 0; h < headCells.length; h++) labels.push(headCells[h].textContent.trim());
    var rows = table.querySelectorAll('tbody tr');
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].children.length; c++) {
        if (labels[c]) rows[r].children[c].setAttribute('data-label', labels[c]);
      }
    }
    table.classList.add('cvz-table-cards');
    table.setAttribute('data-cvz-labeled', '1');
  }
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
// Unterhalb dieser Zahl echter Angebotsseiten wird ein zweites Mal gesucht.
const CVZ_MIN_GOOD_SUGGESTIONS = 2;
async function cvzFetchCompetitorSuggestions(variant) {
  const res = await fetch(`${API_BASE}/api/page-agent/suggest-competitors`, {
    method: 'POST', headers: cvzAuthHeaders(),
    body: JSON.stringify({
      keyword: cvzState.keyword,
      business_type: cvzState.business_type || null,
      ...(variant ? { variant } : {})
    })
  });
  const data = await res.json();
  if (!res.ok && !Array.isArray(data.suggestions)) throw new Error(data.error || `HTTP ${res.status}`);
  return { suggestions: data.suggestions || [], query: data.query || cvzState.keyword };
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
  // Keyword nach dem letzten Laden geändert: alte Vorschläge verwerfen, eigene Einträge bleiben.
  if (cvzState.competitorSearchInfo && cvzState.competitorSearchInfo.keyword !== cvzState.keyword) {
    cvzState.competitorSuggestions = [];
    cvzState.filteredOutCompetitors = [];
    cvzState.competitorSearchInfo = null;
  }
  const nothingLoadedYet =
    cvzState.competitorSuggestions.length === 0 &&
    cvzState.filteredOutCompetitors.length === 0 &&
    !cvzState.competitorSearchInfo;
  if (nothingLoadedYet) {
    try {
      const first = await cvzFetchCompetitorSuggestions(null);
      // WICHTIG: erst filtern, dann kuerzen. Das Backend liefert dafür bis zu
      // 20 Rohtreffer, nicht nur 5.
      const filtered = cvzFilterCompetitorSuggestions(first.suggestions);
      let items = filtered.items;
      let removed = filtered.removed;
      let commercialQuery = null;
      // Für informationale Keywords ranken oft fast nur Ratgeber. Dann einmal mit
      // "Anbieter"-Zusatz nachsuchen, statt den Nutzer mit leerer Liste stehen zu lassen.
      if (items.length < CVZ_MIN_GOOD_SUGGESTIONS) {
        try {
          const second = await cvzFetchCompetitorSuggestions('commercial');
          if (second.query && second.query !== first.query) {
            const seen = new Set(items.map(x => x.host));
            const extra = cvzFilterCompetitorSuggestions(second.suggestions);
            const added = extra.items.filter(x => !seen.has(x.host)).map(x => ({ ...x, fromCommercial: true }));
            if (added.length > 0) commercialQuery = second.query;
            items = [...items, ...added];
          }
        } catch (e2) {
          console.warn('Zweite Wettbewerber-Suche fehlgeschlagen:', e2.message);
        }
      }
      cvzState.competitorSearchInfo = { keyword: cvzState.keyword, commercialQuery, validFromKeyword: filtered.items.length };
      cvzState.competitorSuggestions = items
        .slice(0, CVZ_MAX_SUGGESTIONS_SHOWN)
        .map((s, i) => ({
          ...s,
          selected: i < CVZ_PRESELECT_COUNT,
          recommended: i < CVZ_PRESELECT_COUNT
        }));
      cvzState.filteredOutCompetitors = removed;
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
  const counter = total === 0
    ? `<p class="cvz-selection-count">Noch kein Wettbewerber ausgewählt. Mindestens 1 ist nötig, höchstens ${CVZ_MAX_COMPETITORS}.</p>`
    : `<p class="cvz-selection-count ${atCap ? 'limit' : ''}">
      ${total} ausgewählt (höchstens ${CVZ_MAX_COMPETITORS})${atCap ? ' – mehr geht nicht' : ' – du kannst weitere ergänzen oder abwählen'}
    </p>`;
  const notice = cvzCompetitorNotice();
  const suggested = cvzState.competitorSuggestions.map((s, i) => {
    const locked = atCap && !s.selected;
    const badge = s.recommended ? '<span class="cvz-badge">Empfohlen</span>' : '';
    const origin = s.fromCommercial && cvzState.competitorSearchInfo && cvzState.competitorSearchInfo.commercialQuery
      ? `<div class="url">gefunden über „${cvzEsc(cvzState.competitorSearchInfo.commercialQuery)}“</div>` : '';
    return `
    <div class="cvz-competitor-item ${s.selected ? 'selected' : ''} ${locked ? 'locked' : ''}" onclick="${locked ? '' : `cvzToggleCompetitor(${i})`}">
      <input type="checkbox" ${s.selected ? 'checked' : ''} ${locked ? 'disabled' : ''} onclick="event.stopPropagation(); cvzToggleCompetitor(${i})">
      <div class="cvz-competitor-body">
        <div class="title">${cvzEsc(s.title)}${badge}</div>
        <div class="url">${cvzEsc(s.url)}</div>
        ${origin}
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
  const list = suggested + manual;
  container.innerHTML = notice + counter + list;
  cvzRenderFilteredBox();
}
// Erklärt über der Liste, warum sie so aussieht. Drei Fälle:
// 1. Keine einzige Angebotsseite gefunden (auch nicht mit "Anbieter"-Zusatz)
// 2. Vorschläge stammen (teilweise) aus der zweiten Suche
// 3. Normalfall: kein Hinweis
function cvzCompetitorNotice() {
  const info = cvzState.competitorSearchInfo;
  if (!info) return '';
  const kw = cvzEsc(info.keyword || cvzState.keyword);
  const hasSuggestions = cvzState.competitorSuggestions.length > 0;
  if (!hasSuggestions && cvzState.manualCompetitors.length === 0) {
    return `<div class="cvz-competitor-notice">
      <strong>Zu „${kw}“ haben wir keine Angebotsseiten von Wettbewerbern gefunden.</strong>
      <p>Bei Google ranken dafür vor allem Ratgeber, Blogartikel oder Videos. Die haben wir ausgeblendet, weil sich eine Landingpage damit nicht sinnvoll vergleichen lässt. Das ist auch ein Hinweis auf euer Keyword: Die Suchenden wollen sich eher informieren als einen Anbieter finden.</p>
      <p>So geht es weiter: Tragt unten 1 bis ${CVZ_MAX_COMPETITORS} Wettbewerber ein, die ihr kennt, oder übernehmt einen der ausgeblendeten Treffer.</p>
    </div>`;
  }
  if (info.commercialQuery && info.validFromKeyword === 0) {
    return `<div class="cvz-competitor-notice">
      Zu „${kw}“ ranken fast nur Ratgeber und Blogartikel. Die Vorschläge stammen deshalb aus der Suche nach „${cvzEsc(info.commercialQuery)}“. Prüft kurz, ob das wirklich eure Wettbewerber sind.
    </div>`;
  }
  if (info.commercialQuery) {
    return `<div class="cvz-competitor-notice">
      Zu „${kw}“ gab es nur wenige Angebotsseiten. Wir haben zusätzlich nach „${cvzEsc(info.commercialQuery)}“ gesucht.
    </div>`;
  }
  return '';
}
// Fasst die Gründe zusammen, statt pauschal "Videos, Blog- und Glossarseiten" zu behaupten.
function cvzSummarizeFilteredReasons(entries) {
  const groups = { content: 0, platform: 0, duplicate: 0, other: 0 };
  entries.forEach(e => {
    const r = String(e.reason || '');
    if (r.startsWith('Content-Seite')) groups.content++;
    else if (r === 'keine Wettbewerber-Seite') groups.platform++;
    else if (r === 'Domain bereits enthalten') groups.duplicate++;
    else groups.other++;
  });
  const parts = [];
  if (groups.content) parts.push(`${groups.content} Ratgeber-, Blog- oder Infoseite${groups.content === 1 ? '' : 'n'}`);
  if (groups.platform) parts.push(`${groups.platform} Plattform${groups.platform === 1 ? '' : 'en'} wie YouTube, Wikipedia oder Vergleichsportale`);
  if (groups.duplicate) parts.push(`${groups.duplicate} weitere Unterseite${groups.duplicate === 1 ? '' : 'n'} bereits gelisteter Anbieter`);
  if (groups.other) parts.push(`${groups.other} sonstige (z.B. PDF)`);
  return parts.join(', ');
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
      <button onclick="cvzRestoreFilteredCompetitor(${i})">Trotzdem übernehmen</button>
    </li>
  `).join('');
  const n = cvzState.filteredOutCompetitors.length;
  // Gibt es keine Vorschläge, ist diese Liste das Einzige, womit man arbeiten kann: dann offen.
  const open = cvzState.competitorSuggestions.length === 0 ? 'open' : '';
  box.innerHTML = `
    <details class="cvz-filtered-box" ${open}>
      <summary>${n} Treffer ausgeblendet, weil sie keine Angebotsseiten sind</summary>
      <p class="cvz-hint" style="margin:10px 0 0;">${cvzEsc(cvzSummarizeFilteredReasons(cvzState.filteredOutCompetitors))}. Passt einer doch, übernimm ihn.</p>
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
    selected: cvzTotalCompetitorCount() < CVZ_MAX_COMPETITORS,
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
function cvzSyncBrandColorFromText(value) {
  cvzState.brand_color = value.trim();
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
  if (cvzState.page_type === 'pillar' && cvzState.strategy_context) parts.push(cvzState.strategy_context);
  if (cvzState.existing_content) parts.push(cvzState.existing_content);
  if (cvzState.reference_urls.length > 0) {
    const refLabel = cvzState.page_type === 'pillar'
      ? 'Quellen für die Seite (eigene oder externe, vom Nutzer angegeben)'
      : 'Eigene Inhalte als Quelle (Seiten des Anbieters mit Fakten zum Angebot, vom Nutzer angegeben)';
    parts.push(refLabel + ':\n' + cvzState.reference_urls.join('\n'));
  }
  cvzState.pdfExtracts.forEach(p => parts.push(`[PDF: ${p.filename}]\n${p.text}`));
  return parts.join('\n\n');
}
function cvzValidateLpStep(key) {
  if (key === 'topic') {
    cvzSyncStep0Fields();
    if (!cvzState.keyword) return 'Bitte ein Thema/Keyword eingeben.';
    if (!cvzState.business_type) return 'Bitte eine Produktkategorie auswählen.';
    if (cvzBusinessTypeAllowsCustom(cvzState.business_type) && !cvzState.business_type_custom) {
      return 'Bitte deine Produktkategorie eintragen.';
    }
    if (!cvzState.target_audience) return 'Bitte eine Zielgruppe angeben.';
  }
  if (key === 'goal') {
    cvzSyncStep1Fields();
    if (!cvzState.conversion_goal) return 'Bitte ein Conversion-Ziel angeben.';
    if (!cvzState.funnel_stage) return 'Bitte eine Phase auswählen.';
  }
  if (key === 'offer') {
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
  if (key === 'competitors') {
    const total = cvzTotalCompetitorCount();
    if (total === 0) return 'Bitte mindestens einen Wettbewerber auswählen oder ergänzen.';
    if (total > CVZ_MAX_COMPETITORS) return `Maximal ${CVZ_MAX_COMPETITORS} Wettbewerber möglich - bitte welche abwählen.`;
  }
  return null;
}

// Doppelklick-Schutz für den Launch: Jeder Launch legt ein eigenes Projekt an
// und bucht eine eigene Session ab. Die Sperre im Backend greift nur pro
// Projekt, deshalb muss das Frontend den zweiten Klick abfangen.
let cvzLaunching = false;
async function cvzGoNext() {
  if (cvzLaunching) return;
  // Sperre anhand von canStart (Plan-Kontingent ODER gekaufte
  // Aufbau-PPU-Credits), nicht allein anhand von remaining.
  if (cvzQuota.canStart === false) {
    cvzShowError('Kein Sessions-Kontingent mehr verfügbar in diesem Monat.');
    return;
  }
  const error = cvzValidateStep();
  if (error) { cvzShowError(error); return; }
  cvzShowError(null);
  if (cvzState.step < cvzStepKeys().length - 1) {
    cvzState.step++;
    cvzRenderStep();
    return;
  }
  cvzLaunching = true;
  const btn = document.getElementById('cvz-btn-next');
  if (btn) btn.disabled = true;
  try {
    await cvzLaunch();
  } finally {
    cvzLaunching = false;
    cvzUpdateNextButtonState();
  }
}
function cvzGoBack() {
  if (cvzState.step === 0) return;
  cvzState.step--;
  cvzShowError(null);
  cvzRenderStep();
}
function cvzRenderStep() {
  cvzRenderSteps();
  const key = cvzCurrentStepKey();
  if (key === 'type') cvzRenderStepType();
  if (key === 'topic') cvzRenderStep0();
  if (key === 'goal') cvzRenderStep1();
  if (key === 'offer') cvzRenderStep2();
  if (key === 'competitors') cvzRenderStep3();
  if (key === 'p_topic') cvzRenderPillarTopic();
  if (key === 'p_goal') cvzRenderPillarGoal();
  if (key === 'p_context') cvzRenderPillarContext();
  document.getElementById('cvz-btn-back').style.visibility = cvzState.step === 0 ? 'hidden' : 'visible';
  document.getElementById('cvz-btn-next').textContent = cvzState.step === cvzStepKeys().length - 1 ? 'Launch →' : 'Weiter →';
  // Banner/Button-Zustand nach jedem Render-Wechsel erneut anwenden - der
  // Button selbst liegt ausserhalb von #cvz-step-content und wird beim
  // Schrittwechsel nicht neu erzeugt, aber diese Zeile macht die Funktion
  // robust gegen ein spaeteres Embed, das den Button doch neu rendert.
  cvzRenderQuotaBanner();
  cvzUpdateNextButtonState();
}

// ==================== SEITENTYP-AUSWAHL ====================
function cvzRenderStepType() {
  const cards = cvzPageTypes.map(t => `
    <button type="button" class="cvz-type-card ${cvzState.page_type === t.key ? 'selected' : ''}" onclick="cvzSelectPageType('${cvzEsc(t.key)}')">
      <span class="cvz-type-card-title">${cvzEsc(t.label)}</span>
      <span class="cvz-type-card-text">${cvzEsc(CVZ_PAGE_TYPE_TEXT[t.key] || '')}</span>
    </button>
  `).join('');
  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Was möchtest du aufbauen?</h1>
    <p class="cvz-subtitle">Eine Session baut eine Seite. Der Preis ist für beide Typen gleich.</p>
    <div class="cvz-type-cards">${cards}</div>
  `;
}
const CVZ_PAGE_TYPE_TEXT = {
  landingpage: 'Eine Seite mit einem Conversion-Ziel, etwa Demo oder Angebot. Der Assistent analysiert, fragt nach und baut die Struktur nach deiner Zustimmung.',
  pillar: 'Die zentrale Ratgeberseite zu einem Thema. Der Assistent baut sofort ein Gerüst und stellt dir Fragen, die nur ein Experte beantworten kann.'
};
function cvzSelectPageType(key) {
  if (!cvzPageTypes.some(t => t.key === key)) return;
  cvzState.page_type = key;
  cvzRenderStep();
}
function cvzPageTypeInfo() {
  return cvzPageTypes.find(t => t.key === cvzState.page_type) || null;
}

// ==================== PILLAR PAGE: FORMULAR ====================
function cvzRenderPillarTopic() {
  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Welches Thema soll die Pillar Page abdecken?</h1>
    <p class="cvz-subtitle">Das Hauptthema, unter dem ihr gefunden und zitiert werden wollt.</p>
    <div id="cvz-strategy-box"></div>
    <label class="cvz-label">Thema / Ziel-Keyword</label>
    <input class="cvz-input" id="cvz-in-keyword" placeholder="z.B. SAP S/4HANA Migration" value="${cvzEsc(cvzState.keyword)}">
    <label class="cvz-label">Hauptzielgruppe (Persona)</label>
    <input class="cvz-input" id="cvz-in-audience" placeholder="z.B. IT-Leiter im Mittelstand mit SAP ECC" value="${cvzEsc(cvzState.target_audience)}">
    <p class="cvz-hint"><a href="https://www.convertlyze.com/content-hub/icp-generator" target="_blank" rel="noopener" style="color:var(--cvz-teal);">Unsicher bei deiner Zielgruppe? → Kostenloser ICP- & Persona-Assistent</a></p>
  `;
  cvzRenderStrategyBox();
}
// Phasen der Pillar Page. Der Text geht wörtlich in den Prompt (type_brief.messy_middle_phase).
// Entscheidung fehlt bewusst: Eine Pillar Page informiert, sie verkauft nicht.
const CVZ_PILLAR_PHASES = {
  exploration: 'Erforschung (Leser lernt das Thema erst kennen und sucht Orientierung)',
  evaluation: 'Bewertung (Leser prüft, ob sich die Lösungsart für ihn lohnt)',
  comparison: 'Vergleich (Leser stellt Optionen oder Anbieter gegenüber)'
};
// Erkennt auch die alten englischen Werte (Exploration/Evaluation) aus gespeicherten Entwürfen.
function cvzPillarPhaseKey(value) {
  const v = String(value || '');
  if (/^(Erforschung|Exploration)/i.test(v)) return 'exploration';
  if (/^Bewertung/i.test(v)) return 'evaluation';
  if (/^Evaluation/i.test(v)) return 'comparison';
  if (/^Vergleich/i.test(v)) return 'comparison';
  return '';
}
function cvzRenderPillarGoal() {
  const phase = cvzState.messy_middle_phase;
  const fromStrategy = !!(cvzState.strategy && cvzState.strategy.pillar_index !== null && cvzState.conversion_target_value);
  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Wohin soll die Seite führen?</h1>
    <p class="cvz-subtitle">Eine Pillar Page verkauft nicht, sie informiert. Am Ende kann ein dezenter Hinweis auf den nächsten Schritt stehen, ohne Formular.</p>
    <label class="cvz-label">Nächster Schritt für den Leser (optional)</label>
    <input class="cvz-input" id="cvz-in-target-value" placeholder="Seite oder Aktion, z.B. https://eure-seite.de/beratung oder Kostenloses Erstgespräch" value="${cvzEsc(cvzState.conversion_target_value)}">
    <p class="cvz-hint">${fromStrategy ? 'Vorbelegt aus deiner Content-Strategie: die Seite, zu der diese Pillar Page weiterführen soll. Du kannst sie ändern oder löschen. ' : ''}Eine Adresse mit https:// wird als Link verwendet, alles andere als Beschreibung. Bleibt das Feld leer, bekommt die Seite keinen Abschluss-Hinweis.</p>
    <label class="cvz-label">In welcher Phase ist der Leser? (optional)</label>
    <div class="cvz-select-wrap">
      <select class="cvz-input" id="cvz-in-phase">
        <option value="" ${!phase ? 'selected' : ''}>Keine Angabe</option>
        <option value="${CVZ_PILLAR_PHASES.exploration}" ${cvzPillarPhaseKey(phase) === 'exploration' ? 'selected' : ''}>Erforschung: Leser lernt das Thema erst kennen</option>
        <option value="${CVZ_PILLAR_PHASES.evaluation}" ${cvzPillarPhaseKey(phase) === 'evaluation' ? 'selected' : ''}>Bewertung: Leser prüft, ob sich die Lösungsart lohnt</option>
        <option value="${CVZ_PILLAR_PHASES.comparison}" ${cvzPillarPhaseKey(phase) === 'comparison' ? 'selected' : ''}>Vergleich: Leser stellt Optionen oder Anbieter gegenüber</option>
      </select>
    </div>
    <p class="cvz-hint">Bestimmt Tiefe und Tonfall: Wer das Thema erst kennenlernt, braucht Grundlagen, wer bewertet, braucht Nutzen und Kriterien, wer vergleicht, eine faire Gegenüberstellung.</p>
    <label class="cvz-label">Autor / Absender (optional)</label>
    <input class="cvz-input" id="cvz-in-sender" placeholder="z.B. Name und Rolle des Experten, der die Seite verantwortet" value="${cvzEsc(cvzState.sender_name)}">
    <label class="cvz-label">Bereits vorhandene Unterseiten (optional)</label>
    <textarea class="cvz-input" id="cvz-in-cluster" rows="5" placeholder="Eine Seite pro Zeile, Thema | Adresse:\nS/4HANA Kosten | https://eure-seite.de/kosten">${cvzEsc(cvzState.cluster_text)}</textarea>
    <p class="cvz-hint">Nur Seiten, die es schon gibt. Die Pillar Page verlinkt genau diese. Gibt es noch keine, lass das Feld leer: Der Assistent recherchiert dann, welche Unterseiten und Beiträge sich lohnen, und zeigt sie dir als Empfehlung.</p>
  `;
}
function cvzRenderPillarContext() {
  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Was soll der Assistent noch wissen?</h1>
    <p class="cvz-subtitle">Alles hier ist optional. Je mehr echtes Material, desto weniger Platzhalter.</p>
    <label class="cvz-label">Häufige Fragen und Einwände von Kunden (optional)</label>
    <textarea class="cvz-input" id="cvz-in-customer-reasons" placeholder="Was fragen Kunden im Gespräch oder im Support zu diesem Thema immer wieder?" ${cvzState.no_customer_reasons ? 'disabled' : ''}>${cvzEsc(cvzState.customer_reasons)}</textarea>
    <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:0.85rem; color:var(--cvz-text-muted); cursor:pointer; font-weight:400;">
      <input type="checkbox" id="cvz-in-no-customer-reasons" ${cvzState.no_customer_reasons ? 'checked' : ''} onchange="cvzToggleNoCustomerReasons(this.checked)">
      Keine Informationen vorhanden
    </label>
    <label class="cvz-label">Quellen für die Seite (optional)</label>
    <input class="cvz-input" id="cvz-in-refurl" placeholder="URL eingeben, Enter drücken (Seite oder YouTube-Video)" onkeydown="cvzAddRefUrlOnEnter(event)">
    <div class="cvz-chip-row" id="cvz-refurl-chips">${cvzRenderRefUrlChips()}</div>
    <p class="cvz-hint">Eigene und fremde Quellen sind möglich: eure Fachartikel und Projektberichte oder externe Studien, Normen und Fachbeiträge, auf die sich die Seite stützen soll. Sie erscheinen am Ende unter „Quellen“. Wettbewerber-Ratgeber müsst ihr nicht eintragen, die findet der Assistent selbst. Bis zu 3 Links werden tatsächlich abgerufen.</p>
    <label class="cvz-label">PDF hochladen (optional)</label>
    <input type="file" accept="application/pdf" id="cvz-in-pdf" onchange="cvzUploadPdf(event)">
    <div id="cvz-pdf-status" style="margin-top:8px;"></div>
    <div class="cvz-chip-row" id="cvz-pdf-chips">${cvzRenderPdfChips()}</div>
    <label class="cvz-label">Eure Markenfarbe (optional)</label>
    <input class="cvz-input" id="cvz-in-brand-color" placeholder="#4f46e5" value="${cvzEsc(cvzState.brand_color)}" oninput="cvzSyncBrandColorFromText(this.value)">
    <p class="cvz-hint">Nur ausfüllen, wenn die Akzentfarbe von eurer Website abweichen soll. Eine Farbe hier hat Vorrang.</p>
    <label class="cvz-label">Eure Website für den Marken-Look (optional)</label>
    <input class="cvz-input" id="cvz-in-brand-url" placeholder="https://eure-website.de" value="${cvzEsc(cvzState.brand_reference_url)}">
    <p class="cvz-hint">Die Vorschau übernimmt Farben, Schrift, Button-Form und Logo eurer Startseite. Sie ist an eure Marke angelehnt, keine exakte Kopie.</p>
    <label class="cvz-label">Sonstiger Kontext (optional)</label>
    <textarea class="cvz-input" id="cvz-in-existing" placeholder="Weitere Hinweise für den Assistenten">${cvzEsc(cvzState.existing_content)}</textarea>
  `;
}
function cvzSyncPillarGoalFields() {
  cvzState.conversion_target_value = document.getElementById('cvz-in-target-value').value.trim();
  // Eine Adresse mit http(s):// ist ein Link, alles andere eine Beschreibung.
  cvzState.conversion_target_kind = /^https?:\/\//i.test(cvzState.conversion_target_value) ? 'url' : 'text';
  cvzState.messy_middle_phase = document.getElementById('cvz-in-phase').value;
  cvzState.sender_name = document.getElementById('cvz-in-sender').value.trim();
  cvzState.cluster_text = document.getElementById('cvz-in-cluster').value;
}
// "Keyword" oder "Keyword | URL" pro Zeile -> [{ keyword, url? }]. Maximal 30
// (Grenze im Backend-Schema).
function cvzParseClusterText(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 30).map(line => {
    const [kw, url] = line.split('|').map(p => p.trim());
    return url ? { keyword: kw, url } : { keyword: kw };
  }).filter(p => p.keyword);
}
function cvzValidateStep() {
  const key = cvzCurrentStepKey();
  if (key === 'type') return null;
  if (key === 'p_topic') {
    cvzSyncStep0Fields();
    if (!cvzState.keyword) return 'Bitte ein Thema/Keyword eingeben.';
    if (!cvzState.target_audience) return 'Bitte eine Zielgruppe angeben.';
    return null;
  }
  if (key === 'p_goal') {
    cvzSyncPillarGoalFields();
    if (cvzState.conversion_target_value) {
      if (cvzState.conversion_target_kind === 'url') {
        try { new URL(cvzState.conversion_target_value); } catch { return `"${cvzState.conversion_target_value}" ist keine gültige Adresse. Prüfe den Link oder beschreibe den nächsten Schritt in Worten.`; }
      }
    }
    for (const p of cvzParseClusterText(cvzState.cluster_text)) {
      if (p.url) {
        try { new URL(p.url); } catch { return `Cluster-Zeile "${p.keyword}": "${p.url}" ist keine gültige URL.`; }
      }
    }
    return null;
  }
  if (key === 'p_context') {
    cvzSyncStep2Fields();
    if (cvzState.brand_color && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cvzState.brand_color)) {
      return `"${cvzState.brand_color}" ist kein gültiger Hex-Farbcode (z.B. #4f46e5) - oder das Feld leer lassen.`;
    }
    if (cvzState.brand_reference_url) {
      try { new URL(cvzState.brand_reference_url); } catch { return `"${cvzState.brand_reference_url}" ist keine gültige URL (mit https:// beginnen) - oder das Feld leer lassen.`; }
    }
    return null;
  }
  return cvzValidateLpStep(key);
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
// 21 Minuten: das serverseitige Sicherheitsnetz BACKGROUND_TURN_TIMEOUT_MS in
// pageAgent.ts liegt bei 20 Minuten. Eine Minute Puffer, damit das Frontend die
// Fehlermeldung des Servers noch abholt, statt selbst vorher aufzugeben.
const CVZ_POLL_MAX_MS = 21 * 60 * 1000;
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
  // Seit dem direkten Bau laufen Analyse UND erster Entwurf in einem Durchgang.
  { at: 8,   text: 'Hier wird die nächsten Minuten malocht. Hol dir in der Zeit gerne einen Kaffee' },
  { at: 30,  text: 'Keyword-Daten und Suchintent werden geprüft' },
  { at: 70,  text: 'Kaffee schon geholt? Wir wühlen noch in Wettbewerber-Seiten' },
  { at: 120, text: 'Suchintent, Journey-Phase und Ziel werden abgeglichen' },
  { at: 180, text: 'Die Landingpage wird aufgebaut' },
  { at: 260, text: 'Headlines, Belege und FAQ werden ausformuliert' },
  { at: 340, text: 'Headline-Varianten und Messplan entstehen' },
  { at: 420, text: 'Letzte Prüfung von Zahlen und Belegen' },
  { at: 540, text: 'Läuft noch: Bei umfangreichen Briefings kann das 8 bis 10 Minuten dauern' },
  { at: 700, text: 'Braucht in diesem Fall spürbar länger als sonst, bitte noch etwas Geduld' }
];
// Struktur-Turns sind erfahrungsgemäß deutlich kürzer (2-3 Minuten) als der
// Kickoff, deshalb eigene, engere Schwellen.
const CVZ_PILLAR_KICKOFF_MESSAGES = [
  { at: 8,   text: 'Thema wird recherchiert. Hol dir in der Zeit gerne einen Kaffee' },
  { at: 30,  text: 'Suchvolumen, People-Also-Ask und Top-Ergebnisse werden geprüft' },
  { at: 70,  text: 'Referenzquellen werden gelesen' },
  { at: 120, text: 'Das Gerüst der Pillar Page wird aufgebaut' },
  { at: 180, text: 'Fragen an den Experten werden formuliert' },
  { at: 250, text: 'Letzte Handgriffe am Gerüst' },
  { at: 420, text: 'Läuft noch - bei umfangreichen Themen kann das etwas länger dauern' }
];
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
// Beendet alles, was nur während der Wartezeit läuft: Ticker und Spiel.
function cvzStopLoadingExtras() {
  if (cvzLoadingStopTicker) { cvzLoadingStopTicker(); cvzLoadingStopTicker = null; }
  if (window.CVZGame) window.CVZGame.unmount();
}
// Hinweise, die nach einigen Minuten unter dem Spiel erscheinen: Die Wartezeit
// lässt sich nutzen, um genau das Material zu holen, nach dem die Platzhalter fragen.
const CVZ_GAME_PREP_HINTS = {
  landingpage: 'Während du wartest: Leg dir Kundenlogos, ein echtes Kundenzitat und belegbare Zahlen (z.B. Kundenanzahl, Zeitersparnis) bereit. Genau danach fragen die meisten Platzhalter auf der fertigen Seite.',
  pillar: 'Während du wartest: Überleg dir, wer im Unternehmen die Expertenfragen beantworten kann, zum Beispiel aus Vertrieb, Projektleitung oder Support. Die Fragen kannst du später als Liste exportieren und weitergeben.'
};
// Startet das Headline-Duell im Ladebildschirm, sofern cvz-game.js geladen ist.
// Fehlt die Datei (altes Embed), läuft alles wie bisher ohne Spiel.
function cvzMountLoadingGame() {
  if (!window.CVZGame || window.CVZGame.isMounted()) return;
  const loading = document.getElementById('cvz-loading');
  if (!loading) return;
  const set = cvzState.page_type === 'pillar' ? 'pillar' : 'landingpage';
  try {
    window.CVZGame.mount(loading, { set, rounds: 10, prepHint: { afterMs: 150000, text: CVZ_GAME_PREP_HINTS[set] } });
  } catch (e) {
    console.warn('Spiel konnte nicht gestartet werden:', e.message);
  }
}
function cvzShowLoading(text) {
  document.getElementById('cvz-form-card').style.display = 'none';
  document.getElementById('cvz-loading').style.display = 'block';
  if (cvzLoadingStopTicker) cvzLoadingStopTicker();
  const baseMessages = cvzState.page_type === 'pillar' ? CVZ_PILLAR_KICKOFF_MESSAGES : CVZ_KICKOFF_MESSAGES;
  // Die Stil-Übernahme läuft ganz am Anfang (ca. 5 bis 20 Sekunden), deshalb ein
  // eigener Hinweis zwischen der ersten und zweiten Meldung.
  const messages = cvzState.brand_reference_url
    ? [...baseMessages, { at: 16, text: 'Der Marken-Look eurer Website wird übernommen' }].sort((a, b) => a.at - b.at)
    : baseMessages;
  cvzLoadingStopTicker = cvzStartProgressTicker(text, messages, t => {
    document.getElementById('cvz-loading-text').textContent = t;
  });
  cvzMountLoadingGame();
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
// Briefing-Body je Seitentyp. Die Landingpage bleibt exakt wie bisher.
function cvzBuildBriefBody(userId, page_project_id, competitorUrls) {
  if (cvzState.page_type === 'pillar') {
    const body = {
      user_id: userId, page_project_id,
      keyword: cvzState.keyword,
      target_audience: cvzState.target_audience,
      existing_content: cvzBuildExistingContent() || null,
      brand_reference_url: cvzState.brand_reference_url || null,
      brand_color: cvzState.brand_color || null,
      customer_reasons: cvzState.no_customer_reasons ? 'Keine Informationen vorhanden' : (cvzState.customer_reasons || null),
      type_brief: {}
    };
    // Optionale Felder nur senden, wenn sie gefüllt sind: das Backend-Schema
    // lehnt leere Strings bei conversion_target.value ab.
    if (cvzState.messy_middle_phase) body.type_brief.messy_middle_phase = cvzState.messy_middle_phase;
    if (cvzState.sender_name) body.type_brief.sender_name = cvzState.sender_name;
    if (cvzState.conversion_target_value) {
      body.type_brief.conversion_target = { kind: cvzState.conversion_target_kind, value: cvzState.conversion_target_value };
    }
    const pages = cvzParseClusterText(cvzState.cluster_text);
    if (pages.length > 0) body.type_brief.cluster_context = { source: cvzState.strategy && cvzState.strategy.pillar_index !== null ? 'strategie' : 'manuell', supporting_pages: pages };
    return body;
  }
  return {
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
      };
}
async function cvzLaunch() {
  const headers = cvzAuthHeaders();
  const userId = cvzUserId();
  // Pillar Pages haben keinen Wettbewerber-Schritt: der Agent nimmt die
  // organischen Top-Treffer der Suche selbst.
  const competitorUrls = cvzState.page_type === 'pillar' ? [] : [
    ...cvzState.competitorSuggestions.filter(s => s.selected).map(s => s.url),
    ...cvzState.manualCompetitors
  ].slice(0, CVZ_MAX_COMPETITORS);
  try {
    cvzShowLoading('Projekt wird angelegt …');
    const projectRes = await fetch(`${API_BASE}/api/page-agent/project`, {
      method: 'POST', headers,
      body: JSON.stringify({ user_id: userId, name: cvzState.keyword, page_type: cvzState.page_type })
    });
    if (!projectRes.ok) throw new Error((await projectRes.json()).error || 'Projekt konnte nicht angelegt werden');
    const { page_project_id } = await projectRes.json();
    cvzShowLoading('Briefing wird gespeichert …');
    const briefRes = await fetch(`${API_BASE}/api/page-agent/brief`, {
      method: 'POST', headers,
      body: JSON.stringify(cvzBuildBriefBody(userId, page_project_id, competitorUrls))
    });
    if (!briefRes.ok) {
      const err = await briefRes.json();
      throw new Error(err.error + (err.missing_fields ? ` (${err.missing_fields.join(', ')})` : ''));
    }
    cvzShowLoading(cvzState.page_type === 'pillar' ? 'Thema wird recherchiert …' : 'Hier wird die nächsten Minuten malocht. Hol dir in der Zeit gerne einen Kaffee …');
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
    cvzStopLoadingExtras();
    document.getElementById('cvz-loading').style.display = 'none';
    document.getElementById('cvz-form-card').style.display = 'block';
    cvzShowError(err.message);
  }
}
// ==================== SESSION-WIEDERAUFNAHME ====================
// Startet eine abgebrochene Analyse neu (z.B. nach einem Server-Neustart
// mitten im Kickoff). Das Backend erkennt die Session ohne Antwort und
// startet die Analyse, ohne erneut abzubuchen. Läuft sie noch, bekommen wir
// denselben Turn zurück und warten einfach weiter.
// Liefert true, wenn der Chat geöffnet wurde.
async function cvzRecoverKickoff(pageProjectId) {
  try {
    cvzShowLoading(cvzState.page_type === 'pillar'
      ? 'Die Recherche wurde unterbrochen und startet neu …'
      : 'Die Analyse wurde unterbrochen und startet neu …');
    const res = await fetch(`${API_BASE}/api/page-agent/start-session`, {
      method: 'POST', headers: cvzAuthHeaders(),
      body: JSON.stringify({ user_id: cvzUserId(), page_project_id: pageProjectId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.turn_id) throw new Error(data.error || `HTTP ${res.status}`);
    cvzState.session_id = data.session_id || cvzState.session_id;
    const finalData = await cvzPollTurnStatus(data.turn_id);
    cvzOpenChat(finalData);
    return true;
  } catch (e) {
    console.error('Neustart der Analyse fehlgeschlagen:', e.message);
    cvzStopLoadingExtras();
    return false;
  }
}
async function cvzTryResume() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('new')) {
    // ?new=1 bleibt bewusst in der URL stehen, solange noch KEIN echtes
    // Projekt existiert (cvzState.page_project_id wird erst in cvzLaunch()
    // gesetzt). Sonst lädt ein Reload während des Ausfüllens fälschlich das
    // letzte fertige Projekt.
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
    cvzState.page_type = data.page_type === 'pillar' ? 'pillar' : 'landingpage';
    // NEU: Session ohne eine einzige Antwort des Assistenten bedeutet, dass
    // die Analyse abgebrochen ist (Server-Neustart, Deploy) oder noch läuft.
    // Statt eines leeren Chats wird sie neu gestartet bzw. weiter abgewartet.
    const hasAnswer = (data.messages || []).some(m => m.role === 'assistant');
    let recoveryFailed = false;
    if (!hasAnswer && data.page_project_id) {
      if (await cvzRecoverKickoff(data.page_project_id)) return true;
      recoveryFailed = true;
    }
    document.getElementById('cvz-form-app').style.display = 'none';
    document.getElementById('cvz-workspace').style.display = 'flex';
    cvzUpdateQuota(data.sessions_remaining, data.sessions_limit);
    cvzApplyPageTypeUi();
    cvzApplyPillarData(data);
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
    if (recoveryFailed) {
      lastBubble = cvzAppendMessage('assistant', 'Die Analyse wurde unterbrochen und konnte nicht automatisch neu gestartet werden. Bitte lade die Seite in ein paar Minuten neu. Deine Session wurde dafür nicht erneut abgebucht.', null, null, { scroll: 'none' });
    }
    if (data.structure_html_document) {
      cvzUpdatePreviewPanel(data.structure_html_document, data.structure_version);
    }
    if (window.CVZLandingpageExport) window.CVZLandingpageExport.apply(data, { keyword: cvzState.keyword, isPillar: cvzState.page_type === 'pillar' });
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
  cvzStopLoadingExtras();
  document.getElementById('cvz-form-app').style.display = 'none';
  document.getElementById('cvz-workspace').style.display = 'flex';
  cvzUpdateQuota(sessionData.sessions_remaining, sessionData.sessions_limit);
  cvzApplyPageTypeUi();
  cvzApplyPillarData(sessionData);
  if (window.CVZLandingpageExport) window.CVZLandingpageExport.apply(sessionData, { keyword: cvzState.keyword, isPillar: cvzState.page_type === 'pillar' });
  // Nur die Antwort des Assistenten wird gerendert - der Kickoff-Prompt
  // entsteht serverseitig und taucht hier ohnehin nicht auf. Bei Pillar
  // kommt das Gerüst schon mit dem Kickoff, dann wird auch die Vorschau
  // befüllt. Bei der Landingpage fehlt die Struktur hier, das Verhalten
  // bleibt wie bisher.
  cvzAppendMessage('assistant', sessionData.message, sessionData.structure_html_document, sessionData.structure_version);
}
function cvzUpdateQuota(remaining, limit) {
  document.getElementById('cvz-quota').textContent = `${remaining}/${limit} Sessions übrig`;
}
function cvzStripPreviewLinks(htmlDocument) {
  try {
    const doc = new DOMParser().parseFromString(htmlDocument, 'text/html');
    doc.querySelectorAll('a[href]').forEach(a => {
      a.removeAttribute('href');
      a.removeAttribute('target');
      a.removeAttribute('rel');
    });
    doc.querySelectorAll('base').forEach(b => b.remove());
    return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  } catch (e) {
    console.warn('Links in der Vorschau konnten nicht entfernt werden:', e.message);
    return htmlDocument;
  }
}
function cvzRenderStructureIframe(container, htmlDocument, onLoaded) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.setAttribute('title', 'Landingpage-Vorschau');
  iframe.srcdoc = cvzStripPreviewLinks(htmlDocument);
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
  // Pillar: PDF-Export ist noch nicht für diesen Typ gebaut (siehe cvzApplyPageTypeUi).
  document.getElementById('cvz-export-landingpage-pdf').disabled = cvzState.page_type === 'pillar';
}
function cvzDownloadCurrentStructure() {
  if (!cvzLatestStructureHtml) return;
  let downloadHtml = cvzLatestStructureHtml;
  try {
    const dl = new DOMParser().parseFromString(cvzLatestStructureHtml, 'text/html');
    dl.querySelectorAll('[data-cvz-preview-only]').forEach(el => el.remove());
    downloadHtml = '<!DOCTYPE html>' + dl.documentElement.outerHTML;
  } catch (e) { console.warn('Vorschau-Hinweise konnten nicht entfernt werden:', e.message); }
  const blob = new Blob([downloadHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (cvzPageTypeInfo() && cvzPageTypeInfo().download_base_name ? cvzPageTypeInfo().download_base_name : 'landingpage') + '.html';
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
    cvzLabelTablesForCards(bubble);
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
async function cvzSendMessage(presetMessage) {
  if (cvzIsSending) return;
  const input = document.getElementById('cvz-chat-input');
  const message = (typeof presetMessage === 'string' ? presetMessage : input.value).trim();
  if (!message) return;
  cvzIsSending = true;
  if (typeof presetMessage !== 'string') input.value = '';
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
    cvzApplyPillarData(finalData);
    if (window.CVZLandingpageExport) window.CVZLandingpageExport.apply(finalData, { keyword: cvzState.keyword, isPillar: cvzState.page_type === 'pillar' });
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
// ==================== PILLAR PAGE: WORKSPACE (STATUS, INTERVIEW) ====================
// Die Pillar Page kommt als Gerüst mit Platzhaltern. Was nur ein Experte
// wissen kann, steht als Interview-Frage im zweiten Tab der Vorschau. Jede
// gespeicherte Antwort rendert die Vorschau serverseitig neu (POST
// /interview/answer liefert structure_html_document gleich mit). Die Texte
// auf der Seite selbst ändert aber erst ein neuer Chat-Turn: bis dahin zeigt
// der Status "noch nicht eingearbeitet" (stalePlaceholders).
let cvzInterview = { items: [], status: null, clusters: [] };
// Ungespeicherte Eingaben bleiben erhalten, wenn der Tab neu gerendert wird
// (z.B. weil ein Chat-Turn neue Fragen liefert).
const cvzInterviewDrafts = {};
let cvzPreviewTab = 'preview';
const CVZ_KIND_LABELS = { zahl: 'Zahl', fall: 'Fall', position: 'Position' };
const CVZ_CLUSTER_FORMAT_LABELS = { blog_artikel: 'Blogartikel', ratgeber: 'Ratgeber', vergleich: 'Vergleich', checkliste: 'Checkliste', glossar: 'Glossar', fallstudie: 'Fallstudie', landingpage: 'Landingpage' };
const CVZ_CLUSTER_INTENT_LABELS = { informational: 'Information', commercial: 'Vergleich/Kauf', transactional: 'Anfrage' };

// Titel, Download und PDF-Button je Seitentyp. Für die Landingpage bleibt
// alles beim Alten.
function cvzApplyPageTypeUi() {
  const isPillar = cvzState.page_type === 'pillar';
  const info = cvzPageTypeInfo();
  const title = document.getElementById('cvz-toolbar-title') || document.querySelector('.cvz-toolbar-title');
  if (title) title.textContent = isPillar ? 'Pillar-Page-Assistent' : 'Landingpage-Assistent';
  const prevTitle = document.querySelector('#cvz-preview-panel .cvz-preview-header .title');
  if (prevTitle) prevTitle.textContent = (info && info.preview_title) ? info.preview_title.replace(/-Vorschau$/, '') + ' Vorschau' : 'Vorschau';
  const pdf = document.getElementById('cvz-export-landingpage-pdf');
  if (pdf) pdf.hidden = isPillar;
  const empty = document.getElementById('cvz-preview-empty');
  if (empty && isPillar) empty.textContent = 'Sobald das Gerüst erstellt ist, erscheint hier die Vorschau.';
  if (isPillar) cvzEnsurePillarUi();
}

// Legt Statusleiste, Tabs und Interview-Fläche im Vorschau-Panel an. Per JS
// statt im Embed, damit die Landingpage-Ansicht ohne Pillar unverändert bleibt.
function cvzEnsurePillarUi() {
  const panel = document.getElementById('cvz-preview-panel');
  if (!panel || document.getElementById('cvz-pillar-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'cvz-pillar-bar';
  bar.className = 'cvz-pillar-bar';
  bar.innerHTML = `
    <div class="cvz-pillar-status" id="cvz-pillar-status"></div>
    <div class="cvz-pillar-tabs" role="tablist">
      <button type="button" class="cvz-pillar-tab active" id="cvz-tab-preview" role="tab" onclick="cvzSetPreviewTab('preview')">Vorschau</button>
      <button type="button" class="cvz-pillar-tab" id="cvz-tab-interview" role="tab" onclick="cvzSetPreviewTab('interview')">Interview</button>
    </div>`;
  const header = panel.querySelector('.cvz-preview-header');
  header.insertAdjacentElement('afterend', bar);
  const body = document.createElement('div');
  body.id = 'cvz-interview-body';
  body.className = 'cvz-interview-body';
  body.hidden = true;
  document.getElementById('cvz-preview-body').insertAdjacentElement('afterend', body);
}

function cvzSetPreviewTab(tab) {
  cvzPreviewTab = tab === 'interview' ? 'interview' : 'preview';
  const showInterview = cvzPreviewTab === 'interview';
  const pv = document.getElementById('cvz-preview-body');
  const iv = document.getElementById('cvz-interview-body');
  if (pv) pv.hidden = showInterview;
  if (iv) iv.hidden = !showInterview;
  const t1 = document.getElementById('cvz-tab-preview');
  const t2 = document.getElementById('cvz-tab-interview');
  if (t1) t1.classList.toggle('active', !showInterview);
  if (t2) t2.classList.toggle('active', showInterview);
  // Ein versteckter Rahmen hat Breite 0; die Skalierung muss beim Zurückwechseln neu berechnet werden.
  if (!showInterview) cvzApplyPreviewScale();
}

// Nimmt Pillar-Felder aus /resume, /start-session-Ergebnis, /chat/status
// oder /interview entgegen. Für die Landingpage tut die Funktion nichts.
function cvzApplyPillarData(data) {
  if (cvzState.page_type !== 'pillar' || !data) return;
  cvzEnsurePillarUi();
  if (Array.isArray(data.interview_items)) cvzInterview.items = data.interview_items;
  if (data.pillar_status) cvzInterview.status = data.pillar_status;
  if (Array.isArray(data.cluster_suggestions)) cvzInterview.clusters = data.cluster_suggestions;
  cvzRenderPillarStatus();
  cvzRenderInterview();
}

function cvzRenderPillarStatus() {
  const el = document.getElementById('cvz-pillar-status');
  const tab = document.getElementById('cvz-tab-interview');
  const st = cvzInterview.status;
  if (!el) return;
  if (!st) { el.textContent = ''; return; }
  const declined = st.mandatoryDeclined || 0;
  const open = Math.max(0, st.mandatoryTotal - st.mandatoryAnswered - declined);
  if (tab) tab.textContent = open > 0 ? `Interview (${open} offen)` : 'Interview';
  const isDone = st.status === 'fertig';
  const label = isDone ? 'Fertig' : 'Gerüst';
  let html = `<span class="cvz-pillar-badge ${isDone ? 'done' : ''}">${label}</span> ` +
    `<span>${st.mandatoryAnswered} von ${st.mandatoryTotal} Pflichtfragen beantwortet${declined > 0 ? `, ${declined} ohne Antwort` : ''}</span>`;
  if (!isDone && st.reason) html += `<span class="cvz-pillar-reason">${cvzEsc(st.reason)}</span>`;
  if (st.stalePlaceholders > 0) {
    html += `<button type="button" class="cvz-btn-secondary cvz-pillar-apply" onclick="cvzApplyInterviewToPage()">Antworten in die Seite einarbeiten</button>`;
  }
  el.innerHTML = html;
}

// Die Antworten stehen in der Datenbank, die Seite muss der Agent neu
// schreiben. Dafür schicken wir ihm eine normale Chat-Nachricht.
function cvzApplyInterviewToPage() {
  cvzSetPreviewTab('preview');
  cvzSendMessage('Ich habe Interview-Antworten ergänzt oder Fragen als "Keine Antwort möglich" markiert. Bitte arbeite beides ein und erzeuge eine neue Version. Beantwortete Fragen ersetzen die Platzhalter. Bei Fragen ohne Antwort ersetzt du die Sektion durch allgemeine Informationen oder entfernst sie.');
}

function cvzRememberInterviewDraft(id) {
  const t = document.getElementById('cvz-iv-text-' + id);
  const p = document.getElementById('cvz-iv-prov-' + id);
  const a = document.getElementById('cvz-iv-appr-' + id);
  if (!t) return;
  cvzInterviewDrafts[id] = { text: t.value, provenance: p ? p.value : '', approved: a ? a.checked : true };
}

function cvzRenderInterview() {
  const el = document.getElementById('cvz-interview-body');
  if (!el) return;
  // Offene Eingaben sichern, bevor das DOM ersetzt wird.
  cvzInterview.items.forEach(i => { if (document.getElementById('cvz-iv-text-' + i.id)) cvzRememberInterviewDraft(i.id); });
  const clusterHtml = cvzRenderClusterSuggestions();
  if (cvzInterview.items.length === 0) {
    el.innerHTML = '<p class="cvz-hint">Noch keine Fragen. Sie erscheinen, sobald das Gerüst steht.</p>' + clusterHtml;
    return;
  }
  const intro = '<p class="cvz-hint">Beantworte, was du aus eigener Erfahrung belegen kannst. Leere Antworten bleiben Platzhalter, es wird nichts erfunden. Zahlen sind willkommen, eine Quelle musst du nicht nennen. Kannst du eine Frage nicht beantworten, wähle „Keine Antwort möglich“. Die Seite kommt dann ohne diese Aussage aus oder enthält allgemeine Informationen.</p>';
  const items = cvzInterview.items.map(i => {
    const d = cvzInterviewDrafts[i.id];
    const text = d ? d.text : (i.answer_text || '');
    const prov = d ? d.provenance : (i.answer_provenance || '');
    const approved = d ? d.approved : (i.approved_for_publication !== false);
    const answered = !!(i.answer_text && i.answer_text.trim().length >= 20);
    if (i.declined && !answered) {
      return `
    <div class="cvz-iv-item declined" id="cvz-iv-${cvzEsc(i.id)}">
      <div class="cvz-iv-head">
        ${i.mandatory ? '<span class="cvz-iv-badge must">Pflicht</span>' : '<span class="cvz-iv-badge">Optional</span>'}
        <span class="cvz-iv-badge">${cvzEsc(CVZ_KIND_LABELS[i.kind] || i.kind)}</span>
        <span class="cvz-iv-badge">Keine Antwort möglich</span>
      </div>
      <div class="cvz-iv-question">${cvzEsc(i.question)}</div>
      <div class="cvz-iv-why">Die Seite wird ohne diese Aussage erstellt oder mit allgemeinen Informationen.</div>
      <div class="cvz-iv-actions">
        <button type="button" class="cvz-btn-secondary" id="cvz-iv-undo-${cvzEsc(i.id)}" onclick="cvzDeclineInterviewItem('${cvzEsc(i.id)}', false)">Doch beantworten</button>
        <span class="cvz-iv-msg" id="cvz-iv-msg-${cvzEsc(i.id)}" role="status"></span>
      </div>
    </div>`;
    }
    return `
    <div class="cvz-iv-item ${answered ? 'answered' : ''}" id="cvz-iv-${cvzEsc(i.id)}">
      <div class="cvz-iv-head">
        ${i.mandatory ? '<span class="cvz-iv-badge must">Pflicht</span>' : '<span class="cvz-iv-badge">Optional</span>'}
        <span class="cvz-iv-badge">${cvzEsc(CVZ_KIND_LABELS[i.kind] || i.kind)}</span>
        ${answered ? '<span class="cvz-iv-badge ok">Beantwortet</span>' : ''}
      </div>
      <div class="cvz-iv-question">${cvzEsc(i.question)}</div>
      ${i.why_asked ? `<div class="cvz-iv-why">${cvzEsc(i.why_asked)}</div>` : ''}
      ${i.weak_answer_example ? `<details class="cvz-iv-weak"><summary>Was keine gute Antwort ist</summary><p>${cvzEsc(i.weak_answer_example)}</p></details>` : ''}
      <textarea class="cvz-input" id="cvz-iv-text-${cvzEsc(i.id)}" rows="4" placeholder="Deine Antwort mit konkreten Details" oninput="cvzRememberInterviewDraft('${cvzEsc(i.id)}')">${cvzEsc(text)}</textarea>
      <input class="cvz-input" id="cvz-iv-prov-${cvzEsc(i.id)}" placeholder="Quelle oder Kontext (optional, z.B. eigene Projekte, Zeitraum)" value="${cvzEsc(prov)}" oninput="cvzRememberInterviewDraft('${cvzEsc(i.id)}')">
      <label class="cvz-iv-appr"><input type="checkbox" id="cvz-iv-appr-${cvzEsc(i.id)}" ${approved ? 'checked' : ''} onchange="cvzRememberInterviewDraft('${cvzEsc(i.id)}')"> Zur Veröffentlichung freigegeben</label>
      <div class="cvz-iv-actions">
        <button type="button" class="cvz-btn-secondary" id="cvz-iv-save-${cvzEsc(i.id)}" onclick="cvzSaveInterviewAnswer('${cvzEsc(i.id)}')">Speichern</button>
        <button type="button" class="cvz-btn-secondary cvz-iv-decline" id="cvz-iv-decline-${cvzEsc(i.id)}" onclick="cvzDeclineInterviewItem('${cvzEsc(i.id)}', true)">Keine Antwort möglich</button>
        <span class="cvz-iv-msg" id="cvz-iv-msg-${cvzEsc(i.id)}" role="status"></span>
      </div>
    </div>`;
  }).join('');
  const toolbar = '<div class="cvz-iv-toolbar"><button type="button" class="cvz-btn-secondary" id="cvz-iv-pdf" onclick="cvzExportInterviewPdf(this)">Offene Fragen als PDF (für den Fachbereich)</button><span class="cvz-iv-msg" id="cvz-iv-pdf-msg" role="status" hidden></span></div>';
  el.innerHTML = toolbar + intro + items + clusterHtml;
  // Aufgaben-Export (ClickUp, Asana, Jira): Menü in die Toolbar des Interviews hängen.
  if (window.CVZPillarExport) window.CVZPillarExport.mount(el.querySelector('.cvz-iv-toolbar'), { items: cvzInterview.items, clusters: cvzInterview.clusters, keyword: cvzState.keyword });
}

// Ergebnis der Cluster-Recherche: Unterseiten und Beiträge, die sich zum Thema
// lohnen. Reine Empfehlung. Verlinkt wird erst, wenn die Seiten existieren und
// im Brief als Cluster eingetragen sind.
function cvzRenderClusterSuggestions() {
  const list = Array.isArray(cvzInterview.clusters) ? cvzInterview.clusters : [];
  if (list.length === 0) return '';
  const order = { hoch: 0, mittel: 1, niedrig: 2 };
  const sorted = list.slice().sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
  const rows = sorted.map(c => `
    <div class="cvz-cl-item">
      <div class="cvz-iv-head">
        <span class="cvz-iv-badge ${c.priority === 'hoch' ? 'ok' : ''}">Priorität ${cvzEsc(c.priority)}</span>
        <span class="cvz-iv-badge">${cvzEsc(CVZ_CLUSTER_FORMAT_LABELS[c.format] || c.format)}</span>
        <span class="cvz-iv-badge">${cvzEsc(CVZ_CLUSTER_INTENT_LABELS[c.intent] || c.intent)}</span>
        ${typeof c.search_volume === 'number' ? `<span class="cvz-iv-badge">${c.search_volume.toLocaleString('de-DE')} Suchen/Monat</span>` : ''}
      </div>
      <div class="cvz-iv-question">${cvzEsc(c.working_title)}</div>
      <div class="cvz-iv-why">Keyword: ${cvzEsc(c.keyword)}. ${cvzEsc(c.why_worth)}</div>
    </div>`).join('');
  return `<div class="cvz-cl-wrap"><h4 class="cvz-cl-title">Empfohlene Unterseiten und Beiträge</h4>
    <p class="cvz-hint">Diese Themen fehlen noch im Cluster und lohnen sich laut Recherche. Die Pillar Page verlinkt erst darauf, wenn die Seiten existieren und du sie im Brief als Cluster einträgst.</p>${rows}</div>`;
}

// "Keine Antwort möglich" setzen oder zurücknehmen. Eine vorhandene Antwort wird dabei gelöscht.
async function cvzDeclineInterviewItem(id, declined) {
  const msg = document.getElementById('cvz-iv-msg-' + id);
  const setMsg = (text, bad) => { if (msg) { msg.textContent = text; msg.classList.toggle('bad', !!bad); } };
  if (declined) {
    const hasText = !!(document.getElementById('cvz-iv-text-' + id) || {}).value;
    if (hasText && !window.confirm('Die eingegebene Antwort wird dabei verworfen. Fortfahren?')) return;
  }
  setMsg('Wird gespeichert …', false);
  try {
    const res = await fetch(`${API_BASE}/api/page-agent/interview/answer`, {
      method: 'POST', headers: cvzAuthHeaders(),
      body: JSON.stringify({ user_id: cvzUserId(), page_project_id: cvzState.page_project_id, item_key: id, text: '', declined: !!declined, answered_by: 'user' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(data.error || `Fehler (HTTP ${res.status})`, true); return; }
    delete cvzInterviewDrafts[id];
    cvzInterview.items = data.interview_items || cvzInterview.items;
    cvzInterview.status = data.pillar_status || cvzInterview.status;
    if (Array.isArray(data.cluster_suggestions)) cvzInterview.clusters = data.cluster_suggestions;
    if (data.structure_html_document) cvzUpdatePreviewPanel(data.structure_html_document, data.structure_version);
    cvzRenderPillarStatus();
    cvzRenderInterview();
  } catch (e) {
    console.error('Absage konnte nicht gespeichert werden:', e);
    setMsg('Speichern fehlgeschlagen. Bitte erneut versuchen.', true);
  }
}

async function cvzSaveInterviewAnswer(id) {
  cvzRememberInterviewDraft(id);
  const d = cvzInterviewDrafts[id];
  const msg = document.getElementById('cvz-iv-msg-' + id);
  const btn = document.getElementById('cvz-iv-save-' + id);
  const setMsg = (text, bad) => { if (msg) { msg.textContent = text; msg.classList.toggle('bad', !!bad); } };
  if (!d) return;
  if (btn) btn.disabled = true;
  setMsg('Wird gespeichert …', false);
  try {
    const res = await fetch(`${API_BASE}/api/page-agent/interview/answer`, {
      method: 'POST', headers: cvzAuthHeaders(),
      body: JSON.stringify({
        user_id: cvzUserId(),
        page_project_id: cvzState.page_project_id,
        item_key: id,
        text: d.text,
        provenance: d.provenance || null,
        approved_for_publication: d.approved,
        answered_by: 'user'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || `Fehler (HTTP ${res.status})`, true);
      return;
    }
    delete cvzInterviewDrafts[id];
    cvzInterview.items = data.interview_items || cvzInterview.items;
    cvzInterview.status = data.pillar_status || cvzInterview.status;
    if (Array.isArray(data.cluster_suggestions)) cvzInterview.clusters = data.cluster_suggestions;
    if (data.structure_html_document) cvzUpdatePreviewPanel(data.structure_html_document, data.structure_version);
    cvzRenderPillarStatus();
    cvzRenderInterview();
    const msg2 = document.getElementById('cvz-iv-msg-' + id);
    if (msg2) msg2.textContent = 'Gespeichert';
  } catch (e) {
    console.error('Interview-Antwort konnte nicht gespeichert werden:', e);
    setMsg('Speichern fehlgeschlagen. Bitte erneut versuchen.', true);
  } finally {
    const b2 = document.getElementById('cvz-iv-save-' + id);
    if (b2) b2.disabled = false;
  }
}


// ---------- Fragenliste als PDF ----------
// Offene Fragen als PDF für den Fachbereich. Erstellt der Server (Puppeteer, gleiche Route und
// gleiches Layout wie die anderen Exporte, type "interview"). Es erscheinen nur Fragetexte.
function cvzExportInterviewPdf(btn) {
  const err = document.getElementById('cvz-iv-pdf-msg');
  return cvzExportPdf({
    buttonEl: btn,
    errorEl: err,
    type: 'interview',
    downloadName: `convertlyze-fragen-fachbereich-${Date.now()}.pdf`,
  });
}

// ==================== PILLAR PAGE: INFOS AUS DER CONTENT-STRATEGIE ÜBERNEHMEN ====================
// Die Content-Strategie liefert pro Cluster Pillar Pages mit Keyword, Zielgruppe,
// Phase im Entscheidungsweg, Briefing-Stichpunkten und den zugehörigen
// Unterseiten. Hier wählt der User eine fertige Strategie und darin eine
// Pillar Page; das Formular wird vorbefüllt. Alle Felder bleiben änderbar.
// Es gibt keine Pflicht: wer keine Strategie hat, füllt das Formular wie bisher.
//
// Datenquellen (gleiches Backend, gleiche Anmeldung):
//   GET /api/content-strategy/sessions   -> Liste (nur status 'done' ist brauchbar)
//   GET /api/content-strategy/:id        -> Session inkl. result (ContentClusterResult)
let cvzStrategySessions = null;          // null = noch nicht geladen, [] = geladen/leer
let cvzStrategyLoadError = '';
const cvzStrategyResults = {};           // session_id -> result
let cvzStrategyBusy = false;

async function cvzLoadStrategySessions() {
  if (cvzStrategySessions !== null) return;
  try {
    const res = await fetch(`${API_BASE}/api/content-strategy/sessions`, { headers: cvzAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cvzStrategySessions = (data.sessions || []).filter(s => s.status === 'done');
    cvzStrategyLoadError = '';
  } catch (e) {
    console.error('Strategien konnten nicht geladen werden:', e.message);
    // Kein harter Fehler: das Formular funktioniert auch ohne Strategie.
    cvzStrategySessions = [];
    cvzStrategyLoadError = 'Strategien konnten nicht geladen werden. Du kannst das Formular trotzdem manuell ausfüllen.';
  }
}

async function cvzLoadStrategyResult(sessionId) {
  if (cvzStrategyResults[sessionId]) return cvzStrategyResults[sessionId];
  const res = await fetch(`${API_BASE}/api/content-strategy/${encodeURIComponent(sessionId)}`, { headers: cvzAuthHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !data.result || !Array.isArray(data.result.supporting_pages)) throw new Error('Strategie enthält noch kein Ergebnis');
  cvzStrategyResults[sessionId] = data.result;
  return data.result;
}

function cvzStrategyPillarPages(result) {
  return (result.supporting_pages || [])
    .map((p, index) => ({ p, index }))
    .filter(x => x.p.page_type === 'pillar_page');
}

function cvzFormatStrategyDate(iso) {
  try { return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return ''; }
}

// Zeichnet die Auswahl. Wird beim Rendern des Themen-Schritts und nach jeder
// Auswahländerung aufgerufen. Die Felder des Formulars selbst fasst die
// Funktion nicht an, sie liegen außerhalb von #cvz-strategy-box.
async function cvzRenderStrategyBox() {
  const box = document.getElementById('cvz-strategy-box');
  if (!box) return;
  box.innerHTML = '<p class="cvz-hint">Strategien werden geladen …</p>';
  await cvzLoadStrategySessions();
  const box2 = document.getElementById('cvz-strategy-box');
  if (!box2) return; // Schritt wurde inzwischen gewechselt
  if (cvzStrategySessions.length === 0) {
    box2.innerHTML = cvzStrategyLoadError ? `<p class="cvz-hint">${cvzEsc(cvzStrategyLoadError)}</p>` : '';
    return;
  }
  const st = cvzState.strategy;
  const sessionOptions = cvzStrategySessions.map(s => `
    <option value="${cvzEsc(s.id)}" ${st && st.session_id === s.id ? 'selected' : ''}>${cvzEsc(s.seed_topic)}${s.domain ? ' · ' + cvzEsc(s.domain) : ''} · ${cvzEsc(cvzFormatStrategyDate(s.updated_at || s.created_at))}</option>
  `).join('');
  let pillarHtml = '';
  if (st && cvzStrategyResults[st.session_id]) {
    const pillars = cvzStrategyPillarPages(cvzStrategyResults[st.session_id]);
    if (pillars.length === 0) {
      pillarHtml = '<p class="cvz-hint">Diese Strategie enthält keine Pillar Page. Wähle eine andere oder fülle das Formular manuell aus.</p>';
    } else {
      pillarHtml = `
        <label class="cvz-label">Pillar Page aus der Strategie</label>
        <div class="cvz-select-wrap">
          <select class="cvz-input" id="cvz-in-strategy-pillar" onchange="cvzOnStrategyPillarChange(this.value)">
            <option value="" ${st.pillar_index === null ? 'selected' : ''} disabled>Pillar Page auswählen …</option>
            ${pillars.map(x => `<option value="${x.index}" ${st.pillar_index === x.index ? 'selected' : ''}>${cvzEsc(x.p.topic)} (${cvzEsc(x.p.keyword)})</option>`).join('')}
          </select>
        </div>`;
    }
  }
  const applied = st && st.pillar_index !== null
    ? `<p class="cvz-strategy-applied">Übernommen aus „${cvzEsc(st.label)}“: Thema, Zielgruppe, Phase, Abschluss-Ziel, ${st.child_count} Unterseite${st.child_count === 1 ? '' : 'n'} und das Briefing der Strategie. Alles bleibt änderbar.</p>`
    : '';
  box2.innerHTML = `
    <div class="cvz-strategy-card">
      <label class="cvz-label" style="margin-top:0;">Aus deiner Content-Strategie übernehmen (optional)</label>
      <div class="cvz-select-wrap">
        <select class="cvz-input" id="cvz-in-strategy-session" onchange="cvzOnStrategySessionChange(this.value)" ${cvzStrategyBusy ? 'disabled' : ''}>
          <option value="" ${!st ? 'selected' : ''}>Keine Strategie verwenden</option>
          ${sessionOptions}
        </select>
      </div>
      ${cvzStrategyBusy ? '<p class="cvz-hint">Strategie wird geladen …</p>' : ''}
      <p class="cvz-strategy-error" id="cvz-strategy-error" hidden></p>
      ${pillarHtml}
      ${applied}
    </div>`;
}

function cvzShowStrategyError(msg) {
  const el = document.getElementById('cvz-strategy-error');
  if (!el) return;
  el.textContent = msg || '';
  el.hidden = !msg;
}

async function cvzOnStrategySessionChange(sessionId) {
  if (!sessionId) { cvzClearStrategy(); return; }
  const meta = cvzStrategySessions.find(s => s.id === sessionId);
  cvzState.strategy = { session_id: sessionId, pillar_index: null, label: meta ? meta.seed_topic : 'Strategie', child_count: 0 };
  cvzState.strategy_context = '';
  cvzStrategyBusy = true;
  await cvzRenderStrategyBox();
  try {
    const result = await cvzLoadStrategyResult(sessionId);
    cvzStrategyBusy = false;
    const pillars = cvzStrategyPillarPages(result);
    await cvzRenderStrategyBox();
    // Genau eine Pillar Page: direkt übernehmen, spart einen Klick.
    if (pillars.length === 1) cvzOnStrategyPillarChange(String(pillars[0].index));
  } catch (e) {
    console.error('Strategie konnte nicht geladen werden:', e.message);
    cvzStrategyBusy = false;
    cvzState.strategy = null;
    await cvzRenderStrategyBox();
    cvzShowStrategyError('Diese Strategie konnte nicht geladen werden. Du kannst das Formular manuell ausfüllen.');
  }
}

function cvzClearStrategy() {
  // Bereits übernommene Feldwerte bleiben stehen: sie gehören jetzt dem User.
  cvzState.strategy = null;
  cvzState.strategy_context = '';
  cvzRenderStrategyBox();
}

// Überträgt eine Pillar Page der Strategie in den Formular-State.
// Reine Funktion ohne DOM, damit sie einzeln prüfbar ist.
function cvzMapStrategyPillar(result, pillarIndex) {
  const pillar = result.supporting_pages[pillarIndex];
  const children = (result.supporting_pages || []).filter((p, i) => i !== pillarIndex && p.parent_index === pillarIndex);
  const conv = result.conversion_page || null;
  // Verlinkt wird nur, was es schon gibt (mit URL). Geplante Unterseiten ohne Seite gehen
  // als Kontext an den Assistenten und kommen als Empfehlung zurück.
  const isLive = c => !!(c.existing_coverage && c.existing_coverage.url);
  const clusterLines = children.filter(isLive).slice(0, 30).map(c => `${c.keyword} | ${c.existing_coverage.url}`);
  const planned = children.filter(c => !isLive(c));
  const ctx = [];
  ctx.push(`Dieses Briefing stammt aus der Content-Strategie "${result.seed_topic}".`);
  if (pillar.reasoning) ctx.push(`Warum diese Seite: ${pillar.reasoning}`);
  if (Array.isArray(pillar.content_brief) && pillar.content_brief.length > 0) {
    ctx.push('Inhaltliche Stichpunkte aus der Strategie:\n' + pillar.content_brief.map(b => `- ${b}`).join('\n'));
  }
  if (pillar.intent_separation && pillar.intent_separation.cannibalization_guard) {
    ctx.push(`Abgrenzung zur Conversion-Seite: ${pillar.intent_separation.cannibalization_guard}`);
  }
  const live = children.filter(isLive);
  if (live.length > 0) {
    ctx.push('Bereits vorhandene Unterseiten (werden verlinkt):\n' + live.map(c => `- ${c.topic} (${c.keyword})`).join('\n'));
  }
  if (planned.length > 0) {
    ctx.push('Laut Strategie geplante Unterseiten, die es noch NICHT gibt (nicht verlinken, aber gern als cluster_suggestions empfehlen):\n' + planned.map(c => `- ${c.topic} (${c.keyword})${c.estimated_volume ? `, Suchvolumen ${c.estimated_volume}` : ''}`).join('\n'));
  }
  return {
    keyword: pillar.keyword,
    target_audience: pillar.primary_audience || '',
    messy_middle_phase: CVZ_PILLAR_PHASES[pillar.messy_middle_phase] || '',
    conversion_target_kind: 'text',
    conversion_target_value: conv ? conv.topic : '',
    cluster_text: clusterLines.join('\n'),
    strategy_context: ctx.join('\n\n'),
    child_count: children.length,
    label: result.seed_topic
  };
}

function cvzOnStrategyPillarChange(value) {
  const st = cvzState.strategy;
  if (!st || value === '' || value === null) return;
  const result = cvzStrategyResults[st.session_id];
  const idx = Number(value);
  if (!result || !result.supporting_pages[idx]) return;
  const m = cvzMapStrategyPillar(result, idx);
  cvzState.keyword = m.keyword;
  if (m.target_audience) cvzState.target_audience = m.target_audience;
  cvzState.messy_middle_phase = m.messy_middle_phase;
  cvzState.conversion_target_kind = m.conversion_target_kind;
  cvzState.conversion_target_value = m.conversion_target_value;
  cvzState.cluster_text = m.cluster_text;
  cvzState.strategy_context = m.strategy_context;
  cvzState.strategy = { session_id: st.session_id, pillar_index: idx, label: m.label, child_count: m.child_count };
  // Sichtbare Felder dieses Schritts nachziehen.
  const kw = document.getElementById('cvz-in-keyword');
  const au = document.getElementById('cvz-in-audience');
  if (kw) kw.value = cvzState.keyword;
  if (au) au.value = cvzState.target_audience;
  cvzRenderStrategyBox();
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
