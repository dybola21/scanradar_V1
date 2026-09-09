import { cn } from "@/lib/utils";

interface AnimatedRadarLogoProps {
  className?: string;
  size?: number;
  variant?: "logo" | "hero";
}

export function AnimatedRadarLogo({ className, size = 34, variant = "logo" }: AnimatedRadarLogoProps) {
  const isHero = variant === "hero";
  
  return (
    <div 
      className={cn("flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full block"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <style>
          {`
            @keyframes scanRotate {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .radar-sweep-group {
              transform-origin: 50px 50px;
              animation: scanRotate 5s linear infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .radar-sweep-group {
                animation: none;
              }
            }
            @keyframes blipPulse {
              0% { opacity: 0.2; transform: scale(0.8); }
              50% { opacity: 1; transform: scale(1.2); }
              100% { opacity: 0.2; transform: scale(0.8); }
            }
            .radar-blip {
              animation: blipPulse 2.5s ease-in-out infinite;
            }
            .radar-blip-1 { animation-delay: 0s; transform-origin: 70px 30px; }
            .radar-blip-2 { animation-delay: 1.2s; transform-origin: 30px 60px; }
            .radar-blip-3 { animation-delay: 0.8s; transform-origin: 60px 75px; }
            
            .map-line {
              stroke: rgba(56, 189, 248, 0.05);
              stroke-width: 0.5;
            }
          `}
        </style>
        
        {/* Background Layer */}
        <circle cx="50" cy="50" r="48" fill={isHero ? "transparent" : "#172033"} />
        
        {/* Abstract Map Elements (Hero only) */}
        {isHero && (
          <g className="map-elements">
            <path d="M10 20 L90 20 M10 40 L90 40 M10 60 L90 60 M10 80 L90 80" className="map-line" />
            <path d="M20 10 L20 90 M40 10 L40 90 M60 10 L60 90 M80 10 L80 90" className="map-line" />
            <path d="M30 30 Q50 10 70 30 T90 50" fill="none" className="map-line" strokeWidth="0.3" />
          </g>
        )}

        {/* Concentric Circles */}
        <circle cx="50" cy="50" r="15" fill="none" stroke="rgba(56, 189, 248, 0.15)" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(56, 189, 248, 0.15)" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(56, 189, 248, 0.15)" strokeWidth="0.8" />
        
        {/* Crosshair lines */}
        <line x1="50" y1="5" x2="50" y2="95" stroke="rgba(56, 189, 248, 0.1)" strokeWidth="0.5" />
        <line x1="5" y1="50" x2="95" y2="50" stroke="rgba(56, 189, 248, 0.1)" strokeWidth="0.5" />

        {/* Scanning Sweep */}
        <g className="radar-sweep-group">
          {/* Leading edge line at 50, 5 */}
          <path
            d="M 50 50 L 21.2 15.5 A 45 45 0 0 1 50 5 Z"
            fill="url(#radarSweepGradient2)"
            opacity="0.6"
          />
          <line 
            x1="50" y1="50" x2="50" y2="5" 
            stroke="#38BDF8" 
            strokeWidth="1.2" 
            strokeLinecap="round" 
          />
        </g>

        {/* Detected Points (Blips) */}
        <circle cx="70" cy="30" r="2" fill="#22C55E" className="radar-blip radar-blip-1" />
        <circle cx="30" cy="60" r="1.5" fill="#22C55E" className="radar-blip radar-blip-2" />
        <circle cx="60" cy="75" r="1.8" fill="#22C55E" className="radar-blip radar-blip-3" />

        {/* Center Point */}
        <circle cx="50" cy="50" r="2" fill="#38BDF8" />

        <defs>
          <linearGradient id="radarSweepGradient2" x1="21.2" y1="15.5" x2="50" y2="5" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.3" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
