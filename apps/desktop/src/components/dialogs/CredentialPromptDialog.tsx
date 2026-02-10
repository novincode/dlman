import { useState, useCallback, useEffect } from 'react';
import { KeyRound, Eye, EyeOff, AlertTriangle } from 'lucide-react';
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
import { useCredentialsStore } from '@/stores/credentials';
import { invoke } from '@tauri-apps/api/core';

/**
 * Credential Prompt Dialog
 * 
 * Shows when a download encounters a 401/403 response.
 * Pre-fills existing credentials for the domain if found (with warning).
 * "Remember" switch is on by default.
 */
export function CredentialPromptDialog() {
  const { pendingRequest, setPendingRequest, credentials, addCredential, updateCredential } = useCredentialsStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [existingCredId, setExistingCredId] = useState<string | null>(null);

  const isOpen = pendingRequest !== null;

  // Pre-fill with existing credentials for this domain (they failed, so user can update)
  useEffect(() => {
    if (pendingRequest) {
      const existing = credentials.find(
        (c) => c.enabled && c.domain === pendingRequest.domain
      );
      if (existing) {
        setUsername(existing.username);
        setPassword(''); // Clear password so user must re-enter
        setExistingCredId(existing.id);
      } else {
        setUsername('');
        setPassword('');
        setExistingCredId(null);
      }
    }
  }, [pendingRequest, credentials]);

  const handleClose = useCallback(() => {
    setPendingRequest(null);
    setUsername('');
    setPassword('');
    setRemember(true);
    setShowPassword(false);
    setSubmitting(false);
    setExistingCredId(null);
  }, [setPendingRequest]);

  const handleSubmit = useCallback(async () => {
    if (!pendingRequest || !username || !password) return;
    setSubmitting(true);

    try {
      // Save or update credential if "Remember" is on
      if (remember) {
        if (existingCredId) {
          // Update existing credential with new values
          const existing = credentials.find((c) => c.id === existingCredId);
          if (existing) {
            await updateCredential({ ...existing, username, password });
          }
        } else {
          // Save new credential
          const now = new Date().toISOString();
          await addCredential({
            id: crypto.randomUUID(),
            domain: pendingRequest.domain,
            protocol: 'https',
            username,
            password,
            enabled: true,
            created_at: now,
            last_used_at: null,
            notes: null,
          });
        }
      }

      // Retry the download — the engine will pick up the saved credentials
      await invoke('retry_download', { id: pendingRequest.downloadId });

      handleClose();
    } catch (err) {
      console.error('Failed to submit credentials:', err);
      setSubmitting(false);
    }
  }, [pendingRequest, username, password, remember, existingCredId, credentials, addCredential, updateCredential, handleClose]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Authentication Required
          </DialogTitle>
          <DialogDescription>
            The server at <span className="font-medium text-foreground">{pendingRequest?.domain}</span> requires a login to download this file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Show warning if existing credentials failed */}
          {existingCredId && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Your saved credentials for this domain didn't work. Update them below.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="promptUsername">Username</Label>
            <Input
              id="promptUsername"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="promptPassword">Password</Label>
            <div className="relative">
              <Input
                id="promptPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && username && password) {
                    handleSubmit();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="rememberCred"
              checked={remember}
              onCheckedChange={(checked: boolean) => setRemember(checked)}
            />
            <Label htmlFor="rememberCred" className="cursor-pointer text-sm">
              {existingCredId ? 'Update saved login' : 'Remember this login'}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!username || !password || submitting}>
            {submitting ? 'Retrying...' : 'Sign In & Retry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
