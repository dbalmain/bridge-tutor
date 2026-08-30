/**
 * The point count exists twice: once in the Rust tree (`Hand::hcp`,
 * `length_points`, `opening_points`, `shape`) and once in TypeScript
 * (`src/lib/handPoints.ts`), which is what the UI actually renders. Nothing
 * makes them agree, so this asserts they do — over real deals from the
 * sidecar, not fixtures, since the drill generator is what produces the hands
 * a learner sees.
 *
 * Run with the sidecar up:  npm run system   (then)  npm run test:points
 */
import { handPoints } from "../src/lib/handPoints";
import type { Card } from "../src/lib/types";

const BASE = process.env.SYSTEM_URL ?? "http://127.0.0.1:8788";
const DRILLS = Number(process.env.DRILLS ?? 150);

interface DrillReply {
  leaf_id: string;
  hands: { N: Card[]; E: Card[]; S: Card[]; W: Card[] };
  south_hcp: number;
  south_opening_points: number;
  south_shape: string;
  error?: string;
}

async function drill(seed: number): Promise<DrillReply | null> {
  const res = await fetch(`${BASE}/next-drill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ progress: {}, family: "all", seed }),
  });
  const body = (await res.json()) as DrillReply;
  return body.error ? null : body;
}

/** What the server said, against what the UI would draw. */
function compare(d: DrillReply, cards: Card[]): string[] {
  const p = handPoints(cards);
  const bad: string[] = [];
  if (p.hcp !== d.south_hcp) {
    bad.push(`hcp ${p.hcp} (ts) vs ${d.south_hcp} (rust)`);
  }
  if (p.openingPoints !== d.south_opening_points) {
    bad.push(
      `opening points ${p.openingPoints} (ts) vs ${d.south_opening_points} (rust)`,
    );
  }
  if (p.shape !== d.south_shape) {
    bad.push(`shape ${p.shape} (ts) vs ${d.south_shape} (rust)`);
  }
  return bad;
}

async function main() {
  const failures: string[] = [];
  let checked = 0;

  for (let seed = 1; seed <= DRILLS; seed++) {
    const d = await drill(seed);
    if (!d) continue;
    checked += 1;
    const bad = compare(d, d.hands.S);
    if (bad.length > 0) {
      failures.push(`${d.leaf_id} [${d.hands.S.join(" ")}]: ${bad.join(", ")}`);
    }
  }

  // A run that checked nothing must not read as a pass. Two ways to get here:
  // the sidecar is down, or every drill errored.
  if (checked < DRILLS / 2) {
    console.error(
      `only ${checked}/${DRILLS} drills came back from ${BASE} — is the sidecar running? (npm run system)`,
    );
    process.exit(1);
  }

  // Prove the comparison can fail: swap an ace for a two and it must be caught.
  const probe = await drill(1);
  if (!probe) {
    console.error("could not fetch a deal for the self-check");
    process.exit(1);
  }
  const perturbed = probe.hands.S.map((c, i) => (i === 0 ? "CA" : c));
  if (compare(probe, perturbed).length === 0) {
    console.error(
      "self-check failed: a deliberately wrong hand was reported as agreeing, so this script proves nothing",
    );
    process.exit(1);
  }

  if (failures.length > 0) {
    console.error(
      `the UI's point count disagrees with the bidding tree on ${failures.length}/${checked} deals:`,
    );
    for (const f of failures.slice(0, 10)) console.error(`  ${f}`);
    process.exit(1);
  }

  console.log(
    `OK  ${checked} deals: TypeScript and Rust agree on HCP, opening points and shape`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
