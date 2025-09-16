import React from 'react';
import { motion } from 'framer-motion';
import { FileText, CheckCircle, Clock, Users } from 'lucide-react';
import { StatsCard } from '../components/dashboard/StatsCard';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { useAppContext } from '../context/AppContext';

export function Dashboard() {
  const { templates, contacts, activities } = useAppContext();

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
      <ActivityFeed activities={activities} />
    </motion.div>
  );
}