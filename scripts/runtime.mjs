import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot';
import { initializeProfileFromDefault, prepareProfile, INSTALL_ANCHOR } from '@deepseek-ai/dsh/profile-boot';
import { boot, createRuntimeResolution, PluginPackages, readProfilePatches, composeEntries } from '@deepseek-ai/dsh-app-boot';
import { createLaunchEnvironmentSnapshot, DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const runtimeAnchor = INSTALL_ANCHOR;
export const devComposition = () => [
  // Use precisely the official Web preset-plane gates, without its HTTP/UI.
  ...loadOverlayPatches('hiagent-dev',fileURLToPath(new URL('../dsh-web-app/cordis.patch.yml',pathToFileURL(INSTALL_ANCHOR)))).filter(row=>row.disabled===true),
  {insert:[{id:'agent-preset-registry',name:'@deepseek-ai/dsh-agent-preset-registry',config:{default:'hiagent-lite'}}]},
];
// Creator depends on these Web Host services. Include the shipped rows only in
// Creator headless checks; desktop already owns them once per process.
export const creatorDevComposition = () => [
  ...devComposition(),
  {insert:loadOverlayPatches('hiagent-creator-dev',fileURLToPath(new URL('../dsh-web-app/cordis.patch.yml',pathToFileURL(INSTALL_ANCHOR))))
    .flatMap(row=>row.insert??[]).filter(row=>['subagent-model-selection-settings','cordis-host-runner','cordis-inspect-providers'].includes(row.id))},
];
export async function startProfile(name = 'hiagent-dev', overrides = [], init = false) {
  if(init) initializeProfileFromDefault(name,'headless');
  const profile = prepareProfile(name);
  const resolution = await createRuntimeResolution({installAnchor:INSTALL_ANCHOR,profile});
  const pnpmPath = process.env.DSH_HIAGENT_PNPM;
  const packageManager = pnpmPath ? { command:process.execPath,args:[pnpmPath] } : undefined;
  const profileContext = { name,dir:profile.dir,patchPath:profile.patchPath,installAnchor:INSTALL_ANCHOR,home:resolve(profile.dir,'../..'),cwd:process.cwd(),startedBundles:profile.layers.map(x=>x.packageName),overlays:[],telemetryDisabledEnv:'1', ...(packageManager ? {packageManager} : {}) };
  const base=readProfilePatches('dsh-kasumi',profileContext,profile);
  const registryExists=composeEntries(base).some(row=>row.id==='agent-preset-registry');
  const normalized=registryExists?overrides.flatMap(row=>row.insert?.some(x=>x.id==='agent-preset-registry')?[...row.insert.filter(x=>x.id==='agent-preset-registry'),...(row.insert.some(x=>x.id!=='agent-preset-registry')?[{insert:row.insert.filter(x=>x.id!=='agent-preset-registry')}]:[])]:[row]):overrides;
  // Configuration edits re-read launch overlays. Include the test startup gates
  // there too, so a live setting change never reactivates CLI runners.
  profileContext.overlays=[{id:'headless-startup',disabled:true},{id:'headless-runner',disabled:true},{id:'hmr',disabled:true},{id:'session-title-llm',disabled:true},...normalized];
  const patches = readProfilePatches('dsh-kasumi',profileContext,profile);
  const ctx = await boot('dsh-kasumi',resolve(profile.dir,'cordis.yml'),patches,async ctx=>{
    ctx.provide('profileContext',profileContext);
    ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY,createLaunchEnvironmentSnapshot([{ source: 'process', values: process.env }]));
    await ctx.plugin(PluginPackages,{resolution});
  });
  return {ctx,profile};
}
