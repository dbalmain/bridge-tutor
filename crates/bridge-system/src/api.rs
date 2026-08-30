use rand::rngs::SmallRng;
use rand::SeedableRng;
use serde::Serialize;

use crate::auction::Auction;
use crate::bid::Call;
use crate::cards::{Card, Deal, Hand, Seat};
use crate::deal::{auction_for, generate_for_id, uncontested_script, ScriptCall};
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
    /// Prefix before the target leaf (historical). The live UI plays [`script`].
    auction: Vec<String>,
    script: Vec<ScriptJson>,
    student: &'static str,
    hands: HandsJson,
    south_hcp: u8,
    south_opening_points: u8,
    south_shape: String,
    attempts: u32,
}

#[derive(Serialize)]
struct ScriptJson {
    seat: String,
    bid: String,
    leaf_id: &'static str,
    title: &'static str,
    explanation: &'static str,
    student: bool,
}

fn script_json(step: &ScriptCall) -> ScriptJson {
    ScriptJson {
        seat: step.seat.letter().to_string(),
        bid: step.bid.to_app(),
        leaf_id: step.leaf_id,
        title: step.title,
        explanation: step.explanation,
        student: step.student,
    }
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
            let script = uncontested_script(&deal, spec.dealer)
                .iter()
                .map(script_json)
                .collect();
            let body = DrillJson {
                leaf_id: spec.id,
                family: spec.family.slug(),
                family_title: spec.family.title(),
                title: spec.title,
                explanation: d.explanation.to_string(),
                expected: spec.expected.to_app(),
                dealer: spec.dealer.letter().to_string(),
                auction: spec.calls_before.iter().map(|c| c.to_app()).collect(),
                script,
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
        let script = v["script"].as_array().expect("script");
        assert_eq!(script[0]["seat"], "S");
        assert_eq!(script[0]["bid"], "Pass");
        assert_eq!(script[0]["student"], true);
        let empty = next_drill_json("{}", 1, "all", &["no.such".into()]);
        let e: Value = serde_json::from_str(&empty).unwrap();
        assert!(e["error"].as_str().unwrap().contains("no matching"));
    }

    #[test]
    fn rebid_drill_script_starts_with_the_opening() {
        let body = next_drill_json("{}", 21, "all", &["rebid.1s.raise.pass".into()]);
        let v: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["leaf_id"], "rebid.1s.raise.pass");
        let script = v["script"].as_array().unwrap();
        assert_eq!(script[0]["seat"], "S");
        assert_eq!(script[0]["bid"], "1S");
        assert_eq!(script[0]["student"], true);
        let south: Vec<&Value> = script.iter().filter(|s| s["seat"] == "S").collect();
        assert!(south.len() >= 2, "opener should rebid");
        assert_eq!(south[1]["leaf_id"], "rebid.1s.raise.pass");
        assert_eq!(south[1]["student"], true);
    }

    #[test]
    fn bidding_curriculum_leaf_ids_exist() {
        let raw = include_str!("../../../src/data/bidding-curriculum.json");
        let v: Value = serde_json::from_str(raw).unwrap();
        let lessons = v["lessons"].as_array().expect("lessons");
        assert!(lessons.len() >= 10, "course is too thin");
        let mut missing = Vec::new();
        for lesson in lessons {
            for id in lesson["leaves"].as_array().unwrap() {
                let id = id.as_str().unwrap();
                if leaf_by_id(id).is_none() {
                    missing.push(id.to_string());
                }
            }
        }
        assert!(missing.is_empty(), "unknown curriculum leaves: {missing:?}");
    }

    /// Product copy that names the size of the course goes stale silently.
    /// The README is prose, so this checks the numbers it commits to.
    #[test]
    fn the_readme_states_the_real_course_size() {
        let raw = include_str!("../../../src/data/bidding-curriculum.json");
        let v: Value = serde_json::from_str(raw).unwrap();
        let lessons = v["lessons"].as_array().unwrap().len();
        let chapters = v["chapters"].as_array().unwrap().len();
        let words = [
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
            "twenty",
            "twenty-one",
            "twenty-two",
            "twenty-three",
            "twenty-four",
            "twenty-five",
        ];
        // Collapse whitespace: prose gets rewrapped, and "nine\n  chapters"
        // must still count as saying nine chapters.
        let readme = include_str!("../../../README.md")
            .to_lowercase()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        assert!(
            readme.contains(&format!("{} chapters", words[chapters])),
            "README does not say the course has {chapters} chapters"
        );
        assert!(
            readme.contains(&format!("{} lessons", words[lessons])),
            "README does not say the course has {lessons} lessons"
        );

        // The headline count and the chapter table drifted apart once already:
        // the headline was updated and the table was not.
        for ch in v["chapters"].as_array().unwrap() {
            let row = format!(
                "| {} | {} |",
                ch["number"].as_u64().unwrap(),
                ch["title"].as_str().unwrap().to_lowercase()
            );
            assert!(
                readme.contains(&row),
                "README's learning-path table is missing the row {row:?}"
            );
        }
    }

    /// Every leaf the drills can deal is taught by some lesson, and no lesson
    /// claims a leaf twice. Without this, adding a branch to the tree silently
    /// creates a drill for a rule the course never explains.
    #[test]
    fn every_catalogue_leaf_is_taught_by_a_lesson() {
        let raw = include_str!("../../../src/data/bidding-curriculum.json");
        let v: Value = serde_json::from_str(raw).unwrap();

        let mut taught: std::collections::HashMap<&str, Vec<u64>> = Default::default();
        for l in v["lessons"].as_array().unwrap() {
            let n = l["lessonNumber"].as_u64().unwrap();
            for id in l["leaves"].as_array().unwrap() {
                taught.entry(id.as_str().unwrap()).or_default().push(n);
            }
        }

        let untaught: Vec<&str> = catalog()
            .iter()
            .map(|l| l.id)
            .filter(|id| !taught.contains_key(id))
            .collect();
        assert!(
            untaught.is_empty(),
            "leaves the drills can deal but no lesson teaches: {untaught:?}"
        );

        let duplicated: Vec<String> = taught
            .iter()
            .filter(|(_, ls)| ls.len() > 1)
            .map(|(id, ls)| format!("{id} in lessons {ls:?}"))
            .collect();
        assert!(duplicated.is_empty(), "leaves taught twice: {duplicated:?}");
    }

    /// The course promises: every lesson names what it adds, links back to
    /// the lessons its rules came from, and never points at a lesson that
    /// does not exist. Backward links are structural (`revisits`); a forward
    /// mention in prose is allowed only when it states the rule too, so all
    /// this can check is that the number resolves.
    #[test]
    fn bidding_curriculum_lesson_links_resolve_and_revisits_go_backwards() {
        let raw = include_str!("../../../src/data/bidding-curriculum.json");
        let v: Value = serde_json::from_str(raw).unwrap();
        let lessons = v["lessons"].as_array().expect("lessons");

        let mut order = std::collections::HashMap::new();
        let mut numbers = std::collections::HashSet::new();
        for l in lessons {
            let id = l["id"].as_str().unwrap();
            let ch = l["chapterNumber"].as_u64().unwrap();
            let n = l["lessonNumber"].as_u64().unwrap();
            order.insert(id, (ch, n));
            numbers.insert(n);
        }

        let mut problems = Vec::new();
        for l in lessons {
            let id = l["id"].as_str().unwrap();
            let here = order[id];

            match l["newHere"].as_str() {
                Some(s) if !s.trim().is_empty() => {}
                _ => problems.push(format!("{id}: no newHere — what does it add?")),
            }

            let revisits = l["revisits"].as_array();
            match revisits {
                None => problems.push(format!("{id}: no revisits list")),
                Some(rs) => {
                    if rs.is_empty() && here != (1, 1) {
                        problems.push(format!(
                            "{id}: revisits is empty but it is not the first lesson"
                        ));
                    }
                    for r in rs {
                        let target = r["lessonId"].as_str().unwrap_or("");
                        match order.get(target) {
                            None => {
                                problems.push(format!("{id}: revisits unknown lesson {target}"))
                            }
                            Some(&there) => {
                                if there >= here {
                                    problems.push(format!(
                                        "{id}: revisits {target}, which is not earlier"
                                    ));
                                }
                                if r["lessonNumber"].as_u64() != Some(there.1) {
                                    problems.push(format!(
                                        "{id}: revisits {target} with a stale lessonNumber"
                                    ));
                                }
                            }
                        }
                        if r["what"].as_str().unwrap_or("").trim().is_empty() {
                            problems.push(format!("{id}: revisits {target} without saying what"));
                        }
                    }
                }
            }

            // Every "Lesson N" / "Lessons N and M" in the prose must exist.
            let prose: Vec<&str> = ["tip", "newHere"]
                .iter()
                .filter_map(|k| l[*k].as_str())
                .chain(
                    ["teaching", "rules"]
                        .iter()
                        .flat_map(|k| l[*k].as_array().into_iter().flatten())
                        .filter_map(|x| x.as_str()),
                )
                .collect();
            for text in prose {
                for cited in cited_lesson_numbers(text) {
                    if !numbers.contains(&cited) {
                        problems.push(format!("{id}: cites Lesson {cited}, which does not exist"));
                    }
                }
            }
        }
        assert!(
            problems.is_empty(),
            "curriculum links:\n{}",
            problems.join("\n")
        );
    }

    /// Lesson numbers named in prose: "Lesson 4", "Lessons 2 and 3".
    fn cited_lesson_numbers(text: &str) -> Vec<u64> {
        let mut out = Vec::new();
        let mut rest = text;
        while let Some(at) = rest.find("Lesson") {
            rest = &rest[at + "Lesson".len()..];
            let plural = rest.starts_with('s');
            if plural {
                rest = &rest[1..];
            }
            let mut tail = rest;
            loop {
                let digits: String = tail
                    .trim_start()
                    .chars()
                    .take_while(char::is_ascii_digit)
                    .collect();
                if digits.is_empty() {
                    break;
                }
                out.push(digits.parse().unwrap());
                let consumed = tail.len() - tail.trim_start().len() + digits.len();
                tail = &tail[consumed..];
                // "Lessons 2 and 3" — keep reading the conjunction.
                if let Some(after) = tail.strip_prefix(" and") {
                    tail = after;
                } else {
                    break;
                }
            }
            rest = tail;
        }
        out
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
