#![allow(clippy::too_many_arguments, clippy::vec_init_then_push)]

use crate::bid::Call;
use crate::cards::{Seat, Suit};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Family {
    Open,
    Resp1NT,
    RespMajor,
    RespMinor,
    RespStrong,
    Rebid,
    /// Responder's second call and opener's answer to an invitation. Nothing
    /// in this family is drilled yet, and no lesson teaches it, so the
    /// learner does NOT place these calls — the auction plays them out and
    /// shows them. Teaching them is the next piece of work; until then they
    /// are registered so a new branch cannot appear unlisted.
    Continue,
}

impl Family {
    pub fn slug(self) -> &'static str {
        match self {
            Family::Open => "open",
            Family::Resp1NT => "1nt",
            Family::RespMajor => "major",
            Family::RespMinor => "minor",
            Family::RespStrong => "strong",
            Family::Rebid => "rebid",
            Family::Continue => "continue",
        }
    }

    pub fn title(self) -> &'static str {
        match self {
            Family::Open => "Openings",
            Family::Resp1NT => "Respond to 1NT",
            Family::RespMajor => "Respond to 1♥/1♠",
            Family::RespMinor => "Respond to 1♣/1♦",
            Family::RespStrong => "Respond to 2♣/2NT/preempts",
            Family::Rebid => "Opener’s rebid",
            Family::Continue => "Later calls",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "" | "all" => None,
            "open" | "opening" | "openings" => Some(Family::Open),
            "1nt" | "nt" => Some(Family::Resp1NT),
            "major" | "majors" | "1M" => Some(Family::RespMajor),
            "minor" | "minors" | "1m" => Some(Family::RespMinor),
            "strong" | "preempt" | "preempts" => Some(Family::RespStrong),
            "rebid" | "rebids" => Some(Family::Rebid),
            "continue" | "continuations" => Some(Family::Continue),
            _ => None,
        }
    }
}

/// Lengths are CDHS. Hints are over-approximate; the evaluator is the filter.
#[derive(Clone, Debug)]
pub struct HandPat {
    pub min_len: [u8; 4],
    pub max_len: [u8; 4],
    pub min_hcp: u8,
    pub max_hcp: u8,
    pub balanced: Option<bool>,
    pub equal_majors: bool,
    pub equal_minors: bool,
    pub five_four_majors: bool,
    pub require_five_major: bool,
}

impl HandPat {
    pub fn hcp(min: u8, max: u8) -> Self {
        Self {
            min_len: [0, 0, 0, 0],
            max_len: [13, 13, 13, 13],
            min_hcp: min,
            max_hcp: max,
            balanced: None,
            equal_majors: false,
            equal_minors: false,
            five_four_majors: false,
            require_five_major: false,
        }
    }

    pub fn lens(mut self, c: (u8, u8), d: (u8, u8), h: (u8, u8), s: (u8, u8)) -> Self {
        self.min_len = [c.0, d.0, h.0, s.0];
        self.max_len = [c.1, d.1, h.1, s.1];
        self
    }

    pub fn bal(mut self, b: bool) -> Self {
        self.balanced = Some(b);
        self
    }

    pub fn eq_maj(mut self) -> Self {
        self.equal_majors = true;
        self
    }

    pub fn five_four(mut self) -> Self {
        self.five_four_majors = true;
        self
    }

    pub fn eq_min(mut self) -> Self {
        self.equal_minors = true;
        self
    }

    pub fn five_major(mut self) -> Self {
        self.require_five_major = true;
        self
    }
}

/// A named hand a lesson must always retain as an example of one question.
/// Literals use the app's whitespace-separated card format.
#[derive(Clone, Debug)]
pub struct PinnedHand {
    pub id: &'static str,
    pub south: &'static str,
    pub north: Option<&'static str>,
    pub why: &'static str,
}

impl PinnedHand {
    pub const fn south(id: &'static str, south: &'static str, why: &'static str) -> Self {
        Self {
            id,
            south,
            north: None,
            why,
        }
    }

    pub const fn with_north(mut self, north: &'static str) -> Self {
        self.north = Some(north);
        self
    }
}

/// Everything needed to generate and grade a drill for one decision: the
/// auction that leads to it, the answer, the possible-hand proposal patterns,
/// and examples the lesson guarantees.
#[derive(Clone, Debug)]
pub struct Drill {
    pub expected: Call,
    pub dealer: Seat,
    pub calls_before: Vec<Call>,
    pub south: HandPat,
    pub north: Option<HandPat>,
    pub pinned: Vec<PinnedHand>,
}

/// One decision the tree can make. `drill` is `None` for decisions the course
/// does not set as an exercise — responder's second call and opener's answer
/// to an invitation have no lesson yet, and several rarer branches have no
/// curated hand pattern.
///
/// They are still registered here, and that is the point: this is ONE
/// registry with a flag rather than a curated catalogue plus an unwritten
/// set of everything else. A decision missing from it fails
/// `every_decision_the_tree_makes_is_registered`.
///
/// Registration is NOT permission to grade: whether the learner places a
/// call is decided by drillability, because every drillable leaf is taught by
/// a lesson and these are not. Registration, reachability, drillability and
/// interactivity are four separate properties, and one commit collapsed two
/// of them.
#[derive(Clone, Debug)]
pub struct LeafSpec {
    pub id: &'static str,
    pub family: Family,
    pub title: &'static str,
    pub drill: Option<Drill>,
}

impl LeafSpec {
    pub fn drillable(&self) -> bool {
        self.drill.is_some()
    }
}

/// Every registered decision, drillable or not.
pub fn catalog() -> &'static [LeafSpec] {
    use std::sync::OnceLock;
    static C: OnceLock<Vec<LeafSpec>> = OnceLock::new();
    C.get_or_init(build).as_slice()
}

/// Only the decisions a drill can be generated for.
pub fn drills() -> Vec<&'static LeafSpec> {
    catalog().iter().filter(|l| l.drillable()).collect()
}

pub fn leaf_by_id(id: &str) -> Option<&'static LeafSpec> {
    catalog().iter().find(|l| l.id == id)
}

/// The drill for `id`, or `None` when the id is unknown or not drillable.
pub fn drill_by_id(id: &str) -> Option<(&'static LeafSpec, &'static Drill)> {
    let spec = leaf_by_id(id)?;
    Some((spec, spec.drill.as_ref()?))
}

pub fn leaves_in_family(family: Option<Family>) -> Vec<&'static LeafSpec> {
    catalog()
        .iter()
        .filter(|l| l.drillable() && family.is_none_or(|f| l.family == f))
        .collect()
}

fn leaf(
    id: &'static str,
    family: Family,
    title: &'static str,
    expected: Call,
    dealer: Seat,
    calls_before: Vec<Call>,
    south: HandPat,
    north: Option<HandPat>,
    pinned: Vec<PinnedHand>,
) -> LeafSpec {
    LeafSpec {
        id,
        family,
        title,
        drill: Some(Drill {
            expected,
            dealer,
            calls_before,
            south,
            north,
            pinned,
        }),
    }
}

/// A decision the tree makes but the course does not drill: no curated hand
/// pattern, and no lesson. It plays out in a full auction and is shown, but
/// the learner is not asked to produce it.
fn undrilled(id: &'static str, family: Family, title: &'static str) -> LeafSpec {
    LeafSpec {
        id,
        family,
        title,
        drill: None,
    }
}

fn open(id: &'static str, title: &'static str, expected: Call, south: HandPat) -> LeafSpec {
    open_with_pins(id, title, expected, south, Vec::new())
}

fn open_with_pins(
    id: &'static str,
    title: &'static str,
    expected: Call,
    south: HandPat,
    pinned: Vec<PinnedHand>,
) -> LeafSpec {
    leaf(
        id,
        Family::Open,
        title,
        expected,
        Seat::South,
        vec![],
        south,
        None,
        pinned,
    )
}

fn resp(
    id: &'static str,
    family: Family,
    title: &'static str,
    expected: Call,
    partner_open: Call,
    south: HandPat,
    north: HandPat,
) -> LeafSpec {
    leaf(
        id,
        family,
        title,
        expected,
        Seat::North,
        vec![partner_open, Call::Pass],
        south,
        Some(north),
        Vec::new(),
    )
}

fn rebid(
    id: &'static str,
    title: &'static str,
    expected: Call,
    open: Call,
    response: Call,
    south: HandPat,
    north: HandPat,
) -> LeafSpec {
    leaf(
        id,
        Family::Rebid,
        title,
        expected,
        Seat::South,
        vec![open, Call::Pass, response, Call::Pass],
        south,
        Some(north),
        Vec::new(),
    )
}

