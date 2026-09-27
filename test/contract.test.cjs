const test=require('node:test'),assert=require('node:assert/strict');
const {write,readAll,operationId}=require('../dist/nodes/DontWaste/transport');
const {DontWasteTrigger}=require('../dist/nodes/DontWaste/DontWasteTrigger.node');
function context(request){return {getCredentials:async()=>({householdId:'household-a'}),getNode:()=>({id:'node-a',name:'DontWaste',type:'dontWaste',typeVersion:1,position:[0,0],parameters:{},credentials:{dontWasteApi:{id:'connection-a'}}}),helpers:{httpRequestWithAuthentication:async function(name,options){assert.equal(options.disableFollowRedirect,true);assert.match(options.url,/^https:\/\/cloud.dontwaste.app\/integrations\/automation\/v1\//);return request(options.url.split('/').pop(),options.body)}}};}
test('stable keys are isolated by household, node, command and business event',()=>{
 const command={action:'inventory_consume',id:'milk',quantity:250,unit:'ml'};
 const first=operationId('household','node','event-1',command);
 assert.match(first,/^[a-f0-9-]{36}$/);assert.equal(first,operationId('household','node','event-1',command));
 for(const id of [operationId('other','node','event-1',command),operationId('household','node','event-2',command),operationId('household','node','event-1',{...command,quantity:500})])assert.notEqual(first,id);
 assert.throws(()=>operationId('h','n','',command));
});
test('response loss recovers receipt without a second consume or fresh revision',async()=>{
 let stored,commits=0;
 const c=context(async(op,body)=>{
  if(op==='receipt')return stored||{status:'not_applied'};
  if(op==='read')return {household_id:'household-a',revision:3,items:[{entity_id:'milk',revision:3,body:{quantity:2,unit:'l'}}],next:null};
  if(op==='command'){commits++;stored={status:'applied',operation_id:body.request_id};throw Error('network lost');}
 });
 const command={action:'inventory_consume',id:'milk',quantity:250,unit:'ml'};
 await assert.rejects(write(c,command,'event'));const result=await write(c,command,'event');assert.equal(result.status,'applied');assert.equal(commits,1);
});
test('pagination keeps a single revision and never returns a silently truncated household',async()=>{
 const c=context(async(op,body)=>body.after?{revision:5,items:[],next:null}:{revision:4,items:[{entity_id:'a'}],next:'a'});
 await assert.rejects(readAll(c,'products'),/changed page/);
});
test('polling persists cursors, filters output and retains stable event IDs',async()=>{
 const state={};let changes=0;
 const c={...context(async(op,body)=>{
  if(op==='health')return {scope_id:'household-a',timestamp:'2026-09-26T00:00:00Z'};
  if(op==='read')return {revision:10};
  changes++;assert.equal(body.after,10);return {household_id:'household-a',events:[{event_id:'household-a:11',entity:'shopping',revision:11}],cursor:11};
 }),getWorkflowStaticData:()=>state,getMode:()=> 'trigger',getNodeParameter:(name)=>name==='entity'?'shopping':false};
 const node=new DontWasteTrigger();assert.equal(await node.poll.call(c),null);assert.equal(state.cursor,10);
 const result=await node.poll.call(c);assert.equal(result[0][0].json.event_id,'household-a:11');assert.equal(state.cursor,11);assert.equal(changes,1);
});
test('the action node sends the backend shopping_checked contract and leaves recipes read-only',async()=>{
 const {DontWaste}=require('../dist/nodes/DontWaste/DontWaste.node');
 let command;
 const c={...context(async(op,body)=>{
  if(op==='receipt')return {status:'not_applied'};
  if(op==='read')return {revision:3,items:[{entity_id:'s',revision:3,body:{name:'Milk',quantity:1,unit:'l'}}],next:null};
  if(op==='command'){command=body;return {status:'applied'};}
 }),getInputData:()=>[{json:{}}],getNodeParameter:name=>({operation:'shopping_check',entryId:'s',checked:true,operationKey:'checked-event'})[name],continueOnFail:()=>false};
 const node=new DontWaste();await node.execute.call(c);
 assert.deepEqual(command.command,{action:'shopping_checked',id:'s',checked:true});
 assert.equal(command.target_revision,3);
 const operations=node.description.properties.find(p=>p.name==='operation').options.map(o=>o.value);
 assert(!operations.some(o=>o.startsWith('recipe_')||o.startsWith('plan_')));
});
test('distributed workflows are inactive, contain no credentials and do not invent an operation key',()=>{
 const fs=require('node:fs'),path=require('node:path');
 for(const file of fs.readdirSync(path.join(__dirname,'../examples'))){
  const workflow=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples',file)));
  assert.equal(workflow.active,false);
  for(const node of workflow.nodes)assert.equal(node.credentials,undefined);
  if(file==='confirmed-consumption.json')assert.equal(workflow.nodes.at(-1).parameters.operationKey,'');
 }
});
