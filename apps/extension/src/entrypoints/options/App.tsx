import { useEffect, useState } from 'react';
import { settingsStorage } from '@/lib/storage';
import type { ExtensionSettings } from '@/types';
import { DEFAULT_EXTENSION_SETTINGS } from '@/types';
import {
  Download,
  Settings,
  Globe,
  Zap,
  Save,
  RotateCcw,
  CheckCircle,
  X,
  Plus,
} from 'lucide-react';

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [newSite, setNewSite] = useState('');

  useEffect(() => {
    settingsStorage.get().then(setSettings);
  }, []);

  // Detect theme
  const isDark =
    settings?.theme === 'dark' ||
    (settings?.theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleSave = async () => {
    if (settings) {
      await settingsStorage.set(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_EXTENSION_SETTINGS });
  };

  const updateSetting = <K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
  };

  const addDisabledSite = () => {
    if (newSite.trim() && settings) {
      if (!settings.disabledSites.includes(newSite.trim())) {
        setSettings({
          ...settings,
          disabledSites: [...settings.disabledSites, newSite.trim()],
        });
      }
      setNewSite('');
    }
  };

  const removeDisabledSite = (site: string) => {
    if (settings) {
      setSettings({
        ...settings,
        disabledSites: settings.disabledSites.filter((s) => s !== site),
      });
    }
  };

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={`${isDark ? 'dark' : ''}`}>
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-2xl mx-auto py-8 px-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Download className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">DLMan Extension Settings</h1>
              <p className="text-muted-foreground">
                Configure how the extension behaves
              </p>
            </div>
          </div>

          {/* Save notification */}
          {saved && (
            <div className="mb-6 flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-4 py-2 rounded-lg">
              <CheckCircle className="w-5 h-5" />
              <span>Settings saved successfully!</span>
            </div>
          )}

          {/* General Settings */}
          <section className="mb-8">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <Settings className="w-5 h-5" />
              General
            </h2>

            <div className="space-y-4 bg-card border rounded-lg p-4">
              {/* Enabled */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Extension</p>
                  <p className="text-sm text-muted-foreground">
                    Turn the extension on or off
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) => updateSetting('enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-primary/50 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              {/* Auto Intercept */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto-Intercept Downloads</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically capture downloads matching file patterns
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoIntercept}
                    onChange={(e) =>
                      updateSetting('autoIntercept', e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              {/* Port */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Connection Port</p>
                  <p className="text-sm text-muted-foreground">
                    Port for connecting to DLMan desktop app
                  </p>
                </div>
                <input
                  type="number"
                  value={settings.port}
                  onChange={(e) =>
                    updateSetting('port', parseInt(e.target.value) || 7899)
                  }
                  className="w-24 px-3 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Theme */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Theme</p>
                  <p className="text-sm text-muted-foreground">
                    Extension color scheme
                  </p>
                </div>
                <select
                  value={settings.theme}
                  onChange={(e) =>
                    updateSetting('theme', e.target.value as ExtensionSettings['theme'])
                  }
                  className="px-3 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          </section>

          {/* Behavior Settings */}
          <section className="mb-8">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <Zap className="w-5 h-5" />
              Behavior
            </h2>

            <div className="space-y-4 bg-card border rounded-lg p-4">
              {/* Fallback to Browser */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Fallback to Browser</p>
                  <p className="text-sm text-muted-foreground">
                    Use browser downloads when DLMan is not running
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.fallbackToBrowser}
                    onChange={(e) =>
                      updateSetting('fallbackToBrowser', e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Show Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Display notifications for downloads
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showNotifications}
                    onChange={(e) =>
                      updateSetting('showNotifications', e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
            </div>
          </section>

          {/* Disabled Sites */}
          <section className="mb-8">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <Globe className="w-5 h-5" />
              Disabled Sites
            </h2>

            <div className="bg-card border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-4">
                DLMan will not intercept downloads from these sites. Use wildcards
                like *.example.com to match subdomains.
              </p>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newSite}
                  onChange={(e) => setNewSite(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addDisabledSite()}
                  placeholder="Enter hostname (e.g., example.com)"
                  className="flex-1 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={addDisabledSite}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {settings.disabledSites.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No sites disabled
                </p>
              ) : (
                <div className="space-y-2">
                  {settings.disabledSites.map((site) => (
                    <div
                      key={site}
                      className="flex items-center justify-between bg-muted/50 px-3 py-2 rounded-md"
                    >
                      <span className="text-sm">{site}</span>
                      <button
                        onClick={() => removeDisabledSite(site)}
                        className="p-1 hover:bg-destructive/20 rounded transition-colors text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* File Patterns */}
          <section className="mb-8">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <Download className="w-5 h-5" />
              File Patterns
            </h2>

            <div className="bg-card border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-4">
                File extensions that will be intercepted when auto-intercept is
                enabled.
              </p>

              <div className="flex flex-wrap gap-2">
                {settings.interceptPatterns.map((pattern) => (
                  <span
                    key={pattern}
                    className="px-2 py-1 bg-muted text-sm rounded-md"
                  >
                    {pattern}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Settings
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
