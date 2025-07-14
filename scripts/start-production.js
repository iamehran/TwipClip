const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting TwipClip production server...');

// Ensure necessary directories exist
function ensureDirectories() {
  const dirs = [
    'temp',
    'temp/user-cookies',
    'public/downloads'
  ];
  
  dirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      try {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
      } catch (error) {
        console.warn(`⚠️ Could not create directory ${dir}:`, error.message);
      }
    }
  });
}

// Main startup
async function start() {
  console.log('📁 Ensuring directories exist...');
  ensureDirectories();
  
  console.log('🌐 Starting Next.js server...');
  
  const port = process.env.PORT || 3000;
  console.log(`📍 Port: ${port}`);
  
  // Start Next.js
  const server = spawn('npm', ['run', 'start'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: port
    }
  });

  server.on('error', (error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });

  server.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ Server exited with code ${code}`);
      process.exit(code);
    }
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('📴 SIGTERM received, shutting down gracefully...');
    server.kill();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('📴 SIGINT received, shutting down gracefully...');
    server.kill();
    process.exit(0);
  });
}

// Start the application
start().catch(error => {
  console.error('❌ Startup failed:', error);
  process.exit(1);
}); 