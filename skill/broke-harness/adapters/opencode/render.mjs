export function renderAgents(config) {
  const read = { '*': 'deny', read: { '*': 'allow', '*.env': 'deny', '*.env.*': 'deny', '**/.env': 'deny', '**/.env.*': 'deny', '**/auth.json': 'deny', '**/credentials*': 'deny' }, glob: 'allow', grep: 'allow', list: 'allow', external_directory: 'deny' };
  const agents = {};
  for (const [name, role] of Object.entries(config.roles)) {
    const permission = structuredClone(read);
    if (name !== 'audit') permission.question = 'allow';
    if (name === 'plan') permission.edit = { '*': 'deny', 'docs/exec-plans/active/*.md': 'allow' };
    if (name === 'implement' || name === 'fix') permission.edit = 'allow';
    agents[role.agent] = {
      description: `broke-harness ${name} role`, mode: name === 'plan' ? 'primary' : 'subagent',
      model: `${role.provider}/${role.model}`, temperature: role.temperature ?? 0.1,
      steps: role.steps ?? ({ plan: 60, implement: 80, audit: 60, fix: 40 }[name]),
      permission,
      prompt: name === 'audit' ? 'Optional independent read-only audit requested by the user. Read .broke-harness/commands/start-plan-audit.md and return its exact structured JSON. Never delegate or edit.' : name === 'plan' ? 'Read .broke-harness/commands/write-plan.md and docs/exec-plans/TEMPLATE.md. Only draft plans may be edited.' : 'Read .broke-harness/commands/implement-plan.md. Edit only the pinned approved plan scope. Shell verification belongs to the orchestrator. Never edit harness infrastructure.',
    };
  }
  agents['broke-orchestrator'] = {
    description: 'Coordinate plan implementation, verification, report and user completion approval', mode: 'primary',
    model: `${config.roles.implement.provider}/${config.roles.implement.model}`, temperature: 0.1,
    permission: { ...structuredClone(read), bash: 'ask', edit: { '*': 'deny', '.tmp/audit-result.json': 'allow' }, task: { '*': 'deny', ...Object.fromEntries(['implement','audit','fix'].map(r => [config.roles[r].agent, 'allow'])) }, question: 'allow' },
    prompt: 'Read .broke-harness/commands/start-plan.md. Delegate application edits, run verification, report, and ask the user to approve completion and a local commit with a descriptive message, or request optional audit. After any unambiguous approval in a later user message, regardless of wording, run the completion helper with --commit-message to gate, archive and commit the approved changes. Never require an independent audit unless the user requests it.',
  };
  agents['broke-docs'] = {
    description: 'Update and clean project documentation when explicitly requested', mode: 'primary',
    model: `${config.roles.implement.provider}/${config.roles.implement.model}`,
    permission: { ...structuredClone(read), question: 'allow', edit: { '*': 'deny', 'docs/*.md': 'allow', 'docs/**/*.md': 'allow', 'docs/exec-plans/**': 'deny', 'README.md': 'allow', 'ARCHITECTURE.md': 'allow', 'architecture.md': 'allow' } },
    prompt: 'Read .broke-harness/commands/update-docs.md. Reconcile documentation only when the user invokes this command. Preserve intended architecture; ask about material contradictions. Never modify application code, project instructions, plans or Git state.',
  };
  return { $schema: 'https://opencode.ai/config.json', agent: agents };
}
