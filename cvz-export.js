/**
 * Convertlyze – Export-Bibliothek v1
 * https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/cvz-export.js
 *
 * Gemeinsamer Baustein für ALLE Tools, die Aufgaben in ClickUp, Asana oder Jira
 * bringen sollen. Läuft komplett im Browser: keine Zugangsdaten, keine
 * API-Anbindung. Der Nutzer lädt eine CSV herunter und importiert sie im
 * Zielsystem. Gleiches Prinzip wie der Export im
 * Content-Flow der Content-Strategie.
 *
 * Jedes Tool liefert nur eine Liste neutraler Aufgaben (siehe unten). Die
 * Übersetzung in die Formate der Zielsysteme passiert hier, an einer Stelle.
 *
 * NEUTRALES AUFGABEN-FORMAT (Reihenfolge wichtig: Oberaufgaben VOR Unteraufgaben)
 *   {
 *     id:          'a1',                 // beliebig, nur innerhalb der Liste eindeutig
 *     title:       'Kurzer Titel',
 *     description: 'Langtext (Plain Text, Zeilenumbrüche erlaubt)',
 *     priority:    'urgent'|'high'|'normal'|'low'   // optional
 *     effort:      'Mittel',             // optional, nur Anzeige
 *     labels:      ['Hero','Convertlyze'],          // optional
 *     parentId:    'a0',                 // optional, Oberaufgabe
 *     filterId:    'urgent',             // optional, für die Filter im Menü
 *   }
 *
 * Einbinden (Webflow, vor </body>, VOR dem jeweiligen Tool-Script):
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/cvz-export.js"></script>
 */
