// Devices Security Tests Data - Based on Microsoft Zero Trust Assessment
// Categories: Filters, Device Groups, MDM, MAM, RBAC, Compliance, macOS, Windows, W365

export interface DeviceTest {
  id: string;
  title: string;
  category: string;
  sfiPillar: string;
  risk: "High" | "Medium" | "Low";
  status: "Passed" | "Failed" | "Investigate" | "Skipped" | "Planned";
  description: string;
  testResult: string;
  userImpact: string;
  implementationCost: string;
}

// Part 1: Core Device Management Tests (40 tests)
export const devicesTestsPart1: DeviceTest[] = [
  {
    id: "RMD_001",
    title: "Device Filters Configured",
    category: "Filters",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Failed",
    description: "When you create a policy, you can use filters to assign a policy based on rules you create. A filter allows you to narrow the assignment scope of a policy. For example, use filters to target devices with a specific OS version or a specific manufacturer, target only personal devices or only organization-owned devices, and more. Filters improve flexibility and granularity when assigning Intune policies and apps.",
    testResult: "Found issues that need attention.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_002",
    title: "Device Groups Properly Configured",
    category: "Device Groups",
    sfiPillar: "Protect tenants and isolate production systems",
    risk: "Medium",
    status: "Passed",
    description: "Intune primarily uses Azure AD groups for grouping and targeting. These groups allow you to assign apps, policies, and other workloads to users and devices. Device groups allow precise targeting based on device properties (e.g., OS version, compliance status). Assigning policies to smaller device groups reduces synchronization overhead and speeds up deployments.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_003",
    title: "User Groups Properly Configured",
    category: "User Groups",
    sfiPillar: "Protect identities and secrets",
    risk: "Medium",
    status: "Passed",
    description: "User Groups in Microsoft Intune are collections of users that can be managed collectively. These groups simplify the administration of policies, applications, and updates across multiple users. By grouping users based on roles or departments, you can apply specific security policies tailored to their needs.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_004",
    title: "Compliance Policies Defined",
    category: "Compliance",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "High",
    status: "Failed",
    description: "Compliance policies in Intune define the rules and settings that users and devices must meet to be compliant. Without proper compliance policies, devices accessing corporate resources may not meet security requirements, potentially exposing sensitive data.",
    testResult: "Found issues that need attention.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "RMD_005",
    title: "Conditional Access for Devices",
    category: "Conditional Access",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "Conditional Access policies ensure that only compliant devices can access corporate resources. This is a key component of Zero Trust security, requiring device compliance verification before granting access.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "RMD_006",
    title: "Device Encryption Enforced",
    category: "Device Security",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    status: "Failed",
    description: "Device encryption protects data at rest by encrypting the entire device storage. Without encryption, lost or stolen devices can expose sensitive corporate data. BitLocker for Windows, FileVault for macOS, and native encryption for iOS/Android should be enforced.",
    testResult: "Found issues that need attention.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_007",
    title: "Antivirus and Threat Protection",
    category: "Device Security",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "High",
    status: "Passed",
    description: "Endpoint protection solutions like Microsoft Defender for Endpoint should be deployed and active on all managed devices. This provides real-time threat detection, automated investigation, and remediation capabilities.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "RMD_008",
    title: "OS Version Requirements",
    category: "Compliance",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Investigate",
    description: "Requiring minimum OS versions ensures devices have the latest security patches and features. Outdated operating systems may contain known vulnerabilities that can be exploited by attackers.",
    testResult: "Some items require investigation.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "RMD_009",
    title: "Jailbreak/Root Detection",
    category: "Device Security",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "High",
    status: "Passed",
    description: "Jailbroken or rooted devices bypass built-in security controls and can run unauthorized applications. These devices should be detected and blocked from accessing corporate resources to prevent security breaches.",
    testResult: "All checks passed for this control.",
    userImpact: "High",
    implementationCost: "Low"
  },
  {
    id: "RMD_010",
    title: "Multi-Admin Approval Configured",
    category: "RBAC",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Failed",
    description: "To help protect against a compromised administrative account, use Intune access policies to require that a second administrative account is used to approve a change before the change is applied. This capability is known as multiple administrative approval (MAA).",
    testResult: "Found issues that need attention.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "RMD_011",
    title: "Device Lock Requirements",
    category: "Device Security",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Passed",
    description: "Requiring device lock with PIN, password, or biometric authentication prevents unauthorized access to devices. This is a fundamental security control that should be enforced on all managed devices.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "RMD_012",
    title: "Remote Wipe Capability",
    category: "Device Management",
    sfiPillar: "Accelerate response and remediation",
    risk: "High",
    status: "Passed",
    description: "Remote wipe capability allows administrators to erase all data from lost or stolen devices. This prevents unauthorized access to corporate data when devices are compromised or lost.",
    testResult: "All checks passed for this control.",
    userImpact: "High",
    implementationCost: "Low"
  },
  {
    id: "RMD_013",
    title: "Device Inventory Maintained",
    category: "Device Management",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "Medium",
    status: "Passed",
    description: "Maintaining an accurate device inventory is essential for security management. Knowing which devices have access to corporate resources enables proper security controls and incident response.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_014",
    title: "Automatic Device Enrollment",
    category: "Device Management",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Investigate",
    description: "Automatic device enrollment streamlines the provisioning process and ensures all devices are properly managed from the start. This includes Windows Autopilot, Apple DEP, and Android Zero-touch enrollment.",
    testResult: "Some items require investigation.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "RMD_015",
    title: "Device Retirement Process",
    category: "Device Management",
    sfiPillar: "Accelerate response and remediation",
    risk: "Medium",
    status: "Passed",
    description: "Proper device retirement processes ensure corporate data is removed when devices are decommissioned. This prevents data leakage through improperly disposed devices.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_016",
    title: "Hardware Security Features",
    category: "Device Security",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    status: "Investigate",
    description: "Modern devices include hardware security features like TPM, Secure Boot, and secure enclaves. These features should be required and verified to ensure hardware-level security protections are active.",
    testResult: "Some items require investigation.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_017",
    title: "Firewall Configuration",
    category: "Device Security",
    sfiPillar: "Protect networks",
    risk: "High",
    status: "Passed",
    description: "Host-based firewalls provide network-level protection for devices. Windows Defender Firewall and equivalent solutions on other platforms should be configured and enforced through policy.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_018",
    title: "VPN Configuration",
    category: "Network Security",
    sfiPillar: "Protect networks",
    risk: "Medium",
    status: "Passed",
    description: "VPN configurations ensure secure connectivity to corporate resources. Always-on VPN or per-app VPN configurations should be deployed to protect data in transit.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "RMD_019",
    title: "Wi-Fi Security Profiles",
    category: "Network Security",
    sfiPillar: "Protect networks",
    risk: "Medium",
    status: "Investigate",
    description: "Secure Wi-Fi profiles ensure devices connect only to trusted networks with proper authentication and encryption. This prevents man-in-the-middle attacks on untrusted networks.",
    testResult: "Some items require investigation.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_020",
    title: "Certificate-Based Authentication",
    category: "Authentication",
    sfiPillar: "Protect identities and secrets",
    risk: "Medium",
    status: "Passed",
    description: "Certificate-based authentication provides stronger security than password-based methods. SCEP and PKCS certificates should be deployed for Wi-Fi, VPN, and email authentication.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "RMD_021",
    title: "Software Update Policies",
    category: "Patch Management",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    status: "Failed",
    description: "Timely software updates are critical for security. Update policies should be configured to deploy security patches promptly while minimizing user disruption.",
    testResult: "Found issues that need attention.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "RMD_022",
    title: "Windows Update Rings",
    category: "Patch Management",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Passed",
    description: "Windows Update rings provide controlled update deployment. Different rings for testing and production ensure updates are validated before broad deployment.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "RMD_023",
    title: "iOS/iPadOS Update Management",
    category: "Patch Management",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Passed",
    description: "Apple device updates should be managed to ensure timely security updates. Supervised devices allow enforcing update installation within specific timeframes.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "RMD_024",
    title: "Android Security Patches",
    category: "Patch Management",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Investigate",
    description: "Android security patch levels should be monitored and minimum requirements enforced. Devices with outdated security patches may contain known vulnerabilities.",
    testResult: "Some items require investigation.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "RMD_025",
    title: "Application Control Policies",
    category: "Application Management",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    status: "Failed",
    description: "Application control policies restrict which applications can run on managed devices. This prevents execution of unauthorized or malicious software.",
    testResult: "Found issues that need attention.",
    userImpact: "Medium",
    implementationCost: "High"
  },
  {
    id: "RMD_026",
    title: "App Store Restrictions",
    category: "Application Management",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Passed",
    description: "Restricting app installations to approved store applications reduces the risk of sideloaded malicious apps. This is especially important for mobile devices.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "RMD_027",
    title: "Required Apps Deployment",
    category: "Application Management",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Passed",
    description: "Required apps ensure all managed devices have necessary security and productivity applications. This includes Microsoft 365 apps, security agents, and line-of-business applications.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "RMD_028",
    title: "Blocked Apps List",
    category: "Application Management",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Passed",
    description: "Maintaining a blocked apps list prevents installation of known malicious or inappropriate applications. This helps enforce acceptable use policies.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "RMD_029",
    title: "Personal Device Restrictions",
    category: "BYOD",
    sfiPillar: "Protect tenants and isolate production systems",
    risk: "Medium",
    status: "Passed",
    description: "BYOD policies should appropriately restrict personal device access while respecting user privacy. Work profiles and app protection policies help separate corporate and personal data.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "RMD_030",
    title: "Corporate Device Configuration",
    category: "MDM",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    status: "Passed",
    description: "Corporate-owned devices should have comprehensive management policies. Full device management enables complete control over security settings, apps, and configurations.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "RMD_031",
    title: "Enrollment Restrictions",
    category: "MDM",
    sfiPillar: "Protect tenants and isolate production systems",
    risk: "High",
    status: "Passed",
    description: "Enrollment restrictions control which devices can enroll in Intune. This prevents unauthorized devices from accessing corporate resources and ensures only supported device types are managed.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "RMD_032",
    title: "Device Compliance Actions",
    category: "Compliance",
    sfiPillar: "Accelerate response and remediation",
    risk: "Medium",
    status: "Passed",
    description: "Compliance actions define what happens when devices become non-compliant. Actions can include notifications, marking devices non-compliant, or triggering conditional access policies.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "RMD_033",
    title: "Audit Logging Enabled",
    category: "Monitoring",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "Medium",
    status: "Passed",
    description: "Audit logging tracks administrative actions and device events. This is essential for security monitoring, compliance, and incident investigation.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_034",
    title: "Device Analytics",
    category: "Monitoring",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "Low",
    status: "Passed",
    description: "Endpoint analytics provides insights into device health, performance, and user experience. This helps identify issues proactively and improve device management.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "RMD_035",
    title: "Security Baselines Applied",
    category: "Device Security",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    status: "Failed",
    description: "Security baselines provide Microsoft-recommended security configurations. Applying baselines ensures devices meet industry security standards and best practices.",
    testResult: "Found issues that need attention.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "RMD_036",
    title: "Attack Surface Reduction",
    category: "Device Security",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    status: "Investigate",
    description: "Attack Surface Reduction rules in Microsoft Defender help prevent common attack techniques. These rules should be configured and monitored for effectiveness.",
    testResult: "Some items require investigation.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "RMD_037",
    title: "Endpoint Detection and Response",
    category: "Device Security",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "High",
    status: "Passed",
    description: "EDR capabilities provide advanced threat detection and response. Microsoft Defender for Endpoint should be deployed and actively monitored across all devices.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "High"
  },
  {
    id: "RMD_038",
    title: "Disk Encryption Recovery Keys",
    category: "Device Security",
    sfiPillar: "Accelerate response and remediation",
    risk: "Medium",
    status: "Passed",
    description: "Recovery keys for encrypted devices should be stored securely in Azure AD. This enables recovery of encrypted data when users forget passwords or devices need recovery.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "RMD_039",
    title: "Personal Data Restrictions",
    category: "Data Protection",
    sfiPillar: "Protect tenants and isolate production systems",
    risk: "Medium",
    status: "Passed",
    description: "Restrictions on personal data access ensure corporate policies respect user privacy while protecting company information. Clear boundaries between work and personal data should be enforced.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "RMD_040",
    title: "Data Loss Prevention",
    category: "Data Protection",
    sfiPillar: "Protect tenants and isolate production systems",
    risk: "High",
    status: "Failed",
    description: "DLP policies prevent sensitive data from being shared inappropriately. These policies should be applied to managed apps and devices to prevent data leakage.",
    testResult: "Found issues that need attention.",
    userImpact: "Medium",
    implementationCost: "High"
  }
];
