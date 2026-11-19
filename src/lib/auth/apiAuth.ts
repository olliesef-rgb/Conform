import { NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

// Shared auth/ownership checks for API routes. Every route that reads or
// writes organisation data must call one of these BEFORE touching the
// service-role client, so that an unauthenticated caller - or a caller from
// a different organisation - gets rejected instead of silently served
// someone else's data.

export type AuthFailure = { ok: false; status: number; message: string }
export type AuthSuccess = { ok: true; userId: string; organisationId: string }
export type AuthResult = AuthSuccess | AuthFailure

// Confirms there's a valid logged-in session and resolves that user's
// organisation. This is the base check every route needs.
export async function getAuthedUser(): Promise<AuthResult> {
  const supabase = createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, status: 401, message: 'You must be signed in to do this.' }
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('organisation_id')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile?.organisation_id) {
    return { ok: false, status: 403, message: 'No organisation found for this account.' }
  }

  return { ok: true, userId: user.id, organisationId: profile.organisation_id }
}

// Confirms the signed-in caller's organisation actually owns the given
// project. Use this for any route keyed directly by a projectId.
export async function requireProjectOrg(projectId: string | null | undefined): Promise<AuthResult> {
  const auth = await getAuthedUser()
  if (!auth.ok) return auth
  // The project's tsconfig has "strict": false, which turns off the
  // narrowing TypeScript would normally do here after the guard above -
  // without it, `auth` still type-checks as the full AuthResult union, so
  // an explicit cast is needed to read the success fields safely.
  const authed = auth as AuthSuccess

  if (!projectId) {
    return { ok: false, status: 400, message: 'Project ID is required.' }
  }

  const supabase = createServerSupabase()
  const { data: project, error } = await supabase
    .from('projects')
    .select('organisation_id')
    .eq('id', projectId)
    .single()

  if (error || !project) {
    return { ok: false, status: 404, message: 'Project not found.' }
  }

  if (project.organisation_id !== authed.organisationId) {
    return { ok: false, status: 403, message: 'You do not have access to this project.' }
  }

  return authed
}

// Confirms the signed-in caller's organisation owns the project that a
// given record belongs to. Use this for routes keyed by a record ID
// (itpId, lotId, prestartId, swmsId, observationId, etc) where the table
// has its own project_id column.
export async function requireRecordProjectAccess(
  table: string,
  idColumn: string,
  idValue: string
): Promise<AuthResult> {
  const auth = await getAuthedUser()
  if (!auth.ok) return auth
  const authed = auth as AuthSuccess

  const supabase = createServerSupabase()
  const { data: record, error } = await supabase
    .from(table)
    .select('project_id')
    .eq(idColumn, idValue)
    .single()

  if (error || !record?.project_id) {
    return { ok: false, status: 404, message: 'Record not found.' }
  }

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('organisation_id')
    .eq('id', record.project_id)
    .single()

  if (projErr || !project) {
    return { ok: false, status: 404, message: 'Project not found.' }
  }

  if (project.organisation_id !== authed.organisationId) {
    return { ok: false, status: 403, message: 'You do not have access to this record.' }
  }

  return authed
}

// Turns a failed AuthResult into the NextResponse a route handler returns.
// Accepts the whole AuthResult union (not just AuthFailure) so callers can
// write `if (!auth.ok) return authErrorResponse(auth)`. Uses an explicit
// cast rather than relying on narrowing, because this project's tsconfig
// has "strict": false, which turns off the narrowing TypeScript would
// otherwise do automatically after an `if (auth.ok)` check.
export function authErrorResponse(auth: AuthResult) {
  if (auth.ok) {
    // Should never happen - a route only calls this after checking !auth.ok.
    return NextResponse.json({ error: 'Unexpected auth state.' }, { status: 500 })
  }
  const failure = auth as AuthFailure
  return NextResponse.json({ error: failure.message }, { status: failure.status })
}
