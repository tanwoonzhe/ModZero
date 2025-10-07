import axios from "axios";

// Base API instance configured with environment variable
// `__API_BASE__` is defined in vite.config.ts via `define`
declare const __API_BASE__: string;

const api = axios.create({
  baseURL: (import.meta as any).env.VITE_API_BASE || __API_BASE__,
});

// Request interceptor to attach auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;