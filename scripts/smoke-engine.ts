import curriculum from "../src/data/curriculum.json";
import {
  advanceAutoBids,
  advanceAutoPlays,
  advanceTrick,
  initialEngine,
  startBidding,
  submitBid,
  submitCard,
} from "../src/lib/engine";
import type { Curriculum, Lesson } from "../src/lib/types";

function playOptimal(lesson: Lesson) {
  let s = startBidding(initialEngine(lesson));
  s = advanceAutoBids(lesson, s);
  while (s.phase === "bidding") {
    const ev = lesson.auction[s.bidIndex];
    if (ev.seat !== "S") throw new Error("expected South to bid");
    s = submitBid(lesson, s, ev.bid);
    if (s.awaitingCorrection) throw new Error(`bid rejected: ${ev.bid}`);
  }
  if (s.phase === "play") s = advanceAutoPlays(lesson, s);
  let guard = 0;
  while (s.phase === "play" && guard++ < 200) {
    if (s.awaitingTrickAdvance) {
      s = advanceTrick(lesson, s);
      continue;
    }
    const exp = s.playCards[s.playIndex];
    s = submitCard(lesson, s, exp);
    if (s.awaitingCorrection) throw new Error(`card rejected: ${exp}`);
  }
  if (s.phase !== "complete") {
    throw new Error(`stuck in ${s.phase} at play ${s.playIndex}`);
  }
  return s;
}

const data = curriculum as Curriculum;
let ok = 0;
for (const lesson of data.lessons) {
  const s = playOptimal(lesson);
  console.log("OK", lesson.id, lesson.contract, "NS", s.nsTricks);
  ok++;
}
console.log(`${ok}/${data.lessons.length} optimal paths`);
