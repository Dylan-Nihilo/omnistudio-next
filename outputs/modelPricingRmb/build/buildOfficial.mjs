import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = process.cwd() + "\\outputs\\modelPricingRmb";
const workbook = Workbook.create();
const sheet = workbook.worksheets.add("人民币价格表");
sheet.showGridLines = false;
sheet.tabColor = "#1F4E78";

const rows = [
  ["系统视频模型官方人民币价格表", null, null, null, null, null, null, null, null],
  ["Seedance 与 MiniMax 按官方价格重算；Seedance T/I2V、V2V 均按官方原价（0%加价）", null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null],
  ["统一口径", "人民币；Seedance按官方Token公式换算，MiniMax按7.2元/美元换算", null, null, null, null, null, null, null],
  ["Seedance公式", "Token≈(输入秒+输出秒)×宽×高×24÷1024；T/I2V输入秒=0；V2V示例按输入时长=输出时长", null, null, null, null, null, null, null],
  ["分辨率假设", "480P=832×480；720P=1280×720；1080P=1920×1080；4K=3840×2160", null, null, null, null, null, null],
  ["价格来源", "Seedance：你提供的官方价格截图；MiniMax：官方资料中的0.07/0.11美元/秒；汇率假设7.2元/美元", null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null],
  ["Seedance 官方原价：元/秒、元/分钟", null, null, null, null, null, null, null, null],
  ["模型", "分辨率", "官方价：不含视频（元/百万Token）", "官方价：含视频（元/百万Token）", "T/I2V官方原价（元/秒）", "T/I2V官方原价（元/分钟）", "V2V官方原价（元/秒）*", "V2V官方原价（元/分钟）*", "说明"],
  ["Seedance 2.0", "480P", 46, 28, 0.43056, 25.8336, 0.52416, 31.4496, "T/I2V输入0秒；V2V按输入=输出"],
  ["Seedance 2.0", "720P", 46, 28, 0.9936, 59.616, 1.2096, 72.576, "T/I2V输入0秒；V2V按输入=输出"],
  ["Seedance 2.0", "1080P", 51, 31, 2.4786, 148.716, 3.0132, 180.792, "T/I2V输入0秒；V2V按输入=输出"],
  ["Seedance 2.0", "4K", 26, 16, 5.0544, 303.264, 6.2208, 373.248, "T/I2V输入0秒；V2V按输入=输出"],
  ["Seedance 2.5", "480P", 70, 42, 0.6552, 39.312, 0.78624, 47.1744, "T/I2V输入0秒；V2V按输入=输出"],
  ["Seedance 2.5", "720P", 70, 42, 1.512, 90.72, 1.8144, 108.864, "T/I2V输入0秒；V2V按输入=输出"],
  ["Seedance 2.5", "1080P", 77, 46, 3.7422, 224.532, 4.4712, 268.272, "T/I2V输入0秒；V2V按输入=输出"],
  [null, null, null, null, null, null, null, null, null],
  ["MiniMax H3 官方原价", null, null, null, null, null, null, null, null],
  ["模型", "分辨率", "官方价（美元/秒）", "汇率（元/美元）", "官方原价（元/秒）", "官方原价（元/分钟）", "V2V", "供应商", "说明"],
  ["MiniMax H3", "768P", 0.07, 7.2, 0.504, 30.24, "不适用", "阿里云百炼", "当前适配器不支持视频参考；支持图生视频"],
  ["MiniMax H3", "2K", 0.11, 7.2, 0.792, 47.52, "不适用", "阿里云百炼", "当前适配器不支持视频参考；支持图生视频"],
  [null, null, null, null, null, null, null, null, null],
  ["其他启用模型（维持原人民币计费口径）", null, null, null, null, null, null, null, null],
  ["文本模型：人民币/百万Token", null, null, null, null, null, null, null, null],
  ["模型", "供应商", "输入", "缓存读取", "缓存写入", "输出", "计费单位", null, null],
  ["DeepSeek V4.1 Flash", "阿里云百炼", 3.78, 0.378, 4.725, 30.24, "元/百万Token", null, null],
  ["Qwen 3.7 Plus", "阿里云百炼", 3.78, 0.378, 4.725, 30.24, "元/百万Token", null, null],
  ["GPT 5.6 Sol", "Kaizo", 7.56, 0.756, 9.45, 60.48, "元/百万Token", null, null],
  ["Claude Opus 5", "Kaizo Claude", 11.34, 1.134, 14.175, 90.72, "元/百万Token", null, null],
  [null, null, null, null, null, null, null, null, null],
  ["图片模型：人民币/张", null, null, null, null, null, null, null, null],
  ["模型", "供应商", "1K", "2K", "4K", "计费单位", null, null, null],
  ["GPT Image 2", "OpenHeap", 0.3, 0.5, 0.6, "元/张", null, null, null],
  ["Gemini 3.1 Flash Image", "OpenHeap", 0.4, null, null, "元/张", null, null, null],
  ["GPT Image 2.5 Sunburst", "OpenHeap", 0.4, 0.6, 0.7, "元/张", null, null, null],
  [null, null, null, null, null, null, null, null, null],
  ["说明", null, null, null, null, null, null, null, null],
  ["1", "本次Seedance T/I2V、V2V价格列均填官方原价，不叠加此前讨论的25%加价。", null, null, null, null, null, null, null],
  ["2", "V2V价格不是固定价；表内按输入视频时长=输出视频时长的示例。实际价格按官方usage.total_tokens结算。", null, null, null, null, null, null, null],
  ["3", "MiniMax官方价按0.07/0.11美元每秒和7.2元/美元换算；如汇率或官方价变化，应同步更新。", null, null, null, null, null, null, null],
  ["4", "480P按832×480计算；若供应商实际返回896×480，480P换算结果需按实际像素重新计算。", null, null, null, null, null, null, null],
];
sheet.getRange(`A1:I${rows.length}`).values = rows;

