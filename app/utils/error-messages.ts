export interface UserFriendlyError {
  title: string;
  message: string;
  icon: string;
  actions: string[];
  retryable: boolean;
}

export function getUserFriendlyError(error: string): UserFriendlyError {
  // YouTube Authentication Errors
  if (error.includes('Sign in to confirm') || error.includes('bot') || error.includes('YouTube requires authentication')) {
    return {
      title: 'YouTube Authentication Required',
      message: 'YouTube is blocking automated access to protect against bots.',
      icon: '🔐',
      actions: [
        'Upload fresh YouTube cookies (click "Upload YouTube Cookies" button)',
        'Make sure you\'re logged into YouTube when exporting cookies',
        'Try again in a few minutes',
        'Use videos from other platforms (Vimeo) as alternatives'
      ],
      retryable: true
    };
  }

  // Cookie-related errors
  if (error.includes('No YouTube cookies found') || error.includes('not logged in')) {
    return {
      title: 'YouTube Cookies Missing',
      message: 'You need to upload YouTube cookies to download videos.',
      icon: '🍪',
      actions: [
        'Click "Upload YouTube Cookies" button',
        'Follow the guide to export cookies from your browser',
        'Make sure you\'re logged into YouTube first',
        'Check that the cookie file isn\'t empty'
      ],
      retryable: false
    };
  }

  // API Key Errors
  if (error.includes('Anthropic API key not configured') || error.includes('ANTHROPIC_API_KEY')) {
    return {
      title: 'AI Service Not Configured',
      message: 'The AI matching service is not properly set up.',
      icon: '🤖',
      actions: [
        'Contact the administrator to configure the AI service',
        'This is a server configuration issue',
        'The service needs an Anthropic API key'
      ],
      retryable: false
    };
  }

  if (error.includes('OpenAI API key not available')) {
    return {
      title: 'Transcription Service Not Configured',
      message: 'The video transcription service is not set up.',
      icon: '🎙️',
      actions: [
        'Contact the administrator to configure OpenAI Whisper',
        'This is a server configuration issue',
        'Alternative: Use videos with existing captions'
      ],
      retryable: false
    };
  }

  // System Dependencies
  if (error.includes('yt-dlp not found') || error.includes('yt-dlp is not available')) {
    return {
      title: 'Video Downloader Missing',
      message: 'The video download tool is not installed on the server.',
      icon: '⚙️',
      actions: [
        'Contact the administrator to install yt-dlp',
        'This is a server setup issue',
        'The server needs: pip install yt-dlp'
      ],
      retryable: false
    };
  }

  if (error.includes('FFmpeg not found') || error.includes('FFmpeg is not available')) {
    return {
      title: 'Video Processor Missing',
      message: 'The video processing tool is not installed on the server.',
      icon: '🎬',
      actions: [
        'Contact the administrator to install FFmpeg',
        'This is a server setup issue',
        'The server needs FFmpeg installed'
      ],
      retryable: false
    };
  }

  // Content Issues
  if (error.includes('No tweets found in the thread')) {
    return {
      title: 'Invalid Thread Format',
      message: 'Could not parse tweets from your input.',
      icon: '📝',
      actions: [
        'Make sure tweets are separated by "---" (three dashes)',
        'Example: Tweet 1 text---Tweet 2 text---Tweet 3 text',
        'Or paste a Twitter/X thread URL directly',
        'Check that you\'ve entered actual content'
      ],
      retryable: true
    };
  }

  if (error.includes('No video transcripts could be obtained')) {
    return {
      title: 'Video Processing Failed',
      message: 'Could not extract content from any of the provided videos.',
      icon: '📹',
      actions: [
        'Check that the video URLs are correct and accessible',
        'Ensure videos have audio tracks (not silent videos)',
        'Try with different videos',
        'Some videos may be region-restricted or private'
      ],
      retryable: true
    };
  }

  if (error.includes('Cannot process live videos') || error.includes('live')) {
    return {
      title: 'Live Video Not Supported',
      message: 'Live streams cannot be processed.',
      icon: '🔴',
      actions: [
        'Wait for the live stream to end',
        'Use the recorded version once available',
        'Try with regular (non-live) videos'
      ],
      retryable: false
    };
  }

  if (error.includes('too long')) {
    return {
      title: 'Video Too Long',
      message: 'The video exceeds the maximum processing length.',
      icon: '⏱️',
      actions: [
        'Use videos under 2 hours in length',
        'Try with shorter video content',
        'Consider splitting long content into parts'
      ],
      retryable: false
    };
  }

  // Download/Network Issues
  if (error.includes('timeout') || error.includes('Timeout')) {
    return {
      title: 'Operation Timed Out',
      message: 'The process took too long and was cancelled.',
      icon: '⏰',
      actions: [
        'Check your internet connection',
        'Try with fewer or shorter videos',
        'Process videos one at a time',
        'Retry during off-peak hours'
      ],
      retryable: true
    };
  }

  if (error.includes('Video file not found') || error.includes('private, deleted, or region-restricted')) {
    return {
      title: 'Video Not Accessible',
      message: 'The video could not be downloaded.',
      icon: '🚫',
      actions: [
        'Check if the video is public and not deleted',
        'Video might be region-restricted in your area',
        'Try with a different video',
        'Ensure you have proper authentication'
      ],
      retryable: true
    };
  }

  if (error.includes('too small') || error.includes('corrupted')) {
    return {
      title: 'Download Corrupted',
      message: 'The downloaded file appears to be corrupted.',
      icon: '💔',
      actions: [
        'Try downloading again',
        'Check your internet connection',
        'The video source might be having issues',
        'Try a different video'
      ],
      retryable: true
    };
  }

  if (error.includes('too large')) {
    return {
      title: 'File Size Too Large',
      message: 'The video file exceeds size limits.',
      icon: '📦',
      actions: [
        'The clip will be automatically optimized',
        'Try selecting a shorter clip duration',
        'Use lower quality settings if available'
      ],
      retryable: true
    };
  }

  // Processing Errors
  if (error.includes('No segments') || error.includes('No valid segments')) {
    return {
      title: 'Transcription Failed',
      message: 'Could not extract speech from the video.',
      icon: '🎤',
      actions: [
        'Ensure the video has clear audio',
        'Video might not contain speech',
        'Try with a different video',
        'Check if video has captions available'
      ],
      retryable: true
    };
  }

  if (error.includes('Job not found') || error.includes('expired')) {
    return {
      title: 'Session Expired',
      message: 'Your processing session has expired.',
      icon: '⌛',
      actions: [
        'Start a new search',
        'Processing sessions expire after 10 minutes',
        'Your results may have been cleared'
      ],
      retryable: false
    };
  }

  // Network/Connection Errors
  if (error.includes('fetch') || error.includes('network') || error.includes('Network')) {
    return {
      title: 'Connection Error',
      message: 'Could not connect to the server.',
      icon: '🌐',
      actions: [
        'Check your internet connection',
        'Refresh the page and try again',
        'The server might be temporarily unavailable',
        'Try again in a few moments'
      ],
      retryable: true
    };
  }

  // Generic Fallback
  return {
    title: 'Something Went Wrong',
    message: error || 'An unexpected error occurred.',
    icon: '❌',
    actions: [
      'Try refreshing the page',
      'Check that all inputs are correct',
      'Try with different content',
      'Contact support if the issue persists'
    ],
    retryable: true
  };
}

// Helper to format error for display
export function formatErrorForUser(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
} 