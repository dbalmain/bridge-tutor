use rand::seq::SliceRandom;
use rand::Rng;

use crate::auction::Auction;
use crate::bid::Call;
use crate::cards::{is_balanced_shape, Card, Deal, Hand, Seat, Suit};
use crate::leaves::{leaf_by_id, Drill, HandPat, LeafSpec};
use crate::system::{decide, decide_for, opening};

const MAX_ATTEMPTS: u32 = 80_000;

#[derive(Debug)]
pub struct DealError {
    pub leaf_id: String,
    pub attempts: u32,
    pub message: String,
}

pub fn generate_for_id<R: Rng>(rng: &mut R, id: &str) -> Result<(Deal, u32), DealError> {
    let spec = leaf_by_id(id).ok_or_else(|| DealError {
        leaf_id: id.to_string(),
        attempts: 0,
        message: format!("unknown leaf {id}"),
    })?;
    generate(rng, spec)
}

pub fn generate<R: Rng>(rng: &mut R, spec: &LeafSpec) -> Result<(Deal, u32), DealError> {
    let Some(drill) = spec.drill.as_ref() else {
        return Err(DealError {
            leaf_id: spec.id.to_string(),
            attempts: 0,
            message: format!("{} is registered but not drillable", spec.id),
        });
    };
    for attempt in 1..=MAX_ATTEMPTS {
        if let Some(deal) = try_once(rng, drill) {
            if verify(&deal, spec, drill) {
                return Ok((deal, attempt));
            }
        }
    }
    Err(DealError {
        leaf_id: spec.id.to_string(),
        attempts: MAX_ATTEMPTS,
        message: format!(
            "could not construct a deal for {} after {MAX_ATTEMPTS} attempts",
            spec.id
        ),
    })
}

fn try_once<R: Rng>(rng: &mut R, drill: &Drill) -> Option<Deal> {
    let mut piles = piles_from_shuffled(rng);
    let south = deal_matching(rng, &mut piles, &drill.south)?;
    let north = if let Some(ref npat) = drill.north {
        deal_matching(rng, &mut piles, npat)?
    } else {
        take_random_13(rng, &mut piles)?
    };
    let rest: Vec<Card> = piles.into_iter().flatten().collect();
    if rest.len() != 26 {
        return None;
    }
    let mut rest = rest;
    rest.shuffle(rng);
    let east = Hand::try_from_slice(&rest[..13]).ok()?;
    let west = Hand::try_from_slice(&rest[13..]).ok()?;
    Deal::from_four(north, east, south, west).ok()
}

fn piles_from_shuffled<R: Rng>(rng: &mut R) -> [Vec<Card>; 4] {
    let mut piles: [Vec<Card>; 4] = [Vec::new(), Vec::new(), Vec::new(), Vec::new()];
    let mut deck: Vec<Card> = (0..52).filter_map(Card::from_id).collect();
    deck.shuffle(rng);
    for c in deck {
        piles[c.suit().idx()].push(c);
    }
    piles
}

fn deal_matching<R: Rng>(rng: &mut R, piles: &mut [Vec<Card>; 4], pat: &HandPat) -> Option<Hand> {
    let shape = sample_shape(rng, pat)?;
    for i in 0..4 {
        if piles[i].len() < shape[i] as usize {
            return None;
        }
    }
    let mut cards = Vec::with_capacity(13);
    for i in 0..4 {
        piles[i].shuffle(rng);
        let n = shape[i] as usize;
        cards.extend(piles[i].drain(..n));
    }
    let hand = Hand::try_from_slice(&cards).ok()?;
    if !hand_fits_pat(&hand, pat) {
        // Put the cards back so the caller can retry a full deal.
        for c in cards {
            piles[c.suit().idx()].push(c);
        }
        return None;
    }
    Some(hand)
}

