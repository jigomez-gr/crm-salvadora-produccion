import { Controller, Sse, MessageEvent, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject, merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Heartbeat interval — keeps idle SSE connections alive through the reverse
// proxy (Traefik defaults to dropping idle streams), and lets the browser
// notice a dead connection and reconnect.
const SSE_HEARTBEAT_MS = 25_000;

// The browser's EventSource sends the httpOnly auth cookie automatically when
// opened with `withCredentials: true` (see frontend hooks/useEvents.ts).
@Controller('events')
@UseGuards(JwtAuthGuard)
// A single long-lived SSE connection per tab must not be counted against the
// global per-IP rate limit (it would 429 reconnect storms after a deploy).
@SkipThrottle()
export class EventsController {
  private readonly subject = new Subject<{ eventName: string; payload: unknown }>();

  @Sse()
  stream(): Observable<MessageEvent> {
    const events$ = this.subject.asObservable().pipe(
      map((event) => ({
        type: event.eventName,
        data: JSON.stringify(event.payload),
      })),
    );
    // Periodic keepalive; the frontend ignores 'ping' events (it only listens
    // for the named domain events below).
    const heartbeat$ = interval(SSE_HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: 'keepalive' })),
    );
    return merge(events$, heartbeat$);
  }

  @OnEvent('message.received')
  onMessageReceived(payload: unknown) {
    this.subject.next({ eventName: 'message.received', payload });
  }

  @OnEvent('message.sent')
  onMessageSent(payload: unknown) {
    this.subject.next({ eventName: 'message.sent', payload });
  }

  @OnEvent('appointment.created')
  onAppointmentCreated(payload: unknown) {
    this.subject.next({ eventName: 'appointment.created', payload });
  }

  @OnEvent('message.status')
  onMessageStatus(payload: unknown) {
    this.subject.next({ eventName: 'message.status', payload });
  }

  @OnEvent('conversation.updated')
  onConversationUpdated(payload: unknown) {
    this.subject.next({ eventName: 'conversation.updated', payload });
  }

  @OnEvent('contact.updated')
  onContactUpdated(payload: unknown) {
    this.subject.next({ eventName: 'contact.updated', payload });
  }

  @OnEvent('appointment.updated')
  onAppointmentUpdated(payload: unknown) {
    this.subject.next({ eventName: 'appointment.updated', payload });
  }

  @OnEvent('payment.received')
  onPaymentReceived(payload: unknown) {
    this.subject.next({ eventName: 'payment.received', payload });
  }

  @OnEvent('call.ended')
  onCallEnded(payload: unknown) {
    this.subject.next({ eventName: 'call.ended', payload });
  }
}
