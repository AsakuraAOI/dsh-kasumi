import { startProfile, root } from './runtime.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const profileName = process.argv[2] ?? 'hiagent-dev';
const {ctx,profile} = await startProfile(profileName,[],process.argv.includes('--init'));
try {
  const results = [];
  for (const spec of [resolve(root,'../hiagent-presets'),root,resolve(root,'profiles/dev')]) {
    const manifest=JSON.parse(await readFile(resolve(spec,'package.json'),'utf8'));
    const result = await ctx.pluginManager.installBundle(`${manifest.name}@link:${spec.replaceAll('\\','/')}`);
    results.push({spec,result});
    console.log(JSON.stringify({spec,application:result.application,saved:result.saved,warnings:result.warnings,pendingBuilds:result.pendingBuilds,packageResult:result.packageResult}));
    if (result.application === 'failed' || result.packageResult?.exitCode !== 0 || result.pendingBuilds?.length) throw new Error('Bundle installation did not complete');
  }
  await mkdir(resolve(root,'reports'),{recursive:true});
  await writeFile(resolve(root,'reports/install-dev.json'),JSON.stringify({profile:profile.dir,results},null,2));
} finally { await ctx.fiber.dispose(); }
