import React, { useState, useRef, useMemo } from 'react';
import { 
  Exam, 
  ExamQuestion, 
  QuestionType, 
  SchoolClass, 
  SingleChoiceOption, 
  MatchingPair, 
  OrderingItem, 
  TrueFalseStatement, 
  HotspotRegion, 
  FillBlankItem 
} from '../types/index.ts';
import { HotspotCanvas } from './HotspotCanvas.tsx';
import { 
  X, 
  Plus, 
  Trash2, 
  Check, 
  Upload, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Clock, 
  Award, 
  Sparkles, 
  Shuffle, 
  HelpCircle, 
  ArrowUp, 
  ArrowDown, 
  Copy, 
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Settings,
  ListChecks,
  Split,
  MoveVertical,
  CheckSquare,
  Crosshair,
  PenTool,
  Film,
  Zap,
  Loader2,
  Database,
  BookOpen,
  GraduationCap
} from 'lucide-react';
import { compressImageFile, optimizeExamQuestions, estimateExamPayloadSize } from '../utils/imageOptimizer.ts';
import { 
  uploadImageToSupabaseStorage, 
  uploadVideoToSupabaseStorage,
  uploadImageToGitHub,
  isGitHubConfigured 
} from '../services/storageService.ts';
import { isConfigured } from '../turso.ts';
import { QuestionBankModal } from './QuestionBankModal.tsx';
import { 
  extractGradeNumber, 
  getClassGradeNumber, 
  formatGradeLabel 
} from '../utils/studentHelper.ts';

export const DEFAULT_IC3_SUBJECTS = [
  'IC3 GS6 Spark Level 1',
  'IC3 GS6 Spark Level 2',
  'IC3 GS6 Spark Level 3',
  'IC3 GS6 Level 1',
  'IC3 GS6 Level 2',
  'IC3 GS6 Level 3',
] as const;

