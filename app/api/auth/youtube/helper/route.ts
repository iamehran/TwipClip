import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Must match the helper's encryption key
const ENCRYPTION_KEY = 'TwipClip2024AuthKey-DoNotShare!!';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    
    if (!token || !token.startsWith('TWIPCLIP_AUTH_V1:')) {
      return NextResponse.json({
        success: false,
        error: 'Invalid token format'
      }, { status: 400 });
    }

    // Extract the base64 payload
    const tokenData = token.replace('TWIPCLIP_AUTH_V1:', '');
    
    try {
      // Decode the token
      const decoded = JSON.parse(Buffer.from(tokenData, 'base64').toString());
      const { metadata, data: encryptedData, iv } = decoded;
      
      // Validate token age (max 5 minutes old)
      const tokenAge = Date.now() - metadata.timestamp;
      if (tokenAge > 5 * 60 * 1000) {
        return NextResponse.json({
          success: false,
          error: 'Token expired. Please run the helper again.'
        }, { status: 400 });
      }

      // Decrypt cookie data using modern crypto API
      const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
      const ivBuffer = Buffer.from(iv, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivBuffer);
      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      // Save cookies for this user session
      const cookieStore = await cookies();
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

      // Save cookie file for this session
      const cookieDir = join(process.env.NODE_ENV === 'production' ? '/tmp' : process.cwd(), 'temp', 'cookies', sessionId);
      mkdirSync(cookieDir, { recursive: true });
      
      const cookiePath = join(cookieDir, 'youtube.txt');
      writeFileSync(cookiePath, decrypted);

      // Store metadata in cookies
      cookieStore.set('youtube_auth_metadata', JSON.stringify({
        browser: metadata.browser,
        platform: metadata.platform,
        authenticatedAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
      }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 // 30 days
      });

      return NextResponse.json({
        success: true,
        message: 'YouTube authentication activated successfully!',
        browser: metadata.browser,
        expiresIn: '30 days'
      });

    } catch (error) {
      console.error('Token decryption error:', error);
      return NextResponse.json({
        success: false,
        error: 'Invalid or corrupted token'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Helper auth error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process authentication token'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('youtube_session_id')?.value;
    const authMetadata = cookieStore.get('youtube_auth_metadata')?.value;
    
    if (!sessionId || !authMetadata) {
      return NextResponse.json({
        authenticated: false
      });
    }

    const metadata = JSON.parse(authMetadata);
    const isExpired = Date.now() > metadata.expiresAt;
    
    return NextResponse.json({
      authenticated: !isExpired,
      browser: metadata.browser,
      platform: metadata.platform,
      authenticatedAt: metadata.authenticatedAt,
      expiresAt: metadata.expiresAt,
      daysRemaining: Math.max(0, Math.floor((metadata.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
    });

  } catch (error) {
    console.error('Auth status error:', error);
    return NextResponse.json({
      authenticated: false,
      error: 'Failed to check authentication status'
    });
  }
} 