import { NextResponse } from 'next/server';
import { scrapeYouTubeTranscript } from '../../../src/lib/youtube-transcript-scraper';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('v') || 'dQw4w9WgXcQ'; // Default to Rick Astley
  
  try {
    console.log(`Testing scraper with video ID: ${videoId}`);
    const transcript = await scrapeYouTubeTranscript(videoId);
    
    if (transcript && transcript.length > 0) {
      return NextResponse.json({
        success: true,
        videoId,
        segmentCount: transcript.length,
        firstSegment: transcript[0],
        lastSegment: transcript[transcript.length - 1],
        sampleSegments: transcript.slice(0, 5)
      });
    } else {
      return NextResponse.json({
        success: false,
        videoId,
        error: 'No transcript found'
      });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      videoId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
} 