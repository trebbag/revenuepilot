# Production Database & RDS Operations

This guide documents how RevenuePilot should be deployed on Amazon RDS for
PostgreSQL, how runtime credentials are managed, and the operational
playbooks for migrations and validation. It complements the high-level
infrastructure guidance in the main handbook.

## Provisioning the RDS instance

1. **Create a Multi-AZ PostgreSQL instance** using the production engine
   version. Use the "Production" template in the RDS console so
   `StorageEncrypted` is enabled by default. Choose an AWS KMS CMK that is
   scoped to the deployment account; back up the key policy and enable
   automatic rotation.
2. **Automated backups** must be enabled with a retention window of at
   least 7 days (14 is preferred) so point-in-time recovery (PITR) can roll
   back accidental migrations. Turn on copy tags to snapshots and schedule
   daily snapshots outside the primary maintenance window.
3. **Parameter & option groups** should enforce TLS. Set `rds.force_ssl = 1`
   and reboot after the parameter group is applied. When uploading the
   CA bundle to application hosts, use the current certificate chain
   (`rds-ca-rsa2048-g1`). Download it from Amazon's trust store and track
   the path in configuration management so upgrades can be coordinated.
4. **Performance insights and enhanced monitoring** should stream into
   CloudWatch for query analysis. Enable RDS log exports for PostgreSQL
   `postgresql`, `upgrade`, and `slowquery` logs so they can be shipped to
   the central logging account.
5. **Maintenance** – Align the RDS maintenance window with application
   maintenance to avoid surprise restarts. Always stage version upgrades in
   a pre-production environment with a recent snapshot restored from
   production.

## Networking & access control

- Place the instance in **private subnets** across at least two availability
  zones. There should be no public IP; access flows through the application
  subnets or a jump host with MFA.
- Security groups must restrict ingress to TCP 5432 from the application
  security group(s) only. Deny default VPC security group traffic and use
  network ACLs to block arbitrary egress.
- Use a **separate subnet group** for RDS to decouple database routing from
  web tier scaling. Ensure outbound internet access is handled through
  controlled NAT gateways if patching or package updates are required.
- Attach an IAM role to the EC2/ECS tasks that require database access so
  the instances can retrieve secrets without embedding credentials.

## Logging & audit expectations

- Enable CloudWatch log exports for PostgreSQL error, general, and slow
  query logs. Ship them to the centralized log account with retention that
  matches compliance requirements.
- CloudTrail should already capture all RDS API calls. Add metric filters
  for sensitive events (parameter changes, snapshot sharing, deletion).
- Subscribe to RDS event notifications (SNS/Slack) for failovers, backup
  failures, and pending maintenance actions.
- Capture Enhanced Monitoring (1–5s granularity) and Performance Insights
  metrics for correlation with application telemetry.

## Database roles & secrets management

Create separate PostgreSQL roles for schema migrations and application
traffic:

- `migration` – Owns schemas and can perform DDL/DML. It is the only role
  permitted to run Alembic migrations.
- `app_user` – Has `SELECT`, `INSERT`, `UPDATE`, and `DELETE` access on
  application schemas plus `USAGE` on sequences. It cannot alter schemas or
  manage extensions.

Store credentials in AWS Secrets Manager (preferred) or SSM Parameter Store
(Advanced parameters) with automatic rotation. Recommended secret shape:

```json
{
  "host": "prod-revenuepilot.xxxxxx.us-east-1.rds.amazonaws.com",
  "port": 5432,
  "database": "revenuepilot",
  "migration": {
    "username": "migration",
    "password": "..."
  },
  "app_user": {
    "username": "app_user",
    "password": "..."
  }
}
```

Set the rotation lambda to refresh both credentials on the same cadence (90
or 120 days) and update the secret metadata (`VersionId`, `rotatedAt`).
Rotation functions must grant the `migration` role its schema privileges
again after the password change.

### Sourcing secrets at runtime (without logging)

Application services and the migration runner should retrieve secrets in
memory and avoid printing them. Example bash snippet for a one-off
migration:

