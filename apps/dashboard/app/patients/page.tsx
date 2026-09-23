'use client';

import { useEffect, useState } from 'react';
import type { PatientDto } from '@limon/types';
import { api } from '@/services/api';

export default function PatientsPage() {
  const [items, setItems] = useState<PatientDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.patients.list().then((r) => setItems(r.items)).catch((e: Error) => setError(e.message));
  }, []);
  return (
    <>
      <h1>Patients</h1>
      {error && <p className="error">{error}</p>}
      <ul>{items.map((p) => <li key={p.id}>{p.firstName} {p.lastName} <span className="muted">{p.email}</span></li>)}</ul>
      {!error && items.length === 0 && <p className="muted">No patients yet.</p>}
    </>
  );
}
