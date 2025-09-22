import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { AppState, Template, Contact, Activity, ApiCredentials, SendProgress, SendSession } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface AppContextType extends AppState {
  setTemplates: (templates: Template[]) => void;
  setContacts: (contacts: Contact[]) => void;
  setApiCredentials: (credentials: ApiCredentials | null) => void;
  setSendProgress: (progress: SendProgress) => void;
  addActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => void;
  clearActivities: () => void;
  addSendSession: (session: Omit<SendSession, 'id' | 'timestamp'>) => void;
  clearSendHistory: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

type AppAction = 
  | { type: 'SET_TEMPLATES'; payload: Template[] }
  | { type: 'SET_CONTACTS'; payload: Contact[] }
  | { type: 'SET_API_CREDENTIALS'; payload: ApiCredentials | null }
  | { type: 'SET_SEND_PROGRESS'; payload: SendProgress }
  | { type: 'ADD_ACTIVITY'; payload: Activity }
  | { type: 'CLEAR_ACTIVITIES' }
  | { type: 'ADD_SEND_SESSION'; payload: SendSession }
  | { type: 'CLEAR_SEND_HISTORY' };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_TEMPLATES':
      return { ...state, templates: action.payload };
    case 'SET_CONTACTS':
      return { ...state, contacts: action.payload };
    case 'SET_API_CREDENTIALS':
      return { ...state, apiCredentials: action.payload };
    case 'SET_SEND_PROGRESS':
      return { ...state, sendProgress: action.payload };
    case 'ADD_ACTIVITY':
      return { 
        ...state, 
        activities: [action.payload, ...state.activities].slice(0, 10) 
      };
    case 'CLEAR_ACTIVITIES':
      return { ...state, activities: [] };
    case 'ADD_SEND_SESSION':
      return { ...state, sendHistory: [action.payload, ...state.sendHistory].slice(0, 200) };
    case 'CLEAR_SEND_HISTORY':
      return { ...state, sendHistory: [] };
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [apiCredentials, setStoredApiCredentials] = useLocalStorage<ApiCredentials | null>('apiCredentials', null);
  
  const initialState: AppState = {
    templates: [],
    contacts: [],
    sendProgress: { total: 0, sent: 0, percentage: 0, isActive: false },
    activities: [],
    apiCredentials,
    sendHistory: [],
  };

  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    dispatch({ type: 'SET_API_CREDENTIALS', payload: apiCredentials });
  }, [apiCredentials]);

  const setTemplates = (templates: Template[]) => {
    dispatch({ type: 'SET_TEMPLATES', payload: templates });
  };

  const setContacts = (contacts: Contact[]) => {
    dispatch({ type: 'SET_CONTACTS', payload: contacts });
  };

  const setApiCredentials = (credentials: ApiCredentials | null) => {
    setStoredApiCredentials(credentials);
    dispatch({ type: 'SET_API_CREDENTIALS', payload: credentials });
  };

  const setSendProgress = (progress: SendProgress) => {
    dispatch({ type: 'SET_SEND_PROGRESS', payload: progress });
  };

  const addActivity = (activity: Omit<Activity, 'id' | 'timestamp'>) => {
    const newActivity: Activity = {
      ...activity,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    dispatch({ type: 'ADD_ACTIVITY', payload: newActivity });
  };

  const clearActivities = () => {
    dispatch({ type: 'CLEAR_ACTIVITIES' });
  };

  // Persist sendHistory in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sendHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach((s: any) => { if (s && typeof s.timestamp === 'string') return; });
          dispatch({ type: 'CLEAR_SEND_HISTORY' });
          parsed.forEach((s: SendSession) => dispatch({ type: 'ADD_SEND_SESSION', payload: s }));
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { localStorage.setItem('sendHistory', JSON.stringify(state.sendHistory)); } catch {}
  }, [state.sendHistory]);

  const addSendSession = (session: Omit<SendSession, 'id' | 'timestamp'>) => {
    const payload: SendSession = {
      ...session,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_SEND_SESSION', payload });
  };
  const clearSendHistory = () => dispatch({ type: 'CLEAR_SEND_HISTORY' });

  return (
    <AppContext.Provider value={{
      ...state,
      setTemplates,
      setContacts,
      setApiCredentials,
      setSendProgress,
      addActivity,
      clearActivities,
      addSendSession,
      clearSendHistory,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}