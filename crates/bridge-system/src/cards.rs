//! Cards, hands, and the evaluation numbers the system uses.

use rand::seq::SliceRandom;
use rand::Rng;

pub const HCP_ACE: u8 = 4;
pub const HCP_KING: u8 = 3;
pub const HCP_QUEEN: u8 = 2;
pub const HCP_JACK: u8 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[repr(u8)]
pub enum Suit {
    Club = 0,
    Diamond = 1,
    Heart = 2,
    Spade = 3,
}

impl Suit {
    pub const ALL: [Suit; 4] = [Self::Club, Self::Diamond, Self::Heart, Self::Spade];

    pub fn idx(self) -> usize {
        self as usize
    }

    pub fn from_idx(i: usize) -> Option<Self> {
        match i {
            0 => Some(Self::Club),
            1 => Some(Self::Diamond),
            2 => Some(Self::Heart),
            3 => Some(Self::Spade),
            _ => None,
        }
    }

    pub fn letter(self) -> char {
        match self {
            Self::Club => 'C',
            Self::Diamond => 'D',
            Self::Heart => 'H',
            Self::Spade => 'S',
        }
    }

    pub fn from_letter(c: char) -> Option<Self> {
        match c.to_ascii_uppercase() {
            'C' => Some(Self::Club),
            'D' => Some(Self::Diamond),
            'H' => Some(Self::Heart),
            'S' => Some(Self::Spade),
            _ => None,
        }
    }

    pub fn symbol(self) -> char {
        match self {
            Self::Club => '♣',
            Self::Diamond => '♦',
            Self::Heart => '♥',
            Self::Spade => '♠',
        }
    }

