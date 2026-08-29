use rand::rngs::SmallRng;
use rand::SeedableRng;
use serde::Serialize;

use crate::auction::Auction;
use crate::bid::Call;
use crate::cards::{Card, Deal, Hand, Seat};
use crate::deal::{auction_for, generate_for_id};
use crate::leaves::{catalog, leaf_by_id, Family};
use crate::progress::{pick_from_ids, pick_leaf_id, weight_table, Progress};
use crate::system::{decide, HOUSE_RULES, SYSTEM_ID};

#[derive(Serialize)]
struct CatalogEntry {
    id: &'static str,
    family: &'static str,
    family_title: &'static str,
    title: &'static str,
    expected: String,
}

#[derive(Serialize)]
struct CatalogJson {
    system: &'static str,
    house_rules: &'static str,
    leaves: Vec<CatalogEntry>,
}

pub fn catalog_json() -> String {
    let leaves = catalog()
        .iter()
        .map(|l| CatalogEntry {
            id: l.id,
            family: l.family.slug(),
            family_title: l.family.title(),
            title: l.title,
            expected: l.expected.to_app(),
        })
        .collect();
    serde_json::to_string(&CatalogJson {
        system: SYSTEM_ID,
        house_rules: HOUSE_RULES,
        leaves,
    })
    .unwrap()
}

#[derive(Serialize)]
struct DrillJson {
    leaf_id: &'static str,
    family: &'static str,
    family_title: &'static str,
    title: &'static str,
    explanation: String,
    expected: String,
    dealer: String,
    auction: Vec<String>,
    student: &'static str,
    hands: HandsJson,
    south_hcp: u8,
    south_opening_points: u8,
    south_shape: String,
    attempts: u32,
}

#[derive(Serialize)]
struct HandsJson {
    #[serde(rename = "N")]
    n: Vec<String>,
    #[serde(rename = "E")]
    e: Vec<String>,
    #[serde(rename = "S")]
    s: Vec<String>,
    #[serde(rename = "W")]
    w: Vec<String>,
}

impl HandsJson {
    fn from_deal(deal: &Deal) -> Self {
        Self {
            n: deal.north.to_app_list(),
            e: deal.east.to_app_list(),
            s: deal.south.to_app_list(),
            w: deal.west.to_app_list(),
        }
    }
}

fn shape_str(hand: Hand) -> String {
    format!(
        "{}-{}-{}-{}",
        hand.len_of(crate::cards::Suit::Spade),
        hand.len_of(crate::cards::Suit::Heart),
        hand.len_of(crate::cards::Suit::Diamond),
        hand.len_of(crate::cards::Suit::Club),
    )
}

#[derive(Serialize)]
struct ErrorJson {
    error: String,
}

fn err(msg: impl Into<String>) -> String {
    serde_json::to_string(&ErrorJson { error: msg.into() }).unwrap()
}

pub fn next_drill_json(progress_json: &str, seed: u32, family: &str, leaves: &[String]) -> String {
    let progress = Progress::parse(progress_json);
    let mut rng = SmallRng::seed_from_u64(u64::from(seed) | 0x5C1D_0000_0000);
    let id = if !leaves.is_empty() {
        let refs: Vec<&str> = leaves.iter().map(String::as_str).collect();
        match pick_from_ids(&progress, &mut rng, &refs) {
            Some(id) => id,
            None => return err("no matching leaves"),
        }
    } else {
        let fam = match family.trim() {
            "" | "all" => None,
            other => match Family::parse(other) {
                Some(f) => Some(f),
                None if crate::leaves::leaf_by_id(other).is_some() => {
                    return drill_for_id(&progress, seed, other);
                }
                None => return err(format!("unknown family '{other}'")),
            },
        };
        match pick_leaf_id(&progress, &mut rng, fam) {
            Some(id) => id,
            None => return err("no leaves in that family"),
        }
    };
    drill_for_id(&progress, seed.wrapping_add(1), id)
}

fn drill_for_id(_progress: &Progress, seed: u32, id: &str) -> String {
    let mut rng = SmallRng::seed_from_u64(u64::from(seed) ^ 0xDEAD_0000_0000);
    match generate_for_id(&mut rng, id) {
        Ok((deal, attempts)) => {
            let spec = leaf_by_id(id).unwrap();
            let auction = auction_for(spec);
            let d = decide(&deal.south, &auction);
            let body = DrillJson {
                leaf_id: spec.id,
                family: spec.family.slug(),
                family_title: spec.family.title(),
                title: spec.title,
                explanation: d.explanation.to_string(),
                expected: spec.expected.to_app(),
                dealer: spec.dealer.letter().to_string(),
                auction: spec.calls_before.iter().map(|c| c.to_app()).collect(),
                student: "S",
                hands: HandsJson::from_deal(&deal),
                south_hcp: deal.south.hcp(),
                south_opening_points: deal.south.opening_points(),
                south_shape: shape_str(deal.south),
                attempts,
            };
            serde_json::to_string(&body).unwrap()
        }
        Err(e) => err(e.message),
    }
}

