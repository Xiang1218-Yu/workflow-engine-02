import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npmCommand, ['run', 'dev', '--workspace', '@feature-flags/api'], { stdio: 'inherit' }),
  spawn(npmCommand, ['run', 'dev', '--workspace', '@feature-flags/web'], { stdio: 'inherit' }),
];

function stop() {
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
}
