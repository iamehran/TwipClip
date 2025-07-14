'use client';

import { getUserFriendlyError } from '../utils/error-messages';

interface ErrorDisplayProps {
  error: string;
  onRetry?: () => void;
}

export default function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const errorInfo = getUserFriendlyError(error);

  return (
    <div className="mt-8 p-6 bg-red-900/10 border border-red-800/30 rounded-lg">
      <div className="flex items-start gap-4">
        <div className="text-3xl flex-shrink-0">{errorInfo.icon}</div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-400 mb-2">
            {errorInfo.title}
          </h3>
          <p className="text-red-300/90 mb-4">{errorInfo.message}</p>
          
          <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-gray-300 mb-2">What to do:</p>
            <ul className="space-y-2">
              {errorInfo.actions.map((action, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-400">
                  <span className="text-[#b8a887] mt-0.5">•</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Show technical error in collapsible for debugging */}
          <details className="mb-4">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400">
              Show technical details
            </summary>
            <pre className="mt-2 p-2 bg-gray-900/50 rounded text-xs text-gray-500 overflow-x-auto">
              {error}
            </pre>
          </details>

          {onRetry && errorInfo.retryable && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-[#b8a887] hover:bg-[#a09775] text-[#0e1e2d] rounded-md transition-colors text-sm font-medium"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
} 