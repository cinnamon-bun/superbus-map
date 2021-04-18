import equal from 'fast-deep-equal';
import clone from 'rfdc';

export let deepEqual = equal;
export let deepCopy = clone();

//================================================================================

export let log = console.log;
    
export let sleep = (ms: number) => {
    return new Promise((res, rej) => {
        setTimeout(res, ms);
    });
}

export let remap = (x: number, oldLo: number, oldHi: number, newLo: number, newHi: number ): number => {
    let pct = (x - oldLo) / (oldHi - oldLo);
    return newLo + (newHi - newLo) * pct;
}

export let randRange = (lo: number, hi: number): number =>
    remap(Math.random(), 0, 1, lo, hi);

