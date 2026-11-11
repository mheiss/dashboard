import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const uiDirectory = dirname(directory);
const angularCli = join(uiDirectory, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
if (!existsSync(angularCli)) {
  console.error('Install the UI dependencies before running npm run mock.');
  process.exit(1);
}

const node = process.execPath;
const mockServer = spawn(node, [join(directory, 'server.mjs')], {
  cwd: directory,
  env: { ...process.env, MOCK_PORT: '8081' },
  stdio: 'inherit',
});
const angular = spawn(node, [angularCli, 'serve', '--host', '127.0.0.1', '--port', '4300', '--proxy-config', 'mock-server/proxy.json'], {
  cwd: uiDirectory,
  stdio: 'inherit',
});

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  mockServer.kill();
  angular.kill();
  process.exitCode = exitCode;
}

for (const child of [mockServer, angular]) {
  child.on('error', (error) => {
    console.error('Could not start the mock preview.', error);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
