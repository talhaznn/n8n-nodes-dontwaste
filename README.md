# DontWaste for self-hosted n8n

Read one authorized household and manage its inventory and shopping list. Recipes
and meal plans are read-only. The trigger polls DontWaste; your n8n server does
not need a public incoming webhook.

## Install and connect

You need a self-hosted n8n instance with community packages enabled, an owner or
admin account, and DontWaste 3.27.0 or newer with a cloud household. The new app
version must be available on your phone before you create this connection.
Installation and execution have been tested with **n8n 2.40.7**. This is a
community package for self-hosted n8n, not a verified n8n Cloud integration.

1. In n8n, open **Settings → Community nodes → Install**.
2. Enter `n8n-nodes-dontwaste`, review n8n's package notice and install it.
   The package source is [talhaznn/n8n-nodes-dontwaste](https://github.com/talhaznn/n8n-nodes-dontwaste).
3. In DontWaste, open **Settings → n8n**, choose a household, name the connection
   and select its permissions. Existing connections never gain write permissions
   automatically. A Google or Apple login is sufficient.
4. Copy the household ID and the key shown once into **DontWaste household** credentials
   in n8n. Run the credential test or **Test Connection**.
5. Import one of the JSON files from `examples/` and select your credential in
   every DontWaste node. All examples start inactive.

The [HTTP interface](https://github.com/talhaznn/n8n-nodes-dontwaste/blob/main/docs/AUTOMATION_API_V1.md)
can also be used with n8n's HTTP Request node. The fixed endpoint is
`https://cloud.dontwaste.app/integrations/automation/v1`.
Keys belong in n8n credentials, never workflow JSON or URLs. Revoke a connection
in DontWaste when it is no longer needed. A lost key requires a new connection.

## Actions and confirmation

The action node reads inventory, shopping, saved recipes and meal plans. It can
add, edit, consume, discard or remove stock and add, edit, check or remove shopping
items. Checking an item does not record a purchase. Removing stock does not
record consumption. Consumption and discarding accept explicit quantities and
compatible units; the service never guesses a package size.

**Operation Key** is required for writes. Use the triggering `event_id` or another
stable business identifier. Keep that key when retrying a failed execution. A new
intentional change needs a new key. The node checks receipts before retrying a
write. The same household, node, command and key produce the same request ID.

A revision conflict means another device changed the entry. Read it again and
review the intended amount. Do not blindly retry with a fresh key. A timeout does
not mean the operation failed: retry with the original key to obtain its receipt.
An `applied` receipt confirms the backend transaction, not whether an offline
phone has already synchronized it.

## Polling trigger

Activation establishes a cursor at the current household revision. Earlier
changes are skipped. Choose the polling interval in n8n (60 seconds is a useful
starting point). Pages contain up to 100 changes and stable event IDs. More pages
are read on later polls. No changes are silently skipped because of a display
limit.

Use event IDs for deduplication in downstream systems as well. A failed workflow
can receive an event again. Manual setup produces a `test_only` event and never
changes inventory. **Reset Cursor** intentionally skips older changes; turn it
off after the reset. Changing the credential or household starts a new cursor.
Revocation or expired cursors produce an error, rather than an empty list.

## Examples

- `due-inventory.json`: manual review of dated stock, including opening shelf life.
- `shopping-changes.json`: polling shopping events; outputs the stable event ID.
- `confirmed-consumption.json`: a manually started, explicitly configured partial
  consumption. Select an entry, quantity, unit and a unique business key before
  running it. Never attach this example to a timer without deciding when a
  consumption is actually confirmed.

## Updates and manual installation

Use **Settings → Community nodes** to update the installed package. Back up your
n8n data first; credentials and saved workflows must stay in the persistent n8n
volume. If installation through the UI is disabled by your administrator, install
`n8n-nodes-dontwaste@1.0.0` in `~/.n8n/nodes` and restart n8n. For Docker, run the
installation as the n8n user in the persistent volume. Do not install globally.

For an offline package, build with `npm ci && npm pack`, then install the
resulting `.tgz` in the same directory. Internet access to DontWaste Cloud is
still needed to read or change household data.

## Troubleshooting and verification

If the credential test fails, check the household ID, key and permissions in
DontWaste. Revoked connections require a new key. Reconnect after losing household
membership; changing a workflow's household ID does not grant access to it.
Report problems in [Issues](https://github.com/talhaznn/n8n-nodes-dontwaste/issues)
with the package/n8n versions and error code, without keys or household contents.

`npm test` checks receipt recovery, revisions, pagination, event identity and
node behavior. The additional [runtime fixture](https://github.com/talhaznn/n8n-nodes-dontwaste/blob/main/test/runtime/README.md) verifies
installation and receipt recovery in an isolated n8n instance. A test against
your own installation and phone remains necessary before relying on a workflow.
