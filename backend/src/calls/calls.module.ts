import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Call } from '../common/entities/call.entity';
import { Contact } from '../common/entities/contact.entity';
import { VapiModule } from '../vapi/vapi.module';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Call, Contact]),
    VapiModule,
    AuthModule,
  ],
  providers: [CallsService],
  controllers: [CallsController],
  exports: [CallsService],
})
export class CallsModule {}
