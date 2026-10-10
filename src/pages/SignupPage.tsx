import { useState } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/auth';

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const { portal } = useParams<{ portal: string }>();
  const navigate = useNavigate();
  const { signUp, signInWithGoogle } = useAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Require explicit portal parameter
  if (portal !== 'export' && portal !== 'domestic') {
    return <Navigate to="/" replace />;
  }

  const validPortal: 'export' | 'domestic' = portal;
  const portalName = validPortal === 'export' ? 'Export' : 'Domestic';

  const defaultRole: UserRole = validPortal === 'export' ? 'export_staff' : 'domestic_staff';

  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      role: defaultRole,
    }
  });

  const handleGoogleSignUp = async () => {
    setError(null);
    setIsGoogleLoading(true);
    const timeout = setTimeout(() => {
      setIsGoogleLoading(false);
    }, 6000);

    try {
      const selectedRole = (getValues('role') as UserRole) || defaultRole;
      const { error: googleErr } = await signInWithGoogle(validPortal, selectedRole);
      if (googleErr) {
        clearTimeout(timeout);
        setError(googleErr);
        setIsGoogleLoading(false);
      }
    } catch (err: any) {
      clearTimeout(timeout);
      setError(err?.message || 'Failed to start Google authentication.');
      setIsGoogleLoading(false);
    }
  };

  const onSubmit = async (data: SignupFormValues) => {
    setError(null);
    try {
      const selectedRole = (data.role as UserRole) || defaultRole;
      const { error: authError } = await signUp(data.email, data.password, validPortal, selectedRole);

      if (authError) {
        setError(authError);
        return;
      }

      // Allow brief moment for backend profile initialization trigger to settle
      setSuccess(true);
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
            <CardTitle className="text-2xl">Create {portalName} Account</CardTitle>
            <p className="text-secondary-text text-sm mt-2">Sign up to access your portal</p>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="text-center space-y-4">
                <div className="p-4 bg-green-50 text-success rounded-lg border border-green-200 flex items-start gap-3 text-left">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-success mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-900">Account Created Successfully!</h4>
                    <p className="text-sm text-green-700 mt-1">
                      Your {portalName} profile has been initialized. You can now sign in.
                    </p>
                  </div>
                </div>
                <Button className="w-full" onClick={() => navigate(`/login/${validPortal}`)}>
                  Go to Sign In
                </Button>
              </div>
            ) : (
              <div>
                {error && (
                  <div className="p-3 mb-4 bg-red-50 border border-red-200 text-error text-sm rounded-md flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Role / Position selector at top */}
                <div className="space-y-1.5 mb-5 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Step 1: Choose Your Role / Position
                  </label>
                  <select
                    {...register('role')}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-medium text-navy focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-2xs"
                  >
                    {validPortal === 'export' ? (
                      <>
                        <option value="export_staff">Export Staff</option>
                        <option value="export_manager">Export Manager</option>
                        <option value="admin">Administrator</option>
                      </>
                    ) : (
                      <>
                        <option value="domestic_staff">Domestic Staff</option>
                        <option value="domestic_manager">Domestic Manager</option>
                        <option value="subcontractor">Subcontractor</option>
                        <option value="admin">Administrator</option>
                      </>
                    )}
                  </select>
                  <p className="text-[11px] text-slate-500">
                    This role will be applied to your account automatically upon signup.
                  </p>
                </div>

                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Step 2: Sign up with Google or Email
                </div>

                {/* Google OAuth Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignUp}
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
                    <span className="bg-white px-2.5 text-slate-400 font-semibold tracking-wider">or sign up with email</span>
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

                <div className="relative">
                  <Input
                    label="Confirm Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    {...register('confirmPassword')}
                    error={errors.confirmPassword?.message}
                  />
                </div>

                <Button type="submit" className="w-full mt-6" isLoading={isSubmitting}>
                  Create Account
                </Button>
                
                <div className="mt-4 text-center">
                  <span className="text-secondary-text text-sm">Already have an account? </span>
                  <Link to={`/login/${validPortal}`} className="text-primary hover:underline text-sm font-medium">
                    Sign in here
                  </Link>
                </div>
              </form>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
