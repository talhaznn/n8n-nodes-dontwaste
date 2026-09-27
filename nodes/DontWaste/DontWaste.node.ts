import type {IExecuteFunctions,ILoadOptionsFunctions,INodeExecutionData,INodeType,INodeTypeDescription,INodeProperties,IDataObject} from 'n8n-workflow';
import {NodeConnectionTypes,NodeOperationError} from 'n8n-workflow';
import {call,readAll,write} from './transport';
const operations=[
 ['Test Connection','health'],['List Inventory','products'],['List Shopping','shopping'],['Read Recipes','recipes'],['Read Meal Plan','meal_plans'],
 ['Add Inventory','inventory_add'],['Change Inventory Quantity','inventory_quantity'],['Edit Inventory Details','inventory_details'],['Consume Inventory','inventory_consume'],['Discard Inventory','inventory_discard'],['Remove Inventory','inventory_remove'],
 ['Add Shopping Item','shopping_add'],['Change Shopping Quantity','shopping_quantity'],['Edit Shopping Item','shopping_details'],['Check Shopping Item','shopping_check'],['Remove Shopping Item','shopping_remove'],
];
const writes=operations.map(o=>o[1]).filter(o=>o.startsWith('inventory_')||o.startsWith('shopping_'));
const targeting=writes.filter(o=>!o.endsWith('_add'));
const quantified=['inventory_add','inventory_quantity','inventory_consume','inventory_discard','shopping_add','shopping_quantity'];
const properties:INodeProperties[]=[
 {displayName:'Operation',name:'operation',type:'options',default:'products',options:operations.map(([name,value])=>({name,value,action:name}))},
 {displayName:'Entry Name or ID',name:'entryId',type:'options',typeOptions:{loadOptionsMethod:'entries',loadOptionsDependsOn:['operation']},default:'',required:true,displayOptions:{show:{operation:targeting}},description:'Choose an entry, or use its entity_id from a previous read or trigger'},
 {displayName:'Name',name:'name',type:'string',default:'',required:true,displayOptions:{show:{operation:['inventory_add','shopping_add','inventory_details','shopping_details']}}},
 {displayName:'Quantity',name:'quantity',type:'number',default:1,typeOptions:{minValue:0.000001,maxValue:100000},required:true,displayOptions:{show:{operation:quantified}}},
 {displayName:'Unit',name:'unit',type:'options',default:'Stück',options:['g','kg','ml','l','Stück','Packung','Flasche','Dose','Bund'].map(value=>({name:value,value})),required:true,displayOptions:{show:{operation:quantified}},description:'No pack-size conversion is inferred. Use the inventory unit or a compatible mass/volume unit.'},
 {displayName:'Best-Before Date',name:'expiry',type:'string',default:'',placeholder:'2026-12-31',displayOptions:{show:{operation:['inventory_add']}},description:'YYYY-MM-DD; leave empty when unknown'},
 {displayName:'Notes',name:'notes',type:'string',default:'',displayOptions:{show:{operation:['inventory_details','shopping_details']}}},
 {displayName:'Checked',name:'checked',type:'boolean',default:true,displayOptions:{show:{operation:['shopping_check']}}},
 {displayName:'Operation Key',name:'operationKey',type:'string',default:'',required:true,displayOptions:{show:{operation:writes}},description:'Use a stable event or business ID. Repeating the same key and command cannot write twice. Use a new key for an intentional new change.'},
];
export class DontWaste implements INodeType {
 description:INodeTypeDescription={displayName:'DontWaste',name:'dontWaste',icon:'file:dontwaste.svg',group:['transform'],version:1,description:'Read and update one authorized DontWaste household',defaults:{name:'DontWaste'},inputs:[NodeConnectionTypes.Main],outputs:[NodeConnectionTypes.Main],credentials:[{name:'dontWasteApi',required:true}],properties};
 methods={loadOptions:{async entries(this:ILoadOptionsFunctions){
  const operation=String(this.getCurrentNodeParameter('operation'));
  const rows=await readAll(this,operation.startsWith('shopping_')?'shopping':'products');
  return rows.map(row=>({name:`${(row.body as IDataObject).name} (${row.entity_id})`,value:String(row.entity_id)}));
 }}};
 async execute(this:IExecuteFunctions):Promise<INodeExecutionData[][]>{
  const output:INodeExecutionData[]=[];
  for(let i=0;i<this.getInputData().length;i++){
   const operation=String(this.getNodeParameter('operation',i));
   if(operation==='health'){output.push({json:await call(this,'health',{}),pairedItem:{item:i}});continue;}
   if(!writes.includes(operation)){for(const row of await readAll(this,operation))output.push({json:row,pairedItem:{item:i}});continue;}
   const command:IDataObject={action:operation==='shopping_check'?'shopping_checked':operation};
   if(targeting.includes(operation))command.id=String(this.getNodeParameter('entryId',i));
   if(quantified.includes(operation)){command.quantity=Number(this.getNodeParameter('quantity',i));command.unit=String(this.getNodeParameter('unit',i));}
   if(operation.endsWith('_add'))command.name=String(this.getNodeParameter('name',i));
   if(operation==='inventory_add')command.expiration_date=String(this.getNodeParameter('expiry',i))||null;
   if(operation.endsWith('_details'))command.fields={name:String(this.getNodeParameter('name',i)),notes:String(this.getNodeParameter('notes',i))||null};
   if(operation==='shopping_check')command.checked=Boolean(this.getNodeParameter('checked',i));
   try{output.push({json:await write(this,command,String(this.getNodeParameter('operationKey',i))),pairedItem:{item:i}});}
   catch(error){if(!this.continueOnFail())throw error;output.push({json:{error:error instanceof NodeOperationError?error.message:'Change not confirmed'},pairedItem:{item:i}});}
  }
  return [output];
 }
}
