import React from 'react';

interface ThientchLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  subtitle?: string;
  className?: string;
  variant?: 'light' | 'dark'; // dark: on dark bg, light: on white bg
}

export const ThientchLogo: React.FC<ThientchLogoProps> = ({
  size = 'md',
  showText = true,
  subtitle,
  className = '',
  variant = 'dark',
}) => {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-3xl',
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Circuit & Code T Icon */}
      <div
        className={`${iconSizes[size]} relative rounded-2xl p-0.5 bg-gradient-to-br from-[#00D2FF] via-[#0066FF] to-[#00FF88] shadow-lg shadow-blue-500/20 flex items-center justify-center shrink-0 group`}
      >
        <div className="w-full h-full bg-[#071324] rounded-[14px] flex items-center justify-center relative overflow-hidden">
          
          {/* Subtle circuit grid background */}
          <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#00FF88_1px,transparent_1px)] [background-size:6px_6px]" />

          {/* Glowing core SVG Icon:
              - Stylized 'T' (Tech/Thien)
              - Electronic circuit board nodes & lines
              - Code curly brackets { }
              - Exam Checkmark (Matrix Neon Green)
          */}
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full p-1.5 relative z-10 drop-shadow-[0_0_8px_rgba(0,255,136,0.5)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Circuit Traces */}
            <path
              d="M16 28 H30 L38 38"
              stroke="#0066FF"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.8"
            />
            <circle cx="16" cy="28" r="3" fill="#00FF88" />

            <path
              d="M84 28 H70 L62 38"
              stroke="#0066FF"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.8"
            />
            <circle cx="84" cy="28" r="3" fill="#00FF88" />

            <path
              d="M32 78 H22"
              stroke="#0066FF"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.6"
            />
            <circle cx="22" cy="78" r="2.5" fill="#00D2FF" />

            <path
              d="M68 78 H78"
              stroke="#0066FF"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.6"
            />
            <circle cx="78" cy="78" r="2.5" fill="#00D2FF" />

            {/* Code Braces { } surrounding the T */}
            {/* Left Brace { */}
            <path
              d="M26 40 C22 40 20 44 20 50 C20 54 18 56 15 56 C18 56 20 58 20 62 C20 68 22 72 26 72"
              stroke="#00D2FF"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.75"
            />
            
            {/* Right Brace } */}
            <path
              d="M74 40 C78 40 80 44 80 50 C80 54 82 56 85 56 C82 56 80 58 80 62 C80 68 78 72 74 72"
              stroke="#00D2FF"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.75"
            />

            {/* Stylized Modern 'T' Body */}
            {/* Horizontal Bar of T */}
            <path
              d="M28 24 H72"
              stroke="url(#techBlueGrad)"
              strokeWidth="7"
              strokeLinecap="round"
            />
            {/* Vertical Stem of T */}
            <path
              d="M50 24 V68"
              stroke="url(#techBlueGrad)"
              strokeWidth="7"
              strokeLinecap="round"
            />

            {/* Center Neon Pulse Dot */}
            <circle cx="50" cy="24" r="3.5" fill="#00FF88" />

            {/* Exam Checkmark - Neon Matrix Green overlay */}
            <path
              d="M44 58 L54 68 L76 44"
              stroke="#00FF88"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-[0_0_6px_#00FF88]"
            />

            {/* Gradients */}
            <defs>
              <linearGradient id="techBlueGrad" x1="28" y1="24" x2="72" y2="68" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00E5FF" />
                <stop offset="0.5" stopColor="#0066FF" />
                <stop offset="1" stopColor="#0052CC" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span
              className={`${textSizes[size]} font-black tracking-tight font-sans select-none ${
                variant === 'dark' ? 'text-white' : 'text-slate-950'
              }`}
            >
              THIEN<span className="text-[#0066FF]">TCH</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-[#00FF88] border border-emerald-500/30">
              IT::EXAM
            </span>
          </div>
          {subtitle && (
            <p
              className={`text-[11px] leading-tight select-none ${
                variant === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
