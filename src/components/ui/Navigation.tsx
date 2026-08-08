import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutGrid, History, Settings, ChevronLeft } from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutGrid, label: 'Tables' },
  { path: '/history', icon: History, label: 'History' },
  { path: '/admin', icon: Settings, label: 'Admin' },
];

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
              className={`flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg transition-all ${
                active ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
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
  <header
    className="sticky top-0 z-40 backdrop-blur-sm flex-shrink-0 px-3 py-2.5 flex items-center gap-2"
    style={{
      background: 'linear-gradient(135deg, #0a1228 0%, #0d1a2e 100%)',
      borderBottom: '1px solid rgba(59,130,246,0.18)',
    }}
  >
    {showBack && (
      <button
        onClick={onBack}
        data-testid="button-back"
        className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 transition-all active:scale-90"
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.75)' }}
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
      </button>
    )}
    <h1 className="text-base font-extrabold text-white tracking-tight truncate">{title}</h1>
  </header>
);

export default Navigation;
