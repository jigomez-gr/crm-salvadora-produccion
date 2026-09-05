import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZadarmaSmsLog } from './zadarma-sms-log.entity';
import { VapiAccount } from '../common/entities/vapi-account.entity';
import { ZadarmaSmsService } from './zadarma-sms.service';
import { ZadarmaSmsController } from './zadarma-sms.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ZadarmaSmsLog, VapiAccount])],
  controllers: [ZadarmaSmsController],
  providers: [ZadarmaSmsService],
  exports: [ZadarmaSmsService],
})
export class ZadarmaSmsModule {}