/// One hand matching `pat`, drawn the way the deal generator draws it. Tests
/// use this to check a pattern describes the hands it claims: `generate` +
/// `verify` cannot, because they retry until something fits and so report
/// success on a pattern that is mostly wrong.
#[cfg(test)]
pub(crate) fn sample_hand<R: Rng>(rng: &mut R, pat: &HandPat) -> Option<Hand> {
    let mut piles = piles_from_shuffled(rng);
    deal_matching(rng, &mut piles, pat)
}

fn take_random_13<R: Rng>(rng: &mut R, piles: &mut [Vec<Card>; 4]) -> Option<Hand> {
    let mut all: Vec<Card> = piles.iter_mut().flat_map(|p| p.drain(..)).collect();
    if all.len() < 13 {
        *piles = [Vec::new(), Vec::new(), Vec::new(), Vec::new()];
        for c in all {
            piles[c.suit().idx()].push(c);
        }
        return None;
    }
    all.shuffle(rng);
    let hand_cards: Vec<Card> = all.drain(..13).collect();
    for c in all {
        piles[c.suit().idx()].push(c);
    }
    Hand::try_from_slice(&hand_cards).ok()
}

fn inclusive_u8<R: Rng>(rng: &mut R, lo: u8, hi: u8) -> Option<u8> {
    if lo > hi {
        return None;
    }
    Some(rng.gen_range(lo..=hi))
}

fn sample_shape<R: Rng>(rng: &mut R, pat: &HandPat) -> Option<[u8; 4]> {
    if pat.five_four_majors {
        let (h, s) = if rng.gen::<bool>() { (5, 4) } else { (4, 5) };
        let rest = 4u8;
        for _ in 0..80 {
            let hi = pat.max_len[0].min(rest);
            let Some(c) = inclusive_u8(rng, pat.min_len[0], hi) else {
                continue;
            };
            if rest < c {
                continue;
            }
            let d = rest - c;
            if d < pat.min_len[1] || d > pat.max_len[1] {
                continue;
            }
            return Some([c, d, h, s]);
        }
        return Some([2, 2, h, s]);
    }

    for _ in 0..500 {
        let mut l = [0u8; 4];
        for (i, slot) in l.iter_mut().enumerate() {
            if pat.min_len[i] > pat.max_len[i] {
                return None;
            }
            *slot = inclusive_u8(rng, pat.min_len[i], pat.max_len[i].min(13))?;
        }
        if l.iter().copied().sum::<u8>() != 13 {
            continue;
        }
        if pat.equal_majors && l[2] != l[3] {
            continue;
        }
        if pat.equal_minors && l[0] != l[1] {
            continue;
        }
        if pat.require_five_major && l[2] < 5 && l[3] < 5 {
            continue;
        }
        if let Some(b) = pat.balanced {
            if is_balanced_shape(l) != b {
                continue;
            }
        }
        return Some(l);
    }

    constructive_shape(rng, pat)
}

fn constructive_shape<R: Rng>(rng: &mut R, pat: &HandPat) -> Option<[u8; 4]> {
    let mut l = pat.min_len;
    let mut rem = 13u8.checked_sub(l.iter().copied().sum())?;
    let mut room: Vec<usize> = (0..4).filter(|&i| l[i] < pat.max_len[i]).collect();
    while rem > 0 {
        if room.is_empty() {
            return None;
        }
        let pick = room[rng.gen_range(0..room.len())];
        l[pick] += 1;
        rem -= 1;
        room.retain(|&i| l[i] < pat.max_len[i]);
    }
    if pat.equal_majors && l[2] != l[3] {
        return None;
    }
    if pat.equal_minors && l[0] != l[1] {
        return None;
    }
    if pat.require_five_major && l[2] < 5 && l[3] < 5 {
        return None;
    }
    if let Some(b) = pat.balanced {
        if is_balanced_shape(l) != b {
            return None;
        }
    }
    Some(l)
}

