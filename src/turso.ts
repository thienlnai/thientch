import { createClient, Client, ResultSet } from '@libsql/client/web';

/**
 * Auto-sanitize Turso Database URL
 * Supports: libsql://[db-name]-[org-name].turso.io or https://[db-name]-[org-name].turso.io
 */
export function sanitizeTursoUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  // Extract standard Turso or HTTP URL if copied with trailing spaces or brackets
  const match = trimmed.match(/(libsql|https):\/\/[a-z0-9_-]+\.turso\.io/i);
  if (match) {
    return match[0];
  }
  let cleaned = trimmed.replace(/[()\[\]"']/g, '').trim();
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

/**
 * Auto-sanitize Turso Auth Token
 */
export function sanitizeTursoToken(rawToken: string): string {
  if (!rawToken) return '';
  return rawToken.trim().replace(/["'\s()]/g, '');
}

function getStoredUrl(): string {
  try {
    const custom = localStorage.getItem('thientch_turso_url');
    if (custom) {
      const sanitized = sanitizeTursoUrl(custom);
      if (sanitized.startsWith('libsql://') || sanitized.startsWith('https://')) return sanitized;
    }
  } catch {}

  const fromVite = (import.meta.env.VITE_TURSO_DATABASE_URL || '').trim();
  const fromProcess = typeof process !== 'undefined' && process.env?.TURSO_DATABASE_URL ? process.env.TURSO_DATABASE_URL.trim() : '';
  const envUrl = fromVite || fromProcess;
  return sanitizeTursoUrl(envUrl);
}

function getStoredToken(): string {
  try {
    const custom = localStorage.getItem('thientch_turso_token');
    if (custom) {
      const sanitized = sanitizeTursoToken(custom);
      if (sanitized.length > 15) return sanitized;
    }
  } catch {}

  const fromVite = (import.meta.env.VITE_TURSO_AUTH_TOKEN || '').trim();
  const fromProcess = typeof process !== 'undefined' && process.env?.TURSO_AUTH_TOKEN ? process.env.TURSO_AUTH_TOKEN.trim() : '';
  const envToken = fromVite || fromProcess;
  return sanitizeTursoToken(envToken);
}

export function validateTursoCredentials(url: string, token: string): boolean {
  const cleanUrl = sanitizeTursoUrl(url);
  const cleanToken = sanitizeTursoToken(token);
  return Boolean(
    cleanUrl &&
    cleanToken &&
    (cleanUrl.startsWith('libsql://') || cleanUrl.startsWith('https://')) &&
    !cleanUrl.includes('your-database') &&
    !cleanUrl.includes('placeholder') &&
    !cleanToken.includes('your-turso') &&
    !cleanToken.includes('placeholder') &&
    cleanToken.length > 15
  );
}

const activeUrl = getStoredUrl();
const activeToken = getStoredToken();

export const isConfigured = validateTursoCredentials(activeUrl, activeToken);

// Fallback URL if waiting for user credentials
export const tursoUrl = isConfigured ? activeUrl : 'https://placeholder.turso.io';
export const tursoAuthToken = isConfigured ? activeToken : 'dummy-token';

export const turso: Client = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken,
});

export function getEffectiveTursoConfig(): {
  url: string;
  token: string;
  isCustom: boolean;
  isConfigured: boolean;
} {
  const customUrl = localStorage.getItem('thientch_turso_url') || '';
  const customToken = localStorage.getItem('thientch_turso_token') || '';
  return {
    url: activeUrl,
    token: activeToken,
    isCustom: Boolean(customUrl && customToken),
    isConfigured,
  };
}

export function saveCustomTursoConfig(url: string, token: string): void {
  try {
    localStorage.setItem('thientch_turso_url', sanitizeTursoUrl(url));
    localStorage.setItem('thientch_turso_token', sanitizeTursoToken(token));
  } catch {}
}

export function clearCustomTursoConfig(): void {
  try {
    localStorage.removeItem('thientch_turso_url');
    localStorage.removeItem('thientch_turso_token');
  } catch {}
}

// Convert ResultSet row to plain object
export function rowToObject<T = any>(columns: string[], row: any): T {
  const obj: Record<string, any> = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    obj[col] = row[col] !== undefined ? row[col] : row[i];
  }
  return obj as T;
}

/**
 * Execute a SELECT query and return an array of typed objects
 */
export async function tursoQuery<T = any>(sql: string, args: any[] = []): Promise<T[]> {
  if (!isConfigured) return [];
  try {
    const res = await turso.execute({ sql, args });
    return res.rows.map((r) => rowToObject<T>(res.columns, r));
  } catch (err: any) {
    handleTursoError(err, OperationType.GET, sql);
    throw err;
  }
}

/**
 * Execute an INSERT, UPDATE, or DELETE statement
 */
export async function tursoExecute(sql: string, args: any[] = []): Promise<ResultSet> {
  if (!isConfigured) {
    return {
      columns: [],
      columnTypes: [],
      rows: [],
      rowsAffected: 0,
      lastInsertRowid: undefined,
      toJSON: () => ({ columns: [], columnTypes: [], rows: [], rowsAffected: 0, lastInsertRowid: undefined }),
    } as unknown as ResultSet;
  }
  try {
    return await turso.execute({ sql, args });
  } catch (err: any) {
    handleTursoError(err, OperationType.WRITE, sql);
    throw err;
  }
}

/**
 * Execute batch statements in transaction
 */
export async function tursoBatch(statements: Array<{ sql: string; args?: any[] }>): Promise<ResultSet[]> {
  if (!isConfigured || statements.length === 0) return [];
  try {
    return await turso.batch(statements, 'write');
  } catch (err: any) {
    handleTursoError(err, OperationType.WRITE, 'BATCH');
    throw err;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface TursoErrorInfo {
  error: string;
  operationType: OperationType;
  table: string | null;
  timestamp: string;
}

type ErrorListener = (err: TursoErrorInfo) => void;
const errorListeners = new Set<ErrorListener>();

export function onTursoError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

export function handleTursoError(error: unknown, operationType: OperationType, table: string | null): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as any).message)
      : String(error);

  const isNetworkFailure =
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('ERR_NAME_NOT_RESOLVED') ||
    message.includes('Network request failed') ||
    message.includes('Load failed') ||
    message.includes('URL_SCHEME_NOT_SUPPORTED');

  if (isNetworkFailure) {
    console.warn(
      `[Turso Lưu Cục Bộ] Không thể kết nối tới máy chủ (${operationType} trên ${table}): ${message}. Hệ thống đang chuyển sang chế độ dữ liệu cục bộ an toàn.`
    );
    return;
  }

  const errInfo: TursoErrorInfo = {
    error: message,
    operationType,
    table,
    timestamp: new Date().toISOString(),
  };

  console.error('[Turso Error]:', JSON.stringify(errInfo));
  errorListeners.forEach((fn) => {
    try {
      fn(errInfo);
    } catch {}
  });
}

