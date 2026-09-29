import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from '../common/entities/contact.entity';
import { Appointment } from '../common/entities/appointment.entity';
import { ContactIdentityChange } from './entities/contact-identity-change.entity';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { ContactVerificationService } from './contact-verification.service';
import { ContactVerificationController } from './contact-verification.controller';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { ZadarmaSmsModule } from '../sms/zadarma-sms.module';
import { YCloudModule } from '../whatsapp/ycloud.module';
import { AgentsConfigModule } from '../agents/agents-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, Appointment, ContactIdentityChange]),
    AuthModule,
    forwardRef(() => EmailModule),
    ZadarmaSmsModule,
    YCloudModule,
    AgentsConfigModule,
  ],
  providers: [ContactsService, ContactVerificationService],
  controllers: [ContactsController, ContactVerificationController],
  exports: [ContactsService, ContactVerificationService],
})
export class ContactsModule {}

