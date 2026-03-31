import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FlagsService } from './flags.service';
import { CreateFlagDto } from './dto/create-flag.dto';
import { ListFlagsQueryDto } from './dto/list-flags-query.dto';

@Controller('flags')
@UseGuards(JwtAuthGuard)
export class FlagsController {
  constructor(private readonly flagsService: FlagsService) {}

  @Post()
  async createFlag(@Body() createFlagDto: CreateFlagDto, @Request() req: any) {
    return this.flagsService.createFlag(
      (req as { user: { id: string } }).user.id,
      createFlagDto,
    );
  }

  @Get('my-flags')
  async getMyFlags(@Request() req: any, @Query() query: ListFlagsQueryDto) {
    return this.flagsService.listFlags({
      ...query,
      user_id: (req as { user: { id: string } }).user.id,
    });
  }
}
