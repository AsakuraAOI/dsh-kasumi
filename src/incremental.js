// Select only a complete new segment after an existing checkpoint. Retain the
// priced tail and latest user request. The official backend validates cuts.
export function selectIncrement(session,measurement,{retainTokens,minTokens=8192,summaryReserve=8192,thresholdTokens}){
 const nodes=measurement.nodes;let hasCheckpoint=false;
 const kind=node=>{const event=session.eventAt(node.seq),message=event?.data.message??event?.data;return {event,message,checkpoint:message?.source?.kind==='compact-checkpoint'};};
 for(const node of nodes)if(kind(node).checkpoint)hasCheckpoint=true;
 if(!hasCheckpoint)return null;
 let cut=nodes.length,retained=0;while(cut>0&&retained<retainTokens)retained+=nodes[--cut].tokens;
 let lastUser=nodes.length;for(let i=nodes.length-1;i>=0;i--){const {message}=kind(nodes[i]);if(message?.role==='user'&&message.source?.kind==='user'){lastUser=i;break;}}
 let segment=[],tokens=0;const candidates=[];
 const close=()=>{if(segment.length&&tokens>=minTokens&&tokens-summaryReserve>measurement.totalTokens-thresholdTokens+512)candidates.push({start:segment[0].seq,end:segment.at(-1).seq,tokens});segment=[];tokens=0;};
 for(let i=0;i<cut;i++){const node=nodes[i],item=kind(node);if(item.checkpoint||item.event?.type==='system/message'||i===lastUser){close();continue;}segment.push(node);tokens+=node.tokens;}close();
 return candidates.sort((a,b)=>a.start-b.start)[0]??null;
}
