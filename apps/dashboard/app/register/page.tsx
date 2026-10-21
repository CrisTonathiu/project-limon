import { connection } from 'next/server';
import { RegisterForm } from '@/features/auth/register-form';
import { firebaseWebConfig } from '@/lib/server-env';

export default async function RegisterPage() {
  await connection(); // read the auth config per request, not at build
  return <RegisterForm firebase={firebaseWebConfig()} />;
}
