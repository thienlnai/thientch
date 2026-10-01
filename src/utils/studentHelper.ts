import { 
  Student, 
  ExamQuestion, 
  HotspotRegion, 
  HotspotStudentClick 
} from '../types/index.ts';

/**
 * Loại bỏ dấu tiếng Việt chuẩn
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A');
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E');
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I');
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O');
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U');
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y');
  str = str.replace(/Đ/g, 'D');
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Phát sinh tự động thông tin học sinh:
 * - Mã HS phát sinh tự động (HSxxxxxx)
 * - Tên đăng nhập: tên + họ và chữ lót viết tắt + lớp (ví dụ: Nguyễn Văn Nan học lớp 6.4 => nannv64).
 *   Kiểm tra trùng trong hệ thống, nếu trùng thì thêm số 1 (sau đó 2, 3...)
 * - Mật khẩu: 123@456
 * - Email: ten + họ và chữ lót viết tắt@thientch.edu.vn
 */
export function generateStudentCredentials(
  fullName: string,
  className: string,
  existingUsernames: Set<string>,
  existingStudentCodes?: Set<string>
): {
  username: string;
  email: string;
  studentCode: string;
  password: string;
} {
  const cleanName = removeVietnameseTones(fullName.trim()).toLowerCase();
  const words = cleanName.split(/\s+/).filter(Boolean);

  let ten = 'hs';
  let hoLotInitials = '';

  if (words.length > 0) {
    ten = words[words.length - 1]; // Lấy chữ cuối cùng (tên)
    const hoLotWords = words.slice(0, words.length - 1);
    hoLotInitials = hoLotWords.map((w) => w.charAt(0)).join('');
  }

  // Tên lớp viết liền không dấu, không dấu chấm/gạch (ví dụ "6.4" -> "64", "12A1" -> "12a1")
  const cleanClass = removeVietnameseTones(className.trim())
    .toLowerCase()
    .replace(/^lop\s*/i, '')
    .replace(/[^a-z0-9]/g, '');

  const baseUsername = `${ten}${hoLotInitials}${cleanClass}` || `hs${Date.now()}`;
  let finalUsername = baseUsername;

  // Kiểm tra trùng: nếu trùng thì thêm 1, nếu vẫn trùng thì tăng dần 2, 3...
  if (existingUsernames.has(finalUsername)) {
    finalUsername = `${baseUsername}1`;
    let count = 2;
    while (existingUsernames.has(finalUsername)) {
      finalUsername = `${baseUsername}${count}`;
      count++;
    }
  }
  existingUsernames.add(finalUsername);

  // Email: ten + họ và chữ lót viết tắt@thientch.edu.vn
  const emailPrefix = `${ten}${hoLotInitials}` || 'hocsinh';
  const email = `${emailPrefix}@thientch.edu.vn`;

  // Mật khẩu cố định theo yêu cầu: 123@456
  const password = '123@456';

  // Mã học sinh tự động phát sinh: HS + 6 số ngẫu nhiên không trùng
  let studentCode = `HS${Math.floor(100000 + Math.random() * 900000)}`;
  if (existingStudentCodes) {
    while (existingStudentCodes.has(studentCode)) {
      studentCode = `HS${Math.floor(100000 + Math.random() * 900000)}`;
    }
    existingStudentCodes.add(studentCode);
  }

  return {
    username: finalUsername,
    email,
    studentCode,
    password,
  };
}

/**
 * Parse danh sách học sinh từ nội dung text Excel / CSV (hoặc copy-paste từ bảng Excel)
 * Hỗ trợ các định dạng:
 * Cột 1: Họ và tên (bắt buộc)
 * Cột 2: Ngày sinh (tùy chọn, ví dụ 15/08/2008 hoặc 2008-08-15)
 * Cột 3: Giới tính (Nam/Nữ)
 * Cột 4: Ghi chú (tùy chọn)
 */
