# Superbus Map

A Map implementation that emits events on a [Superbus](https://github.com/cinnamon-bun/superbus/).

## Why?

Sometimes you have a collection of things and you want to react to changes in its membership.  For example, you have a React app that shows a list of Todos, or a specific Todo.

Now you can get notified when something is `added`, `changed` or `deleted` from a Map.

You can also subscribe to those events but scoped to a specific item, by its key or id, like `added:abc`.

Lastly, you can subscribe to all events using `*`.

## Backpressure is good

Backpressure is a property of a distributed system -- it means that events don't pile up in a buffer somewhere in the middle.  Instead they are not allowed to enter the system until the previous item is done being processed.

We use Superbus because unlike most event busses, it supports backpressure.  It does this by waiting for all an event's subscribers to finish running before it finishes sending the event and returns control back to the rest of the program.

This way your code can do an operation like adding an item, and be sure all the events have finished running before moving on to add the next one.  Without this feature, if you add 1000 items all at once you'll get a big pile of events all trying to run at the same time, using lots of memory and possibly reacting to stale state when they finally get to run.  Waiting for each event to finish makes things simple to reason about because things happen one at a time.

> Actually, to be precise, all the subscriptions for a given event run in parallel, but the event does not finish until all the subscriptions for that event are done.

## Overview

This is very similar to the normal javascript Map class except:
  - You can listen to events to get notified when the data changes
  - The write functions (set, delete, clear) are `async`
    and wait for the event callbacks to finish running before they
    return control to the rest of the program
  - Keys can only be strings, unlike normal Maps
  - `await set(key, value)` returns a string describing if anything changed: `"added" | "changed" | "unchanged"`.

It's a good idea to read the docs for Superbus to understand the details of its behavior.

Note: we use the word "listener" and "subscriber" to mean the same thing here - a callback attached to the Superbus that gets run when an event occurs.

## Constructor

The constructor has two optional arguments:

`thingToClone` can be another SuperbusMap, a regularMap, an Array, or an Iterable of key-value pairs.  Set it to `null` or `undefined` to start with an empty superbus, which is the default.

`sepChar` is the string character used to separate event names from object ids.  It defaults to `:` resulting in event channels like `added:abc`.  You can change it to any other single character like `|` or `/` or `.`

It also has two type parameters, `K` and `V`, which are the same as the regular `Map<K, V>` type parameters -- the types of the keys and values.  However, unlike regular Maps, SuperbusMaps have to use strings as their keys.

```ts
import {SuperbusMap } from 'superbus-map';

let thingToClone = [['a', 1], ['b', 2]];
let myMap = new SuperbusMap<string, number>(thingToClone, sepChar);

// or, get an empty map with defailt ':' sepChar by omitting the params
let myMap2 = new SuperbusMap<string, number>();

```

## Using SuperbusMap as a Map

It's mostly like a regular Map, except the write methods are async and need to be `awaited` -- this gives them time to send their events.

```ts
let myMap = new SuperbusMap<string, number>();

// WRITE
// these are async
await myMap.set('a', 1);
await myMap.delete('a');
await myMap.clear();

// READ
let size: number = map.size
let value: number | undefined = myMap.get('b')
let hasIt: boolean = myMap.has('b');

// ITERATION
for (let [key, value] of myMap) { /* ... */ }
for (let [key, value] of myMap.entries()) { /* ... */ }
for (let key of myMap.keys()) { /* ... */ }
for (let value of myMap.values()) { /* ... */ }

// CLONE
// only the map data is cloned, not the subscriptions
// the sepChar is also not cloned; it defaults back to ':' unless you change it
let myClone = new SuperbusMap<String, number>(myMap);

// MERGE
// the later items win over the earlier ones
let merged = new SuperbusMap([...myMap, myClone, ['z', 26]]);
```

## Listening for events

The `bus` property is a Superbus instance with events you can listen to:

```
npm install superbus-map
```

```ts
let myMap = new SuperbusMap<string, number>();

// Subscribe to Superbus events
myMap.bus.on('changed', (channel, data) => {
    // channel will be 'changed:${key}'
    // data will be { key, value, oldValue }
});
```

## Events and their data

The key is included in the event channel name, separated after a `:` (or whatever your sepChar is, from the constructor):

| Event channel     | Event data
| -------------     | ---------------
| `added:${key}`    | `{ key, value           }`
| `changed:${key}`  | `{ key, value, oldValue }`
| `deleted:${key}`  | `{ key,        oldValue }`

---

The Superbus class will also let you receive these events for all keys by subscribing to just `added`, `changed`, or `deleted`.

You can also listen to `*` to get all events.

## Async details, blocking, etc

Superbus, the underlying bus library we use, lets senders and listeners of events both say if they want to be blocking or nonblocking.  Only when BOTH want to be blocking, will the send block until all the blocking listeners have finished running.

SuperbusMap sends its events in blocking mode, so it's up to the listener callbacks to decide if they want to block the system until they finish running, or run nonblockingly.  They make that choice like so:

```ts
myMap.bus.on('delete', (channel, data) => {
    // do stuff here
}, { mode: 'blocking' });  // or 'nonblocking'
```

For this all to work you must `await` the write methods of SuperbusMap (set, delete, clear).

Unrelatedly, your listener callbacks can be sync or async functions, it doesn't matter.

In other words,

### The ideal way to use it:
```ts
    // IDEAL USE:
    // BLOCKING LISTENERS
    //   Add a listener which will block the whole map until it's done.
    //   These can have sync or async callbacks.
    //   They are in 'blocking' mode by default.
    myMap.on('added', (channel, data) => {});
    myMap.on('added', async (channel, data) => {});
    // NONBLOCKING LISTENERS
    //   Can be sync or async, but have mode: 'nonblocking'.
    myMap.on('added', (channel, data) => {}, { mode: 'nonblocking' });
    // AND MAKE SURE TO AWAIT THE MAP'S WRITE METHODS
    await myMap.set('hello', 'world');

    // This set() will return after all the blocking listeners are
    // done running.  The nonblocking listenenrs will run
    // later, with setImmediate.
```

### If you can't await the write operations:

```ts
    // Sometimes you need to use the map's write methods from a
    // synchronous function.  Here's what will happen...
    myMap.set('hello', 'world?');  // no await

    // Blocking synchronous callbacks will block as expected.
    // Blocking async callbacks will behave unpredictably.  :(
    //   Probably the portion of their code up to the first async
    //   call will run blockingly, and the rest will run later.
    // Nonblocking synchronouse callbacks will run with setImmediate.
    // Nonblocking async callbacks will run with setImmediate.

```

### When data is committed to the map

The actual changes to the map data will be completed by
the time myMap.set() finishes running, whether you await it or not.
The await is just about waiting for the callbacks to finish.

The exception is `clear()`, which deletes items one by one and waits for their event handlers.  You must `await map.clear()` to ensure everything is deleted before your next line of code runs.

## Error handling in the listener callbacks

Read the [Errors section in the Superbus README](https://github.com/cinnamon-bun/superbus#error-handling).

The short answer is: try to catch errors from inside your own callbacks, because it's awkward if they are propagate outside of the callback.
