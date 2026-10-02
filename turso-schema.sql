-- =========================================================================
-- SQL SCHEMA FOR TURSO (SQLITE / LIBSQL) - HỆ THỐNG KHẢO THÍ THIENTCH
-- =========================================================================
-- Chuẩn hóa SQLite 100% tương thích Turso Database
-- Hướng dẫn: Bạn có thể chạy script này qua Turso CLI:
--   turso db shell <tên-db> < turso-schema.sql
-- Hoặc bấm nút "Khởi Tạo Bảng Tự Động" ngay trên giao diện Cấu hình Web!

-- 1. BẢNG TRƯỜNG HỌC (schools)
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  level TEXT DEFAULT 'highschool',
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- 2. BẢNG LỚP HỌC (classes)
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  schoolId TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  grade TEXT,
  schoolYear TEXT,
  homeroomTeacher TEXT,
  room TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- 3. BẢNG HỌC SINH (students)
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  schoolId TEXT,
  classId TEXT,
  studentCode TEXT NOT NULL,
  fullName TEXT NOT NULL,
  dateOfBirth TEXT,
  gender TEXT DEFAULT 'other',
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  note TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- 4. BẢNG TÀI KHOẢN NGƯỜI DÙNG (users: Admin & Giáo Viên)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  fullName TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  subjects TEXT,
  schoolId TEXT,
  schoolIds TEXT DEFAULT '[]',
  classIds TEXT DEFAULT '[]',
  role TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  lastLogin TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- 5. BẢNG ĐỀ THI TỔNG QUAN (exams)
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
  requiredPassCount INTEGER DEFAULT 1,
  status TEXT DEFAULT 'published',
  allowReviewAnswers INTEGER DEFAULT 1,
  isPracticeTest INTEGER DEFAULT 0,
  practiceRandomCount INTEGER DEFAULT 0,
  totalQuestions INTEGER DEFAULT 0,
  questionIds TEXT DEFAULT '[]',
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- 6. BẢNG CHI TIẾT CÂU HỎI THI (exam_questions)
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

-- 7. BẢNG PHƯƠNG ÁN TRẮC NGHIỆM (question_options)
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

-- 8. BẢNG CÁC CẶP GHÉP ĐÔI (question_matching_pairs)
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

-- 9. BẢNG MỤC SẮP XẾP THỨ TỰ (question_ordering_items)
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

-- 10. BẢNG MỆNH ĐỀ ĐÚNG / SAI (question_tf_statements)
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

-- 11. BẢNG VỊ TRÍ ĐIỀN KHUYẾT (question_fill_blank_items)
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

-- 12. BẢNG VÙNG CHỌN ĐIỂM NÓNG HÌNH ẢNH (question_hotspots)
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

-- 13. BẢNG NGÂN HÀNG CÂU HỎI TẬP TRUNG (question_bank)
CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  mediaType TEXT DEFAULT 'none',
  mediaUrl TEXT,
  explanation TEXT,
  options TEXT DEFAULT '[]',
  correctOptionId TEXT,
  correctOptionIds TEXT DEFAULT '[]',
  matchingPairs TEXT DEFAULT '[]',
  shuffledRightPairs TEXT DEFAULT '[]',
  orderingItems TEXT DEFAULT '[]',
  trueLabel TEXT DEFAULT 'Đúng',
  falseLabel TEXT DEFAULT 'Sai',
  tfStatements TEXT DEFAULT '[]',
  shuffledTfColumns TEXT DEFAULT '[]',
  hotspotImageUrl TEXT,
  hotspotRegions TEXT DEFAULT '[]',
  fillBlankTemplate TEXT,
  fillBlankItems TEXT DEFAULT '[]',
  sourceExamId TEXT,
  sourceExamTitle TEXT,
  subject TEXT DEFAULT 'Công nghệ Thông tin',
  grade TEXT DEFAULT 'Khối 12',
  creatorId TEXT,
  creatorName TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- 14. BẢNG KẾT QUẢ NỘP BÀI (submissions)
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  examId TEXT NOT NULL,
  examTitle TEXT NOT NULL,
  studentId TEXT NOT NULL,
  studentName TEXT NOT NULL,
  studentCode TEXT NOT NULL,
  classId TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  maxScore INTEGER DEFAULT 1000,
  isPassed INTEGER DEFAULT 0,
  submittedAt TEXT DEFAULT (datetime('now')),
  dateKey TEXT,
  timeSpentSeconds INTEGER DEFAULT 0,
  attemptNumber INTEGER DEFAULT 1,
  isPractice INTEGER DEFAULT 0,
  isTeacherTesting INTEGER DEFAULT 0,
  studentAnswers TEXT DEFAULT '{}',
  questionResults TEXT DEFAULT '{}',
  questionOrder TEXT DEFAULT '[]',
  violationCount INTEGER DEFAULT 0,
  violationLogs TEXT DEFAULT '[]'
);

-- 15. BẢNG NHẬT KÝ HOẠT ĐỘNG (audit_logs)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT,
  actor TEXT,
  details TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

-- =========================================================================
-- CHỈ MỤC (INDEXES) TỐI ƯU HÓA TRUY VẤN TURSO / SQLITE (CHỐNG FULL TABLE SCAN)
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_schools_code ON schools(code);
CREATE INDEX IF NOT EXISTS idx_schools_createdAt ON schools(createdAt);

