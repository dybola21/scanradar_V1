import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface AnimatedRadarSceneProps {
  className?: string;
  size?: number;
}

/**
 * SVG Building Silhouette
 */
const BuildingIcon = ({ x, y, size = 6, delay, duration }: { x: number, y: number, size?: number, delay: number, duration: number }) => {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <g 
        className="radar-detection"
        style={{ 
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`
        }}
      >
        <svg
          x={-size / 2}
          y={-size / 2}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-[#22C55E]"
        >
          <path
            d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16M9 7h2m-2 4h2m-2 4h2m2-8h2m-2 4h2m-2 4h2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </g>
    </g>
  );
};

export function AnimatedRadarScene({ className, size = 400 }: AnimatedRadarSceneProps) {
  const rotationDuration = 5; // seconds per full rotation

  // Detectable points inside the 48-radius circle
  const points = useMemo(() => [
    { x: 72, y: 35 },
    { x: 32, y: 65 },
    { x: 58, y: 78 },
    { x: 45, y: 18 },
    { x: 80, y: 55 },
    { x: 28, y: 38 },
    { x: 18, y: 62 },
    { x: 65, y: 22 },
    { x: 40, y: 82 },
    { x: 55, y: 45 },
  ].map(p => {
    const dx = p.x - 50;
    const dy = p.y - 50;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Ensure the point is strictly inside the radar radius (48) with margin
    let finalX = p.x;
    let finalY = p.y;
    if (distance > 42) {
      const ratio = 42 / distance;
      finalX = 50 + dx * ratio;
      finalY = 50 + dy * ratio;
    }

    const finalDx = finalX - 50;
    const finalDy = finalY - 50;
    let angle = Math.atan2(finalDy, finalDx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    
    const delay = ((angle / 360) * rotationDuration) - rotationDuration;
    
    return { x: finalX, y: finalY, angle, delay };
  }), [rotationDuration]);

  return (
    <div 
      className={cn("flex items-center justify-center shrink-0 overflow-visible", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full block overflow-visible"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id="radar-clip-path">
            <circle cx="50" cy="50" r="48" />
          </clipPath>
          <linearGradient id="radarSweepGradient" x1="19.2" y1="13.2" x2="50" y2="2" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        <style>
          {`
            @keyframes scanRotate {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .radar-sweep-group {
              transform-origin: 50px 50px;
              animation: scanRotate ${rotationDuration}s linear infinite;
            }
            
            @keyframes detectionSequence {
              0% { opacity: 0; transform: scale(0.7); }
              1% { opacity: 1; transform: scale(1.1); filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.6)); }
              5% { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 2px rgba(34, 197, 94, 0.4)); }
              15% { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 1px rgba(34, 197, 94, 0.2)); }
              20% { opacity: 0; transform: scale(0.9); }
              100% { opacity: 0; }
            }

            .radar-detection {
              opacity: 0;
              animation: detectionSequence ${rotationDuration}s linear infinite;
              transform-box: fill-box;
              transform-origin: center;
            }

            @media (prefers-reduced-motion: reduce) {
              .radar-sweep-group {
                animation: none;
                transform: rotate(45deg);
              }
              .radar-detection {
                opacity: 0.8;
                animation: none;
              }
            }
            
            .radar-grid-line {
              stroke: rgba(56, 189, 248, 0.08);
              stroke-width: 0.2;
            }
          `}
        </style>
        
        {/* Background Grid */}
        <g className="radar-grid">
          <circle cx="50" cy="50" r="10" fill="none" className="radar-grid-line" />
          <circle cx="50" cy="50" r="20" fill="none" className="radar-grid-line" />
          <circle cx="50" cy="50" r="30" fill="none" className="radar-grid-line" />
          <circle cx="50" cy="50" r="40" fill="none" className="radar-grid-line" />
          <circle cx="50" cy="50" r="48" fill="none" className="radar-grid-line" strokeWidth="0.4" />
          
          {/* Axis lines */}
          <line x1="50" y1="2" x2="50" y2="98" className="radar-grid-line" />
          <line x1="2" y1="50" x2="98" y2="50" className="radar-grid-line" />
        </g>

        {/* Detected Icons clipped to radar area */}
        <g clipPath="url(#radar-clip-path)">
          {points.map((p, i) => (
            <BuildingIcon 
              key={i} 
              x={p.x} 
              y={p.y} 
              size={5} 
              delay={p.delay} 
              duration={rotationDuration} 
            />
          ))}
        </g>

        {/* Scanning Sweep */}
        <g className="radar-sweep-group">
          {/* Translucent sector (shadow) BEHIND the line */}
          <path
            d="M 50 50 L 19.2 13.2 A 48 48 0 0 1 50 2 Z"
            fill="url(#radarSweepGradient)"
            opacity="0.8"
          />
          {/* Leading edge line */}
          <line 
            x1="50" y1="50" x2="50" y2="2" 
            stroke="#38BDF8" 
            strokeWidth="0.8" 
            strokeLinecap="round" 
          />
        </g>

        {/* Center Point */}
        <circle cx="50" cy="50" r="1.5" fill="#38BDF8" />
        <circle cx="50" cy="50" r="4" fill="#38BDF8" opacity="0.1" />
      </svg>
    </div>
  );
}
