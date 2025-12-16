import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (email, password) => api.post('/login', { email, password });
export const register = (email, password) => api.post('/register', { email, password });
export const getMe = () => api.get('/me');

// Companies
export const getCompanies = () => api.get('/companies');
export const createCompany = (name) => api.post('/companies', { name });
export const getCompany = (id) => api.get(`/companies/${id}`);
export const deleteCompany = (id) => api.delete(`/companies/${id}`);

// Financial Data
export const getDashboard = (companyId) => api.get(`/dashboard/${companyId}`);
export const getSummary = (companyId) => api.get(`/summary/${companyId}`);
export const addData = (companyId, data) => api.post(`/data/${companyId}`, data);
export const updateData = (companyId, period, data) => api.put(`/data/${companyId}/${period}`, data);
export const deleteData = (companyId, period) => api.delete(`/data/${companyId}/${period}`);
export const uploadExcel = (companyId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/upload/${companyId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export default api;
