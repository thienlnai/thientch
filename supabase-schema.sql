-- =========================================================================
-- SQL SCHEMA FOR SUPABASE - HỆ THỐNG KHẢO THÍ THIENTCH (KIẾN TRÚC NHIỀU BẢNG)
-- =========================================================================
-- Hướng dẫn: Mở Supabase Dashboard -> Project của bạn -> SQL Editor -> Dán toàn bộ script này và nhấn 'Run'.
-- Kiến trúc tách riêng:
--  1. public.exams (Thông tin tổng quan đề thi)
--  2. public.exam_questions (Danh sách chi tiết câu hỏi)
--  3. public.question_options (Phương án lựa chọn trắc nghiệm A, B, C, D)
--  4. public.question_matching_pairs (Cặp ghép nối cột Trái - Phải)
--  5. public.question_ordering_items (Các mục sắp xếp thứ tự)
--  6. public.question_tf_statements (Mệnh đề Đúng / Sai)
--  7. public.question_fill_blank_items (Vị trí điền khuyết dropdown)
--  8. public.question_hotspots (Vùng khoanh chọn điểm nóng trên ảnh)

-- 1. BẢNG TRƯỜNG HỌC (schools)
CREATE TABLE IF NOT EXISTS public.schools (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  level TEXT DEFAULT 'highschool',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BẢNG LỚP HỌC (classes)
CREATE TABLE IF NOT EXISTS public.classes (
  id TEXT PRIMARY KEY,
  "schoolId" TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  grade TEXT,
  "schoolYear" TEXT,
  "homeroomTeacher" TEXT,
  room TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG HỌC SINH (students)
CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  "schoolId" TEXT,
  "classId" TEXT,
  "studentCode" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "dateOfBirth" TEXT,
  gender TEXT DEFAULT 'other',
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  note TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BẢNG TÀI KHOẢN NGƯỜI DÙNG (users: Admin & Giáo Viên)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  "fullName" TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  subjects TEXT,
  "schoolId" TEXT,
  "classIds" JSONB DEFAULT '[]'::jsonb,
  role TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  "lastLogin" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BẢNG ĐỀ THI TỔNG QUAN (exams - Đã tách câu hỏi sang các bảng riêng, siêu nhẹ và tải tức thì)
CREATE TABLE IF NOT EXISTS public.exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  grade TEXT,
  "creatorId" TEXT,
  "creatorName" TEXT,
  "classIds" JSONB DEFAULT '[]'::jsonb,
  "durationMinutes" INTEGER DEFAULT 45,
  "totalScore" INTEGER DEFAULT 1000,
  "passingScore" INTEGER DEFAULT 950,
  status TEXT DEFAULT 'published',
  "allowReviewAnswers" BOOLEAN DEFAULT TRUE,
  "isPracticeTest" BOOLEAN DEFAULT FALSE,
  "practiceRandomCount" INTEGER DEFAULT 0,
  "totalQuestions" INTEGER DEFAULT 0,
  "questionIds" JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 6. BẢNG KẾT QUẢ NỘP BÀI (submissions - Tối ưu siêu nhẹ ~0.8 KB/bài)
CREATE TABLE IF NOT EXISTS public.submissions (
  id TEXT PRIMARY KEY,
  "examId" TEXT NOT NULL,
  "examTitle" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "studentCode" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  "maxScore" INTEGER DEFAULT 1000,
  "isPassed" BOOLEAN DEFAULT FALSE,
  "submittedAt" TIMESTAMPTZ DEFAULT NOW(),
  "dateKey" TEXT,
  "timeSpentSeconds" INTEGER DEFAULT 0,
  "attemptNumber" INTEGER DEFAULT 1,
  "isPractice" BOOLEAN DEFAULT FALSE,
  "isTeacherTesting" BOOLEAN DEFAULT FALSE,
  "studentAnswers" JSONB DEFAULT '{}'::jsonb,
  "questionResults" JSONB DEFAULT '{}'::jsonb,
  "questionOrder" JSONB DEFAULT '[]'::jsonb,
  "violationCount" INTEGER DEFAULT 0,
  "violationLogs" JSONB DEFAULT '[]'::jsonb
);

-- 7. BẢNG NHẬT KÝ HOẠT ĐỘNG (audit_logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT,
  actor TEXT,
  details JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- BỔ SUNG CỘT CHO CÁC BẢNG NẾU ĐÃ TẠO TỪ TRƯỚC
-- =========================================================================
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS "classIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS "allowReviewAnswers" BOOLEAN DEFAULT TRUE;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS "isPracticeTest" BOOLEAN DEFAULT FALSE;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS "practiceRandomCount" INTEGER DEFAULT 0;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS "totalQuestions" INTEGER DEFAULT 0;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS "questionIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();

-- =========================================================================
-- 8. BẢNG CHI TIẾT CÂU HỎI THI (exam_questions) - TÁCH RIÊNG KHỎI BẢNG EXAMS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.exam_questions (
  id TEXT PRIMARY KEY,
  "examId" TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  "orderIndex" INTEGER DEFAULT 0,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  "mediaType" TEXT DEFAULT 'none',
  "mediaUrl" TEXT,
  explanation TEXT,
  "correctOptionId" TEXT,
  "trueLabel" TEXT DEFAULT 'Đúng',
  "falseLabel" TEXT DEFAULT 'Sai',
  "hotspotImageUrl" TEXT,
  "fillBlankTemplate" TEXT,
  options JSONB,
  "correctOptionIds" JSONB,
  "matchingPairs" JSONB,
  "shuffledRightPairs" JSONB,
  "orderingItems" JSONB,
  "tfStatements" JSONB,
  "shuffledTfColumns" JSONB,
  "hotspotRegions" JSONB,
  "fillBlankItems" JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- 9. BẢNG PHƯƠNG ÁN TRẮC NGHIỆM (question_options) - TÁCH RIÊNG CÁC ĐÁP ÁN A, B, C, D
-- =========================================================================
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

-- =========================================================================
-- 10. BẢNG CÁC CẶP GHÉP ĐÔI (question_matching_pairs) - TÁCH RIÊNG CỘT TRÁI & PHẢI
-- =========================================================================
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

-- =========================================================================
-- 11. BẢNG MỤC SẮP XẾP THỨ TỰ (question_ordering_items) - TÁCH RIÊNG CÁC MỤC SẮP XẾP
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.question_ordering_items (
  id TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  "examId" TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  "orderIndex" INTEGER DEFAULT 0,
  text TEXT NOT NULL,
  "imageUrl" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- 12. BẢNG MỆNH ĐỀ ĐÚNG / SAI (question_tf_statements) - TÁCH RIÊNG CÁC PHÁT BIỂU
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.question_tf_statements (
  id TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  "examId" TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  "orderIndex" INTEGER DEFAULT 0,
  statement TEXT NOT NULL,
  "isTrue" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- 13. BẢNG VỊ TRÍ ĐIỀN KHUYẾT (question_fill_blank_items) - TÁCH RIÊNG MENU SỔ XUỐNG
-- =========================================================================
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

-- =========================================================================
-- 14. BẢNG VÙNG CHỌN ĐIỂM NÓNG HÌNH ẢNH (question_hotspots)
-- =========================================================================
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

-- =========================================================================
-- 15. BẢNG NGÂN HÀNG CÂU HỎI (question_bank) - KHO CÂU HỎI LƯU TRỮ VĨNH VIỄN & TÁI SỬ DỤNG
-- =========================================================================
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

-- =========================================================================
-- CHỈ MỤC TỐI ƯU HÓA TRUY VẤN (INDEXES)
-- =========================================================================
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

-- =========================================================================
-- TỰ ĐỘNG BÓC TÁCH DỮ LIỆU CŨ TỪ BẢNG EXAMS SANG CÁC BẢNG RIÊNG BIỆT
-- =========================================================================
DO $$
DECLARE
  exam_rec RECORD;
  q_item JSONB;
  q_id TEXT;
  opt_item JSONB;
  pair_item JSONB;
  ord_item JSONB;
  tf_item JSONB;
  fb_item JSONB;
  hs_item JSONB;
  idx INTEGER;
  sub_idx INTEGER;
  is_corr BOOLEAN;
BEGIN
  -- Chỉ chạy nếu bảng exams còn chứa cột questions
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'questions'
  ) THEN
    FOR exam_rec IN SELECT id, questions FROM public.exams WHERE questions IS NOT NULL LOOP
      IF jsonb_typeof(exam_rec.questions) = 'array' AND jsonb_array_length(exam_rec.questions) > 0 THEN
        idx := 0;
        FOR q_item IN SELECT * FROM jsonb_array_elements(exam_rec.questions) LOOP
          q_id := COALESCE(q_item->>'id', 'q_' || exam_rec.id || '_' || idx);

          -- 1. Chèn vào bảng exam_questions
          INSERT INTO public.exam_questions (
            id, "examId", "orderIndex", type, title, "mediaType", "mediaUrl",
            explanation, "correctOptionId", "trueLabel", "falseLabel",
            "hotspotImageUrl", "fillBlankTemplate", options, "correctOptionIds",
            "matchingPairs", "shuffledRightPairs", "orderingItems", "tfStatements",
            "shuffledTfColumns", "hotspotRegions", "fillBlankItems",
            "createdAt", "updatedAt"
          ) VALUES (
            q_id,
            exam_rec.id,
            idx,
            COALESCE(q_item->>'type', 'single_choice'),
            COALESCE(q_item->>'title', 'Câu hỏi'),
            COALESCE(q_item->>'mediaType', 'none'),
            q_item->>'mediaUrl',
            q_item->>'explanation',
            q_item->>'correctOptionId',
            COALESCE(q_item->>'trueLabel', 'Đúng'),
            COALESCE(q_item->>'falseLabel', 'Sai'),
            q_item->>'hotspotImageUrl',
            q_item->>'fillBlankTemplate',
            q_item->'options',
            q_item->'correctOptionIds',
            q_item->'matchingPairs',
            q_item->'shuffledRightPairs',
            q_item->'orderingItems',
            q_item->'tfStatements',
            q_item->'shuffledTfColumns',
            q_item->'hotspotRegions',
            q_item->'fillBlankItems',
            NOW(),
            NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            "examId" = EXCLUDED."examId",
            "orderIndex" = EXCLUDED."orderIndex",
            type = EXCLUDED.type,
            title = EXCLUDED.title,
            "mediaType" = EXCLUDED."mediaType",
            "mediaUrl" = EXCLUDED."mediaUrl",
            explanation = EXCLUDED.explanation,
            "correctOptionId" = EXCLUDED."correctOptionId",
            "updatedAt" = NOW();

          -- 2. Tách các phương án trắc nghiệm sang question_options
          IF q_item->'options' IS NOT NULL AND jsonb_typeof(q_item->'options') = 'array' THEN
            sub_idx := 0;
            FOR opt_item IN SELECT * FROM jsonb_array_elements(q_item->'options') LOOP
              is_corr := FALSE;
              IF q_item->>'correctOptionId' = opt_item->>'id' THEN
                is_corr := TRUE;
              ELSIF q_item->'correctOptionIds' IS NOT NULL AND (q_item->'correctOptionIds' @> jsonb_build_array(opt_item->>'id')) THEN
                is_corr := TRUE;
              END IF;

              INSERT INTO public.question_options (id, "questionId", "examId", "orderIndex", text, "imageUrl", "isCorrect")
              VALUES (
                COALESCE(opt_item->>'id', 'opt_' || q_id || '_' || sub_idx),
                q_id,
                exam_rec.id,
                sub_idx,
                COALESCE(opt_item->>'text', ''),
                opt_item->>'imageUrl',
                is_corr
              )
              ON CONFLICT (id) DO UPDATE SET
                text = EXCLUDED.text,
                "imageUrl" = EXCLUDED."imageUrl",
                "isCorrect" = EXCLUDED."isCorrect";
              sub_idx := sub_idx + 1;
            END LOOP;
          END IF;

          -- 3. Tách các cặp ghép nối sang question_matching_pairs
          IF q_item->'matchingPairs' IS NOT NULL AND jsonb_typeof(q_item->'matchingPairs') = 'array' THEN
            sub_idx := 0;
            FOR pair_item IN SELECT * FROM jsonb_array_elements(q_item->'matchingPairs') LOOP
              INSERT INTO public.question_matching_pairs (id, "questionId", "examId", "orderIndex", "leftText", "leftImageUrl", "rightText", "rightImageUrl")
              VALUES (
                COALESCE(pair_item->>'id', 'pair_' || q_id || '_' || sub_idx),
                q_id,
                exam_rec.id,
                sub_idx,
                COALESCE(pair_item->>'leftText', ''),
                pair_item->>'leftImageUrl',
                COALESCE(pair_item->>'rightText', ''),
                pair_item->>'rightImageUrl'
              )
              ON CONFLICT (id) DO UPDATE SET
                "leftText" = EXCLUDED."leftText",
                "rightText" = EXCLUDED."rightText";
              sub_idx := sub_idx + 1;
            END LOOP;
          END IF;

          -- 4. Tách các mục sắp xếp sang question_ordering_items
          IF q_item->'orderingItems' IS NOT NULL AND jsonb_typeof(q_item->'orderingItems') = 'array' THEN
            sub_idx := 0;
            FOR ord_item IN SELECT * FROM jsonb_array_elements(q_item->'orderingItems') LOOP
              INSERT INTO public.question_ordering_items (id, "questionId", "examId", "orderIndex", text, "imageUrl")
              VALUES (
                COALESCE(ord_item->>'id', 'ord_' || q_id || '_' || sub_idx),
                q_id,
                exam_rec.id,
                sub_idx,
                COALESCE(ord_item->>'text', ''),
                ord_item->>'imageUrl'
              )
              ON CONFLICT (id) DO UPDATE SET
                text = EXCLUDED.text;
              sub_idx := sub_idx + 1;
            END LOOP;
          END IF;

          -- 5. Tách các mệnh đề đúng/sai sang question_tf_statements
          IF q_item->'tfStatements' IS NOT NULL AND jsonb_typeof(q_item->'tfStatements') = 'array' THEN
            sub_idx := 0;
            FOR tf_item IN SELECT * FROM jsonb_array_elements(q_item->'tfStatements') LOOP
              INSERT INTO public.question_tf_statements (id, "questionId", "examId", "orderIndex", statement, "isTrue")
              VALUES (
                COALESCE(tf_item->>'id', 'tf_' || q_id || '_' || sub_idx),
                q_id,
                exam_rec.id,
                sub_idx,
                COALESCE(tf_item->>'statement', ''),
                COALESCE((tf_item->>'isTrue')::boolean, TRUE)
              )
              ON CONFLICT (id) DO UPDATE SET
                statement = EXCLUDED.statement,
                "isTrue" = EXCLUDED."isTrue";
              sub_idx := sub_idx + 1;
            END LOOP;
          END IF;

          -- 6. Tách các vị trí điền khuyết sang question_fill_blank_items
          IF q_item->'fillBlankItems' IS NOT NULL AND jsonb_typeof(q_item->'fillBlankItems') = 'array' THEN
            sub_idx := 0;
            FOR fb_item IN SELECT * FROM jsonb_array_elements(q_item->'fillBlankItems') LOOP
              INSERT INTO public.question_fill_blank_items (id, "questionId", "examId", "orderIndex", "placeholderCode", options, "correctAnswer")
              VALUES (
                COALESCE(fb_item->>'id', 'fb_' || q_id || '_' || sub_idx),
                q_id,
                exam_rec.id,
                sub_idx,
                COALESCE(fb_item->>'placeholderCode', '[b' || (sub_idx + 1) || ']'),
                COALESCE(fb_item->'options', '[]'::jsonb),
                COALESCE(fb_item->>'correctAnswer', '')
              )
              ON CONFLICT (id) DO UPDATE SET
                "placeholderCode" = EXCLUDED."placeholderCode",
                options = EXCLUDED.options,
                "correctAnswer" = EXCLUDED."correctAnswer";
              sub_idx := sub_idx + 1;
            END LOOP;
          END IF;

          -- 7. Tách vùng hotspot sang question_hotspots
          IF q_item->'hotspotRegions' IS NOT NULL AND jsonb_typeof(q_item->'hotspotRegions') = 'array' THEN
            sub_idx := 0;
            FOR hs_item IN SELECT * FROM jsonb_array_elements(q_item->'hotspotRegions') LOOP
              INSERT INTO public.question_hotspots (id, "questionId", "examId", x, y, width, height, label)
              VALUES (
                COALESCE(hs_item->>'id', 'hs_' || q_id || '_' || sub_idx),
                q_id,
                exam_rec.id,
                COALESCE((hs_item->>'x')::numeric, 0),
                COALESCE((hs_item->>'y')::numeric, 0),
                COALESCE((hs_item->>'width')::numeric, 0),
                COALESCE((hs_item->>'height')::numeric, 0),
                hs_item->>'label'
              )
              ON CONFLICT (id) DO UPDATE SET
                x = EXCLUDED.x, y = EXCLUDED.y, width = EXCLUDED.width, height = EXCLUDED.height, label = EXCLUDED.label;
              sub_idx := sub_idx + 1;
            END LOOP;
          END IF;

          idx := idx + 1;
        END LOOP;

        -- Cập nhật tổng số câu hỏi vào bảng exams và dọn sạch cột questions cũ
        UPDATE public.exams SET "totalQuestions" = idx WHERE id = exam_rec.id;
      END IF;
    END LOOP;
  END IF;
END $$;

-- Tải lại Schema cache của PostgREST để Supabase nhận diện ngay lập tức các cột và bảng mới
NOTIFY pgrst, 'reload schema';

-- =========================================================================
-- BẬT ROW LEVEL SECURITY (RLS) VÀ CHÍNH SÁCH TRUY CẬP CHO TẤT CẢ CÁC BẢNG
-- =========================================================================
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_matching_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_ordering_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_tf_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_fill_blank_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_hotspots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

-- Chính sách RLS cho phép truy cập với Anon Key
DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on schools" ON public.schools FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on classes" ON public.classes FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on students" ON public.students FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on users" ON public.users FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on exams" ON public.exams FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on submissions" ON public.submissions FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on exam_questions" ON public.exam_questions FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on question_options" ON public.question_options FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on question_matching_pairs" ON public.question_matching_pairs FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on question_ordering_items" ON public.question_ordering_items FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on question_tf_statements" ON public.question_tf_statements FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on question_fill_blank_items" ON public.question_fill_blank_items FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on question_hotspots" ON public.question_hotspots FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Allow public all on question_bank" ON public.question_bank FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- BẬT REALTIME TRÊN SUPABASE CHO CÁC BẢNG
-- =========================================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.schools;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.classes;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.exams;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_questions;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_options;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_matching_pairs;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_ordering_items;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_tf_statements;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_fill_blank_items;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_hotspots;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.question_bank;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =========================================================================
-- TỰ ĐỘNG BẢO TOÀN DỮ LIỆU SANG BẢNG NGÂN HÀNG CÂU HỎI (question_bank)
-- =========================================================================
INSERT INTO public.question_bank (
  id, "sourceExamId", type, title, "mediaType", "mediaUrl", explanation,
  options, "correctOptionId", "correctOptionIds", "matchingPairs", "shuffledRightPairs",
  "orderingItems", "trueLabel", "falseLabel", "tfStatements", "shuffledTfColumns",
  "hotspotImageUrl", "hotspotRegions", "fillBlankTemplate", "fillBlankItems", "createdAt", "updatedAt"
)
SELECT 
  eq.id, eq."examId", eq.type, eq.title, eq."mediaType", eq."mediaUrl", eq.explanation,
  eq.options, eq."correctOptionId", eq."correctOptionIds", eq.matchingPairs, eq."shuffledRightPairs",
  eq."orderingItems", eq."trueLabel", eq."falseLabel", eq."tfStatements", eq."shuffledTfColumns",
  eq."hotspotImageUrl", eq."hotspotRegions", eq."fillBlankTemplate", eq."fillBlankItems", eq."createdAt", eq."updatedAt"
FROM public.exam_questions eq
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- TẠO TÀI KHOẢN QUẢN TRỊ VIÊN MẶC ĐỊNH (admin / 8653564@Thien)
-- =========================================================================
INSERT INTO public.users (id, "fullName", username, password, email, role, status)
VALUES (
  'usr_admin_01',
  'Quản Trị Viên Hệ Thống',
  'admin',
  '8653564@Thien',
  'thienln.ic3@gmail.com',
  'admin',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  password = '8653564@Thien',
  role = 'admin';

-- =========================================================================
-- TẠO SUPABASE STORAGE BUCKET: exam-images
-- =========================================================================
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'exam-images',
    'exam-images',
    true,
    10485760, -- Giới hạn 10MB mỗi file
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4']
  )
  ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4'];
EXCEPTION WHEN OTHERS THEN 
  -- Nếu bị hạn chế quyền trên schema storage, người dùng có thể tạo nhanh bằng nút 'New bucket' trên giao diện Storage
  NULL;
END $$;

-- Thiết lập chính sách bảo mật (RLS) cho Storage: Cho phép Đọc công khai
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public Read exam-images" ON storage.objects;
  CREATE POLICY "Public Read exam-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exam-images');

  DROP POLICY IF EXISTS "Public Insert exam-images" ON storage.objects;
  CREATE POLICY "Public Insert exam-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'exam-images');

  DROP POLICY IF EXISTS "Public Update exam-images" ON storage.objects;
  CREATE POLICY "Public Update exam-images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'exam-images');

  DROP POLICY IF EXISTS "Public Delete exam-images" ON storage.objects;
  CREATE POLICY "Public Delete exam-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'exam-images');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

