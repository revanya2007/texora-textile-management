import { useState } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  Receipt, 
  ArrowUpRight, 
  FileText
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

interface OrderProfitability {
  order_number: string;
  buyer_name: string;
  total_revenue_usd: number;
  raw_material_cost: number;
  production_cost: number;
  worker_wages: number;
  shipping_overhead: number;
  net_profit: number;
  margin_percent: number;
  payment_status: 'fully_paid' | 'partial' | 'pending';
}

const mockOrderProfitability: OrderProfitability[] = [
  {
    order_number: 'EXP-2026-001',
    buyer_name: 'Inditex / Zara Group',
    total_revenue_usd: 28000,
    raw_material_cost: 11200,
    production_cost: 4500,
    worker_wages: 2800,
    shipping_overhead: 1500,
    net_profit: 8000,
    margin_percent: 28.5,
    payment_status: 'pending'
  },
  {
    order_number: 'EXP-2026-002',
    buyer_name: 'H&M Hennes & Mauritz AB',
    total_revenue_usd: 42000,
    raw_material_cost: 18500,
    production_cost: 6200,
    worker_wages: 4100,
    shipping_overhead: 2200,
    net_profit: 11000,
    margin_percent: 26.2,
    payment_status: 'fully_paid'
  },
  {
    order_number: 'EXP-2026-003',
    buyer_name: 'Marks & Spencer plc',
    total_revenue_usd: 35000,
    raw_material_cost: 14000,
    production_cost: 5100,
    worker_wages: 3200,
    shipping_overhead: 1700,
    net_profit: 11000,
    margin_percent: 31.4,
    payment_status: 'partial'
  }
];

export default function ExportAccountsPage() {
  const [orders] = useState<OrderProfitability[]>(mockOrderProfitability);

  const totalRevenue = orders.reduce((acc, curr) => acc + curr.total_revenue_usd, 0);
  const totalYarnCost = orders.reduce((acc, curr) => acc + curr.raw_material_cost, 0);
  const totalWages = orders.reduce((acc, curr) => acc + curr.worker_wages, 0);
  const totalNetProfit = orders.reduce((acc, curr) => acc + curr.net_profit, 0);
  const avgMargin = (totalNetProfit / totalRevenue * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <DollarSign className="text-emerald-600 h-6 w-6" />
            Cost & Accounts Management (Profitability & Ledger)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Reconcile raw material bills, loom operating expenses, wage accruals, buyer receivables, and order margins.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
            <FileText size={13} className="mr-1" /> Export Financial P&L
          </Button>
        </div>
      </div>

      {/* High-Level Financial Snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Export Revenue</span>
            <ArrowUpRight size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">${totalRevenue.toLocaleString()}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Active order contracts</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Raw Material Bills</span>
            <Receipt size={16} className="text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">${totalYarnCost.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Yarn & chemical procurement</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Worker Wages</span>
            <CreditCard size={16} className="text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">${totalWages.toLocaleString()}</div>
          <div className="text-[11px] text-blue-600 mt-0.5">Direct plant labor costs</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Estimated Net Profit</span>
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">${totalNetProfit.toLocaleString()}</div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">Avg Margin: {avgMargin}%</div>
        </div>
      </div>

      {/* Order-wise Cost & Profitability Matrix */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Order-wise Cost & Profit Analysis</h3>
            <p className="text-xs text-slate-500">Breakdown of gross value, material inputs, labor, logistics, and calculated gross margin</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Order & Buyer</th>
                <th className="py-3 px-4 text-right">Invoice Total</th>
                <th className="py-3 px-4 text-right">Yarn Cost</th>
                <th className="py-3 px-4 text-right">Plant Operations</th>
                <th className="py-3 px-4 text-right">Labor Wages</th>
                <th className="py-3 px-4 text-right">Net Profit</th>
                <th className="py-3 px-4 text-right">Margin %</th>
                <th className="py-3 px-4 text-center">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 text-slate-800">
              {orders.map((o) => (
                <tr key={o.order_number} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{o.order_number}</div>
                    <div className="text-slate-500 text-[11px]">{o.buyer_name}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-900">${o.total_revenue_usd.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-slate-600">${o.raw_material_cost.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-slate-600">${o.production_cost.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-slate-600">${o.worker_wages.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-700">${o.net_profit.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {o.margin_percent}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant={
                      o.payment_status === 'fully_paid' ? 'active' :
                      o.payment_status === 'partial' ? 'pending' : 'default'
                    }>
                      {o.payment_status === 'fully_paid' ? 'Paid' : o.payment_status === 'partial' ? 'Partial (50%)' : 'Pending'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
