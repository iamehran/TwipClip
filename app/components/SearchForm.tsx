'use client';

import { useState, useCallback } from 'react';
import ModelSelector, { ModelSettings } from './ModelSelector';
import examplesData from '../data/examples.json';

interface SearchFormProps {
  onSearch: (threadContent: string, videoUrls: string[], forceRefresh: boolean, modelSettings: ModelSettings) => void;
  loading: boolean;
  initialValues?: {
    threadContent: string;
    videoUrls: string[];
    modelSettings: ModelSettings;
  };
}

interface Example {
  id: string;
  title: string;
  description?: string;
  thread: string;
  videos: string[];
}

export default function SearchForm({ onSearch, loading, initialValues }: SearchFormProps) {
  const [threadContent, setThreadContent] = useState(initialValues?.threadContent || '');
  const [videoUrlsText, setVideoUrlsText] = useState(initialValues?.videoUrls.join('\n') || '');
  const [forceRefresh, setForceRefresh] = useState(false);
  const [modelSettings, setModelSettings] = useState<ModelSettings>(
    initialValues?.modelSettings || {
      model: 'claude-4-sonnet',
      thinkingEnabled: false,
      tokenUsage: 'medium'
    }
  );
  const [lastUsedExampleId, setLastUsedExampleId] = useState<string | null>(null);

  const handleModelSettingsChange = useCallback((settings: ModelSettings) => {
    setModelSettings(settings);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse video URLs (one per line)
    const urls = videoUrlsText
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0 && (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com') || url.includes('http')));
    
    onSearch(threadContent, urls, forceRefresh, modelSettings);
  };

  // Load a random example from the JSON data
  const loadExample = () => {
    try {
      // Type assertion to ensure TypeScript knows this is an array of Examples
      const examples = (examplesData as any).examples as Example[];
      
      // Edge case: No examples available
      if (!examples || examples.length === 0) {
        console.error('No examples available');
        return;
      }

      // Get available examples (excluding the last used one if there are multiple examples)
      let availableExamples = examples;
      if (examples.length > 1 && lastUsedExampleId !== null) {
        availableExamples = examples.filter(ex => ex.id !== lastUsedExampleId);
      }

      // Select a random example
      const randomIndex = Math.floor(Math.random() * availableExamples.length);
      const selectedExample = availableExamples[randomIndex];

      // Edge case: Invalid example structure
      if (!selectedExample || !selectedExample.thread || !selectedExample.videos) {
        console.error('Invalid example structure:', selectedExample);
        return;
      }

      // Set the thread content
      setThreadContent(selectedExample.thread);
      
      // Set the video URLs (join with newlines)
      setVideoUrlsText(selectedExample.videos.join('\n'));
      
      // Remember which example was used
      setLastUsedExampleId(selectedExample.id);

      // Optional: Show a subtle notification of which example was loaded
      console.log(`Loaded example: ${selectedExample.title}`);
      
    } catch (error) {
      console.error('Error loading example:', error);
      // Fallback to original hardcoded example if JSON loading fails
      setThreadContent(`The AI revolution isn't coming - it's already here, reshaping how we work and create
---
This wasn't just another CEO interview. Sundar Pichai uncovered that the businesses winning today aren't just building new products... they've built a brand new playbook
---
And tech companies are using it to dominate. Here are his 8 revelations on the shift happening right now
---
The $2 trillion opportunity that most are missing completely`);
      
      setVideoUrlsText(`https://www.youtube.com/watch?v=abc123
https://www.youtube.com/watch?v=xyz789`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Horizontal Layout for Thread Content and Video URLs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Thread Content Input */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700/50">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-3">
            <div>
              <label htmlFor="thread" className="block text-base sm:text-lg font-medium text-white mb-1">
                Thread Content
              </label>
              <p className="text-xs sm:text-sm text-gray-400">
                Enter your hook first, then separate each tweet with triple dashes (---)
              </p>
            </div>
            <button
              type="button"
              onClick={loadExample}
              className="px-3 py-1 text-xs bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-md transition-colors self-start group relative"
              title="Load a random real-world example"
            >
              <span className="flex items-center gap-1">
                Load Example
                <svg className="w-3 h-3 group-hover:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </span>
            </button>
          </div>
          
          <textarea
            id="thread"
            value={threadContent}
            onChange={(e) => setThreadContent(e.target.value)}
            className="w-full h-64 px-4 py-3 bg-gray-900/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-[#b8a887] focus:border-transparent resize-none font-mono text-sm"
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
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700/50">
          <label htmlFor="videos" className="block text-base sm:text-lg font-medium text-white mb-1">
            Video URLs
          </label>
          <p className="text-xs sm:text-sm text-gray-400 mb-3">
            Enter video URLs (one per line) - supports YouTube, Vimeo, and direct video links
          </p>
          
          <textarea
            id="videos"
            value={videoUrlsText}
            onChange={(e) => setVideoUrlsText(e.target.value)}
            className="w-full h-64 px-4 py-3 bg-gray-900/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-[#b8a887] focus:border-transparent resize-none font-mono text-sm"
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
      </div>

      {/* Model Selector */}
      <ModelSelector 
        onModelChange={handleModelSettingsChange}
        initialSettings={modelSettings}
      />

      {/* Submit Section */}
      <div className="space-y-4">
        {/* Force Refresh Option - Hidden for now but functionality preserved */}
        {/* 
        <div className="flex items-center gap-3 bg-[#b8a887]/10 border border-[#b8a887]/20 rounded-lg p-4">
          <input
            type="checkbox"
            id="forceRefresh"
            checked={forceRefresh}
            onChange={(e) => setForceRefresh(e.target.checked)}
            className="w-5 h-5 text-[#b8a887] bg-gray-900 border-gray-600 rounded focus:ring-[#b8a887] focus:ring-2"
          />
          <label htmlFor="forceRefresh" className="flex-1 cursor-pointer">
            <span className="text-[#b8a887] font-medium">Force Refresh Transcripts</span>
            <p className="text-xs text-[#b8a887]/70 mt-1">
              Check this to bypass cache and fetch fresh transcripts (slower but ensures latest content)
            </p>
          </label>
        </div>
        */}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-200 ${
            loading 
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
              : 'bg-[#b8a887] hover:bg-[#a09775] text-[#0e1e2d] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
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