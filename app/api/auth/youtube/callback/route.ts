import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  
  const cookieStore = cookies();
  const savedState = cookieStore.get('youtube_auth_state')?.value;
  
  // Verify state to prevent CSRF
  if (state !== savedState) {
    return NextResponse.redirect(new URL('/?error=invalid_state', request.url));
  }
  
  if (error) {
    return NextResponse.redirect(new URL('/?error=auth_denied', request.url));
  }
  
  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }
  
  try {
    // Get the actual host from the request
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const baseUrl = `${protocol}://${host}`;
    const redirectUri = `${baseUrl}/api/auth/youtube/callback`;
    
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    
    const tokens = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokens);
      return NextResponse.redirect(new URL('/?error=token_failed', request.url));
    }
    
    // Create response with redirect
    const response = NextResponse.redirect(new URL('/?youtube_connected=true', request.url));
    
    // Set a simple flag that user is authenticated
    // We'll use --cookies-from-browser in yt-dlp which will use the user's actual YouTube cookies
    response.cookies.set('youtube_authenticated', 'true', {
      httpOnly: true,
      secure: protocol === 'https',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
    
    // Clean up state cookie
    response.cookies.delete('youtube_auth_state');
    
    return response;
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL('/?error=unknown', request.url));
  }
} 