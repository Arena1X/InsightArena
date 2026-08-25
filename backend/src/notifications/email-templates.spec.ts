import {
  EmailTemplateValidationError,
  renderEmailTemplate,
  validateEmailTemplateContext,
} from './email-templates';

describe('email-templates', () => {
  describe('validateEmailTemplateContext', () => {
    it('throws in strict mode when required variables are missing', () => {
      expect(() =>
        validateEmailTemplateContext(
          'event_created',
          { eventTitle: 'World Cup' },
          { strict: true },
        ),
      ).toThrow(EmailTemplateValidationError);

      try {
        validateEmailTemplateContext('event_created', {}, { strict: true });
      } catch (error) {
        expect(error).toBeInstanceOf(EmailTemplateValidationError);
        expect((error as EmailTemplateValidationError).missingFields).toEqual(
          expect.arrayContaining(['eventTitle', 'inviteCode']),
        );
      }
    });

    it('does not throw in non-strict mode when variables are missing', () => {
      expect(() =>
        validateEmailTemplateContext('event_won', {}, { strict: false }),
      ).not.toThrow();
    });
  });

  describe('renderEmailTemplate', () => {
    it('uses safe fallbacks in non-strict mode instead of blank placeholders', () => {
      const rendered = renderEmailTemplate('event_created', {});

      expect(rendered.subject).toContain('Event');
      expect(rendered.html).not.toContain('undefined');
      expect(rendered.text).not.toContain('undefined');
    });

    it('throws in strict mode rather than shipping broken emails', () => {
      expect(() =>
        renderEmailTemplate(
          'match_result_available',
          { matchHomeTeam: 'Arsenal' },
          { strict: true },
        ),
      ).toThrow(EmailTemplateValidationError);
    });

    it('renders grouped digest content with an overflow summary', () => {
      const rendered = renderEmailTemplate('digest', {
        digestFrequency: 'daily',
        digestPeriod: '2024-01-15',
        digestGroups: [
          {
            category: 'Markets',
            items: [{ title: 'Market A', message: 'Updated odds' }],
          },
        ],
        digestOverflowCount: 3,
      });

      expect(rendered.html).toContain('Markets');
      expect(rendered.html).toContain('…and 3 more');
      expect(rendered.text).toContain('…and 3 more');
    });
  });
});
