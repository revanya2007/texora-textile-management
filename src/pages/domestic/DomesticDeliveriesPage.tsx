import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Plus, Search, Truck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface Delivery {
  id: string;
  work_order_id: string;
  subcontractor_id: string;
  quantity: number;
  delivery_date: string;
  created_at: string;
  domestic_work_orders?: { order_number: string };
  profiles?: { email: string; first_name?: string; last_name?: string };
}

interface WorkOrderOption {
  id: string;
  order_number: string;
  subcontractor_id: string;
}

const deliverySchema = z.object({
  work_order_id: z.string().min(1, 'Work order is required'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  delivery_date: z.string().min(1, 'Delivery date is required'),
});

type DeliveryFormValues = z.infer<typeof deliverySchema>;

export default function DomesticDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      delivery_date: new Date().toISOString().split('T')[0],
      quantity: 100,
    }
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Deliveries
      const { data: dData, error: dErr } = await supabase
        .from('domestic_deliveries')
        .select(`
          *,
          domestic_work_orders ( order_number ),
          profiles:subcontractor_id ( email, first_name, last_name )
        `)
        .order('delivery_date', { ascending: false });

      if (dErr) throw dErr;
      setDeliveries((dData as any) || []);

      // 2. Fetch Work Orders
      const { data: wData, error: wErr } = await supabase
        .from('domestic_work_orders')
        .select('id, order_number, subcontractor_id');

      if (wErr) throw wErr;
      setWorkOrders(wData || []);
    } catch (err: any) {
      console.error('Error fetching domestic deliveries:', err);
      setErrorMessage(err.message || 'Failed to load deliveries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    reset({
      delivery_date: new Date().toISOString().split('T')[0],
      quantity: 100,
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const onSaveDelivery = async (data: DeliveryFormValues) => {
    setErrorMessage(null);
    try {
      const selectedWO = workOrders.find(w => w.id === data.work_order_id);
      if (!selectedWO) throw new Error('Selected work order not found.');

      const { error } = await supabase
        .from('domestic_deliveries')
        .insert([{
          work_order_id: data.work_order_id,
          subcontractor_id: selectedWO.subcontractor_id,
          quantity: data.quantity,
          delivery_date: data.delivery_date,
        }]);

      if (error) throw error;
      setSuccessMessage('Subcontractor delivery batch recorded.');
      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error recording delivery.');
    }
  };

  const filteredDeliveries = deliveries.filter(d => {
    const woNum = d.domestic_work_orders?.order_number?.toLowerCase() || '';
    const email = d.profiles?.email?.toLowerCase() || '';
    return woNum.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase());
  });

  const totalPiecesDelivered = deliveries.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <Truck className="text-primary" /> Subcontractor Delivery Inwards
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Log finished piece deliveries received from subcontractors against assigned work orders.
          </p>
        </div>
        <Button onClick={openCreateModal} className="flex items-center gap-2">
          <Plus size={16} /> Record Inward Batch
        </Button>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 text-error border border-red-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2"><AlertCircle size={18} /><span>{errorMessage}</span></div>
          <button onClick={() => setErrorMessage(null)} className="text-xs underline font-medium">Dismiss</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 text-success border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2"><CheckCircle2 size={18} /><span>{successMessage}</span></div>
          <button onClick={() => setSuccessMessage(null)} className="text-xs underline font-medium">Dismiss</button>
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4 flex justify-between items-center">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text" size={16} />
            <input
              type="text"
              placeholder="Search by work order or worker..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-4 rounded-lg border border-border text-sm outline-none focus:border-primary transition-all bg-soft-mint/20"
            />
          </div>
          <div className="text-sm font-semibold text-navy">
            Total Received: <span className="text-primary font-bold">{totalPiecesDelivered.toLocaleString()} pcs</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center">
              <LoadingSpinner size={36} />
              <p className="mt-3 text-secondary-text text-sm">Loading delivery records...</p>
            </div>
          ) : filteredDeliveries.length === 0 ? (
            <div className="p-12 text-center text-secondary-text">
              <Truck size={48} className="mx-auto mb-3 opacity-30 text-primary" />
              <p className="font-semibold text-navy">No deliveries recorded</p>
              <p className="text-sm mt-1">Record inward batches from your job-workers.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Work Order</TableHead>
                  <TableHead>Subcontractor</TableHead>
                  <TableHead>Quantity Received</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-semibold text-navy">{d.delivery_date}</TableCell>
                    <TableCell className="font-bold text-navy">
                      {d.domestic_work_orders?.order_number || 'WO ' + d.work_order_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm text-secondary-text">
                      {d.profiles?.email || 'Subcontractor'}
                    </TableCell>
                    <TableCell className="font-bold text-success">
                      {Number(d.quantity).toLocaleString()} pcs
                    </TableCell>
                    <TableCell className="text-xs text-secondary-text">
                      {new Date(d.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Subcontractor Delivery"
      >
        <form onSubmit={handleSubmit(onSaveDelivery)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-navy">Work Order *</label>
            <select
              {...register('work_order_id')}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select Active Work Order</option>
              {workOrders.map(wo => (
                <option key={wo.id} value={wo.id}>{wo.order_number}</option>
              ))}
            </select>
            {errors.work_order_id && <p className="text-error text-xs">{errors.work_order_id.message}</p>}
          </div>

          <Input
            label="Delivery Date *"
            type="date"
            {...register('delivery_date')}
            error={errors.delivery_date?.message}
          />

          <Input
            label="Delivered Quantity (Pieces) *"
            type="number"
            step="1"
            placeholder="150"
            {...register('quantity', { valueAsNumber: true })}
            error={errors.quantity?.message}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Confirm Inward Delivery
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
