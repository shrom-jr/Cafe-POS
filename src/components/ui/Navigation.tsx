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
      className="flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800/90 p-2.5 text-amber-400 transition-colors hover:bg-zinc-700"
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
};

const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border pos-shadow">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              data-testid={`nav-${label.toLowerCase()}`}
               className={`flex flex-col items-center justify-center gap-1 rounded-xl px-4 py-2 font-semibold transition-colors ${
                 active ? 'bg-emerald-600 font-bold text-white shadow-lg shadow-emerald-950/50 hover:bg-emerald-500' : 'border border-zinc-700 bg-zinc-800/90 font-bold text-zinc-100 hover:bg-zinc-700 hover:text-white'
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
  <header className="sticky top-0 z-40 flex flex-shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 py-2.5 backdrop-blur-sm">
    {showBack && (
      <button
        onClick={onBack}
        data-testid="button-back"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground transition-all active:scale-90"
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
      </button>
    )}
    <h1 className="truncate text-base font-extrabold tracking-tight text-foreground">{title}</h1>
    <div className="ml-auto">
      <ThemeToggle />
    </div>
  </header>
);

export default Navigation;
