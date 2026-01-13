/**
 * Shared Zero Trust UI Components
 * 
 * Components for displaying controls, scores, status badges, license chips,
 * and the weight editor drawer.
 */

import React, { useState } from 'react';
import {
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaClock,
  FaShieldAlt,
  FaLock,
  FaExternalLinkAlt,
  FaTimes,
  FaUndo,
  FaHistory,
  FaArrowUp,
  FaArrowRight,
  FaArrowDown,
  FaBan,
} from 'react-icons/fa';
import {
  Control,
  ControlStatus,
  ControlResult,
  WeightConfig,
  Pillar,
  AuditEvent,
  LicenseKey,
  STATUS_DISPLAY_NAMES,
  STATUS_COLORS,
  PILLAR_COLORS,
  LICENSE_INFO,
} from '../types/zeroTrust';
import { useZeroTrustStore, selectIsAdmin } from '../store/zeroTrustStore';
import { getEffectiveWeight, isLicensed, getMissingLicenses } from '../lib/scoring';

// ============================================================================
// STATUS BADGE
// ============================================================================

interface StatusBadgeProps {
  status: ControlStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const colors = STATUS_COLORS[status];
  const displayName = STATUS_DISPLAY_NAMES[status];
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };
  
  const iconSize = size === 'lg' ? 14 : 12;
  
  const getIcon = () => {
    switch (status) {
      case ControlStatus.COMPLETED:
      case ControlStatus.ALTERNATE_MITIGATION:
      case ControlStatus.THIRD_PARTY:
        return <FaCheckCircle size={iconSize} className={colors.icon} />;
      case ControlStatus.TO_ADDRESS:
        return <FaTimesCircle size={iconSize} className={colors.icon} />;
      case ControlStatus.PLANNED:
        return <FaClock size={iconSize} className={colors.icon} />;
      case ControlStatus.RISK_ACCEPTED:
        return <FaExclamationTriangle size={iconSize} className={colors.icon} />;
      case ControlStatus.NOT_LICENSED:
        return <FaBan size={iconSize} className={colors.icon} />;
      default:
        return <FaShieldAlt size={iconSize} className={colors.icon} />;
    }
  };
  
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${colors.bg} ${colors.text} ${sizeClasses[size]}`}>
      {getIcon()}
      {displayName}
    </span>
  );
};

// ============================================================================
// LICENSE CHIPS
// ============================================================================

interface LicenseChipsProps {
  licenses: LicenseKey[];
  showPurchaseLink?: boolean;
  compact?: boolean;
}

export const LicenseChips: React.FC<LicenseChipsProps> = ({ 
  licenses, 
  showPurchaseLink = false,
  compact = false 
}) => {
  if (licenses.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-1.5">
      {licenses.map(license => {
        const info = LICENSE_INFO[license];
        return (
          <span
            key={license}
            className={`inline-flex items-center gap-1 ${
              compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
            } bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full`}
            title={info?.description}
          >
            <FaLock size={10} />
            {compact ? license : info?.displayName || license}
            {showPurchaseLink && info?.purchaseUrl && (
              <a
                href={info.purchaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-indigo-500 hover:text-indigo-600"
                onClick={(e) => e.stopPropagation()}
              >
                <FaExternalLinkAlt size={10} />
              </a>
            )}
          </span>
        );
      })}
    </div>
  );
};

// ============================================================================
// SCORE CARD
// ============================================================================

interface ScoreCardProps {
  title: string;
  score: number;
  max: number;
  percent: number;
  subtitle?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'warning';
}

export const ScoreCard: React.FC<ScoreCardProps> = ({
  title,
  score,
  max,
  percent,
  subtitle,
  variant = 'primary',
}) => {
  const variantClasses = {
    primary: 'border-indigo-200 dark:border-indigo-800',
    secondary: 'border-gray-200 dark:border-gray-700',
    success: 'border-green-200 dark:border-green-800',
    warning: 'border-amber-200 dark:border-amber-800',
  };
  
  const progressColors = {
    primary: 'bg-indigo-600',
    secondary: 'bg-gray-500',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
  };
  
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-5 border ${variantClasses[variant]}`}>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900 dark:text-white">{percent}%</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          ({score.toFixed(1)} / {max.toFixed(1)} pts)
        </span>
      </div>
      {subtitle && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>
      )}
      <div className="mt-3 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${progressColors[variant]} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// RISK INDICATOR
