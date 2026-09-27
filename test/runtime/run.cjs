// Run inside a fresh n8n container with only the packaged community node.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {spawn, spawnSync} = require('node:child_process');
const env = {...process.env, NODE_EXTRA_CA_CERTS: '/qa/tls/cert.pem', N8N_DIAGNOSTICS_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false', N8N_TEMPLATES_ENABLED: 'false', N8N_COMMUNITY_PACKAGES_ENABLED: 'true', N8N_RUNNERS_ENABLED: 'false', N8N_LOG_LEVEL: 'info'};
const call = (args, name) => {
  const result = spawnSync('n8n', args, {env, encoding: 'utf8', timeout: 120000});
  fs.writeFileSync(`/tmp/${name}.log`, result.stdout + result.stderr);
  assert.equal(result.status, 0, `n8n ${args[0]} failed; see /tmp/${name}.log`);
  return result.stdout;
};
const server = spawn(process.execPath, ['/qa/mock-server.cjs'], {env, stdio: 'inherit'});
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    const credential = {id: 'dontwaste-runtime', name: 'Isolated fixture', type: 'dontWasteApi', data: {householdId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', token: 'installation-fixture-only'}};
    fs.writeFileSync('/tmp/credentials.json', JSON.stringify([credential]));
    call(['import:credentials', '--input=/tmp/credentials.json'], 'import-credentials');
    const workflow = JSON.parse(fs.readFileSync('/home/node/.n8n/nodes/node_modules/n8n-nodes-dontwaste/examples/confirmed-consumption.json'));
    workflow.id = 'dontwaste-runtime-flow';
    const node = workflow.nodes.find(n => n.name === 'Consume selected amount');
    node.parameters.entryId = 'runtime-product';
    node.parameters.operationKey = 'confirmed-runtime-consumption';
    node.credentials = {dontWasteApi: {id: credential.id, name: credential.name}};
    fs.writeFileSync('/tmp/workflow.json', JSON.stringify(workflow));
    call(['import:workflow', '--input=/tmp/workflow.json'], 'import-workflow');
    call(['execute', '--id=dontwaste-runtime-flow', '--rawOutput'], 'execution-first');
    call(['execute', '--id=dontwaste-runtime-flow', '--rawOutput'], 'execution-repeat');
    assert.equal(fs.existsSync('/tmp/runtime-error.txt'), false, 'HTTP fixture rejected a request');
    const state = JSON.parse(fs.readFileSync('/tmp/runtime-state.json'));
    assert.deepEqual(state, {quantity: 1.75, writes: 1, reads: 1, recovered: 1});
    call(['export:nodes', '--output=/tmp/node-types.json'], 'export-nodes');
    const types = fs.readFileSync('/tmp/node-types.json', 'utf8');
    assert.ok(types.includes('dontWasteTrigger') && types.includes('dontWaste'));
    console.log(JSON.stringify({result: 'PASS', n8n: '2.40.7', node: process.version, installed_package: '1.0.0', repeated_execution: state, trigger_registered: true, network: 'none', backend: 'isolated HTTPS fixture, no production writes'}));
  } finally {
    server.kill();
  }
})().catch(error => {console.error(error.message); process.exitCode = 1;});
