import { motion } from "framer-motion";
import { Download, FolderDown, Link } from "lucide-react";
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

  // No downloads at all
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-md"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="mx-auto mb-6 relative"
        >
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <Download className="h-12 w-12 text-primary" />
          </div>
          <motion.div
            className="absolute -right-2 -bottom-2 w-10 h-10 rounded-full bg-success/10 flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
          >
            <Link className="h-5 w-5 text-success" />
          </motion.div>
        </motion.div>

        {/* Title */}
        <h2 className="text-2xl font-semibold mb-2">Welcome to DLMan</h2>
        <p className="text-muted-foreground mb-6">
          Start downloading by adding a link or dropping files here
        </p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => setShowNewDownloadDialog(true)} className="gap-2">
            <Download className="h-4 w-4" />
            Add Download
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowBatchImportDialog(true)}
            className="gap-2"
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
          className="text-xs text-muted-foreground mt-6"
        >
          You can also paste links (Ctrl+V) or drag & drop URLs here
        </motion.p>
      </motion.div>
    </div>
  );
}
