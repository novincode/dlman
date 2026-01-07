import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import {
  Settings,
  Folder,
  FolderOpen,
  Palette,
  Monitor,
  Moon,
  Sun,
  Gauge,
  Network,
  Info,
  Loader2,
  RotateCcw,
  Bell,
  Tag,
  ExternalLink,
  Chrome,
  RefreshCw,
  Download,
  Layers,
  Pencil,
  Plus,
  Trash2,
  MessageSquare,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import { useUIStore } from '@/stores/ui';
import { useSettingsStore } from '@/stores/settings';
import { useCategoryStore, Category } from '@/stores/categories';
import { getIconComponent } from '@/lib/categoryIcons';
import { CategoryDialog } from './CategoryDialog';
import type { Settings as SettingsType, Theme, ProxySettings } from '@/types';

type SettingsTab = 'downloads' | 'categories' | 'notifications' | 'appearance' | 'extensions' | 'proxy' | 'advanced';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'downloads', label: 'Downloads', icon: <Download className="h-4 w-4" /> },
  { id: 'categories', label: 'Categories', icon: <Tag className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> },
  { id: 'extensions', label: 'Extensions', icon: <Layers className="h-4 w-4" /> },
  { id: 'proxy', label: 'Proxy', icon: <Network className="h-4 w-4" /> },
  { id: 'advanced', label: 'Advanced', icon: <Gauge className="h-4 w-4" /> },
];

