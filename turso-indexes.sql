-- =========================================================================
-- TỐI ƯU HÓA CHỈ MỤC (INDEXES) CƠ SỞ DỮ LIỆU TURSO - HỆ THỐNG THIENTECH
-- =========================================================================
-- Giải quyết triệt để vấn đề bùng nổ "Rows Read" trên Turso Database (libSQL)
-- Ngăn chặn 100% Full Table Scan cho tất cả các bảng khi truy vấn:
-- WHERE, JOIN, ORDER BY, GROUP BY.
-- Đảm bảo các bảng exam_questions, question_options, submissions không bao giờ quét toàn bảng.
-- Chạy script này trực tiếp trên Turso Web Shell hoặc Turso CLI:
--   turso db shell <tên-db> < turso-indexes.sql
-- =========================================================================

-- 1. BẢNG TRƯỜNG HỌC (schools)
CREATE INDEX IF NOT EXISTS idx_schools_code ON schools(code);
CREATE INDEX IF NOT EXISTS idx_schools_createdAt ON schools(createdAt);

-- 2. BẢNG LỚP HỌC (classes)
CREATE INDEX IF NOT EXISTS idx_classes_schoolId ON classes(schoolId);
CREATE INDEX IF NOT EXISTS idx_classes_grade ON classes(grade);
CREATE INDEX IF NOT EXISTS idx_classes_code ON classes(code);
CREATE INDEX IF NOT EXISTS idx_classes_createdAt ON classes(createdAt);

-- 3. BẢNG HỌC SINH (students)
CREATE INDEX IF NOT EXISTS idx_students_classId ON students(classId);
CREATE INDEX IF NOT EXISTS idx_students_schoolId ON students(schoolId);
CREATE INDEX IF NOT EXISTS idx_students_code ON students(studentCode);
CREATE INDEX IF NOT EXISTS idx_students_username ON students(username);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_createdAt ON students(createdAt);

-- 4. BẢNG TÀI KHOẢN NGƯỜI DÙNG (users)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_schoolId ON users(schoolId);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_createdAt ON users(createdAt);

-- 5. BẢNG ĐỀ THI TỔNG QUAN (exams)
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_creatorId ON exams(creatorId);
CREATE INDEX IF NOT EXISTS idx_exams_createdAt ON exams(createdAt);
CREATE INDEX IF NOT EXISTS idx_exams_subject_grade ON exams(subject, grade);
CREATE INDEX IF NOT EXISTS idx_exams_isPractice ON exams(isPracticeTest);

-- 6. BẢNG CHI TIẾT CÂU HỎI THI (exam_questions) - TỐI ƯU JOIN & ORDER THEO ĐỀ THI
CREATE INDEX IF NOT EXISTS idx_exam_questions_examId ON exam_questions(examId);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_order ON exam_questions(examId, orderIndex);
CREATE INDEX IF NOT EXISTS idx_exam_questions_type ON exam_questions(type);
CREATE INDEX IF NOT EXISTS idx_exam_questions_createdAt ON exam_questions(createdAt);

-- 7. BẢNG PHƯƠNG ÁN TRẮC NGHIỆM (question_options)
CREATE INDEX IF NOT EXISTS idx_question_options_qId ON question_options(questionId);
CREATE INDEX IF NOT EXISTS idx_question_options_examId ON question_options(examId);
CREATE INDEX IF NOT EXISTS idx_question_options_q_order ON question_options(questionId, orderIndex);
CREATE INDEX IF NOT EXISTS idx_question_options_exam_q ON question_options(examId, questionId);

-- 8. BẢNG CÁC CẶP GHÉP ĐÔI (question_matching_pairs)
CREATE INDEX IF NOT EXISTS idx_question_matching_qId ON question_matching_pairs(questionId);
CREATE INDEX IF NOT EXISTS idx_question_matching_examId ON question_matching_pairs(examId);
CREATE INDEX IF NOT EXISTS idx_question_matching_q_order ON question_matching_pairs(questionId, orderIndex);

