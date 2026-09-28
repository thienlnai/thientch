/**
 * dbService.ts - Dịch vụ cơ sở dữ liệu Turso (SQLite Cloud / libSQL)
 * Thay thế hoàn toàn Supabase bằng Turso Database:
 * 1. Toàn bộ các thao tác CRUD và truy vấn chuyển sang chuẩn SQLite qua @libsql/client
 * 2. Lưu trữ hình ảnh trên GitHub Repository với đường dẫn Raw URL (https://raw.githubusercontent.com/...)
 * 3. Hỗ trợ đồng bộ dữ liệu thời gian thực và tự động tạo 15 bảng chuẩn SQLite
 * 4. Giữ nguyên 100% logic nghiệp vụ, giao diện và các tính năng khảo thí của hệ thống
 */

import {
  turso,
  tursoQuery,
  tursoExecute,
  tursoBatch,
  handleTursoError,
  OperationType,
  isConfigured,
  initTursoSchema,
} from '../turso.ts';
import {
  School,
  SchoolClass,
  Student,
  UserAccount,
  Exam,
  ExamSubmission,
  ExamQuestion,
} from '../types/index.ts';
import { processQuestionsImagesForStorage } from './storageService.ts';

// Initial admin password required specifically by the user: 8653564@Thien
export const INITIAL_ADMIN_PASSWORD = '8653564@Thien';

// Table names in Turso SQLite (Kiến trúc phân tách nhiều bảng chuẩn hóa)
export const SCHOOLS_TABLE = 'schools';
export const CLASSES_TABLE = 'classes';
export const STUDENTS_TABLE = 'students';
export const USERS_TABLE = 'users';
export const EXAMS_TABLE = 'exams';
export const EXAM_QUESTIONS_TABLE = 'exam_questions';
export const QUESTION_OPTIONS_TABLE = 'question_options';
export const QUESTION_MATCHING_PAIRS_TABLE = 'question_matching_pairs';
export const QUESTION_ORDERING_ITEMS_TABLE = 'question_ordering_items';
export const QUESTION_TF_STATEMENTS_TABLE = 'question_tf_statements';
export const QUESTION_FILL_BLANK_ITEMS_TABLE = 'question_fill_blank_items';
export const QUESTION_HOTSPOTS_TABLE = 'question_hotspots';
export const QUESTION_BANK_TABLE = 'question_bank';
export const SUBMISSIONS_TABLE = 'submissions';
export const AUDIT_LOGS_TABLE = 'audit_logs';

// Local storage backup keys for seamless offline/hybrid operation
const STORAGE_KEYS = {
  schools: 'thientch_turso_schools',
  classes: 'thientch_turso_classes',
  students: 'thientch_turso_students',
  users: 'thientch_turso_users',
  exams: 'thientch_turso_exams',
  submissions: 'thientch_turso_submissions',
  questionBank: 'thientch_turso_question_bank',
};

// In-memory caches to guarantee snappy UI reactivity
function getInitialData<T>(key: string, defaultValue: T[]): T[] {
  try {
    const item = localStorage.getItem(key);
    if (item) return JSON.parse(item);
    // Legacy fallback check
    const legacyKey = key.replace('thientch_turso_', 'thientch_supabase_');
    const legacyItem = localStorage.getItem(legacyKey);
    return legacyItem ? JSON.parse(legacyItem) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveLocalData<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn('[Cache] Could not persist to localStorage:', err);
  }
}

let localSchools: School[] = getInitialData(STORAGE_KEYS.schools, []);
let localClasses: SchoolClass[] = getInitialData(STORAGE_KEYS.classes, []);
let localStudents: Student[] = getInitialData(STORAGE_KEYS.students, []);
let localUsers: UserAccount[] = getInitialData(STORAGE_KEYS.users, []);
let localExams: Exam[] = getInitialData(STORAGE_KEYS.exams, []);
let localSubmissions: ExamSubmission[] = getInitialData(STORAGE_KEYS.submissions, []);
let localQuestionBank: ExamQuestion[] = getInitialData(STORAGE_KEYS.questionBank, []);

// Subscriber listeners
type Listener<T> = (data: T[]) => void;
const schoolListeners = new Set<Listener<School>>();
const classListeners = new Set<Listener<SchoolClass>>();
const studentListeners = new Set<Listener<Student>>();
const userListeners = new Set<Listener<UserAccount>>();
const examListeners = new Set<Listener<Exam>>();
const submissionListeners = new Set<Listener<ExamSubmission>>();
const questionBankListeners = new Set<Listener<ExamQuestion>>();

function notifySchools() {
  saveLocalData(STORAGE_KEYS.schools, localSchools);
  schoolListeners.forEach((fn) => fn([...localSchools]));
}
function notifyClasses() {
  saveLocalData(STORAGE_KEYS.classes, localClasses);
  classListeners.forEach((fn) => fn([...localClasses]));
}
function notifyStudents() {
  saveLocalData(STORAGE_KEYS.students, localStudents);
  studentListeners.forEach((fn) => fn([...localStudents]));
}
function notifyUsers() {
  saveLocalData(STORAGE_KEYS.users, localUsers);
  userListeners.forEach((fn) => fn([...localUsers]));
}
function notifyExams() {
  saveLocalData(STORAGE_KEYS.exams, localExams);
  examListeners.forEach((fn) => fn([...localExams]));
}
function notifySubmissions() {
  saveLocalData(STORAGE_KEYS.submissions, localSubmissions);
  submissionListeners.forEach((fn) => fn([...localSubmissions]));
}
function notifyQuestionBank() {
  saveLocalData(STORAGE_KEYS.questionBank, localQuestionBank);
  questionBankListeners.forEach((fn) => fn([...localQuestionBank]));
}

/**
 * Clean data object before database insertion
 */
export function cleanDbData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => cleanDbData(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        cleaned[key] = cleanDbData(val);
      }
    }
    return cleaned as T;
  }
  return obj;
}

export const cleanFirestoreData = cleanDbData;

/**
 * Xóa toàn bộ lịch sử hoạt động khỏi cơ sở dữ liệu
 */
export async function purgeExistingAuditLogsFromDatabase(): Promise<number> {
  try {
    if (isConfigured) {
      const res = await tursoExecute(`DELETE FROM ${AUDIT_LOGS_TABLE}`);
      return res.rowsAffected || 0;
    }
    return 0;
  } catch (error) {
    console.warn('Purge audit logs error:', error);
    return 0;
  }
}

// ================= NORMALIZERS & RESILIENT HELPERS =================

export function normalizeSchool(row: any): School {
  return {
    id: String(row.id || ''),
    code: String(row.code || ''),
    name: String(row.name || ''),
    address: String(row.address || ''),
    phone: String(row.phone || ''),
    email: String(row.email || ''),
    level: row.level || 'highschool',
    createdAt: row.createdAt || row.created_at || row.createdat || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || row.updatedat || new Date().toISOString(),
  };
}

export function normalizeClass(row: any): SchoolClass {
  return {
    id: String(row.id || ''),
    schoolId: String(row.schoolId || row.school_id || row.schoolid || ''),
    code: String(row.code || ''),
    name: String(row.name || ''),
    grade: String(row.grade || ''),
    schoolYear: String(row.schoolYear || row.school_year || row.schoolyear || ''),
    homeroomTeacher: String(row.homeroomTeacher || row.homeroom_teacher || row.homeroomteacher || ''),
    room: row.room ? String(row.room) : undefined,
    createdAt: row.createdAt || row.created_at || row.createdat || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || row.updatedat || new Date().toISOString(),
  };
}

export function normalizeStudent(row: any): Student {
  return {
    id: String(row.id || ''),
    schoolId: String(row.schoolId || row.school_id || row.schoolid || ''),
    classId: String(row.classId || row.class_id || row.classid || ''),
    studentCode: String(row.studentCode || row.student_code || row.studentcode || ''),
    fullName: String(row.fullName || row.full_name || row.fullname || ''),
    dateOfBirth: String(row.dateOfBirth || row.date_of_birth || row.dateofbirth || ''),
    gender: row.gender || 'other',
    username: String(row.username || ''),
    password: String(row.password || row.password_hash || row.passwordHash || ''),
    status: row.status === 'suspended' ? 'suspended' : 'active',
    note: row.note ? String(row.note) : undefined,
    createdAt: row.createdAt || row.created_at || row.createdat || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || row.updatedat || new Date().toISOString(),
  };
}

export function normalizeUser(row: any): UserAccount {
  let classIds = row.classIds || row.class_ids || row.classids || [];
  if (typeof classIds === 'string') {
    try {
      classIds = JSON.parse(classIds);
    } catch {
      classIds = [];
    }
  }
  const username = String(row.username || '');
  let fullName = String(row.fullName || row.full_name || row.fullname || '');
  if (!fullName.trim() && username) {
    if (username.toLowerCase() === 'admin') {
      fullName = 'Quản trị viên Hệ thống';
    } else if (username.toLowerCase() === 'thienln') {
      fullName = 'ThS. Lê Ngọc Thiện';
    } else {
      fullName = `Giáo viên @${username}`;
    }
  }

  return {
    id: String(row.id || ''),
    fullName,
    username,
    password: String(row.password || row.password_hash || row.passwordHash || ''),
    email: String(row.email || ''),
    phone: row.phone ? String(row.phone) : undefined,
    subjects: row.subjects ? String(row.subjects) : undefined,
    schoolId: row.schoolId || row.school_id || row.schoolid || undefined,
    schoolIds: Array.isArray(row.schoolIds)
      ? row.schoolIds
      : typeof row.schoolIds === 'string'
      ? (() => {
          try {
            return JSON.parse(row.schoolIds);
          } catch {
            return [];
          }
        })()
      : row.schoolId
      ? [row.schoolId]
      : [],
    classIds: Array.isArray(classIds) ? classIds : [],
    role: row.role === 'admin' ? 'admin' : 'teacher',
    status: row.status === 'suspended' ? 'suspended' : 'active',
    lastLogin: row.lastLogin || row.last_login || row.lastlogin || undefined,
    createdAt: row.createdAt || row.created_at || row.createdat || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || row.updatedat || new Date().toISOString(),
  };
}

export function toDbUserRow(u: any, isPartial = false): any {
  if (!u || typeof u !== 'object') return u;
  const row: any = {};
  if (u.id !== undefined) row.id = u.id;
  if (u.username !== undefined) row.username = u.username;
  if (u.fullName !== undefined || u.full_name !== undefined) {
    row.fullName = u.fullName ?? u.full_name ?? '';
  } else if (!isPartial) {
    row.fullName = '';
  }
  if (u.password !== undefined || u.password_hash !== undefined || u.passwordHash !== undefined) {
    row.password = u.password ?? u.password_hash ?? u.passwordHash ?? '';
  }
  if (u.email !== undefined) {
    row.email = u.email;
  } else if (!isPartial) {
    row.email = '';
  }
  if (u.phone !== undefined) row.phone = u.phone || null;
  if (u.subjects !== undefined) row.subjects = u.subjects || null;
  if (u.schoolId !== undefined || u.school_id !== undefined) {
    row.schoolId = (u.schoolId ?? u.school_id) || null;
  }
  if (u.schoolIds !== undefined) {
    const rawSchoolIds = u.schoolIds ?? [];
    row.schoolIds = typeof rawSchoolIds === 'string' ? rawSchoolIds : JSON.stringify(rawSchoolIds);
  }
  if (u.classIds !== undefined || u.class_ids !== undefined) {
    const rawClassIds = u.classIds ?? u.class_ids ?? [];
    row.classIds = typeof rawClassIds === 'string' ? rawClassIds : JSON.stringify(rawClassIds);
  }
  if (u.role !== undefined) {
    row.role = u.role;
  } else if (!isPartial) {
    row.role = 'teacher';
  }
  if (u.status !== undefined) {
    row.status = u.status;
  } else if (!isPartial) {
    row.status = 'active';
  }
  if (u.lastLogin !== undefined || u.last_login !== undefined) {
    row.lastLogin = u.lastLogin ?? u.last_login ?? null;
  }
  if (u.createdAt !== undefined || u.created_at !== undefined) {
    row.createdAt = u.createdAt ?? u.created_at;
  }
  if (u.updatedAt !== undefined || u.updated_at !== undefined) {
    row.updatedAt = u.updatedAt ?? u.updated_at;
  }
  return row;
}

export function toDbClassRow(c: any, _isPartial = false): any {
  if (!c || typeof c !== 'object') return c;
  const row: any = {};
  if (c.id !== undefined) row.id = c.id;
  if (c.schoolId !== undefined || c.school_id !== undefined) {
    row.schoolId = (c.schoolId ?? c.school_id) || null;
  }
  if (c.code !== undefined) row.code = c.code;
  if (c.name !== undefined) row.name = c.name;
  if (c.grade !== undefined) row.grade = c.grade;
  if (c.schoolYear !== undefined || c.school_year !== undefined) {
    row.schoolYear = (c.schoolYear ?? c.school_year) || '';
  }
  if (c.homeroomTeacher !== undefined || c.homeroom_teacher !== undefined) {
    row.homeroomTeacher = (c.homeroomTeacher ?? c.homeroom_teacher) || '';
  }
  if (c.room !== undefined) row.room = c.room || null;
  if (c.createdAt !== undefined || c.created_at !== undefined) {
    row.createdAt = c.createdAt ?? c.created_at;
  }
  if (c.updatedAt !== undefined || c.updated_at !== undefined) {
    row.updatedAt = c.updatedAt ?? c.updated_at;
  }
  return row;
}

export function toDbStudentRow(s: any, _isPartial = false): any {
  if (!s || typeof s !== 'object') return s;
  const row: any = {};
  if (s.id !== undefined) row.id = s.id;
  if (s.schoolId !== undefined || s.school_id !== undefined) row.schoolId = (s.schoolId ?? s.school_id) || null;
  if (s.classId !== undefined || s.class_id !== undefined) row.classId = (s.classId ?? s.class_id) || null;
  if (s.studentCode !== undefined || s.student_code !== undefined) row.studentCode = s.studentCode ?? s.student_code ?? '';
  if (s.fullName !== undefined || s.full_name !== undefined) row.fullName = s.fullName ?? s.full_name ?? '';
  if (s.dateOfBirth !== undefined || s.date_of_birth !== undefined) row.dateOfBirth = s.dateOfBirth ?? s.date_of_birth ?? '2008-01-01';
  if (s.gender !== undefined) row.gender = s.gender || 'other';
  if (s.username !== undefined) row.username = s.username;
  if (s.password !== undefined || s.password_hash !== undefined || s.passwordHash !== undefined) {
    row.password = s.password ?? s.password_hash ?? s.passwordHash ?? '123456';
  }
  if (s.status !== undefined) row.status = s.status || 'active';
  if (s.note !== undefined) row.note = s.note || null;
  if (s.createdAt !== undefined || s.created_at !== undefined) row.createdAt = s.createdAt ?? s.created_at;
  if (s.updatedAt !== undefined || s.updated_at !== undefined) row.updatedAt = s.updatedAt ?? s.updated_at;
  return row;
}

