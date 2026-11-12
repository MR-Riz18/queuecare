import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Activity, History, LayoutDashboard, LogOut, Settings, Users, MonitorPlay, DoorOpen, User, BarChart3, ScrollText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useState, useRef, useEffect } from 'react';

const linkCls = ({ isActive }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
  }`;

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const { error } = useToast();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      error(e.message);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900 text-white shadow-lg shadow-slate-900/10">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500 text-white shadow-md shadow-teal-500/30">
              <Activity className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-white">QueueCare</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/" className={linkCls} end>
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </NavLink>
            <NavLink to="/queue" className={linkCls}>
              <MonitorPlay className="h-4 w-4" /> Queue
            </NavLink>
            <NavLink to="/history" className={linkCls}>
              <History className="h-4 w-4" /> History
            </NavLink>
            <NavLink to="/rooms" className={linkCls}>
              <DoorOpen className="h-4 w-4" /> Rooms
            </NavLink>
            <NavLink to="/analytics" className={linkCls}>
              <BarChart3 className="h-4 w-4" /> Analytics
            </NavLink>
            {isAdmin && (
              <>
                <NavLink to="/admin/users" className={linkCls}>
                  <Users className="h-4 w-4" /> Users
                </NavLink>
                <NavLink to="/admin/settings" className={linkCls}>
                  <Settings className="h-4 w-4" /> Settings
                </NavLink>
                <NavLink to="/admin/audit-logs" className={linkCls}>
                  <ScrollText className="h-4 w-4" /> Audit logs
                </NavLink>
              </>
            )}
          </nav>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 py-1.5 pl-1.5 pr-3 text-slate-200 hover:bg-slate-700"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500/20 text-teal-300">
              <User className="h-4 w-4" />
            </span>
            <span className="max-w-32 truncate text-sm font-medium">{user?.name}</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-200 shadow-xl shadow-black/30" role="menu">
              <div className="px-3 py-2">
                <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                <p className="truncate text-xs text-slate-400">{user?.email}</p>
                <p className="mt-1 inline-block rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-300">
                  {user?.role}
                </p>
              </div>
              <div className="my-1 border-t border-slate-800" />
              {/* Mobile nav duplicates for small screens */}
              <div className="md:hidden">
                <NavLink to="/" className={linkCls} end onClick={() => setMenuOpen(false)}>
                  <LayoutDashboard className="h-4 w-4" /> Dashboard
                </NavLink>
                <NavLink to="/queue" className={linkCls} onClick={() => setMenuOpen(false)}>
                  <MonitorPlay className="h-4 w-4" /> Queue
                </NavLink>
                <NavLink to="/history" className={linkCls} onClick={() => setMenuOpen(false)}>
                  <History className="h-4 w-4" /> History
                </NavLink>
                <NavLink to="/rooms" className={linkCls} onClick={() => setMenuOpen(false)}>
                  <DoorOpen className="h-4 w-4" /> Rooms
                </NavLink>
                <NavLink to="/analytics" className={linkCls} onClick={() => setMenuOpen(false)}>
                  <BarChart3 className="h-4 w-4" /> Analytics
                </NavLink>
                {isAdmin && (
                  <>
                    <NavLink to="/admin/users" className={linkCls} onClick={() => setMenuOpen(false)}>
                      <Users className="h-4 w-4" /> Users
                    </NavLink>
                    <NavLink to="/admin/settings" className={linkCls} onClick={() => setMenuOpen(false)}>
                      <Settings className="h-4 w-4" /> Settings
                    </NavLink>
                    <NavLink to="/admin/audit-logs" className={linkCls} onClick={() => setMenuOpen(false)}>
                      <ScrollText className="h-4 w-4" /> Audit logs
                    </NavLink>
                  </>
                )}
                <div className="my-1 border-t border-slate-800" />
              </div>
              <NavLink
                to="/profile"
                className={linkCls}
                onClick={() => setMenuOpen(false)}
                role="menuitem"
              >
                <User className="h-4 w-4" /> Profile
              </NavLink>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/10"
                role="menuitem"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
