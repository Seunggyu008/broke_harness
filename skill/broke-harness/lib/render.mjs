import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAgents } from '../adapters/opencode/render.mjs';
import { json } from './safe-files.mjs';

export const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function collect(directory, prefix, result) {
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    if (item.isSymbolicLink()) throw new Error('Symlink in skill assets refused');
    if (item.isDirectory()) await collect(path.join(directory, item.name), `${prefix}${item.name}/`, result);
    else result.set(`${prefix}${item.name}`, await readFile(path.join(directory, item.name), 'utf8'));
  }
}
export async function render(config, profile) {
  const files = new Map();
  files.set('.broke-harness/provenance.json', await readFile(path.join(bundle, 'assets/SOURCE.json'), 'utf8'));
  await collect(path.join(bundle, 'assets/runtime'), '', files);
  await collect(path.join(bundle, 'assets/docs'), 'docs/', files);
  files.set('docs/exec-plans/active/.gitkeep', '');
  files.set('docs/exec-plans/archive/.gitkeep', '');
  await collect(path.join(bundle, 'assets/commands'), '.broke-harness/commands/', files);
  for (const [file, content] of [...files]) if (file.startsWith('.broke-harness/commands/')) {
    const name = path.basename(file, '.md');
    files.set(`.agents/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${content.split('\n')[0].replace(/^# /, '')}\n---\n\n${content}`);
  }
  files.set('.agents/skills/update-docs/agents/openai.yaml', 'policy:\n  allow_implicit_invocation: false\n');
  if (profile) {
    const project = config.project;
    const lines = ['# Project workflow context', '', project.summary || 'Read the source documents below for project scope and architecture.', '', '## Sources', '', ...profile.sources.map(s => `- ${s.path}`), '', '## Ownership', '', ...profile.pathOwnership.map(o => `- ${o.directory}: ${o.instructions}`), '', '## Declared checks (not executed)', '', ...profile.commands.map(c => `- ${c.command} (working directory: ${c.cwd})`), '', 'Use docs/INDEX.md to select relevant documentation. Git operations belong to the user.'];
    files.set('.broke-harness/PROJECT.md', lines.join('\n') + '\n');
    for (const file of project.documentation) files.set(file.path, file.content);
    if (!profile.documentation.includes('docs/INDEX.md') && !files.has('docs/INDEX.md')) files.set('docs/INDEX.md', ['# Documentation index', '', ...profile.sources.map(s => `- [${s.path}](../${s.path}): project instructions and architecture.`), ...[...new Set([...profile.documentation.filter(p => p.startsWith('docs/') && !p.startsWith('docs/exec-plans/')), ...project.documentation.map(d => d.path)])].map(p => `- [${p.slice(5)}](${p.slice(5)}): project documentation.`), '- [Execution plans](exec-plans/README.md): author, approve, implement, report, and archive plans.', '', 'Run /update-docs explicitly to reconcile documentation with the implementation.', ''].join('\n'));
    if (config.bootstrap === 'project') for (const file of project.scaffold) files.set(file.path, file.content);
  }
  if (config.runtime !== 'opencode') {
    files.set('broke-harness.config.json', json(config));
    files.set('.broke-harness/WORKFLOW.md', await readFile(path.join(bundle, 'references/workflow.md'), 'utf8'));
    return files;
  }
  await collect(path.join(bundle, 'assets/opencode/commands'), '.opencode/commands/', files);
  for (const [file, text] of files) if (file.startsWith('.opencode/commands/')) {
    const role = file.endsWith('write-plan.md') ? 'plan' : file.endsWith('start-plan-audit.md') ? 'audit' : 'implement';
    const selected = config.roles[role];
    let next = text.replace(/^agent: .*$/m, `agent: ${file.endsWith('/start-plan.md') ? 'broke-orchestrator' : file.endsWith('/update-docs.md') ? 'broke-docs' : selected.agent}`).replace(/^model: .*$/m, `model: ${selected.provider}/${selected.model}`);
    next = next.replaceAll('`audit-pro`', `\`${config.roles.audit.agent}\``).replaceAll('`fix-pro`', `\`${config.roles.fix.agent}\``);
    next = next.replaceAll('the configured implement agent', `\`${config.roles.implement.agent}\``);
    next = next.replaceAll('Read `docs/INDEX.md`.', 'Read the existing documentation index when present.').replaceAll('Read `AGENTS.md`', 'Read the existing `AGENTS.md` (or `AGENT.md`) when present');
    files.set(file, next);
  }
  for (const name of ['safe-files.mjs','configuration.mjs']) files.set(`.broke-harness/lib/${name}`, await readFile(path.join(bundle, 'lib', name), 'utf8'));
  files.set('.broke-harness/adapters/opencode/policy.mjs', await readFile(path.join(bundle, 'adapters/opencode/policy.mjs'), 'utf8'));
  files.set('.broke-harness/opencode.json', json(renderAgents(config)));
  files.set('broke-harness.config.json', json(config));
  files.set('.broke-harness/WORKFLOW.md', await readFile(path.join(bundle, 'references/workflow.md'), 'utf8'));
  files.set('.opencode/plugins/broke-harness.js', `import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { authorize, roleFor, persistAuditReceipt } from '../../.broke-harness/adapters/opencode/policy.mjs';
import { resolveConfiguration } from '../../.broke-harness/lib/configuration.mjs';
import { safePath } from '../../.broke-harness/lib/safe-files.mjs';

export default async ({ directory, client }) => {
  const root = directory;
  const config = resolveConfiguration(JSON.parse(await readFile(await safePath(root, 'broke-harness.config.json'), 'utf8')));
  const overlay = JSON.parse(await readFile(await safePath(root, '.broke-harness/opencode.json'), 'utf8'));
  const agents = new Map(), pending = new Map();
  return {
    config: async (effective) => {
      effective.agent ??= {};
      for (const [name, definition] of Object.entries(overlay.agent)) {
        if (effective.agent[name] && JSON.stringify(effective.agent[name]) !== JSON.stringify(definition)) throw new Error('Existing agent conflicts with harness role: ' + name);
        effective.agent[name] = definition;
      }
    },
    'chat.params': async (input) => {
      agents.set(input.sessionID, input.agent);
      const role = roleFor(config, input.agent);
      if (role && config.roles[role]) {
        const selected = config.roles[role];
        if (input.model.providerID !== selected.provider || input.model.id !== selected.model) throw new Error('Selected role model unavailable or overridden; no silent fallback');
      }
    },
    'tool.execute.before': async (input, output) => {
      const agent = agents.get(input.sessionID);
      const role = roleFor(config, agent);
      if (agent && !role) return; // Existing unrelated agents retain their own policy.
      await authorize({ root, config, role, tool: input.tool, args: output.args });
      if (input.tool === 'task' && output.args.subagent_type === config.roles.audit.agent) {
        const report = JSON.parse(await readFile(await safePath(root, '.tmp/harness-report.json'), 'utf8'));
        pending.set(input.callID, { fingerprint: report.changeFingerprint, generatedAt: report.generatedAt });
      }
    },
    'tool.execute.after': async (input, output) => {
      const receipt = pending.get(input.callID);
      if (!receipt) return;
      pending.delete(input.callID);
      await persistAuditReceipt(root, config, input, output, receipt);
    },
  };
};
`);
  return files;
}
