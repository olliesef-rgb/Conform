-- QualityDocs Platform — Full Schema
-- Run in Supabase SQL editor or via: supabase db push

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "vector";          -- pgvector for RAG embeddings

-- ─── Enums ────────────────────────────────────────────────────────────────────
create type user_role as enum ('admin','engineer','qa_manager','supervisor','safety_officer');
create type project_status as enum ('active','completed','on_hold','archived');
create type client_type as enum ('watercare','auckland_transport','auckland_council','other_council','nzta','private','other');
create type discipline as enum ('civil','structural','mechanical','electrical','pipeline','geotechnical','architectural','environmental','other');
create type document_type as enum ('drawing','specification','standard','rfi','other');
create type document_scope as enum ('project','global');
create type itp_status as enum ('draft','for_review','issued_for_construction','closed','superseded');
create type swms_status as enum ('draft','for_review','approved','superseded','archived');
create type hold_witness_type as enum ('H','W','R','S','M');
create type risk_rating as enum ('low','medium','high','critical');
create type export_format as enum ('xlsx','docx','pdf');

-- ─── Organisations ────────────────────────────────────────────────────────────
create table organisations (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  created_at   timestamptz default now()
);

-- ─── Profiles (extends Supabase auth.users) ───────────────────────────────────
create table profiles (
  id              uuid primary key references auth.users on delete cascade,
  organisation_id uuid references organisations(id) on delete cascade,
  full_name       text not null,
  role            user_role not null default 'engineer',
  created_at      timestamptz default now()
);

