/**
 * Convertlyze – Statische Beispielanalyse
 * Basiert auf der das Tool-Analyse von convertlyze.com/content-hub/beispielanalyse
 * Kein dynamisches Laden – alle Daten sind fest eingebaut.
 *
 * Einbindung in Webflow Before </body>:
 * <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@main/beispielanalyse.js"></script>
 *
 * Webflow-Klassen (leere Divs):
 *   section-hero-info
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

  // ── Statische Analyse-Daten (das Tool) ──────────────────────────────────────
  var DATA = {
    keyword:          'Buchhaltungssoftware für Gründer',
    url:              'das Tool.de',
    target_audience:  'Gründer und Selbstständige',
    conversion_goal:  'Kostenlose Testversion (Trial)',
    industry:         'FinTech / Buchhaltungssoftware für KMU und Selbstständige',
    business_type:    'SaaS',
    search_intent:    'Transactional',
    created_at:       '13.05.2026, 18:57',

    overall_score:    7.5,
    hero_score:       7.8,
    content_score:    7.2,
    zielgruppe_score: 8.1,
    conversion_score: 7.5,
    struktur_score:   7.0,
    search_intent_score: 7.3,
    wettbewerb_score: 6.8,

    industry_fit_summary: 'Die Landingpage erfüllt typische Standards für Buchhaltungssoftware im DACH-Raum weitgehend: GoBD-Konformität, ELSTER-Schnittstelle, DATEV-Integration und E-Rechnungsformate (ZUGFeRD, XRechnung) sind branchenübliche Pflichtfeatures und werden kommuniziert. Branchenübliche Compliance-Zertifikate wie ISO 27001 oder explizite DSGVO-Nachweise fehlen jedoch im sichtbaren Seitenbereich, was für Buchhaltungssoftware im deutschen Markt ein relevanter Standard ist.',
    dach_fit_summary: 'Die Landingpage spricht Gründer und Selbstständige konsequent per Du an, was für eine moderne SaaS-Lösung im DACH-Raum passend ist. Positiv: GoBD-Konformität wird mehrfach erwähnt, ELSTER-Integration adressiert ein spezifisch deutsches Compliance-Bedürfnis, und die E-Rechnungspflicht wird prominent aufgegriffen. Schwäche: ISO 27001-Zertifizierung und DSGVO-Konformitätsnachweise sind nicht prominent platziert.',

    exec_staerken: `<ul>
      <li><strong>Zielgruppen-Adressierung mit hoher Wiedererkennbarkeit:</strong> Die H1 „Buchhaltung für smarte Gründer und Selbstständige" adressiert die Kernzielgruppe direkt. Situationsspezifische Formulierungen wie „Schuhkarton zum Steuerberater" erzeugen sofortige Identifikation.</li>
      <li><strong>Dreifache Risikoumkehr direkt unter dem primären CTA:</strong> „14 Tage alle Funktionen. Ohne Kreditkarte. Danach kostenlos" adressiert alle drei zentralen Einwände am Entscheidungspunkt.</li>
      <li><strong>FAQ deckt alle kaufentscheidenden Einwände ab:</strong> Pricing, GoBD-Konformität und Datenmigration werden vollständig adressiert. Konkrete Preisangaben ermöglichen Gründern eine Budgeteinschätzung ohne Seitenwechsel.</li>
      <li><strong>E-Rechnungspflicht als Compliance-Signal:</strong> Dedizierter Pill-Banner sowie eigene Sektion mit technischen Details (ZUGFeRD, XRechnung) positionieren das Tool als regulatorisch führend.</li>
    </ul>`,

    exec_schwaechen: `<ul>
      <li><strong>Trust-Zertifizierungen fehlen als visuelle Vertrauenssignale:</strong> GoBD-Konformität, DSGVO und Datensicherheit werden nur im Fließtext erwähnt, nicht als Badge-Sektion. Für Gründer, die sensible Finanzdaten anvertrauen, ist das ein erheblicher Vertrauensnachteil.</li>
      <li><strong>Pricing nur über FAQ zugänglich:</strong> Konkrete Preise (ab 12,90 €/Monat) sind ausschließlich in der FAQ auffindbar. Gründer mit kauforientiertem Search Intent müssen aktiv danach suchen.</li>
      <li><strong>Hero-Subheadline kommuniziert Tätigkeiten statt Ergebnisse:</strong> Das Subheading listet Funktionen auf ohne konkretes Outcome-Versprechen. Ein messbares Ergebnis wie quantifizierte Zeitersparnis fehlt vollständig.</li>
    </ul>`,

    hero_summary: 'Hero kommuniziert Zielgruppe klar und adressiert Kernprobleme mit situationsspezifischen Formulierungen. CTA passt zum Conversion-Ziel Trial. Dashboard-Mockup macht Lösung greifbar. Größter Hebel: Outcome-Kommunikation fehlt – weder H1 noch Subheading zeigen messbares Ergebnis wie Zeitersparnis oder Steuerberater-Kosten-Reduktion.',
    hero_staerken: `<ul>
      <li><strong>H1 adressiert Kernzielgruppe direkt:</strong> „Buchhaltung für smarte Gründer und Selbstständige" – User verstehen sofort, für wen das Produkt ist</li>
      <li><strong>CTA passt zum Conversion-Ziel:</strong> „Jetzt kostenlos testen" mit klarer Risikoumkehr – hohe Entscheidungsbereitschaft durch Freiheit-Signal</li>
      <li><strong>Visuelles Element zeigt Produkt:</strong> Dashboard-Screenshot macht die Lösung greifbar, kein generisches Stock-Foto</li>
      <li><strong>Vertrauenssignal direkt im Hero:</strong> ProvenExpert-Bewertung mit 4,96/5 Sternen unterhalb des Hero platziert</li>
    </ul>`,
    hero_schwaechen: `<ul>
      <li><strong>Kein Outcome im Hero kommuniziert:</strong> Subheading listet Funktionen auf statt messbares Ergebnis – kein Zeitersparnis-Versprechen, keine Kostenreduktion</li>
      <li><strong>Trust-Zertifikate fehlen oberhalb CTA:</strong> Keine ISO 27001 oder DSGVO-Badges vor der Entscheidung sichtbar</li>
      <li><strong>Keine Risikoumkehr beim CTA:</strong> „Jetzt testen" ohne „kein Risiko"-Signal erhöht Hemmschwelle</li>
    </ul>`,
    hero_empfehlungen: `<ul>
      <li>🔴 <strong>CRITICAL – Outcome in die H1:</strong> Ergänze messbares Ergebnis, z.B. „Buchhaltung erledigt in 20 Minuten pro Woche – für Gründer und Selbstständige". Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – Trust-Badges unter dem Hero:</strong> GoBD-Badge, DSGVO-konform und ISO 27001 als eigenständige Zeile direkt unter dem CTA einfügen. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – Risikoumkehr verstärken:</strong> CTA-Button um „Kein Risiko • Kein Vertrag" ergänzen. Aufwand: Gering.</li>
    </ul>`,

    content_summary: 'Content kommuniziert funktionalen Nutzen klar und adressiert Compliance-Ängste überzeugend. FAQ deckt kaufentscheidende Fragen ab. Testimonials vorhanden, aber ohne messbare Ergebnisse. Größter Hebel: Business Case quantifizieren – konkrete Zeitersparnis-Zahlen oder Steuerberater-Kosten-Vergleich würden Überzeugungskraft deutlich steigern.',
    content_staerken: `<ul>
      <li><strong>Nutzenversprechen auf funktionaler und emotionaler Ebene:</strong> „Rechnungen in unter 2 Minuten", „Umsatzsteuer-Voranmeldung direkt ans Finanzamt" – adressiert typische Ängste von Gründern ohne Buchhaltungskenntnisse</li>
      <li><strong>Proof Points mit Attribution:</strong> Mehrere Testimonials mit vollständiger Namens- und Unternehmensangabe – authentische Kundenstimmen mit konkreten Vorher-Nachher-Beschreibungen</li>
      <li><strong>FAQ deckt kaufentscheidende Fragen ab:</strong> Pricing, Eignung, GoBD-Konformität und Datenmigration vollständig adressiert</li>
      <li><strong>Quantifizierter Social Proof:</strong> „Über 150.000 Unternehmen setzen auf das Tool" als klares Vertrauenssignal</li>
    </ul>`,
    content_schwaechen: `<ul>
      <li><strong>Business Case nicht quantifiziert:</strong> Keine konkreten Zeitersparnis-Zahlen auf Seitenebene, kein Vergleich zu manueller Buchhaltung oder Steuerberater-Kosten</li>
      <li><strong>Testimonials ohne messbare Ergebnisse:</strong> Kundenstimmen beschreiben Gefühle statt Fakten – „macht fast schon Spaß" überzeugt weniger als konkrete Zahlen</li>
      <li><strong>Kein Transformationsversprechen:</strong> Content bleibt auf funktionaler Ebene – Vision wie das Tool das Business grundlegend verändert fehlt</li>
    </ul>`,
    content_empfehlungen: `<ul>
      <li>🟡 <strong>HIGH – Business Case quantifizieren:</strong> Ergänze Zeitersparnis-Aussage: „Gründer sparen durchschnittlich X Stunden pro Monat" oder Steuerberater-Kosten-Ersparnis. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – Testimonials mit Zahlen anreichern:</strong> Bestehende Kunden aktiv nach konkreten Zahlen fragen. Ein Testimonial mit „spare 4 Stunden pro Monat" steigert Überzeugungskraft deutlich. Aufwand: Gering.</li>
      <li>🟢 <strong>MEDIUM – Transformationsversprechen ergänzen:</strong> „Damit du dich auf das konzentrieren kannst, wofür du gegründet hast – nicht auf Buchhaltung." Aufwand: Gering.</li>
    </ul>`,

    zielgruppe_summary: 'Primäre Zielgruppe wird explizit in der H1 adressiert und durch zwei differenzierte Personas weiter geschärft. Situationsspezifische Formulierungen wie „Schuhkarton zum Steuerberater" erzeugen hohe Wiedererkennbarkeit.',
    zielgruppe_staerken: `<ul>
      <li><strong>Explizite Zielgruppenansprache in der H1:</strong> „Buchhaltung für smarte Gründer und Selbstständige" – keine Interpretationsarbeit nötig</li>
      <li><strong>Zwei differenzierte Personas:</strong> Neugründer vs. etablierte Selbstständige mit separaten Content-Pfaden</li>
      <li><strong>Situationsspezifische Sprache:</strong> „Schuhkarton zum Steuerberater" und „Zettelwirtschaft" erzeugen sofortige Identifikation</li>
    </ul>`,
    zielgruppe_schwaechen: `<ul>
      <li><strong>B2B-Segment unterentwickelt:</strong> Freelancer mit Teamstruktur oder kleine GmbHs werden nicht explizit adressiert</li>
      <li><strong>Branchen-Spezifität fehlt:</strong> Keine branchenspezifischen Beispiele für Handwerker, Agenturen oder Kreative</li>
    </ul>`,
    zielgruppe_empfehlungen: `<ul>
      <li>🟡 <strong>HIGH – Branchenspezifische Beispiele ergänzen:</strong> 3-4 Branchen-Kacheln (Handwerk, Agentur, Freelancer, E-Commerce) mit je einem spezifischen Pain Point. Aufwand: Mittel.</li>
      <li>🟢 <strong>MEDIUM – Persona-Pfade stärker trennen:</strong> Dedizierte CTAs für Neugründer vs. bestehende Selbstständige. Aufwand: Gering.</li>
    </ul>`,

    conversion_summary: 'Primärer CTA klar und prominent mit Risikoumkehr. Free-Tarif als Differenzierungsmerkmal senkt Einstiegshürde erheblich. Größter Hebel: Pricing nicht im natürlichen Seitenfluss sichtbar.',
    conversion_staerken: `<ul>
      <li><strong>Dreifache Risikoumkehr direkt unter CTA:</strong> „14 Tage. Ohne Kreditkarte. Danach kostenlos" – alle Einwände in einem Satz</li>
      <li><strong>Free-Tarif als Fallback:</strong> Dauerhaft kostenloses Angebot senkt Einstiegshürde erheblich</li>
      <li><strong>CTA-Wiederholung im richtigen Moment:</strong> Trial-Banner nach FAQ platziert – direkt nach Einwandbehandlung</li>
    </ul>`,
    conversion_schwaechen: `<ul>
      <li><strong>Pricing nicht im natürlichen Seitenfluss:</strong> Preise nur in FAQ auffindbar – transaktionale Nutzer müssen aktiv suchen</li>
      <li><strong>Kein Sticky-CTA auf Mobile:</strong> Bei langer Seite kein persistenter Conversion-Einstiegspunkt</li>
    </ul>`,
    conversion_empfehlungen: `<ul>
      <li>🔴 <strong>CRITICAL – Pricing in den Content-Flow integrieren:</strong> „Ab 12,90 €/Monat" als sichtbares Element unterhalb der Feature-Sektion ergänzen. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – Sticky CTA auf Mobile:</strong> Floating Button „Kostenlos testen" auf Mobile-Breakpoint. Aufwand: Mittel.</li>
    </ul>`,

    struktur_summary: 'Seitenstruktur folgt einem klaren AIDA-Muster. Navigation zwischen Sektionen logisch. Größter Hebel: Excessive Seitenlänge und redundante Inhalte reduzieren.',
    struktur_staerken: `<ul>
      <li><strong>Klare AIDA-Struktur:</strong> Hero → Problem → Lösung → Social Proof → FAQ → CTA – logisch und bewährt</li>
      <li><strong>Visueller Rhythmus durch abwechselnde Layouts:</strong> Cards, Listen und Testimonials unterbrechen den Textfluss sinnvoll</li>
    </ul>`,
    struktur_schwaechen: `<ul>
      <li><strong>Übermäßige Seitenlänge:</strong> Redundante Wiederholungen von Features und CTAs erzeugen Entscheidungsmüdigkeit</li>
      <li><strong>Trust-Sektion fehlt als eigenständiger Block:</strong> Zertifikate und Sicherheitshinweise verteilt statt gebündelt</li>
    </ul>`,
    struktur_empfehlungen: `<ul>
      <li>🟡 <strong>HIGH – Trust-Sektion direkt nach Hero:</strong> Eigenständige Badge-Zeile mit GoBD, DSGVO, ISO 27001 nach dem Hero-Bereich. Aufwand: Gering.</li>
      <li>🟢 <strong>MEDIUM – Redundante Sektionen konsolidieren:</strong> Feature-Wiederholungen entfernen, Seite um ~20% kürzen. Aufwand: Mittel.</li>
    </ul>`,

    search_intent_bewertung: 'Search Intent „Buchhaltungssoftware für Gründer" ist primär transaktional mit starkem commercial Intent. Die Landingpage adressiert diesen Intent gut durch direkten Trial-CTA und Preistransparenz in der FAQ. Schwäche: Informationaler Intent (Wie funktioniert Buchhaltung?) wird nicht adressiert, was Nutzer in frühen Phasen verliert.',
    search_intent_empfehlungen: `<ul>
      <li>🟡 <strong>HIGH – Informationalen Intent ergänzen:</strong> Kurze „So funktioniert Buchhaltung mit das Tool"-Sektion für Gründer ohne Vorkenntnisse. Aufwand: Mittel.</li>
      <li>🟢 <strong>MEDIUM – Sub-Intent „EÜR für Selbstständige" stärker adressieren:</strong> Eigene Sektion für EÜR als häufige Suchanfrage. Aufwand: Gering.</li>
    </ul>`,

    wettbewerb_summary: 'DACH-Optimierung als Differenzierungsmerkmal klar kommuniziert. E-Rechnungspflicht als Alleinstellungsmerkmal stark. Schwäche: Direktvergleich mit Wettbewerbern fehlt – Nutzer, die Lexware oder DATEV evaluieren, erhalten keinen strukturierten Vergleich.',
    wettbewerb_staerken: `<ul>
      <li><strong>E-Rechnungspflicht als Alleinstellungsmerkmal:</strong> Technische Details (ZUGFeRD, XRechnung, EN 16931) demonstrieren Compliance-Führerschaft</li>
      <li><strong>Quantifizierter Social Proof:</strong> „150.000+ Unternehmen" als klare Marktführerschaft-Signal</li>
      <li><strong>ELSTER-Integration als DACH-spezifischer Vorteil:</strong> Direkte Verbindung zum deutschen Finanzamt als echtes Differenzierungsmerkmal</li>
    </ul>`,
    wettbewerb_schwaechen: `<ul>
      <li><strong>Kein Wettbewerbsvergleich:</strong> Nutzer, die Lexware oder DATEV evaluieren, erhalten keinen strukturierten Vergleich</li>
      <li><strong>Differenzierung gegen internationale Tools fehlt:</strong> Warum das Tool statt QuickBooks oder FreeAgent? – nicht adressiert</li>
    </ul>`,
    wettbewerb_empfehlungen: `<ul>
      <li>🟡 <strong>HIGH – Vergleichssektion ergänzen:</strong> „das Tool vs. Lexware vs. DATEV" – Tabelle mit den 5 wichtigsten Unterscheidungsmerkmalen. Aufwand: Mittel.</li>
      <li>🟢 <strong>MEDIUM – „Warum nicht Excel?" direkt adressieren:</strong> Kurze Sektion für Gründer, die noch mit Excel arbeiten. Aufwand: Gering.</li>
    </ul>`,

    performance_summary: 'Performance auf Desktop sehr gut. Mobile Performance durch Drittanbieter-Skripte (Cookiebot, Calendly) beeinträchtigt. Core Web Vitals Desktop im grünen Bereich, Mobile optimierungsbedürftig.',
    performance_desktop: 'Desktop-Performance nahezu perfekt. LCP unter 1,5s, CLS minimal, FID sehr gering. Hauptoptimierungspunkt: LCP-Bild könnte mit fetchpriority="high" priorisiert werden.',
    performance_mobile: 'Mobile Performance kritisch beeinträchtigt durch synchron ladende Drittanbieter-Skripte. Cookiebot und Calendly blockieren Rendering. Lazy Loading für Below-fold-Bilder nicht konsequent aktiviert.',
    performance_empfehlungen: `<ul>
      <li>🔴 <strong>CRITICAL – Cookiebot asynchron laden:</strong> Usercentrics/Cookiebot auf asynchrones Laden umstellen – eliminiert Render-Blocking auf Mobile. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – Calendly verzögert laden:</strong> Calendly-Widget erst bei Scroll-Trigger initialisieren statt beim Seitenload. Aufwand: Gering.</li>
      <li>🟡 <strong>HIGH – fetchpriority="high" für Hero-Bild:</strong> LCP-Bild mit fetchpriority-Attribut priorisieren. Aufwand: Gering.</li>
    </ul>`,

    ai_bewertung: 'AI Readiness moderat. Strukturierte Daten (Organization, SoftwareApplication) vorhanden, aber unvollständig. FAQ-Schema fehlt trotz umfangreicher FAQ-Sektion. Non-Commodity-Gehalt schwach – generische Claims dominieren statt einzigartiger, belegbarer Inhalte.',
    ai_staerken: `<ul>
      <li><strong>Organization-Schema vorhanden:</strong> Grundlegende strukturierte Daten für AI-Crawler maschinenlesbar</li>
      <li><strong>Klare Produktdefinition:</strong> Produktkategorie und Zielgruppe eindeutig kommuniziert – AI-Systeme können Seite kontextuell einordnen</li>
    </ul>`,
    ai_schwaechen: `<ul>
      <li><strong>FAQ-Schema fehlt:</strong> Umfangreiche FAQ-Sektion nicht mit FAQPage-Schema ausgezeichnet – AI Overviews können Antworten nicht direkt zitieren</li>
      <li><strong>Non-Commodity-Gehalt schwach:</strong> Alle zentralen Claims sind generisch – keine eigenen Daten, keine messbaren Kundenfälle</li>
      <li><strong>Kein VideoObject-Schema:</strong> Vorhandene Videos nicht strukturiert ausgezeichnet</li>
    </ul>`,
    ai_empfehlungen: `<ul>
      <li>🔴 <strong>CRITICAL – FAQPage-Schema ergänzen:</strong> Alle FAQ-Items mit FAQPage JSON-LD auszeichnen. Ermöglicht direkte Zitation in AI Overviews. Aufwand: Gering.</li>
      <li>🔴 <strong>CRITICAL – Non-Commodity-Gehalt erhöhen:</strong> 2-3 Kundenfälle mit messbaren Ergebnissen (gesparte Stunden, reduzierte Steuerberaterkosten). Aufwand: Mittel.</li>
      <li>🟡 <strong>HIGH – VideoObject-Schema:</strong> Produktdemo-Video mit JSON-LD auszeichnen. Aufwand: Gering.</li>
    </ul>`,

    roadmap: `<ul>
      <li>🔴 <strong>SOFORT UMSETZEN (Sehr hoher Impact • Geringer Aufwand):</strong> Hero-Subheadline auf Outcome umschreiben – „Buchhaltung in 20 Minuten pro Woche" statt Funktions-Auflistung.<br><small>💡 Konkrete Zeitersparnis oder Kosteneinsparung als Hauptversprechen. Aufwand: Gering.</small></li>
      <li>🔴 <strong>SOFORT UMSETZEN (Sehr hoher Impact • Geringer Aufwand):</strong> FAQPage-Schema für alle FAQ-Items ergänzen – ermöglicht direkte Zitation in AI Overviews.<br><small>💡 JSON-LD im Head-Bereich, alle Fragen/Antworten strukturiert auszeichnen. Aufwand: Gering.</small></li>
      <li>🔴 <strong>SOFORT UMSETZEN (Sehr hoher Impact • Geringer Aufwand):</strong> Cookiebot asynchron laden – eliminiert Render-Blocking auf Mobile und verbessert Mobile-Performance erheblich.<br><small>💡 async-Attribut im Script-Tag setzen. Aufwand: Gering.</small></li>
      <li>🟡 <strong>ALS NÄCHSTES (Hoher Impact • Geringer Aufwand):</strong> Trust-Badge-Sektion direkt nach Hero: GoBD-konform, DSGVO, ISO 27001 als visuelle Elemente.<br><small>💡 3 Badges in einer Zeile, direkt unterhalb des Hero-CTAs. Aufwand: Gering.</small></li>
      <li>🟡 <strong>ALS NÄCHSTES (Hoher Impact • Geringer Aufwand):</strong> Pricing in den Content-Flow integrieren – „Ab 12,90 €/Monat" als sichtbares Element im Seitenfluss.<br><small>💡 Preisangabe unterhalb der Feature-Sektion ergänzen. Aufwand: Gering.</small></li>
      <li>🟡 <strong>ALS NÄCHSTES (Hoher Impact • Mittlerer Aufwand):</strong> Testimonials mit messbaren Ergebnissen anreichern – bestehende Kunden nach konkreten Zahlen fragen.<br><small>💡 Ziel: „spart X Stunden/Monat" oder „reduziert Steuerberaterkosten um Y €". Aufwand: Mittel.</small></li>
      <li>🟢 <strong>SPÄTER (Mittlerer Impact • Mittlerer Aufwand):</strong> Wettbewerbsvergleich das Tool vs. Lexware vs. DATEV als dedizierte Sektion ergänzen.<br><small>💡 Tabelle mit 5 Differenzierungsmerkmalen. Aufwand: Mittel.</small></li>
      <li>🟢 <strong>SPÄTER (Mittlerer Impact • Mittlerer Aufwand):</strong> Non-Commodity-Gehalt erhöhen: 2-3 Kundenfälle mit messbaren Ergebnissen für AI-Sichtbarkeit.<br><small>💡 Konkrete Zahlen aus bestehenden Testimonials destillieren. Aufwand: Mittel.</small></li>
    </ul>`,
  };

  // ── CSS injizieren ──────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('cvz-bsp-styles')) return;
    var s = document.createElement('style');
    s.id = 'cvz-bsp-styles';
    s.textContent = `
      /* ── Design System ── */
      .cvz-section{max-width:1200px;margin:0 auto;padding:0 24px 32px;font-family:'DM Sans','Segoe UI',sans-serif;color:#e2e8f0;}
      .cvz-section *{box-sizing:border-box;}

      /* Fade-in */
      .cvz-fi{opacity:0;transform:translateY(14px);animation:cvzFI .55s ease forwards;}
      .cvz-fi-1{animation-delay:.05s}.cvz-fi-2{animation-delay:.15s}
      .cvz-fi-3{animation-delay:.25s}.cvz-fi-4{animation-delay:.35s}
      .cvz-fi-5{animation-delay:.45s}.cvz-fi-6{animation-delay:.55s}
      @keyframes cvzFI{to{opacity:1;transform:translateY(0)}}
      @keyframes cvzBar{from{width:0}to{width:var(--bw)}}
      @keyframes cvzRing{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}

      /* Überschriften */
      .cvz-heading-wrap{max-width:1200px;margin:0 auto;padding:56px 24px 24px;text-align:center;}
      .cvz-heading-wrap,.cvz-heading-wrap *{line-height:1.2!important;}
      .cvz-heading-title{font-size:clamp(36px,6vw,80px);font-weight:800;letter-spacing:-.02em;color:rgba(148,163,184,.25);text-transform:uppercase;line-height:1!important;margin-bottom:12px;}
      .cvz-heading-sub{font-size:14px;color:#718096;line-height:1.6!important;max-width:640px;margin:8px auto 0;}

      /* Kategorie-Header */
      .cvz-cat-header{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:20px;}
      .cvz-cat-name{font-size:18px;font-weight:700;color:#f0f4f8;letter-spacing:-.01em;}
      .cvz-cat-score{font-size:22px;font-weight:700;font-family:'DM Mono',monospace;color:#e8edf5!important;}

      /* Karten */
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
      .cvz-card-schwaechen .cvz-card-label{color:#ff6b6b}.cvz-card-schwaechen .cvz-card-label-dot{background:#ff6b6b}
      .cvz-card-empfehlungen .cvz-card-label{color:#718096}.cvz-card-empfehlungen .cvz-card-label-dot{background:#718096}
      .cvz-card-empfehlungen .cvz-card-body,.cvz-card-empfehlungen .cvz-card-body *{color:#e8edf5!important;font-size:14px!important;}
      .cvz-card-empfehlungen .cvz-card-body strong{color:#fff!important;}

      /* Executive Summary: Score Panel */
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
      .cvz-bv{font-size:14px;font-family:'DM Mono',monospace;width:32px;text-align:right;flex-shrink:0;color:#4fd1c5;}

      /* Badges */
      .cvz-badges{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
      .cvz-badge{flex:1;min-width:150px;background:rgba(79,209,197,.05);border:1px solid rgba(79,209,197,.18);border-radius:12px;padding:13px 15px;transition:border-color .2s,background .2s,transform .2s;cursor:default;}
      .cvz-badge:hover{border-color:rgba(79,209,197,.32);background:rgba(79,209,197,.08);transform:translateY(-1px)}
      .cvz-badge-h{display:flex;align-items:center;gap:7px;margin-bottom:7px;}
      .cvz-badge-dot{width:6px;height:6px;border-radius:50%;background:#4fd1c5;flex-shrink:0;}
      .cvz-badge-t{font-size:11px;font-weight:600;color:#4fd1c5;letter-spacing:.05em;text-transform:uppercase;}
      .cvz-badge-tx{font-size:14px;color:#718096;line-height:1.55;}

      /* Info Grid */
      .cvz-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;}
      .cvz-info-row{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;gap:4px;padding-right:24px;}
      .cvz-info-row:nth-last-child(-n+2){border-bottom:none;}
      .cvz-info-row:last-child{border-bottom:none!important;}
      .cvz-info-label{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#4a5568!important;}
      .cvz-info-value{font-size:14px;color:#c4cdd6!important;line-height:1.5;word-break:break-all;}

      /* KI-Agent Button */
      .cvz-ki-btn-wrap{text-align:center;padding:32px 24px;max-width:1200px;margin:0 auto;}
      .cvz-ki-btn{display:inline-block;background:#4fd1c5;color:#0d1117;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:8px;transition:background .2s,transform .2s,box-shadow .2s;cursor:pointer;}
      .cvz-ki-btn:hover{background:#38b2ac;transform:translateY(-2px);box-shadow:0 8px 24px rgba(79,209,197,.25);}

      /* Webflow-Wrapper resetten */
      .section-hero-info,.section-executive-summary,.section-deep-dive-hero,
      .section-deep-dive-content,.section-deep-dive-zielgruppe,.section-deep-dive-conversion,
      .section-deep-dive-struktur,.section-deep-dive-searchintent,.section-deep-dive-differenzierung,
      .section-deep-dive-performance,.section-deep-dive-ai,.section-roadmap,.section-ki-agent-btn{
        padding:0!important;margin:0!important;display:block!important;
      }

      /* Responsive */
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

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getRingColor(s) {
    if (!s) return '#4a5568';
    if (s >= 7.5) return '#4fd1c5';
    if (s >= 5.5) return '#f6c90e';
    return '#ff6b6b';
  }
  function getRingBg(s) {
    if (!s) return 'rgba(74,85,104,0.08)';
    if (s >= 7.5) return 'rgba(79,209,197,0.08)';
    if (s >= 5.5) return 'rgba(246,201,14,0.08)';
    return 'rgba(255,107,107,0.08)';
  }

  function card(type, label, content) {
    if (!content) return '';
    var cls = {summary:'cvz-card-summary',staerken:'cvz-card-staerken',schwaechen:'cvz-card-schwaechen',empfehlungen:'cvz-card-empfehlungen'}[type]||'';
    return '<div class="cvz-card '+cls+' cvz-fi cvz-fi-3"><div class="cvz-card-label"><div class="cvz-card-label-dot"></div>'+label+'</div><div class="cvz-card-body">'+content+'</div></div>';
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

    // Hero Info
    inject('.section-hero-info',
      '<div class="cvz-section cvz-fi cvz-fi-1"><div class="cvz-card" style="padding:20px 24px;"><div class="cvz-info-grid">'+
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
    var rBg = getRingBg(d.overall_score);
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
      var color = isS?'#4fd1c5':'#ff6b6b';
      var iconBg = isS?'rgba(79,209,197,.14)':'rgba(255,107,107,.14)';
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
      execSec('staerken', d.exec_staerken)+
      execSec('schwaechen', d.exec_schwaechen)+
      '</div>');

    // Deep Dive Kategorien
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

    inject('.section-ki-agent-btn',
      '<div class="cvz-ki-btn-wrap"><a href="https://www.convertlyze.com/register" class="cvz-ki-btn">Eigene Landingpage analysieren →</a></div>');

    // Überschriften – nach allen Renders
    heading('.section-hero-info',         'Beispielanalyse', '');
    heading('.section-executive-summary', 'Executive Summary', 'Die wichtigsten Erkenntnisse auf einen Blick');
    heading('.section-deep-dive-hero',    'Deep Dive', 'Detaillierte Analyse jeder Kategorie');
    heading('.section-deep-dive-performance', 'Performance &amp; AI Sichtbarkeit', 'Performance und AI Readiness fließen nicht in den Gesamt-Score ein. Performance-Optimierungen erfordern meist hauptsächlich technische Umsetzung. Bei AI Readiness ist es gemischt – strukturierte Daten brauchen Entwicklungs-Support, Inhaltsstruktur und Semantik kannst du direkt selbst angehen.');
    heading('.section-roadmap', 'Roadmap', 'Die wichtigsten Maßnahmen, sortiert nach Impact und Aufwand.');

    console.log('✅ Beispielanalyse gerendert');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

})();
