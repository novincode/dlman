import { useEffect, useState, useCallback } from "react";
import { X, Star, Heart } from "lucide-react";
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

  const handleStar = () => {
    window.open("https://github.com/novincode/dlman", "_blank");
    // Don't hide immediately, let them come back
  };

  const handleSponsor = () => {
    window.open("https://github.com/sponsors/novincode", "_blank");
  };

  // Get emoji based on hovered button
  const getEmoji = () => {
    switch (hoveredButton) {
      case "skip":
        return "🥹";
      case "never":
        return "🥲";
      case "star":
        return "⭐";
      case "sponsor":
        return "🫶";
      default:
        return "💙";
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-4 z-50 animate-in slide-in-from-left-4 fade-in duration-300">
      <div className="bg-background/95 backdrop-blur-sm border rounded-xl shadow-lg p-4 max-w-[280px]">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
          onMouseEnter={() => setHoveredButton("skip")}
          onMouseLeave={() => setHoveredButton(null)}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3">
          {/* Emoji that reacts */}
          <div className="text-2xl transition-all duration-200 select-none">
            {getEmoji()}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Enjoying DLMan?
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your support helps keep it free
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
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Not now
              </button>
              <button
                onClick={handleNever}
                onMouseEnter={() => setHoveredButton("never")}
                onMouseLeave={() => setHoveredButton(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
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
