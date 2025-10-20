import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Mail, Lock } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (token: string, user: { id: string; email: string; name?: string | null }) => void;
}

export function AuthModal({ isOpen, onClose, onAuthenticated }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setLoading(true); setError(null);
      const r = await fetch('/api/auth/login', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ email, password }) 
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = j?.error || j?.message || `Error ${r.status}`;
        throw new Error(typeof msg === 'string' ? msg : 'No fue posible autenticar');
      }
      const token = j.token as string; const user = j.user;
      onAuthenticated(token, user);
    } catch (e:any) {
      setError(e?.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Iniciar sesión" size="md">
      <div className="space-y-5">
        <Input label="Email" placeholder="correo@dominio.com" icon={Mail} value={email} onChange={(e:any)=>setEmail(e.target.value)} />
        <Input label="Contraseña" type="password" placeholder="••••••••" icon={Lock} value={password} onChange={(e:any)=>setPassword(e.target.value)} />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} size="sm">Cancelar</Button>
          <Button onClick={submit} loading={loading} size="sm" className="px-6">Entrar</Button>
        </div>
        <p className="text-xs text-gray-400 text-center">
          Si necesitas una cuenta, contacta al administrador del sistema.
        </p>
      </div>
    </Modal>
  );
}