export function parseExcelOrCsvText(
  rawText: string,
  targetClassId: string,
  targetClassName: string,
  targetSchoolId: string,
  allStudents: Student[]
): Omit<Student, 'id' | 'createdAt' | 'updatedAt'>[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const existingUsernames = new Set(allStudents.map((s) => s.username.toLowerCase()));
  const existingCodes = new Set(allStudents.map((s) => s.studentCode.toUpperCase()));

  const parsedStudents: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Bỏ qua dòng tiêu đề nếu có
    const lowerLine = line.toLowerCase();
    if (
      i === 0 &&
      (lowerLine.includes('họ và tên') ||
        lowerLine.includes('ho va ten') ||
        lowerLine.includes('fullname') ||
        lowerLine.includes('họ tên') ||
        lowerLine.includes('stt'))
    ) {
      continue;
    }

    // Tách cột bằng tab (khi copy từ Excel) hoặc dấu phẩy / chấm phẩy (CSV)
    let parts: string[] = [];
    if (line.includes('\t')) {
      parts = line.split('\t').map((p) => p.trim());
    } else if (line.includes(';')) {
      parts = line.split(';').map((p) => p.trim());
    } else if (line.includes(',')) {
      parts = line.split(',').map((p) => p.trim());
    } else {
      parts = [line.trim()];
    }

    // Bỏ qua cột STT số nếu cột 0 là số nguyên nhỏ
    let nameIndex = 0;
    if (parts.length > 1 && /^\d+$/.test(parts[0]) && parts[0].length <= 3) {
      nameIndex = 1;
    }

    const fullName = parts[nameIndex] ? parts[nameIndex].replace(/^["']|["']$/g, '').trim() : '';
    if (!fullName || fullName.length < 2) continue;

    // Ngày sinh (nếu có)
    let dob = '2008-01-01';
    const dobPart = parts[nameIndex + 1];
    if (dobPart && (/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(dobPart) || /\d{2}\/\d{2}\/\d{4}/.test(dobPart))) {
      // Chuyển DD/MM/YYYY thành YYYY-MM-DD nếu cần
      if (dobPart.includes('/')) {
        const dParts = dobPart.split('/');
        if (dParts.length === 3 && dParts[2].length === 4) {
          dob = `${dParts[2]}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}`;
        } else {
          dob = dobPart;
        }
      } else {
        dob = dobPart;
      }
    }

    // Giới tính
    let gender: 'male' | 'female' | 'other' = 'male';
    const genderPart = parts[nameIndex + 2] ? parts[nameIndex + 2].toLowerCase() : '';
    if (genderPart.includes('nữ') || genderPart.includes('female') || genderPart === 'f') {
      gender = 'female';
    } else if (genderPart.includes('nam') || genderPart.includes('male') || genderPart === 'm') {
      gender = 'male';
    }

    const creds = generateStudentCredentials(
      fullName,
      targetClassName,
      existingUsernames,
      existingCodes
    );

    parsedStudents.push({
      schoolId: targetSchoolId,
      classId: targetClassId,
      fullName,
      studentCode: creds.studentCode,
      dateOfBirth: dob,
      gender,
      username: creds.username,
      password: creds.password,
      status: 'active',
      note: `Email: ${creds.email}`,
    });
  }

  return parsedStudents;
}

/**
 * Xáo trộn ngẫu nhiên mảng (Fisher-Yates Shuffle)
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Xáo trộn các câu hỏi và các đáp án bên trong câu hỏi mỗi khi học sinh làm lại hoặc bắt đầu bài thi
 */
export function shuffleExamQuestionsAndOptions(
  questions: ExamQuestion[],
  isPracticeTest?: boolean,
  practiceRandomCount?: number
): ExamQuestion[] {
  let selectedQuestions = [...questions];

  // Nếu là đề thi thử với số lượng ngẫu nhiên: bốc ngẫu nhiên N câu
  if (isPracticeTest && practiceRandomCount && practiceRandomCount > 0) {
    const count = Math.min(practiceRandomCount, selectedQuestions.length);
    selectedQuestions = shuffleArray(selectedQuestions).slice(0, count);
  } else {
    selectedQuestions = shuffleArray(selectedQuestions);
  }

  // Xáo trộn đáp án bên trong từng câu
  return selectedQuestions.map((q) => {
    const questionCopy: ExamQuestion = { ...q };

    if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      if (q.options && q.options.length > 1) {
        questionCopy.options = shuffleArray(q.options);
      }
    }

    if (q.type === 'matching') {
      if (q.matchingPairs && q.matchingPairs.length > 0) {
        // Đảo thứ tự các thẻ vế A ở cột trái
        questionCopy.matchingPairs = shuffleArray(q.matchingPairs);

        // Đảo thứ tự các thẻ vế B ở cột phải
        let shuffledRight = shuffleArray(q.matchingPairs);
        // Đảm bảo xáo trộn tối đa, không để thẳng hàng 1-1 với cột A nếu có từ 2 cặp trở lên
        if (shuffledRight.length > 1) {
          let attempts = 0;
          while (
            attempts < 10 &&
            shuffledRight.some((item, idx) => item.id === questionCopy.matchingPairs![idx].id)
          ) {
            shuffledRight = shuffleArray(q.matchingPairs);
            attempts++;
          }
        }
        questionCopy.shuffledRightPairs = shuffledRight;
      }
    }

    if (q.type === 'ordering') {
      if (q.orderingItems && q.orderingItems.length > 1) {
        // Cho học sinh nhận thứ tự bị xáo trộn để sắp xếp lại
        questionCopy.orderingItems = shuffleArray(q.orderingItems);
      }
    }

    if (q.type === 'fill_blank') {
      if (q.fillBlankItems && q.fillBlankItems.length > 0) {
        // Đảo thứ tự danh sách lựa chọn trong dropdown cho từng chỗ trống
        questionCopy.fillBlankItems = q.fillBlankItems.map((item) => {
          const original = item.options || [];
          let shuffledOpts = shuffleArray(original);
          if (shuffledOpts.length > 1 && JSON.stringify(shuffledOpts) === JSON.stringify(original)) {
            shuffledOpts = [...shuffledOpts.slice(1), shuffledOpts[0]];
          }
          return {
            ...item,
            options: shuffledOpts,
          };
        });
      }
    }

    if (q.type === 'true_false') {
      // 1. Đảo thứ tự các nhận định / phát biểu
      if (q.tfStatements && q.tfStatements.length > 0) {
        let shuffledStatements = shuffleArray(q.tfStatements);
        if (
          shuffledStatements.length > 1 &&
          JSON.stringify(shuffledStatements.map((s) => s.id)) ===
            JSON.stringify(q.tfStatements.map((s) => s.id))
        ) {
          shuffledStatements = [...shuffledStatements.slice(1), shuffledStatements[0]];
        }
        questionCopy.tfStatements = shuffledStatements;
      }

      // 2. Đảo thứ tự 2 cột lựa chọn (Đúng / Sai hoặc Sai / Đúng) ngẫu nhiên
      const shouldInvertColumns = Math.random() < 0.5;
      questionCopy.shuffledTfColumns = shouldInvertColumns
        ? ['false', 'true']
        : ['true', 'false'];
    }

    return questionCopy;
  });
}

