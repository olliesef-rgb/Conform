$raw1 = Get-Content -LiteralPath 'src\app\projects\[id]\page.tsx' -Raw
$c1 = $raw1 -replace "`r`n", "`n"

$old = 'router.push(`/projects/${id}/safety/observations`)'
$new = 'router.push(`/projects/${id}/safety?tab=observations`)'

if (-not $c1.Contains($old)) {
  Write-Host "ANCHOR NOT FOUND in page.tsx - no changes made there." -ForegroundColor Red
} else {
  $c1 = $c1.Replace($old, $new)
  Set-Content -LiteralPath 'src\app\projects\[id]\page.tsx' -Value $c1 -Encoding UTF8
  Write-Host "page.tsx: Overview 'Open register' link now points to the Observations tab" -ForegroundColor Green
}

# Turn the old standalone observations list page into a redirect, so any
# existing bookmark/link still lands somewhere useful instead of a dead/duplicate page.
$redirectContent = @'
'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function SafetyObservationsRedirect() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  useEffect(() => {
    router.replace(`/projects/${projectId}/safety?tab=observations`)
  }, [projectId])

  return null
}
'@

Set-Content -LiteralPath 'src\app\projects\[id]\safety\observations\page.tsx' -Value $redirectContent -Encoding UTF8
Write-Host "observations/page.tsx: now redirects to the Safety page's Observations tab" -ForegroundColor Green

Write-Host "`nPress Enter to close this window..." -ForegroundColor Cyan
Read-Host
