import { Publisher, Subjects, TicketUpdatedEvent } from '@go-tickets/common';


export class TicketUpdatedPublisher extends Publisher<TicketUpdatedEvent> {
  readonly subject = Subjects.TicketUpdated;
}
