import styleCatalog from "./productionStylePresets.json";

export type ProductionStylePreset = (typeof styleCatalog.presets)[number];

export const productionStylePresets = styleCatalog.presets;
export const productionStyleCategories = styleCatalog.categories;
export const defaultProductionStyle = "现代赛璐璐日漫";

const legacyStyleAliases: Record<string, string> = {
  "国漫电影感": "现代赛璐璐日漫",
  "国漫": "现代赛璐璐日漫",
  "电影感": "电影级写实",
};

export function findProductionStyle(value: string): ProductionStylePreset | undefined {
  const normalizedValue = legacyStyleAliases[value] ?? value;
  return productionStylePresets.find(preset => preset.id === normalizedValue || preset.nameZh === normalizedValue || preset.name === normalizedValue);
}
