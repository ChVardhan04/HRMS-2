'use client';

export const dynamic = 'force-dynamic';



import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => setToken(params.get('token') ?? ''), [params]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (password.length < 12) return setError('Password must contain at least 12 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    try {
      await api.post('/auth/reset-password', { token, newPassword: password }, { skipAuth: true });
      setComplete(true);
    } catch (err: any) {
      setError(err.message || 'Unable to reset your password.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 px-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader><CardTitle>Set a new password</CardTitle><CardDescription>Use at least 12 characters.</CardDescription></CardHeader>
        <CardContent>
          {complete ? (
            <div className="space-y-4"><p className="text-sm text-muted-foreground">Password updated successfully.</p><Button className="w-full" onClick={() => router.push('/login')}>Continue to sign in</Button></div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5"><Label htmlFor="password">New password</Label><Input id="password" type="password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" minLength={12} value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full">Update password</Button>
              <Link href="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">Back to sign in</Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
