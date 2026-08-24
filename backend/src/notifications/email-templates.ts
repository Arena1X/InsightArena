export type EmailTemplateType =
  | 'event_created'
  | 'match_result_available'
  | 'event_won'
  | 'event_cancelled'
  | 'digest';

export interface DigestItem {
  title: string;
  message: string;
}

export interface DigestGroup {
  category: string;
  items: DigestItem[];
}

export interface EmailTemplateContext {
  eventTitle?: string;
  eventId?: string;
  matchHomeTeam?: string;
  matchAwayTeam?: string;
  matchResult?: string;
  userAddress?: string;
  inviteCode?: string;
  digestFrequency?: 'daily' | 'weekly';
  digestItems?: DigestItem[];
  digestGroups?: DigestGroup[];
  digestPeriod?: string;
  digestOverflowCount?: number;
}

export interface RenderEmailTemplateOptions {
  /** When true, missing required variables throw instead of using fallbacks. */
  strict?: boolean;
}

export class EmailTemplateValidationError extends Error {
  constructor(public readonly missingFields: string[]) {
    super(
      `Missing required email template variables: ${missingFields.join(', ')}`,
    );
    this.name = 'EmailTemplateValidationError';
  }
}

const TEMPLATE_REQUIRED_FIELDS: Record<
  EmailTemplateType,
  Array<keyof EmailTemplateContext>
> = {
  event_created: ['eventTitle', 'inviteCode'],
  match_result_available: [
    'matchHomeTeam',
    'matchAwayTeam',
    'eventTitle',
    'matchResult',
  ],
  event_won: ['eventTitle'],
  event_cancelled: ['eventTitle'],
  digest: ['digestFrequency', 'digestPeriod'],
};

const TEMPLATE_FALLBACKS: Partial<
  Record<keyof EmailTemplateContext, string>
> = {
  eventTitle: 'Event',
  eventId: '',
  matchHomeTeam: 'Team A',
  matchAwayTeam: 'Team B',
  matchResult: 'Pending',
  userAddress: '',
  inviteCode: '',
  digestPeriod: '',
};

export function validateEmailTemplateContext(
  type: EmailTemplateType,
  context: EmailTemplateContext,
  options: RenderEmailTemplateOptions = {},
): void {
  const missing: string[] = [];

  for (const field of TEMPLATE_REQUIRED_FIELDS[type] ?? []) {
    const value = context[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.push(String(field));
    }
  }

  if (type === 'digest') {
    const itemCount =
      context.digestGroups?.reduce(
        (sum, group) => sum + group.items.length,
        0,
      ) ?? context.digestItems?.length ?? 0;
    if (itemCount === 0) {
      missing.push('digestItems');
    }
  }

  if (missing.length > 0 && options.strict) {
    throw new EmailTemplateValidationError(missing);
  }
}

