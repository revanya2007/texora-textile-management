import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../components/ui/Button';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-error/20 flex flex-col items-center max-w-md w-full">
        <div className="w-16 h-16 bg-red-50 text-error rounded-full flex items-center justify-center mb-6">
          <ShieldAlert size={32} />
        </div>
        <h1 className="text-2xl font-bold text-navy mb-2">Access Denied</h1>
        <p className="text-secondary-text mb-8">
          You do not have the necessary permissions to access this portal. Please contact your administrator if you believe this is a mistake.
        </p>
        <div className="flex gap-4 w-full">
          <Button variant="outline" className="w-full" onClick={() => window.history.back()}>
            Go Back
          </Button>
          <Link to="/" className="w-full">
            <Button variant="primary" className="w-full">
              Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
