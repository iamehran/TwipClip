import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { YouTubeAuthManagerV2 } from '../../../../../../src/lib/youtube-auth-v2';

export async function GET() {
  try {
    // Get session ID from cookies
    const cookieStore = cookies();
    const sessionId = cookieStore.get('youtube_session_id')?.value || 
                     `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Set session cookie if not exists
    if (!cookieStore.get('youtube_session_id')?.value) {
      cookieStore.set('youtube_session_id', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 // 30 days
      });
    }
    
    // Get authentication status
    const status = await YouTubeAuthManagerV2.getAuthStatus(sessionId);
    
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error checking auth status:', error);
    return NextResponse.json({
      authenticated: false,
      error: 'Failed to check authentication status'
    }, { status: 500 });
  }
} 