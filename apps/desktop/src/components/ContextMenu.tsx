import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  FolderPlus,
  Settings,
  Clipboard,
  Import,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui';
import { cn, parseUrls } from '@/lib/utils';
import { setPendingClipboardUrls } from '@/lib/events';

interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  onClick?: () => void;
  separator?: boolean;
  disabled?: boolean;
  items?: ContextMenuItem[]; // For submenus
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface ContextMenuContextType {
  showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  hideContextMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within ContextMenuProvider');
  }
  return context;
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const showContextMenu = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
    // Adjust position to keep menu in viewport
    const menuWidth = 200;
    const menuHeight = items.length * 36;
    
    const adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
    const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);

    setMenu({ x: Math.max(10, adjustedX), y: Math.max(10, adjustedY), items });
  }, []);

  const hideContextMenu = useCallback(() => {
    setMenu(null);
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideContextMenu();
      }
    };

    const handleScroll = () => hideContextMenu();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideContextMenu();
    };

    if (menu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu, hideContextMenu]);

  return (
    <ContextMenuContext.Provider value={{ showContextMenu, hideContextMenu }}>
      {children}
      <AnimatePresence>
        {menu && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-[200] min-w-[180px] bg-popover border rounded-md shadow-lg py-1"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.items.map((item, index) => (
              item.separator ? (
                <div key={index} className="h-px bg-border my-1" />
              ) : (
                <button
                  key={index}
                  onClick={() => {
                    if (!item.disabled && item.onClick) {
                      item.onClick();
                      hideContextMenu();
                    }
                  }}
                  disabled={item.disabled}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left',
                    'hover:bg-accent transition-colors',
                    item.disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && (
                    <span className="text-xs text-muted-foreground">{item.shortcut}</span>
                  )}
                </button>
              )
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </ContextMenuContext.Provider>
  );
}

// Hook for global context menu (right-click on empty areas)
export function useGlobalContextMenu() {
  const { showContextMenu, hideContextMenu } = useContextMenu();
  const { setShowNewDownloadDialog, setShowBatchImportDialog, setShowQueueManagerDialog, setShowSettingsDialog } = useUIStore();

  const handleGlobalContextMenu = useCallback((e: React.MouseEvent) => {
    // Check if this is a right-click on a specific context-menu component
    const target = e.target as HTMLElement;
    
    // Don't intercept if there's a radix context menu trigger nearby or any element with context menu
    const hasRadixContextMenu = target.closest('[data-radix-context-menu-trigger], [data-state], [data-radix-collection-item]');
    if (hasRadixContextMenu) {
      hideContextMenu();
      return; // Let Radix handle it
    }
    
    // Don't intercept if clicking on download items (they have their own context menu)
    const isDownloadItem = target.closest('[data-download-item]');
    if (isDownloadItem) {
      hideContextMenu();
      return;
    }
    
    // Don't intercept if clicking on interactive elements that have their own menus
    const isInteractive = target.closest('button, a, input, textarea, [role="button"], [role="menuitem"], [role="listbox"]');
    
    // Check if we're in the main content area (for global menu)
    const isInMainContent = target.closest('[data-global-context-area]');
    
    if (!isInteractive && isInMainContent) {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, [
        {
          label: 'Add Download',
          icon: <Plus className="h-4 w-4" />,
          shortcut: '⌘N',
          onClick: () => setShowNewDownloadDialog(true),
        },
        {
          label: 'Batch Import',
          icon: <Import className="h-4 w-4" />,
          shortcut: '⌘I',
          onClick: () => setShowBatchImportDialog(true),
        },
        {
          label: 'Paste Links',
          icon: <Clipboard className="h-4 w-4" />,
          shortcut: '⌘V',
          onClick: async () => {
            try {
              const text = await navigator.clipboard.readText();
              const urls = parseUrls(text);
              if (urls.length === 0) return;
              
              setPendingClipboardUrls(urls);
              if (urls.length === 1) {
                setShowNewDownloadDialog(true);
              } else {
                setShowBatchImportDialog(true);
              }
            } catch (err) {
              console.error('Clipboard read failed:', err);
            }
          },
        },
        { separator: true, label: '' },
        {
          label: 'New Queue',
          icon: <FolderPlus className="h-4 w-4" />,
          onClick: () => setShowQueueManagerDialog(true),
        },
        { separator: true, label: '' },
        {
          label: 'Settings',
          icon: <Settings className="h-4 w-4" />,
          shortcut: '⌘,',
          onClick: () => setShowSettingsDialog(true),
        },
      ]);
    } else {
      // Hide our custom context menu if we're not handling this
      hideContextMenu();
    }
  }, [showContextMenu, hideContextMenu, setShowNewDownloadDialog, setShowBatchImportDialog, setShowQueueManagerDialog, setShowSettingsDialog]);

  return handleGlobalContextMenu;
}
