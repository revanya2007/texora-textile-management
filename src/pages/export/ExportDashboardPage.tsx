import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { 
  Factory, 
  ShieldCheck, 
  DollarSign, 
  TrendingUp, 
  ArrowRight,
  Package,
  FileText,
  Users,
  Scissors,
  Truck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell
} from 'recharts';

export default function ExportDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [productionStats, setProductionStats] = useState<any[]>([]);
  const [qcStats, setQcStats] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    yarnStockKg: 17700,
    activeOrders: 4,
    totalOutputMeters: 11010,
    acceptanceRate: 98.3,
    buyersCount: 4,
    finishedGoodsAvailable: 41000,
    dispatchesCount: 2,
    totalInvoicedUSD: 70000,
    workersCount: 6,
    presentWorkersToday: 4,
    activeMachines: 3,
    totalMachines: 4,
  });

  const navigate = useNavigate();

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Orders Count
      const { data: orders } = await supabase.from('export_orders').select('id, status');
      const activeOrdersCount = (orders || []).filter(o => o.status !== 'closed' && o.status !== 'cancelled').length;

      // 2. Fetch Yarn Stock
      const { data: yarn } = await supabase.from('export_yarn_inventory').select('quantity_kg');
      const totalYarn = (yarn || []).reduce((acc, curr) => acc + Number(curr.quantity_kg || 0), 0);

      // 3. Fetch Production Runs
      const { data: production } = await supabase
        .from('export_production')
        .select('production_date, planned_quantity, actual_quantity, shift')
        .order('production_date', { ascending: true })
        .limit(10);

      const prodChart = (production || []).map(p => ({
        date: p.production_date.slice(5),
        Planned: Number(p.planned_quantity || 0),
        Actual: Number(p.actual_quantity || 0),
      }));
      setProductionStats(prodChart.length > 0 ? prodChart : [
        { date: '10-07', Planned: 5000, Actual: 4980 },
        { date: '10-08', Planned: 4500, Actual: 4540 },
        { date: '10-09', Planned: 5500, Actual: 5490 },
      ]);

      const totalOutput = (production || []).reduce((acc, curr) => acc + Number(curr.actual_quantity || 0), 0);

      // 4. Fetch Quality Inspections
      const { data: qc } = await supabase
        .from('export_quality_inspections')
        .select('inspected_quantity, accepted_quantity, rejected_quantity');

      const totalInspected = (qc || []).reduce((acc, curr) => acc + Number(curr.inspected_quantity || 0), 0);
      const totalAccepted = (qc || []).reduce((acc, curr) => acc + Number(curr.accepted_quantity || 0), 0);
      const totalRejected = (qc || []).reduce((acc, curr) => acc + Number(curr.rejected_quantity || 0), 0);
      const rate = totalInspected > 0 ? Number(((totalAccepted / totalInspected) * 100).toFixed(1)) : 98.3;

      setQcStats([
        { name: 'Accepted (Grade A)', value: totalAccepted || 11700, color: '#26965D' },
        { name: 'Rejected (Defects)', value: totalRejected || 200, color: '#D94848' },
      ]);

      // 5. Fetch Finished Goods
      const { data: fg } = await supabase
        .from('export_finished_goods')
        .select('available_quantity');
      const totalAvailableFG = (fg || []).reduce((acc, curr) => acc + Number(curr.available_quantity || 0), 0);

      // 6. Fetch Invoices
      const { data: invoices } = await supabase
        .from('export_invoices')
        .select('total_amount');
      const totalInvoiced = (invoices || []).reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);

      // 7. Fetch Machines
      const { data: machines } = await supabase.from('export_machines').select('id, status');
      const totalMach = (machines || []).length || 4;
      const activeMach = (machines || []).filter(m => m.status === 'active').length || 3;

      setSummary({
        yarnStockKg: totalYarn || 17700,
        activeOrders: activeOrdersCount || 4,
        totalOutputMeters: totalOutput || 11010,
        acceptanceRate: rate,
        buyersCount: 4,
        finishedGoodsAvailable: totalAvailableFG || 41000,
        dispatchesCount: 2,
        totalInvoicedUSD: totalInvoiced || 70000,
        workersCount: 6,
        presentWorkersToday: 4,
        activeMachines: activeMach,
        totalMachines: totalMach,
      });

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center">
        <LoadingSpinner size={48} />
        <p className="mt-4 text-slate-500 font-medium">Aggregating export plant metrics...</p>
      </div>
    );
  }

  // Export Modules Configuration
  const exportModules = [
    {
      title: 'Raw Material / Yarn',
      subtitle: 'Yarn receipt, lot codes, color specs & stock allocation',
      stats: `${summary.yarnStockKg.toLocaleString()} kg In Stock`,
      icon: Package,
      path: '/export/materials',
      badge: '4 Lots Active'
    },
    {
      title: 'Order Management',
      subtitle: 'Export contracts, buyer specs, deadlines & milestones',
      stats: `${summary.activeOrders} Active Orders`,
      icon: FileText,
      path: '/export/orders',
      badge: 'On Schedule'
    },
    {
      title: 'Production & Machines',
      subtitle: 'Spinning, weaving, dyeing & loom machine assignments',
      stats: `${summary.activeMachines}/${summary.totalMachines} Looms Running`,
      icon: Factory,
      path: '/export/production',
      badge: `${summary.totalOutputMeters.toLocaleString()} m/pcs output`
    },
    {
      title: 'Quality Management',
      subtitle: '4-Point inspection, passed/reject counts & trace',
      stats: `${summary.acceptanceRate}% QC Pass Rate`,
      icon: ShieldCheck,
      path: '/export/quality',
      badge: 'Grade A Standard'
    },
    {
      title: 'Customer Management',
      subtitle: 'Global buyer profiles, foreign contracts & order history',
      stats: `${summary.buyersCount} Global Buyers`,
      icon: Users,
      path: '/export/buyers',
      badge: 'EU / UK Accounts'
    },
    {
      title: 'Dispatch Management',
      subtitle: 'Finished goods stock ledger, logistics & shipment status',
      stats: `${summary.finishedGoodsAvailable.toLocaleString()} FG in Warehouse`,
      icon: Truck,
      path: '/export/dispatch',
      badge: `${summary.dispatchesCount} Shipments Active`
    },
    {
      title: 'Cost & Accounts',
      subtitle: 'Raw material bills, plant overheads, wages & order margins',
      stats: `$${summary.totalInvoicedUSD.toLocaleString()} Invoiced Total`,
      icon: DollarSign,
      path: '/export/accounts',
      badge: '28.5% Avg Margin'
    },
    {
      title: 'Worker Attendance & Wages',
      subtitle: 'Daily floor roster, shifts, overtime & wage calculation',
      stats: `${summary.presentWorkersToday}/${summary.workersCount} Workers Present`,
      icon: Users,
      path: '/export/workers',
      badge: 'Roster Active'
    },
    {
      title: 'Garmenting',
      subtitle: 'Laying spreads, pattern cutting, sewing lines & piece tally',
      stats: '40,000 Pcs in Sewing Pipeline',
      icon: Scissors,
      path: '/export/garmenting',
      badge: 'Cutting & Stitching'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 w-fit mb-2">
            <span>Texora Industrial ERP</span> • <span>Export Operations Command</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            From Yarn to Delivery, All in One
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Complete synchronized textile manufacturing pipeline covering all operational export modules.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="text-right hidden md:block">
            <div className="text-xs font-semibold text-slate-900">Plant Status: Operational</div>
            <div className="text-[11px] text-emerald-600 font-medium">Morning Shift (08:00 - 16:00)</div>
          </div>
          <Button onClick={() => navigate('/export/production')} className="bg-emerald-600 hover:bg-emerald-700 text-xs">
            Floor Monitor <ArrowRight size={14} className="ml-1" />
          </Button>
        </div>
      </div>

      {/* Master Matrix Grid */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Export Operations Pipeline
          </h2>
          <span className="text-xs text-slate-400 font-medium">Click any module card to drill down</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {exportModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.title}
                onClick={() => navigate(mod.path)}
                className="group relative bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-emerald-50 text-slate-700 group-hover:text-emerald-700 flex items-center justify-center font-bold text-sm transition-colors border border-slate-200">
                      <Icon size={20} />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 group-hover:bg-emerald-50 group-hover:text-emerald-800 px-2 py-0.5 rounded-full border border-slate-200">
                      {mod.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {mod.subtitle}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{mod.stats}</span>
                  <span className="text-xs font-semibold text-emerald-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    Open <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual Charts: Production Output & QC Inspection Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
        {/* Production Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-600" /> Planned vs. Actual Daily Output (Meters / Pieces)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productionStats} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="date" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', borderColor: '#DCE8DE', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                  <Bar dataKey="Planned" fill="#CDE8D0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Actual" fill="#26965D" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Quality Donut Chart */}
        <Card>
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-600" /> 4-Point QC Inspection Yield
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex flex-col items-center justify-center">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={qcStats}
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {qcStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', borderColor: '#DCE8DE', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 text-xs mt-2">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <span className="w-2.5 h-2.5 rounded-full bg-[#26965D]"></span> Accepted (Grade A)
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D94848]"></span> Rejected
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

