import { useEffect, useRef, useState, useCallback } from 'react';
import { checkExamStatus, reportExamViolation } from '../services/dbService.ts';

export interface ExamViolationLog {
  id: string;
  time: string;
  type: string;
  label: string;
}

export interface UseExamSecurityOptions {
  studentId?: string;
  studentName?: string;
  studentCode?: string;
  examId?: string;
  examTitle?: string;
  submissionId?: string;
  isTeacherTesting?: boolean;
  enabled?: boolean;
  maxViolations?: number;
  onMaxViolationsExceeded?: () => void;
  onViolation?: (violation: ExamViolationLog) => void;
  onViolationRecorded?: (type: string, label: string) => void;
}

export function useExamSecurity({
  studentId,
  studentName,
  studentCode,
  examId,
  examTitle,
  submissionId,
  isTeacherTesting = false,
  enabled = true,
  maxViolations = 3,
  onMaxViolationsExceeded,
  onViolation,
  onViolationRecorded,
}: UseExamSecurityOptions = {}) {
  const [violationCount, setViolationCount] = useState<number>(0);
  const [violationLogs, setViolationLogs] = useState<ExamViolationLog[]>([]);
  const [isExamOpen, setIsExamOpen] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string>('');
  const [isTeacherUnlocked, setIsTeacherUnlocked] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const isFinishedRef = useRef<boolean>(false);

  const reEnterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement as any;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) {
        await req.call(el, { navigationUI: 'hide' });
      }
    } catch {}
  }, []);

  const manuallyCheckStatus = useCallback(async () => {
    if (!examId) return;
    setIsChecking(true);
    try {
      const res = await checkExamStatus(examId);
      setIsExamOpen(res.isOpen);
    } catch {}
    finally {
      setIsChecking(false);
    }
  }, [examId]);

  const recordViolation = useCallback(
    async (type: string, label: string) => {
      if (!enabled || isTeacherTesting || isFinishedRef.current) return;

      const log: ExamViolationLog = {
        id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: new Date().toLocaleTimeString('vi-VN'),
        type,
        label,
      };

      setViolationLogs((prev) => [...prev, log]);
      setViolationCount((prev) => {
        const next = prev + 1;
        if (next >= maxViolations && onMaxViolationsExceeded) {
          onMaxViolationsExceeded();
        }
        return next;
      });

      if (onViolation) {
        onViolation(log);
      }
      if (onViolationRecorded) {
        onViolationRecorded(type, label);
      }

      if (submissionId) {
        await reportExamViolation(submissionId, { type, label, time: log.time });
      }
    },
    [enabled, isTeacherTesting, maxViolations, onMaxViolationsExceeded, onViolation, onViolationRecorded, submissionId]
  );

  // Kiểm tra trạng thái đề thi
  useEffect(() => {
    if (!examId) return;
    let isMounted = true;
    checkExamStatus(examId)
      .then((res) => {
        if (isMounted) setIsExamOpen(res.isOpen);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [examId]);

  // Thiết lập các bộ lắng nghe sự kiện chống gian lận
  useEffect(() => {
    if (isTeacherTesting) return;

    // Chặn chuột phải
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      recordViolation('contextmenu', 'Nhấn chuột phải trong lúc làm bài');
      return false;
    };

    // Chặn bôi đen
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
      return false;
    };

    // Chặn phím tắt (Alt, Win, F12, DevTools, Ctrl+Shift+I, Ctrl+C, Ctrl+V, Alt+Tab, v.v.)
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code || '';

      // 1. Chặn phím Alt ngay lập tức
      if (e.key === 'Alt' || code === 'AltLeft' || code === 'AltRight' || e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('alt_key', 'Phát hiện bấm phím Alt (Cấm sử dụng Alt / Alt+Tab chuyển màn hình)');
        return false;
      }

      // 2. Chặn phím Windows ngay lập tức
      if (e.key === 'Meta' || e.key === 'OS' || code === 'MetaLeft' || code === 'MetaRight' || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('win_key', 'Phát hiện bấm phím Windows (Cấm sử dụng phím Win / Win+D)');
        return false;
      }

      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C'))) {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('devtools', 'Cố tình mở công cụ lập trình viên (F12 / Inspect)');
        return false;
      }

      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('view_source', 'Cố tình xem mã nguồn bài thi (Ctrl+U)');
        return false;
      }

      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        recordViolation('clipboard_copy', 'Thực hiện thao tác sao chép nội dung');
        return false;
      }

      if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        recordViolation('clipboard_paste', 'Thực hiện thao tác dán nội dung từ bên ngoài');
        return false;
      }

      if (e.altKey && e.key === 'Tab') {
        recordViolation('tab_switch', 'Sử dụng Alt+Tab để chuyển ứng dụng');
      }
    };

    // Chặn rời khỏi tab bài thi
    const handleVisibilityChange = () => {
      if (document.hidden && !isFinishedRef.current) {
        recordViolation('visibility', 'Rời khỏi tab bài thi hoặc ẩn cửa sổ trình duyệt');
      }
    };

    const handleWindowBlur = () => {
      if (!isFinishedRef.current) {
        recordViolation('blur', 'Chuyển con trỏ ra ngoài bài thi sang ứng dụng khác');
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('selectstart', handleSelectStart);
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('selectstart', handleSelectStart);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isTeacherTesting, recordViolation]);

  return {
    isLocked,
    lockReason,
    isTeacherUnlocked,
    isChecking,
    reEnterFullscreen,
    manuallyCheckStatus,
    setIsLocked,
    violationCount,
    violationLogs,
    isExamOpen,
    recordViolation,
    finishExam: () => {
      isFinishedRef.current = true;
    },
  };
}
