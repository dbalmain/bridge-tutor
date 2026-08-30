use crate::cards::Suit;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Strain {
    Clubs,
    Diamonds,
    Hearts,
    Spades,
    NoTrump,
}

impl Strain {
    pub fn from_suit(s: Suit) -> Self {
        match s {
            Suit::Club => Self::Clubs,
            Suit::Diamond => Self::Diamonds,
            Suit::Heart => Self::Hearts,
            Suit::Spade => Self::Spades,
        }
    }

    pub fn suit(self) -> Option<Suit> {
        match self {
            Self::Clubs => Some(Suit::Club),
            Self::Diamonds => Some(Suit::Diamond),
            Self::Hearts => Some(Suit::Heart),
            Self::Spades => Some(Suit::Spade),
            Self::NoTrump => None,
        }
    }

    pub fn letter(self) -> &'static str {
        match self {
            Self::Clubs => "C",
            Self::Diamonds => "D",
            Self::Hearts => "H",
            Self::Spades => "S",
            Self::NoTrump => "NT",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Call {
    Pass,
    Double,
    Redouble,
    Bid { level: u8, strain: Strain },
}

impl Call {
    pub const fn suit_bid(level: u8, suit: Suit) -> Self {
        Call::Bid {
            level,
            strain: match suit {
                Suit::Club => Strain::Clubs,
                Suit::Diamond => Strain::Diamonds,
                Suit::Heart => Strain::Hearts,
                Suit::Spade => Strain::Spades,
            },
        }
    }

    pub const fn nt(level: u8) -> Self {
        Call::Bid {
            level,
            strain: Strain::NoTrump,
        }
    }

    /// Auction rank: level, then strain. `None` for Pass/X/XX, which do not
    /// take part in the ordering.
    pub fn rank(self) -> Option<(u8, u8)> {
        match self {
            Call::Bid { level, strain } => Some((
                level,
                match strain {
                    Strain::Clubs => 0,
                    Strain::Diamonds => 1,
                    Strain::Hearts => 2,
                    Strain::Spades => 3,
                    Strain::NoTrump => 4,
                },
            )),
            _ => None,
        }
    }

    /// The cheapest legal bid in `strain` above `self`.
    pub fn cheapest_above(self, strain: Strain) -> Call {
        let (level, rank) = self.rank().unwrap_or((0, 0));
        let want = Call::Bid { level: 1, strain }.rank().expect("a bid").1;
        Call::Bid {
            level: if want > rank { level.max(1) } else { level + 1 },
            strain,
        }
    }

    pub fn to_app(self) -> String {
        match self {
            Call::Pass => "Pass".to_string(),
            Call::Double => "X".to_string(),
            Call::Redouble => "XX".to_string(),
            Call::Bid { level, strain } => format!("{level}{}", strain.letter()),
        }
    }

    pub fn parse_app(s: &str) -> Option<Self> {
        match s {
            "Pass" | "P" | "pass" => Some(Call::Pass),
            "X" | "x" | "Dbl" | "Double" => Some(Call::Double),
            "XX" | "xx" | "Rdbl" | "Redouble" => Some(Call::Redouble),
            _ => {
                let b = s.as_bytes();
                if b.is_empty() {
                    return None;
                }
                let level = (b[0] as char).to_digit(10)? as u8;
                if !(1..=7).contains(&level) {
                    return None;
                }
                let rest = &s[1..];
                let strain = match rest {
                    "C" => Strain::Clubs,
                    "D" => Strain::Diamonds,
                    "H" => Strain::Hearts,
                    "S" => Strain::Spades,
                    "NT" => Strain::NoTrump,
                    _ => return None,
                };
                Some(Call::Bid { level, strain })
            }
        }
    }

    pub fn is_one_of_a_suit(self) -> bool {
        matches!(
            self,
            Call::Bid {
                level: 1,
                strain: Strain::Clubs | Strain::Diamonds | Strain::Hearts | Strain::Spades
            }
        )
    }

    pub fn is_major_one(self) -> bool {
        matches!(
            self,
            Call::Bid {
                level: 1,
                strain: Strain::Hearts | Strain::Spades
            }
        )
    }
}

impl Serialize for Call {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_app())
    }
}

impl<'de> Deserialize<'de> for Call {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Call::parse_app(&s).ok_or_else(|| serde::de::Error::custom(format!("bad call {s}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_bids() {
        assert_eq!(Call::parse_app("1NT"), Some(Call::nt(1)));
        assert_eq!(Call::parse_app("2S"), Some(Call::suit_bid(2, Suit::Spade)));
        assert_eq!(Call::parse_app("Pass"), Some(Call::Pass));
        assert_eq!(Call::parse_app("1NT").unwrap().to_app(), "1NT");
    }
}
