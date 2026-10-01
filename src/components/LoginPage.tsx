import React, { useState, useEffect } from 'react';
import { 
  User as UserIcon, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck, 
  AlertCircle, 
  Clock, 
  Code2, 
  Cpu,
  Binary,
  Terminal,
  Info,
  LockKeyhole,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { Language, TRANSLATIONS, UserAccount, Student } from '../types/index.ts';
import { LanguageSelector } from './LanguageSelector.tsx';
import { LoginModalForgot } from './LoginModalForgot.tsx';
import { ThientchLogo } from './ThientchLogo.tsx';
import { INITIAL_ADMIN_PASSWORD } from '../services/dbService.ts';
import itIllustration from '../assets/images/thientch_it_exam_illustration_1790165224287.jpg';

interface LoginPageProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  onLoginSuccess: (
    role: 'admin' | 'teacher' | 'student',
    userData: UserAccount | Student,
    remember: boolean
  ) => void;
  users: UserAccount[];
  students: Student[];
}

export const LoginPage: React.FC<LoginPageProps> = ({
  lang,
  onLanguageChange,
  onLoginSuccess,
  users,
  students,
}) => {
  const t = TRANSLATIONS[lang];

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  // Load remembered username if present
  useEffect(() => {
    const saved = localStorage.getItem('thientch_remembered_username');
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUsername = username.trim();
    const cleanPassword = password;

    if (!cleanUsername || !cleanPassword) {
      setErrorMsg(t.errorEmptyFields);
      return;
    }

    setIsSubmitting(true);

    // Giả lập await API Đăng nhập xác thực với Turso / Users collection
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 1. Root Admin Priority Check (Guarantees system administrator access never gets locked out)
    const isAdminUsername =
      cleanUsername.toLowerCase() === 'admin' ||
      cleanUsername.toLowerCase() === 'admin@exam.edu.vn';

    if (
      isAdminUsername &&
      (cleanPassword === INITIAL_ADMIN_PASSWORD ||
       cleanPassword === '8653564@Thien' ||
       cleanPassword === 'admin')
    ) {
      const adminAccount = users.find((u) => u.role === 'admin') || {
        id: 'admin_root',
        fullName: 'Quản trị viên Hệ thống (Thiện L.N)',
        username: 'admin',
        password: INITIAL_ADMIN_PASSWORD,
        email: 'admin@exam.edu.vn',
        phone: '0908 653 564',
        subjects: 'Quản trị Hệ thống Khảo thí',
        role: 'admin' as const,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (rememberMe) {
        localStorage.setItem('thientch_remembered_username', cleanUsername);
      } else {
        localStorage.removeItem('thientch_remembered_username');
      }

      setIsSubmitting(false);
      onLoginSuccess('admin', adminAccount, rememberMe);
      return;
    }

    // 2. Check in users collection (Admin or Teacher)
    const matchedUser = users.find((u) => {
      const usernameMatch =
        u.username.toLowerCase() === cleanUsername.toLowerCase() ||
        u.email.toLowerCase() === cleanUsername.toLowerCase();
      if (!usernameMatch) return false;

      // Admin fallback check
      if (u.role === 'admin' && (cleanPassword === INITIAL_ADMIN_PASSWORD || cleanPassword === '8653564@Thien')) {
        return true;
      }
      return u.password === cleanPassword;
    });

    if (matchedUser) {
      if (matchedUser.status === 'suspended') {
        setErrorMsg(t.errorAccountSuspended);
        setIsSubmitting(false);
        return;
      }

      if (rememberMe) {
        localStorage.setItem('thientch_remembered_username', cleanUsername);
      } else {
        localStorage.removeItem('thientch_remembered_username');
      }

      setIsSubmitting(false);
      onLoginSuccess(matchedUser.role, matchedUser, rememberMe);
      return;
    }

    // 3. Check in students collection (by studentCode or username)
    const matchedStudent = students.find((s) => {
      const idMatch =
        s.username.toLowerCase() === cleanUsername.toLowerCase() ||
        s.studentCode.toLowerCase() === cleanUsername.toLowerCase();
      return idMatch && s.password === cleanPassword;
    });

    if (matchedStudent) {
      if (matchedStudent.status === 'suspended') {
        setErrorMsg(t.errorAccountSuspended);
        setIsSubmitting(false);
        return;
      }

      if (rememberMe) {
        localStorage.setItem('thientch_remembered_username', cleanUsername);
      } else {
        localStorage.removeItem('thientch_remembered_username');
      }

      setIsSubmitting(false);
      onLoginSuccess('student', matchedStudent, rememberMe);
      return;
    }

    setErrorMsg(t.errorInvalidCredentials);
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen w-full bg-[#070D18] flex flex-col justify-between font-sans antialiased text-slate-100 selection:bg-[#00FF88] selection:text-slate-950 relative overflow-x-hidden">
      
      {/* Background Matrix/Circuit Tech Elements */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#0066FF_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#0066FF]/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-[#00FF88]/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Bar / Global Header */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between z-20">
        <ThientchLogo
          size="md"
          variant="dark"
          subtitle={lang === 'vi' ? 'Hệ thống Kiểm tra Trực tuyến Công nghệ Thông tin' : 'IT Online Examination System'}
        />

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSelector currentLang={lang} onLanguageChange={onLanguageChange} />
        </div>
      </header>

      {/* Main Split-Screen Section */}
      <main className="flex-1 flex items-center justify-center p-3 sm:p-6 lg:p-8 z-10">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 bg-[#0C1628]/95 backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/60 border border-slate-800/90 overflow-hidden min-h-[660px]">
          
          {/* ========================================================
              PHẦN NHẬN DIỆN THƯƠNG HIỆU (BÊN TRÁI / LEFT BRANDING)
             ======================================================== */}
          <div className="lg:col-span-6 bg-gradient-to-br from-[#060F1E] via-[#0A182E] to-[#0E2242] text-white p-7 sm:p-10 lg:p-12 flex flex-col justify-between relative overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800/80">
            
            {/* Tech glows */}
            <div className="absolute -top-32 -left-32 w-80 h-80 bg-[#0066FF]/25 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#00FF88]/20 rounded-full blur-3xl pointer-events-none" />

            {/* Top Identity & Headlines */}
            <div className="relative z-10 space-y-4">

              {/* System Title: 100% width, increased vertical height and impact */}
              <div className="w-full select-none pt-1">
                {lang === 'vi' ? (
                  <svg
                    viewBox="0 0 540 102"
                    className="w-full h-auto overflow-visible"
                    aria-label={t.systemTitle}
                  >
                    <defs>
                      <linearGradient id="titleGlowVi" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFFFFF" />
                        <stop offset="60%" stopColor="#F0F6FF" />
                        <stop offset="100%" stopColor="#BBD7FF" />
                      </linearGradient>
                      <filter id="shadowFilter" x="-10%" y="-10%" width="120%" height="130%">
                        <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0066FF" floodOpacity="0.5" />
                      </filter>
                    </defs>
                    {/* Dòng 1: HỆ THỐNG KIỂM TRA TRỰC TUYẾN */}
                    <text
                      x="0"
                      y="40"
                      textLength="540"
                      lengthAdjust="spacingAndGlyphs"
                      className="font-black uppercase"
                      fill="url(#titleGlowVi)"
                      filter="url(#shadowFilter)"
                      style={{
                        fontFamily: 'inherit',
                        fontWeight: 900,
                        fontSize: '34px',
                        letterSpacing: '0.04em',
                      }}
                    >
                      HỆ THỐNG KIỂM TRA TRỰC TUYẾN
                    </text>
                    {/* Dòng 2: CÔNG NGHỆ THÔNG TIN */}
                    <text
                      x="0"
                      y="94"
                      textLength="540"
                      lengthAdjust="spacingAndGlyphs"
                      className="font-black uppercase"
                      fill="url(#titleGlowVi)"
                      filter="url(#shadowFilter)"
                      style={{
                        fontFamily: 'inherit',
                        fontWeight: 900,
                        fontSize: '44px',
                        letterSpacing: '0.05em',
                      }}
                    >
                      CÔNG NGHỆ THÔNG TIN
                    </text>
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 540 102"
                    className="w-full h-auto overflow-visible"
                    aria-label={t.systemTitle}
                  >
                    <defs>
                      <linearGradient id="titleGlowEn" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFFFFF" />
                        <stop offset="60%" stopColor="#F0F6FF" />
                        <stop offset="100%" stopColor="#BBD7FF" />
                      </linearGradient>
                      <filter id="shadowFilterEn" x="-10%" y="-10%" width="120%" height="130%">
                        <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0066FF" floodOpacity="0.5" />
                      </filter>
                    </defs>
                    {/* Line 1: INFORMATION TECHNOLOGY */}
                    <text
                      x="0"
                      y="40"
                      textLength="540"
                      lengthAdjust="spacingAndGlyphs"
                      className="font-black uppercase"
                      fill="url(#titleGlowEn)"
                      filter="url(#shadowFilterEn)"
                      style={{
                        fontFamily: 'inherit',
                        fontWeight: 900,
                        fontSize: '36px',
                        letterSpacing: '0.04em',
                      }}
                    >
                      INFORMATION TECHNOLOGY
                    </text>
                    {/* Line 2: ONLINE EXAMINATION SYSTEM */}
                    <text
                      x="0"
                      y="94"
                      textLength="540"
                      lengthAdjust="spacingAndGlyphs"
                      className="font-black uppercase"
                      fill="url(#titleGlowEn)"
                      filter="url(#shadowFilterEn)"
                      style={{
                        fontFamily: 'inherit',
                        fontWeight: 900,
                        fontSize: '36px',
                        letterSpacing: '0.04em',
                      }}
                    >
                      ONLINE EXAMINATION SYSTEM
                    </text>
                  </svg>
                )}
              </div>

              {/* Slogan & IT Exam System Description - Only appearance of Slogan */}
              <div className="space-y-2">
                <p className="text-base sm:text-lg font-bold text-[#00FF88] tracking-wide font-mono">
                  "{t.slogan}"
                </p>
                <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed max-w-lg">
                  {lang === 'vi'
                    ? 'Nền tảng thi trắc nghiệm lập trình chuyên biệt: Ngân hàng câu hỏi chuẩn hóa, thuật toán đa ngôn ngữ (C/C++, Java, Python, Web), tự động xáo đề, chấm điểm tức thì và chống gian lận đa tầng.'
                    : 'Specialized online IT examination platform: Standardized question banks, multi-language coding questions (C/C++, Java, Python, Web), instant auto-grading, and real-time anti-cheat proctoring.'}
                </p>
              </div>
            </div>

            {/* IT Examination High-Tech Illustration Banner */}
            <div className="relative z-10 my-6 sm:my-8 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/80 group bg-slate-950/80">
              <img
                src={itIllustration}
                alt="THIENTCH IT Exam Illustration"
                className="w-full h-48 sm:h-56 lg:h-60 object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#060F1E]/95 via-[#060F1E]/40 to-transparent flex items-end p-4 sm:p-5">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 text-white">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00FF88] animate-ping" />
                    <span className="text-xs font-mono font-semibold text-emerald-300 tracking-wide">
                      {lang === 'vi' ? 'Phòng thi mã hóa & kiểm thử tự động' : 'Encrypted & Automated Test Engine'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    {'<Code::Pass/>'}
                  </span>
                </div>
              </div>
            </div>

            {/* IT Examination Highlights */}
            <div className="relative z-10 grid grid-cols-3 gap-2 sm:gap-3 pt-4 border-t border-slate-800 text-[11px] sm:text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#0066FF]/20 flex items-center justify-center shrink-0 border border-[#0066FF]/30">
                  <Cpu className="w-3.5 h-3.5 text-[#00D2FF]" />
                </div>
                <span className="font-medium truncate">{lang === 'vi' ? 'Chấm điểm tự động' : 'Auto Grading'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 border border-emerald-400/30">
                  <Code2 className="w-3.5 h-3.5 text-[#00FF88]" />
                </div>
                <span className="font-medium truncate">{lang === 'vi' ? 'Trắc nghiệm code' : 'Code MCQs'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 border border-indigo-400/30">
                  <LockKeyhole className="w-3.5 h-3.5 text-indigo-300" />
                </div>
                <span className="font-medium truncate">{lang === 'vi' ? 'Chống gian lận IT' : 'Anti-Cheat'}</span>
              </div>
            </div>

          </div>

          {/* ========================================================
              KHUNG FORM ĐĂNG NHẬP (BÊN PHẢI / RIGHT LOGIN FORM)
             ======================================================== */}
          <div className="lg:col-span-6 p-6 sm:p-10 lg:p-12 flex flex-col justify-center bg-[#0B1526]/80 relative">
            <div className="max-w-md w-full mx-auto space-y-6">
              
              {/* Form Title & Subtitle */}
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[#00D2FF] text-[11px] font-mono font-bold uppercase tracking-wider mb-2">
                  <Lock className="w-3 h-3 text-[#00FF88]" />
                  <span>{lang === 'vi' ? 'CỔNG XÁC THỰC BẢO MẬT' : 'SECURE AUTHENTICATION'}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-[#00D2FF] via-[#0066FF] to-[#00FF88] inline-block shadow-[0_0_12px_rgba(0,210,255,0.6)]" />
                  <h2 className="text-lg sm:text-xl font-extrabold uppercase tracking-wide bg-gradient-to-r from-white via-slate-100 to-blue-200 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(0,102,255,0.35)]">
                    {t.loginHeader}
                  </h2>
                </div>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed pl-4">
                  {t.loginSubtitle}
                </p>
              </div>

              {/* Authentication Error Alert Message */}
              {errorMsg && (
                <div 
                  role="alert"
                  className="p-3.5 bg-red-950/40 border border-red-500/40 rounded-xl flex items-start gap-3 text-red-200 animate-in fade-in duration-200 shadow-md shadow-red-950/20"
                >
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm font-semibold leading-relaxed">
                    {errorMsg}
                  </div>
                </div>
              )}

              {/* Login Form - Chặn hoàn toàn trình duyệt web hiện gợi ý lưu mật khẩu & tài khoản */}
              <form 
                onSubmit={handleLoginSubmit} 
                className="space-y-4"
                autoComplete="off"
                noValidate
              >
                {/* Input ẩn mồi nhử giúp vô hiệu hóa thuật toán quét thông tin đăng nhập tự động của trình duyệt */}
                <div className="sr-only" aria-hidden="true" style={{ display: 'none' }}>
                  <input type="text" name="fake_user_stop_autofill" tabIndex={-1} autoComplete="off" />
                  <input type="password" name="fake_pass_stop_autofill" tabIndex={-1} autoComplete="off" />
                </div>
                
                {/* Field 1: MÃ SỐ HỌC SINH / USERNAME */}
                <div>
                  <label 
                    htmlFor="auth-session-identifier" 
                    className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 font-mono"
                  >
                    {t.studentIdOrUsername}
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-[#00FF88] transition-colors">
                      <UserIcon className="w-5 h-5" />
                    </div>
                    <input
                      id="auth-session-identifier"
                      name="auth_usr_identifier"
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      placeholder={t.studentIdPlaceholder}
                      className={`w-full pl-11 pr-4 py-3 bg-[#08101E] hover:bg-[#0A1424] focus:bg-[#070D18] text-white placeholder-slate-500 text-sm font-medium rounded-xl border transition-all duration-200 outline-none ${
                        errorMsg
                          ? 'border-red-500/60 ring-2 ring-red-500/20'
                          : 'border-slate-700/80 focus:border-[#00FF88] focus:ring-4 focus:ring-[#00FF88]/15'
                      }`}
                    />
                  </div>
                </div>

                {/* Field 2: MẬT KHẨU - Dùng type="text" kết hợp WebkitTextSecurity: disc để trình duyệt không kích hoạt prompt Lưu Mật Khẩu */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label 
                      htmlFor="auth-session-token" 
                      className="block text-xs font-bold uppercase tracking-wider text-slate-300 font-mono"
                    >
                      {t.password}
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsForgotModalOpen(true)}
                      className="text-xs font-semibold text-[#00D2FF] hover:text-[#00FF88] transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>{t.forgotPassword}</span>
                    </button>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-[#00FF88] transition-colors">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input
                      id="auth-session-token"
                      name="auth_sec_token"
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      style={{
                        WebkitTextSecurity: showPassword ? 'none' : 'disc',
                      } as React.CSSProperties}
                      onCopy={(e) => {
                        if (!showPassword) e.preventDefault();
                      }}
                      onCut={(e) => {
                        if (!showPassword) e.preventDefault();
                      }}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      placeholder={t.passwordPlaceholder}
                      className={`w-full pl-11 pr-11 py-3 bg-[#08101E] hover:bg-[#0A1424] focus:bg-[#070D18] text-white placeholder-slate-500 text-sm font-medium rounded-xl border transition-all duration-200 outline-none ${
                        errorMsg
                          ? 'border-red-500/60 ring-2 ring-red-500/20'
                          : 'border-slate-700/80 focus:border-[#00FF88] focus:ring-4 focus:ring-[#00FF88]/15'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition-colors cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 text-emerald-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                    </button>
                  </div>
                </div>

                {/* Sub utilities: Ghi nhớ thiết bị Checkbox */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs sm:text-sm text-slate-400 font-medium">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 text-[#0066FF] rounded border-slate-700 bg-slate-900 focus:ring-[#00FF88] cursor-pointer"
                    />
                    <span>{t.rememberDevice}</span>
                  </label>
                </div>

                {/* Primary CTA Button: ĐĂNG NHẬP NGAY */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-5 bg-gradient-to-r from-[#0055D4] via-[#0066FF] to-[#00D2FF] hover:from-[#0047B3] hover:to-[#00B4D8] text-white font-bold text-sm sm:text-base rounded-xl shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed uppercase tracking-wider group"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-[#00FF88] rounded-full animate-spin" />
                        <span>{t.loggingIn}</span>
                      </>
                    ) : (
                      <>
                        <span>{t.loginButton}</span>
                        <ArrowRight className="w-4 h-4 text-[#00FF88] group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Thông báo hỗ trợ & Quy chế cấp tài khoản bên dưới form */}
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-start gap-3 text-slate-300">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[#00FF88] flex items-center justify-center shrink-0 mt-0.5">
                  <Info className="w-4 h-4" />
                </div>
                <div className="text-xs leading-relaxed flex-1">
                  <span className="font-bold text-white block mb-0.5">
                    {lang === 'vi' ? (
                      <>Hệ thống Khảo thí Tập trung THIEN<span className="text-[#EF4444] font-black">TECH</span></>
                    ) : (
                      <>THIEN<span className="text-[#EF4444] font-black">TECH</span> Centralized Examination System</>
                    )}
                  </span>
                  <p className="text-slate-400">
                    {t.noticeProvidedAccount}
                  </p>
                </div>
              </div>

              {/* Security Badge Footnote */}
              <div className="pt-2 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5 font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-[#00FF88]" />
                <span>
                  {lang === 'vi' ? (
                    <>THIEN<span className="text-[#EF4444] font-bold">TECH</span>: Hệ thống kiểm tra bảo mật cao — Không mở đăng ký tự do</>
                  ) : (
                    <>THIEN<span className="text-[#EF4444] font-bold">TECH</span>: High-security internal access — Self-registration disabled</>
                  )}
                </span>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* Global Footer */}
      <footer className="w-full max-w-7xl mx-auto py-4 px-4 sm:px-8 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-800/80 mt-2 z-10">
        <p className="font-medium text-slate-400">
          © 2026 <strong className="text-white">THIEN<span className="text-[#EF4444] font-black">TECH</span></strong> — {t.systemTitle}.
        </p>
        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
          <span>{lang === 'vi' ? 'Khảo thí số chuẩn hóa' : 'Standardized Digital Assessment'}</span>
          <span>•</span>
          <span className="text-emerald-400">{lang === 'vi' ? 'Mã hóa phòng thi' : 'Encrypted Exam Environment'}</span>
        </div>
      </footer>

      {/* Forgot Password Guide Modal */}
      <LoginModalForgot
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        lang={lang}
      />
    </div>
  );
};
