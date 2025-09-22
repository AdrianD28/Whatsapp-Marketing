export interface Template {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: string;
  language: string;
  components: TemplateComponent[];
  created_time?: string;
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER';
  format?: 'TEXT' | 'IMAGE';
  text?: string;
}

export interface Contact {
  id?: string;
  Nombre: string;
  Numero: string;
  email?: string;
}

export interface ApiCredentials {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  appId?: string;
}

export interface SendProgress {
  total: number;
  sent: number;
  percentage: number;
  isActive: boolean;
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  type: 'success' | 'error' | 'info' | 'warning';
  timestamp: Date;
}

export interface SendSession {
  id: string;
  templateName: string;
  templateCategory?: string;
  templateBody?: string;
  timestamp: string; // ISO
  total: number;
  success: number;
  reached: number; // normalmente igual a success
}

export interface AppState {
  templates: Template[];
  contacts: Contact[];
  sendProgress: SendProgress;
  activities: Activity[];
  apiCredentials: ApiCredentials | null;
  sendHistory: SendSession[];
}