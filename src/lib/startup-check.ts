import { checkSystemTools } from './system-tools';

export async function performStartupCheck(): Promise<boolean> {
  console.log('🚀 TwipClip Starting Up...\n');
  
  // Check system tools
  const tools = await checkSystemTools();
  
  // Check environment variables
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  
  console.log('\n📋 Environment Check:');
  console.log(`OpenAI API Key: ${hasOpenAI ? '✅' : '❌'}`);
  
  // Only block if OpenAI is missing
  if (!hasOpenAI) {
    console.error('\n❌ OpenAI API key is required but not found!');
    console.error('Please set OPENAI_API_KEY environment variable.');
    return false;
  }
  
  // Warn about missing tools but don't block
  if (!tools.ytdlp.available || !tools.ffmpeg.available) {
    console.warn('\n⚠️  Some tools are missing but core functionality may still work.');
    console.warn('Video processing features may be limited.');
  } else {
    console.log('\n✅ All systems ready!');
  }
  
  return true;
} 