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
import { 
  Package, 
  Plus, 
  ArrowDownLeft, 
  ArrowUpRight, 
  AlertTriangle, 
  Search, 
  Boxes, 
  History, 
  CheckCircle2, 
  Layers,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface YarnItem {
  id: string;
  yarn_type: string;
  lot_number: string;
  quantity_kg: number;
  supplier_name?: string;
  yarn_count?: string;
  color?: string;
  min_reorder_level?: number;
  updated_at?: string;
}

interface YarnTransaction {
  id: string;
  inventory_id: string;
  export_order_id?: string | null;
  transaction_type: 'IN' | 'OUT';
  quantity_kg: number;
  notes?: string;
  created_at: string;
  created_by?: string;
  export_yarn_inventory?: { yarn_type: string; lot_number: string };
  export_orders?: { order_number: string; buyer_name?: string };
}

interface ExportOrder {
  id: string;
  order_number: string;
  buyer_name: string;
}

// Transaction schema
const transactionSchema = z.object({
  inventory_id: z.string().min(1, 'Please select a yarn material / lot.'),
  transaction_type: z.enum(['IN', 'OUT']),
  quantity_kg: z.number().positive('Quantity must be greater than zero.'),
  notes: z.string().optional(),
  order_id: z.string().optional().nullable(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

// New Yarn Item Schema
const newMaterialSchema = z.object({
  yarn_type: z.string().min(1, 'Yarn type is required (e.g. 100% Combed Cotton 30s)'),
  lot_number: z.string().min(1, 'Lot number is required (e.g. LOT-2026-99)'),
  quantity_kg: z.number().min(0, 'Initial quantity must be 0 or more'),
  supplier_name: z.string().optional(),
  yarn_count: z.string().optional(),
  color: z.string().optional(),
  min_reorder_level: z.number().min(0).optional(),
});

type NewMaterialFormValues = z.infer<typeof newMaterialSchema>;

export default function ExportMaterialsPage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<YarnItem[]>([]);
  const [transactions, setTransactions] = useState<YarnTransaction[]>([]);
  const [orders, setOrders] = useState<ExportOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // UI Tabs & Search
  const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Modals
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isNewMaterialModalOpen, setIsNewMaterialModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Forms
  const { 
    register, 
    handleSubmit, 
    reset, 
    setValue,
    watch,
    formState: { errors, isSubmitting } 
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transaction_type: 'IN',
      quantity_kg: 100,
      notes: '',
      order_id: null,
    }
  });

  const { 
    register: registerMaterial, 
    handleSubmit: handleSubmitMaterial, 
    reset: resetMaterial, 
    formState: { errors: materialErrors, isSubmitting: isMaterialSubmitting } 
  } = useForm<NewMaterialFormValues>({
    resolver: zodResolver(newMaterialSchema),
    defaultValues: {
      quantity_kg: 500,
      min_reorder_level: 100,
      color: 'Natural Raw White',
    }
  });

  const selectedInventoryId = watch('inventory_id');
  const selectedInventoryItem = inventory.find(i => i.id === selectedInventoryId);

  // Fetch Inventory, Transactions & Orders
  const fetchData = async () => {
    try {
      setError(null);
      
      // 1. Fetch Yarn Inventory
      const { data: invData, error: invErr } = await supabase
        .from('export_yarn_inventory')
        .select('*')
        .order('yarn_type', { ascending: true });

      if (invErr) throw invErr;
      setInventory(invData || []);

      // 2. Fetch Recent Transactions
      const { data: txData, error: txErr } = await supabase
        .from('export_yarn_transactions')
        .select(`
          *,
          export_yarn_inventory ( yarn_type, lot_number ),
          export_orders ( order_number, buyer_name )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!txErr && txData) {
        setTransactions(txData);
      }

      // 3. Fetch Orders for allocation dropdown
      const { data: orderData } = await supabase
        .from('export_orders')
        .select('id, order_number, buyer_name')
        .order('created_at', { ascending: false });

      if (orderData) {
        setOrders(orderData);
      }

    } catch (err: any) {
      console.error('Error loading yarn data:', err);
      setError(err.message || 'Failed to load inventory data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Submit New Stock Movement (IN / OUT) with automatic fallback
  const onSubmitTransaction = async (data: TransactionFormValues) => {
    setStatusMessage(null);
    try {
      // Find current item for stock balance check
      const currentItem = inventory.find(i => i.id === data.inventory_id);
      if (!currentItem) {
        throw new Error('Selected yarn material was not found.');
      }

      if (data.transaction_type === 'OUT' && currentItem.quantity_kg < data.quantity_kg) {
        throw new Error(`Insufficient stock. Available: ${currentItem.quantity_kg} KG, Requested: ${data.quantity_kg} KG`);
      }

      let rpcSucceeded = false;

      // Attempt 1: RPC process_yarn_transaction
      try {
        const { error: rpcError } = await supabase.rpc('process_yarn_transaction', {
          p_inventory_id: data.inventory_id,
          p_order_id: data.order_id || null,
          p_transaction_type: data.transaction_type,
          p_quantity_kg: data.quantity_kg,
          p_notes: data.notes || null
        });

        if (!rpcError) {
          rpcSucceeded = true;
        } else {
          console.warn('RPC process_yarn_transaction failed, using direct table update fallback:', rpcError);
        }
      } catch (rpcEx) {
        console.warn('RPC exception, using direct fallback:', rpcEx);
      }

      // Attempt 2: Direct Database Transaction Fallback
      if (!rpcSucceeded) {
        const newQty = data.transaction_type === 'IN' 
          ? Number(currentItem.quantity_kg) + Number(data.quantity_kg)
          : Number(currentItem.quantity_kg) - Number(data.quantity_kg);

        // Update inventory row
        const { error: updateErr } = await supabase
          .from('export_yarn_inventory')
          .update({ 
            quantity_kg: Math.max(0, newQty),
            updated_at: new Date().toISOString()
          })
          .eq('id', data.inventory_id);

        if (updateErr) throw updateErr;

        // Insert transaction ledger record
        const { error: insertTxErr } = await supabase
          .from('export_yarn_transactions')
          .insert([{
            inventory_id: data.inventory_id,
            export_order_id: data.order_id || null,
            transaction_type: data.transaction_type,
            quantity_kg: data.quantity_kg,
            notes: data.notes || (data.transaction_type === 'IN' ? 'Stock Receipt' : 'Production Issue'),
            created_by: user?.id || null,
            created_at: new Date().toISOString()
          }]);

        if (insertTxErr) {
          console.warn('Could not record transaction ledger row:', insertTxErr);
        }
      }

      setStatusMessage({ type: 'success', text: `Transaction saved successfully! Stock updated for ${currentItem.yarn_type}.` });
      reset();
      await fetchData();

      setTimeout(() => {
        setIsTransactionModalOpen(false);
        setStatusMessage(null);
      }, 1200);

    } catch (err: any) {
      console.error('Error saving transaction:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update stock transaction in database.' });
    }
  };

  // Submit Brand New Material / Inward Lot
  const onSubmitNewMaterial = async (data: NewMaterialFormValues) => {
    setStatusMessage(null);
    try {
      const { data: newRow, error: insertErr } = await supabase
        .from('export_yarn_inventory')
        .insert([{
          yarn_type: data.yarn_type.trim(),
          lot_number: data.lot_number.trim(),
          quantity_kg: data.quantity_kg,
          supplier_name: data.supplier_name?.trim() || 'Direct Mill Purchase',
          yarn_count: data.yarn_count?.trim() || null,
          color: data.color?.trim() || 'Natural',
          min_reorder_level: data.min_reorder_level || 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Also record initial inward transaction if initial quantity > 0
      if (data.quantity_kg > 0 && newRow?.id) {
        await supabase
          .from('export_yarn_transactions')
          .insert([{
            inventory_id: newRow.id,
            transaction_type: 'IN',
            quantity_kg: data.quantity_kg,
            notes: `Initial stock inward for Lot #${data.lot_number}`,
            created_by: user?.id || null,
            created_at: new Date().toISOString()
          }]);
      }

      setStatusMessage({ type: 'success', text: `New material lot "${data.yarn_type}" (${data.lot_number}) created and saved to database!` });
      resetMaterial();
      await fetchData();

      setTimeout(() => {
        setIsNewMaterialModalOpen(false);
        setStatusMessage(null);
      }, 1200);

    } catch (err: any) {
      console.error('Error creating yarn material:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to add new yarn material to database.' });
    }
  };

  // Calculations & KPIs
  const totalStockKg = inventory.reduce((sum, item) => sum + (Number(item.quantity_kg) || 0), 0);
  const lowStockCount = inventory.filter(item => (item.quantity_kg || 0) < (item.min_reorder_level || 100)).length;
  const inMovements = transactions.filter(t => t.transaction_type === 'IN').length;
  const outMovements = transactions.filter(t => t.transaction_type === 'OUT').length;

  // Filtered list
  const filteredInventory = inventory.filter(item => {
    const matchesSearch = 
      item.yarn_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.lot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.supplier_name && item.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (filterType === 'LOW_STOCK') {
      return matchesSearch && item.quantity_kg < (item.min_reorder_level || 100);
    }
    if (filterType === 'IN_STOCK') {
      return matchesSearch && item.quantity_kg >= (item.min_reorder_level || 100);
    }
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[400px]">
        <LoadingSpinner />
        <p className="text-secondary-text text-sm mt-3">Loading yarn stock ledger & database transactions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <Package size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-navy">Raw Material & Yarn Stock</h1>
              <p className="text-sm text-secondary-text">Live stock ledger, material receipts, and allocation tracking.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>

          <Button 
            variant="outline"
            className="flex items-center gap-1.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            onClick={() => setIsNewMaterialModalOpen(true)}
          >
            <Layers size={16} /> New Material / Lot
          </Button>

          <Button 
            className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white" 
            onClick={() => setIsTransactionModalOpen(true)}
          >
            <Plus size={16} /> Record Transaction
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Total Stock on Hand</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{totalStockKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-sm font-normal text-slate-500">KG</span></h3>
              <p className="text-xs text-emerald-600 font-medium mt-1">Across {inventory.length} active yarn lots</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Boxes size={24} />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Low Stock Warnings</p>
              <h3 className={`text-2xl font-bold mt-1 ${lowStockCount > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                {lowStockCount} <span className="text-sm font-normal text-slate-500">lots</span>
              </h3>
              <p className="text-xs text-secondary-text mt-1">Below minimum threshold</p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${lowStockCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
              <AlertTriangle size={24} />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Inward Movements</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{inMovements} <span className="text-sm font-normal text-slate-500">entries</span></h3>
              <p className="text-xs text-emerald-600 font-medium mt-1">Receipts & replenishment</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ArrowDownLeft size={24} />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Outward Allocations</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{outMovements} <span className="text-sm font-normal text-slate-500">issues</span></h3>
              <p className="text-xs text-primary font-medium mt-1">Production floor usage</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <ArrowUpRight size={24} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'inventory'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary-text hover:text-navy'
          }`}
        >
          <Boxes size={16} /> Current Stock Ledger ({inventory.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary-text hover:text-navy'
          }`}
        >
          <History size={16} /> Transaction History ({transactions.length})
        </button>
      </div>

      {/* Tab 1: Current Stock Ledger */}
      {activeTab === 'inventory' && (
        <Card className="border border-border/80 shadow-xs">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <CardTitle className="text-lg text-navy">Yarn Inventory Ledger</CardTitle>
              
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search material or lot..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="py-1.5 px-3 text-sm rounded-lg border border-border bg-white text-navy focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="ALL">All Stock</option>
                  <option value="IN_STOCK">Normal Stock</option>
                  <option value="LOW_STOCK">Low Stock Alert</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {error && (
              <div className="p-4 bg-red-50 border-b border-red-200 text-error text-sm flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {filteredInventory.length === 0 ? (
              <div className="p-12 text-center">
                <EmptyState 
                  title="No Matching Yarn Material Found" 
                  description="Add new yarn material or clear search filters."
                  icon={Package}
                />
                <Button 
                  className="mt-4" 
                  size="sm" 
                  onClick={() => setIsNewMaterialModalOpen(true)}
                >
                  <Plus size={15} className="mr-1" /> Add New Material Lot
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="font-bold">Yarn Material & Specification</TableHead>
                    <TableHead className="font-bold">Lot Number</TableHead>
                    <TableHead className="font-bold">Supplier / Origin</TableHead>
                    <TableHead className="font-bold">Color / Shade</TableHead>
                    <TableHead className="font-bold text-right">Available Balance</TableHead>
                    <TableHead className="font-bold text-center">Stock Status</TableHead>
                    <TableHead className="font-bold text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item) => {
                    const isLow = item.quantity_kg < (item.min_reorder_level || 100);
                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <TableCell>
                          <div className="font-bold text-navy">{item.yarn_type}</div>
                          {item.yarn_count && (
                            <div className="text-xs text-secondary-text">Count: {item.yarn_count}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                            {item.lot_number}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-secondary-text">
                          {item.supplier_name || 'Direct Mill'}
                        </TableCell>
                        <TableCell className="text-sm text-secondary-text">
                          {item.color || 'Natural'}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-base font-extrabold ${isLow ? 'text-amber-600' : 'text-emerald-700'}`}>
                            {Number(item.quantity_kg).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs text-slate-400 ml-1">KG</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle size={11} /> Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={11} /> Optimal
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setValue('inventory_id', item.id);
                              setValue('transaction_type', 'OUT');
                              setValue('quantity_kg', 100);
                              setIsTransactionModalOpen(true);
                            }}
                            className="text-xs font-medium"
                          >
                            Issue / Allocate
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

      {/* Tab 2: Transaction History Log */}
      {activeTab === 'history' && (
        <Card className="border border-border/80 shadow-xs">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-navy">Audit Ledger & Transaction History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {transactions.length === 0 ? (
              <div className="p-12 text-center">
                <EmptyState 
                  title="No Transactions Recorded" 
                  description="Stock receipts and issues will appear here in chronological order."
                  icon={History}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="font-bold">Date & Time</TableHead>
                    <TableHead className="font-bold">Yarn Material</TableHead>
                    <TableHead className="font-bold">Lot #</TableHead>
                    <TableHead className="font-bold">Type</TableHead>
                    <TableHead className="font-bold text-right">Quantity</TableHead>
                    <TableHead className="font-bold">Linked Order</TableHead>
                    <TableHead className="font-bold">Notes / Ref</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                      <TableCell className="text-xs text-slate-500 font-mono">
                        {new Date(tx.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-semibold text-navy">
                        {tx.export_yarn_inventory?.yarn_type || 'Yarn Item'}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {tx.export_yarn_inventory?.lot_number || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {tx.transaction_type === 'IN' ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <ArrowDownLeft size={12} /> IN (Receipt)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <ArrowUpRight size={12} /> OUT (Issue)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-extrabold text-navy">
                        {tx.transaction_type === 'IN' ? '+' : '-'}{Number(tx.quantity_kg).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} KG
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-700">
                        {tx.export_orders?.order_number ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                            {tx.export_orders.order_number}
                          </span>
                        ) : (
                          <span className="text-slate-400">General Stock</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-secondary-text max-w-xs truncate">
                        {tx.notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal 1: Record Stock Transaction (IN / OUT) */}
      <Modal 
        isOpen={isTransactionModalOpen} 
        onClose={() => setIsTransactionModalOpen(false)} 
        title="Record Stock Transaction"
      >
        {statusMessage && (
          <div className={`p-3.5 mb-4 rounded-xl text-sm flex items-start gap-2.5 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{statusMessage.type === 'success' ? 'Success' : 'Error'}</p>
              <p className="text-xs mt-0.5">{statusMessage.text}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmitTransaction)} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-navy block">Yarn Material / Lot *</label>
            <select 
              {...register('inventory_id')}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 transition-colors"
            >
              <option value="">Select Yarn Material / Lot...</option>
              {inventory.map(item => (
                <option key={item.id} value={item.id}>
                  {item.yarn_type} (Lot: {item.lot_number}) — Available: {item.quantity_kg} KG
                </option>
              ))}
            </select>
            {errors.inventory_id && <p className="text-error text-xs">{errors.inventory_id.message}</p>}
          </div>

          {selectedInventoryItem && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 flex justify-between items-center">
              <span>Current Stock Balance:</span>
              <span className="font-bold text-navy text-sm">{selectedInventoryItem.quantity_kg} KG</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-navy block">Transaction Direction *</label>
            <div className="grid grid-cols-2 gap-2">
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                watch('transaction_type') === 'IN' 
                  ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 font-semibold' 
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}>
                <input 
                  type="radio" 
                  value="IN" 
                  {...register('transaction_type')} 
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <ArrowDownLeft size={16} className="text-emerald-600" />
                <span>IN (Stock Receipt)</span>
              </label>

              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                watch('transaction_type') === 'OUT' 
                  ? 'border-purple-500 bg-purple-50/50 text-purple-900 font-semibold' 
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}>
                <input 
                  type="radio" 
                  value="OUT" 
                  {...register('transaction_type')} 
                  className="text-purple-600 focus:ring-purple-500"
                />
                <ArrowUpRight size={16} className="text-purple-600" />
                <span>OUT (Allocation)</span>
              </label>
            </div>
            {errors.transaction_type && <p className="text-error text-xs">{errors.transaction_type.message}</p>}
          </div>

          <Input 
            label="Transaction Quantity (KG) *" 
            type="number" 
            step="0.01" 
            placeholder="e.g. 250"
            {...register('quantity_kg', { valueAsNumber: true })} 
            error={errors.quantity_kg?.message} 
          />

          <div className="space-y-1">
            <label className="text-sm font-medium text-navy block">Allocate to Export Order (Optional)</label>
            <select 
              {...register('order_id')}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 transition-colors"
            >
              <option value="">No specific order (General Inward / Adjustment)</option>
              {orders.map(order => (
                <option key={order.id} value={order.id}>
                  {order.order_number} — {order.buyer_name}
                </option>
              ))}
            </select>
          </div>

          <Input 
            label="Notes / Reference" 
            type="text" 
            placeholder="e.g. Supplier Invoice # INV-902 or Spinning Hall Issue"
            {...register('notes')} 
            error={errors.notes?.message} 
          />

          <div className="pt-4 flex justify-end gap-2.5 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsTransactionModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} className="bg-primary hover:bg-primary/90 text-white">
              Save Transaction
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Add New Yarn Material / Lot */}
      <Modal 
        isOpen={isNewMaterialModalOpen} 
        onClose={() => setIsNewMaterialModalOpen(false)} 
        title="Add New Yarn Material / Inward Lot"
      >
        {statusMessage && (
          <div className={`p-3.5 mb-4 rounded-xl text-sm flex items-start gap-2.5 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{statusMessage.type === 'success' ? 'Success' : 'Error'}</p>
              <p className="text-xs mt-0.5">{statusMessage.text}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitMaterial(onSubmitNewMaterial)} className="space-y-4">
          <Input 
            label="Yarn Material Description *" 
            placeholder="e.g. 100% Combed Cotton 40s Compact"
            {...registerMaterial('yarn_type')} 
            error={materialErrors.yarn_type?.message} 
          />

          <div className="grid grid-cols-2 gap-3">
            <Input 
              label="Lot Number *" 
              placeholder="e.g. LOT-2026-108"
              {...registerMaterial('lot_number')} 
              error={materialErrors.lot_number?.message} 
            />

            <Input 
              label="Yarn Count / Spec" 
              placeholder="e.g. 40s Ne, 2/20s"
              {...registerMaterial('yarn_count')} 
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input 
              label="Supplier / Mill Name" 
              placeholder="e.g. Vardhman Textiles Ltd"
              {...registerMaterial('supplier_name')} 
            />

            <Input 
              label="Color / Shade" 
              placeholder="e.g. Natural Raw White"
              {...registerMaterial('color')} 
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input 
              label="Initial Inward Quantity (KG) *" 
              type="number"
              step="0.01"
              placeholder="500"
              {...registerMaterial('quantity_kg', { valueAsNumber: true })} 
              error={materialErrors.quantity_kg?.message} 
            />

            <Input 
              label="Min Reorder Level (KG)" 
              type="number"
              step="0.01"
              placeholder="100"
              {...registerMaterial('min_reorder_level', { valueAsNumber: true })} 
            />
          </div>

          <div className="pt-4 flex justify-end gap-2.5 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsNewMaterialModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isMaterialSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Create Material & Inward Stock
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
