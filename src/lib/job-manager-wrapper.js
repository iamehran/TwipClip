// Wrapper module to ensure job manager functions are always available
// This helps prevent "e is not a function" errors in minified builds

let jobManagerModule;

// Try to load the job manager module with error handling
try {
  jobManagerModule = require('./job-manager.js');
} catch (err) {
  console.error('Failed to load job-manager module:', err);
  // Provide fallback implementations
  jobManagerModule = {
    jobs: new Map(),
    createProcessingJob: (jobId) => {
      console.warn('Using fallback createProcessingJob');
      const jobData = {
        status: 'processing',
        progress: 0,
        message: 'Starting processing...',
        startTime: Date.now(),
        lastUpdate: Date.now(),
        createdAt: Date.now()
      };
      return jobData;
    },
    updateProcessingStatus: (jobId, update) => {
      console.warn('Using fallback updateProcessingStatus');
    }
  };
}

// Create bound versions of the functions to ensure they maintain context
const boundCreateProcessingJob = jobManagerModule.createProcessingJob.bind(jobManagerModule);
const boundUpdateProcessingStatus = jobManagerModule.updateProcessingStatus.bind(jobManagerModule);

// Export everything with guaranteed availability
export const jobs = jobManagerModule.jobs;
export const createProcessingJob = boundCreateProcessingJob;
export const updateProcessingStatus = boundUpdateProcessingStatus;

// Also export as default for alternative import syntax
export default {
  jobs,
  createProcessingJob: boundCreateProcessingJob,
  updateProcessingStatus: boundUpdateProcessingStatus
}; 