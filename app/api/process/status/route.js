import { NextResponse } from 'next/server';
import { jobs } from '../../../../src/lib/job-manager';

// Job timeout configuration
const JOB_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const STUCK_THRESHOLD = 30 * 1000; // 30 seconds without progress update

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
    
    // Check if this might be a high-progress job that needs retry
    const action = searchParams.get('action');
    if (action === 'retry-high-progress') {
      return NextResponse.json({ 
        status: 'retry',
        message: 'Job may have completed, please refresh' 
      });
    }
    
    return NextResponse.json({ 
      error: 'Job not found', 
      availableJobs: Array.from(jobs.keys()),
      totalJobs: jobs.size
    }, { status: 404 });
  }
  
  // Check if job is stuck
  const now = Date.now();
  const jobAge = now - status.startTime;
  const timeSinceUpdate = now - (status.lastUpdate || status.startTime);
  
  // If job is running too long
  if (status.status === 'processing' && jobAge > JOB_TIMEOUT) {
    const failedStatus = {
      ...status,
      status: 'failed',
      error: 'Processing timeout - job took too long',
      lastUpdate: now
    };
    jobs.set(jobId, failedStatus);
    return NextResponse.json(failedStatus);
  }
  
  // If job hasn't been updated recently and is still processing
  if (status.status === 'processing' && timeSinceUpdate > STUCK_THRESHOLD && status.progress < 90) {
    console.warn(`⚠️ Job ${jobId} may be stuck - no updates for ${timeSinceUpdate}ms`);
  }
  
  return NextResponse.json(status);
} 