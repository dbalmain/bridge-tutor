/**
 * Convert Will Jenner-O'Shea / Derrick Browne LIN tutorials into curriculum JSON.
 * Run: node scripts/parse-lin.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const linDir = path.join(root, "public", "lin");
const outFile = path.join(root, "src", "data", "curriculum.json");

const CHAPTERS = {
  1: {
    id: "ch1",
    number: 1,
    title: "Basics",
    summary:
      "How a hand is played: longest suit, following suit, trumps, and the shape of a simple auction.",
    concepts: [
      "Open your longest suit when you have a reasonable hand.",
      "Partner raising shows support for your suit.",
      "Follow suit if you can; if not, you may trump or discard.",
      "A good plan in a trump contract: draw trumps, then cash side-suit winners.",
    ],
  },
  2: {
    id: "ch2",
    number: 2,
    title: "Early Bidding",
    summary:
      "The core of the modern 5-card major system: when to open, and how to raise.",
    concepts: [
      "Open with 12+ high-card points (HCP).",
      "To open 1♥ or 1♠ you need 5+ cards in that major.",
      "A 1♣ or 1♦ open can be as short as 3 cards (when you lack a 5-card major).",
      "Partner needs only 6+ points to respond.",
      "A simple raise (e.g. 1♠–2♠) shows 3+ support and about 6–10 points.",
    ],
  },
  3: {
    id: "ch3",
    number: 3,
    title: "Game Plan",
    summary:
      "When the partnership has enough strength, bid game (3NT, 4♥, 4♠, or 5 of a minor).",
    concepts: [
      "Game needs roughly 25+ combined points (majors/NT) or a bit more in minors.",
      "With a known fit and enough points, bid the game yourself — do not stop in part-score.",
      "Prefer major-suit or no-trump games to minor-suit games when both are possible.",
      "Count winners and losers before you play the first card.",
    ],
  },
  4: {
    id: "ch4",
    number: 4,
    title: "Responder Shifts",
    summary:
      "When you cannot raise partner's suit, bid a new suit (a shift) to search for a better fit.",
    concepts: [
      "A new suit by responder is forcing for one round (partner must bid again).",
      "Show a 4+ card major at the one-level when you can.",
      "Opener's rebid clarifies strength and shape.",
      "Keep searching until you find an 8-card fit or settle in no-trumps.",
    ],
  },
  5: {
    id: "ch5",
    number: 5,
    title: "Opening 1NT",
    summary:
      "A balanced hand with 15–17 HCP opens 1NT — the backbone of the strong no-trump system.",
    concepts: [
      "1NT = 15–17 HCP, balanced (no singleton/void; usually no 5-card major in this course).",
      "Partner can raise to 3NT with enough combined points (~25+).",
      "With a long major and game values, partner may offer a choice of games.",
      "In no-trumps, establish your longest suit early.",
    ],
  },
  6: {
    id: "ch6",
    number: 6,
    title: "Overcalls and Doubles",
    summary:
      "When the opponents open, you can still enter: overcall a good suit, or double for takeout.",
    concepts: [
      "An overcall shows a good 5+ card suit and roughly 10+ points.",
      "A takeout double shows opening values and support for the unbid suits.",
      "After partner doubles, you must respond — bid your longest suit (or NT with a stopper).",
      "Competitive auctions still aim for the right strain and level.",
    ],
  },
};

function parseHandString(s) {
  // e.g. SKT642H76DAQJTCK5
  const hands = { S: [], H: [], D: [], C: [] };
  let suit = null;
  for (const ch of s) {
    if ("SHDC".includes(ch)) {
      suit = ch;
    } else if (suit) {
      hands[suit].push(ch);
    }
  }
  // Return list of cards like "SK", "HT"
  const cards = [];
  for (const suit of ["S", "H", "D", "C"]) {
    for (const rank of hands[suit]) {
      cards.push(suit + rank);
    }
  }
  return cards;
}

function parseMd(md) {
  // md|1SKT642H76...,SQ7...,SA853...,SJ9...
  const dealer = Number(md[0]); // 1=S 2=W 3=N 4=E
  const rest = md.slice(1);
  const parts = rest.split(",");
  if (parts.length !== 4) {
    throw new Error(`Expected 4 hands in md, got ${parts.length}: ${md}`);
  }
  return {
    dealer: ["S", "W", "N", "E"][dealer - 1],
    hands: {
      S: parseHandString(parts[0]),
      W: parseHandString(parts[1]),
      N: parseHandString(parts[2]),
      E: parseHandString(parts[3]),
    },
  };
}

function normalizeBid(b) {
  b = b.trim().toUpperCase();
  if (b === "P" || b === "PASS") return "Pass";
  if (b === "D" || b === "X" || b === "DBL") return "X";
  if (b === "R" || b === "XX" || b === "RDBL") return "XX";
  // 1N -> 1NT, 3N -> 3NT
  if (/^[1-7]N$/.test(b)) return b[0] + "NT";
  return b;
}

function normalizeCard(c) {
  // HJ, SA, DT, C2
  c = c.trim().toUpperCase();
  if (c.length !== 2) return c;
  return c[0] + c[1]; // suit + rank
}

function parseLin(raw, id, chapterNum, handNum) {
  // Strip XML wrapper if present
  let text = raw.replace(/<\/?lin>/gi, "").trim();
  // Split on | but keep tokens: format is key|value|key|value...
  const tokens = text.split("|").map((t) => t.trim());

  let dealer = "S";
  let hands = { S: [], W: [], N: [], E: [] };
  let vulnerability = "none";
  let board = handNum;
  const events = [];
  let pendingNote = null;
  let lastEventIndex = -1;

  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i];
    const val = tokens[i + 1] ?? "";

    if (key === "ah") {
      // Board title
      const m = val.match(/(\d+)/);
      if (m) board = Number(m[1]);
      i++;
    } else if (key === "md") {
      const parsed = parseMd(val);
      dealer = parsed.dealer;
      hands = parsed.hands;
      i++;
    } else if (key === "sv") {
      const map = { o: "none", n: "NS", e: "EW", b: "both" };
      vulnerability = map[val.toLowerCase()] ?? "none";
      i++;
    } else if (key === "pn" || key === "an" || key === "qx" || key === "rh" || key === "mc") {
      // author / player names / results — skip or attach
      if (key === "an" && lastEventIndex >= 0 && events[lastEventIndex]) {
        // annotation often follows the bid/play it explains
        const existing = events[lastEventIndex].annotation || "";
        events[lastEventIndex].annotation = [existing, val].filter(Boolean).join(" ").trim();
      }
      i++;
    } else if (key === "nt" || key === "at") {
      const note = val.trim();
      if (!note) {
        i++;
        continue;
      }
      if (lastEventIndex >= 0 && events[lastEventIndex]) {
        const e = events[lastEventIndex];
        e.teaching = [e.teaching, note].filter(Boolean).join(" ").trim();
      } else {
        pendingNote = [pendingNote, note].filter(Boolean).join(" ").trim();
      }
      i++;
    } else if (key === "mb") {
      const bid = normalizeBid(val);
      const event = {
        type: "bid",
        bid,
        annotation: "",
        teaching: pendingNote || "",
      };
      pendingNote = null;
      events.push(event);
      lastEventIndex = events.length - 1;
      i++;
    } else if (key === "pc") {
      const card = normalizeCard(val);
      const event = {
        type: "play",
        card,
        annotation: "",
        teaching: pendingNote || "",
      };
      pendingNote = null;
      events.push(event);
      lastEventIndex = events.length - 1;
      i++;
    } else {
      // unknown key — advance carefully
      // if next looks like a known key, don't skip val
      const known = new Set(["ah", "md", "sv", "pn", "an", "nt", "at", "mb", "pc", "qx", "rh", "mc"]);
      if (!known.has(key) && i + 1 < tokens.length && known.has(tokens[i + 1])) {
        // orphan value
        continue;
      }
      if (known.has(key)) i++;
    }
  }

  // Post-process: annotations that appear as standalone an| after mb might have been attached.
  // Derive auction and play sequences
  const auction = events.filter((e) => e.type === "bid");
  const play = events.filter((e) => e.type === "play");

  // Determine which seat bids/plays when — for UI "your turn"
  // Dealer is first to bid. Order: S, W, N, E cycling from dealer? 
  // Actually order is always clockwise from dealer: if dealer S: S W N E; if dealer E: E S W N
  const seatOrder = ["S", "W", "N", "E"];
  const dealerIdx = seatOrder.indexOf(dealer);
  auction.forEach((ev, idx) => {
    ev.seat = seatOrder[(dealerIdx + idx) % 4];
  });

  // Contract from auction
  let contract = null;
  let declarer = null;
  let lastStrain = null;
  let lastLevel = null;
  const strainFirst = { C: null, D: null, H: null, S: null, NT: null };
  for (let i = 0; i < auction.length; i++) {
    const b = auction[i].bid;
    if (b === "Pass" || b === "X" || b === "XX") continue;
    const m = b.match(/^([1-7])(C|D|H|S|NT)$/);
    if (m) {
      lastLevel = m[1];
      lastStrain = m[2];
      const seat = auction[i].seat;
      if (strainFirst[lastStrain] == null) strainFirst[lastStrain] = seat;
    }
  }
  if (lastStrain) {
    contract = `${lastLevel}${lastStrain}`;
    // Declarer = first of the declaring side to bid the strain
    // Final contract is by the side that made the last non-pass bid
    let lastBidIdx = -1;
    for (let i = auction.length - 1; i >= 0; i--) {
      const b = auction[i].bid;
      if (b !== "Pass" && b !== "X" && b !== "XX") {
        lastBidIdx = i;
        break;
      }
    }
    const declaringSeat = auction[lastBidIdx].seat;
    const ns = declaringSeat === "N" || declaringSeat === "S";
    const first = strainFirst[lastStrain];
    // first of declaring side to bid strain
    for (let i = 0; i <= lastBidIdx; i++) {
      const b = auction[i].bid;
      const m = b.match(/^([1-7])(C|D|H|S|NT)$/);
      if (m && m[2] === lastStrain) {
        const seat = auction[i].seat;
        const seatNs = seat === "N" || seat === "S";
        if (seatNs === ns) {
          declarer = seat;
          break;
        }
      }
    }
    if (!declarer) declarer = first;
  }

  // Play: leader is left of declarer
  const leadSeat =
    declarer == null
      ? "W"
      : seatOrder[(seatOrder.indexOf(declarer) + 1) % 4];
  // For scripted play we just assign seats by following trick winners — complex.
  // Simpler: store cards in order; runtime engine tracks seats.
  play.forEach((ev, idx) => {
    ev.index = idx;
  });

  const ch = CHAPTERS[chapterNum];
  return {
    id,
    chapterId: ch.id,
    chapterNumber: chapterNum,
    handNumber: handNum,
    title: `${chapterNum}.${handNum}`,
    board,
    dealer,
    vulnerability,
    hands,
    auction,
    play,
    contract,
    declarer,
    leadSeat,
    // external practice link (optional)
    external: {
      tutorialLin: `https://www.bridgebase.com/tools/handviewer.html?linurl=http://willjenneroshea.com/LIN/Begs${chapterNum}-${handNum}.xml`,
    },
    // short intro pulled from first teaching notes
    tip:
      auction.find((a) => a.teaching)?.teaching ||
      auction.find((a) => a.annotation)?.annotation ||
      ch.concepts[0],
  };
}

function main() {
  const lessons = [];
  for (let ch = 1; ch <= 6; ch++) {
    for (let h = 1; h <= 4; h++) {
      const file = path.join(linDir, `Begs${ch}-${h}.lin`);
      if (!fs.existsSync(file)) {
        console.warn("Missing", file);
        continue;
      }
      const raw = fs.readFileSync(file, "utf8");
      const id = `begs-${ch}-${h}`;
      try {
        const lesson = parseLin(raw, id, ch, h);
        lessons.push(lesson);
        console.log(
          `OK ${id}: dealer=${lesson.dealer} contract=${lesson.contract} declarer=${lesson.declarer} bids=${lesson.auction.length} plays=${lesson.play.length}`,
        );
      } catch (e) {
        console.error(`FAIL ${id}:`, e.message);
      }
    }
  }

  const curriculum = {
    meta: {
      title: "Bridge Tutor",
      system: "5-card majors, strong 1NT (15–17)",
      course: "Derrick Browne Beginners' Bridge / Will Jenner-O'Shea resources",
      source: "https://www.willjenneroshea.com/wp/beginners-bridge/",
      version: 1,
    },
    chapters: Object.values(CHAPTERS),
    lessons,
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(curriculum, null, 2));
  console.log(`Wrote ${lessons.length} lessons → ${outFile}`);
}

main();
