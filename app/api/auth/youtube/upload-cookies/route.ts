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
    
    // Determine the correct path based on environment
    const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV || process.env.NODE_ENV === 'production';
    const baseDir = isDocker ? '/app' : process.cwd();
    
    // Create user-specific directory
    const userCookieDir = join(baseDir, 'temp', 'user-cookies', sessionId);
    console.log(`Creating cookie directory at: ${userCookieDir}`);
    
    if (!existsSync(userCookieDir)) {
      await mkdir(userCookieDir, { recursive: true });
    }
    
    // Save the cookie file
    const cookiePath = join(userCookieDir, 'youtube_cookies.txt');
    await writeFile(cookiePath, content);
    
    console.log(`✅ Cookies saved to: ${cookiePath}`);
    console.log(`📊 Cookie file size: ${content.length} bytes`);
    
    // Count actual cookie entries
    const cookieLines = content.split('\n').filter(line => 
      line.trim() && !line.startsWith('#') && line.includes('\t')
    );
    console.log(`🍪 Found ${cookieLines.length} cookie entries`);
    
    // Set session cookie (expires in 7 days)
    const response = NextResponse.json({ 
      success: true,
      message: 'Cookies uploaded successfully',
      sessionId: sessionId.substring(0, 8) + '...', // Show partial session ID for debugging
      cookieCount: cookieLines.length,
      environment: isDocker ? 'docker/railway' : 'local'
    });
    
    response.cookies.set('twipclip_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });
    
    response.cookies.set('youtube_authenticated', 'true', {
      httpOnly: false, // Must be false so client-side JS can read it
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