export function toDbSchoolRow(s: any, _isPartial = false): any {
  if (!s || typeof s !== 'object') return s;
  const row: any = {};
  if (s.id !== undefined) row.id = s.id;
  if (s.code !== undefined) row.code = s.code;
  if (s.name !== undefined) row.name = s.name;
  if (s.address !== undefined) row.address = s.address || '';
  if (s.phone !== undefined) row.phone = s.phone || '';
  if (s.email !== undefined) row.email = s.email || '';
  if (s.level !== undefined) row.level = s.level || 'highschool';
  if (s.createdAt !== undefined || s.created_at !== undefined) row.createdAt = s.createdAt ?? s.created_at;
  if (s.updatedAt !== undefined || s.updated_at !== undefined) row.updatedAt = s.updatedAt ?? s.updated_at;
  return row;
}

export function toDbExamRow(e: any, _isPartial = false): any {
  if (!e || typeof e !== 'object') return e;
  const row: any = {};
  if (e.id !== undefined) row.id = e.id;
  if (e.title !== undefined) row.title = e.title;
  if (e.description !== undefined) row.description = e.description || '';
  if (e.subject !== undefined) row.subject = e.subject || 'Công nghệ Thông tin';
  if (e.grade !== undefined) row.grade = e.grade || 'Khối 12';
  if (e.targetGrades !== undefined || e.target_grades !== undefined) {
    const raw = e.targetGrades ?? e.target_grades ?? [];
    row.targetGrades = typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
  if (e.creatorId !== undefined || e.creator_id !== undefined) {
    row.creatorId = e.creatorId ?? e.creator_id;
  }
  if (e.creatorName !== undefined || e.creator_name !== undefined) {
    row.creatorName = e.creatorName ?? e.creator_name;
  }
  if (e.classIds !== undefined || e.class_ids !== undefined) {
    const raw = e.classIds ?? e.class_ids ?? [];
    row.classIds = typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
  if (e.durationMinutes !== undefined || e.duration_minutes !== undefined) {
    row.durationMinutes = Number(e.durationMinutes ?? e.duration_minutes ?? 45);
  }
  if (e.totalScore !== undefined || e.total_score !== undefined) {
    row.totalScore = Number(e.totalScore ?? e.total_score ?? 1000);
  }
  if (e.passingScore !== undefined || e.passing_score !== undefined) {
    row.passingScore = Number(e.passingScore ?? e.passing_score ?? 950);
  }
  if (e.status !== undefined) row.status = e.status || 'published';
  if (e.allowReviewAnswers !== undefined || e.allow_review_answers !== undefined) {
    row.allowReviewAnswers = (e.allowReviewAnswers ?? e.allow_review_answers ?? true) ? 1 : 0;
  }
  if (e.isPracticeTest !== undefined || e.is_practice_test !== undefined) {
    row.isPracticeTest = (e.isPracticeTest ?? e.is_practice_test ?? false) ? 1 : 0;
  }
  if (e.practiceRandomCount !== undefined || e.practice_random_count !== undefined) {
    row.practiceRandomCount = Number(e.practiceRandomCount ?? e.practice_random_count ?? 0);
  }
  if (e.totalQuestions !== undefined || e.total_questions !== undefined) {
    row.totalQuestions = Number(e.totalQuestions ?? e.total_questions ?? (Array.isArray(e.questions) ? e.questions.length : 0));
  } else if (Array.isArray(e.questions)) {
    row.totalQuestions = e.questions.length;
  }
  if (e.questionIds !== undefined || e.question_ids !== undefined) {
    const raw = e.questionIds ?? e.question_ids ?? [];
    row.questionIds = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } else if (Array.isArray(e.questions)) {
    row.questionIds = JSON.stringify(e.questions.map((q: any) => q.id));
  }
  if (e.createdAt !== undefined || e.created_at !== undefined) {
    row.createdAt = e.createdAt ?? e.created_at;
  }
  if (e.updatedAt !== undefined || e.updated_at !== undefined) {
    row.updatedAt = e.updatedAt ?? e.updated_at;
  }
  return row;
}

export function toDbExamQuestionRow(q: any, examId: string, orderIndex: number): any {
  if (!q || typeof q !== 'object') return q;
  return {
    id: String(q.id || `q_${examId}_${orderIndex}_${Math.random().toString(36).slice(2, 6)}`),
    examId: String(q.examId || examId),
    orderIndex: Number(q.orderIndex ?? orderIndex),
    type: q.type || 'single_choice',
    title: q.title || '',
    mediaType: q.mediaType || 'none',
    mediaUrl: q.mediaUrl || null,
    explanation: q.explanation || null,
    options: typeof q.options === 'string' ? q.options : JSON.stringify(q.options || []),
    correctOptionId: q.correctOptionId || null,
    correctOptionIds: typeof q.correctOptionIds === 'string' ? q.correctOptionIds : JSON.stringify(q.correctOptionIds || []),
    matchingPairs: typeof q.matchingPairs === 'string' ? q.matchingPairs : JSON.stringify(q.matchingPairs || []),
    shuffledRightPairs: typeof q.shuffledRightPairs === 'string' ? q.shuffledRightPairs : JSON.stringify(q.shuffledRightPairs || []),
    orderingItems: typeof q.orderingItems === 'string' ? q.orderingItems : JSON.stringify(q.orderingItems || []),
    trueLabel: q.trueLabel || 'Đúng',
    falseLabel: q.falseLabel || 'Sai',
    tfStatements: typeof q.tfStatements === 'string' ? q.tfStatements : JSON.stringify(q.tfStatements || []),
    shuffledTfColumns: typeof q.shuffledTfColumns === 'string' ? q.shuffledTfColumns : JSON.stringify(q.shuffledTfColumns || []),
    hotspotImageUrl: q.hotspotImageUrl || null,
    hotspotRegions: typeof q.hotspotRegions === 'string' ? q.hotspotRegions : JSON.stringify(q.hotspotRegions || []),
    fillBlankTemplate: q.fillBlankTemplate || null,
    fillBlankItems: typeof q.fillBlankItems === 'string' ? q.fillBlankItems : JSON.stringify(q.fillBlankItems || []),
    updatedAt: new Date().toISOString(),
  };
}

export function toDbQuestionOptionRow(opt: any, questionId: string, examId: string, orderIndex: number, isCorrect = false): any {
  if (!opt || typeof opt !== 'object') return opt;
  const rawId = String(opt.id || `opt_${orderIndex + 1}`).trim();
  const cleanParent = String(questionId || 'q').trim();
  const uniqueId = rawId.startsWith(`${cleanParent}_`) ? rawId : `${cleanParent}_${rawId}`;
  return {
    id: uniqueId,
    questionId: cleanParent,
    examId: String(examId || ''),
    orderIndex: Number(orderIndex),
    text: String(opt.text || ''),
    imageUrl: opt.imageUrl || null,
    isCorrect: isCorrect ? 1 : 0,
    createdAt: new Date().toISOString(),
  };
}

export function toDbQuestionMatchingPairRow(pair: any, questionId: string, examId: string, orderIndex: number): any {
  if (!pair || typeof pair !== 'object') return pair;
  const rawId = String(pair.id || `pair_${orderIndex + 1}`).trim();
  const cleanParent = String(questionId || 'q').trim();
  const uniqueId = rawId.startsWith(`${cleanParent}_`) ? rawId : `${cleanParent}_${rawId}`;
  return {
    id: uniqueId,
    questionId: cleanParent,
    examId: String(examId || ''),
    orderIndex: Number(orderIndex),
    leftText: String(pair.leftText || ''),
    leftImageUrl: pair.leftImageUrl || null,
    rightText: String(pair.rightText || ''),
    rightImageUrl: pair.rightImageUrl || null,
    createdAt: new Date().toISOString(),
  };
}

export function toDbQuestionOrderingItemRow(item: any, questionId: string, examId: string, orderIndex: number): any {
  if (!item || typeof item !== 'object') return item;
  const rawId = String(item.id || `ord_${orderIndex + 1}`).trim();
  const cleanParent = String(questionId || 'q').trim();
  const uniqueId = rawId.startsWith(`${cleanParent}_`) ? rawId : `${cleanParent}_${rawId}`;
  return {
    id: uniqueId,
    questionId: cleanParent,
    examId: String(examId || ''),
    orderIndex: Number(orderIndex),
    text: String(item.text || ''),
    imageUrl: item.imageUrl || null,
    createdAt: new Date().toISOString(),
  };
}

export function toDbQuestionTfStatementRow(stmt: any, questionId: string, examId: string, orderIndex: number): any {
  if (!stmt || typeof stmt !== 'object') return stmt;
  const rawId = String(stmt.id || `tf_${orderIndex + 1}`).trim();
  const cleanParent = String(questionId || 'q').trim();
  const uniqueId = rawId.startsWith(`${cleanParent}_`) ? rawId : `${cleanParent}_${rawId}`;
  return {
    id: uniqueId,
    questionId: cleanParent,
    examId: String(examId || ''),
    orderIndex: Number(orderIndex),
    statement: String(stmt.statement || ''),
    isTrue: stmt.isTrue ? 1 : 0,
    createdAt: new Date().toISOString(),
  };
}

export function toDbQuestionFillBlankItemRow(item: any, questionId: string, examId: string, orderIndex: number): any {
  if (!item || typeof item !== 'object') return item;
  const rawId = String(item.id || `fb_${orderIndex + 1}`).trim();
  const cleanParent = String(questionId || 'q').trim();
  const uniqueId = rawId.startsWith(`${cleanParent}_`) ? rawId : `${cleanParent}_${rawId}`;
  return {
    id: uniqueId,
    questionId: cleanParent,
    examId: String(examId || ''),
    orderIndex: Number(orderIndex),
    placeholderCode: String(item.placeholderCode || `[b${orderIndex + 1}]`),
    options: typeof item.options === 'string' ? item.options : JSON.stringify(item.options || []),
    correctAnswer: String(item.correctAnswer || ''),
    createdAt: new Date().toISOString(),
  };
}

export function toDbQuestionHotspotRow(region: any, questionId: string, examId: string, orderIndex: number = 0): any {
  if (!region || typeof region !== 'object') return region;
  const rawId = String(region.id || `hs_${orderIndex + 1}`).trim();
  const cleanParent = String(questionId || 'q').trim();
  const uniqueId = rawId.startsWith(`${cleanParent}_`) ? rawId : `${cleanParent}_${rawId}`;
  return {
    id: uniqueId,
    questionId: cleanParent,
    examId: String(examId || ''),
    orderIndex: Number(orderIndex),
    x: Number(region.x || 0),
    y: Number(region.y || 0),
    width: Number(region.width || 0),
    height: Number(region.height || 0),
    label: region.label || null,
    createdAt: new Date().toISOString(),
  };
}

export function normalizeExamQuestion(row: any, fallbackExamId = ''): ExamQuestion {
  const parseJson = (val: any, fallback: any = undefined) => {
    if (!val) return fallback;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return fallback; }
    }
    return val;
  };

  return {
    id: String(row.id || ''),
    examId: String(row.examId || row.exam_id || fallbackExamId),
    orderIndex: Number(row.orderIndex ?? row.order_index ?? 0),
    type: row.type || 'single_choice',
    title: String(row.title || ''),
    mediaType: row.mediaType || row.media_type || 'none',
    mediaUrl: row.mediaUrl || row.media_url || undefined,
    explanation: row.explanation || undefined,
    options: parseJson(row.options, undefined),
    correctOptionId: row.correctOptionId || row.correct_option_id || undefined,
    correctOptionIds: parseJson(row.correctOptionIds || row.correct_option_ids, undefined),
    matchingPairs: parseJson(row.matchingPairs || row.matching_pairs, undefined),
    shuffledRightPairs: parseJson(row.shuffledRightPairs || row.shuffled_right_pairs, undefined),
    orderingItems: parseJson(row.orderingItems || row.ordering_items, undefined),
    trueLabel: row.trueLabel || row.true_label || undefined,
    falseLabel: row.falseLabel || row.false_label || undefined,
    tfStatements: parseJson(row.tfStatements || row.tf_statements, undefined),
    shuffledTfColumns: parseJson(row.shuffledTfColumns || row.shuffled_tf_columns, undefined),
    hotspotImageUrl: row.hotspotImageUrl || row.hotspot_image_url || undefined,
    hotspotRegions: parseJson(row.hotspotRegions || row.hotspot_regions, undefined),
    fillBlankTemplate: row.fillBlankTemplate || row.fill_blank_template || undefined,
    fillBlankItems: parseJson(row.fillBlankItems || row.fill_blank_items, undefined),
  };
}

