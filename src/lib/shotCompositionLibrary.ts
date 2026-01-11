/**
 * SHOT COMPOSITION LIBRARY
 * Professional visual composition rules for cinematic production
 */

export interface CompositionRule {
  id: string;
  name: string;
  category: 'framing' | 'depth' | 'balance' | 'leading' | 'color' | 'special';
  description: string;
  visualEffect: string;
  emotionalImpact: string;
  useCase: string;
  promptInjection: string;
  technicalNotes: string;
  exampleFilms: string[];
  commonMistakes: string[];
}

export const COMPOSITION_LIBRARY: Record<string, CompositionRule> = {
  // ===================
  // FRAMING RULES
  // ===================
  rule_of_thirds: {
    id: 'rule_of_thirds',
    name: 'Rule of Thirds',
    category: 'framing',
    description: 'Subject placed at intersection of imaginary 3x3 grid lines',
    visualEffect: 'Balanced asymmetry, natural eye flow, professional framing',
    emotionalImpact: 'Comfortable, aesthetically pleasing, dynamic balance',
    useCase: 'Most shots - universal foundational composition',
    promptInjection: 'COMPOSITION: Rule of thirds - subject positioned at intersection point of grid, not dead center',
    technicalNotes: 'Eyes typically on upper third line. Horizons on upper or lower third.',
    exampleFilms: ['Every professionally shot film'],
    commonMistakes: ['Centering subjects without purpose', 'Ignoring grid for secondary elements'],
  },

  golden_ratio: {
    id: 'golden_ratio',
    name: 'Golden Ratio / Fibonacci',
    category: 'framing',
    description: 'Subject placed according to 1.618 mathematical ratio',
    visualEffect: 'Organic, naturally pleasing, sophisticated composition',
    emotionalImpact: 'Harmonious, refined, artistically elevated',
    useCase: 'Artistic shots, key moments, when more refinement needed than rule of thirds',
    promptInjection: 'COMPOSITION: Golden ratio - subject at phi point (approximately 1:1.618 from edge)',
    technicalNotes: 'Slightly different from rule of thirds. More refined placement.',
    exampleFilms: ['The Tree of Life', 'Blade Runner 2049'],
    commonMistakes: ['Overthinking it - often similar to rule of thirds'],
  },

  center_dominant: {
    id: 'center_dominant',
    name: 'Center Dominant',
    category: 'framing',
    description: 'Subject deliberately centered in frame',
    visualEffect: 'Formal, confrontational, symmetrical power',
    emotionalImpact: 'Direct, powerful, iconic, confrontational',
    useCase: 'Power shots, iconic moments, symmetrical compositions, facing camera directly',
    promptInjection: 'COMPOSITION: Center dominant - subject perfectly centered, breaking rule of thirds for impact',
    technicalNotes: 'Works best with symmetry. Deliberate choice, not default.',
    exampleFilms: ['Stanley Kubrick films', 'Wes Anderson films', 'Mad Max: Fury Road'],
    commonMistakes: ['Using it by default rather than intentionally'],
  },

  headroom: {
    id: 'headroom',
    name: 'Headroom',
    category: 'framing',
    description: 'Appropriate space above subject\'s head',
    visualEffect: 'Proper framing, room to breathe, professional look',
    emotionalImpact: 'Comfortable viewing, respect for subject',
    useCase: 'All shots with people - fundamental requirement',
    promptInjection: 'COMPOSITION: Proper headroom - small comfortable space above head, not too much, not too little',
    technicalNotes: 'Eyes usually on upper third line. Too much headroom looks amateur.',
    exampleFilms: ['Every professional production'],
    commonMistakes: ['Too much headroom (empty space)', 'Too little headroom (cropping head)'],
  },

  lead_room: {
    id: 'lead_room',
    name: 'Lead Room / Nose Room',
    category: 'framing',
    description: 'Space in the direction subject is facing or moving',
    visualEffect: 'Natural flow, implies direction and intent',
    emotionalImpact: 'Comfortable, suggests movement or attention direction',
    useCase: 'Profile shots, moving subjects, directional gaze',
    promptInjection: 'COMPOSITION: Lead room - more space in direction subject faces/moves than behind them',
    technicalNotes: 'Subject typically in opposite third from their looking direction.',
    exampleFilms: ['Every properly composed film'],
    commonMistakes: ['Subject looking/moving toward frame edge (feels trapped)'],
  },

  negative_space: {
    id: 'negative_space',
    name: 'Negative Space',
    category: 'framing',
    description: 'Deliberate use of empty space around subject',
    visualEffect: 'Isolation, emphasis, breathing room, artistic',
    emotionalImpact: 'Loneliness, contemplation, emphasis on subject',
    useCase: 'Emotional isolation, minimalist aesthetic, emphasis',
    promptInjection: 'COMPOSITION: Strong negative space - subject small in frame surrounded by empty/simple space',
    technicalNotes: 'Empty space should be intentional and meaningful.',
    exampleFilms: ['Her', 'Lost in Translation', 'Nomadland'],
    commonMistakes: ['Accidental negative space that feels like framing error'],
  },

  tight_framing: {
    id: 'tight_framing',
    name: 'Tight Framing',
    category: 'framing',
    description: 'Subject fills most of frame with minimal space',
    visualEffect: 'Intensity, claustrophobia, intimate, urgent',
    emotionalImpact: 'Tension, intimacy, confrontation, urgency',
    useCase: 'Close-ups, emotional peaks, tension, crowded feeling',
    promptInjection: 'COMPOSITION: Tight framing - subject fills frame, minimal headroom and lead room, claustrophobic',
    technicalNotes: 'Used to create tension or intimacy. Deliberate discomfort.',
    exampleFilms: ['Uncut Gems', '12 Years a Slave', 'Whiplash'],
    commonMistakes: ['Accidentally tight when should be comfortable'],
  },

  // ===================
  // DEPTH RULES
  // ===================
  foreground_interest: {
    id: 'foreground_interest',
    name: 'Foreground Interest',
    category: 'depth',
    description: 'Element placed in foreground to create depth layers',
    visualEffect: 'Three-dimensional depth, visual interest, layered composition',
    emotionalImpact: 'Immersion, discovery, richness of space',
    useCase: 'Establishing shots, adding depth, visual complexity',
    promptInjection: 'COMPOSITION: Foreground interest - blurred or semi-visible element in near foreground, subject in mid-ground',
    technicalNotes: 'Can be out of focus. Frames subject and adds depth.',
    exampleFilms: ['The Revenant', 'Blade Runner 2049', 'Roger Deakins films'],
    commonMistakes: ['Foreground distracting from subject', 'Too sharp foreground competing for attention'],
  },

  layers: {
    id: 'layers',
    name: 'Depth Layers / Staging in Depth',
    category: 'depth',
    description: 'Multiple elements at different distances creating depth',
    visualEffect: 'Rich, theatrical, dimensional, complex staging',
    emotionalImpact: 'Immersion, story density, visual sophistication',
    useCase: 'Complex scenes, multiple characters, rich environments',
    promptInjection: 'COMPOSITION: Depth layers - foreground, mid-ground, and background all contain meaningful elements',
    technicalNotes: 'Classic staging technique. Multiple planes of action.',
    exampleFilms: ['Citizen Kane', 'The Grand Budapest Hotel', 'Master and Commander'],
    commonMistakes: ['Flat staging with all elements on same plane'],
  },

  deep_focus: {
    id: 'deep_focus',
    name: 'Deep Focus',
    category: 'depth',
    description: 'Everything from foreground to background in sharp focus',
    visualEffect: 'Everything visible, democratic focus, theatrical',
    emotionalImpact: 'Objective, viewer chooses focus, richness',
    useCase: 'Ensemble scenes, showing relationships across distances, democratic viewing',
    promptInjection: 'COMPOSITION: Deep focus - both foreground and background in sharp focus, no selective blur',
    technicalNotes: 'Requires small aperture and lots of light. Welles signature.',
    exampleFilms: ['Citizen Kane', 'The Grand Budapest Hotel', 'Pan\'s Labyrinth'],
    commonMistakes: ['Using when shallow focus would be more effective'],
  },

  shallow_focus: {
    id: 'shallow_focus',
    name: 'Shallow Depth of Field',
    category: 'depth',
    description: 'Only subject in focus, everything else blurred',
    visualEffect: 'Isolation of subject, cinematic look, emphasis',
    emotionalImpact: 'Intimacy, focus, emotional connection to subject',
    useCase: 'Close-ups, portraits, isolating subject from background',
    promptInjection: 'COMPOSITION: Shallow focus - subject sharp, background and foreground beautifully blurred (bokeh)',
    technicalNotes: 'Wide aperture (low f-stop). Creates cinematic "bokeh".',
    exampleFilms: ['Most modern films for emotional moments'],
    commonMistakes: ['Focus miss (wrong thing sharp)', 'Overuse making everything feel same'],
  },

  depth_compression: {
    id: 'depth_compression',
    name: 'Depth Compression',
    category: 'depth',
    description: 'Long lens compresses apparent distance between elements',
    visualEffect: 'Elements appear closer together, flattened space',
    emotionalImpact: 'Crowded feeling, connection between distant elements, surveillance',
    useCase: 'Showing crowds, connecting distant elements, intimate telephoto portraits',
    promptInjection: 'COMPOSITION: Depth compression - telephoto lens flattens space, background appears closer to subject',
    technicalNotes: 'Long focal length (85mm+). Flattens perspective.',
    exampleFilms: ['Heat', 'Telephoto sequences in any film'],
    commonMistakes: ['Unintended compression when wide lens needed'],
  },

  // ===================
  // BALANCE RULES
  // ===================
  symmetry: {
    id: 'symmetry',
    name: 'Symmetry',
    category: 'balance',
    description: 'Frame balanced equally on both sides of center axis',
    visualEffect: 'Formal, controlled, powerful, architectural',
    emotionalImpact: 'Order, perfection, control, OCD satisfaction',
    useCase: 'Wes Anderson style, formal scenes, power shots, architecture',
    promptInjection: 'COMPOSITION: Perfect symmetry - frame is mirror image left to right, dead center subject',
    technicalNotes: 'Requires careful positioning. Even small asymmetry is noticeable.',
    exampleFilms: ['Wes Anderson films', 'Stanley Kubrick films', '2001: A Space Odyssey'],
    commonMistakes: ['Almost symmetrical (worse than intentional asymmetry)'],
  },

  asymmetry: {
    id: 'asymmetry',
    name: 'Dynamic Asymmetry',
    category: 'balance',
    description: 'Intentionally unbalanced composition creating tension',
    visualEffect: 'Dynamic, tense, visually interesting, natural',
    emotionalImpact: 'Tension, unease, energy, visual interest',
    useCase: 'Most shots - natural and dynamic feeling',
    promptInjection: 'COMPOSITION: Dynamic asymmetry - subject off-center, balanced by visual weight of other elements',
    technicalNotes: 'Balance through visual weight, not mirror symmetry.',
    exampleFilms: ['Most films - the natural approach'],
    commonMistakes: ['Unintentional imbalance feeling awkward'],
  },

  visual_weight: {
    id: 'visual_weight',
    name: 'Visual Weight Balance',
    category: 'balance',
    description: 'Balancing frame using relative visual weight of elements',
    visualEffect: 'Equilibrium despite asymmetry, sophisticated balance',
    emotionalImpact: 'Harmony, sophistication, intentional arrangement',
    useCase: 'Complex compositions, multiple subjects, balancing with color/light',
    promptInjection: 'COMPOSITION: Visual weight balance - larger element balanced by smaller bright/colorful element',
    technicalNotes: 'Bright, colorful, or human elements have more weight.',
    exampleFilms: ['Cinematography in general'],
    commonMistakes: ['Top-heavy or side-heavy frames that feel off'],
  },

  tension_points: {
    id: 'tension_points',
    name: 'Tension Points',
    category: 'balance',
    description: 'Placing elements at points of natural visual tension',
    visualEffect: 'Dynamic, energetic, eyes move around frame',
    emotionalImpact: 'Unease, energy, conflict, dynamism',
    useCase: 'Action, conflict, energy, preventing static feeling',
    promptInjection: 'COMPOSITION: Tension points - key elements placed at rule-of-thirds intersections, creating diagonal energy',
    technicalNotes: 'Elements at multiple intersection points create visual energy.',
    exampleFilms: ['Action sequences', 'Conflict scenes'],
    commonMistakes: ['Too many tension points creating chaos'],
  },

  // ===================
  // LEADING RULES
  // ===================
  leading_lines: {
    id: 'leading_lines',
    name: 'Leading Lines',
    category: 'leading',
    description: 'Lines in frame that draw eye toward subject',
    visualEffect: 'Direction, depth, guiding viewer attention',
    emotionalImpact: 'Journey, direction, focus toward subject',
    useCase: 'Directing attention, creating depth, roads/corridors/railways',
    promptInjection: 'COMPOSITION: Leading lines - environmental lines (roads, corridors, rails) converge toward subject',
    technicalNotes: 'Lines don\'t have to be literal - can be implied.',
    exampleFilms: ['Any film with corridors, roads, or architecture'],
    commonMistakes: ['Lines leading out of frame or to wrong subject'],
  },

  eye_trace: {
    id: 'eye_trace',
    name: 'Eye Trace / Visual Path',
    category: 'leading',
    description: 'Composing so viewer\'s eye moves through frame in intended order',
    visualEffect: 'Controlled viewing experience, narrative order',
    emotionalImpact: 'Understanding, following story, guided discovery',
    useCase: 'Complex compositions, revealing information in order',
    promptInjection: 'COMPOSITION: Eye trace path - viewer eye moves from A to B to C in intended order',
    technicalNotes: 'Consider what viewer sees first, second, third.',
    exampleFilms: ['Well-composed scenes throughout cinema'],
    commonMistakes: ['Chaotic composition with no clear path'],
  },

  frame_within_frame: {
    id: 'frame_within_frame',
    name: 'Frame Within Frame',
    category: 'leading',
    description: 'Using doorways, windows, arches to frame subject',
    visualEffect: 'Focus, depth, artistic emphasis, voyeuristic',
    emotionalImpact: 'Isolation, observation, emphasis, voyeurism',
    useCase: 'Doorways, windows, arches, natural frames in environment',
    promptInjection: 'COMPOSITION: Frame within frame - subject viewed through doorway, window, or architectural element',
    technicalNotes: 'Creates natural vignette. Adds depth and focus.',
    exampleFilms: ['The Godfather', 'Hitchcock films', 'Architectural films'],
    commonMistakes: ['Frame-within-frame distracting from subject'],
  },

  diagonal_lines: {
    id: 'diagonal_lines',
    name: 'Diagonal Lines / Dutch Composition',
    category: 'leading',
    description: 'Diagonal lines create energy and direction',
    visualEffect: 'Dynamic, energetic, unstable, movement',
    emotionalImpact: 'Tension, action, unease, dynamism',
    useCase: 'Action, chase, psychological unease, energy',
    promptInjection: 'COMPOSITION: Strong diagonals - elements form diagonal lines creating energy and direction',
    technicalNotes: 'Can be achieved through Dutch angle or finding natural diagonals.',
    exampleFilms: ['Action films', 'Thriller compositions'],
    commonMistakes: ['Overuse making everything feel tilted'],
  },

  convergence: {
    id: 'convergence',
    name: 'Convergence Point',
    category: 'leading',
    description: 'Multiple lines converge at a single point',
    visualEffect: 'Strong focus point, vanishing point, depth',
    emotionalImpact: 'Destiny, focus, everything pointing to one thing',
    useCase: 'Vanishing points, railway tracks, dramatic focus',
    promptInjection: 'COMPOSITION: Convergence - multiple lines meet at subject or vanishing point',
    technicalNotes: 'Classic one-point perspective. Very strong focus.',
    exampleFilms: ['Kubrick corridors', 'Any perspective-focused shot'],
    commonMistakes: ['Convergence point not on subject'],
  },

  // ===================
  // COLOR COMPOSITION
  // ===================
  color_contrast: {
    id: 'color_contrast',
    name: 'Color Contrast',
    category: 'color',
    description: 'Contrasting colors create visual separation and emphasis',
    visualEffect: 'Pop, separation, emphasis, visual energy',
    emotionalImpact: 'Energy, emphasis, differentiation',
    useCase: 'Making subject stand out, creating visual interest',
    promptInjection: 'COMPOSITION: Color contrast - subject in contrasting color from background (warm/cool, complementary)',
    technicalNotes: 'Complementary colors (orange/teal, red/green) create strongest contrast.',
    exampleFilms: ['Amélie', 'Hero', 'Any color-graded film'],
    commonMistakes: ['Subject blending into background'],
  },

  complementary_colors: {
    id: 'complementary_colors',
    name: 'Complementary Colors',
    category: 'color',
    description: 'Using opposite colors on color wheel',
    visualEffect: 'Maximum color vibrance, pleasing contrast',
    emotionalImpact: 'Visual satisfaction, energy, professional look',
    useCase: 'Most Hollywood films, vibrant compositions',
    promptInjection: 'COMPOSITION: Complementary color scheme - orange/teal, red/green, or yellow/purple palette',
    technicalNotes: 'Orange/teal is the Hollywood standard.',
    exampleFilms: ['Transformers', 'Any blockbuster'],
    commonMistakes: ['Oversaturation making it look cartoonish'],
  },

  monochromatic: {
    id: 'monochromatic',
    name: 'Monochromatic',
    category: 'color',
    description: 'Composition using variations of single color',
    visualEffect: 'Cohesive, artistic, stylized, mood-driven',
    emotionalImpact: 'Mood immersion, artistic intent, dreamlike',
    useCase: 'Stylized sequences, mood pieces, specific aesthetic',
    promptInjection: 'COMPOSITION: Monochromatic - entire frame in variations of single color family',
    technicalNotes: 'Can use lighting or production design to achieve.',
    exampleFilms: ['The Matrix (green)', 'Enemy (yellow)', 'Ozark (blue)'],
    commonMistakes: ['Losing important details in single color'],
  },

  color_blocking: {
    id: 'color_blocking',
    name: 'Color Blocking',
    category: 'color',
    description: 'Large areas of solid color creating graphic composition',
    visualEffect: 'Graphic, bold, designed, striking',
    emotionalImpact: 'Modern, artistic, intentional, bold',
    useCase: 'Modern aesthetics, designed spaces, bold statements',
    promptInjection: 'COMPOSITION: Color blocking - frame divided into large blocks of solid, distinct colors',
    technicalNotes: 'Requires intentional production design or finding colored environments.',
    exampleFilms: ['Her', 'The Grand Budapest Hotel', 'Fashion photography'],
    commonMistakes: ['Colors fighting rather than complementing'],
  },

  warm_cool_contrast: {
    id: 'warm_cool_contrast',
    name: 'Warm/Cool Contrast',
    category: 'color',
    description: 'Contrasting warm and cool tones within frame',
    visualEffect: 'Depth, separation, visual interest, temperature contrast',
    emotionalImpact: 'Dynamic, interesting, balanced tension',
    useCase: 'Interior/exterior contrast, lighting contrast, subject separation',
    promptInjection: 'COMPOSITION: Warm/cool contrast - subject in warm light against cool background or vice versa',
    technicalNotes: 'Classic cinematography technique. Warm foreground, cool background common.',
    exampleFilms: ['Most professional cinematography'],
    commonMistakes: ['Muddy middle ground without clear contrast'],
  },

  // ===================
  // SPECIAL COMPOSITIONS
  // ===================
  chiaroscuro: {
    id: 'chiaroscuro',
    name: 'Chiaroscuro',
    category: 'special',
    description: 'Strong contrast between light and dark areas',
    visualEffect: 'Dramatic, sculptural, artistic, noir',
    emotionalImpact: 'Drama, mystery, intensity, artistry',
    useCase: 'Film noir, dramatic moments, artistic emphasis',
    promptInjection: 'COMPOSITION: Chiaroscuro - dramatic contrast between deep shadows and bright highlights, Rembrandt lighting',
    technicalNotes: 'Named after Renaissance painting technique. Moody and dramatic.',
    exampleFilms: ['The Godfather', 'Blade Runner', 'Film noir'],
    commonMistakes: ['Losing detail in shadows or highlights'],
  },

  silhouette: {
    id: 'silhouette',
    name: 'Silhouette',
    category: 'special',
    description: 'Subject appears as dark shape against bright background',
    visualEffect: 'Graphic, iconic, mysterious, dramatic',
    emotionalImpact: 'Mystery, drama, iconic imagery, universality',
    useCase: 'Sunset/sunrise shots, mystery, iconic moments',
    promptInjection: 'COMPOSITION: Silhouette - subject completely dark against bright background, shape only visible',
    technicalNotes: 'Expose for background, let subject go black.',
    exampleFilms: ['E.T.', 'Westerns', 'Romantic sunsets'],
    commonMistakes: ['Partial silhouette looking like underexposure'],
  },

  dutch_composition: {
    id: 'dutch_composition',
    name: 'Dutch Angle Composition',
    category: 'special',
    description: 'Entire composition on tilted horizon',
    visualEffect: 'Unease, stylized, psychological distortion',
    emotionalImpact: 'Discomfort, villainy, psychological unease',
    useCase: 'Villain shots, psychological moments, disorientation',
    promptInjection: 'COMPOSITION: Dutch angle - horizon tilted 15-30 degrees, creating visual unease',
    technicalNotes: 'Use sparingly. Powerful but can be overused.',
    exampleFilms: ['The Third Man', 'Batman (1989)', 'Thor'],
    commonMistakes: ['Overuse making it feel gimmicky'],
  },

  cowboy_shot: {
    id: 'cowboy_shot',
    name: 'Cowboy Shot / American Shot',
    category: 'special',
    description: 'Mid-thigh framing to include holsters',
    visualEffect: 'Western aesthetic, power stance, body language visible',
    emotionalImpact: 'Power, stance, ready for action',
    useCase: 'Westerns, standoffs, power poses, full body language',
    promptInjection: 'COMPOSITION: Cowboy shot - framed from mid-thigh up, showing hands and stance',
    technicalNotes: 'Named for showing gun holsters. Good for body language.',
    exampleFilms: ['Western films', 'Django Unchained'],
    commonMistakes: ['Cutting at joints (knee, waist) instead of mid-thigh'],
  },

  high_horizon: {
    id: 'high_horizon',
    name: 'High Horizon',
    category: 'special',
    description: 'Horizon line placed high in frame, emphasizing ground',
    visualEffect: 'Grounded, heavy, emphasis on foreground',
    emotionalImpact: 'Weight, depression, grounded feeling',
    useCase: 'Emphasizing ground elements, heavy mood, depression',
    promptInjection: 'COMPOSITION: High horizon - sky minimal, ground dominant, weight in lower frame',
    technicalNotes: 'Opposite of low horizon. Creates heavy feeling.',
    exampleFilms: ['Desert scenes', 'Depression themes'],
    commonMistakes: ['Accidentally heavy framing when not intended'],
  },

  low_horizon: {
    id: 'low_horizon',
    name: 'Low Horizon',
    category: 'special',
    description: 'Horizon line placed low in frame, emphasizing sky',
    visualEffect: 'Expansive, free, emphasis on sky, grandeur',
    emotionalImpact: 'Freedom, hope, expansiveness, spirituality',
    useCase: 'Epic landscapes, freedom themes, spiritual moments',
    promptInjection: 'COMPOSITION: Low horizon - sky dominant, ground minimal, emphasis on vastness above',
    technicalNotes: 'Creates sense of freedom and possibility.',
    exampleFilms: ['Lawrence of Arabia', 'Westerns', 'Epic landscapes'],
    commonMistakes: ['Wasted sky space without interesting elements'],
  },
};