/**
 * Chấm điểm cho 1 câu hỏi cụ thể theo 7 dạng câu hỏi
 */
export function evaluateQuestionAnswer(
  q: ExamQuestion,
  studentAnswer: any,
  pointsPerQuestion: number
): { isCorrect: boolean; earnedScore: number; details: any } {
  let isCorrect = false;
  let earnedScore = 0;
  let details: any = {};

  if (!studentAnswer && studentAnswer !== false) {
    return { isCorrect: false, earnedScore: 0, details: { reason: 'Chưa làm câu này' } };
  }

  switch (q.type) {
    case 'single_choice': {
      // studentAnswer là optionId được chọn
      isCorrect = studentAnswer === q.correctOptionId;
      earnedScore = isCorrect ? pointsPerQuestion : 0;
      details = {
        chosenOptionId: studentAnswer,
        correctOptionId: q.correctOptionId,
      };
      break;
    }

    case 'multiple_choice': {
      // studentAnswer là mảng các optionId được chọn
      const chosenIds: string[] = Array.isArray(studentAnswer) ? studentAnswer : [];
      const correctIds = q.correctOptionIds || [];

      // Kiểm tra xem số lượng và các ID có khớp chính xác không
      const isSameCount = chosenIds.length === correctIds.length;
      const allMatched =
        isSameCount &&
        chosenIds.every((id) => correctIds.includes(id)) &&
        correctIds.every((id) => chosenIds.includes(id));

      isCorrect = allMatched;
      earnedScore = isCorrect ? pointsPerQuestion : 0;
      details = {
        chosenIds,
        correctIds,
      };
      break;
    }

    case 'matching': {
      // studentAnswer là Record<pairId, selectedRightPairId>
      const matches: Record<string, string> = studentAnswer || {};
      const pairs = q.matchingPairs || [];
      if (pairs.length === 0) {
        isCorrect = true;
        earnedScore = pointsPerQuestion;
      } else {
        let correctMatches = 0;
        pairs.forEach((p) => {
          if (matches[p.id] === p.id) {
            correctMatches++;
          }
        });
        isCorrect = correctMatches === pairs.length;
        // Điểm theo tỷ lệ từng cặp đúng
        earnedScore = (correctMatches / pairs.length) * pointsPerQuestion;
        details = {
          correctCount: correctMatches,
          totalPairs: pairs.length,
          matches,
        };
      }
      break;
    }

    case 'ordering': {
      // studentAnswer là mảng các itemId theo thứ tự học sinh đã xếp
      const userOrder: string[] = Array.isArray(studentAnswer) ? studentAnswer : [];
      const originalItems = q.orderingItems || [];

      // So khớp với thứ tự chuẩn ban đầu của orderingItems
      const isExactMatch =
        userOrder.length === originalItems.length &&
        userOrder.every((id, idx) => id === originalItems[idx].id);

      isCorrect = isExactMatch;
      earnedScore = isCorrect ? pointsPerQuestion : 0;
      details = {
        userOrder,
        correctOrder: originalItems.map((i) => i.id),
      };
      break;
    }

    case 'true_false': {
      // studentAnswer là Record<statementId, boolean> (true = cột 1, false = cột 2)
      const answers: Record<string, boolean> = studentAnswer || {};
      const statements = q.tfStatements || [];
      if (statements.length === 0) {
        isCorrect = true;
        earnedScore = pointsPerQuestion;
      } else {
        let correctCount = 0;
        statements.forEach((st) => {
          if (answers[st.id] === st.isTrue) {
            correctCount++;
          }
        });
        isCorrect = correctCount === statements.length;
        // Tỷ lệ điểm trên số nhận định
        earnedScore = (correctCount / statements.length) * pointsPerQuestion;
        details = {
          correctCount,
          totalStatements: statements.length,
          answers,
        };
      }
      break;
    }

    case 'hotspot': {
      // studentAnswer là mảng các điểm click: HotspotStudentClick[]: [{ x, y }]
      // Số lượng điểm học sinh có thể chọn tương đương với số lượng vùng đúng GV vẽ
      const clicks: HotspotStudentClick[] = Array.isArray(studentAnswer) ? studentAnswer : [];
      const regions: HotspotRegion[] = q.hotspotRegions || [];

      if (regions.length === 0) {
        isCorrect = true;
        earnedScore = pointsPerQuestion;
      } else {
        // Kiểm tra từng điểm click xem có rơi vào vùng đúng không
        const clickResults = clicks.map((click) => {
          const hitRegion = regions.find(
            (r) =>
              click.x >= r.x &&
              click.x <= r.x + r.width &&
              click.y >= r.y &&
              click.y <= r.y + r.height
          );
          return {
            click,
            isHit: !!hitRegion,
            hitRegionId: hitRegion ? hitRegion.id : null,
          };
        });

        // Mỗi vùng đúng chỉ tính tối đa 1 lần trúng
        const hitRegionIds = new Set(
          clickResults.filter((cr) => cr.isHit && cr.hitRegionId).map((cr) => cr.hitRegionId)
        );

        // Phải bấm trúng tất cả các vùng và không có điểm nào sai lệch
        const allRegionsHit = hitRegionIds.size === regions.length;
        const noMisses = clickResults.every((cr) => cr.isHit);

        isCorrect = allRegionsHit && noMisses;
        earnedScore = isCorrect
          ? pointsPerQuestion
          : (hitRegionIds.size / regions.length) * pointsPerQuestion * (noMisses ? 1 : 0.5);

        details = {
          clickResults,
          regions,
          hitCount: hitRegionIds.size,
          totalRegions: regions.length,
        };
      }
      break;
    }

    case 'fill_blank': {
      // studentAnswer là Record<blankId, chosenOptionText>
      const answers: Record<string, string> = studentAnswer || {};
      const blanks = q.fillBlankItems || [];

      if (blanks.length === 0) {
        isCorrect = true;
        earnedScore = pointsPerQuestion;
      } else {
        let correctCount = 0;
        blanks.forEach((b) => {
          if (
            answers[b.id] &&
            answers[b.id].trim().toLowerCase() === b.correctAnswer.trim().toLowerCase()
          ) {
            correctCount++;
          }
        });
        isCorrect = correctCount === blanks.length;
        earnedScore = (correctCount / blanks.length) * pointsPerQuestion;
        details = {
          correctCount,
          totalBlanks: blanks.length,
          answers,
        };
      }
      break;
    }
  }

  return {
    isCorrect,
    earnedScore: Math.round(earnedScore * 100) / 100,
    details,
  };
}

