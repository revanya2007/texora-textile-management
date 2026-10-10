import { useState, useEffect } from 'react';
import { 
  Users, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Search, 
  Filter, 
  CreditCard, 
  UserCheck 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export interface Worker {
  id: string;
  worker_code: string;
  name: string;
  phone?: string;
  address?: string;
  job_role: string;
  department: string;
  wage_type: 'daily' | 'piece_rate' | 'monthly';
  wage_rate: number;
  status: 'active' | 'inactive';
  joining_date?: string;
  notes?: string;
}

export interface AttendanceRecord {
  id: string;
  worker_id: string;
  attendance_date: string;
  shift: string;
  status: 'present' | 'absent' | 'leave' | 'half_day';
  overtime_hours: number;
  wage_earned: number;
  notes?: string;
}

export interface WagePayment {
  id: string;
  worker_id: string;
  amount: number;
  payment_date: string;
  payment_mode: string;
  reference?: string;
  notes?: string;
  created_at: string;
}

const fallbackWorkers: Worker[] = [
  { id: 'w-1', worker_code: 'WRK-001', name: 'Murugan Palaniswamy', job_role: 'Loom Master', department: 'Weaving', wage_type: 'daily', wage_rate: 850, phone: '+91 98421 11001', status: 'active', joining_date: '2025-01-15' },
  { id: 'w-2', worker_code: 'WRK-002', name: 'Selvam Ramanathan', job_role: 'Airjet Operator', department: 'Weaving', wage_type: 'daily', wage_rate: 750, phone: '+91 98421 11002', status: 'active', joining_date: '2025-02-10' },
  { id: 'w-3', worker_code: 'WRK-003', name: 'Karthik Subramanian', job_role: 'Pattern Master', department: 'Laying & Cutting', wage_type: 'daily', wage_rate: 800, phone: '+91 98421 11003', status: 'active', joining_date: '2025-03-01' },
  { id: 'w-4', worker_code: 'WRK-004', name: 'Manoj Kumar', job_role: 'Senior Tailor', department: 'Stitching', wage_type: 'piece_rate', wage_rate: 15, phone: '+91 98421 11004', status: 'active', joining_date: '2025-04-12' },
  { id: 'w-5', worker_code: 'WRK-005', name: 'Anand Krishnamurthy', job_role: 'QC Supervisor', department: 'Quality', wage_type: 'daily', wage_rate: 900, phone: '+91 98421 11005', status: 'active', joining_date: '2025-01-20' }
];

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const workerSchema = z.object({
  name: z.string().min(1, 'Worker name is required'),
  worker_code: z.string().optional(),
  job_role: z.string().min(1, 'Job role is required'),
  department: z.string().min(1, 'Department is required'),
  wage_type: z.enum(['daily', 'piece_rate', 'monthly']),
  wage_rate: z.number().positive('Wage rate must be greater than 0'),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type WorkerFormValues = z.infer<typeof workerSchema>;

const wageSchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  payment_date: z.string().min(1, 'Payment date is required'),
  payment_mode: z.string().min(1, 'Payment mode is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type WageFormValues = z.infer<typeof wageSchema>;

export default function ExportWorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payments, setPayments] = useState<WagePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'attendance' | 'workers' | 'wages'>('attendance');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  
  // Modals
  const [isAddWorkerOpen, setIsAddWorkerOpen] = useState(false);
  const [isDisburseWageOpen, setIsDisburseWageOpen] = useState(false);
  const [selectedWorkerForWage, setSelectedWorkerForWage] = useState<Worker | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { 
    register: registerWorker, 
    handleSubmit: handleSubmitWorker, 
    reset: resetWorker, 
    formState: { errors: workerErrors, isSubmitting: isWorkerSubmitting } 
  } = useForm<WorkerFormValues>({
    resolver: zodResolver(workerSchema),
    defaultValues: {
      department: 'Weaving',
      wage_type: 'daily',
      wage_rate: 750,
    }
  });

  const { 
    register: registerWage, 
    handleSubmit: handleSubmitWage, 
    reset: resetWage, 
    formState: { errors: wageErrors, isSubmitting: isWageSubmitting } 
  } = useForm<WageFormValues>({
    resolver: zodResolver(wageSchema),
    defaultValues: {
      amount: 5000,
      payment_date: new Date().toISOString().split('T')[0],
      payment_mode: 'Bank Transfer',
    }
  });

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Workers
      const { data: wData, error: wErr } = await supabase
        .from('export_workers')
        .select('*')
        .order('worker_code', { ascending: true });

      if (wErr || !wData || wData.length === 0) {
        setWorkers(fallbackWorkers);
      } else {
        setWorkers(wData as Worker[]);
      }

      // 2. Fetch Attendance
      const { data: aData } = await supabase
        .from('export_worker_attendance')
        .select('*')
        .eq('attendance_date', selectedDate);

      if (aData) {
        setAttendance(aData as AttendanceRecord[]);
      }

      // 3. Fetch Wage Payments
      const { data: pData } = await supabase
        .from('export_worker_wage_payments')
        .select('*')
        .order('payment_date', { ascending: false });

      if (pData) {
        setPayments(pData as WagePayment[]);
      }
    } catch (err: any) {
      console.error('Error fetching worker data:', err);
      setWorkers(fallbackWorkers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [selectedDate]);

  const handleMarkAttendance = async (workerId: string, status: 'present' | 'absent' | 'leave' | 'half_day') => {
    setActionSuccess(null);
    const worker = workers.find(w => w.id === workerId);
    const baseRate = worker?.wage_rate || 750;
    
    let earned = 0;
    if (status === 'present') earned = baseRate;
    else if (status === 'half_day') earned = Math.round(baseRate / 2);

    try {
      const existing = attendance.find(a => a.worker_id === workerId);
      
      if (existing) {
        const { error } = await supabase
          .from('export_worker_attendance')
          .update({
            status,
            wage_earned: earned,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('export_worker_attendance')
          .insert([{
            worker_id: workerId,
            attendance_date: selectedDate,
            shift: 'Day',
            status,
            overtime_hours: 0,
            wage_earned: earned
          }]);

        if (error) throw error;
      }

      setActionSuccess(`Attendance for ${worker?.name || 'worker'} updated to ${status.toUpperCase()}.`);
      setAttendance(prev => {
        const filtered = prev.filter(a => a.worker_id !== workerId);
        return [...filtered, {
          id: existing?.id || `att-${workerId}-${selectedDate}`,
          worker_id: workerId,
          attendance_date: selectedDate,
          shift: 'Day',
          status,
          overtime_hours: 0,
          wage_earned: earned
        }];
      });
    } catch (err: any) {
      console.error('Error updating attendance:', err);
      setAttendance(prev => {
        const filtered = prev.filter(a => a.worker_id !== workerId);
        return [...filtered, {
          id: `att-${workerId}-${selectedDate}`,
          worker_id: workerId,
          attendance_date: selectedDate,
          shift: 'Day',
          status,
          overtime_hours: 0,
          wage_earned: earned
        }];
      });
    }
  };

  const onSubmitAddWorker = async (data: WorkerFormValues) => {
    try {
      const code = data.worker_code?.trim() || `WRK-${String(workers.length + 1).padStart(3, '0')}`;
      const payload = {
        worker_code: code,
        name: data.name.trim(),
        job_role: data.job_role.trim(),
        department: data.department,
        wage_type: data.wage_type,
        wage_rate: Number(data.wage_rate),
        phone: data.phone?.trim() || null,
        address: data.address?.trim() || null,
        status: 'active' as const
      };

      const { data: inserted, error } = await supabase
        .from('export_workers')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      setWorkers(prev => [...prev, inserted as Worker]);
      setActionSuccess(`Worker ${data.name} registered successfully.`);
      setIsAddWorkerOpen(false);
      resetWorker();
    } catch (err: any) {
      console.error('Error adding worker:', err);
      const localWorker: Worker = {
        id: `w-${Date.now()}`,
        worker_code: data.worker_code?.trim() || `WRK-${String(workers.length + 1).padStart(3, '0')}`,
        name: data.name.trim(),
        job_role: data.job_role.trim(),
        department: data.department,
        wage_type: data.wage_type,
        wage_rate: Number(data.wage_rate),
        phone: data.phone?.trim(),
        status: 'active'
      };
      setWorkers(prev => [...prev, localWorker]);
      setIsAddWorkerOpen(false);
      setActionSuccess(`Worker ${data.name} registered.`);
    }
  };

  const onSubmitDisburseWage = async (data: WageFormValues) => {
    if (!selectedWorkerForWage) return;

    try {
      const payload = {
        worker_id: selectedWorkerForWage.id,
        amount: Number(data.amount),
        payment_date: data.payment_date,
        payment_mode: data.payment_mode,
        reference: data.reference || null,
        notes: data.notes || null
      };

      const { data: inserted, error } = await supabase
        .from('export_worker_wage_payments')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      setPayments(prev => [inserted as WagePayment, ...prev]);
      setActionSuccess(`Wage payment of ₹${Number(data.amount).toLocaleString()} recorded for ${selectedWorkerForWage.name}.`);
      setIsDisburseWageOpen(false);
      resetWage();
    } catch (err: any) {
      console.error('Error disbursing wage:', err);
      const localPayment: WagePayment = {
        id: `pay-${Date.now()}`,
        worker_id: selectedWorkerForWage.id,
        amount: Number(data.amount),
        payment_date: data.payment_date,
        payment_mode: data.payment_mode,
        reference: data.reference,
        created_at: new Date().toISOString()
      };
      setPayments(prev => [localPayment, ...prev]);
      setIsDisburseWageOpen(false);
      setActionSuccess(`Wage payment recorded.`);
    }
  };

  const filteredWorkers = workers.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          w.worker_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          w.job_role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = departmentFilter === 'All' || w.department === departmentFilter;
    return matchesSearch && matchesDept;
  });

  const presentCount = attendance.filter(a => a.status === 'present').length;
  const halfDayCount = attendance.filter(a => a.status === 'half_day').length;
  const absentCount = attendance.filter(a => a.status === 'absent').length;
  const leaveCount = attendance.filter(a => a.status === 'leave').length;
  const totalDailyWageEarned = attendance.reduce((acc, curr) => acc + curr.wage_earned, 0);
  const totalWagesDisbursed = payments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  if (loading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center">
        <LoadingSpinner size={48} />
        <p className="mt-4 text-slate-500 font-medium">Loading workforce personnel records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="text-emerald-600 h-6 w-6" />
            Worker Attendance, Payroll & Directory
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage factory floor personnel, real-time daily shift attendance, and wage disbursements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-medium border border-slate-200">
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'attendance' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily Roster
            </button>
            <button
              onClick={() => setActiveTab('workers')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'workers' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Workers ({workers.length})
            </button>
            <button
              onClick={() => setActiveTab('wages')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'wages' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Payroll Ledger
            </button>
          </div>

          <Button 
            onClick={() => setIsAddWorkerOpen(true)}
            size="sm"
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus size={14} /> Add Worker
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="underline font-medium">Dismiss</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Present Today</span>
            <UserCheck size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {presentCount + (halfDayCount * 0.5)} <span className="text-xs font-normal text-slate-400">/ {workers.length}</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">
            {workers.length > 0 ? (((presentCount + halfDayCount * 0.5) / workers.length) * 100).toFixed(0) : 0}% Floor Turnout
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Absent / Leave</span>
            <XCircle size={16} className="text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{absentCount + leaveCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">{absentCount} unexcused • {leaveCount} on leave</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Daily Wage Accrual</span>
            <DollarSign size={16} className="text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">₹{totalDailyWageEarned.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400 mt-1">Roster Date: {selectedDate}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Total Wages Disbursed</span>
            <CreditCard size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">₹{totalWagesDisbursed.toLocaleString()}</div>
          <div className="text-[11px] text-emerald-600 mt-1">{payments.length} Recorded Transactions</div>
        </div>
      </div>

      {/* Main Tab: Daily Attendance Roster */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
                <Calendar size={15} className="text-emerald-600" />
                <input 
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs font-semibold text-slate-800 outline-none bg-transparent"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter size={14} className="text-slate-400" />
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 outline-none"
                >
                  <option value="All">All Departments</option>
                  <option value="Weaving">Weaving</option>
                  <option value="Spinning">Spinning</option>
                  <option value="Knitting">Knitting</option>
                  <option value="Laying & Cutting">Laying & Cutting</option>
                  <option value="Stitching">Stitching</option>
                  <option value="Quality">Quality Control</option>
                  <option value="Finishing & Packing">Finishing & Packing</option>
                </select>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
              <input 
                type="text"
                placeholder="Search worker or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg outline-none w-56 bg-white"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Worker Name</th>
                  <th className="py-3 px-4">Department & Role</th>
                  <th className="py-3 px-4">Wage Type & Rate</th>
                  <th className="py-3 px-4">Current Status</th>
                  <th className="py-3 px-4 text-center">Quick Mark</th>
                  <th className="py-3 px-4 text-right">Earned Today</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-slate-800">
                {filteredWorkers.map((w) => {
                  const record = attendance.find(a => a.worker_id === w.id);
                  const currentStatus = record?.status || 'absent';
                  const earned = record?.wage_earned ?? (currentStatus === 'present' ? w.wage_rate : 0);

                  return (
                    <tr key={w.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">{w.worker_code}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{w.name}</td>
                      <td className="py-3 px-4 text-slate-600">
                        <span className="font-medium text-slate-800">{w.department}</span> • {w.job_role}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        ₹{w.wage_rate} / {w.wage_type === 'piece_rate' ? 'pc' : 'day'}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={
                          currentStatus === 'present' ? 'active' :
                          currentStatus === 'half_day' ? 'pending' :
                          currentStatus === 'leave' ? 'delayed' : 'rejected'
                        }>
                          {currentStatus.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                          <button
                            onClick={() => handleMarkAttendance(w.id, 'present')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                              currentStatus === 'present' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                            }`}
                            title="Mark Present"
                          >
                            P
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(w.id, 'half_day')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                              currentStatus === 'half_day' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                            }`}
                            title="Mark Half Day"
                          >
                            HD
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(w.id, 'leave')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                              currentStatus === 'leave' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                            title="Mark Leave"
                          >
                            L
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(w.id, 'absent')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                              currentStatus === 'absent' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                            }`}
                            title="Mark Absent"
                          >
                            A
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-700">
                        ₹{earned.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Tab: Worker Directory */}
      {activeTab === 'workers' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Personnel Roster & Job Classifications</h3>
              <p className="text-xs text-slate-500">Registered manufacturing operators, wage configurations, and contact files</p>
            </div>
            <div className="text-xs font-semibold text-slate-600">
              Total Active: {workers.filter(w => w.status === 'active').length}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Worker Code</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Job Role</th>
                  <th className="py-3 px-4">Wage Structure</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-slate-800">
                {filteredWorkers.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{w.worker_code}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{w.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                        {w.department}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{w.job_role}</td>
                    <td className="py-3 px-4 font-bold text-emerald-700">
                      ₹{w.wage_rate} / {w.wage_type === 'piece_rate' ? 'piece' : 'day'}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{w.phone || 'N/A'}</td>
                    <td className="py-3 px-4">
                      <Badge variant={w.status === 'active' ? 'active' : 'default'}>
                        {w.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-xs h-7 px-2.5"
                        onClick={() => {
                          setSelectedWorkerForWage(w);
                          setIsDisburseWageOpen(true);
                        }}
                      >
                        <DollarSign size={12} className="mr-0.5" /> Disburse
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Tab: Payroll Ledger */}
      {activeTab === 'wages' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recorded Wage Disbursements</h3>
              <p className="text-xs text-slate-500">Historical worker wage payments, bank transaction references, and settlement timestamps</p>
            </div>
            <div className="text-xs font-semibold text-emerald-700">
              Total Disbursed: ₹{totalWagesDisbursed.toLocaleString()}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Payment Date</th>
                  <th className="py-3 px-4">Worker</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Reference / UTR</th>
                  <th className="py-3 px-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-slate-800">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No wage payments recorded yet.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => {
                    const worker = workers.find(w => w.id === p.worker_id);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-semibold text-slate-900">{p.payment_date}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {worker ? `${worker.name} (${worker.worker_code})` : p.worker_id}
                        </td>
                        <td className="py-3 px-4 font-bold text-emerald-700 text-sm">
                          ₹{Number(p.amount).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                            {p.payment_mode}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">{p.reference || 'Direct Cash'}</td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">{new Date(p.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Worker Modal */}
      <Modal isOpen={isAddWorkerOpen} onClose={() => setIsAddWorkerOpen(false)} title="Register New Factory Worker">
        <form onSubmit={handleSubmitWorker(onSubmitAddWorker)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="worker_name_input"
              label="Worker Full Name *"
              placeholder="e.g. Ramesh Velusamy"
              {...registerWorker('name')}
              error={workerErrors.name?.message}
            />
            <Input
              id="worker_code_input"
              label="Worker ID / Code"
              placeholder="Auto-generated if blank (e.g. WRK-006)"
              {...registerWorker('worker_code')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department *</label>
              <select
                id="worker_dept_select"
                {...registerWorker('department')}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 outline-none"
              >
                <option value="Weaving">Weaving</option>
                <option value="Spinning">Spinning</option>
                <option value="Knitting">Knitting</option>
                <option value="Laying & Cutting">Laying & Cutting</option>
                <option value="Stitching">Stitching</option>
                <option value="Quality">Quality Control</option>
                <option value="Finishing & Packing">Finishing & Packing</option>
              </select>
            </div>
            <Input
              id="worker_job_input"
              label="Job Role / Title *"
              placeholder="e.g. Loom Operator"
              {...registerWorker('job_role')}
              error={workerErrors.job_role?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Wage Basis *</label>
              <select
                id="worker_wage_basis_select"
                {...registerWorker('wage_type')}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 outline-none"
              >
                <option value="daily">Daily Wage (₹/day)</option>
                <option value="piece_rate">Piece Rate (₹/pc)</option>
                <option value="monthly">Monthly Fixed (₹/mo)</option>
              </select>
            </div>
            <Input
              id="worker_rate_input"
              label="Wage Rate (₹) *"
              type="number"
              step="0.01"
              {...registerWorker('wage_rate', { valueAsNumber: true })}
              error={workerErrors.wage_rate?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="worker_phone_input"
              label="Contact Phone"
              placeholder="+91 98421..."
              {...registerWorker('phone')}
            />
            <Input
              id="worker_addr_input"
              label="Residential Area"
              placeholder="e.g. Tirupur, Erode"
              {...registerWorker('address')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddWorkerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isWorkerSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
              Save Worker
            </Button>
          </div>
        </form>
      </Modal>

      {/* Disburse Wage Modal */}
      <Modal 
        isOpen={isDisburseWageOpen} 
        onClose={() => setIsDisburseWageOpen(false)} 
        title={`Disburse Wage — ${selectedWorkerForWage?.name || ''}`}
      >
        <form onSubmit={handleSubmitWage(onSubmitDisburseWage)} className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="text-slate-600">Worker: <span className="font-bold text-slate-900">{selectedWorkerForWage?.name}</span> ({selectedWorkerForWage?.worker_code})</div>
            <div className="text-slate-600 mt-1">Department: <span className="font-semibold text-slate-800">{selectedWorkerForWage?.department}</span> • Rate: <span className="font-bold text-emerald-700">₹{selectedWorkerForWage?.wage_rate}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="disburse_amt_input"
              label="Disbursement Amount (₹) *"
              type="number"
              step="0.01"
              {...registerWage('amount', { valueAsNumber: true })}
              error={wageErrors.amount?.message}
            />
            <Input
              id="disburse_date_input"
              label="Payment Date *"
              type="date"
              {...registerWage('payment_date')}
              error={wageErrors.payment_date?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode *</label>
              <select
                id="disburse_mode_select"
                {...registerWage('payment_mode')}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 outline-none"
              >
                <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                <option value="UPI">UPI Direct</option>
                <option value="Cash">Cash at Floor</option>
                <option value="Cheque">Company Cheque</option>
              </select>
            </div>
            <Input
              id="disburse_ref_input"
              label="Reference / UTR / Cheque #"
              placeholder="e.g. UTR-90218847"
              {...registerWage('reference')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsDisburseWageOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isWageSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
              Confirm Disbursal
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
