import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  FileText, 
  Users, 
  Send, 
  MessageSquare,
  Menu,
  X
} from 'lucide-react';
import { Button } from '../ui/Button';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'templates', label: 'Plantillas', icon: FileText },
  { id: 'contacts', label: 'Contactos', icon: Users },
  { id: 'send', label: 'Envío Masivo', icon: Send },
  { id: 'statistics', label: 'Estadísticas', icon: BarChart3 },
];

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <motion.aside
      initial={{ x: -280 }}
      animate={{ x: 0, width: isCollapsed ? 80 : 280 }}
      className="bg-gray-900 border-r border-gray-700 flex flex-col h-full"
    >
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <motion.div 
            className="flex items-center gap-3"
            animate={{ opacity: isCollapsed ? 0 : 1 }}
          >
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            {!isCollapsed && (
              <div>
                <h1 className="text-lg font-bold text-white">WhatsApp</h1>
                <p className="text-xs text-gray-400">Masivo Pro</p>
              </div>
            )}
          </motion.div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            icon={isCollapsed ? Menu : X}
            className="!p-2"
          >
            <span className="sr-only">Toggle</span>
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          return (
            <motion.button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              whileHover={{ x: isActive ? 0 : 4 }}
              whileTap={{ scale: 0.98 }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                ${isActive 
                  ? 'bg-green-600 text-white shadow-lg' 
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }
              `}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <motion.span
                animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto' }}
                className="font-medium overflow-hidden whitespace-nowrap"
              >
                {item.label}
              </motion.span>
            </motion.button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
        <motion.div
          animate={{ opacity: isCollapsed ? 0 : 1 }}
          className="text-xs text-gray-500 text-center"
        >
          {!isCollapsed && (
            <>
              <p>© 2025 WhatsApp Masivo</p>
              <p>Cumple con políticas de Meta</p>
            </>
          )}
        </motion.div>
      </div>
    </motion.aside>
  );
}