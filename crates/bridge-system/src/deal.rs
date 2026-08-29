use rand::seq::SliceRandom;
use rand::Rng;

use crate::auction::Auction;
use crate::cards::{is_balanced_shape, Card, Deal, Hand, Seat, Suit};
use crate::leaves::{leaf_by_id, HandPat, LeafSpec};
use crate::system::{decide, opening};

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
    for attempt in 1..=MAX_ATTEMPTS {
        if let Some(deal) = try_once(rng, spec) {
            if verify(&deal, spec) {
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

fn try_once<R: Rng>(rng: &mut R, spec: &LeafSpec) -> Option<Deal> {
    let mut piles = piles_from_shuffled(rng);
    let south = deal_matching(rng, &mut piles, &spec.south)?;
    let north = if let Some(ref npat) = spec.north {
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

pub fn auction_for(spec: &LeafSpec) -> Auction {
    Auction {
        dealer: spec.dealer,
        calls: spec.calls_before.clone(),
    }
}

fn verify(deal: &Deal, spec: &LeafSpec) -> bool {
    let auction = auction_for(spec);
    if auction.next_seat() != Seat::South {
        return false;
    }
    let d = decide(&deal.south, &auction);
    if d.leaf_id != spec.id || d.bid != spec.expected {
        return false;
    }

    match spec.dealer {
        Seat::North => {
            let open = opening(&deal.north);
            if spec.calls_before.first().copied() != Some(open.bid) {
                return false;
            }
        }
        Seat::South => {
            if spec.calls_before.is_empty() {
                return true;
            }
            let open = opening(&deal.south);
            if spec.calls_before.first().copied() != Some(open.bid) {
                return false;
            }
            if spec.calls_before.len() >= 3 {
                let resp = crate::system::respond(&deal.north, open.bid);
                if spec.calls_before.get(2).copied() != Some(resp.bid) {
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
    use crate::leaves::catalog;
    use rand::rngs::SmallRng;
    use rand::SeedableRng;

    #[test]
    fn every_leaf_generates() {
        let mut rng = SmallRng::seed_from_u64(20260828);
        let mut failures = Vec::new();
        for spec in catalog() {
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
}
