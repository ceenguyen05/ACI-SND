import { spawn } from 'node:child_process';
const run = (file, args) => spawn(process.execPath, [file, ...args], { stdio: 'inherit', windowsHide: true });
const server = run('node_modules/tsx/dist/cli.mjs', ['watch', 'server/index.ts']);
const vite = run('node_modules/vite/bin/vite.js', ['--host', '0.0.0.0']);
let stopping = false;
const stop = code => { if (stopping) return; stopping = true; server.kill(); vite.kill(); process.exitCode = code ?? 0; };
server.on('exit', stop); vite.on('exit', stop);
process.on('SIGINT', () => stop(0)); process.on('SIGTERM', () => stop(0));
