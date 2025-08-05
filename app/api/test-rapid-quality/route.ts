import { NextResponse } from 'next/server';
import { getRapidAPIClientV2 } from '@/src/lib/rapidapi-youtube-v2';

export async function POST(request: Request) {
  try {
    const { videoUrl } = await request.json();
    
    if (!videoUrl) {
      return NextResponse.json({ error: 'Missing videoUrl parameter' }, { status: 400 });
    }
    
    console.log('🧪 Testing RapidAPI quality with video:', videoUrl);
    
    const client = getRapidAPIClientV2();
    
    // Try to get download info without actually downloading
    try {
      const downloadInfo = await client.getVideoDownloadUrl(videoUrl, '720p');
      console.log('📥 Download info:', downloadInfo);
      
      // Test if the URL actually gives us 720p
      if (downloadInfo.url) {
        // The download URL might contain quality info
        console.log('🔍 Download URL analysis:', {
          url: downloadInfo.url,
          includes720: downloadInfo.url.includes('720'),
          includes22: downloadInfo.url.includes('22'),
          includesItag: downloadInfo.url.includes('itag')
        });
      }
      
      return NextResponse.json({
        success: true,
        downloadInfo,
        message: 'Check server logs for detailed information'
      });
    } catch (error: any) {
      console.error('❌ RapidAPI error:', error);
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error.response?.data
      });
    }
  } catch (error: any) {
    console.error('Test endpoint error:', error);
    return NextResponse.json({ 
      error: 'Test failed', 
      details: error.message 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST with { videoUrl: "..." } to test RapidAPI quality'
  });
}