export function toDbSubmissionRow(s: any, _isPartial = false): any {
  if (!s || typeof s !== 'object') return s;
  const row: any = {};
  if (s.id !== undefined) row.id = s.id;
  if (s.examId !== undefined || s.exam_id !== undefined) row.examId = s.examId ?? s.exam_id;
  if (s.examTitle !== undefined || s.exam_title !== undefined) row.examTitle = s.examTitle ?? s.exam_title;
  if (s.studentId !== undefined || s.student_id !== undefined) row.studentId = s.studentId ?? s.student_id;
  if (s.studentName !== undefined || s.student_name !== undefined) row.studentName = s.studentName ?? s.student_name;
  if (s.studentCode !== undefined || s.student_code !== undefined) row.studentCode = s.studentCode ?? s.student_code;
  if (s.classId !== undefined || s.class_id !== undefined) row.classId = s.classId ?? s.class_id;
  if (s.score !== undefined) row.score = Number(s.score ?? 0);
  if (s.maxScore !== undefined || s.max_score !== undefined) row.maxScore = Number(s.maxScore ?? s.max_score ?? 1000);
  if (s.isPassed !== undefined || s.is_passed !== undefined) {
    row.isPassed = (s.isPassed ?? s.is_passed ?? false) ? 1 : 0;
  }
  if (s.submittedAt !== undefined || s.submitted_at !== undefined) row.submittedAt = s.submittedAt ?? s.submitted_at;
  if (s.dateKey !== undefined || s.date_key !== undefined) row.dateKey = s.dateKey ?? s.date_key ?? null;
  if (s.timeSpentSeconds !== undefined || s.time_spent_seconds !== undefined) row.timeSpentSeconds = Number(s.timeSpentSeconds ?? s.time_spent_seconds ?? 0);
  if (s.attemptNumber !== undefined || s.attempt_number !== undefined) row.attemptNumber = Number(s.attemptNumber ?? s.attempt_number ?? 1);
  if (s.isPractice !== undefined || s.is_practice !== undefined) {
    row.isPractice = (s.isPractice ?? s.is_practice ?? false) ? 1 : 0;
  }
  if (s.isTeacherTesting !== undefined || s.is_teacher_testing !== undefined) {
    row.isTeacherTesting = (s.isTeacherTesting ?? s.is_teacher_testing ?? false) ? 1 : 0;
  }
  if (s.studentAnswers !== undefined || s.student_answers !== undefined) {
    const raw = s.studentAnswers ?? s.student_answers ?? {};
    row.studentAnswers = typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
  if (s.questionResults !== undefined || s.question_results !== undefined) {
    const raw = s.questionResults ?? s.question_results ?? {};
    row.questionResults = typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
  if (s.questionOrder !== undefined || s.question_order !== undefined) {
    const raw = s.questionOrder ?? s.question_order ?? [];
    row.questionOrder = typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
  if (s.violationCount !== undefined || s.violation_count !== undefined) row.violationCount = Number(s.violationCount ?? s.violation_count ?? 0);
  if (s.violationLogs !== undefined || s.violation_logs !== undefined) {
    const raw = s.violationLogs ?? s.violation_logs ?? [];
    row.violationLogs = typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
  return row;
}

export function prepareDbPayload(table: string, payload: any, isPartial = false): any {
  if (Array.isArray(payload)) {
    return payload.map((item) => prepareDbPayload(table, item, isPartial));
  }
  if (!payload || typeof payload !== 'object') return payload;

  if (table === USERS_TABLE) return toDbUserRow(payload, isPartial);
  if (table === STUDENTS_TABLE) return toDbStudentRow(payload, isPartial);
  if (table === CLASSES_TABLE) return toDbClassRow(payload, isPartial);
  if (table === SCHOOLS_TABLE) return toDbSchoolRow(payload, isPartial);
  if (table === EXAMS_TABLE) return toDbExamRow(payload, isPartial);
  if (table === EXAM_QUESTIONS_TABLE) {
    return toDbExamQuestionRow(payload, payload.examId || '', payload.orderIndex || 0);
  }
  if (table === QUESTION_OPTIONS_TABLE) {
    return toDbQuestionOptionRow(payload, payload.questionId || '', payload.examId || '', payload.orderIndex || 0, payload.isCorrect);
  }
  if (table === QUESTION_MATCHING_PAIRS_TABLE) {
    return toDbQuestionMatchingPairRow(payload, payload.questionId || '', payload.examId || '', payload.orderIndex || 0);
  }
  if (table === QUESTION_ORDERING_ITEMS_TABLE) {
    return toDbQuestionOrderingItemRow(payload, payload.questionId || '', payload.examId || '', payload.orderIndex || 0);
  }
  if (table === QUESTION_TF_STATEMENTS_TABLE) {
    return toDbQuestionTfStatementRow(payload, payload.questionId || '', payload.examId || '', payload.orderIndex || 0);
  }
  if (table === QUESTION_FILL_BLANK_ITEMS_TABLE) {
    return toDbQuestionFillBlankItemRow(payload, payload.questionId || '', payload.examId || '', payload.orderIndex || 0);
  }
  if (table === QUESTION_HOTSPOTS_TABLE) {
    return toDbQuestionHotspotRow(payload, payload.questionId || '', payload.examId || '', payload.orderIndex || 0);
  }
  if (table === SUBMISSIONS_TABLE) return toDbSubmissionRow(payload, isPartial);
  return payload;
}

export function normalizeExam(row: any): Exam {
  const parseJson = (val: any, fallback: any = []) => {
    if (!val) return fallback;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return fallback; }
    }
    return val;
  };

  const classIds = parseJson(row.classIds || row.class_ids, []);
  const questions = parseJson(row.questions, []);
  const questionIds = parseJson(row.questionIds || row.question_ids, []);
  let targetGrades = parseJson(row.targetGrades || row.target_grades, []);
  if (!Array.isArray(targetGrades)) targetGrades = [];
  if (targetGrades.length === 0 && row.grade) {
    targetGrades = [String(row.grade).trim()];
  }

  const totalQuestions = Number(
    row.totalQuestions ?? row.total_questions ?? (questionIds.length > 0 ? questionIds.length : questions.length)
  );

  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    description: String(row.description || ''),
    subject: String(row.subject || ''),
    grade: String(row.grade || ''),
    targetGrades,
    creatorId: String(row.creatorId || row.creator_id || ''),
    creatorName: String(row.creatorName || row.creator_name || ''),
    classIds: Array.isArray(classIds) ? classIds : [],
    durationMinutes: Number(row.durationMinutes ?? row.duration_minutes ?? 45),
    totalScore: Number(row.totalScore ?? row.total_score ?? 1000),
    passingScore: Number(row.passingScore ?? row.passing_score ?? 950),
    status: row.status || 'published',
    allowReviewAnswers: Boolean(row.allowReviewAnswers ?? row.allow_review_answers ?? 1),
    isPracticeTest: Boolean(row.isPracticeTest ?? row.is_practice_test ?? 0),
    practiceRandomCount: Number(row.practiceRandomCount ?? row.practice_random_count ?? 0),
    totalQuestions,
    questionIds: Array.isArray(questionIds) ? questionIds : [],
    questions: Array.isArray(questions) ? questions : [],
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || new Date().toISOString(),
  };
}

export function normalizeSubmission(row: any): ExamSubmission {
  const parseJson = (val: any, fallback: any) => {
    if (!val) return fallback;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return fallback; }
    }
    return val;
  };

  const studentAnswers = parseJson(row.studentAnswers || row.student_answers, {});
  const questionResults = parseJson(row.questionResults || row.question_results, {});
  const questionOrder = parseJson(row.questionOrder || row.question_order, undefined);
  const violationLogs = parseJson(row.violationLogs || row.violation_logs, []);
  const questionsSnapshot = parseJson(row.questionsSnapshot || row.questions_snapshot, undefined);

  return {
    id: String(row.id || ''),
    examId: String(row.examId || row.exam_id || ''),
    examTitle: String(row.examTitle || row.exam_title || ''),
    studentId: String(row.studentId || row.student_id || ''),
    studentName: String(row.studentName || row.student_name || ''),
    studentCode: String(row.studentCode || row.student_code || ''),
    classId: String(row.classId || row.class_id || ''),
    score: Number(row.score ?? 0),
    maxScore: Number(row.maxScore ?? row.max_score ?? 1000),
    isPassed: Boolean(row.isPassed ?? row.is_passed ?? false),
    submittedAt: row.submittedAt || row.submitted_at || new Date().toISOString(),
    dateKey: row.dateKey || row.date_key || undefined,
    timeSpentSeconds: Number(row.timeSpentSeconds ?? row.time_spent_seconds ?? 0),
    attemptNumber: Number(row.attemptNumber ?? row.attempt_number ?? 1),
    isPractice: Boolean(row.isPractice ?? row.is_practice ?? false),
    isTeacherTesting: Boolean(row.isTeacherTesting ?? row.is_teacher_testing ?? false),
    studentAnswers,
    questionResults,
    questionOrder: Array.isArray(questionOrder) ? questionOrder : undefined,
    questionsSnapshot: Array.isArray(questionsSnapshot) ? questionsSnapshot : undefined,
    violationCount: Number(row.violationCount ?? row.violation_count ?? 0),
    violationLogs: Array.isArray(violationLogs) ? violationLogs : [],
  };
}

export function normalizeQuestionBankRow(row: any): ExamQuestion {
  const parseJson = (val: any, fallback: any = null) => {
    if (!val) return fallback;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return fallback; }
    }
    return val;
  };

  return {
    id: String(row.id || ''),
    type: row.type || 'single_choice',
    title: String(row.title || ''),
    mediaType: row.mediaType || row.media_type || 'none',
    mediaUrl: row.mediaUrl || row.media_url || undefined,
    explanation: row.explanation || undefined,
    options: parseJson(row.options, []),
    correctOptionId: row.correctOptionId || row.correct_option_id || undefined,
    correctOptionIds: parseJson(row.correctOptionIds || row.correct_option_ids, []),
    matchingPairs: parseJson(row.matchingPairs || row.matching_pairs, []),
    shuffledRightPairs: parseJson(row.shuffledRightPairs || row.shuffled_right_pairs, []),
    orderingItems: parseJson(row.orderingItems || row.ordering_items, []),
    trueLabel: row.trueLabel || row.true_label || 'Đúng',
    falseLabel: row.falseLabel || row.false_label || 'Sai',
    tfStatements: parseJson(row.tfStatements || row.tf_statements, []),
    shuffledTfColumns: parseJson(row.shuffledTfColumns || row.shuffled_tf_columns, []),
    hotspotImageUrl: row.hotspotImageUrl || row.hotspot_image_url || undefined,
    hotspotRegions: parseJson(row.hotspotRegions || row.hotspot_regions, []),
    fillBlankTemplate: row.fillBlankTemplate || row.fill_blank_template || undefined,
    fillBlankItems: parseJson(row.fillBlankItems || row.fill_blank_items, []),
    sourceExamId: row.sourceExamId || row.source_exam_id || undefined,
    sourceExamTitle: row.sourceExamTitle || row.source_exam_title || undefined,
    subject: row.subject || 'Công nghệ Thông tin',
    grade: row.grade || 'Khối 12',
    creatorId: row.creatorId || row.creator_id || undefined,
    creatorName: row.creatorName || row.creator_name || undefined,
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || new Date().toISOString(),
  };
}

export function sortByCreatedAt<T extends { createdAt?: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });
}

export function sortBySubmittedAt(list: ExamSubmission[]): ExamSubmission[] {
  return [...list].sort((a, b) => {
    const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return timeB - timeA;
  });
}

// Backward-compatibility helpers
export function convertAllKeysToSnakeCase(obj: any): any { return obj; }
export function convertAllKeysToCamelCase(obj: any): any { return obj; }
export function applyTableSchemaCache(_table: string, payload: any): any { return payload; }

let hasReportedMissingQuestionsColumn = false;
const missingQuestionsListeners = new Set<(missing: boolean) => void>();

export function onMissingQuestionsColumn(callback: (missing: boolean) => void): () => void {
  missingQuestionsListeners.add(callback);
  callback(hasReportedMissingQuestionsColumn);
  return () => {
    missingQuestionsListeners.delete(callback);
  };
}

export function notifyMissingQuestionsColumn(missing: boolean): void {
  hasReportedMissingQuestionsColumn = missing;
  missingQuestionsListeners.forEach((fn) => {
    try { fn(missing); } catch {}
  });
}

export function isMissingQuestionsColumnReported(): boolean {
  return hasReportedMissingQuestionsColumn;
}

export async function checkExamsQuestionsColumnExists(): Promise<boolean> {
  return true;
}

