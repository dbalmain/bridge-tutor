//! ABF / Joan Butts Standard Five-Card Majors — house-ruled so every hand
//! has one legal call at the student's turn.
//!
//! See [`HOUSE_RULES`] for the pins. Competitive auctions are out of scope.

use crate::auction::{Auction, Phase};
use crate::bid::{Call, Strain};
use crate::cards::{Hand, Seat, Suit};

pub const SYSTEM_ID: &str = "abf-5cm-v2";

pub const HOUSE_RULES: &str = "\
ABF Standard Five-Card Majors (Joan Butts teaching dialect), pinned for drills:

Opening
• Count HCP (A=4 K=3 Q=2 J=1) plus length: 5-card +1, 6-card +2, 7-card +3.
• Open with 13+ of those points, or Rule of 20 (HCP + two longest suits ≥ 20)
  with at least 10 HCP.
• 1♥/1♠ = 5+ cards. 1♦ = 4+ (3 only with 4-4-3-2 and 4-4 majors, which we
  never have — 4-4 majors still open a minor). 1♣ = 3+.
• 5-5 or 6-6: higher ranking. 6-5: the six.
• 4-4 minors: 1♦. 3-3 minors: 1♣.
• 1NT = 15–17 HCP balanced (4333 / 4432 / 5332), including a 5-card major.
  14 HCP balanced with a 5-card suit upgrades to 1NT.
• 2NT = 20–21 balanced. 2♣ = 22+ HCP, or 21+ opening points unbalanced.
• Weak 2♦/♥/♠ = exactly 6 cards, 5–10 HCP, cannot open one-level. No weak 2♣.
• 7+ card, 5–10 HCP, cannot open: 3-level preempt (any suit).
• 5422 is not balanced — do not open 1NT.
• Any seat may open while the auction is still all passes; once a side has
  opened, the other side stays silent (no competitive bidding in this tree).
• Fourth seat (three passes in front): no preempt — pass the deal out. A
  genuine opening hand still opens.

Responding to 1NT (Stayman + Jacoby transfers)
• HCP only (no length).
• 6+ major: transfer (2♦→♥, 2♥→♠).
• 5-5 majors: transfer to spades.
• 5-4 majors and 8+: Stayman (not a transfer).
• 4-card major, no 5-card major, 8+: Stayman.
• 10+ no 4-card major: 3NT. 8–9 no 4-card major: 2NT. Else Pass.
• Garbage Stayman is off: 0–7 with 4-4 majors passes.

Responding to one of a suit
• Fit first: 3+ support for a major (5+ for 1♣, 4+ for 1♦) uses limit raises
  on HCP + shortage (doubleton +1, singleton +3, void +5):
  0–5 pass, 6–9 raise to 2, 10–12 jump to 3, 13+ raise to game (major)
  or 3NT (minor, balanced 13–15) / game in the minor (rare — we bid 3NT
  with 13+ and a minor fit if balanced, else 5m only with 16+ shapely).
• Without a fit: majors first (4+), cheaper of 4-4 majors. New suit at the
  one-level = 6+; at the two-level = 10+ (5+ for a new major).
• 6–9, no fit, no 4-card major at the one-level: 1NT.

Opener rebids
• After a raise of our major: 13–15 pass, 16–18 raise one, 19–20 bid game
  (opening points, HCP+length).
• After 1NT response (non-forcing): pass 5332 minimum; rebid 6-card; show
  a 4-card side suit; jump 2NT with 18–19 balanced.
• After Stayman: 2♥ with 4 hearts (even if 4 spades), 2♠ with 4 spades
  no 4 hearts, 2♦ otherwise.
• After a transfer: always complete (no super-accept).
• After a new suit (forcing one round — never pass it): show a 4-card major
  at the one-level first, then 4-card support (raise 2 / 16–18 jump 3 /
  19–20 game), then a 6-card suit of your own, then notrump by strength
  (1NT minimum, 2NT with 18–19).
• After a two-level new suit (partner has 10+): 3-card support for their
  major raises (game with 16+), 4-card support for their minor raises
  (3NT with 16+), else a 6-card suit of your own, else 2NT minimum / 3NT 16+.
• After an invitation you may pass, but only on a minimum: partner's 2NT is
  accepted with 16+ over 1NT and 14+ over a suit; a minor raise is passed on
  a minimum, tried with 2NT on 16–18, bid to 3NT with game values.

Responding to 2♣, 2NT and preempts
• 2♣ is game-forcing — never pass. 2♦ is waiting on 0–7. With 8+, name a
  5-card suit (2♥/2♠/3♣/3♦), or bid 2NT without one.
• 2NT (20–21): 3♣ Stayman, 3♦→♥, 3♥→♠, as over 1NT. 5-4 majors and 4+ is
  Stayman, not a transfer. 5+ HCP is 3NT; 0–4 with no long major passes.
• Weak two / preempt: responder is the captain. 16+ with 3-card support for
  the major bids game; 16+ without a fit bids 3NT, or a 5-card suit of its
  own over a weak two (forcing). Support without game values raises to
  obstruct, not to invite. Otherwise pass.

Rebids after 2♣, 2NT and preempts
• After 2♣ – 2♦: 2NT with 22–24 balanced, 3NT with 25+, else name the longest
  suit at the cheapest level. Raise a positive major to game with 3+ support.
• After 2NT: answer 3♣ Stayman hearts-first; always complete a transfer.
• After a weak two or preempt: pass whatever partner chose — you already
  described the hand. Exception: partner's new suit is forcing, so raise
  their major with 3-card support or repeat your own suit.
";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Decision {
    pub leaf_id: &'static str,
    pub bid: Call,
    pub title: &'static str,
    pub explanation: &'static str,
}

fn dec(id: &'static str, bid: Call, title: &'static str, explanation: &'static str) -> Decision {
    Decision {
        leaf_id: id,
        bid,
        title,
        explanation,
    }
}

pub fn decide(hand: &Hand, auction: &Auction) -> Decision {
    decide_for(hand, auction, Seat::South)
}

/// The cheapest bid in `suit` above `last`. Above 7NT there is nothing left to
/// bid, which no auction this tree produces can reach — pass rather than
/// inventing an eighth level.
fn suit_or_pass(last: Call, suit: Suit) -> Call {
    last.cheapest_above(Strain::from_suit(suit))
        .unwrap_or(Call::Pass)
}

fn notrump_or_pass(last: Call) -> Call {
    last.cheapest_above(Strain::NoTrump).unwrap_or(Call::Pass)
}

/// No call is taught for this position. Better to say so than to return a
/// pass carrying an explanation that is false for the hand in question.
fn untaught() -> Decision {
    dec(
        "unsupported",
        Call::Pass,
        "Pass — nothing more to say",
        "The course does not teach a further call in this position, so the auction stops here.",
    )
}

/// Weak twos and three-level preempts: the openings whose whole job is to
/// steal bidding room from the opponents.
pub fn is_preempt(leaf_id: &str) -> bool {
    matches!(
        leaf_id,
        "open.2d" | "open.2h" | "open.2s" | "open.3c" | "open.3d" | "open.3h" | "open.3s"
    )
}

pub fn decide_for(hand: &Hand, auction: &Auction, seat: Seat) -> Decision {
    match auction.phase_for(seat) {
        Phase::Opening => {
            let d = opening(hand);
            // A preempt buys bidding room, and in fourth seat there is none
            // left to buy: three players have already passed. Pass the deal
            // out instead of playing a weak two nobody was going to contest.
            if auction.in_fourth_seat() && is_preempt(d.leaf_id) {
                return dec(
                    "pass.fourth-seat",
                    Call::Pass,
                    "Pass in fourth seat",
                    "A weak two or three-level preempt is only worth its risk when it steals \
                     bidding room. In fourth seat there is nobody left to shut out — the other \
                     three have passed — so pass the deal out rather than play a preempt.",
                );
            }
            d
        }
        Phase::RespondTo(open) => respond(hand, open),
        Phase::OpenerRebid { open, response } => rebid(hand, open, response),
        // Shown to a learner in the end-of-hand call list, so it says what
        // happened rather than naming the tree's internals.
        Phase::Unsupported => untaught(),
    }
}

pub fn opening(hand: &Hand) -> Decision {
    let hcp = hand.hcp();
    let total = hand.opening_points();
    let sh = hand.shape();
    let bal = hand.is_balanced();

    if bal && (20..=21).contains(&hcp) {
        return dec(
            "open.2nt",
            Call::nt(2),
            "Open 2NT",
            "20–21 HCP, balanced. Too strong for 1NT, not strong enough to start with 2♣.",
        );
    }

    if hcp >= 22 || (total >= 21 && !(bal && (18..=21).contains(&hcp))) {
        return dec(
            "open.2c",
            Call::suit_bid(2, Suit::Club),
            "Open 2♣ (strong)",
            "Game-forcing strength: 22+ HCP, or 21+ opening points on an unbalanced hand.",
        );
    }

    let nt14_upgrade = bal && hcp == 14 && hand.has_five_card();
    if bal && ((15..=17).contains(&hcp) || nt14_upgrade) {
        if hand.has_five_major() {
            return dec(
                "open.1nt.5major",
                Call::nt(1),
                "Open 1NT with a 5-card major",
                "15–17 balanced (or 14 with a 5-card suit). Modern style: include the 5-card major \
                 so the strong hand stays hidden and you avoid a rebid problem.",
            );
        }
        return dec(
            "open.1nt",
            Call::nt(1),
            "Open 1NT",
            "15–17 HCP balanced (4333 / 4432 / 5332), or 14 HCP with a 5-card minor upgraded.",
        );
    }

    if hand.can_open_one() {
        return open_one(hand);
    }

    let (long_suit, long_len) = hand.longest();
    if long_len >= 7 && (5..=10).contains(&hcp) {
        let id = match long_suit {
            Suit::Club => "open.3c",
            Suit::Diamond => "open.3d",
            Suit::Heart => "open.3h",
            Suit::Spade => "open.3s",
        };
        return dec(
            id,
            Call::suit_bid(3, long_suit),
            "Preempt at the 3-level",
            "Seven-card suit, 5–10 HCP, not enough to open at the one-level.",
        );
    }
    if long_len == 6 && long_suit != Suit::Club && (5..=10).contains(&hcp) {
        let id = match long_suit {
            Suit::Diamond => "open.2d",
            Suit::Heart => "open.2h",
            Suit::Spade => "open.2s",
            Suit::Club => unreachable!(),
        };
        return dec(
            id,
            Call::suit_bid(2, long_suit),
            "Weak two",
            "Six-card diamond, heart, or spade suit, 5–10 HCP, below a one-level opening.",
        );
    }

    let _ = sh;
    dec(
        "open.pass",
        Call::Pass,
        "Pass",
        "Below opening values, and not a weak two or three-level preempt. \
         Passing is not an opening bid: the opening is the first non-pass call \
         of the auction, whoever makes it.",
    )
}