/**
 * Test custom Turso connection
 */
export async function testCustomConnection(
  rawUrl: string,
  rawToken: string
): Promise<{ success: boolean; message: string; sanitizedUrl?: string }> {
  const url = sanitizeTursoUrl(rawUrl);
  const token = sanitizeTursoToken(rawToken);

  if (!validateTursoCredentials(url, token)) {
    return {
      success: false,
      message: 'Địa chỉ URL hoặc Auth Token chưa đúng định dạng Turso (libsql:// hoặc https://).',
    };
  }

  try {
    const testClient = createClient({ url, authToken: token });
    const res = await testClient.execute('SELECT 1 as test');
    if (res && res.rows) {
      // Also check if schools table exists
      try {
        await testClient.execute('SELECT id FROM schools LIMIT 1');
        return {
          success: true,
          sanitizedUrl: url,
          message: `Đã kết nối thành công tới cơ sở dữ liệu Turso (${url})! Cấu trúc bảng đã sẵn sàng.`,
        };
      } catch (tableErr: any) {
        if (tableErr.message?.includes('no such table')) {
          return {
            success: true,
            sanitizedUrl: url,
            message: `Kết nối Turso thành công! Chưa tìm thấy các bảng dữ liệu. Hãy bấm nút "Khởi Tạo Bảng Tự Động" để hoàn tất.`,
          };
        }
      }

      return {
        success: true,
        sanitizedUrl: url,
        message: `Đã kết nối thành công tới ${url}!`,
      };
    }

    return {
      success: false,
      sanitizedUrl: url,
      message: 'Không nhận được dữ liệu phản hồi từ Turso.',
    };
  } catch (err: any) {
    return {
      success: false,
      sanitizedUrl: url,
      message: err?.message || 'Không thể kết nối tới máy chủ Turso.',
    };
  }
}

/**
 * Initialize all 15 SQLite tables on Turso Database
 */
