import * as React from "react";
import { ChevronUp, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface TimePickerProps {
  value: string | null;
  onChange: (time: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  use24Hour?: boolean;
  className?: string;
}

interface TimeState {
  hours: number;
  minutes: number;
  period: "AM" | "PM";
}

function parseTime(time: string | null, use24Hour: boolean): TimeState {
  if (!time) {
    const now = new Date();
    return {
      hours: use24Hour ? now.getHours() : (now.getHours() % 12) || 12,
      minutes: 0,
      period: now.getHours() >= 12 ? "PM" : "AM",
    };
  }
  
  const [hours, minutes] = time.split(":").map(Number);
  
  if (use24Hour) {
    return { hours, minutes, period: hours >= 12 ? "PM" : "AM" };
  }
  
  return {
    hours: hours === 0 ? 12 : hours > 12 ? hours - 12 : hours,
    minutes,
    period: hours >= 12 ? "PM" : "AM",
  };
}

function formatTime(state: TimeState, use24Hour: boolean): string {
  let hours = state.hours;
  
  if (!use24Hour) {
    if (state.period === "PM" && hours !== 12) {
      hours += 12;
    } else if (state.period === "AM" && hours === 12) {
      hours = 0;
    }
  }
  
  return `${hours.toString().padStart(2, "0")}:${state.minutes.toString().padStart(2, "0")}`;
}

function formatDisplayTime(time: string | null, use24Hour: boolean): string {
  if (!time) return "";
  
  const [hours, minutes] = time.split(":").map(Number);
  
  if (use24Hour) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }
  
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export function TimePicker({
  value,
  onChange,
  placeholder = "Select time",
  disabled = false,
  use24Hour = false,
  className,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [timeState, setTimeState] = React.useState<TimeState>(() => 
    parseTime(value, use24Hour)
  );
  
  // Update internal state when value changes externally
  React.useEffect(() => {
    setTimeState(parseTime(value, use24Hour));
  }, [value, use24Hour]);
  
  const handleConfirm = React.useCallback(() => {
    onChange(formatTime(timeState, use24Hour));
    setOpen(false);
  }, [timeState, use24Hour, onChange]);
  
  const handleClear = React.useCallback(() => {
    onChange(null);
    setOpen(false);
  }, [onChange]);
  
  const incrementHours = () => {
    setTimeState(prev => {
      const maxHours = use24Hour ? 23 : 12;
      const minHours = use24Hour ? 0 : 1;
      let newHours = prev.hours + 1;
      if (newHours > maxHours) newHours = minHours;
      return { ...prev, hours: newHours };
    });
  };
  
  const decrementHours = () => {
    setTimeState(prev => {
      const maxHours = use24Hour ? 23 : 12;
      const minHours = use24Hour ? 0 : 1;
      let newHours = prev.hours - 1;
      if (newHours < minHours) newHours = maxHours;
      return { ...prev, hours: newHours };
    });
  };
  
  const incrementMinutes = () => {
    setTimeState(prev => {
      let newMinutes = prev.minutes + 5;
      if (newMinutes >= 60) newMinutes = 0;
      return { ...prev, minutes: newMinutes };
    });
  };
  
  const decrementMinutes = () => {
    setTimeState(prev => {
      let newMinutes = prev.minutes - 5;
      if (newMinutes < 0) newMinutes = 55;
      return { ...prev, minutes: newMinutes };
    });
  };
  
  const togglePeriod = () => {
    setTimeState(prev => ({
      ...prev,
      period: prev.period === "AM" ? "PM" : "AM",
    }));
  };
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {value ? formatDisplayTime(value, use24Hour) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="flex flex-col gap-4">
          {/* Time Spinners */}
          <div className="flex items-center justify-center gap-2">
            {/* Hours */}
            <div className="flex flex-col items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={incrementHours}
                tabIndex={-1}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <input
                type="text"
                inputMode="numeric"
                value={timeState.hours.toString().padStart(2, "0")}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  const maxHours = use24Hour ? 23 : 12;
                  const minHours = use24Hour ? 0 : 1;
                  const clamped = Math.max(minHours, Math.min(maxHours, val));
                  setTimeState(prev => ({ ...prev, hours: clamped }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    incrementHours();
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    decrementHours();
                  }
                }}
                className="flex h-12 w-14 items-center justify-center text-center rounded-lg bg-muted text-2xl font-semibold tabular-nums border-0 focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={decrementHours}
                tabIndex={-1}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Separator */}
            <div className="text-2xl font-semibold text-muted-foreground">:</div>
            
            {/* Minutes */}
            <div className="flex flex-col items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={incrementMinutes}
                tabIndex={-1}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <input
                type="text"
                inputMode="numeric"
                value={timeState.minutes.toString().padStart(2, "0")}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  const clamped = Math.max(0, Math.min(59, val));
                  setTimeState(prev => ({ ...prev, minutes: clamped }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    incrementMinutes();
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    decrementMinutes();
                  }
                }}
                className="flex h-12 w-14 items-center justify-center text-center rounded-lg bg-muted text-2xl font-semibold tabular-nums border-0 focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={decrementMinutes}
                tabIndex={-1}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            
            {/* AM/PM Toggle (only for 12-hour format) */}
            {!use24Hour && (
              <div className="flex flex-col items-center ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={togglePeriod}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <div 
                  className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-lg font-semibold text-primary cursor-pointer hover:bg-primary/20 transition-colors"
                  onClick={togglePeriod}
                >
                  {timeState.period}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={togglePeriod}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          
          {/* Quick Select */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "6:00", time: "06:00" },
              { label: "9:00", time: "09:00" },
              { label: "12:00", time: "12:00" },
              { label: "18:00", time: "18:00" },
              { label: "21:00", time: "21:00" },
              { label: "23:00", time: "23:00" },
              { label: "0:00", time: "00:00" },
              { label: "3:00", time: "03:00" },
            ].map(({ label, time }) => (
              <Button
                key={time}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  const parsed = parseTime(time, use24Hour);
                  setTimeState(parsed);
                }}
              >
                {use24Hour ? label : formatDisplayTime(time, false).replace(":00 ", " ").replace(":00", "")}
              </Button>
            ))}
          </div>
          
          {/* Actions */}
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground"
            >
              Clear
            </Button>
            <Button size="sm" onClick={handleConfirm}>
              Set Time
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Compact inline time picker for forms
interface InlineTimePickerProps {
  value: string | null;
  onChange: (time: string | null) => void;
  use24Hour?: boolean;
  className?: string;
}

