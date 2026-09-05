CREATE OR REPLACE FUNCTION prevent_identity_link_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Identity link audit records are append-only';
END;
$$;

CREATE TRIGGER identity_link_audits_reject_update_delete
BEFORE UPDATE OR DELETE ON "identity_link_audits"
FOR EACH ROW
EXECUTE FUNCTION prevent_identity_link_audit_mutation();

CREATE TRIGGER identity_link_audits_reject_truncate
BEFORE TRUNCATE ON "identity_link_audits"
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_identity_link_audit_mutation();
