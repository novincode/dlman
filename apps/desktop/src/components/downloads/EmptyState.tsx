import { motion } from "framer-motion";
import { Download, FolderDown, Link, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui";

interface EmptyStateProps {
  hasAnyDownloads: boolean;
}

export function EmptyState({ hasAnyDownloads }: EmptyStateProps) {
  const { setShowNewDownloadDialog, setShowBatchImportDialog } = useUIStore();

  if (hasAnyDownloads) {
    // Has downloads but none match current filter
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center"
        >
          <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No downloads match your filter</p>
          <p className="text-sm mt-1">
            Try changing the filter or search query
          </p>
        </motion.div>
      </div>
    );
  }

  // No downloads at all - Welcome screen with better centered design
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-md px-4"
      >
        {/* Icon - Centered with decorative elements */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="mx-auto mb-8 relative inline-flex items-center justify-center"
        >
          {/* Main icon container */}
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-inner">
            <Download className="h-14 w-14 text-primary" />
          </div>
          {/* Decorative badge - Link icon */}
          <motion.div
            className="absolute -right-1 -bottom-1 w-11 h-11 rounded-full bg-gradient-to-br from-green-500/20 to-green-500/5 flex items-center justify-center border-2 border-background shadow-sm"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
          >
            <Link className="h-5 w-5 text-green-500" />
          </motion.div>
          {/* Decorative badge - Speed icon */}
          <motion.div
            className="absolute -left-1 -top-1 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center border-2 border-background shadow-sm"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: "spring" }}
          >
            <Zap className="h-4 w-4 text-blue-500" />
          </motion.div>
        </motion.div>

        {/* Title */}
        <h2 className="text-2xl font-semibold mb-2">Welcome to DLMan</h2>
        <p className="text-muted-foreground mb-8">
          Fast, modern download manager with multi-segment acceleration
        </p>

        {/* Actions - Centered buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button onClick={() => setShowNewDownloadDialog(true)} size="lg" className="gap-2 w-full sm:w-auto">
            <Download className="h-4 w-4" />
            Add Download
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setShowBatchImportDialog(true)}
            className="gap-2 w-full sm:w-auto"
          >
            <FolderDown className="h-4 w-4" />
            Import Links
          </Button>
        </div>

        {/* Drop hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-xs text-muted-foreground mt-8"
        >
          Tip: Paste links with Ctrl+V or drag & drop URLs anywhere
        </motion.p>
      </motion.div>
    </div>
  );
}
