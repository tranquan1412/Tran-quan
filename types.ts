export type LanguageMode = 'bilingual' | 'vi' | 'en';

export interface BilingualText {
  vi: string;
  en: string;
}

export interface AuditContext {
  site: string;
  area: string;
  auditType: string;
  date: string;
  languageMode: LanguageMode;
}

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type FindingStatus = 'Open' | 'In-progress' | 'Closed' | 'Rejected';
export type VerificationResult = 'Pass' | 'Fail' | 'Pending';

export interface ActionRegisterItem {
  id: string;
  site: string;
  area: string;
  audit_type: string;
  date: string;
  finding_title: BilingualText;
  category: string;
  observation: BilingualText;
  evidence: BilingualText;
  potential_impact: BilingualText;
  compliance_flag: boolean;
  reference_to_verify: BilingualText;
  likelihood: number;
  severity: number;
  risk_score: number;
  risk_level: RiskLevel;
  containment_0_24h: BilingualText;
  corrective_action: BilingualText;
  preventive_action: BilingualText;
  root_cause: BilingualText;
  owner: string;
  owner_confirmed: boolean;
  due_date: string;
  status: FindingStatus;
  status_reason: BilingualText;
  created_at: string;
  updated_at: string;
  completion_date: string | null;
  evidence_links: string[];
  evidence_types: string[];
  verification_result: VerificationResult;
  verifier: string;
  verification_date: string | null;
  verification_method: BilingualText;
  evidence_to_keep: BilingualText;
  effectiveness_review_date: string | null;
  days_to_due: number;
  overdue_flag: boolean;
  photo_index: number;
}

export interface AIResponse {
  markdown_report: string;
  action_register_json: ActionRegisterItem[];
  pdf_report_html: string;
}

export const EVIDENCE_TYPES = [
  "before_after_photo",
  "training_record",
  "maintenance_log",
  "inspection_checklist",
  "measurement_result",
  "permit",
  "SOP_update",
  "test_record",
  "other"
];