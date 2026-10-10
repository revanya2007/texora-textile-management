import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { portal } = useParams<{ portal: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, session, hasAccessToPortal, isLoading } = useAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Require explicit portal parameter
  if (portal !== 'export' && portal !== 'domestic') {
    return <Navigate to="/" replace />;
  }

  const validPortal: 'export' | 'domestic' = portal;
  const portalName = validPortal === 'export' ? 'Export' : 'Domestic';

  // If user is already authenticated and has permission, redirect directly
  useEffect(() => {
    if (!isLoading && session) {
      if (hasAccessToPortal(validPortal)) {
        const from = (location.state as any)?.from?.pathname || `/${validPortal}/dashboard`;
        navigate(from, { replace: true });
      } else {
        const otherPortal = validPortal === 'export' ? 'domestic' : 'export';
        if (hasAccessToPortal(otherPortal)) {
          navigate(`/${otherPortal}/dashboard`, { replace: true });
        }
      }
    }
  }, [isLoading, session, validPortal, hasAccessToPortal, navigate, location.state]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setError(null);
    try {
      const { error: authError } = await signIn(data.email, data.password);

      if (authError) {
        setError(authError);
        return;
      }

      // Check portal permissions
      if (!hasAccessToPortal(validPortal)) {
        const otherPortal = validPortal === 'export' ? 'domestic' : 'export';
        if (hasAccessToPortal(otherPortal)) {
          navigate(`/${otherPortal}/dashboard`, { replace: true });
          return;
        }

        // Prevent redirect when user has access to neither portal
        setError('Your account does not have permission to access the Texora portal. Please contact an administrator.');
        return;
      }

      const from = (location.state as any)?.from?.pathname || `/${validPortal}/dashboard`;
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center text-primary hover:text-secondary mb-6 transition-colors font-medium">
          <ArrowLeft size={16} className="mr-2" />
          Back to Welcome
        </Link>
        
        <Card>
          <CardHeader className="text-center pt-8 pb-6 border-none">
            <div className="flex justify-center mb-4">
              <img 
                src="/texora-icon.png" 
                alt="Texora Logo" 
                className="w-16 h-16 rounded-2xl object-contain bg-white p-1.5 border border-slate-200 shadow-sm" 
              />
            </div>
            <CardTitle className="text-2xl">Sign in to {portalName}</CardTitle>
            <p className="text-secondary-text text-sm mt-2">Enter your credentials to access your account</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-error text-sm rounded-md flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              
              <Input
                label="Email"
                type="email"
                placeholder="name@example.com"
                {...register('email')}
                error={errors.email?.message}
              />
              
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password')}
                  error={errors.password?.message}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[32px] text-secondary-text hover:text-primary-text"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-sm text-primary hover:underline font-medium">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="w-full" isLoading={isSubmitting}>
                Sign In
              </Button>
              <div className="mt-4 text-center">
                <span className="text-secondary-text text-sm">Don't have an account? </span>
                <Link to={`/signup/${validPortal}`} className="text-primary hover:underline text-sm font-medium">
                  Sign up here
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
