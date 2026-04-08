import { fetchApi } from '@/api/client';

function buildQuery(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const internetReportsApi = {
  getSummary: (startDate?: string, endDate?: string) =>
    fetchApi(`/api/internet/reports/summary${buildQuery(startDate, endDate)}`),
  getDetails: (startDate?: string, endDate?: string) =>
    fetchApi(`/api/internet/reports/details${buildQuery(startDate, endDate)}`),
};
