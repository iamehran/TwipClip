'use client';

import { useState, useEffect } from 'react';
import { Shield, CheckCircle, AlertCircle, Edit2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import YouTubeCookieUpload from './YouTubeCookieUpload';

interface AuthStatus {
  authenticated: boolean;
  browser?: string;
  expiresAt?: number;
  daysRemaining?: number;
}

interface YouTubeAuthProps {
  onAuthChange?: (authenticated: boolean) => void;
}

// Modal component that uses portal
function UploadModal({ show, onClose, authStatus }: { show: boolean; onClose: () => void; authStatus: AuthStatus }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!show || !mounted) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 999999 }}
    >
      <div 
        className="relative bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[calc(100vh-2rem)] overflow-y-auto border border-gray-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-yellow-500" />
            {authStatus.authenticated ? 'Update YouTube Cookies' : 'YouTube Authentication Setup'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {authStatus.authenticated && (
          <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
            <p className="text-sm text-blue-300">
              Your current cookies expire in {authStatus.daysRemaining} days. Upload new cookies to extend authentication.
            </p>
          </div>
        )}
        
        <YouTubeCookieUpload />
      </div>
    </div>,
    document.body
  );
}

export default function YouTubeAuth({ onAuthChange }: YouTubeAuthProps) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/youtube/status');
      const data = await response.json();
      setAuthStatus(data);
      onAuthChange?.(data.authenticated);
    } catch (error) {
      console.error('Error checking auth status:', error);
      setAuthStatus({ authenticated: false });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setShowUpload(true);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="hidden sm:inline">Checking...</span>
      </div>
    );
  }

  return (
    <>
      {authStatus.authenticated ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-white hidden sm:inline">YouTube Authentication</span>
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-green-500">Active</span>
          </div>
          <button
            onClick={handleEdit}
            className="p-1.5 hover:bg-gray-700/50 rounded transition-colors group"
            title="Edit cookies"
          >
            <Edit2 className="w-3.5 h-3.5 text-gray-400 group-hover:text-white" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/50 rounded-lg transition-colors"
        >
          <Shield className="w-4 h-4 text-yellow-500" />
          <span className="text-sm font-medium text-yellow-500">Setup Auth</span>
        </button>
      )}

      {/* Upload Modal */}
      <UploadModal 
        show={showUpload} 
        onClose={() => setShowUpload(false)} 
        authStatus={authStatus}
      />
    </>
  );
} 