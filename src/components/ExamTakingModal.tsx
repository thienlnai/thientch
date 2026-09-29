import React, { useState, useEffect, useRef } from 'react';
import { 
  Exam, 
  ExamQuestion, 
  ExamSubmission, 
  Student, 
  UserAccount 
} from '../types/index.ts';
import { 
  shuffleExamQuestionsAndOptions, 
  calculateExamScore 
} from '../utils/studentHelper.ts';
import { autoSaveExamDraft } from '../services/dbService.ts';
import { HotspotCanvas } from './HotspotCanvas.tsx';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Send, 
  ShieldAlert, 
  ChevronLeft, 
  ChevronRight, 
  Award, 
  X, 
  RefreshCw,
  HelpCircle,
  Eye,
  ArrowUp,
  ArrowDown,
  GripVertical,
  RotateCcw,
  Link2,
  Unlink,
  MousePointer,
  Maximize,
  Lock,
  Wifi,
  WifiOff,
  Database,
  HardDrive
} from 'lucide-react';

interface ExamTakingModalProps {
  exam: Exam;
  currentUser: Student | UserAccount;
  isTeacherTesting?: boolean;
  onClose: () => void;
  onSubmitSuccess: (submission: ExamSubmission) => void;
  onReviewAnswers?: (submission: ExamSubmission) => void;
  attemptNumber?: number;
}

