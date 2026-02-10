import { useEffect, useState, useCallback } from "react";
import { X, Star, Heart, Frown, Meh, HeartHandshake, HeartPulse } from "lucide-react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "dlman-support-reminder";
const FIRST_OPEN_KEY = "dlman-first-open";
const SHOW_DELAY_MS = 30 * 60 * 1000; // 30 minutes
const SKIP_DURATION_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

interface ReminderState {
  neverShow: boolean;
  skipUntil: number | null;
}

function getStoredState(): ReminderState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return { neverShow: false, skipUntil: null };
}

function saveState(state: ReminderState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getFirstOpenTime(): number {
  const stored = localStorage.getItem(FIRST_OPEN_KEY);
  if (stored) {
    return parseInt(stored, 10);
  }
  const now = Date.now();
  localStorage.setItem(FIRST_OPEN_KEY, now.toString());
  return now;
}

export function SupportReminder() {
  const devMode = useSettingsStore((s) => s.settings.dev_mode);
  const [visible, setVisible] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  const checkShouldShow = useCallback(() => {
    const state = getStoredState();
    
    // Never show again
    if (state.neverShow) return false;
    
    // Currently skipped
    if (state.skipUntil && Date.now() < state.skipUntil) return false;
    
    // Check if 30 minutes passed since first open (or dev mode bypass)
    const firstOpen = getFirstOpenTime();
    const elapsed = Date.now() - firstOpen;
    
    // In dev mode, show after 2 seconds for testing
    if (devMode) {
      return elapsed > 2000;
    }
    
    return elapsed >= SHOW_DELAY_MS;
  }, [devMode]);

  useEffect(() => {
    // Initial check
    if (checkShouldShow()) {
      setVisible(true);
      return;
    }

    // Check periodically
    const interval = setInterval(() => {
      if (checkShouldShow()) {
        setVisible(true);
        clearInterval(interval);
      }
    }, devMode ? 1000 : 60000); // Check every second in dev, every minute otherwise

    return () => clearInterval(interval);
  }, [checkShouldShow, devMode]);

  const handleSkip = () => {
    saveState({
      neverShow: false,
      skipUntil: Date.now() + SKIP_DURATION_MS,
    });
    setVisible(false);
  };

  const handleNever = () => {
    saveState({ neverShow: true, skipUntil: null });
    setVisible(false);
  };

  const handleStar = async () => {
    try {
      await openUrl("https://github.com/novincode/dlman");
    } catch (err) {
      console.error("Failed to open GitHub:", err);
    }
    // Don't hide immediately, let them come back
  };

  const handleSponsor = async () => {
    try {
      await openUrl("https://github.com/sponsors/novincode");
    } catch (err) {
      console.error("Failed to open sponsors page:", err);
    }
  };

  // Get icon based on hovered button - using Lucide icons for cross-platform consistency
  const getIcon = () => {
    switch (hoveredButton) {
      case "skip":
        // "Not now" - slightly sad face
        return <Meh className="h-8 w-8 text-amber-500 animate-pulse" />;
      case "never":
        // "Don't show again" - very sad face
        return <Frown className="h-8 w-8 text-red-500 animate-bounce" />;
      case "star":
        return <Star className="h-8 w-8 text-yellow-500 fill-yellow-500" />;
      case "sponsor":
        return <HeartHandshake className="h-8 w-8 text-pink-500" />;
      default:
        // Default - poker face / neutral
        return <HeartPulse className="h-8 w-8 text-red-500" />;
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-8 left-4 z-50 animate-in slide-in-from-left-4 fade-in duration-300">
      <div className="bg-background/95 backdrop-blur-sm border rounded-xl shadow-lg p-5 max-w-[320px]">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-2 right-2 text-muted-foreground hover:text-amber-500 hover:scale-110 transition-all duration-200"
          onMouseEnter={() => setHoveredButton("skip")}
          onMouseLeave={() => setHoveredButton(null)}
          title="Not now (15 days)"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3">
          {/* Icon that reacts - using Lucide icons for cross-platform consistency */}
          <div className="transition-all duration-200 select-none flex items-center justify-center w-10 h-10">
            {getIcon()}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground">
              Enjoying DLMan?
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Your support helps keep it free and awesome
            </p>

            {/* Action buttons */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleStar}
                onMouseEnter={() => setHoveredButton("star")}
                onMouseLeave={() => setHoveredButton(null)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                  "bg-secondary hover:bg-secondary/80 text-secondary-foreground",
                  hoveredButton === "star" && "ring-2 ring-yellow-400/50"
                )}
              >
                <Star className="h-3.5 w-3.5" />
                Star
              </button>
              <button
                onClick={handleSponsor}
                onMouseEnter={() => setHoveredButton("sponsor")}
                onMouseLeave={() => setHoveredButton(null)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                  "bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400",
                  hoveredButton === "sponsor" && "ring-2 ring-pink-400/50"
                )}
              >
                <Heart className="h-3.5 w-3.5" />
                Sponsor
              </button>
            </div>

            {/* Secondary actions */}
            <div className="flex gap-3 mt-2">
              <button
                onClick={handleSkip}
                onMouseEnter={() => setHoveredButton("skip")}
                onMouseLeave={() => setHoveredButton(null)}
                className="text-[10px] text-muted-foreground hover:text-amber-500 transition-colors font-medium"
                title="Skip for 15 days"
              >
                Not now
              </button>
              <button
                onClick={handleNever}
                onMouseEnter={() => setHoveredButton("never")}
                onMouseLeave={() => setHoveredButton(null)}
                className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors font-medium"
                title="Never show again"
              >
                Don't show again
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
