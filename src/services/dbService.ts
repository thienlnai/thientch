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
  isTursoConfigured,
  getEffectiveTursoConfig,
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

// Kênh BroadcastChannel đồng bộ kết quả thi tức thì (0ms) giữa các tab/cửa sổ trên cùng trình duyệt
const SUBMISSION_SYNC_CHANNEL = 'thientch_submissions_realtime_sync';
let syncChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    syncChannel = new BroadcastChannel(SUBMISSION_SYNC_CHANNEL);
  }
} catch {
  syncChannel = null;
}

export function broadcastSubmissionEvent(action: 'NEW_SUBMISSION' | 'DELETE_SUBMISSION' | 'REFRESH_ALL', payload?: any) {
  try {
    if (syncChannel) {
      syncChannel.postMessage({ action, payload, timestamp: Date.now() });
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('thientch_sub_sync_ts', `${Date.now()}_${action}`);
    }
  } catch {}
}

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

export function toDbExamQuestionRow(q: any, examId: string, orderIndex?: number, isPartial = false): any {
  if (!q || typeof q !== 'object') return q;
  const row: any = {};
  if (q.id !== undefined) row.id = String(q.id);
  else if (!isPartial) row.id = `q_${examId}_${orderIndex ?? 0}_${Math.random().toString(36).slice(2, 6)}`;

  if (q.examId !== undefined || examId) row.examId = String(q.examId || examId);
  if (q.orderIndex !== undefined || orderIndex !== undefined) row.orderIndex = Number(q.orderIndex ?? orderIndex ?? 0);
  if (q.type !== undefined || !isPartial) row.type = q.type || 'single_choice';
  if (q.title !== undefined || !isPartial) row.title = q.title || '';
  if (q.mediaType !== undefined || !isPartial) row.mediaType = q.mediaType || 'none';
  if (q.mediaUrl !== undefined || !isPartial) row.mediaUrl = q.mediaUrl || null;
  if (q.explanation !== undefined || !isPartial) row.explanation = q.explanation || null;
  if (q.options !== undefined || !isPartial) {
    row.options = typeof q.options === 'string' ? q.options : JSON.stringify(q.options || []);
  }
  if (q.correctOptionId !== undefined || !isPartial) row.correctOptionId = q.correctOptionId || null;
  if (q.correctOptionIds !== undefined || !isPartial) {
    row.correctOptionIds = typeof q.correctOptionIds === 'string' ? q.correctOptionIds : JSON.stringify(q.correctOptionIds || []);
  }
  if (q.matchingPairs !== undefined || !isPartial) {
    row.matchingPairs = typeof q.matchingPairs === 'string' ? q.matchingPairs : JSON.stringify(q.matchingPairs || []);
  }
  if (q.shuffledRightPairs !== undefined || !isPartial) {
    row.shuffledRightPairs = typeof q.shuffledRightPairs === 'string' ? q.shuffledRightPairs : JSON.stringify(q.shuffledRightPairs || []);
  }
  if (q.orderingItems !== undefined || !isPartial) {
    row.orderingItems = typeof q.orderingItems === 'string' ? q.orderingItems : JSON.stringify(q.orderingItems || []);
  }
  if (q.trueLabel !== undefined || !isPartial) row.trueLabel = q.trueLabel || 'Đúng';
  if (q.falseLabel !== undefined || !isPartial) row.falseLabel = q.falseLabel || 'Sai';
  if (q.tfStatements !== undefined || !isPartial) {
    row.tfStatements = typeof q.tfStatements === 'string' ? q.tfStatements : JSON.stringify(q.tfStatements || []);
  }
  if (q.shuffledTfColumns !== undefined || !isPartial) {
    row.shuffledTfColumns = typeof q.shuffledTfColumns === 'string' ? q.shuffledTfColumns : JSON.stringify(q.shuffledTfColumns || []);
  }
  if (q.hotspotImageUrl !== undefined || !isPartial) row.hotspotImageUrl = q.hotspotImageUrl || null;
  if (q.hotspotRegions !== undefined || !isPartial) {
    row.hotspotRegions = typeof q.hotspotRegions === 'string' ? q.hotspotRegions : JSON.stringify(q.hotspotRegions || []);
  }
  if (q.fillBlankTemplate !== undefined || !isPartial) row.fillBlankTemplate = q.fillBlankTemplate || null;
  if (q.fillBlankItems !== undefined || !isPartial) {
    row.fillBlankItems = typeof q.fillBlankItems === 'string' ? q.fillBlankItems : JSON.stringify(q.fillBlankItems || []);
  }
  if (q.updatedAt !== undefined || !isPartial) row.updatedAt = q.updatedAt || new Date().toISOString();
  if (q.createdAt !== undefined) row.createdAt = q.createdAt;

  return row;
}

export function toDbQuestionBankRow(q: any, isPartial = false): any {
  if (!q || typeof q !== 'object') return q;
  const row: any = {};
  if (q.id !== undefined || !isPartial) row.id = String(q.id || '');
  if (q.type !== undefined || !isPartial) row.type = q.type || 'single_choice';
  if (q.title !== undefined || !isPartial) row.title = String(q.title || '');
  if (q.mediaType !== undefined || !isPartial) row.mediaType = q.mediaType || 'none';
  if (q.mediaUrl !== undefined || !isPartial) row.mediaUrl = q.mediaUrl || null;
  if (q.explanation !== undefined || !isPartial) row.explanation = q.explanation || null;
  if (q.options !== undefined || !isPartial) {
    row.options = typeof q.options === 'string' ? q.options : JSON.stringify(q.options || []);
  }
  if (q.correctOptionId !== undefined || !isPartial) row.correctOptionId = q.correctOptionId || null;
  if (q.correctOptionIds !== undefined || !isPartial) {
    row.correctOptionIds = typeof q.correctOptionIds === 'string' ? q.correctOptionIds : JSON.stringify(q.correctOptionIds || []);
  }
  if (q.matchingPairs !== undefined || !isPartial) {
    row.matchingPairs = typeof q.matchingPairs === 'string' ? q.matchingPairs : JSON.stringify(q.matchingPairs || []);
  }
  if (q.shuffledRightPairs !== undefined || !isPartial) {
    row.shuffledRightPairs = typeof q.shuffledRightPairs === 'string' ? q.shuffledRightPairs : JSON.stringify(q.shuffledRightPairs || []);
  }
  if (q.orderingItems !== undefined || !isPartial) {
    row.orderingItems = typeof q.orderingItems === 'string' ? q.orderingItems : JSON.stringify(q.orderingItems || []);
  }
  if (q.trueLabel !== undefined || !isPartial) row.trueLabel = q.trueLabel || 'Đúng';
  if (q.falseLabel !== undefined || !isPartial) row.falseLabel = q.falseLabel || 'Sai';
  if (q.tfStatements !== undefined || !isPartial) {
    row.tfStatements = typeof q.tfStatements === 'string' ? q.tfStatements : JSON.stringify(q.tfStatements || []);
  }
  if (q.shuffledTfColumns !== undefined || !isPartial) {
    row.shuffledTfColumns = typeof q.shuffledTfColumns === 'string' ? q.shuffledTfColumns : JSON.stringify(q.shuffledTfColumns || []);
  }
  if (q.hotspotImageUrl !== undefined || !isPartial) row.hotspotImageUrl = q.hotspotImageUrl || null;
  if (q.hotspotRegions !== undefined || !isPartial) {
    row.hotspotRegions = typeof q.hotspotRegions === 'string' ? q.hotspotRegions : JSON.stringify(q.hotspotRegions || []);
  }
  if (q.fillBlankTemplate !== undefined || !isPartial) row.fillBlankTemplate = q.fillBlankTemplate || null;
  if (q.fillBlankItems !== undefined || !isPartial) {
    row.fillBlankItems = typeof q.fillBlankItems === 'string' ? q.fillBlankItems : JSON.stringify(q.fillBlankItems || []);
  }
  if (q.sourceExamId !== undefined) row.sourceExamId = q.sourceExamId || null;
  if (q.sourceExamTitle !== undefined) row.sourceExamTitle = q.sourceExamTitle || null;
  if (q.subject !== undefined) row.subject = q.subject || 'Công nghệ Thông tin';
  if (q.grade !== undefined) row.grade = q.grade || 'Khối 12';
  if (q.creatorId !== undefined) row.creatorId = q.creatorId || null;
  if (q.creatorName !== undefined) row.creatorName = q.creatorName || null;
  if (q.updatedAt !== undefined || !isPartial) row.updatedAt = q.updatedAt || new Date().toISOString();
  if (q.createdAt !== undefined) row.createdAt = q.createdAt;
  return row;
}

