/**
 * AR / face-detection readiness layer.
 * Real-time overlay during preview is handled by expo-face-detector on the
 * Camera's onFaceDetected callback; post-capture detection is a stub with a
 * clear seam so the AR sticker module (planned) can slot in without touching
 * camera code.
 */
import type { DetectedFace } from '../types';

/** Adapter shape for expo-face-detector results (kept loose to avoid a hard dep here). */
export interface RawFaceResult {
  faces: Array<{
    bounds: { x: number; y: number; width: number; height: number };
    rollAngle?: number;
    yawAngle?: number;
    smilingProbability?: number;
  }>;
}

export function mapDetectedFaces(result: RawFaceResult): DetectedFace[] {
  return result.faces.map((f) => ({
    bounds: f.bounds,
    rollAngle: f.rollAngle,
    yawAngle: f.yawAngle,
    smilingProbability: f.smilingProbability,
  }));
}

/**
 * TODO(AR module): given a captured photo uri, run detectFacesAsync and return
 * normalized face anchors for sticker placement. The camera module only needs
 * the anchor contract, so this ships as a seam, not a full implementation:
 */
export async function detectFacesForStickers(_photoUri: string): Promise<DetectedFace[]> {
  // Seam for the AR module — intentionally unimplemented here.
  return [];
}
