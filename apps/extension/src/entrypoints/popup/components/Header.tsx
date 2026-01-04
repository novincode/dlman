import { usePopupStore } from '../store';
import { Download, Power } from 'lucide-react';

export function Header() {
  const { settings, toggleEnabled } = usePopupStore();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b bg-card">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Download className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-semibold text-base">DLMan</h1>
          <p className="text-xs text-muted-foreground">Download Manager</p>
        </div>
      </div>
      
      <button
        onClick={toggleEnabled}
        className={`
          p-2 rounded-lg transition-colors
          ${settings?.enabled 
            ? 'bg-primary/10 text-primary hover:bg-primary/20' 
            : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }
        `}
        title={settings?.enabled ? 'Disable extension' : 'Enable extension'}
      >
        <Power className="w-5 h-5" />
      </button>
    </header>
  );
}
