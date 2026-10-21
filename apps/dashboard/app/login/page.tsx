import { connection } from 'next/server';
import { LoginForm } from '@/features/auth/login-form';
import { firebaseWebConfig } from '@/lib/server-env';

export default async function LoginPage() {
  await connection(); // read the auth config per request, not at build
  return <LoginForm firebase={firebaseWebConfig()} />;
}
