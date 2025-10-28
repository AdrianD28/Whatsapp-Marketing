import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, RefreshCw, ChevronRight, Download } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useReports } from '../hooks/useReports';
import { CampaignSummary } from '../types';
import CampaignDetailModal from '../components/statistics/CampaignDetailModal';
import * as XLSX from 'xlsx';

export function Statistics() {
  const { getCampaign } = useReports();
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCampaign, setModalCampaign] = useState<any>(null);
  // Filtros
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCampaigns, setTotalCampaigns] = useState(0);
  const limit = 20;

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('page', String(page));
      params.set('limit', String(limit));
      const url = '/api/reports/campaigns' + (params.toString() ? `?${params.toString()}` : '');
      const r = await fetch(url, { headers: (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) ? { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } : {} });
      const j = await r.json();
      const data = j.data || [];
      setCampaigns(data);
      
      // Actualizar información de paginación
      if (j.pagination) {
        setCurrentPage(j.pagination.page);
        setTotalPages(j.pagination.pages);
        setTotalCampaigns(j.pagination.total);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  const summary = useMemo(() => {
    return campaigns.map(c => {
      const counts = (c as any).counts || {};
      
      // CORRECCIÓN: Usar el total real de send_logs (incluye exitosos + fallidos)
      const totalMessages = counts['total'] || 0;
      
      // Si no hay eventos aún, usar el total de la sesión si está disponible
      const recipients = totalMessages > 0 ? totalMessages : ((c as any).total || 0);
      
      // Estados específicos desde el backend
      const delivered = counts['delivered'] || 0;
      const read = counts['read'] || 0;
      const failed = counts['failed'] || 0; // Fallidos reportados por Meta
      const sendErrors = counts['sendErrors'] || 0; // Errores al enviar (antes de Meta)
      
      // Total de errores = errores de envío + fallidos en Meta
      const totalErrors = sendErrors + failed;
      
      // Tasas de entrega y lectura basadas en el total REAL de destinatarios
      const deliveryRate = recipients > 0 ? Math.round((delivered / recipients) * 100) : 0;
      const readRate = recipients > 0 ? Math.round((read / recipients) * 100) : 0;
      
      return { 
        ...c, 
        total: recipients,
        delivered, 
        read, 
        failed: totalErrors, // Mostrar total de errores
        rate: deliveryRate, 
        readRate,
        errorDetails: counts['errors'] || [] // Detalles de errores para el modal
      };
    });
  }, [campaigns]);

  const exportCampaign = async (campaignId: string) => {
    try {
      const full = await getCampaign(campaignId);
      const meta = full.meta || {};
      
      // Construir datos exactos como en la referencia
      const excelData = [
        [
          'celular',
          'message', 
          'cantidad_x_login',
          'messageId',
          'fecha_envio_plataforma',
          'fecha_whatsapp_confirmado',
          'fecha_whatsapp_confirmado_entrega',
          'fecha_whatsapp_confirmado_leido',
          'id_plantilla',
          'tipo_plantilla',
          'status',
          'ERROR',
          'Soft Bounce'
        ]
      ];

      (full.events || []).forEach((e: any) => {
        // Usar el mensaje real enviado si está disponible, sino construir uno básico
        let body = e.realMessage || '';
        
        // Fallback: si no hay realMessage, intentar construir desde template
        if (!body) {
          body = String(meta.templateBody || '');
          // Reemplazar variables conocidas (esto es un fallback, el realMessage debería estar)
          body = body.replace(/\{\{1\}\}/g, e.lastRecipient || '');
        }
        
        const recipient = e.lastRecipient || '';
        const messageId = e.messageId || '';
        const status = e.status ? e.status.toUpperCase() : '';
        
        // Función helper para formatear fecha en zona horaria de Colombia
        const formatDate = (dateString: string) => {
          if (!dateString) return '';
          const d = new Date(dateString);
          const formatter = new Intl.DateTimeFormat('es-CO', {
            timeZone: 'America/Bogota',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
          return formatter.format(d);
        };
        
        // Extraer timestamps específicos de cada estado desde statusHistory
        // statusHistory contiene objetos como: { status: 'sent', timestamp: '2025-10-21T...' }
        const statusTimestamps = e.statusTimestamps || {};
        
        const fechaEnvio = formatDate(e.createdAt || statusTimestamps.sent || '');
        const fechaConfirmado = formatDate(statusTimestamps.sent || '');
        const fechaEntrega = formatDate(statusTimestamps.delivered || '');
        const fechaLeido = formatDate(statusTimestamps.read || '');

        excelData.push([
          recipient,
          body,
          '1',
          messageId,
          fechaEnvio,
          fechaConfirmado,
          fechaEntrega,
          fechaLeido,
          meta.templateName || '',
          meta.templateCategory || 'Marketing',
          status === 'DELIVERED' || status === 'READ' ? 'ENREGADO - LEIDO' : status,
          status === 'FAILED' ? 'ERROR' : '',
          ''
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      
      // Ajustar anchos de columna
      ws['!cols'] = [
        { wch: 15 }, // celular
        { wch: 50 }, // message
        { wch: 15 }, // cantidad_x_login
        { wch: 35 }, // messageId
        { wch: 22 }, // fecha_envio_plataforma
        { wch: 22 }, // fecha_whatsapp_confirmado
        { wch: 22 }, // fecha_whatsapp_confirmado_entrega
        { wch: 22 }, // fecha_whatsapp_confirmado_leido
        { wch: 15 }, // id_plantilla
        { wch: 15 }, // tipo_plantilla
        { wch: 20 }, // status
        { wch: 10 }, // ERROR
        { wch: 15 }  // Soft Bounce
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Worksheet');
      const fileName = `campania_${meta.campaignName || campaignId}_${new Date().toISOString().slice(0,10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2"><BarChart3 className="w-6 h-6"/> Estadísticas</h2>
          <p className="text-gray-400">Cada envío masivo es una campaña</p>
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={() => load(currentPage)} disabled={loading}>Actualizar</Button>
      </div>

      {/* Filtros globales por fecha */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <div className="text-xs text-gray-400 mb-1">Desde</div>
            <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700" />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Hasta</div>
            <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700" />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => load(1)}>Aplicar</Button>
            <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); load(1); }}>Limpiar</Button>
          </div>
        </div>
        {/* Presets */}
        <div className="mt-3 flex flex-wrap gap-2">
          {(() => {
            const fmt = (d: Date) => {
              const pad = (n: number) => String(n).padStart(2, '0');
              return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            };
            const setPreset = (type: 'today'|'24h'|'7d') => {
              const now = new Date();
              if (type === 'today') {
                const start = new Date(now); start.setHours(0,0,0,0);
                const end = new Date(now); end.setHours(23,59,59,999);
                setFrom(fmt(start)); setTo(fmt(end));
              } else if (type === '24h') {
                const start = new Date(now.getTime() - 24*60*60*1000);
                setFrom(fmt(start)); setTo(fmt(now));
              } else {
                const start = new Date(now.getTime() - 7*24*60*60*1000);
                setFrom(fmt(start)); setTo(fmt(now));
              }
              setTimeout(load, 0);
            };
            return (
              <>
                <Button variant="ghost" size="sm" onClick={() => setPreset('today')}>Hoy</Button>
                <Button variant="ghost" size="sm" onClick={() => setPreset('24h')}>Últimas 24h</Button>
                <Button variant="ghost" size="sm" onClick={() => setPreset('7d')}>Últimos 7 días</Button>
              </>
            );
          })()}
        </div>
      </Card>

      {/* Campaigns list */}
      <Card>
        <h3 className="text-white font-semibold mb-4">Campañas recientes</h3>
        {summary.length === 0 ? (
          <div className="text-sm text-gray-400">No hay campañas registradas aún. Realiza un envío desde la vista Envío.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Campaña</th>
                  <th className="px-2 py-2">Plantilla</th>
                  <th className="px-2 py-2">Destinatarios</th>
                  <th className="px-2 py-2">Entregados</th>
                  <th className="px-2 py-2">Leídos</th>
                  <th className="px-2 py-2">Error</th>
                  <th className="px-2 py-2">Tasa entrega</th>
                  <th className="px-2 py-2">Tasa lectura</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {summary.map(c => (
                  <tr key={c.campaignId} className="border-t border-gray-800 hover:bg-gray-800/40">
                    <td className="px-2 py-2 text-gray-300">{new Date(c.timestamp).toLocaleString()}</td>
                    <td className="px-2 py-2 text-white">{(c as any).campaignName || '-'}</td>
                    <td className="px-2 py-2 text-gray-300">{c.templateName || '-'}</td>
                    <td className="px-2 py-2 text-gray-300">{c.total ?? '-'}</td>
                    <td className="px-2 py-2 text-green-400">{c.delivered}</td>
                    <td className="px-2 py-2 text-blue-400">{c.read}</td>
                    <td className="px-2 py-2">
                      {c.failed > 0 ? (
                        <div className="flex items-center gap-1">
                          <span className="text-red-400">{c.failed}</span>
                          {(c as any).errorDetails && (c as any).errorDetails.length > 0 && (
                            <span 
                              className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded cursor-help"
                              title={`${(c as any).errorDetails.length} error(es) detectado(s)`}
                            >
                              ⚠️
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500">0</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-white font-semibold">{c.rate}%</td>
                    <td className="px-2 py-2 text-white">{c.readRate}%</td>
                    <td className="px-2 py-2 text-right flex gap-2">
                      <Button size="sm" onClick={() => { setModalCampaign(c); setModalOpen(true); }} icon={ChevronRight}>Detalle</Button>
                      <Button size="sm" variant="secondary" icon={Download} onClick={() => exportCampaign(c.campaignId)}>Exportar</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      
      {/* Paginación */}
      {totalPages > 1 && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-400">
              Mostrando {campaigns.length} de {totalCampaigns} campañas
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => load(currentPage - 1)} 
                disabled={currentPage === 1 || loading}
              >
                Anterior
              </Button>
              <div className="text-sm text-gray-300">
                Página {currentPage} de {totalPages}
              </div>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => load(currentPage + 1)} 
                disabled={currentPage === totalPages || loading}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Modal de Detalle */}
      <CampaignDetailModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        campaign={modalCampaign} 
      />
    </motion.div>
  );
}