pub fn apply_result_json(progress_json: &str, leaf_id: &str, correct: bool) -> String {
    if leaf_by_id(leaf_id).is_none() {
        return err(format!("unknown leaf {leaf_id}"));
    }
    let mut p = Progress::parse(progress_json);
    p.system = SYSTEM_ID.to_string();
    p.version = 1;
    p.record(leaf_id, correct);
    p.to_json()
}

pub fn weights_json(progress_json: &str, family: &str) -> String {
    let progress = Progress::parse(progress_json);
    let fam = Family::parse(family);
    serde_json::to_string(&weight_table(&progress, fam)).unwrap()
}

pub fn decide_json(hand_cards: &str, auction_json: &str) -> String {
    #[derive(serde::Deserialize)]
    struct In {
        cards: Vec<String>,
        dealer: Option<String>,
        auction: Option<Vec<String>>,
    }
    let parsed: Result<In, _> = if hand_cards.trim().starts_with('{') {
        serde_json::from_str(hand_cards)
    } else {
        Ok(In {
            cards: hand_cards
                .split([',', ' '])
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect(),
            dealer: None,
            auction: serde_json::from_str(auction_json).ok(),
        })
    };
    let Ok(input) = parsed else {
        return err("bad decide input");
    };
    let cards: Result<Vec<Card>, _> = input
        .cards
        .iter()
        .map(|s| Card::parse_app(s).ok_or("bad card"))
        .collect();
    let Ok(cards) = cards else {
        return err("bad card code");
    };
    let Ok(hand) = Hand::try_from_slice(&cards) else {
        return err("need 13 cards");
    };
    let dealer = input
        .dealer
        .as_deref()
        .and_then(|s| Seat::from_letter(s.chars().next().unwrap_or('S')))
        .unwrap_or(Seat::South);
    let calls = input
        .auction
        .or_else(|| serde_json::from_str(auction_json).ok())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|s| Call::parse_app(&s))
        .collect();
    let auction = Auction { dealer, calls };
    let d = decide(&hand, &auction);
    serde_json::json!({
        "leaf_id": d.leaf_id,
        "bid": d.bid.to_app(),
        "title": d.title,
        "explanation": d.explanation,
        "hcp": hand.hcp(),
        "shape": shape_str(hand),
        "opening_points": hand.opening_points(),
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn catalog_is_valid_json_with_unique_ids() {
        let v: Value = serde_json::from_str(&catalog_json()).unwrap();
        assert_eq!(v["system"], SYSTEM_ID);
        let ids: Vec<&str> = v["leaves"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| l["id"].as_str().unwrap())
            .collect();
        let mut sorted = ids.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(ids.len(), sorted.len(), "duplicate leaf ids in catalog");
        assert!(ids.len() > 20);
    }

    #[test]
    fn apply_result_records_a_miss() {
        let next = apply_result_json("{}", "open.1s", false);
        let v: Value = serde_json::from_str(&next).unwrap();
        assert_eq!(v["leaves"]["open.1s"]["wrong"], 1);
        assert_eq!(v["leaves"]["open.1s"]["correct"], 0);
    }

    #[test]
    fn next_drill_can_restrict_to_a_leaf_list() {
        let body = next_drill_json("{}", 11, "all", &["open.pass".into()]);
        let v: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["leaf_id"], "open.pass");
        assert_eq!(v["expected"], "Pass");
        assert!(v["south_opening_points"].as_u64().is_some());
        let empty = next_drill_json("{}", 1, "all", &["no.such".into()]);
        let e: Value = serde_json::from_str(&empty).unwrap();
        assert!(e["error"].as_str().unwrap().contains("no matching"));
    }

    #[test]
    fn decide_json_game_values_over_diamond_is_3nt() {
        let body = serde_json::json!({
            "cards": ["SA","SJ","S2","HA","H8","H3","DA","D9","D8","D4","CA","C7","C6"],
            "dealer": "N",
            "auction": ["1D","Pass"]
        })
        .to_string();
        let v: Value = serde_json::from_str(&decide_json(&body, "[]")).unwrap();
        assert_eq!(v["bid"], "3NT");
        assert_eq!(v["leaf_id"], "resp.1d.3nt");
        assert_eq!(v["hcp"], 17);
    }
}
