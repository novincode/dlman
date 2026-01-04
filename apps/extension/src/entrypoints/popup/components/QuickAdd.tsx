import { useState } from 'react';
import { usePopupStore } from '../store';
import { Plus, Link, Send } from 'lucide-react';

export function QuickAdd() {
  const { isConnected, queues, settings } = usePopupStore();
  const [url, setUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<string | null>(
    settings?.defaultQueueId || null
  );

  const handleAdd = async () => {
    if (!url.trim() || !isConnected) return;

    setIsAdding(true);
    try {
      await browser.runtime.sendMessage({
        type: 'add-download',
        url: url.trim(),
        queueId: selectedQueue,
      });
      setUrl('');
    } catch (error) {
      console.error('Failed to add download:', error);
    } finally {
      setIsAdding(false);
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

  return (
    <div className="bg-card rounded-lg border p-3">
      <div className="flex items-center gap-2 mb-2">
        <Plus className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Quick Add</span>
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
            className="w-full pl-8 pr-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
            disabled={!isConnected}
          />
        </div>
        <button
          onClick={handlePaste}
          className="px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
          title="Paste from clipboard"
          disabled={!isConnected}
        >
          Paste
        </button>
        <button
          onClick={handleAdd}
          disabled={!url.trim() || !isConnected || isAdding}
          className="px-3 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {queues.length > 1 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Queue:</span>
          <select
            value={selectedQueue || ''}
            onChange={(e) => setSelectedQueue(e.target.value || null)}
            className="text-xs bg-background border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
            disabled={!isConnected}
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
