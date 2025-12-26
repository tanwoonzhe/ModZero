export interface User {
  user_id: string;
  username: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Device {
  device_id: string;
  user_id: string;
  device_name: string;
  os_version?: string;
  fingerprint?: string;
  registered_at: string;
}

export interface Attempt {
  attempt_id: string;
  user_id: string;
  device_id?: string;
  ip_address?: string;
  geo_location?: Record<string, string>;
  timestamp: string;
  result: string;
  reason?: string;
  total_score?: number;
  decision?: string;
  trust_details?: { factor: string; score: number }[];
}

export interface Policy {
  policy_id: string;
  user_id: string;
  policy_name: string;
  min_trust_threshold: number;
  description?: string;
  target_group?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  weights?: Record<string, number>;
}

export interface Template {
  template_id: string;
  name: string;
  subject: string;
  body: string;
  type: string;
  created_at: string;
}

export interface Network {
  network_id: string;
  name: string;
  cidr_range: string;
  status: string;
  connector_health: string;
  created_at: string;
  resources: Resource[];
}

export interface Resource {
  resource_id: string;
  name: string;
  description?: string;
  connector_status: string;
  last_checked?: string;
}

export interface AzureUser {
  azure_id: string;
  display_name: string;
  email: string;
  username: string;
  job_title: string;
  department: string;
  office_location: string;
  mobile_phone: string;
  business_phones: string[];
  account_enabled: boolean;
  is_synced?: boolean;
}

export interface AzureUsersResponse {
  total: number;
  users: AzureUser[];
}

export interface AzureConnectionTest {
  success: boolean;
  message: string;
  token_acquired: boolean;
  api_accessible: boolean;
}

// Assessment types
export interface AssessmentCheck {
  id: string;
  name: string;
  category: string;
  status: 'pass' | 'fail' | 'investigate' | 'planned' | 'skipped';
  risk_level: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

export interface SankeyNode {
  id: string;
  label: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface TenantInfo {
  tenant_id: string;
  display_name: string;
  verified_domains: string[];
  primary_domain: string;
}

export interface AssessmentScore {
  score: number;
  tests_passed: number;
  total_tests: number;
}

export interface AuthMethodsSummary {
  total_users: number;
  mfa_registered: number;
  passwordless: number;
  phone_auth: number;
  authenticator_app: number;
  fido2: number;
  windows_hello: number;
  single_factor: number;
}

export interface OverviewMetrics {
  users: number;
  guests: number;
  groups: number;
  apps: number;
  devices: number;
  managed_devices: number;
  compliant_devices: number;
}

export interface OverviewAssessmentData {
  data: {
    tenant: TenantInfo;
    metrics: OverviewMetrics;
    assessment_scores: {
      identity: AssessmentScore;
      devices: AssessmentScore;
    };
    auth_methods_summary: AuthMethodsSummary;
  };
  last_synced: string;
  expires_at: string;
  is_cached: boolean;
  error?: string;
}

export interface IdentityAssessmentData {
  data: {
    total_users: number;
    auth_summary: AuthMethodsSummary;
    risky_users: any[];
    risky_user_count: number;
    ca_policies: any[];
    ca_policy_count: number;
    recent_sign_ins: any[];
    checks: AssessmentCheck[];
    sankey_data: SankeyData;
  };
  last_synced: string;
  expires_at: string;
  is_cached: boolean;
  error?: string;
}

export interface DeviceAssessmentData {
  data: {
    total_devices: number;
    devices: any[];
    os_distribution: Record<string, number>;
    compliance_stats: {
      compliant: number;
      noncompliant: number;
      unknown: number;
    };
    compliance_rate: number;
    ownership_stats: {
      corporate: number;
      personal: number;
    };
    encryption_stats: {
      encrypted: number;
      not_encrypted: number;
    };
    encryption_rate: number;
    checks: AssessmentCheck[];
    sankey_data: SankeyData;
  };
  last_synced: string;
  expires_at: string;
  is_cached: boolean;
  error?: string;
}