'use client';

import { useState } from 'react';
import { YouTubeAuthConfig } from '../../src/lib/youtube-auth-v2';

interface BulkDownloadButtonProps {
  matches: any[];
  authConfig?: YouTubeAuthConfig;
}

export default function BulkDownloadButton({ matches, authConfig }: BulkDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setError(null);
      setProgress('Preparing downloads...');

      const response = await fetch('/api/download-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          matches,
          authConfig 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Download failed');
      }

      const data = await response.json();
      
      if (data.downloadUrl) {
        // Create download link
        const link = document.createElement('a');
        link.href = data.downloadUrl;
        link.download = `twipclip-${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setProgress(`Downloaded ${data.successfulDownloads}/${data.totalClips} clips successfully!`);
      } else {
        throw new Error('No download URL received');
      }
    } catch (err) {
      console.error('Download error:', err);
      setError(err instanceof Error ? err.message : 'Failed to download clips');
    } finally {
      setDownloading(false);
    }
  };

  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <button
        onClick={handleDownload}
        disabled={downloading}
        className={`
          w-full px-6 py-3 rounded-lg font-medium transition-all
          ${downloading 
            ? 'bg-gray-600 cursor-not-allowed' 
            : 'bg-green-600 hover:bg-green-700 active:scale-95'
          }
          text-white shadow-lg
        `}
      >
        {downloading ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Downloading...
          </span>
        ) : (
          <span className="flex items-center justify-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Download All Clips ({matches.length})
          </span>
        )}
      </button>
      
      {progress && (
        <div className="mt-2 text-sm text-green-400 text-center">
          {progress}
        </div>
      )}
      
      {error && (
        <div className="mt-2 text-sm text-red-400 text-center">
          {error}
        </div>
      )}

      {!authConfig && (
        <div className="mt-2 text-sm text-yellow-400 text-center">
          ⚠️ No YouTube authentication configured - downloads may fail for restricted content
        </div>
      )}
    </div>
  );
} 