fn hand_fits_pat(hand: &Hand, pat: &HandPat) -> bool {
    let hcp = hand.hcp();
    if hcp < pat.min_hcp || hcp > pat.max_hcp {
        return false;
    }
    let sh = hand.shape();
    for ((len, min), max) in sh.iter().zip(pat.min_len).zip(pat.max_len) {
        if *len < min || *len > max {
            return false;
        }
    }
    if let Some(b) = pat.balanced {
        if hand.is_balanced() != b {
            return false;
        }
    }
    if pat.equal_majors && hand.len_of(Suit::Heart) != hand.len_of(Suit::Spade) {
        return false;
    }
    if pat.equal_minors && hand.len_of(Suit::Club) != hand.len_of(Suit::Diamond) {
        return false;
    }
    if pat.require_five_major && !hand.has_five_major() {
        return false;
    }
    if pat.five_four_majors {
        let h = hand.len_of(Suit::Heart);
        let s = hand.len_of(Suit::Spade);
        if !((h == 5 && s == 4) || (h == 4 && s == 5)) {
            return false;
        }
    }
    true
}

pub fn auction_for(drill: &Drill) -> Auction {
    Auction {
        dealer: drill.dealer,
        calls: drill.calls_before.clone(),
    }
}

/// One call in the uncontested system auction, from dealer to pass-out.
#[derive(Clone, Debug)]
pub struct ScriptCall {
    pub seat: Seat,
    pub bid: Call,
    pub leaf_id: &'static str,
    pub title: &'static str,
    pub explanation: &'static str,
    /// South's in-tree turns — the student should place these.
    pub student: bool,
}

/// The uncontested system auction, dealer to pass-out.
///
/// Any seat may open while the auction is still nothing but passes — without
/// that, a deal where the dealer passes and an opponent holds 14 opening
/// points reads as passed out, which is a lie. Once someone has opened, only
/// their partnership keeps bidding: this course has no competitive bidding
/// yet, so the other side stays silent.
pub fn uncontested_script(deal: &Deal, dealer: Seat) -> Vec<ScriptCall> {
    let mut auction = Auction::empty(dealer);
    let mut out = Vec::with_capacity(8);
    let mut opener: Option<Seat> = None;
    for _ in 0..16 {
        if auction.ended() {
            break;
        }
        let seat = auction.next_seat();
        let ours = match opener {
            None => true,
            Some(o) => o == seat || o == seat.partner(),
        };
        let step = if ours {
            let d = decide_for(&deal.hand(seat), &auction, seat);
            ScriptCall {
                seat,
                bid: d.bid,
                leaf_id: d.leaf_id,
                title: d.title,
                explanation: d.explanation,
                // Only a call some lesson has TAUGHT. Registration is not
                // the same property: cc3f5db briefly used it here, which
                // asked the learner to place responder's second call before
                // any lesson covered the five-versus-six continuations. Every
                // drillable leaf is taught — `every_catalogue_leaf_is_taught_
                // by_a_lesson` enforces that — so drillability is the right
                // test until a lesson exists for the deeper calls.
                //
                // The rest of the auction still plays out and is still shown;
                // it is graded participation that is withheld, not the calls.
                student: seat == Seat::South
                    && leaf_by_id(d.leaf_id).is_some_and(|l| l.drillable()),
            }
        } else {
            ScriptCall {
                seat,
                bid: Call::Pass,
                leaf_id: "pass.opponents-opened",
                title: "Pass — the other side opened",
                explanation: "This course does not teach bidding against an opening, so once the opponents open, your side stays out of the auction.",
                student: false,
            }
        };
        if opener.is_none() && step.bid != Call::Pass {
            opener = Some(seat);
        }
        auction.calls.push(step.bid);
        out.push(step);
    }
    out
}

