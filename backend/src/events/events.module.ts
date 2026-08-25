import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EventsController],
})
export class EventsModule {}
