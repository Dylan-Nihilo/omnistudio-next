export type RichInputReference = { id: string; name: string; avatar?: string | URL; pinyin?: string; value: string };

export type RichInputTag =
  | { type: "Write"; text: string }
  | { type: "Mention"; id: string; name: string }
  | { type: "Trigger"; id: string; name: string; key: string }
  | { type: "Select"; id: string; name: string; key: string }
  | { type: "Input"; key: string; placeholder: string; text?: string }
  | { type: "Custom"; html: string };

export type RichInputModel = RichInputTag[][];
