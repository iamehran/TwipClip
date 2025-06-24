import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';

const COOKIES_DIR = join(process.cwd(), 'temp', 'user-cookies');

// Generate or get user session ID
function getUserSessionId(): string {
  const cookieStore = cookies();
  let sessionId = cookieStore.get('twipclip_session')?.value;
  
  if (!sessionId) {
    sessionId = randomUUID();
  }
  
  return sessionId;
}

export async function POST(request: NextRequest) {
  try {
    const { cookies: cookieContent } = await request.json();
    
    if (!cookieContent) {
      return NextResponse.json({ error: 'No cookies provided' }, { status: 400 });
    }
    
    // Validate cookie format
    if (!cookieContent.includes('.youtube.com') || !cookieContent.includes('TRUE')) {
      return NextResponse.json({ 
        error: 'Invalid cookie format. Please ensure it\'s a Netscape format cookie file from YouTube.' 
      }, { status: 400 });
    }
    
    // Get or create user session
    const sessionId = getUserSessionId();
    const userCookieDir = join(COOKIES_DIR, sessionId);
    const userCookieFile = join(userCookieDir, 'youtube_cookies.txt');
    
    // Create user-specific directory if it doesn't exist
    if (!existsSync(userCookieDir)) {
      await mkdir(userCookieDir, { recursive: true });
    }
    
    // Save the cookie file for this specific user
    await writeFile(userCookieFile, cookieContent);
    
    // Verify the cookies were saved
    const lines = cookieContent.split('\n');
    let validCookies = 0;
    
    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length >= 7 && parts[0].includes('youtube.com')) {
        validCookies++;
      }
    }
    
    if (validCookies === 0) {
      return NextResponse.json({ 
        error: 'No valid YouTube cookies found in the uploaded file.' 
      }, { status: 400 });
    }
    
    // Set session cookie for this user
    const response = NextResponse.json({ 
      success: true,
      message: `Successfully saved ${validCookies} YouTube cookies for your session`,
      cookieCount: validCookies
    });
    
    // Set secure session cookie
    response.cookies.set('twipclip_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    });
    
    return response;
    
  } catch (error) {
    console.error('Cookie save error:', error);
    return NextResponse.json({ 
      error: 'Failed to save cookies' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get('twipclip_session')?.value;
    
    if (!sessionId) {
      return NextResponse.json({ 
        authenticated: false,
        error: 'No session found' 
      });
    }
    
    const userCookieFile = join(COOKIES_DIR, sessionId, 'youtube_cookies.txt');
    
    if (!existsSync(userCookieFile)) {
      return NextResponse.json({ 
        authenticated: false,
        error: 'No cookies found for this session' 
      });
    }
    
    // Return the cookie content for this user only
    const cookieContent = await readFile(userCookieFile, 'utf-8');
    
    return NextResponse.json({ 
      success: true,
      cookies: cookieContent
    });
    
  } catch (error) {
    console.error('Cookie retrieval error:', error);
    return NextResponse.json({ 
      error: 'Failed to retrieve cookies' 
    }, { status: 500 });
  }
} 