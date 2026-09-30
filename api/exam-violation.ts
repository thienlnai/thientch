import { getTursoClient, executeWithRetry } from '../src/lib/turso.ts';

/**
 * =========================================================================
 * API ROUTE: GHI NHẬN VI PHẠM PHÒNG THI (VIOLATION_EXIT_SCREEN)
 * =========================================================================
 * - Được gọi khi học sinh thoát toàn màn hình (ESC) hoặc chuyển tab / ẩn cửa sổ
 *   mà chưa được giáo viên cấp quyền cho phép (allow_exit_fullscreen === false).
 * - Cập nhật trạng thái học sinh thành VIOLATION_EXIT_SCREEN trên Turso DB.
 * - Ghi nhật ký vào audit_logs để lưu bằng chứng vi phạm.
 */

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Vui lòng gửi yêu cầu POST.',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const studentId = String(body?.studentId || '').trim();
    const examId = String(body?.examId || '').trim();
    const reason = String(body?.reason || 'Thoát khỏi chế độ toàn màn hình hoặc chuyển tab').trim();

    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin mã học sinh (studentId is required).',
      });
    }

    const db = getTursoClient();
    const nowIso = new Date().toISOString();

    // 1. UPDATE Turso DB: Đổi trạng thái học sinh thành VIOLATION_EXIT_SCREEN
    await executeWithRetry(async () => {
      // Đảm bảo cột allow_exit_fullscreen tồn tại nếu bảng chưa cập nhật
      try {
        await db.execute(`ALTER TABLE students ADD COLUMN allow_exit_fullscreen INTEGER DEFAULT 0`);
      } catch {}

      await db.execute({
        sql: `UPDATE students 
              SET status = 'VIOLATION_EXIT_SCREEN', 
                  allow_exit_fullscreen = 0, 
                  updatedAt = ? 
              WHERE id = ? OR studentCode = ?`,
        args: [nowIso, studentId, studentId],
      });

      // 2. Ghi nhận vi phạm vào audit_logs (0 overhead)
      try {
        const logId = `viol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await db.execute({
          sql: `INSERT INTO audit_logs (id, action, actor, details, createdAt) 
                VALUES (?, 'EXAM_VIOLATION_SCREEN', ?, ?, ?)`,
          args: [
            logId, 
            studentId, 
            JSON.stringify({ examId, reason, time: nowIso }), 
            nowIso
          ],
        });
      } catch {}
    }, 2);

    return res.status(200).json({
      success: true,
      status: 'VIOLATION_EXIT_SCREEN',
      message: 'Đã ghi nhận vi phạm thoát màn hình và báo cáo lên hệ thống giám sát.',
    });
  } catch (err: any) {
    console.error('Lỗi API exam-violation:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Lỗi xử lý vi phạm phòng thi.',
    });
  }
}
