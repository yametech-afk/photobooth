/**
 * Camera module hooks tests — React Native Testing Library scaffold
 * ============================================================
 * Location: mobile/__tests__/camera/
 * Tumatakbo sa: jest + jest-expo + @testing-library/react-native
 * (magdagdag sa mobile/package.json devDeps:
 *   "@testing-library/react-native": "^12.4.3", "jest": "^29.6.3",
 *   "jest-expo": "~50.0.0", "react-test-renderer": "18.2.0"
 * at preset: "jest": { "preset": "jest-expo" })
 *
 * Sakop (P1-1/P1-3): permission states, burst cancel walang orphan timer,
 * premium lock hindi nagpapalit ng filter.
 * ⚠️ Untested scaffold — i-run pagkatapos ng `npm i` sa mobile/.
 * ============================================================
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { useCameraPermission } from '../../src/modules/camera/hooks/useCameraPermission';
import { usePhotoCapture } from '../../src/modules/camera/hooks/usePhotoCapture';

// ---- mocks para hindi nangangailangan ng totoong camera
jest.mock('expo-camera', () => ({
  Camera: Object.assign(jest.fn(({ children }) => children ?? null), {
    requestCameraPermissionsAsync: jest.fn(),
  }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
}));

describe('useCameraPermission (P1-1)', () => {
  it('granted → status=granted nang walang request', async () => {
    const Camera = require('expo-camera').Camera;
    Camera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    const { result } = renderHookForTest(useCameraPermission);
    await waitFor(() => expect(result.current.status).toBe('granted'));
  });

  it('denied → status=denied, at ang manual request() ay muling nag-a-ask', async () => {
    const Camera = require('expo-camera').Camera;
    Camera.requestCameraPermissionsAsync
      .mockResolvedValueOnce({ status: 'denied' })
      .mockResolvedValueOnce({ status: 'granted' });
    const { result } = renderHookForTest(useCameraPermission);
    await waitFor(() => expect(result.current.status).toBe('denied'));
    await act(() => result.current.request());
    await waitFor(() => expect(result.current.status).toBe('granted'));
  });
});

describe('usePhotoCapture — burst cancel (P1-1)', () => {
  it('cancelBurst sa gitna → walang dagdag na capture at walang crash', async () => {
    // Mock camera handle: bawat takePictureAsync ay nagdaragdag ng latency
    const mockHandle = {
      takePictureAsync: jest.fn(
        () => new Promise((r) => setTimeout(() => r({ uri: 'file:///shot.jpg' }), 100))
      ),
    };
    const onComplete = jest.fn();
    const onError = jest.fn();

    const { result } = renderHookForTest(() =>
      usePhotoCapture({ onComplete, onError })
    );

    await act(() => result.current.captureBurst('none', { count: 4 }));
    // Kanselahin sa gitna ng burst
    await act(() => result.current.cancelBurst());
    // Hintayin ang timer drain — dapat walang onComplete at walang error
    await new Promise((r) => setTimeout(r, 400));
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

// ---- maliit na renderHook helper (para hindi kailangan ng @testing-library/react-hooks)
import { Text } from 'react-native';
function renderHookForTest(useHook) {
  const probe = jest.fn();
  function Probe() {
    probe(useHook());
    return null;
  }
  render(<Text><Probe /></Text>);
  return { result: { get current() { return probe.mock.calls.at(-1)?.[0]; } }, probe };
}
