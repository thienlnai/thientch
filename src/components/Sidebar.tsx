import React, { useState } from 'react';
import { LogOut, User, LucideIcon, Menu, X, MoreHorizontal } from 'lucide-react';
import { ThientchLogo } from './ThientchLogo.tsx';

export interface SidebarMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
  badgeColor?: string;
}

interface SidebarProps {
  menuItems: SidebarMenuItem[];
  activeId: string;
  onSelect: (id: string) => void;
  userRoleName: string;
  userName: string;
  userSubtext?: string;
  onLogout: () => void;
  headerSubtitle?: string;
  themeColor?: 'blue' | 'purple' | 'emerald';
}

export const Sidebar: React.FC<SidebarProps> = ({
  menuItems,
  activeId,
  onSelect,
  userRoleName,
  userName,
  userSubtext,
  onLogout,
  headerSubtitle,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Maximum items shown in bottom bar
  const bottomBarLimit = 4;
  const showMoreInBottomBar = menuItems.length > bottomBarLimit;
  const bottomBarItems = showMoreInBottomBar ? menuItems.slice(0, 3) : menuItems;

  const handleMobileSelect = (id: string) => {
    onSelect(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* ========================================================
          1. GIAO DIỆN MÁY TÍNH (DESKTOP SIDEBAR - GIỮ NGUYÊN 100%)
         ======================================================== */}
      <aside className="hidden lg:flex lg:w-[20%] xl:w-[20%] min-w-[240px] max-w-[300px] shrink-0 bg-[#0B132B] text-slate-300 border-r border-[#1C2541]/80 flex-col justify-between lg:h-screen lg:sticky lg:top-0 select-none transition-all z-40">
        
        {/* Top: Logo & Branding */}
        <div>
          <div className="p-4 sm:p-5 border-b border-[#1C2541]/80 bg-[#080E21]">
            <ThientchLogo
              size="md"
              variant="dark"
              subtitle={headerSubtitle || 'Cổng Quản Trị Khảo Thí IT'}
            />
          </div>

          {/* Navigation Menu */}
          <div className="p-3 sm:p-4 space-y-1">
            <p className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider font-bold text-[#94A3B8]">
              MENU ĐIỀU HƯỚNG
            </p>

            <nav className="space-y-1.5">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeId === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer group text-left relative overflow-hidden ${
                      isActive
                        ? 'bg-gradient-to-r from-[#3B82F6] to-[#6366F1] text-white font-bold shadow-md shadow-blue-500/25 border-l-4 border-white'
                        : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#1E293B]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                          isActive ? 'text-white' : 'text-[#94A3B8] group-hover:text-[#3B82F6]'
                        }`}
                      />
                      <span className="tracking-tight">{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-[#1C2541] text-[#94A3B8] group-hover:bg-[#253254] group-hover:text-white'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Footer Sidebar: User Profile & Logout */}
        <div className="p-3 sm:p-4 border-t border-[#1C2541]/80 bg-[#080E21] mt-auto">
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#1C2541]/70 border border-[#2B3A67]/50">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#3B82F6] to-[#6366F1] flex items-center justify-center text-white font-bold shrink-0 shadow-xs">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate" title={userName}>
                  {userName}
                </p>
                <p className="text-[10px] text-[#60A5FA] truncate font-mono">
                  {userSubtext || userRoleName}
                </p>
              </div>
            </div>

            <button
              onClick={onLogout}
              title="Đăng xuất khỏi hệ thống"
              className="p-2 rounded-lg bg-[#0B132B] hover:bg-rose-600 text-slate-400 hover:text-white transition-all cursor-pointer shrink-0 primary-cta-btn"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2.5 px-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>THIEN<span className="text-[#EF4444] font-bold">TECH</span> :: SECURE</span>
            <span className="flex items-center gap-1.5 text-[#10B981] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
              ONLINE
            </span>
          </div>
        </div>
      </aside>

      {/* ========================================================
          2. GIAO DIỆN DI ĐỘNG (MOBILE TOP BAR & DRAWER & BOTTOM TABS)
         ======================================================== */}
      {/* Mobile Top Header (lg:hidden) */}
      <div className="lg:hidden sticky top-0 z-35 bg-[#080E21]/95 backdrop-blur-md border-b border-[#1C2541] px-3.5 py-2.5 flex items-center justify-between text-white">
        <ThientchLogo
          size="sm"
          variant="dark"
          subtitle={headerSubtitle || 'Khảo Thí IT'}
        />

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#1C2541] border border-[#2B3A67] text-[11px] text-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            <span className="font-semibold max-w-[100px] truncate">{userName}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="w-9 h-9 rounded-xl bg-[#1C2541] hover:bg-[#253254] text-white flex items-center justify-center cursor-pointer border border-[#2B3A67] transition-colors"
            aria-label="Mở menu"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4 text-rose-400" /> : <Menu className="w-4 h-4 text-[#38BDF8]" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu (Slide-in) */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
            onClick={() => setIsMobileMenuOpen(false)} 
          />
          <div className="relative w-[85%] max-w-xs h-full bg-[#0B132B] text-slate-300 border-l border-[#1C2541] p-5 flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-right duration-250">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#1C2541]">
                <ThientchLogo size="sm" variant="dark" />
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg bg-[#1C2541] text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-1">
                <p className="px-2 pb-2 text-[10px] font-mono uppercase tracking-wider font-bold text-[#94A3B8]">
                  DANH MỤC CHỨC NĂNG
                </p>
                <nav className="space-y-1">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleMobileSelect(item.id)}
                        className={`w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-r from-[#3B82F6] to-[#6366F1] text-white font-bold shadow-md shadow-blue-500/25'
                            : 'text-[#94A3B8] hover:text-white hover:bg-[#1E293B]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1C2541] text-white">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Bottom of Drawer: User Info & Logout */}
            <div className="pt-4 border-t border-[#1C2541] space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1C2541]/70 border border-[#2B3A67]/50">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#3B82F6] to-[#6366F1] flex items-center justify-center text-white font-bold shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{userName}</p>
                  <p className="text-[10px] text-[#60A5FA] truncate font-mono">{userSubtext || userRoleName}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Đăng Xuất Tài Khoản</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar (Fixed thumb-zone navigation, Pattern 1) */}
      <nav 
        aria-label="Thanh điều hướng di động"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B132B]/95 backdrop-blur-md border-t border-[#1C2541] px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-pb"
      >
        {bottomBarItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleMobileSelect(item.id)}
              className={`flex-1 min-h-[46px] flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-semibold transition-all cursor-pointer relative ${
                isActive
                  ? 'text-[#38BDF8] font-bold bg-[#1C2541]/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-4 h-4 transition-transform ${isActive ? 'scale-110 text-[#38BDF8]' : ''}`} />
                {item.badge !== undefined && Number(item.badge) > 0 && (
                  <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full text-[8px] font-bold bg-rose-500 text-white">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="mt-1 tracking-tight truncate max-w-[72px]">{item.label}</span>
            </button>
          );
        })}

        {showMoreInBottomBar && (
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className={`flex-1 min-h-[46px] flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-semibold transition-all cursor-pointer ${
              isMobileMenuOpen ? 'text-[#38BDF8] font-bold bg-[#1C2541]/60' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
            <span className="mt-1 tracking-tight">Thêm...</span>
          </button>
        )}
      </nav>
    </>
  );
};
