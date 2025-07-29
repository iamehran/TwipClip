// In-memory storage for job statuses
// In production, use Redis or a database
// Use global to persist across hot reloads in development
if (typeof global !== 'undefined') {
  if (!global.twipclipJobs) {
    global.twipclipJobs = new Map();
  }
  if (!global.twipclipCleanupTimeouts) {
    global.twipclipCleanupTimeouts = new Map();
  }
}

// Fallback for environments where global is not available
const jobsStorage = (typeof global !== 'undefined' && global.twipclipJobs) || new Map();
const timeoutsStorage = (typeof global !== 'undefined' && global.twipclipCleanupTimeouts) || new Map();

export const jobs = jobsStorage;
const cleanupTimeouts = timeoutsStorage;

// Helper function to clean up old jobs (older than 1 hour)
function cleanupOldJobs() {
  try {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [jobId, job] of jobs.entries()) {
      if (job && job.createdAt < oneHourAgo) {
        jobs.delete(jobId);
      }
    }
  } catch (err) {
    console.error('Error cleaning up old jobs:', err);
  }
}

// Helper function to update status - ensure it's always available
export function updateProcessingStatus(jobId, update) {
  try {
    if (!jobId || typeof jobId !== 'string') {
      console.error('Invalid jobId provided to updateProcessingStatus:', jobId);
      return;
    }
    
    const current = jobs.get(jobId) || {
      status: 'processing',
      progress: 0,
      message: 'Initializing...',
      startTime: Date.now()
    };
    
    const updatedJob = {
      ...current,
      ...update,
      lastUpdate: Date.now()
    };
    
    jobs.set(jobId, updatedJob);
    
    // Only set cleanup timeout for terminal states
    if (update.status === 'completed' || update.status === 'failed') {
      // Clear any existing cleanup timeout
      if (cleanupTimeouts.has(jobId)) {
        const existingTimeout = cleanupTimeouts.get(jobId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
      }
      
      // Set new cleanup timeout (1 hour)
      const timeout = setTimeout(() => {
        try {
          jobs.delete(jobId);
          cleanupTimeouts.delete(jobId);
        } catch (err) {
          console.error('Error in cleanup timeout:', err);
        }
      }, 60 * 60 * 1000);
      
      cleanupTimeouts.set(jobId, timeout);
    }
  } catch (err) {
    console.error('Error in updateProcessingStatus:', err);
  }
}

// Helper to create a new job - ensure it's always available
export function createProcessingJob(jobId) {
  try {
    if (!jobId || typeof jobId !== 'string') {
      console.error('Invalid jobId provided to createProcessingJob:', jobId);
      return null;
    }
    
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
  } catch (err) {
    console.error('Error in createProcessingJob:', err);
    return null;
  }
}

// Ensure functions are available globally for debugging
if (typeof global !== 'undefined') {
  global.twipclipUpdateProcessingStatus = updateProcessingStatus;
  global.twipclipCreateProcessingJob = createProcessingJob;
} 