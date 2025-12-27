import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import {
  FaMinus,
  FaTimes,
  FaShieldAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaSync,
  FaCog,
  FaSignOutAlt,
  FaUser,
  FaDesktop,
  FaLock,
  FaWifi,
  FaHdd,
  FaMemory,
  FaMicrochip,
  FaWindows,
} from 'react-icons/fa';

type Page = 'login' | 'dashboard' | 'settings';

interface DeviceInfo {
  hostname: string;
  platform: string;
  os_version: string;
  architecture: string;
  cpu: string;
  memory_total: number;
  memory_free: number;
  disk_total: number;
  disk_free: number;
  antivirus: string[];
  firewall_enabled: boolean;
  encryption_enabled: boolean;
  last_update: string;
}

interface ComplianceResult {
  compliant: boolean;
  score: number;
  issues?: string[];
  recommendations?: string[];
  last_checked: string;
}

interface Settings {
  serverUrl: string;
  autoStart: boolean;
  minimizeToTray: boolean;
  checkInterval: number;
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Check auth status
      const authStatus = await window.electronAPI.getAuthStatus();
      setIsAuthenticated(authStatus.isAuthenticated);
      
      if (authStatus.isAuthenticated) {
        setCurrentPage('dashboard');
        await loadDeviceInfo();
      }
      
      // Load settings
      const savedSettings = await window.electronAPI.getSettings();
      setSettings(savedSettings);
      
      // Listen for compliance results
      window.electronAPI.onComplianceResult((result) => {
        setComplianceResult(result);
        setChecking(false);
      });
      
