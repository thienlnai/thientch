import React, { useEffect, useState } from 'react';

interface TopEdgeSecurityGuardProps {
  className?: string;
  showWarningNotice?: boolean;
}

/**
 * TopEdgeSecurityGuard
 * Bảo vệ và khóa triệt để cạnh trên màn hình ở tất cả các giao diện (Làm bài, Điểm thi, Xem lại đáp án, v.v.).
 * Ngăn chặn trình duyệt Chromium/Chrome/Edge hiển thị bong bóng / nút X màu đen khi học sinh rê chuột lên mép trên màn hình.
 */
export const TopEdgeSecurityGuard: React.FC<TopEdgeSecurityGuardProps> = ({
  className = '',
  showWarningNotice = true,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Capture-phase event listeners to intercept mouse and pointer interactions near the top edge
  useEffect(() => {
    const handleTopMouseMove = (e: MouseEvent) => {
      // Khi con trỏ chuột chạm vào vùng sát mép trên cùng (<= 6px)
      if (e.clientY <= 6) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleTopClick = (e: MouseEvent) => {
      // Chặn và nuốt toàn bộ sự kiện click sát mép trên để không kích hoạt bất kỳ nút thoát nào của trình duyệt
      if (e.clientY <= 14) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const handleTopPointer = (e: PointerEvent) => {
      if (e.clientY <= 6) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('mousemove', handleTopMouseMove, { capture: true, passive: false });
    window.addEventListener('mouseover', handleTopMouseMove, { capture: true, passive: false });
    window.addEventListener('mouseenter', handleTopMouseMove, { capture: true, passive: false });
    window.addEventListener('pointermove', handleTopPointer, { capture: true, passive: false });
    window.addEventListener('pointerover', handleTopPointer, { capture: true, passive: false });
    window.addEventListener('pointerenter', handleTopPointer, { capture: true, passive: false });

    window.addEventListener('mousedown', handleTopClick, { capture: true, passive: false });
    window.addEventListener('mouseup', handleTopClick, { capture: true, passive: false });
    window.addEventListener('click', handleTopClick, { capture: true, passive: false });
    window.addEventListener('dblclick', handleTopClick, { capture: true, passive: false });
    window.addEventListener('contextmenu', handleTopClick, { capture: true, passive: false });

    return () => {
      window.removeEventListener('mousemove', handleTopMouseMove, { capture: true });
      window.removeEventListener('mouseover', handleTopMouseMove, { capture: true });
      window.removeEventListener('mouseenter', handleTopMouseMove, { capture: true });
      window.removeEventListener('pointermove', handleTopPointer, { capture: true });
      window.removeEventListener('pointerover', handleTopPointer, { capture: true });
      window.removeEventListener('pointerenter', handleTopPointer, { capture: true });

      window.removeEventListener('mousedown', handleTopClick, { capture: true });
      window.removeEventListener('mouseup', handleTopClick, { capture: true });
      window.removeEventListener('click', handleTopClick, { capture: true });
      window.removeEventListener('dblclick', handleTopClick, { capture: true });
      window.removeEventListener('contextmenu', handleTopClick, { capture: true });
    };
  }, []);

  return (
    <>
      {/* VÙNG CHẮN BẢO VỆ CẠNH TRÊN: Ngăn chặn triệt để dấu X màu đen hoặc thanh thoát toàn màn hình khi rê chuột */}
      <div
        className={`fixed top-0 left-0 right-0 h-3.5 sm:h-4 z-[9999999] pointer-events-auto bg-transparent select-none cursor-default touch-none ${className}`}
        style={{
          zIndex: 9999999,
          pointerEvents: 'auto',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          top: 0,
          left: 0,
          right: 0,
          height: '14px',
        }}
        onMouseEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}
        onMouseMove={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseUp={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />

      {/* Thông báo nhắc nhở tinh tế khi học sinh rê chuột lên cạnh trên */}
      {showWarningNotice && isHovered && (
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999999] pointer-events-none transition-all animate-in fade-in slide-in-from-top-1"
          style={{ zIndex: 9999999 }}
        >
          <div className="px-3.5 py-1.5 rounded-full bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-xl border border-slate-700">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>🔒 Mép trên màn hình đã được khóa an toàn (Không thể đóng / thoát tại đây)</span>
          </div>
        </div>
      )}
    </>
  );
};
