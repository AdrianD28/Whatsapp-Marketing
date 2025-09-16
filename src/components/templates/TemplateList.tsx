import { motion } from 'framer-motion';
import { CheckCircle, Clock, XCircle, FileText, Trash2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Template } from '../../types';
import { Button } from '../ui/Button';

interface TemplateListProps {
  templates: Template[];
  onDelete?: (name: string) => Promise<void> | void;
  onPreview?: (template: Template) => void;
}

export function TemplateList({ templates, onDelete, onPreview }: TemplateListProps) {
  const getStatusIcon = (status: Template['status']) => {
    switch (status) {
      case 'APPROVED': return CheckCircle;
      case 'PENDING': return Clock;
      case 'REJECTED': return XCircle;
      default: return FileText;
    }
  };

  const getStatusColor = (status: Template['status']) => {
    switch (status) {
      case 'APPROVED': return 'text-green-400 bg-green-900/20';
      case 'PENDING': return 'text-yellow-400 bg-yellow-900/20';
      case 'REJECTED': return 'text-red-400 bg-red-900/20';
      default: return 'text-gray-400 bg-gray-900/20';
    }
  };

  const getStatusText = (status: Template['status']) => {
    switch (status) {
      case 'APPROVED': return 'Aprobada';
      case 'PENDING': return 'Pendiente';
      case 'REJECTED': return 'Rechazada';
      default: return 'Desconocido';
    }
  };

  if (templates.length === 0) {
    return (
      <Card className="text-center py-12">
        <FileText className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-300 mb-2">No hay plantillas</h3>
        <p className="text-gray-500">Crea tu primera plantilla para comenzar</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {templates.map((template, index) => {
        const StatusIcon = getStatusIcon(template.status);
        const statusColor = getStatusColor(template.status);
        const bodyComponent = template.components.find(c => c.type === 'BODY');
        
        return (
          <motion.div
            key={template.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card hover className="cursor-pointer" onClick={() => onPreview?.(template)}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{template.name}</h3>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                      <StatusIcon className="w-3 h-3" />
                      {getStatusText(template.status)}
                    </div>
                  </div>
                  
                  <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                    {bodyComponent?.text || 'Sin contenido'}
                  </p>
                  
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Categoría: {template.category}</span>
                    <span>Idioma: {template.language}</span>
                    {template.created_time && (
                      <span>Creado: {new Date(template.created_time).toLocaleDateString('es-ES')}</span>
                    )}
                  </div>
                </div>
                
                <div className="ml-4 flex items-center gap-2">
                  <FileText className="w-8 h-8 text-gray-500" />
                  {onDelete && (
                    <Button
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = confirm(`¿Eliminar la plantilla "${template.name}"?`);
                        if (!ok) return;
                        await onDelete(template.name);
                      }}
                    >
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}