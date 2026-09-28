import React, { useState, useMemo } from 'react';
import {
  School as SchoolIcon,
  BookOpen,
  Users,
  UserCheck,
  Shield,
  Plus,
  Trash2,
  Edit2,
  Search,
  KeyRound,
  Download,
  Activity,
  LogOut,
  RefreshCw,
  X,
  Filter,
  CheckCircle,
  AlertTriangle,
  Lock,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Layers,
  GraduationCap,
  TrendingUp,
  ArrowUpRight,
  Database,
  Server,
  UserPlus,
  ArrowRightLeft,
  Check,
  Power,
  FileText,
  Award,
  Eye,
  FileCheck2,
  Clock,
  Sliders
} from 'lucide-react';
import { ThientchLogo } from './ThientchLogo.tsx';
import { Sidebar, SidebarMenuItem } from './Sidebar.tsx';
import { TopBar } from './TopBar.tsx';
import { AdminExamsTab } from './AdminExamsTab.tsx';
import { ExamReviewModal } from './ExamReviewModal.tsx';
import { ScoreRangeDeleteModal } from './ScoreRangeDeleteModal.tsx';
import { StorageOptimizationModal } from './StorageOptimizationModal.tsx';
import { TursoConfigModal } from './TursoConfigModal.tsx';
import { MultiTableSchemaModal } from './MultiTableSchemaModal.tsx';
import { onTursoError, isConfigured } from '../turso.ts';
import { Pagination } from './Pagination.tsx';
import {
  School,
  SchoolClass,
  Student,
  UserAccount,
  Language,
  UserRole,
  Exam,
  ExamSubmission
} from '../types/index.ts';
import {
  addSchool,
  updateSchool,
  deleteSchool,
  addClass,
  updateClass,
  deleteClass,
  addStudent,
  updateStudent,
  deleteStudent,
  deleteMultipleStudents,
  addUserAccount,
  updateUserAccount,
  deleteUserAccount,
  toggleStudentStatus,
  updateStudentUsername,
  moveStudentsToClass,
  assignTeacherSchoolAndClasses,
  deleteExamSubmission,
  deleteMultipleExamSubmissions,
  deleteStudentSubmissions,
  INITIAL_ADMIN_PASSWORD,
  refreshAllDataFromSupabase,
  onMissingQuestionsColumn,
  syncAllExamQuestionsToSupabase
} from '../services/dbService.ts';

interface AdminPortalProps {
  currentUser: UserAccount;
  onLogout: () => void;
  lang: Language;
  schools: School[];
  classes: SchoolClass[];
  students: Student[];
  users: UserAccount[];
  exams?: Exam[];
  submissions?: ExamSubmission[];
  isLiveSync: boolean;
}

type TabType = 'overview' | 'exams' | 'submissions' | 'schools' | 'classes' | 'students' | 'users' | 'permissions';

