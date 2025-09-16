import { motion } from 'framer-motion';
import { RefreshCw, Settings, LogIn, LogOut } from 'lucide-react';
import { Button } from '../ui/Button';

interface HeaderProps {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  onSettings: () => void;
  loading?: boolean;
  isAuthenticated?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
  imageUrl?: string;
}

export function Header({ title, subtitle, onRefresh, onSettings, loading = false, isAuthenticated = false, onLogin, onLogout, imageUrl }: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800 border-b border-gray-700 px-8 py-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">{title}</h1>
          <p className="text-gray-400 text-sm">{subtitle}</p>
        </div>
        {imageUrl && (
            <img src={imageUrl} alt="Header" className="h-10 w-10 object-cover rounded-full" />
        )}
        <div className="flex items-center gap-3">
          {!isAuthenticated ? (
            <Button
              variant="primary"
              size="sm"
              icon={LogIn}
              onClick={onLogin}
            >
              Login
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              icon={LogOut}
              onClick={onLogout}
            >
              Logout
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={onRefresh}
            loading={loading}
          >
            Actualizar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={Settings}
            onClick={onSettings}
          >
            Configurar
          </Button>
        </div>
      </div>
    </motion.header>
  );
}