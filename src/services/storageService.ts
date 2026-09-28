/**
 * storageService.ts - Dịch vụ lưu trữ hình ảnh & đa phương tiện trên GitHub Repository
 * 
 * Thay thế hoàn toàn Supabase Storage bằng GitHub Repository công khai:
 * 1. Nén ảnh câu hỏi thành chuẩn WebP siêu nhẹ (< 80KB)
 * 2. Tải trực tiếp lên GitHub Repository qua GitHub Contents REST API
 * 3. Sinh đường dẫn trực tiếp (GitHub Raw URL: https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path})
 * 4. Lưu GitHub Raw URL vào cơ sở dữ liệu Turso (SQLite)
 * 
 * Lợi ích:
 * - Lưu trữ vĩnh viễn, không giới hạn dung lượng với GitHub Repository công khai
 * - Không phụ thuộc vào Supabase Storage
 * - Tốc độ phân phối nội dung toàn cầu qua GitHub CDN (Fastly)
 * - Tối ưu 100% cho đề thi trắc nghiệm và ngân hàng câu hỏi
 */

import { ExamQuestion } from '../types/index.ts';
import { compressBase64Image, compressImageFile } from '../utils/imageOptimizer.ts';

export const STORAGE_BUCKET = 'exam-images';

/**
 * Đọc cấu hình GitHub từ LocalStorage hoặc Vite / Process env
 */
export function getGitHubConfig(): {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  isCustom: boolean;
  isConfigured: boolean;
} {
  let customToken = '';
  let customOwner = '';
  let customRepo = '';
  let customBranch = '';

  try {
    customToken = (localStorage.getItem('thientch_github_token') || '').trim();
    customOwner = (localStorage.getItem('thientch_github_owner') || '').trim();
    customRepo = (localStorage.getItem('thientch_github_repo') || '').trim();
    customBranch = (localStorage.getItem('thientch_github_branch') || 'main').trim();
  } catch {}

  const envToken = (
    (typeof process !== 'undefined' && process.env?.GITHUB_TOKEN) ||
    import.meta.env.VITE_GITHUB_TOKEN ||
    ''
  ).trim();

  const envOwner = (
    (typeof process !== 'undefined' && process.env?.GITHUB_OWNER) ||
    import.meta.env.VITE_GITHUB_OWNER ||
    ''
  ).trim();

  const envRepo = (
    (typeof process !== 'undefined' && process.env?.GITHUB_REPO) ||
    import.meta.env.VITE_GITHUB_REPO ||
    ''
  ).trim();

  const envBranch = (
    (typeof process !== 'undefined' && process.env?.GITHUB_BRANCH) ||
    import.meta.env.VITE_GITHUB_BRANCH ||
    'main'
  ).trim();

  const token = customToken || envToken;
  const owner = customOwner || envOwner;
  const repo = customRepo || envRepo;
  const branch = customBranch || envBranch || 'main';

  const isConfigured = Boolean(
    token &&
    owner &&
    repo &&
    !owner.includes('your-github') &&
    !repo.includes('exam-images-placeholder') &&
    !token.includes('ghp_your')
  );

  return {
    token,
    owner,
    repo,
    branch,
    isCustom: Boolean(customToken || customOwner || customRepo),
    isConfigured,
  };
}

