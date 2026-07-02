/**
 * Zero Trust Policies Page
 * 
 * Central authority for weight configuration:
 * - Pillar weight sliders (sum normalizes to 100)
 * - Control weight table with edit capability
 * - License management
 * - Audit log for weight changes
 * 
 * RBAC: Only Admin role can edit; others view read-only.
 */

import React, { useState, useEffect } from 'react';
import {
  FaShieldAlt,
  FaShieldAlt as FaShieldAltB,
  FaCog,
  FaUndo,
  FaSave,
  FaExclamationTriangle,
  FaLaptop,
  FaNetworkWired,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import {
  useZeroTrustStore,
  selectIsAdmin,
} from '../store/zeroTrustStore';
import api from '../api';

type FailureAction = 'reduce_score' | 'deny_immediately_client' | 'deny_immediately_resources';
type EntraModule = 'identity' | 'device' | 'context';

const FAILURE_ACTION_OPTIONS: { value: FailureAction; label: string }[] = [
  { value: 'reduce_score', label: 'Reduce score only' },
  { value: 'deny_immediately_client', label: 'Deny Immediately (Client)' },
  { value: 'deny_immediately_resources', label: 'Deny Immediately (Resources)' },
];

// Human-readable descriptions shown under each signal's label. Purely
// cosmetic — the backend signal_rules table only stores a short `label`,
// not a full description, so this stays a frontend-only lookup.
const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  // Device — local
  firewall_enabled:        'All three Windows Firewall profiles (Domain, Private, Public) are enabled — not just one',
  antivirus_enabled:       'Windows Defender or a registered third-party antivirus is active',
  av_advanced_protection:  'Real-time protection, cloud-delivered protection, automatic sample submission, and Dev Drive protection are all on (Defender-specific; Windows Security > Virus & threat protection settings)',
  disk_encryption_enabled: 'BitLocker system drive is fully encrypted with protection on',
  screen_lock_enabled:     'Secure screensaver or console-lock timeout is configured',
  os_supported:            'Most recently installed Windows update (Win32_QuickFixEngineering) was within the last 90 days',
  client_healthy:          'Client app reported version meets MIN_CLIENT_VERSION (posture_scoring.py)',
  intune_compliant:        'Device is marked compliant by Intune',
  // Device — entra
  entra_registered: 'Device is registered in the Entra ID directory',
  intune_managed:   'Device is enrolled and actively managed by Intune MDM',
  intune_encrypted: 'Intune reports the device disk as encrypted',
  // Identity — local
  low_failed_logins:         'User.failed_login_count is below the lockout threshold (5) — incremented on every failed login, reset on success',
  not_locked:                'Account is not currently locked. Auto-locks for 15 minutes after 5 failed logins, or can be locked/unlocked manually from the user detail page',
  entra_linked:               'User.linked_entra_upn is set. Linking unlocks the Entra identity signals below',
  password_changed_recently: 'Password was changed within the last 90 days, from User.password_changed_at',
  // Identity — entra
  account_enabled:       'Entra account is active (accountEnabled field)',
  role_valid:             'User belongs to a qualifying Entra group or directory role — any membership by default, or a specific admin-configured set (see "Configure")',
  mfa_registered:        'Multi-factor authentication method registered in Entra (Authenticator App, FIDO2, etc.)',
  identity_risk_low:     'Entra Identity Protection risk level is none or low for this user',
  // Context — local
  normal_access_time:         'Request hour falls within the Allowed Start/End Hour window (see "Configure")',
  no_repeated_failed_login:   'User.failed_login_count is below Max Failed Login Attempts (see "Configure"; shared with the Identity module\'s Low Failed Logins, evaluated against a different threshold there)',
  normal_ip:                  'Request source IP is not on the admin-managed blocklist — empty list (default) always passes (see "Configure")',
  trusted_network:            'Request source IP matches an admin-managed trusted network (IP or CIDR range) — N/A until at least one is configured (see "Configure")',
  network_profile_check:      'Client-reported Windows network connection category (Public / Private / DomainAuthenticated) is not Public — N/A until the client app reports one',
  access_frequency_check:     'This user has made no more than 20 access requests in the last 10 minutes',
  gateway_online:             'At least one Connector is currently online — a coarse "is the backend reachable" system-health check, not tied to a specific resource',
  // Context — entra
  signin_risk_low:            'User is not flagged by Entra Identity Protection as a risky sign-in',
  trusted_location:           'Sign-in originated from a Named Location configured as trusted in this tenant',
  latest_signin_ip_match:     'This request\'s source IP matches the IP Entra recorded for the user\'s most recent sign-in',
  signin_location_consistent: 'The user\'s 2 most recent Entra sign-ins originated from the same country',
};

