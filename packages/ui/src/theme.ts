import type { CSSProperties } from "vue";

export type UiMode = "dark" | "light" | "system";
export type UiAccent = "orange" | "green";
export type UiSize = "small" | "medium" | "large";
export type UiVariant = "primary" | "secondary" | "ghost" | "danger";

const colorTokens = {
  "background/base": {
    "darkOrange": "#101010",
    "darkGreen": "#101010",
    "light": "#fcfbf9"
  },
  "background/canvas": {
    "darkOrange": "#141414",
    "darkGreen": "#141414",
    "light": "#f4f3f0"
  },
  "background/subtle": {
    "darkOrange": "#1a1a1a",
    "darkGreen": "#1a1a1a",
    "light": "#f1efeb"
  },
  "surface/raised": {
    "darkOrange": "#202020",
    "darkGreen": "#202020",
    "light": "#ffffff"
  },
  "text/primary": {
    "darkOrange": "#f3f0e8",
    "darkGreen": "#f3f0e8",
    "light": "#302e2b"
  },
  "text/body": {
    "darkOrange": "#cac7c0",
    "darkGreen": "#cac7c0",
    "light": "#5c5750"
  },
  "text/muted": {
    "darkOrange": "#8e8c86",
    "darkGreen": "#8e8c86",
    "light": "#70695f"
  },
  "text/onAccent": {
    "darkOrange": "#141414",
    "darkGreen": "#141414",
    "light": "#ffffff"
  },
  "border/default": {
    "darkOrange": "#343434",
    "darkGreen": "#343434",
    "light": "#e4dfd8"
  },
  "action/primary": {
    "darkOrange": "#ff6b35",
    "darkGreen": "#c3f15a",
    "light": "#35322f"
  },
  "action/hover": {
    "darkOrange": "#ff8b60",
    "darkGreen": "#d5ff82",
    "light": "#504b44"
  },
  "action/soft": {
    "darkOrange": "#352319",
    "darkGreen": "#2b351b",
    "light": "#eae6df"
  },
  "type/image": {
    "darkOrange": "#bdb8ae",
    "darkGreen": "#bdb8ae",
    "light": "#655c50"
  },
  "type/imageSoft": {
    "darkOrange": "#2b2a27",
    "darkGreen": "#2b2a27",
    "light": "#f0ede6"
  },
  "type/video": {
    "darkOrange": "#bdb8ae",
    "darkGreen": "#bdb8ae",
    "light": "#655c50"
  },
  "type/videoSoft": {
    "darkOrange": "#2b2a27",
    "darkGreen": "#2b2a27",
    "light": "#f0ede6"
  },
  "type/text": {
    "darkOrange": "#bdb8ae",
    "darkGreen": "#bdb8ae",
    "light": "#655c50"
  },
  "type/textSoft": {
    "darkOrange": "#2b2a27",
    "darkGreen": "#2b2a27",
    "light": "#f0ede6"
  },
  "type/audio": {
    "darkOrange": "#bdb8ae",
    "darkGreen": "#bdb8ae",
    "light": "#655c50"
  },
  "type/audioSoft": {
    "darkOrange": "#2b2a27",
    "darkGreen": "#2b2a27",
    "light": "#f0ede6"
  },
  "accent/coral": {
    "darkOrange": "#ff6b35",
    "darkGreen": "#c3f15a",
    "light": "#a1694c"
  },
  "accent/coralSoft": {
    "darkOrange": "#352319",
    "darkGreen": "#2b351b",
    "light": "#f5ece4"
  },
  "status/success": {
    "darkOrange": "#afc69a",
    "darkGreen": "#afc69a",
    "light": "#52725b"
  },
  "status/successSoft": {
    "darkOrange": "#263023",
    "darkGreen": "#263023",
    "light": "#eaf0e9"
  },
  "status/error": {
    "darkOrange": "#ff8d80",
    "darkGreen": "#ff8d80",
    "light": "#a64437"
  },
  "status/errorSoft": {
    "darkOrange": "#3a2423",
    "darkGreen": "#3a2423",
    "light": "#f8ece8"
  },
  "state/disabled": {
    "darkOrange": "#292929",
    "darkGreen": "#292929",
    "light": "#edeae5"
  },
  "state/disabledText": {
    "darkOrange": "#66645f",
    "darkGreen": "#66645f",
    "light": "#b0aaa1"
  },
  "action/pressed": {
    "darkOrange": "#df5728",
    "darkGreen": "#a7d440",
    "light": "#38332c"
  },
  "border/control": {
    "darkOrange": "#77736b",
    "darkGreen": "#77736b",
    "light": "#77736b"
  },
  "border/focus": {
    "darkOrange": "#ff6b35",
    "darkGreen": "#c3f15a",
    "light": "#35322f"
  },
  "surface/hover": {
    "darkOrange": "#292826",
    "darkGreen": "#292826",
    "light": "#eae6df"
  },
  "status/warning": {
    "darkOrange": "#e4c17b",
    "darkGreen": "#e4c17b",
    "light": "#e4c17b"
  },
  "status/warningSoft": {
    "darkOrange": "#332c1e",
    "darkGreen": "#332c1e",
    "light": "#332c1e"
  },
  "overlay/scrim": {
    "darkOrange": "#080808",
    "darkGreen": "#080808",
    "light": "#080808"
  }
};

function cssName(name: string) {
  return "--ui" + name.split("/").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function luminance(color: string) {
  const channels = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function mix(color: string, target: number, amount: number) { return "#" + [1, 3, 5].map(index => Math.round(parseInt(color.slice(index, index + 2), 16) * (1 - amount) + target * amount).toString(16).padStart(2, "0")).join(""); }

export function createUiTheme(mode: "dark" | "light", accent: UiAccent, fontScale = 100, radius = 8, primaryColor?: string): CSSProperties {
  const key = mode === "light" ? "light" : accent === "green" ? "darkGreen" : "darkOrange";
  const style: Record<string, string> = Object.fromEntries(Object.entries(colorTokens).map(([name, values]) => [cssName(name), values[key]]));
  style["--uiFontScale"] = String(Math.min(125, Math.max(85, Number.isFinite(fontScale) ? fontScale : 100)) / 100);
  style["--uiRadiusControl"] = String(Math.min(16, Math.max(0, Number.isFinite(radius) ? radius : 8))) + "px";
  style["--uiTextOnPressedAccent"] = style["--uiTextOnAccent"]!;
  if (primaryColor && /^#[0-9a-f]{6}$/i.test(primaryColor)) {
    const darkText = contrast(primaryColor, "#141414") >= contrast(primaryColor, "#ffffff");
    const pressed = mix(primaryColor, 0, 0.18);
    style["--uiActionPrimary"] = primaryColor;
    style["--uiActionHover"] = mix(primaryColor, darkText ? 255 : 0, 0.12);
    style["--uiActionPressed"] = pressed;
    style["--uiTextOnAccent"] = darkText ? "#141414" : "#ffffff";
    style["--uiTextOnPressedAccent"] = contrast(pressed, "#141414") >= contrast(pressed, "#ffffff") ? "#141414" : "#ffffff";
    style["--uiActionSoft"] = mix(primaryColor, mode === "dark" ? 20 : 255, 0.88);
    style["--uiAccentCoral"] = primaryColor;
    style["--uiAccentCoralSoft"] = style["--uiActionSoft"]!;
    style["--uiBorderFocus"] = contrast(primaryColor, style["--uiBackgroundBase"]!) >= 3 ? primaryColor : mix(primaryColor, mode === "dark" ? 255 : 0, 0.5);
  }
  return style;
}
