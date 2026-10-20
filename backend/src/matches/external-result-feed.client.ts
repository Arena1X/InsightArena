import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { WinningTeam } from './entities/match.entity';

export interface ExternalMatchResultPayload {
  externalId: string;
  homeScore: number;
  awayScore: number;
  winningTeam: WinningTeam;
}

export const EXTERNAL_RESULT_FEED_CLIENT = Symbol(
  'EXTERNAL_RESULT_FEED_CLIENT',
);

export interface ExternalResultFeedClient {
  fetchResults(): Promise<ExternalMatchResultPayload[]>;
}

@Injectable()
export class HttpExternalResultFeedClient implements ExternalResultFeedClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async fetchResults(): Promise<ExternalMatchResultPayload[]> {
    const url = this.configService.getOrThrow<string>('MATCH_RESULTS_FEED_URL');
    const credential = this.configService.get<string>(
      'MATCH_RESULTS_FEED_CREDENTIAL',
    );
    const response = await firstValueFrom(
      this.httpService.get<ExternalMatchResultPayload[]>(url, {
        headers: credential ? { Authorization: `Bearer ${credential}` } : {},
      }),
    );
    return response.data;
  }
}
