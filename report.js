/**
 * Convertlyze – Report Script v2
 * https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/report.js
 *
 * Embed in Webflow Before </body>:
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/report.js"></script>
 *
 * Webflow-Klassen für Sektions-Wrapper:
 *   section-executive-summary
 *   section-deep-dive-hero
 *   section-deep-dive-content
 *   section-deep-dive-zielgruppe
 *   section-deep-dive-conversion
 *   section-deep-dive-struktur
 *   section-deep-dive-searchintent
 *   section-deep-dive-differenzierung
 *   section-deep-dive-performance
 *   section-deep-dive-ai
 *   section-roadmap
 *   section-ki-agent-btn
 */

(function () {
  'use strict';

  // ── Supabase Config ─────────────────────────────────────────────────────────
  const SUPABASE_URL      = 'https://zpkifipmyeunorhtepzq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2lmaXBteWV1bm9yaHRlcHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTU5NzUsImV4cCI6MjA3NTU5MTk3NX0.srygp8EElOknEnIBeUxdgHGLw0VzH-etxLhcD0CIPcU';

  // ── CSS injizieren ──────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('cvz-report-styles')) return;
    const s = document.createElement('style');
    s.id = 'cvz-report-styles';
    s.textContent = `
      /* Anti-Flackern */
      [data-field],[data-analysis]{
        visibility:hidden;opacity:0;
        white-space:normal!important;overflow:visible!important;
        text-overflow:clip!important;word-wrap:break-word!important;
      }
      .analysis-loaded [data-field],
      .analysis-loaded [data-analysis]{
        visibility:visible!important;opacity:1!important;
        transition:opacity .3s ease;
        white-space:normal!important;overflow:visible!important;
        text-overflow:clip!important;word-wrap:break-word!important;
      }
      .w-dropdown-list [data-field],
      .w-dropdown-list [data-analysis]{
        white-space:normal!important;overflow:visible!important;display:block!important;
      }

      /* Share feedback */
      .share-success{animation:cvzShare .3s ease}
      @keyframes cvzShare{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}

      /* ── Design System ── */
      .cvz-section{
        max-width:1200px;margin:0 auto;padding:0 24px 32px;
        font-family:'Geist','DM Sans','Segoe UI',sans-serif;color:#e2e8f0;
      }

      /* Reduced motion */
      @media(prefers-reduced-motion:reduce){
        .cvz-fi{animation:none!important;opacity:1!important;transform:none!important;}
        .cvz-bf{animation:none!important;width:var(--bw)!important;}
        .cvz-ring{animation:none!important;opacity:1!important;transform:none!important;}
        *{transition:none!important;}
      }

      /* Fade-in */
      .cvz-fi{opacity:0;transform:translateY(14px);animation:cvzFI .55s ease forwards;}
      .cvz-fi-1{animation-delay:.05s}.cvz-fi-2{animation-delay:.15s}
      .cvz-fi-3{animation-delay:.25s}.cvz-fi-4{animation-delay:.35s}
      .cvz-fi-5{animation-delay:.45s}.cvz-fi-6{animation-delay:.55s}
      @keyframes cvzFI{to{opacity:1;transform:translateY(0)}}
      @keyframes cvzBar{from{width:0}to{width:var(--bw)}}
      @keyframes cvzRing{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}

      /* Anker-Navigation */
      .cvz-anchor-nav{
        background:#0d1117;
        border-top:1px solid rgba(255,255,255,.06);
        border-bottom:1px solid rgba(255,255,255,.06);
        position:sticky;top:0;z-index:100;
        width:100%;overflow:hidden;
      }
      /* top wird per JS gesetzt sobald Nav-Höhe bekannt ist */
      .cvz-anchor-nav-inner{
        display:flex;align-items:center;justify-content:center;
        gap:0;width:100%;padding:0 24px;
        overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;
      }
      .cvz-anchor-nav-inner::-webkit-scrollbar{display:none;}
      .cvz-anchor-nav a{
        display:inline-flex;align-items:center;flex-shrink:0;
        padding:14px 22px;
        font-family:'Geist','DM Sans',sans-serif;font-size:13px;font-weight:500;
        color:#6e7681;text-decoration:none;white-space:nowrap;
        border-bottom:2px solid transparent;
        transition:color .15s ease,border-color .15s ease;
        position:relative;
      }
      .cvz-anchor-nav a:hover{color:#e6edf3;border-bottom-color:rgba(79,209,197,.4);}
      .cvz-anchor-nav a.cvz-nav-active{color:#6e7681;border-bottom-color:transparent;}
      .cvz-anchor-nav a+a::before{
        content:'';position:absolute;left:0;top:25%;
        height:50%;width:1px;background:rgba(255,255,255,.06);
      }
      .cvz-anchor-nav a:focus-visible{outline:2px solid #4fd1c5;outline-offset:2px;border-radius:2px;}
      @media(max-width:600px){
        .cvz-anchor-nav-inner{justify-content:flex-start;padding:0;}
        .cvz-anchor-nav a{font-size:12px;padding:12px 16px;}
        .cvz-anchor-nav a:first-child{padding-left:16px;}
      }

      /* Kategorie-Header */
      .cvz-cat-header{
        display:flex;align-items:center;justify-content:space-between;
        padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:20px;
      }
      .cvz-cat-name{font-size:18px;font-weight:700;color:#f0f4f8;letter-spacing:-.01em;}
      .cvz-cat-score{font-size:22px;font-weight:700;font-family:'DM Mono',monospace;color:#e8edf5!important;}

      /* Karten */
      .cvz-cards{display:flex;flex-direction:column;gap:12px;margin-bottom:8px;}
      .cvz-card{
        background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
        border-radius:12px;padding:18px 20px;transition:border-color .2s,background .2s;
      }
      .cvz-card:hover{border-color:rgba(79,209,197,.2);background:rgba(79,209,197,.02);}
      .cvz-card-label{
        font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
        margin-bottom:10px;display:flex;align-items:center;gap:7px;
      }
      .cvz-card-label-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
      .cvz-card-body{font-size:14px;color:#c4cdd6;line-height:1.65;}
      .cvz-card-empfehlungen .cvz-card-body{font-size:14px;color:#e8edf5;}
      .cvz-card-empfehlungen .cvz-card-body li{color:#e8edf5;font-size:14px;}
      .cvz-card-empfehlungen .cvz-card-body li li,
      .cvz-card-empfehlungen .cvz-card-body ul ul li,
      .cvz-card-empfehlungen .cvz-card-body ol ol li{color:#e8edf5!important;font-size:14px!important;}
      .cvz-card-body li{color:#e8edf5;font-size:14px;}
      .cvz-card-body *{color:inherit;}
      .cvz-card-empfehlungen .cvz-card-body,
      .cvz-card-empfehlungen .cvz-card-body *{color:#e8edf5!important;font-size:14px!important;}
      .cvz-card-empfehlungen .cvz-card-body strong{color:#ffffff!important;}
      .cvz-card-body p{margin:0 0 6px}.cvz-card-body p:last-child{margin-bottom:0}
      .cvz-card-body ul,.cvz-card-body ol{padding-left:18px;margin:0}
      .cvz-card-body li{margin-bottom:6px}
      .cvz-card-body strong{color:#e2e8f0}
      .cvz-card-summary    .cvz-card-label{color:#718096}
      .cvz-card-summary    .cvz-card-label-dot{background:#718096}
      .cvz-card-staerken   .cvz-card-label{color:#4fd1c5}
      .cvz-card-staerken   .cvz-card-label-dot{background:#4fd1c5}
      .cvz-card-schwaechen .cvz-card-label{color:#ef4444}
      .cvz-card-schwaechen .cvz-card-label-dot{background:#ef4444}
      .cvz-card-empfehlungen .cvz-card-label{color:#718096}
      .cvz-card-empfehlungen .cvz-card-label-dot{background:#718096}

      /* Executive Summary: Score Panel */
      .cvz-exec-panel{
        background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
        border-radius:16px;padding:24px 28px;
        display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px;
      }
      .cvz-ring{flex-shrink:0;text-align:center;animation:cvzRing .75s cubic-bezier(.34,1.56,.64,1) .15s both;}
      .cvz-ring-c{
        width:96px;height:96px;border-radius:50%;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
      }
      .cvz-ring-n{font-size:30px;font-weight:700;line-height:1;}
      .cvz-ring-d{font-size:11px;color:#718096;margin-top:2px;}
      .cvz-ring-l{font-size:10px;color:#4a5568;margin-top:8px;letter-spacing:.08em;text-transform:uppercase;}
      .cvz-bars{flex:1;min-width:200px;}
      .cvz-br{display:flex;align-items:center;gap:8px;margin-bottom:7px;cursor:default;}
      .cvz-br:last-child{margin-bottom:0}
      .cvz-bl{font-size:13px;color:#718096;width:100px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s;}
      .cvz-br:hover .cvz-bl{color:#e2e8f0}
      .cvz-bt{flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;}
      .cvz-bf{height:100%;border-radius:3px;width:0;background:#4fd1c5;opacity:.75;
              animation:cvzBar 1s cubic-bezier(.4,0,.2,1) .65s forwards;transition:opacity .15s,filter .15s;}
      .cvz-br:hover .cvz-bf{opacity:1;filter:brightness(1.15)}
      .cvz-bv{font-size:14px;font-family:'DM Mono',monospace;width:32px;text-align:right;flex-shrink:0;color:#4fd1c5;}

      /* Executive Summary: Badges */
      .cvz-badges{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
      .cvz-badge{
        flex:1;min-width:150px;
        background:rgba(79,209,197,.05);border:1px solid rgba(79,209,197,.18);
        border-radius:12px;padding:13px 15px;
        transition:border-color .2s,background .2s,transform .2s;cursor:default;
      }
      .cvz-badge:hover{border-color:rgba(79,209,197,.32);background:rgba(79,209,197,.08);transform:translateY(-1px)}
      .cvz-badge-h{display:flex;align-items:center;gap:7px;margin-bottom:7px;}
      .cvz-badge-dot{width:6px;height:6px;border-radius:50%;background:#4fd1c5;flex-shrink:0;}
      .cvz-badge-t{font-size:11px;font-weight:600;color:#4fd1c5;letter-spacing:.05em;text-transform:uppercase;}
      .cvz-badge-tx{font-size:14px;color:#718096;line-height:1.55;}

      /* Sektions-Überschriften */
      .cvz-heading-wrap{max-width:1200px;margin:0 auto;padding:56px 24px 24px;text-align:center;}
      .cvz-heading-wrap.cvz-heading-top{border-top:none!important;}
      .cvz-heading-title{
        font-size:clamp(36px,6vw,80px);font-weight:800;letter-spacing:-.02em;
        color:rgba(148,163,184,.25);text-transform:uppercase;line-height:1!important;margin-bottom:12px;
      }
      .cvz-heading-wrap,.cvz-heading-wrap *{line-height:1.2!important;}

      /* Webflow Section-Wrapper resetten */
      .section-hero-info,
      .section-executive-summary,
      .section-deep-dive-hero,
      .section-deep-dive-content,
      .section-deep-dive-zielgruppe,
      .section-deep-dive-conversion,
      .section-deep-dive-struktur,
      .section-deep-dive-searchintent,
      .section-deep-dive-differenzierung,
      .section-deep-dive-performance,
      .section-deep-dive-ai,
      .section-roadmap,
      .section-ki-agent-btn {
        padding: 0 !important;
        margin: 0 !important;
        display: block !important;
        width: 100% !important;
        flex-direction: unset !important;
        align-items: unset !important;
        justify-content: unset !important;
        gap: unset !important;
      }
      .cvz-heading-sub{font-size:14px;color:#718096;line-height:1.6;max-width:640px;margin:8px auto 0;}

      /* Info Grid (Hero Block) */
      .cvz-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;}
      .section-hero-info .cvz-card{border-bottom:none!important;}
      .section-hero-info .cvz-card{
        background:#0d1117!important;
        border:1px solid rgba(255,255,255,.07)!important;
        color:#e2e8f0!important;
      }
      .cvz-info-label{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#4a5568!important;}
      .cvz-info-value{font-size:14px;color:#c4cdd6!important;line-height:1.5;word-break:break-all;}
      .cvz-info-row{
        padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05);
        display:flex;flex-direction:column;gap:4px;padding-right:24px;
      }
      .cvz-info-row:nth-last-child(-n+2){border-bottom:none;}
      .cvz-info-row:last-child{border-bottom:none!important;}
      /* cvz-info-label and cvz-info-value defined above with !important */

      /* KI-Agent Button */
      .cvz-ki-btn-wrap{
        text-align:center;padding:32px 24px;max-width:1200px;margin:0 auto;
        display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;
      }
      .cvz-ki-btn{
        display:inline-flex;align-items:center;gap:8px;
        background:#4fd1c5;color:#0d1117;
        font-family:'Geist','DM Sans',sans-serif;
        font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
        text-decoration:none;padding:14px 32px;border-radius:8px;
        transition:background .2s,transform .2s,box-shadow .2s;cursor:pointer;border:none;
      }
      .cvz-ki-btn:hover{background:#38b2ac;transform:translateY(-2px);box-shadow:0 8px 24px rgba(79,209,197,.25);}
      .cvz-pdf-btn{
        display:inline-flex;align-items:center;gap:8px;
        background:transparent;color:#e2e8f0;
        font-family:'Geist','DM Sans',sans-serif;
        font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
        text-decoration:none;padding:14px 32px;border-radius:8px;
        border:1px solid rgba(255,255,255,.15);
        transition:border-color .2s,color .2s,transform .2s;cursor:pointer;
      }
      .cvz-pdf-btn:hover{border-color:rgba(255,255,255,.35);color:#fff;transform:translateY(-2px);}
      .cvz-pdf-btn:disabled,.cvz-pdf-btn.loading{opacity:.5;cursor:not-allowed;transform:none;}
      .cvz-pdf-btn svg{flex-shrink:0;}
      @media(max-width:480px){
        .cvz-ki-btn-wrap{flex-direction:column;}
        .cvz-ki-btn,.cvz-pdf-btn{width:100%;justify-content:center;}
      }

      /* Responsive */
      @media(max-width:768px){
        .cvz-section{padding:16px;}
        .cvz-exec-panel{flex-direction:column;align-items:center;padding:20px 16px;gap:20px;}
        .cvz-ring{width:100%;display:flex;flex-direction:column;align-items:center;}
        .cvz-bars{width:100%;}
        .cvz-badges{flex-direction:column;}
        .cvz-badge{min-width:100%;flex:1 1 100%;}
        .cvz-bl{width:76px;}
        .cvz-info-grid{grid-template-columns:1fr;}
        .cvz-info-row:nth-last-child(-n+2){border-bottom:1px solid rgba(255,255,255,.05);}
        .cvz-info-row:last-child{border-bottom:none;}
      }
    `;
    document.head.appendChild(s);
  }

  // ── Design System Helpers ───────────────────────────────────────────────────
  function getRingColor(s) {
    if (s === null) return '#4a5568';
    if (s >= 8)    return '#10b981';
    if (s >= 6)    return '#3b82f6';
    if (s >= 4)    return '#f59e0b';
    return '#ef4444';
  }
  function getRingBg(s) {
    if (s === null) return 'rgba(74,85,104,0.08)';
    if (s >= 8)    return 'rgba(16,185,129,0.08)';
    if (s >= 6)    return 'rgba(59,130,246,0.08)';
    if (s >= 4)    return 'rgba(245,158,11,0.08)';
    return 'rgba(239,68,68,0.08)';
  }
  function sc(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

  function card(type, label, content) {
    if (!content) return '';
    const cls = {
      summary:      'cvz-card-summary',
      staerken:     'cvz-card-staerken',
      schwaechen:   'cvz-card-schwaechen',
      empfehlungen: 'cvz-card-empfehlungen',
    }[type] || '';
    const safeContent = sanitize(content);
    const safeLabel   = label.replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `
      <div class="cvz-card ${cls} cvz-fi cvz-fi-3">
        <div class="cvz-card-label">
          <div class="cvz-card-label-dot"></div>${safeLabel}
        </div>
        <div class="cvz-card-body">${safeContent}</div>
      </div>`;
  }

  function buildCatSection(name, scoreVal, cards) {
    const s = sc(scoreVal);
    const color = getRingColor(s);
    const scoreDisplay = s !== null ? s.toFixed(1) : '–';
    return `
      <div class="cvz-section cvz-fi cvz-fi-2">
        <div class="cvz-cat-header">
          <div class="cvz-cat-name">${name}</div>
          <div class="cvz-cat-score">${scoreDisplay}</div>
        </div>
        <div class="cvz-cards">${cards}</div>
      </div>`;
  }

  // ── XSS-Sanitization ──────────────────────────────────────────────────────
  // Erlaubt nur sichere HTML-Tags aus Claude-Output (Listen, Bold, Paragraphen)
  function sanitize(html) {
    if (!html) return '';
    const allowed = {
      'p':true,'br':true,'strong':true,'b':true,'em':true,'i':true,
      'ul':true,'ol':true,'li':true,'span':true,'small':true,
    };
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Entferne alle nicht erlaubten Tags und gefährliche Attribute
    tmp.querySelectorAll('*').forEach(el => {
      if (!allowed[el.tagName.toLowerCase()]) {
        el.replaceWith(document.createTextNode(el.textContent));
        return;
      }
      // Entferne alle Attribute außer class
      Array.from(el.attributes).forEach(attr => {
        if (attr.name !== 'class') el.removeAttribute(attr.name);
      });
    });
    return tmp.innerHTML;
  }

  function txt(v) { return v ? `<p>${sanitize(String(v))}</p>` : ''; }

  // ── DOM Helpers ─────────────────────────────────────────────────────────────
  function setText(sel, val, fb = '-') {
    document.querySelectorAll(sel).forEach(el => { el.textContent = val || fb; });
  }
  function setHTML(sel, html, fb = '') {
    document.querySelectorAll(sel).forEach(el => { el.innerHTML = html || fb; });
  }
  function setScore(sel, score) {
    const v = parseFloat(score);
    const t = isNaN(v) ? '-' : v.toFixed(1);
    let cls = '';
    if (v >= 8) cls = 'score-excellent';
    else if (v >= 6) cls = 'score-good';
    else if (v >= 4) cls = 'score-average';
    else if (v > 0)  cls = 'score-poor';
    document.querySelectorAll(sel).forEach(el => {
      el.textContent = t;
      if (cls && el.classList.contains('score-circle')) el.className = 'score-circle ' + cls;
    });
  }
  function formatDate(d) {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
    catch(e) { return d; }
  }

  // ── Render: Executive Summary ───────────────────────────────────────────────
  function renderExecSummary(analysis) {
    const container = document.querySelector('.section-executive-summary');
    if (!container) { console.warn('⚠️ .section-executive-summary nicht gefunden'); return; }

    function parseItems(raw) {
      if (!raw) return [];
      if (/<li/i.test(raw)) {
        const tmp = document.createElement('div'); tmp.innerHTML = raw;
        const items = Array.from(tmp.querySelectorAll('li')).map(el => el.innerHTML.trim()).filter(t => t.length > 10);
        if (items.length > 0) return items.slice(0, 4);
      }
      if (/<p|<strong/i.test(raw)) {
        const tmp = document.createElement('div'); tmp.innerHTML = raw;
        const items = Array.from(tmp.querySelectorAll('p,strong')).map(el => el.innerHTML.trim()).filter(t => t.length > 10);
        if (items.length > 0) return items.slice(0, 4);
      }
      const lines = raw.split(/\n|•|·/).map(l => l.replace(/^\s*[\d\.\-\*•·–]+\s*/, '').trim()).filter(l => l.length > 15);
      return lines.length > 0 ? lines.slice(0, 4) : [raw.trim()];
    }

    const overall = sc(analysis.overall_score_weighted);
    const categories = [
      { label: 'Hero',            score: sc(analysis.hero_score) },
      { label: 'Content',         score: sc(analysis.content_score) },
      { label: 'Zielgruppe',      score: sc(analysis.zielgruppe_score) },
      { label: 'Conversion',      score: sc(analysis.conversion_score) },
      { label: 'Struktur',        score: sc(analysis.struktur_score) },
      { label: 'Search Intent',   score: sc(analysis.search_intent_score) },
      { label: 'Differenzierung', score: sc(analysis.wettbewerb_score) },
    ];

    const bars = categories.map(({ label, score }) => {
      const pct = score !== null ? ((score / 10) * 100).toFixed(1) : '0';
      const val = score !== null ? score.toFixed(1) : '–';
      return `<div class="cvz-br">
        <div class="cvz-bl">${label}</div>
        <div class="cvz-bt"><div class="cvz-bf" style="--bw:${pct}%;"></div></div>
        <div class="cvz-bv">${val}</div>
      </div>`;
    }).join('');

    const rColor = getRingColor(overall);
    const rBg    = getRingBg(overall);
    const rVal   = overall !== null ? overall.toFixed(1) : '–';

    function badge(title, text) {
      return `<div class="cvz-badge">
        <div class="cvz-badge-h"><div class="cvz-badge-dot"></div><div class="cvz-badge-t">${title}</div></div>
        <div class="cvz-badge-tx">${text || 'Keine Daten verfügbar.'}</div>
      </div>`;
    }

    function execSection(type, items) {
      const isS     = type === 'staerken';
      const color   = isS ? '#4fd1c5' : '#ef4444';
      const iconBg  = isS ? 'rgba(79,209,197,.14)' : 'rgba(239,68,68,.14)';
      const icon    = isS ? '✓' : '▲';
      const title   = isS ? 'Stärken' : 'Größte Hebel';
      const cardCls = isS ? 'cvz-card-staerken' : 'cvz-card-schwaechen';
      const fadeCls = isS ? 'cvz-fi-4' : 'cvz-fi-5';
      const cards   = items.length > 0
        ? items.map(h => `<div class="cvz-card ${cardCls}"><div class="cvz-card-body">${h}</div></div>`).join('')
        : `<div style="font-size:12px;color:#4a5568;font-style:italic;">Keine Daten geladen.</div>`;
      return `<div class="cvz-fi ${fadeCls}" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:11px;">
          <div style="width:22px;height:22px;border-radius:6px;background:${iconBg};color:${color};display:flex;align-items:center;justify-content:center;font-size:11px;">${icon}</div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${color};">${title}</div>
        </div>
        <div class="cvz-cards">${cards}</div>
      </div>`;
    }

    container.innerHTML = `
      <div class="cvz-section">
        <div class="cvz-exec-panel cvz-fi cvz-fi-2">
          <div class="cvz-ring">
            <div class="cvz-ring-c" style="border:3px solid ${rColor};background:${rBg};">
              <div class="cvz-ring-n" style="color:${rColor};">${rVal}</div>
              <div class="cvz-ring-d">/10</div>
            </div>
            <div class="cvz-ring-l">Gesamt</div>
          </div>
          <div class="cvz-bars">${bars}</div>
        </div>
        <div class="cvz-badges cvz-fi cvz-fi-3">
          ${badge('Industry Fit', analysis.industry_fit_summary)}
          ${badge('DACH Market Fit', analysis.dach_cultural_fit_summary)}
        </div>
        ${execSection('staerken',   parseItems(analysis.executive_summary_staerken))}
        ${execSection('schwaechen', parseItems(analysis.executive_summary_hauptproblem))}
      </div>`;

    console.log('✅ Executive Summary gerendert');
  }

  // ── Render: Alle Sektionen ──────────────────────────────────────────────────
  function renderAll(analysis, analysisId) {
    // data-field Elemente (für Sektionen die Webflow nativ rendert)
    setText('[data-field="landing_page_url"]', analysis.landing_page_url);
    setText('[data-field="keyword"]', analysis.keyword);
    setText('[data-field="target_audience"]', analysis.target_audience);
    setText('[data-field="conversion_goal"]', analysis.conversion_goal);
    setText('[data-field="created_at"]', formatDate(analysis.created_at));
    setText('[data-field="completed_at"]', formatDate(analysis.completed_at));
    setText('[data-field="status"]', analysis.status);
    setText('[data-field="analysis_business_model"]', analysis.analysis_business_model);
    setText('[data-field="analysis_industry"]', analysis.analysis_industry || analysis.industry_detected);
    setText('[data-field="business_type"]', analysis.business_type);
    setText('[data-field="analysis_main_problem"]', analysis.analysis_main_problem);
    setScore('[data-field="overall_score"]', analysis.overall_score);
    setScore('[data-field="overall_score_weighted"]', analysis.overall_score_weighted);
    setScore('[data-field="hero_score"]', analysis.hero_score);
    setScore('[data-field="content_score"]', analysis.content_score);
    setScore('[data-field="zielgruppe_score"]', analysis.zielgruppe_score);
    setScore('[data-field="conversion_score"]', analysis.conversion_score);
    setScore('[data-field="struktur_score"]', analysis.struktur_score);
    setScore('[data-field="search_intent_score"]', analysis.search_intent_score);
    setScore('[data-field="performance_score"]', analysis.performance_score);
    setScore('[data-field="wettbewerb_score"]', analysis.wettbewerb_score);
    setScore('[data-field="ai_readiness_score"]', analysis.ai_readiness_score);
    setScore('[data-field="dach_cultural_fit_score"]', analysis.dach_cultural_fit_score);
    setText('[data-field="dach_cultural_fit_summary"]', analysis.dach_cultural_fit_summary);
    setText('[data-field="dach_language_formality_current"]', analysis.dach_language_formality_current);
    setScore('[data-field="industry_fit_score"]', analysis.industry_fit_score);
    setText('[data-field="industry_fit_summary"]', analysis.industry_fit_summary);
    setText('[data-field="search_intent_primary"]', analysis.search_intent_primary);
    setText('[data-field="search_intent_buyer_journey_stage"]', analysis.search_intent_buyer_journey_stage);
    setText('[data-field="analysis_duration_seconds"]', analysis.analysis_duration_seconds ? analysis.analysis_duration_seconds + ' Sekunden' : '-');
    if (analysis.search_intent_share_informational !== null) setText('[data-field="search_intent_share_informational"]', Math.round(analysis.search_intent_share_informational * 100) + '%');
    if (analysis.search_intent_share_commercial !== null)    setText('[data-field="search_intent_share_commercial"]',    Math.round(analysis.search_intent_share_commercial * 100) + '%');
    if (analysis.search_intent_share_transactional !== null) setText('[data-field="search_intent_share_transactional"]', Math.round(analysis.search_intent_share_transactional * 100) + '%');
    if (analysis.search_intent_share_navigational !== null)  setText('[data-field="search_intent_share_navigational"]',  Math.round(analysis.search_intent_share_navigational * 100) + '%');

    // Dynamic Links
    document.querySelectorAll('a[href*="{ANALYSIS_ID}"]').forEach(link => {
      link.setAttribute('href', link.getAttribute('href').replace('{ANALYSIS_ID}', analysisId));
    });

    // Anker-Navigation einfügen
    (function injectAnchorNav() {
      // Webflow-Nav-Höhe messen und als top setzen
      function setNavTop(anchorNav) {
        const webflowNav = document.querySelector('.navbar-2-member');
        if (webflowNav) {
          anchorNav.style.top = webflowNav.offsetHeight + 'px';
        } else {
          anchorNav.style.top = '0px';
        }
      }

      const nav = document.createElement('nav');
      nav.className = 'cvz-anchor-nav';
      nav.setAttribute('aria-label', 'Analyse-Navigation');
      const links = [
        {href:'#cvz-exec',    label:'Executive Summary'},
        {href:'#cvz-hero',    label:'Hero'},
        {href:'#cvz-content', label:'Content'},
        {href:'#cvz-zielgruppe', label:'Zielgruppe'},
        {href:'#cvz-conversion', label:'Conversion'},
        {href:'#cvz-struktur', label:'Struktur'},
        {href:'#cvz-search',  label:'Search Intent'},
        {href:'#cvz-diff',    label:'Differenzierung'},
        {href:'#cvz-perf',    label:'Performance & AI'},
        {href:'#cvz-roadmap', label:'Roadmap'},
      ];
      nav.innerHTML = '<div class="cvz-anchor-nav-inner">'+
        links.map(l => `<a href="${l.href}">${l.label}</a>`).join('')+
        '</div>';
      // Smooth scroll mit Nav-Offset
      nav.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', e => {
          const id = a.getAttribute('href').replace('#','');
          const target = document.getElementById(id);
          if (!target) return;
          e.preventDefault();
          const offset = nav.offsetHeight + 16;
          const top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({top, behavior:'smooth'});
        });
      });
      // Vor dem ersten Section-Wrapper einfügen
      const firstSection = document.querySelector('.section-hero-info') ||
                           document.querySelector('.section-executive-summary');
      if (firstSection) firstSection.parentNode.insertBefore(nav, firstSection);

      // Initiale Höhe setzen
      setNavTop(nav);

      // Bei Resize neu messen
      window.addEventListener('resize', function() { setNavTop(nav); });

      // ResizeObserver auf Webflow-Nav für dynamische Änderungen (z.B. mobile Menu öffnet)
      const webflowNav = document.querySelector('.navbar-2-member');
      if (webflowNav && window.ResizeObserver) {
        new ResizeObserver(function() { setNavTop(nav); }).observe(webflowNav);
      }

      // Active-State beim Scrollen
      const sectionIds = ['cvz-exec','cvz-hero','cvz-content','cvz-zielgruppe',
        'cvz-conversion','cvz-struktur','cvz-search','cvz-diff','cvz-perf','cvz-roadmap'];
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            nav.querySelectorAll('a').forEach(a => a.classList.remove('cvz-nav-active'));
            const activeLink = nav.querySelector(`a[href="#${entry.target.id}"]`);
            if (activeLink) {
              activeLink.classList.add('cvz-nav-active');
              // Nav horizontal zum aktiven Link scrollen
              activeLink.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
            }
          }
        });
      }, {rootMargin:'-20% 0px -70% 0px'});

      sectionIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      });
    })();

    // Hero Info Block
    (function renderHeroInfo() {
      const c = document.querySelector('.section-hero-info');
      if (!c) return;

      function infoRow(label, value) {
        if (!value || value === '-') return '';
        return `
          <div class="cvz-info-row">
            <div class="cvz-info-label">${label}</div>
            <div class="cvz-info-value">${value}</div>
          </div>`;
      }

      c.innerHTML = `
        <div class="cvz-section cvz-fi cvz-fi-1">
          <div class="cvz-card" style="padding:20px 24px;">
            <div class="cvz-info-grid">
              ${infoRow('Keyword',         analysis.keyword)}
              ${infoRow('URL',             analysis.landing_page_url)}
              ${infoRow('Zielgruppe',      analysis.target_audience)}
              ${infoRow('Conversion-Ziel', analysis.conversion_goal)}
              ${infoRow('Branche',         analysis.analysis_industry || analysis.industry_detected)}
              ${infoRow('Angebotstyp',     analysis.business_type)}
              ${infoRow('Search Intent',   analysis.search_intent_primary)}
              ${infoRow('Analyse vom',     formatDate(analysis.created_at))}
            </div>
          </div>
        </div>`;

      console.log('✅ Hero Info gerendert');
    })();

    // Executive Summary
    renderExecSummary(analysis);

    // Deep Dive Kategorien
    const sections = {
      '.section-deep-dive-hero': () => buildCatSection('Hero', analysis.hero_score,
        card('summary','Zusammenfassung', txt(analysis.hero_summary)) +
        card('staerken','Stärken', analysis.hero_staerken_html) +
        card('schwaechen','Schwächen', analysis.hero_schwaechen_html) +
        card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.hero_schwaechen_prioritized_html)),

      '.section-deep-dive-content': () => buildCatSection('Content', analysis.content_score,
        card('summary','Zusammenfassung', txt(analysis.content_summary)) +
        card('staerken','Stärken', analysis.content_staerken_html) +
        card('schwaechen','Schwächen', analysis.content_schwaechen_html) +
        card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.content_schwaechen_prioritized_html)),

      '.section-deep-dive-zielgruppe': () => buildCatSection('Zielgruppe', analysis.zielgruppe_score,
        card('summary','Zusammenfassung', txt(analysis.zielgruppe_summary)) +
        card('staerken','Stärken', analysis.zielgruppe_staerken_html) +
        card('schwaechen','Schwächen', analysis.zielgruppe_schwaechen_html) +
        card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.zielgruppe_schwaechen_prioritized_html)),

      '.section-deep-dive-conversion': () => buildCatSection('Conversion', analysis.conversion_score,
        card('summary','Zusammenfassung', txt(analysis.conversion_summary)) +
        card('staerken','Stärken', analysis.conversion_staerken_html) +
        card('schwaechen','Schwächen', analysis.conversion_schwaechen_html) +
        card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.conversion_schwaechen_prioritized_html)),

      '.section-deep-dive-struktur': () => buildCatSection('Struktur', analysis.struktur_score,
        card('summary','Zusammenfassung', txt(analysis.struktur_summary)) +
        card('staerken','Stärken', analysis.struktur_staerken_html) +
        card('schwaechen','Schwächen', analysis.struktur_schwaechen_html) +
        card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.struktur_schwaechen_prioritized_html)),

      '.section-deep-dive-searchintent': () => buildCatSection('Search Intent', analysis.search_intent_score,
        card('summary','Bewertung', txt(analysis.search_intent_bewertung)) +
        card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.search_intent_content_gaps)),

      '.section-deep-dive-differenzierung': () => buildCatSection('Differenzierung', analysis.wettbewerb_score,
        card('summary','Zusammenfassung', txt(analysis.wettbewerb_summary)) +
        card('staerken','Stärken', analysis.wettbewerb_staerken_html) +
        card('schwaechen','Schwächen', analysis.wettbewerb_schwaechen_html) +
        card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.wettbewerb_schwaechen_prioritized_html)),

      '.section-deep-dive-performance': () => buildCatSection('Performance', analysis.performance_score,
        card('summary','Zusammenfassung', txt(analysis.performance_summary)) +
        card('summary','Desktop', txt(analysis.performance_desktop_zusammenfassung)) +
        card('summary','Mobil', txt(analysis.performance_mobile_zusammenfassung)) +
        card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.performance_opportunities_html)),

      '.section-deep-dive-ai': () => buildCatSection('AI Sichtbarkeit', analysis.ai_readiness_score,
        card('summary','Zusammenfassung', txt(analysis.ai_readiness_bewertung)) +
        card('staerken','Stärken', analysis.ai_readiness_staerken_html) +
        card('schwaechen','Schwächen', analysis.ai_readiness_schwaechen_html) +
        card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.ai_readiness_optimierungspotenziale_html)),

      '.section-roadmap': () => `
        <div class="cvz-section cvz-fi cvz-fi-2">
          <div class="cvz-cat-header">
            <div class="cvz-cat-name">Roadmap</div>
          </div>
          <div class="cvz-cards">
            ${card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.priority_matrix_html)}
          </div>
        </div>`,
    };

    Object.entries(sections).forEach(([selector, builder]) => {
      const el = document.querySelector(selector);
      if (el) el.innerHTML = builder();
    });

    // KI-Agent Buttons
    document.querySelectorAll('.section-ki-agent-btn').forEach(el => {
      el.innerHTML = `
        <div class="cvz-ki-btn-wrap">
          <a href="https://www.convertlyze.com/analyse/optimization-agent?analysis_id=${analysisId}"
             class="cvz-ki-btn"
             aria-label="Mit KI-Agent optimieren">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="8" width="12" height="10" rx="2" fill="currentColor" opacity=".9"/><circle cx="9" cy="12" r="1.5" fill="#0d1117"/><circle cx="15" cy="12" r="1.5" fill="#0d1117"/><rect x="10" y="15" width="4" height="1.5" rx=".75" fill="#0d1117"/><rect x="11" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".9"/><circle cx="12" cy="5" r="2" fill="currentColor" opacity=".9"/></svg> Mit KI-Agent optimieren
          </a>
          <button class="cvz-pdf-btn"
                  data-analysis-id="${analysisId}"
                  aria-label="PDF-Report herunterladen"
                  title="PDF-Report herunterladen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v13m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> PDF-Report
          </button>
        </div>`;

      // PDF-Button Click-Handler
      const pdfBtn = el.querySelector('.cvz-pdf-btn');
      if (pdfBtn) {
        pdfBtn.addEventListener('click', async () => {
          pdfBtn.disabled = true;
          pdfBtn.classList.add('loading');
          const origText = pdfBtn.innerHTML;
          pdfBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v13m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Wird generiert...';
          try {
            const memberstackId = (await window.$memberstackDom.getCurrentMember())?.data?.id;
            if (!memberstackId) throw new Error('Nicht eingeloggt');
            const resp = await fetch(
              'https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/generate-pdf-report',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-memberstack-id': memberstackId },
                body: JSON.stringify({ analysisId: analysisId, type: 'pdf' }),
              }
            );
            if (!resp.ok) {
              const e = await resp.json();
              throw new Error(e.error || 'Generierung fehlgeschlagen');
            }
            const { downloadUrl } = await resp.json();
            // Blob-Download
            const blob    = await (await fetch(downloadUrl)).blob();
            const blobUrl = URL.createObjectURL(blob);
            const a       = document.createElement('a');
            a.href        = blobUrl;
            a.download    = 'convertlyze-report.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
            pdfBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v13m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> PDF-Report';
          } catch (err) {
            console.error('[CVZ] PDF-Download:', err);
            pdfBtn.innerHTML = '⚠ Fehler – erneut versuchen';
            setTimeout(() => { pdfBtn.innerHTML = origText; }, 3000);
          } finally {
            pdfBtn.disabled = false;
            pdfBtn.classList.remove('loading');
          }
        });
      }
    });

    // Sektions-Überschriften – nach allen Renders einfügen
    (function injectHeadings() {
      function heading(selector, title, sub) {
        const el = document.querySelector(selector);
        if (!el) return;
        const wrap = document.createElement('div');
        wrap.className = 'cvz-heading-wrap';
        wrap.innerHTML = '<div class="cvz-heading-title">' + title + '</div>' +
          (sub ? '<div class="cvz-heading-sub">' + sub + '</div>' : '');
        el.insertBefore(wrap, el.firstChild);
      }
      heading('.section-hero-info',            'Deine Analyse', '');
      heading('.section-executive-summary',    'Executive Summary', 'Die wichtigsten Erkenntnisse auf einen Blick');
      heading('.section-deep-dive-hero',       'Deep Dive', 'Detaillierte Analyse jeder Kategorie');
      heading('.section-deep-dive-performance','Performance &amp; AI Sichtbarkeit', 'Performance und AI Readiness fließen nicht in den Gesamt-Score ein. Performance-Optimierungen erfordern meist hauptsächlich technische Umsetzung. Bei AI Readiness ist es gemischt – strukturierte Daten brauchen Entwicklungs-Support, Inhaltsstruktur und Semantik kannst du direkt selbst angehen.');
      heading('.section-roadmap',              'Roadmap', 'Die wichtigsten Maßnahmen, sortiert nach Impact und Aufwand.');

      // Anker-IDs auf Section-Wrapper setzen
      const anchorMap = {
        '.section-executive-summary':     'cvz-exec',
        '.section-deep-dive-hero':        'cvz-hero',
        '.section-deep-dive-content':     'cvz-content',
        '.section-deep-dive-zielgruppe':  'cvz-zielgruppe',
        '.section-deep-dive-conversion':  'cvz-conversion',
        '.section-deep-dive-struktur':    'cvz-struktur',
        '.section-deep-dive-searchintent':'cvz-search',
        '.section-deep-dive-differenzierung':'cvz-diff',
        '.section-deep-dive-performance': 'cvz-perf',
        '.section-roadmap':               'cvz-roadmap',
      };
      Object.entries(anchorMap).forEach(([sel, id]) => {
        const el = document.querySelector(sel);
        if (el) el.id = id;
      });

    // EU AI Act Hinweis
    var kiBtn = document.querySelector('.section-ki-agent-btn');
    if (kiBtn) {
      var aiNotice = document.createElement('div');
      aiNotice.style.cssText = 'max-width:1200px;margin:0 auto;padding:16px 24px 32px;text-align:center;font-family:Geist,DM Sans,sans-serif;';
      aiNotice.innerHTML = '<p style="font-size:12px;color:#4a5568;line-height:1.6;margin:0;">'+
        'KI-generierter Bericht · Erstellt mit Claude (Anthropic) · '+
        'Diese Analyse wurde vollständig durch ein KI-System erstellt. '+
        'Alle Empfehlungen sollten durch eine qualifizierte Fachperson geprüft werden. '+
        'Alle Angaben ohne Gewähr.'+
        '</p>';
      kiBtn.parentNode.insertBefore(aiNotice, kiBtn.nextSibling);
    }
    })();

    // Share Button
    const shareUrl = window.location.href;
    document.querySelectorAll('[data-action="share"],.share-button,#share-analysis').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.preventDefault();
        const shareData = { title:`Landing Page Analyse: ${analysis.keyword||''}`, text:`Score: ${analysis.overall_score||'-'}/10`, url:shareUrl };
        if (navigator.share) { try { await navigator.share(shareData); feedback(btn,'Geteilt!'); return; } catch(e){} }
        if (navigator.clipboard) { try { await navigator.clipboard.writeText(shareUrl); feedback(btn,'Link kopiert!'); return; } catch(e){} }
        try {
          const ta = document.createElement('textarea'); ta.value = shareUrl;
          ta.style.cssText='position:fixed;left:-999999px'; document.body.appendChild(ta);
          ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          feedback(btn,'Link kopiert!');
        } catch(e) { prompt('Link:', shareUrl); }
      });
    });
    function feedback(btn, msg) {
      const orig = btn.innerHTML; btn.textContent = msg; btn.classList.add('share-success');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('share-success'); }, 2000);
    }

    document.body.classList.add('analysis-loaded');
    console.log('🎉 Report vollständig geladen!');
  }

  // ── Tab Navigation ──────────────────────────────────────────────────────────
  function initTabs() {
    const tabMenu = document.querySelector('.w-tab-menu');
    if (!tabMenu) return;

    function scrollTab(tab) {
      const mR = tabMenu.getBoundingClientRect();
      const tR = tab.getBoundingClientRect();
      tabMenu.scrollTo({ left: tabMenu.scrollLeft + (tR.left - mR.left) - (mR.width/2) + (tR.width/2), behavior:'smooth' });
    }

    document.addEventListener('click', e => {
      const clicked = e.target.closest('.w-tab-link');
      if (!clicked) return;
      e.preventDefault(); e.stopPropagation();
      const tab = clicked.getAttribute('data-w-tab');
      document.querySelectorAll('.w-tab-link').forEach(t => { t.classList.remove('w--current'); t.setAttribute('aria-selected','false'); });
      clicked.classList.add('w--current'); clicked.setAttribute('aria-selected','true');
      document.querySelectorAll('.w-tab-pane').forEach(p => { p.style.display='none'; });
      const pane = document.querySelector(`.w-tab-pane[data-w-tab="${tab}"]`);
      if (pane) pane.style.display = 'block';
      scrollTab(clicked);
    }, true);

    setTimeout(() => {
      const first = document.querySelector('.w-tab-link:first-child');
      if (!first) return;
      document.querySelectorAll('.w-tab-link').forEach(t => t.classList.remove('w--current'));
      first.classList.add('w--current');
      const firstTab = first.getAttribute('data-w-tab');
      document.querySelectorAll('.w-tab-pane').forEach(p => { p.style.display='none'; });
      const fp = document.querySelector(`.w-tab-pane[data-w-tab="${firstTab}"]`);
      if (fp) fp.style.display = 'block';
      scrollTab(first);
    }, 100);

    console.log('✅ Tab Navigation aktiviert');
  }

  // ── Supabase mit Memberstack-Header initialisieren ──────────────────────────
  async function initSupabase() {
    if (!window.supabase?.createClient) return null;
    let memberstackId = null;
    try { memberstackId = (await window.$memberstackDom.getCurrentMember())?.data?.id || null; } catch(e) {}
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { 'x-memberstack-id': memberstackId || '' } }
    });
    window.supabaseClient = client;
    window.supabase = client;
    console.log('✅ Supabase initialized', memberstackId ? '| User: ' + memberstackId : '| kein User');
    return client;
  }

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  async function bootstrap() {
    injectStyles();
    initTabs();

    // Warten bis Supabase SDK + Memberstack bereit
    let attempts = 0;
    while (attempts < 50) {
      if (window.supabase?.createClient && window.$memberstackDom?.getCurrentMember) break;
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    const supabase = await initSupabase();
    if (!supabase) { console.error('❌ Supabase nicht verfügbar'); return; }

    const analysisId = new URLSearchParams(window.location.search).get('id');
    if (!analysisId) { console.error('❌ Keine Analysis ID in URL'); return; }

    console.log('📊 Lade Analyse:', analysisId);

    try {
      const { data: analysis, error } = await supabase
        .from('analyses').select('*').eq('id', analysisId).single();

      if (error) {
        if (error.code === 'PGRST116') alert('Analyse nicht gefunden. Bitte überprüfe den Link.');
        else if (error.message.includes('JWT')) alert('Zugriff verweigert.');
        else alert('Fehler: ' + error.message);
        return;
      }
      if (!analysis) { alert('Analyse nicht gefunden'); return; }

      console.log('✅ Analyse geladen:', analysis);
      renderAll(analysis, analysisId);

    } catch(err) {
      console.error('❌ Unerwarteter Fehler:', err);
      alert('Ein unerwarteter Fehler ist aufgetreten: ' + err.message);
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
