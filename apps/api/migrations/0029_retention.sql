-- 0029: data minimisation (docs/compliance-checklist.md). The worker deletes old sign-in codes,
-- which hold a phone number, once they can no longer be used or audited.
GRANT DELETE ON identity.otp_challenges TO js_app;
