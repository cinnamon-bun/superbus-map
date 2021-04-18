
//================================================================================ 
// LOGGING

//let log = console.log;
let log = (...args: any[]) => {};
let busdebug =     '        🚌';

//================================================================================ 

type Thunk = () => void;
type Callback<Ch> = (channel: Ch, data?: any) => void | Promise<void>;

/*

Superbus

A message bus with a few tricks up its sleeve.

Listeners can subscribe by adding a callback like

    let myBus = new Superbus();
    myBus.on('something', (channel, data) => {
        // channel is the name of the channel again, 'something'
        // data is any payload that came with the message.
    });

When you subscribe you get an unsubscribe function back:

    let unsub = myBus.on('something', () => {});
    unsub();

--------------
Message specificity, '*', and special handling of messages with ids

Subscribers can listen to the '*' channel to get all events:

    myBus.on('*', () => {});

A message can have an ID attached to it by combining it into the channel name
separated by a ':':

    myBus.sendLater('changed:abc', myData);

This represents a change event for the "abc" object, whatever that means to you.

Messages with IDs are considered to be "more specific' than other messages.
Sending the message above will trigger all 3 of these listeners, in order from
most to least specific:

    myBus.on('changed:abc', () => {});  // only when item "abc' has changed
    myBus.on('changed', () => {});      // when anything is changed
    myBus.on('*', () => {});            // any message at all

Similarly, sending a regular "changed" message with no ID will trigger these listeners:

    myBus.on('changed', () => {});      // when anything is changed
    myBus.on('*', () => {});            // any message at all

In other words, listeners will hear the channel they signed up for and any
channels that are more specific.

Only the first colon is detected:
    sending "changed:a:b:c"
    will trigger listeners for "changed:a:b:c", "changed", and "*"

':' is the default is separator character, but you can change it in the constructor.

--------------
Backpressure and special async behavior

There are two ways to send a message:

    myBus.sendLater('hello', data);
    await myBus.sendAndWait('hello', data);

(The data argument is optional.  It defaults to undefined.)

sendLater sends your message on process.nextTick:

    myBus.sendLater('hello');
    // at this point, listeners have not run yet.
    // they will not start running until nextTick.

sendAndWait runs the listener callbacks right away and waits for them all to finish,
even the async ones.  Make sure to "await" it.

    await myBus.sendAndWait('hello');
    // at this point, all listener callbacks are done running.

The async callbacks are run in parallel and we wait for them to all
to finish using Promise.allSettled().

If you forget the "await" on sendAndWait, only the synchronous callbacks will finish
running before your code continues.  The async callbacks will be started but won't
finish until later.

--------------
Generic types

The allowed channel strings can be specified in the generic type:

    new Superbus<string>();

    type MyChannels = 'open' | 'close';
    new Superbus<MyChannels>();

If you specify specific channel names this way, you won't be able to use
dynamic channel names that include ids, or you'll have to give Typescript
some extra help:

    myBus.sendLater('open:123' as 'open'); 
    myBus.on('open:123' as 'open', () => {});

*/
export class Superbus<Ch extends string> {
    // For each channel, we have a Set of callbacks.
    _subs: Record<string, Set<Callback<Ch>>> = {};
    // Character used to separate channel name from id, like 'changed:123'
    _sep: string;

    constructor(sep: string = ':') {
        this._sep = sep || ':'
    }

    on(channelInput: Ch | Ch[], callback: Callback<Ch>): Thunk {
        log(`${busdebug} on`, channelInput);
        let channels: Ch[] = (typeof channelInput === 'string') ? [channelInput] : channelInput;
        for (let channel of channels) {
            log(`${busdebug} ...on`, channel);
            // Subscribe to a channel.
            // The callback can be a sync or async function.
            let set = (this._subs[channel] ??= new Set());
            set.add(callback);
        }
        // Return an unsubscribe function.
        return () => {
            log(`${busdebug} unsubscribe from ${channels}`);
            for (let channel of channels) {
                let set = this._subs[channel];
                if (set !== undefined) {
                    set.delete(callback);
                    // Prune away channels with no subscribers.
                    if (set.size === 0) {
                        delete this._subs[channel];
                    }
                }
            }
        }
    }
    _expandChannelsToListeners(channel: Ch): (Ch | '*')[] {
        // changed:123 --> [changed:123, changed, *]

        let channels: (Ch | '*')[] = [channel];
        if (channel.indexOf(this._sep) !== -1) {
            let [baseChannel] = channel.split(this._sep, 1);
            channels.push(baseChannel as Ch);
        }
        channels.push('*');
        log(`${busdebug} _expandChannels "${channel}" -> ${JSON.stringify(channels)}`);
        return channels;
    }
    async sendAndWait(channel: Ch, data?: any): Promise<void> {
        // Send a message and wait for all subscribers to finish running.
        // Synchronous subscribers will block anyway.
        // For async subscribers, we await their promise.
        // The async subscribers will all run in parallel using Promise.all().

        // A channel gets expanded in order from most to least specific listeners: changed:12345, changed, *.
        // The callbacks are called in the same order, most specific to least.
        // The channel given to the callback is always the original, most specific version of the channel.
         
        // If a listener has an id, it will only be called when that id is present, not for generic events without ids.
        // Generic listeners with no id will be called for all events with or without ids.
        // In other words, generic listeners are act sort of like "changed:*"

        // send this   --> to these listeners:

        //               | listeners get...
        // --------------|-------------------------------------
        // message sent: | changed:123   changed       *
        // --------------|------------------------------------
        // changed:123   | changed:123   changed:123   changed:123
        // changed:444   |               changed:444   changed:444
        // changed       |               changed       changed
        // banana        |                             banana

        let listeners = this._expandChannelsToListeners(channel);
        for (let listener of listeners) {
            log(`${busdebug} sendAndWait(send ${channel} to ${listener} subscription, ${data})`);
            let cbs = this._subs[listener];
            if (cbs === undefined || cbs.size === 0) { continue; }
            let proms: Promise<any>[] = [];
            for (let cb of cbs) {
                // this might be a promise, or something else if the callback was synchronous
                let prom = cb(channel, data);
                if (prom instanceof Promise) {
                    proms.push(prom);
                }
            }
            await Promise.all(proms).finally();
            //await Promise.allSettled(proms);
        }
    }
    sendLater(channel: Ch, data?: any) {
        // Defer sending the message to the next tick.
        // Launch all the callbacks then, and don't wait for any of them to finish.
        // This function will immediately return before any callback code runs.
        //
        // Star listeners, and messages with ids, are handled the same way as sendAndWait.
        let listeners = this._expandChannelsToListeners(channel);
        for (let listener of listeners) {
            log(`${busdebug} sendAndWait(send ${channel} to ${listener} subscription, ${data})`);
            let cbs = this._subs[listener];
            if (cbs === undefined || cbs.size === 0) { continue; }
            process.nextTick(() => {
                for (let cb of cbs) {
                    cb(channel, data);
                }
            });
        }
    }
    removeAllSubscriptions() {
        // Remove all subscriptions
        log(`${busdebug} removeAllSubscriptions()`);
        for (let set of Object.values(this._subs)) {
            set.clear();
        }
        this._subs = {};
    }
}
