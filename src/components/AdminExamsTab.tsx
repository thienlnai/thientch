import React, { useState, useMemo } from 'react';
import {
  Exam,
  SchoolClass,
  School,
  UserAccount,
  ExamSubmission,
  ExamQuestion,
  QuestionType
} from '../types/index.ts';
import {
  FileText,
  Plus,
  Trash2,
  Edit2,
  Search,
  CheckCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  Printer,
  Layers,
  Sparkles,
  Shuffle,
  Play,
  RotateCcw,
  Check,
  X,
  Clock,
  Award,
  BookOpen,
  Users,
  GraduationCap,
  Filter,
  CheckSquare,
  Square,
  RefreshCw,
  Sliders,
  FileCheck2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Video as VideoIcon,
  HelpCircle,
  Info,
  Database
} from 'lucide-react';
import {
  addExam,
  updateExam,
  deleteExam,
  deleteMultipleExams,
  mergeExams
} from '../services/dbService.ts';
import { ExamEditorModal } from './ExamEditorModal.tsx';
import { ExamTakingModal } from './ExamTakingModal.tsx';
import { HotspotCanvas } from './HotspotCanvas.tsx';
import { QuestionBankModal } from './QuestionBankModal.tsx';
import { Pagination } from './Pagination.tsx';
import { 
  formatGradeLabel, 
  extractGradeNumber 
} from '../utils/studentHelper.ts';

interface AdminExamsTabProps {
  exams: Exam[];
  classes: SchoolClass[];
  schools: School[];
  users: UserAccount[];
  currentUser: UserAccount;
  submissions: ExamSubmission[];
  onViewSubmissionsForExam: (examId: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
  initialTeacherFilter?: string;
}

export const AdminExamsTab: React.FC<AdminExamsTabProps> = ({
  exams,
  classes,
  schools,
  users,
  currentUser,
  submissions,
  onViewSubmissionsForExam,
  showToast,
  initialTeacherFilter = 'all'
}) => {
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [teacherFilter, setTeacherFilter] = useState<string>(initialTeacherFilter);
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'hidden'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'standard' | 'practice'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Bulk Selection
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);

  // Modals state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);

  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
  const [isDeletingExam, setIsDeletingExam] = useState(false);

  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const [examToTest, setExamToTest] = useState<Exam | null>(null);
  const [examToViewQuestions, setExamToViewQuestions] = useState<Exam | null>(null);

  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
  const [mergeNewTitle, setMergeNewTitle] = useState('');
  const [mergeDuration, setMergeDuration] = useState<number>(60);
  const [mergeTargetClassIds, setMergeTargetClassIds] = useState<string[]>([]);
  const [isMerging, setIsMerging] = useState(false);

  const [examToPrint, setExamToPrint] = useState<Exam | null>(null);
  const [printIncludeAnswers, setPrintIncludeAnswers] = useState(false);

<<<<<<< HEAD
  // Question Bank Modal for Admin (browse & delete from DB)
  const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);

