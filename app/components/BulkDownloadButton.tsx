'use client';

import { useState } from 'react';
import { YouTubeAuthConfig } from '../../src/lib/youtube-auth-v2';

interface BulkDownloadButtonProps {
  matches: any[];
  authConfig?: YouTubeAuthConfig;
  isAuthenticated?: boolean;
}

interface DownloadStatus {
  totalClips: number;
  successfulDownloads: number;
  typeFullyCompatible: number;
  failedDownloads: number;
  excludedDueToLimits: number;
  totalSizeMB: string;
}

export default function BulkDownloadButton({ matches, authConfig, isAuthenticated }: BulkDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus | null>(null);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setError(null);
      setProgress('Preparing downloads...');
      setDownloadStatus(null);

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
        // Set download status
        setDownloadStatus({
          totalClips: data.totalClips,
          successfulDownloads: data.successfulDownloads,
          typeFullyCompatible: data.typeFullyCompatible,
          failedDownloads: data.failedDownloads,
          excludedDueToLimits: data.excludedDueToLimits,
          totalSizeMB: data.totalSizeMB
        });
        
        // Create download link
        const link = document.createElement('a');
        link.href = data.downloadUrl;
        link.download = `twipclip-${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setProgress(null);
      } else {
        throw new Error('No download URL received');
      }
    } catch (err) {
      console.error('Download error:', err);
      setError(err instanceof Error ? err.message : 'Failed to download clips');
      setDownloadStatus(null);
    } finally {
      setDownloading(false);
    }
  };

  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Download Button */}
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
            Downloading & Optimizing Videos...
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

      {/* Typefully Requirements Info */}
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-sm">
        <div className="flex items-start space-x-2">
          <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-blue-300">
            <p className="font-medium mb-1">Video Optimization:</p>
            <ul className="space-y-1 text-blue-400">
              <li>• Videos are exported in 720p for optimal quality</li>
              <li>• Maximum file size: 512MB per video</li>
              <li>• Maximum duration: 10 minutes per video</li>
              <li>• Format: MP4 with H.264 codec</li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Progress/Status */}
      {progress && (
        <div className="text-sm text-green-400 text-center animate-pulse">
          {progress}
        </div>
      )}
      
      {/* Download Status */}
      {downloadStatus && (
        <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
          <h3 className="text-green-400 font-medium mb-2">Download Complete!</h3>
          <div className="space-y-1 text-sm text-green-300">
            <p>✓ {downloadStatus.typeFullyCompatible} clips ready ({downloadStatus.totalSizeMB}MB total)</p>
            {downloadStatus.failedDownloads > 0 && (
              <p>✗ {downloadStatus.failedDownloads} clips failed to download</p>
            )}
            {downloadStatus.excludedDueToLimits > 0 && (
              <p>⚠️ {downloadStatus.excludedDueToLimits} clips excluded (exceeded size/duration limits)</p>
            )}
          </div>
        </div>
      )}
      
      {/* Error Display */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-red-300">
              <p className="font-medium">{error}</p>
              <p className="mt-1 text-red-400">Please check your authentication and try again.</p>
            </div>
          </div>
        </div>
      )}

      {/* Authentication Warning */}
      {!isAuthenticated && (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <svg className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm text-yellow-300">
              <p className="font-medium">No YouTube authentication configured</p>
              <p className="mt-1 text-yellow-400">Downloads may fail for age-restricted or private content. Please authenticate with YouTube for best results.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 