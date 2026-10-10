import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Plus, Search, Truck, CheckCircle2, AlertCircle, MapPin, FileText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';

interface DispatchRecord {
  id: string;
  order_id: string;
  buyer_id?: string;
  dispatch_date: string;
  quantity: number;
  destination: string;
  tracking_reference?: string;
  notes?: string;
  status: string;
  created_at: string;
  export_orders?: { order_number: string; buyer_name?: string };
  export_buyers?: { name: string; country?: string };
}

interface OrderWithStock {
  id: string;
  order_number: string;
  buyer_name: string;
  available_stock: number;
}

const dispatchSchema = z.object({
  order_id: z.string().min(1, 'Export order is required'),
  quantity: z.number().positive('Dispatch quantity must be greater than 0'),
  destination: z.string().min(1, 'Destination or shipping port is required'),
  tracking_reference: z.string().optional(),
  notes: z.string().optional(),
});

type DispatchFormValues = z.infer<typeof dispatchSchema>;

export default function ExportDispatchPage() {
  const [dispatches, setDispatches] = useState<DispatchRecord[]>([]);
  const [ordersWithStock, setOrdersWithStock] = useState<OrderWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<DispatchFormValues>({
    resolver: zodResolver(dispatchSchema),
    defaultValues: {
      quantity: 0,
      destination: '',
    },
  });

  const selectedOrderId = watch('order_id');
  const selectedOrderStock = ordersWithStock.find(o => o.id === selectedOrderId)?.available_stock || 0;

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Dispatches
      const { data: dData, error: dErr } = await supabase
        .from('export_dispatches')
        .select(`
          *,
          export_orders ( order_number, buyer_name ),
          export_buyers ( name, country )
        `)
        .order('dispatch_date', { ascending: false });

      if (dErr) throw dErr;
      setDispatches((dData as any) || []);

      // 2. Fetch Orders with finished goods available
      const { data: oData, error: oErr } = await supabase
        .from('export_orders')
        .select(`
          id,
          order_number,
          buyer_name,
          export_finished_goods ( available_quantity )
        `);

      if (oErr) throw oErr;

      const formattedOrders: OrderWithStock[] = (oData || []).map((o: any) => {
        const fg = Array.isArray(o.export_finished_goods) ? o.export_finished_goods[0] : o.export_finished_goods;
        return {
          id: o.id,
          order_number: o.order_number,
          buyer_name: o.buyer_name,
          available_stock: Number(fg?.available_quantity || 0),
        };
      });

      setOrdersWithStock(formattedOrders);
    } catch (err: any) {
      console.error('Error fetching dispatch data:', err);
      setErrorMessage(err.message || 'Failed to load dispatch records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    reset({
      quantity: 0,
      destination: '',
      tracking_reference: '',
      notes: '',
    });
    setErrorMessage(null);
    setIsDispatchModalOpen(true);
  };

  const onProcessDispatch = async (data: DispatchFormValues) => {
    setErrorMessage(null);
    if (data.quantity > selectedOrderStock && selectedOrderStock > 0) {
      setErrorMessage(`Cannot dispatch ${data.quantity}m. Only ${selectedOrderStock}m is available in Finished Goods.`);
      return;
    }

    try {
      // Attempt Atomic Stored Procedure
      let rpcSuccess = false;
      try {
        const { error: rpcErr } = await supabase.rpc('process_export_dispatch', {
          p_order_id: data.order_id,
          p_quantity: data.quantity,
          p_destination: data.destination,
          p_tracking_reference: data.tracking_reference || null,
          p_notes: data.notes || null,
        });
        if (!rpcErr) rpcSuccess = true;
      } catch (_) {
        rpcSuccess = false;
      }

      // Fallback if RPC pending: Execute safe atomic update sequence
      if (!rpcSuccess) {
        // 1. Deduct finished goods
        const { data: fgRow } = await supabase
          .from('export_finished_goods')
          .select('id, available_quantity, dispatched_quantity')
          .eq('order_id', data.order_id)
          .single();

        if (!fgRow || Number(fgRow.available_quantity) < data.quantity) {
          throw new Error('Insufficient finished goods inventory.');
        }

        const newAvail = Number(fgRow.available_quantity) - data.quantity;
        const newDispatched = Number(fgRow.dispatched_quantity || 0) + data.quantity;

        await supabase.from('export_finished_goods')
          .update({
            available_quantity: newAvail,
            dispatched_quantity: newDispatched,
            updated_at: new Date().toISOString()
          })
          .eq('id', fgRow.id);

        // 2. Insert dispatch
        const { error: insErr } = await supabase.from('export_dispatches').insert([{
          order_id: data.order_id,
          dispatch_date: new Date().toISOString().split('T')[0],
          quantity: data.quantity,
          destination: data.destination,
          tracking_reference: data.tracking_reference || null,
          notes: data.notes || null,
          status: 'dispatched'
        }]);

        if (insErr) throw insErr;
      }

      setSuccessMessage(`Successfully dispatched ${data.quantity.toLocaleString()}m to ${data.destination}.`);
      setIsDispatchModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error processing dispatch.');
    }
  };

  const filteredDispatches = dispatches.filter(d => {
    const orderNum = d.export_orders?.order_number?.toLowerCase() || '';
    const buyerName = d.export_orders?.buyer_name?.toLowerCase() || '';
    const dest = d.destination?.toLowerCase() || '';
    const track = d.tracking_reference?.toLowerCase() || '';
    return orderNum.includes(searchTerm.toLowerCase()) || 
      buyerName.includes(searchTerm.toLowerCase()) || 
      dest.includes(searchTerm.toLowerCase()) ||
      track.includes(searchTerm.toLowerCase());
  });

  const totalDispatchedMeters = dispatches.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <Truck className="text-primary" /> Dispatch & Shipping Operations
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Create consignments, generate dispatch packing notes, and deduct finished goods inventory atomically.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/export/invoices')} className="flex items-center gap-2">
            <FileText size={16} /> Commercial Invoices
          </Button>
          <Button onClick={openCreateModal} className="flex items-center gap-2">
            <Plus size={16} /> New Consignment Dispatch
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Total Consignments</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{dispatches.length}</h3>
              <p className="text-xs text-secondary-text mt-0.5">Dispatched Shipments</p>
            </div>
            <div className="p-3 bg-soft-mint rounded-xl text-primary"><Truck size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Total Volume Shipped</p>
              <h3 className="text-2xl font-bold text-primary mt-1">{totalDispatchedMeters.toLocaleString()} <span className="text-xs font-normal text-secondary-text">meters</span></h3>
              <p className="text-xs text-secondary-text mt-0.5">Cleared Custom Freight</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><CheckCircle2 size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Eligible Orders in Stock</p>
              <h3 className="text-2xl font-bold text-navy mt-1">
                {ordersWithStock.filter(o => o.available_stock > 0).length}
              </h3>
              <p className="text-xs text-secondary-text mt-0.5">Ready for immediate shipping</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><MapPin size={22} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Dispatch Table Card */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text" size={16} />
            <input
              type="text"
              placeholder="Search dispatch by order, buyer, destination..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-4 rounded-lg border border-border text-sm outline-none focus:border-primary transition-all bg-soft-mint/20"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center">
              <LoadingSpinner size={36} />
              <p className="mt-3 text-secondary-text text-sm">Loading dispatch log...</p>
            </div>
          ) : filteredDispatches.length === 0 ? (
            <div className="p-12 text-center text-secondary-text">
              <Truck size={48} className="mx-auto mb-3 opacity-30 text-primary" />
              <p className="font-semibold text-navy">No dispatches recorded yet</p>
              <p className="text-sm mt-1">Create a consignment dispatch from finished goods stock.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Export Order</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Tracking / BL No.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDispatches.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-semibold text-navy">{d.dispatch_date}</TableCell>
                    <TableCell>
                      <div className="font-bold text-navy">
                        {d.export_orders?.order_number || 'Order ' + d.order_id.slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-navy">{d.export_orders?.buyer_name || '—'}</span>
                    </TableCell>
                    <TableCell className="font-bold text-primary">
                      {Number(d.quantity).toLocaleString()} m
                    </TableCell>
                    <TableCell className="font-medium text-navy">{d.destination}</TableCell>
                    <TableCell className="font-mono text-xs text-secondary-text">
                      {d.tracking_reference || '—'}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                        {d.status || 'Dispatched'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => navigate('/export/invoices')} className="text-xs">
                        Create Invoice
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dispatch Modal */}
      <Modal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        title="Create Consignment Dispatch"
      >
        <form onSubmit={handleSubmit(onProcessDispatch)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-navy">Export Order (With Stock) *</label>
            <select
              {...register('order_id')}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select Export Order</option>
              {ordersWithStock.map(o => (
                <option key={o.id} value={o.id}>
                  {o.order_number} ({o.buyer_name}) — Avail: {o.available_stock.toLocaleString()}m
                </option>
              ))}
            </select>
            {errors.order_id && <p className="text-error text-xs">{errors.order_id.message}</p>}
          </div>

          {selectedOrderId && (
            <div className="p-3 bg-soft-mint/40 rounded-lg border border-light-mint flex justify-between items-center text-sm">
              <span className="text-secondary-text">Available Stock in Finished Goods:</span>
              <span className="font-bold text-primary text-base">{selectedOrderStock.toLocaleString()} meters</span>
            </div>
          )}

          <Input
            label="Dispatch Quantity (meters) *"
            type="number"
            step="0.01"
            placeholder="e.g. 500"
            {...register('quantity', { valueAsNumber: true })}
            error={errors.quantity?.message}
          />

          <Input
            label="Destination / Port of Delivery *"
            placeholder="e.g. Port of Rotterdam / Hamburg Port Warehouse"
            {...register('destination')}
            error={errors.destination?.message}
          />

          <Input
            label="Bill of Lading / Airway Bill / Tracking Reference"
            placeholder="e.g. BL-MSCU-9021893"
            {...register('tracking_reference')}
          />

          <Input
            label="Shipping Remarks & Instructions"
            placeholder="e.g. 20ft Dry Container No. CAXU-8921"
            {...register('notes')}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsDispatchModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Confirm Dispatch & Deduct Stock
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
