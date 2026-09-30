import { getTursoClient, executeWithRetry } from '../src/lib/turso.ts';

/**
 * =========================================================================
 * API ROUTE: GIÁO VIÊN CẤP QUYỀN THOÁT / MỞ KHÓA BÀI THI
 * =========================================================================
 * - Khi giáo viên nhấn nút "Cấp quyền thoát / Mở khóa" trên Dashboard.
 * - Cập nhật Turso DB: set allow_exit_fullscreen = 1 và reset status = 'active'.
 * - Ghi nhận nhật ký audit_logs của giáo viên mở khóa.
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
    const actorUsername = String(body?.actorUsername || 'Giáo viên').trim();

    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin mã học sinh (studentId is required).',
      });
    }

    const db = getTursoClient();
    const nowIso = new Date().toISOString();

    await executeWithRetry(async () => {
      // Đảm bảo cột allow_exit_fullscreen tồn tại
      try {
        await db.execute(`ALTER TABLE students ADD COLUMN allow_exit_fullscreen INTEGER DEFAULT 0`);
      } catch {}

      // UPDATE Turso DB: Cấp quyền allow_exit_fullscreen = 1 và reset trạng thái về 'active'
      await db.execute({
        sql: `UPDATE students 
              SET status = 'active', 
                  allow_exit_fullscreen = 1, 
                  updatedAt = ? 
              WHERE id = ? OR studentCode = ?`,
        args: [nowIso, studentId, studentId],
      });

      // Ghi nhật ký hoạt động
      try {
        const logId = `unlock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await db.execute({
          sql: `INSERT INTO audit_logs (id, action, actor, details, createdAt) 
                VALUES (?, 'TEACHER_UNLOCK_EXAM', ?, ?, ?)`,
          args: [
            logId, 
            actorUsername, 
            JSON.stringify({ studentId, time: nowIso }), 
            nowIso
          ],
        });
      } catch {}
    }, 2);

    return res.status(200).json({
      success: true,
      allow_exit_fullscreen: true,
      status: 'active',
      message: 'Đã mở khóa phòng thi và cấp quyền cho học sinh thành công.',
    });
  } catch (err: any) {
    console.error('Lỗi API unlock-exam:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Lỗi khi mở khóa phòng thi.',
    });
  }
}
