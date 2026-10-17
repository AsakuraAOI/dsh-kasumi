import {resolve} from 'node:path';
import {root,startProfile,creatorDevComposition} from './runtime.mjs';
// Isolate StudyMate's process-global workspace/config and startup installer.
// The credential provider reads the existing store directly; no keys copied.
export const learningArea=resolve(root,'benchmark-runs/learning-05');
export const originalDshHome=process.env.DSH_HOME||resolve(process.env.USERPROFILE,'.dsh');
export function learningEnvironment(){
 process.env.DSH_HOME=resolve(learningArea,'dsh-home');
 process.env.LEARN_WORKSPACE=resolve(learningArea,'workspace');
}
export async function startLearningProfile(overrides=[],init=false){
 learningEnvironment();
 return startProfile('learning-dev',[...creatorDevComposition(),{id:'credentials',config:{path:resolve(originalDshHome,'.credentials.yaml'),watch:false}},...overrides],init);
}
