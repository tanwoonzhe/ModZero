// Identity Security Tests Data - Based on Microsoft Zero Trust Assessment
// Total: 133 Identity Tests (from official Microsoft repo)

export interface IdentityTest {
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

// Part 1: Tests (34 tests)
export const identityTestsPart1: IdentityTest[] = [
  {
    id: "21770",
    title: "Inactive applications don’t have highly privileged Microsoft Graph API permissions",
    category: "Access control",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Failed",
    description: "Attackers might exploit valid but inactive applications that still have elevated privileges. These applications can be used to gain initial access without raising alarm because they’re legitimate applications. From there, attackers can use the application privileges to plan or execute other attacks. Attackers might also maintain access by manipulating the inactive application, such as by adding credentials. This persistence ensures that even if their primary access method is detected, they can regain access later.",
    testResult: "Found issues that need attention.",
    userImpact: "High",
    implementationCost: "Low"
  },
  {
    id: "21771",
    title: "Inactive applications don’t have highly privileged built-in roles",
    category: "Application management",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    status: "Passed",
    description: "Attackers might exploit valid but inactive applications that still have elevated privileges. These applications can be used to gain initial access without raising alarm because they're legitimate applications. From there, attackers can use the application privileges to plan or execute other attacks. Attackers might also maintain access by manipulating the inactive application, such as by adding credentials. This persistence ensures that even if their primary access method is detected, they can regain access later.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "21772",
    title: "Applications don't have client secrets configured",
    category: "Application management",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "Applications that use client secrets might store them in configuration files, hardcode them in scripts, or risk their exposure in other ways. The complexities of secret management make client secrets susceptible to leaks and attractive to attackers. Client secrets, when exposed, provide attackers with the ability to blend their activities with legitimate operations, making it easier to bypass security controls. If an attacker compromises an application's client secret, they can escalate their privileges within the system, leading to broader access and control, depending on the permissions of the application. Applications and service principals that have permissions for Microsoft Graph APIs or other APIs have a higher risk because an attacker can potentially exploit these additional permissions.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "21773",
    title: "Applications don't have certificates with expiration longer than 180 days",
    category: "Application management",
    sfiPillar: "Protect identities and secrets",
    risk: "Medium",
    status: "Passed",
    description: "Certificates, if not securely stored, can be extracted and exploited by attackers, leading to unauthorized access. Long-lived certificates are more likely to be exposed over time. Credentials, when exposed, provide attackers with the ability to blend their activities with legitimate operations, making it easier to bypass security controls. If an attacker compromises an application's certificate, they can escalate their privileges within the system, leading to broader access and control, depending on the privileges of the application.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "21774",
    title: "Microsoft services applications don't have credentials configured",
    category: "Application management",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "Microsoft services applications that operate in your tenant are identified as service principals with the owner organization ID \"f8cdef31-a31e-4b4a-93e4-5f571e91255a.\" When these service principals have credentials configured in your tenant, they might create potential attack vectors that threat actors can exploit. If an administrator added the credentials and they're no longer needed, they can become a target for attackers. Although less likely when proper preventive and detective controls are in place on privileged activities, threat actors can also maliciously add credentials. In either case, threat actors can use these credentials to authenticate as the service principal, gaining the same permissions and access rights as the Microsoft service application. This initial access can lead to privilege escalation if the application has high-level permissions, allowing lateral movement across the tenant. Attackers can then proceed to data exfiltration or persistence establishment through creating other backdoor credentials. When credentials (like client secrets or certificates) are configured for these service principals in your tenant, it means someone - either an administrator or a malicious actor - enabled them to authenticate independently within your environment. These credentials should be investigated to determine their legitimacy and necessity. If they're no longer needed, they should be removed to reduce the risk.  If this check doesn't pass, the recommendation is to \"investigate\" because you need to identify and review any applications with unused credentials configured.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "21776",
    title: "User consent settings are restricted",
    category: "Application management",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "Without restricted user consent settings, threat actors can exploit permissive application consent configurations to gain unauthorized access to sensitive organizational data. When user consent is unrestricted, attackers can: - Use social engineering and illicit consent grant attacks to trick users into approving malicious applications. - Impersonate legitimate services to request broad permissions, such as access to email, files, calendars, and other critical business data. - Obtain legitimate OAuth tokens that bypass perimeter security controls, making access appear normal to security monitoring systems. - Establish persistent access to organizational resources, conduct reconnaissance across Microsoft 365 services, move laterally through connected systems, and potentially escalate privileges. Unrestricted user consent also limits an organization's ability to enforce centralized governance over application access, making it difficult to maintain visibility into which non-Microsoft applications have access to sensitive data. This gap creates compliance risks where unauthorized applications might violate data protection regulations or organizational security policies.",
    testResult: "All checks passed for this control.",
    userImpact: "High",
    implementationCost: "Medium"
  },
  {
    id: "21777",
    title: "App instance property lock is configured for all multitenant applications",
    category: "Access control",
    sfiPillar: "Protect tenants and isolate production systems",
    risk: "High",
    status: "Failed",
    description: "App instance property lock prevents changes to sensitive properties of a multitenant application after the application is provisioned in another tenant. Without a lock, critical properties such as application credentials can be maliciously or unintentionally modified, causing disruptions, increased risk, unauthorized access, or privilege escalations.",
    testResult: "Found issues that need attention.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "21781",
    title: "Privileged users sign in with phishing-resistant methods",
    category: "Privileged access",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "High",
    status: "Passed",
    description: "Without phishing-resistant authentication methods, privileged users are more vulnerable to phishing attacks. These types of attacks trick users into revealing their credentials to grant unauthorized access to attackers. If non-phishing-resistant authentication methods are used, attackers might intercept credentials and tokens, through methods like adversary-in-the-middle attacks, undermining the security of the privileged account. Once a privileged account or session is compromised due to weak authentication methods, attackers might manipulate the account to maintain long-term access, create other backdoors, or modify user permissions. Attackers can also use the compromised privileged account to escalate their access even further, potentially gaining control over more sensitive systems.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "21782",
    title: "Privileged accounts have phishing-resistant methods registered",
    category: "Privileged access",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "Without phishing-resistant authentication methods, privileged users are more vulnerable to phishing attacks. These types of attacks trick users into revealing their credentials to grant unauthorized access to attackers. If non-phishing-resistant authentication methods are used, attackers might intercept credentials and tokens, through methods like adversary-in-the-middle attacks, undermining the security of the privileged account. Once a privileged account or session is compromised due to weak authentication methods, attackers might manipulate the account to maintain long-term access, create other backdoors, or modify user permissions. Attackers can also use the compromised privileged account to escalate their access even further, potentially gaining control over more sensitive systems.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "21783",
    title: "Privileged Microsoft Entra built-in roles are targeted with Conditional Access policies to enforce phishing-resistant methods",
    category: "Access control",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "Without phishing-resistant authentication methods, privileged users are more vulnerable to phishing attacks. These types of attacks trick users into revealing their credentials to grant unauthorized access to attackers. If non-phishing-resistant authentication methods are used, attackers might intercept credentials and tokens, through methods like adversary-in-the-middle attacks, undermining the security of the privileged account. Once a privileged account or session is compromised due to weak authentication methods, attackers might manipulate the account to maintain long-term access, create other backdoors, or modify user permissions. Attackers can also use the compromised privileged account to escalate their access even further, potentially gaining control over more sensitive systems.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "21786",
    title: "User sign-in activity uses token protection",
    category: "Access control",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "A threat actor can intercept or extract authentication tokens from memory, local storage on a legitimate device, or by inspecting network traffic. The attacker might replay those tokens to bypass authentication controls on users and devices, get unauthorized access to sensitive data, or run further attacks. Because these tokens are valid and time bound, traditional anomaly detection often fails to flag the activity, which might allow sustained access until the token expires or is revoked. Token protection, also called token binding, helps prevent token theft by making sure a token is usable only from the intended device. Token protection uses cryptography so that without the client device key, no one can use the token.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "21787",
    title: "Permissions to create new tenants are limited to the Tenant Creator role",
    category: "Privileged access",
    sfiPillar: "Protect tenants and isolate production systems",
    risk: "High",
    status: "Passed",
    description: "A threat actor or a well-intentioned but uninformed employee can create a new Microsoft Entra tenant if there are no restrictions in place. By default, the user who creates a tenant is automatically assigned the Global Administrator role. Without proper controls, this action fractures the identity perimeter by creating a tenant outside the organization's governance and visibility. It introduces risk though a shadow identity platform that can be exploited for token issuance, brand impersonation, consent phishing, or persistent staging infrastructure. Since the rogue tenant might not be tethered to the enterprise’s administrative or monitoring planes, traditional defenses are blind to its creation, activity, and potential misuse.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "21788",
    title: "Global Administrators don't have standing access to Azure subscriptions",
    category: "Privileged access",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    status: "Passed",
    description: "Global Administrators with persistent access to Azure subscriptions expand the attack surface for threat actors. If a Global Administrator account is compromised, attackers can immediately enumerate resources, modify configurations, assign roles, and exfiltrate sensitive data across all subscriptions. Requiring just-in-time elevation for subscription access introduces detectable signals, slows attacker velocity, and routes high-impact operations through observable control points.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "21790",
    title: "Outbound cross-tenant access settings are configured",
    category: "Application management",
    sfiPillar: "Protect tenants and isolate production systems",
    risk: "High",
    status: "Investigate",
    description: "Allowing unrestricted external collaboration with unverified organizations can increase the risk surface area of the tenant because it allows guest accounts that might not have proper security controls. Threat actors can attempt to gain access by compromising identities in these loosely governed external tenants. Once granted guest access, they can then use legitimate collaboration pathways to infiltrate resources in your tenant and attempt to gain sensitive information. Threat actors can also exploit misconfigured permissions to escalate privileges and try different types of attacks. Without vetting the security of organizations you collaborate with, malicious external accounts can persist undetected, exfiltrate confidential data, and inject malicious payloads. This type of exposure can weaken organizational control and enable cross-tenant attacks that bypass traditional perimeter defenses and undermine both data integrity and operational resilience. Cross-tenant settings for outbound access in Microsoft Entra provide the ability to block collaboration with unknown organizations by default, reducing the attack surface.",
    testResult: "Manual review recommended.",
    userImpact: "Medium",
    implementationCost: "High"
  },
  {
    id: "21791",
    title: "Guests can’t invite other guests",
    category: "External collaboration",
    sfiPillar: "Protect tenants and isolate production systems",
    risk: "Medium",
    status: "Failed",
    description: "External user accounts are often used to provide access to business partners who belong to organizations that have a business relationship with your enterprise. If these accounts are compromised in their organization, attackers can use the valid credentials to gain initial access to your environment, often bypassing traditional defenses due to their legitimacy.   Allowing external users to onboard other external users increases the risk of unauthorized access. If an attacker compromises an external user's account, they can use it to create more external accounts, multiplying their access points and making it harder to detect the intrusion.",
    testResult: "Found issues that need attention.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "21792",
    title: "Guests have restricted access to directory objects",
    category: "External collaboration",
    sfiPillar: "Protect tenants and isolate production systems",
    risk: "Medium",
    status: "Passed",
    description: "External user accounts are often used to provide access to business partners who belong to organizations that have a business relationship with your enterprise. If these accounts are compromised in their organization, attackers can use the valid credentials to gain initial access to your environment, often bypassing traditional defenses due to their legitimacy.   External accounts with permissions to read directory object permissions provide attackers with broader initial access if compromised. These accounts allow attackers to gather additional information from the directory for reconnaissance.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "21793",
    title: "Tenant restrictions v2 policy is configured",
    category: "Application management",
    sfiPillar: "Protect networks",
    risk: "High",
    status: "Passed",
    description: "Tenant Restrictions v2 (TRv2) allows organizations to enforce policies that restrict access to specified Microsoft Entra tenants, preventing unauthorized exfiltration of corporate data to external tenants using local accounts. Without TRv2, threat actors can exploit this vulnerability, which leads to potential data exfiltration and compliance violations, followed by credential harvesting if those external tenants have weaker controls. Once credentials are obtained, threat actors can gain initial access to these external tenants. TRv2 provides the mechanism to prevent users from authenticating to unauthorized tenants. Otherwise, threat actors can move laterally, escalate privileges, and potentially exfiltrate sensitive data, all while appearing as legitimate user activity that bypasses traditional data loss prevention controls focused on internal tenant monitoring. Implementing TRv2 enforces policies that restrict access to specified tenants, mitigating these risks by ensuring that authentication and data access are confined to authorized tenants only.  If this check passes, your tenant has a TRv2 policy configured but more steps are required to validate the scenario end-to-end.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "21795",
    title: "No legacy authentication sign-in activity",
    category: "Monitoring",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "Medium",
    status: "Investigate",
    description: "Legacy authentication protocols such as basic authentication for SMTP and IMAP don't support modern security features like multifactor authentication (MFA), which is crucial for protecting against unauthorized access. This lack of protection makes accounts using these protocols vulnerable to password-based attacks, and provides attackers with a means to gain initial access using stolen or guessed credentials. When an attacker successfully gains unauthorized access to credentials, they can use them to access linked services, using the weak authentication method as an entry point. Attackers who gain access through legacy authentication might make changes to Microsoft Exchange, such as configuring mail forwarding rules or changing other settings, allowing them to maintain continued access to sensitive communications. Legacy authentication also provides attackers with a consistent method to reenter a system using compromised credentials without triggering security alerts or requiring reauthentication. From there, attackers can use legacy protocols to access other systems that are accessible via the compromised account, facilitating lateral movement. Attackers using legacy protocols can blend in with legitimate user activities, making it difficult for security teams to distinguish between normal usage and malicious behavior.",
    testResult: "Manual review recommended.",
    userImpact: "High",
    implementationCost: "Low"
  },
  {
    id: "21796",
    title: "Block legacy authentication policy is configured",
    category: "Access control",
    sfiPillar: "Protect identities and secrets",
    risk: "Medium",
    status: "Passed",
    description: "Legacy authentication protocols such as basic authentication for SMTP and IMAP don't support modern security features like multifactor authentication (MFA), which is crucial for protecting against unauthorized access. This lack of protection makes accounts using these protocols vulnerable to password-based attacks, and provides attackers with a means to gain initial access using stolen or guessed credentials. When an attacker successfully gains unauthorized access to credentials, they can use them to access linked services, using the weak authentication method as an entry point. Attackers who gain access through legacy authentication might make changes to Microsoft Exchange, such as configuring mail forwarding rules or changing other settings, allowing them to maintain continued access to sensitive communications. Legacy authentication also provides attackers with a consistent method to reenter a system using compromised credentials without triggering security alerts or requiring reauthentication. From there, attackers can use legacy protocols to access other systems that are accessible via the compromised account, facilitating lateral movement. Attackers using legacy protocols can blend in with legitimate user activities, making it difficult for security teams to distinguish between normal usage and malicious behavior.",
    testResult: "All checks passed for this control.",
    userImpact: "High",
    implementationCost: "Low"
  },
  {
    id: "21797",
    title: "Restrict access to high risk users",
    category: "Access control",
    sfiPillar: "Accelerate response and remediation",
    risk: "High",
    status: "Passed",
    description: "Assume high risk users are compromised by threat actors. Without investigation and remediation, threat actors can execute scripts, deploy malicious applications, or manipulate API calls to establish persistence, based on the potentially compromised user's permissions. Threat actors can then exploit misconfigurations or abuse OAuth tokens to move laterally across workloads like documents, SaaS applications, or Azure resources. Threat actors can gain access to sensitive files, customer records, or proprietary code and exfiltrate it to external repositories while maintaining stealth through legitimate cloud services. Finally, threat actors might disrupt operations by modifying configurations, encrypting data for ransom, or using the stolen information for further attacks, resulting in financial, reputational, and regulatory consequences. Organizations using passwords can rely on password reset to automatically remediate risky users. Organizations using passwordless credentials already mitigate most risk events that accrue to user risk levels, thus the volume of risky users should be considerably lower. Risky users in an organization that uses passwordless credentials must be blocked from access until the user risk is investigated and remediated.",
    testResult: "All checks passed for this control.",
    userImpact: "High",
    implementationCost: "Medium"
  },
  {
    id: "21798",
    title: "ID Protection notifications are enabled",
    category: "Access control",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "High",
    status: "Failed",
    description: "If you don't enable ID Protection notifications, your organization loses critical real-time alerts when threat actors compromise user accounts or conduct reconnaissance activities. When Microsoft Entra ID Protection detects accounts at risk, it sends email alerts with **Users at risk detected** as the subject and links to the **Users flagged for risk** report. Without these notifications, security teams remain unaware of active threats, allowing threat actors to maintain persistence in compromised accounts without being detected. You can feed these risks into tools like Conditional Access to make access decisions or send them to a security information and event management (SIEM) tool for investigation and correlation. Threat actors can use this detection gap to conduct lateral movement activities, privilege escalation attempts, or data exfiltration operations while administrators remain unaware of the ongoing compromise. The delayed response enables threat actors to establish more persistence mechanisms, change user permissions, or access sensitive resources before you can fix the issue. Without proactive notification of risk detections, organizations must rely solely on manual monitoring of risk reports, which significantly increases the time it takes to detect and respond to identity-based attacks.",
    testResult: "Found issues that need attention.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "21799",
    title: "Restrict high risk sign-ins",
    category: "Access control",
    sfiPillar: "Accelerate response and remediation",
    risk: "High",
    status: "Passed",
    description: "When high-risk sign-ins are not properly restricted through Conditional Access policies, organizations expose themselves to security vulnerabilities. Threat actors can exploit these gaps for initial access through compromised credentials, credential stuffing attacks, or anomalous sign-in patterns that Microsoft Entra ID Protection identifies as risky behaviors. Without appropriate restrictions, threat actors who successfully authenticate during high-risk scenarios can perform privilege escalation by misusing the authenticated session to access sensitive resources, modify security configurations, or conduct reconnaissance activities within the environment. Once threat actors establish access through uncontrolled high-risk sign-ins, they can achieve persistence by creating additional accounts, installing backdoors, or modifying authentication policies to maintain long-term access to the organization's resources. The unrestricted access enables threat actors to conduct lateral movement across systems and applications using the authenticated session, potentially accessing sensitive data stores, administrative interfaces, or critical business applications. Finally, threat actors achieve impact through data exfiltration, or compromise business-critical systems while maintaining plausible deniability by exploiting the fact that their risky authentication was not properly challenged or blocked.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "21800",
    title: "All user sign-in activity uses strong authentication methods",
    category: "Monitoring",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "Medium",
    status: "Investigate",
    description: "Attackers might gain access if multifactor authentication (MFA) isn't universally enforced or if there are exceptions in place. Attackers might gain access by exploiting vulnerabilities of weaker MFA methods like SMS and phone calls through social engineering techniques. These techniques might include SIM swapping or phishing, to intercept authentication codes. Attackers might use these accounts as entry points into the tenant. By using intercepted user sessions, attackers can disguise their activities as legitimate user actions, evade detection, and continue their attack without raising suspicion. From there, they might attempt to manipulate MFA settings to establish persistence, plan, and execute further attacks based on the privileges of compromised accounts.",
    testResult: "Manual review recommended.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "21801",
    title: "Users have strong authentication methods configured",
    category: "Credential management",
    sfiPillar: "Protect identities and secrets",
    risk: "Medium",
    status: "Passed",
    description: "Attackers might gain access if multifactor authentication (MFA) isn't universally enforced or if there are exceptions in place. Attackers might gain access by exploiting vulnerabilities of weaker MFA methods like SMS and phone calls through social engineering techniques. These techniques might include SIM swapping or phishing, to intercept authentication codes. Attackers might use these accounts as entry points into the tenant. By using intercepted user sessions, attackers can disguise their activities as legitimate user actions, evade detection, and continue their attack without raising suspicion. From there, they might attempt to manipulate MFA settings to establish persistence, plan, and execute further attacks based on the privileges of compromised accounts.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "21802",
    title: "Authenticator app shows sign-in context",
    category: "Access control",
    sfiPillar: "Protect identities and secrets",
    risk: "Medium",
    status: "Skipped",
    description: "Without sign-in context, threat actors can exploit authentication fatigue by flooding users with push notifications, increasing the chance that a user accidentally approves a malicious request. When users get generic push notifications without the application name or geographic location, they don't have the information they need to make informed approval decisions. This lack of context makes users vulnerable to social engineering attacks, especially when threat actors time their requests during periods of legitimate user activity. This vulnerability is especially dangerous when threat actors gain initial access through credential harvesting or password spraying attacks and then try to establish persistence by approving multifactor authentication (MFA) requests from unexpected applications or locations. Without contextual information, users can't detect unusual sign-in attempts, allowing threat actors to maintain access and escalate privileges by moving laterally through systems after bypassing the initial authentication barrier. Without application and location context, security teams also lose valuable telemetry for detecting suspicious authentication patterns that can indicate ongoing compromise or reconnaissance activities.",
    testResult: "Test skipped or not applicable.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "21803",
    title: "Migrate from legacy MFA and SSPR policies",
    category: "Credential management",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "Legacy multifactor authentication (MFA) and self-service password reset (SSPR) policies in Microsoft Entra ID manage authentication methods separately, leading to fragmented configurations and suboptimal user experience. Moreover, managing these policies independently increases administrative overhead and the risk of misconfiguration.   Migrating to the combined Authentication Methods policy consolidates the management of MFA, SSPR, and passwordless authentication methods into a single policy framework. This unification allows for more granular control, enabling administrators to target specific authentication methods to user groups and enforce consistent security measures across the organization. Additionally, the unified policy supports modern authentication methods, such as FIDO2 security keys and Windows Hello for Business, enhancing the organization's security posture. Microsoft announced the deprecation of legacy MFA and SSPR policies, with a retirement date set for September 30, 2025. Organizations are advised to complete the migration to the Authentication Methods policy before this date to avoid potential disruptions and to benefit from the enhanced security and management capabilities of the unified policy.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "21804",
    title: "SMS and Voice Call authentication methods are disabled",
    category: "Credential management",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "When weak authentication methods like SMS and voice calls remain enabled in Microsoft Entra ID, threat actors can exploit these vulnerabilities through multiple attack vectors. Initially, attackers often conduct reconnaissance to identify organizations using these weaker authentication methods through social engineering or technical scanning. Then they can execute initial access through credential stuffing attacks, password spraying, or phishing campaigns targeting user credentials. Once basic credentials are compromised, threat actors use these weaknesses in SMS and voice-based authentication. SMS messages can be intercepted through SIM swapping attacks, SS7 network vulnerabilities, or malware on mobile devices, while voice calls are susceptible to voice phishing (vishing) and call forwarding manipulation. With these weak second factors bypassed, attackers achieve persistence by registering their own authentication methods. Compromised accounts can be used to target higher-privileged users through internal phishing or social engineering, allowing attackers to escalate privileges within the organization. Finally, threat actors achieve their objectives through data exfiltration, lateral movement to critical systems, or deployment of other malicious tools, all while maintaining stealth by using legitimate authentication pathways that appear normal in security logs.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "21806",
    title: "Secure the MFA registration (My Security Info) page",
    category: "Access control",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "Without Conditional Access policies protecting security information registration, threat actors can exploit unprotected registration flows to compromise authentication methods. When users register multifactor authentication and self-service password reset methods without proper controls, threat actors can intercept these registration sessions through adversary-in-the-middle attacks or exploit unmanaged devices accessing registration from untrusted locations. Once threat actors gain access to an unprotected registration flow, they can register their own authentication methods, effectively hijacking the target's authentication profile. The threat actors can bypass security controls and potentially escalate privileges throughout the environment because they can maintain persistent access by controlling the MFA methods. The compromised authentication methods then become the foundation for lateral movement as threat actors can authenticate as the legitimate user across multiple services and applications.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Medium"
  },
  {
    id: "21807",
    title: "Creating new applications and service principals is restricted to privileged users",
    category: "Application management",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Passed",
    description: "If nonprivileged users can create applications and service principals, these accounts might be misconfigured or be granted more permissions than necessary, creating new vectors for attackers to gain initial access. Attackers can exploit these accounts to establish valid credentials in the environment and bypass some security controls. If these nonprivileged accounts are mistakenly granted elevated application owner permissions, attackers can use them to move from a lower level of access to a more privileged level of access. Attackers who compromise nonprivileged accounts might add their own credentials or change the permissions associated with the applications created by the nonprivileged users to ensure they can continue to access the environment undetected. Attackers can use service principals to blend in with legitimate system processes and activities. Because service principals often perform automated tasks, malicious activities carried out under these accounts might not be flagged as suspicious.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "21808",
    title: "Restrict device code flow",
    category: "Access control",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "Device code flow is a cross-device authentication flow designed for input-constrained devices. It can be exploited in phishing attacks, where an attacker initiates the flow and tricks a user into completing it on their device, thereby sending the user's tokens to the attacker. Given the security risks and the infrequent legitimate use of device code flow, you should enable a Conditional Access policy to block this flow by default.",
    testResult: "All checks passed for this control.",
    userImpact: "Medium",
    implementationCost: "Low"
  },
  {
    id: "21809",
    title: "Admin consent workflow is enabled",
    category: "Application management",
    sfiPillar: "Protect identities and secrets",
    risk: "High",
    status: "Passed",
    description: "Enabling the Admin consent workflow in a Microsoft Entra tenant is a vital security measure that mitigates risks associated with unauthorized application access and privilege escalation. This check is important because it ensures that any application requesting elevated permission undergoes a review process by designated administrators before consent is granted. The admin consent workflow in Microsoft Entra ID notifies reviewers who evaluate and approve or deny consent requests based on the application's legitimacy and necessity. If this check doesn't pass, meaning the workflow is disabled, any application can request and potentially receive elevated permissions without administrative review. This poses a substantial security risk, as malicious actors could exploit this lack of oversight to gain unauthorized access to sensitive data, perform privilege escalation, or execute other malicious activities.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "21810",
    title: "Resource-specific consent is restricted",
    category: "Access control",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    status: "Investigate",
    description: "Letting group owners consent to applications in Microsoft Entra ID creates a lateral escalation path that lets threat actors persist and steal data without admin credentials. If an attacker compromises a group owner account, they can register or use a malicious application and consent to high-privilege Graph API permissions scoped to the group. Attackers can potentially read all Teams messages, access SharePoint files, or manage group membership. This consent action creates a long-lived application identity with delegated or application permissions. The attacker maintains persistence with OAuth tokens, steals sensitive data from team channels and files, and impersonates users through messaging or email permissions. Without centralized enforcement of app consent policies, security teams lose visibility, and malicious applications spread under the radar, enabling multi-stage attacks across collaboration platforms.",
    testResult: "Manual review recommended.",
    userImpact: "Medium",
    implementationCost: "Medium"
  },
  {
    id: "21811",
    title: "Password expiration is disabled",
    category: "Credential management",
    sfiPillar: "Protect identities and secrets",
    risk: "Medium",
    status: "Passed",
    description: "When password expiration policies remain enabled, threat actors can exploit the predictable password rotation patterns that users typically follow when forced to change passwords regularly. Users frequently create weaker passwords by making minimal modifications to existing ones, such as incrementing numbers or adding sequential characters. Threat actors can easily anticipate and exploit these types of changes through credential stuffing attacks or targeted password spraying campaigns. These predictable patterns enable threat actors to establish persistence through: - Compromised credentials - Escalated privileges by targeting administrative accounts with weak rotated passwords - Maintaining long-term access by predicting future password variations Research shows that users create weaker, more predictable passwords when they are forced to expire. These predictable passwords are easier for experienced attackers to crack, as they often make simple modifications to existing passwords rather than creating entirely new, strong passwords. Additionally, when users are required to frequently change passwords, they might resort to insecure practices such as writing down passwords or storing them in easily accessible locations, creating more attack vectors for threat actors to exploit during physical reconnaissance or social engineering campaigns.",
    testResult: "All checks passed for this control.",
    userImpact: "Low",
    implementationCost: "Low"
  },
  {
    id: "21812",
    title: "Maximum number of Global Administrators doesn't exceed eight users",
    category: "Privileged access",
    sfiPillar: "Protect identities and secrets",
    risk: "Low",
    status: "Failed",
    description: "An excessive number of Global Administrator accounts creates an expanded attack surface that threat actors can exploit through various initial access vectors. Each extra privileged account represents a potential entry point for threat actors. An excess of Global Administrator accounts undermines the principle of least privilege. Microsoft recommends that organizations have no more than eight Global Administrators.",
    testResult: "Found issues that need attention.",
    userImpact: "Low",
    implementationCost: "Low"
  }
];
