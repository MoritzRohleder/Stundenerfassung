# Stundenerfassung-Spec

> Spezifikation für die Webanwendung **Stundenerfassung** zum privaten Nachhalten der eigenen Arbeitszeit.
> Status: **v0.5** der Spezifikation – im Prototyp umgesetzt (M0 bis M7.2).
> Die Versionsnummer der Spezifikation ist unabhängig von der Version der Software (siehe 10.9).
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

**Es gibt keine Standardwerte** für Arbeitszeit, Bundesland, Beginn der Erfassung, Startsaldo und Urlaubsanspruch: Der Nutzer muss sie nach der Registrierung selbst eintragen (Einrichtung, siehe 8.1).

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
| `state` | Enum | nach Einrichtung | Bundesland für Feiertage: `BW`, `BY`, `BE`, `BB`, `HB`, `HH`, `HE`, `MV`, `NI`, `NW`, `RP`, `SL`, `SN`, `ST`, `SH`, `TH` |
| `tracking_start` | Datum | nach Einrichtung | Ab diesem Tag zählen Soll und Überstundenkonto. Tage davor können trotzdem erfasst werden, gehen aber nicht ins Konto ein |
| `overtime_start_minutes` | Integer | nach Einrichtung | Startsaldo des Überstundenkontos zum `tracking_start` (darf negativ sein) |
| `vacation_days_default` | Dezimal (Schritt 0,5) | nach Einrichtung | Urlaubsanspruch pro Jahr, wenn für ein Jahr nichts Eigenes hinterlegt ist |
| `setup_done` | Boolean | ja | `false` nach der Registrierung, `true` sobald die Einrichtung (8.1) gespeichert ist |
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
| `absence_fraction` | Enum | bei `absence_type` | `1` (ganzer Tag) oder `0.5` (halber Tag). Bei `sick` immer `1` |
| `note` | Text | nein | Freitext, max. 200 Zeichen |
| `created_at`, `updated_at` | Zeitstempel | ja | |

Regeln:

- Ganzer Tag Abwesenheit und Zeitblöcke am selben Tag: erlaubt, aber mit Hinweis (z. B. kurz trotz Urlaub gearbeitet – zählt als Plus).
- Halber Tag Abwesenheit + Zeitblöcke ist der Normalfall für „halber Tag Urlaub, halber Tag gearbeitet“.
- Abwesenheit an Tagen ohne Soll (Wochenende, Feiertag, kein Arbeitstag laut Modell) wird abgelehnt.
- Halbe Tage gibt es bei Urlaub, Freizeitausgleich und sonstiger Freistellung, **nicht bei Krankheit** (E-19).

#### Arbeitszeitmodell (`work_schedules`)

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `id` | UUID | ja | |
| `user_id` | UUID → users | ja | |
| `valid_from` | Datum | nein | Leer = **Standardmodell** (gilt immer, wenn kein Zeitraum greift) |
| `valid_to` | Datum | nein | Letzter Tag des Zeitraums (einschließlich). Leer = **offen** („bis auf Weiteres“), nur beim zeitlich letzten Zeitraum erlaubt |
| `weekly_min` | Integer ≥ 0 | ja | Wochenarbeitszeit in Minuten (40 h = 2400) |
| `workdays` | Liste 1–7 | ja | Arbeitstage (ISO: 1 = Montag … 7 = Sonntag), mindestens einer. Beim Wochensoll die **üblichen Tage** |
| `distribution` | Enum | ja | `fixed` = feste Arbeitstage (Default), `weekly` = **Wochensoll** – an welchen Tagen gearbeitet wird, ist egal (E-28, 6.4a) |
| `holidays_credited` | Boolean | ja | `true` = Feiertage mindern das Soll (Default), `false` = **Feiertage werden nicht angerechnet**, z. B. bei stundenbasiertem Vertrag (E-27) |
| `note` | Text | nein | z. B. „Projektphase“ |

Regeln:

