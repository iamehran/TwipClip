import { NextResponse } from 'next/server';

// In-memory storage for job statuses
// In production, use Redis or a database
export const jobs = new Map();

// Helper function to clean up old jobs (older than 1 hour)
function cleanupOldJobs() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [jobId, job] of jobs.entries()) {
    if (job.createdAt < oneHourAgo) {
      jobs.delete(jobId);
    }
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  
  if (!jobId) {
    return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
  }
  
  const status = jobs.get(jobId);
  
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
  const current = jobs.get(jobId) || {
    status: 'processing',
    progress: 0,
    message: 'Initializing...',
    startTime: Date.now()
  };
  
  jobs.set(jobId, {
    ...current,
    ...update,
    lastUpdate: Date.now()
  });
  
  // Clean up old jobs after 1 hour
  setTimeout(() => {
    jobs.delete(jobId);
  }, 3600000);
}

// Helper to create a new job
export function createProcessingJob(jobId) {
  jobs.set(jobId, {
    status: 'processing',
    progress: 0,
    message: 'Starting processing...',
    startTime: Date.now(),
    lastUpdate: Date.now()
  });
} 