import { BadRequestException, Injectable } from '@nestjs/common';
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export enum FilterCombination {
  And = 'AND',
  Or = 'OR',
}

export enum FilterFieldType {
  Address = 'address',
  Boolean = 'boolean',
  Date = 'date',
  Number = 'number',
}

export type SortDirection = 'ASC' | 'DESC';

export interface DateRangeFilter {
  from?: Date | string;
  to?: Date | string;
}

export interface NumericRangeFilter {
  min?: number | string;
  max?: number | string;
}

export interface FilterFieldConfig {
  column: string;
  type: FilterFieldType;
  sortable?: boolean;
}

export interface StatusFilterCondition {
  field: string;
  value: boolean | number | string | null;
  operator?: '=' | '!=' | 'IS' | 'IS NOT';
}

export interface EntityFilterConfig {
  fields: Record<string, FilterFieldConfig>;
  statuses?: Record<string, StatusFilterCondition[]>;
}

export interface FilteringRequest {
  dateRanges?: Record<string, DateRangeFilter>;
  statuses?: string | string[];
  numericRanges?: Record<string, NumericRangeFilter>;
  addresses?: Record<string, string | string[]>;
  booleans?: Record<string, boolean | string>;
  combination?: FilterCombination;
  sort?: {
    field: string;
    direction?: string;
  };
}

export interface FilterClause {
  sql: string;
  parameters: Record<
    string,
    boolean | Date | number | string | string[] | null
  >;
}

export interface FilterPlan {
  clauses: FilterClause[];
  combination: FilterCombination;
  sort?: {
    column: string;
    direction: SortDirection;
  };
}

const PARAM_PREFIX = 'filter';

@Injectable()
export class FilteringService {
  buildFilterPlan(
    config: EntityFilterConfig,
    request: FilteringRequest,
  ): FilterPlan {
    const clauses: FilterClause[] = [];
    const combination = request.combination ?? FilterCombination.And;
    let parameterIndex = 0;

    this.assertCombination(combination);
    this.assertKnownFilterFields(config, request);

    for (const [field, range] of Object.entries(request.dateRanges ?? {})) {
      const fieldConfig = this.getField(config, field, FilterFieldType.Date);
      const from = this.parseOptionalDate(range.from, `${field}.from`);
      const to = this.parseOptionalDate(range.to, `${field}.to`);

      if (from && to && from > to) {
        throw new BadRequestException(
          `${field}.from must be before ${field}.to`,
        );
      }

      if (from) {
        const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
        clauses.push({
          sql: `${fieldConfig.column} >= :${parameterName}`,
          parameters: { [parameterName]: from },
        });
      }

      if (to) {
        const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
        clauses.push({
          sql: `${fieldConfig.column} <= :${parameterName}`,
          parameters: { [parameterName]: to },
        });
      }
    }

    const statuses = this.normalizeArray(request.statuses);
    if (statuses.length > 0) {
      clauses.push(this.buildStatusClause(config, statuses, parameterIndex));
      parameterIndex += statuses.reduce(
        (count, status) => count + (config.statuses?.[status]?.length ?? 0),
        0,
      );
    }

    for (const [field, range] of Object.entries(request.numericRanges ?? {})) {
      const fieldConfig = this.getField(config, field, FilterFieldType.Number);
      const min = this.parseOptionalNumber(range.min, `${field}.min`);
      const max = this.parseOptionalNumber(range.max, `${field}.max`);

      if (min !== undefined && max !== undefined && min > max) {
        throw new BadRequestException(
          `${field}.min must be less than ${field}.max`,
        );
      }

      if (min !== undefined) {
        const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
        clauses.push({
          sql: `${fieldConfig.column} >= :${parameterName}`,
          parameters: { [parameterName]: min },
        });
      }

      if (max !== undefined) {
        const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
        clauses.push({
          sql: `${fieldConfig.column} <= :${parameterName}`,
          parameters: { [parameterName]: max },
        });
      }
    }

    for (const [field, value] of Object.entries(request.addresses ?? {})) {
      const fieldConfig = this.getField(config, field, FilterFieldType.Address);
      const addresses = this.normalizeArray(value).map((address) =>
        address.trim().toLowerCase(),
      );

      if (addresses.length === 0 || addresses.some((address) => !address)) {
        throw new BadRequestException(`${field} must include a valid address`);
      }

      const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
      clauses.push({
        sql: `LOWER(${fieldConfig.column}) IN (:...${parameterName})`,
        parameters: { [parameterName]: addresses },
      });
    }

    for (const [field, value] of Object.entries(request.booleans ?? {})) {
      const fieldConfig = this.getField(config, field, FilterFieldType.Boolean);
      const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
      clauses.push({
        sql: `${fieldConfig.column} = :${parameterName}`,
        parameters: {
          [parameterName]: this.parseBoolean(value, field),
        },
      });
    }

    return {
      clauses,
      combination,
      sort: this.buildSort(config, request.sort),
    };
  }

