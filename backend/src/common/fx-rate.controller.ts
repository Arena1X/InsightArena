import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';
import { FxRateService, FxRates } from './fx-rate.service';

@ApiTags('FX Rates')
@Controller('fx-rates')
export class FxRateController {
  constructor(private readonly fxRateService: FxRateService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get current display FX rates relative to XLM' })
  @ApiResponse({ status: 200, description: 'Current FX rates' })
  async getRates(): Promise<FxRates> {
    return this.fxRateService.getRates();
  }
}
