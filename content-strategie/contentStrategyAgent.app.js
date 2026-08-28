// contentStrategyAgent.app.js
//
// Frontend für den Content-Strategie-Agenten (routes/contentStrategyAgent.ts).
// Eigenständiges Vanilla-JS-Embed-Script, analog zum bestehenden Landingpage-Assistant-Embed
// (app.js für pageAgent) - bewusst NICHT von diesem abhängig oder aus ihm abgeleitet, weil mir
// dessen genauer Quelltext beim Schreiben dieser Datei nicht mehr vorlag (nur die Beschreibung
// aus dem bisherigen Chat-Verlauf). Der API-Vertrag hier ist gegen den TATSÄCHLICHEN
// Backend-Code verifiziert (middleware/auth.js, routes/contentStrategyAgent.ts,
// routes/googleIntegration.ts), NICHT geraten:
//   - Authentifizierung: Header "Authorization: Bearer <memberstack_id>" - authenticateUser in
//     middleware/auth.js sucht den User direkt über memberstack_id, kein JWT/Session-Token.
//   - GET  /api/content-strategy/me                    -> { user_id }
//   - GET  /api/content-strategy/quota?user_id=...      -> Kontingent-Vorschau
//   - GET  /api/integrations/google/status              -> { connected, sites: [{site_url, connected_at}] }
//   - POST /api/content-strategy/generate {user_id, topic, domain?}  -> 202 { turn_id, status, ... }
//   - GET  /api/content-strategy/status/:turn_id         -> { status: 'processing'|'done'|'error', ... }
//   - PATCH /api/content-strategy/:id/pages/:index {status} -> { success, result }
//
// WICHTIGER HINWEIS ZUR LAUFZEIT: /generate liefert sofort (202) einen turn_id zurück und läuft
// im Hintergrund weiter - ein kompletter Lauf (Themen-Analyse + Domain-Abgleich + GEO-Check,
// IMMER MIT 3 echten LLM-Prompt-Tests, siehe Chat-Verlauf: die Checkbox dafür wurde entfernt,
// der Test ist jetzt fester Bestandteil, nicht mehr abwählbar - ein Kill-Switch dafür existiert
// nur noch serverseitig in routes/contentStrategyAgent.ts) dauert inzwischen meist 10-15
// Minuten, nicht mehr nur ein paar Sekunden (siehe CVZ_CS_PROGRESS_MESSAGES weiter unten für
// die zeitbasierten Lade-Texte). Dieses Script pollt deshalb GET /status/:turn_id, statt auf
// die Antwort von /generate zu warten.
//
// NICHT ENTHALTEN (bewusst, siehe Chat-Verlauf): ein Kauf-Flow für PPU-Strategie-Pakete
// (1er/5er/10er). Dieses Script zeigt nur die verbleibenden PPU-Credits an und ruft bei
// fehlendem Kontingent einen konfigurierbaren Callback auf (onNoQuota) - die eigentliche
// Bezahl-/Checkout-Anbindung kennt dieses Script nicht und sollte an den bestehenden
// Billing-Flow angebunden werden.
//
// PRODUKTENTSCHEIDUNG (Nachtrag): das Verbinden/Trennen der Google Search Console passiert
// NICHT mehr hier, sondern in den Account-Einstellungen (siehe contentStrategySettings.app.js)
// - eine GSC-Verbindung ist Account-weit, kein Formular-Feld für dieses eine Tool. Diese Seite
// hier prüft nur noch den Status (GET /api/integrations/google/status) und zeigt bei fehlender
// Verbindung einen Hinweis mit Link zu CONFIG.settingsUrl, statt selbst einen Connect-Button
// anzubieten.

