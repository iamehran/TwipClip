import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('twipclip_session')?.value;
    
    if (sessionId) {
      // Refresh the session cookie with extended expiration
      cookieStore.set('twipclip_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/'
      });
      
      return NextResponse.json({ 
        success: true,
        message: 'Session refreshed'
      });
    }
    
    return NextResponse.json({ 
      success: false,
      message: 'No active session'
    });
    
  } catch (error) {
    console.error('Error refreshing session:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to refresh session'
    }, { status: 500 });
  }
} 