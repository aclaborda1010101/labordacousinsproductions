# Download all scripts using curl
$ErrorActionPreference = "SilentlyContinue"

$filmSlugs = Get-Content "film-slugs.json" | ConvertFrom-Json
$seriesSlugs = Get-Content "series-slugs.json" | ConvertFrom-Json

$filmsDir = "C:\Users\aclab\clawd\guiones\peliculas"
$seriesDir = "C:\Users\aclab\clawd\guiones\series"

New-Item -ItemType Directory -Force -Path $filmsDir | Out-Null
New-Item -ItemType Directory -Force -Path $seriesDir | Out-Null

Write-Host "Total: $($filmSlugs.Count) films + $($seriesSlugs.Count) series"

# Download films
Write-Host ""
Write-Host "FILMS:"
$ok = 0; $skip = 0; $fail = 0
for ($i = 0; $i -lt $filmSlugs.Count; $i++) {
    $slug = $filmSlugs[$i]
    $file = "$filmsDir\$slug.pdf"
    $url = "https://assets.scriptslug.com/live/pdf/scripts/$slug.pdf"
    
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        if ($size -gt 5000) {
            $skip++
            continue
        }
        Remove-Item $file -Force
    }
    
    $result = & C:\Windows\System32\curl.exe -s -o $file -w "%{http_code}" --connect-timeout 30 --max-time 60 -A "Mozilla/5.0" $url 2>$null
    
    if ($result -eq "200" -and (Test-Path $file)) {
        $ok++
    } else {
        $fail++
        if (Test-Path $file) { Remove-Item $file -Force }
    }
    
    if (($i + 1) % 100 -eq 0) {
        Write-Host "  $($i+1)/$($filmSlugs.Count) - new:$ok exist:$skip fail:$fail"
    }
    
    Start-Sleep -Milliseconds 200
}
Write-Host "  FILMS DONE: new:$ok exist:$skip fail:$fail"

# Download series
Write-Host ""
Write-Host "SERIES:"
$ok = 0; $skip = 0; $fail = 0
for ($i = 0; $i -lt $seriesSlugs.Count; $i++) {
    $slug = $seriesSlugs[$i]
    $file = "$seriesDir\$slug.pdf"
    $url = "https://assets.scriptslug.com/live/pdf/scripts/$slug.pdf"
    
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        if ($size -gt 5000) {
            $skip++
            continue
        }
        Remove-Item $file -Force
    }
    
    $result = & C:\Windows\System32\curl.exe -s -o $file -w "%{http_code}" --connect-timeout 30 --max-time 60 -A "Mozilla/5.0" $url 2>$null
    
    if ($result -eq "200" -and (Test-Path $file)) {
        $ok++
    } else {
        $fail++
        if (Test-Path $file) { Remove-Item $file -Force }
    }
    
    if (($i + 1) % 100 -eq 0) {
        Write-Host "  $($i+1)/$($seriesSlugs.Count) - new:$ok exist:$skip fail:$fail"
    }
    
    Start-Sleep -Milliseconds 200
}
Write-Host "  SERIES DONE: new:$ok exist:$skip fail:$fail"

Write-Host ""
Write-Host "COMPLETE"
