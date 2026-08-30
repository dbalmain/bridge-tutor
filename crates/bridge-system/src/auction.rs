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
    OpenerRebid {
        open: Call,
        response: Call,
    },
    /// Responder's second call. Without this the auction stopped dead after
    /// opener's rebid: a completed transfer sat in 2♥ holding game values,
    /// and a game-forcing 2♣ auction died in 2NT.
    ResponderRebid {
        open: Call,
        response: Call,
        rebid: Call,
    },
    /// Opener answering responder's second call — almost always accepting or
    /// declining an invitation. Adding ResponderRebid alone just moved the
    /// truncation one call deeper: 1NT–2♦–2♥–3♥ was passed out.
    ///
    /// The whole sequence is carried, not just the last two calls. What
    /// "accept" means depends entirely on what our opening promised: a 15-HCP
    /// 1NT is the bottom of its range, while 15 after a minimum suit rebid is
    /// the top of that one. Reducing this to two calls forced a single
    /// threshold onto both and got one of them wrong every time.
    AnswerInvitation {
        open: Call,
        response: Call,
        rebid: Call,
        answer: Call,
    },
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
        // This course has no competitive bidding: once the opponents have
        // opened, our side stays out. Without this the phase was decided from
        // our own calls alone, so a seat could be told it was "opening" after
        // an opponent had already bid. `uncontested_script` enforced it
        // separately; the public decide API did not.
        let opponents_opened = !self.non_pass_by(seat.next()).is_empty()
            || !self.non_pass_by(seat.next().next().next()).is_empty();
        if ours.is_empty() && partner.is_empty() && opponents_opened {
            return Phase::Unsupported;
        }
        match (ours.as_slice(), partner.as_slice()) {
            ([], []) => Phase::Opening,
            ([], [open]) => Phase::RespondTo(*open),
            ([open], [response]) => Phase::OpenerRebid {
                open: *open,
                response: *response,
            },
            ([response], [open, rebid]) => Phase::ResponderRebid {
                open: *open,
                response: *response,
                rebid: *rebid,
            },
            ([open, rebid], [response, answer]) => Phase::AnswerInvitation {
                open: *open,
                response: *response,
                rebid: *rebid,
                answer: *answer,
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

    /// The auction has four phases, not three. Responder gets a second call
    /// after opener's rebid, and it is where most contracts are actually
    /// chosen.
    /// Our side does not bid after the opponents open, and the phase must say
    /// so rather than leaving it to one consumer to enforce.
    #[test]
    fn an_opponents_opening_takes_our_side_out_of_the_auction() {
        let west_opened = Auction {
            dealer: Seat::West,
            calls: vec![bid(1, Suit::Spade)],
        };
        assert_eq!(west_opened.next_seat(), Seat::North);
        assert_eq!(west_opened.phase_for(Seat::North), Phase::Unsupported);

        // Our own side opening is untouched.
        let we_opened = Auction {
            dealer: Seat::North,
            calls: vec![bid(1, Suit::Spade), Call::Pass],
        };
        assert_eq!(
            we_opened.phase_for(Seat::South),
            Phase::RespondTo(bid(1, Suit::Spade))
        );
    }

    #[test]
    fn responder_gets_a_second_call() {
        let after_transfer = Auction {
            dealer: Seat::North,
            calls: vec![
                Call::nt(1),
                Call::Pass,
                bid(2, Suit::Diamond),
                Call::Pass,
                bid(2, Suit::Heart),
                Call::Pass,
            ],
        };
        assert_eq!(after_transfer.next_seat(), Seat::South);
        assert_eq!(
            after_transfer.phase_for(Seat::South),
            Phase::ResponderRebid {
                open: Call::nt(1),
                response: bid(2, Suit::Diamond),
                rebid: bid(2, Suit::Heart),
            }
        );

        // One call earlier it is opener's turn, not responder's.
        assert_eq!(
            Auction {
                dealer: Seat::North,
                calls: vec![Call::nt(1), Call::Pass, bid(2, Suit::Diamond), Call::Pass],
            }
            .phase_for(Seat::North),
            Phase::OpenerRebid {
                open: Call::nt(1),
                response: bid(2, Suit::Diamond),
            }
        );
    }

    /// Opener answering an invitation needs the whole sequence, not the last
    /// two calls: what "accept" means depends on what the opening promised,
    /// and 1NT–2♦–2♥–3♥ reduced to (2♥, 3♥) cannot tell a 1NT from a suit
    /// rebid.
    #[test]
    fn answering_an_invitation_carries_the_whole_sequence() {
        let after = Auction {
            dealer: Seat::North,
            calls: vec![
                Call::nt(1),
                Call::Pass,
                bid(2, Suit::Diamond),
                Call::Pass,
                bid(2, Suit::Heart),
                Call::Pass,
                bid(3, Suit::Heart),
                Call::Pass,
            ],
        };
        assert_eq!(after.next_seat(), Seat::North);
        assert_eq!(
            after.phase_for(Seat::North),
            Phase::AnswerInvitation {
                open: Call::nt(1),
                response: bid(2, Suit::Diamond),
                rebid: bid(2, Suit::Heart),
                answer: bid(3, Suit::Heart),
            }
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
