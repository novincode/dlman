/**
 * System Tray and Native Menu Setup for DLMan
 * 
 * This module sets up:
 * - System tray icon with menu (menu bar icon on macOS, system tray on Windows/Linux)
 * - Native application menu (File, Edit, View, Help menus)
 * - Window close behavior (minimize to tray instead of quit)
 */

import { TrayIcon } from '@tauri-apps/api/tray';
import { Menu, MenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { defaultWindowIcon } from '@tauri-apps/api/app';
import { exit } from '@tauri-apps/plugin-process';
import { useUIStore } from '@/stores/ui';
import { useQueueStore, selectQueuesArray } from '@/stores/queues';
import { getAppVersion } from '@/lib/version';

// Track if tray has been initialized
let trayInitialized = false;
let trayIcon: TrayIcon | null = null;

/**
 * Initialize the system tray icon with menu
 */
export async function initSystemTray(): Promise<void> {
  if (trayInitialized) {
    console.log('System tray already initialized');
    return;
  }

  try {
    const icon = await defaultWindowIcon();
    
    // Create tray menu items
    const trayMenu = await Menu.new({
      items: [
        {
          id: 'new-download',
          text: 'New Download',
          accelerator: 'CmdOrCtrl+N',
          action: () => {
            showMainWindow();
            useUIStore.getState().setShowNewDownloadDialog(true);
          },
        },
        {
          id: 'batch-import',
          text: 'Batch Import',
          accelerator: 'CmdOrCtrl+Shift+N',
          action: () => {
            showMainWindow();
            useUIStore.getState().setShowBatchImportDialog(true);
          },
        },
        {
          item: 'Separator',
        },
        {
          id: 'show-window',
          text: 'Show DLMan',
          action: showMainWindow,
        },
        {
          item: 'Separator',
        },
        {
          id: 'settings',
          text: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          action: () => {
            showMainWindow();
            useUIStore.getState().setShowSettingsDialog(true);
          },
        },
        {
          item: 'Separator',
        },
        {
          id: 'quit',
          text: 'Quit DLMan',
          accelerator: 'CmdOrCtrl+Q',
          action: async () => {
            await exit(0);
          },
        },
      ],
    });

    // Create the tray icon
    trayIcon = await TrayIcon.new({
      id: 'dlman-tray',
      icon: icon || undefined,
      tooltip: 'DLMan - Download Manager',
      menu: trayMenu,
      menuOnLeftClick: false, // Left click shows window, right click shows menu
      action: (event) => {
        if (event.type === 'Click' && event.button === 'Left') {
          showMainWindow();
        }
      },
    });

    // On macOS, set icon as template for proper menu bar appearance
    await trayIcon.setIconAsTemplate(true);

    trayInitialized = true;
    console.log('System tray initialized successfully');
  } catch (err) {
    console.error('Failed to initialize system tray:', err);
  }
}

/**
 * Initialize the native application menu
 */
export async function initAppMenu(): Promise<void> {
  try {
    const { current: version } = await getAppVersion();
    
    // Create About submenu (required first on macOS)
    const aboutSubmenu = await Submenu.new({
      text: 'DLMan',
      items: [
        await PredefinedMenuItem.new({
          item: {
            About: {
              name: 'DLMan',
              version,
              copyright: '© 2025 DLMan Contributors',
              website: 'https://github.com/novincode/dlman',
            },
          },
        }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await MenuItem.new({
          id: 'settings',
          text: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          action: () => {
            useUIStore.getState().setShowSettingsDialog(true);
          },
        }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await PredefinedMenuItem.new({ item: 'Services' }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await PredefinedMenuItem.new({ item: 'Hide' }),
        await PredefinedMenuItem.new({ item: 'HideOthers' }),
        await PredefinedMenuItem.new({ item: 'ShowAll' }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await PredefinedMenuItem.new({ item: 'Quit' }),
      ],
    });

    // Create File submenu
    const fileSubmenu = await Submenu.new({
      text: 'File',
      items: [
        await MenuItem.new({
          id: 'new-download',
          text: 'New Download',
          accelerator: 'CmdOrCtrl+N',
          action: () => {
            useUIStore.getState().setShowNewDownloadDialog(true);
          },
        }),
        await MenuItem.new({
          id: 'batch-import',
          text: 'Batch Import...',
          accelerator: 'CmdOrCtrl+Shift+N',
          action: () => {
            useUIStore.getState().setShowBatchImportDialog(true);
          },
        }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await MenuItem.new({
          id: 'export-downloads',
          text: 'Export Downloads...',
          accelerator: 'CmdOrCtrl+E',
          action: () => {
            // TODO: Implement export
            console.log('Export downloads');
          },
        }),
        await MenuItem.new({
          id: 'import-downloads',
          text: 'Import Downloads...',
          accelerator: 'CmdOrCtrl+I',
          action: () => {
            // TODO: Implement import
            console.log('Import downloads');
          },
        }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await PredefinedMenuItem.new({ item: 'CloseWindow' }),
      ],
    });

    // Create Edit submenu
    const editSubmenu = await Submenu.new({
      text: 'Edit',
      items: [
        await PredefinedMenuItem.new({ item: 'Undo' }),
        await PredefinedMenuItem.new({ item: 'Redo' }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await PredefinedMenuItem.new({ item: 'Cut' }),
        await PredefinedMenuItem.new({ item: 'Copy' }),
        await PredefinedMenuItem.new({ item: 'Paste' }),
        await PredefinedMenuItem.new({ item: 'SelectAll' }),
      ],
    });

    // Create Queues submenu
    const queuesSubmenu = await createQueuesSubmenu();

    // Create View submenu
    const viewSubmenu = await Submenu.new({
      text: 'View',
      items: [
        await MenuItem.new({
          id: 'toggle-sidebar',
          text: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          action: () => {
            useUIStore.getState().toggleSidebar();
          },
        }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await PredefinedMenuItem.new({ item: 'Fullscreen' }),
      ],
    });

    // Create Window submenu
    const windowSubmenu = await Submenu.new({
      text: 'Window',
      items: [
        await PredefinedMenuItem.new({ item: 'Minimize' }),
        await PredefinedMenuItem.new({ item: 'Maximize' }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await MenuItem.new({
          id: 'minimize-to-tray',
          text: 'Minimize to Tray',
          action: async () => {
            const window = getCurrentWindow();
            await window.hide();
          },
        }),
      ],
    });
    await windowSubmenu.setAsWindowsMenuForNSApp();

    // Create Help submenu
    const helpSubmenu = await Submenu.new({
      text: 'Help',
      items: [
        await MenuItem.new({
          id: 'documentation',
          text: 'Documentation',
          action: () => {
            import('@tauri-apps/plugin-shell').then(({ open }) => {
              open('https://github.com/novincode/dlman#readme');
            });
          },
        }),
        await MenuItem.new({
          id: 'report-issue',
          text: 'Report an Issue',
          action: () => {
            import('@tauri-apps/plugin-shell').then(({ open }) => {
              open('https://github.com/novincode/dlman/issues');
            });
          },
        }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await MenuItem.new({
          id: 'check-updates',
          text: 'Check for Updates...',
          action: () => {
            useUIStore.getState().setShowAboutDialog(true);
          },
        }),
      ],
    });
    await helpSubmenu.setAsHelpMenuForNSApp();

    // Create main menu
    const menu = await Menu.new({
      items: [
        aboutSubmenu,
        fileSubmenu,
        editSubmenu,
        queuesSubmenu,
        viewSubmenu,
        windowSubmenu,
        helpSubmenu,
      ],
    });

    await menu.setAsAppMenu();
    console.log('Native app menu initialized successfully');
  } catch (err) {
    console.error('Failed to initialize app menu:', err);
  }
}

/**
 * Create the Queues submenu with dynamic queue items
 */
async function createQueuesSubmenu(): Promise<Submenu> {
  const queues = selectQueuesArray(useQueueStore.getState());
  
  const queueItems: (MenuItem | PredefinedMenuItem)[] = [
    await MenuItem.new({
      id: 'manage-queues',
      text: 'Manage Queues...',
      action: () => {
        useUIStore.getState().setShowQueueManagerDialog(true);
      },
    }),
    await PredefinedMenuItem.new({ item: 'Separator' }),
  ];

  // Add queue items
  for (const queue of queues) {
    queueItems.push(
      await MenuItem.new({
        id: `queue-${queue.id}`,
        text: `Start: ${queue.name}`,
        action: () => {
          // TODO: Start specific queue
          console.log('Start queue:', queue.name);
        },
      })
    );
  }

  if (queues.length === 0) {
    queueItems.push(
      await MenuItem.new({
        id: 'no-queues',
        text: 'No queues available',
        enabled: false,
      })
    );
  }

  return Submenu.new({
    text: 'Queues',
    items: queueItems,
  });
}

/**
 * Show the main window and bring it to front
 */
export async function showMainWindow(): Promise<void> {
  try {
    const window = getCurrentWindow();
    await window.show();
    await window.unminimize();
    await window.setFocus();
  } catch (err) {
    console.error('Failed to show main window:', err);
  }
}

/**
 * Hide the main window to tray
 */
export async function hideToTray(): Promise<void> {
  try {
    const window = getCurrentWindow();
    await window.hide();
  } catch (err) {
    console.error('Failed to hide to tray:', err);
  }
}

/**
 * Setup window close handler to minimize to tray instead of closing
 */
export async function setupCloseHandler(): Promise<void> {
  try {
    const window = getCurrentWindow();
    
    // Listen for close request
    await window.onCloseRequested(async (event) => {
      // Prevent default close behavior
      event.preventDefault();
      // Hide to tray instead
      await hideToTray();
    });
    
    console.log('Window close handler set up - will minimize to tray');
  } catch (err) {
    console.error('Failed to setup close handler:', err);
  }
}

/**
 * Clean up system tray on app shutdown
 */
export async function cleanupSystemTray(): Promise<void> {
  if (trayIcon) {
    await trayIcon.close();
    trayIcon = null;
    trayInitialized = false;
  }
}

/**
 * Initialize all system integrations (tray, menu, close handler)
 */
export async function initSystemIntegrations(): Promise<void> {
  await Promise.all([
    initSystemTray(),
    initAppMenu(),
    setupCloseHandler(),
  ]);
}
