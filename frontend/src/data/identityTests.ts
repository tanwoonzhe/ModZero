// Auto-generated from zerotrustassessment PS1 files
// Total Identity tests: 134

export interface SecurityTest {
  id: string;
  testId: string;
  title: string;
  category: string;
  sfiPillar: string;
  risk: "High" | "Medium" | "Low";
  description: string;
  userImpact: string;
  implementationCost: string;
  status: "Passed" | "Failed" | "Investigate" | "Skipped" | "Planned";
  tenantType: string[];
  remediation?: string;
  docLink?: string;
}

// Remediation actions mapped by test title keywords
export const remediationMap: Record<string, { text: string; link: string; linkText: string }> = {
  "inactive applications": {
    text: "Review and remove inactive applications with privileged permissions. Use Microsoft Entra app governance to identify and remediate overprivileged or inactive apps.",
    link: "https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-application-permissions",
    linkText: "Manage application permissions"
  },
  "client secret": {
    text: "Migrate applications from client secrets to certificate-based authentication or managed identities where possible.",
    link: "https://learn.microsoft.com/en-us/entra/identity-platform/howto-create-service-principal-portal#option-1-recommended-create-and-upload-a-self-signed-certificate",
    linkText: "Configure certificate-based authentication"
  },
  "certificate": {
    text: "Review certificate validity periods and implement certificate rotation policies. Use short-lived certificates where possible.",
    link: "https://learn.microsoft.com/en-us/entra/identity-platform/certificate-credentials",
    linkText: "Certificate credentials configuration"
  },
  "conditional access": {
    text: "Create and configure Conditional Access policies to enforce access controls based on conditions like user, device, location, and risk.",
    link: "https://learn.microsoft.com/en-us/entra/identity/conditional-access/howto-conditional-access-policy-all-users-mfa",
    linkText: "Configure Conditional Access policies"
  },
  "mfa": {
    text: "Enable multi-factor authentication for all users. Consider using phishing-resistant MFA methods like FIDO2 security keys or Windows Hello for Business.",
    link: "https://learn.microsoft.com/en-us/entra/identity/authentication/howto-mfa-getstarted",
    linkText: "Enable MFA in your organization"
  },
  "phishing-resistant": {
    text: "Deploy phishing-resistant authentication methods such as FIDO2 security keys, Windows Hello for Business, or certificate-based authentication.",
    link: "https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-strengths",
    linkText: "Configure authentication strengths"
  },
  "privileged": {
    text: "Implement Privileged Identity Management (PIM) for just-in-time access to privileged roles. Review and minimize permanent privileged role assignments.",
    link: "https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-configure",
    linkText: "Configure Privileged Identity Management"
  },
  "pim": {
    text: "Enable Microsoft Entra Privileged Identity Management to provide just-in-time privileged access to Azure AD and Azure resources.",
    link: "https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-configure",
    linkText: "Configure Privileged Identity Management"
  },
  "laps": {
    text: "Deploy Windows Local Administrator Password Solution (LAPS) to automatically manage and rotate local administrator passwords on Azure AD joined devices.",
    link: "https://learn.microsoft.com/en-us/windows-server/identity/laps/laps-overview",
    linkText: "Configure Windows Local Administrator Password Solution"
  },
  "password": {
    text: "Implement strong password policies and consider moving to passwordless authentication methods.",
    link: "https://learn.microsoft.com/en-us/entra/identity/authentication/howto-authentication-passwordless-deployment",
    linkText: "Deploy passwordless authentication"
  },
  "legacy authentication": {
    text: "Block legacy authentication protocols that don't support modern security features like MFA.",
    link: "https://learn.microsoft.com/en-us/entra/identity/conditional-access/block-legacy-authentication",
    linkText: "Block legacy authentication"
  },
  "guest": {
    text: "Review and configure guest user access settings. Implement guest access reviews and limit guest permissions.",
    link: "https://learn.microsoft.com/en-us/entra/external-id/what-is-b2b",
    linkText: "Configure B2B guest access"
  },
  "access review": {
    text: "Configure access reviews to regularly verify that users still need their access to groups, applications, and roles.",
    link: "https://learn.microsoft.com/en-us/entra/id-governance/access-reviews-overview",
    linkText: "Configure access reviews"
  },
  "entitlement": {
    text: "Use entitlement management to automate access request workflows, access assignments, reviews, and expiration.",
    link: "https://learn.microsoft.com/en-us/entra/id-governance/entitlement-management-overview",
    linkText: "Configure entitlement management"
  },
  "token": {
    text: "Configure token protection policies to bind tokens to specific devices and reduce token theft risks.",
    link: "https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-token-protection",
    linkText: "Configure token protection"
  },
  "bitlocker": {
    text: "Enable BitLocker encryption on all Windows devices and configure recovery key backup to Azure AD.",
    link: "https://learn.microsoft.com/en-us/mem/intune/protect/encrypt-devices",
    linkText: "Configure BitLocker with Intune"
  },
  "risk": {
    text: "Configure risk-based Conditional Access policies to respond to sign-in and user risk detections.",
    link: "https://learn.microsoft.com/en-us/entra/id-protection/howto-identity-protection-configure-risk-policies",
    linkText: "Configure risk-based policies"
  },
  "sspr": {
    text: "Configure self-service password reset with appropriate authentication methods and security requirements.",
    link: "https://learn.microsoft.com/en-us/entra/identity/authentication/howto-sspr-deployment",
    linkText: "Deploy self-service password reset"
  },
  "device code": {
    text: "Restrict device code flow authentication to prevent phishing attacks that exploit this authentication method.",
    link: "https://learn.microsoft.com/en-us/entra/identity/conditional-access/how-to-policy-authentication-flows",
    linkText: "Restrict authentication flows"
  },
  "consent": {
    text: "Configure user consent settings to prevent users from granting permissions to malicious applications.",
    link: "https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent",
    linkText: "Configure user consent settings"
  },
  "cross-tenant": {
    text: "Configure cross-tenant access settings to control how users collaborate with other Azure AD organizations.",
    link: "https://learn.microsoft.com/en-us/entra/external-id/cross-tenant-access-overview",
    linkText: "Configure cross-tenant access"
  },
  "seamless sso": {
    text: "Review Seamless SSO usage and disable if not actively used to reduce attack surface.",
    link: "https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-sso",
    linkText: "Configure Seamless SSO"
  },
  "authentication transfer": {
    text: "Block authentication transfer to prevent attackers from transferring authenticated sessions to other devices.",
    link: "https://learn.microsoft.com/en-us/entra/identity/conditional-access/how-to-policy-authentication-flows",
    linkText: "Configure authentication transfer blocking"
  },
  "security key": {
    text: "Enable FIDO2 security key authentication for phishing-resistant passwordless authentication.",
    link: "https://learn.microsoft.com/en-us/entra/identity/authentication/howto-authentication-passwordless-security-key",
    linkText: "Enable FIDO2 security keys"
  },
  "cloud authentication": {
    text: "Use cloud authentication (Password Hash Sync or Pass-through Authentication) instead of federation for better security and resilience.",
    link: "https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/choose-ad-authn",
    linkText: "Choose authentication method"
  },
  "administrator": {
    text: "Secure administrator accounts with strong authentication, dedicated accounts, and privileged access workstations.",
    link: "https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/security-planning",
    linkText: "Secure privileged access"
  },
  "default": {
    text: "Review the test results and follow Microsoft Entra best practices for identity security.",
    link: "https://learn.microsoft.com/en-us/entra/fundamentals/",
    linkText: "View Entra documentation"
  }
};

// Get remediation for a test based on title
export function getRemediation(title: string): { text: string; link: string; linkText: string } {
  const lowerTitle = title.toLowerCase();
  for (const [keyword, remediation] of Object.entries(remediationMap)) {
    if (keyword !== "default" && lowerTitle.includes(keyword)) {
      return remediation;
    }
  }
  return remediationMap.default;
}

// License requirement mapping based on test categories and features
// Tests requiring specific licenses to be achievable
export type LicenseKey = 
  | "ENTRA_P1"        
  | "ENTRA_P2"        
  | "INTUNE_P1"       
  | "MDE_P1"          
  | "MDE_P2"          
  | "ENTRA_GOVERNANCE" 
  | "ENTRA_WORKLOAD_ID"
  | "M365_E3"         
  | "M365_E5"         
  | "DEFENDER_CLOUD";

