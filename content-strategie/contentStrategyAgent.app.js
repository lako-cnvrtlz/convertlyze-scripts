(function () {
  'use strict';
  // ==================== KONFIGURATION ====================
  var DEFAULT_CONFIG = {
    apiBaseUrl: 'https://YOUR-API-DOMAIN.example',
    containerId: 'cvz-content-strategy-agent',
    settingsUrl: '/member/einstellungen#integrationen',
    landingpageAssistantUrl: '/member/landingpage-assistant',
    // NEU: Aufbau-Tool für Pillar Pages. Standard ist derselbe Assistent mit page_type=pillar (die API kennt den Seitentyp "pillar").
    // Liegt das Pillar-Tool unter einer eigenen Adresse, hier per window.CVZ_CONTENT_STRATEGY_CONFIG überschreiben.
    pillarAssistantUrl: '/member/landingpage-assistant',
    pollIntervalMs: 3000,
    pollTimeoutMs: 42 * 60 * 1000, // muss über BACKGROUND_TURN_TIMEOUT_MS (40 Min) im Backend liegen
    chatPollIntervalMs: 1500,
    chatPollTimeoutMs: 2 * 60 * 1000,
  };
  var CONFIG = Object.assign({}, DEFAULT_CONFIG, window.CVZ_CONTENT_STRATEGY_CONFIG || {});

  var MARKED_CDN_URL = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  var markedLoadStarted = false;

  // ==================== STYLES (Convertlyze Design v2) ====================
  // Syne für Headlines, Geist für Body-Text, border-radius: 0 überall.
  // Wird einmalig in <head> eingespritzt (idempotent). Farb-Tokens als CSS Custom
  // Properties auf #cvz-content-strategy-agent – lassen sich von außen überschreiben:
  //   #cvz-content-strategy-agent { --cvz-dark: #YourBrand; --cvz-blue: #YourAccent; }
  function injectStyles() {
    if (document.getElementById('cvz-cs-styles')) return;

    // Syne + Geist von Google Fonts (Geist ist seit 2024 dort verfügbar)
    if (!document.getElementById('cvz-cs-fonts')) {
      var fontLink = document.createElement('link');
      fontLink.id = 'cvz-cs-fonts';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Syne:wght@500;600;700;800&display=swap';
      document.head.appendChild(fontLink);
    }

    var css = [
      /* ---- Reset & Tokens (DARK THEME) ---- */
      /* Webflow-Wrapper-Reset: Elternelement des Embeds bekommt keine runden Ecken */
      '#cvz-content-strategy-agent,#cvz-content-strategy-agent *{border-radius:0 !important;}',
      /* Ausnahme: Spinner bleibt rund. BUGFIX: braucht dieselbe ID davor wie die
         Reset-Regel direkt darüber. Sonst gewinnt bei zwei !important-Regeln die
         spezifischere (die mit ID), und der Spinner war eckig. */
      '#cvz-content-strategy-agent .cvz-cs-spinner,#cvz-content-strategy-agent .cvz-cs-chat-spinner-inline{border-radius:50% !important;}',

      '#cvz-content-strategy-agent{',
        '--cvz-bg:#0d1117;--cvz-surface:rgba(255,255,255,.04);',
        '--cvz-surface-hover:rgba(255,255,255,.07);',
        '--cvz-border:rgba(255,255,255,.08);--cvz-border-strong:rgba(255,255,255,.16);',
        '--cvz-text:#e2e8f0;--cvz-muted:#6e7681;--cvz-heading:#f0f4f8;',
        '--cvz-teal:#4fd1c5;--cvz-teal-hover:#38b2ac;',
        '--cvz-red:#ef4444;--cvz-amber:#f59e0b;--cvz-blue:#3b82f6;',
        'background:var(--cvz-bg);color:var(--cvz-text);',
        'font-family:"Geist","Inter",system-ui,-apple-system,sans-serif;',
        'font-size:15px;line-height:1.65;padding:24px;',
        'border-radius:0 !important;',
      '}',
      '#cvz-content-strategy-agent *,',
      '#cvz-content-strategy-agent *::before,',
      '#cvz-content-strategy-agent *::after{box-sizing:border-box;}',

      /* ---- Headlines: Syne ---- */
      '#cvz-content-strategy-agent h2,',
      '#cvz-content-strategy-agent h3,',
      '#cvz-content-strategy-agent h4,',
      '#cvz-content-strategy-agent h5,',
      '#cvz-content-strategy-agent h6{',
        'font-family:"Syne",sans-serif;font-weight:700;',
        'line-height:1.2;color:var(--cvz-heading);margin:0 0 .6em;',
      '}',
      '#cvz-content-strategy-agent h2{font-size:1.75rem;}',
      '#cvz-content-strategy-agent h3{font-size:1.3rem;}',
      '#cvz-content-strategy-agent h4{font-size:1.05rem;}',
      '#cvz-content-strategy-agent h5{font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;}',
      '#cvz-content-strategy-agent h6{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--cvz-muted);}',
      '#cvz-content-strategy-agent p{margin:0 0 .75em;}',
      '#cvz-content-strategy-agent ul,#cvz-content-strategy-agent ol{padding-left:1.25em;margin:0 0 .75em;}',
      '#cvz-content-strategy-agent li{margin-bottom:.3em;}',
      '#cvz-content-strategy-agent a{color:var(--cvz-teal);}',
      '#cvz-content-strategy-agent a:hover{text-decoration:underline;}',

      /* ---- Hint ---- */
      '.cvz-cs-hint{font-size:13px;color:var(--cvz-muted);margin:.2em 0;}',

      /* ---- Banner ---- */
      '.cvz-cs-banner{display:flex;flex-wrap:wrap;align-items:center;gap:12px;',
        'padding:10px 14px;background:var(--cvz-surface);border:1px solid var(--cvz-border);',
        'font-size:13px;margin-bottom:20px;}',
      '.cvz-cs-quota{color:var(--cvz-text);}',
      '.cvz-cs-quota-empty{color:#ef4444;font-weight:600;}',
      '.cvz-cs-gsc-connected{color:var(--cvz-teal);}',
      '.cvz-cs-gsc-hint{color:var(--cvz-amber);}',
      '.cvz-cs-gsc-hint a{color:var(--cvz-amber);text-decoration:underline;}',

      /* ---- Form ---- */
      '.cvz-cs-form{display:flex;flex-direction:column;gap:18px;max-width:580px;}',
      '.cvz-cs-label{display:flex;flex-direction:column;gap:5px;font-size:14px;font-weight:500;color:var(--cvz-text);}',
      '#cvz-content-strategy-agent input[type="text"],',
      '#cvz-content-strategy-agent select,',
      '#cvz-content-strategy-agent textarea{',
        'padding:9px 11px;border:1px solid var(--cvz-border);border-radius:0;',
        'font-family:"Geist","Inter",system-ui,sans-serif;font-size:14px;',
        'color:var(--cvz-text);background:rgba(255,255,255,.04);',
        'transition:border-color .15s;outline:none;width:100%;',
      '}',
      '#cvz-content-strategy-agent input[type="text"]:focus,',
      '#cvz-content-strategy-agent select:focus,',
      '#cvz-content-strategy-agent textarea:focus{border-color:var(--cvz-teal);}',
      '#cvz-content-strategy-agent select option{background:#1a2233;color:var(--cvz-text);}',
      // NEU: Gruppen-Überschriften im Dropdown (Angebotstyp). Ohne Regel zeichnet der Browser sie weiß auf hellem Grund, kaum lesbar.
      // Dunkler als die Einträge, damit sie als Überschrift erkennbar sind, mit ausreichendem Kontrast.
      '#cvz-content-strategy-agent select optgroup{background:#0f1521;color:#9aa7b8;font-style:normal;font-weight:700;}',

      /* ---- Buttons ---- */
      '#cvz-content-strategy-agent button.cvz-cs-submit-btn,',
      '#cvz-content-strategy-agent .cvz-cs-submit-btn{',
        'display:inline-flex;align-items:center;justify-content:center;',
        'padding:12px 26px;background:var(--cvz-teal);color:#0d1117;',
        'border:2px solid var(--cvz-teal);border-radius:0;',
        'font-family:"Syne",sans-serif;font-size:14px;font-weight:700;',
        'letter-spacing:.04em;cursor:pointer;width:100%;',
        'transition:background .15s,border-color .15s;text-decoration:none;line-height:1;',
      '}',
      '#cvz-content-strategy-agent button.cvz-cs-submit-btn:hover:not(:disabled)',
      '{background:var(--cvz-teal-hover);border-color:var(--cvz-teal-hover);}',
      '#cvz-content-strategy-agent button.cvz-cs-submit-btn:disabled{opacity:.4;cursor:not-allowed;}',

      '#cvz-content-strategy-agent button.cvz-cs-retry-btn,',
      '#cvz-content-strategy-agent .cvz-cs-retry-btn{',
        'display:inline-flex;align-items:center;justify-content:center;',
        'padding:8px 18px;background:transparent;color:var(--cvz-text);',
        'border:1px solid var(--cvz-border-strong);border-radius:0;',
        'font-family:"Syne",sans-serif;font-size:13px;font-weight:600;',
        'letter-spacing:.025em;cursor:pointer;',
        'transition:border-color .15s,color .15s;text-decoration:none;line-height:1;',
      '}',
      '#cvz-content-strategy-agent button.cvz-cs-retry-btn:hover,',
      '#cvz-content-strategy-agent .cvz-cs-retry-btn:hover',
      '{border-color:var(--cvz-teal);color:var(--cvz-teal);}',

      '.cvz-cs-export-btn{',
        'display:inline-flex;align-items:center;justify-content:center;',
        'padding:8px 16px;background:transparent;color:var(--cvz-text);',
        'border:1px solid var(--cvz-border-strong);border-radius:0;',
        'font-family:"Syne",sans-serif;font-size:13px;font-weight:600;',
        'cursor:pointer;transition:border-color .15s,color .15s;',
        'white-space:nowrap;line-height:1;',
      '}',
      '.cvz-cs-export-btn:hover:not(:disabled){border-color:var(--cvz-teal);color:var(--cvz-teal);}',
      '.cvz-cs-export-btn:disabled{opacity:.45;cursor:wait;}',

      '.cvz-cs-build-btn{',
        'display:inline-flex;align-items:center;justify-content:center;',
        'padding:8px 16px;background:var(--cvz-teal);color:#0d1117;',
        'border:2px solid var(--cvz-teal);border-radius:0;',
        'font-family:"Syne",sans-serif;font-size:13px;font-weight:700;',
        'cursor:pointer;transition:background .15s,border-color .15s;text-decoration:none;line-height:1;',
      '}',
      '.cvz-cs-build-btn:hover{background:var(--cvz-teal-hover);border-color:var(--cvz-teal-hover);text-decoration:none;}',
      // BUGFIX: Die Regel "#cvz-content-strategy-agent a{color:teal}" weiter oben
      // ist durch die ID spezifischer als ".cvz-cs-build-btn" und hat die dunkle
      // Schrift überschrieben (türkis auf türkis). Mit derselben ID davor gewinnt
      // wieder die Button-Farbe, auch für :visited und :hover.
      '#cvz-content-strategy-agent a.cvz-cs-build-btn,',
      '#cvz-content-strategy-agent a.cvz-cs-build-btn:visited,',
      '#cvz-content-strategy-agent a.cvz-cs-build-btn:hover{color:#0d1117;text-decoration:none;}',

      /* ---- Spinner ---- */
      '@keyframes cvz-cs-spin{to{transform:rotate(360deg);}}',
      '.cvz-cs-spinner{',
        'width:32px;height:32px;',
        'border:3px solid var(--cvz-border);border-top-color:var(--cvz-teal);',
        'border-radius:50%;animation:cvz-cs-spin .8s linear infinite;',
      '}',

      /* ---- Processing ---- */
      '.cvz-cs-processing{',
        'display:flex;flex-direction:column;align-items:center;',
        'gap:14px;padding:48px 24px;text-align:center;',
      '}',
      '.cvz-cs-progress-text{font-size:15px;color:var(--cvz-muted);max-width:460px;}',

      /* ---- Error ---- */
      '.cvz-cs-error{',
        'padding:20px 24px;background:rgba(239,68,68,.08);border-radius:0;',
        'border:1px solid rgba(239,68,68,.25);color:#fca5a5;',
      '}',
      '.cvz-cs-error p{margin:0 0 10px;}',
      '.cvz-cs-error p:last-child{margin:0;}',

      /* ---- Badges ---- */
      '.cvz-cs-badge{',
        'display:inline-flex;align-items:center;',
        'padding:2px 7px;font-size:10px;font-weight:700;',
        'text-transform:uppercase;letter-spacing:.07em;border-radius:0;',
        'background:rgba(255,255,255,.06);color:var(--cvz-muted);',
        /* GEÄNDERT (Mobil: lange Badges wie "Marketing Manager (Initiator/Researcher)" liefen aus der Karte):
           Badges dürfen umbrechen und nie breiter als die Karte werden. */
        'border:1px solid var(--cvz-border);white-space:normal;max-width:100%;overflow-wrap:anywhere;line-height:1.35;text-align:left;',
      '}',
      '.cvz-cs-badge-conversion{background:rgba(59,130,246,.15);color:#93c5fd;border-color:rgba(59,130,246,.3);}',
      '.cvz-cs-badge-audience{background:rgba(79,209,197,.12);color:var(--cvz-teal);border-color:rgba(79,209,197,.25);}',
      '.cvz-cs-badge-recommended{background:rgba(245,158,11,.12);color:#fcd34d;border-color:rgba(245,158,11,.25);}',
      '.cvz-cs-badge-commodity{background:rgba(239,68,68,.1);color:#fca5a5;border-color:rgba(239,68,68,.2);}',
      '.cvz-cs-badge-rollout-zuerst{background:rgba(34,197,94,.12);color:#86efac;border-color:rgba(34,197,94,.25);}',
      '.cvz-cs-badge-rollout-spaeter{background:rgba(148,163,184,.12);color:#cbd5e1;border-color:rgba(148,163,184,.25);}',
      '.cvz-cs-rollout-note{margin:10px 0 12px;padding:10px 12px;border:1px solid var(--cvz-border, rgba(148,163,184,.25));border-radius:10px;}',
      '.cvz-cs-rollout-note p{margin:0 0 6px;}',
      '.cvz-cs-rollout-filter{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}',
      '.cvz-cs-notplanned{margin:14px 0 6px;}',
      '.cvz-cs-vis-query{margin:4px 0 10px;font-size:13px;color:var(--cvz-muted);}',
      '.cvz-cs-serp-table td:first-child{white-space:nowrap;width:1%;}',
      '.cvz-cs-portal-general td{color:var(--cvz-muted);}',
      '.cvz-cs-serp-list{margin:4px 0;padding-left:0;list-style:none;}',
      '.cvz-cs-serp-list li{margin:0 0 6px;overflow-wrap:anywhere;}',
      '.cvz-cs-serp-pos{display:inline-block;min-width:58px;font-size:13px;color:var(--cvz-muted);}',
      '.cvz-tp-recheck{margin:14px 0;}',
      '.cvz-tp-reqs{margin:10px 0 14px;padding:10px 12px;background:rgba(79,209,197,.06);border-left:3px solid var(--cvz-teal);}',
      '.cvz-tp-req{margin:8px 0 0;padding-top:8px;border-top:1px solid rgba(148,163,184,.2);}',
      '.cvz-tp-req p{margin:0 0 4px;}',
      '.cvz-tp-guide{margin:2px 0 6px;font-size:13px;color:var(--cvz-muted);}',
      '.cvz-tp-guide ul{margin:2px 0 4px;padding-left:18px;}',
      '.cvz-tp-guide li{margin:0 0 2px;}',
      '.cvz-tp-soft{margin:2px 0;font-size:13px;color:#fbbf24;}',
      '.cvz-tp-need{margin:8px 0;padding:8px 10px;border:1px solid rgba(148,163,184,.25);}',
      '.cvz-tp-need p{margin:4px 0 0;}',
      '.cvz-tp-need-fehlt{background:rgba(239,68,68,.1);color:#fca5a5;border-color:rgba(239,68,68,.2);}',
      '.cvz-tp-need-unklar{background:rgba(245,158,11,.12);color:#fcd34d;border-color:rgba(245,158,11,.25);}',
      '.cvz-tp-need-vorhanden{background:rgba(34,197,94,.12);color:#86efac;border-color:rgba(34,197,94,.25);}',
      '.cvz-cs-prompt-line{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}',
      '.cvz-cs-prompt-line label{flex:1;min-width:0;overflow-wrap:anywhere;}',
      '.cvz-cs-prompt-link{background:none;border:0;padding:0;font:inherit;font-size:13px;color:var(--cvz-teal);cursor:pointer;text-decoration:underline;white-space:nowrap;}',
      '.cvz-cs-prompt-edited{margin-left:8px;}',
      '.cvz-cs-prompt-editbox{display:flex;flex-direction:column;gap:6px;}',
      '.cvz-cs-prompt-edit{width:100%;box-sizing:border-box;font:inherit;font-size:14px;padding:8px 10px;}',
      '.cvz-cs-prompt-edit-error{margin:0;font-size:13px;color:#fca5a5;}',
      '.cvz-cs-prompt-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}',
      '.cvz-cs-prompt-btn{padding:6px 14px;font-size:13px;}',
      '.cvz-cs-roadmap-pages{margin:4px 0 0;font-size:13px;color:var(--cvz-muted);}',
      '.cvz-cs-roadmap-link{color:var(--cvz-teal);text-decoration:none;font-weight:600;}',
      '.cvz-cs-roadmap-link:hover{text-decoration:underline;}',
      '.cvz-cs-flash{animation:cvzCsFlash 1.6s ease-out;}',
      '@keyframes cvzCsFlash{0%{box-shadow:0 0 0 2px var(--cvz-teal);}100%{box-shadow:0 0 0 2px transparent;}}',
      '.cvz-cs-notplanned-act{display:block;margin:2px 0 0;}',
      '.cvz-cs-notplanned-btn{font:inherit;font-size:13px;padding:3px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:transparent;color:var(--cvz-heading);cursor:pointer;}',
      '.cvz-cs-notplanned-btn:hover{border-color:#60a5fa;}',
      '.cvz-cs-notplanned-done{font-size:13px;color:#86efac;}',
      '.cvz-cs-notplanned-howto{margin:8px 0 4px;padding:10px 12px;background:rgba(79,209,197,.06);border-left:3px solid var(--cvz-teal);}',
      '.cvz-cs-notplanned-howto p{margin:0 0 6px;font-size:13px;color:var(--cvz-text);}',
      '.cvz-cs-notplanned-howto p:last-child{margin:0;color:var(--cvz-muted);}',
      '.cvz-cs-own{margin:6px 0 0;}',
      '.cvz-cs-own-card{margin:8px 0;padding:10px 12px;border:1px dashed rgba(148,163,184,.35);border-radius:10px;}',
      '.cvz-cs-own-title{margin:4px 0 2px;font-weight:700;color:var(--cvz-heading);overflow-wrap:anywhere;}',
      '.cvz-cs-own-note{margin:4px 0;font-size:14px;color:var(--cvz-text);white-space:pre-line;overflow-wrap:anywhere;}',
      '.cvz-cs-own-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}',
      '.cvz-cs-own-error{margin:6px 0;font-size:13px;color:#fca5a5;}',
      '.cvz-cs-flow-note p{white-space:pre-line;}',
      '.cvz-cs-notplanned > summary{cursor:pointer;font-weight:700;color:var(--cvz-heading);}',
      '.cvz-cs-notplanned-group{margin:10px 0 0;}',
      '.cvz-cs-notplanned-group ul{margin:4px 0 0;padding-left:18px;}',
      '.cvz-cs-notplanned-group li{margin:0 0 4px;font-size:14px;color:var(--cvz-text);overflow-wrap:anywhere;}',
      '.cvz-cs-cannibal{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(245,158,11,.3);border-radius:10px;}',
      '.cvz-cs-cannibal-q{margin:0 0 4px;font-weight:700;color:var(--cvz-heading);overflow-wrap:anywhere;}',
      '.cvz-cs-cannibal-row{margin:6px 0 0;font-size:14px;color:var(--cvz-text);overflow-wrap:anywhere;}',
      /* ---- Mehrzeilige Felder, die mit dem Text wachsen ---- */
      '#cvz-content-strategy-agent textarea.cvz-cs-autogrow{display:block;width:100%;box-sizing:border-box;min-height:42px;resize:vertical;overflow:hidden;line-height:1.45;font-family:inherit;font-size:14px;}',
      '.cvz-cs-topic-option .cvz-cs-label,.cvz-cs-topic-check .cvz-cs-label{text-align:left;align-items:stretch;}',
      /* ---- Zielgruppen-Schritt ---- */
      '#cvz-content-strategy-agent .cvz-cs-section-title{display:flex;align-items:center;gap:10px;font-size:16px;margin:26px 0 10px;text-align:left;}',
      '.cvz-cs-modes{display:flex;flex-wrap:wrap;gap:10px;}',
      '#cvz-content-strategy-agent .cvz-cs-mode{display:flex;flex:1 1 260px;align-items:flex-start;gap:10px;padding:10px 14px;border:1px solid var(--cvz-border-strong);background:var(--cvz-surface);cursor:pointer;text-align:left;font-size:14px;}',
      '#cvz-content-strategy-agent .cvz-cs-mode input,#cvz-content-strategy-agent .cvz-cs-champion input{width:auto;padding:0;margin:3px 0 0;}',
      '.cvz-cs-role-card{border:1px solid var(--cvz-border-strong);background:var(--cvz-surface);padding:14px 16px;margin-bottom:12px;text-align:left;}',
      '.cvz-cs-role-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--cvz-border);}',
      '.cvz-cs-role-title{font-family:"Syne",sans-serif;font-weight:700;color:var(--cvz-heading);}',
      '#cvz-content-strategy-agent .cvz-cs-champion{display:inline-flex;align-items:center;gap:8px;padding:5px 12px;border:1px solid var(--cvz-border-strong);cursor:pointer;font-size:13px;font-weight:600;}',
      '#cvz-content-strategy-agent .cvz-cs-champion-on{border-color:var(--cvz-teal);color:var(--cvz-teal);background:rgba(79,209,197,.12);}',
      '.cvz-cs-role-grid{display:grid;grid-template-columns:2fr 1fr;gap:12px;}',
      '@media (max-width:600px){.cvz-cs-role-grid{grid-template-columns:1fr;}}',
      '.cvz-cs-field{display:flex;flex-direction:column;gap:5px;margin:0 0 12px;text-align:left;}',
      '.cvz-cs-field-label{font-size:13px;font-weight:600;color:var(--cvz-text);}',
      '.cvz-cs-role-foot{display:flex;justify-content:flex-end;}',
      '.cvz-cs-role-add{margin:4px 0 8px;}',
      '.cvz-cs-link-btn{background:none;border:none;padding:0;color:var(--cvz-muted);font-size:13px;text-decoration:underline;cursor:pointer;font-family:inherit;}',
      '.cvz-cs-link-btn:hover{color:var(--cvz-red);}',
      '.cvz-cs-champion-status{font-size:13px;margin:6px 0 0;text-align:left;}',
      '.cvz-cs-champion-ok{color:var(--cvz-teal);}',
      '.cvz-cs-champion-missing{color:var(--cvz-amber);font-weight:600;}',
      /* ---- Schritt-Anzeige ---- */
      '.cvz-cs-stepper{list-style:none;margin:0 0 6px;padding:0;display:flex;flex-wrap:wrap;gap:6px 18px;}',
      '.cvz-cs-stepper li{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--cvz-muted);}',
      '.cvz-cs-step-num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:1px solid var(--cvz-border-strong);font-size:12px;font-weight:700;}',
      '.cvz-cs-step-done{color:var(--cvz-text);}',
      '.cvz-cs-step-done .cvz-cs-step-num{background:rgba(79,209,197,.15);border-color:var(--cvz-teal);color:var(--cvz-teal);}',
      '.cvz-cs-step-current{color:var(--cvz-heading);font-weight:700;}',
      '.cvz-cs-step-current .cvz-cs-step-num{background:var(--cvz-teal);border-color:var(--cvz-teal);color:#0d1117;}',
      '.cvz-cs-stepbox{padding:12px 16px;margin-bottom:16px;background:var(--cvz-surface);border:1px solid var(--cvz-border);}',
      '.cvz-cs-stepbox-title{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--cvz-muted);margin:0 0 8px;}',
      '.cvz-cs-stepnote{font-size:13px;color:var(--cvz-amber);margin:8px 0 0;}',
      '.cvz-cs-callout{padding:10px 14px;margin:0 0 14px;border-left:4px solid var(--cvz-teal);background:rgba(79,209,197,.08);font-size:14px;}',
      /* ---- Sichtbarkeit je Frage (Karten) ---- */
      '.cvz-cs-vcard{padding:12px 16px;background:var(--cvz-surface);border:1px solid var(--cvz-border);border-left-width:4px;margin-bottom:8px;}',
      '.cvz-cs-vcard-luecke{border-left-color:var(--cvz-red);}',
      '.cvz-cs-vcard-wackelig{border-left-color:var(--cvz-amber);}',
      '.cvz-cs-vcard-stabil{border-left-color:var(--cvz-teal);}',
      '.cvz-cs-vcard-zu_wenig_daten{border-left-color:var(--cvz-muted);}',
      '.cvz-cs-vcard-title{font-size:15px;font-weight:600;color:var(--cvz-heading);margin:0 0 4px;}',
      '.cvz-cs-vbadge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;margin-right:8px;border:1px solid var(--cvz-border-strong);}',
      '.cvz-cs-vbadge-luecke{color:#fca5a5;background:rgba(239,68,68,.12);}',
      '.cvz-cs-vbadge-wackelig{color:#fcd34d;background:rgba(245,158,11,.12);}',
      '.cvz-cs-vbadge-stabil{color:var(--cvz-teal);background:rgba(79,209,197,.12);}',
      '.cvz-cs-vbadge-zu_wenig_daten{color:var(--cvz-muted);}',
      '.cvz-cs-vbar{display:flex;align-items:center;gap:8px;font-size:13px;margin:3px 0;}',
      '.cvz-cs-vbar-label{width:90px;color:var(--cvz-muted);}',
      '.cvz-cs-vbar-track{flex:0 0 140px;height:8px;background:rgba(255,255,255,.08);}',
      '.cvz-cs-vbar-fill{display:block;height:8px;background:var(--cvz-teal);}',
      '.cvz-cs-vcard details,.cvz-cs-method details{margin-top:6px;font-size:13px;}',
      '.cvz-cs-expand{margin:10px 0 4px;}',
      '.cvz-cs-expand>summary{list-style:none;display:inline-flex;align-items:center;gap:8px;padding:6px 12px;',
        'border:1px solid var(--cvz-teal);color:var(--cvz-teal)!important;font-size:13px;font-weight:600;cursor:pointer;user-select:none;}',
      '.cvz-cs-expand>summary::-webkit-details-marker{display:none;}',
      '.cvz-cs-expand>summary::before{content:"\\25B8";font-size:11px;transition:transform .15s;}',
      '.cvz-cs-expand[open]>summary::before{transform:rotate(90deg);}',
      '.cvz-cs-expand>summary:hover{background:rgba(79,209,197,.1);}',
      '.cvz-cs-expand>summary:focus-visible{outline:2px solid var(--cvz-teal);outline-offset:2px;}',
      '.cvz-cs-expand>summary{max-width:100%;box-sizing:border-box;text-align:left;}',
      '.cvz-cs-expand[open]>summary{margin-bottom:8px;}',
      '.cvz-cs-status-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;}',
      '.cvz-cs-status-label{font-size:13px;font-weight:600;color:var(--cvz-text);}',
      '.cvz-cs-status-note{font-size:12px;color:var(--cvz-muted);flex-basis:100%;margin:0;}',
      '.cvz-cs-status-saved{font-size:12px;color:var(--cvz-teal);}',
      '.cvz-cs-src{padding:10px 14px;margin:0 0 8px;background:var(--cvz-surface);border:1px solid var(--cvz-border);border-left:3px solid var(--cvz-muted);}',
      '.cvz-cs-src-comp{border-left-color:#de5b50;}',
      '.cvz-cs-src p{margin:4px 0 0;font-size:13px;}',
      '.cvz-cs-src-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.cvz-cs-src-head b{color:var(--cvz-text);}',
      '.cvz-cs-src-no{color:#fca5a5;}',
      '.cvz-cs-vcard summary,.cvz-cs-method summary{cursor:pointer;color:var(--cvz-muted);}',
      '.cvz-cs-prio{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;margin-left:6px;border:1px solid var(--cvz-border-strong);}',
      '.cvz-cs-prio-hoch{color:#fca5a5;background:rgba(239,68,68,.12);}',
      '.cvz-cs-prio-mittel{color:#fcd34d;background:rgba(245,158,11,.12);}',
      '.cvz-cs-prio-niedrig,.cvz-cs-prio-ohne_messdaten{color:var(--cvz-muted);}',
      '.cvz-cs-evidence{font-size:13px;color:var(--cvz-text);margin:6px 0;padding:6px 10px;background:rgba(255,255,255,.03);border:1px dashed var(--cvz-border-strong);}',
      '.cvz-cs-badge-role-coverage{background:rgba(79,209,197,.1);color:var(--cvz-teal);border-color:rgba(79,209,197,.2);}',
      '.cvz-cs-badge-role-citation{background:rgba(59,130,246,.12);color:#93c5fd;border-color:rgba(59,130,246,.25);}',
      '.cvz-cs-badge-role-existing{background:var(--cvz-surface);color:var(--cvz-muted);border-color:var(--cvz-border);}',
      '.cvz-cs-badge-intent-besser{background:rgba(79,209,197,.1);color:var(--cvz-teal);border-color:rgba(79,209,197,.2);}',
      '.cvz-cs-badge-intent-gleichwertig{background:rgba(59,130,246,.1);color:#93c5fd;border-color:rgba(59,130,246,.2);}',
      '.cvz-cs-badge-intent-schlechter{background:rgba(239,68,68,.1);color:#fca5a5;border-color:rgba(239,68,68,.2);}',
      '.cvz-cs-badge-intent-zu_breit{background:rgba(245,158,11,.1);color:#fcd34d;border-color:rgba(245,158,11,.2);}',
      '.cvz-cs-badge-roadmap-urgent{background:rgba(239,68,68,.15);color:#fca5a5;border-color:rgba(239,68,68,.3);}',
      '.cvz-cs-badge-roadmap-quick{background:rgba(79,209,197,.15);color:var(--cvz-teal);border-color:rgba(79,209,197,.3);}',
      '.cvz-cs-badge-roadmap-next{background:rgba(255,255,255,.06);color:var(--cvz-text);border-color:var(--cvz-border);}',
      '.cvz-cs-badge-roadmap-later{background:transparent;color:var(--cvz-muted);border-color:var(--cvz-border);}',

      /* ---- Report Header ---- */
      '.cvz-cs-report-header{padding-bottom:20px;border-bottom:1px solid var(--cvz-border);margin-bottom:28px;}',
      '.cvz-cs-report-header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;}',
      '.cvz-cs-report-eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--cvz-muted);margin:0 0 6px;}',
      '.cvz-cs-report-title{font-family:"Syne",sans-serif;font-size:clamp(1.5rem,3vw,2rem);font-weight:800;color:var(--cvz-heading);margin:0 0 4px;line-height:1.15;}',
      '.cvz-cs-report-meta{font-size:13px;color:var(--cvz-muted);margin:0;}',

      /* ---- Report Sections ---- */
      '.cvz-cs-report-section{margin-bottom:36px;}',
      /* NEU: Sprungleiste wie im LP-Report. Bewusst ohne #cvz-content-strategy-agent davor und ohne CSS-Variablen:
         Beim Scrollen hängt die Leiste am body (siehe renderAnchorNav), dort greifen beide nicht. */
      '.cvz-cs-anchor-nav{background:#0d1117;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);position:relative;z-index:100;width:100%;overflow:hidden;margin:0 0 24px;}',
      '.cvz-cs-anchor-nav.cvz-cs-anchor-nav--fixed{position:fixed;left:0;right:0;margin:0;}',
      '.cvz-cs-anchor-sentinel{width:100%;height:1px;pointer-events:none;visibility:hidden;}',
      '.cvz-cs-anchor-inner{display:flex;align-items:center;gap:0;width:100%;padding:0;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;}',
      '.cvz-cs-anchor-inner::-webkit-scrollbar{display:none;}',
      '.cvz-cs-anchor-nav a{display:inline-flex;align-items:center;flex-shrink:0;padding:13px 18px;font-family:"Geist","DM Sans",sans-serif;font-size:13px;font-weight:500;color:#6e7681;text-decoration:none;white-space:nowrap;border-bottom:2px solid transparent;transition:color .15s ease,border-color .15s ease;position:relative;}',
      '.cvz-cs-anchor-nav a:hover{color:#e6edf3;border-bottom-color:rgba(79,209,197,.4);}',
      /* Anders als im LP-Report: aktiver Abschnitt sichtbar in Teal (dort ist "aktiv" gleich grau wie "inaktiv"). */
      '.cvz-cs-anchor-nav a.cvz-cs-nav-active{color:#4fd1c5;border-bottom-color:#4fd1c5;}',
      '.cvz-cs-anchor-nav a+a::before{content:"";position:absolute;left:0;top:25%;height:50%;width:1px;background:rgba(255,255,255,.06);}',
      '.cvz-cs-anchor-nav a:focus-visible{outline:2px solid #4fd1c5;outline-offset:-2px;}',
      '@media(max-width:600px){.cvz-cs-anchor-nav a{font-size:12px;padding:12px 14px;}}',
      '.cvz-cs-anchor-select{display:none;}',
      '@media(max-width:600px){.cvz-cs-anchor-inner{display:none !important;}.cvz-cs-anchor-select{display:block;box-sizing:border-box;width:100% !important;max-width:100%;margin:8px 0;padding:10px 12px;background:#161b22;color:#e6edf3;border:1px solid rgba(255,255,255,.18);font-size:14px;}}',
      '.cvz-cs-group-label{margin:28px 0 -8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8b949e;font-weight:600;}',
      '.cvz-cs-group-fold{margin:24px 0 0;border:1px solid var(--cvz-border);background:var(--cvz-surface);}',
      '.cvz-cs-group-fold>summary{cursor:pointer;padding:12px 16px;font-weight:600;color:var(--cvz-heading);}',
      '.cvz-cs-group-fold>.cvz-cs-report-section{padding:0 16px 8px;}',
      '@media print{.cvz-cs-anchor-nav{display:none !important;}}',
      /* ---- Content-Flow-Diagramm ---- */
      '#cvz-content-strategy-agent .cvz-flow{border:1px solid var(--cvz-border);background:rgba(255,255,255,.02);}',
      '#cvz-content-strategy-agent .cvz-flow.is-fullscreen{position:fixed;inset:0;z-index:99999;background:var(--cvz-bg);display:flex;flex-direction:column;}',
      '#cvz-content-strategy-agent .cvz-flow-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:10px;border-bottom:1px solid var(--cvz-border);}',
      '#cvz-content-strategy-agent .cvz-flow-spacer{flex:1 1 auto;}',
      '#cvz-content-strategy-agent .cvz-flow-btn{background:var(--cvz-surface);color:var(--cvz-text);border:1px solid var(--cvz-border-strong);padding:5px 10px;font:inherit;font-size:13px;line-height:1.3;cursor:pointer;}',
      '#cvz-content-strategy-agent .cvz-flow-btn:hover{background:var(--cvz-surface-hover);border-color:var(--cvz-teal);}',
      '#cvz-content-strategy-agent .cvz-flow-btn.is-disabled{opacity:.45;}',
      '#cvz-content-strategy-agent .cvz-flow-btn-icon{min-width:32px;text-align:center;}',
      '#cvz-content-strategy-agent .cvz-flow-btn-danger{border-color:rgba(239,68,68,.5);color:#fca5a5;}',
      '#cvz-content-strategy-agent .cvz-flow-menu-wrap{position:relative;display:inline-block;}',
      '#cvz-content-strategy-agent .cvz-flow-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:5;min-width:250px;background:#161b22;border:1px solid var(--cvz-border-strong);box-shadow:0 8px 24px rgba(0,0,0,.5);}',
      '#cvz-content-strategy-agent .cvz-flow-menu-item{display:block;width:100%;text-align:left;background:transparent;color:var(--cvz-text);border:0;border-bottom:1px solid var(--cvz-border);padding:9px 12px;font:inherit;font-size:13px;cursor:pointer;}',
      '#cvz-content-strategy-agent .cvz-flow-menu-item:last-child{border-bottom:0;}',
      '#cvz-content-strategy-agent .cvz-flow-menu-item:hover{background:var(--cvz-surface-hover);}',
      '#cvz-content-strategy-agent .cvz-flow-menu-item small{display:block;color:var(--cvz-muted);font-size:11.5px;}',
      '#cvz-content-strategy-agent .cvz-flow-save{font-size:12px;color:var(--cvz-muted);margin-left:8px;}',
      '#cvz-content-strategy-agent .cvz-flow-save-saved{color:var(--cvz-teal);}',
      '#cvz-content-strategy-agent .cvz-flow-save-error{color:#fca5a5;}',
      '#cvz-content-strategy-agent .cvz-flow-stage{display:flex;flex-wrap:wrap;}',
      '#cvz-content-strategy-agent .cvz-flow.is-fullscreen .cvz-flow-stage{flex:1 1 auto;min-height:0;flex-wrap:nowrap;}',
      '#cvz-content-strategy-agent .cvz-flow-canvas-wrap{position:relative;flex:1 1 560px;min-width:0;height:560px;background:var(--cvz-bg);background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px);background-size:22px 22px;}',
      '#cvz-content-strategy-agent .cvz-flow.is-fullscreen .cvz-flow-canvas-wrap{height:auto;}',
      '#cvz-content-strategy-agent .cvz-flow-canvas-wrap.cvz-flow-connecting .cvz-flow-svg{cursor:crosshair;}',
      '#cvz-content-strategy-agent .cvz-flow-svg{width:100%;height:100%;display:block;touch-action:none;outline:none;cursor:grab;user-select:none;-webkit-user-select:none;}',
      '#cvz-content-strategy-agent .cvz-flow-svg:active{cursor:grabbing;}',
      '#cvz-content-strategy-agent .cvz-flow-banner{position:absolute;left:12px;top:12px;right:12px;background:rgba(79,209,197,.15);border:1px solid var(--cvz-teal);color:var(--cvz-heading);padding:6px 10px;font-size:13px;pointer-events:none;}',
      '#cvz-content-strategy-agent .cvz-flow-node{cursor:pointer;}',
      '#cvz-content-strategy-agent .cvz-flow-node-box{fill:#161b22;stroke-width:1.5;}',
      '#cvz-content-strategy-agent .cvz-flow-node.is-selected .cvz-flow-node-box{stroke-width:2.5;}',
      '#cvz-content-strategy-agent .cvz-flow-node.is-custom .cvz-flow-node-box{stroke-dasharray:5 4;}',
      '#cvz-content-strategy-agent .cvz-flow-node.is-topic .cvz-flow-node-box{fill:#132a2a;}',
      '#cvz-content-strategy-agent .cvz-flow-node-tag{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;fill:#8b949e;font-family:inherit;}',
      '#cvz-content-strategy-agent .cvz-flow-node-label{font-size:12.5px;font-weight:500;fill:#f0f4f8;font-family:inherit;}',
      '#cvz-content-strategy-agent .cvz-flow-node-phase{font-size:10px;font-family:inherit;}',
      '#cvz-content-strategy-agent .cvz-flow-node-note{font-size:12px;fill:#f59e0b;font-family:inherit;}',
      '#cvz-content-strategy-agent .cvz-flow-add{cursor:pointer;}',
      '#cvz-content-strategy-agent .cvz-flow-add circle{fill:#4fd1c5;stroke:#0d1117;stroke-width:2;}',
      '#cvz-content-strategy-agent .cvz-flow-add:hover circle{fill:#f0f4f8;}',
      '#cvz-content-strategy-agent .cvz-flow-add-icon{stroke:#0d1117;stroke-width:2;stroke-linecap:round;}',
      '#cvz-content-strategy-agent .cvz-flow-edge-hit{stroke:transparent;stroke-width:14;pointer-events:stroke;cursor:pointer;}',
      '#cvz-content-strategy-agent .cvz-flow-edge-line{pointer-events:none;stroke-width:1.6;}',
      '#cvz-content-strategy-agent .cvz-flow-edge-line.is-hierarchy{stroke:rgba(226,232,240,.6);}',
      '#cvz-content-strategy-agent .cvz-flow-edge-line.is-link{stroke:rgba(79,209,197,.6);stroke-dasharray:6 5;}',
      '#cvz-content-strategy-agent .cvz-flow-edge.is-selected .cvz-flow-edge-line{stroke:#f0f4f8;stroke-width:2.6;}',
      /* NEU: Off-Site-Maßnahmen im Content Flow (außerhalb der Website) */
      '#cvz-content-strategy-agent .cvz-flow-node.is-offsite .cvz-flow-node-box{stroke-dasharray:3 3;fill:#1d1520;}',
      '#cvz-content-strategy-agent .cvz-flow-edge-line.is-offsite{stroke:rgba(244,114,182,.75);stroke-dasharray:2 5;}',
      '#cvz-content-strategy-agent .cvz-flow-zone{fill:rgba(244,114,182,.04);stroke:rgba(244,114,182,.35);stroke-dasharray:4 4;pointer-events:none;}',
      '#cvz-content-strategy-agent .cvz-flow-zone-label{font-size:10px;letter-spacing:.06em;text-transform:uppercase;fill:#f472b6;font-family:inherit;pointer-events:none;}',
      '#cvz-content-strategy-agent .cvz-cs-offsite-target{font-size:13px;color:var(--cvz-teal);margin:6px 0 0;overflow-wrap:anywhere;}',
      '#cvz-content-strategy-agent .cvz-cs-offsite-examples a{color:var(--cvz-teal);overflow-wrap:anywhere;}',
      '#cvz-content-strategy-agent .cvz-flow-panel{flex:0 0 280px;max-width:100%;padding:14px;border-left:1px solid var(--cvz-border);overflow:auto;}',
      '@media (max-width:820px){#cvz-content-strategy-agent .cvz-flow-panel{flex:1 1 100%;border-left:0;border-top:1px solid var(--cvz-border);}#cvz-content-strategy-agent .cvz-flow-canvas-wrap{flex-basis:100%;height:420px;}}',
      '@media (max-width:820px){#cvz-content-strategy-agent .cvz-flow.is-fullscreen .cvz-flow-stage{flex-direction:column;flex-wrap:nowrap;}#cvz-content-strategy-agent .cvz-flow.is-fullscreen .cvz-flow-canvas-wrap{flex:1 1 55%;min-height:0;height:auto;}#cvz-content-strategy-agent .cvz-flow.is-fullscreen .cvz-flow-panel{flex:0 0 auto;max-height:45%;overflow:auto;border-left:0;border-top:1px solid var(--cvz-border);}}',
      '#cvz-content-strategy-agent .cvz-flow-panel-title{font-family:"Syne",sans-serif;font-weight:600;color:var(--cvz-heading);margin:0 0 8px;}',
      '#cvz-content-strategy-agent .cvz-flow-field{display:block;margin:0 0 10px;}',
      '#cvz-content-strategy-agent .cvz-flow-field-label{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--cvz-muted);margin-bottom:3px;}',
      '#cvz-content-strategy-agent .cvz-flow-input{width:100%;background:var(--cvz-surface);color:var(--cvz-text);border:1px solid var(--cvz-border-strong);padding:6px 8px;font:inherit;font-size:13px;}',
      '#cvz-content-strategy-agent .cvz-flow-actions{display:flex;flex-direction:column;gap:6px;margin-top:6px;}',
      '#cvz-content-strategy-agent .cvz-flow-reasoning{font-size:12.5px;color:var(--cvz-muted);margin:0 0 10px;}',
      '#cvz-content-strategy-agent .cvz-flow-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;font-size:12px;color:var(--cvz-muted);}',
      '#cvz-content-strategy-agent .cvz-flow-legend-item i{display:inline-block;width:10px;height:10px;margin-right:5px;vertical-align:middle;}',
      '.cvz-cs-report-section-title{',
        'font-family:"Syne",sans-serif;font-size:1.05rem;font-weight:700;',
        'color:var(--cvz-heading);padding-bottom:8px;',
        'border-bottom:1px solid var(--cvz-border);margin-bottom:18px;',
      '}',

      /* ---- Conversion Card ---- */
      '.cvz-cs-topic-market{margin:12px 0;padding:10px 14px;border:1px dashed var(--cvz-border-strong);color:var(--cvz-muted);font-size:13px;}',
      '.cvz-cs-topic-market p{margin:0 0 6px;color:var(--cvz-text);}',
      '.cvz-cs-conversion-card{padding:18px 22px;background:rgba(79,209,197,.06);border:1px solid rgba(79,209,197,.2);border-radius:0;margin-bottom:20px;}',
      '.cvz-cs-conversion-card h4{font-family:"Syne",sans-serif;font-size:1.1rem;font-weight:700;color:var(--cvz-teal);margin:0 0 6px;}',
      '.cvz-cs-conversion-card .cvz-cs-hint{color:var(--cvz-muted);}',
      '.cvz-cs-conversion-card .cvz-cs-badge{background:rgba(255,255,255,.06);color:var(--cvz-muted);border-color:var(--cvz-border);}',
      '.cvz-cs-conversion-card .cvz-cs-badge-conversion{background:rgba(59,130,246,.15);color:#93c5fd;border-color:rgba(59,130,246,.3);}',
      '.cvz-cs-conversion-card .cvz-cs-badge-audience{background:rgba(79,209,197,.12);color:var(--cvz-teal);border-color:rgba(79,209,197,.25);}',
      '.cvz-cs-conversion-card .cvz-cs-page-card-badges{margin-bottom:8px;}',

      /* ---- Page Cards ---- */
      '.cvz-cs-page-card{padding:14px 18px;background:var(--cvz-surface);border:1px solid var(--cvz-border);border-radius:0;margin-bottom:10px;}',
      '.cvz-cs-page-card:hover{border-color:rgba(255,255,255,.14);background:var(--cvz-surface-hover);}',
      '.cvz-cs-page-card-badges{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;}',
      '.cvz-cs-page-card-topic{font-family:"Syne",sans-serif;font-size:1rem;font-weight:700;color:var(--cvz-heading);margin:0 0 5px;}',
      '.cvz-cs-page-card-footer{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--cvz-border);flex-wrap:wrap;}',
      '.cvz-cs-page-card-type-explanation{font-size:13px;color:var(--cvz-muted);font-style:italic;margin:5px 0;}',
      /* NEU: aufklappbare Seiten-Karten. Zugeklappt: Typ, Titel, Keyword, Volumen, Status. Aufgeklappt: alles andere. */
      /* GEÄNDERT (siehe Chat-Verlauf, Abgleich mit dem LP-Analyse-Report v9): gleiche Optik wie dort und im Visibility
         Tracker. Teal Pfeil links (▸ zu, ▾ offen), Balken links (grau, offen teal), Hover mit leichtem Teal-Hintergrund,
         zweizeiliger Teaser im zugeklappten Zustand, Linie zwischen Kopf und Inhalt. */
      '.cvz-cs-fold>summary{list-style:none;cursor:pointer;}',
      '.cvz-cs-fold>summary::-webkit-details-marker{display:none;}',
      '.cvz-cs-fold>summary::before{content:"\\25B8";display:inline-block;width:16px;flex-shrink:0;color:var(--cvz-teal);font-size:14px;font-weight:700;line-height:1;}',
      '.cvz-cs-fold[open]>summary::before{content:"\\25BE";}',
      '.cvz-cs-fold>summary:focus-visible{outline:2px solid var(--cvz-teal);outline-offset:-2px;}',
      '.cvz-cs-page-acc{padding:0;}',
      '.cvz-cs-page-acc>summary{display:flex;align-items:flex-start;gap:10px;padding:14px 18px 14px 15px;border-left:3px solid rgba(255,255,255,.12);transition:background .15s;}',
      '.cvz-cs-page-acc>summary::before{margin-top:3px;}',
      '.cvz-cs-page-acc>summary:hover{background:rgba(79,209,197,.06);}',
      '.cvz-cs-page-acc[open]>summary{border-left-color:var(--cvz-teal);border-bottom:1px solid var(--cvz-border);}',
      '.cvz-cs-page-acc-head{flex:1 1 auto;min-width:0;}',
      '.cvz-cs-page-acc .cvz-cs-page-card-topic{margin:0 0 4px;overflow-wrap:anywhere;}',
      '.cvz-cs-page-acc-meta{font-size:13px;color:var(--cvz-muted);margin:0;overflow-wrap:anywhere;}',
      '.cvz-cs-page-acc-meta strong{color:var(--cvz-text);font-weight:600;}',
      '.cvz-cs-page-acc-teaser{font-size:13px;color:#a3b5c4;line-height:1.5;margin:6px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
      '.cvz-cs-page-acc[open] .cvz-cs-page-acc-teaser{display:none;}',
      /* NEU: Ziel der Strategie, Conversion-Pfad, Zwischenziel */
      '.cvz-cs-page-acc-goal{font-size:13px;color:var(--cvz-teal);margin:6px 0 0;overflow-wrap:anywhere;}',
      '.cvz-cs-page-acc[open] .cvz-cs-page-acc-goal{display:none;}',
      '.cvz-cs-goal-line{margin:2px 0;font-size:14px;color:var(--cvz-text);overflow-wrap:anywhere;}',
      /* NEU: Abschnitt "Ziel der Strategie" (vor der Executive Summary) */
      '.cvz-cs-goal-overview{display:flex;flex-direction:column;gap:14px;}',
      '.cvz-cs-trade-media{display:flex;flex-direction:column;gap:10px;margin-top:16px;}',
      '.cvz-cs-goal-block{padding:14px 16px;border:1px solid var(--cvz-border);background:var(--cvz-surface);min-width:0;}',
      '.cvz-cs-goal-block--primary{border-left:3px solid var(--cvz-teal);}',
      '.cvz-cs-goal-headline{font-size:17px;line-height:1.35;font-weight:600;color:var(--cvz-heading);margin:0 0 8px;overflow-wrap:anywhere;}',
      '.cvz-cs-goal-block p{overflow-wrap:anywhere;}',
      '.cvz-cs-goal-phases{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px;margin-top:8px;}',
      '.cvz-cs-goal-phase{padding:10px;border:1px solid var(--cvz-border);min-width:0;}',
      '#cvz-content-strategy-agent .cvz-cs-goal-phase h5{margin:0 0 8px;font-size:14px;text-transform:none;letter-spacing:0;color:var(--cvz-heading);overflow-wrap:break-word;}',
      '.cvz-cs-goal-phase-row{margin:0 0 6px;font-size:13px;color:var(--cvz-text);}',
      '.cvz-cs-goal-phase-row .cvz-cs-brief-label{margin:0 0 2px;}',
      '.cvz-cs-goal-progress{margin:6px 0 0;padding-left:18px;}',
      '.cvz-cs-goal-progress li{margin:0 0 8px;font-size:14px;color:var(--cvz-text);}',
      '.cvz-cs-goal-now{display:block;font-size:13px;color:var(--cvz-muted);margin-top:2px;}',
      '.cvz-cs-goal-link{color:var(--cvz-teal);text-decoration:underline;cursor:pointer;}',
      '.cvz-cs-path{margin:22px 0 8px;}',
      '.cvz-cs-path-step{position:relative;padding:0 0 12px 18px;border-left:2px solid var(--cvz-border);margin-left:6px;}',
      '.cvz-cs-path-step::before{content:"";position:absolute;left:-6px;top:4px;width:10px;height:10px;background:var(--cvz-surface);border:2px solid var(--cvz-teal);}',
      '.cvz-cs-path-end{border-left-color:transparent;}',
      '.cvz-cs-path-end::before{background:var(--cvz-teal);}',
      '.cvz-cs-path-phase{font-family:"Syne",sans-serif;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--cvz-muted);margin:0 0 6px;}',
      '.cvz-cs-path-list{list-style:none;margin:0;padding:0;}',
      '.cvz-cs-path-list li{margin:0 0 6px;font-size:14px;color:var(--cvz-text);overflow-wrap:anywhere;}',
      '.cvz-cs-path-page{color:var(--cvz-muted);}',
      '.cvz-cs-path-endtext{margin:0;font-size:14px;color:var(--cvz-heading);font-weight:600;overflow-wrap:anywhere;}',
      /* NEU: Funnel-Befund und Lead-Magneten */
      '.cvz-cs-funnel-row{padding:10px 14px;border:1px solid var(--cvz-border);border-left:3px solid var(--cvz-border);background:var(--cvz-surface);margin:0 0 8px;}',
      '.cvz-cs-funnel-row--luecke{border-left-color:var(--cvz-red);}',
      '.cvz-cs-funnel-row--schwach{border-left-color:var(--cvz-amber);}',
      '.cvz-cs-funnel-row--ok{border-left-color:var(--cvz-teal);}',
      '.cvz-cs-funnel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:8px 0;}',
      '.cvz-cs-funnel-tile{display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:10px 12px;border:1px solid var(--cvz-border);border-top:3px solid var(--cvz-border);background:var(--cvz-surface);}',
      '.cvz-cs-funnel-tile.cvz-cs-funnel-row--luecke{border-top-color:var(--cvz-red);}',
      '.cvz-cs-funnel-tile.cvz-cs-funnel-row--schwach{border-top-color:var(--cvz-amber);}',
      '.cvz-cs-funnel-tile.cvz-cs-funnel-row--ok{border-top-color:var(--cvz-teal);}',
      '.cvz-cs-funnel-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 4px;}',
      '.cvz-cs-funnel-phase{font-family:"Syne",sans-serif;font-size:.95rem;font-weight:700;color:var(--cvz-heading);}',
      '.cvz-cs-funnel-status--luecke{background:rgba(239,68,68,.12);color:#fca5a5;border-color:rgba(239,68,68,.3);}',
      '.cvz-cs-funnel-status--schwach{background:rgba(245,158,11,.12);color:var(--cvz-amber);border-color:rgba(245,158,11,.3);}',
      '.cvz-cs-funnel-status--ok{background:rgba(79,209,197,.12);color:var(--cvz-teal);border-color:rgba(79,209,197,.25);}',
      '.cvz-cs-funnel-steps{font-size:13px;color:var(--cvz-muted);margin:2px 0;overflow-wrap:anywhere;}',
      '.cvz-cs-funnel-finding{font-size:14px;color:var(--cvz-text);margin:6px 0 0;overflow-wrap:anywhere;}',
      '.cvz-cs-magnet-gap{color:var(--cvz-amber);font-weight:600;}',
      /* NEU (Abschnitt 5 verständlich): Aufgaben und Seiten je Phase */
      '.cvz-tp-kit{margin:14px 0;}',
      '.cvz-cs-path-fold>summary{cursor:pointer;font-size:14px;font-weight:600;color:var(--cvz-heading);margin:0 0 8px;}',
      '.cvz-cs-plan-switch{margin:0 0 16px;}',
      '.cvz-cs-plan-switch .cvz-cs-hint{margin:6px 0 0;}',
      '.cvz-cs-plan-tabs{display:flex;flex-wrap:wrap;gap:0;}',
      '.cvz-cs-plan-tab{background:var(--cvz-surface);border:1px solid var(--cvz-border);color:var(--cvz-text);padding:10px 16px;font:600 14px "Geist",sans-serif;cursor:pointer;}',
      '.cvz-cs-plan-tab+.cvz-cs-plan-tab{border-left:0;}',
      '.cvz-cs-plan-tab:hover{color:var(--cvz-heading);}',
      '.cvz-cs-plan-tab.is-active{background:rgba(79,209,197,.12);color:var(--cvz-teal);border-color:rgba(79,209,197,.5);}',
      '.cvz-cs-phase-status{margin-left:8px;text-transform:none;letter-spacing:0;font-weight:600;}',
      '.cvz-cs-build{margin-top:22px;padding-top:16px;border-top:1px solid var(--cvz-border);}',
      '.cvz-cs-build-title{margin:0 0 6px;}',
      '.cvz-cs-build-block{margin:10px 0;}',
      '.cvz-cs-build-gap{padding:10px 14px;border:1px solid var(--cvz-border);border-left:3px solid var(--cvz-amber);background:var(--cvz-surface);margin:0 0 10px;}',
      '.cvz-cs-build-gap-title{margin:0 0 4px;font-weight:700;color:var(--cvz-heading);font-size:14px;}',
      '.cvz-cs-build-group-title{margin:14px 0 4px;font-weight:700;color:var(--cvz-heading);font-size:14px;}',
      '.cvz-cs-build-list{margin:0;padding-left:18px;}',
      '.cvz-cs-build-list li{margin:0 0 8px;font-size:14px;color:var(--cvz-text);overflow-wrap:anywhere;}',
      '.cvz-cs-build-more{margin:12px 0;}',
      '.cvz-cs-build-more summary{cursor:pointer;font-size:14px;color:var(--cvz-text);}',
      '.cvz-cs-traffic{margin:16px 0;padding:14px 16px;border:1px solid var(--cvz-border);background:var(--cvz-surface);}',
      '.cvz-cs-traffic-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;}',
      '.cvz-cs-traffic-head h5{margin:0;}',
      '.cvz-cs-traffic-range{font-size:1.15rem;font-weight:700;color:var(--cvz-heading);margin:10px 0;}',
      '.cvz-cs-traffic-sub{display:block;font-size:13px;font-weight:400;color:var(--cvz-muted);margin-top:2px;}',
      '.cvz-cs-traffic-level--sehr_gering,.cvz-cs-traffic-level--gering{background:rgba(245,158,11,.12);color:var(--cvz-amber);border-color:rgba(245,158,11,.3);}',
      '.cvz-cs-traffic-level--mittel,.cvz-cs-traffic-level--hoch{background:rgba(79,209,197,.12);color:var(--cvz-teal);border-color:rgba(79,209,197,.25);}',
      '.cvz-cs-traffic-how{margin-top:10px;}',
      '.cvz-cs-traffic-how summary{cursor:pointer;font-size:14px;color:var(--cvz-text);}',
      '.cvz-cs-also{margin:-4px 0 14px;}',
      '.cvz-cs-also summary{cursor:pointer;font-size:14px;color:var(--cvz-text);}',
      '.cvz-cs-also-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:4px 14px;margin:6px 0 0;}',
      '.cvz-cs-also-item{font-size:14px;color:var(--cvz-text);display:flex;gap:6px;align-items:flex-start;cursor:pointer;}',
      '.cvz-cs-also-item input{margin-top:3px;}',
      '.cvz-cs-also-item.is-off{opacity:.45;cursor:default;}',
      '.cvz-tp-kit-item{padding:10px 14px;border:1px solid var(--cvz-border);border-left:3px solid #4fd1c5;background:var(--cvz-surface);margin:0 0 8px;}',
      '.cvz-tp-kit-item .cvz-cs-magnet-line{margin:6px 0;}',
      '.cvz-cs-funnel-todos{margin:12px 0;padding:12px 14px;border:1px solid var(--cvz-border);border-left:3px solid var(--cvz-teal);background:var(--cvz-surface);}',
      '.cvz-cs-funnel-todos.has-gap{border-left-color:var(--cvz-amber);}',
      '.cvz-cs-funnel-todos ol{margin:6px 0 0;padding-left:20px;}',
      '.cvz-cs-funnel-todos li{margin:0 0 10px;font-size:14px;color:var(--cvz-text);overflow-wrap:anywhere;}',
      '.cvz-cs-funnel-todos li strong{color:var(--cvz-heading);}',
      '.cvz-cs-funnel-todo-meta{display:block;font-size:13px;color:var(--cvz-muted);margin:2px 0;}',
      '.cvz-cs-funnel-todo-task{display:block;margin:2px 0;}',
      '.cvz-cs-funnel-pages{margin:8px 0;}',
      '.cvz-cs-funnel-pages>details{border:1px solid var(--cvz-border);background:var(--cvz-surface);margin:0 0 6px;}',
      '.cvz-cs-funnel-pages summary{cursor:pointer;padding:8px 12px;font-size:14px;color:var(--cvz-heading);}',
      '.cvz-cs-funnel-pages ul{list-style:none;margin:0;padding:0 12px 10px;}',
      '.cvz-cs-funnel-pages li{margin:0 0 8px;font-size:14px;color:var(--cvz-text);overflow-wrap:anywhere;}',
      '.cvz-cs-funnel-nocount{display:block;font-size:12px;color:var(--cvz-muted);}',
      '.cvz-cs-funnel-pages .cvz-cs-funnel-finding{padding:0 12px 10px;margin:0;}',
      '.cvz-cs-magnet-line{font-size:14px;color:var(--cvz-text);margin:8px 0;overflow-wrap:anywhere;}',
      '.cvz-cs-magnet-line strong{color:var(--cvz-heading);}',
      '.cvz-cs-zwischenziel{margin:0 0 10px;}',
      '.cvz-cs-zwischenziel p{margin:2px 0;}',
      '.cvz-cs-badge-path-ohne_huerde{background:rgba(255,255,255,.06);color:var(--cvz-text);}',
      '.cvz-cs-badge-path-gegen_email{background:rgba(59,130,246,.12);color:#93c5fd;border-color:rgba(59,130,246,.25);}',
      '.cvz-cs-badge-path-produkt_erleben{background:rgba(79,209,197,.12);color:var(--cvz-teal);border-color:rgba(79,209,197,.25);}',
      '.cvz-cs-badge-path-beleg{background:rgba(245,158,11,.1);color:#fcd34d;border-color:rgba(245,158,11,.2);}',
      '.cvz-cs-badge-path-endziel{background:rgba(79,209,197,.2);color:var(--cvz-heading);border-color:var(--cvz-teal);}',
      '.cvz-cs-page-acc-body{padding:14px 18px 14px 44px;}',
      '.cvz-cs-page-acc-audience{font-size:13px;color:var(--cvz-text);margin:0 0 8px;overflow-wrap:anywhere;}',
      '.cvz-cs-cluster-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;margin:0 0 12px;}',
      '.cvz-cs-cluster-toolbar p{margin:0;flex:1 1 260px;}',
      '.cvz-cs-phase-count{font-weight:400;letter-spacing:0;text-transform:none;margin-left:6px;}',
      /* Button wie im LP-Report: klein, teal umrandet */
      '#cvz-content-strategy-agent .cvz-cs-expand-btn{font-family:"Geist",sans-serif;font-size:12px;padding:7px 14px;background:none;color:var(--cvz-teal);border:1px solid var(--cvz-teal);border-radius:0;cursor:pointer;transition:background .15s;}',
      '#cvz-content-strategy-agent .cvz-cs-expand-btn:hover{background:rgba(79,209,197,.1);}',
      '#cvz-content-strategy-agent .cvz-cs-expand-btn:focus-visible{outline:2px solid var(--cvz-teal);outline-offset:2px;}',
      /* Roadmap-Gruppen aufklappbar: Kopf mit Badge und Anzahl */
      '.cvz-cs-roadmap-fold>summary{display:flex;align-items:center;gap:8px;padding:4px 0;}',
      '.cvz-cs-roadmap-fold>summary:hover .cvz-cs-badge{filter:brightness(1.2);}',
      '.cvz-cs-roadmap-count{font-size:12px;color:var(--cvz-muted);}',
      '@media (max-width:600px){.cvz-cs-page-acc>summary{padding:14px 14px 14px 11px;gap:8px;}.cvz-cs-page-acc-body{padding:14px 14px 14px 14px;}}',

      /* ---- Phase Groups ---- */
      '.cvz-cs-phase-group{margin-bottom:24px;}',
      '.cvz-cs-phase-title{font-family:"Syne",sans-serif;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--cvz-muted);margin:0 0 3px;}',
      '.cvz-cs-phase-desc{font-size:13px;color:var(--cvz-muted);margin:0 0 10px;}',

      /* ---- Status Select ---- */
      '.cvz-cs-status-select{padding:4px 8px;border:1px solid var(--cvz-border);border-radius:0;',
        'font-family:"Geist","Inter",system-ui,sans-serif;font-size:12px;',
        'color:var(--cvz-text);background:var(--cvz-surface);cursor:pointer;}',
      '.cvz-cs-status-select:focus{outline:none;border-color:var(--cvz-teal);}',
      '.cvz-cs-status-select:disabled{opacity:.5;cursor:wait;}',
      '.cvz-cs-status-select option{background:#1a2233;color:var(--cvz-text);}',

      /* ---- Content Brief ---- */
      '.cvz-cs-brief{margin-top:10px;padding:10px 14px;background:rgba(79,209,197,.06);border-left:3px solid var(--cvz-teal);}',
      '.cvz-cs-brief-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--cvz-muted);margin:0 0 5px;}',
      '.cvz-cs-brief-list{margin:0;padding-left:16px;}',
      '.cvz-cs-brief-list li{font-size:13px;color:var(--cvz-text);margin-bottom:3px;}',

      /* ---- Tables ---- */
      '.cvz-cs-table-wrap{overflow-x:auto;margin:10px 0;}',
      '.cvz-cs-table{width:100%;border-collapse:collapse;font-size:13px;}',
      '.cvz-cs-table th{font-family:"Syne",sans-serif;font-weight:700;font-size:10px;',
        'text-transform:uppercase;letter-spacing:.07em;color:var(--cvz-muted);',
        'padding:7px 10px;text-align:left;border-bottom:1px solid var(--cvz-border);white-space:nowrap;}',
      '.cvz-cs-table td{padding:7px 10px;border-bottom:1px solid var(--cvz-border);color:var(--cvz-text);vertical-align:top;}',
      '.cvz-cs-table tr:hover td{background:var(--cvz-surface-hover);}',
      '@media(max-width:600px){',
        '.cvz-cs-table.cvz-cs-table-cards thead{display:none;}',
        '.cvz-cs-table.cvz-cs-table-cards tr{display:block;border:1px solid var(--cvz-border);border-radius:0;margin-bottom:10px;padding:10px;}',
        '.cvz-cs-table.cvz-cs-table-cards td{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:none;font-size:13px;}',
        '.cvz-cs-table.cvz-cs-table-cards td::before{content:attr(data-label);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--cvz-muted);flex-shrink:0;padding-top:1px;}',
      '}',

      /* ---- Ist-Zustand ---- */
      '.cvz-cs-current-state-general-title{margin-top:20px;padding-top:14px;border-top:1px solid var(--cvz-border);}',

      /* ---- Executive Summary ---- */
      '.cvz-cs-executive-summary{padding:18px 22px;background:var(--cvz-surface);border:1px solid var(--cvz-border);border-radius:0;}',

      /* ---- GEO ---- */
      '.cvz-cs-citation-note{padding:14px 18px;background:rgba(59,130,246,.08);border-left:3px solid var(--cvz-blue);border-radius:0;margin-bottom:16px;}',
      '.cvz-cs-aio{margin-bottom:18px;}',

      /* ---- Roadmap ---- */
      '.cvz-cs-roadmap-group{margin-bottom:18px;}',
      '.cvz-cs-roadmap-list{margin:8px 0 0;padding-left:0;list-style:none;}',
      '.cvz-cs-roadmap-item{padding:10px 14px;border:1px solid var(--cvz-border);border-radius:0;margin-bottom:7px;background:var(--cvz-surface);}',
      '.cvz-cs-roadmap-item-title{font-family:"Syne",sans-serif;font-weight:700;font-size:14px;color:var(--cvz-heading);margin:0 0 4px;}',

      /* ---- Topic Check ---- */
      '.cvz-cs-topic-check{padding:22px;border:1px solid var(--cvz-border);border-radius:0;background:var(--cvz-surface);}',
      '.cvz-cs-topic-options{display:flex;flex-direction:column;gap:8px;margin-bottom:18px;}',
      '.cvz-cs-topic-option{padding:10px 14px;border:1px solid var(--cvz-border);border-radius:0;cursor:pointer;transition:border-color .15s,background .15s;}',
      '.cvz-cs-topic-option:hover{border-color:var(--cvz-teal);background:rgba(79,209,197,.04);}',
      '.cvz-cs-topic-option label{display:flex;align-items:center;gap:9px;cursor:pointer;font-size:14px;color:var(--cvz-text);}',
      '.cvz-cs-topic-recommendation-box{padding:12px 16px;background:rgba(79,209,197,.08);border-left:3px solid var(--cvz-teal);border-radius:0;margin-bottom:14px;}',
      '.cvz-cs-topic-recommendation-box p{margin:0 0 3px;font-size:14px;}',
      '.cvz-cs-topic-check-actions{display:flex;align-items:center;gap:10px;margin-top:18px;flex-wrap:wrap;}',
      '.cvz-cs-topic-free-input{display:block;width:100%;padding:9px 11px;border:1px solid var(--cvz-border);border-radius:0;',
        'font-family:"Geist","Inter",system-ui,sans-serif;font-size:14px;color:var(--cvz-text);margin-top:5px;background:rgba(255,255,255,.04);}',
      '.cvz-cs-topic-free-input:focus{outline:none;border-color:var(--cvz-teal);}',
      '.cvz-cs-topic-alt-list{padding-left:18px;margin:6px 0 14px;}',
      '.cvz-cs-topic-alt-list li{font-size:13px;color:var(--cvz-text);margin-bottom:7px;line-height:1.5;}',
      '.cvz-cs-topic-validation{font-size:14px;}',
      '.cvz-cs-topic-validation p{margin:0 0 7px;}',
      '.cvz-cs-topic-recommendation{font-style:italic;color:var(--cvz-muted);}',

      /* ---- Commodity ---- */
      '.cvz-cs-commodity-note{font-size:12px;color:#fcd34d;padding:5px 9px;background:rgba(245,158,11,.1);border-left:2px solid var(--cvz-amber);border-radius:0;margin-top:7px;}',

      /* ---- Internal Links ---- */
      '.cvz-cs-link-list{padding-left:18px;font-size:14px;}',
      '.cvz-cs-vis-q{margin:22px 0 10px;}',
      '.cvz-cs-vis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;}', // GEÄNDERT: untereinander statt nebeneinander (erst Google, dann KI-Antworten), Tabellen bekommen die volle Breite
      '.cvz-cs-vis-block{padding:12px 14px;border:1px solid var(--cvz-border);background:var(--cvz-surface);margin:0 0 12px;min-width:0;}',
      '.cvz-cs-vis-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 8px;color:var(--cvz-heading);font-size:14px;}',
      '.cvz-cs-vis-google .cvz-cs-vis-src{background:rgba(59,130,246,.12);color:#93c5fd;border-color:rgba(59,130,246,.25);}',
      '.cvz-cs-vis-ki .cvz-cs-vis-src{background:rgba(167,139,250,.12);color:#c4b5fd;border-color:rgba(167,139,250,.3);}',
      '.cvz-cs-vis-beides .cvz-cs-vis-src{background:rgba(79,209,197,.12);color:var(--cvz-teal);border-color:rgba(79,209,197,.25);}',
      '.cvz-cs-vis-block .cvz-cs-geo{margin:0;padding:0;border:0;background:transparent;}',
      '.cvz-cs-cmp{margin:12px 0;padding:10px 12px;border:1px solid var(--cvz-border);border-left:3px solid #a78bfa;background:rgba(255,255,255,.02);}',
      '.cvz-cs-cmp.is-compact{padding:8px 10px;margin:8px 0;}',
      '.cvz-cs-cmp-list{margin:0 0 6px;padding-left:18px;}',
      '.cvz-cs-cmp-list li{margin:0 0 6px;font-size:14px;color:var(--cvz-text);overflow-wrap:anywhere;}',
      '.cvz-cs-cmp-intent{font-size:14px;margin:6px 0;color:var(--cvz-text);}',
      '.cvz-cs-cmp-intent--passt_nicht strong,.cvz-cs-cmp-intent--teilweise strong{color:var(--cvz-amber);}',
      '.cvz-cs-cmp-intent--passt strong{color:var(--cvz-teal);}',
      '.cvz-cs-page-links{margin:12px 0;padding:10px 12px;border:1px solid var(--cvz-border);background:rgba(255,255,255,.02);}',
      '.cvz-cs-page-links-sub{font-size:13px;color:var(--cvz-muted);margin:6px 0 4px;}',
      '.cvz-cs-page-links-warn{font-size:13px;color:var(--cvz-amber);margin:6px 0 0;}',
      '.cvz-flow-links{margin:10px 0;}',
      '.cvz-flow-panel-sub{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--cvz-muted);margin:0 0 4px;}',
      '.cvz-cs-link-card{padding:10px 14px;border:1px solid var(--cvz-border);border-left:3px solid var(--cvz-border);background:var(--cvz-surface);margin:0 0 8px;}',
      '.cvz-cs-link-card.is-existing{border-left-color:var(--cvz-teal);}',
      '.cvz-cs-link-src{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:14px;color:var(--cvz-heading);}',
      '.cvz-cs-link-url{font-size:12px;color:var(--cvz-muted);overflow-wrap:anywhere;}',
      '.cvz-cs-link-targets{list-style:none;margin:8px 0 0;padding:0;}',
      '.cvz-cs-link-targets li{display:flex;gap:8px;margin:0 0 8px;font-size:14px;color:var(--cvz-text);overflow-wrap:anywhere;}',
      '.cvz-cs-link-arrow{color:var(--cvz-teal);flex-shrink:0;}',
      '.cvz-cs-link-meta{display:block;font-size:13px;color:var(--cvz-muted);margin-top:2px;}',
      '.cvz-cs-link-existing{background:rgba(79,209,197,.12);color:var(--cvz-teal);border-color:rgba(79,209,197,.25);}',
      '.cvz-cs-link-new{background:rgba(255,255,255,.06);color:var(--cvz-text);}',
      '.cvz-cs-link-list li{margin-bottom:5px;color:var(--cvz-text);}',

      /* ---- Prose (Markdown) ---- */
      '.cvz-cs-prose{font-size:14px;line-height:1.7;color:var(--cvz-text);}',
      '.cvz-cs-prose h1,.cvz-cs-prose h2,.cvz-cs-prose h3,',
      '.cvz-cs-prose h4,.cvz-cs-prose h5,.cvz-cs-prose h6{',
        'font-family:"Syne",sans-serif;color:var(--cvz-heading);margin:.9em 0 .35em;line-height:1.25;',
      '}',
      '.cvz-cs-prose p{margin:0 0 .6em;}',
      '.cvz-cs-prose ul,.cvz-cs-prose ol{padding-left:1.2em;margin:0 0 .6em;}',
      '.cvz-cs-prose li{margin-bottom:.25em;}',
      '.cvz-cs-prose strong{font-weight:600;color:var(--cvz-heading);}',
      '.cvz-cs-prose a{color:var(--cvz-teal);}',
      '.cvz-cs-prose table{border-collapse:collapse;width:100%;font-size:13px;margin:.5em 0;}',
      '.cvz-cs-prose th{background:var(--cvz-surface);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:7px 10px;border:1px solid var(--cvz-border);text-align:left;color:var(--cvz-muted);}',
      '.cvz-cs-prose td{padding:7px 10px;border:1px solid var(--cvz-border);color:var(--cvz-text);}',

      /* ---- Chat ---- */
      '.cvz-cs-chat{margin-top:36px;padding-top:28px;border-top:1px solid var(--cvz-border);}',
      '.cvz-cs-chat-title{font-family:"Syne",sans-serif;font-size:1.05rem;font-weight:700;color:var(--cvz-heading);margin:0 0 4px;}',
      '.cvz-cs-chat-messages{',
        'display:flex;flex-direction:column;gap:10px;',
        'min-height:72px;max-height:440px;overflow-y:auto;',
        'padding:14px;background:var(--cvz-surface);border:1px solid var(--cvz-border);border-radius:0;margin:10px 0;',
      '}',
      '.cvz-cs-chat-msg{max-width:84%;padding:9px 13px;font-size:14px;line-height:1.6;border-radius:0;}',
      '.cvz-cs-chat-msg-user{align-self:flex-end;background:var(--cvz-teal);color:#0d1117;}',
      '.cvz-cs-chat-msg-assistant{align-self:flex-start;background:rgba(255,255,255,.06);border:1px solid var(--cvz-border);color:var(--cvz-text);}',
      '.cvz-cs-chat-msg-loading{display:flex;align-items:center;gap:7px;color:var(--cvz-muted);font-style:italic;font-size:13px;}',
      '.cvz-cs-chat-spinner-inline{',
        'display:inline-block;width:13px;height:13px;',
        'border:2px solid var(--cvz-border);border-top-color:var(--cvz-teal);',
        'border-radius:50%;animation:cvz-cs-spin .8s linear infinite;flex-shrink:0;',
      '}',
      '.cvz-cs-chat-form{margin-bottom:6px;}',
      '.cvz-cs-chat-input-row{display:flex;align-items:flex-end;gap:7px;}',
      '.cvz-cs-chat-input{',
        'flex:1;padding:9px 11px;border:1px solid var(--cvz-border);border-radius:0;',
        'font-family:"Geist","Inter",system-ui,sans-serif;font-size:14px;color:var(--cvz-text);',
        'background:rgba(255,255,255,.04);',
        'resize:none;line-height:1.5;min-height:40px;max-height:110px;',
      '}',
      '.cvz-cs-chat-input:focus{outline:none;border-color:var(--cvz-teal);}',
      '.cvz-cs-chat-input:disabled{background:var(--cvz-surface);opacity:.5;cursor:not-allowed;}',
      '#cvz-content-strategy-agent button.cvz-cs-chat-send-btn{',
        'padding:9px 18px;background:var(--cvz-teal);color:#0d1117;',
        'border:2px solid var(--cvz-teal);border-radius:0;',
        'font-family:"Syne",sans-serif;font-size:13px;font-weight:700;',
        'cursor:pointer;white-space:nowrap;transition:background .15s;line-height:1;flex-shrink:0;',
      '}',
      '#cvz-content-strategy-agent button.cvz-cs-chat-send-btn:hover:not(:disabled){background:var(--cvz-teal-hover);border-color:var(--cvz-teal-hover);}',
      '#cvz-content-strategy-agent button.cvz-cs-chat-send-btn:disabled{opacity:.4;cursor:not-allowed;}',
      '.cvz-cs-chat-status{font-size:13px;color:#fca5a5;min-height:18px;margin:2px 0;}',
      '.cvz-cs-chat-limit-notice{color:var(--cvz-amber);}',
      '.cvz-cs-chat-msg-assistant h1,.cvz-cs-chat-msg-assistant h2,',
      '.cvz-cs-chat-msg-assistant h3,.cvz-cs-chat-msg-assistant h4,',
      '.cvz-cs-chat-msg-assistant h5,.cvz-cs-chat-msg-assistant h6{',
        'font-family:"Syne",sans-serif;color:var(--cvz-heading);margin:.8em 0 .3em;line-height:1.25;',
      '}',
      '.cvz-cs-chat-msg-assistant p{margin:0 0 .5em;}',
      '.cvz-cs-chat-msg-assistant p:last-child{margin:0;}',
      '.cvz-cs-chat-msg-assistant ul,.cvz-cs-chat-msg-assistant ol{padding-left:1.2em;margin:0 0 .5em;}',
      '.cvz-cs-chat-msg-assistant strong{font-weight:600;color:var(--cvz-heading);}',
      '.cvz-cs-chat-msg-assistant a{color:var(--cvz-teal);}',

      /* ---- Footer ---- */
      '.cvz-cs-footer{display:flex;align-items:center;justify-content:space-between;',
        'gap:14px;padding-top:20px;border-top:1px solid var(--cvz-border);margin-top:28px;flex-wrap:wrap;}',

      /* ---- KI-Disclaimer ---- */
      '.cvz-cs-ki-disclaimer{margin-top:28px;padding-top:16px;border-top:1px solid var(--cvz-border);',
        'color:var(--cvz-muted);font-size:12px;line-height:1.6;text-align:center;}',
    ].concat(TOUCHPOINT_STYLES, PROFILE_STYLES, TIP_STYLES).join('');

    var style = document.createElement('style');
    style.id = 'cvz-cs-styles';
    style.textContent = css + portalCss(css) + CHAT_PANEL_STYLES.join('');
    document.head.appendChild(style);
  }

  // NEU (Chat-Panel): Das Panel hängt am body (#cvz-cs-portal), nicht im Widget. Grund wie bei der Sprungleiste: position:fixed
  // bricht, sobald ein Webflow-Vorfahre transform oder filter setzt. Am body greifen aber die Regeln mit #cvz-content-strategy-agent
  // davor nicht (Farben, Schriften, Buttons, Markdown im Chat). portalCss kopiert genau diese Regeln einmal mit #cvz-cs-portal davor.
  // Bewusst keine :is()-Selektoren, damit ältere Browser nicht das ganze Stylesheet verwerfen.
  function portalCss(css) {
    var out = [];
    function rewriteBlock(text) {
      var res = '';
      var i = 0;
      while (i < text.length) {
        var open = text.indexOf('{', i);
        if (open === -1) break;
        var head = text.slice(i, open).trim();
        var depth = 1;
        var j = open + 1;
        while (j < text.length && depth > 0) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
        var inner = text.slice(open + 1, j - 1);
        if (head.charAt(0) === '@') {
          var sub = head.indexOf('@media') === 0 ? rewriteBlock(inner) : '';
          if (sub) res += head + '{' + sub + '}';
        } else {
          var sels = head.split(',').filter(function (x) { return x.indexOf('#cvz-content-strategy-agent') !== -1; })
            .map(function (x) { return x.trim().replace(/#cvz-content-strategy-agent(?![\w-])/g, '#cvz-cs-portal'); });
          if (sels.length) res += sels.join(',') + '{' + inner + '}';
        }
        i = j;
      }
      return res;
    }
    out.push(rewriteBlock(css));
    // Der Wrapper selbst ist nur ein Halter ohne Fläche (die Widget-Regel gibt ihm sonst Padding und Hintergrund).
    out.push('#cvz-cs-portal{padding:0 !important;background:transparent !important;position:static;}');
    return out.join('');
  }

  var CHAT_PANEL_STYLES = [
    /* Button "Fragen zum Bericht" rechts in der Sprungleiste. Ohne CSS-Variablen, weil die Leiste beim Scrollen am body hängt. */
    '.cvz-cs-anchor-row{display:flex;align-items:stretch;gap:0;width:100%;}',
    '.cvz-cs-anchor-row>.cvz-cs-anchor-inner{flex:1 1 auto;min-width:0;width:auto;}',
    '.cvz-cs-anchor-row>.cvz-cs-anchor-select{flex:1 1 auto;min-width:0;}',
    '.cvz-cs-anchor-nav button.cvz-cs-anchor-ask{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;margin:6px 8px 6px 12px !important;padding:7px 14px !important;',
      'background:#4fd1c5 !important;color:#0d1117 !important;border:1px solid #4fd1c5 !important;border-radius:0 !important;font-family:"Geist","DM Sans",sans-serif !important;',
      'font-size:13px !important;font-weight:600 !important;line-height:1.2 !important;cursor:pointer;white-space:nowrap;box-shadow:none !important;text-transform:none !important;letter-spacing:0 !important;}',
    '.cvz-cs-anchor-nav button.cvz-cs-anchor-ask:hover{background:#38b2ac !important;border-color:#38b2ac !important;}',
    '.cvz-cs-anchor-nav button.cvz-cs-anchor-ask:focus-visible{outline:2px solid #e6edf3;outline-offset:2px;}',
    '.cvz-cs-anchor-ask svg{width:15px;height:15px;flex:0 0 auto;}',
    '@media(max-width:600px){.cvz-cs-anchor-nav button.cvz-cs-anchor-ask{margin:8px 0 8px 8px !important;padding:9px 12px !important;}.cvz-cs-anchor-ask-long{display:none;}}',
    '@media(min-width:601px){.cvz-cs-anchor-ask-short{display:none;}}',
    /* Panel: Desktop von rechts, Handy von unten. */
    '#cvz-cs-portal .cvz-cs-chat-panel{position:fixed;right:0;bottom:0;z-index:10000;width:min(440px,100vw);display:flex;flex-direction:column;',
      'background:#0d1117;color:#e2e8f0;border-left:1px solid rgba(255,255,255,.16);box-shadow:-12px 0 32px rgba(0,0,0,.45);',
      'font-family:"Geist","Inter",system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.65;',
      'transform:translateX(105%);visibility:hidden;transition:transform .22s ease,visibility 0s linear .22s;}',
    '#cvz-cs-portal .cvz-cs-chat-panel.is-open{transform:none;visibility:visible;transition:transform .22s ease,visibility 0s;}',
    '#cvz-cs-portal .cvz-cs-chat-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);}',
    '#cvz-cs-portal .cvz-cs-chat-panel-title{font-family:"Syne",sans-serif;font-weight:700;font-size:1.05rem;color:#f0f4f8;margin:0;}',
    '#cvz-cs-portal button.cvz-cs-chat-panel-close{background:transparent !important;border:1px solid rgba(255,255,255,.16) !important;color:#e2e8f0 !important;width:34px;height:34px;padding:0 !important;font-size:20px;line-height:1;cursor:pointer;border-radius:0 !important;}',
    '#cvz-cs-portal button.cvz-cs-chat-panel-close:hover{border-color:#4fd1c5 !important;color:#4fd1c5 !important;}',
    '#cvz-cs-portal .cvz-cs-chat-panel-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding:12px 16px 14px;overflow:hidden;}',
    '#cvz-cs-portal .cvz-cs-chat-panel .cvz-cs-chat{margin:0;padding:0;border:0;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',
    '#cvz-cs-portal .cvz-cs-chat-panel .cvz-cs-chat-messages{flex:1 1 auto;min-height:0;max-height:none;overflow-y:auto;}',
    '#cvz-cs-portal .cvz-cs-chat-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:none;}',
    '@media(max-width:600px){',
      '#cvz-cs-portal .cvz-cs-chat-panel{left:0;right:0;top:auto !important;width:100%;height:85vh;height:85dvh;border-left:0;border-top:1px solid rgba(255,255,255,.16);box-shadow:0 -12px 32px rgba(0,0,0,.45);transform:translateY(105%);}',
      '#cvz-cs-portal .cvz-cs-chat-panel.is-open{transform:none;}',
      '#cvz-cs-portal .cvz-cs-chat-backdrop.is-open{display:block;}',
    '}',
    '@media print{#cvz-cs-portal{display:none !important;}}',
    /* Hinweis am Ende des Berichts (früher stand dort der ganze Chat) */
    '.cvz-cs-chat-teaser{margin-top:36px;padding:20px;border:1px solid var(--cvz-border);background:var(--cvz-surface);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}',
    '.cvz-cs-chat-teaser p{margin:0 !important;}',
    /* Nachfragen direkt in den Seitenkarten */
    '#cvz-content-strategy-agent button.cvz-cs-ask-link{display:inline-flex;align-items:center;gap:6px;margin:4px 0 12px;padding:0 !important;background:none !important;border:0 !important;',
      'color:var(--cvz-teal) !important;font:inherit;font-size:14px;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px;}',
    '#cvz-content-strategy-agent button.cvz-cs-ask-link:hover{color:var(--cvz-teal-hover) !important;}',
    '.cvz-cs-ask-link svg{width:14px;height:14px;}',
  ];

  // ==================== STYLES-ENDE ====================

  function ensureMarkedLoaded() {
    if (markedLoadStarted || typeof marked !== 'undefined') return;
    markedLoadStarted = true;
    var script = document.createElement('script');
    script.src = MARKED_CDN_URL;
    script.onerror = function () {
      console.warn('cvz-content-strategy-agent: "marked" konnte nicht von ' + MARKED_CDN_URL + ' nachgeladen werden - Markdown in Bericht/Chat faellt auf reinen Text zurueck.');
    };
    document.head.appendChild(script);
  }

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
    pillar_page: 'Pillar-Page (Themen-Hub)',
  };

  var PAGE_TYPE_EXPLANATIONS = {
    pillar_page: 'Eine Pillar-Page ist eine breite Übersichtsseite zu einem Kern-Thema, die mehrere verwandte Unterseiten bündelt und zu ihnen verlinkt - baut Themenautorität auf und dient als zentrale Anlaufstelle im Cluster.',
  };

  var ROLE_LABELS = {
    coverage: 'Trust/Themenabdeckung',
    citation: 'Rank- & Zitier-Ziel',
    existing: 'bereits vorhanden',
  };

  var MESSY_MIDDLE_PHASES = [
    { value: 'exploration', label: 'Erforschung', description: 'Schafft Bewusstsein und deckt offene Grundlagenfragen ab.' },
    { value: 'evaluation', label: 'Bewertung', description: 'Prüft Eignung und Nutzen anhand von Kriterien.' },
    // BUGFIX: "comparison" ist seit der Vier-Phasen-Umstellung eine Pflicht-Phase im Backend,
    // fehlte hier aber. Vergleichsseiten landeten dadurch unter "Weitere Seiten".
    { value: 'comparison', label: 'Vergleich', description: 'Stellt mehrere Anbieter oder Optionen direkt gegenüber.' },
    { value: 'decision', label: 'Entscheidung', description: 'Unmittelbar vor der Kaufentscheidung.' },
    { value: 'legacy', label: 'Weitere Seiten', description: 'Aus einer älteren Strategie-Version ohne Phasen-Zuordnung.' },
  ];

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
    trackerTopics: [],
    pollHandle: null,
    pollStartedAt: null,
    currentSessionId: null,
    currentResult: null,
    visibilityPrompts: [],
    wizardActive: false,
    wizardSteps: null,
    chat: {
      sessionId: null,
      messages: [],
      messagesUsed: 0,
      messagesLimit: 20,
      pollHandle: null,
      pollStartedAt: null,
      sending: false,
      _pendingUserMessage: null,
    },
  };

  // ==================== API-HELFER ====================
  function apiFetch(path, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (state.memberstackToken) headers.Authorization = 'Bearer ' + state.memberstackToken;
    return fetch(CONFIG.apiBaseUrl + path, Object.assign({}, options, { headers: headers }))
      .catch(function (fetchErr) {
        // NEU (siehe Chat-Verlauf, "Load failed" beim Deployment): fetch scheitert ohne Antwort, wenn die Verbindung
        // abreißt (Safari: "Load failed", Chrome: "Failed to fetch"). Das wird als Netzwerkfehler markiert, damit
        // der Assistent es wiederholen und die Eingaben behalten kann. Eine eigene Zeitüberschreitung (AbortError)
        // bleibt, wie sie ist.
        if (fetchErr && fetchErr.name === 'AbortError') throw fetchErr;
        var netErr = new Error('Die Verbindung zum Server wurde unterbrochen.');
        netErr.network = true;
        netErr.original = fetchErr;
        throw netErr;
      })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) {
            var err = new Error(body.error || 'API-Fehler (' + res.status + ')');
            err.status = res.status;
            err.body = body;
            // NEU: 502 bis 504 kommen vom Hosting, wenn der Server gerade neu startet. Gleiche Behandlung wie ein Abbruch.
            if (res.status >= 502 && res.status <= 504) err.network = true;
            throw err;
          }
          return body;
        });
      });
  }

  // NEU: wiederholt eine Anfrage nach einem Netzwerkfehler (Server startet z.B. gerade neu). attempt() muss bei jedem
  // Versuch eine NEUE Anfrage starten. Nur für Schritte, die sich gefahrlos wiederholen lassen (kein Kontingent-Verbrauch):
  // Themen-Prüfung, Zielgruppen-Vorschlag, Prompt-Plan. NICHT für /generate, dort könnte ein Lauf doppelt starten.
  var NETWORK_RETRY_DELAY_MS = 5000;
  function withNetworkRetry(attempt, retries, onRetry) {
    return attempt().catch(function (err) {
      if (!err || !err.network || retries <= 0) throw err;
      if (onRetry) onRetry();
      return new Promise(function (resolve) { setTimeout(resolve, NETWORK_RETRY_DELAY_MS); }).then(function () {
        return withNetworkRetry(attempt, retries - 1, onRetry);
      });
    });
  }

  // ==================== NEU: ENTWURF IM BROWSER ====================
  // Speichert den Stand des Assistenten (Themen-Prüfung, Zielgruppe, Fragen) im Browser, damit ein Verbindungsabbruch
  // oder ein Neuladen der Seite die Eingaben nicht löscht. localStorage statt sessionStorage, damit der Entwurf auch
  // nach dem Schließen des Tabs da ist. Gebunden an die User-ID und 24 Stunden gültig. Speicher kann im privaten
  // Modus fehlen oder blockiert sein, deshalb läuft jeder Zugriff in try/catch und der Assistent funktioniert auch ohne.
  var DRAFT_KEY = 'cvz-cs-wizard-draft-v1';
  var DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  var DRAFT_STEP_LABELS = { validation: 'Thema bestätigen', profile: 'Produkt bestätigen', audience: 'Zielgruppe bestätigen', promptplan: 'Fragen auswählen' };

  function saveDraft(step, data) {
    if (!state.userId) return;
    // NEU: Strategie-Ziel aus dem Startformular gehört zu jedem Entwurf, sonst fehlt es nach dem Wiederherstellen.
    if (data && state.strategyGoal) data.strategyGoal = state.strategyGoal;
    if (data && state.existingMagnets) data.existingMagnets = state.existingMagnets; // NEU: vorhandene Lead-Magneten
    if (data && state.productProfile) data.productProfile = state.productProfile; // NEU (Produktprofil): bestätigte Fassung
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, userId: state.userId, savedAt: Date.now(), step: step, data: data }));
    } catch (e) { /* Speicher voll oder blockiert: ohne Entwurf weiter */ }
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var draft = JSON.parse(raw);
      if (!draft || draft.v !== 1 || draft.userId !== state.userId || !DRAFT_STEP_LABELS[draft.step] || !draft.data) return null;
      if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) { clearDraft(); return null; }
      return draft;
    } catch (e) {
      return null;
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* egal */ }
  }

  function draftTopic(draft) {
    var d = draft.data || {};
    return d.topic || (d.result && d.result.seed_topic) || d.originalTopic || '';
  }

  // Öffnet den gespeicherten Schritt wieder, mit allen Eingaben.
  function resumeDraft(draft) {
    var d = draft.data;
    state.strategyGoal = d.strategyGoal || null;
    state.existingMagnets = d.existingMagnets || null;
    state.productProfile = d.productProfile || null; // NEU (Produktprofil)
    if (draft.step === 'validation') {
      state.productUrl = d.productUrl || '';
      state.wizardSteps = wizardStepsFor(d.trackerTopicId, d.domain);
      renderTopicValidationResult(d.result, d.domain, d.originalTopic, d.trackerTopicId);
    } else if (draft.step === 'profile') {
      state.productProfile = null; // wird erst beim Bestätigen gesetzt
      state.wizardSteps = wizardStepsFor(d.ctx && d.ctx.trackerTopicId, d.ctx && d.ctx.domain);
      renderProfileStep(d.res, d.ctx, d.profile);
    } else if (draft.step === 'audience') {
      state.wizardSteps = wizardStepsFor(null, d.domain);
      renderAudienceStep(d.audience, d.topic, d.domain, d.validationId, d.originalTopic);
    } else if (draft.step === 'promptplan') {
      state.wizardSteps = wizardStepsFor(null, d.domain);
      renderPromptPlanStep(d.res, d.topic, d.domain, d.validationId, d.audience, d.originalTopic, d.deselected, d.edits);
    }
  }

  function renderDraftBanner(draft) {
    var topic = draftTopic(draft);
    var minutes = Math.max(1, Math.round((Date.now() - draft.savedAt) / 60000));
    var age = minutes < 60 ? 'vor ' + minutes + ' Min.' : 'vor ' + Math.round(minutes / 60) + ' Std.';
    var banner = el('div', { class: 'cvz-cs-callout' });
    banner.appendChild(el('p', {}, [
      el('strong', {}, ['Angefangene Strategie gefunden: ']),
      '"' + topic + '", zuletzt bei Schritt "' + DRAFT_STEP_LABELS[draft.step] + '" (' + age + '). Deine Eingaben sind noch da.',
    ]));
    var resumeBtn = el('button', { type: 'button', class: 'cvz-cs-submit-btn' }, ['Dort weitermachen']);
    resumeBtn.addEventListener('click', function () { resumeDraft(draft); });
    var discardBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['Verwerfen']);
    discardBtn.addEventListener('click', function () {
      clearDraft();
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    });
    banner.appendChild(el('div', { class: 'cvz-cs-topic-check-actions' }, [discardBtn, resumeBtn]));
    return banner;
  }

  // NEU: Fehleranzeige innerhalb des Assistenten. Anders als renderError springt sie nicht zum leeren Formular, sondern
  // bietet "Erneut versuchen" mit denselben Daten und einen Weg zurück zum letzten Schritt, mit allen Eingaben.
  function renderStepError(err, label, options) {
    state.wizardActive = true;
    clear(state.root);
    // GEÄNDERT (Live-Fall: Datendienst langsam oder mit HTTP 500): Der Server nennt die Fehlerart (body.code). Statt der rohen Meldung
    // ("... nach 60000ms abgebrochen (Timeout-Schutz ...)") steht dann, was los ist und was der Nutzer tun kann. Details bleiben aufklappbar.
    var code = err && err.body && err.body.code;
    var SAVED = ' Deine Eingaben sind gespeichert.';
    var NOT_YOU = ' Das liegt nicht an deiner Eingabe.';
    var text = err && err.network
      ? label + ': Die Verbindung zum Server wurde unterbrochen, vermutlich durch ein kurzes Update.' + SAVED + ' Bitte versuche es in ein paar Sekunden erneut.'
      : code === 'zeitlimit' || (err && err.name === 'AbortError')
        ? label + ': Ein externer Dienst, von dem wir Suchdaten oder KI-Antworten beziehen, hat zu lange gebraucht.' + NOT_YOU + ' Meist klappt es nach ein paar Minuten wieder.' + SAVED
        : code === 'datenanbieter'
          ? label + ': Unser Anbieter für Suchdaten meldet gerade einen Fehler.' + NOT_YOU + ' Solche Störungen sind meist nach kurzer Zeit behoben. Bitte versuche es in ein paar Minuten erneut.' + SAVED
          : code === 'ki_ueberlastet'
            ? label + ': Der KI-Dienst ist gerade stark ausgelastet.' + NOT_YOU + ' Bitte versuche es in ein bis zwei Minuten erneut.' + SAVED
            : label + ' fehlgeschlagen: ' + (err && err.message ? err.message : 'unbekannter Fehler') + '.' + SAVED;
    var box = el('div', { class: 'cvz-cs-error' }, [el('p', {}, [text])]);
    if (code && code !== 'fehler' && err.message) {
      box.appendChild(el('details', { class: 'cvz-cs-expand' }, [el('summary', {}, ['Technische Details']), el('p', { class: 'cvz-cs-hint' }, [err.message])]));
    }
    var actions = [];
    if (options.back) {
      var backBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, [options.backLabel || 'Zurück']);
      backBtn.addEventListener('click', options.back);
      actions.push(backBtn);
    }
    if (options.skip) {
      var skipBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, [options.skipLabel || 'Überspringen']);
      skipBtn.addEventListener('click', options.skip);
      actions.push(skipBtn);
    }
    if (options.retry) {
      var retryBtn = el('button', { type: 'button', class: 'cvz-cs-submit-btn' }, ['Erneut versuchen']);
      retryBtn.addEventListener('click', options.retry);
      actions.push(retryBtn);
    }
    box.appendChild(el('div', { class: 'cvz-cs-topic-check-actions' }, actions));
    state.root.appendChild(renderQuotaBanner());
    if (state.wizardSteps) state.root.appendChild(renderStepper(state.wizardSteps, options.stepIndex || 0, true));
    state.root.appendChild(box);
  }

  // Fortschritts-Hinweis während der automatischen Wiederholung.
  function noteRetrying() {
    var p = state.root && state.root.querySelector('.cvz-cs-progress-text');
    if (p) p.textContent = 'Verbindung unterbrochen, ich versuche es gleich noch einmal …';
  }

  // ==================== MEMBERSTACK-IDENTITÄT ====================
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
        console.warn('GSC-Status konnte nicht geladen werden:', err.message);
        state.gscStatus = { connected: false, sites: [] };
        return state.gscStatus;
      });
  }

  // NEU (Tracker-Verbindung): Tracker-Themen, die der User sehen darf. Fehler sind bewusst
  // nicht fatal: ohne Liste wird die Auswahl einfach nicht angezeigt, der Rest funktioniert.
  function loadTrackerTopics() {
    return apiFetch('/api/content-strategy/tracker-topics')
      .then(function (data) {
        state.trackerTopics = (data && data.topics) || [];
        state.trackerTopicsError = null;
        return state.trackerTopics;
      })
      .catch(function (err) {
        console.warn('Tracker-Themen konnten nicht geladen werden:', err.message);
        state.trackerTopicsError = err && err.message ? err.message : 'unbekannter Fehler'; // NEU: im Formular sichtbar statt still ausgeblendet
        state.trackerTopics = [];
        return state.trackerTopics;
      });
  }

  // ==================== RENDERING ====================
  // Anbieter-Namen (DataForSEO) gehören nicht in die Oberfläche: Kunden kennen sie nicht. Das Backend
  // filtert neue Berichte; dieser Filter deckt auch bereits gespeicherte Berichte ab.
  function scrubProviderNames(text) {
    return String(text).replace(/\bdata\s?for\s?seo\b/gi, 'Suchdaten');
  }

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
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(scrubProviderNames(child)) : child);
    });
    return node;
  }

  function clear(node) {
    // NEU: Verlässt man den Bericht (neue Strategie, Formular), muss die Sprungleiste weg. Sie hängt beim Scrollen am
    // body und würde sonst über anderen Ansichten stehen bleiben.
    if (node === state.root && state.anchorNavCleanup) {
      try { state.anchorNavCleanup(); } catch (e) { /* egal */ }
      state.anchorNavCleanup = null;
    }
    // NEU: Das Chat-Panel hängt ebenfalls am body und muss beim Verlassen des Berichts weg.
    if (node === state.root && state.chatPanel) {
      try { state.chatPanel.destroy(); } catch (e) { /* egal */ }
      state.chatPanel = null;
    }
    if (node === state.root) state.anchorNavEl = null;
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

  var GEO_LLM_TYPE_OPTIONS = [
    { value: 'chat_gpt', label: 'ChatGPT (OpenAI)' },
    { value: 'gemini', label: 'Google Gemini' },
    { value: 'perplexity', label: 'Perplexity' },
    { value: 'claude', label: 'Claude (Anthropic)' },
  ];

  var GEO_LLM_TYPE_LABELS = GEO_LLM_TYPE_OPTIONS.reduce(function (acc, o) {
    acc[o.value] = o.label;
    return acc;
  }, {});

  // ==================== SCHRITT-ANZEIGE ====================
  // Zeigt dem Kunden vorab und in jedem Schritt, was noch kommt. Wichtig: Bis zum letzten Schritt
  // gehen Eingaben verloren, wenn die Seite geschlossen wird. Erst die Erstellung läuft im Hintergrund.
  // NEU (Produktprofil): "Produkt bestätigen" steht nach der Themen-Prüfung. Ohne Domain gibt es den Schritt nicht (siehe wizardStepsFor).
  var STEPS_FULL = ['Thema prüfen und bestätigen', 'Produkt bestätigen', 'Zielgruppe bestätigen', 'Fragen auswählen', 'Strategie wird erstellt'];
  var STEPS_FULL_SHORT = ['Thema prüfen und bestätigen', 'Zielgruppe bestätigen', 'Fragen auswählen', 'Strategie wird erstellt'];
  var STEPS_TRACKER = ['Thema prüfen und bestätigen', 'Produkt bestätigen', 'Strategie wird erstellt'];
  var STEPS_TRACKER_SHORT = ['Thema prüfen und bestätigen', 'Strategie wird erstellt'];
  var STEP_LAST_HINT = 'ab hier läuft alles im Hintergrund';
  // GEÄNDERT: Der alte Text ("Bis dahin gehen deine Eingaben verloren") stimmte nicht mehr: Der Stand wird ab der Themen-Bestätigung 24 Stunden im Browser gespeichert.
  var STEP_LEAVE_WARNING = 'Dein Stand wird ab der Themen-Bestätigung 24 Stunden in diesem Browser gespeichert. Du kannst die Seite also schließen und später weitermachen. Erst ab „Strategie wird erstellt“ läuft alles im Hintergrund.';

  // current: Index des aktuellen Schritts (0-basiert), -1 = noch nichts begonnen (Vorschau im Formular)
  function renderStepper(steps, current, withWarning) {
    var list = el('ol', { class: 'cvz-cs-stepper' });
    steps.forEach(function (label, i) {
      var cls = i < current ? 'cvz-cs-step-done' : i === current ? 'cvz-cs-step-current' : '';
      var isLast = i === steps.length - 1;
      list.appendChild(el('li', { class: cls }, [
        el('span', { class: 'cvz-cs-step-num' }, [i < current ? '✓' : String(i + 1)]),
        label + (isLast ? ' (' + STEP_LAST_HINT + ')' : ''),
      ]));
    });
    var box = el('div', { class: 'cvz-cs-stepbox' }, [
      el('p', { class: 'cvz-cs-stepbox-title' }, [current < 0 ? 'So läuft es ab' : 'Schritt ' + (current + 1) + ' von ' + steps.length, withWarning ? tip(STEP_LEAVE_WARNING, 'Wann kann ich die Seite schließen?') : null]),
      list,
    ]);
    return box;
  }

  // Mehrzeiliges Feld, das so hoch wird wie sein Text (statt einzeilig abzuschneiden).
  // Die Höhe wird nach dem Einfügen in die Seite und bei jeder Eingabe neu berechnet.
  function autoGrow(area) {
    area.style.height = 'auto';
    area.style.height = Math.max(area.scrollHeight + 2, 42) + 'px';
  }
  function makeGrowArea(value, placeholder, registry) {
    var area = el('textarea', { class: 'cvz-cs-autogrow', rows: '1' });
    if (placeholder) area.setAttribute('placeholder', placeholder);
    area.value = value || '';
    area.addEventListener('input', function () { autoGrow(area); });
    if (registry) registry.push(area);
    return area;
  }
  // Ändert sich die Fensterbreite (Handy drehen, Fenster ziehen), brechen Zeilen anders um: neu berechnen.
  window.addEventListener('resize', function () {
    Array.prototype.forEach.call(document.querySelectorAll('textarea.cvz-cs-autogrow'), autoGrow);
  });
  function growAllLater(registry) {
    // Zweimal: sofort nach dem Einfügen und nochmal, wenn Schriften geladen sind (ändert die Textbreite).
    registry.forEach(autoGrow);
    setTimeout(function () { registry.forEach(autoGrow); }, 150);
  }

  // Wirkt nur, solange der Kunde in den Schritten VOR der Erstellung ist (state.wizardActive).
  window.addEventListener('beforeunload', function (event) {
    if (!state.wizardActive) return;
    event.preventDefault();
    event.returnValue = '';
  });

  function renderForm(prefill) {
    state.wizardActive = false;
    prefill = prefill || {};
    var form = el('form', { class: 'cvz-cs-form' });
    var topicInput = el('input', { type: 'text', name: 'topic', placeholder: 'z.B. "Landingpage Software für B2B"', required: 'required' });
    if (prefill.topic) topicInput.value = prefill.topic;
    var domainInput = el('input', { type: 'text', name: 'domain', placeholder: 'z.B. https://convertlyze.com/produkte/dein-angebot' });
    if (prefill.domain) {
      domainInput.value = prefill.domain;
    } else if (state.gscStatus && state.gscStatus.connected && state.gscStatus.sites.length === 1) {
      var suggested = state.gscStatus.sites[0].site_url.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      domainInput.value = suggested;
    }
    form.appendChild(el('label', { class: 'cvz-cs-label' }, ['Thema / Ziel-Keyword', topicInput]));
    form.appendChild(el('label', { class: 'cvz-cs-label' }, [el('span', { class: 'cvz-cs-label-text' }, ['Website oder Produktseite deines Angebots', tip('Trage am besten die Seite deines Angebots ein. Daraus wird die Domain für die Sichtbarkeits-Messung abgeleitet, und das Produktprofil entsteht aus dieser Seite statt aus der Startseite. Eine Domain genügt, wenn dein Angebot keine eigene Seite hat. Ohne Tracker-Daten brauchen wir die Domain, um deine Sichtbarkeit zu messen.')]), domainInput]));

    // NEU (siehe Chat-Verlauf, Positionierung): Angebotstyp und Zielaktion. Ohne diese Angaben hat die Strategie bei einem
    // SaaS-Tool Agentur-Texte empfohlen ("Erstgespräch vereinbaren"). Die Zielaktion wird passend zum Angebotstyp vorbelegt.
    var goalPrefill = prefill.strategyGoal || state.strategyGoal || {};
    var offerSelect = el('select', { name: 'offer_type', required: 'required' }, [el('option', { value: '' }, ['Bitte wählen'])]
      .concat(OFFER_TYPE_GROUPS.map(function (g) {
        return el('optgroup', { label: g }, OFFER_TYPE_OPTIONS.filter(function (o) { return o.group === g; }).map(function (o) { return el('option', { value: o.value }, [o.label]); }));
      })));
    var goalSelect = el('select', { name: 'end_goal', required: 'required' }, [el('option', { value: '' }, ['Bitte wählen'])]
      .concat(END_GOAL_OPTIONS.map(function (o) { return el('option', { value: o.value }, [o.label]); })));
    var ctaInput = el('input', { type: 'text', name: 'cta_label', maxlength: '80', placeholder: 'z.B. "Eigene Content-Strategie starten"' });
    if (goalPrefill.offer_type) offerSelect.value = goalPrefill.offer_type;
    if (goalPrefill.end_goal) goalSelect.value = goalPrefill.end_goal;
    if (goalPrefill.cta_label) ctaInput.value = goalPrefill.cta_label;
    var goalTouched = !!goalPrefill.end_goal;
    goalSelect.addEventListener('change', function () { goalTouched = true; });
    offerSelect.addEventListener('change', function () {
      // Vorbelegung nur, solange der Kunde die Zielaktion nicht selbst gewählt hat.
      if (!goalTouched && DEFAULT_END_GOAL[offerSelect.value]) goalSelect.value = DEFAULT_END_GOAL[offerSelect.value];
    });
    form.appendChild(el('label', { class: 'cvz-cs-label' }, [el('span', { class: 'cvz-cs-label-text' }, ['Was kauft dein Kunde bei diesem Thema?', tip('Wähle das Hauptangebot, also das, was der Kunde bei diesem Thema kauft. Es bestimmt Ton und Wortwahl der Strategie, die vorgeschlagene Zielaktion und die Einschätzung, was ein Kunde wert ist. Was zusätzlich dazugehört, kannst du darunter angeben. Wettbewerb und Kategorie ergänzt das Produktprofil im nächsten Schritt.')]), offerSelect]));
    // NEU (Pakete): Was zusätzlich dazugehört, höchstens zwei. Ändert keine Regel, sondern fließt als Zusatz in die Inhalte ein (Backend: alsoOffersLine).
    // Eingeklappt, damit nicht aus Gewohnheit alles angehakt wird. Das Hauptangebot steht nicht zur Wahl.
    var ALSO_MAX = 2;
    var alsoChecks = [];
    var alsoInfo = el('p', { class: 'cvz-cs-hint' });
    var alsoList = el('div', { class: 'cvz-cs-also-list' });
    OFFER_TYPE_OPTIONS.forEach(function (o) {
      var box = el('input', { type: 'checkbox', value: o.value });
      box.checked = (goalPrefill.also_offers || []).indexOf(o.value) !== -1;
      var row = el('label', { class: 'cvz-cs-also-item' }, [box, ' ' + o.label]);
      alsoChecks.push({ box: box, row: row, value: o.value });
      alsoList.appendChild(row);
    });
    function refreshAlso() {
      var main = offerSelect.value;
      var picked = 0;
      alsoChecks.forEach(function (c) {
        var isMain = c.value === main;
        if (isMain) c.box.checked = false;
        c.row.style.display = isMain ? 'none' : '';
        if (c.box.checked) picked++;
      });
      alsoChecks.forEach(function (c) { c.box.disabled = !c.box.checked && picked >= ALSO_MAX; c.row.classList.toggle('is-off', c.box.disabled); });
      alsoInfo.textContent = picked >= ALSO_MAX ? 'Höchstens zwei. Für getrennte Angebote erstelle besser je Angebot eine eigene Strategie.' : 'Höchstens zwei, zum Beispiel ein Projekt mit anschließendem Betrieb.';
    }
    alsoChecks.forEach(function (c) { c.box.addEventListener('change', refreshAlso); });
    offerSelect.addEventListener('change', refreshAlso);
    refreshAlso();
    var alsoBox = el('details', { class: 'cvz-cs-also cvz-cs-expand' }, [ // GEÄNDERT: als Aufklapp-Knopf erkennbar
      el('summary', {}, ['Gehört zu diesem Angebot noch etwas dazu? (optional)', tip('Zum Beispiel ein IT-Projekt, nach dem ihr den Betrieb übernehmt, oder eine Software, zu der ihr Einführung und Schulung anbietet. Das ändert keine Regel der Strategie: Ton, Weg zur Zielaktion und Kundenwert folgen dem Hauptangebot. Die Strategie greift die Zusatzangebote dort auf, wo Käufer danach fragen.', 'Wozu dient das?')]),
      alsoInfo,
      alsoList,
    ]);
    if ((goalPrefill.also_offers || []).length > 0) alsoBox.setAttribute('open', 'open');
    form.appendChild(alsoBox);
    form.appendChild(el('label', { class: 'cvz-cs-label' }, [
      // GEÄNDERT: "am Ende ausführen" lud zur Antwort "Kauf" ein. Gemeint ist der letzte Schritt, den die Website auslöst.
      el('span', { class: 'cvz-cs-label-text' }, ['Was soll ein Interessent auf deiner Website als Letztes tun?', tip('Das ist die Zielaktion, auf die die ganze Strategie einzahlt. Sie zeigt den Weg dorthin, mit Zwischenschritten je Phase der Customer Journey. Der Weg richtet sich nach der Zielaktion: Eine Demo braucht anderes Vertrauen als ein Pilot oder eine Partnerschaft.')]),
      goalSelect,
      el('span', { class: 'cvz-cs-hint' }, ['Gemeint ist nicht der Vertragsabschluss, sondern der Schritt, den deine Website auslöst, zum Beispiel eine Demo-Anfrage. Den Kauf selbst wickelt im B2B meist der Vertrieb ab.']),
    ]));
    form.appendChild(el('label', { class: 'cvz-cs-label' }, [
      el('span', { class: 'cvz-cs-label-text' }, ['Text deines Haupt-Buttons (optional)', tip('Leer lassen, dann schlägt die Strategie einen Text passend zur Zielaktion vor.')]),
      ctaInput,
    ]));
    // NEU (Lead-Magneten): Was es schon gibt, wird nicht noch einmal vorgeschlagen, sondern sinnvoll ergänzt.
    var magnetsInput = el('textarea', { name: 'existing_magnets', rows: '2', maxlength: '600', placeholder: 'z.B. 7 Tage Testversion, Checkliste zum Thema, kostenloser Rechner' });
    magnetsInput.value = prefill.existingMagnets || state.existingMagnets || '';
    form.appendChild(el('label', { class: 'cvz-cs-label' }, [
      el('span', { class: 'cvz-cs-label-text' }, ['Welche Lead-Magneten oder kostenlosen Tools gibt es schon? (optional)', tip('Die Strategie schlägt Zwischenschritte für den Funnel vor, zum Beispiel Checks, Rechner oder Vorlagen. Was du schon hast, wird nicht doppelt vorgeschlagen.')]),
      magnetsInput,
    ]));
    // NEU (Tracker-Verbindung). GEÄNDERT: Das Feld ist immer da. Früher verschwand es still, wenn keine Tracker-Themen kamen (keine angelegt
    // oder Abruf fehlgeschlagen). Dann sah es aus, als gäbe es die Verbindung nicht mehr.
    var trackerSelect = null;
    if (state.trackerTopics.length === 0) {
      form.appendChild(el('div', { class: 'cvz-cs-label' }, [
        el('span', { class: 'cvz-cs-label-text' }, ['Daten aus dem Customer Journey Tracker einbeziehen?', tip('Die Strategie berücksichtigt dann deine gemessene KI-Sichtbarkeit je Journey-Phase, zitierte Quellen und die Wirkung bereits umgesetzter Maßnahmen.')]),
        el('p', { class: 'cvz-cs-hint cvz-cs-tracker-empty' }, [state.trackerTopicsError
          ? 'Deine Tracker-Themen konnten gerade nicht geladen werden (' + state.trackerTopicsError + '). Lade die Seite neu, um sie auszuwählen. Ohne Auswahl läuft die Strategie mit einer frischen Messung.'
          : 'Für dein Konto gibt es noch kein Thema im Customer Journey Tracker. Legst du dort ein passendes Thema an, kannst du es hier auswählen, und seine Messdaten fließen in die Strategie ein.']),
      ]));
    }
    if (state.trackerTopics.length > 0) {
      trackerSelect = el('select', { name: 'tracker_topic_id' }, [el('option', { value: '' }, ['Keine Tracker-Daten einbeziehen'])]);
      state.trackerTopics.forEach(function (t) {
        var label = t.name + (t.own_domain ? ' (' + t.own_domain + ')' : '');
        trackerSelect.appendChild(el('option', { value: t.id }, [label]));
      });
      if (prefill.trackerTopicId) trackerSelect.value = prefill.trackerTopicId;
      form.appendChild(
        el('label', { class: 'cvz-cs-label' }, [
          el('span', { class: 'cvz-cs-label-text' }, ['Daten aus dem Customer Journey Tracker einbeziehen?', tip('Die Strategie berücksichtigt dann deine gemessene KI-Sichtbarkeit je Journey-Phase, zitierte Quellen und die Wirkung bereits umgesetzter Maßnahmen. Wähle ein Tracker-Thema, das zum Strategie-Thema passt.')]),
          trackerSelect,
        ])
      );
    }
    form.appendChild(
      el('p', { class: 'cvz-cs-hint' }, [
        'Ohne Tracker-Daten messen wir deine KI-Sichtbarkeit einmalig frisch: ca. 16 Fragen deiner Zielgruppe, je 3 Mal bei ChatGPT und Gemini. Du bestätigst vorher Zielgruppe und Fragen.',
      ])
    );
    var formError = el('p', { class: 'cvz-cs-quota-empty' });
    form.appendChild(formError);
    // Vorschau der Schritte, passt sich an, ob Tracker-Daten gewählt sind (dann entfallen Zielgruppe und Fragen).
    var overview = el('div', {});
    function refreshOverview() {
      clear(overview);
      overview.appendChild(renderStepper(trackerSelect && trackerSelect.value ? STEPS_TRACKER : STEPS_FULL, -1, true));
    }
    refreshOverview();
    if (trackerSelect) trackerSelect.addEventListener('change', refreshOverview);
    form.appendChild(overview);
    var canStart = !state.quota || state.quota.can_start_session;
    var submitBtn = el('button', { type: 'submit', class: 'cvz-cs-submit-btn' }, ['Content-Cluster erstellen']);
    if (!canStart) submitBtn.setAttribute('disabled', 'disabled');
    form.appendChild(submitBtn);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var topic = topicInput.value.trim();
      var site = splitSiteInput(domainInput.value);
      var domain = site.domain;
      if (!topic) return;
      if (site.error) { formError.textContent = site.error; return; }
      var trackerTopicId = trackerSelect && trackerSelect.value ? trackerSelect.value : null;
      if (!trackerTopicId && !domain) {
        formError.textContent = 'Bitte die Website oder Produktseite deines Angebots angeben: Ohne Tracker-Daten brauchen wir die Domain, um deine Sichtbarkeit zu messen.';
        return;
      }
      if (!offerSelect.value || !goalSelect.value) {
        formError.textContent = 'Bitte angeben, was du anbietest und worauf die Strategie einzahlen soll.';
        return;
      }
      var cta = ctaInput.value.trim();
      state.strategyGoal = { offer_type: offerSelect.value, end_goal: goalSelect.value };
      if (cta.length >= 2) state.strategyGoal.cta_label = cta.slice(0, 80);
      var also = alsoChecks.filter(function (c) { return c.box.checked && c.value !== offerSelect.value; }).map(function (c) { return c.value; }).slice(0, ALSO_MAX);
      if (also.length > 0) state.strategyGoal.also_offers = also;
      state.existingMagnets = magnetsInput.value.trim().slice(0, 600) || null;
      state.productUrl = site.productUrl || ''; // NEU: Produktseite aus dem Feld, für den Profil-Schritt
      formError.textContent = '';
      startTopicValidation(topic, domain || undefined, trackerTopicId);
    });
    return form;
  }

  // NEU: Angebotstyp und Zielaktion (gleiche Werte wie StrategyGoalSchema im Backend).
  // GEÄNDERT (B2B): acht Angebotstypen in drei Gruppen. Der Weg zur Zielaktion hängt von der Zielaktion ab, der Angebotstyp bestimmt Ton,
  // Wortwahl, die vorgeschlagene Zielaktion und die Ableitung des Kundenwerts.
  var OFFER_TYPE_GROUPS = ['Software', 'Produkte', 'Dienstleistungen'];
  var OFFER_TYPE_OPTIONS = [
    { value: 'saas', label: 'Software as a Service (SaaS)', group: 'Software' },
    { value: 'software_vertrieb', label: 'Software mit Vertrieb (Lizenz, Enterprise, On-Premise)', group: 'Software' },
    { value: 'b2b_produkt', label: 'Technisches B2B-Produkt (ohne Shop)', group: 'Produkte' },
    { value: 'produkt', label: 'Produkt (Online-Shop)', group: 'Produkte' },
    { value: 'beratung', label: 'Beratung (Expertise, Audit, Workshop)', group: 'Dienstleistungen' },
    { value: 'projekt', label: 'IT-Projekt und Systemhaus (Implementierung, Integration)', group: 'Dienstleistungen' },
    { value: 'managed_service', label: 'Managed Service und Outsourcing (laufender Betrieb)', group: 'Dienstleistungen' },
    { value: 'schulung', label: 'Schulung und Weiterbildung (Seminar, Zertifizierung, E-Learning, Inhouse)', group: 'Dienstleistungen' }, // NEU
    { value: 'dienstleistung', label: 'Agentur oder andere Dienstleistung', group: 'Dienstleistungen' },
  ];
  var END_GOAL_OPTIONS = [
    { value: 'registrierung', label: 'Registrierung oder Testzugang' },
    { value: 'demo', label: 'Demo oder Erstgespräch' },
    { value: 'anfrage', label: 'Anfrage oder Angebot' },
    { value: 'kauf', label: 'Kauf' },
    { value: 'lead', label: 'Lead über Download oder Newsletter' },
    { value: 'pilot', label: 'Pilot oder Proof of Concept' },
    { value: 'partner', label: 'Partner werden' },
    { value: 'event', label: 'Event oder Training buchen' },
  ];
  var DEFAULT_END_GOAL = { saas: 'registrierung', software_vertrieb: 'demo', b2b_produkt: 'anfrage', produkt: 'kauf', beratung: 'demo', projekt: 'anfrage', managed_service: 'anfrage', dienstleistung: 'demo', schulung: 'event' };
  function optionLabel(list, value) {
    var o = list.filter(function (x) { return x.value === value; })[0];
    return o ? o.label : value;
  }
  var ZWISCHENZIEL_ART_LABELS = {
    ohne_huerde: 'Ohne Hürde',
    gegen_email: 'Gegen E-Mail',
    produkt_erleben: 'Produkt erleben',
    beleg: 'Beleg',
    endziel: 'Zielaktion',
  };
  // ==== FUNNEL-KONSTANTEN-ANFANG ====
  // NEU (Funnel und Lead-Magneten): Bezeichnungen der Werte aus result.funnel_check und result.lead_magnets.
  var FUNNEL_STATUS_LABELS = { ok: 'Ok', schwach: 'Schwach', luecke: 'Lücke', keine_seiten: 'Keine Seiten' };
  var FUNNEL_STEP_ORDER = ['ohne_huerde', 'gegen_email', 'produkt_erleben', 'beleg', 'endziel', 'fehlt'];
  var BRIDGE_MODE_LABELS = {
    weiterfuehren: 'Weiterführen (noch kein Verkaufsschritt)',
    ergebnis_nutzen: 'Ergebnis als Anlass für den Endschritt',
    nachfassen: 'Per E-Mail nachfassen',
    direkt: 'Direkt zur Zielaktion',
  };
  var MAGNET_HURDLE_LABELS = { ohne_anmeldung: 'Ohne Anmeldung', email: 'Gegen E-Mail', registrierung: 'Mit Registrierung' };
  // ==== FUNNEL-KONSTANTEN-ENDE ====

  var INTENT_FIT_LABELS = {
    besser: 'Besserer Fit',
    gleichwertig: 'Gleichwertiger Fit',
    schlechter: 'Schwächerer Fit',
    zu_breit: 'Zu breit für das Angebot',
  };

  var TOPIC_RECOMMENDATION_LABELS = {
    thema_beibehalten: 'Empfehlung: ursprüngliches Thema beibehalten',
    thema_wechseln: 'Empfehlung: zu einer Alternative wechseln',
    // Wird nicht mehr erzeugt, bleibt nur für ältere gespeicherte Prüfungen.
    thema_erweitern: 'Empfehlung: Thema erweitern statt wechseln',
  };

  // Suchvolumen mit Status: "unter der Messgrenze" (Google Ads weist keinen Wert aus) und "Messung fehlgeschlagen"
  // sind verschiedene Dinge. Ältere Prüfungen haben keinen Status, dort bleibt es neutral bei "kein Messwert".
  // GEÄNDERT (siehe Chat-Verlauf): zuerst Spannen ("250 bis 500"), jetzt wieder die Zahl. Spannen waren zu grob zum Priorisieren
  // (260 und 480 landeten in derselben Spanne). Die Unschärfe der Google-Ads-Werte erklärt stattdessen EIN Hinweis im
  // Cluster-Abschnitt (VOLUME_NOTE). Funktionsname bleibt, damit alle Aufrufer unverändert funktionieren.
  var VOLUME_NOTE = 'Suchvolumen von Google Ads: gerundete Jahresdurchschnitte. Zwischen zwei Analysen können sie um eine Stufe schwanken (z.B. 480 auf 390). Für die Reihenfolge zählt das Verhältnis, nicht die genaue Zahl.';
  function volumeRangeText(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return 'unter der Messgrenze';
    return 'ca. ' + n.toLocaleString('de-DE') + ' Suchanfragen/Monat';
  }

  // NEU (Suchvolumen-Grund): Ein Volumen-Satz für Seiten. Fehlt die Zahl, steht der Grund da, den der Server je Seite festgehalten hat
  // (unter der Messgrenze, Messung fehlgeschlagen, nicht gemessen). Ältere Berichte haben keinen Grund und bleiben bei "unbekannt".
  var PAGE_VOLUME_STATUS_TEXT = {
    unter_messgrenze: 'Suchvolumen unter der Messgrenze (Google Ads weist keinen Wert aus)',
    messung_fehlgeschlagen: 'Suchvolumen: Messung fehlgeschlagen',
    nicht_gemessen: 'Suchvolumen nicht gemessen',
  };
  function pageVolumeText(page) {
    if (!page) return 'Suchvolumen unbekannt';
    if (page.estimated_volume != null) {
      return volumeRangeText(page.estimated_volume) + (page.volume_status === 'nicht_nachgemessen' ? ' (nicht nachgemessen, die Messung ist ausgefallen)' : '');
    }
    var base = PAGE_VOLUME_STATUS_TEXT[page.volume_status] || 'Suchvolumen unbekannt';
    // NEU (Anhaltspunkt): nächstkürzere Form des Keywords mit Messwert, in der Zeile kurz, die Erklärung steht aufgeklappt (renderVolumeProxyNote).
    if (page.volume_proxy && page.volume_proxy.keyword && page.volume_proxy.volume > 0) {
      return base + ' · Anhaltspunkt „' + page.volume_proxy.keyword + '“: ' + volumeRangeText(page.volume_proxy.volume);
    }
    return base;
  }

  // NEU (Übersicht): Kurzform für die zugeklappte Karte. Die ausführliche Erklärung (welche Variante gemessen wurde und warum) steht im Tooltip
  // neben der Zeile und aufgeklappt in der Karte.
  function pageVolumeShort(page) {
    if (!page) return 'Suchvolumen unbekannt';
    if (page.estimated_volume != null) return volumeRangeText(page.estimated_volume) + (page.volume_status === 'nicht_nachgemessen' ? ' (nicht nachgemessen)' : '');
    var short = { unter_messgrenze: 'Volumen unter der Messgrenze', messung_fehlgeschlagen: 'Volumen: Messung fehlgeschlagen', nicht_gemessen: 'Volumen nicht gemessen' }[page.volume_status];
    if (!short) return 'Suchvolumen unbekannt';
    if (page.volume_proxy && page.volume_proxy.volume > 0) short += ', Anhaltspunkt ' + volumeRangeText(page.volume_proxy.volume);
    return short;
  }
  function pageVolumeTip(page) {
    if (!page) return null;
    if (page.estimated_volume != null && page.volume_status !== 'nicht_nachgemessen') return null;
    if (page.volume_proxy && page.volume_proxy.reason) return tip(page.volume_proxy.reason, 'Warum dieser Anhaltspunkt?');
    if (page.volume_variants_note) return tip(page.volume_variants_note, 'Welche Varianten wurden geprüft?');
    if (page.volume_status === 'nicht_nachgemessen') return tip('Die Zahl stammt aus der Planung und konnte nicht nachgemessen werden, weil die Messung bei Google Ads ausgefallen ist.', 'Warum nicht nachgemessen?');
    var long = { unter_messgrenze: 'Google Ads weist für dieses Keyword keinen Wert aus. Das heißt nicht, dass niemand danach sucht, meist ist das Volumen sehr klein.', messung_fehlgeschlagen: 'Die Messung bei Google Ads ist in diesem Lauf ausgefallen. Über die Nachfrage lässt sich deshalb nichts sagen.', nicht_gemessen: 'Für dieses Keyword wurde kein Suchvolumen abgefragt.' }[page.volume_status];
    return long ? tip(long, 'Warum fehlt das Suchvolumen?') : null;
  }

  // Welche Variante gemessen wurde und warum, oder dass auch die gekürzten Formen keinen Wert haben. Der Server liefert den fertigen Text.
  function renderVolumeProxyNote(page) {
    if (!page) return null;
    var text = page.volume_proxy && page.volume_proxy.reason ? page.volume_proxy.reason : page.volume_variants_note;
    if (!text) return null;
    return el('div', { class: 'cvz-cs-volproxy' }, [
      el('p', { class: 'cvz-cs-brief-label' }, [page.volume_proxy ? 'Anhaltspunkt aus einem verwandten Begriff' : 'Gekürzte Varianten geprüft']),
      el('p', { class: 'cvz-cs-hint' }, [text]),
    ]);
  }

  function topicVolumeText(volume, status) {
    if (status === 'messung_fehlgeschlagen') return 'Messung fehlgeschlagen';
    if (volume != null && volume > 0) return volumeRangeText(volume);
    if (!status && volume == null) return 'kein Messwert';
    return 'unter der Messgrenze';
  }

  // Hinweise unter der Auswahl: was die Status bedeuten und wie groß der Markt ohne Zielgruppe ist.
  function renderTopicVolumeNotes(result) {
    var nodes = [];
    var statuses = [result.seed_volume_status].concat((result.alternatives_checked || []).map(function (a) { return a.volume_status; }));
    if (statuses.indexOf('unter_messgrenze') !== -1) {
      nodes.push(el('p', { class: 'cvz-cs-hint' }, [
        '„Unter der Messgrenze“ heißt: Google weist für den Begriff keinen Wert aus, er wird nur selten gesucht (praktisch unter ca. 10 Mal im Monat). ' +
        'Für die Ausrichtung auf deine Zielgruppe kann er trotzdem der richtige sein.',
      ]));
    }
    if (statuses.indexOf('messung_fehlgeschlagen') !== -1) {
      nodes.push(el('p', { class: 'cvz-cs-hint' }, [
        'Die Suchvolumen-Messung ist fehlgeschlagen. Über die Nachfrage lässt sich deshalb nichts sagen. Starte die Prüfung später erneut, wenn die Zahlen für deine Wahl wichtig sind.',
      ]));
    }
    var hints = result.oberbegriffe_hinweis || [];
    if (hints.length > 0) {
      var list = el('ul', { class: 'cvz-cs-topic-alt-list' });
      hints.forEach(function (h) {
        var kind = h.art === 'marktbegriff' ? 'Markt ohne Zielgruppe' : 'Breiterer Begriff';
        list.appendChild(el('li', {}, [kind + ': "' + h.topic + '" (' + topicVolumeText(h.search_volume, h.volume_status) + '). ' + (h.note || '')]));
      });
      nodes.push(el('div', { class: 'cvz-cs-topic-market' }, [
        el('p', {}, ['Marktumfeld (nicht auswählbar, nur zur Einordnung):']),
        list,
      ]));
    }
    return nodes;
  }

  function renderValidating(topic) {
    state.wizardActive = true;
    clear(state.root);
    var box = el('div', { class: 'cvz-cs-processing' }, [
      el('div', { class: 'cvz-cs-spinner' }),
      el('p', { class: 'cvz-cs-progress-text' }, ['Prüfe, ob "' + topic + '" das richtige Kern-Thema ist …']),
      el('p', { class: 'cvz-cs-hint' }, ['Das dauert normalerweise unter einer Minute, deutlich kürzer als die eigentliche Strategie-Erstellung.']),
    ]);
    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(renderStepper(state.wizardSteps || STEPS_FULL, 0, true));
    state.root.appendChild(box);
  }

  function startTopicValidation(topic, domain, trackerTopicId) {
    state.wizardSteps = wizardStepsFor(trackerTopicId, domain);
    state.productProfile = null; // NEU (Produktprofil): ein neuer Start beginnt ohne Profil der vorigen Strategie
    renderValidating(topic);
    // GEÄNDERT: jeder Versuch hat ein eigenes Zeitlimit von 70 Sekunden. Nach einem Verbindungsabbruch wird einmal
    // automatisch wiederholt. Scheitert es endgültig, bleiben Thema und Domain erhalten.
    function attempt() {
      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, 70 * 1000);
      return apiFetch('/api/content-strategy/validate-topic', {
        method: 'POST',
        body: JSON.stringify({ user_id: state.userId, topic: topic, domain: domain }),
        signal: controller.signal,
      }).then(
        function (result) { clearTimeout(timeoutId); return result; },
        function (err) { clearTimeout(timeoutId); throw err; }
      );
    }
    withNetworkRetry(attempt, 1, noteRetrying)
      .then(function (result) {
        renderTopicValidationResult(result, domain, topic, trackerTopicId);
      })
      .catch(function (err) {
        renderStepError(err, 'Themen-Prüfung', {
          stepIndex: 0,
          retry: function () { startTopicValidation(topic, domain, trackerTopicId); },
          back: function () {
            clear(state.root);
            state.root.appendChild(renderQuotaBanner());
            state.root.appendChild(renderForm({ topic: topic, domain: domain, trackerTopicId: trackerTopicId }));
          },
          backLabel: 'Zurück, Thema/Domain ändern',
        });
      });
  }

  function renderTopicValidationResult(result, domain, originalTopic, trackerTopicId) {
    state.wizardActive = true;
    clear(state.root);
    saveDraft('validation', { result: result, domain: domain, originalTopic: originalTopic, trackerTopicId: trackerTopicId || null, productUrl: state.productUrl || '' });
    var hasProfileStep = !!profileDomain(domain, trackerTopicId); // NEU (Produktprofil)
    var wrap = el('div', { class: 'cvz-cs-topic-check' });
    wrap.appendChild(renderStepper(state.wizardSteps || STEPS_FULL, 0, true));
    wrap.appendChild(el('p', { class: 'cvz-cs-callout' }, [
      trackerTopicId
        ? (hasProfileStep ? 'Bitte bestätige das Thema. Danach prüfst du kurz das Produktprofil, dann startet die Erstellung der Strategie.' : 'Bitte bestätige das Thema. Danach startet die Erstellung der Strategie.')
        : (hasProfileStep ? 'Bitte bestätige das Thema oder wähle eine Alternative. Danach prüfst du kurz das Produktprofil, dann folgt die Zielgruppe, und erst dann geht es in die Erstellung.' : 'Bitte bestätige das Thema oder wähle eine Alternative. Danach folgt die Zielgruppe, und erst dann geht es in die Erstellung.'),
    ]));
    wrap.appendChild(el('h3', {}, ['Bevor wir loslegen: ist "' + result.seed_topic + '" das richtige Thema?']));
    var seedVolText = topicVolumeText(result.seed_search_volume, result.seed_volume_status);

    var optionsList = el('div', { class: 'cvz-cs-topic-options' });
    var chosenInput = el('input', { type: 'hidden', name: 'chosen_topic' });
    chosenInput.value = result.empfehlung === 'thema_wechseln' ? result.empfohlenes_thema : result.seed_topic;

    var freeTextInput = el('input', { type: 'text', class: 'cvz-cs-topic-free-input' });
    freeTextInput.value = chosenInput.value;
    freeTextInput.addEventListener('input', function () {
      chosenInput.value = freeTextInput.value;
    });

    function makeOption(topicValue, labelText, isRecommended, extraNote) {
      var radioId = 'cvz-cs-topic-opt-' + Math.random().toString(36).slice(2);
      var radio = el('input', { type: 'radio', name: 'cvz_cs_topic_choice', id: radioId });
      radio.checked = topicValue === chosenInput.value;
      radio.addEventListener('change', function () {
        chosenInput.value = topicValue;
        freeTextInput.value = topicValue;
      });
      var labelChildren = [radio, ' ' + labelText];
      if (isRecommended) labelChildren.push(el('span', { class: 'cvz-cs-badge cvz-cs-badge-recommended' }, ['Empfohlen']));
      var optionBox = el('div', { class: 'cvz-cs-topic-option' }, [el('label', { for: radioId }, labelChildren)]);
      if (extraNote) optionBox.appendChild(el('p', { class: 'cvz-cs-hint' }, [extraNote]));
      return optionBox;
    }

    optionsList.appendChild(
      makeOption(result.seed_topic, '"' + result.seed_topic + '" (Original, ' + seedVolText + ')', result.empfehlung === 'thema_beibehalten')
    );
    (result.alternatives_checked || []).forEach(function (alt) {
      var volText = topicVolumeText(alt.search_volume, alt.volume_status);
      var badge = INTENT_FIT_LABELS[alt.intent_fit] || alt.intent_fit;
      optionsList.appendChild(
        makeOption(
          alt.topic,
          '"' + alt.topic + '" (' + volText + ', ' + badge + ')',
          result.empfohlenes_thema === alt.topic && result.empfehlung !== 'thema_beibehalten',
          alt.reasoning
        )
      );
    });
    wrap.appendChild(optionsList);
    renderTopicVolumeNotes(result).forEach(function (node) { wrap.appendChild(node); });

    wrap.appendChild(
      el('div', { class: 'cvz-cs-topic-recommendation-box' }, [
        el('p', {}, [(TOPIC_RECOMMENDATION_LABELS[result.empfehlung] || result.empfehlung) + '.']),
        el('p', { class: 'cvz-cs-hint' }, [result.reasoning]),
      ])
    );

    wrap.appendChild(el('label', { class: 'cvz-cs-label' }, ['Oder eigene Formulierung für den Cluster:', freeTextInput]));

    // NEU (Tracker-Pfad): Hier gibt es keinen Zielgruppen-Schritt, also kommen die Kundenfragen aus
    // Vertrieb und Support direkt in diesem Schritt dazu.
    var trackerQuestions = null;
    var trackerGrowAreas = [];
    var trackerErrorLine = el('p', { class: 'cvz-cs-quota-empty' });
    if (trackerTopicId) {
      trackerQuestions = renderCustomerQuestionsBlock(wrap, [], trackerGrowAreas, null).input;
      wrap.appendChild(trackerErrorLine);
    }

    var confirmBtn = el('button', { type: 'button', class: 'cvz-cs-submit-btn' }, [hasProfileStep ? 'Thema bestätigen, weiter zum Produkt' : (trackerTopicId ? 'Thema bestätigen und Strategie erstellen' : 'Thema bestätigen, weiter zur Zielgruppe')]);
    confirmBtn.addEventListener('click', function () {
      var finalTopic = freeTextInput.value.trim() || chosenInput.value;
      if (trackerTopicId) {
        var trackerParsed = parseCustomerQuestions(trackerQuestions ? trackerQuestions.value : '');
        if (trackerParsed.error) { trackerErrorLine.textContent = trackerParsed.error; return; }
        trackerErrorLine.textContent = '';
        startProfileStep({ topic: finalTopic, domain: domain, validationId: result.validation_id, originalTopic: originalTopic, trackerTopicId: trackerTopicId, customerQuestions: trackerParsed.list, validationResult: result, productUrl: state.productUrl || '' });
      } else {
        startProfileStep({ topic: finalTopic, domain: domain, validationId: result.validation_id, originalTopic: originalTopic, trackerTopicId: null, customerQuestions: [], validationResult: result, productUrl: state.productUrl || '' });
      }
    });
    var backBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['Zurück, Thema/Domain ändern']);
    backBtn.addEventListener('click', function () {
      clear(state.root);
      state.root.appendChild(renderQuotaBanner());
      state.root.appendChild(renderForm({ topic: originalTopic, domain: domain, trackerTopicId: trackerTopicId }));
    });
    wrap.appendChild(el('div', { class: 'cvz-cs-topic-check-actions' }, [backBtn, confirmBtn]));

    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(wrap);
    growAllLater(trackerGrowAreas);
  }

  // ==================== NEU: ZIELGRUPPE + PROMPT-PLAN (nur ohne Tracker-Daten) ====================
  var PHASE_OPTIONS = [
    { value: 'exploration', label: 'Erforschung' }, // GEÄNDERT: war "Orientierung", jetzt wie im restlichen Bericht
    { value: 'evaluation', label: 'Bewertung' },
    { value: 'comparison', label: 'Vergleich' },
    { value: 'decision', label: 'Entscheidung' },
  ];
  var PHASE_LABEL_MAP = PHASE_OPTIONS.reduce(function (acc, o) { acc[o.value] = o.label; return acc; }, { discovery: 'Entdeckung' });
  var ORIGIN_LABEL_MAP = {
    real_ai_question: 'echte KI-Frage',
    vertrieb: 'Kundenfrage aus Vertrieb/Support',
    paa: 'Google-Nutzerfrage',
    keyword: 'Keyword',
    derived: 'abgeleitet (ohne Datenbeleg)',
    tracker: 'Tracker',
  };
  var MIN_PROMPTS_KEEP = 4;

  function renderBusy(title, hint, stepIndex) {
    state.wizardActive = true;
    clear(state.root);
    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(renderStepper(state.wizardSteps || STEPS_FULL, stepIndex, true));
    state.root.appendChild(el('div', { class: 'cvz-cs-processing' }, [
      el('div', { class: 'cvz-cs-spinner' }),
      el('p', { class: 'cvz-cs-progress-text' }, [title]),
      hint ? el('p', { class: 'cvz-cs-hint' }, [hint]) : null,
    ]));
  }

  function startAudienceStep(topic, domain, validationId, originalTopic) {
    renderBusy('Ich überlege, wer bei deinem Thema mitentscheidet …', 'Dauert meist unter einer Minute.', stepNo('Zielgruppe bestätigen'));
    // GEÄNDERT: einmal automatisch wiederholen, bei endgültigem Fehler zurück zur Themen-Auswahl statt zum leeren Formular.
    var draft = loadDraft();
    withNetworkRetry(function () {
      return apiFetch('/api/content-strategy/suggest-audience', {
        method: 'POST',
        body: JSON.stringify({ user_id: state.userId, topic: topic, domain: domain, strategy_goal: state.strategyGoal || undefined }),
      });
    }, 1, noteRetrying)
      .then(function (res) { renderAudienceStep(res.audience, topic, domain, validationId, originalTopic); })
      .catch(function (err) {
        renderStepError(err, 'Zielgruppen-Vorschlag', {
          stepIndex: stepNo('Zielgruppe bestätigen'),
          retry: function () { startAudienceStep(topic, domain, validationId, originalTopic); },
          back: draft && (draft.step === 'validation' || draft.step === 'profile')
            ? function () { resumeDraft(draft); }
            : function () {
                clear(state.root);
                state.root.appendChild(renderQuotaBanner());
                state.root.appendChild(renderForm({ topic: originalTopic, domain: domain }));
              },
          backLabel: draft && draft.step === 'profile' ? 'Zurück zum Produktprofil' : 'Zurück zur Themen-Auswahl',
        });
      });
  }

  // Ein beschriftetes Feld: Beschriftung links über dem Feld, nie zentriert.
  function field(labelText, control) {
    return el('label', { class: 'cvz-cs-field' }, [el('span', { class: 'cvz-cs-field-label' }, [labelText]), control]);
  }

  // NEU (Übersicht): Feld mit "i" neben der Beschriftung. Gleiche Klassen wie field(), nur die Erklärung steht im Tooltip statt als Dauertext darunter.
  function fieldTip(labelText, control, tipText) {
    return el('label', { class: 'cvz-cs-field' }, [el('span', { class: 'cvz-cs-field-label' }, [labelText, tipText ? tip(tipText) : null]), control]);
  }

  function sectionTitle(number, text) {
    return el('h4', { class: 'cvz-cs-section-title' }, [el('span', { class: 'cvz-cs-step-num' }, [String(number)]), text]);
  }

  // NEU: Kundenfragen aus Vertrieb/Support. Das Textfeld hat eine Frage pro Zeile. Die Grenzen
  // gelten genauso im Backend (MAX_CUSTOMER_QUESTIONS 8, 3 bis 200 Zeichen). Zu viel oder zu Langes
  // wird hier gemeldet statt still gekürzt, damit der Kunde nichts Wichtiges verliert.
  var MAX_CUSTOMER_QUESTIONS = 8;
  var CUSTOMER_QUESTION_MIN = 3;
  var CUSTOMER_QUESTION_MAX = 200;
  function parseCustomerQuestions(text) {
    var seen = {};
    var list = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      // Aufzählungszeichen und Nummerierung am Zeilenanfang entfernen ("- ", "• ", "1. ", "2) ")
      var q = line.replace(/^\s*(?:[-*\u2022\u2013\u2014]+|\d{1,2}[.)])\s+/, '').replace(/\s+/g, ' ').trim();
      if (q.length < CUSTOMER_QUESTION_MIN) return;
      var key = q.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      list.push(q);
    });
    if (list.length > MAX_CUSTOMER_QUESTIONS) {
      return { list: list, error: 'Bitte höchstens ' + MAX_CUSTOMER_QUESTIONS + ' Fragen angeben (aktuell ' + list.length + '). Nimm die wichtigsten.' };
    }
    var tooLong = list.filter(function (q) { return q.length > CUSTOMER_QUESTION_MAX; })[0];
    if (tooLong) {
      return { list: list, error: 'Eine Frage ist zu lang (höchstens ' + CUSTOMER_QUESTION_MAX + ' Zeichen): "' + tooLong.slice(0, 50) + '…". Bitte kürzen oder auf zwei Zeilen aufteilen.' };
    }
    return { list: list, error: '' };
  }

  // NEU: gemeinsamer Baustein für Zielgruppen-Schritt UND Themen-Schritt im Tracker-Pfad (dort gibt
  // es keinen Zielgruppen-Schritt). Hängt Titel, Hinweis, Textfeld und Zähler an container.
  // number = Nummer im Titel, null = Titel ohne Nummer.
  function renderCustomerQuestionsBlock(container, initialList, growAreas, number) {
    var title = number
      ? sectionTitle(number, 'Häufige Fragen aus Vertrieb und Support (optional)')
      : el('h4', { class: 'cvz-cs-section-title' }, ['Häufige Fragen aus Vertrieb und Support (optional)']);
    container.appendChild(title);
    container.appendChild(el('p', { class: 'cvz-cs-hint' }, [
      'Welche Fragen und Einwände hören Vertrieb oder Support am häufigsten, bevor jemand kauft? Eine Frage pro Zeile, möglichst im Originalwortlaut der Kunden. 3 bis 5 reichen, höchstens ' + MAX_CUSTOMER_QUESTIONS + '. Das ist die Kundensicht, die Suchdaten nicht zeigen.',
    ]));
    var input = makeGrowArea((initialList || []).join('\n'),
      'z.B.\nSeid ihr DSGVO-konform und wo liegen die Daten?\nWie lange dauert die Einführung?\nWas passiert mit unseren bestehenden Seiten?', growAreas);
    input.style.minHeight = '96px';
    container.appendChild(input);
    var count = el('p', { class: 'cvz-cs-hint' });
    container.appendChild(count);
    container.appendChild(el('p', { class: 'cvz-cs-hint' }, [
      'Keine Daten dazu? Dann lass das Feld leer. Bitte keine Vermutungen eintragen: Sie würden später wie echte Kundenfragen behandelt.',
    ]));
    function updateCount() {
      var parsed = parseCustomerQuestions(input.value);
      count.textContent = parsed.list.length === 0 ? '' : parsed.list.length + ' von ' + MAX_CUSTOMER_QUESTIONS + ' Fragen erkannt.';
    }
    input.addEventListener('input', updateCount);
    updateCount();
    return { input: input, numberEl: title.querySelector ? title.querySelector('.cvz-cs-step-num') : null };
  }

  function renderAudienceStep(audience, topic, domain, validationId, originalTopic) {
    state.wizardActive = true;
    clear(state.root);
    var growAreas = [];
    var wrap = el('div', { class: 'cvz-cs-topic-check' });
    wrap.appendChild(renderStepper(state.wizardSteps || STEPS_FULL, stepNo('Zielgruppe bestätigen'), true));
    wrap.appendChild(el('h3', {}, ['Stimmt diese Zielgruppe?']));
    wrap.appendChild(el('div', { class: 'cvz-cs-callout' }, [
      el('strong', {}, ['Das ist jetzt zu tun: ']),
      'Prüfe den Vorschlag und ändere, was nicht stimmt. Lege genau eine Rolle als Champion fest. Aus diesen Rollen werden danach die Fragen für die Messung abgeleitet.',
    ]));

    // 1. Zielgruppe
    wrap.appendChild(sectionTitle(1, 'Zielgruppe in einem Satz'));
    var groupInput = makeGrowArea(audience.zielgruppe || '', '', growAreas);
    wrap.appendChild(groupInput);

    // 2. Wer entscheidet?
    wrap.appendChild(sectionTitle(2, 'Wer entscheidet über den Kauf?'));
    var modeName = 'cvz_cs_mode_' + Math.random().toString(36).slice(2);
    var multiRadio = el('input', { type: 'radio', name: modeName });
    var soloRadio = el('input', { type: 'radio', name: modeName });
    multiRadio.checked = !audience.ist_solo_zielgruppe;
    soloRadio.checked = !!audience.ist_solo_zielgruppe;
    wrap.appendChild(el('div', { class: 'cvz-cs-modes' }, [
      el('label', { class: 'cvz-cs-mode' }, [multiRadio, el('span', {}, [el('strong', {}, ['Mehrere Personen']), ' (Buying Center, z.B. Fachbereich, Geschäftsführung, IT)'])]),
      el('label', { class: 'cvz-cs-mode' }, [soloRadio, el('span', {}, [el('strong', {}, ['Eine Person allein']), ' (keine weiteren Rollen nötig)'])]),
    ]));

    // 3. Rollen
    var rolesSection = el('div', {});
    rolesSection.appendChild(sectionTitle(3, 'Rollen im Buying Center (höchstens 3)'));
    rolesSection.appendChild(el('p', { class: 'cvz-cs-hint' }, [
      'Der Champion treibt die Entscheidung voran und bekommt in der Messung die meisten Fragen. Es muss genau eine Rolle Champion sein.',
    ]));
    var rolesBox = el('div', {});
    var rows = [];
    var championName = 'cvz_cs_champion_' + Math.random().toString(36).slice(2);
    var championStatus = el('p', { class: 'cvz-cs-champion-status' });
    var errorLine = el('p', { class: 'cvz-cs-quota-empty' });

    function refresh() {
      var solo = soloRadio.checked;
      rolesSection.style.display = solo ? 'none' : '';
      if (qNum) qNum.textContent = solo ? '3' : '4';
      addBtn.style.display = rows.length >= 3 ? 'none' : '';
      rows.forEach(function (r, i) {
        r.title.textContent = 'Rolle ' + (i + 1);
        r.championLabel.className = 'cvz-cs-champion' + (r.champion.checked ? ' cvz-cs-champion-on' : '');
        r.removeBtn.style.display = rows.length > 1 ? '' : 'none';
      });
      var champ = rows.filter(function (r) { return r.champion.checked; })[0];
      championStatus.className = 'cvz-cs-champion-status ' + (champ ? 'cvz-cs-champion-ok' : 'cvz-cs-champion-missing');
      championStatus.textContent = champ
        ? 'Champion: ' + (champ.name.value.trim() || 'Rolle ohne Namen')
        : 'Noch kein Champion gewählt. Bitte bei genau einer Rolle "Champion" anklicken.';
      if (champ && errorLine.textContent.indexOf('Champion') !== -1) errorLine.textContent = ''; // erledigte Fehlermeldung nicht stehen lassen
      if (!solo) growAllLater(growAreas);
    }

    function addRoleRow(role) {
      var nameInput = el('input', { type: 'text', placeholder: 'z.B. Marketingleitung' });
      nameInput.value = role.rolle || '';
      var phaseSelect = el('select', {}, PHASE_OPTIONS.map(function (o) { return el('option', { value: o.value }, [o.label]); }));
      phaseSelect.value = role.einstiegsphase || 'exploration';
      var motivation = makeGrowArea(role.motivation, 'Was will diese Rolle erreichen?', growAreas);
      var objection = makeGrowArea(role.einwand, 'Was hält diese Rolle zurück?', growAreas);
      var champion = el('input', { type: 'radio', name: championName });
      champion.checked = !!role.ist_champion;
      var title = el('span', { class: 'cvz-cs-role-title' });
      var championLabel = el('label', { class: 'cvz-cs-champion' }, [champion, ' Champion']);
      var removeBtn = el('button', { type: 'button', class: 'cvz-cs-link-btn' }, ['Diese Rolle entfernen']);
      var card = el('div', { class: 'cvz-cs-role-card' });
      var row = { card: card, title: title, championLabel: championLabel, removeBtn: removeBtn, name: nameInput, phase: phaseSelect, motivation: motivation, objection: objection, champion: champion, begruendung: role.begruendung || null };
      removeBtn.addEventListener('click', function () {
        rows = rows.filter(function (r) { return r !== row; });
        rolesBox.removeChild(card);
        refresh();
      });
      champion.addEventListener('change', refresh);
      nameInput.addEventListener('input', refresh);
      card.appendChild(el('div', { class: 'cvz-cs-role-head' }, [title, championLabel]));
      if (role.begruendung) card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Warum diese Rolle vorgeschlagen wird: ' + role.begruendung]));
      card.appendChild(el('div', { class: 'cvz-cs-role-grid' }, [field('Name der Rolle', nameInput), field('Steigt ein in Phase', phaseSelect)]));
      card.appendChild(field('Motivation: Was will diese Rolle erreichen?', motivation));
      card.appendChild(field('Einwand: Was hält diese Rolle zurück?', objection));
      card.appendChild(el('div', { class: 'cvz-cs-role-foot' }, [removeBtn]));
      rows.push(row);
      rolesBox.appendChild(card);
    }

    var addBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['+ Rolle hinzufügen']);
    addBtn.addEventListener('click', function () {
      addRoleRow({ rolle: '', einstiegsphase: 'exploration', ist_champion: rows.length === 0 });
      refresh();
    });
    (audience.rollen || []).forEach(addRoleRow);
    rolesSection.appendChild(rolesBox);
    rolesSection.appendChild(el('div', { class: 'cvz-cs-role-add' }, [addBtn]));
    rolesSection.appendChild(championStatus);
    wrap.appendChild(rolesSection);

    // NEU: Fragen aus Vertrieb und Support (optional). Gilt für Buying Center UND Solo-Zielgruppe.
    var questionsBlock = renderCustomerQuestionsBlock(wrap, audience.kundenfragen, growAreas, 4);
    var questionsInput = questionsBlock.input;
    var qNum = questionsBlock.numberEl;

    if (audience.annahmen && audience.annahmen.length > 0) {
      var assumptions = el('ul', { class: 'cvz-cs-topic-alt-list' });
      audience.annahmen.forEach(function (a) { assumptions.appendChild(el('li', {}, [a])); });
      wrap.appendChild(el('details', { class: 'cvz-cs-expand' }, [el('summary', {}, ['Annahmen hinter dem Vorschlag anzeigen']), assumptions]));
    }

    wrap.appendChild(errorLine);
    var nextBtn = el('button', { type: 'button', class: 'cvz-cs-submit-btn' }, ['Zielgruppe bestätigen, weiter zu den Fragen']);
    var backBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['Zurück']);
    backBtn.addEventListener('click', function () {
      clear(state.root);
      state.root.appendChild(renderQuotaBanner());
      state.root.appendChild(renderForm({ topic: originalTopic, domain: domain }));
    });
    multiRadio.addEventListener('change', refresh);
    soloRadio.addEventListener('change', refresh);

    // NEU: aktueller Stand aller Eingaben, ohne Prüfung. Für den Entwurf im Browser (bei jeder Änderung) und als Basis
    // für "weiter". Die Begründung von Claude je Rolle bleibt erhalten, damit sie nach dem Wiederherstellen noch dasteht.
    function collectAudience() {
      return {
        ist_solo_zielgruppe: soloRadio.checked,
        rollen: rows.map(function (r) {
          return {
            rolle: r.name.value,
            ist_champion: r.champion.checked,
            einstiegsphase: r.phase.value,
            motivation: r.motivation.value,
            einwand: r.objection.value,
            begruendung: r.begruendung || undefined,
          };
        }),
        zielgruppe: groupInput.value,
        annahmen: audience.annahmen || [],
        kundenfragen: questionsInput.value.split(/\r?\n/),
      };
    }
    var draftTimer = null;
    function saveAudienceDraft() {
      saveDraft('audience', { audience: collectAudience(), topic: topic, domain: domain, validationId: validationId, originalTopic: originalTopic });
    }
    function scheduleAudienceDraft() {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(saveAudienceDraft, 400);
    }
    wrap.addEventListener('input', scheduleAudienceDraft);
    wrap.addEventListener('change', scheduleAudienceDraft);
    wrap.addEventListener('click', scheduleAudienceDraft); // Rolle hinzufügen/entfernen ändert nichts an Feldern

    nextBtn.addEventListener('click', function () {
      clearTimeout(draftTimer);
      saveAudienceDraft();
      var solo = soloRadio.checked;
      var roles = solo ? [] : rows.map(function (r) {
        return {
          rolle: r.name.value.trim(),
          ist_champion: r.champion.checked,
          einstiegsphase: r.phase.value,
          motivation: r.motivation.value.trim(),
          einwand: r.objection.value.trim(),
          // NEU: Claudes Begründung mitschicken (das Backend erlaubt sie optional), damit sie beim Zurückspringen
          // aus den Fragen oder nach einem Fehler weiter angezeigt wird.
          begruendung: r.begruendung ? String(r.begruendung).slice(0, 400) : undefined,
        };
      });
      if (!solo && roles.length === 0) { errorLine.textContent = 'Bitte mindestens eine Rolle angeben oder oben "Eine Person allein" wählen.'; return; }
      if (roles.some(function (r) { return r.rolle.length < 2; })) { errorLine.textContent = 'Jede Rolle braucht einen Namen.'; return; }
      if (!solo && !roles.some(function (r) { return r.ist_champion; })) { errorLine.textContent = 'Bitte lege einen Champion fest: Klicke bei genau einer Rolle auf "Champion".'; return; }
      var customerQuestions = parseCustomerQuestions(questionsInput.value);
      if (customerQuestions.error) { errorLine.textContent = customerQuestions.error; return; }
      errorLine.textContent = '';
      startPromptPlan({
        ist_solo_zielgruppe: solo,
        rollen: roles,
        zielgruppe: groupInput.value.trim(),
        annahmen: audience.annahmen || [],
        kundenfragen: customerQuestions.list,
      }, topic, domain, validationId, originalTopic);
    });
    wrap.appendChild(el('div', { class: 'cvz-cs-topic-check-actions' }, [backBtn, nextBtn]));
    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(wrap);
    refresh();
    growAllLater(growAreas);
    saveAudienceDraft();
  }

  function startPromptPlan(audience, topic, domain, validationId, originalTopic) {
    renderBusy('Ich stelle die Fragen deiner Zielgruppe zusammen …', 'Dafür werden echte Suchdaten abgefragt. Das dauert bis zu einer Minute.', stepNo('Fragen auswählen'));
    // GEÄNDERT (siehe Chat-Verlauf, "Prompt-Plan fehlgeschlagen: Load failed"): einmal automatisch wiederholen. Scheitert
    // es endgültig, führt "Zurück" zur Zielgruppe MIT allen bearbeiteten Rollen und Kundenfragen, statt zum leeren Formular.
    withNetworkRetry(function () {
      return apiFetch('/api/content-strategy/prompt-plan', {
        method: 'POST',
        body: JSON.stringify({ user_id: state.userId, topic: topic, domain: domain, audience: audience, strategy_goal: state.strategyGoal || undefined }),
      });
    }, 1, noteRetrying)
      .then(function (res) { renderPromptPlanStep(res, topic, domain, validationId, audience, originalTopic); })
      .catch(function (err) {
        renderStepError(err, 'Prompt-Plan', {
          stepIndex: stepNo('Fragen auswählen'),
          retry: function () { startPromptPlan(audience, topic, domain, validationId, originalTopic); },
          back: function () { renderAudienceStep(audience, topic, domain, validationId, originalTopic); },
          backLabel: 'Zurück zur Zielgruppe',
        });
      });
  }

  // GEÄNDERT: deselected (optional) = Fragen, die der Kunde abgewählt hatte, z.B. aus einem wiederhergestellten Entwurf.
  // NEU (Fragen bearbeiten): gleiche Regeln wie auf dem Server (checkEditedPrompt in contentStrategyPromptPlan.ts), hier schon beim Tippen.
  var EDITED_PROMPT_MIN = 12, EDITED_PROMPT_MAX = 200;
  function cleanPromptText(t) { return String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function promptBrand(domain) {
    var host = String(domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    var parts = host.split('.');
    var label = (parts.length >= 2 ? parts[parts.length - 2] : parts[0] || '').replace(/[^a-z0-9äöüß]/g, '');
    return label.length >= 4 ? label : '';
  }
  function checkEditedPrompt(text, domain) {
    var t = cleanPromptText(text);
    if (t.length < EDITED_PROMPT_MIN) return 'Die Frage ist zu kurz (mindestens ' + EDITED_PROMPT_MIN + ' Zeichen).';
    if (t.length > EDITED_PROMPT_MAX) return 'Die Frage ist zu lang (höchstens ' + EDITED_PROMPT_MAX + ' Zeichen).';
    if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(de|com|at|ch|io|net|org|eu)\b/i.test(t)) return 'Bitte keine Links oder Domains in die Frage schreiben. Gemessen wird, ob die KI euch von sich aus nennt.';
    var brand = promptBrand(domain);
    if (brand && t.toLowerCase().replace(/[^a-z0-9äöüß ]/g, '').indexOf(brand) !== -1) return 'Die Frage enthält euren eigenen Namen. Dann nennt die KI euch fast immer, und die Messung sagt nichts mehr darüber aus, ob ihr empfohlen werdet.';
    return null;
  }

  function renderPromptPlanStep(res, topic, domain, validationId, audience, originalTopic, deselected, edits) {
    state.wizardActive = true;
    clear(state.root);
    var plan = res.plan;
    var deselectedMap = {};
    (deselected || []).forEach(function (p) { deselectedMap[p] = true; });
    var editMap = edits || {}; // NEU: Original-Text -> umformulierter Text
    function savePlanDraft() {
      var ed = {};
      checks.forEach(function (c) { if (c.text !== c.prompt) ed[c.prompt] = c.text; });
      saveDraft('promptplan', {
        res: res, topic: topic, domain: domain, validationId: validationId, audience: audience, originalTopic: originalTopic,
        deselected: checks.filter(function (c) { return !c.box.checked; }).map(function (c) { return c.prompt; }),
        edits: ed,
      });
    }
    var wrap = el('div', { class: 'cvz-cs-topic-check' });
    wrap.appendChild(renderStepper(state.wizardSteps || STEPS_FULL, stepNo('Fragen auswählen'), true));
    wrap.appendChild(el('h3', {}, ['Diese Fragen messen wir bei ChatGPT und Gemini']));
    wrap.appendChild(el('p', { class: 'cvz-cs-hint' }, [
      'Jede Frage wird je Anbieter 3 Mal gestellt. Das ist eine Momentaufnahme, kein Trend. Du kannst Fragen abwählen, mindestens ' + MIN_PROMPTS_KEEP + ' müssen bleiben.',
      ' Mit „Bearbeiten“ formulierst du eine Frage so um, wie deine Kunden sie wirklich stellen.',
      tip('Eine umformulierte Frage zählt als deine eigene Formulierung: Das KI-Suchvolumen der Originalfrage gilt dann nicht mehr, und sie wird als „abgeleitet“ geführt (Kundenfragen aus Vertrieb und Support bleiben Kundenfragen). Euren eigenen Namen bitte nicht in die Frage schreiben: Dann nennt die KI euch fast immer, und die Messung sagt nichts mehr aus.', 'Was passiert beim Bearbeiten?'),
    ]));
    var s = plan.signals || {};
    wrap.appendChild(el('p', { class: 'cvz-cs-hint' }, [
      'Datenbasis: ' + (s.real_ai_questions || 0) + ' echte KI-Fragen, ' + (s.paa_questions || 0) + ' Google-Nutzerfragen, ' + (s.related_keywords || 0) + ' verwandte Keywords.',
    ]));
    (plan.warnings || []).forEach(function (w) { wrap.appendChild(el('p', { class: 'cvz-cs-gsc-hint' }, [w])); });

    var checks = [];
    PHASE_OPTIONS.forEach(function (ph) {
      var inPhase = (plan.prompts || []).filter(function (p) { return p.phase === ph.value; });
      if (inPhase.length === 0) return;
      wrap.appendChild(el('h4', {}, [ph.label]));
      inPhase.forEach(function (p) {
        var box = el('input', { type: 'checkbox' });
        box.checked = !deselectedMap[p.prompt];
        box.addEventListener('change', updateCount);
        box.addEventListener('change', savePlanDraft);
        var entry = { box: box, prompt: p.prompt, text: editMap[p.prompt] ? cleanPromptText(editMap[p.prompt]) : p.prompt };
        checks.push(entry);
        var row = el('div', { class: 'cvz-cs-topic-option' });
        // NEU: Anzeige- und Bearbeitungsmodus je Frage
        function paintRow(editing, errorText) {
          clear(row);
          var edited = entry.text !== entry.prompt;
          if (editing) {
            var input = el('textarea', { class: 'cvz-cs-prompt-edit', rows: '2', maxlength: String(EDITED_PROMPT_MAX) });
            input.value = entry.text;
            var err = el('p', { class: 'cvz-cs-prompt-edit-error' }, [errorText || '']);
            if (!errorText) err.style.display = 'none';
            var save = el('button', { type: 'button', class: 'cvz-cs-submit-btn cvz-cs-prompt-btn' }, ['Übernehmen']);
            var cancel = el('button', { type: 'button', class: 'cvz-cs-retry-btn cvz-cs-prompt-btn' }, ['Abbrechen']);
            function validate() {
              var t = cleanPromptText(input.value);
              var problem = t === entry.prompt ? null : checkEditedPrompt(t, domain);
              var dup = !problem && checks.some(function (c) { return c !== entry && c.box.checked && cleanPromptText(c.text).toLowerCase() === t.toLowerCase(); });
              var msg = problem || (dup ? 'Diese Frage steht schon in der Auswahl.' : '');
              err.textContent = msg;
              err.style.display = msg ? '' : 'none';
              if (msg) save.setAttribute('disabled', 'disabled'); else save.removeAttribute('disabled');
              return !msg;
            }
            input.addEventListener('input', validate);
            save.addEventListener('click', function () {
              if (!validate()) return;
              entry.text = cleanPromptText(input.value);
              box.checked = true;
              paintRow(false);
              updateCount();
              savePlanDraft();
            });
            cancel.addEventListener('click', function () { paintRow(false); });
            row.appendChild(el('div', { class: 'cvz-cs-prompt-editbox' }, [input, err, el('div', { class: 'cvz-cs-prompt-actions' }, [cancel, save])]));
            validate();
            setTimeout(function () { try { input.focus(); } catch (e) { /* ohne Fokus weiter */ } }, 0);
          } else {
            var editBtn = el('button', { type: 'button', class: 'cvz-cs-prompt-link' }, ['Bearbeiten']);
            editBtn.addEventListener('click', function () { paintRow(true); });
            var labelKids = [box, ' ' + entry.text];
            if (edited) labelKids.push(el('span', { class: 'cvz-cs-badge cvz-cs-prompt-edited' }, ['von dir umformuliert']));
            row.appendChild(el('div', { class: 'cvz-cs-prompt-line' }, [el('label', {}, labelKids), editBtn]));
          }
          var meta = edited ? (p.origin === 'vertrieb' ? ORIGIN_LABEL_MAP.vertrieb : 'eigene Formulierung, ohne Datenbeleg') : (ORIGIN_LABEL_MAP[p.origin] || p.origin);
          if (p.role) meta += ' · ' + p.role;
          if (!edited && typeof p.ai_search_volume === 'number') meta += ' · KI-Suchvolumen ca. ' + p.ai_search_volume;
          row.appendChild(el('p', { class: 'cvz-cs-hint' }, [meta]));
          if (edited && !editing) {
            var reset = el('button', { type: 'button', class: 'cvz-cs-prompt-link' }, ['Original wiederherstellen']);
            reset.addEventListener('click', function () { entry.text = entry.prompt; paintRow(false); updateCount(); savePlanDraft(); });
            row.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Ursprünglich: „' + entry.prompt + '“ ', reset]));
          }
          if (p.customer_question) row.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Ausgangspunkt (deine Kundenfrage): "' + p.customer_question + '"']));
        }
        paintRow(false);
        wrap.appendChild(row);
      });
    });

    var countLine = el('p', { class: 'cvz-cs-hint' });
    wrap.appendChild(countLine);
    var startBtn = el('button', { type: 'button', class: 'cvz-cs-submit-btn' }, ['Fragen bestätigen, Messung und Strategie starten']);
    function updateCount() {
      var n = checks.filter(function (c) { return c.box.checked; }).length;
      var ne = checks.filter(function (c) { return c.box.checked && c.text !== c.prompt; }).length;
      countLine.textContent = n + ' von ' + checks.length + ' Fragen ausgewählt (' + (n * 6) + ' Abfragen)' + (ne ? ', davon ' + ne + ' von dir umformuliert' : '') + '.';
      if (n < MIN_PROMPTS_KEEP) startBtn.setAttribute('disabled', 'disabled'); else startBtn.removeAttribute('disabled');
    }
    updateCount();
    startBtn.addEventListener('click', function () {
      // GEÄNDERT: umformulierte Fragen gehen als { original, prompt } an den Server, der sie erneut prüft
      var selected = checks.filter(function (c) { return c.box.checked; }).map(function (c) { return c.text !== c.prompt ? { original: c.prompt, prompt: c.text } : c.prompt; });
      startGeneration(topic, domain, validationId, null, { prompt_plan_id: res.prompt_plan_id, selected_prompts: selected });
    });
    var backBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['Zurück zur Zielgruppe']);
    backBtn.addEventListener('click', function () { renderAudienceStep(audience, topic, domain, validationId, originalTopic); });
    wrap.appendChild(el('div', { class: 'cvz-cs-topic-check-actions' }, [backBtn, startBtn]));
    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(wrap);
    savePlanDraft();
  }

  function startGeneration(topic, domain, validationId, trackerTopicId, planExtra, customerQuestions) {
    renderProcessing(topic);
    apiFetch('/api/content-strategy/generate', {
      method: 'POST',
      body: JSON.stringify({
        user_id: state.userId,
        topic: topic,
        domain: domain,
        run_prompt_test: true,
        validation_id: validationId,
        tracker_topic_id: trackerTopicId || undefined,
        // NEU: Angebotstyp, Zielaktion und Button-Text aus dem Startformular.
        strategy_goal: state.strategyGoal || undefined,
        // NEU (Lead-Magneten): was es schon gibt, damit es nicht noch einmal vorgeschlagen wird.
        existing_magnets: state.existingMagnets || undefined,
        // NEU (Produktprofil): vom Kunden bestätigt. Ohne Profil (übersprungen, keine Domain) läuft alles wie bisher.
        product_profile: state.productProfile || undefined,
        prompt_plan_id: planExtra ? planExtra.prompt_plan_id : undefined,
        selected_prompts: planExtra ? planExtra.selected_prompts : undefined,
        // NEU: nur im Tracker-Pfad (sonst stecken die Kundenfragen schon in der bestätigten Zielgruppe des Plans)
        customer_questions: trackerTopicId && customerQuestions && customerQuestions.length > 0 ? customerQuestions : undefined,
      }),
    })
      .then(function (res) {
        // NEU: der Lauf ist gestartet und auf dem Server gespeichert, der Entwurf wird nicht mehr gebraucht.
        clearDraft();
        var url = new URL(window.location.href);
        url.searchParams.set('session_id', res.session_id);
        // Vorbelegung aus dem Tracker-Link wird nach dem Start nicht mehr gebraucht.
        ['tracker_topic_id', 'topic', 'domain'].forEach(function (key) { url.searchParams.delete(key); });
        window.history.replaceState(null, '', url.toString());
        pollSession(res.session_id);
      })
      .catch(function (err) {
        // NEU: bei einem Verbindungsabbruch kann der Lauf auf dem Server trotzdem gestartet sein (und Kontingent
        // verbraucht haben). Deshalb KEINE automatische Wiederholung, sondern ein ehrlicher Hinweis. Der Entwurf
        // bleibt erhalten, damit der Kunde notfalls von den Fragen aus neu starten kann.
        if (err && err.network) {
          renderError(
            'Die Verbindung wurde beim Start unterbrochen. Möglicherweise läuft die Strategie trotzdem schon. ' +
            'Bitte schau in ein paar Minuten in deinen gespeicherten Strategien nach, bevor du neu startest, damit kein Kontingent doppelt verbraucht wird. ' +
            'Deine Eingaben sind gespeichert und lassen sich über das Formular wieder öffnen.'
          );
          return;
        }
        renderError('Start fehlgeschlagen: ' + err.message, err.body);
      });
  }

  function pollSession(sessionId) {
    state.pollStartedAt = Date.now();
    function tick() {
      apiFetch('/api/content-strategy/' + encodeURIComponent(sessionId))
        .then(function (session) {
          if (session.status === 'error') {
            renderError('Generierung fehlgeschlagen' + (session.error_message ? ': ' + session.error_message : '.'));
            return;
          }
          if (session.status === 'done') {
            state.currentSessionId = session.id;
            state.currentResult = session.result;
            loadQuota().then(function () {
              renderResult(session.id, session.result, session.funding_source, session);
            });
            return;
          }
          if (Date.now() - state.pollStartedAt > CONFIG.pollTimeoutMs) {
            renderError('Zeitüberschreitung: Die Generierung läuft im Hintergrund ungewöhnlich lange. Bitte später erneut prüfen oder Support kontaktieren.');
            return;
          }
          state.pollHandle = setTimeout(tick, CONFIG.pollIntervalMs);
        })
        .catch(function (err) {
          renderError('Status konnte nicht geprüft werden: ' + err.message);
        });
    }
    tick();
  }

  // ==================== FORTSCHRITTS-TEXTE ====================
  var CVZ_CS_PROGRESS_MESSAGES = [
    { at: 8, text: 'Analyse startet, das dauert jetzt eine Weile, hol dir ruhig einen Kaffee' },
    { at: 30, text: 'Suchvolumen und die häufigsten Nutzerfragen zum Thema werden ausgewertet' },
    { at: 60, text: 'Ist-Zustand wird geprüft: wer rankt heute schon wofür' },
    { at: 100, text: 'Wettbewerber-Seiten werden auseinandergenommen (Länge, Tabellen, FAQ-Blöcke)' },
    { at: 150, text: 'Google AI Overview und Zitations-Chancen werden gecheckt' },
    { at: 220, text: 'Prompt-Tests laufen gegen ein KI-Modell, das braucht ein paar Sekunden pro Anfrage' },
    { at: 300, text: 'Content-Cluster wird gebaut: Conversion-Seite plus unterstützende Seiten' },
    { at: 380, text: 'Themen werden auf die Journey-Phasen Erforschung, Bewertung, Vergleich und Entscheidung verteilt' },
    { at: 460, text: 'Stärken, Schwächen, Wettbewerb und Chancen werden zur Executive Summary zusammengefasst' },
    { at: 560, text: 'Kaffee schon leer? Wir sind noch beim Feinschliff am Bericht' },
    { at: 680, text: 'Läuft noch, bei 15 bis 20 Minuten Gesamtdauer sind wir genau im Soll' },
    { at: 800, text: 'Die Prompt-Tests brauchen heute etwas länger als sonst, kein Grund zur Sorge' },
    { at: 950, text: 'Fast geschafft, wir polieren gerade die letzten Details' },
    { at: 1100, text: 'Letzte Meter. Wenn dein Kaffee jetzt auch leer ist, wart\'s ab, gleich ist Land in Sicht' },
  ];

  function pickTimedMessage(messages, elapsedSec) {
    var chosen = null;
    for (var i = 0; i < messages.length; i++) {
      if (elapsedSec >= messages[i].at) chosen = messages[i];
      else break;
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
    state.wizardActive = false;
    clear(state.root);
    var startedAt = Date.now();
    var baseText = 'Baue Content-Cluster für "' + topic + '" …';
    var box = el('div', { class: 'cvz-cs-processing' }, [
      el('div', { class: 'cvz-cs-spinner' }),
      el('p', { class: 'cvz-cs-progress-text' }, [baseText]),
      el('p', { class: 'cvz-cs-hint' }, ['Lehn dich gerne einen Augenblick zurück. Die Entwicklung der Strategie dauert aktuell ca. 15 Minuten.']),
      el('p', { class: 'cvz-cs-callout' }, ['Du kannst diese Seite jetzt schließen. Die Strategie läuft im Hintergrund weiter und liegt danach in deinen gespeicherten Strategien.']),
    ]);
    state.root.appendChild(renderQuotaBanner());
    if (state.wizardSteps) state.root.appendChild(renderStepper(state.wizardSteps, state.wizardSteps.length - 1, false));
    state.root.appendChild(box);
    startProgressTicker(startedAt, baseText);
  }

  function renderError(message, body) {
    state.wizardActive = false;
    clear(state.root);
    var box = el('div', { class: 'cvz-cs-error' }, [el('p', {}, [message])]);
    if (body && typeof body.ppu_strategy_credits_remaining === 'number') {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Kein Strategie-Kontingent verfügbar. Bitte Plan upgraden oder ein Credit-Paket nachkaufen.']));
    }
    var retryBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn', onclick: renderApp }, ['Zurück zum Formular']);
    box.appendChild(retryBtn);
    state.root.appendChild(box);
  }

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

  function pageTypeLabel(type) { return PAGE_TYPE_LABELS[type] || type; }
  function roleLabel(role) { return ROLE_LABELS[role] || role; }

  function renderTopicValidationSection(topicValidation, finalSeedTopic) {
    var box = el('div', { class: 'cvz-cs-topic-validation' });
    if (!topicValidation) {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine Themen-Prüfung für diese Strategie vorhanden (älterer Lauf, vor diesem Feature erstellt).']));
      return box;
    }
    var seedVolText = topicVolumeText(topicValidation.seed_search_volume, topicValidation.seed_volume_status);
    box.appendChild(el('p', {}, ['Geprüftes Ausgangsthema: "' + topicValidation.seed_topic + '" (' + seedVolText + ')']));
    if (topicValidation.alternatives_checked && topicValidation.alternatives_checked.length > 0) {
      var list = el('ul', { class: 'cvz-cs-topic-alt-list' });
      topicValidation.alternatives_checked.forEach(function (a) {
        var volText = topicVolumeText(a.search_volume, a.volume_status);
        list.appendChild(
          el('li', {}, [
            el('span', { class: 'cvz-cs-badge cvz-cs-badge-intent-' + a.intent_fit }, [INTENT_FIT_LABELS[a.intent_fit] || a.intent_fit]),
            ' "' + a.topic + '" (' + volText + '): ' + a.reasoning,
          ])
        );
      });
      box.appendChild(list);
    }
    renderTopicVolumeNotes(topicValidation).forEach(function (node) { box.appendChild(node); });
    box.appendChild(el('p', { class: 'cvz-cs-topic-recommendation' }, [
      (TOPIC_RECOMMENDATION_LABELS[topicValidation.empfehlung] || topicValidation.empfehlung) + '. ' + topicValidation.reasoning,
    ]));
    if (finalSeedTopic && finalSeedTopic !== topicValidation.seed_topic) {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Für diesen Cluster tatsächlich gewähltes Thema: "' + finalSeedTopic + '"']));
    }
    return box;
  }

  // NEU (Tracker-Verbindung): zeigt, ob und welche Tracker-Daten in diesen Bericht eingeflossen
  // sind. Gibt null zurück, wenn keine (renderReportSection überspringt null-Kinder).
  function renderTrackerSourceNote(session) {
    var snap = session && session.tracker_snapshot;
    if (!snap) return null;
    var dateStr = snap.generated_at ? new Date(snap.generated_at).toLocaleDateString('de-DE') : '';
    var text =
      'Einbezogen: Daten aus dem Customer Journey Tracker, Thema "' + snap.topic_name + '" (Stand ' + dateStr + ', ' +
      snap.runs_in_window + ' KI-Abfragen in den letzten ' + snap.window_days + ' Tagen).';
    var children = [el('p', {}, [text])];
    if (snap.is_preliminary) {
      children.push(el('p', { class: 'cvz-cs-hint' }, ['Die Tracker-Daten umfassen weniger als vier Wochen. Die Befunde daraus sind ein erster Hinweis, noch kein belastbarer Trend.']));
    }
    return el('div', { class: 'cvz-cs-topic-recommendation-box' }, children);
  }

  // ==================== CONTENT-FLOW-DIAGRAMM (bearbeitbar) ====================
  // Bearbeitbare Ansicht auf den Bericht als Content-Cluster: Ganz oben das Cluster-Thema (keine
  // eigene Seite, keine URL), darunter Conversion-Seite und Pillar Pages als Geschwister, darunter
  // die Spezial-Seiten. Der Weg zur Conversion steckt in den gestrichelten internen Links. Knoten verschieben, Seiten anlegen und entfernen, Hierarchie
  // ändern, interne Links setzen. Der Editor-Zustand wird pro Strategie im Backend gespeichert
  // (PUT /api/content-strategy/:id/flow). Der Bericht selbst wird dadurch nie verändert.
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var FLOW_NODE_W = 210;
  var FLOW_NODE_H = 84;
  var FLOW_GAP_X = 36;
  var FLOW_GAP_Y = 86;
  var FLOW_LIMITS = { nodes: 60, edges: 150, label: 120, note: 600, coord: 5000 };
  var FLOW_VERSION = 2;
  var FLOW_TOPIC_COLOR = '#e2e8f0';
  var FLOW_OFFSITE_COLOR = '#f472b6';
  var FLOW_PHASE_COLORS = {
    exploration: '#3b82f6',
    evaluation: '#f59e0b',
    comparison: '#a78bfa',
    decision: '#34d399',
    legacy: '#6e7681',
  };
  var FLOW_PHASE_ORDER = { exploration: 0, evaluation: 1, comparison: 2, decision: 3, legacy: 4 };
  var FLOW_STATUS_COLORS = { vorgeschlagen: '#6e7681', geplant: '#3b82f6', in_arbeit: '#f59e0b', live: '#34d399' };
  var FLOW_CUSTOM_TYPES = [
    'pillar_page', 'topic_coverage', 'use_case', 'comparison', 'conversion_landingpage',
    'pricing_roi', 'calculator_tool', 'template_download', 'review', 'integration',
  ];

  function svgEl(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function flowNewId(prefix, taken) {
    var id;
    do { id = prefix + Math.random().toString(36).slice(2, 9); } while (taken[id]);
    return id;
  }

  function flowClone(value) { return JSON.parse(JSON.stringify(value)); }

  function flowClamp(v) { return Math.max(-FLOW_LIMITS.coord, Math.min(FLOW_LIMITS.coord, v)); }

  // Gültigen parent_index aus dem Bericht lesen: -2 = Cluster-Thema, -1 = Conversion-Seite,
  // 0..n = Pillar Page. Ungültige Werte (eigener Index, außerhalb, Kreis) führen dazu, dass die
  // Seite direkt unter der Conversion-Seite hängt. Ältere Berichte hatten Pillar Pages unter der
  // Conversion-Seite (-1); die stehen jetzt daneben, direkt unter dem Cluster-Thema.
  function flowResolveParents(pages) {
    var parents = pages.map(function (page, i) {
      var p = page.parent_index;
      if (typeof p !== 'number' || Math.floor(p) !== p || p < -2 || p >= pages.length || p === i) p = -1;
      if (page.page_type === 'pillar_page' && p === -1) p = -2;
      return p;
    });
    for (var i = 0; i < parents.length; i++) {
      var seen = {};
      seen[i] = true;
      var cur = parents[i];
      while (cur >= 0) {
        if (seen[cur]) { parents[i] = -1; break; }
        seen[cur] = true;
        cur = parents[cur];
      }
    }
    return parents;
  }

  // ---------- Off-Site-Maßnahmen im Diagramm ----------
  // NEU: Off-Site-Maßnahmen (result.offsite_measures) stehen als eigene Knoten kind "offsite" in einer
  // Spalte rechts neben dem Themen-Baum, in der Zone "Außerhalb deiner Website". Sie gehören nie in den
  // Baum, sondern verweisen per Verbindung auf eine eigene Seite. Die Zielseite rechnet der Server aus
  // (link_target). Fehlt die Zielseite im Diagramm (vom Nutzer entfernt), entsteht keine Verbindung.
  function offsiteKindLabel(m) {
    return (m && (m.kind_label || OFFSITE_KIND_LABELS[m.kind] || m.kind)) || 'Off-Site';
  }
  function flowOffsiteLabel(m) {
    var name = (m.portal && m.portal.label) || (m.platform && m.platform.label) || m.domain || 'Off-Site';
    return String(name).slice(0, FLOW_LIMITS.label);
  }
  function flowMeasureOf(result, node) {
    var list = (result && result.offsite_measures) || [];
    return node && node.kind === 'offsite' && node.offsite_ref != null ? list[node.offsite_ref] || null : null;
  }
  // Ordnet alle Off-Site-Knoten als Spalte rechts neben den übrigen Knoten an.
  function flowLayoutOffsite(diagram) {
    var maxX = -Infinity, minY = Infinity;
    var off = [];
    diagram.nodes.forEach(function (n) {
      if (n.kind === 'offsite') { off.push(n); return; }
      maxX = Math.max(maxX, n.x + FLOW_NODE_W);
      minY = Math.min(minY, n.y);
    });
    if (!off.length) return;
    if (maxX === -Infinity) { maxX = 0; minY = 0; }
    off.sort(function (a, b) { return (a.offsite_ref || 0) - (b.offsite_ref || 0); });
    off.forEach(function (n, i) {
      n.x = flowClamp(Math.round(maxX + FLOW_GAP_X * 3));
      n.y = flowClamp(Math.round(minY + i * (FLOW_NODE_H + FLOW_GAP_Y / 2)));
    });
  }
  // Übernimmt Maßnahmen, die noch keinen Knoten haben. Bestehende Knoten werden nicht verschoben, neue
  // kommen unter die vorhandenen Off-Site-Knoten bzw. in eine neue Spalte rechts. offsite_seeded merkt sich,
  // dass das schon passiert ist, damit vom Nutzer entfernte Knoten nicht wieder auftauchen.
  function flowAddOffsite(diagram, result) {
    var measures = (result && result.offsite_measures) || [];
    diagram.offsite_seeded = true;
    if (!measures.length) return;
    var taken = {};
    var convId = null;
    var pageNodeByRef = {};
    var existing = {};
    var maxX = -Infinity, minY = Infinity, offMaxY = -Infinity, offX = null;
    diagram.nodes.forEach(function (n) {
      taken[n.id] = true;
      if (n.kind === 'conversion') convId = n.id;
      if (n.kind === 'page' && n.page_ref != null && pageNodeByRef[n.page_ref] == null) pageNodeByRef[n.page_ref] = n.id;
      if (n.kind === 'offsite') {
        if (n.offsite_ref != null) existing[n.offsite_ref] = true;
        offMaxY = Math.max(offMaxY, n.y);
        if (offX === null) offX = n.x;
        return;
      }
      maxX = Math.max(maxX, n.x + FLOW_NODE_W);
      minY = Math.min(minY, n.y);
    });
    diagram.edges.forEach(function (e) { taken[e.id] = true; });
    if (maxX === -Infinity) { maxX = 0; minY = 0; }
    var x = offX !== null ? offX : flowClamp(Math.round(maxX + FLOW_GAP_X * 3));
    var y = offMaxY !== -Infinity ? offMaxY + FLOW_NODE_H + FLOW_GAP_Y / 2 : minY;
    measures.forEach(function (m, i) {
      if (!m || existing[i] || diagram.nodes.length >= FLOW_LIMITS.nodes) return;
      var id = taken['o' + i] ? flowNewId('o', taken) : 'o' + i;
      taken[id] = true;
      diagram.nodes.push({ id: id, kind: 'offsite', offsite_ref: i, label: flowOffsiteLabel(m), x: flowClamp(Math.round(x)), y: flowClamp(Math.round(y)) });
      y += FLOW_NODE_H + FLOW_GAP_Y / 2;
      var t = m.link_target;
      var targetId = t ? (t.page_ref === -1 ? convId : pageNodeByRef[t.page_ref]) : null;
      if (targetId && diagram.edges.length < FLOW_LIMITS.edges) {
        var edgeId = taken['x' + i] ? flowNewId('x', taken) : 'x' + i;
        taken[edgeId] = true;
        diagram.edges.push({ id: edgeId, from: id, to: targetId, type: 'link' });
      }
    });
  }

  function flowBuildFromResult(result) {
    var pages = result.supporting_pages || [];
    var nodes = [];
    var edges = [];
    nodes.push({
      id: 'topic', kind: 'topic', page_ref: null,
      label: String(result.seed_topic || result.conversion_page.topic).slice(0, FLOW_LIMITS.label),
      x: 0, y: 0,
    });
    edges.push({ id: 'ht', from: 'topic', to: 'conv', type: 'hierarchy' });
    nodes.push({
      id: 'conv', kind: 'conversion', page_ref: -1,
      label: result.conversion_page.topic, page_type: 'conversion_landingpage',
      x: 0, y: 0,
    });
    pages.forEach(function (page, i) {
      nodes.push({
        id: 'p' + i, kind: 'page', page_ref: i,
        label: page.topic, page_type: page.page_type,
        phase: FLOW_PHASE_ORDER.hasOwnProperty(page.messy_middle_phase) ? page.messy_middle_phase : 'legacy',
        x: 0, y: 0,
      });
    });
    var parents = flowResolveParents(pages);
    pages.forEach(function (page, i) {
      var from = parents[i] === -2 ? 'topic' : (parents[i] === -1 ? 'conv' : 'p' + parents[i]);
      edges.push({ id: 'h' + i, from: from, to: 'p' + i, type: 'hierarchy' });
    });
    var seenPairs = {};
    edges.forEach(function (e) { seenPairs[e.from + '>' + e.to] = true; seenPairs[e.to + '>' + e.from] = true; });
    (result.internal_links || []).forEach(function (link, k) {
      var from = link.from_index === -1 ? 'conv' : 'p' + link.from_index;
      var to = link.to_index === -1 ? 'conv' : 'p' + link.to_index;
      var known = function (id) { return id === 'conv' || (id.charAt(0) === 'p' && pages[Number(id.slice(1))]); };
      if (from === to || !known(from) || !known(to) || seenPairs[from + '>' + to]) return;
      seenPairs[from + '>' + to] = true;
      edges.push({ id: 'l' + k, from: from, to: to, type: 'link' });
    });
    var diagram = { version: FLOW_VERSION, nodes: nodes, edges: edges };
    flowAddOffsite(diagram, result);
    flowAutoLayout(diagram);
    return diagram;
  }

  // Themen-Baum von oben nach unten. Loses (ohne Eltern-Knoten, nicht die Conversion-Seite)
  // steht als eigene Wurzel rechts daneben.
  function flowAutoLayout(diagram) {
    var byId = {};
    diagram.nodes.forEach(function (n) { byId[n.id] = n; });
    var children = {};
    var hasParent = {};
    diagram.edges.forEach(function (e) {
      if (e.type !== 'hierarchy') return;
      (children[e.from] = children[e.from] || []).push(e.to);
      hasParent[e.to] = true;
    });
    var rank = function (n) { return n.kind === 'topic' ? 0 : (n.kind === 'conversion' ? 1 : 2); };
    var order = function (a, b) {
      var na = byId[a], nb = byId[b];
      if (rank(na) !== rank(nb)) return rank(na) - rank(nb);
      var pa = FLOW_PHASE_ORDER[na.phase] != null ? FLOW_PHASE_ORDER[na.phase] : 5;
      var pb = FLOW_PHASE_ORDER[nb.phase] != null ? FLOW_PHASE_ORDER[nb.phase] : 5;
      if (pa !== pb) return pa - pb;
      return (na.page_ref == null ? 999 : na.page_ref) - (nb.page_ref == null ? 999 : nb.page_ref);
    };
    Object.keys(children).forEach(function (k) { children[k].sort(order); });
    var roots = diagram.nodes.filter(function (n) { return !hasParent[n.id] && n.kind !== 'offsite'; }).map(function (n) { return n.id; });
    roots.sort(order);
    var cursor = 0;
    var unit = FLOW_NODE_W + FLOW_GAP_X;
    function place(id, depth) {
      var kids = children[id] || [];
      var x;
      if (kids.length === 0) {
        x = cursor;
        cursor += unit;
      } else {
        var xs = kids.map(function (kid) { return place(kid, depth + 1); });
        x = (xs[0] + xs[xs.length - 1]) / 2;
      }
      byId[id].x = flowClamp(Math.round(x));
      byId[id].y = flowClamp(depth * (FLOW_NODE_H + FLOW_GAP_Y));
      return x;
    }
    roots.forEach(function (id) { place(id, 0); });
    flowLayoutOffsite(diagram);
  }

  function flowSanitizeStored(stored, result) {
    if (!stored || (stored.version !== 1 && stored.version !== 2) || !Array.isArray(stored.nodes) || !Array.isArray(stored.edges)) return null;
    var diagram = { version: FLOW_VERSION, offsite_seeded: stored.offsite_seeded === true, nodes: flowClone(stored.nodes), edges: flowClone(stored.edges) };
    var hasTopic = diagram.nodes.some(function (n) { return n.kind === 'topic'; });
    if (!hasTopic) flowAddTopic(diagram, result);
    // Off-Site-Knoten ohne passende Maßnahme im Bericht (z.B. beschädigte Daten) samt Verbindungen entfernen
    var measures = (result && result.offsite_measures) || [];
    var dropped = {};
    diagram.nodes = diagram.nodes.filter(function (n) {
      if (n.kind !== 'offsite') return true;
      if (n.offsite_ref != null && measures[n.offsite_ref]) return true;
      dropped[n.id] = true;
      return false;
    });
    diagram.edges = diagram.edges.filter(function (e) { return !dropped[e.from] && !dropped[e.to]; });
    // Gespeicherte Diagramme von vor den Off-Site-Knoten: Maßnahmen einmalig ergänzen
    if (!diagram.offsite_seeded) flowAddOffsite(diagram, result);
    return diagram;
  }

  // Migration von Version 1 (Conversion-Seite war die Wurzel): Cluster-Thema darüber setzen und
  // Pillar Pages, die unter der Conversion-Seite hingen, eine Ebene hoch neben sie hängen.
  // Bereits verschobene Knoten behalten ihre Position, nur das Cluster-Thema kommt neu dazu.
  function flowAddTopic(diagram, result) {
    if (diagram.nodes.length >= FLOW_LIMITS.nodes || diagram.edges.length >= FLOW_LIMITS.edges) return;
    var conv = null;
    diagram.nodes.forEach(function (n) { if (n.kind === 'conversion') conv = n; });
    if (!conv) return;
    var taken = {};
    diagram.nodes.forEach(function (n) { taken[n.id] = true; });
    diagram.edges.forEach(function (e) { taken[e.id] = true; });
    var topicId = taken.topic ? flowNewId('t', taken) : 'topic';
    taken[topicId] = true;
    var byId = {};
    diagram.nodes.forEach(function (n) { byId[n.id] = n; });
    diagram.edges.forEach(function (e) {
      var child = byId[e.to];
      if (e.type === 'hierarchy' && e.from === conv.id && child && child.page_type === 'pillar_page') e.from = topicId;
    });
    diagram.nodes.unshift({
      id: topicId, kind: 'topic', page_ref: null,
      label: String((result && (result.seed_topic || result.conversion_page.topic)) || conv.label).slice(0, FLOW_LIMITS.label),
      x: conv.x, y: flowClamp(conv.y - (FLOW_NODE_H + FLOW_GAP_Y)),
    });
    var edgeId = taken.ht ? flowNewId('e', taken) : 'ht';
    diagram.edges.unshift({ id: edgeId, from: topicId, to: conv.id, type: 'hierarchy' });
  }

  function flowWrapText(text, maxChars, maxLines) {
    var words = String(text).split(/\s+/);
    var lines = [];
    var line = '';
    words.forEach(function (word) {
      while (word.length > maxChars) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, maxChars - 1) + '-');
        word = word.slice(maxChars - 1);
      }
      if (!line) line = word;
      else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
      else { lines.push(line); line = word; }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,1}$/, '') + '…';
    }
    return lines;
  }

  function phaseName(phase) {
    for (var i = 0; i < MESSY_MIDDLE_PHASES.length; i++) if (MESSY_MIDDLE_PHASES[i].value === phase) return MESSY_MIDDLE_PHASES[i].label;
    return '';
  }

  // ---------- Export (CSV für Tabellen, ClickUp, Asana) ----------
  // Läuft komplett im Browser: keine Zugangsdaten, keine API-Anbindung. Der Nutzer lädt eine
  // Datei herunter und importiert sie im jeweiligen Tool.
  function flowSafeCell(value) {
    var text = value == null ? '' : String(value);
    // Schutz vor Formel-Einschleusung in Excel/Sheets: Zellen, die mit = + - @ oder Tab beginnen
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return text;
  }

  function flowToCsv(headers, rows, delimiter, withBom) {
    var quote = function (cell) {
      var text = flowSafeCell(cell);
      if (text.indexOf(delimiter) !== -1 || /["\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
      return text;
    };
    var lines = [headers.map(quote).join(delimiter)];
    rows.forEach(function (row) { lines.push(row.map(quote).join(delimiter)); });
    return (withBom ? '﻿' : '') + lines.join('\r\n') + '\r\n';
  }

  function flowDownload(filename, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function flowSlug(text) {
    return String(text || 'strategie').toLowerCase().replace(/[äöüß]/g, function (c) { return { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[c]; })
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'strategie';
  }

  // Ergebnis: Zeilen in Baum-Reihenfolge (Oberseiten immer VOR ihren Unterseiten).
  function flowExportRows(diagram, result) {
    var pages = result.supporting_pages || [];
    var byId = {};
    diagram.nodes.forEach(function (n) { byId[n.id] = n; });
    var childrenOf = {};
    var hasParent = {};
    diagram.edges.forEach(function (e) {
      if (e.type !== 'hierarchy' || !byId[e.from] || !byId[e.to]) return;
      (childrenOf[e.from] = childrenOf[e.from] || []).push(e.to);
      hasParent[e.to] = true;
    });
    var byPosition = function (a, b) { return (byId[a].x - byId[b].x) || (byId[a].y - byId[b].y); };
    Object.keys(childrenOf).forEach(function (k) { childrenOf[k].sort(byPosition); });
    var roots = diagram.nodes.filter(function (n) { return !hasParent[n.id]; }).map(function (n) { return n.id; });
    var rank = function (id) { var k = byId[id].kind; return k === 'topic' ? 0 : (k === 'conversion' ? 1 : (k === 'offsite' ? 3 : 2)); };
    roots.sort(function (a, b) { return (rank(a) - rank(b)) || byPosition(a, b); });
    Object.keys(childrenOf).forEach(function (k) { childrenOf[k].sort(function (a, b) { return (rank(a) - rank(b)) || byPosition(a, b); }); });
    var ordered = [];
    var seen = {};
    function visit(id, level, parentId) {
      if (seen[id]) return;
      seen[id] = true;
      // Cluster-Thema ist keine Seite: keine eigene Zeile, seine Kinder sind die oberste Ebene
      if (byId[id].kind === 'topic') {
        (childrenOf[id] || []).forEach(function (kid) { visit(kid, level, null); });
        return;
      }
      ordered.push({ id: id, level: level, parentId: parentId });
      (childrenOf[id] || []).forEach(function (kid) { visit(kid, level + 1, id); });
    }
    roots.forEach(function (id) { visit(id, 1, null); });
    diagram.nodes.forEach(function (n) { if (!seen[n.id]) visit(n.id, 1, null); }); // Sicherheitsnetz bei beschädigten Daten

    // Eindeutige Titel: Asana ordnet Unterseiten über den NAMEN der Oberseite zu
    var used = {};
    var titleOf = {};
    ordered.forEach(function (item) {
      var base = String(byId[item.id].label || 'Seite').trim() || 'Seite';
      var candidate = base;
      var n = 2;
      while (used[candidate.toLowerCase()]) candidate = base + ' (' + n++ + ')';
      used[candidate.toLowerCase()] = true;
      titleOf[item.id] = candidate;
    });
    var linkTargets = {};
    diagram.edges.forEach(function (e) {
      // Verweise einer eigenen Seite auf eine Off-Site-Maßnahme sind keine internen Links
      if (e.type === 'link' && byId[e.from] && byId[e.to] && byId[e.to].kind !== 'offsite') (linkTargets[e.from] = linkTargets[e.from] || []).push(titleOf[e.to]);
    });

    return ordered.map(function (item, index) {
      var n = byId[item.id];
      if (n.kind === 'offsite') return flowExportOffsiteRow(n, item, index, titleOf, linkTargets, result);
      var page = n.kind === 'conversion' ? result.conversion_page : (n.kind === 'page' && n.page_ref != null ? pages[n.page_ref] : null);
      var phaseText = n.kind === 'conversion' ? 'Conversion' : (phaseName(n.phase) || '');
      var typeText = n.kind === 'conversion' ? 'Conversion-Seite' : (n.page_type ? pageTypeLabel(n.page_type) : '');
      var brief = page && page.content_brief ? page.content_brief : [];
      var volume = page && page.estimated_volume != null ? page.estimated_volume : '';
      var source = n.kind === 'custom' ? 'Nur im Diagramm' : 'Bericht';
      var description = [];
      if (page && page.keyword) description.push('Keyword: ' + page.keyword + (volume !== '' ? ' (' + volumeRangeText(volume) + ')' : (page.volume_status && PAGE_VOLUME_STATUS_TEXT[page.volume_status] ? ' (' + PAGE_VOLUME_STATUS_TEXT[page.volume_status] + (page.volume_proxy ? '; Anhaltspunkt „' + page.volume_proxy.keyword + '“: ' + volumeRangeText(page.volume_proxy.volume) + ', nicht die Zahl dieser Seite' : '') + ')' : '')));
      if (typeText) description.push('Seitentyp: ' + typeText);
      if (phaseText) description.push('Phase: ' + phaseText);
      if (page && page.primary_audience) description.push('Zielgruppe: ' + page.primary_audience);
      if (page && page.reasoning) description.push('Begründung: ' + page.reasoning);
      if (brief.length) description.push('Content-Brief:\n' + brief.map(function (b) { return '- ' + b; }).join('\n'));
      if (n.note) description.push('Notiz: ' + n.note);
      if ((linkTargets[n.id] || []).length) description.push('Interne Links zu: ' + linkTargets[n.id].join(', '));
      return {
        index: index + 1,
        id: item.id,
        level: item.level,
        parentId: item.parentId,
        parentTitle: item.parentId ? titleOf[item.parentId] : '',
        title: titleOf[item.id],
        typeText: typeText,
        phaseText: phaseText,
        keyword: page && page.keyword ? page.keyword : '',
        volume: volume,
        status: page && page.status ? page.status : '',
        source: source,
        note: n.note || '',
        brief: brief.join('\n'),
        description: description.join('\n'),
        linkTargets: (linkTargets[n.id] || []).join(', '),
        taskId: 'CF' + (index + 1),
      };
    });
  }

  // NEU: Zeile für eine Off-Site-Maßnahme (gleiches Format wie die Seiten-Zeilen)
  function flowExportOffsiteRow(n, item, index, titleOf, linkTargets, result) {
    var m = flowMeasureOf(result, n) || {};
    var typeText = 'Off-Site: ' + offsiteKindLabel(m);
    var targets = (linkTargets[n.id] || []).join(', ');
    var description = [];
    if (m.domain) description.push('Wo: ' + m.domain);
    if (m.action) description.push('Aufgabe: ' + m.action);
    if (m.effort) description.push('Aufwand: ' + m.effort);
    if (m.basis) description.push('Beleg: ' + m.basis);
    if (m.hypothesis) description.push('Vermutung: ' + m.hypothesis);
    if (m.content_points && m.content_points.length) description.push('Das sollte der Inhalt beantworten:\n' + m.content_points.map(function (b) { return '- ' + b; }).join('\n'));
    if (m.cited_examples && m.cited_examples.length) description.push('Dort heute zitiert:\n' + m.cited_examples.map(function (e) { return '- ' + (e.title ? e.title + ' (' + e.url + ')' : e.url); }).join('\n'));
    if (targets) description.push('Verweist auf: ' + targets + (m.link_target && m.link_target.embed ? ' (dort auch einbinden)' : ''));
    if (n.note) description.push('Notiz: ' + n.note);
    return {
      index: index + 1, id: item.id, level: item.level, parentId: null, parentTitle: '',
      title: titleOf[item.id], typeText: typeText, phaseText: '', keyword: '', volume: '', status: '',
      // Tabelle hat keine Beschreibungsspalte: Aufgabe und Inhaltspunkte stehen deshalb im Content-Brief
      source: 'Off-Site-Maßnahme', note: n.note || '',
      brief: [m.action || ''].concat((m.content_points || []).map(function (b) { return '- ' + b; })).filter(Boolean).join('\n'),
      description: description.join('\n'), linkTargets: targets, taskId: 'CF' + (index + 1),
    };
  }

  function flowBuildExport(kind, diagram, result) {
    var rows = flowExportRows(diagram, result);
    var idOf = {};
    rows.forEach(function (r) { idOf[r.id] = r.taskId; });
    var base = 'content-flow-' + flowSlug(result.seed_topic);
    if (kind === 'clickup') {
      var subtasks = {};
      rows.forEach(function (r) { if (r.parentId) (subtasks[r.parentId] = subtasks[r.parentId] || []).push(r.taskId); });
      // Trenner in Zellen: "|" statt Komma (Doku: Trennzeichen ohne Leerzeichen)
      var cu = rows.map(function (r) {
        var tags = [r.phaseText, r.typeText].filter(Boolean).map(function (t) { return t.replace(/[|,]/g, ' '); }).join('|');
        return [r.taskId, r.title, r.description, tags, (subtasks[r.id] || []).join('|')];
      });
      return { filename: base + '-clickup.csv', text: flowToCsv(['Task ID', 'Task Name', 'Description', 'Tags', 'Subtask IDs'], cu, ',', false), rows: rows.length };
    }
    if (kind === 'asana') {
      var as = rows.map(function (r) { return [r.title, r.description, r.parentTitle]; });
      return { filename: base + '-asana.csv', text: flowToCsv(['Name', 'Description', 'Parent Task'], as, ',', false), rows: rows.length };
    }
    var headers = ['ID', 'Ebene', 'Titel', 'Oberseite (ID)', 'Oberseite (Titel)', 'Seitentyp', 'Phase', 'Keyword', 'Suchvolumen pro Monat', 'Status im Bericht', 'Quelle', 'Notiz', 'Content-Brief', 'Interne Links zu'];
    var uni = rows.map(function (r) {
      return [r.taskId, r.level, r.title, r.parentId ? idOf[r.parentId] : '', r.parentTitle, r.typeText, r.phaseText, r.keyword, r.volume, r.status, r.source, r.note, r.brief, r.linkTargets];
    });
    return { filename: base + '-tabelle.csv', text: flowToCsv(headers, uni, ';', true), rows: rows.length };
  }

  // ==== NEU: Gemeinsamer Diagramm-Stand für Liste und Content-Flow ====
  function flowStoreCreate(sessionId, result, session) {
    return { sessionId: sessionId, result: result, diagram: flowSanitizeStored(session && session.flow_diagram, result) || flowBuildFromResult(result), api: null, listeners: [], error: null, saveTimer: null };
  }
  function flowStoreNotify(store) {
    store.listeners.forEach(function (fn) { try { fn(); } catch (e) { /* eine Ansicht darf die anderen nicht blockieren */ } });
  }
  // Nach einer Änderung aus der Liste: Ist das Diagramm schon aufgebaut, zeichnet und speichert es selbst. Sonst speichert die Liste.
  function flowStoreCommit(store) {
    if (store.api) { store.api.externalChanged(); return; }
    store.error = null;
    flowStoreNotify(store);
    if (!store.sessionId) return;
    clearTimeout(store.saveTimer);
    store.saveTimer = setTimeout(function () {
      var d = store.diagram;
      apiFetch('/api/content-strategy/' + store.sessionId + '/flow', { method: 'PUT', body: JSON.stringify({ version: FLOW_VERSION, offsite_seeded: d.offsite_seeded === true ? true : undefined, nodes: d.nodes, edges: d.edges }) })
        .then(function (data) { if (data && data.funnel_check && typeof state.funnelRefresh === 'function') state.funnelRefresh(data.funnel_check); })
        .catch(function (err) { store.error = 'Speichern fehlgeschlagen: ' + (err && err.message ? err.message : 'unbekannter Fehler'); flowStoreNotify(store); });
    }, 300);
  }
  function flowOwnPages(store) {
    return store ? store.diagram.nodes.filter(function (n) { return n.kind === 'custom'; }) : [];
  }
  function flowNodeOfRef(store, ref) {
    if (!store) return null;
    return store.diagram.nodes.filter(function (n) { return ref === -1 ? n.kind === 'conversion' : (n.kind === 'page' && n.page_ref === ref); })[0] || null;
  }
  function flowNormLabel(t) { return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function flowHasOwnPage(store, label) {
    return flowOwnPages(store).some(function (n) { return flowNormLabel(n.label) === flowNormLabel(label); });
  }
  // Eigene Seite aus der Liste anlegen. Sie kommt in eine Reihe unter alle Seiten aus dem Bericht. Rückgabe: Fehlertext oder null.
  function flowAddOwnPage(store, label, note) {
    var d = store.diagram;
    if (d.nodes.length >= FLOW_LIMITS.nodes) return 'Maximal ' + FLOW_LIMITS.nodes + ' Seiten im Content-Flow.';
    if (flowHasOwnPage(store, label)) return null;
    var taken = {};
    d.nodes.forEach(function (n) { taken[n.id] = true; });
    d.edges.forEach(function (e) { taken[e.id] = true; });
    var base = d.nodes.filter(function (n) { return n.kind !== 'custom' && n.kind !== 'offsite'; });
    var baseY = Math.max.apply(null, base.map(function (n) { return n.y; }).concat([0])) + FLOW_NODE_H + FLOW_GAP_Y;
    var minX = Math.min.apply(null, base.map(function (n) { return n.x; }).concat([0]));
    var inRow = d.nodes.filter(function (n) { return n.kind === 'custom' && n.y >= baseY; }).length;
    var node = { id: flowNewId('n', taken), kind: 'custom', label: String(label).slice(0, FLOW_LIMITS.label), x: flowClamp(minX + inRow * (FLOW_NODE_W + FLOW_GAP_X)), y: flowClamp(baseY) };
    if (note) node.note = String(note).slice(0, FLOW_LIMITS.note);
    d.nodes.push(node);
    flowStoreCommit(store);
    return null;
  }
  function flowRemoveOwnPage(store, id) {
    var d = store.diagram;
    d.nodes = d.nodes.filter(function (n) { return n.id !== id; });
    d.edges = d.edges.filter(function (e) { return e.from !== id && e.to !== id; });
    flowStoreCommit(store);
  }
  function flowNoteHas(store, ref, term) {
    var n = flowNodeOfRef(store, ref);
    return !!(n && n.note && n.note.toLowerCase().indexOf('„' + String(term).toLowerCase() + '“') !== -1);
  }
  // Notiz an eine Seite aus dem Bericht anhängen (der Content-Brief des Berichts bleibt unverändert). Rückgabe: Fehlertext oder null.
  function flowAppendNote(store, ref, line) {
    var n = flowNodeOfRef(store, ref);
    if (!n) return 'Die Seite steht nicht mehr im Content-Flow. Baue ihn dort aus dem Bericht neu auf oder ergänze die Notiz von Hand.';
    var next = n.note ? n.note + '\n' + line : line;
    if (next.length > FLOW_LIMITS.note) return 'Die Notiz dieser Seite ist voll (' + FLOW_LIMITS.note + ' Zeichen). Kürze sie im Content-Flow.';
    n.note = next;
    flowStoreCommit(store);
    return null;
  }
  // ==== NEU-ENDE ====

  function renderFlowSection(sessionId, result, session) {
    // GEÄNDERT (eigene Seiten in der Liste): Liste und Diagramm teilen sich einen Diagramm-Stand (state.flowStore), damit Seiten, die in der
    // Liste übernommen werden, sofort im Diagramm stehen und umgekehrt.
    var store = state.flowStore && state.flowStore.result === result ? state.flowStore : null;
    var diagram = store ? store.diagram : (flowSanitizeStored(session && session.flow_diagram, result) || flowBuildFromResult(result));
    var ui = {
      selected: null,          // { type: 'node' | 'edge', id }
      mode: null,              // null | 'connect-hierarchy' | 'connect-link'
      showLinks: true,
      showOffsite: true,
      view: { x: 40, y: 40, k: 1 },
      undo: [],
      drag: null,
      saveState: sessionId ? 'idle' : 'unsaved',
      saveTimer: null,
      fullscreen: false,
      hasFitted: false,
    };
    var pages = result.supporting_pages || [];
    // NEU: Bestehende Seite (eigene URL) und Ankertexte aus dem Plan, für Knoten und Seitenpanel.
    function flowIsExisting(n) {
      if (n.kind === 'conversion') return !!result.conversion_page.existing_url;
      if (n.kind === 'page' && n.page_ref != null && pages[n.page_ref]) return pages[n.page_ref].role === 'existing' && !!(pages[n.page_ref].existing_coverage && pages[n.page_ref].existing_coverage.url);
      return false;
    }
    function flowRefOf(id) { return id === 'conv' ? -1 : (/^p\d+$/.test(id) ? Number(id.slice(1)) : null); }
    function flowAnchorOf(fromId, toId) {
      var f = flowRefOf(fromId), t = flowRefOf(toId);
      if (f === null || t === null) return '';
      var hit = (result.internal_links || []).filter(function (l) { return l.from_index === f && l.to_index === t; })[0];
      return hit && hit.anchor_text_idea ? hit.anchor_text_idea : '';
    }
    function renderNodeLinks(node) {
      var byId = {};
      diagram.nodes.forEach(function (x) { byId[x.id] = x; });
      var out = diagram.edges.filter(function (e) { return e.type === 'link' && e.from === node.id && byId[e.to]; });
      var inc = diagram.edges.filter(function (e) { return e.type === 'link' && e.to === node.id && byId[e.from]; });
      var box = el('div', { class: 'cvz-flow-links' }, [el('p', { class: 'cvz-flow-panel-sub' }, ['Interne Links' + (flowIsExisting(node) ? ' (bestehende Seite, geht sofort)' : '')])]);
      if (out.length === 0 && inc.length === 0) { box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine. Lege einen mit „Interner Link …“ an.'])); return box; }
      var ul = el('ul', { class: 'cvz-cs-link-targets' });
      out.forEach(function (e) {
        var t = byId[e.to], anchor = flowAnchorOf(e.from, e.to);
        ul.appendChild(el('li', {}, [el('span', { class: 'cvz-cs-link-arrow' }, ['→']), el('span', {}, [t.label + (flowIsExisting(t) ? ' (bestehend)' : ''), anchor ? el('span', { class: 'cvz-cs-link-meta' }, ['Ankertext: „' + anchor + '“']) : null])]));
      });
      if (out.length) box.appendChild(ul);
      if (inc.length) box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Verlinkt von: ' + inc.map(function (e) { return byId[e.from].label; }).join(', ')]));
      return box;
    }

    var root = el('div', { class: 'cvz-flow' });
    var toolbar = el('div', { class: 'cvz-flow-toolbar' });
    var stage = el('div', { class: 'cvz-flow-stage' });
    var canvasWrap = el('div', { class: 'cvz-flow-canvas-wrap' });
    var panel = el('div', { class: 'cvz-flow-panel' });
    var banner = el('div', { class: 'cvz-flow-banner', style: 'display:none' });
    var svg = svgEl('svg', { class: 'cvz-flow-svg', tabindex: '0', role: 'application', 'aria-label': 'Content-Flow-Diagramm' });
    var defs = svgEl('defs', {}, [
      svgEl('marker', { id: 'cvz-flow-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, [
        svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'rgba(226,232,240,.75)' }),
      ]),
      svgEl('marker', { id: 'cvz-flow-arrow-link', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' }, [
        svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'rgba(79,209,197,.85)' }),
      ]),
      svgEl('marker', { id: 'cvz-flow-arrow-offsite', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' }, [
        svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'rgba(244,114,182,.9)' }),
      ]),
    ]);
    var viewport = svgEl('g', { class: 'cvz-flow-viewport' });
    var edgeLayer = svgEl('g', {});
    var nodeLayer = svgEl('g', {});
    viewport.appendChild(edgeLayer);
    viewport.appendChild(nodeLayer);
    svg.appendChild(defs);
    svg.appendChild(viewport);
    canvasWrap.appendChild(svg);
    canvasWrap.appendChild(banner);
    stage.appendChild(canvasWrap);
    stage.appendChild(panel);
    root.appendChild(toolbar);
    root.appendChild(stage);

    // ---------- Hilfsfunktionen ----------
    function nodeById(id) {
      for (var i = 0; i < diagram.nodes.length; i++) if (diagram.nodes[i].id === id) return diagram.nodes[i];
      return null;
    }
    function isTopic(id) { var n = nodeById(id); return !!(n && n.kind === 'topic'); }
    function isOffsite(id) { var n = nodeById(id); return !!(n && n.kind === 'offsite'); }
    function isVisible(n) { return !!n && (n.kind !== 'offsite' || ui.showOffsite); }
    function hasOffsite() { return diagram.nodes.some(function (n) { return n.kind === 'offsite'; }); }
    function isFixedEdge(edge) {
      // Cluster-Thema -> Conversion-Seite ist fest: die verkaufende Seite hängt immer direkt am Thema
      var a = nodeById(edge.from), b = nodeById(edge.to);
      return edge.type === 'hierarchy' && a && b && a.kind === 'topic' && b.kind === 'conversion';
    }
    function edgeById(id) {
      for (var i = 0; i < diagram.edges.length; i++) if (diagram.edges[i].id === id) return diagram.edges[i];
      return null;
    }
    function parentEdgeOf(id) {
      for (var i = 0; i < diagram.edges.length; i++) {
        var e = diagram.edges[i];
        if (e.type === 'hierarchy' && e.to === id) return e;
      }
      return null;
    }
    function isDescendant(candidateId, ancestorId) {
      // true, wenn candidateId im Teilbaum unter ancestorId liegt
      var cur = candidateId;
      var guard = 0;
      while (cur && guard++ < 200) {
        var pe = parentEdgeOf(cur);
        if (!pe) return false;
        if (pe.from === ancestorId) return true;
        cur = pe.from;
      }
      return false;
    }
    function takenIds() {
      var t = {};
      diagram.nodes.forEach(function (n) { t[n.id] = true; });
      diagram.edges.forEach(function (e) { t[e.id] = true; });
      return t;
    }
    function pushUndo() {
      ui._lastUndoKey = null;
      ui.undo.push(flowClone({ nodes: diagram.nodes, edges: diagram.edges }));
      if (ui.undo.length > 30) ui.undo.shift();
    }
    function undo() {
      var prev = ui.undo.pop();
      if (!prev) return;
      diagram.nodes = prev.nodes;
      diagram.edges = prev.edges;
      if (ui.selected && ui.selected.type === 'node' && !nodeById(ui.selected.id)) ui.selected = null;
      if (ui.selected && ui.selected.type === 'edge' && !edgeById(ui.selected.id)) ui.selected = null;
      changed();
    }
    function notice(text) {
      banner.textContent = text;
      banner.style.display = 'block';
      clearTimeout(notice._t);
      notice._t = setTimeout(function () { if (!ui.mode) banner.style.display = 'none'; }, 3500);
    }
    function setMode(mode) {
      ui.mode = mode;
      canvasWrap.className = 'cvz-flow-canvas-wrap' + (mode ? ' cvz-flow-connecting' : '');
      if (mode) {
        var fromOffsite = ui.selected && ui.selected.type === 'node' && isOffsite(ui.selected.id);
        banner.textContent = (mode === 'connect-hierarchy'
          ? 'Klicke die Seite, die unter „' + (nodeById(ui.selected && ui.selected.id) || {}).label + '“ hängen soll. '
          : (fromOffsite ? 'Klicke die eigene Seite, auf die die Maßnahme verweisen soll. ' : 'Klicke die Seite, auf die verlinkt werden soll. ')) + 'Esc bricht ab.';
        banner.style.display = 'block';
      } else {
        banner.style.display = 'none';
      }
    }

    // ---------- Speichern ----------
    function scheduleSave() {
      if (store) flowStoreNotify(store); // NEU: Liste (eigene Seiten, Notizen) aktualisieren
      if (!sessionId) { ui.saveState = 'unsaved'; renderToolbar(); return; }
      ui.saveState = 'dirty';
      renderToolbar();
      clearTimeout(ui.saveTimer);
      ui.saveTimer = setTimeout(save, 900);
    }
    function save(keepalive) {
      if (!sessionId) return Promise.resolve();
      clearTimeout(ui.saveTimer);
      ui.saveState = 'saving';
      renderToolbar();
      var body = JSON.stringify({ version: FLOW_VERSION, offsite_seeded: diagram.offsite_seeded === true ? true : undefined, nodes: diagram.nodes, edges: diagram.edges });
      var options = { method: 'PUT', body: body };
      if (keepalive === true) options.keepalive = true;
      return apiFetch('/api/content-strategy/' + sessionId + '/flow', options)
        .then(function (data) {
          ui.saveState = 'saved'; renderToolbar();
          // NEU: Der Server rechnet den Funnel-Befund mit den eigenen Seiten aus dem Diagramm neu. Der Abschnitt "Funnel" zeigt ihn sofort.
          if (data && data.funnel_check && typeof state.funnelRefresh === 'function') state.funnelRefresh(data.funnel_check);
        })
        .catch(function (err) {
          ui.saveState = 'error';
          ui.saveError = err && err.message ? err.message : 'Unbekannter Fehler';
          renderToolbar();
        });
    }
    if (state.flowFlushHandler) document.removeEventListener('visibilitychange', state.flowFlushHandler);
    state.flowFlushHandler = function () {
      if (document.visibilityState === 'hidden' && ui.saveState === 'dirty') save(true);
    };
    document.addEventListener('visibilitychange', state.flowFlushHandler);

    function changed() {
      renderCanvas();
      renderPanel();
      scheduleSave();
    }
    // NEU: Änderungen aus der Liste (Seite übernommen, Notiz ergänzt, eigene Seite entfernt) zeichnen und speichern
    if (store) store.api = {
      externalChanged: function () { if (ui.selected && ui.selected.type === 'node' && !nodeById(ui.selected.id)) ui.selected = null; renderCanvas(); renderPanel(); scheduleSave(); },
      // NEU: aus der Liste ("Im Content-Flow bearbeiten") eine Seite auswählen und in die Mitte holen. Wartet, bis das Diagramm eingepasst ist.
      focusNode: function (id) {
        var tries = 0;
        if (!nodeById(id)) return;
        ui.selected = { type: 'node', id: id }; // sofort auswählen (Panel zeigt die Seite), einpassen sobald das Diagramm eine Größe hat
        renderCanvas();
        renderPanel();
        (function go() {
          var n = nodeById(id);
          var rect = svg.getBoundingClientRect();
          if (!n) return;
          if ((!ui.fitDone || !rect.width) && tries++ < 30) { setTimeout(go, 100); return; }
          ui.selected = { type: 'node', id: id };
          var k = Math.max(ui.view.k, 0.9);
          ui.view.k = k;
          ui.view.x = rect.width / 2 - (n.x + FLOW_NODE_W / 2) * k;
          ui.view.y = rect.height / 2 - (n.y + FLOW_NODE_H / 2) * k;
          applyView();
          renderCanvas();
          renderPanel();
        })();
      },
    };

    // ---------- Zeichnen ----------
    function applyView() {
      viewport.setAttribute('transform', 'translate(' + ui.view.x + ',' + ui.view.y + ') scale(' + ui.view.k + ')');
    }
    function edgePath(from, to) {
      var fx = from.x + FLOW_NODE_W / 2, tx = to.x + FLOW_NODE_W / 2;
      var down = to.y >= from.y;
      var fy = down ? from.y + FLOW_NODE_H : from.y;
      var ty = down ? to.y : to.y + FLOW_NODE_H;
      if (Math.abs(to.y - from.y) < FLOW_NODE_H) {
        // gleiche Ebene: seitlich verbinden
        var right = to.x > from.x;
        fx = right ? from.x + FLOW_NODE_W : from.x;
        tx = right ? to.x : to.x + FLOW_NODE_W;
        fy = from.y + FLOW_NODE_H / 2;
        ty = to.y + FLOW_NODE_H / 2;
        var mx = (fx + tx) / 2;
        return 'M' + fx + ',' + fy + ' C' + mx + ',' + fy + ' ' + mx + ',' + ty + ' ' + tx + ',' + ty;
      }
      var dy = Math.max(30, Math.abs(ty - fy) / 2);
      var sign = down ? 1 : -1;
      return 'M' + fx + ',' + fy + ' C' + fx + ',' + (fy + sign * dy) + ' ' + tx + ',' + (ty - sign * dy) + ' ' + tx + ',' + ty;
    }
    // NEU: Zone "Außerhalb deiner Website" hinter den Off-Site-Knoten (fängt keine Klicks ab)
    function renderOffsiteZone() {
      if (!ui.showOffsite) return;
      var off = diagram.nodes.filter(function (n) { return n.kind === 'offsite'; });
      if (!off.length) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      off.forEach(function (n) {
        minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + FLOW_NODE_W); maxY = Math.max(maxY, n.y + FLOW_NODE_H);
      });
      var pad = 16;
      edgeLayer.appendChild(svgEl('rect', { class: 'cvz-flow-zone', x: minX - pad, y: minY - pad - 16, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 + 16 }));
      edgeLayer.appendChild(svgEl('text', { class: 'cvz-flow-zone-label', x: minX - pad + 8, y: minY - pad - 4 }, ['Außerhalb deiner Website']));
    }
    function renderCanvas() {
      clear(edgeLayer);
      clear(nodeLayer);
      renderOffsiteZone();
      diagram.edges.forEach(function (e) {
        var a = nodeById(e.from), b = nodeById(e.to);
        if (!a || !b || !isVisible(a) || !isVisible(b)) return;
        var outward = a.kind === 'offsite' || b.kind === 'offsite';
        // Off-Site-Verbindungen hängen am Off-Site-Schalter, nicht an "Interne Links"
        if (e.type === 'link' && !outward && !ui.showLinks) return;
        var d = edgePath(a, b);
        var isSel = ui.selected && ui.selected.type === 'edge' && ui.selected.id === e.id;
        var g = svgEl('g', { 'data-edge-id': e.id, class: 'cvz-flow-edge' + (isSel ? ' is-selected' : '') });
        g.appendChild(svgEl('path', { d: d, class: 'cvz-flow-edge-hit', fill: 'none' }));
        g.appendChild(svgEl('path', {
          d: d, fill: 'none',
          class: 'cvz-flow-edge-line ' + (outward ? 'is-offsite' : (e.type === 'link' ? 'is-link' : 'is-hierarchy')),
          'marker-end': outward ? 'url(#cvz-flow-arrow-offsite)' : (e.type === 'link' ? 'url(#cvz-flow-arrow-link)' : 'url(#cvz-flow-arrow)'),
        }));
        edgeLayer.appendChild(g);
      });
      diagram.nodes.forEach(function (n) {
        if (!isVisible(n)) return;
        if (n.kind === 'offsite') { nodeLayer.appendChild(renderOffsiteNode(n)); return; }
        var color = n.kind === 'topic' ? FLOW_TOPIC_COLOR : (n.kind === 'conversion' ? '#4fd1c5' : (FLOW_PHASE_COLORS[n.phase] || '#6e7681'));
        var isSel = ui.selected && ui.selected.type === 'node' && ui.selected.id === n.id;
        var g = svgEl('g', {
          'data-node-id': n.id,
          class: 'cvz-flow-node' + (isSel ? ' is-selected' : '') + (n.kind === 'custom' ? ' is-custom' : '') + (n.kind === 'topic' ? ' is-topic' : ''),
          transform: 'translate(' + n.x + ',' + n.y + ')',
        });
        g.appendChild(svgEl('rect', { class: 'cvz-flow-node-box', width: FLOW_NODE_W, height: FLOW_NODE_H, style: 'stroke:' + (isSel ? '#f0f4f8' : 'rgba(255,255,255,.18)') }));
        g.appendChild(svgEl('rect', { width: 5, height: FLOW_NODE_H, fill: color }));
        var typeText = n.kind === 'topic' ? 'Cluster-Thema' : (n.kind === 'conversion' ? 'Conversion-Seite' : (n.page_type ? pageTypeLabel(n.page_type) : 'Seite'));
        if (flowIsExisting(n)) typeText += ' · bestehend'; // NEU: bestehende Seite
        g.appendChild(svgEl('text', { class: 'cvz-flow-node-tag', x: 16, y: 17 }, [typeText]));
        var lines = flowWrapText(n.label, 28, 2);
        lines.forEach(function (line, i) {
          g.appendChild(svgEl('text', { class: 'cvz-flow-node-label', x: 16, y: 38 + i * 16 }, [line]));
        });
        var phaseLabel = (n.kind === 'conversion' || n.kind === 'topic') ? '' : phaseName(n.phase);
        if (n.kind === 'topic') g.appendChild(svgEl('text', { class: 'cvz-flow-node-phase', x: 16, y: FLOW_NODE_H - 9, fill: '#8b949e' }, ['Keine eigene Seite']));
        if (phaseLabel) g.appendChild(svgEl('text', { class: 'cvz-flow-node-phase', x: 16, y: FLOW_NODE_H - 9, fill: color }, [phaseLabel]));
        if (n.kind === 'page' && n.page_ref != null && pages[n.page_ref]) {
          var st = pages[n.page_ref].status;
          if (st) {
            g.appendChild(svgEl('circle', { cx: FLOW_NODE_W - 12, cy: 12, r: 5, fill: FLOW_STATUS_COLORS[st] || '#6e7681' }, [svgEl('title', {}, ['Status: ' + st])]));
          }
        }
        var plus = svgEl('g', { class: 'cvz-flow-add', 'data-add-node': n.id, transform: 'translate(' + (FLOW_NODE_W / 2) + ',' + FLOW_NODE_H + ')' }, [
          svgEl('title', {}, ['Neue Seite direkt darunter einfügen']),
          svgEl('circle', { r: 11 }),
          svgEl('path', { d: 'M-5,0 H5 M0,-5 V5', class: 'cvz-flow-add-icon', fill: 'none' }),
        ]);
        g.appendChild(plus);
        if (n.note) g.appendChild(svgEl('text', { class: 'cvz-flow-node-note', x: FLOW_NODE_W - 14, y: FLOW_NODE_H - 9, 'text-anchor': 'end' }, ['✎']));
        nodeLayer.appendChild(g);
      });
      applyView();
    }
    // NEU: Off-Site-Knoten: gestrichelter Rahmen, eigene Farbe, kein "+" für Unterseiten
    function renderOffsiteNode(n) {
      var m = flowMeasureOf(result, n) || {};
      var isSel = ui.selected && ui.selected.type === 'node' && ui.selected.id === n.id;
      var g = svgEl('g', {
        'data-node-id': n.id,
        class: 'cvz-flow-node is-offsite' + (isSel ? ' is-selected' : ''),
        transform: 'translate(' + n.x + ',' + n.y + ')',
      });
      g.appendChild(svgEl('rect', { class: 'cvz-flow-node-box', width: FLOW_NODE_W, height: FLOW_NODE_H, style: 'stroke:' + (isSel ? '#f0f4f8' : 'rgba(244,114,182,.55)') }));
      g.appendChild(svgEl('rect', { width: 5, height: FLOW_NODE_H, fill: FLOW_OFFSITE_COLOR }));
      // Kurz halten: die Kopfzeile ist knapp 30 Zeichen breit
      g.appendChild(svgEl('text', { class: 'cvz-flow-node-tag', x: 16, y: 17 }, [offsiteKindLabel(m).slice(0, 30)]));
      flowWrapText(n.label, 28, 2).forEach(function (line, i) {
        g.appendChild(svgEl('text', { class: 'cvz-flow-node-label', x: 16, y: 38 + i * 16 }, [line]));
      });
      g.appendChild(svgEl('text', { class: 'cvz-flow-node-phase', x: 16, y: FLOW_NODE_H - 9, fill: FLOW_OFFSITE_COLOR }, ['Off-Site' + (m.effort ? ' · Aufwand ' + m.effort : '')]));
      if (n.note) g.appendChild(svgEl('text', { class: 'cvz-flow-node-note', x: FLOW_NODE_W - 14, y: FLOW_NODE_H - 9, 'text-anchor': 'end' }, ['✎']));
      return g;
    }

    // ---------- Toolbar ----------
    function tbButton(label, title, onClick, extraClass) {
      var b = el('button', { type: 'button', class: 'cvz-flow-btn' + (extraClass ? ' ' + extraClass : ''), title: title || label }, [label]);
      b.addEventListener('click', onClick);
      return b;
    }
    function renderToolbar() {
      clear(toolbar);
      toolbar.appendChild(tbButton('+ Seite', 'Neue Seite im Diagramm anlegen', function () { addNode(null); }));
      toolbar.appendChild(tbButton('Rückgängig', 'Letzte Änderung zurücknehmen (Strg/Cmd+Z)', undo, ui.undo.length ? '' : 'is-disabled'));
      toolbar.appendChild(tbButton('Interne Links: ' + (ui.showLinks ? 'an' : 'aus'), 'Gestrichelte Verlinkungen ein- oder ausblenden', function () { ui.showLinks = !ui.showLinks; renderCanvas(); renderToolbar(); }));
      if (hasOffsite()) {
        toolbar.appendChild(tbButton('Off-Site: ' + (ui.showOffsite ? 'an' : 'aus'), 'Maßnahmen außerhalb der Website ein- oder ausblenden', function () {
          ui.showOffsite = !ui.showOffsite;
          if (!ui.showOffsite && ui.selected) {
            var selNode = ui.selected.type === 'node' ? nodeById(ui.selected.id) : null;
            var selEdge = ui.selected.type === 'edge' ? edgeById(ui.selected.id) : null;
            if ((selNode && selNode.kind === 'offsite') || (selEdge && (isOffsite(selEdge.from) || isOffsite(selEdge.to)))) ui.selected = null;
          }
          renderCanvas(); renderPanel(); renderToolbar();
        }));
      }
      toolbar.appendChild(tbButton('Automatisch ordnen', 'Alle Knoten neu als Baum anordnen', function () { pushUndo(); flowAutoLayout(diagram); changed(); fitView(); }));
      toolbar.appendChild(tbButton('Aus Bericht neu aufbauen', 'Verwirft alle Änderungen am Diagramm', function () {
        if (!window.confirm('Alle Änderungen am Diagramm verwerfen und neu aus dem Bericht aufbauen?')) return;
        pushUndo();
        diagram = flowBuildFromResult(result);
        if (store) store.diagram = diagram;
        ui.selected = null;
        changed();
        fitView();
      }));
      var spacer = el('span', { class: 'cvz-flow-spacer' });
      toolbar.appendChild(spacer);
      toolbar.appendChild(tbButton('−', 'Verkleinern', function () { zoomBy(0.8); }, 'cvz-flow-btn-icon'));
      toolbar.appendChild(tbButton('+', 'Vergrößern', function () { zoomBy(1.25); }, 'cvz-flow-btn-icon'));
      toolbar.appendChild(renderExportMenu());
      toolbar.appendChild(tbButton('Einpassen', 'Ganzes Diagramm anzeigen', fitView));
      toolbar.appendChild(tbButton(ui.fullscreen ? 'Vollbild beenden' : 'Vollbild', 'Vollbild umschalten', toggleFullscreen));
      var labels = {
        idle: '', dirty: 'Ungespeicherte Änderungen …', saving: 'Speichert …', saved: 'Gespeichert',
        error: 'Speichern fehlgeschlagen: ' + (ui.saveError || ''), unsaved: 'Wird nicht gespeichert (keine Session)',
      };
      var status = el('span', { class: 'cvz-flow-save cvz-flow-save-' + ui.saveState }, [labels[ui.saveState] || '']);
      if (ui.saveState === 'error') {
        status.appendChild(document.createTextNode(' '));
        status.appendChild(tbButton('Erneut versuchen', '', function () { save(); }));
      }
      toolbar.appendChild(status);
    }

    // ---------- Export-Menü ----------
    function renderExportMenu() {
      var wrap = el('span', { class: 'cvz-flow-menu-wrap' });
      var button = tbButton('Exportieren ▾', 'Diagramm als Datei für andere Tools herunterladen', function (evt) {
        evt.stopPropagation();
        ui.exportOpen = !ui.exportOpen;
        renderToolbar();
      });
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-expanded', ui.exportOpen ? 'true' : 'false');
      wrap.appendChild(button);
      if (ui.exportOpen) {
        var menu = el('div', { class: 'cvz-flow-menu', role: 'menu' });
        [
          { kind: 'table', label: 'Tabelle (CSV)', hint: 'Excel, Google Sheets, Airtable, Notion' },
          { kind: 'clickup', label: 'ClickUp (CSV)', hint: 'Aufgaben mit Unteraufgaben' },
          { kind: 'asana', label: 'Asana (CSV)', hint: 'Aufgaben mit Unteraufgaben' },
        ].forEach(function (item) {
          var entry = el('button', { type: 'button', class: 'cvz-flow-menu-item', role: 'menuitem' }, [
            el('span', {}, [item.label]),
            el('small', {}, [item.hint]),
          ]);
          entry.addEventListener('click', function (evt) {
            evt.stopPropagation();
            var out = flowBuildExport(item.kind, diagram, result);
            flowDownload(out.filename, out.text);
            ui.exportOpen = false;
            renderToolbar();
            notice(out.rows + ' Seiten exportiert: ' + out.filename);
          });
          menu.appendChild(entry);
        });
        wrap.appendChild(menu);
      }
      return wrap;
    }
    if (state.flowMenuCloser) document.removeEventListener('click', state.flowMenuCloser);
    state.flowMenuCloser = function () { if (ui.exportOpen) { ui.exportOpen = false; renderToolbar(); } };
    document.addEventListener('click', state.flowMenuCloser);

    // ---------- Seitenleiste ----------
    function field(labelText, control) {
      return el('label', { class: 'cvz-flow-field' }, [el('span', { class: 'cvz-flow-field-label' }, [labelText]), control]);
    }
    function renderPanel() {
      clear(panel);
      var sel = ui.selected;
      if (!sel) {
        panel.appendChild(el('p', { class: 'cvz-flow-panel-title' }, ['Content-Flow', tip('Klicke eine Seite oder Verbindung an, um sie zu bearbeiten. Ziehe Seiten mit der Maus, um sie zu verschieben; ziehe den Hintergrund, um den Ausschnitt zu bewegen. Strg/Cmd + Mausrad zoomt. Ganz oben steht das Cluster-Thema. Es ist keine eigene Seite, sondern fasst den Cluster zusammen. Darunter stehen nebeneinander die Conversion-Seite (verkauft) und Pillar Pages (bündeln Teilthemen). Durchgezogene Pfeile zeigen den Themen-Baum (Oberseite → Unterseite), gestrichelte sind interne Links, also der Weg zur Conversion-Seite. Die Farbe zeigt die Phase, der Punkt oben rechts den Status aus dem Bericht. Der Baum beschreibt Themen und Verlinkung, nicht die URL-Struktur. Änderungen am Diagramm werden gespeichert, verändern aber den Bericht nicht.' + (hasOffsite() ? ' ' + 'Rechts in der rosa Zone stehen die Off-Site-Maßnahmen: Inhalte und Einträge außerhalb deiner Website, zum Beispiel ein Video oder ein Profil auf einem Bewertungsportal. Die gepunktete Linie zeigt, auf welche eigene Seite die Maßnahme verweisen soll.' : ''), 'Hilfe zum Content-Flow')]));
        panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Klicke eine Seite oder Verbindung an, um sie zu bearbeiten.']));
        var legend = el('div', { class: 'cvz-flow-legend' });
        MESSY_MIDDLE_PHASES.forEach(function (ph) {
          if (ph.value === 'legacy') return;
          legend.appendChild(el('span', { class: 'cvz-flow-legend-item' }, [
            el('i', { style: 'background:' + FLOW_PHASE_COLORS[ph.value] }), ph.label,
          ]));
        });
        if (hasOffsite()) legend.appendChild(el('span', { class: 'cvz-flow-legend-item' }, [el('i', { style: 'background:' + FLOW_OFFSITE_COLOR }), 'Off-Site']));
        panel.appendChild(legend);
        return;
      }
      if (sel.type === 'edge') {
        var edge = edgeById(sel.id);
        if (!edge) return;
        var a = nodeById(edge.from), b = nodeById(edge.to);
        var outward = (a && a.kind === 'offsite') || (b && b.kind === 'offsite');
        panel.appendChild(el('p', { class: 'cvz-flow-panel-title' }, [outward ? 'Verbindung nach außen' : (edge.type === 'hierarchy' ? 'Themen-Baum-Verbindung' : 'Interner Link')]));
        panel.appendChild(el('p', { class: 'cvz-cs-hint' }, [(a ? a.label : '?') + ' → ' + (b ? b.label : '?')]));
        if (outward) {
          var om = flowMeasureOf(result, a && a.kind === 'offsite' ? a : b) || {};
          panel.appendChild(el('p', { class: 'cvz-cs-hint' }, [a && a.kind === 'offsite'
            ? 'Die Off-Site-Maßnahme verweist auf diese eigene Seite.' + (om.link_target && om.link_target.embed ? ' Das Video oder die Folge zusätzlich auf der Seite einbinden.' : '')
            : 'Die eigene Seite verweist auf den Inhalt außerhalb der Website.']));
          panel.appendChild(tbButton('Umkehren', 'Richtung der Verbindung tauschen', function () {
            pushUndo();
            var t0 = edge.from; edge.from = edge.to; edge.to = t0;
            changed();
          }));
          panel.appendChild(tbButton('Verbindung löschen', '', function () {
            pushUndo();
            diagram.edges = diagram.edges.filter(function (x) { return x.id !== edge.id; });
            ui.selected = null;
            changed();
          }, 'cvz-flow-btn-danger'));
          return;
        }
        if (isFixedEdge(edge)) {
          panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Feste Verbindung: Die Conversion-Seite hängt immer direkt am Cluster-Thema.']));
          return;
        }
        var toggle = tbButton(edge.type === 'hierarchy' ? 'In internen Link umwandeln' : 'In Baum-Verbindung umwandeln', '', function () {
          if (edge.type === 'link') {
            var target = nodeById(edge.to);
            if ((target && (target.kind === 'conversion' || target.kind === 'topic')) || isDescendant(edge.from, edge.to)) { notice('Das ist im Themen-Baum nicht möglich: Conversion-Seite und Cluster-Thema sind fest platziert.'); return; }
            pushUndo();
            var old = parentEdgeOf(edge.to);
            if (old) diagram.edges = diagram.edges.filter(function (x) { return x.id !== old.id; });
            edge.type = 'hierarchy';
          } else {
            pushUndo();
            edge.type = 'link';
          }
          changed();
        });
        panel.appendChild(toggle);
        panel.appendChild(tbButton('Umkehren', 'Richtung der Verbindung tauschen', function () {
          if (edge.type === 'hierarchy') {
            notice('Bei Baum-Verbindungen bitte die Oberseite in der Seitenauswahl ändern.');
            return;
          }
          pushUndo();
          var t = edge.from; edge.from = edge.to; edge.to = t;
          changed();
        }));
        panel.appendChild(tbButton('Verbindung löschen', '', function () {
          pushUndo();
          diagram.edges = diagram.edges.filter(function (x) { return x.id !== edge.id; });
          ui.selected = null;
          changed();
        }, 'cvz-flow-btn-danger'));
        return;
      }
      var node = nodeById(sel.id);
      if (!node) return;
      if (node.kind === 'offsite') { renderOffsitePanel(node); return; }
      panel.appendChild(el('p', { class: 'cvz-flow-panel-title' }, [node.kind === 'topic' ? 'Cluster-Thema' : (node.kind === 'conversion' ? 'Conversion-Seite' : (node.kind === 'custom' ? 'Eigene Seite' : 'Seite aus dem Bericht'))]));
      if (node.kind === 'topic') {
        panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine eigene Seite und keine URL. Das Thema hält Conversion-Seite, Pillar Pages und informationelle Seiten ohne passende Pillar Page zusammen. Es kann nicht verlinkt werden.']));
      }
      var labelInput = el('input', { type: 'text', class: 'cvz-flow-input', maxlength: String(FLOW_LIMITS.label), value: node.label });
      labelInput.addEventListener('focus', pushUndoOnce(node.id + ':label'));
      labelInput.addEventListener('input', function () {
        var v = labelInput.value.trim();
        if (!v) return;
        node.label = v.slice(0, FLOW_LIMITS.label);
        renderCanvas();
        scheduleSave();
      });
      panel.appendChild(field('Titel', labelInput));

      if (node.kind === 'custom') {
        var typeSelect = el('select', { class: 'cvz-flow-input' });
        FLOW_CUSTOM_TYPES.forEach(function (t) {
          var o = el('option', { value: t }, [pageTypeLabel(t)]);
          if (node.page_type === t) o.setAttribute('selected', 'selected');
          typeSelect.appendChild(o);
        });
        if (!node.page_type) typeSelect.insertBefore(el('option', { value: '', selected: 'selected' }, ['Seitentyp wählen …']), typeSelect.firstChild);
        typeSelect.addEventListener('change', function () { pushUndo(); node.page_type = typeSelect.value || undefined; changed(); });
        panel.appendChild(field('Seitentyp', typeSelect));
        var phaseSelect = el('select', { class: 'cvz-flow-input' });
        phaseSelect.appendChild(el('option', { value: '' }, ['Keine Phase']));
        MESSY_MIDDLE_PHASES.forEach(function (ph) {
          if (ph.value === 'legacy') return;
          var o = el('option', { value: ph.value }, [ph.label]);
          if (node.phase === ph.value) o.setAttribute('selected', 'selected');
          phaseSelect.appendChild(o);
        });
        phaseSelect.addEventListener('change', function () { pushUndo(); node.phase = phaseSelect.value || undefined; changed(); });
        panel.appendChild(field('Phase', phaseSelect));
      } else if (node.kind === 'page' && node.page_ref != null && pages[node.page_ref]) {
        var page = pages[node.page_ref];
        panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keyword: ' + page.keyword + ' · ' + pageVolumeText(page) + (page.search_intent ? ' · Suchintention: ' + (SEARCH_INTENT_TEXT[page.search_intent] || page.search_intent).replace(/ \(.*\)$/, '') : '')]));
        var panelVolNote = renderVolumeProxyNote(page);
        if (panelVolNote) panel.appendChild(panelVolNote);
        if (page.reasoning) panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, [String(page.reasoning).slice(0, 260) + (String(page.reasoning).length > 260 ? '…' : '')]));
      } else if (node.kind === 'conversion') {
        var cp = result.conversion_page;
        panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keyword: ' + cp.keyword + ' · ' + pageVolumeText(cp)]));
        var panelVolNoteCp = renderVolumeProxyNote(cp);
        if (panelVolNoteCp) panel.appendChild(panelVolNoteCp);
      }
      // NEU: bei bestehenden Seiten Hebel, Verbesserungen und Vergleich auch hier, damit im Flow alles beisammen ist
      if (flowIsExisting(node)) {
        var refN = node.kind === 'conversion' ? -1 : node.page_ref;
        var pg = refN === -1 ? result.conversion_page : pages[refN];
        if (pg && pg.existing_lever) panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Hebel: ' + pg.existing_lever.label]));
        var cmpN = renderPageComparison(comparisonOf(refN), true);
        if (cmpN) panel.appendChild(cmpN);
        if (pg && pg.content_brief && pg.content_brief.length) {
          panel.appendChild(el('p', { class: 'cvz-flow-panel-sub' }, ['Was an dieser Seite verbessert wird']));
          var bl = el('ul', { class: 'cvz-cs-cmp-list' });
          pg.content_brief.slice(0, 5).forEach(function (b) { bl.appendChild(el('li', {}, [b])); });
          panel.appendChild(bl);
        }
      }
      if (node.kind === 'page' || node.kind === 'conversion' || node.kind === 'custom') panel.appendChild(renderNodeLinks(node)); // NEU: Links dieser Seite

      if (node.kind !== 'conversion' && node.kind !== 'topic') {
        var parentSelect = el('select', { class: 'cvz-flow-input' });
        parentSelect.appendChild(el('option', { value: '' }, ['Keine (oberste Ebene)']));
        var currentParent = parentEdgeOf(node.id);
        diagram.nodes.forEach(function (other) {
          if (other.id === node.id || other.kind === 'offsite' || isDescendant(other.id, node.id)) return;
          var o = el('option', { value: other.id }, [other.label]);
          if (currentParent && currentParent.from === other.id) o.setAttribute('selected', 'selected');
          parentSelect.appendChild(o);
        });
        parentSelect.addEventListener('change', function () {
          pushUndo();
          var old = parentEdgeOf(node.id);
          if (old) diagram.edges = diagram.edges.filter(function (x) { return x.id !== old.id; });
          if (parentSelect.value) {
            diagram.edges.push({ id: flowNewId('e', takenIds()), from: parentSelect.value, to: node.id, type: 'hierarchy' });
          }
          changed();
        });
        panel.appendChild(field('Übergeordnete Seite', parentSelect));
      }

      var noteInput = el('textarea', { class: 'cvz-flow-input', rows: '3', maxlength: String(FLOW_LIMITS.note), placeholder: 'Eigene Notiz, z.B. Verantwortliche Person, Deadline, Idee' });
      noteInput.value = node.note || '';
      noteInput.addEventListener('focus', pushUndoOnce(node.id + ':note'));
      noteInput.addEventListener('input', function () {
        node.note = noteInput.value.slice(0, FLOW_LIMITS.note) || undefined;
        renderCanvas();
        scheduleSave();
      });
      panel.appendChild(field('Notiz', noteInput));

      var actions = el('div', { class: 'cvz-flow-actions' });
      actions.appendChild(tbButton('+ Unterseite', 'Neue Seite unter dieser anlegen', function () { addNode(node); }));
      if (node.kind !== 'topic') {
        actions.appendChild(tbButton('Interner Link …', 'Von dieser Seite auf eine andere verlinken', function () { setMode('connect-link'); }));
      }
      actions.appendChild(tbButton('Unterseite zuweisen …', 'Eine bestehende Seite unter diese hängen', function () { setMode('connect-hierarchy'); }));
      if (node.kind !== 'conversion' && node.kind !== 'topic') {
        actions.appendChild(tbButton('Aus Diagramm entfernen', 'Entfernt nur den Knoten im Diagramm, nicht die Seite im Bericht', function () { removeNode(node.id); }, 'cvz-flow-btn-danger'));
      }
      panel.appendChild(actions);
    }
    // NEU: Seitenleiste für eine Off-Site-Maßnahme
    function renderOffsitePanel(node) {
      var m = flowMeasureOf(result, node) || {};
      panel.appendChild(el('p', { class: 'cvz-flow-panel-title' }, ['Off-Site-Maßnahme']));
      panel.appendChild(el('p', { class: 'cvz-cs-hint' }, [offsiteKindLabel(m) + (m.domain ? ' · ' + m.domain : '') + (m.effort ? ' · Aufwand ' + m.effort : '')]));
      if (m.action) panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, [m.action]));
      if (m.basis) panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Beleg: ' + m.basis]));
      var targetEdge = null;
      diagram.edges.forEach(function (e) { if (!targetEdge && e.from === node.id && !isOffsite(e.to)) targetEdge = e; });
      var targetNode = targetEdge ? nodeById(targetEdge.to) : null;
      if (targetNode) {
        panel.appendChild(el('p', { class: 'cvz-cs-offsite-target' }, ['Verweist auf: ' + targetNode.label + (m.link_target && m.link_target.embed ? ' (dort auch einbinden)' : '')]));
      } else {
        panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Noch keine eigene Zielseite. Ohne Verweis auf eine passende Seite bringt die Maßnahme dir kaum Besucher.']));
      }
      panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Details und Belege stehen im Bericht unter GEO-Strategie.']));
      var labelInput = el('input', { type: 'text', class: 'cvz-flow-input', maxlength: String(FLOW_LIMITS.label), value: node.label });
      labelInput.addEventListener('focus', pushUndoOnce(node.id + ':label'));
      labelInput.addEventListener('input', function () {
        var v = labelInput.value.trim();
        if (!v) return;
        node.label = v.slice(0, FLOW_LIMITS.label);
        renderCanvas();
        scheduleSave();
      });
      panel.appendChild(field('Titel', labelInput));
      var noteInput = el('textarea', { class: 'cvz-flow-input', rows: '3', maxlength: String(FLOW_LIMITS.note), placeholder: 'Eigene Notiz, z.B. Verantwortliche Person, Deadline' });
      noteInput.value = node.note || '';
      noteInput.addEventListener('focus', pushUndoOnce(node.id + ':note'));
      noteInput.addEventListener('input', function () {
        node.note = noteInput.value.slice(0, FLOW_LIMITS.note) || undefined;
        renderCanvas();
        scheduleSave();
      });
      panel.appendChild(field('Notiz', noteInput));
      var actions = el('div', { class: 'cvz-flow-actions' });
      actions.appendChild(tbButton('Verweist auf …', 'Eigene Seite wählen, auf die die Maßnahme verweisen soll', function () { setMode('connect-link'); }));
      actions.appendChild(tbButton('Aus Diagramm entfernen', 'Entfernt nur den Knoten im Diagramm, nicht die Maßnahme im Bericht', function () { removeNode(node.id); }, 'cvz-flow-btn-danger'));
      panel.appendChild(actions);
    }
    // Ein Undo-Schritt pro Feld-Fokus statt pro Tastendruck
    function pushUndoOnce(key) {
      return function () { if (ui._lastUndoKey !== key) { pushUndo(); ui._lastUndoKey = key; } };
    }

    // ---------- Aktionen ----------
    function addNode(parentNode) {
      if (diagram.nodes.length >= FLOW_LIMITS.nodes) { notice('Maximal ' + FLOW_LIMITS.nodes + ' Seiten im Diagramm.'); return; }
      if (parentNode && diagram.edges.length >= FLOW_LIMITS.edges) { notice('Maximal ' + FLOW_LIMITS.edges + ' Verbindungen im Diagramm.'); return; }
      pushUndo();
      var id = flowNewId('n', takenIds());
      var x, y;
      if (parentNode) {
        var siblings = diagram.edges.filter(function (e) { return e.type === 'hierarchy' && e.from === parentNode.id; }).length;
        x = parentNode.x + siblings * (FLOW_NODE_W + FLOW_GAP_X);
        y = parentNode.y + FLOW_NODE_H + FLOW_GAP_Y;
      } else {
        var rect = svg.getBoundingClientRect();
        x = (rect.width / 2 - ui.view.x) / ui.view.k - FLOW_NODE_W / 2;
        y = (rect.height / 2 - ui.view.y) / ui.view.k - FLOW_NODE_H / 2;
      }
      var node = { id: id, kind: 'custom', label: 'Neue Seite', page_type: parentNode ? 'topic_coverage' : undefined, x: flowClamp(Math.round(x)), y: flowClamp(Math.round(y)) };
      if (!node.page_type) delete node.page_type;
      diagram.nodes.push(node);
      if (parentNode) diagram.edges.push({ id: flowNewId('e', takenIds()), from: parentNode.id, to: id, type: 'hierarchy' });
      ui.selected = { type: 'node', id: id };
      changed();
      var input = panel.querySelector('input[type=text]');
      if (input) { input.focus(); input.select(); }
    }
    function removeNode(id) {
      pushUndo();
      diagram.nodes = diagram.nodes.filter(function (n) { return n.id !== id; });
      diagram.edges = diagram.edges.filter(function (e) { return e.from !== id && e.to !== id; });
      ui.selected = null;
      changed();
    }
    function connect(fromId, toId, type) {
      if (fromId === toId) { notice('Eine Seite kann nicht auf sich selbst zeigen.'); return; }
      if (diagram.edges.length >= FLOW_LIMITS.edges && type === 'link') { notice('Maximal ' + FLOW_LIMITS.edges + ' Verbindungen im Diagramm.'); return; }
      var toNode = nodeById(toId);
      if (type === 'link' && (isTopic(fromId) || isTopic(toId))) { notice('Das Cluster-Thema ist keine Seite und kann nicht verlinkt werden.'); return; }
      if (type === 'hierarchy' && (isOffsite(fromId) || isOffsite(toId))) { notice('Off-Site-Maßnahmen liegen außerhalb der Website und gehören nicht in den Themen-Baum. Nutze „Verweist auf …“.'); return; }
      if (type === 'link' && isOffsite(fromId) && isOffsite(toId)) { notice('Zwei Off-Site-Maßnahmen lassen sich nicht verbinden. Wähle eine eigene Seite.'); return; }
      if (type === 'hierarchy') {
        if (toNode && toNode.kind === 'topic') { notice('Das Cluster-Thema steht immer ganz oben.'); return; }
        if (toNode && toNode.kind === 'conversion') { notice('Die Conversion-Seite hängt immer direkt am Cluster-Thema.'); return; }
        if (isDescendant(fromId, toId)) { notice('Das würde einen Kreis im Themen-Baum erzeugen.'); return; }
        pushUndo();
        var old = parentEdgeOf(toId);
        if (old) diagram.edges = diagram.edges.filter(function (x) { return x.id !== old.id; });
        diagram.edges.push({ id: flowNewId('e', takenIds()), from: fromId, to: toId, type: 'hierarchy' });
      } else {
        var exists = diagram.edges.some(function (e) { return e.type === 'link' && e.from === fromId && e.to === toId; });
        if (exists) { notice('Diese Verlinkung gibt es schon.'); return; }
        pushUndo();
        diagram.edges.push({ id: flowNewId('e', takenIds()), from: fromId, to: toId, type: 'link' });
        ui.showLinks = true;
      }
      changed();
      renderToolbar();
    }

    // ---------- Ansicht ----------
    function zoomBy(factor, cx, cy) {
      var rect = svg.getBoundingClientRect();
      var px = cx != null ? cx : rect.width / 2;
      var py = cy != null ? cy : rect.height / 2;
      var nk = Math.max(0.25, Math.min(2.5, ui.view.k * factor));
      var real = nk / ui.view.k;
      ui.view.x = px - (px - ui.view.x) * real;
      ui.view.y = py - (py - ui.view.y) * real;
      ui.view.k = nk;
      applyView();
    }
    function fitView() {
      var rect = svg.getBoundingClientRect();
      var shown = diagram.nodes.filter(isVisible);
      if (!rect.width || !rect.height || shown.length === 0) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      shown.forEach(function (n) {
        minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + FLOW_NODE_W); maxY = Math.max(maxY, n.y + FLOW_NODE_H);
      });
      var pad = 32;
      var k = Math.min((rect.width - pad * 2) / (maxX - minX), (rect.height - pad * 2) / (maxY - minY), 1.2);
      k = Math.max(0.25, k);
      ui.view.k = k;
      ui.view.x = pad + (rect.width - pad * 2 - (maxX - minX) * k) / 2 - minX * k;
      ui.view.y = pad + (rect.height - pad * 2 - (maxY - minY) * k) / 2 - minY * k;
      applyView();
    }
    function toggleFullscreen() {
      ui.fullscreen = !ui.fullscreen;
      root.className = 'cvz-flow' + (ui.fullscreen ? ' is-fullscreen' : '');
      renderToolbar();
      setTimeout(fitView, 30);
    }

    // ---------- Maus / Touch ----------
    function toLocal(evt) {
      var rect = svg.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }
    svg.addEventListener('pointerdown', function (evt) {
      if (evt.button !== undefined && evt.button !== 0) return;
      var addG = evt.target.closest ? evt.target.closest('[data-add-node]') : null;
      if (addG && !ui.mode) {
        evt.preventDefault();
        var parent = nodeById(addG.getAttribute('data-add-node'));
        if (parent) addNode(parent);
        return;
      }
      var nodeG = evt.target.closest ? evt.target.closest('[data-node-id]') : null;
      var edgeG = evt.target.closest ? evt.target.closest('[data-edge-id]') : null;
      svg.focus({ preventScroll: true });
      var pt = toLocal(evt);
      if (ui.mode && nodeG) {
        var from = ui.selected && ui.selected.type === 'node' ? ui.selected.id : null;
        var type = ui.mode === 'connect-hierarchy' ? 'hierarchy' : 'link';
        setMode(null);
        if (from) connect(from, nodeG.getAttribute('data-node-id'), type);
        evt.preventDefault();
        return;
      }
      if (nodeG) {
        var id = nodeG.getAttribute('data-node-id');
        var n = nodeById(id);
        ui.selected = { type: 'node', id: id };
        ui.drag = { kind: 'node', id: id, startX: pt.x, startY: pt.y, origX: n.x, origY: n.y, moved: false };
        renderCanvas();
        renderPanel();
      } else if (edgeG) {
        ui.selected = { type: 'edge', id: edgeG.getAttribute('data-edge-id') };
        renderCanvas();
        renderPanel();
        return;
      } else {
        if (ui.mode) setMode(null);
        ui.selected = null;
        ui.drag = { kind: 'pan', startX: pt.x, startY: pt.y, origX: ui.view.x, origY: ui.view.y, moved: false };
        renderCanvas();
        renderPanel();
      }
      try { svg.setPointerCapture(evt.pointerId); } catch (e) { /* ältere Browser */ }
      evt.preventDefault();
    });
    svg.addEventListener('pointermove', function (evt) {
      if (!ui.drag) return;
      var pt = toLocal(evt);
      var dx = pt.x - ui.drag.startX, dy = pt.y - ui.drag.startY;
      if (!ui.drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (ui.drag.kind === 'node') {
        if (!ui.drag.moved) pushUndo();
        ui.drag.moved = true;
        var n = nodeById(ui.drag.id);
        if (!n) return;
        n.x = flowClamp(Math.round(ui.drag.origX + dx / ui.view.k));
        n.y = flowClamp(Math.round(ui.drag.origY + dy / ui.view.k));
        renderCanvas();
      } else {
        ui.drag.moved = true;
        ui.view.x = ui.drag.origX + dx;
        ui.view.y = ui.drag.origY + dy;
        applyView();
      }
    });
    function endDrag(evt) {
      if (!ui.drag) return;
      var wasNodeMove = ui.drag.kind === 'node' && ui.drag.moved;
      ui.drag = null;
      try { svg.releasePointerCapture(evt.pointerId); } catch (e) { /* egal */ }
      if (wasNodeMove) { renderToolbar(); scheduleSave(); }
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('wheel', function (evt) {
      if (!(evt.ctrlKey || evt.metaKey) && !ui.fullscreen) return;
      evt.preventDefault();
      var pt = toLocal(evt);
      zoomBy(evt.deltaY < 0 ? 1.12 : 1 / 1.12, pt.x, pt.y);
    }, { passive: false });
    svg.addEventListener('keydown', function (evt) {
      if ((evt.ctrlKey || evt.metaKey) && (evt.key === 'z' || evt.key === 'Z')) { evt.preventDefault(); undo(); return; }
      if (evt.key === 'Escape') {
        if (ui.exportOpen) { ui.exportOpen = false; renderToolbar(); return; }
        if (ui.mode) setMode(null);
        else if (ui.fullscreen) toggleFullscreen();
        return;
      }
      if ((evt.key === 'Delete' || evt.key === 'Backspace') && ui.selected) {
        evt.preventDefault();
        if (ui.selected.type === 'node') {
          var n = nodeById(ui.selected.id);
          if (n && n.kind !== 'conversion' && n.kind !== 'topic') removeNode(n.id);
        } else {
          var eid = ui.selected.id;
          var selEdge = edgeById(eid);
          if (selEdge && isFixedEdge(selEdge)) { notice('Feste Verbindung: Die Conversion-Seite hängt immer direkt am Cluster-Thema.'); return; }
          pushUndo();
          diagram.edges = diagram.edges.filter(function (x) { return x.id !== eid; });
          ui.selected = null;
          changed();
        }
      }
    });

    renderToolbar();
    renderCanvas();
    renderPanel();
    // Einpassen, sobald der Container im DOM sitzt und eine Größe hat
    var fitTries = 0;
    (function tryFit() {
      var rect = svg.getBoundingClientRect();
      if ((rect.width > 0 && rect.height > 0) || fitTries++ > 20) { if (rect.width > 0) fitView(); ui.fitDone = true; return; }
      setTimeout(tryFit, 100);
    })();
    return root;
  }

  function getVisibilityPrompts(session) {
    var fresh = session && session.visibility_measurement;
    var snap = session && session.tracker_snapshot;
    return (fresh && fresh.prompts) || (snap && snap.prompts) || [];
  }

  function renderResult(sessionId, result, fundedBy, session) {
    // Für die Seiten-Karten: Messdaten der Fragen (Teilfragen/Fan-out), siehe renderPageCard.
    state.visibilityPrompts = getVisibilityPrompts(session);
    state.wizardActive = false;
    state.funnelRefresh = null; // NEU: wird vom Funnel-Abschnitt neu gesetzt, falls der Bericht einen hat
    state.goalRefresh = null; // NEU: wird vom Abschnitt Ziel der Strategie gesetzt
    clear(state.root);
    // NEU: Chat als Panel (am body). Vor den Abschnitten anlegen, weil die Seitenkarten "Nachfragen" nur mit Chat zeigen.
    // Wie bisher nur für die Person, die den Bericht erstellt hat.
    var canChat = !!sessionId && (!session || session.user_id === state.userId);
    if (canChat) state.chatPanel = createChatPanel(sessionId);
    var wrap = el('div', { class: 'cvz-cs-result cvz-cs-report' });
    wrap.appendChild(renderReportHeader(result, session, sessionId));
    // NEU: Sprungleiste direkt unter dem Kopf. Wird erst aktiv, wenn der Bericht im DOM steht (siehe unten).
    // NEU: Abschnittsnummern aus dem Inhalt des Berichts (der Funnel-Abschnitt fehlt bei älteren Berichten).
    var navItems = buildReportNavItems(result, session);
    var secNo = {};
    navItems.forEach(function (it) { secNo[it.key] = it.n; });
    var anchorNav = buildAnchorNav(navItems, canChat ? { onAsk: function () { if (state.chatPanel) state.chatPanel.open(); } } : null);
    wrap.appendChild(anchorNav.sentinel);
    wrap.appendChild(anchorNav.nav);
    wrap.appendChild(anchorNav.spacer);
    // GEÄNDERT (Übersicht): Reihenfolge Überblick, Plan, Grundlagen. Die Grundlagen sind eingeklappt, die Sprungleiste öffnet sie bei Bedarf.
    // NEU: Ziel der Strategie vor allem anderen. Fehlt nur bei sehr alten Berichten ohne Zielaktion, Phasen und Seiten.
    var sec_goal = secNo.goal ? renderReportSection(secNo.goal, 'Ziel der Strategie', [renderGoalOverview(result, session)]) : null;
    var sec_summary = renderReportSection(secNo.summary, 'Executive Summary', [el('div', { class: 'cvz-cs-executive-summary' }, [renderProse(result.executive_summary)]), renderTrafficBlock(result), renderProfileWarnings(result)]);
    var sec_roadmap = renderReportSection(secNo.roadmap, 'Empfohlene Roadmap', [renderRoadmapSection(result.roadmap, result)]);
    var sec_cluster = renderReportSection(secNo.cluster, 'Content-Plan: Seiten, Content-Flow und was ihr bauen müsst', buildContentPlanChildren(sessionId, result, session));
    var sec_touchpoints = secNo.touchpoints ? renderReportSection(secNo.touchpoints, 'Touchpoint-Plan: wie Interessenten zu den Zwischenschritten kommen', [renderTouchpointSection(sessionId, result, session)]) : null;
    var sec_geo = renderReportSection(secNo.geo, 'Sichtbarkeit: Google und KI-Antworten', renderVisibilityOverview(result, session)); // GEÄNDERT: SEO und GEO zusammen, Ist-Zustand integriert
    var sec_validation = renderReportSection(secNo.validation, 'Themen-Check', [renderTopicValidationSection(result.topic_validation, result.seed_topic)]);
    var sec_ausgangslage = renderReportSection(secNo.ausgangslage, 'Ausgangslage', [renderTrackerSourceNote(session), renderProse(result.ausgangslage), renderProfileBox(result)]);
    wrap.appendChild(el('p', { class: 'cvz-cs-group-label' }, ['Überblick']));
    if (sec_goal) wrap.appendChild(sec_goal);
    wrap.appendChild(sec_summary);
    wrap.appendChild(sec_roadmap);
    wrap.appendChild(el('p', { class: 'cvz-cs-group-label' }, ['Plan']));
    wrap.appendChild(sec_cluster);
    if (sec_touchpoints) wrap.appendChild(sec_touchpoints);
    wrap.appendChild(sec_geo);
    var foundations = el('details', { class: 'cvz-cs-group-fold' }, [el('summary', {}, ['Grundlagen: Themen-Check und Ausgangslage', tip('Hier steht, worauf die Strategie aufbaut: das geprüfte Thema und die Ausgangslage mit deinem Produktprofil. Wer heute schon für das Thema rankt, steht jetzt im Abschnitt Sichtbarkeit. Zum Arbeiten brauchst du die Grundlagen selten, zum Nachvollziehen schon.', 'Was steht in den Grundlagen?')])]);
    foundations.appendChild(sec_validation);
    foundations.appendChild(sec_ausgangslage);
    wrap.appendChild(foundations);
    var fundingText = fundedBy
      ? 'Finanziert aus: ' + (fundedBy === 'ppu_strategy' ? 'Pay-per-Use-Credit' : 'Plan-Kontingent')
      : 'Gespeicherte Strategie';
    var footer = el('div', { class: 'cvz-cs-footer' }, [
      el('span', { class: 'cvz-cs-hint' }, [fundingText]),
      el('button', { type: 'button', class: 'cvz-cs-retry-btn', onclick: renderApp }, ['Neue Strategie erstellen']),
    ]);
    wrap.appendChild(footer);
    if (canChat) wrap.appendChild(renderChatTeaser()); // GEÄNDERT: Der Chat selbst steht im Panel, hier nur der Einstieg
    wrap.appendChild(el('p', { class: 'cvz-cs-ki-disclaimer' }, [
      'Diese Analyse wurde vollständig durch ein KI-System erstellt. Alle Empfehlungen sollten durch eine qualifizierte Fachperson geprüft werden. Alle Angaben ohne Gewähr.'
    ]));
    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(wrap);
    state.anchorNavCleanup = anchorNav.activate();
  }

  // ==================== NEU: SPRUNGLEISTE ====================
  // Übernommen aus dem LP-Report (report.js v9, injectAnchorNav), angepasst an dieses Widget:
  // - Kein position:sticky: Das bricht auf Mobile, sobald ein Vorfahre overflow/transform setzt (Webflow, GSAP).
  //   Stattdessen ein 1-px-Sentinel vor der Leiste. Verlässt er den Bildschirm, wird die Leiste fixed und an den body
  //   gehängt, ein Spacer hält ihre Höhe frei.
  // - Aktiver Abschnitt ist sichtbar hervorgehoben (im LP-Report fehlt das, dort sieht "aktiv" aus wie "inaktiv").
  // - Die Leiste scrollt horizontal zum aktiven Link, ohne die Seite vertikal zu bewegen (scrollIntoView kann das).
  // - activate() gibt eine Aufräum-Funktion zurück. clear() ruft sie auf, wenn der Bericht verlassen wird.
  // GEÄNDERT: Die Nummern ergeben sich aus dem, was der Bericht enthält. Der Abschnitt "Funnel" fehlt bei älteren Berichten,
  // dann rücken GEO und Roadmap auf und die Sprungleiste zeigt keinen toten Link.
  // GEÄNDERT (Übersicht): Der Bericht folgt jetzt der Arbeit statt der Entstehung. Überblick (Zusammenfassung, Roadmap), Plan (Cluster, Flow,
  // Funnel, Touchpoints, GEO), Grundlagen (Themen-Check, Ausgangslage, Ist-Zustand, eingeklappt). GEO liegt im Plan, weil dort Maßnahmen stehen.
  var REPORT_NAV_BASE = [
    { key: 'goal', label: 'Ziel', optional: true }, // NEU: Ziel der Strategie
    { key: 'summary', label: 'Zusammenfassung' },
    { key: 'roadmap', label: 'Roadmap' },
    { key: 'cluster', label: 'Content-Plan & Flow' }, // GEÄNDERT: Cluster, Content-Flow und Funnel sind ein Abschnitt
    { key: 'touchpoints', label: 'Touchpoints', optional: true },
    { key: 'geo', label: 'Sichtbarkeit' }, // GEÄNDERT: Google und KI-Antworten zusammen
    { key: 'validation', label: 'Themen-Check' },
    { key: 'ausgangslage', label: 'Ausgangslage' },
  ];

  function buildReportNavItems(result, session) {
    var n = 0;
    var out = [];
    REPORT_NAV_BASE.forEach(function (item) {
      if (item.optional && item.key === 'touchpoints' && !hasTouchpointSection(result, session)) return;
      if (item.optional && item.key === 'goal' && !computeGoalOverview(result, [])) return;
      n++;
      out.push({ key: item.key, n: n, label: item.label });
    });
    return out;
  }

  function reportSectionId(n) { return 'cvz-cs-sec-' + n; }

  // GEÄNDERT (Bugfix Sprungleiste): Zählt nur, was oben wirklich stehen bleibt. Vorher galt immer die Höhe von .w-nav, auch wenn
  // die Website-Navigation mit wegscrollt. Dann klebte die Leiste mit einer Lücke darunter, und der Sentinel-Abgleich passte nicht.
  // Webflow fixiert die Navigation oft über einen Wrapper, deshalb werden auch die Vorfahren geprüft. Blendet die Website ihre
  // Navigation beim Runterscrollen aus (transform), liegt deren Unterkante über 0 und die Leiste rutscht nach oben.
  function getSiteNavHeight() {
    // .w-nav ist Webflows eigene Wrapper-Klasse der Navigation.
    var webflowNav = document.querySelector('.w-nav');
    if (!webflowNav || typeof window.getComputedStyle !== 'function') return 0;
    var node = webflowNav;
    var pinned = null;
    while (node && node !== document.body && node !== document.documentElement) {
      var pos = window.getComputedStyle(node).position;
      if (pos === 'fixed' || pos === 'sticky') { pinned = node; break; }
      node = node.parentElement;
    }
    if (!pinned) return 0;
    var bottom = webflowNav.getBoundingClientRect().bottom;
    return bottom > 0 && bottom < 240 ? Math.round(bottom) : 0;
  }

  // NEU: Die Leiste hängt beim Scrollen am body. document.querySelector('#cvz-content-strategy-agent .cvz-cs-anchor-nav') fand sie
  // dann nicht mehr, und Sprünge landeten unter der Leiste. Deshalb merkt sich das Widget das Element.
  function anchorNavHeight() {
    var nav = state.anchorNavEl;
    return nav && nav.isConnected !== false ? nav.offsetHeight : 0;
  }

  function buildAnchorNav(navItems, opts) {
    var items = navItems || buildReportNavItems(null);
    opts = opts || {};
    var nav = el('nav', { class: 'cvz-cs-anchor-nav', 'aria-label': 'Bericht-Navigation' });
    var inner = el('div', { class: 'cvz-cs-anchor-inner' });
    // NEU: Zeile aus Links (Handy: Auswahl) und rechts dem Button "Fragen zum Bericht", wenn der Chat verfügbar ist.
    var row = el('div', { class: 'cvz-cs-anchor-row' });
    nav.appendChild(row);
    row.appendChild(inner);
    state.anchorNavEl = nav;
    var sentinel = el('div', { class: 'cvz-cs-anchor-sentinel' });
    var spacer = el('div', {});
    spacer.style.display = 'none';
    var links = {};

    // NEU (Übersicht): Am Handy sind von zehn Einträgen nur drei sichtbar. Dort ersetzt eine Auswahl die Leiste (siehe CSS), sie springt wie ein Link.
    var jumpSelect = el('select', { class: 'cvz-cs-anchor-select', 'aria-label': 'Zu Abschnitt springen' }, items.map(function (item) { return el('option', { value: String(item.n) }, [item.n + '. ' + item.label]); }));
    row.appendChild(jumpSelect);
    if (typeof opts.onAsk === 'function') {
      var askBtn = el('button', { type: 'button', class: 'cvz-cs-anchor-ask', 'aria-haspopup': 'dialog' }, [
        chatIcon(),
        el('span', { class: 'cvz-cs-anchor-ask-long' }, ['Fragen zum Bericht']),
        el('span', { class: 'cvz-cs-anchor-ask-short' }, ['Fragen']),
      ]);
      askBtn.addEventListener('click', function () { opts.onAsk(); });
      row.appendChild(askBtn);
    }
    jumpSelect.addEventListener('change', function () {
      var a = links[jumpSelect.value];
      // Klick-Ereignis statt a.click(): löst denselben Sprung aus, ohne dass der Browser zusätzlich zum Anker navigiert.
      if (a) a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    items.forEach(function (item) {
      var a = el('a', { href: '#' + reportSectionId(item.n) }, [item.label]);
      a.addEventListener('click', function (e) {
        var target = document.getElementById(reportSectionId(item.n));
        if (!target) return;
        e.preventDefault();
        // NEU (Übersicht): Liegt der Abschnitt in den eingeklappten Grundlagen, zuerst aufklappen, dann messen.
        var fold = target.closest ? target.closest('details.cvz-cs-group-fold') : null;
        if (fold && !fold.open) fold.open = true;
        // Wie im LP-Report: erst aufklappen, dann messen. Im Abschnitt Roadmap öffnet das die erste Gruppe,
        // falls jemand alles zugeklappt hat. Seiten-Karten bleiben, wie sie sind.
        var firstFold = target.querySelector('details.cvz-cs-roadmap-fold');
        if (firstFold && !target.querySelector('details.cvz-cs-roadmap-fold[open]')) firstFold.open = true;
        // Höhe der Leiste, wie sie nach dem Sprung aussieht (fixiert). Steht sie noch im Fluss, wäre sie nach dem Sprung trotzdem oben.
        var offset = nav.offsetHeight + getSiteNavHeight() + 12;
        var top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
        setActive(item.n);
      });
      links[item.n] = a;
      inner.appendChild(a);
    });

    function setActive(n) {
      Object.keys(links).forEach(function (k) { links[k].classList.remove('cvz-cs-nav-active'); });
      var a = links[n];
      if (!a) return;
      jumpSelect.value = String(n);
      a.classList.add('cvz-cs-nav-active');
      // Nur die Leiste horizontal verschieben, nie die Seite.
      var left = a.offsetLeft - (inner.clientWidth - a.offsetWidth) / 2;
      if (typeof inner.scrollTo === 'function') inner.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
      else inner.scrollLeft = Math.max(0, left);
    }

    function applyFixed(isFixed, top) {
      if (isFixed) {
        nav.style.top = top + 'px'; // jedes Mal, weil sich die Website-Navigation beim Scrollen ein- und ausblenden kann
        if (nav.classList.contains('cvz-cs-anchor-nav--fixed')) return;
        spacer.style.height = nav.offsetHeight + 'px';
        spacer.style.display = 'block';
        nav.classList.add('cvz-cs-anchor-nav--fixed');
        if (nav.parentNode !== document.body) document.body.insertBefore(nav, document.body.firstChild);
      } else {
        if (!nav.classList.contains('cvz-cs-anchor-nav--fixed')) return;
        nav.classList.remove('cvz-cs-anchor-nav--fixed');
        nav.style.top = '';
        spacer.style.display = 'none';
        if (spacer.parentNode && (nav.parentNode !== spacer.parentNode || nav.nextSibling !== spacer)) {
          spacer.parentNode.insertBefore(nav, spacer);
        }
      }
    }

    function activate() {
      // GEÄNDERT (Bugfix): Die Leiste lief nicht mit. Ursache: Der IntersectionObserver meldet nur das Überschreiten der Kante.
      // Mit einer Website-Navigation (rootMargin oben negativ) lag der Sentinel in diesem Moment noch bei top > 0, die Bedingung
      // "top < 0" war falsch, und danach kam kein weiteres Ereignis mehr. Jetzt prüft ein Scroll-Handler (einmal je Frame) die Lage
      // direkt: Sentinel oberhalb der Unterkante der Website-Navigation, dann fixieren. Lauscht im Capture auf document, damit auch
      // Seiten funktionieren, bei denen nicht das Fenster, sondern ein Container scrollt.
      var ticking = false;
      function checkSticky() {
        ticking = false;
        if (!sentinel.parentNode) return;
        var top = getSiteNavHeight();
        applyFixed(sentinel.getBoundingClientRect().top < top, top);
      }
      function onScroll() {
        if (ticking) return;
        ticking = true;
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(checkSticky);
        else setTimeout(checkSticky, 16);
      }
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      checkSticky();
      if (typeof window.IntersectionObserver !== 'function') {
        return function cleanupNoIo() {
          document.removeEventListener('scroll', onScroll, { capture: true });
          if (nav.parentNode === document.body) document.body.removeChild(nav);
        };
      }

      // GEÄNDERT: merkt sich alle Abschnitte im Erkennungsbereich und markiert den hintersten davon. Vorher gewann bei zwei
      // gleichzeitig sichtbaren Abschnitten zufällig einer, und beim Verlassen wurde nicht neu berechnet (falscher Abschnitt aktiv).
      var visibleSections = {};
      var activeObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var n = Number(String(entry.target.id).replace('cvz-cs-sec-', ''));
          if (n) visibleSections[n] = entry.isIntersecting;
        });
        var current = 0;
        Object.keys(visibleSections).forEach(function (k) { if (visibleSections[k] && Number(k) > current) current = Number(k); });
        if (current) setActive(current);
      }, { rootMargin: '-20% 0px -70% 0px' });
      items.forEach(function (item) {
        var sec = document.getElementById(reportSectionId(item.n));
        if (sec) activeObserver.observe(sec);
      });

      function onResize() { checkSticky(); }
      window.addEventListener('resize', onResize);
      var webflowNav = document.querySelector('.w-nav');
      var navResize = null;
      if (webflowNav && typeof window.ResizeObserver === 'function') {
        navResize = new ResizeObserver(onResize);
        navResize.observe(webflowNav);
      }

      return function cleanup() {
        document.removeEventListener('scroll', onScroll, { capture: true });
        activeObserver.disconnect();
        if (navResize) navResize.disconnect();
        window.removeEventListener('resize', onResize);
        if (nav.parentNode === document.body) document.body.removeChild(nav);
      };
    }

    return { nav: nav, sentinel: sentinel, spacer: spacer, activate: activate };
  }

  function renderReportHeader(result, session, sessionId) {
    var header = el('div', { class: 'cvz-cs-report-header' });
    var topRow = el('div', { class: 'cvz-cs-report-header-top' });
    var titleBlock = el('div', {});
    // GEÄNDERT: "Content-Strategie" statt "Content-Strategie-Bericht" (das Ergebnis ist die Strategie, kein Report).
    titleBlock.appendChild(el('p', { class: 'cvz-cs-report-eyebrow' }, ['Content-Strategie']));
    titleBlock.appendChild(el('h2', { class: 'cvz-cs-report-title' }, [result.seed_topic]));
    // NEU: Umfang klarstellen. Gleicher Wortlaut wie im PDF (STRATEGY_SCOPE_LINE) und auf der Website.
    titleBlock.appendChild(el('p', { class: 'cvz-cs-report-meta' }, ['Für ein Thema, ein Produkt oder eine Dienstleistung.']));
    var dateSource = (session && session.created_at) ? new Date(session.created_at) : new Date();
    var dateStr = dateSource.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
    titleBlock.appendChild(el('p', { class: 'cvz-cs-report-meta' }, ['Erstellt am ' + dateStr]));
    topRow.appendChild(titleBlock);
    if (sessionId) topRow.appendChild(renderExportButton(sessionId));
    header.appendChild(topRow);
    return header;
  }

  function renderExportButton(sessionId) {
    var button = el('button', { class: 'cvz-cs-retry-btn cvz-cs-export-btn', type: 'button' }, ['Als PDF exportieren']);
    button.addEventListener('click', function () {
      if (button.disabled) return;
      var originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'PDF wird erstellt …';
      apiFetch('/api/content-strategy/' + sessionId + '/export', { method: 'POST' })
        .then(function (data) { window.open(data.url, '_blank'); })
        .catch(function (err) { alert('PDF-Export fehlgeschlagen: ' + (err.message || 'Unbekannter Fehler') + '. Bitte erneut versuchen.'); })
        .finally(function () { button.disabled = false; button.textContent = originalLabel; });
    });
    return button;
  }

  function renderReportSection(number, title, children) {
    var section = el('section', { class: 'cvz-cs-report-section', id: reportSectionId(number) }); // id: Ziel der Sprungleiste
    section.appendChild(el('h3', { class: 'cvz-cs-report-section-title' }, [number + '. ' + title]));
    (children || []).forEach(function (child) { if (child) section.appendChild(child); });
    return section;
  }

  function renderProse(text, extraClass) {
    var container = el('div', { class: 'cvz-cs-prose' + (extraClass ? ' ' + extraClass : '') });
    renderMarkdownInto(container, text);
    return container;
  }

  // ENTFERNT: renderStrategyGoalBox (Ziel-Box im Content-Plan). Ersetzt durch den Abschnitt "Ziel der Strategie" (renderGoalOverview).

  // ==================== NEU: ZIEL DER STRATEGIE ====================
  // Der Bericht zeigte einen Plan, aber nicht auf den ersten Blick, wofür. Jetzt steht vor der Executive Summary:
  //   1. Geschäftsziel (Zielaktion aus dem Startformular), 2. Hebel (Sichtbarkeit je Kaufphase und nächster Schritt),
  //   3. Stand je Phase (Seiten, Zwischenschritt, KI-Sichtbarkeit), 4. Woran ihr Fortschritt erkennt (Richtung, keine erfundenen Zielwerte),
  //   5. Prüftermin (drei Monate nach Erstellung, mit Entscheidungsregel), 6. Fokus (was bewusst nicht im Plan ist).
  // Alle Zahlen kommen aus vorhandenen Feldern, nichts formuliert die KI.
  // WICHTIG: Gleiche Logik wie services/contentStrategyGoalOverview.js im Backend (PDF-Export). Wer hier etwas ändert, ändert es dort mit.
  // Das Widget rechnet live, weil sich funnel_check ändert, sobald im Content-Flow eigene Seiten dazukommen.
  var GOAL_PHASES = [
    { value: 'exploration', label: 'Erforschung' },
    { value: 'evaluation', label: 'Bewertung' },
    { value: 'comparison', label: 'Vergleich' },
    { value: 'decision', label: 'Entscheidung' },
  ];
  var GOAL_MEASURED_VERDICTS = ['stabil', 'wackelig', 'luecke'];
  var GOAL_STEP_TEXT = { ok: 'vorhanden', schwach: 'nur Weiterlesen', luecke: 'fehlt', keine_seiten: 'keine Seite', via_conversion: 'Zielaktion auf der Conversion-Seite' };
  var GOAL_STEP_BADGE = { ok: 'ok', via_conversion: 'ok', schwach: 'schwach', luecke: 'luecke', keine_seiten: 'luecke' };

  function goalEmptyVisibility() { return { total: 0, measured: 0, stabil: 0, wackelig: 0, luecke: 0, zu_wenig_daten: 0 }; }
  function goalCountVerdict(bucket, verdict) {
    bucket.total++;
    if (GOAL_MEASURED_VERDICTS.indexOf(verdict) !== -1) { bucket.measured++; bucket[verdict]++; } else { bucket.zu_wenig_daten++; }
  }
  // Entscheidung ohne eigene Seite, die die Conversion-Seite übernimmt (via_conversion): Dort steht die Zielaktion, das ist der Schritt.
  function goalPhaseHasStep(row) {
    if (!row) return null;
    if (row.via_conversion) return true;
    if (row.status === 'keine_seiten') return false;
    return row.status === 'ok' || !!row.covered_by_own;
  }

  // NEU (Google heute): gleiche Logik und gleicher Wortlaut wie computeGoogleToday und googleTodayText in
  // services/contentStrategyGoalOverview.js (PDF-Export). Summen aus demand_signals (alle themenrelevanten Suchanfragen),
  // sonst aus den current_state-Zeilen zum Thema. Ohne Search Console nur die Schätzung, ohne beides keine Zeile.
  function computeGoogleToday(result) {
    var cs = result && result.current_state;
    var signals = result && result.demand_signals && result.demand_signals.source === 'google_search_console' ? result.demand_signals : null;
    var source = signals ? 'google_search_console' : (cs && typeof cs.source === 'string' ? cs.source : 'none');
    if (source === 'none') return null;
    var rows = (cs && cs.rows && cs.rows.length ? cs.rows : []).filter(function (r) { return r && r.relevance === 'topic' && typeof r.query === 'string'; });
    function pos(r) { return r.avg_position != null && Number(r.avg_position) > 0 ? Number(r.avg_position) : null; }
    function imp(r) { return Number(r.impressions) > 0 ? Number(r.impressions) : 0; }
    var top;
    if (source === 'google_search_console') {
      var withImp = rows.filter(function (r) { return imp(r) > 0; });
      top = withImp.slice().sort(function (a, b) { return imp(b) - imp(a) || (pos(a) || 999) - (pos(b) || 999); })[0] || null;
      return {
        source: 'google_search_console',
        window_days: signals ? signals.window_days : 90,
        queries: signals ? signals.topic_queries : withImp.length,
        impressions: signals ? signals.topic_impressions : withImp.reduce(function (s, r) { return s + imp(r); }, 0),
        clicks: signals ? signals.topic_clicks : withImp.reduce(function (s, r) { return s + (Number(r.clicks) > 0 ? Number(r.clicks) : 0); }, 0),
        top_query: top ? top.query : null,
        top_position: top ? pos(top) : null,
      };
    }
    var ranked = rows.filter(function (r) { return pos(r) != null && pos(r) <= 100; });
    top = ranked.slice().sort(function (a, b) { return pos(a) - pos(b); })[0] || null;
    return { source: 'dataforseo_estimate', window_days: null, queries: ranked.length, impressions: null, clicks: null, top_query: top ? top.query : null, top_position: top ? pos(top) : null };
  }
  function googleTodayText(g) {
    if (!g) return null;
    function fi(n) { return Math.round(n).toLocaleString('de-DE'); }
    var top = g.top_query && g.top_position != null ? ', stärkster Suchbegriff „' + g.top_query + '“ auf Position ' + g.top_position.toFixed(1).replace('.', ',') : '';
    if (g.source === 'google_search_console') {
      if (!g.impressions) return 'Bei Google heute: noch keine Impressionen für Suchbegriffe zum Thema (Search Console, letzte ' + g.window_days + ' Tage).';
      var q = g.queries > 0 ? ' für ' + fi(g.queries) + ' ' + (g.queries === 1 ? 'Suchbegriff' : 'Suchbegriffe') + ' zum Thema' : ' für Suchbegriffe zum Thema';
      return 'Bei Google heute: ' + fi(g.impressions) + ' Impressionen und ' + fi(g.clicks) + ' ' + (g.clicks === 1 ? 'Klick' : 'Klicks') + ' in ' + g.window_days + ' Tagen' + q + top + ' (Search Console).';
    }
    if (!g.queries) return 'Bei Google heute: laut Schätzung noch keine Rankings für Suchbegriffe zum Thema (ohne Search Console).';
    return 'Bei Google heute: laut Schätzung Rankings für ' + fi(g.queries) + ' ' + (g.queries === 1 ? 'Suchbegriff' : 'Suchbegriffe') + ' zum Thema' + top + ' (geschätzt, ohne Search Console keine Klickzahlen).';
  }
  // Sprung zur Tabelle "Wofür eure Domain heute rankt" im Abschnitt Sichtbarkeit.
  function openCurrentState() {
    var root = state.root || document;
    var box = root.querySelector('.cvz-cs-current-state');
    var target = box ? (box.closest ? box.closest('.cvz-cs-vis-block') : null) || box : null;
    if (!target) return;
        var offset = anchorNavHeight() + getSiteNavHeight() + 12;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
  }

  function computeGoalOverview(result, prompts) {
    if (!result || typeof result !== 'object') return null;
    var goal = result.strategy_goal || null;
    var funnel = result.funnel_check && result.funnel_check.phases && result.funnel_check.phases.length ? result.funnel_check : null;
    var pages = result.supporting_pages || [];
    if (!goal && !funnel && pages.length === 0) return null;
    var list = prompts || [];
    var byPhaseRow = {};
    if (funnel) funnel.phases.forEach(function (r) { if (r && r.phase) byPhaseRow[r.phase] = r; });
    var phases = GOAL_PHASES.map(function (ph) {
      var row = byPhaseRow[ph.value] || null;
      var inPhase = pages.filter(function (p) { return p && p.messy_middle_phase === ph.value; });
      var vis = goalEmptyVisibility();
      list.filter(function (p) { return p && p.phase === ph.value; }).forEach(function (p) { goalCountVerdict(vis, p.verdict); });
      return {
        phase: ph.value,
        label: ph.label,
        // Seiten laut Funnel-Befund (eigene Seiten aus dem Content-Flow zählen mit), sonst aus dem Plan gezählt.
        pages: row && typeof row.pages === 'number' ? row.pages + (row.own_pages || 0) : inPhase.length,
        existing_pages: inPhase.filter(function (p) { return p.role === 'existing'; }).length,
        via_conversion: !!(row && row.via_conversion),
        has_step: goalPhaseHasStep(row),
        step_status: row ? (row.via_conversion ? 'via_conversion' : row.status) : null,
        visibility: vis,
      };
    });
    // Alle Fragen zusammen, auch ohne Phase oder "Entdeckung". Sonst passt die Summe nicht zum Abschnitt Sichtbarkeit.
    var visTotal = goalEmptyVisibility();
    list.forEach(function (p) { if (p) goalCountVerdict(visTotal, p.verdict); });
    var np = result.not_planned && result.not_planned.groups ? result.not_planned : null;
    var excluded = np ? np.groups.reduce(function (sum, g) { return sum + (typeof g.total === 'number' ? g.total : (g.items || []).length); }, 0) : 0;
    var conv = result.conversion_page || null;
    return {
      goal: goal ? { offer_type: goal.offer_type, also_offers: goal.also_offers || [], end_goal: goal.end_goal, cta_label: goal.cta_label || null } : null,
      audience: (conv && conv.primary_audience) || null,
      google_today: computeGoogleToday(result), // NEU
      conversion_topic: (conv && conv.topic) || null,
      phases: phases,
      progress: {
        phases_total: GOAL_PHASES.length,
        phases_with_step: funnel ? phases.filter(function (p) { return p.has_step === true; }).length : null,
        phases_with_pages: phases.filter(function (p) { return p.pages > 0 || p.via_conversion; }).length,
        prompts_measured: visTotal.measured,
        prompts_stable: visTotal.stabil,
        prompts_gap: visTotal.luecke,
        prompts_total: visTotal.total,
      },
      focus: {
        planned_pages: pages.length + (conv ? 1 : 0),
        existing_pages: pages.filter(function (p) { return p && p.role === 'existing'; }).length,
        excluded_terms: excluded,
      },
    };
  }

  // NEU (Prüftermin): drei Monate nach Erstellung, mit Entscheidungsregel. Gleiche Logik und gleicher Wortlaut wie
  // reviewDate und REVIEW_RULES in services/contentStrategyGoalOverview.js (PDF-Export).
  var REVIEW_MONTHS = 3;
  var REVIEW_RULES = [
    { situation: 'Seiten sind online, aber weder bei Google sichtbar noch in KI-Antworten genannt', action: 'Inhalt und Format der Seiten prüfen und die Maßnahmen außerhalb eurer Website verstärken, bevor neue Seiten dazukommen.' },
    { situation: 'Sichtbar, aber kaum jemand nutzt den nächsten Schritt', action: 'Am Zwischenschritt arbeiten (Angebot, Platzierung, Text), nicht an weiteren Seiten.' },
    { situation: 'Sichtbar und der nächste Schritt wird genutzt', action: 'Die nächste Phase ausbauen.' },
  ];
  // Datum plus Monate. Fällt der Tag weg (31. Januar + 1 Monat), gilt der letzte Tag des Zielmonats.
  function goalAddMonths(date, months) {
    var d = new Date(date.getTime());
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    var lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return d;
  }
  function goalReviewDate(createdAt) {
    var base = createdAt ? new Date(createdAt) : new Date();
    return goalAddMonths(isNaN(base.getTime()) ? new Date() : base, REVIEW_MONTHS);
  }

  function goalVisibilityText(v) {
    if (!v || v.total === 0) return 'nicht gemessen';
    if (v.measured === 0) return 'zu wenig Daten';
    return v.stabil + ' von ' + v.measured + ' Fragen stabil zitiert' + (v.luecke > 0 ? ', ' + v.luecke + ' nie' : '');
  }

  // Sprung zu "Bewusst nicht im Plan" im Content-Plan (Listenansicht, aufgeklappt).
  function openNotPlanned() {
    if (typeof state.showPlanView === 'function') state.showPlanView('list');
    var root = state.root || document;
    var box = root.querySelector('details.cvz-cs-notplanned');
    if (!box) return;
    box.open = true;
        var offset = anchorNavHeight() + getSiteNavHeight() + 12;
    window.scrollTo({ top: box.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
  }

  function renderGoalOverview(result, session) {
    var wrap = el('div', { class: 'cvz-cs-goal-overview' });
    var prompts = getVisibilityPrompts(session);
    var fresh = session && session.visibility_measurement;
    function paint() {
      clear(wrap);
      var o = computeGoalOverview(result, prompts);
      if (!o) return;
      // 1. Geschäftsziel
      var endLabel = o.goal ? optionLabel(END_GOAL_OPTIONS, o.goal.end_goal) : null;
      var primary = el('div', { class: 'cvz-cs-goal-block cvz-cs-goal-block--primary' }, [el('p', { class: 'cvz-cs-brief-label' }, ['Geschäftsziel'])]);
      primary.appendChild(el('p', { class: 'cvz-cs-goal-headline' }, [
        o.goal ? 'Zielaktion: ' + endLabel + (o.goal.cta_label ? ' („' + o.goal.cta_label + '“)' : '') : 'Keine Zielaktion angegeben: Die Strategie zahlt auf die Conversion-Seite ein.',
      ]));
      if (o.audience) primary.appendChild(el('p', { class: 'cvz-cs-goal-line' }, [el('strong', {}, ['Für wen: ']), o.audience]));
      if (o.conversion_topic) primary.appendChild(el('p', { class: 'cvz-cs-goal-line' }, [el('strong', {}, ['Wo: ']), 'Conversion-Seite „' + o.conversion_topic + '“']));
      if (o.goal) {
        var also = (o.goal.also_offers || []).filter(function (x) { return x !== o.goal.offer_type; }).map(function (x) { return optionLabel(OFFER_TYPE_OPTIONS, x); });
        primary.appendChild(el('p', { class: 'cvz-cs-goal-line' }, [el('strong', {}, ['Angebot: ']), optionLabel(OFFER_TYPE_OPTIONS, o.goal.offer_type) + (also.length ? ' (gehört auch dazu: ' + also.join('; ') + ')' : '')]));
      }
      wrap.appendChild(primary);
      // 2. Hebel
      wrap.appendChild(el('div', { class: 'cvz-cs-goal-block' }, [
        el('p', { class: 'cvz-cs-brief-label' }, ['So zahlt der Content darauf ein']),
        el('p', { class: 'cvz-cs-goal-line' }, ['Die Seiten im Plan sollen in jeder Kaufphase dort auftauchen, wo eure Zielgruppe fragt: bei Google und in KI-Antworten. Jede Phase bietet einen nächsten Schritt, der näher an die Zielaktion führt. Sichtbarkeit und Themenabdeckung zählen nur, soweit sie Interessenten dorthin bringen.']),
      ]));
      // 3. Stand je Phase
      var grid = el('div', { class: 'cvz-cs-goal-phases' });
      o.phases.forEach(function (p) {
        var pagesText = p.via_conversion && p.pages === 0 ? 'Conversion-Seite' : String(p.pages) + (p.existing_pages > 0 ? ' (davon ' + p.existing_pages + ' bestehend)' : '');
        var stepNode = p.step_status
          ? el('span', { class: 'cvz-cs-badge cvz-cs-funnel-status--' + (GOAL_STEP_BADGE[p.step_status] || 'schwach') }, [GOAL_STEP_TEXT[p.step_status] || p.step_status])
          : 'unbekannt';
        grid.appendChild(el('div', { class: 'cvz-cs-goal-phase' }, [
          el('h5', {}, [p.label]),
          el('div', { class: 'cvz-cs-goal-phase-row' }, [el('p', { class: 'cvz-cs-brief-label' }, ['Seiten im Plan']), pagesText]),
          el('div', { class: 'cvz-cs-goal-phase-row' }, [el('p', { class: 'cvz-cs-brief-label' }, ['Nächster Schritt']), stepNode]),
          el('div', { class: 'cvz-cs-goal-phase-row' }, [el('p', { class: 'cvz-cs-brief-label' }, ['KI-Antworten']), goalVisibilityText(p.visibility)]),
        ]));
      });
      var sourceText = o.progress.prompts_total === 0
        ? 'KI-Sichtbarkeit wurde für diesen Bericht nicht gemessen.'
        : (fresh ? 'KI-Antworten: Einzelmessung' + (fresh.measured_at ? ' vom ' + new Date(fresh.measured_at).toLocaleDateString('de-DE') : '') + ', eine Momentaufnahme.' : 'KI-Antworten aus deinen Tracker-Daten.') + ' Details im Abschnitt Sichtbarkeit.';
      // NEU: stärkste Google-Zahlen vor der Tabelle, mit Sprung zu den Details
      var googleLine = googleTodayText(o.google_today);
      var googleP = null;
      if (googleLine) {
        var gLink = el('a', { href: '#', class: 'cvz-cs-goal-link' }, ['Details ansehen']);
        gLink.addEventListener('click', function (e) { e.preventDefault(); openCurrentState(); });
        googleP = el('p', { class: 'cvz-cs-goal-line cvz-cs-goal-google' }, [googleLine + ' ', gLink]);
      }
      wrap.appendChild(el('div', { class: 'cvz-cs-goal-block' }, [
        el('p', { class: 'cvz-cs-brief-label' }, ['Heute: Stand je Kaufphase', tip('Seiten im Plan: neue und bestehende Seiten der Strategie, eigene Seiten aus dem Content-Flow zählen mit. Nächster Schritt: ob eine Seite der Phase einen Zwischenschritt bietet (Check, Vorlage, Fallstudie, Produkt ausprobieren), aus dem Funnel-Befund. KI-Antworten: bei wie vielen Fragen eurer Zielgruppe aus dieser Phase eure Domain in ChatGPT und Gemini stabil als Quelle genannt wird.', 'Was zeigen die Werte?')]),
        googleP,
        grid,
        el('p', { class: 'cvz-cs-hint' }, [sourceText]),
      ]));
      // 4. Woran ihr Fortschritt erkennt
      var pr = o.progress;
      var stepCount = pr.phases_with_step != null ? pr.phases_with_step : pr.phases_with_pages;
      var ol = el('ul', { class: 'cvz-cs-goal-progress' });
      ol.appendChild(el('li', {}, [el('strong', {}, ['Jede Kaufphase hat eine Seite und einen nächsten Schritt.']), el('span', { class: 'cvz-cs-goal-now' }, ['Heute im Plan: ' + stepCount + ' von ' + pr.phases_total + ' Phasen'])]));
      ol.appendChild(el('li', {}, [el('strong', {}, ['Bei den Fragen eurer Zielgruppe stabil als Quelle genannt werden.']), el('span', { class: 'cvz-cs-goal-now' }, [
        pr.prompts_total > 0 ? 'Heute: ' + pr.prompts_stable + ' von ' + pr.prompts_measured + ' gemessenen Fragen' + (pr.prompts_gap > 0 ? ', bei ' + pr.prompts_gap + ' nie' : '') : 'Noch nicht gemessen',
      ])]));
      ol.appendChild(el('li', {}, [el('strong', {}, ['Am Ende zählt die Zielaktion' + (endLabel ? ' (' + endLabel + ')' : '') + '.']), el('span', { class: 'cvz-cs-goal-now' }, ['Messt sie nach Einstiegsseite, dann seht ihr, welche Seiten aus dem Plan dorthin führen.'])]));
      wrap.appendChild(el('div', { class: 'cvz-cs-goal-block' }, [
        el('p', { class: 'cvz-cs-brief-label' }, ['Woran ihr Fortschritt erkennt']),
        ol,
        el('p', { class: 'cvz-cs-hint' }, ['Bewusst ohne Zielwerte in Prozent: Eine einzelne Messung ist keine belastbare Ausgangsbasis, und Vorhersagen für Rankings oder KI-Zitate wären geraten. Den Verlauf zeigt der Customer Journey Tracker.']),
      ]));
      // 5. NEU: Prüftermin
      var due = goalReviewDate(session && session.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
      var rules = el('ul', { class: 'cvz-cs-goal-progress' });
      REVIEW_RULES.forEach(function (r) { rules.appendChild(el('li', {}, [el('strong', {}, [r.situation + ':']), el('span', { class: 'cvz-cs-goal-now' }, [r.action])])); });
      wrap.appendChild(el('div', { class: 'cvz-cs-goal-block' }, [
        el('p', { class: 'cvz-cs-brief-label' }, ['Prüftermin']),
        el('p', { class: 'cvz-cs-goal-headline' }, [due]),
        el('p', { class: 'cvz-cs-goal-line' }, [REVIEW_MONTHS + ' Monate nach Erstellung. Prüft dann die Seiten aus dem Plan, die bis dahin online sind:']),
        rules,
        el('p', { class: 'cvz-cs-hint' }, ['KI-Antworten schwanken von Tag zu Tag. Bewertet den Verlauf über mehrere Wochen, nicht eine einzelne Abfrage. Der Customer Journey Tracker zeigt diesen Verlauf.']),
      ]));
      // 6. Fokus
      var f = o.focus;
      var focusP = el('p', { class: 'cvz-cs-goal-line' }, [f.planned_pages + ' Seiten im Plan' + (f.existing_pages > 0 ? ', davon ' + f.existing_pages + ' bestehende, die überarbeitet werden' : '') + '.']);
      if (f.excluded_terms > 0) {
        var link = el('a', { href: '#', class: 'cvz-cs-goal-link' }, ['Begründung ansehen']);
        link.addEventListener('click', function (e) { e.preventDefault(); openNotPlanned(); });
        focusP.appendChild(document.createTextNode(' ' + f.excluded_terms + ' weitere Suchbegriffe zum Thema bekommen bewusst keine eigene Seite. '));
        focusP.appendChild(link);
      }
      wrap.appendChild(el('div', { class: 'cvz-cs-goal-block' }, [el('p', { class: 'cvz-cs-brief-label' }, ['Fokus statt Vollständigkeit']), focusP]));
    }
    paint();
    state.goalRefresh = paint;
    return wrap;
  }

  // ==== FUNNEL-ANFANG ====
  // NEU (Funnel und Lead-Magneten): Der Befund (result.funnel_check) wird vom Server aus den Seiten der Strategie berechnet.
  // Die Lead-Magneten (result.lead_magnets) sind Vorschläge der KI, deren Format, Phase, Aufwand, Anker-Seite und
  // Conversion-Ziel der Server geprüft oder selbst eingesetzt hat. Ältere Berichte haben beides nicht.
  function hasFunnelSection(result) {
    if (!result) return false;
    var hasCheck = !!(result.funnel_check && result.funnel_check.phases && result.funnel_check.phases.length > 0);
    var hasMagnets = !!(result.lead_magnets && result.lead_magnets.length > 0);
    return hasCheck || hasMagnets;
  }

  function funnelStepsText(steps) {
    var parts = FUNNEL_STEP_ORDER
      .filter(function (art) { return steps && steps[art] > 0; })
      .map(function (art) { return (art === 'fehlt' ? 'Ohne Zwischenziel' : (ZWISCHENZIEL_ART_LABELS[art] || art)) + ': ' + steps[art]; });
    return parts.length > 0 ? parts.join(' · ') : 'keine Zwischenschritte';
  }

  // GEÄNDERT (Content-Plan): Der frühere Abschnitt "Funnel und Lead-Magneten" doppelte sich mit dem Cluster (Seiten je Phase, Conversion-Pfad),
  // dem Content-Flow und dem Touchpoint-Plan. Jetzt: Der Status je Phase steht in den Phasen-Überschriften der Seitenliste (paintPhaseStatus),
  // und am Ende des Content-Plans steht nur noch die Bauliste: Lücken mit den passenden Lead-Magnet-Ideen, dann die Inhalte, die Seiten versprechen.
  var FUNNEL_TODO_LABELS = { luecke: 'Lücke schließen', inhalt: 'Inhalt erstellen', erlebnis: 'Bereitstellen', beleg: 'Beleg beschaffen' };
  var BUILD_GROUPS = [
    { kind: 'inhalt', title: 'Versprochene Inhalte erstellen', intro: 'Diese Seiten bieten etwas gegen E-Mail an. Den Inhalt fertigstellen und hinter ein kurzes Formular legen. Ohne ihn hat die Seite keinen Zwischenschritt.' },
    { kind: 'erlebnis', title: 'Zum Ausprobieren bereitstellen', intro: 'Diese Seiten führen zu etwas, das der Besucher selbst ausprobiert oder ansieht (Rechner, Beispiel-Ergebnis, Testzugang). Fertigstellen und auf der Seite gut sichtbar verlinken.' },
    { kind: 'beleg', title: 'Belege beschaffen', intro: 'Fallstudien oder Referenzen mit Freigabe des Kunden, Zahlen nur mit Quelle. Ohne echten Beleg die Seite nicht damit bewerben.' },
  ];
  var PHASE_STATUS_TEXT = { luecke: 'kein Zwischenschritt', schwach: 'nur Weiterlesen, kein Zwischenschritt', ok: 'Zwischenschritt vorhanden' };

  // Status je Phase in den Überschriften der Seitenliste. Wird nach dem Speichern des Content-Flows neu gemalt.
  function paintPhaseStatus(funnel, scope) {
    var rootEl = scope || state.root;
    if (!rootEl || !funnel || !funnel.phases) return;
    var byPhase = {};
    funnel.phases.forEach(function (r) { byPhase[r.phase] = r; });
    Array.prototype.forEach.call(rootEl.querySelectorAll('.cvz-cs-phase-status[data-phase]'), function (badge) {
      var r = byPhase[badge.getAttribute('data-phase')];
      if (!r || r.status === 'keine_seiten') { badge.style.display = 'none'; return; }
      badge.style.display = '';
      badge.className = 'cvz-cs-badge cvz-cs-phase-status cvz-cs-funnel-status--' + r.status;
      badge.textContent = r.covered_by_own ? 'Zwischenschritt über eigene Seite' : (PHASE_STATUS_TEXT[r.status] || r.status);
      badge.setAttribute('title', r.finding || '');
    });
  }

  function renderBuildGaps(funnel, magnets) {
    var gaps = (funnel.phases || []).filter(function (r) { return r.needs_magnet; });
    if (gaps.length === 0) return null;
    var wrap = el('div', { class: 'cvz-cs-build-block' });
    gaps.forEach(function (r) {
      var gap = el('div', { class: 'cvz-cs-build-gap' }, [
        el('p', { class: 'cvz-cs-build-gap-title' }, ['Lücke in der Phase ' + r.label + ': ' + (r.status === 'schwach' ? 'die Seiten führen nur weiter' : 'kein Zwischenschritt')]),
        el('p', { class: 'cvz-cs-hint' }, ['Wer hier ankommt, geht ohne Spur wieder. Werte eine dieser Seiten mit einem Angebot auf, das dem Besucher etwas für seine Lage gibt: ' + (r.items || []).map(function (i) { return '„' + i.topic + '“'; }).join(', ') + '.']),
      ]);
      var fitting = magnets.filter(function (m) { return m.phase === r.phase && m.counts_as_step !== false; });
      if (fitting.length > 0) {
        gap.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Passende Ideen (Vorschläge der KI)']));
        fitting.forEach(function (m) { gap.appendChild(renderLeadMagnetCard(m)); });
      } else {
        gap.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Für diese Phase gibt es keine passende Idee aus der KI. Üblich sind ein Check oder Rechner für die eigene Lage, eine Vorlage gegen E-Mail oder eine Fallstudie.']));
      }
      wrap.appendChild(gap);
    });
    return wrap;
  }

  // NEU (Kannibalisierung): mehrere eigene Seiten für dieselbe Suchanfrage, aus der Search Console (Server: contentStrategyCannibalization.ts)
  var CANNIBAL_ACTION_TEXT = { hauptseite: 'Bleibt Hauptseite', zusammenlegen: 'Zusammenlegen (301)', abgrenzen: 'Bleibt, abgrenzen', ausbauen: 'Wird zur Hauptseite ausgebaut' };
  function renderCannibalization(c) {
    if (!c || !c.items || c.items.length === 0) return null;
    var wrap = el('div', { class: 'cvz-cs-build-block' });
    wrap.appendChild(el('p', { class: 'cvz-cs-build-group-title' }, [
      'Seiten zusammenlegen oder abgrenzen (' + c.items.length + ')',
      tip('Für diese Suchanfragen erscheinen mehrere eigene Seiten in Google. Sie teilen sich die Signale, Google wechselt zwischen ihnen, und keine kommt richtig nach vorn. Erledige das vor neuen Seiten: Es kostet wenig und stärkt die Seite, die bleibt. ' + (c.note || ''), 'Was ist Kannibalisierung?'),
    ]));
    c.items.forEach(function (it) {
      var keeper = it.keeper && it.keeper.kind === 'neu' ? 'neue Seite „' + it.keeper.topic + '“' : shortUrl(it.keeper && it.keeper.url);
      var box = el('div', { class: 'cvz-cs-cannibal' }, [
        el('p', { class: 'cvz-cs-cannibal-q' }, ['„' + it.queries.join('“, „') + '“']),
        el('p', { class: 'cvz-cs-hint' }, [it.pages.length + ' eigene Seiten, zusammen ' + it.impressions + ' Impressionen. Hauptseite: ' + keeper + '. ' + (it.keeper_reason || '')]),
      ]);
      it.pages.forEach(function (p) {
        box.appendChild(el('div', { class: 'cvz-cs-cannibal-row' }, [
          el('span', { class: 'cvz-cs-badge' + (p.action === 'zusammenlegen' ? ' cvz-cs-badge-commodity' : (p.action === 'hauptseite' || p.action === 'ausbauen' ? ' cvz-cs-badge-rollout-zuerst' : '')) }, [CANNIBAL_ACTION_TEXT[p.action] || p.action]),
          ' ', el('strong', {}, [shortUrl(p.url)]),
          el('span', { class: 'cvz-cs-funnel-todo-meta' }, [p.impressions + ' Impressionen, ' + p.clicks + ' Klicks' + (p.position ? ', Ø Position ' + String(p.position).replace('.', ',') : '')]),
          el('span', { class: 'cvz-cs-funnel-todo-meta' }, [p.task]),
        ]));
      });
      wrap.appendChild(box);
    });
    return wrap;
  }
  function cannibalNoteFor(c, ref) {
    if (!c || !c.items) return null;
    for (var i = 0; i < c.items.length; i++) {
      var it = c.items[i];
      if (it.keeper && it.keeper.kind === 'neu' && it.keeper.ref === ref) return 'Löst eine Kannibalisierung bei „' + it.queries[0] + '“ auf' + (it.keeper.base_url ? ': baut sie auf ' + shortUrl(it.keeper.base_url) + ' auf, statt eine weitere Seite daneben zu stellen.' : '.') + ' Details in der Bauliste unten.';
      for (var j = 0; j < it.pages.length; j++) {
        if (it.pages[j].ref === ref) return 'Teilt sich die Suchanfrage „' + it.queries[0] + '“ mit anderen eigenen Seiten: ' + (CANNIBAL_ACTION_TEXT[it.pages[j].action] || '') + '. Details in der Bauliste unten.';
      }
    }
    return null;
  }
  // NEU (eigene Seiten in der Liste): Seiten aus dem Content-Flow, die nicht aus dem Bericht kommen. Immer "Später", ohne Brief.
  function renderOwnPages(box, store) {
    clear(box);
    var own = flowOwnPages(store);
    if (store.error) box.appendChild(el('p', { class: 'cvz-cs-own-error' }, [store.error]));
    if (own.length === 0) return;
    box.appendChild(el('h6', { class: 'cvz-cs-phase-title' }, [
      'Von dir ergänzt',
      el('span', { class: 'cvz-cs-phase-count' }, ['(' + own.length + (own.length === 1 ? ' Seite)' : ' Seiten)')]),
      tip('Diese Seiten stehen im Content-Flow, aber nicht in der Empfehlung. Sie haben keinen Content-Brief, keinen Seitenvergleich und keine geplanten Links. Deshalb laufen sie unter „Später“. Wer für ein solches Thema einen vollständigen Brief will, startet dafür eine eigene Strategie.', 'Warum ohne Brief?'),
    ]));
    box.appendChild(el('p', { class: 'cvz-cs-phase-desc' }, ['Nicht Teil der Empfehlung. Seitentyp, Phase und Links legst du im Content-Flow fest.']));
    own.forEach(function (n) {
      var meta = [n.page_type ? pageTypeLabel(n.page_type) : 'Seitentyp offen'];
      var ph = MESSY_MIDDLE_PHASES.filter(function (p) { return p.value === n.phase; })[0];
      meta.push(ph ? ph.label : 'Phase offen');
      var editBtn = el('button', { type: 'button', class: 'cvz-cs-expand-btn' }, ['Im Content-Flow bearbeiten']);
      editBtn.addEventListener('click', function () { if (typeof state.openInFlow === 'function') state.openInFlow(n.id); });
      var delBtn = el('button', { type: 'button', class: 'cvz-cs-expand-btn' }, ['Entfernen']);
      delBtn.addEventListener('click', function () { flowRemoveOwnPage(store, n.id); });
      var kids = [
        el('div', { class: 'cvz-cs-page-card-badges' }, [el('span', { class: 'cvz-cs-badge cvz-cs-badge-rollout-spaeter' }, ['Später']), el('span', { class: 'cvz-cs-badge' }, ['Eigene Seite'])]),
        el('p', { class: 'cvz-cs-own-title' }, [n.label]),
        el('p', { class: 'cvz-cs-hint' }, [meta.join(' · ')]),
      ];
      if (n.note) kids.push(el('p', { class: 'cvz-cs-own-note' }, [n.note]));
      kids.push(el('div', { class: 'cvz-cs-own-actions' }, [editBtn, delBtn]));
      box.appendChild(el('div', { class: 'cvz-cs-own-card' }, kids));
    });
  }
  // NEU: Notizen aus dem Content-Flow in den Karten der Seiten aus dem Bericht ("Zur Seite notieren" und Notizen aus dem Diagramm)
  function paintFlowNotes(scopeNodes, store) {
    scopeNodes.forEach(function (root) {
      if (!root || !root.querySelectorAll) return;
      Array.prototype.forEach.call(root.querySelectorAll('.cvz-cs-flow-note[data-ref]'), function (box) {
        var n = flowNodeOfRef(store, Number(box.getAttribute('data-ref')));
        clear(box);
        if (!n || !n.note) { box.style.display = 'none'; return; }
        box.style.display = '';
        box.appendChild(el('p', { class: 'cvz-cs-page-acc-audience' }, [el('strong', {}, ['Deine Notiz (Content-Flow): ']), n.note]));
      });
    });
  }

  // NEU (Bewusst nicht im Plan): gefundene Suchbegriffe ohne eigene Seite, nach Grund (Server: contentStrategyNotPlanned.ts)
  function renderNotPlanned(np, store) {
    if (!np || !np.groups || np.groups.length === 0) return null;
    var box = el('details', { class: 'cvz-cs-notplanned cvz-cs-fold' }, [
      el('summary', {}, ['Bewusst nicht im Plan (' + np.pool_size + ' Suchbegriffe)']),
      el('p', { class: 'cvz-cs-hint' }, ['Zum Thema wurden weitere Suchbegriffe gefunden. Sie bekommen keine eigene Seite, hier steht warum. ', tip(np.note || '', 'Woher kommt die Liste?')]),
    ]);
    // NEU: vorher war unklar, was die Knöpfe tun
    if (store) box.appendChild(el('div', { class: 'cvz-cs-notplanned-howto' }, [
      el('p', {}, [el('strong', {}, ['Als Seite übernehmen: ']), 'Der Begriff kommt als eigene Seite in deinen Plan. Sie steht dann oben unter „Von dir ergänzt“ und im Content-Flow, markiert als „Später“. Die Empfehlung selbst ändert sich nicht, die Seite hat noch keinen Content-Brief.']),
      el('p', {}, [el('strong', {}, ['Zur Seite notieren: ']), 'Der Begriff kommt als Notiz an die genannte Seite, zum Aufgreifen im Text oder als Abschnitt. Keine neue Seite.']),
      el('p', {}, ['Beides lässt sich wieder entfernen und wird gespeichert.']),
    ]));
    var inner = el('div', {});
    var msg = el('p', { class: 'cvz-cs-own-error', style: 'display:none' });
    box.appendChild(msg);
    box.appendChild(inner);
    function fail(text) { msg.textContent = text || ''; msg.style.display = text ? '' : 'none'; }
    // NEU: Übernehmen direkt aus der Liste. Neue Seite nur, wo eine eigene Seite sinnvoll sein kann; sonst als Notiz zur passenden Seite.
    function actionFor(g, it) {
      if (!store) return null;
      var volText = it.volume ? it.volume.toLocaleString('de-DE') + ' Suchen pro Monat' : 'ohne messbares Suchvolumen';
      if (g.reason === 'nachfrage_ohne_seite' || g.reason === 'ohne_nachfrage') {
        if (flowHasOwnPage(store, it.term)) return el('span', { class: 'cvz-cs-notplanned-done' }, ['✓ Übernommen: steht oben unter „Von dir ergänzt“ und im Content-Flow']);
        var b = el('button', { type: 'button', class: 'cvz-cs-notplanned-btn', title: 'Legt eine eigene Seite in deinem Plan an (Später, ohne Content-Brief)' }, ['+ Als Seite übernehmen']);
        b.addEventListener('click', function () { fail(flowAddOwnPage(store, it.term, 'Aus „Bewusst nicht im Plan“, ' + volText + '. Nicht Teil der Empfehlung.')); });
        return b;
      }
      if ((g.reason === 'mit_abgedeckt' || g.reason === 'als_abschnitt') && it.page_ref != null) {
        if (flowNoteHas(store, it.page_ref, it.term)) return el('span', { class: 'cvz-cs-notplanned-done' }, ['✓ Notiert: steht in der Karte „' + (it.page_topic || 'der Seite') + '“']);
        var nb = el('button', { type: 'button', class: 'cvz-cs-notplanned-btn', title: 'Hängt den Begriff als Notiz an die genannte Seite' }, ['+ Zur Seite notieren']);
        nb.addEventListener('click', function () {
          var line = g.reason === 'als_abschnitt' ? 'Abschnitt oder FAQ: „' + it.term + '“' : 'Begriff aufgreifen: „' + it.term + '“ (' + volText + ')';
          fail(flowAppendNote(store, it.page_ref, line));
        });
        return nb;
      }
      return null;
    }
    function paint() {
      clear(inner);
      np.groups.forEach(function (g) {
        var grp = el('div', { class: 'cvz-cs-notplanned-group' }, [
          el('p', { class: 'cvz-cs-build-group-title' }, [g.label + ' (' + g.total + ')', tip(g.intro, 'Was heißt das?')]),
        ]);
        var ul = el('ul', {});
        g.items.forEach(function (it) {
          var meta = (it.volume ? it.volume.toLocaleString('de-DE') + '/Monat' : 'ohne Messwert') + (it.page_topic ? ' · → ' + it.page_topic : '');
          var li = el('li', {}, [el('strong', {}, [it.term]), el('span', { class: 'cvz-cs-funnel-todo-meta' }, [meta])]);
          var act = actionFor(g, it);
          if (act) li.appendChild(el('span', { class: 'cvz-cs-notplanned-act' }, [act]));
          ul.appendChild(li);
        });
        grp.appendChild(ul);
        if (g.total > g.items.length) grp.appendChild(el('p', { class: 'cvz-cs-hint' }, ['… und ' + (g.total - g.items.length) + ' weitere']));
        inner.appendChild(grp);
      });
    }
    paint();
    if (store) store.listeners.push(paint);
    return box;
  }
  // NEU (Reihenfolge Zuerst / Später): nur bei geringer Reichweite (Server: contentStrategyRollout.ts)
  function rolloutOf(result, ref) {
    var ro = result && result.rollout;
    if (!ro || !ro.pages) return null;
    for (var i = 0; i < ro.pages.length; i++) if (ro.pages[i].ref === ref) return ro.pages[i];
    return null;
  }
  function renderRolloutNote(result, getCards) {
    var ro = result.rollout;
    if (!ro || !ro.pages) return null;
    var btns = [['alle', 'Alle Seiten'], ['zuerst', 'Nur Zuerst (' + ro.counts.zuerst + ')'], ['spaeter', 'Nur Später (' + ro.counts.spaeter + ')']].map(function (b) {
      var btn = el('button', { type: 'button', class: 'cvz-cs-plan-tab' + (b[0] === 'alle' ? ' is-active' : ''), 'data-filter': b[0] }, [b[1]]);
      btn.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.toggle('is-active', x === btn); });
        getCards().forEach(function (card) {
          var st = card.getAttribute('data-rollout');
          card.style.display = b[0] === 'alle' || st === b[0] ? '' : 'none';
        });
        Array.prototype.forEach.call(document.querySelectorAll('#cvz-content-strategy-agent .cvz-cs-phase-group'), function (g) {
          var any = Array.prototype.some.call(g.querySelectorAll('.cvz-cs-page-acc'), function (c) { return c.style.display !== 'none'; });
          g.style.display = any ? '' : 'none';
        });
      });
      return btn;
    });
    return el('div', { class: 'cvz-cs-rollout-note' }, [
      el('p', {}, [el('strong', {}, ['Reihenfolge: ' + ro.counts.zuerst + ' Seiten zuerst, ' + ro.counts.spaeter + ' später']), tip(ro.trigger, 'Wann starten die Seiten unter „Später“?')]),
      el('p', { class: 'cvz-cs-hint' }, [ro.summary]),
      el('div', { class: 'cvz-cs-rollout-filter', role: 'group', 'aria-label': 'Seiten filtern' }, btns),
    ]);
  }

  function renderBuildTasks(funnel) {
    var todos = (funnel.todos || []).filter(function (t) { return t.kind !== 'luecke'; });
    var wrap = el('div', { class: 'cvz-cs-build-block' });
    BUILD_GROUPS.forEach(function (g) {
      var list = todos.filter(function (t) { return t.kind === g.kind; });
      if (list.length === 0) return;
      wrap.appendChild(el('p', { class: 'cvz-cs-build-group-title' }, [g.title + ' (' + list.length + ')', tip(g.intro, 'Was ist zu tun?')]));
      var ul = el('ul', { class: 'cvz-cs-build-list' });
      list.forEach(function (t) {
        var li = el('li', {}, [
          el('strong', {}, [t.what]),
          el('span', { class: 'cvz-cs-funnel-todo-meta' }, [(t.phase_label || '') + (t.page_topic ? ' · auf „' + t.page_topic + '“' : '')]),
        ]);
        if (t.next) li.appendChild(el('span', { class: 'cvz-cs-funnel-todo-meta' }, ['Danach: ' + t.next]));
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    });
    return wrap.childNodes.length > 0 ? wrap : null;
  }

  // NEU: Warum es keine Lead-Magnet-Vorschläge gibt. Früher stand immer derselbe Satz, egal ob ein Fehler vorlag oder keine nötig waren.
  function leadMagnetsEmptyText(result) {
    var gaps = (result.funnel_check && result.funnel_check.gap_phases) || [];
    var st = result.lead_magnets_status;
    if (st === 'fehler') return 'Die Vorschläge konnten in diesem Lauf nicht erzeugt werden (Zeitüberschreitung oder technischer Fehler). Befund und Aufgaben oben gelten trotzdem.';
    if (st === 'verworfen') return 'Die KI hat Vorschläge gemacht, aber keiner hat die Prüfung bestanden, zum Beispiel weil er keine echte Kundenfrage beantwortete oder etwas voraussetzte, das dein Angebot nicht kann. Lieber kein Vorschlag als ein erfundener.' + (gaps.length > 0 ? ' Für die Lücken helfen die Aufgaben unter „Zu tun“.' : '');
    if (gaps.length === 0) return 'Keine zusätzlichen Vorschläge nötig: Jede Phase bis zum Vergleich hat schon einen Zwischenschritt. Arbeite die Aufgaben unter „Zu tun“ ab.';
    if (st === 'keine') return 'Für die Lücken hat die KI keinen passenden Vorschlag gefunden. Die Aufgaben unter „Zu tun“ zeigen, welche Seiten du aufwerten kannst.';
    return 'Für diesen Lauf liegen keine Vorschläge vor. Die Aufgaben unter „Zu tun“ zeigen, welche Seiten du aufwerten kannst.';
  }

  function magnetLine(label, text) {
    return el('p', { class: 'cvz-cs-magnet-line' }, [el('strong', {}, [label + ' ']), text]);
  }

  function renderLeadMagnetCard(m) {
    var card = el('details', { class: 'cvz-cs-page-card cvz-cs-fold cvz-cs-page-acc' });
    var badges = [
      el('span', { class: 'cvz-cs-badge' }, [optionLabel(MESSY_MIDDLE_PHASES, m.phase)]),
      el('span', { class: 'cvz-cs-badge' }, [m.format_label || m.format]),
      el('span', { class: 'cvz-cs-badge' }, ['Aufwand ' + m.effort]),
    ];
    // GEÄNDERT (Übersicht): "Ohne Anmeldung" gilt für fast jeden Magneten und war nur Rauschen im Kopf. Es steht aufgeklappt unter "Zugang".
    // Abweichende Hürden (zum Beispiel Registrierung) bleiben als Badge sichtbar.
    var hurdleText = m.hurdle_label || MAGNET_HURDLE_LABELS[m.hurdle] || m.hurdle;
    if (m.hurdle && m.hurdle !== 'ohne_anmeldung') badges.splice(2, 0, el('span', { class: 'cvz-cs-badge' }, [hurdleText]));
    // Immer angelegt und nur ein- oder ausgeblendet: Ändert sich der Befund (eigene Seite im Flow), zieht die Karte mit.
    var gapBadge = el('span', { class: 'cvz-cs-badge cvz-cs-funnel-status--schwach cvz-cs-magnet-gapbadge', 'data-phase': m.phase, 'data-counts': m.counts_as_step === false ? '0' : '1' }, ['Schließt Lücke']);
    gapBadge.style.display = 'none'; // GEÄNDERT: Die Karte steht jetzt direkt unter ihrer Lücke, das Badge wäre doppelt
    badges.push(gapBadge);
    card.appendChild(el('summary', {}, [el('div', { class: 'cvz-cs-page-acc-head' }, [
      el('div', { class: 'cvz-cs-page-card-badges' }, badges),
      el('h4', { class: 'cvz-cs-page-card-topic' }, [m.title]),
      el('p', { class: 'cvz-cs-page-acc-teaser' }, [m.promise]),
    ])]));
    var body = el('div', { class: 'cvz-cs-page-acc-body' });
    card.appendChild(body);
    body.appendChild(magnetLine('Ergebnis für den Nutzer:', m.promise));
    if (hurdleText) body.appendChild(magnetLine('Zugang:', hurdleText));
    if (m.grounding && m.grounding.source_text) body.appendChild(magnetLine('Beantwortet (' + m.grounding.kind_label + '):', m.grounding.source_text));
    if (m.gate_requirement && m.gate_requirement.need) body.appendChild(magnetLine('Als Gated Content erst, wenn ihr habt (' + m.gate_requirement.kind_label + '):', m.gate_requirement.need));
    if (m.counts_as_step === false) body.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Zählt im Funnel-Befund nicht als Zwischenschritt: Es gibt kein persönliches Ergebnis und kein Produkt-Erlebnis, nur Inhalt. Eine Lücke schließt das allein nicht.']));
    if (m.content_points && m.content_points.length > 0) {
      var cp = el('ul', { class: 'cvz-cs-brief-list' });
      m.content_points.forEach(function (pt) { cp.appendChild(el('li', {}, [pt])); });
      body.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Das steckt konkret drin:']));
      body.appendChild(cp);
    }
    if (m.differentiation) {
      var proven = m.differentiation_basis === 'wettbewerber_daten' && m.competitor_domain;
      body.appendChild(magnetLine(
        proven ? 'Abgrenzung zu ' + m.competitor_domain + ' (aus der Struktur-Analyse der Wettbewerber-Seite):' : 'Abgrenzung (Vermutung, ohne belegte Wettbewerber-Daten):',
        m.differentiation
      ));
    }
    if (m.conversion_bridge) {
      var modeLabel = BRIDGE_MODE_LABELS[m.bridge_mode];
      body.appendChild(magnetLine('Danach' + (modeLabel ? ' (' + modeLabel + '):' : ':'), m.conversion_bridge));
    }
    if (m.conversion_target && m.conversion_target.page_topic) {
      var t = m.conversion_target;
      body.appendChild(magnetLine('Führt zur Conversion-Seite:',
        t.page_topic + (t.cta_label ? ' mit dem Button „' + t.cta_label + '“' : '') + (t.end_goal_label ? ' (Zielaktion: ' + t.end_goal_label + ')' : '')));
    }
    if (m.captures && m.captures.length > 0) {
      var cl = el('ul', { class: 'cvz-cs-brief-list' });
      m.captures.forEach(function (c) { cl.appendChild(el('li', {}, [c])); });
      body.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Das erfährst du über den Interessenten (freiwillige Angaben):']));
      body.appendChild(cl);
    }
    if (m.prerequisites) body.appendChild(magnetLine('Das braucht ihr dafür:', m.prerequisites));
    if (m.anchor_page && m.anchor_page.page_topic) {
      var a = m.anchor_page;
      var vol = a.search_volume != null ? volumeRangeText(a.search_volume) : 'Suchvolumen unbekannt';
      body.appendChild(magnetLine('Wird beworben auf der Seite:', a.page_topic + (a.keyword ? ' (Suchbegriff „' + a.keyword + '“, ' + vol + ')' : '')));
    }
    if (m.search_term_idea) {
      body.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Möglicher Suchbegriff für das Tool selbst: „' + m.search_term_idea + '“ (nicht geprüft, ohne Suchvolumen)']));
    }
    if (m.id) body.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Kennung für das Anfrageformular: ' + m.id]));
    return card;
  }

  // Bauliste am Ende des Content-Plans. Alles darin hängt am Funnel-Befund des Servers und wird nach dem Speichern des Content-Flows neu gezeichnet.
  function renderFunnelSection(result) {
    var box = el('div', { class: 'cvz-cs-funnel cvz-cs-build' });
    box.appendChild(el('h4', { class: 'cvz-cs-build-title' }, [
      'Was ihr zusätzlich zu den Seiten bauen müsst',
      tip('Besucher kommen mit unterschiedlicher Kaufbereitschaft. Wer sich noch orientiert, ist selten bereit für die Zielaktion. Deshalb braucht jede Phase einen Zwischenschritt mit echtem Nutzen, etwa einen Check, einen Rechner, eine Vorlage gegen E-Mail oder eine Fallstudie. Er muss so nützlich sein, dass ihn jemand ohne Absender weiterleiten würde. Die Liste rechnet der Server aus den Seiten des Plans. Eigene Seiten im Diagramm vom Typ Rechner/Tool, Vorlage/Download, Vergleichsseite oder Test/Review zählen mit. Die Lead-Magneten sind Vorschläge der KI, ihre Wirkung ist nicht prognostiziert.', 'Warum Zwischenschritte, und woher kommt die Liste?'),
    ]));
    var holder = el('div', {});
    box.appendChild(holder);
    var magnets = result.lead_magnets || [];
    function fill(funnel) {
      clear(holder);
      if (!funnel || !funnel.phases) { holder.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Für diesen Bericht liegt kein Befund vor.'])); return; }
      if (funnel.summary) holder.appendChild(el('p', { class: 'cvz-cs-hint' }, [funnel.summary]));
      var cannibal = renderCannibalization(result.cannibalization); // NEU: zuerst aufräumen, dann bauen
      if (cannibal) holder.appendChild(cannibal);
      var gaps = renderBuildGaps(funnel, magnets);
      var tasks = renderBuildTasks(funnel);
      if (gaps) holder.appendChild(gaps);
      if (tasks) holder.appendChild(tasks);
      if (!gaps && !tasks) holder.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Nichts zusätzlich zu bauen. Die Zwischenschritte sind die Seiten selbst, zum Beispiel Vergleichsseiten.']));
      // NEU: Seiten, auf die im Plan kein Link zeigt (aus dem Verlinkungsplan). Eine Aufgabe, deshalb hier.
      var lp = state.linkPlan || linkPlanOf(result);
      if (lp && (lp.orphans || []).length > 0) {
        var sup = result.supporting_pages || [];
        holder.appendChild(el('p', { class: 'cvz-cs-build-group-title' }, ['Seiten ohne eingehenden Link (' + lp.orphans.length + ')', tip('Kein Link aus dem Plan zeigt auf diese Seiten. Ohne Link aus einer passenden Seite finden Besucher und Google sie nur über Navigation oder Sitemap. Am einfachsten ergänzt du Links im Content-Flow. Unterseiten einer Pillar Page gelten als verlinkt.', 'Warum ist das eine Aufgabe?')]));
        var ol = el('ul', { class: 'cvz-cs-build-list' });
        lp.orphans.forEach(function (i) { ol.appendChild(el('li', {}, [el('strong', {}, [(sup[i] && sup[i].topic) || ('Seite ' + (i + 1))])])); });
        holder.appendChild(ol);
      }
      // Ideen, die keine offene Lücke betreffen, eingeklappt darunter
      var gapPhases = (funnel.phases || []).filter(function (r) { return r.needs_magnet; }).map(function (r) { return r.phase; });
      var rest = magnets.filter(function (m) { return gapPhases.indexOf(m.phase) === -1 || m.counts_as_step === false; });
      if (rest.length > 0) {
        var more = el('details', { class: 'cvz-cs-build-more cvz-cs-expand' }, [el('summary', {}, ['Weitere Ideen für Lead-Magneten (' + rest.length + ')'])]);
        rest.forEach(function (m) { more.appendChild(renderLeadMagnetCard(m)); });
        holder.appendChild(more);
      }
      if (magnets.length > 0) {
        if (result.lead_magnets_substance_note) holder.appendChild(el('p', { class: 'cvz-cs-hint' }, [result.lead_magnets_substance_note]));
        if (result.lead_magnets_tracking_note) holder.appendChild(el('p', { class: 'cvz-cs-hint' }, [el('strong', {}, ['So misst du, welcher Magnet wirkt: ']), result.lead_magnets_tracking_note]));
      } else {
        holder.appendChild(el('p', { class: 'cvz-cs-hint cvz-cs-magnet-empty' }, [leadMagnetsEmptyText(result)]));
      }
    }
    fill(result.funnel_check);
    // Nach dem Speichern des Content-Flows (eigene Seiten ergänzt, geändert oder gelöscht): Bauliste und Phasen-Status neu.
    state.funnelRefresh = function (funnel) {
      if (!funnel || !funnel.phases) return;
      result.funnel_check = funnel;
      fill(funnel);
      paintPhaseStatus(funnel);
      if (typeof state.goalRefresh === 'function') state.goalRefresh(); // NEU: Stand je Phase im Ziel-Abschnitt neu
    };
    return box;
  }
  // ==== FUNNEL-ENDE ====

  // NEU: Conversion-Pfad. Wird aus den Zwischenzielen der Seiten berechnet (nicht separat von Claude geliefert), damit
  // Übersicht und Seiten nie auseinanderlaufen. Je Phase: was der Besucher tut und wohin es führt, am Ende die Zielaktion.
  function renderConversionPath(result) {
    var pages = result.supporting_pages || [];
    var phases = MESSY_MIDDLE_PHASES.filter(function (p) { return p.value !== 'legacy'; });
    var rows = [];
    phases.forEach(function (phase) {
      var inPhase = pages.filter(function (p) { return p.messy_middle_phase === phase.value && p.zwischenziel; });
      if (inPhase.length === 0) return;
      var list = el('ul', { class: 'cvz-cs-path-list' });
      inPhase.forEach(function (p) {
        list.appendChild(el('li', {}, [
          el('span', { class: 'cvz-cs-badge cvz-cs-badge-path-' + p.zwischenziel.art }, [ZWISCHENZIEL_ART_LABELS[p.zwischenziel.art] || p.zwischenziel.art]),
          ' ', el('strong', {}, [p.zwischenziel.aktion]),
          el('span', { class: 'cvz-cs-path-page' }, [' auf „' + p.topic + '“']),
        ]));
      });
      rows.push(el('div', { class: 'cvz-cs-path-step' }, [el('p', { class: 'cvz-cs-path-phase' }, [phase.label]), list]));
    });
    if (rows.length === 0) return null; // ältere Berichte ohne Zwischenziele
    var goal = result.strategy_goal;
    rows.push(el('div', { class: 'cvz-cs-path-step cvz-cs-path-end' }, [
      el('p', { class: 'cvz-cs-path-phase' }, ['Zielaktion']),
      el('p', { class: 'cvz-cs-path-endtext' }, [
        goal ? optionLabel(END_GOAL_OPTIONS, goal.end_goal) + (goal.cta_label ? ' („' + goal.cta_label + '“)' : '') : 'Conversion-Seite',
        ' auf „' + result.conversion_page.topic + '“',
      ]),
    ]));
    // GEÄNDERT (Content-Plan): eingeklappt. Dieselben Aktionen stehen in den Seitenkarten darunter, der Pfad ist die Kurzfassung auf einen Blick.
    return el('details', { class: 'cvz-cs-path cvz-cs-path-fold cvz-cs-expand' }, [
      el('summary', {}, ['Conversion-Pfad auf einen Blick: der Weg zur Zielaktion']),
      el('p', { class: 'cvz-cs-hint' }, ['Kaum jemand erreicht die Zielaktion beim ersten Besuch. Je Phase zeigt die Übersicht den nächsten sinnvollen Schritt.']),
    ].concat(rows));
  }

  // NEU (Content-Plan): früher drei Abschnitte (Cluster, Content-Flow, Funnel). Jetzt einer: oben der Umschalter zwischen Liste und Diagramm,
  // darunter die Bauliste. Das Diagramm entsteht erst beim ersten Öffnen, weil es zum Einpassen eine sichtbare Fläche braucht.
  function buildContentPlanChildren(sessionId, result, session) {
    state.flowStore = flowStoreCreate(sessionId, result, session); // NEU: ein Diagramm-Stand für Liste und Content-Flow
    var listView = el('div', { class: 'cvz-cs-plan-view' }, buildClusterSectionChildren(sessionId, result));
    var diagramView = el('div', { class: 'cvz-cs-plan-view', style: 'display:none' });
    var diagramBuilt = false;
    // GEÄNDERT: Der Content-Flow heißt wieder so und ist als gleichwertige Ansicht erkennbar (ein grauer Textreiter wurde übersehen).
    var btnList = el('button', { type: 'button', class: 'cvz-cs-plan-tab is-active' }, ['Seitenliste']);
    var btnDiagram = el('button', { type: 'button', class: 'cvz-cs-plan-tab' }, ['Content-Flow (Diagramm bearbeiten)']);
    function show(which) {
      var diag = which === 'diagram';
      if (diag && !diagramBuilt) {
        diagramBuilt = true;
        diagramView.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Dieselben Seiten als Baum. Hier ergänzt, verschiebst und verknüpfst du Seiten. Eigene Seiten zählen in der Bauliste unten mit.']));
        diagramView.appendChild(renderFlowSection(sessionId, result, session));
      }
      listView.style.display = diag ? 'none' : '';
      diagramView.style.display = diag ? '' : 'none';
      btnList.classList.toggle('is-active', !diag);
      btnDiagram.classList.toggle('is-active', diag);
    }
    state.showPlanView = show; // NEU: "Im Content-Flow bearbeiten" aus der Liste
    var planSwitch = null;
    // NEU: zum Diagramm wechseln, an den Anfang des Content-Plans scrollen (sonst bleibt die Scroll-Position und man landet weiter unten,
    // weil die Liste ausgeblendet wird) und die Seite im Diagramm auswählen.
    state.openInFlow = function (nodeId) {
      show('diagram');
      if (planSwitch) {
                var offset = anchorNavHeight() + getSiteNavHeight() + 12;
        window.scrollTo({ top: planSwitch.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
      }
      if (nodeId && state.flowStore && state.flowStore.api && state.flowStore.api.focusNode) state.flowStore.api.focusNode(nodeId);
    };
    btnList.addEventListener('click', function () { show('list'); });
    btnDiagram.addEventListener('click', function () { show('diagram'); });
    var children = [
      planSwitch = el('div', { class: 'cvz-cs-plan-switch' }, [
        el('div', { class: 'cvz-cs-plan-tabs', role: 'group', 'aria-label': 'Ansicht des Content-Plans' }, [btnList, btnDiagram]),
        el('p', { class: 'cvz-cs-hint' }, ['Zwei Ansichten derselben Seiten: als Liste mit Content-Briefs oder als Content-Flow, in dem du Seiten ergänzt, verschiebst und verknüpfst.']),
      ]),
      listView, diagramView,
    ];
    children.push(renderFunnelSection(result));
    paintPhaseStatus(result.funnel_check, listView); // direkt in der Liste, sie hängt noch nicht im Dokument
    return children;
  }

  // NEU (Erwartung an organischen Traffic): Einordnung von Claude (traffic_outlook, ohne Zahlen) und die vom Server gerechnete Spanne
  // (traffic_range) mit offener Rechnung. Die Stufe kommt aus traffic_outlook, damit es nur eine Einordnung gibt.
  var TRAFFIC_LEVEL_TEXT = { sehr_gering: 'Sehr geringe Reichweite', gering: 'Geringe Reichweite', mittel: 'Mittlere Reichweite', hoch: 'Hohe Reichweite', nicht_beurteilbar: 'Nicht beurteilbar (Daten fehlen)' };
  function renderTrafficBlock(result) {
    var o = result.traffic_outlook;
    var r = result.traffic_range;
    if (!o && !r) return null;
    var box = el('div', { class: 'cvz-cs-traffic' });
    var head = el('div', { class: 'cvz-cs-traffic-head' }, [el('h5', {}, ['Was organisch realistisch ist'])]);
    if (o && o.level) head.appendChild(el('span', { class: 'cvz-cs-badge cvz-cs-traffic-level cvz-cs-traffic-level--' + o.level }, [TRAFFIC_LEVEL_TEXT[o.level] || o.level]));
    box.appendChild(head);
    if (r && r.volume_total > 0) {
      box.appendChild(el('p', { class: 'cvz-cs-traffic-range' }, [
        'ca. ' + r.visits_low.toLocaleString('de-DE') + ' bis ' + r.visits_high.toLocaleString('de-DE') + ' Besuche pro Monat aus der Google-Suche ', // GEÄNDERT: Leerzeichen am Ende, sonst klebt der Text beim Kopieren zusammen
        el('span', { class: 'cvz-cs-traffic-sub' }, [r.horizon + ', wenn die Seiten auf die erste Ergebnisseite kommen. Eine Spanne, keine Prognose.']),
      ]));
      if (r.horizon_note) box.appendChild(el('p', { class: 'cvz-cs-hint' }, [r.horizon_note])); // NEU: Zeitraum aus der Ausgangslage
    } else if (r) {
      box.appendChild(el('p', { class: 'cvz-cs-traffic-range' }, ['Keine Zahl möglich', el('span', { class: 'cvz-cs-traffic-sub' }, ['Für keine geplante Seite ist ein Suchvolumen messbar. Bei B2B-Themen heißt das oft nur "unter der Messgrenze".'])]));
    }
    if (o && o.expectation) box.appendChild(el('p', {}, [o.expectation]));
    if (o && o.distribution_note) {
      box.appendChild(el('div', { class: 'cvz-cs-callout' }, [el('strong', {}, ['Wofür die Seiten trotzdem gebraucht werden: ']), o.distribution_note]));
    }
    if (r) {
      var how = el('details', { class: 'cvz-cs-traffic-how cvz-cs-expand' }, [el('summary', {}, ['So kommt die Zahl zustande'])]); // GEÄNDERT: als Aufklapp-Knopf erkennbar
      var ol = el('ol', { class: 'cvz-cs-brief-list' });
      (r.steps || []).forEach(function (t) { ol.appendChild(el('li', {}, [t])); });
      how.appendChild(ol);
      if (r.caveats && r.caveats.length) {
        how.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Was die Zahl nicht enthält']));
        var ul = el('ul', { class: 'cvz-cs-brief-list' });
        r.caveats.forEach(function (t) { ul.appendChild(el('li', {}, [t])); });
        how.appendChild(ul);
      }
      if (o && o.limiting_factors) how.appendChild(el('p', {}, [el('strong', {}, ['Was hier zusätzlich drückt: ']), o.limiting_factors]));
      if (o && o.traffic_drivers && o.traffic_drivers.length) how.appendChild(el('p', {}, [el('strong', {}, ['Tragen den Großteil des Volumens: ']), o.traffic_drivers.join(', ')]));
      var phases = (r.phases || []).filter(function (ph) { return ph.pages > 0; });
      if (phases.length > 0) {
        how.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Suchen Interessenten in dieser Phase selbst?']));
        var t = el('table', { class: 'cvz-cs-table cvz-cs-table-cards' });
        t.appendChild(el('thead', {}, [el('tr', {}, [el('th', {}, ['Phase']), el('th', {}, ['Suchvolumen']), el('th', {}, ['Was das heißt'])])]));
        var tb = el('tbody');
        phases.forEach(function (ph) {
          tb.appendChild(el('tr', {}, [
            el('td', { 'data-label': 'Phase' }, [ph.label + ' (' + ph.pages + (ph.pages === 1 ? ' Seite)' : ' Seiten)')]),
            el('td', { 'data-label': 'Suchvolumen' }, [ph.volume > 0 ? 'ca. ' + ph.volume.toLocaleString('de-DE') + ' pro Monat' : 'nicht messbar']),
            el('td', { 'data-label': 'Was das heißt' }, [ph.volume >= 100 ? 'Interessenten suchen selbst. Die Seiten können sie über Google erreichen.' : ph.volume > 0 ? 'Wenig eigene Suche. Google allein trägt hier nicht, nimm Anzeigen, LinkedIn oder den Vertrieb dazu.' : 'Kaum messbare Suche. Erreiche Interessenten über Anzeigen, LinkedIn, Newsletter oder den Vertrieb, die Seiten sind dann das Ziel.']),
          ]));
        });
        t.appendChild(tb);
        how.appendChild(el('div', { class: 'cvz-cs-table-wrap' }, [t]));
      }
      box.appendChild(how);
    }
    return box;
  }

  // NEU (Verlinkung in den Seiten): Verlinkungsplan vom Server (result.link_plan). Fehlt er (ältere Antwort), wird er hier aus internal_links
  // gebildet, nach denselben Regeln wie im Backend (contentStrategyLinkPlan.ts). Die Links stehen danach in der Karte jeder Seite und im
  // Seitenpanel des Content-Flows, eine eigene Linkliste gibt es nicht mehr (sie doppelte sich mit dem Content-Flow).
  function linkPlanOf(result) {
    if (result.link_plan && result.link_plan.pages) return result.link_plan;
    var sup = result.supporting_pages || [];
    var cp = result.conversion_page || {};
    var pages = [{ ref: -1, topic: cp.topic || 'Conversion-Seite', existing: !!cp.existing_url, url: cp.existing_url || null, is_conversion: true }];
    sup.forEach(function (p, i) {
      var url = p && p.role === 'existing' && p.existing_coverage && p.existing_coverage.url ? p.existing_coverage.url : null;
      pages.push({ ref: i, topic: (p && p.topic) || ('Seite ' + (i + 1)), existing: !!url, url: url, is_conversion: false });
    });
    var known = {}; pages.forEach(function (p) { known[p.ref] = p; });
    var bySrc = {}, incoming = {}, total = 0;
    (result.internal_links || []).forEach(function (l) {
      var f = Number(l.from_index), t = Number(l.to_index);
      if (f === t || !known[f] || !known[t]) return;
      var list = bySrc[f] = bySrc[f] || [];
      if (list.some(function (x) { return x.target === t; })) return;
      list.push({ target: t, anchor: l.anchor_text_idea || '', reason: l.reason || '' });
      incoming[t] = (incoming[t] || 0) + 1; total++;
    });
    var sources = Object.keys(bySrc).map(Number).sort(function (x, y) { return x - y; }).map(function (k) { return { source: k, links: bySrc[k] }; });
    var underPillar = function (i) { var par = Number(sup[i] && sup[i].parent_index); return isFinite(par) && par >= 0 && sup[par] && sup[par].page_type === 'pillar_page'; };
    return {
      total: total, pages: pages, incoming: incoming,
      existing_sources: sources.filter(function (x) { return known[x.source].existing; }),
      new_sources: sources.filter(function (x) { return !known[x.source].existing; }),
      orphans: sup.map(function (_, i) { return i; }).filter(function (i) { return !incoming[i] && !underPillar(i); }).slice(0, 8),
    };
  }

  // Interne Links einer Seite: welche Links hier eingebaut werden, und woher Links kommen.
  function renderPageLinks(ref) {
    var plan = state.linkPlan;
    if (!plan) return null;
    var byRef = {};
    plan.pages.forEach(function (p) { byRef[p.ref] = p; });
    var me = byRef[ref];
    if (!me) return null;
    var all = (plan.existing_sources || []).concat(plan.new_sources || []);
    var out = (all.filter(function (x) { return x.source === ref; })[0] || {}).links || [];
    var from = all.filter(function (x) { return x.links.some(function (l) { return l.target === ref; }); }).map(function (x) { return byRef[x.source]; });
    var label = function (p) { return (p.is_conversion ? 'Conversion-Seite: ' : '') + p.topic + (p.existing ? ' (bestehend)' : ''); };
    var box = el('div', { class: 'cvz-cs-page-links' }, [el('p', { class: 'cvz-cs-brief-label' }, ['Interne Links'])]);
    if (out.length > 0) {
      box.appendChild(el('p', { class: 'cvz-cs-page-links-sub' }, [me.existing ? 'Auf dieser Seite ergänzen (geht sofort):' : 'Beim Schreiben einbauen:']));
      var ul = el('ul', { class: 'cvz-cs-link-targets' });
      out.forEach(function (l) {
        var t = byRef[l.target] || { topic: '?' };
        ul.appendChild(el('li', {}, [
          el('span', { class: 'cvz-cs-link-arrow' }, ['→']),
          el('span', {}, [
            el('strong', {}, [label(t)]),
            l.anchor ? el('span', { class: 'cvz-cs-link-meta' }, ['Ankertext: „' + l.anchor + '“' + (me.existing && !t.existing ? ' · einbauen, sobald die Seite online ist' : '')]) : null,
            l.reason ? el('span', { class: 'cvz-cs-link-meta' }, ['Warum: ' + l.reason]) : null,
          ]),
        ]));
      });
      box.appendChild(ul);
    }
    if (from.length > 0) {
      box.appendChild(el('p', { class: 'cvz-cs-page-links-sub' }, ['Wird verlinkt von: ' + from.map(label).join(', ')]));
    } else if (ref >= 0 && (plan.orphans || []).indexOf(ref) !== -1) {
      box.appendChild(el('p', { class: 'cvz-cs-page-links-warn' }, ['Noch kein Link aus dem Plan zeigt auf diese Seite. Ergänze einen im Content-Flow, sonst finden Besucher und Google sie nur über Navigation oder Sitemap.']));
    }
    return box.childNodes.length > 1 ? box : null;
  }

  // NEU (inhaltlicher Vergleich bestehender Seiten): result.page_comparisons vom Server. compact = Seitenpanel im Content-Flow.
  var INTENT_TEXT = { passt: 'Trifft die Suchintention', teilweise: 'Trifft die Suchintention nur teilweise', passt_nicht: 'Trifft die Suchintention nicht' };
  // NEU (Suchintention): Bezeichnungen wie im Backend (INTENT_LABELS in contentStrategyPageCompare.ts)
  var SEARCH_INTENT_TEXT = { informational: 'informativ (will etwas verstehen)', commercial: 'kommerziell (vergleicht Anbieter und Lösungen)', transactional: 'transaktional (will kaufen, buchen, anfragen)', navigational: 'navigational (sucht eine bestimmte Marke oder Seite)', mixed: 'gemischt' };
  function searchIntentLine(intent, extra) {
    if (!intent) return null;
    return el('p', { class: 'cvz-cs-page-acc-audience' }, [el('strong', {}, ['Suchintention: ']), (SEARCH_INTENT_TEXT[intent] || intent) + (extra || '')]);
  }
  function comparisonOf(ref) { return (state.pageComparisons || {})[ref] || null; }
  function renderPageComparison(cmp, compact) {
    if (!cmp) return null;
    var box = el('div', { class: 'cvz-cs-cmp' + (compact ? ' is-compact' : '') });
    box.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Vergleich mit den Top-Seiten zu „' + cmp.keyword + '“', tip('Der Server hat bei Google nach dem Suchbegriff dieser Seite gesucht, die ersten drei Seiten anderer Anbieter und eure Seite abgerufen und inhaltlich vergleichen lassen. Jeder Befund ist mit einem wörtlichen Zitat belegt, das der Server im abgerufenen Text geprüft hat. Befunde ohne Beleg fallen weg. Verglichen wird, was die Seiten inhaltlich bieten: Länge und Anzahl der Überschriften sind kein Ranking-Kriterium und werden nicht bewertet.', 'Wie entsteht der Vergleich?')]));
    if (cmp.status !== 'ok') { box.appendChild(el('p', { class: 'cvz-cs-hint' }, [cmp.note || 'Kein Vergleich möglich.'])); return box; }
    var compName = function (i) { var c = cmp.competitors[i - 1]; return c ? 'Platz ' + c.position + ', ' + c.domain : 'Top-Seite ' + i; };
    if (cmp.search_intent) {
      var si = cmp.search_intent;
      box.appendChild(el('p', { class: 'cvz-cs-cmp-intent' }, [el('strong', {}, ['Suchintention laut Google-Daten: ']), (SEARCH_INTENT_TEXT[si.label] || si.label) + (si.probability != null ? ', ' + Math.round(si.probability * 100) + ' %' : '') + (si.secondary && si.secondary.length ? '; daneben ' + si.secondary.map(function (x) { return (SEARCH_INTENT_TEXT[x.label] || x.label).replace(/ \(.*\)$/, ''); }).join(', ') : '')]));
    }
    if (cmp.intent) box.appendChild(el('p', { class: 'cvz-cs-cmp-intent cvz-cs-cmp-intent--' + cmp.intent.verdict }, [el('strong', {}, [INTENT_TEXT[cmp.intent.verdict] + ': ']), cmp.intent.explanation]));
    function findingList(title, list, max) {
      if (!list || list.length === 0) return;
      box.appendChild(el('p', { class: 'cvz-cs-page-links-sub' }, [title]));
      var ul = el('ul', { class: 'cvz-cs-cmp-list' });
      list.slice(0, max || list.length).forEach(function (f) {
        ul.appendChild(el('li', {}, [
          el('strong', {}, [f.topic]), ': ' + f.detail,
          compact ? null : el('span', { class: 'cvz-cs-link-meta' }, [compName(f.competitor) + ': „' + f.evidence + '“']),
        ]));
      });
      box.appendChild(ul);
    }
    findingList('Behandeln die Top-Seiten, eure Seite nicht:', cmp.gaps, compact ? 3 : 0);
    findingList('Behandelt eure Seite oberflächlicher:', cmp.depth, compact ? 2 : 0);
    if (!compact && cmp.strengths && cmp.strengths.length) {
      box.appendChild(el('p', { class: 'cvz-cs-page-links-sub' }, ['Was eure Seite besser macht:']));
      var su = el('ul', { class: 'cvz-cs-cmp-list' });
      cmp.strengths.forEach(function (x) { su.appendChild(el('li', {}, [x.point, el('span', { class: 'cvz-cs-link-meta' }, ['Eure Seite: „' + x.evidence + '“'])])); });
      box.appendChild(su);
    }
    if (cmp.actions && cmp.actions.length) {
      box.appendChild(el('p', { class: 'cvz-cs-page-links-sub' }, ['Daraus folgt:']));
      var ol = el('ol', { class: 'cvz-cs-cmp-list' });
      cmp.actions.forEach(function (a) { ol.appendChild(el('li', {}, [a])); });
      box.appendChild(ol);
    }
    if (!cmp.gaps.length && !cmp.depth.length && !cmp.actions.length) box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine belegten inhaltlichen Lücken gefunden. Eure Seite deckt ab, was die Top-Seiten behandeln.']));
    // GEÄNDERT: keine Tabelle mit Wörtern und Überschriften mehr. Länge ist kein Ranking-Kriterium und verleitete zu falschen Schlüssen.
    if (!compact) box.appendChild(el('p', { class: 'cvz-cs-hint' }, [cmp.note]));
    return box;
  }

  function buildClusterSectionChildren(sessionId, result) {
    state.linkPlan = linkPlanOf(result);
    state.planResult = result; // NEU: Reihenfolge und Kannibalisierung in den Seitenkarten
    state.pageComparisons = {};
    (result.page_comparisons || []).forEach(function (c) { state.pageComparisons[c.ref] = c; });
    var children = [];
    // GEÄNDERT: Die Ziel-Box steht nicht mehr hier, sondern als eigener Abschnitt "Ziel der Strategie" ganz oben (renderGoalOverview).
    var volumeText = pageVolumeText(result.conversion_page);
    var conversionBadges = [el('span', { class: 'cvz-cs-badge cvz-cs-badge-conversion' }, ['Conversion-Seite'])];
    var conversionCardChildren = [
      el('div', { class: 'cvz-cs-page-card-badges' }, conversionBadges),
      el('h4', {}, [result.conversion_page.topic]),
      el('p', { class: 'cvz-cs-hint' }, ['Keyword: ' + result.conversion_page.keyword + ' · ' + volumeText]),
      renderVolumeProxyNote(result.conversion_page),
    ];
    // NEU: Conversion-Seite ist eine bestehende Seite, die umgebaut wird (Backend-Feld existing_url).
    if (result.conversion_page.existing_url) {
      conversionCardChildren.push(el('p', { class: 'cvz-cs-page-acc-audience' }, [el('strong', {}, ['Bestehende Seite, wird umgebaut: ']), result.conversion_page.existing_url]));
    }
    // GEÄNDERT: Zielgruppe als Textzeile statt Badge, wie in den Seiten-Karten (oft ein ganzer Satz, mobil zu lang).
    if (result.conversion_page.primary_audience) {
      conversionCardChildren.push(el('p', { class: 'cvz-cs-page-acc-audience' }, [el('strong', {}, ['Zielgruppe: ']), result.conversion_page.primary_audience]));
    }
    conversionCardChildren.push(renderAskLink('Nachfragen zu dieser Seite', 'Was ist auf der Conversion-Seite „' + result.conversion_page.topic + '“ am wichtigsten, und womit fangen wir an?')); // NEU
    conversionCardChildren.push(el('div', { class: 'cvz-cs-flow-note', 'data-ref': '-1', style: 'display:none' })); // NEU: Notiz aus dem Content-Flow
    var convCannibal = cannibalNoteFor(result.cannibalization, -1); // NEU: Kannibalisierung
    if (convCannibal) conversionCardChildren.push(el('p', { class: 'cvz-cs-page-acc-audience' }, [el('strong', {}, ['Kannibalisierung: ']), convCannibal]));
    var convCmp = renderPageComparison(comparisonOf(-1), false); // NEU: Vergleich der umgebauten Conversion-Seite
    if (convCmp) conversionCardChildren.push(convCmp);
    if (result.conversion_page.content_brief && result.conversion_page.content_brief.length > 0) {
      conversionCardChildren.push(renderContentBrief(result.conversion_page.content_brief, result.conversion_page.existing_url ? 'Was an dieser Seite umgebaut wird:' : null));
    }
    var convLinks = renderPageLinks(-1); // NEU: Links der Conversion-Seite
    if (convLinks) conversionCardChildren.push(convLinks);
    conversionCardChildren.push(buildLandingpageButton(result.conversion_page.topic));
    children.push(el('div', { class: 'cvz-cs-conversion-card' }, conversionCardChildren));
    var path = renderConversionPath(result);
    if (path) children.push(path);
    children.push(el('h5', {}, ['Unterstützende Seiten']));
    // NEU: Karten sind zugeklappt. Der Hinweis zum Bearbeitungsstatus steht einmal hier statt in jeder Karte,
    // dazu ein Schalter für alle Karten.
    var accCards = [];
    var toggleAllBtn = el('button', { type: 'button', class: 'cvz-cs-expand-btn' }, ['Alle aufklappen']);
    var toolbar = el('div', { class: 'cvz-cs-cluster-toolbar' }, [
      el('p', { class: 'cvz-cs-hint' }, [
        'Tippe auf eine Seite für Begründung, Content-Brief und Status.',
        tip('Den Bearbeitungsstatus setzt du selbst: Er dient deiner Übersicht, wird gespeichert und steht im Export. ' + VOLUME_NOTE, 'Hinweise zu Status und Suchvolumen'),
      ]),
      toggleAllBtn,
    ]);
    children.push(toolbar);
    var refreshToggle = wireExpandToggle(toggleAllBtn, function () { return accCards; });
    var roNote = renderRolloutNote(result, function () { return accCards; }); // NEU: Reihenfolge Zuerst / Später
    if (roNote) children.push(roNote);
    var pagesByPhase = groupPagesByPhase(result.supporting_pages || []);
    MESSY_MIDDLE_PHASES.forEach(function (phase) {
      var pagesInPhase = pagesByPhase[phase.value];
      if (!pagesInPhase || pagesInPhase.length === 0) return;
      var group = el('div', { class: 'cvz-cs-phase-group' });
      group.appendChild(el('h6', { class: 'cvz-cs-phase-title' }, [
        phase.label,
        el('span', { class: 'cvz-cs-phase-count' }, ['(' + pagesInPhase.length + (pagesInPhase.length === 1 ? ' Seite)' : ' Seiten)')]),
        el('span', { class: 'cvz-cs-badge cvz-cs-phase-status', 'data-phase': phase.value, style: 'display:none' }), // NEU: Status aus dem Funnel-Befund
      ]));
      group.appendChild(el('p', { class: 'cvz-cs-phase-desc' }, [phase.description]));
      pagesInPhase.forEach(function (entry) {
        var card = renderPageCard(sessionId, entry.page, entry.index);
        card.addEventListener('toggle', refreshToggle); // Beschriftung folgt auch einzelnem Auf-/Zuklappen
        accCards.push(card);
        group.appendChild(card);
      });
      children.push(group);
    });
    var ownBox = el('div', { class: 'cvz-cs-own' }); // NEU: eigene Seiten aus dem Content-Flow, auch in der Liste
    children.push(ownBox);
    var notPlanned = renderNotPlanned(result.not_planned, state.flowStore); // NEU: Bewusst nicht im Plan, unter den Seiten
    if (notPlanned) children.push(notPlanned);
    if (state.flowStore) {
      var store = state.flowStore;
      var paintOwn = function () { renderOwnPages(ownBox, store); paintFlowNotes(children, store); };
      store.listeners.push(paintOwn);
      paintOwn();
    }
    return children;
  }

  function describeLink(link, result) {
    var fromLabel = link.from_index === -1 ? result.conversion_page.topic : (result.supporting_pages[link.from_index] || {}).topic || ('#' + link.from_index);
    var toLabel = link.to_index === -1 ? result.conversion_page.topic : (result.supporting_pages[link.to_index] || {}).topic || ('#' + link.to_index);
    return fromLabel + ' → ' + toLabel + (link.anchor_text_idea ? ' ("' + link.anchor_text_idea + '")' : '');
  }

  // Teaser aus Fließtext mit Markdown: Formatierung entfernen, ersten Satz nehmen (die Zeile wird per CSS auf 2 Zeilen gekürzt).
  function teaserFrom(text) {
    if (!text) return '';
    var plain = String(text)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`#>]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    var m = plain.match(/^.{20,}?[.!?](?=\s|$)/);
    return m ? m[0] : plain;
  }

  // NEU: "Alle aufklappen / Alle zuklappen" wie im LP-Report. Gibt refresh zurück: Die Aufrufer hängen es an das
  // toggle-Ereignis jedes Bereichs (es bubbelt nicht), damit die Beschriftung auch einzelnem Auf-/Zuklappen folgt.
  function wireExpandToggle(btn, getFolds) {
    function refresh() { btn.textContent = getFolds().some(function (d) { return !d.open; }) ? 'Alle aufklappen' : 'Alle zuklappen'; }
    btn.addEventListener('click', function () {
      var shouldOpen = getFolds().some(function (d) { return !d.open; });
      getFolds().forEach(function (d) { d.open = shouldOpen; });
      refresh();
    });
    return refresh;
  }

  // NEU (wie im LP-Report): beim Drucken alle Bereiche öffnen, danach den vorherigen Zustand wiederherstellen.
  var printOpened = [];
  window.addEventListener('beforeprint', function () {
    printOpened = [];
    if (!state.root) return;
    state.root.querySelectorAll('details').forEach(function (d) { if (!d.open) { d.open = true; printOpened.push(d); } });
  });
  window.addEventListener('afterprint', function () {
    printOpened.forEach(function (d) { d.open = false; });
    printOpened = [];
  });

  function statusLabel(value) {
    var opt = STATUS_OPTIONS.filter(function (o) { return o.value === value; })[0];
    return opt ? opt.label : (value || 'Vorgeschlagen');
  }

  // GEÄNDERT (siehe Chat-Verlauf, UX-Prüfung mobil): Die Karte ist jetzt aufklappbar (<details>). Zugeklappt sieht man,
  // was zum Priorisieren reicht: Seitentyp, Rolle, ggf. Warnung, Titel, Keyword, Volumen, Status. Alles andere
  // (Zielgruppe, Begründung, KI-Fragen, Content-Brief, Status ändern) steht im aufgeklappten Teil.
  // Die Zielgruppe ist kein Badge mehr, weil sie oft ein ganzer Satz ist und mobil aus der Karte lief.
  function renderPageCard(sessionId, page, index) {
    var card = el('details', { class: 'cvz-cs-page-card cvz-cs-fold cvz-cs-page-acc', 'data-ref': String(index) }); // NEU: Sprungziel aus der Roadmap
    // GEÄNDERT (Übersicht): Das Standard-Badge "Trust/Themenabdeckung" (role coverage) stand fast überall neben "Themenabdeckung" und sagte
    // dasselbe. Es entfällt. Besondere Rollen (Rank- & Zitier-Ziel, bereits vorhanden) bleiben.
    var badges = [el('span', { class: 'cvz-cs-badge' }, [pageTypeLabel(page.page_type)])];
    var ro = rolloutOf(state.planResult, index); // NEU: Reihenfolge
    if (ro) {
      badges.unshift(el('span', { class: 'cvz-cs-badge cvz-cs-badge-rollout-' + ro.step, title: ro.why }, [ro.step === 'zuerst' ? 'Zuerst' : 'Später']));
      card.setAttribute('data-rollout', ro.step);
    }
    if (page.role !== 'coverage') badges.push(el('span', { class: 'cvz-cs-badge cvz-cs-badge-role-' + page.role }, [roleLabel(page.role)]));
    if (page.commodity_risk) badges.push(el('span', { class: 'cvz-cs-badge cvz-cs-badge-commodity', title: page.commodity_reasoning || '' }, ['Austauschbar']));
    var statusMeta = el('strong', {}, [statusLabel(page.status)]);
    // Wie im LP-Report: ein Teaser (erster Satz der Begründung), damit die zugeklappte Zeile eine Aussage hat.
    var headChildren = [
      el('div', { class: 'cvz-cs-page-card-badges' }, badges),
      el('h4', { class: 'cvz-cs-page-card-topic' }, [page.topic]),
      el('p', { class: 'cvz-cs-page-acc-meta' }, [page.keyword + ' · ' + pageVolumeShort(page), pageVolumeTip(page), ' · Status: ', statusMeta]),
    ];
    // NEU: Zwischenziel schon in der zugeklappten Zeile, weil es die Frage "wozu ist diese Seite da?" am schnellsten beantwortet.
    if (page.zwischenziel) {
      headChildren.push(el('p', { class: 'cvz-cs-page-acc-goal' }, ['→ ', page.zwischenziel.aktion]));
    } else {
      var teaser = teaserFrom(page.reasoning);
      if (teaser) headChildren.push(el('p', { class: 'cvz-cs-page-acc-teaser' }, [teaser]));
    }
    card.appendChild(el('summary', {}, [el('div', { class: 'cvz-cs-page-acc-head' }, headChildren)]));
    // Ab hier: aufgeklappter Teil. "body" ersetzt "card" als Ziel, der restliche Aufbau bleibt gleich.
    var body = el('div', { class: 'cvz-cs-page-acc-body' });
    card.appendChild(body);
    var outer = card;
    card = body;
    // NEU: Bestehende Seite mit Adresse und Position (stand bisher nur als Badge da)
    if (page.role === 'existing' && page.existing_coverage && page.existing_coverage.url) {
      card.appendChild(el('p', { class: 'cvz-cs-page-acc-audience' }, [el('strong', {}, ['Bestehende Seite: ']), shortUrl(page.existing_coverage.url) + (page.existing_coverage.position ? ' (heute Position ' + page.existing_coverage.position + ')' : '')]));
      if (page.existing_lever) card.appendChild(el('p', { class: 'cvz-cs-page-acc-audience' }, [el('strong', {}, ['Hebel: ']), page.existing_lever.label])); // NEU
    }
    if (page.primary_audience) {
      card.appendChild(el('p', { class: 'cvz-cs-page-acc-audience' }, [el('strong', {}, ['Zielgruppe: ']), page.primary_audience]));
    }
    if (ro) card.appendChild(el('p', { class: 'cvz-cs-page-acc-audience' }, [el('strong', {}, [(ro.step === 'zuerst' ? 'Zuerst' : 'Später') + ': ']), ro.why]));
    card.appendChild(el('div', { class: 'cvz-cs-flow-note', 'data-ref': String(index), style: 'display:none' })); // NEU: Notiz aus dem Content-Flow
    var cnNote = cannibalNoteFor(state.planResult && state.planResult.cannibalization, index); // NEU: Kannibalisierung
    if (cnNote) card.appendChild(el('p', { class: 'cvz-cs-page-acc-audience' }, [el('strong', {}, ['Kannibalisierung: ']), cnNote]));
    var siLine = searchIntentLine(page.search_intent); // NEU: Suchintention des Haupt-Keywords (stand bisher nur in den Daten)
    if (siLine) card.appendChild(siLine);
    var volNote = renderVolumeProxyNote(page);
    if (volNote) card.appendChild(volNote);
    if (page.zwischenziel) {
      card.appendChild(el('div', { class: 'cvz-cs-zwischenziel' }, [
        el('p', { class: 'cvz-cs-brief-label' }, ['Zwischenziel']),
        el('p', {}, [
          el('span', { class: 'cvz-cs-badge cvz-cs-badge-path-' + page.zwischenziel.art }, [ZWISCHENZIEL_ART_LABELS[page.zwischenziel.art] || page.zwischenziel.art]),
          ' ', page.zwischenziel.aktion,
        ]),
        el('p', { class: 'cvz-cs-hint' }, ['Danach: ' + page.zwischenziel.naechster_schritt]),
      ]));
    }
    if (PAGE_TYPE_EXPLANATIONS[page.page_type]) {
      card.appendChild(el('p', { class: 'cvz-cs-page-card-type-explanation' }, [PAGE_TYPE_EXPLANATIONS[page.page_type]]));
    }
    if (page.reasoning) card.appendChild(renderProse(page.reasoning, 'cvz-cs-page-card-reasoning'));
    var askPage = renderAskLink('Nachfragen: Warum diese Seite?', 'Warum ist die Seite „' + page.topic + '“ im Plan? Was würde fehlen, wenn wir sie weglassen?'); // NEU
    if (askPage) card.appendChild(askPage);
    if (page.addresses_prompts && page.addresses_prompts.length > 0) {
      var ev = page.evidence;
      if (ev) {
        var prioText = { hoch: 'Priorität hoch', mittel: 'Priorität mittel', niedrig: 'Priorität niedrig', ohne_messdaten: 'Ohne belastbare Messdaten' }[ev.priority] || ev.priority;
        card.appendChild(el('p', { class: 'cvz-cs-evidence' }, [
          'Beleg: ' + ev.basis + (ev.ai_search_volume ? ' · KI-Suchvolumen ca. ' + ev.ai_search_volume : ''),
          el('span', { class: 'cvz-cs-prio cvz-cs-prio-' + ev.priority }, [prioText]),
        ]));
      }
      var promptList = el('ul', { class: 'cvz-cs-brief-list' });
      page.addresses_prompts.forEach(function (pr) { promptList.appendChild(el('li', {}, ['"' + pr + '"'])); });
      card.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Beantwortet diese gemessenen KI-Fragen:']));
      card.appendChild(promptList);
      // Teilfragen, in die ChatGPT die Fragen zerlegt hat: Vorlage für Abschnitte/FAQ dieser Seite.
      var wanted = {};
      page.addresses_prompts.forEach(function (pr) { wanted[pr.toLowerCase()] = true; });
      var subs = [];
      (state.visibilityPrompts || []).forEach(function (vp) {
        if (!wanted[String(vp.prompt).toLowerCase()]) return;
        (vp.fan_out_queries || []).forEach(function (q) { if (subs.indexOf(q) === -1) subs.push(q); });
      });
      if (subs.length > 0) {
        var subList = el('ul', { class: 'cvz-cs-brief-list' });
        subs.slice(0, 8).forEach(function (q) { subList.appendChild(el('li', {}, [q])); });
        var subShown = subs.slice(0, 8).length;
        card.appendChild(el('details', { class: 'cvz-cs-expand' }, [
          el('summary', {}, ['Aufklappen: ' + subShown + (subShown === 1 ? ' Teilfrage' : ' Teilfragen') + ', die ChatGPT dahinter sucht (Vorlage für Abschnitte und FAQ)']),
          subList,
          el('p', { class: 'cvz-cs-hint' }, ['Nur von ChatGPT, eine Momentaufnahme. Gemini liefert keine solchen Teilfragen.']),
        ]));
      }
    }
    var isExistingPage = page.role === 'existing';
    var cmpBox = renderPageComparison(comparisonOf(index), false); // NEU: inhaltlicher Vergleich (nur bestehende Seiten)
    if (cmpBox) card.appendChild(cmpBox);
    if (page.content_brief && page.content_brief.length > 0) card.appendChild(renderContentBrief(page.content_brief, isExistingPage ? 'Was an dieser Seite verbessert wird:' : null));
    var pageLinks = renderPageLinks(index); // NEU: Links dieser Seite
    if (pageLinks) card.appendChild(pageLinks);
    if (page.commodity_risk && page.commodity_reasoning) {
      card.appendChild(el('p', { class: 'cvz-cs-commodity-note' }, ['Risiko austauschbarer Inhalt: ' + page.commodity_reasoning]));
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
          page.status = statusSelect.value; statusSelect.removeAttribute('disabled');
          statusMeta.textContent = statusLabel(page.status); // Status in der zugeklappten Zeile mitziehen
          statusSaved.textContent = '✓ gespeichert';
          setTimeout(function () { statusSaved.textContent = ''; }, 2500);
        })
        .catch(function (err) { statusSelect.value = previous; statusSelect.removeAttribute('disabled'); alert('Status konnte nicht gespeichert werden: ' + err.message); });
    });
    var statusSaved = el('span', { class: 'cvz-cs-status-saved' });
    var statusRow = el('div', { class: 'cvz-cs-status-row' }, [
      el('label', { class: 'cvz-cs-status-label' }, ['Dein Bearbeitungsstatus:']),
      statusSelect,
      statusSaved,
    ]);
    var footer = el('div', { class: 'cvz-cs-page-card-footer' }, [statusRow]);
    if (page.page_type === 'conversion_landingpage') footer.appendChild(buildLandingpageButton(page.topic));
    if (page.page_type === 'pillar_page') footer.appendChild(buildPillarButton(page)); // NEU
    card.appendChild(footer);
    return outer;
  }

  // GEÄNDERT: optionaler Titel. Bei bestehenden Seiten heißt der Brief "Was an dieser Seite verbessert wird", weil er Umbauten beschreibt.
  function renderContentBrief(brief, label) {
    var box = el('div', { class: 'cvz-cs-brief' });
    box.appendChild(el('p', { class: 'cvz-cs-brief-label' }, [label || 'Content-Brief:']));
    var list = el('ul', { class: 'cvz-cs-brief-list' });
    brief.forEach(function (item) { list.appendChild(el('li', {}, [item])); });
    box.appendChild(list);
    return box;
  }

  function renderCurrentStateTable(rows, isEstimate) {
    var table = el('table', { class: 'cvz-cs-table cvz-cs-current-state-table' });
    table.appendChild(el('thead', {}, [el('tr', {}, [
      el('th', {}, ['Seite']),
      el('th', {}, ['Keyword']),
      el('th', {}, ['Ø Position']),
      el('th', {}, ['CTR']),
      el('th', {}, ['Impressionen']),
      el('th', {}, ['Klicks']),
    ])]));
    var tbody = el('tbody');
    rows.forEach(function (row) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, [row.page_url]),
        el('td', {}, [row.query]),
        el('td', {}, [row.avg_position != null ? row.avg_position.toFixed(1) : '-']),
        el('td', {}, [row.ctr != null ? (row.ctr * 100).toFixed(1) + '%' : (isEstimate ? 'k.A.' : '-')]),
        el('td', {}, [row.impressions != null ? String(row.impressions) : (isEstimate ? 'k.A.' : '-')]),
        el('td', {}, [row.clicks != null ? String(row.clicks) : (isEstimate ? 'k.A.' : '-')]),
      ]));
    });
    table.appendChild(tbody);
    return el('div', { class: 'cvz-cs-table-wrap' }, [table]);
  }

  function renderCurrentStateSection(currentState) {
    var box = el('div', { class: 'cvz-cs-current-state' });
    if (!currentState) return box;
    box.appendChild(el('p', { class: 'cvz-cs-hint' }, [currentState.note || '']));
    if (!currentState.rows || currentState.rows.length === 0) {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine bestehenden Rankings gefunden.']));
      return box;
    }
    var isEstimate = currentState.source !== 'google_search_console';
    var topicRows = currentState.rows.filter(function (r) { return r.relevance !== 'general'; });
    var generalRows = currentState.rows.filter(function (r) { return r.relevance === 'general'; });
    if (topicRows.length > 0) {
      box.appendChild(renderCurrentStateTable(topicRows, isEstimate));
    } else {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Noch keine eigene Sichtbarkeit zu diesem Thema gefunden.']));
    }
    if (generalRows.length > 0) {
      box.appendChild(el('h5', { class: 'cvz-cs-current-state-general-title' }, ['Weitere starke Keywords der Domain (unabhängig vom Thema)']));
      box.appendChild(renderCurrentStateTable(generalRows, isEstimate));
    }
    return box;
  }

  // NEU: Button zum Pillar-Aufbau, wie "Jetzt mit dem Landingpage-Tool bauen" bei der Conversion-Seite
  function buildPillarButton(page) {
    var href = CONFIG.pillarAssistantUrl + '?new=1&page_type=pillar&topic=' + encodeURIComponent(page.topic || '') + (page.keyword ? '&keyword=' + encodeURIComponent(page.keyword) : '');
    return el('a', { class: 'cvz-cs-build-btn', href: href }, ['Jetzt mit dem Pillar-Page-Tool bauen']);
  }

  function buildLandingpageButton(topic) {
    var href = CONFIG.landingpageAssistantUrl + '?new=1&topic=' + encodeURIComponent(topic);
    return el('a', { class: 'cvz-cs-build-btn', href: href }, ['Jetzt mit dem Landingpage-Tool bauen']);
  }

  // NEU: Ergebnis je Prompt, aus dem Tracker-Snapshot oder der Frischmessung (gleiches Format).
  // Alte Sessions haben beides nicht, dann bleibt der Abschnitt weg (null).
  var VERDICT_LABEL_MAP = { luecke: 'Lücke', wackelig: 'Wackelig', stabil: 'Stabil', zu_wenig_daten: 'Zu wenig Daten' };
  function visibilityRate(n, total) { return total > 0 ? n + ' von ' + total + ' Antworten' : 'keine Daten'; }

  function renderVisibilitySection(session) {
    var prompts = getVisibilityPrompts(session);
    if (!prompts || prompts.length === 0) return null;
    var fresh = session && session.visibility_measurement;
    var box = el('div', { class: 'cvz-cs-geo' });
    box.appendChild(el('h5', {}, ['Sichtbarkeit je Frage deiner Zielgruppe']));
    if (fresh) {
      var when = fresh.measured_at ? new Date(fresh.measured_at).toLocaleDateString('de-DE') : '';
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, [
        'Einzelmessung vom ' + when + ': ' + fresh.completed_calls + ' Antworten von ChatGPT und Gemini. Eine Momentaufnahme, kein Trend; KI-Antworten schwanken.',
      ]));
      if (fresh.budget_exhausted || fresh.failed_calls > 0 || fresh.skipped_calls > 0) {
        box.appendChild(el('p', { class: 'cvz-cs-gsc-hint' }, [
          'Nicht alle geplanten Abfragen liefen durch (' + fresh.failed_calls + ' fehlgeschlagen, ' + fresh.skipped_calls + ' übersprungen). Wo Daten fehlen, steht das bei der Frage.',
        ]));
      }
    } else {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Aus deinen Tracker-Daten, Zeitraum siehe Ausgangslage.']));
    }
    var ORDER = { luecke: 0, wackelig: 1, zu_wenig_daten: 2, stabil: 3 };
    PHASE_OPTIONS.concat([{ value: 'discovery', label: 'Entdeckung' }, { value: '', label: 'Ohne Phase' }]).forEach(function (ph) {
      var inPhase = prompts.filter(function (p) { return (p.phase || '') === ph.value; });
      if (inPhase.length === 0) return;
      inPhase.sort(function (a, b) { return (ORDER[a.verdict] != null ? ORDER[a.verdict] : 9) - (ORDER[b.verdict] != null ? ORDER[b.verdict] : 9); });
      box.appendChild(el('h6', {}, [ph.label]));
      inPhase.forEach(function (p) { box.appendChild(renderVisibilityCard(p)); });
    });
    box.appendChild(renderMethodSection(session));
    return box;
  }

  var PROVIDER_NAME_MAP = { chat_gpt: 'ChatGPT', gemini: 'Gemini', google_ai_overview: 'Google AI Overview' };

  function renderVisibilityCard(p) {
    var card = el('div', { class: 'cvz-cs-vcard cvz-cs-vcard-' + p.verdict });
    card.appendChild(el('p', { class: 'cvz-cs-vcard-title' }, [
      el('span', { class: 'cvz-cs-vbadge cvz-cs-vbadge-' + p.verdict }, [VERDICT_LABEL_MAP[p.verdict] || p.verdict]),
      '"' + p.prompt + '"',
    ]));
    var meta = ORIGIN_LABEL_MAP[p.origin] || p.origin;
    if (p.role) meta += ' · ' + p.role;
    if (typeof p.ai_search_volume === 'number') meta += ' · KI-Suchvolumen ca. ' + p.ai_search_volume;
    card.appendChild(el('p', { class: 'cvz-cs-hint' }, [meta]));
    if (p.runs > 0) {
      (p.by_provider && p.by_provider.length > 0 ? p.by_provider : [{ provider: '', runs: p.runs, cited: p.cited }]).forEach(function (b) {
        var pct = b.runs > 0 ? Math.round((b.cited / b.runs) * 100) : 0;
        var fill = el('span', { class: 'cvz-cs-vbar-fill' });
        fill.style.width = pct + '%';
        card.appendChild(el('div', { class: 'cvz-cs-vbar' }, [
          el('span', { class: 'cvz-cs-vbar-label' }, [PROVIDER_NAME_MAP[b.provider] || b.provider || 'Gesamt']),
          el('span', { class: 'cvz-cs-vbar-track' }, [fill]),
          el('span', {}, ['zitiert in ' + b.cited + ' von ' + b.runs]),
        ]));
      });
      card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Erwähnt (ohne Quellenlink) in ' + p.mentioned + ' von ' + p.runs + ' Antworten.']));
    } else {
      card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine gültigen Antworten, kein Urteil möglich.']));
    }
    if (p.runs_without_sources) {
      card.appendChild(el('p', { class: 'cvz-cs-hint' }, [p.runs_without_sources + ' von ' + p.runs + ' Antworten enthielten gar keine Quellen. Die Lücke ist hier mit Vorsicht zu lesen.']));
    }
    var doms = p.top_cited_domains || [];
    if (doms.length > 0) {
      var fmt = function (d) { return d.domain + ' (' + d.share + ' %)'; };
      card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Stattdessen zitiert: ' + doms.slice(0, 3).map(fmt).join(', ')]));
      if (doms.length > 3) {
        card.appendChild(el('details', { class: 'cvz-cs-expand' }, [el('summary', {}, ['Aufklappen: weitere zitierte Quellen']), el('p', { class: 'cvz-cs-hint' }, [doms.slice(3).map(fmt).join(', ')])]));
      }
    }
    if (p.fan_out_queries && p.fan_out_queries.length > 0) {
      var fl = el('ul', { class: 'cvz-cs-brief-list' });
      p.fan_out_queries.forEach(function (q) { fl.appendChild(el('li', {}, [q])); });
      card.appendChild(el('details', { class: 'cvz-cs-expand' }, [
        el('summary', {}, ['Aufklappen: Was ChatGPT dahinter sucht (' + p.fan_out_queries.length + (p.fan_out_queries.length === 1 ? ' Teilfrage' : ' Teilfragen') + ')']),
        fl,
        el('p', { class: 'cvz-cs-hint' }, ['Nur von ChatGPT, eine Momentaufnahme.']),
      ]));
    }
    return card;
  }

  // Methodik und Grenzen: eingeklappt, damit der Bericht nicht überladen wirkt, aber jederzeit prüfbar.
  function renderMethodSection(session) {
    var fresh = session && session.visibility_measurement;
    var snap = session && session.tracker_snapshot;
    var items = [];
    if (fresh) {
      items.push('Gemessen am ' + (fresh.measured_at ? new Date(fresh.measured_at).toLocaleString('de-DE') : '') + ' bei ChatGPT und Gemini (Deutsch, Standort Deutschland), je Frage bis zu ' + fresh.runs_per_prompt + ' Läufe pro Anbieter.');
      items.push(fresh.completed_calls + ' von ' + fresh.planned_calls + ' geplanten Abfragen lieferten eine Antwort (' + fresh.failed_calls + ' fehlgeschlagen, ' + fresh.skipped_calls + ' wegen des Zeitbudgets übersprungen).');
      items.push('"Zitiert" heißt: Deine Domain steht als Quelle in der Antwort (Subdomains zählen nicht). "Erwähnt" heißt: Der Domain-Name steht im Text.');
      items.push('Das Urteil "stabil" bedeutet, dass die Domain in mindestens zwei Dritteln der Antworten zitiert wurde. "Lücke" heißt nie zitiert, "wackelig" dazwischen. Die Schwelle ist eine Festlegung, kein Branchenstandard.');
    } else if (snap) {
      items.push('Aus dem Customer Journey Tracker, ' + snap.runs_in_window + ' Abfragen in den letzten ' + snap.window_days + ' Tagen.');
    }
    items.push('Teilfragen (Fan-out) gibt es nur von ChatGPT, nicht von Gemini.');
    items.push('Ergebnisse von KI-Assistenten schwanken von Antwort zu Antwort. Eine Einzelmessung zeigt eine Richtung, keine Garantie, und sie sagt nicht, WARUM eine Domain (nicht) zitiert wird.');
    items.push('Zahlen und Belege stammen aus der Messung. Empfehlungen und Hypothesen sind Einschätzungen der KI.');
    var list = el('ul', { class: 'cvz-cs-brief-list' });
    items.forEach(function (t) { list.appendChild(el('li', {}, [t])); });
    return el('div', { class: 'cvz-cs-method' }, [el('details', { class: 'cvz-cs-expand' }, [el('summary', {}, ['Datenbasis und Methode']), list])]);
  }

  var OFFSITE_KIND_LABELS = {
    listing: 'Eintrag', gastbeitrag: 'Gastbeitrag', pr_erwaehnung: 'PR / Erwähnung',
    bewertungsportal: 'Bewertungen', vergleichsportal: 'Vergleichsportal', sonstiges: 'Prüfen',
    // NEU: eigene Inhalte auf Plattformen (Backend liefert zusätzlich kind_label)
    video: 'Eigenes Video', community_beitrag: 'Beitrag in der Community', social_beitrag: 'Beitrag im eigenen Profil',
    podcast: 'Podcast', plattform_artikel: 'Artikel auf der Plattform',
  };
  // NEU: Nur http(s)-Links aus den Messdaten verlinken (Schutz vor javascript:-Links o. ä.)
  function safeHttpUrl(u) {
    try {
      var x = new URL(String(u));
      return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
    } catch (e) { return null; }
  }
  // NEU: Hinweise, die zur Art der Maßnahme gehören (Kennzeichnung, echte Bewertungen)
  var OFFSITE_KIND_NOTES = {
    community_beitrag: 'Gib dich als Anbieter zu erkennen und halte die Regeln der Community ein. Verdeckte Werbung ist unzulässig.',
    bewertungsportal: 'Nur echte Bewertungen echter Kunden. Gekaufte oder selbst geschriebene Bewertungen sind unzulässig, Anreize nur offen und wenn das Portal sie erlaubt.',
    vergleichsportal: 'Nur echte Bewertungen echter Kunden. Gekaufte oder selbst geschriebene Bewertungen sind unzulässig.',
  };

  // Off-Site-Maßnahmen aus der eigenen, parallelen KI-Abfrage. Domains und Zahlen stammen aus der
  // Messung, die Aktion und die Vermutung sind Einschätzungen der KI.
  var DOMAIN_TYPE_LABELS = {
    wettbewerber: 'Wettbewerber', vergleichs_bewertungsportal: 'Vergleichs- oder Bewertungsportal',
    fachmedium: 'Fachmedium oder Branchenportal', verzeichnis: 'Verzeichnis oder Marktplatz',
    ratgeber_blog: 'Ratgeber oder Blog', enzyklopaedie_behoerde: 'Nachschlagewerk oder Behörde',
    plattform: 'Plattform für eigene Inhalte', unklar: 'Art nicht sicher erkennbar',
  };

  function renderOffsiteSources(sources) {
    var wrap = el('div', {});
    wrap.appendChild(el('h5', {}, ['Wer wird stattdessen zitiert?']));
    wrap.appendChild(el('p', { class: 'cvz-cs-hint' }, [
      'Einschätzung der KI aus Domain-Name und einer Beispiel-Quelle aus der Messung, nicht von uns geprüft. Bei Wettbewerbern und Nachschlagewerken planen wir keine Platzierung.',
    ]));
    sources.forEach(function (x) {
      var comp = x.type === 'wettbewerber';
      var row = el('div', { class: 'cvz-cs-src' + (comp ? ' cvz-cs-src-comp' : '') });
      row.appendChild(el('div', { class: 'cvz-cs-src-head' }, [
        el('b', {}, [x.domain]),
        el('span', { class: 'cvz-cs-badge' }, [x.type_label || DOMAIN_TYPE_LABELS[x.type] || x.type]),
        el('span', { class: 'cvz-cs-hint' }, ['bei ' + (x.prompts ? x.prompts.length : 0) + (x.prompts && x.prompts.length === 1 ? ' Frage' : ' Fragen') + ', bis zu ' + x.best_share + ' % der Antworten']),
      ]));
      if (x.reason) row.appendChild(el('p', { class: 'cvz-cs-hint' }, [x.reason]));
      if (!x.offsite_possible) row.appendChild(el('p', { class: 'cvz-cs-src-no' }, ['Keine Off-Site-Maßnahme: ' + (comp ? 'Wettbewerber, dort kannst du nichts platzieren.' : 'dort lässt sich nichts platzieren.')]));
      wrap.appendChild(row);
    });
    return wrap;
  }

  // NEU: Fachmedien für Gastbeiträge und PR (result.trade_media). Kommen aus einer gepflegten Branchenliste (per Google-Suche geprüft,
  // ob das Medium über das Thema schreibt) und optional aus Link-Lücken. Sie müssen nicht von KI-Assistenten zitiert werden.
  function renderTradeMedia(tm) {
    if (!tm || ((!tm.items || tm.items.length === 0) && !tm.note)) return null;
    var box = el('div', { class: 'cvz-cs-trade-media' });
    box.appendChild(el('h5', {}, ['Fachmedien für Gastbeiträge und PR']));
    if (tm.note) box.appendChild(el('p', { class: 'cvz-cs-hint' }, [tm.note]));
    (tm.items || []).forEach(function (it) {
      var head = el('p', { class: 'cvz-cs-goal-line' }, [
        el('strong', {}, [it.name + (it.name !== it.domain ? ' (' + it.domain + ')' : '')]), ' ',
        el('span', { class: 'cvz-cs-badge' }, [it.kind_label]),
        it.basis === 'backlinks' ? ' ' : '', it.basis === 'backlinks' ? el('span', { class: 'cvz-cs-badge' }, ['aus Link-Lücken']) : '',
        it.cited_prompts ? ' ' : '', it.cited_prompts ? el('span', { class: 'cvz-cs-badge cvz-cs-funnel-status--ok' }, ['in KI-Antworten zitiert']) : '', // NEU
        it.country ? ' ' : '', it.country ? el('span', { class: 'cvz-cs-badge' }, [it.country === 'at' ? 'Österreich' : 'Schweiz']) : '', // NEU
      ]);
      var card = el('div', { class: 'cvz-cs-goal-block' }, [head]);
      card.appendChild(el('p', { class: 'cvz-cs-hint' }, [it.evidence + (it.example_title ? ' Beispiel: „' + it.example_title + '“' : '')]));
      card.appendChild(el('p', { class: 'cvz-cs-goal-line' }, [it.action]));
      card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Aufwand: ' + it.effort + (it.branch_label ? ' · Branche: ' + it.branch_label : '')]));
      box.appendChild(card);
    });
    if (tm.branches && tm.branches.length) box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Geprüfte Branchen: ' + tm.branches.join(', ') + '. Die Liste der Medien wird von Convertlyze gepflegt.']));
    return box;
  }

  function renderOffsiteSection(measures, sources) {
    var hasM = measures && measures.length > 0;
    var hasS = sources && sources.length > 0;
    if (!hasM && !hasS) return null;
    var box = el('div', { class: 'cvz-cs-geo' });
    box.appendChild(el('h5', {}, ['Off-Site: wo KI-Assistenten stattdessen hinschauen']));
    box.appendChild(el('p', { class: 'cvz-cs-hint' }, [
      'Bei diesen Fragen wird statt deiner Domain immer wieder dieselbe fremde Quelle zitiert. Eine Platzierung dort kann mehr bringen als eine weitere eigene Seite. Ob das klappt, ist eine Vermutung.',
    ]));
    if (hasS) box.appendChild(renderOffsiteSources(sources));
    if (hasM) box.appendChild(el('h5', {}, ['Vorgeschlagene Maßnahmen']));
    else box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Für keine dieser Quellen schlagen wir eine Maßnahme vor.']));
    (measures || []).forEach(function (m) {
      var card = el('div', { class: 'cvz-cs-page-card' });
      card.appendChild(el('div', { class: 'cvz-cs-page-card-badges' }, [
        el('span', { class: 'cvz-cs-badge' }, [offsiteKindLabel(m)]),
        m.domain_type ? el('span', { class: 'cvz-cs-badge' }, [DOMAIN_TYPE_LABELS[m.domain_type] || m.domain_type]) : null,
        el('span', { class: 'cvz-cs-badge' }, ['Aufwand ' + m.effort]),
      ]));
      var named = (m.portal && m.portal.label) || (m.platform && m.platform.label);
      card.appendChild(el('h4', { class: 'cvz-cs-page-card-topic' }, [named && named.toLowerCase() !== String(m.domain).toLowerCase() ? named + ' (' + m.domain + ')' : m.domain]));
      card.appendChild(el('p', {}, [m.action]));
      if (m.content_points && m.content_points.length > 0) {
        var cp = el('ul', { class: 'cvz-cs-brief-list' });
        m.content_points.forEach(function (pt) { cp.appendChild(el('li', {}, [pt])); });
        card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Das sollte der Inhalt beantworten:']));
        card.appendChild(cp);
      }
      if (m.link_target && m.link_target.page_topic) {
        card.appendChild(el('p', { class: 'cvz-cs-offsite-target' }, [
          'Verweist auf deine Seite: ' + m.link_target.page_topic +
          (m.link_target.embed ? ' (dort auch einbinden)' : '') +
          (m.link_target.matched_prompts === 0 ? ' · keine Seite beantwortet dieselben Fragen, deshalb die Conversion-Seite' : ''),
        ]));
      }
      card.appendChild(el('p', { class: 'cvz-cs-evidence' }, ['Beleg: ' + m.basis]));
      if (m.hypothesis) card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Vermutung: ' + m.hypothesis]));
      if (OFFSITE_KIND_NOTES[m.kind]) card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Wichtig: ' + OFFSITE_KIND_NOTES[m.kind]]));
      if (m.cited_examples && m.cited_examples.length > 0) {
        var ex = el('ul', { class: 'cvz-cs-brief-list cvz-cs-offsite-examples' });
        m.cited_examples.forEach(function (e) {
          var href = safeHttpUrl(e.url);
          var text = e.title || e.url;
          var count = e.runs ? ' (in ' + e.runs + (e.runs === 1 ? ' Antwort' : ' Antworten') + ' zitiert)' : '';
          ex.appendChild(el('li', {}, [href ? el('a', { href: href, target: '_blank', rel: 'noopener noreferrer nofollow' }, [text]) : text, count]));
        });
        card.appendChild(el('details', { class: 'cvz-cs-expand' }, [el('summary', {}, ['Aufklappen: dort heute zitiert (' + m.cited_examples.length + ')']), ex]));
      }
      if (m.prompts && m.prompts.length > 0) {
        var l = el('ul', { class: 'cvz-cs-brief-list' });
        m.prompts.forEach(function (pr) { l.appendChild(el('li', {}, ['"' + pr + '"'])); });
        card.appendChild(el('details', { class: 'cvz-cs-expand' }, [el('summary', {}, ['Aufklappen: betroffene Fragen (' + m.prompts.length + ')']), l]));
      }
      box.appendChild(card);
    });
    return box;
  }

  // GEÄNDERT (Sichtbarkeit Google und KI): Die GEO-Darstellung ist in Teile zerlegt, die der Abschnitt "Sichtbarkeit" nach drei Fragen ordnet
  // (Wo stehst du? Wer wird stattdessen gezeigt? Was ihr tut). Jeder Teil sagt, ob er Google oder KI-Antworten betrifft.
  // NEU: Zu welcher Suchanfrage gehören die Google-Daten? Neue Berichte speichern sie (serp_keyword), ältere nicht: Dann ist es laut
  // Arbeitsanweisung das Kernthema, und das steht ausdrücklich so da.
  function geoSerpQuery(geo, result) {
    if (geo && geo.serp_keyword) return { text: geo.serp_keyword, exact: true, date: geo.serp_measured_at || null };
    var topic = result && (result.seed_topic || (result.topic_validation && result.topic_validation.seed_topic));
    return topic ? { text: topic, exact: false, date: null } : null;
  }
  // GEÄNDERT: Das Keyword steht jetzt in den Überschriften (Block, AI Overview, Top-Ergebnisse). Diese Zeile sagt nur noch, woher die Daten stammen.
  function geoQuoted(q) { return q ? '„' + q.text + '“' : ''; }
  function geoQueryLine(geo, result) {
    var q = geoSerpQuery(geo, result);
    if (!q) return null;
    var when = q.date ? ', abgerufen am ' + new Date(q.date).toLocaleDateString('de-DE') : '';
    return el('p', { class: 'cvz-cs-vis-query' }, [
      q.exact
        ? 'Eine Google-Suche nach ' + geoQuoted(q) + ' in Deutschland' + when + '. Alles in diesem Block stammt aus dieser einen Suche.'
        : 'Ältere Berichte haben die genaue Suchanfrage nicht gespeichert. Laut Vorgabe ist es das Kernthema ' + geoQuoted(q) + '.',
      tip('Für andere Formulierungen kann Google andere Seiten zeigen. Die Spalte „Titel der Seite“ zeigt den Titel des Treffers, nicht das Keyword.', 'Woher stammen die Ergebnisse?'),
    ]);
  }
  function geoAioBlock(geo, q) {
    var aio = geo && geo.ai_overview;
    if (!aio) return null;
    var aioBox = el('div', { class: 'cvz-cs-aio' });
    var aioTitle = 'AI Overview' + (q ? ' zu ' + geoQuoted(q) : '');
    if (!aio.present) {
      aioBox.appendChild(el('h5', {}, [aioTitle]));
      aioBox.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Kein AI Overview für dieses Thema vorhanden.']));
    } else if (!aio.references || aio.references.length === 0) {
      aioBox.appendChild(el('h5', {}, [aioTitle]));
      aioBox.appendChild(el('p', { class: 'cvz-cs-gsc-hint' }, ['AI Overview vorhanden, aber ohne zitierte Quellen-Links - Hinweis auf Commodity-Charakter dieses Themas.']));
    } else {
      aioBox.appendChild(el('h5', {}, [aioTitle + ': diese Quellen werden zitiert' + (aio.own_domain_cited ? ' (eure Domain ist dabei)' : ' (eure Domain fehlt noch)')]));
      var aioList = el('ul', {});
      aio.references.forEach(function (r) {
        aioList.appendChild(el('li', {}, [el('a', { href: r.url, target: '_blank', rel: 'noopener' }, [r.domain]), r.title ? ' – "' + r.title + '"' : '']));
      });
      aioBox.appendChild(aioList);
    }
    return aioBox;
  }
  // GEÄNDERT: DataForSEO liefert bei manchen Treffern eine Google-Weiterleitung (google.com/goto?url=...) statt der Zieladresse. Das sind echte
  // Wettbewerber, der Link führt beim Klick auf die richtige Seite. Neue Berichte haben die erkannte Domain (Server: resolveSerpTarget), ältere
  // zeigen "Domain nicht erkannt" statt "google.com". Der Seitentitel steht immer dabei.
  function geoIsGoogleRedirect(r) {
    try { var u = new URL(r.url); return /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(u.hostname) && /^\/(goto|url)\b/.test(u.pathname); } catch (e) { return false; }
  }
  function geoSerpDomain(r) { return geoIsGoogleRedirect(r) && /google\./i.test(r.domain || '') ? 'Domain nicht erkannt' : r.domain; }
  // GEÄNDERT: Tabelle mit Spaltenköpfen, damit klar ist, dass der graue Text der Seitentitel ist und nicht das Keyword.
  function geoSerpBlock(geo, q) {
    if (!geo || !geo.top_serp_results || geo.top_serp_results.length === 0) return null;
    var table = el('table', { class: 'cvz-cs-table cvz-cs-table-cards cvz-cs-serp-table' });
    table.appendChild(el('thead', {}, [el('tr', {}, [el('th', {}, ['Platz']), el('th', {}, ['Website']), el('th', {}, ['Titel der Seite'])])]));
    var tbody = el('tbody');
    var unknown = 0;
    geo.top_serp_results.forEach(function (r) {
      var dom = geoSerpDomain(r);
      if (dom === 'Domain nicht erkannt') unknown++;
      tbody.appendChild(el('tr', {}, [
        el('td', { 'data-label': 'Platz' }, [String(r.position)]),
        el('td', { 'data-label': 'Website' }, [el('a', { href: r.url, target: '_blank', rel: 'noopener' }, [dom])]),
        el('td', { 'data-label': 'Titel der Seite' }, [r.title || '']),
      ]));
    });
    table.appendChild(tbody);
    var box = el('div', {}, [el('h5', {}, ['Top-Ergebnisse bei Google' + (q ? ' für ' + geoQuoted(q) : '') + ' (organisch)']), el('div', { class: 'cvz-cs-table-wrap' }, [table])]);
    if (unknown > 0) box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Bei ' + unknown + (unknown === 1 ? ' Treffer' : ' Treffern') + ' liefert Google nur eine Weiterleitung, die Domain ist deshalb nicht erkennbar. Der Titel zeigt, um welche Seite es geht, der Link führt zur Seite.']));
    return box;
  }
  function geoCompetitorBlock(geo) {
    if (!geo || !geo.competitor_content_notes || geo.competitor_content_notes.length === 0) return null;
    var compList = el('ul', {});
    geo.competitor_content_notes.forEach(function (c) {
      compList.appendChild(el('li', {}, [el('a', { href: c.url, target: '_blank', rel: 'noopener' }, [c.domain]), ': ' + c.structure_summary]));
    });
    return el('div', {}, [el('h5', {}, ['Was Wettbewerber-Seiten konkret enthalten']), compList]);
  }
  // GEÄNDERT: Grundlage nennen (wie viele KI-Antworten auf Fragen mit dem Begriff), Spalten verständlich benennen, allgemeine Plattformen
  // kennzeichnen. Ältere Berichte haben keine Grundlage: Ihre Liste zählt alle Antworten, in denen die Wörter irgendwo vorkommen.
  var GEO_GENERAL_PLATFORMS = ['youtube.com', 'wikipedia.org', 'linkedin.com', 'facebook.com', 'instagram.com', 'reddit.com', 'x.com', 'twitter.com', 'tiktok.com', 'pinterest.com', 'quora.com', 'amazon.de', 'amazon.com', 'apps.apple.com', 'play.google.com'];
  function geoIsGeneralPlatform(p) {
    if (p.general_platform) return true;
    var d = String(p.domain || '').toLowerCase().replace(/^www\./, '');
    return GEO_GENERAL_PLATFORMS.some(function (x) { return d === x || d.slice(-x.length - 1) === '.' + x; });
  }
  function geoPortalsBlock(geo, result) {
    if (!geo) return null;
    var q = geoSerpQuery(geo, result);
    var basis = geo.portals_basis || null;
    var box = el('div', {}, [el('h5', {}, ['Welche Domains Googles KI-Antworten als Quelle nennen' + (geo.own_domain_already_cited ? ' (eure Domain ist dabei)' : '')])]);
    if (basis) {
      box.appendChild(el('p', { class: 'cvz-cs-vis-query' }, [
        'Grundlage: ' + basis.answers.toLocaleString('de-DE') + ' KI-Antworten von Google (AI Overviews, Deutschland), bei denen ' + (q ? geoQuoted(q) : 'der Begriff') + ' in der Frage des Nutzers steht' +
          (basis.ai_search_volume ? ', zusammen ca. ' + basis.ai_search_volume.toLocaleString('de-DE') + ' Suchanfragen pro Monat' : '') + '.' +
          (basis.answers > 0 && basis.answers < 20 ? ' Kleine Stichprobe, vorsichtig lesen.' : ''),
        tip('Der Datenanbieter wertet laufend Googles KI-Antworten aus. Gezählt wird, in wie vielen dieser Antworten eine Domain als Quelle verlinkt ist. Das sind nicht eure eigenen Testfragen, die stehen weiter unten.', 'Wie entstehen die Zahlen?'),
      ]));
    } else if (geo.top_portals && geo.top_portals.length > 0) {
      box.appendChild(el('p', { class: 'cvz-cs-gsc-hint' }, ['Älterer Bericht: Diese Liste zählt alle KI-Antworten, in denen die Wörter irgendwo vorkommen, auch zu fremden Themen (zum Beispiel Aktien). Deshalb stehen dort oft Finanzportale und allgemeine Plattformen. Für die Strategie nur eingeschränkt aussagekräftig. Ein neuer Lauf zählt nur Antworten auf passende Fragen.']));
    }
    if (geo.top_portals && geo.top_portals.length > 0) {
      var table = el('table', { class: 'cvz-cs-table cvz-cs-table-cards cvz-cs-portal-table' });
      table.appendChild(el('thead', {}, [el('tr', {}, [el('th', {}, ['Domain']), el('th', {}, [basis ? 'Als Quelle zitiert' : 'Erwähnungen']), el('th', {}, ['Suchanfragen hinter diesen Antworten']), el('th', {}, ['Einordnung'])])]));
      var tbody = el('tbody');
      geo.top_portals.forEach(function (p) {
        var general = geoIsGeneralPlatform(p);
        var kind = [];
        if (general) kind.push(el('span', { class: 'cvz-cs-badge' }, ['Allgemeine Plattform']));
        if (p.note) kind.push((kind.length ? ' ' : '') + p.note);
        tbody.appendChild(el('tr', { class: general ? 'cvz-cs-portal-general' : '' }, [
          el('td', { 'data-label': 'Domain' }, [p.domain]),
          el('td', { 'data-label': basis ? 'Als Quelle zitiert' : 'Erwähnungen' }, [basis ? 'in ' + p.mention_count + ' von ' + basis.answers + ' Antworten' : String(p.mention_count) + '×']),
          el('td', { 'data-label': 'Suchanfragen hinter diesen Antworten' }, [typeof p.ai_search_volume === 'number' ? 'ca. ' + p.ai_search_volume.toLocaleString('de-DE') + ' pro Monat' : 'nicht ermittelt']),
          el('td', { 'data-label': 'Einordnung' }, kind.length ? kind : ['']),
        ]));
      });
      table.appendChild(tbody);
      box.appendChild(el('div', { class: 'cvz-cs-table-wrap' }, [table]));
      if (geo.top_portals.some(geoIsGeneralPlatform)) box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Allgemeine Plattformen wie YouTube oder Wikipedia werden zu fast jedem Thema zitiert. Sie sind keine Themen-Wettbewerber, zeigen aber, welches Format gefragt ist (zum Beispiel Video).']));
    } else {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, [basis && basis.answers === 0
        ? 'Keine KI-Antworten von Google gefunden, bei denen ' + (q ? geoQuoted(q) : 'der Begriff') + ' in der Frage steht. Das Thema ist für diese Auswertung zu klein oder zu neu. Daraus folgt nichts über eure Chancen.'
        : 'Keine zitierten Domains gefunden oder Daten nicht verfügbar.']));
    }
    return box;
  }
  function geoPromptTestsBlock(geo) {
    if (!geo || !geo.prompt_tests || geo.prompt_tests.length === 0) return null;
    var ptList = el('ul', {});
    geo.prompt_tests.forEach(function (r) {
      var citedText = r.cited_domains && r.cited_domains.length > 0 ? r.cited_domains.join(', ') : 'keine zitierten Domains gefunden';
      var providerLabel = r.llm_type ? GEO_LLM_TYPE_LABELS[r.llm_type] || r.llm_type : null;
      var modelText = r.model_name ? ' [' + (providerLabel ? providerLabel + ', Modell: ' : 'Modell: ') + r.model_name + ']' : providerLabel ? ' [' + providerLabel + ']' : '';
      ptList.appendChild(el('li', {}, ['"' + r.prompt + '"' + modelText + ': eigene Domain zitiert: ' + (r.own_domain_cited ? 'ja' : 'nein') + ' · zitierte Domains: ' + citedText]));
    });
    return el('div', {}, [el('h5', {}, ['Eure Testfragen: wer in der Antwort zitiert wird']), el('p', { class: 'cvz-cs-hint' }, ['Jede Zeile ist eine Frage, die wir der KI gestellt haben, mit den Domains, die die Antwort als Quelle nennt.']), ptList]);
  }

  // Ein Block mit Kennzeichnung der Quelle (Google oder KI-Antworten), damit eine Momentaufnahme aus ChatGPT nicht wie ein Ranking gelesen wird.
  function visBlock(source, title, children) {
    var kids = (children || []).filter(Boolean);
    var box = el('div', { class: 'cvz-cs-vis-block cvz-cs-vis-' + source }, [
      el('div', { class: 'cvz-cs-vis-head' }, [el('span', { class: 'cvz-cs-badge cvz-cs-vis-src' }, [source === 'google' ? 'Google' : (source === 'ki' ? 'KI-Antworten' : 'Beides')]), el('strong', {}, [title])]),
    ]);
    if (kids.length === 0) box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Für diesen Bericht liegen dazu keine Daten vor.']));
    kids.forEach(function (k) { box.appendChild(k); });
    return box;
  }

  // NEU: Abschnitt "Sichtbarkeit: Google und KI-Antworten". Früher verteilt auf GEO-Strategie (mit SEO-Teilen) und den eingeklappten Ist-Zustand.
  function renderVisibilityOverview(result, session) {
    var geo = result.geo_strategy || null;
    var out = [];
    out.push(el('p', { class: 'cvz-cs-hint' }, ['Google und KI-Antworten messen Verschiedenes: Bei Google sind es Positionen, bei ChatGPT und Gemini Erwähnungen in Antworten, die von Mal zu Mal schwanken. Jeder Block sagt deshalb, woher er stammt.']));
    out.push(el('h4', { class: 'cvz-cs-vis-q' }, ['1. Wo stehst du heute?']));
    out.push(el('div', { class: 'cvz-cs-vis-grid' }, [
      visBlock('google', 'Wofür eure Domain heute rankt', [renderCurrentStateSection(result.current_state)]),
      visBlock('ki', 'Wirst du in KI-Antworten genannt?', [renderVisibilitySection(session)]),
    ]));
    out.push(el('h4', { class: 'cvz-cs-vis-q' }, ['2. Wer wird stattdessen gezeigt?']));
    var q2 = geoSerpQuery(geo, result); // NEU: Keyword in den Überschriften statt versteckt in einer Zeile
    out.push(visBlock('google', q2 ? 'Google-Suche nach ' + geoQuoted(q2) : 'Suchergebnisse und AI Overview', [geoQueryLine(geo, result), geoAioBlock(geo, q2), geoSerpBlock(geo, q2), geoCompetitorBlock(geo)]));
    out.push(visBlock('ki', q2 ? 'Googles KI-Antworten rund um ' + geoQuoted(q2) + ' und eure Testfragen' : 'Quellen, die KI-Assistenten zitieren', [geoPortalsBlock(geo, result), geoPromptTestsBlock(geo)]));
    out.push(el('h4', { class: 'cvz-cs-vis-q' }, ['3. Was ihr tut']));
    out.push(visBlock('beides', 'Auf euren Seiten: Formate mit Chancen, zitiert zu werden', [
      geo && geo.citation_strategy_note ? renderProse(geo.citation_strategy_note, 'cvz-cs-citation-note') : null,
      el('p', { class: 'cvz-cs-hint' }, ['Welche Seiten das umsetzen, steht im Content-Plan.']),
    ]));
    var off = renderOffsiteSection(result.offsite_measures, result.offsite_sources);
    out.push(visBlock('ki', 'Außerhalb eurer Seiten: Off-Site-Maßnahmen', [off || el('p', { class: 'cvz-cs-hint' }, ['Keine Off-Site-Maßnahmen für dieses Thema.']), renderTradeMedia(result.trade_media)])); // NEU: Fachmedien
    return out;
  }

  var ROADMAP_BUCKETS = [
    { key: 'sofort_umsetzen', label: 'Sofort umsetzen', badgeClass: 'cvz-cs-badge-roadmap-urgent' },
    { key: 'quick_wins', label: 'Quick Wins', badgeClass: 'cvz-cs-badge-roadmap-quick' },
    { key: 'als_naechstes', label: 'Als Nächstes', badgeClass: 'cvz-cs-badge-roadmap-next' },
    { key: 'spaeter', label: 'Später', badgeClass: 'cvz-cs-badge-roadmap-later' },
  ];

  // NEU (Roadmap verlinkt den Content-Plan): Karte einer Seite öffnen und hinscrollen. Im Diagramm-Modus erst zur Liste wechseln.
  function openPageCard(ref) {
    if (typeof state.showPlanView === 'function') state.showPlanView('list');
    var root = state.root || document;
    var target = ref === -1 ? root.querySelector('.cvz-cs-conversion-card') : root.querySelector('details.cvz-cs-page-acc[data-ref="' + ref + '"]');
    if (!target) return;
    if (target.tagName === 'DETAILS') target.open = true;
    var phaseGroup = target.closest ? target.closest('.cvz-cs-phase-group') : null;
    if (phaseGroup) phaseGroup.style.display = '';
    target.style.display = '';
        var offset = anchorNavHeight() + getSiteNavHeight() + 12;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    target.classList.add('cvz-cs-flash');
    setTimeout(function () { target.classList.remove('cvz-cs-flash'); }, 1600);
  }

  function renderRoadmapSection(roadmap, result) {
    var box = el('div', { class: 'cvz-cs-roadmap' });
    if (!roadmap) return box;
    var hasAnyItem = ROADMAP_BUCKETS.some(function (b) { return roadmap[b.key] && roadmap[b.key].length > 0; });
    if (!hasAnyItem) {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine priorisierten Punkte für diesen Cluster.']));
      return box;
    }
    // GEÄNDERT (wie im LP-Report): Gruppen sind aufklappbar, mit Anzahl im Kopf. "Sofort umsetzen" ist offen,
    // die übrigen zu. Gibt es kein "Sofort umsetzen", ist die erste vorhandene Gruppe offen.
    var firstOpenDone = false;
    ROADMAP_BUCKETS.forEach(function (bucket) {
      var items = roadmap[bucket.key];
      if (!items || items.length === 0) return;
      var group = el('details', { class: 'cvz-cs-roadmap-group cvz-cs-fold cvz-cs-roadmap-fold' });
      if (!firstOpenDone) { group.open = true; firstOpenDone = true; }
      group.appendChild(el('summary', {}, [
        el('span', { class: 'cvz-cs-badge ' + bucket.badgeClass }, [bucket.label]),
        el('span', { class: 'cvz-cs-roadmap-count' }, ['(' + items.length + ')']),
      ]));
      var list = el('ul', { class: 'cvz-cs-roadmap-list' });
      items.forEach(function (item) {
        var li = el('li', { class: 'cvz-cs-roadmap-item' }, [
          el('p', { class: 'cvz-cs-roadmap-item-title' }, [item.titel]),
          renderProse(item.begruendung, 'cvz-cs-roadmap-item-reason'),
        ]);
        // NEU: Sprung zur Seite im Content-Plan (page_refs, vom Server geprüft)
        var refs = (item.page_refs || []).filter(function (r) { return r === -1 ? !!(result && result.conversion_page) : !!(result && result.supporting_pages && result.supporting_pages[r]); });
        if (refs.length > 0) {
          var links = el('p', { class: 'cvz-cs-roadmap-pages' }, ['Im Content-Plan: ']);
          refs.forEach(function (r, idx) {
            var name = r === -1 ? result.conversion_page.topic + ' (Conversion-Seite)' : result.supporting_pages[r].topic;
            var a = el('a', { href: '#', class: 'cvz-cs-roadmap-link' }, ['→ ' + name]);
            a.addEventListener('click', function (e) { e.preventDefault(); openPageCard(r); });
            if (idx > 0) links.appendChild(document.createTextNode(' · '));
            links.appendChild(a);
          });
          li.appendChild(links);
        }
        list.appendChild(li);
      });
      group.appendChild(list);
      box.appendChild(group);
    });
    return box;
  }

  // ==================== REPORT-CHAT ====================
  function stopChatPolling() {
    if (state.chat.pollHandle) {
      clearTimeout(state.chat.pollHandle);
      state.chat.pollHandle = null;
    }
  }

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

  function renderMarkdownInto(container, text) {
    var str = scrubProviderNames(String(text || ''));
    if (typeof marked !== 'undefined') {
      container.innerHTML = marked.parse(str);
      cvzCsLabelTablesForCards(container);
    } else {
      str.split(/\n\s*\n/).forEach(function (para) {
        if (para.trim()) container.appendChild(el('p', {}, [para.trim()]));
      });
    }
  }

  function renderChatMessageBubble(message) {
    var bubble = el('div', { class: 'cvz-cs-chat-msg cvz-cs-chat-msg-' + message.role });
    if (message.role === 'assistant') {
      renderMarkdownInto(bubble, message.content);
    } else {
      bubble.textContent = message.content;
    }
    return bubble;
  }

  function refreshChatMessagesView() {
    var listEl = chatQ('.cvz-cs-chat-messages');
    var counterEl = chatQ('.cvz-cs-chat-counter');
    if (listEl) {
      clear(listEl);
      if (state.chat.messages.length === 0 && !state.chat.sending) {
        listEl.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Noch keine Fragen gestellt - frag zum Beispiel, warum eine bestimmte Seite empfohlen wurde.']));
      } else {
        state.chat.messages.forEach(function (m) { listEl.appendChild(renderChatMessageBubble(m)); });
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
    var formEl = chatQ('.cvz-cs-chat-form');
    var limitNoticeEl = chatQ('.cvz-cs-chat-limit-notice');
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
          state.chat.messages.push({ role: 'user', content: state.chat._pendingUserMessage });
          state.chat.messages.push({ role: 'assistant', content: job.reply });
          state.chat.messagesUsed = job.messages_used;
          state.chat.messagesLimit = job.messages_limit;
          finishChatSending(null);
        })
        .catch(function (err) { finishChatSending('Antwort konnte nicht abgerufen werden: ' + err.message); });
    }
    tick();
  }

  function finishChatSending(errorMessage) {
    stopChatPolling();
    state.chat.sending = false;
    state.chat._pendingUserMessage = null;
    var statusEl = chatQ('.cvz-cs-chat-status');
    if (statusEl) statusEl.textContent = errorMessage || '';
    var sendBtn = chatQ('.cvz-cs-chat-send-btn');
    var inputEl = chatQ('.cvz-cs-chat-input');
    if (sendBtn) sendBtn.removeAttribute('disabled');
    if (inputEl) inputEl.removeAttribute('disabled');
    refreshChatMessagesView();
  }

  function sendChatMessage(sessionId, text) {
    if (state.chat.sending) return;
    state.chat.sending = true;
    state.chat._pendingUserMessage = text;
    var sendBtn = chatQ('.cvz-cs-chat-send-btn');
    var inputEl = chatQ('.cvz-cs-chat-input');
    if (sendBtn) sendBtn.setAttribute('disabled', 'disabled');
    if (inputEl) inputEl.setAttribute('disabled', 'disabled');
    var statusEl = chatQ('.cvz-cs-chat-status');
    if (statusEl) statusEl.textContent = '';
    refreshChatMessagesView();
    apiFetch('/api/content-strategy/' + encodeURIComponent(sessionId) + '/chat', {
      method: 'POST',
      body: JSON.stringify({ message: text }),
    })
      .then(function (res) { pollChatStatus(res.turn_id); })
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

  // NEU: Der Chat steht im Panel am body, nicht mehr in state.root. Alle Chat-Elemente werden dort gesucht.
  function chatQ(sel) {
    var scope = (state.chatPanel && state.chatPanel.el) || state.root;
    return scope ? scope.querySelector(sel) : null;
  }

  function chatIcon() {
    var svg = svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }));
    return svg;
  }

  // NEU: Panel mit dem Chat. Desktop von rechts, Handy von unten (CSS). Öffnen mit Vorschlag füllt nur das Eingabefeld,
  // abgeschickt wird erst auf Klick, weil jede Frage vom Kontingent abgeht.
  function createChatPanel(sessionId) {
    var portal = document.getElementById('cvz-cs-portal');
    if (portal) portal.parentNode.removeChild(portal);
    portal = el('div', { id: 'cvz-cs-portal' });
    var backdrop = el('div', { class: 'cvz-cs-chat-backdrop' });
    var closeBtn = el('button', { type: 'button', class: 'cvz-cs-chat-panel-close', 'aria-label': 'Schließen' }, ['×']);
    var panel = el('aside', { class: 'cvz-cs-chat-panel', role: 'dialog', 'aria-label': 'Fragen zum Bericht', 'aria-hidden': 'true' }, [
      el('div', { class: 'cvz-cs-chat-panel-head' }, [el('p', { class: 'cvz-cs-chat-panel-title' }, ['Fragen zum Bericht']), closeBtn]),
      el('div', { class: 'cvz-cs-chat-panel-body' }, [renderChatSection(sessionId, { inPanel: true })]),
    ]);
    portal.appendChild(backdrop);
    portal.appendChild(panel);
    document.body.appendChild(portal);
    var lastFocus = null;
    var api = { el: portal, isOpen: false };
    function onKey(e) { if (e.key === 'Escape' && api.isOpen) api.close(); }
    api.open = function (prefill) {
      lastFocus = document.activeElement;
      panel.style.top = getSiteNavHeight() + 'px'; // Desktop: unter der Website-Navigation (Handy: per CSS unten)
      panel.classList.add('is-open');
      backdrop.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
      api.isOpen = true;
      var input = panel.querySelector('.cvz-cs-chat-input');
      if (input && !input.disabled) {
        if (prefill) {
          input.value = prefill;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        setTimeout(function () {
          try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
          var end = input.value.length;
          if (typeof input.setSelectionRange === 'function') input.setSelectionRange(end, end);
        }, 30);
      }
    };
    api.close = function () {
      panel.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
      api.isOpen = false;
      if (lastFocus && typeof lastFocus.focus === 'function' && document.body.contains(lastFocus)) {
        try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* egal */ }
      }
    };
    api.destroy = function () {
      document.removeEventListener('keydown', onKey);
      stopChatPolling();
      if (portal.parentNode) portal.parentNode.removeChild(portal);
    };
    closeBtn.addEventListener('click', function () { api.close(); });
    backdrop.addEventListener('click', function () { api.close(); });
    document.addEventListener('keydown', onKey);
    return api;
  }

  // NEU: Einstieg am Ende des Berichts (früher stand hier der ganze Chat)
  function renderChatTeaser() {
    var btn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['Frage stellen']);
    btn.addEventListener('click', function () { if (state.chatPanel) state.chatPanel.open(); });
    return el('div', { class: 'cvz-cs-chat-teaser' }, [
      el('div', {}, [
        el('h4', { class: 'cvz-cs-chat-title' }, ['Fragen zum Bericht']),
        el('p', { class: 'cvz-cs-hint' }, ['Frag zum Beispiel, warum eine Seite empfohlen wurde. Der Chat kennt diesen Bericht und ist oben in der Leiste jederzeit erreichbar.']),
      ]),
      btn,
    ]);
  }

  // NEU: "Nachfragen" direkt dort, wo die Frage entsteht. Öffnet das Panel mit vorformulierter Frage. Ohne Chat (geteilter Bericht): nichts.
  function renderAskLink(label, question) {
    if (!state.chatPanel) return null;
    var btn = el('button', { type: 'button', class: 'cvz-cs-ask-link' }, [chatIcon(), label]);
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (state.chatPanel) state.chatPanel.open(question); });
    return btn;
  }

  function renderChatSection(sessionId, opts) {
    opts = opts || {};
    var section = el('div', { class: 'cvz-cs-chat' });
    if (!opts.inPanel) section.appendChild(el('h4', { class: 'cvz-cs-chat-title' }, ['Fragen zum Report']));
    section.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Frag zum Beispiel, warum eine Seite empfohlen wurde.', tip('Der Agent kennt diesen Report und kann bei Bedarf auch neue Daten live nachschlagen (kein erneuter GEO-Prompt-Test).', 'Was kann der Agent?')]));
    section.appendChild(el('div', { class: 'cvz-cs-chat-messages' }, []));
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
      inputEl.style.height = '';
      sendChatMessage(sessionId, text);
    }
    form.addEventListener('submit', function (event) { event.preventDefault(); trySend(); });
    inputEl.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); trySend(); }
    });
    // NEU: Feld wächst mit (bis 160 px), damit eine vorformulierte Frage aus "Nachfragen" ganz lesbar ist.
    inputEl.addEventListener('input', function () {
      inputEl.style.height = 'auto';
      if (inputEl.scrollHeight) inputEl.style.height = Math.min(inputEl.scrollHeight + 2, 160) + 'px';
    });
    section.appendChild(form);
    section.appendChild(el('p', { class: 'cvz-cs-chat-status', 'aria-live': 'polite' }, ['']));
    section.appendChild(el('p', { class: 'cvz-cs-chat-limit-notice cvz-cs-hint', style: 'display:none' }, ['Frage-Kontingent für diesen Report erreicht - für weitere Fragen bitte eine neue Strategie erstellen.']));
    section.appendChild(el('p', { class: 'cvz-cs-chat-counter cvz-cs-hint' }, ['']));
    loadChatHistory(sessionId);
    return section;
  }

  // ==== TOUCHPOINT-ANFANG ====
  // NEU (Touchpoint-Plan, nachgelagert): Abschnitt nach dem Bericht. Ablauf:
  //   1. Substanz-Inventar ausfüllen (Vorprüfung im Browser, spiegelt die Regeln des Servers),
  //   2. Lauf starten (POST /:id/touchpoint-plan), der Status steht in der Session, der Browser fragt GET /:id ab,
  //   3. Ergebnis: Gated-Content-Verdikt, Fakt "Nachfrage in der Suche" je Phase, Editor (Touchpoints und E-Mails
  //      nach dem Lead) und Export.
  // Der Plan ist kanalfrei: Der Kanal ist ein Freifeld, das die Nutzer im Editor setzen.
  // Benötigt aus dem Widget: el, clear, svgEl, apiFetch, state, flowNewId, flowClone, flowClamp, flowWrapText,
  // flowToCsv, flowDownload, flowSlug und die flow-CSS-Klassen. Der Editor-Zustand liegt getrennt vom Content Flow
  // (PUT /:id/touchpoints), der Bericht selbst wird dadurch nie verändert.
  var TP_PHASES = [
    { value: 'exploration', label: 'Erforschung' },
    { value: 'evaluation', label: 'Bewertung' },
    { value: 'comparison', label: 'Vergleich' },
    { value: 'decision', label: 'Entscheidung' },
  ];
  var TP_PHASE_COLORS = { exploration: '#3b82f6', evaluation: '#f59e0b', comparison: '#a78bfa', decision: '#34d399' };
  var TP_MAIL_COLOR = '#4fd1c5';
  var TP_FORMATS = [
    { id: 'text_hook', label: 'Kurzer Text mit Aufhänger' }, { id: 'kurzvideo', label: 'Kurzvideo' },
    { id: 'erklaervideo', label: 'Erklärvideo' }, { id: 'dokument', label: 'Dokument oder Carousel' },
    { id: 'case', label: 'Kundenfall' }, { id: 'vergleich', label: 'Gegenüberstellung' },
    { id: 'lead_formular', label: 'Formular mit Gegenwert' }, { id: 'webinar', label: 'Webinar' },
    { id: 'gespraech', label: 'Persönliches Gespräch oder Demo' }, { id: 'workshop', label: 'Workshop' },
    { id: 'einladung', label: 'Einladung' }, // älterer Plan
  ];
  var TP_ASSET_COLOR = '#e879f9';
  var TP_INV_KINDS = [
    { value: 'daten', label: 'Eigene Daten', hint: 'z. B. Auswertung von 140 Projekten aus 2019 bis 2025' },
    { value: 'fall', label: 'Kundenfall', hint: 'z. B. Umstellung in 9 Monaten, Betriebskosten um ein Drittel gesenkt' },
    { value: 'methode', label: 'Methode oder Erfahrungswerte', hint: 'z. B. Bewertungsraster mit 12 Kriterien, nach dem wir intern arbeiten' },
    { value: 'werkzeug', label: 'Vorhandenes Werkzeug', hint: 'z. B. Skript, das Berechtigungen in 12 Punkten prüft' },
  ];
  // NEU: Was eine Angabe je Art braucht, damit daraus Gated Content werden kann. Steht unter dem Beschreibungsfeld und wechselt mit der Art.
  var TP_INV_GUIDE = {
    daten: ['Was wurde ausgewertet oder gemessen (z. B. Laufzeit, Kosten, Fehlerquote)', 'Wie viel: Anzahl Projekte, Kunden oder Datensätze', 'Zeitraum (z. B. 2019 bis 2025)', 'Herkunft (z. B. eigene Projektdatenbank, Ticketsystem, Umfrage unter 80 Kunden)'],
    fall: ['Wer: Branche und Größe des Kunden (Name nur, wenn freigegeben)', 'Ausgangslage: welches Problem', 'Was ihr getan habt, in einem Satz', 'Ergebnis in Zahlen und in welcher Zeit (z. B. Kosten minus 30 Prozent in 9 Monaten)'],
    methode: ['Was die Methode entscheidet oder bewertet', 'Aufbau: Anzahl Kriterien oder Schritte', 'Wie oft schon angewendet (z. B. in 40 Projekten)', 'Was ein Kunde danach weiß, das er vorher nicht wusste'],
    werkzeug: ['Was es tut: welche Eingaben, welches Ergebnis', 'Zustand: fertig, intern im Einsatz oder nur Entwurf', 'Ob Kunden es selbst nutzen dürfen oder ihr es für sie ausführt'],
  };
  // Weiche Hinweise (blockieren nicht): machen eine Angabe stärker, sind aber keine Pflicht für den Server.
  function tpSoftHints(e) {
    var d = String(e.detail || '');
    var out = [];
    var hasPeriod = /(19|20)\d\d|\b\d+\s*(jahr|jahre|jahren|monat|monate|monaten|wochen|quartal)/i.test(d);
    if ((e.kind === 'daten' || e.kind === 'fall') && d.trim().length >= TP_DETAIL_MIN && !hasPeriod) out.push('Noch stärker mit einem Zeitraum (z. B. 2019 bis 2025 oder „in 9 Monaten“).');
    if (e.kind === 'fall' && d.trim().length >= TP_DETAIL_MIN && !/\d/.test(d)) out.push('Ein Ergebnis in Zahlen macht den Fall erst zum Beleg (z. B. „Kosten minus 30 Prozent“).');
    if (e.kind === 'methode' && d.trim().length >= TP_DETAIL_MIN && !/\d/.test(d)) out.push('Nenne den Umfang, z. B. Anzahl Kriterien oder wie oft ihr die Methode angewendet habt.');
    return out;
  }
  var TP_RELEASES = [
    { value: 'frei', label: 'Darf genannt werden' },
    { value: 'anonymisiert', label: 'Nur anonymisiert' },
    { value: 'nur_intern', label: 'Nur intern, nie nach draußen' },
  ];
  var TP_BASIS_LABELS = { messung: 'Aus der Messung', kundeneingabe: 'Aus deinen Angaben', annahme: 'Hypothese' };
  var TP_DEMAND_LABELS = { ja: 'Ja, messbar', nein: 'Kaum messbar', keine_seiten: 'Keine Seite' };
  var TP_DEMAND_MEANING = {
    ja: 'Hier suchen Interessenten selbst. Inhalte für die Suche und Suchanzeigen erreichen sie.',
    nein: 'Hier sucht kaum jemand selbst (nicht messbar). Erreiche Interessenten über Inhalte und Anzeigen aktiv, oder hole sie per Retargeting und E-Mail ab.',
    keine_seiten: 'Für diese Phase gibt es keine Seite in der Strategie, deshalb keine Aussage.',
  };
  var TP_LIMITS = { nodes: 60, edges: 150, label: 160, note: 600, channel: 60, entries: 12, title: 120, detail: 300, restrictions: 400, coord: 5000 };
  var TP_DETAIL_MIN = 25;
  var TP_NODE_W = 230;
  var TP_NODE_H = 100;
  var TP_GAP_X = 36;
  var TP_GAP_Y = 70;
  var TP_POLL_MS = 3000;
  var TP_STALE_MS = 8 * 60 * 1000; // wie im Backend: ein "läuft" älter als das gilt als abgebrochen

  function hasTouchpointSection(result, session) {
    return !!(session && session.id);
  }

  function tpPhaseLabel(value) {
    for (var i = 0; i < TP_PHASES.length; i++) if (TP_PHASES[i].value === value) return TP_PHASES[i].label;
    return '';
  }
  function tpFormatLabel(id) {
    for (var i = 0; i < TP_FORMATS.length; i++) if (TP_FORMATS[i].id === id) return TP_FORMATS[i].label;
    return id || '';
  }

  // ---------- Vorprüfung des Inventars (gleiche Regeln wie normalizeInventory im Backend) ----------
  function tpCheckEntry(e) {
    var detail = String(e.detail || '').trim();
    if (e.release === 'nur_intern') return { state: 'intern', text: 'Nicht nutzbar: nur intern freigegeben.' };
    if (detail.length < TP_DETAIL_MIN) return { state: 'vague', text: 'Zu knapp. Nenne Umfang, Zeitraum und Herkunft (mindestens ' + TP_DETAIL_MIN + ' Zeichen).' };
    if (e.kind === 'daten' && !/\d/.test(detail)) return { state: 'vague', text: 'Bei Daten fehlt ein Umfang oder Zeitraum, zum Beispiel Anzahl Projekte, Jahre oder Messpunkte.' };
    return { state: 'ok', text: e.release === 'anonymisiert' ? 'Nutzbar. Vor Veröffentlichung wird anonymisiert.' : 'Nutzbar.' };
  }

  function tpDraftKey(sessionId) { return 'cvz-cs-inventory-draft-' + sessionId; }
  function tpLoadDraft(sessionId) {
    try {
      var raw = localStorage.getItem(tpDraftKey(sessionId));
      var d = raw ? JSON.parse(raw) : null;
      if (d && Array.isArray(d.entries)) return d;
    } catch (e) { /* ohne Entwurf weiter */ }
    return null;
  }
  function tpSaveDraft(sessionId, data) {
    try { localStorage.setItem(tpDraftKey(sessionId), JSON.stringify(data)); } catch (e) { /* egal */ }
  }
  function tpClearDraft(sessionId) {
    try { localStorage.removeItem(tpDraftKey(sessionId)); } catch (e) { /* egal */ }
  }

  // Voraussetzungen für Gated Content, die der Hauptlauf bei seinen Lead-Magnet-Vorschlägen genannt hat (ohne Doppelte).
  function tpGateNeeds(result) {
    var seen = {};
    var out = [];
    ((result && result.lead_magnets) || []).forEach(function (m) {
      var g = m && m.gate_requirement;
      if (!g || !g.need) return;
      var text = (g.kind_label || g.kind) + ': ' + g.need;
      if (seen[text.toLowerCase()]) return;
      seen[text.toLowerCase()] = true;
      out.push(text);
    });
    return out.slice(0, 6);
  }

  function tpLine(label, text) {
    return el('p', { class: 'cvz-cs-magnet-line' }, [el('strong', {}, [label + ' ']), text]);
  }
  function tpList(items) {
    var ul = el('ul', { class: 'cvz-cs-brief-list' });
    items.forEach(function (t) { ul.appendChild(el('li', {}, [t])); });
    return ul;
  }

  // ==================== ABSCHNITT ====================
  function renderTouchpointSection(sessionId, result, session) {
    var root = el('div', { class: 'cvz-cs-tp' });
    var isCreator = !session || session.user_id === state.userId;
    var pollTimer = null;
    var startError = '';

    function stopPoll() { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }
    function jobOf() { return (session && session.touchpoint_job) || null; }
    function hasResult() { return !!(result.gated_content || result.touchpoint_plan); }

    function paint() {
      stopPoll();
      clear(root);
      if (hasResult()) { renderResult(); return; }
      var job = jobOf();
      var staleRunning = job && job.status === 'running' && job.started_at && Date.now() - new Date(job.started_at).getTime() >= TP_STALE_MS;
      if (job && job.status === 'running' && !staleRunning) { renderRunning(); poll(); return; }
      if (staleRunning && !startError) startError = 'Die letzte Erstellung wurde abgebrochen. Bitte starte sie erneut.';
      if (job && job.status === 'error' && !startError) startError = 'Die Erstellung ist fehlgeschlagen' + (job.error ? ': ' + job.error : '.') + ' Deine Angaben sind noch da, bitte starte erneut.';
      renderIntro();
    }

    function poll() {
      pollTimer = setTimeout(function () {
        if (!root.isConnected) return; // Bericht verlassen: nicht weiter abfragen
        apiFetch('/api/content-strategy/' + encodeURIComponent(sessionId))
          .then(function (fresh) {
            if (!fresh) return;
            session.touchpoint_job = fresh.touchpoint_job || null;
            var status = fresh.touchpoint_job && fresh.touchpoint_job.status;
            if (status === 'done' && fresh.result) {
              ['inventory', 'gated_content', 'touchpoint_plan', 'nurture_plan'].forEach(function (k) {
                if (fresh.result[k] !== undefined) result[k] = fresh.result[k]; else delete result[k];
              });
              session.touchpoint_diagram = fresh.touchpoint_diagram || null;
              tpClearDraft(sessionId);
              paint();
              return;
            }
            if (status === 'error') { paint(); return; }
            poll();
          })
          .catch(function () { poll(); }); // kurzer Netzausfall: weiter versuchen
      }, TP_POLL_MS);
    }

    // ---------- Einstieg und Inventar ----------
    function renderIntro() {
      root.appendChild(el('p', { class: 'cvz-cs-hint' }, [
        'Der Touchpoint-Plan zeigt, welche Information welche Rolle in welcher Phase braucht, damit aus Interessenten Leads werden, und was danach per E-Mail folgt. ' +
        'Er nennt keinen Kanal: Wo deine Zielgruppe erreichbar ist, entscheidest du im Editor. Gated Content, also Inhalt gegen E-Mail-Adresse, empfehlen wir nur, wenn du etwas hast, das es frei im Netz nicht gibt.',
      ]));
      if (!isCreator) {
        root.appendChild(el('p', { class: 'cvz-cs-callout' }, ['Den Touchpoint-Plan kann nur die Person erstellen, die diese Strategie angelegt hat.']));
        return;
      }
      if (startError) root.appendChild(el('div', { class: 'cvz-cs-error' }, [el('p', {}, [startError])]));
      // GEÄNDERT: Die Liste "Aus dem Bericht" steht jetzt im Formular, mit Knopf zum Vorbereiten eines Eintrags (siehe renderInventoryForm).
      root.appendChild(renderInventoryForm());
    }

    // GEÄNDERT: recheck = true für "Angaben ergänzen und Gated Content neu prüfen" nach dem Plan. Gleiches Formular, vorbelegt mit dem
    // bisherigen Inventar, eigener Entwurf, anderer Endpunkt (POST /:id/gated-content).
    function renderInventoryForm(recheck) {
      var wrap = el('div', { class: 'cvz-tp-form' });
      var draftId = recheck ? sessionId + '-recheck' : sessionId;
      var draft = tpLoadDraft(draftId);
      var prevInv = recheck && result.inventory ? result.inventory : null;
      var entries = draft && draft.entries.length ? draft.entries.slice(0, TP_LIMITS.entries)
        : prevInv ? (prevInv.entries || []).map(function (e) { return { kind: e.kind, title: e.title, detail: e.detail, release: e.release }; }).slice(0, TP_LIMITS.entries) : [];
      var restrictions = draft && draft.restrictions ? draft.restrictions : (prevInv && prevInv.restrictions) || '';
      if (!recheck) wrap.appendChild(el('h4', { class: 'cvz-cs-section-title' }, ['Was habt ihr, das andere nicht haben?']));
      wrap.appendChild(el('p', { class: 'cvz-cs-hint' }, [recheck
        ? 'Ergänze oder präzisiere eure Angaben so, wie oben unter „Das müsstet ihr liefern“ beschrieben. Geprüft wird nur der Gated-Content-Teil, Touchpoints und E-Mails bleiben, wie sie sind.'
        : 'Eigene Daten, Kundenfälle, Methoden oder Werkzeuge, die sich als Gegenwert für eine E-Mail-Adresse eignen. Je konkreter, desto besser: Umfang, Zeitraum, Herkunft. ' +
          'Hast du nichts davon, lass die Liste leer. Dann entsteht der Plan ohne Gated Content.',
      ]));
      // NEU: Was die Ideen aus dem Funnel-Abschnitt bräuchten, damit sie hinter einer E-Mail-Adresse gerechtfertigt wären
      var reqs = [];
      var reqSeen = {};
      (result.lead_magnets || []).forEach(function (m) {
        var gr = m && m.gate_requirement;
        if (!gr || !gr.need || reqSeen[gr.kind + '|' + gr.need]) return;
        reqSeen[gr.kind + '|' + gr.need] = true;
        reqs.push({ title: m.title, phase: tpPhaseLabel(m.phase), kind: gr.kind, kind_label: gr.kind_label, need: gr.need });
      });
      if (reqs.length > 0) {
        var reqBox = el('div', { class: 'cvz-tp-reqs cvz-tp-needs' }, [
          el('p', { class: 'cvz-cs-brief-label' }, ['Was eure Strategie dafür bräuchte']),
          el('p', { class: 'cvz-cs-hint' }, ['Für diese Ideen aus dem Funnel-Abschnitt wäre klar, welche Substanz sie tragen würde. Habt ihr etwas davon, bereite den Eintrag mit einem Klick vor und ergänze die Details.']),
        ]);
        reqs.slice(0, 5).forEach(function (q) {
          var prep = el('button', { type: 'button', class: 'cvz-cs-notplanned-btn' }, ['+ Als Eintrag vorbereiten']);
          prep.addEventListener('click', function () {
            addRow({ kind: q.kind, title: 'Grundlage für: ' + q.title, detail: '', release: 'anonymisiert', placeholder: q.need });
            refresh(); persist();
            var last = rows[rows.length - 1];
            if (last) { try { last.detail.focus(); } catch (e) { /* ohne Fokus weiter */ } }
          });
          reqBox.appendChild(el('div', { class: 'cvz-tp-req' }, [
            el('p', {}, [el('strong', {}, [q.title]), q.phase ? el('span', { class: 'cvz-cs-funnel-todo-meta' }, [q.phase + ' · ' + q.kind_label]) : null]),
            el('p', { class: 'cvz-cs-hint' }, ['Gebraucht wird: ' + q.need]),
            prep,
          ]));
        });
        wrap.appendChild(reqBox);
      }
      var list = el('div', {});
      var summary = el('p', { class: 'cvz-cs-hint cvz-tp-summary' });
      var warn = el('div', {});
      var formError = el('p', { class: 'cvz-cs-quota-empty' });
      var rows = [];

      function persist() {
        tpSaveDraft(draftId, { entries: collect(), restrictions: restrictionsInput.value });
      }
      function collect() {
        return rows.map(function (r) { return { kind: r.kind.value, title: r.title.value, detail: r.detail.value, release: r.release.value }; });
      }
      function refresh() {
        var data = collect();
        var usable = 0;
        data.forEach(function (e, i) {
          var c = tpCheckEntry(e);
          if (c.state === 'ok') usable++;
          rows[i].status.textContent = c.text;
          rows[i].status.className = 'cvz-tp-status cvz-tp-status-' + c.state;
          // NEU: Ausfüllhilfe je Art und weiche Hinweise
          clear(rows[i].guide);
          var g = TP_INV_GUIDE[e.kind] || [];
          rows[i].guide.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Damit daraus eine Empfehlung wird, beschreibe:']));
          rows[i].guide.appendChild(el('ul', {}, g.map(function (x) { return el('li', {}, [x]); })));
          tpSoftHints(e).forEach(function (h) { rows[i].guide.appendChild(el('p', { class: 'cvz-tp-soft' }, [h])); });
          rows[i].num.textContent = 'Eintrag ' + (i + 1);
        });
        addBtn.style.display = rows.length >= TP_LIMITS.entries ? 'none' : '';
        summary.textContent = rows.length === 0 ? 'Noch keine Einträge.' : usable + ' von ' + rows.length + (rows.length === 1 ? ' Eintrag' : ' Einträgen') + ' nutzbar.';
        clear(warn);
        if (usable === 0) {
          warn.appendChild(el('p', { class: 'cvz-cs-callout' }, [
            'Ohne nutzbare Substanz empfehlen wir kein Gated Content. Der Plan entsteht trotzdem, dann ohne Gated-Content-Ideen. Frei zugängliche Inhalte und ein Newsletter tragen hier mehr.',
          ]));
        }
      }
      function addRow(e) {
        e = e || { kind: 'daten', title: '', detail: '', release: 'anonymisiert' };
        var kind = el('select', {}, TP_INV_KINDS.map(function (k) { return el('option', { value: k.value }, [k.label]); }));
        kind.value = e.kind;
        var title = el('input', { type: 'text', maxlength: String(TP_LIMITS.title), placeholder: 'Kurzer Titel, z. B. Projektdaten 2019 bis 2025' });
        title.value = e.title || '';
        var detail = el('textarea', { class: 'cvz-cs-autogrow', rows: '2', maxlength: String(TP_LIMITS.detail), placeholder: e.placeholder || (TP_INV_KINDS.filter(function (k) { return k.value === e.kind; })[0] || TP_INV_KINDS[0]).hint });
        detail.value = e.detail || '';
        var release = el('select', {}, TP_RELEASES.map(function (r) { return el('option', { value: r.value }, [r.label]); }));
        release.value = e.release || 'anonymisiert';
        var num = el('span', { class: 'cvz-tp-entry-num' });
        var status = el('p', { class: 'cvz-tp-status' });
        var guide = el('div', { class: 'cvz-tp-guide' }); // NEU
        var remove = el('button', { type: 'button', class: 'cvz-cs-link-btn' }, ['Entfernen']);
        var card = el('div', { class: 'cvz-tp-entry' }, [
          el('div', { class: 'cvz-cs-role-head' }, [num, remove]),
          el('div', { class: 'cvz-cs-role-grid' }, [
            el('label', { class: 'cvz-cs-field' }, [el('span', { class: 'cvz-cs-field-label' }, ['Art']), kind]),
            el('label', { class: 'cvz-cs-field' }, [el('span', { class: 'cvz-cs-field-label' }, ['Freigabe']), release]),
          ]),
          el('label', { class: 'cvz-cs-field' }, [el('span', { class: 'cvz-cs-field-label' }, ['Titel']), title]),
          el('label', { class: 'cvz-cs-field' }, [el('span', { class: 'cvz-cs-field-label' }, ['Was genau? Umfang, Zeitraum, Herkunft']), detail]),
          guide,
          status,
        ]);
        var row = { card: card, kind: kind, title: title, detail: detail, release: release, num: num, status: status, guide: guide };
        kind.addEventListener('change', function () {
          for (var i = 0; i < TP_INV_KINDS.length; i++) if (TP_INV_KINDS[i].value === kind.value) detail.setAttribute('placeholder', TP_INV_KINDS[i].hint);
          refresh(); persist();
        });
        [title, detail, release].forEach(function (c) { c.addEventListener('input', function () { refresh(); persist(); }); c.addEventListener('change', function () { refresh(); persist(); }); });
        detail.addEventListener('input', function () { detail.style.height = 'auto'; detail.style.height = Math.max(detail.scrollHeight + 2, 54) + 'px'; });
        remove.addEventListener('click', function () {
          rows = rows.filter(function (r) { return r !== row; });
          list.removeChild(card);
          refresh(); persist();
        });
        rows.push(row);
        list.appendChild(card);
      }

      var addBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['+ Eintrag hinzufügen']);
      addBtn.addEventListener('click', function () { addRow(); refresh(); persist(); });
      var restrictionsInput = el('textarea', { class: 'cvz-cs-autogrow', rows: '2', maxlength: String(TP_LIMITS.restrictions), placeholder: 'z. B. Keine Kundennamen, keine Preise, keine Vertragsdetails' });
      restrictionsInput.value = restrictions;
      restrictionsInput.addEventListener('input', persist);

      entries.forEach(addRow);
      wrap.appendChild(list);
      wrap.appendChild(el('div', { class: 'cvz-cs-role-add' }, [addBtn]));
      wrap.appendChild(summary);
      wrap.appendChild(el('label', { class: 'cvz-cs-field' }, [el('span', { class: 'cvz-cs-field-label' }, ['Was darf nie nach draußen? (optional)']), restrictionsInput]));
      wrap.appendChild(warn);
      wrap.appendChild(formError);
      wrap.appendChild(el('p', { class: 'cvz-cs-hint' }, [recheck
        ? 'Die Prüfung dauert etwa eine Minute. Ergibt sie keine neuen Ideen, bleiben vorhandene Ideen erhalten.'
        : 'Der Plan wird einmal erstellt. Prüfe deine Angaben vor dem Start. Das dauert etwa zwei Minuten, du kannst die Seite währenddessen offen lassen.']));
      var startBtn = el('button', { type: 'button', class: 'cvz-cs-submit-btn' }, [recheck ? 'Gated Content neu prüfen' : 'Touchpoint-Plan erstellen']);
      startBtn.addEventListener('click', function () {
        var data = collect();
        var filled = data.filter(function (e) { return String(e.title).trim().length >= 2; });
        var orphan = data.filter(function (e) { return String(e.title).trim().length < 2 && String(e.detail).trim().length > 0; });
        if (orphan.length > 0) { formError.textContent = 'Mindestens ein Eintrag hat eine Beschreibung, aber keinen Titel.'; return; }
        formError.textContent = '';
        startBtn.setAttribute('disabled', 'disabled');
        var payload = { entries: filled.map(function (e) { return { kind: e.kind, title: String(e.title).trim().slice(0, TP_LIMITS.title), detail: String(e.detail).trim().slice(0, TP_LIMITS.detail), release: e.release }; }) };
        var r = restrictionsInput.value.trim();
        if (r) payload.restrictions = r.slice(0, TP_LIMITS.restrictions);
        if (recheck) { runRecheck(payload, startBtn, formError); return; }
        apiFetch('/api/content-strategy/' + encodeURIComponent(sessionId) + '/touchpoint-plan', { method: 'POST', body: JSON.stringify({ inventory: payload }) })
          .then(function () {
            startError = '';
            session.touchpoint_job = { status: 'running', started_at: new Date().toISOString() };
            paint();
          })
          .catch(function (err) {
            startBtn.removeAttribute('disabled');
            var code = err && err.body && err.body.code;
            if (code === 'laeuft' || code === 'bereits_erstellt') {
              // Läuft schon oder liegt schon vor (zweiter Tab, Doppelklick): Stand neu laden statt Fehler oder Formular zu zeigen.
              startError = '';
              session.touchpoint_job = { status: 'running', started_at: new Date().toISOString() };
              paint();
              return;
            }
            formError.textContent = err && err.network ? 'Die Verbindung wurde unterbrochen. Bitte versuche es in ein paar Sekunden erneut. Deine Angaben sind gespeichert.' : (err && err.message ? err.message : 'Start fehlgeschlagen.');
          });
      });
      wrap.appendChild(startBtn);
      refresh();
      setTimeout(function () { rows.forEach(function (r) { r.detail.style.height = 'auto'; r.detail.style.height = Math.max(r.detail.scrollHeight + 2, 54) + 'px'; }); }, 50);
      return wrap;
    }

    // NEU: Neuprüfung des Gated-Content-Teils. Danach den Stand frisch laden (auch das Touchpoint-Diagramm, damit Änderungen darin nicht
    // durch einen älteren Stand im Speicher überzeichnet werden) und neu zeichnen.
    var recheckNotice = '';
    function runRecheck(payload, btn, errorEl) {
      btn.setAttribute('disabled', 'disabled');
      btn.textContent = 'Wird geprüft …';
      errorEl.textContent = '';
      apiFetch('/api/content-strategy/' + encodeURIComponent(sessionId) + '/gated-content', { method: 'POST', body: JSON.stringify({ inventory: payload }) })
        .then(function (resp) {
          recheckNotice = resp && resp.kept_previous ? 'Neu geprüft: keine weiteren Ideen, die bisherigen bleiben.' : 'Neu geprüft mit euren ergänzten Angaben.';
          return apiFetch('/api/content-strategy/' + encodeURIComponent(sessionId));
        })
        .then(function (fresh) {
          if (fresh && fresh.result) {
            ['inventory', 'gated_content', 'gated_rechecks'].forEach(function (k) { if (fresh.result[k] !== undefined) result[k] = fresh.result[k]; });
            session.touchpoint_diagram = fresh.touchpoint_diagram || session.touchpoint_diagram || null;
          }
          tpClearDraft(sessionId + '-recheck');
          paint();
        })
        .catch(function (err) {
          btn.removeAttribute('disabled');
          btn.textContent = 'Gated Content neu prüfen';
          var code = err && err.body && err.body.code;
          errorEl.textContent = code === 'zeitlimit' ? 'Die Prüfung hat zu lange gedauert. Das liegt nicht an deinen Angaben, bitte versuche es in ein paar Minuten erneut. Deine Angaben sind gespeichert.'
            : err && err.network ? 'Die Verbindung wurde unterbrochen. Bitte versuche es in ein paar Sekunden erneut. Deine Angaben sind gespeichert.'
              : (err && err.message ? err.message : 'Neuprüfung fehlgeschlagen.');
        });
    }
    function renderRecheckPanel() {
      if (!isCreator || !result.gated_content) return null;
      var rc = result.gated_rechecks || {};
      var used = typeof rc.count === 'number' ? rc.count : 0;
      var max = 3;
      var noIdeas = result.gated_content.verdict !== 'ideen' || !(result.gated_content.ideas || []).length;
      var box = el('details', { class: 'cvz-cs-expand cvz-tp-recheck' });
      if (noIdeas && used < max && result.gated_content.fit && result.gated_content.fit.level === 'passend') box.open = true;
      box.appendChild(el('summary', {}, [noIdeas ? 'Angaben ergänzen und Gated Content neu prüfen' : 'Weitere Substanz ergänzen und neu prüfen']));
      if (used >= max) {
        box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Gated Content wurde für diese Strategie schon ' + max + ' Mal neu geprüft. Für weitere Prüfungen starte eine neue Strategie.']));
        return box;
      }
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Noch ' + (max - used) + ' von ' + max + ' Neuprüfungen für diese Strategie.' + (rc.last_at ? ' Zuletzt geprüft am ' + new Date(rc.last_at).toLocaleDateString('de-DE') + '.' : '')]));
      box.appendChild(renderInventoryForm(true));
      return box;
    }

    function renderRunning() {
      root.appendChild(el('div', { class: 'cvz-cs-processing' }, [
        el('div', { class: 'cvz-cs-spinner' }),
        el('p', { class: 'cvz-cs-progress-text' }, ['Der Touchpoint-Plan wird erstellt …']),
        el('p', { class: 'cvz-cs-hint' }, ['Das dauert etwa zwei Minuten. Du kannst diese Seite schließen, der Plan liegt danach in dieser Strategie.']),
      ]));
    }

    // ---------- Ergebnis ----------
    // GEÄNDERT (Übersicht): Das Diagramm kommt zuerst, davor nur eine Zeile zur Wirtschaftlichkeit. Gated-Content-Ideen und die Such-Tabelle folgen
    // darunter (die Tabelle eingeklappt). Pflichthinweise (Einwilligung, Konzept statt Text) bleiben sichtbar.
    var VALUE_SHORT = {
      klein: 'Kundenwert klein: keine Webinare, Workshops oder persönlichen Gespräche.',
      mittel: 'Kundenwert mittel: Webinare möglich, Gespräche nur in der Entscheidung, keine Workshops.',
      gross: 'Kundenwert groß: persönliche Formate möglich.',
    };
    function renderValueLine(v) {
      return el('p', { class: 'cvz-cs-hint cvz-tp-value' }, [
        el('strong', {}, ['Wirtschaftlichkeit: ']),
        VALUE_SHORT[v.value] || v.label || '',
        v.note ? tip((v.label || '') + '. ' + v.note, 'Wie wird die Wirtschaftlichkeit bewertet?') : null,
      ]);
    }
    // NEU: Unterlagen für Mitentscheider nach einer Terminanfrage. Statt einer Mail-Strecke: je Rolle eine Unterlage, die der Vertrieb weitergibt.
    function renderBuyingCenter(kit) {
      var box = el('div', { class: 'cvz-tp-kit' });
      box.appendChild(el('h5', {}, ['Unterlagen für Mitentscheider nach: ' + (kit.entry_label || 'Zielaktion'), tip(kit.usage || '', 'Warum keine E-Mail-Strecke?')]));
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Kein Versand nach Zeitplan. Der Vertrieb gibt die passende Unterlage weiter, oder dein Ansprechpartner leitet sie intern weiter.']));
      (kit.items || []).forEach(function (it) {
        var card = el('div', { class: 'cvz-tp-kit-item' }, [
          el('div', { class: 'cvz-cs-page-card-badges' }, [el('span', { class: 'cvz-cs-badge' }, [it.role]), it.role_is_champion ? el('span', { class: 'cvz-cs-badge' }, ['Champion']) : null, el('span', { class: 'cvz-cs-badge' }, [it.format])]),
          el('p', { class: 'cvz-cs-magnet-line' }, [el('strong', {}, ['Danach weiß die Person: ']), it.learning_goal]),
          el('p', { class: 'cvz-cs-magnet-line' }, [el('strong', {}, ['Kernaussage: ']), it.message]),
        ]);
        if (it.objection) card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Beantwortet den Einwand: ' + it.objection]));
        box.appendChild(card);
      });
      return box;
    }
    function renderResult() {
      var gated = result.gated_content;
      var plan = result.touchpoint_plan;
      if (plan) {
        if (plan.value_class && plan.value_class.value) root.appendChild(renderValueLine(plan.value_class));
        var head = el('h5', {}, ['Touchpoints und E-Mails']);
        if (plan.plan_note) head.appendChild(tip(plan.plan_note, 'Was zeigt der Plan?'));
        root.appendChild(head);
        root.appendChild(renderTouchpointEditor(sessionId, result, session));
        if (plan.consent_note) root.appendChild(el('p', { class: 'cvz-cs-callout' }, [plan.consent_note]));
        if (result.nurture_plan && result.nurture_plan.buying_center) root.appendChild(renderBuyingCenter(result.nurture_plan.buying_center));
        if (result.nurture_plan && result.nurture_plan.note) root.appendChild(el('p', { class: 'cvz-cs-hint' }, [result.nurture_plan.note]));
        if (recheckNotice) root.appendChild(el('p', { class: 'cvz-cs-callout' }, [recheckNotice]));
        if (gated) root.appendChild(renderGatedBlock(gated));
        var rcPanel = renderRecheckPanel(); // NEU: Angaben ergänzen und neu prüfen
        if (rcPanel) root.appendChild(rcPanel);
        // GEÄNDERT: "Suchen Interessenten selbst?" steht jetzt im Traffic-Block der Zusammenfassung (gleiche Frage, einmal).
      } else {
        if (recheckNotice) root.appendChild(el('p', { class: 'cvz-cs-callout' }, [recheckNotice]));
        if (gated) root.appendChild(renderGatedBlock(gated));
        var rcPanel2 = renderRecheckPanel();
        if (rcPanel2) root.appendChild(rcPanel2);
        root.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Für diesen Lauf liegt kein Touchpoint-Plan vor, die Auswertung ergab keine belastbaren Touchpoints.']));
      }
      if (result.inventory && result.inventory.entries && result.inventory.entries.length > 0) root.appendChild(renderInventorySummary(result.inventory));
    }

    paint();
    return root;
  }

  // NEU: Einordnung, wenn kein Gated Content entsteht (Server: contentStrategyGatedFit.ts). Sagt, ob das Thema taugt und was fehlt.
  var GATED_NEED_STATUS = { fehlt: 'Fehlt', unklar: 'Angegeben, reicht noch nicht', vorhanden: 'Vorhanden' };
  function renderGatedFit(fit) {
    var box = el('div', { class: 'cvz-tp-verdict-none cvz-tp-fit cvz-tp-fit-' + fit.level }, [
      el('p', { class: 'cvz-cs-brief-label' }, ['Ergebnis']),
      el('p', { class: 'cvz-tp-verdict-title' }, [fit.headline]),
    ]);
    (fit.reasons || []).forEach(function (r) { box.appendChild(el('p', {}, [r])); });
    if ((fit.needs || []).length > 0) {
      box.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Das müsstet ihr liefern']));
      fit.needs.forEach(function (n) {
        var kids = [
          el('div', { class: 'cvz-cs-page-card-badges' }, [
            el('span', { class: 'cvz-cs-badge cvz-tp-need-' + n.status }, [GATED_NEED_STATUS[n.status] || n.status]),
            el('span', { class: 'cvz-cs-badge' }, [n.kind_label]),
            n.phase_label ? el('span', { class: 'cvz-cs-badge' }, [n.phase_label]) : null,
          ]),
          el('p', {}, [el('strong', {}, ['Für die Idee „' + n.idea_title + '“: ']), n.need]),
        ];
        if (n.entry_problem) kids.push(el('p', { class: 'cvz-cs-hint' }, ['Euer Eintrag „' + n.entry_title + '“: ' + n.entry_problem + '.']));
        box.appendChild(el('div', { class: 'cvz-tp-need' }, kids));
      });
    }
    if ((fit.entry_fixes || []).length > 0) {
      box.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Eure Einträge, die noch nicht reichen']));
      box.appendChild(el('ul', {}, fit.entry_fixes.map(function (f) { return el('li', {}, [el('strong', {}, [f.title]), ' (' + f.kind_label + '): ' + f.fix]); })));
    }
    box.appendChild(el('p', {}, [el('strong', {}, ['Nächster Schritt: ']), fit.next_step]));
    return box;
  }

  function renderGatedBlock(gated) {
    var box = el('div', { class: 'cvz-tp-gated' });
    box.appendChild(el('h5', {}, ['Gated Content auf Basis eurer Substanz']));
    if (gated.note) box.appendChild(el('p', { class: 'cvz-cs-hint' }, [gated.note]));
    if (gated.recheck_note) box.appendChild(el('p', { class: 'cvz-cs-callout' }, [gated.recheck_note]));
    if ((gated.verdict !== 'ideen' || !gated.ideas || gated.ideas.length === 0) && gated.fit) {
      box.appendChild(renderGatedFit(gated.fit));
      return box;
    }
    if (gated.verdict !== 'ideen' || !gated.ideas || gated.ideas.length === 0) {
      box.appendChild(el('div', { class: 'cvz-tp-verdict-none' }, [
        el('p', { class: 'cvz-cs-brief-label' }, ['Ergebnis']),
        el('p', { class: 'cvz-tp-verdict-title' }, ['Kein Gated Content empfohlen']),
        el('p', {}, [gated.reason || '']),
      ]));
      return box;
    }
    gated.ideas.forEach(function (idea) {
      var card = el('details', { class: 'cvz-cs-page-card cvz-cs-fold cvz-cs-page-acc' });
      card.appendChild(el('summary', {}, [el('div', { class: 'cvz-cs-page-acc-head' }, [
        el('div', { class: 'cvz-cs-page-card-badges' }, [
          el('span', { class: 'cvz-cs-badge' }, [idea.phase_label]),
          el('span', { class: 'cvz-cs-badge' }, [idea.format_label]),
          el('span', { class: 'cvz-cs-badge' }, [idea.gate_mode_label]),
          el('span', { class: 'cvz-cs-badge' }, ['Aufwand ' + idea.effort]),
        ]),
        el('h4', { class: 'cvz-cs-page-card-topic' }, [idea.title]),
        el('p', { class: 'cvz-cs-page-acc-teaser' }, [idea.promise]),
      ])]));
      var body = el('div', { class: 'cvz-cs-page-acc-body' });
      body.appendChild(tpLine('Ergebnis für den Nutzer:', idea.promise));
      body.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Das steckt konkret drin:']));
      body.appendChild(tpList(idea.content_points || []));
      body.appendChild(tpLine('Warum es das frei nicht gibt:', idea.why_not_free));
      body.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Gestützt auf eure Angaben:']));
      body.appendChild(tpList(idea.substance_labels || []));
      if (idea.release_note) body.appendChild(el('p', { class: 'cvz-cs-commodity-note' }, [idea.release_note]));
      body.appendChild(tpLine('Das braucht ihr dafür:', idea.prerequisites));
      body.appendChild(tpLine('Danach:', idea.conversion_bridge));
      card.appendChild(body);
      box.appendChild(card);
    });
    return box;
  }

  // Je Phase: Suchen Interessenten dort selbst? Der Server prüft, ob zum Haupt-Keyword der geplanten Seiten ein Suchvolumen gemessen wurde.
  // GEÄNDERT (Übersicht): eingeklappt, kompakt in drei Spalten. Was eine Zeile heißt, steht als Tooltip am Status (ältere Pläne ohne meaning
  // bekommen den Satz hier ergänzt), die Erklärung der Tabelle am Titel.
  function renderDemandBlock(demand) {
    var box = el('details', { class: 'cvz-tp-demand' });
    box.appendChild(el('summary', {}, [
      'Suchen Interessenten in dieser Phase selbst?',
      tip('Für jede Phase prüft der Server, ob zum Haupt-Keyword der geplanten Seiten Google-Suchanfragen gemessen wurden. Das zeigt, wo Interessenten dich selbst finden und wo du sie aktiv erreichen musst. ' +
        'Die Zahl in der Spalte "Beleg" ist das monatliche Suchvolumen dieses einen Keywords (gerundeter Google-Ads-Wert), nicht die Größe der Phase. Keine Kanalempfehlung.', 'Wie ist die Tabelle gemeint?'),
    ]));
    var table = el('table', { class: 'cvz-cs-table cvz-cs-table-cards' });
    table.appendChild(el('thead', {}, [el('tr', {}, [el('th', {}, ['Phase']), el('th', {}, ['Suchen sie selbst?']), el('th', {}, ['Beleg'])])]));
    var tbody = el('tbody');
    demand.forEach(function (d) {
      tbody.appendChild(el('tr', {}, [
        el('td', { 'data-label': 'Phase' }, [d.phase_label]),
        el('td', { 'data-label': 'Suchen sie selbst?' }, [TP_DEMAND_LABELS[d.measurable] || d.measurable, tip(d.meaning || TP_DEMAND_MEANING[d.measurable] || '', 'Was heißt das?')]),
        el('td', { 'data-label': 'Beleg' }, [d.basis]),
      ]));
    });
    table.appendChild(tbody);
    box.appendChild(el('div', { class: 'cvz-cs-table-wrap' }, [table]));
    return box;
  }

  function renderInventorySummary(inventory) {
    var list = el('ul', { class: 'cvz-cs-brief-list' });
    inventory.entries.forEach(function (e) {
      var kindLabel = (TP_INV_KINDS.filter(function (k) { return k.value === e.kind; })[0] || {}).label || e.kind;
      var relLabel = (TP_RELEASES.filter(function (r) { return r.value === e.release; })[0] || {}).label || e.release;
      list.appendChild(el('li', {}, [kindLabel + ': ' + e.title + ' (' + relLabel + ')' + (e.vague ? ' · zu ungenau, nicht genutzt' : '')]));
    });
    return el('div', { class: 'cvz-cs-method' }, [el('details', { class: 'cvz-cs-expand' }, [el('summary', {}, ['Grundlage: deine Angaben zur Substanz']), list])]);
  }

  // ==================== DIAGRAMM: AUFBAU ====================
  function tpMailIndex(plan) {
    var map = {};
    ((plan && plan.sequences) || []).forEach(function (seq, si) {
      (seq.mails || []).forEach(function (m, mi) { map[m.id] = { mail: m, seq: seq, si: si, mi: mi }; });
    });
    return map;
  }

  // NEU (Strecken nach der Zielaktion): Zeitpunkt und Beschriftung je Art der Strecke. Gleiche Regeln wie im Backend (mailTimingText).
  // day bedeutet: nach_lead, onboarding = Tage nach dem Start, vor_termin = Tage VOR dem Termin (leer = sofort nach der Anfrage),
  // reaktivierung = Tage nach dem Auslöser. Ältere Pläne haben keinen mode und gelten als nach_lead.
  var TP_TERMIN_GOALS = { demo: true, anfrage: true, pilot: true, partner: true, event: true };
  function tpMailTiming(mode, kind, day) {
    var m = mode || 'nach_lead';
    if (m === 'vor_termin') {
      if (kind === 'bestaetigung' || day == null) return 'Sofort nach der Anfrage';
      return day === 1 ? '1 Tag vor dem Termin' : day + ' Tage vor dem Termin';
    }
    if (day == null) return 'Zeitpunkt offen';
    if (m === 'reaktivierung') return 'Tag ' + day + ' nach dem Auslöser';
    if (m === 'onboarding') return 'Tag ' + day + ' nach dem Start';
    return 'Tag ' + day;
  }
  // Kurzform für die Kästchen im Editor (höchstens 32 Zeichen samt "E-Mail · ").
  function tpMailTimingShort(mode, kind, day) {
    var t = tpMailTiming(mode, kind, day);
    return t.replace(' nach dem Auslöser', ' nach Auslöser').replace(' vor dem Termin', ' vor Termin').replace(' nach dem Start', ' nach Start').replace('Sofort nach der Anfrage', 'sofort nach Anfrage');
  }
  function tpDayFieldLabel(mode) {
    if (mode === 'vor_termin') return 'Tage vor dem Termin (Vorschlag)';
    if (mode === 'reaktivierung') return 'Tage nach dem Auslöser (Vorschlag)';
    if (mode === 'onboarding') return 'Tage nach dem Start (Vorschlag)';
    return 'Tage nach dem Lead (Vorschlag)';
  }
  // Ältere Pläne: eine Zeitstrecke nach einer Terminanfrage. Sie bleibt sichtbar, ist aber als "nicht automatisch versenden" markiert.
  function tpIsLegacyMeetingDrip(seq, endGoal) {
    return !!seq && !seq.mode && seq.entry && seq.entry.kind === 'endziel' && !!TP_TERMIN_GOALS[endGoal];
  }
  function tpSeqZoneLabel(seq, endGoal) {
    if (!seq) return 'Eigene E-Mails';
    var label = seq.entry && seq.entry.label ? seq.entry.label : '';
    if (seq.mode === 'vor_termin') return 'Bis zum Termin (' + label + '), danach übernimmt der Vertrieb';
    if (seq.mode === 'reaktivierung') return 'Nur von Hand auslösen: wenn es nach dem Termin stockt';
    if (seq.mode === 'onboarding') return 'Onboarding nach: ' + label;
    if (tpIsLegacyMeetingDrip(seq, endGoal)) return 'Nach dem Lead: ' + label + ' (älterer Plan, nicht automatisch versenden)';
    return 'Nach dem Lead: ' + label;
  }

  function tpBuildDiagram(plan, nurture) {
    var nodes = [];
    var edges = [];
    (plan.touchpoints || []).forEach(function (tp, i) {
      nodes.push({ id: tp.id, kind: 'touchpoint', touchpoint_ref: i, label: String(tp.learning_goal).slice(0, TP_LIMITS.label), phase: tp.phase, role: tp.role || null, format: tp.format, channel: null, x: 0, y: 0 });
    });
    (plan.touchpoints || []).forEach(function (tp) {
      (tp.from || []).forEach(function (f, k) {
        edges.push({ id: ('e-' + tp.id + '-' + k).slice(0, 40), from: f.id, to: tp.id, type: f.kind });
      });
    });
    // NEU: Lead-Magneten und Gated-Ideen aus dem Plan als eigene Knoten. Touchpoints führen auf sie (target_asset), Gated-Ideen führen in die E-Mails.
    var assetNodeId = {};
    (plan.assets || []).forEach(function (a) {
      var nid = tpAssetNodeId(a.id);
      assetNodeId[a.id] = nid;
      nodes.push({ id: nid, kind: 'asset', asset_ref: a.id, label: String(a.title).slice(0, TP_LIMITS.label), phase: a.phase || undefined, channel: null, x: 0, y: 0 });
    });
    (plan.touchpoints || []).forEach(function (tp) {
      if (tp.target_asset && tp.target_asset.kind === 'magnet' && assetNodeId[tp.target_asset.ref]) {
        edges.push({ id: ('ea-' + tp.id).slice(0, 40), from: tp.id, to: assetNodeId[tp.target_asset.ref], type: 'fuehrt_zu' });
      }
    });
    ((nurture && nurture.sequences) || []).forEach(function (seq) {
      if (seq.entry && seq.entry.kind === 'magnet' && assetNodeId[seq.entry.id] && seq.mails && seq.mails[0]) {
        edges.push({ id: ('eam-' + seq.mails[0].id).slice(0, 40), from: assetNodeId[seq.entry.id], to: seq.mails[0].id, type: 'fuehrt_zu' });
      }
      (seq.mails || []).forEach(function (m, mi) {
        nodes.push({ id: m.id, kind: 'mail', mail_ref: m.id, label: String(m.learning_goal).slice(0, TP_LIMITS.label), role: m.role || null, channel: null, day: m.day, x: 0, y: 0 });
        if (mi > 0) edges.push({ id: ('em-' + m.id).slice(0, 40), from: seq.mails[mi - 1].id, to: m.id, type: 'fuehrt_zu' });
      });
    });
    var d = { version: 1, nodes: nodes.slice(0, TP_LIMITS.nodes), edges: edges.slice(0, TP_LIMITS.edges) };
    tpAutoLayout(d);
    return d;
  }

  function tpAssetNodeId(assetId) {
    return ('as-' + String(assetId).replace(/[^A-Za-z0-9_-]/g, '_')).slice(0, 40);
  }

  function tpSeqIndexOf(node) {
    var m = /^nm-(\d+)-/.exec(String(node.mail_ref || ''));
    return m ? Number(m[1]) : 99;
  }

  // Touchpoints in Spalten je Phase (Custom ohne Phase rechts daneben), E-Mails darunter, eine Zeile je Sequenz.
  function tpAutoLayout(d) {
    var colOf = function (n) { for (var i = 0; i < TP_PHASES.length; i++) if (TP_PHASES[i].value === n.phase) return i; return TP_PHASES.length; };
    var perCol = {};
    var maxRows = 0;
    d.nodes.filter(function (n) { return n.kind !== 'mail' && n.kind !== 'asset'; }).forEach(function (n) {
      var c = colOf(n);
      var r = perCol[c] || 0;
      perCol[c] = r + 1;
      maxRows = Math.max(maxRows, r + 1);
      n.x = flowClamp(c * (TP_NODE_W + TP_GAP_X));
      n.y = flowClamp(r * (TP_NODE_H + TP_GAP_Y / 2));
    });
    // Lead-Magneten: eine Zeile unter den Touchpoints (nach Phase geordnet, höchstens fünf nebeneinander), die E-Mails darunter.
    var assets = d.nodes.filter(function (n) { return n.kind === 'asset'; });
    assets.sort(function (a, b) { return colOf(a) - colOf(b); });
    var assetY = maxRows * (TP_NODE_H + TP_GAP_Y / 2) + 60;
    assets.forEach(function (n, i) {
      n.x = flowClamp((i % 5) * (TP_NODE_W + TP_GAP_X));
      n.y = flowClamp(assetY + Math.floor(i / 5) * (TP_NODE_H + TP_GAP_Y / 2));
    });
    var laneY = (assets.length > 0 ? assetY + Math.ceil(assets.length / 5) * (TP_NODE_H + TP_GAP_Y / 2) : maxRows * (TP_NODE_H + TP_GAP_Y / 2)) + 110;
    var rowOfSeq = {};
    var nextRow = 0;
    var mails = d.nodes.filter(function (n) { return n.kind === 'mail'; });
    mails.sort(function (a, b) { return tpSeqIndexOf(a) - tpSeqIndexOf(b) || (a.day || 0) - (b.day || 0); });
    var posInRow = {};
    mails.forEach(function (n) {
      var si = tpSeqIndexOf(n);
      if (rowOfSeq[si] === undefined) rowOfSeq[si] = nextRow++;
      var r = rowOfSeq[si];
      var p = posInRow[r] || 0;
      posInRow[r] = p + 1;
      n.x = flowClamp(p * (TP_NODE_W + TP_GAP_X));
      n.y = flowClamp(laneY + r * (TP_NODE_H + TP_GAP_Y));
    });
  }

  function tpSanitizeStored(stored, plan, nurture) {
    if (!stored || stored.version !== 1 || !Array.isArray(stored.nodes) || !Array.isArray(stored.edges)) return null;
    var mails = tpMailIndex(nurture);
    var tpCount = (plan.touchpoints || []).length;
    var assetIds = {};
    (plan.assets || []).forEach(function (a) { assetIds[a.id] = true; });
    var nodes = stored.nodes.filter(function (n) {
      if (!n || typeof n.id !== 'string') return false;
      if (n.kind === 'touchpoint') return typeof n.touchpoint_ref === 'number' && n.touchpoint_ref < tpCount;
      if (n.kind === 'asset') return typeof n.asset_ref === 'string' && !!assetIds[n.asset_ref];
      if (n.kind === 'mail') return n.mail_ref == null || !!mails[n.mail_ref];
      return n.kind === 'custom';
    });
    var ids = {};
    nodes.forEach(function (n) { ids[n.id] = true; });
    var edges = stored.edges.filter(function (e) { return e && ids[e.from] && ids[e.to] && (e.type === 'fuehrt_zu' || e.type === 'retargeting'); });
    return { version: 1, nodes: flowClone(nodes), edges: flowClone(edges) };
  }

  function tpDataFor(node, plan, nurture) {
    if (node.kind === 'touchpoint' && node.touchpoint_ref != null) return (plan.touchpoints || [])[node.touchpoint_ref] || null;
    if (node.kind === 'mail' && node.mail_ref) { var hit = tpMailIndex(nurture)[node.mail_ref]; return hit ? hit.mail : null; }
    if (node.kind === 'asset' && node.asset_ref) return (plan.assets || []).filter(function (a) { return a.id === node.asset_ref; })[0] || null;
    return null;
  }

  // ==================== EXPORT ====================
  function tpExportRows(diagram, plan, nurture, endGoal) {
    var byId = {};
    diagram.nodes.forEach(function (n) { byId[n.id] = n; });
    var phaseIdx = function (n) { for (var i = 0; i < TP_PHASES.length; i++) if (TP_PHASES[i].value === n.phase) return i; return 9; };
    var tps = diagram.nodes.filter(function (n) { return n.kind !== 'mail'; }).sort(function (a, b) { return phaseIdx(a) - phaseIdx(b) || a.x - b.x || a.y - b.y; });
    var mails = diagram.nodes.filter(function (n) { return n.kind === 'mail'; }).sort(function (a, b) { return tpSeqIndexOf(a) - tpSeqIndexOf(b) || (a.day || 0) - (b.day || 0); });
    var ordered = tps.concat(mails);
    var incoming = {};
    diagram.edges.forEach(function (e) { (incoming[e.to] = incoming[e.to] || []).push(e); });
    var used = {};
    var titleOf = {};
    ordered.forEach(function (n) {
      var base = String(n.label || 'Eintrag').trim() || 'Eintrag';
      var c = base; var k = 2;
      while (used[c.toLowerCase()]) c = base + ' (' + k++ + ')';
      used[c.toLowerCase()] = true;
      titleOf[n.id] = c;
    });
    var rows = ordered.map(function (n, i) {
      var d = tpDataFor(n, plan, nurture) || {};
      var isMail = n.kind === 'mail';
      var isAsset = n.kind === 'asset';
      var req = (incoming[n.id] || []).map(function (e) {
        return (e.type === 'retargeting' ? 'Retargeting, wenn gesehen: ' : 'Führt zu diesem Schritt von: ') + (byId[e.from] ? titleOf[e.from] : '?');
      }).join('; ');
      var asset = d.target_asset ? d.target_asset.label : '';
      var seqLabel = '';
      if (isMail && n.mail_ref) { var hit = tpMailIndex(nurture)[n.mail_ref]; if (hit) seqLabel = hit.seq.entry && hit.seq.entry.label ? hit.seq.entry.label : ''; }
      var desc = [];
      var mailHit = isMail && n.mail_ref ? tpMailIndex(nurture)[n.mail_ref] : null;
      if (isMail) {
        desc.push((mailHit ? tpSeqZoneLabel(mailHit.seq, endGoal) : 'Eigene E-Mail') + ', ' + (mailHit ? tpMailTiming(mailHit.seq.mode, mailHit.mail.kind, n.day) : (n.day != null ? 'Tag ' + n.day : 'Zeitpunkt offen')));
        if (mailHit && mailHit.seq.trigger) desc.push(mailHit.seq.trigger);
      }
      if (isAsset) {
        desc.push((d.origin === 'frei' ? 'Lead-Magnet, frei zugänglich' : 'Gated Content, hinter E-Mail') + (d.effort ? ', Aufwand ' + d.effort : ''));
        if (d.promise) desc.push('Versprechen: ' + d.promise);
        if (d.content_points && d.content_points.length) desc.push('Inhalt: ' + d.content_points.join('; '));
        if (d.conversion_bridge) desc.push('Danach: ' + d.conversion_bridge);
        (d.notes || []).forEach(function (t) { desc.push(t); });
      }
      if (d.learning_goal) desc.push('Lernziel: ' + d.learning_goal);
      if (d.message) desc.push('Botschaft: ' + d.message);
      if (d.objection) desc.push('Einwand: ' + d.objection);
      if (asset) desc.push('Ziel-Asset: ' + asset);
      if (d.micro_conversion) desc.push('Mikro-Conversion: ' + d.micro_conversion);
      if (req) desc.push('Verknüpfung: ' + req);
      if (n.channel) desc.push('Kanal: ' + n.channel);
      if (n.note) desc.push('Notiz: ' + n.note);
      return {
        taskId: 'TP' + (i + 1), title: titleOf[n.id], art: isMail ? 'E-Mail' : (isAsset ? (d.origin === 'frei' ? 'Lead-Magnet' : 'Gated Content') : 'Touchpoint'),
        phase: isMail ? '' : tpPhaseLabel(n.phase), day: isMail ? (mailHit ? tpMailTiming(mailHit.seq.mode, mailHit.mail.kind, n.day) : (n.day != null ? n.day : '')) : '',
        role: n.role || '', format: isMail ? (d.kind_label || '') : (d.format_label || tpFormatLabel(n.format)),
        channel: n.channel || '', goal: d.learning_goal || d.promise || '', message: d.message || '', objection: d.objection || '',
        asset: asset, micro: d.micro_conversion || '', req: req,
        basis: d.basis ? (TP_BASIS_LABELS[d.basis] || d.basis) : (isAsset ? (d.origin === 'frei' ? 'Allgemein, frei zugänglich' : 'Mit deiner Substanz') : (n.kind === 'custom' ? 'Eigener Eintrag' : '')),
        note: n.note || '', description: desc.join('\n'),
        tags: [isMail ? 'E-Mail' : tpPhaseLabel(n.phase), isMail ? '' : (d.format_label || tpFormatLabel(n.format)), n.role || ''].filter(Boolean).map(function (t) { return String(t).replace(/[|,]/g, ' '); }).join('|'),
      };
    });
    // NEU: Unterlagen für Mitentscheider als Aufgaben (erstellen, dann im Gespräch weitergeben). Kein Versandtag.
    var kit = nurture && nurture.buying_center;
    ((kit && kit.items) || []).forEach(function (it) {
      var title = 'Unterlage für ' + it.role + ': ' + it.format;
      rows.push({
        taskId: 'TP' + (rows.length + 1), title: title, art: 'Unterlage', phase: '', day: 'kein Versandtag', role: it.role, format: it.format, channel: '',
        goal: it.learning_goal, message: it.message, objection: it.objection || '', asset: '', micro: '', req: '', basis: 'Aus deinen Angaben', note: '',
        description: ['Unterlage für Mitentscheider nach: ' + (kit.entry_label || 'Zielaktion'), kit.usage, 'Lernziel: ' + it.learning_goal, 'Botschaft: ' + it.message].concat(it.objection ? ['Einwand: ' + it.objection] : []).join('\n'),
        tags: ['Unterlage', it.role].map(function (t) { return String(t).replace(/[|,]/g, ' '); }).join('|'),
      });
    });
    return rows;
  }

  function tpBuildExport(kind, diagram, plan, nurture, seedTopic, endGoal) {
    var rows = tpExportRows(diagram, plan, nurture, endGoal);
    var base = 'touchpoint-plan-' + flowSlug(seedTopic);
    if (kind === 'clickup') {
      return { filename: base + '-clickup.csv', rows: rows.length, text: flowToCsv(['Task ID', 'Task Name', 'Description', 'Tags', 'Subtask IDs'], rows.map(function (r) { return [r.taskId, r.title, r.description, r.tags, '']; }), ',', false) };
    }
    if (kind === 'asana') {
      return { filename: base + '-asana.csv', rows: rows.length, text: flowToCsv(['Name', 'Description', 'Parent Task'], rows.map(function (r) { return [r.title, r.description, '']; }), ',', false) };
    }
    var headers = ['ID', 'Art', 'Phase', 'Tag nach dem Lead', 'Titel', 'Rolle', 'Format', 'Kanal', 'Lernziel', 'Botschaft', 'Einwand', 'Ziel-Asset', 'Mikro-Conversion', 'Verknüpfung', 'Grundlage', 'Notiz'];
    return {
      filename: base + '-tabelle.csv', rows: rows.length,
      text: flowToCsv(headers, rows.map(function (r) { return [r.taskId, r.art, r.phase, r.day, r.title, r.role, r.format, r.channel, r.goal, r.message, r.objection, r.asset, r.micro, r.req, r.basis, r.note]; }), ';', true),
    };
  }

  // ==================== EDITOR ====================
  function renderTouchpointEditor(sessionId, result, session) {
    var plan = result.touchpoint_plan;
    var nurture = result.nurture_plan || null;
    var endGoal = result.strategy_goal && result.strategy_goal.end_goal;
    var diagram = tpSanitizeStored(session && session.touchpoint_diagram, plan, nurture) || tpBuildDiagram(plan, nurture);
    function mailModeOf(n) { var h = n && n.mail_ref ? tpMailIndex(nurture)[n.mail_ref] : null; return h ? h.seq.mode : undefined; }
    var ui = { selected: null, mode: null, roleFilter: '', view: { x: 40, y: 40, k: 1 }, undo: [], drag: null, saveState: sessionId ? 'idle' : 'unsaved', saveTimer: null, saveError: '', fullscreen: false, exportOpen: false, lastUndoKey: null };
    var roles = (plan.role_coverage || []).map(function (r) { return r.role; });

    var root = el('div', { class: 'cvz-flow cvz-tp-flow' });
    var toolbar = el('div', { class: 'cvz-flow-toolbar' });
    var stage = el('div', { class: 'cvz-flow-stage' });
    var canvasWrap = el('div', { class: 'cvz-flow-canvas-wrap' });
    var panel = el('div', { class: 'cvz-flow-panel' });
    var banner = el('div', { class: 'cvz-flow-banner', style: 'display:none' });
    var svg = svgEl('svg', { class: 'cvz-flow-svg', tabindex: '0', role: 'application', 'aria-label': 'Touchpoint-Diagramm' });
    var defs = svgEl('defs', {}, [
      svgEl('marker', { id: 'cvz-tp-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, [svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'rgba(226,232,240,.75)' })]),
      svgEl('marker', { id: 'cvz-tp-arrow-retarget', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' }, [svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'rgba(79,209,197,.9)' })]),
    ]);
    var viewport = svgEl('g', {});
    var zoneLayer = svgEl('g', {});
    var edgeLayer = svgEl('g', {});
    var nodeLayer = svgEl('g', {});
    viewport.appendChild(zoneLayer); viewport.appendChild(edgeLayer); viewport.appendChild(nodeLayer);
    svg.appendChild(defs); svg.appendChild(viewport);
    canvasWrap.appendChild(svg); canvasWrap.appendChild(banner);
    stage.appendChild(canvasWrap); stage.appendChild(panel);
    root.appendChild(toolbar); root.appendChild(stage);

    function nodeById(id) { for (var i = 0; i < diagram.nodes.length; i++) if (diagram.nodes[i].id === id) return diagram.nodes[i]; return null; }
    function edgeById(id) { for (var i = 0; i < diagram.edges.length; i++) if (diagram.edges[i].id === id) return diagram.edges[i]; return null; }
    function takenIds() { var t = {}; diagram.nodes.forEach(function (n) { t[n.id] = true; }); diagram.edges.forEach(function (e) { t[e.id] = true; }); return t; }
    function pushUndo() { ui.lastUndoKey = null; ui.undo.push(flowClone({ nodes: diagram.nodes, edges: diagram.edges })); if (ui.undo.length > 30) ui.undo.shift(); }
    function undo() {
      var prev = ui.undo.pop();
      if (!prev) return;
      diagram.nodes = prev.nodes; diagram.edges = prev.edges;
      if (ui.selected && ui.selected.type === 'node' && !nodeById(ui.selected.id)) ui.selected = null;
      if (ui.selected && ui.selected.type === 'edge' && !edgeById(ui.selected.id)) ui.selected = null;
      changed();
    }
    function pushUndoOnce(key) { return function () { if (ui.lastUndoKey !== key) { pushUndo(); ui.lastUndoKey = key; } }; }
    function notice(text) {
      banner.textContent = text; banner.style.display = 'block';
      clearTimeout(notice._t);
      notice._t = setTimeout(function () { if (!ui.mode) banner.style.display = 'none'; }, 3500);
    }
    function setMode(mode) {
      ui.mode = mode;
      canvasWrap.className = 'cvz-flow-canvas-wrap' + (mode ? ' cvz-flow-connecting' : '');
      if (mode) {
        var from = ui.selected && nodeById(ui.selected.id);
        banner.textContent = 'Klicke den Schritt, ' + (mode === 'connect-retargeting' ? 'der nach "hat gesehen" als Nächstes folgt' : 'zu dem „' + (from ? from.label : '') + '“ führt') + '. Esc bricht ab.';
        banner.style.display = 'block';
      } else banner.style.display = 'none';
    }

    // ---------- Speichern ----------
    function scheduleSave() {
      if (!sessionId) { ui.saveState = 'unsaved'; renderToolbar(); return; }
      ui.saveState = 'dirty'; renderToolbar();
      clearTimeout(ui.saveTimer);
      ui.saveTimer = setTimeout(function () { save(); }, 900);
    }
    function save(keepalive) {
      if (!sessionId) return Promise.resolve();
      clearTimeout(ui.saveTimer);
      ui.saveState = 'saving'; renderToolbar();
      var options = { method: 'PUT', body: JSON.stringify({ version: 1, nodes: diagram.nodes, edges: diagram.edges }) };
      if (keepalive === true) options.keepalive = true;
      return apiFetch('/api/content-strategy/' + sessionId + '/touchpoints', options)
        .then(function () { ui.saveState = 'saved'; if (session) session.touchpoint_diagram = flowClone(diagram); renderToolbar(); })
        .catch(function (err) { ui.saveState = 'error'; ui.saveError = err && err.message ? err.message : 'Unbekannter Fehler'; renderToolbar(); });
    }
    if (state.tpFlushHandler) document.removeEventListener('visibilitychange', state.tpFlushHandler);
    state.tpFlushHandler = function () { if (document.visibilityState === 'hidden' && ui.saveState === 'dirty') save(true); };
    document.addEventListener('visibilitychange', state.tpFlushHandler);
    if (state.tpMenuCloser) document.removeEventListener('click', state.tpMenuCloser);
    state.tpMenuCloser = function () { if (ui.exportOpen) { ui.exportOpen = false; renderToolbar(); } };
    document.addEventListener('click', state.tpMenuCloser);

    function changed() { renderCanvas(); renderPanel(); scheduleSave(); }

    // ---------- Zeichnen ----------
    function applyView() { viewport.setAttribute('transform', 'translate(' + ui.view.x + ',' + ui.view.y + ') scale(' + ui.view.k + ')'); }
    function edgePath(a, b) {
      var fx = a.x + TP_NODE_W / 2, tx = b.x + TP_NODE_W / 2;
      var down = b.y >= a.y;
      var fy = down ? a.y + TP_NODE_H : a.y;
      var ty = down ? b.y : b.y + TP_NODE_H;
      if (Math.abs(b.y - a.y) < TP_NODE_H) {
        var right = b.x > a.x;
        fx = right ? a.x + TP_NODE_W : a.x; tx = right ? b.x : b.x + TP_NODE_W;
        fy = a.y + TP_NODE_H / 2; ty = b.y + TP_NODE_H / 2;
        var mx = (fx + tx) / 2;
        return 'M' + fx + ',' + fy + ' C' + mx + ',' + fy + ' ' + mx + ',' + ty + ' ' + tx + ',' + ty;
      }
      var dy = Math.max(30, Math.abs(ty - fy) / 2);
      var sign = down ? 1 : -1;
      return 'M' + fx + ',' + fy + ' C' + fx + ',' + (fy + sign * dy) + ' ' + tx + ',' + (ty - sign * dy) + ' ' + tx + ',' + ty;
    }
    function dimmed(n) { return !!ui.roleFilter && !!n.role && n.role !== ui.roleFilter; }
    function renderZones() {
      var groups = {};
      diagram.nodes.forEach(function (n) {
        if (n.kind !== 'mail') return;
        var si = tpSeqIndexOf(n);
        var g = groups[si] = groups[si] || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, ref: n.mail_ref };
        g.minX = Math.min(g.minX, n.x); g.minY = Math.min(g.minY, n.y); g.maxX = Math.max(g.maxX, n.x + TP_NODE_W); g.maxY = Math.max(g.maxY, n.y + TP_NODE_H);
      });
      var idx = tpMailIndex(nurture);
      Object.keys(groups).forEach(function (k) {
        var g = groups[k];
        var hit = g.ref ? idx[g.ref] : null;
        var label = tpSeqZoneLabel(hit ? hit.seq : null, endGoal);
        zoneLayer.appendChild(svgEl('rect', { class: 'cvz-tp-zone', x: g.minX - 14, y: g.minY - 34, width: g.maxX - g.minX + 28, height: g.maxY - g.minY + 48 }));
        zoneLayer.appendChild(svgEl('text', { class: 'cvz-tp-zone-label', x: g.minX - 6, y: g.minY - 18 }, [label.slice(0, 90)]));
      });
    }
    function renderCanvas() {
      clear(zoneLayer); clear(edgeLayer); clear(nodeLayer);
      renderZones();
      diagram.edges.forEach(function (e) {
        var a = nodeById(e.from), b = nodeById(e.to);
        if (!a || !b) return;
        var isSel = ui.selected && ui.selected.type === 'edge' && ui.selected.id === e.id;
        var d = edgePath(a, b);
        var g = svgEl('g', { 'data-edge-id': e.id, class: 'cvz-flow-edge' + (isSel ? ' is-selected' : ''), opacity: dimmed(a) || dimmed(b) ? '0.25' : '1' });
        g.appendChild(svgEl('path', { d: d, class: 'cvz-flow-edge-hit', fill: 'none' }));
        g.appendChild(svgEl('path', { d: d, fill: 'none', class: 'cvz-flow-edge-line ' + (e.type === 'retargeting' ? 'is-link' : 'is-hierarchy'), 'marker-end': e.type === 'retargeting' ? 'url(#cvz-tp-arrow-retarget)' : 'url(#cvz-tp-arrow)' }));
        edgeLayer.appendChild(g);
      });
      diagram.nodes.forEach(function (n) {
        var isMail = n.kind === 'mail';
        var isAsset = n.kind === 'asset';
        var color = isMail ? TP_MAIL_COLOR : (isAsset ? TP_ASSET_COLOR : (TP_PHASE_COLORS[n.phase] || '#6e7681'));
        var isSel = ui.selected && ui.selected.type === 'node' && ui.selected.id === n.id;
        var d = tpDataFor(n, plan, nurture);
        var g = svgEl('g', {
          'data-node-id': n.id,
          class: 'cvz-flow-node' + (isSel ? ' is-selected' : '') + (n.kind === 'custom' || (isMail && !n.mail_ref) ? ' is-custom' : '') + (isMail ? ' is-mail' : '') + (isAsset ? ' is-asset' : ''),
          transform: 'translate(' + n.x + ',' + n.y + ')', opacity: dimmed(n) ? '0.25' : '1',
        });
        g.appendChild(svgEl('rect', { class: 'cvz-flow-node-box', width: TP_NODE_W, height: TP_NODE_H, style: 'stroke:' + (isSel ? '#f0f4f8' : 'rgba(255,255,255,.18)') }));
        g.appendChild(svgEl('rect', { width: 5, height: TP_NODE_H, fill: color }));
        var tag = isAsset ? (d && d.origin === 'frei' ? 'Lead-Magnet · frei' : 'Gated Content · hinter E-Mail') : isMail ? 'E-Mail · ' + (n.mail_ref ? tpMailTimingShort(mailModeOf(n), d && d.kind, n.day) : (n.day != null ? 'Tag ' + n.day : 'eigene')) : ((d && d.format_label) || tpFormatLabel(n.format) || (n.kind === 'custom' ? 'Eigener Touchpoint' : 'Touchpoint'));
        g.appendChild(svgEl('text', { class: 'cvz-flow-node-tag', x: 16, y: 17 }, [String(tag).slice(0, 32)]));
        flowWrapText(n.label, 30, 3).forEach(function (line, i) { g.appendChild(svgEl('text', { class: 'cvz-flow-node-label', x: 16, y: 38 + i * 16 }, [line])); });
        var foot = isMail ? (n.role || '') : isAsset ? (tpPhaseLabel(n.phase) + (d && d.effort ? ' · Aufwand ' + d.effort : '')) : (tpPhaseLabel(n.phase) + (n.role ? ' · ' + n.role : ''));
        if (foot) g.appendChild(svgEl('text', { class: 'cvz-flow-node-phase', x: 16, y: TP_NODE_H - 9, fill: color }, [foot.slice(0, 40)]));
        if (d && d.needs_tracking) g.appendChild(svgEl('circle', { cx: TP_NODE_W - 12, cy: 12, r: 5, fill: '#4fd1c5' }, [svgEl('title', {}, ['Setzt Tracking und Einwilligung voraus'])]));
        if (n.channel) g.appendChild(svgEl('text', { class: 'cvz-flow-node-phase', x: TP_NODE_W - 12, y: TP_NODE_H - 9, 'text-anchor': 'end', fill: '#8b949e' }, [String(n.channel).slice(0, 16)]));
        if (n.note) g.appendChild(svgEl('text', { class: 'cvz-flow-node-note', x: TP_NODE_W - 12, y: 30, 'text-anchor': 'end' }, ['✎']));
        nodeLayer.appendChild(g);
      });
      applyView();
    }

    // ---------- Toolbar ----------
    function tbButton(label, title, onClick, extra) {
      var b = el('button', { type: 'button', class: 'cvz-flow-btn' + (extra ? ' ' + extra : ''), title: title || label }, [label]);
      b.addEventListener('click', onClick);
      return b;
    }
    function renderToolbar() {
      clear(toolbar);
      toolbar.appendChild(tbButton('+ Touchpoint', 'Eigenen Touchpoint anlegen', function () { addNode('custom'); }));
      toolbar.appendChild(tbButton('+ E-Mail', 'Eigene E-Mail nach dem Lead anlegen', function () { addNode('mail'); }));
      toolbar.appendChild(tbButton('Rückgängig', 'Letzte Änderung zurücknehmen (Strg/Cmd+Z)', undo, ui.undo.length ? '' : 'is-disabled'));
      if (roles.length > 0) {
        var sel = el('select', { class: 'cvz-flow-input cvz-tp-rolefilter', title: 'Nach Rolle filtern' }, [el('option', { value: '' }, ['Alle Rollen'])].concat(roles.map(function (r) { return el('option', { value: r }, [r]); })));
        sel.value = ui.roleFilter;
        sel.addEventListener('change', function () { ui.roleFilter = sel.value; renderCanvas(); });
        toolbar.appendChild(sel);
      }
      toolbar.appendChild(tbButton('Automatisch ordnen', 'Alle Knoten neu anordnen', function () { pushUndo(); tpAutoLayout(diagram); changed(); fitView(); }));
      toolbar.appendChild(tbButton('Aus Plan neu aufbauen', 'Verwirft alle Änderungen am Diagramm', function () {
        if (!window.confirm('Alle Änderungen am Diagramm verwerfen und neu aus dem Plan aufbauen?')) return;
        pushUndo(); diagram = tpBuildDiagram(plan, nurture); ui.selected = null; changed(); fitView();
      }));
      toolbar.appendChild(el('span', { class: 'cvz-flow-spacer' }));
      toolbar.appendChild(tbButton('−', 'Verkleinern', function () { zoomBy(0.8); }, 'cvz-flow-btn-icon'));
      toolbar.appendChild(tbButton('+', 'Vergrößern', function () { zoomBy(1.25); }, 'cvz-flow-btn-icon'));
      toolbar.appendChild(renderExportMenu());
      toolbar.appendChild(tbButton('Einpassen', 'Ganzes Diagramm anzeigen', fitView));
      toolbar.appendChild(tbButton(ui.fullscreen ? 'Vollbild beenden' : 'Vollbild', 'Vollbild umschalten', toggleFullscreen));
      var labels = { idle: '', dirty: 'Ungespeicherte Änderungen …', saving: 'Speichert …', saved: 'Gespeichert', error: 'Speichern fehlgeschlagen: ' + (ui.saveError || ''), unsaved: 'Wird nicht gespeichert (keine Session)' };
      var status = el('span', { class: 'cvz-flow-save cvz-flow-save-' + ui.saveState }, [labels[ui.saveState] || '']);
      if (ui.saveState === 'error') { status.appendChild(document.createTextNode(' ')); status.appendChild(tbButton('Erneut versuchen', '', function () { save(); })); }
      toolbar.appendChild(status);
    }
    function renderExportMenu() {
      var wrap = el('span', { class: 'cvz-flow-menu-wrap' });
      var button = tbButton('Exportieren ▾', 'Plan als Datei herunterladen', function (evt) { evt.stopPropagation(); ui.exportOpen = !ui.exportOpen; renderToolbar(); });
      button.setAttribute('aria-haspopup', 'true');
      wrap.appendChild(button);
      if (ui.exportOpen) {
        var menu = el('div', { class: 'cvz-flow-menu', role: 'menu' });
        [{ kind: 'table', label: 'Tabelle (CSV)', hint: 'Excel, Google Sheets, Airtable, Notion' }, { kind: 'clickup', label: 'ClickUp (CSV)', hint: 'Aufgaben mit Tags' }, { kind: 'asana', label: 'Asana (CSV)', hint: 'Aufgaben' }].forEach(function (item) {
          var entry = el('button', { type: 'button', class: 'cvz-flow-menu-item', role: 'menuitem' }, [el('span', {}, [item.label]), el('small', {}, [item.hint])]);
          entry.addEventListener('click', function (evt) {
            evt.stopPropagation();
            var out = tpBuildExport(item.kind, diagram, plan, nurture, result.seed_topic, endGoal);
            flowDownload(out.filename, out.text);
            ui.exportOpen = false; renderToolbar();
            notice(out.rows + ' Einträge exportiert: ' + out.filename);
          });
          menu.appendChild(entry);
        });
        wrap.appendChild(menu);
      }
      return wrap;
    }

    // ---------- Seitenleiste ----------
    function field(labelText, control) { return el('label', { class: 'cvz-flow-field' }, [el('span', { class: 'cvz-flow-field-label' }, [labelText]), control]); }
    function labelOfId(id) { var n = nodeById(id); return n ? n.label : '?'; }
    function renderPanel() {
      clear(panel);
      var sel = ui.selected;
      if (!sel) {
        panel.appendChild(el('p', { class: 'cvz-flow-panel-title' }, ['Touchpoint-Plan', tip('Klicke einen Schritt oder eine Verbindung an, um sie zu bearbeiten. Ziehe Schritte mit der Maus, ziehe den Hintergrund, um den Ausschnitt zu bewegen. Strg/Cmd + Mausrad zoomt. Oben stehen die Touchpoints je Phase, darunter die Lead-Magneten und Gated-Content-Ideen, ganz unten die E-Mails nach dem Lead. Die Pfeile zeigen, was zu was führt. Der Weg im B2B ist eine Schleife, keine feste Reihenfolge. Gestrichelt: "Retargeting, wenn gesehen", das setzt Tracking und Einwilligung voraus. Den Kanal trägst du pro Schritt selbst ein. Änderungen werden gespeichert und verändern den Bericht nicht.', 'Hilfe zum Touchpoint-Plan')]));
        panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Klicke einen Schritt an, um ihn zu bearbeiten.']));
        var legend = el('div', { class: 'cvz-flow-legend' });
        TP_PHASES.forEach(function (ph) { legend.appendChild(el('span', { class: 'cvz-flow-legend-item' }, [el('i', { style: 'background:' + TP_PHASE_COLORS[ph.value] }), ph.label])); });
        legend.appendChild(el('span', { class: 'cvz-flow-legend-item' }, [el('i', { style: 'background:' + TP_ASSET_COLOR }), 'Lead-Magnet oder Gated Content']));
        legend.appendChild(el('span', { class: 'cvz-flow-legend-item' }, [el('i', { style: 'background:' + TP_MAIL_COLOR }), 'E-Mail']));
        panel.appendChild(legend);
        return;
      }
      if (sel.type === 'edge') {
        var edge = edgeById(sel.id);
        if (!edge) return;
        panel.appendChild(el('p', { class: 'cvz-flow-panel-title' }, [edge.type === 'retargeting' ? 'Retargeting, wenn gesehen' : 'Führt zu']));
        panel.appendChild(el('p', { class: 'cvz-cs-hint' }, [labelOfId(edge.from) + ' → ' + labelOfId(edge.to)]));
        if (edge.type === 'retargeting') panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Setzt voraus, dass der erste Schritt erfasst wird (Pixel, Tag, Liste) und eine wirksame Einwilligung vorliegt.']));
        panel.appendChild(tbButton(edge.type === 'retargeting' ? 'In "führt zu" umwandeln' : 'In Retargeting umwandeln', '', function () { pushUndo(); edge.type = edge.type === 'retargeting' ? 'fuehrt_zu' : 'retargeting'; changed(); }));
        panel.appendChild(tbButton('Umkehren', 'Richtung tauschen', function () { pushUndo(); var t = edge.from; edge.from = edge.to; edge.to = t; changed(); }));
        panel.appendChild(tbButton('Verbindung löschen', '', function () { pushUndo(); diagram.edges = diagram.edges.filter(function (x) { return x.id !== edge.id; }); ui.selected = null; changed(); }, 'cvz-flow-btn-danger'));
        return;
      }
      var node = nodeById(sel.id);
      if (!node) return;
      var d = tpDataFor(node, plan, nurture);
      var isMail = node.kind === 'mail';
      var isAsset = node.kind === 'asset';
      panel.appendChild(el('p', { class: 'cvz-flow-panel-title' }, [isAsset ? (d && d.origin === 'frei' ? 'Lead-Magnet' : 'Gated Content') : isMail ? ({ vor_termin: 'E-Mail bis zum Termin', reaktivierung: 'E-Mail zur Reaktivierung (von Hand)', onboarding: 'E-Mail im Onboarding' }[mailModeOf(node)] || 'E-Mail nach dem Lead') : (node.kind === 'custom' ? 'Eigener Touchpoint' : 'Touchpoint')]));
      if (d && isAsset) {
        panel.appendChild(el('p', { class: 'cvz-cs-hint' }, [[d.phase_label, d.format_label, d.effort ? 'Aufwand ' + d.effort : '', d.origin === 'frei' ? 'frei zugänglich' : 'hinter E-Mail, mit deiner Substanz'].filter(Boolean).join(' · ')]));
        if (d.promise) panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, ['Versprechen: ' + d.promise]));
        if (d.content_points && d.content_points.length) panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, ['Inhalt: ' + d.content_points.join('; ')]));
        if (d.conversion_bridge) panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, ['Danach: ' + d.conversion_bridge]));
        (d.notes || []).forEach(function (t) { panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, [t])); });
      }
      if (d && !isAsset) {
        if (isMail) {
          var hitSeq = tpMailIndex(nurture)[node.mail_ref];
          panel.appendChild(el('p', { class: 'cvz-cs-hint' }, [(d.kind_label || '') + ' · ' + tpMailTiming(mailModeOf(node), d.kind, node.day) + ' (Vorschlag)']));
          if (hitSeq && hitSeq.seq.trigger) panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, [hitSeq.seq.trigger]));
          if (hitSeq && tpIsLegacyMeetingDrip(hitSeq.seq, endGoal)) panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Älterer Plan: Nach einer Terminanfrage übernimmt der Vertrieb. Diese Mail nicht automatisch versenden.']));
        } else {
          panel.appendChild(el('p', { class: 'cvz-cs-hint' }, [tpPhaseLabel(d.phase) + ' · ' + d.format_label + ' · ' + (TP_BASIS_LABELS[d.basis] || d.basis)]));
        }
        panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, ['Botschaft: ' + d.message]));
        if (d.objection) panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, ['Räumt aus (' + (d.objection_source === 'rolle' ? 'Einwand der Rolle' : d.objection_source === 'kundenfrage' ? 'Kundenfrage' : 'Vermutung') + '): ' + d.objection]));
        if (d.target_asset) panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, ['Führt auf: ' + d.target_asset.label]));
        if (d.micro_conversion) panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, ['Mikro-Conversion: ' + d.micro_conversion]));
        (d.from || []).forEach(function (f) { panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, [(f.kind === 'retargeting' ? 'Retargeting, wenn gesehen: ' : 'Folgt auf: ') + labelOfId(f.id)])); });
        (d.exclude_seen || []).forEach(function (id) { panel.appendChild(el('p', { class: 'cvz-flow-reasoning' }, ['Ausgeschlossen, wer schon gesehen hat: ' + labelOfId(id)])); });
        if (d.needs_tracking) panel.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Setzt Tracking und eine wirksame Einwilligung voraus.']));
      }
      var labelInput = el('textarea', { class: 'cvz-flow-input', rows: '2', maxlength: String(TP_LIMITS.label) });
      labelInput.value = node.label;
      labelInput.addEventListener('focus', pushUndoOnce(node.id + ':label'));
      labelInput.addEventListener('input', function () { var v = labelInput.value.trim(); if (!v) return; node.label = v.slice(0, TP_LIMITS.label); renderCanvas(); scheduleSave(); });
      panel.appendChild(field(isAsset ? 'Titel' : isMail ? 'Lernziel' : 'Titel (Lernziel)', labelInput));
      if (node.kind === 'custom') {
        var phaseSel = el('select', { class: 'cvz-flow-input' }, [el('option', { value: '' }, ['Keine Phase'])].concat(TP_PHASES.map(function (p) { return el('option', { value: p.value }, [p.label]); })));
        phaseSel.value = node.phase || '';
        phaseSel.addEventListener('change', function () { pushUndo(); node.phase = phaseSel.value || undefined; changed(); });
        panel.appendChild(field('Phase', phaseSel));
        var fmtSel = el('select', { class: 'cvz-flow-input' }, [el('option', { value: '' }, ['Kein Format'])].concat(TP_FORMATS.map(function (f) { return el('option', { value: f.id }, [f.label]); })));
        fmtSel.value = node.format || '';
        fmtSel.addEventListener('change', function () { pushUndo(); node.format = fmtSel.value || undefined; changed(); });
        panel.appendChild(field('Format', fmtSel));
      }
      if (isMail && !(d && d.kind === 'bestaetigung')) { // Die Bestätigung geht sofort raus, ohne Tag
        var dayInput = el('input', { type: 'number', class: 'cvz-flow-input', min: '0', max: '365', step: '1' });
        dayInput.value = node.day != null ? String(node.day) : '';
        dayInput.addEventListener('focus', pushUndoOnce(node.id + ':day'));
        dayInput.addEventListener('input', function () {
          var v = parseInt(dayInput.value, 10);
          node.day = isFinite(v) ? Math.max(0, Math.min(365, v)) : null;
          renderCanvas(); scheduleSave();
        });
        panel.appendChild(field(tpDayFieldLabel(mailModeOf(node)), dayInput));
      }
      var roleControl;
      if (roles.length > 0) {
        roleControl = el('select', { class: 'cvz-flow-input' }, [el('option', { value: '' }, ['Keine Rolle'])].concat(roles.map(function (r) { return el('option', { value: r }, [r]); })));
        roleControl.value = node.role || '';
        roleControl.addEventListener('change', function () { pushUndo(); node.role = roleControl.value || null; changed(); });
      } else {
        roleControl = el('input', { type: 'text', class: 'cvz-flow-input', maxlength: '120' });
        roleControl.value = node.role || '';
        roleControl.addEventListener('focus', pushUndoOnce(node.id + ':role'));
        roleControl.addEventListener('input', function () { node.role = roleControl.value.trim().slice(0, 120) || null; renderCanvas(); scheduleSave(); });
      }
      if (!isAsset) panel.appendChild(field('Rolle', roleControl));
      var channelInput = el('input', { type: 'text', class: 'cvz-flow-input', maxlength: String(TP_LIMITS.channel), placeholder: 'z. B. LinkedIn, Google Search, Newsletter' });
      channelInput.value = node.channel || '';
      channelInput.addEventListener('focus', pushUndoOnce(node.id + ':channel'));
      channelInput.addEventListener('input', function () { node.channel = channelInput.value.trim().slice(0, TP_LIMITS.channel) || null; renderCanvas(); scheduleSave(); });
      panel.appendChild(field('Kanal (du entscheidest)', channelInput));
      var noteInput = el('textarea', { class: 'cvz-flow-input', rows: '3', maxlength: String(TP_LIMITS.note), placeholder: 'Eigene Notiz, z. B. Verantwortliche Person, Deadline, Idee' });
      noteInput.value = node.note || '';
      noteInput.addEventListener('focus', pushUndoOnce(node.id + ':note'));
      noteInput.addEventListener('input', function () { node.note = noteInput.value.slice(0, TP_LIMITS.note) || undefined; renderCanvas(); scheduleSave(); });
      panel.appendChild(field('Notiz', noteInput));
      var actions = el('div', { class: 'cvz-flow-actions' });
      actions.appendChild(tbButton('Führt zu …', 'Von diesem Schritt zu einem anderen', function () { setMode('connect-fuehrt'); }));
      actions.appendChild(tbButton('Retargeting zu …', 'Wer diesen Schritt gesehen hat, bekommt den nächsten', function () { setMode('connect-retargeting'); }));
      actions.appendChild(tbButton('Aus Diagramm entfernen', 'Entfernt nur den Knoten im Diagramm, nicht aus dem Plan', function () { removeNode(node.id); }, 'cvz-flow-btn-danger'));
      panel.appendChild(actions);
    }

    // ---------- Aktionen ----------
    function addNode(kind) {
      if (diagram.nodes.length >= TP_LIMITS.nodes) { notice('Maximal ' + TP_LIMITS.nodes + ' Schritte im Diagramm.'); return; }
      pushUndo();
      var id = flowNewId('n', takenIds());
      var rect = svg.getBoundingClientRect();
      var x = (rect.width / 2 - ui.view.x) / ui.view.k - TP_NODE_W / 2;
      var y = (rect.height / 2 - ui.view.y) / ui.view.k - TP_NODE_H / 2;
      var node = kind === 'mail'
        ? { id: id, kind: 'mail', mail_ref: null, label: 'Neue E-Mail', day: 7, role: null, channel: null, x: flowClamp(Math.round(x)), y: flowClamp(Math.round(y)) }
        : { id: id, kind: 'custom', label: 'Neuer Touchpoint', role: null, channel: null, x: flowClamp(Math.round(x)), y: flowClamp(Math.round(y)) };
      diagram.nodes.push(node);
      ui.selected = { type: 'node', id: id };
      changed();
      var input = panel.querySelector('textarea');
      if (input) { input.focus(); input.select(); }
    }
    function removeNode(id) {
      pushUndo();
      diagram.nodes = diagram.nodes.filter(function (n) { return n.id !== id; });
      diagram.edges = diagram.edges.filter(function (e) { return e.from !== id && e.to !== id; });
      ui.selected = null;
      changed();
    }
    function connect(fromId, toId, type) {
      if (fromId === toId) { notice('Ein Schritt kann nicht auf sich selbst zeigen.'); return; }
      if (diagram.edges.length >= TP_LIMITS.edges) { notice('Maximal ' + TP_LIMITS.edges + ' Verbindungen im Diagramm.'); return; }
      var exists = diagram.edges.some(function (e) { return e.from === fromId && e.to === toId && e.type === type; });
      if (exists) { notice('Diese Verbindung gibt es schon.'); return; }
      pushUndo();
      diagram.edges.push({ id: flowNewId('e', takenIds()), from: fromId, to: toId, type: type });
      changed(); renderToolbar();
    }

    // ---------- Ansicht ----------
    function zoomBy(factor, cx, cy) {
      var rect = svg.getBoundingClientRect();
      var px = cx != null ? cx : rect.width / 2, py = cy != null ? cy : rect.height / 2;
      var nk = Math.max(0.25, Math.min(2.5, ui.view.k * factor));
      var real = nk / ui.view.k;
      ui.view.x = px - (px - ui.view.x) * real; ui.view.y = py - (py - ui.view.y) * real; ui.view.k = nk;
      applyView();
    }
    function fitView() {
      var rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height || diagram.nodes.length === 0) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      diagram.nodes.forEach(function (n) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y - 36); maxX = Math.max(maxX, n.x + TP_NODE_W); maxY = Math.max(maxY, n.y + TP_NODE_H); });
      var pad = 32;
      var k = Math.max(0.25, Math.min((rect.width - pad * 2) / (maxX - minX), (rect.height - pad * 2) / (maxY - minY), 1.2));
      ui.view.k = k;
      ui.view.x = pad + (rect.width - pad * 2 - (maxX - minX) * k) / 2 - minX * k;
      ui.view.y = pad + (rect.height - pad * 2 - (maxY - minY) * k) / 2 - minY * k;
      applyView();
    }
    function toggleFullscreen() {
      ui.fullscreen = !ui.fullscreen;
      root.className = 'cvz-flow cvz-tp-flow' + (ui.fullscreen ? ' is-fullscreen' : '');
      renderToolbar();
      setTimeout(fitView, 30);
    }

    // ---------- Maus / Touch ----------
    function toLocal(evt) { var rect = svg.getBoundingClientRect(); return { x: evt.clientX - rect.left, y: evt.clientY - rect.top }; }
    svg.addEventListener('pointerdown', function (evt) {
      if (evt.button !== undefined && evt.button !== 0) return;
      var nodeG = evt.target.closest ? evt.target.closest('[data-node-id]') : null;
      var edgeG = evt.target.closest ? evt.target.closest('[data-edge-id]') : null;
      if (svg.focus) svg.focus({ preventScroll: true });
      var pt = toLocal(evt);
      if (ui.mode && nodeG) {
        var from = ui.selected && ui.selected.type === 'node' ? ui.selected.id : null;
        var type = ui.mode === 'connect-retargeting' ? 'retargeting' : 'fuehrt_zu';
        setMode(null);
        if (from) connect(from, nodeG.getAttribute('data-node-id'), type);
        evt.preventDefault();
        return;
      }
      if (nodeG) {
        var id = nodeG.getAttribute('data-node-id');
        var n = nodeById(id);
        ui.selected = { type: 'node', id: id };
        ui.drag = { kind: 'node', id: id, startX: pt.x, startY: pt.y, origX: n.x, origY: n.y, moved: false };
        renderCanvas(); renderPanel();
      } else if (edgeG) {
        ui.selected = { type: 'edge', id: edgeG.getAttribute('data-edge-id') };
        renderCanvas(); renderPanel();
        return;
      } else {
        if (ui.mode) setMode(null);
        ui.selected = null;
        ui.drag = { kind: 'pan', startX: pt.x, startY: pt.y, origX: ui.view.x, origY: ui.view.y, moved: false };
        renderCanvas(); renderPanel();
      }
      try { svg.setPointerCapture(evt.pointerId); } catch (e) { /* ältere Browser */ }
      evt.preventDefault();
    });
    svg.addEventListener('pointermove', function (evt) {
      if (!ui.drag) return;
      var pt = toLocal(evt);
      var dx = pt.x - ui.drag.startX, dy = pt.y - ui.drag.startY;
      if (!ui.drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (ui.drag.kind === 'node') {
        if (!ui.drag.moved) pushUndo();
        ui.drag.moved = true;
        var n = nodeById(ui.drag.id);
        if (!n) return;
        n.x = flowClamp(Math.round(ui.drag.origX + dx / ui.view.k));
        n.y = flowClamp(Math.round(ui.drag.origY + dy / ui.view.k));
        renderCanvas();
      } else {
        ui.drag.moved = true;
        ui.view.x = ui.drag.origX + dx; ui.view.y = ui.drag.origY + dy;
        applyView();
      }
    });
    function endDrag(evt) {
      if (!ui.drag) return;
      var wasNodeMove = ui.drag.kind === 'node' && ui.drag.moved;
      ui.drag = null;
      try { svg.releasePointerCapture(evt.pointerId); } catch (e) { /* egal */ }
      if (wasNodeMove) { renderToolbar(); scheduleSave(); }
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('wheel', function (evt) {
      if (!(evt.ctrlKey || evt.metaKey) && !ui.fullscreen) return;
      evt.preventDefault();
      var pt = toLocal(evt);
      zoomBy(evt.deltaY < 0 ? 1.12 : 1 / 1.12, pt.x, pt.y);
    }, { passive: false });
    svg.addEventListener('keydown', function (evt) {
      if ((evt.ctrlKey || evt.metaKey) && (evt.key === 'z' || evt.key === 'Z')) { evt.preventDefault(); undo(); return; }
      if (evt.key === 'Escape') {
        if (ui.exportOpen) { ui.exportOpen = false; renderToolbar(); return; }
        if (ui.mode) setMode(null); else if (ui.fullscreen) toggleFullscreen();
        return;
      }
      if ((evt.key === 'Delete' || evt.key === 'Backspace') && ui.selected) {
        evt.preventDefault();
        if (ui.selected.type === 'node') removeNode(ui.selected.id);
        else { var eid = ui.selected.id; pushUndo(); diagram.edges = diagram.edges.filter(function (x) { return x.id !== eid; }); ui.selected = null; changed(); }
      }
    });

    renderToolbar(); renderCanvas(); renderPanel();
    var fitTries = 0;
    (function tryFit() {
      var rect = svg.getBoundingClientRect();
      if ((rect.width > 0 && rect.height > 0) || fitTries++ > 20) { if (rect.width > 0) fitView(); return; }
      setTimeout(tryFit, 100);
    })();
    // Für Tests und spätere Erweiterungen: Zugriff auf den aktuellen Stand.
    root.cvzGetDiagram = function () { return diagram; };
    root.cvzSave = save;
    return root;
  }

  var TOUCHPOINT_STYLES = [
    '#cvz-content-strategy-agent .cvz-tp-flow .cvz-flow-node.is-mail .cvz-flow-node-box{fill:#0f2321;}',
    '#cvz-content-strategy-agent .cvz-tp-flow .cvz-flow-node.is-asset .cvz-flow-node-box{fill:#241329;}',
    '#cvz-content-strategy-agent .cvz-tp-zone{fill:rgba(79,209,197,.04);stroke:rgba(79,209,197,.35);stroke-dasharray:4 4;pointer-events:none;}',
    '#cvz-content-strategy-agent .cvz-tp-zone-label{font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;fill:#4fd1c5;font-family:inherit;pointer-events:none;}',
    '#cvz-content-strategy-agent .cvz-tp-rolefilter{width:auto;max-width:200px;padding:5px 8px;}',
    '#cvz-content-strategy-agent .cvz-tp-form{margin:0 0 20px;}',
    '#cvz-content-strategy-agent .cvz-tp-entry{border:1px solid var(--cvz-border-strong);background:var(--cvz-surface);padding:14px 16px;margin-bottom:12px;text-align:left;}',
    '#cvz-content-strategy-agent .cvz-tp-entry-num{font-family:"Syne",sans-serif;font-weight:700;color:var(--cvz-heading);}',
    '#cvz-content-strategy-agent .cvz-tp-status{font-size:13px;margin:4px 0 0;}',
    '#cvz-content-strategy-agent .cvz-tp-status-ok{color:var(--cvz-teal);}',
    '#cvz-content-strategy-agent .cvz-tp-status-vague{color:var(--cvz-amber);}',
    '#cvz-content-strategy-agent .cvz-tp-status-intern{color:#fca5a5;}',
    '#cvz-content-strategy-agent .cvz-tp-summary{font-weight:600;color:var(--cvz-text);}',
    '#cvz-content-strategy-agent .cvz-tp-verdict-none{padding:14px 18px;border:1px solid rgba(245,158,11,.35);border-left:4px solid var(--cvz-amber);background:rgba(245,158,11,.06);margin:0 0 16px;}',
    '#cvz-content-strategy-agent .cvz-tp-verdict-title{font-family:"Syne",sans-serif;font-weight:700;font-size:1.05rem;color:var(--cvz-heading);margin:0 0 6px;}',
    '#cvz-content-strategy-agent .cvz-tp-gated,#cvz-content-strategy-agent .cvz-tp-demand{margin:0 0 24px;}',
  ];
  // ==== TOUCHPOINT-ENDE ====

  // ==== TOOLTIP-ANFANG ====
  // NEU (Übersicht): Erklärungen stehen nicht mehr als Dauertext im Bericht, sondern hinter einem kleinen "i". Die Blase öffnet bei Hover und
  // Tastaturfokus sowie per Tipp (Handy, dort gibt es kein Hover). Ein Tipp hält sie offen, ein Tipp daneben oder Esc schließt sie. Beim
  // Scrollen folgt sie dem Symbol. Der Text bleibt im DOM (Bildschirmleser). Wichtige Hinweise (Einwilligung, Warnungen, Hypothesen, Grenzen
  // der Daten) bleiben sichtbar und gehören NICHT in einen Tooltip.
  var tipSeq = 0;
  var tipOpen = null;
  var tipWired = false;

  function tipPlace(wrap) {
    var btn = wrap.firstChild;
    var bubble = wrap.lastChild;
    var r = btn.getBoundingClientRect();
    var vw = window.innerWidth || document.documentElement.clientWidth || 360;
    var vh = window.innerHeight || document.documentElement.clientHeight || 700;
    var w = bubble.offsetWidth || 0;
    var h = bubble.offsetHeight || 0;
    var left = Math.max(8, Math.min(r.left - 10, vw - w - 8));
    var top = r.bottom + 8;
    if (h && top + h > vh - 8 && r.top - 8 - h > 8) top = r.top - 8 - h; // unten kein Platz: über dem Symbol
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }

  function tipHide(wrap) {
    if (!wrap) return;
    wrap.classList.remove('is-open');
    wrap._pinned = false;
    wrap.firstChild.setAttribute('aria-expanded', 'false');
    if (tipOpen === wrap) tipOpen = null;
  }

  function tipShow(wrap) {
    if (tipOpen && tipOpen !== wrap) tipHide(tipOpen);
    wrap.classList.add('is-open');
    wrap.firstChild.setAttribute('aria-expanded', 'true');
    tipOpen = wrap;
    tipPlace(wrap);
  }

  function tipWire() {
    if (tipWired) return;
    tipWired = true;
    document.addEventListener('click', function (e) { if (tipOpen && !tipOpen.contains(e.target)) tipHide(tipOpen); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && tipOpen) tipHide(tipOpen); });
    window.addEventListener('scroll', function () { if (tipOpen) tipPlace(tipOpen); }, true);
    window.addEventListener('resize', function () { if (tipOpen) tipPlace(tipOpen); });
  }

  // Kleines "i" mit Erklärung. text: der Erklärtext. label: Beschriftung für Bildschirmleser.
  function tip(text, label) {
    tipWire();
    var id = 'cvz-tip-' + (++tipSeq);
    var btn = el('button', { type: 'button', class: 'cvz-tip-btn', 'aria-label': label || 'Erklärung anzeigen', 'aria-expanded': 'false', 'aria-describedby': id }, ['?']);
    var bubble = el('span', { class: 'cvz-tip-bubble', role: 'tooltip', id: id }, [text]);
    var wrap = el('span', { class: 'cvz-tip' }, [btn, bubble]);
    wrap._pinned = false;
    wrap.addEventListener('mouseenter', function () { tipShow(wrap); });
    wrap.addEventListener('mouseleave', function () { if (!wrap._pinned) tipHide(wrap); });
    btn.addEventListener('focus', function () { tipShow(wrap); });
    btn.addEventListener('blur', function () { if (!wrap._pinned) tipHide(wrap); });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (wrap._pinned) { tipHide(wrap); return; }
      tipShow(wrap);
      wrap._pinned = true;
    });
    return wrap;
  }

  // GEÄNDERT: Aussehen wie beim Journey Tracker (.cvz-tip und das gemeinsame Popup .cvz-float-tip): kleiner runder Knopf mit "?", Popup auf
  // #1e2a36 mit Rahmen #232b36, eckig, Schrift Geist 13 px, weicher Schatten, Einblenden in 0,15 s, ohne Mauszeiger-Fang. Auf Touch-Geräten ist
  // die Tippfläche größer (der Knopf selbst bleibt 16 px).
  var TIP_STYLES = [
    '#cvz-content-strategy-agent .cvz-tip{position:relative;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:5px;flex-shrink:0;line-height:1;text-transform:none;letter-spacing:normal;font-weight:400;}',
    '#cvz-content-strategy-agent .cvz-tip-btn{position:relative;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;padding:0;border:1px solid var(--cvz-border,#232b36);background:var(--cvz-navy-raised,#141b24);color:var(--cvz-text-muted,#8b98a5);font:700 11px/1 "Geist",sans-serif;font-style:normal;text-align:center;cursor:pointer;user-select:none;}',
    // Rund trotz der globalen Regel "alles eckig" (siehe oben, * {border-radius:0 !important}): eigenes !important mit höherer Spezifität.
    '#cvz-content-strategy-agent .cvz-tip-btn{border-radius:50% !important;}',
    '#cvz-content-strategy-agent .cvz-tip-btn:focus{outline:1px solid var(--cvz-teal,#4fd1c5);outline-offset:1px;}',
    '@media (pointer: coarse){#cvz-content-strategy-agent .cvz-tip-btn::before{content:"";position:absolute;top:-12px;right:-12px;bottom:-12px;left:-12px;}}',
    '#cvz-content-strategy-agent .cvz-tip-bubble{position:fixed;left:0;top:0;z-index:100000;width:max-content;min-width:0;max-width:min(300px, calc(100vw - 16px));box-sizing:border-box;padding:8px 10px;background:#1e2a36;border:1px solid #232b36;border-radius:0;font-family:"Geist",sans-serif;font-size:13px;font-weight:400;font-style:normal;line-height:1.5;letter-spacing:normal;text-transform:none;color:#e6edf3;text-align:left;white-space:normal;box-shadow:0 4px 16px rgba(0,0,0,.4);pointer-events:none;opacity:0;visibility:hidden;transition:opacity .15s ease;}',
    '#cvz-content-strategy-agent .cvz-tip.is-open .cvz-tip-bubble{opacity:1;visibility:visible;}',
  ];

  // ==== TOOLTIP-ENDE ====

  // ==== PROFIL-ANFANG ====
  // NEU (Produktprofil): Schritt "Produkt bestätigen" nach der Themen-Prüfung. Der Server liest die eigene Domain und leitet einen Entwurf
  // ab (POST /suggest-profile), der Kunde prüft und bestätigt ihn. Bestätigt wird pro Domain gespeichert, beim nächsten Mal ist der Schritt
  // vorbelegt. Ohne Domain oder bei einem Fehler lässt sich der Schritt überspringen, die Strategie läuft dann wie bisher ohne Profil.
  var PROFILE_LIMITS = { items: 6, competitors: 8, item: 140, desc: 500, category: 100 };
  // GEÄNDERT (Beratung, Systemhaus, Managed Service): Fragen und Beispiele waren für ein Software-Werkzeug geschrieben ("veröffentlicht keine Seiten",
  // "CMS"). Jetzt passen Beschriftung, Hinweis und Beispiel zum Angebotstyp aus dem Startformular (gleiche Gruppen wie im Backend, profileKindOf).
  // "Womit arbeitet es zusammen?" nimmt ausdrücklich nur Dritte auf. Eigene Leistungen gehören zu "Was kann dein Angebot?".
  function profileKindOf(offerType) {
    if (offerType === 'saas' || offerType === 'software_vertrieb') return 'software';
    if (offerType === 'produkt' || offerType === 'b2b_produkt') return 'produkt';
    if (offerType === 'beratung' || offerType === 'projekt' || offerType === 'managed_service' || offerType === 'dienstleistung') return 'dienstleistung';
    if (offerType === 'schulung') return 'schulung'; // NEU
    return 'offen';
  }
  var PROFILE_FIELD_TEXTS = {
    software: {
      kategorie: 'z. B. Landingpage-Generator',
      kann: ['Was kann dein Angebot?', 'Eine Fähigkeit pro Zeile.', 'z. B. Landingpage aus einem Briefing erzeugen'],
      kann_nicht: ['Was kann es NICHT?', 'Besonders wichtig. Die Strategie empfiehlt nichts, was hier steht. Zum Beispiel "veröffentlicht keine Seiten" oder "keine On-Premise-Installation".', 'z. B. veröffentlicht keine Seiten'],
      ergaenzt: ['Mit welchen fremden Produkten arbeitet es zusammen? (kein Wettbewerb)', 'Nur Produkte anderer Anbieter, mit denen dein Angebot zusammenspielt, zum Beispiel ein CMS oder CRM. Dagegen wird nie verglichen. Eigene Funktionen gehören nicht hierher, sondern zu den Fähigkeiten deines Angebots.', 'z. B. CMS (WordPress, Webflow)'],
      ersetzt: ['Gegen wen tritt es an?', 'Was deine Kunden stattdessen wählen würden. Nur dagegen wird verglichen.', 'z. B. Agentur'],
      konkurrenten: 'z. B. unbounce.com',
    },
    produkt: {
      kategorie: 'z. B. Industrie-Messtechnik',
      kann: ['Was kann dein Angebot?', 'Eine Eigenschaft oder Leistung pro Zeile.', 'z. B. misst Temperatur bis 1.200 °C'],
      kann_nicht: ['Was kann es NICHT?', 'Besonders wichtig. Die Strategie empfiehlt nichts, was hier steht. Zum Beispiel "keine Montage vor Ort" oder "keine Sonderanfertigung".', 'z. B. keine Montage vor Ort'],
      ergaenzt: ['Mit welchen fremden Produkten wird es eingesetzt? (kein Wettbewerb)', 'Nur Produkte oder Systeme anderer Hersteller, mit denen dein Produkt zusammen genutzt wird. Dagegen wird nie verglichen. Eigenes Zubehör und eigener Service gehören nicht hierher, sondern zu den Fähigkeiten deines Angebots.', 'z. B. Steuerungen von Siemens'],
      ersetzt: ['Gegen wen tritt es an?', 'Was deine Kunden stattdessen wählen würden. Nur dagegen wird verglichen.', 'z. B. Gebrauchtgerät'],
      konkurrenten: 'z. B. wettbewerber.de',
    },
    dienstleistung: {
      kategorie: 'z. B. SAP-Beratung oder Managed Hosting',
      kann: ['Was leistest du?', 'Eine Leistung pro Zeile, auch eigene Ressourcen wie Rechenzentren, Team oder Zertifizierungen und die Systeme, die du einführst oder betreibst.', 'z. B. Betrieb von SAP-Systemen in eigenen Rechenzentren'],
      kann_nicht: ['Was bietest du NICHT an?', 'Besonders wichtig. Die Strategie empfiehlt nichts, was hier steht. Zum Beispiel "keine Rechtsberatung", "kein Betrieb außerhalb der EU" oder "keine Projekte unter 20 Personentagen".', 'z. B. keine reine Lizenz ohne Projekt'],
      ergaenzt: ['Mit welchen Herstellern und Plattformen arbeitest du? (kein Wettbewerb)', 'Nur Dritte: Software, Clouds oder Hersteller, die du einführst, betreibst oder mit denen du als Partner arbeitest. Dagegen wird nie verglichen. Weitere eigene Leistungen gehören nicht hierher.],
      ersetzt: ['Gegen wen trittst du an?', 'Was deine Kunden stattdessen wählen würden, zum Beispiel die eigene IT oder ein anderes Systemhaus. Nur dagegen wird verglichen.', 'z. B. interne IT-Abteilung'],
      konkurrenten: 'z. B. wettbewerber.de',
    },
    schulung: {
      kategorie: 'z. B. Seminar für Projektleiter oder Zertifizierungskurs',
      kann: ['Was bietest du an?', 'Eine Leistung pro Zeile: Formate (Präsenz, online, inhouse), Abschlüsse, Trainer, Orte und Termine.', 'z. B. Präsenz in Hamburg und online, mit Zertifikat'],
      kann_nicht: ['Was bietest du NICHT an?', 'Besonders wichtig. Die Strategie empfiehlt nichts, was hier steht. Zum Beispiel "keine Inhouse-Termine unter 6 Teilnehmenden" oder "keine staatlich anerkannte Prüfung".', 'z. B. kein E-Learning zum Selbstlernen'],
      ergaenzt: ['Mit welchen Prüfstellen, Herstellern oder Plattformen arbeitest du? (kein Wettbewerb)', 'Nur Dritte: Zertifizierer, Hersteller der geschulten Software oder Lernplattformen anderer Anbieter. Dagegen wird nie verglichen. Eigene Kurse und Trainer gehören nicht hierher, sondern zu deinen Leistungen.', 'z. B. PMI, TÜV, SAP'],
      ersetzt: ['Gegen wen trittst du an?', 'Was deine Kunden stattdessen wählen würden, zum Beispiel andere Seminaranbieter oder Selbstlernen. Nur dagegen wird verglichen.', 'z. B. Selbstlernen mit Online-Kursen'],
      konkurrenten: 'z. B. wettbewerber.de',
    },
    offen: {
      kategorie: 'z. B. Projektmanagement-Software oder SAP-Beratung',
      kann: ['Was kann dein Angebot?', 'Eine Fähigkeit oder Leistung pro Zeile.', 'z. B. Betrieb von SAP-Systemen'],
      kann_nicht: ['Was kann es NICHT?', 'Besonders wichtig. Die Strategie empfiehlt nichts, was hier steht. Zum Beispiel "kein Betrieb, nur Beratung" oder "veröffentlicht keine Seiten".', 'z. B. kein Betrieb, nur Beratung'],
      ergaenzt: ['Mit welchen fremden Produkten oder Partnern arbeitet es zusammen? (kein Wettbewerb)', 'Nur Dritte: Produkte, Plattformen oder Hersteller anderer Unternehmen. Dagegen wird nie verglichen. Eigene Leistungen gehören nicht hierher, sondern zu den Fähigkeiten deines Angebots.', 'z. B. SAP S/4HANA'],
      ersetzt: ['Gegen wen tritt es an?', 'Was deine Kunden stattdessen wählen würden. Nur dagegen wird verglichen.', 'z. B. interne Umsetzung'],
      konkurrenten: 'z. B. wettbewerber.de',
    },
  };
  function profileFieldDefs(offerType) {
    var t = PROFILE_FIELD_TEXTS[profileKindOf(offerType)];
    var f = function (key, max, flag) { return { key: key, label: t[key][0], hint: t[key][1], placeholder: t[key][2], max: max, flag: !!flag }; };
    return [
      f('kann', 6),
      f('kann_nicht', 6, true),
      f('ergaenzt', 6, true),
      f('ersetzt', 6),
      { key: 'konkurrenten', label: 'Direkte Wettbewerber (optional)', hint: 'Namen oder Domains. Sie bekommen nie eine Off-Site-Maßnahme.', max: 8, placeholder: t.konkurrenten },
    ];
  }
  // Ohne Angebotstyp (zum Beispiel beim Start aus dem Tracker) gelten neutrale Texte.
  var PROFILE_FIELD_DEFS = profileFieldDefs(null);

  // Erkennt Zeilen unter "arbeitet zusammen", die nach eigener Leistung klingen ("eigene", "unser", "wir" oder der eigene Name aus der Domain).
  // Gleiche Regel wie im Backend (splitOwnComplements). Nur ein Hinweis, der Kunde entscheidet.
  function foldText(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'); }
  function ownBrandStem(host) {
    var parts = String(host || '').toLowerCase().split('.');
    var label = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || '');
    var stem = foldText(label).replace(/[^a-z0-9]/g, '');
    return stem.length >= 4 ? stem : '';
  }
  var OWN_MARKER_RE = /(^|[^a-z0-9])(eigene[nmrs]?|unser(e[nmrs]?)?|wir|uns|hauseigene[nmrs]?|inhouse|in-house)(?![a-z0-9])/;
  function ownComplementLines(text, host) {
    var brand = ownBrandStem(host);
    return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) {
      if (l.length < 2) return false;
      var f = foldText(l);
      return OWN_MARKER_RE.test(f) || (!!brand && f.replace(/[^a-z0-9]/g, '').indexOf(brand) >= 0);
    });
  }

  // NEU (Wirtschaftlichkeit): grobe Klasse für den Wert eines Kunden. Leer = aus Angebotstyp und Zielaktion ableiten.
  var PROFILE_VALUE_OPTIONS = [
    { value: '', label: 'Aus Angebotstyp und Zielaktion ableiten' },
    { value: 'klein', label: 'Klein: bis ca. 2.000 € pro Kunde und Jahr (meist Selbstbedienung)' },
    { value: 'mittel', label: 'Mittel: ca. 2.000 bis 20.000 € pro Kunde und Jahr' },
    { value: 'gross', label: 'Groß: über ca. 20.000 € pro Kunde und Jahr (Vertrieb mit persönlichem Kontakt)' },
  ];
  var PROFILE_VALUE_LABELS = { klein: 'Klein (bis ca. 2.000 € pro Kunde und Jahr)', mittel: 'Mittel (ca. 2.000 bis 20.000 €)', gross: 'Groß (über ca. 20.000 €)' };

  // NEU: Produktseite des Angebots prüfen (gleiche Regeln wie im Backend, normalizeProductUrl): nur die Domain des Kunden oder eine Subdomain,
  // ohne Anker. Leer ist erlaubt. Der Server prüft noch einmal.
  function checkProductUrl(input, host) {
    var raw = String(input || '').trim();
    if (!raw) return { url: '', error: '' };
    var u;
    try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch (e) { return { url: '', error: 'Das ist keine gültige Adresse.' }; }
    if (!/^https?:$/.test(u.protocol)) return { url: '', error: 'Die Adresse muss mit http oder https beginnen.' };
    var h = u.hostname.toLowerCase().replace(/^www\./, '');
    var d = String(host || '').toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return { url: '', error: 'Das ist keine gültige Adresse.' };
    if (d && h !== d && h.slice(-(d.length + 1)) !== '.' + d) return { url: '', error: 'Die Seite muss zu ' + d + ' gehören (oder zu einer Subdomain davon).' };
    u.hash = '';
    Array.from(u.searchParams.keys()).filter(function (k) { return /^(utm_|fbclid|gclid|mc_|_hs)/i.test(k); }).forEach(function (k) { u.searchParams.delete(k); });
    return { url: u.protocol + '//' + u.host + u.pathname.replace(/\/+$/, '') + u.search, error: '' };
  }
  // NEU: Das Feld nimmt eine Domain ODER die Adresse der Produktseite. Daraus werden zwei Dinge: die Domain (für Sichtbarkeits-Messung, Rankings und
  // Off-Site, wie bisher) und, wenn ein Pfad dabei ist, die Produktseite für das Produktprofil. Das Backend bekommt weiter nur die Domain.
  var SITE_FIELD_ERROR = 'Bitte eine gültige Adresse angeben, zum Beispiel convertlyze.com oder https://convertlyze.com/produkte/dein-angebot.';
  function splitSiteInput(raw) {
    var v = String(raw || '').trim();
    if (!v) return { domain: '', productUrl: '', error: '' };
    var u;
    try { u = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v); } catch (e) { return { domain: '', productUrl: '', error: SITE_FIELD_ERROR }; }
    if (!/^https?:$/.test(u.protocol)) return { domain: '', productUrl: '', error: SITE_FIELD_ERROR };
    var host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { domain: '', productUrl: '', error: SITE_FIELD_ERROR };
    var hasPath = u.pathname.replace(/\/+$/, '') !== '';
    var chk = hasPath ? checkProductUrl(v, host) : { url: '', error: '' };
    return { domain: host, productUrl: chk.url, error: chk.error };
  }
  function shortUrl(u) { return String(u || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').slice(0, 70); }

  // Domain für den Entwurf: die eingegebene, sonst die des gewählten Tracker-Themas. Leer = kein Profil-Schritt.
  function profileDomain(domain, trackerTopicId) {
    var d = String(domain || '').trim();
    if (!d && trackerTopicId) {
      var t = (state.trackerTopics || []).filter(function (x) { return x.id === trackerTopicId; })[0];
      d = t && t.own_domain ? String(t.own_domain).trim() : '';
    }
    d = d.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d) ? d : '';
  }

  // Schritte des Assistenten. Ohne Domain entfällt "Produkt bestätigen" auch in der Anzeige.
  function wizardStepsFor(trackerTopicId, domain) {
    var withProfile = !!profileDomain(domain, trackerTopicId);
    if (trackerTopicId) return withProfile ? STEPS_TRACKER : STEPS_TRACKER_SHORT;
    return withProfile ? STEPS_FULL : STEPS_FULL_SHORT;
  }
  function stepNo(label) {
    var steps = state.wizardSteps || STEPS_FULL;
    var i = steps.indexOf(label);
    return i < 0 ? 0 : i;
  }

  // Eine Zeile pro Eintrag, gleiche Grenzen wie im Backend (ProductProfileSchema). Zu viel oder Zu langes wird gemeldet statt still gekürzt.
  function parseProfileLines(text, max) {
    var seen = {};
    var list = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var q = line.replace(/^\s*(?:[-*\u2022\u2013\u2014]+|\d{1,2}[.)])\s+/, '').replace(/\s+/g, ' ').trim();
      if (q.length < 2) return;
      var key = q.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      list.push(q);
    });
    if (list.length > max) return { list: list, error: 'Höchstens ' + max + ' Einträge, aktuell ' + list.length + '. Nimm die wichtigsten.' };
    var tooLong = list.filter(function (q) { return q.length > PROFILE_LIMITS.item; })[0];
    if (tooLong) return { list: list, error: 'Ein Eintrag ist zu lang (höchstens ' + PROFILE_LIMITS.item + ' Zeichen): "' + tooLong.slice(0, 40) + '…". Bitte kürzen.' };
    return { list: list, error: '' };
  }

  function profileDateText(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE');
  }

  function continueAfterProfile(ctx) {
    if (ctx.trackerTopicId) startGeneration(ctx.topic, ctx.domain, ctx.validationId, ctx.trackerTopicId, null, ctx.customerQuestions);
    else startAudienceStep(ctx.topic, ctx.domain, ctx.validationId, ctx.originalTopic);
  }

  // ctx: { topic, domain, validationId, originalTopic, trackerTopicId, customerQuestions, validationResult }
  function startProfileStep(ctx, options) {
    var host = profileDomain(ctx.domain, ctx.trackerTopicId);
    if (!host) { state.productProfile = null; continueAfterProfile(ctx); return; }
    var refresh = !!(options && options.refresh);
    // NEU: Produktseite des Angebots (optional). Sie wird gelesen statt der Startseite und merkt sich der Schritt für Zurück, Neu ableiten und Entwurf.
    var productUrl = options && options.productUrl !== undefined ? options.productUrl : ctx.productUrl;
    ctx.productUrl = productUrl || '';
    renderBusy(
      productUrl ? 'Ich lese deine Produktseite und leite ab, was dein Angebot kann …' : (refresh ? 'Ich lese deine Website noch einmal …' : 'Ich suche die Seite zu deinem Angebot und leite ab, was es kann …'),
      'Das dauert meist unter einer Minute. Du bestätigst das Ergebnis gleich.',
      stepNo('Produkt bestätigen')
    );
    withNetworkRetry(function () {
      return apiFetch('/api/content-strategy/suggest-profile', {
        method: 'POST',
        body: JSON.stringify({ user_id: state.userId, topic: ctx.topic, domain: host, strategy_goal: state.strategyGoal || undefined, refresh: refresh || undefined, product_url: productUrl || undefined }),
      });
    }, 1, noteRetrying)
      .then(function (res) {
        if (!res || !res.profile) { state.productProfile = null; continueAfterProfile(ctx); return; }
        renderProfileStep(res, ctx, null);
      })
      .catch(function (err) {
        renderStepError(err, 'Produktprofil', {
          stepIndex: stepNo('Produkt bestätigen'),
          retry: function () { startProfileStep(ctx, options); },
          back: function () { renderTopicValidationResult(ctx.validationResult, ctx.domain, ctx.originalTopic, ctx.trackerTopicId); },
          backLabel: 'Zurück zur Themen-Auswahl',
          skip: function () { state.productProfile = null; continueAfterProfile(ctx); },
          skipLabel: 'Ohne Produktprofil fortfahren',
        });
      });
  }

  // saved: bereits bearbeitete Eingaben (aus dem Entwurf im Browser), sonst gilt der Entwurf des Servers.
  function renderProfileStep(res, ctx, saved) {
    state.wizardActive = true;
    clear(state.root);
    var base = saved || res.profile;
    var growAreas = [];
    var wrap = el('div', { class: 'cvz-cs-topic-check' });
    wrap.appendChild(renderStepper(state.wizardSteps || STEPS_FULL, stepNo('Produkt bestätigen'), true));
    wrap.appendChild(el('h3', {}, ['Stimmt dieses Produktprofil?', tip('Mit diesem Profil vergleicht und empfiehlt die Strategie nur, was zu deinem Angebot passt. Es genügt, zu bestätigen. Prüfe vor allem, was dein Angebot NICHT kann oder leistet und mit welchen fremden Produkten oder Partnern es zusammenarbeitet, denn das steht selten auf einer Produktseite.', 'Wozu dient das Produktprofil?')]));

    var host = profileDomain(ctx.domain, ctx.trackerTopicId);
    var sourceText;
    if (res.source === 'gespeichert') {
      var when = profileDateText(res.confirmed_at);
      sourceText = 'Von dir für ' + (res.product_url && res.profile && res.profile.produktseite ? shortUrl(res.product_url) : host) + (when ? ' am ' + when : '') + ' bestätigt. Prüfe nur, ob es noch stimmt.';
    } else if (res.source === 'ohne_seite') {
      sourceText = 'Deine Website war nicht abrufbar. Bitte ergänze, was dein Angebot kann und was nicht.';
    } else {
      var n = (res.pages || []).length;
      var more = n > 1 ? ' und ' + (n - 1) + (n === 2 ? ' weitere Seite' : ' weitere Seiten') : '';
      if (res.mode === 'produktseite') sourceText = 'Aus deiner Produktseite abgeleitet: ' + shortUrl(res.product_url) + more + '.';
      else if (res.mode === 'thema') sourceText = 'Zum Thema habe ich diese Seite gefunden: ' + shortUrl(res.product_url) + more + '. Ist es die falsche, trage unten die richtige Produktseite ein.';
      else if (res.mode === 'startseite') sourceText = 'Nur die Startseite von ' + host + ' gelesen.';
      else sourceText = 'Aus ' + (n === 1 ? 'einer Seite' : n + ' Seiten') + ' von ' + host + ' abgeleitet.';
    }
    wrap.appendChild(el('p', { class: 'cvz-cs-hint' }, [sourceText]));

    // NEU: Produktseite. Bei einer Domain mit mehreren Angeboten beschreibt die Startseite das ganze Unternehmen. Mit der Adresse des Angebots wird das
    // Profil aus dieser Seite abgeleitet. Nur die Startseite lag vor, oder die angegebene Seite war nicht abrufbar: Das Feld ist dann hervorgehoben.
    var urlInput = el('input', { type: 'text', name: 'produktseite', maxlength: '300', placeholder: 'z. B. https://' + host + '/produkte/dein-angebot' });
    urlInput.value = ctx.productUrl || '';
    var urlError = el('span', { class: 'cvz-cs-hint cvz-pf-urlerror' });
    var urlBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['Aus dieser Seite ableiten']);
    urlBtn.addEventListener('click', function () {
      var chk = checkProductUrl(urlInput.value, host);
      if (chk.error) { urlError.textContent = chk.error; return; }
      if (!chk.url) { urlError.textContent = 'Trage zuerst die Adresse deiner Produktseite ein.'; return; }
      urlError.textContent = '';
      startProfileStep(ctx, { refresh: true, productUrl: chk.url });
    });
    var urlField = fieldTip('Produktseite deines Angebots (optional)', el('div', { class: 'cvz-pf-urlrow' }, [urlInput, urlBtn]), 'Hat dein Angebot eine eigene Seite, trage sie hier ein. Das Profil wird dann aus dieser Seite abgeleitet statt aus der Startseite. Bei Domains mit mehreren Angeboten ist das wichtig, denn die Startseite beschreibt dort das ganze Unternehmen.');
    if (res.mode === 'startseite' || res.product_url_failed) urlField.classList.add('cvz-pf-check');
    urlField.appendChild(urlError);
    wrap.appendChild(urlField);

    // GEÄNDERT (Übersicht): Zuerst das, was zu prüfen ist (Prüffragen und die zwei Felder, zu denen die Seite meist schweigt). Alles andere liegt
    // zugeklappt darunter. So genügt in der Regel ein Blick und ein Klick auf "bestätigen".
    var descInput = makeGrowArea(base.beschreibung || '', 'Was ist dein Angebot, und für wen? Ein bis zwei Sätze.', growAreas);
    descInput.setAttribute('maxlength', String(PROFILE_LIMITS.desc));
    var preview = el('p', { class: 'cvz-pf-quote' }, [base.beschreibung || '']);
    descInput.addEventListener('input', function () { preview.textContent = descInput.value; });
    wrap.appendChild(preview);
    var catInput = el('input', { type: 'text', maxlength: String(PROFILE_LIMITS.category), placeholder: PROFILE_FIELD_TEXTS[profileKindOf(state.strategyGoal && state.strategyGoal.offer_type)].kategorie });
    catInput.value = base.kategorie || '';

    var annahmen = (res.profile && res.profile.annahmen) || [];
    if (annahmen.length > 0) {
      var ul = el('ul', { class: 'cvz-cs-topic-alt-list' });
      annahmen.forEach(function (a) { ul.appendChild(el('li', {}, [a])); });
      wrap.appendChild(el('div', { class: 'cvz-cs-callout cvz-pf-assumptions' }, [el('strong', {}, ['Bitte besonders prüfen: ']), 'Das stand nicht klar auf deiner Seite.', ul]));
    }

    var inputs = {};
    var fieldNodes = {};
    var FIELD_DEFS = profileFieldDefs(state.strategyGoal && state.strategyGoal.offer_type);
    FIELD_DEFS.forEach(function (def) {
      var area = makeGrowArea((base[def.key] || []).join('\n'), def.placeholder, growAreas);
      inputs[def.key] = area;
      var empty = (base[def.key] || []).length === 0;
      var f = fieldTip(def.label, area, def.hint);
      if (def.flag && empty) {
        f.classList.add('cvz-pf-check');
        f.appendChild(el('span', { class: 'cvz-cs-hint' }, ['Auf der Seite nichts gefunden. Bitte prüfen.']));
      }
      fieldNodes[def.key] = f;
    });
    // NEU: Hinweis, wenn unter "arbeitet zusammen" eine eigene Leistung steht. Sonst gilt sie als "kein Wettbewerb" und fehlt in jedem Vergleich.
    var ownHint = el('span', { class: 'cvz-cs-hint cvz-pf-ownhint' }); // nur eingehängt, wenn es etwas zu melden gibt
    var ergaenztEmpty = (base.ergaenzt || []).length === 0;
    function checkOwnComplements() {
      var own = ownComplementLines(inputs.ergaenzt.value, host);
      ownHint.textContent = own.length === 0 ? '' : 'Klingt nach eigener Leistung: "' + own[0].slice(0, 60) + (own[0].length > 60 ? '…' : '') + '"' + (own.length > 1 ? ' und ' + (own.length - 1) + ' weitere' : '') + '. Eigenes gehört zu "' + FIELD_DEFS[0].label + '", hier stehen nur Dritte.';
      if (own.length > 0 && !ownHint.parentNode) fieldNodes.ergaenzt.appendChild(ownHint);
      if (own.length === 0 && ownHint.parentNode) ownHint.parentNode.removeChild(ownHint);
      fieldNodes.ergaenzt.classList.toggle('cvz-pf-check', own.length > 0 || ergaenztEmpty);
    }
    inputs.ergaenzt.addEventListener('input', checkOwnComplements);
    checkOwnComplements();
    wrap.appendChild(fieldNodes.kann_nicht);
    wrap.appendChild(fieldNodes.ergaenzt);

    var valueSel = el('select', { name: 'kundenwert' }, PROFILE_VALUE_OPTIONS.map(function (o) { return el('option', { value: o.value }, [o.label]); }));
    valueSel.value = base.kundenwert || '';
    var more = el('details', { class: 'cvz-pf-more' }, [el('summary', {}, ['Weitere Angaben ansehen und ändern'])]);
    more.appendChild(fieldTip('Dein Angebot in ein bis zwei Sätzen', descInput));
    more.appendChild(fieldTip('Kategorie', catInput));
    more.appendChild(fieldNodes.kann);
    more.appendChild(fieldNodes.ersetzt);
    more.appendChild(fieldNodes.konkurrenten);
    more.appendChild(fieldTip('Was ist ein Kunde pro Jahr ungefähr wert?', valueSel, 'Bestimmt, welche Formate sich lohnen. Bei kleinem Kundenwert schlägt die Strategie keine Webinare, Workshops oder persönlichen Gespräche vor, weil sie sich nicht rechnen. Eine grobe Einordnung, keine Prognose.'));
    more.addEventListener('toggle', function () { growAllLater(growAreas); }); // Höhe der Felder erst berechnen, wenn sie sichtbar sind
    wrap.appendChild(more);

    var errorLine = el('p', { class: 'cvz-cs-quota-empty' });
    wrap.appendChild(errorLine);

    function collect() {
      var out = { beschreibung: descInput.value, kategorie: catInput.value, kundenwert: valueSel.value || null, produktseite: base.produktseite || null, annahmen: annahmen };
      FIELD_DEFS.forEach(function (def) { out[def.key] = String(inputs[def.key].value || '').split(/\r?\n/); });
      return out;
    }
    var draftTimer = null;
    function saveProfileDraft() {
      saveDraft('profile', { res: res, ctx: ctx, profile: collect() });
    }
    wrap.addEventListener('input', function () { clearTimeout(draftTimer); draftTimer = setTimeout(saveProfileDraft, 400); });

    function build() {
      // Eine eingetragene Produktseite, aus der der Entwurf nicht entstanden ist, würde das Profil falsch beschriften. Erst ableiten oder das Feld leeren.
      var typed = checkProductUrl(urlInput.value, host);
      if (typed.error) return { error: 'Produktseite: ' + typed.error };
      if (typed.url && typed.url !== (ctx.productUrl || '')) return { error: 'Du hast eine Produktseite eingetragen. Klicke auf "Aus dieser Seite ableiten", damit das Profil daraus entsteht, oder leere das Feld.' };
      var desc = descInput.value.replace(/\s+/g, ' ').trim();
      if (desc.length < 10) return { error: 'Bitte beschreibe dein Angebot in ein bis zwei Sätzen.' };
      var profile = { beschreibung: desc.slice(0, PROFILE_LIMITS.desc), kategorie: catInput.value.trim().slice(0, PROFILE_LIMITS.category), kundenwert: valueSel.value || null, produktseite: base.produktseite || null, annahmen: annahmen };
      for (var i = 0; i < FIELD_DEFS.length; i++) {
        var def = FIELD_DEFS[i];
        var parsed = parseProfileLines(inputs[def.key].value, def.max);
        if (parsed.error) return { error: def.label + ': ' + parsed.error };
        profile[def.key] = parsed.list;
      }
      return { profile: profile };
    }

    var confirmBtn = el('button', { type: 'button', class: 'cvz-cs-submit-btn' }, ['Profil bestätigen, ' + (ctx.trackerTopicId ? 'Strategie erstellen' : 'weiter zur Zielgruppe')]);
    confirmBtn.addEventListener('click', function () {
      clearTimeout(draftTimer);
      var built = build();
      if (built.error) { errorLine.textContent = built.error; return; }
      errorLine.textContent = '';
      state.productProfile = built.profile;
      continueAfterProfile(ctx);
    });
    var backBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['Zurück zur Themen-Auswahl']);
    backBtn.addEventListener('click', function () { renderTopicValidationResult(ctx.validationResult, ctx.domain, ctx.originalTopic, ctx.trackerTopicId); });
    var skipBtn = el('button', { type: 'button', class: 'cvz-cs-link-btn' }, ['Ohne Profil weitermachen (weniger genau)']);
    skipBtn.addEventListener('click', function () { clearTimeout(draftTimer); state.productProfile = null; continueAfterProfile(ctx); });
    var actions = [backBtn];
    if (res.source !== 'ohne_seite') {
      var refreshBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['Neu aus der Website ableiten']);
      refreshBtn.addEventListener('click', function () { clearTimeout(draftTimer); startProfileStep(ctx, { refresh: true }); });
      actions.push(refreshBtn);
    }
    actions.push(confirmBtn);
    wrap.appendChild(el('div', { class: 'cvz-cs-topic-check-actions' }, actions));
    wrap.appendChild(el('p', { class: 'cvz-cs-hint' }, [skipBtn]));
    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(wrap);
    growAllLater(growAreas);
    saveProfileDraft();
  }

  // Bericht: das berücksichtigte Profil (aufklappbar, in den Grundlagen). Widersprüche, die nach den Korrekturen blieben, stehen getrennt und
  // SICHTBAR im Überblick (renderProfileWarnings), weil sie etwas zu prüfen bedeuten und die Grundlagen eingeklappt sind.
  function renderProfileBox(result) {
    var p = result && result.product_profile;
    if (!p) return null;
    var box = el('div', { class: 'cvz-pf-box' });
    var body = el('div', { class: 'cvz-pf-body' });
    body.appendChild(el('p', {}, [p.beschreibung]));
    var valueRow = (p.produktseite ? [['Produktseite', [shortUrl(p.produktseite)]]] : []).concat(p.kundenwert ? [['Wert eines Kunden', [PROFILE_VALUE_LABELS[p.kundenwert] || p.kundenwert]]] : []);
    valueRow.concat([['Kann', p.kann], ['Kann nicht', p.kann_nicht], ['Ergänzt, kein Wettbewerb', p.ergaenzt], ['Wettbewerb (Ersetzt)', p.ersetzt], ['Direkte Wettbewerber', p.konkurrenten]]).forEach(function (row) {
      if (row[1] && row[1].length > 0) body.appendChild(el('p', {}, [el('strong', {}, [row[0] + ': ']), row[1].join('; ')]));
    });
    box.appendChild(el('details', { class: 'cvz-cs-expand' }, [
      el('summary', {}, ['Aufklappen: Produktprofil, nach dem diese Strategie arbeitet', tip('Du hast es vor dem Start bestätigt. Vergleiche, Zwischenziele und Off-Site-Maßnahmen richten sich danach.', 'Wozu dient das Produktprofil?')]),
      body,
    ]));
    return box;
  }

  function renderProfileWarnings(result) {
    var warns = (result && result.profile_warnings) || [];
    if (warns.length === 0) return null;
    var ul = el('ul', { class: 'cvz-cs-brief-list' });
    warns.slice(0, 6).forEach(function (w) { ul.appendChild(el('li', {}, [w])); });
    return el('div', { class: 'cvz-cs-gsc-hint cvz-pf-warn' }, [
      el('strong', {}, ['Bitte prüfen: ']),
      'Diese Stellen widersprechen deinem Produktprofil. Die Strategie hat sie trotz Korrektur nicht ganz bereinigt.',
      ul,
    ]);
  }

  var PROFILE_STYLES = [
    '#cvz-content-strategy-agent .cvz-pf-check .cvz-cs-field-label{color:var(--cvz-amber);}',
    '#cvz-content-strategy-agent .cvz-pf-check textarea,#cvz-content-strategy-agent .cvz-pf-check input{border-color:rgba(245,158,11,.6);}',
    '#cvz-content-strategy-agent .cvz-pf-assumptions ul{margin:6px 0 0;}',
    '#cvz-content-strategy-agent .cvz-cs-volproxy{border-left:2px solid rgba(255,255,255,.2);padding:2px 0 2px 12px;margin:8px 0;}',
    '#cvz-content-strategy-agent .cvz-pf-box{margin:14px 0 0;}',
    '#cvz-content-strategy-agent .cvz-pf-urlrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}',
    '#cvz-content-strategy-agent .cvz-pf-urlrow input{flex:1 1 260px;min-width:0;}',
    '#cvz-content-strategy-agent .cvz-pf-urlerror{color:var(--cvz-amber);}',
    '#cvz-content-strategy-agent .cvz-tp-demand{border:1px solid var(--cvz-border);background:var(--cvz-surface);margin:14px 0;}',
    '#cvz-content-strategy-agent .cvz-tp-demand>summary{padding:10px 14px;cursor:pointer;font-weight:600;color:var(--cvz-heading);}',
    '#cvz-content-strategy-agent .cvz-tp-demand .cvz-cs-table-wrap{padding:0 14px 12px;}',
    '#cvz-content-strategy-agent .cvz-pf-more{margin:14px 0;border:1px solid var(--cvz-border);background:var(--cvz-surface);}',
    '#cvz-content-strategy-agent .cvz-pf-more>summary{padding:10px 14px;cursor:pointer;font-weight:600;color:var(--cvz-heading);}',
    '#cvz-content-strategy-agent .cvz-pf-more>.cvz-cs-field{padding:0 14px;}',
    '#cvz-content-strategy-agent .cvz-pf-quote{margin:4px 0 12px;padding:8px 12px;border-left:3px solid var(--cvz-teal);color:var(--cvz-text);font-size:14px;}',
    '#cvz-content-strategy-agent .cvz-pf-body p{margin:0 0 6px;font-size:14px;}',
    '#cvz-content-strategy-agent .cvz-pf-warn{padding:12px 16px;margin-top:10px;border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.06);}',
  ];
  // ==== PROFIL-ENDE ====

  // ==================== APP-LEBENSZYKLUS ====================
  function getParam(key) {
    return new URLSearchParams(window.location.search).get(key);
  }

  // NEU (Tracker-Verbindung): Der Button "Content-Strategie erstellen" im Customer
  // Journey Tracker verlinkt mit ?tracker_topic_id=...&topic=...&domain=... hierher.
  // Die Tracker-ID wird nur übernommen, wenn der User das Thema auch in seiner
  // Liste hat. Der Server prüft den Zugriff beim Start ohnehin noch einmal.
  function getPrefillFromUrl() {
    var prefill = {};
    var topic = getParam('topic');
    var domain = getParam('domain');
    var trackerTopicId = getParam('tracker_topic_id');
    if (topic) prefill.topic = topic;
    if (domain) prefill.domain = domain;
    if (trackerTopicId && state.trackerTopics.some(function (t) { return t.id === trackerTopicId; })) {
      prefill.trackerTopicId = trackerTopicId;
    }
    return prefill;
  }

  function renderApp() {
    clear(state.root);
    var loading = el('p', { class: 'cvz-cs-hint' }, ['Lade Kontingent ...']);
    state.root.appendChild(loading);
    Promise.all([loadQuota(), loadGscStatus(), loadTrackerTopics()])
      .then(function () {
        clear(state.root);
        state.root.appendChild(renderQuotaBanner());
        // NEU: angefangene Strategie aus dem Browser anbieten (nicht, wenn ein Tracker-Link ein neues Thema vorgibt).
        var prefill = getPrefillFromUrl();
        var draft = prefill.topic ? null : loadDraft();
        if (draft) state.root.appendChild(renderDraftBanner(draft));
        state.root.appendChild(renderForm(prefill));
      })
      .catch(function (err) {
        renderError('Konnte nicht geladen werden: ' + err.message);
      });
  }

  function loadExistingSession(sessionId) {
    clear(state.root);
    state.root.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Lade gespeicherte Strategie ...']));
    Promise.all([loadQuota(), loadGscStatus()])
      .then(function () {
        return apiFetch('/api/content-strategy/' + encodeURIComponent(sessionId));
      })
      .then(function (session) {
        if (session.status === 'error') {
          renderPendingSession(session);
          return;
        }
        if (session.status === 'in_progress' || !session.result) {
          renderProcessing(session.seed_topic);
          pollSession(session.id);
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
    injectStyles(); // NEU: Convertlyze Design v2 (Syne Headlines, Geist Body, eckige Kanten)
    ensureMarkedLoaded();
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
