import type { EditorClip } from "./editorModel";

const fontFamily = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
const graphemeSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined;

export async function waitForEditorTextFonts() {
  if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
}

export function drawEditorText(canvas: HTMLCanvasElement, clip: EditorClip, width: number, height: number) {
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) throw new Error("文字画面尺寸无效");
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建文字画面");
  context.clearRect(0, 0, width, height);

  const fontSize = width * (clip.fontSize ?? 4) / 100;
  const lineHeight = fontSize * 1.2;
  const maxWidth = width * 0.92;
  context.font = `600 ${fontSize}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lines: string[] = [];
  for (const paragraph of (clip.text ?? "").split("\n")) {
    let line = "";
    const characters = graphemeSegmenter ? Array.from(graphemeSegmenter.segment(paragraph), item => item.segment) : Array.from(paragraph);
    for (const character of characters) {
      if (line && context.measureText(line + character).width > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
    lines.push(line);
  }

  context.lineWidth = Math.max(2, fontSize * 0.1);
  context.lineJoin = "round";
  context.strokeStyle = "#000000";
  context.fillStyle = clip.textColor ?? "#ffffff";
  const x = width * (clip.textX ?? 50) / 100;
  const firstY = height * (clip.textY ?? 90) / 100 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => {
    context.strokeText(line, x, firstY + lineHeight * index, maxWidth);
    context.fillText(line, x, firstY + lineHeight * index, maxWidth);
  });
}

export async function renderEditorText(clip: EditorClip, width: number, height: number): Promise<Blob> {
  await waitForEditorTextFonts();
  const canvas = document.createElement("canvas");
  drawEditorText(canvas, clip, width, height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("文字画面编码失败")), "image/png"));
}
