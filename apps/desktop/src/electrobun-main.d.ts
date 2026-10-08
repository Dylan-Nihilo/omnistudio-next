declare module "electrobun/main" {
  const Electrobun: {
    events: {
      on(event: string, listener: (event: { data: any }) => void): void;
    };
  };

  export default Electrobun;
  export const BrowserWindow: any;
  export const PATHS: any;
  export const Screen: any;
  export const Utils: any;
  export const Updater: any;
}
