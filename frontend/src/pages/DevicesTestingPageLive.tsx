/**
 * Devices Testing Page - Live Microsoft Integration
 * 
 * This page displays all 36 device security tests and runs them
 * against real Microsoft Graph API / Intune data from your Azure tenant.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  FaLaptopMedical,
  FaSearch,
  FaSync,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaQuestionCircle,
  FaClock,
  FaChevronDown,
  FaChevronUp,
  FaExternalLinkAlt,
  FaFilter,
  FaPlay,
  FaSpinner,
  FaDesktop,
  FaApple,
  FaAndroid,
  FaWindows,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import { devicesTests, SecurityTest } from '../data/devicesTests';
import api from '../api';

// Status colors and icons
const STATUS_CONFIG = {
  Passed: { color: 'bg-green-100 text-green-800 border-green-200', icon: FaCheckCircle, iconColor: 'text-green-500' },
  Failed: { color: 'bg-red-100 text-red-800 border-red-200', icon: FaTimesCircle, iconColor: 'text-red-500' },
  Investigate: { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: FaExclamationTriangle, iconColor: 'text-amber-500' },
  Skipped: { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: FaQuestionCircle, iconColor: 'text-gray-400' },
  Planned: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: FaClock, iconColor: 'text-blue-500' },
  Running: { color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: FaSpinner, iconColor: 'text-indigo-500' },
};

const RISK_COLORS = {
  High: 'bg-red-100 text-red-700 border-red-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  Low: 'bg-green-100 text-green-700 border-green-200',
};

// Remediation map for device tests
const deviceRemediationMap: Record<string, { text: string; link: string; linkText: string }> = {
  "compliance": {
    text: "Create and assign compliance policies for all managed device platforms. Ensure policies include encryption, password requirements, and OS version controls.",
    link: "https://learn.microsoft.com/en-us/mem/intune/protect/device-compliance-get-started",
    linkText: "Configure Intune compliance policies"
  },
  "bitlocker": {
    text: "Enable BitLocker encryption on all Windows devices and configure recovery key backup to Azure AD.",
    link: "https://learn.microsoft.com/en-us/mem/intune/protect/encrypt-devices",
    linkText: "Configure BitLocker with Intune"
  },
  "defender": {
    text: "Deploy Microsoft Defender for Endpoint to all devices. Configure threat protection policies and enable automated investigation.",
    link: "https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/deployment-phases",
    linkText: "Deploy Defender for Endpoint"
  },
  "firewall": {
    text: "Configure Windows Firewall policies via Intune to protect against unauthorized network access.",
    link: "https://learn.microsoft.com/en-us/mem/intune/protect/endpoint-security-firewall-policy",
    linkText: "Configure Firewall policies"
  },
  "enrollment": {
    text: "Enable automatic device enrollment to ensure all devices are managed by Intune upon Azure AD join.",
    link: "https://learn.microsoft.com/en-us/mem/intune/enrollment/windows-enrollment-methods",
    linkText: "Configure Windows enrollment"
  },
  "encryption": {
    text: "Ensure all managed devices have encryption enabled. For Windows use BitLocker, for macOS use FileVault.",
    link: "https://learn.microsoft.com/en-us/mem/intune/protect/encrypt-devices",
    linkText: "Configure device encryption"
  },
  "update": {
    text: "Configure Windows Update for Business policies to ensure devices receive security updates promptly.",
    link: "https://learn.microsoft.com/en-us/mem/intune/protect/windows-update-for-business-configure",
    linkText: "Configure Windows Update policies"
  },
};

interface TestResult {
  testId: string;
  status: 'Passed' | 'Failed' | 'Investigate' | 'Skipped' | 'Running';
  details?: string;
  data?: any;
  recommendation?: string;
  timestamp?: string;
}

interface DeviceStats {
  total: number;
  compliant: number;
  nonCompliant: number;
  windows: number;
  mac: number;
  ios: number;
  android: number;
}

const DevicesTestingPageLive: React.FC = () => {
  // State
  const [tests, setTests] = useState<SecurityTest[]>(devicesTests);
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [isRunning, setIsRunning] = useState(false);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedRisk, setSelectedRisk] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [azureConnected, setAzureConnected] = useState<boolean | null>(null);
  const [deviceStats, setDeviceStats] = useState<DeviceStats | null>(null);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(tests.map(t => t.category));
    return Array.from(cats).sort();
  }, [tests]);

  // Filter tests
  const filteredTests = useMemo(() => {
    return tests.filter(test => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!test.title.toLowerCase().includes(term) && 
            !test.testId.toLowerCase().includes(term) &&
            !test.description.toLowerCase().includes(term)) {
          return false;
        }
      }
      if (selectedCategory && test.category !== selectedCategory) return false;
      if (selectedRisk && test.risk !== selectedRisk) return false;
      if (selectedStatus) {
        const result = testResults.get(test.id);
        const status = result?.status || test.status;
        if (status !== selectedStatus) return false;
      }
      return true;
    });
  }, [tests, searchTerm, selectedCategory, selectedRisk, selectedStatus, testResults]);

  // Statistics
  const stats = useMemo(() => {
    let passed = 0, failed = 0, investigate = 0, skipped = 0;
    tests.forEach(test => {
      const result = testResults.get(test.id);
      const status = result?.status || test.status;
      if (status === 'Passed') passed++;
      else if (status === 'Failed') failed++;
      else if (status === 'Investigate') investigate++;
      else skipped++;
    });
    return { passed, failed, investigate, skipped, total: tests.length };
  }, [tests, testResults]);

  // Check Azure connection and fetch device stats on mount
  useEffect(() => {
    checkAzureConnection();
    fetchDeviceStats();
  }, []);

  const checkAzureConnection = async () => {
    try {
      const response = await api.get('/azure/test-connection');
      setAzureConnected(response.data.success);
    } catch (error) {
      setAzureConnected(false);
    }
  };

  const fetchDeviceStats = async () => {
    try {
      const response = await api.get('/devices/stats');
      setDeviceStats(response.data);
    } catch (error) {
      console.error('Failed to fetch device stats:', error);
    }
  };

  // Run all tests
  const runAllTests = async () => {
    if (!azureConnected) {
      toast.error('Azure not connected. Please check your configuration.');
      return;
    }

    setIsRunning(true);
    toast.loading('Running device security assessment...', { id: 'running-tests' });

    try {
      // Call the backend API to run all device tests
      const response = await api.post('/assessment/devices/run');
      const results = response.data.results;

      // Map results to our test IDs
      const newResults = new Map<string, TestResult>();
      results.forEach((result: any) => {
        const matchingTest = tests.find(t => 
          t.testId === result.testId || 
          t.title.toLowerCase().includes(result.name?.toLowerCase() || '')
        );
        
        if (matchingTest) {
          newResults.set(matchingTest.id, {
            testId: matchingTest.id,
            status: mapApiStatus(result.status),
            details: result.details,
            data: result.data,
            recommendation: result.recommendation,
            timestamp: result.timestamp,
          });
        }
      });

      setTestResults(newResults);
      setLastRefresh(new Date());
      toast.success(`Completed ${results.length} tests`, { id: 'running-tests' });
      
      // Refresh device stats
      fetchDeviceStats();
    } catch (error: any) {
      console.error('Error running tests:', error);
      toast.error(error.response?.data?.detail || 'Failed to run tests', { id: 'running-tests' });
    } finally {
      setIsRunning(false);
    }
  };

  // Run single test
  const runSingleTest = async (test: SecurityTest) => {
    if (!azureConnected) {
      toast.error('Azure not connected');
      return;
    }

    setRunningTestId(test.id);
    
    try {
      const response = await api.post(`/assessment/devices/run/${test.testId}`);
      const result = response.data;

      setTestResults(prev => {
        const newMap = new Map(prev);
        newMap.set(test.id, {
          testId: test.id,
          status: mapApiStatus(result.status),
          details: result.details,
          data: result.data,
          recommendation: result.recommendation,
          timestamp: result.timestamp,
        });
        return newMap;
      });

      toast.success(`Test "${test.title}" completed`);
    } catch (error: any) {
      toast.error(`Failed to run test: ${error.response?.data?.detail || error.message}`);
    } finally {
      setRunningTestId(null);
    }
  };

  // Map API status to our status
  const mapApiStatus = (status: string): TestResult['status'] => {
    switch (status?.toLowerCase()) {
      case 'pass': return 'Passed';
      case 'fail': return 'Failed';
      case 'warning': return 'Investigate';
      case 'error': return 'Skipped';
      default: return 'Skipped';
    }
  };

  // Toggle test expansion
  const toggleExpand = (testId: string) => {
    setExpandedTests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(testId)) {
        newSet.delete(testId);
      } else {
        newSet.add(testId);
      }
      return newSet;
    });
  };

  // Get remediation for a test
  const getRemediation = (test: SecurityTest) => {
    const result = testResults.get(test.id);
    if (result?.recommendation) return { text: result.recommendation, link: '', linkText: '' };
    
    const titleLower = test.title.toLowerCase();
    for (const [keyword, remediation] of Object.entries(deviceRemediationMap)) {
      if (titleLower.includes(keyword.toLowerCase())) {
        return remediation;
      }
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <span className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
              <FaLaptopMedical className="text-green-600 dark:text-green-400" />
            </span>
            Device Security Testing
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {tests.length} Zero Trust device controls • Connected to Microsoft Intune
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Azure Connection Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            azureConnected === null ? 'bg-gray-100 text-gray-600' :
            azureConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              azureConnected === null ? 'bg-gray-400' :
              azureConnected ? 'bg-green-500' : 'bg-red-500'
            }`} />
            {azureConnected === null ? 'Checking...' : azureConnected ? 'Intune Connected' : 'Intune Disconnected'}
          </div>

          <button
            onClick={runAllTests}
            disabled={isRunning || !azureConnected}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isRunning || !azureConnected
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {isRunning ? (
              <>
                <FaSpinner className="animate-spin" />
                Running...
              </>
            ) : (
              <>
                <FaPlay size={12} />
                Run All Tests
              </>
            )}
          </button>
        </div>
      </div>

      {/* Device Stats Overview */}
      {deviceStats && (
        <div className="grid grid-cols-7 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <FaDesktop className="text-gray-500" />
              <span className="text-sm text-gray-500">Total Devices</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{deviceStats.total}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-600">Compliant</p>
            <p className="text-2xl font-bold text-green-600">{deviceStats.compliant}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600">Non-Compliant</p>
            <p className="text-2xl font-bold text-red-600">{deviceStats.nonCompliant}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <FaWindows className="text-blue-500" />
              <span className="text-sm text-blue-600">Windows</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{deviceStats.windows}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <FaApple className="text-gray-500" />
              <span className="text-sm text-gray-600">macOS</span>
            </div>
            <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{deviceStats.mac}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <FaApple className="text-gray-500" />
              <span className="text-sm text-gray-600">iOS</span>
            </div>
            <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{deviceStats.ios}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <FaAndroid className="text-green-500" />
              <span className="text-sm text-gray-600">Android</span>
            </div>
            <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{deviceStats.android}</p>
          </div>
        </div>
      )}

      {/* Test Statistics */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Tests</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-green-200 dark:border-green-800">
          <p className="text-sm text-green-600">Passed</p>
          <p className="text-3xl font-bold text-green-600">{stats.passed}</p>
          <p className="text-xs text-gray-400">{Math.round(stats.passed / stats.total * 100)}%</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600">Failed</p>
          <p className="text-3xl font-bold text-red-600">{stats.failed}</p>
          <p className="text-xs text-gray-400">{Math.round(stats.failed / stats.total * 100)}%</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-600">Investigate</p>
          <p className="text-3xl font-bold text-amber-600">{stats.investigate}</p>
          <p className="text-xs text-gray-400">{Math.round(stats.investigate / stats.total * 100)}%</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500">Not Run</p>
          <p className="text-3xl font-bold text-gray-500">{stats.skipped}</p>
          <p className="text-xs text-gray-400">{Math.round(stats.skipped / stats.total * 100)}%</p>
        </div>
      </div>

      {/* Last Refresh */}
      {lastRefresh && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Last assessment: {lastRefresh.toLocaleString()}
        </p>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Search tests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Risk Filter */}
          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            <option value="">All Risk Levels</option>
            <option value="High">High Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="Low">Low Risk</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="Passed">Passed</option>
            <option value="Failed">Failed</option>
            <option value="Investigate">Investigate</option>
            <option value="Skipped">Not Run</option>
          </select>

          {/* Clear Filters */}
          {(searchTerm || selectedCategory || selectedRisk || selectedStatus) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('');
                setSelectedRisk('');
                setSelectedStatus('');
              }}
              className="text-sm text-green-600 hover:text-green-700"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results Info */}
      <p className="text-sm text-gray-500">
        Showing {filteredTests.length} of {tests.length} tests
      </p>

      {/* Tests Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr className="text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left w-12"></th>
              <th className="px-4 py-3 text-left">Test</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Risk</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">SFI Pillar</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredTests.map(test => {
              const result = testResults.get(test.id);
              const status = runningTestId === test.id ? 'Running' : (result?.status || test.status);
              const config = STATUS_CONFIG[status] || STATUS_CONFIG.Skipped;
              const isExpanded = expandedTests.has(test.id);
              const remediation = getRemediation(test);
              const StatusIcon = config.icon;

              return (
                <React.Fragment key={test.id}>
                  <tr 
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                    onClick={() => toggleExpand(test.id)}
                  >
                    <td className="px-4 py-3">
                      {isExpanded ? <FaChevronUp className="text-gray-400" /> : <FaChevronDown className="text-gray-400" />}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{test.title}</p>
                        <p className="text-xs text-gray-500">{test.testId}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{test.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${RISK_COLORS[test.risk]}`}>
                        {test.risk}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${config.color}`}>
                        <StatusIcon className={`${config.iconColor} ${status === 'Running' ? 'animate-spin' : ''}`} size={12} />
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{test.sfiPillar}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          runSingleTest(test);
                        }}
                        disabled={runningTestId === test.id || !azureConnected}
                        className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                      >
                        {runningTestId === test.id ? 'Running...' : 'Run'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50 dark:bg-gray-900/30">
                      <td colSpan={7} className="px-8 py-4">
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{test.description}</p>
                          </div>

                          {result?.details && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Test Result Details</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{result.details}</p>
                            </div>
                          )}

                          {result?.data && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Data</h4>
                              <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
                                {JSON.stringify(result.data, null, 2)}
                              </pre>
                            </div>
                          )}

                          {remediation && status === 'Failed' && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">Remediation</h4>
                              <p className="text-sm text-amber-700 dark:text-amber-300">{remediation.text}</p>
                              {remediation.link && (
                                <a 
                                  href={remediation.link} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-2 text-sm text-green-600 hover:text-green-700"
                                >
                                  <FaExternalLinkAlt size={10} />
                                  {remediation.linkText}
                                </a>
                              )}
                            </div>
                          )}

                          <div className="flex gap-4 text-xs text-gray-500">
                            <span>User Impact: {test.userImpact}</span>
                            <span>Implementation Cost: {test.implementationCost}</span>
                            <span>Tenant Types: {test.tenantType.join(', ')}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DevicesTestingPageLive;
