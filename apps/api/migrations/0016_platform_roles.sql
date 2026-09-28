-- 0016: platform roles (docs/rbac-plan.md). `super_admin` becomes `owner`, and there is at most
-- one owner: the oldest super_admin is kept as owner, any others become admins.
ALTER TABLE identity.users DROP CONSTRAINT users_platform_role_check;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
    FROM identity.users WHERE platform_role = 'super_admin'
)
UPDATE identity.users u
   SET platform_role = CASE WHEN r.n = 1 THEN 'owner' ELSE 'admin' END
  FROM ranked r
 WHERE r.id = u.id;

ALTER TABLE identity.users
  ADD CONSTRAINT users_platform_role_check
  CHECK (platform_role IN ('owner', 'admin', 'support', 'finance'));

CREATE UNIQUE INDEX users_single_owner_idx ON identity.users ((true)) WHERE platform_role = 'owner';
