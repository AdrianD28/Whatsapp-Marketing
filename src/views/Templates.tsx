import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { TemplateForm } from '../components/templates/TemplateForm';
import { TemplateList } from '../components/templates/TemplateList';
import { TemplatePreviewModal } from '../components/templates/TemplatePreviewModal';
import { useAppContext } from '../context/AppContext';
import { useApi } from '../hooks/useApi';

export function Templates() {
  const [showForm, setShowForm] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const { templates, apiCredentials, addActivity, setTemplates } = useAppContext();
  const { createTemplate, fetchTemplates, deleteTemplate, loading } = useApi(apiCredentials);

  const handleCreateTemplate = async (templateData: any) => {
    try {
      await createTemplate(templateData);
      // Optimistic update: mostrar como Pendiente de inmediato
      const optimistic = {
        id: `temp-${Date.now()}`,
        name: templateData.name,
        status: 'PENDING' as const,
        category: templateData.category?.toUpperCase?.() ?? templateData.category,
        language: templateData.language,
        components: templateData.components || [],
        created_time: new Date().toISOString(),
      };
      setTemplates([optimistic, ...templates]);
      addActivity({
        title: 'Plantilla creada',
        description: `Nueva plantilla "${templateData.name}" enviada para revisión`,
        type: 'success',
      });
      // Refrescar lista desde Meta para reflejar estado PENDING/APROBADA
      const latest = await fetchTemplates();
      setTemplates(latest);
      setShowForm(false);
    } catch (error: any) {
      // Extraer mensaje de error detallado de la API
      let errorMessage = 'Error desconocido';
      let errorTitle = 'Error al crear plantilla';
      
      if (error?.detail?.error) {
        const apiError = error.detail.error;
        errorTitle = apiError.error_user_title || 'Error de validación';
        errorMessage = apiError.error_user_msg || apiError.message || 'Error en la API de WhatsApp';
        
        // Agregar sugerencias según el tipo de error
        if (apiError.error_subcode === 2388158) {
          errorMessage += '\n\n💡 Sugerencia: No puedes mezclar botones de respuesta rápida con botones de URL. Usa solo un tipo de botón:\n• Máximo 3 botones de respuesta rápida\n• O máximo 2 botones con enlaces';
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      // Mostrar modal con el error
      alert(`❌ ${errorTitle}\n\n${errorMessage}`);
      
      addActivity({
        title: errorTitle,
        description: errorMessage,
        type: 'error',
      });
    }
  };

  const handleDeleteTemplate = async (tpl: { id?: string; name: string }) => {
    // Optimistic: quitar de la lista local inmediatamente
    const previous = templates;
    const filtered = templates.filter(t => t.name !== tpl.name);
    setTemplates(filtered);
    try {
      await deleteTemplate(tpl);
      const latest = await fetchTemplates();
      setTemplates(latest);
      addActivity({
        title: 'Plantilla eliminada',
        description: `Se eliminó "${tpl.name}"`,
        type: 'success',
      });
    } catch (error) {
      setTemplates(previous); // rollback
      addActivity({
        title: 'Error al eliminar',
        description: error instanceof Error ? error.message : 'Error desconocido',
        type: 'error',
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestión de Plantillas</h2>
          <p className="text-gray-400 mt-1">Crea y administra tus plantillas de mensajes</p>
        </div>
        <Button
          icon={Plus}
          onClick={() => setShowForm(!showForm)}
          variant={showForm ? 'secondary' : 'primary'}
        >
          {showForm ? 'Cancelar' : 'Nueva Plantilla'}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <TemplateForm
          onSubmit={handleCreateTemplate}
          onCancel={() => setShowForm(false)}
          loading={loading}
        />
      )}

      {/* Templates List */}
      <TemplateList 
        templates={templates} 
        onDelete={handleDeleteTemplate}
        onPreview={(tpl) => { setPreviewTemplate(tpl); setPreviewOpen(true); }}
      />

      <TemplatePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        template={previewTemplate}
      />
    </motion.div>
  );
}