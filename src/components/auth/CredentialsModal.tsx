import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Key, Phone, Building } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { ApiCredentials } from '../../types';

interface CredentialsModalProps {
  isOpen: boolean;
  onSave: (credentials: ApiCredentials) => void;
  onClose: () => void;
  initialCredentials?: ApiCredentials | null;
}

export function CredentialsModal({ isOpen, onSave, onClose, initialCredentials }: CredentialsModalProps) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<ApiCredentials>({
    defaultValues: initialCredentials || {
      accessToken: '',
      phoneNumberId: '',
      businessAccountId: '',
      appId: '' as any,
    }
  });

  const onSubmit = (data: ApiCredentials) => {
    onSave(data);
    // Si hay token de usuario, persistir también en backend
    try {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (token) {
        fetch('/api/user/meta-credentials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(data),
        }).catch(() => {});
      }
    } catch {}
  };

  // Al abrir el modal, si hay token, intenta precargar credenciales del backend
  useEffect(() => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!isOpen || !token) return;
    (async () => {
      try {
        const r = await fetch('/api/user/meta-credentials', { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return;
        const j = await r.json();
        if (j?.metaCreds) {
          const { accessToken, phoneNumberId, businessAccountId, appId } = j.metaCreds;
          reset({
            accessToken: accessToken || '',
            phoneNumberId: phoneNumberId || '',
            businessAccountId: businessAccountId || '',
            appId: appId || ('' as any),
          });
        }
      } catch {}
    })();
  }, [isOpen, reset]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Configurar Credenciales de Meta"
      size="lg"
    >
      <div className="space-y-6">
        <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
          <h4 className="text-blue-300 font-medium mb-2">📋 Instrucciones</h4>
          <ul className="text-sm text-blue-200 space-y-1">
            <li>• Obtén tus credenciales desde <strong>Meta Business Manager</strong></li>
            <li>• Ve a <strong>WhatsApp Business API</strong> → <strong>Configuración</strong></li>
            <li>• Copia el <strong>Access Token</strong>, <strong>Phone Number ID</strong> y <strong>Business Account ID</strong></li>
            <li>• Asegúrate de que tu cuenta tenga permisos para enviar mensajes</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Access Token"
            icon={Key}
            placeholder="EAAxxxxxxxxxxxxxxx..."
            {...register('accessToken', { 
              required: 'El Access Token es obligatorio',
              minLength: { value: 10, message: 'Token muy corto' }
            })}
            error={errors.accessToken?.message}
            helperText="Token de acceso permanente de tu aplicación de Meta"
          />

          <Input
            label="Phone Number ID"
            icon={Phone}
            placeholder="123456789012345"
            {...register('phoneNumberId', { 
              required: 'El Phone Number ID es obligatorio',
              pattern: { value: /^\d+$/, message: 'Solo números permitidos' }
            })}
            error={errors.phoneNumberId?.message}
            helperText="ID del número de teléfono de WhatsApp Business"
          />

          <Input
            label="Business Account ID"
            icon={Building}
            placeholder="123456789012345"
            {...register('businessAccountId', { 
              required: 'El Business Account ID es obligatorio',
              pattern: { value: /^\d+$/, message: 'Solo números permitidos' }
            })}
            error={errors.businessAccountId?.message}
            helperText="ID de tu cuenta de WhatsApp Business"
          />
          <Input
            label="App ID (para subida reanudable)"
            placeholder="123456789012345"
            {...register('appId')}
            helperText="Opcional. Necesario si usas header_handle con subida reanudable."
          />

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            <Button
              type="submit"
              loading={isSubmitting}
              size="sm"
              className="px-6 py-2 rounded-md font-semibold bg-green-600 hover:bg-green-500 shadow shadow-green-600/30 w-full sm:w-auto"
            >
              Guardar Credenciales
            </Button>
          </div>
        </form>

        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
          <h4 className="text-yellow-300 font-medium mb-2">⚠️ Importante</h4>
          <p className="text-sm text-yellow-200">
            Estas credenciales se almacenan localmente en tu navegador. Nunca las compartas 
            y asegúrate de que tu Access Token tenga los permisos necesarios para 
            <strong> whatsapp_business_messaging</strong> y <strong>whatsapp_business_management</strong>.
          </p>
        </div>
      </div>
    </Modal>
  );
}