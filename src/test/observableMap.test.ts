import t = require('tap');
//t.runOnly = true;

import { ObservableMap } from '../observableMap'

//================================================================================ 
// LOGGING

let log = console.log;
//let log = (...args: any[]) => {};

//================================================================================ 

t.test('map: basics (without async)', async (t: any) => {
    let map = new ObservableMap();

    t.same(map.size, 0, 'size 0');
    t.same(map.has('a'), false, 'has("a") is false');

    map.set('a', 'a1');
    t.same(map.get('a'), 'a1', 'can set and get without await')

    t.same(map.size, 1, 'size 1');
    t.same(map.has('a'), true, 'has("a") is true');
    t.same([...map.keys()], ['a'], 'keys');
    t.same([...map.values()], ['a1'], 'values');
    t.same([...map.entries()], [['a', 'a1']], 'entries');
    let entries: any[] = [];
    map.forEach((value, key) => {
        entries.push([key, value]);
    });
    t.same(entries, [['a', 'a1']], 'entries from forEach');

    map.set('a', 'a2');
    t.same(map.get('a'), 'a2', 'can set and get without await')
    map.delete('a');
    t.same(map.get('a'), undefined, 'can delete without await');

    t.same([...map.keys()], [], 'no keys left');
    t.same(map.size, 0, 'size 0');

    t.done();
});

t.test('map: constructor', async (t: any) => {
    let m1 = new ObservableMap();
    m1.set('a', 'a1');
    let m2 = new ObservableMap(m1);
    t.same(m2.get('a'), 'a1', 'cloned from ObservableMap');

    let map = new Map<string, string>();
    map.set('b', 'b1');
    let m3 = new ObservableMap(map);
    t.same(m3.get('b'), 'b1', 'cloned from Map');

    let m4 = new ObservableMap(map.entries());
    t.same(m4.get('b'), 'b1', 'cloned from iterable');

    let m5 = new ObservableMap([['c', 'c1']]);
    t.same(m5.get('c'), 'c1', 'cloned from array');

    let m6 = new ObservableMap(null, '|');
    let event6Happened = false;
    m6.events.on('added|a', (channel, data) => {
        event6Happened = true;
    });
    m6.set('a', 'a1');
    t.same(event6Happened, true, 'sep was changed with (null, "|")');

    let m7 = new ObservableMap(undefined, '/');
    let event7Happened = false;
    m7.events.on('added/a', (channel, data) => {
        event7Happened = true;
    });
    m7.set('a', 'a1');
    t.same(event7Happened, true, 'sep was changed with (undefined, "/")');

    let m8 = new ObservableMap();
    let event8Happened = false;
    m8.events.on('added:a', (channel, data) => {
        event8Happened = true;
    });
    m8.set('a', 'a1');
    t.same(event8Happened, true, 'sep defaults to ":"');

    t.done();
});

interface Event {
    id: string,
    channel: string,
    data: any;
}
t.test('map: events', async (t: any) => {
    let map = new ObservableMap();

    let events: Event[] = [];
    map.events.on('added', (channel, data) => {
        events.push({ id: 'a', channel, data });
    });
    map.events.on('added:aaa', (channel, data) => {
        events.push({ id: 'a:aaa', channel, data });
    });
    map.events.on('changed', (channel, data) => {
        events.push({ id: 'c', channel, data });
    });
    map.events.on('changed:aaa', (channel, data) => {
        events.push({ id: 'c:aaa', channel, data });
    });
    map.events.on('deleted', (channel, data) => {
        events.push({ id: 'd', channel, data });
    });
    map.events.on('deleted:aaa', (channel, data) => {
        events.push({ id: 'd:aaa', channel, data });
    });
    map.events.on('deleted:bbb', (channel, data) => {
        events.push({ id: 'd:bbb', channel, data });
    });
    map.events.on('*', (channel, data) => {
        events.push({ id: 'star', channel, data });
    });

    events = [];
    await map.delete('x');
    t.same(events, [], 'failed delete makes no event');

    events = [];
    await map.set('aaa', 'aaa1');
    t.same(events, [
        // in order from most specific to least
        { id: 'a:aaa', channel: 'added:aaa', data: { key: 'aaa', value: 'aaa1' }},
        { id: 'a',     channel: 'added:aaa', data: { key: 'aaa', value: 'aaa1' }},
        { id: 'star',  channel: 'added:aaa', data: { key: 'aaa', value: 'aaa1' }},
    ], 'added events');

    events = [];
    await map.set('aaa', 'aaa2');
    t.same(events, [
        { id: 'c:aaa', channel: 'changed:aaa', data: { key: 'aaa', value: 'aaa2', oldValue: 'aaa1' }},
        { id: 'c',     channel: 'changed:aaa', data: { key: 'aaa', value: 'aaa2', oldValue: 'aaa1' }},
        { id: 'star',  channel: 'changed:aaa', data: { key: 'aaa', value: 'aaa2', oldValue: 'aaa1' }},
    ], 'changed events');

    events = [];
    await map.set('aaa', 'aaa2');
    t.same(events, [], 'no-op change events');

    events = [];
    await map.delete('aaa');
    t.same(events, [
        { id: 'd:aaa', channel: 'deleted:aaa', data: { key: 'aaa', oldValue: 'aaa2' }},
        { id: 'd',     channel: 'deleted:aaa', data: { key: 'aaa', oldValue: 'aaa2' }},
        { id: 'star',  channel: 'deleted:aaa', data: { key: 'aaa', oldValue: 'aaa2' }},
    ], 'changed events');

    t.same(map.size, 0, 'map should be empty at this point');

    // clear
    await map.set('aaa', 'aaa1');
    await map.set('bbb', 'bbb1');
    events = [];
    await map.clear();
    t.same(events, [
        { id: 'd:aaa', channel: 'deleted:aaa', data: { key: 'aaa', oldValue: 'aaa1' }},
        { id: 'd',     channel: 'deleted:aaa', data: { key: 'aaa', oldValue: 'aaa1' }},
        { id: 'star',  channel: 'deleted:aaa', data: { key: 'aaa', oldValue: 'aaa1' }},

        { id: 'd:bbb', channel: 'deleted:bbb', data: { key: 'bbb', oldValue: 'bbb1' }},
        { id: 'd',     channel: 'deleted:bbb', data: { key: 'bbb', oldValue: 'bbb1' }},
        { id: 'star',  channel: 'deleted:bbb', data: { key: 'bbb', oldValue: 'bbb1' }},
    ], 'changed events');

    t.same(map.size, 0, 'map should be empty at this point');

    t.done();
});
