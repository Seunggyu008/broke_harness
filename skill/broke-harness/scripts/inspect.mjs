import { workspace, json } from '../lib/safe-files.mjs';
import { inspect } from '../lib/profile.mjs';
import { argumentsFor, cli } from '../lib/cli.mjs';
await cli(async () => {
  const args = argumentsFor(process.argv.slice(2), ['--target']);
  console.log(json(await inspect(await workspace(args['--target'] ?? process.cwd()))));
});
