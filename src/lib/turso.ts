import { createClient, Client, ResultSet } from '@libsql/client/web';

/**
 * =========================================================================
 * CẤU HÌNH DATABASE TURSO (LIBSQL) - SINGLETON, STATELESS HTTPS, RETRY & BATCH
 * =========================================================================
 * 
 * 1. Ép kiểu URL sang HTTP Stateless:
 *    Tự động chuyển tiền tố libsql:// thành https:// để kết nối qua giao thức
 *    HTTP REST không duy trì WebSocket/socket connection lâu dài, loại trừ hoàn toàn
 *    các lỗi socket drop (ECONNRESET, socket hang up).
 * 
 * 2. Custom fetch với Timeout tối thiểu 10 giây:
 *    Sử dụng AbortSignal.timeout(10000) chuẩn hiện đại để tránh treo request.
 * 
 * 3. Singleton Client Pattern:
 *    Tái sử dụng một instance duy nhất xuyên suốt toàn bộ ứng dụng và các API handler,
 *    không khởi tạo client mới trong từng route hay từng truy vấn.
 * 
 * 4. Cơ chế Retry tự động với Exponential Backoff (Tối thiểu 3 lần):
 *    Tự động bắt các lỗi tạm thời (ECONNRESET, fetch failed, timeout, 502/503/504)
 *    và thử lại với độ trễ tăng theo hàm mũ (exponential backoff).
 * 
 * 5. Batching Transaction (db.batch(queries, 'write')):
 *    Gom nhiều câu lệnh ghi vào đúng một giao dịch duy nhất để tránh nghẽn write-lock.
 */

/**
 * 1. Chuẩn hóa và ép kiểu URL sang HTTPS stateless
 */
export function sanitizeTursoUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let trimmed = rawUrl.trim();
  
  // Tự động ép kiểu sang HTTPS stateless để tránh ngắt kết nối WebSocket/ECONNRESET
  if (/^libsql:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed.slice(9);
  }

  // Trích xuất URL chuẩn dạng https://[db-name]-[org-name].turso.io
  const match = trimmed.match(/https:\/\/[a-z0-9_-]+\.turso\.io/i);
  if (match) {
    return match[0].toLowerCase();
  }

  let cleaned = trimmed.replace(/[()\[\]"']/g, '').trim();
  if (/^libsql:\/\//i.test(cleaned)) {
    cleaned = 'https://' + cleaned.slice(9);
  }
  if (!cleaned.startsWith('https://') && !cleaned.startsWith('http://') && cleaned.includes('.turso.io')) {
    cleaned = 'https://' + cleaned;
  }
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

/**
 * Chuẩn hóa Turso Auth Token
 */
export function sanitizeTursoToken(rawToken: string): string {
  if (!rawToken) return '';
  return rawToken.trim().replace(/["'\s()]/g, '');
}

function getStoredUrl(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const custom = localStorage.getItem('thientch_turso_url');
      if (custom) {
        const sanitized = sanitizeTursoUrl(custom);
        if (sanitized.startsWith('https://')) return sanitized;
      }
    }
  } catch {}

  const fromVite = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURSO_DATABASE_URL) || '';
  const fromProcess = typeof process !== 'undefined' && process.env?.TURSO_DATABASE_URL ? process.env.TURSO_DATABASE_URL.trim() : '';
  const envUrl = (fromVite || fromProcess).trim();
  return sanitizeTursoUrl(envUrl);
}

function getStoredToken(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const custom = localStorage.getItem('thientch_turso_token');
      if (custom) {
        const sanitized = sanitizeTursoToken(custom);
        if (sanitized.length > 15) return sanitized;
      }
    }
  } catch {}

  const fromVite = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURSO_AUTH_TOKEN) || '';
  const fromProcess = typeof process !== 'undefined' && process.env?.TURSO_AUTH_TOKEN ? process.env.TURSO_AUTH_TOKEN.trim() : '';
  const envToken = (fromVite || fromProcess).trim();
  return sanitizeTursoToken(envToken);
}

export function validateTursoCredentials(url: string, token: string): boolean {
  const cleanUrl = sanitizeTursoUrl(url);
  const cleanToken = sanitizeTursoToken(token);
  return Boolean(
    cleanUrl &&
    cleanToken &&
    cleanUrl.startsWith('https://') &&
    !cleanUrl.includes('your-database') &&
    !cleanUrl.includes('placeholder') &&
    !cleanToken.includes('your-turso') &&
    !cleanToken.includes('placeholder') &&
    cleanToken.length > 15
  );
}

export const activeUrl = getStoredUrl();
export const activeToken = getStoredToken();

export const isConfigured = validateTursoCredentials(activeUrl, activeToken);

