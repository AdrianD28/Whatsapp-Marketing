import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send as SendIcon, Play, Pause, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useAppContext } from '../context/AppContext';
import { useApi } from '../hooks/useApi';
import toast from 'react-hot-toast';

interface SendFormData {
  templateName: string;
  delay: number;
}

export function Send() {
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const { templates, contacts, sendProgress, setSendProgress, apiCredentials, addActivity } = useAppContext();
  const { sendMessage } = useApi(apiCredentials);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<SendFormData>({
    defaultValues: { delay: 5 }
  });

  const approvedTemplates = templates.filter(t => t.status === 'APPROVED');
  const selectedTemplateName = watch('templateName');
  const selectedTemplate = templates.find(t => t.name === selectedTemplateName);

  const onSubmit = async (data: SendFormData) => {
    if (contacts.length === 0) {
      toast.error('No hay contactos para enviar');
      return;
    }

    if (!selectedTemplate) {
      toast.error('Selecciona una plantilla válida');
      return;
    }

    setSending(true);
    setSendProgress({ total: contacts.length, sent: 0, percentage: 0, isActive: true });
    
    addActivity({
      title: 'Envío iniciado',
      description: `Comenzando envío de ${contacts.length} mensajes`,
      type: 'info',
    });

    const bodyComponent = selectedTemplate.components.find(c => c.type === 'BODY');
    const parameters = bodyComponent?.text?.match(/\{\{(\d+)\}\}/g);
    const languages = [selectedTemplate.language, 'es_ES', 'es_LA', 'es_MX'];

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < contacts.length; i++) {
      if (paused) {
        await new Promise(resolve => {
          const checkPause = () => {
            if (!paused) resolve(undefined);
            else setTimeout(checkPause, 100);
          };
          checkPause();
        });
      }

      const contact = contacts[i];
      
      try {
        let messageSent = false;
        
        for (const lang of languages) {
          try {
            const messageParams = parameters ? 
              parameters.map(p => {
                const index = p.replace(/\{\{|\}\}/g, '');
                return index === '1' ? contact.Nombre : contact.Numero;
              }) : [];

            await sendMessage(contact.Numero, selectedTemplate.name, lang, messageParams);
            messageSent = true;
            successCount++;
            break;
          } catch (error: any) {
            if (error.message.includes('132001')) {
              continue; // Try next language
            }
            throw error;
          }
        }

        if (!messageSent) {
          throw new Error('No se pudo enviar con ningún idioma disponible');
        }

      } catch (error: any) {
        console.error('Error sending message:', error);
        errorCount++;
        
        let errorMessage = error.message;
        if (errorMessage.includes('Invalid OAuth access token')) {
          toast.error('Credenciales inválidas. Reconfigura tu API');
          break;
        }
      }

      const newProgress = {
        total: contacts.length,
        sent: i + 1,
        percentage: Math.round(((i + 1) / contacts.length) * 100),
        isActive: true
      };
      
      setSendProgress(newProgress);
      
      if (i < contacts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, data.delay * 1000));
      }
    }

    setSending(false);
    setSendProgress(prev => ({ ...prev, isActive: false }));
    
    addActivity({
      title: 'Envío completado',
      description: `${successCount} mensajes enviados exitosamente, ${errorCount} errores`,
      type: successCount > errorCount ? 'success' : 'warning',
    });

    toast.success(`Envío completado: ${successCount} exitosos, ${errorCount} errores`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Envío Masivo</h2>
        <p className="text-gray-400 mt-1">Configura y ejecuta campañas de mensajes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <Card>
          <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <SendIcon className="w-5 h-5" />
            Configuración de Envío
          </h3>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                Plantilla a Enviar
              </label>
              <select
                {...register('templateName', { required: 'Selecciona una plantilla' })}
                className="w-full rounded-lg border-gray-600 bg-gray-700 text-white focus:border-green-500 focus:ring-green-500"
                disabled={sending}
              >
                <option value="">Selecciona una plantilla aprobada</option>
                {approvedTemplates.map(template => (
                  <option key={template.name} value={template.name}>
                    {template.name} ({template.category})
                  </option>
                ))}
              </select>
              {errors.templateName && (
                <p className="text-sm text-red-400 mt-1">{errors.templateName.message}</p>
              )}
            </div>

            <Input
              label="Retraso entre mensajes (segundos)"
              type="number"
              min={1}
              max={60}
              {...register('delay', { 
                required: 'El retraso es obligatorio',
                min: { value: 1, message: 'Mínimo 1 segundo' },
                max: { value: 60, message: 'Máximo 60 segundos' }
              })}
              error={errors.delay?.message}
              helperText="Recomendado: 5-10 segundos para evitar bloqueos"
              disabled={sending}
            />

            <div className="flex gap-3 pt-4">
              {!sending ? (
                <Button
                  type="submit"
                  icon={Play}
                  disabled={contacts.length === 0 || !selectedTemplateName}
                  className="flex-1"
                >
                  Iniciar Envío
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  icon={paused ? Play : Pause}
                  onClick={() => setPaused(!paused)}
                  className="flex-1"
                >
                  {paused ? 'Reanudar' : 'Pausar'}
                </Button>
              )}
            </div>
          </form>
        </Card>

        {/* Preview & Progress */}
        <div className="space-y-6">
          {/* Contacts Preview */}
          <Card>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Contactos ({contacts.length})
            </h3>
            
            {contacts.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400">No hay contactos cargados</p>
                <p className="text-gray-500 text-sm">Ve a la sección de Contactos para cargar tu lista</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {contacts.slice(0, 5).map((contact, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                    <span className="text-white text-sm">{contact.Nombre}</span>
                    <span className="text-gray-400 text-sm">{contact.Numero}</span>
                  </div>
                ))}
                {contacts.length > 5 && (
                  <p className="text-gray-400 text-sm text-center py-2">
                    ... y {contacts.length - 5} contactos más
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Progress */}
          {sendProgress.isActive && (
            <Card>
              <h3 className="text-lg font-semibold text-white mb-4">Progreso del Envío</h3>
              
              <div className="space-y-4">
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <motion.div
                    className="bg-green-600 h-3 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${sendProgress.percentage}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">
                    {sendProgress.sent} / {sendProgress.total} enviados
                  </span>
                  <span className="text-white font-medium">
                    {sendProgress.percentage}%
                  </span>
                </div>
                
                {paused && (
                  <div className="text-center">
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-900/20 text-yellow-400 rounded-full text-sm">
                      <Pause className="w-4 h-4" />
                      Envío pausado
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </motion.div>
  );
}