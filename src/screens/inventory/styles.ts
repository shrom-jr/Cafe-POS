// Shared style constants for the Inventory module
export const CARD    = 'rounded-xl border border-white/[0.07] bg-white/[0.03] p-5';
export const CARD_SM = 'rounded-xl border border-white/[0.07] bg-white/[0.03] p-4';

export const BTN_PRIMARY = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]';
export const BTN_SM_PRIMARY = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-semibold transition-all hover:brightness-110 active:scale-[0.97]';
export const BTN_GHOST   = 'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all';
export const BTN_DANGER  = 'inline-flex items-center gap-1.5 p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors';
export const BTN_EDIT    = 'inline-flex items-center gap-1.5 p-1.5 rounded-lg text-white/30 hover:text-blue-400 hover:bg-blue-400/10 transition-colors';
export const BTN_BUY     = 'inline-flex items-center gap-1.5 p-1.5 rounded-lg text-white/30 hover:text-green-400 hover:bg-green-400/10 transition-colors';
export const BTN_ADJUST  = 'inline-flex items-center gap-1.5 p-1.5 rounded-lg text-white/30 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors';

export const INPUT  = 'w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent';
export const SELECT = 'w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent';
export const LABEL  = 'text-xs font-medium text-muted-foreground mb-1 block';

export const TH = 'pb-2.5 text-xs font-medium text-muted-foreground text-left whitespace-nowrap';
export const TD = 'py-2.5 text-sm align-top';

export const MOVE_TYPE_COLORS: Record<string, string> = {
  Purchase:   'bg-blue-500/15 border-blue-500/20 text-blue-400',
  Sale:       'bg-purple-500/15 border-purple-500/20 text-purple-400',
  Adjustment: 'bg-yellow-500/15 border-yellow-500/20 text-yellow-400',
  Waste:      'bg-red-500/15 border-red-500/20 text-red-400',
  Correction: 'bg-cyan-500/15 border-cyan-500/20 text-cyan-400',
};

export const PROD_TYPE_COLORS: Record<string, string> = {
  alcohol:   'bg-amber-500/15 border-amber-500/20 text-amber-400',
  beverage:  'bg-sky-500/15 border-sky-500/20 text-sky-400',
  cigarette: 'bg-orange-500/15 border-orange-500/20 text-orange-400',
};
