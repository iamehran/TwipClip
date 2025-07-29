import { NextResponse } from 'next/server';

// Inline job management implementations
const getJobsMap = () => {
  if (typeof global !== 'undefined' && global.twipclipJobs) {
    return global.twipclipJobs;
  }
  return new Map();
};

const createProcessingJob = (jobId) => {
  try {
    const jobs = getJobsMap();
    const jobData = {
      status: 'processing',
      progress: 0,
      message: 'Starting processing...',
      startTime: Date.now(),
      lastUpdate: Date.now(),
      createdAt: Date.now()
    };
    
    jobs.set(jobId, jobData);
    console.log(`✅ Job ${jobId} created in test`);
    return jobData;
  } catch (err) {
    console.error('Error creating job:', err);
    return null;
  }
};

const updateProcessingStatus = (jobId, update) => {
  try {
    const jobs = getJobsMap();
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
  } catch (err) {
    console.error('Error updating job status:', err);
  }
};

export async function GET() {
  try {
    const testJobId = 'test-' + Date.now();
    const jobs = getJobsMap();
    
    // Test creating a job
    console.log('Testing job creation...');
    const job = createProcessingJob(testJobId);
    console.log('Job created:', job);
    
    // Test updating a job
    console.log('Testing job update...');
    updateProcessingStatus(testJobId, {
      progress: 50,
      message: 'Test update'
    });
    
    // Get the updated job
    const updatedJob = jobs.get(testJobId);
    console.log('Updated job:', updatedJob);
    
    // Clean up
    jobs.delete(testJobId);
    
    return NextResponse.json({
      success: true,
      message: 'Job management test successful',
      jobCreated: job,
      jobUpdated: updatedJob
    });
  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
} 