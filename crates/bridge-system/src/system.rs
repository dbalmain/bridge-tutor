//! ABF / Joan Butts Standard Five-Card Majors — house-ruled so every hand
//! has one legal call at the student's turn.
//!
//! See [`HOUSE_RULES`] for the pins. Competitive auctions are out of scope.

use crate::auction::{Auction, Phase};
use crate::bid::{Call, Strain};
use crate::cards::{Hand, Suit};

pub const SYSTEM_ID: &str = "abf-5cm-v1";

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
    match auction.phase_for_south() {
        Phase::Opening => opening(hand),
        Phase::RespondTo(open) => respond(hand, open),
        Phase::OpenerRebid { open, response } => rebid(hand, open, response),
        Phase::Unsupported => dec(
            "unsupported",
            Call::Pass,
            "Out of scope",
            "This auction is outside the uncontested teaching tree.",
        ),
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
        "Below opening values, and not a weak two or three-level preempt.",
    )
}

fn open_one(hand: &Hand) -> Decision {
    let s = hand.len_of(Suit::Spade);
    let h = hand.len_of(Suit::Heart);
    let d = hand.len_of(Suit::Diamond);
    let c = hand.len_of(Suit::Club);

    if s >= 5 || h >= 5 {
        if s > h {
            let id = if s >= 6 { "open.1s.6plus" } else { "open.1s" };
            return dec(
                id,
                Call::suit_bid(1, Suit::Spade),
                "Open 1♠",
                "Five-card or longer spades, and spades are not shorter than hearts. \
                 1♠ promises 5+; partner can raise with three.",
            );
        }
        if h > s {
            let id = if h >= 6 { "open.1h.6plus" } else { "open.1h" };
            return dec(
                id,
                Call::suit_bid(1, Suit::Heart),
                "Open 1♥",
                "Five-card or longer hearts, longer than spades (or no 5-card spade suit).",
            );
        }
        return dec(
            "open.1s.equal-majors",
            Call::suit_bid(1, Suit::Spade),
            "5–5 majors: open 1♠",
            "Equal length in both majors: open the higher-ranking suit, then bid hearts next.",
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
        _ => dec(
            "resp.other.pass",
            Call::Pass,
            "Pass",
            "No teaching agreement for this opening yet.",
        ),
    }
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

    if hcp >= 10 {
        // 10+ but no 4-card minor (4333-ish). 2NT natural invite, no 3-card support.
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

    let id = if trump == Suit::Spade {
        "resp.1s.pass"
    } else {
        "resp.1h.pass"
    };
    dec(
        id,
        Call::Pass,
        "Pass",
        "0–5 HCP and no 3-card support. Do not rescue into a new suit.",
    )
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
    let support_len = if minor == Suit::Club { 5 } else { 4 };
    let support = hand.len_of(minor) >= support_len;
    let pts = hand.support_points(minor);

    // Majors first, even with minor support.
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
            "Four-card or longer spades, 6+ HCP. Show the major before raising a minor.",
        );
    }
    if hearts >= 4 && hcp >= 6 {
        // 4-4 majors: cheaper (hearts). 5-5 already took spades if spades > hearts;
        // 5-5 equal: prefer spades — handle:
        if spades >= 4 && spades >= hearts {
            let id = if minor == Suit::Club {
                "resp.1c.1s"
            } else {
                "resp.1d.1s"
            };
            return dec(
                id,
                Call::suit_bid(1, Suit::Spade),
                "Bid 1♠",
                "With both majors, bid the longer; if equal, bid 1♠ (higher).",
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
            "Four-card or longer hearts, 6+ HCP, and not four spades longer/equal.",
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
        if hand.is_balanced() && (13..=15).contains(&hcp) {
            let id = if minor == Suit::Club {
                "resp.1c.3nt"
            } else {
                "resp.1d.3nt"
            };
            return dec(
                id,
                Call::nt(3),
                "3NT over a minor",
                "13–15 balanced, minor fit, no 4-card major. Prefer 3NT to five of a minor.",
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
    if hcp >= 10 && hand.is_balanced() {
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

    let id = if minor == Suit::Club {
        "resp.1c.pass"
    } else {
        "resp.1d.pass"
    };
    dec(
        id,
        Call::Pass,
        "Pass",
        "Fewer than 6 HCP. Do not respond on junk.",
    )
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
        _ => dec(
            "rebid.pass.default",
            Call::Pass,
            "Pass",
            "No specific rebid agreement for this sequence in the teaching tree — if partner \
             limited the hand and we are minimum, stop.",
        ),
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::{Card, Seat};

    fn hand(codes: &[&str]) -> Hand {
        let cards: Vec<Card> = codes.iter().map(|s| Card::parse_app(s).unwrap()).collect();
        Hand::try_from_slice(&cards).unwrap()
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
}
