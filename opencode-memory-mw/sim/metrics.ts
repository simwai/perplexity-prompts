export interface TrustStabilityMetrics {
  window_size: number;
  calibration_delta: number;
  score_variance: number;
  outcome_rate: number;
}

export function computeStability(
  current: OracleMetrics,
  previous: OracleMetrics | null
): TrustStabilityMetrics {
  const calibration_delta = previous ? Math.abs(current.calibration_error - previous.calibration_error) : 0;

  const scores = [current.high_trust_rate, current.low_trust_rate];
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;

  return {
    window_size: current.total_outcomes,
    calibration_delta,
    score_variance: variance,
    outcome_rate: current.total_outcomes / Math.max(current.total_memories, 1),
  };
}
