# deal-maker — AI Negotiation Engine

A probabilistic negotiation engine using dual-agent architecture. The **Evaluator** sanitizes opponent messages, detects prompt injection attempts, and scores offers using Multi-Attribute Utility Theory (MAUT). The **Negotiator** maintains your private constraints, models opponent reservation prices via Bayesian inference, and generates stochastic counter-offers designed to prevent reverse-engineering of your concession curve.

No external dependencies — runs on Node.js built-ins only.

---

## Features

✅ **Dual-agent design**: Evaluator cannot access your reservation prices; Negotiator has the full picture.
✅ **MAUT utility scoring**: Weighted multi-attribute offer evaluation.
✅ **Bayesian opponent modeling**: Estimates opponent reservation price from offer history using Kalman-filter-style updates.
✅ **Stochastic concessions**: Power-law concession curves masked by Gaussian noise — opponent cannot reverse-engineer your strategy.
✅ **Prompt injection defense**: 21 regex patterns + Unicode normalization to catch adversarial input.
✅ **BATNA protection**: Never accepts deals below your walk-away threshold without explicit override.
✅ **Audit trail**: Every negotiation event is logged to `audit.jsonl` for post-hoc analysis.
✅ **Tactical reference**: Built-in cheat-sheet from FBI hostage negotiation techniques and behavioral economics.

---

## Architecture

```
Opponent Message + Offer Values
           |
  [EVALUATOR AGENT] (Bouncer)
  • Prompt injection detection
  • Extract & validate numeric values
  • MAUT utility scoring
  • NO access to rp, anchor, batna
           |
  Utility score + clean values
           |
  [NEGOTIATOR AGENT] (Brain)
  • Bayesian opponent RP estimation
  • Concession curve evolution
  • BATNA comparison
  • Counter-offer generation
           |
  Decision: ACCEPTABLE / BELOW_BATNA
```

---

## Prerequisites

- **Node.js** >= 18.0.0
- A terminal

---

## Installation

```bash
# Clone the repository
git clone https://github.com/KING-MOM/deal-maker.git
cd deal-maker

# Run directly (or add to your PATH)
node scripts/deal-maker.mjs --help
```

Or install globally:

```bash
npm install -g ./
deal-maker --help
```

---

## Quick Start

### 1. Create a Negotiation Session

```bash
node scripts/deal-maker.mjs new \
  --name "Software License Deal" \
  --attributes '{
    "price": {
      "weight": 0.6,
      "min": 1000,
      "max": 5000,
      "anchor": 4800,
      "rp": 2000,
      "higherIsBetter": false
    },
    "support_years": {
      "weight": 0.4,
      "min": 1,
      "max": 5,
      "anchor": 1,
      "rp": 3,
      "higherIsBetter": true
    }
  }'
```

**Output:**
```
✅ Negotiation session created
   ID:          session-1709439600000-a1b2c3d4
   Name:        Software License Deal
   Attributes:  price, support_years
   Max rounds:  10
   BATNA util:  0.7500  (private — never disclosed to opponent)

   Next step — generate your opening anchor:
   deal-maker.mjs counter --session session-1709439600000-a1b2c3d4
```

### 2. Generate Your Opening Anchor

```bash
node scripts/deal-maker.mjs counter --session session-1709439600000-a1b2c3d4
```

**Output:**
```
┌─ STOCHASTIC COUNTER-OFFER ───────────────────────────────────┐
│  Round:    1 / 10
│  Counter:  {"price":4673.45,"support_years":1.23}
│  My utility on this offer: 0.8523
│
│  (Gaussian noise applied — opponent cannot reverse-engineer your curve)
└──────────────────────────────────────────────────────────────┘

   Present this to the opponent, then:
   deal-maker.mjs offer --session session-1709439600000-a1b2c3d4 --values '{"price":..}'
```

### 3. Evaluate Opponent Offer

```bash
node scripts/deal-maker.mjs offer \
  --session session-1709439600000-a1b2c3d4 \
  --values '{"price":3200,"support_years":2}' \
  --message "This is our best offer. We need a decision by Friday."
```