export async function checkExamQuestionsTableExists(): Promise<boolean> {
  if (!isConfigured) return true;
  try {
    await tursoExecute(`SELECT id FROM ${EXAM_QUESTIONS_TABLE} LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

export interface MultiTablesStatus {
  exams: boolean;
  exam_questions: boolean;
  question_options: boolean;
  question_matching_pairs: boolean;
  question_ordering_items: boolean;
  question_tf_statements: boolean;
  question_fill_blank_items: boolean;
  question_hotspots: boolean;
  question_bank?: boolean;
  isAllMultiTablesReady: boolean;
}

export interface MultiTableMigrationResult {
  success: boolean;
  examsCount: number;
  questionsCount: number;
  optionsCount: number;
  matchingPairsCount: number;
  orderingItemsCount: number;
  tfStatementsCount: number;
  fillBlankItemsCount: number;
  hotspotsCount: number;
  message: string;
}

export async function checkMultiTablesStatus(): Promise<MultiTablesStatus> {
  if (!isConfigured) {
    return {
      exams: true,
      exam_questions: true,
      question_options: true,
      question_matching_pairs: true,
      question_ordering_items: true,
      question_tf_statements: true,
      question_fill_blank_items: true,
      question_hotspots: true,
      question_bank: true,
      isAllMultiTablesReady: true,
    };
  }

  const checkTable = async (tableName: string): Promise<boolean> => {
    try {
      await tursoExecute(`SELECT id FROM "${tableName}" LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  };

  const [
    exams,
    exam_questions,
    question_options,
    question_matching_pairs,
    question_ordering_items,
    question_tf_statements,
    question_fill_blank_items,
    question_hotspots,
    question_bank,
  ] = await Promise.all([
    checkTable(EXAMS_TABLE),
    checkTable(EXAM_QUESTIONS_TABLE),
    checkTable(QUESTION_OPTIONS_TABLE),
    checkTable(QUESTION_MATCHING_PAIRS_TABLE),
    checkTable(QUESTION_ORDERING_ITEMS_TABLE),
    checkTable(QUESTION_TF_STATEMENTS_TABLE),
    checkTable(QUESTION_FILL_BLANK_ITEMS_TABLE),
    checkTable(QUESTION_HOTSPOTS_TABLE),
    checkTable(QUESTION_BANK_TABLE),
  ]);

  const isAllMultiTablesReady = Boolean(
    exams &&
    exam_questions &&
    question_options &&
    question_matching_pairs &&
    question_ordering_items &&
    question_tf_statements &&
    question_fill_blank_items &&
    question_hotspots
  );

  return {
    exams,
    exam_questions,
    question_options,
    question_matching_pairs,
    question_ordering_items,
    question_tf_statements,
    question_fill_blank_items,
    question_hotspots,
    question_bank,
    isAllMultiTablesReady,
  };
}

// ================= TURSO SQLITE CRUD GENERIC HELPERS =================

/**
 * Upsert a single record into SQLite / Turso using ON CONFLICT(id) DO UPDATE SET ...
 */
export async function safeDbUpsert(table: string, payload: any): Promise<{ data: any; error: any }> {
  if (!payload || (Array.isArray(payload) && payload.length === 0)) {
    return { data: [], error: null };
  }

  const records = Array.isArray(payload) ? payload : [payload];
  if (!isConfigured) {
    return { data: records, error: null };
  }

  try {
    const statements: Array<{ sql: string; args: any[] }> = [];

    for (const rawItem of records) {
      const item = cleanDbData(prepareDbPayload(table, rawItem));
      const keys = Object.keys(item);
      if (keys.length === 0) continue;

      const placeholders = keys.map(() => '?').join(', ');
      const quotedCols = keys.map((k) => `"${k}"`).join(', ');
      const updateClauses = keys
        .filter((k) => k !== 'id')
        .map((k) => `"${k}" = excluded."${k}"`)
        .join(', ');

      const values = keys.map((k) => {
        const val = item[k];
        if (val === undefined) return null;
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        if (typeof val === 'boolean') return val ? 1 : 0;
        return val;
      });

      const sql = updateClauses
        ? `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateClauses}`
        : `INSERT OR IGNORE INTO "${table}" (${quotedCols}) VALUES (${placeholders})`;

      statements.push({ sql, args: values });
    }

    if (statements.length > 0) {
      await tursoBatch(statements);
    }

    return { data: records, error: null };
  } catch (err: any) {
    handleTursoError(err, OperationType.WRITE, table);
    return { data: null, error: err };
  }
}

export const safeDbInsert = safeDbUpsert;

export async function safeDbUpdate(table: string, payload: any, matchColumn: string, matchValue: any): Promise<{ data: any; error: any }> {
  if (!isConfigured) return { data: null, error: null };
  try {
    const item = cleanDbData(prepareDbPayload(table, payload, true));
    const keys = Object.keys(item).filter((k) => k !== matchColumn);
    if (keys.length === 0) return { data: null, error: null };

    const setClauses = keys.map((k) => `"${k}" = ?`).join(', ');
    const values = keys.map((k) => {
      const val = item[k];
      if (val === undefined) return null;
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      if (typeof val === 'boolean') return val ? 1 : 0;
      return val;
    });

    values.push(matchValue);
    const sql = `UPDATE "${table}" SET ${setClauses} WHERE "${matchColumn}" = ?`;
    await tursoExecute(sql, values);
    return { data: payload, error: null };
  } catch (err: any) {
    handleTursoError(err, OperationType.UPDATE, table);
    return { data: null, error: err };
  }
}

// ================= MULTI-TABLE SAVE AND MIGRATE FOR EXAM QUESTIONS =================

export async function saveExamQuestionsToMultiTables(
  examId: string,
  questions: ExamQuestion[]
): Promise<{
  questionsCount: number;
  optionsCount: number;
  matchingPairsCount: number;
  orderingItemsCount: number;
  tfStatementsCount: number;
  fillBlankItemsCount: number;
  hotspotsCount: number;
}> {
  if (!questions || questions.length === 0) {
    return {
      questionsCount: 0,
      optionsCount: 0,
      matchingPairsCount: 0,
      orderingItemsCount: 0,
      tfStatementsCount: 0,
      fillBlankItemsCount: 0,
      hotspotsCount: 0,
    };
  }

  const questionRows: any[] = [];
  const optionRows: any[] = [];
  const matchingRows: any[] = [];
  const orderingRows: any[] = [];
  const tfRows: any[] = [];
  const fillBlankRows: any[] = [];
  const hotspotRows: any[] = [];

  questions.forEach((q, qIdx) => {
    const rawQId = String(q.id || `q_${qIdx + 1}`).trim();
    const cleanQId = rawQId.startsWith(`${examId}_`) ? rawQId : `${examId}_${rawQId}`;
    const qRow = toDbExamQuestionRow({ ...q, id: cleanQId }, examId, qIdx);
    questionRows.push(qRow);

    if (q.options && Array.isArray(q.options)) {
      q.options.forEach((opt, optIdx) => {
        const isCorrect =
          opt.id === q.correctOptionId ||
          (Array.isArray(q.correctOptionIds) && q.correctOptionIds.includes(opt.id));
        optionRows.push(toDbQuestionOptionRow(opt, cleanQId, examId, optIdx, isCorrect));
      });
    }

    if (q.matchingPairs && Array.isArray(q.matchingPairs)) {
      q.matchingPairs.forEach((pair, pairIdx) => {
        matchingRows.push(toDbQuestionMatchingPairRow(pair, cleanQId, examId, pairIdx));
      });
    }

    if (q.orderingItems && Array.isArray(q.orderingItems)) {
      q.orderingItems.forEach((ord, ordIdx) => {
        orderingRows.push(toDbQuestionOrderingItemRow(ord, cleanQId, examId, ordIdx));
      });
    }

    if (q.tfStatements && Array.isArray(q.tfStatements)) {
      q.tfStatements.forEach((tf, tfIdx) => {
        tfRows.push(toDbQuestionTfStatementRow(tf, cleanQId, examId, tfIdx));
      });
    }

    if (q.fillBlankItems && Array.isArray(q.fillBlankItems)) {
      q.fillBlankItems.forEach((fb, fbIdx) => {
        fillBlankRows.push(toDbQuestionFillBlankItemRow(fb, cleanQId, examId, fbIdx));
      });
    }

    if (q.hotspotRegions && Array.isArray(q.hotspotRegions)) {
      q.hotspotRegions.forEach((hs, hsIdx) => {
        hotspotRows.push(toDbQuestionHotspotRow(hs, cleanQId, examId, hsIdx));
      });
    }
  });

  if (isConfigured) {
    try {
      // 1. Dọn sạch các câu hỏi và lựa chọn cũ của đề thi
      await tursoExecute(`DELETE FROM "${QUESTION_OPTIONS_TABLE}" WHERE examId = ?`, [examId]);
      await tursoExecute(`DELETE FROM "${QUESTION_MATCHING_PAIRS_TABLE}" WHERE examId = ?`, [examId]);
      await tursoExecute(`DELETE FROM "${QUESTION_ORDERING_ITEMS_TABLE}" WHERE examId = ?`, [examId]);
      await tursoExecute(`DELETE FROM "${QUESTION_TF_STATEMENTS_TABLE}" WHERE examId = ?`, [examId]);
      await tursoExecute(`DELETE FROM "${QUESTION_FILL_BLANK_ITEMS_TABLE}" WHERE examId = ?`, [examId]);
      await tursoExecute(`DELETE FROM "${QUESTION_HOTSPOTS_TABLE}" WHERE examId = ?`, [examId]);
      await tursoExecute(`DELETE FROM "${EXAM_QUESTIONS_TABLE}" WHERE examId = ?`, [examId]);

      // 2. Chèn vào bảng chính exam_questions
      if (questionRows.length > 0) {
        await safeDbUpsert(EXAM_QUESTIONS_TABLE, questionRows);
      }

      // 3. Chèn vào các bảng con
      if (optionRows.length > 0) await safeDbUpsert(QUESTION_OPTIONS_TABLE, optionRows);
      if (matchingRows.length > 0) await safeDbUpsert(QUESTION_MATCHING_PAIRS_TABLE, matchingRows);
      if (orderingRows.length > 0) await safeDbUpsert(QUESTION_ORDERING_ITEMS_TABLE, orderingRows);
      if (tfRows.length > 0) await safeDbUpsert(QUESTION_TF_STATEMENTS_TABLE, tfRows);
      if (fillBlankRows.length > 0) await safeDbUpsert(QUESTION_FILL_BLANK_ITEMS_TABLE, fillBlankRows);
      if (hotspotRows.length > 0) await safeDbUpsert(QUESTION_HOTSPOTS_TABLE, hotspotRows);
    } catch (e) {
      console.warn('saveExamQuestionsToMultiTables error:', e);
    }
  }

  return {
    questionsCount: questionRows.length,
    optionsCount: optionRows.length,
    matchingPairsCount: matchingRows.length,
    orderingItemsCount: orderingRows.length,
    tfStatementsCount: tfRows.length,
    fillBlankItemsCount: fillBlankRows.length,
    hotspotsCount: hotspotRows.length,
  };
}

export async function splitAndMigrateToMultiTables(): Promise<MultiTableMigrationResult> {
  let questionsCount = 0;
  let optionsCount = 0;
  let matchingPairsCount = 0;
  let orderingItemsCount = 0;
  let tfStatementsCount = 0;
  let fillBlankItemsCount = 0;
  let hotspotsCount = 0;

  for (const exam of localExams) {
    if (exam.questions && exam.questions.length > 0) {
      const res = await saveExamQuestionsToMultiTables(exam.id, exam.questions);
      questionsCount += res.questionsCount;
      optionsCount += res.optionsCount;
      matchingPairsCount += res.matchingPairsCount;
      orderingItemsCount += res.orderingItemsCount;
      tfStatementsCount += res.tfStatementsCount;
      fillBlankItemsCount += res.fillBlankItemsCount;
      hotspotsCount += res.hotspotsCount;
    }
  }

  return {
    success: true,
    examsCount: localExams.length,
    questionsCount,
    optionsCount,
    matchingPairsCount,
    orderingItemsCount,
    tfStatementsCount,
    fillBlankItemsCount,
    hotspotsCount,
    message: `Đã phân bổ thành công ${questionsCount} câu hỏi của ${localExams.length} đề thi sang kiến trúc đa bảng Turso!`,
  };
}

export async function splitAndMigrateExamQuestionsToSeparateTable(): Promise<{
  success: boolean;
  examsCount: number;
  questionsCount: number;
  message: string;
}> {
  const result = await splitAndMigrateToMultiTables();
  return {
    success: result.success,
    examsCount: result.examsCount,
    questionsCount: result.questionsCount,
    message: result.message,
  };
}

export async function syncAllExamQuestionsToSupabase(): Promise<{ success: boolean; syncedCount: number; message: string }> {
  const res = await splitAndMigrateToMultiTables();
  return {
    success: res.success,
    syncedCount: res.examsCount,
    message: res.message,
  };
}

// ================= SUBSCRIPTIONS & REAL-TIME FETCHING =================

export function subscribeSchools(onUpdate: (schools: School[]) => void) {
  schoolListeners.add(onUpdate);
  onUpdate([...localSchools]);

  if (isConfigured) {
    const fetchSchools = async () => {
      try {
        const rows = await tursoQuery(`SELECT * FROM ${SCHOOLS_TABLE} ORDER BY createdAt DESC`);
        if (Array.isArray(rows)) {
          localSchools = sortByCreatedAt(rows.map(normalizeSchool));
          notifySchools();
        }
      } catch (err) {
        console.warn('fetchSchools error:', err);
      }
    };

    fetchSchools();
    const timer = setInterval(fetchSchools, 6000);
    return () => {
      schoolListeners.delete(onUpdate);
      clearInterval(timer);
    };
  }

  return () => {
    schoolListeners.delete(onUpdate);
  };
}

export function subscribeClasses(onUpdate: (classes: SchoolClass[]) => void) {
  classListeners.add(onUpdate);
  onUpdate([...localClasses]);

  if (isConfigured) {
    const fetchClasses = async () => {
      try {
        const rows = await tursoQuery(`SELECT * FROM ${CLASSES_TABLE} ORDER BY createdAt DESC`);
        if (Array.isArray(rows)) {
          localClasses = sortByCreatedAt(rows.map(normalizeClass));
          notifyClasses();
        }
      } catch (err) {
        console.warn('fetchClasses error:', err);
      }
    };

    fetchClasses();
    const timer = setInterval(fetchClasses, 6000);
    return () => {
      classListeners.delete(onUpdate);
      clearInterval(timer);
    };
  }

  return () => {
    classListeners.delete(onUpdate);
  };
}

export function subscribeStudents(onUpdate: (students: Student[]) => void) {
  studentListeners.add(onUpdate);
  onUpdate([...localStudents]);

  if (isConfigured) {
    const fetchStudents = async () => {
      try {
        const rows = await tursoQuery(`SELECT * FROM ${STUDENTS_TABLE} ORDER BY createdAt DESC`);
        if (Array.isArray(rows)) {
          localStudents = sortByCreatedAt(rows.map(normalizeStudent));
          notifyStudents();
        }
      } catch (err) {
        console.warn('fetchStudents error:', err);
      }
    };

    fetchStudents();
    const timer = setInterval(fetchStudents, 6000);
    return () => {
      studentListeners.delete(onUpdate);
      clearInterval(timer);
    };
  }

  return () => {
    studentListeners.delete(onUpdate);
  };
}

export function subscribeUsers(onUpdate: (users: UserAccount[]) => void) {
  userListeners.add(onUpdate);
  onUpdate([...localUsers]);

  if (isConfigured) {
    const fetchUsers = async () => {
      try {
        const rows = await tursoQuery(`SELECT * FROM ${USERS_TABLE} ORDER BY createdAt DESC`);
        if (Array.isArray(rows)) {
          localUsers = sortByCreatedAt(
            rows
              .map(normalizeUser)
              .filter(
                (u) => (u.role === 'admin' || u.role === 'teacher') && !u.id?.startsWith('exam_') && !u.id?.startsWith('sub_')
              )
          );
          notifyUsers();
        }
      } catch (err) {
        console.warn('fetchUsers error:', err);
      }
    };

    fetchUsers();
    const timer = setInterval(fetchUsers, 6000);
    return () => {
      userListeners.delete(onUpdate);
      clearInterval(timer);
    };
  }

  return () => {
    userListeners.delete(onUpdate);
  };
}

export function subscribeExams(onUpdate: (exams: Exam[]) => void) {
  examListeners.add(onUpdate);
  onUpdate([...localExams]);

  if (isConfigured) {
    const fetchExams = async () => {
      try {
        const [
          examsRows,
          questionsRows,
          optionsRows,
          matchingRows,
          orderingRows,
          tfRows,
          fillBlankRows,
          hotspotRows,
          bankRows,
        ] = await Promise.all([
          tursoQuery(`SELECT * FROM ${EXAMS_TABLE} ORDER BY createdAt DESC`),
          tursoQuery(`SELECT * FROM ${EXAM_QUESTIONS_TABLE} ORDER BY orderIndex ASC`).catch(() => []),
          tursoQuery(`SELECT * FROM ${QUESTION_OPTIONS_TABLE} ORDER BY orderIndex ASC`).catch(() => []),
          tursoQuery(`SELECT * FROM ${QUESTION_MATCHING_PAIRS_TABLE} ORDER BY orderIndex ASC`).catch(() => []),
          tursoQuery(`SELECT * FROM ${QUESTION_ORDERING_ITEMS_TABLE} ORDER BY orderIndex ASC`).catch(() => []),
          tursoQuery(`SELECT * FROM ${QUESTION_TF_STATEMENTS_TABLE} ORDER BY orderIndex ASC`).catch(() => []),
          tursoQuery(`SELECT * FROM ${QUESTION_FILL_BLANK_ITEMS_TABLE} ORDER BY orderIndex ASC`).catch(() => []),
          tursoQuery(`SELECT * FROM ${QUESTION_HOTSPOTS_TABLE} ORDER BY orderIndex ASC`).catch(() => []),
          tursoQuery(`SELECT * FROM ${QUESTION_BANK_TABLE} ORDER BY createdAt DESC`).catch(() => []),
        ]);

        if (Array.isArray(examsRows)) {
          const allQuestionsPool = new Map<string, ExamQuestion>();

          // 1. Local question bank
          localQuestionBank.forEach((q) => {
            if (q && q.id) allQuestionsPool.set(q.id, q);
          });

          // 2. Question bank table
          if (Array.isArray(bankRows)) {
            for (const bRow of bankRows) {
              const bQ = normalizeQuestionBankRow(bRow);
              if (bQ && bQ.id) allQuestionsPool.set(bQ.id, bQ);
            }
          }

          // 3. Child tables mapping
          const optionsByQ = new Map<string, any[]>();
          if (Array.isArray(optionsRows)) {
            for (const opt of optionsRows) {
              const qId = String(opt.questionId || opt.question_id || '');
              if (qId) {
                const list = optionsByQ.get(qId) || [];
                list.push(opt);
                optionsByQ.set(qId, list);
              }
            }
          }

          const matchingByQ = new Map<string, any[]>();
          if (Array.isArray(matchingRows)) {
            for (const p of matchingRows) {
              const qId = String(p.questionId || p.question_id || '');
              if (qId) {
                const list = matchingByQ.get(qId) || [];
                list.push(p);
                matchingByQ.set(qId, list);
              }
            }
          }

          const orderingByQ = new Map<string, any[]>();
          if (Array.isArray(orderingRows)) {
            for (const o of orderingRows) {
              const qId = String(o.questionId || o.question_id || '');
              if (qId) {
                const list = orderingByQ.get(qId) || [];
                list.push(o);
                orderingByQ.set(qId, list);
              }
            }
          }

          const tfByQ = new Map<string, any[]>();
          if (Array.isArray(tfRows)) {
            for (const tf of tfRows) {
              const qId = String(tf.questionId || tf.question_id || '');
              if (qId) {
                const list = tfByQ.get(qId) || [];
                list.push(tf);
                tfByQ.set(qId, list);
              }
            }
          }

          const fillBlankByQ = new Map<string, any[]>();
          if (Array.isArray(fillBlankRows)) {
            for (const fb of fillBlankRows) {
              const qId = String(fb.questionId || fb.question_id || '');
              if (qId) {
                const list = fillBlankByQ.get(qId) || [];
                list.push(fb);
                fillBlankByQ.set(qId, list);
              }
            }
          }

          const hotspotsByQ = new Map<string, any[]>();
          if (Array.isArray(hotspotRows)) {
            for (const hs of hotspotRows) {
              const qId = String(hs.questionId || hs.question_id || '');
              if (qId) {
                const list = hotspotsByQ.get(qId) || [];
                list.push(hs);
                hotspotsByQ.set(qId, list);
              }
            }
          }

          // 4. Questions by examId
          const questionsByExam = new Map<string, ExamQuestion[]>();
          if (Array.isArray(questionsRows)) {
            for (const qRow of questionsRows) {
              const exId = String(qRow.examId || qRow.exam_id || '');
              const baseQ = normalizeExamQuestion(qRow, exId);
              const qId = baseQ.id;

              const opts = optionsByQ.get(qId);
              if (opts && opts.length > 0) {
                baseQ.options = opts.map((opt) => ({
                  id: opt.id,
                  text: opt.text,
                  imageUrl: opt.imageUrl || opt.image_url || undefined,
                }));
                const correct = opts.filter((o) => o.isCorrect || o.is_correct);
                if (correct.length === 1) baseQ.correctOptionId = correct[0].id;
                else if (correct.length > 1) baseQ.correctOptionIds = correct.map((c) => c.id);
              }

              const pairs = matchingByQ.get(qId);
              if (pairs && pairs.length > 0) {
                baseQ.matchingPairs = pairs.map((p) => ({
                  id: p.id,
                  leftText: p.leftText || p.left_text,
                  leftImageUrl: p.leftImageUrl || p.left_image_url || undefined,
                  rightText: p.rightText || p.right_text,
                  rightImageUrl: p.rightImageUrl || p.right_image_url || undefined,
                }));
              }

              const items = orderingByQ.get(qId);
              if (items && items.length > 0) {
                baseQ.orderingItems = items.map((it) => ({
                  id: it.id,
                  text: it.text,
                  imageUrl: it.imageUrl || it.image_url || undefined,
                }));
              }

              const tfs = tfByQ.get(qId);
              if (tfs && tfs.length > 0) {
                baseQ.tfStatements = tfs.map((t) => ({
                  id: t.id,
                  statement: t.statement,
                  isTrue: Boolean(t.isTrue ?? t.is_true ?? 1),
                }));
              }

              const fbs = fillBlankByQ.get(qId);
              if (fbs && fbs.length > 0) {
                baseQ.fillBlankItems = fbs.map((fb) => {
                  let optList = fb.options;
                  if (typeof optList === 'string') {
                    try { optList = JSON.parse(optList); } catch { optList = []; }
                  }
                  return {
                    id: fb.id,
                    placeholderCode: fb.placeholderCode || fb.placeholder_code,
                    options: Array.isArray(optList) ? optList : [],
                    correctAnswer: fb.correctAnswer || fb.correct_answer,
                  };
                });
              }

              const hss = hotspotsByQ.get(qId);
              if (hss && hss.length > 0) {
                baseQ.hotspotRegions = hss.map((h) => ({
                  id: h.id,
                  x: Number(h.x || 0),
                  y: Number(h.y || 0),
                  width: Number(h.width || 0),
                  height: Number(h.height || 0),
                  label: h.label || undefined,
                }));
              }

              allQuestionsPool.set(qId, baseQ);
              if (exId) {
                const list = questionsByExam.get(exId) || [];
                list.push(baseQ);
                questionsByExam.set(exId, list);
              }
            }
          }

          // Build final exam list
          const remoteExams = examsRows.map((row: any) => {
            const parsed = normalizeExam(row);
            let examQuestions = questionsByExam.get(parsed.id) || [];

            if (examQuestions.length === 0 && parsed.questionIds && parsed.questionIds.length > 0) {
              const resolved: ExamQuestion[] = [];
              for (const qid of parsed.questionIds) {
                const pooled = allQuestionsPool.get(qid);
                if (pooled) {
                  resolved.push(pooled);
                  continue;
                }
                const localExam = localExams.find((e) => e.id === parsed.id);
                const fromLocal = localExam?.questions?.find((q) => q.id === qid);
                if (fromLocal) resolved.push(fromLocal);
              }
              if (resolved.length > 0) examQuestions = resolved;
            }

            if (examQuestions.length > 0) {
              return {
                ...parsed,
                questions: examQuestions,
                totalQuestions: examQuestions.length,
                questionIds: parsed.questionIds && parsed.questionIds.length > 0 ? parsed.questionIds : examQuestions.map((q) => q.id),
              };
            }

            const localMatch = localExams.find((l) => l.id === parsed.id);
            if (localMatch?.questions && localMatch.questions.length > 0) {
              return {
                ...parsed,
                questions: localMatch.questions,
                totalQuestions: localMatch.questions.length,
                questionIds: parsed.questionIds && parsed.questionIds.length > 0 ? parsed.questionIds : localMatch.questions.map((q) => q.id),
              };
            }

            return parsed;
          });

          const remoteIds = new Set(remoteExams.map((e) => e.id));
          const pendingLocal = localExams.filter((e) => !remoteIds.has(e.id));
          localExams = sortByCreatedAt([...remoteExams, ...pendingLocal]);
          notifyExams();
        }
      } catch (err) {
        console.warn('subscribeExams fetch error:', err);
      }
    };

    fetchExams();
    const timer = setInterval(fetchExams, 6000);
    return () => {
      examListeners.delete(onUpdate);
      clearInterval(timer);
    };
  }

  return () => {
    examListeners.delete(onUpdate);
  };
}

export function subscribeSubmissions(onUpdate: (submissions: ExamSubmission[]) => void) {
  submissionListeners.add(onUpdate);
  onUpdate([...localSubmissions]);

  if (isConfigured) {
    const fetchSubmissions = async () => {
      try {
        const rows = await tursoQuery(`SELECT * FROM ${SUBMISSIONS_TABLE} ORDER BY submittedAt DESC`);
        if (Array.isArray(rows)) {
          localSubmissions = sortBySubmittedAt(rows.map(normalizeSubmission));
          notifySubmissions();
        }
      } catch (err) {
        console.warn('fetchSubmissions error:', err);
      }
    };

    fetchSubmissions();
    const timer = setInterval(fetchSubmissions, 6000);
    return () => {
      submissionListeners.delete(onUpdate);
      clearInterval(timer);
    };
  }

  return () => {
    submissionListeners.delete(onUpdate);
  };
}

export function subscribeQuestionBank(onUpdate: (questions: ExamQuestion[]) => void) {
  questionBankListeners.add(onUpdate);
  onUpdate([...localQuestionBank]);

  if (isConfigured) {
    const fetchBank = async () => {
      try {
        const rows = await tursoQuery(`SELECT * FROM ${QUESTION_BANK_TABLE} ORDER BY updatedAt DESC`);
        if (Array.isArray(rows)) {
          const remoteBank = rows.map(normalizeQuestionBankRow);
          const bankMap = new Map<string, ExamQuestion>();
          remoteBank.forEach((q) => bankMap.set(q.id, q));
          localQuestionBank.forEach((q) => {
            if (!bankMap.has(q.id)) bankMap.set(q.id, q);
          });
          localQuestionBank = Array.from(bankMap.values());
          saveLocalData(STORAGE_KEYS.questionBank, localQuestionBank);
          notifyQuestionBank();
        }
      } catch (err) {
        console.warn('fetchQuestionBank error:', err);
      }
    };

    fetchBank();
    const timer = setInterval(fetchBank, 8000);
    return () => {
      questionBankListeners.delete(onUpdate);
      clearInterval(timer);
    };
  }

  return () => {
    questionBankListeners.delete(onUpdate);
  };
}

export function getQuestionBank(): ExamQuestion[] {
  return [...localQuestionBank];
}

export async function saveQuestionsToBank(
  questions: ExamQuestion[],
  meta?: {
    sourceExamId?: string;
    sourceExamTitle?: string;
    subject?: string;
    grade?: string;
    creatorId?: string;
    creatorName?: string;
  }
): Promise<void> {
  if (!questions || questions.length === 0) return;
  const now = new Date().toISOString();

  // Tự động tải ảnh Base64 lên GitHub Repository và đổi sang GitHub Raw URL
  let processedQuestions = questions;
  try {
    const storageRes = await processQuestionsImagesForStorage(questions);
    processedQuestions = storageRes.questions;
  } catch (storageErr) {
    console.warn('[GitHub Storage] Lỗi xử lý ảnh ngân hàng câu hỏi:', storageErr);
  }

  const bankMap = new Map<string, ExamQuestion>();
  localQuestionBank.forEach((q) => bankMap.set(q.id, q));

  const questionsToSave: ExamQuestion[] = [];
  for (const q of processedQuestions) {
    if (!q || !q.title) continue;
    const enriched: ExamQuestion = {
      ...q,
      sourceExamId: meta?.sourceExamId || q.sourceExamId,
      sourceExamTitle: meta?.sourceExamTitle || q.sourceExamTitle,
      subject: meta?.subject || q.subject || 'Công nghệ Thông tin',
      grade: meta?.grade || q.grade || 'Khối 12',
      creatorId: meta?.creatorId || q.creatorId,
      creatorName: meta?.creatorName || q.creatorName,
      createdAt: q.createdAt || now,
      updatedAt: now,
    };
    bankMap.set(enriched.id, enriched);
    questionsToSave.push(enriched);
  }

  localQuestionBank = Array.from(bankMap.values());
  saveLocalData(STORAGE_KEYS.questionBank, localQuestionBank);
  notifyQuestionBank();

  if (isConfigured && questionsToSave.length > 0) {
    try {
      const rows = questionsToSave.map((q) => ({
        id: q.id,
        type: q.type || 'single_choice',
        title: q.title,
        mediaType: q.mediaType || 'none',
        mediaUrl: q.mediaUrl || null,
        explanation: q.explanation || null,
        options: JSON.stringify(q.options || []),
        correctOptionId: q.correctOptionId || null,
        correctOptionIds: JSON.stringify(q.correctOptionIds || []),
        matchingPairs: JSON.stringify(q.matchingPairs || []),
        shuffledRightPairs: JSON.stringify(q.shuffledRightPairs || []),
        orderingItems: JSON.stringify(q.orderingItems || []),
        trueLabel: q.trueLabel || 'Đúng',
        falseLabel: q.falseLabel || 'Sai',
        tfStatements: JSON.stringify(q.tfStatements || []),
        shuffledTfColumns: JSON.stringify(q.shuffledTfColumns || []),
        hotspotImageUrl: q.hotspotImageUrl || null,
        hotspotRegions: JSON.stringify(q.hotspotRegions || []),
        fillBlankTemplate: q.fillBlankTemplate || null,
        fillBlankItems: JSON.stringify(q.fillBlankItems || []),
        sourceExamId: q.sourceExamId || null,
        sourceExamTitle: q.sourceExamTitle || null,
        subject: q.subject || 'Công nghệ Thông tin',
        grade: q.grade || 'Khối 12',
        creatorId: q.creatorId || null,
        creatorName: q.creatorName || null,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      }));

      await safeDbUpsert(QUESTION_BANK_TABLE, rows);
    } catch (err) {
      console.warn('saveQuestionsToBank error:', err);
    }
  }
}

export async function deleteQuestionFromBank(id: string): Promise<void> {
  localQuestionBank = localQuestionBank.filter((q) => q.id !== id);
  saveLocalData(STORAGE_KEYS.questionBank, localQuestionBank);
  notifyQuestionBank();

  if (isConfigured) {
    try {
      await tursoExecute(`DELETE FROM "${QUESTION_BANK_TABLE}" WHERE id = ?`, [id]);
    } catch (err) {
      console.warn('deleteQuestionFromBank error:', err);
    }
  }
}

/**
 * Thủ công làm mới toàn bộ dữ liệu từ máy chủ Turso
 */
export async function refreshAllDataFromSupabase(): Promise<{
  success: boolean;
  message?: string;
  count?: {
    exams: number;
    students: number;
    classes: number;
    schools: number;
    users: number;
    submissions: number;
  };
  schoolsCount: number;
  classesCount: number;
  studentsCount: number;
  usersCount: number;
  examsCount: number;
  submissionsCount: number;
}> {
  if (!isConfigured) {
    return {
      success: false,
      schoolsCount: localSchools.length,
      classesCount: localClasses.length,
      studentsCount: localStudents.length,
      usersCount: localUsers.length,
      examsCount: localExams.length,
      submissionsCount: localSubmissions.length,
    };
  }

  try {
    const [schools, classes, students, users, exams, submissions] = await Promise.all([
      tursoQuery(`SELECT * FROM ${SCHOOLS_TABLE} ORDER BY createdAt DESC`),
      tursoQuery(`SELECT * FROM ${CLASSES_TABLE} ORDER BY createdAt DESC`),
      tursoQuery(`SELECT * FROM ${STUDENTS_TABLE} ORDER BY createdAt DESC`),
      tursoQuery(`SELECT * FROM ${USERS_TABLE} ORDER BY createdAt DESC`),
      tursoQuery(`SELECT * FROM ${EXAMS_TABLE} ORDER BY createdAt DESC`),
      tursoQuery(`SELECT * FROM ${SUBMISSIONS_TABLE} ORDER BY submittedAt DESC`),
    ]);

    if (Array.isArray(schools)) {
      localSchools = sortByCreatedAt(schools.map(normalizeSchool));
      notifySchools();
    }
    if (Array.isArray(classes)) {
      localClasses = sortByCreatedAt(classes.map(normalizeClass));
      notifyClasses();
    }
    if (Array.isArray(students)) {
      localStudents = sortByCreatedAt(students.map(normalizeStudent));
      notifyStudents();
    }
    if (Array.isArray(users)) {
      localUsers = sortByCreatedAt(users.map(normalizeUser));
      notifyUsers();
    }
    if (Array.isArray(exams)) {
      localExams = sortByCreatedAt(exams.map(normalizeExam));
      notifyExams();
    }
    if (Array.isArray(submissions)) {
      localSubmissions = sortBySubmittedAt(submissions.map(normalizeSubmission));
      notifySubmissions();
    }

    return {
      success: true,
      count: {
        exams: localExams.length,
        students: localStudents.length,
        classes: localClasses.length,
        schools: localSchools.length,
        users: localUsers.length,
        submissions: localSubmissions.length,
      },
      message: 'Đã đồng bộ thành công dữ liệu từ máy chủ Turso!',
      schoolsCount: localSchools.length,
      classesCount: localClasses.length,
      studentsCount: localStudents.length,
      usersCount: localUsers.length,
      examsCount: localExams.length,
      submissionsCount: localSubmissions.length,
    };
  } catch (err) {
    console.error('refreshAllDataFromTurso error:', err);
    return {
      success: false,
      count: {
        exams: localExams.length,
        students: localStudents.length,
        classes: localClasses.length,
        schools: localSchools.length,
        users: localUsers.length,
        submissions: localSubmissions.length,
      },
      message: 'Không thể kết nối tới máy chủ Turso.',
      schoolsCount: localSchools.length,
      classesCount: localClasses.length,
      studentsCount: localStudents.length,
      usersCount: localUsers.length,
      examsCount: localExams.length,
      submissionsCount: localSubmissions.length,
    };
  }
}

export const refreshAllDataFromTurso = refreshAllDataFromSupabase;

// ================= CRUD: SCHOOLS =================

export async function addSchool(data: Omit<School, 'id' | 'createdAt' | 'updatedAt'>, _actorUsername?: string): Promise<School | undefined> {
  const now = new Date().toISOString();
  const newSchool: School = {
    ...data,
    id: `sch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  localSchools = sortByCreatedAt([newSchool, ...localSchools]);
  notifySchools();

  if (isConfigured) {
    await safeDbUpsert(SCHOOLS_TABLE, newSchool);
  }
  return newSchool;
}

export async function updateSchool(id: string, data: Partial<School>, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();
  localSchools = localSchools.map((s) => (s.id === id ? { ...s, ...data, updatedAt: now } : s));
  notifySchools();

  if (isConfigured) {
    await safeDbUpdate(SCHOOLS_TABLE, { ...data, updatedAt: now }, 'id', id);
  }
}

export async function deleteSchool(id: string, _schoolName?: string, _actorUsername?: string): Promise<void> {
  localSchools = localSchools.filter((s) => s.id !== id);
  notifySchools();

  if (isConfigured) {
    await tursoExecute(`DELETE FROM "${SCHOOLS_TABLE}" WHERE id = ?`, [id]);
  }
}

// ================= CRUD: CLASSES =================

export async function addClass(data: Omit<SchoolClass, 'id' | 'createdAt' | 'updatedAt'>, _actorUsername?: string): Promise<SchoolClass | undefined> {
  const now = new Date().toISOString();
  const newClass: SchoolClass = {
    ...data,
    id: `cls_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  localClasses = sortByCreatedAt([newClass, ...localClasses]);
  notifyClasses();

  if (isConfigured) {
    await safeDbUpsert(CLASSES_TABLE, newClass);
  }
  return newClass;
}

export async function updateClass(id: string, data: Partial<SchoolClass>, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();
  localClasses = localClasses.map((c) => (c.id === id ? { ...c, ...data, updatedAt: now } : c));
  notifyClasses();

  if (isConfigured) {
    await safeDbUpdate(CLASSES_TABLE, { ...data, updatedAt: now }, 'id', id);
  }
}

export async function deleteClass(id: string, _className?: string, _actorUsername?: string): Promise<void> {
  localClasses = localClasses.filter((c) => c.id !== id);
  notifyClasses();

  if (isConfigured) {
    await tursoExecute(`DELETE FROM "${CLASSES_TABLE}" WHERE id = ?`, [id]);
  }
}

// ================= CRUD: STUDENTS =================

export async function addStudent(data: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>, _actorUsername?: string): Promise<Student | undefined> {
  const now = new Date().toISOString();
  const newStudent: Student = {
    ...data,
    id: `stu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  localStudents = sortByCreatedAt([newStudent, ...localStudents]);
  notifyStudents();

  if (isConfigured) {
    await safeDbUpsert(STUDENTS_TABLE, newStudent);
  }
  return newStudent;
}

export async function updateStudent(id: string, data: Partial<Student>, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();
  localStudents = localStudents.map((s) => (s.id === id ? { ...s, ...data, updatedAt: now } : s));
  notifyStudents();

  if (isConfigured) {
    await safeDbUpdate(STUDENTS_TABLE, { ...data, updatedAt: now }, 'id', id);
  }
}

export async function deleteStudent(id: string, _studentName?: string, _actorUsername?: string): Promise<void> {
  localStudents = localStudents.filter((s) => s.id !== id);
  notifyStudents();

  if (isConfigured) {
    await tursoExecute(`DELETE FROM "${STUDENTS_TABLE}" WHERE id = ?`, [id]);
  }
}

export async function deleteMultipleStudents(ids: string[], _actorUsername?: string): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  localStudents = localStudents.filter((s) => !idSet.has(s.id));
  notifyStudents();

  if (isConfigured) {
    const placeholders = ids.map(() => '?').join(', ');
    await tursoExecute(`DELETE FROM "${STUDENTS_TABLE}" WHERE id IN (${placeholders})`, ids);
  }
}

export async function toggleStudentStatus(id: string, currentStatus: Student['status'], _actorUsername?: string): Promise<Student['status']> {
  const newStatus: Student['status'] = currentStatus === 'active' ? 'suspended' : 'active';
  await updateStudent(id, { status: newStatus });
  return newStatus;
}

export async function updateStudentUsername(id: string, newUsername: string, _actorUsername?: string): Promise<void> {
  await updateStudent(id, { username: newUsername.trim() });
}

export async function moveStudentsToClass(
  studentIds: string[],
  targetClassId: string,
  targetSchoolId?: string,
  _actorUsername?: string
): Promise<number> {
  if (studentIds.length === 0) return 0;
  const now = new Date().toISOString();
  const idSet = new Set(studentIds);
  localStudents = localStudents.map((s) =>
    idSet.has(s.id)
      ? { ...s, classId: targetClassId, ...(targetSchoolId ? { schoolId: targetSchoolId } : {}), updatedAt: now }
      : s
  );
  notifyStudents();

  if (isConfigured) {
    const placeholders = studentIds.map(() => '?').join(', ');
    if (targetSchoolId) {
      await tursoExecute(
        `UPDATE "${STUDENTS_TABLE}" SET classId = ?, schoolId = ?, updatedAt = ? WHERE id IN (${placeholders})`,
        [targetClassId, targetSchoolId, now, ...studentIds]
      );
    } else {
      await tursoExecute(
        `UPDATE "${STUDENTS_TABLE}" SET classId = ?, updatedAt = ? WHERE id IN (${placeholders})`,
        [targetClassId, now, ...studentIds]
      );
    }
  }
  return studentIds.length;
}

export async function batchAddStudents(
  students: Array<Omit<Student, 'id' | 'createdAt' | 'updatedAt'>>,
  _actorUsername?: string
): Promise<number> {
  if (students.length === 0) return 0;
  const now = new Date().toISOString();
  const newStudents: Student[] = students.map((s, idx) => ({
    ...s,
    id: `stu_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    updatedAt: now,
  }));

  localStudents = sortByCreatedAt([...newStudents, ...localStudents]);
  notifyStudents();

  if (isConfigured) {
    await safeDbUpsert(STUDENTS_TABLE, newStudents);
  }
  return newStudents.length;
}

