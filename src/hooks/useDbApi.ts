import { useCallback } from 'react';
import { Contact, SendSession, Activity, ApiCredentials } from '../types';

function accountKeyFromCreds(creds: ApiCredentials | null) {
  if (!creds) return null;
  // clave simple derivada para separar cuentas por token/phone (no es seguridad, solo partición)
  return `${creds.phoneNumberId}:${creds.businessAccountId}`;
}

export function useDbApi(creds: ApiCredentials | null) {
  const accountKey = accountKeyFromCreds(creds);
  // Intentar auth por token si existe (guardado por tu flujo de login futuro)
  const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('auth_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(accountKey && !token ? { 'X-Account-Key': accountKey } : {}),
  };

  const getLists = useCallback(async () => {
    if (!accountKey && !token) return [] as any[];
    const r = await fetch('/api/lists', { headers });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, [accountKey, token]);

  const createList = useCallback(async (name: string) => {
    if (!accountKey && !token) throw new Error('No account');
    const r = await fetch('/api/lists', { method: 'POST', headers, body: JSON.stringify({ name }) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, [accountKey, token]);

  const deleteList = useCallback(async (id: string) => {
    if (!accountKey && !token) throw new Error('No account');
    const r = await fetch(`/api/lists/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, [accountKey, token]);

  const renameList = useCallback(async (id: string, name: string) => {
    if (!accountKey && !token) throw new Error('No account');
    const r = await fetch(`/api/lists/${encodeURIComponent(id)}`, { method: 'PATCH', headers, body: JSON.stringify({ name }) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, [accountKey, token]);

  const uploadContactsToList = useCallback(async (listId: string, list: Contact[]) => {
    if (!accountKey && !token) throw new Error('No account');
    const r = await fetch('/api/contacts/bulk', { method: 'POST', headers, body: JSON.stringify({ listId, contacts: list }) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, [accountKey, token]);

  const getContacts = useCallback(async (listId?: string) => {
    if (!accountKey && !token) return [] as any[];
    const url = listId ? `/api/contacts?listId=${encodeURIComponent(listId)}` : '/api/contacts';
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, [accountKey, token]);

  const logActivity = useCallback(async (a: Omit<Activity, 'id' | 'timestamp'>) => {
    if (!accountKey && !token) return;
    await fetch('/api/activities', { method: 'POST', headers, body: JSON.stringify(a) });
  }, [accountKey, token]);

  const persistSession = useCallback(async (s: Omit<SendSession, 'id' | 'timestamp'>) => {
    if (!accountKey && !token) return;
    await fetch('/api/sessions', { method: 'POST', headers, body: JSON.stringify(s) });
  }, [accountKey, token]);

  const loadSessions = useCallback(async () => {
    if (!accountKey && !token) return [] as any[];
    const r = await fetch('/api/sessions', { headers });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, [accountKey, token]);

  return { getLists, createList, deleteList, renameList, uploadContactsToList, getContacts, logActivity, persistSession, loadSessions, accountKey };
}
