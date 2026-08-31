const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('=====================================================');
console.log(' Starting CRM Salvadora Full-Stack (Nixpacks / Node) ');
console.log('=====================================================');

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

// 1. Start NestJS Backend on port 3001
console.log(`[Backend] Starting NestJS in ${backendDir}...`);
const backend = spawn('node', ['dist/main.js'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.BACKEND_PORT || '3001',
    NODE_ENV: 'production',
  },
});

backend.on('error', (err) => {
  console.error('[Backend] Process error:', err);
});

backend.on('exit', (code, signal) => {
  console.log(`[Backend] Process exited with code ${code} signal ${signal}`);
  if (code !== 0) {
    process.exit(code || 1);
  }
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
  // Use pnpm start inside frontend
  frontendCmd = 'pnpm';
  frontendArgs = ['start'];
}

console.log(`[Frontend] Starting Next.js (${frontendCmd} ${frontendArgs.join(' ')}) in ${frontendDir}...`);

const frontend = spawn(frontendCmd, frontendArgs, {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PORT: process.env.PORT || '3000',
    HOSTNAME: '0.0.0.0',
    NODE_ENV: 'production',
    INTERNAL_API_URL: 'http://127.0.0.1:3001',
  },
});

frontend.on('error', (err) => {
  console.error('[Frontend] Fatal error:', err);
});

frontend.on('exit', (code, signal) => {
  console.log(`[Frontend] Process exited with code ${code} signal ${signal}`);
  if (code !== 0) {
    process.exit(code || 1);
  }
});

function cleanup() {
  console.log('Shutting down CRM Salvadora services...');
  try { backend.kill('SIGTERM'); } catch {}
  try { frontend.kill('SIGTERM'); } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
