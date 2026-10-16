/**
 * Convertlyze – Tracker-Export v1 (Aufgaben für ClickUp, Asana, Jira)
 * https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/tracker-export.js
 *
 * Adapter zwischen dem KI-Sichtbarkeits-Tracker (Tab "Aktionsplan") und der gemeinsamen
 * Bibliothek cvz-export.js. Dieses Script kennt nur die Datenstruktur des Trackers.
 *
 * Was exportiert wird:
 *   - Jede OFFENE Maßnahme aus detail.action_plan.items wird eine Aufgabe.
 *     Als erledigt markierte Maßnahmen bleiben draußen (sie stehen schon in eurem Team-Tool
 *     oder sind abgehakt).
 *   - Jede Phase (Erforschung, Bewertung, Vergleich, Entscheidung, Alle Phasen) wird eine
 *     Oberaufgabe (ClickUp/Asana) bzw. ein Label (Jira).
 *   - Priorität = Impact (Hoch / Mittel / Niedrig).
 *   - Optional, im Menü standardmäßig AUS: Outreach-Ziele (Bewertungsportale, Medien,
 *     Community). Das sind unverifizierte Kandidaten, oft dutzende. Sie gehören nicht
 *     ungefragt in ein Team-Board.
 *
 * Einbinden (Webflow, vor </body>, VOR dem Tracker-Script):
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/cvz-export.js"></script>
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/tracker-export.js"></script>
 *
 * Im Tracker-Script, in renderAktionsplanTab(detail), direkt nach dem apStepNotice-Block:
 *   var xpBtn = window.CVZTrackerExport ? window.CVZTrackerExport.createButton(detail) : null;
 *   if (xpBtn) wrap.appendChild(xpBtn);
 */
