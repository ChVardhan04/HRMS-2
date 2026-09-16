'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/lib/api-client';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setToken(params.get('token') ?? '');
  }, [params]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!token) {
      setError('This password reset link is missing a token.');
      return;
    }

    if (password.length < 12) {
      setError('Password must contain at least 12 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      await api.post(
        '/auth/reset-password',
        {
          token,
          newPassword: password,
        },
        {
          skipAuth: true,
        },
      );

      setComplete(true);
    } catch (err: any) {
      setError(err.message || 'Unable to reset your password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-elevated">
            <Building2 className="h-6 w-6" />
          </div>

          <h1 className="text-xl font-semibold tracking-tight">
            HRMS
          </h1>
        </div>

        <Card className="shadow-elevated">
          {complete ? (
            <>
              <CardHeader className="items-center text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />

                <CardTitle>Password reset successful</CardTitle>

                <CardDescription>
                  Your password has been updated successfully.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => router.push('/login')}
                >
                  Continue to sign in
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Reset your password</CardTitle>

                <CardDescription>
                  Create a new password to access your HRMS account.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={submit}
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password">
                      New password
                    </Label>

                    <Input
                      id="password"
                      type="password"
                      minLength={12}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="confirmPassword">
                      Confirm password
                    </Label>

                    <Input
                      id="confirmPassword"
                      type="password"
                      minLength={12}
                      value={confirmPassword}
                      onChange={(e) =>
                        setConfirmPassword(e.target.value)
                      }
                      required
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}

                    Reset password
                  </Button>

                  <Link
                    href="/login"
                    className="text-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to sign in
                  </Link>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function ResetPasswordLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