```bash
#!/usr/bin/env bash
set -euo pipefail
set +x  # disable shell tracing to avoid leaking secrets

secret_json="$(aws secretsmanager get-secret-value \
  --secret-id revenuepilot/prod/database \
  --query 'SecretString' --output text)"

export DATABASE_URL="$(jq -r \
  '"postgresql://\(.migration.username):\(.migration.password)@\(.host):\(.port)/\(.database)?sslmode=verify-full"' \
  <<<"$secret_json")"

# Load the CA certificate before running migrations
export PGSSLROOTCERT=/etc/revenuepilot/certs/rds-ca-rsa2048-g1.pem
export PGSSLMODE=verify-full

backend/venv/bin/python -m alembic -c backend/alembic/alembic.ini upgrade head
```

This pattern keeps the password in memory, disables shell tracing, and does
not emit the secret to stdout. Application containers should follow the same
approach with IAM roles and the AWS SDK rather than embedding credentials in
configuration files.

## Runtime database environment variables

The backend honours the following environment variables when connecting to
PostgreSQL (recommended production defaults in parentheses):

| Variable | Purpose | Suggested value |
| --- | --- | --- |
| `DATABASE_URL` | Full SQLAlchemy URL built from the secret | `postgresql://app_user:***@host:5432/revenuepilot` |
| `PGSSLMODE` | PostgreSQL TLS enforcement | `verify-full` |
| `PGSSLROOTCERT` | Path to CA bundle (`rds-ca-rsa2048-g1`) | `/etc/revenuepilot/certs/rds-ca-rsa2048-g1.pem` |
| `PGCONNECT_TIMEOUT` | Seconds to wait for initial connection | `10` |
| `DB_POOL_SIZE` | SQLAlchemy `pool_size` (steady connections) | `10` for web, `2` for workers |
| `DB_MAX_OVERFLOW` | Temporary overflow connections | `5` |
| `DB_POOL_RECYCLE_SECONDS` | Recycle connections before RDS timeout | `900` |
| `DB_STATEMENT_TIMEOUT_MS` | Statement timeout passed via `SET` | `30000` |
| `DB_HEALTHCHECK_TIMEOUT_MS` | Timeout for health probes | `5000` |

Set these variables via your orchestration layer (ECS task definition, EC2
systemd unit, or Kubernetes secret) after retrieving the credentials. Ensure
`PGSSLROOTCERT` points to a file distributed with the deployment artefact or
placed via configuration management.

## Migration runbook

Follow this process for every production migration:

1. **Pre-checks**
   - Confirm automated backups are healthy and create a manual snapshot
     labeled `pre-migration-<date>`. Verify PITR retention meets policy.
   - Review the Alembic revision history and confirm the target commit has
     been applied in staging.
   - Notify stakeholders of the migration window and put the application in
     maintenance mode if the change is disruptive.
2. **Prepare credentials & environment**
   - Assume the deployment IAM role with permission to read the database
     secret.
   - Use the secret retrieval snippet above to export `DATABASE_URL` for the
     `migration` role. Ensure `PGSSLROOTCERT` is on disk.
3. **Run the migration**
   - Execute `backend/venv/bin/python -m alembic -c backend/alembic/alembic.ini upgrade head`.
   - Monitor the command output for warnings. If the process is long-running,
     keep an eye on the RDS session via Performance Insights.
4. **Validate data**
   - Run targeted row counts for high-risk tables, e.g.:
     ```sql
     SELECT COUNT(*) FROM encounters;
     SELECT COUNT(*) FROM notes WHERE status = 'finalized';
     SELECT COUNT(*) FROM suggestions WHERE created_at >= current_date - INTERVAL '1 day';
     ```
   - Compare results with pre-migration numbers or analytics dashboards.
5. **Smoke tests**
   - Re-enable the application and run UI/API smoke tests: login, load a
     patient chart, create/save a note, and trigger an AI suggestion. Watch
     application logs and CloudWatch metrics for errors.
6. **Post-migration**
   - Remove maintenance mode, announce completion, and document the Alembic
     revision applied plus validation evidence.
   - Update the change log or ticket with the snapshot ID for traceability.
7. **Rollback plan**
   - If the migration fails before completion, run
     `backend/venv/bin/python -m alembic -c backend/alembic/alembic.ini downgrade -1`
     (or the appropriate revision) if the migration is reversible.
   - If data integrity is compromised, restore from the manual snapshot or
     perform PITR to the timestamp immediately before the migration. Point
     applications to the restored instance and re-run the last successful
     migration revision.
   - Document the incident and capture log excerpts to feed back into future
     change reviews.

Adhering to this runbook ensures migrations remain auditable and reversible
while keeping production downtime minimal.
