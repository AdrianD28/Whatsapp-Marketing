import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { FileText, Image, Type, MessageSquare, Film, File as FileIcon, MapPin, Plus, Trash2, Link as LinkIcon, Phone } from 'lucide-react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useAppContext } from '../../context/AppContext';
import { HelpTooltip } from '../ui/HelpTooltip';

interface TemplateFormData {
  name: string;
  language: string;
  category: string;
  headerType: '' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  headerValue: string;
  body: string;
  footer: string;
  ttl?: number;
  buttons: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text?: string;
    url?: string;
    urlExample?: string;
    phone_number?: string;
  }>;
}

interface TemplateFormProps {
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function TemplateForm({ onSubmit, onCancel, loading = false }: TemplateFormProps) {
  const [preview, setPreview] = useState('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const { } = useAppContext();
  const { register, handleSubmit, watch, formState: { errors }, setValue } = useForm<TemplateFormData>({
    defaultValues: {
      language: '',
      category: 'utility',
      headerType: '',
      buttons: []
    }
  });
  // Manejamos la lista de botones con watch/setValue sin useFieldArray

  const watchedValues = watch();

  React.useEffect(() => {
    const { headerType, headerValue, body, footer } = watchedValues as any;
    let previewText = '';
    
    if (headerType === 'TEXT' && headerValue) {
      previewText += `*${headerValue}*\n\n`;
    } else if (headerType === 'IMAGE') {
      const nextUrl = headerValue || '';
      setImageUrl(prev => {
        if (prev && prev.startsWith('blob:') && prev !== nextUrl) URL.revokeObjectURL(prev);
        return nextUrl;
      });
      if (!nextUrl) previewText += `[🖼️ Imagen]\n\n`;
      else previewText += `\n`;
    }
    
  previewText += body?.replace(/\{\{(\d+)\}\}/g, '{{$1: Ejemplo}}') || 'Mensaje de ejemplo';
    
    if (footer) {
      previewText += `\n\n_${footer}_`;
    }
    
    setPreview(previewText);
  }, [watchedValues.headerType, watchedValues.headerValue, watchedValues.body, watchedValues.footer]);

  const onFormSubmit = async (data: TemplateFormData) => {
    const components: any[] = [];

    if (data.headerType === 'TEXT' && data.headerValue) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: data.headerValue,
      });
    } else if (['IMAGE','VIDEO','DOCUMENT','LOCATION'].includes(data.headerType)) {
      components.push({
        type: 'HEADER',
        format: data.headerType,
      });
    }

    components.push({
      type: 'BODY',
      text: data.body,
    });

    if (data.footer) {
      components.push({
        type: 'FOOTER',
        text: data.footer,
      });
    }

    const templateData: any = {
      name: data.name.toLowerCase().replace(/\s+/g, '_'),
      category: data.category.toUpperCase(),
      language: data.language,
      components,
    };

