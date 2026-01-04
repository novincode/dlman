import { useEffect } from 'react';
import { usePopupStore } from './store';
import { Header } from './components/Header';
import { ConnectionStatus } from './components/ConnectionStatus';
import { QuickAdd } from './components/QuickAdd';
import { ActiveDownloads } from './components/ActiveDownloads';
import { SiteToggle } from './components/SiteToggle';
import { Footer } from './components/Footer';

export default function App() {
  const { init, isConnecting, settings } = usePopupStore();

  useEffect(() => {
    init();

    // Listen for progress updates from background
    interface ProgressMessage {
      type: string;
      payload?: unknown;
    }
    
    const handleMessage = (message: unknown) => {
      const msg = message as ProgressMessage;
      if (msg.type === 'download_progress') {
        usePopupStore.getState().updateProgress(msg.payload as any);
      }
    };

    browser.runtime.onMessage.addListener(handleMessage);
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage);
    };
  }, [init]);

  // Detect theme
  const isDark = settings?.theme === 'dark' || 
    (settings?.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className={`${isDark ? 'dark' : ''}`}>
      <div className="w-[360px] min-h-[400px] bg-background text-foreground flex flex-col">
        <Header />
        
        {isConnecting ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <svg
                className="animate-spin h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm">Connecting...</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <ConnectionStatus />
            <div className="flex-1 overflow-hidden flex flex-col p-3 gap-3">
              <QuickAdd />
              <SiteToggle />
              <ActiveDownloads />
            </div>
          </div>
        )}
        
        <Footer />
      </div>
    </div>
  );
}
