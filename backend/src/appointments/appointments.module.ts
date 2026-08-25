import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../common/entities/appointment.entity';
import { Service } from '../common/entities/service.entity';
import { Contact } from '../common/entities/contact.entity';
import { AppointmentsService } from './appointments.service';
import { AnalizaIaService } from './analiza-ia.service';
import { AppointmentsController } from './appointments.controller';
import { AuthModule } from '../auth/auth.module';
import { CalcomModule } from '../calcom/calcom.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Service, Contact]),
    AuthModule,
    CalcomModule,
  ],
  providers: [AppointmentsService, AnalizaIaService],
  controllers: [AppointmentsController],
  exports: [AppointmentsService, AnalizaIaService],
})
export class AppointmentsModule {}

