import { useState, useEffect, useRef, useCallback } from 'react';
import { checkExamStatus, reportExamViolation } from '../services/dbService.ts';

/**
 * =========================================================================================
 * HOOK BẢO MẬT PHÒNG THI TỐI ƯU ROW READ TURSO DATABASE (useExamSecurity.ts)
 * =========================================================================================
 * 
 * 1. LƯU Ý KỸ THUẬT VỀ PHÍM WINDOWS / ALT+TAB:
 *    Các phím như phím Windows (Super/Meta key) và tổ hợp Alt+Tab được xử lý trực tiếp
 *    ở tầng Kernel / Shell của Hệ điều hành (Windows, macOS, Linux). Trình duyệt web
 *    không có quyền can thiệp (preventDefault) ở cấp phần cứng đối với các phím này.
 *    Tuy nhiên, hệ thống giải quyết triệt để thông qua các sự kiện:
 *    - 'visibilitychange' (document.hidden = true)
 *    - 'blur' (window mất focus khi chuyển sang ứng dụng khác)
 *    - 'fullscreenchange' (!document.fullscreenElement khi nhấn ESC hoặc bị OS thu nhỏ)
 *    Bất kỳ hành vi nhấn phím Windows hoặc Alt+Tab nào đều ngay lập tức kích hoạt
 *    sự kiện rời màn hình và bị xử lý vi phạm trong vòng 0ms.
 * 
 * 2. CHIẾN LƯỢC TỐI ƯU TURSO DATABASE (ZERO POLLING KHI ĐANG THI):
 *    - TUYỆT ĐỐI KHÔNG dùng setInterval để query Turso liên tục khi học sinh đang làm bài bình thường.
 *      (0 Rows Read tới Turso Database trong suốt thời gian thi).
 *    - Chỉ khi phát hiện !document.fullscreenElement (nhấn ESC) hoặc chuyển tab / rời cửa sổ:
 *      Frontend mới lập tức gọi API (GET /api/check-exam-status).
 *    - Nếu API trả về allow_exit_fullscreen === true (giáo viên đã cho phép trước đó): Không làm gì cả.
 *    - Nếu allow_exit_fullscreen === false:
 *        + Bật State isLocked = true (hiển thị màn hình khóa overlay).
 *        + Đồng thời gọi API POST /api/exam-violation để UPDATE Turso DB, đổi trạng thái
 *          học sinh thành VIOLATION_EXIT_SCREEN để báo cho giáo viên.
 *    - CHỈ KHI màn hình bị khóa (isLocked === true): Mới bật một setInterval query Turso
 *      5 giây/lần (5000ms) để chờ giáo viên mở khóa (update allow_exit_fullscreen = true).
 *    - Khi được mở khóa: Ẩn overlay, dừng interval, và yêu cầu học sinh click để vào lại Fullscreen.
 */

export interface UseExamSecurityOptions {
  studentId: string;
  studentName?: string;
  studentCode?: string;
  examId?: string;
  examTitle?: string;
  enabled?: boolean; // false nếu là giáo viên làm thử hoặc đã nộp bài
  onViolationRecorded?: (type: string, reason: string) => void;
}

export interface UseExamSecurityReturn {
  isLocked: boolean;
  lockReason: string;
  isTeacherUnlocked: boolean;
  isChecking: boolean;
  reEnterFullscreen: () => Promise<boolean>;
  manuallyCheckStatus: () => Promise<void>;
  setIsLocked: (locked: boolean) => void;
}

