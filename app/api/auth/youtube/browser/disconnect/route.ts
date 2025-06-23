import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { YouTubeAuthManagerV2 } from '../../../../../../src/lib/youtube-auth-v2';

export async function POST() {
  try {
    // Get session ID
    const cookieStore = cookies();
    const sessionId = cookieStore.get('youtube_session_id')?.value;
    
    if (sessionId) {
      // Clear user preferences
      YouTubeAuthManagerV2.clearPreferences(sessionId);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Disconnected successfully'
    });
  } catch (error) {
    console.error('Error disconnecting:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to disconnect'
    }, { status: 500 });
  }
} 