CREATE INDEX IF NOT EXISTS idx_classes_schoolId ON classes(schoolId);
CREATE INDEX IF NOT EXISTS idx_classes_grade ON classes(grade);
CREATE INDEX IF NOT EXISTS idx_classes_code ON classes(code);
CREATE INDEX IF NOT EXISTS idx_classes_createdAt ON classes(createdAt);

CREATE INDEX IF NOT EXISTS idx_students_classId ON students(classId);
CREATE INDEX IF NOT EXISTS idx_students_schoolId ON students(schoolId);
CREATE INDEX IF NOT EXISTS idx_students_code ON students(studentCode);
CREATE INDEX IF NOT EXISTS idx_students_username ON students(username);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_createdAt ON students(createdAt);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_schoolId ON users(schoolId);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_createdAt ON users(createdAt);

CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_creatorId ON exams(creatorId);
CREATE INDEX IF NOT EXISTS idx_exams_createdAt ON exams(createdAt);
CREATE INDEX IF NOT EXISTS idx_exams_subject_grade ON exams(subject, grade);
CREATE INDEX IF NOT EXISTS idx_exams_isPractice ON exams(isPracticeTest);

CREATE INDEX IF NOT EXISTS idx_exam_questions_examId ON exam_questions(examId);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_order ON exam_questions(examId, orderIndex);
CREATE INDEX IF NOT EXISTS idx_exam_questions_type ON exam_questions(type);
CREATE INDEX IF NOT EXISTS idx_exam_questions_createdAt ON exam_questions(createdAt);

CREATE INDEX IF NOT EXISTS idx_question_options_qId ON question_options(questionId);
CREATE INDEX IF NOT EXISTS idx_question_options_examId ON question_options(examId);
CREATE INDEX IF NOT EXISTS idx_question_options_q_order ON question_options(questionId, orderIndex);
CREATE INDEX IF NOT EXISTS idx_question_options_exam_q ON question_options(examId, questionId);

CREATE INDEX IF NOT EXISTS idx_question_matching_qId ON question_matching_pairs(questionId);
CREATE INDEX IF NOT EXISTS idx_question_matching_examId ON question_matching_pairs(examId);
CREATE INDEX IF NOT EXISTS idx_question_matching_q_order ON question_matching_pairs(questionId, orderIndex);

CREATE INDEX IF NOT EXISTS idx_question_ordering_qId ON question_ordering_items(questionId);
CREATE INDEX IF NOT EXISTS idx_question_ordering_examId ON question_ordering_items(examId);
CREATE INDEX IF NOT EXISTS idx_question_ordering_q_order ON question_ordering_items(questionId, orderIndex);

CREATE INDEX IF NOT EXISTS idx_question_tf_qId ON question_tf_statements(questionId);
CREATE INDEX IF NOT EXISTS idx_question_tf_examId ON question_tf_statements(examId);
CREATE INDEX IF NOT EXISTS idx_question_tf_q_order ON question_tf_statements(questionId, orderIndex);

CREATE INDEX IF NOT EXISTS idx_question_fb_qId ON question_fill_blank_items(questionId);
CREATE INDEX IF NOT EXISTS idx_question_fb_examId ON question_fill_blank_items(examId);
CREATE INDEX IF NOT EXISTS idx_question_fb_q_order ON question_fill_blank_items(questionId, orderIndex);

CREATE INDEX IF NOT EXISTS idx_question_hs_qId ON question_hotspots(questionId);
CREATE INDEX IF NOT EXISTS idx_question_hs_examId ON question_hotspots(examId);
CREATE INDEX IF NOT EXISTS idx_question_hs_q_order ON question_hotspots(questionId, orderIndex);

CREATE INDEX IF NOT EXISTS idx_question_bank_subject_grade ON question_bank(subject, grade);
CREATE INDEX IF NOT EXISTS idx_question_bank_sourceExamId ON question_bank(sourceExamId);
CREATE INDEX IF NOT EXISTS idx_question_bank_creatorId ON question_bank(creatorId);
CREATE INDEX IF NOT EXISTS idx_question_bank_type ON question_bank(type);
CREATE INDEX IF NOT EXISTS idx_question_bank_createdAt ON question_bank(createdAt);
CREATE INDEX IF NOT EXISTS idx_question_bank_updatedAt ON question_bank(updatedAt);

CREATE INDEX IF NOT EXISTS idx_submissions_examId ON submissions(examId);
CREATE INDEX IF NOT EXISTS idx_submissions_studentId ON submissions(studentId);
CREATE INDEX IF NOT EXISTS idx_submissions_classId ON submissions(classId);
CREATE INDEX IF NOT EXISTS idx_submissions_student_exam ON submissions(studentId, examId);
CREATE INDEX IF NOT EXISTS idx_submissions_submittedAt ON submissions(submittedAt);
CREATE INDEX IF NOT EXISTS idx_submissions_dateKey ON submissions(dateKey);
CREATE INDEX IF NOT EXISTS idx_submissions_isPractice ON submissions(isPractice);
CREATE INDEX IF NOT EXISTS idx_submissions_isPassed ON submissions(isPassed);
CREATE INDEX IF NOT EXISTS idx_submissions_score ON submissions(score);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_createdAt ON audit_logs(createdAt);

-- =========================================================================
-- LỆNH BỔ SUNG CỘT CHO BẢNG EXAMS HIỆN CÓ TRÊN TURSO
-- Chạy lệnh này nếu cơ sở dữ liệu Turso đã được tạo trước đó:
-- =========================================================================
-- ALTER TABLE exams ADD COLUMN requiredPassCount INTEGER DEFAULT 1;

