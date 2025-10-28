import { X, TrendingUp, MessageCircle, CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CampaignDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: {
    campaignId: string;
    campaignName?: string;
    templateName?: string;
    timestamp: string;
    total: number;
    delivered: number;
    read: number;
    failed: number;
    rate: number;
    readRate: number;
    errorDetails?: Array<{
      recipient: string;
      time: string;
      status: number;
      error: string;
      errorCode: string | null;
      errorType: string | null;
    }>;
  } | null;
}

export default function CampaignDetailModal({ isOpen, onClose, campaign }: CampaignDetailModalProps) {
  if (!campaign) return null;

  const stats = [
    { label: 'Total Destinatarios', value: campaign.total, icon: MessageCircle, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    { label: 'Entregados', value: campaign.delivered, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
    { label: 'Leídos', value: campaign.read, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/20' },
    { label: 'Errores', value: campaign.failed, icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' },
  ];

  // Calcular porcentajes para el gráfico de barras
  const maxValue = Math.max(campaign.total, campaign.delivered, campaign.read, campaign.failed, 1);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-800"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-blue-400" />
                  Detalle de Campaña
                </h2>
                <p className="text-gray-400 mt-1">
                  {campaign.campaignName || campaign.campaignId}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Info General */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm">Plantilla</div>
                  <div className="text-white font-semibold mt-1">{campaign.templateName || '-'}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm">Fecha de Envío</div>
                  <div className="text-white font-semibold mt-1">
                    {new Date(campaign.timestamp).toLocaleString('es-CO', {
                      timeZone: 'America/Bogota',
                      dateStyle: 'short',
                      timeStyle: 'short'
                    })}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm">ID de Campaña</div>
                  <div className="text-white font-mono text-xs mt-1 truncate" title={campaign.campaignId}>
                    {campaign.campaignId}
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className={`${stat.bg} rounded-lg p-4 border border-gray-800`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`w-4 h-4 ${stat.color}`} />
                        <div className="text-gray-400 text-xs">{stat.label}</div>
                      </div>
                      <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    </div>
                  );
                })}
              </div>

              {/* Gráfico de Barras Horizontal */}
              <div className="bg-gray-800/30 rounded-lg p-6">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Distribución de Estados
                </h3>
                <div className="space-y-4">
                  {/* Total */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-400">Total Destinatarios</span>
                      <span className="text-white font-semibold">{campaign.total}</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(campaign.total / maxValue) * 100}%` }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="h-full bg-blue-500 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Entregados */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-400">Entregados</span>
                      <span className="text-green-400 font-semibold">{campaign.delivered}</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(campaign.delivered / maxValue) * 100}%` }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="h-full bg-green-500 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Leídos */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-400">Leídos</span>
                      <span className="text-purple-400 font-semibold">{campaign.read}</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(campaign.read / maxValue) * 100}%` }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="h-full bg-purple-500 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Errores */}
                  {campaign.failed > 0 && (
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400">Errores</span>
                        <span className="text-red-400 font-semibold">{campaign.failed}</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(campaign.failed / maxValue) * 100}%` }}
                          transition={{ duration: 0.5, delay: 0.4 }}
                          className="h-full bg-red-500 rounded-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tasas de Éxito */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tasa de Entrega */}
                <div className="bg-gray-800/30 rounded-lg p-6">
                  <h4 className="text-gray-400 text-sm mb-3">Tasa de Entrega</h4>
                  <div className="relative pt-1">
                    <div className="flex mb-2 items-center justify-between">
                      <div>
                        <span className="text-3xl font-bold text-green-400">{campaign.rate}%</span>
                      </div>
                    </div>
                    <div className="overflow-hidden h-3 mb-4 text-xs flex rounded-full bg-gray-700">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${campaign.rate}%` }}
                        transition={{ duration: 0.8, delay: 0.5 }}
                        className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-green-500 to-green-400"
                      />
                    </div>
                    <p className="text-gray-500 text-xs">
                      {campaign.delivered} de {campaign.total} mensajes entregados
                    </p>
                  </div>
                </div>

                {/* Tasa de Lectura */}
                <div className="bg-gray-800/30 rounded-lg p-6">
                  <h4 className="text-gray-400 text-sm mb-3">Tasa de Lectura</h4>
                  <div className="relative pt-1">
                    <div className="flex mb-2 items-center justify-between">
                      <div>
                        <span className="text-3xl font-bold text-purple-400">{campaign.readRate}%</span>
                      </div>
                    </div>
                    <div className="overflow-hidden h-3 mb-4 text-xs flex rounded-full bg-gray-700">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${campaign.readRate}%` }}
                        transition={{ duration: 0.8, delay: 0.6 }}
                        className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-purple-500 to-purple-400"
                      />
                    </div>
                    <p className="text-gray-500 text-xs">
                      {campaign.read} de {campaign.total} mensajes leídos
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer con información adicional */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <p className="text-blue-400 text-sm">
                  💡 <strong>Consejo:</strong> Una tasa de entrega superior al 95% y una tasa de lectura superior al 60% 
                  se consideran excelentes métricas para campañas de WhatsApp.
                </p>
              </div>

              {/* Sección de Errores Detallados */}
              {campaign.errorDetails && campaign.errorDetails.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
                  <h3 className="text-red-400 font-semibold mb-4 flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Errores Detectados ({campaign.errorDetails.length})
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {campaign.errorDetails.map((error, idx) => (
                      <div key={idx} className="bg-gray-800/50 rounded-lg p-4 border border-red-500/20">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-white font-semibold">{error.recipient}</span>
                              {error.errorCode && (
                                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
                                  Código: {error.errorCode}
                                </span>
                              )}
                              {error.errorType && (
                                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
                                  {error.errorType}
                                </span>
                              )}
                            </div>
                            <p className="text-red-300 text-sm mb-1">{error.error}</p>
                            <p className="text-gray-500 text-xs">
                              {new Date(error.time).toLocaleString('es-CO', {
                                timeZone: 'America/Bogota',
                                dateStyle: 'short',
                                timeStyle: 'short'
                              })}
                            </p>
                          </div>
                          <div className="text-gray-500 text-xs">
                            HTTP {error.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-gray-400 text-xs">
                    💡 <strong>Nota:</strong> Estos errores ocurrieron al intentar enviar el mensaje a WhatsApp. 
                    Verifica que los números sean válidos y que la cuenta tenga los permisos necesarios.
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-800">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
