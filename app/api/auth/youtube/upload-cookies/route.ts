import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const COOKIES_DIR = join(process.cwd(), 'app/api/auth/youtube/cookies');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Validate file type
    if (!file.name.endsWith('.txt')) {
      return NextResponse.json({ error: 'Please upload a .txt file' }, { status: 400 });
    }
    
    // Read file content
    const buffer = Buffer.from(await file.arrayBuffer());
    const content = buffer.toString('utf-8');
    
    // Basic validation - check if it contains YouTube cookies
    if (!content.includes('.youtube.com') || !content.includes('TRUE')) {
      return NextResponse.json({ 
        error: 'Invalid cookie file format. Please ensure it\'s a Netscape format cookie file from YouTube.' 
      }, { status: 400 });
    }
    
    // Create cookies directory if it doesn't exist
    if (!existsSync(COOKIES_DIR)) {
      await mkdir(COOKIES_DIR, { recursive: true });
    }
    
    // Save the cookie file
    const cookiePath = join(COOKIES_DIR, 'youtube_cookies.txt');
    await writeFile(cookiePath, content);
    
    return NextResponse.json({ 
      success: true,
      message: 'Cookies uploaded successfully',
      cookiePath 
    });
    
  } catch (error) {
    console.error('Cookie upload error:', error);
    return NextResponse.json({ 
      error: 'Failed to upload cookies' 
    }, { status: 500 });
  }
} 