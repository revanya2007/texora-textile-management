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
  const { signUp } = useAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Require explicit portal parameter
  if (portal !== 'export' && portal !== 'domestic') {
    return <Navigate to="/" replace />;
  }

  const validPortal: 'export' | 'domestic' = portal;
  const portalName = validPortal === 'export' ? 'Export' : 'Domestic';

  const defaultRole: UserRole = validPortal === 'export' ? 'export_staff' : 'domestic_staff';

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      role: defaultRole,
    }
  });

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
              <div className="w-16 h-16 bg-soft-mint rounded-full flex items-center justify-center border-2 border-light-mint text-navy font-bold text-2xl font-serif">
                TX
              </div>
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

                <div className="space-y-1">
                  <label className="block text-sm font-medium text-navy">Role / Position</label>
                  <select
                    {...register('role')}
                    className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
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
                </div>
                
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
