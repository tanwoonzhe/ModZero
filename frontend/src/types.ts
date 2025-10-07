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