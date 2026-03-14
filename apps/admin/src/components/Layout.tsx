import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Bot,
  Filter,
  Megaphone,
  Target,
  Hash,
  RefreshCw,
  Globe,
  MessageSquare,
  Users,
  ListChecks,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/agents', label: 'Agents', Icon: Bot },
  { to: '/funnel', label: 'Funnel', Icon: Filter },
  { to: '/campaigns', label: 'Campaigns', Icon: Megaphone },
  { to: '/intents', label: 'Intents', Icon: Target },
  { to: '/keywords', label: 'Keywords', Icon: Hash },
  { to: '/feedback-loops', label: 'Feedback Loops', Icon: RefreshCw },
  { to: '/seo', label: 'SEO Pages', Icon: Globe },
  { to: '/chat-sessions', label: 'Chat Sessions', Icon: MessageSquare },
  { to: '/leads', label: 'Leads', Icon: Users },
  { to: '/waitlist', label: 'Waitlist', Icon: ListChecks },
];

export function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen bg-surface">
      {/* Sidebar */}
      <aside className="w-60 bg-surface border-r border-border flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-xs">O</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100 leading-none">Osool</p>
              <p className="text-xs text-zinc-500 leading-none mt-0.5">Admin Console</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto px-2">
          <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mb-2">Navigation</p>
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 ${
                  isActive
                    ? 'bg-brand-500/10 text-brand-400 font-medium'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} className={isActive ? 'text-brand-400' : 'text-zinc-500'} strokeWidth={isActive ? 2 : 1.75} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-2 py-3 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-500 hover:text-zinc-100 hover:bg-white/5 rounded-lg"
          >
            <LogOut size={15} strokeWidth={1.75} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-surface">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

