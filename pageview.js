/**
 * Convertlyze – Seitenansicht v1 (pageview.js)
 *
 * Zeigt den Screenshot der analysierten Landingpage mit nummerierten Markern an den Stellen,
 * an denen die Empfehlungen ansetzen. Läuft in zwei Modi:
 *
 *   REPORT (Seite mit report.js):
 *     Kompakte Teaser-Karte vor dem Deep Dive: Vorschaubild mit Markern, Anzahl der markierten
 *     Stellen und ein Button, der die Seitenansicht im KI-Agenten öffnet (nur für den Ersteller).
 *
 *   AGENT (Seite mit agent-chat.js):
 *     Ausklappbares Seitenpanel "Seitenansicht" rechts. Der Agent schlägt konkrete Texte
 *     als Karten vor (```cvz-change```-Blöcke aus der Agent-API). Der Nutzer übernimmt oder
 *     verwirft sie, sieht übernommene Texte als Vorschau auf dem Screenshot und exportiert
 *     ausgewählte Änderungen als Briefing für die Agentur (PDF, Markdown) oder als Aufgaben
 *     für ClickUp, Asana, Jira und Excel (über cvz-export.js, wird bei Bedarf nachgeladen).
 *
 * Daten: analyses.page_snapshot (Analysis-Worker), Entscheidungen über
 * GET/POST /api/agent/page-changes (Agent-API). Fehlt die Seitenansicht (alte Analysen),
 * tut das Script nichts.
 *
 * Sicherheit: Es wird nur ein Bild angezeigt, nie fremdes HTML oder fremde Scripts.
 * Alle Texte aus Analyse und Agent werden per textContent gesetzt, nie per innerHTML.
 *
 * Einbinden in Webflow (Report-Seite UND Agent-Seite), jeweils vor </body>, NACH report.js
 * bzw. agent-chat.js:
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/pageview.js"></script>
 */
