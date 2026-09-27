import type {IPollFunctions,INodeType,INodeTypeDescription,INodeExecutionData,IDataObject} from 'n8n-workflow';
import {NodeConnectionTypes,NodeOperationError} from 'n8n-workflow';
import {call} from './transport';
export class DontWasteTrigger implements INodeType {
 description:INodeTypeDescription={displayName:'DontWaste Trigger',name:'dontWasteTrigger',icon:'file:dontwaste.svg',group:['trigger'],version:1,description:'Poll confirmed household changes without an incoming webhook',defaults:{name:'DontWaste Trigger'},polling:true,inputs:[],outputs:[NodeConnectionTypes.Main],credentials:[{name:'dontWasteApi',required:true}],properties:[
  {displayName:'Watch',name:'entity',type:'options',default:'all',options:[{name:'Inventory and Shopping',value:'all'},{name:'Inventory',value:'products'},{name:'Shopping',value:'shopping'}]},
  {displayName:'Reset Cursor',name:'resetCursor',type:'boolean',default:false,description:'Start from the current household state. Historical changes will be skipped. Turn this off after one successful poll.'},
 ]};
 async poll(this:IPollFunctions):Promise<INodeExecutionData[][]|null>{
  const store=this.getWorkflowStaticData('node');
  const credentials=await this.getCredentials('dontWasteApi'),household=String(credentials.householdId);
  const health=await call(this,'health',{});
  // Never apply a cursor from another household or credential to this one.
  const credentialId=this.getNode().credentials?.dontWasteApi?.id??'';
  const binding=`${household}:${credentialId}`;
  if(store.binding!==binding||store.cursor===undefined||this.getNodeParameter('resetCursor')){
   // health carries counts; a minimal data page establishes the event revision.
   const page=await call(this,'read',{entity:'products',limit:1});
   store.binding=binding;store.cursor=page.revision;
   if(this.getMode()==='manual')return [[{json:{event_id:`${household}:setup:${page.revision}`,entity:'setup',household_id:household,timestamp:health.timestamp,test_only:true}}]];
   return null;
  }
  if(!Number.isSafeInteger(store.cursor))throw new NodeOperationError(this.getNode(),'Invalid cursor; explicitly reset it after reviewing the workflow');
  const data=await call(this,'changes',{after:store.cursor,limit:100});
  if(!Array.isArray(data.events)||!Number.isSafeInteger(data.cursor)||data.cursor<(store.cursor as number))throw new NodeOperationError(this.getNode(),'Invalid changes response');
  const entity=String(this.getNodeParameter('entity'));
  const items=(data.events as IDataObject[]).filter(e=>entity==='all'||e.entity===entity).map(json=>({json}));
  if(this.getMode()!=='manual')store.cursor=data.cursor;
  // n8n persists static data on successful active runs. Failed downstream runs
  // may replay events; event_id is stable and must be used as operation key.
  return items.length?[items]:null;
 }
}
