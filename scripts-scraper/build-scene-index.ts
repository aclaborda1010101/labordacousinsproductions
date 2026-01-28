/**
 * Build Scene Index - Creates genre-indexed scene examples for few-shot learning
 * Run with: npx tsx build-scene-index.ts
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

interface ParsedScene {
  scene_number: number;
  slugline: string;
  action_text: string;
  characters: string[];
  dialogue_count: number;
  word_count: number;
}

interface ParsedScript {
  slug: string;
  title: string;
  genre: string;
  format: string;
  scenes_count: number;
  scenes: ParsedScene[];
}

interface IndexedScene {
  script_slug: string;
  script_title: string;
  genre: string;
  scene_number: number;
  slugline: string;
  content: string;
  word_count: number;
  quality_score: number;
}

interface SceneIndex {
  created_at: string;
  total_scripts: number;
  total_scenes: number;
  genres: Record<string, IndexedScene[]>;
}

// Quality scoring - prioritize scenes with good content
function scoreScene(scene: ParsedScene): number {
  let score = 0;
  
  // Has slugline
  if (scene.slugline && scene.slugline.length > 5) score += 10;
  
  // Has action text (the actual content)
  if (scene.action_text && scene.action_text.length > 100) {
    score += Math.min(scene.action_text.length / 100, 30);
  }
  
  // Word count sweet spot (200-800 words is good)
  if (scene.word_count >= 200 && scene.word_count <= 800) {
    score += 20;
  } else if (scene.word_count > 800) {
    score += 10; // Still useful but might be too long
  }
  
  // Penalize scenes that look like parser errors
  if (scene.slugline?.includes('FLASHBACK') || scene.slugline?.includes('FADE')) {
    score += 5; // These often have good structure
  }
  
  return score;
}

// Format scene for prompt injection
function formatSceneForPrompt(scene: ParsedScene): string {
  let content = '';
  
  if (scene.slugline) {
    content += scene.slugline.trim() + '\n\n';
  }
  
  if (scene.action_text) {
    content += scene.action_text.trim();
  }
  
  return content.trim();
}

async function buildIndex() {
  const parsedDir = join(process.cwd(), 'parsed');
  const outputPath = join(process.cwd(), 'scene-index.json');
  
  console.log('📂 Reading parsed scripts from:', parsedDir);
  
  const files = await readdir(parsedDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`📚 Found ${jsonFiles.length} parsed scripts`);
  
  const index: SceneIndex = {
    created_at: new Date().toISOString(),
    total_scripts: 0,
    total_scenes: 0,
    genres: {}
  };
  
  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(parsedDir, file), 'utf-8');
      const script: ParsedScript = JSON.parse(content);
      
      if (!script.genre || !script.scenes?.length) continue;
      
      const genre = script.genre.toLowerCase();
      
      if (!index.genres[genre]) {
        index.genres[genre] = [];
      }
      
      // Score and collect scenes
      for (const scene of script.scenes) {
        const score = scoreScene(scene);
        
        // Only keep scenes with decent content
        if (score >= 20 && scene.word_count >= 100) {
          const indexed: IndexedScene = {
            script_slug: script.slug,
            script_title: script.title,
            genre: genre,
            scene_number: scene.scene_number,
            slugline: scene.slugline || '',
            content: formatSceneForPrompt(scene),
            word_count: scene.word_count,
            quality_score: score
          };
          
          index.genres[genre].push(indexed);
          index.total_scenes++;
        }
      }
      
      index.total_scripts++;
      
    } catch (err) {
      // Skip invalid files
    }
  }
  
  // Sort scenes by quality within each genre and keep top 50 per genre
  for (const genre of Object.keys(index.genres)) {
    index.genres[genre] = index.genres[genre]
      .sort((a, b) => b.quality_score - a.quality_score)
      .slice(0, 50);
  }
  
  // Also create a "top" index for best scenes across all genres
  const allScenes = Object.values(index.genres).flat();
  index.genres['_top'] = allScenes
    .sort((a, b) => b.quality_score - a.quality_score)
    .slice(0, 100);
  
  // Write index
  await writeFile(outputPath, JSON.stringify(index, null, 2));
  
  console.log('\n✅ Index built successfully!');
  console.log(`   Scripts processed: ${index.total_scripts}`);
  console.log(`   Total scenes indexed: ${index.total_scenes}`);
  console.log('\n📊 Scenes per genre:');
  
  for (const [genre, scenes] of Object.entries(index.genres)) {
    if (genre !== '_top') {
      console.log(`   ${genre}: ${scenes.length}`);
    }
  }
  
  console.log(`\n💾 Saved to: ${outputPath}`);
}

buildIndex().catch(console.error);
