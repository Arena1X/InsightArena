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
} from './dto/global-search.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

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
      'Only public markets, non-banned users, and public competitions are returned.',
  })
  @ApiResponse({ status: 200, type: GlobalSearchResponseDto })
  async search(
    @Query() query: GlobalSearchDto,
  ): Promise<GlobalSearchResponseDto> {
    return this.searchService.search(query);
  }
}
