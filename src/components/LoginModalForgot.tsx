import React from 'react';
import { X, HelpCircle, Phone, ShieldAlert, School, KeyRound, CheckCircle2 } from 'lucide-react';
import { Language, TRANSLATIONS } from '../types/index.ts';

interface LoginModalForgotProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const LoginModalForgot: React.FC<LoginModalForgotProps> = ({ isOpen, onClose, lang }) => {
  if (!isOpen) return null;
  const t = TRANSLATIONS[lang];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-[#071324] via-[#0B1A30] to-[#0066FF] px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center border border-white/20">
                <KeyRound className="w-5 h-5 text-blue-200" />
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-tight">{t.forgotModalTitle}</h3>
                <p className="text-xs text-blue-200 mt-0.5">{t.systemTitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-slate-700">
          <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-xl flex items-start gap-3 text-amber-900">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-950">
                {lang === 'vi' ? 'Quy chế bảo mật tài khoản thi trắc nghiệm' : 'Exam Account Security Policy'}
              </p>
              <p className="mt-1 leading-relaxed text-amber-800 text-xs sm:text-sm">
                {t.forgotModalBody}
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {lang === 'vi' ? 'Quy trình cấp lại mật khẩu chuẩn:' : 'Official Credential Reset Steps:'}
            </p>

            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <div className="text-xs sm:text-sm text-slate-600">
                <span className="font-medium text-slate-900">
                  {lang === 'vi' ? 'Liên hệ Giáo viên quản nhiệm/chủ nhiệm:' : 'Contact Homeroom / Subject Teacher:'}
                </span>{' '}
                {lang === 'vi' 
                  ? 'Cung cấp Họ và tên, Lớp học và Mã số học sinh (Số báo danh).' 
                  : 'Provide your Full Name, Class, and Student ID number.'}
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <div className="text-xs sm:text-sm text-slate-600">
                <span className="font-medium text-slate-900">
                  {lang === 'vi' ? 'Xác thực hồ sơ thi:' : 'Identity & Roster Verification:'}
                </span>{' '}
                {lang === 'vi'
                  ? 'Giáo viên bộ môn tra cứu trong Trang Quản trị viên và cấp lại mật khẩu ngay lập tức.'
                  : 'Teacher verifies in the Admin/Teacher portal and issues a secure temporary password.'}
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                3
              </div>
              <div className="text-xs sm:text-sm text-slate-600">
                <span className="font-medium text-slate-900">
                  {lang === 'vi' ? 'Đăng nhập vào ca thi:' : 'Sign in to the examination:'}
                </span>{' '}
                {lang === 'vi'
                  ? 'Học sinh dùng mật khẩu mới đăng nhập vào ca thi trắc nghiệm theo lịch đã phân công.'
                  : 'Sign in with newly assigned credentials to access scheduled tests.'}
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-800 flex items-center gap-2">
            <Phone className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{t.contactSupport}</span>
          </div>

          <p className="text-[11px] text-slate-400 italic">
            * {t.forgotModalNote}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-all duration-150 shadow-xs hover:shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
