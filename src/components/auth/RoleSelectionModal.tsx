import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { type UserRole } from '../../types/auth';
import { ShieldCheck, Factory, Users, Building, Truck, Check } from 'lucide-react';
import { Button } from '../ui/Button';

interface RoleOption {
  role: UserRole;
  title: string;
  portal: 'Export' | 'Domestic' | 'Admin';
  description: string;
  icon: React.ElementType;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: 'export_manager',
    title: 'Export Manager',
    portal: 'Export',
    description: 'Full access to yarn inventory, production stages, export orders, quality, dispatch & accounts.',
    icon: Factory,
  },
  {
    role: 'export_staff',
    title: 'Export Staff',
    portal: 'Export',
    description: 'Log production progress, update machines, manage daily yarn transactions and orders.',
    icon: Users,
  },
  {
    role: 'domestic_manager',
    title: 'Domestic Manager',
    portal: 'Domestic',
    description: 'Oversee domestic work orders, subcontractors, piece tracking, deliveries and billing.',
    icon: Building,
  },
  {
    role: 'domestic_staff',
    title: 'Domestic Staff',
    portal: 'Domestic',
    description: 'Manage domestic company work orders, piece counts and daily delivery notes.',
    icon: Users,
  },
  {
    role: 'subcontractor',
    title: 'Subcontractor',
    portal: 'Domestic',
    description: 'View assigned domestic work orders, track piece completions and payment status.',
    icon: Truck,
  },
  {
    role: 'admin',
    title: 'System Administrator',
    portal: 'Admin',
    description: 'Universal administrative access across all Export and Domestic factory modules.',
    icon: ShieldCheck,
  },
];

export default function RoleSelectionModal() {
  const { user, profile, updateRole, signOut } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>('export_manager');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If user already has a valid role and profile, do not render modal
  const hasValidRole = !!profile?.role && ['admin', 'export_manager', 'export_staff', 'domestic_manager', 'domestic_staff', 'subcontractor'].includes(profile.role);
  
  // Show only if user is logged in but hasn't picked a permanent role yet or is first-time onboarding
  if (!user || hasValidRole) {
    return null;
  }

  const handleConfirmRole = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const res = await updateRole(selectedRole);
      if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to assign role.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 text-primary border border-emerald-200 mb-3 shadow-sm">
            <ShieldCheck className="w-8 h-8 text-[#26965D]" />
          </div>
          <h2 className="text-2xl font-bold text-[#172B3F]">Welcome to Texora</h2>
          <p className="text-slate-500 text-sm mt-1">
            Please select your organizational role to configure your factory portal access.
          </p>
          {user.email && (
            <span className="inline-block mt-2 px-3 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full">
              Signed in as: <strong>{user.email}</strong>
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1 py-1">
          {ROLE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selectedRole === opt.role;
            return (
              <div
                key={opt.role}
                onClick={() => setSelectedRole(opt.role)}
                className={`cursor-pointer rounded-xl p-4 border transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#26965D] bg-emerald-50/50 shadow-sm ring-2 ring-[#26965D]/30'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-[#26965D] text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-[#172B3F]">{opt.title}</h4>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {opt.portal}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-[#26965D] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2.5 line-clamp-2 leading-relaxed">
                  {opt.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => signOut()}
            className="text-xs text-slate-500 hover:text-slate-800 underline transition-colors"
          >
            Sign out & switch account
          </button>

          <Button
            type="button"
            onClick={handleConfirmRole}
            isLoading={isSaving}
            className="bg-[#26965D] hover:bg-[#21866B] text-white px-6 font-medium"
          >
            Confirm Role & Enter Portal
          </Button>
        </div>
      </div>
    </div>
  );
}
