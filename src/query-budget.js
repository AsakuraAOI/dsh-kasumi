import z from '@deepseek-ai/schemastery';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {appendFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createProviderProbe} from './provider-probe.js';
export const name='hiagent-query-budget';
export const Config=z.object({enabled:z.boolean().default(false),verificationPath:z.string(),upstream:z.string().default('https://api.asakuraaoi.cn/anthropic'),admissionBytes:z.number().step(1).min(1024).default(810000),port:z.number().step(1).min(0).max(65535).default(0),path:z.string().default('hiagent-query-budget.jsonl')}).i18n({zh:{enabled:'启用精确 Query 发送前预检（独立可选通道）',verificationPath:'已核验的 Provider 指纹与公开配置文件',upstream:'原 Provider Anthropic 地址',admissionBytes:'正常请求提前压缩阈值（字节）',port:'本地监听端口，0 为自动分配',path:'预检统计文件路径（不保存正文或密钥）'}});
export async function startBudgetGateway(config) {
 const probe=await createProviderProbe(config.verificationPath),controllers=new Set(),tasks=new Set();
 const file=resolve(config.path);await mkdir(dirname(file),{recursive:true});let writes=Promise.resolve();
 const record=data=>{writes=writes.then(()=>appendFile(file,JSON.stringify({at:new Date().toISOString(),...data})+'\n',{mode:0o600})).catch(()=>config.onLogError?.());};
 const reply=(res,status,code,message)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:'invalid_request_error',code,message}}));};
 const handler=async(req,res)=>{
  const id=randomUUID(),start=performance.now(),abort=new AbortController();let upstreamIssued=false;controllers.add(abort);
  res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  try {
   const incoming=new URL(req.url??'/','http://127.0.0.1');
   const lane=incoming.pathname.startsWith('/summary/')?'summary':'agent';
   const suffix=incoming.pathname.replace(/^\/(?:agent|summary)/,'');
   if(req.method!=='POST'||suffix!=='/v1/messages'){reply(res,404,'NOT_FOUND','该通道仅处理 Anthropic Messages');return;}
   if(!req.headers['x-api-key']&&!req.headers.authorization){reply(res,401,'AUTH_REQUIRED','需要原 Provider 的鉴权头');return;}
   const chunks=[];let received=0;
   for await(const chunk of req){received+=chunk.length;if(received>2_000_000){reply(res,413,'LOCAL_BODY_LIMIT','本地预检请求体超过 2 MB');return;}chunks.push(chunk);}
   const raw=Buffer.concat(chunks),body=JSON.parse(raw.toString('utf8'));
   const measured=await probe.measure(body);
   const threshold=lane==='summary'?measured.limitBytes:Math.min(config.admissionBytes,measured.limitBytes);
   const rejected=measured.compiledQueryBytes>threshold;
   record({type:'query/preflight',id,lane,bodyHash:createHash('sha256').update(raw).digest('hex'),...measured,thresholdBytes:threshold,forwarded:!rejected,verifiedAt:probe.verifiedAt});
   if(rejected){reply(res,400,'HIAGENT_QUERY_BUDGET',`context window exceeded: 本地 Kasumi Query 预检为 ${measured.compiledQueryBytes} 字节，超过 ${threshold} 字节阈值；尚未发送到 Provider 或上游模型。请用正式 Compaction 压缩后再试。`);return;}
   const headers={...req.headers};for(const key of ['host','connection','content-length','transfer-encoding'])delete headers[key];
   upstreamIssued=true;
   const response=await fetch(config.upstream.replace(/\/$/,'')+suffix+incoming.search,{method:'POST',headers,body:raw,signal:abort.signal});
   const forwardedHeaders={};for(const [key,value] of response.headers)if(!['connection','transfer-encoding','content-length','content-encoding'].includes(key))forwardedHeaders[key]=value;
   forwardedHeaders['x-dsh-query-bytes']=String(measured.compiledQueryBytes);
   res.writeHead(response.status,forwardedHeaders);
   let buffered='',usage=null,errorCode=null;
   for await(const chunk of response.body){
    const text=Buffer.from(chunk).toString('utf8');buffered+=text;
    let cut;while((cut=buffered.indexOf('\n\n'))>=0){const frame=buffered.slice(0,cut);buffered=buffered.slice(cut+2);const data=frame.split('\n').find(line=>line.startsWith('data: '));if(data)try{const parsed=JSON.parse(data.slice(6));if(parsed.type==='message_delta'&&parsed.usage)usage=parsed.usage;if(parsed.type==='error')errorCode=parsed.error?.type??'error';}catch{}}
    if(buffered.length>131072)buffered='';
    if(!res.write(chunk))await once(res,'drain',{signal:abort.signal});
   }
   res.end();record({type:'query/end',id,status:response.status,durationMs:performance.now()-start,usage,errorCode});
  }catch(error){record({type:'query/failure',id,durationMs:performance.now()-start,cancelled:abort.signal.aborted,upstreamIssued,code:error.code??null});if(!res.headersSent)reply(res,upstreamIssued?502:400,upstreamIssued?'UPSTREAM_TRANSPORT':'PREFLIGHT_UNAVAILABLE','精确 Query 预检或传输失败；没有静默裁剪历史。');else res.destroy();}
  finally{controllers.delete(abort);}
 };
 const server=createServer((req,res)=>{const task=handler(req,res);tasks.add(task);task.finally(()=>tasks.delete(task));});
 await new Promise((accept,reject)=>{server.once('error',reject);server.listen(config.port??0,'127.0.0.1',accept);});
 const address=server.address();
 return {url:`http://127.0.0.1:${address.port}`,probe,async close(){for(const controller of controllers)controller.abort();server.closeAllConnections();await new Promise(done=>server.close(done));await Promise.allSettled([...tasks]);await writes;}};
}
export async function apply(ctx,config){if(!config.enabled)return;const gateway=await startBudgetGateway({...config,onLogError:()=>ctx.logger.warn('Query 预检统计写入失败；预算保护仍然生效')});ctx.effect(()=>()=>gateway.close());ctx.provide('hiagentQueryBudget',{url:gateway.url});}
