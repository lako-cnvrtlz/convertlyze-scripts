/**
 * Convertlyze – Pillar-Export v1 (Aufgaben für ClickUp, Asana, Jira)
 * https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/pillar-export.js
 *
 * Adapter zwischen dem Pillar-Page-Assistenten (Tab "Interview") und der gemeinsamen
 * Bibliothek cvz-export.js. Dieses Script kennt nur die Datenstruktur des Assistenten.
 *
 * Was exportiert wird:
 *   - Jede OFFENE Interview-Frage (weder beantwortet noch "Keine Antwort möglich") wird eine
 *     Aufgabe "Frage beantworten: ...". Gedacht zum Delegieren an den Fachbereich.
 *     Pflichtfragen = Priorität Hoch, optionale Fragen = Niedrig.
 *   - Jede empfohlene Unterseite / jeder Beitrag aus den Cluster-Vorschlägen wird eine Aufgabe
 *     "Format: Arbeitstitel". Priorität wie im Assistenten (hoch / mittel / niedrig).
 *   - Zwei Oberaufgaben (ClickUp/Asana) bzw. Labels (Jira): Interview und Cluster.
 *
 * Nicht enthalten: Der Landingpage-Assistent. Er liefert eine Vorschau, aber keine Aufgabenliste.
 *
 * Einbinden (Webflow, vor </body>, VOR dem Assistenten-Script):
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/cvz-export.js"></script>
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/pillar-export.js"></script>
 *
 * Im Assistenten-Script, in cvzRenderInterview(), direkt NACH der Zeile
 *   el.innerHTML = toolbar + intro + items + clusterHtml;
 * einfügen:
 *   if (window.CVZPillarExport) window.CVZPillarExport.mount(el.querySelector('.cvz-iv-toolbar'), {
 *     items: cvzInterview.items, clusters: cvzInterview.clusters, keyword: cvzState.keyword
 *   });
 * Das Interview wird bei jedem Speichern neu gezeichnet. mount() erzeugt das Menü deshalb jedes
 * Mal frisch und liest dabei die aktuellen Daten.
 */