export const ExamTakingModal: React.FC<ExamTakingModalProps> = ({
  exam,
  currentUser,
  isTeacherTesting = false,
  onClose,
  onSubmitSuccess,
  onReviewAnswers,
  attemptNumber = 1,
}) => {
  // Khóa lưu tạm localStorage duy nhất cho mỗi học sinh và mỗi đề thi (Offline-First)
  const draftStorageKey = `thientch_exam_draft_${exam.id}_${currentUser.id}`;

  const loadSavedDraft = () => {
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.answers === 'object') {
          return parsed;
        }
      }
    } catch {}
    return null;
  };

  const initialDraft = loadSavedDraft();

  // Snapshot câu hỏi: nếu đã có bản nháp offline thì tái sử dụng đúng bộ câu hỏi và trật tự đã xáo trộn
  const [shuffledQuestions] = useState<ExamQuestion[]>(() => {
    if (initialDraft?.shuffledQuestions && Array.isArray(initialDraft.shuffledQuestions) && initialDraft.shuffledQuestions.length > 0) {
      return initialDraft.shuffledQuestions;
    }
    return shuffleExamQuestionsAndOptions(
      exam.questions,
      exam.isPracticeTest,
      exam.practiceRandomCount
    );
  });

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (typeof initialDraft?.currentIndex === 'number') {
      return Math.min(Math.max(0, initialDraft.currentIndex), (exam.questions?.length || 1) - 1);
    }
    return 0;
  });

  const [answers, setAnswers] = useState<Record<string, any>>(() => {
    if (initialDraft?.answers && typeof initialDraft.answers === 'object') {
      return initialDraft.answers;
    }
    return {};
  });

  const [timeRemaining, setTimeRemaining] = useState<number>(() => {
    if (typeof initialDraft?.timeRemaining === 'number' && initialDraft.timeRemaining > 0) {
      return initialDraft.timeRemaining;
    }
    return exam.durationMinutes * 60;
  });

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string>('');
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [restoredNotification, setRestoredNotification] = useState<boolean>(
    Boolean(initialDraft?.answers && Object.keys(initialDraft.answers).length > 0)
  );
  const [isOnline, setIsOnline] = useState<boolean>(() => 
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const answersRef = useRef<Record<string, any>>(answers);
  answersRef.current = answers;
  const timeRemainingRef = useRef<number>(timeRemaining);
  timeRemainingRef.current = timeRemaining;
  const currentIndexRef = useRef<number>(currentIndex);
  currentIndexRef.current = currentIndex;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [showFullscreenRequiredModal, setShowFullscreenRequiredModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<ExamSubmission | null>(null);

  // Anti-cheat monitoring state
  const [violationCount, setViolationCount] = useState(0);
  const [violationLogs, setViolationLogs] = useState<Array<{ id: string; time: string; type: string; label: string }>>([]);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [currentViolationReason, setCurrentViolationReason] = useState<string>('');
  const lastViolationTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());
  const isFinishedRef = useRef<boolean>(false);

  // Drag and Drop & Matching state
  const [draggedLeftPairId, setDraggedLeftPairId] = useState<string | null>(null);
  const [dragOverRightId, setDragOverRightId] = useState<string | null>(null);
  const [selectedLeftIdForClick, setSelectedLeftIdForClick] = useState<string | null>(null);

  const currentQ = shuffledQuestions[currentIndex];
  const totalQuestions = shuffledQuestions.length;

  // Ghi nhận vi phạm quy chế thi (chuột phải, F12, rời màn hình, phím tắt cấm...)
  const recordViolation = (type: string, label: string) => {
    if (isTeacherTesting || isFinishedRef.current) return;

    // Chống duplicate trigger liên tục trong 1 giây (ví dụ chuyển tab vừa kích hoạt blur vừa kích hoạt visibilitychange)
    const now = Date.now();
    if (now - lastViolationTimeRef.current < 1000) return;
    lastViolationTimeRef.current = now;

    const timeStr = new Date().toLocaleTimeString('vi-VN');
    const logItem = {
      id: `viol_${now}_${Math.random().toString(36).slice(2, 6)}`,
      time: timeStr,
      type,
      label,
    };

    setViolationCount((prev) => prev + 1);
    setViolationLogs((prev) => [...prev, logItem]);
    setCurrentViolationReason(label);
    setShowViolationWarning(true);
  };

  // ================= 1. KÍCH HOẠT CHẾ ĐỘ TOÀN MÀN HÌNH & KHÓA BÀN PHÍM =================
  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          await (document.documentElement as any).webkitRequestFullscreen();
        }
      }
      setIsFullscreen(true);
      setShowFullscreenRequiredModal(false);

      // Khóa các phím hệ thống nguy hiểm qua Keyboard Lock API (Chromium)
      if ('keyboard' in navigator && (navigator as any).keyboard?.lock) {
        try {
          await (navigator as any).keyboard.lock([
            'Escape',
            'AltLeft',
            'AltRight',
            'Tab',
            'MetaLeft',
            'MetaRight',
            'KeyD',
            'F4',
            'F11',
            'F5',
            'KeyR'
          ]);
        } catch {
          // Bỏ qua nếu môi trường không cấp quyền keyboard lock
        }
      }
    } catch (err) {
      console.warn('Yêu cầu Toàn Màn Hình:', err);
    }
  };

  useEffect(() => {
    // Tự động kích hoạt toàn màn hình khi mở bài thi
    enterFullscreen();

    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull && !isFinishedRef.current && !isTeacherTesting) {
        recordViolation('fullscreen_exit', 'Thoát khỏi chế độ toàn màn hình trước khi nộp bài');
        setShowFullscreenRequiredModal(true);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      if ('keyboard' in navigator && (navigator as any).keyboard?.unlock) {
        try {
          (navigator as any).keyboard.unlock();
        } catch {}
      }
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
    };
  }, [isTeacherTesting]);

  // ================= 2. BẢO MẬT PHÒNG THI & CHỐNG GIAN LẬN =================
  useEffect(() => {
    if (isTeacherTesting) return; // Giáo viên làm thử không bị phạt chống gian lận

    // a. Chặn menu chuột phải & ghi nhận vi phạm
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      recordViolation('contextmenu', 'Nhấn chuột phải trong lúc làm bài');
      return false;
    };

    // b. Chặn bôi đen quét khối
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
      return false;
    };

    // c. Chặn các phím tắt hệ thống: Alt+F4, Alt+Tab, Windows+D, Windows key, ESC, F11, F12, Ctrl+U, v.v.
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyLower = e.key ? e.key.toLowerCase() : '';
      const code = e.code || '';

      // 1. Chặn phím Escape (ESC)
      if (e.key === 'Escape' || code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('escape', 'Nhấn phím ESC để thoát toàn màn hình');
        return false;
      }

      // 2. Chặn Alt + F4 (Đóng cửa sổ / ứng dụng)
      if (e.altKey && (e.key === 'F4' || code === 'F4')) {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('alt_f4', 'Tổ hợp phím đóng ứng dụng Alt+F4');
        return false;
      }

      // 3. Chặn Alt + Tab (Chuyển cửa sổ ứng dụng)
      if (e.altKey && (keyLower === 'tab' || e.key === 'Tab' || code === 'Tab')) {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('alt_tab', 'Tổ hợp phím chuyển cửa sổ Alt+Tab');
        return false;
      }

      // 4. Chặn Windows + D (Thu nhỏ ra Desktop)
      if (e.metaKey && (keyLower === 'd' || code === 'KeyD')) {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('win_d', 'Tổ hợp phím thu nhỏ về Desktop (Windows + D)');
        return false;
      }

      // 5. Chặn phím Windows đơn lẻ (Meta / OS key)
      if (e.key === 'Meta' || e.key === 'OS' || code === 'MetaLeft' || code === 'MetaRight') {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('windows_key', 'Nhấn phím Windows (Start Menu)');
        return false;
      }

      // 6. Chặn Ctrl + Escape (Mở Start Menu)
      if (e.ctrlKey && (e.key === 'Escape' || code === 'Escape')) {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('ctrl_esc', 'Tổ hợp phím Ctrl + ESC');
        return false;
      }

      // 7. Chặn F11 (Phóng to / thu nhỏ toàn màn hình)
      if (e.key === 'F11' || code === 'F11') {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('f11', 'Nhấn phím F11');
        return false;
      }

      // 8. Chặn F5 và Ctrl+R (Tải lại trang)
      if (e.key === 'F5' || (e.ctrlKey && keyLower === 'r')) {
        e.preventDefault();
        e.stopPropagation();
        recordViolation('reload', 'Phím tải lại trang (F5 / Ctrl+R)');
        return false;
      }

      // 9. Phím F12 (DevTools)
      if (e.key === 'F12' || code === 'F12') {
        e.preventDefault();
        recordViolation('f12', 'Nhấn phím F12 (Công cụ kiểm tra DevTools)');
        return false;
      }

      // 10. Ctrl+Shift+I / J / C (DevTools)
      if (e.ctrlKey && e.shiftKey && ['i', 'c', 'j'].includes(keyLower)) {
        e.preventDefault();
        recordViolation('devtools', 'Phím tắt mở DevTools / Kiểm tra mã nguồn (Ctrl+Shift+I/J/C)');
        return false;
      }

      // 11. Ctrl+U (Xem mã nguồn)
      if (e.ctrlKey && keyLower === 'u') {
        e.preventDefault();
        recordViolation('view_source', 'Phím tắt xem mã nguồn bài thi (Ctrl+U)');
        return false;
      }

      // 12. Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+F, Ctrl+P, Cmd+C, Cmd+V
      if (
        (e.ctrlKey || e.metaKey) &&
        ['c', 'v', 'x', 'a', 'f', 'p'].includes(keyLower)
      ) {
        e.preventDefault();
        recordViolation('shortcut', `Phím tắt sao chép / thao tác cấm (${e.ctrlKey ? 'Ctrl' : 'Cmd'}+${keyLower.toUpperCase()})`);
        return false;
      }
    };

    // d. Chặn sự kiện sao chép / cắt / dán trực tiếp
    const handleClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      recordViolation('clipboard', 'Cố ý sao chép hoặc dán nội dung trong bài thi');
      return false;
    };

    // e. Phát hiện rời khỏi màn hình bài thi (chuyển tab, thu nhỏ cửa sổ, mở app khác)
    const handleVisibilityChange = () => {
      if (document.hidden && !isFinishedRef.current) {
        recordViolation('visibility', 'Rời khỏi màn hình bài thi (chuyển tab trình duyệt hoặc ẩn cửa sổ)');
      }
    };

    const handleWindowBlur = () => {
      if (!isFinishedRef.current) {
        recordViolation('blur', 'Rời con trỏ khỏi cửa sổ bài thi (chuyển sang ứng dụng khác)');
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('selectstart', handleSelectStart);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('copy', handleClipboard);
    window.addEventListener('paste', handleClipboard);
    window.addEventListener('cut', handleClipboard);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('selectstart', handleSelectStart);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('copy', handleClipboard);
      window.removeEventListener('paste', handleClipboard);
      window.removeEventListener('cut', handleClipboard);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isTeacherTesting]);

  // ================= 2. ĐẾM NGƯỢC THỜI GIAN LÀM BÀI =================
  useEffect(() => {
    // Giáo viên làm thử: KHÔNG TÍNH THỜI GIAN LÀM BÀI
    if (isTeacherTesting || isFinishedRef.current) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTeacherTesting]);

  const handleTimeExpired = () => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    handlePerformSubmission('Hết giờ làm bài! Hệ thống tự động thu bài thi.');
  };

  // ================= 3. LƯU CÂU TRẢ LỜI CHO TỪNG DẠNG CÂU HỎI (OFFLINE-FIRST) =================
  // Không gọi API server mỗi khi học sinh click. Lưu ngay lập tức vào state & localStorage để bảo vệ bài thi.
  const saveDraftToLocalStorage = (updatedAnswers: Record<string, any>) => {
    try {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          examId: exam.id,
          studentId: currentUser.id,
          answers: updatedAnswers,
          shuffledQuestions,
          timeRemaining: timeRemainingRef.current,
          currentIndex: currentIndexRef.current,
          updatedAt: Date.now(),
        })
      );
      setSaveStatus('saved');
    } catch (err) {
      console.warn('Lỗi sao lưu localStorage:', err);
    }
  };

  const updateAnswer = (questionId: string, val: any) => {
    setAnswers((prev) => {
      const next = {
        ...prev,
        [questionId]: val,
      };
      // Lưu tức thì vào localStorage không có độ trễ
      saveDraftToLocalStorage(next);
      return next;
    });
  };

  // Đồng bộ ngầm (Auto-save) sau mỗi 30 giây gom toàn bộ câu trả lời và thời gian
  useEffect(() => {
    if (isTeacherTesting || isFinishedRef.current) return;

    const autoSaveInterval = setInterval(async () => {
      try {
        setSaveStatus('saving');
        // 1. Lưu ngay tức khắc vào localStorage để không bị phụ thuộc vào mạng
        saveDraftToLocalStorage(answersRef.current);

        // 2. Gửi ngầm bản nháp lên server qua autoSaveExamDraft (non-blocking)
        const isStudentUser = 'studentCode' in currentUser;
        const studentCode = isStudentUser ? (currentUser as Student).studentCode : 'GV-TEST';
        const classId = isStudentUser ? (currentUser as Student).classId : exam.classIds[0] || 'CLASS_TEST';
        
        await autoSaveExamDraft({
          examId: exam.id,
          studentId: currentUser.id,
          studentName: currentUser.fullName || currentUser.username,
          studentCode,
          classId,
          answers: answersRef.current,
          timeRemaining: timeRemainingRef.current,
        });

        setSaveStatus('saved');
        setLastAutoSaveTime(new Date().toLocaleTimeString('vi-VN'));
      } catch (err) {
        console.warn('[Auto-save 30s] Đồng bộ ngầm tạm thời không kết nối (bản nháp đã lưu an toàn trên máy):', err);
        setSaveStatus('saved');
      }
    }, 30000); // 30 giây

    return () => clearInterval(autoSaveInterval);
  }, [exam.id, currentUser.id, isTeacherTesting]);

  // b. Chọn nhiều đáp án: Giới hạn đúng số lượng đáp án đúng của GV
  const handleToggleMultipleChoice = (q: ExamQuestion, optionId: string) => {
    const currentList: string[] = answers[q.id] || [];
    const maxSelectable = q.correctOptionIds?.length || 1;

    if (currentList.includes(optionId)) {
      updateAnswer(q.id, currentList.filter((id) => id !== optionId));
    } else {
      if (currentList.length >= maxSelectable) {
        // Hoán đổi: thay thế đáp án đầu tiên hoặc thông báo
        const updated = [...currentList.slice(1), optionId];
        updateAnswer(q.id, updated);
      } else {
        updateAnswer(q.id, [...currentList, optionId]);
      }
    }
  };

  // c. Ghép đôi: Cập nhật cặp ghép qua Kéo thả hoặc Nhấp chuột
  const handleConnectPair = (qId: string, leftId: string, rightId: string) => {
    const currentMatches: Record<string, string> = { ...(answers[qId] || {}) };
    // Nếu có thẻ nào ở cột A đã ghép với rightId này, gỡ liên kết cũ để đảm bảo ánh xạ 1-1
    Object.keys(currentMatches).forEach((k) => {
      if (currentMatches[k] === rightId) {
        delete currentMatches[k];
      }
    });
    currentMatches[leftId] = rightId;
    updateAnswer(qId, currentMatches);
    setSelectedLeftIdForClick(null);
  };

  const handleDisconnectPair = (qId: string, leftId: string) => {
    const currentMatches: Record<string, string> = { ...(answers[qId] || {}) };
    delete currentMatches[leftId];
    updateAnswer(qId, currentMatches);
    if (selectedLeftIdForClick === leftId) {
      setSelectedLeftIdForClick(null);
    }
  };

  const handleResetMatches = (qId: string) => {
    updateAnswer(qId, {});
    setSelectedLeftIdForClick(null);
  };

  const handleUpdateMatching = (qId: string, pairId: string, rightPairId: string) => {
    if (!rightPairId) {
      handleDisconnectPair(qId, pairId);
    } else {
      handleConnectPair(qId, pairId, rightPairId);
    }
  };

  // d. Sắp xếp thứ tự: di chuyển lên/xuống
  const handleMoveOrderItem = (qId: string, fromIndex: number, toIndex: number) => {
    const currentOrder: string[] =
      answers[qId] || (currentQ.orderingItems ? currentQ.orderingItems.map((i) => i.id) : []);
    if (toIndex < 0 || toIndex >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    updateAnswer(qId, newOrder);
  };

  // e. Đúng / Sai: chọn cột
  const handleUpdateTrueFalse = (qId: string, statementId: string, isTrue: boolean) => {
    const currentTF = answers[qId] || {};
    updateAnswer(qId, {
      ...currentTF,
      [statementId]: isTrue,
    });
  };

  // g. Điền từ vào chỗ trống: chọn từ menu sổ xuống
  const handleUpdateFillBlank = (qId: string, blankId: string, chosenWord: string) => {
    const currentBlanks = answers[qId] || {};
    updateAnswer(qId, {
      ...currentBlanks,
      [blankId]: chosenWord,
    });
  };

  // ================= 4. NỘP BÀI THI & TÍNH ĐIỂM =================
  // Đếm số câu đã trả lời và danh sách các câu hỏi chưa làm
  const unansweredList = shuffledQuestions
    .map((q, idx) => ({ q, num: idx + 1 }))
    .filter(({ q }) => {
      const ans = answers[q.id];
      if (ans === undefined || ans === null) return true;
      if (Array.isArray(ans)) return ans.length === 0;
      if (typeof ans === 'object') return Object.keys(ans).length === 0;
      return false;
    });

  const isAllAnswered = unansweredList.length === 0;
  const answeredCount = totalQuestions - unansweredList.length;

  // Xử lý khi nhấn nút Nộp Bài: Chặn nếu chưa làm hết tất cả các câu hỏi
  const handleAttemptSubmit = () => {
    if (!isTeacherTesting && !isAllAnswered) {
      setShowIncompleteModal(true);
      return;
    }
    setShowConfirmSubmit(true);
  };

  const handlePerformSubmission = async (reasonMsg?: string) => {
    if (isSubmitting) return;

    // YÊU CẦU: Không cho học sinh nộp bài nếu chưa làm tất cả các câu hỏi trong đề thi
    if (!isTeacherTesting && !isAllAnswered && reasonMsg !== 'Hết giờ làm bài! Hệ thống tự động thu bài thi.') {
      setShowIncompleteModal(true);
      return;
    }

    setIsSubmitting(true);
    isFinishedRef.current = true;

    // Mở khóa bàn phím và thoát toàn màn hình khi nộp bài xong
    if ('keyboard' in navigator && (navigator as any).keyboard?.unlock) {
      try {
        (navigator as any).keyboard.unlock();
      } catch {}
    }
    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
    }

    const timeSpentSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const scoreResult = calculateExamScore(shuffledQuestions, answers);

    // Xác định thông tin thí sinh
    const isStudentUser = 'studentCode' in currentUser;
    const studentId = currentUser.id;
    const studentName = currentUser.fullName || currentUser.username;
    const studentCode = isStudentUser ? (currentUser as Student).studentCode : 'GV-TEST';
    const classId = isStudentUser ? (currentUser as Student).classId : exam.classIds[0] || 'CLASS_TEST';

    const now = new Date();
    const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

    const submission: ExamSubmission = {
      id: `sub_${Date.now()}`,
      examId: exam.id,
      examTitle: exam.title,
      studentId,
      studentName,
      studentCode,
      classId,
      score: scoreResult.totalScore,
      maxScore: 1000,
      isPassed: scoreResult.isPassed, // >= 950 điểm
      submittedAt: now.toISOString(),
      dateKey,
      timeSpentSeconds,
      attemptNumber,
      isPractice: exam.isPracticeTest,
      isTeacherTesting,
      studentAnswers: answers,
      questionResults: scoreResult.questionResults,
      questionOrder: shuffledQuestions.map((q) => q.id),
      questionsSnapshot: shuffledQuestions, // Giữ tạm trong bộ nhớ cho màn hình xem lại tức thì
      violationCount,
      violationLogs: violationLogs.length > 0 ? (violationLogs.length > 5 ? violationLogs.slice(-5) : violationLogs) : undefined,
    };

    try {
      setSubmitErrorMessage(null);
      // Gọi hàm nộp bài (được bọc trong transaction batch + retry tự động)
      await Promise.resolve(onSubmitSuccess(submission));
      
      // Xóa bản nháp trong localStorage sau khi bài đã được nộp thành công
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {}

      setSubmissionResult(submission);
      setShowConfirmSubmit(false);
    } catch (err: any) {
      console.error('Lỗi nộp bài thi:', err);
      isFinishedRef.current = false;
      setSubmitErrorMessage(
        err?.message || 'Không thể gửi bài thi lên máy chủ do mạng không ổn định hoặc timeout. Toàn bộ đáp án của bạn vẫn được bảo toàn an toàn 100% trên máy. Vui lòng bấm "Thử Gửi Lại".'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-100 text-slate-900 select-none animate-in fade-in"
      style={{ userSelect: 'none', WebkitUserSelect: 'none', overscrollBehavior: 'none' }}
    >
      {/* VÙNG CHẮN BẢO VỆ CẠNH TRÊN: Ngăn chặn di chuột lên mép trên làm hiện nút X / thanh thoát toàn màn hình của trình duyệt */}
      <div 
        className="fixed top-0 left-0 right-0 h-3 z-9999 pointer-events-auto bg-transparent select-none cursor-default"
        onMouseEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseMove={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />

      {/* ================= MODAL BẮT BUỘC CHẾ ĐỘ TOÀN MÀN HÌNH ================= */}
      {showFullscreenRequiredModal && !isTeacherTesting && !submissionResult && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in zoom-in-95">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 sm:p-8 text-slate-900 border-2 border-indigo-600 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-indigo-600" />

            <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto mb-4 border border-indigo-200 shadow-xs">
              <Maximize className="w-8 h-8" />
            </div>

            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200 mb-2">
              Bảo Mật Phòng Thi Trực Tuyến
            </span>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Yêu Cầu Chế Độ Toàn Màn Hình!
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Quy chế thi yêu cầu bài thi phải được thực hiện ở <strong>chế độ Toàn Màn Hình (Fullscreen)</strong>. Việc thoát khỏi chế độ toàn màn hình đã được ghi nhận vào nhật ký giám sát thi.
            </p>

            <button
              type="button"
              onClick={enterFullscreen}
              className="mt-6 w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Maximize className="w-4 h-4" />
              <span>Quay Lại Chế Độ Toàn Màn Hình & Tiếp Tục Làm Bài</span>
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL CẢNH BÁO CHƯA LÀM HẾT CÂU HỎI (CHẶN NỘP BÀI) ================= */}
      {showIncompleteModal && !isTeacherTesting && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in zoom-in-95">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 sm:p-7 text-slate-900 border-2 border-amber-500 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-amber-500" />

            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-xs">
              <Lock className="w-8 h-8 text-amber-600" />
            </div>

            <div className="text-center">
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 mb-2">
                Quy Chế Nộp Bài Thi
              </span>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Chưa Thể Nộp Bài Thi!
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Hệ thống yêu cầu bạn phải <strong className="text-amber-800">hoàn thành tất cả các câu hỏi</strong> trước khi nộp bài. Hiện tại bạn còn <strong className="text-rose-600">{unansweredList.length} câu hỏi</strong> chưa làm.
              </p>
            </div>

            {/* Danh sách các câu chưa làm */}
            <div className="mt-4 p-4 bg-amber-50/80 rounded-2xl border border-amber-200">
              <div className="text-xs font-bold text-amber-900 mb-2.5 flex items-center justify-between">
                <span>Các câu hỏi chưa chọn đáp án:</span>
                <span className="font-mono text-rose-700 font-black">
                  {unansweredList.length} / {totalQuestions} câu
                </span>
              </div>
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                {unansweredList.map(({ num }) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(num - 1);
                      setShowIncompleteModal(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-mono text-xs font-bold shadow-2xs hover:scale-105 transition-all cursor-pointer"
                    title={`Nhấp để làm ngay Câu ${num}`}
                  >
                    Câu {num} →
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowIncompleteModal(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Đóng thông báo
              </button>
              {unansweredList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentIndex(unansweredList[0].num - 1);
                    setShowIncompleteModal(false);
                  }}
                  className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Làm Tiếp Câu Chưa Làm (Câu {unansweredList[0].num})</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL CẢNH BÁO VI PHẠM AN NINH PHÒNG THI ================= */}
      {showViolationWarning && !isTeacherTesting && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in zoom-in-95">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 sm:p-7 text-slate-900 border-2 border-red-500 relative overflow-hidden">
            {/* Top red warning stripe */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-red-600" />

            <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-200 shadow-xs">
              <ShieldAlert className="w-9 h-9 animate-pulse" />
            </div>

            <div className="text-center">
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 mb-2">
                Hệ Thống Giám Sát Phòng Thi
              </span>
              <h3 className="text-lg sm:text-xl font-black text-red-600 uppercase tracking-tight">
                Cảnh Báo Vi Phạm Quy Chế Thi!
              </h3>
            </div>

            {/* Chi tiết vi phạm */}
            <div className="mt-4 p-3.5 bg-red-50/90 rounded-2xl border border-red-200 text-xs space-y-2">
              <div className="flex items-start gap-2 text-red-900">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-red-800">Hành vi vi phạm vừa phát hiện:</span>
                  <div className="font-mono text-red-700 font-semibold mt-0.5">
                    {currentViolationReason || 'Phát hiện thao tác vi phạm quy chế thi'}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-red-200/80 flex items-center justify-between font-mono text-xs">
                <span className="text-red-800 font-semibold">Tổng số lần vi phạm đã ghi nhận:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white font-black text-sm">
                  {violationCount} lần
                </span>
              </div>
            </div>

            {/* Thông báo nhắc nhở quan trọng */}
            <div className="mt-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Bài thi KHÔNG tự động nộp bài!</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Bạn vẫn có thể tiếp tục làm bài thi bình thường. Tuy nhiên, <strong>toàn bộ số lần và chi tiết vi phạm</strong> (chuột phải, F12, rời màn hình...) đã được hệ thống lưu lại và <strong>sẽ hiển thị trực tiếp cho Giáo Viên xem</strong> khi chấm thi để đánh giá.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowViolationWarning(false)}
              className="mt-5 w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Tôi Đã Hiểu & Tiếp Tục Làm Bài</span>
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL XÁC NHẬN NỘP BÀI SỚM ================= */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in zoom-in-95">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-slate-900">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-5 h-5 text-emerald-600" />
              <span>Xác Nhận Nộp Bài Thi</span>
            </h3>
            
            {answeredCount < totalQuestions && !isTeacherTesting ? (
              <div className="mt-3 p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-900 font-medium">
                ⚠️ Không thể nộp bài: Bạn vẫn còn <strong>{totalQuestions - answeredCount}</strong> câu hỏi chưa trả lời! Quy chế thi yêu cầu làm đủ 100% câu hỏi.
              </div>
            ) : answeredCount < totalQuestions ? (
              <div className="mt-3 p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 font-medium">
                ℹ️ Chế độ GV làm thử: Còn <strong>{totalQuestions - answeredCount}</strong> câu chưa chọn đáp án (GV được phép nộp thử bất kỳ lúc nào).
              </div>
            ) : (
              <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Bạn đã hoàn thành đủ <strong>{totalQuestions}/{totalQuestions}</strong> câu hỏi. Bạn có chắc chắn muốn nộp bài?</span>
              </div>
            )}

            {submitErrorMessage && (
              <div className="mt-3 p-3.5 bg-red-50 border-2 border-red-300 rounded-2xl text-xs text-red-900 space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Sự cố gửi bài lên máy chủ:</span>
                </div>
                <p className="leading-relaxed">{submitErrorMessage}</p>
                <div className="pt-2 border-t border-red-200/80 flex items-center justify-between">
                  <span className="text-[11px] text-emerald-800 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Đáp án được lưu an toàn 100% trên thiết bị
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePerformSubmission()}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Thử Gửi Lại</span>
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmSubmit(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Tiếp Tục Làm Bài
              </button>
              <button
                type="button"
                disabled={(!isAllAnswered && !isTeacherTesting) || isSubmitting}
                onClick={() => handlePerformSubmission()}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-colors flex items-center gap-1.5 ${
                  (!isAllAnswered && !isTeacherTesting) || isSubmitting
                    ? 'bg-slate-400 cursor-not-allowed opacity-60'
                    : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang Gửi Bài Lên Turso...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Nộp Bài Ngay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL HIỂN THỊ KẾT QUẢ SAU KHI NỘP BÀI ================= */}
      {submissionResult && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in zoom-in-95">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden text-slate-900 border border-slate-200">
            <div
              className={`p-6 text-white text-center ${
                submissionResult.isPassed
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                  : 'bg-gradient-to-r from-amber-600 to-red-600'
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center mx-auto mb-3">
                <Award className="w-9 h-9 text-white" />
              </div>
              <h2 className="text-2xl font-black tracking-wide">
                {submissionResult.isPassed ? 'CHÚC MỪNG BẠN ĐÃ ĐẠT!' : 'BÀI THI CHƯA ĐẠT CHUẨN'}
              </h2>
              <p className="text-xs text-white/90 mt-1">
                Điểm chuẩn khảo thí: <strong>950 / 1000 điểm</strong>
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Điểm Số Của Bạn
                </div>
                <div
                  className={`text-5xl font-black font-mono my-1 ${
                    submissionResult.isPassed ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {submissionResult.score}{' '}
                  <span className="text-xl text-slate-400 font-normal">/ 1000</span>
                </div>
                <div className="inline-block px-3 py-1 rounded-full text-xs font-bold font-mono">
                  {submissionResult.isPassed ? (
                    <span className="text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                      ✓ ĐẠT CHUẨN CHỨNG CHỈ (≥ 950đ)
                    </span>
                  ) : (
                    <span className="text-red-700 bg-red-100 px-3 py-1 rounded-full">
                      ✕ CHƯA ĐẠT CHUẨN (&lt; 950đ)
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500">Thời gian làm bài:</span>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">
                    {Math.floor(submissionResult.timeSpentSeconds / 60)} phút{' '}
                    {submissionResult.timeSpentSeconds % 60} giây
                  </div>
                </div>
                <div className={`p-3 rounded-xl border ${submissionResult.violationCount > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={submissionResult.violationCount > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                    Số lần vi phạm quy chế:
                  </span>
                  <div className={`font-bold text-sm mt-0.5 ${submissionResult.violationCount > 0 ? 'text-red-700 font-mono' : 'text-slate-800'}`}>
                    {submissionResult.violationCount > 0 ? `⚠️ ${submissionResult.violationCount} lần (đã báo cho GV)` : '0 lần (Hợp lệ)'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                {exam.allowReviewAnswers && onReviewAnswers && (
                  <button
                    type="button"
                    onClick={() => {
                      onReviewAnswers(submissionResult);
                    }}
                    className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Xem Lại Đáp Án Chi Tiết</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-md transition-all cursor-pointer text-center"
                >
                  Hoàn Tất & Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= THANH TIÊU ĐỀ PHÒNG THI (MÀU TRẮNG, NỔI BẬT THÔNG TIN) ================= */}
      <header className="h-18 px-4 sm:px-6 bg-white border-b border-slate-200 shadow-xs flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0 tracking-wider">
            IT
          </div>
          <div className="truncate">
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
              {exam.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs mt-0.5">
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold">
                {exam.subject || 'Công nghệ Thông tin'}
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold hidden sm:inline">
                Thang điểm: 1000đ • Đạt: ≥ 950đ
              </span>
              {'fullName' in currentUser && (
                <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-semibold hidden md:inline">
                  Thí sinh: <strong>{currentUser.fullName}</strong>
                  {'studentCode' in currentUser && ` (SBD: ${currentUser.studentCode})`}
                </span>
              )}
              {exam.isPracticeTest && (
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                  Thi Thử Ngẫu Nhiên
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Đồng hồ đếm ngược hoặc nhãn thử nghiệm GV + Nút nộp bài nổi bật */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Trạng thái Offline-First & Đồng bộ ngầm */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold" title="Kết nối Internet ổn định. Toàn bộ đáp án được sao lưu tức thì vào localStorage và tự động đồng bộ ngầm sau mỗi 30s">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Offline-First (Đã lưu)</span>
                {lastAutoSaveTime && <span className="text-slate-400 font-normal hidden lg:inline">• Đồng bộ {lastAutoSaveTime}</span>}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-700 font-semibold" title="Mất kết nối Internet tạm thời. Bạn vẫn tiếp tục làm bài bình thường, bài làm được bảo vệ 100% trên máy">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Làm bài Offline (An toàn)</span>
              </span>
            )}
          </div>

          {violationCount > 0 && !isTeacherTesting && (
            <button
              type="button"
              onClick={() => setShowViolationWarning(true)}
              className="px-3 py-1.5 rounded-xl bg-red-100 border-2 border-red-400 text-red-800 hover:bg-red-200 text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer animate-pulse"
              title="Nhấn để xem chi tiết vi phạm quy chế"
            >
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
              <span className="hidden xs:inline">Vi phạm:</span>
              <span>{violationCount} lần</span>
            </button>
          )}

          {isTeacherTesting ? (
            <div className="px-3.5 py-1.5 rounded-xl bg-purple-50 border-2 border-purple-300 text-purple-800 text-xs font-black flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600" />
              <span>Chế độ GV: KHÔNG TÍNH GIỜ</span>
            </div>
          ) : (
            <div
              className={`px-3.5 sm:px-4 py-1.5 rounded-2xl border-2 font-mono text-sm sm:text-base font-black flex items-center gap-2 shadow-2xs ${
                timeRemaining < 300
                  ? 'bg-red-50 border-red-500 text-red-700 animate-pulse'
                  : 'bg-emerald-50 border-emerald-500 text-emerald-800'
              }`}
            >
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>{formatTimer(timeRemaining)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleAttemptSubmit}
            className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl active:scale-95 text-white text-xs sm:text-sm font-black shadow-md transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              !isAllAnswered && !isTeacherTesting
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg'
            }`}
            title={!isAllAnswered && !isTeacherTesting ? `Còn ${unansweredList.length} câu chưa làm` : 'Nộp bài thi'}
          >
            {!isAllAnswered && !isTeacherTesting ? (
              <Lock className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>Nộp Bài ({answeredCount}/{totalQuestions})</span>
          </button>
        </div>
      </header>

      {/* Dải thông báo khôi phục bài làm thành công từ bộ nhớ an toàn (Offline-First) */}
      {restoredNotification && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 sm:px-6 py-2.5 text-xs flex items-center justify-between text-emerald-900 shrink-0">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Bảo vệ bài làm (Offline-First):</strong> Đã tự động khôi phục toàn bộ câu trả lời và thời gian từ bản nháp an toàn trên thiết bị của bạn.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRestoredNotification(false)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold px-2 py-0.5 rounded-lg hover:bg-emerald-100"
          >
            Đã hiểu ✕
          </button>
        </div>
      )}

      {/* Dải thông báo vi phạm màu đỏ luôn hiển thị nhắc nhở nếu có vi phạm */}
      {violationCount > 0 && !isTeacherTesting && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 sm:px-6 py-2.5 text-xs flex items-center justify-between text-rose-900 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="truncate">
              <strong>Cảnh báo quy chế:</strong> Đã ghi nhận <strong className="text-rose-700 font-bold">{violationCount} lần vi phạm</strong> (chuột phải / F12 / rời màn hình). Số lần vi phạm này sẽ được lưu và báo cho Giáo Viên xem.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowViolationWarning(true)}
            className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline cursor-pointer shrink-0 ml-3"
          >
            Xem nhắc nhở
          </button>
        </div>
      )}

      {/* ================= NỘI DUNG CHÍNH LÀM BÀI (MÀU TRẮNG, CHỮ ĐEN, RÕ RÀNG) ================= */}
      <div className="flex-1 flex overflow-hidden bg-slate-100/70">
        {/* CỘT TRÁI: NỘI DUNG CÂU HỎI & ĐÁP ÁN (75%) */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {currentQ ? (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Card lớn bao trọn toàn bộ câu hỏi và đáp án */}
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-8 space-y-6">
                
                {/* 1. THANH TIÊU ĐỀ CÂU HỎI */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white font-black text-xs tracking-wider shadow-2xs">
                      CÂU HỎI {currentIndex + 1} / {totalQuestions}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      ({(1000 / totalQuestions).toFixed(1)} điểm)
                    </span>
                  </div>

                  <span className="px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-xs uppercase tracking-wide">
                    {currentQ.type === 'single_choice' && 'Trắc nghiệm: Chọn 1 đáp án đúng'}
                    {currentQ.type === 'multiple_choice' &&
                      `Trắc nghiệm: Chọn ${currentQ.correctOptionIds?.length || 2} đáp án đúng`}
                    {currentQ.type === 'matching' && 'Ghép đôi hai vế tương ứng'}
                    {currentQ.type === 'ordering' && 'Sắp xếp theo thứ tự đúng'}
                    {currentQ.type === 'true_false' && 'Đúng / Sai theo nhận định'}
                    {currentQ.type === 'hotspot' && 'Chọn vị trí trên hình ảnh (Hotspot)'}
                    {currentQ.type === 'fill_blank' && 'Chọn từ điền vào chỗ trống'}
                  </span>
                </div>

                {/* 2. KHỐI NỘI DUNG ĐỀ BÀI (ĐƯỢC PHÂN TÁCH NỔI BẬT VỚI NỀN RIÊNG BIỆT) */}
                <div className="bg-slate-50 border-l-4 border-indigo-600 rounded-r-2xl p-5 sm:p-6 shadow-2xs space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 text-indigo-600" />
                    <span>Nội Dung Câu Hỏi:</span>
                  </div>
                  
                  {/* Tiêu đề câu hỏi (Chữ đen đậm rõ, dễ đọc) */}
                  <div className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed">
                    {currentQ.title}
                  </div>

                  {/* Phương tiện bổ trợ: Ảnh hoặc Video nếu có */}
                  {currentQ.mediaType === 'image' && currentQ.mediaUrl && (
                    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white p-3 shadow-2xs">
                      <img
                        src={currentQ.mediaUrl}
                        alt="Hình ảnh câu hỏi"
                        className="max-h-80 mx-auto object-contain rounded-xl"
                      />
                    </div>
                  )}

                  {currentQ.mediaType === 'video' && currentQ.mediaUrl && (
                    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white p-3 shadow-2xs">
                      {currentQ.mediaUrl.includes('youtube.com') || currentQ.mediaUrl.includes('youtu.be') ? (
                        <iframe
                          src={currentQ.mediaUrl.replace('watch?v=', 'embed/')}
                          title="Video câu hỏi"
                          className="w-full aspect-video rounded-xl"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <video src={currentQ.mediaUrl} controls className="w-full rounded-xl max-h-80" />
                      )}
                    </div>
                  )}
                </div>

                {/* 3. KHỐI LỰA CHỌN ĐÁP ÁN (PHÂN TÁCH RÕ RÀNG VỚI ĐỀ BÀI) */}
                <div className="pt-2 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Lựa Chọn Đáp Án Của Bạn:</span>
                    </div>
                    <span className="text-xs text-slate-500 font-semibold">
                      {currentQ.type === 'single_choice' && 'Nhấp chọn 1 đáp án chính xác nhất'}
                      {currentQ.type === 'multiple_choice' && `Chọn đủ ${currentQ.correctOptionIds?.length || 2} đáp án`}
                      {currentQ.type === 'matching' && 'Kéo từ Cột A hoặc nhấp chọn để kết nối'}
                      {currentQ.type === 'ordering' && 'Bấm mũi tên lên/xuống để đổi vị trí'}
                      {currentQ.type === 'true_false' && 'Tích chọn Đúng hoặc Sai cho mỗi nhận định'}
                      {currentQ.type === 'fill_blank' && 'Chọn từ phù hợp trong ô thả xuống'}
                      {currentQ.type === 'hotspot' && 'Nhấp trực tiếp lên các vị trí trên ảnh'}
                    </span>
                  </div>

                  {/* A. CHỌN 1 ĐÁP ÁN (SINGLE CHOICE) */}
                  {currentQ.type === 'single_choice' && currentQ.options && (
                    <div className="space-y-3">
                      {currentQ.options.map((opt, oIdx) => {
                        const isSelected = answers[currentQ.id] === opt.id;
                        const charLabel = String.fromCharCode(65 + oIdx);
                        return (
                          <div
                            key={opt.id}
                            onClick={() => updateAnswer(currentQ.id, opt.id)}
                            className={`p-4 sm:p-4.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 group ${
                              isSelected
                                ? 'bg-emerald-50/90 border-emerald-500 text-slate-900 shadow-xs ring-2 ring-emerald-400/25'
                                : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-indigo-400 shadow-2xs'
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 border border-slate-300 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600'
                              }`}
                            >
                              {charLabel}
                            </div>
                            <div className="flex-1 text-sm sm:text-base font-semibold text-slate-900 leading-snug">
                              {opt.text}
                              {opt.imageUrl && (
                                <img
                                  src={opt.imageUrl}
                                  alt={`Đáp án ${charLabel}`}
                                  className="mt-2.5 max-h-48 object-contain rounded-xl border border-slate-200 bg-white p-1"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* B. CHỌN NHIỀU ĐÁP ÁN (MULTIPLE CHOICE) */}
                  {currentQ.type === 'multiple_choice' && currentQ.options && (
                    <div className="space-y-3">
                      <div className="text-xs text-amber-900 bg-amber-50 p-3 rounded-2xl border border-amber-200 flex items-center justify-between">
                        <span>ℹ️ Bạn cần chọn chính xác <strong>{currentQ.correctOptionIds?.length || 2}</strong> đáp án đúng.</span>
                        <span className="font-bold font-mono">
                          (Đã chọn: {(answers[currentQ.id] || []).length}/{currentQ.correctOptionIds?.length || 2})
                        </span>
                      </div>
                      {currentQ.options.map((opt, oIdx) => {
                        const currentList: string[] = answers[currentQ.id] || [];
                        const isSelected = currentList.includes(opt.id);
                        const charLabel = String.fromCharCode(65 + oIdx);
                        return (
                          <div
                            key={opt.id}
                            onClick={() => handleToggleMultipleChoice(currentQ, opt.id)}
                            className={`p-4 sm:p-4.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 group ${
                              isSelected
                                ? 'bg-emerald-50/90 border-emerald-500 text-slate-900 shadow-xs ring-2 ring-emerald-400/25'
                                : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-indigo-400 shadow-2xs'
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 border border-slate-300 group-hover:border-indigo-500'
                              }`}
                            >
                              {isSelected ? '✓' : charLabel}
                            </div>
                            <div className="flex-1 text-sm sm:text-base font-semibold text-slate-900 leading-snug">
                              {opt.text}
                              {opt.imageUrl && (
                                <img
                                  src={opt.imageUrl}
                                  alt={`Đáp án ${charLabel}`}
                                  className="mt-2.5 max-h-48 object-contain rounded-xl border border-slate-200 bg-white p-1"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* C. GHÉP ĐÔI (MATCHING - NỀN SÁNG, RÕ RÀNG) */}
                  {currentQ.type === 'matching' && currentQ.matchingPairs && (
                    <div className="space-y-4">
                      {/* Hướng dẫn */}
                      <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 flex flex-wrap items-center justify-between gap-3 text-xs text-indigo-950">
                        <div className="flex items-center gap-2">
                          <MousePointer className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span>
                            <strong>Cách làm:</strong> Dùng chuột <strong>kéo đáp án ở Cột A thả sang Cột B</strong> (hoặc nhấp chọn thẻ ở A rồi nhấp tiếp vào ô ở B).
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {(() => {
                            const matches: Record<string, string> = answers[currentQ.id] || {};
                            const matchedCount = Object.keys(matches).length;
                            const total = currentQ.matchingPairs.length;
                            return (
                              <span
                                className={`px-3 py-1 rounded-xl font-bold font-mono text-xs border ${
                                  matchedCount === total
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-white text-slate-700 border-slate-300'
                                }`}
                              >
                                Đã ghép: {matchedCount}/{total} cặp
                              </span>
                            );
                          })()}

                          {Object.keys(answers[currentQ.id] || {}).length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleResetMatches(currentQ.id)}
                              className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              title="Xóa tất cả các cặp đã ghép để làm lại"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Làm lại</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Lưới 2 cột */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* CỘT A */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wider">
                            <span>CỘT A (KÉO TỪ ĐÂY)</span>
                            <span className="text-[11px] text-slate-500 font-normal">Kéo hoặc Nhấp chọn</span>
                          </div>

                          <div className="space-y-2.5">
                            {currentQ.matchingPairs.map((pair, pIdx) => {
                              const matches: Record<string, string> = answers[currentQ.id] || {};
                              const matchedRightId = matches[pair.id];
                              const rightItems = (currentQ.shuffledRightPairs && currentQ.shuffledRightPairs.length > 0 
                                ? currentQ.shuffledRightPairs 
                                : currentQ.matchingPairs) || [];
                              const rightItemIndex = rightItems.findIndex((r) => r.id === matchedRightId);
                              const isMatched = !!matchedRightId;
                              const isSelectedForClick = selectedLeftIdForClick === pair.id;
                              const isBeingDragged = draggedLeftPairId === pair.id;

                              return (
                                <div
                                  key={pair.id}
                                  draggable={true}
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', pair.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                    setDraggedLeftPairId(pair.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedLeftPairId(null);
                                    setDragOverRightId(null);
                                  }}
                                  onClick={() => {
                                    if (isSelectedForClick) {
                                      setSelectedLeftIdForClick(null);
                                    } else {
                                      setSelectedLeftIdForClick(pair.id);
                                    }
                                  }}
                                  className={`p-4 rounded-2xl border-2 transition-all cursor-grab active:cursor-grabbing select-none relative group ${
                                    isSelectedForClick
                                      ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-400 shadow-md'
                                      : isMatched
                                      ? 'bg-indigo-50/70 border-indigo-400'
                                      : 'bg-white border-slate-200 hover:border-indigo-500 hover:bg-slate-50 shadow-2xs'
                                  } ${isBeingDragged ? 'opacity-40 scale-95' : ''}`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="mt-0.5 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0">
                                      <GripVertical className="w-5 h-5" />
                                    </div>
                                    <span className="w-7 h-7 rounded-xl bg-indigo-100 border border-indigo-300 text-indigo-800 flex items-center justify-center text-xs font-black font-mono shrink-0">
                                      A{pIdx + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-slate-900 leading-snug">
                                        {pair.leftText}
                                      </p>
                                      {pair.leftImageUrl && (
                                        <img
                                          src={pair.leftImageUrl}
                                          alt="Hình ảnh ghép"
                                          className="mt-2 max-h-24 rounded-xl border border-slate-200 object-cover bg-white"
                                        />
                                      )}
                                      
                                      {isMatched && (
                                        <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                                          <span className="font-bold text-emerald-700 flex items-center gap-1">
                                            <Link2 className="w-3.5 h-3.5" />
                                            <span>Đã ghép với: <strong>B{rightItemIndex + 1}</strong></span>
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDisconnectPair(currentQ.id, pair.id);
                                            }}
                                            className="text-[11px] font-bold text-rose-700 hover:text-rose-800 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 cursor-pointer transition-colors"
                                          >
                                            Hủy ghép
                                          </button>
                                        </div>
                                      )}

                                      {isSelectedForClick && !isMatched && (
                                        <div className="mt-2 text-[11px] text-amber-800 font-bold flex items-center gap-1 animate-pulse">
                                          <span>👉 Đã chọn thẻ này. Nhấp tiếp vào 1 ô ở Cột B để kết nối!</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* CỘT B */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wider">
                            <span>CỘT B (THẢ VÀO ĐÂY)</span>
                            <span className="text-[11px] text-emerald-700 font-mono font-bold">Đã đảo vị trí</span>
                          </div>

                          <div className="space-y-2.5">
                            {(() => {
                              const rightItems = (currentQ.shuffledRightPairs && currentQ.shuffledRightPairs.length > 0 
                                ? currentQ.shuffledRightPairs 
                                : currentQ.matchingPairs) || [];
                              const matches: Record<string, string> = answers[currentQ.id] || {};
                              
                              const reverseMap: Record<string, { leftPair: any; leftIndex: number }> = {};
                              currentQ.matchingPairs.forEach((p, idx) => {
                                const rId = matches[p.id];
                                if (rId) {
                                  reverseMap[rId] = { leftPair: p, leftIndex: idx };
                                }
                              });

                              return rightItems.map((rightP, rIdx) => {
                                const connected = reverseMap[rightP.id];
                                const isDragOver = dragOverRightId === rightP.id;
                                const isClickTarget = !!selectedLeftIdForClick;

                                return (
                                  <div
                                    key={rightP.id}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = 'move';
                                      if (dragOverRightId !== rightP.id) {
                                        setDragOverRightId(rightP.id);
                                      }
                                    }}
                                    onDragLeave={() => {
                                      if (dragOverRightId === rightP.id) {
                                        setDragOverRightId(null);
                                      }
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      const droppedLeftId = e.dataTransfer.getData('text/plain') || draggedLeftPairId;
                                      if (droppedLeftId) {
                                        handleConnectPair(currentQ.id, droppedLeftId, rightP.id);
                                      }
                                      setDraggedLeftPairId(null);
                                      setDragOverRightId(null);
                                    }}
                                    onClick={() => {
                                      if (selectedLeftIdForClick) {
                                        handleConnectPair(currentQ.id, selectedLeftIdForClick, rightP.id);
                                      }
                                    }}
                                    className={`p-4 rounded-2xl border-2 transition-all ${
                                      isDragOver
                                        ? 'bg-emerald-100 border-emerald-500 ring-2 ring-emerald-400 scale-[1.02] shadow-md'
                                        : connected
                                        ? 'bg-emerald-50/70 border-emerald-500 shadow-2xs'
                                        : isClickTarget
                                        ? 'bg-amber-50/60 border-amber-400 hover:border-amber-500 cursor-pointer ring-1 ring-amber-300'
                                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2.5">
                                      <span className="w-7 h-7 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center text-xs font-black font-mono shrink-0">
                                        B{rIdx + 1}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-900 leading-snug">
                                          {rightP.rightText}
                                        </p>
                                        {rightP.rightImageUrl && (
                                          <img
                                            src={rightP.rightImageUrl}
                                            alt="Hình ảnh minh họa"
                                            className="mt-2 max-h-24 rounded-xl border border-slate-200 object-cover bg-white"
                                          />
                                        )}
                                      </div>
                                    </div>

                                    {/* Vùng hiển thị thẻ đã kết nối */}
                                    <div className="mt-3 pt-2.5 border-t border-slate-200">
                                      {connected ? (
                                        <div className="p-2.5 rounded-xl bg-white border border-emerald-300 flex items-center justify-between gap-2 text-xs shadow-2xs">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                              A{connected.leftIndex + 1}
                                            </span>
                                            <span className="text-slate-900 font-bold truncate">
                                              {connected.leftPair.leftText}
                                            </span>
                                            {connected.leftPair.leftImageUrl && (
                                              <img
                                                src={connected.leftPair.leftImageUrl}
                                                alt="Ảnh"
                                                className="h-6 w-8 object-cover rounded border border-slate-200 shrink-0"
                                              />
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDisconnectPair(currentQ.id, connected.leftPair.id);
                                            }}
                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                                            title="Gỡ bỏ liên kết"
                                          >
                                            <X className="w-4 h-4" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div
                                          className={`py-3 px-3 rounded-xl border-2 border-dashed text-center text-xs transition-colors flex items-center justify-center gap-2 ${
                                            isDragOver
                                              ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold'
                                              : isClickTarget
                                              ? 'border-amber-400 bg-amber-50 text-amber-800 font-bold'
                                              : 'border-slate-300 text-slate-500 bg-slate-50'
                                          }`}
                                        >
                                          <MousePointer className="w-3.5 h-3.5 opacity-60" />
                                          <span>
                                            {isDragOver
                                              ? 'Thả chuột vào đây để ghép'
                                              : isClickTarget
                                              ? 'Nhấp vào đây để ghép với thẻ đang chọn'
                                              : 'Kéo đáp án ở Cột A thả vào đây'}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* D. SẮP XẾP THỨ TỰ (ORDERING) */}
                  {currentQ.type === 'ordering' && currentQ.orderingItems && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-600 font-medium">
                        Sử dụng các nút mũi tên để điều chỉnh các mục theo đúng thứ tự logic từ trên xuống dưới:
                      </p>
                      {(() => {
                        const currentOrder: string[] =
                          answers[currentQ.id] || currentQ.orderingItems.map((i) => i.id);
                        const itemMap = new Map(currentQ.orderingItems.map((i) => [i.id, i]));

                        return currentOrder.map((itemId, idx) => {
                          const item = itemMap.get(itemId);
                          if (!item) return null;
                          return (
                            <div
                              key={itemId}
                              className="p-4 rounded-2xl bg-white border-2 border-slate-200 flex items-center justify-between gap-3 shadow-2xs hover:border-indigo-400 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                                  {idx + 1}
                                </span>
                                <span className="text-sm sm:text-base font-bold text-slate-900">{item.text}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveOrderItem(currentQ.id, idx, idx - 1)}
                                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                                  title="Di chuyển lên trên"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === currentOrder.length - 1}
                                  onClick={() => handleMoveOrderItem(currentQ.id, idx, idx + 1)}
                                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                                  title="Di chuyển xuống dưới"
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}

                  {/* E. ĐÚNG / SAI (TRUE / FALSE) */}
                  {currentQ.type === 'true_false' && currentQ.tfStatements && (
                    <div className="space-y-3">
                      <div className="text-xs text-amber-900 bg-amber-50 p-3 rounded-2xl border border-amber-200 flex items-center justify-between gap-2">
                        <span>ℹ️ <strong>Lưu ý:</strong> Thứ tự các nhận định và các cột lựa chọn đã được đảo ngẫu nhiên.</span>
                        <span className="text-[11px] font-mono text-amber-800 font-bold">Đã đảo đáp án</span>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
                        <table className="w-full text-left text-xs sm:text-sm">
                          {(() => {
                            const columns = currentQ.shuffledTfColumns || ['true', 'false'];
                            return (
                              <>
                                <thead className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 uppercase text-[11px]">
                                  <tr>
                                    <th className="p-3.5 w-12 text-center">STT</th>
                                    <th className="p-3.5">Nội dung nhận định / phát biểu</th>
                                    {columns.map((colKey) => (
                                      <th
                                        key={colKey}
                                        className={`p-3.5 w-32 text-center font-black ${
                                          colKey === 'true' ? 'text-emerald-800 bg-emerald-50/80' : 'text-rose-800 bg-rose-50/80'
                                        }`}
                                      >
                                        {colKey === 'true'
                                          ? currentQ.trueLabel || 'Đúng'
                                          : currentQ.falseLabel || 'Sai'}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                  {currentQ.tfStatements.map((st, idx) => {
                                    const userVal = (answers[currentQ.id] || {})[st.id];
                                    return (
                                      <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="p-3.5 text-center text-slate-500 font-mono font-black">
                                          {idx + 1}
                                        </td>
                                        <td className="p-3.5 text-slate-900 font-medium">{st.statement}</td>
                                        {columns.map((colKey) => {
                                          const isTrueOption = colKey === 'true';
                                          const isChecked = userVal === isTrueOption;
                                          return (
                                            <td key={colKey} className="p-3.5 text-center">
                                              <label className="flex items-center justify-center cursor-pointer p-1">
                                                <input
                                                  type="radio"
                                                  name={`tf_${currentQ.id}_${st.id}`}
                                                  checked={isChecked}
                                                  onChange={() =>
                                                    handleUpdateTrueFalse(currentQ.id, st.id, isTrueOption)
                                                  }
                                                  className={`w-5 h-5 cursor-pointer ${
                                                    isTrueOption
                                                      ? 'text-emerald-600 focus:ring-emerald-500'
                                                      : 'text-rose-600 focus:ring-rose-500'
                                                  }`}
                                                />
                                              </label>
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </>
                            );
                          })()}
                        </table>
                      </div>
                    </div>
                  )}

                  {/* F. CHỌN TRÊN HÌNH ẢNH (HOTSPOT) */}
                  {currentQ.type === 'hotspot' && currentQ.hotspotImageUrl && (
                    <div className="space-y-3 bg-white p-3 rounded-2xl border-2 border-slate-200 shadow-2xs">
                      <HotspotCanvas
                        imageUrl={currentQ.hotspotImageUrl}
                        isStudent={true}
                        studentClicks={answers[currentQ.id] || []}
                        onStudentClicksChange={(clicks) => updateAnswer(currentQ.id, clicks)}
                        maxClicks={currentQ.hotspotRegions?.length || 1}
                      />
                    </div>
                  )}

                  {/* G. ĐIỀN VÀO CHỖ TRỐNG (FILL IN THE BLANKS WITH DROPDOWN) */}
                  {currentQ.type === 'fill_blank' && currentQ.fillBlankTemplate && (
                    <div className="space-y-3">
                      <div className="text-xs text-emerald-900 bg-emerald-50 p-3 rounded-2xl border border-emerald-200 flex items-center gap-2">
                        <span className="font-bold">ℹ️ Hướng dẫn:</span>
                        <span>Hãy chọn đáp án thích hợp từ danh sách thả xuống cho từng vị trí ô trống.</span>
                      </div>
                      <div className="p-6 rounded-2xl bg-white border-2 border-slate-200 leading-loose text-slate-900 text-sm sm:text-base shadow-2xs font-medium">
                        {(() => {
                          const template = currentQ.fillBlankTemplate;
                          const blanks = currentQ.fillBlankItems || [];
                          const blankMap = new Map(blanks.map((b) => [b.placeholderCode, b]));
                          const parts = template.split(/(\[b\d+\])/g);

                          return parts.map((part, pIdx) => {
                            if (blankMap.has(part)) {
                              const blank = blankMap.get(part)!;
                              const currentVal = (answers[currentQ.id] || {})[blank.id] || '';
                              return (
                                <span key={pIdx} className="inline-block mx-1.5 my-1 align-middle">
                                  <select
                                    value={currentVal}
                                    onChange={(e) =>
                                      handleUpdateFillBlank(currentQ.id, blank.id, e.target.value)
                                    }
                                    className={`px-3.5 py-1.5 rounded-xl border-2 text-xs sm:text-sm font-bold transition-all focus:ring-2 focus:ring-indigo-500 cursor-pointer ${
                                      currentVal
                                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-2xs'
                                        : 'bg-slate-50 border-slate-300 text-slate-800 hover:border-slate-400'
                                    }`}
                                  >
                                    <option value="">-- Chọn đáp án --</option>
                                    {blank.options.map((opt, oIdx) => (
                                      <option key={oIdx} value={opt} className="bg-white text-slate-900">
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                </span>
                              );
                            }
                            return <span key={pIdx}>{part}</span>;
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. THANH ĐIỀU HƯỚNG CÂU TRƯỚC / CÂU SAU (NỔI BẬT DỄ BẤM) */}
                <div className="flex items-center justify-between pt-6 border-t border-slate-200">
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                    className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border-2 border-slate-300 hover:border-slate-400 disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shadow-2xs active:scale-95"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Câu Trước</span>
                  </button>

                  <span className="text-xs sm:text-sm font-black font-mono text-slate-800 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200">
                    {currentIndex + 1} / {totalQuestions}
                  </span>

                  <button
                    type="button"
                    disabled={currentIndex === totalQuestions - 1}
                    onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95"
                  >
                    <span>Câu Kế Tiếp</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-500 font-medium">
              Đề thi chưa có câu hỏi nào.
            </div>
          )}
        </main>

        {/* CỘT PHẢI: BẢNG TIẾN ĐỘ CÂU HỎI (MÀU TRẮNG, DỄ NHẬN DIỆN) */}
        <aside className="w-80 bg-white border-l border-slate-200 p-5 flex flex-col justify-between hidden md:flex shadow-xs z-10">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Danh Sách Câu Hỏi
              </span>
              <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-300 font-mono">
                {answeredCount}/{totalQuestions} đã làm
              </span>
            </div>

            {/* Thanh tiến độ */}
            <div className="w-full bg-slate-100 rounded-full h-2 mb-4 overflow-hidden border border-slate-200">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%` }}
              />
            </div>

            {/* Grid câu hỏi (Nút số câu hỏi to rõ, phân biệt rõ trạng thái) */}
            <div className="grid grid-cols-5 gap-2 max-h-[55vh] overflow-y-auto pr-1">
              {shuffledQuestions.map((q, qIdx) => {
                const ans = answers[q.id];
                const isAnswered =
                  ans !== undefined &&
                  ans !== null &&
                  (Array.isArray(ans)
                    ? ans.length > 0
                    : typeof ans === 'object'
                    ? Object.keys(ans).length > 0
                    : true);
                const isCurrent = currentIndex === qIdx;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(qIdx)}
                    className={`h-10 rounded-xl font-mono text-xs font-black transition-all cursor-pointer flex items-center justify-center ${
                      isCurrent
                        ? 'ring-2 ring-indigo-600 bg-indigo-600 text-white shadow-md scale-105'
                        : isAnswered
                        ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-400 hover:bg-emerald-100'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {qIdx + 1}
                  </button>
                );
              })}
            </div>

            {/* Chú giải trạng thái */}
            <div className="mt-5 space-y-2 pt-4 border-t border-slate-200 text-xs text-slate-600 font-medium">
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-md bg-emerald-50 border-2 border-emerald-400 shrink-0"></span>
                <span>Đã trả lời ({answeredCount} câu)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-md bg-slate-50 border border-slate-200 shrink-0"></span>
                <span>Chưa trả lời ({totalQuestions - answeredCount} câu)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-md bg-indigo-600 ring-2 ring-indigo-400 shrink-0"></span>
                <span>Đang chọn xem (Câu {currentIndex + 1})</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleAttemptSubmit}
              className={`w-full py-3.5 rounded-2xl active:scale-98 text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                !isAllAnswered && !isTeacherTesting
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg'
              }`}
            >
              {!isAllAnswered && !isTeacherTesting ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>
                {!isAllAnswered && !isTeacherTesting 
                  ? `Chưa Xong (${answeredCount}/{totalQuestions} câu)`
                  : 'Nộp Bài Thi Ngay'
                }
              </span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