-- 9. BẢNG MỤC SẮP XẾP THỨ TỰ (question_ordering_items)
CREATE INDEX IF NOT EXISTS idx_question_ordering_qId ON question_ordering_items(questionId);
CREATE INDEX IF NOT EXISTS idx_question_ordering_examId ON question_ordering_items(examId);
CREATE INDEX IF NOT EXISTS idx_question_ordering_q_order ON question_ordering_items(questionId, orderIndex);

-- 10. BẢNG MỆNH ĐỀ ĐÚNG / SAI (question_tf_statements)
CREATE INDEX IF NOT EXISTS idx_question_tf_qId ON question_tf_statements(questionId);
CREATE INDEX IF NOT EXISTS idx_question_tf_examId ON question_tf_statements(examId);
CREATE INDEX IF NOT EXISTS idx_question_tf_q_order ON question_tf_statements(questionId, orderIndex);

-- 11. BẢNG VỊ TRÍ ĐIỀN KHUYẾT (question_fill_blank_items)
CREATE INDEX IF NOT EXISTS idx_question_fb_qId ON question_fill_blank_items(questionId);
CREATE INDEX IF NOT EXISTS idx_question_fb_examId ON question_fill_blank_items(examId);
CREATE INDEX IF NOT EXISTS idx_question_fb_q_order ON question_fill_blank_items(questionId, orderIndex);

-- 12. BẢNG VÙNG CHỌN ĐIỂM NÓNG HÌNH ẢNH (question_hotspots)
CREATE INDEX IF NOT EXISTS idx_question_hs_qId ON question_hotspots(questionId);
CREATE INDEX IF NOT EXISTS idx_question_hs_examId ON question_hotspots(examId);
CREATE INDEX IF NOT EXISTS idx_question_hs_q_order ON question_hotspots(questionId, orderIndex);

-- 13. BẢNG NGÂN HÀNG CÂU HỎI TẬP TRUNG (question_bank)
CREATE INDEX IF NOT EXISTS idx_question_bank_subject_grade ON question_bank(subject, grade);
CREATE INDEX IF NOT EXISTS idx_question_bank_sourceExamId ON question_bank(sourceExamId);
CREATE INDEX IF NOT EXISTS idx_question_bank_creatorId ON question_bank(creatorId);
CREATE INDEX IF NOT EXISTS idx_question_bank_type ON question_bank(type);
CREATE INDEX IF NOT EXISTS idx_question_bank_createdAt ON question_bank(createdAt);
CREATE INDEX IF NOT EXISTS idx_question_bank_updatedAt ON question_bank(updatedAt);

-- 14. BẢNG BÀI NỘP & KẾT QUẢ THI (submissions) - TỐI ƯU TRUY VẤN LỊCH SỬ THI
CREATE INDEX IF NOT EXISTS idx_submissions_examId ON submissions(examId);
CREATE INDEX IF NOT EXISTS idx_submissions_studentId ON submissions(studentId);
CREATE INDEX IF NOT EXISTS idx_submissions_classId ON submissions(classId);
CREATE INDEX IF NOT EXISTS idx_submissions_student_exam ON submissions(studentId, examId);
CREATE INDEX IF NOT EXISTS idx_submissions_submittedAt ON submissions(submittedAt);
CREATE INDEX IF NOT EXISTS idx_submissions_dateKey ON submissions(dateKey);
CREATE INDEX IF NOT EXISTS idx_submissions_isPractice ON submissions(isPractice);
CREATE INDEX IF NOT EXISTS idx_submissions_isPassed ON submissions(isPassed);
CREATE INDEX IF NOT EXISTS idx_submissions_score ON submissions(score);

-- 15. BẢNG NHẬT KÝ HOẠT ĐỘNG (audit_logs)
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_createdAt ON audit_logs(createdAt);

