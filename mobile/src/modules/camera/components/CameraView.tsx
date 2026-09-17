/**
 * CameraView — thin wrapper over expo-camera so screens and tests never import
 * the SDK directly. Exposes takePictureAsync with typed options and forwards
 * face-detection events for the AR layer.
 */
import React, { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { Camera, type CameraPictureOptions } from 'expo-camera';
import type { CameraPosition } from '../types';
import { mapDetectedFaces, type RawFaceResult } from '../services/faceDetection';
import type { DetectedFace } from '../types';

export interface CameraViewHandle {
  takePictureAsync(options: CameraPictureOptions): Promise<{ uri: string; width?: number; height?: number }>;
}

interface CameraViewProps {
  position: CameraPosition;
  onFacesDetected?: (faces: DetectedFace[]) => void;
  children?: ReactNode;
}

export const CameraView = forwardRef<CameraViewHandle, CameraViewProps>(
  ({ position, onFacesDetected, children }, ref) => {
    const cameraRef = useRef<Camera | null>(null);

    useImperativeHandle(ref, () => ({
      async takePictureAsync(options: CameraPictureOptions) {
        if (!cameraRef.current) throw new Error('Camera not mounted');
        const shot = await cameraRef.current.takePictureAsync(options);
        return { uri: shot.uri, width: shot.width, height: shot.height };
      },
    }));

    return (
      <Camera
        ref={cameraRef}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type={position as any}
        ratio="4:3"
        onFacesDetected={
          onFacesDetected
            ? (e) => onFacesDetected(
                  mapDetectedFaces({ faces: e.faces as unknown as RawFaceResult['faces'] })
                )
            : undefined
        }
        faceDetectorSettings={{
          mode: 'fast',
          detectLandmarks: 'none',
          runClassifications: 'none',
          minDetectionInterval: 300,
        }}
      >
        {children}
      </Camera>
    );
  }
);

CameraView.displayName = 'CameraView';
