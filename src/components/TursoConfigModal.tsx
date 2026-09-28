import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Server,
  RefreshCw,
  ExternalLink,
  UploadCloud,
  HelpCircle,
  KeyRound,
  Globe,
  Image as ImageIcon,
  HardDrive,
  Sparkles,
  Github,
  Layers,
  Terminal,
} from 'lucide-react';
import {
  getEffectiveTursoConfig,
  saveCustomTursoConfig,
  clearCustomTursoConfig,
  testCustomConnection,
  initTursoSchema,
  sanitizeTursoUrl,
  sanitizeTursoToken,
} from '../turso.ts';
import {
  getGitHubConfig,
  saveGitHubConfig,
  clearGitHubConfig,
  testGitHubConnection,
  GITHUB_STORAGE_GUIDE,
} from '../services/storageService.ts';
import {
  refreshAllDataFromTurso,
  countRemainingBase64Images,
  migrateAllExistingImagesToStorage,
} from '../services/dbService.ts';

interface TursoConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

export const TursoConfigModal: React.FC<TursoConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'turso' | 'github' | 'schema'>('turso');

  // Turso state
  const [tursoUrl, setTursoUrl] = useState('');
  const [tursoToken, setTursoToken] = useState('');
  const [isTestingTurso, setIsTestingTurso] = useState(false);
  const [tursoTestResult, setTursoTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isInitializingSchema, setIsInitializingSchema] = useState(false);
  const [schemaInitResult, setSchemaInitResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTursoConfigured, setIsTursoConfigured] = useState(false);

  // GitHub state
  const [githubToken, setGithubToken] = useState('');
  const [githubOwner, setGithubOwner] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [githubBranch, setGithubBranch] = useState('main');
  const [isTestingGitHub, setIsTestingGitHub] = useState(false);
  const [githubTestResult, setGithubTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isGitHubConfigured, setIsGitHubConfigured] = useState(false);

  // Migration state
  const [isMigratingImages, setIsMigratingImages] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<string | null>(null);
  const [base64Stats, setBase64Stats] = useState<{ totalBase64: number; examsWithBase64: number; bankBase64: number } | null>(null);
  const [isCopiedSql, setIsCopiedSql] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const tConfig = getEffectiveTursoConfig();
      setTursoUrl(tConfig.url.includes('placeholder') ? '' : tConfig.url);
      setTursoToken(tConfig.token.includes('dummy') ? '' : tConfig.token);
      setIsTursoConfigured(tConfig.isConfigured);
      setTursoTestResult(null);
      setSchemaInitResult(null);

      const gConfig = getGitHubConfig();
      setGithubToken(gConfig.token);
      setGithubOwner(gConfig.owner);
      setGithubRepo(gConfig.repo);
      setGithubBranch(gConfig.branch || 'main');
      setIsGitHubConfigured(gConfig.isConfigured);
      setGithubTestResult(null);

      setBase64Stats(countRemainingBase64Images());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestTurso = async () => {
    setIsTestingTurso(true);
    setTursoTestResult(null);
    try {
      const res = await testCustomConnection(tursoUrl, tursoToken);
      setTursoTestResult(res);
      if (res.success) {
        setIsTursoConfigured(true);
      }
    } catch (err: any) {
      setTursoTestResult({
        success: false,
        message: err?.message || 'Không thể kết nối tới Turso.',
      });
    } finally {
      setIsTestingTurso(false);
    }
  };

  const handleInitSchema = async () => {
    setIsInitializingSchema(true);
    setSchemaInitResult(null);
    try {
      const res = await initTursoSchema();
      setSchemaInitResult(res);
      if (res.success) {
        await refreshAllDataFromTurso();
      }
    } catch (err: any) {
      setSchemaInitResult({
        success: false,
        message: `Lỗi khởi tạo: ${err?.message || String(err)}`,
      });
    } finally {
      setIsInitializingSchema(false);
    }
  };

  const handleTestGitHub = async () => {
    setIsTestingGitHub(true);
    setGithubTestResult(null);
    try {
      const res = await testGitHubConnection(githubToken, githubOwner, githubRepo, githubBranch);
      setGithubTestResult(res);
      if (res.success) {
        setIsGitHubConfigured(true);
      }
    } catch (err: any) {
      setGithubTestResult({
        success: false,
        message: err?.message || 'Không thể kết nối tới GitHub.',
      });
    } finally {
      setIsTestingGitHub(false);
    }
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tursoUrl && tursoToken) {
      saveCustomTursoConfig(tursoUrl, tursoToken);
    }
    if (githubToken && githubOwner && githubRepo) {
      saveGitHubConfig(githubToken, githubOwner, githubRepo, githubBranch);
    }
    await refreshAllDataFromTurso();
    onConfigSaved?.();
    onClose();
  };

  const handleResetToEnv = () => {
    clearCustomTursoConfig();
    clearGitHubConfig();
    const tConfig = getEffectiveTursoConfig();
    setTursoUrl(tConfig.url.includes('placeholder') ? '' : tConfig.url);
    setTursoToken(tConfig.token.includes('dummy') ? '' : tConfig.token);
    setIsTursoConfigured(tConfig.isConfigured);

    const gConfig = getGitHubConfig();
    setGithubToken(gConfig.token);
    setGithubOwner(gConfig.owner);
    setGithubRepo(gConfig.repo);
    setGithubBranch(gConfig.branch);
    setIsGitHubConfigured(gConfig.isConfigured);

    setTursoTestResult(null);
    setGithubTestResult(null);
    setSchemaInitResult(null);
  };

  const handleMigrateImages = async () => {
    setIsMigratingImages(true);
    setMigrationProgress('Bắt đầu quét hình ảnh câu hỏi...');
    try {
      const res = await migrateAllExistingImagesToStorage((msg) => setMigrationProgress(msg));
      setBase64Stats(countRemainingBase64Images());
      setMigrationProgress(`✓ Đã chuyển đổi thành công ${res.totalUploaded} ảnh lên GitHub Repository (Raw URL)!`);
      setTimeout(() => {
        setMigrationProgress(null);
      }, 5000);
    } catch (err: any) {
      setMigrationProgress(`Lỗi: ${err?.message || 'Không thể chuyển đổi ảnh.'}`);
    } finally {
      setIsMigratingImages(false);
    }
  };

  const handleCopySql = () => {
    fetch('/turso-schema.sql')
      .then((r) => r.text())
      .then((text) => {
        navigator.clipboard.writeText(text);
        setIsCopiedSql(true);
        setTimeout(() => setIsCopiedSql(false), 2500);
      })
      .catch(() => {
        navigator.clipboard.writeText('-- Mở tệp /turso-schema.sql trong mã nguồn để lấy trọn bộ schema.');
        setIsCopiedSql(true);
        setTimeout(() => setIsCopiedSql(false), 2500);
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-linear-to-r from-slate-900 to-indigo-950 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Cấu Hình Máy Chủ & Lưu Trữ
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Turso & GitHub
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Turso (SQLite Cloud) cho CSDL và GitHub Repository cho kho lưu trữ hình ảnh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('turso')}
            className={`flex items-center gap-2 px-3 py-2.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'turso'
                ? 'border-blue-600 text-blue-600 font-bold bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>1. Turso Database (SQLite)</span>
            {isTursoConfigured && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('github')}
            className={`flex items-center gap-2 px-3 py-2.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'github'
                ? 'border-indigo-600 text-indigo-600 font-bold bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Github className="w-4 h-4" />
            <span>2. GitHub Image Storage</span>
            {isGitHubConfigured && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`flex items-center gap-2 px-3 py-2.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'schema'
                ? 'border-purple-600 text-purple-600 font-bold bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>3. SQLite Schema (15 Bảng)</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* TAB 1: TURSO DATABASE */}
          {activeTab === 'turso' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-3">
                <Server className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-blue-950">
                    Cơ sở dữ liệu Turso (libSQL / SQLite Serverless):
                  </div>
                  <div>
                    Truy vấn dữ liệu thời gian thực không giới hạn, hỗ trợ 15 bảng phân tách chuẩn hóa. Sử dụng biến môi trường <code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-800 font-bold">TURSO_DATABASE_URL</code> và <code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-800 font-bold">TURSO_AUTH_TOKEN</code> hoặc điền trực tiếp bên dưới.
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-600" />
                  <span>Turso Database URL</span>
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={tursoUrl}
                  onChange={(e) => setTursoUrl(e.target.value)}
                  placeholder="libsql://thientch-exam-db-org.turso.io"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Định dạng: <code className="font-mono">libsql://your-db-org.turso.io</code> hoặc <code className="font-mono">https://your-db-org.turso.io</code>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  <span>Turso Auth Token</span>
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={tursoToken}
                  onChange={(e) => setTursoToken(e.target.value)}
                  placeholder="Nhập JWT Auth Token từ lệnh 'turso db tokens create <db>'..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white"
                />
              </div>

              {/* Action Buttons for Turso */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleTestTurso}
                  disabled={isTestingTurso || !tursoUrl || !tursoToken}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingTurso ? 'animate-spin' : ''}`} />
                  <span>{isTestingTurso ? 'Đang kiểm tra...' : 'Kiểm Tra Kết Nối Turso'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleInitSchema}
                  disabled={isInitializingSchema || !tursoUrl || !tursoToken}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all shadow-xs"
                  title="Tạo tự động 15 bảng SQLite trên Turso nếu chưa có"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isInitializingSchema ? 'animate-spin' : ''}`} />
                  <span>{isInitializingSchema ? 'Đang khởi tạo...' : 'Khởi Tạo 15 Bảng Tự Động'}</span>
                </button>
              </div>

              {tursoTestResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    tursoTestResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {tursoTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold">
                      {tursoTestResult.success ? 'Kết nối Turso thành công!' : 'Kết nối thất bại:'}
                    </div>
                    <div className="mt-0.5">{tursoTestResult.message}</div>
                  </div>
                </div>
              )}

              {schemaInitResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    schemaInitResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {schemaInitResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold">
                      {schemaInitResult.success ? 'Khởi tạo cấu trúc SQLite hoàn tất!' : 'Lỗi khởi tạo:'}
                    </div>
                    <div className="mt-0.5">{schemaInitResult.message}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GITHUB IMAGE STORAGE */}
          {activeTab === 'github' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900 text-white text-xs flex items-start gap-3">
                <Github className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-indigo-300">
                    Kho Lưu Trữ Hình Ảnh GitHub Repository:
                  </div>
                  <div className="text-slate-300">
                    Toàn bộ hình ảnh trong đề thi và ngân hàng câu hỏi được tải lên một GitHub Repository công khai. Hệ thống sinh trực tiếp đường dẫn <code className="font-mono bg-slate-800 px-1 py-0.5 rounded text-amber-300">https://raw.githubusercontent.com/...</code> và lưu vào CSDL Turso, tải siêu tốc qua Fastly CDN.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span>GitHub Personal Access Token</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Token có quyền 'repo'</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span>GitHub Owner (Tài khoản / Org)</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={githubOwner}
                    onChange={(e) => setGithubOwner(e.target.value)}
                    placeholder="vd: thientch hoặc your-org"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span>Repository Tên</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="exam-images"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nhánh (Branch)
                  </label>
                  <input
                    type="text"
                    value={githubBranch}
                    onChange={(e) => setGithubBranch(e.target.value)}
                    placeholder="main"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleTestGitHub}
                  disabled={isTestingGitHub || !githubToken || !githubOwner || !githubRepo}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingGitHub ? 'animate-spin' : ''}`} />
                  <span>{isTestingGitHub ? 'Đang kiểm tra...' : 'Kiểm Tra Kết Nối GitHub'}</span>
                </button>

                {base64Stats && base64Stats.totalBase64 > 0 && (
                  <button
                    type="button"
                    onClick={handleMigrateImages}
                    disabled={isMigratingImages || !isGitHubConfigured}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all shadow-xs"
                  >
                    <UploadCloud className={`w-3.5 h-3.5 ${isMigratingImages ? 'animate-spin' : ''}`} />
                    <span>
                      {isMigratingImages
                        ? 'Đang chuyển ảnh...'
                        : `Chuyển ${base64Stats.totalBase64} Ảnh Lên GitHub`}
                    </span>
                  </button>
                )}
              </div>

              {githubTestResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    githubTestResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {githubTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold">
                      {githubTestResult.success ? 'Kết nối GitHub Repository thành công!' : 'Lỗi kết nối GitHub:'}
                    </div>
                    <div className="mt-0.5">{githubTestResult.message}</div>
                  </div>
                </div>
              )}

              {migrationProgress && (
                <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-center gap-2.5">
                  <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                  <div>{migrationProgress}</div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SQLITE SCHEMA */}
          {activeTab === 'schema' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Toàn bộ mã SQL khởi tạo 15 bảng SQLite (Turso)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Bao gồm các bảng: schools, classes, students, users, exams, exam_questions, submissions...
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer border border-slate-300 transition-all"
                >
                  {isCopiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopiedSql ? 'Đã chép!' : 'Sao chép SQL'}</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] max-h-72 overflow-y-auto leading-relaxed border border-slate-800">
                <pre>{`-- 1. BẢNG TRƯỜNG HỌC (schools)
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  level TEXT DEFAULT 'highschool',
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- 2. BẢNG LỚP HỌC (classes)
CREATE TABLE IF NOT EXISTS classes (
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
);

-- 3. BẢNG HỌC SINH (students)
CREATE TABLE IF NOT EXISTS students (
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
);

-- 4. BẢNG NGƯỜI DÙNG (users)
CREATE TABLE IF NOT EXISTS users (
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
);

-- 5. BẢNG ĐỀ THI TỔNG QUAN (exams)
CREATE TABLE IF NOT EXISTS exams (
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
);

-- 6. BẢNG CHI TIẾT CÂU HỎI THI (exam_questions)
CREATE TABLE IF NOT EXISTS exam_questions (
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
);

-- 7. BẢNG KẾT QUẢ NỘP BÀI (submissions)
CREATE TABLE IF NOT EXISTS submissions (
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
);`}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={handleResetToEnv}
            className="text-xs text-slate-500 hover:text-slate-800 underline font-medium cursor-pointer"
          >
            Khôi phục mặc định (từ file .env)
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer shadow-md shadow-blue-500/20 transition-all active:scale-95"
            >
              Lưu Cấu Hình
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
