'use client';

import { useState, useEffect } from 'react';

export default function YouTubeConnect() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    checkConnection();
    
    // Check URL params for OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube_connected') === 'true') {
      setIsConnected(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('error')) {
      console.error('YouTube connection error:', params.get('error'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  
  const checkConnection = async () => {
    try {
      const response = await fetch('/api/auth/youtube/check');
      const data = await response.json();
      setIsConnected(data.connected);
    } catch (error) {
      console.error('Failed to check connection:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleConnect = () => {
    window.location.href = '/api/auth/youtube';
  };
  
  const handleDisconnect = async () => {
    try {
      await fetch('/api/auth/youtube/disconnect', { method: 'POST' });
      setIsConnected(false);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };
  
  return (
    <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <div>
            <h3 className="text-white font-medium">YouTube Account</h3>
            <p className="text-sm text-gray-400">
              {isLoading ? 'Checking connection...' : 
               isConnected ? '✅ Connected - No bot detection' : 
               '⚠️ Connect to bypass bot detection'}
            </p>
          </div>
        </div>
        
        {!isLoading && (
          isConnected ? (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 animate-pulse"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Connect YouTube
            </button>
          )
        )}
      </div>
      
      {!isConnected && !isLoading && (
        <div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded text-xs text-yellow-300">
          <p className="font-semibold">⚡ One-click solution to bypass "Sign in to confirm you're not a bot"</p>
          <p className="mt-1 text-yellow-300/80">Connect your YouTube account and never see bot detection errors again.</p>
        </div>
      )}
    </div>
  );
} 