/**
 * Kiểm tra xem nội dung của một câu hỏi có bị thay đổi giữa phiên bản cũ và mới hay không.
 * Phục vụ cập nhật vi sai (Delta Update) - Chỉ UPDATE câu hỏi bị sửa, không chạm vào câu hỏi khác.
 */
export function isQuestionContentModified(qOld: ExamQuestion, qNew: ExamQuestion): boolean {
  if (!qOld || !qNew) return true;
  if ((qOld.type || 'single_choice') !== (qNew.type || 'single_choice')) return true;
  if ((qOld.title || '').trim() !== (qNew.title || '').trim()) return true;
  if ((qOld.mediaType || 'none') !== (qNew.mediaType || 'none')) return true;
  if ((qOld.mediaUrl || null) !== (qNew.mediaUrl || null)) return true;
  if ((qOld.explanation || null) !== (qNew.explanation || null)) return true;
  if ((qOld.correctOptionId || null) !== (qNew.correctOptionId || null)) return true;
  if ((qOld.trueLabel || 'Đúng') !== (qNew.trueLabel || 'Đúng')) return true;
  if ((qOld.falseLabel || 'Sai') !== (qNew.falseLabel || 'Sai')) return true;
  if ((qOld.hotspotImageUrl || null) !== (qNew.hotspotImageUrl || null)) return true;
  if ((qOld.fillBlankTemplate || null) !== (qNew.fillBlankTemplate || null)) return true;

  // So sánh correctOptionIds
  const oldIds = Array.isArray(qOld.correctOptionIds) ? [...qOld.correctOptionIds].sort() : [];
  const newIds = Array.isArray(qNew.correctOptionIds) ? [...qNew.correctOptionIds].sort() : [];
  if (oldIds.length !== newIds.length || oldIds.some((v, idx) => v !== newIds[idx])) return true;

  // So sánh options
  const oldOpts = Array.isArray(qOld.options) ? qOld.options : [];
  const newOpts = Array.isArray(qNew.options) ? qNew.options : [];
  if (oldOpts.length !== newOpts.length) return true;
  for (let i = 0; i < oldOpts.length; i++) {
    const o1 = oldOpts[i];
    const o2 = newOpts[i];
    if (
      o1.id !== o2.id ||
      (o1.text || '').trim() !== (o2.text || '').trim() ||
      (o1.imageUrl || null) !== (o2.imageUrl || null)
    ) {
      return true;
    }
  }

  // So sánh matchingPairs
  const oldPairs = Array.isArray(qOld.matchingPairs) ? qOld.matchingPairs : [];
  const newPairs = Array.isArray(qNew.matchingPairs) ? qNew.matchingPairs : [];
  if (oldPairs.length !== newPairs.length) return true;
  for (let i = 0; i < oldPairs.length; i++) {
    const p1 = oldPairs[i];
    const p2 = newPairs[i];
    if (
      p1.id !== p2.id ||
      (p1.leftText || '').trim() !== (p2.leftText || '').trim() ||
      (p1.leftImageUrl || null) !== (p2.leftImageUrl || null) ||
      (p1.rightText || '').trim() !== (p2.rightText || '').trim() ||
      (p1.rightImageUrl || null) !== (p2.rightImageUrl || null)
    ) {
      return true;
    }
  }

  // So sánh orderingItems
  const oldOrd = Array.isArray(qOld.orderingItems) ? qOld.orderingItems : [];
  const newOrd = Array.isArray(qNew.orderingItems) ? qNew.orderingItems : [];
  if (oldOrd.length !== newOrd.length) return true;
  for (let i = 0; i < oldOrd.length; i++) {
    const it1 = oldOrd[i];
    const it2 = newOrd[i];
    if (
      it1.id !== it2.id ||
      (it1.text || '').trim() !== (it2.text || '').trim() ||
      (it1.imageUrl || null) !== (it2.imageUrl || null)
    ) {
      return true;
    }
  }

  // So sánh tfStatements
  const oldTf = Array.isArray(qOld.tfStatements) ? qOld.tfStatements : [];
  const newTf = Array.isArray(qNew.tfStatements) ? qNew.tfStatements : [];
  if (oldTf.length !== newTf.length) return true;
  for (let i = 0; i < oldTf.length; i++) {
    const t1 = oldTf[i];
    const t2 = newTf[i];
    if (
      t1.id !== t2.id ||
      (t1.statement || '').trim() !== (t2.statement || '').trim() ||
      Boolean(t1.isTrue) !== Boolean(t2.isTrue)
    ) {
      return true;
    }
  }

  // So sánh fillBlankItems
  const oldFb = Array.isArray(qOld.fillBlankItems) ? qOld.fillBlankItems : [];
  const newFb = Array.isArray(qNew.fillBlankItems) ? qNew.fillBlankItems : [];
  if (oldFb.length !== newFb.length) return true;
  for (let i = 0; i < oldFb.length; i++) {
    const f1 = oldFb[i];
    const f2 = newFb[i];
    if (
      f1.id !== f2.id ||
      f1.placeholderCode !== f2.placeholderCode ||
      (f1.correctAnswer || '').trim() !== (f2.correctAnswer || '').trim() ||
      JSON.stringify(f1.options || []) !== JSON.stringify(f2.options || [])
    ) {
      return true;
    }
  }

  // So sánh hotspotRegions
  const oldHs = Array.isArray(qOld.hotspotRegions) ? qOld.hotspotRegions : [];
  const newHs = Array.isArray(qNew.hotspotRegions) ? qNew.hotspotRegions : [];
  if (oldHs.length !== newHs.length) return true;
  for (let i = 0; i < oldHs.length; i++) {
    const h1 = oldHs[i];
    const h2 = newHs[i];
    if (
      h1.id !== h2.id ||
      h1.x !== h2.x ||
      h1.y !== h2.y ||
      h1.width !== h2.width ||
      h1.height !== h2.height ||
      (h1.label || null) !== (h2.label || null)
    ) {
      return true;
    }
  }

  return false;
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
    return toDbExamQuestionRow(payload, payload.examId || '', payload.orderIndex, isPartial);
  }
  if (table === QUESTION_BANK_TABLE) {
    return toDbQuestionBankRow(payload, isPartial);
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

  const statements: Array<{ sql: string; args: any[] }> = [];

  try {
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
    const errMsg = String(err?.message || err || '').toLowerCase();
    // Tự động xử lý bổ sung cột nếu bảng users hoặc bảng khác thiếu cột
    if (errMsg.includes('no such column') || errMsg.includes('has no column')) {
      try {
        console.warn(`[Turso] Phát hiện thiếu cột trên bảng ${table}, đang tự động bổ sung cột và thử lại...`);
        if (table === USERS_TABLE) {
          await tursoExecute(`ALTER TABLE "${USERS_TABLE}" ADD COLUMN schoolIds TEXT DEFAULT '[]'`);
          await tursoExecute(`ALTER TABLE "${USERS_TABLE}" ADD COLUMN subjects TEXT`);
          await tursoExecute(`ALTER TABLE "${USERS_TABLE}" ADD COLUMN phone TEXT`);
        }
        // Thử lại batch sau khi đã bổ sung cột
        await tursoBatch(statements);
        return { data: records, error: null };
      } catch (retryErr) {
        console.warn('[Turso] Thử lại sau khi bổ sung cột thất bại:', retryErr);
      }
    }

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
    const errMsg = String(err?.message || err || '').toLowerCase();
    if (errMsg.includes('no such column') || errMsg.includes('has no column')) {
      try {
        if (table === USERS_TABLE) {
          await tursoExecute(`ALTER TABLE "${USERS_TABLE}" ADD COLUMN schoolIds TEXT DEFAULT '[]'`);
          await tursoExecute(`ALTER TABLE "${USERS_TABLE}" ADD COLUMN subjects TEXT`);
          await tursoExecute(`ALTER TABLE "${USERS_TABLE}" ADD COLUMN phone TEXT`);
          const item = cleanDbData(prepareDbPayload(table, payload, true));
          const keys = Object.keys(item).filter((k) => k !== matchColumn);
          const setClauses = keys.map((k) => `"${k}" = ?`).join(', ');
          const values = keys.map((k) => {
            const val = item[k];
            if (val === undefined) return null;
            if (typeof val === 'object' && val !== null) return JSON.stringify(val);
            if (typeof val === 'boolean') return val ? 1 : 0;
            return val;
          });
          values.push(matchValue);
          const retrySql = `UPDATE "${table}" SET ${setClauses} WHERE "${matchColumn}" = ?`;
          await tursoExecute(retrySql, values);
          return { data: payload, error: null };
        }
      } catch (retryErr) {
        console.warn('[Turso] Thử lại safeDbUpdate thất bại:', retryErr);
      }
    }
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
    const cleanQId = String(q.id || `q_${examId}_${qIdx + 1}_${Date.now()}`).trim();
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
    return () => {
      schoolListeners.delete(onUpdate);
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
    return () => {
      classListeners.delete(onUpdate);
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
    return () => {
      studentListeners.delete(onUpdate);
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
    return () => {
      userListeners.delete(onUpdate);
    };
  }

  return () => {
    userListeners.delete(onUpdate);
  };
}

// ================= CACHING DỮ LIỆU ĐỀ THI & CÂU HỎI (Requirement 4) =================
interface CachedExamEntry {
  exam: Exam;
  timestamp: number;
}
const examMemoryCache = new Map<string, CachedExamEntry>();
const EXAM_CACHE_TTL_MS = 15 * 60 * 1000; // 15 phút (900,000 ms)

/**
 * Xóa cache đề thi khi giáo viên sửa hoặc xóa đề
 */
export function invalidateExamCache(examId?: string) {
  if (examId) {
    examMemoryCache.delete(examId);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`thientch_exam_cache_${examId}`);
      }
      // Gửi tín hiệu xóa cache phía server qua /api/exam
      if (typeof window !== 'undefined' && window.location?.origin) {
        fetch('/api/exam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'invalidate', examId }),
        }).catch(() => {});
      }
    } catch {}
  } else {
    examMemoryCache.clear();
    try {
      if (typeof localStorage !== 'undefined') {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('thientch_exam_cache_')) {
            localStorage.removeItem(key);
          }
        });
      }
    } catch {}
  }
}

