import { NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

const COOKIES_DIR = join(process.cwd(), 'app/api/auth/youtube/cookies');
const COOKIE_FILE = join(COOKIES_DIR, 'youtube_cookies.txt');

export async function GET() {
  try {
    if (!existsSync(COOKIE_FILE)) {
      return NextResponse.json({ authenticated: false });
    }

    // Read cookie file
    const cookieContent = readFileSync(COOKIE_FILE, 'utf-8');
    
    // Check if cookies are valid (basic check)
    if (!cookieContent.includes('.youtube.com')) {
      return NextResponse.json({ authenticated: false });
    }

    // Parse cookies to find expiration
    const lines = cookieContent.split('\n');
    let nearestExpiry = Infinity;
    let hasValidCookie = false;
    
    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;
      
      const parts = line.split('\t');
      if (parts.length >= 5 && parts[0].includes('youtube.com')) {
        const expiry = parseInt(parts[4]);
        if (!isNaN(expiry) && expiry > Date.now() / 1000) {
          hasValidCookie = true;
          nearestExpiry = Math.min(nearestExpiry, expiry);
        }
      }
    }

    if (!hasValidCookie) {
      return NextResponse.json({ 
        authenticated: false,
        error: 'Cookies have expired' 
      });
    }

    const expiresAt = nearestExpiry * 1000;
    const daysRemaining = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));

    return NextResponse.json({
      authenticated: true,
      expiresAt,
      daysRemaining
    });

  } catch (error) {
    console.error('Error checking auth status:', error);
    return NextResponse.json({ 
      authenticated: false,
      error: 'Failed to check authentication status' 
    });
  }
} 