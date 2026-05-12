export type DebugLevel = "log" | "warn" | "error";

export interface DebugMessage {
  level: DebugLevel;
  message: string;
  line?: number;
  column?: number;
  timestamp: number;
}