const title = sheet.getRange("A1:I1");
title.format = { fill: "#17365D", font: { bold: true, size: 16, color: "#FFFFFF" }, verticalAlignment: "center" };
title.format.rowHeight = 30;
sheet.mergeCells("A1:I1");
sheet.mergeCells("A2:I2");
const sub = sheet.getRange("A2:I2");
sub.format = { fill: "#D9EAF7", font: { italic: true, size: 10, color: "#17365D" }, wrapText: true, verticalAlignment: "center" };
sub.format.rowHeight = 25;

for (const addr of ["A9:I9", "A19:I19", "A24:I24", "A25:I25", "A32:I32", "A39:I39"]) {
  const r = sheet.getRange(addr);
  r.format = { fill: "#D9EAF7", font: { bold: true, size: 11, color: "#17365D" }, verticalAlignment: "center" };
}
for (const addr of ["A10:I10", "A20:I20", "A26:I26", "A33:I33"]) {
  const r = sheet.getRange(addr);
  r.format = { fill: "#1F4E78", font: { bold: true, size: 10, color: "#FFFFFF" }, wrapText: true, horizontalAlignment: "center", verticalAlignment: "center" };
  r.format.rowHeight = 32;
}
const bodyRanges = ["A11:I17", "A21:I22", "A27:G30", "A34:F36", "A40:B43"];
for (const addr of bodyRanges) {
  const r = sheet.getRange(addr);
  r.format = { font: { size: 10, color: "#1F2937" }, wrapText: true, verticalAlignment: "center", borders: { preset: "all", style: "thin", color: "#D9E2F3" } };
}
const moneyRanges = ["C11:H17", "C21:F22", "C27:F30", "C34:E36"];
for (const addr of moneyRanges) sheet.getRange(addr).format.numberFormat = "¥#,##0.000###";
sheet.getRange("D21:D22").format.numberFormat = "0.00";
sheet.getRange("A4:B7").format = { font: { size: 10, color: "#1F2937" }, wrapText: true, verticalAlignment: "center" };
sheet.getRange("A4:A7").format.font = { bold: true, color: "#17365D" };
sheet.getRange("A40:A43").format = { font: { bold: true, size: 10, color: "#17365D" }, verticalAlignment: "center" };
sheet.getRange("B40:B43").format = { font: { size: 10, color: "#1F2937" }, wrapText: true, verticalAlignment: "center" };

const widths = [22, 18, 20, 20, 19, 20, 19, 20, 38];
for (let i = 0; i < widths.length; i++) sheet.getRangeByIndexes(0, i, rows.length, 1).format.columnWidth = widths[i];
sheet.getRange(`A1:I${rows.length}`).format.verticalAlignment = "center";
sheet.freezePanes.freezeRows(10);
await workbook.recalculate();
const inspect = await workbook.inspect({ kind: "workbook,sheet,table,region", sheetId: "人民币价格表", range: `A1:I${rows.length}`, maxChars: 12000, tableMaxRows: 50, tableMaxCols: 12 });
await fs.writeFile(`${outputDir}/模型人民币价格表.xlsx.inspect.ndjson`, inspect.ndjson ?? String(inspect), "utf8");
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?", options: { useRegex: true, maxResults: 100 }, maxChars: 4000 });
await fs.writeFile(`${outputDir}/模型人民币价格表.xlsx.errors.ndjson`, errors.ndjson ?? String(errors), "utf8");
const preview = await workbook.render({ sheetName: "人民币价格表", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/人民币价格表.png`, new Uint8Array(await preview.arrayBuffer()));
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(`${outputDir}/模型人民币价格表.xlsx`);
console.log(JSON.stringify({output: `${outputDir}/模型人民币价格表.xlsx`, rows: rows.length, inspect: `${outputDir}/模型人民币价格表.xlsx.inspect.ndjson`, errors: `${outputDir}/模型人民币价格表.xlsx.errors.ndjson`, preview: `${outputDir}/人民币价格表.png`}));