fn nt_opener() -> HandPat {
    HandPat::hcp(15, 17)
        .lens((2, 5), (2, 5), (2, 5), (2, 5))
        .bal(true)
}

fn one_spade_opener() -> HandPat {
    HandPat::hcp(11, 18)
        .lens((0, 5), (0, 5), (0, 4), (5, 6))
        .bal(false)
}

fn one_heart_opener() -> HandPat {
    HandPat::hcp(11, 18)
        .lens((0, 5), (0, 5), (5, 6), (0, 4))
        .bal(false)
}

fn one_club_opener() -> HandPat {
    HandPat::hcp(12, 14)
        .lens((3, 6), (0, 4), (0, 4), (0, 4))
        .bal(false)
}

fn one_diamond_opener() -> HandPat {
    HandPat::hcp(12, 14)
        .lens((0, 3), (4, 6), (0, 4), (0, 4))
        .bal(false)
}

fn strong_2c_opener() -> HandPat {
    HandPat::hcp(22, 25).lens((1, 5), (1, 5), (1, 5), (1, 5))
}

fn two_nt_opener() -> HandPat {
    HandPat::hcp(20, 21)
        .lens((2, 5), (2, 5), (2, 5), (2, 5))
        .bal(true)
}

/// Exactly six cards, 5–10 HCP, below a one-level opening.
fn weak_two_opener(suit: Suit) -> HandPat {
    // A second six-card suit is possible. The tree's longest-suit tie-break
    // chooses which weak-two leaf owns it; `verify` filters other patterns.
    let p = HandPat::hcp(5, 10);
    match suit {
        Suit::Spade => p.lens((0, 6), (0, 6), (0, 6), (6, 6)),
        Suit::Heart => p.lens((0, 6), (0, 6), (6, 6), (0, 5)),
        Suit::Diamond => p.lens((0, 6), (6, 6), (0, 5), (0, 5)),
        Suit::Club => p.lens((6, 6), (0, 5), (0, 5), (0, 5)),
    }
}

/// Seven or more cards, 5–10 HCP, below a one-level opening. The strength cap
/// falls as length points rise, which one `HandPat` cannot express; `verify`
/// filters those deliberate over-approximations.
fn preempt_opener(suit: Suit) -> HandPat {
    let p = HandPat::hcp(5, 10);
    match suit {
        Suit::Spade => p.lens((0, 6), (0, 6), (0, 6), (7, 11)),
        Suit::Heart => p.lens((0, 6), (0, 6), (7, 11), (0, 6)),
        Suit::Diamond => p.lens((0, 6), (7, 11), (0, 6), (0, 6)),
        Suit::Club => p.lens((7, 11), (0, 6), (0, 6), (0, 6)),
    }
}

/// North responds 1♦ to 1♣: 6+ HCP, 4+ diamonds, no four-card major, and
/// short enough in clubs not to raise.
fn respond_one_diamond_north() -> HandPat {
    HandPat::hcp(6, 11).lens((0, 4), (4, 6), (0, 3), (0, 3))
}

/// North responds 1♠ to 1♥: 6+ HCP, 4+ spades, fewer than three hearts.
fn respond_one_spade_north() -> HandPat {
    HandPat::hcp(6, 11).lens((1, 5), (1, 5), (0, 2), (4, 5))
}

fn raise_north(trump: Suit, min_p: u8, max_p: u8, min_len: u8) -> HandPat {
    match trump {
        Suit::Spade => HandPat::hcp(min_p, max_p).lens((0, 6), (0, 6), (0, 4), (min_len, 5)),
        Suit::Heart => HandPat::hcp(min_p, max_p).lens((0, 6), (0, 6), (min_len, 5), (0, 3)),
        _ => HandPat::hcp(min_p, max_p),
    }
}