export function saveGitHubConfig(token: string, owner: string, repo: string, branch: string = 'main'): void {
  try {
    localStorage.setItem('thientch_github_token', token.trim());
    localStorage.setItem('thientch_github_owner', owner.trim().replace(/^https?:\/\/github\.com\//i, '').split('/')[0]);
    localStorage.setItem('thientch_github_repo', repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/^[^\/]+\//, ''));
    localStorage.setItem('thientch_github_branch', (branch.trim() || 'main'));
  } catch {}
}

export function clearGitHubConfig(): void {
  try {
    localStorage.removeItem('thientch_github_token');
    localStorage.removeItem('thientch_github_owner');
    localStorage.removeItem('thientch_github_repo');
    localStorage.removeItem('thientch_github_branch');
  } catch {}
}

export function isGitHubConfigured(): boolean {
  return getGitHubConfig().isConfigured;
}

/**
 * Tạo GitHub Raw URL chuẩn hóa
 */
export function getRawGitHubUrl(owner: string, repo: string, branch: string, filePath: string): string {
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}`;
}

/**
 * Chuyển đổi chuỗi Data URL (Base64) thành Blob nhị phân
 */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string; extension: string } {
  try {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/webp';
    const binaryStr = atob(parts[1]);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    let extension = 'webp';
    if (mimeType.includes('png')) extension = 'png';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extension = 'jpg';
    else if (mimeType.includes('gif')) extension = 'gif';
    else if (mimeType.includes('svg')) extension = 'svg';

    return {
      blob: new Blob([bytes], { type: mimeType }),
      mimeType,
      extension,
    };
  } catch (error) {
    console.error('Error converting dataUrl to Blob:', error);
    return {
      blob: new Blob([], { type: 'image/webp' }),
      mimeType: 'image/webp',
      extension: 'webp',
    };
  }
}

/**
 * Chuyển đổi Blob thành Base64 thuần túy (không có header data:image/...)
 */
export async function blobToRawBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Kiểm tra xem một chuỗi có phải là Data URL Base64 ảnh hay không
 */
export function isBase64Image(str?: string | null): boolean {
  if (!str) return false;
  return str.startsWith('data:image/');
}

/**
 * Tải một tệp ảnh (File / Blob / Base64 Data URL) lên GitHub Repository
 * Trả về GitHub Raw URL trực tiếp:
 * https://raw.githubusercontent.com/{owner}/{repo}/{branch}/exam-images/{folder}/{timestamp}_{random}.webp
 */
export async function uploadImageToGitHub(
  fileOrDataUrl: File | Blob | string,
  folder: 'questions' | 'options' | 'hotspots' | 'matching' | 'ordering' = 'questions'
): Promise<string> {
  if (!fileOrDataUrl) return '';

  // Nếu đã là URL bên ngoài (http:// hoặc https://), không cần tải lại
  if (typeof fileOrDataUrl === 'string') {
    const trimmed = fileOrDataUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (!trimmed.startsWith('data:image/')) {
      return trimmed;
    }
  }

  const { token, owner, repo, branch, isConfigured } = getGitHubConfig();

  // Nếu chưa cấu hình GitHub, giữ nguyên Base64 làm phương án dự phòng
  if (!isConfigured) {
    console.warn('[GitHub Storage] GitHub chưa được kết nối, giữ lại ảnh cục bộ.');
    return typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '';
  }

  try {
    let uploadBlob: Blob;
    let extension = 'webp';

    if (typeof fileOrDataUrl === 'string') {
      const compressedDataUrl = await compressBase64Image(fileOrDataUrl, 1280, 1280, 0.82);
      const parsed = dataUrlToBlob(compressedDataUrl);
      uploadBlob = parsed.blob;
      extension = parsed.extension;
    } else if (fileOrDataUrl instanceof File) {
      const compressedDataUrl = await compressImageFile(fileOrDataUrl, 1280, 1280, 0.82);
      const parsed = dataUrlToBlob(compressedDataUrl);
      uploadBlob = parsed.blob;
      extension = parsed.extension;
    } else {
      uploadBlob = fileOrDataUrl;
      extension = fileOrDataUrl.type?.split('/')[1] || 'webp';
    }

    const rawBase64 = await blobToRawBase64(uploadBlob);
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 9);
    const filePath = `exam-images/${folder}/${timestamp}_${randomSuffix}.${extension}`;

    // Gọi GitHub REST API để commit tệp ảnh
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Upload exam image: ${filePath}`,
        content: rawBase64,
        branch: branch || 'main',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.warn(`[GitHub Storage] Lỗi upload tệp (${response.status}):`, errorData);
      return typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '';
    }

    // Trả về Raw URL trực tiếp của GitHub
    const rawUrl = getRawGitHubUrl(owner, repo, branch, filePath);
    return rawUrl;
  } catch (err: any) {
    console.error('[GitHub Storage] Lỗi ngoại lệ khi upload ảnh lên GitHub:', err);
    return typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '';
  }
}

// Backward-compatible alias
export const uploadImageToSupabaseStorage = uploadImageToGitHub;

/**
 * Tải tệp Video lên GitHub Repository
 */
