export interface ElectrobunConfig {
  app: Record<string, unknown>;
  build: Record<string, unknown>;
  release?: Record<string, unknown>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}