fn open_one(hand: &Hand) -> Decision {
    let s = hand.len_of(Suit::Spade);
    let h = hand.len_of(Suit::Heart);
    let d = hand.len_of(Suit::Diamond);
    let c = hand.len_of(Suit::Club);
    let longest = s.max(h).max(d).max(c);

    // Longest suit. 5-5 / 6-6: higher ranking. 6-5: the six.
    if longest >= 5 {
        if s == longest {
            if h == s {
                return dec(
                    "open.1s.equal-majors",
                    Call::suit_bid(1, Suit::Spade),
                    "Equal majors: open 1♠",
                    "Equal length in both majors: open the higher-ranking suit, then bid hearts next.",
                );
            }
            let id = if s >= 6 { "open.1s.6plus" } else { "open.1s" };
            return dec(
                id,
                Call::suit_bid(1, Suit::Spade),
                "Open 1♠",
                "Spades are the longest suit (5+). 1♠ promises 5+; partner can raise with three.",
            );
        }
        if h == longest {
            let id = if h >= 6 { "open.1h.6plus" } else { "open.1h" };
            return dec(
                id,
                Call::suit_bid(1, Suit::Heart),
                "Open 1♥",
                "Hearts are the longest suit (5+), and longer than spades.",
            );
        }
        if d == longest {
            if c == d {
                return dec(
                    "open.1d.equal-minors",
                    Call::suit_bid(1, Suit::Diamond),
                    "Equal minors: open 1♦",
                    "4–4, 5–5 or 6–6 in the minors: open the higher-ranking minor.",
                );
            }
            return dec(
                "open.1d",
                Call::suit_bid(1, Suit::Diamond),
                "Open 1♦",
                "Diamonds are the longest suit. A 5-card major would have been opened if it were as long.",
            );
        }
        return dec(
            "open.1c",
            Call::suit_bid(1, Suit::Club),
            "Open 1♣",
            "Clubs are the longest suit (6–5 with a 5-card major still opens the six).",
        );
    }

    if d > c {
        return dec(
            "open.1d",
            Call::suit_bid(1, Suit::Diamond),
            "Open 1♦",
            "No 5-card major. Diamonds longer than clubs (1♦ shows 4+).",
        );
    }
    if c > d {
        return dec(
            "open.1c",
            Call::suit_bid(1, Suit::Club),
            "Open 1♣",
            "No 5-card major. Clubs longer than diamonds. 1♣ can be three cards.",
        );
    }
    if d >= 4 && c >= 4 {
        return dec(
            "open.1d.equal-minors",
            Call::suit_bid(1, Suit::Diamond),
            "Equal minors: open 1♦",
            "4–4, 5–5 or 6–6 in the minors: open the higher-ranking minor.",
        );
    }
    dec(
        "open.1c.33-minors",
        Call::suit_bid(1, Suit::Club),
        "3–3 minors: open 1♣",
        "No 5-card major and 3–3 in the minors (typical 4-3-3-3 with a 4-card major). \
         1♣ is the prepared minor.",
    )
}

pub(crate) fn respond(hand: &Hand, open: Call) -> Decision {
    match open {
        Call::Bid {
            level: 1,
            strain: Strain::NoTrump,
        } => respond_1nt(hand),
        Call::Bid {
            level: 1,
            strain: Strain::Spades,
        } => respond_major(hand, Suit::Spade),
        Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        } => respond_major(hand, Suit::Heart),
        Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        } => respond_minor(hand, Suit::Diamond),
        Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        } => respond_minor(hand, Suit::Club),
        Call::Bid {
            level: 2,
            strain: Strain::Clubs,
        } => respond_2c(hand),
        Call::Bid {
            level: 2,
            strain: Strain::NoTrump,
        } => respond_2nt(hand),
        Call::Bid { level: 2, strain } if strain.suit().is_some() => {
            respond_weak_two(hand, strain.suit().expect("weak two suit"))
        }
        Call::Bid { level: 3, strain } if strain.suit().is_some() => {
            respond_preempt(hand, strain.suit().expect("preempt suit"))
        }
        _ => dec(
            "resp.other.pass",
            Call::Pass,
            "Pass",
            "No teaching agreement for this opening yet.",
        ),
    }
}

/// Responding to a strong artificial 2♣. The opening is game-forcing, so
/// passing is not a legal option however weak the hand — partner has 22+ HCP
/// or 21+ opening points and needs to hear something.
fn respond_2c(hand: &Hand) -> Decision {
    let hcp = hand.hcp();
    let (long, len) = hand.longest();
    if hcp >= 8 && len >= 5 {
        let (id, level) = match long {
            Suit::Heart => ("resp.2c.2h", 2),
            Suit::Spade => ("resp.2c.2s", 2),
            Suit::Club => ("resp.2c.3c", 3),
            Suit::Diamond => ("resp.2c.3d", 3),
        };
        return dec(
            id,
            Call::suit_bid(level, long),
            "Positive: show the suit",
            "8+ HCP with a five-card suit. A positive response names the suit straight away, \
             so partner can judge the fit before the auction gets high.",
        );
    }
    if hcp >= 8 {
        return dec(
            "resp.2c.2nt",
            Call::nt(2),
            "Positive: 2NT",
            "8+ HCP with no five-card suit to show. 2NT says the values are there and the shape \
             is flat.",
        );
    }
    dec(
        "resp.2c.2d",
        Call::suit_bid(2, Suit::Diamond),
        "2♦ waiting",
        "Fewer than 8 HCP. 2♦ says nothing about diamonds — it is a waiting bid that keeps the \
         auction low so partner can describe the huge hand. You must not pass 2♣.",
    )
}

/// Responding to 2NT (20–21 balanced). The same shape questions as 1NT, one
/// level higher, and the point thresholds drop because partner has so much.
fn respond_2nt(hand: &Hand) -> Decision {
    let hcp = hand.hcp();
    let hearts = hand.len_of(Suit::Heart);
    let spades = hand.len_of(Suit::Spade);

    // 5–4 majors is Stayman, not a transfer — the same rule as over 1NT
    // (resp.1nt.stayman.54). Transferring buries the four-card suit.
    if hcp >= 4 && ((hearts == 5 && spades == 4) || (spades == 5 && hearts == 4)) {
        return dec(
            "resp.2nt.stayman.54",
            Call::suit_bid(3, Suit::Club),
            "Stayman with 5–4 majors",
            "5–4 in the majors: ask for a four-card major rather than transferring, so a 4–4 \
             fit in the shorter major is not lost.",
        );
    }
    if hearts >= 5 && spades >= 5 {
        return xfer_over_2nt(if hearts > spades {
            Suit::Heart
        } else {
            Suit::Spade
        });
    }
    if hearts >= 5 {
        return xfer_over_2nt(Suit::Heart);
    }
    if spades >= 5 {
        return xfer_over_2nt(Suit::Spade);
    }
    if hcp >= 4 && (hearts >= 4 || spades >= 4) {
        return dec(
            "resp.2nt.stayman",
            Call::suit_bid(3, Suit::Club),
            "Stayman over 2NT",
            "A four-card major and 4+ HCP. 3♣ asks the same question 2♣ asks over 1NT — the \
             level is higher but the bid is the same idea.",
        );
    }
    if hcp >= 5 {
        return dec(
            "resp.2nt.3nt",
            Call::nt(3),
            "Raise to 3NT",
            "5+ HCP and no four-card major. Partner's 20–21 plus your 5 is game; there is \
             nothing to invite.",
        );
    }
    dec(
        "resp.2nt.pass",
        Call::Pass,
        "Pass 2NT",
        "0–4 HCP with no long major. Even 20–21 opposite a bust is not game — and unlike 2♣, \
         2NT is a natural bid you are allowed to pass.",
    )
}

fn xfer_over_2nt(major: Suit) -> Decision {
    let (id, ask) = match major {
        Suit::Heart => ("resp.2nt.xfer.h", Suit::Diamond),
        _ => ("resp.2nt.xfer.s", Suit::Heart),
    };
    dec(
        id,
        Call::suit_bid(3, ask),
        "Transfer over 2NT",
        "Five or more in the major. 3♦ makes partner bid 3♥, 3♥ makes partner bid 3♠ — the same \
         transfer as over 1NT, one level up, and for the same reason: the strong hand plays it.",
    )
}

/// Responding to a weak two (six cards, 5–10 HCP). Partner has already
/// described the hand almost exactly, so responder decides the level alone.
fn respond_weak_two(hand: &Hand, trump: Suit) -> Decision {
    let hcp = hand.hcp();
    let support = hand.len_of(trump);
    let major = trump != Suit::Diamond;

    if support >= 3 {
        if hcp >= 16 {
            if major {
                return dec(
                    "resp.weak2.game",
                    Call::suit_bid(4, trump),
                    "Raise to game",
                    "Three-card support and 16+ opposite a 5–10 weak two is around 25 — bid the \
                     major game.",
                );
            }
            return dec(
                "resp.weak2.3nt",
                Call::nt(3),
                "Bid 3NT",
                "Three-card diamond support and 16+. Nine tricks in notrump beat eleven in a \
                 minor, and partner's six-card suit will run.",
            );
        }
        return dec(
            "resp.weak2.raise",
            Call::suit_bid(3, trump),
            "Raise to three",
            "Support but not the values for game. Raising is not an invitation — it steals one \
             more level from the opponents while the fit makes it safe.",
        );
    }
    // 16+ opposite a 5–10 opening is game values, so shape must not be able to
    // silence the hand — gating this on a balanced holding used to leave a
    // 17-count with a long suit passing partner out.
    if hcp >= 16 {
        let (long, len) = hand.longest();
        if len >= 5 && long != trump {
            return dec(
                "resp.weak2.new-suit",
                suit_or_pass(Call::suit_bid(2, trump), long),
                "Bid your own suit",
                "16+ with a five-card suit and no fit for partner's. A new suit over a weak two \
                 is forcing — partner must bid again, so you can still find the right game.",
            );
        }
        return dec(
            "resp.weak2.3nt",
            Call::nt(3),
            "Bid 3NT",
            "16+ with no fit and no suit of your own. Partner's six-card suit supplies the \
             tricks; take the nine-trick game rather than hunting a fit that is not there.",
        );
    }
    dec(
        "resp.weak2.pass",
        Call::Pass,
        "Pass the weak two",
        "No fit and not enough for game. Partner told you the hand is 5–10 with six cards — \
         believe it and let them play there.",
    )
}

/// Responding to a three-level preempt (seven or more cards, 5–10 HCP).
/// Higher than a weak two, so the bar for doing anything is higher too.
fn respond_preempt(hand: &Hand, trump: Suit) -> Decision {
    let hcp = hand.hcp();
    let support = hand.len_of(trump);
    let major = trump == Suit::Heart || trump == Suit::Spade;

    if support >= 2 && hcp >= 16 && major {
        return dec(
            "resp.preempt.game",
            Call::suit_bid(4, trump),
            "Raise to game",
            "Two-card support for a seven-card suit is a nine-card fit, and 16+ opposite 5–10 \
             is game. Bid it.",
        );
    }
    // Same rule as over a weak two: 16+ is game values and shape must not
    // silence the hand. Over a three-level preempt there is no room to explore,
    // so the answer is always the cheapest game.
    if hcp >= 16 {
        return dec(
            "resp.preempt.3nt",
            Call::nt(3),
            "Bid 3NT",
            "16+ opposite a 5–10 preempt is game values. Partner's seven-card suit should run \
             once the stoppers hold, and at this level 3NT is the only game still cheap.",
        );
    }
    dec(
        "resp.preempt.pass",
        Call::Pass,
        "Pass the preempt",
        "Partner bid three of a suit to take away the opponents' room, not to invite you. \
         Without game values, pass and let the preempt do its work.",
    )
}