- Jeder Nutzer hat **genau ein Standardmodell**; es wird bei der Einrichtung (8.1) mit den Angaben des Nutzers angelegt.
- Zeiträume dürfen sich **nicht überschneiden**. Für einen Tag gilt der Zeitraum, der ihn enthält, sonst das Standardmodell.
- Beispiel: Standard 20 h/Woche; Zeitraum 01.02.2027–10.04.2027 mit 40 h/Woche.
- **Offene Zeiträume** (E-20): Der zeitlich letzte Zeitraum darf ohne Ende sein, z. B. „ab 01.05.2027 dauerhaft 30 h“. So ändert man die Arbeitszeit dauerhaft, ohne das Standardmodell umzustellen – denn eine Änderung am **Standardmodell** wirkt rückwirkend auf alle Tage ohne Zeitraum (die Oberfläche weist darauf hin).

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

- Die automatische Pause wird **starr** abgezogen, ohne Kappung (E-21): Bei 6:10 h Blockzeit hätte man gesetzlich 30 min Pause machen müssen, also ergeben sich 5:40 h Ist.
- **Mehrere Blöcke mit zu kurzer Lücke** (z. B. 07:00–12:00 und 12:10–17:00 = 9:50 h mit 10 min Lücke): Es zählt nur die tatsächliche Lücke (Ist 9:50 h); die Anwendung zeigt den **Hinweis** „Mindestpause unterschritten (45 min nötig)“ (E-22).
- Unterschreitet eine **manuelle** Pause die gesetzliche Mindestpause, wird sie trotzdem verwendet; die Anwendung zeigt einen Hinweis.
- Eine manuelle Pause größer als die Blockzeit wird abgelehnt.

### 6.3 Soll-Zeit eines Tages

```
Modell(Tag)   = Zeitraum, der den Tag enthält, sonst Standardmodell
Tagessoll     = Modell.weekly_min / Anzahl(Modell.workdays)     wenn Wochentag ∈ Modell.workdays
              = 0                                                sonst
Soll(Tag)     = 0                                                wenn gesetzlicher Feiertag und Modell.holidays_credited
              = Tagessoll × (1 − Abwesenheitsanteil)             sonst
```

- `Abwesenheitsanteil` = `absence_fraction` bei `vacation`, `sick`, `other_paid`; bei Freizeitausgleich (`comp_time`) **0** – das Soll bleibt bestehen, das fehlende Ist baut Überstunden ab.
- Rundung: Das Tagessoll wird auf ganze Minuten gerundet (kaufmännisch). Beispiel 38,5 h an 5 Tagen = 462 min. Halber Tag Urlaub bei 462 min → 231 min.
- **Feiertage nicht angerechnet** (E-27): Ein Feiertag auf einem Arbeitstag hat das normale Tagessoll; wer nicht arbeitet, hat ein Minus, das an anderen Tagen nachgeholt wird. Der Tag wird als „Feiertag (nicht angerechnet)“ angezeigt. Urlaub und Krankheit an so einem Tag sind möglich und mindern das Soll wie sonst. Für Urlaub und Krankheit gibt es keine solche Einstellung.
- Tage vor `tracking_start` haben kein Soll (werden als „nicht erfasst“ angezeigt).
- **Künftige Tage**: Ihr Soll wird angezeigt, zählt aber erst ab dem Tag selbst zum Saldo (siehe 6.4).

### 6.4 Saldo und Überstundenkonto

```
Saldo(Tag)          = Ist(Tag) − Soll(Tag)
Wertung(Tag)        = Saldo(Tag)              für tracking_start ≤ Tag < heute   (abgelaufene Tage)
                    = max(0, Saldo(heute))    für Tag = heute
                    = 0                       für künftige Tage und Tage vor tracking_start
Saldo(Zeitraum)     = Σ Wertung(Tag) im Zeitraum
Überstundenkonto    = overtime_start_minutes + Σ Wertung(Tag) aller Tage
```

