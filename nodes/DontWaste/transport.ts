import {createHash} from 'node:crypto';
import type {IExecuteFunctions,IPollFunctions,ILoadOptionsFunctions,IDataObject} from 'n8n-workflow';
import {NodeOperationError} from 'n8n-workflow';
export type Context=IExecuteFunctions|IPollFunctions|ILoadOptionsFunctions;
export const endpoint='https://cloud.dontwaste.app/integrations/automation/v1';
export async function call(context:Context,operation:string,body:IDataObject):Promise<any> {
 if(!['health','read','changes','command','receipt'].includes(operation))throw new Error('Unknown operation');
 const credentials=await context.getCredentials('dontWasteApi');
 try {
  const data=await context.helpers.httpRequestWithAuthentication.call(context,'dontWasteApi',{
   method:'POST',url:`${endpoint}/${operation}`,body,json:true,timeout:15000,disableFollowRedirect:true,
  });
  const household=data.household_id??data.scope_id;
  if(household&&household!==credentials.householdId)throw new Error('scope_changed');
  if(JSON.stringify(data).length>1100000)throw new Error('response_too_large');
  return data;
 }catch(error:any){
  const code=error?.response?.body?.error??error?.response?.data?.error??error?.message;
  // No raw server body, headers or credentials in workflow errors.
  const safe=['revision_changed','cursor_expired','write_not_granted','grant_unavailable','document_unavailable','incompatible_unit','insufficient_quantity','scope_changed','request_mismatch'].includes(code)?code:'connection_failed';
  throw new NodeOperationError(context.getNode(),safe,{description:'Refresh the data or check this connection in DontWaste. Retry writes with the same operation key.'});
 }
}
export async function readAll(context:Context,entity:string):Promise<IDataObject[]> {
 const rows:IDataObject[]=[];let after='',revision:number|undefined;
 for(let page=0;page<1000;page++){
  const data=await call(context,'read',{entity,after,limit:50,...(revision===undefined?{}:{at_revision:revision})});
  if(!Array.isArray(data.items)||!Number.isSafeInteger(data.revision)||revision!==undefined&&data.revision!==revision)throw new Error('Invalid or changed page');
  revision=data.revision;rows.push(...data.items);
  if(!data.next)return rows;
  if(data.next===after)throw new Error('Repeated page cursor');after=data.next;
 }
 throw new Error('Household exceeds the supported page count');
}
export function operationId(household:string,node:string,key:string,command:IDataObject):string {
 if(!key.trim())throw new Error('A stable operation key is required');
 const sorted=Object.fromEntries(Object.entries(command).sort(([a],[b])=>a.localeCompare(b)));
 const hex=createHash('sha256').update(JSON.stringify([household,node,key,sorted])).digest('hex');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export async function write(context:IExecuteFunctions,command:IDataObject,key:string):Promise<IDataObject> {
 const credentials=await context.getCredentials('dontWasteApi');
 const id=operationId(String(credentials.householdId),context.getNode().id,key,command);
 const existing=await call(context,'receipt',{request_id:id});
 if(existing.status==='applied')return existing;
 if(existing.status!=='not_applied')throw new Error('Unconfirmed receipt');
 let revision:number|undefined;
 if(command.id){
  const rows=await readAll(context,String(command.action).startsWith('shopping_')?'shopping':'products');
  const target=rows.find(row=>row.entity_id===command.id);
  if(!target)throw new NodeOperationError(context.getNode(),'The entry no longer exists');
  revision=target.revision as number;
 }
 const result=await call(context,'command',{request_id:id,command,...(revision===undefined?{}:{target_revision:revision})});
 if(result.status!=='applied')throw new NodeOperationError(context.getNode(),'The change is not confirmed');
 return result;
}