// Map test features to required licenses
export const testLicenseMapping: Record<string, LicenseKey[]> = {
  // Conditional Access features require Entra P1 or higher
  "conditional access": ["ENTRA_P1"],
  "device compliance": ["ENTRA_P1", "INTUNE_P1"],
  "sign-in risk": ["ENTRA_P2"],
  "user risk": ["ENTRA_P2"],
  "identity protection": ["ENTRA_P2"],
  "risk-based": ["ENTRA_P2"],
  
  // PIM and Governance
  "privileged identity management": ["ENTRA_P2"],
  "pim": ["ENTRA_P2"],
  "access review": ["ENTRA_GOVERNANCE"],
  "entitlement management": ["ENTRA_GOVERNANCE"],
  "lifecycle workflow": ["ENTRA_GOVERNANCE"],
  
  // Workload identities
  "workload identity": ["ENTRA_WORKLOAD_ID"],
  "service principal": ["ENTRA_P1"],
  
  // Device management
  "intune": ["INTUNE_P1"],
  "mdm": ["INTUNE_P1"],
  "device configuration": ["INTUNE_P1"],
  "app protection": ["INTUNE_P1"],
  
  // Defender
  "defender for endpoint": ["MDE_P1"],
  "microsoft defender": ["MDE_P1"],
  "threat detection": ["MDE_P2"],
};

// Determine required licenses for a test based on its title and category
export function getTestLicenseRequirements(test: SecurityTest): LicenseKey[] {
  const searchText = `${test.title.toLowerCase()} ${test.category.toLowerCase()}`;
  const requiredLicenses = new Set<LicenseKey>();
  
  for (const [keyword, licenses] of Object.entries(testLicenseMapping)) {
    if (searchText.includes(keyword)) {
      licenses.forEach(lic => requiredLicenses.add(lic));
    }
  }
  
  // Return empty array if no specific licenses required (available to all)
  return Array.from(requiredLicenses);
}

// Check if a test is achievable with given tenant licenses
export function isTestAchievable(test: SecurityTest, tenantLicenses: Record<LicenseKey, boolean>): boolean {
  const required = getTestLicenseRequirements(test);
  
  // If no licenses required, test is achievable
  if (required.length === 0) return true;
  
  // Check if at least one required license is enabled
  return required.some(lic => tenantLicenses[lic] === true);
}

