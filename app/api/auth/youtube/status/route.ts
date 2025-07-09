import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('twipclip_session')?.value;
    
    if (!sessionId) {
      return NextResponse.json({ 
        authenticated: false,
        method: null 
      });
    }
    
    // Check for user-specific cookie file
    const userCookiePath = path.join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
    
    if (existsSync(userCookiePath)) {
      try {
        const cookieContent = readFileSync(userCookiePath, 'utf-8');
        const lines = cookieContent.split('\n');
        const cookieLines = lines.filter(l => l.trim() && !l.startsWith('#'));
        
        if (cookieLines.length > 0) {
          // Simple check for cookie expiration (cookies typically last 6 months to 2 years)
          const sixMonthsInMs = 180 * 24 * 60 * 60 * 1000;
          const expiresAt = Date.now() + sixMonthsInMs;
          const daysRemaining = Math.floor(sixMonthsInMs / (24 * 60 * 60 * 1000));
          
          return NextResponse.json({
            authenticated: true,
            method: 'cookies', // Indicate cookie-based auth
            sessionId: sessionId.substring(0, 8) + '...',
            cookieCount: cookieLines.length,
            expiresAt,
            daysRemaining
          });
        }
      } catch (error) {
        console.error('Error reading cookie file:', error);
      }
    }
    
    return NextResponse.json({ 
      authenticated: false,
      method: null 
    });
    
  } catch (error) {
    console.error('Error checking YouTube auth status:', error);
    return NextResponse.json({ 
      authenticated: false,
      error: 'Failed to check authentication status',
      method: null
    }, { status: 500 });
  }
} 