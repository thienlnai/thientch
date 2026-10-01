import React, { useState, useMemo, useEffect } from 'react';
import { 
  Student, 
  School, 
  SchoolClass, 
  Language, 
  Exam, 
  ExamSubmission, 
  UserAccount 
} from '../types/index.ts';
import { Sidebar, SidebarMenuItem } from './Sidebar.tsx';
import { TopBar } from './TopBar.tsx';
import { 
  PlayCircle, 
  Award, 
  Calendar, 
  HelpCircle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Eye, 
  RefreshCw, 
  CheckCircle, 
  Search,
  Filter,
  ShieldAlert,
  BookOpen,
  ArrowRight,
  Flame,
  FileCheck2,
  FileQuestion,
  Maximize
} from 'lucide-react';
import { addExamSubmission, getExamWithQuestions } from '../services/dbService.ts';
import { 
  isExamVisibleToGrade, 
  getClassGradeNumber, 
  formatGradeLabel 
} from '../utils/studentHelper.ts';
import { ExamTakingModal } from './ExamTakingModal.tsx';
import { Pagination } from './Pagination.tsx';
import { ExamReviewModal } from './ExamReviewModal.tsx';

interface StudentPortalProps {
  student: Student;
  school?: School;
  studentClass?: SchoolClass;
  exams?: Exam[];
  submissions?: ExamSubmission[];
  teachers?: UserAccount[];
  onLogout: () => void;
  lang: Language;
}

type StudentTab = 'exams' | 'results' | 'guide';

