'use client';

import { useState } from 'react';
import SearchForm from './components/SearchForm';
import VideoResult from './components/VideoResult';
import LoadingState from './components/LoadingState';
import ErrorDisplay from './components/ErrorDisplay';
import ExportButton from './components/ExportButton';
import YouTubeConnect from './components/YouTubeConnect';
import ThoughtleadrLogo from './components/ThoughtleadrLogo';

interface VideoClip {
  videoId: string;
  title: string;
  thumbnail: string;
  startTime: number;
  endTime: number;
  matchScore: number;
  transcriptText: string;
  channelTitle: string;
  clipDuration: string;
  matchMethod: 'semantic' | 'keyword' | 'phrase';
  confidence: number;
  transcriptQuality: 'high' | 'medium' | 'low';
  transcriptSource: string;
  downloadPath: string;
  downloadSuccess: boolean;
}

interface SearchResults {
  [key: string]: {
    tweet: string;
    clips: VideoClip[];
  };
}

export default function Home() {
  const [results, setResults] = useState<SearchResults>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [lastSearch, setLastSearch] = useState<{ threadContent: string; videoUrls: string[] } | null>(null);
  const [showSearchForm, setShowSearchForm] = useState(true);

  const handleSearch = async (threadContent: string, videoUrls: string[], forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);
    setResults({});
    setStats(null);
    setLoadingProgress(0);
    setLoadingStatus('Initializing...');
    setLastSearch({ threadContent, videoUrls });
    setShowSearchForm(false); // Hide search form when processing starts

    try {
      // No need to parse - send the full thread content
      if (!threadContent.trim()) {
        throw new Error('Please enter some content');
      }

      if (videoUrls.length === 0) {
        throw new Error('Please provide at least one video URL');
      }

      console.log('Sending to process API:', { thread: threadContent, videos: videoUrls });

      // Simulate progress updates
      setLoadingStatus('Starting intelligent processing...');
      setLoadingProgress(10);

      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          thread: threadContent,  // Full thread content with dashes
          videos: videoUrls       // Array of video URLs
        }),
      });

      setLoadingProgress(30);
      setLoadingStatus('Processing videos with AI...');

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Processing failed');
      }

      setLoadingProgress(90);
      setLoadingStatus('Finalizing results...');

      // Convert the new format to match the UI expectations
      const formattedResults: SearchResults = {};
      if (data.matches && data.matches.length > 0) {
        data.matches.forEach((match: any, index: number) => {
          const tweetKey = `tweet-${index + 1}`;
          if (!formattedResults[tweetKey]) {
            formattedResults[tweetKey] = {
              tweet: match.tweet || '',
              clips: []
            };
          }
          
          formattedResults[tweetKey].clips.push({
            videoId: match.videoUrl,
            title: 'AI Matched Clip',
            thumbnail: '/default-thumbnail.jpg',
            startTime: match.startTime,
            endTime: match.endTime,
            matchScore: match.confidence || 0,
            transcriptText: match.text || '',
            channelTitle: 'Video',
            clipDuration: `${match.endTime - match.startTime}s`,
            matchMethod: 'semantic' as const,
            confidence: match.confidence || 0,
            transcriptQuality: 'high' as const,
            transcriptSource: 'whisper',
            downloadPath: match.downloadPath,
            downloadSuccess: match.downloadSuccess
          });
        });
      }

      setResults(formattedResults);
      setStats(data.summary || null);
      
      setLoadingProgress(100);
      setLoadingStatus('Complete!');
      
      // Reset progress after a short delay
      setTimeout(() => {
        setLoadingProgress(0);
        setLoadingStatus('');
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Processing error:', err);
      setShowSearchForm(true); // Show form again on error
    } finally {
      setLoading(false);
    }
  };

  const totalClips = Object.values(results).reduce((sum, r) => sum + r.clips.length, 0);

  return (
    <main className="min-h-screen bg-[#0e1e2d]">
      {/* Top Navigation Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0e1e2d]/90 backdrop-blur-md border-b border-gray-800">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-[#b8a887]">
                TwipClip
              </h1>
              <span className="hidden sm:inline text-gray-500 text-sm">by</span>
              <ThoughtleadrLogo className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            
            {/* YouTube Connect */}
            <YouTubeConnect />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 pt-20 pb-8">
        <div className="max-w-6xl mx-auto">
          {/* Header - Only show when search form is visible */}
          {showSearchForm && (
            <div className="text-center mb-10">
              <h2 className="text-xl sm:text-2xl md:text-3xl tracking-wide font-medium font-antipasto mx-auto max-w-4xl px-4">
                <span className="text-white">Get </span>
                <span className="text-[#b8a887]">Perfect Video Clips</span>
                <span className="text-white"> For Your Thread</span>
              </h2>
              <div className="mt-4 sm:mt-6 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-6 gap-y-2 text-xs sm:text-sm text-gray-400 px-2">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#b8a887] rounded-full"></span>
                  <span className="hidden sm:inline">Enhanced </span>AI Matching
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#b8a887]/70 rounded-full"></span>
                  Custom <span className="hidden sm:inline">Video </span>Input
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#b8a887]/50 rounded-full"></span>
                  Precise <span className="hidden sm:inline">Clip </span>Extraction
                </span>
              </div>
            </div>
          )}

          {/* Edit Button - Show when form is hidden */}
          {!showSearchForm && !loading && (
            <div className="mb-6 flex justify-center">
              <button
                onClick={() => setShowSearchForm(true)}
                className="px-6 py-3 bg-[#b8a887] hover:bg-[#a09775] text-[#0e1e2d] rounded-lg font-medium transition-all transform hover:scale-105 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Search
              </button>
            </div>
          )}

          {/* Search Form - Collapsible */}
          {showSearchForm && (
            <div className="mb-8">
              <SearchForm onSearch={handleSearch} loading={loading} />
            </div>
          )}

          {/* Error Display */}
          {error && (
            <ErrorDisplay 
              error={error} 
              onRetry={lastSearch ? () => handleSearch(lastSearch.threadContent, lastSearch.videoUrls) : undefined} 
            />
          )}

          {/* Loading State */}
          {loading && (
            <LoadingState 
              status={loadingStatus}
              progress={loadingProgress}
              currentVideo={loadingProgress > 30 ? 1 : undefined}
              totalVideos={loadingProgress > 30 ? 3 : undefined}
            />
          )}

          {/* Results Summary */}
          {!loading && totalClips > 0 && (
            <div className="mt-8 p-4 sm:p-6 bg-gray-800/30 rounded-lg border border-gray-700/50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h3 className="text-base sm:text-lg font-semibold text-white">Results Summary</h3>
                <ExportButton data={results} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-center">
                <div>
                  <p className="text-2xl sm:text-3xl font-bold text-[#b8a887]">
                    {Object.keys(results).length}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400">Tweets Processed</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-bold text-[#b8a887]/80">
                    {totalClips}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400">Clips Found</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-bold text-[#b8a887]/60">
                    {stats?.videosProcessed || 0}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400">Videos Analyzed</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-bold text-[#b8a887]/40">
                    {stats?.avgConfidence ? `${(stats.avgConfidence * 100).toFixed(0)}%` : '0%'}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400">Avg Confidence</p>
                </div>
              </div>
            </div>
          )}

          {/* Results Display */}
          {!loading && Object.entries(results).map(([tweetKey, tweetData]) => (
            <div key={tweetKey} className="mt-8">
              <div className="bg-gray-800/30 rounded-lg p-4 sm:p-6 border border-gray-700/50">
                {/* Tweet Header */}
                <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-[#b8a887] rounded-full flex items-center justify-center text-[#0e1e2d] font-bold text-sm sm:text-base">
                    {tweetKey.replace('tweet-', '')}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-base sm:text-lg leading-relaxed">{tweetData.tweet}</p>
                    <p className="text-xs sm:text-sm text-gray-500 mt-2">
                      {tweetData.clips.length} matching {tweetData.clips.length === 1 ? 'clip' : 'clips'} found
                    </p>
                  </div>
                </div>

                {/* Video Clips */}
                {tweetData.clips.length > 0 ? (
                  <div className="grid gap-4">
                    {tweetData.clips.map((clip, index) => (
                      <VideoResult key={`${clip.videoId}-${index}`} clip={clip} />
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No matching clips found for this tweet
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Performance Stats */}
          {stats && !loading && (
            <div className="mt-12 p-4 sm:p-6 bg-gray-800/20 rounded-lg border border-gray-700/30">
              <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Performance Statistics</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                <div>
                  <p className="text-gray-400">Processing Time</p>
                  <p className="text-white font-mono">{(stats.processingTimeMs / 1000).toFixed(2)}s</p>
                </div>
                <div>
                  <p className="text-gray-400">Videos Transcribed</p>
                  <p className="text-white font-mono">{stats.videosTranscribed || 0}</p>
                </div>
                <div>
                  <p className="text-gray-400">Total Segments Analyzed</p>
                  <p className="text-white font-mono">{stats.totalSegments || 0}</p>
                </div>
                <div>
                  <p className="text-gray-400">AI Model Used</p>
                  <p className="text-white font-mono">{stats.aiModel || 'Claude Opus 4'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Transcription Quality</p>
                  <p className="text-white font-mono">{stats.transcriptionQuality || 'High'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Cache Hit Rate</p>
                  <p className="text-white font-mono">{stats.cacheHitRate || '0%'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
