const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

async function installYtDlp() {
  console.log('🔧 Installing yt-dlp...');
  
  try {
    // Try direct binary download first
    console.log('Downloading yt-dlp binary...');
    await execAsync('mkdir -p ~/.local/bin');
    await execAsync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp');
    await execAsync('chmod a+rx ~/.local/bin/yt-dlp');
    
    // Test if it works
    const { stdout } = await execAsync('~/.local/bin/yt-dlp --version');
    console.log('✅ yt-dlp installed:', stdout.trim());
    
    // Update PATH
    process.env.PATH = `${process.env.HOME}/.local/bin:${process.env.PATH}`;
    
  } catch (e) {
    console.log('Binary download failed, trying pip...');
    try {
      // Try pip install with break-system-packages
      await execAsync('python3 -m pip install --break-system-packages -U yt-dlp');
      console.log('✅ yt-dlp installed via pip');
    } catch (e2) {
      console.error('❌ Failed to install yt-dlp:', e2.message);
    }
  }
}

async function checkTools() {
  console.log('🚀 Starting TwipClip on Railway...');
  console.log('================================');
  
  // Install yt-dlp first
  await installYtDlp();
  
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
      console.log('⚠️  yt-dlp not found after installation attempt');
    }
  }
  
  console.log('================================');
  console.log('Starting Next.js server...');
  
  // Start the Next.js server
  require('child_process').spawn('npm', ['start'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`
    }
  });
}

checkTools().catch(console.error); 