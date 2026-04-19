import React, { useState, useEffect, useCallback } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import {
  FaMinus,
  FaTimes,
  FaShieldAlt,
  FaSignOutAlt,
  FaUser,
  FaLock,
  FaNetworkWired,
  FaSync,
  FaCog,
  FaExternalLinkAlt,
  FaCircle,
  FaFolderOpen,
  FaCloudUploadAlt,
  FaCopy,
  FaBug,
  FaChevronLeft,
  FaGlobe,
} from 'react-icons/fa';

// ── Types ──────────────────────────────────────────────────────────

interface ClientResource {
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

interface ClientNetwork {
  network: string;
  connector_count: number;
  resource_count: number;
  status: string;
}

interface UserProfile {
  user_id: string;
  username: string;
  email: string;
  role: string;
}

interface AppSettings {
  serverUrl: string;
  autoStart: boolean;
  minimizeToTray: boolean;
  secureDns: boolean;
  shareCrashReports: boolean;
  collectDetailedLogs: boolean;
}

type Page = 'login' | 'resources' | 'troubleshoot' | 'settings';

// ── App ────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [page, setPage] = useState<Page>('login');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [resources, setResources] = useState<ClientResource[]>([]);
  const [networks, setNetworks] = useState<ClientNetwork[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState('');
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState({ socketConnected: false, serverUrl: '' });

  // Login form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Init
  useEffect(() => {
    (async () => {
      try {
        const auth = await window.electronAPI.getAuthStatus();
        if (auth.isAuthenticated && auth.user) {
          setUser(auth.user);
          setPage('resources');
          await refreshResources();
          await refreshNetworks();
        }
        const net = await window.electronAPI.getSelectedNetwork();
        setSelectedNetwork(net);
        const status = await window.electronAPI.getConnectionStatus();
        setConnectionStatus(status);
      } catch (e) {
        console.error('Init error:', e);
      } finally {
        setLoading(false);
      }
    })();

    // Listeners
    window.electronAPI.onNavigate((p) => setPage(p as Page));
    window.electronAPI.onLoggedOut(() => {
      setUser(null);
      setPage('login');
    });
    window.electronAPI.onResourcesUpdated((res) => setResources(res));
    window.electronAPI.onNetworkChanged((net) => {
      setSelectedNetwork(net);
      refreshResources(net);
    });
    window.electronAPI.onPolicyChanged(() => refreshResources());
  }, []);

  const refreshResources = useCallback(async (network?: string) => {
    try {
      const res = await window.electronAPI.getResources(network || selectedNetwork || undefined);
      setResources(res);
    } catch { /* handled in main */ }
  }, [selectedNetwork]);

  const refreshNetworks = useCallback(async () => {
    try {
      const nets = await window.electronAPI.getNetworks();
      setNetworks(nets);
    } catch { /* handled in main */ }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const result = await window.electronAPI.login(username, password);
      if (result.success) {
        const auth = await window.electronAPI.getAuthStatus();
        setUser(auth.user);
        setPage('resources');
        await refreshResources();
        await refreshNetworks();
        setUsername('');
        setPassword('');
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch {
      setLoginError('Connection failed. Check server URL.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await window.electronAPI.logout();
    setUser(null);
    setResources([]);
    setNetworks([]);
    setPage('login');
  };

  const handleNetworkChange = async (network: string) => {
    await window.electronAPI.setNetwork(network);
    setSelectedNetwork(network);
    await refreshResources(network);
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 to-purple-900">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center">
          <FaSync className="animate-spin text-white text-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 to-purple-900">
      <Toaster position="top-center" />
      <TitleBar />

      <div className="flex-1 overflow-hidden flex flex-col">
        {page === 'login' && (
          <LoginPage
            username={username}
            password={password}
            loginError={loginError}
            loading={loginLoading}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onSubmit={handleLogin}
          />
        )}
        {page === 'resources' && (
          <ResourcesPage
            user={user}
            resources={resources}
            networks={networks}
            selectedNetwork={selectedNetwork}
            connectionStatus={connectionStatus}
            onRefresh={() => { refreshResources(); refreshNetworks(); }}
            onNetworkChange={handleNetworkChange}
            onNavigate={setPage}
            onLogout={handleLogout}
          />
        )}
        {page === 'troubleshoot' && (
          <TroubleshootPage onBack={() => setPage('resources')} />
        )}
        {page === 'settings' && (
          <SettingsPage onBack={() => setPage('resources')} />
        )}
      </div>
    </div>
  );
};

// ── TitleBar ───────────────────────────────────────────────────────

const TitleBar: React.FC = () => (
  <div className="titlebar flex items-center justify-between px-4 py-2 bg-black/30 select-none"
       style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
    <div className="flex items-center gap-2">
      <FaShieldAlt className="text-white text-sm" />
      <span className="text-white font-semibold text-xs tracking-wide">MODZERO</span>
    </div>
    <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button onClick={() => window.electronAPI.minimize()}
              className="p-1.5 hover:bg-white/10 rounded transition-colors">
        <FaMinus className="text-white text-[10px]" />
      </button>
      <button onClick={() => window.electronAPI.close()}
              className="p-1.5 hover:bg-red-500 rounded transition-colors">
        <FaTimes className="text-white text-[10px]" />
      </button>
    </div>
  </div>
);

// ── Login ──────────────────────────────────────────────────────────

interface LoginPageProps {
  username: string;
  password: string;
  loginError: string;
  loading: boolean;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({
  username, password, loginError, loading,
  onUsernameChange, onPasswordChange, onSubmit,
}) => (
  <div className="flex-1 flex flex-col items-center justify-center p-6">
    <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
          <FaShieldAlt className="text-white text-3xl" />
        </div>
        <h1 className="text-2xl font-bold text-white">ModZero</h1>
        <p className="text-white/60 text-sm mt-1">Zero Trust Security</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="relative">
          <FaUser className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input type="text" placeholder="Username" value={username}
                 onChange={(e) => onUsernameChange(e.target.value)}
                 className="w-full bg-white/10 border border-white/20 rounded-lg px-10 py-3 text-white placeholder-white/40 focus:outline-none focus:border-purple-400/60" />
        </div>
        <div className="relative">
          <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input type="password" placeholder="Password" value={password}
                 onChange={(e) => onPasswordChange(e.target.value)}
                 className="w-full bg-white/10 border border-white/20 rounded-lg px-10 py-3 text-white placeholder-white/40 focus:outline-none focus:border-purple-400/60" />
        </div>

        {loginError && (
          <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3 text-red-200 text-sm">
            {loginError}
          </div>
        )}

        <button type="submit" disabled={loading}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50">
          {loading ? 'Connecting...' : 'Sign In'}
        </button>
      </form>
    </div>
  </div>
);

// ── Resources ──────────────────────────────────────────────────────

interface ResourcesPageProps {
  user: UserProfile | null;
  resources: ClientResource[];
  networks: ClientNetwork[];
  selectedNetwork: string;
  connectionStatus: { socketConnected: boolean; serverUrl: string };
  onRefresh: () => void;
  onNetworkChange: (network: string) => void;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

const ResourcesPage: React.FC<ResourcesPageProps> = ({
  user, resources, networks, selectedNetwork, connectionStatus,
  onRefresh, onNetworkChange, onNavigate, onLogout,
}) => {
  const openResource = async (resource: ClientResource) => {
    const ok = await window.electronAPI.openResource(resource);
    if (!ok) toast.error('Failed to open resource');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="px-4 py-3 bg-white/5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaCircle className={`text-[8px] ${connectionStatus.socketConnected ? 'text-green-400' : 'text-red-400'}`} />
            <span className="text-white/70 text-xs">
              {connectionStatus.socketConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <FaUser className="text-[10px]" />
            <span>{user?.email || user?.username || ''}</span>
          </div>
        </div>
      </div>

      {/* Network selector */}
      {networks.length > 0 && (
        <div className="px-4 py-2 bg-white/5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <FaNetworkWired className="text-white/40 text-sm" />
            <select value={selectedNetwork}
                    onChange={(e) => onNetworkChange(e.target.value)}
                    className="flex-1 bg-transparent text-white text-sm border-none focus:outline-none cursor-pointer">
              <option value="" className="bg-slate-800">All Networks</option>
              {networks.map((n) => (
                <option key={n.network} value={n.network} className="bg-slate-800">
                  {n.network} ({n.resource_count} resources)
                </option>
              ))}
            </select>
            <button onClick={onRefresh} className="p-1 hover:bg-white/10 rounded transition-colors">
              <FaSync className="text-white/40 text-xs" />
            </button>
          </div>
        </div>
      )}

      {/* Resource list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {resources.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            <FaGlobe className="text-3xl mx-auto mb-3" />
            <p className="text-sm">No resources available</p>
            <button onClick={onRefresh}
                    className="mt-3 text-purple-400 text-xs hover:text-purple-300 transition-colors">
              Refresh
            </button>
          </div>
        ) : (
          resources.map((r) => (
            <button key={r.resource_id}
                    onClick={() => openResource(r)}
                    className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-left group">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <FaGlobe className="text-purple-300 text-sm" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium text-sm truncate">{r.name}</div>
                <div className="text-white/40 text-xs truncate">
                  {r.target_host}:{r.target_port}{r.path_prefix}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <FaCircle className={`text-[6px] ${r.status === 'online' ? 'text-green-400' : 'text-yellow-400'}`} />
                <FaExternalLinkAlt className="text-white/20 text-xs group-hover:text-white/50 transition-colors" />
              </div>
            </button>
          ))
        )}
      </div>

      {/* Bottom nav */}
      <div className="px-4 py-3 bg-white/5 border-t border-white/10 flex gap-2">
        <button onClick={() => onNavigate('troubleshoot')}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs">
          <FaBug /> Troubleshoot
        </button>
        <button onClick={() => onNavigate('settings')}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs">
          <FaCog /> Settings
        </button>
        <button onClick={onLogout}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs">
          <FaSignOutAlt /> Logout
        </button>
      </div>
    </div>
  );
};

// ── Troubleshoot ───────────────────────────────────────────────────

const TroubleshootPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [uploading, setUploading] = useState(false);

  const viewLogs = () => window.electronAPI.viewLogs();

  const uploadLogs = async () => {
    setUploading(true);
    try {
      const ok = await window.electronAPI.uploadLogs();
      if (ok) toast.success('Logs uploaded');
      else toast.error('Upload failed');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const copyVersion = async () => {
    await window.electronAPI.copyVersionDetails();
    toast.success('Copied to clipboard');
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex items-center gap-3">
        <button onClick={onBack} className="text-white/60 hover:text-white transition-colors">
          <FaChevronLeft />
        </button>
        <h2 className="text-white font-semibold text-sm">Troubleshoot</h2>
      </div>

      <div className="p-4 space-y-2">
        <TroubleItem icon={<FaFolderOpen />} label="View Logs"
                     description="Open log files directory"
                     onClick={viewLogs} />
        <TroubleItem icon={<FaCloudUploadAlt />} label="Upload Logs"
                     description="Send logs to controller for analysis"
                     onClick={uploadLogs} loading={uploading} />
        <TroubleItem icon={<FaCopy />} label="Copy Version Details"
                     description="Copy app version and system info"
                     onClick={copyVersion} />
      </div>
    </div>
  );
};

const TroubleItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  loading?: boolean;
}> = ({ icon, label, description, onClick, loading }) => (
  <button onClick={onClick} disabled={loading}
          className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-50">
    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/50 flex-shrink-0">
      {loading ? <FaSync className="animate-spin text-sm" /> : <span className="text-sm">{icon}</span>}
    </div>
    <div>
      <div className="text-white text-sm font-medium">{label}</div>
      <div className="text-white/40 text-xs">{description}</div>
    </div>
  </button>
);

// ── Settings ───────────────────────────────────────────────────────

const SettingsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);
  }, []);

  const save = async (patch: Partial<AppSettings>) => {
    const updated = { ...settings!, ...patch };
    setSettings(updated);
    await window.electronAPI.saveSettings(patch);
  };

  if (!settings) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex items-center gap-3">
        <button onClick={onBack} className="text-white/60 hover:text-white transition-colors">
          <FaChevronLeft />
        </button>
        <h2 className="text-white font-semibold text-sm">Settings</h2>
      </div>

      <div className="p-4 space-y-4">
        {/* Server URL */}
        <div>
          <label className="block text-white/50 text-xs mb-1">Controller URL</label>
          <input type="text" value={settings.serverUrl}
                 onChange={(e) => setSettings({ ...settings, serverUrl: e.target.value })}
                 onBlur={() => save({ serverUrl: settings.serverUrl })}
                 className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-400/60" />
        </div>

        {/* Toggles */}
        <ToggleRow label="Start at Login" checked={settings.autoStart}
                   onChange={(v) => save({ autoStart: v })} />
        <ToggleRow label="Minimize to Tray" checked={settings.minimizeToTray}
                   onChange={(v) => save({ minimizeToTray: v })} />
        <ToggleRow label="Secure DNS" checked={settings.secureDns}
                   onChange={(v) => save({ secureDns: v })} />

        <div className="pt-2 border-t border-white/10">
          <p className="text-white/30 text-xs mb-2">Diagnostics</p>
          <ToggleRow label="Share Crash Reports" checked={settings.shareCrashReports}
                     onChange={(v) => save({ shareCrashReports: v })} />
          <ToggleRow label="Collect Detailed Logs" checked={settings.collectDetailedLogs}
                     onChange={(v) => save({ collectDetailedLogs: v })} />
        </div>

        <div className="text-center text-white/30 text-xs pt-4">
          ModZero Client v1.0.0
        </div>
      </div>
    </div>
  );
};

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-white/70 text-sm">{label}</span>
    <button onClick={() => onChange(!checked)}
            className={`w-10 h-5 rounded-full transition-colors relative ${checked ? 'bg-purple-500' : 'bg-white/20'}`}>
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </div>
);

export default App;
