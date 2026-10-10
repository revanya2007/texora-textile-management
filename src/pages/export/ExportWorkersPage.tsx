import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Plus, 
  Search
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';

interface Worker {
  id: string;
  name: string;
  role: string;
  department: string;
  daily_wage: number;
  phone: string;
  status: 'active' | 'inactive';
}

interface AttendanceRecord {
  id: string;
  worker_id: string;
  worker_name: string;
  date: string;
  status: 'present' | 'absent' | 'leave' | 'half_day';
  shift: string;
  overtime_hours: number;
  wage_earned: number;
  payment_status: 'paid' | 'pending';
}

const initialWorkers: Worker[] = [
  { id: 'w-1', name: 'Murugan Palaniswamy', role: 'Loom Master', department: 'Weaving', daily_wage: 850, phone: '+91 98421 11001', status: 'active' },
  { id: 'w-2', name: 'Selvam Ramanathan', role: 'Airjet Operator', department: 'Weaving', daily_wage: 700, phone: '+91 98421 11002', status: 'active' },
  { id: 'w-3', name: 'Karthik Subramanian', role: 'Rapier Technician', department: 'Weaving', daily_wage: 750, phone: '+91 98421 11003', status: 'active' },
  { id: 'w-4', name: 'Manoj Kumar', role: 'Circular Knitter', department: 'Knitting', daily_wage: 720, phone: '+91 98421 11004', status: 'active' },
  { id: 'w-5', name: 'Suresh Velu', role: 'Winder Operator', department: 'Yarn Prep', daily_wage: 650, phone: '+91 98421 11005', status: 'active' },
  { id: 'w-6', name: 'Anand Krishnamurthy', role: 'Senior QC Inspector', department: 'Quality', daily_wage: 900, phone: '+91 98421 11006', status: 'active' }
];

