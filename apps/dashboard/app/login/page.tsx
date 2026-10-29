import { connection } from 'next/server';
import { LoginForm } from '@/features/auth/login-form';
import { firebaseWebConfig } from '@/lib/server-env';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  await connection(); // read the auth config per request, not at build
  const { password } = await searchParams;
  return <LoginForm firebase={firebaseWebConfig()} passwordChanged={password === 'changed'} />;
}
