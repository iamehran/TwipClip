import { NextResponse } from 'next/server';

export async function GET() {
  const checks = {
    nodeVersion: process.version,
    hasFileGlobal: typeof globalThis.File !== 'undefined',
    hasBufferFile: false,
    fileApiWorking: false,
    error: null as string | null
  };
  
  try {
    // Check if we can import File from buffer
    const { File } = require('buffer');
    checks.hasBufferFile = true;
    
    // Try to create a File instance
    const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    checks.fileApiWorking = testFile instanceof File;
  } catch (error) {
    checks.error = error instanceof Error ? error.message : 'Unknown error';
  }
  
  return NextResponse.json({
    status: checks.fileApiWorking ? 'OK' : 'ERROR',
    checks,
    recommendation: !checks.fileApiWorking 
      ? 'File API is not working. Please ensure Node.js 20+ is being used.'
      : 'File API is working correctly.'
  });
} 