import {mkdir,readFile,writeFile,readdir,stat,link,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {sessionTag,parseHistoryRef} from './history-index.js';
const hash=text=>createHash('sha256').update(text).digest('hex');
async function exclusiveFile(path,text){const temporary=path+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,text,{flag:'wx',mode:0o600});await link(temporary,path);}finally{await unlink(temporary).catch(()=>{});}}
// First-write-wins archives belong to one session. No caller-supplied paths,
// parent-session lookup, external fetch, or automatic deletion.
export class HistoryStore{
 states=new WeakMap();
 constructor(root){this.root=root;}
 directory(session){return join(this.root,hash(session.id));}
 async state(session){
  let state=this.states.get(session);if(!state){state=(async()=>{const directory=this.directory(session);await mkdir(join(directory,'blobs'),{recursive:true,mode:0o700});await mkdir(join(directory,'refs'),{recursive:true,mode:0o700});const names=await readdir(join(directory,'blobs'));let bytes=0;for(const name of names)if(/^[a-f0-9]{64}\.txt$/.test(name))bytes+=(await stat(join(directory,'blobs',name))).size;return {directory,bytes,queue:Promise.resolve()};})();this.states.set(session,state);}return state;
 }
 async save(session,{callId,tool,text,maxBytes=2097152,quotaBytes=67108864}){
  if(Buffer.byteLength(text)>maxBytes)return undefined;
  const state=await this.state(session);
  const task=state.queue.then(async()=>{
   const key=hash(callId).slice(0,32),ref=`h-${sessionTag(session)}-a${key}`,digest=hash(text),metadataFile=join(state.directory,'refs',key+'.json');
   try{const existing=JSON.parse(await readFile(metadataFile,'utf8'));return existing.digest===digest&&existing.session===session.id?ref:undefined;}catch(error){if(error.code!=='ENOENT')throw error;}
   const bytes=Buffer.byteLength(text),blob=join(state.directory,'blobs',digest+'.txt');
   let exists=false;try{await stat(blob);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
   if(!exists&&state.bytes+bytes>quotaBytes)return undefined;
   if(!exists)try{await exclusiveFile(blob,text);state.bytes+=bytes;}catch(error){if(error.code!=='EEXIST')throw error;}
   try{await exclusiveFile(metadataFile,JSON.stringify({ref,session:session.id,callId,tool,digest,bytes,preview:text.slice(0,240)}));}catch(error){if(error.code!=='EEXIST')throw error;const existing=JSON.parse(await readFile(metadataFile,'utf8'));if(existing.digest!==digest||existing.session!==session.id)return undefined;}
   return ref;
  });
  state.queue=task.catch(()=>{});return task;
 }
 async read(session,ref,signal){
  const parsed=parseHistoryRef(session,ref);if(parsed.kind!=='a'||!/^[a-f0-9]{32}$/.test(parsed.key))throw Error('Invalid archive reference.');
  const directory=this.directory(session),meta=JSON.parse(await readFile(join(directory,'refs',parsed.key+'.json'),{encoding:'utf8',signal}));
  if(meta.session!==session.id||meta.ref!==ref||!/^[a-f0-9]{64}$/.test(meta.digest))throw Error('Archive ownership or digest is invalid.');
  const path=join(directory,'blobs',meta.digest+'.txt');if((await stat(path)).size>8388608)throw Error('Archive exceeds the maximum retrieval size.');
  const text=await readFile(path,{encoding:'utf8',signal});if(hash(text)!==meta.digest)throw Error('Archive integrity check failed.');
  return {ref,text,bytes:meta.bytes,tool:meta.tool};
 }
 async list(session,offset=0){
  let names;const directory=this.directory(session);try{names=await readdir(join(directory,'refs'));}catch(error){if(error.code==='ENOENT')return {entries:[],nextOffset:null};throw error;}
  const valid=names.filter(x=>/^[a-f0-9]{32}\.json$/.test(x)).sort(),entries=[];for(const name of valid.slice(offset,offset+32)){
   const meta=JSON.parse(await readFile(join(directory,'refs',name),'utf8'));if(meta.session===session.id)entries.push({ref:meta.ref,tool:meta.tool,bytes:meta.bytes,preview:meta.preview});
  }return {entries,nextOffset:offset+32<valid.length?offset+32:null};
 }
}
