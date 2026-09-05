import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZadarmaSmsService } from './zadarma-sms.service';
import { ZadarmaSmsController } from './zadarma-sms.controller';
import { ZadarmaSmsLog } from './zadarma-sms-log.entity';
import { VapiAccount } from '../../common/entities/vapi-account.entity';
import { AppSettings } from '../../common/entities/app-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ZadarmaSmsLog, VapiAccount, AppSettings]),
  ],
  controllers: [ZadarmaSmsController],
  providers: [ZadarmaSmsService],
  exports: [ZadarmaSmsService],
})
export class ZadarmaSmsModule {}
