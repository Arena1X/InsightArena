import { plainToInstance } from 'class-transformer';
import {
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsString,
    MinLength,
    validateSync,
} from 'class-validator';

enum StellarNetwork {
    TESTNET = 'testnet',
    MAINNET = 'mainnet',
}

class EnvironmentVariables {
    @IsString()
    @IsNotEmpty()
    DATABASE_URL: string;

    @IsString()
    @MinLength(32, {
        message: 'JWT_SECRET must be at least 32 characters long',
    })
    JWT_SECRET: string;

    @IsString()
    @IsNotEmpty()
    JWT_EXPIRES_IN: string;

    @IsEnum(StellarNetwork, {
        message: 'STELLAR_NETWORK must be either "testnet" or "mainnet"',
    })
    STELLAR_NETWORK: StellarNetwork;

    @IsString()
    @IsNotEmpty()
    SOROBAN_CONTRACT_ID: string;

    @IsNumber()
    PORT: number = 3000;
}

export function validate(config: Record<string, unknown>) {
    const validatedConfig = plainToInstance(EnvironmentVariables, config, {
        enableImplicitConversion: true,
    });

    const errors = validateSync(validatedConfig, {
        skipMissingProperties: false,
    });

    if (errors.length > 0) {
        const errorMessages = errors
            .map((error) => {
                const constraints = error.constraints
                    ? Object.values(error.constraints).join(', ')
                    : 'Unknown validation error';
                return `${error.property}: ${constraints}`;
            })
            .join('\n');

        throw new Error(
            `Environment validation failed:\n${errorMessages}\n\nPlease check your .env file and ensure all required variables are set.`,
        );
    }

    return validatedConfig;
}
