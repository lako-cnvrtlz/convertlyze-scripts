/**
 * Convertlyze – Report-Export v1 (Aufgaben für ClickUp, Asana, Jira)
 * https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/report-export.js
 *
 * Adapter zwischen dem Analyse-Report und der gemeinsamen Bibliothek cvz-export.js.
 * Dieses Script kennt nur die Datenstruktur des Reports und baut daraus neutrale
 * Aufgaben. Dateiformate und Menü stecken in cvz-export.js.
 *
 * Was exportiert wird:
 *   - Jede Handlungsempfehlung (Problem + Lösung) aus den 9 Kategorien wird eine Aufgabe.
 *   - Jede Kategorie wird eine Oberaufgabe (ClickUp/Asana) bzw. ein Label (Jira).
 *   - Quelle sind die deduplizierten Findings (dedup_findings), mit demselben Fallback
 *     auf die alten Felder wie report.js. Findings, die in mehreren Kategorien stehen
 *     ("Betrifft auch ..."), werden nur EINMAL exportiert und tragen alle Kategorien als Label.
 *   - Priorität = Schweregrad (critical/high/medium). Im Menü filterbar.
 *
 * Einbinden (Webflow, vor </body>, NACH report.js):
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/cvz-export.js"></script>
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/report-export.js"></script>
 *
 * Empfohlen: In report.js direkt vor  document.body.classList.add('analysis-loaded');  einfügen:
 *   window.CVZ_REPORT = { analysis: analysis, analysisId: analysisId };
 *   document.dispatchEvent(new CustomEvent('cvz:report-ready'));
 * Ohne diese zwei Zeilen funktioniert es trotzdem: Dann lädt dieses Script die Analyse
 * einmal selbst über den Supabase-Client nach (ein zusätzlicher Request).
 */