export function InlineTimePicker({
  value,
  onChange,
  use24Hour = false,
  className,
}: InlineTimePickerProps) {
  const timeState = parseTime(value, use24Hour);
  
  const updateTime = (updates: Partial<TimeState>) => {
    const newState = { ...timeState, ...updates };
    onChange(formatTime(newState, use24Hour));
  };
  
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <input
        type="number"
        min={use24Hour ? 0 : 1}
        max={use24Hour ? 23 : 12}
        value={timeState.hours}
        onChange={(e) => updateTime({ hours: parseInt(e.target.value) || 0 })}
        className="w-12 h-9 text-center text-sm font-medium bg-muted rounded-md border-0 focus:ring-2 focus:ring-primary"
      />
      <span className="text-muted-foreground font-bold">:</span>
      <input
        type="number"
        min={0}
        max={59}
        value={timeState.minutes.toString().padStart(2, "0")}
        onChange={(e) => updateTime({ minutes: parseInt(e.target.value) || 0 })}
        className="w-12 h-9 text-center text-sm font-medium bg-muted rounded-md border-0 focus:ring-2 focus:ring-primary"
      />
      {!use24Hour && (
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-2 font-medium"
          onClick={() => updateTime({ period: timeState.period === "AM" ? "PM" : "AM" })}
        >
          {timeState.period}
        </Button>
      )}
    </div>
  );
}
