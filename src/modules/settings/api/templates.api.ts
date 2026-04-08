import { fetchApi } from '@/api/client';

export interface MessageTemplate {
  id: number;
  key: string;
  body: string;
  updatedAt: string;
}

export const templatesApi = {
  getAll: async (): Promise<MessageTemplate[]> => {
    const response = await fetchApi<MessageTemplate[]>('/api/settings/templates');
    return response ?? [];
  },

  update: async (key: string, body: string): Promise<MessageTemplate> => {
    const response = await fetchApi<MessageTemplate>(`/api/settings/templates/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ body }),
    });
    return response!;
  },
};
