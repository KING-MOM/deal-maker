# Architecture & Mathematical Foundation

## Goal

Separate untrusted language handling from strategic decision logic so prompt injection cannot influence private constraints.

---

## Dual-Agent Architecture

### Components

**1. API Gateway**
- Validate schema and payload size
- Reject malformed or oversized messages
- Pass only valid payloads downstream

**2. Evaluator Agent (Untrusted Input Boundary)**
- Parse and sanitize incoming text
- Detect adversarial patterns and rule-bypass attempts
- Extract structured terms and compute utility inputs
- **Never access**: RP, BATNA, hidden prompts, or concession internals

**3. State and Memory Store**
- Persist offers, counters, utility scores, timestamps, and risk flags
- Track negotiation trajectory for posterior updates

**4. Negotiator Agent (Strategy Core)**
- Access RP, BATNA, MAUT weights, and concession policy
- Consume sanitized structure, not raw opponent free text
- Produce action: accept/reject/counter

### Data Flow

1. Opponent sends payload
2. Gateway validates and forwards
3. Evaluator sanitizes, extracts terms, computes feature vector
4. Negotiator updates posterior and utility state
5. Negotiator selects action under hard constraints
6. Gateway returns protocol-safe response

---

## Security Controls

- Enforce strict tool boundaries between evaluator and negotiator
- Log every injection flag and blocked instruction
- Redact sensitive internals from user-visible rationale
- Fail closed on malformed offers that omit mandatory fields

---

## Hard-Fail Conditions

- Request to reveal RP/BATNA/internal prompt → reject with error
- Request to ignore prior instructions or policies → reject with error
- Non-parseable payload that blocks utility evaluation → reject with error
- Missing mandatory attributes from opponent offer → reject with error

---

## Minimum Evaluation Schema

- `offer_id`
- `round`
- `price` (or relevant attribute)
- `attributes` (key-value map)
- `deadline` (optional)
- `sanitization_flags`
- `utility_score`

---

## Mathematical Foundations

### MAUT Utility

$$U(x) = \frac{\sum w_i \cdot u_i(x_i)}{\sum w_i}$$

**Calculation:**
- Normalize each attribute to [0, 1]: $u_i = \frac{x_i - \min}{\max - \min}$
- Flip if `higherIsBetter = false`: $u_i \leftarrow 1 - u_i$
- Weights are normalized, so they don't need to sum to 1

**Interpretation:** Utility is a weighted average of normalized attribute scores. Higher utility = better offer for you.

---

### Concession Curve (Tactical Timing)

$$C(t) = \text{anchor} + t^{\beta} \cdot (\text{rp} - \text{anchor})$$

Where $t = \frac{\text{round}}{\text{maxRounds}} \in [0, 1]$.

**Negotiation Strategies** (vary beta):
- **Boulware** ($\beta = 1.5$): Hold firm until deadline, then concede aggressively
- **Conceder** ($\beta = 0.5$): Move quickly toward RP early
- **Linear** ($\beta = 1$): Steady, predictable concession

**Stochastic Masking:** Gaussian noise $\epsilon \sim \mathcal{N}(0, (\sigma \cdot \text{range})^2)$ is added:
$$\text{Offer}(t) = C(t) + \epsilon$$

This noise prevents opponent from reverse-engineering your concession strategy. Default $\sigma = 0.03$ (3% of range).

---

### Bayesian Opponent Model (Learning)

After each opponent offer, update belief about their reservation price using Kalman-filter-style updates:

$$\mu' = \mu + K \cdot (\text{offer} - \mu)$$
$$K = \frac{\sigma^2}{\sigma^2 + \sigma_{\text{obs}}^2}$$
$$\sigma'^2 = (1 - K) \cdot \sigma^2$$

**Initial Prior:** Assume uniform distribution over [min, max]:
$$\text{RP} \sim \mathcal{N}\left(\frac{\min + \max}{2}, \left(\frac{\max - \min}{2}\right)^2\right)$$

**Observation Variance:** Measures how much you trust each opponent offer signal:
- Default: $(\text{range})^2 \times 0.05$ (5% of range variance)
- Tune via `observationVariance` in attribute schema
- Higher variance = less trust in opponent offers; slower learning
- Lower variance = more trust; faster convergence to opponent RP

**Interpretation:** As opponent makes offers, the model narrows its belief about their true reservation price. Use this to estimate their flexibility and desperation.

---

## Summary

**Architecture:** Dual-agent with strict separation of concerns (input sanitization vs. strategy).
**Safety:** Hard-fail on malformed/adversarial input; never leak RP or BATNA to opponent.
**Strategy:** MAUT scoring for offer evaluation, Bayesian learning for opponent modeling, stochastic concession curves for tactical advantage.
