/**
 * Upload state management: a small sequential queue with per-job status,
 * progress, auto-retry with backoff, manual retry and cancel.
 *
 * Sequential on purpose — parallel uploads on a phone compete for the same uplink
 * and make every job slower, and they make the "remaining credits" number jitter.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localId, makeIdempotencyKey } from '../utils/format';
import {
  backoffMs,
  describeUploadError,
  isRetryable,
  startUpload,
  type StartUploadInput,
  type UploadHandle,
} from '../services/uploadService';
import { deleteLocal, makeThumbnail } from '../services/imagePipeline';
import { LIMITS } from '../constants';
import type { PhotoUploadMode, PhotoVisibility, UploadJob, UploadStatus } from '../types';

export type EnqueueUploadInput = {
  uri: string;
  filterId: string;
  mode?: PhotoUploadMode;
  visibility?: PhotoVisibility;
  eventId?: string | null;
  bookingId?: string | null;
  caption?: string;
  hashtags?: string[];
  width?: number;
  height?: number;
  sizeBytes?: number;
  filterApplied?: boolean;
  /** Strip exports cost one credit and are applied on device. */
  creditsOverride?: number;
  /** Reuse the id of a job so Retry keeps idempotency across attempts. */
  jobId?: string;
};

export type UsePhotoUploadOptions = {
  uid: string | null;
  sessionId: string;
  /** Called after a successful finalize so contexts can refresh. */
  onUploaded?: (job: UploadJob) => void | Promise<void>;
  onCreditsChanged?: (remaining: number | 'unlimited') => void;
  /** Auto-retry transient failures this many times. */
  maxAutoAttempts?: number;
  /** When false the queue holds new jobs until `resume()` is called. */
  autoStart?: boolean;
};

export type UsePhotoUploadApi = {
  jobs: UploadJob[];
  activeJob: UploadJob | null;
  queuedCount: number;
  failedCount: number;
  doneCount: number;
  /** 0..1 across every non-terminal job. */
  overallProgress: number;
  isBusy: boolean;
  lastError: string | null;
  enqueue: (input: EnqueueUploadInput) => string;
  retry: (jobId: string) => void;
  retryAllFailed: () => void;
  cancel: (jobId: string) => void;
  remove: (jobId: string) => void;
  clearFinished: () => void;
  pause: () => void;
  resume: () => void;
  paused: boolean;
  resetError: () => void;
};

const TERMINAL: UploadStatus[] = ['done', 'error', 'canceled'];

