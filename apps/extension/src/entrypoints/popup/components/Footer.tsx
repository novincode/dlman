import { Settings, ExternalLink, Loader2 } from 'lucide-react';
import { useState } from 'react';

export function Footer() {
  const [isOpening, setIsOpening] = useState(false);

  const openDLMan = async () => {
    setIsOpening(true);
    
    try {
      // Try to open via custom URL scheme (works on macOS/Windows if registered)
      // DLMan registers 'dlman://' protocol handler
      const opened = await tryOpenProtocol('dlman://open');
      
      if (!opened) {
        // Fallback: Show helpful message
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icon/128.png',
          title: 'Open DLMan',
          message: 'Please open the DLMan app from your Applications folder',
        });
      }
    } finally {
      setIsOpening(false);
    }
  };

  const tryOpenProtocol = async (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      // Create a hidden iframe to test protocol handler
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      
      let handled = false;
      
      // Set timeout - if we're still here, the protocol wasn't handled
      const timeout = setTimeout(() => {
        if (!handled) {
          document.body.removeChild(iframe);
          resolve(false);
        }
      }, 500);
      
      // Try to navigate the iframe
      try {
        iframe.contentWindow?.location.replace(url);
        // If we're still here after a short delay, it worked
        setTimeout(() => {
          handled = true;
          clearTimeout(timeout);
          document.body.removeChild(iframe);
          resolve(true);
        }, 100);
      } catch {
        clearTimeout(timeout);
        document.body.removeChild(iframe);
        resolve(false);
      }
    });
  };

  const openOptions = () => {
    browser.runtime.openOptionsPage();
  };

  return (
    <footer className="flex items-center justify-between px-4 py-2 border-t bg-card">
      <button
        onClick={openDLMan}
        disabled={isOpening}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {isOpening ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ExternalLink className="w-3.5 h-3.5" />
        )}
        Open DLMan
      </button>
      
      <button
        onClick={openOptions}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Settings className="w-3.5 h-3.5" />
        Settings
      </button>
    </footer>
  );
}
