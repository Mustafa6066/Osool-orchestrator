import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/agents', label: 'Agents', icon: '🤖' },
  { to: '/funnel', label: 'Funnel', icon: '🔄' },
  { to: '/campaigns', label: 'Campaigns', icon: '📣' },
  { to: '/intents', label: 'Intents', icon: '🎯' },
  { to: '/keywords', label: 'Keywords', icon: '🔑' },
  { to: '/feedback-loops', label: 'Feedback Loops', icon: '♻️' },
  { to: '/seo', label: 'SEO Pages', icon: '🔍' },
  { to: '/chat-sessions', label: 'Chat Sessions', icon: '💬' },
  { to: '/leads', label: 'Leads', icon: '👥' },
  { to: '/waitlist', label: 'Waitlist', icon: '📋' },
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
      <aside className="w-64 bg-surface-card border-r border-border flex flex-col">
        <div className="px-6 py-5 border-b border-border">
          <h1 className="text-xl font-bold text-white">Osool<span className="text-yellow-400">.</span> Admin</h1>
        </div>
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white font-semibold border-r-2 border-brand-400'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-surface">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
