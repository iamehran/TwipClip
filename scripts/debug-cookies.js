const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function debugCookies() {
  console.log('🔍 Cookie Debugging Script\n');
  
  // 1. Check environment
  const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV || process.env.NODE_ENV === 'production';
  console.log(`Environment: ${isDocker ? 'Docker/Railway' : 'Local'}`);
  console.log(`Current directory: ${process.cwd()}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT || 'not set'}`);
  
  // 2. Check temp directory structure
  console.log('\n📁 Checking directory structure:');
  const tempDir = isDocker ? '/app/temp' : path.join(process.cwd(), 'temp');
  const userCookiesDir = path.join(tempDir, 'user-cookies');
  
  console.log(`Temp dir: ${tempDir} - ${fs.existsSync(tempDir) ? '✅ EXISTS' : '❌ NOT FOUND'}`);
  console.log(`User cookies dir: ${userCookiesDir} - ${fs.existsSync(userCookiesDir) ? '✅ EXISTS' : '❌ NOT FOUND'}`);
  
  // 3. List all session directories
  if (fs.existsSync(userCookiesDir)) {
    const sessions = fs.readdirSync(userCookiesDir);
    console.log(`\nFound ${sessions.length} session(s):`);
    
    sessions.forEach(sessionId => {
      const cookieFile = path.join(userCookiesDir, sessionId, 'youtube_cookies.txt');
      if (fs.existsSync(cookieFile)) {
        const stats = fs.statSync(cookieFile);
        const content = fs.readFileSync(cookieFile, 'utf-8');
        const cookieCount = content.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
        
        console.log(`\n  Session: ${sessionId}`);
        console.log(`  Cookie file: ${cookieFile}`);
        console.log(`  Size: ${stats.size} bytes`);
        console.log(`  Cookie entries: ${cookieCount}`);
        console.log(`  Modified: ${stats.mtime}`);
        
        // Show first few cookies (sanitized)
        const firstCookie = content.split('\n').find(l => l.includes('.youtube.com') && !l.startsWith('#'));
        if (firstCookie) {
          const parts = firstCookie.split('\t');
          console.log(`  Sample cookie domain: ${parts[0] || 'unknown'}`);
        }
      }
    });
  }
  
  // 4. Test yt-dlp with cookies
  console.log('\n🧪 Testing yt-dlp with cookies:');
  
  // Find a session with cookies
  let testSessionId = null;
  let testCookieFile = null;
  
  if (fs.existsSync(userCookiesDir)) {
    const sessions = fs.readdirSync(userCookiesDir);
    for (const sessionId of sessions) {
      const cookieFile = path.join(userCookiesDir, sessionId, 'youtube_cookies.txt');
      if (fs.existsSync(cookieFile)) {
        testSessionId = sessionId;
        testCookieFile = cookieFile;
        break;
      }
    }
  }
  
  if (testCookieFile) {
    console.log(`\nTesting with session: ${testSessionId}`);
    console.log(`Cookie file: ${testCookieFile}`);
    
    // Test command
    const ytdlpPath = isDocker ? '/usr/local/bin/yt-dlp' : 'yt-dlp';
    const testUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // "Me at the zoo" - first YouTube video
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    const command = `${ytdlpPath} --cookies "${testCookieFile}" --user-agent "${userAgent}" --dump-json --no-warnings "${testUrl}"`;
    
    console.log('\nTest command:', command.replace(testCookieFile, '***'));
    
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      
      if (stderr && stderr.includes('Sign in to confirm')) {
        console.log('❌ Bot detection triggered despite cookies!');
        console.log('Error:', stderr);
      } else if (stdout) {
        const data = JSON.parse(stdout);
        console.log('✅ Successfully fetched video info with cookies!');
        console.log(`Title: ${data.title}`);
        console.log(`Duration: ${data.duration}s`);
      }
    } catch (error) {
      console.log('❌ yt-dlp test failed:', error.message);
      if (error.stderr) {
        console.log('stderr:', error.stderr);
      }
    }
  } else {
    console.log('❌ No cookie files found to test with!');
  }
  
  // 5. Check file permissions
  console.log('\n🔐 Checking file permissions:');
  if (testCookieFile && fs.existsSync(testCookieFile)) {
    const stats = fs.statSync(testCookieFile);
    console.log(`Cookie file permissions: ${(stats.mode & parseInt('777', 8)).toString(8)}`);
    console.log(`Readable: ${fs.constants.R_OK & stats.mode ? 'Yes' : 'No'}`);
  }
  
  // 6. Environment variables that might affect cookies
  console.log('\n🌍 Relevant environment variables:');
  console.log(`HTTP_PROXY: ${process.env.HTTP_PROXY || 'not set'}`);
  console.log(`HTTPS_PROXY: ${process.env.HTTPS_PROXY || 'not set'}`);
  console.log(`NO_PROXY: ${process.env.NO_PROXY || 'not set'}`);
}

// Run the debug script
debugCookies().catch(console.error); 