(function () {
  'use strict';
  if (window.CVZPageView) return;

  // ── Konfiguration ───────────────────────────────────────────────────────────
  const API_BASE = 'https://convertlyze-agent-api-production.up.railway.app';
  const AGENT_URL = 'https://www.convertlyze.com/analyse/optimization-agent';
  const LOGO_URL = 'https://cdn.prod.website-files.com/68aa0ecac3a6a586fee94df1/691664f71a064dcad970d70f_convertlyze-ki-b2b-landingpage-analyse.png';

  const SEV = {
    critical: { label: 'Kritisch', color: '#ef4444' },
    high: { label: 'Wichtig', color: '#f59e0b' },
    medium: { label: 'Mittel', color: '#10b981' },
  };
  const sevOf = (s) => SEV[String(s || '').toLowerCase()] || { label: 'Hinweis', color: '#94a3b8' };

  // Anzeigenamen wie im Report
  const CAT_DISPLAY = { Wettbewerb: 'Differenzierung', 'Search Intent': 'Suchabsicht', 'AI Readiness': 'KI-Sichtbarkeit' };
  const catName = (c) => CAT_DISPLAY[c] || c || '';



  const KIND_LABELS = {
    hero: 'Hero-Bereich', headline: 'Überschrift', cta: 'Button', form: 'Formular', text: 'Textabsatz',
    testimonial: 'Kundenstimme', pricing: 'Preisbereich', faq: 'FAQ', trust: 'Logos und Siegel',
    image: 'Bild', video: 'Video', nav: 'Navigation', section: 'Abschnitt',
  };
  // Bei diesen Arten ersetzt die Vorschau den Text direkt im Element. Bei großen Bereichen
  // (Hero, Formular, Abschnitt) wäre das irreführend, dort gibt es nur ein Etikett.
  const INLINE_PREVIEW_KINDS = { headline: 1, cta: 1, text: 1, testimonial: 1 };
  const kindLabel = (el) => (el && KIND_LABELS[el.kind]) || 'Element';

  // ── Hilfsfunktionen ─────────────────────────────────────────────────────────
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function oneLine(s, max) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return max && t.length > max ? t.slice(0, max - 1) + '…' : t;
  }
  function changeId(elementId, nachher) {
    return String(elementId) + '\n' + String(nachher || '').trim();
  }
  function formatDate(d) {
    try {
      return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  // Prüft, ob page_snapshot verwendbar ist (alte Analysen haben keinen)
  function parseSnapshot(raw) {
    let s = raw;
    if (typeof s === 'string') {
      try { s = JSON.parse(s); } catch (e) { return null; }
    }
    if (!s || typeof s !== 'object' || !Array.isArray(s.elements) || s.elements.length === 0) return null;
    if (typeof s.screenshot_url !== 'string' || !/^https:\/\//.test(s.screenshot_url)) return null;
    s.markers = Array.isArray(s.markers) ? s.markers : [];
    s.byId = new Map(s.elements.map((e) => [e.id, e]));
    s.markers = s.markers.filter((m) => s.byId.has(m.element_id));
    return s;
  }

  async function getToken() {
    try {
      if (window.$memberstackDom && typeof window.$memberstackDom.getMemberCookie === 'function') {
        const c = await window.$memberstackDom.getMemberCookie();
        if (typeof c === 'string' && c) return c;
        if (c && c.data) return c.data;
      }
    } catch (e) { /* weiter mit Fallbacks */ }
    const m = document.cookie.match(/(?:^|;\s*)_ms-mid=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
    try { return window.localStorage.getItem('_ms-mid'); } catch (e) { return null; }
  }

  async function api(path, opts) {
    const token = await getToken();
    const res = await fetch(API_BASE + path, {
      method: (opts && opts.method) || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* leer */ }
    if (!res.ok) throw new Error((json && json.error) || 'HTTP ' + res.status);
    return json;
  }

  function toast(text) {
    const old = document.getElementById('cvz-pv-toast');
    if (old) old.remove();
    const t = h('div', 'cvz-pv-toast', text);
    t.id = 'cvz-pv-toast';
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('cvz-pv-on'));
    setTimeout(() => {
      t.classList.remove('cvz-pv-on');
      setTimeout(() => t.remove(), 300);
    }, 2600);
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('cvz-pv-styles')) return;
    const st = document.createElement('style');
    st.id = 'cvz-pv-styles';
    st.textContent = `
      .cvz-pv,.cvz-pv *,.cvz-pv-drawer,.cvz-pv-drawer *,.cvz-chg,.cvz-chg *,.cvz-pv-teaser-wrap,.cvz-pv-teaser-wrap *{box-sizing:border-box;}
      .cvz-pv{font-family:'Geist','DM Sans','Segoe UI',sans-serif;color:#e2e8f0;min-width:0;}
      .cvz-pv-stage{position:relative;overflow:auto;background:#0b0f14;border:1px solid rgba(255,255,255,.08);
        overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}
      .cvz-pv-canvas{position:relative;width:100%;line-height:0;}
      .cvz-pv-img{display:block;width:100%;height:auto;user-select:none;-webkit-user-drag:none;}
      .cvz-pv-layer{position:absolute;inset:0;}
      .cvz-pv-box{position:absolute;border:2px solid var(--c,#4fd1c5);background:transparent;cursor:pointer;
        transition:background .15s,box-shadow .15s;padding:0;margin:0;}
      .cvz-pv-box:hover,.cvz-pv-box.cvz-pv-sel{background:color-mix(in srgb,var(--c,#4fd1c5) 14%,transparent);
        box-shadow:0 0 0 3px color-mix(in srgb,var(--c,#4fd1c5) 35%,transparent);}
      .cvz-pv-box.cvz-pv-pickable{border:1px dashed rgba(79,209,197,.55);--c:#4fd1c5;}
      .cvz-pv-box:focus-visible,.cvz-pv-pin:focus-visible{outline:2px solid #fff;outline-offset:2px;}
      .cvz-pv-pin{position:absolute;transform:translate(-40%,-55%);min-width:24px;height:24px;padding:0 6px;
        border-radius:12px;border:2px solid #0d1117;background:var(--c,#4fd1c5);color:#0d1117;
        font:700 12px/20px 'DM Mono','Geist',monospace;text-align:center;cursor:pointer;z-index:2;
        box-shadow:0 2px 6px rgba(0,0,0,.45);}
      .cvz-pv-pin.cvz-pv-sel{transform:translate(-40%,-55%) scale(1.25);z-index:3;}
      .cvz-pv-after{position:absolute;line-height:1.2;background:#fff;color:#111827;outline:2px dashed #4fd1c5;outline-offset:1px;
        font-family:'Geist','DM Sans',Arial,sans-serif;pointer-events:none;z-index:1;overflow-wrap:anywhere;
        box-shadow:0 4px 14px rgba(0,0,0,.18);}
      .cvz-pv-after.cvz-pv-head{font-weight:800;}
      .cvz-pv-after.cvz-pv-cta{display:flex;align-items:center;justify-content:center;white-space:nowrap;padding:0 .7em;
        background:#4fd1c5;color:#0d1117;font-weight:700;outline-color:#0d1117;}
      .cvz-pv-tag{position:absolute;transform:translateY(-100%);max-width:70%;background:#4fd1c5;color:#0d1117;
        font:600 11px/1.3 'Geist',sans-serif;padding:3px 7px;pointer-events:none;z-index:1;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .cvz-pv-hide-after .cvz-pv-after,.cvz-pv-hide-after .cvz-pv-tag{display:none;}
      .cvz-pv-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:#94a3b8;margin:0 0 0 auto;}
      .cvz-pv-legend span{display:inline-flex;align-items:center;gap:6px;}
      .cvz-pv-legend i{width:10px;height:10px;border-radius:50%;display:inline-block;}
      .cvz-pv-note{font-size:12px;color:#718096;line-height:1.6;margin-top:10px;}

      /* Liste der Marker */
      .cvz-pv-list{display:flex;flex-direction:column;gap:8px;min-width:0;}
      .cvz-pv-item{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);border-left:3px solid var(--c,#718096);}
      .cvz-pv-item.cvz-pv-sel{background:rgba(79,209,197,.07);border-color:rgba(79,209,197,.35);border-left-color:var(--c);}
      .cvz-pv-item-head{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;background:none;border:0;
        color:inherit;font:inherit;padding:12px 14px;cursor:pointer;}
      .cvz-pv-num{flex-shrink:0;min-width:24px;height:24px;border-radius:12px;background:var(--c);color:#0d1117;
        font:700 12px/24px 'DM Mono',monospace;text-align:center;}
      .cvz-pv-meta{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#a3b5c4;margin-bottom:3px;}
      .cvz-pv-prob{font-size:14px;font-weight:600;color:#e8edf5;line-height:1.45;overflow-wrap:anywhere;}
      .cvz-pv-body{display:none;padding:0 14px 14px 48px;}
      .cvz-pv-item.cvz-pv-sel .cvz-pv-body{display:block;}
      .cvz-pv-sol{font-size:13px;color:#c4cdd6;line-height:1.6;overflow-wrap:anywhere;}
      .cvz-pv-sol b{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#4fd1c5;margin-right:6px;}
      .cvz-pv-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}
      .cvz-pv-btn{font:600 12px/1 'Geist','DM Sans',sans-serif;padding:9px 12px;border-radius:0;cursor:pointer;
        background:none;color:#4fd1c5;border:1px solid #4fd1c5;text-decoration:none;display:inline-flex;align-items:center;gap:6px;}
      .cvz-pv-btn:hover{background:rgba(79,209,197,.1);}
      .cvz-pv-btn.cvz-pv-primary{background:#4fd1c5;color:#0d1117;}
      .cvz-pv-btn.cvz-pv-primary:hover{background:#6ee0d6;}
      .cvz-pv-btn.cvz-pv-on{background:#4fd1c5;color:#0d1117;}
      .cvz-pv-btn[disabled]{opacity:.45;cursor:not-allowed;}
      .cvz-pv-btn:focus-visible,.cvz-pv-item-head:focus-visible{outline:2px solid #4fd1c5;outline-offset:2px;}
      .cvz-pv-empty{font-size:13px;color:#718096;line-height:1.6;padding:12px 0;}

      /* Report: Teaser-Karte */
      .cvz-pv-teaser-wrap{max-width:1200px;margin:0 auto;padding:8px 24px 32px;}
      .cvz-pv-teaser{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:24px;align-items:center;
        background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-left:3px solid #4fd1c5;padding:20px;
        font-family:'Geist','DM Sans','Segoe UI',sans-serif;color:#e2e8f0;}
      .cvz-pv-thumb{position:relative;display:block;aspect-ratio:16/10;overflow:hidden;background:#fff;border:1px solid rgba(255,255,255,.1);}
      a.cvz-pv-thumb:hover{box-shadow:0 0 0 2px #4fd1c5;}
      a.cvz-pv-thumb:focus-visible{outline:2px solid #4fd1c5;outline-offset:2px;}
      .cvz-pv-thumb-img{display:block;width:100%;height:auto;}
      .cvz-pv-pin.cvz-pv-pin-s{min-width:20px;height:20px;padding:0 4px;border-radius:10px;font:700 11px/16px 'DM Mono','Geist',monospace;cursor:inherit;}
      .cvz-pv-more{position:absolute;right:8px;bottom:8px;background:#0d1117;color:#e2e8f0;font:600 11px/1 'Geist',sans-serif;padding:6px 8px;}
      .cvz-pv-kicker{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4fd1c5;margin-bottom:6px;}
      .cvz-pv-ttitle{font:800 22px/1.25 'Syne','Geist',sans-serif;color:#f0f4f8;margin-bottom:10px;}
      .cvz-pv-chips{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;font-size:13px;color:#a3b5c4;}
      .cvz-pv-chip{display:inline-flex;align-items:center;gap:6px;}
      .cvz-pv-chip i{width:9px;height:9px;border-radius:50%;display:inline-block;}
      .cvz-pv-ttext{font-size:14px;line-height:1.6;color:#a3b5c4;margin:0 0 16px;}
      .cvz-pv-tbtn{padding:12px 16px;font-size:13px;}
      @media(max-width:760px){
        .cvz-pv-teaser-wrap{padding:8px 16px 24px;}
        .cvz-pv-teaser{grid-template-columns:1fr;padding:16px;}
        .cvz-pv-ttitle{font-size:19px;}
      }
      .cvz-pv-flash{animation:cvz-pv-flash 1.6s ease;}
      @keyframes cvz-pv-flash{0%,60%{box-shadow:0 0 0 3px #4fd1c5;}100%{box-shadow:0 0 0 0 transparent;}}

      /* Agent: Seitenpanel */
      .cvz-pv-tab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:9998;writing-mode:vertical-rl;
        background:#4fd1c5;color:#0d1117;border:0;border-radius:0;padding:14px 8px;cursor:pointer;
        font:700 12px/1 'Syne','Geist',sans-serif;letter-spacing:.06em;text-transform:uppercase;box-shadow:-2px 0 12px rgba(0,0,0,.35);}
      .cvz-pv-tab b{writing-mode:horizontal-tb;display:inline-block;margin-top:8px;background:#0d1117;color:#4fd1c5;
        min-width:18px;height:18px;border-radius:9px;font:700 10px/18px 'DM Mono',monospace;text-align:center;}
      .cvz-pv-drawer{position:fixed;top:0;right:0;bottom:0;width:min(600px,46vw);z-index:9999;display:flex;flex-direction:column;
        background:#0d1117;border-left:1px solid rgba(255,255,255,.1);box-shadow:-8px 0 30px rgba(0,0,0,.5);
        transform:translateX(100%);transition:transform .25s ease;font-family:'Geist','DM Sans',sans-serif;color:#e2e8f0;overflow:hidden;}
      .cvz-pv-drawer.cvz-pv-open{transform:none;}
      @media(max-width:900px){.cvz-pv-drawer{width:100vw;}}
      .cvz-pv-dhead{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);}
      .cvz-pv-dtitle{font:800 15px/1.2 'Syne',sans-serif;flex:1;min-width:0;}
      .cvz-pv-dsub{font:400 12px/1.3 'Geist',sans-serif;color:#718096;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .cvz-pv-x{background:none;border:1px solid rgba(255,255,255,.15);color:#e2e8f0;width:34px;height:34px;cursor:pointer;font-size:18px;line-height:1;}
      .cvz-pv-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.08);}
      .cvz-pv-tabs button{flex:1;background:none;border:0;border-bottom:2px solid transparent;color:#94a3b8;padding:11px 8px;
        font:600 13px/1 'Geist',sans-serif;cursor:pointer;}
      .cvz-pv-tabs button.cvz-pv-on{color:#4fd1c5;border-bottom-color:#4fd1c5;}
      .cvz-pv-tools{display:flex;flex-wrap:wrap;gap:8px;padding:10px 16px;align-items:center;}
      .cvz-pv-tools .cvz-pv-hint{font-size:12px;color:#718096;flex:1 1 100%;}
      .cvz-pv-dbody{flex:1;min-height:0;display:flex;flex-direction:column;}
      .cvz-pv-dbody > .cvz-pv{flex:1 1 56%;min-height:160px;display:flex;flex-direction:column;margin:0 16px;}
      .cvz-pv-dbody .cvz-pv-stage{flex:1 1 auto;min-height:0;}
      .cvz-pv-dlist{flex:1 1 44%;min-height:120px;overflow-y:auto;overflow-x:hidden;padding:12px 16px 16px;border-top:1px solid rgba(255,255,255,.06);margin-top:10px;}
      .cvz-pv-export{display:flex;flex-wrap:wrap;gap:8px;padding:0 0 12px;position:relative;}
      /* Menü von cvz-export.js im Panel: an der Export-Leiste ausrichten und auf Panelbreite
         begrenzen, sonst ragt es rechts heraus und verschiebt beim Scrollen das ganze Panel */
      .cvz-pv-export .cvz-xp-wrap{position:static;}
      .cvz-pv-export .cvz-xp-pop{left:0;right:0;width:auto;max-width:none;transform:none;}
      .cvz-pv-selbar{display:flex;align-items:center;gap:14px;padding:0 0 10px;font-size:12px;color:#94a3b8;}
      .cvz-pv-check{display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:#e2e8f0;font-weight:600;}
      .cvz-pv-check input,.cvz-pv-cb{width:16px;height:16px;accent-color:#4fd1c5;margin:4px 0 0;flex-shrink:0;cursor:pointer;}
      .cvz-pv-check input{margin:0;}
      body.cvz-pv-push{transition:padding-right .25s ease;}

      /* Vorschlags-Karte im Chat */
      .cvz-chg{margin:12px 0;border:1px solid rgba(79,209,197,.35);background:rgba(79,209,197,.05);font-family:'Geist','DM Sans',sans-serif;}
      .cvz-chg-head{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(79,209,197,.2);}
      .cvz-chg-kind{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4fd1c5;}
      .cvz-chg-show{background:none;border:0;color:#94a3b8;font:500 12px/1 'Geist',sans-serif;cursor:pointer;text-decoration:underline;padding:0;}
      .cvz-chg-row{padding:8px 12px 0;}
      .cvz-chg-lbl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#718096;margin-bottom:2px;}
      .cvz-chg-old{font-size:13px;color:#94a3b8;text-decoration:line-through;text-decoration-color:rgba(239,68,68,.6);overflow-wrap:anywhere;}
      .cvz-chg-new{font-size:15px;font-weight:600;color:inherit;overflow-wrap:anywhere;}
      .cvz-chg-why{font-size:12px;color:#94a3b8;padding:8px 12px 0;line-height:1.5;}
      .cvz-chg-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px 12px;}
      .cvz-chg-state{font-size:12px;font-weight:600;}
      .cvz-chg[data-state=accepted]{border-color:#4fd1c5;}
      .cvz-chg[data-state=accepted] .cvz-chg-state{color:#4fd1c5;}
      .cvz-chg[data-state=rejected]{opacity:.6;border-style:dashed;}
      .cvz-chg-undo{background:none;border:0;color:#94a3b8;font:500 12px/1 'Geist',sans-serif;cursor:pointer;text-decoration:underline;padding:0;}

      .cvz-pv-toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);opacity:0;z-index:10000;
        background:#1f2937;color:#e2e8f0;border:1px solid rgba(79,209,197,.4);padding:10px 16px;font:500 13px/1.3 'Geist',sans-serif;
        transition:opacity .25s,transform .25s;}
      .cvz-pv-toast.cvz-pv-on{opacity:1;transform:translate(-50%,0);}
      @media (prefers-reduced-motion: reduce){.cvz-pv-drawer,.cvz-pv-toast,body.cvz-pv-push{transition:none;}.cvz-pv-flash{animation:none;}}
      @media print{.cvz-pv-tab,.cvz-pv-drawer{display:none!important;}}
    `;
    document.head.appendChild(st);
  }

  // ── Viewer: Screenshot mit Markern ──────────────────────────────────────────
  // Positionen kommen als Anteile (0 bis 1) vom Worker. Wir setzen sie als Prozentwerte,
  // dadurch passen die Marker bei jeder Anzeigegröße, ohne dass wir neu rechnen müssen.
  function createViewer(snap, opts) {
    opts = opts || {};
    const root = h('div', 'cvz-pv');
    const stage = h('div', 'cvz-pv-stage');
    const canvas = h('div', 'cvz-pv-canvas');
    const img = h('img', 'cvz-pv-img');
    img.alt = 'Screenshot der analysierten Landingpage';
    img.decoding = 'async';
    img.loading = 'lazy';
    // Bewusst OHNE crossOrigin: Falls der Storage keine CORS-Header schickt, soll das Bild
    // trotzdem angezeigt werden. Nur der PDF-Export braucht CORS (eigenes Bild, mit Fallback).
    img.src = snap.screenshot_url;
    img.width = snap.image_width || 1200;
    img.height = snap.image_height || 3000;
    const layer = h('div', 'cvz-pv-layer');
    canvas.appendChild(img);
    canvas.appendChild(layer);
    stage.appendChild(canvas);
    root.appendChild(stage);

    let changes = [];
    let pickMode = false;
    let selected = { marker: null, element: null };

    const pct = (v) => (Math.max(0, Math.min(1, Number(v) || 0)) * 100).toFixed(3) + '%';
    const place = (node, box) => {
      node.style.left = pct(box.x);
      node.style.top = pct(box.y);
      node.style.width = pct(box.w);
      node.style.height = pct(box.h);
    };

    // Marker je Element gruppieren (mehrere Empfehlungen können dasselbe Element betreffen)
    const markersByEl = new Map();
    snap.markers.forEach((m) => {
      if (!markersByEl.has(m.element_id)) markersByEl.set(m.element_id, []);
      markersByEl.get(m.element_id).push(m);
    });
    const worstSev = (list) => {
      const order = ['critical', 'high', 'medium'];
      return list.map((m) => String(m.severity || '').toLowerCase()).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
    };

    function render() {
      layer.textContent = '';
      const showPick = pickMode;
      // Große Elemente zuerst zeichnen, kleine danach: So liegen kleine Elemente (Button, Überschrift)
      // oben und bleiben anklickbar, auch wenn ein großer Abschnitt sie umschließt.
      const area = (id) => { const e = snap.byId.get(id); return e ? e.box.w * e.box.h : 0; };
      const elementIds = (showPick ? snap.elements.map((e) => e.id) : [...markersByEl.keys()]).sort((a, b) => area(b) - area(a));

      elementIds.forEach((id) => {
        const el = snap.byId.get(id);
        if (!el) return;
        const ms = markersByEl.get(id) || [];
        const box = h('button', 'cvz-pv-box' + (ms.length ? '' : ' cvz-pv-pickable'));
        box.type = 'button';
        box.dataset.el = id;
        if (ms.length) box.style.setProperty('--c', sevOf(worstSev(ms)).color);
        if (selected.element === id) box.classList.add('cvz-pv-sel');
        box.setAttribute('aria-label', kindLabel(el) + (el.text ? ': ' + oneLine(el.text, 60) : ''));
        box.title = kindLabel(el) + (el.text ? ': ' + oneLine(el.text, 80) : '');
        place(box, el.box);
        box.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (pickMode) {
            if (opts.onPickElement) opts.onPickElement(el);
          } else if (ms.length && opts.onSelectMarker) {
            opts.onSelectMarker(ms[0].n, 'image');
          }
        });
        layer.appendChild(box);
      });

      if (!showPick) {
        markersByEl.forEach((ms, id) => {
          const el = snap.byId.get(id);
          ms.forEach((m, i) => {
            const pin = h('button', 'cvz-pv-pin', String(m.n));
            pin.type = 'button';
            pin.dataset.n = String(m.n);
            pin.style.setProperty('--c', sevOf(m.severity).color);
            pin.style.left = 'calc(' + pct(el.box.x) + ' + ' + i * 26 + 'px)';
            pin.style.top = pct(el.box.y);
            pin.setAttribute('aria-label', 'Marker ' + m.n + ': ' + oneLine(m.problem, 80));
            if (selected.marker === m.n) pin.classList.add('cvz-pv-sel');
            pin.addEventListener('click', (ev) => {
              ev.stopPropagation();
              if (opts.onSelectMarker) opts.onSelectMarker(m.n, 'image');
            });
            layer.appendChild(pin);
          });
        });
      }

      // Vorschau übernommener Texte
      changes.filter((c) => c.status === 'accepted').forEach((c) => {
        const el = snap.byId.get(c.element_id);
        if (!el) return;
        if (INLINE_PREVIEW_KINDS[el.kind]) {
          const ov = h('div', 'cvz-pv-after' + (el.kind === 'cta' ? ' cvz-pv-cta' : el.kind === 'headline' ? ' cvz-pv-head' : ''), c.nachher);
          ov.dataset.el = el.id;
          ov.dataset.kind = el.kind;
          ov.style.left = pct(el.box.x);
          ov.style.top = pct(el.box.y);
          if (el.kind === 'cta') {
            // Button wächst wie ein echter Button mit längerem Text in die Breite
            ov.style.minWidth = pct(el.box.w);
            ov.style.height = pct(el.box.h);
          } else {
            // Text wächst wie echter Text nach unten, wenn er länger ist als vorher
            ov.style.width = pct(el.box.w);
            ov.style.minHeight = pct(el.box.h);
          }
          layer.appendChild(ov);
        } else {
          const tag = h('div', 'cvz-pv-tag', 'Neu: ' + oneLine(c.nachher, 90));
          tag.style.left = pct(el.box.x);
          tag.style.top = pct(el.box.y);
          layer.appendChild(tag);
        }
      });
      fitPreviews();
    }

    // Schriftgröße der Vorschau aus dem Original schätzen: Fläche des alten Elements geteilt
    // durch die Zeichenzahl des alten Textes. So erscheint der neue Text ungefähr in der
    // Größe, die er auf der echten Seite hätte. Ist er länger, wird die Box größer, genau
    // wie auf der echten Seite. Das ist eine Annäherung, kein exaktes Layout.
    function fitPreviews() {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (!W || !H) return;
      layer.querySelectorAll('.cvz-pv-after').forEach((ov) => {
        const el = snap.byId.get(ov.dataset.el);
        if (!el) return;
        const bw = el.box.w * W;
        const bh = el.box.h * H;
        let size;
        if (ov.dataset.kind === 'cta') {
          size = bh * 0.42;
        } else {
          const len = Math.max(8, String(el.text || '').length);
          size = Math.sqrt((bw * bh) / (len * 0.62));
          size = Math.min(size, bh * 0.9);
        }
        ov.style.fontSize = Math.max(6, Math.min(size, 72)).toFixed(1) + 'px';
      });
    }

    img.addEventListener('load', fitPreviews);
    if (window.ResizeObserver) new ResizeObserver(() => fitPreviews()).observe(canvas);
    img.addEventListener('error', () => {
      stage.textContent = '';
      stage.appendChild(h('div', 'cvz-pv-empty', 'Der Screenshot konnte nicht geladen werden.'));
    });

    function scrollToElement(id, smooth) {
      const el = snap.byId.get(id);
      if (!el) return;
      const doScroll = () => {
        const top = el.box.y * canvas.clientHeight - stage.clientHeight * 0.3;
        stage.scrollTo({ top: Math.max(0, top), behavior: smooth === false ? 'auto' : 'smooth' });
      };
      if (img.complete && img.naturalWidth) doScroll();
      else img.addEventListener('load', doScroll, { once: true });
    }

    render();
    return {
      root,
      stage,
      img,
      select(markerN, elementId, scroll) {
        selected = { marker: markerN, element: elementId };
        render();
        if (scroll && elementId) scrollToElement(elementId);
      },
      setChanges(list) {
        changes = list || [];
        render();
      },
      setPickMode(on) {
        pickMode = !!on;
        render();
      },
      setShowAfter(on) {
        root.classList.toggle('cvz-pv-hide-after', !on);
      },
      scrollToElement,
    };
  }

  // ── Liste der Marker ────────────────────────────────────────────────────────
  function createMarkerList(snap, opts) {
    const list = h('div', 'cvz-pv-list');
    list.setAttribute('role', 'list');
    if (!snap.markers.length) {
      list.appendChild(h('div', 'cvz-pv-empty',
        'Für diese Seite konnten wir keine Empfehlung sicher einem Element zuordnen. Alle Empfehlungen findest du im Deep Dive.'));
    }
    const items = new Map();
    snap.markers.forEach((m) => {
      const el = snap.byId.get(m.element_id);
      const sev = sevOf(m.severity);
      const item = h('div', 'cvz-pv-item');
      item.setAttribute('role', 'listitem');
      item.style.setProperty('--c', sev.color);
      item.dataset.n = String(m.n);

      const head = h('button', 'cvz-pv-item-head');
      head.type = 'button';
      head.setAttribute('aria-expanded', 'false');
      head.appendChild(h('span', 'cvz-pv-num', m.n));
      const txt = h('span');
      txt.appendChild(h('div', 'cvz-pv-meta', catName(m.category) + ' · ' + sev.label + ' · ' + kindLabel(el)));
      txt.appendChild(h('div', 'cvz-pv-prob', m.problem));
      head.appendChild(txt);
      head.addEventListener('click', () => opts.onSelectMarker(m.n, 'list'));

      const body = h('div', 'cvz-pv-body');
      if (m.loesung) {
        const sol = h('div', 'cvz-pv-sol');
        sol.appendChild(h('b', null, 'Lösung'));
        sol.appendChild(document.createTextNode(m.loesung));
        body.appendChild(sol);
      }
      const actions = h('div', 'cvz-pv-actions');
      (opts.actions || []).forEach((a) => {
        const node = a(m, el);
        if (node) actions.appendChild(node);
      });
      if (actions.childNodes.length) body.appendChild(actions);

      item.appendChild(head);
      item.appendChild(body);
      list.appendChild(item);
      items.set(m.n, item);
    });
    return {
      root: list,
      select(n, scroll) {
        items.forEach((item, key) => {
          const on = key === n;
          item.classList.toggle('cvz-pv-sel', on);
          item.querySelector('.cvz-pv-item-head').setAttribute('aria-expanded', on ? 'true' : 'false');
          if (on && scroll) {
            const parent = list.closest('.cvz-pv-dlist') || list;
            if (parent.scrollHeight > parent.clientHeight) {
              parent.scrollTo({ top: item.offsetTop - parent.offsetTop - 8, behavior: 'smooth' });
            }
          }
        });
      },
    };
  }

  function legend() {
    const lg = h('div', 'cvz-pv-legend');
    ['critical', 'high', 'medium'].forEach((k) => {
      const s = h('span');
      const dot = h('i');
      dot.style.background = SEV[k].color;
      s.appendChild(dot);
      s.appendChild(document.createTextNode(SEV[k].label));
      lg.appendChild(s);
    });
    return lg;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODUS 1: REPORT
  // ══════════════════════════════════════════════════════════════════════════
  // Im Report nur eine kompakte Teaser-Karte: Vorschaubild vom oberen Teil der Seite mit den
  // Markern, die dort liegen, plus Zahl der markierten Stellen. Die volle Ansicht mit Liste,
  // Vorschlägen und Briefing gibt es im KI-Agenten (der Report bleibt so kurz wie bisher).
  function mountReport(analysis, analysisId) {
    const snap = parseSnapshot(analysis && analysis.page_snapshot);
    if (!snap || !snap.markers.length || document.querySelector('.cvz-pv-teaser-wrap')) return;
    injectStyles();

    // Agent-Link nur für den Ersteller (report.js rendert den Agent-Button nur für ihn)
    const isCreator = !!document.querySelector('.cvz-ki-btn');
    const agentHref = AGENT_URL + '?analysis_id=' + encodeURIComponent(analysisId) + '&ansicht=1';

    const wrap = h('section', 'cvz-pv-teaser-wrap');
    wrap.id = 'cvz-seite';
    const card = h('div', 'cvz-pv-teaser');

    // Vorschaubild: oberer Ausschnitt im Format 16:10
    const thumb = h(isCreator ? 'a' : 'div', 'cvz-pv-thumb');
    if (isCreator) {
      thumb.href = agentHref;
      thumb.setAttribute('aria-label', 'Markierte Seitenansicht im KI-Agenten öffnen');
    }
    const img = h('img', 'cvz-pv-thumb-img');
    img.src = snap.screenshot_url;
    img.alt = 'Ausschnitt deiner Landingpage mit markierten Stellen';
    img.loading = 'lazy';
    thumb.appendChild(img);
    const visible = 0.625 * (snap.image_width || 1200) / (snap.image_height || 3000);
    const pinsInView = snap.markers.filter((m) => snap.byId.get(m.element_id).box.y < visible * 0.92);
    const offsets = new Map();
    pinsInView.forEach((m) => {
      const el = snap.byId.get(m.element_id);
      const i = offsets.get(el.id) || 0;
      offsets.set(el.id, i + 1);
      const pin = h('span', 'cvz-pv-pin cvz-pv-pin-s', m.n);
      pin.style.setProperty('--c', sevOf(m.severity).color);
      pin.style.left = 'calc(' + (el.box.x * 100).toFixed(2) + '% + ' + i * 20 + 'px)';
      pin.style.top = ((el.box.y / visible) * 100).toFixed(2) + '%';
      pin.setAttribute('aria-hidden', 'true');
      thumb.appendChild(pin);
    });
    const below = snap.markers.length - pinsInView.length;
    if (below > 0) thumb.appendChild(h('span', 'cvz-pv-more', '+' + below + ' weiter unten'));
    card.appendChild(thumb);

    // Text
    const info = h('div', 'cvz-pv-tinfo');
    info.appendChild(h('div', 'cvz-pv-kicker', 'Deine Seite'));
    const n = snap.markers.length;
    info.appendChild(h('div', 'cvz-pv-ttitle', n + (n === 1 ? ' Stelle' : ' Stellen') + ' auf deiner Seite markiert'));
    const chips = h('div', 'cvz-pv-chips');
    ['critical', 'high', 'medium'].forEach((k) => {
      const c = snap.markers.filter((m) => String(m.severity || '').toLowerCase() === k).length;
      if (!c) return;
      const chip = h('span', 'cvz-pv-chip');
      const dot = h('i');
      dot.style.background = SEV[k].color;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(c + ' ' + SEV[k].label.toLowerCase()));
      chips.appendChild(chip);
    });
    info.appendChild(chips);
    info.appendChild(h('p', 'cvz-pv-ttext', isCreator
      ? 'Im KI-Agenten siehst du jede Stelle auf dem Screenshot deiner Seite, lässt dir neue Texte vorschlagen und gibst die Änderungen als Briefing an deine Agentur.'
      : 'Die markierte Seitenansicht mit Änderungsvorschlägen ist im KI-Agenten des Erstellers dieser Analyse verfügbar.'));
    if (isCreator) {
      const btn = h('a', 'cvz-pv-btn cvz-pv-primary cvz-pv-tbtn', 'Markierte Seite im Agent öffnen');
      btn.href = agentHref;
      info.appendChild(btn);
    }
    card.appendChild(info);
    wrap.appendChild(card);

    // Platz: eigener Webflow-Wrapper .section-page-view, sonst direkt vor dem Deep Dive
    const host = document.querySelector('.section-page-view');
    const before = document.querySelector('.section-deep-dive-hero');
    if (host) host.appendChild(wrap);
    else if (before && before.parentNode) before.parentNode.insertBefore(wrap, before);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODUS 2: AGENT
  // ══════════════════════════════════════════════════════════════════════════
  const agent = {
    analysisId: null,
    analysis: null,
    snap: null,
    changes: new Map(), // changeId -> {element_id, vorher, nachher, begruendung, status}
    deselected: new Set(), // changeIds, die beim Export nicht mitsollen (Standard: alle mit)
    branding: null, // White-Label-Einstellungen, einmal pro Seitenaufruf geladen
    libPromise: null, // Ladevorgang von cvz-export.js
    viewer: null,
    list: null,
    drawer: null,
    tabBtn: null,
    tab: 'marker',
    pushed: false,
  };

  function acceptedChanges() {
    return [...agent.changes.values()].filter((c) => c.status === 'accepted');
  }

  async function mountAgent() {
    const params = new URLSearchParams(window.location.search);
    agent.analysisId = params.get('analysis_id');
    if (!agent.analysisId) return;

    // Erst auf Memberstack warten (wie report.js)
    for (let i = 0; i < 60 && !(window.$memberstackDom && window.$memberstackDom.getMemberCookie); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }

    let data;
    try {
      data = await api('/api/user/analyses/' + encodeURIComponent(agent.analysisId));
    } catch (e) {
      console.warn('[CVZ Seitenansicht] Analyse nicht ladbar:', e.message);
      return;
    }
    agent.analysis = data.analysis;
    agent.snap = parseSnapshot(agent.analysis && agent.analysis.page_snapshot);
    if (!agent.snap) return; // alte Analyse ohne Seitenansicht: nichts anzeigen

    injectStyles();
    try {
      const res = await api('/api/agent/page-changes?analysis_id=' + encodeURIComponent(agent.analysisId));
      (res.changes || []).forEach((c) => agent.changes.set(changeId(c.element_id, c.nachher), c));
    } catch (e) {
      console.warn('[CVZ Seitenansicht] Entscheidungen nicht ladbar:', e.message);
    }

    buildDrawer();
    // Karten für Nachrichten, die schon da sind (Verlauf), und für alle neuen
    document.querySelectorAll('#messages .message.assistant').forEach(enhanceMessage);
    document.addEventListener('cvz:message-added', (ev) => {
      if (ev.detail && ev.detail.role === 'assistant' && ev.detail.el) enhanceMessage(ev.detail.el);
    });
    // Fallback, falls agent-chat.js das Event nicht feuert (ältere Version)
    const msgs = document.getElementById('messages');
    if (msgs && window.MutationObserver) {
      new MutationObserver((list) => {
        list.forEach((r) => r.addedNodes.forEach((n) => {
          if (n.nodeType === 1 && n.classList.contains('message') && n.classList.contains('assistant')) enhanceMessage(n);
        }));
      }).observe(msgs, { childList: true });
    }

    // Vom Report kommend: ?ansicht=1 öffnet das Panel, ?marker=3 zusätzlich diesen Marker
    if (params.get('ansicht') === '1') {
      openDrawer();
      if (agent.snap.markers.length) selectMarker(agent.snap.markers[0].n, 'list');
    }
    const markerParam = Number(params.get('marker'));
    if (markerParam && agent.snap.markers.some((m) => m.n === markerParam)) {
      openDrawer();
      selectMarker(markerParam, 'list');
      const m = agent.snap.markers.find((x) => x.n === markerParam);
      prefillDiscuss(m);
    }
  }

  function buildDrawer() {
    const snap = agent.snap;
    const tabBtn = h('button', 'cvz-pv-tab', 'Seitenansicht');
    tabBtn.type = 'button';
    tabBtn.setAttribute('aria-controls', 'cvz-pv-drawer');
    tabBtn.setAttribute('aria-expanded', 'false');
    tabBtn.addEventListener('click', () => (agent.drawer.classList.contains('cvz-pv-open') ? closeDrawer() : openDrawer()));
    agent.tabBtn = tabBtn;
    updateTabBadge();
    document.body.appendChild(tabBtn);

    const d = h('aside', 'cvz-pv-drawer');
    d.id = 'cvz-pv-drawer';
    d.setAttribute('aria-label', 'Seitenansicht');
    const head = h('div', 'cvz-pv-dhead');
    const t = h('div', 'cvz-pv-dtitle', 'Deine Seite');
    t.appendChild(h('div', 'cvz-pv-dsub', (agent.analysis && agent.analysis.landing_page_url) || ''));
    head.appendChild(t);
    const x = h('button', 'cvz-pv-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Seitenansicht schließen');
    x.addEventListener('click', closeDrawer);
    head.appendChild(x);
    d.appendChild(head);

    const tabs = h('div', 'cvz-pv-tabs');
    tabs.setAttribute('role', 'tablist');
    const tMarker = h('button', 'cvz-pv-on', 'Marker (' + snap.markers.length + ')');
    const tChanges = h('button', null, 'Änderungen');
    [tMarker, tChanges].forEach((b) => { b.type = 'button'; b.setAttribute('role', 'tab'); tabs.appendChild(b); });
    tMarker.addEventListener('click', () => switchTab('marker'));
    tChanges.addEventListener('click', () => switchTab('changes'));
    d.appendChild(tabs);
    agent.tMarker = tMarker;
    agent.tChanges = tChanges;

    const tools = h('div', 'cvz-pv-tools');
    const pick = h('button', 'cvz-pv-btn', 'Element wählen');
    pick.type = 'button';
    pick.setAttribute('aria-pressed', 'false');
    const after = h('button', 'cvz-pv-btn cvz-pv-on', 'Neue Texte zeigen');
    after.type = 'button';
    after.setAttribute('aria-pressed', 'true');
    const hint = h('div', 'cvz-pv-hint', '');
    tools.appendChild(pick);
    tools.appendChild(after);
    tools.appendChild(legend());
    tools.appendChild(hint);
    d.appendChild(tools);

    const body = h('div', 'cvz-pv-dbody');
    agent.viewer = createViewer(snap, {
      onSelectMarker: selectMarker,
      onPickElement: (el) => {
        prefill('[Element ' + el.id + ': ' + kindLabel(el) + (el.text ? ' "' + oneLine(el.text, 80) + '"' : '') + '] ');
        setPick(false);
        if (window.innerWidth <= 900) closeDrawer();
      },
    });
    body.appendChild(agent.viewer.root);
    const dlist = h('div', 'cvz-pv-dlist');
    body.appendChild(dlist);
    d.appendChild(body);
    agent.dlist = dlist;
    agent.hint = hint;

    const setPick = (on) => {
      pick.classList.toggle('cvz-pv-on', on);
      pick.setAttribute('aria-pressed', on ? 'true' : 'false');
      agent.viewer.setPickMode(on);
      hint.textContent = on ? 'Klick auf ein Element. Es wird in dein Eingabefeld übernommen, dann schreibst du deine Frage dazu.' : '';
    };
    pick.addEventListener('click', () => setPick(!pick.classList.contains('cvz-pv-on')));
    after.addEventListener('click', () => {
      const on = !after.classList.contains('cvz-pv-on');
      after.classList.toggle('cvz-pv-on', on);
      after.setAttribute('aria-pressed', on ? 'true' : 'false');
      agent.viewer.setShowAfter(on);
    });

    agent.list = createMarkerList(snap, {
      onSelectMarker: selectMarker,
      actions: [
        (m) => {
          const b = h('button', 'cvz-pv-btn cvz-pv-primary', 'Im Chat besprechen');
          b.type = 'button';
          b.addEventListener('click', () => {
            prefillDiscuss(m);
            if (window.innerWidth <= 900) closeDrawer();
          });
          return b;
        },
      ],
    });

    document.body.appendChild(d);
    agent.drawer = d;
    agent.viewer.setChanges(acceptedChanges());
    renderList();
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !d.classList.contains('cvz-pv-open')) return;
      // Escape im Aufgaben-Menü schließt nur das Menü, nicht das ganze Panel
      // (Nach einem Export liegt der Fokus nicht mehr im Menü, dann schließen wir es hier.)
      // Fokus im Menü: cvz-export.js hat es eben selbst geschlossen (läuft vor diesem Handler)
      if (e.target && e.target.closest && e.target.closest('.cvz-xp-wrap')) return;
      const openPop = d.querySelector('.cvz-xp-pop:not([hidden])');
      if (openPop) {
        const trigger = openPop.parentElement && openPop.parentElement.querySelector('button');
        if (trigger) trigger.click();
        return;
      }
      closeDrawer();
    });
    window.addEventListener('resize', applyPush);
  }

  function switchTab(tab) {
    agent.tab = tab;
    agent.tMarker.classList.toggle('cvz-pv-on', tab === 'marker');
    agent.tChanges.classList.toggle('cvz-pv-on', tab === 'changes');
    renderList();
  }

  function updateTabBadge() {
    const n = acceptedChanges().length;
    const btn = agent.tabBtn;
    if (!btn) return;
    btn.textContent = 'Seitenansicht';
    if (n) btn.appendChild(h('b', null, n));
    if (agent.tChanges) agent.tChanges.textContent = 'Änderungen (' + n + ')';
  }

  function renderList() {
    const box = agent.dlist;
    box.textContent = '';
    if (agent.tab === 'marker') {
      box.appendChild(agent.list.root);
      return;
    }
    const acc = acceptedChanges();
    if (!acc.length) {
      box.appendChild(h('div', 'cvz-pv-empty',
        'Noch keine Änderungen übernommen. Bitte den Agenten um konkrete Texte, zum Beispiel: "Schreib mir eine neue Hauptüberschrift." Seine Vorschläge erscheinen im Chat als Karte mit "Übernehmen".'));
      return;
    }

    // Auswahl für den Export: standardmäßig alles, abgewählte merken wir uns
    const keyOf = (c) => changeId(c.element_id, c.nachher);
    const selected = () => acc.filter((c) => !agent.deselected.has(keyOf(c)));

    const bar = h('div', 'cvz-pv-selbar');
    const allLbl = h('label', 'cvz-pv-check');
    const all = h('input');
    all.type = 'checkbox';
    allLbl.appendChild(all);
    allLbl.appendChild(document.createTextNode('Alle'));
    const count = h('span', 'cvz-pv-selcount');
    bar.appendChild(allLbl);
    bar.appendChild(count);
    box.appendChild(bar);

    const exp = h('div', 'cvz-pv-export');
    const pdf = h('button', 'cvz-pv-btn cvz-pv-primary', 'PDF');
    const md = h('button', 'cvz-pv-btn', 'Markdown');
    // Aufgaben-Export (ClickUp, Asana, Jira, Tabelle) über die gemeinsame Bibliothek
    // cvz-export.js, damit Report und Agent dieselben Formate und dasselbe Menü haben.
    const tasksSlot = h('span', 'cvz-pv-tasks-slot');
    const tasksBtn = () => tasksSlot.querySelector('button');
    const copy = h('button', 'cvz-pv-btn', 'Text kopieren');
    [pdf, md].forEach((b) => { b.type = 'button'; exp.appendChild(b); });
    exp.appendChild(tasksSlot);
    copy.type = 'button';
    exp.appendChild(copy);
    pdf.addEventListener('click', async () => {
      pdf.disabled = true;
      try {
        await exportPdf(selected());
      } catch (e) {
        console.error('[CVZ Seitenansicht] PDF-Export:', e);
        toast('PDF-Export fehlgeschlagen, nutze Markdown oder CSV');
      }
      updateSel();
    });
    md.addEventListener('click', () => downloadMarkdown(selected()));
    mountTaskExport(tasksSlot, selected, () => updateSel());
    copy.addEventListener('click', () => withBranding((br) => {
      const text = buildMarkdown(selected(), br);
      return (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(() => toast('Briefing kopiert'))
        .catch(() => toast('Kopieren nicht möglich, nutze den Markdown-Download'));
    }));
    box.appendChild(exp);

    const boxes = [];
    const updateSel = () => {
      const n = selected().length;
      count.textContent = n + ' von ' + acc.length + ' für den Export ausgewählt';
      all.checked = n === acc.length;
      all.indeterminate = n > 0 && n < acc.length;
      [pdf, md, copy, tasksBtn()].forEach((b) => { if (b) b.disabled = n === 0; });
      pdf.textContent = n ? 'PDF (' + n + ')' : 'PDF';
    };
    all.addEventListener('change', () => {
      acc.forEach((c) => (all.checked ? agent.deselected.delete(keyOf(c)) : agent.deselected.add(keyOf(c))));
      boxes.forEach((b) => (b.checked = all.checked));
      updateSel();
    });

    const list = h('div', 'cvz-pv-list');
    acc.forEach((c, i) => {
      const el = agent.snap.byId.get(c.element_id);
      const item = h('div', 'cvz-pv-item cvz-pv-sel');
      item.style.setProperty('--c', '#4fd1c5');
      const head = h('label', 'cvz-pv-item-head');
      const cb = h('input', 'cvz-pv-cb');
      cb.type = 'checkbox';
      cb.checked = !agent.deselected.has(keyOf(c));
      cb.setAttribute('aria-label', 'Änderung ' + (i + 1) + ' exportieren');
      cb.addEventListener('change', () => {
        if (cb.checked) agent.deselected.delete(keyOf(c));
        else agent.deselected.add(keyOf(c));
        updateSel();
      });
      boxes.push(cb);
      head.appendChild(cb);
      head.appendChild(h('span', 'cvz-pv-num', i + 1));
      const txt = h('span');
      txt.appendChild(h('div', 'cvz-pv-meta', kindLabel(el)));
      txt.appendChild(h('div', 'cvz-pv-prob', c.nachher));
      head.appendChild(txt);
      item.appendChild(head);
      const body = h('div', 'cvz-pv-body');
      if (c.vorher) body.appendChild(h('div', 'cvz-chg-old', c.vorher));
      const actions = h('div', 'cvz-pv-actions');
      const show = h('button', 'cvz-pv-btn', 'Auf der Seite zeigen');
      show.type = 'button';
      show.addEventListener('click', () => agent.viewer.select(null, c.element_id, true));
      const rm = h('button', 'cvz-pv-btn', 'Entfernen');
      rm.type = 'button';
      rm.addEventListener('click', () => setChangeStatus(c, 'open'));
      actions.appendChild(show);
      actions.appendChild(rm);
      body.appendChild(actions);
      item.appendChild(body);
      list.appendChild(item);
    });
    box.appendChild(list);
    updateSel();
  }

  function selectMarker(n, source) {
    const m = agent.snap.markers.find((x) => x.n === n);
    if (!m) return;
    if (agent.tab !== 'marker') switchTab('marker');
    agent.viewer.select(n, m.element_id, source !== 'image');
    agent.list.select(n, source === 'image');
  }

  function openDrawer() {
    agent.drawer.classList.add('cvz-pv-open');
    agent.tabBtn.setAttribute('aria-expanded', 'true');
    agent.tabBtn.style.display = 'none';
    applyPush();
  }
  function closeDrawer() {
    agent.drawer.classList.remove('cvz-pv-open');
    agent.tabBtn.setAttribute('aria-expanded', 'false');
    agent.tabBtn.style.display = '';
    applyPush();
    agent.tabBtn.focus();
  }
  // Auf breiten Bildschirmen schiebt das Panel die Seite zur Seite, statt den Chat zu verdecken
  function applyPush() {
    const open = agent.drawer && agent.drawer.classList.contains('cvz-pv-open');
    const wide = window.innerWidth > 1100;
    document.body.classList.add('cvz-pv-push');
    document.body.style.paddingRight = open && wide ? agent.drawer.offsetWidth + 'px' : '';
  }

  function prefill(text) {
    const input = document.getElementById('user-input');
    if (!input || input.disabled) return;
    input.value = text;
    input.focus();
    try { input.setSelectionRange(text.length, text.length); } catch (e) { /* textarea ohne Auswahl */ }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function prefillDiscuss(m) {
    if (!m) return;
    const el = agent.snap.byId.get(m.element_id);
    prefill('Lass uns Marker ' + m.n + ' angehen (' + kindLabel(el) + (el && el.text ? ' "' + oneLine(el.text, 60) + '"' : '') + '): ' +
      oneLine(m.problem, 160) + ' Was schlägst du konkret vor?');
  }

  // ── Vorschlags-Karten im Chat ───────────────────────────────────────────────
  // Die Agent-API liefert Vorschläge als ```cvz-change```-Block. marked.js macht daraus
  // <pre><code class="language-cvz-change">. Den ersetzen wir durch eine Karte.
  function enhanceMessage(msgEl) {
    if (!agent.snap || !msgEl || !msgEl.querySelectorAll) return;
    msgEl.querySelectorAll('pre > code.language-cvz-change').forEach((code) => {
      let data;
      try {
        data = JSON.parse(code.textContent);
      } catch (e) {
        code.parentElement.remove();
        return;
      }
      const el = agent.snap.byId.get(data && data.element_id);
      if (!el || !data.nachher) {
        code.parentElement.remove();
        return;
      }
      const key = changeId(data.element_id, data.nachher);
      const card = buildChangeCard({
        element_id: data.element_id,
        vorher: data.vorher || el.text || '',
        nachher: String(data.nachher),
        begruendung: data.begruendung || '',
      }, el, key);
      code.parentElement.replaceWith(card);
    });
  }

  function buildChangeCard(change, el, key) {
    const card = h('div', 'cvz-chg');
    card.dataset.key = key;
    const head = h('div', 'cvz-chg-head');
    head.appendChild(h('span', 'cvz-chg-kind', 'Vorschlag: ' + kindLabel(el)));
    const show = h('button', 'cvz-chg-show', 'Auf der Seite zeigen');
    show.type = 'button';
    show.addEventListener('click', () => {
      openDrawer();
      agent.viewer.select(null, change.element_id, true);
    });
    head.appendChild(show);
    card.appendChild(head);

    if (change.vorher) {
      const r1 = h('div', 'cvz-chg-row');
      r1.appendChild(h('div', 'cvz-chg-lbl', 'Jetzt'));
      r1.appendChild(h('div', 'cvz-chg-old', oneLine(change.vorher, 300)));
      card.appendChild(r1);
    }
    const r2 = h('div', 'cvz-chg-row');
    r2.appendChild(h('div', 'cvz-chg-lbl', 'Neu'));
    r2.appendChild(h('div', 'cvz-chg-new', change.nachher));
    card.appendChild(r2);
    if (change.begruendung) card.appendChild(h('div', 'cvz-chg-why', change.begruendung));

    const actions = h('div', 'cvz-chg-actions');
    card.appendChild(actions);
    const renderState = () => {
      const saved = agent.changes.get(key);
      const state = saved ? saved.status : 'open';
      card.dataset.state = state;
      actions.textContent = '';
      if (state === 'open') {
        const ok = h('button', 'cvz-pv-btn cvz-pv-primary', 'Übernehmen');
        const no = h('button', 'cvz-pv-btn', 'Verwerfen');
        ok.type = 'button';
        no.type = 'button';
        ok.addEventListener('click', () => setChangeStatus(change, 'accepted', [ok, no]));
        no.addEventListener('click', () => setChangeStatus(change, 'rejected', [ok, no]));
        actions.appendChild(ok);
        actions.appendChild(no);
      } else {
        actions.appendChild(h('span', 'cvz-chg-state', state === 'accepted' ? 'Übernommen, steht im Briefing' : 'Verworfen'));
        const undo = h('button', 'cvz-chg-undo', 'Rückgängig');
        undo.type = 'button';
        undo.addEventListener('click', () => setChangeStatus(change, 'open', [undo]));
        actions.appendChild(undo);
      }
    };
    card._cvzRender = renderState;
    renderState();
    return card;
  }

  async function setChangeStatus(change, status, buttons) {
    (buttons || []).forEach((b) => (b.disabled = true));
    const key = changeId(change.element_id, change.nachher);
    try {
      await api('/api/agent/page-changes', {
        method: 'POST',
        body: {
          analysis_id: agent.analysisId,
          element_id: change.element_id,
          vorher: change.vorher,
          nachher: change.nachher,
          begruendung: change.begruendung,
          status: status,
        },
      });
      if (status === 'open') agent.changes.delete(key);
      else agent.changes.set(key, Object.assign({}, change, { status: status }));
      if (status === 'accepted') toast('Übernommen. Du findest es unter "Änderungen".');
    } catch (e) {
      toast('Speichern fehlgeschlagen: ' + e.message);
    }
    (buttons || []).forEach((b) => (b.disabled = false));
    document.querySelectorAll('.cvz-chg').forEach((c) => c._cvzRender && c._cvzRender());
    agent.viewer.setChanges(acceptedChanges());
    updateTabBadge();
    if (agent.tab === 'changes') renderList();
  }

  // ── Briefing-Export ─────────────────────────────────────────────────────────
  function positionText(el) {
    return 'etwa ' + Math.round(el.box.y * 100) + ' % von oben';
  }

  function buildMarkdown(acc, br) {
    const a = agent.analysis || {};
    const now = new Date();
    let md = '# Änderungs-Briefing\n\n';
    md += '**Seite:** ' + (a.landing_page_url || '') + '\n';
    md += '**Erstellt:** ' + now.toLocaleDateString('de-DE') + (br && br.whiteLabel ? '' : ' mit Convertlyze') + '\n';
    md += '**Änderungen:** ' + acc.length + '\n\n';
    md += 'Die Positionsangaben beziehen sich auf den Screenshot vom ' + formatDate(agent.snap.captured_at) + '.\n\n---\n\n';
    acc.forEach((c, i) => {
      const el = agent.snap.byId.get(c.element_id);
      md += '## ' + (i + 1) + '. ' + kindLabel(el) + ' (' + positionText(el) + ')\n\n';
      if (c.vorher) md += '**Aktuell:** ' + oneLine(c.vorher) + '\n\n';
      md += '**Neu:** ' + c.nachher + '\n\n';
      if (c.begruendung) md += '**Warum:** ' + c.begruendung + '\n\n';
      md += '---\n\n';
    });
    return md.trim() + '\n';
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function downloadMarkdown(acc) {
    return withBranding((br) => {
      downloadBlob(new Blob([buildMarkdown(acc, br)], { type: 'text/markdown;charset=utf-8' }), fileBase(br) + '.md');
      toast('Markdown exportiert');
    });
  }

  // ── Aufgaben-Export (cvz-export.js) ─────────────────────────────────────────
  const CVZ_EXPORT_URL = 'https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/cvz-export.js';
  const SEV_TO_PRIO = { critical: 'urgent', high: 'high', medium: 'normal' };
  const PRIO_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

  // Lädt die Bibliothek nach, falls sie auf der Agent-Seite nicht eingebunden ist
  function ensureExportLib() {
    if (window.CVZExport) return Promise.resolve(window.CVZExport);
    if (!agent.libPromise) {
      agent.libPromise = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = CVZ_EXPORT_URL;
        sc.onload = () => (window.CVZExport ? resolve(window.CVZExport) : reject(new Error('CVZExport fehlt')));
        sc.onerror = () => reject(new Error('cvz-export.js nicht ladbar'));
        document.head.appendChild(sc);
      }).catch((e) => {
        agent.libPromise = null; // nächster Versuch beim nächsten Öffnen des Tabs
        throw e;
      });
    }
    return agent.libPromise;
  }

  // Übernommene Änderungen -> neutrale Aufgaben (Format siehe cvz-export.js).
  // Eine Oberaufgabe pro Briefing, darunter eine Aufgabe pro Änderung.
  // Priorität: Schweregrad des Markers am selben Element, sonst "Mittel".
  function changesToTasks(list, br) {
    const X = window.CVZExport;
    if (!X || !list.length) return [];
    const a = agent.analysis || {};
    let host = '';
    try { host = new URL(a.landing_page_url).hostname.replace(/^www\./, ''); } catch (e) { host = ''; }
    const brandLabels = br && br.whiteLabel ? [] : ['Convertlyze'];
    const shotDate = formatDate(agent.snap.captured_at);
    const parent = {
      id: 'brief',
      title: 'Änderungs-Briefing' + (host ? ': ' + host : ''),
      description: [
        'Textänderungen für ' + (a.landing_page_url || 'die Landingpage') + '.',
        'Positionsangaben beziehen sich auf den Screenshot vom ' + shotDate + '.',
      ].join('\n'),
      labels: ['Briefing'].concat(brandLabels),
    };
    const tasks = [parent];
    list.forEach((c, i) => {
      const el = agent.snap.byId.get(c.element_id);
      let priority = 'normal';
      agent.snap.markers.forEach((m) => {
        const p = SEV_TO_PRIO[String(m.severity || '').toLowerCase()];
        if (m.element_id === c.element_id && p && PRIO_RANK[p] < PRIO_RANK[priority]) priority = p;
      });
      tasks.push({
        id: 'c' + (i + 1),
        parentId: parent.id,
        title: X.truncate(kindLabel(el) + ' ändern: ' + c.nachher, 110),
        priority,
        filterId: 'change',
        description: [
          'Element: ' + kindLabel(el) + ' (' + positionText(el) + ')',
          c.vorher ? 'Aktuell:\n' + oneLine(c.vorher) : '',
          'Neu:\n' + c.nachher,
          c.begruendung ? 'Warum:\n' + c.begruendung : '',
          'Seite: ' + (a.landing_page_url || ''),
        ].filter(Boolean).join('\n\n'),
        labels: [kindLabel(el)].concat(brandLabels),
      });
    });
    return tasks;
  }

  // Baut das Menü der Bibliothek in den Platzhalter. Branding wird vorher geladen, weil
  // Dateinamen und Labels davon abhängen (White-Label: ohne "Convertlyze").
  function mountTaskExport(slot, getSelected, onReady) {
    const wait = h('button', 'cvz-pv-btn', 'Aufgaben (CSV) ...');
    wait.type = 'button';
    wait.disabled = true;
    slot.appendChild(wait);
    Promise.all([ensureExportLib(), getBranding()])
      .then(([X, br]) => {
        if (!slot.isConnected) return;
        const menu = X.createExportMenu({
          label: 'Aufgaben (CSV)',
          triggerClass: 'cvz-pv-btn',
          placement: 'down-left',
          // Eigene Hinweise: Hier gibt es keine Kategorien, sondern ein Briefing mit Änderungen
          targets: [
            { id: 'clickup', label: 'ClickUp (CSV)', hint: 'Briefing als Aufgabe, Änderungen als Unteraufgaben' },
            { id: 'asana', label: 'Asana (CSV)', hint: 'Briefing als Aufgabe, Änderungen als Unteraufgaben' },
            { id: 'jira', label: 'Jira (CSV)', hint: 'Eine Aufgabe pro Änderung, Element als Label' },
            { id: 'table', label: 'Tabelle (CSV)', hint: 'Excel, Google Sheets, Notion, Airtable' },
          ],
          getTasks: () => changesToTasks(getSelected(), br),
          getMeta: () => ({ filenameBase: fileBase(br), idPrefix: 'AE' }),
        });
        slot.textContent = '';
        slot.appendChild(menu);
        if (onReady) onReady();
      })
      .catch((e) => {
        console.warn('[CVZ Seitenansicht] Aufgaben-Export nicht verfügbar:', e.message);
        wait.textContent = 'Aufgaben (CSV) nicht verfügbar';
        wait.title = 'Export-Bibliothek oder Branding konnte nicht geladen werden. Seite neu laden.';
      });
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Ausschnitt des Screenshots rund um ein Element, mit Markierung. Gibt null zurück,
  // wenn das Bild nicht in ein Canvas darf (CORS), dann kommt das PDF ohne Bilder aus.
  function cropAround(img, el, color) {
    try {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const bx = el.box.x * W;
      const by = el.box.y * H;
      const bw = el.box.w * W;
      const bh = el.box.h * H;
      const cropH = Math.min(H, Math.max(260, Math.min(720, bh + 220)));
      let top = by + bh / 2 - cropH / 2;
      if (bh + 80 > cropH) top = by - 40;
      top = Math.max(0, Math.min(H - cropH, top));
      const scale = Math.min(1, 1000 / W);
      const c = document.createElement('canvas');
      c.width = Math.round(W * scale);
      c.height = Math.round(cropH * scale);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, top, W, cropH, 0, 0, c.width, c.height);
      const col = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#4fd1c5';
      ctx.strokeStyle = col;
      ctx.lineWidth = 5;
      ctx.fillStyle = col + '1f';
      const rx = bx * scale;
      const ry = (by - top) * scale;
      ctx.fillRect(rx, ry, bw * scale, bh * scale);
      ctx.strokeRect(rx, ry, bw * scale, bh * scale);
      return { data: c.toDataURL('image/jpeg', 0.82), ratio: c.height / c.width };
    } catch (e) {
      return null;
    }
  }

  // jsPDF mit Standardschrift kann nur Zeichen aus Latin-1 (Umlaute und ß gehen).
  // Alles andere (typografische Anführungszeichen, Pfeile, Emojis) ersetzen wir.
  function pdfText(s) {
    return String(s || '')
      .replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'")
      .replace(/[–—]/g, ', ').replace(/…/g, '...').replace(/→/g, '->').replace(/•/g, '-')
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
  }

  // ── Branding (White-Label) ──────────────────────────────────────────────────
  // Regel kommt vom Server (gleich wie bei den anderen PDF-Exporten): Pro/Enterprise mit
  // eigenem Logo oder eigener Farbe -> white_label, sonst Convertlyze. Das Logo liefert der
  // Server als data-URL. Schlägt die Abfrage fehl, brechen wir den Export ab, statt still
  // mit Convertlyze-Logo zu exportieren (ein White-Label-Kunde gäbe das sonst weiter).
  async function getBranding() {
    if (agent.branding) return agent.branding;
    const b = await api('/api/agent/briefing-branding?analysis_id=' + encodeURIComponent(agent.analysisId));
    agent.branding = {
      whiteLabel: b && b.theme === 'white_label',
      accent: b && /^#[0-9a-fA-F]{6}$/.test(b.accent_color || '') ? b.accent_color : null,
      logo: b && typeof b.logo_data_url === 'string' && b.logo_data_url.indexOf('data:image/') === 0 ? b.logo_data_url : null,
    };
    return agent.branding;
  }

  async function withBranding(fn) {
    let br;
    try {
      br = await getBranding();
    } catch (e) {
      toast('Export abgebrochen: Branding konnte nicht geladen werden. Bitte erneut versuchen.');
      return;
    }
    return fn(br);
  }

  function fileBase(br) {
    const date = new Date().toISOString().slice(0, 10);
    let host = '';
    try { host = new URL((agent.analysis || {}).landing_page_url).hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, ''); } catch (e) { host = ''; }
    // White-Label: kein "convertlyze" im Dateinamen (wie bei den anderen Exporten)
    return (br && br.whiteLabel ? 'briefing' : 'convertlyze-briefing') + (host ? '-' + host : '') + '-' + date;
  }

  function hexToRgb(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  }

  // Logo (beliebiges Bildformat, auch SVG/WebP) über ein Canvas in PNG wandeln, weil jsPDF
  // nur PNG/JPEG kann. Bei data-URLs ist das Canvas nie durch CORS gesperrt.
  async function logoToPng(src, background) {
    const img = await loadImage(src);
    if (!img || !img.naturalWidth) return null;
    try {
      const scale = Math.min(1, 800 / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d');
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return { data: c.toDataURL('image/png'), ratio: c.width / c.height };
    } catch (e) {
      return null;
    }
  }

  async function exportPdf(acc) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      toast('PDF-Export nicht verfügbar, nutze Markdown oder CSV');
      return;
    }
    const br = await getBranding().catch(() => null);
    if (!br) {
      toast('Export abgebrochen: Branding konnte nicht geladen werden. Bitte erneut versuchen.');
      return;
    }
    toast('PDF wird erstellt ...');
    const WL = br.whiteLabel;
    const [shot, logo] = await Promise.all([
      loadImage(agent.snap.screenshot_url),
      WL ? (br.logo ? logoToPng(br.logo, null) : Promise.resolve(null)) : logoToPng(LOGO_URL, '#1f2937'),
    ]);

    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, ML = 18, MR = 18, MB = 18;
    const CW = PW - ML - MR;
    // White-Label: helles, neutrales Theme mit der Akzentfarbe des Kunden (Fallback Blau wie im
    // Server-Export). Convertlyze: dunkle Kopfzeile mit Teal wie beim Chat-Export.
    const accent = WL ? (hexToRgb(br.accent) || [37, 99, 235]) : [79, 209, 197];
    const accentHex = WL ? (br.accent || '#2563eb') : '#4fd1c5';
    const C = { dark: [31, 41, 55], text: [17, 24, 39], mid: [75, 85, 99], light: [156, 163, 175], border: [229, 231, 235] };
    let y = 0;
    const a = agent.analysis || {};

    // Logo in eine Box einpassen, Seitenverhältnis bleibt erhalten
    const drawLogo = (x, top, maxW, maxH) => {
      if (!logo) return 0;
      let w = maxW;
      let h = w / logo.ratio;
      if (h > maxH) { h = maxH; w = h * logo.ratio; }
      doc.addImage(logo.data, 'PNG', x, top + (maxH - h) / 2, w, h, undefined, 'FAST');
      return w;
    };

    const runningHeader = () => {
      if (WL) {
        doc.setFillColor.apply(doc, accent);
        doc.rect(0, 0, PW, 1.2, 'F');
        drawLogo(ML, 4, 34, 9);
        doc.setDrawColor.apply(doc, C.border);
        doc.setLineWidth(0.2);
        doc.line(ML, 16, PW - MR, 16);
        doc.setTextColor.apply(doc, C.light);
      } else {
        doc.setFillColor.apply(doc, C.dark);
        doc.rect(0, 0, PW, 16, 'F');
        doc.setFillColor.apply(doc, accent);
        doc.rect(0, 16, PW, 0.6, 'F');
        drawLogo(ML, 3, 36, 10);
        doc.setTextColor(200, 200, 200);
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(pdfText('Änderungs-Briefing'), PW - MR, 10, { align: 'right' });
      y = 26;
    };
    const ensure = (need) => {
      if (y + need > PH - MB) {
        doc.addPage();
        runningHeader();
      }
    };
    const para = (text, size, color, bold, indent) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor.apply(doc, color);
      const lines = doc.splitTextToSize(pdfText(text), CW - (indent || 0));
      lines.forEach((ln) => {
        ensure(size * 0.5);
        doc.text(ln, ML + (indent || 0), y);
        y += size * 0.45;
      });
    };

    // Titelbereich
    if (WL) {
      doc.setFillColor.apply(doc, accent);
      doc.rect(0, 0, PW, 2, 'F');
      const lw = drawLogo(ML, 10, 60, 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor.apply(doc, C.text);
      doc.text(pdfText('Änderungs-Briefing'), ML, lw ? 38 : 24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, C.mid);
      doc.text(pdfText(oneLine(a.landing_page_url || '', 95)), ML, lw ? 45 : 31);
      doc.setDrawColor.apply(doc, accent);
      doc.setLineWidth(0.6);
      doc.line(ML, lw ? 50 : 36, ML + 24, lw ? 50 : 36);
      y = lw ? 60 : 46;
    } else {
      doc.setFillColor.apply(doc, C.dark);
      doc.rect(0, 0, PW, 50, 'F');
      doc.setFillColor.apply(doc, accent);
      doc.rect(0, 49, PW, 1, 'F');
      if (!drawLogo(ML, 9, 52, 14)) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(255, 255, 255);
        doc.text('Convertlyze', ML, 20);
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text(pdfText('Änderungs-Briefing'), ML, 36);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(200, 205, 214);
      doc.text(pdfText(oneLine(a.landing_page_url || '', 95)), ML, 43);
      y = 60;
    }

    para('Erstellt am ' + new Date().toLocaleDateString('de-DE') + '. ' + acc.length + (acc.length === 1 ? ' Änderung' : ' Änderungen') +
      '. Die Markierung im Ausschnitt zeigt die Stelle auf der Seite (Screenshot vom ' + formatDate(agent.snap.captured_at) + ').', 9.5, C.mid, false);
    y += 4;

    acc.forEach((c, i) => {
      const el = agent.snap.byId.get(c.element_id);
      const crop = shot ? cropAround(shot, el, accentHex) : null;
      const imgH = crop ? Math.min(78, CW * crop.ratio) : 0;
      const imgW = crop ? imgH / crop.ratio : 0;
      ensure(14 + imgH + 30);

      doc.setDrawColor.apply(doc, C.border);
      doc.setLineWidth(0.2);
      doc.line(ML, y, PW - MR, y);
      y += 7;
      para((i + 1) + '. ' + kindLabel(el) + '  (' + positionText(el) + ')', 11.5, C.text, true);
      y += 1.5;
      if (crop) {
        doc.addImage(crop.data, 'JPEG', ML, y, imgW, imgH, undefined, 'FAST');
        doc.setDrawColor.apply(doc, C.border);
        doc.rect(ML, y, imgW, imgH);
        y += imgH + 6;
      }
      const row = (label, text, color, bold) => {
        if (!text) return;
        ensure(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, label === 'Neu' ? accent : C.light);
        doc.text(label.toUpperCase(), ML, y);
        y += 4.2;
        para(text, bold ? 10.5 : 9.5, color, bold);
        y += 2.5;
      };
      row('Aktuell', c.vorher ? oneLine(c.vorher, 600) : '', C.mid, false);
      row('Neu', c.nachher, C.text, true);
      row('Warum', c.begruendung, C.mid, false);
      y += 3;
    });

    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setDrawColor.apply(doc, C.border);
      doc.setLineWidth(0.3);
      doc.line(ML, PH - 11, PW - MR, PH - 11);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor.apply(doc, C.light);
      // White-Label: kein Hinweis auf Convertlyze, nur Seitenzahlen
      if (!WL) doc.text('Erstellt mit Convertlyze  -  convertlyze.com', ML, PH - 5);
      if (pages > 1) doc.text(p + ' / ' + pages, PW - MR, PH - 5, { align: 'right' });
    }
    doc.setProperties({ title: 'Änderungs-Briefing', creator: WL ? '' : 'Convertlyze', author: WL ? '' : 'Convertlyze' });
    doc.save(fileBase(br) + '.pdf');
    toast(shot ? 'PDF exportiert' : 'PDF exportiert (ohne Ausschnitte, Bild nicht ladbar)');
  }

  // ── Start ───────────────────────────────────────────────────────────────────
  window.CVZPageView = { parseSnapshot, createViewer, mountReport, version: '1.0' };

  function start() {
    if (document.getElementById('messages') && document.getElementById('user-input')) {
      mountAgent().catch((e) => console.error('[CVZ Seitenansicht] Agent-Modus:', e));
      return;
    }
    // Report: report.js stellt die Analyse bereit und feuert cvz:report-ready
    if (window.CVZ_REPORT && window.CVZ_REPORT.analysis) {
      mountReport(window.CVZ_REPORT.analysis, window.CVZ_REPORT.analysisId);
    }
    document.addEventListener('cvz:report-ready', () => {
      if (window.CVZ_REPORT) mountReport(window.CVZ_REPORT.analysis, window.CVZ_REPORT.analysisId);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
