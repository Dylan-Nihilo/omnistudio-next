import type { UiFieldRule } from "@toonflow/ui";

const fieldTypes = new Set(["input", "textarea", "inputNumber", "select", "switch", "checkbox", "radio", "slider", "colorPicker", "inputTag"]);
const ruleKeys = new Set(["type", "field", "title", "info", "value", "props", "options", "validate", "required", "control"]);
const fieldProps = new Set(["id", "name", "disabled", "readonly", "placeholder", "type", "clearable", "showPassword", "rows", "resize", "autosize", "min", "max", "step", "precision", "stepStrictly", "controls", "controlsPosition", "size", "maxlength", "minlength", "autocomplete", "spellcheck", "filterable", "allowCreate", "multiple", "noDataText", "vertical", "height", "marks", "showTooltip", "formatTooltip", "class", "style"]);
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function fieldName(value: unknown): value is string { return typeof value === "string" && !!value && !value.includes(".") && !["__proto__", "constructor", "prototype"].includes(value); }

// ACT: only lossless known rules use the new renderer; extensions stay in the compatibility island.
export function supportsUiRules(value: unknown): value is UiFieldRule[] {
  if (!Array.isArray(value)) return false;
  const fields = new Set<string>();
  for (const rule of value) {
    if (!record(rule) || typeof rule.type !== "string" || !fieldTypes.has(rule.type) || !fieldName(rule.field) || fields.has(rule.field)) return false;
    fields.add(rule.field);
    if (Object.keys(rule).some(key => !ruleKeys.has(key))) return false;
    if (rule.props !== undefined && (!record(rule.props) || Object.keys(rule.props).some(key => !fieldProps.has(key) && !key.startsWith("aria-") && !key.startsWith("data-")))) return false;
    if (rule.type === "input" && record(rule.props) && rule.props.type != null && !["text", "textarea", "password", "email", "url", "tel", "search"].includes(String(rule.props.type))) return false;
    if (rule.options !== undefined && (!Array.isArray(rule.options) || rule.options.some(option => !record(option) || typeof option.label !== "string" || !["string", "number", "boolean"].includes(typeof option.value) || Object.keys(option).some(key => !["label", "value", "disabled", "group", "icon"].includes(key))))) return false;
    if (rule.validate !== undefined && !Array.isArray(rule.validate)) return false;
  }
  return value.every(rule => rule.control === undefined || Array.isArray(rule.control) && rule.control.every((control: unknown) => record(control) && Object.keys(control).every(key => ["value", "method", "rule"].includes(key)) && [undefined, "required", "display"].includes(control.method as string | undefined) && Array.isArray(control.rule) && control.rule.every(field => fieldName(field) && fields.has(field))));
}
