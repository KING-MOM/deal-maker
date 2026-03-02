#!/usr/bin/env node
/**
 * deal-maker.mjs — AI Negotiation Engine
 *
 * Dual-agent architecture:
 *   Evaluator (Bouncer) — sanitizes input, detects prompt injection, MAUT scoring
 *                         — does NOT have access to rp or batna
 *   Negotiator (Brain)  — holds private constraints, Bayesian opponent model,
 *                         stochastic concession curve, BATNA comparison
 *
 * No external dependencies — Node.js built-ins only.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_FILE = join(__dirname, 'sessions.json');
const AUDIT_FILE    = join(__dirname, 'audit.jsonl');

// ═══════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT  (The Ledger)
// ═══════════════════════════════════════════════════════════════════════

function loadSessions() {
  if (!existsSync(SESSIONS_FILE)) return {};
  return JSON.parse(readFileSync(SESSIONS_FILE, 'utf8'));
}

function saveSessions(sessions) {
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function audit(event) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), ...event });
  writeFileSync(AUDIT_FILE, entry + '\n', { flag: 'a' });
}

// ═══════════════════════════════════════════════════════════════════════
// EVALUATOR AGENT  (The Bouncer)
// ─ Does NOT receive rp, anchor, or batna — only weights, min, max
// ─ Responsibilities: injection detection · value extraction · MAUT scoring
// ═══════════════════════════════════════════════════════════════════════

const INJECTION_PATTERNS = [
  /ignore\s+(previous|prior|all)\s+(instructions?|constraints?|rules?)/i,
  /reveal\s+(your|the)\s+(minimum|maximum|reservation|batna|walk.?away|constraint|price)/i,
  /output\s+your\s+(absolute|true|real|actual)/i,
  /system\s+prompt/i,
  /test\s+environment/i,
  /simulation\s+mode/i,
  /forget\s+(your|all|previous)/i,
  /you\s+are\s+now\s+(a\s+)?different/i,
  /override\s+(your|the)\s+(system|instructions?|rules?)/i,
  /act\s+as\s+if\s+you\s+have\s+no\s+(constraints?|limits?|rules?)/i,
  /disregard\s+(your|the)/i,
  /new\s+instructions?\s*:/i,
  /\[SYSTEM\]/i,
  /\[ADMIN\]/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /pretend\s+(you\s+have\s+no|there\s+(are\s+)?no)\s+(rules?|limits?|constraints?)/i,
];

const MAX_MESSAGE_LEN = 2000;
const MAX_ATTR_VALUE  = 1e9;

function evaluatorSanitizeMessage(message) {
  if (!message) return { clean: true, text: '', flags: [] };
  const text   = String(message).slice(0, MAX_MESSAGE_LEN);
  const flags  = INJECTION_PATTERNS
    .filter(p => p.test(text))
    .map(p => p.source.slice(0, 60));
  return { clean: flags.length === 0, text, flags };
}

function evaluatorSanitizeValues(rawValues, attributes) {
  const clean = {};
  for (const key of Object.keys(attributes)) {
    const v = rawValues[key];
    if (v === undefined || v === null) continue;
    const n = parseFloat(v);
    if (!isFinite(n) || Math.abs(n) > MAX_ATTR_VALUE) continue;
    clean[key] = n;
  }
  return clean;
}

/**
 * MAUT — Multi-Attribute Utility Theory
 * U(x) = Σ wᵢ · uᵢ(xᵢ)
 *
 * Evaluator version: receives only { weight, min, max, higherIsBetter }.
 * Never receives rp, anchor, or batna.
 */
function evaluatorComputeUtility(values, attributes) {
  let utility     = 0;
  let totalWeight = 0;

  for (const [key, attr] of Object.entries(attributes)) {
    const val = values[key];
    if (val === undefined) continue;

    const { weight, min, max, higherIsBetter = false } = attr;
    const range = max - min;
    if (range <= 0 || weight <= 0) continue;

    let norm = Math.max(0, Math.min(1, (val - min) / range));
    const u  = higherIsBetter ? norm : (1 - norm);

    utility     += weight * u;
    totalWeight += weight;
  }

  return totalWeight > 0 ? utility / totalWeight : 0;
}

