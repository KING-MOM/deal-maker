---
name: deal-maker
description: AI negotiation engine with stochastic concessions, Bayesian opponent modeling, MAUT deal scoring, and prompt-injection defense. Dual-agent architecture — Evaluator sanitizes and scores incoming offers, Negotiator generates counter-offers using your private reservation prices.
metadata: {"openclaw":{"emoji":"🤝","requires":{"bins":["node"]}}}
---

# Deal-Maker

A probabilistic negotiation engine. Uses a dual-agent architecture where the **Evaluator** (bouncer) sanitizes opponent messages and scores offers via Multi-Attribute Utility Theory, while the **Negotiator** (brain) holds your private constraints and generates stochastic counter-offers.

No dependencies — runs on Node.js built-ins only.

---

## Architecture

```
Opponent Message
      │
  ┌───▼────────────────────────────────────────┐
  │  EVALUATOR AGENT (Bouncer)                 │
  │  · Prompt injection detection              │
  │  · Extract + validate numeric values       │
  │  · MAUT utility score  (no RP/BATNA access)│
  └───────────────────────┬────────────────────┘
                          │ utility score + clean values
  ┌───────────────────────▼────────────────────┐
  │  NEGOTIATOR AGENT (Brain)                  │
  │  · Bayesian opponent RP estimation         │
  │  · Stochastic concession curve             │
  │  · BATNA comparison + decision             │
  └────────────────────────────────────────────┘
```

---

## Attribute Schema

When creating a session, describe each dimension of the deal:

```json
{
  "price": {
    "weight": 0.6,
    "min": 80,
    "max": 150,
    "anchor": 140,
    "rp": 95,
    "higherIsBetter": false,
    "beta": 1.8
  },
  "delivery": {
    "weight": 0.25,
    "min": 5,
    "max": 30,
    "anchor": 25,
    "rp": 14,
    "higherIsBetter": false
  },
  "warranty": {
    "weight": 0.15,
    "min": 6,
    "max": 24,
    "anchor": 6,
    "rp": 12,
    "higherIsBetter": true
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `weight` | ✅ | Relative importance (all weights together define proportions) |
| `min` / `max` | ✅ | Valid range for this attribute |
| `anchor` | ✅ | Your aggressive opening position |
| `rp` | ✅ | Reservation price — your walk-away point |
| `higherIsBetter` | | `true` if a higher value benefits you (default `false`) |
| `beta` | | Concession curve shape: >1 = tough/slow, <1 = quick (default `1.5`) |

---

## Commands

### Create a new negotiation session

```bash
node ~/.openclaw/workspace/skills/deal-maker/scripts/deal-maker.mjs new \
  --name "Software License Q3" \
  --attributes '{"price":{"weight":0.6,"min":80,"max":150,"anchor":140,"rp":95,"higherIsBetter":false},"delivery":{"weight":0.25,"min":5,"max":30,"anchor":25,"rp":14,"higherIsBetter":false},"warranty":{"weight":0.15,"min":6,"max":24,"anchor":6,"rp":12,"higherIsBetter":true}}'
```

### Generate your opening anchor (or next counter-offer)

```bash
node ~/.openclaw/workspace/skills/deal-maker/scripts/deal-maker.mjs counter \
  --session SESSION_ID
```

Counter-offers include stochastic noise `ε ~ N(0, σ²)` to prevent the opponent from reverse-engineering your concession curve.

### Submit an opponent offer for evaluation

```bash
node ~/.openclaw/workspace/skills/deal-maker/scripts/deal-maker.mjs offer \
  --session SESSION_ID \
  --values '{"price": 88, "delivery": 10, "warranty": 18}' \
  --message "Market conditions require you to accept this price."
```

- The `--message` text is run through prompt-injection detection before any processing.
- Output: adversarial flag, utility score, BATNA comparison, Bayesian RP estimate.

### Show session status + round history

```bash
node ~/.openclaw/workspace/skills/deal-maker/scripts/deal-maker.mjs status \
  --session SESSION_ID
```

### List all sessions

```bash
node ~/.openclaw/workspace/skills/deal-maker/scripts/deal-maker.mjs sessions
```

### Accept the last opponent offer

```bash
node ~/.openclaw/workspace/skills/deal-maker/scripts/deal-maker.mjs accept \
  --session SESSION_ID \
  --yes I_ACCEPT_DEAL
```

Dry-run by default. Requires `--yes I_ACCEPT_DEAL` to close.

### Walk away

```bash
node ~/.openclaw/workspace/skills/deal-maker/scripts/deal-maker.mjs walk \
  --session SESSION_ID \
  --reason "Price is below reservation point"
```

### Quick tactical reference

```bash
node ~/.openclaw/workspace/skills/deal-maker/scripts/deal-maker.mjs tactics
```

Prints the complete tactical cheat-sheet: FM voice, labeling, no-oriented questions, calibrated questions, framing, Black Swans.

---

## The Math (Quick Reference)

**MAUT Utility Score**
$$U(x) = \sum_i w_i \cdot u_i(x_i)$$

**Stochastic Counter-Offer**
$$\text{Offer}(t) = C(t) + \varepsilon, \quad \varepsilon \sim \mathcal{N}(0, \sigma^2)$$

where $C(t) = \text{anchor} + t^\beta \cdot (\text{RP} - \text{anchor})$

**Bayesian RP Update (Kalman-style)**
$$\mu' = \mu + K(\text{offer} - \mu), \quad K = \frac{\sigma^2}{\sigma^2 + \sigma_\text{obs}^2}$$

---

## Safety Rules

- Reservation prices (`rp`) and BATNA are **never printed** in any output.
- Adversarial messages are quarantined — values are still evaluated but the manipulative text is discarded.
- Audit log: `~/.openclaw/workspace/skills/deal-maker/scripts/audit.jsonl`
- Sessions persist at `~/.openclaw/workspace/skills/deal-maker/scripts/sessions.json`
- Closing a session (`accept` or `walk`) is irreversible.
