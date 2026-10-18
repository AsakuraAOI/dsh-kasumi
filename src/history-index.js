import {createHash} from 'node:crypto';
export const sessionTag=session=>createHash('sha256').update(session.id).digest('hex').slice(0,16);
export const historyRef=(session,kind,seq)=>`h-${sessionTag(session)}-${kind}${seq}`;
export function parseHistoryRef(session,ref){
 const match=/^h-([a-f0-9]{16})-([eba])([0-9a-f]+)$/.exec(ref??'');
 if(!match||match[1]!==sessionTag(session))throw Error('History reference is invalid or belongs to another session. Search this session for a current reference.');
 if(match[2]!=='a'&&!/^\d+$/.test(match[3]))throw Error('Invalid history event reference.');
 return {kind:match[2],key:match[3]};
}
export function messageText(message){
 return (message?.content??[]).flatMap(block=>block.type==='text'?[block.text]:block.type==='tool-call'&&!block.name.startsWith('kasumi_history_')?[`Tool ${block.name}: ${typeof block.arguments==='string'?block.arguments:JSON.stringify(block.arguments)}`]:[]).join('\n');
}
function eventMessage(event){
 if(event.type==='user/message'){
  const message=event.data.message??event.data;
  if(message.source?.kind&& !['user','compact-checkpoint'].includes(message.source.kind))return undefined;
  return message;
 }
 if(['assistant/message','tool/result'].includes(event.type))return event.data.message;
}
export class HistoryIndex{
 states=new WeakMap();
 view(session){
  let state=this.states.get(session);
  if(!state){state={cursor:0,entries:new Map(),blocks:new Map(),checkpoints:new Map(),pending:new Map(),ids:new Map(),calls:new Map()};this.states.set(session,state);}
  for(let seq=state.cursor;seq<session.seq;seq++){
   const event=session.eventAt(seq);if(!event)continue;
   if(event.type==='tool/call')state.calls.set(event.data.callId,event.data.name);
   const message=eventMessage(event),ownResult=message?.toolCallId&&state.calls.get(message.toolCallId)?.startsWith('kasumi_history_');
   if(message&&!ownResult){const text=messageText(message);if(text){state.entries.set(seq,{seq,role:message.role??'user',type:event.type,messageId:message.id,isError:message.isError,bytes:Buffer.byteLength(text)});if(message.id&&!state.ids.has(message.id))state.ids.set(message.id,seq);}}
   if(event.type==='compaction/summary')state.pending.set(event.data.compactionId,{seq,data:event.data});
   if(event.type==='compaction/end'){
    const pending=state.pending.get(event.data.compactionId);state.pending.delete(event.data.compactionId);
    if(!pending||event.data.error)continue;
    const checkpoint=session.eventAt(pending.seq+1);
    if(checkpoint?.type!=='user/message'||checkpoint.surfaceOp?.op!=='replace')continue;
    const sources=pending.data.shadowedSeqs??[];
    if(sources.some(source=>!Number.isSafeInteger(source)||source<0||source>=pending.seq))continue;
    const parents=sources.map(source=>state.checkpoints.get(source)).filter(x=>x!==undefined);
    const tier=1+parents.reduce((max,parent)=>Math.max(max,state.blocks.get(parent)?.tier??0),0);
    state.blocks.set(pending.seq,{seq:pending.seq,checkpointSeq:checkpoint.seq,tier,sources:[...sources],parents,summary:pending.data.summary});
    state.checkpoints.set(checkpoint.seq,pending.seq);
   }
  }
  state.cursor=session.seq;return state;
 }
 describe(session,seq){
  const state=this.view(session),entry=state.entries.get(seq);if(!entry)return undefined;
  const text=messageText(eventMessage(session.eventAt(seq)));
  return {...entry,ref:historyRef(session,'e',seq),text,summaryBlock:state.checkpoints.has(seq)?historyRef(session,'b',state.checkpoints.get(seq)):undefined};
 }
 block(session,seq){
  const state=this.view(session),block=state.blocks.get(seq);if(!block)return undefined;
  return {ref:historyRef(session,'b',seq),tier:block.tier,text:messageText({content:block.summary}),sources:block.sources.map(source=>historyRef(session,'e',source)),parents:block.parents.map(parent=>historyRef(session,'b',parent))};
 }
 search(session,query,{before=session.seq,limit=5,maxScan=5000,signal}={}){
  const state=this.view(session),terms=[...new Set((query.toLowerCase().match(/[\p{L}\p{N}_./:-]+/gu)??[]).filter(Boolean))].slice(0,12);
  if(!terms.length)throw Error('Use a nonempty keyword, exact path, identifier or error text.');
  const hits=[];let scanned=0,scannedBytes=0,seq=Math.min(before-1,session.seq-1);
  for(;seq>=0&&scanned<maxScan;seq--,scanned++){
   signal?.throwIfAborted();const item=state.entries.get(seq);if(!item)continue;
   // History-tool replies do not become a self-retrieval feedback loop.
   const message=eventMessage(session.eventAt(seq));if(message?.source?.toolName?.startsWith('kasumi_history_'))continue;
   if(scannedBytes+item.bytes>8388608&&scanned>0)break;scannedBytes+=item.bytes;
   const text=messageText(message),lower=text.toLowerCase();let score=0,position=-1;
   for(const term of terms){const found=lower.indexOf(term);if(found>=0){score++;if(position<0)position=found;}}
   if(!score)continue;
   hits.push({ref:historyRef(session,'e',seq),seq,role:item.role,type:item.type,score,bytes:item.bytes,matchOffset:position,preview:text.slice(Math.max(0,position-70),Math.max(0,position-70)+300),summaryBlock:state.checkpoints.has(seq)?historyRef(session,'b',state.checkpoints.get(seq)):undefined});
  }
  return {results:hits.sort((a,b)=>b.score-a.score||b.seq-a.seq).slice(0,limit),scanned,nextBefore:seq>=0?seq+1:null,partial:seq>=0};
 }
}
