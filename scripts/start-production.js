const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function checkTools() {
  console.log('🚀 Starting TwipClip on Railway...');
  console.log('================================');
  
  // Check FFmpeg
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    console.log('✅ FFmpeg found:', stdout.split('\n')[0]);
  } catch (e) {
    console.log('⚠️  FFmpeg not found');
  }
  
  // Check yt-dlp
  try {
    const { stdout } = await execAsync('yt-dlp --version');
    console.log('✅ yt-dlp found:', stdout.trim());
  } catch (e) {
    try {
      const { stdout } = await execAsync('python3 -m yt_dlp --version');
      console.log('✅ yt-dlp (python module) found:', stdout.trim());
    } catch (e2) {
      console.log('⚠️  yt-dlp not found');
    }
  }
  
  console.log('================================');
  console.log('Starting Next.js server...');
  
  // Start the Next.js server
  require('child_process').spawn('npm', ['start'], {
    stdio: 'inherit',
    shell: true
  });
}

checkTools().catch(console.error); 