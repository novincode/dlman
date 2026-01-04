import { usePopupStore } from '../store';
import { Globe, ToggleLeft, ToggleRight } from 'lucide-react';

export function SiteToggle() {
  const { currentHostname, isSiteDisabled, toggleSite, settings } = usePopupStore();

  if (!settings?.enabled || !currentHostname) {
    return null;
  }

  return (
    <div className="bg-card rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium truncate max-w-[180px]" title={currentHostname}>
              {currentHostname}
            </p>
            <p className="text-xs text-muted-foreground">
              {isSiteDisabled ? 'DLMan disabled on this site' : 'DLMan enabled on this site'}
            </p>
          </div>
        </div>
        
        <button
          onClick={toggleSite}
          className={`
            p-1 rounded-md transition-colors
            ${isSiteDisabled 
              ? 'text-muted-foreground hover:text-foreground' 
              : 'text-primary hover:text-primary/80'
            }
          `}
          title={isSiteDisabled ? 'Enable on this site' : 'Disable on this site'}
        >
          {isSiteDisabled ? (
            <ToggleLeft className="w-8 h-8" />
          ) : (
            <ToggleRight className="w-8 h-8" />
          )}
        </button>
      </div>
    </div>
  );
}
