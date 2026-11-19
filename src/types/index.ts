// ─── User & Org ───────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'engineer' | 'qa_manager' | 'supervisor' | 'safety_officer'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  organisation_id: string
  created_at: string
}

export interface Organisation {
  id: string
  name: string
  created_at: string
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'archived'

export interface Project {
  id: string
  organisation_id: string
  name: string
  contract_number: string
  client: string                // e.g. "Watercare Services Limited"
  client_type: ClientType
  description: string
  status: ProjectStatus
  created_by: string
  created_at: string
  updated_at: string
}

export type ClientType =
  | 'watercare'
  | 'auckland_transport'
  | 'auckland_council'
  | 'other_council'
  | 'private'
  | 'nzta'
  | 'other'

// ─── Documents (uploaded drawings, specs, standards) ─────────────────────────

export type DocumentType = 'drawing' | 'specification' | 'standard' | 'rfi' | 'other'
export type DocumentScope = 'project' | 'global'  // global = shared standards library

export interface Document {
  id: string
  organisation_id: string
  project_id: string | null     // null = global standards library
  name: string
  filename: string
  storage_path: string
  document_type: DocumentType
  scope: DocumentScope
  client_type: ClientType | null
  parsed_text: string | null
  page_count: number | null
  uploaded_by: string
  created_at: string
}

// Each document is chunked for RAG retrieval
export interface DocumentChunk {
  id: string
  document_id: string
  chunk_index: number
  content: string
  embedding: number[]           // pgvector — 1536 dims
  metadata: Record<string, string>
  created_at: string
}

// ─── ITP ──────────────────────────────────────────────────────────────────────

export type ITPStatus = 'draft' | 'for_review' | 'issued_for_construction' | 'closed' | 'superseded'
export type HoldWitnessType = 'H' | 'W' | 'R' | 'S' | 'M'

export interface ITP {
  id: string
  project_id: string
  organisation_id: string

  // Header fields (matching your GAJV format)
  itp_number: string            // e.g. "GAJV-ITP-00420"
  form_number: string           // e.g. "GAJV-FRM-00003_4.0"
  revision: string              // e.g. "2.0"
  title: string                 // e.g. "Point Erin – Damper Installation"
  work_description: string
  client: string
  contract_number: string
  contractor_names: string[]
  subcontractor_names: string[]
  package_number: string
  workplace_address: string
  chainage: string | null
  work_area: string
  engineer_name: string
  related_cep_number: string | null
  swms_number: string | null
  discipline: Discipline
  status: ITPStatus

  // Linked source documents used for generation
  source_document_ids: string[]

  created_by: string
  created_at: string
  updated_at: string
}

export type Discipline =
  | 'civil'
  | 'structural'
  | 'mechanical'
  | 'electrical'
  | 'pipeline'
  | 'geotechnical'
  | 'architectural'
  | 'environmental'
  | 'other'

export interface ITPActivity {
  id: string
  itp_id: string
  section_name: string          // e.g. "1.0 Preliminaries"
  section_order: number
  activity_number: string       // e.g. "1.1"
  description: string
  responsibility: string        // e.g. "GAJV"
  requirements_reference: string
  conformance_criteria: string
  method: string
  frequency: string
  hold_witness_type: HoldWitnessType
  attendance_required: string[]
  records_checklists: string
  sort_order: number
  created_at: string
}

export interface ITPVersion {
  id: string
  itp_id: string
  version_number: string
  snapshot: ITP & { activities: ITPActivity[] }
  created_by: string
  created_at: string
  change_note: string
}

export interface QAChecklistItem {
  id: string
  itp_id: string
  item_number: number
  label: string
  checked: boolean
  comments: string
}

export interface ConformanceStatement {
  id: string
  itp_id: string
  senior_engineer_name: string
  senior_engineer_signed_at: string | null
  qa_rep_name: string
  qa_rep_signed_at: string | null
  independent_reviewer_name: string | null
  independent_reviewer_signed_at: string | null
}

// ─── SWMS ─────────────────────────────────────────────────────────────────────

export type SWMSStatus = 'draft' | 'for_review' | 'approved' | 'superseded' | 'archived'
export type RiskRating = 'low' | 'medium' | 'high' | 'critical'
export type LikelihoodRating = 1 | 2 | 3 | 4 | 5
export type ConsequenceRating = 1 | 2 | 3 | 4 | 5

export interface SWMS {
  id: string
  project_id: string
  organisation_id: string

