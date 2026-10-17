import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './runtime.mjs';
const providerDir=resolve(process.env.DSH_HIAGENT_PROVIDER_DIR??resolve(root,'../../github/hiagent-coding-provider'));
const lines=(await readFile(root+'/.private/provider-fingerprint.txt','utf8')).trim().split('\n').map(line=>line.trim()).filter(Boolean);
const files={};
for(const line of lines){const match=line.match(/^([a-f0-9]{64})\s+\/opt\/hiagent-coding-provider\/(.+)$/i);if(!match)throw Error('Invalid fingerprint line');const path=resolve(providerDir,match[2]);const rel=relative(providerDir,path);if(isAbsolute(rel)||rel.startsWith('..'))throw Error('Unsafe fingerprint path');const actual=createHash('sha256').update(await readFile(path)).digest('hex');if(actual!==match[1].toLowerCase())throw Error('Provider source differs: '+match[2]);files[match[2]]=actual;}
const policy=JSON.parse(await readFile(root+'/reports/provider-public-policy.json','utf8'));
const record={verifiedAt:new Date().toISOString(),source:'read-only SSH hashes and redacted live configuration',providerDir,files,policy};
await writeFile(root+'/reports/provider-verification.json',JSON.stringify(record,null,2));console.log(JSON.stringify({providerDir,verifiedFiles:Object.keys(files).length,limitBytes:policy.hiagent.maxRequestBytes}));
