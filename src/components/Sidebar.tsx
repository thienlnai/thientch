import React from 'react';
import { LogOut, User, LucideIcon } from 'lucide-react';
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
  return (
    <aside className="w-full lg:w-[20%] xl:w-[20%] min-w-[240px] max-w-[300px] shrink-0 bg-[#0B132B] text-slate-300 border-r border-[#1C2541]/80 flex flex-col justify-between lg:h-screen lg:sticky lg:top-0 select-none transition-all z-40">
      
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
          <span>THIENTCH :: SECURE</span>
          <span className="flex items-center gap-1.5 text-[#10B981] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
            ONLINE
          </span>
        </div>
      </div>

    </aside>
  );
};
