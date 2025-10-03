import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Mail, Lock, User2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (token: string, user: { id: string; email: string; name?: string | null }) => void;
}

export function AuthModal({ isOpen, onClose, onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setLoading(true); setError(null);
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body: any = { email, password };
      if (mode === 'register') body.name = name;
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'} size="md">
      <div className="space-y-5">
        <div className="flex gap-2 bg-gray-800/80 p-1 rounded-lg border border-gray-700 w-full">
          <button onClick={() => setMode('login')} className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${mode==='login'?'bg-gray-700 text-white':'text-gray-300 hover:bg-gray-700/40'}`}>Iniciar sesión</button>
          <button onClick={() => setMode('register')} className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${mode==='register'?'bg-gray-700 text-white':'text-gray-300 hover:bg-gray-700/40'}`}>Crear cuenta</button>
        </div>

        {mode==='register' && (
          <Input label="Nombre (opcional)" placeholder="Tu nombre" icon={User2} value={name} onChange={(e:any)=>setName(e.target.value)} />
        )}
        <Input label="Email" placeholder="correo@dominio.com" icon={Mail} value={email} onChange={(e:any)=>setEmail(e.target.value)} />
        <Input label="Contraseña" type="password" placeholder="••••••••" icon={Lock} value={password} onChange={(e:any)=>setPassword(e.target.value)} />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} size="sm">Cancelar</Button>
          <Button onClick={submit} loading={loading} size="sm" className="px-6">{mode==='login'? 'Entrar':'Registrarme'}</Button>
        </div>
        <p className="text-xs text-gray-400 text-center">Al {mode==='login'?'entrar':'registrarte'} aceptas nuestros Términos y Privacidad.</p>
      </div>
    </Modal>
  );
}
