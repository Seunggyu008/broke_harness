import { repository, readOptional, json } from '../lib/safe-files.mjs';
import { preview, apply } from '../lib/manifest.mjs';
import { argumentsFor, cli } from '../lib/cli.mjs';
await cli(async () => {
  const args = argumentsFor(process.argv.slice(2), ['--target','--config','--dry-run','--approve']);
  const root = await repository(args['--target'] ?? process.cwd());
  const text = args['--config'] ? await readOptional(root, args['--config']) : null;
  if (args['--config'] && text === null) throw new Error('Selected configuration file does not exist');
  const input = text === null ? undefined : JSON.parse(text);
  if (args['--dry-run']) console.log(json(await preview(root, input)));
  else {
    if (!args['--approve']) throw new Error('Installation requires --dry-run review, then --approve <approval-hash>');
    console.log(json(await apply(root, args['--approve'], input)));
  }
});
