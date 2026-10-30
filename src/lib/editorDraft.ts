export interface DraftContent {
  name: string; files: { name: string; code: string }[]; notes: string; libraries: string[]; p5Version: string;
}
export interface EditorDraft { schema: 1; base: string; updatedAt: number; content: DraftContent }
export const draftKey = (project: string | null) => `p5studio-draft-v1:${project === null ? "new" : `project:${project}`}`;
export function parseDraft(raw: string): EditorDraft {
  const value = JSON.parse(raw) as EditorDraft;
  const c = value?.content;
  if (value?.schema !== 1 || typeof value.base !== "string" || !Number.isFinite(value.updatedAt)
    || !c || typeof c.name !== "string" || typeof c.notes !== "string" || typeof c.p5Version !== "string"
    || !Array.isArray(c.libraries) || !c.libraries.every((item) => typeof item === "string")
    || !Array.isArray(c.files) || !c.files.length || !c.files.every((f) => typeof f?.name === "string" && typeof f?.code === "string")
    || new Set(c.files.map((f) => f.name)).size !== c.files.length) throw new Error("Invalid recovery draft");
  return value;
}