(function (root) {
  'use strict';

  var KIND_LABEL = { zahl: 'Zahl', fall: 'Fall', position: 'Position' };
  var FORMAT_LABEL = {
    blog_artikel: 'Blogartikel', ratgeber: 'Ratgeber', vergleich: 'Vergleich', checkliste: 'Checkliste',
    glossar: 'Glossar', fallstudie: 'Fallstudie', landingpage: 'Landingpage',
  };
  var INTENT_LABEL = { informational: 'Information', commercial: 'Vergleich/Kauf', transactional: 'Anfrage' };
  var CLUSTER_PRIO = { hoch: 'high', mittel: 'normal', niedrig: 'low' };
  var CLUSTER_ORDER = { hoch: 0, mittel: 1, niedrig: 2 };

  function X() { return root.CVZExport; }
  function str(v) { return v == null ? '' : String(v).trim(); }

  // Gleiche Regel wie die Anzeige im Interview: ab 20 Zeichen gilt eine Frage als beantwortet.
  function isAnswered(i) { return str(i.answer_text).length >= 20; }
  function isOpen(i) { return !isAnswered(i) && !i.declined; }

  /**
   * data: { items, clusters, keyword, url }
   * Rückgabe: { tasks, counts: { must, optional, cluster }, answeredSkipped }
   */
  function collectTasks(data) {
    data = data || {};
    var keyword = str(data.keyword);
    var url = str(data.url);
    var items = Array.isArray(data.items) ? data.items : [];
    var clusters = Array.isArray(data.clusters) ? data.clusters : [];
    var counts = { must: 0, optional: 0, cluster: 0 };
    var tasks = [];
    var answeredSkipped = 0;

    var open = [];
    items.forEach(function (i) {
      if (!i || !str(i.question)) return;
      if (isOpen(i)) open.push(i); else answeredSkipped++;
    });
    // Pflichtfragen zuerst, sonst Reihenfolge des Assistenten
    var ordered = open.filter(function (i) { return i.mandatory; }).concat(open.filter(function (i) { return !i.mandatory; }));

    if (ordered.length) {
      tasks.push({
        id: 'iv',
        title: 'Pillar Page: Fragen beantworten' + (keyword ? ' – ' + keyword : ''),
        description: 'Offene Fragen aus dem Convertlyze Pillar-Page-Assistenten. Nur beantworten, was ihr aus eigener Erfahrung belegen könnt. Zahlen sind willkommen, eine Quelle ist nicht nötig. Die Antworten anschließend im Assistenten im Tab "Interview" eintragen.',
        labels: ['Interview', 'Convertlyze'],
      });
      ordered.forEach(function (i, n) {
        var must = !!i.mandatory;
        counts[must ? 'must' : 'optional']++;
        var d = [];
        d.push('Frage:\n' + str(i.question));
        if (str(i.why_asked)) d.push('Warum wir das fragen:\n' + str(i.why_asked));
        if (str(i.weak_answer_example)) d.push('Was keine gute Antwort ist:\n' + str(i.weak_answer_example));
        d.push('Art der Antwort: ' + (KIND_LABEL[i.kind] || str(i.kind) || 'Freitext'));
        d.push(must ? 'Pflichtfrage: ohne Antwort bleibt ein Platzhalter auf der Seite.' : 'Optionale Frage.');
        d.push('Antwort eintragen: Pillar-Page-Assistent, Tab "Interview"' + (url ? ' (' + url + ')' : '') + '.');
        if (keyword) d.push('Pillar Page: ' + keyword);
        tasks.push({
          id: 'q' + (n + 1),
          parentId: 'iv',
          title: 'Frage beantworten: ' + X().truncate(str(i.question), 110),
          description: d.join('\n\n'),
          priority: must ? 'high' : 'low',
          labels: ['Interview', must ? 'Pflichtfrage' : 'Optional', 'Convertlyze'],
          filterId: must ? 'must' : 'optional',
        });
      });
    }

    var sortedClusters = clusters.filter(function (c) { return c && str(c.working_title); }).slice().sort(function (a, b) {
      var oa = CLUSTER_ORDER[a.priority], ob = CLUSTER_ORDER[b.priority];
      return (oa == null ? 3 : oa) - (ob == null ? 3 : ob);
    });
    if (sortedClusters.length) {
      tasks.push({
        id: 'cl',
        title: 'Pillar Page: Cluster-Beiträge erstellen' + (keyword ? ' – ' + keyword : ''),
        description: 'Unterseiten und Beiträge, die laut Recherche im Cluster noch fehlen. Die Pillar Page verlinkt erst darauf, wenn die Seiten existieren und im Brief als Cluster eingetragen sind.',
        labels: ['Cluster', 'Convertlyze'],
      });
      sortedClusters.forEach(function (c, n) {
        counts.cluster++;
        var format = FORMAT_LABEL[c.format] || str(c.format) || 'Beitrag';
        var d = [];
        d.push('Arbeitstitel: ' + str(c.working_title));
        if (str(c.keyword)) d.push('Keyword: ' + str(c.keyword));
        d.push('Format: ' + format);
        if (str(c.intent)) d.push('Suchintention: ' + (INTENT_LABEL[c.intent] || str(c.intent)));
        if (typeof c.search_volume === 'number') d.push('Suchvolumen: ' + c.search_volume.toLocaleString('de-DE') + ' pro Monat');
        if (str(c.why_worth)) d.push('Warum lohnt sich das:\n' + str(c.why_worth));
        if (keyword) d.push('Gehört zur Pillar Page: ' + keyword);
        tasks.push({
          id: 'c' + (n + 1),
          parentId: 'cl',
          title: format + ': ' + str(c.working_title),
          description: d.join('\n'),
          priority: CLUSTER_PRIO[c.priority] || 'normal',
          labels: ['Cluster', format, 'Convertlyze'],
          filterId: 'cluster',
        });
      });
    }

    return { tasks: tasks, counts: counts, answeredSkipped: answeredSkipped };
  }

  function filterTasks(tasks, selectedIds) { return X().filterTasks(tasks, selectedIds); }

  function isoToday() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /** Hängt Button + Menü in `host` (die Toolbar-Zeile im Interview-Tab). */
  function mount(host, data) {
    if (!host || !X()) return false;
    if (host.querySelector('.cvz-xp-wrap')) return true;
    data = data || {};
    var info = collectTasks({
      items: data.items, clusters: data.clusters, keyword: data.keyword,
      url: data.url || (root.location && root.location.href) || '',
    });
    if (info.tasks.length === 0) return false;

    var filters = [];
    if (info.counts.must) filters.push({ id: 'must', label: 'Pflichtfragen', count: info.counts.must });
    if (info.counts.optional) filters.push({ id: 'optional', label: 'Optionale Fragen', count: info.counts.optional });
    if (info.counts.cluster) filters.push({ id: 'cluster', label: 'Cluster-Beiträge', count: info.counts.cluster });
    var note = info.answeredSkipped
      ? info.answeredSkipped + (info.answeredSkipped === 1 ? ' Frage ist' : ' Fragen sind') + ' beantwortet oder abgelehnt und nicht enthalten.'
      : '';

    var menu = X().createExportMenu({
      label: 'Als Aufgaben exportieren',
      triggerClass: 'cvz-btn-secondary',
      placement: 'down-left',
      filters: filters,
      note: note,
      getTasks: function (selectedIds) { return filterTasks(info.tasks, selectedIds); },
      getMeta: function () {
        return {
          filenameBase: 'convertlyze-pillar-' + X().slug(data.keyword || 'page') + '-' + isoToday(),
          idPrefix: 'PP',
        };
      },
    });
    host.appendChild(menu);
    return true;
  }

  root.CVZPillarExport = { version: 1, collectTasks: collectTasks, filterTasks: filterTasks, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