// ============================================================================

interface RiskIndicatorProps {
  risk: 'High' | 'Medium' | 'Low';
  showLabel?: boolean;
}

export const RiskIndicator: React.FC<RiskIndicatorProps> = ({ risk, showLabel = true }) => {
  const config = {
    High: { icon: FaArrowUp, color: 'text-red-500', label: 'High' },
    Medium: { icon: FaArrowRight, color: 'text-amber-500', label: 'Medium' },
    Low: { icon: FaArrowDown, color: 'text-green-500', label: 'Low' },
  };
  
  const { icon: Icon, color, label } = config[risk] || config.Medium;
  
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <Icon size={12} />
      {showLabel && <span className="text-xs font-medium">{label}</span>}
    </span>
  );
};

// ============================================================================
// WEIGHT EDITOR DRAWER
// ============================================================================

interface WeightEditorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pillarFilter?: Pillar;
}

export const WeightEditorDrawer: React.FC<WeightEditorDrawerProps> = ({
  isOpen,
  onClose,
  pillarFilter,
}) => {
  const {
    controls,
    weightConfig,
    tenantLicenses,
    updatePillarWeight,
    updateControlWeight,
    resetControlWeight,
    resetAllWeights,
    auditEvents,
  } = useZeroTrustStore();
  
  const isAdmin = useZeroTrustStore(selectIsAdmin);
  const [showAuditLog, setShowAuditLog] = useState(false);
  
  const filteredControls = pillarFilter
    ? controls.filter(c => c.pillar === pillarFilter)
    : controls;
  
  // Group controls by pillar
  const controlsByPillar = filteredControls.reduce((acc, control) => {
    if (!acc[control.pillar]) {
      acc[control.pillar] = [];
    }
    acc[control.pillar].push(control);
    return acc;
  }, {} as Record<Pillar, Control[]>);
  
  // Get recent weight changes
  const recentWeightChanges = auditEvents
    .filter(e => e.type === 'WEIGHT_CHANGED')
    .slice(0, 10);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50">
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Adjust Weights
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isAdmin ? 'Configure scoring weights for controls and pillars' : 'View scoring weights (read-only)'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAuditLog(!showAuditLog)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="View audit log"
            >
              <FaHistory size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <FaTimes size={20} />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {showAuditLog ? (
            <AuditLogPanel events={recentWeightChanges} />
          ) : (
            <>
              {/* Pillar Weights */}
              {!pillarFilter && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Pillar Weights
                    </h3>
                    <span className="text-xs text-gray-500">
                      Sum: {Object.values(weightConfig.pillarWeights).reduce((a, b) => a + b, 0)}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {Object.values(Pillar).map(pillar => (
                      <div key={pillar} className="flex items-center gap-4">
                        <div className="w-28 flex-shrink-0">
                          <span className={`px-2 py-1 text-xs rounded-full ${PILLAR_COLORS[pillar].bg} ${PILLAR_COLORS[pillar].text}`}>
                            {pillar}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={weightConfig.pillarWeights[pillar]}
                          onChange={(e) => updatePillarWeight(pillar, parseInt(e.target.value))}
                          disabled={!isAdmin}
                          className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                        />
                        <span className="w-12 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                          {weightConfig.pillarWeights[pillar]}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Control Weights */}
              {Object.entries(controlsByPillar).map(([pillar, pillarControls]) => (
                <div key={pillar} className="mb-8">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${PILLAR_COLORS[pillar as Pillar].bg} ${PILLAR_COLORS[pillar as Pillar].text}`}>
                      {pillar}
                    </span>
                    Controls
                  </h3>
                  <div className="space-y-3">
                    {pillarControls.map(control => {
                      const effectiveWeight = getEffectiveWeight(control, weightConfig);
                      const hasOverride = control.id in weightConfig.controlWeightOverrides;
                      const licensed = isLicensed(control, tenantLicenses);
                      
                      return (
                        <div
                          key={control.id}
                          className={`p-3 rounded-lg border ${
                            licensed
                              ? 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                              : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 opacity-60'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {control.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {control.id} • Default: {control.defaultWeight}%
                                {!licensed && ' • Not Licensed'}
                              </p>
                            </div>
                            {hasOverride && isAdmin && (
                              <button
                                onClick={() => resetControlWeight(control.id)}
                                className="p-1 text-gray-400 hover:text-indigo-600"
                                title="Reset to default"
                              >
                                <FaUndo size={12} />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={effectiveWeight}
                              onChange={(e) => updateControlWeight(control.id, parseInt(e.target.value))}
                              disabled={!isAdmin}
                              className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                            />
                            <span className={`w-12 text-right text-sm font-medium ${
                              hasOverride ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {effectiveWeight}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <button
            onClick={resetAllWeights}
            disabled={!isAdmin}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
          >
            Reset All to Defaults
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// AUDIT LOG PANEL
// ============================================================================

interface AuditLogPanelProps {
  events: AuditEvent[];
  maxHeight?: string;
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ 
  events,
  maxHeight = 'max-h-96' 
}) => {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <FaHistory size={32} className="mx-auto mb-3 opacity-50" />
        <p>No weight changes recorded yet</p>
      </div>
    );
  }
  
  return (
    <div className={`${maxHeight} overflow-y-auto`}>
      <div className="space-y-3">
        {events.map(event => (
          <div
            key={event.id}
            className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-900 dark:text-white">
                {event.details.controlId || event.details.pillar || 'Weight Config'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(event.at).toLocaleString()}
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-300">
              Changed from <span className="font-mono">{JSON.stringify(event.details.before)}</span> to{' '}
              <span className="font-mono">{JSON.stringify(event.details.after)}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">by {event.actor}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// CONTROL TABLE ROW
// ============================================================================

interface ControlTableRowProps {
  control: Control;
  result?: ControlResult;
  isLicensed: boolean;
  missingLicenses: LicenseKey[];
  effectiveWeight: number;
  onClick?: () => void;
}

export const ControlTableRow: React.FC<ControlTableRowProps> = ({
  control,
  result,
  isLicensed,
  missingLicenses,
  effectiveWeight,
  onClick,
}) => {
  const status = isLicensed 
    ? (result?.status || ControlStatus.TO_ADDRESS)
    : ControlStatus.NOT_LICENSED;
  
  return (
    <tr
      onClick={onClick}
      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${
        !isLicensed ? 'opacity-60' : ''
      }`}
    >
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {control.title}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {control.id}
          </p>
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={status} />
      </td>
      <td className="px-4 py-3">
        {control.risk && <RiskIndicator risk={control.risk} />}
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {effectiveWeight}%
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {control.maxPoints} pts
        </span>
      </td>
      <td className="px-4 py-3">
        {!isLicensed && missingLicenses.length > 0 && (
          <LicenseChips licenses={missingLicenses} compact showPurchaseLink />
        )}
        {isLicensed && result?.evidence && (
          <span className="text-xs text-gray-500">
            {result.evidence.length} evidence
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400">
        {result?.lastCheckedAt 
          ? new Date(result.lastCheckedAt).toLocaleDateString()
          : '-'
        }
      </td>
    </tr>
  );
};

// ============================================================================
// UPGRADE OPPORTUNITY BANNER
// ============================================================================

interface UpgradeOpportunityBannerProps {
  unavailableCount: number;
  upgradePoints: number;
  onViewDetails?: () => void;
}

export const UpgradeOpportunityBanner: React.FC<UpgradeOpportunityBannerProps> = ({
  unavailableCount,
  upgradePoints,
  onViewDetails,
}) => {
  if (unavailableCount === 0) return null;
  
  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
          <FaLock className="text-amber-600 dark:text-amber-400" size={20} />
        </div>
        <div>
          <p className="font-medium text-amber-800 dark:text-amber-200">
            {unavailableCount} tests unavailable due to licensing
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Upgrade to unlock {upgradePoints.toFixed(1)} additional points
          </p>
        </div>
      </div>
      {onViewDetails && (
        <button
          onClick={onViewDetails}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium"
        >
          View Details
        </button>
      )}
    </div>
  );
};
