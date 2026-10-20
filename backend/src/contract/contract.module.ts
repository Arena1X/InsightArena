import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContractService } from './contract.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ContractService],
  exports: [ContractService],
})
export class ContractModule {}
