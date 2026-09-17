/**
 * Editor state for one photo: geometry + colour grade + filter selection.
 *
 * Deliberately a reducer instead of a dozen useState calls so "Reset", "Apply
 * filter" and "Undo last action" are single, testable transitions, and so a
 * filter preset can replace the whole grade atomically.
 */
import { useCallback, useMemo, useReducer } from 'react';
import { NEUTRAL_GRADE, NEUTRAL_TRANSFORM, type ColorGrade, type CropRatio, type EditState } from '../types';
import { getFilterPreset } from '../constants';
import { clamp } from '../utils/format';

type Action =
  | { type: 'rotate'; direction: 'cw' | 'ccw' }
  | { type: 'flip'; axis: 'h' | 'v' }
  | { type: 'crop'; ratio: CropRatio }
  | { type: 'resize'; longEdge?: number }
  | { type: 'grade'; patch: Partial<ColorGrade> }
  | { type: 'resetGrade' }
  | { type: 'resetAll' }
  | { type: 'selectFilter'; filterId: string }
  | { type: 'restore'; state: EditState };

function initialState(filterId = 'none'): EditState {
  const preset = getFilterPreset(filterId);
  return {
    transform: { ...NEUTRAL_TRANSFORM },
    grade: { ...NEUTRAL_GRADE, ...(preset.grade ?? {}) },
    filterId: preset.id,
  };
}

function reducer(state: EditState, action: Action): EditState {
  switch (action.type) {
    case 'rotate': {
      const delta = action.direction === 'cw' ? 90 : 270;
      const rotation = (((state.transform.rotation + delta) % 360) as 0 | 90 | 180 | 270);
      return { ...state, transform: { ...state.transform, rotation } };
    }
    case 'flip':
      return {
        ...state,
        transform: {
          ...state.transform,
          flipH: action.axis === 'h' ? !state.transform.flipH : state.transform.flipH,
          flipV: action.axis === 'v' ? !state.transform.flipV : state.transform.flipV,
        },
      };
    case 'crop':
      return { ...state, transform: { ...state.transform, cropRatio: action.ratio } };
    case 'resize':
      return {
        ...state,
        transform: {
          ...state.transform,
          resizeLongEdge: action.longEdge ? clamp(action.longEdge, 320, 4096) : undefined,
        },
      };
    case 'grade':
      return { ...state, grade: { ...state.grade, ...action.patch } };
    case 'resetGrade':
      return state.filterId === 'none'
        ? { ...state, grade: { ...NEUTRAL_GRADE } }
        : initialState(state.filterId);
    case 'resetAll':
      return initialState('none');
    case 'selectFilter': {
      const preset = getFilterPreset(action.filterId);
      // Cloud/AI filters cannot be previewed on the GPU, so we keep the current
      // geometry but show the neutral grade while the badge tells the user the
      // render happens on the server at upload time.
      const grade = preset.renderer === 'gpu' ? { ...NEUTRAL_GRADE, ...(preset.grade ?? {}) } : { ...NEUTRAL_GRADE };
      return { ...state, filterId: preset.id, grade };
    }
    case 'restore':
      return action.state;
    default:
      return state;
  }
}

export type PhotoEditorApi = {
  state: EditState;
  isDirty: boolean;
  rotate: (direction: 'cw' | 'ccw') => void;
  flip: (axis: 'h' | 'v') => void;
  setCropRatio: (ratio: CropRatio) => void;
  setResize: (longEdge?: number) => void;
  setGrade: (patch: Partial<ColorGrade>) => void;
  resetGrade: () => void;
  resetAll: () => void;
  selectFilter: (filterId: string) => void;
  restore: (state: EditState) => void;
  /** Uniforms the GL canvas should render right now. */
  activeGrade: ColorGrade;
};

export function usePhotoEditor(options?: { initialFilterId?: string; initial?: EditState }): PhotoEditorApi {
  const [state, dispatch] = useReducer(
    reducer,
    options?.initial ?? initialState(options?.initialFilterId ?? 'none')
  );

  const isDirty = useMemo(() => {
    const t = state.transform;
    const g = state.grade;
    return (
      state.filterId !== 'none' ||
      t.rotation !== 0 ||
      t.flipH ||
      t.flipV ||
      t.cropRatio !== 'original' ||
      t.resizeLongEdge !== undefined ||
      g.brightness !== 0 ||
      g.contrast !== 1 ||
      g.saturation !== 1 ||
      g.sepia !== 0 ||
      g.grayscale !== 0 ||
      g.invert !== 0 ||
      g.tintStrength !== 0 ||
      g.vignette !== 0
    );
  }, [state]);

  return {
    state,
    isDirty,
    activeGrade: state.grade,
    rotate: useCallback((direction) => dispatch({ type: 'rotate', direction }), []),
    flip: useCallback((axis) => dispatch({ type: 'flip', axis }), []),
    setCropRatio: useCallback((ratio) => dispatch({ type: 'crop', ratio }), []),
    setResize: useCallback((longEdge) => dispatch({ type: 'resize', longEdge }), []),
    setGrade: useCallback((patch) => dispatch({ type: 'grade', patch }), []),
    resetGrade: useCallback(() => dispatch({ type: 'resetGrade' }), []),
    resetAll: useCallback(() => dispatch({ type: 'resetAll' }), []),
    selectFilter: useCallback((filterId) => dispatch({ type: 'selectFilter', filterId }), []),
    restore: useCallback((next) => dispatch({ type: 'restore', state: next }), []),
  };
}

export { initialState as initialEditState };