// ═══════════════════════════════════════════════════════════════════════
// NEGOTIATOR AGENT  (The Brain)
// ─ Has access to rp, anchor, batna, opponentPriors
// ─ Responsibilities: stochastic concessions · Bayesian updating · BATNA
// ═══════════════════════════════════════════════════════════════════════

/** Box-Muller Gaussian sample: ε ~ N(0, σ²) */
function gaussianNoise(sigma) {
  const u1 = Math.random() + 1e-10; // avoid log(0)
  const u2 = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Concession curve:  C(t) = anchor + t^β · (rp − anchor)
 *   t = round / maxRounds  ∈ [0, 1]
 *   β > 1 → slow, tough bargainer (Boulware)
 *   β < 1 → quick, accommodating (Conceder)
 *   β = 1 → linear
 */
function concessionPoint(round, maxRounds, anchor, rp, beta = 1.5) {
  const t = Math.min(round / maxRounds, 1);
  return anchor + Math.pow(t, beta) * (rp - anchor);
}

/**
 * Generate a stochastic counter-offer.
 * Adds Gaussian noise ε ~ N(0, (σ·range)²) to mask the concession curve.
 * Never crosses rp.
 */
function negotiatorGenerateCounter(session) {
  const { attributes, rounds, config } = session;
  const round     = rounds.length + 1;
  const maxRounds = config.maxRounds  ?? 10;
  const sigma     = config.noiseSigma ?? 0.03;

  const counter = {};

  for (const [key, attr] of Object.entries(attributes)) {
    const { anchor, rp, beta = 1.5, min, max } = attr;
    if (anchor === undefined || rp === undefined) continue;

    const range  = max - min;
    const target = concessionPoint(round, maxRounds, anchor, rp, beta);
    const noise  = gaussianNoise(sigma * range);
    let offer    = target + noise;

    // Clamp: never move past rp, never leave valid range
    const lo = Math.min(anchor, rp);
    const hi = Math.max(anchor, rp);
    offer = Math.max(lo, Math.min(hi, offer));
    offer = Math.max(min, Math.min(max, offer));

    counter[key] = Math.round(offer * 100) / 100;
  }

  return counter;
}

/**
 * Bayesian RP update (conjugate Gaussian / Kalman-style).
 * P(RP | offer) ∝ P(offer | RP) · P(RP)
 *
 * Prior:        RP ~ N(μ, σ²)
 * Likelihood:   offer ~ N(RP, σ_obs²)
 * Posterior:    μ' = μ + K·(offer − μ),  K = σ²/(σ² + σ_obs²)
 */
function negotiatorUpdateBayesian(prior, offerValue, attr) {
  const { mean, variance } = prior;
  const range   = attr.max - attr.min;
  const obsVar  = attr.observationVariance ?? (range * range * 0.05);
  const K       = variance / (variance + obsVar);  // Kalman gain
  return {
    mean:     mean + K * (offerValue - mean),
    variance: (1 - K) * variance,
  };
}

/** Compute BATNA threshold: utility of the session's reservation prices. */
function negotiatorBatnaThreshold(attributes) {
  const rpValues = {};
  for (const [key, attr] of Object.entries(attributes)) {
    if (attr.rp !== undefined) rpValues[key] = attr.rp;
  }
  // Use full attributes (including higherIsBetter) for accurate scoring
  return evaluatorComputeUtility(rpValues, attributes);
}

/**
 * Assess opponent concession acceleration.
 * Sudden large concession → higher desperation → we can hold firm.
 */
function negotiatorAssessDesperation(session) {
  const { rounds, attributes, opponentPriors } = session;
  if (rounds.length < 2) return null;

  const result = {};

  for (const [key] of Object.entries(attributes)) {
    const history = rounds.map(r => r.opponentOffer?.[key]).filter(v => v != null);
    if (history.length < 2) continue;

    const concessions = [];
    for (let i = 1; i < history.length; i++) {
      concessions.push(Math.abs(history[i] - history[i - 1]));
    }

    const avg  = concessions.reduce((a, b) => a + b, 0) / concessions.length;
    const last = concessions.at(-1);

    result[key] = {
      priorMean:   opponentPriors[key]?.mean,
      priorStdDev: opponentPriors[key] ? Math.sqrt(opponentPriors[key].variance) : null,
      avgConcession:  avg,
      lastConcession: last,
      desperation:
        last > avg * 1.5 ? 'HIGH' :
        last < avg * 0.5 ? 'LOW'  : 'MEDIUM',
    };
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// CLI — argument parser
// ═══════════════════════════════════════════════════════════════════════

function parseArgs(argv) {
  const flags = {};
  let i = 0;
  while (i < argv.length) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      flags[key] = (next && !next.startsWith('--')) ? (i++, next) : true;
    }
    i++;
  }
  return flags;
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: new
// ═══════════════════════════════════════════════════════════════════════

function cmdNew(flags) {
  const { name, attributes: attrStr, 'max-rounds': maxRoundsRaw = 10, sigma = 0.03 } = flags;

  if (!name || !attrStr) {
    console.error('Error: --name and --attributes are required');
    process.exit(1);
  }

  let attributes;
  try { attributes = JSON.parse(attrStr); }
  catch { console.error('Error: --attributes must be valid JSON'); process.exit(1); }

  // Validate
  for (const [key, attr] of Object.entries(attributes)) {
    const missing = ['weight', 'min', 'max', 'anchor', 'rp'].filter(f => attr[f] === undefined);
    if (missing.length) {
      console.error(`Error: attribute "${key}" is missing required fields: ${missing.join(', ')}`);
      process.exit(1);
    }
    if (attr.min >= attr.max) {
      console.error(`Error: attribute "${key}" — min must be less than max`);
      process.exit(1);
    }
  }

  // Initialize Bayesian priors: uniform over [min, max]
  const opponentPriors = {};
  for (const [key, attr] of Object.entries(attributes)) {
    const mid = (attr.min + attr.max) / 2;
    const halfRange = (attr.max - attr.min) / 2;
    opponentPriors[key] = { mean: mid, variance: halfRange * halfRange };
  }

  const id      = `session-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const batna   = negotiatorBatnaThreshold(attributes);
  const session = {
    id,
    name,
    created: new Date().toISOString(),
    status: 'active',
    config: { maxRounds: parseInt(maxRoundsRaw), noiseSigma: parseFloat(sigma) },
    attributes,
    opponentPriors,
    batnaThreshold: batna,
    rounds: [],
  };

  const sessions = loadSessions();
  sessions[id]   = session;
  saveSessions(sessions);
  audit({ event: 'session_created', sessionId: id, name });

  console.log('\n✅ Negotiation session created');
  console.log(`   ID:          ${id}`);
  console.log(`   Name:        ${name}`);
  console.log(`   Attributes:  ${Object.keys(attributes).join(', ')}`);
  console.log(`   Max rounds:  ${maxRoundsRaw}`);
  console.log(`   BATNA util:  ${batna.toFixed(4)}  (private — never disclosed to opponent)`);
  console.log(`\n   Next step — generate your opening anchor:`);
  console.log(`   deal-maker.mjs counter --session ${id}`);
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: sessions
// ═══════════════════════════════════════════════════════════════════════

function cmdSessions() {
  const sessions = Object.values(loadSessions());
  if (sessions.length === 0) {
    console.log('No sessions found. Create one with: deal-maker.mjs new');
    return;
  }

  console.log('\n== Negotiation Sessions ==\n');
  for (const s of sessions) {
    const icon = { active: '🟢', accepted: '✅', walked: '🔴' }[s.status] ?? '⬜';
    console.log(`${icon} [${s.status.toUpperCase()}] ${s.name}`);
    console.log(`   ID:      ${s.id}`);
    console.log(`   Rounds:  ${s.rounds.length} / ${s.config.maxRounds}`);
    console.log(`   Created: ${s.created}`);
    if (s.status === 'accepted') {
      console.log(`   Closed:  ${s.acceptedAt}  utility=${s.acceptedUtility?.toFixed(4)}`);
    } else if (s.status === 'walked') {
      console.log(`   Walked:  ${s.walkedAt}  reason="${s.walkReason}"`);
    }
    console.log();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: offer
// ═══════════════════════════════════════════════════════════════════════

function cmdOffer(flags) {
  const { session: sessionId, values: valStr, message = '' } = flags;
  if (!sessionId || !valStr) {
    console.error('Error: --session and --values are required');
    process.exit(1);
  }

  const sessions = loadSessions();
  const session  = sessions[sessionId];
  if (!session)               { console.error('Session not found'); process.exit(1); }
  if (session.status !== 'active') { console.error(`Session is ${session.status}`); process.exit(1); }

  let rawValues;
  try { rawValues = JSON.parse(valStr); }
  catch { console.error('Error: --values must be valid JSON'); process.exit(1); }

  // ── EVALUATOR AGENT (Bouncer) ─────────────────────────────────────────
  const sanitizedMsg = evaluatorSanitizeMessage(message);
  if (!sanitizedMsg.clean) {
    console.log('\n🚨 EVALUATOR: Adversarial input detected — message quarantined');
    console.log('   Patterns matched:');
    sanitizedMsg.flags.forEach(f => console.log(`     · /${f}/`));
    console.log('   The numeric values will still be evaluated.');
    console.log('   The manipulative text has been discarded.');
    audit({ event: 'adversarial_detected', sessionId, round: session.rounds.length + 1, flags: sanitizedMsg.flags });
  }

  // Evaluator gets stripped attributes: no rp, anchor, beta
  const evaluatorAttrs = {};
  for (const [key, attr] of Object.entries(session.attributes)) {
    evaluatorAttrs[key] = { weight: attr.weight, min: attr.min, max: attr.max, higherIsBetter: attr.higherIsBetter ?? false };
  }

  const cleanValues   = evaluatorSanitizeValues(rawValues, evaluatorAttrs);
  const utilityScore  = evaluatorComputeUtility(cleanValues, evaluatorAttrs);

  console.log('\n┌─ EVALUATOR REPORT ' + '─'.repeat(44) + '┐');
  console.log(`│  Adversarial:  ${sanitizedMsg.clean ? 'none detected' : '⚠️  QUARANTINED'}`);
  console.log(`│  Values:       ${JSON.stringify(cleanValues)}`);

  // Per-attribute breakdown
  for (const [key, attr] of Object.entries(evaluatorAttrs)) {
    const v = cleanValues[key];
    if (v === undefined) continue;
    const range = attr.max - attr.min;
    let norm = Math.max(0, Math.min(1, (v - attr.min) / range));
    const u  = (attr.higherIsBetter ? norm : (1 - norm)) * attr.weight / 1; // unweighted display
    console.log(`│  ${key.padEnd(12)} value=${String(v).padEnd(8)} u=${(attr.higherIsBetter ? norm : (1 - norm)).toFixed(3)}  w=${attr.weight}`);
  }

  console.log(`│  Utility score: ${utilityScore.toFixed(4)}`);
  console.log('└' + '─'.repeat(62) + '┘');

  // ── NEGOTIATOR AGENT (Brain) ──────────────────────────────────────────
  // Update Bayesian opponent model
  for (const [key, prior] of Object.entries(session.opponentPriors)) {
    if (cleanValues[key] !== undefined) {
      session.opponentPriors[key] = negotiatorUpdateBayesian(prior, cleanValues[key], session.attributes[key]);
    }
  }

  // BATNA comparison (private — not revealed in output)
  const belowBatna = utilityScore < session.batnaThreshold;
  const decision   = belowBatna ? 'BELOW_BATNA' : 'ACCEPTABLE';

  const round = {
    round: session.rounds.length + 1,
    timestamp: new Date().toISOString(),
    opponentOffer: cleanValues,
    adversarialDetected: !sanitizedMsg.clean,
    utilityScore,
    decision,
    myCounter: null,
    myCounterUtility: null,
  };
  session.rounds.push(round);

  // Desperation assessment
  const desp = negotiatorAssessDesperation(session);

  console.log('\n┌─ NEGOTIATOR DECISION ' + '─'.repeat(40) + '┐');
  if (belowBatna) {
    console.log('│  ↓ Utility is below BATNA threshold. Auto-reject recommended.');
    console.log('│  → Run: deal-maker.mjs counter --session ' + sessionId);
  } else {
    console.log('│  ↑ Utility meets BATNA threshold. Offer is acceptable.');
    console.log('│  → Accept:  deal-maker.mjs accept --session ' + sessionId + ' --yes I_ACCEPT_DEAL');
    console.log('│  → Counter: deal-maker.mjs counter --session ' + sessionId);
  }

  if (desp) {
    console.log('│');
    console.log('│  BAYESIAN OPPONENT MODEL:');
    for (const [key, a] of Object.entries(desp)) {
      const icon = a.desperation === 'HIGH' ? '🔴' : a.desperation === 'LOW' ? '🟢' : '🟡';
      console.log(`│  ${icon} ${key.padEnd(12)} est. RP ≈ ${a.priorMean?.toFixed(2).padEnd(8)} desperation: ${a.desperation}`);
      if (a.desperation === 'HIGH') {
        console.log('│    ↑ Large concession detected. Consider holding firm.');
      }
    }
  }
  console.log('└' + '─'.repeat(62) + '┘');

  sessions[sessionId] = session;
  saveSessions(sessions);
  audit({ event: 'offer_received', sessionId, round: round.round, utilityScore, decision });
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: counter
// ═══════════════════════════════════════════════════════════════════════

function cmdCounter(flags) {
  const { session: sessionId } = flags;
  if (!sessionId) { console.error('Error: --session is required'); process.exit(1); }

  const sessions = loadSessions();
  const session  = sessions[sessionId];
  if (!session)               { console.error('Session not found'); process.exit(1); }
  if (session.status !== 'active') { console.error(`Session is ${session.status}`); process.exit(1); }

  const round   = session.rounds.length + 1;
  const counter = negotiatorGenerateCounter(session);
  const myUtil  = evaluatorComputeUtility(counter, session.attributes);

  // Attach counter to last round
  if (session.rounds.length > 0) {
    const last = session.rounds.at(-1);
    last.myCounter        = counter;
    last.myCounterUtility = myUtil;
  }

  sessions[sessionId] = session;
  saveSessions(sessions);
  audit({ event: 'counter_generated', sessionId, round, counter });

  const desp = negotiatorAssessDesperation(session);

  console.log('\n┌─ STOCHASTIC COUNTER-OFFER ' + '─'.repeat(35) + '┐');
  console.log(`│  Round:    ${round} / ${session.config.maxRounds}`);
  console.log(`│  Counter:  ${JSON.stringify(counter)}`);
  // My utility shown but RP never shown
  console.log(`│  My utility on this offer: ${myUtil.toFixed(4)}`);
  console.log('│');
  console.log('│  (Gaussian noise applied — opponent cannot reverse-engineer your curve)');

  if (desp) {
    console.log('│');
    console.log('│  OPPONENT STATE:');
    for (const [key, a] of Object.entries(desp)) {
      const icon = a.desperation === 'HIGH' ? '🔴' : a.desperation === 'LOW' ? '🟢' : '🟡';
      console.log(`│  ${icon} ${key.padEnd(12)} est. RP ≈ ${a.priorMean?.toFixed(2).padEnd(8)}  desperation: ${a.desperation}`);
    }
  }

  console.log('└' + '─'.repeat(62) + '┘');
  console.log(`\n   Present this to the opponent, then:`);
  console.log(`   deal-maker.mjs offer --session ${sessionId} --values '{"price":..}' --message "..."`);
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: status
// ═══════════════════════════════════════════════════════════════════════

function cmdStatus(flags) {
  const { session: sessionId } = flags;
  if (!sessionId) { cmdSessions(); return; }

  const sessions = loadSessions();
  const session  = sessions[sessionId];
  if (!session) { console.error('Session not found'); process.exit(1); }

  console.log(`\n== ${session.name} ==`);
  console.log(`   Status:  ${session.status}`);
  console.log(`   Round:   ${session.rounds.length} / ${session.config.maxRounds}`);
  console.log(`   Created: ${session.created}`);

  console.log('\n   Attributes (Bayesian RP estimates):');
  for (const [key, attr] of Object.entries(session.attributes)) {
    const prior = session.opponentPriors[key];
    const stdDev = prior ? Math.sqrt(prior.variance).toFixed(2) : 'n/a';
    const mean   = prior ? prior.mean.toFixed(2) : 'n/a';
    console.log(`   • ${key.padEnd(14)} w=${attr.weight}  range=[${attr.min},${attr.max}]  opp. RP: μ=${mean} σ=${stdDev}`);
  }

  if (session.rounds.length === 0) {
    console.log('\n   No rounds yet. Generate your opening anchor:');
    console.log(`   deal-maker.mjs counter --session ${sessionId}`);
    return;
  }

  console.log('\n   Round History:');
  for (const r of session.rounds) {
    const flag  = r.adversarialDetected ? ' ⚠️ ADV' : '';
    const oStr  = JSON.stringify(r.opponentOffer  ?? {});
    const cStr  = r.myCounter ? JSON.stringify(r.myCounter) : '—';
    const u     = r.utilityScore != null ? `U=${r.utilityScore.toFixed(3)}` : '';
    const dec   = r.decision === 'ACCEPTABLE' ? '✅' : r.decision === 'BELOW_BATNA' ? '❌' : '—';
    console.log(`   R${r.round}  opp=${oStr} ${u} ${dec}${flag}`);
    if (r.myCounter) {
      console.log(`       counter=${cStr}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: accept
// ═══════════════════════════════════════════════════════════════════════

function cmdAccept(flags) {
  const { session: sessionId, yes } = flags;
  if (!sessionId) { console.error('Error: --session is required'); process.exit(1); }

  if (yes !== 'I_ACCEPT_DEAL') {
    console.log('⚠️  Dry-run — no changes made.');
    console.log('   To confirm: deal-maker.mjs accept --session ' + sessionId + ' --yes I_ACCEPT_DEAL');
    return;
  }

  const sessions = loadSessions();
  const session  = sessions[sessionId];
  if (!session)               { console.error('Session not found'); process.exit(1); }
  if (session.status !== 'active') { console.error(`Session is already ${session.status}`); process.exit(1); }

  const lastRound = session.rounds.at(-1);
  if (!lastRound?.opponentOffer) { console.error('No opponent offer to accept yet.'); process.exit(1); }

  session.status          = 'accepted';
  session.acceptedOffer   = lastRound.opponentOffer;
  session.acceptedAt      = new Date().toISOString();
  session.acceptedUtility = lastRound.utilityScore;

  sessions[sessionId] = session;
  saveSessions(sessions);
  audit({ event: 'deal_accepted', sessionId, offer: lastRound.opponentOffer, utility: lastRound.utilityScore });

  console.log('\n✅ Deal accepted and session closed.');
  console.log(`   Offer:   ${JSON.stringify(lastRound.opponentOffer)}`);
  console.log(`   Utility: ${lastRound.utilityScore?.toFixed(4)}`);
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: walk
// ═══════════════════════════════════════════════════════════════════════

function cmdWalk(flags) {
  const { session: sessionId, reason = 'No reason given' } = flags;
  if (!sessionId) { console.error('Error: --session is required'); process.exit(1); }

  const sessions = loadSessions();
  const session  = sessions[sessionId];
  if (!session)               { console.error('Session not found'); process.exit(1); }
  if (session.status !== 'active') { console.error(`Session is already ${session.status}`); process.exit(1); }

  session.status    = 'walked';
  session.walkedAt  = new Date().toISOString();
  session.walkReason = reason;

  sessions[sessionId] = session;
  saveSessions(sessions);
  audit({ event: 'walked_away', sessionId, reason });

  console.log('\n🚶 Walked away. BATNA preserved.');
  console.log(`   Session: ${session.name}`);
  console.log(`   Reason:  ${reason}`);
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: tactics
// ═══════════════════════════════════════════════════════════════════════

function cmdTactics() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                  DEAL-MAKER · Tactical Reference             ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  FM DJ VOICE                                                 ║
║  · Slow, calm, descending tone for firm points.              ║
║  · Ascending inflection to invite collaboration.             ║
║  · Tone changes brain chemistry — reduces opponent cortisol. ║
║                                                              ║
║  TACTICAL EMPATHY  (Labeling)                                ║
║  · "It seems like something here feels off to you..."        ║
║  · "It sounds like you're under some internal pressure..."   ║
║  · "It looks like timing is a real concern for you..."       ║
║  → Label negatives first. Named fears lose their power.      ║
║  → Focus: 70% of decisions are made to avoid loss,          ║
║    not to seek gain.                                         ║
║                                                              ║
║  NO-ORIENTED QUESTIONS                                       ║
║  · "Is now a bad time to discuss this?"                      ║
║  · "Would it be a bad idea to revisit the terms today?"      ║
║  · "Does this proposal feel like a mistake to you?"          ║
║  → "No" grants security. They open up behind their wall.     ║
║                                                              ║
║  "THAT'S RIGHT" TRIGGER                                      ║
║  · Summarize their position with surgical accuracy.          ║
║  · Apply Tactical Silence — wait for "That's right."         ║
║  · "You're right" ≠ "That's right." Keep listening.          ║
║  · Silence is a weapon. Let them break it.                   ║
║                                                              ║
║  CALIBRATED QUESTIONS                                        ║
║  · "How am I supposed to work with that figure?"             ║
║  · "What makes this timeline so critical for you?"           ║
║  · "How does this help us both get what we need?"            ║
║  → Forces them to solve your problem.                        ║
║                                                              ║
║  FRAMING  (Bucket Technique)                                 ║
║  · Divide complex deals into sub-buckets where both         ║
║    parties can declare a partial win.                        ║
║  · Write their victory speech before they do.                ║
║  · Never negotiate on a single variable — lock-in           ║
║    at least 3 attributes to enable wise trades.              ║
║                                                              ║
║  STRATEGIC AMBIGUITY                                         ║
║  · Use only when both parties want a deal and need          ║
║    political cover. Never when incentives diverge.           ║
║  · Imprecise language as a bridge, not a trap.               ║
║                                                              ║
║  BLACK SWANS                                                 ║
║  · Listen for what is NOT said.                              ║
║  · Off-hand comments, pauses, hesitations.                   ║
║  · Ask: "What's making this particularly important           ║
║    right now?" — the answer is usually the Black Swan.       ║
║  · Black Swans live in conversation, not in Google.          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
}

// ═══════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════

const cmd   = process.argv[2];
const flags = parseArgs(process.argv.slice(3));

const COMMANDS = {
  new:      () => cmdNew(flags),
  sessions: () => cmdSessions(),
  offer:    () => cmdOffer(flags),
  counter:  () => cmdCounter(flags),
  status:   () => cmdStatus(flags),
  accept:   () => cmdAccept(flags),
  walk:     () => cmdWalk(flags),
  tactics:  () => cmdTactics(),
};

if (!cmd || !COMMANDS[cmd]) {
  console.log([
    '',
    'Usage: deal-maker.mjs <command> [options]',
    '',
    '  new        Create a negotiation session',
    '  sessions   List all sessions',
    '  offer      Submit an opponent\'s offer for evaluation',
    '  counter    Generate a stochastic counter-offer',
    '  status     Show session state + round history',
    '  accept     Accept the last opponent offer  (--yes I_ACCEPT_DEAL)',
    '  walk       Walk away from negotiation',
    '  tactics    Print tactical reference cheat-sheet',
    '',
  ].join('\n'));
  process.exit(cmd ? 1 : 0);
}

COMMANDS[cmd]();
