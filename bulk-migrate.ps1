$ErrorActionPreference = "Continue"
$functionsDir = "supabase\functions"

Get-ChildItem -Path $functionsDir -Directory | ForEach-Object {
    $indexPath = Join-Path $_.FullName "index.ts"
    if (Test-Path $indexPath) {
        $content = Get-Content $indexPath -Raw -ErrorAction SilentlyContinue
        if ($content -match "LOVABLE_API_KEY" -and $content -notmatch "lovable-compat") {
            Write-Host "Migrating: $($_.Name)"
            
            # Add import after first import
            if ($content -match '(import .+? from .+?;)') {
                $firstImport = $Matches[1]
                $newImport = "$firstImport`nimport { fetchChatCompletion, hasApiAccess } from `"../_shared/lovable-compat.ts`";"
                $content = $content -replace [regex]::Escape($firstImport), $newImport
            }
            
            # Replace LOVABLE_API_KEY patterns
            $content = $content -replace "const LOVABLE_API_KEY = Deno\.env\.get\([`"']LOVABLE_API_KEY[`"']\);\s*`n\s*if \(!LOVABLE_API_KEY\) \{?\s*`n?\s*throw new Error\([^)]+\);?\s*\}?", "if (!hasApiAccess()) throw new Error('No API key configured');"
            $content = $content -replace "const LOVABLE_API_KEY = Deno\.env\.get\([`"']LOVABLE_API_KEY[`"']\);\s*`n\s*if \(!LOVABLE_API_KEY\) throw new Error\([^)]+\);", "if (!hasApiAccess()) throw new Error('No API key configured');"
            $content = $content -replace "const LOVABLE_API_KEY = Deno\.env\.get\(`"LOVABLE_API_KEY`"\) \|\| '';", "// API key handled by lovable-compat"
            
            Set-Content $indexPath $content -NoNewline
            Write-Host "  Done: $($_.Name)"
        }
    }
}
Write-Host "Migration complete!"
