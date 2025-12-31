import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Settings,
  Folder,
  Palette,
  Monitor,
  Moon,
  Sun,
  Gauge,
  Network,
  Bell,
  Power,
  Info,
  Loader2,
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useUIStore } from '@/stores/ui';
import { useSettingsStore } from '@/stores/settings';
import type { Settings as SettingsType, Theme } from '@/types';

type SettingsTab = 'general' | 'downloads' | 'appearance' | 'advanced';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Settings className="h-4 w-4" /> },
  { id: 'downloads', label: 'Downloads', icon: <Folder className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> },
  { id: 'advanced', label: 'Advanced', icon: <Gauge className="h-4 w-4" /> },
];

export function SettingsDialog() {
  const { showSettingsDialog, setShowSettingsDialog } = useUIStore();
  const { settings, updateSettings, setTheme } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [localSettings, setLocalSettings] = useState<SettingsType>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local settings when dialog opens or settings change
  useEffect(() => {
    if (showSettingsDialog) {
      setLocalSettings(settings);
      setHasChanges(false);
    }
  }, [showSettingsDialog, settings]);

  const handleChange = useCallback(
    <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
      setLocalSettings((prev) => ({ ...prev, [key]: value }));
      setHasChanges(true);
    },
    []
  );

  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      // Update local store first (this persists to localStorage)
      updateSettings(localSettings);
      
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
  }, [localSettings, updateSettings, setShowSettingsDialog]);

  const handleClose = () => {
    setShowSettingsDialog(false);
    setActiveTab('general');
    setLocalSettings(settings);
    setHasChanges(false);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Power className="h-4 w-4" />
                Startup
              </h3>
              <div className="space-y-3 pl-6">
                <div className="flex items-center justify-between">
                  <Label htmlFor="startOnBoot" className="cursor-pointer">
                    Start on system boot
                  </Label>
                  <Checkbox
                    id="startOnBoot"
                    checked={localSettings.startOnBoot}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('startOnBoot', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="minimizeToTray" className="cursor-pointer">
                    Minimize to system tray
                  </Label>
                  <Checkbox
                    id="minimizeToTray"
                    checked={localSettings.minimizeToTray}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('minimizeToTray', checked)
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
              </h3>
              <div className="space-y-3 pl-6">
                <p className="text-sm text-muted-foreground">
                  Notification settings coming soon...
                </p>
              </div>
            </div>
          </div>
        );

      case 'downloads':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Folder className="h-4 w-4" />
                Default Location
              </h3>
              <div className="pl-6 space-y-2">
                <Input
                  value={localSettings.defaultDownloadPath}
                  onChange={(e) =>
                    handleChange('defaultDownloadPath', e.target.value)
                  }
                  placeholder="/path/to/downloads"
                />
                <div className="flex items-center justify-between">
                  <Label htmlFor="rememberPath" className="cursor-pointer">
                    Remember last used path
                  </Label>
                  <Checkbox
                    id="rememberPath"
                    checked={localSettings.rememberLastPath}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('rememberLastPath', checked)
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
                    value={localSettings.maxConcurrentDownloads}
                    onChange={(e) =>
                      handleChange(
                        'maxConcurrentDownloads',
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
                    value={localSettings.defaultSegments}
                    onChange={(e) =>
                      handleChange(
                        'defaultSegments',
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
                      value={localSettings.globalSpeedLimit ? Math.round(localSettings.globalSpeedLimit / 1024) : 0}
                      onChange={(e) => {
                        const kbps = parseInt(e.target.value) || 0;
                        handleChange('globalSpeedLimit', kbps > 0 ? kbps * 1024 : null);
                      }}
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">KB/s</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Set to 0 for unlimited speed. Current: {localSettings.globalSpeedLimit ? `${Math.round(localSettings.globalSpeedLimit / 1024)} KB/s` : 'Unlimited'}
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
          </div>
        );

      case 'advanced':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Network className="h-4 w-4" />
                Browser Integration
              </h3>
              <div className="pl-6 space-y-2">
                <Label htmlFor="browserPort">Integration port</Label>
                <Input
                  id="browserPort"
                  type="number"
                  min={1024}
                  max={65535}
                  value={localSettings.browserIntegrationPort}
                  onChange={(e) =>
                    handleChange(
                      'browserIntegrationPort',
                      parseInt(e.target.value) || 7899
                    )
                  }
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Browser extensions connect to this port to capture downloads.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4" />
                Developer
              </h3>
              <div className="pl-6 space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="devMode" className="cursor-pointer">
                    Enable developer mode
                  </Label>
                  <Checkbox
                    id="devMode"
                    checked={localSettings.devMode}
                    onCheckedChange={(checked: boolean) =>
                      handleChange('devMode', checked)
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Shows the dev console and enables additional debugging features.
                </p>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <Dialog open={showSettingsDialog} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure DLMan to work the way you want.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r border-border p-4">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
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

        <DialogFooter className="px-6 pb-6 border-t border-border pt-4">
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
    </Dialog>
  );
}
