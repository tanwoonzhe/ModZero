import axios, { AxiosInstance } from 'axios';
import { DeviceInfo } from './device-info';

export interface ComplianceResult {
  compliant: boolean;
  score: number;
  issues?: string[];
  recommendations?: string[];
  last_checked: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  setToken(token: string | null) {
    this.token = token;
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const response = await this.client.post<LoginResponse>('/api/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    this.token = response.data.access_token;
    return response.data;
  }

  async checkCompliance(deviceInfo: DeviceInfo): Promise<ComplianceResult> {
    try {
      const response = await this.client.post<ComplianceResult>('/api/devices/compliance-check', {
        device_info: deviceInfo,
      });
      return response.data;
    } catch (error) {
      // Return a mock compliance result for demo purposes
      return this.mockComplianceCheck(deviceInfo);
    }
  }

  private mockComplianceCheck(deviceInfo: DeviceInfo): ComplianceResult {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check antivirus
    if (deviceInfo.antivirus.length === 0 || deviceInfo.antivirus[0] === 'Unknown') {
      issues.push('No antivirus detected');
      recommendations.push('Install and enable Windows Defender or another antivirus solution');
      score -= 25;
    }

    // Check firewall
    if (!deviceInfo.firewall_enabled) {
      issues.push('Firewall is disabled');
      recommendations.push('Enable Windows Firewall for all network profiles');
      score -= 20;
    }

    // Check disk encryption
    if (!deviceInfo.encryption_enabled) {
      issues.push('Disk encryption is not enabled');
      recommendations.push('Enable BitLocker to encrypt your system drive');
      score -= 20;
    }

    // Check for recent updates
    const lastUpdate = new Date(deviceInfo.last_update);
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 30) {
      issues.push('System has not been updated recently');
      recommendations.push('Run Windows Update to install the latest security patches');
      score -= 15;
    }

    // Check available disk space (less than 10% free is a warning)
    const diskFreePercent = (deviceInfo.disk_free / deviceInfo.disk_total) * 100;
    if (diskFreePercent < 10) {
      issues.push('Low disk space');
      recommendations.push('Free up disk space to ensure system stability');
      score -= 10;
    }

    return {
      compliant: issues.length === 0,
      score: Math.max(0, score),
      issues: issues.length > 0 ? issues : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      last_checked: new Date().toISOString(),
    };
  }

  async registerDevice(deviceInfo: DeviceInfo): Promise<any> {
    const response = await this.client.post('/api/devices/register', {
      device_info: deviceInfo,
    });
    return response.data;
  }

  async getDeviceStatus(): Promise<any> {
    const response = await this.client.get('/api/devices/status');
    return response.data;
  }
}