export function usePhotoUpload(options: UsePhotoUploadOptions): UsePhotoUploadApi {
  const { uid, sessionId, onUploaded, onCreditsChanged, maxAutoAttempts = 3, autoStart = true } = options;

  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [paused, setPaused] = useState(!autoStart);
  const [lastError, setLastError] = useState<string | null>(null);

  const handles = useRef<Map<string, UploadHandle>>(new Map());
  const running = useRef(false);
  const jobsRef = useRef<UploadJob[]>([]);

  jobsRef.current = jobs;

  const patchJob = useCallback((jobId: string, patch: Partial<UploadJob>) => {
    setJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, ...patch, updatedAt: Date.now() } : job))
    );
  }, []);

  const runJob = useCallback(
    async (job: UploadJob) => {
      if (!uid) return;
      const attempt = job.attempts + 1;
      patchJob(job.id, { status: 'preparing', progress: 0, error: null, attempts: attempt });

      // A thumbnail keeps the grid fast; failure here must never block the upload.
      let thumbnailUri: string | undefined;
      try {
        thumbnailUri = await makeThumbnail(job.uri);
      } catch {
        thumbnailUri = undefined;
      }

      const input: StartUploadInput = {
        uid,
        fileUri: job.uri,
        filterId: job.filterId,
        mode: job.mode,
        visibility: job.visibility,
        eventId: job.eventId,
        bookingId: job.bookingId,
        caption: job.caption,
        hashtags: job.hashtags,
        filterApplied: job.filterId !== 'none',
        width: job.width,
        height: job.height,
        sizeBytes: job.sizeBytes,
        idempotencyKey: job.idempotencyKey,
        sessionId,
        thumbnailUri,
      };

      const handle = startUpload(input, {
        onStatus: (status) => patchJob(job.id, { status }),
        onProgress: (progress) => patchJob(job.id, { progress }),
      });
      handles.current.set(job.id, handle);

      try {
        const outcome = await handle.promise;
        patchJob(job.id, {
          status: 'done',
          progress: 1,
          photoId: outcome.photoId,
          publicUrl: outcome.publicUrl,
          reservationId: outcome.reservationId,
          error: null,
        });
        onCreditsChanged?.(outcome.creditsRemaining);
        await onUploaded?.({ ...job, status: 'done', photoId: outcome.photoId, publicUrl: outcome.publicUrl });
      } catch (error) {
        const message = describeUploadError(error);
        const retryable = isRetryable(error) && attempt < maxAutoAttempts;
        patchJob(job.id, {
          status: retryable ? 'idle' : 'error',
          error: message,
          progress: 0,
        });
        setLastError(message);

        if (retryable) {
          const wait = backoffMs(attempt);
          setTimeout(() => {
            const latest = jobsRef.current.find((j) => j.id === job.id);
            if (latest && !paused) void runJob({ ...latest, attempts: attempt });
          }, wait);
        }
      } finally {
        handles.current.delete(job.id);
        if (thumbnailUri) void deleteLocal(thumbnailUri);
      }
    },
    [uid, sessionId, patchJob, onUploaded, onCreditsChanged, maxAutoAttempts, paused]
  );

  /** Drains the queue one job at a time. */
  useEffect(() => {
    if (paused || running.current || !uid) return;
    const next = jobs.find((job) => !TERMINAL.includes(job.status));
    if (!next) return;

    running.current = true;
    void runJob(next).finally(() => {
      running.current = false;
      // Nudge the effect again for the following job.
      setJobs((prev) => [...prev]);
    });
  }, [jobs, paused, uid, runJob]);

  const enqueue = useCallback((input: EnqueueUploadInput): string => {
    const jobId = input.jobId ?? localId('up');
    const now = Date.now();
    const job: UploadJob = {
      id: jobId,
      uri: input.uri,
      filterId: input.filterId,
      mode: input.mode ?? 'single',
      visibility: input.visibility ?? 'private',
      eventId: input.eventId ?? null,
      bookingId: input.bookingId ?? null,
      caption: input.caption,
      hashtags: input.hashtags,
      idempotencyKey: makeIdempotencyKey(uid ?? 'anon', input.uri, input.jobId ?? jobId),
      status: 'idle',
      progress: 0,
      attempts: 0,
      error: null,
      reservationId: null,
      photoId: null,
      publicUrl: null,
      sizeBytes: input.sizeBytes ?? 0,
      width: input.width,
      height: input.height,
      createdAt: now,
      updatedAt: now,
    };

    setJobs((prev) => {
      const existing = prev.findIndex((j) => j.id === jobId);
      if (existing >= 0) {
        const clone = [...prev];
        clone[existing] = { ...clone[existing], ...job, attempts: clone[existing].attempts };
        return clone;
      }
      return [...prev, job];
    });
    setLastError(null);
    return jobId;
  }, [uid]);

  const retry = useCallback(
    (jobId: string) => {
      if (!LIMITS.uploadAttempts) return;
      patchJob(jobId, { status: 'idle', error: null, progress: 0 });
      setLastError(null);
      setPaused(false);
    },
    [patchJob]
  );

  const retryAllFailed = useCallback(() => {
    setJobs((prev) =>
      prev.map((job) =>
        job.status === 'error' ? { ...job, status: 'idle', error: null, progress: 0 } : job
      )
    );
    setLastError(null);
    setPaused(false);
  }, []);

  const cancel = useCallback((jobId: string) => {
    handles.current.get(jobId)?.cancel();
    handles.current.delete(jobId);
    setJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, status: 'canceled', progress: 0 } : job))
    );
  }, []);

  const remove = useCallback(
    (jobId: string) => {
      handles.current.get(jobId)?.cancel();
      handles.current.delete(jobId);
      setJobs((prev) => prev.filter((job) => job.id !== jobId));
    },
    []
  );

  const clearFinished = useCallback(() => {
    setJobs((prev) => prev.filter((job) => !TERMINAL.includes(job.status)));
  }, []);

  // Cancel everything in flight when the screen unmounts.
  useEffect(
    () => () => {
      handles.current.forEach((handle) => handle.cancel());
      handles.current.clear();
    },
    []
  );

  const derived = useMemo(() => {
    const pending = jobs.filter((job) => !TERMINAL.includes(job.status));
    const failed = jobs.filter((job) => job.status === 'error');
    const done = jobs.filter((job) => job.status === 'done');
    const overall = pending.length
      ? pending.reduce((sum, job) => sum + (job.status === 'idle' ? 0 : job.progress), 0) / pending.length
      : 0;
    return {
      activeJob: pending[0] ?? null,
      queuedCount: pending.length,
      failedCount: failed.length,
      doneCount: done.length,
      overallProgress: overall,
      isBusy: pending.length > 0,
    };
  }, [jobs]);

  return {
    jobs,
    ...derived,
    lastError,
    enqueue,
    retry,
    retryAllFailed,
    cancel,
    remove,
    clearFinished,
    pause: useCallback(() => setPaused(true), []),
    resume: useCallback(() => setPaused(false), []),
    paused,
    resetError: useCallback(() => setLastError(null), []),
  };
}