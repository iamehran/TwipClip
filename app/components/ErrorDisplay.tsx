'use client';

interface ErrorDisplayProps {
  error: string;
  onRetry?: () => void;
}

export default function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  // Check if it's a YouTube bot detection error
  const isBotDetectionError = error.includes('Sign in to confirm') || error.includes('bot');
  
  const getErrorInfo = () => {
    if (error.includes('401') || error.includes('authentication')) {
      return {
        icon: '🔐',
        title: 'Authentication Error',
        message: 'There seems to be an issue with API authentication.',
        suggestions: [
          'Check if your YouTube API key is properly configured',
          'Verify your OpenAI API key is set correctly',
          'Ensure API keys have the necessary permissions'
        ]
      };
    } else if (error.includes('403') || error.includes('blocked')) {
      return {
        icon: '🚫',
        title: 'Access Blocked',
        message: 'The video or service is blocking access.',
        suggestions: [
          'The video might be region-restricted',
          'Try using different video URLs',
          'Check if the videos are publicly accessible'
        ]
      };
    } else if (error.includes('timeout')) {
      return {
        icon: '⏱️',
        title: 'Request Timeout',
        message: 'The operation took too long to complete.',
        suggestions: [
          'Try with shorter videos',
          'Check your internet connection',
          'Process fewer videos at once'
        ]
      };
    } else if (error.includes('Whisper') || error.includes('transcription')) {
      return {
        icon: '🎙️',
        title: 'Transcription Error',
        message: 'Failed to transcribe one or more videos.',
        suggestions: [
          'Ensure videos have audio tracks',
          'Try with different video formats',
          'Check if OpenAI API key is valid'
        ]
      };
    } else {
      return {
        icon: '⚠️',
        title: 'Something went wrong',
        message: error,
        suggestions: [
          'Check your internet connection',
          'Verify all API keys are configured',
          'Try again with different content'
        ]
      };
    }
  };

  const errorInfo = getErrorInfo();

  return (
    <div className="mt-8 p-6 bg-red-900/10 border border-red-800/30 rounded-lg">
      <div className="flex items-start gap-3">
        <svg className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-400 mb-1">
            {isBotDetectionError ? 'YouTube Access Issue' : 'Processing Error'}
          </h3>
          <p className="text-red-300/90 mb-3">{error}</p>
          
          {isBotDetectionError && (
            <div className="mt-3 p-3 bg-[#b8a887]/10 border border-[#b8a887]/20 rounded text-sm text-[#b8a887]">
              <p className="font-semibold mb-1">YouTube is blocking automated access. Try:</p>
              <ul className="list-disc list-inside space-y-1 text-[#b8a887]/90">
                <li>Wait a few minutes and retry</li>
                <li>Use different video URLs</li>
                <li>Try videos from other platforms (Vimeo, etc.)</li>
                <li>Contact support if the issue persists</li>
              </ul>
            </div>
          )}
          
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-4 px-4 py-2 bg-[#b8a887] hover:bg-[#a09775] text-[#0e1e2d] rounded-md transition-colors text-sm font-medium"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
} 