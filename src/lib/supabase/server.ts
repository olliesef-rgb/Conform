import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server-side Supabase client for use inside API route handlers. Unlike
// createServiceClient() (service-role key, bypasses RLS entirely), this
// client reads the caller's own session from their auth cookies and uses
// the anon key, so auth.getUser() tells us who is actually making the
// request. Use this to check WHO is calling before using the service-role
// client to do the privileged work.
export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set(name, value, options)
          } catch {
            // Called from a context that can't set cookies (e.g. during
            // static rendering) - safe to ignore here, Next's middleware
            // handles session refresh.
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', { ...options, maxAge: 0 })
          } catch {
            // see note above
          }
        },
      },
    }
  )
}
