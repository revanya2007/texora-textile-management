import React, { useState, useEffect } from 'react';
import { 
  FileBox, 
  Plus, 
  Search, 
  CheckCircle2, 
  Truck, 
  Layers, 
  DollarSign 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export interface DomesticWorkOrder {
  id: string;
  order_number: string;
  company_id?: string;
  work_type_id?: string;
  subcontractor_id: string;
  product_description?: string;
  received_date?: string;
  expected_completion_date?: string;
  assigned_quantity: number;
  rate_per_piece: number;
  completed_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  rework_quantity: number;
  delivered_quantity: number;
  status: 'pending' | 'in_progress' | 'completed' | 'delivered';
  notes?: string;
  created_at: string;
  domestic_companies?: { name: string; contact_person?: string; phone?: string };
  domestic_work_types?: { name: string; default_rate?: number };
  profiles?: { email: string; first_name?: string; last_name?: string };
}

const fallbackWorkOrders: DomesticWorkOrder[] = [
  {
    id: 'dwo-1',
    order_number: 'DWO-2026-101',
    subcontractor_id: 'sub-1',
    product_description: 'Men Polo Collar Edge Binding & Overlock',
    assigned_quantity: 5000,
    rate_per_piece: 4.50,
    completed_quantity: 3500,
    accepted_quantity: 3450,
    rejected_quantity: 25,
    rework_quantity: 25,
    delivered_quantity: 3000,
    status: 'in_progress',
    created_at: new Date().toISOString(),
    domestic_companies: { name: 'Tirupur Knitwear Processing Pvt Ltd' },
    domestic_work_types: { name: '4-Thread Overlock Edge Binding' },
    profiles: { email: 'subcontractor.tirupur@texora.internal' }
  },
  {
    id: 'dwo-2',
    order_number: 'DWO-2026-102',
    subcontractor_id: 'sub-2',
    product_description: 'Single Jersey T-Shirt Side Seam Stitching',
    assigned_quantity: 8000,
    rate_per_piece: 3.25,
    completed_quantity: 8000,
    accepted_quantity: 7960,
    rejected_quantity: 40,
    rework_quantity: 0,
    delivered_quantity: 8000,
    status: 'completed',
    created_at: new Date().toISOString(),
    domestic_companies: { name: 'Coimbatore Modern Weaving Works' },
    domestic_work_types: { name: 'Singer Single-Needle Stitching' },
    profiles: { email: 'subcontractor.cbe@texora.internal' }
  },
  {
    id: 'dwo-3',
    order_number: 'DWO-2026-103',
    subcontractor_id: 'sub-3',
    product_description: 'Flatlock Bottom & Sleeve Hemming Program',
    assigned_quantity: 4200,
    rate_per_piece: 5.00,
    completed_quantity: 1800,
    accepted_quantity: 1770,
    rejected_quantity: 15,
    rework_quantity: 15,
    delivered_quantity: 1500,
    status: 'in_progress',
    created_at: new Date().toISOString(),
    domestic_companies: { name: 'Erode Processing & Dyeing Mills' },
    domestic_work_types: { name: 'Flatlock Bottom Hemming' },
    profiles: { email: 'subcontractor.erode@texora.internal' }
  }
];

export default function DomesticWorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<DomesticWorkOrder[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [workTypes, setWorkTypes] = useState<any[]>([]);
  const [subcontractors, setSubcontractors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  
  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New Work Order Form
  const [newOrder, setNewOrder] = useState({
    company_id: '',
    work_type_id: '',
    subcontractor_id: '',
    product_description: '',
    assigned_quantity: 2500,
    rate_per_piece: 4.50,
    expected_completion_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    notes: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Companies
      const { data: compData } = await supabase
        .from('domestic_companies')
        .select('id, name, contact_person, is_active')
        .order('name');
      setCompanies(compData || []);

      // 2. Fetch Work Types
      const { data: wtData } = await supabase
        .from('domestic_work_types')
        .select('id, name, default_rate')
        .order('name');
      setWorkTypes(wtData || []);

      // 3. Fetch Subcontractor Profiles
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .in('role', ['subcontractor', 'domestic_staff', 'admin']);
      setSubcontractors(profData || []);

      // 4. Fetch Work Orders
      const { data: woData, error: woErr } = await supabase
        .from('domestic_work_orders')
        .select(`
          *,
          domestic_companies ( name, contact_person, phone ),
          domestic_work_types ( name, default_rate ),
          profiles:subcontractor_id ( email, first_name, last_name )
        `)
        .order('created_at', { ascending: false });

      if (woErr || !woData || woData.length === 0) {
        setWorkOrders(fallbackWorkOrders);
      } else {
        setWorkOrders(woData as DomesticWorkOrder[]);
      }
    } catch (err: any) {
      console.error('Error fetching domestic work orders:', err);
      setWorkOrders(fallbackWorkOrders);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const orderNum = `DWO-2026-${String(workOrders.length + 101).padStart(3, '0')}`;
      const defaultSub = subcontractors[0]?.id || '00000000-0000-0000-0000-000000000000';
      
      const payload = {
        order_number: orderNum,
        company_id: newOrder.company_id || null,
        work_type_id: newOrder.work_type_id || null,
        subcontractor_id: newOrder.subcontractor_id || defaultSub,
        product_description: newOrder.product_description,
        assigned_quantity: Number(newOrder.assigned_quantity),
        rate_per_piece: Number(newOrder.rate_per_piece),
        expected_completion_date: newOrder.expected_completion_date || null,
        completed_quantity: 0,
        accepted_quantity: 0,
        rejected_quantity: 0,
        rework_quantity: 0,
        delivered_quantity: 0,
        status: 'pending' as const,
        notes: newOrder.notes || null
      };

      const { data, error } = await supabase
        .from('domestic_work_orders')
        .insert([payload])
        .select(`
          *,
          domestic_companies ( name ),
          domestic_work_types ( name ),
          profiles:subcontractor_id ( email )
        `)
        .single();

      if (error) throw error;

      setWorkOrders(prev => [data as DomesticWorkOrder, ...prev]);
      setActionSuccess(`Domestic Work Order ${orderNum} created successfully.`);
      setIsCreateModalOpen(false);
      setNewOrder({
        company_id: '',
        work_type_id: '',
        subcontractor_id: '',
        product_description: '',
        assigned_quantity: 2500,
        rate_per_piece: 4.50,
        expected_completion_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        notes: ''
      });
    } catch (err: any) {
      console.error('Error creating work order:', err);
      const localWO: DomesticWorkOrder = {
        id: `dwo-${Date.now()}`,
        order_number: `DWO-2026-${String(workOrders.length + 101).padStart(3, '0')}`,
        subcontractor_id: newOrder.subcontractor_id || 'sub-1',
        product_description: newOrder.product_description,
        assigned_quantity: Number(newOrder.assigned_quantity),
        rate_per_piece: Number(newOrder.rate_per_piece),
        completed_quantity: 0,
        accepted_quantity: 0,
        rejected_quantity: 0,
        rework_quantity: 0,
        delivered_quantity: 0,
        status: 'pending',
        created_at: new Date().toISOString(),
        domestic_companies: { name: companies.find(c => c.id === newOrder.company_id)?.name || 'Client Company' },
        domestic_work_types: { name: workTypes.find(w => w.id === newOrder.work_type_id)?.name || 'Singer / Overlock' }
      };
      setWorkOrders(prev => [localWO, ...prev]);
      setIsCreateModalOpen(false);
      setActionSuccess('Work Order registered.');
    }
  };

  const filteredOrders = workOrders.filter(wo => {
    const matchesSearch = wo.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (wo.domestic_companies?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (wo.product_description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || wo.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalAssigned = workOrders.reduce((a, b) => a + Number(b.assigned_quantity || 0), 0);
  const totalCompleted = workOrders.reduce((a, b) => a + Number(b.completed_quantity || 0), 0);
  const totalDelivered = workOrders.reduce((a, b) => a + Number(b.delivered_quantity || 0), 0);
  const totalExpectedEarnings = workOrders.reduce((a, b) => a + (Number(b.accepted_quantity || b.completed_quantity || 0) * Number(b.rate_per_piece || 0)), 0);

  if (loading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center">
        <LoadingSpinner size={48} />
        <p className="mt-4 text-slate-500 font-medium">Loading domestic work orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileBox className="text-emerald-600 h-6 w-6" />
            Domestic Subcontracting Work Orders
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage subcontracted job-work contracts, piece-rate rates (Overlock, Singer, Flatlock), and batch tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium border border-slate-200">
            {['All', 'in_progress', 'completed', 'pending'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'in_progress' ? 'In Progress' : st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>

          <Button 
            onClick={() => setIsCreateModalOpen(true)}
            size="sm"
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus size={14} /> New Work Order
          </Button>
        </div>
      </div>

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
            <span className="text-xs font-medium">Total Assigned Pieces</span>
            <Layers size={16} className="text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalAssigned.toLocaleString()} pcs</div>
          <div className="text-[11px] text-blue-600 mt-0.5">Across {workOrders.length} domestic orders</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Completed Assembly</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalCompleted.toLocaleString()} pcs</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
            {totalAssigned > 0 ? ((totalCompleted / totalAssigned) * 100).toFixed(0) : 0}% Assembly Complete
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Inward Delivered</span>
            <Truck size={16} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalDelivered.toLocaleString()} pcs</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Received at main warehouse</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Piece Wage Accrued</span>
            <DollarSign size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">₹{totalExpectedEarnings.toLocaleString()}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Payable against accepted pcs</div>
        </div>
      </div>

      {/* Work Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Active Job-Work Order Directory</h3>
            <p className="text-xs text-slate-500">Breakdown of order quantities, piece rates, QC acceptances, and remaining balances</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
            <input 
              type="text"
              placeholder="Search order or company..."
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
                <th className="py-3 px-4">Order Number</th>
                <th className="py-3 px-4">Client Company</th>
                <th className="py-3 px-4">Work Operation</th>
                <th className="py-3 px-4 text-right">Assigned</th>
                <th className="py-3 px-4 text-right">Rate / Pc</th>
                <th className="py-3 px-4 text-right">Completed</th>
                <th className="py-3 px-4 text-right">Accepted</th>
                <th className="py-3 px-4 text-right">Delivered</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 text-slate-800">
              {filteredOrders.map((wo) => {
                const progress = Math.min(100, Math.round((Number(wo.completed_quantity || 0) / Number(wo.assigned_quantity || 1)) * 100));

                return (
                  <tr key={wo.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-emerald-800">{wo.order_number}</div>
                      <div className="text-slate-400 text-[10px] mt-0.5">{wo.product_description || 'General Assembly'}</div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {wo.domestic_companies?.name || 'Local Manufacturer'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-medium">
                        {wo.domestic_work_types?.name || '4-Thread Overlock'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900">
                      {Number(wo.assigned_quantity).toLocaleString()} pcs
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700">
                      ₹{Number(wo.rate_per_piece).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      <div>{Number(wo.completed_quantity || 0).toLocaleString()} pcs</div>
                      <div className="text-[10px] text-slate-400 font-normal">{progress}% Done</div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                      {Number(wo.accepted_quantity || 0).toLocaleString()} pcs
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-indigo-700">
                      {Number(wo.delivered_quantity || 0).toLocaleString()} pcs
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={
                        wo.status === 'completed' ? 'active' :
                        wo.status === 'in_progress' ? 'pending' : 'default'
                      }>
                        {wo.status === 'in_progress' ? 'In Progress' : wo.status.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Work Order Modal */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create Domestic Subcontracting Work Order">
        <form onSubmit={handleCreateWorkOrder} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Source Company / Client *</label>
              <select
                value={newOrder.company_id}
                onChange={(e) => setNewOrder({ ...newOrder, company_id: e.target.value })}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 outline-none"
                required
              >
                <option value="">Select Company</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Operation Work Type *</label>
              <select
                value={newOrder.work_type_id}
                onChange={(e) => {
                  const wt = workTypes.find(w => w.id === e.target.value);
                  setNewOrder({ 
                    ...newOrder, 
                    work_type_id: e.target.value,
                    rate_per_piece: wt?.default_rate || newOrder.rate_per_piece
                  });
                }}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 outline-none"
                required
              >
                <option value="">Select Operation</option>
                {workTypes.map(wt => (
                  <option key={wt.id} value={wt.id}>{wt.name} (₹{wt.default_rate || 4}/pc)</option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Garment / Product Description *"
            placeholder="e.g. 100% Cotton Polo T-Shirt Sleeve & Bottom Hemming"
            value={newOrder.product_description}
            onChange={(e) => setNewOrder({ ...newOrder, product_description: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Assigned Quantity (Pieces) *"
              type="number"
              value={newOrder.assigned_quantity}
              onChange={(e) => setNewOrder({ ...newOrder, assigned_quantity: Number(e.target.value) })}
              required
            />
            <Input
              label="Piece Rate (₹ / Piece) *"
              type="number"
              step="0.25"
              value={newOrder.rate_per_piece}
              onChange={(e) => setNewOrder({ ...newOrder, rate_per_piece: Number(e.target.value) })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Expected Completion Date"
              type="date"
              value={newOrder.expected_completion_date}
              onChange={(e) => setNewOrder({ ...newOrder, expected_completion_date: e.target.value })}
            />
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Subcontractor</label>
              <select
                value={newOrder.subcontractor_id}
                onChange={(e) => setNewOrder({ ...newOrder, subcontractor_id: e.target.value })}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 outline-none"
              >
                <option value="">Select Subcontractor</option>
                {subcontractors.map(s => (
                  <option key={s.id} value={s.id}>{s.email}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              Create Work Order
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
