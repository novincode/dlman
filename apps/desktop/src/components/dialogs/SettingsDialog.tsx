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
  KeyRound,
  Eye,
  EyeOff,
  Languages,
  Type,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useUIStore } from '@/stores/ui';
import { useSettingsStore } from '@/stores/settings';
import { useCategoryStore, Category } from '@/stores/categories';
import { useCredentialsStore } from '@/stores/credentials';
import { getIconComponent } from '@/lib/categoryIcons';
import { CategoryDialog } from './CategoryDialog';
import type { Settings as SettingsType, Theme, ProxySettings, SiteCredential } from '@/types';
import { useTranslation } from 'react-i18next';
import { LOCALES } from '@/i18n/config';
import { FONTS } from '@/i18n/fonts';

// Sentinel Select value meaning "no explicit font override — follow the language".
const FONT_AUTO = 'auto';

type SettingsTab = 'downloads' | 'categories' | 'notifications' | 'appearance' | 'extensions' | 'proxy' | 'saved-logins' | 'advanced';

const tabs: { id: SettingsTab; icon: React.ReactNode }[] = [
  { id: 'downloads', icon: <Download className="h-4 w-4" /> },
  { id: 'categories', icon: <Tag className="h-4 w-4" /> },
  { id: 'notifications', icon: <Bell className="h-4 w-4" /> },
  { id: 'appearance', icon: <Palette className="h-4 w-4" /> },
  { id: 'extensions', icon: <Layers className="h-4 w-4" /> },
  { id: 'proxy', icon: <Network className="h-4 w-4" /> },
  { id: 'saved-logins', icon: <KeyRound className="h-4 w-4" /> },
  { id: 'advanced', icon: <Gauge className="h-4 w-4" /> },
];

