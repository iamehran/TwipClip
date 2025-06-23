import { NextResponse, NextRequest } from 'next/server';
import { YouTubeAuthManager, YouTubeCookie } from '../../../../../src/lib/youtube-auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cookies: browserCookies } = body;
    
    if (!browserCookies || !Array.isArray(browserCookies)) {
      return NextResponse.json(
        { error: 'Invalid cookies data' },
        { status: 400 }
      );
    }
    
    // Filter and validate YouTube/Google cookies
    const youtubeCookies = browserCookies.filter((cookie: any) => {
      return cookie.domain && (
        cookie.domain.includes('youtube.com') || 
        cookie.domain.includes('google.com')
      );
    });
    
    if (youtubeCookies.length === 0) {
      return NextResponse.json(
        { error: 'No YouTube cookies found' },
        { status: 400 }
      );
    }
    
    // Generate or get session ID
    const cookieStore = cookies();
    let sessionId = cookieStore.get('youtube_session_id')?.value;
    
    if (!sessionId) {
      sessionId = YouTubeAuthManager.generateSessionId();
    }
    
    // Store cookies
    await YouTubeAuthManager.storeCookies(sessionId, youtubeCookies as YouTubeCookie[]);
    
    // Set session cookie
    const response = NextResponse.json({
      success: true,
      message: 'Cookies stored successfully',
      sessionId,
      cookieCount: youtubeCookies.length
    });
    
    response.cookies.set('youtube_session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });
    
    response.cookies.set('youtube_authenticated', 'true', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });
    
    return response;
    
  } catch (error) {
    console.error('Error extracting cookies:', error);
    return NextResponse.json(
      { error: 'Failed to extract cookies' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get('youtube_session_id')?.value;
    
    if (!sessionId) {
      return NextResponse.json({
        authenticated: false,
        message: 'No session found'
      });
    }
    
    const isAuthenticated = await YouTubeAuthManager.isAuthenticated(sessionId);
    
    return NextResponse.json({
      authenticated: isAuthenticated,
      sessionId: isAuthenticated ? sessionId : null
    });
    
  } catch (error) {
    console.error('Error checking auth status:', error);
    return NextResponse.json({
      authenticated: false,
      error: 'Failed to check authentication status'
    });
  }
} 