import type { Regime, RegimeConfig } from "./regimes.js";

export interface PolicyDecision {
  regime: Regime;
  actions: string[];
  rationale: string;
}

export function applyRegime(regime: Regime, config: RegimeConfig): PolicyDecision {
  const actions: string[] = [];

  if (regime === "quarantine") {
    actions.push("freeze_tuning");
    actions.push("require_manual_review");
    actions.push("exclude_low_evidence");
  } else if (regime === "degraded") {
    actions.push("increase_min_evidence");
    actions.push("raise_invalidation_threshold");
  } else if (regime === "watch") {
    actions.push("log_anomalies");
    actions.push("prepare_rollback_params");
  } else {
    actions.push("auto_tune_enabled");
  }

  return {
    regime,
    actions,
    rationale: `Regime ${regime}: applying ${actions.join(", ")} with decay=${config.decay_rate}, min_evidence=${config.min_evidence}`,
  };
}
