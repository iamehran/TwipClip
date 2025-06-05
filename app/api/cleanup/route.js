import { NextResponse } from 'next/server';
import { cleanupTempFiles } from '../../../src/lib/video-downloader';

export async function POST(request) {
  try {
    // Optional: Add a secret key check for security
    const { secret } = await request.json();
    
    if (process.env.CLEANUP_SECRET && secret !== process.env.CLEANUP_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Clean files older than 30 minutes
    await cleanupTempFiles(30);
    
    return NextResponse.json({
      success: true,
      message: 'Cleanup completed',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// Also allow GET for easy manual triggering
export async function GET() {
  // For GET requests, only clean very old files (2 hours)
  try {
    await cleanupTempFiles(120);
    
    return NextResponse.json({
      success: true,
      message: 'Old files cleaned',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
} 