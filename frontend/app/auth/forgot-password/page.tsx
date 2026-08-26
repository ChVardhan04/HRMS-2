'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.post('/auth/forgot-password', { email }, { skipAuth: true });
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Unable to process the request.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 px-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Building2 className="h-5 w-5" /></div>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Enter your work email. If an account exists, you will receive a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Check your work email for the password reset link.</p>
              <Link href="/login"><Button className="w-full">Back to sign in</Button></Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5"><Label htmlFor="email">Work email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full">Send reset link</Button>
              <Link href="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">Back to sign in</Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
