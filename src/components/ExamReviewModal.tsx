import React, { useState, useMemo } from 'react';
import { ExamSubmission, Exam, ExamQuestion } from '../types/index.ts';
import { HotspotCanvas } from './HotspotCanvas.tsx';
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
  Trash2
} from 'lucide-react';

interface ExamReviewModalProps {
  submission: ExamSubmission;
  onClose: () => void;
  onDelete?: (submission: ExamSubmission) => void;
  exam?: Exam;
  exams?: Exam[];
}

export const ExamReviewModal: React.FC<ExamReviewModalProps> = ({
  submission,
  onClose,
  onDelete,
  exam,
  exams,
}) => {
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Tái tạo danh sách câu hỏi một cách thông minh:
  // 1. Dùng snapshot có sẵn trong bộ nhớ (nếu vừa thi xong)
  // 2. Hoặc tái tạo từ đề thi gốc qua questionOrder (tiết kiệm 95% dung lượng CSDL)
  const questions = useMemo<ExamQuestion[]>(() => {
    if (submission.questionsSnapshot && submission.questionsSnapshot.length > 0) {
      return submission.questionsSnapshot;
    }

    const targetExam = exam || (exams ? exams.find((e) => e.id === submission.examId) : undefined);
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
  }, [submission, exam, exams]);

  const currentQ = questions[selectedQuestionIndex];
  const qResult = currentQ ? submission.questionResults[currentQ.id] : null;

  // Tính số lượng câu làm đúng
  const totalQuestions = questions.length;
  const correctCount = questions.filter(
    (q) => submission.questionResults && submission.questionResults[q.id]?.isCorrect
  ).length;


  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[92vh] bg-white rounded-3xl shadow-2xl shadow-indigo-950/15 flex flex-col overflow-hidden border border-slate-200/90">
        
        {/* ================= HEADER TÔNG SÁNG CAO CẤP ================= */}
        <header className="px-6 py-4 bg-gradient-to-r from-white via-indigo-50/30 to-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0 gap-4 shadow-xs">
          {/* Góc trái: Phân cấp thông tin rõ ràng */}
          <div className="flex items-center gap-3.5 min-w-0 pr-2">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shadow-md shrink-0 transition-transform hover:scale-105 ${
              submission.isPassed 
                ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-emerald-500/25 ring-4 ring-emerald-50' 
                : 'bg-gradient-to-tr from-rose-500 to-red-400 text-white shadow-rose-500/25 ring-4 ring-rose-50'
            }`}>
              <Award className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              {/* Tên bài thi làm nổi bật kèm Badge "✓ ĐẠT (≥950đ)" màu xanh ngọc */}
              <div className="flex items-center gap-2.5">
                <h2 className="text-base sm:text-lg font-black text-slate-900 truncate">
                  Xem Lại Đáp Án: {submission.examTitle}
                </h2>
                <span className={`px-3 py-0.5 rounded-full text-xs font-bold shrink-0 shadow-xs inline-flex items-center gap-1 ${
                  submission.isPassed 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}>
                  {submission.isPassed ? '✓ ĐẠT (≥950đ)' : '✕ CHƯA ĐẠT'}
                </span>
              </div>

              {/* Thông tin thí sinh & Thời gian gom gọn gàng thành các Chip thông tin nhỏ */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1.5">
                <span className="font-semibold text-slate-700 bg-slate-100/90 hover:bg-slate-200/70 transition-colors px-2.5 py-0.5 rounded-lg border border-slate-200">
                  Thí sinh: <strong className="font-bold text-slate-900">{submission.studentName || 'Học sinh'}</strong>{' '}
                  <span className="text-slate-500 font-mono">(SBD: {submission.studentCode || 'HS501475'})</span>
                </span>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <span className="flex items-center gap-1 text-slate-600 bg-slate-100/90 px-2.5 py-0.5 rounded-lg border border-slate-200">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Ngày thi: {new Date(submission.submittedAt).toLocaleDateString('vi-VN')} {new Date(submission.submittedAt).toLocaleTimeString('vi-VN')}</span>
                </span>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <span className="flex items-center gap-1 text-slate-600 bg-slate-100/90 px-2.5 py-0.5 rounded-lg border border-slate-200">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Thời gian: {Math.floor(submission.timeSpentSeconds / 60)}p {submission.timeSpentSeconds % 60}s</span>
                </span>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <span className="text-slate-600 bg-slate-100/90 px-2.5 py-0.5 rounded-lg border border-slate-200 font-medium">
                  Lần thi #{submission.attemptNumber}
                </span>
              </div>
            </div>
          </div>

          {/* ================= GÓC PHẢI: KHỐI TỔNG KẾT ĐIỂM SỐ CARD MÀU XANH LÁ RỰC RỠ ================= */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <div className={`px-5 py-2.5 rounded-2xl border flex flex-col items-end justify-center shadow-lg transition-all ${
              submission.isPassed 
                ? 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white border-emerald-400 shadow-emerald-500/25 ring-2 ring-emerald-300/40' 
                : 'bg-gradient-to-br from-rose-500 via-rose-600 to-red-600 text-white border-rose-400 shadow-rose-500/25 ring-2 ring-rose-300/40'
            }`}>
              {/* 1. Điểm số nổi bật to rõ, thấy ngay kết quả xuất sắc trong 1 giây */}
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-100 hidden sm:inline">
                  Điểm Đạt:
                </span>
                <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white drop-shadow-sm">
                  {submission.score}
                </span>
                <span className="text-xs font-bold text-emerald-100 font-mono">
                  / 1000đ
                </span>
              </div>

              {/* 2. Số câu đúng 1 / 1 câu với pill tương phản bắt mắt */}
              <div className="mt-1">
                <span className="px-3 py-0.5 rounded-full text-xs font-bold font-mono inline-flex items-center gap-1.5 shadow-xs bg-white/20 backdrop-blur-xs text-white border border-white/30">
                  <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                  <span>Số câu đúng: <strong className="font-black text-sm text-white">{correctCount}</strong> / {totalQuestions} câu</span>
                </span>
              </div>
            </div>

            {/* Nút Xóa bài thi (dành cho Giáo viên / Quản trị viên) */}
            {onDelete && (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="px-3 py-2 rounded-2xl flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 transition-all cursor-pointer border border-red-200 text-xs font-bold shadow-xs shrink-0"
                title="Xóa bài thi này của học sinh khỏi hệ thống"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Xóa Bài Thi</span>
              </button>
            )}

            {/* Nút đóng */}
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-2xl flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-all cursor-pointer border border-slate-200 hover:rotate-90 duration-200 shadow-xs shrink-0"
              title="Đóng xem lại"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

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


        {/* ================= 2. THÔNG BÁO AN NINH PHÒNG THI (ALERT BANNER NHẸ NHÀNG KHI 0 LẦN VI PHẠM) ================= */}
        {submission.violationCount > 0 ? (
          <div className="px-6 py-2.5 bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shrink-0 border-b border-red-700 shadow-md shadow-red-500/15">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center shrink-0">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <span>
                ⚠️ <strong>CẢNH BÁO QUY CHẾ:</strong> Thí sinh đã vi phạm quy chế thi{' '}
                <span className="underline decoration-2 font-mono font-black text-sm bg-black/25 px-2 py-0.5 rounded shadow-xs">
                  {submission.violationCount} lần
                </span>{' '}
                (nhấn chuột phải, F12, rời khỏi màn hình bài thi...).
              </span>
            </div>

            {submission.violationLogs && submission.violationLogs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 self-stretch sm:self-auto max-h-14 overflow-y-auto">
                <span className="text-[11px] text-white/90 font-bold shrink-0">Chi tiết:</span>
                {submission.violationLogs.map((log, idx) => (
                  <span
                    key={log.id || idx}
                    className="px-2 py-0.5 rounded-md bg-black/25 text-white font-mono text-[10px] border border-white/25 shrink-0 shadow-xs"
                    title={`${log.time}: ${log.label}`}
                  >
                    ⏱️ {log.time}: {log.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 py-2 bg-emerald-50/70 border-b border-emerald-200/80 text-emerald-900 text-xs sm:text-sm font-medium flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-300/70 shadow-xs">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <span>
                <strong className="text-emerald-950 font-bold">An ninh phòng thi:</strong> Số lần vi phạm quy chế:{' '}
                <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">0 lần</span>{' '}
                • Thí sinh tuân thủ tuyệt đối quy chế an ninh phòng thi (không vi phạm, không rời màn hình).
              </span>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300 shadow-xs">
              ✓ Phòng thi an toàn
            </span>
          </div>
        )}

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
          <main className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 bg-slate-50/40">
            {currentQ ? (
              <div className="max-w-3xl mx-auto space-y-5 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm shadow-slate-200/50">
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
                {currentQ.mediaType === 'image' && currentQ.mediaUrl && (
                  <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 shadow-xs">
                    <img
                      src={currentQ.mediaUrl}
                      alt="Ảnh câu hỏi"
                      className="max-h-64 mx-auto object-contain rounded-xl"
                    />
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
                          className={`p-3.5 sm:p-4 rounded-2xl border flex items-center justify-between gap-3 transition-transform hover:translate-x-0.5 ${rowClass}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${
                              isCorrect 
                                ? 'bg-emerald-600 text-white border-emerald-600' 
                                : isStudentChosen 
                                ? 'bg-rose-600 text-white border-rose-600' 
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {charLabel}
                            </span>
                            <span className="text-sm">{opt.text}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-bold">
                            {isCorrect && (
                              <span className="text-emerald-700 flex items-center gap-1 bg-emerald-100/70 px-2.5 py-1 rounded-lg">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>Đáp án đúng</span>
                              </span>
                            )}
                            {isStudentChosen && !isCorrect && (
                              <span className="text-rose-700 flex items-center gap-1 bg-rose-100/70 px-2.5 py-1 rounded-lg">
                                <XCircle className="w-4 h-4 text-rose-600" />
                                <span>Bạn đã chọn sai</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. MULTIPLE CHOICE */}
                {currentQ.type === 'multiple_choice' && currentQ.options && (
                  <div className="space-y-2.5">
                    {currentQ.options.map((opt, oIdx) => {
                      const charLabel = String.fromCharCode(65 + oIdx);
                      const chosenIds: string[] = submission.studentAnswers[currentQ.id] || [];
                      const isStudentChosen = chosenIds.includes(opt.id);
                      const isCorrect = (currentQ.correctOptionIds || []).includes(opt.id);

                      let rowClass = 'bg-white border-slate-200 text-slate-700 hover:border-slate-300';
                      if (isCorrect) {
                        rowClass = 'bg-gradient-to-r from-emerald-50 to-teal-50/60 border-2 border-emerald-400 text-emerald-950 font-bold shadow-xs';
                      } else if (isStudentChosen && !isCorrect) {
                        rowClass = 'bg-gradient-to-r from-rose-50 to-red-50/60 border-2 border-rose-400 text-rose-950 font-semibold shadow-xs';
                      }

                      return (
                        <div
                          key={opt.id}
                          className={`p-3.5 sm:p-4 rounded-2xl border flex items-center justify-between gap-3 transition-transform hover:translate-x-0.5 ${rowClass}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${
                              isCorrect 
                                ? 'bg-emerald-600 text-white border-emerald-600' 
                                : isStudentChosen 
                                ? 'bg-rose-600 text-white border-rose-600' 
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {charLabel}
                            </span>
                            <span className="text-sm">{opt.text}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-bold">
                            {isCorrect && (
                              <span className="text-emerald-700 flex items-center gap-1 bg-emerald-100/70 px-2.5 py-1 rounded-lg">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>Đáp án đúng</span>
                              </span>
                            )}
                            {isStudentChosen && !isCorrect && (
                              <span className="text-rose-700 flex items-center gap-1 bg-rose-100/70 px-2.5 py-1 rounded-lg">
                                <XCircle className="w-4 h-4 text-rose-600" />
                                <span>Bạn chọn sai</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

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
                          <div className="font-bold text-slate-800 flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                              {idx + 1}
                            </span>
                            <span className="text-sm">{p.leftText}</span>
                            {p.leftImageUrl && (
                              <img
                                src={p.leftImageUrl}
                                alt="Ảnh ghép đôi"
                                className="h-10 w-14 object-cover rounded-lg border border-slate-300"
                              />
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-medium">
                              <span className="text-slate-500">Bạn ghép với:</span>
                              <strong className={`font-bold ${isMatchCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {studentChosenPair ? studentChosenPair.rightText : 'Chưa ghép'}
                              </strong>
                              <span>{isMatchCorrect ? '✓' : '✕'}</span>
                            </div>
                            {!isMatchCorrect && (
                              <div className="text-emerald-700 font-bold bg-emerald-100/60 px-2 py-0.5 rounded-md inline-block">
                                Đáp án chính xác: <strong>{p.rightText}</strong>
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
                  <div className="space-y-2 text-xs">
                    <div className="p-4 bg-gradient-to-br from-indigo-50/80 via-white to-indigo-50/40 border border-indigo-200 rounded-2xl space-y-2 shadow-xs">
                      <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        <span>Thứ tự đúng chuẩn của giáo viên:</span>
                      </div>
                      <div className="space-y-1.5">
                        {currentQ.orderingItems.map((item, idx) => (
                          <div key={item.id} className="flex items-center gap-2 text-slate-800 font-semibold bg-white p-2.5 rounded-xl border border-indigo-100 shadow-xs">
                            <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-mono text-xs flex items-center justify-center font-bold">
                              {idx + 1}
                            </span>
                            <span>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. TRUE / FALSE */}
                {currentQ.type === 'true_false' && currentQ.tfStatements && (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-xs">
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
        <footer className="px-6 py-3.5 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
          <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
            <span>Xem lại kết quả thi</span>
            <span>•</span>
            <span className="font-bold text-slate-800">Điểm số: {submission.score}/1000đ</span>
            <span>•</span>
            <span className="font-semibold text-slate-700">Số câu đúng: {correctCount}/{totalQuestions}.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer shadow-md shadow-slate-900/15 transition-all hover:scale-102 flex items-center gap-1.5"
          >
            Đóng Xem Lại
          </button>
        </footer>
      </div>
    </div>
  );
};
