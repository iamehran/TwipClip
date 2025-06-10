'use client';

import { useState } from 'react';

interface SearchFormProps {
  onSearch: (threadContent: string, videoUrls: string[], forceRefresh: boolean) => void;
  loading: boolean;
}

export default function SearchForm({ onSearch, loading }: SearchFormProps) {
  const [threadContent, setThreadContent] = useState('');
  const [videoUrlsText, setVideoUrlsText] = useState('');
  const [forceRefresh, setForceRefresh] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse video URLs (one per line)
    const urls = videoUrlsText
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0 && (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com') || url.includes('http')));
    
    onSearch(threadContent, urls, forceRefresh);
  };

  // Example content for easy testing
  const loadExample = () => {
    setThreadContent(`The AI revolution isn't coming - it's already here, reshaping how we work and create
---
This wasn't just another CEO interview. Sundar Pichai uncovered that the businesses winning today aren't just building new products... they've built a brand new playbook
---
And tech companies are using it to dominate. Here are his 8 revelations on the shift happening right now
---
The $2 trillion opportunity that most are missing completely`);
    
    setVideoUrlsText(`https://www.youtube.com/watch?v=abc123
https://www.youtube.com/watch?v=xyz789`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Thread Content Input */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex justify-between items-start mb-3">
          <div>
            <label htmlFor="thread" className="block text-lg font-medium text-white mb-1">
              Thread Content
            </label>
            <p className="text-sm text-gray-400">
              Enter your hook first, then separate each tweet with triple dashes (---)
            </p>
          </div>
          <button
            type="button"
            onClick={loadExample}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors"
          >
            Load Example
          </button>
        </div>
        
        <textarea
          id="thread"
          value={threadContent}
          onChange={(e) => setThreadContent(e.target.value)}
          className="w-full h-48 px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
          placeholder={`Your thread hook goes here...
---
First tweet content
---
Second tweet content
---
Third tweet content`}
          required
          spellCheck={false}
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
        />
        
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Tip: Each section separated by triple dashes (---) will be treated as a separate piece of content</span>
        </div>
      </div>

      {/* Video URLs Input */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <label htmlFor="videos" className="block text-lg font-medium text-white mb-1">
          Video URLs
        </label>
        <p className="text-sm text-gray-400 mb-3">
          Enter video URLs (one per line) - supports YouTube, Vimeo, and direct video links
        </p>
        
        <textarea
          id="videos"
          value={videoUrlsText}
          onChange={(e) => setVideoUrlsText(e.target.value)}
          className="w-full h-32 px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
          placeholder={`https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://vimeo.com/VIDEO_ID
https://example.com/video.mp4`}
          required
          spellCheck={false}
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
        />
        
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>We'll transcribe these videos and find the most relevant clips for your content</span>
        </div>
      </div>

      {/* Submit Button */}
      <div className="space-y-4">
        {/* Force Refresh Option */}
        <div className="flex items-center gap-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4">
          <input
            type="checkbox"
            id="forceRefresh"
            checked={forceRefresh}
            onChange={(e) => setForceRefresh(e.target.checked)}
            className="w-5 h-5 text-yellow-600 bg-gray-900 border-gray-600 rounded focus:ring-yellow-500 focus:ring-2"
          />
          <label htmlFor="forceRefresh" className="flex-1 cursor-pointer">
            <span className="text-yellow-300 font-medium">Force Refresh Transcripts</span>
            <p className="text-xs text-yellow-400/70 mt-1">
              Check this to bypass cache and fetch fresh transcripts (slower but ensures latest content)
            </p>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-200 ${
            loading 
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing Videos...
            </span>
          ) : (
            'Find Matching Clips'
          )}
        </button>
      </div>
    </form>
  );
} 