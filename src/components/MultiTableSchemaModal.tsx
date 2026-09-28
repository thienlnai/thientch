import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Table,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  HelpCircle,
} from 'lucide-react';
import {
  checkMultiTablesStatus,
  splitAndMigrateToMultiTables,
  MultiTablesStatus,
  MultiTableMigrationResult,
} from '../services/dbService.ts';
import { Exam } from '../types/index.ts';

interface MultiTableSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
  exams?: Exam[];
  onMigrated?: () => void;
}

export const MultiTableSchemaModal: React.FC<MultiTableSchemaModalProps> = ({
  isOpen,
  onClose,
  exams = [],
  onMigrated,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'status' | 'sql'>('overview');
  const [tableStatus, setTableStatus] = useState<MultiTablesStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MultiTableMigrationResult | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const fullSqlScript = `-- =========================================================================
-- TÁCH BẢNG CƠ SỞ DỮ LIỆU TURSO (SQLITE / LIBSQL): EXAMS & CÂU HỎI CHI TIẾT
-- =========================================================================

-- 1. BẢNG ĐỀ THI TỔNG QUAN (exams)
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  grade TEXT,
  targetGrades TEXT DEFAULT '[]',
  creatorId TEXT,
  creatorName TEXT,
  classIds TEXT DEFAULT '[]',
  durationMinutes INTEGER DEFAULT 45,
  totalScore INTEGER DEFAULT 1000,
  passingScore INTEGER DEFAULT 950,
  status TEXT DEFAULT 'published',
  allowReviewAnswers INTEGER DEFAULT 1,
  isPracticeTest INTEGER DEFAULT 0,
  practiceRandomCount INTEGER DEFAULT 0,
  totalQuestions INTEGER DEFAULT 0,
  questionIds TEXT DEFAULT '[]',
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- 2. BẢNG CHI TIẾT CÂU HỎI THI (exam_questions)
CREATE TABLE IF NOT EXISTS exam_questions (
  id TEXT PRIMARY KEY,
  examId TEXT,
  orderIndex INTEGER DEFAULT 0,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  mediaType TEXT DEFAULT 'none',
  mediaUrl TEXT,
  explanation TEXT,
  correctOptionId TEXT,
  correctOptionIds TEXT DEFAULT '[]',
  trueLabel TEXT DEFAULT 'Đúng',
  falseLabel TEXT DEFAULT 'Sai',
  hotspotImageUrl TEXT,
  fillBlankTemplate TEXT,
  options TEXT DEFAULT '[]',
  matchingPairs TEXT DEFAULT '[]',
  shuffledRightPairs TEXT DEFAULT '[]',
  orderingItems TEXT DEFAULT '[]',
  tfStatements TEXT DEFAULT '[]',
  shuffledTfColumns TEXT DEFAULT '[]',
  hotspotRegions TEXT DEFAULT '[]',
  fillBlankItems TEXT DEFAULT '[]',
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (examId) REFERENCES exams(id) ON DELETE SET NULL
);

-- 3. BẢNG PHƯƠNG ÁN TRẮC NGHIỆM (question_options)
CREATE TABLE IF NOT EXISTS question_options (
  id TEXT PRIMARY KEY,
  questionId TEXT NOT NULL,
  examId TEXT NOT NULL,
  orderIndex INTEGER DEFAULT 0,
  text TEXT NOT NULL,
  imageUrl TEXT,
  isCorrect INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (questionId) REFERENCES exam_questions(id) ON DELETE CASCADE
);

-- 4. BẢNG CÁC CẶP GHÉP ĐÔI (question_matching_pairs)
CREATE TABLE IF NOT EXISTS question_matching_pairs (
  id TEXT PRIMARY KEY,
  questionId TEXT NOT NULL,
  examId TEXT NOT NULL,
  orderIndex INTEGER DEFAULT 0,
  leftText TEXT NOT NULL,
  leftImageUrl TEXT,
  rightText TEXT NOT NULL,
  rightImageUrl TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (questionId) REFERENCES exam_questions(id) ON DELETE CASCADE
);

-- 5. BẢNG MỤC SẮP XẾP THỨ TỰ (question_ordering_items)
CREATE TABLE IF NOT EXISTS question_ordering_items (
  id TEXT PRIMARY KEY,
  questionId TEXT NOT NULL,
  examId TEXT NOT NULL,
  orderIndex INTEGER DEFAULT 0,
  text TEXT NOT NULL,
  imageUrl TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (questionId) REFERENCES exam_questions(id) ON DELETE CASCADE
);

-- 6. BẢNG MỆNH ĐỀ ĐÚNG / SAI (question_tf_statements)
CREATE TABLE IF NOT EXISTS question_tf_statements (
  id TEXT PRIMARY KEY,
  questionId TEXT NOT NULL,
  examId TEXT NOT NULL,
  orderIndex INTEGER DEFAULT 0,
  statement TEXT NOT NULL,
  isTrue INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (questionId) REFERENCES exam_questions(id) ON DELETE CASCADE
);

-- 7. BẢNG VỊ TRÍ ĐIỀN KHUYẾT (question_fill_blank_items)
CREATE TABLE IF NOT EXISTS question_fill_blank_items (
  id TEXT PRIMARY KEY,
  questionId TEXT NOT NULL,
  examId TEXT NOT NULL,
  orderIndex INTEGER DEFAULT 0,
  placeholderCode TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  correctAnswer TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (questionId) REFERENCES exam_questions(id) ON DELETE CASCADE
);

-- 8. BẢNG VÙNG CHỌN ĐIỂM NÓNG HÌNH ẢNH (question_hotspots)
CREATE TABLE IF NOT EXISTS question_hotspots (
  id TEXT PRIMARY KEY,
  questionId TEXT NOT NULL,
  examId TEXT NOT NULL,
  orderIndex INTEGER DEFAULT 0,
  x REAL DEFAULT 0,
  y REAL DEFAULT 0,
  width REAL DEFAULT 0,
  height REAL DEFAULT 0,
  label TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (questionId) REFERENCES exam_questions(id) ON DELETE CASCADE
);

-- CHỈ MỤC (INDEXES)
CREATE INDEX IF NOT EXISTS idx_exam_questions_examId ON exam_questions(examId);
CREATE INDEX IF NOT EXISTS idx_question_options_qId ON question_options(questionId);
CREATE INDEX IF NOT EXISTS idx_question_matching_qId ON question_matching_pairs(questionId);
CREATE INDEX IF NOT EXISTS idx_question_ordering_qId ON question_ordering_items(questionId);
CREATE INDEX IF NOT EXISTS idx_question_tf_qId ON question_tf_statements(questionId);
CREATE INDEX IF NOT EXISTS idx_question_fb_qId ON question_fill_blank_items(questionId);
CREATE INDEX IF NOT EXISTS idx_question_hs_qId ON question_hotspots(questionId);`;

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

  const loadStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const res = await checkMultiTablesStatus();
      setTableStatus(res);
    } catch (err) {
      console.warn('Lỗi kiểm tra bảng:', err);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(fullSqlScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleRunMigration = async () => {
    setIsMigrating(true);
    setMigrationResult(null);
    try {
      const res = await splitAndMigrateToMultiTables();
      setMigrationResult(res);
      await loadStatus();
      if (onMigrated && res.success) {
        onMigrated();
      }
    } catch (err: any) {
      setMigrationResult({
        success: false,
        examsCount: 0,
        questionsCount: 0,
        optionsCount: 0,
        matchingPairsCount: 0,
        orderingItemsCount: 0,
        tfStatementsCount: 0,
        fillBlankItemsCount: 0,
        hotspotsCount: 0,
        message: err?.message || 'Lỗi trong quá trình phân bổ bảng sang Turso.',
      });
    } finally {
      setIsMigrating(false);
    }
  };

  if (!isOpen) return null;

  const totalQuestionsInCache = exams.reduce((acc, e) => acc + (e.questions?.length || 0), 0);
  const totalOptionsInCache = exams.reduce((acc, e) => {
    return acc + (e.questions || []).reduce((qAcc, q) => qAcc + (q.options?.length || 0), 0);
  }, 0);

  const tableRows = [
    { key: 'exams', name: 'exams', desc: 'Thông tin tổng quan đề thi', isReady: tableStatus?.exams },
    { key: 'exam_questions', name: 'exam_questions', desc: 'Danh sách chi tiết câu hỏi', isReady: tableStatus?.exam_questions },
    { key: 'question_options', name: 'question_options', desc: 'Phương án trắc nghiệm A, B, C, D', isReady: tableStatus?.question_options },
    { key: 'question_matching_pairs', name: 'question_matching_pairs', desc: 'Cặp ghép đôi cột Trái - Phải', isReady: tableStatus?.question_matching_pairs },
    { key: 'question_ordering_items', name: 'question_ordering_items', desc: 'Mục sắp xếp thứ tự', isReady: tableStatus?.question_ordering_items },
    { key: 'question_tf_statements', name: 'question_tf_statements', desc: 'Mệnh đề Đúng / Sai', isReady: tableStatus?.question_tf_statements },
    { key: 'question_fill_blank_items', name: 'question_fill_blank_items', desc: 'Vị trí điền khuyết menu sổ', isReady: tableStatus?.question_fill_blank_items },
    { key: 'question_hotspots', name: 'question_hotspots', desc: 'Vùng chọn điểm nóng ảnh', isReady: tableStatus?.question_hotspots },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-linear-to-r from-indigo-900 via-purple-900 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <Layers className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight">
                  Kiến Trúc Tách Nhiều Bảng CSDL Turso (SQLite)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Chuẩn SQLite
                </span>
              </div>
              <p className="text-xs text-indigo-200">
                Phân tách câu hỏi và phương án sang các bảng riêng biệt: Tải đề tức thì &lt; 0.3s
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-6 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Tổng Quan & Phân Bổ</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'status'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Trạng Thái 8 Bảng Turso</span>
            {tableStatus?.isAllMultiTablesReady ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sql')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'sql'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Mã SQL SQLite</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-indigo-900 leading-relaxed">
                  <div className="font-bold text-sm text-indigo-950">
                    Tại sao nên phân tách nhiều bảng trên Turso SQLite?
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    <li>Bảng <code className="font-mono bg-white px-1 py-0.5 rounded text-indigo-700 font-bold">exams</code> chỉ lưu tiêu đề, thời gian, môn học mà không bị phình to bởi chuỗi câu hỏi.</li>
                    <li>Danh sách câu hỏi được liên kết qua khóa ngoại <code className="font-mono bg-white px-1 py-0.5 rounded text-indigo-700 font-bold">examId</code>, dễ dàng tái sử dụng trong ngân hàng câu hỏi.</li>
                    <li>Hình ảnh được lưu trữ trên GitHub Repository qua Raw URL, tải siêu tốc qua CDN toàn cầu.</li>
                  </ul>
                </div>
              </div>

              {/* Cache Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Đề thi hiện có</span>
                  <div className="text-xl font-black text-slate-800 font-mono mt-0.5">{exams.length}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tổng câu hỏi</span>
                  <div className="text-xl font-black text-indigo-600 font-mono mt-0.5">{totalQuestionsInCache}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tổng đáp án A, B, C, D</span>
                  <div className="text-xl font-black text-purple-600 font-mono mt-0.5">{totalOptionsInCache}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Trạng thái CSDL</span>
                  <div className="text-xs font-bold text-emerald-600 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Turso SQLite Ready</span>
                  </div>
                </div>
              </div>

              {/* Migrate Action */}
              <div className="p-5 rounded-2xl bg-linear-to-r from-slate-900 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
                <div className="space-y-1">
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>Phân Bổ & Đồng Bộ Tức Thì Vào Turso</span>
                  </div>
                  <p className="text-xs text-slate-300 max-w-xl">
                    Hệ thống sẽ tự động chuyển đổi toàn bộ {exams.length} đề thi và {totalQuestionsInCache} câu hỏi sang 8 bảng con trên Turso.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunMigration}
                  disabled={isMigrating}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 shrink-0 self-start sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isMigrating ? 'animate-spin' : ''}`} />
                  <span>{isMigrating ? 'Đang phân bổ...' : 'Phân Bổ Bảng Ngay'}</span>
                </button>
              </div>

              {migrationResult && (
                <div
                  className={`p-4 rounded-2xl border text-xs flex items-start gap-3 ${
                    migrationResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {migrationResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold text-sm mb-1">{migrationResult.message}</div>
                    {migrationResult.success && (
                      <div className="text-[11px] text-emerald-800 space-y-0.5 font-mono">
                        <div>• Đề thi đã tối ưu: {migrationResult.examsCount} đề</div>
                        <div>• Câu hỏi đã chuyển: {migrationResult.questionsCount} câu</div>
                        <div>• Phương án trắc nghiệm: {migrationResult.optionsCount} lựa chọn</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'status' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Trạng Thái 8 Bảng Trên Turso Database
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Kiểm tra sự tồn tại và khả năng kết nối đến từng bảng trong cấu trúc
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadStatus}
                  disabled={isCheckingStatus}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer border border-slate-300"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  <span>{isCheckingStatus ? 'Đang kiểm tra...' : 'Kiểm tra lại'}</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs">
                {tableRows.map((t) => (
                  <div key={t.key} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
                        <Table className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="font-mono font-bold text-slate-800">{t.name}</span>
                        <p className="text-[11px] text-slate-500">{t.desc}</p>
                      </div>
                    </div>

                    <div>
                      {t.isReady ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Đã Sẵn Sàng</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>Chưa Khởi Tạo</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Mã SQL Khởi Tạo 8 Bảng Cho Turso (SQLite)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Sao chép và chạy script này trong Turso CLI nếu muốn tạo thủ công
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Đã Sao Chép!' : 'Sao Chép SQL'}</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[11px] max-h-80 overflow-y-auto leading-relaxed border border-slate-800">
                <pre>{fullSqlScript}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Toàn bộ câu hỏi & hình ảnh được đồng bộ an toàn giữa Turso và GitHub</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
