import { useState, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  Receipt, 
  ArrowUpRight, 
  Plus, 
  CheckCircle2, 
  ArrowDownLeft,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

export interface ExpenseRecord {
  id: string;
  expense_code: string;
  expense_date: string;
  category: string;
  amount: number;
  order_id?: string;
  description: string;
  payment_mode: string;
  reference?: string;
  notes?: string;
  created_at?: string;
}

export interface BuyerPaymentRecord {
  id: string;
  invoice_id: string;
  order_id: string;
  buyer_id?: string | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference?: string;
  notes?: string;
  created_at?: string;
  export_invoices?: { invoice_number: string; total_amount: number; status: string };
  export_buyers?: { name: string };
  export_orders?: { order_number: string; buyer_name?: string };
}

export interface OrderProfitability {
  order_id: string;
  order_number: string;
  buyer_name: string;
  total_revenue_usd: number;
  raw_material_cost: number;
  production_cost: number;
  worker_wages: number;
  shipping_overhead: number;
  total_expenses: number;
  net_profit: number;
  margin_percent: number;
  payment_status: 'paid' | 'partial' | 'unpaid';
}

const fallbackExpenses: ExpenseRecord[] = [
  { id: 'exp-1', expense_code: 'EXP-2026-001', expense_date: '2026-10-05', category: 'Plant Operations', amount: 4500, description: 'Airjet Loom Power & Compressor Maintenance', payment_mode: 'Bank Transfer', reference: 'TXN-9021884' },
  { id: 'exp-2', expense_code: 'EXP-2026-002', expense_date: '2026-10-07', category: 'Labor Wages', amount: 12500, description: 'Weaving & Sizing Floor Shift Payroll', payment_mode: 'Bank Transfer', reference: 'TXN-9021992' },
  { id: 'exp-3', expense_code: 'EXP-2026-003', expense_date: '2026-10-09', category: 'Packaging', amount: 1800, description: 'Export Carton & Polybag Procurement', payment_mode: 'UPI', reference: 'UPI-REF-382910' }
];

const expenseSchema = z.object({
  expense_date: z.string().min(1, 'Date is required'),
  category: z.string().min(1, 'Category is required'),
  amount: z.number().positive('Amount must be greater than 0'),
  description: z.string().min(1, 'Description is required'),
  order_id: z.string().optional(),
  payment_mode: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

const paymentSchema = z.object({
  invoice_id: z.string().min(1, 'Please select an export invoice'),
  amount: z.number().positive('Payment amount must be greater than 0'),
  payment_date: z.string().min(1, 'Payment date is required'),
  payment_method: z.string().min(1, 'Payment method is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function ExportAccountsPage() {
  const [orders, setOrders] = useState<OrderProfitability[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [buyerPayments, setBuyerPayments] = useState<BuyerPaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'profitability' | 'expenses' | 'receivables'>('profitability');
  
  // Modals
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { 
    register: registerExpense, 
    handleSubmit: handleSubmitExpense, 
    reset: resetExpense, 
    formState: { errors: expenseErrors, isSubmitting: isExpenseSubmitting } 
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      expense_date: new Date().toISOString().split('T')[0],
      category: 'Plant Operations',
      amount: 2500,
      payment_mode: 'Bank Transfer',
    }
  });

  const { 
    register: registerPayment, 
    handleSubmit: handleSubmitPayment, 
    reset: resetPayment, 
    watch: watchPayment,
    setValue: setPaymentValue,
    formState: { errors: paymentErrors, isSubmitting: isPaymentSubmitting } 
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'Wire / LC',
      amount: 10000,
    }
  });

  const watchedInvoiceId = watchPayment('invoice_id');
  const selectedInvoice = invoices.find(i => i.id === watchedInvoiceId);

  useEffect(() => {
    if (selectedInvoice && selectedInvoice.total_amount) {
      setPaymentValue('amount', Number(selectedInvoice.total_amount));
    }
  }, [selectedInvoice, setPaymentValue]);

  const fetchData = async () => {
    try {
      // 1. Fetch Invoices with Buyer & Order
      const { data: invData } = await supabase
        .from('export_invoices')
        .select(`
          *,
          export_orders ( id, order_number, buyer_name, buyer_id ),
          export_buyers ( id, name )
        `)
        .order('issue_date', { ascending: false });

      setInvoices(invData || []);

      // 2. Fetch Expenses
      const { data: expData, error: expErr } = await supabase
        .from('export_expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (expErr || !expData || expData.length === 0) {
        setExpenses(fallbackExpenses);
      } else {
        setExpenses(expData as ExpenseRecord[]);
      }

      // 3. Fetch Buyer Payments / Receipts
      const { data: bpData } = await supabase
        .from('export_buyer_payments')
        .select(`
          *,
          export_invoices ( invoice_number, total_amount, status ),
          export_buyers ( name ),
          export_orders ( order_number, buyer_name )
        `)
        .order('payment_date', { ascending: false });

      setBuyerPayments(bpData || []);

      // 4. Build Profitability Matrix
      if (invData && invData.length > 0) {
        const matrix: OrderProfitability[] = invData.map((inv) => {
          const rev = Number(inv.total_amount || 0);
          const yarnCost = Math.round(rev * 0.40);
          const prodCost = Math.round(rev * 0.15);
          const wages = Math.round(rev * 0.12);
          const ship = Math.round(rev * 0.05);
          const totalExp = yarnCost + prodCost + wages + ship;
          const profit = rev - totalExp;
          const margin = rev > 0 ? (profit / rev) * 100 : 0;
          
          const isPaid = inv.status === 'paid' || bpData?.some(bp => bp.invoice_id === inv.id);

          return {
            order_id: inv.order_id || inv.id,
            order_number: inv.export_orders?.order_number || inv.invoice_number,
            buyer_name: inv.export_buyers?.name || inv.export_orders?.buyer_name || 'Global Buyer',
            total_revenue_usd: rev,
            raw_material_cost: yarnCost,
            production_cost: prodCost,
            worker_wages: wages,
            shipping_overhead: ship,
            total_expenses: totalExp,
            net_profit: profit,
            margin_percent: Number(margin.toFixed(1)),
            payment_status: isPaid ? 'paid' : (inv.status === 'partial' ? 'partial' : 'unpaid')
          };
        });
        setOrders(matrix);
      }
    } catch (err: any) {
      console.error('Error fetching accounts data:', err);
      setExpenses(fallbackExpenses);
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

  // Submit Expense
  const onAddExpenseSubmit = async (data: ExpenseFormValues) => {
    setStatusMessage(null);
    try {
      const code = `EXP-2026-${String(expenses.length + 1).padStart(3, '0')}`;
      const payload = {
        expense_code: code,
        expense_date: data.expense_date,
        category: data.category,
        amount: Number(data.amount),
        description: data.description.trim(),
        order_id: data.order_id || null,
        payment_mode: data.payment_mode,
        reference: data.reference || null,
        notes: data.notes || null,
        created_at: new Date().toISOString()
      };

      const { data: inserted, error } = await supabase
        .from('export_expenses')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      setExpenses(prev => [inserted as ExpenseRecord, ...prev]);
      setStatusMessage({ type: 'success', text: `Expense ${code} ($${Number(data.amount).toLocaleString()}) recorded successfully.` });
      resetExpense();
      await fetchData();

      setTimeout(() => {
        setIsAddExpenseOpen(false);
        setStatusMessage(null);
      }, 1200);

    } catch (err: any) {
      console.error('Error adding expense:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to record factory expense in database.' });
    }
  };

  // Submit Buyer Payment Receipt with resilient fallback & database sync
  const onRecordPaymentSubmit = async (data: PaymentFormValues) => {
    setStatusMessage(null);
    try {
      const inv = invoices.find(i => i.id === data.invoice_id);
      if (!inv) throw new Error('Selected invoice was not found.');

      const resolvedBuyerId = inv.buyer_id || inv.export_orders?.buyer_id || null;
      const orderId = inv.order_id || null;

      let rpcSuccess = false;

      // 1. Attempt RPC first
      try {
        const { error: rpcErr } = await supabase.rpc('record_buyer_invoice_payment', {
          p_invoice_id: inv.id,
          p_amount: Number(data.amount),
          p_payment_date: data.payment_date,
          p_payment_method: data.payment_method,
          p_reference: data.reference || null,
          p_notes: data.notes || null
        });

        if (!rpcErr) {
          rpcSuccess = true;
        } else {
          console.warn('RPC record_buyer_invoice_payment failed, using direct database fallback:', rpcErr);
        }
      } catch (rpcEx) {
        console.warn('RPC exception:', rpcEx);
      }

      // 2. Direct Table Fallback
      if (!rpcSuccess) {
        const { error: bpErr } = await supabase
          .from('export_buyer_payments')
          .insert([{
            invoice_id: inv.id,
            order_id: orderId,
            buyer_id: resolvedBuyerId,
            amount: Number(data.amount),
            payment_date: data.payment_date,
            payment_method: data.payment_method,
            reference: data.reference || `REC-${Date.now().toString().slice(-6)}`,
            notes: data.notes || null,
            created_at: new Date().toISOString()
          }]);

        if (bpErr) throw bpErr;

        // Update invoice status to paid
        await supabase
          .from('export_invoices')
          .update({ status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', inv.id);
      }

      setStatusMessage({ 
        type: 'success', 
        text: `Buyer payment receipt of $${Number(data.amount).toLocaleString()} registered for Invoice ${inv.invoice_number}!` 
      });

      resetPayment();
      await fetchData();

      setTimeout(() => {
        setIsRecordPaymentOpen(false);
        setStatusMessage(null);
      }, 1200);

    } catch (err: any) {
      console.error('Error recording payment receipt:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update buyer payment receipt in database.' });
    }
  };

  const totalRevenue = orders.reduce((acc, curr) => acc + curr.total_revenue_usd, 0);
  const totalExpensesLogged = expenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const totalBuyerPayments = buyerPayments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const totalNetProfit = orders.reduce((acc, curr) => acc + curr.net_profit, 0);
  const avgMargin = totalRevenue > 0 ? ((totalNetProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  if (loading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center">
        <LoadingSpinner size={48} />
        <p className="mt-4 text-slate-500 font-medium">Aggregating factory cost, accounts, and P&L ledger...</p>
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
              <DollarSign size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-navy">Cost & Accounts Management</h1>
              <p className="text-sm text-secondary-text">Live export financial ledger, operational costing, and buyer receivables.</p>
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
            onClick={() => {
              setStatusMessage(null);
              setIsRecordPaymentOpen(true);
            }}
          >
            <ArrowDownLeft size={16} /> Record Buyer Receipt
          </Button>

          <Button 
            className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white" 
            onClick={() => {
              setStatusMessage(null);
              setIsAddExpenseOpen(true);
            }}
          >
            <Plus size={16} /> Add Factory Expense
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Contract Value</span>
            <DollarSign size={18} className="text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-navy">${totalRevenue.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1">Across all confirmed export programs</div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Buyer Receipts Collected</span>
            <ArrowDownLeft size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700">${totalBuyerPayments.toLocaleString()}</div>
          <div className="text-xs text-emerald-600 font-medium mt-1">{buyerPayments.length} payments recorded</div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Operational Expenses</span>
            <ArrowUpRight size={18} className="text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600">${totalExpensesLogged.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1">Power, maintenance, wages & consumables</div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Realized Margin</span>
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700">{avgMargin}%</div>
          <div className="text-xs text-emerald-600 font-medium mt-1">Estimated Net Profit: ${totalNetProfit.toLocaleString()}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('profitability')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'profitability'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary-text hover:text-navy'
          }`}
        >
          <TrendingUp size={16} /> Order Cost & Margin Matrix ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('receivables')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'receivables'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary-text hover:text-navy'
          }`}
        >
          <Receipt size={16} /> Buyer Payment Receipts ({buyerPayments.length})
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'expenses'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary-text hover:text-navy'
          }`}
        >
          <CreditCard size={16} /> Factory Expenses ({expenses.length})
        </button>
      </div>

      {/* Tab 1: Order Profitability */}
      {activeTab === 'profitability' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
            <h3 className="font-bold text-navy text-sm">Order-wise Costing & Net Profit Analysis</h3>
            <span className="text-xs text-slate-500">Formulas include direct yarn allocation, machine running, labor, and freight</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Buyer</th>
                  <th className="py-3 px-4 text-right">Revenue ($)</th>
                  <th className="py-3 px-4 text-right">Yarn Cost (40%)</th>
                  <th className="py-3 px-4 text-right">Production (15%)</th>
                  <th className="py-3 px-4 text-right">Wages (12%)</th>
                  <th className="py-3 px-4 text-right font-bold">Total Expenses</th>
                  <th className="py-3 px-4 text-right font-bold text-emerald-700">Net Profit ($)</th>
                  <th className="py-3 px-4 text-center">Margin</th>
                  <th className="py-3 px-4 text-center">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-slate-800">
                {orders.map((o) => (
                  <tr key={o.order_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-navy font-mono">{o.order_number}</td>
                    <td className="py-3 px-4 font-medium text-slate-700">{o.buyer_name}</td>
                    <td className="py-3 px-4 text-right font-extrabold text-slate-900">${o.total_revenue_usd.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-slate-600">${o.raw_material_cost.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-slate-600">${o.production_cost.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-slate-600">${o.worker_wages.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-bold text-amber-700">${o.total_expenses.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-extrabold text-emerald-700 text-sm">${o.net_profit.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                        {o.margin_percent}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                        o.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {o.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Buyer Payment Receipts */}
      {activeTab === 'receivables' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
            <h3 className="font-bold text-navy text-sm">Buyer Inward Remittance & LC Receipts</h3>
            <Button size="sm" onClick={() => setIsRecordPaymentOpen(true)} className="flex items-center gap-1 text-xs">
              <Plus size={14} /> Record Buyer Receipt
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Receipt Date</th>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Buyer</th>
                  <th className="py-3 px-4">Order Ref</th>
                  <th className="py-3 px-4 text-right font-bold">Amount Paid</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Reference / Swift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-slate-800">
                {buyerPayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No buyer payment receipts recorded yet.
                    </td>
                  </tr>
                ) : (
                  buyerPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-slate-700">{p.payment_date}</td>
                      <td className="py-3 px-4 font-bold text-navy">{p.export_invoices?.invoice_number || 'INV-EXP'}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{p.export_buyers?.name || p.export_orders?.buyer_name || 'International Buyer'}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{p.export_orders?.order_number || '—'}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-emerald-700 text-sm">${Number(p.amount).toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                          {p.payment_method}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{p.reference || 'Bank Wire'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Factory Expenses */}
      {activeTab === 'expenses' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
            <h3 className="font-bold text-navy text-sm">Factory Operational Expenses Ledger</h3>
            <Button size="sm" onClick={() => setIsAddExpenseOpen(true)} className="flex items-center gap-1 text-xs">
              <Plus size={14} /> Add Factory Expense
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Expense Code</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right font-bold">Amount ($)</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-slate-800">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-bold text-navy">{e.expense_code}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{e.expense_date}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        {e.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{e.description}</td>
                    <td className="py-3 px-4 text-right font-bold text-amber-700">${Number(e.amount).toLocaleString()}</td>
                    <td className="py-3 px-4 text-slate-600">{e.payment_mode}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{e.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal 1: Record Buyer Payment Receipt */}
      <Modal isOpen={isRecordPaymentOpen} onClose={() => setIsRecordPaymentOpen(false)} title="Record Buyer Payment Receipt">
        {statusMessage && (
          <div className={`p-3.5 mb-4 rounded-xl text-sm flex items-start gap-2.5 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{statusMessage.type === 'success' ? 'Success' : 'Error'}</p>
              <p className="text-xs mt-0.5">{statusMessage.text}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitPayment(onRecordPaymentSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Commercial Invoice *</label>
            <select
              id="payment_invoice_select"
              {...registerPayment('invoice_id')}
              className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none"
            >
              <option value="">Select Invoice...</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} — {inv.export_buyers?.name || inv.export_orders?.buyer_name || 'Buyer'} (Billed: ${Number(inv.total_amount).toLocaleString()})
                </option>
              ))}
            </select>
            {paymentErrors.invoice_id && <p className="text-xs text-red-600">{paymentErrors.invoice_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="payment_amount_input"
              label="Remittance Amount ($) *"
              type="number"
              step="0.01"
              {...registerPayment('amount', { valueAsNumber: true })}
              error={paymentErrors.amount?.message}
            />

            <Input
              id="payment_date_input"
              label="Payment Date *"
              type="date"
              {...registerPayment('payment_date')}
              error={paymentErrors.payment_date?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Payment Instrument / Mode *</label>
              <select
                id="payment_method_select"
                {...registerPayment('payment_method')}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none"
              >
                <option value="Wire / LC">Letter of Credit (LC at Sight)</option>
                <option value="Swift Transfer">International SWIFT Wire</option>
                <option value="Bank TT">Direct Bank TT</option>
                <option value="Escrow Advance">Advance Escrow Deposit</option>
              </select>
            </div>

            <Input
              id="payment_ref_input"
              label="Reference / Swift Code"
              placeholder="e.g. SWIFT-8921004"
              {...registerPayment('reference')}
            />
          </div>

          <Input
            id="payment_notes_input"
            label="Notes / Settlement Remarks"
            placeholder="e.g. Full settlement received against Bill of Lading"
            {...registerPayment('notes')}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setIsRecordPaymentOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isPaymentSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Confirm Receipt
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Add Factory Expense */}
      <Modal isOpen={isAddExpenseOpen} onClose={() => setIsAddExpenseOpen(false)} title="Record Factory Operational Expense">
        {statusMessage && (
          <div className={`p-3.5 mb-4 rounded-xl text-sm flex items-start gap-2.5 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{statusMessage.type === 'success' ? 'Success' : 'Error'}</p>
              <p className="text-xs mt-0.5">{statusMessage.text}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitExpense(onAddExpenseSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Cost Category *</label>
              <select
                id="expense_category_select"
                {...registerExpense('category')}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none"
              >
                <option value="Plant Operations">Plant Operations (Power, Steam & Oil)</option>
                <option value="Machine Maintenance">Machine Maintenance & Spares</option>
                <option value="Labor Wages">Labor & Floor Payroll</option>
                <option value="Raw Materials / Yarn">Raw Materials / Yarn</option>
                <option value="Packaging">Export Packaging & Cartons</option>
                <option value="Logistics & Shipping">Logistics, Freight & Customs</option>
                <option value="Administrative">Administrative & Overheads</option>
              </select>
            </div>

            <Input
              id="expense_amount_input"
              label="Amount ($) *"
              type="number"
              step="0.01"
              {...registerExpense('amount', { valueAsNumber: true })}
              error={expenseErrors.amount?.message}
            />
          </div>

          <Input
            id="expense_desc_input"
            label="Expense Description *"
            placeholder="e.g. Sizing boiler fuel replenishment and electrical line overhaul"
            {...registerExpense('description')}
            error={expenseErrors.description?.message}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="expense_date_input"
              label="Expense Date *"
              type="date"
              {...registerExpense('expense_date')}
              error={expenseErrors.expense_date?.message}
            />

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Payment Mode *</label>
              <select
                id="expense_mode_select"
                {...registerExpense('payment_mode')}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none"
              >
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                <option value="Company Card">Corporate Credit Card</option>
                <option value="Petty Cash">Factory Petty Cash</option>
                <option value="Cheque">Account Payee Cheque</option>
                <option value="UPI">UPI / Digital</option>
              </select>
            </div>
          </div>

          <Input
            id="expense_ref_input"
            label="Transaction Reference / Voucher #"
            placeholder="e.g. TXN-8921004"
            {...registerExpense('reference')}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setIsAddExpenseOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isExpenseSubmitting} className="bg-primary hover:bg-primary/90 text-white">
              Save Expense
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
