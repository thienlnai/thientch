import React, { useState, useMemo } from 'react';
import { 
  SchoolClass, 
  Exam, 
  ExamSubmission, 
  School 
} from '../types/index.ts';
import { 
  X, 
  Trash2, 
  Filter, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  Users, 
  Calendar, 
  RefreshCw, 
  Sparkles, 
  Check, 
  FileText,
  Sliders,
  Award
} from 'lucide-react';
import { deleteMultipleExamSubmissions } from '../services/dbService.ts';

interface ScoreRangeDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: ExamSubmission[];
  classes: SchoolClass[];
  exams: Exam[];
  schools?: School[];
  role: 'admin' | 'teacher';
  onDeleteSuccess: (deletedCount: number, affectedStudentsCount: number) => void;
}

export const ScoreRangeDeleteModal: React.FC<ScoreRangeDeleteModalProps> = ({
  isOpen,
  onClose,
  submissions,
  classes,
  exams,
  schools = [],
  role,
  onDeleteSuccess,
}) => {
  // Score range state
  const [minScore, setMinScore] = useState<number>(0);
  const [maxScore, setMaxScore] = useState<number>(949);

  // Scope filters
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedExamId, setSelectedExamId] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected submission IDs to delete (initialized or toggled)
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [hasUserModifiedSelection, setHasUserModifiedSelection] = useState<boolean>(false);

  // Loading & confirmation state
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isConfirmStep, setIsConfirmStep] = useState<boolean>(false);

  // Quick preset shortcuts
  const handleApplyPreset = (min: number, max: number) => {
    setMinScore(min);
    setMaxScore(max);
    setHasUserModifiedSelection(false);
  };

  // Filter matching classes by school (if admin)
  const filteredClasses = useMemo(() => {
    if (role === 'admin' && selectedSchoolId !== 'all') {
      return classes.filter((c) => c.schoolId === selectedSchoolId);
    }
    return classes;
  }, [classes, role, selectedSchoolId]);

  // Lookup maps for fast access
  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const schoolMap = useMemo(() => new Map(schools.map((s) => [s.id, s])), [schools]);

  // Filter matching submissions
  const matchingSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      // 1. Score range check
      const score = typeof sub.score === 'number' ? sub.score : 0;
      if (score < minScore || score > maxScore) return false;

      // 2. Class check
      if (selectedClassId !== 'all' && sub.classId !== selectedClassId) return false;

      // 3. School check (if admin)
      if (role === 'admin' && selectedSchoolId !== 'all') {
        const cls = classMap.get(sub.classId);
        if (!cls || cls.schoolId !== selectedSchoolId) return false;
      }

      // 4. Exam check
      if (selectedExamId !== 'all' && sub.examId !== selectedExamId) return false;

      // 5. Date check
      if (dateFilter) {
        const subDate = sub.submittedAt ? sub.submittedAt.split('T')[0] : '';
        if (subDate !== dateFilter) return false;
      }

      // 6. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const studentMatch = sub.studentName?.toLowerCase().includes(q) || false;
        const codeMatch = sub.studentCode?.toLowerCase().includes(q) || false;
        const examMatch = sub.examTitle?.toLowerCase().includes(q) || false;
        if (!studentMatch && !codeMatch && !examMatch) return false;
      }

      return true;
    });
  }, [
    submissions,
    minScore,
    maxScore,
    selectedClassId,
    role,
    selectedSchoolId,
    selectedExamId,
    dateFilter,
    searchQuery,
    classMap,
  ]);

  // Keep selected IDs in sync with matching submissions unless user specifically toggled items
  const currentSelectedIds = useMemo(() => {
    if (!hasUserModifiedSelection) {
      return matchingSubmissions.map((s) => s.id);
    }
    // Only keep IDs that still exist in the current matchingSubmissions
    const matchingIds = new Set(matchingSubmissions.map((s) => s.id));
    return selectedSubmissionIds.filter((id) => matchingIds.has(id));
  }, [matchingSubmissions, hasUserModifiedSelection, selectedSubmissionIds]);

  // Unique students count
  const affectedUniqueStudentsCount = useMemo(() => {
    const selectedSet = new Set(currentSelectedIds);
    const studentIds = new Set<string>();
    matchingSubmissions.forEach((s) => {
      if (selectedSet.has(s.id)) {
        studentIds.add(s.studentId);
      }
    });
    return studentIds.size;
  }, [currentSelectedIds, matchingSubmissions]);

  // Stats of matching group
  const groupStats = useMemo(() => {
    if (matchingSubmissions.length === 0) return { avg: 0, min: 0, max: 0 };
    const scores = matchingSubmissions.map((s) => s.score);
    const sum = scores.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round(sum / scores.length),
      min: Math.min(...scores),
      max: Math.max(...scores),
    };
  }, [matchingSubmissions]);

  // Toggle selection handlers
  const handleToggleSelectAll = (checked: boolean) => {
    setHasUserModifiedSelection(true);
    if (checked) {
      setSelectedSubmissionIds(matchingSubmissions.map((s) => s.id));
    } else {
      setSelectedSubmissionIds([]);
    }
  };

  const handleToggleSingle = (id: string) => {
    setHasUserModifiedSelection(true);
    if (currentSelectedIds.includes(id)) {
      setSelectedSubmissionIds(currentSelectedIds.filter((i) => i !== id));
    } else {
      setSelectedSubmissionIds([...currentSelectedIds, id]);
    }
  };

  // Execute bulk deletion
  const handleExecuteDelete = async () => {
    if (currentSelectedIds.length === 0) return;
    setIsDeleting(true);
    try {
      const deletedCount = await deleteMultipleExamSubmissions(currentSelectedIds);
      onDeleteSuccess(deletedCount, affectedUniqueStudentsCount);
      onClose();
    } catch (error) {
      console.error('Error deleting submissions by score range:', error);
      alert('Có lỗi xảy ra khi xóa bài thi. Vui lòng thử lại!');
    } finally {
      setIsDeleting(false);
      setIsConfirmStep(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* ================= MODAL HEADER ================= */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-xs border border-white/20">
              <Sliders className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                <span>Xóa Bài Thi Theo Khoảng Điểm</span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-white/20 text-white tracking-wider uppercase">
                  Xóa hàng loạt
                </span>
              </h3>
              <p className="text-xs text-rose-100 mt-0.5">
                Lọc theo điểm số (0 - 1000đ) để xóa hàng loạt bài thi của nhiều học sinh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer text-white"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================= MODAL BODY ================= */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">

          {/* SECTION 1: CẤU HÌNH KHOẢNG ĐIỂM (SCORE RANGE) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-rose-600" />
                <span>1. Chọn Khoảng Điểm Cần Xóa (Thang 1000 điểm)</span>
              </span>
              <span className="text-xs font-semibold text-rose-600 font-mono bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                Khoảng chọn: {minScore}đ ➔ {maxScore}đ
              </span>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Phím chọn nhanh khoảng điểm phổ biến:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyPreset(0, 499)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    minScore === 0 && maxScore === 499
                      ? 'bg-red-600 text-white border-red-600 shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-red-50 hover:text-red-700 border-slate-200'
                  }`}
                >
                  🔴 Điểm Liệt (&lt; 500đ)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(0, 949)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    minScore === 0 && maxScore === 949
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-700 border-slate-200'
                  }`}
                >
                  🟠 Chưa Đạt (&lt; 950đ)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(500, 799)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    minScore === 500 && maxScore === 799
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-amber-50 hover:text-amber-700 border-slate-200'
                  }`}
                >
                  🟡 Trung Bình (500 - 799đ)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(800, 949)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    minScore === 800 && maxScore === 949
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-700 border-slate-200'
                  }`}
                >
                  🔵 Khá - Cận Đạt (800 - 949đ)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(950, 1000)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    minScore === 950 && maxScore === 1000
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border-slate-200'
                  }`}
                >
                  🟢 Đạt Chuẩn (≥ 950đ)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(0, 1000)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    minScore === 0 && maxScore === 1000
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  ⚪ Tất Cả (0 - 1000đ)
                </button>
              </div>
            </div>

            {/* Direct Inputs for Min and Max Score */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Điểm Tối Thiểu (Min Score)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={maxScore}
                    value={minScore}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(1000, Number(e.target.value) || 0));
                      setMinScore(val);
                      if (val > maxScore) setMaxScore(val);
                      setHasUserModifiedSelection(false);
                    }}
                    className="w-full px-3.5 py-2 text-sm font-bold font-mono rounded-xl border border-slate-300 focus:border-rose-600 focus:outline-none bg-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    / 1000đ
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Điểm Tối Đa (Max Score)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={minScore}
                    max={1000}
                    value={maxScore}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(1000, Number(e.target.value) || 0));
                      setMaxScore(val);
                      if (val < minScore) setMinScore(val);
                      setHasUserModifiedSelection(false);
                    }}
                    className="w-full px-3.5 py-2 text-sm font-bold font-mono rounded-xl border border-slate-300 focus:border-rose-600 focus:outline-none bg-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    / 1000đ
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: BỘ LỌC PHẠM VI (LỚP HỌC, ĐỀ THI, NGÀY THI, TÌM KIẾM) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Filter className="w-4 h-4 text-indigo-600" />
              <span>2. Thu Hẹp Phạm Vi Xóa (Tùy chọn)</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Trường học (chỉ hiển thị cho Admin) */}
              {role === 'admin' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Cơ sở Trường</label>
                  <select
                    value={selectedSchoolId}
                    onChange={(e) => {
                      setSelectedSchoolId(e.target.value);
                      setSelectedClassId('all');
                      setHasUserModifiedSelection(false);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none bg-white"
                  >
                    <option value="all">Tất cả các Trường ({schools.length})</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Lớp học */}
              <div className={role === 'admin' ? '' : 'sm:col-span-1'}>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Lớp Học</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setHasUserModifiedSelection(false);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none bg-white"
                >
                  <option value="all">Tất cả các Lớp ({filteredClasses.length})</option>
                  {filteredClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Đề thi */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Đề Thi</label>
                <select
                  value={selectedExamId}
                  onChange={(e) => {
                    setSelectedExamId(e.target.value);
                    setHasUserModifiedSelection(false);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none bg-white"
                >
                  <option value="all">Tất cả Đề thi ({exams.length})</option>
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.title}</option>
                  ))}
                </select>
              </div>

              {/* Ngày thi */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Ngày Thi Cụ Thể</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => {
                      setDateFilter(e.target.value);
                      setHasUserModifiedSelection(false);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none bg-white"
                  />
                  {dateFilter && (
                    <button
                      type="button"
                      onClick={() => setDateFilter('')}
                      className="px-2 py-2 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                      title="Xóa lọc ngày"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Tìm kiếm tên / SBD */}
              <div className={role === 'admin' ? 'sm:col-span-2 lg:col-span-4' : 'sm:col-span-2'}>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setHasUserModifiedSelection(false);
                    }}
                    placeholder="Tìm kiếm theo họ tên học sinh, số báo danh, tên đề thi..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: XEM TRƯỚC VÀ CHỌN BÀI THI CẦN XÓA */}
          <div className="space-y-3">
            {/* KPI Summary Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-xs">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Bài thi khớp lọc</span>
                  <div className="text-xl sm:text-2xl font-black font-mono text-rose-400">
                    {matchingSubmissions.length} <span className="text-xs font-normal text-slate-300">bài nộp</span>
                  </div>
                </div>

                <div className="h-8 w-px bg-slate-700 hidden sm:block" />

                <div>
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Thí sinh ảnh hưởng</span>
                  <div className="text-xl sm:text-2xl font-black font-mono text-amber-300">
                    {affectedUniqueStudentsCount} <span className="text-xs font-normal text-slate-300">học sinh</span>
                  </div>
                </div>

                <div className="h-8 w-px bg-slate-700 hidden sm:block" />

                <div className="hidden md:block">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Điểm trung bình nhóm</span>
                  <div className="text-base font-bold font-mono text-emerald-400">
                    {groupStats.avg}/1000đ <span className="text-xs font-normal text-slate-400">({groupStats.min}đ - {groupStats.max}đ)</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold">
                  Đã chọn: {currentSelectedIds.length}/{matchingSubmissions.length} bài
                </span>
              </div>
            </div>

            {/* Table of matching submissions with individual checkboxes */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 text-center w-10">
                        <input
                          type="checkbox"
                          checked={
                            matchingSubmissions.length > 0 &&
                            currentSelectedIds.length === matchingSubmissions.length
                          }
                          onChange={(e) => handleToggleSelectAll(e.target.checked)}
                          className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer align-middle"
                          title="Chọn tất cả bài thi khớp"
                        />
                      </th>
                      <th className="py-2.5 px-2 text-center w-10">STT</th>
                      <th className="py-2.5 px-3">Thí Sinh & SBD</th>
                      <th className="py-2.5 px-3">Lớp Học</th>
                      <th className="py-2.5 px-3">Đề Thi & Lần Thi</th>
                      <th className="py-2.5 px-3 text-center">Điểm Số</th>
                      <th className="py-2.5 px-3">Thời Gian Nộp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matchingSubmissions.map((sub, idx) => {
                      const isChecked = currentSelectedIds.includes(sub.id);
                      const cls = classMap.get(sub.classId);

                      return (
                        <tr
                          key={sub.id}
                          onClick={() => handleToggleSingle(sub.id)}
                          className={`transition-colors cursor-pointer select-none ${
                            isChecked ? 'bg-rose-50/50 hover:bg-rose-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSingle(sub.id)}
                              className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer align-middle"
                            />
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900 block">{sub.studentName}</span>
                            <span className="text-[10px] font-mono text-slate-500">SBD: {sub.studentCode}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-slate-800 font-medium">{cls?.name || 'Chưa phân lớp'}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-900 block max-w-[220px] truncate" title={sub.examTitle}>
                              {sub.examTitle}
                            </span>
                            <span className="text-[10px] font-mono text-indigo-600 font-bold">Lần #{sub.attemptNumber}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-black inline-block ${
                                sub.isPassed
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {sub.score}/1000đ
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                            {new Date(sub.submittedAt).toLocaleTimeString('vi-VN')}{' '}
                            {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                          </td>
                        </tr>
                      );
                    })}

                    {matchingSubmissions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                          <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                          <p className="text-xs font-semibold text-slate-500">
                            Không tìm thấy bài thi nào trong khoảng điểm {minScore}đ - {maxScore}đ với bộ lọc hiện tại.
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Vui lòng điều chỉnh lại khoảng điểm hoặc chọn đề thi/lớp học khác.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* WARNING BANNER */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 text-xs leading-relaxed">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Lưu ý quan trọng:</strong> Hành động xóa bài thi hàng loạt theo khoảng điểm sẽ gỡ bỏ vĩnh viễn dữ liệu kết quả thi, lịch sử bài làm của các học sinh được chọn. Thao tác này <strong>không thể hoàn tác</strong>. Sau khi xóa, học sinh có thể làm lại bài nếu đề thi đang mở.
            </div>
          </div>

        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 font-medium">
            {currentSelectedIds.length > 0 ? (
              <span>
                Chuẩn bị xóa: <strong className="text-rose-600 font-bold font-mono">{currentSelectedIds.length}</strong> bài thi của <strong className="text-slate-900 font-bold font-mono">{affectedUniqueStudentsCount}</strong> học sinh
              </span>
            ) : (
              <span className="text-slate-400">Chưa có bài thi nào được chọn để xóa</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isDeleting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
            >
              Hủy Bỏ
            </button>

            {!isConfirmStep ? (
              <button
                type="button"
                disabled={currentSelectedIds.length === 0 || isDeleting}
                onClick={() => setIsConfirmStep(true)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Tiếp Tục Xóa ({currentSelectedIds.length} Bài)</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 animate-in fade-in">
                <button
                  type="button"
                  onClick={() => setIsConfirmStep(false)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleExecuteDelete}
                  className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang xóa {currentSelectedIds.length} bài...</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      <span>XÁC NHẬN XÓA VĨNH VIỄN</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
