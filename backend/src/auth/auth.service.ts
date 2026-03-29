import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private challengeCache = new Map<
    string,
    { expiresAt: number; used: boolean }
  >();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  generateChallenge(stellar_address: string): string {
    const timestamp = Date.now();
    const random = randomBytes(16).toString('hex');
    const challenge = `InsightArena:nonce:${timestamp}:${random}:${stellar_address}`;

    this.logger.debug(
      `Generating challenge for ${stellar_address}: ${challenge}`,
    );

    this.challengeCache.set(challenge, {
      expiresAt: timestamp + this.TTL_MS,
      used: false,
    });

    this.cleanupExpiredChallenges();

    return challenge;
  }

  isValidChallenge(challenge: string): boolean {
    const entry = this.challengeCache.get(challenge);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.challengeCache.delete(challenge);
      return false;
    }

    return true;
  }

  removeChallenge(challenge: string): void {
    this.challengeCache.delete(challenge);
  }

  async verifyChallenge(
    stellar_address: string,
    signed_challenge: string,
  ): Promise<{ access_token: string; user: User }> {
    const user = await this.verifySignature(stellar_address, signed_challenge);

    // Sign JWT with sub: user.id
    const payload = { sub: user.id, stellar_address: user.stellar_address };
    const access_token = await this.jwtService.signAsync(payload);

    return { access_token, user };
  }

  async verifySignature(
    stellar_address: string,
    signed_challenge: string,
  ): Promise<User> {
    this.logger.debug(`Verifying challenge for ${stellar_address}`);

    // Find a valid, unused challenge for this address
    const challenge = this.findValidChallengeForAddress(stellar_address);
    if (!challenge) {
      this.logger.debug(`No valid challenge found for ${stellar_address}`);
      throw new UnauthorizedException(
        'No valid challenge found or challenge expired',
      );
    }

    this.logger.debug(`Found challenge: ${challenge}`);

    const entry = this.challengeCache.get(challenge)!;

    // Replay attack prevention: reject already-used nonces
    if (entry.used) {
      this.logger.debug(`Challenge already used for ${stellar_address}`);
      throw new UnauthorizedException('Challenge already used');
    }

    // Verify the Stellar signature cryptographically
    const isValid = this.verifyStellarSignature(
      stellar_address,
      challenge,
      signed_challenge,
    );

    this.logger.debug(`Signature valid: ${isValid}`);

    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Mark nonce as used (replay prevention)
    entry.used = true;

    // Upsert the user record
    let user = await this.usersRepository.findOneBy({ stellar_address });
    if (!user) {
      this.logger.debug(`Creating new user for ${stellar_address}`);
      user = this.usersRepository.create({ stellar_address });
    }
    user = await this.usersRepository.save(user);
    return user;
  }

  /** Finds the most recent valid (non-expired, non-used) challenge for a given address. */
  private findValidChallengeForAddress(stellar_address: string): string | null {
    const now = Date.now();
    for (const [key, entry] of this.challengeCache.entries()) {
      if (
        key.endsWith(`:${stellar_address}`) &&
        now <= entry.expiresAt &&
        !entry.used
      ) {
        return key;
      }
    }
    return null;
  }

  /**
   * Verifies a Stellar Ed25519 signature.
   * @param stellar_address  The G... public key of the signer.
   * @param challenge        The plaintext challenge that was signed.
   * @param signed_challenge Hex-encoded signature produced by Freighter.
   */
  verifyStellarSignature(
    stellar_address: string,
    challenge: string,
    signed_challenge: string,
  ): boolean {
    try {
      const keypair = Keypair.fromPublicKey(stellar_address);
      const messageBuffer = Buffer.from(challenge, 'utf-8');
      const signatureBuffer = Buffer.from(signed_challenge, 'hex');
      const isValid = keypair.verify(messageBuffer, signatureBuffer);
      return isValid;
    } catch (error) {
      this.logger.error(`Error verifying signature: ${error}`);
      return false;
    }
  }

  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    for (const [key, entry] of this.challengeCache.entries()) {
      if (now > entry.expiresAt) {
        this.challengeCache.delete(key);
      }
    }
  }
}