fn respond_1nt(hand: &Hand) -> Decision {
    let hcp = hand.hcp();
    let hearts = hand.len_of(Suit::Heart);
    let spades = hand.len_of(Suit::Spade);

    // 5–4 majors, 8+: Stayman so a 4–4 in the short major is not lost.
    if hcp >= 8 && ((hearts == 5 && spades == 4) || (spades == 5 && hearts == 4)) {
        return dec(
            "resp.1nt.stayman.54",
            Call::suit_bid(2, Suit::Club),
            "Stayman with 5–4 majors",
            "8+ HCP and 5–4 in the majors: ask for a 4-card major rather than transferring, \
             so you still find a 4–4 fit in the shorter major.",
        );
    }

    if hearts >= 5 && spades >= 5 {
        if hearts > spades {
            return xfer_hearts(hcp);
        }
        return xfer_spades(hcp);
    }
    if hearts >= 5 {
        return xfer_hearts(hcp);
    }
    if spades >= 5 {
        return xfer_spades(hcp);
    }

    if hcp >= 8 && (hearts >= 4 || spades >= 4) {
        return dec(
            "resp.1nt.stayman",
            Call::suit_bid(2, Suit::Club),
            "Stayman",
            "8+ HCP and at least one 4-card major: 2♣ asks partner to show a 4-card major.",
        );
    }
    if hcp >= 10 {
        return dec(
            "resp.1nt.3nt",
            Call::nt(3),
            "Raise to 3NT",
            "10+ HCP, no 4-card major. Combined 25+ opposite 15–17; skip the invite.",
        );
    }
    if hcp >= 8 {
        return dec(
            "resp.1nt.2nt",
            Call::nt(2),
            "Invite with 2NT",
            "8–9 HCP, no 4-card major. Partner passes with a minimum 15, bids 3NT with 17 \
             (and usually with a good 16).",
        );
    }
    dec(
        "resp.1nt.pass",
        Call::Pass,
        "Pass 1NT",
        "0–7 HCP and no 5-card major to transfer into. 1NT is high enough.",
    )
}

fn xfer_hearts(hcp: u8) -> Decision {
    let id = if hcp >= 10 {
        "resp.1nt.xfer.h.game"
    } else if hcp >= 8 {
        "resp.1nt.xfer.h.invite"
    } else {
        "resp.1nt.xfer.h.weak"
    };
    dec(
        id,
        Call::suit_bid(2, Suit::Diamond),
        "Transfer to hearts",
        "Five or more hearts. 2♦ asks opener to bid 2♥, keeping the strong hand hidden.",
    )
}

fn xfer_spades(hcp: u8) -> Decision {
    let id = if hcp >= 10 {
        "resp.1nt.xfer.s.game"
    } else if hcp >= 8 {
        "resp.1nt.xfer.s.invite"
    } else {
        "resp.1nt.xfer.s.weak"
    };
    dec(
        id,
        Call::suit_bid(2, Suit::Heart),
        "Transfer to spades",
        "Five or more spades. 2♥ asks opener to bid 2♠. With 5–5 majors, transfer to spades first.",
    )
}

fn respond_major(hand: &Hand, trump: Suit) -> Decision {
    let other_major = if trump == Suit::Spade {
        Suit::Heart
    } else {
        Suit::Spade
    };
    let support = hand.len_of(trump);
    let pts = hand.support_points(trump);
    let hcp = hand.hcp();
    let other_len = hand.len_of(other_major);

    if support >= 3 {
        if pts <= 5 {
            return dec(
                raise_id(trump, "pass"),
                Call::Pass,
                "Pass",
                "Three-card support but 0–5 points even with shortage. Too weak to raise.",
            );
        }
        if pts <= 9 {
            return dec(
                raise_id(trump, "2"),
                Call::suit_bid(2, trump),
                "Simple raise",
                "3+ support and 6–9 support points (HCP + shortage). Limit raise to the two-level.",
            );
        }
        if pts <= 12 {
            return dec(
                raise_id(trump, "3"),
                Call::suit_bid(3, trump),
                "Limit raise",
                "3+ support and 10–12 support points. Jump to three; opener bids game with extras.",
            );
        }
        return dec(
            raise_id(trump, "4"),
            Call::suit_bid(4, trump),
            "Raise to game",
            "3+ support and 13+ support points. Combined game values — bid the major game.",
        );
    }

    // No 3-card support. Majors first.
    if trump == Suit::Heart && other_len >= 4 && hcp >= 6 {
        return dec(
            "resp.1h.1s",
            Call::suit_bid(1, Suit::Spade),
            "Bid 1♠",
            "Four or more spades, 6+ HCP, and fewer than three hearts. Change of suit is forcing.",
        );
    }

    if hcp >= 10 && other_len >= 5 && trump == Suit::Spade {
        return dec(
            "resp.1s.2h",
            Call::suit_bid(2, Suit::Heart),
            "Shift to 2♥",
            "10+ HCP, 5+ hearts, no spade fit. Two-level new suit is forcing.",
        );
    }

    if hcp >= 10 {
        let clubs = hand.len_of(Suit::Club);
        let diamonds = hand.len_of(Suit::Diamond);
        if clubs >= 4 || diamonds >= 4 {
            if clubs != diamonds {
                let m = if clubs > diamonds {
                    Suit::Club
                } else {
                    Suit::Diamond
                };
                if hand.len_of(m) >= 4 {
                    return two_minor_shift(trump, m);
                }
            } else if clubs >= 4 {
                return two_minor_shift(trump, Suit::Club);
            }
        }
    }

    if (6..=9).contains(&hcp) {
        let id = if trump == Suit::Spade {
            "resp.1s.1nt"
        } else {
            "resp.1h.1nt"
        };
        return dec(
            id,
            Call::nt(1),
            "Respond 1NT",
            "6–9 HCP, no fit, no four-card major to show at the one-level. Non-forcing.",
        );
    }

    if (10..=12).contains(&hcp) {
        // 10–12, no 4-card minor (4333-ish). 2NT natural invite, no 3-card support.
        let id = if trump == Suit::Spade {
            "resp.1s.2nt"
        } else {
            "resp.1h.2nt"
        };
        return dec(
            id,
            Call::nt(2),
            "2NT invite",
            "10–12 HCP, balanced, no fit and no long minor. Invitational, not Jacoby.",
        );
    }
    if hcp >= 13 && hand.is_balanced() {
        let id = if trump == Suit::Spade {
            "resp.1s.3nt"
        } else {
            "resp.1h.3nt"
        };
        return dec(
            id,
            Call::nt(3),
            "3NT",
            "13+ balanced, no major fit and no long minor. Game opposite a one-level opening.",
        );
    }

    if hcp <= 5 {
        let id = if trump == Suit::Spade {
            "resp.1s.pass"
        } else {
            "resp.1h.pass"
        };
        return dec(
            id,
            Call::Pass,
            "Pass",
            "0–5 HCP and no 3-card support. Do not rescue into a new suit.",
        );
    }
    untaught()
}

fn raise_id(trump: Suit, level: &str) -> &'static str {
    match (trump, level) {
        (Suit::Spade, "pass") => "resp.1s.pass.fit-too-weak",
        (Suit::Spade, "2") => "resp.1s.raise2",
        (Suit::Spade, "3") => "resp.1s.raise3",
        (Suit::Spade, "4") => "resp.1s.raise4",
        (Suit::Heart, "pass") => "resp.1h.pass.fit-too-weak",
        (Suit::Heart, "2") => "resp.1h.raise2",
        (Suit::Heart, "3") => "resp.1h.raise3",
        (Suit::Heart, "4") => "resp.1h.raise4",
        _ => "resp.raise",
    }
}

fn two_minor_shift(trump: Suit, minor: Suit) -> Decision {
    let id = match (trump, minor) {
        (Suit::Spade, Suit::Club) => "resp.1s.2c",
        (Suit::Spade, Suit::Diamond) => "resp.1s.2d",
        (Suit::Heart, Suit::Club) => "resp.1h.2c",
        (Suit::Heart, Suit::Diamond) => "resp.1h.2d",
        _ => "resp.2minor",
    };
    dec(
        id,
        Call::suit_bid(2, minor),
        "Two-level shift",
        "10+ HCP, 4+ in this minor, no major fit. New suit is forcing for one round.",
    )
}

fn respond_minor(hand: &Hand, minor: Suit) -> Decision {
    let hcp = hand.hcp();
    let hearts = hand.len_of(Suit::Heart);
    let spades = hand.len_of(Suit::Spade);
    let clubs = hand.len_of(Suit::Club);
    let support_len = if minor == Suit::Club { 5 } else { 4 };
    let support = hand.len_of(minor) >= support_len;
    let pts = hand.support_points(minor);

    // Majors first, even with minor support.
    // Longer major first; 4-4 cheaper (hearts); 5-5/6-6 higher (spades).
    if spades >= 4 && hcp >= 6 && spades > hearts {
        let id = if minor == Suit::Club {
            "resp.1c.1s"
        } else {
            "resp.1d.1s"
        };
        return dec(
            id,
            Call::suit_bid(1, Suit::Spade),
            "Bid 1♠",
            "Four-card or longer spades, longer than hearts, 6+ HCP. Show the major before raising a minor.",
        );
    }
    if hearts >= 4 && hcp >= 6 {
        if spades >= 5 && spades == hearts {
            let id = if minor == Suit::Club {
                "resp.1c.1s"
            } else {
                "resp.1d.1s"
            };
            return dec(
                id,
                Call::suit_bid(1, Suit::Spade),
                "Bid 1♠",
                "5–5 (or 6–6) majors: bid the higher-ranking suit first, then hearts next.",
            );
        }
        let id = if minor == Suit::Club {
            "resp.1c.1h"
        } else {
            "resp.1d.1h"
        };
        return dec(
            id,
            Call::suit_bid(1, Suit::Heart),
            "Bid 1♥",
            "Four-card or longer hearts, 6+ HCP. With 4–4 majors, bid the cheaper (1♥).",
        );
    }
    if minor == Suit::Club && hand.len_of(Suit::Diamond) >= 4 && hcp >= 6 && !support {
        return dec(
            "resp.1c.1d",
            Call::suit_bid(1, Suit::Diamond),
            "Bid 1♦",
            "No 4-card major, 4+ diamonds, 6+ HCP.",
        );
    }

    if support && hcp >= 6 {
        if pts <= 9 {
            let id = if minor == Suit::Club {
                "resp.1c.raise2"
            } else {
                "resp.1d.raise2"
            };
            return dec(
                id,
                Call::suit_bid(2, minor),
                "Simple raise of the minor",
                "No 4-card major, adequate minor support, 6–9 points. Part-score — do not chase 5m.",
            );
        }
        if pts <= 12 {
            let id = if minor == Suit::Club {
                "resp.1c.raise3"
            } else {
                "resp.1d.raise3"
            };
            return dec(
                id,
                Call::suit_bid(3, minor),
                "Limit raise of the minor",
                "10–12 with a minor fit and no major. Opener may try 3NT with stoppers.",
            );
        }
        // 13+ with a fit and no major. Shape does not change the answer: a
        // long minor is not a reason to chase eleven tricks, so this is 3NT
        // whether the hand is balanced or not. Leaving it gated on balance
        // dropped strong unbalanced hands through to the pass at the bottom.
        if pts >= 13 {
            let id = if minor == Suit::Club {
                "resp.1c.3nt"
            } else {
                "resp.1d.3nt"
            };
            return dec(
                id,
                Call::nt(3),
                "3NT over a minor",
                "13+ points with a minor fit and no 4-card major. Prefer 3NT to five of a minor.",
            );
        }
    }

    if (6..=9).contains(&hcp) {
        let id = if minor == Suit::Club {
            "resp.1c.1nt"
        } else {
            "resp.1d.1nt"
        };
        return dec(
            id,
            Call::nt(1),
            "Respond 1NT",
            "6–9 HCP, no 4-card major, no raise. Non-forcing.",
        );
    }
    // Over 1♦, a six-card club suit with 10+ is a two-level new suit — the
    // same rule as a two-level shift over a major. Six clubs is never
    // balanced, so these hands used to match no branch at all. Over 1♣ the
    // suit is partner's, so a long club hand raises instead.
    if minor == Suit::Diamond && clubs >= 6 && hcp >= 10 {
        return dec(
            "resp.1d.2c",
            Call::suit_bid(2, Suit::Club),
            "Two-level shift to clubs",
            "10+ HCP and six or more clubs, no four-card major and no diamond fit. \
             A new suit at the two-level needs 10+; it is forcing for one round.",
        );
    }

    if (10..=12).contains(&hcp) && hand.is_balanced() {
        let id = if minor == Suit::Club {
            "resp.1c.2nt"
        } else {
            "resp.1d.2nt"
        };
        return dec(
            id,
            Call::nt(2),
            "2NT invite",
            "10–12 balanced, no 4-card major. Invitational to 3NT.",
        );
    }
    if hcp >= 13 && hand.is_balanced() {
        let id = if minor == Suit::Club {
            "resp.1c.3nt"
        } else {
            "resp.1d.3nt"
        };
        return dec(
            id,
            Call::nt(3),
            "3NT",
            "13+ balanced, no 4-card major. Game opposite a one-level opening.",
        );
    }

    if hcp <= 5 {
        let id = if minor == Suit::Club {
            "resp.1c.pass"
        } else {
            "resp.1d.pass"
        };
        return dec(
            id,
            Call::Pass,
            "Pass",
            "Fewer than 6 HCP. Do not respond on junk.",
        );
    }
    untaught()
}