// Fallback URL if waiting for user credentials
export const tursoUrl = isConfigured ? activeUrl : 'https://placeholder.turso.io';
export const tursoAuthToken = isConfigured ? activeToken : 'dummy-token';

/**
 * 2. Custom fetch với Timeout tối thiểu 10 giây (10000ms) sử dụng AbortSignal.timeout
 * Đảm bảo các kết nối không bị treo vô hạn hoặc gặp lỗi mạng ngắt quãng
 */
export function createTursoFetch(timeoutMs = 10000): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let signal: AbortSignal;

    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      if (init?.signal) {
        if (typeof (AbortSignal as any).any === 'function') {
          signal = (AbortSignal as any).any([timeoutSignal, init.signal]);
        } else {
          const controller = new AbortController();
          const onAbort = () => controller.abort();
          timeoutSignal.addEventListener('abort', onAbort);
          init.signal.addEventListener('abort', onAbort);
          signal = controller.signal;
        }
      } else {
        signal = timeoutSignal;
      }
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      if (init?.signal) {
        init.signal.addEventListener('abort', () => controller.abort());
      }
      signal = controller.signal;
      // Cleanup timeout on finish
      const cleanup = () => clearTimeout(timeoutId);
      signal.addEventListener('abort', cleanup);
    }

    try {
      return await fetch(input, {
        ...init,
        signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || signal.aborted) {
        const timeoutErr = new Error(`Turso request timeout sau ${timeoutMs}ms`);
        (timeoutErr as any).code = 'ETIMEDOUT';
        throw timeoutErr;
      }
      throw err;
    }
  };
}

/**
 * 3. Turso Client Singleton: Khởi tạo 1 instance duy nhất, tái sử dụng xuyên suốt toàn app
 */
let tursoSingletonInstance: Client | null = null;
let currentConfiguredUrl = '';
let currentConfiguredToken = '';

export function getTursoClient(): Client {
  const effectiveConfig = getEffectiveTursoConfig();
  const targetUrl = effectiveConfig.isConfigured ? effectiveConfig.url : 'https://placeholder.turso.io';
  const targetToken = effectiveConfig.isConfigured ? effectiveConfig.token : 'dummy-token';

  if (!tursoSingletonInstance || currentConfiguredUrl !== targetUrl || currentConfiguredToken !== targetToken) {
    currentConfiguredUrl = targetUrl;
    currentConfiguredToken = targetToken;
    tursoSingletonInstance = createClient({
      url: targetUrl,
      authToken: targetToken,
      fetch: createTursoFetch(10000), // Timeout tối thiểu 10s
    });
  }
  return tursoSingletonInstance;
}

// Proxy export để tương thích 100% với các file import { turso }
export const turso: Client = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getTursoClient();
    const val = (client as any)[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});

export function getEffectiveTursoConfig(): {
  url: string;
  token: string;
  isCustom: boolean;
  isConfigured: boolean;
} {
  let customUrl = '';
  let customToken = '';
  try {
    if (typeof localStorage !== 'undefined') {
      customUrl = localStorage.getItem('thientch_turso_url') || '';
      customToken = localStorage.getItem('thientch_turso_token') || '';
    }
  } catch {}

  const currentUrl = customUrl ? sanitizeTursoUrl(customUrl) : activeUrl;
  const currentToken = customToken ? sanitizeTursoToken(customToken) : activeToken;
  return {
    url: currentUrl,
    token: currentToken,
    isCustom: Boolean(customUrl && customToken),
    isConfigured: validateTursoCredentials(currentUrl, currentToken),
  };
}

export function saveCustomTursoConfig(url: string, token: string): void {
  try {
    const cleanUrl = sanitizeTursoUrl(url);
    const cleanToken = sanitizeTursoToken(token);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('thientch_turso_url', cleanUrl);
      localStorage.setItem('thientch_turso_token', cleanToken);
    }
    // Reset singleton để tạo lại client với credentials mới
    tursoSingletonInstance = null;
  } catch {}
}

