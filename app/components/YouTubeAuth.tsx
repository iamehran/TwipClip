'use client';

import { useState, useEffect } from 'react';

interface YouTubeAuthProps {
  onAuthChange?: (authenticated: boolean) => void;
}

export default function YouTubeAuth({ onAuthChange }: YouTubeAuthProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/youtube/extract-cookies');
      const data = await response.json();
      setIsAuthenticated(data.authenticated);
      onAuthChange?.(data.authenticated);
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectClick = () => {
    setShowInstructions(true);
    // Open YouTube in a new tab
    window.open('https://www.youtube.com', '_blank');
  };

  const handleDisconnect = async () => {
    try {
      const response = await fetch('/api/auth/youtube/disconnect', {
        method: 'POST'
      });
      
      if (response.ok) {
        setIsAuthenticated(false);
        onAuthChange?.(false);
      } else {
        console.error('Failed to disconnect');
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  // Script to inject into YouTube page (for manual approach)
  const getCookieScript = `
// Copy and paste this into YouTube's console
(function() {
  const cookies = document.cookie.split(';').map(c => {
    const [name, value] = c.trim().split('=');
    return {
      domain: '.youtube.com',
      name: name,
      value: value,
      path: '/',
      secure: true,
      httpOnly: false
    };
  });
  
  // Send to TwipClip
  fetch('${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/youtube/extract-cookies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookies })
  }).then(() => {
    alert('YouTube authentication successful! You can close this tab.');
  }).catch(() => {
    alert('Failed to authenticate. Please try again.');
  });
})();
  `.trim();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm">Checking...</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {isAuthenticated ? (
          <>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-green-500">YouTube Connected</span>
            </div>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-md transition-colors"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={handleConnectClick}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            Connect YouTube
          </button>
        )}
      </div>

      {/* Instructions Modal */}
      {showInstructions && !isAuthenticated && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-white mb-4">Connect Your YouTube Account</h3>
            
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-lg font-medium text-white mb-2">Automatic Method (Recommended)</h4>
                <p className="text-gray-400 mb-3">Install our browser extension for automatic cookie sync:</p>
                <div className="flex gap-3">
                  <a
                    href="#"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Browser extension coming soon! Please use the manual method for now.');
                    }}
                  >
                    Install Chrome Extension
                  </a>
                  <a
                    href="#"
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Browser extension coming soon! Please use the manual method for now.');
                    }}
                  >
                    Install Firefox Extension
                  </a>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-lg font-medium text-white mb-2">Manual Method</h4>
                <ol className="list-decimal list-inside space-y-2 text-gray-400">
                  <li>Sign in to YouTube in the tab that just opened</li>
                  <li>Open Developer Console (F12 or Right-click → Inspect → Console)</li>
                  <li>Copy and paste this code:</li>
                </ol>
                
                <div className="mt-3 relative">
                  <pre className="bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                    <code className="text-green-400">{getCookieScript}</code>
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getCookieScript);
                      alert('Code copied to clipboard!');
                    }}
                    className="absolute top-2 right-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
                  >
                    Copy
                  </button>
                </div>
                
                <p className="text-yellow-400 text-sm mt-3">
                  ⚠️ Only use this on youtube.com. Never paste code you don't understand into the console.
                </p>
              </div>

              <div className="flex justify-between items-center mt-6">
                <button
                  onClick={() => setShowInstructions(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={checkAuthStatus}
                  className="px-4 py-2 bg-[#b8a887] hover:bg-[#a09775] text-[#0e1e2d] rounded-lg transition-colors"
                >
                  Check Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 