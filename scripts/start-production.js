const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting TwipClip production server...');

// Function to copy cookies
async function copyCookies() {
  const sourcePath = path.join(process.cwd(), 'app/api/auth/youtube/cookies/youtube_cookies.txt');
  const destPath = path.join(process.cwd(), 'temp/youtube_cookies.txt');
  const dockerDestPath = '/app/temp/youtube_cookies.txt';
  
  // Ensure temp directory exists
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Check if source cookie file exists
  if (fs.existsSync(sourcePath)) {
    try {
      // Copy to local temp directory
      fs.copyFileSync(sourcePath, destPath);
      console.log('✅ Cookies copied to temp directory');
      
      // If running in Docker/Railway, also ensure the docker path
      if (process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV || process.env.NODE_ENV === 'production') {
        const dockerTempDir = '/app/temp';
        if (!fs.existsSync(dockerTempDir)) {
          fs.mkdirSync(dockerTempDir, { recursive: true });
        }
        fs.copyFileSync(sourcePath, dockerDestPath);
        console.log('✅ Cookies copied to Docker temp directory');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Failed to copy cookies:', error);
      return false;
    }
  } else {
    console.log('⚠️ No YouTube cookies found - authentication may be required');
    return false;
  }
}

// Copy cookies first
copyCookies().then(() => {
  // Set production environment if not already set
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';

  // Start the Next.js server
  const startCommand = 'next start';
  
  console.log(`Running: ${startCommand}`);
  
  const server = exec(startCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error}`);
      return;
    }
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  });

  // Forward stdout and stderr
  server.stdout.on('data', (data) => {
    console.log(data.toString());
  });

  server.stderr.on('data', (data) => {
    console.error(data.toString());
  });

  // Handle process termination
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.kill();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    server.kill();
    process.exit(0);
  });
}); 