import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Plus, Search, Filter, Factory, Cpu, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface ProductionRecord {
  id: string;
  order_id: string;
  machine_id: string | null;
  production_date: string;
  shift: string;
  planned_quantity: number;
  actual_quantity: number;
  fabric_details?: string;
  unit: string;
  status: string;
  notes?: string;
  created_at: string;
  export_orders?: { order_number: string; buyer_name?: string };
  export_machines?: { name: string; machine_type: string; status: string };
}

interface Machine {
  id: string;
  name: string;
  machine_type: string;
  status: string;
  location?: string;
  specifications?: string;
}

interface ExportOrder {
  id: string;
  order_number: string;
  buyer_name: string;
}

const productionSchema = z.object({
  order_id: z.string().min(1, 'Export order is required'),
  machine_id: z.string().optional(),
  production_date: z.string().min(1, 'Production date is required'),
  shift: z.string().min(1, 'Shift is required'),
  planned_quantity: z.number().positive('Planned quantity must be greater than 0'),
  actual_quantity: z.number().min(0, 'Actual quantity must be 0 or more'),
  unit: z.string(),
  fabric_details: z.string().optional(),
  status: z.string(),
  notes: z.string().optional(),
});

type ProductionFormValues = z.infer<typeof productionSchema>;

const machineSchema = z.object({
  name: z.string().min(1, 'Machine name is required'),
  machine_type: z.string().min(1, 'Machine type is required'),
  status: z.string(),
  location: z.string().optional(),
  specifications: z.string().optional(),
});

type MachineFormValues = z.infer<typeof machineSchema>;

