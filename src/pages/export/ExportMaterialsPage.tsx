import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Package, Plus } from 'lucide-react';

interface YarnItem {
  id: string;
  yarn_type: string;
  lot_number: string;
  quantity_kg: number;
}

const transactionSchema = z.object({
  inventory_id: z.string().min(1, 'Please select a yarn type/lot.'),
  transaction_type: z.enum(['IN', 'OUT']),
  quantity_kg: z.number().positive('Quantity must be greater than zero.'),
  notes: z.string().optional(),
  order_id: z.string().optional().nullable(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

export default function ExportMaterialsPage() {
  const [inventory, setInventory] = useState<YarnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transaction_type: 'IN',
      quantity_kg: 0,
      notes: '',
      order_id: null,
    }
  });

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('export_yarn_inventory')
        .select('*')
        .order('yarn_type', { ascending: true });

      if (error) throw error;
      setInventory(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const onSubmitTransaction = async (data: TransactionFormValues) => {
    setTransactionError(null);
    setTransactionSuccess(false);
    try {
      const { error: rpcError } = await supabase.rpc('process_yarn_transaction', {
        p_inventory_id: data.inventory_id,
        p_order_id: data.order_id || null,
        p_transaction_type: data.transaction_type,
        p_quantity_kg: data.quantity_kg,
        p_notes: data.notes || null
      });

      if (rpcError) throw rpcError;
      
      setTransactionSuccess(true);
      reset();
      await fetchInventory(); // Refresh stock
      
      setTimeout(() => {
        setIsModalOpen(false);
        setTransactionSuccess(false);
      }, 1500);

    } catch (err: any) {
      setTransactionError(err.message || 'Failed to process transaction.');
    }
  };

  if (loading && inventory.length === 0) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-navy">Yarn Inventory</h1>
          <p className="text-secondary-text">Manage your stock and record transactions.</p>
        </div>
        <Button className="flex items-center gap-2" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} /> New Transaction
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Stock Ledger</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error && <div className="p-4 text-error bg-red-50">{error}</div>}
          
          {inventory.length === 0 && !error ? (
            <div className="p-8">
              <EmptyState 
                title="No Yarn Inventory Found" 
                description="Your stock ledger is empty."
                icon={Package}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Yarn Type</TableHead>
                  <TableHead>Lot Number</TableHead>
                  <TableHead className="text-right">Available Quantity (KG)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.yarn_type}</TableCell>
                    <TableCell>{item.lot_number}</TableCell>
                    <TableCell className="text-right">
                      <span className={item.quantity_kg < 50 ? 'text-warning font-bold' : 'text-success font-bold'}>
                        {item.quantity_kg.toFixed(2)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record Stock Transaction">
        {transactionSuccess ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 bg-green-100 text-success rounded-full flex items-center justify-center mb-4">
              <Package size={24} />
            </div>
            <h3 className="text-lg font-bold text-navy mb-2">Transaction Successful!</h3>
            <p className="text-secondary-text">The stock ledger has been updated securely.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmitTransaction)} className="space-y-4">
            {transactionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-error text-sm rounded-md">
                {transactionError}
              </div>
            )}
            
            <div className="space-y-1">
              <label className="text-sm font-medium text-navy block">Yarn Material</label>
              <select 
                {...register('inventory_id')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 transition-colors"
              >
                <option value="">Select Yarn / Lot...</option>
                {inventory.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.yarn_type} (Lot: {item.lot_number}) - Available: {item.quantity_kg} KG
                  </option>
                ))}
              </select>
              {errors.inventory_id && <p className="text-error text-xs">{errors.inventory_id.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-navy block">Transaction Type</label>
              <select 
                {...register('transaction_type')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 transition-colors"
              >
                <option value="IN">IN (Stock Receipt / Adjustment)</option>
                <option value="OUT">OUT (Consumption / Allocation)</option>
              </select>
              {errors.transaction_type && <p className="text-error text-xs">{errors.transaction_type.message}</p>}
            </div>

            <Input 
              label="Quantity (KG)" 
              type="number" 
              step="0.01" 
              {...register('quantity_kg', { valueAsNumber: true })} 
              error={errors.quantity_kg?.message} 
            />

            <Input 
              label="Notes / Reference" 
              type="text" 
              placeholder="Supplier Invoice # or Reason"
              {...register('notes')} 
              error={errors.notes?.message} 
            />

            <div className="pt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" isLoading={isSubmitting}>Submit Transaction</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
