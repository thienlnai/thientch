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
-- CHỈ MỤC (INDEXES) TỐI ƯU HÓA TRUY VẤN TURSO / SQLITE
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_classes_schoolId ON classes(schoolId);
CREATE INDEX IF NOT EXISTS idx_students_classId ON students(classId);
CREATE INDEX IF NOT EXISTS idx_students_code ON students(studentCode);
CREATE INDEX IF NOT EXISTS idx_exam_questions_examId ON exam_questions(examId);
CREATE INDEX IF NOT EXISTS idx_question_options_qId ON question_options(questionId);
CREATE INDEX IF NOT EXISTS idx_question_matching_qId ON question_matching_pairs(questionId);
CREATE INDEX IF NOT EXISTS idx_question_ordering_qId ON question_ordering_items(questionId);
CREATE INDEX IF NOT EXISTS idx_question_tf_qId ON question_tf_statements(questionId);
CREATE INDEX IF NOT EXISTS idx_question_fb_qId ON question_fill_blank_items(questionId);
CREATE INDEX IF NOT EXISTS idx_question_hs_qId ON question_hotspots(questionId);
CREATE INDEX IF NOT EXISTS idx_submissions_examId ON submissions(examId);
CREATE INDEX IF NOT EXISTS idx_submissions_studentId ON submissions(studentId);
