/** Coach harness / model / thinking preferences (localStorage). */

export type CoachHarnessId = "codex" | "grok" | "opencode" | "claude";

export interface CoachPrefs {
  harness: CoachHarnessId;
  model: string;
  thinking: string;
}

export interface HarnessOption {
  id: CoachHarnessId;
  label: string;
  /** Curated model ids shown in the selector. */
  models: { id: string; label: string }[];
  defaultModel: string;
  thinkingLevels: { id: string; label: string }[];
  defaultThinking: string;
  /** Hint under the selector. */
  notes?: string;
}

export const HARNESS_OPTIONS: HarnessOption[] = [
  {
    id: "codex",
    label: "Codex",
    models: [
      { id: "gpt-5.6-sol", label: "gpt-5.6-sol" },
      { id: "gpt-5.6-luna", label: "gpt-5.6-luna" },
      { id: "gpt-5.6-terra", label: "gpt-5.6-terra" },
      { id: "gpt-5.5", label: "gpt-5.5" },
      { id: "gpt-5.4", label: "gpt-5.4" },
      { id: "gpt-5.4-mini", label: "gpt-5.4-mini" },
    ],
    defaultModel: "gpt-5.6-sol",
    thinkingLevels: [
      { id: "low", label: "low" },
      { id: "medium", label: "medium" },
      { id: "high", label: "high" },
    ],
    defaultThinking: "high",
    notes: "OpenAI Codex CLI (`codex exec`).",
  },
  {
    id: "grok",
    label: "Grok Build",
    models: [{ id: "grok-4.5", label: "grok-4.5" }],
    defaultModel: "grok-4.5",
    thinkingLevels: [
      { id: "low", label: "low" },
      { id: "medium", label: "medium" },
      { id: "high", label: "high" },
    ],
    defaultThinking: "medium",
    notes: "xAI Grok Build TUI (`grok -p`).",
  },
  {
    id: "opencode",
    label: "OpenCode",
    models: [
      { id: "opencode-go/grok-4.5", label: "opencode-go/grok-4.5" },
      { id: "opencode-go/gpt-5.6-luna", label: "opencode-go/gpt-5.6-luna" },
      { id: "opencode-go/kimi-k2.7-code", label: "opencode-go/kimi-k2.7-code" },
      { id: "opencode-go/minimax-m3", label: "opencode-go/minimax-m3" },
      { id: "opencode/big-pickle", label: "opencode/big-pickle" },
    ],
    defaultModel: "opencode-go/grok-4.5",
    thinkingLevels: [
      { id: "minimal", label: "minimal" },
      { id: "low", label: "low" },
      { id: "medium", label: "medium" },
      { id: "high", label: "high" },
      { id: "max", label: "max" },
    ],
    defaultThinking: "medium",
    notes: "OpenCode CLI (`opencode run`). Variant is provider-specific.",
  },
  {
    id: "claude",
    label: "Claude Code",
    models: [
      { id: "haiku", label: "haiku" },
      { id: "sonnet", label: "sonnet" },
      { id: "opus", label: "opus" },
      { id: "fable", label: "fable" },
    ],
    defaultModel: "sonnet",
    thinkingLevels: [
      { id: "low", label: "low" },
      { id: "medium", label: "medium" },
      { id: "high", label: "high" },
      { id: "xhigh", label: "xhigh" },
      { id: "max", label: "max" },
    ],
    defaultThinking: "medium",
    notes: "Anthropic Claude Code (`claude -p`). Tools disabled.",
  },
];

const PREFS_KEY = "bridge-tutor-coach-prefs-v1";

export const DEFAULT_PREFS: CoachPrefs = {
  harness: "codex",
  model: "gpt-5.6-sol",
  thinking: "high",
};

export function harnessOption(id: CoachHarnessId): HarnessOption {
  return HARNESS_OPTIONS.find((h) => h.id === id) ?? HARNESS_OPTIONS[0]!;
}

export function loadCoachPrefs(): CoachPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const data = JSON.parse(raw) as Partial<CoachPrefs>;
    const harness = HARNESS_OPTIONS.some((h) => h.id === data.harness)
      ? (data.harness as CoachHarnessId)
      : DEFAULT_PREFS.harness;
    const opt = harnessOption(harness);
    const model =
      typeof data.model === "string" && data.model.trim()
        ? data.model.trim()
        : opt.defaultModel;
    const thinking =
      typeof data.thinking === "string" && data.thinking.trim()
        ? data.thinking.trim()
        : opt.defaultThinking;
    return { harness, model, thinking };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveCoachPrefs(prefs: CoachPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/** When harness changes, snap model/thinking to that harness's defaults if needed. */
export function prefsForHarness(
  prev: CoachPrefs,
  harness: CoachHarnessId,
): CoachPrefs {
  if (prev.harness === harness) return prev;
  const opt = harnessOption(harness);
  return {
    harness,
    model: opt.defaultModel,
    thinking: opt.defaultThinking,
  };
}

export function formatCoachLabel(prefs: CoachPrefs): string {
  return `${prefs.harness} · ${prefs.model} · ${prefs.thinking}`;
}

/**
 * Short UI name for the selected harness (placeholder, badges, status).
 * "Sol" is kept only for the classic Codex + sol model path.
 */
export function coachUiName(prefs: CoachPrefs): string {
  switch (prefs.harness) {
    case "grok":
      return "Grok";
    case "opencode":
      return "OpenCode";
    case "claude":
      return "Claude";
    case "codex":
    default:
      return prefs.model.toLowerCase().includes("sol") ? "Sol" : "Codex";
  }
}