-- ─── Projects ─────────────────────────────────────────────────────────────────
create table projects (
  id              uuid primary key default uuid_generate_v4(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null,
  contract_number text,
  client          text not null,
  client_type     client_type not null default 'other',
  description     text,
  status          project_status not null default 'active',
  created_by      uuid references profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─── Documents ────────────────────────────────────────────────────────────────
-- Covers: project drawings, project specs, global standards, user-uploaded specs
create table documents (
  id              uuid primary key default uuid_generate_v4(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  project_id      uuid references projects(id) on delete cascade,  -- null = global library
  name            text not null,
  filename        text not null,
  storage_path    text not null,         -- Supabase Storage path
  document_type   document_type not null,
  scope           document_scope not null default 'project',
  client_type     client_type,           -- for global standards tied to a specific client
  parsed_text     text,                  -- full extracted text
  page_count      int,
  uploaded_by     uuid references profiles(id),
  created_at      timestamptz default now()
);

-- Document chunks for RAG (one row per ~500 token chunk)
create table document_chunks (
  id           uuid primary key default uuid_generate_v4(),
  document_id  uuid not null references documents(id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  embedding    vector(1536),             -- OpenAI/Anthropic embedding dimensions
  metadata     jsonb default '{}',
  created_at   timestamptz default now()
);

-- Vector similarity index (IVFFlat — good for up to ~1M rows)
create index on document_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ─── Standards Library ────────────────────────────────────────────────────────
create table standards (
  id              uuid primary key default uuid_generate_v4(),
  organisation_id uuid references organisations(id) on delete cascade,  -- null = built-in global
  reference       text not null,         -- e.g. "AS/NZS 2032:2006"
  title           text not null,
  client_type     client_type,           -- if specific to a client
  document_id     uuid references documents(id),
  description     text,
  is_active       bool default true,
  created_at      timestamptz default now()
);

-- Seed: common AS/NZS standards for NZ water/civil construction
insert into standards (reference, title, description) values
  ('AS/NZS 2032','Installation of PVC pipe systems','PE, PVC pressure pipe installation requirements'),
  ('AS/NZS 2033','Installation of polyethylene pipe systems','PE pipe jointing, installation, testing'),
  ('AS/NZS 2566.1','Buried flexible pipelines — Structural design','Buried pipeline structural design'),
  ('AS/NZS 3500.1','Plumbing and drainage — Water services','Water service requirements'),
  ('NZS 4404','Land development and subdivision infrastructure','Civil subdivision infrastructure NZ'),
  ('AS 1170.1','Structural design actions — Permanent, imposed and other actions','Structural loading'),
  ('AS/NZS 4600','Cold-formed steel structures','Cold-formed steel design'),
  ('AS 4100','Steel structures','Structural steel design'),
  ('NZS 3101','Concrete structures standard','Concrete design NZ'),
  ('AS/NZS 1554.1','Structural steel welding','Welding of steel structures'),
  ('AS/NZS 4671','Steel reinforcing materials','Reinforcing steel NZ/AU'),
  ('AS 1657','Fixed platforms, walkways, stairways and ladders','Access structures'),
  ('NZS 6703','Installation of gas burning appliances and equipment','Gas installation'),
  ('AS/NZS 3000','Wiring rules','Electrical wiring NZ/AU'),
  ('AS 2865','Confined spaces','Confined space entry safety');

-- ─── ITPs ─────────────────────────────────────────────────────────────────────
create table itps (
  id                    uuid primary key default uuid_generate_v4(),
  project_id            uuid not null references projects(id) on delete cascade,
  organisation_id       uuid not null references organisations(id) on delete cascade,

  -- Document numbering
  itp_number            text not null,
  form_number           text,
  revision              text not null default '1.0',
  title                 text not null,
  work_description      text,
  discipline            discipline not null default 'civil',
  status                itp_status not null default 'draft',

  -- Header fields
  client                text,
  contract_number       text,
  contractor_names      text[] default '{}',
  subcontractor_names   text[] default '{}',
  package_number        text,
  workplace_address     text,
  chainage              text,
  work_area             text,
  engineer_name         text,
  related_cep_number    text,
  swms_number           text,

  -- AI generation tracking
  source_document_ids   uuid[] default '{}',
  generation_prompt     text,            -- stored for audit/improvement

  -- Embedding of the full ITP for similarity search (used for RAG)
  embedding             vector(1536),

  created_by            uuid references profiles(id),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index on itps using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);
create index on itps (project_id);
create index on itps (discipline);
create index on itps (status);

create table itp_activities (
  id                      uuid primary key default uuid_generate_v4(),
  itp_id                  uuid not null references itps(id) on delete cascade,
  section_name            text not null,    -- e.g. "1.0 Preliminaries"
  section_order           int not null default 0,
  activity_number         text not null,    -- e.g. "1.1"
  description             text not null,
  responsibility          text,
  requirements_reference  text,
  conformance_criteria    text,
  method                  text,
  frequency               text,
  hold_witness_type       hold_witness_type not null default 'W',
  attendance_required     text[] default '{}',
  records_checklists      text,
  sort_order              int not null default 0,
  created_at              timestamptz default now()
);

create index on itp_activities (itp_id);

create table itp_versions (
  id              uuid primary key default uuid_generate_v4(),
  itp_id          uuid not null references itps(id) on delete cascade,
  version_number  text not null,
  snapshot        jsonb not null,           -- full ITP + activities at time of save
  change_note     text,
  created_by      uuid references profiles(id),
  created_at      timestamptz default now()
);

create table itp_qa_checklist (
  id           uuid primary key default uuid_generate_v4(),
  itp_id       uuid not null references itps(id) on delete cascade,
  item_number  int not null,
  label        text not null,
  checked      bool default false,
  comments     text,
  unique(itp_id, item_number)
);

create table itp_conformance (
  id                              uuid primary key default uuid_generate_v4(),
  itp_id                          uuid not null references itps(id) on delete cascade unique,
  senior_engineer_name            text,
  senior_engineer_signed_at       timestamptz,
  qa_rep_name                     text,
  qa_rep_signed_at                timestamptz,
  independent_reviewer_name       text,
  independent_reviewer_signed_at  timestamptz
);

-- ─── SWMS ─────────────────────────────────────────────────────────────────────
create table swms (
  id                    uuid primary key default uuid_generate_v4(),
  project_id            uuid not null references projects(id) on delete cascade,
  organisation_id       uuid not null references organisations(id) on delete cascade,

  swms_number           text not null,
  form_number           text,
  revision              text not null default '1.0',
  title                 text not null,
  work_description      text,
  discipline            discipline not null default 'civil',
  status                swms_status not null default 'draft',

  -- Header
  client                text,
  contract_number       text,
  work_location         text,
  work_area             text,
  principal_contractor  text,
  subcontractor_names   text[] default '{}',
  site_supervisor       text,
  safety_officer        text,
  related_itp_number    text,
  related_cep_number    text,

  -- PPE + plant stored as JSONB for flexibility
  ppe_requirements      jsonb default '[]',
  plant_equipment       text[] default '{}',

  source_document_ids   uuid[] default '{}',
  embedding             vector(1536),

  created_by            uuid references profiles(id),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index on swms using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);
create index on swms (project_id);
create index on swms (discipline);
create index on swms (status);

create table swms_activities (
  id                      uuid primary key default uuid_generate_v4(),
  swms_id                 uuid not null references swms(id) on delete cascade,
  step_number             text not null,
  activity_description    text not null,
  hazards                 jsonb default '[]',       -- [{description, likelihood, consequence}]
  initial_risk_rating     risk_rating not null default 'medium',
  control_measures        text[] default '{}',
  residual_risk_rating    risk_rating not null default 'low',
  responsible_person      text,
  legislative_reference   text,
  sort_order              int not null default 0,
  created_at              timestamptz default now()
);

create index on swms_activities (swms_id);

create table swms_versions (
  id              uuid primary key default uuid_generate_v4(),
  swms_id         uuid not null references swms(id) on delete cascade,
  version_number  text not null,
  snapshot        jsonb not null,
  change_note     text,
  created_by      uuid references profiles(id),
  created_at      timestamptz default now()
);

create table swms_signoffs (
  id             uuid primary key default uuid_generate_v4(),
  swms_id        uuid not null references swms(id) on delete cascade,
  signee_name    text not null,
  signee_role    text,
  company        text,
  signed_at      timestamptz default now(),
  signature_data text         -- base64 for future e-signature support
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table organisations       enable row level security;
alter table profiles            enable row level security;
alter table projects            enable row level security;
alter table documents           enable row level security;
alter table document_chunks     enable row level security;
alter table standards           enable row level security;
alter table itps                enable row level security;
alter table itp_activities      enable row level security;
alter table itp_versions        enable row level security;
alter table itp_qa_checklist    enable row level security;
alter table itp_conformance     enable row level security;
alter table swms                enable row level security;
alter table swms_activities     enable row level security;
alter table swms_versions       enable row level security;
alter table swms_signoffs       enable row level security;

-- Users can only access their own organisation's data
create policy "org_isolation" on projects
  using (organisation_id = (select organisation_id from profiles where id = auth.uid()));

create policy "org_isolation" on itps
  using (organisation_id = (select organisation_id from profiles where id = auth.uid()));

create policy "org_isolation" on swms
  using (organisation_id = (select organisation_id from profiles where id = auth.uid()));

create policy "org_isolation" on documents
  using (organisation_id = (select organisation_id from profiles where id = auth.uid()));

-- Global standards visible to all authenticated users
create policy "standards_readable" on standards
  for select using (auth.role() = 'authenticated');

-- ─── Vector similarity search function ───────────────────────────────────────
-- Finds similar ITPs by embedding (used for RAG context retrieval)
create or replace function match_itps(
  query_embedding vector(1536),
  match_count      int default 5,
  filter_org_id    uuid default null
)
returns table (
  id          uuid,
  title       text,
  discipline  discipline,
  similarity  float
)
language sql stable
as $$
  select
    id,
    title,
    discipline,
    1 - (embedding <=> query_embedding) as similarity
  from itps
  where
    (filter_org_id is null or organisation_id = filter_org_id)
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Finds relevant document chunks (for standards/specs RAG)
create or replace function match_document_chunks(
  query_embedding  vector(1536),
  match_count      int default 8,
  filter_scope     document_scope default null,
  filter_project   uuid default null
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  similarity  float,
  metadata    jsonb
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity,
    dc.metadata
  from document_chunks dc
  join documents d on dc.document_id = d.id
  where
    (filter_scope is null or d.scope = filter_scope)
    and (filter_project is null or d.project_id = filter_project or d.scope = 'global')
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