// ================= CRUD: USERS =================

export async function addUserAccount(
  data: Omit<UserAccount, 'id' | 'createdAt' | 'updatedAt'>,
  _actorUsername?: string
): Promise<UserAccount | undefined> {
  const now = new Date().toISOString();
  const newUser: UserAccount = {
    ...data,
    id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  localUsers = sortByCreatedAt([newUser, ...localUsers]);
  notifyUsers();

  if (isConfigured) {
    await safeDbUpsert(USERS_TABLE, newUser);
  }
  return newUser;
}

export async function updateUserAccount(id: string, data: Partial<UserAccount>, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();
  localUsers = localUsers.map((u) => (u.id === id ? { ...u, ...data, updatedAt: now } : u));
  notifyUsers();

  if (isConfigured) {
    await safeDbUpdate(USERS_TABLE, { ...data, updatedAt: now }, 'id', id);
  }
}

export async function deleteUserAccount(id: string, _username?: string, _actorUsername?: string): Promise<void> {
  localUsers = localUsers.filter((u) => u.id !== id);
  notifyUsers();

  if (isConfigured) {
    await tursoExecute(`DELETE FROM "${USERS_TABLE}" WHERE id = ?`, [id]);
  }
}

export async function assignTeacherSchoolAndClasses(
  teacherId: string,
  schoolId: string,
  classIds: string[],
  _actorUsername?: string
): Promise<void> {
  await updateUserAccount(teacherId, { schoolId, classIds });
}

// ================= CRUD: EXAMS =================

export async function addExam(data: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'>): Promise<Exam> {
  const now = new Date().toISOString();
  const examId = `exam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Tải toàn bộ ảnh Base64 lên GitHub Repository và đổi thành GitHub Raw URL
  let processedQuestions = data.questions || [];
  try {
    const storageRes = await processQuestionsImagesForStorage(processedQuestions);
    processedQuestions = storageRes.questions;
  } catch (storageErr) {
    console.warn('[GitHub Storage] Lỗi xử lý ảnh câu hỏi khi tạo đề:', storageErr);
  }

  const questionIds = processedQuestions.map((q) => q.id);

  const newExam: Exam = {
    ...data,
    id: examId,
    questions: processedQuestions,
    questionIds,
    totalQuestions: processedQuestions.length,
    createdAt: now,
    updatedAt: now,
  };

  localExams = sortByCreatedAt([newExam, ...localExams]);
  notifyExams();

  if (isConfigured) {
    // 1. Lưu bản ghi đề thi vào exams
    await safeDbUpsert(EXAMS_TABLE, newExam);

    // 2. Lưu chi tiết câu hỏi sang các bảng con
    if (processedQuestions.length > 0) {
      await saveExamQuestionsToMultiTables(examId, processedQuestions);
      // 3. Tự động lưu vào bảng question_bank để đọc ngân hàng câu hỏi
      await saveQuestionsToBank(processedQuestions, {
        sourceExamId: examId,
        sourceExamTitle: newExam.title,
        subject: newExam.subject,
        grade: newExam.grade,
        creatorId: newExam.creatorId,
        creatorName: newExam.creatorName,
      });
    }
  }

  return newExam;
}

export async function updateExam(id: string, data: Partial<Exam>): Promise<void> {
  const now = new Date().toISOString();

  let processedQuestions = data.questions;
  if (processedQuestions && processedQuestions.length > 0) {
    try {
      const storageRes = await processQuestionsImagesForStorage(processedQuestions);
      processedQuestions = storageRes.questions;
    } catch (storageErr) {
      console.warn('[GitHub Storage] Lỗi xử lý ảnh câu hỏi khi cập nhật đề:', storageErr);
    }
  }

  const updatedPayload: Partial<Exam> = {
    ...data,
    updatedAt: now,
  };

  if (processedQuestions) {
    updatedPayload.questions = processedQuestions;
    updatedPayload.questionIds = processedQuestions.map((q) => q.id);
    updatedPayload.totalQuestions = processedQuestions.length;
  }

  localExams = localExams.map((e) => (e.id === id ? { ...e, ...updatedPayload } : e));
  notifyExams();

  if (isConfigured) {
    await safeDbUpdate(EXAMS_TABLE, updatedPayload, 'id', id);
    if (processedQuestions && processedQuestions.length > 0) {
      await saveExamQuestionsToMultiTables(id, processedQuestions);
      // Đồng thời cập nhật vào question_bank
      await saveQuestionsToBank(processedQuestions, {
        sourceExamId: id,
        sourceExamTitle: updatedPayload.title || data.title,
        subject: updatedPayload.subject || data.subject,
        grade: updatedPayload.grade || data.grade,
        creatorId: updatedPayload.creatorId || data.creatorId,
        creatorName: updatedPayload.creatorName || data.creatorName,
      });
    }
  }
}

export async function deleteExam(id: string): Promise<void> {
  localExams = localExams.filter((e) => e.id !== id);
  notifyExams();

  if (isConfigured) {
    try {
      // Yêu cầu: Khi giáo viên xóa đề thi KHÔNG xóa chi tiết câu hỏi và ngân hàng câu hỏi.
      // Chỉ xóa bản ghi đề thi trong bảng exams:
      await tursoExecute(`DELETE FROM "${EXAMS_TABLE}" WHERE id = ?`, [id]);
    } catch (err) {
      console.warn('deleteExam error:', err);
    }
  }
}

export async function deleteMultipleExams(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  localExams = localExams.filter((e) => !idSet.has(e.id));
  notifyExams();

  if (isConfigured) {
    try {
      const placeholders = ids.map(() => '?').join(', ');
      // Yêu cầu: Khi giáo viên xóa đề thi KHÔNG xóa chi tiết câu hỏi và ngân hàng câu hỏi.
      // Chỉ xóa bản ghi đề thi trong bảng exams:
      await tursoExecute(`DELETE FROM "${EXAMS_TABLE}" WHERE id IN (${placeholders})`, ids);
    } catch (err) {
      console.warn('deleteMultipleExams error:', err);
    }
  }
  return ids.length;
}

/**
 * Cho phép Admin xóa hoàn toàn câu hỏi khỏi database (exam_questions, question_bank và các bảng con)
 */
export async function deleteQuestionFromDatabase(questionId: string): Promise<boolean> {
  if (!questionId) return false;

  // 1. Cập nhật local question bank
  localQuestionBank = localQuestionBank.filter((q) => q.id !== questionId);
  saveLocalData(STORAGE_KEYS.questionBank, localQuestionBank);
  notifyQuestionBank();

  // 2. Cập nhật trong localExams nếu câu hỏi thuộc đề nào đó
  localExams = localExams.map((exam) => {
    if (exam.questions && exam.questions.some((q) => q.id === questionId)) {
      const newQuestions = exam.questions.filter((q) => q.id !== questionId);
      return {
        ...exam,
        questions: newQuestions,
        questionIds: newQuestions.map((q) => q.id),
        totalQuestions: newQuestions.length,
      };
    }
    return exam;
  });
  notifyExams();

  // 3. Xóa trên máy chủ Turso
  if (isConfigured) {
    try {
      await tursoBatch([
        { sql: `DELETE FROM "${QUESTION_OPTIONS_TABLE}" WHERE questionId = ? OR id LIKE ?`, args: [questionId, `${questionId}_%`] },
        { sql: `DELETE FROM "${QUESTION_MATCHING_PAIRS_TABLE}" WHERE questionId = ? OR id LIKE ?`, args: [questionId, `${questionId}_%`] },
        { sql: `DELETE FROM "${QUESTION_ORDERING_ITEMS_TABLE}" WHERE questionId = ? OR id LIKE ?`, args: [questionId, `${questionId}_%`] },
        { sql: `DELETE FROM "${QUESTION_TF_STATEMENTS_TABLE}" WHERE questionId = ? OR id LIKE ?`, args: [questionId, `${questionId}_%`] },
        { sql: `DELETE FROM "${QUESTION_FILL_BLANK_ITEMS_TABLE}" WHERE questionId = ? OR id LIKE ?`, args: [questionId, `${questionId}_%`] },
        { sql: `DELETE FROM "${QUESTION_HOTSPOTS_TABLE}" WHERE questionId = ? OR id LIKE ?`, args: [questionId, `${questionId}_%`] },
        { sql: `DELETE FROM "${EXAM_QUESTIONS_TABLE}" WHERE id = ?`, args: [questionId] },
        { sql: `DELETE FROM "${QUESTION_BANK_TABLE}" WHERE id = ?`, args: [questionId] },
      ]);
    } catch (err) {
      console.warn('deleteQuestionFromDatabase error:', err);
    }
  }

  return true;
}

/**
 * Cho phép Admin xóa hàng loạt câu hỏi khỏi database
 */
export async function bulkDeleteQuestionsFromDatabase(questionIds: string[]): Promise<number> {
  if (!questionIds || questionIds.length === 0) return 0;

  const idSet = new Set(questionIds);

  // 1. Cập nhật local question bank
  localQuestionBank = localQuestionBank.filter((q) => !idSet.has(q.id));
  saveLocalData(STORAGE_KEYS.questionBank, localQuestionBank);
  notifyQuestionBank();

  // 2. Cập nhật trong localExams
  localExams = localExams.map((exam) => {
    if (exam.questions && exam.questions.some((q) => idSet.has(q.id))) {
      const newQuestions = exam.questions.filter((q) => !idSet.has(q.id));
      return {
        ...exam,
        questions: newQuestions,
        questionIds: newQuestions.map((q) => q.id),
        totalQuestions: newQuestions.length,
      };
    }
    return exam;
  });
  notifyExams();

  // 3. Xóa trên máy chủ Turso
  if (isConfigured) {
    try {
      const placeholders = questionIds.map(() => '?').join(', ');
      await tursoBatch([
        { sql: `DELETE FROM "${QUESTION_OPTIONS_TABLE}" WHERE questionId IN (${placeholders})`, args: questionIds },
        { sql: `DELETE FROM "${QUESTION_MATCHING_PAIRS_TABLE}" WHERE questionId IN (${placeholders})`, args: questionIds },
        { sql: `DELETE FROM "${QUESTION_ORDERING_ITEMS_TABLE}" WHERE questionId IN (${placeholders})`, args: questionIds },
        { sql: `DELETE FROM "${QUESTION_TF_STATEMENTS_TABLE}" WHERE questionId IN (${placeholders})`, args: questionIds },
        { sql: `DELETE FROM "${QUESTION_FILL_BLANK_ITEMS_TABLE}" WHERE questionId IN (${placeholders})`, args: questionIds },
        { sql: `DELETE FROM "${QUESTION_HOTSPOTS_TABLE}" WHERE questionId IN (${placeholders})`, args: questionIds },
        { sql: `DELETE FROM "${EXAM_QUESTIONS_TABLE}" WHERE id IN (${placeholders})`, args: questionIds },
        { sql: `DELETE FROM "${QUESTION_BANK_TABLE}" WHERE id IN (${placeholders})`, args: questionIds },
      ]);
    } catch (err) {
      console.warn('bulkDeleteQuestionsFromDatabase error:', err);
    }
  }

  return questionIds.length;
}

export async function mergeExams(
  sourceExamsOrIds: Exam[] | string[],
  newTitle: string,
  durationOrCreator?: number | UserAccount,
  creatorId?: string,
  creatorName?: string,
  classIds?: string[],
  isPracticeTest?: boolean,
  practiceRandomCount?: number
): Promise<Exam> {
  const sourceExams: Exam[] =
    Array.isArray(sourceExamsOrIds) && sourceExamsOrIds.length > 0 && typeof sourceExamsOrIds[0] === 'object'
      ? (sourceExamsOrIds as Exam[])
      : localExams.filter((e) => (sourceExamsOrIds as string[]).includes(e.id));

  const mergedQuestions: ExamQuestion[] = [];
  const seenQTitles = new Set<string>();

  for (const ex of sourceExams) {
    if (ex.questions) {
      for (const q of ex.questions) {
        if (!seenQTitles.has(q.title)) {
          seenQTitles.add(q.title);
          mergedQuestions.push({
            ...q,
            id: `q_merged_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          });
        }
      }
    }
  }

  const allClassIds =
    classIds && classIds.length > 0
      ? classIds
      : Array.from(new Set(sourceExams.flatMap((e) => e.classIds || [])));

  const primarySubject = sourceExams[0]?.subject || 'Công nghệ Thông tin';
  const primaryGrade = sourceExams[0]?.grade || 'Khối 12';

  let actualDuration = 45;
  let actualCreatorId = creatorId || '';
  let actualCreatorName = creatorName || '';

  if (typeof durationOrCreator === 'number') {
    actualDuration = durationOrCreator;
  } else if (durationOrCreator && typeof durationOrCreator === 'object') {
    actualCreatorId = durationOrCreator.id;
    actualCreatorName = durationOrCreator.fullName || durationOrCreator.username;
  }

  return await addExam({
    title: newTitle,
    description: `Đề thi tổng hợp từ ${sourceExams.length} đề thi khác nhau.`,
    subject: primarySubject,
    grade: primaryGrade,
    creatorId: actualCreatorId,
    creatorName: actualCreatorName,
    classIds: allClassIds,
    durationMinutes: actualDuration,
    totalScore: 1000,
    passingScore: 950,
    status: 'published',
    allowReviewAnswers: true,
    isPracticeTest: Boolean(isPracticeTest),
    practiceRandomCount: practiceRandomCount || 0,
    questions: mergedQuestions,
  });
}

