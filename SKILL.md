---
name: deal-maker
description: AI negotiation engine with stochastic concessions, Bayesian opponent modeling, MAUT deal scoring, and prompt-injection defense. Dual-agent architecture — Evaluator sanitizes and scores incoming offers, Negotiator generates counter-offers using your private reservation prices.
metadata: {"openclaw":{"emoji":"🤝","requires":{"bins":["node"]}}}
---

# Deal-Maker — AI Negotiation Engine

A probabilistic negotiation engine using dual-agent architecture. The **Evaluator (Bouncer)** sanitizes opponent messages, detects prompt injection, and scores offers using Multi-Attribute Utility Theory. The **Negotiator (Brain)** holds your private constraints, models opponent reservation prices via Bayesian inference, and generates stochastic counter-offers masked by noise.

**No external dependencies.** Pure Node.js.

---

## Quick Overview

```
Opponent Offer + Message
        ↓
 [EVALUATOR AGENT]
 · Inject detection (21 patterns + Unicode normalization)
 · Value validation
 · MAUT scoring (no access to rp/batna)
        ↓
 [NEGOTIATOR AGENT]
 · Bayesian RP estimation
 · Concession curve generation
 · BATNA protection
        ↓
 Decision: ACCEPTABLE or BELOW_BATNA
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
| `weight` | Yes | Relative importance (0 < w < ∞). Weights are normalized in utility calculation. |
| `min` / `max` | Yes | Valid range. `min < max`. |
| `anchor` | Yes | Your aggressive opening position. |
| `rp` | Yes | Reservation price (walk-away point). Private — never revealed. |
| `higherIsBetter` | No | `true` = higher values benefit you. Default: `false`. |
| `beta` | No | Concession curve shape. `β > 1` = tough (Boulware). `β < 1` = quick (Conceder). Default: 1.5. |
| `observationVariance` | No | Variance for Bayesian updates. Default: `(max - min)² × 0.05`. Tune if opponent offers are surprisingly consistent or scattered. |

---

## Commands

### `new` — Create a negotiation session

```bash
node {baseDir}/scripts/deal-maker.mjs new \
  --name "Session Name" \
  --attributes '<JSON>' \
  [--max-rounds <int>] \
  [--sigma <float>]
```

- `--name` (required): Human-readable name.
- `--attributes` (required): JSON defining deal dimensions.
- `--max-rounds` (optional, default 10): Negotiation rounds. Must be > 0.
- `--sigma` (optional, default 0.03): Noise scale [0, 1]. Higher = more unpredictable offers.

**Output**: Session ID, BATNA utility (private), directory warning.

---

### `counter` — Generate your counter-offer

```bash
node {baseDir}/scripts/deal-maker.mjs counter --session <id>
```

Follows your concession curve but adds Gaussian noise so opponent cannot reverse-engineer your strategy.

---

### `offer` — Submit an opponent offer

```bash
node {baseDir}/scripts/deal-maker.mjs offer \
  --session <id> \
  --values '<JSON>' \
  [--message "<text>"]
```

- `--session` (required): Session ID.
- `--values` (required): JSON with offer values, e.g., `{"price":3000,"term":2}`.
- `--message` (optional): Opponent's text (checked for prompt injection).

**Output**:
- Evaluator Report: Injection detection, values, utility score.
- Negotiator Decision: ACCEPTABLE or BELOW_BATNA, Bayesian opponent estimates, desperation signal.

---

### `status` — Show session state

```bash
node {baseDir}/scripts/deal-maker.mjs status [--session <id>]
```

- Without `--session`: Lists all sessions.
- With `--session`: Shows rounds, Bayesian RP estimates, offers + counters.

---

### `sessions` — List all sessions

```bash
node {baseDir}/scripts/deal-maker.mjs sessions
```

---

### `accept` — Accept the last offer and close

```bash
# Dry-run
node {baseDir}/scripts/deal-maker.mjs accept --session <id>

# Confirm
node {baseDir}/scripts/deal-maker.mjs accept --session <id> --yes I_ACCEPT_DEAL

