'use client';

import { useState } from 'react';

interface ExportButtonProps {
  data: any;
  filename?: string;
}

export default function ExportButton({ data, filename = 'twipclip-results' }: ExportButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  const exportAsJSON = () => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowMenu(false);
  };

  const exportAsCSV = () => {
    // Convert results to CSV format
    const csvRows = ['Tweet,Video Title,Start Time,End Time,Confidence,Match Method,Transcript'];
    
    Object.entries(data).forEach(([tweetKey, tweetData]: [string, any]) => {
      tweetData.clips.forEach((clip: any) => {
        const row = [
          `"${tweetData.tweet.replace(/"/g, '""')}"`,
          `"${clip.title.replace(/"/g, '""')}"`,
          clip.startTime,
          clip.endTime,
          (clip.confidence * 100).toFixed(0) + '%',
          clip.matchMethod,
          `"${clip.transcriptText.replace(/"/g, '""')}"`
        ].join(',');
        csvRows.push(row);
      });
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowMenu(false);
  };

  const copyToClipboard = () => {
    const jsonString = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(jsonString);
    setShowMenu(false);
    
    // Show temporary success message
    const button = document.getElementById('export-button');
    if (button) {
      const originalText = button.textContent;
      button.textContent = '✓ Copied!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    }
  };

  return (
    <div className="relative">
      <button
        id="export-button"
        onClick={() => setShowMenu(!showMenu)}
        className="px-3 sm:px-4 py-1.5 sm:py-2 bg-[#b8a887]/20 hover:bg-[#b8a887]/30 text-[#b8a887] border border-[#b8a887]/30 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 sm:gap-2"
      >
        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="hidden sm:inline">Export Results</span>
        <span className="sm:hidden">Export</span>
      </button>

      {showMenu && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setShowMenu(false)}
          />
          
          {/* Menu */}
          <div className="absolute right-0 mt-2 w-48 bg-[#0e1e2d]/90 backdrop-blur-sm rounded-lg shadow-xl border border-[#b8a887]/20 py-1 z-20">
            <button
              onClick={exportAsJSON}
              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[#b8a887]/10 hover:text-[#b8a887] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export as JSON
            </button>
            
            <button
              onClick={exportAsCSV}
              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[#b8a887]/10 hover:text-[#b8a887] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export as CSV
            </button>
            
            <div className="border-t border-[#b8a887]/20 my-1"></div>
            
            <button
              onClick={copyToClipboard}
              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[#b8a887]/10 hover:text-[#b8a887] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy to Clipboard
            </button>
          </div>
        </>
      )}
    </div>
  );
} 