import { NextResponse } from 'next/server';
import { checkSystemTools } from '../../../src/lib/system-tools';

export async function GET() {
  try {
    // Check system dependencies
    const tools = await checkSystemTools();
    
    // Check environment variables
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      railway: process.env.RAILWAY_ENVIRONMENT || 'local',
      dependencies: {
        openai: hasOpenAI ? 'configured' : 'missing',
        ytdlp: tools.ytdlp.available ? 'available' : 'missing',
        ffmpeg: tools.ffmpeg.available ? 'available' : 'missing'
      },
      versions: {
        node: process.version,
        ytdlp: tools.ytdlp.version || 'not found',
        ffmpeg: tools.ffmpeg.version || 'not found'
      }
    };
    
    // Determine overall health
    const isHealthy = hasOpenAI && tools.ytdlp.available && tools.ffmpeg.available;
    
    if (!isHealthy) {
      health.status = 'degraded';
    }
    
    return NextResponse.json(health, { 
      status: isHealthy ? 200 : 503 
    });
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 