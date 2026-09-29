import { getTursoClient, executeWithRetry, sanitizeTursoUrl, sanitizeTursoToken, createTursoFetch } from '../src/lib/turso.ts';

/**
 * =========================================================================
 * API ROUTE: NỘP BÀI THI & AUTO-SAVE (BATCHING + RETRY CHỐNG WRITE-LOCK)
 * =========================================================================
 * - Tương thích 100% Vercel Serverless Functions & Express handler.
 * - Tuyệt đối không dùng vòng lặp for...of để db.execute từng câu hỏi hoặc từng bảng.
 * - Sử dụng db.batch(queries, "write") gom toàn bộ bài thi và log vào 1 Transaction duy nhất.
 * - Bọc toàn bộ quá trình bằng executeWithRetry (tối thiểu 3 lần, exponential backoff)
 *   để triệt tiêu lỗi mạng tạm thời (ECONNRESET, socket hang up, fetch failed, timeout).
 */

export interface SubmitExamRequestBody {
  submission: {
    id: string;
    examId: string;
    examTitle: string;
    studentId: string;
    studentName: string;
    studentCode: string;
    classId: string;
    score: number;
    maxScore?: number;
    isPassed?: boolean;
    submittedAt?: string;
    dateKey?: string;
    timeSpentSeconds?: number;
    attemptNumber?: number;
    isPractice?: boolean;
    isTeacherTesting?: boolean;
    studentAnswers?: Record<string, any>;
    questionResults?: Record<string, any>;
    questionOrder?: string[];
    violationCount?: number;
    violationLogs?: Array<any>;
  };
  isDraft?: boolean;
}

export default async function handler(req: any, res: any) {
  // Chỉ cho phép phương thức POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Vui lòng gửi yêu cầu POST.',
    });
  }

  try {
    const body: SubmitExamRequestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { submission, isDraft = false } = body;

    if (!submission || !submission.examId || !submission.studentId) {
      return res.status(400).json({
        success: false,
        error: 'Dữ liệu bài nộp không hợp lệ (thiếu examId hoặc studentId).',
      });
    }

    const subId = submission.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = submission.submittedAt || new Date().toISOString();
    const dateKey = submission.dateKey || nowIso.split('T')[0];

    // Chuẩn bị dữ liệu an toàn cho SQLite Turso
    const answersJson = typeof submission.studentAnswers === 'string' 
      ? submission.studentAnswers 
      : JSON.stringify(submission.studentAnswers || {});
    
    const resultsJson = typeof submission.questionResults === 'string'
      ? submission.questionResults
      : JSON.stringify(submission.questionResults || {});

    const orderJson = typeof submission.questionOrder === 'string'
      ? submission.questionOrder
      : JSON.stringify(submission.questionOrder || []);

    const violationLogsJson = typeof submission.violationLogs === 'string'
      ? submission.violationLogs
      : JSON.stringify(submission.violationLogs || []);

    // 1. GOM TOÀN BỘ CÂU LỆNH VÀO TRANSACTION BATCH DUY NHẤT
    // Tuyệt đối không dùng for...of để db.execute từng bảng
    const batchQueries: Array<{ sql: string; args: any[] }> = [
      {
        sql: `INSERT INTO submissions (
          id, examId, examTitle, studentId, studentName, studentCode, classId,
          score, maxScore, isPassed, submittedAt, dateKey, timeSpentSeconds,
          attemptNumber, isPractice, isTeacherTesting, studentAnswers, questionResults,
          questionOrder, violationCount, violationLogs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          score = excluded.score,
          maxScore = excluded.maxScore,
          isPassed = excluded.isPassed,
          submittedAt = excluded.submittedAt,
          dateKey = excluded.dateKey,
          timeSpentSeconds = excluded.timeSpentSeconds,
          attemptNumber = excluded.attemptNumber,
          isPractice = excluded.isPractice,
          isTeacherTesting = excluded.isTeacherTesting,
          studentAnswers = excluded.studentAnswers,
          questionResults = excluded.questionResults,
          questionOrder = excluded.questionOrder,
          violationCount = excluded.violationCount,
          violationLogs = excluded.violationLogs`,
        args: [
          subId,
          String(submission.examId),
          String(submission.examTitle || 'Đề thi trắc nghiệm'),
          String(submission.studentId),
          String(submission.studentName || 'Học sinh'),
          String(submission.studentCode || ''),
          String(submission.classId || ''),
          Number(submission.score ?? 0),
          Number(submission.maxScore ?? 1000),
          submission.isPassed ? 1 : 0,
          nowIso,
          dateKey,
          Number(submission.timeSpentSeconds ?? 0),
          Number(submission.attemptNumber ?? 1),
          submission.isPractice ? 1 : 0,
          submission.isTeacherTesting ? 1 : 0,
          answersJson,
          resultsJson,
          orderJson,
          Number(submission.violationCount ?? 0),
          violationLogsJson,
        ],
      },
      // Kèm ghi nhật ký audit trong cùng 1 Transaction duy nhất
      {
        sql: `INSERT INTO audit_logs (id, action, actor, details, createdAt) VALUES (?, ?, ?, ?, datetime('now'))`,
        args: [
          `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          isDraft ? 'AUTO_SAVE_DRAFT' : 'SUBMIT_EXAM',
          submission.studentName || submission.studentId,
          isDraft
            ? `Auto-save bài thi: ${submission.examTitle} (Đã làm ${Object.keys(submission.studentAnswers || {}).length} câu)`
            : `Nộp bài thi: ${submission.examTitle} - Điểm: ${submission.score}/1000 (${submission.isPassed ? 'Đạt' : 'Chưa đạt'})`,
        ],
      },
    ];

    // 2. LẤY TURSO CLIENT SINGLETON
    const db = getTursoClient();

    // 3. THỰC THI BATCH TRONG 1 TRANSACTION KÈM RETRY TỰ ĐỘNG (TỐI THIỂU 3 LẦN VỚI EXPONENTIAL BACKOFF)
    const result = await executeWithRetry(async () => {
      return await db.batch(batchQueries, 'write');
    }, 3, 600);

    return res.status(200).json({
      success: true,
      message: isDraft ? 'Đã lưu bản nháp ngầm thành công' : 'Đã nộp bài thi thành công',
      submissionId: subId,
      batchCount: result.length,
      timestamp: nowIso,
    });
  } catch (error: any) {
    console.error('[API Submit Exam Error]:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Lỗi xử lý nộp bài trên server',
      code: error?.code || 'DATABASE_WRITE_ERROR',
    });
  }
}
