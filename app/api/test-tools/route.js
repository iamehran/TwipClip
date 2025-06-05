import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
      isRailway: !!process.env.RAILWAY_PROJECT_ID
    },
    tools: {}
  };

  // Test FFmpeg
  try {
    const { stdout: ffmpegVersion } = await execAsync('ffmpeg -version');
    const { stdout: ffmpegPath } = await execAsync('which ffmpeg');
    results.tools.ffmpeg = {
      available: true,
      path: ffmpegPath.trim(),
      version: ffmpegVersion.split('\n')[0]
    };
  } catch (error) {
    results.tools.ffmpeg = {
      available: false,
      error: error.message
    };
  }

  // Test yt-dlp
  try {
    const { stdout: ytdlpVersion } = await execAsync('yt-dlp --version');
    const { stdout: ytdlpPath } = await execAsync('which yt-dlp');
    results.tools.ytdlp = {
      available: true,
      path: ytdlpPath.trim(),
      version: ytdlpVersion.trim()
    };
  } catch (error) {
    // Try Python module
    try {
      const { stdout: pyVersion } = await execAsync('python3 -m yt_dlp --version');
      results.tools.ytdlp = {
        available: true,
        path: 'python3 -m yt_dlp',
        version: pyVersion.trim()
      };
    } catch (pyError) {
      results.tools.ytdlp = {
        available: false,
        error: error.message
      };
    }
  }

  // Test Python
  try {
    const { stdout: pythonVersion } = await execAsync('python3 --version');
    const { stdout: pipList } = await execAsync('pip3 list | grep yt-dlp || true');
    results.tools.python = {
      available: true,
      version: pythonVersion.trim(),
      ytdlpInstalled: pipList.includes('yt-dlp')
    };
  } catch (error) {
    results.tools.python = {
      available: false,
      error: error.message
    };
  }

  // Test write permissions
  try {
    const { stdout } = await execAsync('touch /tmp/test-write && rm /tmp/test-write && echo "Write test passed"');
    results.permissions = {
      canWrite: true,
      tempDir: '/tmp'
    };
  } catch (error) {
    results.permissions = {
      canWrite: false,
      error: error.message
    };
  }

  return NextResponse.json(results, { 
    status: results.tools.ffmpeg.available && results.tools.ytdlp.available ? 200 : 503 
  });
} 