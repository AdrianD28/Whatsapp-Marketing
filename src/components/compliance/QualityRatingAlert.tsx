import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, HelpCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';

interface QualityData {
  quality_rating?: string;
  messaging_limit_tier?: string;
  display_phone_number?: string;
  verified_name?: string;
  tierLimits?: Record<string, string>;
  qualityInfo?: Record<string, string>;
}

export function QualityRatingAlert() {
  const { apiCredentials } = useAppContext();
  const [qualityData, setQualityData] = useState<QualityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const fetchQualityRating = async () => {
    if (!apiCredentials?.accessToken) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No auth token');

      const response = await fetch('/api/wa/quality-rating', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch quality rating');
      }

      const data = await response.json();
      setQualityData(data);
      setLastCheck(new Date());
    } catch (err) {
      console.error('Quality rating check failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch al montar y cada 6 horas
  useEffect(() => {
    fetchQualityRating();
    const interval = setInterval(fetchQualityRating, 6 * 60 * 60 * 1000); // 6 horas
    return () => clearInterval(interval);
  }, [apiCredentials]);

  if (error) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <HelpCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-gray-600">
              No se pudo verificar el Quality Rating
            </p>
            <p className="text-xs text-gray-500 mt-1">{error}</p>
          </div>
          <button
            onClick={fetchQualityRating}
            disabled={loading}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!qualityData || !qualityData.quality_rating) {
    return null;
  }

  const rating = qualityData.quality_rating;
  const tier = qualityData.messaging_limit_tier || 'TIER_NOT_SET';
  
  const ratingConfig = {
    GREEN: {
      icon: CheckCircle,
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      iconColor: 'text-green-600',
      title: '✅ Quality Rating: Excelente',
      description: 'Tu cuenta está en excelente estado. Sin restricciones.'
    },
    YELLOW: {
      icon: AlertTriangle,
      bg: 'bg-yellow-50',
      border: 'border-yellow-300',
      text: 'text-yellow-800',
      iconColor: 'text-yellow-600',
      title: '⚠️ Quality Rating: Advertencia',
      description: 'Revisa el contenido de tus mensajes. Meta ha detectado posibles problemas.'
    },
    RED: {
      icon: XCircle,
      bg: 'bg-red-50',
      border: 'border-red-300',
      text: 'text-red-800',
      iconColor: 'text-red-600',
      title: '🚨 Quality Rating: CRÍTICO',
      description: 'Tu cuenta tiene restricciones severas. Riesgo alto de suspensión.'
    },
    UNKNOWN: {
      icon: HelpCircle,
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'text-gray-800',
      iconColor: 'text-gray-600',
      title: '❓ Quality Rating: Desconocido',
      description: 'No se pudo determinar el estado. Verifica tus credenciales.'
    }
  };

  const config = ratingConfig[rating as keyof typeof ratingConfig] || ratingConfig.UNKNOWN;
  const Icon = config.icon;

  const tierLimits = qualityData.tierLimits || {};
  const tierLimit = tierLimits[tier] || 'Desconocido';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`${config.bg} border ${config.border} rounded-lg p-4 mb-4`}
      >
        <div className="flex items-start gap-3">
          <Icon className={`w-6 h-6 ${config.iconColor} flex-shrink-0 mt-0.5`} />
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold ${config.text} mb-1`}>
              {config.title}
            </h3>
            <p className={`text-sm ${config.text} opacity-90 mb-3`}>
              {config.description}
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className={`${config.text} opacity-75`}>
                <span className="font-medium">Teléfono:</span>{' '}
                {qualityData.display_phone_number || 'N/A'}
              </div>
              <div className={`${config.text} opacity-75`}>
                <span className="font-medium">Nombre verificado:</span>{' '}
                {qualityData.verified_name || 'N/A'}
              </div>
              <div className={`${config.text} opacity-75`}>
                <span className="font-medium">Tier de mensajería:</span>{' '}
                {tier}
              </div>
              <div className={`${config.text} opacity-75`}>
                <span className="font-medium">Límite:</span>{' '}
                {tierLimit}
              </div>
            </div>

            {rating === 'YELLOW' && (
              <div className="mt-3 p-3 bg-yellow-100 rounded border border-yellow-200">
                <p className="text-xs text-yellow-800 font-medium mb-2">
                  💡 Acciones recomendadas:
                </p>
                <ul className="text-xs text-yellow-800 space-y-1 list-disc list-inside">
                  <li>Verifica que solo envías a usuarios con opt-in</li>
                  <li>Asegúrate de respetar la frecuencia de envío (no spam)</li>
                  <li>Revisa que tus plantillas sean claras y no engañosas</li>
                  <li>Respeta los opt-outs inmediatamente</li>
                </ul>
              </div>
            )}

            {rating === 'RED' && (
              <div className="mt-3 p-3 bg-red-100 rounded border border-red-200">
                <p className="text-xs text-red-800 font-medium mb-2">
                  🚨 ACCIÓN URGENTE REQUERIDA:
                </p>
                <ul className="text-xs text-red-800 space-y-1 list-disc list-inside">
                  <li><strong>DETÉN TODOS LOS ENVÍOS inmediatamente</strong></li>
                  <li>Revisa el Meta Business Manager para más detalles</li>
                  <li>Contacta a soporte de Meta para apelar</li>
                  <li>Implementa cambios en tu estrategia de mensajería</li>
                  <li>NO ignores esto - puedes perder tu cuenta</li>
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-current border-opacity-10">
              <p className="text-xs opacity-60">
                Última verificación: {lastCheck?.toLocaleString('es-CO')}
              </p>
              <button
                onClick={fetchQualityRating}
                disabled={loading}
                className={`flex items-center gap-1 text-xs font-medium hover:opacity-80 transition-opacity ${config.text}`}
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
