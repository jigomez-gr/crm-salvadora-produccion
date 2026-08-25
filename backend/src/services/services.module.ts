import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from '../common/entities/service.entity';
import { User } from '../common/entities/user.entity';
import { Appointment } from '../common/entities/appointment.entity';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Service, User, Appointment]), AuthModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}