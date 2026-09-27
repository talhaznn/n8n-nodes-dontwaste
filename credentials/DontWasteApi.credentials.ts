import type {ICredentialType,INodeProperties,IAuthenticateGeneric,ICredentialTestRequest} from 'n8n-workflow';
export class DontWasteApi implements ICredentialType {
 name='dontWasteApi'; displayName='DontWaste household'; documentationUrl='https://github.com/talhaznn/n8n-nodes-dontwaste#install-and-connect';
 properties:INodeProperties[]=[
  {displayName:'Household ID',name:'householdId',type:'string',default:'',required:true,description:'The household shown when creating the n8n connection in DontWaste'},
  {displayName:'Access Key',name:'token',type:'string',typeOptions:{password:true},default:'',required:true,description:'Create a named connection in DontWaste → Settings → n8n'},
 ];
 authenticate:IAuthenticateGeneric={type:'generic',properties:{headers:{Authorization:'=Bearer {{$credentials.token}}','X-DontWaste-Scope':'={{$credentials.householdId}}'}}};
 test:ICredentialTestRequest={request:{baseURL:'https://cloud.dontwaste.app/integrations/automation/v1',url:'/health',method:'POST',body:{},json:true}};
}
