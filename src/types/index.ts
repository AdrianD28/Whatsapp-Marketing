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

export interface ContactList {
  _id?: string;
  name: string;
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
  campaignId?: string | null;
}

export interface AppState {
  templates: Template[];
  contacts: Contact[];
  lists: ContactList[];
  sendProgress: SendProgress;
  activities: Activity[];
  apiCredentials: ApiCredentials | null;
  sendHistory: SendSession[];
}

// Reportería
export interface CampaignSummary {
  campaignId: string;
  templateName?: string;
  timestamp: string;
  total?: number;
  success?: number;
  reached?: number;
  counts?: Record<string, number>; // por estado: sent, delivered, read, failed, etc.
}

export interface MessageEventRow {
  messageId: string;
  status: string;
  lastRecipient?: string;
  updatedAt?: string;
  error?: any;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
}