import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { YouTubeAuthManagerV2 } from '../../../../../../src/lib/youtube-auth-v2';

export async function POST(request: Request) {
  try {
    const { browser, profile } = await request.json();
    
    if (!browser) {
      return NextResponse.json({
        success: false,
        error: 'Browser is required'
      }, { status: 400 });
    }
    
    // Get or create session ID
    const cookieStore = cookies();
    let sessionId = cookieStore.get('youtube_session_id')?.value;
    
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      cookieStore.set('youtube_session_id', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 // 30 days
      });
    }
    
    // Set user preference
    YouTubeAuthManagerV2.setUserPreference(sessionId, {
      browser,
      profile: profile || 'Default'
    });
    
    // Get updated status
    const status = await YouTubeAuthManagerV2.getAuthStatus(sessionId);
    
    return NextResponse.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error selecting browser:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to select browser'
    }, { status: 500 });
  }
} 