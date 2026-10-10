import { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  Search,
  Layers
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';

interface PieceLog {
  id: string;
  order_number: string;
  company_name: string;
  work_type: string;
  total_received: number;
  completed_pieces: number;
  pending_pieces: number;
  accepted_pieces: number;
  rejected_pieces: number;
  rework_pieces: number;
  status: 'completed' | 'in_progress' | 'pending';
}

const initialPieceLogs: PieceLog[] = [
  {
    id: 'pl-1',
    order_number: 'DWO-2026-101',
    company_name: 'Tirupur Knitwear Processing Pvt Ltd',
    work_type: '4-Thread Overlock Edge Binding',
    total_received: 5000,
    completed_pieces: 3500,
    pending_pieces: 1500,
    accepted_pieces: 3450,
    rejected_pieces: 25,
    rework_pieces: 25,
    status: 'in_progress'
  },
  {
    id: 'pl-2',
    order_number: 'DWO-2026-102',
    company_name: 'Coimbatore Modern Weaving Works',
    work_type: 'Singer Single-Needle Stitching',
    total_received: 8000,
    completed_pieces: 8000,
    pending_pieces: 0,
    accepted_pieces: 7960,
    rejected_pieces: 40,
    rework_pieces: 0,
    status: 'completed'
  },
  {
    id: 'pl-3',
    order_number: 'DWO-2026-103',
    company_name: 'Erode Processing & Dyeing Mills',
    work_type: 'Flatlock Bottom & Sleeve Hemming',
    total_received: 4200,
    completed_pieces: 1800,
    pending_pieces: 2400,
    accepted_pieces: 1770,
    rejected_pieces: 15,
    rework_pieces: 15,
    status: 'in_progress'
  }
];

export default function DomesticPieceTrackingPage() {
  const [logs] = useState<PieceLog[]>(initialPieceLogs);
  const [searchTerm, setSearchTerm] = useState('');

  const totalReceived = logs.reduce((a, b) => a + b.total_received, 0);
  const totalCompleted = logs.reduce((a, b) => a + b.completed_pieces, 0);
  const totalAccepted = logs.reduce((a, b) => a + b.accepted_pieces, 0);
  const totalRejected = logs.reduce((a, b) => a + b.rejected_pieces, 0);
  const totalRework = logs.reduce((a, b) => a + b.rework_pieces, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="text-emerald-600 h-6 w-6" />
            Domestic Piece Tracking (Job-Work Progress)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time tracking of received job-work bundles, completed pieces, quality acceptances, rejects, and reworks.
          </p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs text-slate-500 font-medium">Total Received</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalReceived.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Across active orders</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs text-emerald-700 font-medium flex items-center gap-1">
            <CheckCircle2 size={13} /> Completed
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalCompleted.toLocaleString()}</div>
          <div className="text-[10px] text-emerald-600 font-medium mt-0.5">{(totalCompleted / totalReceived * 100).toFixed(0)}% Assembly Done</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs text-emerald-700 font-medium">Accepted Quality</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{totalAccepted.toLocaleString()}</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Passed inspections</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs text-amber-700 font-medium flex items-center gap-1">
            <RotateCcw size={13} /> Rework Pieces
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{totalRework}</div>
          <div className="text-[10px] text-amber-600 mt-0.5">Returned to line</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs text-rose-700 font-medium flex items-center gap-1">
            <XCircle size={13} /> Rejected
          </div>
          <div className="text-2xl font-bold text-rose-600 mt-1">{totalRejected}</div>
          <div className="text-[10px] text-rose-500 mt-0.5">Irreparable defects</div>
        </div>
      </div>

      {/* Piece Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
            <input 
              type="text"
              placeholder="Search work order..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg outline-none w-56 bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Work Order</th>
                <th className="py-3 px-4">Client Company</th>
                <th className="py-3 px-4">Operation Work Type</th>
                <th className="py-3 px-4 text-right">Received</th>
                <th className="py-3 px-4 text-right">Completed</th>
                <th className="py-3 px-4 text-right">Pending</th>
                <th className="py-3 px-4 text-right">Accepted</th>
                <th className="py-3 px-4 text-right">Rework</th>
                <th className="py-3 px-4 text-right">Rejected</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 text-slate-800">
              {logs
                .filter(l => l.order_number.toLowerCase().includes(searchTerm.toLowerCase()) || l.company_name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-800">{log.order_number}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{log.company_name}</td>
                    <td className="py-3 px-4 text-slate-600">{log.work_type}</td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900">{log.total_received.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">{log.completed_pieces.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-slate-500">{log.pending_pieces.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">{log.accepted_pieces.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-semibold text-amber-600">{log.rework_pieces}</td>
                    <td className="py-3 px-4 text-right font-semibold text-rose-600">{log.rejected_pieces}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={log.status === 'completed' ? 'active' : 'pending'}>
                        {log.status === 'completed' ? 'Completed' : 'In Progress'}
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
