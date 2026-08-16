import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutGrid, Settings, ChevronLeft, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

const navItems = [
  { path: '/', icon: LayoutGrid, label: 'Tables' },
  { path: '/admin', icon: Settings, label: 'Admin' },
];

type Theme = 'dark' | 'light';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
}

/** Shared theme controller used by both app header variants. */
export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      data-testid="button-theme-toggle"
      className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-amber-600 transition-colors hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-amber-400 dark:hover:bg-zinc-700"
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
};

const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#10121A]">
       <div className="flex h-16 max-w-lg mx-auto items-center justify-around gap-1 rounded-2xl border border-slate-300 bg-slate-300/60 p-1 dark:border-zinc-800 dark:bg-zinc-900/90">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              data-testid={`nav-${label.toLowerCase()}`}
               className={`flex flex-col items-center justify-center gap-1 rounded-xl px-4 py-2 font-semibold transition-colors ${
                 active ? 'bg-emerald-600 font-bold text-white shadow-sm' : 'border-0 bg-transparent font-bold text-slate-700 transition-all hover:bg-white/60 hover:text-slate-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white'
              }`}
            >
              <Icon size={22} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export const TopBar = ({
  title,
  showBack,
  onBack,
}: {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}) => (
  <header className="sticky top-0 z-40 flex flex-shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-[#10121A]/95">
    {showBack && (
      <button
        onClick={onBack}
        data-testid="button-back"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-600 transition-all active:scale-90 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
      </button>
    )}
    <h1 className="truncate text-base font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h1>
    <div className="ml-auto">
      <ThemeToggle />
    </div>
  </header>
);

export default Navigation;
