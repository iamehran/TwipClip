import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    // Get the file path from query parameters
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('file');
    
    if (!filePath) {
      return NextResponse.json(
        { error: 'No file specified' },
        { status: 400 }
      );
    }
    
    // Security check - ensure the file is in temp directory
    const normalizedPath = path.normalize(filePath);
    const tempDir = path.normalize(path.join(process.cwd(), 'temp'));
    const systemTempDir = path.normalize('/tmp');
    
    if (!normalizedPath.startsWith(tempDir) && !normalizedPath.startsWith(systemTempDir)) {
      console.error('Security violation: Attempted to access file outside temp directory:', normalizedPath);
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 403 }
      );
    }
    
    // Check if file exists
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      console.error('File not found:', filePath);
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Read the file
    const fileBuffer = await fs.promises.readFile(filePath);
    const fileName = path.basename(filePath);
    
    console.log(`Serving zip file: ${fileName} (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
    
    // Clean up the file after serving (with a delay to ensure download completes)
    setTimeout(async () => {
      try {
        await fs.promises.unlink(filePath);
        console.log(`Cleaned up zip file: ${filePath}`);
      } catch (error) {
        console.warn('Failed to clean up zip file:', error);
      }
    }, 60000); // 60 seconds delay
    
    // Return the file with proper headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
    
  } catch (error) {
    console.error('Download endpoint error:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}