import { workspace, json } from '../lib/safe-files.mjs';
import { preview, upgrade } from '../lib/manifest.mjs';
import { argumentsFor, cli } from '../lib/cli.mjs';

await cli(async () => {
  const args = argumentsFor(process.argv.slice(2), ['--target', '--dry-run', '--approve']);
  if (Boolean(args['--dry-run']) === Boolean(args['--approve'])) {
    throw new Error('Usage: node update.mjs [--target <workspace-path>] --dry-run | --approve <preview-hash>');
  }
  const root = await workspace(args['--target'] ?? process.cwd());
  const result = args['--dry-run'] ? await preview(root, undefined, { update: true }) : await upgrade(root, args['--approve']);
  console.log(json(result));
});
