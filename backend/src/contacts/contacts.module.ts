import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from '../common/entities/contact.entity';
import { Appointment } from '../common/entities/appointment.entity';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  // Appointment repo is read-only here — the board enriches cards with each
  // contact's next appointment. No dependency on AppointmentsModule (the
  // auto-advance-on-booking hook is wired via the 'appointment.created' event).
  imports: [TypeOrmModule.forFeature([Contact, Appointment]), AuthModule],
  providers: [ContactsService],
  controllers: [ContactsController],
  exports: [ContactsService],
})
export class ContactsModule {}
