import { Coins, Send, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface CreditsInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCredits?: number;
}

export function CreditsInfoModal({ isOpen, onClose, currentCredits = 0 }: CreditsInfoModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="💳 Sistema de Créditos"
    >
      <div className="space-y-6">
        {/* Balance actual */}
        <div className={`p-4 rounded-lg border ${
          currentCredits === 0 
            ? 'bg-red-900/20 border-red-800' 
            : currentCredits < 100 
            ? 'bg-yellow-900/20 border-yellow-800' 
            : 'bg-green-900/20 border-green-800'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Tu balance actual:</p>
              <p className={`text-3xl font-bold ${
                currentCredits === 0 ? 'text-red-400' : 
                currentCredits < 100 ? 'text-yellow-400' : 
                'text-green-400'
              }`}>
                {currentCredits.toLocaleString()}
                <span className="text-base font-normal text-gray-400 ml-2">créditos</span>
              </p>
            </div>
            <Coins className="w-12 h-12 text-gray-500" />
          </div>
        </div>

        {/* ¿Qué son los créditos? */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            ¿Qué son los créditos?
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            Los créditos son la moneda virtual del sistema. <strong>1 crédito = 1 mensaje enviado</strong> por WhatsApp.
          </p>
        </div>

        {/* Cómo funcionan */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-400" />
            ¿Cómo se usan?
          </h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>Cada mensaje enviado consume <strong>1 crédito</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>Los créditos se descuentan <strong>después</strong> de un envío exitoso</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>Si un mensaje falla, <strong>NO se descuentan</strong> créditos</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>Puedes ver el consumo en tiempo real en el panel</span>
            </li>
          </ul>
        </div>

        {/* Campañas */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            Campañas masivas
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            Para crear una campaña de <strong>1,000 contactos</strong> necesitas <strong>1,000 créditos</strong>. 
            El sistema valida que tengas suficientes créditos antes de iniciar el envío.
          </p>
        </div>

        {/* Advertencias */}
        <div className="bg-orange-900/20 border border-orange-800 rounded-lg p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-orange-300">Importante:</p>
              <ul className="text-xs text-orange-200 space-y-1">
                <li>• Si te quedas sin créditos, no podrás enviar mensajes</li>
                <li>• Contacta al administrador para recargar tu balance</li>
                <li>• Los créditos no expiran ni se reembolsan</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Estado del balance */}
        {currentCredits < 100 && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>
                {currentCredits === 0 
                  ? '⚠️ Balance en cero. Recarga créditos para continuar.'
                  : `⚠️ Balance bajo. Te quedan ${currentCredits} créditos.`
                }
              </span>
            </p>
          </div>
        )}

        {/* Botón cerrar */}
        <div className="flex justify-end pt-2">
          <Button onClick={onClose} variant="primary">
            Entendido
          </Button>
        </div>
      </div>
    </Modal>
  );
}