/**
 * Tính tổng điểm đề thi theo thang điểm và điểm đạt tùy biến của giáo viên
 */
export function calculateExamScore(
  questions: ExamQuestion[],
  studentAnswers: Record<string, any>,
  customPassingScore?: number,
  customMaxScore?: number
): {
  totalScore: number;
  maxScore: number;
  passingScore: number;
  pointsPerQuestion: number;
  isPassed: boolean;
  questionResults: Record<string, { isCorrect: boolean; earnedScore: number; maxScore: number; details: any }>;
  correctCount: number;
  totalQuestions: number;
} {
  const maxScore = customMaxScore !== undefined && customMaxScore > 0 ? customMaxScore : 1000;
  const passingScore = customPassingScore !== undefined && customPassingScore > 0 ? customPassingScore : 950;
  const totalQuestions = questions.length;

  if (totalQuestions === 0) {
    return {
      totalScore: 0,
      maxScore,
      passingScore,
      pointsPerQuestion: 0,
      isPassed: false,
      questionResults: {},
      correctCount: 0,
      totalQuestions: 0,
    };
  }

  // Tính toán chính xác số điểm của từng câu hỏi
  const pointsPerQuestion = maxScore / totalQuestions;
  const questionResults: Record<string, any> = {};
  let totalEarned = 0;
  let correctCount = 0;

  questions.forEach((q) => {
    const answer = studentAnswers[q.id];
    const evalResult = evaluateQuestionAnswer(q, answer, pointsPerQuestion);
    questionResults[q.id] = {
      isCorrect: evalResult.isCorrect,
      earnedScore: evalResult.earnedScore,
      maxScore: Math.round(pointsPerQuestion * 100) / 100,
      details: evalResult.details,
    };

    totalEarned += evalResult.earnedScore;
    if (evalResult.isCorrect) {
      correctCount++;
    }
  });

  const finalScore = Math.min(maxScore, Math.round(totalEarned));
  const isPassed = finalScore >= passingScore;

  return {
    totalScore: finalScore,
    maxScore,
    passingScore,
    pointsPerQuestion: Math.round(pointsPerQuestion * 100) / 100,
    isPassed,
    questionResults,
    correctCount,
    totalQuestions,
  };
}

