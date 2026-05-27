/**
 * Convertlyze – Statische Beispielanalyse (anonymisiert)
 * Fiktiver DACH-SaaS-Anbieter im Buchhaltungs-Segment
 *
 * Einbindung: <script src="...beispielanalyse.js"></script>
 */

(function () {
  'use strict';

  var DATA = {
    keyword:         'Buchhaltungssoftware für Gründer',
    url:             'demo-saas.example',
    target_audience: 'Gründer und Selbstständige ohne Buchhaltungsvorkenntnisse',
    conversion_goal: 'Kostenlose Testversion starten',
    industry:        'FinTech / Buchhaltungssoftware für KMU und Selbstständige',
    business_type:   'SaaS',
    search_intent:   'Transactional',
    created_at:      '13.05.2026, 18:57',

    overall_score:       7.5,
    hero_score:          7.8,
    content_score:       7.2,
    zielgruppe_score:    8.1,
    conversion_score:    7.5,
    struktur_score:      7.0,
    search_intent_score: 7.3,
    wettbewerb_score:    6.8,

    industry_fit_summary: 'Die Landingpage erfüllt branchentypische Standards für Buchhaltungssoftware im DACH-Markt weitgehend: Steuerkonformität, Finanzamts-Schnittstelle und gesetzlich geforderte Rechnungsformate werden kommuniziert. Branchenübliche Sicherheitszertifikate und Datenschutznachweise fehlen jedoch im sichtbaren Seitenbereich – für ein Produkt, das sensible Finanzdaten verarbeitet, ein relevanter Vertrauensnachteil.',

    dach_fit_summary: 'Die Zielgruppenansprache ist konsistent und für den DACH-Markt passend. Compliance-relevante Themen wie gesetzliche Buchführungspflichten und die aktuelle E-Rechnungspflicht werden prominent aufgegriffen. Schwäche: Datenschutz- und Sicherheitsnachweise sind nicht als eigenständige Trust-Sektion sichtbar – ein Standard, den DACH-Käufer bei Finanzsoftware erwarten.',

    exec_staerken: `<ul>
      <li><strong>Zielgruppe wird in der Hauptüberschrift direkt adressiert:</strong> Die H1 benennt die Kernzielgruppe explizit. Situationsspezifische Formulierungen erzeugen sofortige Wiedererkennbarkeit bei der angestrebten Nutzergruppe.</li>
      <li><strong>Dreifache Risikoumkehr direkt unter dem primären CTA:</strong> Testlaufzeit, fehlende Zahlungspflicht und dauerhafter Gratis-Tarif werden in einem Satz am Entscheidungspunkt kommuniziert – alle zentralen Einwände sind adressiert.</li>
      <li><strong>FAQ deckt kaufentscheidende Fragen vollständig ab:</strong> Preisstruktur, Gesetzeskonformität und Datenmigration werden beantwortet. Interessenten können die Kaufentscheidung treffen, ohne die Seite zu verlassen.</li>
      <li><strong>Aktuelle Gesetzgebung als Positionierungssignal:</strong> Die laufende Pflicht zur elektronischen Rechnungsstellung wird prominent aufgegriffen und vermittelt regulatorische Kompetenz.</li>
    </ul>`,

    exec_schwaechen: `<ul>
      <li><strong>Sicherheits- und Datenschutznachweise fehlen als visuelle Elemente:</strong> Gesetzeskonformität und Datensicherheit werden nur im Fließtext erwähnt, nicht als eigenständige Badge-Sektion. Für ein Produkt, das Finanzdaten verarbeitet, ist das ein erheblicher Vertrauensnachteil.</li>
      <li><strong>Preisangaben nur in der FAQ auffindbar:</strong> Transaktionale Nutzer müssen aktiv nach den Kosten suchen, statt sie im natürlichen Seitenfluss zu finden.</li>
      <li><strong>Hauptüberschrift kommuniziert keine messbaren Ergebnisse:</strong> Das Subheading listet Funktionen auf, ohne ein konkretes Outcome-Versprechen wie quantifizierte Zeitersparnis oder Kostenreduktion zu nennen.</li>
    </ul>`,

    hero_summary: 'Der Hero adressiert die Zielgruppe klar und greift typische Probleme der Nutzergruppe mit treffenden Formulierungen auf. Der primäre CTA passt zum Conversion-Ziel. Ein Produktscreenshot macht die Lösung greifbar. Größter Hebel: Weder Hauptüberschrift noch Subheading kommunizieren ein messbares Ergebnis.',

    hero_staerken: `<ul>
      <li><strong>Hauptüberschrift adressiert Kernzielgruppe direkt:</strong> Nutzer verstehen sofort, für wen das Produkt gedacht ist – keine Interpretationsarbeit nötig</li>
      <li><strong>CTA passt zum Conversion-Ziel:</strong> Kostenloser Einstieg mit klarer Risikoumkehr – hohe Entscheidungsbereitschaft durch Signal der Verbindlichkeitsfreiheit</li>
      <li><strong>Produktvisualisierung im Hero:</strong> Ein Dashboard-Screenshot macht die Lösung greifbar statt eines generischen Stock-Fotos</li>
      <li><strong>Bewertungsplattform-Signal direkt unterhalb des Heroes:</strong> Eine hohe Bewertung mit großer Rezensionsanzahl wird vor dem ersten Scroll sichtbar positioniert</li>
    </ul>`,

    hero_schwaechen: `<ul>
      <li><strong>Kein messbares Ergebnis im Hero kommuniziert:</strong> Das Subheading listet Funktionen auf, ohne quantifizierte Zeitersparnis oder Kostenvorteil zu nennen</li>
      <li><strong>Sicherheitszertifikate fehlen oberhalb des CTA:</strong> Keine Datenschutz- oder Compliance-Badges vor der Kaufentscheidung sichtbar</li>
      <li><strong>Fehlende Risikofreiheits-Signale am CTA selbst:</strong> Der Button-Text kommuniziert nicht explizit die Verbindlichkeitsfreiheit</li>
    </ul>`,

    hero_empfehlungen: `<ul>
      <li>🔴 <strong>CRITICAL – Outcome in die Hauptüberschrift integrieren:</strong> Messbares Ergebnis ergänzen, z.B. Zeitersparnis pro Woche oder Vereinfachung des Steuerberater-Prozesses. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – Datenschutz- und Compliance-Badges unter dem Hero:</strong> Gesetzeskonformitäts-Badge, Datenschutz-Nachweis und Sicherheitszertifikat als eigenständige Zeile direkt unter dem CTA. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – Risikofreiheit am CTA verstärken:</strong> Button-Text um kurzen Hinweis auf Verbindlichkeitsfreiheit ergänzen. Aufwand: Gering.</li>
    </ul>`,

    content_summary: 'Der Content kommuniziert funktionalen Nutzen klar und adressiert Compliance-Ängste überzeugend. Eine umfangreiche FAQ deckt kaufentscheidende Fragen ab. Kundenstimmen sind vorhanden, aber ohne messbare Ergebnisse. Größter Hebel: Den Business Case quantifizieren – konkrete Zeitersparnis-Zahlen oder ein Kostenvergleich würden die Überzeugungskraft deutlich steigern.',

    content_staerken: `<ul>
      <li><strong>Nutzenversprechen auf funktionaler und emotionaler Ebene:</strong> Konkrete Prozessbeschreibungen und alltagsnahe Formulierungen adressieren typische Ängste von Gründern ohne Buchhaltungskenntnisse</li>
      <li><strong>Kundenstimmen mit vollständiger Attribution:</strong> Testimonials mit Namens- und Unternehmensangabe wirken authentischer als anonyme Zitate</li>
      <li><strong>FAQ deckt kaufentscheidende Fragen vollständig ab:</strong> Preismodell, Gesetzeskonformität und Datenmigration werden adressiert</li>
      <li><strong>Quantifizierter Social Proof:</strong> Eine konkrete Kundenzahl im sechsstelligen Bereich dient als klares Marktakzeptanz-Signal</li>
    </ul>`,

    content_schwaechen: `<ul>
      <li><strong>Business Case nicht quantifiziert:</strong> Keine konkreten Zeitersparnis-Angaben und kein Vergleich zu manueller Buchhaltung oder externen Kosten</li>
      <li><strong>Kundenstimmen ohne messbare Ergebnisse:</strong> Testimonials beschreiben subjektive Zufriedenheit statt konkreter Verbesserungen</li>
      <li><strong>Kein Transformationsversprechen:</strong> Der Content bleibt auf funktionaler Ebene – ein übergeordnetes Versprechen für das Geschäftsleben der Nutzer fehlt</li>
    </ul>`,

    content_empfehlungen: `<ul>
      <li>🟡 <strong>HIGH – Business Case quantifizieren:</strong> Durchschnittliche Zeitersparnis pro Monat oder typische Kosteneinsparung gegenüber externen Alternativen kommunizieren. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – Testimonials mit konkreten Zahlen anreichern:</strong> Bestehende Kunden nach messbaren Ergebnissen befragen. Ein Testimonial mit spezifischer Stunden- oder Kostenersparnis steigert die Überzeugungskraft erheblich. Aufwand: Gering.</li>
      <li>🟢 <strong>MEDIUM – Übergeordnetes Transformationsversprechen ergänzen:</strong> Vision kommunizieren, die über die Softwarefunktion hinausgeht. Aufwand: Gering.</li>
    </ul>`,

    zielgruppe_summary: 'Die primäre Zielgruppe wird explizit in der Hauptüberschrift adressiert und durch zwei differenzierte Nutzer-Szenarien weiter geschärft. Alltagsnahe Problemformulierungen erzeugen hohe Wiedererkennbarkeit.',

    zielgruppe_staerken: `<ul>
      <li><strong>Explizite Zielgruppenansprache in der Hauptüberschrift:</strong> Keine Interpretationsarbeit nötig – die Zielgruppe erkennt sich sofort</li>
      <li><strong>Zwei differenzierte Nutzer-Szenarien:</strong> Neugründer und etablierte Selbstständige werden mit separaten Inhalten angesprochen</li>
      <li><strong>Alltagsnahe Problemformulierungen:</strong> Typische Buchhaltungs-Situationen werden treffend beschrieben und erzeugen sofortige Identifikation</li>
    </ul>`,

    zielgruppe_schwaechen: `<ul>
      <li><strong>Kleinunternehmen mit Teamstruktur nicht adressiert:</strong> Nutzer mit ersten Mitarbeitern oder komplexeren Strukturen finden keine spezifischen Inhalte</li>
      <li><strong>Branchenspezifische Beispiele fehlen:</strong> Keine differenzierten Inhalte für verschiedene Selbstständigen-Typen wie Handwerk, Kreativberufe oder Dienstleistung</li>
    </ul>`,

    zielgruppe_empfehlungen: `<ul>
      <li>🟡 <strong>HIGH – Branchenspezifische Beispiele ergänzen:</strong> Drei bis vier Branchen-Szenarien mit je einem typischen Pain Point. Aufwand: Mittel.</li>
      <li>🟢 <strong>MEDIUM – Persona-Pfade stärker differenzieren:</strong> Separate CTAs für Neugründer und etablierte Selbstständige. Aufwand: Gering.</li>
    </ul>`,

    conversion_summary: 'Der primäre CTA ist klar und prominent mit Risikoumkehr versehen. Ein dauerhaft kostenloser Einstieg senkt die Hemmschwelle erheblich. Größter Hebel: Preisangaben sind nicht im natürlichen Seitenfluss sichtbar.',

    conversion_staerken: `<ul>
      <li><strong>Dreifache Risikoumkehr direkt unter dem CTA:</strong> Testlaufzeit, fehlende Zahlungspflicht und dauerhafter Gratis-Tarif in einem Satz – alle zentralen Einwände adressiert</li>
      <li><strong>Dauerhaft kostenloser Einstieg als Fallback:</strong> Reduziert die Hemmschwelle für preissensible Nutzer erheblich</li>
      <li><strong>CTA-Wiederholung nach der Einwandbehandlung:</strong> Conversion-Element direkt nach der FAQ platziert – im richtigen Entscheidungsmoment</li>
    </ul>`,

    conversion_schwaechen: `<ul>
      <li><strong>Preisangaben nicht im natürlichen Seitenfluss:</strong> Kosteninformationen sind nur in der FAQ auffindbar – transaktionale Nutzer müssen aktiv danach suchen</li>
      <li><strong>Kein persistenter CTA auf Mobile:</strong> Bei der Seitenlänge fehlt ein dauerhaft sichtbarer Conversion-Einstiegspunkt auf kleinen Bildschirmen</li>
    </ul>`,

    conversion_empfehlungen: `<ul>
      <li>🔴 <strong>CRITICAL – Preisangaben in den Content-Flow integrieren:</strong> Einstiegspreis als sichtbares Element unterhalb der Feature-Sektion ergänzen. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – Persistenter CTA auf Mobile:</strong> Floating-Button auf dem Mobile-Breakpoint. Aufwand: Mittel.</li>
    </ul>`,

    struktur_summary: 'Die Seitenstruktur folgt einem bewährten Aufmerksamkeits-Interesse-Wunsch-Handlungs-Muster. Die Navigation zwischen Sektionen ist logisch. Größter Hebel: Übermäßige Seitenlänge und redundante Inhalte reduzieren.',

    struktur_staerken: `<ul>
      <li><strong>Klare Seitenstruktur nach bewährtem Muster:</strong> Hero → Problem → Lösung → Social Proof → FAQ → CTA – logisch und konversionserprobt</li>
      <li><strong>Visueller Rhythmus durch abwechselnde Layouts:</strong> Karten, Listen und Kundenstimmen unterbrechen den Textfluss sinnvoll</li>
    </ul>`,

    struktur_schwaechen: `<ul>
      <li><strong>Übermäßige Seitenlänge:</strong> Redundante Feature-Wiederholungen und mehrfach platzierte CTAs erzeugen Entscheidungsmüdigkeit</li>
      <li><strong>Trust-Sektion fehlt als eigenständiger Block:</strong> Sicherheits- und Datenschutzinformationen sind über die Seite verteilt statt gebündelt</li>
    </ul>`,

    struktur_empfehlungen: `<ul>
      <li>🟡 <strong>HIGH – Trust-Sektion direkt nach dem Hero:</strong> Eigenständige Badge-Zeile mit Compliance- und Datenschutznachweisen direkt unterhalb des Hero-Bereichs. Aufwand: Gering.</li>
      <li>🟢 <strong>MEDIUM – Redundante Sektionen konsolidieren:</strong> Feature-Wiederholungen entfernen und Gesamtlänge reduzieren. Aufwand: Mittel.</li>
    </ul>`,

    search_intent_bewertung: 'Der Search Intent für das analysierte Keyword ist primär transaktional mit starkem kommerziellem Anteil. Die Landingpage adressiert diesen Intent gut durch direkten Trial-CTA und Preisinformationen in der FAQ. Schwäche: Der informationale Intent von Nutzern in frühen Recherchephasen wird nicht adressiert, was potenzielle Kunden in der Evaluierungsphase verliert.',

    search_intent_empfehlungen: `<ul>
      <li>🟡 <strong>HIGH – Informationalen Intent ergänzen:</strong> Kurze Einführung für Nutzer ohne Buchhaltungsvorkenntnisse. Aufwand: Mittel.</li>
      <li>🟢 <strong>MEDIUM – Häufige Folge-Suchanfragen stärker adressieren:</strong> Eigene Sektion für typische Anschlussthemen wie vereinfachte Einnahmen-Überschuss-Rechnung. Aufwand: Gering.</li>
    </ul>`,

    wettbewerb_summary: 'DACH-spezifische Positionierung als Differenzierungsmerkmal klar kommuniziert. Aktuelle Gesetzgebung als Alleinstellungsmerkmal stark genutzt. Schwäche: Ein direkter Vergleich mit Wettbewerbern fehlt – Nutzer, die mehrere Lösungen evaluieren, erhalten keine strukturierte Entscheidungshilfe.',

    wettbewerb_staerken: `<ul>
      <li><strong>Aktuelle Gesetzgebung als Alleinstellungsmerkmal:</strong> Technische Details zur elektronischen Rechnungspflicht demonstrieren regulatorische Kompetenz</li>
      <li><strong>Quantifizierter Social Proof:</strong> Kundenzahl im sechsstelligen Bereich als klares Marktakzeptanz-Signal</li>
      <li><strong>Landesspezifische Integration als DACH-Vorteil:</strong> Direkte Anbindung an deutsche Steuerbehörden als echtes Differenzierungsmerkmal gegenüber internationalen Alternativen</li>
    </ul>`,

    wettbewerb_schwaechen: `<ul>
      <li><strong>Kein strukturierter Wettbewerbsvergleich:</strong> Nutzer, die mehrere Lösungen evaluieren, erhalten keine Entscheidungshilfe auf der Seite</li>
      <li><strong>Differenzierung gegenüber internationalen Tools fehlt:</strong> Warum eine DACH-spezifische Lösung gegenüber internationalen Alternativen? – nicht adressiert</li>
    </ul>`,

    wettbewerb_empfehlungen: `<ul>
      <li>🟡 <strong>HIGH – Vergleichssektion ergänzen:</strong> Tabelle mit den fünf wichtigsten Unterschieden zu etablierten Desktop-Lösungen und internationalen Alternativen. Aufwand: Mittel.</li>
      <li>🟢 <strong>MEDIUM – Einstieg aus manuellen Prozessen direkt adressieren:</strong> Kurze Sektion für Nutzer, die aktuell noch mit Tabellen oder Papier arbeiten. Aufwand: Gering.</li>
    </ul>`,

    performance_summary: 'Performance auf Desktop sehr gut. Mobile Performance durch mehrere synchron ladende Drittanbieter-Skripte beeinträchtigt. Core Web Vitals Desktop im grünen Bereich, Mobile optimierungsbedürftig.',

    performance_desktop: 'Desktop-Performance nahezu perfekt. Largest Contentful Paint und First Contentful Paint laden sehr schnell. Layout-Stabilität minimal beeinträchtigt. Einziger Optimierungspunkt: Das LCP-Bild könnte mit einem Priorisierungs-Attribut schneller geladen werden.',

    performance_mobile: 'Mobile Performance kritisch beeinträchtigt durch synchron ladende Drittanbieter-Skripte. Consent-Management und Buchungstool blockieren den Rendering-Prozess. Lazy Loading für unterhalb des sichtbaren Bereichs liegende Bilder nicht konsequent aktiviert.',

    performance_empfehlungen: `<ul>
      <li>🔴 <strong>CRITICAL – Consent-Management asynchron laden:</strong> Das Consent-Tool auf asynchrones Laden umstellen – eliminiert Render-Blocking auf Mobile. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – Buchungstool verzögert initialisieren:</strong> Das eingebettete Buchungstool erst beim Scroll-Trigger laden statt beim Seitenload. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – LCP-Bild priorisieren:</strong> Hero-Bild mit Lade-Priorisierungs-Attribut versehen. Aufwand: Gering.</li>
    </ul>`,

    ai_bewertung: 'AI Readiness moderat. Grundlegende strukturierte Daten sind vorhanden, aber unvollständig. Das Schema für häufig gestellte Fragen fehlt trotz umfangreicher FAQ-Sektion. Non-Commodity-Gehalt schwach – generische Aussagen dominieren statt einzigartiger, belegbarer Inhalte, die von KI-Systemen bevorzugt zitiert werden.',

    ai_staerken: `<ul>
      <li><strong>Grundlegende strukturierte Daten vorhanden:</strong> Basisauszeichnung für Organisation und Softwareprodukt ermöglicht maschinenlesbare Einordnung durch KI-Crawler</li>
      <li><strong>Klare Produktdefinition:</strong> Produktkategorie und Zielgruppe sind eindeutig kommuniziert – KI-Systeme können die Seite kontextuell einordnen</li>
    </ul>`,

    ai_schwaechen: `<ul>
      <li><strong>FAQ-Schema fehlt:</strong> Die umfangreiche FAQ-Sektion ist nicht mit dem entsprechenden strukturierten Datenformat ausgezeichnet – KI-Systeme können Antworten nicht direkt zitieren</li>
      <li><strong>Non-Commodity-Gehalt schwach:</strong> Alle zentralen Aussagen sind generisch – keine eigenen Daten, keine messbaren Kundenergebnisse, die exklusiv auf diese Quelle zurückführen</li>
      <li><strong>Videoinhalte nicht strukturiert ausgezeichnet:</strong> Vorhandene Videoinhalte fehlen als maschinenlesbare Videoobjekte</li>
    </ul>`,

    ai_empfehlungen: `<ul>
      <li>🔴 <strong>CRITICAL – FAQ-Schema ergänzen:</strong> Alle FAQ-Einträge mit dem entsprechenden JSON-LD-Format auszeichnen. Ermöglicht direkte Zitation in KI-Antworten und AI Overviews. Aufwand: Gering.</li>
      <li>🔴 <strong>CRITICAL – Non-Commodity-Gehalt erhöhen:</strong> Zwei bis drei Kundenfälle mit messbaren Ergebnissen ergänzen. KI-Systeme bevorzugen Seiten mit einzigartigen, belegbaren Inhalten. Aufwand: Mittel.</li>
      <li>🟡 <strong>HIGH – Videoinhalte strukturiert auszeichnen:</strong> Produktdemo-Video mit dem entsprechenden JSON-LD-Format versehen. Aufwand: Gering.</li>
    </ul>`,

    roadmap: `<ul>
      <li>🔴 <strong>SOFORT UMSETZEN (Sehr hoher Impact • Geringer Aufwand):</strong> Hauptüberschrift auf messbares Ergebnis umschreiben – konkretes Outcome-Versprechen statt Funktionsauflistung.<br><small>💡 Quantifizierte Zeitersparnis oder Vereinfachung eines typischen Prozesses als Kernaussage. Aufwand: Gering.</small></li>
      <li>🔴 <strong>SOFORT UMSETZEN (Sehr hoher Impact • Geringer Aufwand):</strong> FAQ-Schema für alle Einträge ergänzen – ermöglicht direkte Zitation durch KI-Systeme und AI Overviews.<br><small>💡 JSON-LD im Head-Bereich, alle Fragen und Antworten strukturiert auszeichnen. Aufwand: Gering.</small></li>
      <li>🔴 <strong>SOFORT UMSETZEN (Sehr hoher Impact • Geringer Aufwand):</strong> Consent-Management asynchron laden – eliminiert Render-Blocking auf Mobile und verbessert Mobile-Performance erheblich.<br><small>💡 Async-Attribut im entsprechenden Script-Tag setzen. Aufwand: Gering.</small></li>
      <li>🟡 <strong>ALS NÄCHSTES (Hoher Impact • Geringer Aufwand):</strong> Trust-Badge-Sektion direkt nach dem Hero: Compliance-, Datenschutz- und Sicherheitsnachweise als visuelle Elemente.<br><small>💡 Drei Badges in einer Zeile, direkt unterhalb des Hero-CTAs. Aufwand: Gering.</small></li>
      <li>🟡 <strong>ALS NÄCHSTES (Hoher Impact • Geringer Aufwand):</strong> Einstiegspreis in den Content-Flow integrieren – Kosteninformation als sichtbares Element im natürlichen Seitenfluss.<br><small>💡 Preisangabe unterhalb der Feature-Sektion ergänzen. Aufwand: Gering.</small></li>
      <li>🟡 <strong>ALS NÄCHSTES (Hoher Impact • Mittlerer Aufwand):</strong> Kundenstimmen mit messbaren Ergebnissen anreichern – bestehende Kunden nach konkreten Verbesserungen befragen.<br><small>💡 Ziel: Zeitersparnis in Stunden pro Monat oder reduzierte externe Kosten. Aufwand: Mittel.</small></li>
      <li>🟢 <strong>SPÄTER (Mittlerer Impact • Mittlerer Aufwand):</strong> Wettbewerbsvergleich als dedizierte Sektion ergänzen – strukturierte Entscheidungshilfe für evaluierende Nutzer.<br><small>💡 Tabelle mit fünf Differenzierungsmerkmalen gegenüber etablierten Alternativen. Aufwand: Mittel.</small></li>
      <li>🟢 <strong>SPÄTER (Mittlerer Impact • Mittlerer Aufwand):</strong> Non-Commodity-Gehalt für AI-Sichtbarkeit erhöhen – einzigartige, belegbare Inhalte aus bestehenden Kundendaten destillieren.<br><small>💡 Konkrete Nutzerdaten aufbereiten und als exklusive Insights kommunizieren. Aufwand: Mittel.</small></li>
    </ul>`,
  };

  // ── CSS ─────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('cvz-bsp-styles')) return;
    var s = document.createElement('style');
    s.id = 'cvz-bsp-styles';
    s.textContent = `
      .cvz-section{max-width:1200px;margin:0 auto;padding:0 24px 32px;font-family:'Geist','DM Sans','Segoe UI',sans-serif;color:#e2e8f0;}
      .cvz-section *{box-sizing:border-box;}
      @media(prefers-reduced-motion:reduce){
        .cvz-fi{animation:none!important;opacity:1!important;transform:none!important;}
        .cvz-bf{animation:none!important;width:var(--bw)!important;}
        .cvz-ring{animation:none!important;opacity:1!important;transform:none!important;}
        *{transition:none!important;}
      }
      .cvz-fi{opacity:0;transform:translateY(14px);animation:cvzFI .55s ease forwards;}
      .cvz-fi-1{animation-delay:.05s}.cvz-fi-2{animation-delay:.15s}
      .cvz-fi-3{animation-delay:.25s}.cvz-fi-4{animation-delay:.35s}
      .cvz-fi-5{animation-delay:.45s}.cvz-fi-6{animation-delay:.55s}
      @keyframes cvzFI{to{opacity:1;transform:translateY(0)}}
      @keyframes cvzBar{from{width:0}to{width:var(--bw)}}
      @keyframes cvzRing{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}
      .cvz-heading-wrap{max-width:1200px;margin:0 auto;padding:56px 24px 24px;text-align:center;}
      .cvz-heading-wrap,.cvz-heading-wrap *{line-height:1.2!important;}
      .cvz-heading-title{font-size:clamp(36px,6vw,80px);font-weight:800;letter-spacing:-.02em;color:rgba(148,163,184,.25);text-transform:uppercase;line-height:1!important;margin-bottom:12px;}
      .cvz-heading-sub{font-size:14px;color:#718096;line-height:1.6!important;max-width:640px;margin:8px auto 0;}
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
      .cvz-cat-header{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:20px;}
      .cvz-cat-name{font-size:18px;font-weight:700;color:#f0f4f8;letter-spacing:-.01em;}
      .cvz-cat-score{font-size:22px;font-weight:700;font-family:'Geist','DM Mono',monospace;color:#e8edf5!important;}
      .cvz-cards{display:flex;flex-direction:column;gap:12px;margin-bottom:8px;}
      .cvz-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:18px 20px;transition:border-color .2s,background .2s;}
      .cvz-card:hover{border-color:rgba(79,209,197,.2);background:rgba(79,209,197,.02);}
      .cvz-card-label{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:7px;}
      .cvz-card-label-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
      .cvz-card-body{font-size:14px;color:#c4cdd6;line-height:1.65;}
      .cvz-card-body p{margin:0 0 6px}.cvz-card-body p:last-child{margin-bottom:0}
      .cvz-card-body ul,.cvz-card-body ol{padding-left:18px;margin:0}
      .cvz-card-body li{margin-bottom:8px;color:#e8edf5;font-size:14px;}
      .cvz-card-body strong{color:#e2e8f0}
      .cvz-card-summary .cvz-card-label{color:#718096}.cvz-card-summary .cvz-card-label-dot{background:#718096}
      .cvz-card-staerken .cvz-card-label{color:#4fd1c5}.cvz-card-staerken .cvz-card-label-dot{background:#4fd1c5}
      .cvz-card-schwaechen .cvz-card-label{color:#ef4444}.cvz-card-schwaechen .cvz-card-label-dot{background:#ef4444}
      .cvz-card-empfehlungen .cvz-card-label{color:#718096}.cvz-card-empfehlungen .cvz-card-label-dot{background:#718096}
      .cvz-card-empfehlungen .cvz-card-body,.cvz-card-empfehlungen .cvz-card-body *{color:#e8edf5!important;font-size:14px!important;}
      .cvz-card-empfehlungen .cvz-card-body strong{color:#fff!important;}
      .cvz-exec-panel{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:24px 28px;display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px;}
      .cvz-ring{flex-shrink:0;text-align:center;animation:cvzRing .75s cubic-bezier(.34,1.56,.64,1) .15s both;}
      .cvz-ring-c{width:96px;height:96px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;}
      .cvz-ring-n{font-size:30px;font-weight:700;line-height:1;}
      .cvz-ring-d{font-size:11px;color:#718096;margin-top:2px;}
      .cvz-ring-l{font-size:10px;color:#4a5568;margin-top:8px;letter-spacing:.08em;text-transform:uppercase;}
      .cvz-bars{flex:1;min-width:200px;}
      .cvz-br{display:flex;align-items:center;gap:8px;margin-bottom:7px;cursor:default;}
      .cvz-br:last-child{margin-bottom:0}
      .cvz-bl{font-size:13px;color:#718096;width:100px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s;}
      .cvz-br:hover .cvz-bl{color:#e2e8f0}
      .cvz-bt{flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;}
      .cvz-bf{height:100%;border-radius:3px;width:0;background:#4fd1c5;opacity:.75;animation:cvzBar 1s cubic-bezier(.4,0,.2,1) .65s forwards;transition:opacity .15s,filter .15s;}
      .cvz-br:hover .cvz-bf{opacity:1;filter:brightness(1.15)}
      .cvz-bv{font-size:14px;font-family:'Geist','DM Mono',monospace;width:32px;text-align:right;flex-shrink:0;color:#4fd1c5;}
      .cvz-badges{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
      .cvz-badge{flex:1;min-width:150px;background:rgba(79,209,197,.05);border:1px solid rgba(79,209,197,.18);border-radius:12px;padding:13px 15px;transition:border-color .2s,background .2s,transform .2s;cursor:default;}
      .cvz-badge:hover{border-color:rgba(79,209,197,.32);background:rgba(79,209,197,.08);transform:translateY(-1px)}
      .cvz-badge-h{display:flex;align-items:center;gap:7px;margin-bottom:7px;}
      .cvz-badge-dot{width:6px;height:6px;border-radius:50%;background:#4fd1c5;flex-shrink:0;}
      .cvz-badge-t{font-size:11px;font-weight:600;color:#4fd1c5;letter-spacing:.05em;text-transform:uppercase;}
      .cvz-badge-tx{font-size:14px;color:#718096;line-height:1.55;}
      .cvz-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;}
      .cvz-info-row{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;gap:4px;padding-right:24px;}
      .cvz-info-row:nth-last-child(-n+2){border-bottom:none;}
      .cvz-info-row:last-child{border-bottom:none!important;}
      .cvz-info-label{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#4a5568!important;}
      .cvz-info-value{font-size:14px;color:#c4cdd6!important;line-height:1.5;word-break:break-all;}
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
      .section-hero-info,.section-executive-summary,.section-deep-dive-hero,
      .section-deep-dive-content,.section-deep-dive-zielgruppe,.section-deep-dive-conversion,
      .section-deep-dive-struktur,.section-deep-dive-searchintent,.section-deep-dive-differenzierung,
      .section-deep-dive-performance,.section-deep-dive-ai,.section-roadmap,.section-ki-agent-btn{
        padding:0!important;margin:0!important;display:block!important;
        width:100%!important;flex-direction:unset!important;align-items:unset!important;
        justify-content:unset!important;gap:unset!important;
      }
      @media(max-width:768px){
        .cvz-section{padding:0 16px 24px;}
        .cvz-exec-panel{flex-direction:column;align-items:center;padding:20px 16px;gap:20px;}
        .cvz-ring{width:100%;display:flex;flex-direction:column;align-items:center;}
        .cvz-bars{width:100%;}
        .cvz-badges{flex-direction:column;}
        .cvz-badge{min-width:100%;flex:1 1 100%;}
        .cvz-bl{width:76px;}
        .cvz-info-grid{grid-template-columns:1fr;}
        .cvz-info-row:nth-last-child(-n+2){border-bottom:1px solid rgba(255,255,255,.05);}
        .cvz-info-row:last-child{border-bottom:none!important;}
        .cvz-heading-wrap{padding:40px 16px 20px;}
      }
    `;
    document.head.appendChild(s);
  }

  // ── XSS-Sanitization ────────────────────────────────────────────────────────
  function sanitize(html) {
    if (!html) return '';
    var allowed = {p:1,br:1,strong:1,b:1,em:1,i:1,ul:1,ol:1,li:1,span:1,small:1};
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('*').forEach(function(el) {
      if (!allowed[el.tagName.toLowerCase()]) {
        el.replaceWith(document.createTextNode(el.textContent)); return;
      }
      Array.from(el.attributes).forEach(function(attr) {
        if (attr.name !== 'class') el.removeAttribute(attr.name);
      });
    });
    return tmp.innerHTML;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getRingColor(s) {
    if (!s) return '#4a5568';
    if (s >= 8)  return '#10b981';
    if (s >= 6)  return '#3b82f6';
    if (s >= 4)  return '#f59e0b';
    return '#ef4444';
  }
  function getRingBg(s) {
    if (!s) return 'rgba(74,85,104,0.08)';
    if (s >= 8)  return 'rgba(16,185,129,0.08)';
    if (s >= 6)  return 'rgba(59,130,246,0.08)';
    if (s >= 4)  return 'rgba(245,158,11,0.08)';
    return 'rgba(239,68,68,0.08)';
  }

  function card(type, label, content) {
    if (!content) return '';
    var cls = {summary:'cvz-card-summary',staerken:'cvz-card-staerken',schwaechen:'cvz-card-schwaechen',empfehlungen:'cvz-card-empfehlungen'}[type]||'';
    return '<div class="cvz-card '+cls+' cvz-fi cvz-fi-3"><div class="cvz-card-label"><div class="cvz-card-label-dot"></div>'+label.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div><div class="cvz-card-body">'+sanitize(content)+'</div></div>';
  }

  function buildCatSection(name, score, cards) {
    var color = getRingColor(score);
    var display = score ? score.toFixed(1) : '–';
    return '<div class="cvz-section cvz-fi cvz-fi-2"><div class="cvz-cat-header"><div class="cvz-cat-name">'+name+'</div><div class="cvz-cat-score">'+display+'</div></div><div class="cvz-cards">'+cards+'</div></div>';
  }

  function inject(selector, html) {
    var el = document.querySelector(selector);
    if (el) el.innerHTML = html;
  }

  function heading(selector, title, sub) {
    var el = document.querySelector(selector);
    if (!el) return;
    var wrap = document.createElement('div');
    wrap.className = 'cvz-heading-wrap';
    wrap.innerHTML = '<div class="cvz-heading-title">'+title+'</div>'+(sub?'<div class="cvz-heading-sub">'+sub+'</div>':'');
    el.insertBefore(wrap, el.firstChild);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function render() {
    injectStyles();
    var d = DATA;

    // Anker-Navigation
    (function() {
      // Webflow-Nav-Höhe messen und als top setzen
      function setNavTop(anchorNav) {
        var webflowNav = document.querySelector('.navbar-2-member');
        anchorNav.style.top = webflowNav ? webflowNav.offsetHeight + 'px' : '0px';
      }

      var nav = document.createElement('nav');
      nav.className = 'cvz-anchor-nav';
      nav.setAttribute('aria-label', 'Analyse-Navigation');
      var links = [
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
        links.map(function(l){ return '<a href="'+l.href+'">'+l.label+'</a>'; }).join('')+
        '</div>';
      // Smooth scroll mit Nav-Offset
      nav.querySelectorAll('a').forEach(function(a) {
        a.addEventListener('click', function(e) {
          var id = a.getAttribute('href').replace('#','');
          var target = document.getElementById(id);
          if (!target) return;
          e.preventDefault();
          var offset = nav.offsetHeight + 16;
          var top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({top:top, behavior:'smooth'});
        });
      });
      var first = document.querySelector('.section-hero-info') ||
                  document.querySelector('.section-executive-summary');
      if (first) first.parentNode.insertBefore(nav, first);

      setNavTop(nav);
      window.addEventListener('resize', function() { setNavTop(nav); });
      var wfNav = document.querySelector('.navbar-2-member');
      if (wfNav && window.ResizeObserver) {
        new ResizeObserver(function() { setNavTop(nav); }).observe(wfNav);
      }

      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            nav.querySelectorAll('a').forEach(function(a){ a.classList.remove('cvz-nav-active'); });
            var active = nav.querySelector('a[href="#'+entry.target.id+'"]');
            if (active) {
              active.classList.add('cvz-nav-active');
              active.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
            }
          }
        });
      }, {rootMargin:'-20% 0px -70% 0px'});

      ['cvz-exec','cvz-hero','cvz-content','cvz-zielgruppe','cvz-conversion',
       'cvz-struktur','cvz-search','cvz-diff','cvz-perf','cvz-roadmap'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) observer.observe(el);
      });
    })();

    // Hero Info
    inject('.section-hero-info',
      '<div class="cvz-section cvz-fi cvz-fi-1">'+
      '<div style="background:rgba(79,209,197,.05);border:1px solid rgba(79,209,197,.15);border-radius:10px;padding:12px 16px;margin-bottom:12px;font-size:13px;color:#718096;line-height:1.6;">'+
      'Die folgende Analyse zeigt das vollständige Convertlyze-Ausgabeformat anhand eines fiktiven, anonymisierten DACH-SaaS-Anbieters im Buchhaltungs-Segment. Alle Markennamen, Zitate und konkreten Kennzahlen wurden generalisiert.'+
      '</div>'+
      '<div class="cvz-card" style="padding:20px 24px;"><div class="cvz-info-grid">'+
      '<div class="cvz-info-row"><div class="cvz-info-label">Keyword</div><div class="cvz-info-value">'+d.keyword+'</div></div>'+
      '<div class="cvz-info-row"><div class="cvz-info-label">URL</div><div class="cvz-info-value">'+d.url+'</div></div>'+
      '<div class="cvz-info-row"><div class="cvz-info-label">Zielgruppe</div><div class="cvz-info-value">'+d.target_audience+'</div></div>'+
      '<div class="cvz-info-row"><div class="cvz-info-label">Conversion-Ziel</div><div class="cvz-info-value">'+d.conversion_goal+'</div></div>'+
      '<div class="cvz-info-row"><div class="cvz-info-label">Branche</div><div class="cvz-info-value">'+d.industry+'</div></div>'+
      '<div class="cvz-info-row"><div class="cvz-info-label">Angebotstyp</div><div class="cvz-info-value">'+d.business_type+'</div></div>'+
      '<div class="cvz-info-row"><div class="cvz-info-label">Search Intent</div><div class="cvz-info-value">'+d.search_intent+'</div></div>'+
      '<div class="cvz-info-row"><div class="cvz-info-label">Analyse vom</div><div class="cvz-info-value">'+d.created_at+'</div></div>'+
      '</div></div></div>');

    // Executive Summary
    var rColor = getRingColor(d.overall_score);
    var rBg    = getRingBg(d.overall_score);
    var cats = [
      {label:'Hero',score:d.hero_score},{label:'Content',score:d.content_score},
      {label:'Zielgruppe',score:d.zielgruppe_score},{label:'Conversion',score:d.conversion_score},
      {label:'Struktur',score:d.struktur_score},{label:'Search Intent',score:d.search_intent_score},
      {label:'Differenzierung',score:d.wettbewerb_score},
    ];
    var bars = cats.map(function(c){
      var pct = ((c.score/10)*100).toFixed(1);
      return '<div class="cvz-br"><div class="cvz-bl">'+c.label+'</div><div class="cvz-bt"><div class="cvz-bf" style="--bw:'+pct+'%;"></div></div><div class="cvz-bv">'+c.score.toFixed(1)+'</div></div>';
    }).join('');

    function execSec(type, items) {
      var isS = type==='staerken';
      var color = isS?'#4fd1c5':'#ef4444';
      var iconBg = isS?'rgba(79,209,197,.14)':'rgba(239,68,68,.14)';
      var icon = isS?'✓':'▲';
      var title = isS?'Stärken':'Größte Hebel';
      var cardCls = isS?'cvz-card-staerken':'cvz-card-schwaechen';
      var fadeCls = isS?'cvz-fi-4':'cvz-fi-5';
      return '<div class="cvz-fi '+fadeCls+'" style="margin-bottom:16px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:11px;"><div style="width:22px;height:22px;border-radius:6px;background:'+iconBg+';color:'+color+';display:flex;align-items:center;justify-content:center;font-size:11px;">'+icon+'</div><div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:'+color+';">'+title+'</div></div><div class="cvz-cards"><div class="cvz-card '+cardCls+'"><div class="cvz-card-body">'+items+'</div></div></div></div>';
    }

    inject('.section-executive-summary',
      '<div class="cvz-section">'+
      '<div class="cvz-exec-panel cvz-fi cvz-fi-2"><div class="cvz-ring"><div class="cvz-ring-c" style="border:3px solid '+rColor+';background:'+rBg+';"><div class="cvz-ring-n" style="color:'+rColor+';">'+d.overall_score.toFixed(1)+'</div><div class="cvz-ring-d">/10</div></div><div class="cvz-ring-l">Gesamt</div></div><div class="cvz-bars">'+bars+'</div></div>'+
      '<div class="cvz-badges cvz-fi cvz-fi-3"><div class="cvz-badge"><div class="cvz-badge-h"><div class="cvz-badge-dot"></div><div class="cvz-badge-t">Industry Fit</div></div><div class="cvz-badge-tx">'+d.industry_fit_summary+'</div></div><div class="cvz-badge"><div class="cvz-badge-h"><div class="cvz-badge-dot"></div><div class="cvz-badge-t">DACH Market Fit</div></div><div class="cvz-badge-tx">'+d.dach_fit_summary+'</div></div></div>'+
      execSec('staerken',   d.exec_staerken)+
      execSec('schwaechen', d.exec_schwaechen)+
      '</div>');

    // Deep Dive
    inject('.section-deep-dive-hero', buildCatSection('Hero', d.hero_score,
      card('summary','Zusammenfassung','<p>'+d.hero_summary+'</p>')+
      card('staerken','Stärken',d.hero_staerken)+
      card('schwaechen','Schwächen',d.hero_schwaechen)+
      card('empfehlungen','Priorisierte Handlungsempfehlungen',d.hero_empfehlungen)));

    inject('.section-deep-dive-content', buildCatSection('Content', d.content_score,
      card('summary','Zusammenfassung','<p>'+d.content_summary+'</p>')+
      card('staerken','Stärken',d.content_staerken)+
      card('schwaechen','Schwächen',d.content_schwaechen)+
      card('empfehlungen','Priorisierte Handlungsempfehlungen',d.content_empfehlungen)));

    inject('.section-deep-dive-zielgruppe', buildCatSection('Zielgruppe', d.zielgruppe_score,
      card('summary','Zusammenfassung','<p>'+d.zielgruppe_summary+'</p>')+
      card('staerken','Stärken',d.zielgruppe_staerken)+
      card('schwaechen','Schwächen',d.zielgruppe_schwaechen)+
      card('empfehlungen','Priorisierte Handlungsempfehlungen',d.zielgruppe_empfehlungen)));

    inject('.section-deep-dive-conversion', buildCatSection('Conversion', d.conversion_score,
      card('summary','Zusammenfassung','<p>'+d.conversion_summary+'</p>')+
      card('staerken','Stärken',d.conversion_staerken)+
      card('schwaechen','Schwächen',d.conversion_schwaechen)+
      card('empfehlungen','Priorisierte Handlungsempfehlungen',d.conversion_empfehlungen)));

    inject('.section-deep-dive-struktur', buildCatSection('Struktur', d.struktur_score,
      card('summary','Zusammenfassung','<p>'+d.struktur_summary+'</p>')+
      card('staerken','Stärken',d.struktur_staerken)+
      card('schwaechen','Schwächen',d.struktur_schwaechen)+
      card('empfehlungen','Priorisierte Handlungsempfehlungen',d.struktur_empfehlungen)));

    inject('.section-deep-dive-searchintent', buildCatSection('Search Intent', d.search_intent_score,
      card('summary','Bewertung','<p>'+d.search_intent_bewertung+'</p>')+
      card('empfehlungen','Priorisierte Handlungsempfehlungen',d.search_intent_empfehlungen)));

    inject('.section-deep-dive-differenzierung', buildCatSection('Differenzierung', d.wettbewerb_score,
      card('summary','Zusammenfassung','<p>'+d.wettbewerb_summary+'</p>')+
      card('staerken','Stärken',d.wettbewerb_staerken)+
      card('schwaechen','Schwächen',d.wettbewerb_schwaechen)+
      card('empfehlungen','Priorisierte Handlungsempfehlungen',d.wettbewerb_empfehlungen)));

    inject('.section-deep-dive-performance', buildCatSection('Performance', 2.8,
      card('summary','Zusammenfassung','<p>'+d.performance_summary+'</p>')+
      card('summary','Desktop','<p>'+d.performance_desktop+'</p>')+
      card('summary','Mobil','<p>'+d.performance_mobile+'</p>')+
      card('empfehlungen','Priorisierte Handlungsempfehlungen',d.performance_empfehlungen)));

    inject('.section-deep-dive-ai', buildCatSection('AI Sichtbarkeit', 5.8,
      card('summary','Zusammenfassung','<p>'+d.ai_bewertung+'</p>')+
      card('staerken','Stärken',d.ai_staerken)+
      card('schwaechen','Schwächen',d.ai_schwaechen)+
      card('empfehlungen','Priorisierte Handlungsempfehlungen',d.ai_empfehlungen)));

    inject('.section-roadmap',
      '<div class="cvz-section cvz-fi cvz-fi-2"><div class="cvz-cat-header"><div class="cvz-cat-name">Roadmap</div></div><div class="cvz-cards">'+
      card('empfehlungen','Priorisierte Handlungsempfehlungen',d.roadmap)+
      '</div></div>');

    // ── Beispiel-PDF URL hier eintragen nach Upload ────────────────────────
    // Einfach die URL ersetzen, dann pushen + Cache leeren.
    var BEISPIEL_PDF_URL = 'https://cdn.prod.website-files.com/68aa0ecac3a6a586fee94df1/6a1741fa7607ff99c484a389_Convertlyze%20%E2%80%93%20Beispielanalyse.pdf';

    var pdfBtnHtml = BEISPIEL_PDF_URL !== 'PLACEHOLDER'
      ? '<a href="' + BEISPIEL_PDF_URL + '" class="cvz-pdf-btn" target="_blank" rel="noopener" aria-label="Beispiel-PDF herunterladen">'+
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v13m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'+
        ' Beispiel-PDF</a>'
      : '';

    inject('.section-ki-agent-btn',
      '<div class="cvz-ki-btn-wrap">'+
      '<a href="https://www.convertlyze.com/register" class="cvz-ki-btn" aria-label="Eigene Landingpage analysieren">'+
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="8" width="12" height="10" rx="2" fill="currentColor" opacity=".9"/><circle cx="9" cy="12" r="1.5" fill="#0d1117"/><circle cx="15" cy="12" r="1.5" fill="#0d1117"/><rect x="10" y="15" width="4" height="1.5" rx=".75" fill="#0d1117"/><rect x="11" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".9"/><circle cx="12" cy="5" r="2" fill="currentColor" opacity=".9"/></svg>'+
      ' Eigene Landingpage analysieren</a>'+
      pdfBtnHtml+
      '</div>');

    // Überschriften nach allen Renders
    heading('.section-hero-info',            'Beispielanalyse', '');
    heading('.section-executive-summary',    'Executive Summary', 'Die wichtigsten Erkenntnisse auf einen Blick');
    heading('.section-deep-dive-hero',       'Deep Dive', 'Detaillierte Analyse jeder Kategorie');
    heading('.section-deep-dive-performance','Performance &amp; AI Sichtbarkeit', 'Performance und AI Readiness fließen nicht in den Gesamt-Score ein. Performance-Optimierungen erfordern meist hauptsächlich technische Umsetzung. Bei AI Readiness ist es gemischt – strukturierte Daten brauchen Entwicklungs-Support, Inhaltsstruktur und Semantik kannst du direkt selbst angehen.');
    heading('.section-roadmap',              'Roadmap', 'Die wichtigsten Maßnahmen, sortiert nach Impact und Aufwand.');

    // Anker-IDs setzen
    var anchorMap = {
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
    Object.keys(anchorMap).forEach(function(sel) {
      var el = document.querySelector(sel);
      if (el) el.id = anchorMap[sel];
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

    console.log('✅ Beispielanalyse gerendert');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

})();
