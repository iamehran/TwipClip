import { checkSystemTools } from './system-tools';

export async function performStartupCheck(): Promise<boolean> {
  console.log('🚀 TwipClip Starting Up...\n');
  
  const USE_RAPIDAPI = process.env.USE_RAPIDAPI === 'true';
  
  if (!USE_RAPIDAPI) {
    console.log('🔧 Checking system tools...\n');
    
    // Check if running on Railway
    if (process.env.RAILWAY_ENVIRONMENT) {
      console.log('📍 Running on Railway\n');
    }
    
    const tools = await checkSystemTools();
    
    console.log('📋 System Tools Status:');
    console.log(`yt-dlp: ${tools.ytdlp.available ? '✅' : '❌'} ${tools.ytdlp.version || 'Not found'}`);
    console.log(`FFmpeg: ${tools.ffmpeg.available ? '✅' : '❌'} ${tools.ffmpeg.version || 'Not found'}\n`);
    
    // Check yt-dlp
    if (!tools.ytdlp.available) {
      console.log('❌ yt-dlp is required but not found!');
      console.log('📝 yt-dlp should be installed via Docker.');
      console.log('📝 Check Dockerfile includes yt-dlp installation.');
      console.log('📝 The startup script should show yt-dlp availability.');
      return false;
    }
    
    // Check FFmpeg
    if (!tools.ffmpeg.available) {
      console.error('\n❌ FFmpeg is required but not found!');
      console.error('FFmpeg is essential for processing audio and video files.');
      return false;
    }
  } else {
    // RapidAPI mode - only check FFmpeg
    console.log('🚀 Using RapidAPI for video operations\n');
    
    const { checkFFmpeg } = require('./system-tools');
    const ffmpegCheck = await checkFFmpeg();
    
    console.log('📋 System Tools Status:');
    console.log(`FFmpeg: ${ffmpegCheck.available ? '✅' : '❌'} ${ffmpegCheck.version || 'Not found'}\n`);
    
    if (!ffmpegCheck.available) {
      console.error('❌ FFmpeg is required but not found!');
      console.error('FFmpeg is essential for processing audio and video files.');
      return false;
    }
  }
  
  console.log('📋 Environment Check:');
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅' : '❌'}`);
  
  if (USE_RAPIDAPI) {
    console.log(`RapidAPI Key: ${process.env.RAPIDAPI_KEY ? '✅' : '❌'}`);
    console.log(`RapidAPI Host: ${process.env.RAPIDAPI_HOST ? '✅' : '❌'}`);
  }
  
  console.log('\n✅ All systems ready!');
  console.log('   - OpenAI API configured');
  if (USE_RAPIDAPI) {
    console.log('   - RapidAPI configured');
  }
  console.log('   - FFmpeg available');
  
  return true;
} 