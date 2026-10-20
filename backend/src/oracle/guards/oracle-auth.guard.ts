import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@stellar/stellar-sdk';
import type { Request } from 'express';

@Injectable()
export class OracleAuthGuard implements CanActivate {
  private readonly logger = new Logger(OracleAuthGuard.name);
  private readonly oracleApiKey: string | undefined;
  private readonly aiAgentAddress: string | undefined;
  private readonly nodeEnv: string;
  private readonly requestCounts = new Map<
    string,
    { count: number; resetTime: number }
  >();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly RATE_LIMIT_MAX = 100; // 100 requests per minute

  constructor(private readonly configService: ConfigService) {
    this.oracleApiKey = this.configService.get<string>('ORACLE_API_KEY');
    this.aiAgentAddress = this.configService.get<string>('AI_AGENT_ADDRESS');
    this.nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const callerAddress = request.headers['x-caller-address'] as
      | string
      | undefined;

    // Log oracle API call
    this.logger.log(
      `Oracle API call from: ${callerAddress || 'unknown'}, Method: ${request.method}, Path: ${request.url}`,
    );

    // Apply rate limiting
    if (!this.checkRateLimit(callerAddress || 'unknown')) {
      this.logger.warn(
        `Rate limit exceeded for oracle endpoint from: ${callerAddress}`,
      );
      throw new UnauthorizedException('Rate limit exceeded');
    }

    // Development: API key authentication
    if (this.nodeEnv === 'development') {
      return await this.verifyApiKey(request);
    }

    // Production: Stellar wallet signature verification
    return await this.verifyStellarSignature(request, callerAddress);
  }

  private checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const record = this.requestCounts.get(identifier);

    if (!record || now > record.resetTime) {
      this.requestCounts.set(identifier, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW,
      });
      return true;
    }

    if (record.count >= this.RATE_LIMIT_MAX) {
      return false;
    }

    record.count++;
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async verifyApiKey(request: Request): Promise<boolean> {
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!this.oracleApiKey) {
      this.logger.error('Oracle API key not configured');
      throw new UnauthorizedException('Oracle API key not configured');
    }

    if (!apiKey || apiKey !== this.oracleApiKey) {
      this.logger.warn('Invalid or missing API key for oracle endpoint');
      throw new UnauthorizedException('Invalid or missing API key');
    }

    this.logger.debug('API key authentication successful');
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async verifyStellarSignature(
    request: Request,
    callerAddress?: string,
  ): Promise<boolean> {
    const signature = request.headers['x-signature'] as string | undefined;
    const message = request.headers['x-message'] as string | undefined;

    if (!signature || !message || !callerAddress) {
      this.logger.warn(
        'Missing signature, message, or caller address for Stellar verification',
      );
      throw new UnauthorizedException(
        'Missing signature, message, or caller address',
      );
    }

    try {
      // Verify the signature
      const publicKey = Keypair.fromPublicKey(callerAddress);
      const isValid = publicKey.verify(
        Buffer.from(message),
        Buffer.from(signature, 'base64'),
      );

      if (!isValid) {
        this.logger.warn(`Invalid signature from caller: ${callerAddress}`);
        throw new UnauthorizedException('Invalid signature');
      }

      // Verify caller address matches contract's AI agent address
      if (callerAddress !== this.aiAgentAddress) {
        this.logger.warn(
          `Unauthorized caller address: ${callerAddress}, expected: ${this.aiAgentAddress}`,
        );
        throw new UnauthorizedException(
          'Caller address does not match authorized AI agent',
        );
      }

      this.logger.debug(
        `Stellar signature verification successful for: ${callerAddress}`,
      );
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Signature verification error: ${error}`);
      throw new UnauthorizedException('Signature verification failed');
    }
  }
}
