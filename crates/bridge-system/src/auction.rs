use crate::bid::Call;
use crate::cards::Seat;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Auction {
    pub dealer: Seat,
    pub calls: Vec<Call>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Opening,
    RespondTo(Call),
    OpenerRebid { open: Call, response: Call },
    Unsupported,
}

impl Auction {
    pub fn empty(dealer: Seat) -> Self {
        Auction {
            dealer,
            calls: Vec::new(),
        }
    }

    pub fn next_seat(&self) -> Seat {
        let mut s = self.dealer;
        for _ in &self.calls {
            s = s.next();
        }
        s
    }

    pub fn call_by(&self, seat: Seat) -> Vec<Call> {
        let mut s = self.dealer;
        let mut out = Vec::new();
        for &c in &self.calls {
            if s == seat {
                out.push(c);
            }
            s = s.next();
        }
        out
    }

    fn non_pass_by(&self, seat: Seat) -> Vec<Call> {
        self.call_by(seat)
            .into_iter()
            .filter(|c| *c != Call::Pass)
            .collect()
    }

    /// The last chance to open: three passes in front of this seat.
    pub fn in_fourth_seat(&self) -> bool {
        self.calls.len() == 3 && self.calls.iter().all(|c| *c == Call::Pass)
    }

    /// Three passes after a bid, or four passes (passed out).
    pub fn ended(&self) -> bool {
        let n = self.calls.len();
        if n >= 4 && self.calls.iter().all(|c| *c == Call::Pass) {
            return true;
        }
        if n >= 4 {
            let last3 = &self.calls[n - 3..];
            if last3.iter().all(|c| *c == Call::Pass) {
                return self.calls[..n - 3].iter().any(|c| *c != Call::Pass);
            }
        }
        false
    }

    /// Teaching-tree phase for whoever is next, from that seat's point of view.
    pub fn phase_for(&self, seat: Seat) -> Phase {
        if self.ended() || self.next_seat() != seat {
            return Phase::Unsupported;
        }
        let ours = self.non_pass_by(seat);
        let partner = self.non_pass_by(seat.partner());
        match (ours.as_slice(), partner.as_slice()) {
            ([], []) => Phase::Opening,
            ([], [open]) => Phase::RespondTo(*open),
            ([open], [response]) => Phase::OpenerRebid {
                open: *open,
                response: *response,
            },
            _ => Phase::Unsupported,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bid::Call;
    use crate::cards::{Seat, Suit};

    fn bid(level: u8, suit: Suit) -> Call {
        Call::suit_bid(level, suit)
    }

    #[test]
    fn four_passes_is_ended() {
        let a = Auction {
            dealer: Seat::South,
            calls: vec![Call::Pass, Call::Pass, Call::Pass, Call::Pass],
        };
        assert!(a.ended());
    }

    #[test]
    fn three_passes_after_a_bid_ends() {
        let a = Auction {
            dealer: Seat::South,
            calls: vec![bid(1, Suit::Spade), Call::Pass, Call::Pass, Call::Pass],
        };
        assert!(a.ended());
        let short = Auction {
            dealer: Seat::South,
            calls: vec![bid(1, Suit::Spade), Call::Pass, Call::Pass],
        };
        assert!(!short.ended());
    }

    #[test]
    fn fourth_seat_is_three_passes_in_front() {
        let dealer = Seat::South;
        let three = Auction {
            dealer,
            calls: vec![Call::Pass, Call::Pass, Call::Pass],
        };
        assert!(three.in_fourth_seat());
        assert_eq!(three.next_seat(), Seat::East);

        let two = Auction {
            dealer,
            calls: vec![Call::Pass, Call::Pass],
        };
        assert!(!two.in_fourth_seat(), "third seat is not fourth");
        let bid_in_front = Auction {
            dealer,
            calls: vec![bid(1, Suit::Spade), Call::Pass, Call::Pass],
        };
        assert!(
            !bid_in_front.in_fourth_seat(),
            "somebody opened — not a pass-out decision"
        );
    }

    #[test]
    fn south_opening_and_rebid_phases() {
        let empty = Auction::empty(Seat::South);
        assert_eq!(empty.phase_for(Seat::South), Phase::Opening);

        let after_raise = Auction {
            dealer: Seat::South,
            calls: vec![
                bid(1, Suit::Spade),
                Call::Pass,
                bid(2, Suit::Spade),
                Call::Pass,
            ],
        };
        assert_eq!(
            after_raise.phase_for(Seat::South),
            Phase::OpenerRebid {
                open: bid(1, Suit::Spade),
                response: bid(2, Suit::Spade),
            }
        );
        assert_eq!(after_raise.phase_for(Seat::North), Phase::Unsupported);
    }

    #[test]
    fn north_responds_then_rebids() {
        let after_open = Auction {
            dealer: Seat::South,
            calls: vec![bid(1, Suit::Spade), Call::Pass],
        };
        assert_eq!(
            after_open.phase_for(Seat::North),
            Phase::RespondTo(bid(1, Suit::Spade))
        );

        let after_stayman = Auction {
            dealer: Seat::North,
            calls: vec![Call::nt(1), Call::Pass, bid(2, Suit::Club), Call::Pass],
        };
        assert_eq!(
            after_stayman.phase_for(Seat::North),
            Phase::OpenerRebid {
                open: Call::nt(1),
                response: bid(2, Suit::Club),
            }
        );
        assert_eq!(
            Auction {
                dealer: Seat::North,
                calls: vec![Call::nt(1), Call::Pass],
            }
            .phase_for(Seat::South),
            Phase::RespondTo(Call::nt(1))
        );
    }
}
