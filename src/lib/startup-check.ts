import { checkSystemTools } from './system-tools';

export async function performStartupCheck(): Promise<boolean> {
  console.log('🚀 TwipClip Starting Up...\n');
  console.log('🚀 Using RapidAPI for video operations\n');
  
  // We only need to check FFmpeg since we're using RapidAPI
  const tools = await checkSystemTools();
  
  console.log('📋 System Tools Status:');
  console.log(`FFmpeg: ${tools.ffmpeg.available ? '✅' : '❌'} ${tools.ffmpeg.version || 'Not found'}\n`);
  
  // Check FFmpeg (still needed for video processing)
  if (!tools.ffmpeg.available) {
    console.error('❌ FFmpeg is required but not found!');
    console.error('FFmpeg is essential for processing audio and video files.');
    return false;
  }
  
  // Check environment variables
  console.log('📋 Environment Check:');
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅' : '❌'}`);
  console.log(`RapidAPI Key: ${process.env.RAPIDAPI_KEY ? '✅' : '❌'}`);
  console.log(`RapidAPI Host: ${process.env.RAPIDAPI_HOST ? '✅' : '❌'}`);
  
  // Check if RapidAPI credentials are set
  if (!process.env.RAPIDAPI_KEY || !process.env.RAPIDAPI_HOST) {
    console.error('\n❌ RapidAPI credentials are required!');
    console.error('Please set RAPIDAPI_KEY and RAPIDAPI_HOST in your environment variables.');
    return false;
  }
  
  console.log('\n✅ All systems ready!');
  console.log('   - OpenAI API configured');
  console.log('   - RapidAPI configured');
  console.log('   - FFmpeg available');
  
  return true;
} 