    // Ejemplos para BODY según placeholders
    const body = data.body || '';
    const namedMatches = Array.from(body.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)).map(m => m[1]);
    const positionalMatches = Array.from(body.matchAll(/\{\{(\d+)\}\}/g)).map(m => Number(m[1]));
    if (namedMatches.length > 0) {
      const ex = namedMatches.map((n, i) => ({ param_name: n, example: `Ejemplo${i+1}` }));
      const bodyIdx = templateData.components.findIndex((c: any) => c.type === 'BODY');
      if (bodyIdx >= 0) templateData.components[bodyIdx].example = { body_text_named_params: ex };
    } else if (positionalMatches.length > 0) {
      const max = Math.max(...positionalMatches);
      const arr = Array.from({ length: max }, (_, i) => `Ejemplo${i+1}`);
      const bodyIdx = templateData.components.findIndex((c: any) => c.type === 'BODY');
      if (bodyIdx >= 0) templateData.components[bodyIdx].example = { body_text: [arr] };
    }

    // Botones
    const buttons = (data.buttons || []).filter(Boolean);
    if (buttons.length) {
      const btns = buttons.map(b => {
        if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text || 'OK' };
        if (b.type === 'URL') {
          const hasVar = /\{\{[^}]+\}\}/.test(b.url || '');
          const base: any = { type: 'URL', text: b.text || 'Abrir', url: b.url || 'https://example.com' };
          if (hasVar && b.urlExample) base.example = [b.urlExample];
          return base;
        }
        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text || 'Llamar', phone_number: b.phone_number || '' };
        return null;
      }).filter(Boolean);
      if (btns.length) templateData.components.push({ type: 'BUTTONS', buttons: btns });
    }

    // TTL opcional
    if (data.ttl && Number.isFinite(data.ttl)) templateData.message_send_ttl_seconds = Number(data.ttl);

    if (['IMAGE','VIDEO','DOCUMENT'].includes(data.headerType)) {
      if (data.headerValue) {
        // Requerimos URL: el servidor usará esta URL para obtener un media id y lo inyectará como header_handle
        templateData.headerMediaUrl = { url: data.headerValue, format: data.headerType };
      } else {
        throw new Error('Para HEADER de tipo media, proporciona una URL pública (https) como ejemplo.');
      }
    }

    await onSubmit(templateData);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-6"
    >
      {/* Form */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Nueva Plantilla
        </h3>
        
  <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <Input
            label="Nombre de la Plantilla"
            placeholder="mi_plantilla_promocional"
            {...register('name', { 
              required: 'El nombre es obligatorio',
              pattern: { value: /^[a-z0-9_]+$/, message: 'Usa minúsculas, números y _' }
            })}
            onBlur={(e) => {
              const sanitized = e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
              setValue('name', sanitized, { shouldValidate: true });
            }}
            error={errors.name?.message}
            helperText="Solo minúsculas, números y guiones bajos (_). Sin espacios."
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">Idioma</label>
              <select
                {...register('language', { required: 'Selecciona un idioma' })}
                className="w-full rounded-lg border-gray-600 bg-gray-700 text-white focus:border-green-500 focus:ring-green-500"
              >
                <option value="">Seleccionar idioma...</option>
                <option value="es_ES">Español (España)</option>
                <option value="es_MX">Español (México)</option>
                <option value="es_AR">Español (Argentina)</option>
                <option value="es_CO">Español (Colombia)</option>
                <option value="en_US">Inglés (Estados Unidos)</option>
              </select>
              {errors.language && <p className="text-sm text-red-400 mt-1">{errors.language.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">Categoría</label>
              <select
                {...register('category', { required: 'Selecciona una categoría' })}
                className="w-full rounded-lg border-gray-600 bg-gray-700 text-white focus:border-green-500 focus:ring-green-500"
              >
                <option value="utility">Utilidad</option>
                <option value="marketing">Marketing</option>
                <option value="authentication">Autenticación</option>
              </select>
              {errors.category && <p className="text-sm text-red-400 mt-1">{errors.category.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Tipo de Encabezado (Opcional)
              <HelpTooltip
                title="Encabezado de plantilla (políticas Meta)"
                tooltip="El encabezado puede ser texto, imagen, video o documento."
              >
                <ul className="list-disc ml-4">
                  <li>Si eliges IMAGEN/VIDEO/DOCUMENTO, Meta exige un ejemplo válido para aprobar.</li>
                  <li>El ejemplo puede ser un handle o un link accesible públicamente.</li>
                  <li>Este ejemplo es solo para aprobación; al enviar debes pasar el medio del header como parámetro.</li>
                </ul>
              </HelpTooltip>
            </label>
            <select
              {...register('headerType')}
              className="w-full rounded-lg border-gray-600 bg-gray-700 text-white focus:border-green-500 focus:ring-green-500"
            >
              <option value="">Ninguno</option>
              <option value="TEXT">Texto</option>
              <option value="IMAGE">Imagen</option>
              <option value="VIDEO">Video</option>
              <option value="DOCUMENT">Documento</option>
              <option value="LOCATION">Ubicación</option>
            </select>
          </div>

          {watchedValues.headerType && (
            <Input
              label="Contenido del Encabezado"
              icon={watchedValues.headerType === 'TEXT' ? Type : watchedValues.headerType === 'IMAGE' ? Image : watchedValues.headerType === 'VIDEO' ? Film : watchedValues.headerType === 'DOCUMENT' ? FileIcon : MapPin}
              placeholder={
                watchedValues.headerType === 'TEXT' ? 'Texto del encabezado' :
                watchedValues.headerType === 'LOCATION' ? 'La ubicación se envía al mandar el mensaje' :
                'URL del medio (opcional)'
              }
              {...register('headerValue', watchedValues.headerType === 'TEXT' ? { required: 'El contenido del encabezado es obligatorio' } : {})}
              error={errors.headerValue?.message}
            />
          )}

          {['IMAGE','VIDEO','DOCUMENT'].includes(watchedValues.headerType as any) && (
            <div className="text-sm text-gray-400">
              Meta exige un ejemplo del header como URL pública (https) para aprobar la plantilla.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">Cuerpo del Mensaje</label>
            <textarea
              {...register('body', { required: 'El cuerpo del mensaje es obligatorio' })}
              rows={4}
              placeholder="Escribe tu mensaje aquí... Usa {{1}}, {{2}} para variables"
              className="w-full rounded-lg border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-green-500 focus:ring-green-500"
            />
            {errors.body && <p className="text-sm text-red-400 mt-1">{errors.body.message}</p>}
          </div>

          <Input
            label="Pie de Mensaje (Opcional)"
            placeholder="Texto del pie de página"
            {...register('footer')}
          />

          <Input
            label="TTL del mensaje (segundos, opcional)"
            placeholder="p. ej. 120"
            {...register('ttl')}
          />

            <div className="pt-2">
            <label className="block text-sm font-medium text-gray-200 mb-2">Botones</label>
            <div className="space-y-3">
              {(watch('buttons') || []).map((_, idx) => (
                <div key={idx} className="border border-gray-700 rounded-lg p-3 bg-gray-800">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">Tipo</label>
                      <select {...register(`buttons.${idx}.type` as const)} className="w-full rounded border-gray-600 bg-gray-700 text-white">
                        <option value="QUICK_REPLY">Quick Reply</option>
                        <option value="URL">URL</option>
                        <option value="PHONE_NUMBER">Teléfono</option>
                      </select>
                    </div>
                    <div>
                      <Input label="Texto" placeholder="Texto del botón" icon={MessageSquare} {...register(`buttons.${idx}.text` as const)} />
                    </div>
                    {watch(`buttons.${idx}.type` as const) === 'URL' && (
                      <>
                        <div>
                          <div className="flex items-center">
                            <Input label="URL" placeholder="https://... o ...?q={{1}}" icon={LinkIcon} {...register(`buttons.${idx}.url` as const)} />
                            <HelpTooltip title="URL con variables" tooltip="Cómo completar el ejemplo">
                              <p>
                                Si tu URL de botón incluye variables como <code>{"{{1}}"}</code>, Meta exige un ejemplo de valor para aprobación. 
                                Completa "Ejemplo" con un valor representativo. En envío real, se reemplazará por los parámetros.
                              </p>
                            </HelpTooltip>
                          </div>
                        </div>
                        <div>
                          <Input label="Ejemplo (si URL tiene {{}})" placeholder="valor-ejemplo" {...register(`buttons.${idx}.urlExample` as const)} />
                        </div>
                      </>
                    )}
                    {watch(`buttons.${idx}.type` as const) === 'PHONE_NUMBER' && (
                      <div>
                        <Input label="Número" placeholder="15550051234" icon={Phone} {...register(`buttons.${idx}.phone_number` as const)} />
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button type="button" variant="secondary" onClick={() => {
                        const current = watch('buttons') || [];
                        const next = current.slice();
                        next.splice(idx,1);
                        setValue('buttons', next as any, { shouldValidate: true });
                      }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" onClick={() => {
                const current = watch('buttons') || [];
                const next = current.concat({ type: 'QUICK_REPLY', text: '' } as any);
                setValue('buttons', next as any, { shouldValidate: true });
              }}>
                <Plus className="w-4 h-4 mr-1" /> Añadir botón
              </Button>
            </div>
          </div>

          {['IMAGE','VIDEO','DOCUMENT'].includes(watchedValues.headerType as any) && !watchedValues.headerValue && (
            <div className="p-3 rounded bg-yellow-900/20 text-yellow-200 text-sm">
              Debes proporcionar un ejemplo del header: pega una URL pública (https). Meta lo requiere para aprobar la plantilla.
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={loading}
              className="flex-1"
              disabled={['IMAGE','VIDEO','DOCUMENT'].includes(watchedValues.headerType as any) && !watchedValues.headerValue}
            >
              Crear Plantilla
            </Button>
          </div>
        </form>
      </Card>

      {/* Preview */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Vista Previa
        </h3>
        
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="max-w-xs mx-auto bg-green-600 rounded-2xl rounded-bl-sm p-3 text-white shadow-lg">
            {(watchedValues.headerType === 'IMAGE' || watchedValues.headerType === 'VIDEO' || watchedValues.headerType === 'DOCUMENT') && imageUrl && (
              <img src={imageUrl} alt="header" className="rounded mb-2 max-h-40 object-cover" onError={() => setImageUrl('')} />
            )}
            {/* Render botones en preview */}
            {Array.isArray(watchedValues.buttons) && watchedValues.buttons.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {watchedValues.buttons.map((b: any, i: number) => (
                  <button key={i} className="bg-white/10 text-white text-xs px-3 py-1 rounded">
                    {b.text || (b.type === 'URL' ? 'Abrir' : b.type === 'PHONE_NUMBER' ? 'Llamar' : 'Acción')}
                  </button>
                ))}
              </div>
            )}
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
              {preview || 'Escribe tu mensaje para ver la vista previa...'}
            </pre>
            <div className="flex justify-end mt-2">
              <span className="text-xs text-green-100 opacity-75">
                {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}