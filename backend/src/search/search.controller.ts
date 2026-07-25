import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import {
  GlobalSearchDto,
  GlobalSearchResponseDto,
  SuggestionsResponseDto,
} from './dto/global-search.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { SuggestQueryDto, SuggestResponseDto } from './dto/suggest-query.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('suggestions')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  @ApiOperation({
    summary: 'Autocomplete suggestions for markets and users (public)',
    description:
      'Returns up to 5 market titles and 5 usernames that start with the given term. ' +
      'Query must be 2-100 characters long.',
  })
  @ApiResponse({ status: 200, type: SuggestionsResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid search query' })
  async getSuggestions(
    @Query() { query }: SearchQueryDto,
  ): Promise<SuggestionsResponseDto> {
    return this.searchService.getSuggestions(query);
  }

  @Public()
  @Get('suggest')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  @ApiOperation({
    summary: 'Ranked type-ahead suggestions for a prefix (public)',
    description:
      'Returns a capped, ranked list of { id, label, type } suggestions for markets, ' +
      'users, and/or competitions matching the given prefix. Results for popular prefixes ' +
      'are cached briefly. Empty or short (<2 char) prefixes return an empty list.',
  })
  @ApiResponse({ status: 200, type: SuggestResponseDto })
  async suggest(@Query() query: SuggestQueryDto): Promise<SuggestResponseDto> {
    return this.searchService.suggest(query);
  }

  @Public()
  @Get()
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  @ApiOperation({
    summary: 'Global search across markets, users, and competitions (public)',
    description:
      'Searches across multiple entity types using a single query string. ' +
      'Results can be filtered by type and are paginated. ' +
      'Only public markets, non-banned users, and public competitions are returned. ' +
      'Query must be 2-100 characters long.',
  })
  @ApiResponse({ status: 200, type: GlobalSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid search query' })
  async search(
    @Query() query: GlobalSearchDto,
  ): Promise<GlobalSearchResponseDto> {
    return this.searchService.search(query);
  }
}
