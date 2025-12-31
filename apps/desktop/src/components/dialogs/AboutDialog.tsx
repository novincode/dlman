import { Download, Github, Heart } from 'lucide-react';
import { open as openUrl } from '@tauri-apps/plugin-shell';

const GITHUB_URL = 'https://github.com/novincode/dlman';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui';

export function AboutDialog() {
  const { showAboutDialog, setShowAboutDialog } = useUIStore();

  return (
    <Dialog open={showAboutDialog} onOpenChange={setShowAboutDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Download className="h-12 w-12 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-2xl text-center">DLMan</DialogTitle>
          <DialogDescription className="text-center">
            Download Manager
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="text-center">
            <p className="text-muted-foreground text-sm">Version 0.1.0</p>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>A modern, fast, and reliable download manager</p>
            <p>built with Rust and React.</p>
          </div>

          <div className="flex flex-col gap-2 items-center pt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => openUrl(GITHUB_URL)}
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </Button>
          </div>

          <div className="text-center text-xs text-muted-foreground pt-4">
            <p className="flex items-center justify-center gap-1">
              Made with <Heart className="h-3 w-3 text-red-500" /> by the DLMan Team
            </p>
            <p className="mt-1">© 2024 DLMan. All rights reserved.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