export const StudentPortal: React.FC<StudentPortalProps> = ({
  student,
  school,
  studentClass,
  exams = [],
  submissions = [],
  teachers = [],
  onLogout,
  lang,
}) => {
  const [activeTab, setActiveTab] = useState<StudentTab>('exams');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Bộ lọc ngày hiển thị số lần đã làm của đề thi theo ngày được chọn (Requirement B.3)
  const [selectedStatsDate, setSelectedStatsDate] = useState<string>(''); // Rỗng = xem tất cả, hoặc YYYY-MM-DD
  
  // State thi & xem lại bài thi
  const [takingExam, setTakingExam] = useState<Exam | null>(null);
  const [loadingExamId, setLoadingExamId] = useState<string | null>(null);
  const [reviewingSubmission, setReviewingSubmission] = useState<ExamSubmission | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handlePortalLogout = () => {
    onLogout();
  };

  // Khởi động làm bài thi: tải toàn bộ câu hỏi qua getExamWithQuestions (Single Query JOIN + Cache)
  const handleStartExam = async (ex: Exam) => {
    if (ex.questions && ex.questions.length > 0) {
      setTakingExam(ex);
      return;
    }

    setLoadingExamId(ex.id);
    try {
      const fullExam = await getExamWithQuestions(ex.id);
      if (fullExam && fullExam.questions && fullExam.questions.length > 0) {
        setTakingExam(fullExam);
      } else {
        setTakingExam(ex);
      }
    } catch (err) {
      console.error('Lỗi nạp đề thi:', err);
      setTakingExam(ex);
    } finally {
      setLoadingExamId(null);
    }
  };

  // ================= 1. CHỈ THẤY ĐƯỢC ĐỀ THI DO GIÁO VIÊN ĐƯỢC PHÂN CÔNG TẠO RA (Requirement B.1) =================
  const assignedTeachers = useMemo(() => {
    if (!student.classId) return [];
    return teachers.filter(
      (t) =>
        t.role === 'teacher' &&
        (t.classIds?.includes(student.classId) ||
          (studentClass &&
            t.fullName &&
            studentClass.homeroomTeacher?.trim().toLowerCase() === t.fullName.trim().toLowerCase()))
    );
  }, [teachers, student.classId, studentClass]);

  const assignedTeacherIds = useMemo(
    () => new Set(assignedTeachers.map((t) => t.id)),
    [assignedTeachers]
  );
  const assignedTeacherUsernames = useMemo(
    () => new Set(assignedTeachers.map((t) => t.username)),
    [assignedTeachers]
  );

  // Số khối của lớp học sinh đang học (ví dụ học sinh lớp 8.1 -> "8")
  const studentGrade = useMemo(() => {
    return getClassGradeNumber(studentClass);
  }, [studentClass]);

  // Đề thi khả dụng cho học sinh này:
  // - Khối lớp của học sinh BẮT BUỘC phải khớp với khối lớp mà giáo viên chỉ định (hoặc đề áp dụng cho Tất cả khối)
  //   Ví dụ: Nguyễn Văn A Lớp 8.1 sẽ không thấy đề của khối 6 và 7
  // - Thuộc lớp học sinh hoặc do GV phân công tạo ra
  // - status === 'published' (Đang hiện)
  const availableExams = useMemo(() => {
    return exams.filter((ex) => {
      // 1. Chỉ hiện đề đang ở trạng thái Published (Hiện)
      if (ex.status !== 'published') return false;

      // 2. BẮT BUỘC: Kiểm tra khối lớp được phép thấy đề thi
      if (!isExamVisibleToGrade(ex, studentClass)) {
        return false;
      }

      // 3. Kiểm tra xem đề thi có nhắm vào lớp của học sinh không
      const isTargetClass = student.classId && ex.classIds && ex.classIds.includes(student.classId);

      // 4. Kiểm tra xem người tạo có phải là giáo viên được phân công phụ trách lớp không
      const isAssignedTeacherCreator =
        assignedTeacherIds.has(ex.creatorId) ||
        assignedTeacherUsernames.has(ex.creatorId);

      return isTargetClass || isAssignedTeacherCreator;
    });
  }, [exams, student.classId, studentClass, assignedTeacherIds, assignedTeacherUsernames]);

  // Lịch sử bài làm của học sinh này
  const studentSubmissions = useMemo(() => {
    return submissions.filter((s) => s.studentId === student.id);
  }, [submissions, student.id]);

  // ================= 2. THỐNG KÊ SỐ BÀI ĐÃ LÀM & CHƯA LÀM (Requirement B.4) =================
  const attemptedExamIds = useMemo(() => {
    return new Set(studentSubmissions.map((s) => s.examId));
  }, [studentSubmissions]);

  const completedExamsCount = useMemo(() => {
    return availableExams.filter((ex) => attemptedExamIds.has(ex.id)).length;
  }, [availableExams, attemptedExamIds]);

  const pendingExamsCount = useMemo(() => {
    return Math.max(0, availableExams.length - completedExamsCount);
  }, [availableExams.length, completedExamsCount]);

  // Thống kê số lần đã làm theo ngày được chọn của từng đề thi (Requirement B.3)
  const getExamAttemptStatsForDate = (examId: string) => {
    let list = studentSubmissions.filter((s) => s.examId === examId);
    if (selectedStatsDate) {
      list = list.filter((s) => s.dateKey === selectedStatsDate);
    }
    const attemptCount = list.length;
    const highestScore = attemptCount > 0 ? Math.max(...list.map((s) => s.score)) : 0;
    const latestSub = list.length > 0 ? list[0] : null;

    return {
      attemptCount,
      highestScore,
      latestSub,
      list,
    };
  };

  const filteredExams = useMemo(() => {
    if (!searchQuery.trim()) return availableExams;
    const q = searchQuery.toLowerCase();
    return availableExams.filter(
      (ex) =>
        ex.title.toLowerCase().includes(q) ||
        ex.subject.toLowerCase().includes(q)
    );
  }, [availableExams, searchQuery]);

  // Bộ lọc bài thi theo đề thi đã chọn (hiển thị tất cả số lần đã làm của đề thi đó)
  const [selectedExamIdFilter, setSelectedExamIdFilter] = useState<string>('all');

  // Danh sách các đề thi mà học sinh đã từng làm
  const attemptedExamsList = useMemo(() => {
    const map = new Map<string, { examId: string; examTitle: string; count: number; bestScore: number; latestScore: number }>();
    studentSubmissions.forEach((sub) => {
      const existing = map.get(sub.examId);
      if (existing) {
        existing.count += 1;
        existing.bestScore = Math.max(existing.bestScore, sub.score);
      } else {
        map.set(sub.examId, {
          examId: sub.examId,
          examTitle: sub.examTitle || 'Đề thi',
          count: 1,
          bestScore: sub.score,
          latestScore: sub.score,
        });
      }
    });
    return Array.from(map.values());
  }, [studentSubmissions]);

  const selectedFilteredExamInfo = useMemo(() => {
    if (!selectedExamIdFilter || selectedExamIdFilter === 'all') return null;
    return attemptedExamsList.find((e) => e.examId === selectedExamIdFilter) || null;
  }, [selectedExamIdFilter, attemptedExamsList]);

  // Bộ lọc bài thi đã nộp theo ngày & theo đề thi đã chọn
  const filteredSubmissions = useMemo(() => {
    return studentSubmissions.filter((sub) => {
      if (selectedStatsDate && sub.dateKey !== selectedStatsDate) return false;
      if (selectedExamIdFilter && selectedExamIdFilter !== 'all' && sub.examId !== selectedExamIdFilter) return false;
      return true;
    });
  }, [studentSubmissions, selectedStatsDate, selectedExamIdFilter]);

  // Phân trang danh sách bài thi và kết quả bài làm (10 dòng/trang)
  const [examsPage, setExamsPage] = useState<number>(1);
  const [resultsPage, setResultsPage] = useState<number>(1);

  const totalExamPages = Math.max(1, Math.ceil(filteredExams.length / 10));
  const currentExamsPage = Math.min(examsPage, totalExamPages);
  const paginatedExams = useMemo(() => {
    const start = (currentExamsPage - 1) * 10;
    return filteredExams.slice(start, start + 10);
  }, [filteredExams, currentExamsPage]);

  const totalResultPages = Math.max(1, Math.ceil(filteredSubmissions.length / 10));
  const currentResultsPage = Math.min(resultsPage, totalResultPages);
  const paginatedSubmissions = useMemo(() => {
    const start = (currentResultsPage - 1) * 10;
    return filteredSubmissions.slice(start, start + 10);
  }, [filteredSubmissions, currentResultsPage]);

  const studentMenuItems: SidebarMenuItem[] = [
    { id: 'exams', label: 'Danh Sách Bài Thi', icon: PlayCircle, badge: pendingExamsCount },
    { id: 'results', label: 'Kết quả & Xem lại đáp án', icon: Award, badge: completedExamsCount },
    { id: 'guide', label: 'Nội quy & Chống gian lận', icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row font-sans antialiased text-slate-800">
      
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-3 duration-200">
          <div className="px-4 py-3 rounded-2xl shadow-xl border bg-emerald-50 text-emerald-900 border-emerald-200 flex items-center gap-2.5 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {/* CỘT 1 (BÊN TRÁI - DARK SIDEBAR) */}
      <Sidebar
        menuItems={studentMenuItems}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as StudentTab)}
        userRoleName="THÍ SINH KHẢO THÍ IT"
        userName={student.fullName}
        userSubtext={`${studentClass?.name || 'Học sinh'}${studentGrade ? ` (Khối ${studentGrade})` : ''} • SBD: ${student.studentCode}`}
        onLogout={handlePortalLogout}
        headerSubtitle="Cổng Thi Trực Tuyến Chuẩn Hóa"
        themeColor="emerald"
      />

      {/* CỘT 2 (BÊN PHẢI - NỘI DUNG CHÍNH) */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onLogout={handlePortalLogout}
          userName={student.fullName}
          userRole="student"
          lang={lang}
        />

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
          
          {/* BANNER THÔNG TIN VÀ THỐNG KÊ TỔNG QUAN (Requirement B.4: SỐ BÀI ĐÃ LÀM, CHƯA LÀM) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Tổng Đề Thi
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {availableExams.length}
                </div>
              </div>
            </div>

            {/* SỐ BÀI ĐÃ LÀM */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Số Bài Đã Làm
                </div>
                <div className="text-2xl font-black text-emerald-600 font-mono">
                  {completedExamsCount}
                </div>
              </div>
            </div>

            {/* SỐ BÀI CHƯA LÀM */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <FileQuestion className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Số Bài Chưa Làm
                </div>
                <div className="text-2xl font-black text-amber-600 font-mono">
                  {pendingExamsCount}
                </div>
              </div>
            </div>

            {/* ĐIỂM CHUẨN ĐẠT */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Chuẩn Đạt Chỉ Tiêu
                </div>
                <div className="text-xl font-black text-purple-700 font-mono">
                  ≥ 950 / 1000đ
                </div>
              </div>
            </div>
          </div>

          {/* ================= TAB 1: PHÒNG THI TRỰC TUYẾN ================= */}
          {activeTab === 'exams' && (
            <div className="space-y-6">
              {/* Header Action Bar & Bộ Lọc Ngày (Requirement B.3) */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <PlayCircle className="w-5 h-5 text-emerald-600" />
                    <span>Danh Sách Đề Thi Do Giáo Viên Phân Công Tạo Ra</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Học sinh chỉ thấy các đề thi thuộc lớp hoặc do giáo viên phụ trách biên soạn.
                  </p>
                </div>

                {/* BỘ LỌC NGÀY XEM SỐ LẦN ĐÃ LÀM (Requirement B.3) */}
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl text-xs font-semibold">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">Thống kê ngày:</span>
                    <input
                      type="date"
                      value={selectedStatsDate}
                      onChange={(e) => setSelectedStatsDate(e.target.value)}
                      className="bg-transparent font-bold text-slate-800 outline-none"
                    />
                  </div>
                  {selectedStatsDate && (
                    <button
                      type="button"
                      onClick={() => setSelectedStatsDate('')}
                      className="text-xs text-emerald-700 font-bold hover:underline"
                    >
                      Tất cả ngày
                    </button>
                  )}
                </div>
              </div>

              {/* Grid danh sách đề thi */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {paginatedExams.map((ex) => {
                  const stats = getExamAttemptStatsForDate(ex.id);
                  const isAttempted = stats.attemptCount > 0;
                  const isPassed = stats.highestScore >= 950;

                  return (
                    <div
                      key={ex.id}
                      className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-1.5 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700">
                              {ex.subject}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              {formatGradeLabel(ex.grade || (ex.targetGrades && ex.targetGrades.length > 0 ? ex.targetGrades.join(', ') : 'Tất cả các khối'))}
                            </span>
                          </div>
                          {ex.isPracticeTest ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              Thi Thử Ngẫu Nhiên
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Chính Thức
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-slate-900 text-base leading-snug line-clamp-2">
                          {ex.title}
                        </h4>

                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                          <div>
                            <span>Thời gian:</span>{' '}
                            <strong className="text-slate-800">{ex.durationMinutes} phút</strong>
                          </div>
                          <div>
                            <span>Số câu hỏi:</span>{' '}
                            <strong className="text-slate-800">
                              {ex.isPracticeTest && ex.practiceRandomCount
                                ? `${ex.practiceRandomCount} / ${ex.questions?.length}`
                                : `${ex.questions?.length || 0}`} câu
                            </strong>
                          </div>
                          <div>
                            <span>Tổng điểm:</span>{' '}
                            <strong className="text-slate-800">1000 điểm</strong>
                          </div>
                          <div>
                            <span>Điểm đạt:</span>{' '}
                            <strong className="text-emerald-700">≥ 950 điểm</strong>
                          </div>
                        </div>

                        {/* Thống kê số lần làm theo ngày đã chọn (Requirement B.3) */}
                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">
                              {selectedStatsDate
                                ? `Đã làm vào ${selectedStatsDate}:`
                                : 'Số lần đã làm (Tổng):'}
                            </span>
                            <span className="font-bold font-mono text-slate-800">
                              {stats.attemptCount} lần
                            </span>
                          </div>

                          {isAttempted && (
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                              <span className="text-slate-500">Điểm cao nhất:</span>
                              <span
                                className={`font-mono font-black ${
                                  isPassed ? 'text-emerald-600' : 'text-red-600'
                                }`}
                              >
                                {stats.highestScore} / 1000đ ({isPassed ? 'ĐẠT' : 'CHƯA ĐẠT'})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Các nút hành động */}
                      <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                        {/* Nút Xem lại đáp án nếu đã từng làm */}
                        {isAttempted && ex.allowReviewAnswers && stats.latestSub && (
                          <button
                            type="button"
                            onClick={() => setReviewingSubmission(stats.latestSub)}
                            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Xem Lại Đáp Án</span>
                          </button>
                        )}

                        {/* Nút Bắt đầu làm bài / Làm lại (Xáo trộn câu hỏi & đáp án) */}
                        <button
                          type="button"
                          disabled={loadingExamId === ex.id}
                          onClick={() => handleStartExam(ex)}
                          className={`flex-1 py-2 px-3 rounded-xl text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                            loadingExamId === ex.id
                              ? 'bg-emerald-400 cursor-wait'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          {loadingExamId === ex.id ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Đang tải đề thi...</span>
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-4 h-4" />
                              <span>{isAttempted ? 'Làm Lại Đề Này' : 'Bắt Đầu Làm Bài'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredExams.length === 0 && (
                  <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 p-8 space-y-2">
                    <PlayCircle className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="text-sm font-bold text-slate-700">
                      Chưa có đề thi nào mở cho {studentClass ? `lớp ${studentClass.name}${studentGrade ? ` (Khối ${studentGrade})` : ''}` : 'lớp của bạn'}.
                    </p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Hệ thống tự động lọc đề thi theo khối lớp (Ví dụ: học sinh Lớp 8.1 sẽ chỉ thấy đề Khối 8, không thấy đề Khối 6 và 7). Vui lòng đợi giáo viên bộ môn đăng tải đề thi mới!
                    </p>
                  </div>
                )}
              </div>

              <Pagination
                currentPage={currentExamsPage}
                totalItems={filteredExams.length}
                pageSize={10}
                onPageChange={setExamsPage}
                itemName="đề thi"
                className="bg-white rounded-2xl border border-slate-200"
              />
            </div>
          )}

          {/* ================= TAB 2: KẾT QUẢ & XEM LẠI ĐÁP ÁN (Requirement B.2) ================= */}
          {activeTab === 'results' && (
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Award className="w-5 h-5 text-emerald-600" />
                    <span>Lịch Sử Kết Quả Khảo Thí & Xem Lại Đáp Án</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hệ thống lưu giữ đầy đủ snapshot câu hỏi, vùng đúng Hotspot (Màu xanh), vị trí chọn đúng (xanh)/sai (đỏ).
                  </p>
                </div>

                {/* Bộ lọc bài thi & ngày */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* BỘ LỌC CHỌN BÀI THI ĐỂ HIỂN THỊ TẤT CẢ SỐ LẦN ĐÃ LÀM */}
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300">
                    <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                    <select
                      value={selectedExamIdFilter}
                      onChange={(e) => {
                        setSelectedExamIdFilter(e.target.value);
                        setResultsPage(1);
                      }}
                      className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[260px] truncate"
                    >
                      <option value="all">-- Tất cả đề thi đã làm ({studentSubmissions.length} lượt) --</option>
                      {attemptedExamsList.map((item) => (
                        <option key={item.examId} value={item.examId}>
                          {item.examTitle} ({item.count} lần làm)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bộ lọc ngày */}
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="date"
                      value={selectedStatsDate}
                      onChange={(e) => {
                        setSelectedStatsDate(e.target.value);
                        setResultsPage(1);
                      }}
                      className="bg-transparent text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  {(selectedStatsDate || selectedExamIdFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStatsDate('');
                        setSelectedExamIdFilter('all');
                        setResultsPage(1);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer px-1.5 py-1"
                    >
                      Đặt lại
                    </button>
                  )}
                </div>
              </div>

              {/* BANNER THỐNG KÊ CHI TIẾT TẤT CẢ SỐ LẦN LÀM CỦA ĐỀ ĐANG CHỌN */}
              {selectedFilteredExamInfo && (
                <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/90 to-indigo-50/90 border border-indigo-200 rounded-3xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/20 shrink-0">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-wider text-indigo-700">
                        Chi Tiết Lịch Sử Làm Bài Của Đề Thi
                      </div>
                      <h4 className="text-base font-black text-slate-900 leading-tight">
                        {selectedFilteredExamInfo.examTitle}
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Hiển thị toàn bộ <strong>{selectedFilteredExamInfo.count} lần</strong> bạn đã hoàn thành bài thi này.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:border-l sm:border-indigo-200 sm:pl-5 shrink-0">
                    <div className="text-center px-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tổng Số Lần</div>
                      <div className="text-xl font-black font-mono text-indigo-600">
                        {selectedFilteredExamInfo.count} lần
                      </div>
                    </div>
                    <div className="text-center px-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Điểm Cao Nhất</div>
                      <div className="text-xl font-black font-mono text-emerald-600">
                        {selectedFilteredExamInfo.bestScore} / 1000
                      </div>
                    </div>
                    <div className="text-center px-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Lần Gần Nhất</div>
                      <div className="text-xl font-black font-mono text-slate-800">
                        {selectedFilteredExamInfo.latestScore} / 1000
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bảng kết quả bài làm */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase text-[11px]">
                      <tr>
                        <th className="py-3 px-4">Thời Gian Nộp</th>
                        <th className="py-3 px-4">Tên Đề Thi</th>
                        <th className="py-3 px-4 text-center">Thời Gian Làm</th>
                        <th className="py-3 px-4 text-center">Điểm Số (Thang 1000)</th>
                        <th className="py-3 px-4 text-center">Kết Quả</th>
                        <th className="py-3 px-4 text-center">Lần Thi Thứ</th>
                        <th className="py-3 px-4 text-center">Hành Động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedSubmissions.map((sub) => (
                        <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-slate-600">
                            {new Date(sub.submittedAt).toLocaleTimeString('vi-VN')}{' '}
                            {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{sub.examTitle}</div>
                            {sub.violationCount > 0 && (
                              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                                ⚠️ Vi phạm: {sub.violationCount} lần
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono text-slate-600">
                            {Math.floor(sub.timeSpentSeconds / 60)}p {sub.timeSpentSeconds % 60}s
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
                          <td className="py-3.5 px-4 text-center">
                            {sub.isPassed ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                ✓ ĐẠT (≥950đ)
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                                ✕ Chưa Đạt
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono text-slate-500">
                            #{sub.attemptNumber}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setReviewingSubmission(sub)}
                              className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1 mx-auto cursor-pointer transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Xem Lại Đáp Án</span>
                            </button>
                          </td>
                        </tr>
                      ))}

                      {filteredSubmissions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            Bạn chưa nộp bài thi nào. Hãy bắt đầu làm bài tại tab Danh Sách Bài Thi!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={currentResultsPage}
                  totalItems={filteredSubmissions.length}
                  pageSize={10}
                  onPageChange={setResultsPage}
                  itemName="bài thi"
                />
              </div>
            </div>
          )}

          {/* ================= TAB 3: NỘI QUY & CHỐNG GIAN LẬN PHÒNG THI ================= */}
          {activeTab === 'guide' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  <span>Quy Chế Khảo Thí & Hệ Thống Giám Sát Chống Gian Lận Đa Tầng</span>
                </h3>

                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-950 space-y-2">
                  <div className="font-bold text-red-800 uppercase tracking-wide">
                    ⚠️ Các hành vi bị nghiêm cấm tuyệt đối trong phòng thi:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-700">
                    <li>
                      <strong>Không được bấm chuột phải:</strong> Chức năng menu ngữ cảnh bị vô hiệu hóa hoàn toàn.
                    </li>
                    <li>
                      <strong>Không được quét khối / bôi đen văn bản:</strong> Thao tác chọn chữ, sao chép câu hỏi bị ngăn chặn.
                    </li>
                    <li>
                      <strong>Không được sử dụng phím tắt tìm kiếm / hỏi Google:</strong> Các tổ hợp phím như Ctrl+C, Ctrl+V, Ctrl+F, Ctrl+U, F12, DevTools bị chặn.
                    </li>
                    <li>
                      <strong>Quy định vi phạm & Giám sát:</strong> Khi phát hiện hành vi vi phạm (nhấp chuột phải, nhấn F12/DevTools, rời khỏi màn hình bài thi...), hệ thống <strong>không tự động nộp bài</strong> mà sẽ hiển thị thông báo nhắc nhở màu đỏ và <strong>tự động lưu lại chính xác số lần cùng thời điểm vi phạm</strong> để Giáo Viên xem và xử lý.
                    </li>
                  </ul>
                </div>

                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-950 space-y-2">
                  <div className="font-bold text-emerald-800 uppercase tracking-wide">
                    💡 Quy định về Thang điểm và Kết quả:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-700">
                    <li>Tổng điểm của mọi đề thi luôn chuẩn hóa cố định là <strong>1000 điểm</strong>.</li>
                    <li>Điểm đạt chứng chỉ/hoàn thành đề thi là <strong>950 điểm trở lên</strong>.</li>
                    <li>Mỗi khi bắt đầu làm bài hoặc bấm làm lại, câu hỏi và các phương án trả lời sẽ được <strong>tự động xáo trộn ngẫu nhiên</strong>.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ================= MODAL LÀM BÀI THI CHỐNG GIAN LẬN (Requirement B.5) ================= */}
      {takingExam && (
        <ExamTakingModal
          exam={takingExam}
          currentUser={student}
          isTeacherTesting={false}
          attemptNumber={
            studentSubmissions.filter((s) => s.examId === takingExam.id).length + 1
          }
          onClose={() => setTakingExam(null)}
          onSubmitSuccess={async (submission) => {
            try {
              await addExamSubmission(submission);
              showToast(`Đã nộp bài thi thành công! Điểm số: ${submission.score}/1000đ`);
            } catch (err) {
              console.error('Lỗi lưu submission:', err);
              throw err;
            }
          }}
          onReviewAnswers={(submission) => {
            setTakingExam(null);
            setReviewingSubmission(submission);
          }}
        />
      )}

      {/* ================= MODAL XEM LẠI ĐÁP ÁN (Requirement B.2) ================= */}
      {reviewingSubmission && (
        <ExamReviewModal
          submission={reviewingSubmission}
          allSubmissions={studentSubmissions}
          exams={exams}
          onClose={() => setReviewingSubmission(null)}
        />
      )}
    </div>
  );
};
