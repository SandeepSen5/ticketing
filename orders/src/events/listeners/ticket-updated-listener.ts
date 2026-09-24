import { Message } from 'node-nats-streaming';
import { Subjects, Listener, TicketUpdatedEvent } from '@go-tickets/common';
import { Ticket } from '../../models/ticket';
import { queueGroupName } from './queue-group-name';

export class TicketUpdatedListener extends Listener<TicketUpdatedEvent> {
  subject: Subjects.TicketUpdated = Subjects.TicketUpdated;
  queueGroupName = queueGroupName;

  async onMessage(data: TicketUpdatedEvent['data'], msg: Message) {
    const { title, price, version } = data;

    // Update atomically and mirror the version from the event. A plain save()
    // does nothing (and keeps the old version) when title and price are unchanged,
    // e.g. for events published because an order reserved the ticket.
    const ticket = await Ticket.findOneAndUpdate(
      { _id: data.id, version: version - 1 },
      { title, price, version }
    );

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    msg.ack();
  }
}

