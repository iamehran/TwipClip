import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  const debug = {
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
      HOME: process.env.HOME,
      PATH: process.env.PATH,
    },
    pythonInfo: {},
    ytdlpSearch: [],
    pipList: null,
  };

  // Check Python
  try {
    const { stdout: pythonVersion } = await execAsync('python3 --version');
    const { stdout: pipVersion } = await execAsync('python3 -m pip --version');
    debug.pythonInfo = {
      python: pythonVersion.trim(),
      pip: pipVersion.trim(),
    };
  } catch (e) {
    debug.pythonInfo = { error: e.message };
  }

  // List pip packages
  try {
    const { stdout } = await execAsync('python3 -m pip list');
    debug.pipList = stdout;
  } catch (e) {
    debug.pipList = `Error: ${e.message}`;
  }

  // Search for yt-dlp in various ways
  const searchCommands = [
    'which yt-dlp',
    'python3 -m yt_dlp --version',
    'yt-dlp --version',
    'find /usr -name yt-dlp 2>/dev/null',
    'find /opt -name yt-dlp 2>/dev/null',
    'find /app -name yt-dlp 2>/dev/null',
    'find $HOME -name yt-dlp 2>/dev/null',
    'ls -la /usr/local/bin/ | grep yt-dlp',
    'ls -la $HOME/.local/bin/ | grep yt-dlp',
  ];

  for (const cmd of searchCommands) {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 5000 });
      debug.ytdlpSearch.push({
        command: cmd,
        result: stdout.trim() || 'Empty result',
      });
    } catch (e) {
      debug.ytdlpSearch.push({
        command: cmd,
        error: e.message,
      });
    }
  }

  return NextResponse.json(debug, { status: 200 });
} 