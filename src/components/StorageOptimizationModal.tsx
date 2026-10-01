import React, { useState, useMemo } from 'react';
import { ExamSubmission } from '../types/index.ts';
import { 
  X, 
  Database, 
  HardDrive, 
  Trash2, 
  Download, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Clock, 
  Calendar,
  Layers,
  ShieldCheck,
  RefreshCw,
  Zap,
  HelpCircle
} from 'lucide-react';
import { 
  purgePracticeSubmissions, 
  purgeOldSubmissions, 
  purgeAllDraftSubmissions,
  optimizeExistingSubmissionsStorage, 
  exportSubmissionsArchive 
} from '../services/dbService.ts';

interface StorageOptimizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: ExamSubmission[];
  onActionComplete: (message: string) => void;
}

export const StorageOptimizationModal: React.FC<StorageOptimizationModalProps> = ({
  isOpen,
  onClose,
  submissions,
  onActionComplete,
}) => {
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  // Phân tích dữ liệu bài nộp
  const stats = useMemo(() => {
    const total = submissions.length;
    const practiceCount = submissions.filter((s) => s.isPractice).length;
    const draftCount = submissions.filter(
      (s) => s.id.startsWith('draft_') || s.examTitle === 'Bản nháp thi'
    ).length;
    
    const now = Date.now();
    const olderThan30 = submissions.filter(
      (s) => now - new Date(s.submittedAt).getTime() > 30 * 24 * 60 * 60 * 1000
    ).length;
    const olderThan60 = submissions.filter(
      (s) => now - new Date(s.submittedAt).getTime() > 60 * 24 * 60 * 60 * 1000
    ).length;
    const olderThan90 = submissions.filter(
      (s) => now - new Date(s.submittedAt).getTime() > 90 * 24 * 60 * 60 * 1000
    ).length;

    const legacyBloatedCount = submissions.filter(
      (s) => s.questionsSnapshot && s.questionsSnapshot.length > 0
    ).length;

    // Ước lượng dung lượng
    const avgSizeKb = 0.8; // ~800 bytes sau khi bỏ questionsSnapshot
    const currentEstimatedKb = total * avgSizeKb;
    const maxFreeCapacity = 500 * 1024; // 500 MB = 512,000 KB
    const percentUsed = ((currentEstimatedKb / maxFreeCapacity) * 100).toFixed(2);
    const capacitySubmissions = Math.floor(maxFreeCapacity / avgSizeKb);

    return {
      total,
      practiceCount,
      draftCount,
      olderThan30,
      olderThan60,
      olderThan90,
      legacyBloatedCount,
      currentEstimatedKb: currentEstimatedKb.toFixed(1),
      percentUsed,
      capacitySubmissions: capacitySubmissions.toLocaleString('vi-VN'),
    };
  }, [submissions]);

  if (!isOpen) return null;

  // Xử lý sao chép SQL VACUUM
  const handleCopyVacuumSql = () => {
    const sql = `-- Chạy lệnh này trên Turso CLI hoặc giao diện SQL để nén và thu hồi dung lượng đĩa về mức tối ưu:\nVACUUM;`;
    navigator.clipboard.writeText(sql);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  // 1. Xuất file lưu trữ
  const handleExportBackup = () => {
    exportSubmissionsArchive(submissions);
    onActionComplete(`Đã xuất file lưu trữ JSON thành công (${submissions.length} bài nộp)!`);
  };

  // 2. Tối ưu hóa các bài cũ
  const handleOptimizeLegacy = () => {
    setIsProcessing(true);
    try {
      const count = optimizeExistingSubmissionsStorage();
      onActionComplete(`Đã tối ưu hóa ${count} bài thi cũ, loại bỏ câu hỏi trùng lặp thành công!`);
    } catch {
      onActionComplete('Có lỗi xảy ra khi tối ưu hóa.');
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
    }
  };

  // 3. Xóa các bài thi thử
  const handlePurgePractice = async () => {
    setIsProcessing(true);
    try {
      const deleted = await purgePracticeSubmissions();
      onActionComplete(`Đã dọn dẹp ${deleted} bài thi thử luyện tập khỏi hệ thống!`);
    } catch {
      onActionComplete('Không thể xóa bài thi thử.');
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
    }
  };

  // 4. Xóa bài thi cũ theo số ngày
  const handlePurgeOld = async () => {
    setIsProcessing(true);
    try {
      const deleted = await purgeOldSubmissions(retentionDays);
      onActionComplete(`Đã dọn dẹp ${deleted} bài thi cũ hơn ${retentionDays} ngày thành công!`);
    } catch {
      onActionComplete('Không thể xóa bài thi cũ.');
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
    }
  };

  // 5. Dọn dẹp bản nháp rác
  const handlePurgeDrafts = async () => {
    setIsProcessing(true);
    try {
      await purgeAllDraftSubmissions();
      onActionComplete('Đã xóa sạch toàn bộ các Bản nháp thi rác trên Turso thành công!');
    } catch {
      onActionComplete('Lỗi khi dọn dẹp bản nháp thi.');
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center border border-white/20 shadow-xs">
              <Database className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight">Tối Ưu Dung Lượng Turso Database (SQLite)</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/25 border border-emerald-400/40 text-emerald-200">
                  Chuẩn SQLite Cloud Free
                </span>
              </div>
              <p className="text-xs text-blue-100/80">
                Kiểm soát dung lượng, sao lưu lưu trữ và dọn dẹp bài nộp để sử dụng miễn phí bền vững
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Container */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 bg-slate-50/50">

          {/* 1. Dashboard Thống Kê & Đánh Giá Dung Lượng */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng Lượt Nộp</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900 font-mono">{stats.total}</span>
                <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  Bài thi
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Đã bỏ questionsSnapshot (~0.8 KB/bài)</p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sức Chứa Bản Free</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xl font-black text-emerald-600 font-mono">~{stats.capacitySubmissions}</span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  Bài tối đa
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Đủ dùng cho 691 HS trong 1-2 năm</p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bài Thi Thử (Nháp)</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-amber-600 font-mono">{stats.practiceCount}</span>
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                  Có thể dọn
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Bài luyện tập không tính điểm chính thức</p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bài Cũ &gt; 30 Ngày</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-rose-600 font-mono">{stats.olderThan30}</span>
                <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                  Nên sao lưu
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">&gt;60 ngày: {stats.olderThan60} | &gt;90 ngày: {stats.olderThan90}</p>
            </div>
          </div>

          {/* 2. Banner Hiệu Quả Tối Ưu Mới */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 flex items-start gap-3 shadow-2xs">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="text-xs space-y-1 text-slate-700 leading-relaxed">
              <div className="font-bold text-emerald-950 text-sm flex items-center gap-2">
                <span>Giải pháp tối ưu câu hỏi đã được kích hoạt thành công!</span>
                <span className="px-2 py-0.2 rounded-md bg-emerald-200/80 text-emerald-900 font-mono text-[10px]">
                  Tiết kiệm 95%
                </span>
              </div>
              <p>
                Toàn bộ các bài nộp mới hiện tại <strong>chỉ lưu ID câu hỏi và thứ tự xáo trộn (~50 bytes)</strong> thay vì sao chép toàn bộ nội dung đề thi (`questionsSnapshot` ~15 KB). Khi bấm &quot;Xem lại bài làm&quot;, hệ thống tự động tái tạo đề thi từ bảng đề thi gốc, giữ nguyên 100% tính năng hiển thị đối chiếu đáp án, thời gian và vi phạm.
              </p>
            </div>
          </div>

          {/* 3. Công Cụ Sao Lưu Dữ Liệu (Backup JSON) */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Download className="w-4 h-4 text-blue-600" />
                  <span>Bước 1: Sao Lưu Lưu Trữ Ngoại Tuyến (Backup JSON)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tải toàn bộ {submissions.length} bài thi về máy tính để lưu hồ sơ khảo thí lâu dài trước khi dọn dẹp CSDL
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportBackup}
                disabled={submissions.length === 0}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>Tải File Sao Lưu (.JSON)</span>
              </button>
            </div>
          </div>

          {/* 4. Công Cụ Dọn Dẹp CSDL 1-Chạm */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Bước 2: Dọn Dẹp Bản Ghi Cũ Để Giải Phóng CSDL Turso</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Chọn phương án dọn dẹp phù hợp với nhu cầu của trường để đưa dung lượng lưu trữ về mức tối thiểu
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Card Dọn Bản Nháp Rác */}
              <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-purple-900 flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4 text-purple-600" />
                      <span>Xóa Bản Nháp Thi Rác</span>
                    </span>
                    <span className="font-mono text-xs font-black text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                      {stats.draftCount} nháp
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-800/80 mt-1 leading-relaxed">
                    Xóa các bản ghi "Bản nháp thi" sót lại do học sinh thoát dở hoặc rớt mạng khi thi.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setConfirmAction('draft')}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Dọn Dẹp Bản Nháp Rác</span>
                </button>
              </div>

              {/* Card Dọn Bài Thi Thử */}
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-amber-900 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-600" />
                      <span>Xóa Bài Thi Thử</span>
                    </span>
                    <span className="font-mono text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                      {stats.practiceCount} bài
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800/80 mt-1 leading-relaxed">
                    Xóa các bài làm nháp/ôn luyện không phải kỳ thi chính thức của học sinh.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isProcessing || stats.practiceCount === 0}
                  onClick={() => setConfirmAction('practice')}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Dọn Dẹp {stats.practiceCount} Bài Thi Thử</span>
                </button>
              </div>

              {/* Card Dọn Theo Thời Gian */}
              <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-200 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-rose-900 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-rose-600" />
                      <span>Dọn dẹp bài thi cũ</span>
                    </span>
                    <div className="flex items-center gap-1">
                      {[30, 60, 90].map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setRetentionDays(days)}
                          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded cursor-pointer transition-all ${
                            retentionDays === days 
                              ? 'bg-rose-600 text-white' 
                              : 'bg-white border border-rose-200 text-rose-800 hover:bg-rose-100'
                          }`}
                        >
                          &gt;{days}N
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-rose-800/80 mt-1 leading-relaxed">
                    Xóa các bài thi cách đây &gt;<strong>{retentionDays} ngày</strong> (
                    {retentionDays === 30 ? stats.olderThan30 : retentionDays === 60 ? stats.olderThan60 : stats.olderThan90} bài).
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    isProcessing || 
                    (retentionDays === 30 ? stats.olderThan30 : retentionDays === 60 ? stats.olderThan60 : stats.olderThan90) === 0
                  }
                  onClick={() => setConfirmAction('old')}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa Bài Cũ &gt; {retentionDays}N</span>
                </button>
              </div>

            </div>

            {/* Tùy chọn Tối ưu hóa bản ghi cũ nếu có questionsSnapshot */}
            {stats.legacyBloatedCount > 0 && (
              <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-between gap-3">
                <div className="text-xs text-indigo-950">
                  <span className="font-bold">Phát hiện {stats.legacyBloatedCount} bài nộp cũ chứa snapshot đề thi:</span>
                  <p className="text-[11px] text-indigo-700 mt-0.5">
                    Hệ thống có thể chuyển đổi chúng về cấu trúc nhẹ để giải phóng thêm bộ nhớ mà không cần xóa bài nộp.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleOptimizeLegacy}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer disabled:opacity-50"
                >
                  Tối Ưu Ngay
                </button>
              </div>
            )}
          </div>

          {/* 5. Lệnh Thu Hồi Dung Lượng Đĩa (VACUUM) */}
          <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs sm:text-sm font-bold tracking-tight">Bước 3: Thu hồi dung lượng đĩa về mức tối ưu (VACUUM)</h4>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded">
                Khuyên dùng sau khi xóa
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Trong cơ sở dữ liệu SQLite của Turso, khi bạn xóa bài thi, SQLite giữ lại các trang trống để tái sử dụng. Bạn có thể sao chép và thực thi lệnh <strong>VACUUM;</strong> để thu gọn file cơ sở dữ liệu và giải phóng tối đa dung lượng đĩa:
            </p>

            <div className="relative group">
              <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono text-xs overflow-x-auto select-all">
                VACUUM;
              </pre>
              <button
                type="button"
                onClick={handleCopyVacuumSql}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Đã Copy!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao Chép SQL</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Mọi thao tác dọn dẹp đều được bảo vệ và đồng bộ trực tiếp tới Turso Database</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in zoom-in-95 duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">Xác Nhận Dọn Dẹp Dữ Liệu</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {confirmAction === 'draft'
                  ? 'Bạn có chắc chắn muốn xóa sạch toàn bộ các bản nháp bài thi còn sót lại trên Turso không? Thao tác này sẽ làm sạch bảng bài thi và không làm mất các bài thi đã nộp chính thức.'
                  : confirmAction === 'practice'
                  ? `Bạn có chắc chắn muốn xóa toàn bộ ${stats.practiceCount} bài thi thử luyện tập không? Bạn nên tải file sao lưu trước khi xóa.`
                  : `Bạn có chắc chắn muốn xóa các bài thi làm cách đây hơn ${retentionDays} ngày không? Hành động này sẽ giải phóng dung lượng trên Turso.`}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={
                  confirmAction === 'draft' 
                    ? handlePurgeDrafts 
                    : confirmAction === 'practice' 
                    ? handlePurgePractice 
                    : handlePurgeOld
                }
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-xs cursor-pointer flex items-center gap-1.5 ${
                  confirmAction === 'draft' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xác Nhận Xóa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