- **Minusstunden zählen erst nach Ablauf des Tages** (E-23): Am laufenden Tag gehen nur Plusstunden ins Konto ein (wer heute schon über dem Soll ist, sieht das sofort); ein Minus des heutigen Tages wird erst ab 00:00 des Folgetages gebucht. So stehen morgens nicht gleich −8 h da.
- In der Monats- und Jahresübersicht werden für den laufenden Monat **Soll abgelaufene Tage** (bis gestern) und **Soll gesamt (ganzer Monat)** getrennt gezeigt. Die Ist-Summe enthält immer alle erfassten Zeiten, auch die von heute.
- Kontostand am Ende jedes Monats (für die Jahresübersicht) = Überstundenkonto bis zum Monatsletzten.

### 6.4a Wochensoll (E-28)

Bei Modellen mit `distribution = weekly` zählt die **Woche** (ISO, Mo–So):

```
Wochensoll  = Σ Soll(Tag) der Woche        (Soll(Tag) wie in 6.3 auf den üblichen Tagen)
Wochensaldo = Σ Ist(Tag) der Woche − Wochensoll
```

- An welchen Tagen gearbeitet wird, ist egal; es gibt keinen Hinweis „Arbeit an einem freien Tag“.
- Tageszeilen zeigen nur das Ist (Soll als „W“), Soll und Saldo stehen in der KW-Zeile. Die Tagesseite zeigt Ist, Wochensoll und „noch offen“ der Woche.
- Abwesenheiten sind nur an üblichen Tagen möglich und mindern das Wochensoll um das Tagessoll (halbe Tage zur Hälfte).
- **Überstundenkonto:** Nach Ablauf der Woche (Sonntag 24:00) zählt der Wochensaldo; rechnerisch wird jedem Tag Ist − Soll zugeordnet. In der laufenden Woche zählt nur ein Plus gegenüber dem ganzen Wochensoll, gebucht auf heute.
- **Monatsgrenze:** Das Wochensoll wird nach den üblichen Tagen auf die Monate aufgeteilt, das Ist nach den Tagen, an denen gearbeitet wurde (E-29). Beispiel: übliche Tage Mo–Mi, KW 40/2026 (Mo 28.09.–So 04.10.) → das ganze Wochensoll liegt im September; Arbeit am Do 01.10. ist im Oktober ein Plus, im September fehlt sie. Die Woche als Ganzes ist ausgeglichen.
- Zusammen mit `holidays_credited = false` bildet das z. B. einen Werkstudenten-Vertrag ab: 20 h pro Woche, egal an welchen Tagen und egal, ob ein Feiertag dazwischen liegt.

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
- **Heiligabend (24.12.) und Silvester (31.12.)** sind keine Feiertage, aber **halbe Arbeitstage** (E-30): Fallen sie auf einen Arbeitstag, ist das Soll halb so groß (`Soll = Tagessoll × 0,5 × (1 − Abwesenheitsanteil)`).
  - Eine Abwesenheit an diesen Tagen gibt es nur als „ganzer Tag“ (= der verbleibende halbe Tag); sie zählt als **halber** Urlaubs- bzw. Krankheitstag.
  - Bei Modellen mit „Feiertage werden nicht angerechnet“ (E-27) gilt das volle Tagessoll.
  - Anzeige: „Heiligabend (halber Arbeitstag)“ bzw. „Silvester (halber Arbeitstag)“.
- Ein Bundesland-Wechsel des Nutzers wirkt sich auf alle Tage aus (auch rückwirkend). Ein zeitraumbezogenes Bundesland (Umzug) gibt es vorerst nicht (E-25).

### 6.8 Formate

- Dauer überall **zweifach**: `7:30 h` und dezimal `7,50 h` (auf zwei Nachkommastellen gerundet). In Tabellen steht die Stunden:Minuten-Form als Hauptwert und die Dezimalform daneben bzw. darunter in kleinerer Schrift.
- Salden immer mit Vorzeichen: `+1:15 h` / `−0:30 h` (echtes Minuszeichen).
- Uhrzeit `HH:MM` (24-Stunden-Format). Eingabe akzeptiert `8`, `8:15`, `08:15`, `0815` und `8.15`; `24:00` nur als Ende.
- Datum `TT.MM.JJJJ`, Wochentag kurz (`Mo`, `Di`, …), intern ISO.
- Datumsfelder sind **Textfelder** im Format `TT.MM.JJJJ`, keine Browser-Datumsfelder (`<input type="date">`): Deren Anzeige richtet sich nach der Spracheinstellung des Browsers und wäre z. B. auf einem englischen System amerikanisch (MM/TT/JJJJ). Eingabe akzeptiert `13.10.2026`, `1.2.2027`, `01.02.27`, `13,10,2026` (Komma, falls die Handy-Zahlentastatur keinen Punkt hat) und `13102026`.
- Urlaubstage mit einer Nachkommastelle, wenn nötig: `12,5 Tage`.