  // Header
  swms_number: string           // e.g. "GAJV-SWMS-00583"
  form_number: string
  revision: string
  title: string
  work_description: string
  client: string
  contract_number: string
  work_location: string
  work_area: string
  principal_contractor: string
  subcontractor_names: string[]
  site_supervisor: string
  safety_officer: string | null
  related_itp_number: string | null
  related_cep_number: string | null
  discipline: Discipline
  status: SWMSStatus

  // PPE requirements (checkboxes)
  ppe_requirements: PPEItem[]

  // Plant & equipment
  plant_equipment: string[]

  source_document_ids: string[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface PPEItem {
  id: string
  label: string                 // e.g. "Hard Hat", "Hi-Vis Vest"
  required: boolean
}

export interface SWMSActivity {
  id: string
  swms_id: string
  step_number: string           // e.g. "1", "2a"
  activity_description: string
  hazards: SWMSHazard[]
  initial_risk_rating: RiskRating
  control_measures: string[]
  residual_risk_rating: RiskRating
  responsible_person: string
  legislative_reference: string | null
  sort_order: number
}

export interface SWMSHazard {
  description: string
  likelihood: LikelihoodRating
  consequence: ConsequenceRating
}

export interface SWMSVersion {
  id: string
  swms_id: string
  version_number: string
  snapshot: SWMS & { activities: SWMSActivity[] }
  created_by: string
  created_at: string
  change_note: string
}

export interface SWMSSignoff {
  id: string
  swms_id: string
  signee_name: string
  signee_role: string
  company: string
  signed_at: string
  signature_data: string | null  // base64 for future e-signature
}

// ─── Standards Library ────────────────────────────────────────────────────────

export interface Standard {
  id: string
  organisation_id: string | null  // null = built-in/global
  reference: string               // e.g. "AS/NZS 2032"
  title: string                   // e.g. "Installation of PVC pipe systems"
  client_type: ClientType | null  // if client-specific (Watercare ESS etc)
  document_id: string | null      // linked uploaded document
  description: string
  is_active: boolean
  created_at: string
}

// ─── Generation (AI) ──────────────────────────────────────────────────────────

export interface GenerateITPRequest {
  project_id: string
  work_description: string
  discipline: Discipline
  client_type: ClientType
  document_ids: string[]         // drawings / specs uploaded for this ITP
  additional_context?: string
}

export interface GenerateSWMSRequest {
  project_id: string
  work_description: string
  discipline: Discipline
  client_type: ClientType
  document_ids: string[]
  related_itp_id?: string        // pull ITP activities as context
  additional_context?: string
}

export interface GeneratedITPActivity {
  section: string
  actNo: string
  description: string
  responsibility: string
  reference: string
  conformanceCriteria: string
  method: string
  frequency: string
  type: HoldWitnessType
  attendance: string[]
  records: string
}

export interface GeneratedSWMSActivity {
  stepNumber: string
  activityDescription: string
  hazards: string[]
  initialRisk: RiskRating
  controlMeasures: string[]
  residualRisk: RiskRating
  responsiblePerson: string
  legislativeReference: string
}

// ─── Export ───────────────────────────────────────────────────────────────────

export type ExportFormat = 'xlsx' | 'docx' | 'pdf'

export interface ExportRequest {
  document_type: 'itp' | 'swms'
  document_id: string
  format: ExportFormat
}
