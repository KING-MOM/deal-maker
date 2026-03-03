---
name: deal-maker
description: Run utility-driven negotiations with MAUT scoring, Bayesian opponent modeling, and prompt-injection defenses. Use when handling deal-making, counter-offers, BATNA-aware decisions, or adversarial/automated negotiation contexts. Dual-agent architecture separates input sanitization from private strategy.
---

# Deal-Maker — AI Negotiation Engine

Probabilistic negotiation engine using dual-agent architecture. The **Evaluator** sanitizes opponent messages, detects prompt injection, and scores offers using Multi-Attribute Utility Theory. The **Negotiator** holds your private constraints, models opponent reservation prices via Bayesian inference, and generates stochastic counter-offers masked by noise.

**No external dependencies.** Pure Node.js. Requires Node.js >= 18.0.0.

---

## Quick Start (30 seconds)

```bash
# 1. Create negotiation session
node {baseDir}/scripts/deal-maker.mjs new \
  --name "My Deal" \
  --attributes '{"price":{"weight":1,"min":80,"max":150,"anchor":140,"rp":95,"higherIsBetter":false}}'

# 2. Generate your opening anchor
node {baseDir}/scripts/deal-maker.mjs counter --session <id>

# 3. Evaluate opponent's offer
node {baseDir}/scripts/deal-maker.mjs offer --session <id> --values '{"price":110}'

# Add --json to any command for structured output (agent mode)
```

---

## Attribute Schema

Each negotiation dimension:

```json
{
  "price": {
    "weight": 0.6,
    "min": 80,
    "max": 150,
    "anchor": 140,
    "rp": 95,
    "higherIsBetter": false,
    "beta": 1.5,
    "observationVariance": null
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `weight` | Yes | Relative importance (0 < w < ∞). Normalized in utility calculation |
| `min`, `max` | Yes | Valid range. Must have min < max |
| `anchor` | Yes | Your aggressive opening position |
| `rp` | Yes | Reservation price (walk-away point). Private — never revealed |
| `higherIsBetter` | No | `true` = higher values benefit you. Default: `false` |
| `beta` | No | Concession curve shape. 1.5 = Boulware (tough), 0.5 = Conceder (quick). Default: 1.5 |
| `observationVariance` | No | Tune Bayesian learning speed. Default: `(max-min)² × 0.05` |

---

## Commands

### `new` — Create session

```bash
node {baseDir}/scripts/deal-maker.mjs new \
  --name "Session Name" \
  --attributes '<JSON>' \
  [--max-rounds <int>] \
  [--sigma <float>]
```

- `--name`: Required. Human-readable session name
- `--attributes`: Required. JSON with attribute definitions (see schema above)
- `--max-rounds`: Optional, default 10. Negotiation rounds
- `--sigma`: Optional, default 0.03. Noise scale [0, 1]

**Output:** Session ID, BATNA utility (private), storage warning

### `offer` — Submit opponent offer

```bash
node {baseDir}/scripts/deal-maker.mjs offer \
  --session <id> \
  --values '<JSON>' \
  [--message "<text>"]
```

Sanitizes input, detects injection, scores offer with MAUT, updates Bayesian model.

### `counter` — Generate counter-offer

```bash
node {baseDir}/scripts/deal-maker.mjs counter --session <id>
```

Follows your concession curve but adds Gaussian noise so opponent cannot reverse-engineer your strategy.

### Other Commands

| Command | Usage | Notes |
|---------|-------|-------|
| `sessions` | `deal-maker.mjs sessions` | List all negotiation sessions |
| `status` | `deal-maker.mjs status --session <id>` | Show session state, rounds, RP estimates |
| `accept` | `deal-maker.mjs accept --session <id> --yes I_ACCEPT_DEAL` | Confirm deal acceptance. Add `--force-below-batna` to override safety |
| `walk` | `deal-maker.mjs walk --session <id> [--reason "..."]` | Walk away (irreversible). BATNA preserved |
| `tactics` | `deal-maker.mjs tactics [--json]` | FBI negotiation tactics reference |
| `playbook` | `deal-maker.mjs playbook [--json]` | Conversation protocol: opening, move types, anti-leakage rules |

---

## Output Contract (Agent Mode)

All commands support `--json` flag for structured, agent-consumable output:

```json
{
  "decision": "accept|reject|counter|walk",
  "utility_score": 0.684,
  "risk_flags": ["pattern_name"],
  "rationale": "Explanation without sensitive internals",
  "next_request": "Specific next action",
  "counter_offer": { "attribute": value }
}
```

Example:
```bash
node {baseDir}/scripts/deal-maker.mjs offer --session <id> --values '{"price":110}' --json
```

---

## Safety & Security

✅ **Protected:**
- Reservation prices never printed to stdout
- BATNA threshold is private
- Concession curve masked by Gaussian noise
- Prompt injection detection: 21 regex patterns + Unicode normalization
- Hard-fail on severe injection, missing attributes, oversized payloads

⚠️ **Not Protected (At Rest):**
- `sessions.json` and `audit.jsonl` are unencrypted plaintext in `scripts/` directory

**Recommendations:**
1. Restrict filesystem access: `chmod 600 scripts/sessions.json scripts/audit.jsonl`
2. Store on encrypted filesystem or sandboxed environment
3. Review `audit.jsonl` periodically for anomalies

---

## Known Limitations

1. **Unencrypted at rest** — sessions.json and audit.jsonl contain sensitive data
2. **Regex injection detection** — Not foolproof; can be evaded with synonyms or creative phrasing
3. **Uniform priors** — Assumes opponent RP is uniform over [min, max]
4. **No cross-session learning** — Each negotiation starts fresh
5. **Single-process** — Race conditions if multiple instances access same sessions.json
6. **Linear utility only** — Non-linear preferences not supported

---

## Example: Salary Negotiation

```bash
node {baseDir}/scripts/deal-maker.mjs new \
  --name "Senior Engineer Offer" \
  --attributes '{
    "salary": {"weight": 0.7, "min": 80000, "max": 180000, "anchor": 175000, "rp": 110000, "higherIsBetter": true},
    "signing_bonus": {"weight": 0.2, "min": 0, "max": 50000, "anchor": 45000, "rp": 10000, "higherIsBetter": true},
    "remote_days": {"weight": 0.1, "min": 0, "max": 5, "anchor": 2, "rp": 4, "higherIsBetter": true}
  }'
```

---

## References

- **[Architecture & Math](references/architecture.md)** — Dual-agent design, MAUT formulas, concession curves, Bayesian updates, hard-fail conditions
- **[Conversation Playbook](references/conversation-playbook.md)** — Tactical phrasing patterns, move types, anti-leakage rules, close conditions
- **[Never Split the Difference](https://en.wikipedia.org/wiki/Never_Split_the_Difference)** (Voss, 2016) — FBI negotiation tactics
- **[The Art and Science of Negotiation](https://en.wikipedia.org/wiki/Howard_Raiffa)** (Raiffa, 1982) — MAUT theory
- **[Prospect Theory](https://en.wikipedia.org/wiki/Prospect_theory)** (Kahneman & Tversky, 1979) — Behavioral economics