// ================= CRUD: SUBMISSIONS =================

export async function addExamSubmission(data: Omit<ExamSubmission, 'id'>): Promise<ExamSubmission> {
  const newSubmission: ExamSubmission = {
    ...data,
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };

  localSubmissions = sortBySubmittedAt([newSubmission, ...localSubmissions]);
  notifySubmissions();

  if (isConfigured) {
    await safeDbUpsert(SUBMISSIONS_TABLE, newSubmission);
  }
  return newSubmission;
}

export async function deleteExamSubmission(id: string): Promise<void> {
  localSubmissions = localSubmissions.filter((s) => s.id !== id);
  notifySubmissions();

  if (isConfigured) {
    await tursoExecute(`DELETE FROM "${SUBMISSIONS_TABLE}" WHERE id = ?`, [id]);
  }
}

export async function deleteMultipleExamSubmissions(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  localSubmissions = localSubmissions.filter((s) => !idSet.has(s.id));
  notifySubmissions();

  if (isConfigured) {
    const placeholders = ids.map(() => '?').join(', ');
    await tursoExecute(`DELETE FROM "${SUBMISSIONS_TABLE}" WHERE id IN (${placeholders})`, ids);
  }
  return ids.length;
}

export async function deleteStudentSubmissions(
  studentId: string,
  examIdOrSubmissions?: string | ExamSubmission[]
): Promise<number> {
  const specificExamId = typeof examIdOrSubmissions === 'string' ? examIdOrSubmissions : undefined;
  
  const targetCount = localSubmissions.filter(
    (s) => s.studentId === studentId && (!specificExamId || s.examId === specificExamId)
  ).length;

  localSubmissions = localSubmissions.filter(
    (s) => s.studentId !== studentId || (specificExamId && s.examId !== specificExamId)
  );
  notifySubmissions();

  if (isConfigured) {
    if (specificExamId) {
      await tursoExecute(`DELETE FROM "${SUBMISSIONS_TABLE}" WHERE studentId = ? AND examId = ?`, [studentId, specificExamId]);
    } else {
      await tursoExecute(`DELETE FROM "${SUBMISSIONS_TABLE}" WHERE studentId = ?`, [studentId]);
    }
  }

  return targetCount;
}

