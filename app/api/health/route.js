import { NextResponse } from 'next/server';
import { checkSystemTools } from '../../../src/lib/system-tools';

export async function GET() {
  try {
    // Check system dependencies
    const tools = await checkSystemTools();
    
    // Check environment variables
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY || !!process.env.CLAUDE_API_KEY;
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      railway: process.env.RAILWAY_ENVIRONMENT || 'local',
      dependencies: {
        openai: hasOpenAI ? 'configured' : 'missing',
        anthropic: hasAnthropic ? 'configured' : 'missing',
        ytdlp: tools.ytdlp.available ? 'available' : 'missing',
        ffmpeg: tools.ffmpeg.available ? 'available' : 'missing'
      },
      versions: {
        node: process.version,
        ytdlp: tools.ytdlp.version || 'not found',
        ffmpeg: tools.ffmpeg.version || 'not found'
      }
    };
    
    // Require either OpenAI or Anthropic to be configured
    const hasAI = hasOpenAI || hasAnthropic;
    
    if (!hasAI) {
      health.status = 'unhealthy';
      health.error = 'No AI API key configured (need either OpenAI or Anthropic)';
    } else if (!tools.ytdlp.available || !tools.ffmpeg.available) {
      health.status = 'degraded';
      health.warning = 'Some tools are missing but core functionality is available';
    }
    
    // Return 200 if any AI is configured
    return NextResponse.json(health, { 
      status: hasAI ? 200 : 503 
    });
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 