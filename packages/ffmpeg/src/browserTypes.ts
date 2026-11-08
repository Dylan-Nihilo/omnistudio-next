import type { FfmpegCommand, FfmpegCommandOptions, FfmpegFactory } from "./types";

export const chainMethods = ["input", "inputOptions", "videoCodec", "audioCodec", "audioBitrate", "outputFps", "duration", "outputOptions", "output"] as const satisfies readonly (keyof FfmpegCommand)[];
export const runMethods = ["run"] as const satisfies readonly (keyof FfmpegCommand)[];
export const queryMethods = ["ffprobe"] as const satisfies readonly (keyof FfmpegCommand)[];

export type BrowserFfmpegOptions = Pick<FfmpegCommandOptions, "timeout">;
export type FfmpegCall = { method: string; args: unknown[]; undefinedArgs?: number[] };
export type BrowserFfmpegRequest = { directory: string; requestId: string; options: BrowserFfmpegOptions; calls: FfmpegCall[]; operation: FfmpegCall };
export type FfmpegRemoteEvent = { event: string; args: unknown[] };

export type BrowserFfmpegEvents = {
  start: [command: string];
  progress: [progress: { frames: number; currentFps: number; currentKbps: number; targetSize: number; timemark: string; percent?: number }];
  stderr: [line: string];
  codecData: [data: { format: string; audio: string; audio_details: string[]; video: string; video_details: string[]; duration: string }];
  filenames: [filenames: string[]];
  end: [stdout: string | null, stderr: string | null];
  error: [error: Error, stdout?: string | null, stderr?: string | null];
};

/** 浏览器仅保留剪辑台导出和媒体探测需要的 fluent API。 */
export type BrowserFfmpegCommand = Pick<FfmpegCommand, typeof queryMethods[number]> & {
  input(path: string): BrowserFfmpegCommand;
  inputOptions(options: string[]): BrowserFfmpegCommand;
  videoCodec(codec: "libx264"): BrowserFfmpegCommand;
  audioCodec(codec: "aac"): BrowserFfmpegCommand;
  audioBitrate(bitrate: "192k"): BrowserFfmpegCommand;
  outputFps(fps: number): BrowserFfmpegCommand;
  duration(seconds: number): BrowserFfmpegCommand;
  outputOptions(options: string[]): BrowserFfmpegCommand;
  output(path: string): BrowserFfmpegCommand;
  composeVideos(inputPaths: readonly string[], outputPath: string): BrowserFfmpegCommand;
  on<K extends keyof BrowserFfmpegEvents>(event: K, listener: (...args: BrowserFfmpegEvents[K]) => void): BrowserFfmpegCommand;
  once: BrowserFfmpegCommand["on"];
  addListener: BrowserFfmpegCommand["on"];
  off: BrowserFfmpegCommand["on"];
  removeListener: BrowserFfmpegCommand["on"];
  removeAllListeners(event?: keyof BrowserFfmpegEvents): BrowserFfmpegCommand;
  run(): void;
  kill(signal?: "SIGKILL" | "SIGTERM"): BrowserFfmpegCommand;
};

export interface BrowserFfmpegFactory extends Pick<FfmpegFactory, typeof queryMethods[number]> {
  (options?: BrowserFfmpegOptions): BrowserFfmpegCommand;
  (input?: string, options?: BrowserFfmpegOptions): BrowserFfmpegCommand;
}