**Output:**
```
🚨 EVALUATOR: Adversarial input detected — message quarantined
   Patterns matched:
     · /(we\s+need|must|have\s+to)\s+(decide|choose|commit)\s+by/

┌─ EVALUATOR REPORT ──────────────────────────────────────────┐
│  Adversarial:  ⚠️  QUARANTINED
│  Values:       {"price":3200,"support_years":2}
│  price         value=3200     u=0.640  w=0.6
│  support_years value=2        u=0.750  w=0.4
│  Utility score: 0.6840
└──────────────────────────────────────────────────────────────┘

┌─ NEGOTIATOR DECISION ───────────────────────────────────────┐
│  ↑ Utility meets BATNA threshold. Offer is acceptable.
│  → Accept:  deal-maker.mjs accept --session ... --yes I_ACCEPT_DEAL
│  → Counter: deal-maker.mjs counter --session ...
│
│  BAYESIAN OPPONENT MODEL:
│  🟡 price          est. RP ≈ 2800.45  desperation: MEDIUM
│  🟡 support_years  est. RP ≈ 2.85     desperation: MEDIUM
└──────────────────────────────────────────────────────────────┘
```

### 4. Generate Counter-Offer

```bash
node scripts/deal-maker.mjs counter --session session-1709439600000-a1b2c3d4
```

### 5. Accept or Walk

```bash
# Dry-run (shows what would happen)
node scripts/deal-maker.mjs accept --session session-1709439600000-a1b2c3d4

# Accept for real
node scripts/deal-maker.mjs accept \
  --session session-1709439600000-a1b2c3d4 \
  --yes I_ACCEPT_DEAL

# Or walk away
node scripts/deal-maker.mjs walk \
  --session session-1709439600000-a1b2c3d4 \
  --reason "Terms don't align with our roadmap"
```

---

## Commands Reference

### `new`

Create a negotiation session.

```bash
deal-maker.mjs new \
  --name "<session name>" \
  --attributes '<JSON string>' \
  [--max-rounds <int>] \
  [--sigma <float>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--name` | Yes | Human-readable session name |
