import { NextResponse } from 'next/server';
import { globalQueue, youtubeRateLimiter } from '../../utils/request-queue';

export async function GET() {
  try {
    const queueStatus = globalQueue.getQueueStatus();
    
    return NextResponse.json({
      queue: queueStatus,
      timestamp: new Date().toISOString(),
      recommendations: {
        maxUsers: Math.floor(queueStatus.maxConcurrent / 3), // Assuming 3 downloads per user
        currentLoad: queueStatus.activeDownloads > 0 ? 
          `${Math.round((queueStatus.activeDownloads / queueStatus.maxConcurrent) * 100)}%` : '0%'
      }
    });
  } catch (error) {
    console.error('Queue status error:', error);
    return NextResponse.json(
      { error: 'Failed to get queue status' },
      { status: 500 }
    );
  }
} 