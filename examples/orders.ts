import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingHttpHeaders } from 'node:http';

import { Container, InjectScope } from '@zirion/ioc';


type Locale = 'en' | 'ru';
type Product = {
  sku: string;
  name: Record<Locale, string>;
  price: number;
};
type Catalog = Map<string, Product>;

export type RequestContext = {
  requestId: string;
  headers: IncomingHttpHeaders;
};

export class HttpError extends Error {
  constructor (readonly status: number, message: string) {
    super(message);
  }
}

export class OrderStore {
  private readonly orders: Array<{
    id: number;
    sku: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }> = [];

  get count (): number {
    return this.orders.length;
  }

  list () {
    return [...this.orders];
  }

  create (sku: string, quantity: number, unitPrice: number) {
    const order = {
      id: this.orders.length + 1,
      sku,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    };

    this.orders.push(order);

    return order;
  }
}

export class RequestMetadata {
  readonly requestId: string;
  locale!: Locale;
  private readonly language: string | undefined;

  constructor (context: RequestContext) {
    this.requestId = context.requestId;
    this.language = context.headers['accept-language'];
  }

  onInitialized (): void {
    this.locale = this.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  }
}

export class OrderService {
  constructor (
    private readonly catalog: Catalog,
    private readonly orders: OrderStore,
    readonly metadata: RequestMetadata,
  ) {}

  listProducts () {
    return [...this.catalog.values()].map(product => ({
      sku: product.sku,
      name: product.name[this.metadata.locale],
      price: product.price,
    }));
  }

  listOrders () {
    return this.orders.list();
  }

  createOrder (input: unknown) {
    if (typeof input !== 'object' || input === null) {
      throw new HttpError(400, 'Expected sku and quantity between 1 and 100');
    }

    const { sku, quantity } = input as Record<string, unknown>;

    if (typeof sku !== 'string' || !Number.isInteger(quantity) ||
        typeof quantity !== 'number' || quantity < 1 || quantity > 100) {
      throw new HttpError(400, 'Expected sku and quantity between 1 and 100');
    }

    const product = this.catalog.get(sku);

    if (!product) {
      throw new HttpError(404, 'Unknown product');
    }

    return this.orders.create(sku, quantity, product.price);
  }
}

const CATALOG = Symbol('catalog');

export function createOrderContainer () {
  return new Container()
    .add(CATALOG, {
      scope: InjectScope.SINGLETON,
      valueFactory: async () => {
        const json = await readFile(new URL('./products.json', import.meta.url), 'utf8');
        const products = JSON.parse(json) as Product[];

        return new Map(products.map(product => [product.sku, product]));
      },
    })
    .add(OrderStore, { scope: InjectScope.SINGLETON })
    .add(RequestMetadata, { scope: InjectScope.REQUEST })
    // OrderService is transient by default.
    .add(OrderService, { inject: [CATALOG, OrderStore, RequestMetadata] });
}

export type OrderContainer = ReturnType<typeof createOrderContainer>;

export function createRequestContext (headers: IncomingHttpHeaders): RequestContext {
  return { requestId: randomUUID(), headers };
}

export async function resolveProducts (container: OrderContainer, context: RequestContext) {
  const metadata = await container.getOrFail(RequestMetadata, context);
  const service = await container.getOrFail(OrderService, context);

  if (service.metadata !== metadata) {
    throw new Error('Request scope was not reused');
  }

  return { metadata, products: service.listProducts() };
}
