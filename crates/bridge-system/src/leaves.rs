#![allow(clippy::too_many_arguments, clippy::vec_init_then_push)]

use crate::bid::Call;
use crate::cards::{Seat, Suit};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Family {
    Open,
    Resp1NT,
    RespMajor,
    RespMinor,
    Rebid,
}

impl Family {
    pub fn slug(self) -> &'static str {
        match self {
            Family::Open => "open",
            Family::Resp1NT => "1nt",
            Family::RespMajor => "major",
            Family::RespMinor => "minor",
            Family::Rebid => "rebid",
        }
    }

    pub fn title(self) -> &'static str {
        match self {
            Family::Open => "Openings",
            Family::Resp1NT => "Respond to 1NT",
            Family::RespMajor => "Respond to 1♥/1♠",
            Family::RespMinor => "Respond to 1♣/1♦",
            Family::Rebid => "Opener’s rebid",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "" | "all" => None,
            "open" | "opening" | "openings" => Some(Family::Open),
            "1nt" | "nt" => Some(Family::Resp1NT),
            "major" | "majors" | "1M" => Some(Family::RespMajor),
            "minor" | "minors" | "1m" => Some(Family::RespMinor),
            "rebid" | "rebids" => Some(Family::Rebid),
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

#[derive(Clone, Debug)]
pub struct LeafSpec {
    pub id: &'static str,
    pub family: Family,
    pub title: &'static str,
    pub expected: Call,
    pub dealer: Seat,
    pub calls_before: Vec<Call>,
    pub south: HandPat,
    pub north: Option<HandPat>,
}

pub fn catalog() -> &'static [LeafSpec] {
    use std::sync::OnceLock;
    static C: OnceLock<Vec<LeafSpec>> = OnceLock::new();
    C.get_or_init(build).as_slice()
}

pub fn leaf_by_id(id: &str) -> Option<&'static LeafSpec> {
    catalog().iter().find(|l| l.id == id)
}

pub fn leaves_in_family(family: Option<Family>) -> Vec<&'static LeafSpec> {
    catalog()
        .iter()
        .filter(|l| family.is_none_or(|f| l.family == f))
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
) -> LeafSpec {
    LeafSpec {
        id,
        family,
        title,
        expected,
        dealer,
        calls_before,
        south,
        north,
    }
}

fn open(id: &'static str, title: &'static str, expected: Call, south: HandPat) -> LeafSpec {
    leaf(
        id,
        Family::Open,
        title,
        expected,
        Seat::South,
        vec![],
        south,
        None,
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
        HandPat::hcp(0, 9).lens((2, 5), (2, 5), (2, 5), (2, 5)),
    ));
    v.push(open(
        "open.1nt",
        "Open 1NT (no 5-card major)",
        Call::nt(1),
        HandPat::hcp(15, 17)
            .lens((2, 5), (2, 5), (2, 4), (2, 4))
            .bal(true),
    ));
    v.push(open(
        "open.1nt.5major",
        "Open 1NT with a 5-card major",
        Call::nt(1),
        HandPat::hcp(15, 17)
            .lens((2, 3), (2, 3), (2, 5), (2, 5))
            .bal(true)
            .five_major(),
    ));
    v.push(open(
        "open.2nt",
        "Open 2NT",
        Call::nt(2),
        HandPat::hcp(20, 21)
            .lens((2, 5), (2, 5), (2, 5), (2, 5))
            .bal(true),
    ));
    v.push(open(
        "open.2c",
        "Open 2♣ strong",
        Call::suit_bid(2, Suit::Club),
        HandPat::hcp(22, 27).lens((1, 7), (1, 7), (1, 7), (1, 7)),
    ));
    v.push(open(
        "open.1s",
        "Open 1♠ (5 cards)",
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(11, 16)
            .lens((1, 4), (1, 4), (1, 4), (5, 5))
            .bal(false),
    ));
    v.push(open(
        "open.1s.6plus",
        "Open 1♠ (6+ cards)",
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(11, 16)
            .lens((0, 4), (0, 4), (0, 4), (6, 7))
            .bal(false),
    ));
    v.push(open(
        "open.1s.equal-majors",
        "5–5 majors: open 1♠",
        Call::suit_bid(1, Suit::Spade),
        HandPat::hcp(12, 16)
            .lens((0, 3), (0, 3), (5, 6), (5, 6))
            .eq_maj(),
    ));
    v.push(open(
        "open.1h",
        "Open 1♥ (5 cards)",
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(11, 16)
            .lens((1, 4), (1, 4), (5, 5), (0, 4))
            .bal(false),
    ));
    v.push(open(
        "open.1h.6plus",
        "Open 1♥ (6+ cards)",
        Call::suit_bid(1, Suit::Heart),
        HandPat::hcp(11, 16)
            .lens((0, 4), (0, 4), (6, 7), (0, 4))
            .bal(false),
    ));
    v.push(open(
        "open.1d",
        "Open 1♦",
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(12, 16)
            .lens((0, 4), (4, 7), (0, 5), (0, 5))
            .bal(false),
    ));
    v.push(open(
        "open.1d.equal-minors",
        "Equal minors: open 1♦",
        Call::suit_bid(1, Suit::Diamond),
        HandPat::hcp(12, 16)
            .lens((4, 5), (4, 5), (0, 4), (0, 4))
            .eq_min(),
    ));
    v.push(open(
        "open.1c",
        "Open 1♣",
        Call::suit_bid(1, Suit::Club),
        HandPat::hcp(12, 16)
            .lens((4, 7), (0, 4), (0, 5), (0, 5))
            .bal(false),
    ));
    v.push(open(
        "open.1c.33-minors",
        "3–3 minors: open 1♣",
        Call::suit_bid(1, Suit::Club),
        HandPat::hcp(13, 14).lens((3, 3), (3, 3), (3, 4), (3, 4)),
    ));
    v.push(open(
        "open.2s",
        "Weak 2♠",
        Call::suit_bid(2, Suit::Spade),
        HandPat::hcp(6, 9).lens((1, 3), (1, 3), (1, 3), (6, 6)),
    ));
    v.push(open(
        "open.2h",
        "Weak 2♥",
        Call::suit_bid(2, Suit::Heart),
        HandPat::hcp(6, 9).lens((1, 3), (1, 3), (6, 6), (1, 3)),
    ));
    v.push(open(
        "open.2d",
        "Weak 2♦",
        Call::suit_bid(2, Suit::Diamond),
        HandPat::hcp(6, 9).lens((1, 3), (6, 6), (1, 3), (1, 3)),
    ));
    v.push(open(
        "open.3s",
        "Preempt 3♠",
        Call::suit_bid(3, Suit::Spade),
        HandPat::hcp(5, 9).lens((0, 3), (0, 3), (0, 3), (7, 8)),
    ));
    v.push(open(
        "open.3h",
        "Preempt 3♥",
        Call::suit_bid(3, Suit::Heart),
        HandPat::hcp(5, 9).lens((0, 3), (0, 3), (7, 8), (0, 3)),
    ));
    v.push(open(
        "open.3d",
        "Preempt 3♦",
        Call::suit_bid(3, Suit::Diamond),
        HandPat::hcp(5, 9).lens((0, 3), (7, 8), (0, 3), (0, 3)),
    ));
    v.push(open(
        "open.3c",
        "Preempt 3♣",
        Call::suit_bid(3, Suit::Club),
        HandPat::hcp(5, 9).lens((7, 8), (0, 3), (0, 3), (0, 3)),
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
        HandPat::hcp(10, 15).lens((6, 7), (0, 3), (0, 3), (0, 3)),
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
