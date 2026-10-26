# Life360-Integration für Gladys Assistant

Diese Integration bringt die Mitglieder deiner [Life360](https://www.life360.com)-Kreise in
Gladys: wer zu Hause ist, wo alle sind, den Akku ihres Telefons und ihre Entfernung von zu Hause.
Zum Beispiel: die Alarmanlage einschalten, wenn die letzte Person geht, die Heizung hochdrehen,
wenn jemand auf dem Heimweg ist, oder eine Nachricht bekommen, wenn ein Akku schwach wird.

> Life360 hat keine offizielle öffentliche API. Die Integration nutzt die API der Life360-App,
> wie die Home-Assistant-Integration. Life360 kann sie ohne Vorwarnung ändern.

## Voraussetzungen

- Gladys Assistant **5.3 oder neuer**.
- Ein Life360-Konto, das Mitglied der zu folgenden Kreise ist.
- Am besten die Koordinaten deines Hauses in Gladys (**Einstellungen → Häuser**): Sie dienen dazu,
  „zu Hause“ zu erkennen und die Entfernung von zu Hause zu berechnen.

## 1. Dein Life360-Zugriffstoken holen

Life360 lehnt Anmeldungen mit Benutzername und Passwort inzwischen oft ab (es verlangt einen
Bestätigungscode, den die Integration nicht eingeben kann). Der zuverlässige Weg: das
Zugriffstoken einmal von der Life360-Website kopieren.

1. Öffne auf einem Computer ein privates Browserfenster und gehe zu <https://life360.com/login>.
2. Öffne die Entwicklertools (**F12**) und dann den Tab **Netzwerk**. Gib `token` in das
   Filterfeld ein.
3. Melde dich bei Life360 an (E-Mail oder Telefon, dann der Code, den Life360 dir schickt).
4. Klicke auf die erscheinende Anfrage `token` (ein `POST` an `/v3/oauth2/token`) und dann auf den
   Tab **Antwort** (oder **Vorschau**).
5. Kopiere den Wert von `access_token` (eine lange Folge aus Buchstaben und Ziffern).

Halte dieses Token geheim: Es gibt Zugriff auf die Standorte deiner Kreise. Es bleibt mehrere
Wochen gültig; wenn Life360 es ablehnt, zeigt der Konfigurationsbildschirm das an, und du kopierst
auf dieselbe Weise ein neues.

## 2. Die Integration konfigurieren

Öffne in Gladys **Integrationen → Life360 → Konfiguration**:

| Feld                            | Was eintragen                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Anmeldemethode                  | **Zugriffstoken** (empfohlen) oder **Benutzername und Passwort**.                                              |
| Zugriffstoken                   | Das oben kopierte `access_token`. Das Präfix `Bearer` ist optional.                                            |
| Benutzername / Passwort         | Nur für die Methode Benutzername und Passwort. Gespeichert wird das Token von Life360, nicht das Passwort.     |
| Zu folgende Kreise              | Kreisnamen, durch Kommas getrennt, z. B. `Familie, Großeltern`. Leer: alle Kreise.                             |
| Zuhause                         | Das Gladys-Haus, das „zu Hause“ bedeutet. Leer: das erste Haus mit Koordinaten.                                |
| Life360-Ort für Zuhause         | Der Name deines Life360-Orts für zu Hause (Standard `Home`). Leer: nur die Koordinaten.                        |
| Radius um Zuhause (m)           | Entfernung vom Haus, die noch als „zu Hause“ zählt (Standard 150 m).                                           |
| Aktualisierungsintervall (s)    | Wie oft Life360 abgefragt wird (Standard 60 s, mindestens 15 s). Life360 begrenzt die Anfragen: nicht weniger. |
| Schwelle für schwachen Akku (%) | Unter diesem Wert löst „Akku des Telefons schwach“ aus (Standard 20 %).                                        |
| Ausführliche Logs               | Protokolliert jede Abfrage, zur Fehlersuche. Tokens und Passwörter werden nie protokolliert.                   |

Speichere und drücke dann **Verbindung testen**: Die Antwort listet die Kreise, die Mitglieder und
das als Zuhause verwendete Haus.

## 3. Die Mitglieder hinzufügen

Öffne den Tab **Erkennung** der Integration: Jedes Mitglied der verfolgten Kreise erscheint als
Gerät mit dem Namen `<Vorname> <Nachname> (Life360)`. Lege die gewünschten an. Ein Mitglied in
mehreren Kreisen ist ein einziges Gerät.

Jedes Gerät hat diese Funktionen:

| Funktion           | Werte                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| At home            | 1 zu Hause, 0 abwesend.                                                       |
| Phone battery      | Akku des Telefons des Mitglieds, in %.                                        |
| Phone charging     | 1, solange das Telefon lädt.                                                  |
| Distance from home | In km, vom Gladys-Haus aus (kein Wert, wenn das Haus keine Koordinaten hat).  |
| Speed              | In km/h, 0 im Stillstand.                                                     |
| Place              | Der Life360-Ort (Zuhause, Schule…), sonst die Adresse, sonst die Koordinaten. |

**Wie „zu Hause“ bestimmt wird:** Ein Mitglied ist zu Hause, wenn sein Standort innerhalb des
Radius um das Gladys-Haus liegt, **oder** wenn Life360 es an dem unter „Life360-Ort für Zuhause“
angegebenen Ort sieht. Die Genauigkeit des Telefonstandorts wird berücksichtigt, bis zum Radius
selbst.

Das Abzeichen jedes Geräts zeigt **cloud**, wenn Life360 geantwortet hat, einen orangen Punkt,
wenn Life360 keinen Standort für dieses Mitglied hat (Standortfreigabe aus, Telefon stumm), und
**nicht erreichbar**, wenn Life360 nicht erreicht werden konnte.

## Szenen

### Auslöser

Alle Auslöser können auf ein Mitglied gefiltert werden, die Orts-Auslöser auch auf einen Ortsnamen.
Jeder gibt der Szene die Variablen `member_name`, `place`, `address`, `battery` und `distance_km`.

| Auslöser                         | Schlüssel         | Wann                                                           |
| -------------------------------- | ----------------- | -------------------------------------------------------------- |
| Mitglied ist nach Hause gekommen | `arrived_home`    | Das Mitglied ist wieder zu Hause.                              |
| Mitglied hat das Haus verlassen  | `left_home`       | Das Mitglied ist nicht mehr zu Hause.                          |
| Mitglied an einem Ort angekommen | `place_arrived`   | Das Mitglied hat einen Life360-Ort betreten (Schule, Arbeit…). |
| Mitglied hat einen Ort verlassen | `place_left`      | Das Mitglied hat einen Life360-Ort verlassen.                  |
| Mitglied fährt los               | `driving_started` | Life360 hat erkannt, dass das Mitglied fährt.                  |
| Akku des Telefons schwach        | `battery_low`     | Das Telefon ist unter die Schwelle gefallen und lädt nicht.    |

Die Auslöser vergleichen zwei aufeinanderfolgende Abfragen: Ein Neustart der Integration löst nie
„nach Hause gekommen“ für alle aus. Die Funktion „At home“ funktioniert auch mit dem
Standard-Auslöser **Gerätezustand**.

### Aktionen

| Aktion                     | Schlüssel                 | Ergebnis                                                                                                                                      |
| -------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Ein Life360-Mitglied orten | `request_location_update` | Fordert vom Telefon des Mitglieds einen frischen Standort an. Ausgabe: `requested`.                                                           |
| Ein Life360-Mitglied lesen | `get_member_status`       | Ausgaben `found`, `at_home`, `place`, `distance_km` (-1 unbekannt), `battery` (-1 unbekannt), `charging`, `driving`, `last_seen` (ISO-Datum). |

## Dashboard-Widget

Füge das Widget **Life360-Kreis** zu einem Dashboard hinzu: Akku-Kacheln der ersten Mitglieder,
eine Zeile pro Mitglied (grün zu Hause), die Uhrzeit der letzten Abfrage, ein Knopf
**Aktualisieren** und ein Knopf **Alle orten** (fordert nach einer Bestätigung von jedem Telefon
einen frischen Standort an).

## Fehlerbehebung

- **„Life360 hat das Zugriffstoken abgelehnt“**: Das Token ist abgelaufen oder falsch kopiert.
  Kopiere ein neues (Schritt 1).
- **„Life360 hat die Anmeldung abgelehnt“** mit Benutzername und Passwort: Life360 will einen
  Bestätigungscode. Wechsle zur Zugriffstoken-Methode.
- **„Life360 begrenzt die Anfragen“**: Die Integration wartet so lange, wie Life360 es verlangt,
  und macht dann weiter. Erhöhe das Aktualisierungsintervall.
- **Ein Mitglied ist immer abwesend**: Prüfe die Koordinaten des Gladys-Hauses, vergrößere den
  Radius oder gib den Namen deines Life360-Orts für zu Hause ein.
- **Kein Standort für ein Mitglied**: Es hat die Standortfreigabe in der Life360-App
  ausgeschaltet, oder sein Telefon hat sich länger nicht gemeldet (Energiesparmodus, kein Netz).

## Datenschutz

Token und Passwort bleiben in den geheimen Feldern der Integration und werden nur an Life360
gesendet. Die Standorte werden nur in deinem Gladys veröffentlicht. Siehe
[SECURITY.md](https://github.com/prohand/gladys-life360/blob/main/SECURITY.md).
