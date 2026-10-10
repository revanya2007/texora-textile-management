import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setError(null);
    try {
      // Direct redirect back to application origin
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/login/export`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSuccess(true);
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
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
            <CardTitle className="text-2xl">Reset Password</CardTitle>
            <p className="text-secondary-text text-sm mt-2">Enter your email address to receive a password reset link.</p>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="text-center space-y-4">
                <div className="p-4 bg-green-50 text-success rounded-lg border border-green-200 flex items-start gap-3 text-left">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-success mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-900">Reset Email Sent</h4>
                    <p className="text-sm text-green-700 mt-1">
                      If an account exists with that email, a password reset link has been dispatched.
                    </p>
                  </div>
                </div>
                <Button className="w-full" onClick={() => window.location.href = '/'}>
                  Return to Welcome
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-error text-sm rounded-md">
                    {error}
                  </div>
                )}
                
                <Input
                  label="Email"
                  type="email"
                  placeholder="name@example.com"
                  {...register('email')}
                  error={errors.email?.message}
                />
                
                <Button type="submit" className="w-full mt-2" isLoading={isSubmitting}>
                  Send Reset Link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
