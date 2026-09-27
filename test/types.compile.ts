import { Container } from '#base/index';


class Service {
  readonly name = 'service';
}

function callback () { return 42; }

const token = Symbol('token');
const container = new Container()
  .add('name', { valueFactory: () => 'Alice' })
  .add('count', { valueFactory: async () => 7 })
  .add('service', { valueFactory: () => Service })
  .add('callback', { valueFactory: () => callback })
  .add(token, { valueFactory: () => true })
  .add(Service);

async function checkTypes () {
  const name: string = await container.getOrFail('name');
  const count: number = await container.getOrFail('count');
  const service: Service = await container.getOrFail('service');
  const cb: typeof callback = await container.getOrFail('callback');
  const enabled: boolean = await container.getOrFail(token);
  const direct: Service = await container.getOrFail(Service);
  const maybeName: string | null = await container.get('name');
  const selector: 'name' | 'count' = Math.random() > 0.5 ? 'name' : 'count';
  const selected: string | number = await container.getOrFail(selector);
  const syncName: string = container.getOrFailSync('name');
  const maybeSyncName: string | null = container.getSync('name');

  // @ts-expect-error The factory returns a string.
  const wrong: number = await container.getOrFail('name');
  // @ts-expect-error This selector has not been registered.
  await container.getOrFail('missing');
  // @ts-expect-error This selector has not been registered.
  await container.get('missing');
  // @ts-expect-error A union of string and number is not a boolean.
  const wrongUnion: boolean = await container.getOrFail(selector);
  // @ts-expect-error Synchronous resolution keeps the selector's value type.
  const wrongSync: number = container.getOrFailSync('name');
  // @ts-expect-error This selector has not been registered.
  container.getSync('missing');

  void name; void count; void service; void cb; void enabled; void direct;
  void maybeName; void selected; void syncName; void maybeSyncName;
  void wrong; void wrongUnion; void wrongSync;
}

void checkTypes;