(function (root) {
  'use strict';

  var PHASE_ORDER = ['alle_phasen', 'exploration', 'evaluation', 'comparison', 'decision'];
  var PHASE_LABEL = {
    exploration: 'Erforschung', evaluation: 'Bewertung', comparison: 'Vergleich',
    decision: 'Entscheidung', alle_phasen: 'Alle Phasen',
  };
  var CAT_LABEL = {
    ki_sichtbarkeit: 'KI-Sichtbarkeit', google_ranking: 'Google-Ranking', wettbewerb: 'Wettbewerb',
    content_luecke: 'Content-Lücke', ki_wissen: 'KI-Wissen', wirkungskontrolle: 'Wirkungskontrolle',
  };
  // Impact -> neutrale Priorität. "Kritisch" gibt es im Tracker nicht, deshalb kein urgent.
  var IMPACT_PRIO = { hoch: 'high', mittel: 'normal', niedrig: 'low' };
  var PRIO_ORDER = ['high', 'normal', 'low'];
  var OUTREACH_GROUPS = [
    { key: 'bewertungsportale', title: 'Outreach: Bewertungsportale', hint: 'Für Bewertungen und Kundenstimmen.' },
    { key: 'medien',            title: 'Outreach: Medien und Fachartikel', hint: 'Für Digital PR, Gastbeiträge, Listungen.' },
    { key: 'community',         title: 'Outreach: Community und Video', hint: 'Für aktive Beteiligung.' },
    { key: 'recherche',         title: 'Outreach: Rechercheziele', hint: 'Kein Gastbeitrag realistisch, aber hilfreich für eigene FAQs und Wissensartikel.' },
    { key: 'zu_pruefen',        title: 'Outreach: Noch zu prüfen', hint: 'Ranken gut zu euren Keywords, Typ noch nicht eingeordnet.' },
  ];

  function X() { return root.CVZExport; }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function num(v, digits) {
    if (v == null || v === '' || isNaN(Number(v))) return '';
    var f = Math.pow(10, digits || 0);
    return String(Math.round(Number(v) * f) / f).replace('.', ',');
  }

  // Belege je Kategorie als Klartext (gleiche Daten wie in der Karte im Tracker).
  function evidenceText(catKey, ev) {
    if (!ev || typeof ev !== 'object') return '';
    var lines = [];
    if (catKey === 'google_ranking') {
      if (ev.position != null) lines.push('Position: ' + num(ev.position, 1));
      if (ev.impressions != null) lines.push('Impressionen: ' + Number(ev.impressions).toLocaleString('de-DE'));
      if (ev.page_url) lines.push('Rankende Seite: ' + ev.page_url);
      if (Array.isArray(ev.serp_top3) && ev.serp_top3.length) lines.push('Top-Ergebnisse auf der SERP: ' + ev.serp_top3.join(', '));
    } else if (catKey === 'content_luecke') {
      if (ev.example_prompt) lines.push('Beispiel-Frage: "' + ev.example_prompt + '"');
    } else {
      if (ev.own_citation_rate_pct != null) lines.push('Eure Zitierungsrate: ' + ev.own_citation_rate_pct + ' %');
      if (ev.top_competitor && ev.competitor_citation_rate_pct != null) {
        lines.push(ev.top_competitor + ': ' + ev.competitor_citation_rate_pct + ' %');
      }
      if (ev.example_prompt) lines.push('Beispiel-Prompt: "' + ev.example_prompt + '"');
    }
    return lines.join('\n');
  }

  function itemDescription(item, ctx) {
    var catKey = item.category || 'ki_sichtbarkeit';
    var parts = [];
    if (str(item.situation)) parts.push('Situation:\n' + str(item.situation));
    var ev = evidenceText(catKey, item.evidence);
    if (ev) parts.push('Belege:\n' + ev);
    if (str(item.recommendation)) parts.push('Empfehlung:\n' + str(item.recommendation));
    if (Array.isArray(item.sources) && item.sources.length) {
      parts.push('Grundlage:\n' + item.sources.map(function (s) {
        return '- ' + (s && s.kind ? s.kind + ': ' : '') + (s && s.label ? s.label : '');
      }).join('\n'));
    }
    parts.push('Kategorie: ' + (CAT_LABEL[catKey] || catKey));
    if (ctx.topicName) parts.push('Thema: ' + ctx.topicName);
    if (ctx.url) parts.push('Tracker: ' + ctx.url);
    return parts.join('\n\n');
  }

  /**
   * detail: Antwort des Backends (detail.action_plan, detail.outreach_targets, detail.topic)
   * ctx:    { url } optional, Standard: aktuelle Seiten-URL
   * Rückgabe: { tasks, counts: {high,normal,low,outreach}, completedSkipped, topicName }
   */
  function collectTasks(detail, ctx) {
    ctx = ctx || {};
    detail = detail || {};
    var topic = detail.topic || {};
    var topicName = str(topic.name) || str(topic.seed_keyword);
    var meta = { topicName: topicName, url: ctx.url || '' };

    var ap = detail.action_plan || {};
    var items = Array.isArray(ap.items) ? ap.items : [];
    var done = Array.isArray(ap.completed_item_indices) ? ap.completed_item_indices : [];

    var counts = { high: 0, normal: 0, low: 0, outreach: 0 };
    var tasks = [];
    var completedSkipped = 0;
    var seq = 0;

    // Offene Maßnahmen je Phase, innerhalb der Phase nach Priorität (1 = wichtigste).
    var byPhase = {};
    items.forEach(function (item, idx) {
      if (!item || !str(item.title)) return;
      if (done.indexOf(idx) !== -1) { completedSkipped++; return; }
      var ph = PHASE_LABEL[item.phase] ? item.phase : 'alle_phasen';
      (byPhase[ph] = byPhase[ph] || []).push(item);
    });

    PHASE_ORDER.forEach(function (ph) {
      var list = byPhase[ph];
      if (!list || !list.length) return;
      list.sort(function (a, b) { return (a.priority || 99) - (b.priority || 99); });
      var parentId = 'ph-' + ph;
      tasks.push({
        id: parentId,
        title: 'Aktionsplan: ' + PHASE_LABEL[ph] + (topicName ? ' – ' + topicName : ''),
        description: 'Maßnahmen für die Phase "' + PHASE_LABEL[ph] + '" aus dem Convertlyze KI-Sichtbarkeits-Tracker.',
        labels: [PHASE_LABEL[ph], 'Convertlyze'],
      });
      list.forEach(function (item) {
        var prio = IMPACT_PRIO[str(item.impact).toLowerCase()] || 'normal';
        counts[prio]++;
        seq++;
        tasks.push({
          id: 'a' + seq,
          parentId: parentId,
          title: str(item.title),
          description: itemDescription(item, meta),
          priority: prio,
          labels: [CAT_LABEL[item.category] || str(item.category) || 'KI-Sichtbarkeit', PHASE_LABEL[ph], 'Convertlyze'],
          filterId: prio,
        });
      });
    });

    // Outreach-Ziele: nur wenn vorhanden, immer mit eigenem Filter.
    var o = detail.outreach_targets || null;
    if (o) {
      OUTREACH_GROUPS.forEach(function (g) {
        var list = g.key === 'zu_pruefen' ? o.zu_pruefen : (o.groups || {})[g.key];
        if (!Array.isArray(list) || !list.length) return;
        var parentId = 'out-' + g.key;
        tasks.push({
          id: parentId,
          title: g.title + (topicName ? ' – ' + topicName : ''),
          description: g.hint + ' Kandidaten aus euren Daten. Ob dort eine Listung, Bewertung oder ein Beitrag möglich ist, ist nicht geprüft.',
          labels: ['Outreach', 'Convertlyze'],
        });
        list.forEach(function (t) {
          if (!t || !str(t.domain)) return;
          seq++;
          counts.outreach++;
          var link = /^https?:\/\//i.test(str(t.url)) ? str(t.url) : 'https://' + str(t.domain);
          var d = [];
          if (str(t.content_type_label)) d.push('Typ: ' + str(t.content_type_label));
          if (str(t.reason)) d.push('Warum: ' + str(t.reason));
          if (t.can_publish === true) d.push('Selbst veröffentlichen möglich.');
          d.push('Link: ' + link);
          d.push('Hinweis: Nicht geprüft, ob eine Listung, Bewertung oder ein Beitrag dort möglich ist.');
          if (topicName) d.push('Thema: ' + topicName);
          tasks.push({
            id: 'o' + seq,
            parentId: parentId,
            title: 'Prüfen: ' + str(t.domain),
            description: d.join('\n'),
            priority: 'low',
            labels: ['Outreach', str(t.content_type_label) || 'Ziel', 'Convertlyze'],
            filterId: 'outreach',
          });
        });
      });
    }

    return { tasks: tasks, counts: counts, completedSkipped: completedSkipped, topicName: topicName };
  }

  function filterTasks(tasks, selectedIds) { return X().filterTasks(tasks, selectedIds); }

  function isoToday() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /**
   * Baut Button + Menü. Gibt ein Element zurück (oder null, wenn nichts zu exportieren ist).
   * Der Tracker rendert bei jedem Wechsel neu. Das Element wird deshalb bei jedem Aufruf
   * frisch erzeugt und darf einfach angehängt werden.
   */
  function createButton(detail) {
    if (!X()) return null;
    var url = (root.location && root.location.href) || '';
    var data = collectTasks(detail, { url: url });
    var leaves = data.tasks.filter(function (t) { return t.filterId; });
    if (leaves.length === 0) return null;

    var filters = PRIO_ORDER.filter(function (k) { return data.counts[k] > 0; }).map(function (k) {
      return { id: k, label: 'Impact ' + X().PRIORITIES[k].de, count: data.counts[k] };
    });
    if (data.counts.outreach > 0) {
      filters.push({ id: 'outreach', label: 'Outreach-Ziele (unverifizierte Kandidaten)', count: data.counts.outreach, checked: false });
    }
    var note = data.completedSkipped
      ? data.completedSkipped + (data.completedSkipped === 1 ? ' als erledigt markierte Maßnahme ist' : ' als erledigt markierte Maßnahmen sind') + ' nicht enthalten.'
      : '';

    var menu = X().createExportMenu({
      label: 'Aktionsplan als Aufgaben',
      triggerClass: 'cvz-archive-btn', // gleiche Optik wie "Als PDF exportieren"
      placement: 'down-left',
      filters: filters,
      note: note,
      getTasks: function (selectedIds) { return filterTasks(data.tasks, selectedIds); },
      getMeta: function () {
        return {
          filenameBase: 'convertlyze-aktionsplan-' + X().slug(data.topicName || 'tracker') + '-' + isoToday(),
          idPrefix: 'TR',
        };
      },
    });
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;margin:0 0 16px;';
    row.appendChild(menu);
    return row;
  }

  root.CVZTrackerExport = { version: 1, collectTasks: collectTasks, filterTasks: filterTasks, createButton: createButton };
})(typeof window !== 'undefined' ? window : globalThis);
