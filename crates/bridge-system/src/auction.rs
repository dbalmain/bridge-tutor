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

    /// South is always the student and is next to call in a drill.
    pub fn phase_for_south(&self) -> Phase {
        if self.next_seat() != Seat::South {
            return Phase::Unsupported;
        }
        match (self.dealer, self.calls.as_slice()) {
            (Seat::South, []) => Phase::Opening,
            (Seat::North, [open, Call::Pass]) => Phase::RespondTo(*open),
            (Seat::South, [open, Call::Pass, response, Call::Pass]) => Phase::OpenerRebid {
                open: *open,
                response: *response,
            },
            _ => Phase::Unsupported,
        }
    }
}
