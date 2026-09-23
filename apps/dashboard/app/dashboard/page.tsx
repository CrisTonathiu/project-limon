'use client';

import { useMe } from '@/hooks/use-me';

export default function DashboardPage() {
  const { me } = useMe();
  return (
    <>
      <h1>Welcome{me?.tenant ? `, ${me.tenant.name}` : ''}</h1>
      <p className="muted">
        Tenant status: <span className="badge">{me?.tenant?.status}</span> · Signed in as {me?.user.email} ({me?.user.role})
      </p>
    </>
  );
}
