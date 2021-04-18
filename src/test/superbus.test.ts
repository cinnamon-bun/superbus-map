import t = require('tap');
//t.runOnly = true;

import { Superbus } from '../superbus';
import { randRange, sleep } from '../utils';

//================================================================================ 
// LOGGING

//let log = console.log;
let log = (...args: any[]) => {};
let handlerdebug = '   🖐';

//================================================================================ 

t.test('bus: basics', async (t: any) => {
    let bus = new Superbus();

    let logs: string[] = [];
    bus.on('open', (channel) => { logs.push('a-'+channel); });
    let unsub = bus.on('close', (channel) => { logs.push('b-'+channel); });

    logs.push('-start');

    await bus.sendAndWait('open');
    await bus.sendAndWait('close');

    logs.push('-end');

    t.same(logs, '-start a-open b-close -end'.split(' '), 'logs in order');

    logs = [];
    unsub();
    await bus.sendAndWait('open');
    await bus.sendAndWait('close');
    bus.removeAllSubscriptions();
    await bus.sendAndWait('open');
    t.same(logs, ['a-open'], 'logs end after removing all subscriptions');

    t.done();
});

t.test('bus: multi-subscribe with sendAndWait', async (t: any) => {
    let bus = new Superbus();

    let logs = [];
    log('-');
    bus.on(['open', 'close'], (channel) => {
        log(`${handlerdebug} open and close handler got: "${channel}"`);
        logs.push('a-'+channel);
    });
    log('-');
    bus.on('*', (channel) => {
        log(`${handlerdebug} star handler got: "${channel}"`);
        logs.push('b-'+channel);
    });
    log('-');

    //log(bus._subsAndCounts());

    logs.push('-start');

    log('-');
    await bus.sendAndWait('open');
    log('-');
    await bus.sendAndWait('banana');
    log('-');
    await bus.sendAndWait('close');
    log('-');

    logs.push('-end');

    t.same(logs, `
        -start
        a-open
        b-open
        b-banana
        a-close
        b-close
        -end`.trim().split('\n').map(x => x.trim())
        , 'logs in order');

    t.done();
});

t.test('bus: channels with ids', async (t: any) => {
    let bus = new Superbus();

    let logs = [];
    log('-');
    bus.on('changed', (channel) => {
        log(`${handlerdebug} changed handler got: "${channel}"`);
        logs.push('c-'+channel);
    });
    log('-');
    bus.on('changed:12345', (channel) => {
        log(`${handlerdebug} changed:12345 handler got: "${channel}"`);
        logs.push('cid-'+channel);
    });
    log('-');
    bus.on('*', (channel) => {
        log(`${handlerdebug} star handler got: "${channel}"`);
        logs.push('*-'+channel);
    });
    log('-');

    //log(bus._subsAndCounts());

    logs.push('-start');

    log('-');
    await bus.sendAndWait('changed');
    log('-');
    await bus.sendAndWait('zzz');
    log('-');
    await bus.sendAndWait('changed:12345');
    log('-');

    logs.push('-end');

    // a channel gets expanded in order from most to least specific: changed:12345, changed, *.
    // the callbacks are called in the same order, most specific to least.
    // the channel given to the callback is always the original, most specific version of the channel.

    t.same(logs, `
        -start
        c-changed
        *-changed
        *-zzz
        cid-changed:12345
        c-changed:12345
        *-changed:12345
        -end`.trim().split('\n').map(x => x.trim())
        , 'logs in order');

    t.done();
});

interface Event {
    id: string,
    channel: string,
    data: any;
}
t.test('bus: channels with ids and extra separators', async (t: any) => {
    let bus = new Superbus();
    let events: Event[] = [];

    bus.on('changed', (channel, data) => {
        events.push({ id: 'c', channel, data });
    });
    bus.on('changed:aaa', (channel, data) => {
        events.push({ id: 'c:aaa', channel, data });
    });
    bus.on('changed:aaa:bbb', (channel, data) => {
        events.push({ id: 'c:aaa:bbb', channel, data });
    });
    bus.on('*', (channel, data) => {
        events.push({ id: 'star', channel, data });
    });

    await bus.sendAndWait('changed:aaa:bbb', 123);  // two colons
    t.same(events, [
        // c:aaa should not be triggered
        { id: 'c:aaa:bbb', channel: 'changed:aaa:bbb', data: 123 },
        { id: 'c',         channel: 'changed:aaa:bbb', data: 123 },
        { id: 'star',      channel: 'changed:aaa:bbb', data: 123 },
    ], 'events match');
    t.done();
});

t.test('bus: sendAndWait', async (t: any) => {
    let bus = new Superbus();

    let logs = [];
    bus.on('event', async (channel) => {
        await sleep(randRange(10, 20));
        logs.push('a1-'+channel);
    });
    bus.on('event', async (channel) => {
        await sleep(randRange(30, 40));
        logs.push('a2-'+channel);
    });
    bus.on('event', async (channel) => {
        await sleep(randRange(50, 60));
        logs.push('a3-'+channel);
    });
    bus.on('event', (channel) => { logs.push('s-'+channel); });

    bus.on('before', (channel) => { logs.push('s-'+channel); });
    bus.on('after', (channel) => { logs.push('s-'+channel); });

    //log(bus._subsAndCounts());

    logs.push('-start');

    await bus.sendAndWait('before');
    await bus.sendAndWait('event');
    await bus.sendAndWait('after');

    logs.push('-end');

    // TODO:
    // if you subscribe to 'changed'
    // and get sent 'changed:12345',
    // which should you receive in your callback?
    // for now it's 'changed'.

    t.same(logs, `
        -start
        s-before
        s-event
        a1-event
        a2-event
        a3-event
        s-after
        -end`.trim().split('\n').map(x => x.trim())
        , 'logs in order');

    t.done();
});

t.test('bus: sendLater', async (t: any) => {
    let bus = new Superbus();

    let logs = [];
    bus.on('event', async (channel) => {
        await sleep(randRange(10, 20));
        logs.push('a1-'+channel);
    });
    bus.on('event', async (channel) => {
        await sleep(randRange(30, 40));
        logs.push('a2-'+channel);
    });
    bus.on('event', async (channel) => {
        await sleep(randRange(50, 60));
        logs.push('a3-'+channel);
    });
    bus.on('event', (channel) => { logs.push('s-'+channel); });

    bus.on('before', (channel) => { logs.push('s-'+channel); });
    bus.on('after', (channel) => { logs.push('s-'+channel); });

    //log(bus._subsAndCounts());

    logs.push('-start');

    bus.sendLater('before');
    bus.sendLater('event');
    bus.sendLater('after');

    logs.push('-end');

    await sleep(70);
    log(JSON.stringify(logs, null, 4));

    // TODO:
    // if you subscribe to 'changed'
    // and get sent 'changed:12345',
    // which should you receive in your callback?
    // for now it's 'changed'.

    // the s- ones run nextTick but they're synchronous, so they
    // happen fast.
    // the a- ones start nextTick but sleep for various times
    // so they happen later.
    t.same(logs, `
        -start
        -end
        s-before
        s-event
        s-after
        a1-event
        a2-event
        a3-event
        `.trim().split('\n').map(x => x.trim())
        , 'logs in order');

    t.done();
});
