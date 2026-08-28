/**
 * Canonical `event_type` values written to `auth_audit_events`.
 *
 * Keep these strings stable once shipped — dashboards/alerts built on top of
 * the audit table filter on them directly.
 */
export const AuthAuditEventType = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  REFRESH_SUCCESS: 'refresh_success',
  REFRESH_FAILURE: 'refresh_failure',
  REFRESH_TOKEN_REUSE_DETECTED: 'refresh_token_reuse_detected',
  REVOKE_SUCCESS: 'revoke_success',
  REVOKE_FAILURE: 'revoke_failure',
} as const;

export type AuthAuditEventTypeValue =
  (typeof AuthAuditEventType)[keyof typeof AuthAuditEventType];

/** Outcome recorded on every auth audit event's `metadata.outcome`. */
export type AuthAuditOutcome = 'success' | 'failure';
