import { assign, setup } from 'xstate';

export type Context = { digits: string[] };
export type InputEvents = EnterDigitEvent | RemoveDigitEvent;
export type EnterDigitEvent = { type: 'enterDigit'; digit: string };
export type RemoveDigitEvent = { type: 'removeDigit' };
export type VerifyResponseEvent = { type: 'verifyResponse'; success: boolean };

export const verifyResponse = (success: boolean): VerifyResponseEvent => ({
  type: 'verifyResponse',
  success,
});

export const keyEvent = (digit: string): EnterDigitEvent => ({
  type: 'enterDigit',
  digit,
});

export const backspaceEvent = (): RemoveDigitEvent => ({
  type: 'removeDigit',
});

/**
 * State machine to enter and verify a PIN code.
 */
export const pinMachine = setup({
  types: {
    context: {} as Context,
    events: {} as InputEvents | VerifyResponseEvent,
  },
  actions: {
    verifyAction: function () {},
    clearAction: assign({
      digits: () => [],
    }),
    collectAction: assign({
      digits: ({ context, event }) => {
        return event.type === 'enterDigit' ? [...context.digits, event.digit].slice(0, 4) : context.digits;
      },
    }),
    removeAction: assign({
      digits: ({ context, event }) => {
        return event.type === 'removeDigit' ? [...context.digits.slice(0, context.digits.length - 1)].slice(0, 4) : context.digits;
      },
    }),
  },
  guards: {
    pinLengthGuard: ({ context }) => {
      return context.digits.length === 4;
    },
    pinValidGuard: ({ event }) => {
      return event.type === 'verifyResponse' && event.success;
    },
  },
  delays: {
    verifyTimeout: 2000,
    invalidTimeout: 2000,
  },
}).createMachine({
  context: {
    digits: [],
  },
  id: 'Pin-Code-Verification',
  initial: 'idle',
  states: {
    idle: {
      on: {
        enterDigit: {
          actions: 'collectAction',
          target: 'collect',
        },
      },
    },
    collect: {
      on: {
        enterDigit: {
          actions: 'collectAction',
          target: 'collect',
        },
        removeDigit: {
          actions: 'removeAction',
          target: 'collect',
        },
      },
      always: {
        target: 'verify',
        guard: 'pinLengthGuard',
      },
    },
    verify: {
      entry: 'verifyAction',
      on: {
        verifyResponse: [
          {
            target: 'valid',
            guard: 'pinValidGuard',
          },
          {
            target: 'invalid',
          },
        ],
      },
      after: {
        verifyTimeout: {
          target: 'invalid',
        },
      },
    },
    invalid: {
      exit: 'clearAction',
      after: {
        invalidTimeout: {
          target: 'idle',
        },
      },
    },
    valid: {
      entry: 'clearAction',
      type: 'final',
    },
  },
});
