import { Navigate, Outlet, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../ui/LoadingSpinner';

export function ProtectedRoute() {
  const { session, isLoading, hasAccessToPortal } = useAuth();
  const params = useParams<{ portal?: string }>();
  const location = useLocation();

  // Determine portal from route params or fallback to pathname prefix
  const rawPortal = params.portal || (
    location.pathname.startsWith('/export') 
      ? 'export' 
      : location.pathname.startsWith('/domestic') 
        ? 'domestic' 
        : undefined
  );

  const currentPortal = (rawPortal === 'export' || rawPortal === 'domestic') ? rawPortal : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <LoadingSpinner size={48} />
        <p className="mt-4 text-secondary-text font-medium">Verifying authorization...</p>
      </div>
    );
  }

  // Not authenticated -> redirect to portal login or welcome page
  if (!session) {
    if (currentPortal) {
      return <Navigate to={`/login/${currentPortal}`} state={{ from: location }} replace />;
    }
    return <Navigate to="/" replace />;
  }

  // If route is within a portal, enforce strict RBAC role authorization
  if (currentPortal) {
    if (!hasAccessToPortal(currentPortal)) {
      return <Navigate to="/unauthorized" replace />;
    }
  } else {
    // If accessing an invalid or unknown portal path while authenticated, send to welcome/home
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
