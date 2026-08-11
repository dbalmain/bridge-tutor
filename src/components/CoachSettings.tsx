import { useMemo } from "react";
import {
  HARNESS_OPTIONS,
  harnessOption,
  type CoachHarnessId,
  type CoachPrefs,
} from "../lib/coachConfig";

const CUSTOM = "__custom__";

type Props = {
  prefs: CoachPrefs;
  onChange: (next: CoachPrefs) => void;
  /** When true, controls are disabled (e.g. mid-turn thinking). */
  disabled?: boolean;
  /** Server-reported availability; missing ⇒ assume available. */
  available?: Partial<Record<CoachHarnessId, boolean>>;
};

export function CoachSettings({
  prefs,
  onChange,
  disabled = false,
  available,
}: Props) {
  const opt = harnessOption(prefs.harness);

  const modelSelectValue = useMemo(() => {
    if (opt.models.some((m) => m.id === prefs.model)) return prefs.model;
    return CUSTOM;
  }, [opt.models, prefs.model]);

  const thinkingSelectValue = useMemo(() => {
    if (opt.thinkingLevels.some((t) => t.id === prefs.thinking)) {
      return prefs.thinking;
    }
    return CUSTOM;
  }, [opt.thinkingLevels, prefs.thinking]);

  return (
    <div className="coach-settings">
      <label className="coach-settings__field">
        <span className="coach-settings__label">Harness</span>
        <select
          className="coach-settings__select"
          value={prefs.harness}
          disabled={disabled}
          onChange={(e) => {
            const harness = e.target.value as CoachHarnessId;
            const next = harnessOption(harness);
            onChange({
              harness,
              model: next.defaultModel,
              thinking: next.defaultThinking,
            });
          }}
        >
          {HARNESS_OPTIONS.map((h) => {
            const ok = available?.[h.id] !== false;
            return (
              <option key={h.id} value={h.id} disabled={!ok}>
                {h.label}
                {!ok ? " (not found)" : ""}
              </option>
            );
          })}
        </select>
      </label>

      <label className="coach-settings__field">
        <span className="coach-settings__label">Model</span>
        <select
          className="coach-settings__select"
          value={modelSelectValue}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM) {
              const custom = window.prompt("Custom model id", prefs.model);
              if (custom && custom.trim()) {
                onChange({ ...prefs, model: custom.trim() });
              }
              return;
            }
            onChange({ ...prefs, model: v });
          }}
        >
          {opt.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          <option value={CUSTOM}>
            {modelSelectValue === CUSTOM
              ? `Custom: ${prefs.model}`
              : "Custom…"}
          </option>
        </select>
      </label>

      <label className="coach-settings__field">
        <span className="coach-settings__label">Thinking</span>
        <select
          className="coach-settings__select"
          value={thinkingSelectValue}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM) {
              const custom = window.prompt(
                "Custom thinking / effort / variant",
                prefs.thinking,
              );
              if (custom && custom.trim()) {
                onChange({ ...prefs, thinking: custom.trim() });
              }
              return;
            }
            onChange({ ...prefs, thinking: v });
          }}
        >
          {opt.thinkingLevels.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
          <option value={CUSTOM}>
            {thinkingSelectValue === CUSTOM
              ? `Custom: ${prefs.thinking}`
              : "Custom…"}
          </option>
        </select>
      </label>
    </div>
  );
}