export function SettingsDialog() {
  const { showSettingsDialog, setShowSettingsDialog, consoleLogLimits, setConsoleLogLimits } = useUIStore();
  const { settings, updateSettings, setTheme } = useSettingsStore();
  const { categories, updateCategory, removeCategory } = useCategoryStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('downloads');
  const [localSettings, setLocalSettings] = useState<SettingsType>(settings);
  const [categoryPaths, setCategoryPaths] = useState<Map<string, string>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Category dialog state
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Sync local settings when dialog opens or settings change
  useEffect(() => {
    if (showSettingsDialog) {
      setLocalSettings(settings);
      // Initialize category paths from categories store
      const paths = new Map<string, string>();
      categories.forEach((cat, id) => {
        paths.set(id, cat.customPath || '');
      });
      setCategoryPaths(paths);
      setHasChanges(false);
    }
  }, [showSettingsDialog, settings, categories]);

  const handleChange = useCallback(
    <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
      setLocalSettings((prev) => ({ ...prev, [key]: value }));
      setHasChanges(true);
    },
    []
  );

  const handleCategoryPathChange = useCallback((categoryId: string, path: string) => {
    setCategoryPaths(prev => {
      const newPaths = new Map(prev);
      newPaths.set(categoryId, path);
      return newPaths;
    });
    setHasChanges(true);
  }, []);

  const handleBrowseCategoryPath = useCallback(async (categoryId: string, currentPath: string) => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Download Path for Category',
        defaultPath: currentPath || undefined,
      });
      if (selected && typeof selected === 'string') {
        handleCategoryPathChange(categoryId, selected);
      }
    } catch (err) {
      console.error('Failed to open directory picker:', err);
    }
  }, [handleCategoryPathChange]);

  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      // Update local store first (this persists to localStorage)
      updateSettings(localSettings);
      
      // Save category paths
      categoryPaths.forEach((path, categoryId) => {
        const category = categories.get(categoryId);
        if (category && path !== (category.customPath || '')) {
          updateCategory(categoryId, { customPath: path || undefined });
        }
      });
      
      // Try to sync with backend if in Tauri context
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
      if (isTauri) {
        try {
          await invoke('update_settings', { settings: localSettings });
        } catch (err) {
          // Backend sync failed, but local settings are saved
          console.warn('Backend settings sync failed:', err);
        }
      }
      
      setHasChanges(false);
      setShowSettingsDialog(false);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  }, [localSettings, categoryPaths, categories, updateSettings, updateCategory, setShowSettingsDialog]);

  const handleClose = () => {
    setShowSettingsDialog(false);
    setActiveTab('downloads');
    setLocalSettings(settings);
    setHasChanges(false);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'downloads':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Folder className="h-4 w-4" />
                Default Location
              </h3>
              <div className="pl-6 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={localSettings.default_download_path}
                    onChange={(e) =>
                      handleChange('default_download_path', e.target.value)
                    }
                    placeholder="/path/to/downloads"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      const selected = await open({
                        directory: true,
                        multiple: false,
                        title: 'Select Default Download Location',
                      });
                      if (selected && typeof selected === 'string') {
                        handleChange('default_download_path', selected);
                      }
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="rememberPath" className="cursor-pointer">
                    Remember last used path
                  </Label>
                  <Switch
                    id="rememberPath"
                    checked={localSettings.remember_last_path}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('remember_last_path', checked)
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Performance
              </h3>
              <div className="pl-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="maxConcurrent">
                    Maximum concurrent downloads
                  </Label>
                  <Input
                    id="maxConcurrent"
                    type="number"
                    min={1}
                    max={10}
                    value={localSettings.max_concurrent_downloads}
                    onChange={(e) =>
                      handleChange(
                        'max_concurrent_downloads',
                        parseInt(e.target.value) || 1
                      )
                    }
                    className="w-24"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="segments">Default segments per download</Label>
                  <Input
                    id="segments"
                    type="number"
                    min={1}
                    max={16}
                    value={localSettings.default_segments}
                    onChange={(e) =>
                      handleChange(
                        'default_segments',
                        parseInt(e.target.value) || 1
                      )
                    }
                    className="w-24"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="speedLimit">
                    Global speed limit (KB/s, 0 for unlimited)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="speedLimit"
                      type="number"
                      min={0}
                      value={localSettings.global_speed_limit ? Math.round(localSettings.global_speed_limit / 1024) : 0}
                      onChange={(e) => {
                        const kbps = parseInt(e.target.value) || 0;
                        handleChange('global_speed_limit', kbps > 0 ? kbps * 1024 : null);
                      }}
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">KB/s</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Set to 0 for unlimited speed. Current: {localSettings.global_speed_limit ? `${Math.round(localSettings.global_speed_limit / 1024)} KB/s` : 'Unlimited'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Retry Settings
              </h3>
              <div className="pl-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="maxRetries">
                    Maximum retry attempts
                  </Label>
                  <Input
                    id="maxRetries"
                    type="number"
                    min={0}
                    max={20}
                    value={localSettings.max_retries}
                    onChange={(e) =>
                      handleChange(
                        'max_retries',
                        parseInt(e.target.value) || 0
                      )
                    }
                    className="w-24"
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of times to automatically retry a failed download. Set to 0 to disable automatic retries.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retryDelay">
                    Retry delay (seconds)
                  </Label>
                  <Input
                    id="retryDelay"
                    type="number"
                    min={1}
                    max={300}
                    value={localSettings.retry_delay_seconds}
                    onChange={(e) =>
                      handleChange(
                        'retry_delay_seconds',
                        parseInt(e.target.value) || 30
                      )
                    }
                    className="w-24"
                  />
                  <p className="text-xs text-muted-foreground">
                    Time to wait between retry attempts. Default: 30 seconds.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Theme
              </h3>
              <div className="pl-6">
                <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as Theme[]).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => {
                        handleChange('theme', theme);
                        setTheme(theme);
                      }}
                      className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                        localSettings.theme === theme
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {theme === 'light' && <Sun className="h-6 w-6" />}
                      {theme === 'dark' && <Moon className="h-6 w-6" />}
                      {theme === 'system' && <Monitor className="h-6 w-6" />}
                      <span className="text-sm capitalize">{theme}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                System
              </h3>
              <div className="pl-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="minimizeToTray" className="cursor-pointer">
                      Minimize to system tray
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Keep DLMan running in the background when closed
                    </p>
                  </div>
                  <Switch
                    id="minimizeToTray"
                    checked={localSettings.minimize_to_tray}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('minimize_to_tray', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="startOnBoot" className="cursor-pointer">
                      Start on system boot
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically launch DLMan when you log in
                    </p>
                  </div>
                  <Switch
                    id="startOnBoot"
                    checked={localSettings.start_on_boot}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('start_on_boot', checked)
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'categories':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  File Categories
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingCategory(null);
                    setShowCategoryDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Category
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Manage categories for organizing your downloads. Each category can have custom file extensions and download paths.
              </p>
              <div className="space-y-3">
                {Array.from(categories.values()).map((category) => {
                  const IconComponent = getIconComponent(category.icon);
                  const currentPath = categoryPaths.get(category.id) || '';
                  return (
                    <div key={category.id} className="space-y-2 p-4 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-8 w-8 rounded flex items-center justify-center"
                          style={{ backgroundColor: category.color + '20' }}
                        >
                          <IconComponent className="h-5 w-5" style={{ color: category.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{category.name}</span>
                          <p className="text-xs text-muted-foreground truncate">
                            {category.extensions.length > 0 
                              ? category.extensions.slice(0, 8).join(', ') + (category.extensions.length > 8 ? '...' : '')
                              : 'No extensions defined'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingCategory(category);
                              setShowCategoryDialog(true);
                            }}
                            title="Edit category"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Delete category "${category.name}"?`)) {
                                removeCategory(category.id);
                              }
                            }}
                            title="Delete category"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Download path</Label>
                        <div className="flex gap-2">
                          <Input
                            value={currentPath}
                            onChange={(e) => handleCategoryPathChange(category.id, e.target.value)}
                            placeholder="Uses default download location"
                            className="flex-1 text-sm h-8"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleBrowseCategoryPath(category.id, currentPath)}
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                          </Button>
                          {currentPath && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleCategoryPathChange(category.id, '')}
                              title="Reset to default"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {categories.size === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No categories defined</p>
                    <p className="text-xs">Click "New Category" to create one</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notification Settings
              </h3>
              <div className="pl-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="notifyOnComplete" className="cursor-pointer">
                      Download complete
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Show notification when a download finishes
                    </p>
                  </div>
                  <Switch
                    id="notifyOnComplete"
                    checked={localSettings.notify_on_complete}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('notify_on_complete', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="notifyOnError" className="cursor-pointer">
                      Download failed
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Show notification when a download fails
                    </p>
                  </div>
                  <Switch
                    id="notifyOnError"
                    checked={localSettings.notify_on_error}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('notify_on_error', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="notifySound" className="cursor-pointer">
                      Play sound
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Play a sound for notifications
                    </p>
                  </div>
                  <Switch
                    id="notifySound"
                    checked={localSettings.notify_sound}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('notify_sound', checked)
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                In-App Toasts
              </h3>
              <p className="text-xs text-muted-foreground">
                Control which toast messages appear in the app
              </p>
              <div className="pl-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="toastShowSuccess" className="cursor-pointer">
                      Show success messages
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Show toasts for successful actions
                    </p>
                  </div>
                  <Switch
                    id="toastShowSuccess"
                    checked={localSettings.toast_show_success}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('toast_show_success', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="toastShowError" className="cursor-pointer">
                      Show error messages
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Show toasts for errors and failures
                    </p>
                  </div>
                  <Switch
                    id="toastShowError"
                    checked={localSettings.toast_show_error}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('toast_show_error', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="toastShowInfo" className="cursor-pointer">
                      Show info messages
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Show informational toasts
                    </p>
                  </div>
                  <Switch
                    id="toastShowInfo"
                    checked={localSettings.toast_show_info}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('toast_show_info', checked)
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Updates
              </h3>
              <div className="pl-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoCheckUpdates" className="cursor-pointer">
                      Check for updates automatically
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Check for new versions on startup
                    </p>
                  </div>
                  <Switch
                    id="autoCheckUpdates"
                    checked={localSettings.auto_check_updates}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('auto_check_updates', checked)
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'extensions':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Browser Extensions
              </h3>
              <p className="text-sm text-muted-foreground">
                Install the DLMan browser extension to capture downloads directly from your browser.
              </p>
              
              <div className="grid gap-4">
                {/* Chrome Extension */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center">
                      <Chrome className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium">Chrome / Edge / Brave</p>
                      <p className="text-xs text-muted-foreground">Chromium-based browsers</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      openUrl('https://github.com/novincode/dlman/releases/latest');
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>

                {/* Firefox Extension */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">Firefox</p>
                      <p className="text-xs text-muted-foreground">Mozilla Firefox</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      openUrl('https://github.com/novincode/dlman/releases/latest');
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Network className="h-4 w-4" />
                Integration Settings
              </h3>
              <div className="pl-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="browserPort">Integration port</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="browserPort"
                      type="number"
                      min={1024}
                      max={65535}
                      value={localSettings.browser_integration_port}
                      onChange={(e) =>
                        handleChange(
                          'browser_integration_port',
                          parseInt(e.target.value) || 7899
                        )
                      }
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">(default: 7899)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Browser extensions connect to this port. Change only if there's a conflict.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'proxy':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Network className="h-4 w-4" />
                Proxy Configuration
              </h3>
              <p className="text-sm text-muted-foreground">
                Configure how DLMan connects to the internet. Choose between system proxy, manual configuration, or direct connection.
              </p>

              {/* Proxy Mode Selection */}
              <div className="space-y-3">
                <Label>Proxy Mode</Label>
                <div className="grid gap-2">
                  {[
                    { value: 'system', label: 'Use System Proxy', description: 'Use your operating system\'s proxy settings' },
                    { value: 'none', label: 'No Proxy', description: 'Connect directly without any proxy' },
                    { value: 'manual', label: 'Manual Configuration', description: 'Specify proxy servers manually' },
                  ].map((option) => (
                    <div
                      key={option.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        (localSettings.proxy?.mode || 'system') === option.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                      onClick={() => {
                        const newProxy = { 
                          ...localSettings.proxy, 
                          mode: option.value 
                        };
                        handleChange('proxy', newProxy as ProxySettings);
                      }}
                    >
                      <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        (localSettings.proxy?.mode || 'system') === option.value
                          ? 'border-primary'
                          : 'border-muted-foreground/50'
                      }`}>
                        {(localSettings.proxy?.mode || 'system') === option.value && (
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Manual Proxy Settings */}
              {localSettings.proxy?.mode === 'manual' && (
                <div className="space-y-4 pl-4 border-l-2 border-primary/30">
                  <div className="space-y-2">
                    <Label htmlFor="httpProxy">HTTP Proxy</Label>
                    <Input
                      id="httpProxy"
                      type="text"
                      placeholder="http://proxy.example.com:8080"
                      value={localSettings.proxy?.http_proxy || ''}
                      onChange={(e) => {
                        const newProxy = {
                          ...localSettings.proxy,
                          http_proxy: e.target.value || undefined,
                        };
                        handleChange('proxy', newProxy as ProxySettings);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Proxy server for HTTP connections
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="httpsProxy">HTTPS Proxy</Label>
                    <Input
                      id="httpsProxy"
                      type="text"
                      placeholder="http://proxy.example.com:8080"
                      value={localSettings.proxy?.https_proxy || ''}
                      onChange={(e) => {
                        const newProxy = {
                          ...localSettings.proxy,
                          https_proxy: e.target.value || undefined,
                        };
                        handleChange('proxy', newProxy as ProxySettings);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Proxy server for HTTPS connections (usually the same as HTTP)
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="noProxy">Bypass Proxy For</Label>
                    <Input
                      id="noProxy"
                      type="text"
                      placeholder="localhost, 127.0.0.1, .local"
                      value={localSettings.proxy?.no_proxy || ''}
                      onChange={(e) => {
                        const newProxy = {
                          ...localSettings.proxy,
                          no_proxy: e.target.value || undefined,
                        };
                        handleChange('proxy', newProxy as ProxySettings);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated list of hosts to bypass the proxy
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Proxy Authentication (Optional)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="proxyUsername">Username</Label>
                        <Input
                          id="proxyUsername"
                          type="text"
                          placeholder="Username"
                          value={localSettings.proxy?.username || ''}
                          onChange={(e) => {
                            const newProxy = {
                              ...localSettings.proxy,
                              username: e.target.value || undefined,
                            };
                            handleChange('proxy', newProxy as ProxySettings);
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="proxyPassword">Password</Label>
                        <Input
                          id="proxyPassword"
                          type="password"
                          placeholder="Password"
                          value={localSettings.proxy?.password || ''}
                          onChange={(e) => {
                            const newProxy = {
                              ...localSettings.proxy,
                              password: e.target.value || undefined,
                            };
                            handleChange('proxy', newProxy as ProxySettings);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'advanced':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4" />
                Developer Options
              </h3>
              <div className="pl-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="devMode" className="cursor-pointer">
                      Enable developer mode
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Shows the dev console and enables additional debugging features.
                    </p>
                  </div>
                  <Switch
                    id="devMode"
                    checked={localSettings.dev_mode}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('dev_mode', checked)
                    }
                  />
                </div>
                
                {/* Console Log Limits - only show when dev mode is enabled */}
                {localSettings.dev_mode && (
                  <div className="pt-4 mt-4 border-t space-y-3">
                    <Label className="text-xs text-muted-foreground">Console Log Limits (per type)</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="logLimitInfo" className="text-xs w-12">Info</Label>
                        <Input
                          id="logLimitInfo"
                          type="number"
                          min={10}
                          max={1000}
                          value={consoleLogLimits.info}
                          onChange={(e) => setConsoleLogLimits({ info: parseInt(e.target.value) || 100 })}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="logLimitWarn" className="text-xs w-12">Warn</Label>
                        <Input
                          id="logLimitWarn"
                          type="number"
                          min={10}
                          max={1000}
                          value={consoleLogLimits.warn}
                          onChange={(e) => setConsoleLogLimits({ warn: parseInt(e.target.value) || 100 })}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="logLimitError" className="text-xs w-12">Error</Label>
                        <Input
                          id="logLimitError"
                          type="number"
                          min={10}
                          max={1000}
                          value={consoleLogLimits.error}
                          onChange={(e) => setConsoleLogLimits({ error: parseInt(e.target.value) || 100 })}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="logLimitDebug" className="text-xs w-12">Debug</Label>
                        <Input
                          id="logLimitDebug"
                          type="number"
                          min={10}
                          max={1000}
                          value={consoleLogLimits.debug}
                          onChange={(e) => setConsoleLogLimits({ debug: parseInt(e.target.value) || 100 })}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Limits how many logs of each type are kept in memory.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={showSettingsDialog} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] h-[600px] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure DLMan to work the way you want.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Sidebar */}
          <div className="w-52 border-r border-border p-3 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-6">{renderTabContent()}</div>
          </ScrollArea>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
      
      {/* Category Edit/Create Dialog */}
      <CategoryDialog
        open={showCategoryDialog}
        onOpenChange={(open) => {
          setShowCategoryDialog(open);
          if (!open) setEditingCategory(null);
        }}
        editCategory={editingCategory}
      />
    </Dialog>
  );
}