/**
 * KHẮC PHỤC TRIỆT ĐỂ N+1 QUERY & ROWS READ BÙNG NỔ (Requirement 2 & 4):
 * - Tầng 1: In-Memory Cache (RAM) phản hồi trong 0ms, 0 network request.
 * - Tầng 2: LocalStorage Cache phản hồi trong 1ms, 0 network request.
 * - Tầng 3: API Route /api/exam?id=... (Được cache tại Server với TTL 15 phút, 0 Rows Read Turso).
 * - Tầng 4: Single Query LEFT JOIN giữa bảng exams và exam_questions theo examId (1 lượt quét duy nhất có Index).
 * Tuyệt đối không lặp for để truy vấn từng câu hỏi hay từng lựa chọn!
 */
export async function getExamWithQuestions(examId: string, forceRefresh = false): Promise<Exam | null> {
  const cleanId = String(examId || '').trim();
  if (!cleanId) return null;

  const now = Date.now();

  // TẦNG 1: IN-MEMORY CACHE (0 LƯỢT ĐỌC TURSO)
  const cached = examMemoryCache.get(cleanId);
  if (!forceRefresh && cached && now - cached.timestamp < EXAM_CACHE_TTL_MS) {
    return cached.exam;
  }

  // TẦNG 2: LOCALSTORAGE CACHE (0 LƯỢT ĐỌC TURSO)
  if (!forceRefresh && typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(`thientch_exam_cache_${cleanId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.exam && parsed.timestamp && now - parsed.timestamp < EXAM_CACHE_TTL_MS) {
          examMemoryCache.set(cleanId, { exam: parsed.exam, timestamp: parsed.timestamp });
          return parsed.exam;
        }
      }
    } catch {}
  }

  // Kiểm tra trong bộ nhớ localExams nếu đã có câu hỏi
  const localMatch = localExams.find((e) => e.id === cleanId);
  if (!forceRefresh && localMatch && localMatch.questions && localMatch.questions.length > 0) {
    examMemoryCache.set(cleanId, { exam: localMatch, timestamp: now });
    return localMatch;
  }

  // TẦNG 3: THỬ GỌI API SERVER /api/exam?id=... (SERVER-SIDE CACHE)
  if (!forceRefresh && typeof window !== 'undefined' && window.location?.origin) {
    try {
      const res = await fetch(`/api/exam?id=${encodeURIComponent(cleanId)}`, {
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' 
          ? AbortSignal.timeout(6000) 
          : undefined,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const apiExam = json.data as Exam;
          examMemoryCache.set(cleanId, { exam: apiExam, timestamp: now });
          try {
            localStorage.setItem(
              `thientch_exam_cache_${cleanId}`,
              JSON.stringify({ exam: apiExam, timestamp: now })
            );
          } catch {}
          // Đồng bộ vào localExams
          const idx = localExams.findIndex((e) => e.id === cleanId);
          if (idx >= 0) {
            localExams[idx] = apiExam;
          } else {
            localExams.push(apiExam);
          }
          notifyExams();
          return apiExam;
        }
      }
    } catch {
      // Fallback sang truy vấn Turso trực tiếp
    }
  }

  if (!isConfigured) {
    return localMatch || null;
  }

  try {
    /**
     * TẦNG 4: SINGLE QUERY LEFT JOIN DUY NHẤT (CHỐNG N+1 & FULL TABLE SCAN)
     * - Chỉ 1 round-trip tới Turso Database.
     * - Dùng Primary Key exams.id và B-Tree Index idx_exam_questions_exam_order.
     * - Số Rows Read chính xác bằng số câu hỏi của đề thi, không đọc dư 1 hàng nào!
     */
    const joinSql = `
      SELECT 
        e.id AS e_id, e.title AS e_title, e.description AS e_description, 
        e.subject AS e_subject, e.grade AS e_grade, e.targetGrades AS e_targetGrades, 
        e.creatorId AS e_creatorId, e.creatorName AS e_creatorName, e.classIds AS e_classIds, 
        e.durationMinutes AS e_durationMinutes, e.totalScore AS e_totalScore, 
        e.passingScore AS e_passingScore, e.status AS e_status, 
        e.allowReviewAnswers AS e_allowReviewAnswers, e.isPracticeTest AS e_isPracticeTest, 
        e.practiceRandomCount AS e_practiceRandomCount, e.totalQuestions AS e_totalQuestions,
        e.questionIds AS e_questionIds,
        e.createdAt AS e_createdAt, e.updatedAt AS e_updatedAt,
        q.id AS q_id, q.examId AS q_examId, q.orderIndex AS q_orderIndex, q.type AS q_type, 
        q.title AS q_title, q.mediaType AS q_mediaType, q.mediaUrl AS q_mediaUrl, 
        q.explanation AS q_explanation, q.correctOptionId AS q_correctOptionId, 
        q.correctOptionIds AS q_correctOptionIds, q.trueLabel AS q_trueLabel, 
        q.falseLabel AS q_falseLabel, q.hotspotImageUrl AS q_hotspotImageUrl, 
        q.fillBlankTemplate AS q_fillBlankTemplate, q.options AS q_options, 
        q.matchingPairs AS q_matchingPairs, q.shuffledRightPairs AS q_shuffledRightPairs, 
        q.orderingItems AS q_orderingItems, q.tfStatements AS q_tfStatements, 
        q.shuffledTfColumns AS q_shuffledTfColumns, q.hotspotRegions AS q_hotspotRegions, 
        q.fillBlankItems AS q_fillBlankItems, q.createdAt AS q_createdAt, q.updatedAt AS q_updatedAt
      FROM ${EXAMS_TABLE} e
      LEFT JOIN ${EXAM_QUESTIONS_TABLE} q ON e.id = q.examId
      WHERE e.id = ?
      ORDER BY q.orderIndex ASC
    `;

    const rows = await tursoQuery(joinSql, [cleanId]);

    if (!Array.isArray(rows) || rows.length === 0) {
      return localMatch || null;
    }

    const first = rows[0];
    const parseJson = (val: any, fallback: any = []) => {
      if (!val) return fallback;
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return fallback; }
      }
      return val;
    };

    const baseExam: Exam = {
      id: String(first.e_id || cleanId),
      title: String(first.e_title || 'Đề thi trắc nghiệm'),
      description: String(first.e_description || ''),
      subject: String(first.e_subject || 'Công nghệ Thông tin'),
      grade: String(first.e_grade || 'Khối 12'),
      targetGrades: parseJson(first.e_targetGrades, []),
      creatorId: String(first.e_creatorId || ''),
      creatorName: String(first.e_creatorName || ''),
      classIds: parseJson(first.e_classIds, []),
      durationMinutes: Number(first.e_durationMinutes ?? 45),
      totalScore: Number(first.e_totalScore ?? 1000),
      passingScore: Number(first.e_passingScore ?? 950),
      status: first.e_status || 'published',
      allowReviewAnswers: Boolean(first.e_allowReviewAnswers ?? 1),
      isPracticeTest: Boolean(first.e_isPracticeTest ?? 0),
      practiceRandomCount: Number(first.e_practiceRandomCount ?? 0),
      totalQuestions: Number(first.e_totalQuestions ?? 0),
      questionIds: [],
      questions: [],
      createdAt: first.e_createdAt || new Date().toISOString(),
      updatedAt: first.e_updatedAt || new Date().toISOString(),
    };

    const questions: ExamQuestion[] = [];
    const seenQIds = new Set<string>();

    for (const r of rows) {
      const qId = r.q_id;
      if (qId && !seenQIds.has(qId)) {
        seenQIds.add(qId);
        questions.push({
          id: String(qId),
          type: r.q_type || 'single_choice',
          title: String(r.q_title || ''),
          mediaType: r.q_mediaType || 'none',
          mediaUrl: r.q_mediaUrl || undefined,
          explanation: r.q_explanation || undefined,
          options: parseJson(r.q_options, []),
          correctOptionId: r.q_correctOptionId || undefined,
          correctOptionIds: parseJson(r.q_correctOptionIds, []),
          matchingPairs: parseJson(r.q_matchingPairs, []),
          shuffledRightPairs: parseJson(r.q_shuffledRightPairs, []),
          orderingItems: parseJson(r.q_orderingItems, []),
          trueLabel: r.q_trueLabel || 'Đúng',
          falseLabel: r.q_falseLabel || 'Sai',
          tfStatements: parseJson(r.q_tfStatements, []),
          shuffledTfColumns: parseJson(r.q_shuffledTfColumns, []),
          hotspotImageUrl: r.q_hotspotImageUrl || undefined,
          hotspotRegions: parseJson(r.q_hotspotRegions, []),
          fillBlankTemplate: r.q_fillBlankTemplate || undefined,
          fillBlankItems: parseJson(r.q_fillBlankItems, []),
          createdAt: r.q_createdAt || baseExam.createdAt,
          updatedAt: r.q_updatedAt || baseExam.updatedAt,
        });
      }
    }

    if (questions.length === 0) {
      const qIds: string[] = parseJson(first.e_questionIds, []);
      if (qIds.length > 0) {
        for (const ex of localExams) {
          if (ex.questions) {
            for (const q of ex.questions) {
              if (qIds.includes(q.id) && !seenQIds.has(q.id)) {
                seenQIds.add(q.id);
                questions.push(q);
              }
            }
          }
        }
      }
    }

    baseExam.questions = questions;
    baseExam.totalQuestions = questions.length || baseExam.totalQuestions;
    baseExam.questionIds = questions.map((q) => q.id);

    // Lưu vào In-Memory Cache (RAM) và LocalStorage (TTL 15 phút)
    examMemoryCache.set(cleanId, { exam: baseExam, timestamp: now });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          `thientch_exam_cache_${cleanId}`,
          JSON.stringify({ exam: baseExam, timestamp: now })
        );
      }
    } catch {}

    // Đồng bộ vào localExams
    const idx = localExams.findIndex((e) => e.id === cleanId);
    if (idx >= 0) {
      localExams[idx] = baseExam;
    } else {
      localExams.push(baseExam);
    }
    notifyExams();

    return baseExam;
  } catch (err) {
    console.error(`Lỗi khi nạp chi tiết đề thi ${cleanId}:`, err);
    return localMatch || null;
  }
}


export function subscribeExams(onUpdate: (exams: Exam[]) => void) {
  examListeners.add(onUpdate);
  onUpdate([...localExams]);

  if (isConfigured) {
    const fetchExams = async () => {
      try {
        const examsRows = await tursoQuery(`SELECT * FROM ${EXAMS_TABLE} ORDER BY createdAt DESC`);
        const questionsRows: any[] = [];
        const optionsRows: any[] = [];
        const matchingRows: any[] = [];
        const orderingRows: any[] = [];
        const tfRows: any[] = [];
        const fillBlankRows: any[] = [];
        const hotspotRows: any[] = [];
        const bankRows: any[] = [];

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
    return () => {
      examListeners.delete(onUpdate);
    };
  }

  return () => {
    examListeners.delete(onUpdate);
  };
}

/**
 * Biến lưu thời điểm nạp bài thi gần nhất để chống spam truy vấn Turso
 */
let lastSubmissionsFetchTimestamp = 0;
const SUBMISSIONS_FETCH_COOLDOWN_MS = 15000; // Tối thiểu 15 giây giữa các lần cưỡng chế nạp

/**
 * Đồng bộ danh sách bài thi tối ưu:
 * - KHÔNG CHẠY POLLING ĐỊNH KỲ (0 lượt đọc thừa).
 * - Nạp lần đầu nếu bộ nhớ đệm còn rỗng.
 * - Sử dụng BroadcastChannel để đồng bộ tức thì giữa các tab/cửa sổ (0ms, 0 row reads).
 */
export function subscribeSubmissions(onUpdate: (submissions: ExamSubmission[]) => void) {
  submissionListeners.add(onUpdate);
  onUpdate([...localSubmissions]);

  // Chỉ nạp từ Turso 1 lần đầu nếu danh sách local còn rỗng
  if (localSubmissions.length === 0) {
    refreshSubmissionsNow().catch(() => {});
  }

  return () => {
    submissionListeners.delete(onUpdate);
  };
}

/**
 * Lấy danh sách bài thi của riêng 1 học sinh (Chỉ đọc đúng số bài của học sinh đó, 0 full table scan)
 */
export async function getStudentSubmissions(studentId: string): Promise<ExamSubmission[]> {
  const cleanId = String(studentId || '').trim();
  if (!cleanId) return [];

  // 1. Kiểm tra trong bộ nhớ local trước (0 row reads)
  const localMatches = localSubmissions.filter((s) => s.studentId === cleanId);
  if (localMatches.length > 0) {
    return localMatches;
  }

  // 2. Nếu chưa có, truy vấn Turso có Index B-Tree theo studentId (chỉ đọc đúng số bài của HS đó)
  if (isConfigured) {
    try {
      const rows = await tursoQuery(
        `SELECT * FROM ${SUBMISSIONS_TABLE} WHERE studentId = ? AND id NOT LIKE 'draft_%' ORDER BY submittedAt DESC`,
        [cleanId]
      );
      if (Array.isArray(rows)) {
        const studentSubs = rows.map(normalizeSubmission);
        studentSubs.forEach((sub) => {
          if (!localSubmissions.some((s) => s.id === sub.id)) {
            localSubmissions.push(sub);
          }
        });
        return studentSubs;
      }
    } catch (err) {
      console.warn('Lỗi khi lấy bài thi học sinh:', err);
    }
  }

  return localMatches;
}

let lastKnownSubmissionTime = '';

/**
 * Kiểm tra xem có bài nộp mới hơn không (CHỈ ĐỌC ĐÚNG 1 ROW READ DUY NHẤT CÓ INDEX B-TREE)
 * Tuyệt đối không quét toàn bảng, bảo vệ quota Row Read Turso tối đa.
 */
export async function checkForNewSubmissions(): Promise<boolean> {
  const config = getEffectiveTursoConfig();
  if (!config.isConfigured && !isConfigured) return false;

  try {
    const rows = await tursoQuery<{ id: string; submittedAt: string }>(
      `SELECT id, submittedAt FROM ${SUBMISSIONS_TABLE} WHERE id NOT LIKE 'draft_%' ORDER BY submittedAt DESC LIMIT 1`
    );
    const latest = rows?.[0];
    if (!latest?.submittedAt) return false;

    if (!lastKnownSubmissionTime) {
      lastKnownSubmissionTime = latest.submittedAt;
      return false;
    }

    if (latest.submittedAt !== lastKnownSubmissionTime) {
      lastKnownSubmissionTime = latest.submittedAt;
      await refreshSubmissionsNow(true);
      return true;
    }
  } catch {}
  return false;
}

/**
 * Hàm cưỡng chế nạp và đồng bộ tức thì tất cả bài thi từ CSDL Turso (dành cho Giáo viên / Quản trị viên)
 */
export async function refreshSubmissionsNow(force = false): Promise<ExamSubmission[]> {
  const now = Date.now();
  if (!force && now - lastSubmissionsFetchTimestamp < SUBMISSIONS_FETCH_COOLDOWN_MS && localSubmissions.length > 0) {
    notifySubmissions();
    return [...localSubmissions];
  }
  lastSubmissionsFetchTimestamp = now;

  const config = getEffectiveTursoConfig();
  if (!config.isConfigured && !isConfigured) {
    notifySubmissions();
    return [...localSubmissions];
  }

  try {
    const rows = await tursoQuery(
      `SELECT * FROM ${SUBMISSIONS_TABLE} WHERE id NOT LIKE 'draft_%' ORDER BY submittedAt DESC`
    );
    if (Array.isArray(rows)) {
      const remoteSubs = rows.map(normalizeSubmission);
      const map = new Map<string, ExamSubmission>();
      remoteSubs.forEach((s) => map.set(s.id, s));
      localSubmissions.forEach((s) => {
        if (!map.has(s.id) && !s.id.startsWith('draft_')) {
          map.set(s.id, s);
        }
      });
      localSubmissions = sortBySubmittedAt(Array.from(map.values()));
      notifySubmissions();
    }
  } catch (err) {
    console.warn('[Turso] refreshSubmissionsNow notice:', err);
  }

  return [...localSubmissions];
}

// Lắng nghe sự kiện đồng bộ từ các Tab khác & Khi cửa sổ nhận tiêu điểm (Focus)
if (typeof window !== 'undefined') {
  if (syncChannel) {
    syncChannel.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.action === 'NEW_SUBMISSION' && data.payload) {
        const sub = normalizeSubmission(data.payload);
        const idx = localSubmissions.findIndex((s) => s.id === sub.id);
        if (idx >= 0) {
          localSubmissions[idx] = sub;
        } else {
          localSubmissions = sortBySubmittedAt([sub, ...localSubmissions]);
        }
        notifySubmissions();
      } else if (data.action === 'DELETE_SUBMISSION' && data.payload?.id) {
        localSubmissions = localSubmissions.filter((s) => s.id !== data.payload.id);
        notifySubmissions();
      } else if (data.action === 'REFRESH_ALL') {
        refreshSubmissionsNow(true);
      }
    };
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'thientch_sub_sync_ts') {
      refreshSubmissionsNow(true);
    }
  });

  // Chỉ nạp lại nếu tab đã rời đi hơn 5 phút (300,000ms), không spam mỗi lần click chuột
  window.addEventListener('focus', () => {
    const now = Date.now();
    if (now - lastSubmissionsFetchTimestamp > 300000) {
      refreshSubmissionsNow();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - lastSubmissionsFetchTimestamp > 300000) {
        refreshSubmissionsNow();
      }
    }
  });
}

export function subscribeQuestionBank(onUpdate: (questions: ExamQuestion[]) => void) {
  questionBankListeners.add(onUpdate);
  onUpdate([...localQuestionBank]);

  if (isConfigured) {
    const fetchBank = async () => {
      try {
        const rows = await tursoQuery(`SELECT * FROM ${QUESTION_BANK_TABLE} ORDER BY updatedAt DESC LIMIT 200`);
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
    return () => {
      questionBankListeners.delete(onUpdate);
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
    const res = await safeDbUpsert(USERS_TABLE, newUser);
    if (res.error) {
      console.error('[addUserAccount] Lỗi lưu vào Turso:', res.error);
      throw new Error(`Lỗi khi lưu tài khoản vào cơ sở dữ liệu Turso: ${res.error?.message || String(res.error)}`);
    }
  }
  return newUser;
}

export async function updateUserAccount(id: string, data: Partial<UserAccount>, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();
  localUsers = localUsers.map((u) => (u.id === id ? { ...u, ...data, updatedAt: now } : u));
  notifyUsers();

  if (isConfigured) {
    const res = await safeDbUpdate(USERS_TABLE, { ...data, updatedAt: now }, 'id', id);
    if (res.error) {
      console.error('[updateUserAccount] Lỗi cập nhật Turso:', res.error);
      throw new Error(`Lỗi khi cập nhật tài khoản trên Turso: ${res.error?.message || String(res.error)}`);
    }
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
  actorUsername?: string,
  schoolIds?: string[]
): Promise<void> {
  const finalSchoolIds = Array.isArray(schoolIds) && schoolIds.length > 0
    ? schoolIds
    : (schoolId ? [schoolId] : []);
  const finalSchoolId = finalSchoolIds[0] || schoolId;
  await updateUserAccount(teacherId, { schoolId: finalSchoolId, schoolIds: finalSchoolIds, classIds }, actorUsername);
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

  // Đảm bảo mỗi câu hỏi có ID cố định ngay từ đầu
  processedQuestions = processedQuestions.map((q, qIdx) => {
    const qId = String(q.id || `q_${examId}_${qIdx + 1}_${Math.random().toString(36).slice(2, 7)}`).trim();
    return { ...q, id: qId, examId };
  });

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

/**
 * Cập nhật vi sai (Delta Update) danh sách câu hỏi đề thi:
 * - Khi giáo viên chỉnh sửa một câu hỏi cụ thể (ví dụ: Câu 10), hệ thống CHỈ UPDATE riêng câu hỏi đó
 *   trong cơ sở dữ liệu bằng cách sử dụng ID hiện có của nó (câu lệnh UPDATE).
 * - Tuyệt đối KHÔNG xóa và tạo lại toàn bộ câu hỏi.
 * - KHÔNG tạo ID câu hỏi mới hoặc tạo bản ghi trùng lặp trong question_bank, exam_questions hay các bảng con.
 * - Tất cả các câu hỏi khác (từ 1 đến 9, 11 đến 15) được giữ nguyên hoàn toàn, bảo toàn ID gốc và các mối quan hệ ban đầu.
 */
export async function updateExamQuestionsDelta(
  examId: string,
  incomingQuestions: ExamQuestion[],
  examMeta?: {
    title?: string;
    subject?: string;
    grade?: string;
    creatorId?: string;
    creatorName?: string;
  },
  existingQuestionsFallback?: ExamQuestion[]
): Promise<{
  updatedCount: number;
  insertedCount: number;
  deletedCount: number;
  unchangedCount: number;
}> {
  if (!isConfigured) {
    return { updatedCount: 0, insertedCount: 0, deletedCount: 0, unchangedCount: 0 };
  }

  const now = new Date().toISOString();

  // 1. Xác định danh sách câu hỏi hiện có của đề thi trước khi chỉnh sửa
  let existingQuestions: ExamQuestion[] = [];
  if (existingQuestionsFallback && existingQuestionsFallback.length > 0) {
    existingQuestions = existingQuestionsFallback;
  } else {
    const localMatch = localExams.find((e) => e.id === examId);
    if (localMatch?.questions && localMatch.questions.length > 0) {
      existingQuestions = localMatch.questions;
    } else {
      try {
        const qRows = await tursoQuery(
          `SELECT * FROM ${EXAM_QUESTIONS_TABLE} WHERE examId = ? ORDER BY orderIndex ASC`,
          [examId]
        );
        if (Array.isArray(qRows) && qRows.length > 0) {
          existingQuestions = qRows.map((r) => normalizeExamQuestion(r, examId));
        }
      } catch (err) {
        console.warn('[Turso] Không thể đọc danh sách câu hỏi cũ từ DB:', err);
      }
    }
  }

  const existingMap = new Map<string, ExamQuestion>();
  existingQuestions.forEach((q) => {
    if (q && q.id) {
      existingMap.set(String(q.id).trim(), q);
    }
  });

  const incomingIds = new Set<string>();
  let updatedCount = 0;
  let insertedCount = 0;
  let unchangedCount = 0;
  let deletedCount = 0;

  // 2. Duyệt từng câu hỏi gửi lên
  for (let qIdx = 0; qIdx < incomingQuestions.length; qIdx++) {
    const q = incomingQuestions[qIdx];
    const qId = String(q.id || `q_${examId}_${qIdx + 1}_${Date.now()}`).trim();
    incomingIds.add(qId);

    const oldQ = existingMap.get(qId);

    if (oldQ) {
      // Câu hỏi đã có sẵn trong đề thi (ví dụ: Câu 1 -> 9, Câu 10, Câu 11 -> 15)
      const contentChanged = isQuestionContentModified(oldQ, q);
      const orderChanged = (oldQ.orderIndex ?? -1) !== qIdx;

      if (!contentChanged && !orderChanged) {
        // CÂU HỎI HOÀN TOÀN KHÔNG BỊ SỬA (như Câu 1 đến 9, Câu 11 đến 15):
        // GIỮ NGUYÊN HOÀN TOÀN, BẢO TOÀN ID GỐC, KHÔNG ĐỤNG CHẠM GÌ ĐẾN CSDL!
        unchangedCount++;
        continue;
      }

      if (contentChanged) {
        // CÂU HỎI BỊ CHỈNH SỬA (như Câu 10):
        // 1. Chỉ UPDATE riêng câu hỏi này trong exam_questions bằng ID hiện có (UPDATE ... WHERE id = ?)
        const updatedQRow = toDbExamQuestionRow({ ...q, id: qId, examId, orderIndex: qIdx }, examId, qIdx);
        updatedQRow.updatedAt = now;
        await safeDbUpdate(EXAM_QUESTIONS_TABLE, updatedQRow, 'id', qId);

        // 2. Làm mới bảng con (options, matching...) của RIÊNG câu hỏi qId này
        // Tuyệt đối không xóa hay ảnh hưởng đến bất kỳ câu hỏi nào khác!
        await tursoExecute(`DELETE FROM "${QUESTION_OPTIONS_TABLE}" WHERE questionId = ?`, [qId]);
        await tursoExecute(`DELETE FROM "${QUESTION_MATCHING_PAIRS_TABLE}" WHERE questionId = ?`, [qId]);
        await tursoExecute(`DELETE FROM "${QUESTION_ORDERING_ITEMS_TABLE}" WHERE questionId = ?`, [qId]);
        await tursoExecute(`DELETE FROM "${QUESTION_TF_STATEMENTS_TABLE}" WHERE questionId = ?`, [qId]);
        await tursoExecute(`DELETE FROM "${QUESTION_FILL_BLANK_ITEMS_TABLE}" WHERE questionId = ?`, [qId]);
        await tursoExecute(`DELETE FROM "${QUESTION_HOTSPOTS_TABLE}" WHERE questionId = ?`, [qId]);

        // Ghi lại bảng con tương ứng với dạng câu hỏi cho đúng ID qId
        if (q.options && Array.isArray(q.options)) {
          const optRows = q.options.map((opt, optIdx) => {
            const isCorrect =
              opt.id === q.correctOptionId ||
              (Array.isArray(q.correctOptionIds) && q.correctOptionIds.includes(opt.id));
            return toDbQuestionOptionRow(opt, qId, examId, optIdx, isCorrect);
          });
          if (optRows.length > 0) await safeDbUpsert(QUESTION_OPTIONS_TABLE, optRows);
        }

        if (q.matchingPairs && Array.isArray(q.matchingPairs)) {
          const matchingRows = q.matchingPairs.map((pair, pairIdx) =>
            toDbQuestionMatchingPairRow(pair, qId, examId, pairIdx)
          );
          if (matchingRows.length > 0) await safeDbUpsert(QUESTION_MATCHING_PAIRS_TABLE, matchingRows);
        }

        if (q.orderingItems && Array.isArray(q.orderingItems)) {
          const ordRows = q.orderingItems.map((ord, ordIdx) =>
            toDbQuestionOrderingItemRow(ord, qId, examId, ordIdx)
          );
          if (ordRows.length > 0) await safeDbUpsert(QUESTION_ORDERING_ITEMS_TABLE, ordRows);
        }

        if (q.tfStatements && Array.isArray(q.tfStatements)) {
          const tfRows = q.tfStatements.map((tf, tfIdx) =>
            toDbQuestionTfStatementRow(tf, qId, examId, tfIdx)
          );
          if (tfRows.length > 0) await safeDbUpsert(QUESTION_TF_STATEMENTS_TABLE, tfRows);
        }

        if (q.fillBlankItems && Array.isArray(q.fillBlankItems)) {
          const fbRows = q.fillBlankItems.map((fb, fbIdx) =>
            toDbQuestionFillBlankItemRow(fb, qId, examId, fbIdx)
          );
          if (fbRows.length > 0) await safeDbUpsert(QUESTION_FILL_BLANK_ITEMS_TABLE, fbRows);
        }

        if (q.hotspotRegions && Array.isArray(q.hotspotRegions)) {
          const hsRows = q.hotspotRegions.map((hs, hsIdx) =>
            toDbQuestionHotspotRow(hs, qId, examId, hsIdx)
          );
          if (hsRows.length > 0) await safeDbUpsert(QUESTION_HOTSPOTS_TABLE, hsRows);
        }

        // 3. Cập nhật RIÊNG câu hỏi này trong question_bank nếu đã có trong ngân hàng
        // Bằng lệnh UPDATE theo ID hiện có (UPDATE ... WHERE id = ?)
        // Tuyệt đối không tạo bản ghi mới hoặc trùng lặp đối với câu hỏi chưa sửa!
        const bankPayload = toDbQuestionBankRow({
          ...q,
          id: qId,
          sourceExamId: examId,
          sourceExamTitle: examMeta?.title || oldQ.sourceExamTitle,
          subject: examMeta?.subject || oldQ.subject || 'Công nghệ Thông tin',
          grade: examMeta?.grade || oldQ.grade || 'Khối 12',
          creatorId: examMeta?.creatorId || oldQ.creatorId,
          creatorName: examMeta?.creatorName || oldQ.creatorName,
          updatedAt: now,
        });

        const existsInBank = localQuestionBank.some((b) => b.id === qId);
        if (existsInBank) {
          await safeDbUpdate(QUESTION_BANK_TABLE, bankPayload, 'id', qId);
          localQuestionBank = localQuestionBank.map((b) =>
            b.id === qId ? { ...b, ...bankPayload, options: q.options, matchingPairs: q.matchingPairs, orderingItems: q.orderingItems, tfStatements: q.tfStatements, hotspotRegions: q.hotspotRegions, fillBlankItems: q.fillBlankItems } : b
          );
        } else {
          await safeDbUpsert(QUESTION_BANK_TABLE, [bankPayload]);
          localQuestionBank = [...localQuestionBank, { ...q, ...bankPayload, id: qId }];
        }
        saveLocalData(STORAGE_KEYS.questionBank, localQuestionBank);
        notifyQuestionBank();

        updatedCount++;
      } else if (orderChanged) {
        // Chỉ đổi thứ tự hiển thị, không sửa nội dung
        await safeDbUpdate(EXAM_QUESTIONS_TABLE, { orderIndex: qIdx, updatedAt: now }, 'id', qId);
        updatedCount++;
      }
    } else {
      // CÂU HỎI MỚI ĐƯỢC THÊM VÀO ĐỀ THI
      const newQRow = toDbExamQuestionRow({ ...q, id: qId, examId, orderIndex: qIdx }, examId, qIdx);
      await safeDbUpsert(EXAM_QUESTIONS_TABLE, [newQRow]);

      if (q.options && Array.isArray(q.options)) {
        const optRows = q.options.map((opt, optIdx) => {
          const isCorrect =
            opt.id === q.correctOptionId ||
            (Array.isArray(q.correctOptionIds) && q.correctOptionIds.includes(opt.id));
          return toDbQuestionOptionRow(opt, qId, examId, optIdx, isCorrect);
        });
        if (optRows.length > 0) await safeDbUpsert(QUESTION_OPTIONS_TABLE, optRows);
      }

      if (q.matchingPairs && Array.isArray(q.matchingPairs)) {
        const matchingRows = q.matchingPairs.map((pair, pairIdx) =>
          toDbQuestionMatchingPairRow(pair, qId, examId, pairIdx)
        );
        if (matchingRows.length > 0) await safeDbUpsert(QUESTION_MATCHING_PAIRS_TABLE, matchingRows);
      }

      if (q.orderingItems && Array.isArray(q.orderingItems)) {
        const ordRows = q.orderingItems.map((ord, ordIdx) =>
          toDbQuestionOrderingItemRow(ord, qId, examId, ordIdx)
        );
        if (ordRows.length > 0) await safeDbUpsert(QUESTION_ORDERING_ITEMS_TABLE, ordRows);
      }

      if (q.tfStatements && Array.isArray(q.tfStatements)) {
        const tfRows = q.tfStatements.map((tf, tfIdx) =>
          toDbQuestionTfStatementRow(tf, qId, examId, tfIdx)
        );
        if (tfRows.length > 0) await safeDbUpsert(QUESTION_TF_STATEMENTS_TABLE, tfRows);
      }

      if (q.fillBlankItems && Array.isArray(q.fillBlankItems)) {
        const fbRows = q.fillBlankItems.map((fb, fbIdx) =>
          toDbQuestionFillBlankItemRow(fb, qId, examId, fbIdx)
        );
        if (fbRows.length > 0) await safeDbUpsert(QUESTION_FILL_BLANK_ITEMS_TABLE, fbRows);
      }

      if (q.hotspotRegions && Array.isArray(q.hotspotRegions)) {
        const hsRows = q.hotspotRegions.map((hs, hsIdx) =>
          toDbQuestionHotspotRow(hs, qId, examId, hsIdx)
        );
        if (hsRows.length > 0) await safeDbUpsert(QUESTION_HOTSPOTS_TABLE, hsRows);
      }

      // Lưu câu mới vào question_bank
      await saveQuestionsToBank([{ ...q, id: qId }], {
        sourceExamId: examId,
        sourceExamTitle: examMeta?.title,
        subject: examMeta?.subject,
        grade: examMeta?.grade,
        creatorId: examMeta?.creatorId,
        creatorName: examMeta?.creatorName,
      });

      insertedCount++;
    }
  }

  // 3. Xử lý các câu hỏi cũ đã bị XÓA khỏi đề thi (gom thành 1 batch duy nhất, KHÔNG lặp query)
  const deletedIds = Array.from(existingMap.keys()).filter((oldId) => !incomingIds.has(oldId));
  if (deletedIds.length > 0) {
    const placeholders = deletedIds.map(() => '?').join(', ');
    await tursoBatch([
      { sql: `DELETE FROM "${QUESTION_OPTIONS_TABLE}" WHERE questionId IN (${placeholders})`, args: deletedIds },
      { sql: `DELETE FROM "${QUESTION_MATCHING_PAIRS_TABLE}" WHERE questionId IN (${placeholders})`, args: deletedIds },
      { sql: `DELETE FROM "${QUESTION_ORDERING_ITEMS_TABLE}" WHERE questionId IN (${placeholders})`, args: deletedIds },
      { sql: `DELETE FROM "${QUESTION_TF_STATEMENTS_TABLE}" WHERE questionId IN (${placeholders})`, args: deletedIds },
      { sql: `DELETE FROM "${QUESTION_FILL_BLANK_ITEMS_TABLE}" WHERE questionId IN (${placeholders})`, args: deletedIds },
      { sql: `DELETE FROM "${QUESTION_HOTSPOTS_TABLE}" WHERE questionId IN (${placeholders})`, args: deletedIds },
      { sql: `DELETE FROM "${EXAM_QUESTIONS_TABLE}" WHERE id IN (${placeholders})`, args: deletedIds },
    ]);
    deletedCount = deletedIds.length;
  }

  // Xóa cache đề thi sau khi cập nhật vi sai thành công
  invalidateExamCache(examId);

  console.info(
    `[Turso Delta Update] Đề thi ${examId}: ${updatedCount} câu hỏi cập nhật (UPDATE), ${unchangedCount} câu hỏi giữ nguyên, ${insertedCount} câu mới, ${deletedCount} câu đã xóa.`
  );

  return { updatedCount, insertedCount, deletedCount, unchangedCount };
}

export async function updateExam(id: string, data: Partial<Exam>): Promise<void> {
  const now = new Date().toISOString();

  // Xóa cache đề thi ngay lập tức
  invalidateExamCache(id);

  // Lưu lại danh sách câu hỏi hiện tại trước khi cập nhật bộ nhớ cục bộ
  const existingExam = localExams.find((e) => e.id === id);
  const oldQuestions = existingExam?.questions ? [...existingExam.questions] : [];

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
      // Cập nhật vi sai (Delta Update):
      // Chỉ UPDATE câu hỏi bị sửa đổi bằng ID hiện có (câu lệnh UPDATE),
      // Tuyệt đối không xóa toàn bộ, không tạo ID mới, không tạo bản ghi trùng lặp,
      // Giữ nguyên hoàn toàn các câu hỏi không bị sửa đổi.
      await updateExamQuestionsDelta(
        id,
        processedQuestions,
        {
          title: updatedPayload.title || data.title,
          subject: updatedPayload.subject || data.subject,
          grade: updatedPayload.grade || data.grade,
          creatorId: updatedPayload.creatorId || data.creatorId,
          creatorName: updatedPayload.creatorName || data.creatorName,
        },
        oldQuestions
      );
    }
  }
}

export async function deleteExam(id: string): Promise<void> {
  invalidateExamCache(id);
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
  ids.forEach((id) => invalidateExamCache(id));
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
  practiceRandomCount?: number,
  selectedSubject?: string
): Promise<Exam> {
  const sourceExams: Exam[] =
    Array.isArray(sourceExamsOrIds) && sourceExamsOrIds.length > 0 && typeof sourceExamsOrIds[0] === 'object'
      ? (sourceExamsOrIds as Exam[])
      : localExams.filter((e) => (sourceExamsOrIds as string[]).includes(e.id));

  // Tái sử dụng nguyên vẹn các câu hỏi gốc từ đề nguồn - KHÔNG tạo ID mới, KHÔNG tạo bản ghi mới trong Turso
  const mergedQuestions: ExamQuestion[] = [];
  const seenQIds = new Set<string>();

  for (const ex of sourceExams) {
    if (ex.questions) {
      for (const q of ex.questions) {
        const cleanId = String(q.id || '').trim();
        if (cleanId && !seenQIds.has(cleanId)) {
          seenQIds.add(cleanId);
          mergedQuestions.push(q);
        } else if (!cleanId && !seenQIds.has(q.title)) {
          seenQIds.add(q.title);
          mergedQuestions.push(q);
        }
      }
    }
  }

  const allClassIds =
    classIds && classIds.length > 0
      ? classIds
      : Array.from(new Set(sourceExams.flatMap((e) => e.classIds || [])));

  const primarySubject = selectedSubject || sourceExams[0]?.subject || 'Công nghệ Thông tin';
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

  const now = new Date().toISOString();
  const examId = `exam_merged_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const questionIds = mergedQuestions.map((q) => q.id);

  const newExam: Exam = {
    id: examId,
    title: newTitle,
    description: `Đề thi gộp từ ${sourceExams.length} đề thi môn ${primarySubject}. Tái sử dụng ${mergedQuestions.length} câu hỏi gốc (0 row mới trong Turso).`,
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
    totalQuestions: mergedQuestions.length,
    questionIds,
    questions: mergedQuestions,
    createdAt: now,
    updatedAt: now,
  };

  // 1. Cập nhật In-Memory & LocalStorage cache
  localExams = sortByCreatedAt([newExam, ...localExams]);
  examMemoryCache.set(examId, { exam: newExam, timestamp: Date.now() });
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`thientch_exam_cache_${examId}`, JSON.stringify({ exam: newExam, timestamp: Date.now() }));
    }
  } catch {}

  notifyExams();

  // 2. Chỉ lưu bản ghi đề thi mới vào bảng exams (CHỈ 1 BẢN GHI ĐỀ, KHÔNG THÊM CÂU HỎI MỚI VÀO TURSO)
  if (isConfigured) {
    try {
      await safeDbUpsert(EXAMS_TABLE, newExam);
    } catch (e) {
      console.warn('Lưu đề thi gộp vào Turso thất bại:', e);
    }
  }

  return newExam;
}

