'use client';

interface ErrorDisplayProps {
  error: string;
  onRetry?: () => void;
}

export default function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
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
    <div className="mt-6 max-w-2xl mx-auto">
      <div className="bg-red-900/20 backdrop-blur-sm border border-red-500/30 rounded-xl p-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="text-4xl">{errorInfo.icon}</div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-300 mb-1">
              {errorInfo.title}
            </h3>
            <p className="text-red-200/80 text-sm">
              {errorInfo.message}
            </p>
          </div>
        </div>

        {/* Suggestions */}
        {errorInfo.suggestions.length > 0 && (
          <div className="mt-4 bg-gray-800/30 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-400 mb-2">Suggestions:</p>
            <ul className="space-y-1">
              {errorInfo.suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-gray-500 mt-0.5">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again
            </button>
          )}
          
          <button
            onClick={() => navigator.clipboard.writeText(error)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            Copy Error
          </button>
        </div>

        {/* Technical Details */}
        <details className="mt-4">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
            Technical details
          </summary>
          <pre className="mt-2 p-3 bg-gray-900/50 rounded text-xs text-gray-400 overflow-x-auto">
            {error}
          </pre>
        </details>
      </div>
    </div>
  );
} 