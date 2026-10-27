export function renderAgents(config) {
  const read = { '*': 'deny', read: { '*': 'allow', '*.env': 'deny', '*.env.*': 'deny', '**/.env': 'deny', '**/.env.*': 'deny', '**/auth.json': 'deny', '**/credentials*': 'deny' }, glob: 'allow', grep: 'allow', list: 'allow', external_directory: 'deny' };
  const agents = {};
  for (const [name, role] of Object.entries(config.roles)) {
    const permission = structuredClone(read);
    if (name === 'plan') permission.edit = { '*': 'deny', 'docs/exec-plans/active/*.md': 'allow' };
    if (name === 'implement' || name === 'fix') permission.edit = 'allow';
    agents[role.agent] = {
      description: `broke-harness ${name} role`, mode: name === 'plan' ? 'primary' : 'subagent',
      model: `${role.provider}/${role.model}`, temperature: role.temperature ?? 0.1,
      steps: role.steps ?? ({ plan: 60, implement: 80, audit: 60, fix: 40 }[name]),
      permission,
      prompt: name === 'audit' ? 'Independent read-only audit. Read .opencode/commands/start-plan-audit.md and return its exact structured JSON. Never delegate or edit.' : name === 'plan' ? 'Read docs/exec-plans/README.md and TEMPLATE.md. Coordinate active plans before authoring. Only proposed execution plans may be edited.' : 'Read .opencode/commands/implement-plan.md. Edit only the pinned approved plan scope. Shell verification belongs to the orchestrator. Never edit harness infrastructure.',
    };
  }
  agents['broke-orchestrator'] = {
    description: 'Coordinate the canonical plan, verification, independent audit and completion gates', mode: 'primary',
    model: `${config.roles.implement.provider}/${config.roles.implement.model}`, temperature: 0.1,
    permission: { ...structuredClone(read), bash: 'ask', edit: { '*': 'deny', '.tmp/audit-result.json': 'allow' }, task: { '*': 'deny', ...Object.fromEntries(['implement','audit','fix'].map(r => [config.roles[r].agent, 'allow'])) }, question: 'allow' },
    prompt: 'Read .broke-harness/WORKFLOW.md and .opencode/commands/start-plan.md. You coordinate; delegate all application edits. Completion requires explicit approval in a later user message.',
  };
  return { $schema: 'https://opencode.ai/config.json', agent: agents };
}