interface GroupOrRole {
  id: string;
  display_name: string;
  description: string | null;
  type: 'group' | 'role';
}

const RoleValidConfigModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [items, setItems] = useState<GroupOrRole[]>([]);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      api.get('/azure/groups-and-roles'),
      api.get('/trust-policy/active'),
    ]).then(([listRes, policyRes]) => {
      setItems(listRes.data.items || []);
      setFetchErrors(listRes.data.errors || []);
      setSelected(new Set((policyRes.data.valid_role_ids || []) as string[]));
    }).catch(() => {
      setFetchErrors(['Failed to load groups and roles from Microsoft Graph.']);
    }).finally(() => setLoading(false));
  }, []);

  const toggleItem = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/trust-policy/active', { valid_role_ids: Array.from(selected) });
      api.post('/signal-rules/notify-check').catch(() => {});
      toast.success(selected.size === 0 ? 'Reset to default: any group/role membership counts' : `Saved — ${selected.size} qualifying group(s)/role(s)`);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const filtered = items.filter(i => i.display_name?.toLowerCase().includes(search.toLowerCase()));
  const groups = filtered.filter(i => i.type === 'group');
  const roles = filtered.filter(i => i.type === 'role');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Configure Role Valid</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Pick which Entra groups and/or directory roles count as "valid" for this user's Role Valid signal.
            Leave nothing selected to keep the default: any group or role membership counts.
            This saves directly to the trust policy — unlike the rest of this card, it takes effect immediately.
          </p>
        </div>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search groups and roles…"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <>
              {fetchErrors.length > 0 && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-300">
                  {fetchErrors.join(' · ')}
                </div>
              )}
              {groups.length === 0 && roles.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No groups or roles found.</p>
              )}
              {groups.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Groups</p>
                  <div className="space-y-1">
                    {groups.map(g => (
                      <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                        <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleItem(g.id)} className="rounded" />
                        <span className="text-sm text-gray-900 dark:text-white">{g.display_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {roles.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Directory Roles</p>
                  <div className="space-y-1">
                    {roles.map(r => (
                      <label key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleItem(r.id)} className="rounded" />
                        <span className="text-sm text-gray-900 dark:text-white">{r.display_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">{selected.size === 0 ? 'Default: any membership' : `${selected.size} selected`}</span>
          <div className="flex gap-3">
            <button
              onClick={() => setSelected(new Set())}
              disabled={saving}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
            >
              Reset to default
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const IPBlocklistConfigModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [ips, setIps] = useState<string[]>([]);
  const [newIp, setNewIp] = useState('');
  const [penalty, setPenalty] = useState(15);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => {
        setIps((r.data.blocked_ips || []) as string[]);
        setPenalty(r.data.suspicious_ip_penalty ?? 15);
      })
      .catch(() => toast.error('Failed to load IP blocklist'))
      .finally(() => setLoading(false));
  }, []);

  const addIp = () => {
    const v = newIp.trim();
    if (!v) return;
    if (ips.includes(v)) { toast.error('Already in the list'); return; }
    setIps(prev => [...prev, v]);
    setNewIp('');
  };
  const removeIp = (ip: string) => setIps(prev => prev.filter(x => x !== ip));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/trust-policy/active', { blocked_ips: ips, suspicious_ip_penalty: penalty });
      api.post('/signal-rules/notify-check').catch(() => {});
      toast.success(ips.length === 0 ? 'Blocklist cleared — Normal IP will always pass' : `Saved — ${ips.length} blocked IP(s)`);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Configure Normal IP</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            The "Normal IP" signal fails when a device check's source IP exactly matches one of these entries.
            Empty list = always passes (no blocklist configured). CIDR ranges aren't matched — exact IP strings only.
          </p>
        </div>
        <div className="px-5 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-sm text-gray-700 dark:text-gray-300">Suspicious IP Score Penalty</span>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={100} value={penalty}
              onChange={e => setPenalty(Number(e.target.value))}
              className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            <span className="text-xs text-gray-400">pts</span>
          </div>
        </div>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex gap-2">
          <input
            type="text"
            value={newIp}
            onChange={e => setNewIp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIp(); } }}
            placeholder="e.g., 203.0.113.42"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={addIp}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Add
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            </div>
          ) : ips.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No blocked IPs configured.</p>
          ) : (
            <div className="space-y-1">
              {ips.map(ip => (
                <div key={ip} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                  <span className="text-sm font-mono text-gray-900 dark:text-white">{ip}</span>
                  <button onClick={() => removeIp(ip)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">{ips.length} blocked</span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TrustedNetworkConfigModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [networks, setNetworks] = useState<string[]>([]);
  const [newNetwork, setNewNetwork] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => setNetworks((r.data.trusted_networks || []) as string[]))
      .catch(() => toast.error('Failed to load trusted networks'))
      .finally(() => setLoading(false));
  }, []);

  const addNetwork = () => {
    const v = newNetwork.trim();
    if (!v) return;
    if (networks.includes(v)) { toast.error('Already in the list'); return; }
    setNetworks(prev => [...prev, v]);
    setNewNetwork('');
  };
  const removeNetwork = (n: string) => setNetworks(prev => prev.filter(x => x !== n));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/trust-policy/active', { trusted_networks: networks });
      api.post('/signal-rules/notify-check').catch(() => {});
      toast.success(networks.length === 0 ? 'Cleared — Trusted Network will always show N/A' : `Saved — ${networks.length} trusted network(s)`);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Configure Trusted Network</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            The "Trusted Network" signal passes when a device check's source IP falls inside one of these ranges.
            Empty list (default) = N/A — nothing configured to confirm trust against, never a fake Pass.
          </p>
        </div>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex gap-2">
          <input
            type="text"
            value={newNetwork}
            onChange={e => setNewNetwork(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNetwork(); } }}
            placeholder="e.g., 203.0.113.0/24 or 203.0.113.42"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={addNetwork}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Add
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            </div>
          ) : networks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No trusted networks configured.</p>
          ) : (
            <div className="space-y-1">
              {networks.map(n => (
                <div key={n} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                  <span className="text-sm font-mono text-gray-900 dark:text-white">{n}</span>
                  <button onClick={() => removeNetwork(n)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">{networks.length} configured</span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const NormalAccessTimeConfigModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(20);
  const [blockOutside, setBlockOutside] = useState(false);

  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => {
        setStartHour(r.data.allowed_start_hour ?? 8);
        setEndHour(r.data.allowed_end_hour ?? 20);
        setBlockOutside(r.data.block_outside_hours ?? false);
      })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/trust-policy/active', {
        allowed_start_hour: startHour,
        allowed_end_hour: endHour,
        block_outside_hours: blockOutside,
      });
      api.post('/signal-rules/notify-check').catch(() => {});
      toast.success('Saved');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Configure Normal Access Time</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            The allowed hour window this signal checks against, and whether access outside it is denied outright regardless of trust score.
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Allowed Start Hour (0–23)</span>
              <input type="number" min={0} max={23} value={startHour}
                onChange={e => setStartHour(Number(e.target.value))}
                className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Allowed End Hour (0–23)</span>
              <input type="number" min={0} max={23} value={endHour}
                onChange={e => setEndHour(Number(e.target.value))}
                className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300">Block Outside Allowed Hours</span>
                <p className="text-xs text-gray-400">Deny access outright outside the window, regardless of trust score.</p>
              </div>
              <button
                onClick={() => setBlockOutside(!blockOutside)}
                className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${blockOutside ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`block w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${blockOutside ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        )}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={handleSave} disabled={saving || loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

const NoRepeatedFailedLoginConfigModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maxFailedAttempts, setMaxFailedAttempts] = useState(5);

  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => setMaxFailedAttempts(r.data.max_failed_attempts ?? 5))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/trust-policy/active', { max_failed_attempts: maxFailedAttempts });
      api.post('/signal-rules/notify-check').catch(() => {});
      toast.success('Saved');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Configure No Repeated Failed Login</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            If a user's failed login count meets or exceeds this number, this signal fails.
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Max Failed Login Attempts</span>
              <input type="number" min={1} max={20} value={maxFailedAttempts}
                onChange={e => setMaxFailedAttempts(Number(e.target.value))}
                className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
          </div>
        )}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={handleSave} disabled={saving || loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

interface SignalRuleRow {
  id: string;
  module: string;
  signal_key: string;
  source: string;
  label: string;
  enabled: boolean;
  max_points: number;
  failure_action: FailureAction;
}

const SignalRulesTable: React.FC<{
  module: 'device' | 'identity' | 'context';
  source: 'local' | 'entra';
  title: string;
  subtitle: string;
  sourceLabel: string;
  showGlobalBadge?: boolean;
  footerNote?: string;
  extraRowAction?: (row: SignalRuleRow) => React.ReactNode;
}> = ({ module, source, title, subtitle, sourceLabel, showGlobalBadge, footerNote, extraRowAction }) => {
  const [rules, setRules] = useState<SignalRuleRow[]>([]);
  const [snapshot, setSnapshot] = useState<Record<string, SignalRuleRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState<boolean | null>(null);

  const load = () => {
    setLoading(true);
    api.get('/signal-rules', { params: { module } })
      .then(r => {
        const filtered = (r.data as SignalRuleRow[]).filter(x => x.source === source);
        setRules(filtered);
        setSnapshot(Object.fromEntries(filtered.map(x => [x.id, x])));
      })
      .catch(() => toast.error(`Failed to load ${title}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [module, source]);

  useEffect(() => {
    if (!showGlobalBadge) return;
    api.get('/trust-policy/active')
      .then(r => setGlobalEnabled(!!r.data.entra_enabled))
      .catch(() => setGlobalEnabled(false));
  }, [showGlobalBadge]);

  const toggle = (id: string) =>
    setRules(rs => rs.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const setPts = (id: string, pts: number) =>
    setRules(rs => rs.map(r => r.id === id ? { ...r, max_points: Math.max(0, Math.min(100, pts)) } : r));
  const setAction = (id: string, action: FailureAction) =>
    setRules(rs => rs.map(r => r.id === id ? { ...r, failure_action: action } : r));

  const handleSave = async () => {
    setSaving(true);
    try {
      const changed = rules.filter(r => {
        const o = snapshot[r.id];
        return !o || o.enabled !== r.enabled || o.max_points !== r.max_points || o.failure_action !== r.failure_action;
      });
      if (changed.length > 0) {
        await Promise.all(changed.map(r => api.patch(`/signal-rules/${r.id}`, {
          enabled: r.enabled, max_points: r.max_points, failure_action: r.failure_action,
        })));
        setSnapshot(Object.fromEntries(rules.map(x => [x.id, x])));
        api.post('/signal-rules/notify-check').catch(() => {});
        toast.success(`Saved ${changed.length} rule${changed.length > 1 ? 's' : ''} — connected client apps are re-checking now`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            {title}
            {showGlobalBadge && (
              <span className={`px-2 py-0.5 rounded text-xs ${globalEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                {globalEnabled === null ? '…' : globalEnabled ? 'Active' : 'Disabled'}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
        >
          <FaSave size={13} />
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>
      {rules.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-400">No signals configured for this module yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Signal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Enabled</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max Points</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failure Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {rules.map(rule => {
                const active = (showGlobalBadge ? !!globalEnabled : true) && rule.enabled;
                return (
                  <tr key={rule.id} className={rule.enabled ? '' : 'opacity-50'}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        {rule.label}
                        {extraRowAction?.(rule)}
                      </div>
                      {SIGNAL_DESCRIPTIONS[rule.signal_key] && (
                        <div className="text-xs text-gray-400 mt-0.5">{SIGNAL_DESCRIPTIONS[rule.signal_key]}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{sourceLabel}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggle(rule.id)}
                        className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${rule.enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                      >
                        <span className={`block w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${rule.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min={0} max={100} value={rule.max_points}
                        onChange={e => setPts(rule.id, Number(e.target.value))}
                        disabled={!rule.enabled}
                        className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={rule.failure_action}
                        onChange={e => setAction(rule.id, e.target.value as FailureAction)}
                        disabled={!rule.enabled}
                        className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {FAILURE_ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                        {active ? 'Active' : 'N/A'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-400">
          {footerNote || 'Saved to the backend signal_rules table — takes effect on the next device check / access decision.'}
          {' '}"Deny Immediately (Client)" disables the user's client app access until an admin re-enables it; "Deny Immediately (Resources)" hard-denies resource access until the next passing check.
        </p>
      </div>
    </div>
  );
};

const EntraSignalsCard: React.FC<{ module: EntraModule }> = ({ module }) => {
  const [roleValidModalOpen, setRoleValidModalOpen] = useState(false);

  return (
    <>
      <SignalRulesTable
        module={module}
        source="entra"
        title="Entra Identity Signals (Microsoft Graph)"
        subtitle="Live signals contributing to the score while Entra is enabled (Settings → Azure AD Integration). While off, all signals are N/A and never affect the score."
        sourceLabel="Microsoft Graph"
        showGlobalBadge
        extraRowAction={(row) => row.signal_key === 'role_valid' ? (
          <button
            onClick={() => setRoleValidModalOpen(true)}
            className="text-xs px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
          >
            Configure
          </button>
        ) : null}
      />
      {roleValidModalOpen && <RoleValidConfigModal onClose={() => setRoleValidModalOpen(false)} />}
    </>
  );
};

const ZeroTrustPoliciesPage: React.FC = () => {
  const isAdmin = useZeroTrustStore(selectIsAdmin);

  const [resettingAll, setResettingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'resource-policies' | 'device-rules' | 'identity-rules' | 'context-rules' | 'weights'>('resource-policies');

  // Resources state for Resource Policies tab
  const [resources, setResources] = useState<any[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  // Live policy summary from backend
  const [policyConfig, setPolicyConfig] = useState<{
    device_weight: number; context_weight: number; identity_weight: number;
    default_threshold: number; updated_at?: string;
  } | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);


  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => setPolicyConfig(r.data))
      .catch(() => {})
      .finally(() => setPolicyLoading(false));
  }, []);
  
  // Fetch resources for Resource Policies tab
  useEffect(() => {
    if (activeTab === 'resource-policies' && resources.length === 0) {
      setResourcesLoading(true);
      api.get('/resources').then(r => {
        // Deduplicate by resource_id (or name if id missing)
        const seen = new Set<string>();
        const deduped = (r.data as any[]).filter(res => {
          const key = res.resource_id || res.id || res.name;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setResources(deduped);
      }).catch(() => {}).finally(() => setResourcesLoading(false));
    }
  }, [activeTab]);

  const handleResetAll = async () => {
    if (!window.confirm('Reset Device/Context/Identity weights to 40/30/30 and the access threshold to 60? This writes to the backend immediately and affects every trust score calculation.')) return;
    setResettingAll(true);
    try {
      const r = await api.patch('/trust-policy/active', {
        device_weight: 0.40, context_weight: 0.30, identity_weight: 0.30,
        default_threshold: 60,
      });
      setPolicyConfig(r.data);
      api.post('/signal-rules/notify-check').catch(() => {});
      toast.success('Weights and threshold reset to defaults');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to reset');
    } finally {
      setResettingAll(false);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <FaShieldAlt className="text-indigo-600" />
            Trust Policies
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Resource access policies, device profiles, context rules, and trust score weights • {isAdmin ? 'Admin Mode' : 'View Only'}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={handleResetAll}
              disabled={resettingAll}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <FaUndo size={14} />
              {resettingAll ? 'Resetting…' : 'Reset Weights'}
            </button>
          )}
        </div>
      </div>
      
      {/* Live Policy Summary — fetched from backend TrustPolicyConfig */}
      {policyLoading ? (
        <div className="h-24 flex items-center justify-center text-sm text-gray-400">Loading policy config…</div>
      ) : policyConfig ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-1">Access Threshold</p>
            <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{policyConfig.default_threshold}</p>
            <p className="text-xs text-gray-400 mt-1">min trust score to allow access</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-2">Module Weights</p>
            <div className="space-y-1.5">
              {[
                { label: "Device", pct: Math.round(policyConfig.device_weight * 100), color: "bg-indigo-500" },
                { label: "Context", pct: Math.round(policyConfig.context_weight * 100), color: "bg-amber-500" },
                { label: "Identity", pct: Math.round(policyConfig.identity_weight * 100), color: "bg-emerald-500" },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14">{m.label}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                    <div className={`${m.color} h-2 rounded-full`} style={{ width: `${m.pct}%` }} />
                  </div>
                  <span className="text-xs font-mono text-gray-700 dark:text-gray-300 w-8 text-right">{m.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-1">Max Possible Score</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">100</p>
            <p className="text-xs text-gray-400 mt-1">all signals passing, all weights at 100%</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-1">Last Modified</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {policyConfig.updated_at ? new Date(policyConfig.updated_at).toLocaleDateString() : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-1">TrustPolicyConfig.updated_at — this row has no per-change "who" attribution yet</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-4 text-center text-sm text-gray-400 py-4">Could not load policy config from backend.</div>
        </div>
      )}
      
      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('resource-policies')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'resource-policies'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaNetworkWired className="inline mr-2" size={14} />
          Resource Policies
        </button>
        <button
          onClick={() => setActiveTab('device-rules')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'device-rules'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaLaptop className="inline mr-2" size={14} />
          Device Rules
        </button>
        <button
          onClick={() => setActiveTab('identity-rules')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'identity-rules'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaShieldAlt className="inline mr-2" size={14} />
          Identity Rules
        </button>
        <button
          onClick={() => setActiveTab('context-rules')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'context-rules'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaShieldAltB className="inline mr-2" size={14} />
          Context Rules
        </button>
        <button
          onClick={() => setActiveTab('weights')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'weights'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaCog className="inline mr-2" size={14} />
          Trust Score Weights
        </button>
      </div>
      
      {/* Resource Policies Tab */}
      {activeTab === 'resource-policies' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resource Access Policies</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Each protected resource defines its own trust threshold and compliance requirements.
              The connector enforces these per-request using live trust score data.
            </p>
          </div>
          {resourcesLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : resources.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No protected resources found. Add resources in the Resources page.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resource</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min Trust Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intune Required</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entra Required</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {resources.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</div>
                        <div className="text-xs text-gray-500">{r.internal_address || r.public_name || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          (r.minimum_trust_score || 0) > 100
                            ? 'bg-gray-800 text-white dark:bg-gray-600'
                            : (r.minimum_trust_score || 0) >= 70
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : (r.minimum_trust_score || 0) >= 40
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}>
                          {(r.minimum_trust_score || 0) > 100 ? `${r.minimum_trust_score} (deny test)` : (r.minimum_trust_score || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          r.require_intune_compliant
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {r.require_intune_compliant ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          r.require_entra_linked
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {r.require_entra_linked ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          r.enabled
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {r.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400">
              Access is denied if the device trust score is below the resource's minimum, if Intune compliance is required but not met, if an Entra-linked identity is required but the user has none linked, or if the resource itself is disabled.
              These checks run on every access request (see <code>POST /api/access/request</code>) — edit them from the Connectors page's Resources tab.
            </p>
          </div>
        </div>
      )}

      {/* Device Rules Tab */}
      {activeTab === 'device-rules' && (
        <><DeviceRulesTab /><EntraSignalsCard module="device" /></>
      )}

      {/* Identity Rules Tab */}
      {activeTab === 'identity-rules' && (
        <><IdentityRulesTab /><EntraSignalsCard module="identity" /></>
      )}

      {/* Context Rules Tab */}
      {activeTab === 'context-rules' && (
        <><ContextLocalSignalsTab /><EntraSignalsCard module="context" /><ContextRulesTab /></>
      )}

      {/* Trust Score Weights Tab */}
      {activeTab === 'weights' && (
        <div className="space-y-6">
          <FypModuleWeightsCard />
        </div>
      )}

    </div>
  );
};

export default ZeroTrustPoliciesPage;

/* ------------------------------------------------------------------ */
/*  Device Rules Tab                                                    */
/* ------------------------------------------------------------------ */

const DeviceRulesTab: React.FC = () => (
  <SignalRulesTable
    module="device"
    source="local"
    title="Device Rules"
    subtitle="Client-app-collected device posture checks and their contribution to the Device Posture Score."
    sourceLabel="Client App"
  />
);

/* ------------------------------------------------------------------ */
/*  Identity Rules Tab                                                  */
/* ------------------------------------------------------------------ */

const IdentityRulesTab: React.FC = () => (
  <SignalRulesTable
    module="identity"
    source="local"
    title="Identity Rules"
    subtitle="Local-auth identity checks, backed by real per-user account data (login history, lock state, Entra link, password age)."
    sourceLabel="Local Auth"
  />
);

/* ------------------------------------------------------------------ */
/*  Context Rules — local signal list (Enabled/Max Points/Failure       */
/*  Action per signal, same table style as Device/Identity Rules).      */
/*  The scheduling/threshold panel below (ContextRulesTab) configures   */
/*  the *values* a couple of these signals check against — this table   */
/*  is what actually turns each individual signal on/off and scores it. */
/* ------------------------------------------------------------------ */

const ContextLocalSignalsTab: React.FC = () => {
  const [ipModalOpen, setIpModalOpen] = useState(false);
  const [trustedNetworkModalOpen, setTrustedNetworkModalOpen] = useState(false);
  const [accessTimeModalOpen, setAccessTimeModalOpen] = useState(false);
  const [failedLoginModalOpen, setFailedLoginModalOpen] = useState(false);

  const configureButton = (onClick: () => void) => (
    <button
      onClick={onClick}
      className="text-xs px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
    >
      Configure
    </button>
  );

  return (
    <>
      <SignalRulesTable
        module="context"
        source="local"
        title="Context Rules"
        subtitle="Real-time request context checks. Normal IP and Trusted Network check against admin-managed lists (empty by default — see Configure on each row); Gateway/Connector Online reflects real Connector status."
        sourceLabel="Backend (real-time)"
        extraRowAction={(row) => {
          if (row.signal_key === 'normal_ip') return configureButton(() => setIpModalOpen(true));
          if (row.signal_key === 'trusted_network') return configureButton(() => setTrustedNetworkModalOpen(true));
          if (row.signal_key === 'normal_access_time') return configureButton(() => setAccessTimeModalOpen(true));
          if (row.signal_key === 'no_repeated_failed_login') return configureButton(() => setFailedLoginModalOpen(true));
          return null;
        }}
      />
      {ipModalOpen && <IPBlocklistConfigModal onClose={() => setIpModalOpen(false)} />}
      {trustedNetworkModalOpen && <TrustedNetworkConfigModal onClose={() => setTrustedNetworkModalOpen(false)} />}
      {accessTimeModalOpen && <NormalAccessTimeConfigModal onClose={() => setAccessTimeModalOpen(false)} />}
      {failedLoginModalOpen && <NoRepeatedFailedLoginConfigModal onClose={() => setFailedLoginModalOpen(false)} />}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Context Rules Tab                                                   */
/* ------------------------------------------------------------------ */

const ContextRulesTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [autoCheckIntervalHours, setAutoCheckIntervalHours] = useState(0);

  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => {
        setAutoCheckIntervalHours(r.data.auto_check_interval_hours ?? 0);
      })
      .catch(() => setError('Failed to load context rules from backend.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/trust-policy/active', {
        auto_check_interval_hours: autoCheckIntervalHours,
      });
      api.post('/signal-rules/notify-check').catch(() => {});
      setSavedOk(true);
      toast.success('Context rules saved to backend');
      setTimeout(() => setSavedOk(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const row = (label: string, desc: string, control: React.ReactNode) => (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className="flex-1 pr-6">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Context Rules — Scheduling</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Settings not tied to any specific signal above. Everything a specific Context Rules signal checks against
            (allowed hours, failed-login threshold, IP/network lists) now lives behind that signal's own "Configure" button.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
        >
          <FaSave size={13} />
          {saving ? 'Saving…' : savedOk ? 'Saved!' : 'Save'}
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-3 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="px-6 divide-y divide-gray-100 dark:divide-gray-700">
        {row(
          'Auto Device Check Interval',
          'Not a trust score signal — purely a schedule. Every N hours, all connected client apps automatically re-run a device check on their own, in addition to manual clicks, app startup, and pushes triggered by policy saves. Set to 0 to disable.',
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={168} value={autoCheckIntervalHours}
              onChange={e => setAutoCheckIntervalHours(Number(e.target.value))}
              className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            <span className="text-xs text-gray-400">{autoCheckIntervalHours === 0 ? 'disabled' : 'hours'}</span>
          </div>
        )}
      </div>

      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-400">
          These rules are stored in the backend database and applied by every trust score calculation (client app device check, resource access gate, dashboard).
          Source: <code>TrustPolicyConfig</code> via <code>PATCH /api/trust-policy/active</code>.
        </p>
      </div>
    </div>
  );
};
/* ------------------------------------------------------------------ */
/*  FYP Module Weights + Access Threshold                             */
/* ------------------------------------------------------------------ */

const FypModuleWeightsCard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Weights stored as percentages (0-100) in UI; API uses 0.0-1.0
  const [devicePct, setDevicePct]     = useState(40);
  const [contextPct, setContextPct]   = useState(30);
  const [identityPct, setIdentityPct] = useState(30);
  const [threshold, setThreshold]     = useState(60);

  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => {
        const d = r.data;
        setDevicePct(Math.round((d.device_weight ?? 0.4) * 100));
        setContextPct(Math.round((d.context_weight ?? 0.3) * 100));
        setIdentityPct(Math.round((d.identity_weight ?? 0.3) * 100));
        setThreshold(d.default_threshold ?? 60);
      })
      .catch(() => setError('Failed to load weights from backend.'))
      .finally(() => setLoading(false));
  }, []);

  const total = devicePct + contextPct + identityPct;
  const totalValid = total === 100;

  const handleSave = async () => {
    if (!totalValid) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch('/trust-policy/active', {
        device_weight:   devicePct / 100,
        context_weight:  contextPct / 100,
        identity_weight: identityPct / 100,
        default_threshold: threshold,
      });
      api.post('/signal-rules/notify-check').catch(() => {});
      setSavedOk(true);
      toast.success('Trust score weights saved to backend');
      setTimeout(() => setSavedOk(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const modules = [
    {
      pct: devicePct, setPct: setDevicePct,
      label: 'Device Posture Score',
      icon: FaLaptop, color: 'text-indigo-600',
      desc: 'Firewall, AV, disk encryption, screen lock, OS version, client health, Intune compliance.',
    },
    {
      pct: contextPct, setPct: setContextPct,
      label: 'Context Analysis Score',
      icon: FaNetworkWired, color: 'text-amber-600',
      desc: 'Known device, access time window, failed login count, source IP, user-device pair.',
    },
    {
      pct: identityPct, setPct: setIdentityPct,
      label: 'Identity Score',
      icon: FaShieldAltB, color: 'text-emerald-600',
      desc: 'Account enabled, MFA registered, admin role, guest status, last sign-in recency.',
    },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FaCog className="text-indigo-600" /> Trust Score Weights
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            These weights are stored in the backend and used by every trust score calculation — client app device check,
            resource access gate, and dashboard. <strong>Total must equal exactly 100%.</strong>
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!totalValid || saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          <FaSave size={13} />
          {saving ? 'Saving…' : savedOk ? 'Saved!' : 'Save Weights'}
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!totalValid && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5">
          <FaExclamationTriangle className="text-red-500 flex-shrink-0" size={14} />
          <p className="text-sm text-red-700 dark:text-red-300">
            Weights must sum to <strong>100%</strong>. Current total: <strong>{total}%</strong>.
          </p>
        </div>
      )}

      <div className="p-6 space-y-6">
        {modules.map(m => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={m.color} />
                  <span className="font-medium text-gray-900 dark:text-gray-100">{m.label}</span>
                </div>
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-white">{m.pct}%</span>
              </div>
              <input
                type="range" min={0} max={100} value={m.pct}
                onChange={e => m.setPct(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400">{m.desc}</div>
            </div>
          );
        })}

        <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${
          totalValid
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Weight</span>
          <span className={`text-lg font-bold ${totalValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {total}%
          </span>
        </div>

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">Access Threshold</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Minimum final trust score required to allow access. Resources can set a higher per-resource threshold.
              </div>
            </div>
            <span className="text-lg font-bold text-indigo-600">{threshold} / 100</span>
          </div>
          <input
            type="range" min={0} max={100} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="text-xs text-gray-400 pt-1">
          Source: backend <code>TrustPolicyConfig</code> via <code>GET/PATCH /api/trust-policy/active</code>.
          Changes take effect on the next trust score calculation.
        </div>
      </div>
    </div>
  );
};
