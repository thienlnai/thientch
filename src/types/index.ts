export type UserRole = 'admin' | 'teacher' | 'student';

export interface School {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  level: 'highschool' | 'secondary' | 'university' | 'other';
  createdAt: string;
  updatedAt: string;
}

export interface SchoolClass {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  grade: string;
  schoolYear: string;
  homeroomTeacher: string;
  room?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  schoolId: string;
  classId: string;
  studentCode: string; // Mã số học sinh / Số báo danh
  fullName: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
  username: string;
  password: string; // Mật khẩu cấp sẵn
  status: 'active' | 'suspended';
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserAccount {
  id: string;
  fullName: string;
  username: string;
  password: string;
  email: string;
  phone?: string;
  subjects?: string;
  schoolId?: string; // Trường được phân công công tác
  schoolIds?: string[]; // Danh sách các trường được phân công phụ trách giảng dạy
  classIds?: string[]; // Danh sách các lớp giảng dạy / phụ trách
  role: UserRole;
  status: 'active' | 'suspended';
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamSession {
  id: string;
  title: string;
  subject: string;
  grade: string;
  durationMinutes: number;
  totalQuestions: number;
  startTime: string;
  endTime: string;
  status: 'upcoming' | 'ongoing' | 'finished';
}

// 7 Dạng câu hỏi khảo thí chuyên sâu
export type QuestionType =
  | 'single_choice'    // a. Chọn 1 đáp án (Text hoặc Hình ảnh)
  | 'multiple_choice'  // b. Chọn nhiều đáp án (Số lượng chọn bằng số đáp án đúng)
  | 'matching'         // c. Ghép đôi (Text hoặc Hình ảnh)
  | 'ordering'         // d. Sắp xếp thứ tự (Nắm kéo thả chuột)
  | 'true_false'       // e. Đúng Sai (Tùy biến tên cột Có/Không, Nên/Không nên...)
  | 'hotspot'          // f. Chọn trên hình ảnh (Vẽ vùng đúng, học sinh chấm điểm)
  | 'fill_blank';      // g. Điền vào chỗ trống (Menu sổ xuống chọn đáp án)

export interface SingleChoiceOption {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface MatchingPair {
  id: string;
  leftText: string;
  leftImageUrl?: string;
  rightText: string;
  rightImageUrl?: string;
}

export interface OrderingItem {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface TrueFalseStatement {
  id: string;
  statement: string;
  isTrue: boolean; // true = cột 1 (Đúng/Có/Nên), false = cột 2 (Sai/Không/Không nên)
}

export interface HotspotRegion {
  id: string;
  x: number;      // % từ 0 đến 100
  y: number;      // % từ 0 đến 100
  width: number;  // % từ 0 đến 100
  height: number; // % từ 0 đến 100
  label?: string;
}

export interface HotspotStudentClick {
  x: number; // % từ 0 đến 100
  y: number; // % từ 0 đến 100
}

export interface FillBlankItem {
  id: string;
  placeholderCode: string; // [b1], [b2], ...
  options: string[];       // Danh sách các lựa chọn trong menu sổ xuống
  correctAnswer: string;   // Đáp án chính xác
}

export interface ExamQuestion {
  id: string;
  examId?: string;            // Khóa ngoại liên kết đề thi (khi tách thành bảng riêng)
  orderIndex?: number;        // Thứ tự câu hỏi trong đề thi (0, 1, 2, ...)
  type: QuestionType;
  title: string;              // Nội dung câu hỏi (text)
  mediaType: 'none' | 'image' | 'video'; // Làm rõ câu hỏi bằng text/ảnh/video
  mediaUrl?: string;          // URL hoặc Base64 ảnh/video
  explanation?: string;       // Lời giải thích đáp án
  
  // Dành cho Single Choice & Multiple Choice
  options?: SingleChoiceOption[];
  correctOptionId?: string;       // Cho single_choice
  correctOptionIds?: string[];    // Cho multiple_choice

  // Dành cho Matching
  matchingPairs?: MatchingPair[];
  shuffledRightPairs?: MatchingPair[]; // Cột B được xáo trộn ngẫu nhiên riêng biệt khi thi

  // Dành cho Ordering
  orderingItems?: OrderingItem[]; // Thứ tự chuẩn của đáp án

  // Dành cho True / False
  trueLabel?: string;  // Tùy biến: "Đúng", "Có", "Nên", "Đạt"...
  falseLabel?: string; // Tùy biến: "Sai", "Không", "Không Nên", "Không Đạt"...
  tfStatements?: TrueFalseStatement[];
  shuffledTfColumns?: ('true' | 'false')[]; // Thứ tự 2 cột lựa chọn (Đúng / Sai) khi thi

  // Dành cho Hotspot
  hotspotImageUrl?: string;
  hotspotRegions?: HotspotRegion[];

  // Dành cho Fill in the blanks with Dropdown
  fillBlankTemplate?: string; // Đoạn văn bản chứa các vị trí [b1], [b2]
  fillBlankItems?: FillBlankItem[];

  // Thuộc tính nguồn gốc & Ngân hàng câu hỏi (Question Bank)
  sourceExamId?: string;
  sourceExamTitle?: string;
  subject?: string;
  grade?: string;
  creatorId?: string;
  creatorName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type BankQuestion = ExamQuestion;

export interface Exam {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description?: string;
  subject: string;
  grade?: string;             // Tên hiển thị khối (ví dụ: 'Khối 8', 'Khối 6, Khối 7' hoặc 'Tất cả các khối')
  targetGrades?: string[];    // Danh sách khối lớp được phép thấy đề thi: ['Khối 8'], ['Khối 6', 'Khối 7'], hoặc ['all']
  classIds: string[];         // Các lớp được phép tham gia thi
  durationMinutes: number;    // Thời gian làm bài (phút)
  totalScore: number;         // Luôn là 1000 điểm
  passingScore: number;       // Luôn là 950 điểm
  status: 'published' | 'hidden'; // Cho phép giáo viên chọn ẩn hoặc hiện đề thi
  allowReviewAnswers: boolean;// Cho học sinh xem lại đáp án sau khi nộp bài
  isPracticeTest?: boolean;   // Đề thi thử với số lượng câu ngẫu nhiên
  practiceRandomCount?: number; // Số lượng câu ngẫu nhiên trích xuất (ví dụ 45 trong 100 câu)
  totalQuestions?: number;    // Số lượng câu hỏi của đề (khi tải bảng exams độc lập)
  questionIds?: string[];     // Danh sách ID các câu hỏi liên kết trong đề thi (cho phép tái sử dụng câu hỏi có sẵn)
  questions: ExamQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface ExamSubmission {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  classId: string;
  score: number;              // Điểm số thực tế (Thang 1000 điểm)
  maxScore: number;           // 1000 điểm
  isPassed: boolean;          // score >= 950
  submittedAt: string;        // ISO 8601 string
  dateKey: string;            // YYYY-MM-DD (Thống kê theo ngày)
  timeSpentSeconds: number;   // Số giây thực tế làm bài
  attemptNumber: number;      // Lần thi thứ mấy của đề này
  isPractice?: boolean;       // Có phải làm bài thi thử không
  isTeacherTesting?: boolean; // Giáo viên làm thử (không tính thời gian)
  studentAnswers: Record<string, any>; // Lưu câu trả lời của học sinh theo questionId
  questionResults: Record<string, {
    isCorrect: boolean;
    earnedScore: number;
    maxScore: number;
    details?: any;
  }>;
  questionsSnapshot?: ExamQuestion[]; // Tùy chọn (dùng cho bộ nhớ tạm thời), không lưu vào CSDL để tiết kiệm 95% dung lượng
  questionOrder?: string[];           // Danh sách ID câu hỏi theo thứ tự làm bài (~50 bytes thay vì ~15 KB)
  violationCount: number;     // Số lần vi phạm quy chế thi (chuột phải, F12, rời màn hình,...)
  violationLogs?: Array<{
    id: string;
    time: string;
    type: string;
    label: string;
  }>;                         // Lịch sử chi tiết các lần vi phạm quy chế
}

export type Language = 'vi' | 'en';

export const TRANSLATIONS = {
  vi: {
    brandName: 'THIENTECH',
    systemTitle: 'HỆ THỐNG KIỂM TRA TRỰC TUYẾN CÔNG NGHỆ THÔNG TIN',
    systemSubtitle: 'Nền tảng thi trắc nghiệm lập trình & khảo thí công nghệ thông tin an toàn, đồng bộ thời gian thực và chống gian lận đa tầng.',
    schoolPortal: 'Cổng Khảo Thí Công Nghệ Thông Tin Chuẩn Hóa',
    slogan: 'Code chuẩn xác - Bức phá tương lai',
    tagline: 'Hệ sinh thái kiểm tra kiến thức lập trình, thuật toán & công nghệ thông tin bảo mật cao.',
    loginHeader: 'ĐĂNG NHẬP HỆ THỐNG',
    loginSubtitle: 'Vui lòng nhập thông tin xác thực do giảng viên hoặc quản trị viên cấp',
    studentIdOrUsername: 'MÃ SỐ HỌC SINH / USERNAME',
    studentIdPlaceholder: 'Nhập mã số sinh viên/học sinh hoặc username...',
    password: 'MẬT KHẨU',
    passwordPlaceholder: 'Nhập mật khẩu xác thực...',
    rememberDevice: 'Ghi nhớ thiết bị',
    forgotPassword: 'Quên mật khẩu?',
    loginButton: 'ĐĂNG NHẬP NGAY',
    loggingIn: 'Đang xác thực thông tin...',
    noticeProvidedAccount: 'Tài khoản và mật khẩu đã được cấp bởi giáo viên quản nhiệm. Vui lòng liên hệ phòng Đào tạo hoặc giáo viên bộ môn nếu gặp sự cố đăng nhập.',
    forgotModalTitle: 'Hướng Dẫn Cấp Lại Mật Khẩu',
    forgotModalBody: 'Học sinh / sinh viên vui lòng liên hệ Giảng viên bộ môn hoặc Giáo viên chủ nhiệm để được hỗ trợ cấp lại mật khẩu.',
    forgotModalNote: 'Hệ thống bảo mật nghiêm ngặt và không hỗ trợ tự đăng ký hoặc đặt lại mật khẩu công khai nhằm ngăn ngừa gian lận thi cử.',
    close: 'Đã hiểu & Đóng',
    contactSupport: 'Hỗ trợ kỹ thuật phòng thi: Liên hệ Phòng Khảo Thí IT & Đào Tạo',
    quickDemo: '',
    adminRole: 'Quản trị viên',
    teacherRole: 'Giáo viên',
    studentRole: 'Học sinh',
    errorInvalidCredentials: 'Mã số học sinh/Tên đăng nhập hoặc Mật khẩu không chính xác. Vui lòng kiểm tra lại!',
    errorAccountSuspended: 'Tài khoản này hiện đang bị tạm khóa. Vui lòng liên hệ Giáo viên quản nhiệm!',
    errorEmptyFields: 'Vui lòng nhập đầy đủ Mã số học sinh / Username và Mật khẩu.',
    liveSyncConnected: 'Turso Database (SQLite): Đồng bộ thời gian thực',
  },
  en: {
    brandName: 'THIENTECH',
    systemTitle: 'INFORMATION TECHNOLOGY ONLINE EXAMINATION SYSTEM',
    systemSubtitle: 'Secure online IT examination platform with real-time sync, standardized question banks, and multi-layer proctoring.',
    schoolPortal: 'Standardized IT Testing Portal',
    slogan: 'Code chuẩn xác - Bức phá tương lai',
    tagline: 'Enterprise-grade high-security online examination with real-time proctoring and code evaluation.',
    loginHeader: 'SIGN IN TO SYSTEM',
    loginSubtitle: 'Please enter official credentials issued by your school or instructor',
    studentIdOrUsername: 'STUDENT ID / USERNAME',
    studentIdPlaceholder: 'Enter student ID or username...',
    password: 'PASSWORD',
    passwordPlaceholder: 'Enter your password...',
    rememberDevice: 'Remember this device',
    forgotPassword: 'Forgot password?',
    loginButton: 'SIGN IN NOW',
    loggingIn: 'Authenticating credentials...',
    noticeProvidedAccount: 'Accounts and passwords have been assigned by your homeroom/supervising teacher. Please contact the Academic Affairs Office or subject teacher if you encounter login issues.',
    forgotModalTitle: 'Password Recovery Guide',
    forgotModalBody: 'Please contact your instructor or supervisor for identity verification and credential reissuance.',
    forgotModalNote: 'Self-service registration and public resets are strictly disabled to uphold exam security protocols.',
    close: 'Understood & Close',
    contactSupport: 'IT Testing Support: Contact IT Examination & Academic Affairs Office',
    quickDemo: '',
    adminRole: 'Administrator',
    teacherRole: 'Teacher',
    studentRole: 'Student',
    errorInvalidCredentials: 'Invalid Student ID / Username or Password. Please verify and try again.',
    errorAccountSuspended: 'This account is currently suspended. Please contact your supervising teacher.',
    errorEmptyFields: 'Please enter both Student ID / Username and Password.',
    liveSyncConnected: 'Turso Database (SQLite): Real-time Live Sync',
  },
};
