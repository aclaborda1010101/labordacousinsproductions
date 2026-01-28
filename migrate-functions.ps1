# PowerShell script to migrate all edge functions to use lovable-compat.ts
$functionsPath = "C:\Users\aclab\clawd\labordacousinsproductions\supabase\functions"

# Get all functions that still use LOVABLE_API_KEY
$functions = Get-ChildItem -Path $functionsPath -Recurse -Filter "index.ts" | 
    Select-String -Pattern "LOVABLE_API_KEY" | 
    Select-Object -Property Path -Unique

Write-Host "Found $($functions.Count) functions to migrate"

foreach ($func in $functions) {
    $filePath = $func.Path
    $funcName = Split-Path -Leaf (Split-Path -Parent $filePath)
    Write-Host "Processing: $funcName"
    
    $content = Get-Content $filePath -Raw
    $modified = $false
    
    # 1. Add import if not present
    if ($content -notmatch "lovable-compat\.ts") {
        # Find the last import statement
        if ($content -match '(import[^;]+from\s+[''"][^''"]+[''"];?\s*\n)(?!import)') {
            $lastImport = $Matches[0]
            $importLine = 'import { fetchChatCompletion, hasApiAccess } from "../_shared/lovable-compat.ts";'
            $content = $content -replace [regex]::Escape($lastImport), "$lastImport$importLine`n"
            $modified = $true
            Write-Host "  + Added import"
        }
    }
    
    # 2. Replace API key check patterns
    $patterns = @(
        # Pattern 1: const LOVABLE_API_KEY = ... if (!LOVABLE_API_KEY) throw new Error
        @{
            Find = 'const LOVABLE_API_KEY = Deno\.env\.get\([''"]LOVABLE_API_KEY[''"]\);\s*\n\s*if \(!LOVABLE_API_KEY\) \{\s*\n\s*throw new Error\([^)]+\);\s*\n\s*\}'
            Replace = "if (!hasApiAccess()) {`n    throw new Error('No API key configured');`n  }"
        },
        # Pattern 2: Simple check without braces
        @{
            Find = 'const LOVABLE_API_KEY = Deno\.env\.get\([''"]LOVABLE_API_KEY[''"]\);\s*\n\s*if \(!LOVABLE_API_KEY\) throw new Error\([^)]+\);'
            Replace = "if (!hasApiAccess()) throw new Error('No API key configured');"
        },
        # Pattern 3: Just the assignment (when check is separate)
        @{
            Find = 'const LOVABLE_API_KEY = Deno\.env\.get\([''"]LOVABLE_API_KEY[''"]\);'
            Replace = '// API key handled by lovable-compat'
        }
    )
    
    foreach ($pattern in $patterns) {
        if ($content -match $pattern.Find) {
            $content = $content -replace $pattern.Find, $pattern.Replace
            $modified = $true
            Write-Host "  + Replaced API key check"
        }
    }
    
    # 3. Replace fetch calls to lovable gateway
    $fetchPattern = @'
fetch\(['"]https://ai\.gateway\.lovable\.dev/v1/chat/completions['"],\s*\{\s*method:\s*[''"]POST[''"],[^}]+headers:\s*\{[^}]+Authorization[^}]+\},[^}]+body:\s*JSON\.stringify\(([^)]+)\),[^}]*\}\)
'@
    
    # Simpler approach: replace common fetch patterns
    if ($content -match "fetch\([`"']https://ai\.gateway\.lovable\.dev") {
        # This is tricky - we need to carefully replace fetch calls
        # For now, mark these files for manual review
        Write-Host "  ! Has fetch calls - may need manual review"
    }
    
    if ($modified) {
        Set-Content -Path $filePath -Value $content -NoNewline
        Write-Host "  ✓ Saved changes to $funcName"
    }
}

Write-Host "`nMigration complete!"
