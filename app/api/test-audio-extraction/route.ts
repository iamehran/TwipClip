import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url') || 'https://youtu.be/-wTbbVCflb0';
  
  const tempDir = path.join(process.cwd(), 'temp');
  const testId = Date.now().toString();
  const results: any = {
    videoUrl,
    tempDir,
    testId,
    steps: []
  };
  
  try {
    // Step 1: Check temp directory
    results.steps.push({
      step: 'Check temp directory',
      exists: existsSync(tempDir)
    });
    
    if (!existsSync(tempDir)) {
      await fs.mkdir(tempDir, { recursive: true });
      results.steps.push({
        step: 'Create temp directory',
        success: true
      });
    }
    
    // Step 2: Test yt-dlp availability
    const ytdlpPaths = [
      '/usr/local/bin/yt-dlp',
      '/app/yt-dlp',
      'yt-dlp'
    ];
    
    let workingYtdlp = null;
    for (const ytdlp of ytdlpPaths) {
      try {
        const { stdout } = await execAsync(`${ytdlp} --version`);
        workingYtdlp = ytdlp;
        results.steps.push({
          step: `Test ${ytdlp}`,
          success: true,
          version: stdout.trim()
        });
        break;
      } catch (e) {
        results.steps.push({
          step: `Test ${ytdlp}`,
          success: false,
          error: e.message
        });
      }
    }
    
    if (!workingYtdlp) {
      throw new Error('No working yt-dlp found');
    }
    
    // Step 3: Simple audio extraction test
    const outputFile = path.join(tempDir, `test_${testId}.mp3`);
    const command = `${workingYtdlp} -x --audio-format mp3 --no-mtime --no-part "${videoUrl}" -o "${outputFile}"`;
    
    results.steps.push({
      step: 'Audio extraction command',
      command
    });
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000,
        cwd: tempDir
      });
      
      results.steps.push({
        step: 'Command execution',
        success: true,
        stdout: stdout?.substring(0, 500),
        stderr: stderr?.substring(0, 500)
      });
    } catch (error: any) {
      results.steps.push({
        step: 'Command execution',
        success: false,
        error: error.message,
        stdout: error.stdout?.substring(0, 500),
        stderr: error.stderr?.substring(0, 500)
      });
    }
    
    // Step 4: Check output
    const files = await fs.readdir(tempDir);
    results.steps.push({
      step: 'Check output files',
      files: files.filter(f => f.includes(testId))
    });
    
    // Step 5: Clean up
    for (const file of files) {
      if (file.includes(testId)) {
        await fs.unlink(path.join(tempDir, file));
      }
    }
    
    return NextResponse.json({
      success: true,
      results
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      results
    }, { status: 500 });
  }
} 