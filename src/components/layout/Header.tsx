import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Settings, LogIn, LogOut, Menu, User2, ChevronDown, Coins } from 'lucide-react';
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
  userEmail?: string | null;
  credits?: number;
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
  userEmail,
  credits,
}: HeaderProps) {
  const [openMenu, setOpenMenu] = useState(false);
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

        <div className="relative flex items-center gap-2 sm:gap-3">
          {!isAuthenticated ? (
            <Button variant="primary" size="sm" icon={LogIn} onClick={onLogin}>
              Login
            </Button>
          ) : (
            <>
              {/* Display de créditos */}
              {credits !== undefined && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold ${
                  credits === 0 
                    ? 'bg-red-900/30 text-red-300 border border-red-800' 
                    : credits < 100 
                    ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-800' 
                    : 'bg-green-900/30 text-green-300 border border-green-800'
                }`}>
                  <Coins className="w-4 h-4" />
                  <span className="hidden sm:inline">{credits.toLocaleString()}</span>
                  <span className="sm:hidden">{credits > 999 ? `${(credits/1000).toFixed(1)}k` : credits}</span>
                </div>
              )}
              
              <button
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={() => setOpenMenu(v => !v)}
              >
                <User2 className="w-4 h-4" />
                <span className="hidden sm:inline max-w-[180px] truncate">{userEmail || 'Mi cuenta'}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openMenu ? 'rotate-180' : ''}`} />
              </button>
              {openMenu && (
                <div className="absolute right-0 top-10 z-20 min-w-[180px] rounded-md border border-gray-700 bg-gray-800 shadow-xl">
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2" onClick={() => { setOpenMenu(false); onSettings(); }}>
                    <Settings className="w-4 h-4" /> Mi cuenta
                  </button>
                  <button className="w-full text-left px-4 py-2 text-sm text-red-300 hover:bg-red-900/30 flex items-center gap-2" onClick={() => { setOpenMenu(false); onLogout && onLogout(); }}>
                    <LogOut className="w-4 h-4" /> Cerrar sesión
                  </button>
                </div>
              )}
            </>
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