  applyFilters<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    config: EntityFilterConfig,
    request: FilteringRequest,
  ): SelectQueryBuilder<T> {
    const plan = this.buildFilterPlan(config, request);

    if (plan.clauses.length > 0) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          plan.clauses.forEach((clause, index) => {
            if (index === 0) {
              qb.where(clause.sql, clause.parameters);
              return;
            }

            if (plan.combination === FilterCombination.Or) {
              qb.orWhere(clause.sql, clause.parameters);
              return;
            }

            qb.andWhere(clause.sql, clause.parameters);
          });
        }),
      );
    }

    if (plan.sort) {
      queryBuilder.orderBy(plan.sort.column, plan.sort.direction);
    }

    return queryBuilder;
  }

  private assertKnownFilterFields(
    config: EntityFilterConfig,
    request: FilteringRequest,
  ): void {
    const requestedFields = [
      ...Object.keys(request.dateRanges ?? {}),
      ...Object.keys(request.numericRanges ?? {}),
      ...Object.keys(request.addresses ?? {}),
      ...Object.keys(request.booleans ?? {}),
    ];

    const unknownFields = requestedFields.filter(
      (field) => !Object.prototype.hasOwnProperty.call(config.fields, field),
    );

    if (unknownFields.length > 0) {
      throw new BadRequestException(
        `Unsupported filter field(s): ${unknownFields.join(', ')}`,
      );
    }
  }

  private buildStatusClause(
    config: EntityFilterConfig,
    statuses: string[],
    startParameterIndex: number,
  ): FilterClause {
    const statusMap = config.statuses ?? {};
    const parameters: FilterClause['parameters'] = {};
    let parameterIndex = startParameterIndex;

    const groups = statuses.map((status) => {
      const conditions = statusMap[status];

      if (!conditions) {
        throw new BadRequestException(`Unsupported status filter: ${status}`);
      }

      const conditionSql = conditions.map((condition) => {
        const operator = condition.operator ?? '=';
        const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
        parameters[parameterName] = condition.value;
        return `${condition.field} ${operator} :${parameterName}`;
      });

      return `(${conditionSql.join(' AND ')})`;
    });

    return {
      sql: `(${groups.join(' OR ')})`,
      parameters,
    };
  }

  private buildSort(
    config: EntityFilterConfig,
    sort: FilteringRequest['sort'],
  ): FilterPlan['sort'] {
    if (!sort) {
      return undefined;
    }

    const fieldConfig = config.fields[sort.field];
    if (!fieldConfig || fieldConfig.sortable === false) {
      throw new BadRequestException(`Unsupported sort field: ${sort.field}`);
    }

    const direction = (sort.direction ?? 'DESC').toUpperCase();
    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new BadRequestException(
        `Unsupported sort direction: ${sort.direction}`,
      );
    }

    return {
      column: fieldConfig.column,
      direction,
    };
  }

  private getField(
    config: EntityFilterConfig,
    field: string,
    expectedType: FilterFieldType,
  ): FilterFieldConfig {
    const fieldConfig = config.fields[field];

    if (!fieldConfig) {
      throw new BadRequestException(`Unsupported filter field: ${field}`);
    }

    if (fieldConfig.type !== expectedType) {
      throw new BadRequestException(
        `Filter field ${field} does not support ${expectedType} filters`,
      );
    }

    return fieldConfig;
  }

  private assertCombination(combination: FilterCombination): void {
    if (
      combination !== FilterCombination.And &&
      combination !== FilterCombination.Or
    ) {
      throw new BadRequestException(
        `Unsupported filter combination: ${combination}`,
      );
    }
  }

  private normalizeArray(value?: string | string[]): string[] {
    if (value === undefined) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  }

  private parseOptionalDate(
    value: Date | string | undefined,
    label: string,
  ): Date | undefined {
    if (value === undefined) {
      return undefined;
    }

    const parsed = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${label} must be a valid date`);
    }

    return parsed;
  }

  private parseOptionalNumber(
    value: number | string | undefined,
    label: string,
  ): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    const parsed = typeof value === 'number' ? value : Number(value);

    if (Number.isNaN(parsed)) {
      throw new BadRequestException(`${label} must be a valid number`);
    }

    return parsed;
  }

  private parseBoolean(value: boolean | string, field: string): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }

    throw new BadRequestException(`${field} must be a boolean`);
  }
}
