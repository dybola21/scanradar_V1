import { cn } from "@/lib/utils";

interface ScanRadarLogoProps {
  className?: string;
  size?: number;
  theme?: "light" | "dark";
  showWordmark?: boolean;
  orientation?: "horizontal" | "vertical";
  iconOnly?: boolean;
}

export function ScanRadarLogo({
  className,
  size = 32,
  theme = "dark",
  showWordmark = true,
  orientation = "horizontal",
  iconOnly = false,
}: ScanRadarLogoProps) {
  const isDark = theme === "dark";
  
  // Wordmark colors
  const scanColor = isDark ? "#F6F8FB" : "#0B1220";
  const radarColor = isDark ? "#38BDF8" : "#0284C7";
  
  // Symbol colors
  const primaryBlue = "#38BDF8";
  const secondaryBlue = "#0284C7";
  const accentGreen = "#22C55E";

  const symbol = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      {/* Outer radar arc - incomplete for movement */}
      <path
        d="M38.5 11.5C43.5 17.5 44.5 26.5 40.5 34.5C36.5 42.5 28.5 45.5 20.5 44C12.5 42.5 6.5 36.5 4.5 28.5C2.5 20.5 4.5 12.5 9.5 7.5"
        stroke={primaryBlue}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      
      {/* Inner radar arc */}
      <path
        d="M30 19C32 21.5 32.5 25.5 31.5 29C30.5 32.5 27.5 35 24 35.5C20.5 36 17 34 15.5 30.5C14 27 14.5 23 16.5 20.5"
        stroke={secondaryBlue}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      
      {/* Center point */}
      <circle cx="24" cy="24" r="2.2" fill={accentGreen} />
      
      {/* Scan line and detected company node */}
      <g>
        <line
          x1="24"
          y1="24"
          x2="35"
          y2="13"
          stroke={primaryBlue}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        {/* Company node (square with rounded corners) */}
        <rect
          x="33"
          y="11"
          width="7"
          height="7"
          rx="2"
          fill={accentGreen}
        />
      </g>
    </svg>
  );

  if (iconOnly) {
    return (
      <div className={cn("inline-flex items-center justify-center", className)}>
        {symbol}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-[11px]",
        orientation === "vertical" ? "flex-col text-center" : "flex-row",
        className
      )}
    >
      {symbol}
      {showWordmark && (
        <span
          className="font-geist font-[700] tracking-tight pointer-events-none select-none"
          style={{ 
            fontSize: size * 0.72, // Scale text relative to logo size (approx 23-25px for 36px logo)
            lineHeight: 1 
          }}
        >
          <span style={{ color: scanColor }}>Scan</span>
          <span style={{ color: radarColor }}>Radar</span>
        </span>
      )}
    </div>
  );
}
