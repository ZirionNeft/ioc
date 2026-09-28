# Миграция на `@zirion/ioc`

[English version](migration.md).

Руководство для постепенного переноса кода с Awilix, InversifyJS и TSyringe. Сравнение возможностей и результаты измерений находятся в [отдельном отчёте](bench.ru.md).

## Общий подход

Начните с одного composition root: выберите конкретные сервисы для переноса и сохраните старый контейнер для остальных. Сначала зафиксируйте lifetime каждого сервиса и владельца его ресурсов. Асинхронную границу проводите в HTTP-обработчике, job runner или при запуске приложения, где уже допустим `await`.

Значение `REQUEST` в `@zirion/ioc` привязано к переданному объекту context и доступно между отдельными вызовами `get` с этим объектом. Контейнер не создаёт HTTP-контекст автоматически: приложение должно передавать один и тот же объект в пределах запроса. Проверьте семантику request scope старого контейнера до переноса регистраций.

`get()` и `getOrFail()` возвращают промисы. Для полностью синхронного графа используйте `getSync()` или `getOrFailSync()`. Если фабрика, зависимость или `onInitialized()` асинхронны, синхронный вызов бросает `ASYNC_RESOLUTION_REQUIRED`; такую точку вызова нужно перевести на `await`. До обнаружения промиса синхронный вызов может успеть запустить фабрику; её ожидаемый singleton/request-результат доступен последующему async-вызову.

Проверьте ограничения при переносе графа: типы chained `add()` не доказывают на этапе компиляции, что каждый элемент `inject` зарегистрирован; отсутствие зависимости и цикл обнаруживаются при разрешении. Прямая зависимость singleton → request запрещена, а обход через transient выявляется только во время разрешения. `onInitialized()` класса запускается после конструктора, поэтому прежнюю property injection или конструкторную инициализацию нужно перенести в явные зависимости либо фабрику. Для request-значений нет явного удаления из кеша или автоматического закрытия ресурса.

## Awilix

Для `asClass(Service).scoped()` используйте `add(Service, { scope: InjectScope.REQUEST, inject: [...] })`, если приложение передаёт один context object всем разрешениям в пределах HTTP-запроса. `.singleton()` соответствует `InjectScope.SINGLETON`, а `.transient()` — scope по умолчанию.

В режиме Awilix `PROXY` класс получает cradle-объект. Если конструктор нужно сохранить, зарегистрируйте адаптирующую фабрику:

```ts
import { Container, InjectScope } from '@zirion/ioc';

declare function connectDb(): Promise<object>;

class Repo {
  constructor(readonly db: object) {}
}

const container = new Container()
  .add('db', { scope: InjectScope.SINGLETON, valueFactory: () => connectDb() })
  .add(Repo, {
    inject: ['db'],
    scope: InjectScope.REQUEST,
    valueFactory: ([db]) => new Repo(db),
  });

// В HTTP-обработчике используйте один объект для всех разрешений этого запроса.
const requestContext = { requestId: '123' };
const repo = await container.getOrFail(Repo, requestContext);
```

`connectDb()` здесь — функция приложения. Singleton `db` должен закрываться кодом приложения: Awilix `.disposer()` автоматически не переносится. Если legacy-код использует cradle с динамическими свойствами, оставьте адаптер на границе модуля, а новые сервисы регистрируйте с явным `inject`. [Awilix lifetimes, scopes и disposal](https://github.com/jeffijoe/awilix).

## InversifyJS

Сохраните token (`string`, `symbol` или класс), а `@inject(TOKEN)` перенесите в упорядоченный `inject: [TOKEN]`. `getAsync` становится `await getOrFail`, синхронный `get` — `getOrFailSync`, если весь граф синхронный.

`inRequestScope()` в InversifyJS действует внутри одного дерева `get`; `REQUEST` в `@zirion/ioc` также объединяет отдельные вызовы `get` с одним context. Выберите нужную семантику до миграции. `getAll` можно заменить отдельными selector-ами и фабрикой массива, например `add('plugins', { inject: ['a', 'b'], valueFactory: deps => deps })`. Для динамических constraints/tags понадобится фабрика выбора или временное сохранение InversifyJS в этих модулях. [Inversify scopes](https://inversify.io/docs/fundamentals/binding/) и [Container API](https://inversify.io/docs/api/container/).

## TSyringe

Замените `@injectable` и `@inject` на регистрации с `inject`. `Lifecycle.ContainerScoped` обычно соответствует `REQUEST` при явной передаче context object. `ResolutionScoped` действует лишь в одном дереве разрешения и не эквивалентен `REQUEST`.

`@injectAll`, interceptors и `dispose()` требуют адаптеров или остаются в старом контейнере. Удаляйте `reflect-metadata` и флаги декораторов только после переноса всех зависимых модулей. [TSyringe API и lifetimes](https://github.com/microsoft/tsyringe).

## Мост для синхронного legacy API

Можно зарегистрировать legacy-объект через `valueFactory: () => legacy.resolve(Token)`. Для синхронного вызова используйте `modern.getOrFailSync(Token)`, если весь граф синхронный. Если он может вернуть промис, заранее разрешите значение: `const service = await modern.getOrFail(Token); legacy.registerInstance(Token, service)`, либо переведите точку вызова на `await`.

На переходный период назначьте одного владельца каждому singleton и его закрытию, чтобы не создать две копии ресурса. У `@zirion/ioc` нет автоматического аналога Awilix/TSyringe `dispose()`: `finalize()` вызывает `onFinalized()`, но не обходит request/transient объекты для закрытия.