=======
>>>>>>> b0df5fc278d0b4675a1c33dc3bb15a73ea48c8b8
  // Helper mappings
  const classMap = useMemo(() => {
    const map = new Map<string, SchoolClass>();
    classes.forEach((c) => map.set(c.id, c));
    return map;
  }, [classes]);

  const teacherUsers = useMemo(() => {
    return users.filter((u) => u.role === 'teacher');
  }, [users]);

  // Count submissions per exam
  const examSubmissionsCountMap = useMemo(() => {
    const map = new Map<string, number>();
    submissions.forEach((s) => {
      map.set(s.examId, (map.get(s.examId) || 0) + 1);
    });
    return map;
  }, [submissions]);

  // Unique subjects across all exams
  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((e) => {
      if (e.subject) set.add(e.subject.trim());
    });
    return Array.from(set);
  }, [exams]);

  // Filtered exams
  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      // 1. Giáo viên biên soạn
      if (teacherFilter !== 'all') {
        const matchCreator = exam.creatorId === teacherFilter || exam.creatorName === teacherFilter;
        if (!matchCreator) return false;
      }
      // 2. Môn học
      if (subjectFilter !== 'all') {
        if (exam.subject !== subjectFilter) return false;
      }
      // 3. Trạng thái
      if (statusFilter !== 'all') {
        if (exam.status !== statusFilter) return false;
      }
      // 4. Dạng đề (Chuẩn / Thi thử)
      if (typeFilter === 'standard' && exam.isPracticeTest) return false;
      if (typeFilter === 'practice' && !exam.isPracticeTest) return false;
      // 5. Lớp phân bổ
      if (classFilter !== 'all') {
        if (!exam.classIds || !exam.classIds.includes(classFilter)) return false;
      }
      // 6. Khối lớp
      if (gradeFilter !== 'all') {
        const filterNum = extractGradeNumber(gradeFilter);
        const examGrades = exam.targetGrades && exam.targetGrades.length > 0 
          ? exam.targetGrades 
          : (exam.grade ? [exam.grade] : []);
        const isAll = examGrades.some((g) => g.toLowerCase() === 'all' || g.toLowerCase().includes('tất cả') || g.toLowerCase().includes('tat ca'));
        if (!isAll) {
          const matched = examGrades.some((g) => extractGradeNumber(g) === filterNum);
          if (!matched) return false;
        }
      }
      // 7. Tìm kiếm
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = exam.title?.toLowerCase().includes(q);
        const matchDesc = exam.description?.toLowerCase().includes(q);
        const matchTeacher = exam.creatorName?.toLowerCase().includes(q);
        const matchSubj = exam.subject?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchTeacher && !matchSubj) return false;
      }
      return true;
    });
  }, [
    exams,
    teacherFilter,
    subjectFilter,
    statusFilter,
    typeFilter,
    classFilter,
    gradeFilter,
    searchQuery
  ]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredExams.length / 10));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedExams = useMemo(() => {
    const start = (safeCurrentPage - 1) * 10;
    return filteredExams.slice(start, start + 10);
  }, [filteredExams, safeCurrentPage]);

  // KPIs
  const kpis = useMemo(() => {
    const total = exams.length;
    const published = exams.filter((e) => e.status === 'published').length;
    const hidden = exams.filter((e) => e.status === 'hidden').length;
    const practice = exams.filter((e) => e.isPracticeTest).length;
    const totalQuestions = exams.reduce((acc, e) => acc + (e.questions?.length || e.totalQuestions || 0), 0);
    return { total, published, hidden, practice, totalQuestions };
  }, [exams]);

  // Checkbox Selection
  const isAllSelected = paginatedExams.length > 0 && paginatedExams.every((e) => selectedExamIds.includes(e.id));
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedExamIds((prev) => prev.filter((id) => !paginatedExams.some((e) => e.id === id)));
    } else {
      const pageIds = paginatedExams.map((e) => e.id);
      setSelectedExamIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedExamIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Actions
  const handleOpenCreateExam = () => {
    setEditingExam(null);
    setIsEditorOpen(true);
  };

  const handleOpenEditExam = (exam: Exam) => {
    setEditingExam(exam);
    setIsEditorOpen(true);
  };

  const handleSaveExamFromModal = async (examData: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (editingExam) {
        await updateExam(editingExam.id, examData);
        showToast(`Đã cập nhật đề thi "${examData.title}" thành công!`);
      } else {
        await addExam(examData);
        showToast(`Đã tạo mới đề thi "${examData.title}" thành công!`);
      }
      setIsEditorOpen(false);
      setEditingExam(null);
    } catch {
      showToast('Có lỗi xảy ra khi lưu đề thi. Vui lòng thử lại!', 'error');
    }
  };

  // 1-Click Toggle status (published <-> hidden)
  const handleToggleStatus = async (exam: Exam) => {
    const newStatus: 'published' | 'hidden' = exam.status === 'published' ? 'hidden' : 'published';
    try {
      await updateExam(exam.id, { status: newStatus });
      showToast(
        newStatus === 'published'
          ? `Đã mở đề thi "${exam.title}" cho học sinh tham gia!`
          : `Đã tạm ẩn đề thi "${exam.title}" khỏi danh sách thi!`
      );
    } catch {
      showToast('Không thể thay đổi trạng thái đề thi.', 'error');
    }
  };

  // Bulk status update
  const handleBulkSetStatus = async (targetStatus: 'published' | 'hidden') => {
    if (selectedExamIds.length === 0) return;
    try {
      await Promise.all(selectedExamIds.map((id) => updateExam(id, { status: targetStatus })));
      showToast(
        targetStatus === 'published'
          ? `Đã mở cho thi ${selectedExamIds.length} đề thi đã chọn!`
          : `Đã tạm ẩn ${selectedExamIds.length} đề thi đã chọn!`
      );
      setSelectedExamIds([]);
    } catch {
      showToast('Có lỗi xảy ra khi cập nhật trạng thái hàng loạt.', 'error');
    }
  };

  // Clone / Duplicate Exam
  const handleCloneExam = async (exam: Exam) => {
    try {
      const clonedTitle = `[Bản sao] ${exam.title}`;
      await addExam({
        title: clonedTitle,
        description: exam.description ? `(Bản sao) ${exam.description}` : undefined,
        subject: exam.subject,
        grade: exam.grade || 'Khối 12',
        targetGrades: exam.targetGrades ? [...exam.targetGrades] : (exam.grade ? [exam.grade] : []),
        creatorId: currentUser.id,
        creatorName: currentUser.fullName || currentUser.username,
        classIds: exam.classIds ? [...exam.classIds] : [],
        durationMinutes: exam.durationMinutes,
        totalScore: 1000,
        passingScore: 950,
        status: 'hidden', // Mặc định bản sao để tạm ẩn để admin rà soát
        allowReviewAnswers: exam.allowReviewAnswers,
        isPracticeTest: exam.isPracticeTest,
        practiceRandomCount: exam.practiceRandomCount,
        questions: exam.questions ? JSON.parse(JSON.stringify(exam.questions)) : [],
      });
      showToast(`Đã nhân bản đề thi thành "${clonedTitle}" thành công!`);
    } catch {
      showToast('Có lỗi xảy ra khi nhân bản đề thi.', 'error');
    }
  };

  // Delete Single Exam
  const handleConfirmDeleteExam = async () => {
    if (!examToDelete) return;
    setIsDeletingExam(true);
    try {
      const title = examToDelete.title;
      await deleteExam(examToDelete.id);
      showToast(`Đã xóa đề thi "${title}" khỏi hệ thống!`);
      setSelectedExamIds((prev) => prev.filter((id) => id !== examToDelete.id));
      setExamToDelete(null);
    } catch {
      showToast('Có lỗi khi xóa đề thi. Vui lòng thử lại!', 'error');
    } finally {
      setIsDeletingExam(false);
    }
  };

  // Delete Bulk Exams
  const handleConfirmBulkDeleteExams = async () => {
    if (selectedExamIds.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const count = await deleteMultipleExams(selectedExamIds);
      showToast(`Đã xóa vĩnh viễn ${count} đề thi đã chọn thành công!`);
      setSelectedExamIds([]);
      setIsBulkDeleteOpen(false);
    } catch {
      showToast('Có lỗi khi xóa hàng loạt đề thi.', 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Open Merge Modal
  const handleOpenMergeModal = () => {
    if (selectedExamIds.length >= 2) {
      setMergeSelectedIds([...selectedExamIds]);
    } else {
      setMergeSelectedIds(exams.slice(0, 2).map((e) => e.id));
    }
    setMergeNewTitle('Đề Thi Tổng Hợp Khảo Thí IT - Quản Trị Hệ Thống');
    setMergeDuration(60);
    setMergeTargetClassIds(classes.map((c) => c.id));
    setIsMergeModalOpen(true);
  };

  // Confirm Merge Exams
  const handleConfirmMergeExams = async () => {
    if (mergeSelectedIds.length < 2) {
      showToast('Vui lòng chọn ít nhất 2 đề thi để gộp!', 'error');
      return;
    }
    if (!mergeNewTitle.trim()) {
      showToast('Vui lòng nhập tên cho đề thi gộp!', 'error');
      return;
    }
    setIsMerging(true);
    try {
      const sourceExams = exams.filter((e) => mergeSelectedIds.includes(e.id));
      await mergeExams(
        sourceExams,
        mergeNewTitle.trim(),
        Number(mergeDuration) || 60,
        currentUser.id,
        currentUser.fullName || currentUser.username,
        mergeTargetClassIds,
        false,
        0
      );
      showToast(`Đã gộp thành công ${sourceExams.length} đề thi thành "${mergeNewTitle}"!`);
      setIsMergeModalOpen(false);
      setMergeSelectedIds([]);
    } catch {
      showToast('Không thể gộp đề thi. Vui lòng thử lại!', 'error');
    } finally {
      setIsMerging(false);
    }
  };

  // Helper print
  const handlePrintExam = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* ================= HEADER BAR ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Quản Lý Đề Thi Do Giáo Viên Tạo Ra</span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {exams.length} đề thi
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Toàn quyền quản trị: duyệt đề, chỉnh sửa câu hỏi, mở/ẩn đề thi, nhân bản, làm thử nghiệm, gộp đề và xóa đề thi của tất cả giáo viên trong hệ thống
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {selectedExamIds.length > 0 && (
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleBulkSetStatus('published')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 hover:bg-white transition-all flex items-center gap-1 cursor-pointer"
                title="Mở tất cả đề đã chọn cho học sinh thi"
              >
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mở thi ({selectedExamIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleBulkSetStatus('hidden')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-700 hover:bg-white transition-all flex items-center gap-1 cursor-pointer"
                title="Tạm ẩn tất cả đề đã chọn"
              >
                <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                <span>Tạm ẩn</span>
              </button>
              <button
                type="button"
                onClick={() => setIsBulkDeleteOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 hover:bg-red-50 transition-all flex items-center gap-1 cursor-pointer"
                title="Xóa vĩnh viễn các đề đã chọn"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                <span>Xóa</span>
              </button>
            </div>
          )}

          <button
            type="button"
<<<<<<< HEAD
            onClick={() => setIsQuestionBankOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Xem ngân hàng câu hỏi & Quản lý/Xóa câu hỏi khỏi Database"
          >
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>Ngân Hàng Câu Hỏi</span>
          </button>

          <button
            type="button"
=======
>>>>>>> b0df5fc278d0b4675a1c33dc3bb15a73ea48c8b8
            onClick={handleOpenMergeModal}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Gộp từ 2 đề thi trở lên thành đề thi tổng hợp lớn"
          >
            <Layers className="w-4 h-4 text-purple-600" />
            <span>Gộp Đề Thi</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateExam}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo Đề Thi Mới</span>
          </button>
        </div>
      </div>

      {/* ================= 5 KPI CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Tổng số đề */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng Số Đề Thi</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-slate-900 font-mono">{kpis.total}</h3>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              Toàn hệ thống
            </span>
          </div>
        </div>

        {/* Card 2: Đề đang mở thi */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đang Mở Cho Thi</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-emerald-700 font-mono">{kpis.published}</h3>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              Học sinh thấy
            </span>
          </div>
        </div>

        {/* Card 3: Đề đang ẩn */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đang Tạm Ẩn</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <EyeOff className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-amber-700 font-mono">{kpis.hidden}</h3>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              Đang biên soạn
            </span>
          </div>
        </div>

        {/* Card 4: Đề thi thử */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đề Thi Thử (Bốc ngẫu nhiên)</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Shuffle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-purple-700 font-mono">{kpis.practice}</h3>
            <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
              Tự luyện tập
            </span>
          </div>
        </div>

        {/* Card 5: Tổng số câu hỏi */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng Ngân Hàng Câu</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-indigo-700 font-mono">{kpis.totalQuestions}</h3>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
              Câu hỏi khảo thí
            </span>
          </div>
        </div>
      </div>

      {/* ================= FILTER & SEARCH BAR ================= */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên đề, giáo viên, môn..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* Teacher Filter */}
          <div>
            <select
              value={teacherFilter}
              onChange={(e) => {
                setTeacherFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none font-medium"
            >
              <option value="all">👨‍🏫 Tất cả giáo viên biên soạn</option>
              {teacherUsers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName || t.username} (@{t.username})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none font-medium"
            >
              <option value="all">🔘 Tất cả trạng thái (Ẩn & Hiện)</option>
              <option value="published">🟢 Đang mở cho thi (Published)</option>
              <option value="hidden">🟡 Đang tạm ẩn (Hidden)</option>
            </select>
          </div>

          {/* Subject Filter */}
          <div>
            <select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none font-medium"
            >
              <option value="all">📚 Tất cả môn học</option>
              {uniqueSubjects.map((sub) => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Secondary filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
          <div>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none font-medium"
            >
              <option value="all">🎯 Tất cả dạng đề (Chính thức & Thi thử)</option>
              <option value="standard">📄 Đề thi chính thức (Cố định câu hỏi)</option>
              <option value="practice">🎲 Đề thi thử ngẫu nhiên (Bốc ngẫu nhiên)</option>
            </select>
          </div>

          <div>
            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none font-medium"
            >
              <option value="all">🏫 Tất cả lớp được phân bổ ({classes.length} lớp)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>

          {/* Lọc Khối Lớp */}
          <div>
            <select
              value={gradeFilter}
              onChange={(e) => {
                setGradeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none font-medium"
              title="Lọc đề thi theo khối lớp"
            >
              <option value="all">🎓 Tất cả khối lớp</option>
              <option value="Khối 6">Khối 6</option>
              <option value="Khối 7">Khối 7</option>
              <option value="Khối 8">Khối 8</option>
              <option value="Khối 9">Khối 9</option>
              <option value="Khối 10">Khối 10</option>
              <option value="Khối 11">Khối 11</option>
              <option value="Khối 12">Khối 12</option>
            </select>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            <span className="text-xs text-slate-500 font-mono">
              Hiển thị: <strong>{filteredExams.length}</strong> / {exams.length} đề thi
            </span>
            {(searchQuery || teacherFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all' || subjectFilter !== 'all' || classFilter !== 'all' || gradeFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTeacherFilter('all');
                  setStatusFilter('all');
                  setTypeFilter('all');
                  setSubjectFilter('all');
                  setClassFilter('all');
                  setGradeFilter('all');
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================= MAIN EXAMS TABLE ================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="py-3 px-3 text-center w-12">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="p-1 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                    title={isAllSelected ? 'Bỏ chọn trang này' : 'Chọn tất cả trang này'}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-2 text-center w-12">STT</th>
                <th className="py-3 px-4 min-w-[240px]">Tên Đề Thi & Thông Tin</th>
                <th className="py-3 px-4 min-w-[160px]">Giáo Viên Biên Soạn</th>
                <th className="py-3 px-3 min-w-[120px]">Môn / Khối</th>
                <th className="py-3 px-3 min-w-[140px]">Lớp Phân Bổ</th>
                <th className="py-3 px-3 text-center min-w-[110px]">Thời Gian & Câu</th>
                <th className="py-3 px-3 text-center min-w-[100px]">Lượt Nộp Bài</th>
                <th className="py-3 px-3 text-center min-w-[120px]">Trạng Thái</th>
                <th className="py-3 px-4 text-right min-w-[220px]">Thao Tác Quản Trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedExams.map((exam, index) => {
                const isSelected = selectedExamIds.includes(exam.id);
                const questionCount = exam.questions?.length || exam.totalQuestions || 0;
                const submissionCount = examSubmissionsCountMap.get(exam.id) || 0;

                // Assigned class names
                const assignedClassNames = (exam.classIds || [])
                  .map((cid) => classMap.get(cid)?.name)
                  .filter(Boolean);

                return (
                  <tr
                    key={exam.id}
                    className={`hover:bg-blue-50/40 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : ''
                    }`}
                  >
                    {/* 1. Checkbox */}
                    <td className="py-3.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleSelectOne(exam.id)}
                        className="p-1 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </button>
                    </td>

                    {/* 2. STT */}
                    <td className="py-3.5 px-2 text-center font-mono font-bold text-slate-500">
                      {(safeCurrentPage - 1) * 10 + index + 1}
                    </td>

                    {/* 3. Tên Đề Thi */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-sm hover:text-blue-600 transition-colors cursor-pointer"
                        onClick={() => setExamToViewQuestions(exam)}
                      >
                        {exam.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {exam.isPracticeTest ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <Shuffle className="w-3 h-3 text-purple-600" />
                            Thi thử ngẫu nhiên ({exam.practiceRandomCount || 10}/{questionCount} câu)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            Đề chính thức
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 font-mono">
                          ID: {exam.id}
                        </span>
                      </div>
                      {exam.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 italic">
                          {exam.description}
                        </p>
                      )}
                    </td>

                    {/* 4. Giáo Viên Biên Soạn */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                          {(exam.creatorName || 'GV').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-xs truncate">
                            {exam.creatorName || 'Chưa định danh'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            @{exam.creatorId || 'admin'}
                          </div>
                        </div>
                      </div>
                      {exam.createdAt && (
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(exam.createdAt).toLocaleDateString('vi-VN')}</span>
                        </div>
                      )}
                    </td>

                    {/* 5. Môn / Khối */}
                    <td className="py-3.5 px-3">
                      <div className="font-semibold text-slate-800 text-xs">
                        {exam.subject || 'Công nghệ Thông tin'}
                      </div>
                      <span className="inline-block px-2 py-0.5 mt-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {formatGradeLabel(exam.grade || (exam.targetGrades && exam.targetGrades.length > 0 ? exam.targetGrades.join(', ') : 'Tất cả khối'))}
                      </span>
                    </td>

                    {/* 6. Lớp Phân Bổ */}
                    <td className="py-3.5 px-3">
                      {assignedClassNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {assignedClassNames.slice(0, 2).map((cname, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                            >
                              {cname}
                            </span>
                          ))}
                          {assignedClassNames.length > 2 && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600"
                              title={assignedClassNames.join(', ')}
                            >
                              +{assignedClassNames.length - 2} lớp
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Chưa giao lớp</span>
                      )}
                    </td>

                    {/* 7. Thời Gian & Câu Hỏi */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="font-mono font-bold text-slate-900 text-xs">
                        {exam.durationMinutes} phút
                      </div>
                      <div className="text-[11px] font-semibold text-indigo-600 mt-0.5">
                        {questionCount} câu hỏi
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Chuẩn: 950/1000đ
                      </div>
                    </td>

                    {/* 8. Lượt Nộp Bài */}
                    <td className="py-3.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onViewSubmissionsForExam(exam.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono transition-all cursor-pointer ${
                          submissionCount > 0
                            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                        title="Bấm để xem danh sách bài làm của đề thi này"
                      >
                        {submissionCount} bài thi →
                      </button>
                    </td>

                    {/* 9. Trạng Thái (Clickable Toggle) */}
                    <td className="py-3.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(exam)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 border shadow-2xs ${
                          exam.status === 'published'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                        }`}
                        title="Bấm để chuyển đổi Ẩn / Mở đề thi tức thì"
                      >
                        {exam.status === 'published' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Đang Mở</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                            <span>Tạm Ẩn</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* 10. Thao Tác Quản Trị */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {/* Xem trước câu hỏi */}
                        <button
                          type="button"
                          onClick={() => setExamToViewQuestions(exam)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                          title="Xem chi tiết ngân hàng câu hỏi & đáp án mẫu"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Làm thử đề thi (Test Exam) */}
                        <button
                          type="button"
                          onClick={() => setExamToTest(exam)}
                          className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 transition-colors cursor-pointer"
                          title="Làm thử đề thi (Chế độ quản trị viên kiểm thử)"
                        >
                          <Play className="w-4 h-4" />
                        </button>

                        {/* Chỉnh sửa đề thi */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditExam(exam)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
                          title="Chỉnh sửa đề thi, câu hỏi và cấu hình"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Nhân bản đề thi */}
                        <button
                          type="button"
                          onClick={() => handleCloneExam(exam)}
                          className="p-1.5 rounded-lg hover:bg-purple-50 text-slate-600 hover:text-purple-600 transition-colors cursor-pointer"
                          title="Tạo bản sao (nhân bản) đề thi"
                        >
                          <Copy className="w-4 h-4" />
                        </button>

                        {/* In đề thi */}
                        <button
                          type="button"
                          onClick={() => setExamToPrint(exam)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                          title="In đề thi ra giấy A4 hoặc PDF"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {/* Xóa đề thi */}
                        <button
                          type="button"
                          onClick={() => setExamToDelete(exam)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-600 hover:text-red-600 transition-colors cursor-pointer"
                          title="Xóa đề thi này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {paginatedExams.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">
                      Không tìm thấy đề thi nào phù hợp với bộ lọc hiện tại.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Hãy thử đổi từ khóa tìm kiếm hoặc chọn giáo viên khác.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredExams.length > 0 && (
          <div className="p-4 border-t border-slate-200">
            <Pagination
              currentPage={safeCurrentPage}
              totalItems={filteredExams.length}
              pageSize={10}
              onPageChange={setCurrentPage}
              itemName="đề thi"
            />
          </div>
        )}
      </div>

      {/* ================= MODAL: TẠO / SỬA ĐỀ THI (EXAM EDITOR MODAL) ================= */}
      {isEditorOpen && (
        <ExamEditorModal
          initialExam={editingExam}
          assignedClasses={classes} // Admin có toàn quyền gán cho bất kỳ lớp nào
          teacherId={editingExam ? editingExam.creatorId : currentUser.id}
          teacherName={editingExam ? editingExam.creatorName : (currentUser.fullName || currentUser.username)}
          onSave={handleSaveExamFromModal}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingExam(null);
          }}
        />
      )}

      {/* ================= MODAL: LÀM THỬ ĐỀ THI (TEST EXAM TAKING MODAL) ================= */}
      {examToTest && (
        <ExamTakingModal
          exam={examToTest}
          currentUser={currentUser}
          isTeacherTesting={true}
          onClose={() => setExamToTest(null)}
          onSubmitSuccess={(_submission) => {
            showToast('Đã hoàn thành lượt làm thử nghiệm đề thi với vai trò Quản trị viên!');
            setExamToTest(null);
          }}
        />
      )}

      {/* ================= MODAL: XEM CHI TIẾT NGÂN HÀNG CÂU HỎI & ĐÁP ÁN ================= */}
      {examToViewQuestions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <span>Ngân Hàng Câu Hỏi: {examToViewQuestions.title}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white">
                      {examToViewQuestions.questions?.length || 0} câu
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Giáo viên biên soạn: {examToViewQuestions.creatorName} • Môn: {examToViewQuestions.subject} • Thời gian: {examToViewQuestions.durationMinutes} phút
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExamToViewQuestions(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Questions list body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {examToViewQuestions.questions && examToViewQuestions.questions.length > 0 ? (
                examToViewQuestions.questions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {q.type === 'single_choice'
                            ? 'Chọn 1 đáp án'
                            : q.type === 'multiple_choice'
                            ? 'Chọn nhiều đáp án'
                            : q.type === 'matching'
                            ? 'Ghép đôi'
                            : q.type === 'ordering'
                            ? 'Sắp xếp thứ tự'
                            : q.type === 'true_false'
                            ? 'Đúng / Sai'
                            : q.type === 'hotspot'
                            ? 'Chọn trên ảnh (Hotspot)'
                            : 'Điền chỗ trống'}
                        </span>
                      </div>
                    </div>

                    {/* Question Title */}
                    <p className="font-bold text-slate-900 text-sm leading-relaxed">
                      {q.title}
                    </p>

                    {/* Image / Video Media */}
                    {q.mediaType === 'image' && q.mediaUrl && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 max-w-md">
                        <img src={q.mediaUrl} alt="Hình minh họa" className="w-full object-cover max-h-64" />
                      </div>
                    )}
                    {q.mediaType === 'video' && q.mediaUrl && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 max-w-md">
                        <video src={q.mediaUrl} controls className="w-full max-h-64" />
                      </div>
                    )}

                    {/* Details by question type */}
                    {/* Single choice */}
                    {q.type === 'single_choice' && q.options && (
                      <div className="space-y-1.5 pt-1">
                        {q.options.map((opt) => {
                          const isCorrect = opt.id === q.correctOptionId;
                          return (
                            <div
                              key={opt.id}
                              className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {isCorrect ? '✓' : ''}
                              </span>
                              <span>{opt.text}</span>
                              {isCorrect && (
                                <span className="ml-auto text-[10px] font-bold text-emerald-700 uppercase">
                                  Đáp án đúng
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Multiple choice */}
                    {q.type === 'multiple_choice' && q.options && (
                      <div className="space-y-1.5 pt-1">
                        {q.options.map((opt) => {
                          const isCorrect = q.correctOptionIds?.includes(opt.id);
                          return (
                            <div
                              key={opt.id}
                              className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                                isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {isCorrect ? '✓' : ''}
                              </span>
                              <span>{opt.text}</span>
                              {isCorrect && (
                                <span className="ml-auto text-[10px] font-bold text-emerald-700 uppercase">
                                  Đáp án đúng
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Matching pairs */}
                    {q.type === 'matching' && q.matchingPairs && (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">Các cặp ghép chuẩn:</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.matchingPairs.map((pair, pIdx) => (
                            <div key={pIdx} className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">{pair.leftText}</span>
                              <span className="text-slate-400 font-bold">⇄</span>
                              <span className="font-bold text-emerald-700">{pair.rightText}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ordering */}
                    {q.type === 'ordering' && q.orderingItems && (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">Thứ tự đúng:</div>
                        {q.orderingItems.map((item, oIdx) => (
                          <div key={oIdx} className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                              {oIdx + 1}
                            </span>
                            <span className="font-medium text-slate-900">{item.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* True / False */}
                    {q.type === 'true_false' && q.tfStatements && (
                      <div className="space-y-1.5 pt-1">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500">
                              <th className="py-1 text-left">Khẳng định</th>
                              <th className="py-1 text-right w-24">Đáp án</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {q.tfStatements.map((tf, tfIdx) => (
                              <tr key={tfIdx}>
                                <td className="py-2 text-slate-800">{tf.statement}</td>
                                <td className="py-2 text-right">
                                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                    tf.isTrue ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                    {tf.isTrue ? (q.trueLabel || 'Đúng') : (q.falseLabel || 'Sai')}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Hotspot */}
                    {q.type === 'hotspot' && q.hotspotImageUrl && (
                      <div className="space-y-2 pt-1">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">Vùng đúng trên ảnh (Hotspot Region):</div>
                        <div className="max-w-md border border-slate-200 rounded-xl overflow-hidden">
                          <HotspotCanvas
                            imageUrl={q.hotspotImageUrl}
                            regions={q.hotspotRegions || []}
                            isReview={true}
                          />
                        </div>
                      </div>
                    )}

                    {/* Fill blank */}
                    {q.type === 'fill_blank' && (
                      <div className="space-y-2 pt-1 text-xs">
                        <div className="p-3 bg-white rounded-xl border border-slate-200 font-mono text-slate-800">
                          {q.fillBlankTemplate}
                        </div>
                        {q.fillBlankItems && q.fillBlankItems.length > 0 && (
                          <div className="space-y-1">
                            {q.fillBlankItems.map((item, bIdx) => (
                              <div key={bIdx} className="flex items-center gap-2">
                                <span className="font-mono font-bold text-indigo-600">{item.placeholderCode}:</span>
                                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  {item.correctAnswer}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Explanation */}
                    {q.explanation && (
                      <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold">Giải thích đáp án: </strong>
                          <span>{q.explanation}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm font-semibold">Đề thi này chưa có câu hỏi nào.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500 font-mono">
                Tổng cộng: {examToViewQuestions.questions?.length || 0} câu hỏi khảo thí
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = examToViewQuestions;
                    setExamToViewQuestions(null);
                    handleOpenEditExam(target);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Sửa Đề Này</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExamToViewQuestions(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÓA 1 ĐỀ THI ================= */}
      {examToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-red-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-white" />
                <span>Xác Nhận Xóa Đề Thi Của Giáo Viên</span>
              </h3>
              <button
                type="button"
                onClick={() => setExamToDelete(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                <div className="text-slate-500">Đề thi cần xóa:</div>
                <div className="text-sm font-bold text-slate-900">{examToDelete.title}</div>
                <div className="text-slate-600">
                  Giáo viên: <strong>{examToDelete.creatorName}</strong> • {examToDelete.questions?.length || examToDelete.totalQuestions || 0} câu hỏi
                </div>
              </div>

              <p className="text-slate-600 leading-relaxed">
                Bạn có chắc chắn muốn xóa vĩnh viễn đề thi này khỏi hệ thống cơ sở dữ liệu? Toàn bộ các câu hỏi liên kết trong đề cũng sẽ bị xóa. Thao tác này không thể hoàn tác!
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setExamToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isDeletingExam}
                  onClick={handleConfirmDeleteExam}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isDeletingExam ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Xác Nhận Xóa Đề Thi</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÓA HÀNG LOẠT ĐỀ THI ================= */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-red-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-white" />
                <span>Xóa {selectedExamIds.length} Đề Thi Đã Chọn?</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsBulkDeleteOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Bạn đang chọn xóa đồng loạt <strong>{selectedExamIds.length}</strong> đề thi do các giáo viên biên soạn. Tất cả câu hỏi và nội dung trong các đề này sẽ bị xóa khỏi cơ sở dữ liệu Turso.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isBulkDeleting}
                  onClick={handleConfirmBulkDeleteExams}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isBulkDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Xác Nhận Xóa Hết ({selectedExamIds.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: GỘP NHIỀU ĐỀ THI (MERGE EXAMS) ================= */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-purple-700 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-white" />
                <h3 className="font-bold text-base">Gộp Nhiều Đề Thi Thành Đề Tổng Hợp</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMergeModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block font-bold text-slate-800 mb-1">Tên đề thi gộp mới *</label>
                <input
                  type="text"
                  value={mergeNewTitle}
                  onChange={(e) => setMergeNewTitle(e.target.value)}
                  placeholder="Ví dụ: Đề Thi Tổng Hợp Khảo Thí Kỳ 1..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-purple-600 focus:outline-none text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Thời gian làm bài (Phút) *</label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={mergeDuration}
                    onChange={(e) => setMergeDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-purple-600 focus:outline-none text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Người phụ trách</label>
                  <input
                    type="text"
                    disabled
                    value={`${currentUser.fullName || currentUser.username} (Quản trị viên)`}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Chọn các đề thi nguồn cần gộp (Chọn ít nhất 2 đề):
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50">
                  {exams.map((ex) => {
                    const isChecked = mergeSelectedIds.includes(ex.id);
                    return (
                      <label
                        key={ex.id}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          isChecked ? 'bg-purple-100 text-purple-900 font-bold' : 'hover:bg-white text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setMergeSelectedIds((prev) =>
                                prev.includes(ex.id) ? prev.filter((id) => id !== ex.id) : [...prev, ex.id]
                              );
                            }}
                            className="rounded text-purple-600 focus:ring-purple-500"
                          />
                          <span className="truncate">{ex.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0 font-mono ml-2">
                          {ex.questions?.length || ex.totalQuestions || 0} câu • {ex.creatorName}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Lớp được phép thi</label>
                <div className="flex flex-wrap gap-1.5">
                  {classes.map((cls) => {
                    const isSel = mergeTargetClassIds.includes(cls.id);
                    return (
                      <button
                        type="button"
                        key={cls.id}
                        onClick={() => {
                          setMergeTargetClassIds((prev) =>
                            prev.includes(cls.id) ? prev.filter((id) => id !== cls.id) : [...prev, cls.id]
                          );
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                          isSel
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {cls.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsMergeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={isMerging || mergeSelectedIds.length < 2 || !mergeNewTitle.trim()}
                onClick={handleConfirmMergeExams}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isMerging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                <span>Tiến Hành Gộp ({mergeSelectedIds.length} Đề)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: IN ẤN / XUẤT ĐỀ THI RA GIẤY A4 (PRINT PREVIEW) ================= */}
      {examToPrint && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-3xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Header controls (Không in) */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base">Xem Trước Bản In Đề Thi Chuẩn A4</h3>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer text-slate-300 hover:text-white">
                  <input
                    type="checkbox"
                    checked={printIncludeAnswers}
                    onChange={(e) => setPrintIncludeAnswers(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>In kèm đáp án mẫu (Cho cán bộ chấm)</span>
                </label>
                <button
                  type="button"
                  onClick={handlePrintExam}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>In Ngay</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExamToPrint(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Content (Standard A4 Format) */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 text-slate-900 font-serif bg-white" id="printable-exam">
              {/* Header trường và đề */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                <div className="text-left text-xs uppercase font-sans">
                  <p className="font-bold">HỆ THỐNG KHẢO THÍ TRỰC TUYẾN THIENTCH</p>
                  <p>BAN QUẢN TRỊ & ĐÀO TẠO KHẢO THÍ IT</p>
                </div>
                <div className="text-right text-xs uppercase font-sans">
                  <p className="font-bold">BÀI THI KHẢO THÍ CHUẨN HÓA</p>
                  <p>MÔN THI: {examToPrint.subject?.toUpperCase() || 'CÔNG NGHỆ THÔNG TIN'}</p>
                </div>
              </div>

              {/* Thông tin thí sinh */}
              <div className="text-center font-sans space-y-1">
                <h2 className="text-lg font-black uppercase text-slate-900 tracking-wide">
                  {examToPrint.title}
                </h2>
                <p className="text-xs text-slate-600 italic">
                  Thời gian làm bài: {examToPrint.durationMinutes} phút (Không kể thời gian phát đề) • Điểm tối đa: 1000 điểm
                </p>
                <div className="grid grid-cols-2 gap-4 pt-3 text-xs text-left border-y border-dashed border-slate-300 py-2">
                  <p>Họ và tên thí sinh: ............................................................................</p>
                  <p>Số báo danh: ....................................... Lớp: .........................</p>
                </div>
              </div>

              {/* Danh sách câu hỏi in */}
              <div className="space-y-4 pt-2 font-sans text-xs">
                {examToPrint.questions && examToPrint.questions.length > 0 ? (
                  examToPrint.questions.map((q, idx) => (
                    <div key={idx} className="space-y-1.5 pb-3 border-b border-slate-100">
                      <div className="font-bold text-slate-900">
                        Câu {idx + 1}: {q.title}
                      </div>

                      {q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-3">
                          {q.options.map((opt, optIdx) => {
                            const isCorrect = q.type === 'single_choice'
                              ? opt.id === q.correctOptionId
                              : q.correctOptionIds?.includes(opt.id);
                            return (
                              <div
                                key={opt.id}
                                className={`text-xs ${
                                  printIncludeAnswers && isCorrect ? 'font-bold text-emerald-800' : 'text-slate-800'
                                }`}
                              >
                                <span>{String.fromCharCode(65 + optIdx)}. </span>
                                <span>{opt.text}</span>
                                {printIncludeAnswers && isCorrect && <span> (ĐÚNG)</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {printIncludeAnswers && q.explanation && (
                        <p className="text-[11px] text-slate-600 italic pl-3 pt-0.5">
                          * Giải thích: {q.explanation}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-center italic text-slate-400">Chưa có câu hỏi.</p>
                )}
              </div>

              <div className="text-center text-xs font-sans italic text-slate-500 pt-4 border-t border-slate-300">
                --- HẾT ---
              </div>
            </div>
          </div>
        </div>
      )}

<<<<<<< HEAD
      {/* ================= MODAL NGÂN HÀNG CÂU HỎI (QUYỀN ADMIN - QUẢN LÝ & XÓA CƠ SỞ DỮ LIỆU) ================= */}
      <QuestionBankModal
        isOpen={isQuestionBankOpen}
        onClose={() => setIsQuestionBankOpen(false)}
        isAdmin={true}
      />

=======
>>>>>>> b0df5fc278d0b4675a1c33dc3bb15a73ea48c8b8
    </div>
  );
};
