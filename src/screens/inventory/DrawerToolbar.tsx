import { Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type DrawerCategory = 'all' | 'spirits' | 'wine' | 'beer' | 'soft-drinks' | 'cigarettes';
export type DrawerTimeframe = 'today' | 'week' | 'month' | 'all';

export const DRAWER_CATEGORIES: { id: DrawerCategory; label: string }[] = [
  { id: 'all',         label: 'All Categories' },
  { id: 'spirits',     label: 'Spirits' },
  { id: 'wine',        label: 'Wine' },
  { id: 'beer',        label: 'Beer' },
  { id: 'soft-drinks', label: 'Soft Drinks' },
  { id: 'cigarettes',  label: 'Cigarettes' },
];

const TIMEFRAMES: { id: DrawerTimeframe; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'all',   label: 'All' },
];

interface DrawerToolbarProps {
  category: DrawerCategory;
  onCategoryChange: (value: DrawerCategory) => void;
  timeframe: DrawerTimeframe;
  onTimeframeChange: (value: DrawerTimeframe) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export const DrawerToolbar = ({
  category,
  onCategoryChange,
  timeframe,
  onTimeframeChange,
  search,
  onSearchChange,
}: DrawerToolbarProps) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-inner">
    <div className="relative min-w-0 flex-1">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        aria-label="Search inventory activity"
        className="w-full bg-slate-950 border border-slate-800 text-white placeholder:text-slate-400 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
        placeholder="Search product, table, staff..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </div>

    <Select value={category} onValueChange={(value) => onCategoryChange(value as DrawerCategory)}>
      <SelectTrigger className="w-full sm:w-[164px] shrink-0 bg-slate-950 border-slate-800 text-white rounded-xl text-xs font-semibold focus:ring-amber-500/30">
        <SelectValue placeholder="Category" />
      </SelectTrigger>
      <SelectContent className="bg-slate-900 border-slate-700 text-white">
        {DRAWER_CATEGORIES.map((option) => (
        <SelectItem key={option.id} value={option.id} className="text-sm focus:bg-amber-500 focus:text-slate-950">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>

    <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
      {TIMEFRAMES.map((option) => (
        <button
          key={option.id}
          onClick={() => onTimeframeChange(option.id)}
          className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
            timeframe === option.id
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);