## 7. Funktionale Anforderungen

Priorität: **M** = Muss (MVP), **S** = Soll (kurz nach MVP), **K** = Kann (später).

### 7.1 Konto und Login

| ID | Anforderung | Prio |
|----|-------------|------|
| F-01 | Registrieren mit Nutzername und Passwort (mit Wiederholung) | M |
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
| F-12 | **Einrichtung** nach der Registrierung (Pflicht, ohne Vorbelegung): Bundesland, Beginn der Erfassung, Startsaldo Überstunden, Urlaubsanspruch pro Jahr, Standard-Arbeitszeitmodell. Bis dahin leitet jede Seite auf die Einrichtung um. Alle Werte später in den Einstellungen änderbar | M |
| F-13 | Urlaubsanspruch: Standard pro Jahr und abweichender Anspruch bzw. manueller Übertrag je Jahr | S |
| F-14 | Je Arbeitszeitmodell: **Verteilung** „feste Arbeitstage“ oder „Wochensoll“ und **Feiertage** „mindern das Soll“ oder „werden nicht angerechnet“; im Formular ist der übliche Fall vorausgewählt, in der Liste als Hinweis sichtbar | S |

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
| F-32 | Monatsübersicht: **Tabelle aller Tage** des Monats (Datum, Wochentag, Zeitblöcke, Pause, Ist, Soll, Saldo, **Konto**, Abwesenheit/Feiertag, Notiz). „Konto“ ist der Stand des Überstundenkontos am Ende des Tages, so dass jede Buchung nachvollziehbar ist (Tage ohne Buchung blass; Zukunft leer; in KW- und Monatszeile der Stand am Ende); auch in Excel („Konto (h)“) und PDF; Klick auf einen Tag öffnet die Tagesseite; Wochenenden und Feiertage optisch abgesetzt | M |
| F-33 | Monatsübersicht: **Wochen-Zwischenzeilen** „KW nn“ (6.5) | M |
| F-34 | **Jahresübersicht** für das aktuelle Jahr: 12 Monate mit Ist, Soll, Saldo, Überstundenkonto am Monatsende, Urlaubs- und Krankheitstage; Jahressummen; Urlaubskonto des Jahres | M |
| F-35 | Jahresübersicht: **andere Jahre** auswählbar (Blättern und Auswahlliste der Jahre mit Daten) | M |
| F-36 | Diagramm in der Jahresübersicht: Ist vs. Soll je Monat und Verlauf des Überstundenkontos (SVG, serverseitig) | K |
| F-37 | Druckfreundliche Monatsansicht (Druck-Stylesheet, ohne Navigation) | K |

### 7.5 Daten

