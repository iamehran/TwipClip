'use client';

import { useState } from 'react';
import SearchForm from './components/SearchForm';
import VideoResult from './components/VideoResult';
import LoadingState from './components/LoadingState';
import ErrorDisplay from './components/ErrorDisplay';
import ExportButton from './components/ExportButton';
import YouTubeConnect from './components/YouTubeConnect';

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

  const handleSearch = async (threadContent: string, videoUrls: string[], forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);
    setResults({});
    setStats(null);
    setLoadingProgress(0);
    setLoadingStatus('Initializing...');
    setLastSearch({ threadContent, videoUrls });

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
    } finally {
      setLoading(false);
    }
  };

  const totalClips = Object.values(results).reduce((sum, r) => sum + r.clips.length, 0);

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-5xl font-bold text-white mb-4">
              TwipClip
            </h1>
            <p className="text-xl text-gray-300">
              Get perfect video Clips for your thread.
            </p>
            <div className="mt-4 flex items-center justify-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Enhanced AI Matching
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                Custom Video Input
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                Precise Clip Extraction
              </span>
            </div>
          </div>

          {/* YouTube Connection */}
          <YouTubeConnect />

          {/* Search Form */}
          <SearchForm onSearch={handleSearch} loading={loading} />

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
            <div className="mt-8 p-6 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Results Summary</h3>
                <ExportButton data={results} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-3xl font-bold text-white">{Object.keys(results).length}</p>
                  <p className="text-sm text-gray-400">Tweets Processed</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">{totalClips}</p>
                  <p className="text-sm text-gray-400">Clips Found</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">{stats?.videosProcessed || 0}</p>
                  <p className="text-sm text-gray-400">Videos Analyzed</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">
                    {stats?.avgConfidence ? `${(stats.avgConfidence * 100).toFixed(0)}%` : '0%'}
                  </p>
                  <p className="text-sm text-gray-400">Avg Confidence</p>
                </div>
              </div>
            </div>
          )}

          {/* Results Display */}
          {!loading && Object.entries(results).map(([tweetKey, tweetData]) => (
            <div key={tweetKey} className="mt-8">
              <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                {/* Tweet Header */}
                <div className="flex items-start gap-4 mb-6">
                  <div className="flex-shrink-0 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                    {tweetKey.replace('tweet-', '')}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-lg leading-relaxed">{tweetData.tweet}</p>
                    <p className="text-sm text-gray-500 mt-2">
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
            <div className="mt-12 p-6 bg-gray-800/30 rounded-lg border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Performance Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
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