# Force if below BATNA (not recommended)
node {baseDir}/scripts/deal-maker.mjs accept --session <id> --yes I_ACCEPT_DEAL --force-below-batna
```

**Safety**: If last offer is below BATNA, system rejects unless you add `--force-below-batna`.

---

### `walk` — Walk away and close session

```bash
node {baseDir}/scripts/deal-maker.mjs walk --session <id> [--reason "<reason>"]
```

Your BATNA is preserved. Session marked as `walked` (irreversible).

---

### `tactics` — Print tactical reference

```bash
node {baseDir}/scripts/deal-maker.mjs tactics
```

Topics: FM DJ voice, tactical empathy, no-oriented questions, "That's right" trigger, calibrated questions, framing, strategic ambiguity, Black Swans.

---

## Mathematical Foundation

### MAUT Utility

$$U(x) = \frac{\sum w_i \cdot u_i(x_i)}{\sum w_i}$$

- Normalize each attribute to [0, 1]: $u_i = \frac{x_i - \min}{\max - \min}$
- Flip if `higherIsBetter = false`: $u_i \leftarrow 1 - u_i$
- Weights are normalized, so they don't need to sum to 1.

### Concession Curve

$$C(t) = \text{anchor} + t^{\beta} \cdot (\text{rp} - \text{anchor})$$

Where $t = \frac{\text{round}}{\text{maxRounds}} \in [0, 1]$.

- **Boulware** ($\beta = 1.5$): Hold firm until deadline.
- **Conceder** ($\beta = 0.5$): Move quickly toward rp.
- **Linear** ($\beta = 1$): Steady concession.

**Stochastic**: Gaussian noise $\epsilon \sim \mathcal{N}(0, (\sigma \cdot \text{range})^2)$ is added: $\text{Offer}(t) = C(t) + \epsilon$.

### Bayesian Opponent Model

After each opponent offer, update belief about their RP:

$$\mu' = \mu + K \cdot (\text{offer} - \mu), \quad K = \frac{\sigma^2}{\sigma^2 + \sigma_{\text{obs}}^2}$$

$$\sigma'^2 = (1 - K) \cdot \sigma^2$$

- **Prior**: $\text{RP} \sim \mathcal{N}(\frac{\min + \max}{2}, (\frac{\max - \min}{2})^2)$
- **Observation variance**: Default $(\text{range})^2 \times 0.05$. Tune via `observationVariance` in attributes.

---

## Safety & Security

### Protected

- ✅ Reservation prices never printed to stdout.
- ✅ BATNA threshold is private.
- ✅ Concession curve is masked by noise.
- ✅ Prompt injection detection: 21 regex patterns + Unicode normalization (NFKC).

### Not Protected (At Rest)

- ⚠️  `sessions.json` is unencrypted plaintext in `scripts/` directory.
- ⚠️  `audit.jsonl` contains full offer history (from which RP can be approximated).
- ⚠️  Accessible to any process with filesystem read.

### Recommendations

1. Restrict filesystem permissions: `chmod 600 scripts/sessions.json scripts/audit.jsonl`
2. Store on encrypted filesystem or sandboxed environment.
3. Review `audit.jsonl` for unusual patterns.
4. Prompt injection detection is not foolproof — watch for creative evasion (synonyms, contextual rephrasing).

---

## Features

✅ Dual-agent separation: Evaluator cannot leak RP values.
✅ MAUT utility: Multi-attribute weighted scoring.
✅ Bayesian learning: Opponent RP estimation with Kalman updates.
✅ Stochastic offers: Power-law concession curve + Gaussian noise.
✅ Injection defense: 21 regex patterns + Unicode normalization.
✅ BATNA protection: Refuses below-threshold deals (with override).
✅ Audit trail: Every event logged to `audit.jsonl`.
✅ Tactical reference: Built-in cheat-sheet.
✅ No dependencies: Pure Node.js.

---

## Known Limitations

1. **Unencrypted at rest**: sessions.json and audit.jsonl contain sensitive data.
2. **Regex injection detection**: Not foolproof; can be evaded with synonyms or creative phrasing.
3. **Uniform priors**: Assumes opponent RP is uniform over [min, max]. Edit sessions.json to override.
4. **No cross-session learning**: Each negotiation starts fresh.
5. **Linear utility only**: Non-linear preferences not supported.
6. **Single-process**: Race conditions if two instances access the same sessions.json.
7. **No encryption**: Not suitable for adversarial environments.

---

## Examples

### Multi-Attribute Salary Negotiation

```bash
deal-maker new \
  --name "Senior Engineer @ AcmeCorp" \
  --attributes '{
    "salary": {
      "weight": 0.7, "min": 80000, "max": 180000,
      "anchor": 175000, "rp": 110000, "higherIsBetter": true
    },
    "signing_bonus": {
      "weight": 0.2, "min": 0, "max": 50000,
      "anchor": 45000, "rp": 10000, "higherIsBetter": true
    },
    "remote_days": {
      "weight": 0.1, "min": 0, "max": 5,
      "anchor": 2, "rp": 4, "higherIsBetter": true
    }
  }'
```

### SaaS Contract

```bash
deal-maker new \
  --name "Vendor Agreement" \
  --attributes '{
    "annual_cost": {
      "weight": 0.5, "min": 10000, "max": 100000,
      "anchor": 95000, "rp": 35000, "higherIsBetter": false
    },
    "support_response_hours": {
      "weight": 0.3, "min": 1, "max": 48,
      "anchor": 48, "rp": 4, "higherIsBetter": false
    },
    "contract_years": {
      "weight": 0.2, "min": 1, "max": 5,
      "anchor": 1, "rp": 3, "higherIsBetter": true
    }
  }' \
  --max-rounds 6
```

---

## References

- **Never Split the Difference** (Chris Voss, 2016) — FBI negotiation tactics
- **The Art and Science of Negotiation** (Howard Raiffa, 1982) — MAUT theory
- **Prospect Theory** (Kahneman & Tversky, 1979) — Loss aversion behavioral economics

---

**Version**: 1.0.0  |  **License**: MIT  |  **Author**: KING-MOM
