import {
  BarChart3,
  BookOpenCheck,
  Camera,
  FileSpreadsheet,
  LayoutDashboard,
} from 'lucide-react';
import type { AppView } from '../types/omr';

interface MobileNavProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
}

const MOBILE_ITEMS: Array<{
  id: AppView;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'ภาพรวม', icon: LayoutDashboard },
  { id: 'scanner', label: 'สแกน', icon: Camera },
  { id: 'quizzes', label: 'ชุดสอบ', icon: FileSpreadsheet },
  { id: 'analysis', label: 'วิเคราะห์', icon: BarChart3 },
  { id: 'guide', label: 'คู่มือ', icon: BookOpenCheck },
];

export function MobileNav({ activeView, onSelectView }: MobileNavProps) {
  return (
    <nav
      aria-label="เมนูนำทางมือถือ"
      className="no-print fixed bottom-0 left-0 right-0 z-40 flex min-h-[58px] pb-[env(safe-area-inset-bottom)] items-center justify-around border-t border-slate-200 bg-white/95 px-2 backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-900/95"
    >
      {MOBILE_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectView(item.id)}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-medium transition-colors ${
              isActive
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