    pub fn is_major(self) -> bool {
        matches!(self, Self::Heart | Self::Spade)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Rank(u8);

impl Rank {
    pub const TWO: Rank = Rank(0);
    pub const ACE: Rank = Rank(12);

    pub fn from_u8(v: u8) -> Option<Self> {
        (v <= 12).then_some(Rank(v))
    }

    pub fn value(self) -> u8 {
        self.0
    }

    pub fn letter(self) -> char {
        b"23456789TJQKA"[self.0 as usize] as char
    }

    pub fn from_letter(c: char) -> Option<Self> {
        let u = c.to_ascii_uppercase();
        b"23456789TJQKA"
            .iter()
            .position(|&x| x == u as u8)
            .map(|i| Rank(i as u8))
    }

    pub fn hcp(self) -> u8 {
        match self.0 {
            12 => HCP_ACE,
            11 => HCP_KING,
            10 => HCP_QUEEN,
            9 => HCP_JACK,
            _ => 0,
        }
    }
}

/// Packed 0..51: `suit * 13 + rank` (rank 0 = two, 12 = ace).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Card(u8);

impl Card {
    pub fn new(suit: Suit, rank: Rank) -> Self {
        Card(suit as u8 * 13 + rank.0)
    }

    pub fn from_id(id: u8) -> Option<Self> {
        (id < 52).then_some(Card(id))
    }

    pub fn id(self) -> u8 {
        self.0
    }

    pub fn suit(self) -> Suit {
        Suit::from_idx((self.0 / 13) as usize).expect("id < 52")
    }

    pub fn rank(self) -> Rank {
        Rank(self.0 % 13)
    }

    pub fn hcp(self) -> u8 {
        self.rank().hcp()
    }

    /// App encoding: `"SA"`, `"HT"`, `"C2"`.
    pub fn to_app(self) -> String {
        format!("{}{}", self.suit().letter(), self.rank().letter())
    }

    pub fn parse_app(s: &str) -> Option<Self> {
        let b = s.as_bytes();
        if b.len() != 2 {
            return None;
        }
        let suit = Suit::from_letter(b[0] as char)?;
        let rank = Rank::from_letter(b[1] as char)?;
        Some(Self::new(suit, rank))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Seat {
    North,
    East,
    South,
    West,
}

impl Seat {
    pub const ALL: [Seat; 4] = [Self::North, Self::East, Self::South, Self::West];

    pub fn letter(self) -> char {
        match self {
            Self::North => 'N',
            Self::East => 'E',
            Self::South => 'S',
            Self::West => 'W',
        }
    }

    pub fn from_letter(c: char) -> Option<Self> {
        match c.to_ascii_uppercase() {
            'N' => Some(Self::North),
            'E' => Some(Self::East),
            'S' => Some(Self::South),
            'W' => Some(Self::West),
            _ => None,
        }
    }

    pub fn next(self) -> Self {
        match self {
            Self::North => Self::East,
            Self::East => Self::South,
            Self::South => Self::West,
            Self::West => Self::North,
        }
    }

    pub fn partner(self) -> Self {
        self.next().next()
    }

    pub fn idx(self) -> usize {
        match self {
            Self::North => 0,
            Self::East => 1,
            Self::South => 2,
            Self::West => 3,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hand {
    cards: [Card; 13],
}

impl Hand {
    pub fn from_cards(mut cards: [Card; 13]) -> Result<Self, &'static str> {
        cards.sort();
        for i in 1..13 {
            if cards[i] == cards[i - 1] {
                return Err("duplicate card in hand");
            }
        }
        Ok(Hand { cards })
    }

    pub fn try_from_slice(cards: &[Card]) -> Result<Self, &'static str> {
        if cards.len() != 13 {
            return Err("hand must have 13 cards");
        }
        let mut arr = [Card(0); 13];
        arr.copy_from_slice(cards);
        Self::from_cards(arr)
    }

    pub fn parse_app_list(list: &[String]) -> Result<Self, &'static str> {
        let mut cards = Vec::with_capacity(13);
        for s in list {
            cards.push(Card::parse_app(s).ok_or("bad card")?);
        }
        Self::try_from_slice(&cards)
    }

    pub fn cards(self) -> [Card; 13] {
        self.cards
    }

    pub fn to_app_list(self) -> Vec<String> {
        let mut out = Vec::with_capacity(13);
        for suit in [Suit::Spade, Suit::Heart, Suit::Diamond, Suit::Club] {
            let mut ranks: Vec<Card> = self
                .cards
                .iter()
                .copied()
                .filter(|c| c.suit() == suit)
                .collect();
            ranks.sort_by_key(|c| std::cmp::Reverse(c.rank().value()));
            out.extend(ranks.into_iter().map(Card::to_app));
        }
        out
    }

    pub fn len_of(self, suit: Suit) -> u8 {
        self.cards.iter().filter(|c| c.suit() == suit).count() as u8
    }

    /// Lengths in CDHS order.
    pub fn shape(self) -> [u8; 4] {
        let mut s = [0u8; 4];
        for c in self.cards {
            s[c.suit().idx()] += 1;
        }
        s
    }

    pub fn hcp(self) -> u8 {
        self.cards.iter().map(|c| c.hcp()).sum()
    }

    /// Joan Butts length points: 5-card +1, 6-card +2, 7-card +3, …
    pub fn length_points(self) -> u8 {
        self.shape()
            .iter()
            .map(|&len| if len >= 5 { len - 4 } else { 0 })
            .sum()
    }

    pub fn opening_points(self) -> u8 {
        self.hcp() + self.length_points()
    }

    pub fn longest(self) -> (Suit, u8) {
        let sh = self.shape();
        let mut best_i = 3; // prefer spades on a complete tie
        let mut best = 0u8;
        for i in (0..4).rev() {
            if sh[i] > best {
                best = sh[i];
                best_i = i;
            }
        }
        (Suit::from_idx(best_i).unwrap(), best)
    }

    pub fn two_longest_sum(self) -> u8 {
        let mut sh = self.shape();
        sh.sort_unstable();
        sh[2] + sh[3]
    }

    /// 4333 / 4432 / 5332. Not 5422 (two doubletons) and not any 6-card.
    pub fn is_balanced(self) -> bool {
        is_balanced_shape(self.shape())
    }

    pub fn has_five_card(self) -> bool {
        self.shape().iter().any(|&l| l >= 5)
    }

    pub fn has_five_major(self) -> bool {
        self.len_of(Suit::Heart) >= 5 || self.len_of(Suit::Spade) >= 5
    }

    pub fn shortage_points(self, trump: Suit) -> u8 {
        Suit::ALL
            .iter()
            .filter(|&&s| s != trump)
            .map(|&s| match self.len_of(s) {
                0 => 5,
                1 => 3,
                2 => 1,
                _ => 0,
            })
            .sum()
    }

    /// Dummy / support points: HCP + shortage. Used once a trump fit is known.
    pub fn support_points(self, trump: Suit) -> u8 {
        self.hcp() + self.shortage_points(trump)
    }

    /// Rule of 20 (first/second seat borderline): HCP + two longest suit lengths.
    pub fn rule_of_20(self) -> u8 {
        self.hcp() + self.two_longest_sum()
    }

    pub fn can_open_one(self) -> bool {
        if self.opening_points() >= 13 {
            return true;
        }
        self.hcp() >= 10 && self.rule_of_20() >= 20
    }
}

pub fn is_balanced_shape(shape: [u8; 4]) -> bool {
    if shape.iter().any(|&l| l >= 6 || l <= 1) {
        return false;
    }
    let doubletons = shape.iter().filter(|&&l| l == 2).count();
    doubletons <= 1
}

pub fn full_deck() -> Vec<Card> {
    (0..52).map(Card).collect()
}

pub fn shuffled_deck<R: Rng + ?Sized>(rng: &mut R) -> Vec<Card> {
    let mut d = full_deck();
    d.shuffle(rng);
    d
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Deal {
    pub north: Hand,
    pub east: Hand,
    pub south: Hand,
    pub west: Hand,
}

impl Deal {
    pub fn hand(&self, seat: Seat) -> Hand {
        match seat {
            Seat::North => self.north,
            Seat::East => self.east,
            Seat::South => self.south,
            Seat::West => self.west,
        }
    }

    pub fn from_four(
        north: Hand,
        east: Hand,
        south: Hand,
        west: Hand,
    ) -> Result<Self, &'static str> {
        let mut seen = [false; 52];
        for h in [north, east, south, west] {
            for c in h.cards() {
                let i = c.id() as usize;
                if seen[i] {
                    return Err("duplicate card in deal");
                }
                seen[i] = true;
            }
        }
        Ok(Deal {
            north,
            east,
            south,
            west,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_roundtrip() {
        let c = Card::parse_app("SA").unwrap();
        assert_eq!(c.suit(), Suit::Spade);
        assert_eq!(c.rank(), Rank::ACE);
        assert_eq!(c.to_app(), "SA");
        assert_eq!(c.hcp(), 4);
    }

    #[test]
    fn balanced_shapes() {
        assert!(is_balanced_shape([4, 3, 3, 3]));
        assert!(is_balanced_shape([4, 4, 3, 2]));
        assert!(is_balanced_shape([5, 3, 3, 2]));
        assert!(!is_balanced_shape([5, 4, 2, 2]));
        assert!(!is_balanced_shape([6, 3, 2, 2]));
        assert!(!is_balanced_shape([4, 4, 4, 1]));
    }

    #[test]
    fn length_points_two_fives() {
        // 5-5-2-1: +1 +1 = 2
        let mut cards = Vec::new();
        for r in 0..5 {
            cards.push(Card::new(Suit::Spade, Rank(r)));
            cards.push(Card::new(Suit::Heart, Rank(r)));
        }
        cards.push(Card::new(Suit::Diamond, Rank(0)));
        cards.push(Card::new(Suit::Diamond, Rank(1)));
        cards.push(Card::new(Suit::Club, Rank(0)));
        let h = Hand::try_from_slice(&cards).unwrap();
        assert_eq!(h.length_points(), 2);
        assert_eq!(h.shape(), [1, 2, 5, 5]);
    }
}