// ===========================
// UTILITY FUNCTIONS
// ===========================

/**
 * Get composition rule by ID
 */
export function getCompositionRule(id: string): CompositionRule | undefined {
  return COMPOSITION_LIBRARY[id];
}

/**
 * Get all rules by category
 */
export function getCompositionsByCategory(category: CompositionRule['category']): CompositionRule[] {
  return Object.values(COMPOSITION_LIBRARY).filter(c => c.category === category);
}

/**
 * Recommend composition based on context
 */
export function recommendComposition(context: {
  shotType: 'wide' | 'medium' | 'closeup';
  mood: 'neutral' | 'dramatic' | 'peaceful' | 'tense';
  subjectCount: number;
}): CompositionRule[] {
  const recommendations: CompositionRule[] = [];
  
  // Base framing
  if (context.subjectCount === 1) {
    recommendations.push(COMPOSITION_LIBRARY.rule_of_thirds);
  } else if (context.subjectCount > 1) {
    recommendations.push(COMPOSITION_LIBRARY.layers);
  }
  
  // Mood-based
  if (context.mood === 'dramatic') {
    recommendations.push(COMPOSITION_LIBRARY.chiaroscuro);
    recommendations.push(COMPOSITION_LIBRARY.tight_framing);
  } else if (context.mood === 'peaceful') {
    recommendations.push(COMPOSITION_LIBRARY.negative_space);
    recommendations.push(COMPOSITION_LIBRARY.low_horizon);
  } else if (context.mood === 'tense') {
    recommendations.push(COMPOSITION_LIBRARY.dutch_composition);
    recommendations.push(COMPOSITION_LIBRARY.diagonal_lines);
  }
  
  // Shot type based
  if (context.shotType === 'wide') {
    recommendations.push(COMPOSITION_LIBRARY.leading_lines);
    recommendations.push(COMPOSITION_LIBRARY.foreground_interest);
  } else if (context.shotType === 'closeup') {
    recommendations.push(COMPOSITION_LIBRARY.shallow_focus);
    recommendations.push(COMPOSITION_LIBRARY.headroom);
  }
  
  return recommendations;
}

/**
 * Get all composition IDs
 */
export function getAllCompositionIds(): string[] {
  return Object.keys(COMPOSITION_LIBRARY);
}

/**
 * Get composition stats by category
 */
export function getCompositionStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  Object.values(COMPOSITION_LIBRARY).forEach(c => {
    stats[c.category] = (stats[c.category] || 0) + 1;
  });
  return stats;
}

/**
 * Get prompt injections for multiple rules
 */
export function buildCompositionPrompt(ruleIds: string[]): string {
  return ruleIds
    .map(id => COMPOSITION_LIBRARY[id]?.promptInjection)
    .filter(Boolean)
    .join('\n');
}

export default COMPOSITION_LIBRARY;
