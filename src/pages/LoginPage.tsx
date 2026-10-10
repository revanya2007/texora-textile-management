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
  const { signIn, signInWithGoogle, session, hasAccessToPortal, isLoading } = useAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

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

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);
    const timeout = setTimeout(() => {
      setIsGoogleLoading(false);
    }, 6000);

    try {
      const { error: googleErr } = await signInWithGoogle(validPortal);
      if (googleErr) {
        clearTimeout(timeout);
        setError(googleErr);
        setIsGoogleLoading(false);
      }
    } catch (err: any) {
      clearTimeout(timeout);
      setError(err?.message || 'Failed to start Google sign in.');
      setIsGoogleLoading(false);
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
            {error && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 text-error text-sm rounded-md flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Google OAuth Sign-in Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isSubmitting}
              className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm rounded-lg border border-slate-300 shadow-sm flex items-center justify-center gap-3 transition-all duration-150 hover:shadow disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGoogleLoading ? (
                <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.37 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.97 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.63 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
              )}
              <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </button>

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2.5 text-slate-400 font-semibold tracking-wider">or sign in with email</span>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
