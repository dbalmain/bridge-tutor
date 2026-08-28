use std::collections::BTreeMap;

use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::leaves::{catalog, leaf_by_id, leaves_in_family, Family};
use crate::system::SYSTEM_ID;

const UNIFORM_MIX: f64 = 0.15;
const FLOOR: f64 = 0.08;
const UNSEEN_WEIGHT: f64 = 1.0;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct LeafStats {
    #[serde(default)]
    pub seen: u32,
    #[serde(default)]
    pub correct: u32,
    #[serde(default)]
    pub wrong: u32,
    #[serde(default)]
    pub streak: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Progress {
    pub version: u32,
    pub system: String,
    #[serde(default)]
    pub leaves: BTreeMap<String, LeafStats>,
}

impl Default for Progress {
    fn default() -> Self {
        Self {
            version: 1,
            system: SYSTEM_ID.to_string(),
            leaves: BTreeMap::new(),
        }
    }
}

impl Progress {
    pub fn parse(s: &str) -> Self {
        if s.trim().is_empty() {
            return Self::default();
        }
        serde_json::from_str(s).unwrap_or_default()
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_else(|_| "{}".into())
    }

    pub fn stats(&self, id: &str) -> LeafStats {
        self.leaves.get(id).cloned().unwrap_or_default()
    }

    pub fn record(&mut self, id: &str, correct: bool) {
        let e = self.leaves.entry(id.to_string()).or_default();
        e.seen += 1;
        if correct {
            e.correct += 1;
            e.streak = if e.streak > 0 { e.streak + 1 } else { 1 };
        } else {
            e.wrong += 1;
            e.streak = if e.streak < 0 { e.streak - 1 } else { -1 };
        }
    }
}

/// Inverse-mastery weight. Unseen leaves are treated as weak-but-not-the-weakest
/// so a new course explores first; misses then dominate.
pub fn sampling_weight(stats: &LeafStats) -> f64 {
    if stats.seen == 0 {
        return UNSEEN_WEIGHT;
    }
    let seen = f64::from(stats.seen);
    let accuracy = f64::from(stats.correct) / seen;
    let weakness = (1.0 - accuracy).powi(2) * 2.0;
    let recency = (f64::from(stats.wrong) + 0.5) / (seen + 1.0);
    FLOOR + weakness + recency
}

pub fn pick_leaf_id<R: Rng>(
    progress: &Progress,
    rng: &mut R,
    family: Option<Family>,
) -> Option<&'static str> {
    let leaves = leaves_in_family(family);
    if leaves.is_empty() {
        return None;
    }
    let n = leaves.len() as f64;
    let weakness: Vec<f64> = leaves
        .iter()
        .map(|l| sampling_weight(&progress.stats(l.id)))
        .collect();
    let wsum: f64 = weakness.iter().sum::<f64>().max(1e-9);
    let mixed: Vec<f64> = weakness
        .iter()
        .map(|w| UNIFORM_MIX * (1.0 / n) + (1.0 - UNIFORM_MIX) * (w / wsum))
        .collect();
    let total: f64 = mixed.iter().sum();
    let mut r = rng.gen::<f64>() * total;
    for (leaf, w) in leaves.iter().zip(mixed) {
        if r < w {
            return Some(leaf.id);
        }
        r -= w;
    }
    leaves.last().map(|l| l.id)
}

#[derive(Serialize)]
pub struct LeafWeightRow {
    pub id: &'static str,
    pub family: &'static str,
    pub title: &'static str,
    pub seen: u32,
    pub correct: u32,
    pub wrong: u32,
    pub streak: i32,
    pub weight: f64,
}

pub fn weight_table(progress: &Progress, family: Option<Family>) -> Vec<LeafWeightRow> {
    let leaves = leaves_in_family(family);
    let n = leaves.len().max(1) as f64;
    let weakness: Vec<f64> = leaves
        .iter()
        .map(|l| sampling_weight(&progress.stats(l.id)))
        .collect();
    let wsum: f64 = weakness.iter().sum::<f64>().max(1e-9);
    leaves
        .iter()
        .zip(weakness)
        .map(|(leaf, w)| {
            let mixed = UNIFORM_MIX * (1.0 / n) + (1.0 - UNIFORM_MIX) * (w / wsum);
            let st = progress.stats(leaf.id);
            LeafWeightRow {
                id: leaf.id,
                family: leaf.family.slug(),
                title: leaf.title,
                seen: st.seen,
                correct: st.correct,
                wrong: st.wrong,
                streak: st.streak,
                weight: mixed,
            }
        })
        .collect()
}

pub fn known_leaf(id: &str) -> bool {
    leaf_by_id(id).is_some() || catalog().iter().any(|l| l.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::SmallRng;
    use rand::SeedableRng;

    #[test]
    fn weak_leaf_dominates() {
        let mut p = Progress::default();
        p.record("open.1s", true);
        p.record("open.1s", true);
        p.record("open.1nt", false);
        p.record("open.1nt", false);
        p.record("open.1nt", false);
        let w_s = sampling_weight(&p.stats("open.1s"));
        let w_n = sampling_weight(&p.stats("open.1nt"));
        assert!(w_n > w_s * 2.0, "1nt {w_n} vs 1s {w_s}");
    }

    #[test]
    fn pick_never_empty() {
        let p = Progress::default();
        let mut rng = SmallRng::seed_from_u64(1);
        assert!(pick_leaf_id(&p, &mut rng, None).is_some());
    }
}