export async function purgePracticeSubmissions(): Promise<number> {
  const count = localSubmissions.filter((s) => s.isPractice).length;
  localSubmissions = localSubmissions.filter((s) => !s.isPractice);
  notifySubmissions();

  if (isConfigured) {
    await tursoExecute(`DELETE FROM "${SUBMISSIONS_TABLE}" WHERE isPractice = 1`);
  }
  return count;
}

export async function purgeOldSubmissions(daysOld: number): Promise<number> {
  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const count = localSubmissions.filter((s) => new Date(s.submittedAt).getTime() < cutoffTime).length;
  localSubmissions = localSubmissions.filter((s) => new Date(s.submittedAt).getTime() >= cutoffTime);
  notifySubmissions();

  if (isConfigured) {
    const cutoffDateStr = new Date(cutoffTime).toISOString();
    await tursoExecute(`DELETE FROM "${SUBMISSIONS_TABLE}" WHERE submittedAt < ?`, [cutoffDateStr]);
  }
  return count;
}

export function optimizeExistingSubmissionsStorage(): number {
  let modified = 0;
  localSubmissions = localSubmissions.map((s) => {
    if (s.questionsSnapshot && s.questionsSnapshot.length > 0) {
      modified++;
      const { questionsSnapshot, ...rest } = s;
      return rest as ExamSubmission;
    }
    return s;
  });
  if (modified > 0) notifySubmissions();
  return modified;
}