function resolveField(
  context: EmailTemplateContext,
  field: keyof EmailTemplateContext,
  strict: boolean,
): string {
  const raw = context[field];
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    return String(raw);
  }

  if (strict) {
    throw new EmailTemplateValidationError([String(field)]);
  }

  return TEMPLATE_FALLBACKS[field] ?? '';
}

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; line-height: 1.6; }
  .container { max-width: 560px; margin: 0 auto; padding: 32px 24px; }
  .header { background: #6366f1; color: #fff; padding: 24px; border-radius: 8px 8px 0 0; }
  .content { background: #f8fafc; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none; }
  .cta { display: inline-block; background: #6366f1; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px; }
  .footer { color: #64748b; font-size: 12px; margin-top: 24px; text-align: center; }
`;

export function renderEmailTemplate(
  type: EmailTemplateType,
  context: EmailTemplateContext,
  options: RenderEmailTemplateOptions = {},
): { subject: string; html: string; text: string } {
  const strict = options.strict ?? false;
  validateEmailTemplateContext(type, context, { strict });

  switch (type) {
    case 'event_created': {
      const eventTitle = resolveField(context, 'eventTitle', strict);
      const inviteCode = resolveField(context, 'inviteCode', strict);
      return {
        subject: `Your event "${eventTitle}" is live on InsightArena`,
        html: wrapHtml(
          'Event Created',
          `<p>Your creator event <strong>${escapeHtml(eventTitle)}</strong> has been created successfully.</p>
           <p>Share your invite code <strong>${escapeHtml(inviteCode)}</strong> with participants to get started.</p>`,
        ),
        text: `Your event "${eventTitle}" is live on InsightArena. Invite code: ${inviteCode}`,
      };
    }

    case 'match_result_available': {
      const matchHomeTeam = resolveField(context, 'matchHomeTeam', strict);
      const matchAwayTeam = resolveField(context, 'matchAwayTeam', strict);
      const eventTitle = resolveField(context, 'eventTitle', strict);
      const matchResult = resolveField(context, 'matchResult', strict);
      return {
        subject: `Match result: ${matchHomeTeam} vs ${matchAwayTeam}`,
        html: wrapHtml(
          'Match Result Available',
          `<p>The match <strong>${escapeHtml(matchHomeTeam)}</strong> vs <strong>${escapeHtml(matchAwayTeam)}</strong> in event <strong>${escapeHtml(eventTitle)}</strong> has been resolved.</p>
           <p>Result: <strong>${escapeHtml(matchResult)}</strong></p>`,
        ),
        text: `Match result available for ${matchHomeTeam} vs ${matchAwayTeam}. Result: ${matchResult}`,
      };
    }

    case 'event_won': {
      const eventTitle = resolveField(context, 'eventTitle', strict);
      return {
        subject: `Congratulations! You won "${eventTitle}"`,
        html: wrapHtml(
          'You Won!',
          `<p>Congratulations! You are a verified winner of <strong>${escapeHtml(eventTitle)}</strong>.</p>
           <p>Log in to InsightArena to claim your payout.</p>`,
        ),
        text: `Congratulations! You won the event "${eventTitle}".`,
      };
    }

    case 'event_cancelled': {
      const eventTitle = resolveField(context, 'eventTitle', strict);
      return {
        subject: `Event cancelled: ${eventTitle}`,
        html: wrapHtml(
          'Event Cancelled',
          `<p>The event <strong>${escapeHtml(eventTitle)}</strong> has been cancelled by the creator.</p>
           <p>Any stakes will be refunded according to the event rules.</p>`,
        ),
        text: `The event "${eventTitle}" has been cancelled.`,
      };
    }

    case 'digest': {
      const freq = context.digestFrequency === 'weekly' ? 'Weekly' : 'Daily';
      const digestPeriod = resolveField(context, 'digestPeriod', strict);
      const groups =
        context.digestGroups ??
        (context.digestItems?.length
          ? [{ category: 'Notifications', items: context.digestItems }]
          : []);
      const displayedCount = groups.reduce(
        (sum, group) => sum + group.items.length,
        0,
      );
      const overflowCount = context.digestOverflowCount ?? 0;

      const itemsHtml = groups
        .map(
          (group) => `
          <div style="margin:16px 0 8px;">
            <h3 style="margin:0 0 8px;font-size:14px;color:#334155;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(group.category)}</h3>
            ${group.items
              .map(
                (item) =>
                  `<div style="border-left:3px solid #6366f1;padding:8px 12px;margin:8px 0;">
                     <strong>${escapeHtml(item.title)}</strong>
                     <p style="margin:4px 0 0;color:#475569;">${escapeHtml(item.message)}</p>
                   </div>`,
              )
              .join('')}
          </div>`,
        )
        .join('');

      const itemsText = groups
        .flatMap((group) =>
          group.items.map((item) => `[${group.category}] ${item.title}: ${item.message}`),
        )
        .join('\n');

      const overflowHtml =
        overflowCount > 0
          ? `<p style="margin-top:12px;color:#475569;font-size:13px;">…and ${overflowCount} more</p>`
          : '';
      const overflowText =
        overflowCount > 0 ? `\n\n…and ${overflowCount} more` : '';

      return {
        subject: `Your ${freq} InsightArena digest — ${digestPeriod}`.trimEnd(),
        html: wrapHtml(
          `${freq} Activity Digest`,
          `<p>Here's a summary of your recent activity on InsightArena:</p>
           ${itemsHtml}
           ${overflowHtml}
           <p style="margin-top:16px;color:#475569;font-size:13px;">You have ${displayedCount + overflowCount} unread notification${displayedCount + overflowCount === 1 ? '' : 's'}.</p>`,
        ),
        text: `Your ${freq.toLowerCase()} InsightArena digest:\n\n${itemsText}${overflowText}`,
      };
    }

    default:
      return {
        subject: 'InsightArena Notification',
        html: wrapHtml(
          'Notification',
          '<p>You have a new notification from InsightArena.</p>',
        ),
        text: 'You have a new notification from InsightArena.',
      };
  }
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><style>${baseStyles}</style></head>
    <body><div class="container">
      <div class="header"><h1 style="margin:0;font-size:20px;">${escapeHtml(title)}</h1></div>
      <div class="content">${body}
        <a class="cta" href="https://insightarena.app">View on InsightArena</a>
      </div>
      <div class="footer">You received this email because of your InsightArena notification preferences.</div>
    </div></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[char];
  });
}
