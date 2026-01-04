import { useState, useEffect } from 'react';
import { usePopupStore } from '../store';
import { Plus, Link, Send, Check, X } from 'lucide-react';

type AddStatus = 'idle' | 'adding' | 'success' | 'error';

export function QuickAdd() {
  const { isConnected, queues, settings } = usePopupStore();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<AddStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedQueue, setSelectedQueue] = useState<string | null>(
    settings?.defaultQueueId || null
  );

  // Reset status after animation
  useEffect(() => {
    if (status === 'success' || status === 'error') {
      const timer = setTimeout(() => {
        setStatus('idle');
        setErrorMessage('');
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleAdd = async () => {
    if (!url.trim() || !isConnected) return;

    setStatus('adding');
    setErrorMessage('');
    
    try {
      const response = await browser.runtime.sendMessage({
        type: 'add-download',
        url: url.trim(),
        queueId: selectedQueue,
      }) as { success?: boolean; error?: string } | undefined;
      
      if (response?.success) {
        setStatus('success');
        setUrl('');
      } else {
        setStatus('error');
        setErrorMessage(response?.error || 'Failed to add download');
      }
    } catch (error) {
      console.error('Failed to add download:', error);
      setStatus('error');
      setErrorMessage('Connection failed');
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        setUrl(text);
      }
    } catch {
      // Clipboard access denied
    }
  };

  const isAdding = status === 'adding';
  const showSuccess = status === 'success';
  const showError = status === 'error';

  return (
    <div className={`bg-card rounded-lg border p-3 transition-all duration-300 ${
      showSuccess ? 'border-green-500/50 bg-green-500/5' : 
      showError ? 'border-red-500/50 bg-red-500/5' : ''
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {showSuccess ? (
            <div className="animate-bounce-in">
              <Check className="w-4 h-4 text-green-500" />
            </div>
          ) : showError ? (
            <X className="w-4 h-4 text-red-500" />
          ) : (
            <Plus className="w-4 h-4 text-primary" />
          )}
          <span className="text-sm font-medium">
            {showSuccess ? 'Added to DLMan!' : showError ? 'Failed' : 'Quick Add'}
          </span>
        </div>
        {showSuccess && (
          <span className="text-xs text-green-500 animate-fade-in">
            ✓ Download started
          </span>
        )}
        {showError && (
          <span className="text-xs text-red-500 animate-fade-in">
            {errorMessage}
          </span>
        )}
      </div>
      
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Paste URL to download..."
            className={`w-full pl-8 pr-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors ${
              showSuccess ? 'border-green-500/50' : showError ? 'border-red-500/50' : ''
            }`}
            disabled={!isConnected || isAdding}
          />
        </div>
        <button
          onClick={handlePaste}
          className="px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
          title="Paste from clipboard"
          disabled={!isConnected || isAdding}
        >
          Paste
        </button>
        <button
          onClick={handleAdd}
          disabled={!url.trim() || !isConnected || isAdding}
          className={`px-3 py-2 text-sm rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
            showSuccess 
              ? 'bg-green-500 text-white' 
              : showError 
              ? 'bg-red-500 text-white'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {isAdding ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : showSuccess ? (
            <Check className="w-4 h-4" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {queues.length > 1 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Queue:</span>
          <select
            value={selectedQueue || ''}
            onChange={(e) => setSelectedQueue(e.target.value || null)}
            className="text-xs bg-background border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
            disabled={!isConnected || isAdding}
          >
            <option value="">Default</option>
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
