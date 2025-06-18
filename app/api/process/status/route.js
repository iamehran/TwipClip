import { NextResponse } from 'next/server';

// Store processing status in memory (in production, use Redis or similar)
const processingStatus = new Map();

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  
  if (!jobId) {
    return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
  }
  
  const status = processingStatus.get(jobId);
  
  if (!status) {
    return NextResponse.json({ 
      status: 'not_found',
      message: 'Job not found or expired' 
    });
  }
  
  return NextResponse.json(status);
}

// Helper function to update status (exported for use in process route)
export function updateProcessingStatus(jobId, update) {
  const current = processingStatus.get(jobId) || {
    status: 'processing',
    progress: 0,
    message: 'Initializing...',
    startTime: Date.now()
  };
  
  processingStatus.set(jobId, {
    ...current,
    ...update,
    lastUpdate: Date.now()
  });
  
  // Clean up old jobs after 1 hour
  setTimeout(() => {
    processingStatus.delete(jobId);
  }, 3600000);
}

// Helper to create a new job
export function createProcessingJob(jobId) {
  processingStatus.set(jobId, {
    status: 'processing',
    progress: 0,
    message: 'Starting processing...',
    startTime: Date.now(),
    lastUpdate: Date.now()
  });
} 