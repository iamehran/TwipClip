import { NextResponse } from 'next/server';
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
    
    // Test authentication
    const isAuthenticated = await YouTubeAuthManagerV2.testAuthentication(browser, profile);
    
    if (isAuthenticated) {
      return NextResponse.json({
        success: true,
        message: 'Authentication test successful'
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Authentication test failed. Please ensure you are logged into YouTube in your browser.',
        solutions: YouTubeAuthManagerV2.getErrorSolution('Sign in to confirm')
      });
    }
  } catch (error: any) {
    console.error('Error testing authentication:', error);
    
    // Provide helpful error messages
    const solutions = error.message?.includes('Sign in to confirm') 
      ? YouTubeAuthManagerV2.getErrorSolution(error.message)
      : ['Check if yt-dlp is installed', 'Ensure the browser is accessible'];
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to test authentication',
      solutions
    }, { status: 500 });
  }
} 