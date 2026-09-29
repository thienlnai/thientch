import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HotspotRegion, HotspotStudentClick } from '../types/index.ts';
import { Trash2, MapPin, Check, X, ZoomIn, Maximize2 } from 'lucide-react';

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

interface ImageBounds {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
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
  // Refs trỏ trực tiếp vào thẻ <img> để đo kích thước thực tế sau khi loại bỏ letterboxing
  const mainImgRef = useRef<HTMLImageElement>(null);
  const zoomImgRef = useRef<HTMLImageElement>(null);

  // Kích thước hiển thị thực tế của ảnh (đã trừ khoảng trống object-fit: contain)
  const [mainBounds, setMainBounds] = useState<ImageBounds | null>(null);
  const [zoomBounds, setZoomBounds] = useState<ImageBounds | null>(null);

  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Modal phóng to
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomHoverCoords, setZoomHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringZoom, setIsHoveringZoom] = useState(false);

  // Hàm tính toán kích thước & vị trí hiển thị thực tế của ảnh bên trong thẻ <img> (Loại bỏ Letterboxing)
  const calculateImageContentBounds = (img: HTMLImageElement | null): ImageBounds | null => {
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    if (!naturalWidth || !naturalHeight || rect.width <= 0 || rect.height <= 0) {
      return {
        offsetX: 0,
        offsetY: 0,
        width: rect.width,
        height: rect.height,
      };
    }

    const naturalRatio = naturalWidth / naturalHeight;
    const renderedRatio = rect.width / rect.height;

    let width = rect.width;
    let height = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    // Trường hợp khung chứa rộng hơn tỷ lệ ảnh -> xuất hiện khoảng trống (letterbox) ở 2 bên trái & phải
    if (renderedRatio > naturalRatio) {
      width = rect.height * naturalRatio;
      offsetX = (rect.width - width) / 2;
    }
    // Trường hợp khung chứa cao hơn tỷ lệ ảnh -> xuất hiện khoảng trống (letterbox) ở trên & dưới
    else if (renderedRatio < naturalRatio) {
      height = rect.width / naturalRatio;
      offsetY = (rect.height - height) / 2;
    }

    return {
      offsetX: Math.round(offsetX * 10) / 10,
      offsetY: Math.round(offsetY * 10) / 10,
      width: Math.round(width * 10) / 10,
      height: Math.round(height * 10) / 10,
    };
  };

  // Cập nhật lại bounds khi resize hoặc ảnh tải xong
  const updateAllBounds = useCallback(() => {
    if (mainImgRef.current) {
      const b = calculateImageContentBounds(mainImgRef.current);
      if (b && b.width > 0 && b.height > 0) setMainBounds(b);
    }
    if (zoomImgRef.current) {
      const b = calculateImageContentBounds(zoomImgRef.current);
      if (b && b.width > 0 && b.height > 0) setZoomBounds(b);
    }
  }, []);

  useEffect(() => {
    updateAllBounds();
    window.addEventListener('resize', updateAllBounds);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        updateAllBounds();
      });
      if (mainImgRef.current) ro.observe(mainImgRef.current);
      if (zoomImgRef.current) ro.observe(zoomImgRef.current);
    }

    const timer = setTimeout(updateAllBounds, 60);

    return () => {
      window.removeEventListener('resize', updateAllBounds);
      if (ro) ro.disconnect();
      clearTimeout(timer);
    };
  }, [imageUrl, isZoomOpen, updateAllBounds]);

  // Lắng nghe phím ESC để đóng modal phóng to
  useEffect(() => {
    if (!isZoomOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsZoomOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomOpen]);

  // Tính tọa độ phần trăm (%) dựa trên overlay thực của ảnh (loại bỏ 100% letterboxing)
  const getPercentCoordsFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const x = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    const y = Math.max(0, Math.min(100, (clickY / rect.height) * 100));
    return {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
    };
  };

  // ================= XỬ LÝ CHO GIÁO VIÊN VẼ VÙNG ĐÚNG =================
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditor) return;
    const coords = getPercentCoordsFromEvent(e);
    setDrawingStart(coords);
    setCurrentBox({ x: coords.x, y: coords.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditor || !drawingStart) return;
    const coords = getPercentCoordsFromEvent(e);
    const x = Math.min(drawingStart.x, coords.x);
    const y = Math.min(drawingStart.y, coords.y);
    const width = Math.abs(coords.x - drawingStart.x);
    const height = Math.abs(coords.y - drawingStart.y);
    setCurrentBox({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (!isEditor || !drawingStart || !currentBox) return;
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

  // ================= XỬ LÝ CHO HỌC SINH CHẤM ĐIỂM (BẢN GỐC & PHÓNG TO) =================
  const handleStudentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isStudent || !onStudentClicksChange) return;
    const coords = getPercentCoordsFromEvent(e);

    if (studentClicks.length < maxClicks) {
      onStudentClicksChange([...studentClicks, coords]);
    } else {
      const updated = [...studentClicks.slice(0, maxClicks - 1), coords];
      onStudentClicksChange(updated);
    }
  };

  const handleZoomMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isStudent) return;
    const coords = getPercentCoordsFromEvent(e);
    setZoomHoverCoords(coords);
    setIsHoveringZoom(true);
  };

  const handleZoomMouseLeave = () => {
    setIsHoveringZoom(false);
    setZoomHoverCoords(null);
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
      {/* Banner hướng dẫn và thanh công cụ phóng to tách biệt */}
      {isEditor && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-xs text-blue-900">
          <span>
            💡 <strong>Hướng dẫn GV:</strong> Nhấn giữ chuột và kéo trên ảnh để vẽ vùng chữ nhật đáp án đúng ({regions.length} vùng đã vẽ).
          </span>
          <div className="flex items-center gap-2">
            {regions.length > 0 && (
              <span className="font-semibold text-blue-700">
                Học sinh sẽ được chọn tối đa {regions.length} điểm
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsZoomOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              title="Phóng to hình ảnh"
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Phóng to</span>
            </button>
          </div>
        </div>
      )}

      {isStudent && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl text-xs text-emerald-950 shadow-2xs">
          <div className="flex items-center gap-2">
            <span>
              🎯 <strong>Yêu cầu:</strong> Nhấp chuột lên hình ảnh để chọn vị trí đáp án. Đã chọn:{' '}
              <strong className="text-rose-600 font-mono font-black">{studentClicks.length}/{maxClicks}</strong> điểm.
            </span>
          </div>

          {/* Cụm nút thao tác tách biệt hoàn toàn khỏi khu vực click ảnh */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsZoomOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="Phóng to hình ảnh để quan sát rõ hơn và nhấp chọn điểm chính xác"
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Phóng to hình ảnh</span>
            </button>

            {studentClicks.length > 0 && (
              <button
                type="button"
                onClick={() => onStudentClicksChange && onStudentClicksChange([])}
                className="px-2.5 py-1.5 rounded-xl text-xs text-rose-700 hover:bg-rose-100/70 border border-rose-200 font-bold cursor-pointer transition-colors"
              >
                Xóa điểm đã chọn
              </button>
            )}
          </div>
        </div>
      )}

      {isReview && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/90 border border-slate-200/90 px-4 py-2 rounded-xl text-xs shadow-xs mb-3">
          <div className="flex flex-wrap items-center gap-2.5">
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
          <button
            type="button"
            onClick={() => setIsZoomOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            title="Xem lại chi tiết ở kích thước lớn"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>Phóng to</span>
          </button>
        </div>
      )}

      {/* ================= VÙNG CANVAS HIỂN THỊ ẢNH GỐC ================= */}
      <div
        className="relative w-full max-w-2xl mx-auto rounded-xl overflow-hidden border border-slate-300 shadow-inner bg-slate-900/5 flex items-center justify-center"
        style={{ minHeight: '260px' }}
      >
        <div className="relative inline-block max-w-full">
          <img
            ref={mainImgRef}
            src={imageUrl}
            alt="Câu hỏi khảo sát Hotspot"
            onLoad={updateAllBounds}
            className="w-full h-auto object-contain block pointer-events-none select-none max-h-[480px] mx-auto"
          />

          {/* Lớp overlay tương tác khít 100% với kích thước thực tế của ảnh (loại bỏ letterboxing) */}
          <div
            style={{
              position: 'absolute',
              left: mainBounds ? `${mainBounds.offsetX}px` : 0,
              top: mainBounds ? `${mainBounds.offsetY}px` : 0,
              width: mainBounds ? `${mainBounds.width}px` : '100%',
              height: mainBounds ? `${mainBounds.height}px` : '100%',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleStudentClick}
            className={`select-none ${
              isEditor ? 'cursor-crosshair' : isStudent ? 'cursor-crosshair' : 'cursor-default'
            }`}
          >
            {/* 1. Hiển thị các vùng đúng đã vẽ của Giáo viên */}
            {(isEditor || isReview) &&
              regions.map((r, idx) => (
                <div
                  key={r.id}
                  style={{
                    position: 'absolute',
                    left: `${r.x}%`,
                    top: `${r.y}%`,
                    width: `${r.width}%`,
                    height: `${r.height}%`,
                  }}
                  className={`border-2 rounded-lg transition-all ${
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
                  position: 'absolute',
                  left: `${currentBox.x}%`,
                  top: `${currentBox.y}%`,
                  width: `${currentBox.width}%`,
                  height: `${currentBox.height}%`,
                }}
                className="border-2 border-dashed border-amber-400 bg-amber-400/25 pointer-events-none"
              />
            )}

            {/* 2. Marker điểm chọn của Học sinh (Dấu X màu đỏ với tâm chuẩn 100% tại điểm click) */}
            {isStudent &&
              studentClicks.map((click, idx) => (
                <div
                  key={idx}
                  style={{
                    position: 'absolute',
                    left: `${click.x}%`,
                    top: `${click.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className="group z-30 pointer-events-auto"
                >
                  <div className="relative flex items-center justify-center">
                    <span className="absolute w-8 h-8 rounded-full bg-rose-500/35 animate-ping pointer-events-none" />
                    <div className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg border-2 border-white text-xs font-black ring-2 ring-rose-400 select-none cursor-pointer">
                      <X className="w-4 h-4 stroke-[3]" />
                    </div>
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow pointer-events-none whitespace-nowrap border border-white/20">
                      #{idx + 1} (X: {click.x}%, Y: {click.y}%)
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleRemoveStudentClick(idx, e)}
                    className="hidden group-hover:flex absolute -top-3.5 -right-3.5 w-5 h-5 bg-slate-800 hover:bg-rose-700 text-white rounded-full items-center justify-center shadow text-[10px] cursor-pointer transition-colors"
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
                  style={{
                    position: 'absolute',
                    left: `${item.click.x}%`,
                    top: `${item.click.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className="z-30 pointer-events-auto"
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
      </div>

      {/* ================= MODAL / LIGHTBOX VIEW PHÓNG TO HÌNH ẢNH HOTSPOT ================= */}
      {isZoomOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsZoomOpen(false)}
          className="fixed inset-0 z-70 flex flex-col justify-between bg-slate-950/90 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200 select-none"
        >
          {/* Top Bar Modal */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-6xl mx-auto flex items-center justify-between gap-3 py-2 px-4 bg-slate-900/90 border border-slate-800 rounded-2xl text-white shadow-xl shrink-0"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
                <Maximize2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-100 truncate">
                  Phóng To Hình Ảnh Câu Hỏi Hotspot
                </h3>
                <span className="text-[11px] text-slate-400">
                  {isStudent
                    ? 'Nhấp chuột trực tiếp lên hình ảnh để chọn tọa độ đáp án (Đồng bộ tức thời)'
                    : 'Chế độ xem kích thước lớn'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsZoomOpen(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white border border-slate-700 hover:border-rose-500 transition-colors cursor-pointer font-bold text-xs"
              title="Đóng chế độ phóng to (Phím ESC)"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Đóng</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono text-slate-300">
                ESC
              </kbd>
            </button>
          </div>

          {/* Vùng Canvas phóng to tương tác */}
          <div className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-auto min-h-0">
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative inline-block max-w-full max-h-[75vh] select-none rounded-2xl overflow-hidden shadow-2xl border border-slate-700/60 bg-slate-900"
            >
              <img
                ref={zoomImgRef}
                src={imageUrl}
                alt="Bản đồ Hotspot phóng to"
                onLoad={updateAllBounds}
                className="max-h-[72vh] max-w-[88vw] object-contain block pointer-events-none select-none mx-auto"
              />

              {/* Lớp overlay tương tác khít 100% với kích thước thực tế của ảnh phóng to (Đã loại bỏ khoảng trống Letterboxing) */}
              <div
                style={{
                  position: 'absolute',
                  left: zoomBounds ? `${zoomBounds.offsetX}px` : 0,
                  top: zoomBounds ? `${zoomBounds.offsetY}px` : 0,
                  width: zoomBounds ? `${zoomBounds.width}px` : '100%',
                  height: zoomBounds ? `${zoomBounds.height}px` : '100%',
                }}
                onClick={handleStudentClick}
                onMouseMove={handleZoomMouseMove}
                onMouseLeave={handleZoomMouseLeave}
                className={`select-none ${isStudent ? 'cursor-crosshair' : 'cursor-default'}`}
              >
                {/* Tooltip 'Nhấp để chọn' khi hover di chuyển trên ảnh */}
                {isStudent && isHoveringZoom && zoomHoverCoords && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${zoomHoverCoords.x}%`,
                      top: `${zoomHoverCoords.y}%`,
                      transform: 'translate(-50%, -120%)',
                    }}
                    className="pointer-events-none z-40 bg-slate-900/95 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-xl border border-white/20 whitespace-nowrap flex items-center gap-1.5 backdrop-blur-xs transition-transform"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                    <span>Nhấp để chọn (X: {zoomHoverCoords.x}%, Y: {zoomHoverCoords.y}%)</span>
                  </div>
                )}

                {/* 1. Hiển thị các vùng đúng trong bản phóng to (GV hoặc Review) */}
                {(isEditor || isReview) &&
                  regions.map((r, idx) => (
                    <div
                      key={r.id}
                      style={{
                        position: 'absolute',
                        left: `${r.x}%`,
                        top: `${r.y}%`,
                        width: `${r.width}%`,
                        height: `${r.height}%`,
                      }}
                      className={`border-2 rounded-lg transition-all ${
                        isReview
                          ? 'border-emerald-500 bg-emerald-500/30 ring-4 ring-emerald-400/50 shadow-[0_0_25px_rgba(16,185,129,0.55)]'
                          : 'border-blue-500 bg-blue-500/25'
                      }`}
                    >
                      <div className="absolute top-1 left-1 bg-slate-900/90 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold pointer-events-none shadow-xs border border-white/20">
                        {isReview ? `Vùng đúng #${idx + 1}` : r.label || `#${idx + 1}`}
                      </div>
                    </div>
                  ))}

                {/* 2. Hiển thị Marker dấu X màu đỏ tại các điểm đã chọn (Tâm chuẩn 100% tại điểm click) */}
                {isStudent &&
                  studentClicks.map((click, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `${click.x}%`,
                        top: `${click.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className="group z-30 pointer-events-auto"
                    >
                      <div className="relative flex items-center justify-center">
                        <span className="absolute w-9 h-9 rounded-full bg-rose-500/40 animate-ping pointer-events-none" />
                        <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-2xl border-2 border-white text-xs font-black ring-2 ring-rose-400 select-none cursor-pointer">
                          <X className="w-5 h-5 stroke-[3]" />
                        </div>
                        <div className="absolute top-9 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[11px] font-mono font-bold px-2 py-0.5 rounded-md shadow-lg pointer-events-none whitespace-nowrap border border-white/20">
                          #{idx + 1} (X: {click.x}%, Y: {click.y}%)
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleRemoveStudentClick(idx, e)}
                        className="hidden group-hover:flex absolute -top-3.5 -right-3.5 w-6 h-6 bg-slate-800 hover:bg-rose-700 text-white rounded-full items-center justify-center shadow-lg text-xs cursor-pointer transition-colors"
                        title="Bỏ điểm này"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                {/* 3. Review Click Markers */}
                {isReview &&
                  reviewClickResults.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `${item.click.x}%`,
                        top: `${item.click.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className="z-30 pointer-events-auto"
                    >
                      {item.isHit ? (
                        <div
                          className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xl border-2 border-white ring-4 ring-emerald-400/60 drop-shadow-md scale-110"
                          title="Điểm bạn chọn: CHÍNH XÁC (Nằm trong vùng đúng)"
                        >
                          <Check className="w-5 h-5 stroke-[3]" />
                        </div>
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xl border-2 border-white ring-4 ring-rose-400/60 animate-pulse drop-shadow-md scale-110"
                          title="Điểm bạn chọn: SAI (Nằm ngoài vùng đúng)"
                        >
                          <X className="w-5 h-5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Panel thông tin bên trong modal (Điểm đã chọn, Nút xác nhận lựa chọn, Nút đóng) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-6xl mx-auto bg-slate-900/95 border border-slate-800 px-4 sm:px-6 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-white shadow-2xl shrink-0"
          >
            {/* Panel thông tin tọa độ */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold flex items-center gap-2">
                  <span>Điểm đã chọn:</span>
                  {studentClicks.length > 0 ? (
                    <span className="text-rose-400 font-mono font-black">
                      {studentClicks.map((c, i) => `#${i + 1} [X: ${c.x}%, Y: ${c.y}%]`).join(', ')}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal italic">
                      Chưa chọn điểm nào (Vui lòng nhấp chuột lên vị trí ảnh)
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400">
                  Trạng thái: Đã chọn <strong>{studentClicks.length}/{maxClicks}</strong> điểm tối đa
                </div>
              </div>
            </div>

            {/* Các nút hành động */}
            <div className="flex items-center gap-2.5">
              {studentClicks.length > 0 && (
                <button
                  type="button"
                  onClick={() => onStudentClicksChange && onStudentClicksChange([])}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-300 hover:text-white hover:bg-rose-600/30 border border-rose-500/40 cursor-pointer transition-colors"
                >
                  Xóa điểm đã chọn
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer transition-colors"
              >
                Đóng
              </button>

              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Xác nhận lựa chọn</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
