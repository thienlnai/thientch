import React, { useState, useMemo, useEffect } from 'react';
import { ExamQuestion, QuestionType } from '../types/index.ts';
import { subscribeQuestionBank, getQuestionBank } from '../services/dbService.ts';
import {
  Search,
  Check,
  X,
  Database,
  Filter,
  Layers,
  Sparkles,
  HelpCircle,
  Eye,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  CheckCircle2,
  BookOpen,
  UserCheck
} from 'lucide-react';

interface QuestionBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuestions: (questions: ExamQuestion[]) => void;
  currentExamQuestionTitles?: string[];
  defaultSubject?: string;
}

export const QuestionBankModal: React.FC<QuestionBankModalProps> = ({
  isOpen,
  onClose,
  onSelectQuestions,
  currentExamQuestionTitles = [],
  defaultSubject = 'all',
}) => {
  const [bankQuestions, setBankQuestions] = useState<ExamQuestion[]>(() => getQuestionBank());
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<QuestionType | 'all'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>(defaultSubject !== 'all' ? defaultSubject : 'all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Subscribe to live question bank updates
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeQuestionBank((data) => {
      setBankQuestions(data);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [isOpen]);

  // Reset selections when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set());
      setSearchQuery('');
      if (defaultSubject && defaultSubject !== 'all') {
        setSubjectFilter(defaultSubject);
      }
    }
  }, [isOpen, defaultSubject]);

  // Set of titles already present in the exam
  const existingTitleSet = useMemo(() => {
    return new Set(currentExamQuestionTitles.map((t) => (t || '').trim().toLowerCase()));
  }, [currentExamQuestionTitles]);

  // Unique subjects
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    bankQuestions.forEach((q) => {
      if (q.subject && q.subject.trim()) {
        set.add(q.subject.trim());
      }
    });
    return Array.from(set);
  }, [bankQuestions]);

  // Filtered list
  const filteredQuestions = useMemo(() => {
    return bankQuestions.filter((q) => {
      // 1. Dạng câu hỏi
      if (typeFilter !== 'all' && q.type !== typeFilter) return false;

      // 2. Môn học
      if (subjectFilter !== 'all' && q.subject && q.subject !== subjectFilter) {
        return false;
      }

      // 3. Tìm kiếm từ khóa
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = q.title?.toLowerCase().includes(query);
        const matchExpl = q.explanation?.toLowerCase().includes(query);
        const matchCreator = q.creatorName?.toLowerCase().includes(query);
        const matchSource = q.sourceExamTitle?.toLowerCase().includes(query);
        const matchOptions = q.options?.some((opt) => opt.text.toLowerCase().includes(query));
        if (!matchTitle && !matchExpl && !matchCreator && !matchSource && !matchOptions) {
          return false;
        }
      }

      return true;
    });
  }, [bankQuestions, typeFilter, subjectFilter, searchQuery]);

  // Check if all visible questions are selected
  const isAllVisibleSelected =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((q) => selectedIds.has(q.id));

  const handleToggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAllVisibleSelected) {
      filteredQuestions.forEach((q) => next.delete(q.id));
    } else {
      filteredQuestions.forEach((q) => next.add(q.id));
    }
    setSelectedIds(next);
  };

  const handleToggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleConfirmSelect = () => {
    const selectedQuestions = bankQuestions
      .filter((q) => selectedIds.has(q.id))
      .map((q) => ({
        ...q,
        // Giữ nguyên ID câu hỏi sẵn có từ ngân hàng câu hỏi để tái sử dụng, không tạo mới dữ liệu câu hỏi
        id: q.id,
      }));

    onSelectQuestions(selectedQuestions);
    onClose();
  };

  const getTypeLabel = (type: QuestionType) => {
    switch (type) {
      case 'single_choice':
        return { label: 'Chọn 1 đáp án', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'multiple_choice':
        return { label: 'Chọn nhiều đáp án', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'matching':
        return { label: 'Ghép đôi', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'ordering':
        return { label: 'Sắp xếp thứ tự', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'true_false':
        return { label: 'Đúng / Sai', color: 'bg-rose-100 text-rose-800 border-rose-200' };
      case 'hotspot':
        return { label: 'Hotspot hình ảnh', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' };
      case 'fill_blank':
        return { label: 'Điền chỗ trống', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      default:
        return { label: 'Câu hỏi', color: 'bg-slate-100 text-slate-800 border-slate-200' };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-purple-700 via-indigo-700 to-indigo-800 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-white shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                <span>Ngân Hàng Câu Hỏi Khảo Thí</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 text-white font-mono font-bold">
                  {bankQuestions.length} câu hỏi
                </span>
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Chọn câu hỏi có sẵn để đưa nhanh vào đề thi. Câu hỏi được lưu trữ vĩnh viễn và không bị mất khi xóa đề thi.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 shrink-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            {/* Search Input */}
            <div className="sm:col-span-6 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm nội dung câu hỏi, đáp án, giáo viên tạo..."
                className="w-full pl-10 pr-8 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-purple-500 shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dạng câu hỏi filter */}
            <div className="sm:col-span-3">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-purple-500 shadow-2xs"
              >
                <option value="all">Tất cả dạng câu hỏi ({bankQuestions.length})</option>
                <option value="single_choice">Chọn 1 đáp án</option>
                <option value="multiple_choice">Chọn nhiều đáp án</option>
                <option value="matching">Ghép đôi</option>
                <option value="ordering">Sắp xếp thứ tự</option>
                <option value="true_false">Đúng / Sai</option>
                <option value="hotspot">Hotspot hình ảnh</option>
                <option value="fill_blank">Điền chỗ trống</option>
              </select>
            </div>

            {/* Môn học filter */}
            <div className="sm:col-span-3">
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-purple-500 shadow-2xs"
              >
                <option value="all">Tất cả môn học</option>
                {availableSubjects.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick select & Stats info */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80 text-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1.5 cursor-pointer"
              >
                {isAllVisibleSelected ? (
                  <CheckSquare className="w-4 h-4 text-purple-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>
                  {isAllVisibleSelected
                    ? 'Bỏ chọn tất cả'
                    : `Chọn tất cả (${filteredQuestions.length} câu đang hiển thị)`}
                </span>
              </button>

              {selectedIds.size > 0 && (
                <span className="text-slate-500">
                  • Đang chọn: <strong className="text-purple-700 font-mono">{selectedIds.size}</strong> câu
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-400">
              Hiển thị {filteredQuestions.length} / {bankQuestions.length} câu hỏi trong kho
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3.5 divide-y divide-slate-100">
          {filteredQuestions.map((q, idx) => {
            const isSelected = selectedIds.has(q.id);
            const isAlreadyInExam = existingTitleSet.has((q.title || '').trim().toLowerCase());
            const typeInfo = getTypeLabel(q.type);
            const isExpanded = expandedId === q.id;

            return (
              <div
                key={q.id}
                className={`pt-3.5 first:pt-0 rounded-2xl transition-all ${
                  isSelected ? 'bg-purple-50/50 p-3 border border-purple-200' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggleSelectOne(q.id)}
                    className="mt-0.5 text-purple-600 hover:text-purple-800 cursor-pointer shrink-0"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-purple-600" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-400 hover:text-purple-500" />
                    )}
                  </button>

                  {/* Question Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-slate-400">#{idx + 1}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeInfo.color}`}
                      >
                        {typeInfo.label}
                      </span>
                      {q.subject && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          {q.subject}
                        </span>
                      )}
                      {isAlreadyInExam && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-amber-700" />
                          <span>Đã có trong đề thi này</span>
                        </span>
                      )}
                      {q.sourceExamTitle && (
                        <span className="text-[10px] text-slate-400 truncate max-w-xs" title={q.sourceExamTitle}>
                          Nguồn: {q.sourceExamTitle}
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-snug">
                      {q.title || 'Câu hỏi chưa đặt tiêu đề'}
                    </h4>

                    {/* Preview summary of options or details */}
                    {q.type === 'single_choice' && q.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-600 pt-1">
                        {q.options.map((opt) => (
                          <div
                            key={opt.id}
                            className={`p-2 rounded-xl border flex items-center gap-1.5 ${
                              opt.id === q.correctOptionId
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 shrink-0">
                              {opt.id === q.correctOptionId ? '✓ ĐÚNG' : '•'}
                            </span>
                            <span className="truncate">{opt.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {q.type === 'multiple_choice' && q.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-600 pt-1">
                        {q.options.map((opt) => {
                          const isCorrect = q.correctOptionIds?.includes(opt.id);
                          return (
                            <div
                              key={opt.id}
                              className={`p-2 rounded-xl border flex items-center gap-1.5 ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 shrink-0">
                                {isCorrect ? '✓ ĐÚNG' : '•'}
                              </span>
                              <span className="truncate">{opt.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Toggle expand for extra detail */}
                    <div className="flex items-center gap-2 pt-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : q.id)}
                        className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        <span>{isExpanded ? 'Thu gọn chi tiết' : 'Xem giải thích & cấu trúc'}</span>
                      </button>

                      {q.creatorName && (
                        <span className="text-slate-400">
                          • GV tạo: <strong className="text-slate-600">{q.creatorName}</strong>
                        </span>
                      )}
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 text-xs animate-in fade-in">
                        {q.explanation && (
                          <div className="text-slate-600">
                            <span className="font-bold text-slate-800">Lời giải thích:</span> {q.explanation}
                          </div>
                        )}
                        {q.matchingPairs && (
                          <div className="space-y-1">
                            <span className="font-bold text-slate-800">Các cặp ghép đôi:</span>
                            {q.matchingPairs.map((p) => (
                              <div key={p.id} className="flex items-center gap-2 text-slate-600 font-mono text-[11px]">
                                <span className="bg-slate-100 px-2 py-0.5 rounded">{p.leftText}</span>
                                <span>➔</span>
                                <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded font-semibold">{p.rightText}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {q.tfStatements && (
                          <div className="space-y-1">
                            <span className="font-bold text-slate-800">Các phát biểu Đúng / Sai:</span>
                            {q.tfStatements.map((tf) => (
                              <div key={tf.id} className="flex items-center gap-2 text-slate-600 text-[11px]">
                                <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${tf.isTrue ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                  {tf.isTrue ? q.trueLabel || 'ĐÚNG' : q.falseLabel || 'SAI'}
                                </span>
                                <span>{tf.statement}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredQuestions.length === 0 && (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Database className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-bold text-sm text-slate-600">Không tìm thấy câu hỏi nào phù hợp</p>
              <p className="text-xs">
                Hãy thử thay đổi từ khóa tìm kiếm hoặc bỏ chọn bộ lọc dạng câu hỏi / môn học.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            {selectedIds.size > 0 ? (
              <span className="text-purple-700 font-bold">
                ✓ Đã chọn {selectedIds.size} câu hỏi để thêm vào đề thi
              </span>
            ) : (
              <span>Chọn các câu hỏi bạn muốn sử dụng rồi nhấn nút bên phải.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
            >
              Đóng
            </button>

            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={handleConfirmSelect}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Thêm {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}Câu Hỏi Vào Đề Thi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
