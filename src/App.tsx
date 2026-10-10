import { Routes, Route, useParams } from 'react-router-dom';
import WelcomePage from './pages/WelcomePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';

// Export Pages
import ExportDashboardPage from './pages/export/ExportDashboardPage';
import ExportMaterialsPage from './pages/export/ExportMaterialsPage';
import ExportSuppliersPage from './pages/export/ExportSuppliersPage';
import ExportBuyersPage from './pages/export/ExportBuyersPage';
import ExportOrdersPage from './pages/export/ExportOrdersPage';
import ExportProductionPage from './pages/export/ExportProductionPage';
import ExportQualityPage from './pages/export/ExportQualityPage';
import ExportFinishedGoodsPage from './pages/export/ExportFinishedGoodsPage';
import ExportDispatchPage from './pages/export/ExportDispatchPage';
import ExportInvoicesPage from './pages/export/ExportInvoicesPage';
import ExportWorkersPage from './pages/export/ExportWorkersPage';
import ExportGarmentingPage from './pages/export/ExportGarmentingPage';
import ExportAccountsPage from './pages/export/ExportAccountsPage';
import ProductionPredictionsPage from './pages/export/ProductionPredictionsPage';

// Domestic Pages
import DomesticDashboardPage from './pages/domestic/DomesticDashboardPage';
import DomesticCompaniesPage from './pages/domestic/DomesticCompaniesPage';
import DomesticWorkTypesPage from './pages/domestic/DomesticWorkTypesPage';
import DomesticWorkOrdersPage from './pages/domestic/DomesticWorkOrdersPage';
import DomesticDeliveriesPage from './pages/domestic/DomesticDeliveriesPage';
import DomesticPaymentsPage from './pages/domestic/DomesticPaymentsPage';
import DomesticPieceTrackingPage from './pages/domestic/DomesticPieceTrackingPage';

import { AuthProvider } from './context/AuthContext';
import RoleSelectionModal from './components/auth/RoleSelectionModal';
import { isSupabaseConfigured } from './lib/supabase';
import { AlertTriangle } from 'lucide-react';

// Dynamic Portal Dashboard Dispatcher
function PortalDashboard() {
  const { portal } = useParams();
  if (portal === 'domestic') {
    return <DomesticDashboardPage />;
  }
  return <ExportDashboardPage />;
}

function App() {
  return (
    <AuthProvider>
      <RoleSelectionModal />
      {!isSupabaseConfigured && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 shadow-md z-50 sticky top-0">
          <AlertTriangle size={18} className="shrink-0" />
          <span>
            <strong>Configuration Warning:</strong> Supabase environment variables (<code className="bg-amber-600 px-1 py-0.5 rounded text-xs">VITE_SUPABASE_URL</code> and <code className="bg-amber-600 px-1 py-0.5 rounded text-xs">VITE_SUPABASE_ANON_KEY</code>) are missing in your <code className="bg-amber-600 px-1 py-0.5 rounded text-xs">.env</code> file.
          </span>
        </div>
      )}
      
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/login/:portal" element={<LoginPage />} />
        <Route path="/signup/:portal" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        
        {/* Protected Routes */}
        <Route path="/:portal" element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            {/* Common Dashboard */}
            <Route path="dashboard" element={<PortalDashboard />} />
            
            {/* Export Portal: Exact 9 Modules */}
            <Route path="materials" element={<ExportMaterialsPage />} />
            <Route path="yarn" element={<ExportMaterialsPage />} />
            <Route path="suppliers" element={<ExportSuppliersPage />} />
            <Route path="orders" element={<ExportOrdersPage />} />
            <Route path="production" element={<ExportProductionPage />} />
            <Route path="predictions" element={<ProductionPredictionsPage />} />
            <Route path="quality" element={<ExportQualityPage />} />
            <Route path="buyers" element={<ExportBuyersPage />} />
            <Route path="customers" element={<ExportBuyersPage />} />
            <Route path="finished" element={<ExportFinishedGoodsPage />} />
            <Route path="dispatch" element={<ExportDispatchPage />} />
            <Route path="accounts" element={<ExportAccountsPage />} />
            <Route path="invoices" element={<ExportInvoicesPage />} />
            <Route path="workers" element={<ExportWorkersPage />} />
            <Route path="attendance" element={<ExportWorkersPage />} />
            <Route path="garmenting" element={<ExportGarmentingPage />} />

            {/* Domestic Portal: Exact 5 Modules */}
            <Route path="companies" element={<DomesticCompaniesPage />} />
            <Route path="worktypes" element={<DomesticWorkTypesPage />} />
            <Route path="work-orders" element={<DomesticWorkOrdersPage />} />
            <Route path="piece-tracking" element={<DomesticPieceTrackingPage />} />
            <Route path="deliveries" element={<DomesticDeliveriesPage />} />
            <Route path="payments" element={<DomesticPaymentsPage />} />

            {/* Fallback for other modules in layout */}
            <Route path="*" element={
              <div className="bg-white rounded-xl shadow-sm border border-border p-12 h-full flex flex-col items-center justify-center text-center">
                <h2 className="text-2xl font-bold text-navy mb-2">Page Not Found in Portal</h2>
                <p className="text-secondary-text">Please select a valid menu item from the sidebar.</p>
              </div>
            } />
          </Route>
        </Route>

        <Route path="*" element={<div className="p-8 text-center mt-20">404 - Not Found</div>} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
