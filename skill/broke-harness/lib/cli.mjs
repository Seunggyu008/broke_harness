export function argumentsFor(argv, allowed) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!allowed.includes(key) || key in result) throw new Error(`Unknown or duplicate option: ${key}`);
    if (['--dry-run','--tests','--runtime-check'].includes(key)) result[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${key} requires a value`);
      result[key] = argv[++i];
    }
  }
  return result;
}
export async function cli(action) {
  try { await action(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