export function SettingsDialog() {
  const { showSettingsDialog, setShowSettingsDialog, consoleLogLimits, setConsoleLogLimits } = useUIStore();
  const { settings, updateSettings, setTheme } = useSettingsStore();
  const { t } = useTranslation();
  const { categories, updateCategory, removeCategory } = useCategoryStore();
  const { credentials, loadFromBackend: loadCredentials, addCredential, updateCredential, deleteCredential } = useCredentialsStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('downloads');
  const [localSettings, setLocalSettings] = useState<SettingsType>(settings);
  const [categoryPaths, setCategoryPaths] = useState<Map<string, string>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Category dialog state
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  // Credential form state
  const [showCredentialForm, setShowCredentialForm] = useState(false);
  const [editingCredential, setEditingCredential] = useState<SiteCredential | null>(null);
  const [credentialForm, setCredentialForm] = useState({
    domain: '',
    protocol: 'https',
    username: '',
    password: '',
    notes: '',
    enabled: true,
  });
  const [showPasswords, setShowPasswords] = useState<Set<string>>(new Set());

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
      // Load credentials when dialog opens
      loadCredentials();
    }
  }, [showSettingsDialog, settings, categories, loadCredentials]);

  // Credential form helpers
  const resetCredentialForm = useCallback(() => {
    setShowCredentialForm(false);
    setEditingCredential(null);
    setCredentialForm({ domain: '', protocol: 'https', username: '', password: '', notes: '', enabled: true });
  }, []);

  const handleEditCredential = useCallback((cred: SiteCredential) => {
    setEditingCredential(cred);
    setCredentialForm({
      domain: cred.domain,
      protocol: cred.protocol,
      username: cred.username,
      password: cred.password,
      notes: cred.notes || '',
      enabled: cred.enabled,
    });
    setShowCredentialForm(true);
  }, []);

  const handleSaveCredential = useCallback(async () => {
    if (!credentialForm.domain || !credentialForm.username || !credentialForm.password) return;
    try {
      const now = new Date().toISOString();
      if (editingCredential) {
        await updateCredential({
          ...editingCredential,
          domain: credentialForm.domain,
          protocol: credentialForm.protocol,
          username: credentialForm.username,
          password: credentialForm.password,
          notes: credentialForm.notes || null,
          enabled: credentialForm.enabled,
        });
      } else {
        await addCredential({
          id: crypto.randomUUID(),
          domain: credentialForm.domain,
          protocol: credentialForm.protocol,
          username: credentialForm.username,
          password: credentialForm.password,
          enabled: credentialForm.enabled,
          created_at: now,
          last_used_at: null,
          notes: credentialForm.notes || null,
        });
      }
      resetCredentialForm();
    } catch (err) {
      console.error('Failed to save credential:', err);
    }
  }, [credentialForm, editingCredential, addCredential, updateCredential, resetCredentialForm]);

  const togglePasswordVisibility = useCallback((id: string) => {
    setShowPasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
        title: t('settings.selectCategoryPathTitle'),
        defaultPath: currentPath || undefined,
      });
      if (selected && typeof selected === 'string') {
        handleCategoryPathChange(categoryId, selected);
      }
    } catch (err) {
      console.error('Failed to open directory picker:', err);
    }
  }, [handleCategoryPathChange, t]);

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
                {t('settings.defaultLocation')}
              </h3>
              <div className="pl-6 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={localSettings.default_download_path}
                    onChange={(e) =>
                      handleChange('default_download_path', e.target.value)
                    }
                    placeholder={t('settings.defaultPathPlaceholder')}
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
                        title: t('settings.selectDefaultLocationTitle'),
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
                    {t('settings.rememberLastPath')}
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
                {t('settings.performance')}
              </h3>
              <div className="pl-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="maxConcurrent">
                    {t('settings.maxConcurrent')}
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
                  <Label htmlFor="segments">{t('settings.defaultSegments')}</Label>
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
                    {t('settings.speedLimitLabel')}
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
                    <span className="text-sm text-muted-foreground">{t('settings.speedLimitUnit')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.speedLimitCurrent', {
                      current: localSettings.global_speed_limit
                        ? `${Math.round(localSettings.global_speed_limit / 1024)} ${t('settings.speedLimitUnit')}`
                        : t('settings.unlimited'),
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                {t('settings.retrySettings')}
              </h3>
              <div className="pl-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="maxRetries">
                    {t('settings.maxRetries')}
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
                    {t('settings.maxRetriesHint')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retryDelay">
                    {t('settings.retryDelay')}
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
                    {t('settings.retryDelayHint')}
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
                {t('settings.theme')}
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
                      <span className="text-sm">
                        {theme === 'light'
                          ? t('settings.themeLight')
                          : theme === 'dark'
                            ? t('settings.themeDark')
                            : t('settings.themeSystem')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* Language & Font */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Languages className="h-4 w-4" />
                {t('settings.language')}
              </h3>
              <div className="pl-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">{t('settings.language')}</Label>
                  <Select
                    value={localSettings.language || 'en'}
                    onValueChange={(code) => {
                      handleChange('language', code);
                      updateSettings({ language: code }); // apply immediately
                    }}
                  >
                    <SelectTrigger id="language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCALES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.nativeName}
                          {l.name !== l.nativeName ? ` (${l.name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('settings.languageHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="font" className="flex items-center gap-2">
                    <Type className="h-3.5 w-3.5" />
                    {t('settings.font')}
                  </Label>
                  <Select
                    value={localSettings.font ?? FONT_AUTO}
                    onValueChange={(value) => {
                      const font = value === FONT_AUTO ? null : value;
                      handleChange('font', font);
                      updateSettings({ font }); // apply immediately
                    }}
                  >
                    <SelectTrigger id="font">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FONT_AUTO}>{t('settings.fontAuto')}</SelectItem>
                      {FONTS.map((f) => (
                        <SelectItem key={f.key} value={f.key} style={{ fontFamily: f.stack }}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('settings.fontHint')}</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                {t('settings.system')}
              </h3>
              <div className="pl-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="minimizeToTray" className="cursor-pointer">
                      {t('settings.minimizeToTray.label')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.minimizeToTray.hint')}
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
                      {t('settings.startOnBoot.label')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.startOnBoot.hint')}
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
                  {t('settings.categoriesTitle')}
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
                  {t('settings.newCategory')}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('settings.categoriesDesc')}
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
                              : t('settings.noExtensions')}
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
                            title={t('settings.editCategory')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(t('settings.deleteCategoryConfirm', { name: category.name }))) {
                                removeCategory(category.id);
                              }
                            }}
                            title={t('settings.deleteCategory')}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t('settings.categoryDownloadPath')}</Label>
                        <div className="flex gap-2">
                          <Input
                            value={currentPath}
                            onChange={(e) => handleCategoryPathChange(category.id, e.target.value)}
                            placeholder={t('settings.categoryPathPlaceholder')}
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
                              title={t('settings.resetToDefault')}
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
                    <p>{t('settings.noCategoriesTitle')}</p>
                    <p className="text-xs">{t('settings.noCategoriesHint')}</p>
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
                {t('settings.notificationSettings')}
              </h3>
              <div className="pl-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="notifyOnComplete" className="cursor-pointer">
                      {t('settings.notifyComplete.label')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.notifyComplete.hint')}
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
                      {t('settings.notifyFailed.label')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.notifyFailed.hint')}
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
                      {t('settings.notifySound.label')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.notifySound.hint')}
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
                {t('settings.inAppToasts')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('settings.inAppToastsDesc')}
              </p>
              <div className="pl-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="toastShowSuccess" className="cursor-pointer">
                      {t('settings.toastSuccess.label')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.toastSuccess.hint')}
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
                      {t('settings.toastError.label')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.toastError.hint')}
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
                      {t('settings.toastInfo.label')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.toastInfo.hint')}
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
                {t('settings.updates')}
              </h3>
              <div className="pl-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoCheckUpdates" className="cursor-pointer">
                      {t('settings.autoCheckUpdates.label')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.autoCheckUpdates.hint')}
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
                {t('settings.browserExtensions')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('settings.browserExtensionsDesc')}
              </p>

              <div className="grid gap-4">
                {/* Chrome Extension */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center">
                      <Chrome className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium">{t('settings.chromeTitle')}</p>
                      <p className="text-xs text-muted-foreground">{t('settings.chromeDesc')}</p>
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
                    {t('settings.download')}
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
                      <p className="font-medium">{t('settings.firefoxTitle')}</p>
                      <p className="text-xs text-muted-foreground">{t('settings.firefoxDesc')}</p>
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
                    {t('settings.download')}
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Network className="h-4 w-4" />
                {t('settings.integrationSettings')}
              </h3>
              <div className="pl-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="browserPort">{t('settings.integrationPort')}</Label>
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
                    <span className="text-sm text-muted-foreground">{t('settings.integrationPortDefault')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.integrationPortHint')}
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
                {t('settings.proxyConfiguration')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('settings.proxyConfigDesc')}
              </p>

              {/* Proxy Mode Selection */}
              <div className="space-y-3">
                <Label>{t('settings.proxyMode')}</Label>
                <div className="grid gap-2">
                  {[
                    { value: 'system', label: t('settings.proxySystem.label'), description: t('settings.proxySystem.desc') },
                    { value: 'none', label: t('settings.proxyNone.label'), description: t('settings.proxyNone.desc') },
                    { value: 'manual', label: t('settings.proxyManual.label'), description: t('settings.proxyManual.desc') },
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
                    <Label htmlFor="httpProxy">{t('settings.httpProxy')}</Label>
                    <Input
                      id="httpProxy"
                      type="text"
                      placeholder={t('settings.proxyExamplePlaceholder')}
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
                      {t('settings.httpProxyHint')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="httpsProxy">{t('settings.httpsProxy')}</Label>
                    <Input
                      id="httpsProxy"
                      type="text"
                      placeholder={t('settings.proxyExamplePlaceholder')}
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
                      {t('settings.httpsProxyHint')}
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="noProxy">{t('settings.bypassProxy')}</Label>
                    <Input
                      id="noProxy"
                      type="text"
                      placeholder={t('settings.bypassProxyPlaceholder')}
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
                      {t('settings.bypassProxyHint')}
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">{t('settings.proxyAuth')}</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="proxyUsername">{t('settings.username')}</Label>
                        <Input
                          id="proxyUsername"
                          type="text"
                          placeholder={t('settings.usernamePlaceholder')}
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
                        <Label htmlFor="proxyPassword">{t('settings.password')}</Label>
                        <Input
                          id="proxyPassword"
                          type="password"
                          placeholder={t('settings.passwordPlaceholder')}
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
                {t('settings.developerOptions')}
              </h3>
              <div className="pl-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="devMode" className="cursor-pointer">
                      {t('settings.devMode.label')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.devMode.hint')}
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
                    <Label className="text-xs text-muted-foreground">{t('settings.consoleLogLimits')}</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="logLimitInfo" className="text-xs w-12">{t('settings.logInfo')}</Label>
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
                        <Label htmlFor="logLimitWarn" className="text-xs w-12">{t('settings.logWarn')}</Label>
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
                        <Label htmlFor="logLimitError" className="text-xs w-12">{t('settings.logError')}</Label>
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
                        <Label htmlFor="logLimitDebug" className="text-xs w-12">{t('settings.logDebug')}</Label>
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
                      {t('settings.consoleLogLimitsHint')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'saved-logins':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  {t('settings.savedLoginsTitle')}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetCredentialForm();
                    setShowCredentialForm(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('settings.addLogin')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.savedLoginsDesc')}
              </p>

              {/* Credential Form (Add/Edit) */}
              {showCredentialForm && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <h4 className="text-sm font-medium">
                    {editingCredential ? t('settings.editLogin') : t('settings.addNewLogin')}
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="credDomain" className="text-xs">{t('settings.domain')}</Label>
                      <Input
                        id="credDomain"
                        placeholder={t('settings.domainPlaceholder')}
                        value={credentialForm.domain}
                        onChange={(e) => setCredentialForm({ ...credentialForm, domain: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="credProtocol" className="text-xs">{t('settings.protocol')}</Label>
                      <Select
                        value={credentialForm.protocol}
                        onValueChange={(value) => setCredentialForm({ ...credentialForm, protocol: value })}
                      >
                        <SelectTrigger id="credProtocol" className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="https">HTTPS</SelectItem>
                          <SelectItem value="http">HTTP</SelectItem>
                          <SelectItem value="ftp">FTP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="credUsername" className="text-xs">{t('settings.username')}</Label>
                      <Input
                        id="credUsername"
                        placeholder={t('settings.usernamePlaceholder')}
                        value={credentialForm.username}
                        onChange={(e) => setCredentialForm({ ...credentialForm, username: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="credPassword" className="text-xs">{t('settings.password')}</Label>
                      <div className="relative">
                        <Input
                          id="credPassword"
                          type={showPasswords.has('form') ? 'text' : 'password'}
                          placeholder={t('settings.passwordPlaceholder')}
                          value={credentialForm.password}
                          onChange={(e) => setCredentialForm({ ...credentialForm, password: e.target.value })}
                          className="h-8 text-sm pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility('form')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPasswords.has('form') ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="credNotes" className="text-xs">{t('settings.notesOptional')}</Label>
                    <Input
                      id="credNotes"
                      placeholder={t('settings.notesPlaceholder')}
                      value={credentialForm.notes}
                      onChange={(e) => setCredentialForm({ ...credentialForm, notes: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="credEnabled"
                        checked={credentialForm.enabled}
                        onCheckedChange={(checked: boolean) => setCredentialForm({ ...credentialForm, enabled: checked })}
                      />
                      <Label htmlFor="credEnabled" className="text-xs cursor-pointer">{t('settings.enabled')}</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={resetCredentialForm}>
                        {t('common.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveCredential}
                        disabled={!credentialForm.domain || !credentialForm.username || !credentialForm.password}
                      >
                        {editingCredential ? t('common.update') : t('common.save')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Credentials List */}
              <div className="space-y-2">
                {credentials.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <KeyRound className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">{t('settings.noLoginsTitle')}</p>
                    <p className="text-xs mt-1">{t('settings.noLoginsHint')}</p>
                  </div>
                ) : (
                  credentials.map((cred) => (
                    <div
                      key={cred.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        cred.enabled ? 'bg-background' : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{cred.domain}</span>
                          <span className="text-[10px] text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-muted">
                            {cred.protocol}
                          </span>
                          {!cred.enabled && (
                            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                              {t('settings.disabled')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">{cred.username}</span>
                          <span className="text-xs text-muted-foreground">
                            •
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {showPasswords.has(cred.id) ? cred.password : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(cred.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {showPasswords.has(cred.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        </div>
                        {cred.notes && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{cred.notes}</p>
                        )}
                        {cred.last_used_at && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {t('settings.lastUsed', { date: new Date(cred.last_used_at).toLocaleDateString() })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEditCredential(cred)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteCredential(cred.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const tabLabels: Record<SettingsTab, string> = {
    downloads: t('settings.tabs.downloads'),
    categories: t('settings.tabs.categories'),
    notifications: t('settings.tabs.notifications'),
    appearance: t('settings.tabs.appearance'),
    extensions: t('settings.tabs.extensions'),
    proxy: t('settings.tabs.proxy'),
    'saved-logins': t('settings.tabs.savedLogins'),
    advanced: t('settings.tabs.advanced'),
  };

  return (
    <Dialog open={showSettingsDialog} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] h-[600px] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t('settings.title')}
          </DialogTitle>
          <DialogDescription>
            {t('settings.subtitle')}
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
                  {tabLabels[tab.id]}
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
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.saving')}
              </>
            ) : (
              t('settings.saveChanges')
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
