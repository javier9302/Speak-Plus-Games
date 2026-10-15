// An item lying on the ground.
export default {
  kind: 'item',
  about: 'An item lying on the ground. Pick up takes it.',
  fields: { item: 'the item (an id from the items list)' },
  check: (o, v) => v.item(o.item, 'item'),
  start: (def) => ({ st: 'here', holds: def.item }),
  solid: (t) => t.st !== 'gone',
  hidden: (t) => t.st === 'gone',
  returned: (t) => { t.st = 'here'; },
  how: () => 'Pick up.',
  actions: [
    { ability: 'pickup', when: (t) => t.st === 'here', gives: true, do: (t) => { t.holds = null; t.st = 'gone'; } },
  ],
};
