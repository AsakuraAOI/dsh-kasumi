import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {root} from './runtime.mjs';
import {startLearningProfile,learningArea,originalDshHome,learningEnvironment} from './learning-runtime.mjs';
learningEnvironment();
const {ctx}=await startLearningProfile([],!existsSync(resolve(learningArea,'dsh-home/profiles/learning-dev/package.json')));
try{
 for(const spec of [`@yunmiao/studymate@link:${resolve(originalDshHome,'profiles/desktop/node_modules/@yunmiao/studymate').replaceAll('\\','/')}`,`@local/dsh-kasumi-presets@link:${resolve(root,'../hiagent-presets').replaceAll('\\','/')}`,`@local/dsh-kasumi@file:${resolve(root,process.argv[2]).replaceAll('\\','/')}`]){
  const result=await ctx.pluginManager.installBundle(spec);console.log(JSON.stringify({spec,application:result.application,exitCode:result.packageResult?.exitCode,pendingBuilds:result.pendingBuilds,warnings:result.warnings}));
  if(result.application==='failed'||result.packageResult?.exitCode!==0||result.pendingBuilds?.length)throw Error('学习测试 Bundle 安装失败');
 }
}finally{await ctx.fiber.dispose();}
