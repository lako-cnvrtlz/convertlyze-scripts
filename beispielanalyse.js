/**
 * Convertlyze – Statische Beispielanalyse (echte Analyse, anonymisiert) v3
 * Realer Analyselauf, DACH-Enterprise-Anbieter im KI-Beratungs-Segment (anonymisiert)
 *
 * ÄNDERUNGEN ggü. v2:
 *   - Neue Grundlage: reale Analyse eines KI-Beratungsangebots für den Mittelstand
 *     (statt Buchhaltungssoftware). Struktur und Rendering-Code unverändert.
 *   - Firmenname, Ansprechpartner, Cloud-Partner, Event-Namen und Use-Case-Produktnamen
 *     entfernt bzw. generalisiert. Keine Domain- oder Markennennung mehr enthalten.
 *   - Hero zeigt 3 statt 4 CTA-Kacheln (Event-Kachel entfällt), CTA-Labels umbenannt:
 *     "KI-Potenzialanalyse anfragen" / "Unser Vorgehen" / "Anwendungsfälle entdecken".
 *   - Alle Text-Bausteine (Stärken, Schwächen, Roadmap) an die 3-CTA-Variante angepasst,
 *     d.h. "vier Kacheln" wurde durchgehend zu "drei Kacheln".
 *   - Struktur der DATA-Objekte, Rendering-Funktionen (buildPrioCard, buildRoadmap,
 *     Anker-Navigation, CSS) 1:1 aus v2 übernommen, damit Demo == echter Report.
 *
 * Einbindung: <script src="...beispielanalyse.js"></script>
 */

