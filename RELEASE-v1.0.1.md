# v1.0.1 — Production Hotfix Release

## Production Hotfix Release

v1.0.1 addresses 10 critical bugs, security vulnerabilities, and missing functionality discovered in the initial release. All issues have been fixed, tested, and deployed.

### 🔴 Critical Fixes

- **BATNA Override Broken**: The `--force-below-batna` flag never worked due to logic ordering. Fixed to allow safe override when accepting below-BATNA deals.
- **Directory Creation Missing**: `mkdirSync` was imported but never called, causing crashes when writing session/audit files. Now creates directory on startup.
- **Corrupted JSON Crash**: No error handling for invalid `sessions.json`. Now catches, warns, and recovers gracefully.
- **Unprotected Below-BATNA Acceptance**: `cmdAccept` accepted threshold-breaking deals silently. Now enforces protection with explicit flag requirement.

### 🟡 Medium Priority Fixes

- **Counter Not Persisted (Round 1)**: Opening anchor was never saved. Now creates initial round record.
- **Input Validation Missing**: `--sigma` and `--max-rounds` accepted invalid values. Now validates bounds.
- **Bayesian Variance Floor Missing**: Opponent RP prior converged to zero after many rounds. Added `1e-6` floor.

### 🔵 Low Priority Fixes

- Dead variable cleanup in utility calculation
- Architectural separation: evaluator now receives sanitized attributes (no private RP/anchor/beta)
- Reason string escaping in `walk` command

### 🔒 Security Improvements

- **Enhanced Injection Detection**: Added 5 new pattern classes (expose, show, print, display, tell, share, "what is your", lowest, walk-away)
- **Unicode Normalization**: All injection patterns now apply NFKC normalization to catch confusable characters
- **Storage Security Warning**: New sessions now print a reminder about unencrypted data at rest

### 📦 Infrastructure & Testing

- **Smoke Tests**: New `smoke-test.mjs` with end-to-end coverage (create → counter → offer → accept)
- **CI/CD Pipeline**: GitHub Actions workflow tests across Node.js 18, 20, 22
- **Proper `.gitignore`**: Excludes sensitive session and audit data
- **Comprehensive README**: Full documentation with architecture, commands, math, and real-world examples

### 📋 Verification

All changes have been tested locally:
- ✅ Smoke tests pass (full negotiation workflow)
- ✅ BATNA override now works correctly
- ✅ Directory creation on startup verified
- ✅ Injection detection patterns validated
- ✅ Bayesian variance floor prevents prior freezing

### 📚 Documentation

- **README.md**: 600+ lines covering all features, architecture, commands, math, and security
- **CHANGELOG.md**: Complete version history and change notes
- **SKILL.md**: Updated command reference with OpenClaw compatibility

### 🚀 Deployment Ready

This release brings deal-maker from initial commit to production quality:
- All critical bugs fixed
- Security hardened
- Fully tested
- Comprehensively documented
- CI/CD pipeline in place

---

**Version**: 1.0.1
**Release Date**: 2026-03-02
**Node.js Requirement**: >=18.0.0

**To create the release on GitHub**: Visit https://github.com/KING-MOM/deal-maker/releases/new?tag=v1.0.1 and paste this content into the release description field.
