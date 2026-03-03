# Changelog

All notable changes to deal-maker will be documented in this file.

## [1.0.1] - 2026-03-02

### Fixed
- **Critical**: Fixed `--force-below-batna` override logic in `accept` command. The flag was checked *after* exit, making it impossible to accept deals below BATNA threshold. Now correctly allows override when flag is provided.
- **Critical**: Fixed directory creation on startup. `mkdirSync` was imported but never called, causing crashes when writing to `sessions.json` or `audit.jsonl` if the `scripts/` directory didn't exist.
- **Critical**: Fixed corrupted JSON crash. `loadSessions()` had no error handling for invalid `sessions.json`, permanently breaking the tool on corruption. Now catches errors, warns user, and returns empty sessions.
- **High**: Fixed below-BATNA acceptance without warning. `cmdAccept` accepted deals when `decision === 'BELOW_BATNA'` with no protection. Now blocks acceptance unless `--force-below-batna` is provided.
- **Medium**: Fixed counter not persisted on round 1. Opening anchor was never saved to session history because `cmdCounter` only attached to previous rounds. Now creates initial round record.
- **Medium**: Fixed input validation. `--sigma` and `--max-rounds` accepted invalid values (negative, zero, NaN). Now validates bounds and rejects invalid inputs with clear error messages.
- **Medium**: Fixed Bayesian variance floor. After many rounds, opponent RP prior variance converged to 0, freezing learning. Added `1e-6` floor to prevent permanent convergence.
- **Low**: Removed dead variable `u` in `cmdOffer` and cleaned up utility display.
- **Low**: Fixed architectural violation: `cmdCounter` now passes sanitized attributes (without `rp`, `anchor`, `beta`) to evaluator to maintain dual-agent separation.
- **Low**: Fixed unsanitized `--reason` in `walk` command. Now truncates to 500 chars and escapes control characters.

### Security
- **Enhanced injection detection**: Added 5 new patterns to catch common evasion techniques (expose, show, print, display, tell, share, what is your, lowest, walk-away).
- **Added Unicode normalization**: All injection patterns now apply Unicode normalization (NFKC) before matching to catch confusable characters.
- **Added startup security warning**: `cmdNew` now prints a warning about unencrypted storage of sessions.json and audit.jsonl, reminding users to set filesystem permissions.

### Added
- **smoke-test.mjs**: Comprehensive end-to-end test covering full negotiation workflow (create, counter, offer, accept, status).
- **CI/CD pipeline**: GitHub Actions workflow tests against Node.js 18, 20, 22.
- **.gitignore**: Properly excludes sensitive session data and audit logs.
- **Complete documentation**: Comprehensive README with architecture, all commands, attribute schema, mathematical foundations, security notes, and real-world examples.
- **Production Checklist**: Documentation of verification steps for production deployments.

### Changed
- Updated command examples in SKILL.md for OpenClaw {baseDir} compatibility.
- Improved error messages throughout for clarity.
- Enhanced audit logging with more detailed round information.

### Known Limitations
1. Unencrypted at rest — sessions.json and audit.jsonl are plaintext
2. Regex-based injection detection is not foolproof
3. Uniform priors — assumes opponent RP is uniform over [min, max]
4. No cross-session learning — each negotiation starts fresh
5. Single-process — race conditions if multiple instances access same sessions.json
6. Linear utility only — non-linear preferences not supported

### Security Notes
- **Filesystem permissions**: Restrict access to `scripts/sessions.json` and `scripts/audit.jsonl` with `chmod 600`
- **Storage**: Consider encrypted filesystem or sandboxed environment
- **Audit review**: Regularly check `audit.jsonl` for unusual patterns
- **Injection defense**: Regex patterns catch 21 known attack vectors but creative evasion may bypass

---

## [1.0.0] - Initial Release

### Initial Features
- ✅ Dual-agent architecture (Evaluator + Negotiator)
- ✅ MAUT utility theory multi-attribute scoring
- ✅ Bayesian opponent RP estimation with Kalman updates
- ✅ Stochastic concession curves (power-law with Gaussian noise)
- ✅ Prompt injection detection (21 regex patterns)
- ✅ BATNA protection and override capability
- ✅ Full audit trail to audit.jsonl
- ✅ Tactical reference guide
- ✅ Zero external dependencies (Node.js built-ins only)
- ✅ Support for Boulware/Conceder negotiation strategies via beta parameter
- ✅ Multi-round negotiation sessions with full history tracking

### Commands
- `new` — Create negotiation session with attributes
- `counter` — Generate stochastic counter-offer
- `offer` — Submit opponent offer for evaluation
- `status` — Show session state and history
- `sessions` — List all sessions
- `accept` — Accept offer and close session (with BATNA safety)
- `walk` — Walk away from negotiation
- `tactics` — Print FBI negotiation tactics reference

### Documentation
- SKILL.md with full command reference
- package.json with proper Node.js engine constraints
- Attribute schema with MAUT weighting system
- Mathematical foundations (MAUT formulas, concession curves, Bayesian updates)
- Security and safety guidelines
