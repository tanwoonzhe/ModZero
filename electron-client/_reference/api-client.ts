/**
 * API Client for ModZero Controller.
 *
 * Handles login, resource/network listing, log upload, and user profile.
 * Tokens are set externally via setToken() — never stored in this module.
 */

import axios, { AxiosInstance } from 'axios';
import { DeviceInfo } from './device-info';
import { logger } from './logger';

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface ClientResource {
  resource_id: string;
  name: string;
  network: string;
  protocol: string;
  target_host: string;
  target_port: number;
  path_prefix: string;
  status: string;
  connector_url: string | null;
}

export interface ClientNetwork {
  network: string;
  connector_count: number;
  resource_count: number;
  status: string;
}

export interface UserProfile {
  user_id: string;
  username: string;
  email: string;
  role: string;
}

export interface ComplianceResult {
  compliant: boolean;
  score: number;
  issues?: string[];
  recommendations?: string[];
  last_checked: string;
}

export class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err.response?.status;
        const url = err.config?.url || '';
        logger.debug(`API error ${status} on ${url}`);
        return Promise.reject(err);
      },
    );
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  // ── Auth ──────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<LoginResponse> {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const response = await this.client.post<LoginResponse>('/api/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.token = response.data.access_token;
    return response.data;
  }

  // ── User Profile ──────────────────────────────────────────────────

  async getMe(): Promise<UserProfile> {
    const response = await this.client.get<UserProfile>('/api/client/me');
    return response.data;
  }

  // ── Resources ─────────────────────────────────────────────────────

  async getResources(network?: string): Promise<ClientResource[]> {
    const params: Record<string, string> = {};
    if (network) params.network = network;
    const response = await this.client.get<ClientResource[]>('/api/client/resources', { params });
    return response.data;
  }

  // ── Networks ──────────────────────────────────────────────────────

  async getNetworks(): Promise<ClientNetwork[]> {
    const response = await this.client.get<ClientNetwork[]>('/api/client/networks');
    return response.data;
  }

  // ── Access Link ───────────────────────────────────────────────────

  async generateAccessLink(resourceId: string): Promise<string> {
    const response = await this.client.post<{ url: string }>('/api/client/access-link', {
      resource_id: resourceId,
    });
    return response.data.url;
  }

  // ── Compliance (existing) ─────────────────────────────────────────

  async checkCompliance(deviceInfo: DeviceInfo): Promise<ComplianceResult> {
    try {
      const response = await this.client.post<ComplianceResult>(
        '/api/devices/compliance-check',
        { device_info: deviceInfo },
      );
      return response.data;
    } catch {
      return this.mockComplianceCheck(deviceInfo);
    }
  }

  private mockComplianceCheck(deviceInfo: DeviceInfo): ComplianceResult {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    if (deviceInfo.antivirus.length === 0 || deviceInfo.antivirus[0] === 'Unknown') {
      issues.push('No antivirus detected');
      recommendations.push('Install and enable an antivirus solution');
      score -= 25;
    }
    if (!deviceInfo.firewall_enabled) {
      issues.push('Firewall is disabled');
      recommendations.push('Enable Windows Firewall');
      score -= 20;
    }
    if (!deviceInfo.encryption_enabled) {
      issues.push('Disk encryption is not enabled');
      recommendations.push('Enable BitLocker');
      score -= 20;
    }

    const lastUpdate = new Date(deviceInfo.last_update);
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 30) {
      issues.push('System not updated recently');
      recommendations.push('Run Windows Update');
      score -= 15;
    }

    return {
      compliant: issues.length === 0,
      score: Math.max(0, score),
      issues: issues.length > 0 ? issues : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      last_checked: new Date().toISOString(),
    };
  }

  // ── Device Registration ───────────────────────────────────────────

  async registerDevice(deviceInfo: DeviceInfo): Promise<any> {
    const response = await this.client.post('/api/devices/register', { device_info: deviceInfo });
    return response.data;
  }
}
