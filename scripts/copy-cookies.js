const fs = require('fs');
const path = require('path');

// Copy cookies from user-specific directories to temp directory for yt-dlp
async function copyCookies() {
  // This script is no longer needed for copying shared cookies
  // Each user's cookies are now stored in their session directory
  // and accessed dynamically during video processing
  
  console.log('✅ Session-based cookie system initialized');
  console.log('📁 User cookies will be stored in: temp/user-cookies/{sessionId}/');
  
  // Ensure the user-cookies directory exists
  const userCookiesDir = path.join(process.cwd(), 'temp', 'user-cookies');
  if (!fs.existsSync(userCookiesDir)) {
    fs.mkdirSync(userCookiesDir, { recursive: true });
    console.log('✅ Created user-cookies directory');
  }
  
  return true;
}

// Run the initialization
copyCookies(); 