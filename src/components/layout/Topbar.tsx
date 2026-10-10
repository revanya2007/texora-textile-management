import { Menu, LogOut, User as UserIcon, Shield, ArrowRightLeft } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface TopbarProps {
  onToggleMobileMenu?: () => void;
}

export default function Topbar({ onToggleMobileMenu }: TopbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { portal } = useParams();
  const { user, profile, role, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const displayName = profile?.first_name 
    ? `${profile.first_name} ${profile.last_name || ''}`.trim() 
    : user?.email?.split('@')[0] || 'User';

  const formatRole = (r: string | null) => {
    if (!r) return 'Guest';
    return r.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Extract clean page title from path
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const rawPageName = pathSegments[pathSegments.length - 1] || 'dashboard';
  const pageTitle = rawPageName
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  const canSwitchPortal = role === 'admin';

  return (
    <div className="flex flex-1 items-center justify-between gap-4">
      {/* Left: Mobile trigger & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button 
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Toggle Navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-600 font-semibold hidden sm:inline">
            {portal === 'domestic' ? 'Domestic' : 'Export'} /
          </span>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {pageTitle}
          </h1>
        </div>
      </div>
      
      {/* Right: Actions, Portal Switcher & Profile */}
      <div className="flex items-center gap-3">
        {/* Quick Portal Toggle (Desktop) */}
        {canSwitchPortal && (
          <button
            onClick={() => navigate(portal === 'domestic' ? '/export/dashboard' : '/domestic/dashboard')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            title="Switch Portal"
          >
            <ArrowRightLeft size={13} className="text-emerald-600" />
            <span>Switch to {portal === 'domestic' ? 'Export' : 'Domestic'}</span>
          </button>
        )}

        <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>

        {/* User Info & Role Badge */}
        <div className="flex items-center gap-2.5 pl-1">
          <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-semibold text-xs shadow-xs">
            <UserIcon size={15} />
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-900 leading-tight">{displayName}</span>
            <div className="flex items-center gap-1 text-[10px] text-slate-600">
              <Shield size={9} className="text-emerald-600" />
              <span>{formatRole(role)}</span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button 
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-xs font-medium"
          title="Sign Out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </div>
  );
}

