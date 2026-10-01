import React, { useState, useMemo, useEffect } from 'react';
import { 
  UserAccount, 
  SchoolClass, 
  Student, 
  School, 
  Language, 
  Exam, 
  ExamSubmission, 
  ExamQuestion,
  QuestionType,
  HotspotRegion
} from '../types/index.ts';
import { Sidebar, SidebarMenuItem } from './Sidebar.tsx';
import { TopBar } from './TopBar.tsx';
import { 
  Users, 
  BookOpen, 
  FileText, 
  BarChart3, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  Play, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Search, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  Clock, 
  Award, 
  Copy, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Shuffle, 
  HelpCircle,
  EyeOff,
  Filter,
  Check,
  X,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  ListFilter,
  Sliders,
  Database,
  LayoutGrid,
  List,
  UserCheck,
  GraduationCap,
  School as SchoolIcon
} from 'lucide-react';
import { 
  addStudent, 
  updateStudent, 
  deleteStudent, 
  batchAddStudents,
  addExam,
  updateExam,
  deleteExam,
  mergeExams,
  addExamSubmission,
  deleteExamSubmission,
  deleteMultipleExamSubmissions,
  deleteStudentSubmissions,
  refreshSubmissionsNow,
  checkForNewSubmissions,
  onMissingQuestionsColumn,
  syncAllExamQuestionsToSupabase,
  splitAndMigrateExamQuestionsToSeparateTable
} from '../services/dbService.ts';
import { 
  generateStudentCredentials, 
  parseExcelOrCsvText,
  formatGradeLabel,
  extractGradeNumber
} from '../utils/studentHelper.ts';
import { HotspotCanvas } from './HotspotCanvas.tsx';
import { ExamTakingModal } from './ExamTakingModal.tsx';
import { MultiTableSchemaModal } from './MultiTableSchemaModal.tsx';
import { ExamReviewModal } from './ExamReviewModal.tsx';
import { ExamEditorModal } from './ExamEditorModal.tsx';
import { QuestionBankModal } from './QuestionBankModal.tsx';
import { ScoreRangeDeleteModal } from './ScoreRangeDeleteModal.tsx';
import { Pagination } from './Pagination.tsx';

interface TeacherPortalProps {
  teacher: UserAccount;
  classes: SchoolClass[];
  students: Student[];
  schools: School[];
  exams?: Exam[];
  submissions?: ExamSubmission[];
  onLogout: () => void;
  lang: Language;
}

type TeacherTab = 'classes' | 'exams' | 'grading';

