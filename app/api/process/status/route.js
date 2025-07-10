import { NextResponse } from 'next/server';

// In-memory storage for job statuses
// In production, use Redis or a database
// Use global to persist across hot reloads in development
if (!global.twipclipJobs) {
  global.twipclipJobs = new Map();
}
export const jobs = global.twipclipJobs;

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
  
  console.log(`📊 Status check for job ${jobId}:`, status ? `Found (${status.status})` : 'Not found');
  console.log(`📋 Total jobs in memory: ${jobs.size}`);
  console.log('🗺️ Jobs Map instance ID:', jobs);
  
  if (!status) {
    // Log all job IDs for debugging
    console.log('🔍 Available job IDs:', Array.from(jobs.keys()));
    return NextResponse.json({ 
      status: 'not_found',
      message: 'Job not found or expired' 
    });
  }
  
  return NextResponse.json(status);
}

// Track cleanup timeouts to prevent duplicates
// Use global to persist across hot reloads in development
if (!global.twipclipCleanupTimeouts) {
  global.twipclipCleanupTimeouts = new Map();
}
const cleanupTimeouts = global.twipclipCleanupTimeouts;

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
  
  // Only set cleanup timeout for terminal states
  if (update.status === 'completed' || update.status === 'failed') {
    // Clear any existing cleanup timeout
    if (cleanupTimeouts.has(jobId)) {
      clearTimeout(cleanupTimeouts.get(jobId));
    }
    
    const cleanupDelay = update.status === 'completed' ? 600000 : // 10 minutes for completed
                         300000;                                  // 5 minutes for failed
    
    const timeoutId = setTimeout(() => {
      console.log(`🗑️ Cleaning up job ${jobId} (was ${update.status})`);
      jobs.delete(jobId);
      cleanupTimeouts.delete(jobId);
    }, cleanupDelay);
    
    cleanupTimeouts.set(jobId, timeoutId);
  }
}

// Helper to create a new job
export function createProcessingJob(jobId) {
  const jobData = {
    status: 'processing',
    progress: 0,
    message: 'Starting processing...',
    startTime: Date.now(),
    lastUpdate: Date.now(),
    createdAt: Date.now()
  };
  
  jobs.set(jobId, jobData);
  console.log(`✅ Job ${jobId} created in jobs Map`);
  console.log(`📊 Total jobs after creation: ${jobs.size}`);
  console.log(`🔍 Verification - job exists: ${jobs.has(jobId)}`);
} 