| ID | Anforderung | Prio |
|----|-------------|------|
| F-40 | Backup: Ordner `data/` kopieren genügt; automatische Sicherungskopie vor jedem Schreiben | M |
| F-41 | **Export für Excel** (`.xlsx`) für ganze Monate von … bis: Blatt „Tage“ (eine Zeile pro Tag mit Zeiten, Pause, Ist/Soll als Excel-Dauer `[h]:mm` und dezimal, Saldo, Abwesenheit, Feiertag, Hinweise, Notiz), Blatt „Monate“ (Summen und Konto am Monatsende), Blatt „Wochen“ (Ist, Soll, Saldo je KW), Blatt „Info“ (Nutzer, Zeitraum, Einstellungen) | S |
| F-42 | **Export als PDF** (Stundennachweis): eine Seite pro Monat mit Summen, Tagestabelle und KW-Zeilen; bei mehreren Monaten zusätzlich eine Jahresübersicht je Jahr; Seitenzahlen | S |
| F-43 | **Datensicherung** als JSON-Datei mit allen Daten des Nutzers (Format siehe 7.6) | S |
| F-44 | **Import** einer Sicherungsdatei: „nur Tage übernehmen“ (gleiche Tage werden überschrieben, alles andere bleibt) oder „alles ersetzen“ (mit Bestätigung). Die Datei wird vorher vollständig geprüft; bei einem Fehler wird nichts übernommen. Vor der Einrichtung kann eine Sicherung statt der Einrichtung eingespielt werden | S |
| F-45 | Schnell-Links „Export PDF/Excel“ in Monats- und Jahresübersicht | S |

### 7.6 Format der Datensicherung

```json
{
  "format": "stundenerfassung-export",
  "version": 1,
  "app_version": "0.2.0",
  "exported_at": "2026-10-15T09:30:00.000Z",
  "username": "moritz",
  "settings": { "state": "NW", "tracking_start": "2026-09-01", "overtime_start_minutes": 195, "vacation_days_default": 30 },
  "work_schedules": [
    { "valid_from": null, "valid_to": null, "weekly_min": 2400, "workdays": [1, 2, 3, 4, 5],
      "distribution": "fixed", "holidays_credited": true, "note": "" },
    { "valid_from": "2027-02-01", "valid_to": "2027-04-10", "weekly_min": 1200, "workdays": [1, 2, 3],
      "distribution": "weekly", "holidays_credited": false, "note": "Werkstudent" }
  ],
  "vacation_entitlements": [ { "year": 2026, "days": 12.5, "carryover_days": null } ],
  "days": [
    { "date": "2026-10-07", "blocks": [ { "start": "07:30", "end": "12:00" }, { "start": "12:45", "end": "16:00" } ],
      "manual_break_min": null, "absence_type": null, "absence_fraction": null, "note": "" }
  ]
}
```

- Uhrzeiten als `HH:MM`, Dauern in Minuten, Datum ISO – die Datei ist von Hand lesbar und bearbeitbar.
- Beim Import gelten dieselben Regeln wie beim Erfassen (keine Überschneidungen, Pause nur bei einem Block, Krankheit nur ganztags, genau ein Standardmodell, keine überlappenden Zeiträume). Abwesenheiten an Tagen ohne Soll werden beim Import nicht abgelehnt.
- `version` wird bei Änderungen am Format erhöht; ältere Versionen werden beim Import umgewandelt, unbekannte abgelehnt.

## 8. Abläufe

### 8.1 Registrierung und erste Schritte

1. Nicht angemeldet → Login-Seite mit Link „Registrieren“.
2. Registrieren: Nutzername, Passwort, Passwort wiederholen.
3. Danach ist der Nutzer angemeldet und landet auf der **Einrichtung** (`/einrichtung`). Alle Felder sind leer und Pflicht – es gibt keine Vorbelegung:
   - Bundesland,
   - Beginn der Erfassung (Datum),
   - Startsaldo Überstunden (Plus/Minus, `h:mm` oder Dezimal; „0“ muss bewusst eingetragen werden),
   - Urlaubsanspruch pro Jahr (Tage, halbe Tage möglich),
   - Wochenarbeitszeit und Arbeitstage des Standardmodells.
4. Bis die Einrichtung gespeichert ist, leiten alle anderen angemeldeten Seiten dorthin um (außer Abmelden und Darstellung).
5. Danach Dashboard; abweichende Zeiträume können in den Einstellungen ergänzt werden.

### 8.2 Einen Tag erfassen

