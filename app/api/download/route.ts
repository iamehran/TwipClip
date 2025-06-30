import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { getFFmpegPath, getYtDlpPath, checkSystemTools } from '../../utils/system-tools';

const execAsync = promisify(exec);

// Check if ffmpeg is available
async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    const tools = await checkSystemTools();
    return tools.ffmpeg;
  } catch {
    return false;
  }
}

// Download with FFmpeg for precise clipping
async function downloadWithFFmpeg(videoId: string, start: number, end: number, quality: string): Promise<NextResponse> {
  // Create temporary directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'twipclip-download-'));
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputPath = path.join(tempDir, `${videoId}-clip.%(ext)s`);
  
  // Get tool paths
  const ffmpegPath = await getFFmpegPath();
  const ytDlpPath = await getYtDlpPath();
  
  // Enhanced format selection
  const formatSelector = quality === 'best' ? 
    'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best' :
    quality === 'worst' ?
    'worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst' :
    `bestvideo[height<=${quality.replace('p', '')}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality.replace('p', '')}][ext=mp4]/best`;
  
  const downloadCommand = [
    `"${ytDlpPath}"`,
    `"${videoUrl}"`,
    `-f "${formatSelector}"`,
    `--download-sections "*${start}-${end}"`,
    `--force-keyframes-at-cuts`,
    `--ffmpeg-location "${ffmpegPath}"`,
    `-o "${outputPath}"`,
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout 30',
    '--fragment-retries 3',
    '--retries 3'
  ].join(' ');
  
  console.log('Executing download command:', downloadCommand);
  
  await execAsync(downloadCommand, {
    timeout: 180000, // 3 minute timeout
    maxBuffer: 100 * 1024 * 1024 // 100MB buffer
  });
  
  // Find the downloaded file
  const files = await fs.readdir(tempDir);
  const videoFile = files.find(f => 
    f.startsWith(`${videoId}-clip`) && 
    (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv'))
  );
  
  if (!videoFile) {
    throw new Error('Video file not found after download. The video might be private, deleted, or region-restricted.');
  }
  
  const filePath = path.join(tempDir, videoFile);
  console.log(`Video downloaded: ${videoFile}`);
  
  // Verify file was created and has reasonable size
  const fileStats = await fs.stat(filePath);
  if (fileStats.size === 0) {
    throw new Error('Generated clip is empty');
  }
  
  if (fileStats.size > 100 * 1024 * 1024) { // 100MB max
    throw new Error('Generated clip is too large');
  }
  
  console.log(`Clip created successfully: ${(fileStats.size / 1024 / 1024).toFixed(1)}MB`);
  
  // Read the clip file
  const clipBuffer = await fs.readFile(filePath);
  
  // Generate a descriptive filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const extension = path.extname(videoFile);
  const filename = `${videoId}_${start}s-${end}s_${timestamp}${extension}`;
  
  // Clean up temporary directory
  await fs.rm(tempDir, { recursive: true, force: true });
  
  // Return the video clip
  return new NextResponse(clipBuffer, {
    headers: {
      'Content-Type': extension === '.mp4' ? 'video/mp4' : 'video/webm',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': fileStats.size.toString(),
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'X-Download-Method': 'yt-dlp+ffmpeg'
    },
  });
}

// Fallback: Download full video with timestamps in filename
async function downloadFullVideoFallback(videoId: string, quality: string, start: number, end: number): Promise<NextResponse> {
  // Create temporary directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'twipclip-download-'));
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputPath = path.join(tempDir, `${videoId}-full.%(ext)s`);
  
  // Get yt-dlp path
  const ytDlpPath = await getYtDlpPath();
  
  // Download full video (no clipping)
  const formatSelector = quality === 'best' ? 
    'best[height<=720][ext=mp4]/best[ext=mp4]/best' :
    quality === 'worst' ?
    'worst[ext=mp4]/worst' :
    `best[height<=${quality.replace('p', '')}][ext=mp4]/best[ext=mp4]/best`;
  
  const downloadCommand = [
    `"${ytDlpPath}"`,
    `"${videoUrl}"`,
    `-f "${formatSelector}"`,
    `-o "${outputPath}"`,
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout 30',
    '--fragment-retries 3',
    '--retries 3'
  ].join(' ');
  
  console.log('Downloading full video (FFmpeg not available):', downloadCommand);
  
  await execAsync(downloadCommand, {
    timeout: 300000, // 5 minute timeout for full video
    maxBuffer: 200 * 1024 * 1024 // 200MB buffer
  });
  
  // Find the downloaded file
  const files = await fs.readdir(tempDir);
  const videoFile = files.find(f => 
    f.startsWith(`${videoId}-full`) && 
    (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv'))
  );
  
  if (!videoFile) {
    throw new Error('Video file not found after download');
  }
  
  const filePath = path.join(tempDir, videoFile);
  const fileStats = await fs.stat(filePath);
  
  console.log(`Full video downloaded: ${videoFile} (${(fileStats.size / 1024 / 1024).toFixed(1)}MB)`);
  
  // Read the video file
  const videoBuffer = await fs.readFile(filePath);
  
  // Generate filename with timestamp info
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const extension = path.extname(videoFile);
  const filename = `${videoId}_FULL-VIDEO_clip-at-${start}s-${end}s_${timestamp}${extension}`;
  
  // Clean up
  await fs.rm(tempDir, { recursive: true, force: true });
  
  return new NextResponse(videoBuffer, {
    headers: {
      'Content-Type': extension === '.mp4' ? 'video/mp4' : 'video/webm',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': fileStats.size.toString(),
      'Cache-Control': 'public, max-age=3600',
      'X-Download-Method': 'yt-dlp-full-video-fallback',
      'X-Clip-Info': `Requested clip: ${start}s to ${end}s - Manual seek required`
    },
  });
}

// Enhanced download API with better yt-dlp integration
export async function GET(request: Request) {
  let tempDir: string | null = null;
  
  try {
    const { searchParams } = new URL(request.url);
    
    // Check if this is a zip file download request
    const filePath = searchParams.get('file');
    if (filePath) {
      try {
        // Decode the file path
        const decodedPath = decodeURIComponent(filePath);
        
        // Security check: ensure the file is in the temp directory
        const normalizedPath = path.normalize(decodedPath);
        const tempDirPath = path.normalize(os.tmpdir());
        
        if (!normalizedPath.startsWith(tempDirPath)) {
          return NextResponse.json(
            { error: 'Invalid file path' },
            { status: 403 }
          );
        }
        
        // Check if file exists
        const stats = await fs.stat(normalizedPath);
        if (!stats.isFile()) {
          return NextResponse.json(
            { error: 'File not found' },
            { status: 404 }
          );
        }
        
        // Read the file
        const fileBuffer = await fs.readFile(normalizedPath);
        const fileName = path.basename(normalizedPath);
        
        // Clean up the file after serving
        setTimeout(async () => {
          try {
            await fs.unlink(normalizedPath);
            console.log(`Cleaned up zip file: ${normalizedPath}`);
          } catch (err) {
            console.error('Failed to clean up zip file:', err);
          }
        }, 60000); // Clean up after 1 minute
        
        // Return the zip file
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': stats.size.toString(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      } catch (error) {
        console.error('Error serving zip file:', error);
        return NextResponse.json(
          { error: 'Failed to download file' },
          { status: 500 }
        );
      }
    }
    
    // Original video download logic
    const videoId = searchParams.get('videoId');
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const quality = searchParams.get('quality') || 'best'; // best, worst, or specific height like 720p
    
    // Validate required parameters
    if (!videoId || !start || !end) {
      return NextResponse.json(
        { error: 'Missing required parameters: videoId, start, and end are required' },
        { status: 400 }
      );
    }
    
    // Validate video ID format
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json(
        { error: 'Invalid YouTube video ID format' },
        { status: 400 }
      );
    }
    
    // Parse and validate timestamps
    const startSeconds = parseFloat(start);
    const endSeconds = parseFloat(end);
    const duration = endSeconds - startSeconds;
    
    if (isNaN(startSeconds) || isNaN(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) {
      return NextResponse.json(
        { error: 'Invalid timestamp format or range' },
        { status: 400 }
      );
    }
    
    if (duration > 600) { // Max 10 minutes to prevent abuse
      return NextResponse.json(
        { error: 'Clip duration cannot exceed 10 minutes' },
        { status: 400 }
      );
    }
    
    if (duration < 1) { // Min 1 second
      return NextResponse.json(
        { error: 'Clip duration must be at least 1 second' },
        { status: 400 }
      );
    }
    
    console.log(`Starting download for video ${videoId}, ${startSeconds}s-${endSeconds}s (${duration.toFixed(1)}s)`);
    
    // Try downloading with yt-dlp
    try {
      // Check if ffmpeg is available
      const ffmpegAvailable = await checkFFmpegAvailable();
      console.log(`FFmpeg available: ${ffmpegAvailable}`);
      
      if (ffmpegAvailable) {
        console.log('Downloading video clip with yt-dlp + ffmpeg...');
        return await downloadWithFFmpeg(videoId, startSeconds, endSeconds, quality);
      } else {
        console.log('FFmpeg not available - downloading full video instead...');
        return await downloadFullVideoFallback(videoId, quality, startSeconds, endSeconds);
      }
    } catch (error: any) {
      console.error('Download error:', error);
      
      // Clean up on error
      if (tempDir) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp directory:', cleanupError);
        }
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return NextResponse.json(
        { 
          error: 'Failed to download video clip',
          message: errorMessage,
          requirements: 'This feature requires yt-dlp to be installed. FFmpeg is optional for better quality.',
          troubleshooting: {
            'If video is private/unavailable': 'Try a different video',
            'If getting network errors': 'Try again in a few moments',
            'If clip is too long': 'Try a shorter time range (max 10 minutes)',
            'If video is region-blocked': 'This video may not be available in your region',
            'If download fails': 'Some videos may not support clip extraction'
          }
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Download error:', error);
    
    // Clean up on error
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp directory:', cleanupError);
      }
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      { 
        error: 'Failed to download video clip',
        message: errorMessage,
        requirements: 'This feature requires yt-dlp to be installed. FFmpeg is optional for better quality.',
        troubleshooting: {
          'If video is private/unavailable': 'Try a different video',
          'If getting network errors': 'Try again in a few moments',
          'If clip is too long': 'Try a shorter time range (max 10 minutes)',
          'If video is region-blocked': 'This video may not be available in your region',
          'If download fails': 'Some videos may not support clip extraction'
        }
      },
      { status: 500 }
    );
  }
}

// Specify Node.js runtime for child_process support
export const runtime = 'nodejs'; 