(function () {
  'use strict';
  // ==================== KONFIGURATION ====================
  var DEFAULT_CONFIG = {
    apiBaseUrl: 'https://YOUR-API-DOMAIN.example',
    containerId: 'cvz-content-strategy-agent',
    settingsUrl: '/member/einstellungen#integrationen',
    landingpageAssistantUrl: '/member/landingpage-assistant',
    pollIntervalMs: 3000,
    pollTimeoutMs: 32 * 60 * 1000,
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
      /* Ausnahme: Spinner bleibt rund */
      '.cvz-cs-spinner,.cvz-cs-chat-spinner-inline{border-radius:50% !important;}',

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
        'border:1px solid var(--cvz-border);white-space:nowrap;',
      '}',
      '.cvz-cs-badge-conversion{background:rgba(59,130,246,.15);color:#93c5fd;border-color:rgba(59,130,246,.3);}',
      '.cvz-cs-badge-audience{background:rgba(79,209,197,.12);color:var(--cvz-teal);border-color:rgba(79,209,197,.25);}',
      '.cvz-cs-badge-recommended{background:rgba(245,158,11,.12);color:#fcd34d;border-color:rgba(245,158,11,.25);}',
      '.cvz-cs-badge-commodity{background:rgba(239,68,68,.1);color:#fca5a5;border-color:rgba(239,68,68,.2);}',
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
      '.cvz-cs-report-section-title{',
        'font-family:"Syne",sans-serif;font-size:1.05rem;font-weight:700;',
        'color:var(--cvz-heading);padding-bottom:8px;',
        'border-bottom:1px solid var(--cvz-border);margin-bottom:18px;',
      '}',

      /* ---- Conversion Card ---- */
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
    ].join('');

    var style = document.createElement('style');
    style.id = 'cvz-cs-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

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
    { value: 'exploration', label: 'Exploration', description: 'Schafft Bewusstsein und deckt offene Grundlagenfragen ab.' },
    { value: 'evaluation', label: 'Evaluation', description: 'Hilft beim Vergleichen und Eingrenzen der Optionen.' },
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
    pollHandle: null,
    pollStartedAt: null,
    currentSessionId: null,
    currentResult: null,
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

  function renderForm(prefill) {
    prefill = prefill || {};
    var form = el('form', { class: 'cvz-cs-form' });
    var topicInput = el('input', { type: 'text', name: 'topic', placeholder: 'z.B. "Landingpage Software für B2B"', required: 'required' });
    if (prefill.topic) topicInput.value = prefill.topic;
    var domainInput = el('input', { type: 'text', name: 'domain', placeholder: 'z.B. convertlyze.com (optional, für Abdeckungs-Check)' });
    if (prefill.domain) {
      domainInput.value = prefill.domain;
    } else if (state.gscStatus && state.gscStatus.connected && state.gscStatus.sites.length === 1) {
      var suggested = state.gscStatus.sites[0].site_url.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      domainInput.value = suggested;
    }
    var llmTypeSelect = el(
      'select',
      { name: 'geo_test_llm_type' },
      GEO_LLM_TYPE_OPTIONS.map(function (o) {
        return el('option', { value: o.value }, [o.label]);
      })
    );
    form.appendChild(el('label', { class: 'cvz-cs-label' }, ['Thema / Ziel-Keyword', topicInput]));
    form.appendChild(el('label', { class: 'cvz-cs-label' }, ['Eigene Domain', domainInput]));
    form.appendChild(
      el('label', { class: 'cvz-cs-label' }, [
        'Welchen KI-Assistenten möchtest du für die Prompt-Tests nutzen?',
        llmTypeSelect,
        el('span', { class: 'cvz-cs-hint' }, [
          'Wir wählen innerhalb dieser Familie automatisch ein schnelles, websuche-fähiges Modell aus.',
        ]),
      ])
    );
    var canStart = !state.quota || state.quota.can_start_session;
    var submitBtn = el('button', { type: 'submit', class: 'cvz-cs-submit-btn' }, ['Content-Cluster erstellen']);
    if (!canStart) submitBtn.setAttribute('disabled', 'disabled');
    form.appendChild(submitBtn);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var topic = topicInput.value.trim();
      var domain = domainInput.value.trim();
      if (!topic) return;
      startTopicValidation(topic, domain || undefined, llmTypeSelect.value);
    });
    return form;
  }

  var INTENT_FIT_LABELS = {
    besser: 'Besserer Fit',
    gleichwertig: 'Gleichwertiger Fit',
    schlechter: 'Schwächerer Fit',
    zu_breit: 'Zu breit für das Angebot',
  };

  var TOPIC_RECOMMENDATION_LABELS = {
    thema_beibehalten: 'Empfehlung: ursprüngliches Thema beibehalten',
    thema_wechseln: 'Empfehlung: zu einer Alternative wechseln',
    thema_erweitern: 'Empfehlung: Thema erweitern statt wechseln',
  };

  function renderValidating(topic) {
    clear(state.root);
    var box = el('div', { class: 'cvz-cs-processing' }, [
      el('div', { class: 'cvz-cs-spinner' }),
      el('p', { class: 'cvz-cs-progress-text' }, ['Prüfe, ob "' + topic + '" das richtige Kern-Thema ist …']),
      el('p', { class: 'cvz-cs-hint' }, ['Das dauert normalerweise unter einer Minute, deutlich kürzer als die eigentliche Strategie-Erstellung.']),
    ]);
    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(box);
  }

  function startTopicValidation(topic, domain, geoTestLlmType) {
    renderValidating(topic);
    var controller = new AbortController();
    var timeoutId = setTimeout(function () {
      controller.abort();
    }, 70 * 1000);
    apiFetch('/api/content-strategy/validate-topic', {
      method: 'POST',
      body: JSON.stringify({ user_id: state.userId, topic: topic, domain: domain }),
      signal: controller.signal,
    })
      .then(function (result) {
        clearTimeout(timeoutId);
        renderTopicValidationResult(result, domain, geoTestLlmType, topic);
      })
      .catch(function (err) {
        clearTimeout(timeoutId);
        var message =
          err.name === 'AbortError'
            ? 'Zeitüberschreitung bei der Themen-Prüfung. Bitte erneut versuchen.'
            : 'Themen-Prüfung fehlgeschlagen: ' + err.message;
        renderError(message);
      });
  }

  function renderTopicValidationResult(result, domain, geoTestLlmType, originalTopic) {
    clear(state.root);
    var wrap = el('div', { class: 'cvz-cs-topic-check' });
    wrap.appendChild(el('h3', {}, ['Bevor wir loslegen: ist "' + result.seed_topic + '" das richtige Thema?']));
    var seedVolText = result.seed_search_volume != null ? 'ca. ' + result.seed_search_volume + ' Suchanfragen/Monat' : 'Suchvolumen unbekannt';

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
      var volText = alt.search_volume != null ? 'ca. ' + alt.search_volume + ' Suchanfragen/Monat' : 'Suchvolumen unbekannt';
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

    wrap.appendChild(
      el('div', { class: 'cvz-cs-topic-recommendation-box' }, [
        el('p', {}, [(TOPIC_RECOMMENDATION_LABELS[result.empfehlung] || result.empfehlung) + '.']),
        el('p', { class: 'cvz-cs-hint' }, [result.reasoning]),
      ])
    );

    wrap.appendChild(el('label', { class: 'cvz-cs-label' }, ['Oder eigene Formulierung für den Cluster:', freeTextInput]));

    var confirmBtn = el('button', { type: 'button', class: 'cvz-cs-submit-btn' }, ['Content-Cluster erstellen']);
    confirmBtn.addEventListener('click', function () {
      var finalTopic = freeTextInput.value.trim() || chosenInput.value;
      startGeneration(finalTopic, domain, geoTestLlmType, result.validation_id);
    });
    var backBtn = el('button', { type: 'button', class: 'cvz-cs-retry-btn' }, ['Zurück, Thema/Domain ändern']);
    backBtn.addEventListener('click', function () {
      clear(state.root);
      state.root.appendChild(renderQuotaBanner());
      state.root.appendChild(renderForm({ topic: originalTopic, domain: domain }));
    });
    wrap.appendChild(el('div', { class: 'cvz-cs-topic-check-actions' }, [backBtn, confirmBtn]));

    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(wrap);
  }

  function startGeneration(topic, domain, geoTestLlmType, validationId) {
    renderProcessing(topic);
    apiFetch('/api/content-strategy/generate', {
      method: 'POST',
      body: JSON.stringify({
        user_id: state.userId,
        topic: topic,
        domain: domain,
        run_prompt_test: true,
        geo_test_llm_type: geoTestLlmType,
        validation_id: validationId,
      }),
    })
      .then(function (res) {
        var url = new URL(window.location.href);
        url.searchParams.set('session_id', res.session_id);
        window.history.replaceState(null, '', url.toString());
        pollSession(res.session_id);
      })
      .catch(function (err) {
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
    { at: 380, text: 'Themen werden auf die Journey-Phasen Exploration, Evaluation und Decision verteilt' },
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
    clear(state.root);
    var startedAt = Date.now();
    var baseText = 'Baue Content-Cluster für "' + topic + '" …';
    var box = el('div', { class: 'cvz-cs-processing' }, [
      el('div', { class: 'cvz-cs-spinner' }),
      el('p', { class: 'cvz-cs-progress-text' }, [baseText]),
      el('p', { class: 'cvz-cs-hint' }, ['Lehn dich gerne einen Augenblick zurück. Die Entwicklung der Strategie dauert aktuell ca. 15 Minuten.']),
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
    var seedVolText = topicValidation.seed_search_volume != null ? 'ca. ' + topicValidation.seed_search_volume + ' Suchanfragen/Monat' : 'Suchvolumen unbekannt';
    box.appendChild(el('p', {}, ['Geprüftes Ausgangsthema: "' + topicValidation.seed_topic + '" (' + seedVolText + ')']));
    if (topicValidation.alternatives_checked && topicValidation.alternatives_checked.length > 0) {
      var list = el('ul', { class: 'cvz-cs-topic-alt-list' });
      topicValidation.alternatives_checked.forEach(function (a) {
        var volText = a.search_volume != null ? 'ca. ' + a.search_volume + ' Suchanfragen/Monat' : 'Suchvolumen unbekannt';
        list.appendChild(
          el('li', {}, [
            el('span', { class: 'cvz-cs-badge cvz-cs-badge-intent-' + a.intent_fit }, [INTENT_FIT_LABELS[a.intent_fit] || a.intent_fit]),
            ' "' + a.topic + '" (' + volText + '): ' + a.reasoning,
          ])
        );
      });
      box.appendChild(list);
    }
    box.appendChild(el('p', { class: 'cvz-cs-topic-recommendation' }, [
      (TOPIC_RECOMMENDATION_LABELS[topicValidation.empfehlung] || topicValidation.empfehlung) + '. ' + topicValidation.reasoning,
    ]));
    if (finalSeedTopic && finalSeedTopic !== topicValidation.seed_topic) {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Für diesen Cluster tatsächlich gewähltes Thema: "' + finalSeedTopic + '"']));
    }
    return box;
  }

  function renderResult(sessionId, result, fundedBy, session) {
    clear(state.root);
    var wrap = el('div', { class: 'cvz-cs-result cvz-cs-report' });
    wrap.appendChild(renderReportHeader(result, session, sessionId));
    wrap.appendChild(renderReportSection(1, 'Themen-Check', [renderTopicValidationSection(result.topic_validation, result.seed_topic)]));
    wrap.appendChild(renderReportSection(2, 'Ausgangslage', [renderProse(result.ausgangslage)]));
    wrap.appendChild(renderReportSection(3, 'Executive Summary', [el('div', { class: 'cvz-cs-executive-summary' }, [renderProse(result.executive_summary)])]));
    wrap.appendChild(renderReportSection(4, 'Ist-Zustand: wer rankt heute schon wofür?', [renderCurrentStateSection(result.current_state)]));
    wrap.appendChild(renderReportSection(5, 'Content-Cluster-Strategie (Soll-Zustand)', buildClusterSectionChildren(sessionId, result)));
    wrap.appendChild(renderReportSection(6, 'GEO-Strategie', [renderGeoSection(result.geo_strategy)]));
    wrap.appendChild(renderReportSection(7, 'Empfohlene Roadmap', [renderRoadmapSection(result.roadmap)]));
    var fundingText = fundedBy
      ? 'Finanziert aus: ' + (fundedBy === 'ppu_strategy' ? 'Pay-per-Use-Credit' : 'Plan-Kontingent')
      : 'Gespeicherte Strategie';
    var footer = el('div', { class: 'cvz-cs-footer' }, [
      el('span', { class: 'cvz-cs-hint' }, [fundingText]),
      el('button', { type: 'button', class: 'cvz-cs-retry-btn', onclick: renderApp }, ['Neue Strategie erstellen']),
    ]);
    wrap.appendChild(footer);
    var isCreator = !session || session.user_id === state.userId;
    if (sessionId && isCreator) wrap.appendChild(renderChatSection(sessionId));
    wrap.appendChild(el('p', { class: 'cvz-cs-ki-disclaimer' }, [
      'Diese Analyse wurde vollständig durch ein KI-System erstellt. Alle Empfehlungen sollten durch eine qualifizierte Fachperson geprüft werden. Alle Angaben ohne Gewähr.'
    ]));
    state.root.appendChild(renderQuotaBanner());
    state.root.appendChild(wrap);
  }

  function renderReportHeader(result, session, sessionId) {
    var header = el('div', { class: 'cvz-cs-report-header' });
    var topRow = el('div', { class: 'cvz-cs-report-header-top' });
    var titleBlock = el('div', {});
    titleBlock.appendChild(el('p', { class: 'cvz-cs-report-eyebrow' }, ['Content-Strategie-Bericht']));
    titleBlock.appendChild(el('h2', { class: 'cvz-cs-report-title' }, [result.seed_topic]));
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
    var section = el('section', { class: 'cvz-cs-report-section' });
    section.appendChild(el('h3', { class: 'cvz-cs-report-section-title' }, [number + '. ' + title]));
    (children || []).forEach(function (child) { if (child) section.appendChild(child); });
    return section;
  }

  function renderProse(text, extraClass) {
    var container = el('div', { class: 'cvz-cs-prose' + (extraClass ? ' ' + extraClass : '') });
    renderMarkdownInto(container, text);
    return container;
  }

  function buildClusterSectionChildren(sessionId, result) {
    var children = [];
    var volumeText = result.conversion_page.estimated_volume != null ? 'ca. ' + result.conversion_page.estimated_volume + ' Suchanfragen/Monat' : 'Suchvolumen unbekannt';
    var conversionBadges = [el('span', { class: 'cvz-cs-badge cvz-cs-badge-conversion' }, ['Conversion-Seite'])];
    if (result.conversion_page.primary_audience) {
      conversionBadges.push(el('span', { class: 'cvz-cs-badge cvz-cs-badge-audience' }, [result.conversion_page.primary_audience]));
    }
    var conversionCardChildren = [
      el('div', { class: 'cvz-cs-page-card-badges' }, conversionBadges),
      el('h4', {}, [result.conversion_page.topic]),
      el('p', { class: 'cvz-cs-hint' }, ['Keyword: ' + result.conversion_page.keyword + ' · ' + volumeText]),
    ];
    if (result.conversion_page.content_brief && result.conversion_page.content_brief.length > 0) {
      conversionCardChildren.push(renderContentBrief(result.conversion_page.content_brief));
    }
    conversionCardChildren.push(buildLandingpageButton(result.conversion_page.topic));
    children.push(el('div', { class: 'cvz-cs-conversion-card' }, conversionCardChildren));
    children.push(el('h5', {}, ['Unterstützende Seiten']));
    var pagesByPhase = groupPagesByPhase(result.supporting_pages || []);
    MESSY_MIDDLE_PHASES.forEach(function (phase) {
      var pagesInPhase = pagesByPhase[phase.value];
      if (!pagesInPhase || pagesInPhase.length === 0) return;
      var group = el('div', { class: 'cvz-cs-phase-group' });
      group.appendChild(el('h6', { class: 'cvz-cs-phase-title' }, [phase.label]));
      group.appendChild(el('p', { class: 'cvz-cs-phase-desc' }, [phase.description]));
      pagesInPhase.forEach(function (entry) { group.appendChild(renderPageCard(sessionId, entry.page, entry.index)); });
      children.push(group);
    });
    if (result.internal_links && result.internal_links.length > 0) {
      children.push(el('h5', {}, ['Interne Verlinkung']));
      var linkList = el('ul', { class: 'cvz-cs-link-list' });
      result.internal_links.forEach(function (link) { linkList.appendChild(el('li', {}, [describeLink(link, result)])); });
      children.push(linkList);
    }
    return children;
  }

  function describeLink(link, result) {
    var fromLabel = link.from_index === -1 ? result.conversion_page.topic : (result.supporting_pages[link.from_index] || {}).topic || ('#' + link.from_index);
    var toLabel = link.to_index === -1 ? result.conversion_page.topic : (result.supporting_pages[link.to_index] || {}).topic || ('#' + link.to_index);
    return fromLabel + ' → ' + toLabel + (link.anchor_text_idea ? ' ("' + link.anchor_text_idea + '")' : '');
  }

  function renderPageCard(sessionId, page, index) {
    var card = el('div', { class: 'cvz-cs-page-card' });
    var badges = [
      el('span', { class: 'cvz-cs-badge' }, [pageTypeLabel(page.page_type)]),
      el('span', { class: 'cvz-cs-badge cvz-cs-badge-role-' + page.role }, [roleLabel(page.role)]),
    ];
    if (page.primary_audience) badges.push(el('span', { class: 'cvz-cs-badge cvz-cs-badge-audience' }, [page.primary_audience]));
    if (page.commodity_risk) badges.push(el('span', { class: 'cvz-cs-badge cvz-cs-badge-commodity', title: page.commodity_reasoning || '' }, ['Commodity-Risiko']));
    card.appendChild(el('div', { class: 'cvz-cs-page-card-badges' }, badges));
    card.appendChild(el('h4', { class: 'cvz-cs-page-card-topic' }, [page.topic]));
    var volumeText = page.estimated_volume != null ? 'ca. ' + page.estimated_volume + ' Suchanfragen/Monat' : 'Suchvolumen unbekannt';
    card.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keyword: ' + page.keyword + ' · ' + volumeText]));
    if (PAGE_TYPE_EXPLANATIONS[page.page_type]) {
      card.appendChild(el('p', { class: 'cvz-cs-page-card-type-explanation' }, [PAGE_TYPE_EXPLANATIONS[page.page_type]]));
    }
    if (page.reasoning) card.appendChild(renderProse(page.reasoning, 'cvz-cs-page-card-reasoning'));
    if (page.content_brief && page.content_brief.length > 0) card.appendChild(renderContentBrief(page.content_brief));
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
        .then(function () { page.status = statusSelect.value; statusSelect.removeAttribute('disabled'); })
        .catch(function (err) { statusSelect.value = previous; statusSelect.removeAttribute('disabled'); alert('Status konnte nicht gespeichert werden: ' + err.message); });
    });
    var footer = el('div', { class: 'cvz-cs-page-card-footer' }, [statusSelect]);
    if (page.page_type === 'conversion_landingpage') footer.appendChild(buildLandingpageButton(page.topic));
    card.appendChild(footer);
    return card;
  }

  function renderContentBrief(brief) {
    var box = el('div', { class: 'cvz-cs-brief' });
    box.appendChild(el('p', { class: 'cvz-cs-brief-label' }, ['Content-Brief:']));
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

  function buildLandingpageButton(topic) {
    var href = CONFIG.landingpageAssistantUrl + '?new=1&topic=' + encodeURIComponent(topic);
    return el('a', { class: 'cvz-cs-build-btn', href: href }, ['Jetzt mit dem Landingpage-Tool bauen']);
  }

  function renderGeoSection(geo) {
    if (!geo) return el('div');
    var box = el('div', { class: 'cvz-cs-geo' });
    if (geo.citation_strategy_note) box.appendChild(renderProse(geo.citation_strategy_note, 'cvz-cs-citation-note'));
    var aio = geo.ai_overview;
    if (aio) {
      var aioBox = el('div', { class: 'cvz-cs-aio' });
      if (!aio.present) {
        aioBox.appendChild(el('h5', {}, ['Google AI Overview']));
        aioBox.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Kein AI Overview für dieses Thema vorhanden.']));
      } else if (!aio.references || aio.references.length === 0) {
        aioBox.appendChild(el('h5', {}, ['Google AI Overview']));
        aioBox.appendChild(el('p', { class: 'cvz-cs-gsc-hint' }, ['AI Overview vorhanden, aber ohne zitierte Quellen-Links - Hinweis auf Commodity-Charakter dieses Themas.']));
      } else {
        aioBox.appendChild(el('h5', {}, ['Google AI Overview' + (aio.own_domain_cited ? ' (eigene Domain wird bereits zitiert)' : ' - zitiert, eigene Domain fehlt noch')]));
        var aioList = el('ul', {});
        aio.references.forEach(function (r) {
          aioList.appendChild(el('li', {}, [el('a', { href: r.url, target: '_blank', rel: 'noopener' }, [r.domain]), r.title ? ' – "' + r.title + '"' : '']));
        });
        aioBox.appendChild(aioList);
      }
      box.appendChild(aioBox);
    }
    if (geo.top_serp_results && geo.top_serp_results.length > 0) {
      box.appendChild(el('h5', {}, ['Top-SEO-Ergebnisse (organisch)']));
      var serpList = el('ul', {});
      geo.top_serp_results.forEach(function (r) {
        serpList.appendChild(el('li', {}, [r.position + '. ', el('a', { href: r.url, target: '_blank', rel: 'noopener' }, [r.domain])]));
      });
      box.appendChild(serpList);
    }
    if (geo.competitor_content_notes && geo.competitor_content_notes.length > 0) {
      box.appendChild(el('h5', {}, ['Was Wettbewerber-Seiten konkret enthalten']));
      var compList = el('ul', {});
      geo.competitor_content_notes.forEach(function (c) {
        compList.appendChild(el('li', {}, [el('a', { href: c.url, target: '_blank', rel: 'noopener' }, [c.domain]), ': ' + c.structure_summary]));
      });
      box.appendChild(compList);
    }
    box.appendChild(el('h5', {}, ['Bereits zitierte Portale (LLM-Erwähnungen allgemein)' + (geo.own_domain_already_cited ? ' - eigene Domain bereits darunter' : '')]));
    if (geo.top_portals && geo.top_portals.length > 0) {
      var list = el('ul', {});
      geo.top_portals.forEach(function (p) {
        var volumeText = typeof p.ai_search_volume === 'number' ? ', AI-Search-Volumen ca. ' + p.ai_search_volume : '';
        list.appendChild(el('li', {}, [p.domain + (p.mention_count ? ' (' + p.mention_count + 'x' + volumeText + ')' : volumeText) + (p.note ? ' - ' + p.note : '')]));
      });
      box.appendChild(list);
    } else {
      box.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Keine zitierten Portale gefunden oder Daten nicht verfügbar.']));
    }
    if (geo.prompt_tests && geo.prompt_tests.length > 0) {
      box.appendChild(el('h5', {}, ['Prompt-Test-Ergebnisse']));
      var ptList = el('ul', {});
      geo.prompt_tests.forEach(function (r) {
        var citedText = r.cited_domains && r.cited_domains.length > 0 ? r.cited_domains.join(', ') : 'keine zitierten Domains gefunden';
        var providerLabel = r.llm_type ? GEO_LLM_TYPE_LABELS[r.llm_type] || r.llm_type : null;
        var modelText = r.model_name ? ' [' + (providerLabel ? providerLabel + ', Modell: ' : 'Modell: ') + r.model_name + ']' : providerLabel ? ' [' + providerLabel + ']' : '';
        ptList.appendChild(el('li', {}, ['"' + r.prompt + '"' + modelText + ': eigene Domain zitiert: ' + (r.own_domain_cited ? 'ja' : 'nein') + ' · zitierte Domains: ' + citedText]));
      });
      box.appendChild(ptList);
    }
    return box;
  }

  var ROADMAP_BUCKETS = [
    { key: 'sofort_umsetzen', label: 'Sofort umsetzen', badgeClass: 'cvz-cs-badge-roadmap-urgent' },
    { key: 'quick_wins', label: 'Quick Wins', badgeClass: 'cvz-cs-badge-roadmap-quick' },
    { key: 'als_naechstes', label: 'Als Nächstes', badgeClass: 'cvz-cs-badge-roadmap-next' },
    { key: 'spaeter', label: 'Später', badgeClass: 'cvz-cs-badge-roadmap-later' },
  ];

  function renderRoadmapSection(roadmap) {
    var box = el('div', { class: 'cvz-cs-roadmap' });
    if (!roadmap) return box;
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
        list.appendChild(el('li', { class: 'cvz-cs-roadmap-item' }, [
          el('p', { class: 'cvz-cs-roadmap-item-title' }, [item.titel]),
          renderProse(item.begruendung, 'cvz-cs-roadmap-item-reason'),
        ]));
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
    var str = String(text || '');
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
    var listEl = state.root.querySelector('.cvz-cs-chat-messages');
    var counterEl = state.root.querySelector('.cvz-cs-chat-counter');
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
    var statusEl = state.root.querySelector('.cvz-cs-chat-status');
    if (statusEl) statusEl.textContent = errorMessage || '';
    var sendBtn = state.root.querySelector('.cvz-cs-chat-send-btn');
    var inputEl = state.root.querySelector('.cvz-cs-chat-input');
    if (sendBtn) sendBtn.removeAttribute('disabled');
    if (inputEl) inputEl.removeAttribute('disabled');
    refreshChatMessagesView();
  }

  function sendChatMessage(sessionId, text) {
    if (state.chat.sending) return;
    state.chat.sending = true;
    state.chat._pendingUserMessage = text;
    var sendBtn = state.root.querySelector('.cvz-cs-chat-send-btn');
    var inputEl = state.root.querySelector('.cvz-cs-chat-input');
    if (sendBtn) sendBtn.setAttribute('disabled', 'disabled');
    if (inputEl) inputEl.setAttribute('disabled', 'disabled');
    var statusEl = state.root.querySelector('.cvz-cs-chat-status');
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

  function renderChatSection(sessionId) {
    var section = el('div', { class: 'cvz-cs-chat' });
    section.appendChild(el('h4', { class: 'cvz-cs-chat-title' }, ['Fragen zum Report']));
    section.appendChild(el('p', { class: 'cvz-cs-hint' }, ['Der Agent kennt diesen Report und kann bei Bedarf auch neue Daten live nachschlagen (kein erneuter GEO-Prompt-Test).']));
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
      sendChatMessage(sessionId, text);
    }
    form.addEventListener('submit', function (event) { event.preventDefault(); trySend(); });
    inputEl.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); trySend(); }
    });
    section.appendChild(form);
    section.appendChild(el('p', { class: 'cvz-cs-chat-status', 'aria-live': 'polite' }, ['']));
    section.appendChild(el('p', { class: 'cvz-cs-chat-limit-notice cvz-cs-hint', style: 'display:none' }, ['Frage-Kontingent für diesen Report erreicht - für weitere Fragen bitte eine neue Strategie erstellen.']));
    section.appendChild(el('p', { class: 'cvz-cs-chat-counter cvz-cs-hint' }, ['']));
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
