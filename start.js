const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('=====================================================');
console.log(' Starting CRM Salvadora Full-Stack (Backend + Web)   ');
console.log('=====================================================');

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

// 1. Start NestJS Backend
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
  console.error('[Backend] Fatal error:', err);
});

backend.on('exit', (code, signal) => {
  console.log(`[Backend] Process exited with code ${code} signal ${signal}`);
  if (code !== 0) {
    process.exit(code || 1);
  }
});

// 2. Locate Next.js standalone server.js
let frontendServerFile = path.join(frontendDir, 'server.js');
let frontendCwd = frontendDir;

if (!fs.existsSync(frontendServerFile)) {
  const nested = path.join(frontendDir, 'frontend', 'server.js');
  if (fs.existsSync(nested)) {
    frontendServerFile = nested;
    frontendCwd = path.join(frontendDir, 'frontend');
  }
}

console.log(`[Frontend] Starting Next.js: ${frontendServerFile} in ${frontendCwd}...`);

const frontend = spawn('node', [frontendServerFile], {
  cwd: frontendCwd,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.PORT || '3000',
    HOSTNAME: '0.0.0.0',
    NODE_ENV: 'production',
    INTERNAL_API_URL: 'http://localhost:3001',
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
