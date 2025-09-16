import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Info, AlertTriangle, Clock } from 'lucide-react';
import { Card } from '../ui/Card';
import { Activity } from '../../types';

interface ActivityFeedProps {
  activities: Activity[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const getIcon = (type: Activity['type']) => {
    switch (type) {
      case 'success': return CheckCircle;
      case 'error': return XCircle;
      case 'warning': return AlertTriangle;
      default: return Info;
    }
  };

  const getIconColor = (type: Activity['type']) => {
    switch (type) {
      case 'success': return 'text-green-400 bg-green-900/20';
      case 'error': return 'text-red-400 bg-red-900/20';
      case 'warning': return 'text-yellow-400 bg-yellow-900/20';
      default: return 'text-blue-400 bg-blue-900/20';
    }
  };

  const formatTime = (date: Date) => {
    return new Intl.RelativeTimeFormat('es', { numeric: 'auto' }).format(
      Math.floor((date.getTime() - Date.now()) / (1000 * 60)),
      'minute'
    );
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Actividad Reciente</h3>
        <Clock className="w-5 h-5 text-gray-400" />
      </div>
      
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Info className="w-12 h-12 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-400">No hay actividad reciente</p>
          </div>
        ) : (
          activities.map((activity, index) => {
            const Icon = getIcon(activity.type);
            const iconColor = getIconColor(activity.type);
            
            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-gray-700/50 hover:bg-gray-700 transition-colors"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconColor}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium">{activity.title}</p>
                  <p className="text-gray-400 text-sm mt-1">{activity.description}</p>
                  <p className="text-gray-500 text-xs mt-2">
                    {formatTime(activity.timestamp)}
                  </p>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </Card>
  );
}