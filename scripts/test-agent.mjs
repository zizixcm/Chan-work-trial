import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('npm run test:agent             Unit tests + TypeScript (no database/build)\nnpm run test:agent -- --full    Fresh build + all simulated integration suites\nSee docs/TESTING.md for prerequisites and the required browser checklist.');
  process.exit(0);
}
if (args.some(arg => arg !== '--full') || args.length > 1) {
  console.error('Usage: npm run test:agent [-- --full]');
  process.exit(2);
}
const full = args.includes('--full');
// Override inherited/.env settings: this workflow never opts into paid model calls
// and never points the HTTP suites at an unrelated, potentially stale build.
const env = { ...process.env, AI_SMOKE_REAL: '0', AI_SMOKE_CASE: 'complete', PORTAL_TEST_BUILD_DIR: root };
const steps = [
  ['Unit tests', 'test'],
  ['TypeScript', 'typecheck'],
  ...(full ? [
    ['Production build', 'build'],
    ['HTTP / access / uploads', 'test:integration'],
    ['Job lifecycle', 'test:jobs-integration'],
    ['Workflow behavior', 'test:workflow-integration'],
    ['Borrower context / conversation', 'test:chat-integration'],
    ['Native borrower agents / durable preparation', 'test:borrower-agents'],
    ['Incremental findings / completeness', 'test:incremental-findings'],
    ['AI HTTP: complete evidence (simulated)', 'test:ai-integration'],
    ['AI HTTP: missing rent (simulated)', 'test:ai-integration', { AI_SMOKE_CASE: 'missing-rent' }],
  ] : []),
];

async function previewIsRunning() {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 3001 });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', error => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(error);
    });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Could not check preview port 3001.')); });
  });
}

try {
  if (full && await previewIsRunning()) {
    throw new Error('Port 3001 is in use. Coordinate stopping the preview before --full; it rebuilds the shared .next directory. Quick checks remain available.');
  }
  console.log(`Agent checks: ${full ? 'full' : 'quick'}. Keep source unchanged during this run.`);
  for (const [label, script, overrides] of steps) {
    console.log(`\n>>> ${label}: npm run ${script}`);
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], {
        cwd: root, env: { ...env, ...overrides }, stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (signal) reject(new Error(`${label} interrupted (${signal}).`));
        else resolve(code);
      });
    });
    if (code !== 0) {
      console.error(`\nFAILED: ${label}. Fix the cause, rerun that check, then rerun this command. Later checks were not run.`);
      process.exitCode = code || 1;
      break;
    }
  }
  if (!process.exitCode) {
    console.log(`\nPASS: ${full ? 'full automated checks' : 'quick checks only; build/integration checks not run'}. Browser verification is still required: docs/TESTING.md`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
