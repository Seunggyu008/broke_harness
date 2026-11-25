import { relativePath, secretPath } from './safe-files.mjs';

export const defaults = {
  schemaVersion: 1, runtime: 'portable', bootstrap: 'harness',
  project: { summary: '', documentation: [], scaffold: [] },
  roles: {
    plan: { agent: 'broke-plan', provider: 'opencode', model: 'muse-spark-1.3-contributor-free' },
    implement: { agent: 'broke-implement', provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
    audit: { agent: 'broke-audit', provider: 'opencode-go', model: 'muse-spark-1.3-contributor' },
    fix: { agent: 'broke-fix', provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
  },
  documentationSync: { rules: [] },
  policy: { maxCombinedFixAttempts: 5, requireIndependentAudit: true, auditReadOnly: true, requireCompletionApproval: true },
};
function keys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new Error(`Unknown or invalid ${label} keys`);
}
export function pattern(value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f\\:"<>|]/.test(value) || value.startsWith('/') || value.split('/').some(s => !s || s === '..' || s === '.') || /^(?:\.git|\.tmp|\.broke-harness|\.opencode)(?:\/|$)/.test(value)) throw new Error(`Unsafe scope pattern: ${value}`);
  return value;
}
export function resolveConfiguration(input = {}) {
  keys(input, ['schemaVersion','runtime','bootstrap','project','roles','documentationSync','policy'], 'configuration');
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) throw new Error('Unsupported schemaVersion; expected 1');
  if (input.runtime !== undefined && !['portable','opencode'].includes(input.runtime)) throw new Error('Choose runtime portable (agent of your choice) or opencode; no dedicated adapter is supplied for other runtimes');
  const config = structuredClone(defaults);
  config.runtime = input.runtime ?? defaults.runtime;
  if (input.bootstrap !== undefined && !['harness','project'].includes(input.bootstrap)) throw new Error('bootstrap must be harness or project');
  config.bootstrap = input.bootstrap ?? defaults.bootstrap;
  if (input.project) {
    keys(input.project, ['summary','documentation','scaffold'], 'project');
    Object.assign(config.project, input.project);
    if (typeof config.project.summary !== 'string') throw new Error('Project summary must be text');
    const seen = new Set();
    for (const field of ['documentation','scaffold']) {
      if (!Array.isArray(config.project[field])) throw new Error(`project.${field} must be an array`);
      for (const file of config.project[field]) {
        keys(file, ['path','content'], `project.${field} file`);
        relativePath(file.path);
        if (secretPath(file.path) || /^(?:\.|tools\/(?:harness|exec-plans)|docs\/exec-plans|broke-harness\.config\.json|opencode\.json)/i.test(file.path) || /^(?:AGENTS?|ARCHITECTURE)\.md$/i.test(file.path)) throw new Error(`Protected generated path: ${file.path}`);
        if (field === 'documentation' && (!file.path.startsWith('docs/') || !file.path.endsWith('.md'))) throw new Error('Generated documentation must be docs/*.md');
        if (typeof file.content !== 'string' || !file.content.trim() || Buffer.byteLength(file.content) > 4 * 1024 * 1024 || seen.has(file.path.toLowerCase())) throw new Error('Generated files need unique paths and bounded non-empty content');
        seen.add(file.path.toLowerCase());
      }
    }
  }
  if (config.bootstrap !== 'project' && config.project.scaffold.length) throw new Error('Application scaffold requires explicit bootstrap: project');
  if (input.roles) {
    keys(input.roles, Object.keys(defaults.roles), 'roles');
    for (const [name, role] of Object.entries(input.roles)) {
      keys(role, ['agent','provider','model','temperature','steps'], `role ${name}`);
      Object.assign(config.roles[name], role);
    }
  }
  const names = new Set(['broke-orchestrator','broke-docs']);
  for (const [name, role] of Object.entries(config.roles)) {
    if (!/^[a-z][a-z0-9-]*$/.test(role.agent) || names.has(role.agent)) throw new Error(`Role ${name} needs a unique agent name`);
    names.add(role.agent);
    if (!/^[a-zA-Z0-9._-]+$/.test(role.provider) || typeof role.model !== 'string' || !/^[a-zA-Z0-9._:/-]+$/.test(role.model)) throw new Error(`Invalid provider/model for ${name}`);
    if (role.temperature !== undefined && (!Number.isFinite(role.temperature) || role.temperature < 0 || role.temperature > 2)) throw new Error('Invalid temperature');
    if (role.steps !== undefined && (!Number.isInteger(role.steps) || role.steps < 1 || role.steps > 1000)) throw new Error('Invalid steps');
  }
  if (input.policy) {
    keys(input.policy, Object.keys(defaults.policy), 'policy');
    for (const [key, value] of Object.entries(input.policy)) if (defaults.policy[key] !== value) throw new Error(`Invariant policy cannot be disabled: ${key}`);
  }
  if (input.documentationSync) {
    keys(input.documentationSync, ['rules'], 'documentationSync');
    if (!Array.isArray(input.documentationSync.rules)) throw new Error('documentationSync.rules must be an array');
    config.documentationSync.rules = input.documentationSync.rules.map(rule => {
      keys(rule, ['trigger','require'], 'documentation rule');
      for (const key of ['trigger','require']) if (!Array.isArray(rule[key]) || !rule[key].length) throw new Error(`Documentation rule needs ${key} globs`);
      return { trigger: rule.trigger.map(pattern), require: rule.require.map(pattern) };
    });
  }
  if (Buffer.byteLength(JSON.stringify(config)) > 4 * 1024 * 1024) throw new Error('Resolved configuration exceeds the 4 MiB input limit; reduce the initial scaffold');
  return config;
}
