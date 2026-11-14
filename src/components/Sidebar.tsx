import {
  BarChart3,
  BookOpenCheck,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  LayoutDashboard,
  Moon,
  Printer,
  RotateCcw,
  Sun,
  Users,
} from 'lucide-react';
import type { AppView } from '../types/omr';

interface SidebarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onResetDemoData: () => void;
  stateHash: string;
}

const NAV_ITEMS: Array<{
  id: AppView;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'ภาพรวมและสถิติ', icon: LayoutDashboard },
  { id: 'scanner', label: 'สแกนตรวจข้อสอบ', icon: Camera },
  { id: 'quizzes', label: 'ชุดข้อสอบและเฉลย', icon: FileSpreadsheet },
  { id: 'sheets', label: 'กระดาษคำตอบ OMR', icon: Printer },
  { id: 'analysis', label: 'วิเคราะห์ข้อสอบ', icon: BarChart3 },
  { id: 'classes', label: 'ชั้นเรียนและนักเรียน', icon: Users },
  { id: 'guide', label: 'คู่มือศึกษา ZipGrade', icon: BookOpenCheck },
];

export function Sidebar({
  activeView,
  onSelectView,
  collapsed,
  onToggleCollapse,
  darkMode,
  onToggleDarkMode,
  onResetDemoData,
  stateHash,
}: SidebarProps) {
  return (
    <aside
      className={`no-print hidden md:flex flex-col shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 transition-all duration-200 ${
        collapsed ? 'w-[76px]' : 'w-64'
      }`}
    >
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        {!collapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white font-mono text-xs font-bold shadow-sm">
              OMR
            </div>
            <span className="font-semibold tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate">
              GradeScan
            </span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white font-mono text-xs font-bold shadow-sm">
            OMR
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'ขยายแถบเมนูด้านข้าง' : 'ย่อแถบเมนูด้านข้าง'}
          className={`rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
            collapsed ? 'hidden' : ''
          }`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {collapsed && (
        <div className="flex justify-center border-b border-slate-200 py-2 dark:border-slate-800">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="ขยายแถบเมนูด้านข้าง"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <nav aria-label="เมนูหลัก" className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
              } ${collapsed ? 'justify-center px-2' : ''}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && (
                <span className="whitespace-nowrap truncate">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3 space-y-1.5 dark:border-slate-800">
        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label={darkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            collapsed ? 'justify-center px-2' : ''
          }`}
        >
          {darkMode ? (
            <Sun className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          )}
          {!collapsed && (
            <span className="whitespace-nowrap">
              {darkMode ? 'โหมดสว่าง' : 'โหมดมืด'}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onResetDemoData}
          aria-label="รีเซ็ตข้อมูลตัวอย่างเริ่มต้น"
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            collapsed ? 'justify-center px-2' : ''
          }`}
        >
          <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && (
            <span className="whitespace-nowrap">รีเซ็ตข้อมูลตัวอย่าง</span>
          )}
        </button>

        {!collapsed && (
          <div className="px-3 pt-1 text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
            Sync Hash · {stateHash}
          </div>
        )}
      </div>
    </aside>
  );
}
