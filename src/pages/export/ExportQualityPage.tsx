import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Plus, Search, Filter, ShieldCheck, CheckCircle2, AlertTriangle, AlertCircle, ArrowRight, Layers } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface QualityInspection {
  id: string;
  order_id: string;
  production_id: string | null;
  inspection_date: string;
  inspected_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  defect_category?: string;
  defect_notes?: string;
  is_processed_to_finished_goods?: boolean;
  status: string;
  created_at: string;
  export_orders?: { order_number: string; buyer_name?: string };
  export_production?: { production_date: string; shift: string; actual_quantity: number };
}

interface ExportOrder {
  id: string;
  order_number: string;
  buyer_name: string;
}

interface ProductionOption {
  id: string;
  order_id: string;
  production_date: string;
  actual_quantity: number;
}

const inspectionSchema = z.object({
  order_id: z.string().min(1, 'Export order is required'),
  production_id: z.string().optional(),
  inspection_date: z.string().min(1, 'Inspection date is required'),
  inspected_quantity: z.number().positive('Inspected quantity must be greater than 0'),
  accepted_quantity: z.number().min(0, 'Accepted quantity must be non-negative'),
  rejected_quantity: z.number().min(0, 'Rejected quantity must be non-negative'),
  defect_category: z.string().min(1),
  defect_notes: z.string().optional(),
}).refine((data) => (data.accepted_quantity + data.rejected_quantity) <= data.inspected_quantity, {
  message: 'Accepted quantity + Rejected quantity cannot exceed Total Inspected quantity',
  path: ['accepted_quantity'],
});

type InspectionFormValues = z.infer<typeof inspectionSchema>;

