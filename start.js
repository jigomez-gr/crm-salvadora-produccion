const { spawn } = require('child_process');
const path = require('path');

console.log('--- Starting CRM Salvadora Full-Stack (Backend + Frontend) ---');

// 1. Start NestJS Backend on port 3001
const backend = spawn('node', ['backend/dist/main.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.BACKEND_PORT || '3001',
    NODE_ENV: 'production',
  },
});

backend.on('error', (err) => {
  console.error('Backend process error:', err);
});

backend.on('exit', (code, signal) => {
  console.log(`Backend process exited with code ${code} signal ${signal}`);
  if (code !== 0) {
    process.exit(code || 1);
  }
});

// 2. Start Next.js Frontend on port 3000
const frontend = spawn('node', ['frontend/server.js'], {
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
  console.error('Frontend process error:', err);
});

frontend.on('exit', (code, signal) => {
  console.log(`Frontend process exited with code ${code} signal ${signal}`);
  if (code !== 0) {
    process.exit(code || 1);
  }
});

function cleanup() {
  console.log('Shutting down services...');
  try { backend.kill('SIGTERM'); } catch {}
  try { frontend.kill('SIGTERM'); } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
