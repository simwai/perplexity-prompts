import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { ABLATION_NAMES, EPISODES, KEY_COUNT, SHIFT_AT, flippedTypes, runAblation, runDecisive } from "./experiment.js";
import { buildCorpus, keywordRanker, mwRanker, ndcgAt, recencyRanker, rrfFuse } from "./retrieval.js";
import { breadthFirst, buildGraph, personalizedPageRank, recallAt, relevantSet } from "./graph.js";
import { runAssociationStream } from "./hebbian.js";
import { runBandit } from "./ranking.js";

const SEED = 20260923;

function row(cells: Array<string | number>): string {
  return `| ${cells.join(" | ")} |`;
}

async function main(): Promise<void> {
  const result = runDecisive(SEED);
  const lines: string[] = [];
  lines.push("# Stage 4 Report — Decisive Experiment");
  lines.push("");
  lines.push(`Seed: ${result.seed} (fixed; reruns reproduce every number below).`);
  lines.push(`Episodes: ${EPISODES} per regime; Regime B shifts at episode ${SHIFT_AT}; keys: ${KEY_COUNT}.`);
  lines.push(`Decay lambda from Regime-A sweep: ${result.decayLambda}.`);
  lines.push(`Caveats: synthetic keyed facts, clean outcome observation, exploratory constants; no LLM in the loop.`);
  lines.push("");
  lines.push(row(["policy", "regret A", "regret B", "stale rate B", "TTR B", "calibration B"]));
  lines.push(row(["---", "---:", "---:", "---:", "---:", "---:"]));
  for (const report of result.reports) {
    lines.push(
      row([
        report.policy,
        report.regretA,
        report.regretB,
        report.staleRateB.toFixed(3),
        report.ttrB === null ? "unbounded" : report.ttrB,
        report.calibrationB.toFixed(3),
      ]),
    );
  }
  lines.push("");
  lines.push(`Verdict: ${result.verdict}`);
  lines.push(`Rationale: ${result.rationale}`);
  lines.push("");
  const root = join(process.cwd(), "opencode-memory-mw");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "STAGE4-REPORT.md"), lines.join("\n") + "\n", "utf-8");

  const ablation: string[] = [];
  ablation.push("# Ablations — Regime B knockouts");
  ablation.push("");
  ablation.push(`Seed: ${SEED} (fixed). Regime B flips task types: ${flippedTypes(SEED).join(", ")}.`);
  ablation.push("Null results reported, not hidden.");
  ablation.push("");
  ablation.push(row(["ablation", "regret B", "stale rate B", "TTR B", "note"]));
  ablation.push(row(["---", "---:", "---:", "---:", "---"]));
  for (const name of ABLATION_NAMES) {
    const report = runAblation(name, SEED, result.decayLambda);
    ablation.push(
      row([
        name,
        report.regretB,
        report.staleRateB.toFixed(3),
        report.ttrB === null ? "unbounded" : report.ttrB,
        report.note,
      ]),
    );
  }
  ablation.push("");
  await writeFile(join(root, "sim", "ABLATIONS.md"), ablation.join("\n") + "\n", "utf-8");

  const retrieval: string[] = [];
  retrieval.push("# Retrieval Stages 9-12 — ship verdicts");
  retrieval.push("");
  retrieval.push(`Seed: ${SEED} (fixed). Bars pre-registered: RRF clears keyword-only by 5 NDCG points; PPR beats BFS recall; Hebbian beats static; bandit beats static keyword.`);
  retrieval.push("");

  const corpus = buildCorpus(SEED);
  const keywordScore = ndcgAt(keywordRanker(corpus.query, corpus.docs), corpus.query.relevant, 10);
  const fusedScore = ndcgAt(
    rrfFuse([keywordRanker(corpus.query, corpus.docs), mwRanker(corpus.docs), recencyRanker(corpus.docs)]),
    corpus.query.relevant,
    10,
  );
  const rrfVerdict = fusedScore >= keywordScore + 0.05 ? "SHIPPED" : "NOT SHIPPED";
  retrieval.push(`RRF: ${rrfVerdict} (fused ${fusedScore.toFixed(3)} vs keyword ${keywordScore.toFixed(3)})`);

  const graph = buildGraph(SEED);
  const graphQuery = 7;
  const graphRelevant = relevantSet(graph, graphQuery);
  const bfsRecall = recallAt(breadthFirst(graph, graphQuery, 100), graphRelevant, 100);
  const pprRecall = recallAt(personalizedPageRank(graph, graphQuery), graphRelevant, 100);
  const pprVerdict = pprRecall > bfsRecall ? "SHIPPED" : "NOT SHIPPED";
  retrieval.push(`PPR: ${pprVerdict} (ppr recall ${pprRecall.toFixed(3)} vs bfs ${bfsRecall.toFixed(3)} at 2000 nodes)`);

  const stream = runAssociationStream(SEED);
  const hebbianVerdict = stream.boostedHits > stream.staticHits ? "SHIPPED" : "NOT SHIPPED";
  retrieval.push(`Hebbian: ${hebbianVerdict} (boosted ${stream.boostedHits} vs static ${stream.staticHits} hits)`);

  const bandit = runBandit(SEED);
  const rankingVerdict = bandit.cumulative > bandit.staticKeyword ? "SHIPPED" : "NOT SHIPPED";
  retrieval.push(`Ranking: ${rankingVerdict} (bandit ${bandit.cumulative.toFixed(1)} vs static ${bandit.staticKeyword.toFixed(1)})`);
  retrieval.push("");
  await writeFile(join(root, "sim", "RETRIEVAL.md"), retrieval.join("\n") + "\n", "utf-8");
}

await main();
