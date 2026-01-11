/**
 * PROFESSIONAL CAMERA MOVEMENT LIBRARY
 * Complete reference for cinematic camera work
 */

export interface CameraMovement {
  id: string;
  name: string;
  category: 'static' | 'pan_tilt' | 'dolly_track' | 'crane_jib' | 'handheld' | 'steadicam_gimbal' | 'aerial' | 'specialty';
  description: string;
  equipment: string[];
  speed: 'imperceptible' | 'slow' | 'medium' | 'fast' | 'whip';
  emotionalEffect: string;
  useCase: string;
  promptInjection: string;
  technicalNotes: string;
  famousExamples: string[];
  aiRisks: string[];
}

export const CAMERA_MOVEMENT_LIBRARY: Record<string, CameraMovement> = {
  // ===================
  // STATIC
  // ===================
  locked_off: {
    id: 'locked_off',
    name: 'Locked Off',
    category: 'static',
    description: 'Camera is completely stationary on tripod',
    equipment: ['Tripod', 'Fluid head'],
    speed: 'imperceptible',
    emotionalEffect: 'Objective observation, documentary feel, stability, allowing action to unfold',
    useCase: 'Master shots, tableau compositions, allowing complex blocking, comedy beats',
    promptInjection: 'CAMERA: Completely locked off static shot, no movement whatsoever',
    technicalNotes: 'Use for intentional stillness. Any movement should be subject-driven.',
    famousExamples: ['Wes Anderson films', 'Ozu films', 'Comedy wide shots'],
    aiRisks: ['Easier for AI - no camera motion to track'],
  },

  tableau: {
    id: 'tableau',
    name: 'Tableau / Planimetric',
    category: 'static',
    description: 'Flat, symmetrical, perpendicular composition',
    equipment: ['Tripod', 'Level'],
    speed: 'imperceptible',
    emotionalEffect: 'Formality, control, artistic intention, doll-house effect',
    useCase: 'Wes Anderson style, theatrical staging, comic effect, intentional artifice',
    promptInjection: 'CAMERA: Perfect planimetric tableau - camera perpendicular to flat surface, symmetrical framing',
    technicalNotes: 'Camera must be perfectly level and perpendicular to wall/surface.',
    famousExamples: ['The Grand Budapest Hotel', 'Moonrise Kingdom', 'The French Dispatch'],
    aiRisks: ['Requires precise symmetry - may need composition correction'],
  },

  breathing_camera: {
    id: 'breathing_camera',
    name: 'Breathing Camera',
    category: 'static',
    description: 'Imperceptible micro-movements as if camera is alive',
    equipment: ['Tripod with slight loosening', 'Handheld with stabilization'],
    speed: 'imperceptible',
    emotionalEffect: 'Subtle tension, presence, life, anticipation',
    useCase: 'Intimate dialogue, tension building, documentary intimacy',
    promptInjection: 'CAMERA: Breathing camera - imperceptible micro-drift as if camera is alive, almost static but with subtle presence',
    technicalNotes: 'Very subtle. Should be felt more than seen.',
    famousExamples: ['The Revenant', 'Sicario', 'Documentary films'],
    aiRisks: ['Good for AI - natural slight motion'],
  },

  // ===================
  // PAN / TILT
  // ===================
  pan_left: {
    id: 'pan_left',
    name: 'Pan Left',
    category: 'pan_tilt',
    description: 'Camera rotates horizontally from right to left',
    equipment: ['Tripod', 'Fluid head'],
    speed: 'slow',
    emotionalEffect: 'Revealing space, following action, surveying environment',
    useCase: 'Following subject, revealing location, establishing geography',
    promptInjection: 'CAMERA: Slow pan left, revealing scene from right to left',
    technicalNotes: 'Start and end on strong compositions. Avoid pan-to-dead-space.',
    famousExamples: ['Standard coverage technique'],
    aiRisks: ['Moderate - ensure smooth rotation'],
  },

  pan_right: {
    id: 'pan_right',
    name: 'Pan Right',
    category: 'pan_tilt',
    description: 'Camera rotates horizontally from left to right',
    equipment: ['Tripod', 'Fluid head'],
    speed: 'slow',
    emotionalEffect: 'Revealing space, following action, surveying environment',
    useCase: 'Following subject, revealing location, establishing geography',
    promptInjection: 'CAMERA: Slow pan right, revealing scene from left to right',
    technicalNotes: 'Start and end on strong compositions.',
    famousExamples: ['Standard coverage technique'],
    aiRisks: ['Moderate - ensure smooth rotation'],
  },

  tilt_up: {
    id: 'tilt_up',
    name: 'Tilt Up',
    category: 'pan_tilt',
    description: 'Camera rotates vertically upward',
    equipment: ['Tripod', 'Fluid head'],
    speed: 'slow',
    emotionalEffect: 'Revealing height, power, awe, introduction of tall subject',
    useCase: 'Building reveals, character power introduction, following rising action',
    promptInjection: 'CAMERA: Slow tilt up, revealing from ground to sky or full height of subject',
    technicalNotes: 'Classic hero introduction. End on powerful composition.',
    famousExamples: ['Character introductions', 'Building establishes'],
    aiRisks: ['Moderate - ensure vertical consistency'],
  },

  tilt_down: {
    id: 'tilt_down',
    name: 'Tilt Down',
    category: 'pan_tilt',
    description: 'Camera rotates vertically downward',
    equipment: ['Tripod', 'Fluid head'],
    speed: 'slow',
    emotionalEffect: 'Revealing ground-level detail, descent, lowering status',
    useCase: 'Detail reveals, following falling action, showing dejection',
    promptInjection: 'CAMERA: Slow tilt down, revealing from high to low',
    technicalNotes: 'Often ends on significant detail or character state.',
    famousExamples: ['Detail reveals', 'Character dejection'],
    aiRisks: ['Moderate - ensure vertical consistency'],
  },

  dutch_tilt: {
    id: 'dutch_tilt',
    name: 'Dutch Angle / Dutch Tilt',
    category: 'pan_tilt',
    description: 'Camera tilted on its roll axis, horizon not level',
    equipment: ['Tripod or handheld', 'Roll adjustment'],
    speed: 'imperceptible',
    emotionalEffect: 'Unease, disorientation, psychological imbalance, villainy',
    useCase: 'Villain introductions, psychological moments, horror, disorientation',
    promptInjection: 'CAMERA: Dutch angle - camera tilted 15-30 degrees off horizontal, creating diagonal horizon',
    technicalNotes: 'Use sparingly. 15-30 degrees typical. More is cartoonish.',
    famousExamples: ['The Third Man', 'Batman (1989)', 'Thor'],
    aiRisks: ['Specify exact angle degree'],
  },

  whip_pan: {
    id: 'whip_pan',
    name: 'Whip Pan / Swish Pan',
    category: 'pan_tilt',
    description: 'Extremely rapid pan creating motion blur',
    equipment: ['Tripod', 'Fluid head', 'Handheld'],
    speed: 'whip',
    emotionalEffect: 'Energy, surprise, time jump, scene transition',
    useCase: 'Transitions, action sequences, comedic timing, energy bursts',
    promptInjection: 'CAMERA: Whip pan - extremely fast rotation creating motion blur',
    technicalNotes: 'Often used for in-camera transitions. Cut during blur.',
    famousExamples: ['La La Land', 'Whiplash', 'Edgar Wright films'],
    aiRisks: ['Requires motion blur - may challenge AI generation'],
  },

  // ===================
  // DOLLY / TRACK
  // ===================
  dolly_in: {
    id: 'dolly_in',
    name: 'Dolly In / Push In',
    category: 'dolly_track',
    description: 'Camera physically moves toward subject',
    equipment: ['Dolly', 'Track', 'Dana dolly', 'Slider'],
    speed: 'slow',
    emotionalEffect: 'Intimacy, emphasis, intensifying moment, entering emotional space',
    useCase: 'Emotional beats, important dialogue, building tension, revelations',
    promptInjection: 'CAMERA: Slow dolly in - camera physically pushes toward subject, increasing intimacy',
    technicalNotes: 'Different from zoom - parallax changes. Subject grows in frame naturally.',
    famousExamples: ['Every drama - fundamental technique'],
    aiRisks: ['Good for AI - common movement pattern'],
  },

  dolly_out: {
    id: 'dolly_out',
    name: 'Dolly Out / Pull Back',
    category: 'dolly_track',
    description: 'Camera physically moves away from subject',
    equipment: ['Dolly', 'Track', 'Dana dolly', 'Slider'],
    speed: 'slow',
    emotionalEffect: 'Revelation of context, isolation, departure, growing scope',
    useCase: 'Reveals, showing isolation, endings, showing scale',
    promptInjection: 'CAMERA: Slow dolly out - camera pulls back from subject, revealing more of environment',
    technicalNotes: 'Often used for ending shots or revealing scope.',
    famousExamples: ['Many film endings', 'Isolation reveals'],
    aiRisks: ['Good for AI - common movement pattern'],
  },

  tracking_left: {
    id: 'tracking_left',
    name: 'Tracking Left / Crab Left',
    category: 'dolly_track',
    description: 'Camera moves laterally to the left',
    equipment: ['Dolly', 'Track', 'Steadicam'],
    speed: 'medium',
    emotionalEffect: 'Following action, revealing space, energy, flow',
    useCase: 'Following walking subject, revealing environments, action sequences',
    promptInjection: 'CAMERA: Tracking left - camera moves laterally left while maintaining subject in frame',
    technicalNotes: 'Keep subject in consistent frame position during track.',
    famousExamples: ['Walk and talk scenes', 'Corridor shots'],
    aiRisks: ['Moderate - maintain subject consistency'],
  },

  tracking_right: {
    id: 'tracking_right',
    name: 'Tracking Right / Crab Right',
    category: 'dolly_track',
    description: 'Camera moves laterally to the right',
    equipment: ['Dolly', 'Track', 'Steadicam'],
    speed: 'medium',
    emotionalEffect: 'Following action, revealing space, energy, flow',
    useCase: 'Following walking subject, revealing environments, action sequences',
    promptInjection: 'CAMERA: Tracking right - camera moves laterally right while maintaining subject in frame',
    technicalNotes: 'Keep subject in consistent frame position during track.',
    famousExamples: ['Walk and talk scenes', 'Corridor shots'],
    aiRisks: ['Moderate - maintain subject consistency'],
  },

  arc_shot: {
    id: 'arc_shot',
    name: 'Arc Shot',
    category: 'dolly_track',
    description: 'Camera moves in a curved path around subject',
    equipment: ['Circular dolly track', 'Steadicam', 'Gimbal'],
    speed: 'slow',
    emotionalEffect: 'Dramatic emphasis, heroic introduction, visual interest, pivotal moment',
    useCase: 'Character reveals, pivotal moments, romantic tension, hero shots',
    promptInjection: 'CAMERA: Arc shot - camera orbits around subject in curved path, 45-180 degrees',
    technicalNotes: 'Keep subject centered. Background moves behind subject.',
    famousExamples: ['The Matrix (bullet time inspired by)', 'Marvel hero shots', 'Music videos'],
    aiRisks: ['Complex - requires consistent subject tracking during orbit'],
  },

  parallel_track: {
    id: 'parallel_track',
    name: 'Parallel Track',
    category: 'dolly_track',
    description: 'Camera moves alongside subject at same speed',
    equipment: ['Dolly', 'Camera car', 'Steadicam'],
    speed: 'medium',
    emotionalEffect: 'Journeying together, companionship, following action',
    useCase: 'Walking scenes, vehicle interiors, chase sequences',
    promptInjection: 'CAMERA: Parallel tracking - camera moves alongside subject at matching speed',
    technicalNotes: 'Match subject speed precisely. Common for dialogue while walking.',
    famousExamples: ['The West Wing walk-and-talks', 'Drive', 'Car commercials'],
    aiRisks: ['Moderate - speed matching is crucial'],
  },

  push_through: {
    id: 'push_through',
    name: 'Push Through',
    category: 'dolly_track',
    description: 'Camera moves through a narrow space or barrier',
    equipment: ['Slider', 'Technocrane', 'Gimbal', 'CGI assist'],
    speed: 'slow',
    emotionalEffect: 'Entering new space, crossing threshold, immersion',
    useCase: 'Entering locations, dream sequences, moving through crowds',
    promptInjection: 'CAMERA: Push through - camera moves through doorway, window, or barrier into new space',
    technicalNotes: 'Often CGI-assisted for impossible moves.',
    famousExamples: ['Panic Room opening', 'Fight Club', 'Fincher films'],
    aiRisks: ['Complex - requires spatial consistency'],
  },

  // ===================
  // CRANE / JIB
  // ===================
  crane_up: {
    id: 'crane_up',
    name: 'Crane Up / Boom Up',
    category: 'crane_jib',
    description: 'Camera rises vertically on crane arm',
    equipment: ['Crane', 'Jib arm', 'Technocrane'],
    speed: 'slow',
    emotionalEffect: 'Transcendence, revelation, elevation, growing scope',
    useCase: 'Scene endings, reveals, establishing shots, moments of triumph',
    promptInjection: 'CAMERA: Crane up - camera rises vertically, revealing broader view',
    technicalNotes: 'Classic ending shot. Suggests transcendence or overview.',
    famousExamples: ['The Shawshank Redemption ending', 'Many film endings'],
    aiRisks: ['Complex - requires smooth vertical movement'],
  },

  crane_down: {
    id: 'crane_down',
    name: 'Crane Down / Boom Down',
    category: 'crane_jib',
    description: 'Camera descends vertically on crane arm',
    equipment: ['Crane', 'Jib arm', 'Technocrane'],
    speed: 'slow',
    emotionalEffect: 'Grounding, arriving, entering scene, focusing down',
    useCase: 'Entering scenes, character introductions, descending into action',
    promptInjection: 'CAMERA: Crane down - camera descends from high to character/scene level',
    technicalNotes: 'Often used to enter a scene from establishing wide.',
    famousExamples: ['Opening shots', 'Character introductions'],
    aiRisks: ['Complex - requires smooth vertical movement'],
  },

  jib_sweep: {
    id: 'jib_sweep',
    name: 'Jib Sweep',
    category: 'crane_jib',
    description: 'Combined horizontal and vertical arc movement',
    equipment: ['Jib arm', 'Remote head'],
    speed: 'medium',
    emotionalEffect: 'Dynamic, sweeping, cinematic grandeur',
    useCase: 'Reveals, establishing shots, production value moments',
    promptInjection: 'CAMERA: Jib sweep - arcing movement combining horizontal and vertical motion',
    technicalNotes: 'Common for production value. Requires rehearsal.',
    famousExamples: ['Concert films', 'Sports coverage', 'Epic establishing shots'],
    aiRisks: ['Complex - compound movement challenging for AI'],
  },

  technocrane_move: {
    id: 'technocrane_move',
    name: 'Technocrane / Telescoping Move',
    category: 'crane_jib',
    description: 'Complex multi-axis crane movement with telescoping arm',
    equipment: ['Technocrane', 'Remote head', 'Experienced operator'],
    speed: 'medium',
    emotionalEffect: 'Impossible fluidity, god-like perspective, production value',
    useCase: 'Complex reveals, impossible shots, one-take sequences',
    promptInjection: 'CAMERA: Technocrane move - complex multi-axis movement combining dolly, crane, and telescoping arm',
    technicalNotes: 'Highest production value crane work. Requires expert operation.',
    famousExamples: ['Spielberg shots', 'Fincher shots', 'Major studio films'],
    aiRisks: ['Very complex - may need to simplify'],
  },

  // ===================
  // HANDHELD
  // ===================
  controlled_handheld: {
    id: 'controlled_handheld',
    name: 'Controlled Handheld',
    category: 'handheld',
    description: 'Handheld with controlled, minimal shake',
    equipment: ['Camera', 'Shoulder rig', 'Easy rig'],
    speed: 'medium',
    emotionalEffect: 'Intimacy, presence, subtle energy, documentary feel',
    useCase: 'Intimate dialogue, documentary style, controlled energy',
    promptInjection: 'CAMERA: Controlled handheld - subtle natural shake, human presence felt but not distracting',
    technicalNotes: 'Most common handheld style. Breathe with camera.',
    famousExamples: ['Friday Night Lights', 'The Office', 'Modern dramas'],
    aiRisks: ['Good for AI - natural slight motion'],
  },

  shaky_cam: {
    id: 'shaky_cam',
    name: 'Shaky Cam',
    category: 'handheld',
    description: 'Aggressive handheld with significant shake',
    equipment: ['Camera', 'Handheld'],
    speed: 'fast',
    emotionalEffect: 'Chaos, urgency, fear, visceral impact, found footage feel',
    useCase: 'Action sequences, horror, war films, found footage',
    promptInjection: 'CAMERA: Aggressive shaky cam - significant shake suggesting chaos and urgency',
    technicalNotes: 'Use sparingly. Can cause motion sickness if overused.',
    famousExamples: ['Bourne films', 'Saving Private Ryan', 'Cloverfield'],
    aiRisks: ['Moderate - specify shake intensity'],
  },

  documentary_style: {
    id: 'documentary_style',
    name: 'Documentary Style',
    category: 'handheld',
    description: 'Reactive handheld following real-time action',
    equipment: ['Camera', 'Shoulder rig'],
    speed: 'medium',
    emotionalEffect: 'Authenticity, realism, catching moments as they happen',
    useCase: 'Mockumentary, realistic drama, unscripted feel',
    promptInjection: 'CAMERA: Documentary style handheld - reactive framing, finding the action, slight reframes',
    technicalNotes: 'Let camera search for action. Include subtle reframes.',
    famousExamples: ['The Office', 'Parks and Recreation', 'Modern Family'],
    aiRisks: ['Moderate - requires natural reactive behavior'],
  },

  crash_handheld: {
    id: 'crash_handheld',
    name: 'Crash Handheld',
    category: 'handheld',
    description: 'Running with camera into or away from action',
    equipment: ['Camera', 'Handheld'],
    speed: 'fast',
    emotionalEffect: 'Panic, urgency, chase energy, immersive danger',
    useCase: 'Chase sequences, escape scenes, crash moments',
    promptInjection: 'CAMERA: Crash handheld - running with camera, chaotic but purposeful movement toward/away from subject',
    technicalNotes: 'Used for immersive action. Often cut quickly.',
    famousExamples: ['War films', 'Bourne films', 'Action sequences'],
    aiRisks: ['Complex - high motion, subject tracking challenging'],
  },

  // ===================
  // STEADICAM / GIMBAL
  // ===================
  steadicam_follow: {
    id: 'steadicam_follow',
    name: 'Steadicam Follow',
    category: 'steadicam_gimbal',
    description: 'Smooth floating following subject from behind',
    equipment: ['Steadicam', 'Gimbal', 'Operator vest'],
    speed: 'medium',
    emotionalEffect: 'Journeying with character, smooth pursuit, elegant motion',
    useCase: 'Walk-and-talks, following into locations, character POV',
    promptInjection: 'CAMERA: Steadicam follow - smooth floating camera behind/beside subject, following their path',
    technicalNotes: 'The quintessential Steadicam move. Smooth and controlled.',
    famousExamples: ['The Shining', 'Goodfellas', 'Most walk-and-talk scenes'],
    aiRisks: ['Good for AI - smooth following motion'],
  },

  steadicam_lead: {
    id: 'steadicam_lead',
    name: 'Steadicam Lead',
    category: 'steadicam_gimbal',
    description: 'Camera moves backward in front of walking subject',
    equipment: ['Steadicam', 'Gimbal', 'Skilled operator'],
    speed: 'medium',
    emotionalEffect: 'Engagement with character, face-to-face, drawing viewer in',
    useCase: 'Dialogue while walking, character focus, direct engagement',
    promptInjection: 'CAMERA: Steadicam lead - camera faces subject while moving backward, subject walks toward camera',
    technicalNotes: 'Operator walks backward. Requires clear path.',
    famousExamples: ['West Wing walk-and-talks', 'ER', 'Any dialogue while moving'],
    aiRisks: ['Moderate - requires backward movement tracking'],
  },

  steadicam_orbit: {
    id: 'steadicam_orbit',
    name: 'Steadicam Orbit / 360',
    category: 'steadicam_gimbal',
    description: 'Camera smoothly circles around subject',
    equipment: ['Steadicam', 'Gimbal', 'Skilled operator'],
    speed: 'slow',
    emotionalEffect: 'Intensity, pivotal moment, character isolated in world, dramatic emphasis',
    useCase: 'Pivotal moments, romantic tension, hero introduction, dramatic beats',
    promptInjection: 'CAMERA: Steadicam orbit - camera smoothly circles around subject 180-360 degrees',
    technicalNotes: 'Dramatic effect. Background rotates behind subject.',
    famousExamples: ['The Thomas Crown Affair', 'Marvel films', 'Music videos'],
    aiRisks: ['Complex - requires consistent orbit with subject centered'],
  },

  low_mode_steadicam: {
    id: 'low_mode_steadicam',
    name: 'Low Mode Steadicam',
    category: 'steadicam_gimbal',
    description: 'Steadicam operated near ground level',
    equipment: ['Steadicam in low mode', 'Gimbal'],
    speed: 'slow',
    emotionalEffect: 'Child POV, ground-level intimacy, unique perspective',
    useCase: 'Child character POV, following low subjects, unique angles',
    promptInjection: 'CAMERA: Low mode steadicam - smooth movement at knee/ground level',
    technicalNotes: 'Requires Steadicam to be inverted or gimbal at low position.',
    famousExamples: ['Halloween', 'Child POV shots', 'Unique perspectives'],
    aiRisks: ['Moderate - specify exact height'],
  },

  // ===================
  // AERIAL
  // ===================
  drone_reveal: {
    id: 'drone_reveal',
    name: 'Drone Reveal',
    category: 'aerial',
    description: 'Drone rises to reveal landscape or location',
    equipment: ['Drone', 'FPV drone', 'Helicopter'],
    speed: 'medium',
    emotionalEffect: 'Epic scale, freedom, establishing vastness, awe',
    useCase: 'Opening shots, location establishment, scale reveals',
    promptInjection: 'CAMERA: Drone reveal - aerial camera rises to reveal expansive landscape or location',
    technicalNotes: 'Classic drone opening shot. Rise from detail to wide.',
    famousExamples: ['Lord of the Rings', 'Game of Thrones', 'Modern establishing shots'],
    aiRisks: ['Complex - requires altitude change with consistent scenery'],
  },

  drone_tracking: {
    id: 'drone_tracking',
    name: 'Drone Tracking',
    category: 'aerial',
    description: 'Drone follows subject from above',
    equipment: ['Drone', 'Tracking software'],
    speed: 'fast',
    emotionalEffect: 'Surveillance, god-like perspective, following journey',
    useCase: 'Car chases, following characters, establishing movement',
    promptInjection: 'CAMERA: Drone tracking - aerial camera follows moving subject from above',
    technicalNotes: 'Keep subject in frame while matching speed.',
    famousExamples: ['Car chase sequences', 'Nature documentaries'],
    aiRisks: ['Complex - requires subject tracking from aerial view'],
  },

  drone_orbit: {
    id: 'drone_orbit',
    name: 'Drone Orbit',
    category: 'aerial',
    description: 'Drone circles around subject or location',
    equipment: ['Drone with POI mode', 'FPV drone'],
    speed: 'slow',
    emotionalEffect: 'Importance, establishment, isolated beauty',
    useCase: 'Building reveals, character on rooftop, landscape feature',
    promptInjection: 'CAMERA: Drone orbit - aerial camera circles around point of interest',
    technicalNotes: 'Point-of-interest mode on most drones. Smooth and consistent.',
    famousExamples: ['Real estate footage', 'Documentary establishing'],
    aiRisks: ['Complex - requires smooth orbital motion'],
  },

  fpv_flythrough: {
    id: 'fpv_flythrough',
    name: 'FPV Flythrough',
    category: 'aerial',
    description: 'High-speed first-person-view drone through spaces',
    equipment: ['FPV racing drone', 'Skilled pilot'],
    speed: 'fast',
    emotionalEffect: 'Exhilaration, speed, impossible perspectives',
    useCase: 'Action sequences, production value, music videos, sports',
    promptInjection: 'CAMERA: FPV flythrough - high-speed first-person drone perspective flying through spaces',
    technicalNotes: 'Requires specialized pilot. Very dynamic footage.',
    famousExamples: ['Super Bowl commercials', 'Netflix "One Shot" videos'],
    aiRisks: ['Very complex - high speed with environmental traversal'],
  },

  birds_eye: {
    id: 'birds_eye',
    name: 'Bird\'s Eye View',
    category: 'aerial',
    description: 'Directly overhead looking straight down',
    equipment: ['Drone', 'Crane with remote head'],
    speed: 'imperceptible',
    emotionalEffect: 'God perspective, pattern reveal, surveillance, detachment',
    useCase: 'Symmetry shots, crime scenes, maze-like spaces, artistic shots',
    promptInjection: 'CAMERA: Bird\'s eye view - directly overhead looking straight down, 90-degree angle to ground',
    technicalNotes: 'Pure top-down. Good for revealing patterns or symmetry.',
    famousExamples: ['Wes Anderson films', 'Crime scene establishing', 'Artistic compositions'],
    aiRisks: ['Moderate - requires consistent top-down perspective'],
  },

  // ===================
  // SPECIALTY
  // ===================
  dolly_zoom: {
    id: 'dolly_zoom',
    name: 'Dolly Zoom / Vertigo Effect',
    category: 'specialty',
    description: 'Dolly in while zooming out (or reverse), maintaining subject size',
    equipment: ['Dolly', 'Zoom lens', 'Precise coordination'],
    speed: 'slow',
    emotionalEffect: 'Vertigo, realization, world shifting, psychological distortion',
    useCase: 'Psychological moments, horror, epiphany, dramatic realization',
    promptInjection: 'CAMERA: Dolly zoom / vertigo effect - subject stays same size while background warps and shifts depth',
    technicalNotes: 'Requires simultaneous dolly and zoom. Very dramatic effect.',
    famousExamples: ['Vertigo', 'Jaws', 'Goodfellas'],
    aiRisks: ['Very complex - requires simultaneous perspective changes'],
  },

  snorricam: {
    id: 'snorricam',
    name: 'Snorricam / Body Mount',
    category: 'specialty',
    description: 'Camera mounted to actor\'s body, facing them',
    equipment: ['Snorricam rig', 'Body harness'],
    speed: 'medium',
    emotionalEffect: 'Disorientation, intoxication, dreamlike, character isolation',
    useCase: 'Drug sequences, drunkenness, psychological states, dreams',
    promptInjection: 'CAMERA: Snorricam / body mount - camera fixed to subject, world moves around them',
    technicalNotes: 'Subject is sharp, world moves. Distinctive dream-like effect.',
    famousExamples: ['Requiem for a Dream', 'Mean Streets', 'Pi'],
    aiRisks: ['Very complex - subject static while world moves'],
  },

  crash_zoom: {
    id: 'crash_zoom',
    name: 'Crash Zoom',
    category: 'specialty',
    description: 'Extremely fast zoom in or out',
    equipment: ['Zoom lens', 'Fast operator'],
    speed: 'whip',
    emotionalEffect: 'Sudden emphasis, shock, 70s aesthetic, comedy beat',
    useCase: 'Horror stings, comedy emphasis, retro style, shock moments',
    promptInjection: 'CAMERA: Crash zoom - extremely fast snap zoom to or from subject',
    technicalNotes: 'Very fast. Creates motion blur at peak speed.',
    famousExamples: ['Kill Bill', 'Shaun of the Dead', '70s films'],
    aiRisks: ['Complex - requires rapid focal length change'],
  },

  speed_ramp: {
    id: 'speed_ramp',
    name: 'Speed Ramp',
    category: 'specialty',
    description: 'Camera movement changes speed (often to slow motion)',
    equipment: ['High frame rate camera', 'Post-production'],
    speed: 'medium',
    emotionalEffect: 'Dramatic emphasis, impact moment, time manipulation',
    useCase: 'Action peaks, impacts, bullet time effects, dramatic moments',
    promptInjection: 'CAMERA: Speed ramp - camera movement transitions from normal to slow motion at key moment',
    technicalNotes: 'Requires high frame rate capture. Effect done in post.',
    famousExamples: ['300', 'Sherlock Holmes (2009)', 'Action films'],
    aiRisks: ['Post-production effect - generate at appropriate speed'],
  },

  whip_to_whip: {
    id: 'whip_to_whip',
    name: 'Whip to Whip',
    category: 'specialty',
    description: 'Whip pan from one subject to another',
    equipment: ['Tripod or handheld', 'Fast head movement'],
    speed: 'whip',
    emotionalEffect: 'Sudden connection, comparison, reaction emphasis',
    useCase: 'Quick reaction cuts, connecting subjects, comedy beats',
    promptInjection: 'CAMERA: Whip to whip - extremely fast pan between two subjects with motion blur',
    technicalNotes: 'Creates motion blur between subjects. Quick emphasis.',
    famousExamples: ['Whiplash', 'La La Land', 'Edgar Wright films'],
    aiRisks: ['Complex - requires motion blur and subject transition'],
  },

  zoom_in: {
    id: 'zoom_in',
    name: 'Zoom In',
    category: 'specialty',
    description: 'Lens zooms to tighter framing (camera doesn\'t move)',
    equipment: ['Zoom lens'],
    speed: 'slow',
    emotionalEffect: 'Focus, emphasis, tension building, closing in',
    useCase: 'Documentary style, vintage feel, emphasis, tension',
    promptInjection: 'CAMERA: Zoom in - lens focal length increases, framing tightens without camera movement',
    technicalNotes: 'Different from dolly - no parallax change. Compression increases.',
    famousExamples: ['The Office (mockumentary zooms)', 'Kubrick films'],
    aiRisks: ['Moderate - requires focal length change without position change'],
  },

  zoom_out: {
    id: 'zoom_out',
    name: 'Zoom Out',
    category: 'specialty',
    description: 'Lens zooms to wider framing (camera doesn\'t move)',
    equipment: ['Zoom lens'],
    speed: 'slow',
    emotionalEffect: 'Context reveal, isolation, pulling back perspective',
    useCase: 'Documentary style, reveals, endings',
    promptInjection: 'CAMERA: Zoom out - lens focal length decreases, framing widens without camera movement',
    technicalNotes: 'Different from dolly out - no parallax change.',
    famousExamples: ['Documentary reveals', 'News coverage'],
    aiRisks: ['Moderate - requires focal length change without position change'],
  },

  roll: {
    id: 'roll',
    name: 'Roll / Barrel Roll',
    category: 'specialty',
    description: 'Camera rotates on its axis',
    equipment: ['Gimbal', 'Special head', 'Post-production'],
    speed: 'slow',
    emotionalEffect: 'Disorientation, dream logic, chaos, underwater feel',
    useCase: 'Dream sequences, disorientation, artistic effect, zero gravity',
    promptInjection: 'CAMERA: Roll - camera rotates on its axis, horizon spins',
    technicalNotes: 'Use sparingly. Very disorienting effect.',
    famousExamples: ['Inception (hallway)', '2001: A Space Odyssey'],
    aiRisks: ['Complex - requires rotational consistency'],
  },
};

