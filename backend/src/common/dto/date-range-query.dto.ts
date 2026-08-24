import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const DEFAULT_DATE_RANGE_DAYS = 30;
export const MAX_DATE_RANGE_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function parseIsoDate(value: string): Date | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date;
}

@ValidatorConstraint({ name: 'ValidAnalyticsDateRange', async: false })
export class ValidAnalyticsDateRangeConstraint implements ValidatorConstraintInterface {
  private message = 'Invalid date range';

  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as DateRangeQueryDto;
    const now = new Date();

    const fromDate = dto.from ? parseIsoDate(dto.from) : undefined;
    const toDate = dto.to ? parseIsoDate(dto.to) : undefined;

    if (dto.from && !fromDate) {
      this.message = 'from must be a valid ISO-8601 datetime';
      return false;
    }

    if (dto.to && !toDate) {
      this.message = 'to must be a valid ISO-8601 datetime';
      return false;
    }

    if (fromDate && fromDate > now) {
      this.message = 'from must not be in the future';
      return false;
    }

    if (toDate && toDate > now) {
      this.message = 'to must not be in the future';
      return false;
    }

    const resolvedTo = toDate ?? now;
    const resolvedFrom =
      fromDate ?? subtractDays(toDate ?? now, DEFAULT_DATE_RANGE_DAYS);

    if (resolvedFrom > resolvedTo) {
      this.message = 'from must be before to';
      return false;
    }

    return true;
  }

  defaultMessage(): string {
    return this.message;
  }
}

export function clampAnalyticsDateRange(
  from: Date,
  to: Date,
): { from: Date; to: Date } {
  const maxFrom = subtractDays(to, MAX_DATE_RANGE_DAYS);
  if (from < maxFrom) {
    return { from: maxFrom, to };
  }

  return { from, to };
}

export class DateRangeQueryDto {
  @ApiPropertyOptional({
    description:
      'Start of the time window (ISO-8601 datetime). Defaults to 30 days before `to`, or 30 days before now when both bounds are omitted.',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;

  @ApiPropertyOptional({
    description:
      'End of the time window (ISO-8601 datetime). Defaults to now when omitted.',
    example: '2026-01-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;

  @ValidateIf(
    (dto: DateRangeQueryDto) => dto.from !== undefined || dto.to !== undefined,
  )
  @Validate(ValidAnalyticsDateRangeConstraint)
  private readonly rangeValidation?: unknown;

  resolveRange(reference: Date = new Date()): { from: Date; to: Date } {
    const to = this.to ? new Date(this.to) : new Date(reference);
    const from = this.from
      ? new Date(this.from)
      : subtractDays(this.to ? to : reference, DEFAULT_DATE_RANGE_DAYS);

    return clampAnalyticsDateRange(from, to);
  }
}
