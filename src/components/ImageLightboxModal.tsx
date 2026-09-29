import React, { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Image as ImageIcon } from 'lucide-react';

interface ImageLightboxModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  title?: string;
  alt?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  imageUrl,
  title = 'Xem hình ảnh chi tiết',
  alt = 'Hình ảnh phóng to',
  onClose,
}) => {
  const [scale, setScale] = useState(1);

  // Reset zoom scale when opening or changing image
  useEffect(() => {
    if (isOpen) {
      setScale(1);
    }
  }, [isOpen, imageUrl]);

  // Handle ESC key and +/- shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setScale((prev) => Math.min(prev + 0.25, 3));
      } else if (e.key === '-') {
        setScale((prev) => Math.max(prev - 0.25, 0.5));
      } else if (e.key === '0') {
        setScale(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-70 flex flex-col justify-between bg-slate-950/90 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200 select-none"
    >
      {/* Header bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl mx-auto flex items-center justify-between gap-4 py-2 px-4 bg-slate-900/90 border border-slate-800 rounded-2xl text-white shadow-xl shrink-0"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-100 truncate">{title}</h3>
            <span className="text-[11px] text-slate-400 font-mono">
              Độ phóng đại: {Math.round(scale * 100)}%
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-xl p-0.5 shadow-xs">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700/80 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Thu nhỏ (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 text-xs font-mono font-semibold text-slate-300 hover:text-white hover:bg-slate-700/80 rounded-lg transition-colors cursor-pointer"
              title="Đặt lại 100% (Phím 0)"
            >
              1:1
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 3}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700/80 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Phóng to (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white border border-slate-700 hover:border-rose-500 transition-colors cursor-pointer font-bold text-xs"
            title="Đóng lightbox (Phím ESC)"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Đóng</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono text-slate-300">
              ESC
            </kbd>
          </button>
        </div>
      </div>

      {/* Main Image Area */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-auto min-h-0">
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-200 ease-out"
          style={{ transform: `scale(${scale})` }}
        >
          <img
            src={imageUrl}
            alt={alt}
            className="max-h-[76vh] max-w-[92vw] object-contain rounded-2xl shadow-2xl border border-slate-700/50 bg-slate-900/60"
          />
        </div>
      </div>

      {/* Bottom Hint */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-auto text-center py-1.5 px-4 bg-slate-900/80 border border-slate-800 rounded-xl text-[11px] text-slate-400 font-medium shrink-0 pointer-events-none"
      >
        Nhấp ra ngoài vùng tối, nhấn nút <strong>✕ Đóng</strong> hoặc nhấn phím <strong>ESC</strong> để quay lại bài thi
      </div>
    </div>
  );
};
