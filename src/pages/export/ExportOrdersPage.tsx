import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { 
  Package, 
  Plus, 
  Search, 
  Calendar, 
  DollarSign, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Eye, 
  Edit3, 
  Trash2, 
  ShoppingBag,
  Sparkles,
  RefreshCw
} from 'lucide-react';

interface Buyer {
  id: string;
  name: string;
  country?: string;
  contact_person?: string;
  payment_terms?: string;
  email?: string;
}

interface ExportOrder {
  id: string;
  order_number: string;
  buyer_id?: string | null;
  buyer_name: string;
  status: 'draft' | 'open' | 'confirmed' | 'in_production' | 'qc_review' | 'completed' | 'shipped' | 'cancelled';
  fabric_type?: string;
  quantity?: number;
  unit?: string;
  yarn_requirement_kg?: number;
  unit_price?: number;
  currency?: string;
  total_amount?: number;
  target_completion_date?: string;
  notes?: string;
  created_at: string;
  export_buyers?: Buyer;
}

const todayStr = new Date().toISOString().split('T')[0];

const orderSchema = z.object({
  order_number: z.string().min(1, 'Order number is required'),
  buyer_id: z.string().min(1, 'Please select a buyer'),
  buyer_name: z.string().min(1, 'Buyer name is required'),
  fabric_type: z.string().min(1, 'Fabric / garment specification is required'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unit: z.string(),
  yarn_requirement_kg: z.number().positive('Yarn requirement must be greater than 0'),
  unit_price: z.number().positive('Unit price must be greater than 0'),
  currency: z.string(),
  total_amount: z.number().positive('Total amount must be greater than 0'),
  target_completion_date: z.string().min(1, 'Target completion date is required').refine(
    (val) => val >= todayStr,
    { message: 'Deadline cannot be in the past. Choose today or a future date.' }
  ),
  status: z.enum(['draft', 'open', 'confirmed', 'in_production', 'qc_review', 'completed', 'shipped', 'cancelled']),
  notes: z.string().optional(),
});

type OrderFormValues = z.infer<typeof orderSchema>;

export default function ExportOrdersPage() {
  const [orders, setOrders] = useState<ExportOrder[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ExportOrder | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { 
    register, 
    handleSubmit, 
    reset, 
    setValue, 
    watch,
    formState: { errors, isSubmitting } 
  } = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      order_number: `EXP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      status: 'confirmed',
      unit: 'meters',
      currency: 'USD',
      quantity: 5000,
      unit_price: 4.5,
      yarn_requirement_kg: 1100, // 5000 * 0.22
      total_amount: 22500, // 5000 * 4.5
      target_completion_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      fabric_type: '100% Combed Cotton Single Jersey 180 GSM',
    }
  });

  const watchedQuantity = watch('quantity');
  const watchedUnitPrice = watch('unit_price');
  const watchedBuyerId = watch('buyer_id');

  // Auto-calculate Yarn Requirement & Total Order Amount by default
  useEffect(() => {
    const qty = Number(watchedQuantity) || 0;
    const price = Number(watchedUnitPrice) || 0;
    
    // Default yarn requirement formula: 0.22 kg per meter of fabric
    if (qty > 0) {
      const estimatedYarnKg = Math.round(qty * 0.22 * 100) / 100;
      setValue('yarn_requirement_kg', estimatedYarnKg, { shouldValidate: true });
    }

    if (qty > 0 && price > 0) {
      const calculatedTotal = Math.round(qty * price * 100) / 100;
      setValue('total_amount', calculatedTotal, { shouldValidate: true });
    }
  }, [watchedQuantity, watchedUnitPrice, setValue]);

  // When buyer selection changes, default the buyer_name automatically
  useEffect(() => {
    if (watchedBuyerId) {
      const chosen = buyers.find(b => b.id === watchedBuyerId);
      if (chosen) {
        setValue('buyer_name', chosen.name, { shouldValidate: true });
      }
    }
  }, [watchedBuyerId, buyers, setValue]);

  const fetchData = async () => {
    try {
      setError(null);

      // 1. Fetch Buyers
      const { data: buyersData } = await supabase
        .from('export_buyers')
        .select('*')
        .order('name', { ascending: true });

      if (buyersData) {
        setBuyers(buyersData);
      }

      // 2. Fetch Orders
      const { data: ordersData, error: ordersErr } = await supabase
        .from('export_orders')
        .select('*, export_buyers(*)')
        .order('created_at', { ascending: false });

      if (ordersErr) throw ordersErr;
      setOrders(ordersData || []);

    } catch (err: any) {
      console.error('Error loading export orders:', err);
      setError(err.message || 'Failed to load orders.');
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

  // Open Create Modal with fresh auto-generated order number
  const handleOpenCreateModal = () => {
    setStatusMessage(null);
    const randomNum = Math.floor(100 + Math.random() * 900);
    const defaultBuyer = buyers[0];

    reset({
      order_number: `EXP-${new Date().getFullYear()}-${randomNum}`,
      buyer_id: defaultBuyer?.id || '',
      buyer_name: defaultBuyer?.name || '',
      fabric_type: '100% Combed Cotton Single Jersey 180 GSM',
      quantity: 5000,
      unit: 'meters',
      yarn_requirement_kg: 1100,
      unit_price: 4.5,
      currency: 'USD',
      total_amount: 22500,
      target_completion_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'confirmed',
      notes: '',
    });
    setIsCreateModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (order: ExportOrder) => {
    setStatusMessage(null);
    setSelectedOrder(order);
    reset({
      order_number: order.order_number,
      buyer_id: order.buyer_id || buyers[0]?.id || '',
      buyer_name: order.buyer_name || order.export_buyers?.name || '',
      fabric_type: order.fabric_type || '100% Combed Cotton Single Jersey 180 GSM',
      quantity: order.quantity || 5000,
      unit: order.unit || 'meters',
      yarn_requirement_kg: order.yarn_requirement_kg || 1100,
      unit_price: order.unit_price || 4.5,
      currency: order.currency || 'USD',
      total_amount: order.total_amount || 22500,
      target_completion_date: order.target_completion_date && order.target_completion_date >= todayStr 
        ? order.target_completion_date 
        : todayStr,
      status: order.status || 'open',
      notes: order.notes || '',
    });
    setIsEditModalOpen(true);
  };

  // Open View Modal
  const handleOpenViewModal = (order: ExportOrder) => {
    setSelectedOrder(order);
    setIsViewModalOpen(true);
  };

  // Create Order Submit Handler
  const onSubmitCreate = async (data: OrderFormValues) => {
    setStatusMessage(null);
    try {
      const buyerObj = buyers.find(b => b.id === data.buyer_id);
      const buyerName = buyerObj?.name || data.buyer_name;

      const { error: insertErr } = await supabase
        .from('export_orders')
        .insert([{
          order_number: data.order_number.trim(),
          buyer_id: data.buyer_id,
          buyer_name: buyerName,
          fabric_type: data.fabric_type.trim(),
          quantity: data.quantity,
          unit: data.unit,
          yarn_requirement_kg: data.yarn_requirement_kg,
          unit_price: data.unit_price,
          currency: data.currency,
          total_amount: data.total_amount,
          target_completion_date: data.target_completion_date,
          status: data.status,
          notes: data.notes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }])
        .select('*, export_buyers(*)')
        .single();

      if (insertErr) throw insertErr;

      setStatusMessage({ type: 'success', text: `Order ${data.order_number} created successfully!` });
      await fetchData();

      setTimeout(() => {
        setIsCreateModalOpen(false);
        setStatusMessage(null);
      }, 1200);

    } catch (err: any) {
      console.error('Error creating order:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to create export order.' });
    }
  };

  // Edit Order Submit Handler
  const onSubmitEdit = async (data: OrderFormValues) => {
    if (!selectedOrder) return;
    setStatusMessage(null);
    try {
      const buyerObj = buyers.find(b => b.id === data.buyer_id);
      const buyerName = buyerObj?.name || data.buyer_name;

      const { error: updateErr } = await supabase
        .from('export_orders')
        .update({
          order_number: data.order_number.trim(),
          buyer_id: data.buyer_id,
          buyer_name: buyerName,
          fabric_type: data.fabric_type.trim(),
          quantity: data.quantity,
          unit: data.unit,
          yarn_requirement_kg: data.yarn_requirement_kg,
          unit_price: data.unit_price,
          currency: data.currency,
          total_amount: data.total_amount,
          target_completion_date: data.target_completion_date,
          status: data.status,
          notes: data.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedOrder.id);

      if (updateErr) throw updateErr;

      setStatusMessage({ type: 'success', text: `Order ${data.order_number} updated successfully!` });
      await fetchData();

      setTimeout(() => {
        setIsEditModalOpen(false);
        setStatusMessage(null);
      }, 1200);

    } catch (err: any) {
      console.error('Error updating order:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update export order.' });
    }
  };

  // Delete Order Handler
  const handleDeleteOrder = async (orderId: string, orderNum: string) => {
    if (!window.confirm(`Are you sure you want to delete export order "${orderNum}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error: delErr } = await supabase
        .from('export_orders')
        .delete()
        .eq('id', orderId);

      if (delErr) throw delErr;

      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (selectedOrder?.id === orderId) {
        setIsViewModalOpen(false);
        setIsEditModalOpen(false);
      }
    } catch (err: any) {
      alert(`Could not delete order: ${err.message || 'It may be referenced by production records.'}`);
    }
  };

  // KPI Calculations
  const totalOrdersCount = orders.length;
  const activeOrdersCount = orders.filter(o => ['open', 'confirmed', 'in_production', 'qc_review'].includes(o.status)).length;
  const completedOrdersCount = orders.filter(o => ['completed', 'shipped'].includes(o.status)).length;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total_amount) || ((Number(o.quantity) || 0) * (Number(o.unit_price) || 4.5))), 0);

  // Filtering
  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.buyer_name && order.buyer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (order.export_buyers?.name && order.export_buyers.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (order.fabric_type && order.fabric_type.toLowerCase().includes(searchTerm.toLowerCase()));

    if (statusFilter === 'ACTIVE') {
      return matchesSearch && ['open', 'confirmed', 'in_production', 'qc_review'].includes(order.status);
    }
    if (statusFilter === 'COMPLETED') {
      return matchesSearch && ['completed', 'shipped'].includes(order.status);
    }
    if (statusFilter !== 'ALL') {
      return matchesSearch && order.status === statusFilter;
    }
    return matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
      case 'open':
        return <Badge variant="active" className="bg-blue-50 text-blue-700 border-blue-200">OPEN / CONFIRMED</Badge>;
      case 'in_production':
        return <Badge variant="active" className="bg-amber-50 text-amber-700 border-amber-200">IN PRODUCTION</Badge>;
      case 'qc_review':
        return <Badge variant="active" className="bg-purple-50 text-purple-700 border-purple-200">QC REVIEW</Badge>;
      case 'completed':
      case 'shipped':
        return <Badge variant="completed" className="bg-emerald-50 text-emerald-700 border-emerald-200">COMPLETED</Badge>;
      case 'cancelled':
        return <Badge variant="cancelled" className="bg-red-50 text-red-700 border-red-200">CANCELLED</Badge>;
      default:
        return <Badge variant="default">{status.toUpperCase()}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[400px]">
        <LoadingSpinner />
        <p className="text-secondary-text text-sm mt-3">Loading export orders & buyer specifications...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <ShoppingBag size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-navy">Export Order Management</h1>
              <p className="text-sm text-secondary-text">Track buyer purchase orders, yarn requirements, and delivery milestones.</p>
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
            className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white shadow-sm" 
            onClick={handleOpenCreateModal}
          >
            <Plus size={16} /> Create Order
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Total Orders</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{totalOrdersCount}</h3>
              <p className="text-xs text-secondary-text mt-1">Global buyer contracts</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText size={24} />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Active In-Flight</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{activeOrdersCount}</h3>
              <p className="text-xs text-secondary-text mt-1">Spinning & weaving floor</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock size={24} />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Completed / Dispatched</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">{completedOrdersCount}</h3>
              <p className="text-xs text-emerald-600 font-medium mt-1">Full shipments delivered</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Order Portfolio Value</p>
              <h3 className="text-2xl font-bold text-navy mt-1">${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
              <p className="text-xs text-emerald-600 font-medium mt-1">Commercial order bookings</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <DollarSign size={24} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table Card */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle className="text-lg text-navy">Export Orders Directory</CardTitle>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search order #, buyer, fabric..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-1.5 px-3 text-sm rounded-lg border border-border bg-white text-navy focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active (In Flight)</option>
                <option value="in_production">In Production</option>
                <option value="qc_review">QC Review</option>
                <option value="COMPLETED">Completed / Shipped</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200 text-error text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <EmptyState 
                title="No Orders Match Criteria" 
                description="Create a new export order or adjust your search filters."
                icon={Package}
              />
              <Button className="mt-4" size="sm" onClick={handleOpenCreateModal}>
                <Plus size={15} className="mr-1" /> Create First Order
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-bold">Order #</TableHead>
                  <TableHead className="font-bold">Buyer & Destination</TableHead>
                  <TableHead className="font-bold">Fabric Specification</TableHead>
                  <TableHead className="font-bold text-right">Order Quantity</TableHead>
                  <TableHead className="font-bold text-right">Yarn Required</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold">Delivery Deadline</TableHead>
                  <TableHead className="font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const buyerName = order.export_buyers?.name || order.buyer_name || 'Global Buyer';
                  const buyerCountry = order.export_buyers?.country;
                  const qty = Number(order.quantity) || 5000;
                  const unit = order.unit || 'm';
                  const yarnKg = Number(order.yarn_requirement_kg) || Math.round(qty * 0.22);

                  return (
                    <TableRow key={order.id} className="hover:bg-slate-50/60 transition-colors">
                      <TableCell className="font-bold text-navy font-mono text-xs">
                        {order.order_number}
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-navy">{buyerName}</div>
                        {buyerCountry && (
                          <div className="text-xs text-secondary-text">{buyerCountry}</div>
                        )}
                      </TableCell>

                      <TableCell className="text-xs text-slate-700 max-w-[200px] truncate">
                        {order.fabric_type || '100% Combed Cotton'}
                      </TableCell>

                      <TableCell className="text-right font-medium text-navy">
                        {qty.toLocaleString()} <span className="text-xs text-slate-400">{unit}</span>
                      </TableCell>

                      <TableCell className="text-right font-semibold text-emerald-700">
                        {yarnKg.toLocaleString()} <span className="text-xs text-slate-400">KG</span>
                      </TableCell>

                      <TableCell>
                        {getStatusBadge(order.status)}
                      </TableCell>

                      <TableCell className="text-xs font-medium text-slate-600">
                        {order.target_completion_date ? (
                          <span className="flex items-center gap-1 font-mono">
                            <Calendar size={12} className="text-slate-400" />
                            {order.target_completion_date}
                          </span>
                        ) : (
                          'N/A'
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => handleOpenViewModal(order)}
                            title="View Order Details"
                          >
                            <Eye size={13} className="mr-1" /> View
                          </Button>

                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8 px-2 text-xs border-slate-300 text-slate-700 hover:bg-slate-100"
                            onClick={() => handleOpenEditModal(order)}
                            title="Manage & Update Status"
                          >
                            <Edit3 size={13} className="mr-1" /> Manage
                          </Button>

                          <button 
                            type="button"
                            onClick={() => handleDeleteOrder(order.id, order.order_number)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                            title="Delete Order"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal 1: Create New Export Order */}
      <Modal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        title="Create New Export Order"
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
              <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{statusMessage.type === 'success' ? 'Success' : 'Error'}</p>
              <p className="text-xs mt-0.5">{statusMessage.text}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmitCreate)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input 
              label="Order Number *" 
              placeholder="e.g. EXP-2026-005"
              {...register('order_number')} 
              error={errors.order_number?.message} 
            />

            <div className="space-y-1">
              <label className="text-sm font-medium text-navy block">Export Buyer *</label>
              <select 
                {...register('buyer_id')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 transition-colors"
              >
                <option value="">Select Buyer...</option>
                {buyers.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.country || 'Global'})
                  </option>
                ))}
              </select>
              {errors.buyer_id && <p className="text-error text-xs">{errors.buyer_id.message}</p>}
            </div>
          </div>

          <Input 
            label="Fabric / Garment Construction *" 
            placeholder="e.g. 100% Combed Cotton Single Jersey 180 GSM"
            {...register('fabric_type')} 
            error={errors.fabric_type?.message} 
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Input 
                label="Order Quantity *" 
                type="number" 
                step="1"
                placeholder="5000"
                {...register('quantity', { valueAsNumber: true })} 
                error={errors.quantity?.message} 
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-navy block">Unit</label>
              <select 
                {...register('unit')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="meters">Meters (m)</option>
                <option value="pieces">Pieces (pcs)</option>
                <option value="rolls">Rolls</option>
                <option value="kg">Kilograms (kg)</option>
              </select>
            </div>
          </div>

          {/* Auto-calculated Default Yarn Requirement */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold">
              <span className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-emerald-600" />
                Default Yarn Requirement (Auto-calculated: ~0.22 KG / meter)
              </span>
            </div>

            <Input 
              label="Allocated Yarn Requirement (KG) *" 
              type="number"
              step="0.01"
              {...register('yarn_requirement_kg', { valueAsNumber: true })} 
              error={errors.yarn_requirement_kg?.message} 
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input 
              label="Unit Price ($) *" 
              type="number"
              step="0.01"
              placeholder="4.50"
              {...register('unit_price', { valueAsNumber: true })} 
              error={errors.unit_price?.message} 
            />

            <div className="space-y-1">
              <label className="text-sm font-medium text-navy block">Currency</label>
              <select 
                {...register('currency')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
              </select>
            </div>

            <Input 
              label="Total Order Value *" 
              type="number"
              step="0.01"
              {...register('total_amount', { valueAsNumber: true })} 
              error={errors.total_amount?.message} 
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input 
              label="Target Completion Date *" 
              type="date"
              min={todayStr}
              {...register('target_completion_date')} 
              error={errors.target_completion_date?.message} 
            />

            <div className="space-y-1">
              <label className="text-sm font-medium text-navy block">Initial Status</label>
              <select 
                {...register('status')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="confirmed">Confirmed</option>
                <option value="open">Open</option>
                <option value="in_production">In Production</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <Input 
            label="Special Production Instructions / Notes" 
            placeholder="e.g. Export 4-point QC standard, custom packing"
            {...register('notes')} 
          />

          <div className="pt-4 flex justify-end gap-2.5 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} className="bg-primary hover:bg-primary/90 text-white">
              Create Order
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Manage / Edit Export Order */}
      <Modal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        title={`Manage Order: ${selectedOrder?.order_number || ''}`}
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
              <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{statusMessage.type === 'success' ? 'Success' : 'Error'}</p>
              <p className="text-xs mt-0.5">{statusMessage.text}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmitEdit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input 
              label="Order Number *" 
              {...register('order_number')} 
              error={errors.order_number?.message} 
            />

            <div className="space-y-1">
              <label className="text-sm font-medium text-navy block">Export Buyer *</label>
              <select 
                {...register('buyer_id')}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {buyers.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.country || 'Global'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-navy block">Order Status *</label>
            <select 
              {...register('status')}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="open">Open (Awaiting Production)</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_production">In Production</option>
              <option value="qc_review">QC Review & Inspection</option>
              <option value="completed">Completed (Ready for Dispatch)</option>
              <option value="shipped">Shipped & Invoiced</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <Input 
            label="Fabric / Garment Construction *" 
            {...register('fabric_type')} 
            error={errors.fabric_type?.message} 
          />

          <div className="grid grid-cols-2 gap-3">
            <Input 
              label="Order Quantity" 
              type="number"
              step="1"
              {...register('quantity', { valueAsNumber: true })} 
              error={errors.quantity?.message} 
            />

            <Input 
              label="Yarn Requirement (KG)" 
              type="number"
              step="0.01"
              {...register('yarn_requirement_kg', { valueAsNumber: true })} 
              error={errors.yarn_requirement_kg?.message} 
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input 
              label="Target Completion Date *" 
              type="date"
              min={todayStr}
              {...register('target_completion_date')} 
              error={errors.target_completion_date?.message} 
            />

            <Input 
              label="Total Amount ($)" 
              type="number"
              step="0.01"
              {...register('total_amount', { valueAsNumber: true })} 
            />
          </div>

          <Input 
            label="Notes & Remarks" 
            {...register('notes')} 
          />

          <div className="pt-4 flex justify-between items-center border-t border-border">
            <button
              type="button"
              onClick={() => selectedOrder && handleDeleteOrder(selectedOrder.id, selectedOrder.order_number)}
              className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
            >
              <Trash2 size={14} /> Delete Order
            </button>

            <div className="flex gap-2.5">
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting} className="bg-primary hover:bg-primary/90 text-white">
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal 3: View Full Order Details */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title={`Order Details: ${selectedOrder?.order_number || ''}`}
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
              <div>
                <span className="text-xs uppercase font-semibold text-secondary-text">Buyer</span>
                <h3 className="text-lg font-bold text-navy">{selectedOrder.export_buyers?.name || selectedOrder.buyer_name}</h3>
                <p className="text-xs text-slate-500">{selectedOrder.export_buyers?.country || 'International Export'}</p>
              </div>
              <div className="text-right">
                <span className="text-xs uppercase font-semibold text-secondary-text">Current Status</span>
                <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-white rounded-lg border border-border">
                <span className="text-xs text-secondary-text block">Fabric Specification</span>
                <span className="font-semibold text-navy">{selectedOrder.fabric_type || '100% Combed Cotton'}</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-border">
                <span className="text-xs text-secondary-text block">Order Quantity</span>
                <span className="font-bold text-navy">{Number(selectedOrder.quantity || 5000).toLocaleString()} {selectedOrder.unit || 'm'}</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-border">
                <span className="text-xs text-secondary-text block">Yarn Requirement</span>
                <span className="font-bold text-emerald-700">{Number(selectedOrder.yarn_requirement_kg || 1100).toLocaleString()} KG</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-border">
                <span className="text-xs text-secondary-text block">Target Delivery Date</span>
                <span className="font-bold text-navy">{selectedOrder.target_completion_date || 'N/A'}</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-border">
                <span className="text-xs text-secondary-text block">Total Contract Value</span>
                <span className="font-bold text-emerald-700">${Number(selectedOrder.total_amount || 22500).toLocaleString()}</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-border">
                <span className="text-xs text-secondary-text block">Payment Terms</span>
                <span className="font-medium text-navy">{selectedOrder.export_buyers?.payment_terms || 'LC at Sight / Net 30'}</span>
              </div>
            </div>

            {selectedOrder.notes && (
              <div className="p-3 bg-slate-50 rounded-lg text-xs text-secondary-text">
                <strong className="text-navy">Notes:</strong> {selectedOrder.notes}
              </div>
            )}

            <div className="pt-4 flex justify-end gap-2 border-t border-border">
              <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
              <Button 
                onClick={() => {
                  setIsViewModalOpen(false);
                  handleOpenEditModal(selectedOrder);
                }}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                <Edit3 size={14} className="mr-1.5" /> Edit Order
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