fn verify(deal: &Deal, spec: &LeafSpec, drill: &Drill) -> bool {
    let auction = auction_for(drill);
    if auction.next_seat() != Seat::South {
        return false;
    }
    let d = decide(&deal.south, &auction);
    if d.leaf_id != spec.id || d.bid != drill.expected {
        return false;
    }

    match drill.dealer {
        Seat::North => {
            let open = opening(&deal.north);
            if drill.calls_before.first().copied() != Some(open.bid) {
                return false;
            }
        }
        Seat::South => {
            if drill.calls_before.is_empty() {
                return true;
            }
            let open = opening(&deal.south);
            if drill.calls_before.first().copied() != Some(open.bid) {
                return false;
            }
            if drill.calls_before.len() >= 3 {
                let resp = crate::system::respond(&deal.north, open.bid);
                if drill.calls_before.get(2).copied() != Some(resp.bid) {
                    return false;
                }
            }
        }
        _ => {}
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bid::Strain;
    use crate::leaves::drills;
    use rand::rngs::SmallRng;
    use rand::SeedableRng;

    /// A leaf's HandPat is deliberately over-approximate — the evaluator is
    /// the filter — so it is allowed to admit hands that turn out to be a
    /// different leaf. What it may not be is *mostly* wrong: a pattern with
    /// the suits transposed, or one that admits hands the leaf can never
    /// contain, still generates fine because `verify` retries until something
    /// fits. This samples straight from each opening pattern and asks the tree
    /// what it would bid, which is the claim the pattern is making.
    #[test]
    fn opening_leaf_patterns_are_not_grossly_wrong() {
        const MIN_HIT_RATE: f64 = 0.6;
        const SAMPLE_TARGET: u32 = 200;
        let mut rng = SmallRng::seed_from_u64(31337);
        let mut wrong: Vec<String> = Vec::new();
        for spec in drills() {
            let drill = spec.drill.as_ref().expect("drillable");
            if spec.family != crate::leaves::Family::Open {
                continue;
            }
            let mut sampled = 0;
            let mut hits = 0;
            let mut example = String::new();
            // Keep drawing until the sample is big enough to mean something.
            // 2♣ and 2NT need 20+ HCP, which turns up roughly once in a few
            // thousand deals — a fixed budget silently skipped them.
            for _ in 0..400_000 {
                if sampled >= SAMPLE_TARGET {
                    break;
                }
                let Some(h) = sample_hand(&mut rng, &drill.south) else {
                    continue;
                };
                sampled += 1;
                let d = opening(&h);
                if d.leaf_id == spec.id {
                    hits += 1;
                } else if example.is_empty() {
                    let sh = h.shape();
                    example = format!(
                        "{} HCP {}-{}-{}-{} bids {}",
                        h.hcp(),
                        sh[3],
                        sh[2],
                        sh[1],
                        sh[0],
                        d.leaf_id
                    );
                }
            }
            assert_eq!(
                sampled, SAMPLE_TARGET,
                "{}: the draw budget ran out at {sampled} hands, short of the \
                 {SAMPLE_TARGET} this needs to mean anything",
                spec.id
            );
            let rate = f64::from(hits) / f64::from(sampled);
            if rate < MIN_HIT_RATE {
                wrong.push(format!(
                    "{}: only {hits}/{sampled} ({:.0}%) of pattern hands are this leaf — e.g. {example}",
                    spec.id,
                    rate * 100.0
                ));
            }
        }
        assert!(
            wrong.is_empty(),
            "patterns that mostly describe some other leaf:\n{}",
            wrong.join("\n")
        );
    }

    /// The same claim for response and rebid leaves, where the pattern covers
    /// both hands. `try_once` draws a deal matching them; `verify` then says
    /// whether the tree agrees it is this leaf. Generation retries until it
    /// does, so the interesting number is how often a pattern-matching deal
    /// is *rejected* — that is the pattern being wrong, not the deal.
    ///
    /// This is a smoke test, not validation, and the 15% floor was picked
    /// after seeing the numbers it judges — real patterns measure 22–45% and a
    /// transposed one measures 0%, so it separates those two and nothing
    /// finer. It catches a pattern pointed at the wrong suits. It does not
    /// establish that a pattern is right, and it cannot catch a bid that is
    /// legal but semantically wrong; only hands with independently authored
    /// expected calls can do that.
    #[test]
    fn response_and_rebid_patterns_are_not_grossly_wrong() {
        const MIN_HIT_RATE: f64 = 0.15;
        const DEAL_TARGET: u32 = 120;
        let mut rng = SmallRng::seed_from_u64(90210);
        let mut wrong: Vec<String> = Vec::new();
        for spec in drills() {
            let drill = spec.drill.as_ref().expect("drillable");
            if spec.family == crate::leaves::Family::Open {
                continue;
            }
            let mut drawn = 0;
            let mut hits = 0;
            for _ in 0..400_000 {
                if drawn >= DEAL_TARGET {
                    break;
                }
                let Some(deal) = try_once(&mut rng, drill) else {
                    continue;
                };
                drawn += 1;
                if verify(&deal, spec, drill) {
                    hits += 1;
                }
            }
            assert_eq!(
                drawn, DEAL_TARGET,
                "{}: the draw budget ran out at {drawn} deals, short of the \
                 {DEAL_TARGET} this needs to mean anything",
                spec.id
            );
            let rate = f64::from(hits) / f64::from(drawn);
            if rate < MIN_HIT_RATE {
                wrong.push(format!(
                    "{}: only {hits}/{drawn} ({:.0}%) of pattern deals are this leaf",
                    spec.id,
                    rate * 100.0
                ));
            }
        }
        assert!(
            wrong.is_empty(),
            "patterns that mostly describe some other leaf:\n{}",
            wrong.join("\n")
        );
    }

    /// A game-forcing auction must actually reach game, no auction may contain
    /// an illegal call, and neither miss nor overshoot game by a wide margin.
    ///
    /// The truncation this was written for: the auction used to stop dead
    /// after opener's rebid, so 2♣ – 2♦ – 2NT was passed out below game and a
    /// completed transfer sat in 2♥ with twenty-nine points between the hands.
    ///
    /// Of the four assertions only the legality one is independent of the
    /// system's own judgement — "strictly higher than the last bid" is a rule
    /// of bridge, so a wrong implementation cannot agree with it by
    /// construction. It is also the one that has caught the most: five
    /// distinct illegal calls on its first run. The three HCP assertions are
    /// coarse sanity bounds, not an oracle.
    #[test]
    fn forcing_auctions_reach_game_and_fits_are_not_left_in_partscore() {
        let mut rng = SmallRng::seed_from_u64(606);
        let mut failures: Vec<String> = Vec::new();
        for spec in drills() {
            let drill = spec.drill.as_ref().expect("drillable");
            for _ in 0..4 {
                let Ok((deal, _)) = generate(&mut rng, spec) else {
                    continue;
                };
                let script = uncontested_script(&deal, drill.dealer);
                let calls: Vec<Call> = script.iter().map(|s| s.bid).collect();
                let shown = |label: &str| {
                    format!(
                        "{}: {label} — {}",
                        spec.id,
                        calls
                            .iter()
                            .map(|c| c.to_app())
                            .collect::<Vec<_>>()
                            .join(" ")
                    )
                };

                // Every call must be legal: a pass, or a real bid strictly
                // above the last one.
                let mut last: Option<(u8, u8)> = None;
                for c in &calls {
                    if *c == Call::Pass {
                        continue;
                    }
                    let r = c.rank();
                    if r.is_none() || (last.is_some() && r <= last) {
                        failures.push(shown(&format!("illegal call {}", c.to_app())));
                    }
                    last = r;
                }

                // The side that actually bid, which is not always N/S: any
                // seat may open, and the earlier form of this test summed
                // North and South regardless, so a 29-point East/West 3NT
                // read as an eleven-point overbid.
                let Some(opener) = script.iter().find(|s| s.bid != Call::Pass) else {
                    continue;
                };
                let side = deal.hand(opener.seat).hcp() + deal.hand(opener.seat.partner()).hcp();
                let opened_2c = opener.bid == Call::suit_bid(2, Suit::Club);
                let Some(final_bid) = calls.iter().rev().find(|c| **c != Call::Pass) else {
                    continue;
                };
                // Level alone is not game: 4♣ is a partscore. The earlier form
                // excused every four-level contract and so counted 4♣ and 4♦
                // as game.
                let is_game = match *final_bid {
                    Call::Bid { level, strain } => match strain {
                        Strain::NoTrump => level >= 3,
                        Strain::Hearts | Strain::Spades => level >= 4,
                        _ => level >= 5,
                    },
                    _ => false,
                };

                if opened_2c && !is_game {
                    failures.push(shown(&format!(
                        "2♣ is game-forcing but the auction ended in {}",
                        final_bid.to_app()
                    )));
                }

                // The direction nothing checked: reaching game on values that
                // cannot be there. Without it, "bid 3NT after every opener
                // rebid" passes this whole test. 2♣ is exempt — it is forcing
                // to game on trick-taking strength, not HCP.
                if is_game && side < 20 && !opened_2c {
                    failures.push(shown(&format!(
                        "only {side} HCP on the bidding side but the auction reached {}",
                        final_bid.to_app()
                    )));
                }

                // 26+ HCP between the two hands and a partscore is a miss.
                if side >= 26 && !is_game {
                    failures.push(shown(&format!(
                        "{side} HCP on the bidding side but the auction ended in {}",
                        final_bid.to_app()
                    )));
                }
            }
        }
        failures.sort();
        failures.dedup();
        assert!(
            failures.is_empty(),
            "auctions that went wrong:\n{}",
            failures
                .iter()
                .take(12)
                .cloned()
                .collect::<Vec<_>>()
                .join("\n")
        );
    }

    #[test]
    fn every_leaf_generates() {
        let mut rng = SmallRng::seed_from_u64(20260828);
        let mut failures = Vec::new();
        for spec in drills() {
            match generate(&mut rng, spec) {
                Ok(_) => {}
                Err(e) => failures.push(format!("{}: {}", spec.id, e.message)),
            }
        }
        assert!(
            failures.is_empty(),
            "leaves that would not deal:\n{}",
            failures.join("\n")
        );
    }

    #[test]
    fn script_starts_at_dealer_and_hits_the_target_leaf() {
        let mut rng = SmallRng::seed_from_u64(20260830);
        let mut failures = Vec::new();
        for spec in drills() {
            let drill = spec.drill.as_ref().expect("drillable");
            let Ok((deal, _)) = generate(&mut rng, spec) else {
                failures.push(format!("{}: could not deal", spec.id));
                continue;
            };
            let script = uncontested_script(&deal, drill.dealer);
            if script.first().map(|s| s.seat) != Some(drill.dealer) {
                failures.push(format!("{}: script did not start at dealer", spec.id));
                continue;
            }
            let prefix: Vec<Call> = drill.calls_before.clone();
            let got: Vec<Call> = script.iter().take(prefix.len()).map(|s| s.bid).collect();
            if got != prefix {
                failures.push(format!(
                    "{}: script prefix {:?} != calls_before {:?}",
                    spec.id, got, prefix
                ));
                continue;
            }
            let Some(target) = script.get(prefix.len()) else {
                failures.push(format!("{}: script ended before the target call", spec.id));
                continue;
            };
            if target.seat != Seat::South
                || target.bid != drill.expected
                || target.leaf_id != spec.id
            {
                failures.push(format!(
                    "{}: target step seat={:?} bid={:?} leaf={} (want S / {:?} / {})",
                    spec.id, target.seat, target.bid, target.leaf_id, drill.expected, spec.id
                ));
            }
            if !script.iter().any(|s| s.seat == Seat::South && s.student) {
                failures.push(format!("{}: no student turn", spec.id));
            }
            for step in &script {
                if step.student && leaf_by_id(step.leaf_id).is_none() {
                    failures.push(format!(
                        "{}: student turn on unknown leaf {}",
                        spec.id, step.leaf_id
                    ));
                }
            }
        }
        assert!(
            failures.is_empty(),
            "script mismatches:\n{}",
            failures.join("\n")
        );
    }

    fn hand(cards: &str) -> Hand {
        let list: Vec<String> = cards.split_whitespace().map(str::to_string).collect();
        Hand::parse_app_list(&list).expect("13 valid cards")
    }

    /// Reported deal: South is dealer with 8 opening points and passes.
    /// North (11 points, Rule of 20 = 19) and West (11 / 19) are right to
    /// pass, but East has 14 opening points and 5-4-3-1 shape — this deal is
    /// not passed out, and used to be shown as one.
    #[test]
    fn a_fourth_seat_opening_hand_opens_instead_of_passing_out() {
        let deal = Deal::from_four(
            hand("S8 S7 S6 S2 HA H9 DA D9 CQ CT C9 C5 C3"),
            hand("SA SQ SJ S9 S3 HK HQ HT H3 DJ DT D5 C4"),
            hand("S5 S4 H8 H7 H5 H4 H2 DK D6 D3 CA C7 C6"),
            hand("SK ST HJ H6 DQ D8 D7 D4 D2 CK CJ C8 C2"),
        )
        .expect("a legal deal");

        let script = uncontested_script(&deal, Seat::South);
        let calls: Vec<(Seat, Call)> = script.iter().map(|s| (s.seat, s.bid)).collect();
        assert_eq!(
            &calls[..4],
            &[
                (Seat::South, Call::Pass),
                (Seat::West, Call::Pass),
                (Seat::North, Call::Pass),
                (Seat::East, Call::suit_bid(1, Suit::Spade)),
            ],
            "East holds 14 opening points and must open in fourth seat"
        );
        assert!(script[0].student, "South's pass is still the graded call");
        assert!(
            script.iter().any(|s| s.bid != Call::Pass),
            "the deal is not passed out"
        );
        // NS do not compete once the opponents have opened.
        for step in &script[4..] {
            if step.seat == Seat::North || step.seat == Seat::South {
                assert_eq!(step.bid, Call::Pass);
                assert_eq!(step.leaf_id, "pass.opponents-opened");
            }
        }
    }

    /// The other side of it: four hands that genuinely cannot open really is
    /// a pass-out, and must still play out all four passes.
    #[test]
    fn four_hands_below_opening_values_pass_out() {
        // 10 HCP and 4333-ish in every seat: 10 opening points, Rule of 20
        // = 17. Nobody can open, so four passes is the truth.
        let deal = Deal::from_four(
            hand("SA ST S9 S8 HJ H7 H6 DQ D7 D6 CK C7 C6"),
            hand("SK S7 S6 HA HT H9 H8 DJ D5 D4 CQ C5 C4"),
            hand("SQ S5 S4 HK H5 H4 DA DT D9 D8 CJ C3 C2"),
            hand("SJ S3 S2 HQ H3 H2 DK D3 D2 CA CT C9 C8"),
        )
        .expect("a legal deal");
        let script = uncontested_script(&deal, Seat::South);
        assert_eq!(script.len(), 4, "four passes, no more");
        assert!(script.iter().all(|s| s.bid == Call::Pass));
    }

    #[test]
    fn an_auction_with_a_bid_runs_to_pass_out() {
        let mut rng = SmallRng::seed_from_u64(11);
        let spec = leaf_by_id("open.1s").unwrap();
        let (deal, _) = generate(&mut rng, spec).unwrap();
        let script = uncontested_script(&deal, spec.drill.as_ref().unwrap().dealer);
        let n = script.len();
        assert!(n >= 4);
        assert!(script[n - 3..].iter().all(|s| s.bid == Call::Pass));
    }
}
