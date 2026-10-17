import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
// Reuse the VERIFIED existing Provider pipeline. No Query compiler or tool
// protocol parser is copied. Compilation stops at its own diagnostic seam,
// before budget admission, conversation creation or any network operation.
export async function createProviderProbe(verificationPath) {
 const verified=JSON.parse(await readFile(verificationPath,'utf8'));
 for(const [file,expected] of Object.entries(verified.files)){const path=resolve(verified.providerDir,file),rel=relative(verified.providerDir,path);if(isAbsolute(rel)||rel.startsWith('..'))throw Error('预检指纹路径无效');const actual=createHash('sha256').update(await readFile(path)).digest('hex');if(actual!==expected)throw Error('Provider 编译代码已变化，拒绝使用未验证预检：'+file);}
 const load=file=>import(pathToFileURL(resolve(verified.providerDir,'dist',file)).href);
 const [{parseConfig},{ModelRegistry},{decodeMessagesRequest},{runInference}]=await Promise.all([load('config/schema.js'),load('config/model-registry.js'),load('protocols/anthropic/request-decoder.js'),load('core/inference.js')]);
 const config=parseConfig({hiagent:{apiKey:'preflight-not-a-real-credential',maxRequestBytes:verified.policy.hiagent.maxRequestBytes},models:verified.policy.models.map(model=>({...model,apiKey:'preflight-not-a-real-credential'})),routes:verified.policy.routes});
 const registry=ModelRegistry.fromConfig(config);
 return {verifiedAt:verified.verifiedAt,limitBytes:config.hiagent.maxRequestBytes,async measure(body){
  const decoded=decodeMessagesRequest(body,new AbortController().signal);
  const hasImage=content=>content.some(block=>block.type==='image'||block.type==='tool_result'&&hasImage(block.content));
  if(decoded.inference.messages.some(m=>hasImage(m.content)))throw Error('精确预检当前仅支持文本请求；图像请使用原 Provider 通道');
  let report;const stop=Symbol('stop-before-network');
  const client=new Proxy({}, {get:()=>()=>{throw Error('预检禁止网络调用');}});
  try{for await(const _ of runInference({config,registry,client,onDiagnostic:event=>{if(event.kind==='context-budget'){report=JSON.parse(event.detail);throw stop;}}},decoded.inference)){} }catch(error){if(error!==stop)throw error;}
  if(!report)throw Error('Provider 未产生编译字节统计');
  return {compiledQueryBytes:report.bytes,limitBytes:report.limitBytes,toolCount:report.toolCount,sections:report.sections,model:decoded.requestedModel};
 }};
}