(function () {
  'use strict';

  var DATA = {
    keyword:         'AI as a Service',
    url:             'demo-consulting.example/ki-as-a-service',
    target_audience: 'CEOs im Mittelstand',
    conversion_goal: 'Beratungsanfrage (Pre-Sales)',
    industry:        'IT-Dienstleistung / KI-Beratung und Managed AI',
    business_type:   'Enterprise / Consulting',
    search_intent:   'Informational mit Commercial-Anteil',
    created_at:      '05.07.2026, 09:14',

    overall_score:       5.1,
    hero_score:          4.5,
    content_score:       5.5,
    zielgruppe_score:    5.0,
    conversion_score:    4.0,
    struktur_score:      5.5,
    search_intent_score: 5.5,
    wettbewerb_score:    5.5,
    performance_score:   4.0,
    ai_readiness_score:  5.6,

    industry_fit_summary: 'Die Landingpage erfüllt typische Standards für KI-Beratungs- und Managed-AI-Angebote im Enterprise-Segment weitgehend: Ein strukturierter Beratungsprozess, konkrete Use Cases mit Branchenbezug und ein Change-Management-Ansatz entsprechen den Branchenkonventionen. Compliance-Signale wie AI-Act- und NIS2-Referenzen sind vorhanden, explizit ausgewiesene Zertifizierungen wie ISO 27001 oder BSI-Grundschutz fehlen jedoch, obwohl sie im IT-Services-Segment als Standard gelten. Die Partnerschaft mit einem europäischen Cloud-Anbieter ist ein relevantes Differenzierungsmerkmal, bleibt ohne Zertifizierungsnachweis aber unterhalb des Branchenstandards.',

    dach_fit_summary: 'Die Landingpage adressiert DACH-spezifische Kernanliegen gezielt: Datensouveränität durch eigene deutsche Rechenzentren, eine explizite Compliance-Verankerung (EU AI-Act, NIS2, DSGVO) und eine von Beginn an mitgedachte Compliance-Architektur sprechen die Risikosensibilität mittelständischer Entscheider direkt an. Die formelle Sie-Ansprache und ein namentlich genannter Ansprechpartner entsprechen den Erwartungen der Zielgruppe. Branchenspezifische Zertifizierungsnachweise fehlen jedoch als sichtbare Trust-Signale auf der Seite.',

    exec_staerken: `<ul>
      <li><strong>Datensouveränität als echter Kauftreiber adressiert:</strong> Eigene zertifizierte Rechenzentren in Deutschland, volle Datenhoheit und die explizite Verankerung von EU AI-Act, NIS2 und DSGVO treffen den zentralen Entscheidungsnerv mittelständischer CEOs.</li>
      <li><strong>Strukturierter Beratungsprozess macht den Leistungsumfang greifbar:</strong> Jeder Schritt schließt mit einem konkreten Ergebnis-Statement ab. Das schafft Klarheit darüber, was Kunden in welcher Phase erhalten.</li>
      <li><strong>Sichtbarer Ansprechpartner senkt die Kontakthemmschwelle:</strong> Ein namentlich genannter Senior Account Manager mit Foto und Funktion macht die Anfrage persönlicher und weniger anonym.</li>
      <li><strong>FAQ trifft die kaufentscheidenden Einwände direkt:</strong> Fragen zu Datenschutz, Kosten und regulatorischen Anforderungen werden an der richtigen Stelle der Seite beantwortet.</li>
    </ul>`,

    exec_schwaechen: `<ul>
      <li><strong>Kein klarer Handlungsaufruf im ersten sichtbaren Bereich:</strong> Drei gleichgroß gestaltete Kacheln ("KI-Potenzialanalyse anfragen", "Unser Vorgehen", "Anwendungsfälle entdecken") konkurrieren gleichrangig miteinander, ohne dass eine davon als offensichtlicher nächster Schritt hervorsticht. Gleichzeitig fehlen im sofort sichtbaren Bereich jegliche Vertrauenssignale.</li>
      <li><strong>Kein wirtschaftliches Argument für die Investitionsentscheidung:</strong> Die Seite beschreibt überzeugend, wie vorgegangen wird, beantwortet aber nicht die entscheidende Frage eines CEOs: Was zahlt sich das am Ende aus? Ohne ein Beispiel für Einsparung, Amortisationszeit oder Größenordnung kann ein CEO das Vorhaben intern nicht vertreten.</li>
      <li><strong>Kontaktformular zu aufwändig für einen ersten unverbindlichen Schritt:</strong> Das Formular verlangt neben Name, E-Mail und Unternehmen auch eine ausführliche Nachricht als Pflichtfeld. Der Hinweis, dass der Schritt unverbindlich und kostenlos ist, steht im Fließtext, aber nicht direkt neben dem Absende-Button.</li>
    </ul>`,

    // ── HERO ──────────────────────────────────────────────────────────────────
    hero_summary: 'Der Hero adressiert die Zielgruppe Mittelstand explizit und schafft damit grundsätzliche Relevanz. Das technologische Visual passt zum Thema. Jedoch bleibt die primäre Headline auf einer Richtungsangabe ohne konkretes, messbares Ergebnis. Drei gleichrangig gestaltete CTA-Kacheln ohne erkennbare Hierarchie verhindern eine klare Führung zur Conversion. Vertrauenssignale fehlen im sofort sichtbaren Bereich vollständig.',

    hero_staerken: `<ul>
      <li><strong>Zielgruppe Mittelstand explizit im Hero genannt:</strong> Die primäre Headline adressiert die Zielgruppe direkt, CEOs mittelständischer Unternehmen erkennen sofortige Relevanz.</li>
      <li><strong>Technologisch hochwertiges Hero-Visual:</strong> Ein dunkler Gradient mit digitalem Netzwerk-Muster erzeugt eine professionelle, technologische Atmosphäre, die zum Thema passt.</li>
      <li><strong>Hero-Text kommuniziert ein Differenzierungsmerkmal:</strong> Die Positionierung gegen reine Beratungsrhetorik spricht ergebnisorientierte Entscheider an.</li>
    </ul>`,

    hero_prioritized: [
      {
        severity: 'critical',
        problem: 'Primäre Headline bleibt auf einer Richtungsangabe ohne quantifiziertes Ergebnis. Ein CEO im Mittelstand kann nicht einschätzen, welche Kosteneinsparung oder welcher Wettbewerbsvorteil in welchem Zeitrahmen entsteht.',
        loesung: 'Headline oder Hero-Text um ein konkretes Ergebnis ergänzen, zum Beispiel die typische Zeit bis zum ersten produktiven Ergebnis.',
        aufwand: 'gering',
      },
      {
        severity: 'critical',
        problem: 'Drei CTA-Kacheln im Hero ("KI-Potenzialanalyse anfragen", "Unser Vorgehen", "Anwendungsfälle entdecken") ohne erkennbare visuelle Hierarchie. Besucher müssen selbst entscheiden, welche Option relevant ist, das senkt die Wahrscheinlichkeit einer Conversion erheblich.',
        loesung: 'Den primären CTA "KI-Potenzialanalyse anfragen" als farbigen Solid-Button hervorheben, deutlich größer als die übrigen. Die restlichen Kacheln als kleinere Navigationslinks darstellen.',
        aufwand: 'gering',
      },
      {
        severity: 'high',
        problem: 'Keine Vertrauenssignale im sofort sichtbaren Bereich. Weder Kundenlogos noch Zertifikate noch Kennzahlen sind ohne Scrollen sichtbar.',
        loesung: 'Eine kompakte Trust-Leiste direkt unter den CTA-Kacheln ergänzen, etwa Kundenlogos oder eine kurze Kennzahl zur Projekterfahrung.',
        aufwand: 'gering',
      },
    ],

    // ── CONTENT ───────────────────────────────────────────────────────────────
    content_summary: 'Die Seite kommuniziert emotionale Sicherheit (Datenschutz, Compliance, deutsche Infrastruktur) und funktionale Klarheit (strukturierter Beratungsprozess, konkrete Use Cases) überzeugend. Die FAQ-Sektion trifft kaufentscheidende Einwände direkt. Schwerwiegend fehlt jedoch der quantifizierte Business Case: kein Return on Investment, keine Amortisationszeit, keine Kostenorientierung. Für einen CEO, der eine strategische Investition intern rechtfertigen muss, ist das ein fundamentaler Blocker.',

    content_staerken: `<ul>
      <li><strong>Emotionale Ebene durch Datenschutz und Souveränität stark adressiert:</strong> Eigene zertifizierte Rechenzentren in Deutschland und die explizite Verankerung von AI-Act, NIS2 und DSGVO treffen den zentralen Kauftreiber mittelständischer CEOs.</li>
      <li><strong>Strukturierter Beratungsprozess mit Ergebnis-Kommunikation pro Schritt:</strong> Jeder Schritt schließt mit einem konkreten Ergebnis-Statement, das den Prozess greifbar macht.</li>
      <li><strong>Konkrete Use Cases mit Branchen-Bezug:</strong> Reale Anwendungsszenarien statt eines abstrakten KI-Versprechens.</li>
      <li><strong>Change Management als eigenständige Leistungskomponente:</strong> Der Hinweis, dass KI-Projekte selten an der Technologie, sondern an der Umsetzung in der Organisation scheitern, adressiert einen realen CEO-Schmerzpunkt.</li>
    </ul>`,

    content_prioritized: [
      {
        severity: 'critical',
        problem: 'Kein Return on Investment kommuniziert. Kein einziges konkretes Beispiel zeigt, was eine Investition in einem vergleichbaren Unternehmen an Einsparung oder Nutzen gebracht hat.',
        loesung: 'Mindestens ein Wirtschaftlichkeitsbeispiel ergänzen: Einsparung, Amortisationszeit oder Größenordnung aus einem realen Projekt.',
        aufwand: 'mittel',
      },
      {
        severity: 'high',
        problem: 'Testimonials ohne verifizierbare Attribution und ohne konkretes Ergebnis. Für eine Enterprise-Beratung sind Kundenstimmen mit messbaren Projektergebnissen kaufentscheidend.',
        loesung: 'Mindestens ein bis zwei Testimonials auf Referenz-Niveau heben: Name, Firma, messbares Ergebnis.',
        aufwand: 'gering',
      },
      {
        severity: 'medium',
        problem: 'Kein vollständig ausgearbeiteter Referenzfall vorhanden. Die Use Cases werden als eigene Produkte präsentiert, aber ohne Kundenname, Zeitrahmen oder verifizierbare Erfolgsmetriken.',
        loesung: 'Einen Use Case zur vollständigen Case Study ausbauen: Ausgangssituation, Lösung, messbares Ergebnis mit Zeitrahmen.',
        aufwand: 'hoch',
      },
    ],

    content_gaps: [],

    // ── ZIELGRUPPE ──────────────────────────────────────────────────────────────
    zielgruppe_summary: 'Die Zielgruppe Mittelstand wird im Hero explizit genannt und die Tonalität passt zur Entscheider-Ebene. Jedoch fehlt die wirtschaftliche Argumentation für die Decider-Ebene vollständig, ein CEO kann eine strategische Investition intern nicht vertreten, wenn er nur Prozessbeschreibungen findet. Kernprobleme bleiben zu abstrakt, es fehlen konkrete Situationen, in denen sich Mittelständler wiedererkennen.',

    zielgruppe_staerken: `<ul>
      <li><strong>Zielgruppe Mittelstand explizit im Hero adressiert:</strong> Keine Interpretationsarbeit nötig, CEOs mittelständischer Unternehmen erkennen sofortige Relevanz.</li>
      <li><strong>CEO-spezifischer Pain Point adressiert:</strong> Der Handlungsdruck, den CEOs im Wettbewerbsumfeld spüren, wird konkret angesprochen.</li>
      <li><strong>Tonalität angemessen für Entscheider-Ebene:</strong> Durchgehende Sie-Ansprache und sachliche Sprache passen zur Erwartungshaltung mittelständischer Geschäftsführer.</li>
    </ul>`,

    zielgruppe_prioritized: [
      {
        severity: 'high',
        problem: 'Kernprobleme zu abstrakt für CEO-Ebene formuliert. Eine allgemeine Marktlage-Beschreibung erzeugt keine Wiedererkennung, welche konkrete Herausforderung treibt den CEO tatsächlich an?',
        loesung: 'Zwei bis drei konkrete CEO-Situationen benennen, zum Beispiel Wettbewerber, die bereits Prozesse automatisieren, die im eigenen Haus noch manuell laufen.',
        aufwand: 'gering',
      },
      {
        severity: 'high',
        problem: 'Buying-Center-Ebene der Fachverantwortlichen nur oberflächlich adressiert. IT- und Compliance-Verantwortliche finden keine Architektur-Details oder konkreten Sicherheitszertifikate.',
        loesung: 'Eine kurze technische Sektion oder ein verlinktes Datenblatt für IT-Verantwortliche ergänzen.',
        aufwand: 'mittel',
      },
      {
        severity: 'medium',
        problem: 'Mittelstands-Spezifik fehlt jenseits der Headline. Welche Branchen und Unternehmensgrößen konkret gemeint sind, bleibt unklar.',
        loesung: 'Einen kurzen Orientierungsabschnitt ergänzen, für welche Unternehmen das Angebot besonders relevant ist.',
        aufwand: 'gering',
      },
    ],

    // ── CONVERSION ──────────────────────────────────────────────────────────────
    conversion_summary: 'Die Potenzialanalyse ist als niedrigschwelliger Einstieg gut positioniert, ein sichtbarer Ansprechpartner mit Foto senkt die Kontakthemmschwelle. Jedoch blockieren mehrere Faktoren die Conversion: Drei gleichrangige CTA-Kacheln ohne erkennbaren Primary CTA erzeugen Entscheidungsunsicherheit. Das Kontaktformular ist für eine erste Anfrage zu aufwändig, Risk-Reversal-Signale fehlen direkt am Formular.',

    conversion_staerken: `<ul>
      <li><strong>Ansprechpartner mit Foto und Funktion im Kontaktbereich:</strong> Senkt die Hemmschwelle für den ersten Kontakt und macht die Anfrage persönlicher.</li>
      <li><strong>Niedrigschwelliger Einstieg positioniert:</strong> Die Formulierung als unverbindliches Erstgespräch signalisiert geringe Verbindlichkeit für Besucher in der Evaluierungsphase.</li>
      <li><strong>Mehrere Einstiegspunkte zur Conversion vorhanden:</strong> Der primäre CTA erscheint sowohl im Hero als auch nach den Use Cases.</li>
    </ul>`,

    conversion_prioritized: [
      {
        severity: 'critical',
        problem: 'Drei CTA-Kacheln im Hero optisch gleichrangig ohne erkennbaren Primary CTA. Besucher müssen zwischen gleichwertig wirkenden Optionen wählen, die Entscheidungszeit steigt und die Conversion-Wahrscheinlichkeit sinkt.',
        loesung: 'Den primären CTA "KI-Potenzialanalyse anfragen" als einzigen farbigen Solid-Button hervorheben, die übrigen Kacheln als kleinere Navigationslinks darstellen.',
        aufwand: 'gering',
      },
      {
        severity: 'critical',
        problem: 'Formular wirkt für eine Pre-Sales-Anfrage überladen. Das Pflicht-Nachrichtenfeld erzeugt Abbrüche, weil Besucher in der Evaluierungsphase oft noch nicht wissen, was sie konkret schreiben sollen.',
        loesung: 'Formular auf Name, E-Mail und Unternehmen reduzieren. Alternativ eine Kalender-Integration einbinden, die direkt einen Termin buchbar macht.',
        aufwand: 'mittel',
      },
      {
        severity: 'high',
        problem: 'Kein Risk-Reversal-Signal nahe dem Formular. Weder unverbindlich noch kostenlos erscheint direkt am Absende-Button.',
        loesung: 'Direkt unter dem Submit-Button ein kurzes Signal platzieren, zum Beispiel: Unverbindlich und kostenlos, Rückmeldung innerhalb von 24 Stunden.',
        aufwand: 'gering',
      },
    ],

    // ── STRUKTUR ──────────────────────────────────────────────────────────────
    struktur_summary: 'Der grundlegende Seitenaufbau ist nachvollziehbar und der Beratungsprozess ist klar strukturiert. Die FAQ-Sektion ist sinnvoll nahe dem Kontaktbereich platziert. Kritisch fehlen jedoch Trust-Elemente im sofort sichtbaren Bereich, und die Amplify-Ebene, also die Konsequenzen des Nicht-Handelns, fehlt vollständig.',

    struktur_staerken: `<ul>
      <li><strong>Logischer Grundaufbau erkennbar:</strong> Hero, Einleitung, Vorteile, Beratungsprozess, Use Cases, Kontaktformular und FAQ folgen einer nachvollziehbaren Reihenfolge.</li>
      <li><strong>Beratungsprozess klar strukturiert:</strong> Eigene Überschrift, kurze Beschreibung und Ergebnis-Statement pro Schritt schaffen Scanbarkeit.</li>
      <li><strong>FAQ direkt vor dem finalen CTA platziert:</strong> Letzte Einwände werden am Entscheidungspunkt adressiert.</li>
    </ul>`,

    struktur_prioritized: [
      {
        severity: 'critical',
        problem: 'Trust-Elemente fehlen im sofort sichtbaren Bereich vollständig. Weder Social Proof noch Kundenlogos noch Kennzahlen sind ohne Scrollen sichtbar.',
        loesung: 'Eine kompakte Trust-Leiste direkt unter den CTA-Kacheln ergänzen.',
        aufwand: 'gering',
      },
      {
        severity: 'high',
        problem: 'Amplify-Schritt fehlt: Das Problem wird benannt, die Konsequenzen des Nicht-Handelns werden aber nicht verstärkt. Ohne diesen Schritt fehlt der Handlungsdruck.',
        loesung: 'Eine kurze Passage ergänzen, was Unternehmen verlieren, die jetzt nicht handeln, ohne Panikmache.',
        aufwand: 'gering',
      },
      {
        severity: 'medium',
        problem: 'Anchor-Navigation fehlt trotz langer Seite mit mehreren Hauptsektionen.',
        loesung: 'Eine Sticky-Sub-Navigation oder Anchor-Links zu den wichtigsten Sektionen ergänzen.',
        aufwand: 'mittel',
      },
    ],

    // ── SEARCH INTENT ───────────────────────────────────────────────────────────
    search_intent_bewertung: 'Das Keyword trägt primär Informationsabsicht. Suchende wollen verstehen, was das Angebot bedeutet, wie es funktioniert und welche Anbieter es gibt. Die Seite bedient diesen Informationsbedarf teilweise durch den Beratungsprozess und die FAQ, jedoch fehlt eine klassische Einstiegs-Erklärung: Was ist das eigentlich? Der sekundäre Commercial Intent wird durch die Potenzialanalyse adressiert, allerdings ohne die für die Evaluierungsphase typischen Differenzierungsargumente gegenüber Alternativen.',

    search_intent_prioritized: [
      {
        severity: 'high',
        problem: 'Fehlende Erklärungsebene für das Konzept selbst. Die Seite setzt voraus, dass Besucher bereits wissen, worum es geht und warum sie es brauchen.',
        loesung: 'Eine einleitende Sektion ergänzen, die das Konzept in drei bis vier Sätzen erklärt und den Unterschied zu Alternativen benennt.',
        aufwand: 'gering',
      },
      {
        severity: 'high',
        problem: 'Fehlende Differenzierungsargumente für die Evaluierungsphase. Besucher, die mehrere Anbieter vergleichen, erhalten keine strukturierte Entscheidungshilfe.',
        loesung: 'Eine "Warum wir"-Sektion ergänzen, die die wichtigsten Differenzierungsmerkmale klar benennt.',
        aufwand: 'gering',
      },
    ],

    // ── DIFFERENZIERUNG / WETTBEWERB ─────────────────────────────────────────────
    wettbewerb_summary: 'Differenzierung ist teilweise kommuniziert, aber nicht konsequent im Hero verankert. Stärken liegen in der souveränen deutschen Infrastruktur und konkreten Use Cases mit messbaren Outcomes, das sind echte Differenzierungsmerkmale gegenüber reinen Beratungsanbietern. Ein Wettbewerber am Markt punktet mit einem klareren Conversion-Pfad und explizitem Risikoabbau.',

    wettbewerb_staerken: `<ul>
      <li><strong>Souveräne Infrastruktur als Differenzierungsmerkmal:</strong> Betrieb in eigenen zertifizierten deutschen Rechenzentren ist ein konkreter, belegbarer Vorteil, besonders relevant für datensensible Mittelstandsunternehmen.</li>
      <li><strong>Eigene KI-Reise als Glaubwürdigkeitsbeweis:</strong> Ein eigenes Kompetenzzentrum positioniert den Anbieter als Practitioner statt als reinen Berater.</li>
      <li><strong>Strukturierter Beratungsprozess:</strong> Gibt Interessenten in der Consideration-Phase Orientierung, ein Wettbewerber bietet keinen vergleichbar strukturierten Prozessrahmen.</li>
    </ul>`,

    wettbewerb_prioritized: [
      {
        severity: 'high',
        problem: 'Kein strukturierter Wettbewerbsvergleich vorhanden. Besucher, die mehrere Lösungen evaluieren, erhalten keine Entscheidungshilfe auf der Seite.',
        loesung: 'Eine Vergleichstabelle mit den wichtigsten Differenzierungsmerkmalen zu etablierten Alternativen ergänzen.',
        aufwand: 'mittel',
      },
      {
        severity: 'medium',
        problem: 'Preistransparenz fehlt vollständig, ein Wettbewerber gibt zumindest im FAQ Orientierung zur Kostenstruktur.',
        loesung: 'Zumindest eine Preisorientierung im FAQ ergänzen, etwa eine typische Größenordnung für Pilotprojekte.',
        aufwand: 'gering',
      },
    ],

    // ── PERFORMANCE ─────────────────────────────────────────────────────────────
    performance_summary: 'Performance auf Mobile ist kritisch, auf Desktop durchschnittlich. Hauptursache: Ein Consent-Management-Tool und mehrere Tracking-Skripte blockieren den Hauptthread erheblich, zusätzlich wird das Hero-Bild trotz LCP-Relevanz mit Lazy Loading geladen.',
    performance_desktop: 'Desktop-Performance ist durchschnittlich. Ladezeit-Werte liegen im mittleren Bereich, die Interaktivität ist jedoch durch einen blockierten Hauptthread verzögert. Die Serverantwortzeit ist sehr schnell, das LCP-Bild wird jedoch ohne Priorisierung ausgeliefert.',
    performance_mobile: 'Mobile Performance ist kritisch. Die Ladezeit bis zum ersten sichtbaren Inhalt ist deutlich zu hoch, die Interaktivität ist massiv verzögert. Hauptursachen sind ein Consent-Management-Tool und mehrere Marketing-Tracking-Skripte, die das Rendering blockieren, sowie ein Hero-Bild mit Lazy Loading trotz LCP-Relevanz.',

    performance_opportunities: [
      {
        severity: 'critical',
        problem: 'Hero-Bild mit Lazy Loading geladen, obwohl es das LCP-Element ist. Verschlechtert die Ladezeit auf beiden Geräten erheblich.',
        loesung: 'Lazy Loading am Hero-Bild entfernen und eine hohe Ladepriorität setzen.',
        aufwand: 'gering',
      },
      {
        severity: 'critical',
        problem: 'Consent-Management-Tool blockiert den Hauptthread massiv, größter einzelner Performance-Faktor auf Mobile und Desktop.',
        loesung: 'Consent-Skripte asynchron laden, alternativ ein leichtgewichtigeres Tool evaluieren.',
        aufwand: 'hoch',
      },
      {
        severity: 'high',
        problem: 'Mehrere Marketing-Tracking-Skripte blockieren zusätzlich den Hauptthread und verzögern die Interaktivität.',
        loesung: 'Tracking-Skripte mit defer oder async laden, alternativ über einen Tag-Manager verzögert feuern.',
        aufwand: 'mittel',
      },
    ],

    // ── AI READINESS ────────────────────────────────────────────────────────────
    ai_bewertung: 'AI-Sichtbarkeit ist mittelmäßig. Non-Commodity-Gehalt ist partiell vorhanden, einzelne Use Cases mit messbaren Outcomes sind echte, nicht generische Inhalte. Viele zentrale Aussagen bleiben jedoch generisch und könnten von jeder vergleichbaren Seite stammen. Schema-Auszeichnung ist auf Basis-Typen beschränkt, ein FAQ-Schema fehlt trotz vorhandener FAQ-Sektion.',

    ai_staerken: `<ul>
      <li><strong>KI-Crawler-Sichtbarkeit nahezu vollständig:</strong> Der Inhalt steht server-seitig bereit und ist für nicht-rendernde KI-Crawler direkt erfassbar.</li>
      <li><strong>Konkrete Use Cases mit messbaren Outcomes:</strong> Ein Use Case mit belegter Bearbeitungszeitreduktion ist ein echter Non-Commodity-Inhalt, den KI-Systeme bevorzugt zitieren.</li>
      <li><strong>FAQ-Section mit relevanten Nutzerfragen:</strong> Deckt typische Consideration- und Decision-Stage-Fragen ab, eine gute Grundlage für ein FAQ-Schema.</li>
    </ul>`,

    ai_optimierungspotenziale: [
      {
        severity: 'critical',
        problem: 'FAQ-Schema fehlt, obwohl die FAQ-Sektion relevante Fragen abdeckt. KI-Systeme können die Antworten dadurch nicht direkt zitieren.',
        loesung: 'FAQ-Schema via JSON-LD für alle Fragen und Antworten ergänzen.',
        aufwand: 'gering',
      },
      {
        severity: 'high',
        problem: 'Non-Commodity-Gehalt unvollständig: Nur ein Teil der Use Cases enthält spezifische, belegte Ergebnisse.',
        loesung: 'Alle Use Cases mit messbaren Ergebnissen anreichern, generische Formulierungen durch eigene Daten ersetzen.',
        aufwand: 'mittel',
      },
      {
        severity: 'high',
        problem: 'Video-Content fehlt vollständig, obwohl KI-Systeme Videos aktiv als Informationsquelle nutzen.',
        loesung: 'Mindestens ein Video einbetten, etwa eine kurze Produktdemo oder ein Erklärvideo zum Vorgehen.',
        aufwand: 'mittel',
      },
    ],

    // ── ROADMAP (priority_matrix-JSON, identisch zu report.js v4) ────────────────
    priority_matrix: {
      sofort_umsetzen: [
        {
          category: 'Hero',
          issue: 'Primäre Headline um ein konkretes, messbares Ergebnis ergänzen statt einer reinen Richtungsangabe.',
          reasoning: 'Ein greifbares Ergebnis muss für einen CEO im Mittelstand intern rechtfertigbar sein.',
          impact: 'SEHR_HOCH',
          effort: 'GERING',
        },
        {
          category: 'Hero',
          issue: 'Einen einzigen visuell dominanten Primary CTA im Hero etablieren, die übrigen zwei Kacheln als kleinere Navigationslinks darstellen.',
          reasoning: 'Drei gleichrangige Kacheln erzeugen Entscheidungsunsicherheit und senken die Conversion-Wahrscheinlichkeit.',
          impact: 'SEHR_HOCH',
          effort: 'GERING',
        },
        {
          category: 'Content',
          issue: 'Testimonials mit vollständiger Attribution und konkretem Ergebnis versehen.',
          reasoning: 'Für eine Enterprise-Beratung sind Kundenstimmen mit messbarem Outcome kaufentscheidend.',
          impact: 'HOCH',
          effort: 'GERING',
        },
      ],
      als_naechstes: [
        {
          category: 'Struktur',
          issue: 'Trust-Leiste direkt unter den CTA-Kacheln ergänzen.',
          reasoning: 'Kundenlogos, Zertifikate oder eine kurze Kennzahl schaffen Glaubwürdigkeit im ersten Moment.',
          impact: 'HOCH',
          effort: 'GERING',
        },
        {
          category: 'Conversion',
          issue: 'Formular vereinfachen und Pflicht-Nachrichtenfeld optional machen oder durch Kalender-Integration ersetzen.',
          reasoning: 'Reduziert Abbrüche bei Besuchern, die noch nicht wissen, was sie konkret schreiben sollen.',
          impact: 'HOCH',
          effort: 'MITTEL',
        },
        {
          category: 'Content',
          issue: 'Mindestens ein Wirtschaftlichkeitsbeispiel mit Einsparung oder Amortisationszeit ergänzen.',
          reasoning: 'Ohne quantifizierten Business Case kann ein CEO die Investition intern nicht vertreten.',
          impact: 'HOCH',
          effort: 'MITTEL',
        },
      ],
      quick_wins: [
        {
          category: 'Performance',
          issue: 'Lazy Loading am Hero-Bild entfernen und eine hohe Ladepriorität setzen.',
          reasoning: 'Das LCP-Element wird aktuell unnötig verzögert geladen.',
          impact: 'HOCH',
          effort: 'GERING',
        },
        {
          category: 'AI Sichtbarkeit',
          issue: 'FAQ-Schema für alle Fragen und Antworten ergänzen.',
          reasoning: 'Ermöglicht direkte Zitation durch KI-Systeme und AI Overviews.',
          impact: 'MITTEL',
          effort: 'GERING',
        },
      ],
      spaeter: [
        {
          category: 'Differenzierung',
          issue: 'Vergleichstabelle mit den wichtigsten Unterschieden zu etablierten Alternativen ergänzen.',
          reasoning: 'Strukturierte Entscheidungshilfe für Besucher, die mehrere Anbieter evaluieren.',
          impact: 'MITTEL',
          effort: 'MITTEL',
        },
        {
          category: 'Content',
          issue: 'Einen Use Case zur vollständigen Case Study mit Kundenname oder Branche ausbauen.',
          reasoning: 'Der stärkste Proof Point für CEOs in der Entscheidungsphase, schließt die aktuell größte inhaltliche Lücke.',
          impact: 'HOCH',
          effort: 'HOCH',
        },
      ],
    },
  };

  // ── CSS ─────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('cvz-bsp-styles')) return;
    var s = document.createElement('style');
    s.id = 'cvz-bsp-styles';
    s.textContent = `
      .cvz-section{max-width:1200px;margin:0 auto;padding:28px 24px 32px;font-family:'Geist','DM Sans','Segoe UI',sans-serif;color:#e2e8f0;}
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

      /* === Prio-Karten (severity-Badges, identisch zu report.js v4) === */
      .cvz-prio{display:flex;flex-direction:column;gap:14px;}
      .cvz-pr-item{padding-left:14px;border-left:3px solid #718096;}
      .cvz-pr-crit{border-left-color:#ef4444;}
      .cvz-pr-high{border-left-color:#f59e0b;}
      .cvz-pr-med{border-left-color:#10b981;}
      .cvz-pr-badge{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;}
      .cvz-pr-crit .cvz-pr-badge{color:#ef4444;}
      .cvz-pr-high .cvz-pr-badge{color:#f59e0b;}
      .cvz-pr-med .cvz-pr-badge{color:#10b981;}
      .cvz-pr-problem{font-size:14px;font-weight:600;color:#e8edf5;line-height:1.5;}
      .cvz-pr-loesung{font-size:13px;color:#c4cdd6;line-height:1.6;margin-top:6px;}
      .cvz-pr-aufwand{color:#718096;font-weight:600;}

      /* === Roadmap aus priority_matrix-JSON (identisch zu report.js v4) === */
      .cvz-roadmap{display:flex;flex-direction:column;gap:16px;}
      .cvz-rm-group{
        background:rgba(255,255,255,.03);
        border:1px solid rgba(255,255,255,.07);
        border-radius:12px;overflow:hidden;
      }
      .cvz-rm-head{
        padding:12px 18px;font-size:11px;font-weight:700;
        letter-spacing:.08em;text-transform:uppercase;
        border-bottom:1px solid rgba(255,255,255,.06);
      }
      .cvz-rm-sofort    .cvz-rm-head{color:#ef4444;background:rgba(239,68,68,.06);}
      .cvz-rm-naechstes .cvz-rm-head{color:#f59e0b;background:rgba(245,158,11,.06);}
      .cvz-rm-quickwins .cvz-rm-head{color:#10b981;background:rgba(16,185,129,.06);}
      .cvz-rm-spaeter   .cvz-rm-head{color:#718096;background:rgba(113,128,150,.06);}
      .cvz-rm-item{padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.05);}
      .cvz-rm-item:last-child{border-bottom:none;}
      .cvz-rm-item-cat{
        font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
        color:#4a5568;margin-bottom:4px;
      }
      .cvz-rm-item-title{font-size:14px;font-weight:600;color:#e8edf5;line-height:1.5;}
      .cvz-rm-rea{font-size:13px;color:#c4cdd6;line-height:1.6;margin-top:6px;}
      .cvz-rm-meta{
      font-size:11px;font-weight:600;color:#718096;
      margin-top:4px;letter-spacing:.02em;
      }

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
        .cvz-section{padding:24px 16px 24px;}
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

  function toArray(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return [v];
    return [];
  }

  function card(type, label, content) {
    if (!content) return '';
    var cls = {summary:'cvz-card-summary',staerken:'cvz-card-staerken',schwaechen:'cvz-card-schwaechen',empfehlungen:'cvz-card-empfehlungen'}[type]||'';
    return '<div class="cvz-card '+cls+' cvz-fi cvz-fi-3"><div class="cvz-card-label"><div class="cvz-card-label-dot"></div>'+label.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div><div class="cvz-card-body">'+sanitize(content)+'</div></div>';
  }

  var CVZ_SEV = {
    critical: { label: 'CRITICAL', cls: 'crit' },
    high:     { label: 'HIGH',     cls: 'high' },
    medium:   { label: 'MEDIUM',   cls: 'med'  },
  };
  function cvzAufwand(s) {
    var m = { gering:'Gering', mittel:'Mittel', hoch:'Hoch' };
    return m[String(s).toLowerCase()] || sanitize(String(s||''));
  }

  function buildPrioCard(field) {
    var data = field;
    if (typeof field === 'string') {
      var t = field.trim();
      if (t.charAt(0) === '[' || t.charAt(0) === '{') {
        try { data = JSON.parse(t); } catch (e) { data = null; }
      } else {
        return t ? card('empfehlungen', 'Priorisierte Handlungsempfehlungen', field) : '';
      }
    }
    var items = toArray(data);
    if (items.length === 0) return '';
    var inner = '';
    items.forEach(function(it) {
      var sevKey = String(it.severity || '').toLowerCase();
      var sev = CVZ_SEV[sevKey] || { label: String(it.severity||'').toUpperCase(), cls: 'med' };
      var problem = sanitize(String(it.problem || it.issue || ''));
      var loesung = sanitize(String(it.loesung || ''));
      var aufwand = it.aufwand ? cvzAufwand(it.aufwand) : '';
      inner += '<div class="cvz-pr-item cvz-pr-'+sev.cls+'">'
        + '<div class="cvz-pr-badge">'+sev.label+'</div>'
        + '<div class="cvz-pr-problem">'+problem+'</div>'
        + (loesung
            ? '<div class="cvz-pr-loesung">💡 '+loesung
              + (aufwand ? ' <span class="cvz-pr-aufwand">Aufwand: '+aufwand+'</span>' : '')
              + '</div>'
            : '')
        + '</div>';
    });
    return '<div class="cvz-card cvz-card-empfehlungen cvz-fi cvz-fi-3">'
      + '<div class="cvz-card-label"><div class="cvz-card-label-dot"></div>Priorisierte Handlungsempfehlungen</div>'
      + '<div class="cvz-card-body"><div class="cvz-prio">'+inner+'</div></div></div>';
  }

  function buildRoadmap(d) {
    var pm = d.priority_matrix;
    var hasData = pm && typeof pm === 'object' &&
      (toArray(pm.sofort_umsetzen).length || toArray(pm.als_naechstes).length ||
       toArray(pm.quick_wins).length      || toArray(pm.spaeter).length);
    if (!hasData) {
      return '<div class="cvz-section cvz-fi cvz-fi-2"><div class="cvz-cat-header"><div class="cvz-cat-name">Roadmap</div></div><div class="cvz-cards">'+
        card('empfehlungen','Priorisierte Handlungsempfehlungen', d.priority_matrix_html || '')+
        '</div></div>';
    }
    var gruppen = [
      { key:'sofort_umsetzen', label:'Sofort umsetzen', cls:'sofort'    },
      { key:'als_naechstes',   label:'Als Nächstes',    cls:'naechstes' },
      { key:'quick_wins',      label:'Quick Wins',      cls:'quickwins' },
      { key:'spaeter',         label:'Später',          cls:'spaeter'   },
    ];
    var pretty = function(s){ return s.replace(/_/g,' ').toLowerCase().replace(/^\w/, function(c){ return c.toUpperCase(); }); };
    var gruppenHtml = '';
    gruppen.forEach(function(g) {
      var items = toArray(pm[g.key]);
      if (items.length === 0) return;
      var itemsHtml = '';
      items.forEach(function(it) {
        var cat    = sanitize(String(it.category || 'Optimierung'));
        var iss    = sanitize(String(it.issue || ''));
        var rea    = sanitize(String(it.reasoning || ''));
        var impact = sanitize(String(it.impact || ''));
        var effort = sanitize(String(it.effort || ''));
        var meta = (impact || effort)
          ? '<div class="cvz-rm-meta">'+(impact ? 'Impact: ' + pretty(impact) : '')+(impact && effort ? ' · ' : '')+(effort ? 'Aufwand: ' + pretty(effort) : '')+'</div>'
          : '';
        itemsHtml += '<div class="cvz-rm-item">'
          + '<div class="cvz-rm-item-cat">'+cat+'</div>'
          + '<div class="cvz-rm-item-title">'+iss+'</div>'
          + meta
          + (rea ? '<div class="cvz-rm-rea">'+rea+'</div>' : '')
          + '</div>';
      });
      gruppenHtml += '<div class="cvz-rm-group cvz-rm-'+g.cls+'">'
        + '<div class="cvz-rm-head">'+g.label+'</div>'
        + '<div class="cvz-rm-items">'+itemsHtml+'</div></div>';
    });
    return '<div class="cvz-section cvz-fi cvz-fi-2"><div class="cvz-cat-header"><div class="cvz-cat-name">Roadmap</div></div><div class="cvz-roadmap">'+gruppenHtml+'</div></div>';
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

    (function() {
      function setNavTop(anchorNav) {
        var webflowNav = document.querySelector('.w-nav');
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
      var wfNav = document.querySelector('.w-nav');
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

    inject('.section-hero-info',
      '<div class="cvz-section cvz-fi cvz-fi-1">'+
      '<div style="background:rgba(79,209,197,.05);border:1px solid rgba(79,209,197,.15);border-radius:10px;padding:14px 18px;margin-bottom:12px;font-size:13px;color:#718096;line-height:1.65;">'+
      '<p style="margin:0 0 8px;"><strong style="color:#c4cdd6;">Dies ist eine echte Convertlyze-Analyse</strong>. Anonymisiert für diese Beispielseite. Alle Markennamen, Zitate und konkreten Kennzahlen wurden generalisiert, die Bewertungen und Empfehlungen stammen aus einem realen Analyselauf.</p>'+
      '<p style="margin:0;">Convertlyze bewertet jede Seite im Kontext ihrer <strong style="color:#c4cdd6;">Branche und ihres Angebotstyps</strong>: Eine Enterprise-Beratungsseite wird nach anderen Kriterien beurteilt als eine SaaS- oder E-Commerce-Seite, von der Erwartung an Proof Points über die CTA-Strategie bis zur Gewichtung einzelner Kategorien. Die folgende Analyse zeigt das vollständige Ausgabeformat am Beispiel eines DACH-Anbieters im KI-Beratungssegment.</p>'+
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

    inject('.section-deep-dive-hero', buildCatSection('Hero', d.hero_score,
      card('summary','Zusammenfassung','<p>'+d.hero_summary+'</p>')+
      card('staerken','Stärken',d.hero_staerken)+
      buildPrioCard(d.hero_prioritized)));

    inject('.section-deep-dive-content', buildCatSection('Content', d.content_score,
      card('summary','Zusammenfassung','<p>'+d.content_summary+'</p>')+
      card('staerken','Stärken',d.content_staerken)+
      buildPrioCard(d.content_prioritized)+
      buildPrioCard(d.content_gaps)));

    inject('.section-deep-dive-zielgruppe', buildCatSection('Zielgruppe', d.zielgruppe_score,
      card('summary','Zusammenfassung','<p>'+d.zielgruppe_summary+'</p>')+
      card('staerken','Stärken',d.zielgruppe_staerken)+
      buildPrioCard(d.zielgruppe_prioritized)));

    inject('.section-deep-dive-conversion', buildCatSection('Conversion', d.conversion_score,
      card('summary','Zusammenfassung','<p>'+d.conversion_summary+'</p>')+
      card('staerken','Stärken',d.conversion_staerken)+
      buildPrioCard(d.conversion_prioritized)));

    inject('.section-deep-dive-struktur', buildCatSection('Struktur', d.struktur_score,
      card('summary','Zusammenfassung','<p>'+d.struktur_summary+'</p>')+
      card('staerken','Stärken',d.struktur_staerken)+
      buildPrioCard(d.struktur_prioritized)));

    inject('.section-deep-dive-searchintent', buildCatSection('Search Intent', d.search_intent_score,
      card('summary','Bewertung','<p>'+d.search_intent_bewertung+'</p>')+
      buildPrioCard(d.search_intent_prioritized)));

    inject('.section-deep-dive-differenzierung', buildCatSection('Differenzierung', d.wettbewerb_score,
      card('summary','Zusammenfassung','<p>'+d.wettbewerb_summary+'</p>')+
      card('staerken','Stärken',d.wettbewerb_staerken)+
      buildPrioCard(d.wettbewerb_prioritized)));

    inject('.section-deep-dive-performance', buildCatSection('Performance', d.performance_score,
      card('summary','Zusammenfassung','<p>'+d.performance_summary+'</p>')+
      card('summary','Desktop','<p>'+d.performance_desktop+'</p>')+
      card('summary','Mobil','<p>'+d.performance_mobile+'</p>')+
      buildPrioCard(d.performance_opportunities)));

    inject('.section-deep-dive-ai', buildCatSection('AI Sichtbarkeit', d.ai_readiness_score,
      card('summary','Zusammenfassung','<p>'+d.ai_bewertung+'</p>')+
      card('staerken','Stärken',d.ai_staerken)+
      buildPrioCard(d.ai_optimierungspotenziale)));

    inject('.section-roadmap', buildRoadmap(d));

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

    heading('.section-hero-info',            'Beispielanalyse', '');
    heading('.section-executive-summary',    'Executive Summary', 'Die wichtigsten Erkenntnisse auf einen Blick');
    heading('.section-deep-dive-hero',       'Deep Dive', 'Detaillierte Analyse jeder Kategorie');
    heading('.section-deep-dive-performance','Performance &amp; AI Sichtbarkeit', 'Performance und AI Readiness fließen nicht in den Gesamt-Score ein. Performance-Optimierungen erfordern meist hauptsächlich technische Umsetzung. Bei AI Readiness ist es gemischt, strukturierte Daten brauchen Entwicklungs-Support, Inhaltsstruktur und Semantik kannst du direkt selbst angehen.');
    heading('.section-roadmap',              'Roadmap', 'Die wichtigsten Maßnahmen, sortiert nach Impact und Aufwand.');

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

    console.log('✅ Beispielanalyse gerendert (v3 – anonymisiert, 3 CTAs)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

})();