export default function ExportProductionPage() {
  const [productionList, setProductionList] = useState<ProductionRecord[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [orders, setOrders] = useState<ExportOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'production' | 'machines'>('production');

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShift, setSelectedShift] = useState('ALL');
  const [selectedMachineFilter, setSelectedMachineFilter] = useState('ALL');

  // Modals
  const [isProductionModalOpen, setIsProductionModalOpen] = useState(false);
  const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProductionRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<ProductionFormValues>({
    resolver: zodResolver(productionSchema),
    defaultValues: {
      production_date: new Date().toISOString().split('T')[0],
      shift: 'Day',
      unit: 'meters',
      status: 'completed',
    },
  });

  const { register: registerMachine, handleSubmit: handleSubmitMachine, reset: resetMachine, formState: { errors: machineErrors, isSubmitting: isMachineSubmitting } } = useForm<MachineFormValues>({
    resolver: zodResolver(machineSchema),
    defaultValues: {
      status: 'active',
    },
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch production records with joined order and machine
      const { data: prodData, error: prodErr } = await supabase
        .from('export_production')
        .select(`
          *,
          export_orders ( order_number, buyer_name ),
          export_machines ( name, machine_type, status )
        `)
        .order('production_date', { ascending: false });

      if (prodErr) throw prodErr;
      setProductionList((prodData as any) || []);

      // 2. Fetch machines
      const { data: machineData, error: machineErr } = await supabase
        .from('export_machines')
        .select('*')
        .order('name', { ascending: true });

      if (machineErr) throw machineErr;
      setMachines(machineData || []);

      // 3. Fetch export orders
      const { data: orderData, error: orderErr } = await supabase
        .from('export_orders')
        .select('id, order_number, buyer_name')
        .order('created_at', { ascending: false });

      if (orderErr) throw orderErr;
      setOrders(orderData || []);
    } catch (err: any) {
      console.error('Error fetching production data:', err);
      setErrorMessage(err.message || 'Failed to load production records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateProductionModal = () => {
    setEditingRecord(null);
    reset({
      production_date: new Date().toISOString().split('T')[0],
      shift: 'Day',
      unit: 'meters',
      status: 'completed',
      planned_quantity: 0,
      actual_quantity: 0,
    });
    setErrorMessage(null);
    setIsProductionModalOpen(true);
  };

  const openEditProductionModal = (record: ProductionRecord) => {
    setEditingRecord(record);
    setValue('order_id', record.order_id);
    setValue('machine_id', record.machine_id || '');
    setValue('production_date', record.production_date);
    setValue('shift', record.shift || 'Day');
    setValue('planned_quantity', Number(record.planned_quantity));
    setValue('actual_quantity', Number(record.actual_quantity));
    setValue('unit', record.unit || 'meters');
    setValue('fabric_details', record.fabric_details || '');
    setValue('status', record.status || 'completed');
    setValue('notes', record.notes || '');
    setErrorMessage(null);
    setIsProductionModalOpen(true);
  };

  const onSaveProduction = async (data: ProductionFormValues) => {
    setErrorMessage(null);
    try {
      const payload = {
        order_id: data.order_id,
        machine_id: data.machine_id ? data.machine_id : null,
        production_date: data.production_date,
        shift: data.shift,
        planned_quantity: data.planned_quantity,
        actual_quantity: data.actual_quantity,
        unit: data.unit,
        fabric_details: data.fabric_details || null,
        status: data.status,
        notes: data.notes || null,
        updated_at: new Date().toISOString(),
      };

      if (editingRecord) {
        const { error } = await supabase
          .from('export_production')
          .update(payload)
          .eq('id', editingRecord.id);
        if (error) throw error;
        setSuccessMessage('Production run updated successfully.');
      } else {
        const { error } = await supabase
          .from('export_production')
          .insert([payload]);
        if (error) throw error;
        setSuccessMessage('Production run logged successfully.');
      }

      setIsProductionModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving production record.');
    }
  };

  const onSaveMachine = async (data: MachineFormValues) => {
    setErrorMessage(null);
    try {
      const { error } = await supabase
        .from('export_machines')
        .insert([{
          name: data.name,
          machine_type: data.machine_type,
          status: data.status,
          location: data.location || null,
          specifications: data.specifications || null,
        }]);

      if (error) throw error;
      setSuccessMessage('Machine added successfully.');
      setIsMachineModalOpen(false);
      resetMachine();
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving machine.');
    }
  };

  // Filtered production records
  const filteredProduction = productionList.filter(item => {
    const orderNum = item.export_orders?.order_number?.toLowerCase() || '';
    const buyerName = item.export_orders?.buyer_name?.toLowerCase() || '';
    const matchSearch = orderNum.includes(searchTerm.toLowerCase()) || 
      buyerName.includes(searchTerm.toLowerCase()) || 
      item.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchShift = selectedShift === 'ALL' || item.shift === selectedShift;
    const matchMachine = selectedMachineFilter === 'ALL' || item.machine_id === selectedMachineFilter;
    return matchSearch && matchShift && matchMachine;
  });

  // Calculate high-level KPIs
  const totalPlanned = productionList.reduce((acc, curr) => acc + Number(curr.planned_quantity || 0), 0);
  const totalActual = productionList.reduce((acc, curr) => acc + Number(curr.actual_quantity || 0), 0);
  const overallEfficiency = totalPlanned > 0 ? ((totalActual / totalPlanned) * 100).toFixed(1) : '100.0';
  const activeMachinesCount = machines.filter(m => m.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <Factory className="text-primary" /> Production & Machine Operations
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Track daily factory output, machine allocations, and planned vs. actual progress.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setIsMachineModalOpen(true)} className="flex items-center gap-2">
            <Cpu size={16} /> Add Machine
          </Button>
          <Button onClick={openCreateProductionModal} className="flex items-center gap-2">
            <Plus size={16} /> Log Production Run
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="p-4 bg-red-50 text-error border border-red-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-xs underline font-medium">Dismiss</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 text-success border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-xs underline font-medium">Dismiss</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Total Planned</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{totalPlanned.toLocaleString()} <span className="text-xs font-normal text-secondary-text">m</span></h3>
            </div>
            <div className="p-3 bg-soft-mint rounded-xl text-primary"><Factory size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Total Output</p>
              <h3 className="text-2xl font-bold text-primary mt-1">{totalActual.toLocaleString()} <span className="text-xs font-normal text-secondary-text">m</span></h3>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><TrendingUp size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Efficiency Rate</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{overallEfficiency}%</h3>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl text-amber-600"><TrendingUp size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Active Machines</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{activeMachinesCount} / {machines.length}</h3>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><Cpu size={22} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex border-b border-border gap-6">
        <button
          onClick={() => setActiveTab('production')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'production'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary-text hover:text-navy'
          }`}
        >
          <Factory size={16} /> Production Runs ({productionList.length})
        </button>
        <button
          onClick={() => setActiveTab('machines')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'machines'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary-text hover:text-navy'
          }`}
        >
          <Cpu size={16} /> Machinery Floor ({machines.length})
        </button>
      </div>

      {/* Tab 1: Production Records List */}
      {activeTab === 'production' && (
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text" size={16} />
                <input
                  type="text"
                  placeholder="Search by order or buyer..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 rounded-lg border border-border text-sm outline-none focus:border-primary transition-all bg-soft-mint/20"
                />
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <Filter size={16} className="text-secondary-text" />
                <select
                  value={selectedShift}
                  onChange={e => setSelectedShift(e.target.value)}
                  className="h-9 px-3 border border-border rounded-lg text-sm bg-white text-navy outline-none"
                >
                  <option value="ALL">All Shifts</option>
                  <option value="Day">Day Shift</option>
                  <option value="Night">Night Shift</option>
                </select>

                <select
                  value={selectedMachineFilter}
                  onChange={e => setSelectedMachineFilter(e.target.value)}
                  className="h-9 px-3 border border-border rounded-lg text-sm bg-white text-navy outline-none"
                >
                  <option value="ALL">All Machines</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 flex flex-col items-center justify-center">
                <LoadingSpinner size={36} />
                <p className="mt-3 text-secondary-text text-sm">Loading production records...</p>
              </div>
            ) : filteredProduction.length === 0 ? (
              <div className="p-12 text-center text-secondary-text">
                <Factory size={48} className="mx-auto mb-3 opacity-30 text-primary" />
                <p className="font-semibold text-navy">No production records found</p>
                <p className="text-sm mt-1">Log a new production run to start tracking output.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date / Shift</TableHead>
                    <TableHead>Export Order</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Planned</TableHead>
                    <TableHead>Actual Output</TableHead>
                    <TableHead>Performance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProduction.map((item) => {
                    const planned = Number(item.planned_quantity || 0);
                    const actual = Number(item.actual_quantity || 0);
                    const pct = planned > 0 ? Math.min(Math.round((actual / planned) * 100), 100) : 100;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-semibold text-navy">{item.production_date}</div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-soft-mint text-primary font-medium">
                            {item.shift || 'Day'} Shift
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-navy">
                            {item.export_orders?.order_number || 'Order ' + item.order_id.slice(0, 8)}
                          </div>
                          <div className="text-xs text-secondary-text">{item.export_orders?.buyer_name || '—'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-navy">{item.export_machines?.name || 'Unassigned'}</div>
                          <div className="text-xs text-secondary-text">{item.export_machines?.machine_type || '—'}</div>
                        </TableCell>
                        <TableCell className="font-medium">{planned.toLocaleString()} {item.unit}</TableCell>
                        <TableCell className="font-bold text-primary">{actual.toLocaleString()} {item.unit}</TableCell>
                        <TableCell>
                          <div className="w-28 space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span>{pct}%</span>
                            </div>
                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 100 ? 'bg-primary' : pct >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${pct}%` }}
                              ></div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs px-2.5 py-1 rounded-full font-medium capitalize bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {item.status || 'Completed'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => openEditProductionModal(item)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Machinery Floor List */}
      {activeTab === 'machines' && (
        <Card>
          <CardHeader className="flex justify-between items-center border-b border-border pb-4">
            <CardTitle className="text-lg">Factory Machines & Looms</CardTitle>
            <Button size="sm" onClick={() => setIsMachineModalOpen(true)} className="flex items-center gap-1.5">
              <Plus size={15} /> Add Machine
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {machines.length === 0 ? (
              <div className="p-12 text-center text-secondary-text">
                <Cpu size={48} className="mx-auto mb-3 opacity-30 text-primary" />
                <p className="font-semibold text-navy">No machines registered</p>
                <p className="text-sm mt-1">Register your factory weaving/knitting machines.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine Name</TableHead>
                    <TableHead>Machine Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Specifications</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machines.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-bold text-navy">{m.name}</TableCell>
                      <TableCell>{m.machine_type}</TableCell>
                      <TableCell className="text-secondary-text">{m.location || 'Floor 1'}</TableCell>
                      <TableCell className="text-xs text-secondary-text">{m.specifications || 'Standard'}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize border ${
                          m.status === 'active' 
                            ? 'bg-green-50 text-success border-green-200' 
                            : m.status === 'maintenance' 
                              ? 'bg-amber-50 text-amber-700 border-amber-200' 
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          {m.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Production Run Modal */}
      <Modal
        isOpen={isProductionModalOpen}
        onClose={() => setIsProductionModalOpen(false)}
        title={editingRecord ? "Edit Production Run" : "Log New Production Run"}
      >
        <form onSubmit={handleSubmit(onSaveProduction)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-navy">Export Order *</label>
            <select
              {...register('order_id')}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select Export Order</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>{o.order_number} ({o.buyer_name})</option>
              ))}
            </select>
            {errors.order_id && <p className="text-error text-xs">{errors.order_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-navy">Machine</label>
              <select
                {...register('machine_id')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select Machine (Optional)</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.machine_type})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-navy">Shift *</label>
              <select
                {...register('shift')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Day">Day Shift</option>
                <option value="Night">Night Shift</option>
              </select>
            </div>
          </div>

          <Input
            label="Production Date *"
            type="date"
            {...register('production_date')}
            error={errors.production_date?.message}
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <Input
                label="Planned Qty *"
                type="number"
                step="0.01"
                placeholder="1000"
                {...register('planned_quantity', { valueAsNumber: true })}
                error={errors.planned_quantity?.message}
              />
            </div>
            <div className="col-span-1">
              <Input
                label="Actual Output *"
                type="number"
                step="0.01"
                placeholder="980"
                {...register('actual_quantity', { valueAsNumber: true })}
                error={errors.actual_quantity?.message}
              />
            </div>
            <div className="col-span-1 space-y-1">
              <label className="block text-sm font-medium text-navy">Unit</label>
              <select
                {...register('unit')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="meters">Meters</option>
                <option value="kg">Kilograms</option>
                <option value="pieces">Pieces</option>
                <option value="rolls">Rolls</option>
              </select>
            </div>
          </div>

          <Input
            label="Fabric / Construction Details"
            placeholder="e.g. 100% Combed Cotton 40s Single Jersey"
            {...register('fabric_details')}
          />

          <Input
            label="Notes"
            placeholder="Operator remarks, yarn lot used..."
            {...register('notes')}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsProductionModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {editingRecord ? "Save Changes" : "Save Production Run"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Machine Modal */}
      <Modal
        isOpen={isMachineModalOpen}
        onClose={() => setIsMachineModalOpen(false)}
        title="Register Factory Machine"
      >
        <form onSubmit={handleSubmitMachine(onSaveMachine)} className="space-y-4">
          <Input
            label="Machine Name / ID *"
            placeholder="e.g. Loom-01, Circular-Knitter-A"
            {...registerMachine('name')}
            error={machineErrors.name?.message}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Machine Type *"
              placeholder="e.g. Air Jet Loom, Circular Knit"
              {...registerMachine('machine_type')}
              error={machineErrors.machine_type?.message}
            />

            <div className="space-y-1">
              <label className="block text-sm font-medium text-navy">Status</label>
              <select
                {...registerMachine('status')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="active">Active</option>
                <option value="idle">Idle</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <Input
            label="Floor / Location"
            placeholder="e.g. Unit 2, Weaving Hall B"
            {...registerMachine('location')}
          />

          <Input
            label="Technical Specifications"
            placeholder="e.g. Width: 340cm, RPM: 850"
            {...registerMachine('specifications')}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsMachineModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isMachineSubmitting}>
              Register Machine
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