(function () {
  'use strict';

  // ==================== KONFIGURATION ====================
  // Vor dem Einbetten anpassen (oder per window.CVZ_CONTENT_STRATEGY_CONFIG vor dem Laden
  // dieses Scripts überschreiben).
  var DEFAULT_CONFIG = {
    apiBaseUrl: 'https://YOUR-API-DOMAIN.example', // z.B. die Railway-Domain der API, OHNE trailing slash
    containerId: 'cvz-content-strategy-agent',
    settingsUrl: '/member/einstellungen#integrationen', // echte Convertlyze-Einstellungen-Seite - der Anker setzt voraus, dass der neue "Integrationen"-Abschnitt dort die id="integrationen" bekommt (siehe contentStrategySettings.app.js)
    // TODO: echten Pfad eintragen, falls die Landingpage-Assistent-Seite unter einer anderen
    // URL liegt (gleiches Muster/gleicher Platzhalter wie CONFIG.NEW_LANDINGPAGE_URL in
    // dashboard-v5.js bzw. CONFIG.chatPageUrl in page-projects-embed.html - bitte synchron halten).
    landingpageAssistantUrl: '/member/landingpage-assistant',
    pollIntervalMs: 3000,
    // ANGEHOBEN von 15 auf 22 Minuten (siehe Chat-Verlauf, Lasse: "Strategie-Erstellung dauert
    // jetzt über 10 Minuten"): der GEO-Prompt-Test läuft jetzt standardmäßig mit (siehe
    // promptTestCheckbox weiter unten), nicht mehr nur auf ausdrücklichen Wunsch - das macht die
    // längeren Laufzeiten zum Normalfall statt zur Ausnahme. BACKGROUND_TURN_TIMEOUT_MS im
    // Backend (routes/contentStrategyAgent.ts) wurde parallel auf 20 Minuten angehoben - hier
    // bewusst 2 Minuten MEHR als das Backend-Limit, damit bei einem echten Timeout die genaue
    // Backend-Fehlermeldung (job.status === 'error') den Client erreicht, BEVOR der eigene,
    // generische "Zeitüberschreitung"-Text in pollStatus() zuschlägt.
    pollTimeoutMs: 22 * 60 * 1000,
    // NEU (siehe Chat-Verlauf, Lasse: "KI-Agent, der Fragen des Users zu dem Report beantworten
    // kann") - eigenes, kürzeres Poll-Intervall/Timeout für den Report-Chat: eine Chat-Antwort
    // ist deutlich schneller als ein kompletter Report-Lauf (der echte GEO-Prompt-Test läuft im
    // Chat serverseitig nie mit, siehe CHAT_TOOLS in routes/contentStrategyAgent.ts). 2 Minuten
    // Timeout, bewusst mit Puffer ÜBER CHAT_TURN_TIMEOUT_MS (90s im Backend) - gleicher Grund wie
    // bei pollTimeoutMs oben: die echte Backend-Fehlermeldung soll ankommen, bevor der eigene
    // generische Timeout-Text feuert.
    chatPollIntervalMs: 1500,
    chatPollTimeoutMs: 2 * 60 * 1000,
  };

  var CONFIG = Object.assign({}, DEFAULT_CONFIG, window.CVZ_CONTENT_STRATEGY_CONFIG || {});

  var PAGE_TYPE_LABELS = {
    conversion_landingpage: 'Conversion-Landingpage',
    comparison: 'Vergleichsseite',
    pricing_roi: 'Preise/ROI',
    calculator_tool: 'Rechner/Tool',
    template_download: 'Vorlage/Download',
    use_case: 'Use-Case',
    review: 'Test/Review',
    integration: 'Integration',
    topic_coverage: 'Themenabdeckung',
    // NEU (siehe Chat-Verlauf, Lasse: "auch Typen wie Pillar Pages vorschlagen, wenn sinnvoll,
    // und erklären") - Klammerzusatz direkt im Badge-Label, weil "Pillar-Page" für sich allein
    // ein SEO-Fachbegriff ist, den nicht jeder Convertlyze-User kennt (gleicher Gedanke wie
    // schon beim GEO-Prompt-Test-Hinweistext: Begriffe erklären statt vorauszusetzen).
    pillar_page: 'Pillar-Page (Themen-Hub)',
  };

  // Kurze, für Nicht-SEO-Experten verständliche Definition - wird in renderPageCard IMMER
  // sichtbar unter dem Badge angezeigt (nicht nur als Hover-Tooltip), wenn der Typ erklärungs-
  // bedürftig ist. Ergänzt page.reasoning (das WARUM für dieses konkrete Thema), diese Zeile
  // ist das WAS/generelle Konzept.
  var PAGE_TYPE_EXPLANATIONS = {
    pillar_page: 'Eine Pillar-Page ist eine breite Übersichtsseite zu einem Kern-Thema, die mehrere verwandte Unterseiten bündelt und zu ihnen verlinkt - baut Themenautorität auf und dient als zentrale Anlaufstelle im Cluster.',
  };

  var ROLE_LABELS = {
    coverage: 'Trust/Themenabdeckung',
    citation: 'Rank- & Zitier-Ziel',
    existing: 'bereits vorhanden',
  };

  // NEU (siehe Chat-Verlauf, "Phasen des Messy Middle ... um eine volle Abdeckung zu
  // gewährleisten"): feste Reihenfolge für die Gruppierung der Unterstützenden-Seiten-Karten -
  // Backend erzwingt per Zod-superRefine, dass mind. exploration + evaluation vorkommen,
  // decision ist optional (siehe contentStrategyAgent.schemas.ts).
  var MESSY_MIDDLE_PHASES = [
    { value: 'exploration', label: 'Exploration', description: 'Schafft Bewusstsein und deckt offene Grundlagenfragen ab.' },
    { value: 'evaluation', label: 'Evaluation', description: 'Hilft beim Vergleichen und Eingrenzen der Optionen.' },
    { value: 'decision', label: 'Entscheidung', description: 'Unmittelbar vor der Kaufentscheidung.' },
    // WHY 4. Eintrag "legacy": bereits gespeicherte Strategien von VOR diesem Update haben kein
    // messy_middle_phase-Feld (undefined) - ohne diesen Auffangkorb würden ihre Seiten beim
    // Ansehen einer alten Session (?session_id=...) kommentarlos aus "Unterstützende Seiten"
    // verschwinden (byPhase[undefined] existiert zwar, wird aber nie gerendert). Lieber
    // ehrlich als "ohne Phasen-Zuordnung" zeigen als eine Phase raten, die so nie eingeschätzt wurde.
    { value: 'legacy', label: 'Weitere Seiten', description: 'Aus einer älteren Strategie-Version ohne Phasen-Zuordnung.' },
  ];

  // Gruppiert nach Phase, behält aber den ORIGINALEN Index in supporting_pages bei (nicht die
  // Position innerhalb der Gruppe) - der Status-PATCH-Endpunkt (/pages/:index) und
  // describeLink() referenzieren Seiten über diesen Original-Index, der beim Umsortieren nach
  // Phase sonst durcheinandergeraten würde.
  function groupPagesByPhase(pages) {
    var byPhase = {};
    MESSY_MIDDLE_PHASES.forEach(function (phase) { byPhase[phase.value] = []; });
    pages.forEach(function (page, index) {
      var phaseKey = byPhase.hasOwnProperty(page.messy_middle_phase) ? page.messy_middle_phase : 'legacy';
      var bucket = byPhase[phaseKey];
      bucket.push({ page: page, index: index });
    });
    return byPhase;
  }

  var STATUS_OPTIONS = [
    { value: 'vorgeschlagen', label: 'Vorgeschlagen' },
    { value: 'geplant', label: 'Geplant' },
    { value: 'in_arbeit', label: 'In Arbeit' },
    { value: 'live', label: 'Live' },
  ];

  // ==================== STATE ====================
  var state = {
    root: null,
    userId: null,
    memberstackToken: null,
    quota: null,
    gscStatus: null,
    pollHandle: null,
    pollStartedAt: null,
    currentSessionId: null,
    currentResult: null,
    // NEU (siehe Chat-Verlauf, Report-Chat): eigener, klar abgegrenzter Unter-Zustand statt
    // einzelner Top-Level-Felder - macht renderChatSection() unabhängig davon, ob der Report
    // gerade frisch generiert wurde oder über loadExistingSession() geladen wird.
    chat: {
      sessionId: null,
      messages: [], // [{role: 'user'|'assistant', content: string}]
      messagesUsed: 0,
      messagesLimit: 20,
      pollHandle: null,
      pollStartedAt: null,
      sending: false,
      _pendingUserMessage: null, // während des Pollens zwischengespeichert, siehe sendChatMessage/pollChatStatus
    },
  };

  // ==================== API-HELFER ====================

  function apiFetch(path, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (state.memberstackToken) headers.Authorization = 'Bearer ' + state.memberstackToken;
    return fetch(CONFIG.apiBaseUrl + path, Object.assign({}, options, { headers: headers })).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(body.error || 'API-Fehler (' + res.status + ')');
          err.status = res.status;
          err.body = body;
          throw err;
        }
        return body;
      });
    });
  }

  // ==================== MEMBERSTACK-IDENTITÄT ====================
  // Erwartet, dass das Memberstack-DOM-Package (window.$memberstackDom) auf der Host-Seite
  // bereits geladen/initialisiert ist - genau wie beim bestehenden Landingpage-Assistant-Embed.
  // Wird hier NICHT selbst geladen, um keine zweite Memberstack-Instanz auf derselben Seite zu
  // riskieren.
  function waitForMemberstack(timeoutMs) {
    return new Promise(function (resolve, reject) {
      var waited = 0;
      var interval = 100;
      var timer = setInterval(function () {
        if (window.$memberstackDom) {
          clearInterval(timer);
          resolve(window.$memberstackDom);
          return;
        }
        waited += interval;
        if (waited >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('Memberstack (window.$memberstackDom) wurde nicht gefunden. Ist das Memberstack-Script auf dieser Seite eingebunden?'));
        }
      }, interval);
    });
  }

  function resolveIdentity() {
    return waitForMemberstack(5000)
      .then(function (memberstackDom) {
        // WICHTIG (Sicherheits-Fix, siehe Chat-Verlauf): NICHT mehr member.id als Bearer-Token
        // verwenden - das ist die pure, unsignierte Member-ID, keine echte Authentifizierung.
        // getMemberCookie() liefert das tatsächliche, von Memberstack signierte JWT, das der
        // Server jetzt kryptographisch verifiziert (services/memberstackAuth.js), bevor er der
        // enthaltenen ID glaubt. getCurrentMember() bleibt nötig, um "eingeloggt oder nicht" zu
        // prüfen (getMemberCookie() liefert bei keiner Session einfach null/leer).
        return Promise.all([memberstackDom.getCurrentMember(), memberstackDom.getMemberCookie()]);
      })
      .then(function (results) {
        var member = results[0] && results[0].data;
        var token = results[1];
        if (!member || !member.id || !token) {
          throw Object.assign(new Error('not_logged_in'), { code: 'not_logged_in' });
        }
        state.memberstackToken = token;
        return apiFetch('/api/content-strategy/me');
      })
      .then(function (me) {
        state.userId = me.user_id;
        return me.user_id;
      });
  }

  // ==================== KONTINGENT & GSC-STATUS ====================

  function loadQuota() {
    return apiFetch('/api/content-strategy/quota?user_id=' + encodeURIComponent(state.userId)).then(function (quota) {
      state.quota = quota;
      return quota;
    });
  }

  function loadGscStatus() {
    return apiFetch('/api/integrations/google/status')
      .then(function (status) {
        state.gscStatus = status;
        return status;
      })
      .catch(function (err) {
        // Nicht fatal fürs restliche Formular - Domain-Abgleich fällt serverseitig ohnehin
        // automatisch auf DataForSEO zurück, wenn keine GSC-Verbindung besteht.
        console.warn('GSC-Status konnte nicht geladen werden:', err.message);
        state.gscStatus = { connected: false, sites: [] };
        return state.gscStatus;
      });
  }

  // ==================== RENDERING ====================

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'html') node.innerHTML = attrs[key];
      else if (key.indexOf('on') === 0 && typeof attrs[key] === 'function') node.addEventListener(key.slice(2), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function renderQuotaBanner() {
    var q = state.quota;
    var gsc = state.gscStatus;
    var banner = el('div', { class: 'cvz-cs-banner' });

    if (q) {
      var quotaText = q.sessions_remaining + ' von ' + q.sessions_limit + ' Strategie-Sessions in diesem Zeitraum übrig';
      if (q.ppu_strategy_credits_available > 0) {
        quotaText += ' · + ' + q.ppu_strategy_credits_available + ' zusätzliche Credits';
      }
      banner.appendChild(el('span', { class: 'cvz-cs-quota' }, [quotaText]));
      if (!q.can_start_session) {
        banner.appendChild(
          el('span', { class: 'cvz-cs-quota-empty' }, ['Kein Kontingent mehr verfügbar. Bitte Plan upgraden oder Credits nachkaufen.'])
        );
      }
    }

    // Verbinden/Trennen passiert in den Einstellungen (contentStrategySettings.app.js) - hier
    // nur noch ein Status-Hinweis mit Link dorthin, siehe Produktentscheidung im Datei-Kopf.
    var gscBadge;
    if (gsc && gsc.connected) {
      gscBadge = el('span', { class: 'cvz-cs-gsc-connected' }, ['Search Console verbunden (' + gsc.sites.length + ' Property/-ies)']);
    } else {
      gscBadge = el('span', { class: 'cvz-cs-gsc-hint' }, [
        'Google Search Console ist noch nicht verbunden - für einen echten Abdeckungs-Check (statt Index-Schätzung) ',
        el('a', { href: CONFIG.settingsUrl }, ['jetzt in den Einstellungen verbinden']),
        '.',
      ]);
    }
    banner.appendChild(gscBadge);

    return banner;
  }

  function renderForm() {
    var form = el('form', { class: 'cvz-cs-form' });

    var topicInput = el('input', { type: 'text', name: 'topic', placeholder: 'z.B. "Landingpage Software für B2B"', required: 'required' });
    var domainInput = el('input', { type: 'text', name: 'domain', placeholder: 'z.B. convertlyze.com (optional, für Abdeckungs-Check)' });
    if (state.gscStatus && state.gscStatus.connected && state.gscStatus.sites.length === 1) {
      var suggested = state.gscStatus.sites[0].site_url.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      domainInput.value = suggested;
    }
    // ENTFERNT (siehe Chat-Verlauf, Lasse: "sollten wir die Checkbox entfernen und es
    // standardmäßig machen, weil GEO ein wichtiger Bereich für User ist?" - bestätigt, inkl.
    // Kostendaten: 17 Cent DataForSEO-Gesamtkosten für 3 Läufe an einem Tag, also kein
    // Kostenfaktor): der GEO-Prompt-Test lief hier vorher über eine Checkbox (promptTestCheckbox),
    // die ist jetzt komplett raus - der Test läuft für jeden Lauf mit, ohne Wahlmöglichkeit im
    // Formular. Ein Kill-Switch für den Test existiert weiterhin, aber nur noch operativ
    // serverseitig (ENV-Variable in routes/contentStrategyAgent.ts), nicht mehr als User-Option.

    form.appendChild(el('label', { class: 'cvz-cs-label' }, ['Thema / Ziel-Keyword', topicInput]));
    form.appendChild(el('label', { class: 'cvz-cs-label' }, ['Eigene Domain', domainInput]));

    var canStart = !state.quota || state.quota.can_start_session;
    var submitBtn = el('button', { type: 'submit', class: 'cvz-cs-submit-btn' }, ['Content-Cluster erstellen']);
    if (!canStart) submitBtn.setAttribute('disabled', 'disabled');
    form.appendChild(submitBtn);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var topic = topicInput.value.trim();
      var domain = domainInput.value.trim();
      if (!topic) return;
      startGeneration(topic, domain || undefined);
    });

    return form;
  }

  function startGeneration(topic, domain) {
    renderProcessing(topic);

    apiFetch('/api/content-strategy/generate', {
      method: 'POST',
      // run_prompt_test ist jetzt immer true (siehe Kommentar bei renderForm) - das Feld bleibt
      // im Request-Body erhalten, weil das Backend darauf weiterhin den echten, kostenpflichtigen
      // Prompt-Test-Aufruf hart absichert (allowPromptTest), nicht auf einer Modell-Entscheidung.
      body: JSON.stringify({ user_id: state.userId, topic: topic, domain: domain, run_prompt_test: true }),
    })
      .then(function (res) {
        pollStatus(res.turn_id);
      })
      .catch(function (err) {
        renderError('Start fehlgeschlagen: ' + err.message, err.body);
      });
  }

  function pollStatus(turnId) {
    state.pollStartedAt = Date.now();
    function tick() {
      if (Date.now() - state.pollStartedAt > CONFIG.pollTimeoutMs) {
        renderError('Zeitüberschreitung: Die Generierung läuft im Hintergrund ungewöhnlich lange. Bitte später erneut prüfen oder Support kontaktieren.');
        return;
      }
      apiFetch('/api/content-strategy/status/' + turnId)
        .then(function (job) {
          if (job.status === 'processing') {
            state.pollHandle = setTimeout(tick, CONFIG.pollIntervalMs);
            return;
          }
          if (job.status === 'error') {
            renderError('Generierung fehlgeschlagen: ' + job.error);
            return;
          }
          state.currentSessionId = job.session_id;
          state.currentResult = job.result;
          loadQuota().then(function () {
            renderResult(job.session_id, job.result, job.funded_by);
          });
        })
        .catch(function (err) {
          if (err.status === 404 && err.body && err.body.code === 'turn_lost') {
            renderError('Die Verarbeitung wurde unterbrochen (z.B. Server-Neustart) oder ist abgelaufen. Bitte erneut starten.');
            return;
          }
          renderError('Status konnte nicht geprüft werden: ' + err.message);
        });
    }
    tick();
  }

  // ==================== FORTSCHRITTS-TEXTE (zeitbasiert statt fester Takt) ====================
  // NEU (siehe Chat-Verlauf, Lasse: "Strategie-Erstellung dauert jetzt über 10 Minuten, Spinner-
  // Nachrichten anpassen, gerne mit Humor - hier ein Beispiel aus der Aufbau-Session"): gleiches
  // Muster wie CVZ_KICKOFF_MESSAGES in pageAgent.app.js (dortige Vorlage), aber mit eigenen,
  // auf den Content-Strategie-Ablauf zugeschnittenen Texten/Schwellen - der GEO-Prompt-Test läuft
  // jetzt immer mit (Checkbox entfernt, siehe renderForm), >10 Minuten sind damit der Normalfall,
  // nicht mehr die Ausnahme. Format: { at: Sekunden-Schwelle, text: Anzeigetext }, Liste MUSS
  // nach "at" aufsteigend sortiert sein.
  var CVZ_CS_PROGRESS_MESSAGES = [
    { at: 8, text: 'Analyse startet - das dauert jetzt eine Weile, hol dir ruhig einen Kaffee' },
    { at: 30, text: 'Suchvolumen und die häufigsten Nutzerfragen zum Thema werden ausgewertet' },
    { at: 60, text: 'Ist-Zustand wird geprüft: wer rankt heute schon wofür' },
    { at: 100, text: 'Wettbewerber-Seiten werden auseinandergenommen (Länge, Tabellen, FAQ-Blöcke)' },
    { at: 150, text: 'Google AI Overview und Zitations-Chancen werden gecheckt' },
    { at: 210, text: 'Kaffee schon leer? Gerade laufen echte Prompt-Tests gegen ein KI-Modell, das braucht ein paar Sekunden pro Anfrage' },
    { at: 280, text: 'Content-Cluster wird gebaut: Conversion-Seite plus unterstützende Seiten' },
    { at: 350, text: 'Themen werden auf die Journey-Phasen Exploration, Evaluation und Decision verteilt' },
    { at: 430, text: 'Stärken, Schwächen, Wettbewerb und Chancen werden zur Executive Summary zusammengefasst' },
    { at: 520, text: 'Fast fertig, letzter Feinschliff am Bericht' },
    { at: 650, text: 'Läuft noch - mit echtem GEO-Prompt-Test dauert das schon mal 10+ Minuten, kein Grund zur Sorge' },
    { at: 900, text: 'Braucht in diesem Fall spürbar länger als sonst, bitte noch etwas Geduld' },
  ];

  // Wählt die Nachricht, deren "at"-Schwelle zuletzt unterschritten wurde - vor der ersten
  // Schwelle bleibt null (dann zeigt der Aufrufer den baseText).
  function pickTimedMessage(messages, elapsedSec) {
    var chosen = null;
    for (var i = 0; i < messages.length; i++) {
      if (elapsedSec >= messages[i].at) chosen = messages[i];
      else break; // Liste ist aufsteigend sortiert, weitere Einträge liegen noch in der Zukunft
    }
    return chosen;
  }

  var progressTickTimer = null;
  function stopProgressTicker() {
    if (progressTickTimer) {
      clearInterval(progressTickTimer);
      progressTickTimer = null;
    }
  }

  // Aktualisiert .cvz-cs-progress-text jede Sekunde direkt im DOM statt über einen Callback -
  // stoppt sich selbst, sobald dieses Element nicht mehr existiert (Ergebnis oder Fehler wurden
  // inzwischen gerendert), statt separat von jedem Aufrufer abgeräumt werden zu müssen.
  function startProgressTicker(startedAt, baseText) {
    stopProgressTicker();
    function tick() {
      var progressEl = state.root.querySelector('.cvz-cs-progress-text');
      if (!progressEl) {
        stopProgressTicker();
        return;
      }
      var elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      var picked = pickTimedMessage(CVZ_CS_PROGRESS_MESSAGES, elapsedSec);
      var text = picked ? picked.text + ' …' : baseText;
      if (elapsedSec >= 20) text += ' (' + elapsedSec + 's)';
      progressEl.textContent = text;
    }
    tick();
    progressTickTimer = setInterval(tick, 1000);
  }

  function renderProcessing(topic) {
    clear(state.root);
    var startedAt = Date.now();
    var baseText = 'Baue Content-Cluster für "' + topic + '" …';
    // GEÄNDERT (siehe Chat-Verlauf, Lasse: "Das verstehen User nicht" zur alten
    // relativen Formulierung mit dem unsichtbaren Vergleichswert "ohne Prompt-Test") und
    // vereinfacht (siehe Chat-Verlauf, Checkbox entfernt): nur noch EIN, absoluter Hinweistext,
    // kein Vergleich mehr nötig, weil es nur noch den einen Fall (mit Prompt-Test) gibt.
    var box = el('div', { class: 'cvz-cs-processing' }, [
      el('div', { class: 'cvz-cs-spinner' }),
      el('p', { class: 'cvz-cs-progress-text' }, [baseText]),
      el('p', { class: 'cvz-cs-hint' }, ['Inkl. echtem GEO-Prompt-Test – komplette Läufe dauern aktuell meist 10–15 Minuten.']),
    ]);
    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(box);
    startProgressTicker(startedAt, baseText);
  }

  function renderError(message, body) {
    clear(state.root);
    var box = el('div', { class: 'cvz-cs-error' }, [el('p', {}, [message])]);
    if (body && typeof body.ppu_strategy_credits_remaining === 'number') {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Kein Strategie-Kontingent verfügbar. Bitte Plan upgraden oder ein Credit-Paket nachkaufen.']));
    }
    var retryBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn', onclick: renderApp }, ['Zurück zum Formular']);
    box.appendChild(retryBtn);
    state.root.appendChild(box);
  }

  // NEU (siehe Chat-Verlauf, Lasse: Content-Strategie-Sessions bekommen einen Status wie
  // Analysen/Aufbau-Sessions): eine Session kann jetzt existieren, OHNE dass result schon
  // gefüllt ist (status='in_progress', während der Agent noch läuft, oder status='error' nach
  // einem gescheiterten Lauf) - der Dashboard-Tab verlinkt bei solchen Zeilen zwar nicht mehr
  // hierher (siehe dashboard-v5.js, nur status='done'-Zeilen sind dort klickbar), aber ein
  // alter/direkter Link mit ?session_id=... auf eine noch laufende oder fehlgeschlagene Session
  // sollte trotzdem nicht mit einem rohen JS-Fehler enden (renderResult() würde auf result=null
  // sofort crashen), sondern einen verständlichen Hinweis zeigen.
  function renderPendingSession(session) {
    clear(state.root);
    var isError = session.status === 'error';
    var box = el('div', { class: isError ? 'cvz-cs-error' : 'cvz-cs-processing' }, [
      isError ? null : el('div', { class: 'cvz-cs-spinner' }),
      el('p', {}, [
        isError
          ? 'Diese Strategie-Erstellung ist fehlgeschlagen' + (session.error_message ? ': ' + session.error_message : '') + '.'
          : 'Diese Strategie wird noch erstellt - das kann 10-15 Minuten dauern. Bitte in ein paar Minuten erneut auf diesen Link klicken.',
      ]),
    ]);
    state.root.appendChild(box);
    var retryBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn', onclick: renderApp }, [isError ? 'Neue Strategie erstellen' : 'Zurück zum Formular']);
    state.root.appendChild(retryBtn);
  }

  function pageTypeLabel(type) {
    return PAGE_TYPE_LABELS[type] || type;
  }
  function roleLabel(role) {
    return ROLE_LABELS[role] || role;
  }

  // NEU (siehe Chat-Verlauf, "richtiger Bericht"): das Ergebnis wird jetzt als durchgehender,
  // nummerierter Bericht gerendert (Ausgangslage → Executive Summary → Content-Cluster-Strategie
  // → Ist-Zustand → GEO-Strategie) statt als lose Abfolge von Widget-Blöcken. Bewusst weiter im
  // selben Embed/DOM gerendert, kein separates Dokument - der spätere Word-Export (siehe
  // Chat-Verlauf: Agenturen sollen die Strategie herunterladen/verändern können) ist ein
  // eigenständiges, noch offenes Vorhaben, das dieselben result-Felder (ausgangslage,
  // executive_summary, ...) wiederverwenden kann, sobald es angegangen wird.
  // session (4. Parameter, optional): nur gesetzt, wenn eine BEREITS GESPEICHERTE Strategie über
  // loadExistingSession() angezeigt wird (liefert u.a. created_at fürs Berichts-Datum) - bei
  // einem frisch generierten Ergebnis (Aufruf aus pollStatus()) bleibt das undefined, dann gilt
  // wie bisher "heute" als Datum und fundedBy zeigt die Finanzierung dieses Laufs an.
  function renderResult(sessionId, result, fundedBy, session) {
    clear(state.root);

    var wrap = el('div', { class: 'cvz-cs-result cvz-cs-report' });

    wrap.appendChild(renderReportHeader(result, session));
    wrap.appendChild(renderReportSection(1, 'Ausgangslage', [renderProse(result.ausgangslage)]));
    wrap.appendChild(
      renderReportSection(2, 'Executive Summary', [el('div', { class: 'cvz-cs-executive-summary' }, [renderProse(result.executive_summary)])])
    );
    // REIHENFOLGE GEÄNDERT (siehe Chat-Verlauf, Lasse: "Ist-Zustand nach Executive Summary,
    // dann ist [Content-Cluster-Strategie] quasi der Soll-Zustand"): Ist-Zustand kommt jetzt
    // VOR der Content-Cluster-Strategie, die entsprechend als Soll-Zustand betitelt ist -
    // liest sich jetzt als Ausgangslage → Summary → Ist → Soll → GEO statt Ist irgendwo
    // nachgeschoben zwischen zwei Soll-Abschnitten.
    wrap.appendChild(renderReportSection(3, 'Ist-Zustand: wer rankt heute schon wofür?', [renderCurrentStateSection(result.current_state)]));
    wrap.appendChild(renderReportSection(4, 'Content-Cluster-Strategie (Soll-Zustand)', buildClusterSectionChildren(sessionId, result)));
    wrap.appendChild(renderReportSection(5, 'GEO-Strategie', [renderGeoSection(result.geo_strategy)]));
    // NEU (siehe Chat-Verlauf, Lasse: "Empfohlene Roadmap ... so wie wir es in der Analyse
    // machen, nur mit weniger Inhalt") - letzter inhaltlicher Abschnitt, priorisierte
    // Verdichtung der wichtigsten Punkte aus dem gesamten Report, keine neue Analyse.
    wrap.appendChild(renderReportSection(6, 'Empfohlene Roadmap', [renderRoadmapSection(result.roadmap)]));

    var fundingText = fundedBy
      ? 'Finanziert aus: ' + (fundedBy === 'ppu_strategy' ? 'Pay-per-Use-Credit' : 'Plan-Kontingent')
      : 'Gespeicherte Strategie';
    var footer = el('div', { class: 'cvz-cs-footer' }, [
      el('span', { class: 'cvz-cs-hint' }, [fundingText]),
      el('button', { type: 'button', class: 'cvz-cs-retry-btn', onclick: renderApp }, ['Neue Strategie erstellen']),
    ]);
    wrap.appendChild(footer);
    // GEÄNDERT (siehe Chat-Verlauf, Lasse: "nur derjenige, der die Struktur erstellt hat, sollte
    // chatten können, damit Nachrichten nicht mehrfach verbraucht werden") - der Chat ist jetzt
    // NUR für den Ersteller sichtbar, anders als der Report selbst (der bleibt teamweit
    // einsehbar). Ohne `session` (frisch generiertes Ergebnis direkt aus pollStatus()) ist der
    // aktuelle User IMMER der Ersteller - man kann keine fremde Generierung live mitverfolgen,
    // das gibt es in diesem Produkt nicht. MIT `session` (loadExistingSession, z.B. über den
    // teamweiten Dashboard-Tab geöffnet) wird explizit gegen session.user_id geprüft - das
    // Backend setzt dieselbe Einschränkung ohnehin hart durch (403), hier geht es nur darum,
    // Team-Mitgliedern gar nicht erst ein Eingabefeld zu zeigen, das für sie sowieso fehlschlägt.
    var isCreator = !session || session.user_id === state.userId;
    if (sessionId && isCreator) wrap.appendChild(renderChatSection(sessionId));

    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(wrap);
  }

  function renderReportHeader(result, session) {
    var header = el('div', { class: 'cvz-cs-report-header' });
    header.appendChild(el('p', { class: 'cvz-cs-report-eyebrow' }, ['Content-Strategie-Bericht']));
    header.appendChild(el('h2', { class: 'cvz-cs-report-title' }, [result.seed_topic]));
    var dateSource = (session && session.created_at) ? new Date(session.created_at) : new Date();
    var dateStr = dateSource.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
    header.appendChild(el('p', { class: 'cvz-cs-report-meta' }, ['Erstellt am ' + dateStr]));
    return header;
  }

  function renderReportSection(number, title, children) {
    var section = el('section', { class: 'cvz-cs-report-section' });
    section.appendChild(el('h3', { class: 'cvz-cs-report-section-title' }, [number + '. ' + title]));
    (children || []).forEach(function (child) {
      if (child) section.appendChild(child);
    });
    return section;
  }

  // Fließtext-Felder (ausgangslage/executive_summary) sind einfache Strings aus dem
  // Claude-Ergebnis - auf mögliche Absatz-Umbrüche (Leerzeile) prüfen, statt alles in einen
  // einzigen <p> zu quetschen.
  function renderProse(text) {
    var container = el('div', { class: 'cvz-cs-prose' });
    String(text || '')
      .split(/\n\s*\n/)
      .forEach(function (para) {
        if (para.trim()) container.appendChild(el('p', {}, [para.trim()]));
      });
    return container;
  }

  function buildClusterSectionChildren(sessionId, result) {
    var children = [];

    var volumeText =
      result.conversion_page.estimated_volume != null ? 'ca. ' + result.conversion_page.estimated_volume + ' Suchanfragen/Monat' : 'Suchvolumen unbekannt';
    var conversionCardChildren = [
      el('span', { class: 'cvz-cs-badge cvz-cs-badge-conversion' }, ['Conversion-Seite']),
      el('h4', {}, [result.conversion_page.topic]),
      el('p', { class: 'cvz-cs-hint' }, ['Keyword: ' + result.conversion_page.keyword + ' · ' + volumeText]),
    ];
    if (result.conversion_page.content_brief && result.conversion_page.content_brief.length > 0) {
      conversionCardChildren.push(renderContentBrief(result.conversion_page.content_brief));
    }
    conversionCardChildren.push(buildLandingpageButton(result.conversion_page.topic));
    children.push(el('div', { class: 'cvz-cs-conversion-card' }, conversionCardChildren));

    children.push(el('h5', {}, ['Unterstützende Seiten']));
    // FIX (siehe Chat-Verlauf, 2. Runde "Typ/Rolle/Volumen passt immer noch nicht"): eine
    // Tabelle mit fest schmalen Typ-/Rolle-Spalten (Versuch 1) lässt lange Badge-Texte wie
    // "THEMENABDECKUNG" trotzdem über die Zellgrenze hinaus überlappen, weil ein <span> nicht
    // automatisch innerhalb der Zellbreite umbricht. Statt die Spalten ein zweites Mal enger/
    // breiter zu justieren: komplett von einer starren Tabelle auf eine Karten-Liste
    // umgestellt - jede Seite ist jetzt eine eigene Karte, Badges stehen in einer
    // flex-wrap-Zeile und brechen bei Bedarf einfach in die nächste Zeile um, statt sich zu
    // überlappen. Passt außerdem besser zum "durchgehender Bericht statt Tabellen-Widget"-Stil
    // (siehe frühere Chat-Runde). NEU zusätzlich: Karten sind nach messy_middle_phase
    // gruppiert (siehe MESSY_MIDDLE_PHASES), damit die Journey-Abdeckung auf einen Blick
    // sichtbar ist - "um eine volle Abdeckung zu gewährleisten" (Lasse).
    var pagesByPhase = groupPagesByPhase(result.supporting_pages || []);
    MESSY_MIDDLE_PHASES.forEach(function (phase) {
      var pagesInPhase = pagesByPhase[phase.value];
      if (!pagesInPhase || pagesInPhase.length === 0) return;
      var group = el('div', { class: 'cvz-cs-phase-group' });
      group.appendChild(el('h6', { class: 'cvz-cs-phase-title' }, [phase.label]));
      group.appendChild(el('p', { class: 'cvz-cs-phase-desc' }, [phase.description]));
      pagesInPhase.forEach(function (entry) {
        group.appendChild(renderPageCard(sessionId, entry.page, entry.index));
      });
      children.push(group);
    });

    if (result.internal_links && result.internal_links.length > 0) {
      children.push(el('h5', {}, ['Interne Verlinkung']));
      var linkList = el('ul', { class: 'cvz-cs-link-list' });
      result.internal_links.forEach(function (link) {
        linkList.appendChild(el('li', {}, [describeLink(link, result)]));
      });
      children.push(linkList);
    }

    return children;
  }

  function describeLink(link, result) {
    var fromLabel = link.from_index === -1 ? result.conversion_page.topic : (result.supporting_pages[link.from_index] || {}).topic || ('#' + link.from_index);
    var toLabel = link.to_index === -1 ? result.conversion_page.topic : (result.supporting_pages[link.to_index] || {}).topic || ('#' + link.to_index);
    return fromLabel + ' → ' + toLabel + (link.anchor_text_idea ? ' ("' + link.anchor_text_idea + '")' : '');
  }

  // FIX (siehe Chat-Verlauf, ersetzt das frühere renderPageRow()/<tr>): eine Karte statt einer
  // starren Tabellenzeile - Badges stehen in einer flex-wrap-Zeile (siehe .cvz-cs-page-card-
  // badges) und brechen bei Bedarf um, statt sich bei schmalen Spalten zu überlappen.
  function renderPageCard(sessionId, page, index) {
    var card = el('div', { class: 'cvz-cs-page-card' });

    var badges = [
      el('span', { class: 'cvz-cs-badge' }, [pageTypeLabel(page.page_type)]),
      el('span', { class: 'cvz-cs-badge cvz-cs-badge-role-' + page.role }, [roleLabel(page.role)]),
    ];
    if (page.commodity_risk) {
      badges.push(el('span', { class: 'cvz-cs-badge cvz-cs-badge-commodity', title: page.commodity_reasoning || '' }, ['Commodity-Risiko']));
    }
    card.appendChild(el('div', { class: 'cvz-cs-page-card-badges' }, badges));

    card.appendChild(el('h4', { class: 'cvz-cs-page-card-topic' }, [page.topic]));

    var volumeText = page.estimated_volume != null ? 'ca. ' + page.estimated_volume + ' Suchanfragen/Monat' : 'Suchvolumen unbekannt';
    card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keyword: ' + page.keyword + ' · ' + volumeText]));

    // NEU (siehe Chat-Verlauf, Pillar-Pages erklären): generelle Typ-Erklärung VOR der
    // themenspezifischen Begründung, falls für diesen page_type vorhanden - "was ist das"
    // zuerst, dann "warum hier".
    if (PAGE_TYPE_EXPLANATIONS[page.page_type]) {
      card.appendChild(el('p', { class: 'cvz-cs-page-card-type-explanation' }, [PAGE_TYPE_EXPLANATIONS[page.page_type]]));
    }
    if (page.reasoning) {
      card.appendChild(el('p', { class: 'cvz-cs-page-card-reasoning' }, [page.reasoning]));
    }
    if (page.content_brief && page.content_brief.length > 0) {
      card.appendChild(renderContentBrief(page.content_brief));
    }
    if (page.commodity_risk && page.commodity_reasoning) {
      card.appendChild(el('p', { class: 'cvz-cs-commodity-note' }, ['Commodity-Hinweis: ' + page.commodity_reasoning]));
    }

    var statusSelect = el('select', { class: 'cvz-cs-status-select' });
    STATUS_OPTIONS.forEach(function (opt) {
      var optionEl = el('option', { value: opt.value }, [opt.label]);
      if (opt.value === page.status) optionEl.setAttribute('selected', 'selected');
      statusSelect.appendChild(optionEl);
    });
    statusSelect.addEventListener('change', function () {
      var previous = page.status;
      statusSelect.setAttribute('disabled', 'disabled');
      apiFetch('/api/content-strategy/' + sessionId + '/pages/' + index, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusSelect.value }),
      })
        .then(function () {
          page.status = statusSelect.value;
          statusSelect.removeAttribute('disabled');
        })
        .catch(function (err) {
          statusSelect.value = previous;
          statusSelect.removeAttribute('disabled');
          alert('Status konnte nicht gespeichert werden: ' + err.message);
        });
    });

    var footer = el('div', { class: 'cvz-cs-page-card-footer' }, [statusSelect]);
    if (page.page_type === 'conversion_landingpage') {
      footer.appendChild(buildLandingpageButton(page.topic));
    }
    card.appendChild(footer);

    return card;
  }

  // NEU (siehe Chat-Verlauf, Strategie-Tiefe v2): Content-Brief als Stichpunkt-Liste statt
  // Fließtext - direkt für die conversion_page-Karte UND jede supporting_page-Zeile nutzbar.
  function renderContentBrief(brief) {
    var box = el('div', { class: 'cvz-cs-brief' });
    box.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Content-Brief:']));
    var list = el('ul', { class: 'cvz-cs-brief-list' });
    brief.forEach(function (item) {
      list.appendChild(el('li', {}, [item]));
    });
    box.appendChild(list);
    return box;
  }

  // NEU: Ist-Zustand-Abschnitt (welche Seiten ranken schon für welche Keywords). Zeigt explizit
  // die Datenquelle (current_state.note) an, damit eine Schätzung nie wie ein Fakt wirkt (siehe
  // Chat-Verlauf/Schema-Kommentar zu CurrentStateSchema).
  function renderCurrentStateSection(currentState) {
    var box = el('div', { class: 'cvz-cs-current-state' });
    if (!currentState) return box;

    box.appendChild(el('p', { class: 'cvz-cs-hint' }, [currentState.note || '']));

    if (!currentState.rows || currentState.rows.length === 0) {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine bestehenden Rankings gefunden.']));
      return box;
    }

    var isEstimate = currentState.source !== 'google_search_console';
    var table = el('table', { class: 'cvz-cs-table cvz-cs-current-state-table' });
    table.appendChild(
      el('thead', {}, [
        el('tr', {}, [
          el('th', {}, ['Seite']),
          el('th', {}, ['Keyword']),
          el('th', {}, ['Ø Position']),
          el('th', {}, ['CTR']),
          el('th', {}, ['Impressionen']),
          el('th', {}, ['Klicks']),
        ]),
      ])
    );
    var tbody = el('tbody');
    currentState.rows.forEach(function (row) {
      tbody.appendChild(
        el('tr', {}, [
          el('td', {}, [row.page_url]),
          el('td', {}, [row.query]),
          el('td', {}, [row.avg_position != null ? row.avg_position.toFixed(1) : '-']),
          el('td', {}, [row.ctr != null ? (row.ctr * 100).toFixed(1) + '%' : (isEstimate ? 'k.A.' : '-')]),
          el('td', {}, [row.impressions != null ? String(row.impressions) : (isEstimate ? 'k.A.' : '-')]),
          el('td', {}, [row.clicks != null ? String(row.clicks) : (isEstimate ? 'k.A.' : '-')]),
        ])
      );
    });
    table.appendChild(tbody);
    box.appendChild(el('div', { class: 'cvz-cs-table-wrap' }, [table]));
    return box;
  }

  // FIX (siehe Chat-Verlauf): Button feuerte bisher nur ein CustomEvent
  // ('cvz:build-landingpage'), auf das nirgends im Projekt jemand hört - der
  // Klick passierte optisch, aber es geschah schlicht nichts, was sich wie
  // "nicht klickbar" anfühlt. Navigiert jetzt direkt zum Landingpage-
  // Assistenten (?new=1, gleiches Muster wie CONFIG.NEW_LANDINGPAGE_URL in
  // dashboard-v5.js). Das Ziel-Keyword wird als ?topic=... mitgegeben, falls
  // der Assistent das später mal vorbelegt - aktuell (siehe TODO in
  // pageAgent.app.js) liest cvzTryResume() nur ?new=1/?project=, ?topic= wird
  // dort noch ignoriert, der Wizard startet also leer und der Nutzer trägt
  // das Thema einmal selbst ein. Kein Grund, deswegen NICHTS zu verlinken.
  function buildLandingpageButton(topic) {
    var href = CONFIG.landingpageAssistantUrl + '?new=1&topic=' + encodeURIComponent(topic);
    return el('a', { class: 'cvz-cs-build-btn', href: href }, ['Jetzt mit dem Landingpage-Tool bauen']);
  }

  function renderGeoSection(geo) {
    if (!geo) return el('div');
    var box = el('div', { class: 'cvz-cs-geo' });

    // Zitier-Strategie-Hinweis ZUERST (siehe Chat-Verlauf: das ist die eigentliche Antwort auf
    // "was für Content hat Zitier-Chancen", nicht nur eine Portale-Liste) - dafür in einer
    // hervorgehobenen Box statt als weiterer Listenpunkt.
    if (geo.citation_strategy_note) {
      box.appendChild(el('div', { class: 'cvz-cs-citation-note' }, [geo.citation_strategy_note]));
    }

    // Google AI Overview - konkret MIT Links, siehe Schema-Kommentar zu AiOverviewSchema.
    var aio = geo.ai_overview;
    if (aio) {
      var aioBox = el('div', { class: 'cvz-cs-aio' });
      if (!aio.present) {
        aioBox.appendChild(el('h5', {}, ['Google AI Overview']));
        aioBox.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Kein AI Overview für dieses Thema vorhanden.']));
      } else if (!aio.references || aio.references.length === 0) {
        aioBox.appendChild(el('h5', {}, ['Google AI Overview']));
        aioBox.appendChild(
          el('p', { class: 'cvz-cs-gsc-hint' }, ['AI Overview vorhanden, aber ohne zitierte Quellen-Links - Hinweis auf Commodity-Charakter dieses Themas.'])
        );
      } else {
        aioBox.appendChild(
          el('h5', {}, ['Google AI Overview' + (aio.own_domain_cited ? ' (eigene Domain wird bereits zitiert)' : ' - zitiert, eigene Domain fehlt noch')])
        );
        var aioList = el('ul', {});
        aio.references.forEach(function (r) {
          aioList.appendChild(
            el('li', {}, [el('a', { href: r.url, target: '_blank', rel: 'noopener' }, [r.domain]), r.title ? ' – "' + r.title + '"' : ''])
          );
        });
        aioBox.appendChild(aioList);
      }
      box.appendChild(aioBox);
    }

    // Top-SEO-Ergebnisse zum Abgleich
    if (geo.top_serp_results && geo.top_serp_results.length > 0) {
      box.appendChild(el('h5', {}, ['Top-SEO-Ergebnisse (organisch)']));
      var serpList = el('ul', {});
      geo.top_serp_results.forEach(function (r) {
        serpList.appendChild(
          el('li', {}, [r.position + '. ', el('a', { href: r.url, target: '_blank', rel: 'noopener' }, [r.domain])])
        );
      });
      box.appendChild(serpList);
    }

    // Wettbewerber-Content-Struktur
    if (geo.competitor_content_notes && geo.competitor_content_notes.length > 0) {
      box.appendChild(el('h5', {}, ['Was Wettbewerber-Seiten konkret enthalten']));
      var compList = el('ul', {});
      geo.competitor_content_notes.forEach(function (c) {
        compList.appendChild(
          el('li', {}, [el('a', { href: c.url, target: '_blank', rel: 'noopener' }, [c.domain]), ': ' + c.structure_summary])
        );
      });
      box.appendChild(compList);
    }

    // Bestehende Portale-Liste (DataForSEO llm_mentions, ChatGPT-Aggregat) - bewusst erhalten,
    // aber jetzt als ein Baustein unter mehreren statt der einzige GEO-Inhalt (siehe Chat-Verlauf).
    box.appendChild(
      el('h5', {}, ['Bereits zitierte Portale (LLM-Erwähnungen allgemein)' + (geo.own_domain_already_cited ? ' - eigene Domain bereits darunter' : '')])
    );
    if (geo.top_portals && geo.top_portals.length > 0) {
      var list = el('ul', {});
      geo.top_portals.forEach(function (p) {
        list.appendChild(el('li', {}, [p.domain + (p.mention_count ? ' (' + p.mention_count + 'x)' : '') + (p.note ? ' - ' + p.note : '')]));
      });
      box.appendChild(list);
    } else {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine zitierten Portale gefunden oder Daten nicht verfügbar.']));
    }

    if (geo.prompt_tests && geo.prompt_tests.length > 0) {
      box.appendChild(el('h5', {}, ['Prompt-Test-Ergebnisse']));
      var ptList = el('ul', {});
      geo.prompt_tests.forEach(function (r) {
        ptList.appendChild(
          el('li', {}, [
            '"' + r.prompt + '": eigene Domain zitiert: ' + (r.own_domain_cited ? 'ja' : 'nein') + ' · zitierte Domains: ' + (r.cited_domains || []).join(', '),
          ])
        );
      });
      box.appendChild(ptList);
    }
    return box;
  }

  // NEU (siehe Chat-Verlauf, Lasse: "Empfohlene Roadmap ... so wie wir es in der Analyse machen,
  // nur mit weniger Inhalt") - gleiche 4 Aufwand/Impact-Buckets wie im Analyse-Tool
  // (roadmap_matrix), hier bewusst nur mit einem kurzen Titel + einem Begründungssatz pro
  // Punkt (kein category/effort/impact/cross_category je Punkt - die Bucket-Zugehörigkeit
  // codiert das schon, siehe Schema-Kommentar zu ContentRoadmapSchema).
  var ROADMAP_BUCKETS = [
    { key: 'sofort_umsetzen', label: 'Sofort umsetzen', badgeClass: 'cvz-cs-badge-roadmap-urgent' },
    { key: 'quick_wins', label: 'Quick Wins', badgeClass: 'cvz-cs-badge-roadmap-quick' },
    { key: 'als_naechstes', label: 'Als Nächstes', badgeClass: 'cvz-cs-badge-roadmap-next' },
    { key: 'spaeter', label: 'Später', badgeClass: 'cvz-cs-badge-roadmap-later' },
  ];

  function renderRoadmapSection(roadmap) {
    var box = el('div', { class: 'cvz-cs-roadmap' });
    if (!roadmap) return box;

    // Leere Buckets sind laut Schema erlaubt (z.B. "spaeter" bei einem kleinen Cluster) - werden
    // hier einfach übersprungen statt als leere Gruppe angezeigt zu werden.
    var hasAnyItem = ROADMAP_BUCKETS.some(function (b) { return roadmap[b.key] && roadmap[b.key].length > 0; });
    if (!hasAnyItem) {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine priorisierten Punkte für diesen Cluster.']));
      return box;
    }

    ROADMAP_BUCKETS.forEach(function (bucket) {
      var items = roadmap[bucket.key];
      if (!items || items.length === 0) return;
      var group = el('div', { class: 'cvz-cs-roadmap-group' });
      group.appendChild(el('span', { class: 'cvz-cs-badge ' + bucket.badgeClass }, [bucket.label]));
      var list = el('ul', { class: 'cvz-cs-roadmap-list' });
      items.forEach(function (item) {
        list.appendChild(
          el('li', { class: 'cvz-cs-roadmap-item' }, [
            el('p', { class: 'cvz-cs-roadmap-item-title' }, [item.titel]),
            el('p', { class: 'cvz-cs-roadmap-item-reason' }, [item.begruendung]),
          ])
        );
      });
      group.appendChild(list);
      box.appendChild(group);
    });

    return box;
  }

  // ==================== REPORT-CHAT ====================
  // NEU (siehe Chat-Verlauf, Lasse: "KI-Agent, der Fragen des Users zu dem Report beantworten
  // kann") - eigener Abschnitt am Ende des Reports, lädt vorhandenen Verlauf beim Öffnen und
  // pollt wie die Report-Generierung selbst (siehe Begründung bei CONFIG.chatPollIntervalMs/
  // CONFIG.chatPollTimeoutMs, gleicher Reverse-Proxy-Grund wie beim Haupt-Lauf).
  //
  // Chat-Optik + Markdown-Rendering bewusst an das bestehende Chat-Fenster des Landingpage-
  // Assistenten angelehnt (siehe Chat-Verlauf, Lasse: "kannst du dich beim Chat eher hieran
  // orientieren?") - gleiche Bubble-Form, gleiches "marked"-basiertes Markdown-Rendering mit
  // Tabellen-Karten-Fallback auf Mobilgeräten (cvzCsLabelTablesForCards()), nur mit eigenem
  // "cvz-cs-"-Klassen-Namespace. WICHTIG: setzt voraus, dass "marked" (https://marked.js.org/)
  // als globales Script auf der Webflow-Seite geladen ist - genau wie beim Landingpage-
  // Assistenten (<script src="…/marked.min.js"></script> im Custom Code). Ist "marked" NICHT
  // geladen, greift dieselbe defensive Ausweich-Logik wie dort: die Antwort wird als reiner
  // Text statt als gerendertes Markdown angezeigt (kein Absturz, nur weniger schön) - genau der
  // vorher gemeldete Bug ("# Überschrift" erschien wörtlich mit Raute statt gerendert), nur
  // jetzt als bewusster Fallback statt als Dauerzustand.

  function stopChatPolling() {
    if (state.chat.pollHandle) {
      clearTimeout(state.chat.pollHandle);
      state.chat.pollHandle = null;
    }
  }

  // Kopiert die <thead>-Überschriften als data-label auf jede <td>-Zelle einer Markdown-Tabelle
  // in einer Chat-Antwort. Das CSS blendet ab <=640px den Header aus und zeigt das Label über
  // dem jeweiligen Wert - aus einer Zeile wird eine Karte. 1:1 dieselbe Technik wie
  // cvzLabelTablesForCards() im Landingpage-Assistenten, nur mit "cvz-cs-"-Klassen.
  function cvzCsLabelTablesForCards(container) {
    var tables = container.querySelectorAll('table:not([data-cvz-cs-labeled])');
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
      table.classList.add('cvz-cs-table-cards');
      table.setAttribute('data-cvz-cs-labeled', '1');
    }
  }

  function renderChatMessageBubble(message) {
    var bubble = el('div', { class: 'cvz-cs-chat-msg cvz-cs-chat-msg-' + message.role });
    // Nur Assistant-Antworten werden als Markdown gerendert (# Überschriften, Tabellen, Listen
    // etc.) - User-Fragen bleiben bewusst reiner Text (kein Grund, eigene Eingaben als
    // Markdown zu interpretieren, und textContent ist automatisch XSS-sicher).
    if (message.role === 'assistant' && typeof marked !== 'undefined') {
      bubble.innerHTML = marked.parse(message.content);
      cvzCsLabelTablesForCards(bubble);
    } else {
      bubble.textContent = message.content;
    }
    return bubble;
  }

  // Baut NUR die Nachrichtenliste + den Zähler neu auf (nicht das ganze Formular drumherum) -
  // wird bei jedem neuen Verlaufs-Stand aufgerufen (nach dem Laden, während des Sendens für die
  // optimistische Anzeige, UND nach jeder neuen Antwort), ohne das Eingabefeld/den Fokus zu
  // verlieren.
  function refreshChatMessagesView() {
    var listEl = state.root.querySelector('.cvz-cs-chat-messages');
    var counterEl = state.root.querySelector('.cvz-cs-chat-counter');
    if (listEl) {
      clear(listEl);
      if (state.chat.messages.length === 0 && !state.chat.sending) {
        listEl.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Noch keine Fragen gestellt - frag zum Beispiel, warum eine bestimmte Seite empfohlen wurde.']));
      } else {
        state.chat.messages.forEach(function (m) { listEl.appendChild(renderChatMessageBubble(m)); });
        // Optimistische Anzeige während eine Antwort läuft: eigene Frage sofort sichtbar (noch
        // nicht im gespeicherten Verlauf - wird erst bei Erfolg persistiert, siehe
        // pollChatStatus) + Ladeblase mit Spinner, statt dass der Chat bis zur fertigen Antwort
        // einfach nichts tut.
        if (state.chat.sending && state.chat._pendingUserMessage) {
          listEl.appendChild(renderChatMessageBubble({ role: 'user', content: state.chat._pendingUserMessage }));
          var loadingBubble = el('div', { class: 'cvz-cs-chat-msg cvz-cs-chat-msg-assistant cvz-cs-chat-msg-loading' });
          loadingBubble.innerHTML = '<span class="cvz-cs-chat-spinner-inline"></span><span>Denkt nach ...</span>';
          listEl.appendChild(loadingBubble);
        }
        listEl.scrollTop = listEl.scrollHeight;
      }
    }
    if (counterEl) {
      counterEl.textContent = state.chat.messagesUsed + ' / ' + state.chat.messagesLimit + ' Fragen gestellt';
    }
    var limitReached = state.chat.messagesUsed >= state.chat.messagesLimit;
    var formEl = state.root.querySelector('.cvz-cs-chat-form');
    var limitNoticeEl = state.root.querySelector('.cvz-cs-chat-limit-notice');
    if (formEl) formEl.style.display = limitReached ? 'none' : '';
    if (limitNoticeEl) limitNoticeEl.style.display = limitReached ? '' : 'none';
  }

  function loadChatHistory(sessionId) {
    return apiFetch('/api/content-strategy/' + encodeURIComponent(sessionId) + '/chat')
      .then(function (data) {
        state.chat.sessionId = sessionId;
        state.chat.messages = data.messages || [];
        state.chat.messagesUsed = data.messages_used || 0;
        state.chat.messagesLimit = data.messages_limit || state.chat.messagesLimit;
        refreshChatMessagesView();
      })
      .catch(function (err) {
        // Nicht fatal für den Rest des Reports - der Report selbst bleibt lesbar, nur der
        // Chat-Verlauf fehlt dann eben (z.B. bei einem kurzen API-Hänger beim Laden).
        console.warn('Chat-Verlauf konnte nicht geladen werden:', err.message);
      });
  }

  function pollChatStatus(turnId) {
    state.chat.pollStartedAt = Date.now();
    function tick() {
      if (Date.now() - state.chat.pollStartedAt > CONFIG.chatPollTimeoutMs) {
        finishChatSending('Zeitüberschreitung - die Antwort läuft ungewöhnlich lange. Bitte gleich nochmal versuchen.');
        return;
      }
      apiFetch('/api/content-strategy/chat/status/' + turnId)
        .then(function (job) {
          if (job.status === 'processing') {
            state.chat.pollHandle = setTimeout(tick, CONFIG.chatPollIntervalMs);
            return;
          }
          if (job.status === 'error') {
            finishChatSending('Antwort fehlgeschlagen: ' + job.error);
            return;
          }
          // job.status === 'done'
          state.chat.messages.push({ role: 'user', content: state.chat._pendingUserMessage });
          state.chat.messages.push({ role: 'assistant', content: job.reply });
          state.chat.messagesUsed = job.messages_used;
          state.chat.messagesLimit = job.messages_limit;
          finishChatSending(null);
        })
        .catch(function (err) {
          finishChatSending('Antwort konnte nicht abgerufen werden: ' + err.message);
        });
    }
    tick();
  }

  function finishChatSending(errorMessage) {
    stopChatPolling();
    state.chat.sending = false;
    state.chat._pendingUserMessage = null;
    var statusEl = state.root.querySelector('.cvz-cs-chat-status');
    if (statusEl) statusEl.textContent = errorMessage || '';
    var sendBtn = state.root.querySelector('.cvz-cs-chat-send-btn');
    var inputEl = state.root.querySelector('.cvz-cs-chat-input');
    if (sendBtn) sendBtn.removeAttribute('disabled');
    if (inputEl) inputEl.removeAttribute('disabled');
    refreshChatMessagesView();
  }

  function sendChatMessage(sessionId, text) {
    if (state.chat.sending) return; // Doppel-Klick-Schutz
    state.chat.sending = true;
    state.chat._pendingUserMessage = text;
    var sendBtn = state.root.querySelector('.cvz-cs-chat-send-btn');
    var inputEl = state.root.querySelector('.cvz-cs-chat-input');
    if (sendBtn) sendBtn.setAttribute('disabled', 'disabled');
    if (inputEl) inputEl.setAttribute('disabled', 'disabled');
    var statusEl = state.root.querySelector('.cvz-cs-chat-status');
    if (statusEl) statusEl.textContent = '';
    refreshChatMessagesView(); // zeigt sofort die eigene Frage + Ladeblase mit Spinner

    apiFetch('/api/content-strategy/' + encodeURIComponent(sessionId) + '/chat', {
      method: 'POST',
      body: JSON.stringify({ message: text }),
    })
      .then(function (res) {
        pollChatStatus(res.turn_id);
      })
      .catch(function (err) {
        var msg = 'Frage konnte nicht gesendet werden: ' + err.message;
        if (err.status === 402 && err.body) {
          state.chat.messagesUsed = err.body.messages_used;
          state.chat.messagesLimit = err.body.messages_limit;
          msg = 'Frage-Kontingent für diesen Report erreicht (' + err.body.messages_used + '/' + err.body.messages_limit + ').';
        }
        finishChatSending(msg);
      });
  }

  function renderChatSection(sessionId) {
    var section = el('div', { class: 'cvz-cs-chat' });
    section.appendChild(el('h4', { class: 'cvz-cs-chat-title' }, ['Fragen zum Report']));
    section.appendChild(
      el('p', { class: 'cvz-cs-hint' }, [
        'Der Agent kennt diesen Report und kann bei Bedarf auch neue Daten live nachschlagen (kein erneuter GEO-Prompt-Test).',
      ])
    );
    section.appendChild(el('div', { class: 'cvz-cs-chat-messages' }, []));

    // Textarea statt einzeiligem Input (wie beim Landingpage-Assistenten) - Enter sendet,
    // Shift+Enter fügt einen Zeilenumbruch ein, damit auch mehrzeilige Fragen bequem gehen.
    var inputEl = el('textarea', {
      class: 'cvz-cs-chat-input',
      placeholder: 'z.B. "Warum diese Seite und nicht X?"',
      maxlength: '2000',
      rows: '1',
    });
    var sendBtn = el('button', { type: 'submit', class: 'cvz-cs-chat-send-btn' }, ['Fragen']);
    var inputRow = el('div', { class: 'cvz-cs-chat-input-row' }, [inputEl, sendBtn]);
    var form = el('form', { class: 'cvz-cs-chat-form' }, [inputRow]);
    function trySend() {
      var text = inputEl.value.trim();
      if (!text || state.chat.sending) return;
      inputEl.value = '';
      sendChatMessage(sessionId, text);
    }
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      trySend();
    });
    inputEl.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        trySend();
      }
    });
    section.appendChild(form);
    section.appendChild(el('p', { class: 'cvz-cs-chat-status', 'aria-live': 'polite' }, ['']));

    section.appendChild(
      el('p', { class: 'cvz-cs-chat-limit-notice cvz-cs-hint', style: 'display:none' }, [
        'Frage-Kontingent für diesen Report erreicht - für weitere Fragen bitte eine neue Strategie erstellen.',
      ])
    );
    section.appendChild(el('p', { class: 'cvz-cs-chat-counter cvz-cs-hint' }, ['']));

    // Verlauf erst NACH dem Einhängen ins DOM laden - refreshChatMessagesView() braucht die
    // .cvz-cs-chat-messages/-counter-Elemente bereits im state.root.
    loadChatHistory(sessionId);

    return section;
  }

  // ==================== APP-LEBENSZYKLUS ====================

  function getParam(key) {
    return new URLSearchParams(window.location.search).get(key);
  }

  function renderApp() {
    clear(state.root);
    var loading = el('p', { class: 'cvz-cs-hint' }, ['Lade Kontingent ...']);
    state.root.appendChild(loading);

    Promise.all([loadQuota(), loadGscStatus()])
      .then(function () {
        clear(state.root);
        state.root.appendChild(renderQuotaBanner());
        state.root.appendChild(renderForm());
      })
      .catch(function (err) {
        renderError('Konnte nicht geladen werden: ' + err.message);
      });
  }

  // NEU (siehe Chat-Verlauf, Dashboard-Konsolidierung): das Dashboard verlinkt auf eine bereits
  // gespeicherte Strategie per ?session_id=<uuid> - vorher konnte diese Seite ausschliesslich das
  // Formular für eine NEUE Strategie zeigen, es gab keinen Weg, eine vergangene erneut
  // anzuzeigen. Nutzt den bestehenden GET /:id-Endpunkt (liefert die komplette Session inkl.
  // result), lädt Kontingent/GSC-Status genau wie renderApp() (renderQuotaBanner() greift in
  // renderResult() darauf zu), dann direkt renderResult() statt des Formulars.
  function loadExistingSession(sessionId) {
    clear(state.root);
    state.root.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Lade gespeicherte Strategie ...']));

    Promise.all([loadQuota(), loadGscStatus()])
      .then(function () {
        return apiFetch('/api/content-strategy/' + encodeURIComponent(sessionId));
      })
      .then(function (session) {
        if (!session.result) {
          renderPendingSession(session);
          return;
        }
        state.currentSessionId = session.id;
        state.currentResult = session.result;
        renderResult(session.id, session.result, null, session);
      })
      .catch(function (err) {
        if (err.status === 403) {
          renderError('Kein Zugriff auf diese Strategie.');
        } else if (err.status === 404) {
          renderError('Diese Strategie wurde nicht gefunden (evtl. gelöscht).');
        } else {
          renderError('Strategie konnte nicht geladen werden: ' + err.message);
        }
      });
  }

  function init() {
    var root = document.getElementById(CONFIG.containerId);
    if (!root) {
      console.error('cvz-content-strategy-agent: Container #' + CONFIG.containerId + ' nicht gefunden.');
      return;
    }
    state.root = root;
    clear(root);
    root.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Lade ...']));

    var requestedSessionId = getParam('session_id');

    resolveIdentity()
      .then(function () {
        return requestedSessionId ? loadExistingSession(requestedSessionId) : renderApp();
      })
      .catch(function (err) {
        if (err.code === 'not_logged_in') {
          clear(root);
          root.appendChild(el('p', {}, ['Bitte zuerst einloggen, um eine Content-Strategie zu erstellen.']));
          return;
        }
        clear(root);
        root.appendChild(el('p', { class: 'cvz-cs-error' }, ['Fehler beim Laden: ' + err.message]));
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