export async function initTursoSchema(client: Client = turso): Promise<{ success: boolean; message: string }> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      level TEXT DEFAULT 'highschool',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS classes (
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
    );`,
    `CREATE TABLE IF NOT EXISTS students (
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
    );`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      fullName TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      subjects TEXT,
      schoolId TEXT,
      classIds TEXT DEFAULT '[]',
      role TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      lastLogin TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS exams (
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
    );`,
    `CREATE TABLE IF NOT EXISTS exam_questions (
      id TEXT PRIMARY KEY,
      examId TEXT NOT NULL,
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
      FOREIGN KEY (examId) REFERENCES exams(id) ON DELETE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS question_options (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      examId TEXT NOT NULL,
      orderIndex INTEGER DEFAULT 0,
      text TEXT NOT NULL,
      imageUrl TEXT,
      isCorrect INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (questionId) REFERENCES exam_questions(id) ON DELETE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS question_matching_pairs (
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
    );`,
    `CREATE TABLE IF NOT EXISTS question_ordering_items (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      examId TEXT NOT NULL,
      orderIndex INTEGER DEFAULT 0,
      text TEXT NOT NULL,
      imageUrl TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (questionId) REFERENCES exam_questions(id) ON DELETE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS question_tf_statements (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      examId TEXT NOT NULL,
      orderIndex INTEGER DEFAULT 0,
      statement TEXT NOT NULL,
      isTrue INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (questionId) REFERENCES exam_questions(id) ON DELETE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS question_fill_blank_items (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      examId TEXT NOT NULL,
      orderIndex INTEGER DEFAULT 0,
      placeholderCode TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]',
      correctAnswer TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (questionId) REFERENCES exam_questions(id) ON DELETE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS question_hotspots (
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
    );`,
    `CREATE TABLE IF NOT EXISTS question_bank (
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
    );`,
    `CREATE TABLE IF NOT EXISTS submissions (
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
    );`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT,
      actor TEXT,
      details TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_classes_schoolId ON classes(schoolId);`,
    `CREATE INDEX IF NOT EXISTS idx_students_classId ON students(classId);`,
    `CREATE INDEX IF NOT EXISTS idx_students_code ON students(studentCode);`,
    `CREATE INDEX IF NOT EXISTS idx_exam_questions_examId ON exam_questions(examId);`,
    `CREATE INDEX IF NOT EXISTS idx_question_options_qId ON question_options(questionId);`,
    `CREATE INDEX IF NOT EXISTS idx_question_matching_qId ON question_matching_pairs(questionId);`,
    `CREATE INDEX IF NOT EXISTS idx_question_ordering_qId ON question_ordering_items(questionId);`,
    `CREATE INDEX IF NOT EXISTS idx_question_tf_qId ON question_tf_statements(questionId);`,
    `CREATE INDEX IF NOT EXISTS idx_question_fb_qId ON question_fill_blank_items(questionId);`,
    `CREATE INDEX IF NOT EXISTS idx_question_hs_qId ON question_hotspots(questionId);`,
    `CREATE INDEX IF NOT EXISTS idx_submissions_examId ON submissions(examId);`,
    `CREATE INDEX IF NOT EXISTS idx_submissions_studentId ON submissions(studentId);`,
  ];

  try {
    for (const sql of statements) {
      await client.execute(sql);
    }
    return {
      success: true,
      message: 'Đã khởi tạo thành công toàn bộ 15 bảng và chỉ mục trên Turso Database!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi khởi tạo bảng Turso: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Test Turso connection on app load
 */
export async function testConnection(): Promise<boolean> {
  if (!isConfigured) return false;
  try {
    await turso.execute('SELECT 1');
    console.log('[Turso] Đã kết nối Turso Database thành công.');
    return true;
  } catch (err) {
    console.warn('[Turso] Không thể kết nối tới Turso:', err);
    return false;
  }
}

// ================= BACKWARD-COMPATIBILITY ALIASES =================
export const onSupabaseError = onTursoError;
export const handleSupabaseError = handleTursoError;
export const getEffectiveSupabaseConfig = getEffectiveTursoConfig;
export const saveCustomSupabaseConfig = saveCustomTursoConfig;
export const clearCustomSupabaseConfig = clearCustomTursoConfig;
export const sanitizeSupabaseUrl = sanitizeTursoUrl;
export const sanitizeAnonKey = sanitizeTursoToken;
export const supabase = turso as any;
