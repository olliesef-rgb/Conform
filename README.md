# QualityDocs — ITP & SWMS Platform

AI-powered construction quality documentation platform for NZ/AU construction.
Generates ITPs and SWMS documents from drawings, specs, and a library of past examples.

---

## Stack

- **Frontend**: Next.js 14 (App Router) + Tailwind CSS
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI Generation**: Anthropic Claude (claude-sonnet-4)
- **Embeddings/RAG**: Voyage AI (voyage-large-2, 1536 dims)
- **Auth**: Supabase Auth
- **File Storage**: Supabase Storage
- **Hosting**: Vercel

---

## Setup (Day 1)

### 1. Supabase project
1. Go to supabase.com → New project
2. In SQL editor, run `supabase/migrations/001_initial_schema.sql`
3. In Storage, create a bucket called `documents` (set to private)
4. Copy your project URL and keys

### 2. API keys
1. **Anthropic**: platform.anthropic.com → API keys
2. **Voyage AI**: voyageai.com → free account → API keys

### 3. Local setup
```bash
git clone <your-repo>
cd qualitydocs
npm install
cp .env.local.example .env.local
# Fill in all values in .env.local
npm run dev
```

### 4. Process your ITP library (run once)
```bash
# Put your 343 ITP PDFs in ./data/itps/
mkdir -p data/itps
# Copy your PDFs there, then:
ITP_FOLDER=./data/itps ORG_ID=your-org-uuid npm run process:itps
```

### 5. Process your SWMS library (run once)
```bash
# Put your 489 SWMS PDFs in ./data/swms/
mkdir -p data/swms
SWMS_FOLDER=./data/swms ORG_ID=your-org-uuid npm run process:swms
```

Both scripts are **safe to re-run** — they skip already-processed files.

---

## Adding standards/specs over time

### Option A: Via the UI (for users)
- Go to any project → Documents → Upload Spec
- Choose scope: "This project only" or "Global library (all projects)"
- The system chunks and embeds it automatically
- It's immediately available for future ITP/SWMS generation

### Option B: Batch upload (for admins)
```bash
# Add your AS/NZS PDFs or Watercare ESS docs to ./data/standards/
npm run process:standards
```

### Adding Watercare ESS / AT specs
When you source these, upload them as "Global" documents with `client_type` set to
`watercare` or `auckland_transport`. The RAG system will automatically prefer
client-specific standards when generating ITPs for that client.

---

## User Roles

| Role | Can do |
|------|--------|
| `admin` | Everything + manage users, org settings |
| `engineer` | Create/edit ITPs and SWMS, upload documents |
| `qa_manager` | All of above + approve, close lots, manage versions |
| `supervisor` | View + sign off SWMS, view ITPs |
| `safety_officer` | Create/edit SWMS, view ITPs |

---

## Project Structure

```
src/
├── app/
│   ├── auth/              # Login, signup
│   ├── dashboard/         # Projects overview
│   ├── projects/[id]/
│   │   ├── itps/[itpId]/  # ITP editor
│   │   └── swms/[swmsId]/ # SWMS editor
│   └── api/               # API routes
│       ├── generate/      # Claude generation endpoints
│       ├── itps/          # ITP CRUD
│       ├── swms/          # SWMS CRUD
│       ├── documents/     # Upload + process documents
│       └── standards/     # Standards library
├── components/
│   ├── itp/               # ITP editor, table, export
│   ├── swms/              # SWMS editor, risk matrix, signoffs
│   └── shared/            # Upload zone, document picker
├── lib/
│   ├── supabase/          # DB client
│   ├── claude/            # Generation pipeline (RAG)
│   ├── parsers/           # PDF/DOCX text extraction
│   └── embeddings/        # Voyage AI embedding calls
├── types/                 # All TypeScript interfaces
└── hooks/                 # React hooks

scripts/
├── processITPs.ts         # Batch process 343 ITP PDFs
├── processSWMS.ts         # Batch process 489 SWMS PDFs
└── processStandards.ts    # Batch process standards library

supabase/migrations/
└── 001_initial_schema.sql # Full DB schema with pgvector
```

---

## How the AI generation works

```
User inputs work scope + uploads drawings/specs
         ↓
Generate embedding of the query
         ↓
Vector search → top 4 similar past ITPs/SWMS from your library
         ↓
Vector search → top 6 relevant chunks from standards library
         ↓
Claude receives: query + examples + relevant standards
         ↓
Claude outputs structured JSON (ITP activities / SWMS steps)
         ↓
User reviews and edits in the browser
         ↓
Export as XLSX / DOCX / PDF
```

The more ITPs and SWMS you process, the better the output quality.

---

## Cost estimates

| Service | Usage | Cost |
|---------|-------|------|
| Voyage AI | One-time: process 832 docs ≈ 10M tokens | ~$1.20 |
| Voyage AI | Ongoing: per generation query | ~$0.0001 |
| Claude Sonnet | Per ITP generated (≈4000 tokens) | ~$0.02 |
| Claude Sonnet | Per SWMS generated (≈4000 tokens) | ~$0.02 |
| Supabase | Free tier covers early stage | $0 |
| Vercel | Free tier covers early stage | $0 |

Generating 100 ITPs ≈ $2 in Claude API costs.
