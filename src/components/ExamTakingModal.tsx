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
import { useExamSecurity } from '../hooks/useExamSecurity.ts';
import { HotspotCanvas } from './HotspotCanvas.tsx';
import { ImageLightboxModal } from './ImageLightboxModal.tsx';
import { ExamReviewModal } from './ExamReviewModal.tsx';
import { ThientchLogo } from './ThientchLogo.tsx';
import confetti from 'canvas-confetti';
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
  HardDrive,
  ZoomIn,
  Flag,
  Target,
  Trophy,
  LayoutGrid
} from 'lucide-react';

interface ExamTakingModalProps {
  exam: Exam;
  currentUser: Student | UserAccount;
  isTeacherTesting?: boolean;
  onClose: () => void;
  onSubmitSuccess: (submission: ExamSubmission) => void;
  onReviewAnswers?: (submission: ExamSubmission) => void;
  attemptNumber?: number;
  previousPassedCount?: number;
  allSubmissions?: ExamSubmission[];
}

export const ExamTakingModal: React.FC<ExamTakingModalProps> = ({
  exam,
  currentUser,
  isTeacherTesting = false,
  onClose,
  onSubmitSuccess,
  onReviewAnswers,
  attemptNumber = 1,
  previousPassedCount = 0,
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
  const [shuffledQuestions, setShuffledQuestions] = useState<ExamQuestion[]>(() => {
    if (initialDraft?.shuffledQuestions && Array.isArray(initialDraft.shuffledQuestions) && initialDraft.shuffledQuestions.length > 0) {
      return initialDraft.shuffledQuestions;
    }
    return shuffleExamQuestionsAndOptions(
      exam.questions,
      exam.isPracticeTest,
      exam.practiceRandomCount
    );
  });

  const [attemptNumberState, setAttemptNumberState] = useState<number>(attemptNumber || 1);
  const [passedAttemptsCount, setPassedAttemptsCount] = useState<number>(previousPassedCount || 0);
  const [isReviewingInline, setIsReviewingInline] = useState<boolean>(false);

  const targetPassCount = Math.max(1, exam.requiredPassCount || 1);
  const isRequirementMet = isTeacherTesting || (passedAttemptsCount >= targetPassCount);
  const passesRemaining = Math.max(0, targetPassCount - passedAttemptsCount);

  const triggerFireworks = () => {
    try {
      const duration = 4.5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 35, spread: 360, ticks: 70, zIndex: 99999 };

      const interval: any = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          return clearInterval(interval);
        }
        const particleCount = 60 * (timeLeft / duration);
        // Pháo hoa bên trái
        confetti({
          ...defaults,
          particleCount,
          origin: { x: Math.random() * 0.3 + 0.1, y: Math.random() * 0.4 + 0.1 },
          colors: ['#10B981', '#6366F1', '#F59E0B', '#EC4899', '#3B82F6', '#8B5CF6', '#F43F5E'],
        });
        // Pháo hoa bên phải
        confetti({
          ...defaults,
          particleCount,
          origin: { x: Math.random() * 0.3 + 0.6, y: Math.random() * 0.4 + 0.1 },
          colors: ['#10B981', '#6366F1', '#F59E0B', '#EC4899', '#3B82F6', '#8B5CF6', '#F43F5E'],
        });
        // Pháo hoa trung tâm màn hình
        confetti({
          ...defaults,
          particleCount: particleCount * 0.85,
          origin: { x: 0.5, y: 0.35 },
          colors: ['#10B981', '#6366F1', '#F59E0B', '#EC4899', '#3B82F6', '#8B5CF6', '#F43F5E'],
        });
      }, 200);
    } catch (err) {
      console.warn('Fireworks effect error:', err);
    }
  };

  const handleRetakeExam = () => {
    setIsReviewingInline(false);
    setSubmissionResult(null);
    setAnswers({});
    setFlaggedQuestions([]);
    setCurrentIndex(0);
    startTimeRef.current = Date.now();
    setTimeRemaining(exam.durationMinutes * 60);
    setViolationCount(0);
    setViolationLogs([]);
    setShuffledQuestions(
      shuffleExamQuestionsAndOptions(
        exam.questions,
        exam.isPracticeTest,
        exam.practiceRandomCount
      )
    );
    setAttemptNumberState((prev) => prev + 1);
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {}
    enterFullscreen();
  };

  const handleFinishAndClose = () => {
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
    onClose();
  };

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
  const [showMobilePalette, setShowMobilePalette] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<ExamSubmission | null>(null);

  // Kích hoạt pháo hoa chúc mừng ngay khi đạt yêu cầu số lần làm bài (Requirement 2.b)
  useEffect(() => {
    if (submissionResult && isRequirementMet) {
      triggerFireworks();
    }
  }, [submissionResult, isRequirementMet]);

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

  // Lightbox Zoom state for question and option images
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // Đánh dấu câu hỏi cần xem lại (Flag for review)
  const [flaggedQuestions, setFlaggedQuestions] = useState<string[]>(() => {
    if (initialDraft?.flaggedQuestions && Array.isArray(initialDraft.flaggedQuestions)) {
      return initialDraft.flaggedQuestions;
    }
    return [];
  });

  const toggleFlagQuestion = (qId: string) => {
    setFlaggedQuestions((prev) => {
      const next = prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId];
      try {
        const raw = localStorage.getItem(draftStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.flaggedQuestions = next;
          localStorage.setItem(draftStorageKey, JSON.stringify(parsed));
        }
      } catch {}
      return next;
    });
  };

  const handleOpenLightbox = (e: React.MouseEvent, url: string, title: string) => {
    e.stopPropagation();
    e.preventDefault();
    setLightboxImage({ url, title });
  };

  const handleCloseLightbox = () => {
    setLightboxImage(null);
  };

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

  // Hook bảo mật phòng thi (ghi nhận vi phạm cục bộ, không khóa cứng màn hình)
  useExamSecurity({
    studentId: currentUser.id,
    studentName: 'fullName' in currentUser ? (currentUser as any).fullName : (currentUser as any).username,
    studentCode: 'studentCode' in currentUser ? (currentUser as any).studentCode : '',
    examId: exam.id,
    examTitle: exam.title,
    enabled: !isTeacherTesting && !submissionResult,
    onViolationRecorded: (type, label) => {
      recordViolation(type, label);
    },
  });

  const SYSTEM_LOCKED_KEYS = [
    'Escape',
    'AltLeft',
    'AltRight',
    'Tab',
    'MetaLeft',
    'MetaRight',
    'KeyD',
    'F4',
    'F11',
    'F12',
    'F5',
    'KeyR',
    'KeyW',
    'KeyT',
    'KeyN',
    'KeyP',
    'KeyS',
    'KeyC',
    'KeyV',
    'KeyX',
    'KeyU'
  ];

  // ================= 1. KÍCH HOẠT CHẾ ĐỘ TOÀN MÀN HÌNH & KHÓA BÀN PHÍM =================
  const enterFullscreen = async () => {
    try {
      const el = document.documentElement as any;
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (req) {
          await req.call(el);
        }
      }
      setIsFullscreen(true);

      // Khóa các phím hệ thống nguy hiểm qua Keyboard Lock API (Chromium / Chrome / Edge / Cốc Cốc)
      if ('keyboard' in navigator && (navigator as any).keyboard?.lock) {
        try {
          await (navigator as any).keyboard.lock(SYSTEM_LOCKED_KEYS);
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
      if (isFull && 'keyboard' in navigator && (navigator as any).keyboard?.lock) {
        try {
          (navigator as any).keyboard.lock(SYSTEM_LOCKED_KEYS).catch(() => {});
        } catch {}
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

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code || '';
      if (
        e.key === 'Meta' || e.key === 'OS' || code === 'MetaLeft' || code === 'MetaRight' ||
        e.key === 'Alt' || code === 'AltLeft' || code === 'AltRight'
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('selectstart', handleSelectStart);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('copy', handleClipboard);
    window.addEventListener('paste', handleClipboard);
    window.addEventListener('cut', handleClipboard);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('selectstart', handleSelectStart);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
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
          flaggedQuestions,
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

  // Theo dõi hash câu trả lời đã đồng bộ gần nhất để chống spam request ngầm (Dirty Check)
  const lastSyncedAnswersHashRef = useRef<string>(JSON.stringify(initialDraft?.answers || {}));

  // Đồng bộ ngầm (Auto-save) sau mỗi 60 giây - CHỈ gửi server nếu có câu trả lời mới (Dirty check)
  // Tuyệt đối không gửi request định kỳ nếu học sinh không thay đổi câu trả lời hoặc chỉ để đồng bộ giờ!
  useEffect(() => {
    if (isTeacherTesting || isFinishedRef.current) return;

    const autoSaveInterval = setInterval(async () => {
      // 1. Luôn lưu ngay tức khắc vào localStorage an toàn trên máy học sinh (0 network request)
      saveDraftToLocalStorage(answersRef.current);

      const currentAnswersHash = JSON.stringify(answersRef.current);
      // Nếu câu trả lời chưa từng thay đổi so với lần đồng bộ trước, bỏ qua không gọi server
      if (currentAnswersHash === lastSyncedAnswersHashRef.current) {
        return;
      }

      try {
        setSaveStatus('saving');
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

        lastSyncedAnswersHashRef.current = currentAnswersHash;
        setSaveStatus('saved');
        setLastAutoSaveTime(new Date().toLocaleTimeString('vi-VN'));
      } catch (err) {
        console.warn('[Auto-save] Đồng bộ ngầm tạm thời offline (bản nháp đã lưu an toàn trên máy):', err);
        setSaveStatus('saved');
      }
    }, 60000); // 60 giây và chỉ gửi khi answers bị thay đổi (Dirty check)

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

    // Mở khóa bàn phím (Vẫn GIỮ NGUYÊN Fullscreen theo Requirement 4 cho tới khi bấm Hoàn Tất & Đóng)
    if ('keyboard' in navigator && (navigator as any).keyboard?.unlock) {
      try {
        (navigator as any).keyboard.unlock();
      } catch {}
    }

    const timeSpentSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const scoreResult = calculateExamScore(shuffledQuestions, answers, exam.passingScore, exam.totalScore);

    // Cập nhật số lần làm đạt yêu cầu
    const newPassedCount = scoreResult.isPassed ? passedAttemptsCount + 1 : passedAttemptsCount;
    setPassedAttemptsCount(newPassedCount);

    const targetPass = Math.max(1, exam.requiredPassCount || 1);
    const metRequirement = isTeacherTesting || (newPassedCount >= targetPass);

    if (metRequirement) {
      setTimeout(() => triggerFireworks(), 350);
    }

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
      maxScore: scoreResult.maxScore || exam.totalScore || 1000,
      isPassed: scoreResult.isPassed, // >= exam.passingScore
      submittedAt: now.toISOString(),
      dateKey,
      timeSpentSeconds,
      attemptNumber: attemptNumberState,
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
      isFinishedRef.current = true;

      // Nhả khóa bàn phím (vẫn GIỮ NGUYÊN Toàn Màn Hình theo Requirement 4 cho tới khi học sinh bấm "Hoàn Tất & Đóng")
      if ('keyboard' in navigator && (navigator as any).keyboard?.unlock) {
        try {
          (navigator as any).keyboard.unlock();
        } catch {}
      }
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
      className="fixed inset-0 z-50 flex flex-col bg-[#F8FAFC] text-slate-900 select-none font-sans"
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        margin: 0,
        padding: 0,
        backgroundColor: '#F8FAFC',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overscrollBehavior: 'none',
      }}
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

      {/* ================= MODAL BẮT BUỘC TOÀN MÀN HÌNH ĐỂ ẨN THANH CÔNG CỤ TRÌNH DUYỆT ================= */}
      {!isFullscreen && !isTeacherTesting && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md animate-in fade-in zoom-in-95">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 text-center shadow-2xl border-2 border-indigo-500 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600" />
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4 border border-indigo-200 shadow-sm animate-bounce">
              <Maximize className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight mb-2">
              {submissionResult ? 'Tiếp Tục Giữ Chế Độ Toàn Màn Hình' : 'Chế Độ Thi Toàn Màn Hình'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-6">
              {submissionResult
                ? 'Hệ thống yêu cầu giữ toàn màn hình cho đến khi bạn hoàn tất và bấm nút "Hoàn Tất & Đóng".'
                : 'Hệ thống yêu cầu chuyển sang Toàn Màn Hình để ẩn thanh công cụ trình duyệt web và chống phím tắt cho đến khi bạn nộp bài.'}
            </p>
            <button
              type="button"
              onClick={enterFullscreen}
              className="w-full py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Maximize className="w-4 h-4" />
              <span>{submissionResult ? 'Kích Hoạt Lại Toàn Màn Hình' : 'Bật Toàn Màn Hình & Bắt Đầu Làm Bài'}</span>
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
      {submissionResult && !isReviewingInline && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in zoom-in-95 select-none">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden text-slate-900 border border-slate-200">
            {/* Header popup */}
            <div
              className={`p-6 text-white text-center transition-colors ${
                isRequirementMet
                  ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700'
                  : submissionResult.isPassed
                  ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600'
                  : 'bg-gradient-to-r from-red-600 via-rose-600 to-orange-600'
              }`}
            >
              <div className="mb-2 flex items-center justify-center">
                <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-xs text-[11px] font-mono font-bold tracking-wider">
                  THIEN<span className="text-[#EF4444] font-black">TECH</span> :: KHẢO THÍ SỐ
                </span>
              </div>
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center mx-auto mb-3 shadow-inner">
                {isRequirementMet ? (
                  <Trophy className="w-9 h-9 text-white animate-bounce" />
                ) : (
                  <Award className="w-9 h-9 text-white" />
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-wide">
                {isRequirementMet
                  ? '🎉 CHÚC MỪNG BẠN ĐÃ HOÀN THÀNH XUẤT SẮC!'
                  : submissionResult.isPassed
                  ? 'LẦN THI NÀY ĐÃ ĐẠT ĐIỂM CHUẨN!'
                  : 'BÀI THI CHƯA ĐẠT CHUẨN'}
              </h2>
              <p className="text-xs text-white/90 mt-1">
                Điểm chuẩn khảo thí: <strong>{exam.passingScore ?? 950} / {exam.totalScore ?? 1000} điểm</strong>
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Điểm số */}
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
                  <span className="text-xl text-slate-400 font-normal">/ {exam.totalScore ?? 1000}</span>
                </div>
                <div className="inline-block px-3 py-1 rounded-full text-xs font-bold font-mono">
                  {submissionResult.isPassed ? (
                    <span className="text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                      ✓ ĐẠT CHUẨN (≥ {exam.passingScore ?? 950}đ)
                    </span>
                  ) : (
                    <span className="text-red-700 bg-red-100 px-3 py-1 rounded-full">
                      ✕ CHƯA ĐẠT CHUẨN (&lt; {exam.passingScore ?? 950}đ)
                    </span>
                  )}
                </div>
              </div>

              {/* KHUNG TIẾN ĐỘ SỐ LẦN LÀM ĐẠT YÊU CẦU (Requirement 2a & 2b) */}
              <div
                className={`p-4 rounded-2xl border ${
                  isRequirementMet
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50/80 border-amber-200 text-amber-950'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {isRequirementMet ? (
                      <Trophy className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <Target className="w-5 h-5 text-amber-600 shrink-0" />
                    )}
                    <span className="font-bold text-xs uppercase tracking-wide">
                      Tiến độ làm đạt yêu cầu:
                    </span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black font-mono shadow-xs ${
                      isRequirementMet
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    {passedAttemptsCount} / {targetPassCount} LẦN ĐẠT
                  </span>
                </div>

                <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isRequirementMet ? 'bg-emerald-600' : 'bg-amber-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((passedAttemptsCount / targetPassCount) * 100))}%`,
                    }}
                  />
                </div>

                <p className="text-[11px] font-medium leading-relaxed">
                  {isRequirementMet ? (
                    <span className="text-emerald-700 font-semibold">
                      ✓ Tuyệt vời! Bạn đã hoàn thành xuất sắc đủ <strong>{targetPassCount} lần làm bài đạt chuẩn</strong> theo quy định của giáo viên.
                    </span>
                  ) : (
                    <span className="text-amber-800 font-semibold">
                      ⚠️ Giáo viên yêu cầu đề thi này phải làm đạt chuẩn <strong>{targetPassCount} lần</strong>. Hiện bạn mới đạt {passedAttemptsCount} lần, cần làm đạt thêm <strong>{passesRemaining} lần nữa</strong> mới được phép hoàn tất và thoát bài thi.
                    </span>
                  )}
                </p>
              </div>

              {/* Thời gian làm bài & Vi phạm */}
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

              {/* CÁC NÚT THAO TÁC (Requirement 2a & 2b) */}
              <div className="pt-2">
                {isRequirementMet ? (
                  // ĐÃ ĐẠT ĐỦ SỐ LẦN YÊU CẦU: Ẩn xem lại đáp án, HIỆN nút Hoàn Tất & Đóng
                  <button
                    type="button"
                    onClick={handleFinishAndClose}
                    className="w-full py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-lg transition-all cursor-pointer text-center hover:scale-101 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>Hoàn Tất & Đóng</span>
                  </button>
                ) : (
                  // CHƯA ĐẠT ĐỦ SỐ LẦN YÊU CẦU: Ẩn nút Hoàn Tất & Đóng, CHỈ GIỮ LẠI nút xem lại đáp án
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsReviewingInline(true)}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2.5 cursor-pointer hover:scale-101"
                    >
                      <Eye className="w-5 h-5" />
                      <span>Xem Lại Đáp Án Chi Tiết</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM LẠI ĐÁP ÁN INLINE (Giữ nguyên Fullscreen, tắt nút thoát, thay bằng nút Làm Lại Đề Thi - Requirement 3 & 4) */}
      {submissionResult && isReviewingInline && (
        <ExamReviewModal
          submission={submissionResult}
          onClose={() => setIsReviewingInline(false)}
          exam={exam}
          isRequiredPassEnforced={!isRequirementMet}
          onRetakeExam={handleRetakeExam}
          requiredPassCount={targetPassCount}
          passedAttemptsCount={passedAttemptsCount}
        />
      )}

      {/* ================= THANH TIÊU ĐỀ PHÒNG THI (HỌC THUẬT, CỐ ĐỊNH, KHÔNG CUỘN) ================= */}
      <header className="h-14 sm:h-16 px-3 sm:px-6 bg-white border-b border-slate-200/90 shadow-2xs flex items-center justify-between shrink-0 z-20 w-full max-w-full min-w-0 overflow-x-hidden">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <ThientchLogo
            size="sm"
            variant="light"
            subtitle="Khảo Thí Chuẩn Hóa"
            className="hidden lg:flex shrink-0 pr-3 border-r border-slate-200"
          />
          <div className="w-9 h-9 rounded-lg bg-[#1E3A8A] text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0 tracking-wider">
            IT
          </div>
          <div className="truncate">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate" title={exam.title}>
              {exam.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs mt-0.5">
              <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 font-bold">
                {exam.subject || 'Công nghệ Thông tin'}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold hidden sm:inline">
                Thang điểm: {exam.totalScore ?? 1000}đ • Đạt: ≥ {exam.passingScore ?? 950}đ
              </span>
              {'fullName' in currentUser && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-medium hidden md:inline">
                  Thí sinh: <strong>{currentUser.fullName}</strong>
                  {'studentCode' in currentUser && ` (SBD: ${currentUser.studentCode})`}
                </span>
              )}
              {exam.isPracticeTest && (
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                  Thi Thử Ngẫu Nhiên
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Thanh trạng thái góc phải: Đồng bộ ngầm, Cảnh báo vi phạm, Toàn màn hình */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Mobile Live Countdown Timer (lg:hidden) */}
          {!isTeacherTesting && (
            <div className={`lg:hidden flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-xs font-bold border ${
              timeRemaining < 300 
                ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse' 
                : 'bg-slate-50 text-slate-800 border-slate-200'
            }`}>
              <Clock className={`w-3.5 h-3.5 ${timeRemaining < 300 ? 'text-rose-600' : 'text-slate-600'}`} />
              <span>{formatTimer(timeRemaining)}</span>
            </div>
          )}

          {/* Mobile Question Palette Trigger (lg:hidden) */}
          <button
            type="button"
            onClick={() => setShowMobilePalette(true)}
            className="lg:hidden px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
            title="Mở bảng danh sách câu hỏi"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-indigo-600" />
            <span className="font-mono text-[11px]">{answeredCount}/{totalQuestions}</span>
          </button>

          {/* Mobile Direct Submit Button (lg:hidden) */}
          <button
            type="button"
            onClick={handleAttemptSubmit}
            className={`lg:hidden px-2.5 py-1 rounded-lg text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition-all active:scale-95 ${
              isAllAnswered || isTeacherTesting || currentIndex === totalQuestions - 1
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30 ring-2 ring-emerald-400/40 animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
            title="Nộp bài thi"
          >
            <Send className="w-3 h-3" />
            <span>Nộp</span>
          </button>

          {/* Trạng thái Offline-First */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold" title="Kết nối Internet ổn định. Toàn bộ bài làm được lưu tức thì vào localStorage và tự động đồng bộ">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Offline-First (An toàn)</span>
                {lastAutoSaveTime && <span className="text-slate-400 font-normal hidden lg:inline">• {lastAutoSaveTime}</span>}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-700 font-semibold" title="Mất mạng Internet tạm thời. Bạn tiếp tục làm bài bình thường, bài làm được bảo vệ an toàn trên máy">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Offline-First (Cục bộ)</span>
              </span>
            )}
          </div>

          {violationCount > 0 && !isTeacherTesting && (
            <button
              type="button"
              onClick={() => setShowViolationWarning(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-red-50 border border-red-300 text-red-700 hover:bg-red-100 text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer animate-pulse"
              title="Nhấn để xem chi tiết vi phạm quy chế"
            >
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
              <span className="hidden xs:inline">Vi phạm:</span>
              <span>{violationCount}</span>
            </button>
          )}

          <button
            type="button"
            onClick={enterFullscreen}
            className="p-1.5 sm:p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
            title="Chế độ toàn màn hình"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Dải thông báo khôi phục bài làm thành công từ bộ nhớ an toàn (Offline-First) */}
      {restoredNotification && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2 text-xs flex items-center justify-between text-emerald-900 shrink-0">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Bảo vệ bài làm (Offline-First):</strong> Đã tự động khôi phục toàn bộ câu trả lời và thời gian từ bản nháp an toàn trên thiết bị của bạn.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRestoredNotification(false)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold px-2 py-0.5 rounded hover:bg-emerald-100"
          >
            Đã hiểu ✕
          </button>
        </div>
      )}

      {/* Dải thông báo vi phạm màu đỏ luôn hiển thị nhắc nhở nếu có vi phạm */}
      {violationCount > 0 && !isTeacherTesting && (
        <div className="bg-rose-50 border-b border-rose-200 px-5 py-2 text-xs flex items-center justify-between text-rose-900 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="truncate">
              <strong>Cảnh báo quy chế:</strong> Đã ghi nhận <strong className="text-rose-700 font-bold">{violationCount} lần vi phạm</strong> (chuột phải / F12 / rời màn hình). Số lần này sẽ được lưu gửi tới Giám khảo.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowViolationWarning(true)}
            className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline cursor-pointer shrink-0 ml-3"
          >
            Xem chi tiết
          </button>
        </div>
      )}

      {/* ================= NỘI DUNG CHÍNH (BỐ CỤC 100VH VỪA VẶN 1 MÀN HÌNH - 2 CỘT 70/30) ================= */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row gap-2 sm:gap-4 lg:gap-5 p-2 sm:p-4 lg:p-5 bg-[#F8FAFC] w-full max-w-full">
        {/* ================= CỘT TRÁI: NỘI DUNG CÂU HỎI & ĐÁP ÁN (~70%) ================= */}
        <main className="flex-1 lg:flex-[7] min-w-0 h-full flex flex-col relative">
          {currentQ ? (
            <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* 1. Header Card câu hỏi */}
              <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-3 py-1 rounded-md bg-[#1E3A8A] text-white font-bold text-xs tracking-wider shadow-2xs">
                    CÂU HỎI {currentIndex + 1} / {totalQuestions}
                  </span>
                  <span className="text-xs text-indigo-700 font-bold font-mono bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {totalQuestions > 0 ? (
                      ((exam.totalScore || 1000) / totalQuestions) % 1 === 0
                        ? `${(exam.totalScore || 1000) / totalQuestions} điểm`
                        : `${((exam.totalScore || 1000) / totalQuestions).toFixed(2)} điểm`
                    ) : '0 điểm'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">
                    {currentQ.type === 'single_choice' && 'Trắc nghiệm: Chọn 1 đáp án'}
                    {currentQ.type === 'multiple_choice' &&
                      `Trắc nghiệm: Chọn ${currentQ.correctOptionIds?.length || 2} đáp án`}
                    {currentQ.type === 'matching' && 'Ghép đôi hai vế tương ứng'}
                    {currentQ.type === 'ordering' && 'Sắp xếp theo thứ tự đúng'}
                    {currentQ.type === 'true_false' && 'Đúng / Sai theo nhận định'}
                    {currentQ.type === 'hotspot' && 'Chọn điểm trên hình ảnh (Hotspot)'}
                    {currentQ.type === 'fill_blank' && 'Chọn từ điền vào chỗ trống'}
                  </span>
                </div>

                {/* Nút Đánh dấu xem lại (Flag / Bookmark) */}
                <button
                  type="button"
                  onClick={() => toggleFlagQuestion(currentQ.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                    flaggedQuestions.includes(currentQ.id)
                      ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Đánh dấu câu hỏi này để xem lại trước khi nộp bài"
                >
                  <Flag
                    className={`w-3.5 h-3.5 ${
                      flaggedQuestions.includes(currentQ.id)
                        ? 'fill-amber-500 text-amber-600'
                        : 'text-slate-400'
                    }`}
                  />
                  <span>
                    {flaggedQuestions.includes(currentQ.id) ? 'Đã Đánh Dấu' : 'Đánh Dấu Xem Lại'}
                  </span>
                </button>
              </div>

              {/* 2. Cuộn nội dung câu hỏi & đáp án (Phẳng phiu, ẩn hoàn toàn thanh cuộn UI) */}
              <div className="flex-1 overflow-y-auto p-6 lg:p-7 space-y-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {/* Đề bài: font-weight 600/700, size 18px-20px, line-height 1.6, màu Charcoal / Slate-900 */}
                <div className="space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 text-blue-700" />
                    <span>Nội dung đề bài:</span>
                  </div>
                  <div className="text-lg lg:text-xl font-bold text-slate-900 leading-relaxed tracking-tight">
                    {currentQ.title}
                  </div>
                </div>

                {/* Phương tiện bổ trợ: Ảnh phóng to hoặc Video */}
                {currentQ.mediaType === 'image' && currentQ.mediaUrl && (
                  <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50/50 p-2.5">
                    <div
                      onClick={(e) =>
                        handleOpenLightbox(e, currentQ.mediaUrl!, `Hình ảnh câu hỏi ${currentIndex + 1}`)
                      }
                      className="group/qimg relative inline-block cursor-zoom-in max-w-full"
                      title="Nhấp để phóng to hình ảnh câu hỏi"
                    >
                      <img
                        src={currentQ.mediaUrl}
                        alt="Hình ảnh câu hỏi"
                        className="max-h-72 mx-auto object-contain rounded-md transition-all duration-200 group-hover/qimg:brightness-105 group-hover/qimg:ring-2 group-hover/qimg:ring-blue-400 group-hover/qimg:shadow-md"
                      />
                      <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-md bg-slate-900/85 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md opacity-0 group-hover/qimg:opacity-100 transition-opacity pointer-events-none backdrop-blur-xs">
                        <ZoomIn className="w-3.5 h-3.5" />
                        <span>Phóng to</span>
                      </div>
                    </div>
                  </div>
                )}

                {currentQ.mediaType === 'video' && currentQ.mediaUrl && (
                  <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50/50 p-2.5">
                    {currentQ.mediaUrl.includes('youtube.com') || currentQ.mediaUrl.includes('youtu.be') ? (
                      <iframe
                        src={currentQ.mediaUrl.replace('watch?v=', 'embed/')}
                        title="Video câu hỏi"
                        className="w-full aspect-video rounded-md"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video src={currentQ.mediaUrl} controls className="w-full rounded-md max-h-72" />
                    )}
                  </div>
                )}

                {/* 3. KHỐI LỰA CHỌN ĐÁP ÁN (Bo góc 6-8px, typography font-medium dịu mắt, hover viền xanh nhạt, click viền Primary Blue và nền xanh nhạt) */}
                <div className="pt-2 space-y-4">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 text-xs text-slate-500 font-semibold">
                    <span className="uppercase tracking-wider font-bold text-slate-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      Lựa chọn đáp án của bạn:
                    </span>
                    <span>
                      {currentQ.type === 'single_choice' && 'Nhấp chọn 1 đáp án chính xác'}
                      {currentQ.type === 'multiple_choice' &&
                        `Chọn đủ ${currentQ.correctOptionIds?.length || 2} đáp án đúng`}
                      {currentQ.type === 'matching' && 'Kéo từ Cột A hoặc nhấp chọn để kết nối sang Cột B'}
                      {currentQ.type === 'ordering' && 'Bấm mũi tên để sắp xếp trật tự logic'}
                      {currentQ.type === 'true_false' && 'Chọn Đúng hoặc Sai cho mỗi nhận định'}
                      {currentQ.type === 'fill_blank' && 'Chọn từ phù hợp trong ô danh sách'}
                      {currentQ.type === 'hotspot' && 'Nhấp chọn vị trí chính xác trên ảnh'}
                    </span>
                  </div>

                  {/* A. SINGLE CHOICE */}
                  {currentQ.type === 'single_choice' && currentQ.options && (
                    <div className="space-y-2.5">
                      {currentQ.options.map((opt, oIdx) => {
                        const isSelected = answers[currentQ.id] === opt.id;
                        const charLabel = String.fromCharCode(65 + oIdx);
                        return (
                          <div
                            key={opt.id}
                            onClick={() => updateAnswer(currentQ.id, opt.id)}
                            className={`p-3.5 sm:p-4 rounded-lg border transition-all cursor-pointer flex items-center gap-3.5 group ${
                              isSelected
                                ? 'bg-blue-50/70 border-2 border-blue-600 text-slate-900 shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50/70 hover:border-blue-400'
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200 group-hover:bg-blue-50 group-hover:text-blue-700 group-hover:border-blue-300'
                              }`}
                            >
                              {charLabel}
                            </div>
                            <div className="flex-1 text-sm sm:text-base font-medium text-slate-800 leading-relaxed">
                              {opt.text}
                              {opt.imageUrl && (
                                <div
                                  onClick={(e) =>
                                    handleOpenLightbox(
                                      e,
                                      opt.imageUrl!,
                                      `Đáp án ${charLabel}: ${opt.text || ''}`
                                    )
                                  }
                                  className="group/optimg relative inline-block cursor-zoom-in mt-2 max-w-full"
                                  title="Nhấp để phóng to hình ảnh đáp án (Không chọn đáp án)"
                                >
                                  <img
                                    src={opt.imageUrl}
                                    alt={`Đáp án ${charLabel}`}
                                    className="max-h-40 object-contain rounded-md border border-slate-200 bg-white p-1 transition-all duration-200 group-hover/optimg:border-blue-500 group-hover/optimg:ring-2 group-hover/optimg:ring-blue-300"
                                  />
                                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-slate-900/85 text-white text-[11px] font-semibold flex items-center gap-1 shadow-md opacity-0 group-hover/optimg:opacity-100 transition-opacity pointer-events-none">
                                    <ZoomIn className="w-3 h-3" />
                                    <span>Phóng to</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* B. MULTIPLE CHOICE */}
                  {currentQ.type === 'multiple_choice' && currentQ.options && (
                    <div className="space-y-2.5">
                      <div className="text-xs text-amber-900 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200 flex items-center justify-between">
                        <span>ℹ️ Chọn đúng <strong>{currentQ.correctOptionIds?.length || 2}</strong> đáp án.</span>
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
                            className={`p-3.5 sm:p-4 rounded-lg border transition-all cursor-pointer flex items-center gap-3.5 group ${
                              isSelected
                                ? 'bg-blue-50/70 border-2 border-blue-600 text-slate-900 shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50/70 hover:border-blue-400'
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200 group-hover:border-blue-400'
                              }`}
                            >
                              {isSelected ? '✓' : charLabel}
                            </div>
                            <div className="flex-1 text-sm sm:text-base font-medium text-slate-800 leading-relaxed">
                              {opt.text}
                              {opt.imageUrl && (
                                <div
                                  onClick={(e) =>
                                    handleOpenLightbox(
                                      e,
                                      opt.imageUrl!,
                                      `Đáp án ${charLabel}: ${opt.text || ''}`
                                    )
                                  }
                                  className="group/optimg relative inline-block cursor-zoom-in mt-2 max-w-full"
                                  title="Nhấp để phóng to hình ảnh đáp án"
                                >
                                  <img
                                    src={opt.imageUrl}
                                    alt={`Đáp án ${charLabel}`}
                                    className="max-h-40 object-contain rounded-md border border-slate-200 bg-white p-1 transition-all duration-200 group-hover/optimg:border-blue-500 group-hover/optimg:ring-2 group-hover/optimg:ring-blue-300"
                                  />
                                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-slate-900/85 text-white text-[11px] font-semibold flex items-center gap-1 shadow-md opacity-0 group-hover/optimg:opacity-100 transition-opacity pointer-events-none">
                                    <ZoomIn className="w-3 h-3" />
                                    <span>Phóng to</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* C. MATCHING */}
                  {currentQ.type === 'matching' && currentQ.matchingPairs && (
                    <div className="space-y-4">
                      <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200 flex flex-wrap items-center justify-between gap-2.5 text-xs text-blue-950">
                        <div className="flex items-center gap-1.5">
                          <MousePointer className="w-4 h-4 text-blue-600 shrink-0" />
                          <span>
                            <strong>Cách làm:</strong> Kéo đáp án từ Cột A sang Cột B (hoặc nhấp chọn thẻ ở A rồi nhấp tiếp vào ô ở B).
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {(() => {
                            const matches: Record<string, string> = answers[currentQ.id] || {};
                            const matchedCount = Object.keys(matches).length;
                            const total = currentQ.matchingPairs.length;
                            return (
                              <span
                                className={`px-2.5 py-0.5 rounded-md font-bold font-mono text-xs border ${
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
                              className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              title="Xóa tất cả các cặp đã ghép"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Làm lại</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Lưới 2 cột */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* CỘT A */}
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider">
                            <span>CỘT A (KÉO TỪ ĐÂY)</span>
                            <span className="text-[11px] text-slate-500 font-normal">Kéo / Nhấp chọn</span>
                          </div>

                          <div className="space-y-2">
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
                                  className={`p-3.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing select-none relative group ${
                                    isSelectedForClick
                                      ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-400 shadow-xs'
                                      : isMatched
                                      ? 'bg-blue-50/50 border-blue-300'
                                      : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-slate-50 shadow-2xs'
                                  } ${isBeingDragged ? 'opacity-40 scale-95' : ''}`}
                                >
                                  <div className="flex items-start gap-2.5">
                                    <div className="mt-0.5 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0">
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                    <span className="w-6 h-6 rounded-md bg-blue-100 border border-blue-200 text-blue-900 flex items-center justify-center text-xs font-bold font-mono shrink-0">
                                      A{pIdx + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-slate-900 leading-snug">
                                        {pair.leftText}
                                      </p>
                                      {pair.leftImageUrl && (
                                        <div
                                          onClick={(e) =>
                                            handleOpenLightbox(
                                              e,
                                              pair.leftImageUrl!,
                                              `Thẻ A${pIdx + 1}: ${pair.leftText}`
                                            )
                                          }
                                          className="group/pairimg relative inline-block cursor-zoom-in mt-1.5"
                                          title="Nhấp để phóng to hình ảnh"
                                        >
                                          <img
                                            src={pair.leftImageUrl}
                                            alt="Hình ảnh ghép"
                                            className="mt-1 max-h-20 rounded-md border border-slate-200 object-cover bg-white transition-all duration-200 group-hover/pairimg:ring-2 group-hover/pairimg:ring-blue-400"
                                          />
                                          <div className="absolute bottom-1 right-1 p-0.5 rounded bg-slate-900/85 text-white opacity-0 group-hover/pairimg:opacity-100 transition-opacity pointer-events-none">
                                            <ZoomIn className="w-3 h-3" />
                                          </div>
                                        </div>
                                      )}
                                      
                                      {isMatched && (
                                        <div className="mt-2 flex items-center justify-between text-xs pt-1.5 border-t border-slate-200">
                                          <span className="font-semibold text-emerald-700 flex items-center gap-1">
                                            <Link2 className="w-3.5 h-3.5" />
                                            <span>Đã ghép: <strong>B{rightItemIndex + 1}</strong></span>
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDisconnectPair(currentQ.id, pair.id);
                                            }}
                                            className="text-[11px] font-semibold text-rose-700 hover:text-rose-800 px-2 py-0.5 rounded bg-rose-50 border border-rose-200 hover:bg-rose-100 cursor-pointer transition-colors"
                                          >
                                            Hủy ghép
                                          </button>
                                        </div>
                                      )}

                                      {isSelectedForClick && !isMatched && (
                                        <div className="mt-1.5 text-[11px] text-amber-800 font-semibold flex items-center gap-1 animate-pulse">
                                          <span>👉 Nhấp tiếp vào 1 ô ở Cột B để nối!</span>
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
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider">
                            <span>CỘT B (THẢ VÀO ĐÂY)</span>
                            <span className="text-[11px] text-emerald-700 font-mono font-bold">Đã đảo vị trí</span>
                          </div>

                          <div className="space-y-2">
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
                                    className={`p-3.5 rounded-lg border transition-all ${
                                      isDragOver
                                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400 scale-[1.01] shadow-sm'
                                        : connected
                                        ? 'bg-emerald-50/50 border-emerald-400 shadow-2xs'
                                        : isClickTarget
                                        ? 'bg-amber-50/50 border-amber-400 hover:border-amber-500 cursor-pointer ring-1 ring-amber-300'
                                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2.5">
                                      <span className="w-6 h-6 rounded-md bg-emerald-100 border border-emerald-200 text-emerald-900 flex items-center justify-center text-xs font-bold font-mono shrink-0">
                                        B{rIdx + 1}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 leading-snug">
                                          {rightP.rightText}
                                        </p>
                                        {rightP.rightImageUrl && (
                                          <div
                                            onClick={(e) =>
                                              handleOpenLightbox(
                                                e,
                                                rightP.rightImageUrl!,
                                                `Thẻ B${rIdx + 1}: ${rightP.rightText}`
                                              )
                                            }
                                            className="group/pairimg relative inline-block cursor-zoom-in mt-1.5"
                                            title="Nhấp để phóng to hình ảnh"
                                          >
                                            <img
                                              src={rightP.rightImageUrl}
                                              alt="Hình ảnh minh họa"
                                              className="mt-1 max-h-20 rounded-md border border-slate-200 object-cover bg-white transition-all duration-200 group-hover/pairimg:ring-2 group-hover/pairimg:ring-blue-400"
                                            />
                                            <div className="absolute bottom-1 right-1 p-0.5 rounded bg-slate-900/85 text-white opacity-0 group-hover/pairimg:opacity-100 transition-opacity pointer-events-none">
                                              <ZoomIn className="w-3 h-3" />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Vùng hiển thị thẻ đã kết nối */}
                                    <div className="mt-2.5 pt-2 border-t border-slate-200">
                                      {connected ? (
                                        <div className="p-2 rounded-md bg-white border border-emerald-300 flex items-center justify-between gap-2 text-xs shadow-2xs">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="w-5 h-5 rounded bg-blue-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                              A{connected.leftIndex + 1}
                                            </span>
                                            <span className="text-slate-900 font-semibold truncate">
                                              {connected.leftPair.leftText}
                                            </span>
                                            {connected.leftPair.leftImageUrl && (
                                              <div
                                                onClick={(e) =>
                                                  handleOpenLightbox(
                                                    e,
                                                    connected.leftPair.leftImageUrl!,
                                                    `Ảnh thẻ A${connected.leftIndex + 1}`
                                                  )
                                                }
                                                className="cursor-zoom-in group/connimg relative inline-block shrink-0"
                                                title="Nhấp để phóng to"
                                              >
                                                <img
                                                  src={connected.leftPair.leftImageUrl}
                                                  alt="Ảnh"
                                                  className="h-5 w-7 object-cover rounded border border-slate-200 group-hover/connimg:ring-1 group-hover/connimg:ring-blue-500"
                                                />
                                              </div>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDisconnectPair(currentQ.id, connected.leftPair.id);
                                            }}
                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors cursor-pointer shrink-0"
                                            title="Gỡ bỏ liên kết"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div
                                          className={`py-2 px-2 rounded-md border border-dashed text-center text-xs transition-colors flex items-center justify-center gap-1.5 ${
                                            isDragOver
                                              ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                                              : isClickTarget
                                              ? 'border-amber-400 bg-amber-50 text-amber-800 font-semibold'
                                              : 'border-slate-300 text-slate-500 bg-slate-50'
                                          }`}
                                        >
                                          <MousePointer className="w-3 h-3 opacity-60" />
                                          <span>
                                            {isDragOver
                                              ? 'Thả vào đây để ghép'
                                              : isClickTarget
                                              ? 'Nhấp vào đây để kết nối'
                                              : 'Kéo thẻ ở Cột A thả vào đây'}
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

                  {/* D. ORDERING */}
                  {currentQ.type === 'ordering' && currentQ.orderingItems && (
                    <div className="space-y-2.5">
                      <p className="text-xs text-slate-500 font-medium">
                        Sử dụng mũi tên lên / xuống để di chuyển các mục vào đúng thứ tự logic:
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
                              className="p-3.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-3 shadow-2xs hover:border-blue-400 transition-colors"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="w-7 h-7 rounded-md bg-[#1E3A8A] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                                  {idx + 1}
                                </span>
                                <span className="text-sm sm:text-base font-semibold text-slate-800">{item.text}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveOrderItem(currentQ.id, idx, idx - 1)}
                                  className="w-8 h-8 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                                  title="Di chuyển lên trên"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === currentOrder.length - 1}
                                  onClick={() => handleMoveOrderItem(currentQ.id, idx, idx + 1)}
                                  className="w-8 h-8 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                                  title="Di chuyển xuống dưới"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}

                  {/* E. TRUE / FALSE */}
                  {currentQ.type === 'true_false' && currentQ.tfStatements && (
                    <div className="space-y-3">
                      <div className="text-xs text-amber-900 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200 flex items-center justify-between gap-2">
                        <span>ℹ️ <strong>Lưu ý:</strong> Đánh giá tính Đúng hoặc Sai cho mỗi nhận định dưới đây.</span>
                        <span className="text-[11px] font-mono text-amber-800 font-bold">Đã đảo đáp án</span>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-2xs">
                        <table className="w-full text-left text-xs sm:text-sm">
                          {(() => {
                            const columns = currentQ.shuffledTfColumns || ['true', 'false'];
                            return (
                              <>
                                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                                  <tr>
                                    <th className="p-3 w-12 text-center">STT</th>
                                    <th className="p-3">Nội dung nhận định / phát biểu</th>
                                    {columns.map((colKey) => (
                                      <th
                                        key={colKey}
                                        className={`p-3 w-28 text-center font-bold ${
                                          colKey === 'true' ? 'text-emerald-800 bg-emerald-50/60' : 'text-rose-800 bg-rose-50/60'
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
                                        <td className="p-3 text-center text-slate-500 font-mono font-bold">
                                          {idx + 1}
                                        </td>
                                        <td className="p-3 text-slate-800 font-medium">{st.statement}</td>
                                        {columns.map((colKey) => {
                                          const isTrueOption = colKey === 'true';
                                          const isChecked = userVal === isTrueOption;
                                          return (
                                            <td key={colKey} className="p-3 text-center">
                                              <label className="flex items-center justify-center cursor-pointer p-1">
                                                <input
                                                  type="radio"
                                                  name={`tf_${currentQ.id}_${st.id}`}
                                                  checked={isChecked}
                                                  onChange={() =>
                                                    handleUpdateTrueFalse(currentQ.id, st.id, isTrueOption)
                                                  }
                                                  className={`w-4 h-4 cursor-pointer ${
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

                  {/* F. HOTSPOT */}
                  {currentQ.type === 'hotspot' && currentQ.hotspotImageUrl && (
                    <div className="space-y-3 bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                      <HotspotCanvas
                        imageUrl={currentQ.hotspotImageUrl}
                        isStudent={true}
                        studentClicks={answers[currentQ.id] || []}
                        onStudentClicksChange={(clicks) => updateAnswer(currentQ.id, clicks)}
                        maxClicks={currentQ.hotspotRegions?.length || 1}
                      />
                    </div>
                  )}

                  {/* G. FILL IN THE BLANKS */}
                  {currentQ.type === 'fill_blank' && currentQ.fillBlankTemplate && (
                    <div className="space-y-3">
                      <div className="text-xs text-blue-900 bg-blue-50/70 p-2.5 rounded-lg border border-blue-200 flex items-center gap-1.5">
                        <span className="font-bold">ℹ️ Hướng dẫn:</span>
                        <span>Chọn đáp án thích hợp từ danh sách thả xuống cho từng vị trí ô trống.</span>
                      </div>
                      <div className="p-5 rounded-lg bg-white border border-slate-200 leading-loose text-slate-800 text-sm sm:text-base shadow-2xs font-medium">
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
                                    className={`px-3 py-1.5 rounded-md border text-xs sm:text-sm font-semibold transition-all focus:ring-2 focus:ring-blue-500 cursor-pointer ${
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
              </div>

              {/* 4. Thanh điều hướng câu hỏi ở đáy Card Cột Trái (Bottom Bar cố định) */}
              <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-50/90 border-t border-slate-200/90 shrink-0 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  className="px-3 sm:px-4 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 min-h-[40px]"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden xs:inline">Câu Trước</span>
                  <span className="xs:hidden">Trước</span>
                </button>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMobilePalette(true)}
                    className="text-xs font-bold font-mono text-slate-700 bg-white hover:bg-slate-100 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Bấm để mở bảng chọn câu hỏi"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 text-indigo-600 lg:hidden" />
                    <span>Câu {currentIndex + 1} / {totalQuestions}</span>
                  </button>
                  {(() => {
                    const ans = answers[currentQ.id];
                    const isAns =
                      ans !== undefined &&
                      ans !== null &&
                      (Array.isArray(ans)
                        ? ans.length > 0
                        : typeof ans === 'object'
                        ? Object.keys(ans).length > 0
                        : true);
                    return isAns ? (
                      <span className="hidden sm:inline-flex text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-semibold items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Đã trả lời
                      </span>
                    ) : (
                      <span className="hidden sm:inline-flex text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 font-medium">
                        Chưa trả lời
                      </span>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Nút Câu Kế Tiếp (khi chưa ở câu cuối cùng) */}
                  {currentIndex < totalQuestions - 1 && (
                    <button
                      type="button"
                      onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                      className="px-3 sm:px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 active:scale-95 text-white text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer shadow-xs min-h-[40px]"
                    >
                      <span className="hidden xs:inline">Câu Kế Tiếp</span>
                      <span className="xs:hidden">Tiếp</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}

                  {/* NÚT NỘP BÀI THI:
                      - Khi ở câu cuối cùng (currentIndex === totalQuestions - 1): Thay thế hoàn toàn nút Tiếp bị vô hiệu bằng nút Nộp Bài Thi màu xanh lá to rõ
                      - Khi chưa ở câu cuối trên Mobile (lg:hidden): Luôn có nút Nộp Bài cạnh nút Tiếp để học sinh nộp bài bất kỳ lúc nào
                  */}
                  {currentIndex === totalQuestions - 1 ? (
                    <button
                      type="button"
                      onClick={handleAttemptSubmit}
                      className="px-4 sm:px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer min-h-[40px] animate-pulse"
                      title="Nộp bài thi ngay"
                    >
                      <Send className="w-4 h-4" />
                      <span>Nộp Bài Thi</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAttemptSubmit}
                      className="lg:hidden px-2.5 sm:px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer min-h-[40px]"
                      title="Nộp bài thi"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Nộp Bài</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500">
              Đề thi chưa có câu hỏi nào.
            </div>
          )}
        </main>

        {/* ================= CỘT PHẢI: BẢNG GIÁM SÁT, ĐỒNG HỒ & ĐIỀU HƯỚNG (~30%) (GIỮ NGUYÊN TRÊN DESKTOP) ================= */}
        <aside className="hidden lg:flex lg:flex-[3] min-w-[280px] max-w-[360px] h-full flex-col">
          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs h-full flex flex-col overflow-hidden">
            {/* Khu vực 1: Đồng hồ đếm ngược & Thông tin tóm tắt */}
            <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3 shrink-0 bg-white">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <span>Thời gian còn lại</span>
                {timeRemaining < 300 && !isTeacherTesting && (
                  <span className="text-rose-600 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500 animate-pulse" /> Sắp hết giờ
                  </span>
                )}
              </div>

              {/* Đồng hồ số monospace lớn, trang trọng */}
              {isTeacherTesting ? (
                <div className="py-2.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-center font-bold text-xs flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600" /> Chế độ GV: Không tính giờ
                </div>
              ) : (
                <div
                  className={`py-2.5 rounded-lg border font-mono text-2xl font-black flex items-center justify-center gap-2.5 shadow-2xs tracking-widest ${
                    timeRemaining < 300
                      ? 'bg-rose-50 border-rose-400 text-rose-700 animate-pulse'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <Clock className={`w-5 h-5 ${timeRemaining < 300 ? 'text-rose-600' : 'text-slate-600'}`} />
                  <span>{formatTimer(timeRemaining)}</span>
                </div>
              )}

              {/* Thông tin tóm tắt thí sinh */}
              <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between text-slate-700 font-medium">
                  <span className="text-slate-500">Thí sinh:</span>
                  <strong className="text-slate-900 truncate max-w-[150px]">{currentUser.fullName}</strong>
                </div>
                {'studentCode' in currentUser && (
                  <div className="flex items-center justify-between text-slate-700 font-medium">
                    <span className="text-slate-500">Số báo danh (SBD):</span>
                    <strong className="font-mono text-slate-900">{currentUser.studentCode}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Khu vực 2: Bảng ma trận danh sách câu hỏi */}
            <div className="px-4 pt-3 pb-1 border-b border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Danh Sách Câu Hỏi
              </span>
              <span className="text-xs font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {answeredCount}/{totalQuestions} đã làm
              </span>
            </div>

            {/* Thanh tiến độ */}
            <div className="px-4 py-1.5 shrink-0">
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Lưới câu hỏi cuộn độc lập, phẳng phiu, ẩn hoàn toàn thanh cuộn UI */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden grid grid-cols-5 gap-2 content-start">
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
                const isFlagged = flaggedQuestions.includes(q.id);

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(qIdx)}
                    className={`h-10 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center relative ${
                      isCurrent
                        ? 'bg-[#2563EB] text-white font-black ring-2 ring-blue-500 ring-offset-1 shadow-xs'
                        : isAnswered
                        ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-400 hover:bg-emerald-100 font-bold'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                    title={`Câu ${qIdx + 1}${isAnswered ? ' (Đã làm)' : ' (Chưa làm)'}${
                      isFlagged ? ' - Đã đánh dấu xem lại' : ''
                    }`}
                  >
                    {qIdx + 1}
                    {isFlagged && (
                      <span
                        className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-white"
                        title="Đã đánh dấu"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Khu vực 3: Chú giải trạng thái (Legend) */}
            <div className="p-3 px-4 bg-slate-50/70 border-t border-slate-100 text-[11px] text-slate-600 shrink-0 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-emerald-50 border-2 border-emerald-400 shrink-0"></span>
                <span>Đã làm ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-slate-50 border border-slate-200 shrink-0"></span>
                <span>Chưa làm ({totalQuestions - answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-[#2563EB] shrink-0"></span>
                <span>Đang xem</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-amber-100 border border-amber-400 flex items-center justify-center shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                </span>
                <span>Đánh dấu ({flaggedQuestions.length})</span>
              </div>
            </div>

            {/* Khu vực 4: Nút Nộp Bài cố định ở đáy Cột Phải */}
            <div className="p-4 bg-white border-t border-slate-200/90 shrink-0">
              <button
                type="button"
                onClick={handleAttemptSubmit}
                className={`w-full py-3.5 rounded-lg active:scale-98 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  !isAllAnswered && !isTeacherTesting
                    ? 'bg-[#1E3A8A] hover:bg-blue-900 shadow-blue-950/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-700/20'
                }`}
              >
                {!isAllAnswered && !isTeacherTesting ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {!isAllAnswered && !isTeacherTesting
                    ? `Nộp Bài (${answeredCount}/${totalQuestions})`
                    : 'Nộp Bài Thi Ngay'}
                </span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ================= BẢNG CÂU HỎI & NỘP BÀI TRÊN DI ĐỘNG (MOBILE PALETTE BOTTOM SHEET) ================= */}
      {showMobilePalette && (
        <div className="lg:hidden fixed inset-0 z-60 flex flex-col justify-end animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setShowMobilePalette(false)}
          />
          <div className="relative w-full max-h-[85vh] bg-white rounded-t-3xl shadow-2xl flex flex-col z-10 animate-in slide-in-from-bottom duration-250 overflow-hidden border-t-2 border-indigo-500">
            {/* Sheet Handle */}
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto my-2.5" />

            {/* Sheet Header */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-indigo-600" />
                  <span>Bảng Điều Hướng Câu Hỏi</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Đã trả lời: <strong className="text-emerald-600 font-bold">{answeredCount}/{totalQuestions}</strong> câu
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!isTeacherTesting && (
                  <span className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border flex items-center gap-1 ${
                    timeRemaining < 300 
                      ? 'bg-rose-50 text-rose-700 border-rose-300' 
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatTimer(timeRemaining)}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowMobilePalette(false)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-5 py-1.5 bg-slate-50">
              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Question matrix (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-5 gap-2 content-start max-h-[45vh]">
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
                const isFlagged = flaggedQuestions.includes(q.id);

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(qIdx);
                      setShowMobilePalette(false);
                    }}
                    className={`h-11 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center relative ${
                      isCurrent
                        ? 'bg-[#2563EB] text-white font-black ring-2 ring-blue-500 ring-offset-1 shadow-xs'
                        : isAnswered
                        ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-400 font-bold'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {qIdx + 1}
                    {isFlagged && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-white" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-600 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-50 border-2 border-emerald-400 shrink-0" />
                <span>Đã làm ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-50 border border-slate-200 shrink-0" />
                <span>Chưa làm ({totalQuestions - answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#2563EB] shrink-0" />
                <span>Đang xem</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-100 border border-amber-400 shrink-0" />
                <span>Đánh dấu ({flaggedQuestions.length})</span>
              </div>
            </div>

            {/* Submit Action */}
            <div className="p-4 bg-white border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setShowMobilePalette(false);
                  handleAttemptSubmit();
                }}
                className={`w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                  !isAllAnswered && !isTeacherTesting
                    ? 'bg-[#1E3A8A] hover:bg-blue-900'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {!isAllAnswered && !isTeacherTesting ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {!isAllAnswered && !isTeacherTesting
                    ? `Nộp Bài (${answeredCount}/${totalQuestions})`
                    : 'Nộp Bài Thi Ngay'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL PHÓNG TO HÌNH ẢNH (LIGHTBOX) ================= */}
      <ImageLightboxModal
        isOpen={Boolean(lightboxImage)}
        imageUrl={lightboxImage?.url || null}
        title={lightboxImage?.title}
        onClose={handleCloseLightbox}
      />
    </div>
  );
};
