import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Basic health check - just ensure the service is running
    return NextResponse.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'TwipClip',
      version: '1.0.0',
      uptime: process.uptime()
    });
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error',
        message: error.message 
      },
      { status: 500 }
    );
  }
} 