interface ExamEditorModalProps {
  initialExam?: Exam | null;
  assignedClasses: SchoolClass[];
  teacherId: string;
  teacherName: string;
  teacherSubjects?: string;
  onSave: (examData: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onClose: () => void;
}

export const ExamEditorModal: React.FC<ExamEditorModalProps> = ({
  initialExam,
  assignedClasses,
  teacherId,
  teacherName,
  teacherSubjects,
  onSave,
  onClose,
}) => {
  // General Exam Info
  const [title, setTitle] = useState(initialExam?.title || '');
  
  // Danh sách các môn học khác đã có (từ đề cũ hoặc môn giáo viên dạy)
  const otherKnownSubjects = useMemo(() => {
    const list: string[] = [];
    if (initialExam?.subject) {
      const trimmed = initialExam.subject.trim();
      if (!DEFAULT_IC3_SUBJECTS.includes(trimmed as any) && !list.includes(trimmed)) {
        list.push(trimmed);
      }
    }
    if (teacherSubjects) {
      const splitSubs = teacherSubjects.split(',').map((s) => s.trim()).filter(Boolean);
      splitSubs.forEach((s) => {
        if (!DEFAULT_IC3_SUBJECTS.includes(s as any) && !list.includes(s)) {
          list.push(s);
        }
      });
    }
    return list;
  }, [initialExam?.subject, teacherSubjects]);

  const [selectedSubjectOption, setSelectedSubjectOption] = useState<string>(() => {
    if (initialExam?.subject) {
      const trimmed = initialExam.subject.trim();
      if (DEFAULT_IC3_SUBJECTS.includes(trimmed as any)) {
        return trimmed;
      }
      return trimmed; // Nằm trong otherKnownSubjects
    }
    return DEFAULT_IC3_SUBJECTS[0]; // Mặc định 'IC3 GS6 Spark Level 1'
  });

  const [customSubjectText, setCustomSubjectText] = useState<string>('');

  const subject = useMemo(() => {
    if (selectedSubjectOption === '__custom__') {
      return customSubjectText.trim() || 'Môn học khác';
    }
    return selectedSubjectOption;
  }, [selectedSubjectOption, customSubjectText]);
  
  // Khối lớp được phép thấy đề thi khi học sinh đăng nhập (Requirement: Nguyễn Văn A Lớp 8.1 sẽ không thấy đề của khối 6 và 7)
  const [targetGrades, setTargetGrades] = useState<string[]>(() => {
    if (initialExam?.targetGrades && initialExam.targetGrades.length > 0) {
      return initialExam.targetGrades;
    }
    if (initialExam?.grade) {
      const clean = initialExam.grade.trim();
      if (clean.toLowerCase() === 'all' || clean.toLowerCase().includes('tất cả') || clean.toLowerCase().includes('tat ca')) {
        return ['all'];
      }
      const num = extractGradeNumber(clean);
      return num ? [`Khối ${num}`] : [clean];
    }
    if (assignedClasses.length > 0) {
      const firstNum = getClassGradeNumber(assignedClasses[0]);
      return firstNum ? [`Khối ${firstNum}`] : ['all'];
    }
    return ['all'];
  });

  const [durationMinutes, setDurationMinutes] = useState<number>(initialExam?.durationMinutes || 45);
  const [status, setStatus] = useState<'published' | 'hidden'>(initialExam?.status || 'published');
  const [allowReviewAnswers, setAllowReviewAnswers] = useState<boolean>(
    initialExam ? initialExam.allowReviewAnswers : true
  );
  const [classIds, setClassIds] = useState<string[]>(
    initialExam?.classIds || assignedClasses.map((c) => c.id)
  );
  const [isPracticeTest, setIsPracticeTest] = useState<boolean>(!!initialExam?.isPracticeTest);
  const [practiceRandomCount, setPracticeRandomCount] = useState<number>(
    initialExam?.practiceRandomCount || 10
  );

  // Toggle settings header collapsible
  const [showSettings, setShowSettings] = useState<boolean>(!initialExam);

  // Questions List
  const [questions, setQuestions] = useState<ExamQuestion[]>(
    initialExam?.questions && initialExam.questions.length > 0
      ? initialExam.questions
      : [
          {
            id: `q_${Date.now()}_1`,
            type: 'single_choice',
            title: 'Trong hệ thống máy tính, bộ nhớ nào sau đây mất dữ liệu khi ngắt nguồn điện?',
            mediaType: 'none',
            explanation: 'RAM (Random Access Memory) là bộ nhớ khả biến, dữ liệu sẽ bị xóa sạch khi mất nguồn điện.',
            options: [
              { id: 'opt_1', text: 'ROM (Read Only Memory)' },
              { id: 'opt_2', text: 'RAM (Random Access Memory)' },
              { id: 'opt_3', text: 'Ổ đĩa cứng HDD' },
              { id: 'opt_4', text: 'Ổ đĩa thể rắn SSD' },
            ],
            correctOptionId: 'opt_2',
          },
        ]
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [isUploadingToStorage, setIsUploadingToStorage] = useState(false);
  const [storageStatusMsg, setStorageStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);

  // Xử lý chọn câu hỏi từ Ngân hàng câu hỏi
  const handleSelectFromBank = (newQuestions: ExamQuestion[]) => {
    if (!newQuestions || newQuestions.length === 0) return;
    const currentCount = questions.length;
    const existingIds = new Set(questions.map((q) => q.id));
    const toAdd = newQuestions.filter((q) => !existingIds.has(q.id));
    if (toAdd.length === 0) return;
    setQuestions((prev) => [...prev, ...toAdd]);
    setTimeout(() => scrollToQuestion(currentCount), 150);
  };

  // Tính toán dung lượng dữ liệu đề thi theo thời gian thực
  const payloadStats = useMemo(() => {
    return estimateExamPayloadSize(questions);
  }, [questions]);

  // Scroll to question
  const scrollToQuestion = (idx: number) => {
    const el = document.getElementById(`question-card-${idx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Helper tải hình ảnh: Tối ưu WebP và tải trực tiếp lên GitHub Storage
  const handleFileUpload = async (
    file: File,
    onLoaded: (url: string) => void,
    folder: 'questions' | 'options' | 'hotspots' | 'matching' | 'ordering' = 'questions'
  ) => {
    setIsCompressingImage(true);
    setStorageStatusMsg('Đang nén ảnh WebP...');
    try {
      // 1. Tối ưu ảnh sang chuẩn WebP sắc nét (< 80KB)
      const compressed = await compressImageFile(file, 1280, 1280, 0.82);

      // 2. Nếu có kết nối GitHub, tải trực tiếp lên GitHub Storage (lưu Raw URL)
      if (isGitHubConfigured()) {
        setIsUploadingToStorage(true);
        setStorageStatusMsg('Đang tải ảnh lên GitHub Repository...');
        try {
          const publicUrl = await uploadImageToGitHub(compressed, folder);
          if (publicUrl && (publicUrl.startsWith('http://') || publicUrl.startsWith('https://'))) {
            onLoaded(publicUrl);
            setStorageStatusMsg('✓ Đã lưu ảnh vào GitHub (Raw URL)!');
            setTimeout(() => setStorageStatusMsg(null), 3500);
            return;
          }
        } catch (storageErr) {
          console.warn('[GitHub Storage] Lỗi tải lên, chuyển sang Base64 dự phòng:', storageErr);
        } finally {
          setIsUploadingToStorage(false);
        }
      }

      // 3. Fallback: Nếu offline hoặc chưa kết nối GitHub
      onLoaded(compressed);
      setStorageStatusMsg(null);
    } catch {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          onLoaded(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
      setStorageStatusMsg(null);
    } finally {
      setIsCompressingImage(false);
    }
  };

  // Helper video upload: tải trực tiếp lên GitHub Storage
  const handleVideoUpload = async (file: File, onLoaded: (url: string) => void) => {
    if (file.size > 25 * 1024 * 1024) {
      alert('Khuyến nghị: Với video trên 25MB, hãy sử dụng đường dẫn URL YouTube hoặc đám mây để học sinh tải nhanh nhất!');
    }
    if (isGitHubConfigured() && file.size <= 25 * 1024 * 1024) {
      setIsUploadingToStorage(true);
      setStorageStatusMsg('Đang tải video lên GitHub Storage...');
      try {
        const publicUrl = await uploadVideoToSupabaseStorage(file);
        if (publicUrl) {
          onLoaded(publicUrl);
          setStorageStatusMsg('✓ Đã tải video lên GitHub Storage!');
          setTimeout(() => setStorageStatusMsg(null), 3500);
          return;
        }
      } catch (err) {
        console.warn('Lỗi upload video lên Storage:', err);
      } finally {
        setIsUploadingToStorage(false);
      }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        onLoaded(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Update specific question
  const updateQuestion = (index: number, fields: Partial<ExamQuestion>) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...fields };
      return updated;
    });
  };

  // Add new question
  const handleAddQuestion = (type: QuestionType) => {
    const newId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let newQ: ExamQuestion = {
      id: newId,
      type,
      title: '',
      mediaType: 'none',
      explanation: '',
    };

    switch (type) {
      case 'single_choice':
        newQ.title = 'Câu hỏi trắc nghiệm chọn 1 đáp án đúng:';
        newQ.options = [
          { id: 'opt_1', text: 'Phương án A' },
          { id: 'opt_2', text: 'Phương án B' },
          { id: 'opt_3', text: 'Phương án C' },
          { id: 'opt_4', text: 'Phương án D' },
        ];
        newQ.correctOptionId = 'opt_1';
        break;

      case 'multiple_choice':
        newQ.title = 'Câu hỏi trắc nghiệm chọn nhiều đáp án đúng (chọn tất cả các phương án đúng):';
        newQ.options = [
          { id: 'opt_1', text: 'Phương án đúng 1' },
          { id: 'opt_2', text: 'Phương án đúng 2' },
          { id: 'opt_3', text: 'Phương án sai 1' },
          { id: 'opt_4', text: 'Phương án sai 2' },
        ];
        newQ.correctOptionIds = ['opt_1', 'opt_2'];
        break;

      case 'matching':
        newQ.title = 'Hãy ghép nối các mục tương ứng ở cột bên trái với cột bên phải:';
        newQ.matchingPairs = [
          { id: 'pair_1', leftText: 'Khái niệm A', rightText: 'Định nghĩa tương ứng A' },
          { id: 'pair_2', leftText: 'Khái niệm B', rightText: 'Định nghĩa tương ứng B' },
          { id: 'pair_3', leftText: 'Khái niệm C', rightText: 'Định nghĩa tương ứng C' },
        ];
        break;

      case 'ordering':
        newQ.title = 'Hãy sắp xếp các bước sau theo đúng quy trình chuẩn:';
        newQ.orderingItems = [
          { id: 'ord_1', text: 'Bước 1: Khảo sát và phân tích yêu cầu' },
          { id: 'ord_2', text: 'Bước 2: Thiết kế hệ thống' },
          { id: 'ord_3', text: 'Bước 3: Lập trình phát triển' },
          { id: 'ord_4', text: 'Bước 4: Kiểm thử và đóng gói' },
        ];
        break;

      case 'true_false':
        newQ.title = 'Hãy đánh giá tính Đúng / Sai của các nhận định dưới đây:';
        newQ.trueLabel = 'Đúng';
        newQ.falseLabel = 'Sai';
        newQ.tfStatements = [
          { id: 'tf_1', statement: 'Nhận định số 1 về hệ thống máy tính', isTrue: true },
          { id: 'tf_2', statement: 'Nhận định số 2 về mạng máy tính', isTrue: false },
          { id: 'tf_3', statement: 'Nhận định số 3 về an toàn thông tin', isTrue: true },
        ];
        break;

      case 'hotspot':
        newQ.title = 'Quan sát hình ảnh và dùng chuột nhấp chọn vị trí chính xác trên hình:';
        newQ.hotspotImageUrl = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80';
        newQ.hotspotRegions = [
          { id: 'zone_1', x: 30, y: 25, width: 35, height: 40, label: 'Vùng đáp án đúng #1' },
        ];
        break;

      case 'fill_blank':
        newQ.title = 'Chọn đáp án thích hợp từ danh sách thả xuống để điền vào các chỗ trống [b1], [b2]:';
        newQ.fillBlankTemplate = 'Trong giao thức TCP/IP, cổng 80 được sử dụng cho giao thức [b1], còn cổng 443 dùng cho giao thức [b2].';
        newQ.fillBlankItems = [
          {
            id: 'fb_1',
            placeholderCode: '[b1]',
            options: ['HTTP', 'FTP', 'SSH'],
            correctAnswer: 'HTTP',
          },
          {
            id: 'fb_2',
            placeholderCode: '[b2]',
            options: ['HTTPS', 'SMTP', 'DNS'],
            correctAnswer: 'HTTPS',
          },
        ];
        break;
    }

    const nextIdx = questions.length;
    setQuestions((prev) => [...prev, newQ]);
    setTimeout(() => scrollToQuestion(nextIdx), 100);
  };

  const handleDeleteQuestion = (index: number) => {
    if (questions.length <= 1) {
      alert('Đề thi phải có ít nhất 1 câu hỏi!');
      return;
    }
    const updated = questions.filter((_, i) => i !== index);
    setQuestions(updated);
  };

  const handleDuplicateQuestion = (index: number) => {
    const target = questions[index];
    const clone: ExamQuestion = {
      ...JSON.parse(JSON.stringify(target)),
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: `${target.title} (Bản sao)`,
    };
    const updated = [...questions.slice(0, index + 1), clone, ...questions.slice(index + 1)];
    setQuestions(updated);
    setTimeout(() => scrollToQuestion(index + 1), 100);
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === questions.length - 1)) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...questions];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setQuestions(updated);
    setTimeout(() => scrollToQuestion(targetIndex), 50);
  };

  const handleToggleClass = (id: string) => {
    if (classIds.includes(id)) {
      setClassIds(classIds.filter((c) => c !== id));
    } else {
      setClassIds([...classIds, id]);
    }
  };

  // Chọn hoặc bỏ chọn khối lớp được phép thấy đề thi
  const handleToggleTargetGrade = (gradeItem: string) => {
    if (gradeItem === 'all') {
      setTargetGrades(['all']);
      return;
    }

    let next = targetGrades.filter((g) => g !== 'all');
    if (next.includes(gradeItem)) {
      next = next.filter((g) => g !== gradeItem);
      if (next.length === 0) {
        next = ['all'];
      }
    } else {
      next = [...next, gradeItem];
    }
    setTargetGrades(next);
  };

  // Tự động phân công các lớp học có khối trùng khớp với khối đã chọn
  const handleAutoSelectClassesForSelectedGrades = () => {
    if (targetGrades.includes('all')) {
      setClassIds(assignedClasses.map((c) => c.id));
      return;
    }
    const targetGradeNums = new Set<string>();
    targetGrades.forEach((g) => {
      const num = extractGradeNumber(g);
      if (num) targetGradeNums.add(num);
    });
    const matched = assignedClasses
      .filter((c) => {
        const cNum = getClassGradeNumber(c);
        return cNum && targetGradeNums.has(cNum);
      })
      .map((c) => c.id);

    setClassIds(matched);
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!title.trim()) {
      setErrorMsg('Vui lòng nhập tên đề thi!');
      setShowSettings(true);
      return;
    }
    if (selectedSubjectOption === '__custom__' && !customSubjectText.trim()) {
      setErrorMsg('Vui lòng nhập tên môn học khác cho đề thi!');
      setShowSettings(true);
      return;
    }
    if (assignedClasses.length > 0 && classIds.length === 0) {
      setErrorMsg('Vui lòng phân công ít nhất một lớp học được thi!');
      setShowSettings(true);
      return;
    }
    if (questions.length === 0) {
      setErrorMsg('Đề thi phải có ít nhất 1 câu hỏi!');
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.title.trim()) {
        setErrorMsg(`Câu hỏi số ${i + 1} chưa có nội dung!`);
        scrollToQuestion(i);
        return;
      }
      if (q.type === 'single_choice' && !q.correctOptionId) {
        setErrorMsg(`Câu hỏi số ${i + 1} (Chọn 1 đáp án) chưa được chọn đáp án đúng!`);
        scrollToQuestion(i);
        return;
      }
      if (q.type === 'multiple_choice' && (!q.correctOptionIds || q.correctOptionIds.length === 0)) {
        setErrorMsg(`Câu hỏi số ${i + 1} (Chọn nhiều đáp án) cần chọn ít nhất 1 đáp án đúng!`);
        scrollToQuestion(i);
        return;
      }
      if (q.type === 'hotspot' && (!q.hotspotRegions || q.hotspotRegions.length === 0)) {
        setErrorMsg(`Câu hỏi số ${i + 1} (Hotspot) cần ít nhất một vùng chữ nhật đáp án đúng trên ảnh!`);
        scrollToQuestion(i);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // 1. Tự động quét & nén siêu tốc toàn bộ ảnh câu hỏi bằng Canvas để payload nhẹ nhất (~100 KB thay vì 30 MB)
      let optimizedQuestions = await optimizeExamQuestions(questions);

      // 1b. Tự động tải toàn bộ ảnh câu hỏi lên GitHub Repository và chuyển đổi sang Raw URL
      if (isConfigured) {
        setStorageStatusMsg('Đang lưu ảnh câu hỏi lên GitHub...');
        try {
          const { processQuestionsImagesForStorage } = await import('../services/storageService.ts');
          const storageRes = await processQuestionsImagesForStorage(optimizedQuestions);
          optimizedQuestions = storageRes.questions;
        } catch (storageErr) {
          console.warn('[GitHub Storage] Lỗi xử lý ảnh câu hỏi khi lưu đề:', storageErr);
        }
      }

      const finalGradeDisplay = targetGrades.includes('all')
        ? 'Tất cả các khối'
        : targetGrades.join(', ');

      await onSave({
        title: title.trim(),
        subject: subject.trim() || 'IC3 GS6 Spark Level 1',
        grade: finalGradeDisplay,
        targetGrades: targetGrades,
        creatorId: teacherId,
        creatorName: teacherName,
        classIds,
        durationMinutes: Number(durationMinutes) || 45,
        totalScore: 1000,
        passingScore: 950,
        status,
        allowReviewAnswers,
        isPracticeTest,
        practiceRandomCount: isPracticeTest ? (Number(practiceRandomCount) || 10) : 0,
        questions: optimizedQuestions,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra khi lưu đề thi!');
    } finally {
      setIsSubmitting(false);
    }
  };

  const questionTypeLabels: Record<QuestionType, { name: string; icon: any; color: string }> = {
    single_choice: { name: 'Chọn 1 đáp án', icon: ListChecks, color: 'text-blue-700 bg-blue-50 border-blue-200' },
    multiple_choice: { name: 'Chọn nhiều đáp án', icon: CheckSquare, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
    matching: { name: 'Ghép đôi (Cặp thẻ)', icon: Split, color: 'text-amber-700 bg-amber-50 border-amber-200' },
    ordering: { name: 'Sắp xếp thứ tự', icon: MoveVertical, color: 'text-teal-700 bg-teal-50 border-teal-200' },
    true_false: { name: 'Đúng / Sai', icon: Check, color: 'text-rose-700 bg-rose-50 border-rose-200' },
    hotspot: { name: 'Hotspot trên hình ảnh', icon: Crosshair, color: 'text-purple-700 bg-purple-50 border-purple-200' },
    fill_blank: { name: 'Điền vào chỗ trống', icon: PenTool, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 animate-in fade-in overflow-hidden">
      
      {/* ================= STICKY TOP APP BAR ================= */}
      <header className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shadow-lg z-30 shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">
                {initialExam ? 'Chỉnh Sửa Đề Thi Chuẩn Hóa' : 'Soạn Thảo Đề Thi Mới'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Thang 1000đ • Đạt ≥ 950đ
              </span>
              <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {questions.length} câu hỏi
              </span>
              <span 
                className="hidden xl:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30"
                title="Lưu tách bạch các bảng CSDL Turso: exams, exam_questions, question_options..."
              >
                <Database className="w-3 h-3 text-purple-400" />
                <span>CSDL Đa Bảng</span>
              </span>
              <span 
                className="hidden 2xl:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                title="Toàn bộ hình ảnh câu hỏi được lưu trữ dạng file trên GitHub Repository thay vì lưu Base64 vào CSDL"
              >
                <ImageIcon className="w-3 h-3 text-emerald-400" />
                <span>GitHub Storage</span>
              </span>
              <span 
                className={`hidden lg:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border transition-colors ${
                  payloadStats.isHeavy 
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse' 
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                }`}
                title="Dung lượng dữ liệu đề thi được nén tự động để lưu siêu tốc (< 0.5s) lên Turso"
              >
                <Zap className="w-3 h-3 text-cyan-400" />
                <span>{payloadStats.formattedSize}</span>
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {title || 'Chưa đặt tên đề thi'} • {durationMinutes} phút • {subject}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {(isCompressingImage || isUploadingToStorage || storageStatusMsg) && (
            <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold ${
              storageStatusMsg?.startsWith('✓')
                ? 'bg-emerald-950/60 border border-emerald-700 text-emerald-300'
                : 'bg-violet-950/60 border border-violet-700 text-violet-300 animate-pulse'
            }`}>
              {(isCompressingImage || isUploadingToStorage) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{storageStatusMsg || 'Đang xử lý ảnh...'}</span>
            </span>
          )}

          {/* Button chọn câu hỏi từ Ngân hàng câu hỏi */}
          <button
            type="button"
            onClick={() => setIsBankModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
            title="Mở Ngân hàng câu hỏi để chọn câu hỏi có sẵn"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chọn Từ Ngân Hàng</span>
            <span className="sm:hidden">Ngân Hàng</span>
          </button>

          {/* Toggle Exam Settings Card */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              showSettings 
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md' 
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Cấu Hình Đề Thi</span>
            {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Quick Save Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || isCompressingImage}
            className="px-4 sm:px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50 active:scale-95"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{isSubmitting ? 'Đang lưu đa bảng...' : 'Lưu Đề Thi'}</span>
          </button>

          {/* Close Modal Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ERROR ALERT NOTIFICATION */}
      {errorMsg && (
        <div className="px-6 py-2.5 bg-red-600 text-white text-xs font-bold flex items-center justify-between shadow-md shrink-0 animate-in slide-in-from-top">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-700 rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ================= MAIN SCROLLABLE WORKSPACE ================= */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* CENTER / MAIN STREAM: ALL QUESTIONS FLOW TOP-TO-BOTTOM */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* ================= COLLAPSIBLE GENERAL SETTINGS ================= */}
            {showSettings && (
              <div className="p-6 bg-white rounded-3xl shadow-md border border-slate-200/80 space-y-5 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-indigo-600" />
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      Cấu Hình & Cài Đặt Chung Cho Đề Thi
                    </h2>
                  </div>
                  <span className="text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full font-bold">
                    Tổng điểm: 1000đ • Điểm chuẩn đạt: 950đ
                  </span>
                </div>

                {/* Tiêu đề đề thi */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Tên Đề Thi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ví dụ: Đề Kiểm Tra Chuẩn Hóa Kiến Trúc Máy Tính & Lập Trình Cơ Bản"
                    className="w-full px-4 py-2.5 rounded-2xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 focus:bg-white transition-all"
                  />
                </div>

                {/* Môn học, Thời gian làm bài */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Môn Học</span>
                      </span>
                      {selectedSubjectOption === '__custom__' && (
                        <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                          Môn học tự nhập
                        </span>
                      )}
                    </label>
                    <select
                      value={selectedSubjectOption}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedSubjectOption(val);
                        if (val !== '__custom__') {
                          setCustomSubjectText('');
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                    >
                      <optgroup label="Danh mục chuẩn IC3 GS6">
                        {DEFAULT_IC3_SUBJECTS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </optgroup>
                      {otherKnownSubjects.length > 0 && (
                        <optgroup label="Môn học khác đã có">
                          {otherKnownSubjects.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Tùy chỉnh môn học">
                        <option value="__custom__">➕ Thêm môn học khác (Tự nhập môn giáo viên dạy)...</option>
                      </optgroup>
                    </select>

                    {/* Trường nhập môn học tự do khi chọn 'Thêm môn học khác' */}
                    {selectedSubjectOption === '__custom__' && (
                      <div className="mt-2 animate-in fade-in slide-in-from-top-1">
                        <input
                          type="text"
                          value={customSubjectText}
                          onChange={(e) => setCustomSubjectText(e.target.value)}
                          placeholder="Nhập tên môn học (Ví dụ: Tin học lớp 8, Lập trình Python, Công nghệ...)"
                          className="w-full px-3.5 py-2 rounded-xl border border-indigo-300 bg-indigo-50/50 text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                          autoFocus
                          required
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          Đề thi sẽ được tạo với môn học do bạn vừa nhập.
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Thời Gian Làm Bài (Phút)</span>
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold font-mono text-indigo-700"
                    />
                  </div>
                </div>

                {/* KHỐI LỚP ĐƯỢC PHÉP THẤY ĐỀ THI (Requirement: Giáo viên chọn khối lớp được thấy đề thi khi học sinh đăng nhập) */}
                <div className="p-4.5 bg-gradient-to-br from-indigo-50/90 via-blue-50/60 to-slate-50 border border-indigo-200 rounded-3xl space-y-3.5 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-indigo-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                            Khối Lớp Được Phép Thấy Đề Thi
                          </label>
                          <span className="text-red-500 font-bold">*</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Phân quyền khảo thí
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Học sinh thuộc khối nào chỉ thấy đề thi của khối đó. Ví dụ: Nguyễn Văn A Lớp 8.1 sẽ chỉ thấy đề <strong>Khối 8</strong>, hoàn toàn <strong>không thấy</strong> đề của Khối 6 và 7.
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500">Đang áp dụng:</span>
                      <span className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-xs">
                        {targetGrades.includes('all') ? '⭐ Tất cả các khối' : targetGrades.join(', ')}
                      </span>
                    </div>
                  </div>

                  {/* Buttons chọn khối */}
                  <div className="space-y-2.5">
                    {/* Nút Chọn Tất cả khối */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleToggleTargetGrade('all')}
                        className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          targetGrades.includes('all')
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>⭐ Tất cả các khối (Mở chung toàn trường)</span>
                      </button>

                      <span className="text-xs text-slate-400 font-medium">hoặc chọn khối cụ thể:</span>
                    </div>

                    {/* Nhóm Khối THCS */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider min-w-[75px] shrink-0">
                        Khối THCS:
                      </span>
                      {['Khối 6', 'Khối 7', 'Khối 8', 'Khối 9'].map((g) => {
                        const isSelected = !targetGrades.includes('all') && targetGrades.includes(g);
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => handleToggleTargetGrade(g)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-300'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                          >
                            <Check className={`w-3.5 h-3.5 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                            <span>{g}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Nhóm Khối THPT */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider min-w-[75px] shrink-0">
                        Khối THPT:
                      </span>
                      {['Khối 10', 'Khối 11', 'Khối 12'].map((g) => {
                        const isSelected = !targetGrades.includes('all') && targetGrades.includes(g);
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => handleToggleTargetGrade(g)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-300'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-indigo-50 hover:text-indigo-700'
                            }`}
                          >
                            <Check className={`w-3.5 h-3.5 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                            <span>{g}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Nhóm Khối Tiểu Học */}
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider min-w-[75px] shrink-0">
                        Tiểu học:
                      </span>
                      {['Khối 1', 'Khối 2', 'Khối 3', 'Khối 4', 'Khối 5'].map((g) => {
                        const isSelected = !targetGrades.includes('all') && targetGrades.includes(g);
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => handleToggleTargetGrade(g)}
                            className={`px-2.5 py-1 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                              isSelected
                                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-purple-50'
                            }`}
                          >
                            <span>{g}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Button tự động đồng bộ lớp theo khối đã chọn */}
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-indigo-100/90 text-xs">
                      <span className="text-slate-500">
                        ⚡ Tiết kiệm thời gian: Tự động đánh dấu các lớp thuộc khối đã chọn vào danh sách lớp thi bên dưới:
                      </span>
                      <button
                        type="button"
                        onClick={handleAutoSelectClassesForSelectedGrades}
                        className="text-xs font-bold text-indigo-700 hover:text-indigo-900 underline flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Tự động chọn lớp theo khối ({targetGrades.includes('all') ? 'Tất cả' : targetGrades.join(', ')})</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Trạng thái, Xem lại đáp án */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Trạng Thái Hiển Thị
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                    >
                      <option value="published">🟢 Hiện đề thi (Học sinh có thể thi)</option>
                      <option value="hidden">🔒 Ẩn đề thi (Tạm thời khóa)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Xem Lại Đáp Án
                    </label>
                    <select
                      value={allowReviewAnswers ? 'yes' : 'no'}
                      onChange={(e) => setAllowReviewAnswers(e.target.value === 'yes')}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                    >
                      <option value="yes">✓ Cho phép học sinh xem lại đáp án sau khi nộp</option>
                      <option value="no">✕ Không cho xem lại đáp án chi tiết</option>
                    </select>
                  </div>
                </div>

                {/* Phân công lớp thi */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Phân Công Cho Các Lớp Học: <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {assignedClasses.map((cls) => {
                      const isChecked = classIds.includes(cls.id);
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => handleToggleClass(cls.id)}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            isChecked
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Check className={`w-3.5 h-3.5 ${isChecked ? 'opacity-100' : 'opacity-0'}`} />
                          <span>{cls.name} ({cls.grade})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Đề thi thử ngẫu nhiên */}
                <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shuffle className="w-4 h-4 text-amber-700" />
                      <span className="text-xs font-bold text-amber-950">
                        Chế Độ Đề Thi Thử Ngẫu Nhiên:
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPracticeTest}
                        onChange={(e) => setIsPracticeTest(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                  </div>

                  {isPracticeTest && (
                    <div className="mt-3 pt-3 border-t border-amber-200 flex items-center gap-3 animate-in fade-in">
                      <span className="text-xs text-amber-900 font-semibold">
                        Số câu ngẫu nhiên trích xuất mỗi lần thi:
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={questions.length || 100}
                        value={practiceRandomCount}
                        onChange={(e) => setPracticeRandomCount(Number(e.target.value))}
                        className="w-20 px-2.5 py-1 rounded-xl border border-amber-300 bg-white text-xs font-bold font-mono text-center"
                      />
                      <span className="text-[11px] text-amber-800">
                        (trong tổng số {questions.length} câu đã tạo)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ================= BANNER: NGÂN HÀNG CÂU HỎI CÓ SẴN ================= */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-purple-950 flex items-center gap-2">
                    <span>Chọn Câu Hỏi Có Sẵn Từ Ngân Hàng</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-200/80 text-purple-900 border border-purple-300">
                      Bảo toàn vĩnh viễn
                    </span>
                  </h4>
                  <p className="text-xs text-purple-800/80 mt-0.5">
                    Tái sử dụng các câu hỏi đã tạo trong hệ thống. Câu hỏi trong ngân hàng vẫn được lưu lại an toàn ngay cả khi bạn xóa đề thi.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsBankModalOpen(true)}
                className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <Database className="w-4 h-4" />
                <span>Mở Ngân Hàng Câu Hỏi</span>
              </button>
            </div>

            {/* ================= QUESTIONS STREAM (TRẢI ĐỀU TỪ TRÊN XUỐNG DƯỚI) ================= */}
            <div className="space-y-6">
              {questions.map((question, qIdx) => {
                const typeConfig = questionTypeLabels[question.type];
                const TypeIcon = typeConfig.icon;
                const pointsPerQ = (1000 / questions.length).toFixed(1);

                return (
                  <div
                    key={question.id}
                    id={`question-card-${qIdx}`}
                    className="p-6 bg-white rounded-3xl shadow-md border border-slate-200/90 space-y-5 transition-all hover:shadow-lg scroll-mt-20"
                  >
                    {/* CARD TOP HEADER: NUMBER + TYPE + ACTIONS */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="px-3.5 py-1.5 rounded-2xl bg-indigo-600 text-white font-bold text-xs font-mono shadow-xs">
                          CÂU {qIdx + 1}
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs font-mono">
                          {pointsPerQ} điểm
                        </span>

                        {/* Question Type Switcher */}
                        <div className="relative">
                          <select
                            value={question.type}
                            onChange={(e) => updateQuestion(qIdx, { type: e.target.value as QuestionType })}
                            className={`px-3 py-1.5 rounded-xl border font-bold text-xs cursor-pointer bg-white ${typeConfig.color}`}
                          >
                            <option value="single_choice">1. Chọn 1 đáp án</option>
                            <option value="multiple_choice">2. Chọn nhiều đáp án</option>
                            <option value="matching">3. Ghép đôi (Cặp thẻ)</option>
                            <option value="ordering">4. Sắp xếp thứ tự</option>
                            <option value="true_false">5. Đúng / Sai</option>
                            <option value="hotspot">6. Hotspot trên hình ảnh</option>
                            <option value="fill_blank">7. Điền vào chỗ trống</option>
                          </select>
                        </div>
                      </div>

                      {/* Card Actions: Move up/down, Duplicate, Delete */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(qIdx, 'up')}
                          disabled={qIdx === 0}
                          className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 disabled:opacity-30 cursor-pointer"
                          title="Di chuyển lên trên"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(qIdx, 'down')}
                          disabled={qIdx === questions.length - 1}
                          className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 disabled:opacity-30 cursor-pointer"
                          title="Di chuyển xuống dưới"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateQuestion(qIdx)}
                          className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                          title="Nhân bản câu hỏi này"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Nhân bản</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(qIdx)}
                          className="p-1.5 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs cursor-pointer transition-colors"
                          title="Xóa câu hỏi này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* SECTION 1: NỘI DUNG CÂU HỎI (TEXT) */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-800">
                        Nội Dung Câu Hỏi (Văn Bản Đề Bài) <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={question.title}
                        onChange={(e) => updateQuestion(qIdx, { title: e.target.value })}
                        placeholder="Nhập nội dung câu hỏi tại đây..."
                        className="w-full p-4 rounded-2xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 focus:bg-white transition-all leading-relaxed"
                      />
                    </div>

                    {/* SECTION 2: KẾT HỢP TEXT VÀ ẢNH / TEXT VÀ VIDEO */}
                    <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Film className="w-4 h-4 text-indigo-600" />
                          <span>Đính Kèm Tài Liệu Minh Họa Cho Câu Hỏi:</span>
                        </span>
                        
                        {/* Media Type Tabs */}
                        <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => updateQuestion(qIdx, { mediaType: 'none', mediaUrl: '' })}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              question.mediaType === 'none' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Chỉ Text (Không đính kèm)
                          </button>
                          <button
                            type="button"
                            onClick={() => updateQuestion(qIdx, { mediaType: 'image' })}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              question.mediaType === 'image' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>Hình Ảnh</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateQuestion(qIdx, { mediaType: 'video' })}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              question.mediaType === 'video' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <VideoIcon className="w-3.5 h-3.5" />
                            <span>Video</span>
                          </button>
                        </div>
                      </div>

                      {/* Case A: Hình ảnh kèm theo */}
                      {question.mediaType === 'image' && (
                        <div className="space-y-3 pt-2 border-t border-slate-200 animate-in fade-in">
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="px-3.5 py-2 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors">
                              <Upload className="w-3.5 h-3.5" />
                              <span>Tải Ảnh Từ Máy Tính</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleFileUpload(file, (url) => updateQuestion(qIdx, { mediaUrl: url }), 'questions');
                                  }
                                }}
                              />
                            </label>
                            <span className="text-xs text-slate-400 font-medium">hoặc dán liên kết URL:</span>
                            <input
                              type="text"
                              placeholder="https://images.unsplash.com/..."
                              value={question.mediaUrl || ''}
                              onChange={(e) => updateQuestion(qIdx, { mediaUrl: e.target.value })}
                              className="flex-1 min-w-[240px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                            />
                            {question.mediaUrl && (
                              <button
                                type="button"
                                onClick={() => updateQuestion(qIdx, { mediaUrl: '' })}
                                className="text-xs text-red-600 hover:text-red-800 font-semibold cursor-pointer"
                              >
                                Xóa ảnh
                              </button>
                            )}
                          </div>

                          {question.mediaUrl && (
                            <div className="p-3 bg-white rounded-2xl border border-slate-200 inline-block shadow-sm">
                              <div className="text-[11px] font-bold text-slate-500 mb-1.5">Ảnh xem trước kết hợp với nội dung đề bài:</div>
                              <img
                                src={question.mediaUrl}
                                alt="Ảnh minh họa câu hỏi"
                                className="max-h-60 rounded-xl object-contain border border-slate-100"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Case B: Video kèm theo (Tải từ máy tính hoặc YouTube/URL) */}
                      {question.mediaType === 'video' && (
                        <div className="space-y-3 pt-2 border-t border-slate-200 animate-in fade-in">
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="px-3.5 py-2 rounded-xl bg-violet-50 border border-violet-200 hover:bg-violet-100 text-violet-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs">
                              <Upload className="w-3.5 h-3.5" />
                              <span>Tải Video Lên Từ Máy Tính</span>
                              <input
                                type="file"
                                accept="video/mp4,video/webm,video/ogg,video/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleVideoUpload(file, (url) => updateQuestion(qIdx, { mediaUrl: url }));
                                  }
                                }}
                              />
                            </label>
                            <span className="text-xs text-slate-400 font-medium">hoặc dán URL Video (YouTube, MP4...):</span>
                            <input
                              type="text"
                              placeholder="https://www.youtube.com/watch?v=... hoặc https://...mp4"
                              value={question.mediaUrl || ''}
                              onChange={(e) => updateQuestion(qIdx, { mediaUrl: e.target.value })}
                              className="flex-1 min-w-[240px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                            />
                            {question.mediaUrl && (
                              <button
                                type="button"
                                onClick={() => updateQuestion(qIdx, { mediaUrl: '' })}
                                className="text-xs text-red-600 hover:text-red-800 font-semibold cursor-pointer"
                              >
                                Xóa video
                              </button>
                            )}
                          </div>

                          {question.mediaUrl && (
                            <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 max-w-xl shadow-md">
                              <div className="text-[11px] font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                                <VideoIcon className="w-3.5 h-3.5 text-violet-400" />
                                <span>Trình phát video kết hợp câu hỏi:</span>
                              </div>
                              {question.mediaUrl.includes('youtube.com') || question.mediaUrl.includes('youtu.be') ? (
                                <iframe
                                  src={question.mediaUrl.replace('watch?v=', 'embed/')}
                                  title="Video câu hỏi"
                                  className="w-full aspect-video rounded-xl"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              ) : (
                                <video
                                  src={question.mediaUrl}
                                  controls
                                  className="w-full rounded-xl max-h-64 bg-black"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* SECTION 3: NỘI DUNG ĐÁP ÁN CHO 7 DẠNG CÂU HỎI */}
                    <div className="space-y-3 pt-2">
                      
                      {/* ================= DẠNG 1: CHỌN 1 ĐÁP ÁN ================= */}
                      {question.type === 'single_choice' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-800">
                              Danh Sách Phương Án Trả Lời (Chọn 1 đáp án đúng):
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const opts = question.options || [];
                                const newOpt: SingleChoiceOption = {
                                  id: `opt_${Date.now()}_${opts.length + 1}`,
                                  text: `Phương án ${String.fromCharCode(65 + opts.length)}`,
                                };
                                updateQuestion(qIdx, { options: [...opts, newOpt] });
                              }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Thêm phương án</span>
                            </button>
                          </div>

                          <div className="space-y-2.5">
                            {(question.options || []).map((opt, oIdx) => {
                              const isCorrect = question.correctOptionId === opt.id;
                              const charLabel = String.fromCharCode(65 + oIdx);

                              return (
                                <div
                                  key={opt.id}
                                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center gap-3 ${
                                    isCorrect
                                      ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400'
                                      : 'bg-white border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {/* Radio button chọn đáp án đúng */}
                                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                                    <input
                                      type="radio"
                                      name={`correct_${question.id}`}
                                      checked={isCorrect}
                                      onChange={() => updateQuestion(qIdx, { correctOptionId: opt.id })}
                                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span
                                      className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center ${
                                        isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      {charLabel}
                                    </span>
                                    {isCorrect && (
                                      <span className="text-xs font-bold text-emerald-700 sm:hidden">
                                        (Đáp án đúng)
                                      </span>
                                    )}
                                  </label>

                                  {/* Text phương án */}
                                  <input
                                    type="text"
                                    value={opt.text}
                                    onChange={(e) => {
                                      const updatedOpts = [...(question.options || [])];
                                      updatedOpts[oIdx].text = e.target.value;
                                      updateQuestion(qIdx, { options: updatedOpts });
                                    }}
                                    placeholder={`Nội dung phương án ${charLabel}...`}
                                    className="flex-1 px-3.5 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                                  />

                                  {/* Upload ảnh bổ trợ cho phương án */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <label
                                      className="px-2.5 py-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border border-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                                      title="Thêm hình ảnh cho phương án này"
                                    >
                                      <ImageIcon className="w-3.5 h-3.5" />
                                      <span>{opt.imageUrl ? 'Đổi ảnh' : 'Thêm ảnh'}</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            handleFileUpload(file, (url) => {
                                              const updatedOpts = [...(question.options || [])];
                                              updatedOpts[oIdx].imageUrl = url;
                                              updateQuestion(qIdx, { options: updatedOpts });
                                            }, 'options');
                                          }
                                        }}
                                      />
                                    </label>

                                    {opt.imageUrl && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updatedOpts = [...(question.options || [])];
                                          delete updatedOpts[oIdx].imageUrl;
                                          updateQuestion(qIdx, { options: updatedOpts });
                                        }}
                                        className="text-xs text-red-500 hover:text-red-700"
                                      >
                                        Xóa ảnh
                                      </button>
                                    )}

                                    {(question.options || []).length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updatedOpts = (question.options || []).filter((_, i) => i !== oIdx);
                                          updateQuestion(qIdx, {
                                            options: updatedOpts,
                                            correctOptionId: isCorrect ? updatedOpts[0]?.id : question.correctOptionId,
                                          });
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                                        title="Xóa phương án"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>

                                  {/* Hiển thị ảnh phương án nếu có */}
                                  {opt.imageUrl && (
                                    <img
                                      src={opt.imageUrl}
                                      alt="Ảnh đáp án"
                                      className="h-10 w-14 rounded-lg object-cover border border-slate-200 ml-2"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ================= DẠNG 2: CHỌN NHIỀU ĐÁP ÁN ================= */}
                      {question.type === 'multiple_choice' && (
                        <div className="space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <label className="text-xs font-bold text-slate-800">
                                Danh Sách Phương Án Trả Lời (Chọn nhiều đáp án đúng):
                              </label>
                              <p className="text-[11px] text-indigo-700 font-semibold">
                                💡 Đã chọn {question.correctOptionIds?.length || 0} đáp án đúng. Số lượng đáp án học sinh chọn khi thi sẽ bằng đúng số đáp án này.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const opts = question.options || [];
                                const newOpt: SingleChoiceOption = {
                                  id: `opt_${Date.now()}_${opts.length + 1}`,
                                  text: `Phương án ${String.fromCharCode(65 + opts.length)}`,
                                };
                                updateQuestion(qIdx, { options: [...opts, newOpt] });
                              }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Thêm phương án</span>
                            </button>
                          </div>

                          <div className="space-y-2.5">
                            {(question.options || []).map((opt, oIdx) => {
                              const correctIds = question.correctOptionIds || [];
                              const isCorrect = correctIds.includes(opt.id);
                              const charLabel = String.fromCharCode(65 + oIdx);

                              return (
                                <div
                                  key={opt.id}
                                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center gap-3 ${
                                    isCorrect
                                      ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400'
                                      : 'bg-white border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {/* Checkbox chọn đáp án đúng */}
                                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                                    <input
                                      type="checkbox"
                                      checked={isCorrect}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          updateQuestion(qIdx, { correctOptionIds: [...correctIds, opt.id] });
                                        } else {
                                          updateQuestion(qIdx, { correctOptionIds: correctIds.filter((id) => id !== opt.id) });
                                        }
                                      }}
                                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                                    />
                                    <span
                                      className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center ${
                                        isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      {charLabel}
                                    </span>
                                  </label>

                                  {/* Text phương án */}
                                  <input
                                    type="text"
                                    value={opt.text}
                                    onChange={(e) => {
                                      const updatedOpts = [...(question.options || [])];
                                      updatedOpts[oIdx].text = e.target.value;
                                      updateQuestion(qIdx, { options: updatedOpts });
                                    }}
                                    placeholder={`Nội dung phương án ${charLabel}...`}
                                    className="flex-1 px-3.5 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                                  />

                                  {/* Ảnh phương án */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <label
                                      className="px-2.5 py-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border border-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                                      title="Thêm hình ảnh cho phương án này"
                                    >
                                      <ImageIcon className="w-3.5 h-3.5" />
                                      <span>{opt.imageUrl ? 'Đổi ảnh' : 'Thêm ảnh'}</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            handleFileUpload(file, (url) => {
                                              const updatedOpts = [...(question.options || [])];
                                              updatedOpts[oIdx].imageUrl = url;
                                              updateQuestion(qIdx, { options: updatedOpts });
                                            }, 'options');
                                          }
                                        }}
                                      />
                                    </label>

                                    {opt.imageUrl && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updatedOpts = [...(question.options || [])];
                                          delete updatedOpts[oIdx].imageUrl;
                                          updateQuestion(qIdx, { options: updatedOpts });
                                        }}
                                        className="text-xs text-red-500 hover:text-red-700"
                                      >
                                        Xóa ảnh
                                      </button>
                                    )}

                                    {(question.options || []).length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updatedOpts = (question.options || []).filter((_, i) => i !== oIdx);
                                          updateQuestion(qIdx, {
                                            options: updatedOpts,
                                            correctOptionIds: correctIds.filter((id) => id !== opt.id),
                                          });
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                                        title="Xóa phương án"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>

                                  {opt.imageUrl && (
                                    <img
                                      src={opt.imageUrl}
                                      alt="Ảnh đáp án"
                                      className="h-10 w-14 rounded-lg object-cover border border-slate-200 ml-2"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ================= DẠNG 3: GHÉP ĐÔI (MATCHING) - HỖ TRỢ ẢNH CỘT TRÁI ================= */}
                      {question.type === 'matching' && (
                        <div className="space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <label className="text-xs font-bold text-slate-800">
                                Cấu Hình Các Cặp Thẻ Ghép Đôi:
                              </label>
                              <p className="text-[11px] text-amber-700 font-semibold">
                                💡 Cột bên trái có thể bao gồm cả Text và Hình ảnh minh họa tải lên từ máy tính!
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const pairs = question.matchingPairs || [];
                                const newPair: MatchingPair = {
                                  id: `pair_${Date.now()}_${pairs.length + 1}`,
                                  leftText: `Mục ${pairs.length + 1}`,
                                  rightText: `Định nghĩa ${pairs.length + 1}`,
                                };
                                updateQuestion(qIdx, { matchingPairs: [...pairs, newPair] });
                              }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Thêm cặp ghép đôi</span>
                            </button>
                          </div>

                          <div className="space-y-3">
                            {(question.matchingPairs || []).map((pair, pIdx) => (
                              <div
                                key={pair.id}
                                className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/90 grid grid-cols-1 md:grid-cols-2 gap-4 items-start relative group shadow-xs"
                              >
                                {/* CỘT TRÁI (A) - HỖ TRỢ CẢ VĂN BẢN VÀ HÌNH ẢNH */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                                      <span className="w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px] font-bold">
                                        {pIdx + 1}
                                      </span>
                                      <span>Cột Bên Trái (Thẻ Khái Niệm / Hình Ảnh):</span>
                                    </span>

                                    {/* Upload ảnh cho cột trái */}
                                    <label className="px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 flex items-center gap-1 cursor-pointer transition-colors">
                                      <ImageIcon className="w-3.5 h-3.5" />
                                      <span>{pair.leftImageUrl ? 'Đổi ảnh trái' : 'Thêm ảnh trái'}</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            handleFileUpload(file, (url) => {
                                              const updated = [...(question.matchingPairs || [])];
                                              updated[pIdx].leftImageUrl = url;
                                              updateQuestion(qIdx, { matchingPairs: updated });
                                            }, 'matching');
                                          }
                                        }}
                                      />
                                    </label>
                                  </div>

                                  {/* Text cột trái */}
                                  <input
                                    type="text"
                                    value={pair.leftText}
                                    onChange={(e) => {
                                      const updated = [...(question.matchingPairs || [])];
                                      updated[pIdx].leftText = e.target.value;
                                      updateQuestion(qIdx, { matchingPairs: updated });
                                    }}
                                    placeholder="Nội dung chữ vế trái (ví dụ: CPU, DNS...)..."
                                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                                  />

                                  {/* Preview ảnh cột trái nếu có */}
                                  {pair.leftImageUrl && (
                                    <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-indigo-100">
                                      <img
                                        src={pair.leftImageUrl}
                                        alt={`Ảnh thẻ ${pIdx + 1}`}
                                        className="h-16 w-24 object-cover rounded-lg border border-slate-200"
                                      />
                                      <div className="flex-1 text-[11px] text-slate-500">
                                        <p className="font-semibold text-slate-700">Đã đính kèm ảnh cho thẻ trái</p>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...(question.matchingPairs || [])];
                                            delete updated[pIdx].leftImageUrl;
                                            updateQuestion(qIdx, { matchingPairs: updated });
                                          }}
                                          className="text-red-500 hover:text-red-700 font-bold mt-1 cursor-pointer"
                                        >
                                          Xóa ảnh này
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* CỘT PHẢI (B) - ĐỊNH NGHĨA / KHỚP TƯƠNG ỨNG */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-indigo-700">
                                      Khớp Với Vế Phải Tương Ứng:
                                    </span>
                                    {(question.matchingPairs || []).length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = (question.matchingPairs || []).filter((_, i) => i !== pIdx);
                                          updateQuestion(qIdx, { matchingPairs: updated });
                                        }}
                                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                                        title="Xóa cặp ghép này"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>

                                  <input
                                    type="text"
                                    value={pair.rightText}
                                    onChange={(e) => {
                                      const updated = [...(question.matchingPairs || [])];
                                      updated[pIdx].rightText = e.target.value;
                                      updateQuestion(qIdx, { matchingPairs: updated });
                                    }}
                                    placeholder="Nội dung định nghĩa / giải nghĩa vế phải..."
                                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ================= DẠNG 4: SẮP XẾP THỨ TỰ (ORDERING) ================= */}
                      {question.type === 'ordering' && (
                        <div className="space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <label className="text-xs font-bold text-slate-800">
                                Thứ Tự Đúng Chuẩn Của Quy Trình:
                              </label>
                              <p className="text-[11px] text-slate-500">
                                Giáo viên nhập theo trình tự 1, 2, 3... Hệ thống sẽ tự xáo trộn khi học sinh thi để kéo thả sắp xếp lại.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const items = question.orderingItems || [];
                                const newItem: OrderingItem = {
                                  id: `ord_${Date.now()}_${items.length + 1}`,
                                  text: `Bước ${items.length + 1}`,
                                };
                                updateQuestion(qIdx, { orderingItems: [...items, newItem] });
                              }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Thêm bước quy trình</span>
                            </button>
                          </div>

                          <div className="space-y-2">
                            {(question.orderingItems || []).map((item, idx) => (
                              <div
                                key={item.id}
                                className="p-3 bg-white rounded-2xl border border-slate-200 flex items-center gap-3 shadow-xs"
                              >
                                <span className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-xs font-mono shrink-0">
                                  {idx + 1}
                                </span>
                                <input
                                  type="text"
                                  value={item.text}
                                  onChange={(e) => {
                                    const updated = [...(question.orderingItems || [])];
                                    updated[idx].text = e.target.value;
                                    updateQuestion(qIdx, { orderingItems: updated });
                                  }}
                                  placeholder={`Nội dung bước ${idx + 1}...`}
                                  className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold"
                                />
                                {(question.orderingItems || []).length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (question.orderingItems || []).filter((_, i) => i !== idx);
                                      updateQuestion(qIdx, { orderingItems: updated });
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ================= DẠNG 5: ĐÚNG / SAI (TRUE / FALSE) ================= */}
                      {question.type === 'true_false' && (
                        <div className="space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl text-xs">
                            <div className="font-bold text-indigo-950">
                              Tùy Biến Tiêu Đề Hai Cột:
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-600 font-semibold">Cột 1:</span>
                                <input
                                  type="text"
                                  value={question.trueLabel || 'Đúng'}
                                  onChange={(e) => updateQuestion(qIdx, { trueLabel: e.target.value })}
                                  placeholder="Đúng / Có / Nên"
                                  className="w-24 px-2.5 py-1 rounded-xl border border-slate-300 bg-white font-bold text-xs"
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-600 font-semibold">Cột 2:</span>
                                <input
                                  type="text"
                                  value={question.falseLabel || 'Sai'}
                                  onChange={(e) => updateQuestion(qIdx, { falseLabel: e.target.value })}
                                  placeholder="Sai / Không / Không nên"
                                  className="w-24 px-2.5 py-1 rounded-xl border border-slate-300 bg-white font-bold text-xs"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-800">
                              Danh Sách Câu Khẳng Định & Đáp Án Chuẩn:
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const statements = question.tfStatements || [];
                                const newSt: TrueFalseStatement = {
                                  id: `tf_${Date.now()}_${statements.length + 1}`,
                                  statement: `Nhận định số ${statements.length + 1}`,
                                  isTrue: true,
                                };
                                updateQuestion(qIdx, { tfStatements: [...statements, newSt] });
                              }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Thêm nhận định</span>
                            </button>
                          </div>

                          <div className="space-y-2.5">
                            {(question.tfStatements || []).map((st, idx) => (
                              <div
                                key={st.id}
                                className="p-3 bg-white rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs"
                              >
                                <input
                                  type="text"
                                  value={st.statement}
                                  onChange={(e) => {
                                    const updated = [...(question.tfStatements || [])];
                                    updated[idx].statement = e.target.value;
                                    updateQuestion(qIdx, { tfStatements: updated });
                                  }}
                                  placeholder={`Nội dung nhận định ${idx + 1}...`}
                                  className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 font-semibold"
                                />

                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...(question.tfStatements || [])];
                                      updated[idx].isTrue = true;
                                      updateQuestion(qIdx, { tfStatements: updated });
                                    }}
                                    className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                                      st.isTrue
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    ✓ {question.trueLabel || 'Đúng'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...(question.tfStatements || [])];
                                      updated[idx].isTrue = false;
                                      updateQuestion(qIdx, { tfStatements: updated });
                                    }}
                                    className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                                      !st.isTrue
                                        ? 'bg-red-600 text-white shadow-xs'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    ✕ {question.falseLabel || 'Sai'}
                                  </button>

                                  {(question.tfStatements || []).length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (question.tfStatements || []).filter((_, i) => i !== idx);
                                        updateQuestion(qIdx, { tfStatements: updated });
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ================= DẠNG 6: CHỌN TRÊN HÌNH ẢNH (HOTSPOT) ================= */}
                      {question.type === 'hotspot' && (
                        <div className="space-y-4">
                          <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-3 text-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <span className="font-bold text-purple-950">
                                Hình Ảnh Khảo Thí Hotspot:
                              </span>
                              <div className="flex items-center gap-2">
                                <label className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs">
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>Tải Ảnh Từ Máy Tính</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        handleFileUpload(file, (url) => updateQuestion(qIdx, { hotspotImageUrl: url }), 'hotspots');
                                      }
                                    }}
                                  />
                                </label>
                                <input
                                  type="text"
                                  placeholder="Hoặc dán URL ảnh..."
                                  value={question.hotspotImageUrl || ''}
                                  onChange={(e) => updateQuestion(qIdx, { hotspotImageUrl: e.target.value })}
                                  className="px-3 py-1.5 rounded-xl border border-purple-300 bg-white text-xs w-48"
                                />
                              </div>
                            </div>
                            <p className="text-[11px] text-purple-800 leading-relaxed">
                              Nhấn giữ và kéo chuột trên ảnh bên dưới để vẽ các <strong>vùng đúng hình chữ nhật</strong>. Có thể vẽ nhiều vùng đúng. Khi học sinh thi, số điểm học sinh chọn đúng số điểm bằng số vùng vẽ này.
                            </p>
                          </div>

                          <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <HotspotCanvas
                              imageUrl={
                                question.hotspotImageUrl ||
                                'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80'
                              }
                              isEditor={true}
                              regions={question.hotspotRegions || []}
                              onRegionsChange={(regions) => updateQuestion(qIdx, { hotspotRegions: regions })}
                            />
                          </div>
                        </div>
                      )}

                      {/* ================= DẠNG 7: ĐIỀN VÀO CHỖ TRỐNG (FILL BLANK DROPDOWN) ================= */}
                      {question.type === 'fill_blank' && (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-800 mb-1">
                              Đoạn Văn Chứa Ký Hiệu Chỗ Trống (Ví dụ: [b1], [b2]):
                            </label>
                            <textarea
                              rows={3}
                              value={question.fillBlankTemplate || ''}
                              onChange={(e) => updateQuestion(qIdx, { fillBlankTemplate: e.target.value })}
                              placeholder="Ví dụ: Trong mô hình TCP/IP, cổng 80 được sử dụng cho giao thức [b1], còn cổng 443 dùng cho giao thức [b2]..."
                              className="w-full p-3 rounded-2xl border border-slate-300 text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
                            />
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-800">
                                Cấu Hình Các Lựa Chọn Dropdown Cho Từng Vị Trí:
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  const items = question.fillBlankItems || [];
                                  const code = `[b${items.length + 1}]`;
                                  const newItem: FillBlankItem = {
                                    id: `fb_${Date.now()}_${items.length + 1}`,
                                    placeholderCode: code,
                                    options: ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3'],
                                    correctAnswer: 'Lựa chọn 1',
                                  };
                                  updateQuestion(qIdx, { fillBlankItems: [...items, newItem] });
                                }}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Thêm vị trí chỗ trống</span>
                              </button>
                            </div>

                            <div className="space-y-3">
                              {(question.fillBlankItems || []).map((b, bIdx) => (
                                <div
                                  key={b.id}
                                  className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 text-xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        {b.placeholderCode}
                                      </span>
                                      <span className="font-semibold text-slate-700">
                                        Các phương án trong menu sổ xuống (cách nhau bởi dấu phẩy):
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (question.fillBlankItems || []).filter((_, i) => i !== bIdx);
                                        updateQuestion(qIdx, { fillBlankItems: updated });
                                      }}
                                      className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>

                                  <input
                                    type="text"
                                    value={b.options.join(', ')}
                                    onChange={(e) => {
                                      const opts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                                      const updated = [...(question.fillBlankItems || [])];
                                      updated[bIdx].options = opts;
                                      if (!opts.includes(updated[bIdx].correctAnswer) && opts.length > 0) {
                                        updated[bIdx].correctAnswer = opts[0];
                                      }
                                      updateQuestion(qIdx, { fillBlankItems: updated });
                                    }}
                                    placeholder="Nhập các lựa chọn cách nhau bởi dấu phẩy: HTTP, FTP, HTTPS..."
                                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                                  />

                                  <div className="flex items-center gap-2 pt-1">
                                    <span className="font-bold text-emerald-700">Đáp Án Đúng Chuẩn:</span>
                                    <select
                                      value={b.correctAnswer}
                                      onChange={(e) => {
                                        const updated = [...(question.fillBlankItems || [])];
                                        updated[bIdx].correctAnswer = e.target.value;
                                        updateQuestion(qIdx, { fillBlankItems: updated });
                                      }}
                                      className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-emerald-900"
                                    >
                                      {b.options.map((opt, oIdx) => (
                                        <option key={oIdx} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* SECTION 4: LỜI GIẢI THÍCH CHI TIẾT */}
                    <div className="space-y-1.5 pt-4 border-t border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Lời Giải Thích Đáp Án (Học sinh sẽ xem được sau khi nộp bài):</span>
                      </label>
                      <textarea
                        rows={2}
                        value={question.explanation || ''}
                        onChange={(e) => updateQuestion(qIdx, { explanation: e.target.value })}
                        placeholder="Nhập giải thích vì sao đáp án này là đúng..."
                        className="w-full p-3 rounded-2xl border border-slate-300 text-xs text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500 bg-slate-50/60 focus:bg-white transition-all"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ================= BOTTOM BAR: THÊM NHANH 7 DẠNG CÂU HỎI ================= */}
            <div className="p-6 bg-white rounded-3xl shadow-md border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    + Thêm Câu Hỏi Vào Đề Thi (7 Dạng Chuẩn hoặc Từ Ngân Hàng):
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hệ thống tự động cộng dồn và cân đối tổng điểm luôn luôn đạt 1000 điểm chuẩn.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBankModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs hover:shadow-md flex items-center gap-1.5 cursor-pointer transition-all self-start sm:self-auto"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Chọn Từ Ngân Hàng Câu Hỏi</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleAddQuestion('single_choice')}
                  className="p-3 rounded-2xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-900 font-bold text-xs flex flex-col items-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-xs"
                >
                  <ListChecks className="w-5 h-5 text-blue-600" />
                  <span className="text-center">1. Chọn 1 Đáp Án</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddQuestion('multiple_choice')}
                  className="p-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 font-bold text-xs flex flex-col items-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-xs"
                >
                  <CheckSquare className="w-5 h-5 text-indigo-600" />
                  <span className="text-center">2. Nhiều Đáp Án</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddQuestion('matching')}
                  className="p-3 rounded-2xl border border-amber-200 bg-amber-50/80 hover:bg-amber-100 text-amber-900 font-bold text-xs flex flex-col items-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-xs"
                >
                  <Split className="w-5 h-5 text-amber-600" />
                  <span className="text-center">3. Ghép Đôi (Ảnh)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddQuestion('ordering')}
                  className="p-3 rounded-2xl border border-teal-200 bg-teal-50/80 hover:bg-teal-100 text-teal-900 font-bold text-xs flex flex-col items-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-xs"
                >
                  <MoveVertical className="w-5 h-5 text-teal-600" />
                  <span className="text-center">4. Sắp Xếp Thứ Tự</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddQuestion('true_false')}
                  className="p-3 rounded-2xl border border-rose-200 bg-rose-50/80 hover:bg-rose-100 text-rose-900 font-bold text-xs flex flex-col items-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-xs"
                >
                  <Check className="w-5 h-5 text-rose-600" />
                  <span className="text-center">5. Đúng / Sai</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddQuestion('hotspot')}
                  className="p-3 rounded-2xl border border-purple-200 bg-purple-50/80 hover:bg-purple-100 text-purple-900 font-bold text-xs flex flex-col items-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-xs"
                >
                  <Crosshair className="w-5 h-5 text-purple-600" />
                  <span className="text-center">6. Hotspot Ảnh</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddQuestion('fill_blank')}
                  className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 font-bold text-xs flex flex-col items-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-xs"
                >
                  <PenTool className="w-5 h-5 text-emerald-600" />
                  <span className="text-center">7. Điền Chỗ Trống</span>
                </button>
              </div>
            </div>

            {/* Bottom Final Action Buttons */}
            <div className="flex items-center justify-between pt-4 pb-12">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Hủy & Đóng
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-8 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <Check className="w-5 h-5" />
                <span>{isSubmitting ? 'Đang Lưu...' : 'Hoàn Tất & Lưu Đề Thi (1000đ)'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================= RIGHT PANEL: QUICK JUMP NAVIGATOR ================= */}
        <aside className="w-72 bg-white border-l border-slate-200 p-5 flex flex-col justify-between hidden lg:flex shrink-0">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Mục Lục Câu Hỏi
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700">
                  {questions.length} câu
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Nhấp vào số câu để cuộn nhanh đến câu hỏi tương ứng:
              </p>
            </div>

            {/* Question Buttons Grid */}
            <div className="grid grid-cols-4 gap-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              {questions.map((q, idx) => {
                const hasTitle = !!q.title.trim();
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => scrollToQuestion(idx)}
                    className={`h-11 rounded-2xl border text-xs font-mono font-bold flex flex-col items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                      hasTitle
                        ? 'bg-slate-50 border-slate-300 text-slate-800 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-700'
                        : 'bg-amber-50 border-amber-300 text-amber-800'
                    }`}
                    title={`Câu ${idx + 1}: ${questionTypeLabels[q.type].name}`}
                  >
                    <span>{idx + 1}</span>
                    <span className="text-[9px] text-slate-400 font-sans">
                      {q.type === 'single_choice' && '1ĐA'}
                      {q.type === 'multiple_choice' && 'NĐA'}
                      {q.type === 'matching' && 'G.Đôi'}
                      {q.type === 'ordering' && 'S.Xếp'}
                      {q.type === 'true_false' && 'Đ/S'}
                      {q.type === 'hotspot' && 'H.Spot'}
                      {q.type === 'fill_blank' && 'Điền'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Actions at bottom of aside */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsBankModalOpen(true)}
              className="w-full py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-purple-200"
            >
              <Database className="w-4 h-4" />
              <span>Ngân Hàng Câu Hỏi</span>
            </button>

            <button
              type="button"
              onClick={() => handleAddQuestion('single_choice')}
              className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm Câu Hỏi Mới</span>
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang Lưu...' : 'Lưu Đề Thi'}</span>
            </button>
          </div>
        </aside>
      </div>

      {/* MODAL CHỌN CÂU HỎI TỪ NGÂN HÀNG CÂU HỎI */}
      <QuestionBankModal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        onSelectQuestions={handleSelectFromBank}
        currentExamQuestionTitles={questions.map((q) => q.title)}
        defaultSubject={subject}
      />
    </div>
  );
};
