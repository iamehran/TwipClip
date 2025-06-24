const fs = require('fs');
const path = require('path');

// Copy cookies from the API directory to the temp directory for yt-dlp
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
      if (process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV) {
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
    console.log('⚠️ No YouTube cookies found at:', sourcePath);
    return false;
  }
}

// Run the copy operation
copyCookies(); 