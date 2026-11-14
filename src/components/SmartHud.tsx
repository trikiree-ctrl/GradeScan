import { CheckCircle2, Loader2, AlertCircle, Zap } from 'lucide-react';
import type { HudState } from '../types/omr';

interface SmartHudProps {
  hud: HudState;
}

export function SmartHud({ hud }: SmartHudProps) {
  if (!hud.active) return null;

  return (
    <div
      id="smartLoadingHUD"
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-20 right-4 z-50 md:bottom-5 md:right-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 text-xs shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95"
    >
      {hud.status === 'running' && (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
      )}
      {hud.status === 'done' && (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      )}
      {hud.status === 'error' && (
        <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      )}

      <div className="flex items-center gap-2.5">
        <span className="font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
          {hud.label}
        </span>
        <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
          ·
        </span>
        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
          <Zap className="h-3 w-3 text-amber-500" aria-hidden="true" />
          {hud.benchmarkMs} ms
        </span>
      </div>
    </div>
  );
}
