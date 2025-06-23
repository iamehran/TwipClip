'use client';

import { useState, useEffect } from 'react';
import { BrowserInfo } from '../../src/lib/browser-detector';

interface YouTubeAuthV2Props {
  onAuthChange?: (isAuthenticated: boolean, browser?: string, profile?: string) => void;
}

export default function YouTubeAuthV2({ onAuthChange }: YouTubeAuthV2Props) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedBrowser, setSelectedBrowser] = useState<string>('');
  const [selectedProfile, setSelectedProfile] = useState<string>('Default');
  const [availableBrowsers, setBrowsers] = useState<BrowserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/youtube/browser/status');
      const data = await response.json();

      if (data.authenticated) {
        setIsAuthenticated(true);
        setSelectedBrowser(data.browser || '');
        setSelectedProfile(data.profile || 'Default');
        setBrowsers(data.availableBrowsers || []);
        setWarnings(data.warnings || []);
        onAuthChange?.(true, data.browser, data.profile);
      } else {
        setIsAuthenticated(false);
        setBrowsers(data.availableBrowsers || []);
        setError(data.error);
        onAuthChange?.(false);
      }
    } catch (err) {
      console.error('Failed to check auth status:', err);
      setError('Failed to check authentication status');
    } finally {
      setLoading(false);
    }
  };

  const handleBrowserSelect = async (browser: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/auth/youtube/browser/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browser, profile: selectedProfile })
      });

      const data = await response.json();

      if (data.success) {
        setSelectedBrowser(browser);
        setIsAuthenticated(true);
        setWarnings(data.warnings || []);
        onAuthChange?.(true, browser, selectedProfile);
      } else {
        setError(data.error || 'Failed to select browser');
      }
    } catch (err) {
      console.error('Failed to select browser:', err);
      setError('Failed to select browser');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      
      await fetch('/api/auth/youtube/browser/disconnect', {
        method: 'POST'
      });

      setIsAuthenticated(false);
      setSelectedBrowser('');
      setSelectedProfile('Default');
      onAuthChange?.(false);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    } finally {
      setLoading(false);
    }
  };

  const testAuthentication = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/auth/youtube/browser/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browser: selectedBrowser, profile: selectedProfile })
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ Authentication test successful! You can download videos.');
      } else {
        setError(data.error || 'Authentication test failed');
        if (data.solutions) {
          setWarnings(data.solutions);
        }
      }
    } catch (err) {
      console.error('Failed to test authentication:', err);
      setError('Failed to test authentication');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
        <div className="h-8 bg-gray-700 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">YouTube Authentication</h3>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-gray-400 hover:text-white text-sm"
        >
          {showHelp ? 'Hide' : 'Help'}
        </button>
      </div>

      {showHelp && (
        <div className="bg-gray-700 rounded p-3 text-sm text-gray-300 space-y-2">
          <p>🔐 <strong>How it works:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>TwipClip uses your browser's YouTube cookies automatically</li>
            <li>No manual cookie extraction required</li>
            <li>Make sure you're logged into YouTube in your browser</li>
            <li>If Chrome is running on Windows, close it for best results</li>
          </ul>
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded p-3 text-sm text-red-200">
          ❌ {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-yellow-900/50 border border-yellow-500 rounded p-3 text-sm text-yellow-200">
          ⚠️ <strong>Warnings:</strong>
          <ul className="list-disc list-inside mt-1">
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {!isAuthenticated ? (
        <div className="space-y-3">
          <p className="text-gray-300 text-sm">
            Select a browser to use for YouTube authentication:
          </p>
          
          {availableBrowsers.length === 0 ? (
            <div className="text-red-400 text-sm">
              No supported browsers found on your system.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {availableBrowsers.map((browser) => (
                <button
                  key={browser.name}
                  onClick={() => handleBrowserSelect(browser.name)}
                  disabled={loading}
                  className={`
                    p-3 rounded-lg border transition-all
                    ${browser.isRunning 
                      ? 'border-yellow-500 bg-yellow-900/20 hover:bg-yellow-900/40' 
                      : 'border-gray-600 bg-gray-700 hover:bg-gray-600'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  <div className="text-white font-medium">{browser.displayName}</div>
                  {browser.isRunning && (
                    <div className="text-yellow-400 text-xs mt-1">Currently running</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-green-900/50 border border-green-500 rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-200 font-medium">
                  ✅ Connected to {availableBrowsers.find(b => b.name === selectedBrowser)?.displayName}
                </p>
                <p className="text-green-300 text-sm mt-1">
                  Profile: {selectedProfile}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={testAuthentication}
                  disabled={loading}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm text-white transition-colors"
                >
                  Test
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-sm text-white transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>

          <div className="text-gray-400 text-sm">
            <p>💡 Tips for best results:</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Make sure you're logged into YouTube in {availableBrowsers.find(b => b.name === selectedBrowser)?.displayName}</li>
              <li>If downloads fail, try closing the browser first</li>
              <li>Use the "Test" button to verify authentication works</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
} 