(function (root) {
  'use strict';

  // key = Name der Kategorie in dedup_findings (intern), name = Anzeigename im Report.
  // fallback = alte Felder, nur genutzt wenn dedup_findings für die Kategorie fehlt.
  // always = Felder, die report.js IMMER zusätzlich anzeigt (Content-Gaps).
  var CATEGORIES = [
    { key: 'Hero',          name: 'Hero',            score: 'hero_score',          fallback: ['hero_schwaechen_prioritized_html'] },
    { key: 'Content',       name: 'Content',         score: 'content_score',       fallback: ['content_schwaechen_prioritized_html'], always: ['content_gaps_html'] },
    { key: 'Zielgruppe',    name: 'Zielgruppe',      score: 'zielgruppe_score',    fallback: ['zielgruppe_schwaechen_prioritized_html'] },
    { key: 'Conversion',    name: 'Conversion',      score: 'conversion_score',    fallback: ['conversion_schwaechen_prioritized_html'] },
    { key: 'Struktur',      name: 'Struktur',        score: 'struktur_score',      fallback: ['struktur_schwaechen_prioritized_html'] },
    { key: 'Search Intent', name: 'Search Intent',   score: 'search_intent_score', fallback: ['search_intent_content_gaps'] },
    { key: 'Wettbewerb',    name: 'Differenzierung', score: 'wettbewerb_score',    fallback: ['wettbewerb_schwaechen_prioritized_html'] },
    { key: 'Performance',   name: 'Performance',     score: 'performance_score',   fallback: ['performance_opportunities_html'] },
    { key: 'AI Readiness',  name: 'AI Sichtbarkeit', score: 'ai_readiness_score',  fallback: ['ai_readiness_optimierungspotenziale_html'] },
  ];
  var DISPLAY_NAME = {};
  CATEGORIES.forEach(function (c) { DISPLAY_NAME[c.key] = c.name; });

  var SEV_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
  var SEV_ORDER = ['urgent', 'high', 'normal', 'low'];

  function normalizeSeverity(s) {
    var v = String(s || '').toLowerCase();
    if (v === 'critical') return 'urgent';
    if (v === 'high') return 'high';
    if (v === 'low') return 'low';
    return 'normal';
  }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function toArray(v) { return Array.isArray(v) ? v : (isObj(v) ? [v] : []); }

  // Die *_prioritized_html-Felder enthalten trotz Namen JSON-Daten. Alte Analysen haben
  // echtes HTML: das lässt sich nicht sauber in Aufgaben zerlegen -> legacy:true, Kategorie
  // wird übersprungen und dem Nutzer im Menü genannt.
  function parseField(field) {
    if (field == null || field === '') return { items: [], legacy: false };
    var data = field;
    if (typeof field === 'string') {
      var t = field.trim();
      if (!t) return { items: [], legacy: false };
      if (t.charAt(0) === '[' || t.charAt(0) === '{') {
        try { data = JSON.parse(t); } catch (e) { return { items: [], legacy: true }; }
      } else {
        return { items: [], legacy: true };
      }
    }
    return { items: toArray(data).filter(isObj), legacy: false };
  }

  function parseDedup(raw) {
    var dd = raw;
    if (!dd) return null;
    if (typeof dd === 'string') { try { dd = JSON.parse(dd); } catch (e) { return null; } }
    return isObj(dd) ? (dd.category_findings || dd) : null;
  }

  // Gleiche Regeln wie getDedupCategory() in report.js, inkl. Erkennung des alten Modul-D-Formats.
  function dedupItemsFor(cf, key) {
    if (!cf) return null;
    var arr = cf[key];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    if (arr.some(function (it) { return it && it.cross_reference === true; })) return null;
    return arr.filter(isObj);
  }

  function capitalize(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''; }
  function normKey(text) { return String(text).toLowerCase().replace(/\s+/g, ' ').trim(); }

  function domainOf(analysis) {
    try { return new URL(analysis.landing_page_url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function dateOf(analysis, locale) {
    try { return new Date(analysis.created_at).toLocaleDateString(locale || 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return ''; }
  }
  function isoDateOf(analysis) {
    try { return new Date(analysis.created_at).toISOString().slice(0, 10); } catch (e) { return ''; }
  }

  // ── Kern: Report-Daten -> neutrale Aufgaben ─────────────────────────────────
  function collectTasks(analysis, reportUrl) {
    var X = root.CVZExport;
    var cf = parseDedup(analysis.dedup_findings);
    var domain = domainOf(analysis);
    var dateStr = dateOf(analysis);
    var tasks = [];
    var skipped = [];
    var seen = {}; // normalisiertes Problem -> Aufgabe (Dedup über Kategorien)
    var counter = 0;

    CATEGORIES.forEach(function (cat) {
      var items = [];
      var legacy = false;

      function addFromFields(fields) {
        fields.forEach(function (f) {
          var r = parseField(analysis[f]);
          if (r.legacy) legacy = true;
          items = items.concat(r.items);
        });
      }

      var dedupItems = dedupItemsFor(cf, cat.key);
      if (dedupItems) items = items.concat(dedupItems); else addFromFields(cat.fallback);
      if (cat.always) addFromFields(cat.always);

      if (items.length === 0) { if (legacy) skipped.push(cat.name); return; }

      // Schwerste zuerst; bei gleichem Schweregrad bleibt die Reihenfolge aus dem Report
      var ranked = items.map(function (it, idx) { return { it: it, idx: idx, sev: normalizeSeverity(it.severity) }; });
      ranked.sort(function (a, b) { return (SEV_RANK[a.sev] - SEV_RANK[b.sev]) || (a.idx - b.idx); });

      var parent = null;
      ranked.forEach(function (entry) {
        var it = entry.it;
        var problem = X.htmlToText(it.problem || it.issue || '');
        if (!problem) return;
        var key = normKey(problem);

        var otherCats = toArray(it.cross_category).length ? it.cross_category : [];
        if (seen[key]) { // gleiches Finding in zweiter Kategorie: nur Label ergänzen
          var existing = seen[key];
          if (existing._f.cats.indexOf(cat.name) === -1) existing._f.cats.push(cat.name);
          if (SEV_RANK[entry.sev] < SEV_RANK[existing.priority]) { existing.priority = entry.sev; existing.filterId = entry.sev; }
          return;
        }

        if (!parent) {
          var score = parseFloat(analysis[cat.score]);
          parent = {
            id: 'cat:' + cat.key,
            title: cat.name + (domain ? ' \u2013 ' + domain : ''),
            description: [
              'Kategorie "' + cat.name + '" aus der Convertlyze-Analyse' + (domain ? ' von ' + domain : '') + (dateStr ? ' (' + dateStr + ')' : '') + '.',
              isNaN(score) ? '' : 'Score: ' + score.toFixed(1) + ' / 10',
              reportUrl ? 'Report: ' + reportUrl : '',
            ].filter(Boolean).join('\n'),
            labels: ['Convertlyze'],
          };
          tasks.push(parent);
        }

        counter++;
        var task = {
          id: 'f' + counter,
          parentId: parent.id,
          title: X.truncate(problem, 110),
          priority: entry.sev,
          filterId: entry.sev,
          effort: capitalize(it.aufwand),
          _f: {
            problem: problem,
            loesung: X.htmlToText(it.loesung || ''),
            cats: [cat.name],
          },
        };
        otherCats.forEach(function (c) {
          var n = DISPLAY_NAME[c] || c;
          if (task._f.cats.indexOf(n) === -1) task._f.cats.push(n);
        });
        seen[key] = task;
        tasks.push(task);
      });
    });

    // Texte erst jetzt zusammensetzen: Kategorien-Labels können durch die Dedup noch gewachsen sein
    tasks.forEach(function (t) {
      if (!t._f) return;
      var f = t._f;
      var catLine = f.cats[0] + (f.cats.length > 1 ? ' (betrifft auch: ' + f.cats.slice(1).join(', ') + ')' : '');
      t.description = [
        'Problem:\n' + f.problem,
        f.loesung ? 'Lösung:\n' + f.loesung : '',
        t.effort ? 'Aufwand: ' + t.effort : '',
        'Kategorie: ' + catLine,
        'Analyse: ' + (analysis.landing_page_url || '') + (dateStr ? ' vom ' + dateStr : ''),
        reportUrl ? 'Report: ' + reportUrl : '',
      ].filter(Boolean).join('\n\n');
      t.labels = f.cats.concat(['Convertlyze']);
      delete t._f;
    });

    var counts = {};
    tasks.forEach(function (t) { if (t.filterId) counts[t.filterId] = (counts[t.filterId] || 0) + 1; });
    return { tasks: tasks, counts: counts, skipped: skipped, domain: domain };
  }

  // Auswahl anwenden (gemeinsame Logik liegt in der Bibliothek)
  function filterTasks(tasks, selectedIds) { return root.CVZExport.filterTasks(tasks, selectedIds); }

  // ── Einbau in die Seite ─────────────────────────────────────────────────────
  function mount(analysis, analysisId) {
    if (!root.CVZExport || document.querySelector('.cvz-xp-wrap')) return false;
    var host = document.querySelector('.cvz-ki-btn-wrap') || document.querySelector('.section-ki-agent-btn');
    if (!host) return false;

    var reportUrl = window.location.href;
    var data = collectTasks(analysis, reportUrl);
    if (data.tasks.length === 0) return true; // nichts zu exportieren: keinen Button zeigen

    var filters = SEV_ORDER.filter(function (k) { return data.counts[k] > 0; }).map(function (k) {
      return { id: k, label: root.CVZExport.PRIORITIES[k].de, count: data.counts[k] };
    });
    var note = data.skipped.length
      ? 'Nicht enthalten: ' + data.skipped.join(', ') + '. Diese Analyse hat dafür nur das alte Format. Eine neue Analyse exportiert alles.'
      : '';

    var menu = root.CVZExport.createExportMenu({
      label: 'Als Aufgaben exportieren',
      triggerClass: 'cvz-pdf-btn', // gleiche Optik wie der PDF-Button
      filters: filters,
      note: note,
      getTasks: function (selectedIds) { return filterTasks(data.tasks, selectedIds); },
      getMeta: function () {
        return {
          filenameBase: 'convertlyze-report-' + root.CVZExport.slug(data.domain || 'analyse') + (isoDateOf(analysis) ? '-' + isoDateOf(analysis) : ''),
          idPrefix: 'RP',
        };
      },
    });
    host.appendChild(menu);
    return true;
  }

  // ── Start: auf den Report warten ────────────────────────────────────────────
  function init() {
    var done = false;
    var fetching = false;
    var started = Date.now();

    function tick() {
      if (done) return;
      if (Date.now() - started > 60000) { done = true; clearInterval(timer); return; }
      if (!root.CVZExport) return; // Bibliothek noch nicht geladen

      var ctx = root.CVZ_REPORT;
      if (ctx && ctx.analysis) {
        if (mount(ctx.analysis, ctx.analysisId)) { done = true; clearInterval(timer); }
        return;
      }
      // Fallback ohne die zwei Zeilen in report.js: Analyse selbst nachladen
      var id = new URLSearchParams(window.location.search).get('id');
      if (!fetching && id && document.body.classList.contains('analysis-loaded') && root.supabaseClient) {
        fetching = true;
        root.supabaseClient.from('analyses').select('*').eq('id', id).single().then(function (res) {
          if (res && res.data) {
            root.CVZ_REPORT = { analysis: res.data, analysisId: id };
          } else {
            done = true; clearInterval(timer);
            console.warn('[CVZ] Report-Export: Analyse konnte nicht geladen werden.', res && res.error);
          }
        });
      }
    }
    var timer = setInterval(tick, 400);
    document.addEventListener('cvz:report-ready', tick);
    tick();
  }

  root.CVZReportExport = { collectTasks: collectTasks, filterTasks: filterTasks };
  if (typeof document !== 'undefined') init();
})(typeof window !== 'undefined' ? window : globalThis);