export function clearCustomTursoConfig(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('thientch_turso_url');
      localStorage.removeItem('thientch_turso_token');
    }
    tursoSingletonInstance = null;
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
 * 4. Cơ chế Retry tự động với Exponential Backoff (tối thiểu 3 lần)
 * Tự động thử lại khi gặp ECONNRESET, timeout, fetch failed, socket hang up...
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 600
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const message = String(err?.message || err || '').toLowerCase();
      const code = String(err?.code || '').toLowerCase();

      const isTransientNetworkError =
        message.includes('econnreset') ||
        message.includes('fetch failed') ||
        message.includes('failed to fetch') ||
        message.includes('timeout') ||
        message.includes('etimedout') ||
        message.includes('abort') ||
        message.includes('network') ||
        message.includes('socket hang up') ||
        message.includes('connection reset') ||
        message.includes('load failed') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504') ||
        code.includes('econnreset') ||
        code.includes('etimedout') ||
        code.includes('enetdown') ||
        code.includes('enetunreach');

      if (attempt < maxRetries && isTransientNetworkError) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200;
        console.warn(
          `[Turso Retry] Gặp lỗi mạng tạm thời (${message || code}). Tự động thử lại lần ${attempt}/${maxRetries} sau ${Math.round(delay)}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Execute a SELECT query and return an array of typed objects (có Retry)
 */
export async function tursoQuery<T = any>(sql: string, args: any[] = []): Promise<T[]> {
  const config = getEffectiveTursoConfig();
  if (!config.isConfigured) return [];
  try {
    const res = await executeWithRetry(() => getTursoClient().execute({ sql, args }), 3, 600);
    return res.rows.map((r) => rowToObject<T>(res.columns, r));
  } catch (err: any) {
    handleTursoError(err, OperationType.GET, sql);
    throw err;
  }
}

/**
 * Execute an INSERT, UPDATE, or DELETE statement (có Retry)
 */
export async function tursoExecute(sql: string, args: any[] = []): Promise<ResultSet> {
  const config = getEffectiveTursoConfig();
  if (!config.isConfigured) {
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
    return await executeWithRetry(() => getTursoClient().execute({ sql, args }), 3, 600);
  } catch (err: any) {
    handleTursoError(err, OperationType.WRITE, sql);
    throw err;
  }
}

/**
 * 5. Execute batch statements in transaction (db.batch(statements, 'write') kèm Retry)
 * Gom toàn bộ thao tác vào 1 Transaction duy nhất tránh nghẽn write-lock.
 */
export async function tursoBatch(statements: Array<{ sql: string; args?: any[] }>): Promise<ResultSet[]> {
  const config = getEffectiveTursoConfig();
  if (!config.isConfigured || statements.length === 0) return [];
  try {
    return await executeWithRetry(() => getTursoClient().batch(statements, 'write'), 3, 600);
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
    const testClient = createClient({
      url,
      authToken: token,
      fetch: createTursoFetch(10000),
    });
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
 * Initialize all SQLite tables on Turso Database
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
      schoolIds TEXT DEFAULT '[]',
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
      updatedAt TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS question_options (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      examId TEXT NOT NULL,
      orderIndex INTEGER DEFAULT 0,
      text TEXT NOT NULL,
      imageUrl TEXT,
      isCorrect INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
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
      createdAt TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS question_ordering_items (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      examId TEXT NOT NULL,
      orderIndex INTEGER DEFAULT 0,
      text TEXT NOT NULL,
      imageUrl TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS question_tf_statements (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      examId TEXT NOT NULL,
      orderIndex INTEGER DEFAULT 0,
      statement TEXT NOT NULL,
      isTrue INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS question_fill_blank_items (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      examId TEXT NOT NULL,
      orderIndex INTEGER DEFAULT 0,
      placeholderCode TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]',
      correctAnswer TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
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
      createdAt TEXT DEFAULT (datetime('now'))
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

    const migrations = [
      `ALTER TABLE users ADD COLUMN schoolIds TEXT DEFAULT '[]'`,
      `ALTER TABLE users ADD COLUMN subjects TEXT`,
      `ALTER TABLE users ADD COLUMN phone TEXT`,
      `ALTER TABLE users ADD COLUMN email TEXT`,
      `ALTER TABLE users ADD COLUMN schoolId TEXT`,
      `ALTER TABLE users ADD COLUMN classIds TEXT DEFAULT '[]'`,
      `ALTER TABLE classes ADD COLUMN schoolId TEXT`,
      `ALTER TABLE students ADD COLUMN schoolId TEXT`,
      `ALTER TABLE exam_questions ADD COLUMN examId TEXT`,
      `ALTER TABLE question_bank ADD COLUMN examId TEXT`,
    ];
    for (const m of migrations) {
      try {
        await client.execute(m);
      } catch {}
    }

    return {
      success: true,
      message: 'Đã khởi tạo và đồng bộ thành công toàn bộ bảng & trường dữ liệu trên Turso Database!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi khởi tạo bảng Turso: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Test Turso connection on app load & ensure essential column migrations
 */
export async function testConnection(): Promise<boolean> {
  if (!isConfigured) return false;
  try {
    await turso.execute('SELECT 1');
    console.log('[Turso] Đã kết nối Turso Database thành công.');
    turso.execute(`ALTER TABLE users ADD COLUMN schoolIds TEXT DEFAULT '[]'`).catch(() => {});
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
