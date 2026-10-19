import type { BrowserFfmpegFactory, BrowserFfmpegCommand } from "@omnistudio-next/nodes-scaffold/runtime";

export type ComposeProgress = { percent?: number; timemark?: string };

export async function composeVideos(
  ffmpegFactory: BrowserFfmpegFactory,
  inputPaths: readonly string[],
  outputPath: string,
  signal: AbortSignal,
  onProgress?: (progress: ComposeProgress) => void,
): Promise<void> {
  signal.throwIfAborted();
  if (inputPaths.length < 2) {
    throw new Error("至少需要 2 个视频片段才能进行拼接");
  }

  return new Promise<void>((resolve, reject) => {
    let command: BrowserFfmpegCommand | undefined;
    let completed = false;

    const cleanup = () => {
      completed = true;
      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      if (completed) return;
      try {
        command?.kill("SIGKILL");
      } catch {
        // 忽略杀死进程时的非致命异常
      }
      cleanup();
      reject(signal.reason ?? new Error("拼接任务已取消"));
    };

    signal.addEventListener("abort", onAbort, { once: true });

    try {
      command = ffmpegFactory(inputPaths[0]);
      for (let i = 1; i < inputPaths.length; i++) {
        command.input(inputPaths[i]);
      }

      command.on("progress", (progress: { percent?: number; timemark?: string }) => {
        if (!completed) {
          onProgress?.({ percent: progress.percent, timemark: progress.timemark });
        }
      });

      command.on("error", (err: unknown) => {
        if (completed) return;
        cleanup();
        const rawMessage = err instanceof Error ? err.message : String(err);
        if (signal.aborted) {
          reject(signal.reason ?? new Error("拼接任务已取消"));
          return;
        }
        if (/parameters not compatible|different format|non-matching/i.test(rawMessage)) {
          reject(new Error("视频参数不兼容，请统一分辨率、帧率或音频轨后重试"));
          return;
        }
        reject(err instanceof Error ? err : new Error(rawMessage || "FFmpeg 拼接视频失败"));
      });

      command.on("end", () => {
        if (completed) return;
        cleanup();
        resolve();
      });

      command.concat(outputPath);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}
