export const defaults = {
  schemaVersion: 1, runtime: 'opencode',
  roles: {
    plan: { agent: 'plan', provider: 'opencode', model: 'muse-spark-1.3-contributor-free' },
    implement: { agent: 'build', provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
    audit: { agent: 'audit-pro', provider: 'opencode-go', model: 'muse-spark-1.3-contributor' },
    fix: { agent: 'fix-pro', provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
  },
  documentationSync: { rules: [] },
  policy: { maxCombinedFixAttempts: 3, requireIndependentAudit: true, auditReadOnly: true, requireCompletionApproval: true },
};
function keys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new Error(`Unknown or invalid ${label} keys`);
}
export function pattern(value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f\\:"<>|]/.test(value) || value.startsWith('/') || value.split('/').some(s => !s || s === '..' || s === '.') || /^(?:\.git|\.tmp|\.broke-harness|\.opencode)(?:\/|$)/.test(value)) throw new Error(`Unsafe scope pattern: ${value}`);
  return value;
}
export function resolveConfiguration(input = {}) {
  keys(input, ['schemaVersion','runtime','roles','documentationSync','policy'], 'configuration');
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) throw new Error('Unsupported schemaVersion; expected 1');
  if (input.runtime !== undefined && input.runtime !== 'opencode') throw new Error('V0.1 supports only single-runtime opencode; Codex, Claude Code and mixed runtimes are unsupported');
  const config = structuredClone(defaults);
  if (input.roles) {
    keys(input.roles, Object.keys(defaults.roles), 'roles');
    for (const [name, role] of Object.entries(input.roles)) {
      keys(role, ['agent','provider','model','temperature','steps'], `role ${name}`);
      Object.assign(config.roles[name], role);
    }
  }
  const names = new Set(['broke-orchestrator']);
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
  return config;
}
