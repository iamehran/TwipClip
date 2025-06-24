import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';

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
    
    // Get or create session ID
    const cookieStore = await cookies();
    let sessionId = cookieStore.get('twipclip_session')?.value;
    
    if (!sessionId) {
      sessionId = randomUUID();
    }
    
    // Create user-specific directory
    const userCookieDir = join(process.cwd(), 'temp', 'user-cookies', sessionId);
    if (!existsSync(userCookieDir)) {
      await mkdir(userCookieDir, { recursive: true });
    }
    
    // Save the cookie file
    const cookiePath = join(userCookieDir, 'youtube_cookies.txt');
    await writeFile(cookiePath, content);
    
    // Set session cookie (expires in 7 days)
    const response = NextResponse.json({ 
      success: true,
      message: 'Cookies uploaded successfully',
      sessionId: sessionId.substring(0, 8) + '...' // Show partial session ID for debugging
    });
    
    response.cookies.set('twipclip_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });
    
    response.cookies.set('youtube_authenticated', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });
    
    return response;
    
  } catch (error) {
    console.error('Cookie upload error:', error);
    return NextResponse.json({ 
      error: 'Failed to upload cookies' 
    }, { status: 500 });
  }
} 