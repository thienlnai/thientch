import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ExamSubmission, Exam, ExamQuestion } from '../types/index.ts';
import { getExamWithQuestions } from '../services/dbService.ts';
import { HotspotCanvas } from './HotspotCanvas.tsx';
import { ImageLightboxModal } from './ImageLightboxModal.tsx';
import { 
  X, 
  Award, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Clock, 
  Calendar,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trash2,
  ZoomIn,
  RotateCcw
} from 'lucide-react';

interface ExamReviewModalProps {
  submission: ExamSubmission;
  onClose: () => void;
  onDelete?: (submission: ExamSubmission) => void;
  exam?: Exam;
  exams?: Exam[];
  allSubmissions?: ExamSubmission[];
  isRequiredPassEnforced?: boolean;
  onRetakeExam?: () => void;
  requiredPassCount?: number;
  passedAttemptsCount?: number;
}

export const ExamReviewModal: React.FC<ExamReviewModalProps> = ({
  submission: initialSubmission,
  onClose,
  onDelete,
  exam,
  exams,
  allSubmissions,
  isRequiredPassEnforced = false,
  onRetakeExam,
  requiredPassCount = 1,
  passedAttemptsCount = 0,
}) => {
  const [submission, setSubmission] = useState<ExamSubmission>(initialSubmission);

  useEffect(() => {
    setSubmission(initialSubmission);
  }, [initialSubmission]);

  // Danh sách tất cả các lần đã làm của đề thi này
  const relatedAttempts = useMemo(() => {
    if (!allSubmissions || allSubmissions.length === 0) return [];
    return allSubmissions
      .filter((s) => s.examId === submission.examId && s.studentId === submission.studentId)
      .sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));
  }, [allSubmissions, submission.examId, submission.studentId]);

  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [loadedExam, setLoadedExam] = useState<Exam | null>(null);

  // Tham chiếu DOM cho thanh chọn câu hỏi di động và vùng nội dung câu hỏi
  const questionStripRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  // Tự động cuộn nội dung lên đầu trang và đưa số câu đang chọn vào trung tâm thanh cuộn
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
    if (questionStripRef.current) {
      const activeEl = questionStripRef.current.children[selectedQuestionIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedQuestionIndex]);

  // Lightbox Zoom state for review images
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  const handleOpenLightbox = (e: React.MouseEvent, url: string, title: string) => {
    e.stopPropagation();
    e.preventDefault();
    setLightboxImage({ url, title });
  };

  const handleCloseLightbox = () => {
    setLightboxImage(null);
  };

  // Nạp chi tiết đề thi (kèm toàn bộ câu hỏi và options) nếu chưa có sẵn trong bộ nhớ
  useEffect(() => {
    if (submission.questionsSnapshot && submission.questionsSnapshot.length > 0) return;
    const currentTarget = exam || (exams ? exams.find((e) => e.id === submission.examId) : undefined);
    if (!currentTarget || !currentTarget.questions || currentTarget.questions.length === 0) {
      if (submission.examId) {
        getExamWithQuestions(submission.examId)
          .then((full) => {
            if (full && full.questions && full.questions.length > 0) {
              setLoadedExam(full);
            }
          })
          .catch((err) => console.error('Lỗi nạp đề thi xem lại:', err));
      }
    }
  }, [submission.examId, submission.questionsSnapshot, exam, exams]);

  // Tái tạo danh sách câu hỏi một cách thông minh:
  // 1. Dùng snapshot có sẵn trong bộ nhớ (nếu vừa thi xong)
  // 2. Hoặc tái tạo từ đề thi gốc qua questionOrder (tiết kiệm 95% dung lượng CSDL)
  const questions = useMemo<ExamQuestion[]>(() => {
    if (submission.questionsSnapshot && submission.questionsSnapshot.length > 0) {
      return submission.questionsSnapshot;
    }

    const targetExam = loadedExam || exam || (exams ? exams.find((e) => e.id === submission.examId) : undefined);
    if (!targetExam || !targetExam.questions || targetExam.questions.length === 0) {
      return [];
    }

    // Tái hiện theo đúng thứ tự câu hỏi lúc thí sinh làm bài
    if (submission.questionOrder && submission.questionOrder.length > 0) {
      const qMap = new Map(targetExam.questions.map((q) => [q.id, q]));
      const ordered = submission.questionOrder
        .map((qid) => qMap.get(qid))
        .filter((q): q is ExamQuestion => Boolean(q));
      if (ordered.length > 0) return ordered;
    }

    // Nếu là bài thi ngẫu nhiên nhưng có kết quả chấm điểm từng câu
    if (submission.questionResults && Object.keys(submission.questionResults).length > 0) {
      const activeIds = new Set(Object.keys(submission.questionResults));
      const filtered = targetExam.questions.filter((q) => activeIds.has(q.id));
      if (filtered.length > 0) return filtered;
    }

    return targetExam.questions;
  }, [submission, exam, exams, loadedExam]);

  const currentQ = questions[selectedQuestionIndex];
  const qResult = currentQ ? submission.questionResults[currentQ.id] : null;

  // Tính số lượng câu làm đúng
  const totalQuestions = questions.length;
  const correctCount = questions.filter(
    (q) => submission.questionResults && submission.questionResults[q.id]?.isCorrect
  ).length;


  // Ngăn chặn phím ESC thoát xem lại nếu đang bắt buộc làm đạt đủ số lần
  useEffect(() => {
    if (!isRequiredPassEnforced) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRequiredPassEnforced]);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-0 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[100dvh] sm:h-[92vh] bg-white rounded-none sm:rounded-3xl shadow-2xl shadow-indigo-950/15 flex flex-col overflow-hidden border-0 sm:border border-slate-200/90">
        
        {/* ================= HEADER TÔNG SÁNG CAO CẤP (TỐI ƯU TOÀN DIỆN CHO CẢ ĐIỆN THOẠI DỌC & MÁY TÍNH) ================= */}
        <header className="px-3 sm:px-6 py-2 sm:py-3.5 bg-gradient-to-r from-white via-indigo-50/20 to-slate-50 border-b border-slate-200 shrink-0 shadow-xs">
          {/* Hàng 1: Tiêu đề bài thi, Huy hiệu kết quả, Điểm số và Nút đóng / Nút làm lại */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className={`w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl flex items-center justify-center font-bold text-sm sm:text-base shadow-sm shrink-0 ${
                submission.isPassed 
                  ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-emerald-500/25 ring-2 ring-emerald-50' 
                  : 'bg-gradient-to-tr from-rose-500 to-red-400 text-white shadow-rose-500/25 ring-2 ring-rose-50'
              }`}>
                <Award className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <h2 className="text-xs sm:text-base font-black text-slate-900 truncate max-w-[170px] sm:max-w-md" title={submission.examTitle}>
                    {submission.examTitle}
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold shrink-0 shadow-2xs inline-flex items-center gap-0.5 sm:gap-1 ${
                    submission.isPassed 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                      : 'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}>
                    {submission.isPassed ? '✓ ĐẠT' : '✕ CHƯA ĐẠT'}
                  </span>
                </div>
              </div>
            </div>

            {/* Khối Điểm số & Nút hành động góc phải */}
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              <div className={`px-2 sm:px-4 py-1 sm:py-2 rounded-xl sm:rounded-2xl border flex items-center sm:flex-col sm:items-end justify-center shadow-xs transition-all gap-1 sm:gap-0 ${
                submission.isPassed 
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-400 shadow-emerald-500/20' 
                  : 'bg-gradient-to-br from-rose-500 to-red-600 text-white border-rose-400 shadow-rose-500/20'
              }`}>
                <div className="flex items-baseline gap-0.5 sm:gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100 hidden md:inline">
                    Điểm:
                  </span>
                  <span className="text-sm sm:text-2xl font-black font-mono tracking-tight text-white">
                    {submission.score}
                  </span>
                  <span className="text-[9px] sm:text-xs font-bold text-white/80 font-mono">
                    /1000đ
                  </span>
                </div>
                <div className="hidden sm:block">
                  <span className="text-[10px] text-white/90 font-medium">
                    {correctCount}/{totalQuestions} câu đúng
                  </span>
                </div>
              </div>

              {/* Nút Xóa bài thi (dành cho Giáo viên / Quản trị viên) */}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="p-1.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-2xl flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 transition-all cursor-pointer border border-red-200 text-xs font-bold shadow-xs shrink-0"
                  title="Xóa bài thi này của học sinh khỏi hệ thống"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Xóa</span>
                </button>
              )}

              {/* Nút đóng / Nút Làm Lại Đề Thi */}
              {isRequiredPassEnforced && onRetakeExam ? (
                <button
                  type="button"
                  onClick={onRetakeExam}
                  className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-[11px] sm:text-xs shadow-md shadow-indigo-600/25 transition-all cursor-pointer shrink-0 animate-pulse"
                  title="Bấm để làm lại đề thi ngay"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Làm Lại</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-all cursor-pointer border border-slate-200 shadow-2xs shrink-0"
                  title="Đóng xem lại"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Hàng 2: Thanh thông tin chi tiết (Cuộn ngang êm ái trên màn hình điện thoại) */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] text-slate-600 mt-2 overflow-x-auto pb-0.5 sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden shrink-0">
            <span className="font-semibold text-slate-700 bg-slate-100/90 px-2 py-0.5 rounded-lg border border-slate-200 shrink-0">
              {submission.studentName || 'Học sinh'} <span className="text-slate-500 font-mono">({submission.studentCode || 'HS'})</span>
            </span>
            <span className="flex items-center gap-1 text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-lg border border-slate-200 shrink-0">
              <Clock className="w-3 h-3 text-indigo-500" />
              <span>{Math.floor(submission.timeSpentSeconds / 60)}p {submission.timeSpentSeconds % 60}s</span>
            </span>
            <span className="flex items-center gap-1 text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-lg border border-slate-200 shrink-0 font-bold text-indigo-700">
              Lần #{submission.attemptNumber}
            </span>
            <span className="flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 shrink-0 font-bold">
              ✓ {correctCount}/{totalQuestions} câu đúng
            </span>
            <span className="flex items-center gap-1 text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-lg border border-slate-200 shrink-0 hidden sm:inline-flex">
              <Calendar className="w-3 h-3 text-indigo-500" />
              <span>{new Date(submission.submittedAt).toLocaleDateString('vi-VN')}</span>
            </span>
          </div>

          {/* BỘ CHỌN LẦN LÀM BÀI NẾU CÓ NHIỀU LẦN THI */}
          {relatedAttempts.length > 1 && (
            <div className="flex items-center gap-1.5 sm:gap-2 mt-2 pt-1.5 border-t border-slate-100 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <span className="text-[10px] sm:text-[11px] font-black text-indigo-700 uppercase tracking-wider shrink-0">
                Các lần làm:
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {relatedAttempts.map((att) => {
                  const isSelected = att.id === submission.id;
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => {
                        setSubmission(att);
                        setSelectedQuestionIndex(0);
                      }}
                      className={`px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl text-[11px] font-bold font-mono transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-400'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <span>Lần #{att.attemptNumber}</span>
                      <span className={`text-[10px] ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
                        • {att.score}đ
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </header>

        {/* BANNER THÔNG BÁO TIẾN ĐỘ LÀM ĐẠT & BẮT BUỘC LÀM LẠI ĐỀ THI (Requirement 3) */}
        {isRequiredPassEnforced && (
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-4 text-xs font-medium shrink-0 shadow-inner">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1 rounded-lg bg-white/20 shrink-0">
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white animate-spin" style={{ animationDuration: '4s' }} />
              </span>
              <span className="truncate sm:whitespace-normal">
                Yêu cầu đạt: <strong>{passedAttemptsCount}/{requiredPassCount} lần</strong>. Em cần làm lại đề thi để hoàn thành.
              </span>
            </div>
            {onRetakeExam && (
              <button
                type="button"
                onClick={onRetakeExam}
                className="px-3 sm:px-4 py-1.5 rounded-xl bg-white text-amber-900 font-bold text-xs hover:bg-amber-50 shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer hover:scale-102"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Làm Lại Ngay</span>
              </button>
            )}
          </div>
        )}

        {/* Modal xác nhận xóa bài thi từ màn hình Review */}
        {isConfirmingDelete && (
          <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-red-100 p-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="text-center space-y-1.5">
                <h3 className="font-bold text-base text-slate-900">
                  Xác Nhận Xóa Bài Thi Này?
                </h3>
                <p className="text-xs text-slate-500">
                  Bạn có chắc chắn muốn xóa bài thi của thí sinh{' '}
                  <strong className="text-slate-800">{submission.studentName}</strong> (SBD: {submission.studentCode})?
                </p>
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 text-left space-y-1">
                  <div>• Đề thi: <strong>{submission.examTitle}</strong></div>
                  <div>• Điểm số: <strong>{submission.score}/1000đ ({submission.isPassed ? 'Đạt' : 'Chưa đạt'})</strong></div>
                  <div>• Thời gian nộp: <strong>{new Date(submission.submittedAt).toLocaleString('vi-VN')}</strong></div>
                </div>
                <p className="text-[11px] text-slate-400">
                  ⚠️ Lưu ý: Sau khi xóa, kết quả bài thi này sẽ bị hủy vĩnh viễn và học sinh có thể thực hiện lại bài thi nếu được phép.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingDelete(false);
                    onDelete?.(submission);
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xác Nhận Xóa Bài Thi</span>
                </button>
              </div>
            </div>
          </div>
        )}


        {/* ================= 2. THÔNG BÁO AN NINH PHÒNG THI ================= */}
        {submission.violationCount > 0 ? (
          <div className="px-3 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-2 shrink-0 border-b border-red-700 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/20 text-white flex items-center justify-center shrink-0">
                <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <span className="text-[11px] sm:text-xs">
                ⚠️ <strong>CẢNH BÁO QUY CHẾ:</strong> Vi phạm quy chế thi{' '}
                <span className="underline decoration-2 font-mono font-black bg-black/25 px-1.5 py-0.5 rounded shadow-xs">
                  {submission.violationCount} lần
                </span>{' '}
                (nhấn chuột phải, F12, rời màn hình...).
              </span>
            </div>

            {submission.violationLogs && submission.violationLogs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 self-stretch sm:self-auto max-h-12 overflow-y-auto">
                <span className="text-[10px] sm:text-[11px] text-white/90 font-bold shrink-0">Chi tiết:</span>
                {submission.violationLogs.map((log, idx) => (
                  <span
                    key={log.id || idx}
                    className="px-1.5 py-0.5 rounded bg-black/25 text-white font-mono text-[9px] sm:text-[10px] border border-white/25 shrink-0"
                    title={`${log.time}: ${log.label}`}
                  >
                    ⏱️ {log.time}: {log.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 sm:px-6 py-1.5 sm:py-2 bg-emerald-50/70 border-b border-emerald-200/80 text-emerald-900 text-[11px] sm:text-xs font-medium flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-300">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <span className="truncate">
                <strong className="text-emerald-950 font-bold">An ninh:</strong> 0 vi phạm • Tuân thủ an toàn quy chế phòng thi.
              </span>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 shadow-2xs">
              ✓ Phòng thi an toàn
            </span>
          </div>
        )}

        {/* ================= THANH ĐIỀU HƯỚNG CÂU HỎI TRÊN ĐIỆN THOẠI DỌC (PINNED CỐ ĐỊNH, DỄ BẤM VỚI NGÓN TAY) ================= */}
        <div className="sm:hidden bg-slate-100 border-b border-slate-200 px-3 py-2 shrink-0 space-y-1.5 shadow-2xs">
          {/* Hàng 1: Trạng thái câu hiện tại, Điểm số, Loại câu hỏi */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="px-2 py-0.5 rounded-lg bg-indigo-600 text-white font-mono font-black text-xs shadow-xs">
                Câu {selectedQuestionIndex + 1}/{totalQuestions}
              </span>
              <span className="text-[11px] font-semibold text-slate-600 truncate max-w-[130px]">
                {currentQ?.type === 'single_choice' && 'Trắc nghiệm 1'}
                {currentQ?.type === 'multiple_choice' && 'Nhiều đáp án'}
                {currentQ?.type === 'matching' && 'Ghép đôi'}
                {currentQ?.type === 'ordering' && 'Sắp xếp'}
                {currentQ?.type === 'true_false' && 'Đúng / Sai'}
                {currentQ?.type === 'hotspot' && 'Hotspot'}
                {currentQ?.type === 'fill_blank' && 'Điền khuyết'}
              </span>
            </div>

            {/* Trạng thái làm đúng / sai của câu hiện tại */}
            <div className="flex items-center gap-1 shrink-0">
              {qResult ? (
                qResult.isCorrect ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1 border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>+{qResult.earnedScore}đ</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px] inline-flex items-center gap-1 border border-rose-300">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>0/{qResult.maxScore}đ</span>
                  </span>
                )
              ) : null}
            </div>
          </div>

          {/* Hàng 2: Thanh cuộn ngang các nút số câu hỏi (Tự động cuộn theo câu đang chọn) */}
          <div
            ref={questionStripRef}
            className="flex items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {questions.map((q, idx) => {
              const res = submission.questionResults[q.id];
              const isSelected = selectedQuestionIndex === idx;
              const isCorrect = res?.isCorrect;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSelectedQuestionIndex(idx)}
                  className={`min-w-8 h-8 px-2 rounded-lg font-mono text-xs font-bold shrink-0 flex items-center justify-center gap-0.5 border transition-all cursor-pointer active:scale-90 ${
                    isSelected
                      ? 'ring-2 ring-indigo-500 scale-105 font-black bg-white shadow-md z-10'
                      : 'opacity-90'
                  } ${
                    isCorrect
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                  }`}
                >
                  <span>{idx + 1}</span>
                  <span className="text-[10px] font-black">{isCorrect ? '✓' : '✕'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ================= 4. GIỮ NGUYÊN BỐ CỤC DANH SÁCH CÂU HỎI VÀ CHI TIẾT CÂU HỎI ================= */}
        <div className="flex-1 flex overflow-hidden">
          {/* CỘT TRÁI: ĐIỀU HƯỚNG CÂU HỎI (Bộ đếm Đúng: 1 | Sai: 0 và Card [ 1 ✓ ]) */}
          <aside className="w-64 bg-slate-50/80 border-r border-slate-200 p-4 overflow-y-auto hidden sm:flex sm:flex-col justify-between shrink-0">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Danh Sách Câu Hỏi ({questions.length})
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {selectedQuestionIndex + 1}/{questions.length}
                </span>
              </div>

              {/* Bộ đếm tổng quan Đúng: 1 | Sai: 0 */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-[11px] font-bold">
                <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between shadow-xs">
                  <span>Đúng:</span>
                  <span className="font-mono text-sm">{correctCount}</span>
                </div>
                <div className="px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between shadow-xs">
                  <span>Sai:</span>
                  <span className="font-mono text-sm">{totalQuestions - correctCount}</span>
                </div>
              </div>

              {/* Nút số câu hỏi [ 1 ✓ ] thiết kế dạng Card nhỏ bo góc */}
              <div className="grid grid-cols-4 gap-2">
                {questions.map((q, idx) => {
                  const res = submission.questionResults[q.id];
                  const isSelected = selectedQuestionIndex === idx;
                  const isCorrect = res?.isCorrect;

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setSelectedQuestionIndex(idx)}
                      className={`h-10 rounded-xl font-mono text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 border ${
                        isSelected
                          ? 'ring-3 ring-indigo-500 ring-offset-2 scale-105 shadow-md shadow-indigo-500/25 bg-white z-10 font-black'
                          : 'shadow-xs hover:shadow-md hover:scale-102'
                      } ${
                        isCorrect
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                      }`}
                      title={`Câu ${idx + 1}: ${isCorrect ? 'Làm đúng' : 'Chưa đúng'}`}
                    >
                      <span>{idx + 1}</span>
                      {isCorrect ? (
                        <span className="text-[11px] text-emerald-600 font-black">✓</span>
                      ) : (
                        <span className="text-[11px] text-rose-600 font-black">✕</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Điều hướng nhanh Trước / Tiếp theo */}
            <div className="pt-4 border-t border-slate-200 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedQuestionIndex((prev) => Math.max(0, prev - 1))}
                disabled={selectedQuestionIndex === 0}
                className="flex-1 py-2 px-2 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none text-slate-700 border border-slate-200 font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Trước</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedQuestionIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                disabled={selectedQuestionIndex === totalQuestions - 1}
                className="flex-1 py-2 px-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:pointer-events-none text-indigo-700 border border-indigo-200 font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs"
              >
                <span>Sau</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </aside>

          {/* CỘT PHẢI: CHI TIẾT CÂU HỎI VÀ ĐÁP ÁN (Card sáng sang trọng, viền nét, gradient đẹp) */}
          <main ref={mainContentRef} className="flex-1 overflow-y-auto p-2.5 sm:p-6 lg:p-8 space-y-3.5 sm:space-y-6 bg-slate-50/40">
            {currentQ ? (
              <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5 bg-white p-4 sm:p-7 rounded-3xl border border-slate-200 shadow-sm shadow-slate-200/50">
                {/* Header câu hỏi */}
                <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="px-3.5 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-xs shadow-xs">
                      Câu hỏi {selectedQuestionIndex + 1} / {questions.length}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                      {currentQ.type === 'single_choice' && 'Trắc nghiệm 1 đáp án'}
                      {currentQ.type === 'multiple_choice' && 'Trắc nghiệm nhiều đáp án'}
                      {currentQ.type === 'matching' && 'Ghép đôi'}
                      {currentQ.type === 'ordering' && 'Sắp xếp thứ tự'}
                      {currentQ.type === 'true_false' && 'Đúng / Sai'}
                      {currentQ.type === 'hotspot' && 'Chọn trên hình ảnh (Hotspot)'}
                      {currentQ.type === 'fill_blank' && 'Điền vào chỗ trống'}
                    </span>
                  </div>

                  {qResult && (
                    <div className="flex items-center gap-2">
                      {qResult.isCorrect ? (
                        <span className="px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold text-xs flex items-center gap-1.5 border border-emerald-300 shadow-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Chính xác (+{qResult.earnedScore}đ)</span>
                        </span>
                      ) : (
                        <span className="px-3.5 py-1 rounded-full bg-rose-50 text-rose-800 font-bold text-xs flex items-center gap-1.5 border border-rose-300 shadow-xs">
                          <XCircle className="w-4 h-4 text-rose-600" />
                          <span>Chưa chính xác (0/{qResult.maxScore}đ)</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Tiêu đề câu hỏi: Font chữ rõ ràng, đậm nét, chuẩn kích thước */}
                <div className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed font-sans">
                  {currentQ.title}
                </div>

                {/* Media ảnh hoặc video */}
                {currentQ.mediaUrl && currentQ.mediaType !== 'video' && (
                  <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 shadow-xs">
                    <div
                      onClick={(e) => handleOpenLightbox(e, currentQ.mediaUrl!, `Hình ảnh câu hỏi ${selectedQuestionIndex + 1}`)}
                      className="group/qimg relative inline-block cursor-zoom-in max-w-full"
                      title="Nhấp để phóng to hình ảnh câu hỏi"
                    >
                      <img
                        src={currentQ.mediaUrl}
                        alt="Ảnh câu hỏi"
                        className="max-h-64 mx-auto object-contain rounded-xl transition-all duration-200 group-hover/qimg:brightness-105 group-hover/qimg:ring-2 group-hover/qimg:ring-indigo-400"
                      />
                      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/85 text-white text-[11px] font-bold flex items-center gap-1 shadow-md opacity-0 group-hover/qimg:opacity-100 transition-opacity pointer-events-none backdrop-blur-xs">
                        <ZoomIn className="w-3 h-3" />
                        <span>Phóng to</span>
                      </div>
                    </div>
                  </div>
                )}

                {currentQ.mediaType === 'video' && currentQ.mediaUrl && (
                  <div className="p-2.5 rounded-2xl bg-slate-900 border border-slate-700 shadow-xs">
                    {currentQ.mediaUrl.includes('youtube.com') || currentQ.mediaUrl.includes('youtu.be') ? (
                      <iframe
                        src={currentQ.mediaUrl.replace('watch?v=', 'embed/')}
                        title="Video giải thích"
                        className="w-full aspect-video rounded-xl"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video
                        src={currentQ.mediaUrl}
                        controls
                        className="w-full rounded-xl max-h-72 bg-black"
                      />
                    )}
                  </div>
                )}

                {/* Chi tiết từng dạng câu hỏi */}
                {/* 1. SINGLE CHOICE */}
                {currentQ.type === 'single_choice' && currentQ.options && (
                  <div className="space-y-2.5">
                    {currentQ.options.map((opt, oIdx) => {
                      const charLabel = String.fromCharCode(65 + oIdx);
                      const isStudentChosen = submission.studentAnswers[currentQ.id] === opt.id;
                      const isCorrect = currentQ.correctOptionId === opt.id;

                      let rowClass = 'bg-white border-slate-200 text-slate-700 hover:border-slate-300';
                      if (isCorrect) {
                        rowClass = 'bg-gradient-to-r from-emerald-50 to-teal-50/60 border-2 border-emerald-400 text-emerald-950 font-bold shadow-xs';
                      } else if (isStudentChosen && !isCorrect) {
                        rowClass = 'bg-gradient-to-r from-rose-50 to-red-50/60 border-2 border-rose-400 text-rose-950 font-semibold shadow-xs';
                      }

                      return (
                        <div
                          key={opt.id}
                          className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-transform hover:translate-x-0.5 ${rowClass}`}
                        >
                          <div className="flex items-start gap-3.5 flex-1 min-w-0">
                            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border mt-0.5 sm:mt-0 ${
                              isCorrect 
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                                : isStudentChosen 
                                ? 'bg-rose-600 text-white border-rose-600 shadow-xs' 
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {charLabel}
                            </span>
                            <div className="flex-1 min-w-0 space-y-2">
                              {opt.text && (
                                <div className="text-sm sm:text-base font-medium leading-relaxed break-words">
                                  {opt.text}
                                </div>
                              )}
                              {opt.imageUrl && (
                                <div
                                  onClick={(e) =>
                                    handleOpenLightbox(
                                      e,
                                      opt.imageUrl!,
                                      `Đáp án ${charLabel}${opt.text ? ': ' + opt.text : ''}`
                                    )
                                  }
                                  className="group/optimg relative inline-block cursor-zoom-in max-w-full"
                                  title="Nhấp để phóng to hình ảnh đáp án"
                                >
                                  <img
                                    src={opt.imageUrl}
                                    alt={`Đáp án ${charLabel}`}
                                    className="max-h-40 sm:max-h-48 object-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs transition-all duration-200 group-hover/optimg:ring-2 group-hover/optimg:ring-indigo-400 group-hover/optimg:shadow-md"
                                  />
                                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/85 text-white text-[11px] font-semibold flex items-center gap-1 shadow-md opacity-0 group-hover/optimg:opacity-100 transition-opacity pointer-events-none backdrop-blur-xs">
                                    <ZoomIn className="w-3 h-3" />
                                    <span>Phóng to</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-bold shrink-0 self-start sm:self-center">
                            {isCorrect && isStudentChosen && (
                              <span className="text-emerald-800 flex items-center gap-1.5 bg-emerald-100/90 px-2.5 py-1.5 rounded-xl border border-emerald-300 shadow-2xs">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>Bạn đã chọn đúng ✓</span>
                              </span>
                            )}
                            {isCorrect && !isStudentChosen && (
                              <span className="text-emerald-700 flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-300 shadow-2xs">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>Đáp án đúng</span>
                              </span>
                            )}
                            {isStudentChosen && !isCorrect && (
                              <span className="text-rose-700 flex items-center gap-1.5 bg-rose-100/90 px-2.5 py-1.5 rounded-xl border border-rose-300 shadow-2xs">
                                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                <span>Bạn đã chọn sai ✕</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. MULTIPLE CHOICE (TRẮC NGHIỆM NHIỀU ĐÁP ÁN) */}
                {currentQ.type === 'multiple_choice' && currentQ.options && (() => {
                  const chosenIds: string[] = Array.isArray(submission.studentAnswers[currentQ.id])
                    ? submission.studentAnswers[currentQ.id]
                    : [];
                  const correctIds: string[] = currentQ.correctOptionIds || [];

                  const allOptsMapped = (currentQ.options || []).map((opt, idx) => ({
                    ...opt,
                    charLabel: String.fromCharCode(65 + idx),
                  }));

                  const correctOpts = allOptsMapped.filter((o) => correctIds.includes(o.id));
                  const chosenOpts = allOptsMapped.filter((o) => chosenIds.includes(o.id));
                  const missingCorrectOpts = allOptsMapped.filter((o) => correctIds.includes(o.id) && !chosenIds.includes(o.id));
                  const wrongChosenOpts = allOptsMapped.filter((o) => chosenIds.includes(o.id) && !correctIds.includes(o.id));

                  const isAllCorrect = correctIds.length > 0 &&
                    chosenIds.length === correctIds.length &&
                    chosenIds.every((id) => correctIds.includes(id));

                  const isUnderSelected = !isAllCorrect &&
                    wrongChosenOpts.length === 0 &&
                    chosenOpts.length > 0 &&
                    chosenOpts.length < correctOpts.length;

                  const hasWrongSelections = wrongChosenOpts.length > 0;
                  const hasNoSelections = chosenIds.length === 0;

                  return (
                    <div className="space-y-3.5">
                      {/* BANNER GIẢI THÍCH CHI TIẾT LÝ DO ĐÚNG / SAI CỦA HỌC SINH */}
                      {isAllCorrect ? (
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 border-2 border-emerald-300 text-emerald-950 flex items-start gap-3 shadow-xs">
                          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div className="text-xs sm:text-sm space-y-1">
                            <div className="font-black text-emerald-950 text-sm">
                              Chính xác tuyệt đối! (+{qResult?.earnedScore || 0}đ)
                            </div>
                            <p className="text-emerald-800 text-xs font-medium leading-relaxed">
                              Bạn đã chọn đủ và đúng toàn bộ <strong>{correctOpts.length} đáp án</strong>: <strong className="font-black">[{correctOpts.map((o) => o.charLabel).join(', ')}]</strong>.
                            </p>
                          </div>
                        </div>
                      ) : isUnderSelected ? (
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50/60 to-amber-50 border-2 border-amber-400 text-amber-950 flex items-start gap-3.5 shadow-sm">
                          <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                            <AlertTriangle className="w-5 h-5" />
                          </div>
                          <div className="text-xs sm:text-sm space-y-2 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-black text-amber-950 text-sm tracking-tight">
                                LÝ DO CHƯA ĐẠT ĐIỂM: BẠN ĐÃ CHỌN THIẾU ĐÁP ÁN!
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-200/90 text-amber-900 font-black text-[11px] font-mono border border-amber-300">
                                Thiếu {missingCorrectOpts.length} đáp án đúng
                              </span>
                            </div>

                            <div className="text-xs text-amber-950 space-y-1.5 leading-relaxed bg-white/85 p-3 rounded-xl border border-amber-200">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>• Đề bài yêu cầu chọn đủ</span>
                                <strong className="text-emerald-800 font-bold">{correctOpts.length} đáp án đúng</strong>:
                                <span className="inline-flex gap-1 font-mono font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-300">
                                  [{correctOpts.map((o) => o.charLabel).join(', ')}]
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>• Bạn mới chỉ chọn</span>
                                <strong className="text-blue-800 font-bold">{chosenOpts.length}/{correctOpts.length} đáp án</strong>:
                                <span className="inline-flex gap-1 font-mono font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-300">
                                  [{chosenOpts.map((o) => o.charLabel).join(', ')}]
                                </span>
                                <span className="text-emerald-700 font-semibold">(Các đáp án này bạn chọn đúng)</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap text-rose-900">
                                <span>• ⚠️ Bạn bị</span>
                                <strong className="font-black underline">bỏ sót {missingCorrectOpts.length} đáp án đúng</strong>:
                                <span className="inline-flex gap-1 font-mono font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-300">
                                  [{missingCorrectOpts.map((o) => o.charLabel).join(', ')}]
                                </span>
                                <span className="text-xs italic font-medium">(Xem ô có viền nét đứt màu cam bên dưới)</span>
                              </div>
                            </div>

                            <div className="text-[11px] text-amber-900 font-medium italic">
                              * Quy định trắc nghiệm nhiều đáp án: Thí sinh cần chọn đủ và chính xác tất cả các đáp án đúng của câu hỏi thì mới được tính điểm.
                            </div>
                          </div>
                        </div>
                      ) : hasWrongSelections ? (
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50 via-red-50/50 to-rose-50 border-2 border-rose-300 text-rose-950 flex items-start gap-3.5 shadow-sm">
                          <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                            <XCircle className="w-5 h-5" />
                          </div>
                          <div className="text-xs sm:text-sm space-y-2 flex-1">
                            <div className="font-black text-rose-950 text-sm tracking-tight">
                              LÝ DO CHƯA ĐẠT ĐIỂM: BẠN ĐÃ CHỌN PHẢI ĐÁP ÁN SAI!
                            </div>
                            <div className="text-xs text-rose-950 space-y-1.5 leading-relaxed bg-white/85 p-3 rounded-xl border border-rose-200">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>• Bạn đã chọn nhầm đáp án sai:</span>
                                <span className="inline-flex gap-1 font-mono font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-300">
                                  [{wrongChosenOpts.map((o) => o.charLabel).join(', ')}]
                                </span>
                              </div>
                              {missingCorrectOpts.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap text-amber-900">
                                  <span>• Đồng thời bạn bỏ sót đáp án đúng:</span>
                                  <span className="inline-flex gap-1 font-mono font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300">
                                    [{missingCorrectOpts.map((o) => o.charLabel).join(', ')}]
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>• Bộ đáp án đúng đầy đủ là:</span>
                                <span className="inline-flex gap-1 font-mono font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-300">
                                  [{correctOpts.map((o) => o.charLabel).join(', ')}]
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : hasNoSelections ? (
                        <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-300 text-slate-800 flex items-start gap-3 shadow-2xs">
                          <HelpCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                          <div className="text-xs sm:text-sm">
                            <div className="font-bold text-slate-900">Bạn chưa chọn đáp án nào cho câu hỏi này.</div>
                            <div className="text-xs text-slate-600 mt-1">
                              Đáp án đúng gồm {correctOpts.length} đáp án: <strong className="text-emerald-700 font-bold">[{correctOpts.map((o) => o.charLabel).join(', ')}]</strong>.
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {/* DANH SÁCH LỰA CHỌN CỦA CÂU HỎI */}
                      <div className="space-y-2.5">
                        {allOptsMapped.map((opt) => {
                          const charLabel = opt.charLabel;
                          const isStudentChosen = chosenIds.includes(opt.id);
                          const isCorrect = correctIds.includes(opt.id);

                          let rowClass = 'bg-white border-slate-200 text-slate-700 hover:border-slate-300';
                          if (isCorrect && isStudentChosen) {
                            rowClass = 'bg-gradient-to-r from-emerald-50 to-teal-50/70 border-2 border-emerald-500 text-emerald-950 font-bold shadow-xs';
                          } else if (isCorrect && !isStudentChosen) {
                            rowClass = 'bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-amber-50/80 border-2 border-dashed border-amber-500 text-amber-950 font-bold shadow-xs';
                          } else if (isStudentChosen && !isCorrect) {
                            rowClass = 'bg-gradient-to-r from-rose-50 to-red-50/70 border-2 border-rose-400 text-rose-950 font-semibold shadow-xs';
                          } else {
                            rowClass = 'bg-white border border-slate-200 text-slate-500 opacity-80 hover:opacity-100';
                          }

                          return (
                            <div
                              key={opt.id}
                              className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-transform hover:translate-x-0.5 ${rowClass}`}
                            >
                              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border mt-0.5 sm:mt-0 ${
                                  isCorrect && isStudentChosen
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                    : isCorrect && !isStudentChosen
                                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                    : isStudentChosen
                                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}>
                                  {charLabel}
                                </span>
                                <div className="flex-1 min-w-0 space-y-2">
                                  {opt.text && (
                                    <div className="text-sm sm:text-base font-medium leading-relaxed break-words">
                                      {opt.text}
                                    </div>
                                  )}
                                  {opt.imageUrl && (
                                    <div
                                      onClick={(e) =>
                                        handleOpenLightbox(
                                          e,
                                          opt.imageUrl!,
                                          `Đáp án ${charLabel}${opt.text ? ': ' + opt.text : ''}`
                                        )
                                      }
                                      className="group/optimg relative inline-block cursor-zoom-in max-w-full"
                                      title="Nhấp để phóng to hình ảnh đáp án"
                                    >
                                      <img
                                        src={opt.imageUrl}
                                        alt={`Đáp án ${charLabel}`}
                                        className="max-h-40 sm:max-h-48 object-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs transition-all duration-200 group-hover/optimg:ring-2 group-hover/optimg:ring-indigo-400 group-hover/optimg:shadow-md"
                                      />
                                      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/85 text-white text-[11px] font-semibold flex items-center gap-1 shadow-md opacity-0 group-hover/optimg:opacity-100 transition-opacity pointer-events-none backdrop-blur-xs">
                                        <ZoomIn className="w-3 h-3" />
                                        <span>Phóng to</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-xs font-bold shrink-0 self-start sm:self-center">
                                {isCorrect && isStudentChosen && (
                                  <span className="text-emerald-800 flex items-center gap-1.5 bg-emerald-100/90 px-3 py-1.5 rounded-xl border border-emerald-300 shadow-2xs">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span>Bạn đã chọn đúng ✓</span>
                                  </span>
                                )}
                                {isCorrect && !isStudentChosen && (
                                  <span className="text-amber-900 flex items-center gap-1.5 bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-400 shadow-2xs font-extrabold">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>Đáp án đúng (Bạn bỏ sót)</span>
                                  </span>
                                )}
                                {isStudentChosen && !isCorrect && (
                                  <span className="text-rose-800 flex items-center gap-1.5 bg-rose-100/90 px-3 py-1.5 rounded-xl border border-rose-300 shadow-2xs">
                                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                    <span>Bạn đã chọn sai ✕</span>
                                  </span>
                                )}
                                {!isCorrect && !isStudentChosen && (
                                  <span className="text-slate-400 text-[11px] font-medium px-2 py-1 bg-slate-50 rounded-lg border border-slate-100">
                                    Không chọn
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 3. MATCHING */}
                {currentQ.type === 'matching' && currentQ.matchingPairs && (
                  <div className="space-y-3">
                    {currentQ.matchingPairs.map((p, idx) => {
                      const studentMatches = submission.studentAnswers[currentQ.id] || {};
                      const studentChosenRightId = studentMatches[p.id];
                      const studentChosenPair = currentQ.matchingPairs?.find((item) => item.id === studentChosenRightId);
                      const isMatchCorrect = studentChosenRightId === p.id;

                      return (
                        <div
                          key={p.id}
                          className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs transition-all ${
                            isMatchCorrect ? 'bg-emerald-50/90 border-emerald-300' : 'bg-rose-50/90 border-rose-300'
                          }`}
                        >
                          <div className="font-bold text-slate-800 flex items-center gap-2.5 flex-wrap">
                            <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-sm">{p.leftText}</span>
                            {p.leftImageUrl && (
                              <div
                                onClick={(e) =>
                                  handleOpenLightbox(e, p.leftImageUrl!, `Ảnh thẻ A${idx + 1}: ${p.leftText}`)
                                }
                                className="cursor-zoom-in group/mimg relative inline-block shrink-0"
                                title="Nhấp để phóng to"
                              >
                                <img
                                  src={p.leftImageUrl}
                                  alt="Ảnh ghép đôi"
                                  className="h-10 w-14 object-cover rounded-lg border border-slate-300 transition-all group-hover/mimg:ring-2 group-hover/mimg:ring-indigo-400"
                                />
                              </div>
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-medium flex-wrap">
                              <span className="text-slate-500">Bạn ghép với:</span>
                              <strong className={`font-bold ${isMatchCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {studentChosenPair ? studentChosenPair.rightText : 'Chưa ghép'}
                              </strong>
                              {studentChosenPair?.rightImageUrl && (
                                <div
                                  onClick={(e) =>
                                    handleOpenLightbox(e, studentChosenPair.rightImageUrl!, `Ảnh bạn chọn: ${studentChosenPair.rightText}`)
                                  }
                                  className="cursor-zoom-in group/mimg relative inline-block shrink-0"
                                  title="Nhấp để phóng to"
                                >
                                  <img
                                    src={studentChosenPair.rightImageUrl}
                                    alt="Ảnh bạn chọn"
                                    className="h-9 w-12 object-cover rounded-lg border border-slate-300"
                                  />
                                </div>
                              )}
                              <span>{isMatchCorrect ? '✓' : '✕'}</span>
                            </div>
                            {!isMatchCorrect && (
                              <div className="text-emerald-700 font-bold bg-emerald-100/60 px-2 py-0.5 rounded-md flex items-center gap-1.5 flex-wrap">
                                <span>Đáp án chính xác: <strong>{p.rightText}</strong></span>
                                {p.rightImageUrl && (
                                  <div
                                    onClick={(e) =>
                                      handleOpenLightbox(e, p.rightImageUrl!, `Đáp án chính xác: ${p.rightText}`)
                                    }
                                    className="cursor-zoom-in group/mimg relative inline-block shrink-0"
                                    title="Nhấp để phóng to"
                                  >
                                    <img
                                      src={p.rightImageUrl}
                                      alt="Ảnh đáp án chính xác"
                                      className="h-7 w-10 object-cover rounded-md border border-emerald-300"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 4. ORDERING */}
                {currentQ.type === 'ordering' && currentQ.orderingItems && (
                  <div className="space-y-3 text-xs">
                    {(() => {
                      const studentOrder: string[] = submission.studentAnswers[currentQ.id] || [];
                      const itemMap = new Map((currentQ.orderingItems || []).map((i) => [i.id, i]));
                      const isCompletelyCorrect = qResult?.isCorrect;

                      return (
                        <div className="space-y-3">
                          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 shadow-xs">
                            <div className="font-bold text-slate-800 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <span>Thứ tự bạn đã chọn:</span>
                              </span>
                              <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                                isCompletelyCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {isCompletelyCorrect ? '✓ Hoàn toàn chính xác' : '✕ Thứ tự chưa đúng'}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {studentOrder.length > 0 ? (
                                studentOrder.map((itemId, idx) => {
                                  const item = itemMap.get(itemId);
                                  if (!item) return null;
                                  return (
                                    <div key={itemId} className="flex items-center gap-2.5 text-slate-800 font-semibold bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                                      <span className="w-6 h-6 rounded-lg bg-slate-700 text-white font-mono text-xs flex items-center justify-center font-bold shrink-0">
                                        {idx + 1}
                                      </span>
                                      <span className="flex-1">{item.text}</span>
                                      {item.imageUrl && (
                                        <div
                                          onClick={(e) => handleOpenLightbox(e, item.imageUrl!, `Thứ tự ${idx + 1}: ${item.text}`)}
                                          className="cursor-zoom-in group/oimg relative inline-block shrink-0"
                                          title="Nhấp để phóng to"
                                        >
                                          <img
                                            src={item.imageUrl}
                                            alt={item.text}
                                            className="h-10 w-14 object-contain rounded-lg border border-slate-200 bg-white"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-slate-400 italic py-1">Chưa sắp xếp</div>
                              )}
                            </div>
                          </div>

                          <div className="p-4 bg-gradient-to-br from-indigo-50/80 via-white to-indigo-50/40 border border-indigo-200 rounded-2xl space-y-2 shadow-xs">
                            <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-indigo-600" />
                              <span>Thứ tự đúng chuẩn của giáo viên:</span>
                            </div>
                            <div className="space-y-1.5">
                              {currentQ.orderingItems.map((item, idx) => (
                                <div key={item.id} className="flex items-center gap-2.5 text-slate-800 font-semibold bg-white p-2.5 rounded-xl border border-indigo-100 shadow-xs">
                                  <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-mono text-xs flex items-center justify-center font-bold shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="flex-1">{item.text}</span>
                                  {item.imageUrl && (
                                    <div
                                      onClick={(e) => handleOpenLightbox(e, item.imageUrl!, `Thứ tự chuẩn ${idx + 1}: ${item.text}`)}
                                      className="cursor-zoom-in group/oimg relative inline-block shrink-0"
                                      title="Nhấp để phóng to"
                                    >
                                      <img
                                        src={item.imageUrl}
                                        alt={item.text}
                                        className="h-10 w-14 object-contain rounded-lg border border-slate-200 bg-white"
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 5. TRUE / FALSE */}
                {currentQ.type === 'true_false' && currentQ.tfStatements && (
                  <div>
                    {/* Bố cục dạng thẻ dễ nhìn trên điện thoại dọc (sm:hidden) */}
                    <div className="sm:hidden space-y-2.5">
                      {currentQ.tfStatements.map((st, sIdx) => {
                        const studentVal = (submission.studentAnswers[currentQ.id] || {})[st.id];
                        const isCorrect = studentVal === st.isTrue;
                        return (
                          <div
                            key={st.id}
                            className={`p-3 rounded-xl border-2 space-y-2 shadow-2xs ${
                              isCorrect ? 'bg-emerald-50/60 border-emerald-300' : 'bg-rose-50/60 border-rose-300'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                {sIdx + 1}
                              </span>
                              <p className="text-xs font-semibold text-slate-800 leading-snug">
                                {st.statement}
                              </p>
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-slate-500">Bạn chọn:</span>
                                <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                                  isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {studentVal === true
                                    ? currentQ.trueLabel || 'Đúng'
                                    : studentVal === false
                                    ? currentQ.falseLabel || 'Sai'
                                    : 'Chưa chọn'} {isCorrect ? '✓' : '✕'}
                                </span>
                              </div>
                              {!isCorrect && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] text-slate-500">Đáp án:</span>
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300">
                                    {st.isTrue ? currentQ.trueLabel || 'Đúng' : currentQ.falseLabel || 'Sai'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bảng trên màn hình máy tính (hidden sm:block) */}
                    <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-200 shadow-xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3">Mệnh đề / Nội dung</th>
                            <th className="p-3 text-center w-32">Bạn chọn</th>
                            <th className="p-3 text-center w-32">Đáp án đúng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {currentQ.tfStatements.map((st) => {
                            const studentVal = (submission.studentAnswers[currentQ.id] || {})[st.id];
                            const isCorrect = studentVal === st.isTrue;
                            return (
                              <tr key={st.id} className={isCorrect ? 'bg-emerald-50/40 hover:bg-emerald-50/70' : 'bg-rose-50/40 hover:bg-rose-50/70'}>
                                <td className="p-3 font-semibold text-slate-800">{st.statement}</td>
                                <td className="p-3 text-center font-bold">
                                  <span className={`px-2.5 py-1 rounded-lg inline-block text-xs ${
                                    isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                  }`}>
                                    {studentVal === true
                                      ? currentQ.trueLabel || 'Đúng'
                                      : studentVal === false
                                      ? currentQ.falseLabel || 'Sai'
                                      : 'Chưa chọn'}
                                  </span>
                                </td>
                                <td className="p-3 text-center font-black text-emerald-700">
                                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 inline-block text-xs border border-emerald-300">
                                    {st.isTrue ? currentQ.trueLabel || 'Đúng' : currentQ.falseLabel || 'Sai'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 6. HOTSPOT */}
                {currentQ.type === 'hotspot' && currentQ.hotspotImageUrl && (
                  <div className="space-y-3">
                    <HotspotCanvas
                      imageUrl={currentQ.hotspotImageUrl}
                      regions={currentQ.hotspotRegions || []}
                      isReview={true}
                      reviewClickResults={
                        qResult?.details?.clickResults ||
                        (submission.studentAnswers[currentQ.id] || []).map((click: any) => ({
                          click,
                          isHit: (currentQ.hotspotRegions || []).some(
                            (r) =>
                              click.x >= r.x &&
                              click.x <= r.x + r.width &&
                              click.y >= r.y &&
                              click.y <= r.y + r.height
                          ),
                        }))
                      }
                    />
                  </div>
                )}

                {/* 7. FILL IN THE BLANKS */}
                {currentQ.type === 'fill_blank' && currentQ.fillBlankItems && (
                  <div className="space-y-2.5 text-xs">
                    {currentQ.fillBlankItems.map((b) => {
                      const studentVal = (submission.studentAnswers[currentQ.id] || {})[b.id] || 'Chưa chọn';
                      const isCorrect = studentVal.trim().toLowerCase() === b.correctAnswer.trim().toLowerCase();
                      return (
                        <div
                          key={b.id}
                          className={`p-3.5 rounded-2xl border-2 flex items-center justify-between shadow-xs ${
                            isCorrect ? 'bg-emerald-50/90 border-emerald-300' : 'bg-rose-50/90 border-rose-300'
                          }`}
                        >
                          <div className="font-semibold text-slate-800">
                            Vị trí <span className="font-mono px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">{b.placeholderCode}</span>:{' '}
                            Bạn chọn <strong className={isCorrect ? 'text-emerald-700' : 'text-rose-700'}>{studentVal}</strong> {isCorrect ? '✓' : '✕'}
                          </div>
                          {!isCorrect && (
                            <div className="text-emerald-800 font-bold bg-emerald-100 px-3 py-1 rounded-xl border border-emerald-300">
                              Đáp án đúng: {b.correctAnswer}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Lời giải thích của giáo viên nếu có */}
                {currentQ.explanation && (
                  <div className="p-4 bg-gradient-to-br from-amber-50 via-yellow-50/60 to-orange-50 border-2 border-amber-300/80 rounded-2xl text-xs space-y-1.5 text-amber-950 shadow-xs">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <HelpCircle className="w-4 h-4 text-amber-600" />
                      <span>Lời Giải Thích Chi Tiết:</span>
                    </div>
                    <p className="leading-relaxed font-medium">{currentQ.explanation}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-3xl border border-slate-200 text-center space-y-3 shadow-xs">
                <AlertCircle className="w-12 h-12 text-slate-400 mx-auto" />
                <h3 className="font-bold text-slate-800 text-base">Không tìm thấy nội dung câu hỏi</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Đề thi tương ứng với bài làm này có thể đã được cập nhật hoặc cần kết nối tới danh sách đề thi để hiển thị chi tiết từng câu.
                </p>
              </div>
            )}
          </main>
        </div>

        {/* ================= FOOTER CỐ ĐỊNH ================= */}
        <footer className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-t border-slate-200 shrink-0 shadow-xs">
          {/* Dành cho Điện thoại dọc (sm:hidden): Thanh điều hướng chuyển câu ngón tay cái cực kỳ tiện lợi */}
          <div className="sm:hidden flex items-center justify-between gap-2 w-full">
            <button
              type="button"
              onClick={() => setSelectedQuestionIndex((prev) => Math.max(0, prev - 1))}
              disabled={selectedQuestionIndex === 0}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1 shadow-2xs transition-all active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Câu trước</span>
            </button>

            <div className="text-center font-mono">
              <div className="text-xs font-black text-slate-900">
                Câu {selectedQuestionIndex + 1}/{totalQuestions}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                {correctCount}/{totalQuestions} đúng
              </div>
            </div>

            {selectedQuestionIndex < totalQuestions - 1 ? (
              <button
                type="button"
                onClick={() => setSelectedQuestionIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-indigo-600/25 transition-all active:scale-95"
              >
                <span>Câu sau</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : isRequiredPassEnforced && onRetakeExam ? (
              <button
                type="button"
                onClick={onRetakeExam}
                className="px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-indigo-600/25 transition-all active:scale-95 animate-pulse"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Làm lại</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-slate-900/20 transition-all active:scale-95"
              >
                <span>Đóng lại</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </button>
            )}
          </div>

          {/* Dành cho Desktop (hidden sm:flex) */}
          <div className="hidden sm:flex items-center justify-between gap-3 w-full">
            <div className="text-xs text-slate-500 font-mono flex items-center gap-2 flex-wrap">
              <span>Xem lại kết quả</span>
              <span>•</span>
              <span className="font-bold text-slate-800">Điểm số: {submission.score}/1000đ</span>
              <span>•</span>
              <span className="font-semibold text-slate-700">Đúng: {correctCount}/{totalQuestions} câu</span>
            </div>
            {/* Nếu đang áp dụng yêu cầu làm đạt và có hàm làm lại đề: Ẩn nút Đóng Xem Lại, thay bằng nút Làm Lại Đề Thi */}
            {isRequiredPassEnforced && onRetakeExam ? (
              <button
                type="button"
                onClick={onRetakeExam}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs cursor-pointer shadow-md shadow-indigo-600/25 transition-all hover:scale-102 flex items-center justify-center gap-2 animate-pulse"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Làm Lại Đề Thi</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer shadow-md shadow-slate-900/15 transition-all hover:scale-102 flex items-center justify-center gap-1.5"
              >
                Đóng Xem Lại
              </button>
            )}
          </div>
        </footer>
      </div>

      {/* ================= LIGHTBOX PHÓNG TO HÌNH ẢNH ================= */}
      <ImageLightboxModal
        isOpen={Boolean(lightboxImage)}
        imageUrl={lightboxImage?.url || null}
        title={lightboxImage?.title}
        onClose={handleCloseLightbox}
      />
    </div>
  );
};
