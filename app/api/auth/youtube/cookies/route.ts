import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const COOKIES_DIR = join(process.cwd(), 'app/api/auth/youtube/cookies');
const COOKIE_FILE = join(COOKIES_DIR, 'youtube_cookies.txt');

export async function POST(request: NextRequest) {
  try {
    const { cookies } = await request.json();
    
    if (!cookies) {
      return NextResponse.json({ error: 'No cookies provided' }, { status: 400 });
    }
    
    // Validate cookie format
    if (!cookies.includes('.youtube.com') || !cookies.includes('TRUE')) {
      return NextResponse.json({ 
        error: 'Invalid cookie format. Please ensure it\'s a Netscape format cookie file from YouTube.' 
      }, { status: 400 });
    }
    
    // Create cookies directory if it doesn't exist
    if (!existsSync(COOKIES_DIR)) {
      await mkdir(COOKIES_DIR, { recursive: true });
    }
    
    // Save the cookie file
    await writeFile(COOKIE_FILE, cookies);
    
    // Verify the cookies were saved
    const lines = cookies.split('\n');
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
    
    return NextResponse.json({ 
      success: true,
      message: `Successfully saved ${validCookies} YouTube cookies`,
      cookieCount: validCookies
    });
    
  } catch (error) {
    console.error('Cookie save error:', error);
    return NextResponse.json({ 
      error: 'Failed to save cookies' 
    }, { status: 500 });
  }
} 