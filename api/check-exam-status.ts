import { getTursoClient, executeWithRetry } from '../src/lib/turso.ts';

/**
 * =========================================================================
 * API ROUTE: KIỂM TRA TRẠNG THÁI PHÒNG THI & QUYỀN THOÁT TOÀN MÀN HÌNH
 * =========================================================================
 * - Tuyệt đối không quét toàn bảng (Full Table Scan = 0).
 * - Sử dụng Primary Key (students.id = ?) hoặc Index (students.studentCode = ?)
 *   để chỉ đọc đúng 1 dòng (Rows Read = 1) khi học sinh rời màn hình hoặc nhấn ESC.
 * - Trả về cờ allow_exit_fullscreen và trạng thái phòng thi hiện tại.
 */

export default async function handler(req: any, res: any) {
  // Cho phép GET hoặc POST
  const studentId = String(
    req.query?.studentId || 
    req.query?.id || 
    (typeof req.body === 'object' ? req.body?.studentId || req.body?.id : '') ||
    req.url?.split('studentId=')?.[1]?.split('&')?.[0] || ''
  ).trim();

  if (!studentId) {
    return res.status(400).json({
      success: false,
      error: 'Thiếu thông tin mã học sinh (studentId is required).',
      allow_exit_fullscreen: false,
    });
  }

  try {
    const db = getTursoClient();

    // Truy vấn đúng 1 dòng duy nhất qua Primary Key
    const queryRes = await executeWithRetry(async () => {
      return await db.execute({
        sql: `SELECT id, studentCode, status, allow_exit_fullscreen FROM students WHERE id = ? OR studentCode = ? LIMIT 1`,
        args: [studentId, studentId],
      });
    }, 2);

    if (!queryRes || !queryRes.rows || queryRes.rows.length === 0) {
      return res.status(200).json({
        success: true,
        allow_exit_fullscreen: false,
        status: 'active',
        note: 'Học sinh chưa tồn tại trong CSDL Turso',
      });
    }

    const row: any = queryRes.rows[0];
    const isAllowed = row.allow_exit_fullscreen === 1 || 
                      row.allow_exit_fullscreen === true || 
                      row.allow_exit_fullscreen === '1' ||
                      row.allow_exit_fullscreen === 'true';

    return res.status(200).json({
      success: true,
      studentId: row.id,
      studentCode: row.studentCode,
      status: row.status,
      allow_exit_fullscreen: Boolean(isAllowed),
    });
  } catch (err: any) {
    console.warn('Lỗi kiểm tra trạng thái thi (check-exam-status):', err?.message || err);
    // Fallback an toàn: nếu lỗi mạng tạm thời, mặc định không cho thoát để đảm bảo an toàn
    return res.status(200).json({
      success: true,
      allow_exit_fullscreen: false,
      status: 'active',
      fallback: true,
    });
  }
}
