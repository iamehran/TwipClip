import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('twipclip_session')?.value;
    const isAuthenticated = cookieStore.get('youtube_authenticated')?.value === 'true';
    
    if (!sessionId || !isAuthenticated) {
      return NextResponse.json({ 
        authenticated: false,
        message: 'No authentication found' 
      });
    }
    
    // Check if user's cookie file exists
    const userCookieFile = join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
    
    if (!existsSync(userCookieFile)) {
      // Cookie was set but file is missing
      return NextResponse.json({ 
        authenticated: false,
        message: 'Cookie file not found. Please upload cookies again.' 
      });
    }
    
    // Validate cookie file content
    try {
      const content = await readFile(userCookieFile, 'utf-8');
      const hasYouTubeCookies = content.includes('.youtube.com') && content.includes('TRUE');
      
      if (!hasYouTubeCookies) {
        return NextResponse.json({ 
          authenticated: false,
          message: 'Invalid cookie file. Please upload valid YouTube cookies.' 
        });
      }
      
      // Count actual cookie entries (excluding comments and empty lines)
      const cookieLines = content.split('\n').filter(line => 
        line.trim() && !line.startsWith('#') && line.includes('\t')
      );
      
      return NextResponse.json({ 
        authenticated: true,
        sessionId: sessionId.substring(0, 8) + '...',
        cookieCount: cookieLines.length,
        message: 'YouTube authentication active' 
      });
      
    } catch (error) {
      console.error('Error reading cookie file:', error);
      return NextResponse.json({ 
        authenticated: false,
        message: 'Error validating cookie file' 
      });
    }
    
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json({ 
      authenticated: false,
      error: 'Failed to check authentication status' 
    }, { status: 500 });
  }
} 