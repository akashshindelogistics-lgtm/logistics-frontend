import api from './client';
import type { ApiResponse, PublicTracking } from '../types';

/** Public order tracking for a customer's link. No login: the token is the credential. */
export const getPublicTracking = (token: string) =>
  api.get<ApiResponse<PublicTracking>>(`/public/track/${encodeURIComponent(token)}`).then(r => r.data);
