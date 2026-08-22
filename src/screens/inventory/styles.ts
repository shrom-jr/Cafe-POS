// Shared style constants for the Inventory module
export const CARD    = 'w-full text-white relative flex flex-col gap-5';
export const CARD_SM = 'bg-[#13151F] border border-white/15 p-5 rounded-2xl shadow-xl';

export const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all';
export const BTN_SM_PRIMARY = 'px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all inline-flex items-center gap-2';
export const BTN_GHOST   = 'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#181B26] hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider transition-all';
export const BTN_DANGER  = 'p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all inline-flex items-center gap-1.5';
export const BTN_EDIT    = 'p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all inline-flex items-center gap-1.5';
export const BTN_BUY     = 'p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all inline-flex items-center gap-1.5';
export const BTN_ADJUST  = 'p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all inline-flex items-center gap-1.5';

export const INPUT  = 'w-full bg-[#181B26] border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white font-semibold rounded-xl px-3.5 py-2.5 text-sm placeholder:text-zinc-500 outline-none transition-all';
export const SELECT = 'w-full bg-[#181B26] border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white font-semibold rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all';
export const LABEL  = 'text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block';

export const TH = 'py-4 px-6 text-xs font-black uppercase tracking-widest text-zinc-200 text-left whitespace-nowrap';
export const TD = 'py-4 px-6 text-sm align-middle';

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
