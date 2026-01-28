$env:SUPABASE_ACCESS_TOKEN = "sbp_b8f7316029c690a3922251ea6be75c4d1e58c06f"
$functionsDir = "supabase\functions"

$functions = @(
    "ad-writer", "analyze-character-references", "analyze-keyframe-coherence", 
    "analyze-single-reference", "analyze-style-reference", "audio-design",
    "batch-generate", "breakdown-consolidate", "build-canon-pack", 
    "calculate-identity-score", "detect-canon-drift", "develop-structure",
    "engine-shootout", "entity-builder", "episode-consolidate",
    "expand-beats-to-scenes", "expand-scene-card", "extract-wardrobe-lock",
    "forge-analyze-image", "forge-generate-visual", "generate-angle-variants",
    "generate-camera-plan", "generate-dialogues-batch", "generate-episode-detailed",
    "generate-keyframe", "generate-keyframes-batch", "generate-location", 
    "generate-microshot-keyframes", "generate-outfit", "generate-outline-direct",
    "generate-production-script", "generate-scene-cards", "generate-scenes",
    "generate-series-bible", "generate-shot", "generate-shot-details",
    "generate-storyboard", "generate-teasers", "generate-technical-doc",
    "generate-visual-dna", "hollywood-smell-test", "identity-fix-panel",
    "improve-character-qc", "kling_start", "narrative-validate", 
    "parse-script", "polish-episode", "producer-notes", "production-director",
    "qc-keyframe-constraints", "qc-storyboard-identity", "qc-visual-identity",
    "regenerate-storyboard-panel", "render-storyboard-batch", "rescue-block",
    "scene-repair-worker", "scene-worker", "script-doctor", "shot-suggest",
    "showrunner-surgery", "outline-worker", "outline-enrich", "outline-patch",
    "outline-upgrade", "script-breakdown", "script-breakdown-pro",
    "script-generate-episode", "script-generate-screenplay"
)

$total = $functions.Count
$current = 0

foreach ($func in $functions) {
    $current++
    Write-Host "[$current/$total] Deploying: $func"
    npx supabase functions deploy $func --no-verify-jwt 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK: $func"
    } else {
        Write-Host "  FAILED: $func"
    }
}
Write-Host "Deploy complete!"