fn build() -> Vec<LeafSpec> {
    let mut v = Vec::new();

    // --- Openings ---
    v.push(open(
        "open.pass",
        "Pass as dealer",
        Call::Pass,
        HandPat::hcp(0, 12),
    ));
    v.push(open_with_pins(
        "open.1nt",
        "Open 1NT (no 5-card major)",
        Call::nt(1),
        HandPat::hcp(14, 17)
            .lens((2, 5), (2, 5), (2, 4), (2, 4))
            .bal(true),
        vec![
            PinnedHand::south(
                "open-1nt-bottom",
                "SK SQ S4 HQ H3 H2 DA DJ D5 D4 CK C3 C2",
                "1NT, bottom of 15–17",
            ),
            PinnedHand::south(
                "open-1nt-top",
                "SA SQ S4 HA HQ H2 DQ D5 D4 D3 CK C3 C2",
                "1NT, top of 15–17",
            ),
        ],
    ));
    v.push(open_with_pins(
        "open.1nt.5major",
        "Open 1NT with a 5-card major",
        Call::nt(1),
        // From fourteen: the upgrade the rules describe IS the 14-count with
        // a five-card suit, and the pattern started at fifteen, so no drill
        // could ever deal the case the lesson is about.
        HandPat::hcp(14, 17)
            .lens((2, 3), (2, 3), (2, 5), (2, 5))
            .bal(true)
            .five_major(),
        vec![PinnedHand::south(
            "open-1nt-14-five-major",
            "SK SQ SJ S4 S3 HA H3 H2 DK DJ D4 C3 C2",
            "14 HCP with a five-card major upgrades to 1NT",
        )],
    ));
    v.push(open(
        "open.2nt",
        "Open 2NT",
        Call::nt(2),
        HandPat::hcp(20, 21)
            .lens((2, 5), (2, 5), (2, 5), (2, 5))
            .bal(true),
    ));
    v.push(open_with_pins(
        "open.2c",
        "Open 2♣ strong",
        Call::suit_bid(2, Suit::Club),
        HandPat::hcp(12, 37),
        vec![PinnedHand::south(
            "open-2c-22-balanced",
            "SA SK SQ S4 HA HK H2 DA DQ D5 C4 C3 C2",
            "2♣, bottom of 22+ balanced",
        )],
    ));
    v.push(open(
        "open.1s",
        "Open 1♠ (5 cards)",
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(10, 19).lens((0, 5), (0, 5), (0, 4), (5, 5)),
    ));
    v.push(open(
        "open.1s.6plus",
        "Open 1♠ (6+ cards)",
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(4, 18).lens((0, 13), (0, 13), (0, 13), (6, 13)),
    ));
    v.push(open_with_pins(
        "open.1s.equal-majors",
        "5–5 majors: open 1♠",
        Call::suit_bid(1, Suit::Spade),
        // Ten, not twelve: the Rule of 20 is exactly what lets a 5-5 ten-count
        // open, and the pattern excluded the boundary the lesson teaches.
        HandPat::hcp(9, 18)
            .lens((0, 3), (0, 3), (5, 6), (5, 6))
            .eq_maj(),
        vec![PinnedHand::south(
            "open-rule-of-20",
            "SK SQ SJ S4 S3 HA H5 H4 H3 H2 D4 C3 C2",
            "Rule of 20 on the nose",
        )],
    ));
    v.push(open(
        "open.1h",
        "Open 1♥ (5 cards)",
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(10, 19).lens((0, 5), (0, 5), (5, 5), (0, 4)),
    ));
    v.push(open(
        "open.1h.6plus",
        "Open 1♥ (6+ cards)",
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(4, 18).lens((0, 13), (0, 13), (6, 13), (0, 12)),
    ));
    // Diamonds are the longest suit, five or more — the case where a long minor
    // beats a five-card major. Split from `open.1d` because they are different
    // rules: this one is "open your longest suit", that one is "no five-card
    // suit anywhere, so pick a minor". Sharing an id meant Lesson 3 dealt this
    // hand 97% of the time under a tip that said "no five-card major".
    v.push(open(
        "open.1d.long",
        "Longest suit: open 1♦",
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(4, 20).lens((0, 8), (5, 13), (0, 8), (0, 8)),
    ));
    // No five-card suit at all: every suit capped at four is exactly the branch
    // condition, so the pattern says it rather than leaving the generator to
    // rediscover it by rejection.
    v.push(open(
        "open.1d",
        "Open 1♦",
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(4, 20).lens((0, 4), (1, 4), (0, 4), (0, 4)),
    ));
    v.push(open(
        "open.1d.equal-minors",
        "Equal minors: open 1♦",
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(9, 20)
            .lens((4, 6), (4, 6), (0, 4), (0, 4))
            .eq_min(),
    ));
    v.push(open(
        "open.1c.long",
        "Longest suit: open 1♣",
        Call::suit_bid(1, Suit::Club),
        HandPat::hcp(4, 20).lens((5, 13), (0, 8), (0, 8), (0, 8)),
    ));
    v.push(open(
        "open.1c",
        "Open 1♣",
        Call::suit_bid(1, Suit::Club),
        HandPat::hcp(4, 20).lens((1, 4), (0, 4), (0, 4), (0, 4)),
    ));
    v.push(open(
        "open.1c.33-minors",
        "3–3 minors: open 1♣",
        Call::suit_bid(1, Suit::Club),
        HandPat::hcp(13, 19)
            .lens((3, 3), (3, 3), (3, 4), (3, 4))
            .bal(true),
    ));
    v.push(open_with_pins(
        "open.2s",
        "Weak 2♠",
        Call::suit_bid(2, Suit::Spade),
        weak_two_opener(Suit::Spade),
        vec![
            PinnedHand::south(
                "open-2s-five-hcp",
                "SK SQ S9 S8 S7 S6 H4 H3 D4 D3 D2 C3 C2",
                "weak 2♠, bottom of 5–10",
            ),
            PinnedHand::south(
                "open-2s-ten-hcp",
                "SA SK SQ SJ S8 S7 H4 H3 D4 D3 D2 C3 C2",
                "weak 2♠, top of 5–10",
            ),
            PinnedHand::south(
                "open-2s-6430",
                "SK SQ S9 S8 S7 S6 H5 H4 H3 H2 D5 D4 D3",
                "weak 2♠ on 6-4-3-0",
            ),
        ],
    ));
    v.push(open(
        "open.2h",
        "Weak 2♥",
        Call::suit_bid(2, Suit::Heart),
        weak_two_opener(Suit::Heart),
    ));
    v.push(open(
        "open.2d",
        "Weak 2♦",
        Call::suit_bid(2, Suit::Diamond),
        weak_two_opener(Suit::Diamond),
    ));
    v.push(open_with_pins(
        "open.3s",
        "Preempt 3♠",
        Call::suit_bid(3, Suit::Spade),
        preempt_opener(Suit::Spade),
        vec![
            PinnedHand::south(
                "open-3s-7420",
                "SK SQ S9 S8 S7 S6 S5 H5 H4 H3 H2 D4 D3",
                "3♠ preempt on 7-4-2-0",
            ),
            PinnedHand::south(
                "open-3s-five-hcp",
                "SK SQ S9 S8 S7 S6 S5 H4 H3 D3 D2 C3 C2",
                "3♠ preempt on seven cards and 5 HCP",
            ),
            PinnedHand::south(
                "open-3s-nine-hcp",
                "SA SK SQ S9 S8 S7 S6 H4 H3 D3 D2 C3 C2",
                "3♠ preempt on seven cards and 9 HCP",
            ),
            PinnedHand::south(
                "open-3s-eight-cards",
                "SK SQ SJ S9 S8 S7 S6 S5 H4 H3 D3 D2 C3",
                "3♠ preempt on eight cards",
            ),
        ],
    ));
    v.push(open(
        "open.3h",
        "Preempt 3♥",
        Call::suit_bid(3, Suit::Heart),
        preempt_opener(Suit::Heart),
    ));
    v.push(open(
        "open.3d",
        "Preempt 3♦",
        Call::suit_bid(3, Suit::Diamond),
        preempt_opener(Suit::Diamond),
    ));
    v.push(open(
        "open.3c",
        "Preempt 3♣",
        Call::suit_bid(3, Suit::Club),
        preempt_opener(Suit::Club),
    ));

    // --- 1NT responses ---
    v.push(resp(
        "resp.1nt.pass",
        Family::Resp1NT,
        "Pass 1NT",
        Call::Pass,
        Call::nt(1),
        HandPat::hcp(0, 7).lens((2, 5), (2, 5), (0, 4), (0, 4)),
        nt_opener(),
    ));
    v.push(resp(
        "resp.1nt.stayman",
        Family::Resp1NT,
        "Stayman",
        Call::suit_bid(2, Suit::Club),
        Call::nt(1),
        HandPat::hcp(8, 12).lens((1, 5), (1, 5), (2, 4), (2, 4)),
        nt_opener(),
    ));
    v.push(resp(
        "resp.1nt.stayman.54",
        Family::Resp1NT,
        "Stayman with 5–4 majors",
        Call::suit_bid(2, Suit::Club),
        Call::nt(1),
        HandPat::hcp(8, 13)
            .lens((1, 4), (1, 4), (4, 5), (4, 5))
            .five_four(),
        nt_opener(),
    ));
    v.push(resp(
        "resp.1nt.xfer.h.weak",
        Family::Resp1NT,
        "Transfer to hearts (weak)",
        Call::suit_bid(2, Suit::Diamond),
        Call::nt(1),
        HandPat::hcp(0, 7).lens((0, 4), (0, 4), (5, 6), (0, 3)),
        nt_opener(),
    ));
    v.push(resp(
        "resp.1nt.xfer.h.invite",
        Family::Resp1NT,
        "Transfer to hearts (invite)",
        Call::suit_bid(2, Suit::Diamond),
        Call::nt(1),
        HandPat::hcp(8, 9).lens((1, 4), (1, 4), (5, 6), (0, 3)),
        nt_opener(),
    ));
    v.push(resp(
        "resp.1nt.xfer.h.game",
        Family::Resp1NT,
        "Transfer to hearts (game)",
        Call::suit_bid(2, Suit::Diamond),
        Call::nt(1),
        HandPat::hcp(10, 14).lens((1, 4), (1, 4), (5, 6), (0, 3)),
        nt_opener(),
    ));
    v.push(resp(
        "resp.1nt.xfer.s.weak",
        Family::Resp1NT,
        "Transfer to spades (weak)",
        Call::suit_bid(2, Suit::Heart),
        Call::nt(1),
        HandPat::hcp(0, 7).lens((0, 4), (0, 4), (0, 3), (5, 6)),
        nt_opener(),
    ));
    v.push(resp(
        "resp.1nt.xfer.s.invite",
        Family::Resp1NT,
        "Transfer to spades (invite)",
        Call::suit_bid(2, Suit::Heart),
        Call::nt(1),
        HandPat::hcp(8, 9).lens((1, 4), (1, 4), (0, 3), (5, 6)),
        nt_opener(),
    ));
    v.push(resp(
        "resp.1nt.xfer.s.game",
        Family::Resp1NT,
        "Transfer to spades (game)",
        Call::suit_bid(2, Suit::Heart),
        Call::nt(1),
        HandPat::hcp(10, 14).lens((1, 4), (1, 4), (0, 3), (5, 6)),
        nt_opener(),
    ));
    v.push(resp(
        "resp.1nt.2nt",
        Family::Resp1NT,
        "Invite 2NT",
        Call::nt(2),
        Call::nt(1),
        HandPat::hcp(8, 9)
            .lens((3, 5), (3, 5), (2, 3), (2, 3))
            .bal(true),
        nt_opener(),
    ));
    v.push(resp(
        "resp.1nt.3nt",
        Family::Resp1NT,
        "Raise to 3NT",
        Call::nt(3),
        Call::nt(1),
        HandPat::hcp(10, 14)
            .lens((3, 5), (3, 5), (2, 3), (2, 3))
            .bal(true),
        nt_opener(),
    ));

    // --- Major responses ---
    v.push(resp(
        "resp.1s.raise2",
        Family::RespMajor,
        "Raise 1♠ to 2♠",
        Call::suit_bid(2, Suit::Spade),
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(6, 8).lens((1, 5), (1, 5), (1, 4), (3, 4)),
        one_spade_opener(),
    ));
    v.push(resp(
        "resp.1s.raise3",
        Family::RespMajor,
        "Limit raise 1♠ to 3♠",
        Call::suit_bid(3, Suit::Spade),
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(9, 11).lens((1, 4), (1, 4), (1, 3), (3, 5)),
        one_spade_opener(),
    ));
    v.push(resp(
        "resp.1s.raise4",
        Family::RespMajor,
        "Raise 1♠ to 4♠",
        Call::suit_bid(4, Suit::Spade),
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(13, 16).lens((0, 4), (0, 4), (0, 3), (4, 5)),
        one_spade_opener(),
    ));
    v.push(resp(
        "resp.1s.1nt",
        Family::RespMajor,
        "1♠ – 1NT",
        Call::nt(1),
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(6, 9).lens((2, 5), (2, 5), (2, 4), (0, 2)),
        one_spade_opener(),
    ));
    v.push(resp(
        "resp.1s.2h",
        Family::RespMajor,
        "1♠ – 2♥",
        Call::suit_bid(2, Suit::Heart),
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(10, 14).lens((1, 4), (1, 4), (5, 6), (0, 2)),
        one_spade_opener(),
    ));
    v.push(resp(
        "resp.1s.2c",
        Family::RespMajor,
        "1♠ – 2♣",
        Call::suit_bid(2, Suit::Club),
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(10, 13).lens((4, 6), (1, 3), (0, 3), (0, 2)),
        one_spade_opener(),
    ));
    v.push(resp(
        "resp.1s.2d",
        Family::RespMajor,
        "1♠ – 2♦",
        Call::suit_bid(2, Suit::Diamond),
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(10, 13).lens((1, 3), (4, 6), (0, 3), (0, 2)),
        one_spade_opener(),
    ));
    v.push(resp(
        "resp.1s.pass",
        Family::RespMajor,
        "Pass 1♠",
        Call::Pass,
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(0, 5).lens((2, 5), (2, 5), (2, 4), (0, 2)),
        one_spade_opener(),
    ));
    v.push(resp(
        "resp.1h.raise2",
        Family::RespMajor,
        "Raise 1♥ to 2♥",
        Call::suit_bid(2, Suit::Heart),
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(6, 8).lens((1, 5), (1, 5), (3, 4), (0, 3)),
        one_heart_opener(),
    ));
    v.push(resp(
        "resp.1h.raise3",
        Family::RespMajor,
        "Limit raise 1♥ to 3♥",
        Call::suit_bid(3, Suit::Heart),
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(9, 11).lens((1, 4), (1, 4), (3, 5), (0, 3)),
        one_heart_opener(),
    ));
    v.push(resp(
        "resp.1h.raise4",
        Family::RespMajor,
        "Raise 1♥ to 4♥",
        Call::suit_bid(4, Suit::Heart),
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(13, 16).lens((0, 4), (0, 4), (4, 5), (0, 3)),
        one_heart_opener(),
    ));
    v.push(resp(
        "resp.1h.1s",
        Family::RespMajor,
        "1♥ – 1♠",
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(6, 11).lens((1, 5), (1, 5), (0, 2), (4, 5)),
        one_heart_opener(),
    ));
    v.push(resp(
        "resp.1h.1nt",
        Family::RespMajor,
        "1♥ – 1NT",
        Call::nt(1),
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(6, 9).lens((2, 5), (2, 5), (0, 2), (0, 3)),
        one_heart_opener(),
    ));
    v.push(resp(
        "resp.1h.pass",
        Family::RespMajor,
        "Pass 1♥",
        Call::Pass,
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(0, 5).lens((2, 5), (2, 5), (0, 2), (0, 3)),
        one_heart_opener(),
    ));

    // --- Minor responses ---
    v.push(resp(
        "resp.1c.1h",
        Family::RespMinor,
        "1♣ – 1♥",
        Call::suit_bid(1, Suit::Heart),
        Call::suit_bid(1, Suit::Club),
        HandPat::hcp(6, 11).lens((1, 4), (1, 4), (4, 5), (0, 4)),
        one_club_opener(),
    ));
    v.push(resp(
        "resp.1c.1s",
        Family::RespMinor,
        "1♣ – 1♠",
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(1, Suit::Club),
        HandPat::hcp(6, 11).lens((1, 4), (1, 4), (0, 3), (4, 5)),
        one_club_opener(),
    ));
    v.push(resp(
        "resp.1c.1d",
        Family::RespMinor,
        "1♣ – 1♦",
        Call::suit_bid(1, Suit::Diamond),
        Call::suit_bid(1, Suit::Club),
        HandPat::hcp(6, 10).lens((1, 4), (4, 6), (0, 3), (0, 3)),
        one_club_opener(),
    ));
    v.push(resp(
        "resp.1c.1nt",
        Family::RespMinor,
        "1♣ – 1NT",
        Call::nt(1),
        Call::suit_bid(1, Suit::Club),
        HandPat::hcp(6, 9)
            .lens((2, 4), (2, 4), (2, 3), (2, 3))
            .bal(true),
        one_club_opener(),
    ));
    v.push(resp(
        "resp.1c.pass",
        Family::RespMinor,
        "Pass 1♣",
        Call::Pass,
        Call::suit_bid(1, Suit::Club),
        HandPat::hcp(0, 5).lens((2, 4), (2, 5), (2, 3), (2, 3)),
        one_club_opener(),
    ));
    v.push(resp(
        "resp.1d.1h",
        Family::RespMinor,
        "1♦ – 1♥",
        Call::suit_bid(1, Suit::Heart),
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(6, 11).lens((1, 4), (1, 3), (4, 5), (0, 4)),
        one_diamond_opener(),
    ));
    v.push(resp(
        "resp.1d.1s",
        Family::RespMinor,
        "1♦ – 1♠",
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(6, 11).lens((1, 4), (1, 3), (0, 3), (4, 5)),
        one_diamond_opener(),
    ));
    v.push(resp(
        "resp.1d.2c",
        Family::RespMinor,
        "1♦ – 2♣",
        Call::suit_bid(2, Suit::Club),
        Call::suit_bid(1, Suit::Diamond),
        // Four or more clubs on a shapely hand, not six: a two-level new suit
        // asks for 10+ points and a real suit, not a specific length.
        HandPat::hcp(10, 15)
            .lens((4, 7), (0, 3), (0, 3), (0, 3))
            .bal(false),
        one_diamond_opener(),
    ));
    v.push(resp(
        "resp.1d.1nt",
        Family::RespMinor,
        "1♦ – 1NT",
        Call::nt(1),
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(6, 9)
            .lens((2, 5), (2, 3), (2, 3), (2, 3))
            .bal(true),
        one_diamond_opener(),
    ));

    // --- Chapter 9: strong and preemptive openings, both sides ---
    v.push(resp(
        "resp.2c.2d",
        Family::RespStrong,
        "2♣ – 2♦ waiting",
        Call::suit_bid(2, Suit::Diamond),
        Call::suit_bid(2, Suit::Club),
        HandPat::hcp(0, 7).lens((0, 5), (0, 5), (0, 5), (0, 5)),
        strong_2c_opener(),
    ));
    v.push(resp(
        "resp.2c.2h",
        Family::RespStrong,
        "2♣ – 2♥ positive",
        Call::suit_bid(2, Suit::Heart),
        Call::suit_bid(2, Suit::Club),
        HandPat::hcp(8, 11).lens((0, 3), (0, 3), (5, 6), (0, 4)),
        strong_2c_opener(),
    ));
    v.push(resp(
        "resp.2nt.3nt",
        Family::RespStrong,
        "2NT – 3NT",
        Call::nt(3),
        Call::nt(2),
        HandPat::hcp(5, 11).lens((2, 5), (2, 5), (0, 3), (0, 3)),
        two_nt_opener(),
    ));
    v.push(resp(
        "resp.2nt.stayman",
        Family::RespStrong,
        "2NT – 3♣ Stayman",
        Call::suit_bid(3, Suit::Club),
        Call::nt(2),
        HandPat::hcp(4, 11).lens((1, 4), (1, 4), (4, 4), (0, 3)),
        two_nt_opener(),
    ));
    v.push(resp(
        "resp.2nt.stayman.54",
        Family::RespStrong,
        "2NT – 3♣ with 5–4 majors",
        Call::suit_bid(3, Suit::Club),
        Call::nt(2),
        // Both orientations: 5♥–4♠ and 4♥–5♠ are equally this leaf.
        HandPat::hcp(4, 11)
            .lens((0, 3), (0, 3), (4, 5), (4, 5))
            .five_four(),
        two_nt_opener(),
    ));
    v.push(resp(
        "resp.2nt.xfer.h",
        Family::RespStrong,
        "2NT – 3♦ transfer",
        Call::suit_bid(3, Suit::Diamond),
        Call::nt(2),
        // Spades capped at 3: 5–4 majors are Stayman, not a transfer.
        HandPat::hcp(0, 11).lens((0, 4), (0, 4), (5, 6), (0, 3)),
        two_nt_opener(),
    ));
    v.push(resp(
        "resp.2nt.pass",
        Family::RespStrong,
        "2NT – Pass",
        Call::Pass,
        Call::nt(2),
        HandPat::hcp(0, 4).lens((2, 4), (2, 4), (0, 3), (0, 3)),
        two_nt_opener(),
    ));
    v.push(resp(
        "resp.weak2.pass",
        Family::RespStrong,
        "Pass partner's weak two",
        Call::Pass,
        Call::suit_bid(2, Suit::Spade),
        HandPat::hcp(6, 13).lens((2, 5), (2, 5), (2, 5), (0, 2)),
        weak_two_opener(Suit::Spade),
    ));
    v.push(resp(
        "resp.weak2.raise",
        Family::RespStrong,
        "Raise the weak two",
        Call::suit_bid(3, Suit::Spade),
        Call::suit_bid(2, Suit::Spade),
        HandPat::hcp(6, 13).lens((1, 4), (1, 4), (1, 4), (3, 4)),
        weak_two_opener(Suit::Spade),
    ));
    v.push(resp(
        "resp.weak2.game",
        Family::RespStrong,
        "Raise the weak two to game",
        Call::suit_bid(4, Suit::Spade),
        Call::suit_bid(2, Suit::Spade),
        HandPat::hcp(16, 19).lens((1, 4), (1, 4), (1, 4), (3, 4)),
        weak_two_opener(Suit::Spade),
    ));
    v.push(resp(
        "resp.weak2.3nt",
        Family::RespStrong,
        "3NT over a weak two",
        Call::nt(3),
        Call::suit_bid(2, Suit::Spade),
        HandPat::hcp(16, 19)
            .lens((3, 4), (3, 4), (3, 4), (0, 2))
            .bal(true),
        weak_two_opener(Suit::Spade),
    ));
    v.push(resp(
        "resp.preempt.pass",
        Family::RespStrong,
        "Pass partner's preempt",
        Call::Pass,
        Call::suit_bid(3, Suit::Diamond),
        HandPat::hcp(6, 13).lens((2, 5), (0, 2), (2, 5), (2, 5)),
        preempt_opener(Suit::Diamond),
    ));
    v.push(resp(
        "resp.preempt.3nt",
        Family::RespStrong,
        "3NT over a preempt",
        Call::nt(3),
        Call::suit_bid(3, Suit::Diamond),
        HandPat::hcp(16, 19)
            .lens((3, 4), (2, 3), (3, 4), (3, 4))
            .bal(true),
        preempt_opener(Suit::Diamond),
    ));
    v.push(rebid(
        "rebid.2c.2nt",
        "Show the balanced monster",
        Call::nt(2),
        Call::suit_bid(2, Suit::Club),
        Call::suit_bid(2, Suit::Diamond),
        HandPat::hcp(22, 24)
            .lens((2, 5), (2, 5), (2, 5), (2, 5))
            .bal(true),
        HandPat::hcp(0, 7).lens((0, 5), (0, 5), (0, 5), (0, 5)),
    ));
    v.push(rebid(
        "rebid.2c.suit",
        "Name your suit after 2♣",
        Call::suit_bid(2, Suit::Spade),
        Call::suit_bid(2, Suit::Club),
        Call::suit_bid(2, Suit::Diamond),
        HandPat::hcp(22, 24)
            .lens((0, 3), (0, 3), (0, 4), (5, 7))
            .bal(false),
        HandPat::hcp(0, 7).lens((0, 5), (0, 5), (0, 5), (0, 5)),
    ));
    v.push(rebid(
        "rebid.2nt.stayman.3h",
        "Show hearts over 3♣ Stayman",
        Call::suit_bid(3, Suit::Heart),
        Call::nt(2),
        Call::suit_bid(3, Suit::Club),
        HandPat::hcp(20, 21)
            .lens((2, 4), (2, 4), (4, 5), (2, 4))
            .bal(true),
        HandPat::hcp(4, 11).lens((1, 4), (1, 4), (4, 4), (0, 3)),
    ));
    v.push(rebid(
        "rebid.2nt.xfer.h",
        "Complete the 3♦ transfer",
        Call::suit_bid(3, Suit::Heart),
        Call::nt(2),
        Call::suit_bid(3, Suit::Diamond),
        HandPat::hcp(20, 21)
            .lens((2, 4), (2, 4), (2, 4), (2, 4))
            .bal(true),
        // Spades capped at 3: 5–4 majors bid 3♣ Stayman, not this transfer.
        HandPat::hcp(0, 11).lens((0, 4), (0, 4), (5, 6), (0, 3)),
    ));
    v.push(rebid(
        "rebid.preempt.pass",
        "Pass — partner is the captain",
        Call::Pass,
        Call::suit_bid(2, Suit::Spade),
        Call::suit_bid(3, Suit::Spade),
        weak_two_opener(Suit::Spade),
        HandPat::hcp(6, 13).lens((1, 4), (1, 4), (1, 4), (3, 4)),
    ));

    // --- Chapter 8: opener's rebid after a new suit ---
    // One-level new suit: 1♣ – 1♦
    v.push(rebid(
        "rebid.1c.1d.1h",
        "Show hearts after 1♣–1♦",
        Call::suit_bid(1, Suit::Heart),
        Call::suit_bid(1, Suit::Club),
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(12, 14).lens((3, 4), (2, 3), (4, 4), (2, 3)),
        respond_one_diamond_north(),
    ));
    v.push(rebid(
        "rebid.1c.1d.raise2",
        "Raise 1♦ to 2♦",
        Call::suit_bid(2, Suit::Diamond),
        Call::suit_bid(1, Suit::Club),
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(12, 14)
            .lens((5, 5), (4, 4), (0, 3), (0, 3))
            .bal(false),
        respond_one_diamond_north(),
    ));
    v.push(rebid(
        "rebid.1c.1d.1nt",
        "Rebid 1NT after 1♣–1♦",
        Call::nt(1),
        Call::suit_bid(1, Suit::Club),
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(12, 14).lens((4, 5), (2, 3), (2, 3), (2, 3)),
        respond_one_diamond_north(),
    ));
    // One-level new suit: 1♥ – 1♠
    v.push(rebid(
        "rebid.1h.1s.raise2",
        "Raise 1♠ to 2♠",
        Call::suit_bid(2, Suit::Spade),
        Call::suit_bid(1, Suit::Heart),
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(12, 14)
            .lens((1, 3), (1, 3), (5, 5), (4, 4))
            .bal(false),
        respond_one_spade_north(),
    ));
    v.push(rebid(
        "rebid.1h.1s.2h",
        "Rebid 2♥ after 1♥–1♠",
        Call::suit_bid(2, Suit::Heart),
        Call::suit_bid(1, Suit::Heart),
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(12, 14)
            .lens((1, 3), (1, 3), (6, 6), (0, 3))
            .bal(false),
        respond_one_spade_north(),
    ));
    v.push(rebid(
        "rebid.1h.1s.1nt",
        "Rebid 1NT after 1♥–1♠",
        Call::nt(1),
        Call::suit_bid(1, Suit::Heart),
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(12, 13)
            .lens((2, 3), (2, 3), (5, 5), (2, 3))
            .bal(true),
        respond_one_spade_north(),
    ));
    // Two-level new suit
    v.push(rebid(
        "rebid.2level.raise-major",
        "Raise partner's 2♥ to 3♥",
        Call::suit_bid(3, Suit::Heart),
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(2, Suit::Heart),
        HandPat::hcp(12, 13).lens((1, 3), (1, 3), (3, 3), (5, 5)),
        HandPat::hcp(10, 13).lens((1, 4), (1, 4), (5, 6), (0, 2)),
    ));
    v.push(rebid(
        "rebid.2level.raise-minor",
        "Raise partner's 2♦ to 3♦",
        Call::suit_bid(3, Suit::Diamond),
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(2, Suit::Diamond),
        HandPat::hcp(12, 13)
            .lens((0, 3), (4, 4), (1, 3), (5, 5))
            .bal(false),
        HandPat::hcp(10, 13).lens((1, 3), (4, 6), (0, 3), (0, 2)),
    ));
    v.push(rebid(
        "rebid.2level.rebid-suit",
        "Rebid 2♠ over partner's 2♦",
        Call::suit_bid(2, Suit::Spade),
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(2, Suit::Diamond),
        HandPat::hcp(12, 14)
            .lens((1, 3), (1, 3), (1, 3), (6, 6))
            .bal(false),
        HandPat::hcp(10, 13).lens((1, 3), (4, 6), (0, 3), (0, 2)),
    ));
    v.push(rebid(
        "rebid.2level.2nt",
        "Bid 2NT over partner's 2♦",
        Call::nt(2),
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(2, Suit::Diamond),
        HandPat::hcp(12, 13).lens((2, 4), (2, 3), (2, 4), (5, 5)),
        HandPat::hcp(10, 13).lens((1, 3), (4, 6), (0, 3), (0, 2)),
    ));
    v.push(rebid(
        "rebid.2level.3nt",
        "Bid 3NT over partner's 2♦",
        Call::nt(3),
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(2, Suit::Diamond),
        HandPat::hcp(17, 19).lens((2, 4), (2, 3), (2, 4), (5, 5)),
        HandPat::hcp(10, 13).lens((1, 3), (4, 6), (0, 3), (0, 2)),
    ));
    // Invitations and limited raises
    v.push(rebid(
        "rebid.2nt.accept",
        "Accept the 2NT invitation",
        Call::nt(3),
        Call::nt(1),
        Call::nt(2),
        HandPat::hcp(16, 17)
            .lens((2, 5), (2, 5), (2, 5), (2, 5))
            .bal(true),
        HandPat::hcp(8, 9)
            .lens((2, 4), (2, 4), (2, 3), (2, 3))
            .bal(true),
    ));
    v.push(rebid(
        "rebid.2nt.decline",
        "Decline the 2NT invitation",
        Call::Pass,
        Call::nt(1),
        Call::nt(2),
        HandPat::hcp(15, 15)
            .lens((2, 5), (2, 5), (2, 5), (2, 5))
            .bal(true),
        HandPat::hcp(8, 9)
            .lens((2, 4), (2, 4), (2, 3), (2, 3))
            .bal(true),
    ));
    v.push(rebid(
        "rebid.minor-raise.pass",
        "Pass partner's minor raise",
        Call::Pass,
        Call::suit_bid(1, Suit::Club),
        Call::suit_bid(2, Suit::Club),
        HandPat::hcp(12, 13)
            .lens((5, 6), (0, 3), (0, 3), (0, 3))
            .bal(false),
        HandPat::hcp(6, 9).lens((5, 6), (0, 3), (0, 3), (0, 3)),
    ));
    v.push(rebid(
        "rebid.minor-raise.2nt",
        "Try 2NT over a minor raise",
        Call::nt(2),
        Call::suit_bid(1, Suit::Club),
        Call::suit_bid(2, Suit::Club),
        HandPat::hcp(16, 17)
            .lens((5, 6), (0, 3), (0, 3), (0, 3))
            .bal(false),
        HandPat::hcp(6, 9).lens((5, 6), (0, 3), (0, 3), (0, 3)),
    ));
    v.push(rebid(
        "rebid.1m.1nt.pass",
        "Pass partner's 1NT over a minor",
        Call::Pass,
        Call::suit_bid(1, Suit::Diamond),
        Call::nt(1),
        HandPat::hcp(12, 14).lens((0, 3), (4, 5), (2, 3), (2, 3)),
        HandPat::hcp(6, 9)
            .lens((2, 5), (2, 3), (2, 3), (2, 3))
            .bal(true),
    ));
    v.push(rebid(
        "rebid.1m.1nt.rebid",
        "Rebid the minor over 1NT",
        Call::suit_bid(2, Suit::Diamond),
        Call::suit_bid(1, Suit::Diamond),
        Call::nt(1),
        HandPat::hcp(12, 14)
            .lens((0, 3), (6, 7), (0, 3), (0, 3))
            .bal(false),
        HandPat::hcp(6, 9)
            .lens((2, 5), (2, 3), (2, 3), (2, 3))
            .bal(true),
    ));

    // --- Rebids ---
    v.push(rebid(
        "rebid.stayman.2h",
        "Stayman: show hearts",
        Call::suit_bid(2, Suit::Heart),
        Call::nt(1),
        Call::suit_bid(2, Suit::Club),
        HandPat::hcp(15, 17)
            .lens((2, 5), (2, 5), (4, 5), (2, 4))
            .bal(true),
        HandPat::hcp(8, 11).lens((1, 5), (1, 5), (4, 4), (0, 3)),
    ));
    v.push(rebid(
        "rebid.stayman.2s",
        "Stayman: show spades",
        Call::suit_bid(2, Suit::Spade),
        Call::nt(1),
        Call::suit_bid(2, Suit::Club),
        HandPat::hcp(15, 17)
            .lens((2, 5), (2, 5), (2, 3), (4, 5))
            .bal(true),
        HandPat::hcp(8, 11).lens((1, 5), (1, 5), (0, 3), (4, 4)),
    ));
    v.push(rebid(
        "rebid.stayman.2d",
        "Stayman: no major",
        Call::suit_bid(2, Suit::Diamond),
        Call::nt(1),
        Call::suit_bid(2, Suit::Club),
        HandPat::hcp(15, 17)
            .lens((3, 5), (3, 5), (2, 3), (2, 3))
            .bal(true),
        HandPat::hcp(8, 11).lens((1, 5), (1, 5), (4, 4), (0, 3)),
    ));
    v.push(rebid(
        "rebid.xfer.complete.h",
        "Complete transfer to hearts",
        Call::suit_bid(2, Suit::Heart),
        Call::nt(1),
        Call::suit_bid(2, Suit::Diamond),
        nt_opener(),
        HandPat::hcp(0, 9).lens((1, 4), (1, 4), (5, 6), (0, 3)),
    ));
    v.push(rebid(
        "rebid.xfer.complete.s",
        "Complete transfer to spades",
        Call::suit_bid(2, Suit::Spade),
        Call::nt(1),
        Call::suit_bid(2, Suit::Heart),
        nt_opener(),
        HandPat::hcp(0, 9).lens((1, 4), (1, 4), (0, 3), (5, 6)),
    ));
    v.push(rebid(
        "rebid.1s.raise.pass",
        "Pass the simple raise (min)",
        Call::Pass,
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(2, Suit::Spade),
        HandPat::hcp(11, 13)
            .lens((1, 4), (1, 4), (1, 4), (5, 6))
            .bal(false),
        raise_north(Suit::Spade, 6, 8, 3),
    ));
    v.push(rebid(
        "rebid.1s.raise.invite",
        "Invite over 2♠",
        Call::suit_bid(3, Suit::Spade),
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(2, Suit::Spade),
        HandPat::hcp(15, 16)
            .lens((1, 4), (1, 4), (1, 3), (5, 6))
            .bal(false),
        raise_north(Suit::Spade, 6, 8, 3),
    ));
    v.push(rebid(
        "rebid.1s.raise.game",
        "Bid 4♠ over 2♠",
        Call::suit_bid(4, Suit::Spade),
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(2, Suit::Spade),
        HandPat::hcp(17, 19)
            .lens((0, 4), (0, 4), (0, 3), (5, 7))
            .bal(false),
        raise_north(Suit::Spade, 6, 8, 3),
    ));
    v.push(rebid(
        "rebid.1h.raise.pass",
        "Pass the simple raise (min)",
        Call::Pass,
        Call::suit_bid(1, Suit::Heart),
        Call::suit_bid(2, Suit::Heart),
        HandPat::hcp(11, 13)
            .lens((1, 4), (1, 4), (5, 6), (0, 3))
            .bal(false),
        raise_north(Suit::Heart, 6, 8, 3),
    ));
    v.push(rebid(
        "rebid.1h.raise.invite",
        "Invite over 2♥",
        Call::suit_bid(3, Suit::Heart),
        Call::suit_bid(1, Suit::Heart),
        Call::suit_bid(2, Suit::Heart),
        HandPat::hcp(15, 16)
            .lens((1, 4), (1, 4), (5, 6), (0, 3))
            .bal(false),
        raise_north(Suit::Heart, 6, 8, 3),
    ));
    v.push(rebid(
        "rebid.1s.1nt.pass",
        "Pass 1NT with 5332 min",
        Call::Pass,
        Call::suit_bid(1, Suit::Spade),
        Call::nt(1),
        HandPat::hcp(12, 14)
            .lens((2, 3), (2, 3), (2, 3), (5, 5))
            .bal(true),
        HandPat::hcp(6, 9).lens((2, 5), (2, 5), (2, 4), (0, 2)),
    ));
    v.push(rebid(
        "rebid.1s.1nt.2s",
        "Rebid 2♠ after 1NT",
        Call::suit_bid(2, Suit::Spade),
        Call::suit_bid(1, Suit::Spade),
        Call::nt(1),
        HandPat::hcp(11, 15)
            .lens((1, 3), (1, 3), (1, 3), (6, 7))
            .bal(false),
        HandPat::hcp(6, 9).lens((2, 5), (2, 5), (2, 4), (0, 2)),
    ));
    v.push(rebid(
        "rebid.1s.1nt.2h",
        "Show hearts after 1♠–1NT",
        Call::suit_bid(2, Suit::Heart),
        Call::suit_bid(1, Suit::Spade),
        Call::nt(1),
        HandPat::hcp(12, 16)
            .lens((1, 3), (1, 3), (4, 5), (5, 6))
            .bal(false),
        HandPat::hcp(6, 9).lens((2, 5), (2, 5), (0, 3), (0, 2)),
    ));
    v.push(rebid(
        "rebid.1s.limit.reject",
        "Pass a limit raise (min)",
        Call::Pass,
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(3, Suit::Spade),
        HandPat::hcp(11, 13)
            .lens((1, 4), (1, 4), (1, 4), (5, 6))
            .bal(false),
        raise_north(Suit::Spade, 10, 11, 3),
    ));
    v.push(rebid(
        "rebid.1s.limit.accept",
        "Accept a limit raise",
        Call::suit_bid(4, Suit::Spade),
        Call::suit_bid(1, Suit::Spade),
        Call::suit_bid(3, Suit::Spade),
        HandPat::hcp(15, 17)
            .lens((1, 4), (1, 4), (1, 3), (5, 6))
            .bal(false),
        raise_north(Suit::Spade, 10, 11, 3),
    ));
    v.push(rebid(
        "rebid.1m.1h.raise2",
        "Raise 1♥ to 2♥",
        Call::suit_bid(2, Suit::Heart),
        Call::suit_bid(1, Suit::Club),
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(12, 14)
            .lens((3, 5), (1, 4), (4, 4), (0, 3))
            .bal(false),
        HandPat::hcp(6, 9).lens((1, 4), (1, 4), (4, 5), (0, 3)),
    ));
    v.push(rebid(
        "rebid.1m.1nt",
        "Rebid 1NT after 1♣–1♥",
        Call::nt(1),
        Call::suit_bid(1, Suit::Club),
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(13, 14)
            .lens((3, 4), (3, 4), (2, 3), (2, 3))
            .bal(true),
        HandPat::hcp(6, 9).lens((1, 4), (1, 4), (4, 5), (0, 3)),
    ));

    // --- Decisions the tree makes that the course does not drill. They are
    // registered so the learner places them in a full auction and so a new
    // branch cannot appear without being listed somewhere.
    v.push(undrilled(
        "pass.fourth-seat",
        Family::Open,
        "Pass in fourth seat",
    ));
    v.push(undrilled("rebid.1c.1d.1s", Family::Rebid, "Bid 1♠"));
    v.push(undrilled("rebid.1c.1d.2c", Family::Rebid, "Rebid 2♣"));
    v.push(undrilled("rebid.1c.1d.2nt", Family::Rebid, "Jump to 2NT"));
    v.push(undrilled(
        "rebid.1c.1d.raise3",
        Family::Rebid,
        "Jump raise the diamonds",
    ));
    v.push(undrilled("rebid.1h.1s.2nt", Family::Rebid, "Jump to 2NT"));
    v.push(undrilled("rebid.1h.1s.game", Family::Rebid, "Raise to 4♠"));
    v.push(undrilled(
        "rebid.1h.1s.new-minor",
        Family::Rebid,
        "Show the second suit",
    ));
    v.push(undrilled(
        "rebid.1h.1s.raise3",
        Family::Rebid,
        "Jump raise to 3♠",
    ));
    v.push(undrilled("rebid.1m.1h.1s", Family::Rebid, "Bid 1♠"));
    v.push(undrilled("rebid.1m.1nt.2nt", Family::Rebid, "Jump to 2NT"));
    v.push(undrilled("rebid.1m.1nt.3nt", Family::Rebid, "Bid 3NT"));
    v.push(undrilled("rebid.1m.2nt", Family::Rebid, "Jump to 2NT"));
    v.push(undrilled(
        "rebid.1m.other-minor",
        Family::Rebid,
        "Show the other minor",
    ));
    v.push(undrilled(
        "rebid.1m.rebid-minor",
        Family::Rebid,
        "Rebid the minor",
    ));
    v.push(undrilled("rebid.1m.reverse", Family::Rebid, "Reverse"));
    v.push(undrilled("rebid.2c.3nt", Family::Rebid, "Bid 3NT"));
    v.push(undrilled(
        "rebid.2c.raise-major",
        Family::Rebid,
        "Bid the major game",
    ));
    v.push(undrilled(
        "rebid.2level.game",
        Family::Rebid,
        "Bid the major game",
    ));
    v.push(undrilled("rebid.2nt.pass", Family::Rebid, "Pass"));
    v.push(undrilled(
        "rebid.2nt.stayman.3d",
        Family::Rebid,
        "Stayman: no major",
    ));
    v.push(undrilled(
        "rebid.2nt.stayman.3s",
        Family::Rebid,
        "Stayman: show spades",
    ));
    v.push(undrilled(
        "rebid.2nt.xfer.s",
        Family::Rebid,
        "Complete the transfer",
    ));
    v.push(undrilled("rebid.minor-raise.3nt", Family::Rebid, "Bid 3NT"));
    v.push(undrilled("rebid.pass.default", Family::Rebid, "Pass"));
    v.push(undrilled(
        "rebid.preempt.raise",
        Family::Rebid,
        "Raise partner's major to game",
    ));
    v.push(undrilled(
        "rebid.preempt.rebid-suit",
        Family::Rebid,
        "Repeat your suit",
    ));
    v.push(undrilled(
        "resp.2c.2nt",
        Family::RespStrong,
        "Positive: 2NT",
    ));
    v.push(undrilled("resp.other.pass", Family::RespStrong, "Pass"));
    v.push(undrilled(
        "resp.preempt.game",
        Family::RespStrong,
        "Raise to game",
    ));
    v.push(undrilled(
        "resp.weak2.new-suit",
        Family::RespStrong,
        "Bid your own suit",
    ));
    v.push(undrilled("resp2.2c.3nt", Family::Continue, "Bid 3NT"));
    v.push(undrilled(
        "resp2.2c.minor-game",
        Family::Continue,
        "Raise to game in the minor",
    ));
    v.push(undrilled(
        "resp2.2c.raise",
        Family::Continue,
        "Raise partner's major to game",
    ));
    v.push(undrilled(
        "resp2.accept.3nt",
        Family::Continue,
        "Accept: bid 3NT",
    ));
    v.push(undrilled(
        "resp2.accept.game",
        Family::Continue,
        "Accept: bid the major game",
    ));
    v.push(undrilled(
        "resp2.decline",
        Family::Continue,
        "Decline the invitation",
    ));
    v.push(undrilled("resp2.nt.pass", Family::Continue, "Pass"));
    v.push(undrilled("resp2.pass", Family::Continue, "Pass"));
    v.push(undrilled(
        "resp2.pass-game",
        Family::Continue,
        "Pass — partner has bid the game",
    ));
    v.push(undrilled(
        "resp2.raise-second",
        Family::Continue,
        "Raise partner's second suit",
    ));
    v.push(undrilled(
        "resp2.stayman.2nt",
        Family::Continue,
        "Invite in notrump",
    ));
    v.push(undrilled("resp2.stayman.3nt", Family::Continue, "Bid 3NT"));
    v.push(undrilled(
        "resp2.stayman.game",
        Family::Continue,
        "Bid the major game",
    ));
    v.push(undrilled(
        "resp2.stayman.invite",
        Family::Continue,
        "Invite in the major",
    ));
    v.push(undrilled("resp2.stayman.pass", Family::Continue, "Pass"));
    v.push(undrilled(
        "resp2.suit.2nt",
        Family::Continue,
        "Invite in notrump",
    ));
    v.push(undrilled("resp2.suit.3nt", Family::Continue, "Bid 3NT"));
    v.push(undrilled(
        "resp2.suit.accept-raise",
        Family::Continue,
        "Bid the major game",
    ));
    v.push(undrilled(
        "resp2.suit.game",
        Family::Continue,
        "Bid the major game",
    ));
    v.push(undrilled(
        "resp2.suit.invite",
        Family::Continue,
        "Invite in the major",
    ));
    v.push(undrilled(
        "resp2.suit.minor-game",
        Family::Continue,
        "Bid game in the minor",
    ));
    v.push(undrilled("resp2.suit.pass-limit", Family::Continue, "Pass"));
    v.push(undrilled(
        "resp2.suit.raise-2nt",
        Family::Continue,
        "Bid 3NT",
    ));
    v.push(undrilled(
        "resp2.xfer.2nt",
        Family::Continue,
        "Invite in notrump",
    ));
    v.push(undrilled("resp2.xfer.3nt", Family::Continue, "Bid 3NT"));
    v.push(undrilled(
        "resp2.xfer.game",
        Family::Continue,
        "Bid the major game",
    ));
    v.push(undrilled(
        "resp2.xfer.invite",
        Family::Continue,
        "Invite in the major",
    ));
    v.push(undrilled(
        "resp2.xfer.pass",
        Family::Continue,
        "Pass the transfer",
    ));
    v.push(undrilled(
        "resp3.accept.major",
        Family::Continue,
        "Accept: bid the major game",
    ));
    v.push(undrilled(
        "resp3.decline",
        Family::Continue,
        "Decline the invitation",
    ));
    v.push(undrilled(
        "resp3.pass-game",
        Family::Continue,
        "Pass — partner named the game",
    ));
    v.push(undrilled(
        "unsupported",
        Family::Continue,
        "Pass — nothing more to say",
    ));
    v.push(undrilled("rebid.1h.1nt.2c", Family::Rebid, "Rebid a minor"));
    v.push(undrilled("rebid.1h.1nt.2d", Family::Rebid, "Rebid a minor"));
    v.push(undrilled(
        "rebid.1h.1nt.2h",
        Family::Rebid,
        "Rebid the six-card major",
    ));
    v.push(undrilled("rebid.1h.1nt.2nt", Family::Rebid, "Jump to 2NT"));
    v.push(undrilled(
        "rebid.1h.1nt.2s",
        Family::Rebid,
        "Show the second major",
    ));
    v.push(undrilled("rebid.1h.1nt.pass", Family::Rebid, "Pass 1NT"));
    v.push(undrilled(
        "rebid.1h.limit.accept",
        Family::Rebid,
        "Accept the limit raise",
    ));
    v.push(undrilled(
        "rebid.1h.limit.reject",
        Family::Rebid,
        "Pass the limit raise",
    ));
    v.push(undrilled(
        "rebid.1h.raise.game",
        Family::Rebid,
        "Bid game over the raise",
    ));
    v.push(undrilled(
        "rebid.1m.1h.game",
        Family::Rebid,
        "Raise to game",
    ));
    v.push(undrilled("rebid.1m.1h.raise3", Family::Rebid, "Jump raise"));
    v.push(undrilled(
        "rebid.1m.1s.game",
        Family::Rebid,
        "Raise to game",
    ));
    v.push(undrilled(
        "rebid.1m.1s.raise2",
        Family::Rebid,
        "Raise to two",
    ));
    v.push(undrilled("rebid.1m.1s.raise3", Family::Rebid, "Jump raise"));
    v.push(undrilled("rebid.1s.1nt.2c", Family::Rebid, "Rebid a minor"));
    v.push(undrilled("rebid.1s.1nt.2d", Family::Rebid, "Rebid a minor"));
    v.push(undrilled("rebid.1s.1nt.2nt", Family::Rebid, "Jump to 2NT"));
    v.push(undrilled(
        "rebid.side-minor",
        Family::Rebid,
        "Rebid a minor",
    ));
    v.push(undrilled("resp.1c.2nt", Family::RespMinor, "2NT invite"));
    v.push(undrilled(
        "resp.1c.3nt",
        Family::RespMinor,
        "3NT over a minor",
    ));
    v.push(undrilled(
        "resp.1c.raise2",
        Family::RespMinor,
        "Simple raise of the minor",
    ));
    v.push(undrilled(
        "resp.1c.raise3",
        Family::RespMinor,
        "Limit raise of the minor",
    ));
    v.push(undrilled("resp.1d.2nt", Family::RespMinor, "2NT invite"));
    v.push(undrilled(
        "resp.1d.3nt",
        Family::RespMinor,
        "3NT over a minor",
    ));
    v.push(undrilled("resp.1d.pass", Family::RespMinor, "Pass"));
    v.push(undrilled(
        "resp.1d.raise2",
        Family::RespMinor,
        "Simple raise of the minor",
    ));
    v.push(undrilled(
        "resp.1d.raise3",
        Family::RespMinor,
        "Limit raise of the minor",
    ));
    v.push(undrilled(
        "resp.1h.2c",
        Family::RespMajor,
        "Two-level shift",
    ));
    v.push(undrilled(
        "resp.1h.2d",
        Family::RespMajor,
        "Two-level shift",
    ));
    v.push(undrilled("resp.1h.2nt", Family::RespMajor, "2NT invite"));
    v.push(undrilled("resp.1h.3nt", Family::RespMajor, "3NT"));
    v.push(undrilled(
        "resp.1h.pass.fit-too-weak",
        Family::RespMajor,
        "Two-level shift",
    ));
    v.push(undrilled("resp.1s.2nt", Family::RespMajor, "2NT invite"));
    v.push(undrilled("resp.1s.3nt", Family::RespMajor, "3NT"));
    v.push(undrilled(
        "resp.1s.pass.fit-too-weak",
        Family::RespMajor,
        "Two-level shift",
    ));
    v.push(undrilled(
        "resp.2c.2s",
        Family::RespStrong,
        "Positive: show the suit",
    ));
    v.push(undrilled(
        "resp.2c.3c",
        Family::RespStrong,
        "Positive: show the suit",
    ));
    v.push(undrilled(
        "resp.2c.3d",
        Family::RespStrong,
        "Positive: show the suit",
    ));
    v.push(undrilled(
        "resp.2minor",
        Family::RespMinor,
        "Two-level shift",
    ));
    v.push(undrilled(
        "resp.2nt.xfer.s",
        Family::Resp1NT,
        "Transfer over 2NT",
    ));
    v.push(undrilled(
        "resp.raise",
        Family::RespMajor,
        "Two-level shift",
    ));
    v.push(undrilled(
        "resp.1c.game",
        Family::RespMinor,
        "Bid game in the minor",
    ));
    v.push(undrilled(
        "resp.1d.game",
        Family::RespMinor,
        "Bid game in the minor",
    ));
    v.push(undrilled(
        "resp.1c.raise3.invite",
        Family::RespMinor,
        "Limit raise of the minor",
    ));
    v.push(undrilled(
        "resp.1d.raise3.invite",
        Family::RespMinor,
        "Limit raise of the minor",
    ));
    v.push(undrilled(
        "resp2.forced.2nt",
        Family::Continue,
        "Bid 2NT — you may not pass",
    ));
    v.push(undrilled(
        "resp2.forced.raise",
        Family::Continue,
        "Raise partner's second suit",
    ));
    v.push(undrilled(
        "resp2.stayman.own-major",
        Family::Continue,
        "Show your five-card major",
    ));
    v.push(undrilled(
        "resp2.xfer.other-major",
        Family::Continue,
        "Show the second major",
    ));
    v.push(undrilled(
        "resp3.convert.major",
        Family::Continue,
        "Convert to the major game",
    ));
    v.push(undrilled(
        "resp2.forced.game",
        Family::Continue,
        "Bid the major game",
    ));
    v.push(undrilled(
        "resp2.forced.3nt",
        Family::Continue,
        "Bid the game",
    ));
    v.push(undrilled(
        "resp2.stayman.own-major.force",
        Family::Continue,
        "Show your five-card major, forcing",
    ));
    v.push(undrilled(
        "resp3.forced.game",
        Family::Continue,
        "Bid the game",
    ));
    v.push(undrilled(
        "resp3.forced.accept",
        Family::Continue,
        "Bid the game anyway",
    ));
    v.push(undrilled(
        "resp3.choose.major",
        Family::Continue,
        "Choose the other major",
    ));
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_ids_are_unique() {
        let mut ids: Vec<&str> = catalog().iter().map(|l| l.id).collect();
        let n = ids.len();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(n, ids.len());
    }

    #[test]
    fn every_family_has_leaves() {
        for fam in [
            Family::Open,
            Family::Resp1NT,
            Family::RespMajor,
            Family::RespMinor,
            Family::Rebid,
        ] {
            assert!(
                !leaves_in_family(Some(fam)).is_empty(),
                "empty family {}",
                fam.slug()
            );
        }
    }
}
