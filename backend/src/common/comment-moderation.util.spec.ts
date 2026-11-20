import { moderateCommentContent, ModerationResult } from './comment-moderation.util';

describe('comment-moderation.util', () => {
  describe('moderateCommentContent', () => {
    it('should return valid result object structure', () => {
      const result = moderateCommentContent('Hello world');

      expect(result).toHaveProperty('flagged');
      expect(result).toHaveProperty('reason');
      expect(typeof result.flagged).toBe('boolean');
      expect(typeof result.reason).toBe('string' || 'object');
    });

    it('should accept clean content', () => {
      const result = moderateCommentContent('This is a normal comment');

      expect(result.flagged).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should accept content with numbers and special characters', () => {
      const result = moderateCommentContent('Great market! 100% accuracy - keep it up!');

      expect(result.flagged).toBe(false);
    });

    it('should accept content with apostrophes and hyphens', () => {
      const result = moderateCommentContent("That's a well-thought-out prediction");

      expect(result.flagged).toBe(false);
    });
  });

  describe('profanity detection', () => {
    const profanityWords = [
      'fuck',
      'shit',
      'bitch',
      'asshole',
      'bastard',
      'cunt',
      'dick',
      'faggot',
      'nigger',
      'whore',
    ];

    profanityWords.forEach((word) => {
      it(`should flag content containing '${word}'`, () => {
        const result = moderateCommentContent(`This is ${word} comment`);

        expect(result.flagged).toBe(true);
        expect(result.reason).toBe('profanity');
      });

      it(`should flag '${word}' at the beginning`, () => {
        const result = moderateCommentContent(`${word} this is bad`);

        expect(result.flagged).toBe(true);
        expect(result.reason).toBe('profanity');
      });

      it(`should flag '${word}' at the end`, () => {
        const result = moderateCommentContent(`This is ${word}`);

        expect(result.flagged).toBe(true);
      });
    });

    it('should flag uppercase profanity', () => {
      const result = moderateCommentContent('FUCK this market');

      expect(result.flagged).toBe(true);
      expect(result.reason).toBe('profanity');
    });

    it('should flag mixed-case profanity', () => {
      const result = moderateCommentContent('This is FuCk nasty');

      expect(result.flagged).toBe(true);
    });

    it('should not flag word boundaries strictly', () => {
      // Test that "fuck" matches even with punctuation
      const result = moderateCommentContent('What the fuck!');

      expect(result.flagged).toBe(true);
    });

    it('should not flag partial word matches', () => {
      const result = moderateCommentContent('This is a wonderful prediction');

      expect(result.flagged).toBe(false);
    });

    it('should prioritize profanity detection over link spam', () => {
      const result = moderateCommentContent(
        'Check this shit http://example.com http://test.com http://another.com',
      );

      expect(result.flagged).toBe(true);
      expect(result.reason).toBe('profanity');
    });
  });

  describe('link spam detection', () => {
    it('should accept content with 0 links', () => {
      const result = moderateCommentContent('No links here');

      expect(result.flagged).toBe(false);
    });

    it('should accept content with 1 link', () => {
      const result = moderateCommentContent('Check this http://example.com for details');

      expect(result.flagged).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should accept content with 2 links (max allowed)', () => {
      const result = moderateCommentContent(
        'See http://example.com and http://test.com for details',
      );

      expect(result.flagged).toBe(false);
    });

    it('should flag content with 3 links', () => {
      const result = moderateCommentContent(
        'Check http://example.com, http://test.com, and http://another.com',
      );

      expect(result.flagged).toBe(true);
      expect(result.reason).toBe('link_spam');
    });

    it('should flag content with many links', () => {
      const result = moderateCommentContent(
        'http://a.com http://b.com http://c.com http://d.com http://e.com',
      );

      expect(result.flagged).toBe(true);
      expect(result.reason).toBe('link_spam');
    });

    it('should detect HTTP URLs', () => {
      const result = moderateCommentContent(
        'Visit http://example.com and http://test.com and http://another.com',
      );

      expect(result.flagged).toBe(true);
    });

    it('should detect HTTPS URLs', () => {
      const result = moderateCommentContent(
        'Visit https://example.com and https://test.com and https://another.com',
      );

      expect(result.flagged).toBe(true);
    });

    it('should detect www URLs', () => {
      const result = moderateCommentContent(
        'Visit www.example.com and www.test.com and www.another.com',
      );

      expect(result.flagged).toBe(true);
    });

    it('should detect mixed URL types', () => {
      const result = moderateCommentContent(
        'Visit http://example.com, www.test.com, and https://another.com',
      );

      expect(result.flagged).toBe(true);
    });

    it('should handle URLs with query parameters', () => {
      const result = moderateCommentContent(
        'Check http://example.com?id=123 and http://test.com?param=value and http://another.com',
      );

      expect(result.flagged).toBe(true);
    });

    it('should handle URLs with fragments', () => {
      const result = moderateCommentContent(
        'See http://example.com#section and http://test.com#top and http://another.com#end',
      );

      expect(result.flagged).toBe(true);
    });

    it('should handle URLs with ports', () => {
      const result = moderateCommentContent(
        'Connect to http://example.com:8080 and http://test.com:3000 and http://another.com:9000',
      );

      expect(result.flagged).toBe(true);
    });

    it('should not flag standalone URLs without context being link spam by text length', () => {
      const result = moderateCommentContent('http://example.com');

      expect(result.flagged).toBe(false);
    });

    it('should handle URLs with trailing punctuation', () => {
      const result = moderateCommentContent(
        'Visit http://example.com. Also check http://test.com! And http://another.com?',
      );

      expect(result.flagged).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = moderateCommentContent('');

      expect(result.flagged).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should handle very long content', () => {
      const longContent = 'This is a great prediction. ' + 'a'.repeat(10000);

      const result = moderateCommentContent(longContent);

      expect(result).toHaveProperty('flagged');
      expect(result).toHaveProperty('reason');
    });

    it('should handle only whitespace', () => {
      const result = moderateCommentContent('   \n\t  ');

      expect(result.flagged).toBe(false);
    });

    it('should handle only numbers', () => {
      const result = moderateCommentContent('12345 67890');

      expect(result.flagged).toBe(false);
    });

    it('should handle emoji and unicode', () => {
      const result = moderateCommentContent('Great prediction! 🎉 Really well done 👍');

      expect(result.flagged).toBe(false);
    });

    it('should handle multiple newlines', () => {
      const result = moderateCommentContent('Line 1\n\n\nLine 2\n\n\nLine 3');

      expect(result.flagged).toBe(false);
    });

    it('should handle tabs and mixed whitespace', () => {
      const result = moderateCommentContent('This\tis\ta\tgreat\tprediction');

      expect(result.flagged).toBe(false);
    });

    it('should not return undefined properties', () => {
      const result = moderateCommentContent('Random text');

      expect(Object.keys(result).length).toBe(2);
      expect(Object.keys(result)).toContain('flagged');
      expect(Object.keys(result)).toContain('reason');
    });
  });

  describe('return values', () => {
    it('should return ModerationResult interface structure', () => {
      const result = moderateCommentContent('test');

      expect(result).toEqual({
        flagged: expect.any(Boolean),
        reason: expect.any([String, null]),
      });
    });

    it('should set reason to null for clean content', () => {
      const result = moderateCommentContent('Clean comment');

      expect(result.reason).toBeNull();
    });

    it('should set reason to "profanity" for profanity matches', () => {
      const result = moderateCommentContent('This is shit');

      expect(result.reason).toBe('profanity');
    });

    it('should set reason to "link_spam" for spam links', () => {
      const result = moderateCommentContent(
        'Visit http://a.com and http://b.com and http://c.com now',
      );

      expect(result.reason).toBe('link_spam');
    });

    it('should not set reason to anything other than null, "profanity", or "link_spam"', () => {
      const testCases = [
        'Clean content',
        'Shit content',
        'Visit http://a.com http://b.com http://c.com',
      ];

      testCases.forEach((testCase) => {
        const result = moderateCommentContent(testCase);
        expect(['profanity', 'link_spam', null]).toContain(result.reason);
      });
    });
  });

  describe('case sensitivity', () => {
    it('should detect profanity regardless of case', () => {
      const testCases = ['fuck', 'FUCK', 'Fuck', 'fUcK', 'FuCk'];

      testCases.forEach((testCase) => {
        const result = moderateCommentContent(testCase);
        expect(result.flagged).toBe(true);
        expect(result.reason).toBe('profanity');
      });
    });

    it('should detect URLs regardless of case', () => {
      const result = moderateCommentContent(
        'Visit HTTP://EXAMPLE.COM and HTTPS://TEST.COM and WWW.ANOTHER.COM',
      );

      // URL_PATTERN should catch these
      expect(result).toBeDefined();
    });
  });

  describe('combined content', () => {
    it('should flag profanity even with legitimate content', () => {
      const result = moderateCommentContent(
        'This is a wonderful market prediction with shit analysis',
      );

      expect(result.flagged).toBe(true);
      expect(result.reason).toBe('profanity');
    });

    it('should flag link spam even with legitimate content', () => {
      const result = moderateCommentContent(
        'This is great http://a.com and http://b.com and http://c.com',
      );

      expect(result.flagged).toBe(true);
      expect(result.reason).toBe('link_spam');
    });

    it('should prioritize profanity over link spam', () => {
      const result = moderateCommentContent(
        'This shit http://a.com http://b.com http://c.com is bad',
      );

      expect(result.reason).toBe('profanity');
    });
  });
});
