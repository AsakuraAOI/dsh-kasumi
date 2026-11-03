import { after } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startProfile, root } from '../scripts/runtime.mjs';

/** Load the source under test into an isolated official headless profile. */
export async function startNativeProfile(modules) {
  const home = mkdtempSync(join(tmpdir(), 'kasumi-capabilities-')), previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  after(() => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; rmSync(home, { recursive: true, force: true, maxRetries: 3 }); });
  const initial = await startProfile('capabilities', [], true);
  await initial.ctx.fiber.dispose();
  writeFileSync(join(home, 'profiles/capabilities/cordis.patch.yml'), JSON.stringify([{ insert: modules.map(id => typeof id === 'object' ? id : ({ id, name: pathToFileURL(join(root, 'src', id === 'kasumi-vision' ? 'vision.js' : 'tool-context.js')).href, config: {} })) }]));
  return startProfile('capabilities', [{ id: 'llm-pi-ai', config: { providers: {} } }]);
}
