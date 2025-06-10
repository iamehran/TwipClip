import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.NODE_ENV === 'production' 
    ? 'https://twipclip-production.up.railway.app/api/auth/youtube/callback'
    : 'http://localhost:3000/api/auth/youtube/callback';
  
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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600 // 10 minutes
  });
  
  return response;
} 