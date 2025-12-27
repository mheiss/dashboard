import { assign, setup } from 'xstate';

export const machine = setup({
  types: {
    context: {} as {
      digits: string[];
    },
    events: {} as { type: 'PIN'; digit: string } | { type: 'RESPONSE'; success: boolean },
  },

  actions: {
    doVerify: () => {
      throw new Error('Method not implemented.');
    },
    clear: assign({
      digits: () => [],
    }),
    addPin: assign({
      digits: ({ context, event }) => (event.type === 'PIN' ? [...context.digits, event.digit].slice(0, 4) : context.digits),
    }),
  },

  guards: {
    has4Digits: ({ context }) => context.digits.length === 4,
    success: ({ event }) => event.type === 'RESPONSE' && event.success === true,
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
        PIN: {
          target: 'collect',
          actions: 'addPin',
        },
      },
    },
    collect: {
      on: {
        PIN: {
          target: 'collect',
          actions: 'addPin',
        },
      },
      always: {
        target: 'verify',
        guard: 'has4Digits',
      },
    },
    verify: {
      entry: 'doVerify',
      on: {
        RESPONSE: [
          {
            target: 'valid',
            guard: 'success',
          },
          {
            target: 'invalid',
          },
        ],
      },
      after: {
        2000: {
          target: 'invalid',
        },
      },
    },
    invalid: {
      entry: 'clear',
      always: {
        target: 'idle',
      },
    },
    valid: {
      type: 'final',
      entry: 'clear',
    },
  },
});
