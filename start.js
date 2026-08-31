const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('=====================================================');
console.log(' Starting CRM Salvadora Full-Stack (Docker/Dokploy)  ');
console.log('=====================================================');

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');
const backendPort = '3001';
const frontendPort = process.env.PORT || '3000';

// 1. Start NestJS Backend on port 3001
console.log(`[Backend] Starting NestJS on port ${backendPort}...`);

const backend = spawn('node', ['dist/main.js'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: backendPort,
    BACKEND_PORT: backendPort,
    NODE_ENV: 'production',
  },
});

backend.on('error', (err) => {
  console.error('[Backend] Fatal spawn error:', err);
});

backend.on('exit', (code, signal) => {
  console.error(`[Backend] Process exited with code ${code} signal ${signal}`);
});

// 2. Start Next.js Frontend on port 3000
let frontendCmd = 'node';
let frontendArgs = ['server.js'];

if (fs.existsSync(path.join(frontendDir, 'server.js'))) {
  frontendCmd = 'node';
  frontendArgs = ['server.js'];
} else if (fs.existsSync(path.join(frontendDir, '.next', 'standalone', 'server.js'))) {
  frontendCmd = 'node';
  frontendArgs = [path.join(frontendDir, '.next', 'standalone', 'server.js')];
} else if (fs.existsSync(path.join(frontendDir, '.next', 'standalone', 'frontend', 'server.js'))) {
  frontendCmd = 'node';
  frontendArgs = [path.join(frontendDir, '.next', 'standalone', 'frontend', 'server.js')];
} else {
  frontendCmd = 'pnpm';
  frontendArgs = ['start'];
}

console.log(`[Frontend] Starting Next.js on port ${frontendPort}...`);

const frontend = spawn(frontendCmd, frontendArgs, {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PORT: frontendPort,
    HOSTNAME: '0.0.0.0',
    NODE_ENV: 'production',
    INTERNAL_API_URL: `http://127.0.0.1:${backendPort}`,
  },
});

frontend.on('error', (err) => {
  console.error('[Frontend] Fatal spawn error:', err);
});

frontend.on('exit', (code, signal) => {
  console.error(`[Frontend] Process exited with code ${code} signal ${signal}`);
});

function cleanup() {
  console.log('Shutting down CRM Salvadora services...');
  try { backend.kill('SIGTERM'); } catch {}
  try { frontend.kill('SIGTERM'); } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
