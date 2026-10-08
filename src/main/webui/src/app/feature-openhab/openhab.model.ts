export type ItemEventType = ItemCommandType | ItemStateType;
export type ItemCommandType = 'ItemCommandEvent';
export type ItemStateType = 'ItemStateEvent';

export type ItemTopic = ItemCommandTopic | ItemStateTopic;
export type ItemCommandTopic = `openhab/items/${string}/command`;
export type ItemStateTopic = `openhab/items/${string}/state`;

/**
 * PING event to signal that the websocket is still alive.
 */
export const PingEvent = {
  type: 'WebSocketEvent',
  topic: 'openhab/websocket/heartbeat',
  payload: 'PING',
  source: 'WebSocketTestInstance',
};

/**
 * An event to update the status of an item.
 */
export interface ItemEvent {
  type: ItemEventType;
  topic: ItemTopic;
  payload: string;
  eventId?: number;
  source: string;
}

/**
 * The payload of an event.
 */
export interface Payload {
  type: string;
  value: string;
}

/**
 * Creates a new command event to update the given item using the given payload.
 *
 * @param item the item to update
 * @param payload the payload to send
 * @returns the command to send via a websocket
 */
export const createCommandEvent = (item: string, payload: Payload): ItemEvent => ({
  type: 'ItemCommandEvent',
  topic: `openhab/items/${item}/command`,
  source: 'Dashboard',
  payload: JSON.stringify(payload),
});

/**
 * Creates a simple STRING payload which can be used to set the value of a textual item.
 *
 * @param value the value to set.
 * @returns the payload
 */
export const createStringPayload = (value: string): Payload => ({
  type: 'String',
  value: value,
});

/**
 * Converts ON or OFF to a boolean value
 */
export const onOffConverter = (value: string): boolean => value === 'ON';

/**
 * No-Op converter that does nothing
 */
export const stringConverter = (value: string): string => value;
