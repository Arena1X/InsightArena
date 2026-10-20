import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to enforce append-only behavior for admin_audit_logs table.
 *
 * This migration creates PostgreSQL triggers that prevent:
 * 1. Updates to any audit log record
 * 2. Deletions of any audit log record
 *
 * The triggers ensure audit logs remain immutable for compliance and security.
 */
export class AdminAuditLogAppendOnly1774680000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create a function that prevents updates
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_admin_audit_log_update()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Audit log entries are immutable and cannot be updated'
          USING ERRCODE = '23506';
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create a function that prevents deletions
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_admin_audit_log_delete()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Audit log entries are immutable and cannot be deleted'
          USING ERRCODE = '23506';
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to prevent updates
    await queryRunner.query(`
      CREATE TRIGGER prevent_admin_audit_log_update_trigger
      BEFORE UPDATE ON admin_audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION prevent_admin_audit_log_update();
    `);

    // Create trigger to prevent deletions
    await queryRunner.query(`
      CREATE TRIGGER prevent_admin_audit_log_delete_trigger
      BEFORE DELETE ON admin_audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION prevent_admin_audit_log_delete();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS prevent_admin_audit_log_delete_trigger ON admin_audit_logs;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS prevent_admin_audit_log_update_trigger ON admin_audit_logs;
    `);

    // Drop functions
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS prevent_admin_audit_log_delete();
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS prevent_admin_audit_log_update();
    `);
  }
}
