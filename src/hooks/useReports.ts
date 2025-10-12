import { useCallback } from 'react';
import { CampaignSummary } from '../types';

export function useReports() {
  const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('auth_token') : null;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const listCampaigns = useCallback(async (): Promise<CampaignSummary[]> => {
    const r = await fetch('/api/reports/campaigns', { headers });
    if (!r.ok) throw new Error(await r.text());
    const j = await r.json();
    return j.data || [];
  }, []);

  const getCampaign = useCallback(async (id: string): Promise<{ batchId: string; counts: Record<string, number>; events: any[]; meta?: any }> => {
    const r = await fetch(`/api/reports/campaigns/${encodeURIComponent(id)}`, { headers });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, []);

  return { listCampaigns, getCampaign };
}