fn rebid(hand: &Hand, open: Call, response: Call) -> Decision {
    match (open, response) {
        (
            Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            },
            Call::Bid {
                level: 2,
                strain: Strain::Clubs,
            },
        ) => stayman_rebid(hand),
        (
            Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            },
            Call::Bid {
                level: 2,
                strain: Strain::Diamonds,
            },
        ) => dec(
            "rebid.xfer.complete.h",
            Call::suit_bid(2, Suit::Heart),
            "Complete the transfer",
            "Partner transferred to hearts. Bid 2♥. Super-accepts are off in this course.",
        ),
        (
            Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            },
            Call::Bid {
                level: 2,
                strain: Strain::Hearts,
            },
        ) => dec(
            "rebid.xfer.complete.s",
            Call::suit_bid(2, Suit::Spade),
            "Complete the transfer",
            "Partner transferred to spades. Bid 2♠. Super-accepts are off in this course.",
        ),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
            Call::Bid {
                level: 2,
                strain: Strain::Spades,
            },
        ) => raise_rebid(hand, Suit::Spade),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Hearts,
            },
            Call::Bid {
                level: 2,
                strain: Strain::Hearts,
            },
        ) => raise_rebid(hand, Suit::Heart),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
            Call::Bid {
                level: 3,
                strain: Strain::Spades,
            },
        ) => limit_rebid(hand, Suit::Spade),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Hearts,
            },
            Call::Bid {
                level: 3,
                strain: Strain::Hearts,
            },
        ) => limit_rebid(hand, Suit::Heart),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
            Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            },
        ) => after_1nt_response(hand, Suit::Spade),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Hearts,
            },
            Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            },
        ) => after_1nt_response(hand, Suit::Heart),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Clubs,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Hearts,
            },
        ) => after_1m_one_major(hand, Suit::Club, Suit::Heart),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Clubs,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
        ) => after_1m_one_major(hand, Suit::Club, Suit::Spade),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Diamonds,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Hearts,
            },
        ) => after_1m_one_major(hand, Suit::Diamond, Suit::Heart),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Diamonds,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
        ) => after_1m_one_major(hand, Suit::Diamond, Suit::Spade),
        // --- Opener's rebid after a new suit. A new suit is forcing for one
        // round, so none of these may pass.
        (
            Call::Bid {
                level: 1,
                strain: Strain::Clubs,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Diamonds,
            },
        ) => after_1c_1d(hand),
        (
            Call::Bid {
                level: 1,
                strain: Strain::Hearts,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
        ) => after_1h_1s(hand),
        (
            Call::Bid {
                level: 1,
                strain: open_strain,
            },
            Call::Bid {
                level: 2,
                strain: shown,
            },
        ) if open_strain.suit().is_some()
            && shown.suit().is_some()
            && open_strain != shown
            && !(open_strain == Strain::Clubs && shown == Strain::Clubs) =>
        {
            after_two_level_shift(
                hand,
                open_strain.suit().expect("suit opening"),
                shown.suit().expect("suit response"),
            )
        }

        // --- Partner limited the hand. Minimum may pass; extras must not.
        (
            Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            },
            Call::Bid {
                level: 2,
                strain: Strain::NoTrump,
            },
        ) => after_two_nt_invite(hand, 16),
        (
            Call::Bid {
                level: 1,
                strain: open_strain,
            },
            Call::Bid {
                level: 2,
                strain: Strain::NoTrump,
            },
        ) if open_strain.suit().is_some() => after_two_nt_invite(hand, 14),
        (
            Call::Bid {
                level: 1,
                strain: open_strain,
            },
            Call::Bid {
                level: raise_level @ (2 | 3),
                strain: raise_strain,
            },
        ) if open_strain == raise_strain
            && matches!(open_strain, Strain::Clubs | Strain::Diamonds) =>
        {
            after_minor_raise(hand, open_strain.suit().expect("minor"), raise_level == 3)
        }
        (
            Call::Bid {
                level: 1,
                strain: open_strain,
            },
            Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            },
        ) if matches!(open_strain, Strain::Clubs | Strain::Diamonds) => {
            after_minor_one_nt(hand, open_strain.suit().expect("minor"))
        }

        // --- Strong and preemptive openings.
        (
            Call::Bid {
                level: 2,
                strain: Strain::Clubs,
            },
            _,
        ) => after_two_club_opening(hand, response),
        (
            Call::Bid {
                level: 2,
                strain: Strain::NoTrump,
            },
            _,
        ) => after_two_nt_opening(hand, response),
        (
            Call::Bid {
                level: 2 | 3,
                strain: open_strain,
            },
            _,
        ) if open_strain.suit().is_some() => after_limited_opening(hand, open, response),

        _ => dec(
            "rebid.pass.default",
            Call::Pass,
            "Pass",
            "No specific rebid agreement for this sequence in the teaching tree — if partner \
             limited the hand and we are minimum, stop.",
        ),
    }
}

/// Opener's rebid after 1♣ – 1♦. Partner showed 4+ diamonds and 6+ HCP with
/// no four-card major, and a new suit is forcing, so passing is not an option.
/// Show a four-card major first — it is still the one-level and it is the
/// cheapest way to find the major game — then support, then shape, then
/// notrump by strength.
fn after_1c_1d(hand: &Hand) -> Decision {
    let pts = hand.opening_points();
    if hand.len_of(Suit::Heart) >= 4 {
        return dec(
            "rebid.1c.1d.1h",
            Call::suit_bid(1, Suit::Heart),
            "Bid 1♥",
            "Four hearts. Still the one-level, so any opening hand can afford it — and it is \
             the cheapest chance at a major fit.",
        );
    }
    if hand.len_of(Suit::Spade) >= 4 {
        return dec(
            "rebid.1c.1d.1s",
            Call::suit_bid(1, Suit::Spade),
            "Bid 1♠",
            "Four spades and not four hearts. Still the one-level.",
        );
    }
    if hand.len_of(Suit::Diamond) >= 4 {
        if pts >= 16 {
            return dec(
                "rebid.1c.1d.raise3",
                Call::suit_bid(3, Suit::Diamond),
                "Jump raise the diamonds",
                "Four-card diamond support and 16–18. Invites game with a fit in the minor.",
            );
        }
        return dec(
            "rebid.1c.1d.raise2",
            Call::suit_bid(2, Suit::Diamond),
            "Raise to 2♦",
            "Four-card diamond support, minimum. Names the fit cheaply.",
        );
    }
    if hand.is_balanced() && pts >= 18 {
        return dec(
            "rebid.1c.1d.2nt",
            Call::nt(2),
            "Jump to 2NT",
            "18–19 balanced with no major and no diamond fit. Too strong for 1NT.",
        );
    }
    if hand.len_of(Suit::Club) >= 6 {
        return dec(
            "rebid.1c.1d.2c",
            Call::suit_bid(2, Suit::Club),
            "Rebid 2♣",
            "Six or more clubs, no four-card major, no diamond fit. Repeat the real suit.",
        );
    }
    dec(
        "rebid.1c.1d.1nt",
        Call::nt(1),
        "Rebid 1NT",
        "Minimum with no four-card major, no diamond fit and no sixth club. 12–14 balanced.",
    )
}

/// Opener's rebid after 1♥ – 1♠. Partner showed four or more spades and 6+
/// HCP without three-card heart support, and a new suit is forcing.
fn after_1h_1s(hand: &Hand) -> Decision {
    let pts = hand.opening_points();
    if hand.len_of(Suit::Spade) >= 4 {
        if pts >= 19 {
            return dec(
                "rebid.1h.1s.game",
                Call::suit_bid(4, Suit::Spade),
                "Raise to 4♠",
                "Four-card spade support and 19–20. Bid the major game.",
            );
        }
        if pts >= 16 {
            return dec(
                "rebid.1h.1s.raise3",
                Call::suit_bid(3, Suit::Spade),
                "Jump raise to 3♠",
                "Four-card spade support and 16–18. Invites the spade game.",
            );
        }
        return dec(
            "rebid.1h.1s.raise2",
            Call::suit_bid(2, Suit::Spade),
            "Raise to 2♠",
            "Four-card spade support, minimum. The pair has found its eight-card fit.",
        );
    }
    if hand.len_of(Suit::Heart) >= 6 {
        return dec(
            "rebid.1h.1s.2h",
            Call::suit_bid(2, Suit::Heart),
            "Rebid 2♥",
            "Six or more hearts and no spade fit. Repeat the long suit so partner can choose.",
        );
    }
    if hand.is_balanced() && pts >= 18 {
        return dec(
            "rebid.1h.1s.2nt",
            Call::nt(2),
            "Jump to 2NT",
            "18–19 balanced, no spade fit. Too strong for a 1NT rebid.",
        );
    }
    if hand.is_balanced() {
        return dec(
            "rebid.1h.1s.1nt",
            Call::nt(1),
            "Rebid 1NT",
            "Minimum balanced with no spade support and only five hearts.",
        );
    }
    let minor = if hand.len_of(Suit::Diamond) >= 4 {
        Some(Suit::Diamond)
    } else if hand.len_of(Suit::Club) >= 4 {
        Some(Suit::Club)
    } else {
        None
    };
    if let Some(m) = minor {
        return dec(
            "rebid.1h.1s.new-minor",
            Call::suit_bid(2, m),
            "Show the second suit",
            "No spade fit, no sixth heart, not balanced: bid the four-card minor. Still a \
             minimum — it describes shape, not extra strength.",
        );
    }
    dec(
        "rebid.1h.1s.1nt",
        Call::nt(1),
        "Rebid 1NT",
        "Nothing else to describe: no spade fit, no sixth heart, no four-card minor.",
    )
}

