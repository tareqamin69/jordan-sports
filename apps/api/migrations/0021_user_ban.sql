-- 0021: a permanent ban next to the (temporary) suspension (docs/rbac-plan.md §7.5).
ALTER TABLE identity.users DROP CONSTRAINT users_status_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'banned'));
