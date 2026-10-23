// Runs the long bot-vs-bot balance report.  node scripts/balance.mjs [easy|normal|hard|expert] [seeds]
import { spawnSync } from 'node:child_process';
const [diff = 'normal', seeds = '6'] = process.argv.slice(2);
const r = spawnSync('npx', ['vitest', 'run', 'tests/balance.test.ts', '--reporter=verbose'], {
  stdio: 'inherit', shell: true, env: { ...process.env, BALANCE: '1', DIFF: diff, SEEDS: seeds },
});
process.exit(r.status ?? 1);
