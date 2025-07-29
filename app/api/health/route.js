import { NextResponse } from 'next/server';

// Add a warming period for the first health check
let isWarming = true;
let warmingStartTime = Date.now();
const WARMING_PERIOD = 5000; // 5 seconds

export async function GET() {
  try {
    // During warming period, always return OK
    if (isWarming && (Date.now() - warmingStartTime < WARMING_PERIOD)) {
      return NextResponse.json({ 
        status: 'warming',
        message: 'Service is warming up',
        remainingTime: Math.max(0, WARMING_PERIOD - (Date.now() - warmingStartTime))
      });
    }
    
    isWarming = false;
    
    // Basic health check - just ensure the service is running
    return NextResponse.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'TwipClip',
      version: '1.0.0',
      uptime: process.uptime(),
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        USE_RAPIDAPI: process.env.USE_RAPIDAPI,
        hasRapidAPIKey: !!process.env.RAPIDAPI_KEY,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { 
        status: 'error',
        message: error.message 
      },
      { status: 500 }
    );
  }
} 