/**
 * Trích xuất số khối lớp chuẩn (ví dụ "6", "7", "8", "9", "10", "11", "12") từ tên lớp, mã lớp hoặc chuỗi khối
 * Ví dụ hỗ trợ:
 * - "Khối 8", "Khoi 8", "K8" -> "8"
 * - "8.1", "8A1", "Lớp 8.1", "Lop 8A2", "8/1" -> "8"
 * - "12A1", "12.4" -> "12"
 * - "6.4", "6A" -> "6"
 */
export function extractGradeNumber(input?: string | null): string | null {
  if (!input) return null;
  const clean = input.trim();
  if (!clean) return null;

  // 1. Dạng "Khối 8", "Khoi 8", "Khối 12", "K8", "grade 8"
  const khoiMatch = clean.match(/(?:khối|khoi|k|grade)\s*(\d{1,2})/i);
  if (khoiMatch) return khoiMatch[1];

  // 2. Dạng "Lớp 8.1", "Lop 8A1", "8.1", "8A1", "8/1", "12A1", "6.4"
  const classMatch = clean.match(/^(?:lớp|lop\s*)?(\d{1,2})(?:[\.\/a-zA-Z\s_-]|$)/i);
  if (classMatch) return classMatch[1];

  // 3. Số nguyên độc lập 1 đến 12
  const numMatch = clean.match(/\b(1[0-2]|[1-9])\b/);
  if (numMatch) return numMatch[1];

  return null;
}

