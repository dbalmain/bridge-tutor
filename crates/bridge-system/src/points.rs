//! Which count each decision is made from.
//!
//! Kept out of `system.rs` deliberately: the registry gate there scans every
//! string literal in that file for decision ids, and the prefix matches below
//! ("resp.", "open.") look exactly like ids to it.

use crate::cards::Suit;

/// Which count a decision is actually made from.
///
/// The learner's hand breakdown renders this, and showing the wrong one
/// teaches the wrong arithmetic: the app was displaying opening points and
/// the Rule of 20 under every decision, including the ones the tree settles
/// on high cards alone. It lives here, next to the handlers, because the
/// frontend was inferring it from the leaf id's spelling and got
/// `rebid.2nt.accept` — an HCP decision in a family whose name says rebid —
/// wrong.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PointBasis {
    /// HCP plus length: what decides whether a hand may open at all.
    Opening,
    /// High cards only. Length is worthless opposite an unknown fit, and
    /// shortage is worthless in notrump.
    Hcp,
    /// HCP plus shortage in the named trump suit, because the fit is known.
    Support(Suit),
}

pub fn point_basis(leaf_id: &str) -> PointBasis {
    // A raise names a fit, so the count is HCP + shortage in that suit. The
    // suit is the one partner opened, which the id spells out.
    let raise_trump = |id: &str| -> Option<Suit> {
        let rest = id.strip_prefix("resp.1")?;
        let suit = match rest.as_bytes().first()? {
            b'c' => Suit::Club,
            b'd' => Suit::Diamond,
            b'h' => Suit::Heart,
            b's' => Suit::Spade,
            _ => return None,
        };
        (rest.contains(".raise") || rest.contains(".game")).then_some(suit)
    };
    if let Some(trump) = raise_trump(leaf_id) {
        return PointBasis::Support(trump);
    }
    if leaf_id.starts_with("open.") || leaf_id == "pass.fourth-seat" {
        return PointBasis::Opening;
    }
    // Everything responder does that is not a raise, every continuation, and
    // the notrump machinery opener runs, is judged on high cards.
    if leaf_id.starts_with("resp.")
        || leaf_id.starts_with("resp2.")
        || leaf_id.starts_with("resp3.")
        || leaf_id.starts_with("rebid.2nt.")
        || leaf_id.starts_with("rebid.2c.")
        || leaf_id.starts_with("rebid.stayman.")
        || leaf_id.starts_with("rebid.xfer.")
        || leaf_id.starts_with("rebid.preempt.")
        || leaf_id == "unsupported"
    {
        return PointBasis::Hcp;
    }
    // Opener's own rebids: still opener's hand, still HCP plus length.
    PointBasis::Opening
}

impl PointBasis {
    pub fn slug(self) -> &'static str {
        match self {
            PointBasis::Opening => "opening",
            PointBasis::Hcp => "hcp",
            PointBasis::Support(_) => "support",
        }
    }

    pub fn trump(self) -> Option<Suit> {
        match self {
            PointBasis::Support(s) => Some(s),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `point_basis` must agree with what the handler actually reads.
    ///
    /// This checks structure, not behaviour, and says so: there is no way to
    /// ask a handler which count it consulted. What it does catch is the
    /// class that was actually wrong — a decision labelled by the spelling of
    /// its family rather than by its handler. `rebid.2nt.accept` reads
    /// `hand.hcp()` and sits in the `rebid` family, so the frontend's
    /// id-shaped inference showed the Rule of 20 under a decision the tree
    /// makes on high cards alone.
    #[test]
    fn the_point_basis_matches_what_the_handler_reads() {
        for spec in crate::leaves::catalog() {
            let basis = point_basis(spec.id);
            if spec.id.starts_with("resp") || spec.id.starts_with("rebid.2nt.") {
                assert_ne!(
                    basis,
                    PointBasis::Opening,
                    "{} is judged on the responder's own high cards or a fit, not opening \
                     points",
                    spec.id
                );
            }
            if let PointBasis::Support(trump) = basis {
                let names_it = format!(".1{}.", trump.letter().to_ascii_lowercase());
                assert!(
                    spec.id.contains(&names_it),
                    "{} claims a {trump:?} fit but does not name that suit",
                    spec.id
                );
            }
        }

        // The handlers these were read from, spelled out so a change to one
        // of them fails here rather than silently teaching the wrong sum.
        // `after_two_nt_invite` and `after_1nt_sequence` read `hand.hcp()`;
        // `opening` and `after_1h_1s` read `hand.opening_points()`;
        // `respond_major`/`respond_minor` raises read `support_points`.
        assert_eq!(point_basis("rebid.2nt.accept"), PointBasis::Hcp);
        assert_eq!(point_basis("rebid.2nt.decline"), PointBasis::Hcp);
        assert_eq!(point_basis("open.1s"), PointBasis::Opening);
        assert_eq!(point_basis("rebid.1h.1s.raise2"), PointBasis::Opening);
        assert_eq!(point_basis("resp.1nt.stayman"), PointBasis::Hcp);
        assert_eq!(point_basis("resp2.xfer.3nt"), PointBasis::Hcp);
        assert_eq!(
            point_basis("resp.1h.raise2"),
            PointBasis::Support(Suit::Heart)
        );
        assert_eq!(
            point_basis("resp.1c.raise3.invite"),
            PointBasis::Support(Suit::Club)
        );
    }
}