export function exportSubmissionsArchive(submissionsList: ExamSubmission[]): void {
  const jsonStr = JSON.stringify(submissionsList, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `thientch_submissions_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ================= BASE64 IMAGE STATS & MIGRATION TO GITHUB =================

export function countRemainingBase64Images(): {
  totalBase64: number;
  examsWithBase64: number;
  bankBase64: number;
} {
  let totalBase64 = 0;
  let examsWithBase64 = 0;
  let bankBase64 = 0;

  const countQ = (q: ExamQuestion): number => {
    let c = 0;
    if (q.mediaUrl?.startsWith('data:image/')) c++;
    if (q.hotspotImageUrl?.startsWith('data:image/')) c++;
    if (q.options?.some((opt) => opt.imageUrl?.startsWith('data:image/'))) c++;
    if (q.matchingPairs?.some((p) => p.leftImageUrl?.startsWith('data:image/') || p.rightImageUrl?.startsWith('data:image/'))) c++;
    if (q.orderingItems?.some((o) => o.imageUrl?.startsWith('data:image/'))) c++;
    return c;
  };

  localExams.forEach((e) => {
    let countInExam = 0;
    e.questions?.forEach((q) => {
      countInExam += countQ(q);
    });
    if (countInExam > 0) {
      examsWithBase64++;
      totalBase64 += countInExam;
    }
  });

  localQuestionBank.forEach((q) => {
    const c = countQ(q);
    if (c > 0) {
      bankBase64 += c;
      totalBase64 += c;
    }
  });

  return { totalBase64, examsWithBase64, bankBase64 };
}

/**
 * Chuyển đổi toàn bộ hình ảnh Base64 hiện có trong đề thi và ngân hàng câu hỏi lên GitHub Repository
 * và cập nhật lại Raw URL trong cơ sở dữ liệu Turso
 */
export async function migrateAllExistingImagesToStorage(
  onProgress?: (msg: string) => void
): Promise<{
  totalUploaded: number;
  examsUpdated: number;
  bankUpdated: number;
}> {
  let totalUploaded = 0;
  let examsUpdated = 0;
  let bankUpdated = 0;

  onProgress?.('Đang rà soát và tải ảnh từ Đề thi lên GitHub Repository...');

  // 1. Quét từng đề thi
  for (let i = 0; i < localExams.length; i++) {
    const ex = localExams[i];
    if (ex.questions && ex.questions.length > 0) {
      onProgress?.(`Đang xử lý đề thi ${i + 1}/${localExams.length}: "${ex.title}"...`);
      const { questions: processedQ, uploadedCount } = await processQuestionsImagesForStorage(ex.questions);
      if (uploadedCount > 0) {
        totalUploaded += uploadedCount;
        examsUpdated++;
        await updateExam(ex.id, { questions: processedQ });
      }
    }
  }

  // 2. Quét ngân hàng câu hỏi
  if (localQuestionBank.length > 0) {
    onProgress?.(`Đang rà soát ${localQuestionBank.length} câu hỏi trong Ngân hàng...`);
    const { questions: processedBankQ, uploadedCount } = await processQuestionsImagesForStorage(localQuestionBank);
    if (uploadedCount > 0) {
      totalUploaded += uploadedCount;
      bankUpdated = processedBankQ.length;
      localQuestionBank = processedBankQ;
      saveLocalData(STORAGE_KEYS.questionBank, localQuestionBank);
      notifyQuestionBank();
      await saveQuestionsToBank(processedBankQ);
    }
  }

  onProgress?.(`Hoàn tất! Đã chuyển đổi ${totalUploaded} hình ảnh lên GitHub Repository (Raw URL).`);
  return { totalUploaded, examsUpdated, bankUpdated };
}

// ================= SEED INITIAL DATA =================

export async function seedInitialDataIfNeeded(existingUsers: UserAccount[], existingSchools: School[]) {
  const now = new Date().toISOString();

  // Tự động khởi tạo schema SQLite trên Turso nếu đang online
  if (isConfigured) {
    try {
      await initTursoSchema();
    } catch {}
  }

  // 1. Ensure initial admin & teacher exist
  const currentUsers = existingUsers.length > 0 ? existingUsers : localUsers;
  const adminAccount = currentUsers.find(
    (u) => u.role === 'admin' || u.username.toLowerCase() === 'admin' || u.id === 'admin_root'
  );

  if (!adminAccount) {
    const adminUser: UserAccount = {
      id: 'admin_root',
      fullName: 'Quản trị viên Hệ thống (Thiện L.N)',
      username: 'admin',
      password: INITIAL_ADMIN_PASSWORD,
      email: 'admin@exam.edu.vn',
      phone: '0908 653 564',
      subjects: 'Quản trị Hệ thống Khảo thí',
      role: 'admin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const teacherUser: UserAccount = {
      id: 'teacher_01',
      fullName: 'ThS. Nguyễn Văn Hùng',
      username: 'gv_nguyenvana',
      password: 'Gv@123456',
      email: 'hung.nv@lehongphong.edu.vn',
      phone: '0912 345 678',
      subjects: 'Toán học & Tin học',
      role: 'teacher',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    localUsers = [adminUser, teacherUser, ...localUsers.filter((u) => u.id !== adminUser.id && u.id !== teacherUser.id)];
    notifyUsers();

    if (isConfigured) {
      await safeDbUpsert(USERS_TABLE, [adminUser, teacherUser]);
    }
  } else if (!adminAccount.password) {
    adminAccount.password = INITIAL_ADMIN_PASSWORD;
    localUsers = localUsers.map((u) => (u.id === adminAccount.id ? { ...u, password: INITIAL_ADMIN_PASSWORD } : u));
    notifyUsers();
    if (isConfigured) {
      await safeDbUpdate(USERS_TABLE, { password: INITIAL_ADMIN_PASSWORD }, 'id', adminAccount.id);
    }
  }

  // 2. Ensure initial school, classes, students and exams exist
  const currentSchools = existingSchools.length > 0 ? existingSchools : localSchools;
  if (currentSchools.length === 0) {
    const schoolId = 'sch_lhp_001';
    const initialSchool: School = {
      id: schoolId,
      code: 'THPT-LHP',
      name: 'Trường THPT Chuyên Lê Hồng Phong - TP.HCM',
      address: '235 Nguyễn Văn Cừ, Phường 4, Quận 5, TP. Hồ Chí Minh',
      phone: '028 3839 8506',
      email: 'contact@thpt-lehongphong.edu.vn',
      level: 'highschool',
      createdAt: now,
      updatedAt: now,
    };

    const class1Id = 'cls_12a1';
    const class1: SchoolClass = {
      id: class1Id,
      schoolId: schoolId,
      code: '12A1',
      name: 'Lớp 12A1 - Chuyên Toán & Khoa học Tự nhiên',
      grade: '12',
      schoolYear: '2025 - 2026',
      homeroomTeacher: 'ThS. Nguyễn Văn Hùng',
      room: 'Phòng A201',
      createdAt: now,
      updatedAt: now,
    };

    const class2Id = 'cls_11b2';
    const class2: SchoolClass = {
      id: class2Id,
      schoolId: schoolId,
      code: '11B2',
      name: 'Lớp 11B2 - Chuyên Anh ngữ Quốc tế',
      grade: '11',
      schoolYear: '2025 - 2026',
      homeroomTeacher: 'Cô Trần Mai Anh',
      room: 'Phòng B104',
      createdAt: now,
      updatedAt: now,
    };

    const student1: Student = {
      id: 'stu_120101',
      schoolId: schoolId,
      classId: class1Id,
      studentCode: 'HS120101',
      fullName: 'Trần Minh Khang',
      dateOfBirth: '2008-05-14',
      gender: 'male',
      username: 'HS1201',
      password: 'Hs@123456',
      status: 'active',
      note: 'Học sinh giỏi cấp Thành phố, SBD phòng thi số 01',
      createdAt: now,
      updatedAt: now,
    };

    const student2: Student = {
      id: 'stu_120102',
      schoolId: schoolId,
      classId: class1Id,
      studentCode: 'HS120102',
      fullName: 'Lê Phương Thảo',
      dateOfBirth: '2008-09-22',
      gender: 'female',
      username: 'HS1202',
      password: 'Hs@123456',
      status: 'active',
      note: 'Lớp phó học tập, SBD phòng thi số 02',
      createdAt: now,
      updatedAt: now,
    };

    const exam1Id = 'exam_sample_it_001';
    const sampleExam1: Exam = {
      id: exam1Id,
      title: 'Kiểm Tra Chuẩn Hóa Kiến Trúc Máy Tính & Lập Trình Cơ Bản',
      description: 'Đề thi trắc nghiệm chuẩn hóa 7 dạng câu hỏi: Chọn 1, chọn nhiều, ghép đôi, sắp xếp, đúng/sai, hotspot và điền chỗ trống.',
      subject: 'Công nghệ Thông tin',
      grade: 'Khối 12',
      creatorId: 'usr_teacher_01',
      creatorName: 'ThS. Nguyễn Văn Hùng',
      classIds: [class1Id, class2Id],
      durationMinutes: 45,
      totalScore: 1000,
      passingScore: 950,
      status: 'published',
      allowReviewAnswers: true,
      isPracticeTest: false,
      createdAt: now,
      updatedAt: now,
      questions: [
        {
          id: 'q1',
          type: 'single_choice',
          title: 'Trong kiến trúc máy tính Von Neumann, thành phần nào chịu trách nhiệm thực thi các phép toán số học và logic?',
          mediaType: 'none',
          explanation: 'Khối ALU (Arithmetic Logic Unit) nằm trong CPU đảm nhận thực hiện toàn bộ phép toán số học và phép toán logic.',
          options: [
            { id: 'opt_1', text: 'ALU (Arithmetic Logic Unit)' },
            { id: 'opt_2', text: 'Control Unit (Khối điều khiển)' },
            { id: 'opt_3', text: 'Registers (Thanh ghi)' },
            { id: 'opt_4', text: 'RAM (Bộ nhớ trong)' },
          ],
          correctOptionId: 'opt_1',
        },
        {
          id: 'q2',
          type: 'multiple_choice',
          title: 'Những cấu trúc dữ liệu nào sau đây thuộc nhóm cấu trúc dữ liệu tuyến tính (Linear Data Structures)?',
          mediaType: 'none',
          explanation: 'Mảng (Array), Danh sách liên kết (Linked List), Ngăn xếp (Stack) và Hàng đợi (Queue) là các cấu trúc dữ liệu tuyến tính.',
          options: [
            { id: 'opt_2_1', text: 'Stack (Ngăn xếp)' },
            { id: 'opt_2_2', text: 'Binary Tree (Cây nhị phân)' },
            { id: 'opt_2_3', text: 'Queue (Hàng đợi)' },
            { id: 'opt_2_4', text: 'Graph (Đồ thị)' },
          ],
          correctOptionIds: ['opt_2_1', 'opt_2_3'],
        },
        {
          id: 'q3',
          type: 'true_false',
          title: 'Hãy xác định tính Đúng/Sai của các phát biểu sau đây về cơ sở dữ liệu quan hệ (RDBMS) và SQLite:',
          mediaType: 'none',
          explanation: 'SQLite lưu trữ toàn bộ CSDL trong một file độc lập, không cần quy trình daemon server riêng.',
          trueLabel: 'Đúng',
          falseLabel: 'Sai',
          tfStatements: [
            { id: 'tf_1', statement: 'SQLite là hệ quản trị cơ sở dữ liệu serverless, không cần cài đặt tiến trình máy chủ riêng.', isTrue: true },
            { id: 'tf_2', statement: 'Khóa ngoại (Foreign Key) trong cơ sở dữ liệu không cần thiết lập chỉ mục (index).', isTrue: false },
            { id: 'tf_3', statement: 'Turso sử dụng libSQL fork từ SQLite và hỗ trợ sao lưu phân tán trên toàn cầu.', isTrue: true },
          ],
        },
        {
          id: 'q4',
          type: 'ordering',
          title: 'Hãy kéo thả và sắp xếp các bước trong quy trình biên dịch chương trình C/C++ theo đúng thứ tự thực thi:',
          mediaType: 'none',
          explanation: 'Thứ tự chuẩn của quá trình biên dịch là: Preprocessing -> Compilation -> Assembly -> Linking.',
          orderingItems: [
            { id: 'ord_1', text: '1. Tiền xử lý (Preprocessing - Xử lý các chỉ thị #include, #define)' },
            { id: 'ord_2', text: '2. Biên dịch (Compilation - Dịch mã nguồn sang mã Assembly)' },
            { id: 'ord_3', text: '3. Hợp dịch (Assembly - Dịch mã Assembly sang mã máy Object File)' },
            { id: 'ord_4', text: '4. Liên kết (Linking - Kết hợp các Object File và thư viện thành file thực thi)' },
          ],
        },
        {
          id: 'q5',
          type: 'matching',
          title: 'Hãy ghép nối mỗi giao thức mạng ở cột bên trái với cổng mặc định tương ứng ở cột bên phải:',
          mediaType: 'none',
          explanation: 'HTTP sử dụng port 80, HTTPS sử dụng port 443, SSH sử dụng port 22, DNS sử dụng port 53.',
          matchingPairs: [
            { id: 'pair_1', leftText: 'HTTP (Hypertext Transfer Protocol)', rightText: 'Cổng 80 (TCP)' },
            { id: 'pair_2', leftText: 'HTTPS (HTTP Secure)', rightText: 'Cổng 443 (TCP)' },
            { id: 'pair_3', leftText: 'SSH (Secure Shell)', rightText: 'Cổng 22 (TCP)' },
            { id: 'pair_4', leftText: 'DNS (Domain Name System)', rightText: 'Cổng 53 (UDP/TCP)' },
          ],
        },
        {
          id: 'q6',
          type: 'fill_blank',
          title: 'Hoàn thiện đoạn văn sau bằng cách chọn đáp án chính xác từ menu sổ xuống tại mỗi vị trí:',
          mediaType: 'none',
          explanation: 'Mô hình OSI gồm 7 tầng. Giao thức IP hoạt động tại tầng Mạng (Network Layer).',
          fillBlankTemplate: 'Mô hình tham chiếu OSI chuẩn bao gồm tổng cộng [b1] tầng. Trong đó, giao thức Internet Protocol (IP) chịu trách nhiệm định tuyến và đánh địa chỉ gói tin hoạt động tại tầng [b2].',
          fillBlankItems: [
            {
              id: 'fb_1',
              placeholderCode: '[b1]',
              options: ['4 tầng', '5 tầng', '7 tầng', '9 tầng'],
              correctAnswer: '7 tầng',
            },
            {
              id: 'fb_2',
              placeholderCode: '[b2]',
              options: ['Tầng Liên kết dữ liệu (Data Link)', 'Tầng Mạng (Network)', 'Tầng Giao vận (Transport)', 'Tầng Ứng dụng (Application)'],
              correctAnswer: 'Tầng Mạng (Network)',
            },
          ],
        },
        {
          id: 'q7',
          type: 'hotspot',
          title: 'Chọn trên hình ảnh: Hãy quan sát bo mạch chủ (Motherboard) và chấm chọn chính xác vị trí của socket CPU:',
          mediaType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
          hotspotImageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
          explanation: 'Socket gắn CPU thường là khu vực hình vuông kích thước lớn nhất nằm ở nửa phía trên của bo mạch chủ.',
          hotspotRegions: [
            {
              id: 'hs_1',
              x: 35,
              y: 25,
              width: 30,
              height: 30,
              label: 'Vùng Socket CPU',
            },
          ],
        },
      ],
    };

    localSchools = [initialSchool];
    localClasses = [class1, class2];
    localStudents = [student1, student2];
    localExams = [sampleExam1];

    notifySchools();
    notifyClasses();
    notifyStudents();
    notifyExams();

    if (isConfigured) {
      await safeDbUpsert(SCHOOLS_TABLE, initialSchool);
      await safeDbUpsert(CLASSES_TABLE, [class1, class2]);
      await safeDbUpsert(STUDENTS_TABLE, [student1, student2]);
      await safeDbUpsert(EXAMS_TABLE, sampleExam1);
      await saveExamQuestionsToMultiTables(exam1Id, sampleExam1.questions);
    }
  }
}