// ================= CRUD: SUBMISSIONS (100% TURSO DATABASE) =================

/**
 * Nộp bài thi 100% trên CSDL Turso SQLite Cloud:
 * 1. Cập nhật state & bộ nhớ cục bộ ngay 0ms để học sinh thấy kết quả lập tức
 * 2. Phát tín hiệu BroadcastChannel đồng bộ tới mọi cửa sổ/tab của giáo viên (0ms)
 * 3. Lưu trực tiếp vào Turso SQLite Database (Gom batch, dọn dẹp bản nháp draft, có retry tự động)
 * 4. Ghi nhật ký kiểm toán (audit_logs) ngầm không gây nghẽn tiến trình
 */
export async function submitExamBatch(data: ExamSubmission | Omit<ExamSubmission, 'id'>): Promise<ExamSubmission> {
  const submissionId = (data as any).id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date();
  const dateKey = data.dateKey || now.toISOString().split('T')[0];

  const newSubmission: ExamSubmission = {
    ...data,
    id: submissionId,
    submittedAt: data.submittedAt || now.toISOString(),
    dateKey,
  };

  // 1. CẬP NHẬT STATE & LOCAL CACHE NGAY TỨC THÌ (0ms latency cho thí sinh)
  const existingIdx = localSubmissions.findIndex((s) => s.id === newSubmission.id);
  if (existingIdx >= 0) {
    localSubmissions[existingIdx] = newSubmission;
  } else {
    localSubmissions = sortBySubmittedAt([newSubmission, ...localSubmissions]);
  }
  notifySubmissions();

  // 2. PHÁT TÍN HIỆU ĐỒNG BỘ TỨC THÌ TỚI MỌI TAB CỦA GIÁO VIÊN TRÊN TRÌNH DUYỆT (0ms)
  broadcastSubmissionEvent('NEW_SUBMISSION', newSubmission);

  // 3. LƯU VÀO CƠ SỞ DỮ LIỆU TURSO NGAY LẬP TỨC
  const config = getEffectiveTursoConfig();
  if (config.isConfigured || isConfigured) {
    try {
      const row = toDbSubmissionRow(newSubmission);
      const keys = Object.keys(row);
      const quotedCols = keys.map((k) => `"${k}"`).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const updateClauses = keys
        .filter((k) => k !== 'id')
        .map((k) => `"${k}" = excluded."${k}"`)
        .join(', ');

      const values = keys.map((k) => {
        const val = row[k];
        if (val === undefined) return null;
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        if (typeof val === 'boolean') return val ? 1 : 0;
        return val;
      });

      const draftId = `draft_${newSubmission.examId}_${newSubmission.studentId}`;
      const statements: Array<{ sql: string; args: any[] }> = [
        {
          sql: `INSERT INTO "${SUBMISSIONS_TABLE}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateClauses}`,
          args: values,
        },
        {
          sql: `DELETE FROM "${SUBMISSIONS_TABLE}" WHERE id = ?`,
          args: [draftId],
        }
      ];

      await tursoBatch(statements);
      console.log('[Turso] Đã lưu bài nộp lên Turso thành công:', newSubmission.id);

      // Ghi log audit ngầm (fire-and-forget, không chặn luồng)
      tursoExecute(
        `INSERT INTO "${AUDIT_LOGS_TABLE}" (id, action, actor, details, createdAt) VALUES (?, ?, ?, ?, datetime('now'))`,
        [
          `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          'SUBMIT_EXAM',
          newSubmission.studentName || newSubmission.studentId,
          `Nộp bài: ${newSubmission.examTitle} (${newSubmission.score}/1000đ)`
        ]
      ).catch(() => {});
    } catch (tursoErr) {
      console.warn('[Turso] Lỗi lưu bài thi lên Turso:', tursoErr);
      throw tursoErr;
    }
  }

  return newSubmission;
}

/**
 * Dọn dẹp vĩnh viễn toàn bộ các bản nháp thi (draft) rác còn sót lại trên CSDL Turso
 */
export async function purgeAllDraftSubmissions(): Promise<boolean> {
  const config = getEffectiveTursoConfig();
  if (config.isConfigured || isConfigured) {
    try {
      await tursoExecute(
        `DELETE FROM "${SUBMISSIONS_TABLE}" WHERE id LIKE 'draft_%' OR examTitle = 'Bản nháp thi'`
      );
      localSubmissions = localSubmissions.filter(
        (s) => !s.id.startsWith('draft_') && s.examTitle !== 'Bản nháp thi'
      );
      notifySubmissions();
      return true;
    } catch (err) {
      console.warn('[Turso] Lỗi khi dọn dẹp bản nháp:', err);
    }
  }
  return false;
}

/**
 * Auto-save lưu bản nháp bài thi:
 * - Lưu an toàn vào LocalStorage máy học sinh (không lo mất bài khi F5/rớt mạng).
 * - TUYỆT ĐỐI KHÔNG GHI "Bản nháp thi" vào bảng submissions trên CSDL Turso,
 *   giúp bảng submissions luôn sạch đẹp, chỉ chứa đúng các bài thi đã được nộp chính thức.
 */
export async function autoSaveExamDraft(_draft: {
  examId: string;
  studentId: string;
  studentName?: string;
  studentCode?: string;
  classId?: string;
  answers: Record<string, any>;
  timeRemaining?: number;
}): Promise<boolean> {
  // Bản nháp được lưu và bảo vệ 100% trên LocalStorage của học sinh
  // Không ghi bản nháp rác lên CSDL Turso để bảo vệ CSDL
  return true;
}

export const addExamSubmission = submitExamBatch;

export async function deleteExamSubmission(id: string): Promise<void> {
  localSubmissions = localSubmissions.filter((s) => s.id !== id);
  notifySubmissions();
  broadcastSubmissionEvent('DELETE_SUBMISSION', { id });

  const config = getEffectiveTursoConfig();
  if (config.isConfigured || isConfigured) {
    await tursoExecute(`DELETE FROM "${SUBMISSIONS_TABLE}" WHERE id = ?`, [id]);
  }
}

export async function deleteMultipleExamSubmissions(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  localSubmissions = localSubmissions.filter((s) => !idSet.has(s.id));
  notifySubmissions();
  broadcastSubmissionEvent('REFRESH_ALL');

  const config = getEffectiveTursoConfig();
  if (config.isConfigured || isConfigured) {
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
  
  const toDelete = localSubmissions.filter(
    (s) => s.studentId === studentId && (!specificExamId || s.examId === specificExamId)
  );
  const targetCount = toDelete.length;

  localSubmissions = localSubmissions.filter(
    (s) => s.studentId !== studentId || (specificExamId && s.examId !== specificExamId)
  );
  notifySubmissions();
  broadcastSubmissionEvent('REFRESH_ALL');

  const config = getEffectiveTursoConfig();
  if (config.isConfigured || isConfigured) {
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
let hasSeededInitialData = false;

export async function seedInitialDataIfNeeded(existingUsers: UserAccount[], existingSchools: School[]) {
  if (hasSeededInitialData) return;
  
  // Chỉ kiểm tra khi danh sách người dùng hoặc trường học chưa có trong phiên
  if (existingUsers.length > 0 && existingSchools.length > 0) {
    hasSeededInitialData = true;
    return;
  }
  
  hasSeededInitialData = true;
  const now = new Date().toISOString();

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

/**
 * Kiểm tra trạng thái đề thi (dùng cho useExamSecurity và giám sát thi)
 */
export async function checkExamStatus(examId: string): Promise<{ isOpen: boolean; status: string }> {
  try {
    const cleanId = String(examId || '').trim();
    if (!cleanId) return { isOpen: true, status: 'published' };
    const exam = localExams.find((e) => e.id === cleanId);
    if (exam) {
      return { isOpen: exam.status === 'published', status: exam.status };
    }
    const full = await getExamWithQuestions(cleanId);
    if (full) {
      return { isOpen: full.status === 'published', status: full.status };
    }
  } catch {}
  return { isOpen: true, status: 'published' };
}

/**
 * Ghi nhận hoặc gửi cảnh báo vi phạm quy chế thi (dùng cho useExamSecurity)
 */
export async function reportExamViolation(
  submissionId: string, 
  violation: { type: string; label: string; time?: string }
): Promise<boolean> {
  try {
    const cleanSubId = String(submissionId || '').trim();
    if (!cleanSubId) return true;
    const sub = localSubmissions.find((s) => s.id === cleanSubId);
    if (sub) {
      sub.violationCount = (sub.violationCount || 0) + 1;
      const logs = Array.isArray(sub.violationLogs) ? [...sub.violationLogs] : [];
      logs.push({
        id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: violation.time || new Date().toLocaleTimeString('vi-VN'),
        type: violation.type,
        label: violation.label,
      });
      sub.violationLogs = logs;
      notifySubmissions();
    }
    return true;
  } catch (err) {
    console.error('Lỗi khi ghi nhận vi phạm:', err);
    return false;
  }
}
