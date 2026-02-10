import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { usePopupStore } from '../store';

export function AddWithApp() {
  const { isConnected } = usePopupStore();
  const [url, setUrl] = useState('');

  const handleOpenApp = () => {
    if (!url.trim()) {
      // Open app without URL
      window.location.href = 'dlman://add-download';
      return;
    }

    // Encode URL and pass it to the app
    const encodedUrl = encodeURIComponent(url.trim());
    window.location.href = `dlman://add-download?url=${encodedUrl}`;
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        setUrl(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  return (
    <div className="p-4 bg-card border-b space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add with DLMan App</h3>
        {isConnected && (
          <span className="text-xs text-green-500 flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Connected
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Use the full DLMan app to add downloads with complete control over queues, categories, and save location.
      </p>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleOpenApp()}
          placeholder="Paste URL (optional)"
          className="flex-1 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          onClick={handlePaste}
          className="px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-md"
          title="Paste from clipboard"
        >
          Paste
        </button>
      </div>

      <button
        onClick={handleOpenApp}
        disabled={!isConnected}
        className="w-full px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
      >
        <ExternalLink className="w-4 h-4" />
        Open in DLMan App
      </button>

      {!isConnected && (
        <p className="text-xs text-orange-500 text-center">
          DLMan app is not running. Please start it first.
        </p>
      )}
    </div>
  );
}
