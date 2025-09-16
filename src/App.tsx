import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { AppProvider, useAppContext } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { CredentialsModal } from './components/auth/CredentialsModal';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { Dashboard } from './views/Dashboard';
import { Templates } from './views/Templates';
import { Contacts } from './views/Contacts';
import { Send } from './views/Send';
import { useApi } from './hooks/useApi';

const viewTitles = {
  dashboard: { title: 'Dashboard', subtitle: 'Resumen de actividad y estadísticas' },
  templates: { title: 'Plantillas', subtitle: 'Gestiona tus plantillas de mensajes' },
  contacts: { title: 'Contactos', subtitle: 'Administra tu lista de contactos' },
  send: { title: 'Envío Masivo', subtitle: 'Configura y ejecuta campañas de mensajes' },
};

function AppContent() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const { apiCredentials, setApiCredentials, setTemplates, addActivity } = useAppContext();
  const { fetchTemplates, loading } = useApi(apiCredentials);

  useEffect(() => {
    if (!apiCredentials) {
      setShowCredentialsModal(true);
    } else {
      loadInitialData();
    }
  }, [apiCredentials]);

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
      addActivity({
        title: 'Error al cargar datos',
        description: error instanceof Error ? error.message : 'Error desconocido',
        type: 'error',
      });
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
    setShowCredentialsModal(true);
  };

  const handleLogin = () => {
    setShowCredentialsModal(true);
  };

  const handleLogout = () => {
    setApiCredentials(null);
    setTemplates([]);
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
      default: return <Dashboard />;
    }
  };

  const currentViewInfo = viewTitles[currentView as keyof typeof viewTitles];

  return (
    <div className="min-h-screen bg-gray-900 flex">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={currentViewInfo.title}
          subtitle={currentViewInfo.subtitle}
          onRefresh={handleRefresh}
          onSettings={handleSettings}
          loading={loading}
          isAuthenticated={!!apiCredentials}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />
        
        <main className="flex-1 overflow-y-auto p-8">
          {!apiCredentials ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <LoadingSpinner size="lg" className="mx-auto mb-4" />
                <p className="text-gray-400">Configurando credenciales...</p>
              </div>
            </div>
          ) : (
            renderView()
          )}
        </main>
      </div>

      <CredentialsModal
        isOpen={showCredentialsModal}
        onSave={handleCredentialsSave}
        onClose={() => setShowCredentialsModal(false)}
        initialCredentials={apiCredentials}
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