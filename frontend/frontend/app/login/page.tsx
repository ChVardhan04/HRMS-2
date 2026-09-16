'use client';

import { useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLogin } from '@/features/auth/use-login';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-elevated">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">HRMS</h1>
        </div>

        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your work email to access your dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); login.mutate({ email, password }); }}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="mt-2" disabled={login.isPending}>
                {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </Button>
              <Link href="/auth/forgot-password" className="text-center text-sm text-muted-foreground hover:text-foreground">
                Forgot password?
              </Link>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