/**
 * Lấy số khối của một lớp học dựa trên trường grade, name, hoặc code
 */
export function getClassGradeNumber(cls?: { grade?: string; name?: string; code?: string } | null): string | null {
  if (!cls) return null;
  return (
    extractGradeNumber(cls.grade) ||
    extractGradeNumber(cls.name) ||
    extractGradeNumber(cls.code)
  );
}

/**
 * Định dạng nhãn khối lớp hiển thị đẹp mắt (ví dụ: 'Khối 8', 'Tất cả các khối')
 */
export function formatGradeLabel(gradeStr?: string | null): string {
  if (!gradeStr) return 'Tất cả các khối';
  const clean = gradeStr.trim();
  if (clean.toLowerCase() === 'all' || clean.toLowerCase().includes('tất cả') || clean.toLowerCase().includes('tat ca')) {
    return 'Tất cả các khối';
  }
  const num = extractGradeNumber(clean);
  if (num) return `Khối ${num}`;
  return clean;
}

/**
 * Kiểm tra xem một đề thi có hiển thị cho khối lớp của học sinh hay không.
 * Quy tắc:
 * - Nếu đề thi chọn "Tất cả các khối" (hoặc targetGrades có chứa 'all'): hiển thị cho mọi học sinh.
 * - Nếu đề thi chỉ định khối cụ thể (ví dụ: Khối 8): chỉ học sinh khối 8 (như Lớp 8.1, 8.2) mới thấy.
 * - Học sinh khối khác (như Khối 6, Khối 7) sẽ KHÔNG thấy đề thi này.
 *
 * @param exam Đề thi cần kiểm tra
 * @param studentClass Lớp học của học sinh đang đăng nhập
 */
export function isExamVisibleToGrade(
  exam: { grade?: string; targetGrades?: string[] },
  studentClass?: { grade?: string; name?: string; code?: string } | null
): boolean {
  // Xác định danh sách khối mục tiêu của đề thi
  const rawTargetGrades = exam.targetGrades && exam.targetGrades.length > 0
    ? exam.targetGrades
    : (exam.grade ? [exam.grade] : []);

  // Nếu đề thi không cấu hình khối -> cho phép theo mặc định
  if (rawTargetGrades.length === 0) return true;

  // Kiểm tra nếu có chọn "all" hoặc "tất cả"
  const isAllGrades = rawTargetGrades.some((g) => {
    if (!g) return false;
    const lower = g.toLowerCase().trim();
    return lower === 'all' || lower.includes('tất cả') || lower.includes('tat ca');
  });
  if (isAllGrades) return true;

  // Lấy số khối của lớp học sinh (ví dụ học sinh lớp 8.1 -> "8")
  const studentGradeNum = getClassGradeNumber(studentClass);
  // Nếu không xác định được lớp học sinh -> cho phép để không làm gián đoạn
  if (!studentGradeNum) return true;

  // Trích xuất tập hợp số khối hợp lệ của đề thi
  const allowedGradeNums = new Set<string>();
  rawTargetGrades.forEach((g) => {
    if (!g) return;
    // Tách chuỗi nếu có dạng "Khối 6, Khối 7" hoặc "6, 7"
    const parts = g.split(/[,;\+&]/);
    parts.forEach((p) => {
      const num = extractGradeNumber(p);
      if (num) allowedGradeNums.add(num);
    });
  });

  // Nếu không trích xuất được số khối nào -> cho phép
  if (allowedGradeNums.size === 0) return true;

  // Học sinh chỉ thấy đề thi khi số khối của lớp trùng với số khối của đề thi
  return allowedGradeNums.has(studentGradeNum);
}
