import { CalendarDays, UserRound } from 'lucide-react';
import { format } from 'date-fns';

export type ActivityAccent = 'inflow' | 'sale' | 'loss';

const ACCENTS: Record<ActivityAccent, {
  border: string;
  surface: string;
  icon: string;
  text: string;
}> = {
  inflow: {
    border: 'border-l-emerald-500',
    surface: 'bg-emerald-950/20 hover:bg-emerald-950/30',
    icon: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    text: 'text-emerald-300',
  },
  sale: {
    border: 'border-l-rose-500',
    surface: 'bg-rose-950/20 hover:bg-rose-950/30',
    icon: 'bg-rose-950 text-rose-300 border-rose-800',
    text: 'text-rose-300',
  },
  loss: {
    border: 'border-l-amber-500',
    surface: 'bg-amber-950/20 hover:bg-amber-950/30',
    icon: 'bg-amber-950 text-amber-300 border-amber-800',
    text: 'text-amber-300',
  },
};

interface ActivityCardProps {
  accent: ActivityAccent;
  icon: React.ReactNode;
  headline: React.ReactNode;
  supporting?: React.ReactNode;
  timestamp: number;
  loggedBy?: string;
  actions?: React.ReactNode;
}

export const ActivityCard = ({
  accent,
  icon,
  headline,
  supporting,
  timestamp,
  loggedBy,
  actions,
}: ActivityCardProps) => {
  const colors = ACCENTS[accent];

  return (
    <article className={`border border-slate-800 border-l-4 ${colors.border} ${colors.surface} rounded-2xl p-4 transition-colors`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center ${colors.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white leading-5">{headline}</p>
          {supporting && (
            <div className={`text-xs ${colors.text} mt-1.5 leading-5`}>
              {supporting}
            </div>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t border-white/[0.06] text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays size={12} />
          {format(timestamp, 'dd MMM yyyy, hh:mm a')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <UserRound size={12} />
          {loggedBy || 'System'}
        </span>
      </div>
    </article>
  );
};

interface EmptyActivityStateProps {
  icon: React.ReactNode;
  title: string;
  helper: string;
}

export const EmptyActivityState = ({ icon, title, helper }: EmptyActivityStateProps) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-6 bg-slate-950 border border-slate-800 rounded-2xl">
    <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-amber-400 shadow-lg shadow-amber-950/30">
      {icon}
    </div>
    <p className="text-white font-bold text-base mt-4">{title}</p>
    <p className="text-slate-400 text-xs mt-1 max-w-sm">{helper}</p>
  </div>
);