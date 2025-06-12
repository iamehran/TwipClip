'use client';

import { useState, useEffect } from 'react';

export default function YouTubeConnect() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  
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
  
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 rounded-lg">
        <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-white rounded-full" />
      </div>
    );
  }
  
  return (
    <div className="relative">
      <button
        onClick={isConnected ? handleDisconnect : handleConnect}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
          isConnected 
            ? 'bg-green-900/30 hover:bg-green-900/40 text-green-400 border border-green-700/50' 
            : 'bg-red-900/30 hover:bg-red-900/40 text-red-400 border border-red-700/50'
        }`}
      >
        <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
        <span className="hidden sm:inline">{isConnected ? 'Connected' : 'Connect'}</span>
        <span className="sm:hidden">{isConnected ? '✓' : '+'}</span>
      </button>
      
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute top-full right-0 mt-2 w-48 sm:w-64 p-2 sm:p-3 bg-[#0e1e2d] border border-[#b8a887]/20 rounded-lg shadow-xl z-50">
          <p className="text-xs text-gray-300">
            {isConnected 
              ? 'YouTube protection is active. Click to disconnect.'
              : 'Connect to bypass YouTube bot detection and process videos without interruption.'}
          </p>
        </div>
      )}
    </div>
  );
} 