import { motion } from 'framer-motion';
import { RefreshCw, Settings, LogIn, LogOut, Menu } from 'lucide-react';
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
  onToggleSidebar?: () => void;
}

export function Header({
  title,
  subtitle,
  onRefresh,
  onSettings,
  loading = false,
  isAuthenticated = false,
  onLogin,
  onLogout,
  imageUrl,
  onToggleSidebar,
}: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 md:px-8 py-4 md:py-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={onToggleSidebar}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">{title}</h1>
            <p className="text-gray-400 text-xs sm:text-sm truncate">{subtitle}</p>
          </div>
        </div>

        {imageUrl && (
          <img
            src={imageUrl}
            alt="Header"
            className="h-9 w-9 md:h-10 md:w-10 object-cover rounded-full hidden sm:block"
          />
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          {!isAuthenticated ? (
            <Button variant="primary" size="sm" icon={LogIn} onClick={onLogin}>
              Login
            </Button>
          ) : (
            <Button variant="danger" size="sm" icon={LogOut} onClick={onLogout}>
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
          <Button variant="ghost" size="sm" icon={Settings} onClick={onSettings}>
            Configurar
          </Button>
        </div>
      </div>
    </motion.header>
  );
}