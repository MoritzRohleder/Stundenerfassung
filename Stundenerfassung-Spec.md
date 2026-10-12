# Stundenerfassung-Spec

> Spezifikation für die Webanwendung **Stundenerfassung** zum privaten Nachhalten der eigenen Arbeitszeit.
> Status: **v0.1** der Spezifikation – Entwurf, noch nicht umgesetzt.
> Technisch angelehnt an das Haushaltsprojekt (Node.js, Express, EJS, Pico.css, JSON-Dateien, Docker), aber nicht 1:1.
> Getroffene Entscheidungen stehen in [Kapitel 13.1](#131-entscheidungen), offene Punkte in [Kapitel 13.2](#132-offene-fragen) (im Text mit `❓` markiert).

---

## Inhaltsverzeichnis

1. [Ziel und Zweck](#1-ziel-und-zweck)
2. [Leitprinzipien](#2-leitprinzipien)
3. [Begriffe](#3-begriffe)
4. [Sichtbarkeit und Berechtigungen](#4-sichtbarkeit-und-berechtigungen)
5. [Datenmodell](#5-datenmodell)
6. [Berechnungsregeln](#6-berechnungsregeln)
7. [Funktionale Anforderungen](#7-funktionale-anforderungen)
8. [Abläufe](#8-abläufe)
9. [Seiten und Navigation](#9-seiten-und-navigation)
10. [Technologie und Architektur](#10-technologie-und-architektur)
11. [Nicht-funktionale Anforderungen](#11-nicht-funktionale-anforderungen)
12. [Abgrenzung (nicht im ersten Release)](#12-abgrenzung-nicht-im-ersten-release)
13. [Entscheidungen und offene Fragen](#13-entscheidungen-und-offene-fragen)
14. [Meilensteine](#14-meilensteine)
15. [Lizenz](#15-lizenz)
16. [Änderungshistorie](#16-änderungshistorie)

---

## 1. Ziel und Zweck

Die Anwendung soll jedem Nutzer helfen, seine **Arbeitszeit privat nachzuhalten** – als eigene Gegenprobe zur Zeiterfassung des Arbeitgebers. Jeder Nutzer trägt pro Tag ein, wann er angefangen und aufgehört hat; die Anwendung rechnet Pausen, Ist- und Sollstunden, Überstunden und Urlaub aus.

Kernfragen, die die Anwendung beantworten soll:

- Wie viele Stunden habe ich an einem Tag, in einer Woche, in einem Monat gearbeitet?
- Wie viel hätte ich laut meiner Wochenarbeitszeit arbeiten sollen – und wie viele Plus- oder Minusstunden habe ich?
- Wie steht mein **Überstundenkonto** insgesamt?
- Wie viele **Urlaubstage** habe ich in diesem Jahr genommen, wie viele sind noch übrig?
- Wie sah das in früheren Monaten und Jahren aus?

## 2. Leitprinzipien

| # | Prinzip | Bedeutung |
|---|---------|-----------|
| P1 | **Generisch** | Die Software kennt keine konkreten Personen oder Arbeitgeber. Wochenarbeitszeit, Bundesland, Urlaubsanspruch usw. stellt jeder Nutzer selbst ein. |
| P2 | **Einfach bleiben** | Kleine, server-gerenderte Webanwendung. Kein SPA-Framework, kein Build-Schritt fürs Frontend. |
| P3 | **Nachvollziehbarkeit** | Dauer, Pausen, Soll, Salden und Urlaubsrest werden **immer aus den gespeicherten Daten berechnet**, nie separat gespeichert. Jede Summe lässt sich auf einzelne Tage zurückführen. |
| P4 | **Ganze Minuten** | Zeiten werden intern als **ganze Minuten** (Integer) gespeichert und berechnet, nie als Gleitkommazahl. Angezeigt werden sie als `7:30 h` **und** dezimal `7,50 h` (siehe [6.8](#68-formate)). |
| P5 | **Daten gehören uns** | Selbst gehostet, Daten liegen lokal als JSON-Dateien, Backup = Ordner kopieren. |
| P6 | **Austauschbare Datenhaltung** | Zugriff nur über eine Speicherschicht; JSON später durch eine Datenbank ersetzbar (siehe [10.3](#103-speicherschicht)). |

## 3. Begriffe

| Begriff | Definition |
|---------|------------|
| **Nutzer** | Eine Person mit eigenem Login (Nutzername + Passwort). Nutzer registrieren sich selbst. |
| **Zeitblock** | Ein zusammenhängender Arbeitszeitraum an einem Tag mit **Beginn** und **Ende** (z. B. 08:00–12:15). Ein Tag kann **beliebig viele** Zeitblöcke haben. Ein Zeitblock endet spätestens um 24:00 desselben Tages (keine Schichten über Mitternacht). |
| **Arbeitstag** | Alles, was ein Nutzer zu einem Kalenderdatum erfasst hat: Zeitblöcke, ggf. manuelle Pause, ggf. Abwesenheit, Notiz. |
| **Anwesenheit (brutto)** | Vom Beginn des ersten bis zum Ende des letzten Zeitblocks eines Tages. |
| **Pause** | Nicht gearbeitete Zeit innerhalb der Anwesenheit. Bei mehreren Zeitblöcken die **Lücken dazwischen**, bei einem Zeitblock die **manuell eingetragene** oder die **automatisch berechnete** Pause (siehe [6.2](#62-pause)). |
| **Ist-Zeit** | Tatsächlich gearbeitete Zeit eines Tages = Summe der Zeitblöcke − abzuziehende Pause. |
| **Arbeitszeitmodell** | Wochenarbeitszeit und Arbeitstage eines Nutzers. Es gibt ein **Standardmodell** und optional **Zeiträume** mit abweichendem Modell (z. B. 01.02.–10.04. 40 h/Woche, sonst 20 h/Woche). |
| **Soll-Zeit** | Die laut Arbeitszeitmodell zu leistende Zeit eines Tages, gemindert um Feiertage und Abwesenheiten. |
| **Saldo** | Ist − Soll (pro Tag, Woche, Monat, Jahr). Positiv = Plusstunden, negativ = Minusstunden. |
| **Überstundenkonto** | Laufende Summe aller Tagessalden ab dem Beginn der Erfassung plus ein optionaler Startsaldo. |
| **Abwesenheit** | Ein ganzer oder halber Tag Urlaub, Krankheit, Freizeitausgleich oder sonstige bezahlte Freistellung. |
| **Feiertag** | Gesetzlicher Feiertag im eingestellten Bundesland; wird automatisch berechnet. An Feiertagen ist das Soll 0. |
| **Urlaubskonto** | Urlaubsanspruch eines Jahres (+ Übertrag aus dem Vorjahr) minus genommene Urlaubstage. |

## 4. Sichtbarkeit und Berechtigungen

Die Anwendung ist **strikt privat**: Es gibt keine geteilten Daten.

| Regel | Beschreibung |
|-------|--------------|
| S-01 | Jeder Nutzer sieht und bearbeitet **ausschließlich seine eigenen** Daten (Zeitblöcke, Arbeitstage, Arbeitszeitmodelle, Urlaubsansprüche, Einstellungen). |
| S-02 | Es gibt keine Liste anderer Nutzer, keine Rollen und keinen Admin. |
| S-03 | Ruft ein Nutzer einen fremden Datensatz auf (z. B. über eine erratene ID), antwortet der Server mit **404**. |

## 5. Datenmodell

IDs sind zufällige UUIDs (`crypto.randomUUID()`). Datum intern ISO `JJJJ-MM-TT`, Uhrzeiten intern als **Minuten seit 00:00** (`0`–`1440`).

### 5.1 Überblick

```
                         ┌───────────────────────────────┐
                         │             Nutzer            │
                         └──▲─────────▲─────────▲─────▲──┘
                   user_id  │ user_id │ user_id │     │ user_id
                ┌───────────┴──┐ ┌────┴──────┐ ┌┴─────┴───────────┐ ┌──────────────────┐
                │  Zeitblock   │ │ Arbeitstag│ │ Arbeitszeitmodell│ │ Urlaubsanspruch  │
                │ (n pro Datum)│ │(0..1 pro  │ │ (Standard +      │ │ (0..1 pro Jahr)  │
                │              │ │  Datum)   │ │  Zeiträume)      │ │                  │
                └──────────────┘ └───────────┘ └──────────────────┘ └──────────────────┘
                     Zeitblock und Arbeitstag gehören über (user_id, date) zusammen
```

### 5.2 Entitäten

#### Nutzer (`users`)

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `id` | UUID | ja | |
| `username` | Text | ja | Login-Name, eindeutig, nicht case-sensitiv; wird auch als Name angezeigt |
| `password_hash` | Text | ja | scrypt-Hash inkl. Salt (siehe [10.4](#104-login-und-sitzungen)) |
| `theme` | Enum | ja | `auto`, `light`, `dark`. Default `auto` |
| `state` | Enum | ja | Bundesland für Feiertage: `BW`, `BY`, `BE`, `BB`, `HB`, `HH`, `HE`, `MV`, `NI`, `NW`, `RP`, `SL`, `SN`, `ST`, `SH`, `TH`. Wird bei der Registrierung abgefragt |
| `tracking_start` | Datum | ja | Ab diesem Tag zählen Soll und Überstundenkonto. Default: Tag der Registrierung. Tage davor können trotzdem erfasst werden, gehen aber nicht ins Konto ein |
| `overtime_start_minutes` | Integer | ja | Startsaldo des Überstundenkontos zum `tracking_start` (darf negativ sein). Default 0 |
| `vacation_days_default` | Dezimal (Schritt 0,5) | ja | Urlaubsanspruch pro Jahr, wenn für ein Jahr nichts Eigenes hinterlegt ist. Default 30 |
| `created_at` | Zeitstempel | ja | |

#### Zeitblock (`time_blocks`)

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `id` | UUID | ja | |
| `user_id` | UUID → users | ja | |
| `date` | Datum | ja | |
| `start_min` | Integer 0–1439 | ja | Beginn in Minuten seit 00:00 (08:15 = 495) |
| `end_min` | Integer 1–1440 | ja | Ende; `end_min > start_min`; 1440 = 24:00 |
| `created_at`, `updated_at` | Zeitstempel | ja | |

Regeln:

- Zeitblöcke desselben Tages dürfen sich **nicht überschneiden**. Direkt aneinander grenzen (12:00–12:00) ist erlaubt.
- Ein Zeitblock mit Dauer 0 ist nicht erlaubt.

#### Arbeitstag (`days`)

Optionale Zusatzangaben zu einem Datum. Ein Datensatz existiert nur, wenn eine der Angaben gesetzt ist.

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `id` | UUID | ja | |
| `user_id` | UUID → users | ja | |
| `date` | Datum | ja | eindeutig je Nutzer |
| `manual_break_min` | Integer ≥ 0 | nein | Manuell eingetragene Pause. **Nur bei genau einem Zeitblock** möglich (siehe 6.2). Leer = automatisch |
| `absence_type` | Enum | nein | `vacation` (Urlaub), `sick` (krank), `comp_time` (Freizeitausgleich/Überstundenabbau), `other_paid` (sonstige bezahlte Freistellung, z. B. Sonderurlaub) |
| `absence_fraction` | Enum | bei `absence_type` | `1` (ganzer Tag) oder `0.5` (halber Tag) |
| `note` | Text | nein | Freitext, max. 200 Zeichen |
| `created_at`, `updated_at` | Zeitstempel | ja | |

Regeln:

- Ganzer Tag Abwesenheit und Zeitblöcke am selben Tag: erlaubt, aber mit Hinweis (z. B. kurz trotz Urlaub gearbeitet – zählt als Plus).
- Halber Tag Abwesenheit + Zeitblöcke ist der Normalfall für „halber Tag Urlaub, halber Tag gearbeitet“.
- Abwesenheit an Tagen ohne Soll (Wochenende, Feiertag, kein Arbeitstag laut Modell) wird abgelehnt.
- ❓ F1: Sind halbe Tage auch bei Krankheit, Freizeitausgleich und Sonstigem nötig, oder nur bei Urlaub? Vorschlag: bei allen erlaubt.

#### Arbeitszeitmodell (`work_schedules`)

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `id` | UUID | ja | |
| `user_id` | UUID → users | ja | |
| `valid_from` | Datum | nein | Leer = **Standardmodell** (gilt immer, wenn kein Zeitraum greift) |
| `valid_to` | Datum | nein | Letzter Tag des Zeitraums (einschließlich). Bei Zeiträumen Pflicht |
| `weekly_min` | Integer ≥ 0 | ja | Wochenarbeitszeit in Minuten (40 h = 2400) |
| `workdays` | Liste 1–7 | ja | Arbeitstage (ISO: 1 = Montag … 7 = Sonntag), mindestens einer. Default Mo–Fr |
| `note` | Text | nein | z. B. „Projektphase“ |

Regeln:

- Jeder Nutzer hat **genau ein Standardmodell** (wird bei der Registrierung angelegt, Vorschlag 40 h, Mo–Fr).
- Zeiträume dürfen sich **nicht überschneiden**. Für einen Tag gilt der Zeitraum, der ihn enthält, sonst das Standardmodell.
- Beispiel: Standard 20 h/Woche; Zeitraum 01.02.2027–10.04.2027 mit 40 h/Woche.
- ❓ F2: Soll es auch offene Zeiträume geben („ab 01.05.2027 dauerhaft 30 h“)? Hintergrund: Ändert man das **Standardmodell**, ändert sich rückwirkend das Soll aller vergangenen Tage ohne Zeitraum. Vorschlag: `valid_to` darf beim zeitlich letzten Zeitraum leer bleiben; dauerhafte Änderungen legt man so als Zeitraum an, statt das Standardmodell umzustellen.

#### Urlaubsanspruch (`vacation_entitlements`)

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `id` | UUID | ja | |
| `user_id` | UUID → users | ja | |
| `year` | Integer | ja | eindeutig je Nutzer |
| `days` | Dezimal (Schritt 0,5) | ja | Anspruch in diesem Jahr (z. B. 15 bei Eintritt zur Jahresmitte) |
| `carryover_days` | Dezimal (Schritt 0,5) | nein | Manueller Übertrag aus dem Vorjahr. Leer = automatisch (siehe 6.6) |

Fehlt der Datensatz für ein Jahr, gilt `users.vacation_days_default` und der automatische Übertrag.

## 6. Berechnungsregeln

Alle Berechnungen beziehen sich auf den angemeldeten Nutzer. Alle Werte in ganzen Minuten.

### 6.1 Ist-Zeit eines Tages

```
Blockzeit   = Σ (end_min − start_min) aller Zeitblöcke des Tages
Ist-Zeit    = Blockzeit − abzuziehende Pause   (nie < 0)
```

### 6.2 Pause

| Fall | Angezeigte Pause | Abzuziehende Pause (von der Blockzeit) |
|------|------------------|----------------------------------------|
| Kein Zeitblock | – | 0 |
| **Genau ein Zeitblock**, manuelle Pause eingetragen | manuelle Pause | manuelle Pause |
| **Genau ein Zeitblock**, keine manuelle Pause | automatische Pause (s. u.) | automatische Pause |
| **Mehrere Zeitblöcke** | Summe der Lücken zwischen den Blöcken | 0 – die Lücken sind schon nicht in der Blockzeit enthalten |

**Automatische Pause** (angelehnt an § 4 ArbZG):

| Blockzeit | automatische Pause |
|-----------|--------------------|
| bis 6:00 h | 0 min |
| mehr als 6:00 h bis 9:00 h | 30 min |
| mehr als 9:00 h | 45 min |

- ❓ F3: **Kappung an der Schwelle?** Bei 6:10 h Blockzeit würde die starre Regel 30 min abziehen → 5:40 h Ist, also weniger als bei genau 6:00 h. Vorschlag: Die automatische Pause wird so begrenzt, dass das Ist nicht unter die Schwelle fällt:
  - Blockzeit > 6:00 h bis 9:00 h: `Pause = min(30, Blockzeit − 6:00)` → 6:10 h ergibt 10 min Pause und 6:00 h Ist.
  - Blockzeit > 9:00 h: `Pause = 30 + min(15, Blockzeit − 9:00)` → 9:10 h ergibt 40 min Pause und 8:30 h Ist.
  - So steigt das Ist nie, wenn man kürzer arbeitet. Alternative: starr wie in der Tabelle.
- ❓ F4: **Mehrere Blöcke mit zu kurzer Lücke** (z. B. 07:00–12:00 und 12:10–17:00 = 9:50 h mit 10 min Lücke): nur die Lücke zählt (Ist 9:50 h), oder wird auf die gesetzliche Mindestpause aufgefüllt (Ist 9:15 h)? Vorschlag: nur die Lücke zählen, aber einen **Hinweis** „Mindestpause unterschritten“ anzeigen – die Anwendung bildet ab, was tatsächlich war.
- Unterschreitet eine **manuelle** Pause die gesetzliche Mindestpause, wird sie trotzdem verwendet; die Anwendung zeigt einen Hinweis.
- Eine manuelle Pause größer als die Blockzeit wird abgelehnt.

### 6.3 Soll-Zeit eines Tages

```
Modell(Tag)   = Zeitraum, der den Tag enthält, sonst Standardmodell
Tagessoll     = Modell.weekly_min / Anzahl(Modell.workdays)     wenn Wochentag ∈ Modell.workdays
              = 0                                                sonst
Soll(Tag)     = 0                                                wenn gesetzlicher Feiertag
              = Tagessoll × (1 − Abwesenheitsanteil)             sonst
```

- `Abwesenheitsanteil` = `absence_fraction` bei `vacation`, `sick`, `other_paid`; bei Freizeitausgleich (`comp_time`) **0** – das Soll bleibt bestehen, das fehlende Ist baut Überstunden ab.
- Rundung: Das Tagessoll wird auf ganze Minuten gerundet (kaufmännisch). Beispiel 38,5 h an 5 Tagen = 462 min. Halber Tag Urlaub bei 462 min → 231 min.
- Tage vor `tracking_start` haben kein Soll (werden als „nicht erfasst“ angezeigt).
- **Künftige Tage**: Ihr Soll wird angezeigt, zählt aber erst ab dem Tag selbst zum Saldo (siehe 6.4).

### 6.4 Saldo und Überstundenkonto

```
Saldo(Tag)          = Ist(Tag) − Soll(Tag)
Saldo(Zeitraum)     = Σ Saldo(Tag) für alle Tage im Zeitraum mit tracking_start ≤ Tag ≤ heute
Überstundenkonto    = overtime_start_minutes + Saldo(tracking_start … heute)
```

- „Heute“ zählt mit (auch wenn der Tag noch läuft). ❓ F5: Oder soll „heute“ erst ab dem nächsten Tag ins Konto eingehen, damit morgens nicht gleich −8 h dastehen? Vorschlag: heute zählt nur, wenn schon etwas erfasst ist.
- In der Monats- und Jahresübersicht werden für den laufenden Monat **Soll bis heute** und **Soll gesamt (ganzer Monat)** getrennt gezeigt.
- Kontostand am Ende jedes Monats (für die Jahresübersicht) = Überstundenkonto bis zum Monatsletzten.

### 6.5 Woche

- Wochen nach ISO 8601 (Montag–Sonntag, Kalenderwoche „KW“).
- In der Monatsübersicht erscheint nach jedem Sonntag (und am Monatsende) eine **Zwischenzeile „KW nn“** mit Ist, Soll und Saldo. Ragt die Woche in den Vor- oder Folgemonat, zählt die Zwischenzeile nur die Tage dieses Monats und ist als „Teilwoche“ gekennzeichnet.
- Das Dashboard zeigt die **laufende Woche vollständig** (auch über Monatsgrenzen).

### 6.6 Urlaub

```
Anspruch(Jahr)  = vacation_entitlements.days  oder  users.vacation_days_default
Übertrag(Jahr)  = carryover_days, wenn gesetzt, sonst max(0, Rest(Jahr − 1))   (erstes Jahr: 0)
Genommen(Jahr)  = Σ absence_fraction aller Tage mit absence_type = vacation im Jahr
Rest(Jahr)      = Anspruch + Übertrag − Genommen
```

- Geplanter Urlaub in der Zukunft zählt bei „Genommen“ mit, wird aber als „davon geplant“ getrennt ausgewiesen.
- Kein automatischer Verfall des Resturlaubs (z. B. zum 31.03.) im ersten Release.
- Ein negativer Rest ist erlaubt und wird als Hinweis angezeigt.

### 6.7 Feiertage

- Gesetzliche Feiertage werden für das Bundesland des Nutzers **berechnet** (feste Feiertage + bewegliche über das Osterdatum, Gauß/Meeus-Algorithmus), keine externe Datenquelle, kein Internet nötig.
- Bundesweit: Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag, Tag der Deutschen Einheit, 1. und 2. Weihnachtstag.
- Länderspezifisch: Heilige Drei Könige (BW, BY, ST), Internationaler Frauentag (BE, MV), Fronleichnam (BW, BY, HE, NW, RP, SL), Mariä Himmelfahrt (SL; BY nur teilweise → nicht berücksichtigt), Weltkindertag (TH), Reformationstag (BB, HB, HH, MV, NI, SN, ST, SH, TH), Allerheiligen (BW, BY, NW, RP, SL), Buß- und Bettag (SN).
- Ostersonntag und Pfingstsonntag (in BB gesetzlich) fallen immer auf einen Sonntag und spielen nur eine Rolle, wenn der Sonntag ein Arbeitstag im Modell ist; sie werden für BB mitgeführt.
- Heiligabend und Silvester sind **keine** Feiertage (keine Sonderregel im ersten Release).
- Ein Bundesland-Wechsel des Nutzers wirkt sich auf alle Tage aus (auch rückwirkend). ❓ F6: reicht das, oder muss das Bundesland ebenfalls zeitraumbezogen sein (Umzug)? Vorschlag: reicht für den Prototypen.

### 6.8 Formate

- Dauer überall **zweifach**: `7:30 h` und dezimal `7,50 h` (auf zwei Nachkommastellen gerundet). In Tabellen steht die Stunden:Minuten-Form als Hauptwert und die Dezimalform daneben bzw. darunter in kleinerer Schrift.
- Salden immer mit Vorzeichen: `+1:15 h` / `−0:30 h` (echtes Minuszeichen).
- Uhrzeit `HH:MM` (24-Stunden-Format). Eingabe akzeptiert `8`, `8:15`, `08:15`, `0815` und `8.15`; `24:00` nur als Ende.
- Datum `TT.MM.JJJJ`, Wochentag kurz (`Mo`, `Di`, …), intern ISO.
- Urlaubstage mit einer Nachkommastelle, wenn nötig: `12,5 Tage`.

## 7. Funktionale Anforderungen

Priorität: **M** = Muss (MVP), **S** = Soll (kurz nach MVP), **K** = Kann (später).

### 7.1 Konto und Login

| ID | Anforderung | Prio |
|----|-------------|------|
| F-01 | Registrieren mit Nutzername, Passwort (mit Wiederholung) und Bundesland | M |
| F-02 | Anmelden, Abmelden | M |
| F-03 | Alle Seiten außer Login/Registrierung/Health nur angemeldet erreichbar | M |
| F-04 | Eigenes Passwort ändern | S |
| F-05 | Hell/Dunkel-Umschalter in der Navigation, Wahl pro Nutzer gespeichert | M |
| F-06 | Handbuch in der Anwendung (aus `docs/wiki`), kleiner Umfang | K |

### 7.2 Einstellungen

| ID | Anforderung | Prio |
|----|-------------|------|
| F-10 | Standard-Arbeitszeitmodell bearbeiten (Wochenarbeitszeit, Arbeitstage) | M |
| F-11 | Zeiträume mit abweichendem Arbeitszeitmodell anlegen, bearbeiten, löschen (keine Überschneidungen) | M |
| F-12 | Bundesland, Beginn der Erfassung (`tracking_start`) und Startsaldo des Überstundenkontos einstellen | M |
| F-13 | Urlaubsanspruch: Standard pro Jahr und abweichender Anspruch bzw. manueller Übertrag je Jahr | S |

### 7.3 Erfassen

| ID | Anforderung | Prio |
|----|-------------|------|
| F-20 | **Tag erfassen/bearbeiten** auf einer Seite: beliebig viele Zeitblöcke (Beginn, Ende), manuelle Pause (nur bei einem Block), Abwesenheit (Art, ganz/halb), Notiz | M |
| F-21 | Live-Anzeige auf der Tagesseite: Blockzeit, Pause (automatisch/manuell/Lücken), Ist, Soll, Saldo – serverseitig berechnet; mit JavaScript zusätzlich sofort beim Tippen | M |
| F-22 | Zeitblock löschen; ganzen Tag leeren (mit Bestätigung) | M |
| F-23 | Prüfung: Ende > Beginn, keine Überschneidung, Pause ≤ Blockzeit, Abwesenheit nur an Soll-Tagen | M |
| F-24 | Schnelleingabe: „+ Heute“ global in der Navigation; Vor/Zurück-Tag auf der Tagesseite; „Speichern & nächster Tag“ | S |
| F-25 | Hinweise (nicht blockierend): Mindestpause unterschritten, mehr als 10 h Ist, Arbeit an Feiertag/Wochenende, Zeitblöcke an einem ganzen Abwesenheitstag | S |
| F-26 | **Urlaub für einen Zeitraum** in einem Schritt eintragen (von–bis; Wochenenden, Feiertage und Nicht-Arbeitstage werden übersprungen) | S |

### 7.4 Übersichten

| ID | Anforderung | Prio |
|----|-------------|------|
| F-30 | **Dashboard**: heute (Blöcke, Ist), laufende Woche (Ist/Soll/Saldo), laufender Monat (Ist/Soll bis heute/Saldo), **Überstundenkonto**, **Resturlaub** | M |
| F-31 | **Monatsübersicht**: Summen Ist, Soll (bis heute und gesamt), Saldo des Monats, Überstundenkonto am Monatsende, Urlaubs-/Krankheitstage; Blättern zwischen Monaten | M |
| F-32 | Monatsübersicht: **Tabelle aller Tage** des Monats (Datum, Wochentag, Zeitblöcke, Pause, Ist, Soll, Saldo, Abwesenheit/Feiertag, Notiz); Klick auf einen Tag öffnet die Tagesseite; Wochenenden und Feiertage optisch abgesetzt | M |
| F-33 | Monatsübersicht: **Wochen-Zwischenzeilen** „KW nn“ (6.5) | M |
| F-34 | **Jahresübersicht** für das aktuelle Jahr: 12 Monate mit Ist, Soll, Saldo, Überstundenkonto am Monatsende, Urlaubs- und Krankheitstage; Jahressummen; Urlaubskonto des Jahres | M |
| F-35 | Jahresübersicht: **andere Jahre** auswählbar (Blättern und Auswahlliste der Jahre mit Daten) | M |
| F-36 | Diagramm in der Jahresübersicht: Ist vs. Soll je Monat und Verlauf des Überstundenkontos (SVG, serverseitig) | K |
| F-37 | Druckfreundliche Monatsansicht (Druck-Stylesheet, ohne Navigation) | K |

### 7.5 Daten

| ID | Anforderung | Prio |
|----|-------------|------|
| F-40 | Backup: Ordner `data/` kopieren genügt; automatische Sicherungskopie vor jedem Schreiben | M |
| F-41 | CSV-Export eines Monats/Jahres | K |

## 8. Abläufe

### 8.1 Registrierung und erste Schritte

1. Nicht angemeldet → Login-Seite mit Link „Registrieren“.
2. Registrieren: Nutzername, Passwort, Passwort wiederholen, Bundesland.
3. Danach angemeldet; es wird ein Standardmodell (40 h, Mo–Fr) angelegt und `tracking_start` = heute gesetzt.
4. Das Dashboard zeigt einen Hinweis „Prüfe deine Wochenarbeitszeit und den Beginn der Erfassung“ mit Link zu den Einstellungen, bis der Nutzer die Einstellungen einmal gespeichert hat.

### 8.2 Einen Tag erfassen

1. „+ Heute“ in der Navigation oder Klick auf einen Tag in der Monatsübersicht → `/tag/JJJJ-MM-TT`.
2. Die Seite zeigt die vorhandenen Zeitblöcke als Zeilen (Beginn – Ende) und eine leere Zeile für einen weiteren Block; „+ weiterer Block“ fügt eine Zeile hinzu (ohne JavaScript: es gibt immer eine freie Zeile, nach dem Speichern eine neue).
3. Feld „Pause (min)“ – nur sichtbar/aktiv bei genau einem Block; Platzhalter zeigt die automatische Pause („automatisch: 30“).
4. Abwesenheit: keine / Urlaub / krank / Freizeitausgleich / Sonstiges, jeweils ganzer oder halber Tag.
5. Speichern → serverseitige Prüfung (F-23) → zurück zur Tagesseite (oder Monatsübersicht, je nach Herkunft) mit Erfolgsmeldung und Berechnung.

Beispiel (Standardmodell 40 h, Mo–Fr → Tagessoll 8:00 h):

| Fall | Blöcke | Pause | Ist | Saldo |
|------|--------|-------|-----|-------|
| Ein Block, automatisch | 08:00–16:45 (8:45) | 30 min (auto) | 8:15 h | +0:15 h |
| Ein Block, manuell | 08:00–16:45 (8:45) | 45 min (manuell) | 8:00 h | ±0:00 h |
| Zwei Blöcke | 07:30–12:00, 12:45–16:00 (7:45) | 45 min (Lücke) | 7:45 h | −0:15 h |
| Halber Tag Urlaub | 08:00–12:00 (4:00) | 0 min (auto) | 4:00 h | ±0:00 h (Soll 4:00 h) |
| Feiertag, nicht gearbeitet | – | – | 0:00 h | ±0:00 h (Soll 0) |
| Freizeitausgleich | – | – | 0:00 h | −8:00 h |

### 8.3 Arbeitszeitmodell mit Zeitraum

1. Einstellungen → Arbeitszeit: Standardmodell 20 h, Mo–Fr.
2. „+ Zeitraum“: 01.02.2027 bis 10.04.2027, 40 h, Mo–Fr, Notiz.
3. Ab sofort haben Tage in diesem Zeitraum 8:00 h Soll, alle anderen 4:00 h.

## 9. Seiten und Navigation

Navigation: **Übersicht** (Dashboard) · **Monat** · **Jahr** · **+ Heute** · **Einstellungen** · Theme-Umschalter · Abmelden.

| Seite | Route | Inhalt |
|-------|-------|--------|
| Login | `GET/POST /login` | |
| Registrieren | `GET/POST /registrieren` | |
| Abmelden | `POST /logout` | |
| Dashboard | `GET /` | Heute, Woche, Monat, Überstundenkonto, Resturlaub |
| Tag | `GET/POST /tag/:datum` | Zeitblöcke, Pause, Abwesenheit, Notiz, Berechnung |
| Tag leeren | `POST /tag/:datum/loeschen` | |
| Urlaub für Zeitraum | `GET/POST /abwesenheit/neu` | F-26 |
| Monatsübersicht | `GET /monat/:jahr/:monat` | `/monat` leitet auf den aktuellen Monat um |
| Jahresübersicht | `GET /jahr/:jahr` | `/jahr` leitet auf das aktuelle Jahr um |
| Einstellungen | `GET/POST /einstellungen` | Bundesland, Beginn der Erfassung, Startsaldo, Urlaub-Standard, Passwort |
| Arbeitszeitmodelle | `GET /einstellungen/arbeitszeit`, `GET/POST …/neu`, `…/:id/bearbeiten`, `POST …/:id/loeschen` | Standardmodell + Zeiträume |
| Urlaubsansprüche | `GET/POST /einstellungen/urlaub` | Anspruch und Übertrag je Jahr |
| Darstellung | `POST /einstellungen/darstellung` | Theme speichern (per `fetch`, ohne JS als Formular) |
| Health-Check | `GET /health` | `{"status":"ok"}` ohne Login |

Änderungen und Löschungen laufen über `POST` (Post/Redirect/Get). Ungültige Datums- oder Jahresangaben in der URL → 404.

## 10. Technologie und Architektur

Wie im Haushaltsprojekt, verschlankt wo es für einen Prototypen nicht nötig ist.

### 10.1 Komponenten

| Baustein | Wahl |
|----------|------|
| Laufzeit | Node.js, aktuelle LTS (24) |
| Web-Framework | Express 5 |
| Template-Engine | EJS |
| Sitzungen | express-session mit eigenem Datei-Store (`data/sessions.json`), 30 Tage |
| Passwort-Hashing | `crypto.scrypt` + `timingSafeEqual` |
| Datenhaltung | JSON-Dateien hinter einer Speicherschicht |
| CSS | Pico.css (npm, kein CDN) + `public/css/theme.css` |
| Client-JS | Vanilla JS nur für Komfort (Live-Berechnung, Theme-Umschalter, Block hinzufügen); alles funktioniert ohne JS |
| Tests | `node:test` |
| Entwicklung | `node --watch` |

### 10.2 Schichten

`routes/` → `services/` (Pause, Ist, Soll, Saldo, Feiertage, Urlaub, Monats-/Jahresauswertung) → `repositories/` → `storage/` (JSON-Adapter). Nur `storage/` kennt Dateien.

### 10.3 Speicherschicht

Gleiche Schnittstelle wie im Haushaltsprojekt: `findAll`, `findById`, `insert`, `update`, `remove`, `transaction(fn)` – alle mit Promise.

- Eine Datei pro Sammlung in `data/`: `users.json`, `time_blocks.json`, `days.json`, `work_schedules.json`, `vacation_entitlements.json`, dazu `meta.json` (`schema_version`, `migrations_done`).
- Alles im Arbeitsspeicher, Schreiben nacheinander (Warteschlange), atomar (temporäre Datei + Umbenennen), die letzten N Stände in `data/backup/`.
- Das Speichern eines Tages (Blöcke + Arbeitstag) läuft über `transaction()`, damit der Tag nie halb gespeichert ist.

### 10.4 Login und Sitzungen

Übernommen aus dem Haushaltsprojekt: Passwort mind. 8 Zeichen, Session-ID-Erneuerung beim Login, Cookie `httpOnly` + `sameSite: 'lax'` (+ `secure` bei HTTPS), CSRF-Token in allen Formularen, Login-Bremse (5 Fehlversuche je IP+Name → 30 s, verdoppelnd bis 15 min; 30 je IP in 15 min), neutrale Fehlermeldung, Sicherheits-Header (strenge CSP ohne Inline-Skripte/-Styles, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, HSTS bei `COOKIE_SECURE=true`), `Cache-Control: no-store` für angemeldete Seiten, nur interne Rücksprungziele.

### 10.5 Projektstruktur

```
Stundenerfassung/
├── package.json
├── Stundenerfassung-Spec.md
├── Dockerfile, docker-compose.yml, .env.example
├── src/
│   ├── app.js, config.js
│   ├── storage/          ← index.js, json/, migrations.js
│   ├── repositories/     ← users, timeBlocks, days, workSchedules, vacationEntitlements
│   ├── services/         ← auth, breaks, worktime, schedules, holidays, vacation, overview
│   ├── routes/
│   ├── middleware/       ← requireLogin, csrf, rateLimit, securityHeaders, errors
│   └── utils/            ← Zeit-/Datumsformat, Eingabe-Parser, Validierung
├── views/                ← partials/, auth/, dashboard.ejs, day.ejs, month.ejs, year.ejs, settings/
├── public/               ← css/theme.css, js/
├── data/                 ← nicht im Git
└── test/
```

### 10.6 Konfiguration

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `PORT` | `3000` | Port im Container (nach außen per Compose `3002`) |
| `DATA_DIR` | `./data` | Datenordner |
| `STORAGE` | `json` | Speicher-Adapter |
| `SESSION_SECRET` | zufällig, in `data/.session-secret` | Signatur des Session-Cookies |
| `COOKIE_SECURE` | `false` | `true` hinter HTTPS (aktiviert HSTS) |
| `TRUST_PROXY` | `false` | Anzahl Reverse Proxys, damit die Login-Bremse die echte IP sieht |
| `TZ` | Systemzeit | z. B. `Europe/Berlin` – bestimmt „heute“ |
| `NODE_ENV` | – | `production` im Docker-Image |

### 10.7 Gestaltung und Farben

- Pico.css, alle Farben als CSS-Variablen in `public/css/theme.css`, Hell und Dunkel (Automatisch/Hell/Dunkel pro Nutzer, `data-theme` am `<html>`).
- Eigene Primärfarbe **Indigo**, damit man die App auf einen Blick vom Haushaltsprojekt (Petrol) unterscheidet.
- Farbe ist nie das einzige Merkmal: Salden haben immer ein Vorzeichen, Abwesenheiten zusätzlich einen Text/ein Kürzel (U, ½U, K, FA, S, FT).
- Responsive; die Tagesseite ist für das Handy optimiert (große Zeitfelder, `inputmode="numeric"`).

| Rolle | Variable | Hell | Dunkel | Verwendung |
|-------|----------|------|--------|------------|
| Primärfarbe | `--se-primary` | `#4338ca` (Indigo) | `#818cf8` | Navigation, Buttons, Links (überschreibt `--pico-primary`) |
| Plus | `--se-plus` | `#15803d` | `#4ade80` | Positive Salden |
| Minus | `--se-minus` | `#b91c1c` | `#f87171` | Negative Salden |
| Urlaub | `--se-vacation` | `#0369a1` (Blau) | `#38bdf8` | Urlaubstage |
| Krank | `--se-sick` | `#a21caf` (Magenta) | `#e879f9` | Krankheitstage |
| Frei | `--se-off` | `#64748b` (Schiefergrau) | `#94a3b8` | Wochenende, Feiertag, kein Arbeitstag (Zeilenhintergrund abgesetzt) |
| Hinweis | `--se-warning` | `#b45309` (Bernstein) | `#fbbf24` | Hinweise (Mindestpause, > 10 h, …) |

### 10.8 Betrieb mit Docker

- `Dockerfile`: `node:24-alpine`, `npm ci --omit=dev`, Nutzer `node`, `NODE_ENV=production`, Health-Check über `/health`, Volume `/app/data`.
- `docker-compose.yml`: fester Projektname `stundenerfassung`, Port **`3002:3000`**, eigenes Volume `stundenerfassung-data`, `restart: unless-stopped`, Einstellungen aus `.env` (Vorlage `.env.example`), `TZ=Europe/Berlin`.
- Image `ghcr.io/moritzrohleder/stundenerfassung` (`pull_policy: always`, Version über `STUNDEN_VERSION`); für den Prototypen zusätzlich lokal mit `docker compose up -d --build` baubar.
- Sauberes Herunterfahren bei `SIGTERM` (Schreibwarteschlange abarbeiten, Sitzungen sichern).
- HTTPS über vorgeschalteten Reverse Proxy (Anleitung im README).

### 10.9 CI/CD

| Workflow | Auslöser | Inhalt |
|----------|----------|--------|
| `ci.yml` | Push, PR auf `master` | `npm test` (Node 22 und 24); Docker-Image bauen, Container starten, `/health` prüfen |
| `release.yml` | Release veröffentlicht | Tag `vX.Y.Z` = `package.json`; Tests; Multi-Arch-Image (`amd64`, `arm64`) nach ghcr.io mit Tags `X.Y.Z`, `X.Y`, `X`, `latest` |

## 11. Nicht-funktionale Anforderungen

| ID | Anforderung |
|----|-------------|
| N-01 | Sprache der Oberfläche: Deutsch. |
| N-02 | Responsive, vor allem das Erfassen eines Tages auf dem Smartphone. |
| N-03 | Sicherheit: EJS-Ausgaben escaped; serverseitige Validierung aller Formulare; Zugehörigkeit zum Nutzer bei **jedem** Zugriff im Server geprüft. |
| N-04 | Konsistenz: Speichern eines Tages atomar über `transaction()`. |
| N-05 | Betrieb: `npm start` oder Docker auf dem Heimserver. Registrierung dauerhaft offen. |
| N-06 | Datensicherung: Nur `data/` muss gesichert werden. |
| N-07 | Performance: einige Jahre Daten pro Nutzer, Seitenaufbau < 500 ms; alles im Arbeitsspeicher. |
| N-08 | Testbarkeit: Pausenregel, Ist/Soll/Saldo, Arbeitszeitmodelle mit Zeiträumen, Feiertage aller Bundesländer, Urlaubskonto und JSON-Adapter sind durch automatisierte Tests abgedeckt. |

## 12. Abgrenzung (nicht im ersten Release)

- **Stempeluhr** („Jetzt einstempeln / ausstempeln“) – für eine spätere Version vorgemerkt.
- Schichten über Mitternacht.
- Mehrere Arbeitgeber, Projekte oder Tätigkeiten pro Nutzer.
- Stundenlohn / Verdienstberechnung.
- PDF-Export, Weitergabe an den Arbeitgeber.
- Rundungsregeln (immer minutengenau).
- Verfall von Resturlaub, Sonderregeln für Heiligabend/Silvester, regionale Feiertage (z. B. Augsburger Friedensfest, Mariä Himmelfahrt in Teilen Bayerns).
- Teilen von Daten zwischen Nutzern, Rollen/Admin.
- „Passwort vergessen“ per E-Mail.
- Eigene Wochenseite (die Woche erscheint im Dashboard und als Zwischenzeile im Monat).

## 13. Entscheidungen und offene Fragen

### 13.1 Entscheidungen

| # | Thema | Entscheidung |
|---|-------|--------------|
| E-01 | Zeitblöcke | Beliebig viele Zeitblöcke pro Tag. |
| E-02 | Pause | Mehrere Blöcke → Lücken sind die Pause. Ein Block → manuelle Pause, sonst automatische Pause. |
| E-03 | Mitternacht | Keine Schichten über Mitternacht. |
| E-04 | Stempeluhr | Nicht im ersten Release, für später vorgemerkt. |
| E-05 | Genauigkeit | Minutengenau, keine Rundung. |
| E-06 | Sollzeit | Wochenarbeitszeit als Standardmodell plus Zeiträume mit abweichender Wochenarbeitszeit. |
| E-07 | Abwesenheiten | Urlaub, Krankheit usw. werden erfasst; halbe Tage sind möglich. |
| E-08 | Feiertage | Automatisch nach Bundesland des Nutzers. |
| E-09 | Urlaubskonto | Anspruch pro Jahr mit Anzeige von genommen und Rest. |
| E-10 | Umfang | Nur Zeiten erfassen – keine Projekte, kein Lohn. |
| E-11 | Woche | Keine eigene Seite, aber sichtbar (Dashboard, Zwischenzeilen im Monat). |
| E-12 | Export | Nicht nötig; die App dient der eigenen Gegenprüfung. |
| E-13 | Zeitformat | Beide Darstellungen: `7:30 h` und `7,50 h`. |
| E-14 | Technik | Ähnlich zum Haushaltsprojekt, nicht 1:1; Prototyp zum Ausprobieren. |
| E-15 | Port | Host-Port **3002**. |
| E-16 | Farbe | Eigene Primärfarbe Indigo. |
| E-17 | Sichtbarkeit | Daten strikt privat pro Nutzer. |
| E-18 | Lizenz | GNU GPL v3. |

### 13.2 Offene Fragen

| # | Frage | Vorschlag |
|---|-------|-----------|
| F1 | Halbe Tage auch bei Krankheit, Freizeitausgleich und Sonstigem? (5.2) | Ja, bei allen Arten. |
| F2 | Zeiträume ohne Ende („ab 01.05. dauerhaft 30 h“)? (5.2) | Ja, `valid_to` optional; es gilt höchstens ein offener Zeitraum, der nach allen anderen liegt. So ändert sich das Soll vergangener Tage nie durch Umstellen des Standardmodells. |
| F3 | Automatische Pause an der Schwelle kappen (6:10 h → 6:00 h statt 5:40 h)? (6.2) | Ja, kappen. |
| F4 | Mehrere Blöcke mit zu kurzer Lücke auf die Mindestpause auffüllen? (6.2) | Nein, nur Hinweis anzeigen. |
| F5 | Zählt „heute“ schon zum Überstundenkonto? (6.4) | Nur, wenn für heute schon etwas erfasst ist. |
| F6 | Bundesland zeitraumbezogen (Umzug)? (6.7) | Nein, ein Bundesland pro Nutzer. |
| F7 | Was zählt beim Freizeitausgleich: Soll bleibt, Ist 0 → baut Überstunden ab? (6.3) | Ja, so wie beschrieben. |
| F8 | Standardwerte bei der Registrierung: 40 h Mo–Fr, 30 Urlaubstage, Erfassung ab Registrierung? (8.1) | Ja. |

## 14. Meilensteine

| # | Meilenstein | Inhalt |
|---|-------------|--------|
| M0 | **Spezifikation** | Dieses Dokument abstimmen, offene Fragen klären. |
| M1 | **Grundgerüst** | `package.json`, Express + EJS, Pico + `theme.css`, Layout/Navigation, Konfiguration, JSON-Speicherschicht inkl. Tests, `/health`. |
| M2 | **Login & Sicherheit** | F-01 bis F-05, CSRF, Login-Bremse, Sicherheits-Header. |
| M3 | **Rechenkern** | Pausenregel, Ist/Soll/Saldo, Arbeitszeitmodelle, Feiertage, Urlaub – als Services mit Tests (Kapitel 6). |
| M4 | **Erfassen & Einstellungen** | F-10 bis F-12, F-20 bis F-23: Tagesseite, Arbeitszeitmodelle, Einstellungen. |
| M5 | **Übersichten** | F-30 bis F-35: Dashboard, Monat mit Wochenzeilen, Jahr mit Jahreswechsel. → **MVP fertig** |
| M6 | **Komfort** | F-04, F-13, F-24 bis F-26: Passwort ändern, Urlaubsansprüche, Schnelleingabe, Hinweise, Urlaub für Zeitraum. |
| M7 | **Betrieb** | Docker (10.8), CI/CD (10.9), README mit Anleitung für den Heimserver. |
| M8 | **Ausbau** | F-06, F-36, F-37, F-41, Stempeluhr nach Bedarf. |

## 15. Lizenz

Das Projekt steht unter der **GNU General Public License v3.0** (siehe [`LICENSE`](LICENSE)); in der `package.json` `"license": "GPL-3.0-or-later"`.

## 16. Änderungshistorie

| Version | Änderungen |
|---------|------------|
| v0.1 | Erster Entwurf auf Basis der Abstimmung: mehrere Zeitblöcke pro Tag, Pausenregel, Arbeitszeitmodelle mit Zeiträumen, Abwesenheiten mit halben Tagen, Feiertage nach Bundesland, Urlaubskonto, Monats- und Jahresübersicht, Technik angelehnt an das Haushaltsprojekt, Port 3002, Primärfarbe Indigo. |
