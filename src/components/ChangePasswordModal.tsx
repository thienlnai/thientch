import React, { useState } from 'react';
import { 
  KeyRound, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ShieldCheck, 
  Loader2 
} from 'lucide-react';
import { UserAccount } from '../types/index.ts';
import { updateUserAccount } from '../services/dbService.ts';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount;
  onSuccess: (newPassword: string) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  user,
  onSuccess,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Calculate password strength
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score: 1, label: 'Yếu', color: 'bg-rose-500 text-rose-600' };
    if (score <= 3) return { score: 2, label: 'Trung bình', color: 'bg-amber-500 text-amber-600' };
    return { score: 3, label: 'Mạnh & An toàn', color: 'bg-emerald-500 text-emerald-600' };
  };

  const strength = getPasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Validation
    if (!currentPassword) {
      setErrorMsg('Vui lòng nhập mật khẩu hiện tại của bạn.');
      return;
    }

    if (currentPassword !== user.password) {
      setErrorMsg('Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại!');
      return;
    }

    if (!newPassword) {
      setErrorMsg('Vui lòng nhập mật khẩu mới.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('Mật khẩu mới phải có tối thiểu 6 ký tự để đảm bảo an toàn.');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
      return;
    }

    if (!confirmPassword) {
      setErrorMsg('Vui lòng xác nhận lại mật khẩu mới.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không trùng khớp với mật khẩu mới.');
      return;
    }

    // 2. Perform Update
    setIsSubmitting(true);
    try {
      await updateUserAccount(user.id, { password: newPassword }, user.username);
      onSuccess(newPassword);
      handleClose();
    } catch {
      setErrorMsg('Có lỗi xảy ra khi cập nhật mật khẩu. Vui lòng thử lại!');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center text-white shadow-inner">
              <KeyRound className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight">Đổi Mật Khẩu Tài Khoản</h3>
              <p className="text-xs text-indigo-100 mt-0.5">
                Giáo viên: <span className="font-semibold text-white">{user.fullName || user.username}</span> (@{user.username})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
            title="Đóng cửa sổ"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form 
          onSubmit={handleSubmit} 
          className="p-6 space-y-4"
          autoComplete="off"
          data-lpignore="true"
        >
          {/* Dummy hidden inputs to prevent browser autofill/save prompts */}
          <input type="text" name="fake_user" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
          <input type="password" name="fake_pass" style={{ display: 'none' }} tabIndex={-1} autoComplete="new-password" />

          {/* Security Notice */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-start gap-2.5 text-xs text-indigo-900">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Mật khẩu mới cần tối thiểu <strong>6 ký tự</strong>. Sau khi đổi thành công, bạn sẽ sử dụng mật khẩu mới này cho những lần đăng nhập tiếp theo.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-semibold leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* 1. Mật khẩu hiện tại */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Mật Khẩu Hiện Tại <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                name="user_curr_pw_field"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Nhập mật khẩu bạn đang dùng"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-800"
                autoComplete="one-time-code"
                data-lpignore="true"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showCurrentPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 2. Mật khẩu mới */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Mật Khẩu Mới <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type={showNewPassword ? 'text' : 'password'}
                name="user_new_pw_field"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-800"
                autoComplete="new-password"
                data-lpignore="true"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showNewPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength indicator */}
            {newPassword && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Độ mạnh mật khẩu:</span>
                  <span className={`font-bold ${strength.color.split(' ')[1]}`}>
                    {strength.label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${strength.score >= 1 ? strength.color.split(' ')[0] : 'bg-transparent'}`} />
                  <div className={`h-full rounded-full transition-all ${strength.score >= 2 ? strength.color.split(' ')[0] : 'bg-transparent'}`} />
                  <div className={`h-full rounded-full transition-all ${strength.score >= 3 ? strength.color.split(' ')[0] : 'bg-transparent'}`} />
                </div>
              </div>
            )}
          </div>

          {/* 3. Xác nhận mật khẩu mới */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Xác Nhận Mật Khẩu Mới <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="user_confirm_pw_field"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Nhập lại mật khẩu mới"
                className={`w-full pl-10 pr-10 py-2.5 bg-slate-50 hover:bg-white focus:bg-white border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-800 ${
                  confirmPassword && confirmPassword === newPassword
                    ? 'border-emerald-400 ring-1 ring-emerald-400/30'
                    : confirmPassword && confirmPassword !== newPassword
                    ? 'border-rose-400 ring-1 ring-rose-400/30'
                    : 'border-slate-300'
                }`}
                autoComplete="new-password"
                data-lpignore="true"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Matching Indicator */}
            {confirmPassword && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px]">
                {confirmPassword === newPassword ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mật khẩu xác nhận trùng khớp
                  </span>
                ) : (
                  <span className="text-rose-600 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Chưa khớp với mật khẩu mới
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang cập nhật...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Xác Nhận Đổi Mật Khẩu</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
