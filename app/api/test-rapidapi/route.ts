import { NextResponse } from 'next/server';
import { rapidAPIClient } from '../../../src/lib/rapidapi-youtube';

export async function GET() {
  try {
    // Test with a known video
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    
    console.log('🧪 Testing RapidAPI integration...');
    
    // Test 1: Get available qualities
    console.log('📊 Getting available qualities...');
    const qualities = await rapidAPIClient.getAvailableQualities(testUrl);
    
    const audioQualities = qualities.filter(q => q.type === 'audio');
    const videoQualities = qualities.filter(q => q.type === 'video');
    
    console.log(`✅ Found ${audioQualities.length} audio and ${videoQualities.length} video qualities`);
    
    // Test 2: Get audio download URL
    console.log('🎵 Getting audio download URL...');
    const audioInfo = await rapidAPIClient.getAudioDownloadUrl(testUrl);
    
    console.log(`✅ Got audio URL: ${audioInfo.file.substring(0, 50)}...`);
    
    // Test 3: Get video download URL
    console.log('🎬 Getting video download URL...');
    const videoInfo = await rapidAPIClient.getVideoDownloadUrl(testUrl);
    
    console.log(`✅ Got video URL: ${videoInfo.file.substring(0, 50)}...`);
    
    return NextResponse.json({
      success: true,
      message: 'RapidAPI integration is working correctly!',
      details: {
        audioQualities: audioQualities.length,
        videoQualities: videoQualities.length,
        bestAudioQuality: audioQualities[0],
        bestVideoQuality: videoQualities.find(q => q.quality === '720p') || videoQualities[0],
        audioDownloadUrl: audioInfo.file.substring(0, 50) + '...',
        videoDownloadUrl: videoInfo.file.substring(0, 50) + '...'
      }
    });
    
  } catch (error: any) {
    console.error('❌ RapidAPI test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      hint: 'Check that RAPIDAPI_KEY and RAPIDAPI_HOST are set in environment variables'
    }, { status: 500 });
  }
} 