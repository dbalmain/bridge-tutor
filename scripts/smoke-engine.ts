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
import type { Lesson } from "../src/lib/types";

/** Original 3NT fixture — not a published teaching deal. */
const sample: Lesson = {
  id: "smoke-3nt",
  chapterId: "smoke",
  chapterNumber: 1,
  handNumber: 1,
  title: "smoke",
  board: 1,
  dealer: "S",
  vulnerability: "None",
  hands: {
    S: ["SA", "SK", "S5", "HA", "HK", "H4", "DA", "DK", "D3", "CA", "C9", "C6", "C2"],
    W: ["SQ", "SJ", "S8", "HQ", "H9", "H6", "DQ", "D8", "D5", "CQ", "C8", "C4", "C3"],
    N: ["ST", "S7", "S4", "S3", "HT", "H8", "H5", "H2", "DJ", "DT", "D7", "D2", "CJ"],
    E: ["S9", "S6", "S2", "HJ", "H7", "H3", "D9", "D6", "D4", "CK", "CT", "C7", "C5"],
  },
  auction: [
    { type: "bid", seat: "S", bid: "1NT" },
    { type: "bid", seat: "W", bid: "Pass" },
    { type: "bid", seat: "N", bid: "3NT" },
    { type: "bid", seat: "E", bid: "Pass" },
    { type: "bid", seat: "S", bid: "Pass" },
    { type: "bid", seat: "W", bid: "Pass" },
  ],
  play: [],
  contract: "3NT",
  declarer: "S",
  leadSeat: "W",
  tip: "Smoke: bid the script, then play with DDS.",
};

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
