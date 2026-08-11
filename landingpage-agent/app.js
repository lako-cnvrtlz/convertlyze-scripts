// ==================== KONFIGURATION ====================
const API_BASE = 'https://convertlyze-agent-api-production.up.railway.app';

// ==================== IDENTITAET (echter Memberstack-Login) ====================
// Ersetzt den bisherigen Dev-Modus (Eingabefelder fuer Test-IDs). Die
// memberstack_id kommt direkt aus der aktiven Memberstack-Session
// (window.$memberstackDom - von Memberstacks eigenem, site-weit auf
// convertlyze.com laufendem Skript global bereitgestellt). Die Supabase
// user_id kennt das Frontend nicht direkt - die wird ueber den /me-Endpoint
// aufgeloest, der serverseitig dieselbe Zuordnung nutzt wie authenticateUser
// fuer alle anderen Endpoints (siehe Backend: router.get('/me', ...)).
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

// Wartet kurz auf window.$memberstackDom, falls Memberstacks eigenes Skript
// auf der Host-Seite noch laedt (Ladereihenfolge nicht garantiert). Bricht
// nach 5s ab statt endlos zu warten.
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

// Liefert true, wenn ein eingeloggter User gefunden UND die user_id
// erfolgreich aufgeloest wurde - false in jedem anderen Fall (nicht
// eingeloggt, Memberstack nicht geladen, /me fehlgeschlagen). Der Aufrufer
// zeigt bei false das Auth-Gate statt des Formulars, damit kein API-Aufruf
// mit leerer/ungueltiger user_id versucht wird.
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
  target_audience: '',
  conversion_goal: '',
  funnel_stage: '',
  usps: [],
  features: [],
  existing_content: '',
  reference_urls: [],
  brand_reference_url: '',
  customer_reasons: '',
  no_customer_reasons: false,
  pdfExtracts: [], // [{filename, text}]
  competitorSuggestions: [], // [{title, domain, url, selected}]
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