export const TeacherPortal: React.FC<TeacherPortalProps> = ({
  teacher,
  classes,
  students,
  schools,
  exams = [],
  submissions = [],
  onLogout,
  lang,
}) => {
  const [activeTab, setActiveTab] = useState<TeacherTab>('classes');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4500);
  };

  // ================= 1. CHỈ THẤY NHỮNG LỚP ĐƯỢC ADMIN PHÂN CÔNG =================
  const assignedClasses = useMemo(() => {
    const teacherClassIds = new Set(teacher.classIds || []);
    const teacherNameClean = (teacher.fullName || '').trim().toLowerCase();
    const hasExplicitClasses = teacherClassIds.size > 0;
    const teacherSchoolIdSet = new Set<string>();
    if (teacher.schoolId) teacherSchoolIdSet.add(teacher.schoolId);
    if (Array.isArray(teacher.schoolIds)) {
      teacher.schoolIds.forEach((id: string) => teacherSchoolIdSet.add(id));
    }

    return classes.filter(
      (c) =>
        teacherClassIds.has(c.id) ||
        (c.homeroomTeacher && c.homeroomTeacher.trim().toLowerCase() === teacherNameClean) ||
        (!hasExplicitClasses && c.schoolId && teacherSchoolIdSet.has(c.schoolId))
    );
  }, [classes, teacher.classIds, teacher.fullName, teacher.schoolId, teacher.schoolIds]);

  const assignedClassIds = useMemo(
    () => new Set(assignedClasses.map((c) => c.id)),
    [assignedClasses]
  );

  // ================= 1.1. PHÂN NHÓM LỚP HỌC THEO TRƯỜNG ĐƯỢC PHÂN CÔNG =================
  const teacherSchools = useMemo(() => {
    const schoolMap = new Map<string, { school: School | null; classes: SchoolClass[]; studentCount: number }>();

    // 1. Khởi tạo các trường giáo viên được gán trực tiếp qua teacher.schoolId / teacher.schoolIds
    const explicitSchoolIds = new Set<string>();
    if (teacher.schoolId) explicitSchoolIds.add(teacher.schoolId);
    if (Array.isArray(teacher.schoolIds)) {
      teacher.schoolIds.forEach((id: string) => explicitSchoolIds.add(id));
    }
    explicitSchoolIds.forEach((sId) => {
      if (sId && !schoolMap.has(sId)) {
        const found = schools.find((s) => s.id === sId) || null;
        schoolMap.set(sId, { school: found, classes: [], studentCount: 0 });
      }
    });

    // 2. Gom tất cả các lớp của giáo viên vào từng trường tương ứng
    assignedClasses.forEach((cls) => {
      const sId = cls.schoolId || 'unassigned';
      if (!schoolMap.has(sId)) {
        const found = schools.find((s) => s.id === sId) || null;
        schoolMap.set(sId, { school: found, classes: [], studentCount: 0 });
      }
      schoolMap.get(sId)!.classes.push(cls);
    });

    // 3. Đếm sĩ số học sinh cho từng trường
    schoolMap.forEach((entry) => {
      const classIdSet = new Set(entry.classes.map((c) => c.id));
      entry.studentCount = students.filter((s) => s.classId && classIdSet.has(s.classId)).length;
    });

    return Array.from(schoolMap.entries()).map(([sId, entry]) => ({
      schoolId: sId,
      school: entry.school,
      schoolName: entry.school ? entry.school.name : (sId === 'unassigned' ? 'Cơ sở / Trường chưa phân loại' : `Trường (${sId})`),
      schoolCode: entry.school?.code || '',
      classes: entry.classes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
      studentCount: entry.studentCount,
    })).sort((a, b) => b.classes.length - a.classes.length);
  }, [assignedClasses, schools, students, teacher.schoolId, teacher.schoolIds]);

  // Bộ lọc trường học và lớp học trong tab Quản Lý Lớp Học
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('all');
  const [showClassOverviewDrawer, setShowClassOverviewDrawer] = useState<boolean>(false);

  // Danh sách các lớp thuộc trường đang chọn ở Dropdown 1
  const availableClassesForSchool = useMemo(() => {
    if (selectedSchoolId === 'all') return assignedClasses;
    return assignedClasses.filter((c) => c.schoolId === selectedSchoolId);
  }, [assignedClasses, selectedSchoolId]);

  // Bộ lọc lớp đang chọn (Dropdown 2)
  const [selectedClassId, setSelectedClassId] = useState<string>(
    assignedClasses[0]?.id || 'all'
  );

  // Học sinh thuộc các lớp được phân công
  const assignedStudents = useMemo(() => {
    return students.filter((s) => s.classId && assignedClassIds.has(s.classId));
  }, [students, assignedClassIds]);

  // Đề thi của giáo viên này hoặc do GV tạo ra
  const teacherExams = useMemo(() => {
    return exams.filter((e) => e.creatorId === teacher.id || e.creatorId === teacher.username || e.creatorName === teacher.fullName);
  }, [exams, teacher.id, teacher.username, teacher.fullName]);

  // Ngày hôm nay và hôm qua theo định dạng YYYY-MM-DD
  const todayDateStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const yesterdayDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA');
  }, []);

  // Bộ lọc ngày để xem học sinh đã làm bao nhiêu lần của đề đó (Requirement)
  // Mặc định là ngày hôm nay YYYY-MM-DD để giáo viên xem ngay các bài thi nộp trong ngày
  const [selectedStatsDate, setSelectedStatsDate] = useState<string>(() => {
    return new Date().toLocaleDateString('en-CA');
  });
  const [selectedExamFilter, setSelectedExamFilter] = useState<string>('all');
  const [statsClassFilter, setStatsClassFilter] = useState<string>('all');
  const [statsStatusFilter, setStatsStatusFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [statsSearchQuery, setStatsSearchQuery] = useState<string>('');
  const [statsViewMode, setStatsViewMode] = useState<'submissions' | 'byStudent'>('submissions');
  const [studentModalDateFilter, setStudentModalDateFilter] = useState<string>('');

  // Bộ lọc và chế độ xem cho danh sách đề thi (Bảng danh sách / Lưới thẻ)
  const [examViewMode, setExamViewMode] = useState<'table' | 'grid'>('table');
  const [examSearchFilter, setExamSearchFilter] = useState('');
  const [examStatusFilter, setExamStatusFilter] = useState<'all' | 'published' | 'hidden'>('all');
  const [examTypeFilter, setExamTypeFilter] = useState<'all' | 'standard' | 'practice'>('all');
  const [examClassFilter, setExamClassFilter] = useState<string>('all');
  const [examGradeFilter, setExamGradeFilter] = useState<string>('all');
  const [isQuestionBankModalOpen, setIsQuestionBankModalOpen] = useState(false);
  const [isRefreshingSubs, setIsRefreshingSubs] = useState(false);
  const [lastSubRefreshTime, setLastSubRefreshTime] = useState<string>('Vừa xong');

  // Tự động làm mới và kiểm tra bài nộp mới siêu nhẹ (chỉ tốn đúng 1 Row Read) mỗi 20s khi giáo viên theo dõi
  useEffect(() => {
    if (activeTab !== 'classes' && activeTab !== 'grading') return;

    refreshSubmissionsNow()
      .then(() => {
        setLastSubRefreshTime(new Date().toLocaleTimeString('vi-VN'));
      })
      .catch(() => {});

    // Bộ đếm kiểm tra bài nộp mới (chỉ 1 row read duy nhất mỗi chu kỳ)
    const intervalTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      checkForNewSubmissions()
        .then((hasNew) => {
          if (hasNew) {
            setLastSubRefreshTime(new Date().toLocaleTimeString('vi-VN'));
            showToast('Hệ thống vừa cập nhật kết quả bài nộp mới của học sinh!', 'success');
          }
        })
        .catch(() => {});
    }, 20000);

    return () => clearInterval(intervalTimer);
  }, [activeTab]);

  // Pagination states (10 items per page)
  const [studentsPage, setStudentsPage] = useState<number>(1);
  const [examsPage, setExamsPage] = useState<number>(1);
  const [gradingSubsPage, setGradingSubsPage] = useState<number>(1);
  const [gradingStudentsPage, setGradingStudentsPage] = useState<number>(1);
  const [classesPage, setClassesPage] = useState<number>(1);
  const [studentModalSubsPage, setStudentModalSubsPage] = useState<number>(1);

  // Modal Thêm đơn học sinh
  const [isAddSingleStudentModalOpen, setIsAddSingleStudentModalOpen] = useState(false);
  const [singleStudentName, setSingleStudentName] = useState('');
  const [singleStudentDob, setSingleStudentDob] = useState('2008-01-01');
  const [singleStudentGender, setSingleStudentGender] = useState<'male' | 'female'>('male');
  const [singleStudentClassId, setSingleStudentClassId] = useState(assignedClasses[0]?.id || '');
  const [isSavingStudent, setIsSavingStudent] = useState(false);

  // Modal Thêm bằng file Excel
  const [isAddExcelModalOpen, setIsAddExcelModalOpen] = useState(false);
  const [excelClassId, setExcelClassId] = useState(assignedClasses[0]?.id || '');
  const [excelRawText, setExcelRawText] = useState('');
  const [parsedExcelStudents, setParsedExcelStudents] = useState<
    Omit<Student, 'id' | 'createdAt' | 'updatedAt'>[]
  >([]);
  const [isImportingExcel, setIsImportingExcel] = useState(false);

  // Modal Xóa học sinh
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);

  // Modal Xem chi tiết kết quả thi của 1 học sinh
  const [studentToViewResults, setStudentToViewResults] = useState<Student | null>(null);
  const [submissionToReview, setSubmissionToReview] = useState<ExamSubmission | null>(null);

  // Tự động làm mới danh sách bài thi của học sinh khi giáo viên mở modal xem chi tiết kết quả
  useEffect(() => {
    if (studentToViewResults) {
      refreshSubmissionsNow()
        .then(() => {
          setLastSubRefreshTime(new Date().toLocaleTimeString('vi-VN'));
        })
        .catch(() => {});
    }
  }, [studentToViewResults]);

  // Modal Xóa bài thi của học sinh (Dành cho Giáo Viên)
  const [submissionToDelete, setSubmissionToDelete] = useState<ExamSubmission | null>(null);
  const [isDeletingSubmission, setIsDeletingSubmission] = useState(false);
  const [isConfirmingDeleteAllStudentSubs, setIsConfirmingDeleteAllStudentSubs] = useState(false);
  const [isDeletingAllStudentSubs, setIsDeletingAllStudentSubs] = useState(false);
  const [isScoreRangeDeleteOpen, setIsScoreRangeDeleteOpen] = useState(false);

  // Xử lý xác nhận xóa 1 bài thi
  const handleConfirmDeleteSubmission = async () => {
    if (!submissionToDelete) return;
    setIsDeletingSubmission(true);
    try {
      await deleteExamSubmission(submissionToDelete.id);
      showToast(`Đã xóa bài thi của học sinh "${submissionToDelete.studentName}" thành công!`);
      if (submissionToReview && submissionToReview.id === submissionToDelete.id) {
        setSubmissionToReview(null);
      }
      setSubmissionToDelete(null);
    } catch {
      showToast('Có lỗi xảy ra khi xóa bài thi. Vui lòng thử lại!', 'error');
    } finally {
      setIsDeletingSubmission(false);
    }
  };

  // Xử lý xác nhận xóa toàn bộ bài thi của 1 học sinh
  const handleConfirmDeleteAllStudentSubmissions = async () => {
    if (!studentToViewResults) return;
    setIsDeletingAllStudentSubs(true);
    try {
      const count = await deleteStudentSubmissions(studentToViewResults.id, submissions);
      showToast(`Đã xóa toàn bộ ${count} bài thi của học sinh "${studentToViewResults.fullName}"!`);
      setIsConfirmingDeleteAllStudentSubs(false);
      setStudentToViewResults(null);
    } catch {
      showToast('Có lỗi xảy ra khi xóa bài thi của học sinh. Vui lòng thử lại!', 'error');
    } finally {
      setIsDeletingAllStudentSubs(false);
    }
  };


  // Modal Quản lý đề thi (Tạo / Sửa)
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [examTitle, setExamTitle] = useState('');
  const [examSubject, setExamSubject] = useState(teacher.subjects || 'Công nghệ Thông tin');
  const [examDuration, setExamDuration] = useState<number>(45);
  const [examStatus, setExamStatus] = useState<'published' | 'hidden'>('published');
  const [examAllowReview, setExamAllowReview] = useState(true);
  const [examSelectedClassIds, setExamSelectedClassIds] = useState<string[]>([]);
  const [examIsPractice, setExamIsPractice] = useState(false);
  const [examPracticeRandomCount, setExamPracticeRandomCount] = useState<number>(10);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [isSavingExam, setIsSavingExam] = useState(false);

  // Modal Gộp đề thi (Merge Exams)
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSelectedSubject, setMergeSelectedSubject] = useState<string>('all');
  const [mergeSelectedExamIds, setMergeSelectedExamIds] = useState<string[]>([]);
  const [mergeNewTitle, setMergeNewTitle] = useState('');
  const [mergeDuration, setMergeDuration] = useState<number>(60);
  const [isMerging, setIsMerging] = useState(false);

  // Danh sách các môn học có sẵn từ đề thi của giáo viên
  const mergeAvailableSubjects = useMemo(() => {
    const set = new Set<string>();
    teacherExams.forEach((e) => {
      if (e.subject) set.add(e.subject.trim());
    });
    return Array.from(set).filter(Boolean).sort();
  }, [teacherExams]);

  // Danh sách đề thi được lọc theo môn học đã chọn
  const mergeFilteredExams = useMemo(() => {
    if (!mergeSelectedSubject || mergeSelectedSubject === 'all') {
      return teacherExams;
    }
    return teacherExams.filter((e) => e.subject?.trim() === mergeSelectedSubject);
  }, [teacherExams, mergeSelectedSubject]);

  // Modal Xóa đề thi
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);

  // Modal Giáo viên làm thử đề thi (KHÔNG TÍNH THỜI GIAN)
  const [testingExam, setTestingExam] = useState<Exam | null>(null);

  // Trạng thái phát hiện CSDL Turso thiếu cột questions hoặc cần tách bảng
  const [isMissingQuestionsColumn, setIsMissingQuestionsColumn] = useState(false);
  const [isSyncingQuestions, setIsSyncingQuestions] = useState(false);
  const [isSplittingTables, setIsSplittingTables] = useState(false);
  const [isMissingQuestionsModalOpen, setIsMissingQuestionsModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const sqlFixQuestions = `-- =========================================================================
-- KIẾN TRÚC PHÂN TÁCH NHIỀU BẢNG: EXAMS, EXAM_QUESTIONS & CHI TIẾT CÂU HỎI
-- =========================================================================

-- 1. BẢNG CHI TIẾT CÂU HỎI THI (exam_questions)
CREATE TABLE IF NOT EXISTS public.exam_questions (
  id TEXT PRIMARY KEY,
  "examId" TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  "orderIndex" INTEGER DEFAULT 0,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  "mediaType" TEXT DEFAULT 'none',
  "mediaUrl" TEXT,
  explanation TEXT,
  options JSONB,
  "correctOptionId" TEXT,
  "correctOptionIds" JSONB,
  "matchingPairs" JSONB,
  "shuffledRightPairs" JSONB,
  "orderingItems" JSONB,
  "trueLabel" TEXT DEFAULT 'Đúng',
  "falseLabel" TEXT DEFAULT 'Sai',
  "tfStatements" JSONB,
  "shuffledTfColumns" JSONB,
  "hotspotImageUrl" TEXT,
  "hotspotRegions" JSONB,
  "fillBlankTemplate" TEXT,
  "fillBlankItems" JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BẢNG PHƯƠNG ÁN TRẮC NGHIỆM (question_options)
CREATE TABLE IF NOT EXISTS public.question_options (
  id TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  "examId" TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  "orderIndex" INTEGER DEFAULT 0,
  text TEXT NOT NULL,
  "imageUrl" TEXT,
  "isCorrect" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG CÁC CẶP GHÉP ĐÔI (question_matching_pairs)
CREATE TABLE IF NOT EXISTS public.question_matching_pairs (
  id TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  "examId" TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  "orderIndex" INTEGER DEFAULT 0,
  "leftText" TEXT NOT NULL,
  "leftImageUrl" TEXT,
  "rightText" TEXT NOT NULL,
  "rightImageUrl" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BẢNG MỤC SẮP XẾP THỨ TỰ (question_ordering_items)
CREATE TABLE IF NOT EXISTS public.question_ordering_items (
  id TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  "examId" TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  "orderIndex" INTEGER DEFAULT 0,
  text TEXT NOT NULL,
  "imageUrl" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BẢNG MỆNH ĐỀ ĐÚNG / SAI (question_tf_statements)
CREATE TABLE IF NOT EXISTS public.question_tf_statements (
  id TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  "examId" TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  "orderIndex" INTEGER DEFAULT 0,
  statement TEXT NOT NULL,
  "isTrue" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 6. BẢNG VỊ TRÍ ĐIỀN KHUYẾT (question_fill_blank_items)
CREATE TABLE IF NOT EXISTS public.question_fill_blank_items (
  id TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  "examId" TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  "orderIndex" INTEGER DEFAULT 0,
  "placeholderCode" TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  "correctAnswer" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 7. BẢNG VÙNG CHỌN ĐIỂM NÓNG HÌNH ẢNH (question_hotspots)
CREATE TABLE IF NOT EXISTS public.question_hotspots (
  id TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  "examId" TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  x NUMERIC NOT NULL,
  y NUMERIC NOT NULL,
  width NUMERIC NOT NULL,
  height NUMERIC NOT NULL,
  label TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 8. BẢNG NGÂN HÀNG CÂU HỎI (question_bank)
CREATE TABLE IF NOT EXISTS public.question_bank (
  id TEXT PRIMARY KEY,
  "sourceExamId" TEXT,
  "sourceExamTitle" TEXT,
  subject TEXT,
  grade TEXT,
  "creatorId" TEXT,
  "creatorName" TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  "mediaType" TEXT DEFAULT 'none',
  "mediaUrl" TEXT,
  explanation TEXT,
  options JSONB,
  "correctOptionId" TEXT,
  "correctOptionIds" JSONB,
  "matchingPairs" JSONB,
  "shuffledRightPairs" JSONB,
  "orderingItems" JSONB,
  "trueLabel" TEXT DEFAULT 'Đúng',
  "falseLabel" TEXT DEFAULT 'Sai',
  "tfStatements" JSONB,
  "shuffledTfColumns" JSONB,
  "hotspotImageUrl" TEXT,
  "hotspotRegions" JSONB,
  "fillBlankTemplate" TEXT,
  "fillBlankItems" JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- CHỈ MỤC TỐI ƯU HÓA TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON public.exam_questions("examId");
CREATE INDEX IF NOT EXISTS idx_exam_questions_order ON public.exam_questions("examId", "orderIndex");
CREATE INDEX IF NOT EXISTS idx_question_options_q_id ON public.question_options("questionId");
CREATE INDEX IF NOT EXISTS idx_question_options_exam_id ON public.question_options("examId");
CREATE INDEX IF NOT EXISTS idx_matching_pairs_q_id ON public.question_matching_pairs("questionId");
CREATE INDEX IF NOT EXISTS idx_ordering_items_q_id ON public.question_ordering_items("questionId");
CREATE INDEX IF NOT EXISTS idx_tf_statements_q_id ON public.question_tf_statements("questionId");
CREATE INDEX IF NOT EXISTS idx_fill_blank_items_q_id ON public.question_fill_blank_items("questionId");
CREATE INDEX IF NOT EXISTS idx_hotspots_q_id ON public.question_hotspots("questionId");
CREATE INDEX IF NOT EXISTS idx_question_bank_subject ON public.question_bank(subject);
CREATE INDEX IF NOT EXISTS idx_question_bank_type ON public.question_bank(type);
CREATE INDEX IF NOT EXISTS idx_question_bank_created_at ON public.question_bank("createdAt");

-- PHÂN QUYỀN RLS CHO CÁC BẢNG
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_matching_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_ordering_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_tf_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_fill_blank_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_hotspots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on exam_questions" ON public.exam_questions FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all on question_options" ON public.question_options FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all on question_matching_pairs" ON public.question_matching_pairs FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all on question_ordering_items" ON public.question_ordering_items FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all on question_tf_statements" ON public.question_tf_statements FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all on question_fill_blank_items" ON public.question_fill_blank_items FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all on question_hotspots" ON public.question_hotspots FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all on question_bank" ON public.question_bank FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BẬT REALTIME CHO CÁC BẢNG
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_questions;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_options;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_matching_pairs;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_ordering_items;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_tf_statements;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_fill_blank_items;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_hotspots;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_bank;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- CẬP NHẬT CỘT totalQuestions VÀ questionIds TRÊN BẢNG EXAMS
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS "totalQuestions" INTEGER DEFAULT 0;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS "questionIds" JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlFixQuestions);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  useEffect(() => {
    const unsub = onMissingQuestionsColumn((missing) => {
      setIsMissingQuestionsColumn(missing);
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const handleSyncQuestions = async () => {
    setIsSyncingQuestions(true);
    try {
      const res = await syncAllExamQuestionsToSupabase();
      showToast(res.message, res.success ? 'success' : 'error');
    } catch {
      showToast('Lỗi khi đồng bộ câu hỏi. Vui lòng kiểm tra cấu hình Turso!', 'error');
    } finally {
      setIsSyncingQuestions(false);
    }
  };

  const handleSplitAndMigrate = async () => {
    setIsSplittingTables(true);
    try {
      const res = await splitAndMigrateExamQuestionsToSeparateTable();
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) {
        setIsMissingQuestionsModalOpen(false);
      }
    } catch (e: any) {
      showToast('Lỗi khi tách bảng câu hỏi: ' + (e?.message || 'Lỗi kết nối'), 'error');
    } finally {
      setIsSplittingTables(false);
    }
  };

  // Tự động sinh thông tin xem trước cho Thêm đơn
  const previewSingleCreds = useMemo(() => {
    if (!singleStudentName.trim()) return null;
    const targetClass = assignedClasses.find((c) => c.id === singleStudentClassId);
    const className = targetClass ? targetClass.name : '64';
    const existingUsernames = new Set(students.map((s) => s.username.toLowerCase()));
    const existingCodes = new Set(students.map((s) => s.studentCode.toUpperCase()));

    return generateStudentCredentials(
      singleStudentName,
      className,
      existingUsernames,
      existingCodes
    );
  }, [singleStudentName, singleStudentClassId, assignedClasses, students]);

  // Xử lý nộp form Thêm Đơn học sinh
  const handleSaveSingleStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleStudentName.trim() || !singleStudentClassId) {
      showToast('Vui lòng nhập họ tên và chọn lớp học!', 'error');
      return;
    }
    const targetClass = assignedClasses.find((c) => c.id === singleStudentClassId);
    if (!targetClass) return;

    setIsSavingStudent(true);
    try {
      const existingUsernames = new Set(students.map((s) => s.username.toLowerCase()));
      const existingCodes = new Set(students.map((s) => s.studentCode.toUpperCase()));
      const creds = generateStudentCredentials(
        singleStudentName,
        targetClass.name,
        existingUsernames,
        existingCodes
      );

      await addStudent(
        {
          schoolId: targetClass.schoolId,
          classId: singleStudentClassId,
          fullName: singleStudentName.trim(),
          studentCode: creds.studentCode,
          dateOfBirth: singleStudentDob,
          gender: singleStudentGender,
          username: creds.username,
          password: creds.password,
          status: 'active',
          note: `Email: ${creds.email}`,
        },
        teacher.username
      );

      showToast(
        `Đã thêm học sinh thành công! Tên đăng nhập: ${creds.username} • MK: ${creds.password}`
      );
      setIsAddSingleStudentModalOpen(false);
      setSingleStudentName('');
    } catch {
      showToast('Không thể lưu học sinh. Vui lòng thử lại!', 'error');
    } finally {
      setIsSavingStudent(false);
    }
  };

  // Xử lý phân tích Text Excel / CSV
  const handleParseExcel = (text: string) => {
    setExcelRawText(text);
    const targetClass = assignedClasses.find((c) => c.id === excelClassId);
    if (!targetClass) return;

    const list = parseExcelOrCsvText(
      text,
      targetClass.id,
      targetClass.name,
      targetClass.schoolId,
      students
    );
    setParsedExcelStudents(list);
  };

  // Xử lý nộp danh sách Excel
  const handleConfirmImportExcel = async () => {
    if (parsedExcelStudents.length === 0) return;
    setIsImportingExcel(true);
    try {
      const count = await batchAddStudents(parsedExcelStudents);
      showToast(`Đã thêm thành công ${count} học sinh vào lớp từ file Excel!`);
      setIsAddExcelModalOpen(false);
      setExcelRawText('');
      setParsedExcelStudents([]);
    } catch {
      showToast('Lỗi khi thêm danh sách học sinh từ Excel!', 'error');
    } finally {
      setIsImportingExcel(false);
    }
  };

  // Xử lý Xóa học sinh
  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    setIsDeletingStudent(true);
    try {
      await deleteStudent(studentToDelete.id, studentToDelete.fullName, teacher.username);
      showToast(`Đã xóa học sinh "${studentToDelete.fullName}" khỏi lớp học.`);
      setStudentToDelete(null);
    } catch {
      showToast('Không thể xóa học sinh. Vui lòng thử lại!', 'error');
    } finally {
      setIsDeletingStudent(false);
    }
  };

  // ================= 2. QUẢN LÝ ĐỀ THI VỚI 7 DẠNG CÂU HỎI =================
  const handleOpenCreateExam = () => {
    setEditingExamId(null);
    setExamTitle('');
    setExamSubject(teacher.subjects || 'Công nghệ Thông tin');
    setExamDuration(45);
    setExamStatus('published');
    setExamAllowReview(true);
    setExamSelectedClassIds(assignedClasses.map((c) => c.id));
    setExamIsPractice(false);
    setExamPracticeRandomCount(10);
    // Khởi tạo sẵn 1 câu mẫu
    setExamQuestions([
      {
        id: `q_${Date.now()}_1`,
        type: 'single_choice',
        title: 'Bộ nhớ RAM trong máy tính có đặc điểm nào sau đây?',
        mediaType: 'none',
        explanation: 'RAM là bộ nhớ truy xuất ngẫu nhiên và dữ liệu sẽ bị xóa khi mất nguồn điện.',
        options: [
          { id: 'opt_1', text: 'Là bộ nhớ chỉ đọc, không thể ghi dữ liệu' },
          { id: 'opt_2', text: 'Là bộ nhớ khả biến, mất dữ liệu khi mất nguồn điện' },
          { id: 'opt_3', text: 'Là thiết bị lưu trữ dữ liệu vĩnh viễn' },
          { id: 'opt_4', text: 'Là thiết bị xử lý trung tâm của máy tính' },
        ],
        correctOptionId: 'opt_2',
      },
    ]);
    setIsExamModalOpen(true);
  };

  const handleOpenEditExam = (exam: Exam) => {
    setEditingExamId(exam.id);
    setExamTitle(exam.title);
    setExamSubject(exam.subject);
    setExamDuration(exam.durationMinutes);
    setExamStatus(exam.status);
    setExamAllowReview(exam.allowReviewAnswers);
    setExamSelectedClassIds(exam.classIds || []);
    setExamIsPractice(!!exam.isPracticeTest);
    setExamPracticeRandomCount(exam.practiceRandomCount || 10);
    setExamQuestions(exam.questions || []);
    setIsExamModalOpen(true);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTitle.trim()) {
      showToast('Vui lòng nhập tên đề thi!', 'error');
      return;
    }
    if (examQuestions.length === 0) {
      showToast('Đề thi phải có ít nhất 1 câu hỏi!', 'error');
      return;
    }

    setIsSavingExam(true);
    try {
      const examData = {
        title: examTitle.trim(),
        subject: examSubject.trim(),
        grade: 'Khối 12',
        creatorId: teacher.id,
        creatorName: teacher.fullName || teacher.username,
        classIds: examSelectedClassIds,
        durationMinutes: Number(examDuration) || 45,
        totalScore: 1000,    // Luôn luôn 1000 điểm theo yêu cầu
        passingScore: 950,   // Luôn luôn 950 điểm theo yêu cầu
        status: examStatus,
        allowReviewAnswers: examAllowReview,
        isPracticeTest: examIsPractice,
        practiceRandomCount: examIsPractice ? Number(examPracticeRandomCount) : undefined,
        questions: examQuestions,
      };

      if (editingExamId) {
        await updateExam(editingExamId, examData);
        showToast(`Đã cập nhật đề thi "${examTitle}" thành công!`);
      } else {
        await addExam(examData);
        showToast(`Đã tạo mới đề thi "${examTitle}" thành công!`);
      }
      setIsExamModalOpen(false);
    } catch {
      showToast('Không thể lưu đề thi. Vui lòng thử lại!', 'error');
    } finally {
      setIsSavingExam(false);
    }
  };

  // Thêm 1 câu hỏi mới vào đề
  const handleAddQuestionToBuilder = (type: QuestionType) => {
    const newQId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let newQ: ExamQuestion = {
      id: newQId,
      type,
      title: `Câu hỏi dạng ${
        type === 'single_choice'
          ? 'Chọn 1 đáp án'
          : type === 'multiple_choice'
          ? 'Chọn nhiều đáp án'
          : type === 'matching'
          ? 'Ghép đôi'
          : type === 'ordering'
          ? 'Sắp xếp thứ tự'
          : type === 'true_false'
          ? 'Đúng / Sai'
          : type === 'hotspot'
          ? 'Chọn trên hình ảnh (Hotspot)'
          : 'Điền vào chỗ trống'
      }`,
      mediaType: 'none',
      explanation: 'Giải thích chi tiết cho câu hỏi này.',
    };

    switch (type) {
      case 'single_choice':
        newQ.options = [
          { id: 'opt_1', text: 'Đáp án A' },
          { id: 'opt_2', text: 'Đáp án B' },
          { id: 'opt_3', text: 'Đáp án C' },
          { id: 'opt_4', text: 'Đáp án D' },
        ];
        newQ.correctOptionId = 'opt_1';
        break;

      case 'multiple_choice':
        newQ.options = [
          { id: 'opt_1', text: 'Phương án 1 (Đúng)' },
          { id: 'opt_2', text: 'Phương án 2 (Đúng)' },
          { id: 'opt_3', text: 'Phương án 3 (Sai)' },
          { id: 'opt_4', text: 'Phương án 4 (Sai)' },
        ];
        newQ.correctOptionIds = ['opt_1', 'opt_2'];
        break;

      case 'matching':
        newQ.matchingPairs = [
          { id: 'm1', leftText: 'HTML', rightText: 'Ngôn ngữ đánh dấu siêu văn bản' },
          { id: 'm2', leftText: 'CSS', rightText: 'Định dạng và tạo kiểu trang web' },
          { id: 'm3', leftText: 'JavaScript', rightText: 'Ngôn ngữ lập trình xử lý tương tác' },
        ];
        break;

      case 'ordering':
        newQ.orderingItems = [
          { id: 'o1', text: 'Bước 1: Xác định bài toán và phân tích yêu cầu' },
          { id: 'o2', text: 'Bước 2: Thiết kế thuật toán và cấu trúc dữ liệu' },
          { id: 'o3', text: 'Bước 3: Viết mã nguồn chương trình (Coding)' },
          { id: 'o4', text: 'Bước 4: Kiểm thử và gỡ lỗi (Testing & Debugging)' },
        ];
        break;

      case 'true_false':
        newQ.trueLabel = 'Đúng';
        newQ.falseLabel = 'Sai';
        newQ.tfStatements = [
          { id: 'tf1', statement: 'Mỗi địa chỉ IPv4 bao gồm 32 bit nhị phân.', isTrue: true },
          { id: 'tf2', statement: 'Giao thức HTTP có tính bảo mật mã hóa cao hơn HTTPS.', isTrue: false },
          { id: 'tf3', statement: 'Hệ điều hành Linux là phần mềm mã nguồn mở.', isTrue: true },
        ];
        break;

      case 'hotspot':
        newQ.hotspotImageUrl = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80';
        newQ.hotspotRegions = [
          { id: 'reg1', x: 20, y: 25, width: 25, height: 35, label: 'CPU Socket' },
        ];
        break;

      case 'fill_blank':
        newQ.fillBlankTemplate =
          'Trong mô hình mạng OSI, tầng [b1] chịu trách nhiệm định tuyến các gói tin IP, còn tầng [b2] đảm bảo truyền dữ liệu tin cậy giữa hai máy chủ.';
        newQ.fillBlankItems = [
          {
            id: 'fb1',
            placeholderCode: '[b1]',
            options: ['Mạng (Network)', 'Giao vận (Transport)', 'Liên kết dữ liệu (Data Link)'],
            correctAnswer: 'Mạng (Network)',
          },
          {
            id: 'fb2',
            placeholderCode: '[b2]',
            options: ['Giao vận (Transport)', 'Ứng dụng (Application)', 'Vật lý (Physical)'],
            correctAnswer: 'Giao vận (Transport)',
          },
        ];
        break;
    }

    setExamQuestions([...examQuestions, newQ]);
  };

  // Xử lý Gộp đề thi (Merge Exams)
  const handleConfirmMergeExams = async () => {
    if (mergeSelectedExamIds.length < 2) {
      showToast('Vui lòng chọn ít nhất 2 đề thi để gộp!', 'error');
      return;
    }
    if (!mergeNewTitle.trim()) {
      showToast('Vui lòng nhập tên cho đề thi gộp!', 'error');
      return;
    }

    setIsMerging(true);
    try {
      const selectedSourceExams = exams.filter((e) => mergeSelectedExamIds.includes(e.id));
      const targetSubject = mergeSelectedSubject !== 'all' ? mergeSelectedSubject : selectedSourceExams[0]?.subject;
      await mergeExams(
        selectedSourceExams,
        mergeNewTitle.trim(),
        Number(mergeDuration) || 60,
        teacher.id,
        teacher.fullName || teacher.username,
        assignedClasses.map((c) => c.id),
        false,
        0,
        targetSubject
      );
      showToast(`Đã gộp thành công ${selectedSourceExams.length} đề thi thành "${mergeNewTitle}"!`);
      setIsMergeModalOpen(false);
      setMergeSelectedExamIds([]);
      setMergeNewTitle('');
    } catch {
      showToast('Không thể gộp đề thi. Vui lòng thử lại!', 'error');
    } finally {
      setIsMerging(false);
    }
  };

  // Helper kiểm tra một bài thi có nộp vào ngày targetDate không (hỗ trợ YYYY-MM-DD)
  const isMatchingDate = (sub: ExamSubmission, targetDate: string) => {
    if (!targetDate) return true;
    if (sub.dateKey === targetDate) return true;
    if (sub.submittedAt) {
      if (sub.submittedAt.startsWith(targetDate)) return true;
      const localDate = new Date(sub.submittedAt).toLocaleDateString('en-CA');
      if (localDate === targetDate) return true;
      const d = new Date(sub.submittedAt);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        if (`${year}-${month}-${day}` === targetDate) return true;
      }
    }
    return false;
  };

  // Toàn bộ bài thi thuộc phạm vi giáo viên này quản lý (các lớp được phân công hoặc đề do GV tạo)
  const teacherSubmissions = useMemo(() => {
    if (assignedClassIds.size === 0 && teacherExams.length === 0) {
      return submissions;
    }
    const assignedCodes = new Set(assignedStudents.map((s) => s.studentCode?.toLowerCase()).filter(Boolean));
    const assignedNames = new Set(assignedStudents.map((s) => s.fullName?.toLowerCase()).filter(Boolean));
    const teacherExamTitles = new Set(teacherExams.map((e) => e.title?.toLowerCase()).filter(Boolean));

    return submissions.filter((sub) => {
      if (sub.classId && assignedClassIds.has(sub.classId)) return true;
      if (teacherExams.some((e) => e.id === sub.examId)) return true;
      if (sub.examTitle && teacherExamTitles.has(sub.examTitle.toLowerCase())) return true;
      if (assignedStudents.some((s) => s.id === sub.studentId)) return true;
      if (sub.studentCode && assignedCodes.has(sub.studentCode.toLowerCase())) return true;
      if (sub.studentName && assignedNames.has(sub.studentName.toLowerCase())) return true;
      return false;
    });
  }, [submissions, assignedClassIds, teacherExams, assignedStudents]);

  // Danh sách các ngày thực tế có bài thi nộp kèm số lượng bài nộp (sắp xếp mới nhất trước)
  const availableSubmissionDates = useMemo(() => {
    const dateMap = new Map<string, number>();
    teacherSubmissions.forEach((sub) => {
      const key = sub.dateKey || (sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString('en-CA') : '');
      if (key) {
        dateMap.set(key, (dateMap.get(key) || 0) + 1);
      }
    });
    return Array.from(dateMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [teacherSubmissions]);

  // Số lượng bài nộp trong ngày hôm nay
  const todaySubmissionsCount = useMemo(() => {
    return teacherSubmissions.filter((sub) => isMatchingDate(sub, todayDateStr)).length;
  }, [teacherSubmissions, todayDateStr]);

  // Danh sách bài nộp được lọc theo Tab 3 (Xem bài thi theo ngày)
  const filteredGradingSubmissions = useMemo(() => {
    return teacherSubmissions.filter((sub) => {
      // 1. Lọc theo ngày được chọn
      if (selectedStatsDate && !isMatchingDate(sub, selectedStatsDate)) {
        return false;
      }
      // 2. Lọc theo lớp
      if (statsClassFilter !== 'all' && sub.classId !== statsClassFilter) {
        return false;
      }
      // 3. Lọc theo đề thi
      if (selectedExamFilter !== 'all' && sub.examId !== selectedExamFilter) {
        return false;
      }
      // 4. Lọc theo trạng thái đạt / chưa đạt
      if (statsStatusFilter === 'passed' && !sub.isPassed) {
        return false;
      }
      if (statsStatusFilter === 'failed' && sub.isPassed) {
        return false;
      }
      // 5. Tìm kiếm
      if (statsSearchQuery.trim()) {
        const q = statsSearchQuery.toLowerCase();
        const matchName = sub.studentName?.toLowerCase().includes(q);
        const matchCode = sub.studentCode?.toLowerCase().includes(q);
        const matchExam = sub.examTitle?.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchExam) return false;
      }
      return true;
    });
  }, [teacherSubmissions, selectedStatsDate, statsClassFilter, selectedExamFilter, statsStatusFilter, statsSearchQuery]);

  // Thống kê nhanh cho ngày / bộ lọc đang chọn
  const gradingStats = useMemo(() => {
    const total = filteredGradingSubmissions.length;
    const passed = filteredGradingSubmissions.filter((s) => s.isPassed).length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    const avgScore = total > 0 ? Math.round(filteredGradingSubmissions.reduce((acc, cur) => acc + cur.score, 0) / total) : 0;
    const highestScore = total > 0 ? Math.max(...filteredGradingSubmissions.map((s) => s.score)) : 0;
    const uniqueStudents = new Set(filteredGradingSubmissions.map((s) => s.studentId)).size;

    return {
      total,
      passed,
      failed: total - passed,
      passRate,
      avgScore,
      highestScore,
      uniqueStudents,
    };
  }, [filteredGradingSubmissions]);

  // Danh sách bài nộp được gộp theo từng học sinh cho ngày đang chọn
  const studentGroupedSubmissions = useMemo(() => {
    const map = new Map<string, {
      studentId: string;
      studentName: string;
      studentCode: string;
      classId: string;
      className: string;
      submissions: ExamSubmission[];
      bestScore: number;
      isPassed: boolean;
      attemptCount: number;
      totalViolations: number;
      latestSubmission: ExamSubmission;
    }>();

    filteredGradingSubmissions.forEach((sub) => {
      const cls = classes.find((c) => c.id === sub.classId);
      const existing = map.get(sub.studentId);
      if (!existing) {
        map.set(sub.studentId, {
          studentId: sub.studentId,
          studentName: sub.studentName,
          studentCode: sub.studentCode,
          classId: sub.classId,
          className: cls ? cls.name : 'Chưa phân lớp',
          submissions: [sub],
          bestScore: sub.score,
          isPassed: sub.isPassed,
          attemptCount: 1,
          totalViolations: sub.violationCount || 0,
          latestSubmission: sub,
        });
      } else {
        existing.submissions.push(sub);
        existing.attemptCount += 1;
        existing.totalViolations += sub.violationCount || 0;
        if (sub.score > existing.bestScore) {
          existing.bestScore = sub.score;
        }
        if (sub.isPassed) {
          existing.isPassed = true;
        }
        if (new Date(sub.submittedAt).getTime() > new Date(existing.latestSubmission.submittedAt).getTime()) {
          existing.latestSubmission = sub;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.bestScore - a.bestScore);
  }, [filteredGradingSubmissions, classes]);

  // Helper tính toán thống kê bài thi của 1 học sinh theo ngày
  const getStudentExamStats = (studentId: string, examId?: string, targetDate?: string) => {
    const st = students.find((s) => s.id === studentId);
    let studentSubs = submissions.filter((s) => {
      if (s.studentId === studentId) return true;
      if (st?.studentCode && s.studentCode && s.studentCode.trim().toLowerCase() === st.studentCode.trim().toLowerCase()) return true;
      if (st?.fullName && s.studentName && s.studentName.trim().toLowerCase() === st.fullName.trim().toLowerCase() && (!s.classId || s.classId === st.classId)) return true;
      return false;
    });

    // Lọc theo đề thi nếu có (hỗ trợ cả examId và examTitle)
    if (examId && examId !== 'all') {
      const ex = exams?.find((e) => e.id === examId) || teacherExams.find((e) => e.id === examId);
      const targetTitle = ex?.title?.trim().toLowerCase();
      studentSubs = studentSubs.filter((s) => {
        if (s.examId === examId) return true;
        if (targetTitle && s.examTitle && s.examTitle.trim().toLowerCase() === targetTitle) return true;
        return false;
      });
    }

    // Lọc theo ngày
    const dateToFilter = targetDate !== undefined ? targetDate : selectedStatsDate;
    if (dateToFilter) {
      studentSubs = studentSubs.filter((s) => isMatchingDate(s, dateToFilter));
    }

    const count = studentSubs.length;
    const highestScore = count > 0 ? Math.max(...studentSubs.map((s) => s.score)) : 0;
    const latestSub = count > 0 ? studentSubs[0] : null;

    return {
      attemptCount: count,
      highestScore,
      latestSub,
      allSubmissions: studentSubs,
    };
  };

  // Danh sách toàn bộ bài thi của học sinh đang xem trong modal
  const studentModalSubmissions = useMemo(() => {
    if (!studentToViewResults) return [];
    const st = studentToViewResults;
    return submissions.filter((s) => {
      if (s.studentId === st.id) return true;
      if (st.studentCode && s.studentCode && s.studentCode.trim().toLowerCase() === st.studentCode.trim().toLowerCase()) return true;
      if (st.fullName && s.studentName && s.studentName.trim().toLowerCase() === st.fullName.trim().toLowerCase() && (!s.classId || s.classId === st.classId)) return true;
      return false;
    });
  }, [submissions, studentToViewResults]);

  // Danh sách các ngày học sinh này có bài nộp
  const studentModalDates = useMemo(() => {
    const map = new Map<string, number>();
    studentModalSubmissions.forEach((s) => {
      const key = s.dateKey || (s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-CA') : '');
      if (key) map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [studentModalSubmissions]);

  // Bài nộp của học sinh được lọc theo ngày chọn trong modal
  const filteredStudentModalSubmissions = useMemo(() => {
    if (!studentModalDateFilter) return studentModalSubmissions;
    return studentModalSubmissions.filter((s) => isMatchingDate(s, studentModalDateFilter));
  }, [studentModalSubmissions, studentModalDateFilter]);

  // Lọc học sinh theo trường, lớp và ô tìm kiếm
  const filteredStudents = useMemo(() => {
    let list = assignedStudents;
    // 1. Lọc theo trường học đã chọn ở Dropdown 1
    if (selectedSchoolId !== 'all') {
      const schoolClassIdSet = new Set(
        assignedClasses.filter((c) => c.schoolId === selectedSchoolId).map((c) => c.id)
      );
      list = list.filter((s) => s.classId && schoolClassIdSet.has(s.classId));
    }
    // 2. Lọc theo lớp học đã chọn ở Dropdown 2
    if (selectedClassId && selectedClassId !== 'all') {
      list = list.filter((s) => s.classId === selectedClassId);
    }
    // 3. Tìm kiếm theo từ khóa (họ tên, mã HS, tài khoản)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          s.studentCode.toLowerCase().includes(q) ||
          s.username.toLowerCase().includes(q)
      );
    }
    return list;
  }, [assignedStudents, assignedClasses, selectedSchoolId, selectedClassId, searchQuery]);

  // Paginated calculations (10 items per page)
  const totalStudentPages = Math.max(1, Math.ceil(filteredStudents.length / 10));
  const currentStudentsPage = Math.min(studentsPage, totalStudentPages);
  const paginatedStudents = useMemo(() => {
    const start = (currentStudentsPage - 1) * 10;
    return filteredStudents.slice(start, start + 10);
  }, [filteredStudents, currentStudentsPage]);

  // Danh sách đề thi được lọc
  const filteredTeacherExams = useMemo(() => {
    return teacherExams.filter((ex) => {
      // 1. Tìm kiếm
      if (examSearchFilter.trim()) {
        const q = examSearchFilter.toLowerCase();
        const matchTitle = ex.title?.toLowerCase().includes(q);
        const matchCreator = ex.creatorName?.toLowerCase().includes(q);
        const matchSubj = ex.subject?.toLowerCase().includes(q);
        if (!matchTitle && !matchCreator && !matchSubj) return false;
      }
      // 2. Trạng thái
      if (examStatusFilter !== 'all' && ex.status !== examStatusFilter) return false;
      // 3. Dạng đề
      if (examTypeFilter === 'standard' && ex.isPracticeTest) return false;
      if (examTypeFilter === 'practice' && !ex.isPracticeTest) return false;
      // 4. Lớp
      if (examClassFilter !== 'all' && (!ex.classIds || !ex.classIds.includes(examClassFilter))) return false;
      // 5. Khối lớp
      if (examGradeFilter !== 'all') {
        const filterNum = extractGradeNumber(examGradeFilter);
        const examGrades = ex.targetGrades && ex.targetGrades.length > 0 
          ? ex.targetGrades 
          : (ex.grade ? [ex.grade] : []);
        const isAll = examGrades.some((g) => g.toLowerCase() === 'all' || g.toLowerCase().includes('tất cả') || g.toLowerCase().includes('tat ca'));
        if (!isAll) {
          const matched = examGrades.some((g) => {
            const num = extractGradeNumber(g);
            return num === filterNum;
          });
          if (!matched) return false;
        }
      }
      return true;
    });
  }, [teacherExams, examSearchFilter, examStatusFilter, examTypeFilter, examClassFilter, examGradeFilter]);

  const totalExamPages = Math.max(1, Math.ceil(filteredTeacherExams.length / 10));
  const currentExamsPage = Math.min(examsPage, totalExamPages);
  const paginatedExams = useMemo(() => {
    const start = (currentExamsPage - 1) * 10;
    return filteredTeacherExams.slice(start, start + 10);
  }, [filteredTeacherExams, currentExamsPage]);

  const totalGradingSubsPages = Math.max(1, Math.ceil(filteredGradingSubmissions.length / 10));
  const currentGradingSubsPage = Math.min(gradingSubsPage, totalGradingSubsPages);
  const paginatedGradingSubmissions = useMemo(() => {
    const start = (currentGradingSubsPage - 1) * 10;
    return filteredGradingSubmissions.slice(start, start + 10);
  }, [filteredGradingSubmissions, currentGradingSubsPage]);

  const totalGradingStudentsPages = Math.max(1, Math.ceil(studentGroupedSubmissions.length / 10));
  const currentGradingStudentsPage = Math.min(gradingStudentsPage, totalGradingStudentsPages);
  const paginatedStudentGroupedSubmissions = useMemo(() => {
    const start = (currentGradingStudentsPage - 1) * 10;
    return studentGroupedSubmissions.slice(start, start + 10);
  }, [studentGroupedSubmissions, currentGradingStudentsPage]);

  const totalClassPages = Math.max(1, Math.ceil(assignedClasses.length / 10));
  const currentClassesPage = Math.min(classesPage, totalClassPages);
  const paginatedClasses = useMemo(() => {
    const start = (currentClassesPage - 1) * 10;
    return assignedClasses.slice(start, start + 10);
  }, [assignedClasses, currentClassesPage]);

  const totalStudentModalSubsPages = Math.max(1, Math.ceil(filteredStudentModalSubmissions.length / 10));
  const currentStudentModalSubsPage = Math.min(studentModalSubsPage, totalStudentModalSubsPages);
  const paginatedStudentModalSubmissions = useMemo(() => {
    const start = (currentStudentModalSubsPage - 1) * 10;
    return filteredStudentModalSubmissions.slice(start, start + 10);
  }, [filteredStudentModalSubmissions, currentStudentModalSubsPage]);

  const teacherMenuItems: SidebarMenuItem[] = [
    { 
      id: 'classes', 
      label: 'Quản Lý Lớp Học', 
      icon: Users, 
      badge: assignedStudents.length > 0 ? `${assignedStudents.length} HS` : (assignedClasses.length > 0 ? `${assignedClasses.length} lớp` : undefined) 
    },
    { id: 'exams', label: 'Quản Lý Đề Thi', icon: FileText, badge: teacherExams.length },
    { 
      id: 'grading', 
      label: 'Thống Kê Bài Thi', 
      icon: BarChart3, 
      badge: todaySubmissionsCount > 0 ? `${todaySubmissionsCount} hôm nay` : (teacherSubmissions.length > 0 ? teacherSubmissions.length : undefined) 
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row font-sans antialiased text-slate-800">
      
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-3 duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-bold ${
              toastMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : toastMsg.type === 'warning'
                ? 'bg-amber-50 text-amber-950 border-amber-300'
                : 'bg-red-50 text-red-900 border-red-200'
            }`}
          >
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : toastMsg.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      {/* CỘT 1 (BÊN TRÁI - MENU CHỨC NĂNG) */}
      <Sidebar
        menuItems={teacherMenuItems}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as TeacherTab)}
        userRoleName="GIẢNG VIÊN / KHẢO THÍ"
        userName={teacher.fullName || teacher.username}
        userSubtext={`Phụ trách ${assignedClasses.length} lớp học`}
        onLogout={onLogout}
        headerSubtitle="Cổng Giảng Viên & Quản Lý Đề Thi"
        themeColor="purple"
      />

      {/* CỘT 2 (BÊN PHẢI - NỘI DUNG CHÍNH) */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onLogout={onLogout}
          userName={teacher.fullName || teacher.username}
          userRole="teacher"
          lang={lang}
        />

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
          
          {/* CẢNH BÁO NỔI BẬT: TURSO THIẾU CỘT QUESTIONS */}
          {isMissingQuestionsColumn && (
            <div className="p-5 rounded-3xl bg-amber-50 border-2 border-amber-300 text-amber-950 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-in fade-in">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-200/80 border border-amber-300 flex items-center justify-center text-amber-800 shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-amber-900 flex flex-wrap items-center gap-2">
                    <span>CSDL Turso Chưa Có Cột Lưu Câu Hỏi Chi Tiết</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                      Cần chạy lệnh SQL (15 giây)
                    </span>
                  </h4>
                  <p className="text-xs text-amber-800 mt-1 max-w-3xl leading-relaxed">
                    Đề thi của bạn đã được lưu thông tin chung, nhưng bảng <code className="font-mono bg-white px-1.5 py-0.5 rounded text-red-700 font-bold border border-amber-200">exams</code> trên Turso thiếu cột <code className="font-mono bg-white px-1.5 py-0.5 rounded text-indigo-700 font-bold border border-amber-200">questions</code>. Toàn bộ câu hỏi đang được lưu an toàn trong trình duyệt này. Hãy lấy câu lệnh SQL bên cạnh chạy để đồng bộ vĩnh viễn!
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMissingQuestionsModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Lấy Lệnh SQL & Sửa Ngay</span>
                </button>
                <button
                  type="button"
                  onClick={handleSyncQuestions}
                  disabled={isSyncingQuestions}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-700 ${isSyncingQuestions ? 'animate-spin' : ''}`} />
                  <span>{isSyncingQuestions ? 'Đang đồng bộ...' : 'Đồng Bộ Lên CSDL'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Cảnh báo nếu chưa được phân công lớp nào */}
          {assignedClasses.length === 0 && (
            <div className="p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Chưa có lớp học được phân công</h4>
                <p className="text-xs text-amber-800 mt-1">
                  Tài khoản của bạn chưa được Quản trị viên phân công lớp giảng dạy. Vui lòng liên hệ Admin để được gán các lớp phụ trách trước khi quản lý học sinh và đề thi.
                </p>
              </div>
            </div>
          )}

          {/* ================= TAB: QUẢN LÝ LỚP HỌC (GỘP HỌC SINH & LỚP HỌC) ================= */}
          {activeTab === 'classes' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header Box & KPI Summary */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs shrink-0">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <span>Quản Lý Lớp Học</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                        {assignedClasses.length} lớp phụ trách
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Theo dõi danh sách học sinh, cấp tài khoản, tra cứu điểm cao nhất và số lần làm bài theo từng ngày.
                    </p>
                  </div>
                </div>

                {/* KPI Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200/80 text-purple-900 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                    <SchoolIcon className="w-4 h-4 text-purple-600" />
                    <span>{teacherSchools.length} Trường Phụ Trách</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-900 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>{assignedClasses.length} Lớp Giảng Dạy</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span>{assignedStudents.length} Học Sinh</span>
                  </div>
                </div>
              </div>

              {/* KHU VỰC BỘ LỌC (FILTERS - 3 DANH SÁCH THẢ XUỐNG XẾP CẠNH NHAU) */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Dropdown 1: Trường được phân công */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <SchoolIcon className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Trường Được Phân Công</span>
                    </label>
                    <select
                      value={selectedSchoolId}
                      onChange={(e) => {
                        const newSchoolId = e.target.value;
                        setSelectedSchoolId(newSchoolId);
                        setStudentsPage(1);
                        if (newSchoolId !== 'all') {
                          const schoolClasses = assignedClasses.filter((c) => c.schoolId === newSchoolId);
                          if (schoolClasses.length > 0) {
                            if (!schoolClasses.some((c) => c.id === selectedClassId)) {
                              setSelectedClassId(schoolClasses[0].id);
                              setSingleStudentClassId(schoolClasses[0].id);
                              setExcelClassId(schoolClasses[0].id);
                            }
                          } else {
                            setSelectedClassId('all');
                          }
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50/70 hover:bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer shadow-2xs"
                    >
                      <option value="all">🏫 Tất cả các trường phụ trách ({teacherSchools.length} trường)</option>
                      {teacherSchools.map((ts) => (
                        <option key={ts.schoolId} value={ts.schoolId}>
                          🏫 {ts.schoolName} ({ts.classes.length} lớp • {ts.studentCount} HS)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dropdown 2: Lớp được phân công (Dữ liệu phụ thuộc vào Trường đã chọn) */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Lớp Được Phân Công</span>
                    </label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => {
                        const newClassId = e.target.value;
                        setSelectedClassId(newClassId);
                        setStudentsPage(1);
                        if (newClassId && newClassId !== 'all') {
                          setSingleStudentClassId(newClassId);
                          setExcelClassId(newClassId);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50/70 hover:bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer shadow-2xs"
                    >
                      <option value="all">👥 Tất cả các lớp ({availableClassesForSchool.length} lớp)</option>
                      {availableClassesForSchool.map((c) => {
                        const count = students.filter((s) => s.classId === c.id).length;
                        return (
                          <option key={c.id} value={c.id}>
                            Lớp {c.name} ({c.code}) • {count} học sinh
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Dropdown 3: Lọc Theo Đề Thi */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Lọc Theo Đề Thi</span>
                    </label>
                    <select
                      value={selectedExamFilter}
                      onChange={(e) => {
                        setSelectedExamFilter(e.target.value);
                        setStudentsPage(1);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50/70 hover:bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer shadow-2xs"
                    >
                      <option value="all">📝 -- Tất cả đề thi ({teacherExams.length} đề) --</option>
                      {teacherExams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          📝 {ex.title} {ex.isPracticeTest ? '(Luyện tập)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sub-bar: Bộ lọc Ngày Thống Kê & Trạng Thái */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Ngày thống kê:</span>
                    </span>

                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setSelectedStatsDate(todayDateStr)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          selectedStatsDate === todayDateStr
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Hôm nay
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStatsDate(yesterdayDateStr)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          selectedStatsDate === yesterdayDateStr
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Hôm qua
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStatsDate('')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          !selectedStatsDate
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Tất cả các ngày
                      </button>
                    </div>

                    <input
                      type="date"
                      value={selectedStatsDate}
                      onChange={(e) => setSelectedStatsDate(e.target.value)}
                      className="px-2.5 py-1 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 text-xs">
                      Đang hiển thị: <strong className="text-slate-900 font-bold">{filteredStudents.length}</strong> học sinh
                      {selectedClassId !== 'all' && (
                        <span> thuộc <strong className="text-indigo-600 font-bold">{assignedClasses.find((c) => c.id === selectedClassId)?.name}</strong></span>
                      )}
                    </span>

                    <button
                      type="button"
                      onClick={async () => {
                        setIsRefreshingSubs(true);
                        try {
                          await refreshSubmissionsNow(true);
                          setLastSubRefreshTime(new Date().toLocaleTimeString('vi-VN'));
                          showToast('Đã làm mới dữ liệu bài nộp mới nhất!', 'success');
                        } catch {
                          showToast('Lỗi khi làm mới dữ liệu bài thi', 'error');
                        } finally {
                          setIsRefreshingSubs(false);
                        }
                      }}
                      disabled={isRefreshingSubs}
                      className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 shadow-2xs"
                      title={`Bấm để tải ngay kết quả nộp bài mới nhất từ CSDL. Cập nhật lần cuối: ${lastSubRefreshTime}`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSubs ? 'animate-spin text-indigo-600' : ''}`} />
                      <span>{isRefreshingSubs ? 'Đang tải...' : 'Làm Mới Điểm'}</span>
                      <span className="text-[10px] text-indigo-500 font-normal hidden sm:inline">({lastSubRefreshTime})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowClassOverviewDrawer(!showClassOverviewDrawer)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>{showClassOverviewDrawer ? 'Ẩn cơ sở trường' : 'Xem cơ sở trường & GVCN'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* DRAWER MỞ RỘNG: XEM THÔNG TIN CƠ SỞ TRƯỜNG & PHÒNG HỌC / GVCN */}
              {showClassOverviewDrawer && (
                <div className="bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-slate-50 p-5 rounded-3xl border border-indigo-100 shadow-2xs space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-sm text-indigo-950 flex items-center gap-2">
                      <SchoolIcon className="w-4 h-4 text-indigo-600" />
                      <span>Danh Sách Trường Học & Phân Bổ Các Lớp Phụ Trách</span>
                    </h4>
                    <span className="text-[11px] font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-full border border-indigo-200">
                      {teacherSchools.length} trường • {assignedClasses.length} lớp
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {teacherSchools.map((ts, idx) => (
                      <div
                        key={ts.schoolId}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          selectedSchoolId === ts.schoolId
                            ? 'bg-white border-indigo-500 ring-2 ring-indigo-200 shadow-xs'
                            : 'bg-white/80 border-slate-200 hover:bg-white hover:border-indigo-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5 truncate">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-mono text-[10px] flex items-center justify-center font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <span className="truncate">{ts.schoolName}</span>
                          </span>
                          <span className="text-[10px] font-bold text-indigo-700 font-mono bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">
                            {ts.classes.length} lớp
                          </span>
                        </div>

                        <div className="mt-2.5 space-y-1.5">
                          <div className="text-[11px] text-slate-500">
                            Sĩ số: <strong className="text-emerald-700 font-bold">{ts.studentCount} học sinh</strong>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {ts.classes.map((cls) => (
                              <button
                                key={cls.id}
                                type="button"
                                onClick={() => {
                                  setSelectedSchoolId(ts.schoolId);
                                  setSelectedClassId(cls.id);
                                  setStudentsPage(1);
                                }}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                                  selectedClassId === cls.id
                                    ? 'bg-indigo-600 text-white shadow-2xs'
                                    : 'bg-slate-100 hover:bg-indigo-100 text-slate-700'
                                }`}
                              >
                                {cls.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* KHU VỰC THAO TÁC (ACTION BUTTONS - ĐẶT PHÍA TRÊN BẢNG, BÊN PHẢI) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                {/* Tiêu đề & Ô tìm kiếm nhanh */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                      <Users className="w-4 h-4" />
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">
                      Danh Sách Học Sinh ({filteredStudents.length})
                    </h4>
                  </div>

                  {/* Thanh tìm kiếm trực tiếp trong bảng */}
                  <div className="relative min-w-[200px] sm:min-w-[260px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Tìm kiếm họ tên, SBD, username..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                {/* 2 Nút Thao tác nổi bật */}
                <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                  {/* Nút 1: Thêm học sinh (Thêm đơn lẻ) */}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedClassId && selectedClassId !== 'all') {
                        setSingleStudentClassId(selectedClassId);
                      }
                      setIsAddSingleStudentModalOpen(true);
                    }}
                    disabled={assignedClasses.length === 0}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
                    title="Thêm từng học sinh đơn lẻ vào lớp đang chọn"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Học Sinh</span>
                  </button>

                  {/* Nút 2: Thêm bằng File Excel (Có icon Excel dễ nhận diện) */}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedClassId && selectedClassId !== 'all') {
                        setExcelClassId(selectedClassId);
                      }
                      setIsAddExcelModalOpen(true);
                    }}
                    disabled={assignedClasses.length === 0}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
                    title="Nhập danh sách học sinh hàng loạt từ bảng tính Excel / CSV"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                    <span>Thêm Bằng File Excel</span>
                  </button>
                </div>
              </div>

              {/* KHU VỰC BẢNG DỮ LIỆU (DATA TABLE - CHIẾM PHẦN LỚN DIỆN TÍCH) */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase text-[11px] tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4 text-center w-12">STT</th>
                        <th className="py-3.5 px-4">Họ và Tên</th>
                        <th className="py-3.5 px-3">Tên Đăng Nhập</th>
                        <th className="py-3.5 px-3">Mật Khẩu</th>
                        <th className="py-3.5 px-4 text-center">
                          Điểm Cao Nhất {selectedStatsDate && `(${selectedStatsDate})`}
                        </th>
                        <th className="py-3.5 px-4 text-center">
                          Số Lần Làm {selectedStatsDate ? `(Ngày ${selectedStatsDate})` : '(Theo Ngày)'}
                        </th>
                        <th className="py-3.5 px-4 text-center w-28">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedStudents.map((st, idx) => {
                        const stats = getStudentExamStats(st.id, selectedExamFilter);
                        const statsAllTime = selectedStatsDate ? getStudentExamStats(st.id, selectedExamFilter, '') : stats;
                        const isPassed = stats.highestScore >= 950;
                        const studentClass = assignedClasses.find((c) => c.id === st.classId);

                        return (
                          <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Cột 1: STT */}
                            <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-400">
                              {(currentStudentsPage - 1) * 10 + idx + 1}
                            </td>

                            {/* Cột 2: Họ và Tên */}
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 text-sm">{st.fullName}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {studentClass && (
                                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    {studentClass.name}
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-400 font-mono">
                                  SBD: <strong className="text-slate-600 font-bold">{st.studentCode}</strong>
                                </span>
                              </div>
                            </td>

                            {/* Cột 3: Tên Đăng Nhập */}
                            <td className="py-3.5 px-3">
                              <span className="font-mono text-indigo-700 font-semibold bg-indigo-50/70 border border-indigo-100 px-2 py-0.5 rounded-md inline-block">
                                @{st.username}
                              </span>
                            </td>

                            {/* Cột 4: Mật Khẩu */}
                            <td className="py-3.5 px-3">
                              <span className="font-mono text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md inline-block">
                                {st.password || '123@456'}
                              </span>
                            </td>

                            {/* Cột 5: Điểm Cao Nhất */}
                            <td className="py-3.5 px-4 text-center">
                              {stats.attemptCount > 0 ? (
                                <div className="flex flex-col items-center">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono font-black text-xs ${
                                      isPassed
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                    }`}
                                  >
                                    {isPassed && '★'} {stats.highestScore} / 1000đ
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400 mt-0.5">
                                    {isPassed ? 'ĐẠT (≥950)' : 'Chưa Đạt'}
                                  </span>
                                </div>
                              ) : statsAllTime.attemptCount > 0 ? (
                                <div className="flex flex-col items-center">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono font-bold text-xs ${
                                      statsAllTime.highestScore >= 950
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                    }`}
                                  >
                                    {statsAllTime.highestScore} / 1000đ
                                  </span>
                                  <span className="text-[10px] font-semibold text-indigo-600 mt-0.5">
                                    (Đã thi ngày khác)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">Chưa thi</span>
                              )}
                            </td>

                            {/* Cột 6: Số Lần Làm (Theo Ngày) - Thẻ link / Button mở Modal chi tiết */}
                            <td className="py-3.5 px-4 text-center">
                              {stats.attemptCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStudentToViewResults(st);
                                    setStudentModalDateFilter(selectedStatsDate);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                                  title="Bấm để xem danh sách chi tiết các lần làm bài thi của học sinh này"
                                >
                                  <span className="font-mono text-sm font-black text-indigo-800">{stats.attemptCount}</span>
                                  <span className="text-[11px] font-semibold text-indigo-600">lần làm</span>
                                  <span className="text-indigo-400 group-hover:text-indigo-700 group-hover:translate-x-0.5 transition-transform text-xs">➔ Xem</span>
                                </button>
                              ) : statsAllTime.attemptCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStudentToViewResults(st);
                                    setStudentModalDateFilter('');
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                                  title="Bấm để xem chi tiết bài thi các ngày khác của học sinh này"
                                >
                                  <span className="font-mono text-xs font-black text-indigo-800">{statsAllTime.attemptCount}</span>
                                  <span className="text-[10px] font-semibold text-indigo-600">lần (ngày khác)</span>
                                  <span className="text-indigo-400 group-hover:text-indigo-700 group-hover:translate-x-0.5 transition-transform text-xs">➔</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStudentToViewResults(st);
                                    setStudentModalDateFilter('');
                                  }}
                                  className="inline-flex items-center px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 text-xs font-mono transition-colors cursor-pointer"
                                  title="Chưa có bài thi nào - Bấm để tra cứu chi tiết"
                                >
                                  0 lần
                                </button>
                              )}
                            </td>

                            {/* Cột 7: Thao Tác */}
                            <td className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStudentToViewResults(st);
                                    setStudentModalDateFilter(selectedStatsDate);
                                  }}
                                  className="p-1.5 rounded-xl text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-all cursor-pointer"
                                  title="Xem chi tiết lịch sử thi & bài làm của học sinh"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setStudentToDelete(st)}
                                  className="p-1.5 rounded-xl text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all cursor-pointer"
                                  title="Xóa học sinh khỏi lớp"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredStudents.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-16 text-center text-slate-400 space-y-3">
                            <Users className="w-10 h-10 text-slate-300 mx-auto" />
                            <div className="text-sm font-semibold text-slate-600">
                              Không tìm thấy học sinh nào phù hợp với bộ lọc hiện tại.
                            </div>
                            <div className="text-xs text-slate-400">
                              Hãy thử chọn lớp học khác hoặc bấm <strong>"Thêm Học Sinh"</strong> để thêm vào lớp này.
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Phân trang bảng học sinh */}
                <Pagination
                  currentPage={currentStudentsPage}
                  totalItems={filteredStudents.length}
                  pageSize={10}
                  onPageChange={setStudentsPage}
                  itemName="học sinh"
                />
              </div>
            </div>
          )}

          {/* ================= TAB 2: QUẢN LÝ ĐỀ THI VỚI 7 DẠNG CÂU HỎI ================= */}
          {activeTab === 'exams' && (
            <div className="space-y-6">
              {/* Header Action Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    <span>Hệ Thống Quản Lý Đề Thi Khảo Thí</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Thang điểm chuẩn 1000đ • Điểm đạt 950đ • Ngân hàng câu hỏi lưu trữ vĩnh viễn • GV làm thử không tính giờ.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Nút Mở Ngân Hàng Câu Hỏi */}
                  <button
                    type="button"
                    onClick={() => setIsQuestionBankModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer border border-purple-200"
                    title="Mở Ngân Hàng Câu Hỏi để xem, tra cứu và sử dụng lại các câu hỏi đã tạo"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Ngân Hàng Câu Hỏi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMissingQuestionsModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer border border-blue-200"
                    title="Xem cấu trúc tách bảng CSDL (exams, exam_questions, question_options...) và hướng dẫn đồng bộ"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Tách Bảng CSDL</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncQuestions}
                    disabled={isSyncingQuestions}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                      isMissingQuestionsColumn
                        ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                    title="Đồng bộ câu hỏi chi tiết của toàn bộ đề thi lên cơ sở dữ liệu Turso"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingQuestions ? 'animate-spin' : ''}`} />
                    <span>{isSyncingQuestions ? 'Đang Đồng Bộ...' : 'Đồng Bộ CSDL'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMergeModalOpen(true)}
                    disabled={teacherExams.length < 2}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Gộp Đề Thi ({teacherExams.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenCreateExam}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tạo Đề Thi Mới</span>
                  </button>
                </div>
              </div>

              {/* Bộ lọc đề thi & chuyển đổi giao diện Bảng / Lưới */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Ô tìm kiếm đề thi */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={examSearchFilter}
                      onChange={(e) => setExamSearchFilter(e.target.value)}
                      placeholder="Tìm theo tên đề thi, tên giáo viên tạo, môn học..."
                      className="w-full pl-10 pr-8 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                    {examSearchFilter && (
                      <button
                        type="button"
                        onClick={() => setExamSearchFilter('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Nhóm các bộ lọc nhanh */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Lọc theo lớp */}
                    <select
                      value={examClassFilter}
                      onChange={(e) => setExamClassFilter(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">Tất cả các lớp phụ trách</option>
                      {teacherSchools.map((ts) => (
                        <optgroup key={ts.schoolId} label={`🏫 ${ts.schoolName}`}>
                          {ts.classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.code})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>

                    {/* Lọc theo Khối Lớp */}
                    <select
                      value={examGradeFilter}
                      onChange={(e) => setExamGradeFilter(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                      title="Lọc đề thi theo khối lớp"
                    >
                      <option value="all">Tất cả khối lớp</option>
                      <option value="Khối 6">Khối 6</option>
                      <option value="Khối 7">Khối 7</option>
                      <option value="Khối 8">Khối 8</option>
                      <option value="Khối 9">Khối 9</option>
                      <option value="Khối 10">Khối 10</option>
                      <option value="Khối 11">Khối 11</option>
                      <option value="Khối 12">Khối 12</option>
                    </select>

                    {/* Lọc trạng thái */}
                    <select
                      value={examStatusFilter}
                      onChange={(e) => setExamStatusFilter(e.target.value as any)}
                      className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="published">Đang Hiện</option>
                      <option value="hidden">Đang Ẩn</option>
                    </select>

                    {/* Lọc loại đề */}
                    <select
                      value={examTypeFilter}
                      onChange={(e) => setExamTypeFilter(e.target.value as any)}
                      className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">Tất cả loại đề</option>
                      <option value="standard">Đề chuẩn</option>
                      <option value="practice">Đề thi thử</option>
                    </select>

                    {/* Chuyển đổi Bảng (Table) / Lưới (Grid) */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setExamViewMode('table')}
                        className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          examViewMode === 'table'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                        title="Hiển thị dạng Bảng chi tiết (STT, Tên đề, Tên GV tạo...)"
                      >
                        <List className="w-4 h-4" />
                        <span className="hidden sm:inline">Dạng Bảng</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setExamViewMode('grid')}
                        className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          examViewMode === 'grid'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                        title="Hiển thị dạng Lưới thẻ"
                      >
                        <LayoutGrid className="w-4 h-4" />
                        <span className="hidden sm:inline">Dạng Thẻ</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                  <div>
                    Hiển thị <strong>{filteredTeacherExams.length}</strong> đề thi phù hợp
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Thang điểm: <strong>1000 điểm</strong> • Điểm chuẩn đạt: <strong>≥ 950 điểm</strong></span>
                  </div>
                </div>
              </div>

              {/* ================= GIAO DIỆN BẢNG DANH SÁCH ĐỀ THI (TABLE VIEW) ================= */}
              {examViewMode === 'table' ? (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                          <th className="py-3.5 px-4 text-center w-14">STT</th>
                          <th className="py-3.5 px-4">Tên Đề Thi</th>
                          <th className="py-3.5 px-4 text-center">Khối Lớp</th>
                          <th className="py-3.5 px-4">Tên Giáo Viên Tạo</th>
                          <th className="py-3.5 px-4">Môn Học</th>
                          <th className="py-3.5 px-4">Lớp Phân Bổ</th>
                          <th className="py-3.5 px-4 text-center">Thời Gian</th>
                          <th className="py-3.5 px-4 text-center">Số Câu</th>
                          <th className="py-3.5 px-4 text-center">Thang Điểm</th>
                          <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                          <th className="py-3.5 px-4 text-center w-36">Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedExams.map((ex, idx) => {
                          const stt = (currentExamsPage - 1) * 10 + idx + 1;
                          const creatorDisplayName = ex.creatorName || teacher.fullName || teacher.username;
                          const questionCount = ex.questions?.length || ex.totalQuestions || 0;
                          
                          // Lấy danh sách tên các lớp được phân công
                          const assignedClassNames = (ex.classIds || [])
                            .map((cId) => classes.find((c) => c.id === cId)?.name)
                            .filter(Boolean);

                          return (
                            <tr key={ex.id} className="hover:bg-slate-50/80 transition-colors">
                              {/* STT */}
                              <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-500">
                                {stt}
                              </td>

                              {/* Tên Đề Thi */}
                              <td className="py-3.5 px-4">
                                <div className="space-y-1">
                                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                    <span>{ex.title}</span>
                                    {ex.isPracticeTest && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                        Thi Thử ({ex.practiceRandomCount || 10} câu)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    Mã đề: <span className="font-mono">{ex.id}</span>
                                  </div>
                                </div>
                              </td>

                              {/* Khối Lớp Được Xem Đề */}
                              <td className="py-3.5 px-4 text-center">
                                <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-block shadow-2xs">
                                  {formatGradeLabel(ex.grade || (ex.targetGrades && ex.targetGrades.length > 0 ? ex.targetGrades.join(', ') : 'Tất cả'))}
                                </span>
                              </td>

                              {/* Tên Giáo Viên Tạo */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0 border border-purple-200">
                                    {creatorDisplayName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-bold text-slate-800 text-xs">
                                      {creatorDisplayName}
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      Giáo viên bộ môn
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Môn Học */}
                              <td className="py-3.5 px-4">
                                <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 inline-block">
                                  {ex.subject || 'Công nghệ Thông tin'}
                                </span>
                              </td>

                              {/* Lớp Phân Bổ */}
                              <td className="py-3.5 px-4">
                                {assignedClassNames.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 max-w-xs">
                                    {assignedClassNames.map((cName, cIdx) => (
                                      <span
                                        key={cIdx}
                                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"
                                      >
                                        {cName}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-xs italic">Tất cả các lớp</span>
                                )}
                              </td>

                              {/* Thời Gian */}
                              <td className="py-3.5 px-4 text-center">
                                <span className="font-mono font-bold text-slate-800 flex items-center justify-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{ex.durationMinutes} phút</span>
                                </span>
                              </td>

                              {/* Số Câu Hỏi */}
                              <td className="py-3.5 px-4 text-center">
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  {questionCount} câu
                                </span>
                              </td>

                              {/* Thang Điểm */}
                              <td className="py-3.5 px-4 text-center">
                                <div className="space-y-0.5">
                                  <span className="font-mono font-black text-xs text-slate-900">
                                    1000đ
                                  </span>
                                  <div className="text-[10px] font-semibold text-emerald-700">
                                    ≥ 950đ đạt
                                  </div>
                                </div>
                              </td>

                              {/* Trạng Thái */}
                              <td className="py-3.5 px-4 text-center">
                                {ex.status === 'published' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <Eye className="w-3 h-3 text-emerald-600" />
                                    <span>Đang Hiện</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    <EyeOff className="w-3 h-3 text-slate-400" />
                                    <span>Đang Ẩn</span>
                                  </span>
                                )}
                              </td>

                              {/* Thao Tác */}
                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {/* Làm thử (Không tính giờ) */}
                                  <button
                                    type="button"
                                    onClick={() => setTestingExam(ex)}
                                    className="px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors border border-purple-200 shadow-2xs"
                                    title="Giáo viên làm thử đề thi (Không tính thời gian)"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Làm thử</span>
                                  </button>

                                  {/* Sửa */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditExam(ex)}
                                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition-colors border border-slate-200"
                                    title="Chỉnh sửa đề thi và câu hỏi"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Xóa */}
                                  <button
                                    type="button"
                                    onClick={() => setExamToDelete(ex)}
                                    className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center cursor-pointer transition-colors border border-red-200"
                                    title="Xóa đề thi (Các câu hỏi sẽ được bảo toàn trong Ngân Hàng Câu Hỏi)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {filteredTeacherExams.length === 0 && (
                          <tr>
                            <td colSpan={10} className="py-16 text-center text-slate-400 space-y-2">
                              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                              <p className="font-bold text-sm text-slate-600">Không tìm thấy đề thi nào phù hợp</p>
                              <p className="text-xs">
                                Hãy thử thay đổi từ khóa tìm kiếm hoặc bấm nút "Tạo Đề Thi Mới" ở góc trên.
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    currentPage={currentExamsPage}
                    totalItems={filteredTeacherExams.length}
                    pageSize={10}
                    onPageChange={setExamsPage}
                    itemName="đề thi"
                    className="border-t border-slate-100"
                  />
                </div>
              ) : (
                /* ================= GIAO DIỆN LƯỚI THẺ ĐỀ THI (GRID VIEW) ================= */
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {paginatedExams.map((ex, idx) => {
                      const stt = (currentExamsPage - 1) * 10 + idx + 1;
                      const creatorDisplayName = ex.creatorName || teacher.fullName || teacher.username;

                      return (
                        <div
                          key={ex.id}
                          className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                                  STT #{stt}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700">
                                  {ex.subject}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  {formatGradeLabel(ex.grade || (ex.targetGrades && ex.targetGrades.length > 0 ? ex.targetGrades.join(', ') : 'Tất cả khối'))}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {ex.status === 'published' ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                    <Eye className="w-3 h-3" />
                                    <span>Đang Hiện</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 flex items-center gap-1">
                                    <EyeOff className="w-3 h-3" />
                                    <span>Đang Ẩn</span>
                                  </span>
                                )}
                                {ex.isPracticeTest && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Thi Thử ({ex.practiceRandomCount || 10} câu)
                                  </span>
                                )}
                              </div>
                            </div>

                            <h4 className="font-bold text-slate-900 text-base leading-snug line-clamp-2">
                              {ex.title}
                            </h4>

                            {/* Tên Giáo Viên Tạo */}
                            <div className="flex items-center gap-2 p-2 rounded-xl bg-purple-50/60 border border-purple-100 text-xs">
                              <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                                {creatorDisplayName.charAt(0).toUpperCase()}
                              </div>
                              <div className="truncate">
                                <span className="text-slate-500 text-[11px]">Giáo viên tạo:</span>{' '}
                                <strong className="text-purple-950 font-semibold">{creatorDisplayName}</strong>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                              <div>
                                <span>Thời gian:</span>{' '}
                                <strong className="text-slate-800">{ex.durationMinutes} phút</strong>
                              </div>
                              <div>
                                <span>Số câu hỏi:</span>{' '}
                                <strong className="text-slate-800">{ex.questions?.length || ex.totalQuestions || 0} câu</strong>
                              </div>
                              <div>
                                <span>Thang điểm:</span>{' '}
                                <strong className="text-slate-800">1000 điểm</strong>
                              </div>
                              <div>
                                <span>Điểm chuẩn:</span>{' '}
                                <strong className="text-emerald-700">≥ 950 điểm</strong>
                              </div>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                            {/* Giáo viên làm thử: KHÔNG TÍNH GIỜ */}
                            <button
                              type="button"
                              onClick={() => setTestingExam(ex)}
                              className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors border border-purple-200"
                              title="Làm thử đề thi (Không tính thời gian)"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Làm Thử</span>
                            </button>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditExam(ex)}
                                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition-colors border border-slate-200"
                                title="Chỉnh sửa đề thi & câu hỏi"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setExamToDelete(ex)}
                                className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center cursor-pointer transition-colors border border-red-200"
                                title="Xóa đề thi (Câu hỏi vẫn được bảo toàn trong Ngân Hàng)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filteredTeacherExams.length === 0 && (
                      <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 p-8 space-y-3">
                        <FileText className="w-12 h-12 text-slate-300 mx-auto" />
                        <p className="text-sm font-semibold">Chưa có đề thi nào phù hợp với bộ lọc.</p>
                        <button
                          type="button"
                          onClick={handleOpenCreateExam}
                          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                        >
                          Bấm vào đây để tạo đề thi mới
                        </button>
                      </div>
                    )}
                  </div>

                  <Pagination
                    currentPage={currentExamsPage}
                    totalItems={filteredTeacherExams.length}
                    pageSize={10}
                    onPageChange={setExamsPage}
                    itemName="đề thi"
                    className="bg-white rounded-2xl border border-slate-200"
                  />
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 3: THỐNG KÊ BÀI THI ================= */}
          {activeTab === 'grading' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header Box */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                      <BarChart3 className="w-5 h-5" />
                    </span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Thống Kê Bài Thi
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Tra cứu và xem lại chi tiết bài làm, câu trả lời đúng/sai và số lần vi phạm của học sinh theo từng ngày cụ thể.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Trạng thái Đồng bộ tức thì & Nút Làm Mới */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold" title="Hệ thống tự động đồng bộ thời gian thực khi học sinh nộp bài">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Đồng bộ tức thì</span>
                      <span className="text-[10px] text-emerald-600 font-normal">({lastSubRefreshTime})</span>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        setIsRefreshingSubs(true);
                        try {
                          await refreshSubmissionsNow();
                          setLastSubRefreshTime(new Date().toLocaleTimeString('vi-VN'));
                          showToast('Đã làm mới và đồng bộ danh sách bài thi thành công!');
                        } catch {
                          showToast('Lỗi khi làm mới bài thi, vui lòng thử lại', 'error');
                        } finally {
                          setIsRefreshingSubs(false);
                        }
                      }}
                      disabled={isRefreshingSubs}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-indigo-200 shadow-xs"
                      title="Nạp bài nộp mới nhất của học sinh ngay lập tức mà không cần tải lại trang web"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSubs ? 'animate-spin text-indigo-600' : ''}`} />
                      <span>{isRefreshingSubs ? 'Đang tải...' : 'Làm Mới Danh Sách'}</span>
                    </button>
                  </div>

                  {/* View Mode Switcher */}
                  <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 self-start lg:self-auto">
                    <button
                      type="button"
                      onClick={() => setStatsViewMode('submissions')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        statsViewMode === 'submissions'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ListFilter className="w-3.5 h-3.5" />
                      <span>Tất Cả Bài Thi ({gradingStats.total})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatsViewMode('byStudent')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        statsViewMode === 'byStudent'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Gộp Theo Học Sinh ({gradingStats.uniqueStudents})</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* KHUNG CHỌN NGÀY VÀ LỌC BÀI THI */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                {/* 1. Chọn ngày xem bài */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-indigo-600" />
                      <span>Chọn Ngày Xem Bài Thi</span>
                      {selectedStatsDate && (
                        <span className="text-indigo-600 font-bold font-mono">
                          ({new Date(selectedStatsDate).toLocaleDateString('vi-VN')})
                        </span>
                      )}
                    </label>

                    {/* Quick presets */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedStatsDate(todayDateStr)}
                        className={`text-xs font-bold px-3 py-1 rounded-xl transition-all cursor-pointer ${
                          selectedStatsDate === todayDateStr
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Hôm nay {todaySubmissionsCount > 0 && `(${todaySubmissionsCount})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStatsDate(yesterdayDateStr)}
                        className={`text-xs font-bold px-3 py-1 rounded-xl transition-all cursor-pointer ${
                          selectedStatsDate === yesterdayDateStr
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Hôm qua
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStatsDate('')}
                        className={`text-xs font-bold px-3 py-1 rounded-xl transition-all cursor-pointer ${
                          !selectedStatsDate
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        Tất cả các ngày
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1 max-w-xs">
                      <input
                        type="date"
                        value={selectedStatsDate}
                        onChange={(e) => setSelectedStatsDate(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-800"
                      />
                    </div>
                    {selectedStatsDate && (
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <span>Đang xem bài nộp ngày:</span>
                        <strong className="text-slate-800 font-mono">
                          {new Date(selectedStatsDate).toLocaleDateString('vi-VN')}
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Danh sách các ngày có bài thi thực tế để click nhanh */}
                  {availableSubmissionDates.length > 0 && (
                    <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100">
                      <span className="text-[11px] font-semibold text-slate-400 mr-1">
                        Ngày có bài nộp:
                      </span>
                      {availableSubmissionDates.slice(0, 8).map(({ date, count }) => (
                        <button
                          key={date}
                          type="button"
                          onClick={() => setSelectedStatsDate(date)}
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                            selectedStatsDate === date
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span className="font-mono">{new Date(date).toLocaleDateString('vi-VN')}</span>
                          <span className="text-[10px] px-1 py-0.2 rounded-full bg-slate-200/70 text-slate-700 font-bold">
                            {count} bài
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Bộ lọc kết hợp: Lớp, Đề thi, Kết quả, Tìm kiếm */}
                <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Lọc Theo Lớp
                    </label>
                    <select
                      value={statsClassFilter}
                      onChange={(e) => setStatsClassFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">-- Tất cả các lớp phụ trách --</option>
                      {teacherSchools.map((ts) => (
                        <optgroup key={ts.schoolId} label={`🏫 ${ts.schoolName}`}>
                          {ts.classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.code})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Lọc Theo Đề Thi
                    </label>
                    <select
                      value={selectedExamFilter}
                      onChange={(e) => setSelectedExamFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">-- Tất cả đề thi --</option>
                      {teacherExams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Kết Quả Đạt / Chưa Đạt
                    </label>
                    <select
                      value={statsStatusFilter}
                      onChange={(e) => setStatsStatusFilter(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">-- Tất cả kết quả --</option>
                      <option value="passed">✓ Đạt chuẩn (≥950 điểm)</option>
                      <option value="failed">✕ Chưa đạt (&lt;950 điểm)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Tìm Kiếm Học Sinh / SBD
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={statsSearchQuery}
                        onChange={(e) => setStatsSearchQuery(e.target.value)}
                        placeholder="Tên học sinh, SBD..."
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                      />
                      {statsSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setStatsSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI STATS CARDS FOR SELECTED DATE */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                    <span>Tổng Bài Thi Đã Nộp</span>
                    <FileText className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900">
                      {gradingStats.total}
                    </span>
                    <span className="text-xs text-slate-400">lượt làm</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {selectedStatsDate ? `Trong ngày ${new Date(selectedStatsDate).toLocaleDateString('vi-VN')}` : 'Toàn bộ thời gian'}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                    <span>Học Sinh Đã Làm Bài</span>
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-blue-600">
                      {gradingStats.uniqueStudents}
                    </span>
                    <span className="text-xs text-slate-400">học sinh</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Đã hoàn thành ít nhất 1 bài thi
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                    <span>Tỉ Lệ Đạt Chuẩn (≥950đ)</span>
                    <Award className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600">
                      {gradingStats.passRate}%
                    </span>
                    <span className="text-xs text-slate-400">
                      ({gradingStats.passed}/{gradingStats.total})
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all"
                      style={{ width: `${gradingStats.passRate}%` }}
                    />
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                    <span>Điểm TB / Điểm Cao Nhất</span>
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-indigo-700">
                      {gradingStats.avgScore}
                    </span>
                    <span className="text-xs text-slate-400">
                      / Max: <strong className="text-emerald-600 font-mono">{gradingStats.highestScore}</strong>
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Thang điểm chuẩn 1000
                  </div>
                </div>
              </div>

              {/* ================= VIEW 1: DANH SÁCH TỪNG LƯỢT NỘP BÀI ================= */}
              {statsViewMode === 'submissions' && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <ListFilter className="w-4 h-4 text-indigo-600" />
                      <span>
                        Danh Sách Bài Thi
                        {selectedStatsDate && ` Ngày ${new Date(selectedStatsDate).toLocaleDateString('vi-VN')}`}
                        {' '}({filteredGradingSubmissions.length} bài thi)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsScoreRangeDeleteOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      title="Lọc và xóa hàng loạt bài thi của học sinh theo khoảng điểm"
                    >
                      <Sliders className="w-3.5 h-3.5 text-red-600" />
                      <span>Xóa Theo Khoảng Điểm</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase text-[11px] tracking-wider">
                        <tr>
                          <th className="py-3 px-3 text-center w-12">STT</th>
                          <th className="py-3 px-4">Thời Gian Nộp</th>
                          <th className="py-3 px-4">Học Sinh & Lớp</th>
                          <th className="py-3 px-4">Đề Thi</th>
                          <th className="py-3 px-3 text-center">Lần Thi</th>
                          <th className="py-3 px-3 text-center">Thời Gian Làm</th>
                          <th className="py-3 px-4 text-center">Điểm Số</th>
                          <th className="py-3 px-3 text-center">Kết Quả</th>
                          <th className="py-3 px-4 text-center">Xem Bài Làm</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedGradingSubmissions.map((sub, idx) => {
                          const cls = classes.find((c) => c.id === sub.classId);
                          const minutes = Math.floor(sub.timeSpentSeconds / 60);
                          const seconds = sub.timeSpentSeconds % 60;

                          return (
                            <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400">
                                {(currentGradingSubsPage - 1) * 10 + idx + 1}
                              </td>

                              <td className="py-3.5 px-4 font-mono text-slate-600">
                                <div className="font-bold text-slate-800">
                                  {new Date(sub.submittedAt).toLocaleTimeString('vi-VN')}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                                </div>
                              </td>

                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-900 text-sm">{sub.studentName}</div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono text-indigo-700 font-semibold">
                                    SBD: {sub.studentCode}
                                  </span>
                                  {cls && (
                                    <>
                                      <span>•</span>
                                      <span className="text-slate-600">{cls.name}</span>
                                    </>
                                  )}
                                </div>
                              </td>

                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-slate-800">{sub.examTitle}</div>
                                {sub.isPractice && (
                                  <span className="inline-block mt-0.5 px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Thi thử
                                  </span>
                                )}
                              </td>

                              <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-600">
                                #{sub.attemptNumber}
                              </td>

                              <td className="py-3.5 px-3 text-center">
                                <div className="font-mono text-slate-700">
                                  {minutes > 0 ? `${minutes}p ` : ''}{seconds}s
                                </div>
                                {sub.violationCount > 0 ? (
                                  <span 
                                    className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200" 
                                    title={sub.violationLogs ? sub.violationLogs.map(l => `${l.time}: ${l.label}`).join('\n') : `Vi phạm quy chế thi: ${sub.violationCount} lần`}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-red-600" />
                                    <span>Vi phạm: {sub.violationCount} lần</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-semibold inline-block mt-0.5">✓ Hợp lệ</span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-center font-mono font-black text-sm">
                                <span
                                  className={
                                    sub.isPassed ? 'text-emerald-600' : 'text-red-600'
                                  }
                                >
                                  {sub.score} / 1000
                                </span>
                              </td>

                              <td className="py-3.5 px-3 text-center">
                                {sub.isPassed ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                                    ✓ ĐẠT (≥950)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 inline-flex items-center gap-1">
                                    ✕ Chưa Đạt
                                  </span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSubmissionToReview(sub)}
                                    className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1"
                                    title="Xem toàn bộ câu hỏi và đáp án học sinh đã chọn"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Xem Bài</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSubmissionToDelete(sub)}
                                    className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 font-bold text-xs shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                                    title="Xóa bài thi này của học sinh"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Xóa</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {filteredGradingSubmissions.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-16 text-center text-slate-400 space-y-3">
                              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                              <p className="text-sm font-semibold">
                                {selectedStatsDate
                                  ? `Không có bài thi nào được nộp vào ngày ${new Date(selectedStatsDate).toLocaleDateString('vi-VN')}.`
                                  : 'Không tìm thấy bài thi nào phù hợp với bộ lọc.'}
                              </p>
                              {selectedStatsDate && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedStatsDate('')}
                                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
                                >
                                  Xem tất cả các ngày
                                </button>
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    currentPage={currentGradingSubsPage}
                    totalItems={filteredGradingSubmissions.length}
                    pageSize={10}
                    onPageChange={setGradingSubsPage}
                    itemName="bài nộp"
                  />
                </div>
              )}

              {/* ================= VIEW 2: GỘP THEO TỪNG HỌC SINH ================= */}
              {statsViewMode === 'byStudent' && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-600" />
                      <span>
                        Danh Sách Học Sinh Có Bài Làm
                        {selectedStatsDate && ` Ngày ${new Date(selectedStatsDate).toLocaleDateString('vi-VN')}`}
                        {' '}({studentGroupedSubmissions.length} học sinh)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsScoreRangeDeleteOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      title="Lọc và xóa hàng loạt bài thi của học sinh theo khoảng điểm"
                    >
                      <Sliders className="w-3.5 h-3.5 text-red-600" />
                      <span>Xóa Theo Khoảng Điểm</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase text-[11px] tracking-wider">
                        <tr>
                          <th className="py-3 px-3 text-center w-12">STT</th>
                          <th className="py-3 px-4">Họ & Tên Học Sinh</th>
                          <th className="py-3 px-4">Mã HS / SBD</th>
                          <th className="py-3 px-4">Lớp Học</th>
                          <th className="py-3 px-4 text-center">Số Lần Nộp Bài</th>
                          <th className="py-3 px-4 text-center">Điểm Cao Nhất</th>
                          <th className="py-3 px-4 text-center">Kết Quả</th>
                          <th className="py-3 px-4 text-center">Lần Nộp Gần Nhất</th>
                          <th className="py-3 px-4 text-center">Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedStudentGroupedSubmissions.map((grp, idx) => {
                          const stObj = students.find((s) => s.id === grp.studentId);

                          return (
                            <tr key={grp.studentId} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400">
                                {(currentGradingStudentsPage - 1) * 10 + idx + 1}
                              </td>

                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                  <span>{grp.studentName}</span>
                                  {grp.totalViolations > 0 && (
                                    <span 
                                      className="px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold inline-flex items-center gap-0.5"
                                      title={`Học sinh này có tổng cộng ${grp.totalViolations} lần vi phạm quy chế trong các bài nộp`}
                                    >
                                      ⚠️ {grp.totalViolations} vi phạm
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3.5 px-4 font-mono font-bold text-indigo-700">
                                {grp.studentCode}
                              </td>

                              <td className="py-3.5 px-4 font-semibold text-slate-700">
                                {grp.className}
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-block px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 font-mono font-bold text-xs">
                                  {grp.attemptCount} bài thi
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-center font-mono font-black text-sm">
                                <span
                                  className={
                                    grp.bestScore >= 950 ? 'text-emerald-600' : 'text-red-600'
                                  }
                                >
                                  {grp.bestScore} / 1000
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                {grp.bestScore >= 950 ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                    ✓ ĐẠT (≥950)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                                    ✕ Chưa Đạt
                                  </span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-center font-mono text-slate-600 text-[11px]">
                                {new Date(grp.latestSubmission.submittedAt).toLocaleTimeString('vi-VN')}{' '}
                                {new Date(grp.latestSubmission.submittedAt).toLocaleDateString('vi-VN')}
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (stObj) {
                                      setStudentToViewResults(stObj);
                                      setStudentModalDateFilter(selectedStatsDate);
                                    } else {
                                      setSubmissionToReview(grp.latestSubmission);
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs cursor-pointer flex items-center gap-1 mx-auto transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Xem {grp.attemptCount} Bài Thi ➔</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {studentGroupedSubmissions.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-16 text-center text-slate-400 space-y-3">
                              <Users className="w-10 h-10 text-slate-300 mx-auto" />
                              <p className="text-sm font-semibold">
                                {selectedStatsDate
                                  ? `Không có học sinh nào làm bài vào ngày ${new Date(selectedStatsDate).toLocaleDateString('vi-VN')}.`
                                  : 'Không tìm thấy học sinh nào phù hợp.'}
                              </p>
                              {selectedStatsDate && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedStatsDate('')}
                                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
                                >
                                  Xem tất cả các ngày
                                </button>
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    currentPage={currentGradingStudentsPage}
                    totalItems={studentGroupedSubmissions.length}
                    pageSize={10}
                    onPageChange={setGradingStudentsPage}
                    itemName="học sinh"
                  />
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ================= MODAL: THÊM ĐƠN HỌC SINH (VỚI TỰ SINH USERNAME, PASS, EMAIL) ================= */}
      {isAddSingleStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-indigo-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Plus className="w-5 h-5 text-white" />
                <span>Thêm Đơn Học Sinh Vào Lớp</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddSingleStudentModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSingleStudent} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chọn Lớp Được Phân Công <span className="text-red-500">*</span>
                </label>
                <select
                  value={singleStudentClassId}
                  onChange={(e) => setSingleStudentClassId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  {teacherSchools.map((ts) => (
                    <optgroup key={ts.schoolId} label={`🏫 ${ts.schoolName}`}>
                      {ts.classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Họ Và Tên Học Sinh <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn Nan"
                  value={singleStudentName}
                  onChange={(e) => setSingleStudentName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ngày Sinh
                  </label>
                  <input
                    type="date"
                    value={singleStudentDob}
                    onChange={(e) => setSingleStudentDob(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Giới Tính
                  </label>
                  <select
                    value={singleStudentGender}
                    onChange={(e) => setSingleStudentGender(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                </div>
              </div>

              {/* Box Xem Trước Các Trường Tự Động Phát Sinh Theo Đúng Yêu Cầu */}
              {previewSingleCreds && (
                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Hệ Thống Tự Động Phát Sinh Thông Tin (Không cần GV nhập):</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-700">
                    <div>
                      <span className="text-slate-500">Mã HS:</span>{' '}
                      <strong className="font-mono text-indigo-700">{previewSingleCreds.studentCode}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Tên đăng nhập:</span>{' '}
                      <strong className="font-mono text-indigo-700">@{previewSingleCreds.username}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Mật khẩu:</span>{' '}
                      <strong className="font-mono text-emerald-700">{previewSingleCreds.password}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Email:</span>{' '}
                      <strong className="font-mono text-slate-800">{previewSingleCreds.email}</strong>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddSingleStudentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSavingStudent || !singleStudentName.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingStudent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Xác Nhận Thêm Học Sinh</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: THÊM BẰNG FILE EXCEL ================= */}
      {isAddExcelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-emerald-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-white" />
                <span>Thêm Danh Sách Học Sinh Bằng File Excel</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddExcelModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chọn Lớp Tiếp Nhận Học Sinh <span className="text-red-500">*</span>
                </label>
                <select
                  value={excelClassId}
                  onChange={(e) => {
                    setExcelClassId(e.target.value);
                    if (excelRawText) handleParseExcel(excelRawText);
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                >
                  {teacherSchools.map((ts) => (
                    <optgroup key={ts.schoolId} label={`🏫 ${ts.schoolName}`}>
                      {ts.classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Dán Dữ Liệu Từ Excel (Hoặc tải tệp CSV / Text)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Sao chép các cột từ bảng tính Excel (Cột 1: Họ và tên, Cột 2: Ngày sinh, Cột 3: Giới tính) rồi dán vào khung bên dưới:
                </p>
                <textarea
                  rows={4}
                  value={excelRawText}
                  onChange={(e) => handleParseExcel(e.target.value)}
                  placeholder={`Nguyễn Văn Nan\t15/08/2008\tNam\nLê Thị Thảo\t20/09/2008\tNữ\nTrần Minh Tuấn\t05/12/2008\tNam`}
                  className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Tải tệp CSV */}
              <div className="flex items-center gap-3">
                <label className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Chọn Tệp (.csv / .txt)</span>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const content = event.target?.result as string;
                          handleParseExcel(content);
                        };
                        reader.readAsText(file);
                      }
                    }}
                  />
                </label>
                {parsedExcelStudents.length > 0 && (
                  <span className="text-xs font-bold text-emerald-700">
                    ✓ Đã nhận diện {parsedExcelStudents.length} học sinh
                  </span>
                )}
              </div>

              {/* Bảng Preview trước khi lưu */}
              {parsedExcelStudents.length > 0 && (
                <div className="border border-slate-200 rounded-2xl max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2">STT</th>
                        <th className="p-2">Họ Tên</th>
                        <th className="p-2">Mã HS</th>
                        <th className="p-2">Tên Đăng Nhập</th>
                        <th className="p-2">Mật Khẩu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedExcelStudents.map((st, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-mono">{idx + 1}</td>
                          <td className="p-2 font-bold text-slate-900">{st.fullName}</td>
                          <td className="p-2 font-mono text-indigo-600">{st.studentCode}</td>
                          <td className="p-2 font-mono text-emerald-700">@{st.username}</td>
                          <td className="p-2 font-mono text-slate-500">{st.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddExcelModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isImportingExcel || parsedExcelStudents.length === 0}
                  onClick={handleConfirmImportExcel}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isImportingExcel ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Xác Nhận Thêm {parsedExcelStudents.length} Học Sinh</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÓA HỌC SINH KHỎI LỚP (Requirement A.4) ================= */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-white" />
                <span>Xác Nhận Xóa Học Sinh Khỏi Lớp</span>
              </h3>
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                <div className="text-slate-500">Học sinh cần xóa:</div>
                <div className="text-sm font-bold text-slate-900">{studentToDelete.fullName}</div>
                <div className="font-mono text-slate-600">
                  SBD: {studentToDelete.studentCode} • Tài khoản: @{studentToDelete.username}
                </div>
              </div>

              <p className="text-slate-600 leading-relaxed">
                Bạn có chắc chắn muốn xóa hồ sơ học sinh này khỏi lớp học? Thao tác này sẽ gỡ bỏ tài khoản và kết quả bài thi khỏi hệ thống.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setStudentToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isDeletingStudent}
                  onClick={handleConfirmDeleteStudent}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isDeletingStudent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Xác Nhận Xóa</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: TẠO / SỬA ĐỀ THI VỚI 7 DẠNG CÂU HỎI (Requirement A.5) ================= */}
      {isExamModalOpen && (
        <ExamEditorModal
          initialExam={editingExamId ? exams.find((e) => e.id === editingExamId) || null : null}
          assignedClasses={assignedClasses}
          teacherId={teacher.id}
          teacherName={teacher.fullName || teacher.username}
          teacherSubjects={teacher.subjects}
          onSave={async (examData) => {
            if (editingExamId) {
              await updateExam(editingExamId, examData);
              if (isMissingQuestionsColumn) {
                showToast(`Đã lưu đề thi "${examData.title}". Lưu ý: Turso chưa có cột questions, hãy xem bảng vàng để bổ sung cột!`, 'warning');
              } else {
                showToast(`Đã cập nhật đề thi "${examData.title}" thành công!`);
              }
            } else {
              await addExam(examData);
              if (isMissingQuestionsColumn) {
                showToast(`Đã tạo mới đề thi "${examData.title}". Lưu ý: Turso chưa có cột questions, hãy xem bảng vàng để bổ sung cột!`, 'warning');
              } else {
                showToast(`Đã tạo mới đề thi "${examData.title}" thành công!`);
              }
            }
            setEditingExamId(null);
            setIsExamModalOpen(false);
          }}
          onClose={() => {
            setEditingExamId(null);
            setIsExamModalOpen(false);
          }}
        />
      )}

      {/* ================= MODAL: GỘP CÁC ĐỀ THI ĐÃ TẠO (Requirement A.5) ================= */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-purple-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Layers className="w-5 h-5 text-white" />
                <span>Gộp Các Đề Thi Thành 1 Đề Thi Mới</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsMergeModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600">
                Chọn từ 2 đề thi trở lên để gộp các câu hỏi lại thành một đề thi khảo thí mới. Hệ thống chỉ tạo đề mới và liên kết các câu hỏi đã có sẵn trong cơ sở dữ liệu mà không nhân bản trùng lặp câu hỏi.
              </p>

              <div className="p-2.5 bg-purple-50/80 rounded-xl border border-purple-200 flex items-center gap-2 text-[11px] text-purple-900 font-medium">
                <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                <span>⚡ <strong>Tối ưu hóa Turso DB:</strong> Tái sử dụng trực tiếp các câu hỏi gốc từ các đề đã chọn. Hoàn toàn <strong>không tạo thêm câu hỏi mới</strong> trong cơ sở dữ liệu Turso.</span>
              </div>

              {/* BỘ CHỌN MÔN HỌC ĐỂ LỌC ĐỀ THI GỘP */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Chọn Môn Học Để Lọc Đề Thi Gộp</span>
                  <span className="text-[11px] font-bold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-full">
                    {mergeFilteredExams.length} đề thi
                  </span>
                </label>
                <select
                  value={mergeSelectedSubject}
                  onChange={(e) => setMergeSelectedSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="all">-- Tất Cả Các Môn Học ({teacherExams.length} đề thi) --</option>
                  {mergeAvailableSubjects.map((sub) => {
                    const count = teacherExams.filter((ex) => ex.subject?.trim() === sub).length;
                    return (
                      <option key={sub} value={sub}>
                        Môn: {sub} ({count} đề thi)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tên Đề Thi Gộp Mới <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={mergeNewTitle}
                  onChange={(e) => setMergeNewTitle(e.target.value)}
                  placeholder="Ví dụ: Đề Thi Tổng Hợp Lập Trình & Mạng Máy Tính (Đợt 1)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Thời Gian Làm Bài (Phút)
                </label>
                <input
                  type="number"
                  min={10}
                  value={mergeDuration}
                  onChange={(e) => setMergeDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700">
                    Chọn Các Đề Thi Cần Gộp (Đã chọn: <span className="text-purple-600 font-mono font-bold">{mergeSelectedExamIds.length}</span>)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const idsToAdd = mergeFilteredExams.map((e) => e.id);
                        const mergedSet = new Set([...mergeSelectedExamIds, ...idsToAdd]);
                        setMergeSelectedExamIds(Array.from(mergedSet));
                      }}
                      className="text-[11px] font-bold text-purple-600 hover:text-purple-700 hover:underline cursor-pointer"
                    >
                      Chọn tất cả ({mergeFilteredExams.length})
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const idsToRemove = new Set(mergeFilteredExams.map((e) => e.id));
                        setMergeSelectedExamIds(mergeSelectedExamIds.filter((id) => !idsToRemove.has(id)));
                      }}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-2 border border-slate-200 rounded-2xl p-2.5 bg-slate-50/30">
                  {mergeFilteredExams.map((ex) => {
                    const isChecked = mergeSelectedExamIds.includes(ex.id);
                    return (
                      <label
                        key={ex.id}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-purple-50 border-purple-300 text-purple-950 font-bold shadow-xs'
                            : 'hover:bg-slate-50 border-slate-200 text-slate-700 bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMergeSelectedExamIds([...mergeSelectedExamIds, ex.id]);
                            } else {
                              setMergeSelectedExamIds(mergeSelectedExamIds.filter((id) => id !== ex.id));
                            }
                          }}
                          className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs truncate">{ex.title}</div>
                          <div className="text-[10px] text-slate-400 font-normal flex items-center gap-2 mt-0.5">
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{ex.subject || 'Công nghệ'}</span>
                            <span>•</span>
                            <span>{ex.questions?.length || ex.totalQuestions || 0} câu</span>
                            <span>•</span>
                            <span>{ex.durationMinutes} phút</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  {mergeFilteredExams.length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      Không có đề thi nào thuộc môn "{mergeSelectedSubject}". Vui lòng chọn môn khác.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsMergeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isMerging || mergeSelectedExamIds.length < 2 || !mergeNewTitle.trim()}
                  onClick={handleConfirmMergeExams}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isMerging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                  <span>{isMerging ? 'Đang Tối Ưu & Gộp Đề...' : `Xác Nhận Gộp ${mergeSelectedExamIds.length} Đề Thi`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÓA ĐỀ THI ================= */}
      {examToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4">
            <h3 className="font-bold text-base text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              <span>Xác Nhận Xóa Đề Thi</span>
            </h3>
            <p className="text-xs text-slate-600">
              Bạn có chắc chắn muốn xóa đề thi <strong>"{examToDelete.title}"</strong>? Đề thi sẽ bị gỡ bỏ vĩnh viễn khỏi hệ thống.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setExamToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteExam(examToDelete.id);
                  showToast(`Đã xóa đề thi "${examToDelete.title}"`);
                  setExamToDelete(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 cursor-pointer"
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: GIÁO VIÊN LÀM THỬ ĐỀ THI (KHÔNG TÍNH GIỜ) ================= */}
      {testingExam && (
        <ExamTakingModal
          exam={testingExam}
          currentUser={teacher}
          isTeacherTesting={true} // ĐẶC BIỆT: KHÔNG TÍNH THỜI GIAN LÀM BÀI
          onClose={() => setTestingExam(null)}
          onSubmitSuccess={(sub) => {
            showToast(`Giáo viên làm thử hoàn tất! Điểm: ${sub.score}/1000`);
            setTestingExam(null);
          }}
        />
      )}

      {/* ================= MODAL: XEM LẠI BÀI LÀM CỦA HỌC SINH (REVIEW ANSWERS) ================= */}
      {submissionToReview && (
        <ExamReviewModal
          submission={submissionToReview}
          allSubmissions={submissions}
          exams={exams}
          onClose={() => setSubmissionToReview(null)}
          onDelete={(sub) => {
            setSubmissionToReview(null);
            setSubmissionToDelete(sub);
          }}
        />
      )}

      {/* ================= MODAL: DANH SÁCH BÀI LÀM CỦA 1 HỌC SINH THEO NGÀY ================= */}
      {studentToViewResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[88vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-indigo-600 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>{studentToViewResults.fullName}</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/20 text-white">
                    SBD: {studentToViewResults.studentCode}
                  </span>
                </h3>
                <span className="text-xs text-indigo-100 font-mono mt-0.5 block">
                  Lớp: {classes.find((c) => c.id === studentToViewResults.classId)?.name || 'Chưa phân lớp'} • Tài khoản: @{studentToViewResults.username}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStudentToViewResults(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Filter by Date */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Chọn Ngày Xem Bài Thi</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setStudentModalDateFilter(todayDateStr)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg cursor-pointer transition-colors ${
                      studentModalDateFilter === todayDateStr
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentModalDateFilter(yesterdayDateStr)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg cursor-pointer transition-colors ${
                      studentModalDateFilter === yesterdayDateStr
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Hôm qua
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentModalDateFilter('')}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg cursor-pointer transition-colors ${
                      !studentModalDateFilter
                        ? 'bg-indigo-600 text-white'
                        : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    }`}
                  >
                    Tất cả ({studentModalSubmissions.length})
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={studentModalDateFilter}
                    onChange={(e) => setStudentModalDateFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-indigo-500 w-full sm:w-56"
                  />
                  {studentModalDateFilter && (
                    <span className="text-[11px] text-slate-500">
                      Đang xem bài ngày: <strong className="font-mono text-slate-800">{new Date(studentModalDateFilter).toLocaleDateString('vi-VN')}</strong>
                    </span>
                  )}
                </div>

                {/* Nút Xóa toàn bộ bài thi của học sinh */}
                {studentModalSubmissions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDeleteAllStudentSubs(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    title="Xóa tất cả các bài làm của học sinh này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa Toàn Bộ ({studentModalSubmissions.length} bài)</span>
                  </button>
                )}
              </div>

              {/* Quick Pills for each active test date of this student */}
              {studentModalDates.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <span className="text-[10px] font-semibold text-slate-400">Các ngày đã thi:</span>
                  {studentModalDates.map(({ date, count }) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setStudentModalDateFilter(date)}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-all cursor-pointer flex items-center gap-1 ${
                        studentModalDateFilter === date
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{new Date(date).toLocaleDateString('vi-VN')}</span>
                      <span className={`px-1 py-0.2 rounded-full text-[9px] font-bold ${
                        studentModalDateFilter === date ? 'bg-white/30 text-white' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {count} bài
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Submissions List */}
            <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1 text-xs">
              {paginatedStudentModalSubmissions.map((sub) => {
                const minutes = Math.floor(sub.timeSpentSeconds / 60);
                const seconds = sub.timeSpentSeconds % 60;

                return (
                  <div
                    key={sub.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h5 className="font-bold text-slate-900 text-xs sm:text-sm">{sub.examTitle}</h5>
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                          Lần #{sub.attemptNumber}
                        </span>
                        {sub.isPractice && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            Thi thử
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>
                          🕒 {new Date(sub.submittedAt).toLocaleTimeString('vi-VN')}{' '}
                          {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                        </span>
                        <span>•</span>
                        <span>
                          ⏱️ Thời gian: {minutes > 0 ? `${minutes}p ` : ''}{seconds}s
                        </span>
                        {sub.violationCount > 0 && (
                          <>
                            <span>•</span>
                            <span 
                              className="text-red-600 font-bold inline-flex items-center gap-1"
                              title={sub.violationLogs ? sub.violationLogs.map(l => `${l.time}: ${l.label}`).join('\n') : `Vi phạm ${sub.violationCount} lần`}
                            >
                              ⚠️ Vi phạm: {sub.violationCount} lần
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <div className="text-right">
                        <span
                          className={`font-mono font-black text-xs px-2.5 py-1 rounded-full inline-block ${
                            sub.isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {sub.score}/1000đ
                        </span>
                        <div className="text-[10px] font-bold mt-0.5">
                          {sub.isPassed ? (
                            <span className="text-emerald-600">✓ ĐẠT (≥950)</span>
                          ) : (
                            <span className="text-red-600">✕ Chưa Đạt</span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSubmissionToReview(sub)}
                        className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1"
                        title="Xem chi tiết từng câu hỏi học sinh đã làm"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem Bài</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSubmissionToDelete(sub)}
                        className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 font-bold text-xs shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                        title="Xóa bài thi này của học sinh"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredStudentModalSubmissions.length > 0 && (
                <Pagination
                  currentPage={currentStudentModalSubsPage}
                  totalItems={filteredStudentModalSubmissions.length}
                  pageSize={10}
                  onPageChange={setStudentModalSubsPage}
                  itemName="bài thi"
                  className="rounded-xl border border-slate-200 mt-2"
                />
              )}

              {filteredStudentModalSubmissions.length === 0 && (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold">
                    {studentModalDateFilter
                      ? `Học sinh không có bài thi nào vào ngày ${new Date(studentModalDateFilter).toLocaleDateString('vi-VN')}.`
                      : 'Học sinh chưa tham gia bài thi nào.'}
                  </p>
                  {studentModalDateFilter && (
                    <button
                      type="button"
                      onClick={() => setStudentModalDateFilter('')}
                      className="text-xs text-indigo-600 font-bold hover:underline"
                    >
                      Xem tất cả các ngày
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÁC NHẬN XÓA 1 BÀI THI CỦA HỌC SINH (GIÁO VIÊN) ================= */}
      {submissionToDelete && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-red-100 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Xác Nhận Xóa Bài Thi</h3>
                <p className="text-xs text-slate-500">Gỡ bỏ kết quả bài làm khỏi cơ sở dữ liệu</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Học sinh:</span>
                <strong className="text-slate-900">{submissionToDelete.studentName} (SBD: {submissionToDelete.studentCode})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Đề thi:</span>
                <strong className="text-indigo-700 text-right max-w-[220px] truncate">{submissionToDelete.examTitle}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Điểm số:</span>
                <strong className={`font-mono font-bold ${submissionToDelete.isPassed ? 'text-emerald-600' : 'text-red-600'}`}>
                  {submissionToDelete.score}/1000đ ({submissionToDelete.isPassed ? 'ĐẠT' : 'CHƯA ĐẠT'})
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lần thi / Ngày:</span>
                <span className="font-mono text-slate-700">
                  Lần #{submissionToDelete.attemptNumber} • {new Date(submissionToDelete.submittedAt).toLocaleTimeString('vi-VN')} {new Date(submissionToDelete.submittedAt).toLocaleDateString('vi-VN')}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
              💡 <strong>Lưu ý:</strong> Sau khi xóa, học sinh có thể thực hiện lại bài thi nếu đề thi còn mở. Thao tác xóa bài thi không thể khôi phục.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingSubmission}
                onClick={() => setSubmissionToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={isDeletingSubmission}
                onClick={handleConfirmDeleteSubmission}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isDeletingSubmission ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Xác Nhận Xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÁC NHẬN XÓA TOÀN BỘ BÀI THI CỦA 1 HỌC SINH ================= */}
      {isConfirmingDeleteAllStudentSubs && studentToViewResults && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-red-100 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-red-600">Xóa Toàn Bộ Bài Thi Của Học Sinh?</h3>
                <p className="text-xs text-slate-500">Cảnh báo hành động không thể hoàn tác</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa toàn bộ <strong>{studentModalSubmissions.length}</strong> bài thi đã làm của học sinh{' '}
              <strong className="text-slate-900">{studentToViewResults.fullName}</strong> (SBD: {studentToViewResults.studentCode})? Toàn bộ lịch sử điểm số và số lần làm sẽ được đặt lại về ban đầu.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingAllStudentSubs}
                onClick={() => setIsConfirmingDeleteAllStudentSubs(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={isDeletingAllStudentSubs}
                onClick={handleConfirmDeleteAllStudentSubmissions}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isDeletingAllStudentSubs ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Xóa Hết ({studentModalSubmissions.length} bài)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÓA BÀI THI THEO KHOẢNG ĐIỂM (GIÁO VIÊN) ================= */}
      <ScoreRangeDeleteModal
        isOpen={isScoreRangeDeleteOpen}
        onClose={() => setIsScoreRangeDeleteOpen(false)}
        submissions={teacherSubmissions}
        classes={assignedClasses}
        exams={teacherExams}
        schools={schools}
        role="teacher"
        onDeleteSuccess={(deletedCount, affectedStudentsCount) => {
          showToast(`Đã xóa thành công ${deletedCount} bài thi của ${affectedStudentsCount} học sinh theo khoảng điểm!`);
        }}
      />

      {/* ================= MODAL: KIẾN TRÚC TÁCH NHIỀU BẢNG CSDL (MULTI-TABLE SCHEMA) ================= */}
      <MultiTableSchemaModal
        isOpen={isMissingQuestionsModalOpen}
        onClose={() => setIsMissingQuestionsModalOpen(false)}
        exams={exams}
        onMigrated={() => {
          showToast('✓ Đã tách và phân bổ toàn bộ đề thi & câu hỏi sang nhiều bảng trên Turso thành công!');
        }}
      />

      {/* ================= MODAL: NGÂN HÀNG CÂU HỎI (CHO GIÁO VIÊN) ================= */}
      <QuestionBankModal
        isOpen={isQuestionBankModalOpen}
        onClose={() => setIsQuestionBankModalOpen(false)}
        onSelectQuestions={(selected) => {
          showToast(`Đã chọn ${selected.length} câu hỏi từ Ngân hàng câu hỏi!`);
        }}
        defaultSubject={teacher.subjects || 'all'}
      />

    </div>
  );
};
