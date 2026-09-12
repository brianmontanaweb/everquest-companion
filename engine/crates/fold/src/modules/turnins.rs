//! `src/main/modules/turnins.ts` — completed NPC trades / quest turn-ins.
//!
//! Offers accumulate per NPC until the matching "complete the trade" line closes the group. A trade
//! with a DIFFERENT npc than the open offer group records nothing and still drops the group, which
//! is the TS's exact shape (its `pendingOffer = null` sits outside the `if`).
//!
//! `items` carries `{name, count}` PAIRS rather than bare names (the Sky over-hand-in fix): the
//! trade-window line states how many copies went into a slot (`You offered 2 Wind Rune Heda to
//! ...`), and this module is a transcript of the trade, not an arbiter of what a quest needed —
//! that arithmetic is reconcile.ts's. Two SEPARATE offer lines for the same item are two separate
//! entries, never merged here, for the same reason: merging would be a decision about meaning that
//! belongs one layer up.

use crate::event::Event;
use crate::EqModule;
use serde::Serialize;
use serde_json::{json, Value};

/// One item slot as the trade window held it. `count` defaults to 1 for an event with no `count`
/// field (every fixture and golden predating this fix) — the line itself never omits the number,
/// so an absent field means only "this event was built before the parser carried it".
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TurnInItem {
    name: String,
    count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct TurnInRow {
    ts: i64,
    npc: String,
    items: Vec<TurnInItem>,
}

struct PendingOffer {
    npc: String,
    items: Vec<TurnInItem>,
}

#[derive(Default)]
pub struct TurnInsModule {
    turn_ins: Vec<TurnInRow>,
    pending_offer: Option<PendingOffer>,
    seq: i64,
    /// The announce cursor — see [`crate::announce`]. `pending_offer` is not published state: a
    /// handed-over item is a half-formed group nobody can read until the trade closes it.
    announce: crate::announce::Announce,
}

impl TurnInsModule {
    pub fn new() -> Self {
        Self::default()
    }
}

impl EqModule for TurnInsModule {
    fn id(&self) -> &'static str {
        "turnins"
    }

    fn reset(&mut self) {
        self.turn_ins.clear();
        self.pending_offer = None;
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        match ev.kind() {
            // Character rebirth. A half-formed offer group goes with it.
            "epoch" => {
                self.turn_ins.clear();
                self.pending_offer = None;
                self.announce.changed(self.seq);
            }
            // An offer publishes nothing: it opens or extends the pending group, which is not in
            // `snapshot()`. Handing items to an NPC and walking away leaves the ledger as it was.
            "offer" => {
                let npc = ev.str("npc").unwrap_or_default().to_string();
                let name = ev.str("item").unwrap_or_default().to_string();
                // Absent means an event built before this field existed; the line itself never
                // omits the number, and a bad/negative count floors at 1 rather than corrupting
                // held-item math downstream.
                let count = ev.int("count").unwrap_or(1).max(1);
                let item = TurnInItem { name, count };
                match self.pending_offer.as_mut() {
                    Some(open) if open.npc == npc => open.items.push(item),
                    _ => {
                        self.pending_offer = Some(PendingOffer {
                            npc,
                            items: vec![item],
                        })
                    }
                }
            }
            "trade" => {
                let npc = ev.str("npc").unwrap_or_default();
                if let Some(open) = self.pending_offer.take() {
                    if open.npc == npc {
                        self.turn_ins.push(TurnInRow {
                            ts: ev.ts(),
                            npc: open.npc,
                            items: open.items,
                        });
                        self.announce.changed(self.seq);
                    }
                }
            }
            _ => {}
        }
    }

    /// Moves on the trade that CLOSED a group, not on every line that passed by. See `announce`.
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    fn snapshot(&self) -> Value {
        json!({ "seq": self.seq, "state": self.turn_ins })
    }
}
