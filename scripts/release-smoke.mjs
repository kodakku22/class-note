import { spawn } from 'child_process';
import { access, mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';

const exePath = path.join(process.cwd(), 'release', 'win-unpacked', 'ClassNotes.exe');
const asarPath = path.join(process.cwd(), 'release', 'win-unpacked', 'resources', 'app.asar');
const timeoutMs = Number(process.env.CLASSNOTES_SMOKE_TIMEOUT_MS ?? 8000);

try {
  await access(exePath);
  await access(asarPath);
} catch {
  console.error('Packaged app not found. Run npm run dist before npm run test:release-smoke.');
  process.exit(1);
}

const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'classnotes-smoke-'));
const logPath = path.join(userDataDir, 'logs', 'main.log');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStartupLog(deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const text = await readFile(logPath, 'utf-8');
      if (text.includes('--- ClassNotes started ---') && text.includes('app.whenReady')) {
        return text;
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(250);
  }
  throw new Error(
    `Packaged app did not write the expected startup log at ${logPath}${
      lastError ? ` (${lastError.message})` : ''
    }`
  );
}

const child = spawn(exePath, [`--user-data-dir=${userDataDir}`], {
  stdio: 'ignore',
  windowsHide: true,
  env: {
    ...process.env,
    CLASSNOTES_SMOKE_TEST: '1',
    CLASSNOTES_SMOKE_USER_DATA_DIR: userDataDir,
  },
});

let exited = false;
let exitCode = null;
child.on('exit', (code) => {
  exited = true;
  exitCode = code;
});

let logText = '';
try {
  logText = await waitForStartupLog(timeoutMs);
} catch (err) {
  child.kill();
  await sleep(1000);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  console.error(String(err));
  process.exit(1);
}

if (exited) {
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  console.error(`ClassNotes exited during smoke test with code ${exitCode}.`);
  process.exit(1);
}

if (/uncaught|unhandledRejection/i.test(logText)) {
  child.kill();
  await sleep(1000);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  console.error('ClassNotes startup log contains an uncaught error.');
  process.exit(1);
}

child.kill();
await sleep(1000);
await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
console.info(`Release smoke test passed: ${exePath}`);
