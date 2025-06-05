import { checkSystemTools } from './system-tools';

export async function performStartupCheck(): Promise<boolean> {
  console.log('🚀 TwipClip Starting Up...\n');
  
  // Check system tools
  const tools = await checkSystemTools();
  
  // Check environment variables
  console.log('\n📋 Environment Check:');
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  console.log(`OpenAI API Key: ${hasOpenAI ? '✅' : '❌'}`);
  
  if (!hasOpenAI) {
    console.error('❌ OPENAI_API_KEY is required but not set!');
    console.error('📝 Add to .env.local: OPENAI_API_KEY=your_key_here');
  }
  
  // Overall status
  const allGood = tools.ytdlp.available && tools.ffmpeg.available && hasOpenAI;
  
  if (allGood) {
    console.log('\n✅ All systems ready! TwipClip is good to go.\n');
  } else {
    console.log('\n⚠️  Some requirements are missing. Please fix the issues above.\n');
  }
  
  return allGood;
} 