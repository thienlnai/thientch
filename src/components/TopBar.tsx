import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Bell, 
  Clock, 
  ShieldCheck, 
  WifiOff, 
  X,
  Command,
  AlertCircle,
  CheckCircle2,
  Calendar,
  RefreshCw,
  Server
} from 'lucide-react';
import { Language } from '../types/index.ts';

interface TopBarProps {
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  roleBadgeText?: string;
  roleBadgeColor?: 'blue' | 'purple' | 'emerald';
  isLiveSync?: boolean;
  lang?: Language;
  onLogout?: () => void;
  userName?: string;
  userRole?: string;
  onOpenSupabaseConfig?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm dữ liệu, học sinh, mã đề, lớp học... (Ctrl + K)',
  roleBadgeText,
  roleBadgeColor = 'blue',
  isLiveSync = true,
  lang = 'vi',
  onOpenSupabaseConfig,
  onRefresh,
  isRefreshing = false,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(2);

  // Global Ctrl + K / Cmd + K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Real-time clock update (every 1 second)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const dateStr = now.toLocaleDateString('vi-VN', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      setCurrentTime(timeStr);
      setCurrentDate(dateStr);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const badgeColorClasses = {
    blue: 'bg-blue-50 text-[#2563EB] border-blue-200',
    purple: 'bg-indigo-50 text-[#4F46E5] border-indigo-200',
    emerald: 'bg-emerald-50 text-[#10B981] border-emerald-200',
  }[roleBadgeColor];

  const priorityNotifications = [
    {
      id: '1',
      title: lang === 'vi' ? 'Hạ tầng Turso & GitHub' : 'Turso & GitHub Storage',
      desc: lang === 'vi' ? 'CSDL SQLite Turso và kho ảnh GitHub đang đồng bộ trực tuyến tối ưu 99.9%' : 'Turso SQLite database & GitHub image storage actively streaming data at 99.9%',
      time: '1 phút trước',
      type: 'priority',
    },
    {
      id: '2',
      title: lang === 'vi' ? 'Bảo mật khảo thí đa tầng' : 'Multi-layer Exam Security',
      desc: lang === 'vi' ? 'Khóa bảo vệ toàn màn hình và kiểm soát truy cập đã sẵn sàng' : 'Exam lockdown ready for active student sessions',
      time: '10 phút trước',
      type: 'info',
    },
  ];

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 transition-all">
      
      {/* Left: Intelligent Global Search (Supports Ctrl + K) */}
      <div className="flex-1 max-w-lg">
        {onSearchChange ? (
          <div className="relative group">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[#2563EB] transition-colors" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-10 pr-20 py-2 text-xs sm:text-sm bg-slate-50 border border-[#E2E8F0] rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all placeholder:text-slate-400 text-[#0F172A]"
            />
            
            {/* Ctrl + K Shortcut Hint or Clear Button */}
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 pointer-events-auto cursor-pointer"
                  title="Xóa tìm kiếm"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-white border border-slate-200 rounded shadow-2xs">
                  <Command className="w-3 h-3" />
                  <span>K</span>
                </kbd>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {roleBadgeText && (
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${badgeColorClasses} flex items-center gap-1.5`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                {roleBadgeText}
              </span>
            )}
            <span className="text-xs text-slate-400 font-medium hidden md:inline">
              THIEN<span className="text-[#EF4444] font-bold">TECH</span> IT Assessment Platform
            </span>
          </div>
        )}
      </div>

      {/* Right Controls: Role Badge, LIVE SYNC with Pulsing Dot, Real-time Clock, Notifications */}
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        
        {/* Role Badge */}
        {onSearchChange && roleBadgeText && (
          <div className="hidden xl:flex items-center">
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${badgeColorClasses} flex items-center gap-1.5`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              {roleBadgeText}
            </span>
          </div>
        )}

        {/* Manual Refresh Button (if provided) */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-[#E2E8F0] text-xs font-semibold text-slate-700 select-none shadow-2xs cursor-pointer transition-all active:scale-95 disabled:opacity-75 disabled:cursor-not-allowed"
            title="Làm mới và đồng bộ lại toàn bộ dữ liệu từ máy chủ Turso"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">
              {isRefreshing ? (lang === 'vi' ? 'Đang đồng bộ...' : 'Syncing...') : (lang === 'vi' ? 'Làm Mới' : 'Refresh')}
            </span>
          </button>
        )}

        {/* Server Status & Configuration Button */}
        {onOpenSupabaseConfig ? (
          <button
            type="button"
            onClick={onOpenSupabaseConfig}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium select-none shadow-2xs cursor-pointer transition-all active:scale-95 ${
              isLiveSync
                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
            }`}
            title={
              isLiveSync
                ? 'Máy chủ Turso & GitHub đang kết nối trực tuyến. Bấm để tùy chỉnh cấu hình.'
                : 'Máy chủ đang ở chế độ cục bộ. Bấm để kết nối Turso Database & GitHub Storage.'
            }
          >
            {isLiveSync ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75 duration-1000" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10B981]" />
                </span>
                <span className="font-mono text-xs font-bold text-emerald-700 tracking-tight hidden sm:inline">
                  TURSO ONLINE
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-200">
                  {lang === 'vi' ? 'Tùy chỉnh' : 'Config'}
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-amber-700 text-xs font-mono font-bold hidden sm:inline">
                  CHẾ ĐỘ CỤC BỘ
                </span>
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200">
                  {lang === 'vi' ? 'Kết nối' : 'Connect'}
                </span>
              </>
            )}
          </button>
        ) : (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium select-none shadow-2xs ${
              isLiveSync
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {isLiveSync ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10B981]" />
                </span>
                <span className="font-mono text-xs font-bold text-emerald-700">LIVE SYNC</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-amber-600 text-xs font-mono font-bold">OFFLINE</span>
              </>
            )}
          </div>
        )}

        {/* Real-time Clock (Updated every second) */}
        <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#0B132B] text-white font-mono shadow-xs border border-[#1C2541]">
          <Clock className="w-3.5 h-3.5 text-[#10B981]" />
          <div className="flex flex-col text-left">
            <span className="text-xs font-bold text-[#38BDF8] tracking-wider leading-tight">
              {currentTime || '--:--:--'}
            </span>
            <span className="text-[9px] text-slate-400 font-sans tracking-tight">
              {currentDate || 'Hôm nay'}
            </span>
          </div>
        </div>

        {/* Priority Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setUnreadCount(0);
            }}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors relative cursor-pointer primary-cta-btn"
            title="Thông báo ưu tiên hệ thống"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-88 bg-white rounded-2xl shadow-xl border border-[#E2E8F0] p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#2563EB]" />
                  <span className="text-xs font-bold text-[#0F172A]">Thông Báo Ưu Tiên Hệ Thống</span>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2 mt-3 max-h-72 overflow-y-auto">
                {priorityNotifications.map((n) => (
                  <div key={n.id} className="p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-100 transition-colors">
                    <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                        {n.title}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">{n.time}</span>
                    </div>
                    <p className="text-[11px] text-[#475569] mt-1 leading-relaxed">{n.desc}</p>
                  </div>
                ))}
              </div>

              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Trạng thái: Hoạt động bình thường</span>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-[#2563EB] font-bold hover:underline cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

    </header>
  );
};
