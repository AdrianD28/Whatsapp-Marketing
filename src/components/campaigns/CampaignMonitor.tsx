import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Pause, Play, X, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useCampaigns } from '../../hooks/useCampaigns';
import toast from 'react-hot-toast';

interface CampaignMonitorProps {
  onClose?: () => void;
}

export function CampaignMonitor({ onClose }: CampaignMonitorProps) {
  const { campaigns, loading, listCampaigns, getCampaignStatus, pauseCampaign, resumeCampaign, cancelCampaign } = useCampaigns();
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
    // Auto-refresh cada 5 segundos para campañas activas
    const interval = setInterval(() => {
      const hasActive = campaigns.some(c => c.status === 'processing' || c.status === 'pending');
      if (hasActive) {
        loadCampaigns();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadCampaigns = async () => {
    try {
      await listCampaigns();
    } catch (err) {
      console.error('Error loading campaigns:', err);
    }
  };

  const handlePause = async (campaignId: string) => {
    try {
      await pauseCampaign(campaignId);
      toast.success('Campaña pausada');
      await loadCampaigns();
    } catch (err: any) {
      toast.error(err.message || 'Error al pausar');
    }
  };

  const handleResume = async (campaignId: string) => {
    try {
      await resumeCampaign(campaignId);
      toast.success('Campaña reanudada');
      await loadCampaigns();
    } catch (err: any) {
      toast.error(err.message || 'Error al reanudar');
    }
  };

  const handleCancel = async (campaignId: string) => {
    if (!confirm('¿Estás seguro de cancelar esta campaña?')) return;
    
    try {
      await cancelCampaign(campaignId);
      toast.success('Campaña cancelada');
      await loadCampaigns();
    } catch (err: any) {
      toast.error(err.message || 'Error al cancelar');
    }
  };

  const handleRefreshStatus = async (campaignId: string) => {
    setRefreshing(campaignId);
    try {
      const status = await getCampaignStatus(campaignId);
      setSelectedCampaign(status);
    } catch (err) {
      toast.error('Error al actualizar estado');
    } finally {
      setRefreshing(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'processing': return 'text-blue-400';
      case 'pending': return 'text-yellow-400';
      case 'paused': return 'text-orange-400';
      case 'failed': return 'text-red-400';
      case 'cancelled': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5" />;
      case 'processing': return <Activity className="w-5 h-5 animate-pulse" />;
      case 'pending': return <Clock className="w-5 h-5" />;
      case 'paused': return <Pause className="w-5 h-5" />;
      case 'failed': return <AlertCircle className="w-5 h-5" />;
      case 'cancelled': return <X className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Completada';
      case 'processing': return 'Procesando';
      case 'pending': return 'Pendiente';
      case 'paused': return 'Pausada';
      case 'failed': return 'Fallida';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-400" />
            Monitor de Campañas
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Campañas en segundo plano que no requieren el navegador abierto
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={loadCampaigns}
            disabled={loading}
          >
            Actualizar
          </Button>
          {onClose && (
            <Button size="sm" variant="ghost" icon={X} onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </div>

      {loading && campaigns.length === 0 ? (
        <Card>
          <div className="text-center py-8 text-gray-400">
            Cargando campañas...
          </div>
        </Card>
      ) : campaigns.length === 0 ? (
        <Card>
          <div className="text-center py-8 text-gray-400">
            No hay campañas en segundo plano aún.
            <div className="mt-2 text-sm">
              Crea una campaña con más de 100 contactos para usar el modo background.
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const progress = campaign.contactsCount > 0 
              ? Math.round((campaign.processed / campaign.contactsCount) * 100) 
              : 0;
            const successRate = campaign.processed > 0
              ? Math.round((campaign.successCount / campaign.processed) * 100)
              : 0;

            return (
              <Card key={campaign._id}>
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className={getStatusColor(campaign.status)}>
                          {getStatusIcon(campaign.status)}
                        </div>
                        <h4 className="font-semibold text-white">
                          {campaign.campaignName}
                        </h4>
                        <span className={`text-xs px-2 py-1 rounded ${getStatusColor(campaign.status)} bg-opacity-10`}>
                          {getStatusLabel(campaign.status)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        ID: {campaign.batchId}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Creada: {new Date(campaign.createdAt).toLocaleString('es-CO')}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {campaign.status === 'processing' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Pause}
                          onClick={() => handlePause(campaign._id)}
                        >
                          Pausar
                        </Button>
                      )}
                      {campaign.status === 'paused' && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={Play}
                          onClick={() => handleResume(campaign._id)}
                        >
                          Reanudar
                        </Button>
                      )}
                      {(campaign.status === 'processing' || campaign.status === 'pending' || campaign.status === 'paused') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={X}
                          onClick={() => handleCancel(campaign._id)}
                        >
                          Cancelar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={RefreshCw}
                        onClick={() => handleRefreshStatus(campaign._id)}
                        disabled={refreshing === campaign._id}
                      >
                        {refreshing === campaign._id ? 'Actualizando...' : 'Estado'}
                      </Button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Progreso: {campaign.processed}/{campaign.contactsCount}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-2 bg-green-500/10 rounded">
                      <div className="text-lg font-bold text-green-400">
                        {campaign.successCount}
                      </div>
                      <div className="text-xs text-gray-400">Exitosos</div>
                      <div className="text-xs text-green-400">{successRate}%</div>
                    </div>
                    <div className="text-center p-2 bg-red-500/10 rounded">
                      <div className="text-lg font-bold text-red-400">
                        {campaign.failedCount}
                      </div>
                      <div className="text-xs text-gray-400">Fallidos</div>
                    </div>
                    <div className="text-center p-2 bg-blue-500/10 rounded">
                      <div className="text-lg font-bold text-blue-400">
                        {campaign.contactsCount - campaign.processed}
                      </div>
                      <div className="text-xs text-gray-400">Pendientes</div>
                    </div>
                  </div>

                  {/* Error message */}
                  {campaign.error && (
                    <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
                      Error: {campaign.error}
                    </div>
                  )}

                  {/* Completion info */}
                  {campaign.completedAt && (
                    <div className="text-xs text-gray-500">
                      Completada: {new Date(campaign.completedAt).toLocaleString('es-CO')}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