      // Listen for navigation
      window.electronAPI.onNavigate((path) => {
        if (path === '/settings') setCurrentPage('settings');
      });
    } catch (error) {
      console.error('Init error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDeviceInfo = async () => {
    try {
      const info = await window.electronAPI.getDeviceInfo();
      setDeviceInfo(info);
    } catch (error) {
      console.error('Failed to load device info:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);

    try {
      const result = await window.electronAPI.login(username, password);
      if (result.success) {
        setIsAuthenticated(true);
        setCurrentPage('dashboard');
        await loadDeviceInfo();
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch (error) {
      setLoginError('Connection failed. Please check server URL.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await window.electronAPI.logout();
    setIsAuthenticated(false);
    setCurrentPage('login');
    setDeviceInfo(null);
    setComplianceResult(null);
    setUsername('');
    setPassword('');
  };

  const handleCheckCompliance = async () => {
    setChecking(true);
    await window.electronAPI.checkCompliance();
  };

  const handleSaveSettings = async (newSettings: Settings) => {
    await window.electronAPI.saveSettings(newSettings);
    setSettings(newSettings);
  };

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  if (loading && currentPage === 'login') {
    return (
      <div className="h-screen flex flex-col">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-white">
            <FaSync className="animate-spin text-3xl mx-auto mb-2" />
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Toaster position="top-center" />
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        {currentPage === 'login' && (
          <LoginPage
            username={username}
            password={password}
            loginError={loginError}
            loading={loading}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onSubmit={handleLogin}
          />
        )}
        {currentPage === 'dashboard' && (
          <DashboardPage
            deviceInfo={deviceInfo}
            complianceResult={complianceResult}
            checking={checking}
            onCheckCompliance={handleCheckCompliance}
            onNavigateToSettings={() => setCurrentPage('settings')}
            onLogout={handleLogout}
            formatBytes={formatBytes}
          />
        )}
        {currentPage === 'settings' && (
          <SettingsPage
            settings={settings}
            onSave={handleSaveSettings}
            onBack={() => setCurrentPage('dashboard')}
          />
        )}
      </div>
    </div>
  );
};

// Title Bar Component (outside App)
const TitleBar: React.FC = () => (
    <div className="titlebar flex items-center justify-between px-4 py-2 bg-black/20">
      <div className="flex items-center gap-2">
        <FaShieldAlt className="text-white text-lg" />
        <span className="text-white font-semibold text-sm">ModZero</span>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => window.electronAPI.minimize()}
          className="p-2 hover:bg-white/10 rounded transition-colors"
        >
          <FaMinus className="text-white text-xs" />
        </button>
        <button
          onClick={() => window.electronAPI.close()}
          className="p-2 hover:bg-red-500 rounded transition-colors"
        >
          <FaTimes className="text-white text-xs" />
        </button>
      </div>
    </div>
  );

// Login Page Component (outside App)
interface LoginPageProps {
  username: string;
  password: string;
  loginError: string;
  loading: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({
  username,
  password,
  loginError,
  loading,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}) => (
  <div className="flex flex-col items-center justify-center h-full p-6 animate-fadeIn">
    <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
          <FaShieldAlt className="text-white text-3xl" />
        </div>
        <h1 className="text-2xl font-bold text-white">ModZero Client</h1>
        <p className="text-white/70 text-sm mt-1">Zero Trust Security Platform</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <div className="relative">
            <FaUser className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-10 py-3 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
            />
          </div>
        </div>
        <div>
          <div className="relative">
            <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-10 py-3 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
            />
          </div>
        </div>

        {loginError && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm">
            {loginError}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-purple-600 font-semibold py-3 rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Sign In'}
        </button>
      </form>
    </div>
  </div>
);

// Dashboard Page Component (outside App)
interface DashboardPageProps {
  deviceInfo: DeviceInfo | null;
  complianceResult: ComplianceResult | null;
  checking: boolean;
  onCheckCompliance: () => void;
  onNavigateToSettings: () => void;
  onLogout: () => void;
  formatBytes: (bytes: number) => string;
}

const DashboardPage: React.FC<DashboardPageProps> = ({
  deviceInfo,
  complianceResult,
  checking,
  onCheckCompliance,
  onNavigateToSettings,
  onLogout,
  formatBytes,
}) => (
    <div className="h-full overflow-y-auto p-4 animate-fadeIn">
      {/* Compliance Status Card */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Compliance Status</h2>
          <button
            onClick={onCheckCompliance}
            disabled={checking}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/20 rounded-lg text-white text-sm hover:bg-white/30 transition-colors disabled:opacity-50"
          >
            <FaSync className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Check Now'}
          </button>
        </div>

        {complianceResult ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {complianceResult.compliant ? (
                <div className="flex items-center gap-2 text-green-400">
                  <FaCheckCircle className="text-2xl" />
                  <span className="font-semibold">Compliant</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-yellow-400">
                  <FaExclamationTriangle className="text-2xl" />
                  <span className="font-semibold">Issues Found</span>
                </div>
              )}
              <div className="ml-auto">
                <div className="text-3xl font-bold text-white">{complianceResult.score}%</div>
                <div className="text-white/50 text-xs">Security Score</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  complianceResult.score >= 80
                    ? 'bg-green-500'
                    : complianceResult.score >= 50
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${complianceResult.score}%` }}
              />
            </div>

            {/* Issues */}
            {complianceResult.issues && complianceResult.issues.length > 0 && (
              <div className="space-y-2">
                <p className="text-white/70 text-sm font-medium">Issues:</p>
                {complianceResult.issues.map((issue, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-yellow-300 text-sm">
                    <FaExclamationTriangle className="mt-0.5 flex-shrink-0" />
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-white/50">
            <p>Click "Check Now" to analyze your device</p>
          </div>
        )}
      </div>

      {/* Device Info Card */}
      {deviceInfo && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4">
          <h2 className="text-white font-semibold mb-4">Device Information</h2>
          
          <div className="space-y-3">
            <InfoRow icon={<FaDesktop />} label="Hostname" value={deviceInfo.hostname} />
            <InfoRow icon={<FaWindows />} label="OS" value={deviceInfo.os_version} />
            <InfoRow icon={<FaMicrochip />} label="CPU" value={deviceInfo.cpu} />
            <InfoRow
              icon={<FaMemory />}
              label="Memory"
              value={`${formatBytes(deviceInfo.memory_free)} free / ${formatBytes(deviceInfo.memory_total)}`}
            />
            <InfoRow
              icon={<FaHdd />}
              label="Disk"
              value={`${formatBytes(deviceInfo.disk_free)} free / ${formatBytes(deviceInfo.disk_total)}`}
            />
            <InfoRow
              icon={<FaShieldAlt />}
              label="Antivirus"
              value={deviceInfo.antivirus.join(', ') || 'Not detected'}
              status={deviceInfo.antivirus.length > 0}
            />
            <InfoRow
              icon={<FaWifi />}
              label="Firewall"
              value={deviceInfo.firewall_enabled ? 'Enabled' : 'Disabled'}
              status={deviceInfo.firewall_enabled}
            />
            <InfoRow
              icon={<FaLock />}
              label="Encryption"
              value={deviceInfo.encryption_enabled ? 'Enabled' : 'Disabled'}
              status={deviceInfo.encryption_enabled}
            />
          </div>
        </div>
      )}

      {/* Bottom Actions */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={onNavigateToSettings}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors"
        >
          <FaCog />
          Settings
        </button>
        <button
          onClick={onLogout}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors"
        >
          <FaSignOutAlt />
          Logout
        </button>
      </div>
    </div>
);

// Settings Page Component (outside App)
interface SettingsPageProps {
  settings: Settings | null;
  onSave: (settings: Settings) => void;
  onBack: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onSave, onBack }) => {
  const [localSettings, setLocalSettings] = useState<Settings>(
    settings || {
      serverUrl: 'http://localhost:8000',
      autoStart: true,
      minimizeToTray: true,
      checkInterval: 300000,
    }
  );

  return (
    <div className="h-full overflow-y-auto p-4 animate-fadeIn">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg">Settings</h2>
        <button
          onClick={onBack}
          className="text-white/70 hover:text-white"
        >
          ← Back
        </button>
      </div>

      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 space-y-4">
          <div>
            <label className="block text-white/70 text-sm mb-1">Server URL</label>
            <input
              type="text"
              value={localSettings.serverUrl}
              onChange={(e) => setLocalSettings({ ...localSettings, serverUrl: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/40"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-white/70 text-sm">Auto-start with Windows</label>
            <input
              type="checkbox"
              checked={localSettings.autoStart}
              onChange={(e) => setLocalSettings({ ...localSettings, autoStart: e.target.checked })}
              className="w-5 h-5 rounded"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-white/70 text-sm">Minimize to tray</label>
            <input
              type="checkbox"
              checked={localSettings.minimizeToTray}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, minimizeToTray: e.target.checked })
              }
              className="w-5 h-5 rounded"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">Check Interval</label>
            <select
              value={localSettings.checkInterval}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, checkInterval: Number(e.target.value) })
              }
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/40"
            >
              <option value={60000}>Every minute</option>
              <option value={300000}>Every 5 minutes</option>
              <option value={900000}>Every 15 minutes</option>
              <option value={1800000}>Every 30 minutes</option>
              <option value={3600000}>Every hour</option>
            </select>
          </div>

          <button
            onClick={() => onSave(localSettings)}
            className="w-full bg-white text-purple-600 font-semibold py-2 rounded-lg hover:bg-white/90 transition-colors"
          >
            Save Settings
          </button>
        </div>

        <div className="mt-4 text-center text-white/50 text-xs">
          ModZero Client v1.0.0
        </div>
      </div>
    );
};

// Info Row Component (outside App)
interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  status?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value, status }) => (
  <div className="flex items-center gap-3">
    <div className="text-white/50">{icon}</div>
    <div className="flex-1">
      <div className="text-white/50 text-xs">{label}</div>
      <div className="text-white font-medium">{value}</div>
    </div>
    {status !== undefined && (
      <div className={`w-2 h-2 rounded-full ${status ? 'bg-green-500' : 'bg-red-500'}`} />
    )}
  </div>
);

export default App;
