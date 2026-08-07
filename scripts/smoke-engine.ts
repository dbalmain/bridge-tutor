import curriculum from "../src/data/curriculum.json";
import {
  advanceAutoBids,
  advanceAutoPlaysDds,
  advanceTrickDds,
  initialEngine,
  startBidding,
  submitBid,
  submitCardDds,
} from "../src/lib/engine";
import { cardSuit, legalCards } from "../src/lib/cards";
import type { Curriculum, Lesson } from "../src/lib/types";

async function playThrough(lesson: Lesson) {
  let s = startBidding(initialEngine(lesson));
  s = advanceAutoBids(lesson, s);
  while (s.phase === "bidding") {
    const ev = lesson.auction[s.bidIndex];
    if (ev.seat !== "S") throw new Error("expected South to bid");
    s = submitBid(lesson, s, ev.bid);
    if (s.awaitingCorrection) throw new Error(`bid rejected: ${ev.bid}`);
  }
  if (s.phase === "play") s = await advanceAutoPlaysDds(lesson, s);

  let guard = 0;
  while (s.phase === "play" && guard++ < 200) {
    if (s.awaitingTrickAdvance) {
      s = await advanceTrickDds(lesson, s);
      continue;
    }
    const seat = s.nextToPlay;
    if (seat !== "S" && seat !== "N") {
      s = await advanceAutoPlaysDds(lesson, s);
      continue;
    }
    const led =
      s.currentTrick.length > 0 ? cardSuit(s.currentTrick[0]) : null;
    const legal = legalCards(s.hands[seat!], led);
    if (legal.length === 0) throw new Error("no legal cards");
    s = await submitCardDds(lesson, s, legal[0]);
  }
  if (s.phase !== "complete") {
    throw new Error(`stuck in ${s.phase}`);
  }
  return s;
}

const data = curriculum as Curriculum;
// Smoke one hand deeply (DDS is slower than pure script)
const sample = data.lessons[0];
playThrough(sample)
  .then((s) => {
    console.log(
      "OK",
      sample.id,
      sample.contract,
      "NS",
      s.nsTricks,
      "mistakes",
      s.mistakesThisRun,
    );
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