// ===========================
// UTILITY FUNCTIONS
// ===========================

/**
 * Get camera movement by ID
 */
export function getCameraMovement(id: string): CameraMovement | undefined {
  return CAMERA_MOVEMENT_LIBRARY[id];
}

/**
 * Get all movements by category
 */
export function getMovementsByCategory(category: CameraMovement['category']): CameraMovement[] {
  return Object.values(CAMERA_MOVEMENT_LIBRARY).filter(m => m.category === category);
}

/**
 * Get movements by speed
 */
export function getMovementsBySpeed(speed: CameraMovement['speed']): CameraMovement[] {
  return Object.values(CAMERA_MOVEMENT_LIBRARY).filter(m => m.speed === speed);
}

/**
 * Recommend movement based on context
 */
export function recommendCameraMovement(context: {
  sceneType: 'dialogue' | 'action' | 'emotional' | 'establishing' | 'suspense';
  energyLevel: 'low' | 'medium' | 'high';
  equipment: 'basic' | 'standard' | 'full';
}): CameraMovement {
  // High energy action
  if (context.sceneType === 'action' && context.energyLevel === 'high') {
    return CAMERA_MOVEMENT_LIBRARY.shaky_cam;
  }
  
  // Emotional scenes
  if (context.sceneType === 'emotional') {
    return context.energyLevel === 'high' 
      ? CAMERA_MOVEMENT_LIBRARY.dolly_in 
      : CAMERA_MOVEMENT_LIBRARY.breathing_camera;
  }
  
  // Dialogue
  if (context.sceneType === 'dialogue') {
    return context.equipment === 'full'
      ? CAMERA_MOVEMENT_LIBRARY.steadicam_follow
      : CAMERA_MOVEMENT_LIBRARY.controlled_handheld;
  }
  
  // Establishing
  if (context.sceneType === 'establishing') {
    return context.equipment === 'full'
      ? CAMERA_MOVEMENT_LIBRARY.drone_reveal
      : CAMERA_MOVEMENT_LIBRARY.pan_right;
  }
  
  // Suspense
  if (context.sceneType === 'suspense') {
    return CAMERA_MOVEMENT_LIBRARY.dolly_in;
  }
  
  // Default
  return CAMERA_MOVEMENT_LIBRARY.locked_off;
}

/**
 * Get all movement IDs
 */
export function getAllMovementIds(): string[] {
  return Object.keys(CAMERA_MOVEMENT_LIBRARY);
}

/**
 * Get movement stats by category
 */
export function getMovementStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  Object.values(CAMERA_MOVEMENT_LIBRARY).forEach(m => {
    stats[m.category] = (stats[m.category] || 0) + 1;
  });
  return stats;
}

export default CAMERA_MOVEMENT_LIBRARY;
