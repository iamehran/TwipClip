import { NextResponse } from 'next/server';
import { createProcessingJob, updateProcessingStatus, jobs } from '../../../src/lib/job-manager.js';

export async function GET() {
  try {
    const testJobId = 'test-' + Date.now();
    
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