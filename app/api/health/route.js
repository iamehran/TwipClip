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
    
    // Only require OpenAI to be configured for health check to pass
    // Tools can be missing as they might be installed differently on Railway
    const isHealthy = hasOpenAI;
    
    if (!isHealthy) {
      health.status = 'unhealthy';
    } else if (!tools.ytdlp.available || !tools.ffmpeg.available) {
      health.status = 'degraded';
      health.warning = 'Some tools are missing but core functionality is available';
    }
    
    // Always return 200 if OpenAI is configured
    return NextResponse.json(health, { 
      status: hasOpenAI ? 200 : 503 
    });
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 