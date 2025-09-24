# Broken-Glass Runbook: Encryption Key & Secret Rotation

This runbook captures the steps engineering should follow when a rapid
rotation of encryption keys or application secrets is required (e.g. after a
suspected compromise). The procedure assumes production deployments store
secrets in a managed KMS-backed service (AWS Secrets Manager, Hashicorp Vault,
etc.) and that fallbacks rely on the encrypted local store for development.

## 1. Preparation

1. **Identify impacted credentials**
   - Artifact encryption key (`artifact-encryption-key`)
   - AI payload encryption key (`ai-payload-encryption-key`)
   - OpenAI / model API keys (`openai`)
   - JWT signing secret (`jwt`)

2. **Notify stakeholders**
   - Engineering on-call
   - Compliance / security officer
   - Customer success (to coordinate comms if downtime is expected)

3. **Snapshot state**
   - Capture encrypted backups of the chart artifact directory and database.
   - Verify monitoring dashboards for error budgets / alerting.

## 2. Rotate the managed secret

1. In the secrets manager create a new version of the affected secret.
   - For encryption keys generate a new 32-byte key and base64 encode it.
   - Set the metadata fields (rotatedAt/version) for audit tracking.

2. Update the environment variables or secret references used by the
   deployment platform (e.g. Kubernetes `Secret`, ECS task definition).

3. For encryption keys run the helper CLI in the maintenance container to
   re-encrypt persisted data:

   ```bash
   python -m backend.scripts.reencrypt_artifacts --key-type artifact
   python -m backend.scripts.reencrypt_ai_payloads
   ```

   The scripts decrypt using the previously active key then re-encrypt using
   the new key from the secrets manager. They log progress and emit metrics.

4. Trigger a rolling restart of the backend pods once the new secret versions
   are available.

## 3. Validation

1. Run smoke tests:
   - Upload a chart and confirm the stored blob decrypts successfully.
   - Generate AI suggestions and verify `ai_json_snapshots` rows contain the
     encrypted envelope (`ciphertext`).
   - Execute the regression API health check (`pytest tests/test_security_controls.py`).

2. Monitor metrics:
   - `revenuepilot_prompt_redactions_total` should continue incrementing.
   - `revenuepilot_egress_failures_total` should remain stable (no spikes).
   - Verify `SECRET_MAX_AGE` dashboard cards reflect the new rotation date.

3. Confirm log scrubbing:
   - Inspect recent `chart_upload.saved` entries for `patient_hash` fields.
   - Ensure no raw patient identifiers appear.

## 4. Post-Rotation Cleanup

1. Revoke the previous secret version in the KMS / secrets manager once the
   deployment is stable for at least one monitoring interval.

2. Update incident tracking with:
   - Start / completion time
   - Secrets rotated
   - Validation results and any follow-up actions.

3. Schedule the next routine rotation by updating the `rotatedAt` metadata
   (default 90 days) and confirm the automation tickets are regenerated.

## 5. Contingency Plan

If encryption fails during re-encryption:

1. Halt the scripts immediately.
2. Restore encrypted backups taken in the preparation step.
3. Re-run the scripts in dry-run mode to identify corrupt artifacts.
4. Escalate to security + platform team before re-attempting rotation.

If application pods fail to start due to missing secrets:

1. Revert to the previous secret version.
2. Rollback the deployment to the last known good revision.
3. Diagnose missing permissions or configuration before retrying rotation.

---

**Remember:** document every action during a broken-glass event. Post-mortems
rely on precise timelines to confirm all PHI remained protected throughout the
rotation.

