// In-memory storage for job statuses
// In production, use Redis or a database
// Use global to persist across hot reloads in development
if (!global.twipclipJobs) {
  global.twipclipJobs = new Map();
}
export const jobs = global.twipclipJobs;

// Setup cleanup timeouts storage
if (!global.twipclipCleanupTimeouts) {
  global.twipclipCleanupTimeouts = new Map();
}
const cleanupTimeouts = global.twipclipCleanupTimeouts;

// Helper function to clean up old jobs (older than 1 hour)
function cleanupOldJobs() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [jobId, job] of jobs.entries()) {
    if (job.createdAt < oneHourAgo) {
      jobs.delete(jobId);
    }
  }
}

// Helper function to update status
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
    
    // Set new cleanup timeout (1 hour)
    const timeout = setTimeout(() => {
      jobs.delete(jobId);
      cleanupTimeouts.delete(jobId);
    }, 60 * 60 * 1000);
    
    cleanupTimeouts.set(jobId, timeout);
  }
}

// Helper to create a new job
export function createProcessingJob(jobId) {
  // Clean up old jobs periodically
  cleanupOldJobs();
  
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
  
  return jobData;
} 