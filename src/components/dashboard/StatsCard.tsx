import React from 'react';
import { motion } from 'framer-motion';
import { DivideIcon as LucideIcon } from 'lucide-react';
import { Card } from '../ui/Card';

interface StatsCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color: 'green' | 'blue' | 'yellow' | 'red' | 'gray';
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function StatsCard({ title, value, icon: Icon, color, trend }: StatsCardProps) {
  const colorClasses = {
    green: 'bg-green-600 text-green-100',
    blue: 'bg-blue-600 text-blue-100',
    yellow: 'bg-yellow-600 text-yellow-100',
    red: 'bg-red-600 text-red-100',
    gray: 'bg-gray-600 text-gray-100',
  };

  return (
    <Card hover className="relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
          <motion.p
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold text-white"
          >
            {value.toLocaleString()}
          </motion.p>
          {trend && (
            <div className={`flex items-center mt-2 text-sm ${
              trend.isPositive ? 'text-green-400' : 'text-red-400'
            }`}>
              <span>{trend.isPositive ? '↗' : '↘'}</span>
              <span className="ml-1">{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      
      {/* Decorative gradient */}
      <div className={`absolute top-0 right-0 w-20 h-20 opacity-10 ${colorClasses[color]} rounded-full -translate-y-10 translate-x-10`} />
    </Card>
  );
}