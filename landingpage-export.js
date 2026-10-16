/**
 * Convertlyze – Landingpage-Export v1 (Lücken als Aufgaben für ClickUp, Asana, Jira)
 * https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/landingpage-export.js
 *
 * Adapter für den Landingpage-Assistenten (Aufbau). Quelle ist content_assessment.gaps, das
 * der Server bei jeder Struktur-Antwort mitschickt:
 *   { what_is_missing, why_it_matters, effect_on_this_page, how_to_close, severity }
 * Jede Lücke wird eine Aufgabe, gedacht zum Weitergeben an Kolleginnen und Kollegen, die
 * Convertlyze nicht nutzen (Vertrieb, Produkt, Geschäftsführung).
 *   - Schweregrad: kritisch = Kritisch, wichtig = Hoch, optional = Niedrig
 *   - Eine Oberaufgabe (ClickUp/Asana) bzw. ein Label (Jira)
 *   - Pillar Pages sind ausgenommen: Dort übernimmt das Interview diese Rolle (pillar-export.js).
 *
 * Einbinden (Webflow, vor </body>, VOR dem Assistenten-Script):
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/cvz-export.js"></script>
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/landingpage-export.js"></script>
 *
 * Im Assistenten-Script an DREI Stellen je eine Zeile (data = Server-Antwort):
 *   cvzTryResume():  nach  cvzUpdatePreviewPanel(data.structure_html_document, data.structure_version);  (in der if-Klammer)
 *   cvzOpenChat():   nach  cvzApplyPillarData(sessionData);
 *   cvzSendMessage():nach  cvzApplyPillarData(finalData);
 * jeweils:
 *   if (window.CVZLandingpageExport) window.CVZLandingpageExport.apply(DATA, { keyword: cvzState.keyword, isPillar: cvzState.page_type === 'pillar' });
 * (DATA = data, sessionData bzw. finalData). Der Aufruf ist idempotent: Er ersetzt das Menü bei
 * jeder neuen Version und entfernt es, wenn es keine Lücken (mehr) gibt.
 */
(function (root) {
  'use strict';

  var SEV = {
    kritisch: { prio: 'urgent', label: 'Kritisch', order: 0 },
    wichtig:  { prio: 'high',   label: 'Wichtig',  order: 1 },
    optional: { prio: 'low',    label: 'Optional', order: 2 },
  };
  var SEV_ORDER = ['kritisch', 'wichtig', 'optional'];

  function X() { return root.CVZExport; }
  function str(v) { return v == null ? '' : String(v).trim(); }

  /** data: { assessment, keyword, version, url } -> { tasks, counts } */
  function collectTasks(data) {
    data = data || {};
    var a = data.assessment || {};
    var gaps = (Array.isArray(a.gaps) ? a.gaps : []).filter(function (g) { return g && str(g.what_is_missing); });
    var keyword = str(data.keyword);
    var counts = { kritisch: 0, wichtig: 0, optional: 0 };
    var tasks = [];
    if (!gaps.length) return { tasks: tasks, counts: counts };

    gaps = gaps.map(function (g, i) { return { g: g, i: i }; }).sort(function (x, y) {
      var ox = (SEV[x.g.severity] || SEV.wichtig).order, oy = (SEV[y.g.severity] || SEV.wichtig).order;
      return ox - oy || x.i - y.i;
    }).map(function (o) { return o.g; });

    tasks.push({
      id: 'lp',
      title: 'Landingpage: Lücken schließen' + (keyword ? ' – ' + keyword : ''),
      description: 'Inhalte, die für die Landingpage fehlen. Erkannt vom Convertlyze Landingpage-Assistenten' +
        (data.version ? ' (Version ' + data.version + ')' : '') + '. Bitte das Ergebnis an die Person zurückgeben, die die Seite baut. Es wird nichts erfunden: Fehlt ein Beleg, bleibt ein Platzhalter stehen.',
      labels: ['Landingpage', 'Convertlyze'],
    });
    gaps.forEach(function (g, n) {
      var sev = SEV[g.severity] ? g.severity : 'wichtig';
      counts[sev]++;
      var d = [];
      d.push('Was fehlt:\n' + str(g.what_is_missing));
      if (str(g.why_it_matters)) d.push('Warum das wichtig ist:\n' + str(g.why_it_matters));
      if (str(g.effect_on_this_page)) d.push('Wirkung auf die Seite:\n' + str(g.effect_on_this_page));
      if (str(g.how_to_close)) d.push('So lässt sich die Lücke schließen:\n' + str(g.how_to_close));
      d.push('Schweregrad: ' + SEV[sev].label);
      if (keyword) d.push('Seite zum Keyword: ' + keyword);
      if (data.url) d.push('Assistent: ' + data.url);
      tasks.push({
        id: 'g' + (n + 1),
        parentId: 'lp',
        title: 'Lücke schließen: ' + X().truncate(str(g.what_is_missing), 110),
        description: d.join('\n\n'),
        priority: SEV[sev].prio,
        labels: ['Landingpage', SEV[sev].label, 'Convertlyze'],
        filterId: sev,
      });
    });
    return { tasks: tasks, counts: counts };
  }

  function filterTasks(tasks, ids) { return X().filterTasks(tasks, ids); }

  function isoToday() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function removeOld(host) {
    var old = host.querySelectorAll('[data-cvz-lp-export]');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
  }

  /**
   * data: Server-Antwort (content_assessment, structure_version)
   * ctx:  { keyword, isPillar, host }  host optional, Standard: Aktionen im Vorschau-Kopf
   */
  function apply(data, ctx) {
    ctx = ctx || {};
    if (!X() || !data) return false;
    var host = ctx.host || document.querySelector('#cvz-preview-panel .cvz-preview-actions');
    if (!host) return false;
    // Neue Antwort ohne Bewertung (z.B. reiner Chat-Turn): bestehendes Menü behalten.
    if (!data.content_assessment) return !!host.querySelector('[data-cvz-lp-export]');
    removeOld(host);
    if (ctx.isPillar) return false;

    var info = collectTasks({
      assessment: data.content_assessment, keyword: ctx.keyword, version: data.structure_version,
      url: (root.location && root.location.href) || '',
    });
    if (info.tasks.length === 0) return false;

    var filters = SEV_ORDER.filter(function (k) { return info.counts[k] > 0; }).map(function (k) {
      return { id: k, label: SEV[k].label, count: info.counts[k] };
    });
    var menu = X().createExportMenu({
      label: 'Lücken als Aufgaben',
      triggerClass: 'cvz-btn-secondary',
      placement: 'down-right',
      filters: filters,
      getTasks: function (ids) { return filterTasks(info.tasks, ids); },
      getMeta: function () {
        return { filenameBase: 'convertlyze-landingpage-' + X().slug(ctx.keyword || 'seite') + '-' + isoToday(), idPrefix: 'LP' };
      },
    });
    menu.setAttribute('data-cvz-lp-export', '');
    // Auf dem Handy teilen sich die Buttons der Zeile die Breite gleichmäßig.
    if (root.matchMedia && root.matchMedia('(max-width: 767px)').matches) { menu.style.flex = '1 1 0'; menu.style.minWidth = '0'; }
    host.appendChild(menu);
    return true;
  }

  root.CVZLandingpageExport = { version: 1, collectTasks: collectTasks, filterTasks: filterTasks, apply: apply };
})(typeof window !== 'undefined' ? window : globalThis);
