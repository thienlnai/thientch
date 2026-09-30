import { useEffect, useRef, useState, useCallback } from 'react';
import { checkExamStatus, reportExamViolation } from '../services/dbService.ts';

export interface ExamViolationLog {
  id: string;
  time: string;
  type: string;
  label: string;
}

export interface UseExamSecurityOptions {
  examId?: string;
  submissionId?: string;
  isTeacherTesting?: boolean;
  maxViolations?: number;
  onMaxViolationsExceeded?: () => void;
  onViolation?: (violation: ExamViolationLog) => void;
}

export function useExamSecurity({
  examId,
  submissionId,
  isTeacherTesting = false,
  maxViolations = 3,
  onMaxViolationsExceeded,
  onViolation,
}: UseExamSecurityOptions = {}) {
  const [violationCount, setViolationCount] = useState<number>(0);
  const [violationLogs, setViolationLogs] = useState<ExamViolationLog[]>([]);
  const [isExamOpen, setIsExamOpen] = useState<boolean>(true);
  const isFinishedRef = useRef<boolean>(false);

  const recordViolation = useCallback(
    async (type: string, label: string) => {
      if (isTeacherTesting || isFinishedRef.current) return;

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

      if (submissionId) {
        await reportExamViolation(submissionId, { type, label, time: log.time });
      }
    },
    [isTeacherTesting, maxViolations, onMaxViolationsExceeded, onViolation, submissionId]
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

    // Chặn phím tắt (F12, DevTools, Ctrl+Shift+I, Ctrl+C, Ctrl+V, Alt+Tab, v.v.)
    const handleKeyDown = (e: KeyboardEvent) => {
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
    violationCount,
    violationLogs,
    isExamOpen,
    recordViolation,
    finishExam: () => {
      isFinishedRef.current = true;
    },
  };
}