1. „+ Heute“ in der Navigation oder Klick auf einen Tag in der Monatsübersicht → `/tag/JJJJ-MM-TT`.
2. Die Seite zeigt die vorhandenen Zeitblöcke als Zeilen (Beginn – Ende) und eine leere Zeile für einen weiteren Block; „+ weiterer Block“ fügt eine Zeile hinzu (ohne JavaScript: es gibt immer eine freie Zeile, nach dem Speichern eine neue).
3. Feld „Pause (min)“ – nur sichtbar/aktiv bei genau einem Block; Platzhalter zeigt die automatische Pause („automatisch: 30“).
4. Abwesenheit: keine / Urlaub / krank / Freizeitausgleich / Sonstiges, ganzer oder halber Tag (krank nur ganzer Tag).
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
| Einrichtung | `GET/POST /einrichtung` | Pflichtangaben nach der Registrierung (F-12) |
| Einstellungen | `GET/POST /einstellungen` | Bundesland, Beginn der Erfassung, Startsaldo, Urlaub-Standard, Passwort |
| Arbeitszeitmodelle | `GET /einstellungen/arbeitszeit`, `GET/POST …/neu`, `…/:id/bearbeiten`, `POST …/:id/loeschen` | Standardmodell + Zeiträume |
| Urlaubsansprüche | `GET/POST /einstellungen/urlaub` | Anspruch und Übertrag je Jahr |
| Darstellung | `POST /einstellungen/darstellung` | Theme speichern (per `fetch`, ohne JS als Formular) |
| Import & Export | `GET /daten` | Formulare für Export und Links zu Sicherung/Import |
| Export | `GET /daten/export?format=excel\|pdf&von=JJJJ-MM&bis=JJJJ-MM` | auch `von_m`/`von_j`/`bis_m`/`bis_j` aus dem Formular |
| Datensicherung | `GET /daten/sicherung` | JSON-Datei (F-43) |
| Import | `GET/POST /daten/import` | Datei-Upload (multipart, max. 10 MB); auch vor der Einrichtung |
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
| `release.yml` | Release veröffentlicht, oder von Hand („Run workflow“ mit Tag) | Tag `vX.Y.Z` = `package.json`; Tests; Multi-Arch-Image (`amd64`, `arm64`) nach ghcr.io mit Tags `X.Y.Z`, `X.Y`, `X`, `latest` (Vorabversionen ohne `latest`) |

**Versionen:** Die Software trägt die Version des nächsten Releases (aktuell `0.2.0`). Die Version in `package.json` wird nur beim Release geändert, nicht bei jeder Änderung. Das Release wird auf dem Commit getaggt, dessen `package.json` diese Version enthält – sonst bricht der Release-Workflow mit einer Meldung ab.

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
- Direkte Weitergabe an den Arbeitgeber (PDF/Excel werden nur heruntergeladen).
- Import aus Excel oder fremden Formaten (Import liest nur die eigene Sicherungsdatei).
- Rundungsregeln (immer minutengenau).
- Verfall von Resturlaub, regionale Feiertage (z. B. Augsburger Friedensfest, Mariä Himmelfahrt in Teilen Bayerns).
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
| E-19 | Halbe Tage | Bei Urlaub, Freizeitausgleich und sonstiger Freistellung möglich, nicht bei Krankheit. |
| E-20 | Offene Zeiträume | Der zeitlich letzte Zeitraum eines Arbeitszeitmodells darf ohne Enddatum sein. |
| E-21 | Automatische Pause | Starr nach Tabelle (30 min über 6 h, 45 min über 9 h), keine Kappung an der Schwelle. |
| E-22 | Kurze Lücken | Bei mehreren Blöcken zählt nur die tatsächliche Lücke; Hinweis, wenn die Mindestpause unterschritten ist. |
| E-23 | Laufender Tag | Minusstunden zählen erst nach Ablauf des Tages; Plusstunden sofort. |
| E-24 | Freizeitausgleich | Soll bleibt bestehen, Ist 0 → baut Überstunden ab. |
| E-25 | Bundesland | Ein Bundesland pro Nutzer, nicht zeitraumbezogen. |
| E-26 | Startwerte | Keine Standardwerte; der Nutzer trägt alles bei der Einrichtung nach der Registrierung ein. |
| E-27 | Feiertage nicht angerechnet | Einstellung je Arbeitszeitmodell (Default: Feiertage mindern das Soll). Gilt nur für Feiertage, nicht für Urlaub/Krankheit. |
| E-28 | Wochensoll | Einstellung je Arbeitszeitmodell „feste Arbeitstage“ (Default) oder „Wochensoll“; Minus erst nach Ablauf der Woche. |
| E-29 | Woche über Monatsgrenze | Aufteilung nach den üblichen Tagen. Alternative für später: ganze Woche zum Monat ihres Donnerstags (ISO). |
| E-30 | Heiligabend/Silvester | Halbe Arbeitstage (halbes Soll, Abwesenheit zählt halb); nicht bei „Feiertage nicht angerechnet“. |
| E-31 | Konto in der Monatsübersicht | Spalte mit dem Stand des Überstundenkontos am Ende jedes Tages. |