export async function uploadVideoToGitHub(file: File): Promise<string> {
  if (!file) return '';
  const { token, owner, repo, branch, isConfigured } = getGitHubConfig();
  if (!isConfigured) {
    console.warn('[GitHub Storage] GitHub chưa được cấu hình.');
    return '';
  }

  try {
    const rawBase64 = await blobToRawBase64(file);
    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'mp4';
    const filePath = `exam-videos/${timestamp}_${Math.random().toString(36).slice(2, 9)}.${ext}`;

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const res = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Upload exam video: ${filePath}`,
        content: rawBase64,
        branch,
      }),
    });

    if (res.ok) {
      return getRawGitHubUrl(owner, repo, branch, filePath);
    }
    return '';
  } catch (err) {
    console.error('[GitHub Storage] Lỗi khi upload video:', err);
    return '';
  }
}

// Backward-compatible alias
export const uploadVideoToSupabaseStorage = uploadVideoToGitHub;

/**
 * Quét toàn bộ câu hỏi và tự động chuyển đổi tất cả chuỗi Base64 sang GitHub Raw URL
 */
export async function processQuestionsImagesForStorage(
  questions: ExamQuestion[]
): Promise<{ questions: ExamQuestion[]; uploadedCount: number }> {
  if (!questions || questions.length === 0) {
    return { questions: [], uploadedCount: 0 };
  }

  // Kiểm tra nhanh: Nếu không có bất kỳ ảnh Base64 nào, trả về ngay lập tức (0ms)
  const hasAnyBase64 = questions.some((q) => {
    if (isBase64Image(q.mediaUrl)) return true;
    if (isBase64Image(q.hotspotImageUrl)) return true;
    if (Array.isArray(q.options) && q.options.some((opt) => isBase64Image(opt.imageUrl))) return true;
    if (
      Array.isArray(q.matchingPairs) &&
      q.matchingPairs.some((p) => isBase64Image(p.leftImageUrl) || isBase64Image(p.rightImageUrl))
    )
      return true;
    if (Array.isArray(q.orderingItems) && q.orderingItems.some((item) => isBase64Image(item.imageUrl))) return true;
    return false;
  });

  if (!hasAnyBase64) {
    return { questions, uploadedCount: 0 };
  }

  const { isConfigured } = getGitHubConfig();
  if (!isConfigured) {
    return { questions, uploadedCount: 0 };
  }

  let totalUploaded = 0;

  const processedQuestions = await Promise.all(
    questions.map(async (q) => {
      const updatedQ: ExamQuestion = { ...q };

      // 1. Ảnh minh họa chính câu hỏi (mediaUrl)
      if (isBase64Image(updatedQ.mediaUrl)) {
        const rawUrl = await uploadImageToGitHub(updatedQ.mediaUrl!, 'questions');
        if (rawUrl && rawUrl !== updatedQ.mediaUrl) {
          updatedQ.mediaUrl = rawUrl;
          totalUploaded++;
        }
      }

      // 2. Ảnh câu hỏi Hotspot (hotspotImageUrl)
      if (isBase64Image(updatedQ.hotspotImageUrl)) {
        const rawUrl = await uploadImageToGitHub(updatedQ.hotspotImageUrl!, 'hotspots');
        if (rawUrl && rawUrl !== updatedQ.hotspotImageUrl) {
          updatedQ.hotspotImageUrl = rawUrl;
          totalUploaded++;
        }
      }

      // 3. Ảnh phương án trắc nghiệm (options[].imageUrl)
      if (Array.isArray(updatedQ.options) && updatedQ.options.length > 0) {
        updatedQ.options = await Promise.all(
          updatedQ.options.map(async (opt) => {
            if (isBase64Image(opt.imageUrl)) {
              const rawUrl = await uploadImageToGitHub(opt.imageUrl!, 'options');
              if (rawUrl && rawUrl !== opt.imageUrl) {
                totalUploaded++;
                return { ...opt, imageUrl: rawUrl };
              }
            }
            return opt;
          })
        );
      }

      // 4. Ảnh cặp ghép nối (matchingPairs[].leftImageUrl / rightImageUrl)
      if (Array.isArray(updatedQ.matchingPairs) && updatedQ.matchingPairs.length > 0) {
        updatedQ.matchingPairs = await Promise.all(
          updatedQ.matchingPairs.map(async (pair) => {
            let leftUrl = pair.leftImageUrl;
            let rightUrl = pair.rightImageUrl;

            if (isBase64Image(leftUrl)) {
              const res = await uploadImageToGitHub(leftUrl!, 'matching');
              if (res && res !== leftUrl) {
                leftUrl = res;
                totalUploaded++;
              }
            }
            if (isBase64Image(rightUrl)) {
              const res = await uploadImageToGitHub(rightUrl!, 'matching');
              if (res && res !== rightUrl) {
                rightUrl = res;
                totalUploaded++;
              }
            }
            return { ...pair, leftImageUrl: leftUrl, rightImageUrl: rightUrl };
          })
        );
      }

      // 5. Ảnh sắp xếp thứ tự (orderingItems[].imageUrl)
      if (Array.isArray(updatedQ.orderingItems) && updatedQ.orderingItems.length > 0) {
        updatedQ.orderingItems = await Promise.all(
          updatedQ.orderingItems.map(async (item) => {
            if (isBase64Image(item.imageUrl)) {
              const rawUrl = await uploadImageToGitHub(item.imageUrl!, 'ordering');
              if (rawUrl && rawUrl !== item.imageUrl) {
                totalUploaded++;
                return { ...item, imageUrl: rawUrl };
              }
            }
            return item;
          })
        );
      }

      return updatedQ;
    })
  );

  return { questions: processedQuestions, uploadedCount: totalUploaded };
}

/**
 * Kiểm tra trạng thái kết nối GitHub Repository
 */
export async function testGitHubConnection(
  rawToken: string,
  rawOwner: string,
  rawRepo: string,
  rawBranch: string = 'main'
): Promise<{ success: boolean; message: string; isPublic?: boolean }> {
  const token = rawToken.trim();
  const owner = rawOwner.trim().replace(/^https?:\/\/github\.com\//i, '').split('/')[0];
  const repo = rawRepo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/^[^\/]+\//, '');
  const branch = rawBranch.trim() || 'main';

  if (!token || !owner || !repo) {
    return {
      success: false,
      message: 'Vui lòng điền đầy đủ GitHub Token, Owner (tài khoản) và Repository.',
    };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (res.status === 404) {
      return {
        success: false,
        message: `Không tìm thấy repository "${owner}/${repo}". Hãy chắc chắn repository đã được tạo trên GitHub.`,
      };
    }

    if (res.status === 401) {
      return {
        success: false,
        message: 'GitHub Personal Access Token không hợp lệ hoặc đã hết hạn.',
      };
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        message: `Lỗi kết nối GitHub (${res.status}): ${err.message || 'Không xác định'}`,
      };
    }

    const data = await res.json();
    const isPublic = !data.private;
    const permissions = data.permissions;

    if (permissions && permissions.push === false) {
      return {
        success: false,
        message: `Token có quyền xem nhưng chưa có quyền ghi (Push/Write) vào repo "${owner}/${repo}".`,
      };
    }

    const publicNote = isPublic
      ? 'Repository ở chế độ Công khai (Public) - Đường dẫn Raw URL sẽ tải siêu tốc!'
      : 'Lưu ý: Repository đang ở chế độ Riêng tư (Private). Bạn nên đổi sang Public để học sinh có thể xem ảnh trực tiếp qua Raw URL.';

    return {
      success: true,
      isPublic,
      message: `Kết nối GitHub thành công! Repo "${owner}/${repo}" (nhánh ${branch}) đã sẵn sàng. ${publicNote}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Không thể kết nối tới GitHub API: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Kiểm tra trạng thái Storage (tương thích giao diện cũ)
 */
export async function checkStorageBucketStatus(): Promise<{
  isAvailable: boolean;
  bucketExists: boolean;
  message: string;
}> {
  const { token, owner, repo, branch, isConfigured } = getGitHubConfig();

  if (!isConfigured) {
    return {
      isAvailable: false,
      bucketExists: false,
      message: 'Chưa cấu hình GitHub Token, Owner hoặc Repo.',
    };
  }

  const result = await testGitHubConnection(token, owner, repo, branch);
  return {
    isAvailable: result.success,
    bucketExists: result.success,
    message: result.message,
  };
}

/**
 * Hướng dẫn tạo GitHub Repository & Personal Access Token
 */
export const GITHUB_STORAGE_GUIDE = `# HƯỚNG DẪN CẤU HÌNH LƯU TRỮ ẢNH TRÊN GITHUB (MIỄN PHÍ VĨNH VIỄN)

1. TẠO REPOSITORY TRÊN GITHUB:
   - Truy cập: https://github.com/new
   - Repository name: exam-images (hoặc tùy chọn)
   - Chọn chế độ: Public (Công khai - để học sinh xem được ảnh trực tiếp)
   - Tích chọn: "Add a README file"
   - Nhấn "Create repository"

2. TẠO PERSONAL ACCESS TOKEN:
   - Truy cập: https://github.com/settings/tokens (Fine-grained hoặc Classic)
   - Với Classic Token:
     + Token name: Thientch Exam Images
     + Expiration: No expiration (hoặc 1 năm)
     + Tích chọn quyền: "repo" (Toàn quyền quản lý repository)
     + Nhấn "Generate token" và sao chép mã (bắt đầu bằng ghp_...)

3. DÁN VÀO CẤU HÌNH TRÊN TRANG WEB:
   - GitHub Token: ghp_...
   - Owner: Tên tài khoản GitHub của bạn
   - Repo: exam-images
   - Branch: main
   - Bấm "Kiểm tra kết nối" và "Lưu Cấu Hình"!
`;