export default function ExportWorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>(initialWorkers);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'attendance' | 'workers' | 'wages'>('attendance');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddWorkerOpen, setIsAddWorkerOpen] = useState(false);

  // New Worker Form
  const [newWorker, setNewWorker] = useState({
    name: '',
    role: '',
    department: 'Weaving',
    daily_wage: 700,
    phone: ''
  });

  useEffect(() => {
    // Generate daily attendance roster based on workers
    const initialAttendance: AttendanceRecord[] = workers.map((w, idx) => ({
      id: `att-${w.id}-${selectedDate}`,
      worker_id: w.id,
      worker_name: w.name,
      date: selectedDate,
      status: idx === 3 ? 'leave' : idx === 4 ? 'absent' : 'present',
      shift: 'Morning (08:00 - 16:00)',
      overtime_hours: idx === 0 ? 2 : 0,
      wage_earned: idx === 3 || idx === 4 ? 0 : w.daily_wage + (idx === 0 ? (w.daily_wage / 8) * 2 : 0),
      payment_status: idx === 1 ? 'paid' : 'pending'
    }));
    setAttendance(initialAttendance);
  }, [selectedDate, workers]);

  const updateAttendanceStatus = (workerId: string, status: 'present' | 'absent' | 'leave' | 'half_day') => {
    setAttendance(prev => prev.map(rec => {
      if (rec.worker_id !== workerId) return rec;
      const worker = workers.find(w => w.id === workerId);
      const baseWage = worker?.daily_wage || 700;
      let earned = 0;
      if (status === 'present') earned = baseWage + (rec.overtime_hours * (baseWage / 8));
      else if (status === 'half_day') earned = (baseWage / 2);
      
      return {
        ...rec,
        status,
        wage_earned: earned
      };
    }));
  };

  const handleAddWorker = (e: React.FormEvent) => {
    e.preventDefault();
    const created: Worker = {
      id: `w-${Date.now()}`,
      name: newWorker.name,
      role: newWorker.role,
      department: newWorker.department,
      daily_wage: Number(newWorker.daily_wage),
      phone: newWorker.phone,
      status: 'active'
    };
    setWorkers(prev => [...prev, created]);
    setIsAddWorkerOpen(false);
    setNewWorker({ name: '', role: '', department: 'Weaving', daily_wage: 700, phone: '' });
  };

  const presentCount = attendance.filter(a => a.status === 'present').length;
  const absentCount = attendance.filter(a => a.status === 'absent').length;
  const leaveCount = attendance.filter(a => a.status === 'leave').length;
  const totalDailyWage = attendance.reduce((acc, curr) => acc + curr.wage_earned, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="text-emerald-600 h-6 w-6" />
            Worker Attendance & Wage Management
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Track daily factory floor attendance, shifts, overtime hours, and payroll wage calculations.
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
              Daily Attendance
            </button>
            <button
              onClick={() => setActiveTab('workers')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'workers' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Worker Directory ({workers.length})
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

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Present Today</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{presentCount} <span className="text-xs font-normal text-slate-400">/ {workers.length}</span></div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">{(presentCount / workers.length * 100).toFixed(0)}% Floor Attendance</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Absent</span>
            <XCircle size={16} className="text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{absentCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Unexcused Absence</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">On Leave</span>
            <AlertCircle size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{leaveCount}</div>
          <div className="text-[11px] text-amber-600 mt-1">Approved Leave</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Daily Wage Accrual</span>
            <DollarSign size={16} className="text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">₹{totalDailyWage.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400 mt-1">Date: {selectedDate}</div>
        </div>
      </div>

      {/* Main Tab Views */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-500" />
              <input 
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-xs text-slate-500">Roster for shift operations</span>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
              <input 
                type="text"
                placeholder="Filter worker..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg outline-none w-48 bg-white"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Worker Name</th>
                  <th className="py-3 px-4">Department & Role</th>
                  <th className="py-3 px-4">Shift</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Quick Mark</th>
                  <th className="py-3 px-4 text-right">Daily Wage</th>
                  <th className="py-3 px-4 text-right">Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-slate-800">
                {attendance
                  .filter(a => a.worker_name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((rec) => {
                    const worker = workers.find(w => w.id === rec.worker_id);
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {rec.worker_name}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="font-medium text-slate-800">{worker?.department}</span> • {worker?.role}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{rec.shift}</td>
                        <td className="py-3 px-4">
                          <Badge variant={
                            rec.status === 'present' ? 'active' :
                            rec.status === 'absent' ? 'rejected' :
                            rec.status === 'leave' ? 'pending' : 'default'
                          }>
                            {rec.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateAttendanceStatus(rec.worker_id, 'present')}
                              className={`p-1 rounded text-xs transition-colors ${
                                rec.status === 'present' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                              }`}
                              title="Mark Present"
                            >
                              P
                            </button>
                            <button
                              onClick={() => updateAttendanceStatus(rec.worker_id, 'absent')}
                              className={`p-1 rounded text-xs transition-colors ${
                                rec.status === 'absent' ? 'bg-rose-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                              }`}
                              title="Mark Absent"
                            >
                              A
                            </button>
                            <button
                              onClick={() => updateAttendanceStatus(rec.worker_id, 'leave')}
                              className={`p-1 rounded text-xs transition-colors ${
                                rec.status === 'leave' ? 'bg-amber-500 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                              }`}
                              title="Mark Leave"
                            >
                              L
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">₹{worker?.daily_wage}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">₹{rec.wage_earned.toLocaleString()}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'workers' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Registered Plant Workforce</h3>
            <span className="text-xs text-slate-500">Total active operators: {workers.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Operator Name</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Daily Wage Rate</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-slate-800">
                {workers.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900">{w.name}</td>
                    <td className="py-3 px-4 text-slate-600">{w.role}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                        {w.department}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-700">₹{w.daily_wage} / day</td>
                    <td className="py-3 px-4 text-slate-500">{w.phone}</td>
                    <td className="py-3 px-4">
                      <Badge variant="active">Active</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'wages' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Wages & Payroll Summary</h3>
              <p className="text-xs text-slate-500">Calculated earnings and disbursement status for current pay cycle</p>
            </div>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
              <DollarSign size={13} className="mr-1" /> Export Payroll Sheet
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl">
              <div className="text-xs font-semibold text-emerald-800">Total Accrued (Monthly)</div>
              <div className="text-2xl font-bold text-emerald-950 mt-1">₹1,18,400</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">Across all departments</div>
            </div>
            <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl">
              <div className="text-xs font-semibold text-blue-800">Disbursed Wages</div>
              <div className="text-2xl font-bold text-blue-950 mt-1">₹85,000</div>
              <div className="text-[11px] text-blue-700 mt-0.5">Direct bank transfers</div>
            </div>
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl">
              <div className="text-xs font-semibold text-amber-800">Pending Payable</div>
              <div className="text-2xl font-bold text-amber-950 mt-1">₹33,400</div>
              <div className="text-[11px] text-amber-700 mt-0.5">Scheduled for weekend cycle</div>
            </div>
          </div>
        </div>
      )}

      {/* Add Worker Modal */}
      <Modal isOpen={isAddWorkerOpen} onClose={() => setIsAddWorkerOpen(false)} title="Register New Worker">
        <form onSubmit={handleAddWorker} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="e.g. Ramesh Velusamy"
            value={newWorker.name}
            onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Role / Designation"
              placeholder="e.g. Loom Operator"
              value={newWorker.role}
              onChange={(e) => setNewWorker({ ...newWorker, role: e.target.value })}
              required
            />
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
              <select
                value={newWorker.department}
                onChange={(e) => setNewWorker({ ...newWorker, department: e.target.value })}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 outline-none"
              >
                <option value="Weaving">Weaving</option>
                <option value="Knitting">Knitting</option>
                <option value="Yarn Prep">Yarn Prep</option>
                <option value="Quality">Quality Control</option>
                <option value="Finishing">Finishing & Packing</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Daily Wage (₹)"
              type="number"
              value={newWorker.daily_wage}
              onChange={(e) => setNewWorker({ ...newWorker, daily_wage: Number(e.target.value) })}
              required
            />
            <Input
              label="Contact Phone"
              placeholder="+91 98421..."
              value={newWorker.phone}
              onChange={(e) => setNewWorker({ ...newWorker, phone: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddWorkerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              Save Worker
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
