// =========================================================================
  // NEU (20.09.2026): Gezielter Retry einzelner Felder, KI-Wissens-Check,
  // Wirkung der Änderungen. Backend: step_tracker.py, ai_knowledge.py,
  // change_history.py, POST /topics/{id}/retry-step.
  // =========================================================================

  // --- Retry eines einzelnen Schritts -------------------------------------

  async function retryStep(topicId, step) {
    var key = topicId + '|' + step;
    if (state.retryingSteps[key]) return;
    state.retryingSteps[key] = true;
    render();
    try {
      await apiFetch('/topics/' + topicId + '/retry-step', { method: 'POST', body: { step: step } });
      // Sofort als "läuft" markieren, damit der Fehler-Button nicht kurz wieder aufblitzt.
      var cached = state.topicDetailCache[topicId];
      if (cached) {
        cached.step_status = (cached.step_status || []).map(function (s) {
          return s.step === step ? Object.assign({}, s, { state: 'running', message: null }) : s;
        });
      }
      startStepPolling(topicId);
    } catch (e) {
      console.error('[CVZ Visibility] Schritt konnte nicht gestartet werden:', e);
      await showCvzAlert('Der Vorgang konnte nicht gestartet werden: ' + (e.message || 'Unbekannter Fehler'));
    }
    delete state.retryingSteps[key];
    render();
  }

  // Lädt das Topic-Detail alle 5 Sekunden neu, solange ein Schritt läuft.
  // Sobald ein Schritt erfolgreich war, fehlt er in step_status und sein Button verschwindet.
  function startStepPolling(topicId) {
    if (state.stepPollTimer) return;
    var attempts = 0;
    state.stepPollTimer = setInterval(async function () {
      attempts++;
      try {
        var fresh = await loadTopicDetail(topicId);
        if (fresh) state.topicDetailCache[topicId] = fresh;
      } catch (e) {
        console.error('[CVZ Visibility] Aktualisierung während eines Schritts fehlgeschlagen:', e);
      }
      var cachedNow = state.topicDetailCache[topicId];
      var stillRunning = !!cachedNow && (cachedNow.step_status || []).some(function (s) { return s.state === 'running'; });
      if (!stillRunning || attempts >= 40) {
        clearInterval(state.stepPollTimer);
        state.stepPollTimer = null;
      }
      render();
    }, 5000);
  }

  // Hinweis mit Button für Schritte, die fehlgeschlagen sind, fehlen oder gerade laufen.
  // stepKeys: welche Schritte an dieser Stelle der Oberfläche relevant sind.
  function renderStepNotice(detail, stepKeys) {
    var entries = (detail.step_status || []).filter(function (s) { return stepKeys.indexOf(s.step) !== -1; });
    if (entries.length === 0) return null;
    var topicId = detail.topic.id;
    var wrap = document.createElement('div');
    entries.forEach(function (entry) {
      var busy = entry.state === 'running' || !!state.retryingSteps[topicId + '|' + entry.step];
      var box = document.createElement('div');
      box.className = 'cvz-card cvz-collecting-banner' + (entry.state === 'failed' && !busy ? ' cvz-error-banner' : '');
      var text = document.createElement('p');
      text.className = 'cvz-collecting-banner-text';
      if (busy) {
        text.innerHTML = '<span class="cvz-spinner"></span>' + escapeHtml(entry.label) +
          ' wird gerade erstellt. Diese Seite aktualisiert sich automatisch.';
        box.appendChild(text);
      } else {
        text.textContent = entry.state === 'failed'
          ? '\u26a0\ufe0f ' + entry.label + ' konnte nicht erstellt werden. ' + (entry.message || '')
          : (entry.message || (entry.label + ' fehlt noch.'));
        box.appendChild(text);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cvz-retry-btn';
        btn.setAttribute('data-cvz-retry-step', entry.step);
        btn.textContent = entry.state === 'failed' ? 'Erneut erstellen' : 'Jetzt erstellen';
        box.appendChild(btn);
      }
      wrap.appendChild(box);
    });
    return wrap;
  }

  // --- KI-Wissens-Check ---------------------------------------------------

  var KNOWLEDGE_LEVELS = {
    bekannt:          { label: 'Bekannt',         color: '#4ec68a' },
    teilweise:        { label: 'Teilweise',       color: '#c98e2a' },
    unbekannt:        { label: 'Unbekannt',       color: '#de5b50' },
    widerspruechlich: { label: 'Widersprüchlich', color: '#8878ca' },
    nicht_geprueft:   { label: 'Nicht geprüft',   color: '#8b98a5' },
  };
  var KNOWLEDGE_PRIORITY_COLORS = { hoch: '#de5b50', mittel: '#c98e2a', niedrig: '#8b98a5' };

  function knowledgeBadge(level) {
    var cfg = KNOWLEDGE_LEVELS[level] || KNOWLEDGE_LEVELS.unbekannt;
    return '<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;' +
      'white-space:nowrap;color:' + cfg.color + ';border:1px solid ' + cfg.color + ';">' + cfg.label + '</span>';
  }

  function renderKnowledgeSection(detail) {
    var k = detail.ai_knowledge;
    if (!k) return null;

    var section = document.createElement('div');
    section.className = 'cvz-section';
    section.style.marginBottom = '32px';

    var headRow = document.createElement('div');
    headRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.style.margin = '0';
    heading.textContent = 'Was ChatGPT und Gemini über euer Angebot wissen';
    headRow.appendChild(heading);
    headRow.appendChild(makeTip(
      'Einmal im Monat fragen wir ChatGPT und Gemini, was sie über euer Unternehmen wissen und wie sie euch mit Wettbewerbern vergleichen würden. ' +
      'Die Modelle nutzen dabei auch die Websuche. Ihr seht also, was ein Nutzer heute als Antwort bekommt. ' +
      'Ob die Angaben stimmen, prüfen wir nicht. Wir zeigen nur Lücken und Widersprüche zwischen den Modellen.'
    ));
    section.appendChild(headRow);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '12px';
    sub.textContent = 'Geprüft am ' + (formatShortDate(k.checked_at) || '') + '. Abdeckung: Wie vollständig kennen die Modelle die acht wichtigsten Wissensbereiche.';
    section.appendChild(sub);

    var card = document.createElement('div');
    card.className = 'cvz-card';

    // Abdeckung je Modell
    [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini']].forEach(function (pair) {
      var pct = k.coverage ? k.coverage[pair[0]] : null;
      var prev = k.previous_coverage ? k.previous_coverage[pair[0]] : null;
      var row = document.createElement('div');
      row.className = 'cvz-journey-channel-row';
      var deltaHtml = '';
      if (pct != null && prev != null) {
        var diff = pct - prev;
        deltaHtml = '<span class="cvz-journey-channel-delta ' + (diff === 0 ? 'cvz-delta-flat' : (diff > 0 ? 'cvz-delta-up' : 'cvz-delta-down')) +
          '" title="Veränderung zur vorherigen Prüfung">' + (diff === 0 ? '\u2192 ' : (diff > 0 ? '\u25b2 ' : '\u25bc ')) + Math.abs(diff) + ' Pp</span>';
      }
      row.innerHTML =
        '<span class="cvz-journey-channel-label" style="font-weight:600;">' + pair[1] + '</span>' +
        '<div class="cvz-journey-bar-wrap"><div class="cvz-journey-bar-fill" style="width:' + (pct || 0) + '%;background:#4fd1c5"></div></div>' +
        '<span class="cvz-journey-channel-num" style="font-weight:600;">' + (pct == null ? '\u2013' : pct + '%') + '</span>' + deltaHtml;
      card.appendChild(row);
    });

    if (k.overall) {
      var overall = document.createElement('p');
      overall.className = 'cvz-summary-text';
      overall.style.margin = '12px 0 0';
      overall.textContent = k.overall;
      card.appendChild(overall);
    }
    if (k.engines_failed && k.engines_failed.length) {
      var failedNote = document.createElement('p');
      failedNote.className = 'cvz-thin-data-note';
      failedNote.textContent = 'Nicht alle Modelle konnten abgefragt werden: ' +
        k.engines_failed.map(function (e) { return e === 'chatgpt' ? 'ChatGPT' : 'Gemini'; }).join(', ') + '.';
      card.appendChild(failedNote);
    }

    // Tabelle je Wissensbereich
    var rowsHtml = (k.dimensions || []).map(function (d) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(d.label) + '</strong></td>' +
        '<td>' + knowledgeBadge(d.chatgpt) + '</td>' +
        '<td>' + knowledgeBadge(d.gemini) + '</td>' +
        '<td style="color:var(--cvz-text-muted,#8b98a5);">' + escapeHtml(d.missing || d.conflict || d.known || '') + '</td>' +
      '</tr>';
    }).join('');
    if (rowsHtml) {
      var tableWrap = document.createElement('div');
      tableWrap.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:14px;';
      tableWrap.innerHTML =
        '<table class="cvz-table" style="min-width:560px;"><thead><tr><th>Bereich</th><th>ChatGPT</th><th>Gemini</th><th>Was fehlt bzw. was bekannt ist</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table>';
      card.appendChild(tableWrap);
    }
    section.appendChild(card);

    // Fehlende Informationen für einen vollständigen Vergleich
    var blockers = k.comparison_blockers || [];
    if (blockers.length) {
      var blockLabel = document.createElement('p');
      blockLabel.className = 'cvz-changelog-guided-label';
      blockLabel.style.marginTop = '16px';
      blockLabel.textContent = 'Das fehlt für einen vollständigen Vergleich mit Wettbewerbern';
      section.appendChild(blockLabel);
      var grid = document.createElement('div');
      grid.className = 'cvz-opportunity-grid';
      blockers.forEach(function (b) {
        var color = KNOWLEDGE_PRIORITY_COLORS[b.priority] || '#8b98a5';
        var c = document.createElement('div');
        c.className = 'cvz-card cvz-idea-card';
        c.style.borderLeftColor = color;
        c.innerHTML =
          '<p class="cvz-opportunity-type" style="color:' + color + ';">' + escapeHtml(b.info) + '</p>' +
          (b.why ? '<p class="cvz-opportunity-description">' + escapeHtml(b.why) + '</p>' : '') +
          (b.where_to_publish
            ? '<div class="cvz-action-recommendation"><p class="cvz-changelog-guided-label">Wo veröffentlichen</p>' +
              '<p class="cvz-opportunity-description">' + escapeHtml(b.where_to_publish) + '</p></div>'
            : '');
        var targetList = renderTargetList(b.targets);
        if (targetList) c.appendChild(targetList);
        grid.appendChild(c);
      });
      section.appendChild(grid);
    }

    // Widersprüche zwischen den Modellen
    var wrong = k.wrong_or_outdated || [];
    if (wrong.length) {
      var wrongLabel = document.createElement('p');
      wrongLabel.className = 'cvz-changelog-guided-label';
      wrongLabel.style.marginTop = '16px';
      wrongLabel.textContent = 'Widersprüchliche Angaben, bitte prüfen';
      section.appendChild(wrongLabel);
      wrong.forEach(function (w) {
        var p = document.createElement('p');
        p.className = 'cvz-opportunity-description';
        p.textContent = (w.model === 'chatgpt' ? 'ChatGPT: ' : (w.model === 'gemini' ? 'Gemini: ' : 'Beide Modelle: ')) +
          w.statement + (w.correction_hint ? ' (' + w.correction_hint + ')' : '');
        section.appendChild(p);
      });
    }

    if (k.changes_effect) {
      var eff = document.createElement('p');
      eff.className = 'cvz-summary-text';
      eff.textContent = k.changes_effect;
      section.appendChild(eff);
    }

    // Quellen, auf die sich die Modelle stützen
    if (k.sources) {
      var srcParts = [];
      [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini']].forEach(function (pair) {
        var domains = (k.sources[pair[0]] || []).map(function (s) { return s.domain; });
        var ownUsed = k.own_domain_in_sources && k.own_domain_in_sources[pair[0]];
        if (domains.length) {
          srcParts.push(pair[1] + ': ' + domains.join(', ') + (ownUsed ? ' (eure Seite ist dabei)' : ' (eure Seite ist nicht dabei)'));
        }
      });
      if (srcParts.length) {
        var src = document.createElement('p');
        src.className = 'cvz-thin-data-note';
        src.textContent = 'Quellen, auf die sich die Modelle bei dieser Prüfung stützen. ' + srcParts.join(' | ');
        section.appendChild(src);
      }
    }
    return section;
  }

  // --- Ziele für Bewertungen und Digital PR ---------------------------------
  // Backend: outreach_targets.py. Ziele stammen aus zitierten Quellen und Google-Rankings,
  // nie von Claude erfunden. Einträge mit checked === false sind Ranking-Kandidaten, deren
  // Typ noch nicht eingeordnet ist.

  function targetLink(target) {
    var href = target.url && /^https?:\/\//i.test(target.url) ? target.url : 'https://' + target.domain;
    var a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.cssText = 'font-weight:600;color:var(--cvz-teal,#4fd1c5);text-decoration:none;';
    a.textContent = target.domain;
    return a;
  }

  function renderTargetList(targets) {
    if (!Array.isArray(targets) || targets.length === 0) return null;
    var wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:10px;padding-top:8px;border-top:1px solid var(--cvz-border,#232b36);';
    var label = document.createElement('p');
    label.className = 'cvz-changelog-guided-label';
    label.style.margin = '0 0 6px';
    label.textContent = 'Mögliche Ziele';
    wrap.appendChild(label);

    targets.forEach(function (t) {
      var row = document.createElement('div');
      row.style.cssText = 'margin-bottom:8px;';
      var head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;';
      var icon = document.createElement('img');
      icon.className = 'cvz-inline-favicon';
      icon.alt = '';
      icon.src = 'https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(t.domain);
      head.appendChild(icon);
      head.appendChild(targetLink(t));
      var chips = [t.content_type_label];
      if (t.checked === false) chips.push('noch zu prüfen');
      if (t.can_publish === true) chips.push('selbst veröffentlichen möglich');
      chips.forEach(function (c) {
        if (!c) return;
        var chip = document.createElement('span');
        chip.className = 'cvz-persona-chip';
        chip.style.cursor = 'default';
        chip.textContent = c;
        head.appendChild(chip);
      });
      row.appendChild(head);
      if (t.reason) {
        var reason = document.createElement('p');
        reason.style.cssText = 'margin:2px 0 0;font-size:12px;color:var(--cvz-text-muted,#8b98a5);line-height:1.4;';
        reason.textContent = t.reason;
        row.appendChild(reason);
      }
      wrap.appendChild(row);
    });

    var note = document.createElement('p');
    note.className = 'cvz-thin-data-note';
    note.textContent = 'Kandidaten aus euren Daten. Ob dort eine Listung, Bewertung oder ein Beitrag möglich ist, ist nicht geprüft.';
    wrap.appendChild(note);
    return wrap;
  }

  var OUTREACH_GROUP_TITLES = {
    bewertungsportale: 'Bewertungsportale (für Bewertungen und Kundenstimmen)',
    medien: 'Medien und Fachartikel (für Digital PR, Gastbeiträge, Listungen)',
    community: 'Community und Video (für aktive Beteiligung)',
  };

  function renderOutreachTargetsSection(detail) {
    var o = detail.outreach_targets;
    if (!o) return null;
    var groups = o.groups || {};
    var hasAny = ['bewertungsportale', 'medien', 'community'].some(function (g) { return (groups[g] || []).length; }) ||
      (o.zu_pruefen || []).length;
    if (!hasAny) return null;

    var section = document.createElement('div');
    section.className = 'cvz-section';
    section.style.marginTop = '28px';

    var headRow = document.createElement('div');
    headRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.style.margin = '0';
    heading.textContent = 'Mögliche Ziele für Bewertungen und Digital PR';
    headRow.appendChild(heading);
    headRow.appendChild(makeTip(
      'Diese Portale, Medien und Communities werden von ChatGPT, Gemini oder Google AI Overview zu diesem Thema als Quelle genannt oder stehen in den Google-Top-10 zu euren Keywords. ' +
      'Wettbewerber, eure eigene Seite und Anbieter-Seiten sind ausgeschlossen. Ob eine Listung oder Bewertung dort möglich ist, ist nicht geprüft.'
    ));
    section.appendChild(headRow);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '12px';
    sub.textContent = 'Berechnet aus den Quellen der KI-Antworten (' + (o.prompts_gesamt || 0) + ' Prompts) und den Google-Rankings zu ' +
      (o.keywords_mit_serp || 0) + ' Keywords.' +
      (o.nicht_eingeordnet_anzahl ? ' ' + o.nicht_eingeordnet_anzahl + ' weitere zitierte Quellen sind noch nicht eingeordnet und werden mit dem nächsten Monatslauf geprüft.' : '');
    section.appendChild(sub);

    ['bewertungsportale', 'medien', 'community'].forEach(function (g) {
      var list = renderTargetList(groups[g]);
      if (!list) return;
      var card = document.createElement('div');
      card.className = 'cvz-card';
      card.style.marginBottom = '10px';
      var title = document.createElement('p');
      title.style.cssText = 'margin:0;font-size:13px;font-weight:600;';
      title.textContent = OUTREACH_GROUP_TITLES[g];
      card.appendChild(title);
      // Überschrift und Hinweis der Liste je Gruppe nicht wiederholen
      list.removeChild(list.firstChild);
      list.removeChild(list.lastChild);
      card.appendChild(list);
      section.appendChild(card);
    });

    var check = renderTargetList((o.zu_pruefen || []).map(function (t) { return Object.assign({}, t, { checked: false }); }));
    if (check) {
      var checkCard = document.createElement('div');
      checkCard.className = 'cvz-card';
      var checkTitle = document.createElement('p');
      checkTitle.style.cssText = 'margin:0;font-size:13px;font-weight:600;';
      checkTitle.textContent = 'Noch zu prüfen (ranken gut zu Keywords, Typ noch nicht eingeordnet)';
      checkCard.appendChild(checkTitle);
      check.removeChild(check.firstChild);
      checkCard.appendChild(check);
      section.appendChild(checkCard);
    }
    return section;
  }

  // --- Umgesetzte Änderungen und ihre Wirkung -----------------------------

  var VERDICT_COLORS = {
    verbessert: '#4ec68a', verschlechtert: '#de5b50', gemischt: '#c98e2a',
    unveraendert: '#c98e2a', zu_frueh: '#8b98a5', zu_wenig_daten: '#8b98a5',
  };

  function renderChangeAssessmentSection(detail) {
    var ca = detail.change_assessment;
    if (!ca || !ca.items || ca.items.length === 0) return null;

    var section = document.createElement('div');
    section.className = 'cvz-section';
    section.style.marginTop = '28px';

    var heading = document.createElement('p');
    heading.className = 'cvz-section-label';
    heading.textContent = 'Bereits umgesetzt und was sich seitdem getan hat';
    section.appendChild(heading);

    var sub = document.createElement('p');
    sub.className = 'cvz-card-placeholder-text';
    sub.style.marginBottom = '12px';
    sub.textContent = 'Diese Maßnahmen empfehlen wir nicht erneut. Bewertet wird frühestens nach 4 Wochen. ' +
      'Gemessen wird ein zeitlicher Zusammenhang, kein Beweis für Ursache und Wirkung.';
    section.appendChild(sub);

    ca.items.forEach(function (it) {
      var color = VERDICT_COLORS[it.verdict] || '#8b98a5';
      var card = document.createElement('div');
      card.className = 'cvz-card';
      card.style.cssText = 'padding:12px 16px;margin-bottom:8px;border-left:3px solid ' + color + ';';
      var weeks = it.weeks_since < 1 ? 'diese Woche' : 'vor ' + it.weeks_since + (it.weeks_since === 1 ? ' Woche' : ' Wochen');
      card.innerHTML =
        '<p style="margin:0 0 4px;font-size:11px;color:var(--cvz-text-muted,#8b98a5);">' +
          escapeHtml(formatShortDate(it.date) || '') + ' (' + weeks + ') \u00b7 ' + escapeHtml(it.type_label) + '</p>' +
        '<p style="margin:0 0 6px;font-size:14px;">' + escapeHtml(it.description) +
          (it.url ? ' <a class="cvz-content-change-url" href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener">Link \u2197</a>' : '') + '</p>' +
        '<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;color:' + color +
          ';border:1px solid ' + color + ';">' + escapeHtml(it.verdict_label) + '</span>' +
        (it.evidence || []).map(function (e) {
          return '<p style="margin:6px 0 0;font-size:12px;color:var(--cvz-text-muted,#8b98a5);">' + escapeHtml(e) + '</p>';
        }).join('') +
        (it.stagnation
          ? '<p style="margin:8px 0 0;font-size:12px;color:#c98e2a;">Seit mindestens 8 Wochen umgesetzt, aber keine erkennbare Wirkung. ' +
            'Mögliche Ursachen (Vermutung): Der Inhalt ist noch nicht stark genug, es fehlen Bewertungen und Kundenstimmen, ' +
            'es fehlen Erwähnungen auf Drittseiten (Digital PR) oder die Seite ist für KI-Systeme schwer erfassbar.</p>'
          : '');
      section.appendChild(card);
    });
    return section;
  }