export function useExamSecurity({
  studentId,
  studentName = '',
  studentCode = '',
  examId = '',
  examTitle = '',
  enabled = true,
  onViolationRecorded,
}: UseExamSecurityOptions): UseExamSecurityReturn {
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string>('');
  const [isTeacherUnlocked, setIsTeacherUnlocked] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  // Refs để lưu trữ trạng thái đồng bộ tránh stale closures trong event listeners
  const isLockedRef = useRef<boolean>(false);
  isLockedRef.current = isLocked;

  const isHandlingViolationRef = useRef<boolean>(false);
  const lastCheckTimeRef = useRef<number>(0);
  const pollingTimerRef = useRef<any>(null);

  /**
   * =========================================================================
   * HÀM XỬ LÝ KHI PHÁT HIỆN THOÁT TOÀN MÀN HÌNH HOẶC CHUYỂN TAB
   * =========================================================================
   */
  const handlePotentialViolation = useCallback(
    async (violationType: string, defaultReason: string) => {
      if (!enabled || isLockedRef.current || isHandlingViolationRef.current) {
        return;
      }

      // Chống duplicate trigger trong 800ms (ví dụ vừa blur vừa visibilitychange)
      const now = Date.now();
      if (now - lastCheckTimeRef.current < 800) {
        return;
      }
      lastCheckTimeRef.current = now;
      isHandlingViolationRef.current = true;
      setIsChecking(true);

      try {
        // 1. GỌI API KIỂM TRA QUYỀN THOÁT (GET /api/check-exam-status)
        // Đây là lần ĐỌC DUY NHẤT (Rows Read = 1) khi xảy ra sự kiện
        const statusRes = await checkExamStatus(studentId);

        // 2. Nếu Giáo viên đã cấp quyền trước đó: Cho phép thoát, không khóa
        if (statusRes.allow_exit_fullscreen) {
          console.info('Giáo viên đã cho phép thoát toàn màn hình trước đó.');
          isHandlingViolationRef.current = false;
          setIsChecking(false);
          return;
        }

        // 3. Nếu CHƯA ĐƯỢC PHÉP:
        // - Bật State isLocked = true
        // - Gọi API POST /api/exam-violation để UPDATE Turso DB thành VIOLATION_EXIT_SCREEN
        setLockReason(defaultReason);
        setIsLocked(true);
        setIsTeacherUnlocked(false);

        if (onViolationRecorded) {
          onViolationRecorded(violationType, defaultReason);
        }

        // UPDATE Turso DB báo cáo vi phạm cho giáo viên
        await reportExamViolation(studentId, examId, defaultReason);
      } catch (err) {
        console.warn('Lỗi kiểm tra quyền thi:', err);
        // Fallback an toàn: Khóa màn hình để phòng chống gian lận
        setLockReason(defaultReason);
        setIsLocked(true);
      } finally {
        isHandlingViolationRef.current = false;
        setIsChecking(false);
      }
    },
    [enabled, studentId, examId, onViolationRecorded]
  );

  /**
   * =========================================================================
   * 1. CHẶN THAO TÁC: CHUỘT PHẢI, COPY/PASTE VÀ PHÍM TẮT NGUY HIỂM
   * =========================================================================
   */
  useEffect(() => {
    if (!enabled) return;

    // a. Chặn chuột phải (contextmenu)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onViolationRecorded) {
        onViolationRecorded('contextmenu', 'Nhấp chuột phải trong lúc làm bài');
      }
      return false;
    };

    // b. Chặn các phím cấm: F11, F12, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+P, Ctrl+S, Alt
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key || '';
      const keyLower = key.toLowerCase();
      const code = e.code || '';

      // 1. Phím Alt (Đơn lẻ hoặc tổ hợp như Alt+Tab, Alt+F4)
      if (e.key === 'Alt' || code.startsWith('Alt') || e.altKey) {
        // Ghi chú: Alt+Tab do OS can thiệp, nhưng sự kiện 'blur' bên dưới sẽ bắt ngay
        if (e.key === 'Alt' || code === 'AltLeft' || code === 'AltRight' || (e.altKey && e.key === 'F4')) {
          e.preventDefault();
          e.stopPropagation();
          if (onViolationRecorded) {
            onViolationRecorded('alt_key', 'Nhấn phím Alt hoặc tổ hợp phím cấm');
          }
          return false;
        }
      }

      // 2. Chặn F11 (Phóng to / Thu nhỏ trình duyệt)
      if (key === 'F11' || code === 'F11') {
        e.preventDefault();
        e.stopPropagation();
        if (onViolationRecorded) {
          onViolationRecorded('f11', 'Nhấn phím F11');
        }
        return false;
      }

      // 3. Chặn F12 (DevTools / Công cụ lập trình)
      if (key === 'F12' || code === 'F12') {
        e.preventDefault();
        e.stopPropagation();
        if (onViolationRecorded) {
          onViolationRecorded('f12', 'Nhấn phím F12 (Mở DevTools)');
        }
        return false;
      }

      // 4. Chặn Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+P, Ctrl+S (và Cmd trên macOS)
      if (e.ctrlKey || e.metaKey) {
        if (['c', 'v', 'x', 'p', 's'].includes(keyLower)) {
          e.preventDefault();
          e.stopPropagation();
          const actionName =
            keyLower === 'c' ? 'Sao chép (Ctrl+C)' :
            keyLower === 'v' ? 'Dán dữ liệu (Ctrl+V)' :
            keyLower === 'x' ? 'Cắt nội dung (Ctrl+X)' :
            keyLower === 'p' ? 'In trang (Ctrl+P)' : 'Lưu trang (Ctrl+S)';
          if (onViolationRecorded) {
            onViolationRecorded('forbidden_shortcut', `Thao tác phím tắt cấm: ${actionName}`);
          }
          return false;
        }
      }

      // 5. Chặn ESC (Thoát toàn màn hình)
      if (key === 'Escape' || code === 'Escape') {
        // Cho dù ESC có thoát fullscreen được hay không, trình duyệt vẫn kích hoạt fullscreenchange
        handlePotentialViolation('escape_pressed', 'Nhấn phím ESC để thoát toàn màn hình');
      }
    };

    // c. Chặn trực tiếp copy/cut/paste
    const handleClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      if (onViolationRecorded) {
        onViolationRecorded('clipboard', 'Cố ý sao chép hoặc dán nội dung bài thi');
      }
      return false;
    };

    window.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('copy', handleClipboard, true);
    window.addEventListener('paste', handleClipboard, true);
    window.addEventListener('cut', handleClipboard, true);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('copy', handleClipboard, true);
      window.removeEventListener('paste', handleClipboard, true);
      window.removeEventListener('cut', handleClipboard, true);
    };
  }, [enabled, handlePotentialViolation, onViolationRecorded]);

  /**
   * =========================================================================
   * 2. BẮT SỰ KIỆN RỜI MÀN HÌNH / THOÁT FULLSCREEN / CHUYỂN TAB
   * =========================================================================
   */
  useEffect(() => {
    if (!enabled) return;

    // a. Phát hiện thoát toàn màn hình
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = Boolean(
        document.fullscreenElement || (document as any).webkitFullscreenElement
      );

      if (!isCurrentlyFullscreen) {
        handlePotentialViolation(
          'exit_fullscreen',
          'Rời khỏi chế độ Toàn Màn Hình (nhấn ESC hoặc thu nhỏ cửa sổ)'
        );
      }
    };

    // b. Phát hiện chuyển tab hoặc ẩn cửa sổ
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handlePotentialViolation(
          'tab_switch',
          'Chuyển tab trình duyệt hoặc ẩn cửa sổ bài thi'
        );
      }
    };

    // c. Phát hiện chuyển cửa sổ ứng dụng (Alt+Tab hoặc Windows key)
    const handleWindowBlur = () => {
      handlePotentialViolation(
        'window_blur',
        'Mất tiêu điểm cửa sổ (chuyển sang ứng dụng khác qua Alt+Tab hoặc Start Menu)'
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [enabled, handlePotentialViolation]);

  /**
   * =========================================================================
   * 3. CHIẾN LƯỢC POLLING 5S KHI ĐANG BỊ KHÓA (CHỜ GIÁO VIÊN MỞ KHÓA)
   * =========================================================================
   * Chỉ khi isLocked === true mới bật interval 5s/lần query Turso để đón lệnh mở khóa.
   * Ngay khi allow_exit_fullscreen = true hoặc status = 'active', tắt ngay interval!
   */
  useEffect(() => {
    if (!enabled || !isLocked) {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return;
    }

    const checkTeacherUnlock = async () => {
      try {
        const res = await checkExamStatus(studentId);
        // Nếu giáo viên đã mở khóa (allow_exit_fullscreen === true hoặc trạng thái đã về active)
        if (res.allow_exit_fullscreen || res.status === 'active') {
          console.info('Giáo viên đã mở khóa phòng thi cho học sinh.');
          setIsTeacherUnlocked(true);
          // Tắt interval ngay lập tức để tiết kiệm lượt read
          if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
            pollingTimerRef.current = null;
          }
        }
      } catch (err) {
        console.warn('Lỗi thăm dò mở khóa:', err);
      }
    };

    // Chạy kiểm tra sau mỗi 5000ms (5 giây)
    pollingTimerRef.current = setInterval(checkTeacherUnlock, 5000);

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [enabled, isLocked, studentId]);

  /**
   * =========================================================================
   * 4. HÀM VÀO LẠI TOÀN MÀN HÌNH SAU KHI ĐƯỢC GIÁO VIÊN MỞ KHÓA
   * =========================================================================
   */
  const reEnterFullscreen = useCallback(async (): Promise<boolean> => {
    try {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        const el = document.documentElement as any;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (req) {
          await req.call(el);
        }
      }
      setIsLocked(false);
      setIsTeacherUnlocked(false);
      setLockReason('');
      return true;
    } catch (err) {
      console.warn('Không thể vào lại toàn màn hình:', err);
      // Dù browser có chặn fullscreen, vẫn gỡ khóa nếu giáo viên đã duyệt
      setIsLocked(false);
      setIsTeacherUnlocked(false);
      return false;
    }
  }, []);

  const manuallyCheckStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await checkExamStatus(studentId);
      if (res.allow_exit_fullscreen || res.status === 'active') {
        setIsTeacherUnlocked(true);
      }
    } finally {
      setIsChecking(false);
    }
  }, [studentId]);

  return {
    isLocked,
    lockReason,
    isTeacherUnlocked,
    isChecking,
    reEnterFullscreen,
    manuallyCheckStatus,
    setIsLocked,
  };
}
