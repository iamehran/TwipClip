import { NextResponse, NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  
  // Get the actual host from the request
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/youtube/callback`;
  
  console.log('OAuth redirect URI:', redirectUri);
  
  const scope = 'https://www.googleapis.com/auth/youtube.readonly';
  const state = Math.random().toString(36).substring(7);
  
  // Store state in cookie for verification
  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scope)}&` +
    `access_type=offline&` +
    `state=${state}&` +
    `prompt=consent`
  );
  
  response.cookies.set('youtube_auth_state', state, {
    httpOnly: true,
    secure: protocol === 'https',
    sameSite: 'lax',
    maxAge: 600 // 10 minutes
  });
  
  return response;
} 