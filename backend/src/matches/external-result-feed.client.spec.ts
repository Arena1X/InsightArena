import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { HttpExternalResultFeedClient } from './external-result-feed.client';

describe('HttpExternalResultFeedClient', () => {
  it('uses the configured feed URL and credential and responds to config changes', async () => {
    let url = 'https://feed-one.test/results';
    const config = {
      getOrThrow: jest.fn(() => url),
      get: jest.fn(() => 'secret'),
    } as unknown as ConfigService;
    const http = {
      get: jest.fn(() => of({ data: [] })),
    } as unknown as HttpService;
    const client = new HttpExternalResultFeedClient(http, config);

    await client.fetchResults();
    url = 'https://feed-two.test/results';
    await client.fetchResults();

    expect(http.get).toHaveBeenNthCalledWith(
      1,
      'https://feed-one.test/results',
      { headers: { Authorization: 'Bearer secret' } },
    );
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      'https://feed-two.test/results',
      { headers: { Authorization: 'Bearer secret' } },
    );
  });
});
