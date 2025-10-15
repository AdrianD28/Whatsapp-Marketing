import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

interface InsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  required?: number;
  available?: number;
  missing?: number;
}

const InsufficientCreditsModal: React.FC<InsufficientCreditsModalProps> = ({
  isOpen,
  onClose,
  required,
  available,
  missing
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Créditos Insuficientes"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-center p-4 bg-yellow-50 rounded-lg">
          <AlertTriangle className="w-16 h-16 text-yellow-500" />
        </div>

        <div className="text-center space-y-2">
          <p className="text-gray-700 font-medium">
            No tienes suficientes créditos para realizar esta operación
          </p>
          
          {required && available !== undefined && missing && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Créditos necesarios:</span>
                <span className="font-semibold text-gray-900">{required.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Créditos disponibles:</span>
                <span className="font-semibold text-gray-900">{available.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                <span className="text-gray-600">Créditos faltantes:</span>
                <span className="font-bold text-red-600">{missing.toLocaleString()}</span>
              </div>
            </div>
          )}

          <p className="text-sm text-gray-600 pt-2">
            Contacta al administrador para recargar créditos y continuar enviando mensajes.
          </p>
        </div>

        <div className="flex justify-center pt-2">
          <Button onClick={onClose} variant="primary">
            Entendido
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default InsufficientCreditsModal;
