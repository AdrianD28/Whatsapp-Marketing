import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, RefreshCw, ChevronRight, Download } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useReports } from '../hooks/useReports';
import { CampaignSummary } from '../types';
import * as XLSX from 'xlsx';

export function Statistics() {
  const { listCampaigns, getCampaign } = useReports();
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ counts: Record<string, number>; events: any[] } | null>(null);
  // Filtros
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [skip, setSkip] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(200);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const url = '/api/reports/campaigns' + (params.toString() ? `?${params.toString()}` : '');
      const r = await fetch(url, { headers: (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) ? { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } : {} });
      const j = await r.json();
      const data = j.data || [];
      setCampaigns(data);
      if (data.length && !selectedId) setSelectedId(data[0].campaignId);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    (async () => {
      if (!selectedId) { setDetail(null); return; }
      try {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (statusFilter) params.set('status', statusFilter);
        if (query) params.set('q', query);
        if (skip) params.set('skip', String(skip));
        if (pageSize) params.set('limit', String(pageSize));
        const r = await fetch(`/api/reports/campaigns/${encodeURIComponent(selectedId)}?${params.toString()}`, { headers: (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) ? { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } : {} });
        const d = await r.json();
        setDetail({ counts: d.counts || {}, events: d.events || [] });
      } catch {
        setDetail(null);
      }
    })();
  }, [selectedId, from, to, statusFilter, query, skip, pageSize]);

  const columns = ['sent', 'delivered', 'read', 'failed'];
  const summary = useMemo(() => {
    const items = campaigns.map(c => {
      const counts = c.counts || {};
      const delivered = (counts['delivered'] || 0) + (counts['sent'] || 0); // algunos webhooks no separan
      const read = counts['read'] || 0;
      const failed = counts['failed'] || counts['undelivered'] || 0;
      const total = c.total || delivered + failed;
      const rate = total ? Math.round((delivered / total) * 100) : 0;
      const readRate = total ? Math.round((read / total) * 100) : 0;
      return { ...c, delivered, read, failed, total: total || 0, rate, readRate, campaignName: (c as any).campaignName };
    });
    return items;
  }, [campaigns]);

  const exportCampaign = async (campaignId: string) => {
    try {
      const full = await getCampaign(campaignId);
      const meta = full.meta || {};
      const counts = full.counts || {};
      
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
        const body = String(meta.templateBody || '').replace(/\{\{1\}\}/g, e.lastRecipient || '');
        const recipient = e.lastRecipient || '';
        const messageId = e.messageId || '';
        const status = e.status ? e.status.toUpperCase() : '';
        const timestamp = e.updatedAt ? new Date(e.updatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '';
        
        // Determinar qué columna de fecha usar según el estado
        let fechaEnvio = timestamp;
        let fechaConfirmado = '';
        let fechaEntrega = '';
        let fechaLeido = '';
        
        if (status === 'SENT') {
          fechaEnvio = timestamp;
        } else if (status === 'DELIVERED') {
          fechaConfirmado = timestamp;
          fechaEntrega = timestamp;
        } else if (status === 'READ') {
          fechaConfirmado = timestamp;
          fechaEntrega = timestamp;
          fechaLeido = timestamp;
        }

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
        <Button variant="secondary" icon={RefreshCw} onClick={load} disabled={loading}>Actualizar</Button>
      </div>

      {/* Filtros globales por fecha */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <div className="text-xs text-gray-400 mb-1">Desde</div>
            <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700" />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Hasta</div>
            <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700" />
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-gray-400 mb-1">Buscar (destinatario)</div>
            <input placeholder="57..." value={query} onChange={e => setQuery(e.target.value)} className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700" />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setSkip(0); load(); }}>Aplicar</Button>
            <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); setQuery(''); setStatusFilter(''); setSkip(0); load(); }}>Limpiar</Button>
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
              setSkip(0);
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
                  <tr key={c.campaignId} className={`border-t border-gray-800 ${selectedId === c.campaignId ? 'bg-gray-800/40' : ''}`}>
                    <td className="px-2 py-2 text-gray-300">{new Date(c.timestamp).toLocaleString()}</td>
                    <td className="px-2 py-2 text-white">{(c as any).campaignName || '-'}</td>
                    <td className="px-2 py-2 text-gray-300">{c.templateName || '-'}</td>
                    <td className="px-2 py-2 text-gray-300">{c.total ?? '-'}</td>
                    <td className="px-2 py-2 text-green-400">{c.delivered}</td>
                    <td className="px-2 py-2 text-blue-400">{c.read}</td>
                    <td className="px-2 py-2 text-red-400">{c.failed}</td>
                    <td className="px-2 py-2 text-white font-semibold">{c.rate}%</td>
                    <td className="px-2 py-2 text-white">{c.readRate}%</td>
                    <td className="px-2 py-2 text-right flex gap-2">
                      <Button size="sm" onClick={() => setSelectedId(c.campaignId)} icon={ChevronRight}>Detalle</Button>
                      <Button size="sm" variant="secondary" icon={Download} onClick={() => exportCampaign(c.campaignId)}>Exportar</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail */}
      {selectedId && detail && (
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">Estado</div>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setSkip(0); }} className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700">
                <option value="">Todos</option>
                <option value="sent">Enviado</option>
                <option value="delivered">Entregado</option>
                <option value="read">Leído</option>
                <option value="failed">Error</option>
                <option value="undelivered">No entregado</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Tamaño de página</div>
              <select value={String(pageSize)} onChange={e => { setPageSize(Number(e.target.value)); setSkip(0); }} className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700">
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {columns.map(k => (
              <div key={k} className="p-3 rounded bg-gray-800">
                <div className="text-gray-400 text-xs uppercase">{k}</div>
                <div className="text-white text-lg font-semibold">{detail.counts[k] || 0}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="px-2 py-2">Mensaje</th>
                  <th className="px-2 py-2">Estado</th>
                  <th className="px-2 py-2">Destinatario</th>
                  <th className="px-2 py-2">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {detail.events.map((e: any) => (
                  <tr key={e.messageId || e._id} className="border-t border-gray-800">
                    <td className="px-2 py-2 text-gray-300">{e.messageId}</td>
                    <td className="px-2 py-2 text-white">{e.status}</td>
                    <td className="px-2 py-2 text-gray-400">{e.lastRecipient || '-'}</td>
                    <td className="px-2 py-2 text-gray-400">{e.updatedAt ? new Date(e.updatedAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-4">
            <Button variant="secondary" onClick={() => setSkip(Math.max(0, skip - pageSize))} disabled={skip === 0}>Anterior</Button>
            <div className="text-gray-400 text-sm">Mostrando {detail.events.length} filas · Offset {skip}</div>
            <Button variant="secondary" onClick={() => setSkip(skip + pageSize)} disabled={detail.events.length < pageSize}>Siguiente</Button>
          </div>
        </Card>
      )}
    </motion.div>
  );
}
