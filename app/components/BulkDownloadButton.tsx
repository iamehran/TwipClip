'use client';

import { useState, useEffect, useRef } from 'react';

interface BulkDownloadButtonProps {
  threadContent: string;
  videoUrls: string[];
  matches?: any[];
  disabled?: boolean;
}

export default function BulkDownloadButton({ 
  threadContent, 
  videoUrls,
  matches,
  disabled = false 
}: BulkDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState('');
  const [quality, setQuality] = useState('720p');
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const qualityMenuRef = useRef<HTMLDivElement>(null);

  // Close quality menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (qualityMenuRef.current && !qualityMenuRef.current.contains(event.target as Node)) {
        setShowQualityMenu(false);
      }
    };

    if (showQualityMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showQualityMenu]);

  const handleBulkDownload = async () => {
    if (disabled || downloading) return;
    
    setDownloading(true);
    setProgress('Processing videos and finding perfect matches...');
    setShowQualityMenu(false); // Close menu when starting download
    
    try {
      const response = await fetch('/api/download-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread: threadContent,
          videos: videoUrls,
          matches: matches,
          quality: quality // Pass selected quality
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Download failed');
      }
      
      // Get the filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `twipclip-${Date.now()}.zip`;
      
      // Download the ZIP file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setProgress('Download complete!');
      setTimeout(() => setProgress(''), 3000);
      
    } catch (error) {
      console.error('Bulk download error:', error);
      setProgress(`Error: ${error instanceof Error ? error.message : 'Download failed'}`);
      setTimeout(() => setProgress(''), 5000);
    } finally {
      setDownloading(false);
    }
  };
  
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        {/* Quality Selector */}
        <div className="relative" ref={qualityMenuRef}>
          <button
            onClick={() => setShowQualityMenu(!showQualityMenu)}
            disabled={disabled || downloading}
            className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center gap-2 ${
              disabled || downloading
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            {quality}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showQualityMenu && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg overflow-hidden z-10">
              <button
                onClick={() => { setQuality('720p'); setShowQualityMenu(false); }}
                className={`block w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors ${
                  quality === '720p' ? 'bg-gray-700 text-[#b8a887]' : 'text-white'
                }`}
              >
                720p (HD)
              </button>
              <button
                onClick={() => { setQuality('1080p'); setShowQualityMenu(false); }}
                className={`block w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors ${
                  quality === '1080p' ? 'bg-gray-700 text-[#b8a887]' : 'text-white'
                }`}
              >
                1080p (Full HD)
              </button>
            </div>
          )}
        </div>

        {/* Download Button */}
        <button
          onClick={handleBulkDownload}
          disabled={disabled || downloading}
          className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center gap-2 ${
            disabled || downloading
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-[#b8a887] to-[#a09775] hover:from-[#a09775] hover:to-[#908765] text-[#0e1e2d] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
          }`}
        >
          {downloading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Download All Clips
            </>
          )}
        </button>
      </div>
      
      {progress && (
        <p className={`text-xs ${progress.includes('Error') ? 'text-red-400' : 'text-[#b8a887]'} text-center max-w-xs`}>
          {progress}
        </p>
      )}
      
      <p className="text-xs text-gray-500 text-center max-w-xs">
        Downloads one perfect clip per tweet as a ZIP file
      </p>
    </div>
  );
} 