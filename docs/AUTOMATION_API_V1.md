# Automationsvertrag v1

Stand 26.09.2026. Der neue Vertrag ergänzt die bestehenden HA-, Siri- und
MCP-Routen. Er führt keine Haushalte in ein anderes Syncprotokoll über. Eine
Backendbereitstellung ist Voraussetzung für die neuen Clients.

## Zugang und Bindung

Basis: `https://cloud.dontwaste.app/integrations/automation/v1`.
Alle Aufrufe sind JSON-POSTs mit diesen Headern:

```http
Authorization: Bearer <Installationsschlüssel>
X-DontWaste-Scope: <Haushalts-UUID>
Content-Type: application/json
```

Verbindungen gelten für genau eine Installation und einen Haushalt. Schlüssel
sind widerrufbar und gehören in den Zugangsspeicher des Clients. Keine Schlüssel
in URLs, Exporten oder Diagnosen. Browseraufrufe mit Origin werden abgewiesen.

`households:read` erlaubt Vorrat und Einkauf zu lesen; `inventory:write` und
`shopping:write` erlauben die jeweiligen Änderungen. `recipes:read` und
`planning:read` sind getrennte Lesefreigaben. Änderungen an Rezepten oder Plänen
sind über diese Route nicht verfügbar. Bestehende HA-Schlüssel bleiben lesend.

## Lesen und Ereignisse

| Endpunkt | Anfrage | Ergebnis |
|---|---|---|
| `/health` | `{}` | Haushalt, Abrufzeit, Rechte, Zusammenfassung, Fähigkeiten |
| `/read` | `{"entity":"products","limit":50}` | `items`, `revision`, `next`, Haushalt und Zeit |
| `/changes` | `{"after":123,"limit":100}` | `events`, `cursor`, `has_more`, Haushalt und Zeit |
| `/receipt` | `{"request_id":"<UUID>"}` | gespeicherter Beleg oder `status: not_applied` |

Gültige Entitäten: `products`, `shopping`, `recipes`, `meal_plans`. Jede Zeile
enthält `entity_id`, `revision` und `body`. Die ID ist die logische Haushalts-ID;
verwende keine globale Katalog- oder interne Speicher-ID.

Folgende Leseseiten übergeben `after: <next>` und `at_revision: <revision der
Erstseite>`. Ein Revisionswechsel verlangt einen vollständigen neuen Abruf.
Maximal 100 Zeilen je Seite. Zu große Antworten werden ausdrücklich abgewiesen,
nicht still gekürzt.

Änderungen tragen eine stabile `event_id` aus Haushalt und Revision, Entität,
Eintrags-ID, Löschmarkierung, Daten und Zeitpunkt. Cursor erst nach erfolgreicher
Verarbeitung fortschreiben. Wiederauslieferungen haben dieselbe Kennung. Ein
abgelaufener Cursor wird mit `409 cursor_expired` gemeldet; nach bewusstem
Neuabgleich kann bei der aktuellen Revision begonnen werden. Ein Datenabruf
behauptet keine Aktualität noch nicht synchronisierter Handydaten.

## Änderungen

```json
{
  "request_id": "c511f441-3bb9-4b0e-bf06-8786a263e25b",
  "target_revision": 123,
  "command": {
    "action": "inventory_consume",
    "id": "<Eintrags-ID>",
    "quantity": 250,
    "unit": "ml"
  }
}
```

Der Auftrag geht an `/command`. UUID vor dem Senden dauerhaft speichern.
Wiederholungen verwenden denselben vollständigen Auftrag. Derselbe Schlüssel mit
geändertem Inhalt wird zurückgewiesen. Für bestehende Einträge ist die zuletzt
gelesene `target_revision` Pflicht. Beim Anlegen entfällt sie.

| Aktion | Felder zusätzlich zu `action` |
|---|---|
| `inventory_add` | `name`, `quantity`, `unit`, `expiration_date` (Datum oder null); optional Kategorie, Barcode, Marke, Kaufdatum |
| `inventory_quantity` | `id`, `quantity`, `unit` |
| `inventory_details` | `id`, `fields`: Name, Kategorie, Notiz, Lagerort, Marke, Kaufdatum, Preis |
| `inventory_expiry` | `id`, `expiration_date` (Datum oder null) |
| `inventory_opened` | `id`, `opened`, `opened_date`, `shelf_life_after_opening` |
| `inventory_consume` / `inventory_discard` | `id`; optional **gemeinsam** `quantity` und `unit`, sonst ganzer Eintrag |
| `inventory_remove` | `id` |
| `shopping_add` | `name`, `quantity`, `unit`, optional Kategorie |
| `shopping_quantity` | `id`, `quantity`, `unit` |
| `shopping_details` | `id`, `fields`: Name, Kategorie, Notiz, Supermarkt, Priorität, Preis, Erledigtzustand |
| `shopping_checked` | `id`, `checked` |
| `shopping_remove` | `id` |

`inventory_add` kann mit `purchase_confirmed: true` und einem ausdrücklich
bestätigten `purchase_date` eine Kaufbeobachtung liefern. Ohne diesen Nachweis
wird ein Zugang nicht als Kauf gelernt. Abhaken ist ebenfalls kein Kauf.
Datumsangaben sind `YYYY-MM-DD`. Unbekannte Haltbarkeit bleibt null. Mengen sind
positiv und höchstens 100.000. g/kg und ml/l werden umgerechnet; Packungsgrößen
werden nicht geraten. Namen dürfen 200, Eintrags-IDs 160 Zeichen lang sein.

Erfolg hat `status: applied` und `operation_id`. Vorratsänderung, Journal und
Beleg werden gemeinsam bestätigt. Bei einer Zeitüberschreitung `/receipt`
prüfen und gegebenenfalls denselben Auftrag wiederholen. `not_applied` ist kein
Beleg für Erfolg. Eine alte oder gelöschte Zeile niemals durch blindes Anlegen
ersetzen.

Fehler: 400 ungültige Anfrage, 401 ungültiger Zugang, 403 fehlende Rechte oder
Mitgliedschaft, 409 geänderter Stand/abgelaufener Cursor, 422 ungültige Menge oder
Einheit, 429 vorübergehendes Schutzlimit, 503 Dienst nicht erreichbar. Fehlertexte
enthalten keine vollständigen Serverantworten oder Zugangsdaten.

## Home-Assistant-Kopplung

`POST /integrations/pairing/start` nimmt Installationsnamen und gewünschte
Scopes an. Es liefert einen fünf Minuten gültigen App-Link und ein getrenntes
Geheimnis zum Abfragen. Der Nutzer bestätigt in DontWaste Haushalt und eine
Teilmenge der angefragten Rechte. `/pairing/poll` erhält `request_id` und
`secret` und liefert `pending` oder den verschlüsselt vorgehaltenen Zugang.
Erst ein erfolgreicher tatsächlicher Datenabruf schließt die HA-Einrichtung ab.
Kopplungsfehler, Abbruch und Ablauf erzeugen keine automatische Mehrberechtigung.

