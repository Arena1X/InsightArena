import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Query DTO for GET /markets/:id/comments.
 * Inherits page (default 1, min 1) and limit (default 20, min 1, max 100)
 * from the shared PaginationQueryDto.
 */
export class ListCommentsDto extends PaginationQueryDto {}
