import { useState, useCallback } from 'react';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
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
 * Prompts user for credentials with a "Remember" switch (on by default).
 * If Remember is on, credentials are saved for future use.
 */
export function CredentialPromptDialog() {
  const { pendingRequest, setPendingRequest, addCredential } = useCredentialsStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isOpen = pendingRequest !== null;

  const handleClose = useCallback(() => {
    setPendingRequest(null);
    setUsername('');
    setPassword('');
    setRemember(true);
    setShowPassword(false);
    setSubmitting(false);
  }, [setPendingRequest]);

  const handleSubmit = useCallback(async () => {
    if (!pendingRequest || !username || !password) return;
    setSubmitting(true);

    try {
      // Save credential if "Remember" is on
      if (remember) {
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

      // Retry the download with credentials
      await invoke('retry_download', { id: pendingRequest.downloadId });

      handleClose();
    } catch (err) {
      console.error('Failed to submit credentials:', err);
      setSubmitting(false);
    }
  }, [pendingRequest, username, password, remember, addCredential, handleClose]);

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
            The server at <span className="font-medium text-foreground">{pendingRequest?.domain}</span> requires authentication to continue downloading.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              Remember this login
            </Label>
          </div>

          {pendingRequest?.statusCode && (
            <p className="text-xs text-muted-foreground">
              Server responded with status {pendingRequest.statusCode}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!username || !password || submitting}>
            {submitting ? 'Submitting...' : 'Sign In & Retry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
