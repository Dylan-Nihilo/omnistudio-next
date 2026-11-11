type FrameInfo = { imageUrl: string; duration: number };

type PendingFrame = {
  key: string;
  promise: Promise<FrameInfo>;
  controller: AbortController;
  waiters: number;
  state: "queued" | "running" | "settled";
};

const thumbnailWidth = 128;
const thumbnailHeight = 72;
const cacheLimit = 256;
const stepTimeout = 15000;

function createAbortError() {
  return new DOMException("视频缩略图生成已取消", "AbortError");
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw createAbortError();
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked", label: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onEvent = () => finish();
    const onError = () => finish(new Error(video.error?.message || "视频解码失败"));
    const onAbort = () => finish(createAbortError());
    const timer = setTimeout(() => finish(new Error(`${label}超时（15 秒）`)), stepTimeout);

    video.addEventListener(eventName, onEvent);
    video.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

export function createTimelineThumbnailGenerator() {
  const cache = new Map<string, FrameInfo>();
  const pending = new Map<string, PendingFrame>();
  let video: HTMLVideoElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let canvasContext: CanvasRenderingContext2D | null | undefined;
  let queue = Promise.resolve();
  let disposed = false;

  function getVideo() {
    if (!video) {
      video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
    }
    return video;
  }

  function getCanvasContext() {
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = thumbnailWidth;
      canvas.height = thumbnailHeight;
      canvasContext = canvas.getContext("2d", { alpha: false });
    }
    if (!canvasContext) throw new Error("无法创建视频缩略图画布");
    return canvasContext;
  }

  function cacheFrame(key: string, frame: FrameInfo) {
    cache.delete(key);
    cache.set(key, frame);
    if (cache.size > cacheLimit) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
  }

  async function renderFrame(source: string, time: number, signal: AbortSignal) {
    throwIfAborted(signal);
    const currentVideo = getVideo();
    if (currentVideo.src !== source || currentVideo.error) {
      currentVideo.pause();
      currentVideo.removeAttribute("src");
      currentVideo.load();
      const metadataReady = waitForVideoEvent(currentVideo, "loadedmetadata", "读取视频信息", signal);
      currentVideo.src = source;
      currentVideo.load();
      await metadataReady;
      throwIfAborted(signal);
      if (currentVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitForVideoEvent(currentVideo, "loadeddata", "读取视频帧", signal);
      }
    } else if (currentVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(currentVideo, "loadeddata", "读取视频帧", signal);
    }

    throwIfAborted(signal);
    if (!currentVideo.videoWidth || !currentVideo.videoHeight) throw new Error("视频没有可读取的画面");

    const lastFrameTime = Math.max(0, currentVideo.duration - 0.001);
    const targetTime = Math.min(time, Number.isFinite(lastFrameTime) ? lastFrameTime : time);
    if (currentVideo.seeking || Math.abs(currentVideo.currentTime - targetTime) > 0.0005) {
      const seeked = waitForVideoEvent(currentVideo, "seeked", "定位视频帧", signal);
      currentVideo.currentTime = targetTime;
      await seeked;
    }
    if (currentVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(currentVideo, "loadeddata", "读取视频帧", signal);
    }

    throwIfAborted(signal);
    if (Math.abs(currentVideo.currentTime - targetTime) > 0.05) throw new Error("视频未定位到请求的时间点");

    const sourceRatio = currentVideo.videoWidth / currentVideo.videoHeight;
    const targetRatio = thumbnailWidth / thumbnailHeight;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = currentVideo.videoWidth;
    let sourceHeight = currentVideo.videoHeight;
    if (sourceRatio > targetRatio) {
      sourceWidth = currentVideo.videoHeight * targetRatio;
      sourceX = (currentVideo.videoWidth - sourceWidth) / 2;
    } else {
      sourceHeight = currentVideo.videoWidth / targetRatio;
      sourceY = (currentVideo.videoHeight - sourceHeight) / 2;
    }

    const context = getCanvasContext();
    context.drawImage(currentVideo, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, thumbnailWidth, thumbnailHeight);
    throwIfAborted(signal);
    return { imageUrl: canvas!.toDataURL("image/jpeg", 0.76), duration: currentVideo.duration };
  }

  function createPendingFrame(key: string, source: string, time: number): PendingFrame {
    const record: PendingFrame = {
      key,
      promise: Promise.resolve({ imageUrl: "", duration: 0 }),
      controller: new AbortController(),
      waiters: 0,
      state: "queued",
    };
    const job = queue.then(async () => {
      if (disposed || record.controller.signal.aborted) throw createAbortError();
      record.state = "running";
      return renderFrame(source, time, record.controller.signal);
    });
    queue = job.then(() => undefined, () => undefined);
    record.promise = job.then(frame => {
      if (disposed || record.controller.signal.aborted) throw createAbortError();
      cacheFrame(key, frame);
      return frame;
    }).finally(() => {
      record.state = "settled";
      if (pending.get(key) === record) pending.delete(key);
    });
    pending.set(key, record);
    return record;
  }

  function waitForCaller(record: PendingFrame, signal?: AbortSignal) {
    if (signal?.aborted) return Promise.reject(createAbortError());
    record.waiters++;
    return waitWithSignal(record.promise, signal).then(frameInfo => {
      if (disposed) throw createAbortError();
      return frameInfo;
    }).finally(() => {
      record.waiters--;
      if (!disposed && record.waiters === 0 && record.state === "queued") {
        record.controller.abort();
        if (pending.get(record.key) === record) pending.delete(record.key);
      }
    });
  }

  function waitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(createAbortError());
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(createAbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(value => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      }, error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
      if (signal.aborted) onAbort();
    });
  }

  function getFrameInfo(source: string, time: number, signal?: AbortSignal): Promise<FrameInfo> {
    if (disposed || signal?.aborted) return Promise.reject(createAbortError());
    if (typeof source !== "string" || !source.trim()) return Promise.reject(new Error("视频地址不能为空"));
    if (!Number.isFinite(time) || time < 0) return Promise.reject(new Error("视频时间点无效"));

    let normalizedSource: string;
    try {
      normalizedSource = new URL(source, document.baseURI).href;
    } catch {
      return Promise.reject(new Error("视频地址无效"));
    }
    const normalizedTime = Number(time.toFixed(3));
    const key = `${normalizedSource}\u0000${normalizedTime.toFixed(3)}`;
    const cachedFrameInfo = cache.get(key);
    if (cachedFrameInfo) {
      cache.delete(key);
      cache.set(key, cachedFrameInfo);
      return waitWithSignal(Promise.resolve(cachedFrameInfo), signal).then(frameInfo => {
        if (disposed) throw createAbortError();
        return frameInfo;
      });
    }

    let record = pending.get(key);
    if (!record || record.controller.signal.aborted) record = createPendingFrame(key, normalizedSource, normalizedTime);
    return waitForCaller(record, signal);
  }

  function getFrame(source: string, time: number, signal?: AbortSignal): Promise<string> {
    return getFrameInfo(source, time, signal).then(frameInfo => frameInfo.imageUrl);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const activeFrames = [...pending.values()];
    pending.clear();
    for (const frame of activeFrames) frame.controller.abort();
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      video = undefined;
    }
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas = undefined;
      canvasContext = undefined;
    }
    cache.clear();
    queue = Promise.resolve();
  }

  return { getFrame, getFrameInfo, dispose };
}
