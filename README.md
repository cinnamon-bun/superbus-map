# Superbus Map

A Map implementation that emits events on a [Superbus](https://github.com/cinnamon-bun/superbus/).

This is very similar to the built-in Map class except:
  - You can subscribe to events when the data changes
  - The write functions (set, delete, clear) are async
    so that the event callbacks have time to finish running.
  - Keys must be strings
  - set(key, value) returns a string describing what happened

## Using it

The `events` property is a Superbus instance with events you can subscribe to:

```
npm install superbus-map
```

```ts
import {SuperbusMap } from 'superbus-map';

let myMap = new SuperbusMap<string, number>();

// Subscribe to Superbus events
myMap.events.on('changed', (channel, data) => {
    // channel will be 'changed:${key}'
    // data will be { key, value, oldValue }
});
```

## Events and their data

The key is included in the event channel name, separated after a `:`.

| Event channel     | Event data
| -------------     | ---------------
| "added:${key}"    | { key, value           }
| "changed:${key}"  | { key, value, oldValue }
| "deleted:${key}"  | { key,        oldValue }

---

The Superbus class will also let you receive these events for all keys by subscribing to just `added`, `changed`, or `deleted`.

You can also subscribe to `*` to get all events.

(The `:` separator can be changed to another character or string using the `sep` argument in the constructor.)

## Async details

Superbus lets senders and listeners of events both say if they want to be blocking or nonblocking.  Only when BOTH want to be blocking, will the send block until all the blocking listeners have finished running.

SuperbusMap events are sent in blocking mode, so it's up to the listener callbacks to decide if they want to block the system until they finish running, or run nonblockingly.

For this all to work you must `await` the write methods of SuperbusMap (set, delete, clear).

In other words,

```ts
    // set a value and enable blocking behaviour...
    await myMap.set('hello', 'world');
    // at this point all the blocking event handlers are guaranteed to 
    // have finished running, and the nonblocking event handlers
    // may or may not have started or finished running.

    // without using await...
    myMap.set('hello', 'world?');
    // at this point only the synchronous event handlers have
    // finished running.  The async ones are still running.
    // But at least the map.set itself has definitely finished.
```

The `await` is only important if you want to make sure the event handlers have finished running.

Even if you don't use await, the actual changes to the Map will be complete by the time the method exits.

The exception is `clear()`, which deletes items one by one and waits for their event handlers.  You must `await map.clear()` to ensure everything is deleted before your next line of code runs.