/// Opener's rebid after a two-level new suit (1♦–2♣, 1♥–2♣/2♦, 1♠–2♣/2♦/2♥).
/// Partner promised 10+ HCP and a real suit, so the pair is close to game and
/// opener must bid again. In all six of these sequences opener's own suit
/// outranks partner's, so rebidding it at the two-level is always legal.
fn after_two_level_shift(hand: &Hand, opened: Suit, shown: Suit) -> Decision {
    let pts = hand.opening_points();
    let support_needed = if shown == Suit::Heart { 3 } else { 4 };
    if hand.len_of(shown) >= support_needed {
        if shown == Suit::Heart {
            if pts >= 16 {
                return dec(
                    "rebid.2level.game",
                    Call::suit_bid(4, shown),
                    "Bid the major game",
                    "Three-card support for partner's five-card major and 16+. Partner promised \
                     10+, so the pair holds game values.",
                );
            }
            return dec(
                "rebid.2level.raise-major",
                Call::suit_bid(3, shown),
                "Raise partner's major",
                "Three-card support for partner's five-card major on a minimum. Partner has \
                 10+ and decides whether to go on.",
            );
        }
        if pts >= 16 {
            return dec(
                "rebid.2level.3nt",
                Call::nt(3),
                "Bid 3NT",
                "A minor fit and 16+ opposite partner's 10+. Nine tricks in notrump beat eleven \
                 in a minor.",
            );
        }
        return dec(
            "rebid.2level.raise-minor",
            Call::suit_bid(3, shown),
            "Raise partner's minor",
            "Four-card support for partner's minor on a minimum. Partner has 10+ and picks the \
             final contract.",
        );
    }
    if hand.len_of(opened) >= 6 {
        return dec(
            "rebid.2level.rebid-suit",
            Call::suit_bid(2, opened),
            "Rebid your suit",
            "Six or more cards in the suit you opened and no fit for partner's. Repeating it \
             is a minimum action — your suit ranks above partner's, so it costs nothing.",
        );
    }
    if pts >= 16 {
        return dec(
            "rebid.2level.3nt",
            Call::nt(3),
            "Bid 3NT",
            "16+ opposite partner's 10+ is game, and with no fit either way notrump is the \
             place to play it.",
        );
    }
    dec(
        "rebid.2level.2nt",
        Call::nt(2),
        "Bid 2NT",
        "Minimum with no fit and no sixth card in your own suit. 2NT keeps the auction alive \
         without promising extras; partner has 10+ and decides.",
    )
}

/// Partner invited with 2NT. Accept or decline on strength — never pass on
/// autopilot, which is what the old catch-all did.
fn after_two_nt_invite(hand: &Hand, accept_from: u8) -> Decision {
    let hcp = hand.hcp();
    if hcp >= accept_from {
        return dec(
            "rebid.2nt.accept",
            Call::nt(3),
            "Accept: 3NT",
            "Partner invited with 2NT and you are at the top of your range. Accept and bid game.",
        );
    }
    dec(
        "rebid.2nt.decline",
        Call::Pass,
        "Decline: pass 2NT",
        "Partner invited with 2NT and you are minimum. Pass — an invitation you decline is \
         not a bid you have to make.",
    )
}

/// Partner raised your minor. A minor part-score is cheap and a minor game is
/// expensive, so extras look for 3NT rather than five of a minor.
fn after_minor_raise(hand: &Hand, minor: Suit, limit_raise: bool) -> Decision {
    let pts = hand.opening_points();
    let floor = if limit_raise { 14 } else { 19 };
    if pts >= floor {
        return dec(
            "rebid.minor-raise.3nt",
            Call::nt(3),
            "Bid 3NT",
            "Enough combined strength for game, and nine tricks in notrump beat eleven in a \
             minor.",
        );
    }
    if !limit_raise && pts >= 16 {
        return dec(
            "rebid.minor-raise.2nt",
            Call::nt(2),
            "Try 2NT",
            "Medium hand (16–18) opposite a 6–9 raise. Invite game; partner passes with 6–7 \
             and bids 3NT with 8–9.",
        );
    }
    let _ = minor;
    dec(
        "rebid.minor-raise.pass",
        Call::Pass,
        "Pass the raise",
        "Minimum opposite a limited raise. The part-score is where this hand belongs — do not \
         chase eleven tricks.",
    )
}

/// Partner responded 1NT to your minor: 6–9 with no four-card major. Not
/// forcing, so a minimum may pass, but extras must not.
fn after_minor_one_nt(hand: &Hand, minor: Suit) -> Decision {
    let pts = hand.opening_points();
    if hand.is_balanced() && pts >= 18 {
        return dec(
            "rebid.1m.1nt.2nt",
            Call::nt(2),
            "Jump to 2NT",
            "18–19 balanced opposite 6–9. Invite the notrump game.",
        );
    }
    if hand.len_of(minor) >= 6 && pts <= 17 {
        return dec(
            "rebid.1m.1nt.rebid",
            Call::suit_bid(2, minor),
            "Rebid the minor",
            "Six or more in the suit you opened. Partner has denied a major and may hold a \
             doubleton — the long suit will usually play better.",
        );
    }
    if pts >= 19 {
        return dec(
            "rebid.1m.1nt.3nt",
            Call::nt(3),
            "Bid 3NT",
            "19+ opposite 6–9 is game whatever the shape.",
        );
    }
    dec(
        "rebid.1m.1nt.pass",
        Call::Pass,
        "Pass 1NT",
        "Minimum, and partner's 1NT is not forcing. Play it there.",
    )
}

fn stayman_rebid(hand: &Hand) -> Decision {
    if hand.len_of(Suit::Heart) >= 4 {
        return dec(
            "rebid.stayman.2h",
            Call::suit_bid(2, Suit::Heart),
            "Stayman: show hearts",
            "Four (or five) hearts. With both majors, show hearts first.",
        );
    }
    if hand.len_of(Suit::Spade) >= 4 {
        return dec(
            "rebid.stayman.2s",
            Call::suit_bid(2, Suit::Spade),
            "Stayman: show spades",
            "Four spades and not four hearts.",
        );
    }
    dec(
        "rebid.stayman.2d",
        Call::suit_bid(2, Suit::Diamond),
        "Stayman: no major",
        "No four-card major. 2♦ is artificial and says so.",
    )
}

fn raise_rebid(hand: &Hand, trump: Suit) -> Decision {
    let pts = hand.opening_points();
    if pts >= 19 {
        let id = if trump == Suit::Spade {
            "rebid.1s.raise.game"
        } else {
            "rebid.1h.raise.game"
        };
        return dec(
            id,
            Call::suit_bid(4, trump),
            "Bid game over the raise",
            "Maximum opening (19–20). Partner’s 6–9 plus our extras is enough for game.",
        );
    }
    if pts >= 16 {
        let id = if trump == Suit::Spade {
            "rebid.1s.raise.invite"
        } else {
            "rebid.1h.raise.invite"
        };
        return dec(
            id,
            Call::suit_bid(3, trump),
            "Invite over the raise",
            "Medium opening (16–18). Ask partner to bid game with a maximum 8–9.",
        );
    }
    let id = if trump == Suit::Spade {
        "rebid.1s.raise.pass"
    } else {
        "rebid.1h.raise.pass"
    };
    dec(
        id,
        Call::Pass,
        "Pass the raise",
        "Minimum opening (13–15). Partner showed 6–9; game is not there.",
    )
}

fn limit_rebid(hand: &Hand, trump: Suit) -> Decision {
    let pts = hand.opening_points();
    if pts >= 16 {
        let id = if trump == Suit::Spade {
            "rebid.1s.limit.accept"
        } else {
            "rebid.1h.limit.accept"
        };
        return dec(
            id,
            Call::suit_bid(4, trump),
            "Accept the limit raise",
            "Medium or maximum. Partner’s 10–12 plus our extras is game.",
        );
    }
    let id = if trump == Suit::Spade {
        "rebid.1s.limit.reject"
    } else {
        "rebid.1h.limit.reject"
    };
    dec(
        id,
        Call::Pass,
        "Pass the limit raise",
        "Minimum opening. Partner invited; we decline.",
    )
}

fn after_1nt_response(hand: &Hand, trump: Suit) -> Decision {
    let pts = hand.opening_points();
    let other_major = if trump == Suit::Spade {
        Suit::Heart
    } else {
        Suit::Spade
    };

    if pts >= 18 && hand.is_balanced() {
        let id = if trump == Suit::Spade {
            "rebid.1s.1nt.2nt"
        } else {
            "rebid.1h.1nt.2nt"
        };
        return dec(
            id,
            Call::nt(2),
            "Jump to 2NT",
            "18–19 balanced. Too strong for 1NT at the first turn; invite/force toward 3NT.",
        );
    }
    if hand.len_of(other_major) >= 4 {
        let id = if trump == Suit::Spade {
            "rebid.1s.1nt.2h"
        } else {
            "rebid.1h.1nt.2s"
        };
        // 1♥-1NT-2♠ is a reverse (higher suit, extra values). Require 16+.
        if trump == Suit::Heart && pts < 16 {
            // too weak to reverse: treat as below
        } else {
            return dec(
                id,
                Call::suit_bid(2, other_major),
                "Show the second major",
                "Four-card other major. After 1♥ this is a reverse, so it also shows extras.",
            );
        }
    }
    if hand.len_of(trump) >= 6 {
        return dec(
            if trump == Suit::Spade {
                "rebid.1s.1nt.2s"
            } else {
                "rebid.1h.1nt.2h"
            },
            Call::suit_bid(2, trump),
            "Rebid the six-card major",
            "Six or more in the opened major, minimum. Partner may pass.",
        );
    }

    let clubs = hand.len_of(Suit::Club);
    let diamonds = hand.len_of(Suit::Diamond);
    if clubs >= 4 || diamonds >= 4 {
        let minor = if clubs >= diamonds && clubs >= 4 {
            Suit::Club
        } else {
            Suit::Diamond
        };
        let id = match (trump, minor) {
            (Suit::Spade, Suit::Club) => "rebid.1s.1nt.2c",
            (Suit::Spade, Suit::Diamond) => "rebid.1s.1nt.2d",
            (Suit::Heart, Suit::Club) => "rebid.1h.1nt.2c",
            (Suit::Heart, Suit::Diamond) => "rebid.1h.1nt.2d",
            _ => "rebid.side-minor",
        };
        return dec(
            id,
            Call::suit_bid(2, minor),
            "Rebid a minor",
            "Four-card (or longer) minor, not a 5332 minimum. Partner can pass or prefer.",
        );
    }

    let id = if trump == Suit::Spade {
        "rebid.1s.1nt.pass"
    } else {
        "rebid.1h.1nt.pass"
    };
    dec(
        id,
        Call::Pass,
        "Pass 1NT",
        "5332 minimum. 1NT is non-forcing; we have no second suit and no sixth trump.",
    )
}

