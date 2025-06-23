import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { YouTubeAuthManager } from '../../../../../src/lib/youtube-auth';

export async function POST() {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get('youtube_session_id')?.value;
    
    // Delete cookie file if session exists
    if (sessionId) {
      await YouTubeAuthManager.deleteCookieFile(sessionId);
    }
    
    // Clear cookies
    const response = NextResponse.json({
      success: true,
      message: 'YouTube disconnected successfully'
    });
    
    response.cookies.delete('youtube_session_id');
    response.cookies.delete('youtube_authenticated');
    
    return response;
    
  } catch (error) {
    console.error('Error disconnecting YouTube:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect YouTube' },
      { status: 500 }
    );
  }
} 