### 13.2 Offene Fragen

Aktuell keine.

Für später vorgemerkt: Woche über eine Monatsgrenze ganz dem Monat ihres Donnerstags zuordnen (ISO-Regel) statt Aufteilung nach üblichen Tagen (E-29).

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
| M7.1 | **Import & Export** | F-41 bis F-45: Excel, PDF, Datensicherung und Import. |
| M7.2 | **Flexible Verträge** | F-14: Wochensoll und nicht angerechnete Feiertage (E-27 bis E-29). |
| M8 | **Ausbau** | F-06, F-36, F-37, Stempeluhr nach Bedarf. |

**Stand des Prototyps:** M0 bis M7.2 sind umgesetzt, F-37 (Druck-Stylesheet) in einfacher Form. Offen sind F-06 (Handbuch), F-36 (Diagramme) und die Stempeluhr.

Bekannte Einschränkungen:

- „Abwesenheit für einen Zeitraum“ (F-26) trägt nur ganze Tage ein und überschreibt vorhandene Abwesenheiten im Zeitraum; halbe Tage werden direkt am Tag erfasst.
- Ein geändertes Bundesland oder Standardmodell wirkt rückwirkend (siehe 5.2, 6.7).
- Der JSON-Speicher ist für **eine** laufende Instanz gedacht.

## 15. Lizenz

Das Projekt steht unter der **GNU General Public License v3.0** (siehe [`LICENSE`](LICENSE)); in der `package.json` `"license": "GPL-3.0-or-later"`.

## 16. Änderungshistorie

| Version | Änderungen |
|---------|------------|
| v0.1 | Erster Entwurf auf Basis der Abstimmung: mehrere Zeitblöcke pro Tag, Pausenregel, Arbeitszeitmodelle mit Zeiträumen, Abwesenheiten mit halben Tagen, Feiertage nach Bundesland, Urlaubskonto, Monats- und Jahresübersicht, Technik angelehnt an das Haushaltsprojekt, Port 3002, Primärfarbe Indigo. |
| v0.2 | Offene Fragen geklärt (E-19 bis E-26): keine halben Krankheitstage; offene Zeiträume; starre automatische Pause; Hinweis bei zu kurzen Lücken; Minusstunden erst nach Ablauf des Tages; Freizeitausgleich baut Überstunden ab; ein Bundesland pro Nutzer; keine Standardwerte, stattdessen Pflicht-Einrichtung nach der Registrierung. |
| v0.2.1 | Datumsfelder als Textfelder im deutschen Format statt Browser-Datumsfelder (6.8). |
| v0.3 | Import & Export (F-41 bis F-45, Format der Datensicherung in 7.6, Routen in Kap. 9); Vorschläge F9 (nicht angerechnete Feiertage) und F10 (Wochensoll für wechselnde Arbeitstage) als offene Fragen. |
| v0.4 | F9/F10 entschieden und umgesetzt: Arbeitszeitmodell mit `distribution` (feste Arbeitstage / Wochensoll, 6.4a) und `holidays_credited` (E-27 bis E-29); Excel-Blatt „Wochen“. |
| v0.5 | Heiligabend und Silvester als halbe Arbeitstage (E-30, 6.7); Spalte „Konto“ mit dem Tagesstand des Überstundenkontos in Monatsübersicht, Excel und PDF (E-31, F-32). |
