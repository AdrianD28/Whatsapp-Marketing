import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { AppProvider, useAppContext } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { CredentialsModal } from './components/auth/CredentialsModal';
import { AuthModal } from './components/auth/AuthModal';
import { Dashboard } from './views/Dashboard';
import { Templates } from './views/Templates';
import { Contacts } from './views/Contacts';
import { Send } from './views/Send';
import { Statistics } from './views/Statistics';
import { useApi } from './hooks/useApi';

const viewTitles = {
  dashboard: { title: 'Dashboard', subtitle: 'Resumen de actividad y estadísticas' },
  templates: { title: 'Plantillas', subtitle: 'Gestiona tus plantillas de mensajes' },
  contacts: { title: 'Contactos', subtitle: 'Administra tu lista de contactos' },
  send: { title: 'Envío Masivo', subtitle: 'Configura y ejecuta campañas de mensajes' },
  statistics: { title: 'Estadísticas', subtitle: 'Resultados de campañas y estados' },
};

function AppContent() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(() => {
    try { return !!localStorage.getItem('auth_token'); } catch { return false; }
  });
  const { apiCredentials, setApiCredentials, setTemplates, addActivity } = useAppContext();
  const { fetchTemplates, loading } = useApi(apiCredentials);

  useEffect(() => {
    // Cargar datos solo si hay token y credenciales
    if (hasToken && apiCredentials) {
      loadInitialData();
    }
  }, [apiCredentials, hasToken]);

  // Cargar info del usuario si hay token en localStorage
  useEffect(() => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) { setUserEmail(null); setHasToken(false); return; }
    setHasToken(true);
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) { setUserEmail(null); return; }
        const j = await r.json();
        setUserEmail(j?.user?.email ?? null);
      } catch { setUserEmail(null); }
    })();
  }, [showAuthModal, hasToken]);

  const loadInitialData = async () => {
    if (!apiCredentials) return;
    
    try {
      const templates = await fetchTemplates();
      setTemplates(templates);
      addActivity({
        title: 'Datos cargados',
        description: `Se cargaron ${templates.length} plantillas`,
        type: 'success',
      });
    } catch (error) {
      // Si el error es expiración de token limpiamos sesión silenciosamente y reabrimos modal
      if ((error as any)?.authExpired) {
        setApiCredentials(null);
        setTemplates([]);
        setShowCredentialsModal(true);
        addActivity({
          title: 'Sesión expirada',
          description: 'Vuelve a introducir tus credenciales',
          type: 'info',
        });
      } else {
        addActivity({
          title: 'Error al cargar datos',
          description: error instanceof Error ? error.message : 'Error desconocido',
          type: 'error',
        });
      }
    }
  };

  const handleCredentialsSave = (credentials: any) => {
    setApiCredentials(credentials);
    setShowCredentialsModal(false);
    addActivity({
      title: 'Credenciales configuradas',
      description: 'API de Meta configurada correctamente',
      type: 'success',
    });
  };

  const handleRefresh = () => {
    loadInitialData();
  };

  const handleSettings = () => {
    if (!hasToken) {
      setShowAuthModal(true);
    } else {
      setShowCredentialsModal(true);
    }
  };

  const handleLogin = () => {
    setShowAuthModal(true);
  };

  const handleLogout = () => {
    setApiCredentials(null);
    setTemplates([]);
    try { localStorage.removeItem('auth_token'); } catch {}
    setHasToken(false);
    addActivity({
      title: 'Sesión cerrada',
      description: 'Se eliminaron las credenciales locales',
      type: 'info',
    });
  };

  const renderView = () => {
    switch (currentView) {
      case 'templates': return <Templates />;
      case 'contacts': return <Contacts />;
      case 'send': return <Send />;
      case 'statistics': return <Statistics />;
      default: return <Dashboard />;
    }
  };

  const currentViewInfo = viewTitles[currentView as keyof typeof viewTitles];

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Sidebar desktop */}
      <div className="hidden md:block">
        <Sidebar currentView={currentView} onViewChange={(view) => { setCurrentView(view); }} />
      </div>
      {/* Sidebar móvil como drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="relative w-72 max-w-[80%]">
            <Sidebar currentView={currentView} onViewChange={(view) => { setCurrentView(view); setSidebarOpen(false); }} />
          </div>
          <div
            className="flex-1 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={currentViewInfo.title}
          subtitle={currentViewInfo.subtitle}
          onRefresh={handleRefresh}
          onSettings={handleSettings}
          loading={loading}
          isAuthenticated={hasToken}
          onLogin={handleLogin}
          onLogout={handleLogout}
          userEmail={userEmail}
          onToggleSidebar={() => setSidebarOpen(v => !v)}
        />
        
  <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          {!hasToken ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4">
                <p className="text-gray-300 text-lg font-medium">Bienvenido 👋</p>
                <p className="text-gray-400 max-w-md">Para comenzar crea una cuenta o inicia sesión. Luego podrás configurar tus credenciales de Meta y gestionar tus listas y plantillas.</p>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="inline-flex items-center px-6 py-3 rounded-md bg-green-600 hover:bg-green-500 text-white font-semibold transition-colors shadow-lg shadow-green-600/20 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-gray-900"
                >
                  Crear cuenta / Iniciar sesión
                </button>
              </div>
            </div>
          ) : !apiCredentials ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4">
                <p className="text-gray-300 text-lg font-medium">Configura tus credenciales de Meta</p>
                <p className="text-gray-400 max-w-md">Aún no has añadido credenciales. Haz clic abajo para configurarlas.</p>
                <button
                  onClick={() => setShowCredentialsModal(true)}
                  className="inline-flex items-center px-6 py-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors shadow-lg shadow-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900"
                >
                  Configurar credenciales ahora
                </button>
              </div>
            </div>
          ) : renderView()}
        </main>
      </div>

      <CredentialsModal
        isOpen={showCredentialsModal}
        onSave={handleCredentialsSave}
        onClose={() => setShowCredentialsModal(false)}
        initialCredentials={apiCredentials}
      />

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthenticated={(token, user) => {
          try { localStorage.setItem('auth_token', token); } catch {}
          setHasToken(true);
          setShowAuthModal(false);
          // Tras autenticar, abrir directamente el modal de credenciales para que configure su API
          setShowCredentialsModal(true);
          addActivity({ title: 'Sesión iniciada', description: `Bienvenido ${user?.email}`, type: 'success' });
        }}
      />

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#374151',
            color: '#fff',
            border: '1px solid #4B5563',
          },
          success: {
            iconTheme: {
              primary: '#10B981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#EF4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;