// ---- Step 0: Thema ----
function cvzRenderStep0() {
  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Worum geht es?</h1>
    <p class="cvz-subtitle">Da eure Landingpage noch nicht existiert: Gib das Thema/Ziel-Keyword ein, nicht eine URL.</p>
    <label class="cvz-label">Thema / Ziel-Keyword</label>
    <input class="cvz-input" id="cvz-in-keyword" placeholder="z.B. landingpage analyse" value="${cvzState.keyword}">
    <label class="cvz-label">Hauptzielgruppe (Persona)</label>
    <input class="cvz-input" id="cvz-in-audience" placeholder="z.B. Marketing-Leiter in KMUs" value="${cvzState.target_audience}">
    <p class="cvz-hint"><a href="https://www.convertlyze.com/content-hub/icp-generator" target="_blank" rel="noopener" style="color:var(--cvz-teal);">Unsicher bei deiner Zielgruppe? → Kostenloser ICP- & Persona-Assistent</a></p>
  `;
  document.getElementById('cvz-btn-back').style.visibility = 'hidden';
}

// ---- Step 1: Ziel ----
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
    <select class="cvz-input" id="cvz-in-goal">
      <option value="" disabled ${!cvzState.conversion_goal ? 'selected' : ''}>Conversion-Ziel auswählen …</option>
      ${optgroups}
    </select>
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

// ---- Step 2: Angebot (USPs/Features als Chips) ----
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

    <label class="cvz-label">Eure Website fuer den Marken-Look (optional)</label>
    <input class="cvz-input" id="cvz-in-brand-url" placeholder="https://eure-website.de" value="${cvzEsc(cvzState.brand_reference_url)}">
    <p class="cvz-hint">Falls angegeben, versucht der Assistent, eure Markenfarbe automatisch zu erkennen und schlaegt sie dir zur Bestaetigung vor - er uebernimmt sie nie ungefragt.</p>

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
    new URL(val); // wirft bei ungueltiger URL
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
      headers: { 'Authorization': `Bearer ${cvzMemberstackId}` }, // KEIN Content-Type - fetch setzt den multipart-Boundary selbst
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
    event.target.value = ''; // erlaubt erneuten Upload derselben Datei
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
function cvzEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Step 3: Wettbewerber ----
const CVZ_MAX_COMPETITORS = 5; // konsistent mit MAX_COMPETITORS im Backend

function cvzTotalCompetitorCount() {
  return cvzState.competitorSuggestions.filter(s => s.selected).length + cvzState.manualCompetitors.length;
}

async function cvzRenderStep3() {
  document.getElementById('cvz-step-content').innerHTML = `
    <h1 class="cvz-title">Wettbewerber bestätigen</h1>
    <p class="cvz-subtitle">Basierend auf eurem Thema — Vorschläge abwählen oder eigene ergänzen.</p>
    <div id="cvz-competitor-list"><p class="cvz-hint">Lade Vorschläge …</p></div>
    <label class="cvz-label">Weiteren Wettbewerber manuell hinzufügen</label>
    <input class="cvz-input" id="cvz-in-manual-competitor" placeholder="URL eines Wettbewerbers, z.B. https://wettbewerber.de" onkeydown="cvzAddManualCompetitorOnEnter(event)">
    <p class="cvz-hint">Nicht eure eigene Seite — eine Seite, mit der ihr um dieselben Kunden konkurriert. Maximal ${CVZ_MAX_COMPETITORS} Wettbewerber insgesamt, eigene Eintraege haben Vorrang vor Vorschlaegen.</p>
  `;

  if (cvzState.competitorSuggestions.length === 0) {
    try {
      const res = await fetch(`${API_BASE}/api/page-agent/suggest-competitors`, {
        method: 'POST', headers: cvzAuthHeaders(),
        body: JSON.stringify({ keyword: cvzState.keyword })
      });
      const data = await res.json();
      // Backend liefert bereits maximal CVZ_MAX_COMPETITORS Vorschlaege (ohne
      // Wikipedia) - slice hier zusaetzlich als Absicherung, falls sich das
      // Backend-Limit mal aendert, ohne dass diese Konstante mitgezogen wird.
      cvzState.competitorSuggestions = (data.suggestions || []).slice(0, CVZ_MAX_COMPETITORS).map(s => ({ ...s, selected: true }));
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

  const suggested = cvzState.competitorSuggestions.map((s, i) => {
    // Nicht ausgewaehlte Vorschlaege werden gesperrt, sobald das Limit
    // erreicht ist - bereits ausgewaehlte bleiben abwaehlbar.
    const locked = atCap && !s.selected;
    return `
    <div class="cvz-competitor-item ${s.selected ? 'selected' : ''} ${locked ? 'locked' : ''}" onclick="${locked ? '' : `cvzToggleCompetitor(${i})`}">
      <input type="checkbox" ${s.selected ? 'checked' : ''} ${locked ? 'disabled' : ''} onclick="event.stopPropagation(); cvzToggleCompetitor(${i})">
      <div>
        <div class="title">${cvzEsc(s.title)}</div>
        <div class="url">${cvzEsc(s.url)}</div>
      </div>
    </div>
  `;
  }).join('');
  const manual = cvzState.manualCompetitors.map((url, i) => `
    <div class="cvz-competitor-item selected">
      <input type="checkbox" checked disabled>
      <div style="flex:1"><div class="url">${cvzEsc(url)}</div></div>
      <button onclick="cvzRemoveManualCompetitor(${i})" style="background:none;border:none;color:var(--cvz-text-muted);cursor:pointer;">×</button>
    </div>
  `).join('');

  const counter = `<p class="cvz-hint" style="margin-bottom:10px;">${total}/${CVZ_MAX_COMPETITORS} Wettbewerber ausgewählt${atCap ? ' – Limit erreicht' : ''}</p>`;
  container.innerHTML = counter + ((suggested + manual) || '<p class="cvz-hint">Keine Vorschläge gefunden — bitte manuell ergänzen.</p>');
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

  if (cvzState.manualCompetitors.length >= CVZ_MAX_COMPETITORS) {
    cvzShowError(`Maximal ${CVZ_MAX_COMPETITORS} eigene Wettbewerber möglich - entferne zuerst einen.`);
    return;
  }
  cvzShowError(null);

  cvzState.manualCompetitors.push(val);
  event.target.value = '';

  // Eigene Eingaben haben Vorrang vor Vorschlaegen (siehe Chat-Anforderung):
  // wenn das Hinzufuegen das Gesamtlimit ueberschreitet, werden automatisch
  // vorgeschlagene Wettbewerber abgewaehlt (von hinten beginnend), bis das
  // Limit wieder eingehalten wird - kein Blockieren der eigenen Eingabe.
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
}
function cvzSyncStep1Fields() {
  cvzState.conversion_goal = document.getElementById('cvz-in-goal').value.trim();
}
function cvzSyncStep2Fields() {
  cvzState.existing_content = document.getElementById('cvz-in-existing').value.trim();
  cvzState.brand_reference_url = document.getElementById('cvz-in-brand-url').value.trim();
  if (!cvzState.no_customer_reasons) {
    cvzState.customer_reasons = document.getElementById('cvz-in-customer-reasons').value.trim();
  }
}

// Deaktiviert/leert das Textfeld statt komplett neu zu rendern (haelt Fokus
// stabil, siehe andere Toggle-Handler in diesem File). "Keine Informationen
// vorhanden" ist ein EXPLIZITES Signal (siehe Backend-Kommentar) - beim
// Aktivieren wird ein eventuell eingetippter Text bewusst verworfen, nicht
// nur versteckt, damit kein Widerspruch zwischen Checkbox und Textfeld
// entstehen kann.
function cvzToggleNoCustomerReasons(checked) {
  cvzState.no_customer_reasons = checked;
  const textarea = document.getElementById('cvz-in-customer-reasons');
  textarea.disabled = checked;
  if (checked) {
    textarea.value = '';
    cvzState.customer_reasons = '';
  }
}

// Fuegt Freitext, Referenz-Links und bereits extrahierten PDF-Text zu EINEM
// String zusammen, den das Backend im existing_content-Feld erwartet.
// PDF-Text ist bereits ausgelesen -> direkt inline, keine erneute Extraktion
// noetig. Referenz-Links bleiben als URLs stehen, die ruft der Agent selbst
// per fetch_reference_content ab (siehe Backend, max. 3).
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

// ==================== LAUNCH (Formular abschliessen) ====================
// Generischer Fortschritts-Ticker fuer lange Anfragen. Kickoff-Analyse und
// Struktur-Turns dauern real 2-3 Minuten (mehrere Anthropic-Runden + Tool-
// Aufrufe) - ohne Anzeige wirkt die Oberflaeche in dieser Zeit wie
// eingefroren (siehe Chat-Begruendung). WICHTIG: Das ist KEIN echter
// Fortschritt vom Backend (das waere Streaming, siehe Chat) - rein
// clientseitige Anzeige mit verstrichener Zeit plus rotierenden, bewusst
// launigen Status-Phrasen, passend zur tatsaechlichen Wartezeit.
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
        usps: cvzState.usps,
        features: cvzState.features,
        keyword: cvzState.keyword,
        competitor_urls: competitorUrls,
        existing_content: cvzBuildExistingContent() || null,
        brand_reference_url: cvzState.brand_reference_url || null,
        customer_reasons: cvzState.no_customer_reasons ? 'Keine Informationen vorhanden' : (cvzState.customer_reasons || null)
      })
    });
    if (!briefRes.ok) {
      const err = await briefRes.json();
      throw new Error(err.error + (err.missing_fields ? ` (${err.missing_fields.join(', ')})` : ''));
    }

    // Laengster Schritt: Keyword-, SERP- und Wettbewerber-Analyse laufen hier - real 2-3 Minuten.
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

// ==================== SESSION-WIEDERAUFNAHME (kontobasiert, kein localStorage) ====================
// Aufruf-Varianten:
// 1. index.html?project=<page_project_id> - explizit von der Projekt-Liste
//    aus geoeffnet (siehe projects.html)
// 2. index.html ohne Parameter - Backend loest ueber last_active_page_project_id
//    des Accounts auf (siehe /resume ohne page_project_id im Backend)
async function cvzTryResume() {
  const urlParams = new URLSearchParams(window.location.search);

  // Explizites "neues Projekt starten" - Resume komplett ueberspringen.
  // Flag wird sofort aus der URL entfernt, damit ein spaeterer Reload
  // wieder normal resumen kann, statt dauerhaft im Formular haengen zu bleiben.
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
    if (!res.ok) return false; // z.B. 404 = noch nie ein Projekt angelegt, ganz normal beim allerersten Besuch

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
  // Kontingent ist seit der Umstellung SESSION-basiert (nicht mehr
  // Nachrichten-basiert) - Chatten innerhalb einer Session ist unlimitiert,
  // nur eine NEUE Session zieht vom Kontingent ab. Label entsprechend
  // angepasst, sonst suggeriert "Nachrichten übrig" faelschlich ein
  // Pro-Nachricht-Limit innerhalb dieses Chats.
  document.getElementById('cvz-quota').textContent = `${remaining}/${limit} Sessions übrig`;
}

// Rendert ein vollstaendiges HTML-Dokument (siehe services/templates.js,
// renderDocument()) sicher isoliert per <iframe srcdoc="...">. sandbox=
// "allow-same-origin" OHNE "allow-scripts": das generierte Dokument enthaelt
// kein JS und soll auch keins ausfuehren duerfen, aber diese Seite braucht
// Lesezugriff auf contentDocument, um die Iframe-Hoehe an den Inhalt
// anzupassen (Iframes sizen sich nicht von selbst auf ihren Inhalt).
// onLoaded(measuredHeight) gibt die ermittelte Hoehe an den Aufrufer weiter
// (measuredHeight ist null, falls die Messung fehlschlug), damit der
// Aufrufer sie z.B. fuer die Skalierungsberechnung weiterverwenden kann,
// ohne contentDocument ein zweites Mal abzufragen.
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

// Geraete-Breiten fuer die Vorschau. "Desktop" ist eine echte Desktop-
// Viewport-Breite (das Iframe rendert IMMER intern bei dieser Breite,
// unabhaengig von der sichtbaren Groesse) - siehe cvzApplyPreviewScale fuer
// die Skalierung, die das Panel ohne horizontales Scrollen darstellbar macht.
const CVZ_DEVICE_WIDTHS = { desktop: 1440, mobile: 390 };
// Default: Ist DIESE Seite (der Chat/die Vorschau selbst) schon auf einem
// schmalen Viewport geoeffnet, ist ein Desktop-Preview selten sinnvoll -
// dort startet Mobile. Auf einem breiten Desktop-Viewport ist Desktop Standard.
let cvzPreviewDevice = window.innerWidth < 768 ? 'mobile' : 'desktop';
// Natuerliche (unskalierte) Hoehe der aktuell angezeigten Struktur bei der
// aktuellen Geraetebreite - noetig, um bei jeder Neuberechnung (Panel-
// Groessenaenderung, Geraete-Wechsel) die Skalierung neu bestimmen zu
// koennen, ohne jedes Mal erneut ins Iframe hineinzumessen.
let cvzPreviewContentHeight = 0;

// Skaliert .cvz-preview-frame-inner (und damit das Iframe) so herunter, dass
// die volle Geraetebreite IMMER in den verfuegbaren Platz passt - kein
// horizontales Scrollen noetig (siehe Chat-Begruendung). .cvz-preview-frame-
// outer bekommt die tatsaechliche (skalierte) Groesse, damit die Scrollbox
// exakt zum sichtbaren Inhalt passt statt Leerraum in der urspruenglichen
// Groesse freizuhalten. Bei "Mobile" ergibt sich durch min(1, ...) meist
// scale=1 (kein Verkleinern noetig), das Panel zeigt dann einen natuerlich
// grossen Handy-Rahmen statt eines gestreckten breiten Fensters.
function cvzApplyPreviewScale() {
  const outer = document.getElementById('cvz-preview-frame-outer');
  const inner = document.getElementById('cvz-preview-frame-inner');
  if (!outer || !inner || !cvzPreviewContentHeight) return;

  const deviceWidth = CVZ_DEVICE_WIDTHS[cvzPreviewDevice];
  const body = document.getElementById('cvz-preview-body');
  const availableWidth = body.clientWidth - 32; // 16px Innenabstand auf beiden Seiten, siehe .cvz-preview-body padding
  const scale = Math.min(1, Math.max(availableWidth, 100) / deviceWidth);

  // WICHTIG: .cvz-preview-frame-inner ist ein normaler Block-div OHNE eigene
  // Breite/Hoehe - der uebernaehme sonst per CSS-Boxmodell automatisch die
  // Breite von .cvz-preview-frame-outer (seinem Elternelement), NICHT die
  // seines Iframe-Inhalts. Dadurch bezog sich jede Neuberechnung auf die
  // Breite der VORHERIGEN Skalierung statt auf die tatsaechliche
  // Geraetebreite - das war der Grund, warum ein Wechsel zurueck zu Desktop
  // nach Mobile nicht korrekt neu skalierte. Inner bekommt deshalb IMMER
  // explizit die natuerliche (unskalierte) Groesse gesetzt, bevor der
  // transform greift.
  inner.style.width = deviceWidth + 'px';
  inner.style.height = cvzPreviewContentHeight + 'px';
  inner.style.transform = `scale(${scale})`;
  outer.style.width = Math.round(deviceWidth * scale) + 'px';
  outer.style.height = Math.round(cvzPreviewContentHeight * scale) + 'px';
}

// Debounced, damit ein Resize-Event-Sturm (z.B. beim Ziehen des Browser-
// fensters) nicht bei jedem einzelnen Pixel neu rechnet. Erzwingt zusaetzlich
// einen Wechsel auf Mobile, falls der Viewport unter die Mobil-Schwelle
// faellt WAEHREND Desktop aktiv ist (siehe CSS: der Desktop-Button wird dort
// versteckt, der State darf dann nicht auf 'desktop' haengen bleiben - sonst
// bleibt die auf ~350px herunterskalierte 1440px-Ansicht unlesbar aktiv,
// nur ohne sichtbaren Weg zurueck zu Mobile ausser ueber den Mobile-Button).
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
  if (!iframe) return; // noch keine Struktur vorhanden - nur der Button-Zustand aendert sich
  iframe.style.width = CVZ_DEVICE_WIDTHS[device] + 'px';
  // Nach dem Breitenwechsel reflowt der Seiteninhalt im iframe (responsive
  // CSS, siehe renderDocument) - die Hoehe war fuer die VORHERIGE Breite
  // berechnet und muss neu ermittelt werden, sonst stimmt die Skalierung
  // nicht mehr mit dem tatsaechlichen Inhalt ueberein.
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    cvzPreviewContentHeight = doc.documentElement.scrollHeight;
    iframe.style.height = cvzPreviewContentHeight + 'px';
  } catch (e) {
    console.warn('Iframe-Hoehe nach Geraete-Wechsel konnte nicht neu ermittelt werden:', e.message);
  }
  cvzApplyPreviewScale();
}
cvzSetPreviewDevice(cvzPreviewDevice); // Button-Zustand direkt beim Laden synchronisieren

// Persistentes Vorschau-Panel: zeigt IMMER nur die AKTUELLSTE Struktur-
// Version, kein Verlauf (siehe CSS-Kommentar bei .cvz-preview-panel). Merkt
// sich das aktuelle Dokument in cvzLatestStructureHtml fuer den Download-
// Button, der unabhaengig von einer bestimmten Chat-Nachricht funktionieren
// muss.
let cvzLatestStructureHtml = null;
function cvzUpdatePreviewPanel(htmlDocument, version) {
  if (!htmlDocument) return;
  cvzLatestStructureHtml = htmlDocument;

  const body = document.getElementById('cvz-preview-body');
  // Skalierungs-Rahmen (outer = sichtbare Groesse, inner = natuerliche
  // Groesse + transform:scale, siehe cvzApplyPreviewScale) statt direkt ins
  // Panel zu rendern - ersetzt gleichzeitig den Empty-State.
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
  URL.revokeObjectURL(url); // sonst haelt der Browser den Blob unnoetig im Speicher
}

// structureVersion ist optional (z.B. beim Kickoff-Reply ohne Struktur nicht
// vorhanden). Bei vorhandenem structureHtmlDocument wird NICHT mehr inline
// im Chat eingebettet (siehe cvzUpdatePreviewPanel) - stattdessen aktualisiert
// sich das Vorschau-Panel, und der Chat bekommt nur einen kurzen Hinweis,
// damit dieselbe Struktur nicht doppelt zu sehen ist.
function cvzAppendMessage(role, text, structureHtmlDocument, structureVersion) {
  const wrap = document.getElementById('cvz-chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `cvz-msg ${role}`;
  if (role === 'assistant' && typeof marked !== 'undefined') {
    bubble.innerHTML = marked.parse(text); // Agent-Text, kein User-Input - unproblematisch als HTML einzufuegen
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

let cvzIsSending = false; // Re-Entrancy-Schutz: verhindert Doppel-Submit (z.B. Enter + Klick fast gleichzeitig,
                           // oder ein ungeduldiger zweiter Versuch waehrend ein Struktur-Turn mit vielen
                           // Tool-Aufrufen noch laeuft und "Denkt nach..." laenger stehen bleibt als erwartet).

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
  // Spinner-Icon + Text-Label als getrennte Elemente, damit der Ticker unten
  // nur das Label aktualisiert (textContent) statt bei jedem Update per
  // marked.parse() die ganze Blase (inkl. Spinner) neu aufzubauen.
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

// ==================== INIT ====================
// Erst Identitaet aufloesen (echter Memberstack-Login + /me-Aufloesung),
// dann Wiederaufnahme versuchen, sonst normales Formular zeigen. Ohne
// gueltige Identitaet (nicht eingeloggt, Memberstack nicht verfuegbar):
// Auth-Gate statt Formular, damit kein API-Aufruf mit leerer user_id
// versucht wird.
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
