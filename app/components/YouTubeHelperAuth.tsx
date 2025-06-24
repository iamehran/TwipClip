'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Copy, Download, RefreshCw, Key } from 'lucide-react';

interface AuthStatus {
  authenticated: boolean;
  browser?: string;
  platform?: string;
  daysRemaining?: number;
  authenticatedAt?: number;
  expiresAt?: number;
}

export default function YouTubeHelperAuth() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ authenticated: false });
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    checkAuthStatus();
    // Check platform only on client side
    if (typeof window !== 'undefined' && navigator) {
      setIsMac(navigator.platform.toLowerCase().includes('mac'));
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/youtube/helper');
      const data = await response.json();
      setAuthStatus(data);
    } catch (error) {
      console.error('Failed to check auth status:', error);
    }
  };

  const handleActivateToken = async () => {
    if (!token.trim()) {
      setError('Please paste your authentication token');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/auth/youtube/helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message);
        setToken('');
        setTimeout(() => {
          checkAuthStatus();
          setSuccess('');
        }, 2000);
      } else {
        setError(data.error || 'Failed to activate token');
      }
    } catch (error) {
      setError('Failed to activate token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getHelperDownloadLink = () => {
    return isMac ? '/helper/TwipClipAuth-mac' : '/helper/TwipClipAuth-win.exe';
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Key className="w-5 h-5" />
          YouTube Authentication
        </h2>
        {authStatus.authenticated && (
          <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
            <CheckCircle className="w-4 h-4" />
            Active
          </span>
        )}
      </div>

      {authStatus.authenticated ? (
        <div className="space-y-3">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-800 dark:text-green-200">
              ✅ YouTube authentication is active and working!
            </p>
            <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <p>Browser: {authStatus.browser}</p>
              <p>Platform: {authStatus.platform}</p>
              <p>Authenticated: {authStatus.authenticatedAt && formatDate(authStatus.authenticatedAt)}</p>
              <p>Expires: {authStatus.expiresAt && formatDate(authStatus.expiresAt)} ({authStatus.daysRemaining} days remaining)</p>
            </div>
          </div>

          {authStatus.daysRemaining && authStatus.daysRemaining < 7 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Your authentication expires soon. Run the helper again to refresh.
              </p>
            </div>
          )}

          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Need to re-authenticate?
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  YouTube authentication required for video downloads
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  This helps bypass YouTube's bot detection and enables reliable video downloads.
                </p>
              </div>
            </div>
          </div>

          {(showInstructions || !authStatus.authenticated) && (
            <>
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Quick Setup (2 minutes):</h3>
                
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      1
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Download the TwipClip Auth Helper</p>
                      <a
                        href={getHelperDownloadLink()}
                        download
                        className="inline-flex items-center gap-2 mt-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <Download className="w-4 h-4" />
                        Download for {isMac ? 'macOS' : 'Windows'}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      2
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Run the helper and follow instructions</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        It will extract YouTube cookies from your browser
                      </p>
                      {!isMac && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          <strong>Windows Users:</strong> Firefox or Edge recommended. Chrome may have compatibility issues.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      3
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Paste the token below and activate</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Authentication Token
                </label>
                <textarea
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your token here (starts with TWIPCLIP_AUTH_V1:...)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-sm font-mono"
                  rows={3}
                />
                
                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}
                
                {success && (
                  <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
                )}

                <button
                  onClick={handleActivateToken}
                  disabled={loading || !token.trim()}
                  className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Activating...
                    </span>
                  ) : (
                    'Activate Authentication'
                  )}
                </button>
              </div>

              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  <strong>Privacy:</strong> Your YouTube cookies stay on your device. The helper only extracts them locally and encrypts them for secure transfer.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
