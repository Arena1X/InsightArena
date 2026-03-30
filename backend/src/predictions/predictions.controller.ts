import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BanGuard } from '../common/guards/ban.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PredictionsService } from './predictions.service';
import { SubmitPredictionDto } from './dto/submit-prediction.dto';
import { UpdatePredictionNoteDto } from './dto/update-prediction-note.dto';
import {
  ListMyPredictionsDto,
  PaginatedMyPredictionsResponse,
} from './dto/list-my-predictions.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { Prediction } from './entities/prediction.entity';

@ApiTags('Predictions')
@ApiBearerAuth()
@Controller('predictions')
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @Post()
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a prediction on a market' })
  @ApiResponse({
    status: 201,
    description: 'Prediction submitted',
    type: Prediction,
  })
  @ApiResponse({ status: 400, description: 'Market closed or invalid outcome' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate prediction on this market',
  })
  async submit(
    @Body() dto: SubmitPredictionDto,
    @CurrentUser() user: User,
  ): Promise<Prediction> {
    return this.predictionsService.submit(dto, user);
  }

  @Get('me')
  @ApiOperation({ summary: "Get the authenticated user's predictions" })
  @ApiResponse({
    status: 200,
    description: 'Paginated predictions with market data',
  })
  async getMyPredictions(
    @Query() query: ListMyPredictionsDto,
    @CurrentUser() user: User,
  ): Promise<PaginatedMyPredictionsResponse> {
    return this.predictionsService.findMine(user, query);
  }

  @Patch(':id/note')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update personal note on a prediction' })
  @ApiResponse({
    status: 200,
    description: 'Prediction note updated',
    type: Prediction,
  })
  @ApiResponse({
    status: 404,
    description: 'Prediction not found or not owned by user',
  })
  async updateNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePredictionNoteDto,
    @CurrentUser() user: User,
  ): Promise<Prediction> {
    return this.predictionsService.updateNote(id, dto, user);
  }
}
