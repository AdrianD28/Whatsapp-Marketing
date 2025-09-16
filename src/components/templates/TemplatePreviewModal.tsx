import { Modal } from '../ui/Modal';
import { Template } from '../../types';

interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: Template | null;
}

export function TemplatePreviewModal({ isOpen, onClose, template }: TemplatePreviewModalProps) {
  if (!template) return null;

  const header: any = template.components.find((c: any) => c.type === 'HEADER');
  const body: any = template.components.find((c: any) => c.type === 'BODY');
  const footer: any = template.components.find((c: any) => c.type === 'FOOTER');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Vista previa: ${template.name}`} size="md">
      <div className="space-y-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="max-w-xs mx-auto bg-green-600 rounded-2xl rounded-bl-sm p-3 text-white shadow-lg">
            {header && header.format === 'TEXT' && header.text && (
              <div className="font-bold mb-2">{header.text}</div>
            )}
            {header && header.format === 'IMAGE' && (
              <div className="mb-2">
                {header.example?.header_handle_preview_url ? (
                  // si disponemos de una url de preview, mostrarla
                  <img src={header.example.header_handle_preview_url} alt="header" className="rounded mb-2 max-h-40 object-cover" />
                ) : (
                  <div className="text-sm opacity-90">[Imagen de encabezado]</div>
                )}
              </div>
            )}
            {/* Render botones si existen */}
            {template.components.filter((c: any) => c.type === 'BUTTONS').map((btnComp: any, idx: number) => (
              <div key={idx} className="mt-3 flex flex-wrap gap-2">
                {(btnComp.buttons || []).map((b: any, i: number) => (
                  <button key={i} className="bg-white/10 text-white text-xs px-3 py-1 rounded">
                    {b.text || (b.type === 'URL' ? 'Abrir' : b.type === 'PHONE_NUMBER' ? 'Llamar' : 'Acción')}
                  </button>
                ))}
              </div>
            ))}
            <div className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
              {body?.text || 'Sin contenido'}
            </div>
            {footer?.text && (
              <div className="mt-2 text-sm opacity-90 italic">{footer.text}</div>
            )}
            <div className="flex justify-end mt-2">
              <span className="text-xs text-green-100 opacity-75">
                {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>

        <div className="text-sm text-gray-400">
          <p><strong>Idioma:</strong> {template.language}</p>
          <p><strong>Categoría:</strong> {template.category}</p>
          {template.created_time && <p><strong>Creada:</strong> {new Date(template.created_time).toLocaleString('es-ES')}</p>}
        </div>
      </div>
    </Modal>
  );
}
