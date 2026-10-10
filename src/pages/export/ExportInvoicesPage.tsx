import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Plus, Search, FileText, Printer, CheckCircle2, AlertCircle, DollarSign } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface ExportInvoice {
  id: string;
  order_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  currency: string;
  notes?: string;
  created_at: string;
  export_orders?: { order_number: string; buyer_name?: string };
}

const invoiceSchema = z.object({
  order_id: z.string().min(1, 'Export order is required'),
  invoice_number: z.string().min(1, 'Invoice number is required'),
  issue_date: z.string().min(1, 'Issue date is required'),
  due_date: z.string().min(1, 'Due date is required'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unit_price: z.number().positive('Unit price must be greater than 0'),
  tax_rate_percent: z.number().min(0, 'Tax rate cannot be negative'),
  currency: z.string().min(1),
  notes: z.string().optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export default function ExportInvoicesPage() {
  const [invoices, setInvoices] = useState<ExportInvoice[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<ExportInvoice | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_number: `INV-EXP-${Math.floor(100000 + Math.random() * 900000)}`,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      quantity: 1000,
      unit_price: 4.50,
      tax_rate_percent: 0,
      currency: 'USD',
    },
  });

  const watchedOrderId = watch('order_id');

  // Auto-default invoice quantity, unit price & currency when order is selected
  useEffect(() => {
    if (watchedOrderId) {
      const matchedOrder = orders.find(o => o.id === watchedOrderId);
      if (matchedOrder) {
        if (matchedOrder.quantity) {
          setValue('quantity', Number(matchedOrder.quantity));
        }
        if (matchedOrder.unit_price) {
          setValue('unit_price', Number(matchedOrder.unit_price));
        }
        if (matchedOrder.currency) {
          setValue('currency', matchedOrder.currency);
        }
      }
    }
  }, [watchedOrderId, orders, setValue]);

  const watchQty = watch('quantity') || 0;
  const watchPrice = watch('unit_price') || 0;
  const watchTaxRate = watch('tax_rate_percent') || 0;
  const calculatedSubtotal = Number((watchQty * watchPrice).toFixed(2));
  const calculatedTax = Number(((calculatedSubtotal * watchTaxRate) / 100).toFixed(2));
  const calculatedTotal = Number((calculatedSubtotal + calculatedTax).toFixed(2));

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Invoices
      const { data: iData, error: iErr } = await supabase
        .from('export_invoices')
        .select(`
          *,
          export_orders ( order_number, buyer_name )
        `)
        .order('issue_date', { ascending: false });

      if (iErr) throw iErr;
      setInvoices((iData as any) || []);

      // 2. Fetch Orders with pricing and quantity details
      const { data: oData, error: oErr } = await supabase
        .from('export_orders')
        .select('id, order_number, buyer_name, quantity, unit_price, currency')
        .order('created_at', { ascending: false });

      if (oErr) throw oErr;
      setOrders(oData || []);
    } catch (err: any) {
      console.error('Error fetching invoices:', err);
      setErrorMessage(err.message || 'Failed to load invoices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    reset({
      invoice_number: `INV-EXP-${Math.floor(100000 + Math.random() * 900000)}`,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      quantity: 1000,
      unit_price: 4.50,
      tax_rate_percent: 0,
      currency: 'USD',
      notes: 'Payment terms: Net 30 days via Wire Transfer (TT).',
    });
    setErrorMessage(null);
    setIsCreateModalOpen(true);
  };

  const onSaveInvoice = async (data: InvoiceFormValues) => {
    setErrorMessage(null);
    try {
      const subtotal = Number((data.quantity * data.unit_price).toFixed(2));
      const tax_amount = Number(((subtotal * data.tax_rate_percent) / 100).toFixed(2));
      const total_amount = Number((subtotal + tax_amount).toFixed(2));

      const payload = {
        order_id: data.order_id,
        invoice_number: data.invoice_number,
        issue_date: data.issue_date,
        due_date: data.due_date,
        subtotal,
        tax_amount,
        total_amount,
        currency: data.currency,
        status: 'unpaid',
        notes: data.notes || null,
      };

      const { error } = await supabase.from('export_invoices').insert([payload]);
      if (error) throw error;

      setSuccessMessage(`Commercial Invoice ${data.invoice_number} created successfully.`);
      setIsCreateModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error generating invoice.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredInvoices = invoices.filter(inv => {
    const num = inv.invoice_number?.toLowerCase() || '';
    const buyer = inv.export_orders?.buyer_name?.toLowerCase() || '';
    const orderNum = inv.export_orders?.order_number?.toLowerCase() || '';
    const matchSearch = num.includes(searchTerm.toLowerCase()) || 
      buyer.includes(searchTerm.toLowerCase()) ||
      orderNum.includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalInvoicedUSD = invoices.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);
  const paidCount = invoices.filter(i => i.status === 'paid').length;
  const unpaidCount = invoices.filter(i => i.status !== 'paid').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <FileText className="text-primary" /> Commercial Invoicing & Billing
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Generate export billing documents, track payment due dates, and export commercial invoices.
          </p>
        </div>
        <Button onClick={openCreateModal} className="flex items-center gap-2">
          <Plus size={16} /> Generate Invoice
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Total Invoiced</p>
              <h3 className="text-2xl font-bold text-navy mt-1">${totalInvoicedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
              <p className="text-xs text-secondary-text mt-0.5">Commercial Receivables</p>
            </div>
            <div className="p-3 bg-soft-mint rounded-xl text-primary"><DollarSign size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Settled Invoices</p>
              <h3 className="text-2xl font-bold text-success mt-1">{paidCount}</h3>
              <p className="text-xs text-secondary-text mt-0.5">Paid In Full</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><CheckCircle2 size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Pending Settlement</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{unpaidCount}</h3>
              <p className="text-xs text-secondary-text mt-0.5">Awaiting Payment</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl text-amber-600"><FileText size={22} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices Table Card */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text" size={16} />
              <input
                type="text"
                placeholder="Search by invoice, buyer, order..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-9 pl-9 pr-4 rounded-lg border border-border text-sm outline-none focus:border-primary transition-all bg-soft-mint/20"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="h-9 px-3 border border-border rounded-lg text-sm bg-white text-navy outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center">
              <LoadingSpinner size={36} />
              <p className="mt-3 text-secondary-text text-sm">Loading invoices...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center text-secondary-text">
              <FileText size={48} className="mx-auto mb-3 opacity-30 text-primary" />
              <p className="font-semibold text-navy">No invoices found</p>
              <p className="text-sm mt-1">Generate an invoice linked to an active export order.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Export Order</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono font-bold text-primary">
                      {inv.invoice_number}
                    </TableCell>
                    <TableCell className="font-medium text-navy">
                      {inv.export_orders?.buyer_name || '—'}
                    </TableCell>
                    <TableCell className="font-semibold text-navy">
                      {inv.export_orders?.order_number || 'Order ' + inv.order_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm text-secondary-text">{inv.issue_date}</TableCell>
                    <TableCell className="text-sm text-secondary-text">{inv.due_date}</TableCell>
                    <TableCell className="font-bold text-navy">
                      ${Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase ${
                        inv.status === 'paid'
                          ? 'bg-green-50 text-success border border-green-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {inv.status || 'Unpaid'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setViewingInvoice(inv)} className="flex items-center gap-1.5 text-xs">
                        <Printer size={13} /> View & Print
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invoice Generator Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Generate Commercial Invoice"
      >
        <form onSubmit={handleSubmit(onSaveInvoice)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-navy">Export Order *</label>
            <select
              {...register('order_id')}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select Export Order</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>{o.order_number} — Buyer: {o.buyer_name}</option>
              ))}
            </select>
            {errors.order_id && <p className="text-error text-xs">{errors.order_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Invoice Number *"
              {...register('invoice_number')}
              error={errors.invoice_number?.message}
            />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-navy">Currency</label>
              <select
                {...register('currency')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Issue Date *"
              type="date"
              {...register('issue_date')}
              error={errors.issue_date?.message}
            />
            <Input
              label="Due Date *"
              type="date"
              {...register('due_date')}
              error={errors.due_date?.message}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Billed Qty (m) *"
              type="number"
              step="1"
              {...register('quantity', { valueAsNumber: true })}
              error={errors.quantity?.message}
            />
            <Input
              label="Unit Price ($) *"
              type="number"
              step="0.01"
              {...register('unit_price', { valueAsNumber: true })}
              error={errors.unit_price?.message}
            />
            <Input
              label="Tax Rate (%)"
              type="number"
              step="0.1"
              {...register('tax_rate_percent', { valueAsNumber: true })}
            />
          </div>

          {/* Realtime Calculation Summary */}
          <div className="p-4 bg-soft-mint/40 rounded-lg border border-light-mint space-y-1.5 text-sm">
            <div className="flex justify-between text-secondary-text">
              <span>Subtotal:</span>
              <span>${calculatedSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-secondary-text">
              <span>Tax / Duty ({watchTaxRate}%):</span>
              <span>${calculatedTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between font-bold text-navy text-base pt-1 border-t border-light-mint">
              <span>Total Invoice Amount:</span>
              <span className="text-primary">${calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <Input
            label="Payment & Bank Remarks"
            placeholder="Wire details: Bank of America, SWIFT: BOFAUS3N..."
            {...register('notes')}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Issue Commercial Invoice
            </Button>
          </div>
        </form>
      </Modal>

      {/* Printable Invoice Modal */}
      {viewingInvoice && (
        <Modal
          isOpen={Boolean(viewingInvoice)}
          onClose={() => setViewingInvoice(null)}
          title={`Commercial Invoice ${viewingInvoice.invoice_number}`}
        >
          <div id="printable-invoice" className="p-6 bg-white border border-border rounded-xl space-y-6 text-navy">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-border pb-6">
              <div>
                <div className="flex items-center gap-2">
                  <img 
                    src="/texora-icon.png" 
                    alt="Texora Logo" 
                    className="w-9 h-9 rounded-lg object-contain bg-white border border-slate-200 p-0.5" 
                  />
                  <span className="text-xl font-bold text-navy font-serif italic">TEXORA TEXTILE CORP</span>
                </div>
                <p className="text-xs text-secondary-text mt-1">Export Processing Zone, Global Mill Gate</p>
                <p className="text-xs text-secondary-text">Email: exports@texora.com | GST/Tax: TX-9021884</p>
              </div>

              <div className="text-right">
                <span className="text-xs uppercase tracking-widest font-bold text-primary">Commercial Invoice</span>
                <h3 className="text-lg font-mono font-bold text-navy">{viewingInvoice.invoice_number}</h3>
                <p className="text-xs text-secondary-text">Date: {viewingInvoice.issue_date}</p>
                <p className="text-xs text-secondary-text">Due: {viewingInvoice.due_date}</p>
              </div>
            </div>

            {/* Bill To */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-soft-mint/20 rounded-lg border border-border">
                <span className="text-xs uppercase tracking-wider font-semibold text-secondary-text">Billed To (Buyer):</span>
                <p className="font-bold text-navy mt-1">{viewingInvoice.export_orders?.buyer_name || 'Direct Overseas Buyer'}</p>
                <p className="text-xs text-secondary-text">Reference Order: {viewingInvoice.export_orders?.order_number}</p>
              </div>
              <div className="p-3 bg-soft-mint/20 rounded-lg border border-border">
                <span className="text-xs uppercase tracking-wider font-semibold text-secondary-text">Payment Status:</span>
                <p className="font-bold uppercase text-primary mt-1">{viewingInvoice.status}</p>
                <p className="text-xs text-secondary-text">Currency: {viewingInvoice.currency || 'USD'}</p>
              </div>
            </div>

            {/* Line items summary */}
            <table className="w-full text-sm border-t border-b border-border">
              <thead>
                <tr className="bg-soft-mint/30 text-left text-xs font-semibold text-secondary-text">
                  <th className="p-2">Description</th>
                  <th className="p-2 text-right">Subtotal</th>
                  <th className="p-2 text-right">Tax</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 font-medium">Finished Export Fabric Consignment ({viewingInvoice.export_orders?.order_number})</td>
                  <td className="p-2 text-right">${Number(viewingInvoice.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right">${Number(viewingInvoice.tax_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right font-bold text-primary">${Number(viewingInvoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>

            {/* Notes */}
            {viewingInvoice.notes && (
              <div className="p-3 bg-gray-50 rounded-lg text-xs text-secondary-text border border-gray-200">
                <span className="font-semibold text-navy">Payment Instructions: </span>
                {viewingInvoice.notes}
              </div>
            )}

            {/* Print action buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setViewingInvoice(null)}>
                Close
              </Button>
              <Button onClick={handlePrint} className="flex items-center gap-2">
                <Printer size={16} /> Print / Save PDF
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
