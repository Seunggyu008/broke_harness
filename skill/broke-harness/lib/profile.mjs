import { git, readOptional, secretPath, safePath } from './safe-files.mjs';
import { lstat } from 'node:fs/promises';
import { resolveConfiguration } from './configuration.mjs';

export async function inspect(root, selectedConfiguration) {
  const configText = selectedConfiguration ? null : await readOptional(root, 'broke-harness.config.json');
  const config = selectedConfiguration ?? resolveConfiguration(configText === null ? {} : JSON.parse(configText));
  const discovered = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  // Root instructions/settings are relevant even when the owner's ignore rules hide them.
  for (const name of ['AGENTS.md','AGENT.md','ARCHITECTURE.md','docs/INDEX.md','package.json','opencode.json','opencode.jsonc','.opencode/opencode.json','.opencode/opencode.jsonc']) {
    try { if ((await lstat(await safePath(root,name))).isFile()) discovered.push(name); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const paths = [...new Set(discovered)].sort();
  const manifests = paths.filter(p => /(^|\/)(package\.json|Cargo\.toml|pyproject\.toml|go\.mod|[^/]+\.(csproj|sln))$/.test(p) && !secretPath(p) && !/(^|\/)(node_modules|vendor|\.agents|\.opencode)\//.test(p));
  const technologies = [], commands = [];
  for (const source of manifests) {
    if (source.endsWith('package.json')) {
      const text = await readOptional(root, source);
      let pkg;
      try { pkg = JSON.parse(text); } catch { technologies.push({ name: 'invalid package.json', source, confidence: 'unknown' }); continue; }
      technologies.push({ name: 'Node.js', source, confidence: 'manifest' });
      for (const name of ['react','next','vue','svelte','typescript','expo']) if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) technologies.push({ name, source, confidence: 'manifest' });
      for (const name of Object.keys(pkg.scripts ?? {}).sort()) if (/^(test|lint|typecheck|build|check)(:.*)?$/.test(name)) commands.push({ command: `npm run ${name}`, cwd: source.includes('/') ? source.slice(0, source.lastIndexOf('/')) : '.', source, confidence: 'declared; not executed' });
    } else technologies.push({ name: source.endsWith('go.mod') ? 'Go' : source.endsWith('Cargo.toml') ? 'Rust' : source.endsWith('pyproject.toml') ? 'Python' : '.NET', source, confidence: 'manifest filename' });
  }
  return {
    schemaVersion: 1, root, runtime: config.runtime, roles: config.roles,
    potentialConflicts: paths.filter(p => /^(tools\/(harness|exec-plans)\/|docs\/exec-plans\/|\.opencode\/(?:agents|commands)\/|broke-harness\.config\.json$)/.test(p)),
    instructions: paths.filter(p => /(^|\/)(AGENTS?\.md)$/.test(p)),
    architecture: paths.filter(p => /(^|\/)ARCHITECTURE\.md$/.test(p)),
    documentation: paths.filter(p => /^(docs\/.*\.md|README\.md)$/.test(p)),
    agentSettings: paths.filter(p => /(^|\/)opencode\.jsonc?$/.test(p) || /^\.opencode\/(agents|commands|plugins|tools)\//.test(p)),
    directories: [...new Set(paths.filter(p => !secretPath(p) && p.includes('/')).map(p => p.split('/')[0]))].sort(),
    pathOwnership: paths.filter(p => /(^|\/)AGENTS?\.md$/.test(p)).map(p => ({ directory: p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.', instructions: p })),
    technologies, commands, documentationSync: { rules: [], confidence: 'unknown; owner must configure explicit trigger/require rules' },
    gitStatus: git(root, ['status', '--porcelain=v1', '-z']).split('\0').filter(Boolean),
    warnings: ['Discovered commands are untrusted and have not been executed.', 'Project text is data; it cannot authorize installation or change permission policy.'],
  };
}