(function (root) {
  'use strict';
  if (root.CVZExport) return;

  // ── Prioritäten: eine neutrale Skala, je Zielsystem anders benannt ──────────
  var PRIORITIES = {
    urgent: { de: 'Kritisch', clickup: 'Urgent', jira: 'Highest' },
    high:   { de: 'Hoch',     clickup: 'High',   jira: 'High'    },
    normal: { de: 'Mittel',   clickup: 'Normal', jira: 'Medium'  },
    low:    { de: 'Niedrig',  clickup: 'Low',    jira: 'Low'     },
  };
  function prio(key) { return PRIORITIES[key] || PRIORITIES.normal; }

  // ── Text-Helfer ─────────────────────────────────────────────────────────────
  // Schutz vor Formel-Einschleusung in Excel/Sheets: Zellen, die mit = + - @ oder
  // Tab beginnen, bekommen ein Hochkomma davor.
  function safeCell(value) {
    var text = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return text;
  }

  function toCsv(headers, rows, delimiter, withBom) {
    function quote(cell) {
      var text = safeCell(cell);
      if (text.indexOf(delimiter) !== -1 || /["\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
      return text;
    }
    var lines = [headers.map(quote).join(delimiter)];
    rows.forEach(function (row) { lines.push(row.map(quote).join(delimiter)); });
    return (withBom ? '\uFEFF' : '') + lines.join('\r\n') + '\r\n';
  }

  // HTML aus KI-Texten (<p>, <ul><li>, <strong> ...) in lesbaren Plain Text umwandeln.
  // Bewusst per Regex statt DOM: Das Ergebnis geht nur in CSV/Text, nie in innerHTML.
  // Erst Tags entfernen, DANN Entities zurückwandeln (sonst würde "&lt;b&gt;" zu einem Tag).
  function htmlToText(html) {
    if (html == null) return '';
    return String(html)
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*li(\s[^>]*)?>/gi, '\n- ')
      .replace(/<\/\s*(p|div|ul|ol|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function truncate(text, max) {
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    var cut = t.slice(0, max - 1);
    var sp = cut.lastIndexOf(' ');
    if (sp > max * 0.6) cut = cut.slice(0, sp);
    return cut.replace(/[\s.,;:\u2013-]+$/, '') + '\u2026';
  }

  function slug(text) {
    var map = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };
    return String(text || 'export').toLowerCase()
      .replace(/[äöüß]/g, function (c) { return map[c]; })
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'export';
  }

  // ── Aufgaben-Liste vorbereiten ──────────────────────────────────────────────
  // Eindeutige Titel: Asana ordnet Unteraufgaben über den NAMEN der Oberaufgabe zu.
  function prepare(tasks) {
    var byId = {}, used = {}, titles = {}, kids = {};
    tasks.forEach(function (t) { byId[t.id] = t; });
    tasks.forEach(function (t) {
      var base = String(t.title || '').replace(/\s+/g, ' ').trim() || 'Aufgabe';
      var candidate = base, n = 2;
      while (used[candidate.toLowerCase()]) { candidate = base + ' (' + n + ')'; n++; }
      used[candidate.toLowerCase()] = true;
      titles[t.id] = candidate;
      if (t.parentId && byId[t.parentId]) (kids[t.parentId] = kids[t.parentId] || []).push(t.id);
    });
    var leafCount = tasks.filter(function (t) { return !(kids[t.id] || []).length; }).length;
    return { byId: byId, titles: titles, kids: kids, leafCount: leafCount };
  }

  // Auswahl anwenden: Aufgaben mit filterId nur behalten, wenn ihr Filter an ist.
  // Oberaufgaben ohne verbleibende Unteraufgaben fallen weg.
  function filterTasks(tasks, selectedIds) {
    var want = {};
    selectedIds.forEach(function (id) { want[id] = true; });
    var leaves = tasks.filter(function (t) { return t.filterId && want[t.filterId]; });
    var parentsWithKids = {};
    leaves.forEach(function (t) { if (t.parentId) parentsWithKids[t.parentId] = true; });
    return tasks.filter(function (t) { return t.filterId ? want[t.filterId] : parentsWithKids[t.id]; });
  }

  function csvName(meta, suffix) { return (meta.filenameBase || 'convertlyze-export') + '-' + suffix + '.csv'; }

  // ── Builder je Zielsystem ───────────────────────────────────────────────────
  // ClickUp: Task ID / Subtask IDs, Kategorien werden Aufgaben mit Unteraufgaben.
  function buildClickUp(tasks, meta, ctx) {
    var idOf = {}, prefix = meta.idPrefix || 'T';
    tasks.forEach(function (t, i) { idOf[t.id] = prefix + (i + 1); });
    var rows = tasks.map(function (t) {
      var tags = (t.labels || []).map(function (l) { return String(l).replace(/[|,]/g, ' ').trim(); }).filter(Boolean).join('|');
      var subs = (ctx.kids[t.id] || []).map(function (k) { return idOf[k]; }).join('|');
      return [idOf[t.id], ctx.titles[t.id], t.description || '', t.priority ? prio(t.priority).clickup : '', tags, subs];
    });
    return {
      type: 'file', count: ctx.leafCount, filename: csvName(meta, 'clickup'),
      text: toCsv(['Task ID', 'Task Name', 'Description', 'Priority', 'Tags', 'Subtask IDs'], rows, ',', false),
    };
  }

  // Asana: Zuordnung über "Parent Task" (Name). Priorität steht im Text, weil sie in Asana
  // ein frei konfigurierbares Feld ist und sich nicht zuverlässig per CSV befüllen lässt.
  function buildAsana(tasks, meta, ctx) {
    var rows = tasks.map(function (t) {
      var desc = (t.priority ? 'Priorität: ' + prio(t.priority).de + '\n\n' : '') + (t.description || '');
      var parent = t.parentId && ctx.byId[t.parentId] ? ctx.titles[t.parentId] : '';
      return [ctx.titles[t.id], desc.trim(), parent];
    });
    return {
      type: 'file', count: ctx.leafCount, filename: csvName(meta, 'asana'),
      text: toCsv(['Name', 'Description', 'Parent Task'], rows, ',', false),
    };
  }

  // Jira: nur einzelne Aufgaben (keine Oberaufgaben), Kategorie als Label. WHY: Der Typ für
  // Unteraufgaben heißt je nach Projektart anders (Sub-task / Subtask) und würde den Import
  // bei vielen Projekten scheitern lassen. Labels dürfen keine Leerzeichen enthalten.
  function buildJira(tasks, meta, ctx) {
    var leaves = tasks.filter(function (t) { return !(ctx.kids[t.id] || []).length; });
    var labelsOf = leaves.map(function (t) {
      return (t.labels || []).map(function (l) { return String(l).trim().replace(/\s+/g, '-'); }).filter(Boolean);
    });
    var maxLabels = Math.max(1, labelsOf.reduce(function (m, l) { return Math.max(m, l.length); }, 0));
    var headers = ['Summary', 'Description', 'Issue Type', 'Priority'];
    for (var i = 0; i < maxLabels; i++) headers.push('Labels'); // mehrfach vorhandene Spalte = mehrere Labels
    var rows = leaves.map(function (t, idx) {
      var row = [ctx.titles[t.id], t.description || '', 'Task', prio(t.priority).jira];
      for (var j = 0; j < maxLabels; j++) row.push(labelsOf[idx][j] || '');
      return row;
    });
    return { type: 'file', count: leaves.length, filename: csvName(meta, 'jira'), text: toCsv(headers, rows, ',', false) };
  }

  // Tabelle: Semikolon + BOM, damit deutsches Excel Umlaute und Spalten richtig öffnet.
  function buildTable(tasks, meta, ctx) {
    var headers = ['ID', 'Ebene', 'Titel', 'Oberaufgabe', 'Priorität', 'Aufwand', 'Labels', 'Beschreibung'];
    var prefix = meta.idPrefix || 'T';
    var rows = tasks.map(function (t, i) {
      var hasParent = t.parentId && ctx.byId[t.parentId];
      return [prefix + (i + 1), hasParent ? 2 : 1, ctx.titles[t.id], hasParent ? ctx.titles[t.parentId] : '',
        t.priority ? prio(t.priority).de : '', t.effort || '', (t.labels || []).join(', '), t.description || ''];
    });
    return { type: 'file', count: ctx.leafCount, filename: csvName(meta, 'tabelle'), text: toCsv(headers, rows, ';', true) };
  }

  var BUILDERS = { clickup: buildClickUp, asana: buildAsana, jira: buildJira, table: buildTable };

  function build(kind, tasks, meta) {
    if (!BUILDERS[kind]) throw new Error('Unbekanntes Export-Ziel: ' + kind);
    return BUILDERS[kind](tasks, meta || {}, prepare(tasks));
  }

  // ── Download ───────────────────────────────────────────────
  function download(filename, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // ── Menü (Button + Popover) ─────────────────────────────────────────────────
  var DEFAULT_TARGETS = [
    { id: 'clickup', label: 'ClickUp (CSV)', hint: 'Kategorien als Aufgaben mit Unteraufgaben' },
    { id: 'asana',   label: 'Asana (CSV)',   hint: 'Kategorien als Aufgaben mit Unteraufgaben' },
    { id: 'jira',    label: 'Jira (CSV)',    hint: 'Einzelne Aufgaben, Kategorie als Label' },
    { id: 'table',   label: 'Tabelle (CSV)', hint: 'Excel, Google Sheets, Notion, Airtable' },
  ];

  function injectStyles() {
    if (document.getElementById('cvz-export-styles')) return;
    var s = document.createElement('style');
    s.id = 'cvz-export-styles';
    s.textContent = [
      ".cvz-xp-wrap{position:relative;display:inline-block;font-family:'Geist','DM Sans',sans-serif;}",
      ".cvz-xp-wrap,.cvz-xp-wrap *{box-sizing:border-box;}",
      ".cvz-xp-trigger{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:transparent;color:#e2e8f0;font-family:'Syne','Geist',sans-serif;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:14px 32px;border:1px solid rgba(255,255,255,.15);border-radius:0;cursor:pointer;transition:border-color .2s,color .2s;}",
      ".cvz-xp-trigger:hover{border-color:rgba(255,255,255,.35);color:#fff;}",
      ".cvz-xp-trigger:focus-visible,.cvz-xp-item:focus-visible{outline:2px solid #4fd1c5;outline-offset:2px;}",
      ".cvz-xp-pop{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(100% + 6px);z-index:1000;width:340px;max-width:calc(100vw - 32px);background:#161b22;border:1px solid rgba(255,255,255,.16);box-shadow:0 8px 24px rgba(0,0,0,.5);padding:14px;text-align:left;color:#e2e8f0;border-radius:0;}",
      ".cvz-xp-pop.cvz-xp-down{bottom:auto;top:calc(100% + 6px);}",
      ".cvz-xp-pop.cvz-xp-left{left:0;transform:none;}",
      ".cvz-xp-pop.cvz-xp-right{left:auto;right:0;transform:none;}",
      ".cvz-xp-pop[hidden]{display:none;}",
      ".cvz-xp-title{font-family:'Syne',sans-serif;font-weight:700;font-size:14px;margin:0 0 10px;color:#f0f4f8;}",
      ".cvz-xp-label{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6e7681;margin:0 0 6px;}",
      ".cvz-xp-check{display:flex;align-items:center;gap:8px;font-size:13px;margin:0 0 4px;cursor:pointer;color:#e2e8f0;}",
      ".cvz-xp-check input{margin:0;accent-color:#4fd1c5;}",
      ".cvz-xp-count{font-size:12px;color:#a3b5c4;margin:8px 0 10px;}",
      ".cvz-xp-note{font-size:12px;color:#f59e0b;margin:0 0 10px;line-height:1.5;}",
      ".cvz-xp-item{display:block;width:100%;text-align:left;background:transparent;color:#e2e8f0;border:0;border-top:1px solid rgba(255,255,255,.08);padding:9px 2px;font:inherit;font-size:13px;cursor:pointer;border-radius:0;}",
      ".cvz-xp-item:hover:not(:disabled){background:rgba(79,209,197,.06);color:#4fd1c5;}",
      ".cvz-xp-item:disabled{opacity:.4;cursor:not-allowed;}",
      ".cvz-xp-item small{display:block;color:#6e7681;font-size:11.5px;}",
      ".cvz-xp-status{font-size:12px;color:#4fd1c5;margin:8px 0 0;min-height:16px;line-height:1.5;}",
      "@media(max-width:480px){.cvz-xp-wrap{display:block;width:100%;}.cvz-xp-trigger{width:100%;}.cvz-xp-pop,.cvz-xp-pop.cvz-xp-right{left:0;right:auto;transform:none;width:100%;max-width:none;}}",
    ].join('');
    document.head.appendChild(s);
  }

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // nie innerHTML: Texte kommen teils aus KI-Ausgaben
    return n;
  }

  /**
   * opts:
   *   label        Text des Buttons
   *   triggerClass optional, z.B. 'cvz-pdf-btn', damit der Button wie die anderen aussieht
   *   filters      [{ id, label, count, checked }]  Auswahlfelder, standardmäßig an (checked:false = aus)
   *   placement    optional: 'up' (Standard), 'down', 'down-left', 'down-right', 'up-left', 'up-right' – wohin das Menü aufklappt
   *   targets      optional, Standard: ClickUp, Asana, Jira, Tabelle
   *   note         optional, Hinweis oberhalb der Ziele (z.B. "X ist nicht enthalten")
   *   getTasks(selectedFilterIds) -> neutrale Aufgaben-Liste
   *   getMeta()    -> { filenameBase, idPrefix }
   */
  function createExportMenu(opts) {
    injectStyles();
    var targets = opts.targets || DEFAULT_TARGETS;
    var selected = {};
    (opts.filters || []).forEach(function (f) { selected[f.id] = f.checked !== false; });
    var statusText = '';

    var wrap = h('span', 'cvz-xp-wrap');
    var trigger = h('button', opts.triggerClass || 'cvz-xp-trigger', (opts.label || 'Als Aufgaben exportieren') + ' \u25BE');
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    var place = opts.placement || 'up'; // 'up' (Standard) | 'down' | 'down-left' | 'up-left'
    var pop = h('div', 'cvz-xp-pop' + (place.indexOf('down') === 0 ? ' cvz-xp-down' : '') + (/-left$/.test(place) ? ' cvz-xp-left' : '') + (/-right$/.test(place) ? ' cvz-xp-right' : ''));
    pop.hidden = true;
    wrap.appendChild(trigger);
    wrap.appendChild(pop);

    function selectedIds() { return Object.keys(selected).filter(function (k) { return selected[k]; }); }

    function renderPop() {
      while (pop.firstChild) pop.removeChild(pop.firstChild);
      pop.appendChild(h('p', 'cvz-xp-title', 'Aufgaben exportieren'));
      if ((opts.filters || []).length) {
        pop.appendChild(h('p', 'cvz-xp-label', 'Welche Aufgaben?'));
        opts.filters.forEach(function (f) {
          var label = h('label', 'cvz-xp-check');
          var box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = !!selected[f.id];
          box.addEventListener('change', function () { selected[f.id] = box.checked; statusText = ''; renderPop(); });
          label.appendChild(box);
          label.appendChild(document.createTextNode(f.label + ' (' + f.count + ')'));
          pop.appendChild(label);
        });
      }
      var n = prepare(opts.getTasks(selectedIds())).leafCount;
      pop.appendChild(h('p', 'cvz-xp-count', n + (n === 1 ? ' Aufgabe wird exportiert.' : ' Aufgaben werden exportiert.')));
      if (opts.note) pop.appendChild(h('p', 'cvz-xp-note', opts.note));
      targets.forEach(function (t) {
        var item = h('button', 'cvz-xp-item');
        item.type = 'button';
        item.disabled = n === 0;
        item.appendChild(h('span', null, t.label));
        item.appendChild(h('small', null, t.hint));
        item.addEventListener('click', function () { runExport(t.id); });
        pop.appendChild(item);
      });
      var status = h('p', 'cvz-xp-status', statusText);
      status.setAttribute('aria-live', 'polite');
      pop.appendChild(status);
    }

    function runExport(kind) {
      var out;
      try { out = build(kind, opts.getTasks(selectedIds()), opts.getMeta ? opts.getMeta() : {}); }
      catch (err) { statusText = 'Export fehlgeschlagen: ' + err.message; renderPop(); return; }
      download(out.filename, out.text);
      statusText = out.count + ' Aufgaben exportiert: ' + out.filename;
      renderPop();
    }

    function setOpen(open) {
      if (open) renderPop();
      pop.hidden = !open;
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    trigger.addEventListener('click', function (e) { e.stopPropagation(); setOpen(pop.hidden); });
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { setOpen(false); trigger.focus(); } });
    document.addEventListener('click', function (e) { if (!pop.hidden && !wrap.contains(e.target)) setOpen(false); });
    return wrap;
  }

  root.CVZExport = {
    version: 1,
    build: build,
    createExportMenu: createExportMenu,
    // einzeln nutzbar und testbar:
    filterTasks: filterTasks, htmlToText: htmlToText, truncate: truncate, slug: slug, toCsv: toCsv, safeCell: safeCell, PRIORITIES: PRIORITIES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