fn after_1m_one_major(hand: &Hand, minor: Suit, major: Suit) -> Decision {
    let pts = hand.opening_points();
    let other_major = if major == Suit::Heart {
        Suit::Spade
    } else {
        Suit::Heart
    };

    if hand.len_of(major) >= 4 {
        if pts >= 19 {
            return dec(
                if major == Suit::Heart {
                    "rebid.1m.1h.game"
                } else {
                    "rebid.1m.1s.game"
                },
                Call::suit_bid(4, major),
                "Raise to game",
                "Four-card support and a maximum. Bid the major game.",
            );
        }
        if pts >= 16 {
            return dec(
                if major == Suit::Heart {
                    "rebid.1m.1h.raise3"
                } else {
                    "rebid.1m.1s.raise3"
                },
                Call::suit_bid(3, major),
                "Jump raise",
                "Four-card support and a medium hand (16–18).",
            );
        }
        return dec(
            if major == Suit::Heart {
                "rebid.1m.1h.raise2"
            } else {
                "rebid.1m.1s.raise2"
            },
            Call::suit_bid(2, major),
            "Raise to two",
            "Four-card support, minimum. Partner knows of the 8-card fit.",
        );
    }

    // Reverse: bidding a higher suit at the two-level (1♣-1♥-2♠, 1♦-1♥-2♠, 1♣-1♠ needs 2♦?
    // 1♣-1♥-1♠ is not a reverse (still at one-level).
    if hand.len_of(other_major) >= 4 {
        let one_level_ok = major == Suit::Heart && other_major == Suit::Spade;
        if one_level_ok {
            return dec(
                "rebid.1m.1h.1s",
                Call::suit_bid(1, Suit::Spade),
                "Bid 1♠",
                "Four spades, not four-card heart support. Still at the one-level — any opening.",
            );
        }
        if pts >= 16 {
            return dec(
                "rebid.1m.reverse",
                Call::suit_bid(2, other_major),
                "Reverse",
                "Four-card higher suit and extra values (16+). A reverse is forcing one round.",
            );
        }
    }

    if hand.is_balanced() && pts >= 18 {
        return dec(
            "rebid.1m.2nt",
            Call::nt(2),
            "Jump to 2NT",
            "18–19 balanced, no 4-card support. Stronger than a 1NT rebid.",
        );
    }
    if hand.is_balanced() {
        return dec(
            "rebid.1m.1nt",
            Call::nt(1),
            "Rebid 1NT",
            "Minimum balanced, no 4-card support for partner’s major.",
        );
    }
    if hand.len_of(minor) >= 6 {
        return dec(
            "rebid.1m.rebid-minor",
            Call::suit_bid(2, minor),
            "Rebid the minor",
            "Six-card minor, no major support, not balanced.",
        );
    }
    // 5-4 in minors typically: bid the other minor if it isn't a reverse we can't afford.
    let other_minor = if minor == Suit::Club {
        Suit::Diamond
    } else {
        Suit::Club
    };
    if hand.len_of(other_minor) >= 4 {
        // 1♣ then 2♦ is a reverse (new suit higher, two-level).
        let is_reverse = minor == Suit::Club && other_minor == Suit::Diamond;
        if !is_reverse || pts >= 16 {
            return dec(
                "rebid.1m.other-minor",
                Call::suit_bid(2, other_minor),
                "Show the other minor",
                "Two-suited in the minors, no major support.",
            );
        }
    }
    dec(
        "rebid.1m.1nt",
        Call::nt(1),
        "Rebid 1NT",
        "No support, no convenient second suit. 1NT is the cheapest description.",
    )
}

/// Opener's rebid after the strong artificial 2♣. The whole auction is forcing
/// to game, so there is no hand on which opener may stop — the only question
/// is how to describe 22+ points.
fn after_two_club_opening(hand: &Hand, response: Call) -> Decision {
    let hcp = hand.hcp();
    let shown = match response {
        Call::Bid {
            level: 2,
            strain: Strain::Diamonds,
        } => None,
        Call::Bid { strain, .. } => strain.suit(),
        _ => None,
    };

    // Partner made a positive response in a major and we have support: the
    // fit is worth more than any further description.
    if let Some(major) = shown {
        if matches!(major, Suit::Heart | Suit::Spade) && hand.len_of(major) >= 3 {
            return dec(
                "rebid.2c.raise-major",
                Call::suit_bid(4, major),
                "Bid the major game",
                "Partner's positive response promised a five-card suit and 8+ HCP. With support \
                 opposite 22+, game is the floor — bid it.",
            );
        }
    }

    if hand.is_balanced() {
        if hcp >= 25 {
            return dec(
                "rebid.2c.3nt",
                Call::nt(3),
                "Bid 3NT",
                "25+ balanced. Partner may hold nothing at all and game is still right.",
            );
        }
        let bid = notrump_or_pass(response);
        return dec(
            "rebid.2c.2nt",
            bid,
            "Show the balanced monster",
            "22–24 balanced. Notrump at the cheapest level describes the shape and the range in \
             one call; partner now knows almost exactly what you hold.",
        );
    }

    let (long, _) = hand.longest();
    dec(
        "rebid.2c.suit",
        suit_or_pass(response, long),
        "Name your suit",
        "Unbalanced with 21+ opening points: show the long suit at the cheapest level. The \
         auction is game-forcing, so there is all the room needed to find the fit.",
    )
}

/// Opener's rebid after 2NT. Stayman and the transfers work exactly as they do
/// over 1NT, one level higher, and the answers are just as mechanical.
fn after_two_nt_opening(hand: &Hand, response: Call) -> Decision {
    match response {
        Call::Bid {
            level: 3,
            strain: Strain::Clubs,
        } => {
            if hand.len_of(Suit::Heart) >= 4 {
                return dec(
                    "rebid.2nt.stayman.3h",
                    Call::suit_bid(3, Suit::Heart),
                    "Stayman: show hearts",
                    "Four hearts, even holding four spades too. Hearts first keeps the answer \
                     unambiguous, exactly as over 1NT.",
                );
            }
            if hand.len_of(Suit::Spade) >= 4 {
                return dec(
                    "rebid.2nt.stayman.3s",
                    Call::suit_bid(3, Suit::Spade),
                    "Stayman: show spades",
                    "Four spades and not four hearts.",
                );
            }
            dec(
                "rebid.2nt.stayman.3d",
                Call::suit_bid(3, Suit::Diamond),
                "Stayman: no major",
                "Neither major is four cards long. 3♦ denies them both.",
            )
        }
        Call::Bid {
            level: 3,
            strain: Strain::Diamonds,
        } => dec(
            "rebid.2nt.xfer.h",
            Call::suit_bid(3, Suit::Heart),
            "Complete the transfer",
            "Partner transferred to hearts. Bid 3♥ — a transfer is never optional.",
        ),
        Call::Bid {
            level: 3,
            strain: Strain::Hearts,
        } => dec(
            "rebid.2nt.xfer.s",
            Call::suit_bid(3, Suit::Spade),
            "Complete the transfer",
            "Partner transferred to spades. Bid 3♠.",
        ),
        _ => dec(
            "rebid.2nt.pass",
            Call::Pass,
            "Pass",
            "Partner has placed the contract. You described 20–21 balanced with the opening \
             bid and have nothing to add.",
        ),
    }
}