export const AdminPortal: React.FC<AdminPortalProps> = ({
  currentUser,
  onLogout,
  lang,
  schools,
  classes,
  students,
  users,
  exams = [],
  submissions = [],
  isLiveSync,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [globalSearch, setGlobalSearch] = useState('');
  const [adminExamsTeacherFilter, setAdminExamsTeacherFilter] = useState<string>('all');

  // Search & Filter States
  const [schoolSearch, setSchoolSearch] = useState('');
  const [classSchoolFilter, setClassSchoolFilter] = useState<string>('all');
  const [classSearch, setClassSearch] = useState('');
  const [studentSchoolFilter, setStudentSchoolFilter] = useState<string>('all');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');

  // Modals state
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);

  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);

  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userModalSchoolId, setUserModalSchoolId] = useState<string>('');
  const [userModalClassIds, setUserModalClassIds] = useState<string[]>([]);

  const [isExportPrintModalOpen, setIsExportPrintModalOpen] = useState(false);

  // Additional Admin Features Modal States
  // 1. Quick edit username modal
  const [editingUsernameStudent, setEditingUsernameStudent] = useState<Student | null>(null);
  const [newStudentUsername, setNewStudentUsername] = useState('');

  // 2. Move unassigned students to class modal
  const [isMoveStudentsModalOpen, setIsMoveStudentsModalOpen] = useState(false);
  const [targetMoveClassId, setTargetMoveClassId] = useState('');

  // 3. Assign teacher school & classes modal
  const [assigningTeacher, setAssigningTeacher] = useState<UserAccount | null>(null);
  const [teacherSchoolAssign, setTeacherSchoolAssign] = useState<string>('');
  const [teacherClassesAssign, setTeacherClassesAssign] = useState<string[]>([]);

  // 4. In-App Delete Confirmation Modal States (eliminates browser window.confirm blockers)
  const [classToDelete, setClassToDelete] = useState<SchoolClass | null>(null);
  const [isDeletingClass, setIsDeletingClass] = useState(false);

  const [schoolToDelete, setSchoolToDelete] = useState<School | null>(null);
  const [isDeletingSchool, setIsDeletingSchool] = useState(false);

  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);

  // Bulk Student Deletion States
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isBulkDeletingStudents, setIsBulkDeletingStudents] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Quản lý Bài Thi & Khảo Thí (Admin)
  const [submissionSchoolFilter, setSubmissionSchoolFilter] = useState<string>('all');
  const [submissionClassFilter, setSubmissionClassFilter] = useState<string>('all');
  const [submissionExamFilter, setSubmissionExamFilter] = useState<string>('all');
  const [submissionDateFilter, setSubmissionDateFilter] = useState<string>(''); // YYYY-MM-DD
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<'all' | 'passed' | 'failed' | 'violation'>('all');
  const [submissionSearch, setSubmissionSearch] = useState<string>('');

  // Bulk selection & modals cho Bài thi
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [submissionToReview, setSubmissionToReview] = useState<ExamSubmission | null>(null);
  const [submissionToDelete, setSubmissionToDelete] = useState<ExamSubmission | null>(null);
  const [isDeletingSubmission, setIsDeletingSubmission] = useState(false);
  const [isBulkDeleteSubmissionsOpen, setIsBulkDeleteSubmissionsOpen] = useState(false);
  const [isBulkDeletingSubmissions, setIsBulkDeletingSubmissions] = useState(false);
  const [isScoreRangeDeleteOpen, setIsScoreRangeDeleteOpen] = useState(false);
  const [isStorageOptimizationOpen, setIsStorageOptimizationOpen] = useState(false);

  // Pagination states (10 items per page)
  const [schoolsPage, setSchoolsPage] = useState<number>(1);
  const [classesPage, setClassesPage] = useState<number>(1);
  const [studentsPage, setStudentsPage] = useState<number>(1);
  const [usersPage, setUsersPage] = useState<number>(1);
  const [submissionsPage, setSubmissionsPage] = useState<number>(1);
  const [adminStudentSubsPage, setAdminStudentSubsPage] = useState<number>(1);

  // Modal bài thi của từng học sinh (Admin)
  const [adminStudentToViewSubmissions, setAdminStudentToViewSubmissions] = useState<Student | null>(null);
  const [isConfirmingDeleteAllForStudent, setIsConfirmingDeleteAllForStudent] = useState(false);
  const [isDeletingAllForStudent, setIsDeletingAllForStudent] = useState(false);

  // Notification Toast
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [isSupabaseConfigModalOpen, setIsSupabaseConfigModalOpen] = useState(false);
  const [isMultiTableModalOpen, setIsMultiTableModalOpen] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isMissingQuestionsColumn, setIsMissingQuestionsColumn] = useState(false);
  const [isSyncingQuestions, setIsSyncingQuestions] = useState(false);

  // Lắng nghe phát hiện thiếu cột questions trong bảng exams trên Turso
  React.useEffect(() => {
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

  // Thủ công làm mới dữ liệu từ Turso (dành riêng cho Admin)
  const handleRefreshData = async () => {
    if (isRefreshingData) return;
    setIsRefreshingData(true);
    try {
      const res = await refreshAllDataFromSupabase();
      if (res.success) {
        showToast(`✓ Đã đồng bộ máy chủ: ${res.examsCount} đề thi, ${res.studentsCount} học sinh, ${res.classesCount} lớp học!`);
      } else {
        showToast(`⚠️ ${res.message}`, 'error');
      }
    } catch {
      showToast('Lỗi kết nối tới máy chủ Turso. Vui lòng kiểm tra lại cấu hình!', 'error');
    } finally {
      setIsRefreshingData(false);
    }
  };

  // Lắng nghe lỗi từ Turso để cảnh báo ngay cho Quản trị viên
  React.useEffect(() => {
    const unsub = onTursoError((err: any) => {
      showToast(`⚠️ Lỗi máy chủ Turso (${err.table || 'SQL'}): ${err.error || err.message}`, 'error');
    });
    return () => unsub();
  }, []);

  const showToast = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Helper mappings
  const schoolMap = useMemo(() => {
    const map = new Map<string, School>();
    schools.forEach((s) => map.set(s.id, s));
    return map;
  }, [schools]);

  const classMap = useMemo(() => {
    const map = new Map<string, SchoolClass>();
    classes.forEach((c) => map.set(c.id, c));
    return map;
  }, [classes]);

  const examMap = useMemo(() => {
    const map = new Map<string, Exam>();
    exams.forEach((ex) => map.set(ex.id, ex));
    return map;
  }, [exams]);

  const studentSubmissionsCountMap = useMemo(() => {
    const map = new Map<string, number>();
    submissions.forEach((sub) => {
      map.set(sub.studentId, (map.get(sub.studentId) || 0) + 1);
    });
    return map;
  }, [submissions]);

  // Bộ lọc danh sách bài thi cho Admin
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      // 1. Trường học
      if (submissionSchoolFilter !== 'all') {
        const cls = classMap.get(sub.classId);
        if (!cls || cls.schoolId !== submissionSchoolFilter) return false;
      }
      // 2. Lớp học
      if (submissionClassFilter !== 'all') {
        if (sub.classId !== submissionClassFilter) return false;
      }
      // 3. Đề thi
      if (submissionExamFilter !== 'all') {
        if (sub.examId !== submissionExamFilter) return false;
      }
      // 4. Ngày thi
      if (submissionDateFilter) {
        if (sub.dateKey !== submissionDateFilter && !sub.submittedAt.startsWith(submissionDateFilter)) {
          return false;
        }
      }
      // 5. Trạng thái
      if (submissionStatusFilter === 'passed' && !sub.isPassed) return false;
      if (submissionStatusFilter === 'failed' && sub.isPassed) return false;
      if (submissionStatusFilter === 'violation' && (!sub.violationCount || sub.violationCount === 0)) return false;

      // 6. Tìm kiếm
      if (submissionSearch.trim()) {
        const q = submissionSearch.toLowerCase();
        const matchesName = sub.studentName?.toLowerCase().includes(q);
        const matchesCode = sub.studentCode?.toLowerCase().includes(q);
        const matchesExam = sub.examTitle?.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesExam) return false;
      }

      return true;
    });
  }, [
    submissions,
    submissionSchoolFilter,
    submissionClassFilter,
    submissionExamFilter,
    submissionDateFilter,
    submissionStatusFilter,
    submissionSearch,
    classMap
  ]);

  // Thống kê bài thi cho Admin
  const submissionKPIs = useMemo(() => {
    const total = submissions.length;
    const uniqueStudents = new Set(submissions.map((s) => s.studentId)).size;
    const passed = submissions.filter((s) => s.isPassed).length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    const violations = submissions.filter((s) => s.violationCount && s.violationCount > 0).length;
    return { total, uniqueStudents, passed, passRate, violations };
  }, [submissions]);

  // Xóa 1 bài thi (Admin)
  const handleConfirmDeleteSubmission = async () => {
    if (!submissionToDelete) return;
    setIsDeletingSubmission(true);
    try {
      await deleteExamSubmission(submissionToDelete.id);
      showToast(`Đã xóa bài thi của học sinh "${submissionToDelete.studentName}" thành công!`);
      if (submissionToReview?.id === submissionToDelete.id) {
        setSubmissionToReview(null);
      }
      setSelectedSubmissionIds((prev) => prev.filter((id) => id !== submissionToDelete.id));
      setSubmissionToDelete(null);
    } catch {
      showToast('Có lỗi xảy ra khi xóa bài thi. Vui lòng thử lại!', 'error');
    } finally {
      setIsDeletingSubmission(false);
    }
  };

  // Xóa hàng loạt bài thi (Admin)
  const handleConfirmBulkDeleteSubmissions = async () => {
    if (selectedSubmissionIds.length === 0) return;
    setIsBulkDeletingSubmissions(true);
    try {
      const count = await deleteMultipleExamSubmissions(selectedSubmissionIds);
      showToast(`Đã xóa thành công ${count} bài thi đã chọn!`);
      setSelectedSubmissionIds([]);
      setIsBulkDeleteSubmissionsOpen(false);
    } catch {
      showToast('Có lỗi xảy ra khi xóa bài thi hàng loạt.', 'error');
    } finally {
      setIsBulkDeletingSubmissions(false);
    }
  };

  // Xóa toàn bộ bài thi của 1 học sinh (Admin)
  const handleConfirmDeleteAllForStudent = async () => {
    if (!adminStudentToViewSubmissions) return;
    setIsDeletingAllForStudent(true);
    try {
      const count = await deleteStudentSubmissions(adminStudentToViewSubmissions.id, submissions);
      showToast(`Đã xóa toàn bộ ${count} bài thi của học sinh "${adminStudentToViewSubmissions.fullName}"!`);
      setIsConfirmingDeleteAllForStudent(false);
      setAdminStudentToViewSubmissions(null);
    } catch {
      showToast('Có lỗi xảy ra khi xóa bài thi của học sinh.', 'error');
    } finally {
      setIsDeletingAllForStudent(false);
    }
  };

  // Filtered queries
  const filteredSchools = useMemo(() => {
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(schoolSearch.toLowerCase()) ||
        s.code.toLowerCase().includes(schoolSearch.toLowerCase()) ||
        s.address.toLowerCase().includes(schoolSearch.toLowerCase())
    );
  }, [schools, schoolSearch]);

  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      const matchSchool = classSchoolFilter === 'all' || c.schoolId === classSchoolFilter;
      const matchSearch =
        c.name.toLowerCase().includes(classSearch.toLowerCase()) ||
        c.code.toLowerCase().includes(classSearch.toLowerCase()) ||
        c.homeroomTeacher.toLowerCase().includes(classSearch.toLowerCase());
      return matchSchool && matchSearch;
    });
  }, [classes, classSchoolFilter, classSearch]);

  const filteredStudents = useMemo(() => {
    return students.filter((st) => {
      const matchSchool = studentSchoolFilter === 'all' || st.schoolId === studentSchoolFilter;
      const matchClass = studentClassFilter === 'all' || st.classId === studentClassFilter;
      const matchSearch =
        st.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
        st.studentCode.toLowerCase().includes(studentSearch.toLowerCase()) ||
        st.username.toLowerCase().includes(studentSearch.toLowerCase());
      return matchSchool && matchClass && matchSearch;
    });
  }, [students, studentSchoolFilter, studentClassFilter, studentSearch]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchRole = userRoleFilter === 'all' || u.role === userRoleFilter;
      const matchSearch =
        u.fullName.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.subjects && u.subjects.toLowerCase().includes(userSearch.toLowerCase()));
      return matchRole && matchSearch;
    });
  }, [users, userRoleFilter, userSearch]);

  // Paginated data calculations (10 rows per page)
  const totalSchoolPages = Math.max(1, Math.ceil(filteredSchools.length / 10));
  const currentSchoolsPage = Math.min(schoolsPage, totalSchoolPages);
  const paginatedSchools = useMemo(() => {
    const start = (currentSchoolsPage - 1) * 10;
    return filteredSchools.slice(start, start + 10);
  }, [filteredSchools, currentSchoolsPage]);

  const totalClassPages = Math.max(1, Math.ceil(filteredClasses.length / 10));
  const currentClassesPage = Math.min(classesPage, totalClassPages);
  const paginatedClasses = useMemo(() => {
    const start = (currentClassesPage - 1) * 10;
    return filteredClasses.slice(start, start + 10);
  }, [filteredClasses, currentClassesPage]);

  const totalStudentPages = Math.max(1, Math.ceil(filteredStudents.length / 10));
  const currentStudentsPage = Math.min(studentsPage, totalStudentPages);
  const paginatedStudents = useMemo(() => {
    const start = (currentStudentsPage - 1) * 10;
    return filteredStudents.slice(start, start + 10);
  }, [filteredStudents, currentStudentsPage]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / 10));
  const currentUsersPage = Math.min(usersPage, totalUserPages);
  const paginatedUsers = useMemo(() => {
    const start = (currentUsersPage - 1) * 10;
    return filteredUsers.slice(start, start + 10);
  }, [filteredUsers, currentUsersPage]);

  const totalSubmissionPages = Math.max(1, Math.ceil(filteredSubmissions.length / 10));
  const currentSubmissionsPage = Math.min(submissionsPage, totalSubmissionPages);
  const paginatedSubmissions = useMemo(() => {
    const start = (currentSubmissionsPage - 1) * 10;
    return filteredSubmissions.slice(start, start + 10);
  }, [filteredSubmissions, currentSubmissionsPage]);

  const adminStudentSubmissions = useMemo(() => {
    if (!adminStudentToViewSubmissions) return [];
    return submissions.filter((s) => s.studentId === adminStudentToViewSubmissions.id);
  }, [submissions, adminStudentToViewSubmissions]);
  const totalAdminStudentSubsPages = Math.max(1, Math.ceil(adminStudentSubmissions.length / 10));
  const currentAdminStudentSubsPage = Math.min(adminStudentSubsPage, totalAdminStudentSubsPages);
  const paginatedAdminStudentSubs = useMemo(() => {
    const start = (currentAdminStudentSubsPage - 1) * 10;
    return adminStudentSubmissions.slice(start, start + 10);
  }, [adminStudentSubmissions, currentAdminStudentSubsPage]);

  // Form Submissions
  const handleSaveSchool = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const schoolData = {
      code: (formData.get('code') as string).trim(),
      name: (formData.get('name') as string).trim(),
      address: (formData.get('address') as string).trim(),
      phone: (formData.get('phone') as string).trim(),
      email: (formData.get('email') as string).trim(),
      level: formData.get('level') as School['level'],
    };

    if (editingSchool) {
      await updateSchool(editingSchool.id, schoolData, currentUser.username);
      showToast('Đã cập nhật thông tin trường học thành công!');
    } else {
      await addSchool(schoolData, currentUser.username);
      showToast('Đã thêm trường học mới vào hệ thống!');
    }
    setIsSchoolModalOpen(false);
    setEditingSchool(null);
  };

  const handleDeleteSchool = (s: School) => {
    setSchoolToDelete(s);
  };

  const handleConfirmDeleteSchool = async () => {
    if (!schoolToDelete) return;
    setIsDeletingSchool(true);
    try {
      const name = schoolToDelete.name;
      await deleteSchool(schoolToDelete.id, schoolToDelete.name, currentUser.username);
      showToast(`Đã xóa trường "${name}" thành công!`);
      setSchoolToDelete(null);
    } catch {
      showToast('Có lỗi xảy ra khi xóa trường học. Vui lòng thử lại!', 'error');
    } finally {
      setIsDeletingSchool(false);
    }
  };

  const handleSaveClass = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const classData = {
      schoolId: formData.get('schoolId') as string,
      code: (formData.get('code') as string).trim(),
      name: (formData.get('name') as string).trim(),
      grade: (formData.get('grade') as string).trim(),
      schoolYear: (formData.get('schoolYear') as string).trim(),
      homeroomTeacher: (formData.get('homeroomTeacher') as string).trim(),
      room: (formData.get('room') as string).trim(),
    };

    if (editingClass) {
      await updateClass(editingClass.id, classData, currentUser.username);
      showToast('Đã cập nhật lớp học thành công!');
    } else {
      await addClass(classData, currentUser.username);
      showToast('Đã tạo lớp học mới trực thuộc trường!');
    }
    setIsClassModalOpen(false);
    setEditingClass(null);
  };

  const handleDeleteClass = (c: SchoolClass) => {
    setClassToDelete(c);
  };

  const handleConfirmDeleteClass = async () => {
    if (!classToDelete) return;
    setIsDeletingClass(true);
    try {
      const name = classToDelete.name;
      await deleteClass(classToDelete.id, classToDelete.name, currentUser.username);
      showToast(`Đã xóa thành công lớp "${name}"!`);
      setClassToDelete(null);
    } catch {
      showToast('Có lỗi xảy ra khi xóa lớp học. Vui lòng thử lại!', 'error');
    } finally {
      setIsDeletingClass(false);
    }
  };

  const handleSaveStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const classId = formData.get('classId') as string;
    const selectedClass = classMap.get(classId);
    const schoolId = selectedClass ? selectedClass.schoolId : (formData.get('schoolId') as string);

    const studentData = {
      schoolId,
      classId,
      studentCode: (formData.get('studentCode') as string).trim(),
      fullName: (formData.get('fullName') as string).trim(),
      dateOfBirth: (formData.get('dateOfBirth') as string).trim(),
      gender: formData.get('gender') as Student['gender'],
      username: (formData.get('username') as string).trim(),
      password: (formData.get('password') as string).trim(),
      status: formData.get('status') as Student['status'],
      note: (formData.get('note') as string).trim(),
    };

    if (editingStudent) {
      await updateStudent(editingStudent.id, studentData, currentUser.username);
      showToast('Đã cập nhật thông tin học sinh thành công!');
    } else {
      await addStudent(studentData, currentUser.username);
      showToast('Đã cấp tài khoản học sinh mới thành công!');
    }
    setIsStudentModalOpen(false);
    setEditingStudent(null);
  };

  const handleDeleteStudent = (st: Student) => {
    setStudentToDelete(st);
  };

  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    setIsDeletingStudent(true);
    try {
      const name = studentToDelete.fullName;
      await deleteStudent(studentToDelete.id, studentToDelete.fullName, currentUser.username);
      showToast(`Đã xóa vĩnh viễn học sinh "${name}" khỏi cơ sở dữ liệu!`);
      setSelectedStudentIds((prev) => prev.filter((id) => id !== studentToDelete.id));
      setStudentToDelete(null);
    } catch {
      showToast('Có lỗi xảy ra khi xóa học sinh. Vui lòng thử lại!', 'error');
    } finally {
      setIsDeletingStudent(false);
    }
  };

  const handleConfirmBulkDeleteStudents = async () => {
    if (selectedStudentIds.length === 0) return;
    setIsBulkDeletingStudents(true);
    const count = selectedStudentIds.length;
    try {
      await deleteMultipleStudents(selectedStudentIds, currentUser.username);
      showToast(`Đã xóa vĩnh viễn ${count} học sinh khỏi cơ sở dữ liệu!`);
      setSelectedStudentIds([]);
      setIsBulkDeleteModalOpen(false);
    } catch {
      showToast('Có lỗi xảy ra khi xóa học sinh hàng loạt. Vui lòng thử lại!', 'error');
    } finally {
      setIsBulkDeletingStudents(false);
    }
  };

  const handleOpenUserModal = (u?: UserAccount | null) => {
    if (u) {
      setEditingUser(u);
      setUserModalSchoolId(u.schoolIds && u.schoolIds.length > 1 ? 'all' : (u.schoolId || 'all'));
      setUserModalClassIds(u.classIds ? [...u.classIds] : []);
    } else {
      setEditingUser(null);
      setUserModalSchoolId('all');
      setUserModalClassIds([]);
    }
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const role = formData.get('role') as UserRole;
    const fullName = (formData.get('fullName') as string).trim();
    const username = (formData.get('username') as string).trim();

    // Đối với Giáo viên: Lưu giữ trọn vẹn danh sách các trường và các lớp đã phân công
    const finalClassIds = role === 'teacher' ? userModalClassIds : [];
    const selectedSchoolSet = new Set<string>();
    classes.forEach((c) => {
      if (userModalClassIds.includes(c.id) && c.schoolId) {
        selectedSchoolSet.add(c.schoolId);
      }
    });
    if (userModalSchoolId && userModalSchoolId !== 'all') {
      selectedSchoolSet.add(userModalSchoolId);
    }
    const finalSchoolIds = Array.from(selectedSchoolSet);
    const finalSchoolId = finalSchoolIds[0] || (userModalSchoolId !== 'all' ? userModalSchoolId : undefined);

    const userData: Partial<UserAccount> & Omit<UserAccount, 'id' | 'createdAt' | 'updatedAt'> = {
      fullName,
      username,
      password: (formData.get('password') as string).trim(),
      email: (formData.get('email') as string).trim(),
      phone: (formData.get('phone') as string).trim(),
      subjects: (formData.get('subjects') as string).trim(),
      role,
      schoolId: finalSchoolId,
      schoolIds: finalSchoolIds,
      classIds: finalClassIds,
      status: formData.get('status') as UserAccount['status'],
    };

    if (editingUser) {
      await updateUserAccount(editingUser.id, userData, currentUser.username);
      showToast(`Đã cập nhật thông tin và danh sách lớp của giáo viên ${fullName} thành công!`);
    } else {
      await addUserAccount(userData, currentUser.username);
      showToast('Đã cấp tài khoản giáo viên/nhân sự mới thành công!');
    }
    setIsUserModalOpen(false);
    setEditingUser(null);
  };

  const handleDeleteUser = (u: UserAccount) => {
    if (u.username === 'admin') {
      showToast('Không thể xóa tài khoản Quản trị viên gốc của hệ thống!', 'error');
      return;
    }
    setUserToDelete(u);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    if (userToDelete.username === 'admin') {
      showToast('Không thể xóa tài khoản Quản trị viên gốc của hệ thống!', 'error');
      setUserToDelete(null);
      return;
    }
    setIsDeletingUser(true);
    try {
      const name = userToDelete.fullName || userToDelete.username;
      await deleteUserAccount(userToDelete.id, userToDelete.username, currentUser.username);
      showToast(`Đã xóa tài khoản "${name}" thành công!`);
      setUserToDelete(null);
    } catch {
      showToast('Có lỗi xảy ra khi xóa tài khoản. Vui lòng thử lại!', 'error');
    } finally {
      setIsDeletingUser(false);
    }
  };

  // 3b. Sửa tên đăng nhập của học sinh
  const handleSaveStudentUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUsernameStudent) return;
    const cleanUsername = newStudentUsername.trim();
    if (!cleanUsername) {
      showToast('Tên đăng nhập không được để trống!', 'error');
      return;
    }
    await updateStudentUsername(editingUsernameStudent.id, cleanUsername, currentUser.username);
    showToast(`Đã đổi tên đăng nhập của học sinh thành "${cleanUsername}" thành công!`);
    setEditingUsernameStudent(null);
    setNewStudentUsername('');
  };

  // 3c. Kích hoạt hoặc khóa tài khoản học sinh
  const handleToggleStudentStatus = async (st: Student) => {
    const nextStatus = await toggleStudentStatus(st.id, st.status, currentUser.username);
    showToast(
      nextStatus === 'active'
        ? `Đã kích hoạt tài khoản cho học sinh ${st.fullName}!`
        : `Đã tạm khóa tài khoản học sinh ${st.fullName}!`
    );
  };

  // 3d. Di chuyển học sinh chưa phân lớp vào lớp học
  const unassignedStudents = useMemo(() => {
    return students.filter((st) => !st.classId || st.classId === '' || !classMap.has(st.classId));
  }, [students, classMap]);

  const handleMoveUnassignedStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMoveClassId) {
      showToast('Vui lòng chọn lớp học tiếp nhận!', 'error');
      return;
    }
    const targetClass = classMap.get(targetMoveClassId);
    if (!targetClass) return;

    const idsToMove = unassignedStudents.map((st) => st.id);
    if (idsToMove.length === 0) {
      showToast('Không có học sinh nào chưa phân lớp!', 'error');
      setIsMoveStudentsModalOpen(false);
      return;
    }

    await moveStudentsToClass(idsToMove, targetClass.id, targetClass.schoolId, currentUser.username);
    showToast(`Đã chuyển thành công ${idsToMove.length} học sinh vào lớp "${targetClass.name}"!`);
    setIsMoveStudentsModalOpen(false);
    setTargetMoveClassId('');
  };

  // 4b. Phân trường và lớp cho giáo viên
  const handleSaveTeacherSchoolAndClasses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningTeacher) return;

    await assignTeacherSchoolAndClasses(
      assigningTeacher.id,
      teacherSchoolAssign,
      teacherClassesAssign,
      currentUser.username
    );
    showToast(`Đã phân công trường và lớp cho giáo viên ${assigningTeacher.fullName || assigningTeacher.username} thành công!`);
    setAssigningTeacher(null);
  };

  const adminMenuItems: SidebarMenuItem[] = [
    { id: 'overview', label: 'Tổng quan hệ thống', icon: Activity },
    { id: 'exams', label: 'Quản lý Đề thi giáo viên', icon: FileText, badge: exams.length },
    { id: 'submissions', label: 'Quản lý Bài thi & Khảo thí', icon: FileCheck2, badge: submissions.length },
    { id: 'schools', label: 'Quản lý Trường học', icon: SchoolIcon, badge: schools.length },
    { id: 'classes', label: 'Quản lý Lớp học', icon: BookOpen, badge: classes.length },
    { id: 'students', label: 'Quản lý Học sinh', icon: Users, badge: students.length },
    { id: 'users', label: 'Tài khoản & Giáo viên', icon: UserCheck, badge: users.length },
    { id: 'permissions', label: 'Phân quyền & Bảo mật', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row font-sans antialiased text-slate-800">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-3 duration-200">
          <div className={`px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2.5 text-sm font-medium ${
            toastMsg.type === 'success' 
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
              : toastMsg.type === 'warning'
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}>
            {toastMsg.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            ) : toastMsg.type === 'warning' ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600" />
            )}
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      {/* CỘT 1 (BÊN TRÁI - MENU CHỨC NĂNG / DARK SIDEBAR: 20-25% WIDTH, STICKY) */}
      <Sidebar
        menuItems={adminMenuItems}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as TabType)}
        userRoleName="QUẢN TRỊ VIÊN HỆ THỐNG"
        userName={currentUser.fullName || currentUser.username}
        userSubtext={`@${currentUser.username} (Toàn quyền)`}
        onLogout={onLogout}
        headerSubtitle="Cổng Quản Trị Khảo Thí IT"
        themeColor="blue"
      />

      {/* CỘT 2 (BÊN PHẢI - WORKSPACE: 80% WIDTH, NỀN #F8FAFC SLATE-50) */}
      <div className="w-full lg:w-[80%] flex-1 flex flex-col min-w-0 bg-[#F8FAFC] min-h-screen">
        
        {/* Thanh điều hướng trên (Top Bar): Tìm kiếm thông minh Ctrl + K, LIVE SYNC Pulsing Dot, Thông báo ưu tiên, Đồng hồ thời gian thực */}
        <TopBar
          searchQuery={globalSearch}
          onSearchChange={setGlobalSearch}
          searchPlaceholder="Tìm kiếm trường, lớp, học sinh, giáo viên... (Ctrl + K)"
          roleBadgeText="Phân hệ Quản trị"
          roleBadgeColor="blue"
          isLiveSync={isLiveSync}
          lang={lang}
          onOpenSupabaseConfig={() => setIsSupabaseConfigModalOpen(true)}
          onRefresh={handleRefreshData}
          isRefreshing={isRefreshingData}
        />

        {/* Vùng làm việc chính (Workspace): Nền #F8FAFC dịu mắt */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* ================= TAB 1: OVERVIEW ================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">

            {/* Cảnh báo khi chưa kết nối Turso Cloud */}
            {!isLiveSync && (
              <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-200/80 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-amber-900">
                      Hệ thống đang hoạt động ở chế độ Bộ Nhớ Cục Bộ (Local Storage)
                    </h4>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Dữ liệu hiện lưu trên trình duyệt này và <strong>chưa đồng bộ lên Turso Database</strong>. Chỉ tài khoản Quản trị viên mới có quyền cấu hình kết nối.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={handleRefreshData}
                    disabled={isRefreshingData}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    title="Thử kết nối lại và tải dữ liệu từ máy chủ"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshingData ? 'animate-spin' : ''}`} />
                    <span>{isRefreshingData ? 'Đang tải...' : 'Làm Mới'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSupabaseConfigModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Tùy Chỉnh Kết Nối</span>
                  </button>
                </div>
              </div>
            )}
            
            {/* Cảnh báo khi phát hiện bảng exams thiếu cột questions */}
            {isMissingQuestionsColumn && (
              <div className="p-4 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-200/80 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-amber-900 flex items-center gap-2">
                      <span>Cơ sở dữ liệu Turso chưa có cột "questions" trong bảng exams</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">Cần bổ sung</span>
                    </h4>
                    <p className="text-xs text-amber-800 mt-0.5 max-w-3xl">
                      Đề thi đang lưu thông tin chung trên Turso nhưng các câu hỏi chi tiết chưa được ghi vào CSDL vì thiếu cột <code className="font-mono bg-white px-1 py-0.5 rounded text-red-700 font-bold border border-amber-200">questions (TEXT)</code>.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setIsMultiTableModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    title="Mở cấu trúc phân tách nhiều bảng CSDL và di chuyển dữ liệu"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Tách Nhiều Bảng CSDL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSupabaseConfigModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Lấy Mã SQL Sửa Ngay</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncQuestions}
                    disabled={isSyncingQuestions}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-amber-700 ${isSyncingQuestions ? 'animate-spin' : ''}`} />
                    <span>{isSyncingQuestions ? 'Đang đồng bộ...' : 'Đồng Bộ Câu Hỏi'}</span>
                  </button>
                </div>
              </div>
            )}
            
            {/* ================= ZONE 1: TOP METRICS (THẺ CHỈ SỐ) ================= */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                  CHỈ SỐ TỔNG QUAN HỆ THỐNG
                </h2>
                <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Cập nhật thời gian thực
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-5">
                
                {/* Metric 1: Trường học */}
                <div className="p-5 rounded-xl border bg-white card-hover-effect">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cơ sở trường học</span>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center shadow-2xs">
                      <SchoolIcon className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <h3 className="text-3xl font-black text-[#0F172A] tracking-tight">{schools.length}</h3>
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      +100%
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Trực thuộc quản trị</span>
                    <button 
                      onClick={() => setActiveTab('schools')}
                      className="text-[#2563EB] font-bold hover:underline cursor-pointer"
                    >
                      Chi tiết →
                    </button>
                  </div>
                </div>

                {/* Metric 2: Lớp học */}
                <div className="p-5 rounded-xl border bg-white card-hover-effect">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lớp học phân bổ</span>
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center shadow-2xs">
                      <BookOpen className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <h3 className="text-3xl font-black text-[#0F172A] tracking-tight">{classes.length}</h3>
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      +12.5%
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Phòng thi tiêu chuẩn</span>
                    <button 
                      onClick={() => setActiveTab('classes')}
                      className="text-[#4F46E5] font-bold hover:underline cursor-pointer"
                    >
                      Chi tiết →
                    </button>
                  </div>
                </div>

                {/* Metric 3: Học sinh */}
                <div className="p-5 rounded-xl border bg-white card-hover-effect">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Học sinh & SBD</span>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#10B981] flex items-center justify-center shadow-2xs">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <h3 className="text-3xl font-black text-[#0F172A] tracking-tight">{students.length}</h3>
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      +28.4%
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Đã cấp tài khoản thi</span>
                    <button 
                      onClick={() => setActiveTab('students')}
                      className="text-[#10B981] font-bold hover:underline cursor-pointer"
                    >
                      Chi tiết →
                    </button>
                  </div>
                </div>

                {/* Metric 4: Giáo viên & Cán bộ */}
                <div className="p-5 rounded-xl border bg-white card-hover-effect">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cán bộ & Giảng viên</span>
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-2xs">
                      <UserCheck className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <h3 className="text-3xl font-black text-[#0F172A] tracking-tight">{users.length}</h3>
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Ổn định
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Phân quyền khảo thí</span>
                    <button 
                      onClick={() => setActiveTab('users')}
                      className="text-purple-600 font-bold hover:underline cursor-pointer"
                    >
                      Chi tiết →
                    </button>
                  </div>
                </div>

                {/* Metric 5: Đề thi giáo viên biên soạn */}
                <div className="p-5 rounded-xl border bg-white card-hover-effect">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đề thi giáo viên</span>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
                      <FileText className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <h3 className="text-3xl font-black text-blue-700 tracking-tight font-mono">{exams.length}</h3>
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                      {exams.filter((e) => e.status === 'published').length} mở thi
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Quản trị toàn diện</span>
                    <button 
                      onClick={() => {
                        setAdminExamsTeacherFilter('all');
                        setActiveTab('exams');
                      }}
                      className="text-blue-600 font-bold hover:underline cursor-pointer"
                    >
                      Quản lý đề →
                    </button>
                  </div>
                </div>

                {/* Metric 6: Bài thi & Khảo thí */}
                <div className="p-5 rounded-xl border bg-white card-hover-effect">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bài thi đã nộp</span>
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-2xs">
                      <FileCheck2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <h3 className="text-3xl font-black text-indigo-700 tracking-tight">{submissions.length}</h3>
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      Đạt {submissionKPIs.passRate}%
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Quản lý & Giám sát</span>
                    <button 
                      onClick={() => setActiveTab('submissions')}
                      className="text-indigo-600 font-bold hover:underline cursor-pointer"
                    >
                      Khảo thí →
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* ================= ZONE 2 & ZONE 3: MAIN ACTIONS (GRID 2-COL) & SYSTEM STATUS PANEL ================= */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* KHU VỰC 2: MAIN ACTIONS (HÀNH ĐỘNG NHANH) - CHIẾM 8/12 CỘT */}
              <div className="lg:col-span-8 space-y-5">
                <div className="p-6 bg-white rounded-xl border border-[#E2E8F0] shadow-xs space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                        <Activity className="w-5 h-5 text-[#2563EB]" />
                        Hành Động Nhanh (Main Actions)
                      </h3>
                      <p className="text-xs text-[#475569] mt-0.5">
                        Các khối thao tác nghiệp vụ được nhóm gọn gàng theo chuẩn Grid 2 column
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-[#2563EB] border border-blue-100 hidden sm:inline-block">
                      Quản trị tức thời
                    </span>
                  </div>

                  {/* Grid 2 Column Main Actions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Action 1: Thêm Trường */}
                    <button
                      onClick={() => {
                        setEditingSchool(null);
                        setIsSchoolModalOpen(true);
                      }}
                      className="p-4 rounded-xl border border-[#E2E8F0] card-hover-effect text-left group cursor-pointer primary-cta-btn"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-[#2563EB] group-hover:text-white transition-all">
                          <Plus className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#0F172A] group-hover:text-[#2563EB] transition-colors">
                            Thêm Trường Học Mới
                          </div>
                          <div className="text-xs text-[#475569] mt-0.5 line-clamp-2">
                            Khai báo mã trường, tên trường, địa chỉ và thông tin đơn vị đào tạo
                          </div>
                          <span className="text-[11px] font-bold text-[#2563EB] mt-2 inline-flex items-center gap-1">
                            Tạo cơ sở mới →
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Action 2: Tạo Lớp Học */}
                    <button
                      onClick={() => {
                        setEditingClass(null);
                        setIsClassModalOpen(true);
                      }}
                      className="p-4 rounded-xl border border-[#E2E8F0] card-hover-effect text-left group cursor-pointer primary-cta-btn"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-[#4F46E5] group-hover:text-white transition-all">
                          <Plus className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#0F172A] group-hover:text-[#4F46E5] transition-colors">
                            Tạo Lớp Thuộc Trường
                          </div>
                          <div className="text-xs text-[#475569] mt-0.5 line-clamp-2">
                            Phân khối, niên khóa, phòng thi và gán giáo viên chủ nhiệm
                          </div>
                          <span className="text-[11px] font-bold text-[#4F46E5] mt-2 inline-flex items-center gap-1">
                            Mở lớp mới →
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Action 3: Cấp TK Học Sinh */}
                    <button
                      onClick={() => {
                        setEditingStudent(null);
                        setIsStudentModalOpen(true);
                      }}
                      className="p-4 rounded-xl border border-[#E2E8F0] card-hover-effect text-left group cursor-pointer primary-cta-btn"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#10B981] flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-[#10B981] group-hover:text-white transition-all">
                          <Plus className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#0F172A] group-hover:text-[#10B981] transition-colors">
                            Cấp Tài Khoản Học Sinh
                          </div>
                          <div className="text-xs text-[#475569] mt-0.5 line-clamp-2">
                            Tự động sinh SBD và mật khẩu thi cấp sẵn theo chuẩn phòng thi IT
                          </div>
                          <span className="text-[11px] font-bold text-[#10B981] mt-2 inline-flex items-center gap-1">
                            Cấp thí sinh mới →
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Action 4: Cấp TK Giáo Viên */}
                    <button
                      onClick={() => handleOpenUserModal(null)}
                      className="p-4 rounded-xl border border-[#E2E8F0] card-hover-effect text-left group cursor-pointer primary-cta-btn"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-purple-600 group-hover:text-white transition-all">
                          <Plus className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#0F172A] group-hover:text-purple-600 transition-colors">
                            Cấp Tài Khoản Giáo Viên
                          </div>
                          <div className="text-xs text-[#475569] mt-0.5 line-clamp-2">
                            Phân quyền cán bộ chấm thi trắc nghiệm, giám thị và phụ trách môn
                          </div>
                          <span className="text-[11px] font-bold text-purple-600 mt-2 inline-flex items-center gap-1">
                            Phân quyền giáo viên →
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Action 5: Quản Lý Đề Thi Giáo Viên (MỚI) */}
                    <button
                      onClick={() => {
                        setAdminExamsTeacherFilter('all');
                        setActiveTab('exams');
                      }}
                      className="p-4 rounded-xl border border-blue-200 card-hover-effect text-left group cursor-pointer primary-cta-btn bg-gradient-to-br from-white to-blue-50/40"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-2xs">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#0F172A] group-hover:text-[#2563EB] transition-colors flex items-center gap-1.5">
                            <span>Quản Lý Đề Thi Giáo Viên</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Toàn quyền</span>
                          </div>
                          <div className="text-xs text-[#475569] mt-0.5 line-clamp-2">
                            Duyệt đề, chỉnh sửa câu hỏi, gộp đề, mở/ẩn đề và làm thử nghiệm của toàn bộ giáo viên
                          </div>
                          <span className="text-[11px] font-bold text-[#2563EB] mt-2 inline-flex items-center gap-1">
                            Quản lý {exams.length} đề thi →
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Action 6: Giám Sát Khảo Thí & Bài Nộp (MỚI) */}
                    <button
                      onClick={() => setActiveTab('submissions')}
                      className="p-4 rounded-xl border border-indigo-200 card-hover-effect text-left group cursor-pointer primary-cta-btn bg-gradient-to-br from-white to-indigo-50/40"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-2xs">
                          <FileCheck2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#0F172A] group-hover:text-[#4F46E5] transition-colors flex items-center gap-1.5">
                            <span>Giám Sát Bài Thi & Kết Quả</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">Thời gian thực</span>
                          </div>
                          <div className="text-xs text-[#475569] mt-0.5 line-clamp-2">
                            Xem bài làm, điểm số, cảnh báo gian lận và tối ưu dung lượng lưu trữ CSDL
                          </div>
                          <span className="text-[11px] font-bold text-[#4F46E5] mt-2 inline-flex items-center gap-1">
                            Xem {submissions.length} bài nộp →
                          </span>
                        </div>
                      </div>
                    </button>

                  </div>

                  {/* Standard Security Notice */}
                  <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-900">
                    <div className="flex items-center gap-2.5">
                      <Shield className="w-4 h-4 text-[#2563EB] shrink-0" />
                      <div>
                        Quản trị viên tiêu chuẩn: <strong className="font-mono">admin</strong> | Mật khẩu chỉ định: <code className="bg-white px-2 py-0.5 rounded text-[#2563EB] font-mono font-bold border border-blue-200">8653564@Thien</code>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('permissions')}
                      className="font-bold text-[#2563EB] hover:underline cursor-pointer shrink-0 primary-cta-btn"
                    >
                      Cấu hình bảo mật →
                    </button>
                  </div>
                </div>

                {/* Secondary Fast Action Row */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <button
                    onClick={() => {
                      setAdminExamsTeacherFilter('all');
                      setActiveTab('exams');
                    }}
                    className="p-3.5 bg-white rounded-xl border border-[#E2E8F0] card-hover-effect text-left flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-[#0F172A]">Đề thi giáo viên</span>
                    </div>
                    <span className="text-xs text-blue-600 font-mono font-bold">({exams.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('schools')}
                    className="p-3.5 bg-white rounded-xl border border-[#E2E8F0] card-hover-effect text-left flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <SchoolIcon className="w-4 h-4 text-[#2563EB]" />
                      <span className="text-xs font-bold text-[#0F172A]">Danh sách trường</span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">({schools.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('classes')}
                    className="p-3.5 bg-white rounded-xl border border-[#E2E8F0] card-hover-effect text-left flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <BookOpen className="w-4 h-4 text-[#4F46E5]" />
                      <span className="text-xs font-bold text-[#0F172A]">Danh sách lớp</span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">({classes.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('students')}
                    className="p-3.5 bg-white rounded-xl border border-[#E2E8F0] card-hover-effect text-left flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-[#10B981]" />
                      <span className="text-xs font-bold text-[#0F172A]">Danh sách thí sinh</span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">({students.length})</span>
                  </button>
                </div>
              </div>

              {/* KHU VỰC 3: SYSTEM STATUS PANEL (CỘT TRẠNG THÁI HỆ THỐNG - ĐẶT BÊN PHẢI NGOÀI CÙNG) - CHIẾM 4/12 CỘT */}
              <div className="lg:col-span-4 space-y-5">
                <div className="p-6 bg-white rounded-xl border border-[#E2E8F0] shadow-xs space-y-4">
                  
                  {/* Panel Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                        <Server className="w-4 h-4 text-[#2563EB]" />
                        Trạng Thái Máy Chủ
                      </h3>
                      <p className="text-[11px] text-[#475569]">Tài nguyên dữ liệu Real-time (Admin Only)</p>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isLiveSync
                        ? 'bg-emerald-50 text-[#10B981] border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      <span className="relative flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                          isLiveSync ? 'bg-[#10B981]' : 'bg-amber-500'
                        }`} />
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${
                          isLiveSync ? 'bg-[#10B981]' : 'bg-amber-500'
                        }`} />
                      </span>
                      {isLiveSync ? 'Turso Online' : 'Chế độ Cục bộ'}
                    </span>
                  </div>

                  {/* Resource Counters */}
                  <div className="space-y-2.5">
                    
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 text-xs text-[#0F172A] font-semibold">
                        <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#2563EB] flex items-center justify-center">
                          <SchoolIcon className="w-3.5 h-3.5" />
                        </div>
                        <span>Trường học đã kết nối</span>
                      </div>
                      <span className="text-sm font-extrabold text-[#0F172A] font-mono">{schools.length}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 text-xs text-[#0F172A] font-semibold">
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 text-[#4F46E5] flex items-center justify-center">
                          <BookOpen className="w-3.5 h-3.5" />
                        </div>
                        <span>Lớp học trong hệ thống</span>
                      </div>
                      <span className="text-sm font-extrabold text-[#0F172A] font-mono">{classes.length}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 text-xs text-[#0F172A] font-semibold">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#10B981] flex items-center justify-center">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <span>Thí sinh sẵn sàng thi</span>
                      </div>
                      <span className="text-sm font-extrabold text-[#10B981] font-mono">{students.length}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 text-xs text-[#0F172A] font-semibold">
                        <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                          <UserCheck className="w-3.5 h-3.5" />
                        </div>
                        <span>Cán bộ & Giám thị</span>
                      </div>
                      <span className="text-sm font-extrabold text-[#0F172A] font-mono">{users.length}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 text-xs text-[#0F172A] font-semibold">
                        <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <span>Đề thi giáo viên đã tạo</span>
                      </div>
                      <span className="text-sm font-extrabold text-blue-700 font-mono">{exams.length}</span>
                    </div>

                  </div>

                  {/* Real-time Health Indicators */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#475569]">Độ trễ máy chủ:</span>
                      <span className="font-mono font-bold text-emerald-600">
                        {isLiveSync ? '~12 ms (Tối ưu)' : 'Offline / Bộ nhớ cục bộ'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#475569]">Quyền sửa kết nối:</span>
                      <span className="font-mono font-bold text-[#2563EB]">Chỉ Quản Trị Viên (Admin)</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#475569]">Khóa màn hình phòng thi:</span>
                      <span className="font-bold text-emerald-600">SẴN SÀNG</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#475569]">Turso & GitHub:</span>
                      <span className="font-bold text-blue-600 font-mono">SQLite Cloud (~0.8KB/bài)</span>
                    </div>
                  </div>

                  {/* Khu vực Tuỳ chỉnh & Làm mới Máy chủ (Admin Only) */}
                  <div className="pt-3 border-t border-slate-100 space-y-2.5">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-600" />
                      <span>Quản Trị Kết Nối & Đồng Bộ</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsSupabaseConfigModalOpen(true)}
                        className="py-2.5 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                        title="Tùy chỉnh URL và Auth Token Turso & GitHub Storage (Chỉ Admin)"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Sửa Kết Nối</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRefreshData}
                        disabled={isRefreshingData}
                        className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-60"
                        title="Lấy lại toàn bộ dữ liệu mới nhất từ máy chủ Turso"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshingData ? 'animate-spin' : ''}`} />
                        <span>{isRefreshingData ? 'Đang tải...' : 'Làm Mới'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsStorageOptimizationOpen(true)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                    >
                      <Database className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Tối Ưu & Dọn Dẹp CSDL Free</span>
                    </button>
                  </div>

                </div>
              </div>

            </div>

          </div>
        )}

        {/* ================= TAB 2: QUẢN LÝ TRƯỜNG ================= */}
        {activeTab === 'schools' && (
          <div className="space-y-4">
            
            {/* Header controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <SchoolIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Danh Sách Trường Học</h2>
                  <p className="text-xs text-slate-500">Thêm, xóa, sửa thông tin các cơ sở đào tạo và trường học</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên, mã trường..."
                    value={schoolSearch}
                    onChange={(e) => setSchoolSearch(e.target.value)}
                    className="pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none w-48 sm:w-64"
                  />
                </div>

                <button
                  onClick={() => {
                    setEditingSchool(null);
                    setIsSchoolModalOpen(true);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap primary-cta-btn"
                >
                  <Plus className="w-4 h-4" />
                  Thêm Trường Mới
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                    <tr>
                      <th className="py-3 px-4 text-center w-16">STT</th>
                      <th className="py-3 px-4">Tên Trường</th>
                      <th className="py-3 px-4">Cấp học</th>
                      <th className="py-3 px-4">Địa chỉ</th>
                      <th className="py-3 px-4">Liên hệ</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedSchools.map((s, index) => {
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* 1. STT */}
                          <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-500">
                            {(currentSchoolsPage - 1) * 10 + index + 1}
                          </td>

                          {/* 2. Tên Trường */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 text-sm">{s.name}</div>
                            {s.code && (
                              <div className="text-[11px] text-blue-600 font-mono font-normal">
                                Mã: {s.code}
                              </div>
                            )}
                          </td>

                          {/* 3. Cấp học */}
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold uppercase">
                              {s.level === 'highschool' ? 'THPT' : s.level === 'secondary' ? 'THCS' : s.level === 'university' ? 'ĐH/CĐ' : 'Khác'}
                            </span>
                          </td>

                          {/* 4. Địa chỉ */}
                          <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate" title={s.address}>
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{s.address || 'Chưa cập nhật'}</span>
                            </div>
                          </td>

                          {/* 5. Liên hệ */}
                          <td className="py-3.5 px-4 text-slate-600 text-xs">
                            {s.phone && <div className="font-medium text-slate-800">📞 {s.phone}</div>}
                            {s.email && <div className="text-slate-400 text-[11px]">✉️ {s.email}</div>}
                            {!s.phone && !s.email && <span className="text-slate-400 italic">Chưa có</span>}
                          </td>

                          {/* 6. Thao tác */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingSchool(s);
                                  setIsSchoolModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
                                title="Sửa trường"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteSchool(s)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                                title="Xóa trường"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredSchools.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Không tìm thấy trường học nào. Vui lòng bấm &quot;Thêm Trường Mới&quot; để khởi tạo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={currentSchoolsPage}
                totalItems={filteredSchools.length}
                pageSize={10}
                onPageChange={setSchoolsPage}
                itemName="trường học"
              />
            </div>

          </div>
        )}

        {/* ================= TAB 3: QUẢN LÝ LỚP ================= */}
        {activeTab === 'classes' && (
          <div className="space-y-4">
            
            {/* Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Danh Sách Lớp Thuộc Trường</h2>
                  <p className="text-xs text-slate-500">Quản lý lớp học, khối, giáo viên chủ nhiệm và phòng thi</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* School Filter */}
                <select
                  value={classSchoolFilter}
                  onChange={(e) => setClassSchoolFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 focus:outline-none"
                >
                  <option value="all">Tất cả các Trường ({schools.length})</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm tên lớp, mã lớp..."
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                    className="pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 focus:outline-none w-44 sm:w-56"
                  />
                </div>

                <button
                  onClick={() => {
                    setEditingClass(null);
                    setIsClassModalOpen(true);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap primary-cta-btn"
                >
                  <Plus className="w-4 h-4" />
                  Thêm Lớp Mới
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                    <tr>
                      <th className="py-3 px-4 text-center w-16">STT</th>
                      <th className="py-3 px-4">Tên Lớp</th>
                      <th className="py-3 px-4 text-center">Sỉ số học sinh</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedClasses.map((c, index) => {
                      const studentCount = students.filter((st) => st.classId === c.id).length;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* 1. STT */}
                          <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-500">
                            {(currentClassesPage - 1) * 10 + index + 1}
                          </td>

                          {/* 2. Tên Lớp */}
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            <div className="text-sm">{c.name}</div>
                            {c.code && (
                              <div className="text-[11px] text-indigo-600 font-mono font-normal">
                                Mã: {c.code}
                              </div>
                            )}
                          </td>

                          {/* 3. Sỉ số học sinh */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => {
                                setStudentSchoolFilter(c.schoolId);
                                setStudentClassFilter(c.id);
                                setActiveTab('students');
                              }}
                              className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold text-xs transition-colors cursor-pointer border border-emerald-200 inline-flex items-center gap-1.5"
                              title="Xem danh sách học sinh của lớp này"
                            >
                              <span>{studentCount} Học sinh</span>
                              <span className="text-emerald-600">→</span>
                            </button>
                          </td>

                          {/* 4. Thao tác */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingClass(c);
                                  setIsClassModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
                                title="Sửa lớp"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteClass(c)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                                title="Xóa lớp"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredClasses.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">
                          Không có lớp học nào phù hợp. Vui lòng bấm &quot;Thêm Lớp Mới&quot;.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={currentClassesPage}
                totalItems={filteredClasses.length}
                pageSize={10}
                onPageChange={setClassesPage}
                itemName="lớp học"
              />
            </div>

          </div>
        )}

        {/* ================= TAB 4: QUẢN LÝ HỌC SINH ================= */}
        {activeTab === 'students' && (
          <div className="space-y-4">
            
            {/* Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Danh Sách Học Sinh Thuộc Lớp</h2>
                  <p className="text-xs text-slate-500">Cấp tài khoản, mật khẩu thi và quản lý thông tin thí sinh</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* School Filter */}
                <select
                  value={studentSchoolFilter}
                  onChange={(e) => {
                    setStudentSchoolFilter(e.target.value);
                    setStudentClassFilter('all');
                  }}
                  className="px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:outline-none"
                >
                  <option value="all">Tất cả Trường ({schools.length})</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>

                {/* Class Filter */}
                <select
                  value={studentClassFilter}
                  onChange={(e) => setStudentClassFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:outline-none"
                >
                  <option value="all">Tất cả Lớp ({classes.length})</option>
                  {classes
                    .filter((c) => studentSchoolFilter === 'all' || c.schoolId === studentSchoolFilter)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                    ))}
                </select>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm tên, SBD, Username..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:outline-none w-40 sm:w-52"
                  />
                </div>

                {/* Nút di chuyển học sinh chưa phân lớp vào lớp */}
                {unassignedStudents.length > 0 && (
                  <button
                    onClick={() => {
                      setTargetMoveClassId(classes[0]?.id || '');
                      setIsMoveStudentsModalOpen(true);
                    }}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer animate-pulse"
                    title={`Có ${unassignedStudents.length} học sinh chưa xếp lớp`}
                  >
                    <ArrowRightLeft className="w-4 h-4 text-amber-600" />
                    Xếp lớp ({unassignedStudents.length} HS chưa có lớp)
                  </button>
                )}

                <button
                  onClick={() => setIsExportPrintModalOpen(true)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                  title="In / Xuất danh sách tài khoản cấp cho học sinh"
                >
                  <Download className="w-4 h-4" />
                  Xuất Thẻ Thi
                </button>

                <button
                  onClick={() => {
                    setEditingStudent(null);
                    setIsStudentModalOpen(true);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap primary-cta-btn"
                >
                  <Plus className="w-4 h-4" />
                  Thêm Học Sinh Mới
                </button>
              </div>
            </div>

            {/* Selected Bulk Actions Banner */}
            {selectedStudentIds.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50 border border-emerald-300 p-3.5 rounded-2xl shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold font-mono">
                    {selectedStudentIds.length}
                  </span>
                  <span className="text-xs font-bold text-emerald-950">
                    Đang chọn {selectedStudentIds.length} học sinh trong danh sách
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIds([])}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-emerald-100 transition-colors cursor-pointer"
                  >
                    Bỏ chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteModalOpen(true)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa {selectedStudentIds.length} Học Sinh Đã Chọn</span>
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                    <tr>
                      <th className="py-3 px-3 text-center w-10">
                        <input
                          type="checkbox"
                          checked={paginatedStudents.length > 0 && paginatedStudents.every((s) => selectedStudentIds.includes(s.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const visibleIds = paginatedStudents.map((s) => s.id);
                              setSelectedStudentIds(Array.from(new Set([...selectedStudentIds, ...visibleIds])));
                            } else {
                              const visibleSet = new Set(paginatedStudents.map((s) => s.id));
                              setSelectedStudentIds(selectedStudentIds.filter((id) => !visibleSet.has(id)));
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer align-middle"
                          title="Chọn tất cả học sinh đang hiển thị trên trang này"
                        />
                      </th>
                      <th className="py-3 px-3 text-center w-14">STT</th>
                      <th className="py-3 px-4">Họ & Tên</th>
                      <th className="py-3 px-4">Lớp</th>
                      <th className="py-3 px-4">Ngày Sinh</th>
                      <th className="py-3 px-4">Tài Khoản</th>
                      <th className="py-3 px-4">Mật Khẩu</th>
                      <th className="py-3 px-4 text-center">Trạng Thái</th>
                      <th className="py-3 px-4 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedStudents.map((st, index) => {
                      const cls = classMap.get(st.classId);
                      const isSelected = selectedStudentIds.includes(st.id);
                      return (
                        <tr key={st.id} className={`transition-colors ${isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50/70'}`}>
                          {/* Checkbox */}
                          <td className="py-3.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedStudentIds([...selectedStudentIds, st.id]);
                                } else {
                                  setSelectedStudentIds(selectedStudentIds.filter((id) => id !== st.id));
                                }
                              }}
                              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer align-middle"
                            />
                          </td>

                          {/* 1. STT */}
                          <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-500">
                            {(currentStudentsPage - 1) * 10 + index + 1}
                          </td>

                          {/* 2. Họ & Tên */}
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            <div>{st.fullName}</div>
                            {st.studentCode && (
                              <div className="text-[10px] text-slate-400 font-mono font-normal">
                                SBD: {st.studentCode}
                              </div>
                            )}
                          </td>

                          {/* 3. Lớp */}
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md">
                              {cls ? cls.name : 'Chưa xếp lớp'}
                            </span>
                          </td>

                          {/* 4. Ngày Sinh */}
                          <td className="py-3.5 px-4 text-slate-600 font-mono text-xs">
                            {st.dateOfBirth || '—'}
                          </td>

                          {/* 5. Tài Khoản */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-mono text-xs font-semibold border border-blue-200">
                                {st.username}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingUsernameStudent(st);
                                  setNewStudentUsername(st.username);
                                }}
                                className="p-1 rounded hover:bg-blue-100 text-blue-600 transition-colors cursor-pointer"
                                title="Sửa tên đăng nhập của học sinh"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          {/* 6. Mật Khẩu */}
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-mono text-xs font-bold border border-amber-200">
                              {st.password}
                            </span>
                          </td>

                          {/* 7. Trạng Thái */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleToggleStudentStatus(st)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer inline-flex items-center gap-1 ${
                                st.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                                  : 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-300'
                              }`}
                              title={st.status === 'active' ? 'Nhấn để Khóa tài khoản' : 'Nhấn để Kích hoạt tài khoản'}
                            >
                              <Power className="w-3 h-3" />
                              <span>{st.status === 'active' ? 'Kích hoạt' : 'Tạm khóa'}</span>
                            </button>
                          </td>

                          {/* 8. Thao Tác */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => setAdminStudentToViewSubmissions(st)}
                                className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer relative"
                                title={`Xem & Xóa bài thi của học sinh ${st.fullName} (${studentSubmissionsCountMap.get(st.id) || 0} bài)`}
                              >
                                <FileText className="w-4 h-4" />
                                {(studentSubmissionsCountMap.get(st.id) || 0) > 0 && (
                                  <span className="absolute -top-1 -right-1 px-1 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold">
                                    {studentSubmissionsCountMap.get(st.id)}
                                  </span>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingStudent(st);
                                  setIsStudentModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 transition-colors cursor-pointer"
                                title="Sửa thông tin học sinh"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(st)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                                title="Xóa học sinh"
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
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          Không tìm thấy học sinh nào theo tiêu chí lọc.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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

        {/* ================= TAB 5: QUẢN LÝ USER & CẤP TÀI KHOẢN GIÁO VIÊN ================= */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            
            {/* Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Quản Lý & Cấp Tài Khoản Giáo Viên</h2>
                  <p className="text-xs text-slate-500">Cấp tài khoản giáo viên bộ môn, quản lý phân quyền và thông tin đăng nhập</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-purple-600 focus:outline-none"
                >
                  <option value="all">Tất cả vai trò</option>
                  <option value="admin">Quản trị viên</option>
                  <option value="teacher">Giáo viên</option>
                </select>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm họ tên, username, môn dạy..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-purple-600 focus:outline-none w-48 sm:w-60"
                  />
                </div>

                <button
                  onClick={() => handleOpenUserModal(null)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap primary-cta-btn"
                >
                  <Plus className="w-4 h-4" />
                  Cấp Tài Khoản Mới
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Họ và Tên</th>
                      <th className="py-3 px-4">Tên đăng nhập / Email</th>
                      <th className="py-3 px-4">Mật khẩu cấp</th>
                      <th className="py-3 px-4">Môn giảng dạy</th>
                      <th className="py-3 px-4">Trường & Lớp Phụ Trách</th>
                      <th className="py-3 px-4">Vai trò Phân quyền</th>
                      <th className="py-3 px-4 text-center">Trạng thái</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedUsers.map((u) => {
                      const assignedSchool = u.schoolId ? schoolMap.get(u.schoolId) : null;
                      const assignedClasses = (u.classIds || [])
                        .map((cid) => classMap.get(cid))
                        .filter(Boolean) as SchoolClass[];

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            {u.fullName}
                            {u.phone && <div className="text-[11px] text-slate-400 font-normal">SĐT: {u.phone}</div>}
                          </td>
                          <td className="py-3.5 px-4 font-mono">
                            <div className="font-semibold text-purple-700">@{u.username}</div>
                            <div className="text-[11px] text-slate-400">{u.email}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 font-mono text-xs font-semibold">
                              {u.password}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-700">
                            {u.subjects || 'Toàn trường'}
                          </td>
                          <td className="py-3.5 px-4">
                            {u.role === 'teacher' ? (
                              assignedSchool || assignedClasses.length > 0 ? (
                                <div className="space-y-1">
                                  {assignedSchool && (
                                    <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                                      <SchoolIcon className="w-3 h-3 text-blue-500 shrink-0" />
                                      <span>{assignedSchool.name}</span>
                                    </div>
                                  )}
                                  {assignedClasses.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {assignedClasses.map((cls) => (
                                        <span
                                          key={cls.id}
                                          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200"
                                        >
                                          {cls.name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  Chưa phân trường/lớp
                                </span>
                              )
                            ) : (
                              <span className="text-xs text-slate-400">Toàn hệ thống</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {u.role === 'admin' ? (
                              <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center gap-1 w-fit">
                                <Shield className="w-3 h-3" /> Quản trị viên
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 text-[11px] font-bold flex items-center gap-1 w-fit">
                                <GraduationCap className="w-3 h-3" /> Giáo viên
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {u.status === 'active' ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                                Hoạt động
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-semibold">
                                Tạm khóa
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              {u.role === 'teacher' && (
                                <>
                                  <button
                                    onClick={() => {
                                      setAdminExamsTeacherFilter(u.id);
                                      setActiveTab('exams');
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors cursor-pointer"
                                    title={`Xem tất cả đề thi do giáo viên ${u.fullName || u.username} tạo`}
                                  >
                                    <FileText className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAssigningTeacher(u);
                                      setTeacherSchoolAssign(u.schoolId || schools[0]?.id || '');
                                      setTeacherClassesAssign(u.classIds || []);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors cursor-pointer"
                                    title="Phân trường và lớp phụ trách"
                                  >
                                    <SchoolIcon className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleOpenUserModal(u)}
                                className="p-1.5 rounded-lg hover:bg-purple-50 text-slate-500 hover:text-purple-600 transition-colors cursor-pointer"
                                title="Sửa thông tin"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              {u.username !== 'admin' && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                                  title="Xóa tài khoản"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ================= TAB 6: PHÂN QUYỀN & TÀI KHOẢN QUẢN TRỊ ================= */}
        {activeTab === 'permissions' && (
          <div className="space-y-6">
            
            {/* Admin Root Account Verification Box */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Tài Khoản Quản Trị Viên Hệ Thống (Master Admin)</h3>
                  <p className="text-xs text-slate-500">Tài khoản quản trị cấp cao với mật khẩu được chỉ định</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Tên Đăng Nhập Quản Trị</span>
                  <p className="font-mono text-base font-bold text-blue-800 mt-1">admin</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Hoặc email: admin@exam.edu.vn</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Mật Khẩu Cấp Sẵn</span>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="font-mono text-base font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {INITIAL_ADMIN_PASSWORD}
                    </p>
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Đã lưu trữ và mã hóa an toàn trên Firebase</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Đặc Quyền Hệ Thống</span>
                  <p className="text-xs font-bold text-purple-800 mt-1.5 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" /> Toàn quyền Khảo thí & Cấu hình DB
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Quản lý Trường, Lớp, Học sinh, Phân quyền giáo viên</p>
                </div>
              </div>
            </div>

            {/* Role Matrix */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                Bảng Phân Quyền & Đặc Quyền Người Dùng (RBAC Matrix)
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
                    <tr>
                      <th className="py-3 px-4">Chức năng & Đặc quyền</th>
                      <th className="py-3 px-4 text-center text-blue-700">Quản trị viên (Admin)</th>
                      <th className="py-3 px-4 text-center text-purple-700">Giáo viên (Teacher)</th>
                      <th className="py-3 px-4 text-center text-emerald-700">Học sinh (Student)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-3 px-4 font-medium text-slate-800">Thêm, Xóa, Sửa Trường & Cơ sở đào tạo</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Toàn quyền</td>
                      <td className="py-3 px-4 text-center text-slate-300">✕ Không</td>
                      <td className="py-3 px-4 text-center text-slate-300">✕ Không</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-slate-800">Thêm, Xóa, Sửa Lớp học & Phòng thi</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Toàn quyền</td>
                      <td className="py-3 px-4 text-center text-blue-600">👁️ Xem lớp phụ trách</td>
                      <td className="py-3 px-4 text-center text-slate-300">✕ Không</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-slate-800">Cấp tài khoản & Mật khẩu Học sinh</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Toàn quyền</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Cấp lại mật khẩu lớp</td>
                      <td className="py-3 px-4 text-center text-slate-300">✕ Không</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-slate-800">Cấp tài khoản & Phân quyền Giáo viên</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Toàn quyền</td>
                      <td className="py-3 px-4 text-center text-slate-300">✕ Không</td>
                      <td className="py-3 px-4 text-center text-slate-300">✕ Không</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-slate-800">Xem Nhật ký & Lịch sử Truy cập (Audit Log)</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Toàn quyền</td>
                      <td className="py-3 px-4 text-center text-slate-300">✕ Không</td>
                      <td className="py-3 px-4 text-center text-slate-300">✕ Không</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-slate-800">Tham gia thi trắc nghiệm & Nộp bài</td>
                      <td className="py-3 px-4 text-center text-slate-400">Thi thử nghiệm</td>
                      <td className="py-3 px-4 text-center text-slate-400">Giám thị & Soát đề</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Làm bài theo ca</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-slate-800">Quản lý Đề thi giáo viên (Duyệt, sửa câu hỏi, gộp đề, mở/ẩn, xóa)</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Toàn quyền mọi giáo viên</td>
                      <td className="py-3 px-4 text-center text-blue-600">Biên soạn đề cá nhân</td>
                      <td className="py-3 px-4 text-center text-slate-300">✕ Không</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-slate-800">Xóa bài thi / kết quả thi của Học sinh</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Toàn quyền (đơn & hàng loạt)</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-bold">✓ Xóa bài lớp phụ trách</td>
                      <td className="py-3 px-4 text-center text-slate-300">✕ Không được phép</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ================= TAB: QUẢN LÝ ĐỀ THI DO GIÁO VIÊN TẠO RA (ADMIN) ================= */}
        {activeTab === 'exams' && (
          <AdminExamsTab
            exams={exams}
            classes={classes}
            schools={schools}
            users={users}
            currentUser={currentUser}
            submissions={submissions}
            onViewSubmissionsForExam={(examId) => {
              setSubmissionExamFilter(examId);
              setActiveTab('submissions');
            }}
            showToast={showToast}
            initialTeacherFilter={adminExamsTeacherFilter}
          />
        )}

        {/* ================= TAB: QUẢN LÝ BÀI THI & KHẢO THÍ (ADMIN) ================= */}
        {activeTab === 'submissions' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileCheck2 className="w-5 h-5 text-indigo-600" />
                  <span>Quản Lý Bài Thi & Khảo Thí Trực Tuyến</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Giám sát lượt nộp bài, điểm số, cảnh báo gian lận và cấp quyền xóa kết quả thi cho học sinh
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsStorageOptimizationOpen(true)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-700 hover:to-indigo-700 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Tối ưu dung lượng Turso bản Free, sao lưu lưu trữ và dọn dẹp bài nộp"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Tối Ưu CSDL (Bản Free)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsScoreRangeDeleteOpen(true)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-700 hover:to-rose-700 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Lọc và xóa hàng loạt bài thi của học sinh theo khoảng điểm (0 - 1000đ)"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Xóa Theo Khoảng Điểm</span>
                </button>
                {selectedSubmissionIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteSubmissionsOpen(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa {selectedSubmissionIds.length} Bài Thi</span>
                  </button>
                )}
                <div className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-mono font-bold border border-indigo-200">
                  Tổng: {submissions.length} bài
                </div>
              </div>
            </div>

            {/* 4 KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng Lượt Nộp</span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <FileCheck2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <h3 className="text-2xl font-black text-slate-900">{submissionKPIs.total}</h3>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    Toàn hệ thống
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Thí Sinh Tham Gia</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <h3 className="text-2xl font-black text-slate-900">{submissionKPIs.uniqueStudents}</h3>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    Học sinh
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tỉ Lệ Đạt (≥950)</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Award className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <h3 className="text-2xl font-black text-emerald-700">{submissionKPIs.passRate}%</h3>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {submissionKPIs.passed} bài đạt
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cảnh Báo Vi Phạm</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <h3 className="text-2xl font-black text-amber-700">{submissionKPIs.violations}</h3>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    Rời tab / Fullscreen
                  </span>
                </div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={submissionSearch}
                    onChange={(e) => setSubmissionSearch(e.target.value)}
                    placeholder="Tìm tên học sinh, SBD, đề thi..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                {/* Filter School */}
                <div>
                  <select
                    value={submissionSchoolFilter}
                    onChange={(e) => {
                      setSubmissionSchoolFilter(e.target.value);
                      setSubmissionClassFilter('all');
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none bg-white"
                  >
                    <option value="all">Tất cả các Trường ({schools.length})</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Filter Class */}
                <div>
                  <select
                    value={submissionClassFilter}
                    onChange={(e) => setSubmissionClassFilter(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none bg-white"
                  >
                    <option value="all">Tất cả các Lớp ({classes.length})</option>
                    {classes
                      .filter((c) => submissionSchoolFilter === 'all' || c.schoolId === submissionSchoolFilter)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                </div>

                {/* Filter Exam */}
                <div>
                  <select
                    value={submissionExamFilter}
                    onChange={(e) => setSubmissionExamFilter(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none bg-white"
                  >
                    <option value="all">Tất cả Đề thi ({exams.length})</option>
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>{ex.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2 Filters: Date and Status */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Ngày thi:</span>
                  </span>
                  <input
                    type="date"
                    value={submissionDateFilter}
                    onChange={(e) => setSubmissionDateFilter(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                  {submissionDateFilter && (
                    <button
                      type="button"
                      onClick={() => setSubmissionDateFilter('')}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                    >
                      Xóa lọc ngày
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 mr-1">Kết quả:</span>
                  {(['all', 'passed', 'failed', 'violation'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSubmissionStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        submissionStatusFilter === st
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st === 'all' && 'Tất cả'}
                      {st === 'passed' && '✓ Đạt (≥950)'}
                      {st === 'failed' && '✕ Chưa đạt'}
                      {st === 'violation' && '⚠️ Có vi phạm'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bulk Selection Bar */}
            {selectedSubmissionIds.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-200 p-3.5 rounded-2xl shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-red-600 text-white flex items-center justify-center text-xs font-bold font-mono">
                    {selectedSubmissionIds.length}
                  </span>
                  <span className="text-xs font-bold text-red-950">
                    Đang chọn {selectedSubmissionIds.length} bài thi của học sinh
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSubmissionIds([])}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteSubmissionsOpen(true)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa {selectedSubmissionIds.length} Bài Thi Đã Chọn</span>
                  </button>
                </div>
              </div>
            )}

            {/* Submissions Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                    <tr>
                      <th className="py-3 px-3 text-center w-10">
                        <input
                          type="checkbox"
                          checked={paginatedSubmissions.length > 0 && paginatedSubmissions.every((sub) => selectedSubmissionIds.includes(sub.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const visibleIds = paginatedSubmissions.map((s) => s.id);
                              setSelectedSubmissionIds(Array.from(new Set([...selectedSubmissionIds, ...visibleIds])));
                            } else {
                              const visibleSet = new Set(paginatedSubmissions.map((s) => s.id));
                              setSelectedSubmissionIds(selectedSubmissionIds.filter((id) => !visibleSet.has(id)));
                            }
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer align-middle"
                          title="Chọn tất cả bài thi đang hiển thị trên trang này"
                        />
                      </th>
                      <th className="py-3 px-3 text-center w-12">STT</th>
                      <th className="py-3 px-4">Thời Gian Nộp</th>
                      <th className="py-3 px-4">Thí Sinh & SBD</th>
                      <th className="py-3 px-4">Lớp & Trường</th>
                      <th className="py-3 px-4">Đề Thi & Lần Thi</th>
                      <th className="py-3 px-4">Thời Gian & Vi Phạm</th>
                      <th className="py-3 px-4 text-center">Điểm Số</th>
                      <th className="py-3 px-4 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedSubmissions.map((sub, index) => {
                      const isSelected = selectedSubmissionIds.includes(sub.id);
                      const cls = classMap.get(sub.classId);
                      const sch = cls ? schoolMap.get(cls.schoolId) : undefined;
                      const minutes = Math.floor(sub.timeSpentSeconds / 60);
                      const seconds = sub.timeSpentSeconds % 60;

                      return (
                        <tr key={sub.id} className={`transition-colors ${isSelected ? 'bg-red-50/40' : 'hover:bg-slate-50/70'}`}>
                          {/* Checkbox */}
                          <td className="py-3.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSubmissionIds([...selectedSubmissionIds, sub.id]);
                                } else {
                                  setSelectedSubmissionIds(selectedSubmissionIds.filter((id) => id !== sub.id));
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer align-middle"
                            />
                          </td>

                          {/* STT */}
                          <td className="py-3.5 px-3 text-center font-mono text-slate-400 text-xs">
                            {(currentSubmissionsPage - 1) * 10 + index + 1}
                          </td>

                          {/* Thời Gian Nộp */}
                          <td className="py-3.5 px-4 font-mono text-xs">
                            <div className="font-semibold text-slate-800">
                              {new Date(sub.submittedAt).toLocaleTimeString('vi-VN')}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                            </div>
                          </td>

                          {/* Thí Sinh */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{sub.studentName}</div>
                            <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-700 font-bold">
                                SBD: {sub.studentCode}
                              </span>
                            </div>
                          </td>

                          {/* Lớp & Trường */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-800">{cls?.name || 'Chưa phân lớp'}</div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                              {sch?.name || 'Chưa gán trường'}
                            </div>
                          </td>

                          {/* Đề Thi */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 max-w-[200px] truncate" title={sub.examTitle}>
                              {sub.examTitle}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                              <span className="font-mono font-bold text-indigo-600">Lần #{sub.attemptNumber}</span>
                              {sub.isPractice && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                  Thi thử
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Thời Gian & Vi Phạm */}
                          <td className="py-3.5 px-4 font-mono text-xs">
                            <div className="text-slate-700">
                              ⏱️ {minutes > 0 ? `${minutes}p ` : ''}{seconds}s
                            </div>
                            {sub.violationCount > 0 ? (
                              <span className="text-[11px] text-red-600 font-bold inline-flex items-center gap-1 mt-0.5">
                                ⚠️ {sub.violationCount} vi phạm
                              </span>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-semibold">
                                ✓ Hợp lệ
                              </span>
                            )}
                          </td>

                          {/* Điểm Số */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="font-black font-mono text-sm text-slate-900">
                              {sub.score}/1000đ
                            </div>
                            {sub.isPassed ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 inline-block mt-0.5">
                                ✓ ĐẠT (≥950)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 inline-block mt-0.5">
                                ✕ Chưa Đạt
                              </span>
                            )}
                          </td>

                          {/* Thao Tác */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSubmissionToReview(sub)}
                                className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1"
                                title="Xem chi tiết bài làm của thí sinh"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Xem Bài</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setSubmissionToDelete(sub)}
                                className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 font-bold text-xs shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                                title="Xóa bài thi này của thí sinh"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Xóa</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredSubmissions.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-slate-400 space-y-2">
                          <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                          <p className="text-sm font-semibold">
                            {submissions.length === 0
                              ? 'Chưa có bài thi nào được nộp trên toàn hệ thống.'
                              : 'Không tìm thấy bài thi nào phù hợp với bộ lọc.'}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={currentSubmissionsPage}
                totalItems={filteredSubmissions.length}
                pageSize={10}
                onPageChange={setSubmissionsPage}
                itemName="bài thi"
              />
            </div>
          </div>
        )}

        </main>
      </div>

      {/* ================= MODAL: TRƯỜNG ================= */}
      {isSchoolModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingSchool ? 'Chỉnh Sửa Thông Tin Trường' : 'Thêm Trường Học Mới'}
              </h3>
              <button
                onClick={() => setIsSchoolModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSchool} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mã Trường Học *</label>
                <input
                  name="code"
                  defaultValue={editingSchool?.code || ''}
                  required
                  placeholder="Ví dụ: THPT-LHP, C3-CHU_VAN_AN..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên Trường Học *</label>
                <input
                  name="name"
                  defaultValue={editingSchool?.name || ''}
                  required
                  placeholder="Ví dụ: Trường THPT Chuyên Lê Hồng Phong..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cấp Học</label>
                <select
                  name="level"
                  defaultValue={editingSchool?.level || 'highschool'}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-600 focus:outline-none bg-white"
                >
                  <option value="highschool">Trường THPT (Trung học Phổ thông)</option>
                  <option value="secondary">Trường THCS (Trung học Cơ sở)</option>
                  <option value="university">Đại học / Cao đẳng / Học viện</option>
                  <option value="other">Trung tâm Giáo dục / Khác</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Địa chỉ</label>
                <input
                  name="address"
                  defaultValue={editingSchool?.address || ''}
                  placeholder="Địa chỉ trụ sở trường..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Số điện thoại</label>
                  <input
                    name="phone"
                    defaultValue={editingSchool?.phone || ''}
                    placeholder="028 3839..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email liên hệ</label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={editingSchool?.email || ''}
                    placeholder="info@school.edu.vn"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSchoolModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
                >
                  {editingSchool ? 'Lưu Thay Đổi' : 'Thêm Trường'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: LỚP HỌC ================= */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-indigo-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingClass ? 'Chỉnh Sửa Lớp Học' : 'Thêm Lớp Mới Thuộc Trường'}
              </h3>
              <button
                onClick={() => setIsClassModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trường Trực Thuộc *</label>
                <select
                  name="schoolId"
                  defaultValue={editingClass?.schoolId || schools[0]?.id || ''}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none bg-white"
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mã Lớp *</label>
                  <input
                    name="code"
                    defaultValue={editingClass?.code || ''}
                    required
                    placeholder="Ví dụ: 12A1, 10B2..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Khối Lớp</label>
                  <input
                    name="grade"
                    defaultValue={editingClass?.grade || '12'}
                    placeholder="10, 11, 12..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên Đầy Đủ Của Lớp *</label>
                <input
                  name="name"
                  defaultValue={editingClass?.name || ''}
                  required
                  placeholder="Ví dụ: Lớp 12A1 - Ban Khoa học Tự nhiên..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Niên Khóa</label>
                  <input
                    name="schoolYear"
                    defaultValue={editingClass?.schoolYear || '2025 - 2026'}
                    placeholder="2025 - 2026"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phòng Học / Thi</label>
                  <input
                    name="room"
                    defaultValue={editingClass?.room || ''}
                    placeholder="Phòng A201..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Giáo Viên Chủ Nhiệm</label>
                <input
                  name="homeroomTeacher"
                  defaultValue={editingClass?.homeroomTeacher || ''}
                  placeholder="ThS. Nguyễn Văn A..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                {editingClass ? (
                  <button
                    type="button"
                    onClick={() => {
                      const target = editingClass;
                      setIsClassModalOpen(false);
                      setClassToDelete(target);
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors flex items-center gap-1.5 cursor-pointer border border-red-200"
                    title="Xóa vĩnh viễn lớp học này"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    <span>Xóa Lớp Này</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsClassModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
                  >
                    {editingClass ? 'Lưu Thay Đổi' : 'Tạo Lớp Mới'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: HỌC SINH ================= */}
      {isStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-emerald-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingStudent ? 'Chỉnh Sửa Hồ Sơ Học Sinh' : 'Cấp Mới Tài Khoản Học Sinh'}
              </h3>
              <button
                onClick={() => setIsStudentModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} autoComplete="off" className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Xếp Vào Lớp Học *</label>
                <select
                  name="classId"
                  defaultValue={editingStudent?.classId || classes[0]?.id || ''}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-emerald-600 focus:outline-none bg-white"
                >
                  {classes.map((c) => {
                    const sch = schoolMap.get(c.schoolId);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({sch ? sch.code : ''})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Số Báo Danh / Mã HS *</label>
                  <input
                    name="studentCode"
                    defaultValue={editingStudent?.studentCode || `HS${Math.floor(100000 + Math.random() * 900000)}`}
                    required
                    placeholder="Ví dụ: HS120101..."
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Giới tính</label>
                  <select
                    name="gender"
                    defaultValue={editingStudent?.gender || 'male'}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-emerald-600 focus:outline-none bg-white"
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và Tên Học Sinh *</label>
                <input
                  name="fullName"
                  defaultValue={editingStudent?.fullName || ''}
                  required
                  placeholder="Ví dụ: Trần Minh Khang..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày sinh</label>
                  <input
                    name="dateOfBirth"
                    type="date"
                    defaultValue={editingStudent?.dateOfBirth || '2008-01-01'}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái thi</label>
                  <select
                    name="status"
                    defaultValue={editingStudent?.status || 'active'}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-emerald-600 focus:outline-none bg-white"
                  >
                    <option value="active">Kích hoạt (Được dự thi)</option>
                    <option value="suspended">Tạm khóa tài khoản</option>
                  </select>
                </div>
              </div>

              {/* Pre-assigned Credentials */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-emerald-700" />
                  Thông tin Tài khoản Cấp sẵn (Đăng nhập thi)
                </span>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-emerald-900 mb-1">Tên đăng nhập *</label>
                    <input
                      name="username"
                      autoComplete="off"
                      defaultValue={editingStudent?.username || `HS${Math.floor(1000 + Math.random() * 9000)}`}
                      required
                      placeholder="HS1201..."
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-emerald-300 bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-emerald-900 mb-1">Mật khẩu cấp sẵn *</label>
                    <input
                      name="password"
                      autoComplete="off"
                      defaultValue={editingStudent?.password || 'Hs@123456'}
                      required
                      placeholder="Hs@123456"
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-emerald-300 bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú / Phòng thi số</label>
                <input
                  name="note"
                  defaultValue={editingStudent?.note || ''}
                  placeholder="Ví dụ: Phòng thi số 03, Bàn 12..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                {editingStudent ? (
                  <button
                    type="button"
                    onClick={() => {
                      const target = editingStudent;
                      setIsStudentModalOpen(false);
                      setStudentToDelete(target);
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors flex items-center gap-1.5 cursor-pointer border border-red-200"
                    title="Xóa vĩnh viễn học sinh này"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    <span>Xóa Học Sinh Này</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStudentModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
                  >
                    {editingStudent ? 'Cập Nhật Hồ Sơ' : 'Cấp Tài Khoản'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: USER / GIÁO VIÊN ================= */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-purple-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingUser ? 'Chỉnh Sửa Tài Khoản Nhân Sự' : 'Cấp Tài Khoản Giáo Viên / Quản Trị'}
              </h3>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} autoComplete="off" className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và Tên Cán Bộ *</label>
                <input
                  name="fullName"
                  autoComplete="off"
                  defaultValue={editingUser?.fullName || ''}
                  required
                  placeholder="Ví dụ: ThS. Lê Văn Bình..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-purple-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tên đăng nhập *</label>
                  <input
                    name="username"
                    autoComplete="off"
                    defaultValue={editingUser?.username || ''}
                    required
                    placeholder="gv_levanbinh..."
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 focus:border-purple-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mật khẩu cấp sẵn *</label>
                  <input
                    name="password"
                    autoComplete="off"
                    defaultValue={editingUser?.password || 'Gv@123456'}
                    required
                    placeholder="Gv@123456"
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 focus:border-purple-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phân Quyền Vai Trò *</label>
                <select
                  name="role"
                  defaultValue={editingUser?.role || 'teacher'}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-purple-600 focus:outline-none bg-white font-semibold"
                >
                  <option value="teacher">Giáo viên / Giám thị khảo thí</option>
                  <option value="admin">Quản trị viên (Toàn quyền hệ thống)</option>
                </select>
              </div>

              {/* Phân công trường và danh sách lớp cho Giáo viên */}
              <div className="p-3.5 bg-purple-50/80 border border-purple-200 rounded-xl space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-purple-900 mb-1">
                    Trường Giảng Dạy / Lọc Trường Phân Công
                  </label>
                  <select
                    value={userModalSchoolId}
                    onChange={(e) => {
                      setUserModalSchoolId(e.target.value);
                    }}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-purple-200 focus:border-purple-600 focus:outline-none bg-white font-medium"
                  >
                    <option value="all">-- Tất cả các trường (Phân công nhiều trường) --</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-purple-900">
                      Các Lớp Phụ Trách ({userModalClassIds.length} lớp đã phân công)
                    </label>
                    {userModalClassIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setUserModalClassIds([])}
                        className="text-[10px] text-purple-700 hover:underline cursor-pointer"
                      >
                        Bỏ chọn tất cả
                      </button>
                    )}
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-purple-200 p-2.5 rounded-lg bg-white">
                    {schools
                      .filter((s) => userModalSchoolId === 'all' || !userModalSchoolId || s.id === userModalSchoolId)
                      .map((s) => {
                        const schoolClasses = classes.filter((c) => c.schoolId === s.id);
                        if (schoolClasses.length === 0) return null;
                        const allSelected = schoolClasses.every((c) => userModalClassIds.includes(c.id));
                        return (
                          <div key={s.id} className="border border-purple-100 rounded-lg p-2 bg-purple-50/30">
                            <div className="flex items-center justify-between pb-1 mb-1 border-b border-purple-100/80">
                              <span className="text-[11px] font-bold text-purple-950 flex items-center gap-1">
                                <span>🏫 {s.name}</span>
                                <span className="font-mono text-[10px] text-purple-600 font-semibold">({s.code})</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (allSelected) {
                                    const schoolClassIds = new Set(schoolClasses.map((c) => c.id));
                                    setUserModalClassIds(userModalClassIds.filter((id) => !schoolClassIds.has(id)));
                                  } else {
                                    const next = new Set(userModalClassIds);
                                    schoolClasses.forEach((c) => next.add(c.id));
                                    setUserModalClassIds(Array.from(next));
                                  }
                                }}
                                className="text-[10px] font-semibold text-purple-700 hover:underline cursor-pointer"
                              >
                                {allSelected ? 'Bỏ chọn trường này' : 'Chọn cả trường'}
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                              {schoolClasses.map((cls) => {
                                const isChecked = userModalClassIds.includes(cls.id);
                                return (
                                  <label
                                    key={cls.id}
                                    className="flex items-center gap-2 p-1 rounded hover:bg-white transition-colors cursor-pointer text-xs"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setUserModalClassIds([...userModalClassIds, cls.id]);
                                        } else {
                                          setUserModalClassIds(userModalClassIds.filter((id) => id !== cls.id));
                                        }
                                      }}
                                      className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                                    />
                                    <span className="font-semibold text-slate-800">{cls.name}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">({cls.code})</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    {classes.filter((c) => userModalSchoolId === 'all' || !userModalSchoolId || c.schoolId === userModalSchoolId).length === 0 && (
                      <p className="text-[11px] text-slate-400 py-3 text-center">
                        Không có lớp học nào thuộc trường đã chọn.
                      </p>
                    )}
                  </div>
                  <p className="text-[10px] text-purple-700 mt-1">
                    Hỗ trợ phân công giáo viên giảng dạy ở <strong>nhiều trường cùng lúc</strong>. Tích chọn các lớp thuộc từng trường tương ứng.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Môn Giảng Dạy / Phụ Trách</label>
                <input
                  name="subjects"
                  defaultValue={editingUser?.subjects || ''}
                  placeholder="Ví dụ: Toán học, Vật lý, Ngoại ngữ..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-purple-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={editingUser?.email || ''}
                    placeholder="teacher@school.edu.vn"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-purple-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Số điện thoại</label>
                  <input
                    name="phone"
                    defaultValue={editingUser?.phone || ''}
                    placeholder="0912..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-purple-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái tài khoản</label>
                <select
                  name="status"
                  defaultValue={editingUser?.status || 'active'}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-purple-600 focus:outline-none bg-white"
                >
                  <option value="active">Hoạt động bình thường</option>
                  <option value="suspended">Tạm khóa tài khoản</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-xs cursor-pointer"
                >
                  {editingUser ? 'Lưu Thay Đổi' : 'Cấp Tài Khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: IN & XUẤT THẺ DỰ THI HỌC SINH ================= */}
      {isExportPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base">Danh Sách Cấp Tài Khoản Thi Cho Học Sinh</h3>
              </div>
              <button
                onClick={() => setIsExportPrintModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <p className="text-xs text-slate-500">
                Thầy/Cô có thể in hoặc sao chép danh sách này để phát cho học sinh trước giờ vào phòng thi trắc nghiệm.
              </p>

              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">STT</th>
                      <th className="py-2.5 px-3">SBD / Mã HS</th>
                      <th className="py-2.5 px-3">Họ và Tên</th>
                      <th className="py-2.5 px-3">Lớp học</th>
                      <th className="py-2.5 px-3">Tên Đăng Nhập</th>
                      <th className="py-2.5 px-3">Mật Khẩu Cấp Sẵn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {filteredStudents.map((st, idx) => {
                      const cls = classMap.get(st.classId);
                      return (
                        <tr key={st.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-3 font-bold text-emerald-800">{st.studentCode}</td>
                          <td className="py-2 px-3 font-sans font-semibold text-slate-900">{st.fullName}</td>
                          <td className="py-2 px-3 font-sans text-slate-600">{cls ? cls.name : '—'}</td>
                          <td className="py-2 px-3 font-bold text-blue-700">{st.username}</td>
                          <td className="py-2 px-3 font-bold text-amber-700">{st.password}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">Tổng cộng: {filteredStudents.length} học sinh</span>
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                In Thẻ Dự Thi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: 3b. SỬA TÊN ĐĂNG NHẬP HỌC SINH ================= */}
      {editingUsernameStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-blue-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-200" />
                <h3 className="font-bold text-sm">Sửa Tên Đăng Nhập Học Sinh</h3>
              </div>
              <button
                onClick={() => setEditingUsernameStudent(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudentUsername} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Học sinh:</p>
                <div className="text-sm font-bold text-slate-800">{editingUsernameStudent.fullName}</div>
                <div className="text-xs font-mono text-slate-400">SBD: {editingUsernameStudent.studentCode}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên Đăng Nhập Mới *
                </label>
                <input
                  type="text"
                  value={newStudentUsername}
                  onChange={(e) => setNewStudentUsername(e.target.value)}
                  required
                  placeholder="Nhập tên đăng nhập mới..."
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 focus:border-blue-600 focus:outline-none"
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Học sinh sẽ dùng tên đăng nhập này để đăng nhập vào phòng thi.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUsernameStudent(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-4 h-4" />
                  Lưu Tên Đăng Nhập
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: 3d. DI CHUYỂN HỌC SINH CHƯA PHÂN LỚP VÀO LỚP HỌC ================= */}
      {isMoveStudentsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-amber-200" />
                <h3 className="font-bold text-sm">Phân Lớp Cho Học Sinh Chưa Xếp Lớp</h3>
              </div>
              <button
                onClick={() => setIsMoveStudentsModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleMoveUnassignedStudents} className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xs font-bold text-amber-900 mb-1">
                  Số lượng học sinh chưa xếp lớp: {unassignedStudents.length} em
                </div>
                <div className="max-h-32 overflow-y-auto divide-y divide-amber-100 text-xs text-amber-800">
                  {unassignedStudents.map((st, i) => (
                    <div key={st.id} className="py-1 flex items-center justify-between">
                      <span>{i + 1}. {st.fullName}</span>
                      <span className="font-mono text-[11px] text-amber-700">{st.studentCode}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chọn Lớp Tiếp Nhận Toàn Bộ Học Sinh Này *
                </label>
                <select
                  value={targetMoveClassId}
                  onChange={(e) => setTargetMoveClassId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-amber-600 focus:outline-none bg-white font-semibold"
                >
                  <option value="">-- Vui lòng chọn lớp học tiếp nhận --</option>
                  {classes.map((cls) => {
                    const sch = schoolMap.get(cls.schoolId);
                    return (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({cls.code}) — Trường: {sch?.name || 'Chưa rõ'}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Sau khi xác nhận, toàn bộ {unassignedStudents.length} học sinh trên sẽ được cập nhật mã lớp và trường tương ứng vào CSDL.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMoveStudentsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={unassignedStudents.length === 0 || !targetMoveClassId}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Xác Nhận Xếp Lớp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: 4b. PHÂN TRƯỜNG VÀ LỚP CHO GIÁO VIÊN ================= */}
      {assigningTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-blue-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SchoolIcon className="w-5 h-5 text-blue-200" />
                <h3 className="font-bold text-base">Phân Trường & Lớp Cho Giáo Viên</h3>
              </div>
              <button
                onClick={() => setAssigningTeacher(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacherSchoolAndClasses} className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-xs font-bold text-blue-900">
                  Giáo viên: {assigningTeacher.fullName || assigningTeacher.username}
                </div>
                <div className="text-[11px] font-mono text-blue-700">
                  @{assigningTeacher.username} • Môn: {assigningTeacher.subjects || 'Chưa thiết lập'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  1. Trường Giảng Dạy / Công Tác *
                </label>
                <select
                  value={teacherSchoolAssign}
                  onChange={(e) => {
                    setTeacherSchoolAssign(e.target.value);
                    // Filter or keep valid classes
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-600 focus:outline-none bg-white font-medium"
                >
                  <option value="">-- Chọn trường học --</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  2. Các Lớp Phụ Trách / Giảng Dạy
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto border border-slate-200 p-2.5 rounded-xl bg-slate-50">
                  {classes
                    .filter((c) => !teacherSchoolAssign || c.schoolId === teacherSchoolAssign)
                    .map((cls) => {
                      const isChecked = teacherClassesAssign.includes(cls.id);
                      return (
                        <label
                          key={cls.id}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white transition-colors cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTeacherClassesAssign([...teacherClassesAssign, cls.id]);
                              } else {
                                setTeacherClassesAssign(teacherClassesAssign.filter((id) => id !== cls.id));
                              }
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="font-semibold text-slate-800">{cls.name}</span>
                          <span className="text-[11px] text-slate-400 font-mono">({cls.code})</span>
                          {cls.homeroomTeacher && (
                            <span className="text-[10px] text-slate-500 ml-auto">
                              GVCN: {cls.homeroomTeacher}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  {classes.filter((c) => !teacherSchoolAssign || c.schoolId === teacherSchoolAssign).length === 0 && (
                    <p className="text-xs text-slate-400 py-3 text-center">
                      Không có lớp nào thuộc trường này. Vui lòng tạo lớp học trước.
                    </p>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Thầy/Cô có thể tích chọn một hoặc nhiều lớp để phân công cho giáo viên này.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssigningTeacher(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Lưu Phân Công
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÁC NHẬN XÓA LỚP HỌC ================= */}
      {classToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 font-bold text-base">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-white" />
                </div>
                <span>Xác Nhận Xóa Lớp Học</span>
              </div>
              <button
                onClick={() => !isDeletingClass && setClassToDelete(null)}
                disabled={isDeletingClass}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50/70 border border-red-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-red-800 uppercase tracking-wider">Thông tin lớp sẽ xóa</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-white text-red-700 border border-red-200">
                    {classToDelete.code || 'Chưa có mã'}
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900">
                  {classToDelete.name}
                </h4>
                <div className="text-xs text-slate-600 space-y-1 pt-1.5 border-t border-red-200/60">
                  <p>
                    • Trường: <strong className="text-slate-800">{schoolMap.get(classToDelete.schoolId)?.name || 'Chưa xác định'}</strong>
                  </p>
                  {classToDelete.homeroomTeacher && (
                    <p>• GV chủ nhiệm: <strong className="text-slate-800">{classToDelete.homeroomTeacher}</strong></p>
                  )}
                  {classToDelete.schoolYear && (
                    <p>• Niên khóa: <strong className="text-slate-800">{classToDelete.schoolYear}</strong></p>
                  )}
                </div>
              </div>

              {/* Student Impact Notice */}
              {(() => {
                const classStudentCount = students.filter((st) => st.classId === classToDelete.id).length;
                return classStudentCount > 0 ? (
                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Lớp đang có {classStudentCount} học sinh!</p>
                      <p className="text-amber-800 mt-1 leading-relaxed">
                        Hệ thống sẽ tự động chuyển <strong>{classStudentCount} học sinh</strong> này sang trạng thái <strong>&quot;Chưa xếp lớp&quot;</strong>. Tài khoản đăng nhập, mật khẩu, SBD và lịch sử thi của các em được bảo lưu an toàn 100%.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2 text-xs text-slate-600">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Lớp này hiện không có học sinh. Dữ liệu lớp sẽ được gỡ bỏ an toàn khỏi cơ sở dữ liệu.</span>
                  </div>
                );
              })()}

              <p className="text-[11px] text-slate-500 italic">
                Thao tác quản trị này được thực hiện bởi <strong className="text-slate-700 font-mono">@{currentUser.username}</strong>.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeletingClass}
                  onClick={() => setClassToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isDeletingClass}
                  onClick={handleConfirmDeleteClass}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isDeletingClass ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang xóa...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xác Nhận Xóa Lớp</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÁC NHẬN XÓA TRƯỜNG HỌC ================= */}
      {schoolToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-base">
                <Trash2 className="w-4 h-4 text-white" />
                <span>Xác Nhận Xóa Trường Học</span>
              </div>
              <button
                onClick={() => !isDeletingSchool && setSchoolToDelete(null)}
                disabled={isDeletingSchool}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50/70 border border-red-200 rounded-xl space-y-1.5">
                <span className="text-xs font-semibold text-red-800 uppercase tracking-wider">Trường cần xóa</span>
                <h4 className="text-base font-bold text-slate-900">{schoolToDelete.name}</h4>
                <p className="text-xs text-slate-600">Mã: {schoolToDelete.code} • Địa chỉ: {schoolToDelete.address || 'Chưa cập nhật'}</p>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                <p className="font-bold">Lưu ý quản trị:</p>
                <p className="mt-0.5">Xóa trường học sẽ ảnh hưởng đến các liên kết lớp học và giáo viên thuộc trường này.</p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeletingSchool}
                  onClick={() => setSchoolToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isDeletingSchool}
                  onClick={handleConfirmDeleteSchool}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isDeletingSchool ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang xóa...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xác Nhận Xóa Trường</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÁC NHẬN XÓA HỌC SINH ================= */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 font-bold text-base">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-white" />
                </div>
                <span>Xác Nhận Xóa Hồ Sơ Học Sinh</span>
              </div>
              <button
                onClick={() => !isDeletingStudent && setStudentToDelete(null)}
                disabled={isDeletingStudent}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50/70 border border-red-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-red-800 uppercase tracking-wider">Học sinh cần xóa</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-white text-red-700 border border-red-200">
                    SBD: {studentToDelete.studentCode || 'Chưa có'}
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900">{studentToDelete.fullName}</h4>
                <div className="text-xs text-slate-600 space-y-1 pt-1.5 border-t border-red-200/60 font-medium">
                  <p>
                    • Lớp: <strong className="text-slate-800">{classMap.get(studentToDelete.classId)?.name || 'Chưa xếp lớp'}</strong>
                  </p>
                  <p>
                    • Trường: <strong className="text-slate-800">{schoolMap.get(studentToDelete.schoolId)?.name || 'Chưa xác định'}</strong>
                  </p>
                  <p>
                    • Tài khoản đăng nhập: <strong className="font-mono text-indigo-700">@{studentToDelete.username}</strong>
                  </p>
                  {studentToDelete.dateOfBirth && (
                    <p>• Ngày sinh: {studentToDelete.dateOfBirth}</p>
                  )}
                </div>
              </div>

              <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-900 leading-relaxed">
                <strong>Cảnh báo xóa CSDL:</strong> Thao tác này sẽ xóa vĩnh viễn hồ sơ học sinh khỏi bảng <code className="font-mono bg-white px-1 py-0.5 rounded text-red-800">students</code> trên Turso. Tài khoản đăng nhập, mật khẩu và toàn bộ lịch sử thi cử của thí sinh này sẽ bị gỡ bỏ hoàn toàn.
              </div>

              <p className="text-[11px] text-slate-500 italic">
                Thao tác quản trị thực hiện bởi <strong className="text-slate-700 font-mono">@{currentUser.username}</strong>.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeletingStudent}
                  onClick={() => setStudentToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isDeletingStudent}
                  onClick={handleConfirmDeleteStudent}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isDeletingStudent ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang xóa...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xác Nhận Xóa Học Sinh</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÁC NHẬN XÓA HÀNG LOẠT HỌC SINH ================= */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 font-bold text-base">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-white" />
                </div>
                <span>Xác Nhận Xóa Hàng Loạt</span>
              </div>
              <button
                onClick={() => !isBulkDeletingStudents && setIsBulkDeleteModalOpen(false)}
                disabled={isBulkDeletingStudents}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50/70 border border-red-200 rounded-xl space-y-2">
                <span className="text-xs font-semibold text-red-800 uppercase tracking-wider">Số lượng học sinh được chọn</span>
                <div className="text-2xl font-black text-red-600 font-mono">
                  {selectedStudentIds.length} <span className="text-sm font-semibold text-slate-700">học sinh</span>
                </div>
                <p className="text-xs text-slate-600">
                  Bạn đang chuẩn bị xóa cùng lúc {selectedStudentIds.length} hồ sơ học sinh được tích chọn trong danh sách.
                </p>
              </div>

              <div className="p-3.5 bg-red-50 rounded-xl border border-red-200 flex items-start gap-2.5 text-xs text-red-900">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Cảnh báo hành động hàng loạt:</p>
                  <p className="mt-1 leading-relaxed">
                    Toàn bộ {selectedStudentIds.length} học sinh này sẽ bị <strong>xóa vĩnh viễn khỏi cơ sở dữ liệu Turso</strong>. Tất cả tài khoản, mật khẩu dự thi và kết quả bài thi liên quan sẽ bị xóa sạch và không thể khôi phục!
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isBulkDeletingStudents}
                  onClick={() => setIsBulkDeleteModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isBulkDeletingStudents}
                  onClick={handleConfirmBulkDeleteStudents}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isBulkDeletingStudents ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang xóa {selectedStudentIds.length} HS...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xác Nhận Xóa {selectedStudentIds.length} Học Sinh</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÁC NHẬN XÓA TÀI KHOẢN GIÁO VIÊN/USER ================= */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-base">
                <Trash2 className="w-4 h-4 text-white" />
                <span>Xác Nhận Xóa Tài Khoản</span>
              </div>
              <button
                onClick={() => !isDeletingUser && setUserToDelete(null)}
                disabled={isDeletingUser}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50/70 border border-red-200 rounded-xl space-y-1.5">
                <span className="text-xs font-semibold text-red-800 uppercase tracking-wider">Tài khoản</span>
                <h4 className="text-base font-bold text-slate-900">{userToDelete.fullName || userToDelete.username}</h4>
                <p className="text-xs text-slate-600 font-mono">
                  Username: @{userToDelete.username} • Vai trò: {userToDelete.role === 'admin' ? 'Quản trị viên' : 'Giáo viên'}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeletingUser}
                  onClick={() => setUserToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isDeletingUser}
                  onClick={handleConfirmDeleteUser}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isDeletingUser ? (
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
        </div>
      )}

      {/* ================= MODAL: XEM LẠI BÀI LÀM CỦA HỌC SINH (ADMIN) ================= */}
      {submissionToReview && (
        <ExamReviewModal
          submission={submissionToReview}
          exams={exams}
          onClose={() => setSubmissionToReview(null)}
          onDelete={(sub) => {
            setSubmissionToReview(null);
            setSubmissionToDelete(sub);
          }}
        />
      )}

      {/* ================= MODAL: XÁC NHẬN XÓA 1 BÀI THI CỦA HỌC SINH (ADMIN) ================= */}
      {submissionToDelete && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-red-100 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Xác Nhận Xóa Bài Thi</h3>
                <p className="text-xs text-slate-500">Đặc quyền Quản trị viên hệ thống (Admin)</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Thí sinh:</span>
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
              💡 <strong>Lưu ý quản trị:</strong> Thao tác xóa kết quả bài thi khỏi hệ thống không thể hoàn tác. Thí sinh sẽ có thể tham gia thi lại nếu đề thi đang mở.
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

      {/* ================= MODAL: XÁC NHẬN XÓA HÀNG LOẠT BÀI THI (ADMIN) ================= */}
      {isBulkDeleteSubmissionsOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-red-100 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-red-600">Xóa Hàng Loạt Bài Thi?</h3>
                <p className="text-xs text-slate-500">Cảnh báo xóa vĩnh viễn dữ liệu khảo thí</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa vĩnh viễn <strong>{selectedSubmissionIds.length}</strong> bài thi đã chọn khỏi hệ thống? Dữ liệu điểm số và lịch sử bài làm tương ứng sẽ bị xóa hoàn toàn.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isBulkDeletingSubmissions}
                onClick={() => setIsBulkDeleteSubmissionsOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={isBulkDeletingSubmissions}
                onClick={handleConfirmBulkDeleteSubmissions}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isBulkDeletingSubmissions ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Xóa {selectedSubmissionIds.length} Bài Thi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: DANH SÁCH & QUẢN LÝ BÀI THI CỦA 1 HỌC SINH (ADMIN) ================= */}
      {adminStudentToViewSubmissions && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[88vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>{adminStudentToViewSubmissions.fullName}</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/20 text-white">
                    SBD: {adminStudentToViewSubmissions.studentCode}
                  </span>
                </h3>
                <span className="text-xs text-slate-300 font-mono mt-0.5 block">
                  Lớp: {classMap.get(adminStudentToViewSubmissions.classId)?.name || 'Chưa phân lớp'} • Trường: {schoolMap.get(adminStudentToViewSubmissions.schoolId)?.name || 'Chưa gán trường'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAdminStudentToViewSubmissions(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-header with Delete All button */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <span className="text-xs font-bold text-slate-700">
                Lịch sử bài thi ({submissions.filter((s) => s.studentId === adminStudentToViewSubmissions.id).length} bài đã nộp)
              </span>

              {submissions.filter((s) => s.studentId === adminStudentToViewSubmissions.id).length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDeleteAllForStudent(true)}
                  className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa Toàn Bộ Bài Thi Của Học Sinh</span>
                </button>
              )}
            </div>

            {/* Submissions List */}
            <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1 text-xs">
              {paginatedAdminStudentSubs.map((sub) => {
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
                            ⏱️ {minutes > 0 ? `${minutes}p ` : ''}{seconds}s
                          </span>
                          {sub.violationCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-red-600 font-bold inline-flex items-center gap-1">
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
                          title="Xem chi tiết bài làm của học sinh"
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

              {adminStudentSubmissions.length > 0 && (
                <Pagination
                  currentPage={currentAdminStudentSubsPage}
                  totalItems={adminStudentSubmissions.length}
                  pageSize={10}
                  onPageChange={setAdminStudentSubsPage}
                  itemName="bài thi"
                  className="rounded-xl border border-slate-200 mt-2"
                />
              )}

              {adminStudentSubmissions.length === 0 && (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold">Học sinh chưa tham gia bài thi nào.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÁC NHẬN XÓA TOÀN BỘ BÀI THI CỦA 1 HỌC SINH (ADMIN) ================= */}
      {isConfirmingDeleteAllForStudent && adminStudentToViewSubmissions && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-red-100 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-red-600">Xóa Toàn Bộ Bài Thi?</h3>
                <p className="text-xs text-slate-500">Đặc quyền Quản trị viên hệ thống (Admin)</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa tất cả các bài thi đã làm của học sinh{' '}
              <strong className="text-slate-900">{adminStudentToViewSubmissions.fullName}</strong> (SBD: {adminStudentToViewSubmissions.studentCode})? Toàn bộ điểm số, lượt làm bài sẽ bị đặt lại về ban đầu.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingAllForStudent}
                onClick={() => setIsConfirmingDeleteAllForStudent(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={isDeletingAllForStudent}
                onClick={handleConfirmDeleteAllForStudent}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isDeletingAllForStudent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Xác Nhận Xóa Hết</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÓA BÀI THI THEO KHOẢNG ĐIỂM (ADMIN) ================= */}
      <ScoreRangeDeleteModal
        isOpen={isScoreRangeDeleteOpen}
        onClose={() => setIsScoreRangeDeleteOpen(false)}
        submissions={submissions}
        classes={classes}
        exams={exams}
        schools={schools}
        role="admin"
        onDeleteSuccess={(deletedCount, affectedStudentsCount) => {
          showToast(`Đã xóa thành công ${deletedCount} bài thi của ${affectedStudentsCount} học sinh theo khoảng điểm!`);
        }}
      />

      {/* ================= MODAL: TỐI ƯU DUNG LƯỢNG TURSO (BẢN FREE) ================= */}
      <StorageOptimizationModal
        isOpen={isStorageOptimizationOpen}
        onClose={() => setIsStorageOptimizationOpen(false)}
        submissions={submissions}
        onActionComplete={(msg) => {
          showToast(msg);
        }}
      />

      {/* ================= MODAL: CẤU HÌNH TURSO & GITHUB TRỰC TIẾP ================= */}
      <TursoConfigModal
        isOpen={isSupabaseConfigModalOpen}
        onClose={() => setIsSupabaseConfigModalOpen(false)}
        onConfigSaved={() => {
          showToast('Đã lưu cấu hình Turso & GitHub thành công! Đang tải lại dữ liệu...');
        }}
      />

      {/* ================= MODAL: KIẾN TRÚC TÁCH NHIỀU BẢNG CSDL ================= */}
      <MultiTableSchemaModal
        isOpen={isMultiTableModalOpen}
        onClose={() => setIsMultiTableModalOpen(false)}
        exams={exams}
        onMigrated={() => {
          showToast('✓ Đã tách và phân bổ toàn bộ đề thi & câu hỏi sang nhiều bảng trên Turso thành công!');
        }}
      />

    </div>
  );
};
