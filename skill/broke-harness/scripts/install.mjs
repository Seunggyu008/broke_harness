import { workspace, readOptional, json } from '../lib/safe-files.mjs';
import { preview, apply } from '../lib/manifest.mjs';
import { argumentsFor, cli } from '../lib/cli.mjs';
import path from 'node:path';
await cli(async () => {
  const args = argumentsFor(process.argv.slice(2), ['--target','--config','--dry-run','--approve']);
  const root = await workspace(args['--target'] ?? process.cwd());
  const selected = args['--config'];
  const text = selected ? await readOptional(path.isAbsolute(selected) ? path.dirname(selected) : root, path.isAbsolute(selected) ? path.basename(selected) : selected) : null;
  if (args['--config'] && text === null) throw new Error('Selected configuration file does not exist');
  const input = text === null ? undefined : JSON.parse(text);
  if (args['--dry-run']) console.log(json(await preview(root, input)));
  else {
    if (!args['--approve']) throw new Error('Installation requires --dry-run review, then --approve <approval-hash>');
    console.log(json(await apply(root, args['--approve'], input)));
  }
});
