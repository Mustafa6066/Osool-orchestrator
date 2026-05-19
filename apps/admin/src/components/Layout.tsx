import { useMemo, useState } from 'react';
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
  Menu,
  X,
  Puzzle,
} from 'lucide-react';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Subtitle2,
  Title3,
} from '@fluentui/react-components';
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
  { to: '/skills', label: 'Skills', Icon: Puzzle },
];

export function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navEntries = useMemo(() => navItems, []);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
    setMobileOpen(false);
  }

  function handleNavigate() {
    setMobileOpen(false);
  }

  function SidebarContent({ compact = false }: { compact?: boolean }) {
    return (
      <>
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm">O</span>
            </div>
            <div className={compact ? '' : 'min-w-0'}>
              <Title3 as="h1" className="text-zinc-100 leading-none">
                Osool
              </Title3>
              <Subtitle2 className="text-zinc-500 leading-none mt-1">
                Admin Console
              </Subtitle2>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto px-2">
          <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mb-2">Navigation</p>
          {navEntries.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={label}
              onClick={handleNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 ${
                  isActive
                    ? 'bg-brand-500/12 text-brand-400 font-medium'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={isActive ? 'text-brand-400' : 'text-zinc-500'} strokeWidth={isActive ? 2 : 1.75} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-2 py-3 border-t border-border">
          <Button
            appearance="subtle"
            className="!w-full !justify-start !text-sm !text-zinc-400 hover:!text-zinc-100 hover:!bg-white/5"
            icon={<LogOut size={15} strokeWidth={1.75} />}
            onClick={handleLogout}
          >
            Sign out
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface text-zinc-100">
      <aside className="hidden md:flex w-64 bg-surface border-r border-border shrink-0 flex-col">
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-border px-3 py-2 flex items-center justify-between">
          <Button
            appearance="subtle"
            icon={<Menu size={18} />}
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">O</span>
            </div>
            <span className="text-sm font-semibold text-zinc-100">Osool Admin</span>
          </div>
          <div className="w-8" />
        </header>

        <main className="flex-1 overflow-y-auto bg-surface">
          <div className="p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>

      <Drawer
        open={mobileOpen}
        onOpenChange={(_, data) => setMobileOpen(data.open)}
        position="start"
        modalType="modal"
        size="small"
        className="md:hidden"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                icon={<X size={16} />}
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              />
            }
          >
            Navigation
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody className="!p-0 !bg-surface">
          <div className="h-full flex flex-col">
            <SidebarContent compact />
          </div>
        </DrawerBody>
      </Drawer>
    </div>
  );
}

