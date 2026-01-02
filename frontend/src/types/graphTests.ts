/**
 * Types and hooks for real-time Graph API security tests.
 */

export interface TestResult {
  testId: string;
  name: string;
  description: string;
  status: "pass" | "fail" | "warning" | "error" | "not_applicable";
  details: string;
  data: any;
  recommendation: string;
  timestamp: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  errors: number;
  score: number;
}

export interface IdentityTestsResponse {
  category: string;
  timestamp: string;
  summary: TestSummary;
  tests: TestResult[];
}

export interface DeviceTestsResponse {
  category: string;
  timestamp: string;
  summary: TestSummary;
  tests: TestResult[];
}

// Map API status to UI status
export const mapApiStatus = (apiStatus: string): string => {
  switch (apiStatus) {
    case "pass":
      return "Passed";
    case "fail":
      return "Failed";
    case "warning":
      return "Investigate";
    case "error":
      return "Failed";
    case "not_applicable":
      return "Skipped";
    default:
      return "Investigate";
  }
};
