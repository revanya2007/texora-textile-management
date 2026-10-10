import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Truck, 
  Factory, 
  FileText, 
  Settings, 
  FileBox, 
  Briefcase, 
  FileSignature, 
  Wallet,
  ShieldCheck,
  ArrowRightLeft,
  X,
  Zap
} from 'lucide-react';
import { cn } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  onCloseMobile?: () => void;
}

// Configuration for Export Modules
const exportGroups = [
  {
    title: 'Export Operations',
    items: [
      { name: 'Raw Material / Yarn', path: '/export/materials', icon: Package },
      { name: 'Order Management', path: '/export/orders', icon: FileText },
      { name: 'Production & Machines', path: '/export/production', icon: Factory },
      { name: 'AI Production Prediction', path: '/export/predictions', icon: Zap },
      { name: 'Quality Management', path: '/export/quality', icon: ShieldCheck },
      { name: 'Customer Management', path: '/export/buyers', icon: Users },
      { name: 'Dispatch Management', path: '/export/dispatch', icon: Truck },
      { name: 'Cost & Accounts', path: '/export/accounts', icon: FileSignature },
      { name: 'Worker Attendance & Wages', path: '/export/workers', icon: Users },
      { name: 'Garmenting', path: '/export/garmenting', icon: FileBox },
    ]
  },
  {
    title: 'Quick Access',
    items: [
      { name: 'Executive Dashboard', path: '/export/dashboard', icon: LayoutDashboard },
      { name: 'Suppliers Master', path: '/export/suppliers', icon: Truck },
      { name: 'Finished Goods Ledger', path: '/export/finished', icon: FileBox },
      { name: 'Commercial Invoices', path: '/export/invoices', icon: FileSignature },
    ]
  }
];

// Configuration for Domestic Modules
const domesticGroups = [
  {
    title: 'Domestic Job-Work',
    items: [
      { name: 'Company Management', path: '/domestic/companies', icon: Briefcase },
      { name: 'Work Order Management', path: '/domestic/work-orders', icon: FileText },
      { name: 'Piece Tracking', path: '/domestic/piece-tracking', icon: FileBox },
      { name: 'Delivery Management', path: '/domestic/deliveries', icon: Truck },
      { name: 'Wage & Payment', path: '/domestic/payments', icon: Wallet },
    ]
  },
  {
    title: 'Quick Access',
    items: [
      { name: 'Executive Dashboard', path: '/domestic/dashboard', icon: LayoutDashboard },
      { name: 'Work Types & Rates', path: '/domestic/worktypes', icon: Settings },
    ]
  }
];

export default function Sidebar({ onCloseMobile }: SidebarProps) {
  const { portal } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const groups = portal === 'domestic' ? domesticGroups : exportGroups;
  const canSwitchPortal = role === 'admin';

  const handlePortalSwitch = () => {
    const target = portal === 'domestic' ? '/export/dashboard' : '/domestic/dashboard';
    navigate(target);
    onCloseMobile?.();
  };

  return (
    <div className="flex h-full flex-col bg-[#111C28] select-none">
      {/* Brand Header */}
      <div className="flex h-16 shrink-0 items-center justify-between px-5 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <img 
            src="/texora-icon.png" 
            alt="Texora Logo" 
            className="w-9 h-9 rounded-lg object-contain bg-white p-0.5 shadow-sm border border-slate-700/60 shrink-0" 
          />
          <div>
            <div className="text-base font-bold tracking-tight text-white leading-none">TEXORA</div>
            <div className="text-[10px] tracking-widest text-emerald-400 uppercase font-medium mt-0.5">Manufacturing ERP</div>
          </div>
        </div>

        {onCloseMobile && (
          <button 
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Portal Indicator / Quick Switcher */}
      <div className="px-3 pt-4 pb-2">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Current Portal</span>
            <span className="text-xs font-bold text-white capitalize flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${portal === 'domestic' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
              {portal === 'domestic' ? 'Domestic Job-Work' : 'Export Division'}
            </span>
          </div>
          {canSwitchPortal && (
            <button
              onClick={handlePortalSwitch}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1 border border-slate-700"
              title="Switch between Export and Domestic portals"
            >
              <ArrowRightLeft size={12} className="text-emerald-400" />
              Switch
            </button>
          )}
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto custom-scrollbar">
        {groups.map((group, idx) => (
          <div key={idx} className="space-y-1">
            <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150',
                      isActive
                        ? 'bg-emerald-600/90 text-white font-semibold shadow-xs'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    )
                  }
                >
                  <Icon className="mr-2.5 h-4 w-4 shrink-0 transition-transform group-hover:scale-105" aria-hidden="true" />
                  <span className="truncate">{item.name}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer System Info */}
      <div className="p-3 border-t border-slate-800/80">
        <div className="text-[11px] text-slate-400 text-center flex items-center justify-between px-2">
          <span>Industrial Edition</span>
          <span className="text-emerald-400/80 font-mono text-[10px]">v1.2.0</span>
        </div>
      </div>
    </div>
  );
}

