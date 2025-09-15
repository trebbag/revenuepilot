import { login as rawLogin, register as rawRegister } from '../api.js';

export interface AuthResponse {
  token: string;
  refreshToken: string;
  settings: any;
  session: any;
}

// The raw helpers already return { token, refreshToken, settings }
export async function login(username: string, password: string, lang: string = 'en'): Promise<AuthResponse> {
  const resp = await rawLogin(username, password, lang);
  return resp as AuthResponse;
}

export async function register(username: string, password: string, lang: string = 'en'): Promise<AuthResponse> {
  const resp = await rawRegister(username, password, lang);
  return resp as AuthResponse;
}
