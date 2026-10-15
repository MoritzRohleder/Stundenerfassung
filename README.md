# Stundenerfassung

Prototyp einer selbst gehosteten Webanwendung zum **privaten Nachhalten der eigenen Arbeitszeit** – als Gegenprobe zur Zeiterfassung des Arbeitgebers.

- Mehrere Zeitblöcke pro Tag, Pause automatisch (30 min ab 6 h, 45 min ab 9 h), manuell oder aus den Lücken zwischen den Blöcken
- Soll nach Wochenarbeitszeit, mit abweichenden Zeiträumen (z. B. vorübergehend 40 statt 20 Stunden)
- Gesetzliche Feiertage aller Bundesländer, Urlaub (auch halbe Tage), Krankheit, Freizeitausgleich
- Überstundenkonto und Urlaubskonto
- Dashboard, Monatsübersicht mit Wochensummen, Jahresübersicht mit allen früheren Jahren
- Jede Dauer als `7:30 h` und `7,50 h`; Hell/Dunkel pro Nutzer
- Export als Excel (`.xlsx`) und PDF (Stundennachweis), Datensicherung als JSON und Import (Einstellungen → Import & Export)

Die fachlichen Regeln stehen in der Spezifikation [`Stundenerfassung-Spec.md`](Stundenerfassung-Spec.md).

## Lokal starten

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # mit automatischem Neustart
npm test
```

Daten liegen im Ordner `data/` (JSON-Dateien). Nur dieser Ordner muss gesichert werden.

Um Daten von einem Rechner auf einen anderen (z. B. vom lokalen Test auf den Heimserver) zu bringen: unter *Einstellungen → Import & Export* die Sicherung herunterladen und auf dem anderen System nach der Registrierung unter „Sicherung importieren“ einspielen.

## Auf dem Heimserver mit Docker

```bash
cp .env.example .env     # anpassen
docker compose up -d     # http://<server>:3002
```

- `docker-compose.yml` zieht das Image `ghcr.io/moritzrohleder/stundenerfassung` (wird beim Veröffentlichen eines Releases gebaut). Solange es noch kein Release gibt: `docker compose up -d --build` baut das Image lokal.
- Daten liegen im Volume `stundenerfassung-data`.
- Aktualisieren: `docker compose up -d` (holt die neueste Version).

### HTTPS über Reverse Proxy

Beispiel mit Caddy:

```
stunden.example.de {
  reverse_proxy localhost:3002
}
```

Dann in `.env` `COOKIE_SECURE=true` und `TRUST_PROXY=1` setzen.

## Konfiguration

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `PORT` | `3000` | Port im Container bzw. lokal |
| `DATA_DIR` | `./data` | Datenordner |
| `SESSION_SECRET` | automatisch in `data/.session-secret` | Schlüssel für das Session-Cookie |
| `COOKIE_SECURE` | `false` | `true` hinter HTTPS (aktiviert auch HSTS) |
| `TRUST_PROXY` | `false` | Anzahl der Reverse Proxys |
| `TZ` | Systemzeit | z. B. `Europe/Berlin` – bestimmt, wann „heute“ ist |

## Lizenz

GNU GPL v3 (siehe [`LICENSE`](LICENSE)).
