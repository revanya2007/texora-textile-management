import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Plus, Search, Wallet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface PaymentRecord {
  id: string;
  subcontractor_id: string;
  work_order_id?: string;
  amount: number;
  payment_date: string;
  reference?: string;
  created_at: string;
  domestic_work_orders?: { order_number: string };
  profiles?: { email: string; first_name?: string; last_name?: string };
}

interface WorkerOption {
  id: string;
  email: string;
}

const paymentSchema = z.object({
  subcontractor_id: z.string().min(1, 'Subcontractor is required'),
  amount: z.number().positive('Payment amount must be greater than 0'),
  payment_date: z.string().min(1, 'Payment date is required'),
  reference: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function DomesticPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_date: new Date().toISOString().split('T')[0],
      amount: 500,
    }
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Payments
      const { data: pData, error: pErr } = await supabase
        .from('domestic_payments')
        .select(`
          *,
          domestic_work_orders ( order_number ),
          profiles:subcontractor_id ( email, first_name, last_name )
        `)
        .order('payment_date', { ascending: false });

      if (pErr) throw pErr;
      setPayments((pData as any) || []);

      // 2. Fetch Subcontractor profiles
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, email')
        .in('role', ['subcontractor', 'domestic_staff']);

      setWorkers(profData || []);
    } catch (err: any) {
      console.error('Error fetching payments:', err);
      setErrorMessage(err.message || 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    reset({
      payment_date: new Date().toISOString().split('T')[0],
      amount: 500,
      reference: '',
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const onSavePayment = async (data: PaymentFormValues) => {
    setErrorMessage(null);
    try {
      const { error } = await supabase
        .from('domestic_payments')
        .insert([{
          subcontractor_id: data.subcontractor_id,
          amount: data.amount,
          payment_date: data.payment_date,
          reference: data.reference || null,
        }]);

      if (error) throw error;
      setSuccessMessage('Wage disbursal recorded successfully.');
      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error recording payment.');
    }
  };

  const filteredPayments = payments.filter(p => {
    const ref = p.reference?.toLowerCase() || '';
    const email = p.profiles?.email?.toLowerCase() || '';
    return ref.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase());
  });

  const totalDisbursed = payments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <Wallet className="text-primary" /> Subcontractor Wages & Payments
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Track piece-rate wage settlements, UPI/Bank references, and payment disbursements.
          </p>
        </div>
        <Button onClick={openCreateModal} className="flex items-center gap-2">
          <Plus size={16} /> Disburse Payment
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
              placeholder="Search by worker or reference..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-4 rounded-lg border border-border text-sm outline-none focus:border-primary transition-all bg-soft-mint/20"
            />
          </div>
          <div className="text-sm font-semibold text-navy">
            Total Disbursed: <span className="text-primary font-bold">₹{totalDisbursed.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center">
              <LoadingSpinner size={36} />
              <p className="mt-3 text-secondary-text text-sm">Loading payment settlements...</p>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="p-12 text-center text-secondary-text">
              <Wallet size={48} className="mx-auto mb-3 opacity-30 text-primary" />
              <p className="font-semibold text-navy">No payments recorded</p>
              <p className="text-sm mt-1">Disburse piece-rate wage settlements to job-workers.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Subcontractor / Worker</TableHead>
                  <TableHead>Work Order</TableHead>
                  <TableHead>Amount (INR)</TableHead>
                  <TableHead>Reference / UTR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold text-navy">{p.payment_date}</TableCell>
                    <TableCell className="font-medium text-navy">
                      {p.profiles?.email || 'Subcontractor ' + p.subcontractor_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm text-secondary-text">
                      {p.domestic_work_orders?.order_number || 'Direct Piece Rate'}
                    </TableCell>
                    <TableCell className="font-bold text-success text-base">
                      ₹{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-secondary-text">
                      {p.reference || 'Cash / Bank Transfer'}
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
        title="Disburse Subcontractor Wage"
      >
        <form onSubmit={handleSubmit(onSavePayment)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-navy">Subcontractor *</label>
            <select
              {...register('subcontractor_id')}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select Subcontractor</option>
              {workers.map(w => (
                <option key={w.id} value={w.id}>{w.email}</option>
              ))}
            </select>
            {errors.subcontractor_id && <p className="text-error text-xs">{errors.subcontractor_id.message}</p>}
          </div>

          <Input
            label="Payment Date *"
            type="date"
            {...register('payment_date')}
            error={errors.payment_date?.message}
          />

          <Input
            label="Amount (₹) *"
            type="number"
            step="1"
            placeholder="1500"
            {...register('amount', { valueAsNumber: true })}
            error={errors.amount?.message}
          />

          <Input
            label="Bank Reference / UPI / Cheque Number"
            placeholder="e.g. UPI-REF-902188472"
            {...register('reference')}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Confirm Disbursal
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
