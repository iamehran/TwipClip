import { NextResponse } from 'next/server';

export async function GET() {
  try {
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
      }
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