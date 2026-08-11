/**
 * Regression: DDS encodes lower equals in a bitmask. Playing 8♦ when only
 * 9♦ is listed must not be scored as "lost every remaining trick".
 */
import { evaluatePlay } from "../src/lib/ddsEval";

async function main() {
  // Hand 1.4 mid-trick: W led Q♦, N 2♦, E A♦, S to follow with 8/9♦.
  // Current-trick cards already removed from hands (as in the live engine).
  const hands = {
    S: [
      "SA",
      "SK",
      "S9",
      "S4",
      "S3",
      "HA",
      "HK",
      "H9",
      "D9",
      "D8",
      "C8",
      "C5",
      "C3",
    ],
    W: ["SJ", "S6", "HQ", "HJ", "HT", "H2", "DT", "D4", "D3", "CQ", "C6", "C4"],
    N: ["SQ", "S7", "S5", "S2", "H8", "H7", "H6", "D7", "D6", "CA", "CK", "C9"],
    E: ["ST", "S8", "H5", "H4", "H3", "DK", "DJ", "D5", "CJ", "CT", "C7", "C2"],
  };

  const base = {
    hands,
    trump: "S" as const,
    trickLeader: "W" as const,
    currentTrick: ["DQ", "D2", "DA"],
  };

  const ev8 = await evaluatePlay({ ...base, played: "D8" });
  const ev9 = await evaluatePlay({ ...base, played: "D9" });

  const fail = (msg: string) => {
    console.error("FAIL:", msg);
    console.error("D8", ev8);
    console.error("D9", ev9);
    process.exit(1);
  };

  if (ev8.playedScore < 0) fail("D8 still unscored (equals not expanded)");
  if (ev8.significantError) {
    fail(
      `D8 marked significant error (lost ${ev8.tricksLost}: ${ev8.playedScore} vs ${ev8.bestScore})`,
    );
  }
  if (ev9.significantError) fail("D9 should be optimal");
  if (ev8.playedScore !== ev9.playedScore) {
    fail(`D8 score ${ev8.playedScore} != D9 score ${ev9.playedScore}`);
  }
  if (ev8.bestScore !== 9 || ev8.playedScore !== 9) {
    fail(`expected 9 remaining tricks, got best=${ev8.bestScore} played=${ev8.playedScore}`);
  }

  console.log("OK dds-equals: D8 and D9 both score", ev8.playedScore, "no mistake");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
