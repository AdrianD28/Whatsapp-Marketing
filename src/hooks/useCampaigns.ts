import { useState, useCallback } from 'react';

interface Campaign {
  _id: string;
  campaignName: string;
  batchId: string;
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'cancelled' | 'failed';
  processed: number;
  successCount: number;
  failedCount: number;
  contactsCount: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

interface CampaignStatus extends Campaign {
  inMemory?: {
    total: number;
    processed: number;
    success: number;
    failed: number;
    status: string;
  } | null;
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const createCampaign = useCallback(async (data: {
    contacts: any[];
    template: any;
    campaignName: string;
    batchId?: string;
  }) => {
    const response = await fetch('/api/campaigns/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      
      // 💰 ERROR 402: Créditos insuficientes
      if (response.status === 402) {
        const err = new Error(error.message || 'Créditos insuficientes') as any;
        err.code = 'insufficient_credits';
        err.required = error.required;
        err.available = error.available;
        err.missing = error.missing;
        throw err;
      }
      
      throw new Error(error.error || 'Error creating campaign');
    }

    return await response.json();
  }, []);

  const listCampaigns = useCallback(async (status?: string) => {
    setLoading(true);
    try {
      const url = status ? `/api/campaigns?status=${status}` : '/api/campaigns';
      const response = await fetch(url, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Error loading campaigns');
      }

      const result = await response.json();
      setCampaigns(result.data || []);
      return result.data || [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getCampaignStatus = useCallback(async (campaignId: string): Promise<CampaignStatus> => {
    const response = await fetch(`/api/campaigns/${campaignId}/status`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Error loading campaign status');
    }

    return await response.json();
  }, []);

  const pauseCampaign = useCallback(async (campaignId: string) => {
    const response = await fetch(`/api/campaigns/${campaignId}/pause`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error pausing campaign');
    }

    return await response.json();
  }, []);

  const resumeCampaign = useCallback(async (campaignId: string) => {
    const response = await fetch(`/api/campaigns/${campaignId}/resume`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error resuming campaign');
    }

    return await response.json();
  }, []);

  const cancelCampaign = useCallback(async (campaignId: string) => {
    const response = await fetch(`/api/campaigns/${campaignId}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error cancelling campaign');
    }

    return await response.json();
  }, []);

  return {
    campaigns,
    loading,
    createCampaign,
    listCampaigns,
    getCampaignStatus,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
  };
}
