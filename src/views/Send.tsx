import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send as SendIcon, Play, Pause, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useAppContext } from '../context/AppContext';
import { useApi } from '../hooks/useApi';
import toast from 'react-hot-toast';
import { HelpTooltip } from '../components/ui/HelpTooltip';
import { Modal } from '../components/ui/Modal';

interface SendFormData {
  templateName: string;
  delay: number;
  headerImageUrl?: string;
  headerImageFile?: FileList;
}

export function Send() {
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [checklistConfirmed, setChecklistConfirmed] = useState(false);
  const [checkOptIn, setCheckOptIn] = useState(false);
  const [checkOptOut, setCheckOptOut] = useState(false);
  const [checkCoherence, setCheckCoherence] = useState(false);
  const [checkFrequency, setCheckFrequency] = useState(false);
  const [pendingData, setPendingData] = useState<SendFormData | null>(null);
  const { templates, contacts, sendProgress, setSendProgress, apiCredentials, addActivity } = useAppContext();
  const { sendMessage } = useApi(apiCredentials);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<SendFormData>({
    defaultValues: { delay: 5 }
  });

  const approvedTemplates = templates.filter(t => t.status === 'APPROVED');
  const selectedTemplateName = watch('templateName');
  const selectedTemplate = templates.find(t => t.name === selectedTemplateName);

  // Cache local de media por plantilla: { [templateName]: { id?: string, link?: string } }
  const CACHE_KEY = 'headerMediaByTemplate';
  const loadCache = (): Record<string, { id?: string; link?: string }> => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
  };
  const saveCache = (map: Record<string, { id?: string; link?: string }>) => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  };
  const getTemplateMedia = (name?: string) => {
    if (!name) return undefined;
    const m = loadCache(); return m[name];
  };
  const setTemplateMedia = (name: string, entry: { id?: string; link?: string }) => {
    const m = loadCache(); m[name] = entry; saveCache(m);
  };

  // Borrar todo el cache de media al abrir la vista de Envío (comportamiento por defecto solicitado)
  useEffect(() => {
    try { localStorage.removeItem(CACHE_KEY); } catch {}
  }, []);

  // Borrar el cache de la plantilla seleccionada cuando cambia de selección
  useEffect(() => {
    if (selectedTemplateName) {
      setTemplateMedia(selectedTemplateName, {} as any);
    }
  }, [selectedTemplateName]);

  const isValidHttpUrl = (s?: string) => !!s && /^https?:\/\//i.test(s);

  // Strict Mode (localStorage)
  const STRICT_KEY = 'strictMode';
  const [strictMode, setStrictMode] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(STRICT_KEY);
      return v === null ? false : v === 'true';
    } catch { return true; }
  });
  const toggleStrictMode = () => {
    const next = !strictMode;
    setStrictMode(next);
    try { localStorage.setItem(STRICT_KEY, String(next)); } catch {}
  };

  const onSubmit = async (data: SendFormData) => {
    if (contacts.length === 0) {
      toast.error('No hay contactos para enviar');
      return;
    }

    if (!selectedTemplate) {
      toast.error('Selecciona una plantilla válida');
      return;
    }

    // Validar si la plantilla requiere HEADER de tipo IMAGE
    const headerComponent = selectedTemplate.components.find(c => c.type === 'HEADER');
    const requiresHeaderImage = headerComponent && (headerComponent as any).format === 'IMAGE';
    // Checklist en modo estricto
    if (strictMode && !checklistConfirmed) {
      setPendingData(data);
      setShowChecklist(true);
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
  const languages = [selectedTemplate.language, 'es_ES', 'es_LA', 'es_MX', 'en_US'];

  let successCount = 0;
  let errorCount = 0;
  let mediaLogged = false;

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
  // Normalizar número a dígitos (paridad con ejemplos cURL sin '+')
  const toNumber = String(contact.Numero || '').replace(/[^\d]/g, '').replace(/^00/, '');
      
      try {
        let messageSent = false;
        
        for (const lang of languages) {
          try {
            // Construir parámetros en el formato esperado por la API
            // - Header IMAGE: { type: 'image', image: { link: url } }
            // - Body placeholders: { type: 'text', text: value }
            const bodyParams = parameters ? 
              parameters.map(p => {
                const index = p.replace(/\{\{|\}\}/g, '');
                const value = index === '1' ? contact.Nombre : contact.Numero;
                return { type: 'text', text: String(value) } as any;
              }) : [];

            const params: any[] = [...bodyParams];
            if (requiresHeaderImage) {
              const cached = getTemplateMedia(selectedTemplate.name);
              if (strictMode) {
                // Estricto: solo media id
                if (cached?.id) {
                  params.unshift({ type: 'image', image: { id: cached.id } });
                  if (!mediaLogged) {
                    addActivity({ title: 'Media fijada (estricto)', description: `Usando media id ${cached.id} para ${selectedTemplate.name}`, type: 'info' });
                    mediaLogged = true;
                  }
                } else {
                  const fileList = data.headerImageFile;
                  const file = (fileList && (fileList as any)[0]) as File | undefined;
                  if (file && file.name && typeof (file as any).arrayBuffer === 'function' && apiCredentials) {
                    try {
                      const form = new FormData();
                      form.append('file', file, file.name);
                      if (apiCredentials?.phoneNumberId) form.append('phoneNumberId', apiCredentials.phoneNumberId);
                      if (apiCredentials?.accessToken) form.append('accessToken', apiCredentials.accessToken);
                      const r = await fetch('/upload-media', {
                        method: 'POST',
                        body: form,
                        headers: {
                          'x-phone-number-id': apiCredentials.phoneNumberId,
                          'x-access-token': apiCredentials.accessToken,
                        }
                      });
                      if (r.ok) {
                        const j = await r.json();
                        if (j?.id) {
                          setTemplateMedia(selectedTemplate.name, { id: j.id });
                          params.unshift({ type: 'image', image: { id: j.id } });
                          if (!mediaLogged) {
                            addActivity({ title: 'Media subida (estricto)', description: `Se obtuvo media id ${j.id} para ${selectedTemplate.name}`, type: 'success' });
                            mediaLogged = true;
                          }
                        } else {
                          throw new Error('No se recibió media id al subir la imagen.');
                        }
                      } else {
                        console.warn('upload-media failed on send', await r.text().catch(() => ''));
                        throw new Error('Fallo al subir la imagen para obtener media id.');
                      }
                    } catch (e) {
                      throw new Error('Error al subir imagen para media id en modo estricto.');
                    }
                  } else {
                    throw new Error('Modo estricto: Debes configurar una imagen (media id) subiendo un archivo antes de enviar.');
                  }
                }
              } else {
                // No estricto: idem anterior (id preferente, luego link válido, luego subir)
                if (cached?.id) {
                  params.unshift({ type: 'image', image: { id: cached.id } });
                } else if (cached?.link && isValidHttpUrl(cached.link)) {
                  params.unshift({ type: 'image', image: { link: cached.link } });
                } else {
                  const fileList = data.headerImageFile;
                  const file = (fileList && (fileList as any)[0]) as File | undefined;
                  let added = false;
                  if (file && file.name && typeof (file as any).arrayBuffer === 'function' && apiCredentials) {
                    try {
                      const form = new FormData();
                      form.append('file', file, file.name);
                      if (apiCredentials?.phoneNumberId) form.append('phoneNumberId', apiCredentials.phoneNumberId);
                      if (apiCredentials?.accessToken) form.append('accessToken', apiCredentials.accessToken);
                      const r = await fetch('/upload-media', {
                        method: 'POST',
                        body: form,
                        headers: {
                          'x-phone-number-id': apiCredentials.phoneNumberId,
                          'x-access-token': apiCredentials.accessToken,
                        }
                      });
                      if (r.ok) {
                        const j = await r.json();
                        if (j?.id) {
                          setTemplateMedia(selectedTemplate.name, { id: j.id });
                          params.unshift({ type: 'image', image: { id: j.id } });
                          added = true;
                        }
                      } else {
                        console.warn('upload-media failed on send', await r.text().catch(() => ''));
                      }
                    } catch (e) { console.warn('upload-media error on send', e); }
                  }
                  if (!added && isValidHttpUrl(data.headerImageUrl)) {
                    setTemplateMedia(selectedTemplate.name, { link: data.headerImageUrl! });
                    params.unshift({ type: 'image', image: { link: data.headerImageUrl } });
                    added = true;
                  }
                  if (!added) {
                    throw new Error('La plantilla requiere imagen en header. Sube una imagen o proporciona una URL http(s).');
                  }
                }
              }
            }

            const resp = await sendMessage(toNumber, selectedTemplate.name, lang, params);
            try {
              const msgId = resp?.messages?.[0]?.id;
              if (msgId && !mediaLogged) {
                addActivity({ title: 'Mensaje aceptado', description: `ID: ${msgId} (${lang})`, type: 'success' });
              }
            } catch {}
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
        const waitSeconds = strictMode ? Math.max(data.delay, 5) : data.delay;
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      }
    }

  setSending(false);
  setSendProgress({ ...sendProgress, isActive: false });
  setChecklistConfirmed(false);
  setShowChecklist(false);
  setPendingData(null);
  // Limpiar cache de media al finalizar el envío
  try { localStorage.removeItem(CACHE_KEY); } catch {}
    
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
            {/* Modo estricto */}
            <div className="flex items-center justify-between p-3 rounded bg-gray-800">
              <div>
                <p className="text-white font-medium">Modo estricto de cumplimiento</p>
                <p className="text-gray-400 text-sm">Usar solo media id en header, checklist previo y delay mínimo 5s.</p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <span className="mr-3 text-sm text-gray-300">Off</span>
                <input type="checkbox" className="sr-only" checked={strictMode} onChange={toggleStrictMode} />
                <div className="relative">
                  <div className={`w-12 h-6 rounded-full transition ${strictMode ? 'bg-green-600' : 'bg-gray-600'}`}></div>
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${strictMode ? 'translate-x-6' : ''}`}></div>
                </div>
                <span className="ml-3 text-sm text-gray-300">On</span>
              </label>
            </div>
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

            {/* Header IMAGE: en modo estricto solo media id; sin estricto mostrar cache + opciones */}
            {selectedTemplate && selectedTemplate.components.some((c: any) => c.type === 'HEADER' && c.format === 'IMAGE') && (
              (() => {
                const cached = getTemplateMedia(selectedTemplate.name);
                if (strictMode) {
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-200 mb-1">Imagen de cabecera (modo estricto)</label>
                          <p className="text-xs text-gray-400">Se exige media id. Sube una imagen una sola vez para obtenerla y quedará fijada por plantilla.</p>
                          <div className="mt-2 text-sm text-gray-300">
                            {cached?.id ? `Media id configurado: ${cached.id}` : 'Sin media id configurado aún.'}
                          </div>
                        </div>
                        <HelpTooltip title="Políticas Meta (estricto)" tooltip="Reglas de uso de imagen en header">
                          <ul className="list-disc ml-4">
                            <li>Solo se usa media id, evitando URLs dinámicas.</li>
                            <li>La imagen debe ser coherente con el template y el contenido.</li>
                          </ul>
                        </HelpTooltip>
                      </div>
                      {cached?.id && (
                        <div>
                          <Button type="button" variant="secondary" onClick={() => { setTemplateMedia(selectedTemplate.name, {} as any); toast.success('Media cache limpiado'); }}>Borrar media de esta plantilla</Button>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-200">Subir imagen (obtener/actualizar media id)</label>
                        <input type="file" accept="image/*" className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600" {...register('headerImageFile')} />
                      </div>
                    </div>
                  );
                }
                if (cached?.id || (cached?.link && isValidHttpUrl(cached.link))) {
                  return (
                    <div className="space-y-2">
                      <div className="text-sm text-gray-300">Imagen de cabecera configurada: {cached.id ? `media id ${cached.id}` : cached.link}</div>
                      <div className="text-xs text-gray-500">Se usará automáticamente para este envío. Puedes cambiarla abajo si deseas.</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input label="URL de imagen (opcional)" placeholder="https://..." {...register('headerImageUrl')} disabled={sending} />
                        <div>
                          <label className="block text-sm font-medium text-gray-200">Subir imagen (opcional)</label>
                          <input type="file" accept="image/*" className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600" {...register('headerImageFile')} />
                        </div>
                      </div>
                      <div>
                        <Button type="button" variant="secondary" onClick={() => { setTemplateMedia(selectedTemplate.name, {} as any); toast.success('Media cache limpiado'); }}>Borrar media de esta plantilla</Button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        label="URL de imagen para cabecera"
                        placeholder="https://..."
                        {...register('headerImageUrl')}
                        error={errors.headerImageUrl?.message}
                        helperText="O pega una URL pública o sube un archivo (usaremos media id)."
                        disabled={sending}
                      />
                      <HelpTooltip title="Políticas Meta (imagen header)" tooltip="Por qué necesitas pasar imagen al enviar">
                        <ul className="list-disc ml-4">
                          <li>La imagen de aprobación es solo ejemplo; en envío debes adjuntar una imagen válida.</li>
                          <li>Recomendado: sube una imagen una vez; reutilizaremos su media id automáticamente.</li>
                        </ul>
                      </HelpTooltip>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-200">Subir imagen una sola vez (se usa media id)</label>
                      <input type="file" accept="image/*" className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600" {...register('headerImageFile')} />
                    </div>
                  </div>
                );
              })()
            )}

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

      {/* Checklist Modal (estricto) */}
      {showChecklist && (
        <Modal isOpen={showChecklist} onClose={() => setShowChecklist(false)} title="Checklist de cumplimiento">
          <div className="space-y-3 text-sm text-gray-200">
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={checkOptIn} onChange={e => setCheckOptIn(e.target.checked)} /> Tengo consentimiento explícito (opt-in) de los destinatarios.</label>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={checkOptOut} onChange={e => setCheckOptOut(e.target.checked)} /> Incluyo mecanismo de baja claro (p.ej., "Responde STOP para dejar de recibir").</label>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={checkCoherence} onChange={e => setCheckCoherence(e.target.checked)} /> La imagen y el contenido son coherentes con la plantilla y su categoría.</label>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={checkFrequency} onChange={e => setCheckFrequency(e.target.checked)} /> La frecuencia de envío es razonable (evito spam).</label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowChecklist(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!checkOptIn || !checkOptOut || !checkCoherence || !checkFrequency) {
                  toast.error('Marca todos los puntos para continuar');
                  return;
                }
                setChecklistConfirmed(true);
                setShowChecklist(false);
                if (pendingData) {
                  await onSubmit(pendingData);
                }
              }}
            >Confirmar y enviar</Button>
          </div>
        </Modal>
      )}
    </motion.div>
  );
}