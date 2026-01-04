import { Settings, ExternalLink } from 'lucide-react';

export function Footer() {
  const openDLMan = () => {
    // Try to focus DLMan window or show instructions
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon/128.png',
      title: 'Open DLMan',
      message: 'Open the DLMan desktop app to manage downloads',
    });
  };

  const openOptions = () => {
    browser.runtime.openOptionsPage();
  };

  return (
    <footer className="flex items-center justify-between px-4 py-2 border-t bg-card">
      <button
        onClick={openDLMan}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
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
