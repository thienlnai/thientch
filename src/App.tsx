/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  School, 
  SchoolClass, 
  Student, 
  UserAccount, 
  Language,
  Exam,
  ExamSubmission
} from './types/index.ts';
import {
  subscribeSchools,
  subscribeClasses,
  subscribeStudents,
  subscribeUsers,
  subscribeExams,
  subscribeSubmissions,
  getStudentSubmissions,
  seedInitialDataIfNeeded,
} from './services/dbService.ts';
import { testConnection } from './turso.ts';
import { LoginPage } from './components/LoginPage.tsx';
import { AdminPortal } from './components/AdminPortal.tsx';
import { TeacherPortal } from './components/TeacherPortal.tsx';
import { StudentPortal } from './components/StudentPortal.tsx';

export default function App() {
  const [lang, setLang] = useState<Language>('vi');

  // Turso SQLite Cloud Real-time Collections
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);

  // Connectivity
  const [isLiveSync, setIsLiveSync] = useState(false);

  // Current Logged-in State
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'teacher' | 'student' | null>(null);
  const [currentUserData, setCurrentUserData] = useState<UserAccount | Student | null>(null);

  // 1. Initialize core metadata subscriptions (schools, classes, students, users, exams)
  useEffect(() => {
    testConnection()
      .then((connected) => {
        setIsLiveSync(connected);
      })
      .catch(() => setIsLiveSync(false));

    const unsubSchools = subscribeSchools((data) => setSchools(data));
    const unsubClasses = subscribeClasses((data) => setClasses(data));
    const unsubStudents = subscribeStudents((data) => setStudents(data));
    const unsubUsers = subscribeUsers((data) => setUsers(data));
    const unsubExams = subscribeExams((data) => setExams(data));

    return () => {
      if (unsubSchools) unsubSchools();
      if (unsubClasses) unsubClasses();
      if (unsubStudents) unsubStudents();
      if (unsubUsers) unsubUsers();
      if (unsubExams) unsubExams();
    };
  }, []);

  // 2. Chống bùng nổ Row Read Turso: Chỉ đăng ký bài nộp toàn trường khi là Giáo viên / Admin
  // Học sinh tuyệt đối không tải toàn bộ bài thi của cả trường
  useEffect(() => {
    if (currentUserRole === 'admin' || currentUserRole === 'teacher') {
      const unsubSubmissions = subscribeSubmissions((data) => setSubmissions(data));
      return () => {
        if (unsubSubmissions) unsubSubmissions();
      };
    } else if (currentUserRole === 'student' && currentUserData?.id) {
      // Học sinh chỉ nạp bài thi của chính mình (chỉ tốn đúng 1-2 row reads có index)
      getStudentSubmissions(currentUserData.id).then((mySubs) => {
        setSubmissions(mySubs);
      }).catch(() => {});
    } else {
      setSubmissions([]);
    }
  }, [currentUserRole, currentUserData?.id]);

  // Check and seed initial data once only if database is completely empty
  useEffect(() => {
    if (users.length === 0 && schools.length === 0) {
      const timer = setTimeout(() => {
        seedInitialDataIfNeeded(users, schools);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [users.length === 0, schools.length === 0]);

  // Handle Login
  const handleLoginSuccess = (
    role: 'admin' | 'teacher' | 'student',
    userData: UserAccount | Student,
    _remember: boolean
  ) => {
    setCurrentUserRole(role);
    setCurrentUserData(userData);
  };

  // Handle Logout
  const handleLogout = () => {
    setCurrentUserRole(null);
    setCurrentUserData(null);
  };

  // Render Portals based on Role
  if (currentUserRole === 'admin' && currentUserData) {
    return (
      <AdminPortal
        currentUser={currentUserData as UserAccount}
        onLogout={handleLogout}
        lang={lang}
        schools={schools}
        classes={classes}
        students={students}
        users={users}
        exams={exams}
        submissions={submissions}
        isLiveSync={isLiveSync}
      />
    );
  }

  if (currentUserRole === 'teacher' && currentUserData) {
    return (
      <TeacherPortal
        teacher={currentUserData as UserAccount}
        classes={classes}
        students={students}
        schools={schools}
        exams={exams}
        submissions={submissions}
        onLogout={handleLogout}
        lang={lang}
      />
    );
  }

  if (currentUserRole === 'student' && currentUserData) {
    const student = currentUserData as Student;
    const currentSchool = schools.find((s) => s.id === student.schoolId);
    const currentClass = classes.find((c) => c.id === student.classId);

    return (
      <StudentPortal
        student={student}
        school={currentSchool}
        studentClass={currentClass}
        exams={exams}
        submissions={submissions}
        teachers={users.filter((u) => u.role === 'teacher')}
        onLogout={handleLogout}
        lang={lang}
      />
    );
  }

  // Default: Show Login Page
  return (
    <LoginPage
      students={students}
      users={users}
      onLoginSuccess={handleLoginSuccess}
      lang={lang}
      onLanguageChange={(newLang) => setLang(newLang)}
    />
  );
}