export const identityTests: SecurityTest[] = [
  {
    "id": "ZTA-21770",
    "testId": "21770",
    "title": "Inactive applications don’’t have highly privileged Microsoft Graph API permissions",
    "category": "Access control",
    "sfiPillar": "Protect engineering systems",
    "risk": "Medium",
    "description": "Attackers might exploit valid but inactive applications that still have elevated privileges. These applications can be used to gain initial access without raising alarm because they’re legitimate applications. From there, attackers can use the application privileges to plan or execute other attacks. Attackers might also maintain access by manipulating the inactive application, such as by adding credentials. This persistence ensures that even if their primary access method is detected, they can r",
    "userImpact": "High",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21771",
    "testId": "21771",
    "title": "Inactive applications don’’t have highly privileged built-in roles",
    "category": "Application management",
    "sfiPillar": "Protect engineering systems",
    "risk": "High",
    "description": "Attackers might exploit valid but inactive applications that still have elevated privileges. These applications can be used to gain initial access without raising alarm because they're legitimate applications. From there, attackers can use the application privileges to plan or execute other attacks. Attackers might also maintain access by manipulating the inactive application, such as by adding credentials. This persistence ensures that even if their primary access method is detected, they can r",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21772",
    "testId": "21772",
    "title": "Applications don",
    "category": "Application management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Applications that use client secrets might store them in configuration files, hardcode them in scripts, or risk their exposure in other ways. The complexities of secret management make client secrets susceptible to leaks and attractive to attackers. Client secrets, when exposed, provide attackers with the ability to blend their activities with legitimate operations, making it easier to bypass security controls. If an attacker compromises an application's client secret, they can escalate their pr",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21773",
    "testId": "21773",
    "title": "Applications don",
    "category": "Application management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Certificates, if not securely stored, can be extracted and exploited by attackers, leading to unauthorized access. Long-lived certificates are more likely to be exposed over time. Credentials, when exposed, provide attackers with the ability to blend their activities with legitimate operations, making it easier to bypass security controls. If an attacker compromises an application's certificate, they can escalate their privileges within the system, leading to broader access and control, dependin",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21774",
    "testId": "21774",
    "title": "Microsoft services applications don",
    "category": "Application management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Microsoft services applications that operate in your tenant are identified as service principals with the owner organization ID \"f8cdef31-a31e-4b4a-93e4-5f571e91255a.\" When these service principals have credentials configured in your tenant, they might create potential attack vectors that threat actors can exploit. If an administrator added the credentials and they're no longer needed, they can become a target for attackers. Although less likely when proper preventive and detective controls are ",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21775",
    "testId": "21775",
    "title": "Enforce standards for app secrets and certificates",
    "category": "Application management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Without proper application management policies, threat actors can exploit weak or misconfigured application credentials to get unauthorized access to organizational resources. Applications using long-lived password secrets or certificates create extended attack windows where compromised credentials stay valid for extended periods. If an application uses client secrets that are hardcoded in configuration files or have weak password requirements, threat actors can extract these credentials through",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21776",
    "testId": "21776",
    "title": "User consent settings are restricted",
    "category": "Application management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Without restricted user consent settings, threat actors can exploit permissive application consent configurations to gain unauthorized access to sensitive organizational data. When user consent is unrestricted, attackers can: - Use social engineering and illicit consent grant attacks to trick users into approving malicious applications. - Impersonate legitimate services to request broad permissions, such as access to email, files, calendars, and other critical business data. - Obtain legitimate ",
    "userImpact": "High",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21777",
    "testId": "21777",
    "title": "App instance property lock is configured for all multitenant applications",
    "category": "Access control",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "High",
    "description": "App instance property lock prevents changes to sensitive properties of a multitenant application after the application is provisioned in another tenant. Without a lock, critical properties such as application credentials can be maliciously or unintentionally modified, causing disruptions, increased risk, unauthorized access, or privilege escalations.",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21780",
    "testId": "21780",
    "title": "No usage of ADAL in the tenant",
    "category": "Application management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Microsoft ended support and security fixes for ADAL on June 30, 2023. Continued ADAL usage bypasses modern security protections available only in MSAL, including Conditional Access enforcement, Continuous Access Evaluation (CAE), and advanced token protection. ADAL applications create security vulnerabilities by using weaker legacy authentication patterns, often calling deprecated Azure AD Graph endpoints, and preventing adoption of hardened authentication flows that could mitigate future securi",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21781",
    "testId": "21781",
    "title": "Privileged users sign in with phishing-resistant methods",
    "category": "Privileged access",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "High",
    "description": "Without phishing-resistant authentication methods, privileged users are more vulnerable to phishing attacks. These types of attacks trick users into revealing their credentials to grant unauthorized access to attackers. If non-phishing-resistant authentication methods are used, attackers might intercept credentials and tokens, through methods like adversary-in-the-middle attacks, undermining the security of the privileged account. Once a privileged account or session is compromised due to weak a",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21782",
    "testId": "21782",
    "title": "Privileged accounts have phishing-resistant methods registered",
    "category": "Privileged access",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Without phishing-resistant authentication methods, privileged users are more vulnerable to phishing attacks. These types of attacks trick users into revealing their credentials to grant unauthorized access to attackers. If non-phishing-resistant authentication methods are used, attackers might intercept credentials and tokens, through methods like adversary-in-the-middle attacks, undermining the security of the privileged account. Once a privileged account or session is compromised due to weak a",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21783",
    "testId": "21783",
    "title": "Privileged Microsoft Entra built-in roles are targeted with Conditional Access policies to enforce phishing-resistant methods",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Without phishing-resistant authentication methods, privileged users are more vulnerable to phishing attacks. These types of attacks trick users into revealing their credentials to grant unauthorized access to attackers. If non-phishing-resistant authentication methods are used, attackers might intercept credentials and tokens, through methods like adversary-in-the-middle attacks, undermining the security of the privileged account. Once a privileged account or session is compromised due to weak a",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21784",
    "testId": "21784",
    "title": "All user sign in activity uses phishing-resistant authentication methods",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "## Description Verifies that all user sign-ins are protected by Conditional Access policies requiring phishing-resistant authentication methods (Windows Hello for Business, FIDO2 security keys, or certificate-based authentication).",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21786",
    "testId": "21786",
    "title": "User sign-in activity uses token protection",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "A threat actor can intercept or extract authentication tokens from memory, local storage on a legitimate device, or by inspecting network traffic. The attacker might replay those tokens to bypass authentication controls on users and devices, get unauthorized access to sensitive data, or run further attacks. Because these tokens are valid and time bound, traditional anomaly detection often fails to flag the activity, which might allow sustained access until the token expires or is revoked. Token ",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21787",
    "testId": "21787",
    "title": "Permissions to create new tenants are limited to the Tenant Creator role",
    "category": "Privileged access",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "High",
    "description": "A threat actor or a well-intentioned but uninformed employee can create a new Microsoft Entra tenant if there are no restrictions in place. By default, the user who creates a tenant is automatically assigned the Global Administrator role. Without proper controls, this action fractures the identity perimeter by creating a tenant outside the organization's governance and visibility. It introduces risk though a shadow identity platform that can be exploited for token issuance, brand impersonation, ",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Skipped",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21788",
    "testId": "21788",
    "title": "Global Administrators don",
    "category": "Privileged access",
    "sfiPillar": "Protect engineering systems",
    "risk": "High",
    "description": "Global Administrators with persistent access to Azure subscriptions expand the attack surface for threat actors. If a Global Administrator account is compromised, attackers can immediately enumerate resources, modify configurations, assign roles, and exfiltrate sensitive data across all subscriptions. Requiring just-in-time elevation for subscription access introduces detectable signals, slows attacker velocity, and routes high-impact operations through observable control points.",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21790",
    "testId": "21790",
    "title": "Outbound cross-tenant access settings are configured",
    "category": "Application management",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "High",
    "description": "Allowing unrestricted external collaboration with unverified organizations can increase the risk surface area of the tenant because it allows guest accounts that might not have proper security controls. Threat actors can attempt to gain access by compromising identities in these loosely governed external tenants. Once granted guest access, they can then use legitimate collaboration pathways to infiltrate resources in your tenant and attempt to gain sensitive information. Threat actors can also e",
    "userImpact": "Medium",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21791",
    "testId": "21791",
    "title": "Guests can’’t invite other guests",
    "category": "External collaboration",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "External user accounts are often used to provide access to business partners who belong to organizations that have a business relationship with your enterprise. If these accounts are compromised in their organization, attackers can use the valid credentials to gain initial access to your environment, often bypassing traditional defenses due to their legitimacy. Allowing external users to onboard other external users increases the risk of unauthorized access. If an attacker compromises an externa",
    "userImpact": "Medium",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21792",
    "testId": "21792",
    "title": "Guests have restricted access to directory objects",
    "category": "External collaboration",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "External user accounts are often used to provide access to business partners who belong to organizations that have a business relationship with your enterprise. If these accounts are compromised in their organization, attackers can use the valid credentials to gain initial access to your environment, often bypassing traditional defenses due to their legitimacy. External accounts with permissions to read directory object permissions provide attackers with broader initial access if compromised. Th",
    "userImpact": "Medium",
    "implementationCost": "Low",
    "status": "Investigate",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21793",
    "testId": "21793",
    "title": "Tenant restrictions v2 policy is configured",
    "category": "Application management",
    "sfiPillar": "Protect networks",
    "risk": "High",
    "description": "Tenant Restrictions v2 (TRv2) allows organizations to enforce policies that restrict access to specified Microsoft Entra tenants, preventing unauthorized exfiltration of corporate data to external tenants using local accounts. Without TRv2, threat actors can exploit this vulnerability, which leads to potential data exfiltration and compliance violations, followed by credential harvesting if those external tenants have weaker controls. Once credentials are obtained, threat actors can gain initial",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21795",
    "testId": "21795",
    "title": "No legacy authentication sign-in activity",
    "category": "Monitoring",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "Medium",
    "description": "Legacy authentication protocols such as basic authentication for SMTP and IMAP don't support modern security features like multifactor authentication (MFA), which is crucial for protecting against unauthorized access. This lack of protection makes accounts using these protocols vulnerable to password-based attacks, and provides attackers with a means to gain initial access using stolen or guessed credentials. When an attacker successfully gains unauthorized access to credentials, they can use th",
    "userImpact": "High",
    "implementationCost": "Low",
    "status": "Investigate",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21796",
    "testId": "21796",
    "title": "Block legacy authentication policy is configured",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Legacy authentication protocols such as basic authentication for SMTP and IMAP don't support modern security features like multifactor authentication (MFA), which is crucial for protecting against unauthorized access. This lack of protection makes accounts using these protocols vulnerable to password-based attacks, and provides attackers with a means to gain initial access using stolen or guessed credentials. When an attacker successfully gains unauthorized access to credentials, they can use th",
    "userImpact": "High",
    "implementationCost": "Low",
    "status": "Investigate",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21797",
    "testId": "21797",
    "title": "Restrict access to high risk users",
    "category": "Access control",
    "sfiPillar": "Accelerate response and remediation",
    "risk": "High",
    "description": "Assume high risk users are compromised by threat actors. Without investigation and remediation, threat actors can execute scripts, deploy malicious applications, or manipulate API calls to establish persistence, based on the potentially compromised user's permissions. Threat actors can then exploit misconfigurations or abuse OAuth tokens to move laterally across workloads like documents, SaaS applications, or Azure resources. Threat actors can gain access to sensitive files, customer records, or",
    "userImpact": "High",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21798",
    "testId": "21798",
    "title": "ID Protection notifications are enabled",
    "category": "Access control",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "High",
    "description": "If you don't enable ID Protection notifications, your organization loses critical real-time alerts when threat actors compromise user accounts or conduct reconnaissance activities. When Microsoft Entra ID Protection detects accounts at risk, it sends email alerts with **Users at risk detected** as the subject and links to the **Users flagged for risk** report. Without these notifications, security teams remain unaware of active threats, allowing threat actors to maintain persistence in compromis",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21799",
    "testId": "21799",
    "title": "Restrict high risk sign-ins",
    "category": "Access control",
    "sfiPillar": "Accelerate response and remediation",
    "risk": "High",
    "description": "When high-risk sign-ins are not properly restricted through Conditional Access policies, organizations expose themselves to security vulnerabilities. Threat actors can exploit these gaps for initial access through compromised credentials, credential stuffing attacks, or anomalous sign-in patterns that Microsoft Entra ID Protection identifies as risky behaviors. Without appropriate restrictions, threat actors who successfully authenticate during high-risk scenarios can perform privilege escalatio",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21800",
    "testId": "21800",
    "title": "All user sign-in activity uses strong authentication methods",
    "category": "Monitoring",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "Medium",
    "description": "Attackers might gain access if multifactor authentication (MFA) isn't universally enforced or if there are exceptions in place. Attackers might gain access by exploiting vulnerabilities of weaker MFA methods like SMS and phone calls through social engineering techniques. These techniques might include SIM swapping or phishing, to intercept authentication codes. Attackers might use these accounts as entry points into the tenant. By using intercepted user sessions, attackers can disguise their act",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21801",
    "testId": "21801",
    "title": "Users have strong authentication methods configured",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Attackers might gain access if multifactor authentication (MFA) isn't universally enforced or if there are exceptions in place. Attackers might gain access by exploiting vulnerabilities of weaker MFA methods like SMS and phone calls through social engineering techniques. These techniques might include SIM swapping or phishing, to intercept authentication codes. Attackers might use these accounts as entry points into the tenant. By using intercepted user sessions, attackers can disguise their act",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21802",
    "testId": "21802",
    "title": "Microsoft Authenticator app shows sign-in context",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Without sign-in context, threat actors can exploit authentication fatigue by flooding users with push notifications, increasing the chance that a user accidentally approves a malicious request. When users get generic push notifications without the application name or geographic location, they don't have the information they need to make informed approval decisions. This lack of context makes users vulnerable to social engineering attacks, especially when threat actors time their requests during ",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21803",
    "testId": "21803",
    "title": "Migrate from legacy MFA and SSPR policies",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Legacy multifactor authentication (MFA) and self-service password reset (SSPR) policies in Microsoft Entra ID manage authentication methods separately, leading to fragmented configurations and suboptimal user experience. Moreover, managing these policies independently increases administrative overhead and the risk of misconfiguration. Migrating to the combined Authentication Methods policy consolidates the management of MFA, SSPR, and passwordless authentication methods into a single policy fram",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21804",
    "testId": "21804",
    "title": "SMS and Voice Call authentication methods are disabled",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "When weak authentication methods like SMS and voice calls remain enabled in Microsoft Entra ID, threat actors can exploit these vulnerabilities through multiple attack vectors. Initially, attackers often conduct reconnaissance to identify organizations using these weaker authentication methods through social engineering or technical scanning. Then they can execute initial access through credential stuffing attacks, password spraying, or phishing campaigns targeting user credentials. Once basic c",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21806",
    "testId": "21806",
    "title": "Secure the MFA registration (My Security Info) page",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Without Conditional Access policies protecting security information registration, threat actors can exploit unprotected registration flows to compromise authentication methods. When users register multifactor authentication and self-service password reset methods without proper controls, threat actors can intercept these registration sessions through adversary-in-the-middle attacks or exploit unmanaged devices accessing registration from untrusted locations. Once threat actors gain access to an ",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21807",
    "testId": "21807",
    "title": "Creating new applications and service principals is restricted to privileged users",
    "category": "Application management",
    "sfiPillar": "Protect engineering systems",
    "risk": "Medium",
    "description": "If nonprivileged users can create applications and service principals, these accounts might be misconfigured or be granted more permissions than necessary, creating new vectors for attackers to gain initial access. Attackers can exploit these accounts to establish valid credentials in the environment and bypass some security controls. If these nonprivileged accounts are mistakenly granted elevated application owner permissions, attackers can use them to move from a lower level of access to a mor",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21808",
    "testId": "21808",
    "title": "Restrict device code flow",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Device code flow is a cross-device authentication flow designed for input-constrained devices. It can be exploited in phishing attacks, where an attacker initiates the flow and tricks a user into completing it on their device, thereby sending the user's tokens to the attacker. Given the security risks and the infrequent legitimate use of device code flow, you should enable a Conditional Access policy to block this flow by default.",
    "userImpact": "Medium",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21809",
    "testId": "21809",
    "title": "Admin consent workflow is enabled",
    "category": "Application management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Enabling the Admin consent workflow in a Microsoft Entra tenant is a vital security measure that mitigates risks associated with unauthorized application access and privilege escalation. This check is important because it ensures that any application requesting elevated permission undergoes a review process by designated administrators before consent is granted. The admin consent workflow in Microsoft Entra ID notifies reviewers who evaluate and approve or deny consent requests based on the appl",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21810",
    "testId": "21810",
    "title": "Resource-specific consent is restricted",
    "category": "Access control",
    "sfiPillar": "Protect engineering systems",
    "risk": "Medium",
    "description": "Letting group owners consent to applications in Microsoft Entra ID creates a lateral escalation path that lets threat actors persist and steal data without admin credentials. If an attacker compromises a group owner account, they can register or use a malicious application and consent to high-privilege Graph API permissions scoped to the group. Attackers can potentially read all Teams messages, access SharePoint files, or manage group membership. This consent action creates a long-lived applicat",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21811",
    "testId": "21811",
    "title": "Password expiration is disabled",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "When password expiration policies remain enabled, threat actors can exploit the predictable password rotation patterns that users typically follow when forced to change passwords regularly. Users frequently create weaker passwords by making minimal modifications to existing ones, such as incrementing numbers or adding sequential characters. Threat actors can easily anticipate and exploit these types of changes through credential stuffing attacks or targeted password spraying campaigns. These pre",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21812",
    "testId": "21812",
    "title": "Maximum number of Global Administrators doesn",
    "category": "Privileged access",
    "sfiPillar": "Protect engineering systems",
    "risk": "Low",
    "description": "An excessive number of Global Administrator accounts creates an expanded attack surface that threat actors can exploit through various initial access vectors. Each extra privileged account represents a potential entry point for threat actors. An excess of Global Administrator accounts undermines the principle of least privilege. Microsoft recommends that organizations have no more than eight Global Administrators.",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21813",
    "testId": "21813",
    "title": "High Global Administrator to privileged user ratio",
    "category": "Privileged access",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "When organizations maintain a disproportionately high ratio of Global Administrators relative to their total privileged user population, they expose themselves to significant security risks that threat actors might exploit through various attack vectors. Excessive Global Administrator assignments create multiple high-value targets for threat actors who might leverage initial access through credential compromise, phishing attacks, or insider threats to gain unrestricted access to the entire Micro",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Investigate",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21814",
    "testId": "21814",
    "title": "Privileged accounts are cloud native identities",
    "category": "Privileged access",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "If an on-premises account is compromised and is synchronized to Microsoft Entra, the attacker might gain access to the tenant as well. This risk increases because on-premises environments typically have more attack surfaces due to older infrastructure and limited security controls. Attackers might also target the infrastructure and tools used to enable connectivity between on-premises environments and Microsoft Entra. These targets might include tools like Microsoft Entra Connect or Active Direc",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21815",
    "testId": "21815",
    "title": "All privileged role assignments are activated just in time and not permanently active",
    "category": "Privileged access",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Threat actors target privileged accounts because they have access to the data and resources they want. This might include more access to your Microsoft Entra tenant, data in Microsoft SharePoint, or the ability to establish long-term persistence. Without a just-in-time (JIT) activation model, administrative privileges remain continuously exposed, providing attackers with an extended window to operate undetected. Just-in-time access mitigates risk by enforcing time-limited privilege activation wi",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Investigate",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21816",
    "testId": "21816",
    "title": "All Microsoft Entra privileged role assignments are managed with PIM",
    "category": "Identity",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Threat actors who compromise a permanently assigned privileged account (e.g., Global Administrator or Privileged Role Administrator) gain continuous, uninterrupted access to high-impact directory operations. This extended dwell time enables attackers to more easily establish persistent backdoors, delete critical data and security configurations, disable monitoring systems, and register malicious applications for data exfiltration and lateral movement. These actions can result in full organizatio",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Skipped",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21817",
    "testId": "21817",
    "title": "Global Administrator role activation triggers an approval workflow",
    "category": "Application management",
    "sfiPillar": "Protect engineering systems",
    "risk": "High",
    "description": "Without approval workflows, threat actors who compromise Global Administrator credentials through phishing, credential stuffing, or other authentication bypass techniques can immediately activate the most privileged role in a tenant without any other verification or oversight. Privileged Identity Management (PIM) allows eligible role activations to become active within seconds, so compromised credentials can allow near-instant privilege escalation. Once activated, threat actors can use the Globa",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21818",
    "testId": "21818",
    "title": "Privileged role activations have monitoring and alerting configured",
    "category": "Monitoring",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "High",
    "description": "Organizations without proper activation alerts for highly privileged roles lack visibility into when users access these critical permissions. Threat actors can exploit this monitoring gap to perform privilege escalation by activating highly privileged roles without detection, then establish persistence through admin account creation or security policy modifications. The absence of real-time alerts enables attackers to conduct lateral movement, modify audit configurations, and disable security co",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21819",
    "testId": "21819",
    "title": "Activation alert for Global Administrator role assignment",
    "category": "Privileged access",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Low",
    "description": "Without activation alerts for Global Administrator role assignments, threat actors can perform role activation without detection, allowing them to establish persistence in the environment. When Global Administrator roles are activated without notification mechanisms, threat actors who have compromised accounts can escalate privileges, bypassing security monitoring. The absence of alerts creates a blind spot where threat actors can activate the most privileged role in the tenant and perform actio",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21820",
    "testId": "21820",
    "title": "Activation alert for all privileged role assignments",
    "category": "Privileged access",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Low",
    "description": "Without activation alerts for privileged role assignments, threat actors who compromise user credentials through phishing, password attacks, or credential stuffing can activate privileged roles without detection. When privileged roles are activated without notification mechanisms, security teams lack visibility into when elevated permissions are being used, allowing threat actors to operate within the environment undetected during the initial access phase. During the persistence phase, threat ac",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21821",
    "testId": "21821",
    "title": "Guest access is restricted",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Investigate",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21822",
    "testId": "21822",
    "title": "Guest access is limited to approved tenants",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Without limiting guest access to approved tenants, threat actors can exploit unrestricted guest access to establish initial access through compromised external accounts or by creating accounts in untrusted tenants. Organizations can configure an allowlist or blocklist to control B2B collaboration invitations from specific organizations, and without these controls, threat actors can leverage social engineering techniques to obtain invitations from legitimate internal users. Once threat actors gai",
    "userImpact": "Medium",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21823",
    "testId": "21823",
    "title": "Guest self-service sign-up via user flow is disabled",
    "category": "External collaboration",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "When guest self-service sign-up is enabled, threat actors can exploit it to establish unauthorized access by creating legitimate guest accounts without requiring approval from authorized personnel. These accounts can be scoped to specific services to reduce detection and effectively bypass invitation-based controls that validate external user legitimacy. Once created, self-provisioned guest accounts provide persistent access to organizational resources and applications. Threat actors can use the",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Investigate",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21824",
    "testId": "21824",
    "title": "Guests don",
    "category": "External collaboration",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "Guest accounts with extended sign-in sessions increase the risk surface area that threat actors can exploit. When guest sessions persist beyond necessary timeframes, threat actors often attempt to gain initial access through credential stuffing, password spraying, or social engineering attacks. Once they gain access, they can maintain unauthorized access for extended periods without reauthentication challenges. These compromised and extended sessions: - Allow unauthorized access to Microsoft Ent",
    "userImpact": "Medium",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21825",
    "testId": "21825",
    "title": "Privileged users have short-lived sign-in sessions",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "When privileged users are allowed to maintain long-lived sign-in sessions without periodic reauthentication, threat actors can gain extended windows of opportunity to exploit compromised credentials or hijack active sessions. Once a privileged account is compromised through techniques like credential theft, phishing, or session fixation, extended session timeouts allow threat actors to maintain persistence within the environment for prolonged periods. With long-lived sessions, threat actors can ",
    "userImpact": "Medium",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21828",
    "testId": "21828",
    "title": "Authentication transfer is blocked",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Blocking authentication transfer in Microsoft Entra ID is a critical security control. It helps protect against token theft and replay attacks by preventing the use of device tokens to silently authenticate on other devices or browsers. When authentication transfer is enabled, a threat actor who gains access to one device can access resources to nonapproved devices, bypassing standard authentication and device compliance checks. When administrators block this flow, organizations can ensure that ",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21829",
    "testId": "21829",
    "title": "Use cloud authentication",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "An on-premises federation server introduces a critical attack surface by serving as a central authentication point for cloud applications. Threat actors often gain a foothold by compromising a privileged user such as a help desk representative or an operations engineer through attacks like phishing, credential stuffing, or exploiting weak passwords. They might also target unpatched vulnerabilities in infrastructure, use remote code execution exploits, attack the Kerberos protocol, or use pass-th",
    "userImpact": "High",
    "implementationCost": "High",
    "status": "Failed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21830",
    "testId": "21830",
    "title": "Conditional Access policies for Privileged Access Workstations are configured",
    "category": "Application management",
    "sfiPillar": "Protect engineering systems",
    "risk": "High",
    "description": "If privileged role activations aren't restricted to dedicated Privileged Access Workstations (PAWs), threat actors can exploit compromised endpoint devices to perform privileged escalation attacks from unmanaged or noncompliant workstations. Standard productivity workstations often contain attack vectors such as unrestricted web browsing, email clients vulnerable to phishing, and locally installed applications with potential vulnerabilities. When administrators activated privileged roles from th",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Investigate",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21831",
    "testId": "21831",
    "title": "Protected actions are enabled for high-impact management tasks",
    "category": "Privileged access",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "Threat actors who gain privileged access to a tenant can manipulate identity, access, and security configurations. This type of attack can result in environment-wide compromise and loss of control over organizational assets. Take action to protect high-impact management tasks associated with Conditional Access policies, cross-tenant access settings, hard deletions, and network locations that are critical to maintaining security. Protected actions let administrators secure these tasks with extra ",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21832",
    "testId": "21832",
    "title": "All groups in Conditional Access policies belong to a restricted management administrative unit",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Skipped",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21833",
    "testId": "21833",
    "title": "Directory Sync account credentials haven",
    "category": "Privileged access",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Low",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Skipped",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21834",
    "testId": "21834",
    "title": "Directory sync account is locked down to specific named location",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Low",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Investigate",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21835",
    "testId": "21835",
    "title": "Emergency access accounts are configured appropriately",
    "category": "Application management",
    "sfiPillar": "Protect engineering systems",
    "risk": "High",
    "description": "Microsoft recommends that organizations have two cloud-only emergency access accounts permanently assigned the [Global Administrator](https://learn.microsoft.com/entra/identity/role-based-access-control/permissions-reference?wt.mc_id=zerotrustrecommendations_automation_content_cnl_csasci#global-administrator) role. These accounts are highly privileged and aren't assigned to specific individuals. The accounts are limited to emergency or \"break glass\" scenarios where normal accounts can't be used ",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21836",
    "testId": "21836",
    "title": "Workload Identities are not assigned privileged roles",
    "category": "Application management",
    "sfiPillar": "Protect engineering systems",
    "risk": "High",
    "description": "If administrators assign privileged roles to workload identities, such as service principals or managed identities, the tenant can be exposed to significant risk if those identities are compromised. Threat actors who gain access to a privileged workload identity can perform reconnaissance to enumerate resources, escalate privileges, and manipulate or exfiltrate sensitive data. The attack chain typically begins with credential theft or abuse of a vulnerable application. Next step is privilege esc",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21837",
    "testId": "21837",
    "title": "Limit the maximum number of devices per user to 10",
    "category": "Devices",
    "sfiPillar": "Protect engineering systems",
    "risk": "High",
    "description": "Controlling device proliferation is important. Set a reasonable limit on the number of devices each user can register in your Microsoft Entra ID tenant. Limiting device registration maintains security while allowing business flexibility. Microsoft Entra ID lets users register up to 50 devices by default. Reducing this number to 10 minimizes the attack surface and simplifies device management.",
    "userImpact": "Medium",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21838",
    "testId": "21838",
    "title": "Security key authentication method enabled",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Enabling the security key authentication method in Microsoft Entra ID mitigates the risk of credential theft and unauthorized access by requiring hardware-backed, phishing-resistant authentication. If this best practice is not followed, threat actors can exploit weak or reused passwords, perform credential stuffing attacks, and escalate privileges through compromised accounts. The kill chain begins with reconnaissance where attackers gather information about user accounts, followed by credential",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21839",
    "testId": "21839",
    "title": "Passkey authentication method enabled",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "When passkey authentication isn't enabled in Microsoft Entra ID, organizations rely on password-based authentication methods that are vulnerable to phishing, credential theft, and replay attacks. Attackers can use stolen passwords to gain initial access, bypass traditional multifactor authentication through Adversary-in-the-Middle (AiTM) attacks, and establish persistent access through token theft. Passkeys provide phishing-resistant authentication using cryptographic proof that attackers can't ",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21840",
    "testId": "21840",
    "title": "Security key attestation is enforced",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "When security key attestation isn't enforced, threat actors can exploit weak or compromised authentication hardware to establish persistent presence within organizational environments. Without attestation validation, malicious actors can register unauthorized or counterfeit FIDO2 security keys that bypass hardware-backed security controls, enabling them to perform credential stuffing attacks using fabricated authenticators that mimic legitimate security keys. This initial access lets threat acto",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21841",
    "testId": "21841",
    "title": "Microsoft Authenticator app report suspicious activity setting is enabled",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Threat actors increasingly rely on prompt bombing and real-time phishing proxies to coerce or trick users into approving fraudulent multifactor authentication (MFA) challenges. Without the Microsoft Authenticator app's **Report suspicious activity** capability enabled, an attacker can iterate until a fatigued user accepts. This type of attack can lead to privilege escalation, persistence, lateral movement into sensitive workloads, data exfiltration, or destructive actions. When reporting is enab",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21842",
    "testId": "21842",
    "title": "Block administrators from using SSPR",
    "category": "Credential management, Privileged access",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Self-Service Password Reset (SSPR) for administrators allows password changes to happen without strong secondary authentication factors or administrative oversight. Threat actors who compromise administrative credentials can use this capability to bypass other security controls and maintain persistent access to the environment. Once compromised, attackers can immediately reset the password to lock out legitimate administrators. They can then establish persistence, escalate privileges, and deploy",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21843",
    "testId": "21843",
    "title": "Block legacy Microsoft Online PowerShell module",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Low",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Failed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21844",
    "testId": "21844",
    "title": "Block legacy Azure AD PowerShell module",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Threat actors frequently target legacy management interfaces such as the Azure AD PowerShell module (AzureAD and AzureADPreview), which don't support modern authentication, Conditional Access enforcement, or advanced audit logging. Continued use of these modules exposes the environment to risks including weak authentication, bypass of security controls, and incomplete visibility into administrative actions. Attackers can exploit these weaknesses to gain unauthorized access, escalate privileges, ",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21845",
    "testId": "21845",
    "title": "Temporary access pass is enabled",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Without Temporary Access Pass (TAP) enabled, organizations face significant challenges in securely bootstrapping user credentials, creating a vulnerability where users rely on weaker authentication mechanisms during their initial setup. When users cannot register phishing-resistant credentials like FIDO2 security keys or Windows Hello for Business due to lack of existing strong authentication methods, they remain exposed to credential-based attacks including phishing, password spray, or similar ",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21846",
    "testId": "21846",
    "title": "Restrict Temporary Access Pass to Single Use",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "When Temporary Access Pass (TAP) is configured to allow multiple uses, threat actors who compromise the credential can reuse it repeatedly during its validity period, extending their unauthorized access window beyond the intended single bootstrapping event. This situation creates an extended opportunity for threat actors to establish persistence by registering additional strong authentication methods under the compromised account during the credential lifetime. A reusable TAP that falls into the",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21847",
    "testId": "21847",
    "title": "Password protection for on-premises is enabled",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "When on-premises password protection isn’t enabled or enforced, threat actors can use low-and-slow password spray with common variants, such as season+year+symbol or local terms, to gain initial access to Active Directory Domain Services accounts. Domain Controllers (DCs) can accept weak passwords when either of the following statements are true: - Microsoft Entra Password Protection DC agent isn't installed - The password protection tenant setting is disabled or in audit-only mode With valid on",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21848",
    "testId": "21848",
    "title": "Add organizational terms to the banned password list",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Organizations that don't populate and enforce the custom banned password list expose themselves to a systematic attack chain where threat actors exploit predictable organizational password patterns. These threat actors typically start with reconnaissance phases, where they gather open-source intelligence (OSINT) from websites, social media, and public records to identify likely password components. With this knowledge, they launch password spray attacks that test organization-specific password v",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21849",
    "testId": "21849",
    "title": "Smart lockout duration is set to a minimum of 60",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "When Smart Lockout duration is configured below the default 60 seconds, threat actors can exploit shortened lockout periods to conduct password spray and credential stuffing attacks more effectively. Reduced lockout windows allow attackers to resume authentication attempts more rapidly, increasing their success probability while potentially evading detection systems that rely on longer observation periods.",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21850",
    "testId": "21850",
    "title": "Smart lockout threshold set to 10 or less",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "When the smart lockout threshold is set to more than 10, threat actors can exploit the configuration to conduct reconnaissance, identify valid user accounts without triggering lockout protections, and establish initial access without detection. Once attackers gain initial access, they can move laterally through the environment by using the compromised account to access resources and escalate privileges. Smart lockout helps lock out bad actors who try to guess your users' passwords or use brute f",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21851",
    "testId": "21851",
    "title": "Guest access is protected by strong authentication methods",
    "category": "External collaboration",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "External user accounts are often used to provide access to business partners who belong to organizations that have a business relationship with your organization. If these accounts are compromised in their organization, attackers can use the valid credentials to gain initial access to your environment, often bypassing traditional defenses due to their legitimacy. Attackers might gain access with external user accounts, if multifactor authentication (MFA) isn't universally enforced or if there ar",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21854",
    "testId": "21854",
    "title": "Privileged roles aren",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21855",
    "testId": "21855",
    "title": "Privileged roles have access reviews",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21857",
    "testId": "21857",
    "title": "Guest identities are lifecycle managed with access reviews",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21858",
    "testId": "21858",
    "title": "Inactive guest identities are disabled or removed from the tenant",
    "category": "External collaboration",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "When guest identities remain active but unused for extended periods, threat actors can exploit these dormant accounts as entry vectors into the organization. Inactive guest accounts represent a significant attack surface because they often maintain persistent access permissions to resources, applications, and data while remaining unmonitored by security teams. Threat actors frequently target these accounts through credential stuffing, password spraying, or by compromising the guest's home organi",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21859",
    "testId": "21859",
    "title": "GDAP admin least privilege",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21860",
    "testId": "21860",
    "title": "Diagnostic settings are configured for all Microsoft Entra logs",
    "category": "Monitoring",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "High",
    "description": "The activity logs and reports in Microsoft Entra can help detect unauthorized access attempts or identify when tenant configuration changes. When logs are archived or integrated with Security Information and Event Management (SIEM) tools, security teams can implement powerful monitoring and detection security controls, proactive threat hunting, and incident response processes. The logs and monitoring features can be used to assess tenant health and provide evidence for compliance and audits. If ",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21861",
    "testId": "21861",
    "title": "All high-risk users are triaged",
    "category": "Monitoring",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "High",
    "description": "Users considered at high risk by Microsoft Entra ID Protection have a high probability of compromise by threat actors. Threat actors can gain initial access via compromised valid accounts, where their suspicious activities continue despite triggering risk indicators. This oversight can enable persistence as threat actors perform activities that normally warrant investigation, such as unusual login patterns or suspicious inbox manipulation. A lack of triage of these risky users allows for expande",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21862",
    "testId": "21862",
    "title": "All risky workload identities are triaged",
    "category": "Monitoring",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "High",
    "description": "Compromised workload identities (service principals and applications) allow threat actors to gain persistent access without user interaction or multifactor authentication. Microsoft Entra ID Protection monitors these identities for suspicious activities like leaked credentials, anomalous API traffic, and malicious applications. Unaddressed risky workload identities enable privilege escalation, lateral movement, data exfiltration, and persistent backdoors that bypass traditional security controls",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21863",
    "testId": "21863",
    "title": "All high-risk sign-ins are triaged",
    "category": "Monitoring",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "High",
    "description": "Risky sign-ins flagged by Microsoft Entra ID Protection indicate a high probability of unauthorized access attempts. Threat actors use these sign-ins to gain an initial foothold. If these sign-ins remain uninvestigated, adversaries can establish persistence by repeatedly authenticating under the guise of legitimate users. A lack of response lets attackers execute reconnaissance, attempt to escalate their access, and blend into normal patterns. When untriaged sign-ins continue to generate alerts ",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21864",
    "testId": "21864",
    "title": "All risk detections are triaged",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21865",
    "testId": "21865",
    "title": "Named locations are configured",
    "category": "Application management",
    "sfiPillar": "Protect networks",
    "risk": "Medium",
    "description": "Without named locations configured in Microsoft Entra ID, threat actors can exploit the absence of location intelligence to conduct attacks without triggering location-based risk detections or security controls. When organizations fail to define named locations for trusted networks, branch offices, and known geographic regions, Microsoft Entra ID Protection can't assess location-based risk signals. Not having these policies in place can lead to increased false positives that create alert fatigue",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21866",
    "testId": "21866",
    "title": "All Microsoft Entra recommendations are addressed",
    "category": "Monitoring",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "Medium",
    "description": "Microsoft Entra recommendations give organizations opportunities to implement best practices and optimize their security posture. Not acting on these items might result in an increased attack surface area, suboptimal operations, or poor user experience.",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21867",
    "testId": "21867",
    "title": "Enterprise applications with high privilege Microsoft Graph API permissions have owners",
    "category": "Application management",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "High",
    "description": "Without owners, enterprise applications become orphaned assets that threat actors can exploit through credential harvesting and privilege escalation techniques. These applications often retain elevated permissions and access to sensitive resources while lacking proper oversight and security governance. The elevation of privilege to owners can raise a security concern, depending on the application's permissions. More critically, applications without an owner can create uncertainty in security mon",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21868",
    "testId": "21868",
    "title": "Guests do not own apps in the tenant",
    "category": "External collaboration",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "Without restrictions preventing guest users from registering and owning applications, threat actors can exploit external user accounts to establish persistent backdoor access to organizational resources through application registrations that might evade traditional security monitoring. When guest users own applications, compromised guest accounts can be used to exploit guest-owned applications that might have broad permissions. This vulnerability enables threat actors to request access to sensit",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Skipped",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21869",
    "testId": "21869",
    "title": "Enterprise applications must require explicit assignment or scoped provisioning",
    "category": "Application management",
    "sfiPillar": "Protect engineering systems",
    "risk": "Medium",
    "description": "When enterprise applications lack both explicit assignment requirements AND scoped provisioning controls, threat actors can exploit this dual weakness to gain unauthorized access to sensitive applications and data. The highest risk occurs when applications are configured with the default setting: \"Assignment required\" is set to \"No\" *and* provisioning isn't required or scoped. This dangerous combination allows threat actors who compromise any user account within the tenant to immediately access ",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21870",
    "testId": "21870",
    "title": "Enable self-service password reset",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Without Self-Service Password Reset (SSPR) enabled, users with password-related issues must contact help desk support, which can cause in operational delays and lost productivity. There are also potential security vulnerabilities during the extended timeframe required for administrative password resets. These delays not only reduce employee efficiency (especially in time-sensitive roles), but also increase support costs and strain IT resources. During these periods, threat actors might exploit l",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21872",
    "testId": "21872",
    "title": "Require multifactor authentication for device join and device registration using user action",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Threat actors can exploit the lack of multifactor authentication during new device registration. Once authenticated, they can register rogue devices, establish persistence, and circumvent security controls tied to trusted endpoints. This foothold enables attackers to exfiltrate sensitive data, deploy malicious applications, or move laterally, depending on the permissions of the accounts being used by the attacker. Without MFA enforcement, risk escalates as adversaries can continuously reauthenti",
    "userImpact": "Medium",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-21874",
    "testId": "21874",
    "title": "Guest access is limited to approved tenants",
    "category": "External collaboration",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "Limiting guest access to a known and approved list of tenants helps to prevent threat actors from exploiting unrestricted guest access to establish initial access through compromised external accounts or by creating accounts in untrusted tenants. Threat actors who gain access through an unrestricted domain can discover internal resources, users, and applications to perform additional attacks. Organizations should take inventory and configure an allowlist or blocklist to control B2B collaboration",
    "userImpact": "Medium",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21875",
    "testId": "21875",
    "title": "All entitlement management assignment policies that apply to external users require connected organizations",
    "category": "External collaboration",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "Access packages configured to allow \"All users\" instead of specific connected organizations expose your organization to uncontrolled external access. Threat actors can exploit this by requesting access through compromised external accounts from unauthorized organizations, bypassing the principle of least privilege. This enables initial access, reconnaissance, privilege escalation, and lateral movement within your environment.",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21876",
    "testId": "21876",
    "title": "Use PIM for Microsoft Entra privileged roles",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21877",
    "testId": "21877",
    "title": "All guests have a sponsor",
    "category": "Application management",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "Inviting external guests is beneficial for organizational collaboration. However, in the absence of an assigned internal sponsor for each guest, these accounts might persist within the directory without clear accountability. This oversight creates a risk: threat actors could potentially compromise an unused or unmonitored guest account, and then establish an initial foothold within the tenant. Once granted access as an apparent \"legitimate\" user, an attacker might explore accessible resources an",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21878",
    "testId": "21878",
    "title": "All entitlement management policies have an expiration date",
    "category": "Identity governance",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "Entitlement management policies without expiration dates create persistent access that threat actors can exploit. When user assignments lack time bounds, compromised credentials maintain indefinite access, enabling attackers to establish persistence, escalate privileges through additional access packages, and conduct long-term malicious activities while remaining undetected.",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21879",
    "testId": "21879",
    "title": "All entitlement management policies that apply to External users require approval",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "## Overview Without enforced approval on entitlement management policies that allow external users, a threat actor can self-orchestrate initial access by submitting unattended requests that are auto-approved. Each successful request provisions or reuses a guest user object and grant access to resources included in the access package, immediately expanding reconnaissance surface. From that foothold the actor can enumerate additional collaboration surfaces, harvest shared files, and probe mis-scop",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21881",
    "testId": "21881",
    "title": "Azure subscriptions used by Identity Governance are secured consistently with Identity Governance roles",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21882",
    "testId": "21882",
    "title": "No nested groups in PIM for groups",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21883",
    "testId": "21883",
    "title": "Workload Identities are configured with risk-based policies",
    "category": "Access control",
    "sfiPillar": "Accelerate response and remediation",
    "risk": "Medium",
    "description": "Set up risk-based Conditional Access policies for workload identities based on risk policy in Microsoft Entra ID to make sure only trusted and verified workloads use sensitive resources. Without these policies, threat actors can compromise workload identities with minimal detection and perform further attacks. Without conditional controls to detect anomalous activity and other risks, there's no check against malicious operations like token forgery, access to sensitive resources, and disruption o",
    "userImpact": "High",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21884",
    "testId": "21884",
    "title": "Conditional Access policies for workload identities based on known networks are configured",
    "category": "External collaboration",
    "sfiPillar": "Protect tenants and production systems",
    "risk": "High",
    "description": "When workload identities operate without network-based Conditional Access restrictions, threat actors can compromise service principal credentials through various methods, such as exposed secrets in code repositories or intercepted authentication tokens. The threat actors can then use these credentials from any location globally. This unrestricted access enables threat actors to perform reconnaissance activities, enumerate resources, and map the tenant's infrastructure while appearing legitimate",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21885",
    "testId": "21885",
    "title": "App registrations use safe redirect URIs",
    "category": "Application management",
    "sfiPillar": "Protect engineering systems",
    "risk": "High",
    "description": "OAuth applications configured with URLs that include wildcards, or URL shorteners increase the attack surface for threat actors. Insecure redirect URIs (reply URLs) might allow adversaries to manipulate authentication requests, hijack authorization codes, and intercept tokens by directing users to attacker-controlled endpoints. Wildcard entries expand the risk by permitting unintended domains to process authentication responses, while shortener URLs might facilitate phishing and token theft in u",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21886",
    "testId": "21886",
    "title": "Applications are configured for automatic user provisioning",
    "category": "Applications management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "When applications that support both authentication and provisioning through Microsoft Entra aren't configured for automatic provisioning, organizations become vulnerable to identity lifecycle gaps that threat actors can exploit. Without automated provisioning, user accounts might persist in applications after employees leave the organization. This vulnerability creates dormant accounts that threat actors can discover through reconnaissance activities. These orphaned accounts often retain their o",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21887",
    "testId": "21887",
    "title": "All registered redirect URIs must have proper DNS records and ownerships",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21888",
    "testId": "21888",
    "title": "App registrations must not have dangling or abandoned domain redirect URIs",
    "category": "Application management",
    "sfiPillar": "Protect engineering systems",
    "risk": "High",
    "description": "Unmaintained or orphaned redirect URIs in app registrations create significant security vulnerabilities when they reference domains that no longer point to active resources. Threat actors can exploit these \"dangling\" DNS entries by provisioning resources at abandoned domains, effectively taking control of redirect endpoints. This vulnerability enables attackers to intercept authentication tokens and credentials during OAuth 2.0 flows, which can lead to unauthorized access, session hijacking, and",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21889",
    "testId": "21889",
    "title": "Reduce the user-visible password surface area",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Organizations with extensive user-facing password surfaces expose multiple entry points for threat actors to launch credential-based attacks. Frequent user interactions with password prompts across applications, devices, and workflows increase the risk of exploitation. Threat actors often begin with credential stuffing—using compromised credentials from data breaches—followed by password spraying to test common passwords across multiple accounts. Once initial access is gained, they conduct crede",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21890",
    "testId": "21890",
    "title": "Require password reset notifications for user roles",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Medium",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21891",
    "testId": "21891",
    "title": "Require password reset notifications for administrator roles",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Configuring password reset notifications for administrator roles in Microsoft Entra ID enhances security by notifying privileged administrators when another administrator resets their password. This visibility helps detect unauthorized or suspicious activity that could indicate credential compromise or insider threats. Without these notifications, malicious actors could exploit elevated privileges to establish persistence, escalate access, or extract sensitive data. Proactive notifications suppo",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21892",
    "testId": "21892",
    "title": "All sign-in activity comes from managed devices",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "When sign-ins are not restricted to managed devices, threat actors can use unmanaged devices to establish initial access to organizational resources. Unmanaged devices lack organizational security controls, endpoint protection, and compliance verification, creating entry points for threat actors to exploit. Unmanaged devices lack centralized security controls, compliance monitoring, and policy enforcement, creating gaps in the organization's security perimeter. Threat actors can compromise these",
    "userImpact": "High",
    "implementationCost": "High",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21893",
    "testId": "21893",
    "title": "All users are required to register for MFA",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Low",
    "description": "Require multifactor authentication (MFA) registration for all users. Based on studies, your account is more than 99% less likely to be compromised if you're using MFA. Even if you don't require MFA all the time, this policy ensures your users are ready when it's needed.",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21894",
    "testId": "21894",
    "title": "All certificates Microsoft Entra Application Registrations and Service Principals must be issued by an approved certification authority",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Low",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21895",
    "testId": "21895",
    "title": "Application Certificate Credentials are managed using HSM",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Low",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21896",
    "testId": "21896",
    "title": "Service principals don",
    "category": "Application management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Service principals without proper authentication credentials (certificates or client secrets) create security vulnerabilities that allow threat actors to impersonate these identities. This can lead to unauthorized access, lateral movement within your environment, privilege escalation, and persistent access that's difficult to detect and remediate.",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21897",
    "testId": "21897",
    "title": "All app assignment and group membership is governed",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "High",
    "implementationCost": "High",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21898",
    "testId": "21898",
    "title": "All supported access lifecycle resources are managed with entitlement management packages",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Medium",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21899",
    "testId": "21899",
    "title": "All privileged role assignments have a recipient that can receive notifications",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21912",
    "testId": "21912",
    "title": "Azure resources used by Microsoft Entra only allow access from privileged roles",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21929",
    "testId": "21929",
    "title": "All entitlement management packages that apply to guests have expirations or access reviews configured in their assignment policies",
    "category": "Identity governance",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "Medium",
    "description": "Access packages for guest users without expiration dates or access reviews allow indefinite access to organizational resources. Compromised or stale guest accounts enable threat actors to maintain persistent, undetected access for lateral movement, privilege escalation, and data exfiltration. Without periodic validation, organizations cannot identify when business relationships change or when guest access is no longer needed.",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21941",
    "testId": "21941",
    "title": "Token protection policies are configured",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Token protection policies in Entra ID tenants are crucial for safeguarding authentication tokens from misuse and unauthorized access. Without these policies, threat actors can intercept and manipulate tokens, leading to unauthorized access to sensitive resources. This can result in data exfiltration, lateral movement within the network, and potential compromise of privileged accounts. When token protection is not properly configured, threat actors can exploit several attack vectors: 1. **Token t",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21953",
    "testId": "21953",
    "title": "Local Admin Password Solution is deployed",
    "category": "Devices",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Without Local Admin Password Solution (LAPS) deployed, threat actors exploit static local administrator passwords to establish initial access. After threat actors compromise a single device with a shared local administrator credential, they can move laterally across the environment and authenticate to other systems sharing the same password. Compromised local administrator access gives threat actors system-level privileges, letting them disable security controls, install persistent backdoors, ex",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21954",
    "testId": "21954",
    "title": "Restrict non-administrator users from recovering the BitLocker keys for their owned devices",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "When non-administrator users can access their own BitLocker keys, threat actors who compromise user credentials through phishing, credential stuffing, or malware-based keyloggers gain direct access to encryption keys without requiring privilege escalation. This access vector enables threat actors to persist on the compromised device by accessing encrypted volumes. Once threat actors obtain BitLocker keys, they can decrypt sensitive data stored on the device, including cached credentials, local d",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21955",
    "testId": "21955",
    "title": "Manage the local administrators on Microsoft Entra joined devices",
    "category": "Devices",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "High",
    "description": "When local administrators on Microsoft Entra joined devices aren't properly managed, threat actors with compromised credentials can execute device takeover attacks by removing organizational administrators and disabling the device's connection to Microsoft Entra. This lack of control results in complete loss of organizational control, creating orphaned assets that can't be managed or recovered.",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21964",
    "testId": "21964",
    "title": "Enable protected actions to secure Conditional Access policy creation and changes",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Low",
    "description": "Configure protected actions for Conditional Access policy create, update and delete permissions, and Authentication Context update permission. Refer to the guidance on common stronger Conditional Access policies:",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Investigate",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21983",
    "testId": "21983",
    "title": "No Active Medium priority Entra recommendations found",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21984",
    "testId": "21984",
    "title": "No Active low priority Entra recommendations found",
    "category": "Access control",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Low",
    "description": "...",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21985",
    "testId": "21985",
    "title": "Turn off Seamless SSO if there is no usage",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Microsoft Entra seamless single sign-on (Seamless SSO) is a legacy authentication feature designed to provide passwordless access for domain-joined devices that are not hybrid Microsoft Entra ID joined. Seamless SSO relies on Kerberos authentication and is primarily beneficial for older operating systems like Windows 7 and Windows 8.1, which do not support Primary Refresh Tokens (PRT). If these legacy systems are no longer present in the environment, continuing to use Seamless SSO introduces unn",
    "userImpact": "Low",
    "implementationCost": "Low",
    "status": "Skipped",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-21992",
    "testId": "21992",
    "title": "Application certificates must be rotated on a regular basis",
    "category": "Application management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "If certificates aren't rotated regularly, they can give threat actors an extended window to extract and exploit them, leading to unauthorized access. When credentials like these are exposed, attackers can blend their malicious activities with legitimate operations, making it easier to bypass security controls. If an attacker compromises an application’s certificate, they can escalate their privileges within the system, leading to broader access and control, depending on the application's privile",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Skipped",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-22072",
    "testId": "22072",
    "title": "Self-service password reset doesn",
    "category": "Credential management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Allowing security questions as a self-service password reset (SSPR) method weakens the password reset process because answers are frequently guessable, reused across sites, or discoverable through open-source intelligence (OSINT). Threat actors enumerate or phish users, derive likely responses (family names, schools, and locations), and then trigger password reset flows to bypass stronger methods by exploiting the weaker knowledge-based gate. After they successfully reset a password on an accoun",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-22124",
    "testId": "22124",
    "title": "High priority Microsoft Entra recommendations are addressed",
    "category": "Monitoring",
    "sfiPillar": "Monitor and detect cyberthreats",
    "risk": "High",
    "description": "Leaving high-priority Microsoft Entra recommendations unaddressed can create a gap in an organization’s security posture, offering threat actors opportunities to exploit known weaknesses. Not acting on these items might result in an increased attack surface area, suboptimal operations, or poor user experience.",
    "userImpact": "Medium",
    "implementationCost": "Medium",
    "status": "Failed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-22128",
    "testId": "22128",
    "title": "Guests are not assigned high privileged directory roles",
    "category": "Application management",
    "sfiPillar": "Protect tenants and isolate production systems",
    "risk": "High",
    "description": "When guest users are assigned highly privileged directory roles such as Global Administrator or Privileged Role Administrator, organizations create significant security vulnerabilities that threat actors can exploit for initial access through compromised external accounts or business partner environments. Since guest users originate from external organizations without direct control of security policies, threat actors who compromise these external identities can gain privileged access to the tar",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-22659",
    "testId": "22659",
    "title": "All risky workload identity sign-ins are triaged",
    "category": "Monitoring",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Threat actors increasingly target workload identities (applications, service principals, and managed identities) because they lack human factors and often use long-lived credentials. A compromise often looks like the following path: 1. Credential abuse or key theft. 1. Non-interactive sign-ins to cloud resources. 1. Lateral movement via app permissions. 1. Persistence through new secrets or role assignments. Microsoft Entra ID Protection continuously generates risky workload identity detections ",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-23183",
    "testId": "23183",
    "title": "Service principals use safe redirect URIs",
    "category": "Application management",
    "sfiPillar": "Protect engineering systems",
    "risk": "High",
    "description": "Non-Microsoft and multitenant applications configured with URLs that include wildcards, localhost, or URL shorteners increase the attack surface for threat actors. These insecure redirect URIs (reply URLs) might allow adversaries to manipulate authentication requests, hijack authorization codes, and intercept tokens by directing users to attacker-controlled endpoints. Wildcard entries expand the risk by permitting unintended domains to process authentication responses, while localhost and shorte",
    "userImpact": "Low",
    "implementationCost": "High",
    "status": "Passed",
    "tenantType": ["Workforce", "External"]
  },
  {
    "id": "ZTA-24518",
    "testId": "24518",
    "title": "Enterprise applications have owners",
    "category": "Application management",
    "sfiPillar": "Protect identities and secrets",
    "risk": "Medium",
    "description": "Without owners, enterprise applications become orphaned assets that threat actors can exploit through credential harvesting and privilege escalation techniques, as these applications often retain elevated permissions and access to sensitive resources while lacking proper oversight and security governance. The elevation of privilege to owners can raise a security concern in some cases depending on the application's permissions, but more critically, applications without owner create a blind spot i",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Skipped",
    "tenantType": ["Workforce"]
  },
  {
    "id": "ZTA-24570",
    "testId": "24570",
    "title": "Entra Connect Sync is configured with Service Principal Credentials",
    "category": "Hybrid infrastructure",
    "sfiPillar": "Protect identities and secrets",
    "risk": "High",
    "description": "Microsoft Entra Connect Sync using user accounts instead of service principals creates security vulnerabilities. Legacy user account authentication with passwords is more susceptible to credential theft and password attacks than service principal authentication with certificates. Compromised connector accounts allow threat actors to manipulate identity synchronization, create backdoor accounts, escalate privileges, or disrupt hybrid identity infrastructure.",
    "userImpact": "Low",
    "implementationCost": "Medium",
    "status": "Investigate",
    "tenantType": ["Workforce"]
  },
];