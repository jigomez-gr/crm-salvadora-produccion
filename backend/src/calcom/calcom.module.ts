import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalcomAccount } from '../common/entities/calcom-account.entity';
import { CalcomService } from './calcom.service';
import { CalcomController } from './calcom.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([CalcomAccount]), AuthModule],
  controllers: [CalcomController],
  providers: [CalcomService],
  exports: [CalcomService],
})
export class CalcomModule {}
