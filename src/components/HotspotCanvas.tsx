import React, { useState, useRef } from 'react';
import { HotspotRegion, HotspotStudentClick } from '../types/index.ts';
import { Trash2, MapPin, Check, X } from 'lucide-react';

interface HotspotCanvasProps {
  imageUrl: string;
  isEditor?: boolean;
  regions?: HotspotRegion[];
  onRegionsChange?: (regions: HotspotRegion[]) => void;
  isStudent?: boolean;
  studentClicks?: HotspotStudentClick[];
  onStudentClicksChange?: (clicks: HotspotStudentClick[]) => void;
  maxClicks?: number;
  isReview?: boolean;
  reviewClickResults?: { click: HotspotStudentClick; isHit: boolean }[];
}

export const HotspotCanvas: React.FC<HotspotCanvasProps> = ({
  imageUrl,
  isEditor = false,
  regions = [],
  onRegionsChange,
  isStudent = false,
  studentClicks = [],
  onStudentClicksChange,
  maxClicks = 1,
  isReview = false,
  reviewClickResults = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Helper chuyển đổi tọa độ chuột thành %
  const getPercentCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };

  // ================= XỬ LÝ CHO GIÁO VIÊN VẼ VÙNG ĐÚNG =================
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditor) return;
    const coords = getPercentCoords(e);
    setDrawingStart(coords);
    setCurrentBox({ x: coords.x, y: coords.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditor || !drawingStart) return;
    const coords = getPercentCoords(e);
    const x = Math.min(drawingStart.x, coords.x);
    const y = Math.min(drawingStart.y, coords.y);
    const width = Math.abs(coords.x - drawingStart.x);
    const height = Math.abs(coords.y - drawingStart.y);
    setCurrentBox({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (!isEditor || !drawingStart || !currentBox) return;
    // Chỉ lưu nếu vùng vẽ đủ lớn (rộng > 2%, cao > 2%)
    if (currentBox.width >= 2 && currentBox.height >= 2) {
      const newRegion: HotspotRegion = {
        id: `zone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        x: currentBox.x,
        y: currentBox.y,
        width: currentBox.width,
        height: currentBox.height,
        label: `Vùng đúng #${regions.length + 1}`,
      };
      if (onRegionsChange) {
        onRegionsChange([...regions, newRegion]);
      }
    }
    setDrawingStart(null);
    setCurrentBox(null);
  };

  // ================= XỬ LÝ CHO HỌC SINH CHẤM ĐIỂM =================
  const handleStudentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isStudent || !onStudentClicksChange) return;
    const coords = getPercentCoords(e);

    // Nếu đã chọn tối đa điểm, click mới sẽ thay thế điểm cũ nhất hoặc thêm vào
    if (studentClicks.length < maxClicks) {
      onStudentClicksChange([...studentClicks, coords]);
    } else {
      // Đã chọn đủ số điểm: thay thế điểm cuối cùng
      const updated = [...studentClicks.slice(0, maxClicks - 1), coords];
      onStudentClicksChange(updated);
    }
  };

  const handleRemoveStudentClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isStudent || !onStudentClicksChange) return;
    const updated = studentClicks.filter((_, i) => i !== index);
    onStudentClicksChange(updated);
  };

  const handleDeleteRegion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditor || !onRegionsChange) return;
    onRegionsChange(regions.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-2 select-none">
      {/* Banner hướng dẫn */}
      {isEditor && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-xs text-blue-900">
          <span>
            💡 <strong>Hướng dẫn GV:</strong> Nhấn giữ chuột và kéo trên ảnh để vẽ vùng chữ nhật đáp án đúng ({regions.length} vùng đã vẽ).
          </span>
          {regions.length > 0 && (
            <span className="font-semibold text-blue-700">
              Học sinh sẽ được chọn tối đa {regions.length} điểm
            </span>
          )}
        </div>
      )}

      {isStudent && (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs text-emerald-900">
          <span>
            🎯 <strong>Yêu cầu:</strong> Nhấp chuột lên hình ảnh để chọn vị trí đáp án. Đã chọn: <strong>{studentClicks.length}/{maxClicks}</strong> điểm.
          </span>
          {studentClicks.length > 0 && (
            <button
              type="button"
              onClick={() => onStudentClicksChange && onStudentClicksChange([])}
              className="text-xs text-red-600 hover:underline font-semibold cursor-pointer"
            >
              Xóa các điểm đã chọn
            </button>
          )}
        </div>
      )}

      {isReview && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 bg-slate-50/90 border border-slate-200/90 px-4 py-2.5 rounded-2xl text-xs shadow-xs mb-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold shadow-xs">
            <span className="w-3.5 h-3.5 rounded bg-emerald-500 border border-emerald-600 inline-block shadow-xs"></span>
            <span>Vùng đáp án đúng (Màu xanh)</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-400 text-emerald-900 font-bold shadow-xs">
            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shadow-xs">✓</span>
            <span>Bạn chọn ĐÚNG</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-300 text-rose-800 font-bold shadow-xs">
            <span className="w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black shadow-xs">✕</span>
            <span>Bạn chọn SAI</span>
          </div>
        </div>
      )}

      {/* Vùng Canvas hiển thị ảnh */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleStudentClick}
        className={`relative w-full max-w-2xl mx-auto rounded-xl overflow-hidden border border-slate-300 shadow-inner bg-slate-900/5 ${
          isEditor ? 'cursor-crosshair' : isStudent ? 'cursor-pointer' : 'cursor-default'
        }`}
        style={{ minHeight: '260px' }}
      >
        <img
          src={imageUrl}
          alt="Câu hỏi khảo sát Hotspot"
          className="w-full h-auto object-contain block pointer-events-none select-none max-h-[480px] mx-auto"
        />

        {/* 1. Hiển thị các vùng đúng đã vẽ của Giáo viên */}
        {(isEditor || isReview) &&
          regions.map((r, idx) => (
            <div
              key={r.id}
              style={{
                left: `${r.x}%`,
                top: `${r.y}%`,
                width: `${r.width}%`,
                height: `${r.height}%`,
              }}
              className={`absolute border-2 rounded-lg transition-all ${
                isReview
                  ? 'border-emerald-500 bg-emerald-500/25 ring-4 ring-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.45)]'
                  : 'border-blue-500 bg-blue-500/20 hover:bg-blue-500/30'
              }`}
            >
              <div className="absolute top-1 left-1 bg-slate-900/90 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold pointer-events-none shadow-xs border border-white/20">
                {isReview ? `Vùng đúng #${idx + 1}` : r.label || `#${idx + 1}`}
              </div>

              {isEditor && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteRegion(r.id, e)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-600 text-white rounded flex items-center justify-center hover:bg-red-700 transition-colors shadow cursor-pointer"
                  title="Xóa vùng này"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

        {/* Vùng đang vẽ dở (GV) */}
        {isEditor && currentBox && (
          <div
            style={{
              left: `${currentBox.x}%`,
              top: `${currentBox.y}%`,
              width: `${currentBox.width}%`,
              height: `${currentBox.height}%`,
            }}
            className="absolute border-2 border-dashed border-amber-400 bg-amber-400/25 pointer-events-none"
          />
        )}

        {/* 2. Điểm chọn của Học sinh trong lúc làm bài */}
        {isStudent &&
          studentClicks.map((click, idx) => (
            <div
              key={idx}
              style={{ left: `${click.x}%`, top: `${click.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 group z-20"
            >
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg border-2 border-white text-xs font-bold ring-2 ring-emerald-300 animate-bounce">
                {idx + 1}
              </div>
              <button
                type="button"
                onClick={(e) => handleRemoveStudentClick(idx, e)}
                className="hidden group-hover:flex absolute -top-4 -right-4 w-4 h-4 bg-red-600 text-white rounded-full items-center justify-center shadow text-[9px] hover:bg-red-700"
                title="Bỏ điểm này"
              >
                ✕
              </button>
            </div>
          ))}

        {/* 3. Điểm chọn của Học sinh trong chế độ Xem lại đáp án (Review) */}
        {isReview &&
          reviewClickResults.map((item, idx) => (
            <div
              key={idx}
              style={{ left: `${item.click.x}%`, top: `${item.click.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-30"
            >
              {item.isHit ? (
                <div
                  className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xl border-2 border-white ring-4 ring-emerald-400/60 drop-shadow-md scale-110"
                  title="Điểm bạn chọn: CHÍNH XÁC (Nằm trong vùng đúng)"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              ) : (
                <div
                  className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xl border-2 border-white ring-4 ring-rose-400/60 animate-pulse drop-shadow-md scale-110"
                  title="Điểm bạn chọn: SAI (Nằm ngoài vùng đúng)"
                >
                  <X className="w-4 h-4 stroke-[3]" />
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
};
