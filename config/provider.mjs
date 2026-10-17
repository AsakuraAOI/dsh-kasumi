import { recovery } from './shared.mjs';
export function providerConfig(contextWindow = 128000, optimized = true) {
  return { providers:{hiagent:{apiKeyEnv:'HIAGENT_API_KEY',api:'anthropic-messages',baseURL:'https://api.asakuraaoi.cn/anthropic',defaultMaxTokens:8192,timeoutMs:330000,streamIdleTimeoutMs:330000,models:[{id:'deepseek-v4.1-flash',name:'deepseek-v4.1-flash',input:['text','image'],contextWindow}],...(optimized ? {retryPolicy:recovery} : {})}} };
}
