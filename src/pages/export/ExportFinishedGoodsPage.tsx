import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/Table';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { PackageCheck, Search, ArrowUpRight, AlertCircle, CheckCircle2, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FinishedGoodsItem {
  id: string;
  order_id: string;
  available_quantity: number;
  reserved_quantity: number;
  dispatched_quantity: number;
  unit: string;
  updated_at: string;
  export_orders?: { order_number: string; buyer_name?: string };
}

interface StockMovement {
  id: string;
  order_id: string;
  source_type: string;
  quantity: number;
  balance_after: number;
  notes?: string;
  created_at: string;
  export_orders?: { order_number: string };
}

export default function ExportFinishedGoodsPage() {
  const [finishedGoods, setFinishedGoods] = useState<FinishedGoodsItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'inventory' | 'movements'>('inventory');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Finished Goods
      const { data: fgData, error: fgErr } = await supabase
        .from('export_finished_goods')
        .select(`
          *,
          export_orders ( order_number, buyer_name )
        `)
        .order('updated_at', { ascending: false });

      if (fgErr) throw fgErr;
      setFinishedGoods((fgData as any) || []);

      // 2. Fetch Ledger movements
      try {
        const { data: mData } = await supabase
          .from('export_finished_goods_ledger')
          .select(`
            *,
            export_orders ( order_number )
          `)
          .order('created_at', { ascending: false })
          .limit(50);

        setMovements((mData as any) || []);
      } catch (_) {
        // Ledger might be empty or fallback
      }
    } catch (err: any) {
      console.error('Error fetching finished goods:', err);
      setErrorMessage(err.message || 'Failed to load finished goods inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredItems = finishedGoods.filter(item => {
    const orderNum = item.export_orders?.order_number?.toLowerCase() || '';
    const buyerName = item.export_orders?.buyer_name?.toLowerCase() || '';
    return orderNum.includes(searchTerm.toLowerCase()) || buyerName.includes(searchTerm.toLowerCase());
  });

  const totalAvailable = finishedGoods.reduce((acc, curr) => acc + Number(curr.available_quantity || 0), 0);
  const totalDispatched = finishedGoods.reduce((acc, curr) => acc + Number(curr.dispatched_quantity || 0), 0);
  const readyOrdersCount = finishedGoods.filter(i => Number(i.available_quantity) > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <PackageCheck className="text-primary" /> Finished Goods Inventory
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Audited fabric rolls ready for shipping, reserved stock, and dispatched quantities.
          </p>
        </div>
        <Button onClick={() => navigate('/export/dispatch')} className="flex items-center gap-2">
          <Truck size={16} /> Go to Dispatch
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Available Ready to Ship</p>
              <h3 className="text-2xl font-bold text-success mt-1">{totalAvailable.toLocaleString()} <span className="text-xs font-normal text-secondary-text">meters</span></h3>
              <p className="text-xs text-secondary-text mt-0.5">{readyOrdersCount} Orders in Stock</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><CheckCircle2 size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Total Dispatched</p>
              <h3 className="text-2xl font-bold text-primary mt-1">{totalDispatched.toLocaleString()} <span className="text-xs font-normal text-secondary-text">meters</span></h3>
              <p className="text-xs text-secondary-text mt-0.5">Shipped to Buyers</p>
            </div>
            <div className="p-3 bg-soft-mint rounded-xl text-primary"><Truck size={22} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Stock Health</p>
              <h3 className="text-2xl font-bold text-navy mt-1">100% Audited</h3>
              <p className="text-xs text-secondary-text mt-0.5">Direct QC Traceability</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><PackageCheck size={22} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-border gap-6">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'inventory'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary-text hover:text-navy'
          }`}
        >
          <PackageCheck size={16} /> Inventory by Order ({finishedGoods.length})
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'movements'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary-text hover:text-navy'
          }`}
        >
          <ArrowUpRight size={16} /> Stock Movement Ledger ({movements.length})
        </button>
      </div>

      {/* Tab 1: Current Stock */}
      {activeTab === 'inventory' && (
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text" size={16} />
              <input
                type="text"
                placeholder="Search by order or buyer..."
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
                <p className="mt-3 text-secondary-text text-sm">Loading inventory balances...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-12 text-center text-secondary-text">
                <PackageCheck size={48} className="mx-auto mb-3 opacity-30 text-primary" />
                <p className="font-semibold text-navy">No finished goods in stock</p>
                <p className="text-sm mt-1">Accepted fabric from QC inspections will automatically appear here.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Export Order</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Available (Ready to Ship)</TableHead>
                    <TableHead>Dispatched</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const avail = Number(item.available_quantity || 0);
                    const disp = Number(item.dispatched_quantity || 0);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-bold text-navy">
                            {item.export_orders?.order_number || 'Order ' + item.order_id.slice(0, 8)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-navy">{item.export_orders?.buyer_name || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-base font-bold text-success">
                            {avail.toLocaleString()} {item.unit || 'meters'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-semibold text-navy">{disp.toLocaleString()} {item.unit || 'meters'}</span>
                        </TableCell>
                        <TableCell>
                          {avail > 0 ? (
                            <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Ready for Dispatch
                            </span>
                          ) : (
                            <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-700">
                              Dispatched / Zero Stock
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {avail > 0 && (
                            <Button size="sm" variant="primary" onClick={() => navigate('/export/dispatch')} className="text-xs">
                              Dispatch Stock
                            </Button>
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
      )}

      {/* Tab 2: Stock Ledger */}
      {activeTab === 'movements' && (
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <h3 className="font-bold text-navy">Authoritative Finished Goods Ledger</h3>
          </CardHeader>
          <CardContent className="p-0">
            {movements.length === 0 ? (
              <div className="p-12 text-center text-secondary-text">
                <ArrowUpRight size={48} className="mx-auto mb-3 opacity-30 text-primary" />
                <p className="font-semibold text-navy">No movement transactions yet</p>
                <p className="text-sm mt-1">QC receipts and dispatch deductions will be permanently logged here.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Export Order</TableHead>
                    <TableHead>Movement Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Balance After</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => {
                    const isPositive = Number(m.quantity) > 0;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-secondary-text">
                          {new Date(m.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-semibold text-navy">
                          {m.export_orders?.order_number || 'Order ' + m.order_id.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                            m.source_type === 'INSPECTION_RECEIPT'
                              ? 'bg-green-50 text-success'
                              : 'bg-blue-50 text-blue-700'
                          }`}>
                            {m.source_type}
                          </span>
                        </TableCell>
                        <TableCell className={`font-bold ${isPositive ? 'text-success' : 'text-error'}`}>
                          {isPositive ? `+${Number(m.quantity).toLocaleString()}` : Number(m.quantity).toLocaleString()} m
                        </TableCell>
                        <TableCell className="font-semibold text-navy">
                          {Number(m.balance_after).toLocaleString()} m
                        </TableCell>
                        <TableCell className="text-xs text-secondary-text">{m.notes || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
