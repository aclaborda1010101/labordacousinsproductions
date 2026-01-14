/**
 * Storyboard Serializer - Deterministic payload generation for NanoBanana
 * 
 * Converts structured panel data to frozen text format that NanoBanana
 * renders without improvisation.
 */

export interface SerializablePanel {
  panel_no: number;
  panel_id?: string;
  shot_hint: string;
  panel_intent?: string;
  action_beat?: string;
  characters_present?: Array<{ character_id: string; importance?: string }>;
  props_present?: Array<{ prop_id: string; importance?: string }>;
  movement_arrows?: Array<{ type: string; direction: string; intensity?: string }>;
}

export interface SerializableShot {
  shot_no?: number;
  shot_type: string;
  description: string;
  camera_id?: string;
}

/**
 * Serializes panels to deterministic PANEL_LIST format for GRID_SHEET_V1
 * 
 * Format: P1 [PG]: <action>. Characters: A,B. Props: X,Y. Arrows: cam forward; subj left.
 * 
 * Rules:
 * - 1 panel = 1 line
 * - Max 140 chars for action
 * - Fixed order: Action → Characters → Props → Arrows
 */
export function serializePanelList(panels: SerializablePanel[]): string {
  return panels.map(p => {
    const action = (p.action_beat || p.panel_intent || "Action").slice(0, 140);
    const chars = p.characters_present?.length
      ? p.characters_present.map(c => c.character_id.slice(0, 8)).join(",")
      : "none";
    const props = p.props_present?.length
      ? p.props_present.map(pr => pr.prop_id.slice(0, 8)).join(",")
      : "none";
    const arrows = p.movement_arrows?.length
      ? p.movement_arrows.map(a => `${a.type} ${a.direction}`).join("; ")
      : "none";

    return `P${p.panel_no} [${p.shot_hint}]: ${action}. Characters: ${chars}. Props: ${props}. Arrows: ${arrows}.`;
  }).join("\n");
}

/**
 * Serializes shots to deterministic SHOT_LIST_TEXT format for TECH_PAGE_V1
 * 
 * Format: 01  PG  Description up to 60 chars. (CAM1)
 */
export function serializeShotList(shots: SerializableShot[]): string {
  return shots.map((s, i) => {
    const num = String(s.shot_no ?? i + 1).padStart(2, "0");
    const cam = s.camera_id ? `(CAM${s.camera_id})` : "";
    const desc = s.description.slice(0, 60);
    return `${num}  ${s.shot_type}  ${desc}. ${cam}`.trim();
  }).join("\n");
}

/**
 * Generates a deterministic seed based on input IDs
 * 
 * Same inputs = same seed = same visual output
 */
export function generateSeed(
  sequenceId: string,
  style: string,
  panelNo: number
): number {
  const hash = hashString(`${sequenceId}:${style}`);
  // Use prime multiplier for panel variation, keep within safe int range
  return Math.abs((hash + panelNo * 1009) % 2147483647);
}

/**
 * Simple string hash function (djb2 variant)
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash) ^ char;
  }
  return Math.abs(hash);
}

/**
 * Generates a deterministic prompt hash for caching
 */
export function generatePromptHash(prompt: string, seed: number): string {
  const combined = `${prompt}:${seed}`;
  return hashString(combined).toString(16);
}