/// Opener's rebid after a weak two or a three-level preempt. The opening bid
/// described the hand almost exactly — six or seven cards, 5–10 HCP — so
/// partner is the captain. The one exception is a new suit, which is forcing:
/// partner has game values and is asking, so opener answers.
fn after_limited_opening(hand: &Hand, open: Call, response: Call) -> Decision {
    let opened = match open {
        Call::Bid { strain, .. } => strain.suit(),
        _ => None,
    };
    let shown = match response {
        Call::Bid { strain, .. } => strain.suit(),
        _ => None,
    };
    if let (Some(opened), Some(shown)) = (opened, shown) {
        if shown != opened {
            if matches!(shown, Suit::Heart | Suit::Spade) && hand.len_of(shown) >= 3 {
                return dec(
                    "rebid.preempt.raise",
                    Call::suit_bid(4, shown),
                    "Raise partner's major to game",
                    "Partner's new suit was forcing and showed game values. With three-card \
                     support that settles it — bid the game rather than describing further.",
                );
            }
            return dec(
                "rebid.preempt.rebid-suit",
                suit_or_pass(response, opened),
                "Repeat your suit",
                "Partner's new suit was forcing, so you must bid. With no support, repeat the \
                 long suit you already showed — it is still the only thing you have to say.",
            );
        }
    }
    dec(
        "rebid.preempt.pass",
        Call::Pass,
        "Pass — partner is the captain",
        "Your opening already told partner the shape and the range, so partner knows more about \
         the two hands than you do. Bidding again would describe nothing and only raise the \
         level: pass whatever partner chose.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::{Card, Seat};
    use rand::SeedableRng;

    /// Auction rank, derived independently of `Call::rank` so the legality
    /// checks are not testing the production ordering against itself. `None`
    /// for Pass/X/XX and for anything outside the seven real levels — an
    /// "8♠" must read as illegal, not as a very high bid.
    fn test_rank(c: Call) -> Option<(u8, u8)> {
        match c {
            Call::Bid { level, strain } if (1..=7).contains(&level) => Some((
                level,
                match strain {
                    Strain::Clubs => 0,
                    Strain::Diamonds => 1,
                    Strain::Hearts => 2,
                    Strain::Spades => 3,
                    Strain::NoTrump => 4,
                },
            )),
            _ => None,
        }
    }

    /// A call that is legal after `last`: a pass, or a bid strictly above it
    /// and inside levels 1–7.
    fn is_legal_after(made: Call, last: Call) -> bool {
        match made {
            Call::Pass => true,
            _ => match (test_rank(made), test_rank(last)) {
                (Some(m), Some(l)) => m > l,
                _ => false,
            },
        }
    }

    /// The most a responder may hold and still be allowed to pass. It is set
    /// by what the opening promised: opposite an unlimited opening any real
    /// hand must keep the auction alive, while opposite a weak two — which
    /// promised 5–10 — passing on 13 is right, because the pair is short of
    /// game. 2♣ is game-forcing, so no hand may pass it at all.
    fn max_hcp_that_may_pass(open: Call) -> Option<u8> {
        match open {
            Call::Bid {
                level: 2,
                strain: Strain::Clubs,
            } => None,
            Call::Bid {
                level: 2,
                strain: Strain::NoTrump,
            } => Some(4),
            Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            } => Some(7),
            // HOUSE_RULES: 0–5 passes a one-level suit opening, 6+ must bid.
            Call::Bid { level: 1, .. } => Some(5),
            // Weak twos and preempts promised 5–10, so game needs ~16 opposite.
            Call::Bid { level: 2 | 3, .. } => Some(15),
            _ => Some(7),
        }
    }

    /// Every opening the tree makes. Fuzz tests sweep all of them, so a new
    /// opening cannot be added without a response and a rebid to match.
    const ALL_OPENINGS: [Call; 14] = [
        Call::suit_bid(1, Suit::Club),
        Call::suit_bid(1, Suit::Diamond),
        Call::suit_bid(1, Suit::Heart),
        Call::suit_bid(1, Suit::Spade),
        Call::nt(1),
        Call::suit_bid(2, Suit::Club),
        Call::nt(2),
        Call::suit_bid(2, Suit::Diamond),
        Call::suit_bid(2, Suit::Heart),
        Call::suit_bid(2, Suit::Spade),
        Call::suit_bid(3, Suit::Club),
        Call::suit_bid(3, Suit::Diamond),
        Call::suit_bid(3, Suit::Heart),
        Call::suit_bid(3, Suit::Spade),
    ];

    fn hand(codes: &[&str]) -> Hand {
        let cards: Vec<Card> = codes.iter().map(|s| Card::parse_app(s).unwrap()).collect();
        Hand::try_from_slice(&cards).unwrap()
    }

    /// Opener may only fall back on a blanket pass where a pass is right in
    /// every case: partner has already bid game. Every other sequence — a
    /// forcing new suit, an invitation, a limited raise — must consult
    /// opener's hand. This is what caught the eight forcing bids the tree used
    /// to pass.
    #[test]
    fn opener_only_passes_by_default_when_game_is_reached() {
        const KNOWN: &[&str] = &["1C – 3NT", "1D – 3NT", "1NT – 3NT", "1H – 4H", "1S – 4S"];
        let (found, _) = rebid_survey();
        let known: std::collections::BTreeSet<String> =
            KNOWN.iter().map(|s| s.to_string()).collect();
        let new_gaps: Vec<&String> = found.difference(&known).collect();
        let fixed: Vec<&String> = known.difference(&found).collect();
        assert!(
            new_gaps.is_empty(),
            "these sequences fall back on a blanket pass and should not: {new_gaps:?}"
        );
        assert!(
            fixed.is_empty(),
            "these no longer reach the default pass — remove them from KNOWN: {fixed:?}"
        );
    }

    /// Two forcing rules, one test. A new suit by responder is forcing for one
    /// round, at any level — a 16-count answers a weak two with one. And 2♣ is
    /// game-forcing, so nothing after it may be passed at all. Limited bids —
    /// raises, notrump invitations — may be passed, and are checked elsewhere.
    #[test]
    fn opener_never_passes_a_forcing_bid() {
        let mut rng = rand::rngs::SmallRng::seed_from_u64(2026);
        let opens = ALL_OPENINGS;
        let mut hands = Vec::new();
        for _ in 0..400 {
            let mut deck: Vec<Card> = (0..52).filter_map(Card::from_id).collect();
            use rand::seq::SliceRandom;
            deck.shuffle(&mut rng);
            hands.push(Hand::try_from_slice(&deck[..13]).unwrap());
        }
        let mut passed: std::collections::BTreeSet<String> = Default::default();
        let mut sequences = 0;
        for open in opens {
            let open_strain = match open {
                Call::Bid { strain, .. } => strain,
                _ => unreachable!(),
            };
            for r in &hands {
                let resp = respond(r, open);
                // A new suit: any suit bid in a strain opener did not name.
                // Level-3 new suits count too — a 16-count answers a weak two
                // with one, and that is forcing exactly as at the two level.
                let is_new_suit = match resp.bid {
                    Call::Bid { strain, .. } => strain != open_strain && strain != Strain::NoTrump,
                    _ => false,
                };
                let game_forcing = open == Call::suit_bid(2, Suit::Club);
                if !is_new_suit && !game_forcing {
                    continue;
                }
                sequences += 1;
                for o in &hands {
                    let made = rebid(o, open, resp.bid);
                    assert!(
                        is_legal_after(made.bid, resp.bid),
                        "{} is not legal after {} – {}",
                        made.bid.to_app(),
                        open.to_app(),
                        resp.bid.to_app()
                    );
                    if made.bid == Call::Pass {
                        passed.insert(format!(
                            "{} – {} passed with {} HCP",
                            open.to_app(),
                            resp.bid.to_app(),
                            o.hcp()
                        ));
                    }
                }
            }
        }
        assert!(sequences > 100, "expected plenty of forcing auctions");
        assert!(
            passed.is_empty(),
            "these bids are forcing and were passed:\n{}",
            passed
                .iter()
                .take(10)
                .cloned()
                .collect::<Vec<_>>()
                .join("\n")
        );
    }

    /// Every rebid the tree makes must be a legal call: strictly higher than
    /// the bid it follows. A handler that picks a suit ranking below partner's
    /// response would be unbiddable at the table.
    #[test]
    fn every_rebid_is_a_legal_call() {
        let (_, illegal) = rebid_survey();
        assert!(illegal.is_empty(), "illegal rebids: {illegal:?}");
        // Guard the guard: NT outranks spades, and there is no eighth level.
        assert!(test_rank(Call::nt(2)) > test_rank(Call::suit_bid(2, Suit::Spade)));
        assert_eq!(
            test_rank(Call::Bid {
                level: 8,
                strain: Strain::Spades
            }),
            None
        );
        assert!(!is_legal_after(
            Call::Bid {
                level: 8,
                strain: Strain::Spades
            },
            Call::nt(7)
        ));
    }

    /// Shared sweep: every (opening, response, opener's hand) the tree can
    /// reach. Returns the sequences that hit the default pass, and any rebid
    /// that was not a legal call.
    fn rebid_survey() -> (
        std::collections::BTreeSet<String>,
        std::collections::BTreeSet<String>,
    ) {
        let mut rng = rand::rngs::SmallRng::seed_from_u64(99);
        let opens = ALL_OPENINGS;
        let mut hands = Vec::new();
        for _ in 0..300 {
            let mut deck: Vec<Card> = (0..52).filter_map(Card::from_id).collect();
            use rand::seq::SliceRandom;
            deck.shuffle(&mut rng);
            hands.push(Hand::try_from_slice(&deck[..13]).unwrap());
        }
        let mut defaults = std::collections::BTreeSet::new();
        let mut illegal = std::collections::BTreeSet::new();
        for open in opens {
            for r in &hands {
                let resp = respond(r, open);
                if resp.bid == Call::Pass {
                    continue;
                }
                for o in &hands {
                    let d = rebid(o, open, resp.bid);
                    let seq = format!("{} – {}", open.to_app(), resp.bid.to_app());
                    // Keyed on the default leaf specifically: this asks which
                    // sequences no handler took responsibility for. Whether a
                    // pass was *allowed* is a different question, answered by
                    // opener_never_passes_a_forcing_bid.
                    if d.leaf_id == "rebid.pass.default" {
                        defaults.insert(seq.clone());
                    }
                    if !is_legal_after(d.bid, resp.bid) {
                        illegal.insert(format!("{seq} – {}", d.bid.to_app()));
                    }
                }
            }
        }
        (defaults, illegal)
    }

    /// Every hand has a taught response to every opening this course makes.
    /// `untaught()` remains as a safety net, and this proves it is unreachable
    /// — the check that caught the 2♣-over-1♦ hole in the first place.
    #[test]
    fn every_hand_has_a_taught_response_to_every_opening() {
        let mut rng = rand::rngs::SmallRng::seed_from_u64(4242);
        let opens = ALL_OPENINGS;
        let mut gaps = Vec::new();
        let mut weak_passes = 0;
        for _ in 0..8000 {
            let mut deck: Vec<Card> = (0..52).filter_map(Card::from_id).collect();
            use rand::seq::SliceRandom;
            deck.shuffle(&mut rng);
            let h = Hand::try_from_slice(&deck[..13]).unwrap();
            for open in opens {
                let d = respond(&h, open);
                assert!(
                    is_legal_after(d.bid, open),
                    "{} is not a legal response to {} ({})",
                    d.bid.to_app(),
                    open.to_app(),
                    d.leaf_id
                );
                assert!(!d.leaf_id.is_empty(), "response with no leaf id");
                if d.leaf_id == "unsupported" {
                    let sh = h.shape();
                    gaps.push(format!(
                        "over {}: {} HCP {}-{}-{}-{}",
                        open.to_app(),
                        h.hcp(),
                        sh[3],
                        sh[2],
                        sh[1],
                        sh[0]
                    ));
                }
                // A pass is only allowed when the two hands together cannot
                // hold game values.
                if d.bid == Call::Pass {
                    match max_hcp_that_may_pass(open) {
                        None => panic!(
                            "{} is game-forcing; {} passed it with {} HCP",
                            open.to_app(),
                            d.leaf_id,
                            h.hcp()
                        ),
                        Some(cap) => assert!(
                            h.hcp() <= cap,
                            "{} HCP reached {} over {} (cap {cap})",
                            h.hcp(),
                            d.leaf_id,
                            open.to_app()
                        ),
                    }
                    weak_passes += 1;
                }
            }
        }
        assert!(
            gaps.is_empty(),
            "{} responses have no taught call:\n{}",
            gaps.len(),
            gaps.iter().take(20).cloned().collect::<Vec<_>>().join("\n")
        );
        assert!(weak_passes > 100, "expected plenty of weak hands to pass");
    }

    /// The hand class that used to have no call: six clubs over 1♦.
    #[test]
    fn six_clubs_over_one_diamond_shifts_to_two_clubs() {
        let h = hand(&[
            "SK", "S4", "S3", "HQ", "H5", "DA", "D7", "CK", "CJ", "C9", "C6", "C5", "C2",
        ]);
        assert_eq!(h.len_of(Suit::Club), 6);
        assert!(h.hcp() >= 10, "{} HCP", h.hcp());
        assert!(!h.is_balanced());
        let d = respond(&h, Call::suit_bid(1, Suit::Diamond));
        assert_eq!(d.bid, Call::suit_bid(2, Suit::Club));
        assert_eq!(d.leaf_id, "resp.1d.2c");

        // Over 1♣ the long suit is partner's: raise, do not shift.
        let d = respond(&h, Call::suit_bid(1, Suit::Club));
        assert_ne!(d.leaf_id, "resp.1d.2c");
        assert_ne!(d.bid, Call::Pass);
    }

    /// Reported hand: 14 HCP, 2-3-1-7 with AKQJ of clubs, facing partner's
    /// 1♣. It fell through every branch of `respond_minor` and landed on the
    /// pass at the bottom, which told the learner "fewer than 6 HCP".
    #[test]
    fn a_strong_unbalanced_hand_with_a_minor_fit_bids_game_not_pass() {
        let h = hand(&[
            "S9", "S6", "HA", "HT", "H3", "D2", "CA", "CK", "CQ", "CJ", "C9", "C4", "C3",
        ]);
        assert_eq!(h.hcp(), 14);
        assert_eq!(h.len_of(Suit::Club), 7);
        assert!(!h.is_balanced(), "2-3-1-7 — this is the case that broke");

        let d = respond(&h, Call::suit_bid(1, Suit::Club));
        assert_eq!(d.bid, Call::nt(3), "14 HCP must not pass partner's opening");
        assert_eq!(d.leaf_id, "resp.1c.3nt");
    }

    /// The pass at the bottom of a response must only fire on hands it has
    /// actually established are weak — never as a catch-all.
    #[test]
    fn the_response_pass_only_fires_on_weak_hands() {
        // Genuinely weak: 3 HCP, no support, nothing to bid.
        let weak = hand(&[
            "S9", "S6", "S5", "H9", "H8", "H3", "D9", "D8", "D3", "CJ", "C9", "C4", "C3",
        ]);
        assert!(weak.hcp() <= 5);
        assert_eq!(
            respond(&weak, Call::suit_bid(1, Suit::Club)).leaf_id,
            "resp.1c.pass"
        );

        // No hand of 6+ HCP may reach a response pass claiming it is weak.
        let mut rng = rand::rngs::SmallRng::seed_from_u64(20260830);
        let opens = ALL_OPENINGS;
        let mut checked = 0;
        for _ in 0..4000 {
            let mut deck: Vec<Card> = (0..52).filter_map(Card::from_id).collect();
            use rand::seq::SliceRandom;
            deck.shuffle(&mut rng);
            let h = Hand::try_from_slice(&deck[..13]).unwrap();
            if h.hcp() < 6 {
                continue;
            }
            checked += 1;
            for open in opens {
                let d = respond(&h, open);
                if d.bid != Call::Pass {
                    continue;
                }
                let cap = max_hcp_that_may_pass(open)
                    .unwrap_or_else(|| panic!("{} is game-forcing", open.to_app()));
                assert!(
                    h.hcp() <= cap,
                    "{} HCP reached {} over {} (cap {cap})",
                    h.hcp(),
                    d.leaf_id,
                    open.to_app()
                );
            }
        }
        assert!(
            checked > 1000,
            "expected plenty of 6+ HCP hands, got {checked}"
        );
    }

    /// Same hand, three positions. First and third seat preempt; fourth
    /// seat, with nobody left to shut out, passes the deal out instead.
    #[test]
    fn a_weak_two_opens_in_first_and_third_seat_but_passes_in_fourth() {
        let h = hand(&[
            "SA", "SQ", "S8", "S7", "S6", "S5", "H7", "H6", "H5", "D7", "D6", "C7", "C6",
        ]);
        assert_eq!(h.hcp(), 6, "5–10 HCP");
        assert_eq!(h.len_of(Suit::Spade), 6, "six-card major");
        assert!(!h.can_open_one(), "must be below a one-level opening");

        let first = Auction::empty(Seat::South);
        let d = decide_for(&h, &first, Seat::South);
        assert_eq!(
            d.leaf_id, "open.2s",
            "positive control: first seat preempts"
        );
        assert_eq!(d.bid, Call::suit_bid(2, Suit::Spade));

        // Dealer North, two passes: South is third and still preempts.
        let third = Auction {
            dealer: Seat::North,
            calls: vec![Call::Pass, Call::Pass],
        };
        assert_eq!(third.next_seat(), Seat::South);
        assert_eq!(decide_for(&h, &third, Seat::South).leaf_id, "open.2s");

        // Dealer West, three passes: South is fourth and last.
        let fourth = Auction {
            dealer: Seat::West,
            calls: vec![Call::Pass, Call::Pass, Call::Pass],
        };
        assert_eq!(fourth.next_seat(), Seat::South);
        let d = decide_for(&h, &fourth, Seat::South);
        assert_eq!(d.bid, Call::Pass);
        assert_eq!(d.leaf_id, "pass.fourth-seat");
    }

    /// A real opening hand still opens in fourth seat — the suppression is
    /// only for preempts, not for anything that passes the strength test.
    #[test]
    fn a_genuine_opening_still_opens_in_fourth_seat() {
        let h = hand(&[
            "SA", "SK", "SQ", "S4", "S3", "HA", "H6", "H2", "D9", "D8", "D3", "C5", "C2",
        ]);
        let fourth = Auction {
            dealer: Seat::West,
            calls: vec![Call::Pass, Call::Pass, Call::Pass],
        };
        let d = decide_for(&h, &fourth, Seat::South);
        assert_eq!(d.leaf_id, "open.1s");
        assert_eq!(d.bid, Call::suit_bid(1, Suit::Spade));
    }

    /// `is_preempt` is a hand-written list of leaf ids. Cross-check it against
    /// the *shape* of the call each opening leaf makes, so the list cannot
    /// drift out of step with the tree.
    #[test]
    fn is_preempt_agrees_with_the_calls_the_tree_makes() {
        let mut checked = 0;
        for spec in crate::leaves::catalog() {
            let looks_like_a_preempt = match spec.expected {
                Call::Bid { level: 2, strain } => {
                    strain != Strain::Clubs && strain != Strain::NoTrump
                }
                Call::Bid { level: 3, strain } => strain != Strain::NoTrump,
                _ => false,
            };
            if spec.family == crate::leaves::Family::Open {
                assert_eq!(
                    is_preempt(spec.id),
                    looks_like_a_preempt,
                    "{} expects {:?}",
                    spec.id,
                    spec.expected
                );
                checked += 1;
            } else {
                assert!(!is_preempt(spec.id), "{} is not an opening", spec.id);
            }
        }
        assert!(checked > 10, "expected the whole opening family");
    }

    #[test]
    fn open_1s_five_card() {
        let h = hand(&[
            "SA", "SK", "SQ", "S4", "S3", "HA", "H6", "H2", "D9", "D8", "D3", "C5", "C2",
        ]);
        assert_eq!(h.hcp(), 13);
        let d = opening(&h);
        assert_eq!(d.bid, Call::suit_bid(1, Suit::Spade));
        assert_eq!(d.leaf_id, "open.1s");
    }

    #[test]
    fn open_1nt_includes_five_major() {
        let h = hand(&[
            "SA", "SK", "ST", "S6", "S2", "HA", "H8", "H3", "DK", "D7", "CQ", "C4", "C3",
        ]);
        assert!(h.is_balanced());
        assert_eq!(h.hcp(), 16);
        let d = opening(&h);
        assert_eq!(d.bid, Call::nt(1));
        assert_eq!(d.leaf_id, "open.1nt.5major");
    }

    #[test]
    fn equal_majors_open_spades() {
        let h = hand(&[
            "SA", "S9", "S8", "S4", "S2", "HA", "HK", "H7", "H5", "H3", "DK", "C6", "C2",
        ]);
        let d = opening(&h);
        assert_eq!(d.bid, Call::suit_bid(1, Suit::Spade));
        assert_eq!(d.leaf_id, "open.1s.equal-majors");
    }

    #[test]
    fn six_five_opens_the_six_not_the_five_major() {
        // 6 clubs, 5 spades — HOUSE_RULES: 6-5: the six.
        let h = hand(&[
            "SA", "S9", "S8", "S4", "S2", "H3", "D3", "CA", "CK", "C9", "C8", "C5", "C4",
        ]);
        assert_eq!(h.len_of(Suit::Club), 6);
        assert_eq!(h.len_of(Suit::Spade), 5);
        let d = opening(&h);
        assert_eq!(d.bid, Call::suit_bid(1, Suit::Club), "{}", d.leaf_id);
        assert_eq!(d.leaf_id, "open.1c");
    }

    #[test]
    fn four_four_majors_over_one_club_bid_cheaper() {
        // 4-4 majors, 13 HCP, after 1♣ → 1♥ (not 1♠).
        let h = hand(&[
            "SA", "SK", "S9", "S4", "HA", "HQ", "H8", "H3", "D9", "D8", "D2", "C7", "C6",
        ]);
        assert_eq!(h.hcp(), 13);
        assert_eq!(h.len_of(Suit::Spade), 4);
        assert_eq!(h.len_of(Suit::Heart), 4);
        let auction = Auction {
            dealer: Seat::North,
            calls: vec![Call::suit_bid(1, Suit::Club), Call::Pass],
        };
        let d = decide(&h, &auction);
        assert_eq!(d.bid, Call::suit_bid(1, Suit::Heart), "{}", d.leaf_id);
        assert_eq!(d.leaf_id, "resp.1c.1h");
    }

    #[test]
    fn five_five_majors_over_one_club_still_bid_spades() {
        let h = hand(&[
            "SA", "SK", "S9", "S8", "S4", "HA", "HK", "H8", "H5", "H3", "D2", "C7", "C6",
        ]);
        assert_eq!(h.len_of(Suit::Spade), 5);
        assert_eq!(h.len_of(Suit::Heart), 5);
        let auction = Auction {
            dealer: Seat::North,
            calls: vec![Call::suit_bid(1, Suit::Club), Call::Pass],
        };
        let d = decide(&h, &auction);
        assert_eq!(d.bid, Call::suit_bid(1, Suit::Spade), "{}", d.leaf_id);
        assert_eq!(d.leaf_id, "resp.1c.1s");
    }

    #[test]
    fn stayman_54() {
        let h = hand(&[
            "SA", "S9", "S8", "S4", "S2", "HA", "H8", "H5", "H3", "D7", "D4", "C9", "C2",
        ]);
        assert_eq!(h.hcp(), 8);
        let auction = Auction {
            dealer: Seat::North,
            calls: vec![Call::nt(1), Call::Pass],
        };
        let d = decide(&h, &auction);
        assert_eq!(d.bid, Call::suit_bid(2, Suit::Club));
        assert_eq!(d.leaf_id, "resp.1nt.stayman.54");
    }

    #[test]
    fn game_values_over_one_diamond_bid_3nt_not_invite() {
        // 17 HCP, 3-3-4-3. Reproduced: unbounded `hcp >= 10` invited with 2NT.
        let h = hand(&[
            "SA", "SJ", "S2", "HA", "H8", "H3", "DA", "D9", "D8", "D4", "CA", "C7", "C6",
        ]);
        assert_eq!(h.hcp(), 17);
        assert!(h.is_balanced());
        let auction = Auction {
            dealer: Seat::North,
            calls: vec![Call::suit_bid(1, Suit::Diamond), Call::Pass],
        };
        let d = decide(&h, &auction);
        assert_eq!(d.bid, Call::nt(3), "got {} ({})", d.bid.to_app(), d.leaf_id);
        assert_eq!(d.leaf_id, "resp.1d.3nt");
    }

    #[test]
    fn invitational_balanced_over_one_diamond_still_2nt() {
        let h = hand(&[
            "SA", "SK", "S2", "HA", "H8", "H3", "D9", "D8", "D7", "C7", "C6", "C5", "C4",
        ]);
        assert_eq!(h.hcp(), 11);
        let auction = Auction {
            dealer: Seat::North,
            calls: vec![Call::suit_bid(1, Suit::Diamond), Call::Pass],
        };
        let d = decide(&h, &auction);
        assert_eq!(d.bid, Call::nt(2));
        assert_eq!(d.leaf_id, "resp.1d.2nt");
    }
}
