// React imported implicitly by JSX runtime
import { motion } from 'framer-motion';
import { FileText, CheckCircle, Clock, Users } from 'lucide-react';
import { StatsCard } from '../components/dashboard/StatsCard';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { useAppContext } from '../context/AppContext';
import { useEffect } from 'react';
import { useDbApi } from '../hooks/useDbApi';

export function Dashboard() {
  const { templates, contacts, activities, apiCredentials, clearSendHistory, addSendSession } = useAppContext();
  const db = useDbApi(apiCredentials);

  useEffect(() => {
    const load = async () => {
      try {
        const persisted = await db.loadSessions();
        if (Array.isArray(persisted)) {
          clearSendHistory();
          persisted.forEach((s: any) => addSendSession({
            templateName: s.templateName,
            templateCategory: s.templateCategory,
            templateBody: s.templateBody,
            total: s.total,
            success: s.success,
            reached: s.reached,
          }));
        }
      } catch {}
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiCredentials]);

  const stats = {
    totalTemplates: templates.length,
    approvedTemplates: templates.filter(t => t.status === 'APPROVED').length,
    pendingTemplates: templates.filter(t => t.status === 'PENDING').length,
    totalContacts: contacts.length,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Plantillas Totales"
          value={stats.totalTemplates}
          icon={FileText}
          color="gray"
        />
        <StatsCard
          title="Aprobadas"
          value={stats.approvedTemplates}
          icon={CheckCircle}
          color="green"
        />
        <StatsCard
          title="Pendientes"
          value={stats.pendingTemplates}
          icon={Clock}
          color="yellow"
        />
        <StatsCard
          title="Contactos"
          value={stats.totalContacts}
          icon={Users}
          color="blue"
        />
      </div>

      {/* Activity Feed */}
      <div className="flex items-center justify-between">
        <h3 className="text-white text-lg font-semibold">Actividad reciente</h3>
      </div>
      <ActivityFeed activities={activities} />
    </motion.div>
  );
}