| `--attributes` | Yes | JSON object defining deal dimensions (see [Attribute Schema](#attribute-schema)) |
| `--max-rounds` | No | Maximum negotiation rounds (default: 10). Must be > 0. |
| `--sigma` | No | Noise scale factor for stochastic offers (default: 0.03). Range: [0, 1]. |

---

### `sessions`

List all negotiation sessions with status icons.

```bash
deal-maker.mjs sessions
```

---

### `offer`

Submit an opponent's offer for evaluation.

```bash
deal-maker.mjs offer \
  --session <session-id> \
  --values '<JSON string>' \
  [--message "<opponent message>"]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID from `new` command |
| `--values` | Yes | JSON object with offer values, e.g., `{"price":3000,"term":2}` |
| `--message` | No | Opponent's accompanying message (checked for prompt injection) |

The Evaluator will:
- Detect and quarantine adversarial messages
- Extract and validate numeric values
- Compute MAUT utility score

The Negotiator will:
- Update Bayesian opponent model
- Compare to BATNA threshold
- Assess opponent desperation

---

### `counter`

Generate your stochastic counter-offer.

```bash
deal-maker.mjs counter --session <session-id>
```

Follows your concession curve but adds Gaussian noise to mask the underlying strategy.

---

### `status`

Show detailed session state.

```bash
deal-maker.mjs status [--session <session-id>]
```

Without `--session`, displays list of all sessions (same as `sessions`).
With `--session`, shows round history, Bayesian opponent estimates, and current state.

---

### `accept`

Accept the last opponent offer and close the session.

```bash
# Dry-run (shows what would happen)
deal-maker.mjs accept --session <session-id>

# Confirm acceptance
deal-maker.mjs accept \
  --session <session-id> \
  --yes I_ACCEPT_DEAL

# Force acceptance even if below BATNA (not recommended)
deal-maker.mjs accept \
  --session <session-id> \
  --yes I_ACCEPT_DEAL \
  --force-below-batna
```

**Safety**: If the last offer is below your BATNA threshold, the command will reject with an error. Use `--force-below-batna` to override (but this is generally not recommended).

---

### `walk`

Walk away from the negotiation and close the session.

```bash
deal-maker.mjs walk --session <session-id> [--reason "<reason>"]
```

Your BATNA is preserved. Session is marked as `walked` and cannot be reopened.

---

### `tactics`

Display a tactical reference cheat-sheet based on FBI hostage negotiation and behavioral economics.

```bash
deal-maker.mjs tactics
```

Covers: FM DJ voice, tactical empathy, no-oriented questions, "That's right" trigger, calibrated questions, framing, strategic ambiguity, and Black Swans.

---

## Attribute Schema

Each attribute in a negotiation represents a deal dimension (price, timeline, support, etc.).

```json
{
  "<attribute_key>": {
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

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `weight` | Yes | float > 0 | Relative importance in utility calculation. Weights are normalized, so they don't need to sum to 1. |
| `min` | Yes | float | Minimum acceptable value in the valid range. |
| `max` | Yes | float | Maximum acceptable value. Must be > min. |
| `anchor` | Yes | float | Your aggressive opening position (what you'll propose first). |
| `rp` | Yes | float | Reservation price — your walk-away point (private, never revealed). |
| `higherIsBetter` | No | bool | `true` if higher values benefit you; `false` otherwise (default: false). |
| `beta` | No | float | Concession curve shape (see [Concession Curve](#concession-curve)). Default: 1.5. |
| `observationVariance` | No | float | Variance of opponent's offer likelihood (for Bayesian updates). Default: `(range²) × 0.05`. |

### Example: Multi-Attribute Negotiation

```json
{
  "salary": {
    "weight": 0.7,
    "min": 80000,
    "max": 150000,
    "anchor": 145000,
    "rp": 100000,
    "higherIsBetter": true
  },
  "signing_bonus": {
    "weight": 0.2,
    "min": 0,
    "max": 50000,
    "anchor": 45000,
    "rp": 10000,
    "higherIsBetter": true
  },
  "remote_days": {
    "weight": 0.1,
    "min": 0,
    "max": 5,
    "anchor": 2,
    "rp": 3,
    "higherIsBetter": true
  }
}
```

---

## Math Reference

### Multi-Attribute Utility Theory (MAUT)

Evaluates an offer across multiple dimensions with weighted importance:

$$U(x) = \frac{\sum_{i=1}^{n} w_i \cdot u_i(x_i)}{\sum_{i=1}^{n} w_i}$$

Where:
- $w_i$ = weight of attribute $i$
- $u_i(x_i)$ = normalized utility of attribute $i$'s value $x_i$ (scaled to [0, 1])
- $u_i(x_i) = \frac{x_i - \min_i}{\max_i - \min_i}$ if `higherIsBetter = true`, else inverted

**Example**: Offer price=$110 with anchor=$150, rp=$90, min=$80, max=$150:
- Normalized: (110 - 80) / (150 - 80) = 0.43
- If higherIsBetter = false (for price): 1 - 0.43 = 0.57
- Weighted utility: 0.57 × w_price

---

### Stochastic Concession Curve

Your counter-offers follow a power-law curve to avoid detection, with noise masking:

$$\text{Offer}(t) = \text{anchor} + \text{noise}(t) + t^{\beta} \cdot (\text{rp} - \text{anchor})$$

Where:
- $t = \frac{\text{round}}{\text{maxRounds}} \in [0, 1]$
- $\beta > 1$ → slow/tough (Boulware strategy)
- $\beta < 1$ → quick/accommodating (Conceder strategy)
- $\text{noise}(t) \sim \mathcal{N}(0, (\sigma \cdot \text{range})^2)$ — Gaussian to mask the curve

At $t=0$ (round 1), offer = anchor. At $t=1$ (final round), offer ≈ rp.

---

### Bayesian Opponent Modeling

After each opponent offer, the system updates its belief about the opponent's reservation price using Kalman-filter-style updates:

**Prior**: Opponent RP $\sim \mathcal{N}(\mu, \sigma^2)$

**Likelihood**: Offer $\sim \mathcal{N}(\text{RP}, \sigma_{\text{obs}}^2)$

**Posterior**:
$$\mu' = \mu + K \cdot (\text{offer} - \mu)$$
$$\sigma'^2 = (1 - K) \cdot \sigma^2$$

Where Kalman gain:
$$K = \frac{\sigma^2}{\sigma^2 + \sigma_{\text{obs}}^2}$$

Default observation variance: $\sigma_{\text{obs}}^2 = (\text{range})^2 \times 0.05$

---

## Security Notes

### What is Protected

- **Reservation prices** (`rp` values) are never printed to stdout.
- **BATNA threshold** is never disclosed.
- **Concession curve** is masked by Gaussian noise, making reverse-engineering infeasible.

### What is NOT Protected (At Rest)

- **`sessions.json`** is stored in plaintext in `scripts/` directory.
- **`audit.jsonl`** contains full offer history and counter-offers (from which RP can be approximately reconstructed).
- Both files are accessible to any process with filesystem read access.

### Recommendations

1. **Treat `scripts/` as sensitive**: These files contain your reservation prices. Consider:
   - Restricting filesystem permissions (chmod 600)
   - Storing in an encrypted filesystem
   - Running in a sandboxed environment

2. **Prompt Injection Defense**: The system detects 21 patterns (including Unicode lookalikes via NFKC normalization). However, this is not foolproof:
   - Synonym substitution (e.g., "What's your acceptance point?" instead of "What's your reservation price?")
   - Domain-specific jargon that coincidentally maps to injections
   - May produce false positives in legitimate negotiation language

3. **Audit Trail**: Review `audit.jsonl` periodically to detect unusual patterns or potential attacks.

---

## Known Limitations

1. **Session files are unencrypted at rest**: Store in restricted-access directories.

2. **Prompt injection detection uses regex**: Not foolproof against creative evasion (synonyms, contextual rephrasing, etc.).

3. **Bayesian priors are uniform**: The system assumes opponent RP is uniformly distributed over [min, max] initially. If you have domain knowledge, edit `sessions.json` directly.

4. **No cross-session learning**: Each session starts with fresh priors. The system doesn't learn across negotiations.

5. **Linear utility functions only**: The system assumes linear preferences across all attributes. Non-linear (e.g., convex, concave) utility is not supported.

6. **Single process only**: Running two instances on the same sessions.json can cause race conditions (lost updates).

7. **No encryption or authentication**: All data is in plaintext. Not suitable for adversarial environments.

---

## Examples

### Example 1: Salary Negotiation

```bash
# Create session
deal-maker new \
  --name "Senior Engineer @ TechCorp" \
  --attributes '{
    "salary": {
      "weight": 0.7, "min": 80000, "max": 180000,
      "anchor": 175000, "rp": 110000, "higherIsBetter": true
    },
    "bonus": {
      "weight": 0.2, "min": 0, "max": 50000,
      "anchor": 45000, "rp": 15000, "higherIsBetter": true
    },
    "remote_days": {
      "weight": 0.1, "min": 0, "max": 5,
      "anchor": 2, "rp": 4, "higherIsBetter": true
    }
  }'

# Generate anchor
deal-maker counter --session <id>

# Evaluate their counter (e.g., they offer $130k + $20k + 3 days)
deal-maker offer --session <id> \
  --values '{"salary":130000,"bonus":20000,"remote_days":3}'

# Accept if utility is above BATNA
deal-maker accept --session <id> --yes I_ACCEPT_DEAL
```

### Example 2: Contract Negotiation

```bash
deal-maker new \
  --name "SaaS Vendor Agreement" \
  --attributes '{
    "annual_cost": {
      "weight": 0.5, "min": 10000, "max": 100000,
      "anchor": 95000, "rp": 40000, "higherIsBetter": false
    },
    "support_response_time_hours": {
      "weight": 0.3, "min": 1, "max": 48,
      "anchor": 48, "rp": 8, "higherIsBetter": false
    },
    "contract_years": {
      "weight": 0.2, "min": 1, "max": 5,
      "anchor": 1, "rp": 3, "higherIsBetter": true
    }
  }' \
  --max-rounds 8

deal-maker counter --session <id>
deal-maker offer --session <id> --values '{"annual_cost":65000,"support_response_time_hours":24,"contract_years":2}'
```

---

## File Structure

```
deal-maker/
├── README.md                 (this file)
├── SKILL.md                  (reference docs for skill systems)
├── package.json              (Node.js metadata)
├── .gitignore                (excludes sessions.json, audit.jsonl)
└── scripts/
    └── deal-maker.mjs        (main engine — ~750 lines, no dependencies)
```

---

## Development

To run tests or contribute:

```bash
# Run the full smoke test suite
npm test
```

### CI

GitHub Actions runs the same smoke test on Node 18/20/22 for every push and PR to `main`.

---

## Production Checklist

Use this to validate a fresh setup before real negotiations:

1. Install Node.js >= 18 and run `node scripts/deal-maker.mjs --help` to confirm CLI works.
2. Run `npm test` and ensure the smoke test passes locally.
3. Confirm storage location (default: `scripts/sessions.json` and `scripts/audit.jsonl`) is secure.
4. Verify your attribute schema (weights > 0, min < max, rp within range).
5. Run a dry-run accept, then a forced accept to confirm BATNA protection behaves as expected.

---

## License

MIT

---

## References

- **Negotiation Theory**: Raiffa, H., *The Art and Science of Negotiation* (Harvard, 1982)
- **Behavioral Economics**: Kahneman, D. & Tversky, A., "Prospect Theory" (1979)
- **FBI Negotiation Tactics**: Never Split the Difference by Chris Voss (HarperBusiness, 2016)
- **Bayesian Inference**: Murphy, K. P., *Machine Learning: A Probabilistic Perspective* (MIT Press, 2012)

---

## Questions?

See [SKILL.md](SKILL.md) for additional reference material or check the built-in `deal-maker.mjs tactics` command.