export default function ExportQualityPage() {
  const [inspections, setInspections] = useState<QualityInspection[]>([]);
  const [orders, setOrders] = useState<ExportOrder[]>([]);
  const [productionRuns, setProductionRuns] = useState<ProductionOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [defectFilter, setDefectFilter] = useState('ALL');

  // Modals & Messaging
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<InspectionFormValues>({
    resolver: zodResolver(inspectionSchema),
    defaultValues: {
      inspection_date: new Date().toISOString().split('T')[0],
      defect_category: 'None',
      inspected_quantity: 0,
      accepted_quantity: 0,
      rejected_quantity: 0,
    },
  });

  const watchOrder = watch('order_id');

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Inspections with joined Order & Production
      const { data: qData, error: qErr } = await supabase
        .from('export_quality_inspections')
        .select(`
          *,
          export_orders ( order_number, buyer_name ),
          export_production ( production_date, shift, actual_quantity )
        `)
        .order('inspection_date', { ascending: false });

      if (qErr) throw qErr;
      setInspections((qData as any) || []);

      // 2. Fetch Orders
      const { data: oData, error: oErr } = await supabase
        .from('export_orders')
        .select('id, order_number, buyer_name')
        .order('created_at', { ascending: false });

      if (oErr) throw oErr;
      setOrders(oData || []);

      // 3. Fetch Production runs
      const { data: pData, error: pErr } = await supabase
        .from('export_production')
        .select('id, order_id, production_date, actual_quantity')
        .order('production_date', { ascending: false });

      if (pErr) throw pErr;
      setProductionRuns(pData || []);
    } catch (err: any) {
      console.error('Error fetching QC data:', err);
      setErrorMessage(err.message || 'Failed to load quality control records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    reset({
      inspection_date: new Date().toISOString().split('T')[0],
      defect_category: 'None',
      inspected_quantity: 0,
      accepted_quantity: 0,
      rejected_quantity: 0,
    });
    setErrorMessage(null);
    setIsCreateModalOpen(true);
  };

  const onSaveInspection = async (data: InspectionFormValues) => {
    setErrorMessage(null);
    try {
      const payload = {
        order_id: data.order_id,
        production_id: data.production_id ? data.production_id : null,
        inspection_date: data.inspection_date,
        inspected_quantity: data.inspected_quantity,
        accepted_quantity: data.accepted_quantity,
        rejected_quantity: data.rejected_quantity,
        defect_category: data.defect_category,
        defect_notes: data.defect_notes || null,
        is_processed_to_finished_goods: false,
      };

      const { data: insertData, error } = await supabase
        .from('export_quality_inspections')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      // If there is accepted quantity, automatically transfer to finished goods inventory
      if (insertData && insertData.accepted_quantity > 0) {
        try {
          await supabase.rpc('receive_inspection_to_finished_goods', {
            p_inspection_id: insertData.id
          });
        } catch (rpcErr) {
          console.warn('RPC transfer to FG skipped/handled manually:', rpcErr);
        }
      }

      setSuccessMessage('Inspection recorded and accepted output added to Finished Goods.');
      setIsCreateModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving inspection record.');
    }
  };

  // Manual Transfer to Finished Goods trigger
  const handleTransferToFinishedGoods = async (inspectionId: string) => {
    setProcessingId(inspectionId);
    setErrorMessage(null);
    try {
      const { error } = await supabase.rpc('receive_inspection_to_finished_goods', {
        p_inspection_id: inspectionId
      });

      if (error) throw error;
      setSuccessMessage('Successfully received accepted fabric into Finished Goods Inventory.');
      await fetchData();
    } catch (err: any) {
      // Fallback: If RPC is pending execution, do safe table upsert
      try {
        const item = inspections.find(i => i.id === inspectionId);
        if (item) {
          const { data: fgRow } = await supabase
            .from('export_finished_goods')
            .select('id, available_quantity')
            .eq('order_id', item.order_id)
            .maybeSingle();

          const currentQty = Number(fgRow?.available_quantity || 0);
          const newQty = currentQty + Number(item.accepted_quantity);

          if (fgRow) {
            await supabase.from('export_finished_goods')
              .update({ available_quantity: newQty, updated_at: new Date().toISOString() })
              .eq('id', fgRow.id);
          } else {
            await supabase.from('export_finished_goods')
              .insert([{ order_id: item.order_id, available_quantity: item.accepted_quantity }]);
          }

          await supabase.from('export_quality_inspections')
            .update({ is_processed_to_finished_goods: true })
            .eq('id', inspectionId);

          setSuccessMessage('Successfully added to Finished Goods inventory.');
          await fetchData();
        }
      } catch (fallbackErr: any) {
        setErrorMessage(err.message || fallbackErr.message || 'Failed to process to finished goods.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  // Filter inspections
  const filteredInspections = inspections.filter(item => {
    const orderNum = item.export_orders?.order_number?.toLowerCase() || '';
    const buyerName = item.export_orders?.buyer_name?.toLowerCase() || '';
    const matchSearch = orderNum.includes(searchTerm.toLowerCase()) || 
      buyerName.includes(searchTerm.toLowerCase()) || 
      item.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchDefect = defectFilter === 'ALL' || item.defect_category === defectFilter;
    return matchSearch && matchDefect;
  });

  // KPI Calculations
  const totalInspected = inspections.reduce((acc, curr) => acc + Number(curr.inspected_quantity || 0), 0);
  const totalAccepted = inspections.reduce((acc, curr) => acc + Number(curr.accepted_quantity || 0), 0);
  const totalRejected = inspections.reduce((acc, curr) => acc + Number(curr.rejected_quantity || 0), 0);
  const acceptanceRate = totalInspected > 0 ? ((totalAccepted / totalInspected) * 100).toFixed(1) : '100.0';
  const rejectionRate = totalInspected > 0 ? ((totalRejected / totalInspected) * 100).toFixed(1) : '0.0';

  const filteredProductionRuns = productionRuns.filter(p => !watchOrder || p.order_id === watchOrder);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <ShieldCheck className="text-primary" /> Quality Control & Inspections
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Standard 4-point fabric inspection, defect categorization, and output clearance.
          </p>
        </div>
        <Button onClick={openCreateModal} className="flex items-center gap-2">
          <Plus size={16} /> New QC Inspection
        </Button>
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
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Total Inspected</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{totalInspected.toLocaleString()} <span className="text-xs font-normal text-secondary-text">m</span></h3>
            </div>
            <div className="p-3 bg-soft-mint rounded-xl text-primary"><ShieldCheck size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Accepted Clearance</p>
              <h3 className="text-2xl font-bold text-success mt-1">{totalAccepted.toLocaleString()} <span className="text-xs font-normal text-secondary-text">m</span></h3>
              <p className="text-xs text-secondary-text mt-0.5">{acceptanceRate}% Acceptance</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><CheckCircle2 size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Rejected Fabric</p>
              <h3 className="text-2xl font-bold text-error mt-1">{totalRejected.toLocaleString()} <span className="text-xs font-normal text-secondary-text">m</span></h3>
              <p className="text-xs text-secondary-text mt-0.5">{rejectionRate}% Rejection rate</p>
            </div>
            <div className="p-3 bg-red-50 rounded-xl text-error"><AlertTriangle size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Total Inspections</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{inspections.length}</h3>
              <p className="text-xs text-secondary-text mt-0.5">Audited Batches</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><Layers size={22} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text" size={16} />
              <input
                type="text"
                placeholder="Search inspection by order..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-9 pl-9 pr-4 rounded-lg border border-border text-sm outline-none focus:border-primary transition-all bg-soft-mint/20"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Filter size={16} className="text-secondary-text" />
              <select
                value={defectFilter}
                onChange={e => setDefectFilter(e.target.value)}
                className="h-9 px-3 border border-border rounded-lg text-sm bg-white text-navy outline-none"
              >
                <option value="ALL">All Defect Types</option>
                <option value="None">None (Clean)</option>
                <option value="Weaving Defect">Weaving Defect</option>
                <option value="Stains & Oil">Stains & Oil</option>
                <option value="Yarn Slubs">Yarn Slubs</option>
                <option value="Color Shading">Color Shading</option>
                <option value="Hole / Tear">Hole / Tear</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center">
              <LoadingSpinner size={36} />
              <p className="mt-3 text-secondary-text text-sm">Loading inspection records...</p>
            </div>
          ) : filteredInspections.length === 0 ? (
            <div className="p-12 text-center text-secondary-text">
              <ShieldCheck size={48} className="mx-auto mb-3 opacity-30 text-primary" />
              <p className="font-semibold text-navy">No inspection records found</p>
              <p className="text-sm mt-1">Create an inspection record to audit finished fabric.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Export Order</TableHead>
                  <TableHead>Inspected Qty</TableHead>
                  <TableHead>Accepted</TableHead>
                  <TableHead>Rejected</TableHead>
                  <TableHead>Defect Category</TableHead>
                  <TableHead>Finished Goods</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInspections.map((item) => {
                  const isProcessed = Boolean(item.is_processed_to_finished_goods);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-navy">{item.inspection_date}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-navy">
                          {item.export_orders?.order_number || 'Order ' + item.order_id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-secondary-text">{item.export_orders?.buyer_name || '—'}</div>
                      </TableCell>
                      <TableCell className="font-semibold text-navy">{Number(item.inspected_quantity).toLocaleString()} m</TableCell>
                      <TableCell className="font-bold text-success">
                        {Number(item.accepted_quantity).toLocaleString()} m
                      </TableCell>
                      <TableCell className="font-bold text-error">
                        {Number(item.rejected_quantity).toLocaleString()} m
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          item.defect_category === 'None' || !item.defect_category
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {item.defect_category || 'None'}
                        </span>
                        {item.defect_notes && (
                          <p className="text-[11px] text-secondary-text mt-1 italic max-w-xs truncate">{item.defect_notes}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {isProcessed ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-soft-mint text-primary font-medium">
                            <CheckCircle2 size={12} /> Stocked
                          </span>
                        ) : (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
                            Pending Transfer
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isProcessed && Number(item.accepted_quantity) > 0 ? (
                          <Button
                            size="sm"
                            variant="primary"
                            isLoading={processingId === item.id}
                            onClick={() => handleTransferToFinishedGoods(item.id)}
                            className="flex items-center gap-1 text-xs"
                          >
                            <span>Move to FG</span> <ArrowRight size={12} />
                          </Button>
                        ) : (
                          <span className="text-xs text-secondary-text">Completed</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* QC Inspection Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Record Quality Inspection"
      >
        <form onSubmit={handleSubmit(onSaveInspection)} className="space-y-4">
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

          <div className="space-y-1">
            <label className="block text-sm font-medium text-navy">Linked Production Run</label>
            <select
              {...register('production_id')}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select Production Run (Optional)</option>
              {filteredProductionRuns.map(p => (
                <option key={p.id} value={p.id}>{p.production_date} — Output: {p.actual_quantity}m</option>
              ))}
            </select>
          </div>

          <Input
            label="Inspection Date *"
            type="date"
            {...register('inspection_date')}
            error={errors.inspection_date?.message}
          />

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Inspected (m) *"
              type="number"
              step="0.01"
              placeholder="1000"
              {...register('inspected_quantity', { valueAsNumber: true })}
              error={errors.inspected_quantity?.message}
            />

            <Input
              label="Accepted (m) *"
              type="number"
              step="0.01"
              placeholder="950"
              {...register('accepted_quantity', { valueAsNumber: true })}
              error={errors.accepted_quantity?.message}
            />

            <Input
              label="Rejected (m) *"
              type="number"
              step="0.01"
              placeholder="50"
              {...register('rejected_quantity', { valueAsNumber: true })}
              error={errors.rejected_quantity?.message}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-navy">Defect Classification</label>
            <select
              {...register('defect_category')}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="None">None (Grade A - Clean)</option>
              <option value="Weaving Defect">Weaving Defect (Float, Miss-pick)</option>
              <option value="Stains & Oil">Stains & Oil Spots</option>
              <option value="Yarn Slubs">Yarn Slubs / Thick & Thin</option>
              <option value="Color Shading">Color Shading / Dye Unevenness</option>
              <option value="Hole / Tear">Hole / Physical Tear</option>
            </select>
          </div>

          <Input
            label="Inspector Remarks"
            placeholder="e.g. 4-point score: 14 pts/100 sq yd. Approved for export."
            {...register('defect_notes')}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Save QC Inspection
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
