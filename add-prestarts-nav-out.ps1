$raw = Get-Content -LiteralPath 'src\components\ui.tsx' -Raw
$c = $raw -replace "`r`n", "`n"

# Anchor: the existing Safety nav link line, as it appears verbatim in the source.
# Built as a single-quoted PowerShell string so backticks and $ stay literal;
# embedded single quotes are escaped by doubling ('').
$anchor = '    { href: `/projects/${projectId}/safety`,   icon: <Icon.safety />,    label: ''Safety'',    key: ''safety'' },'

$sidebarFnAnchor = 'function Sidebar({ projectId, activeSection }: { projectId?: string; activeSection?: string }) {'

$missing = @()
if (-not $c.Contains($anchor)) { $missing += 'Safety nav link line' }
if (-not $c.Contains($sidebarFnAnchor)) { $missing += 'Sidebar function signature' }

if ($missing.Count -gt 0) {
  Write-Host "ANCHOR(S) NOT FOUND - ABORTING, no changes made. Missing:" -ForegroundColor Red
  foreach ($m in $missing) { Write-Host " - $m" -ForegroundColor Red }
  Write-Host "`nThis window will NOT close. Copy everything above and send it back." -ForegroundColor Yellow
} else {
  # 1. Add a small local PreStartIcon component just before the Sidebar function
  $iconComponent = @'
function PreStartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5.5 4.5h5M5.5 7.5h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

'@
  $c = $c.Replace($sidebarFnAnchor, $iconComponent + $sidebarFnAnchor)

  # 2. Insert the Pre-Starts nav link right after the Safety link
  $newLinkLine = '    { href: `/projects/${projectId}/prestarts`, icon: <PreStartIcon />, label: ''Pre-Starts'', key: ''prestarts'' },'
  $replacement = $anchor + "`n" + $newLinkLine
  $c = $c.Replace($anchor, $replacement)

  Set-Content -LiteralPath 'src\components\ui.tsx' -Value $c -Encoding UTF8
  Write-Host "DONE - Pre-Starts added to sidebar nav" -ForegroundColor Green
}

Write-Host "`nPress Enter to close this window..." -ForegroundColor Cyan
Read-Host
