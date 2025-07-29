import { checkSystemTools } from './system-tools';

export async function performStartupCheck(): Promise<boolean> {
  console.log('🚀 TwipClip Starting Up...\n');
  
  // Check system tools
  const tools = await checkSystemTools();
  
  // Check environment variables
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  
  console.log('\n📋 Environment Check:');
  console.log(`OpenAI API Key: ${hasOpenAI ? '✅' : '❌'}`);
  
  // Check required services
  if (!hasOpenAI) {
    console.error('\n❌ OpenAI API key is required but not found!');
    console.error('Please set OPENAI_API_KEY environment variable.');
    return false;
  }
  
  // With RapidAPI, we don't need yt-dlp anymore
  if (process.env.USE_RAPIDAPI !== 'true') {
    if (!tools.ytdlp.available) {
      console.error('\n❌ yt-dlp is required but not found!');
      console.error('The application cannot function without yt-dlp or RapidAPI.');
      return false;
    }
  }
  
  if (!tools.ffmpeg.available) {
    console.error('\n❌ FFmpeg is required but not found!');
    console.error('The application cannot function without FFmpeg.');
    return false;
  }
  
  console.log('\n✅ All systems ready!');
  console.log('   - OpenAI API configured');
  if (process.env.USE_RAPIDAPI === 'true') {
    console.log('   - RapidAPI configured (no yt-dlp needed)');
  } else {
    console.log('   - yt-dlp available');
  }
  console.log('   - FFmpeg available');
  
  return true;
} 