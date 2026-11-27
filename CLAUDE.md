# CLAUDE.md für convertlyze-scripts

Frontend-Skripte von Convertlyze (Vanilla JavaScript, ohne Build). Sie werden per jsDelivr mit Commit-Hash in Webflow-Seiten eingebunden.
Die Constitution und die Definition of Done liegen im privaten Repo `convertlyze-docs`. Lies sie vor größeren Änderungen. Bei Konflikt gilt die Constitution.

## Dieses Repo ist ÖFFENTLICH
Alles hier kann jeder lesen. Deshalb:
- Keine Secrets, keine Service-Keys. Der öffentliche Supabase-Anon-Key ist gewollt, ein Service-Key nie.
- Keine Beschreibung von Sicherheitslücken oder Angriffswegen in Kommentaren oder Commit-Texten.
- Keine Preislogik, Strategie, Kundennamen oder Interna in Kommentaren.
- Specs, Pläne und ADRs gehören nicht hierher, sondern nach `convertlyze-docs`.

## Zusammenarbeit
- Lako ist Product Owner, aber JS- und Python-Einsteiger. Erkläre einfach, zeige immer vollständigen lauffähigen Code und sage, was du vereinfacht oder weggelassen hast.
- Sei kritisch. Nenne Risiken und bessere Alternativen ungefragt.
- Produktiver Code entsteht aus einer Spec. Ohne Spec nur bei Texten, Mini-Bugfixes mit Mini-Spec im PR oder auf Branch `exploration/...`.
- Fehlt eine Angabe, frage nach statt zu raten. Nenne Annahmen im PR.

## Deploy (wichtig für jede Änderung)
Ein Merge auf `main` ändert noch nichts auf der Website. Erst wenn in Webflow der Commit-Hash im jsDelivr-Link getauscht wird, läuft der neue Code. Deshalb gehört in jeden PR:
1. Welche Datei(en) sich geändert haben
2. In welchen Webflow-Seiten oder Embeds der Hash getauscht werden muss
3. Wie man zurückkommt (alter Hash)

Frontend und Backend zusammen: erst Backend deployen (abwärtskompatibel), dann Hash tauschen.

## Aufbau
- Ein Skript je Seite oder Funktion, in Ordnern je Produktbereich (`journey-tracker/`, `content-strategie/`, `landingpage-agent/`, `analyse/`, `ki-check/`). Neue Dateien in kebab-case, im passenden Ordner.
- Jedes Skript: Kopfkommentar (Zweck, Einbindung, benötigte Webflow-Elemente), IIFE mit `'use strict'`, Init-Guard (`if (window._cvlyXInit) return;`), Konfiguration oben.
- Neue Dateien unter ca. 800 Zeilen. `journeyagentapp.js` (über 21.000 Zeilen), `contentStrategyAgent.app.js`, `landingpage-agent/app.js`, `pageview.js`, `dashboard.js` und `report.js` werden nicht weiter vergrößert, neue Logik kommt in eine neue Datei.

## Regeln
- **Keine Kopien:** `getMemberToken`, `depsReady`, Memberstack-Zugriff und Fetch-Helfer existieren schon mehrfach. Nicht noch einmal kopieren. Bis ein gemeinsames Modul existiert (Backlog Punkt 6), eine bestehende Variante bewusst wiederverwenden und im PR nennen.
- **Auth:** Das Memberstack-JWT geht als `Authorization: Bearer` an das Backend. Die Member-ID allein ist kein Beweis. Rechte prüft immer der Server.
- **Escapen:** Jeder Text aus Nutzereingabe, Datenbank oder KI geht durch `escapeHtml`, bevor er in `innerHTML` landet. Im Zweifel `textContent` verwenden.
- **Design:** Dunkelblau `#0d1117`, Teal `#4fd1c5`, eckig (kein `border-radius`). Keine neuen Hex-Farben, bestehende Konstanten verwenden. Schriften Syne und Geist liegen in Webflow gehostet. Keine Google Fonts einbinden.
- **Texte:** Deutsch, duzen, "Landingpage" in einem Wort, kein Denglisch, keine Gedankenstriche, keine Emojis als Icons.
- **Barrierefreiheit:** Bedienbar mit Tastatur, Felder mit Label, ausreichender Kontrast, Smartphone-Breite 375 px prüfen.
- **Kommentare:** Warum und Ist-Zustand. Keine "NEU/GEÄNDERT (Datum)"-Blöcke, kein "siehe Chat-Verlauf".
- **API-Adressen** stehen als Konstante oben in der Datei, nie mitten im Code.

## Prüfen
Es gibt hier noch keine automatischen Tests (Tests für den Tracker liegen im Repo `visibility-tracker`). Mindestens vor jedem PR: `node --check datei.js` für jede geänderte Datei. Dazu eine manuelle Prüfanweisung aus der Spec im PR.

## Pull Request
Beschreibung nach `.github/pull_request_template.md` ausfüllen.
