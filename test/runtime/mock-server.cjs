// Isolated installation fixture. No production credentials or household data.
const https = require('node:https');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const household = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const product = 'runtime-product';
const receipts = new Map();
let quantity = 2, writes = 0, reads = 0, recovered = 0;
const save = () => fs.writeFileSync('/tmp/runtime-state.json', JSON.stringify({quantity, writes, reads, recovered}));
save();
https.createServer({key: fs.readFileSync('/qa/tls/key.pem'), cert: fs.readFileSync('/qa/tls/cert.pem')}, async (req, res) => {
  const json = (code, data) => {res.writeHead(code, {'Content-Type': 'application/json'}); res.end(JSON.stringify(data));};
  try {
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, 'Bearer installation-fixture-only');
    assert.equal(req.headers['x-dontwaste-scope'], household);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const path = req.url.replace('/integrations/automation/v1/', '');
    if (path === 'health') return json(200, {household_id: household, timestamp: '2026-09-26T00:00:00Z'});
    if (path === 'receipt') {
      const receipt = receipts.get(body.request_id);
      if (receipt) {recovered++; save();}
      return json(200, receipt ?? {status: 'not_applied'});
    }
    if (path === 'read') {
      assert.equal(body.entity, 'products'); reads++; save();
      return json(200, {household_id: household, revision: 7 + writes, next: null, items: [{entity_id: product, revision: 7 + writes, body: {name: 'Runtime test milk', quantity, unit: 'l'}}]});
    }
    if (path === 'command') {
      assert.deepEqual(body.command, {action: 'inventory_consume', id: product, quantity: 0.25, unit: 'l'});
      assert.equal(body.target_revision, 7);
      assert.equal(writes, 0, 'Same operation key must not execute twice');
      quantity -= 0.25; writes++;
      const receipt = {status: 'applied', request_id: body.request_id, household_id: household};
      receipts.set(body.request_id, receipt); save(); return json(200, receipt);
    }
    throw new Error('Unexpected fixture request');
  } catch (error) {
    fs.writeFileSync('/tmp/runtime-error.txt', String(error));
    json(400, {error: 'fixture_assertion_failed'});
  }
}).listen(443, '127.0.0.1');
