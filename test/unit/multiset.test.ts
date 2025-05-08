import { MultiSetUtil } from '../../src/data/multiset';

declare namespace MultiSetUtil {
    export type Entry<T> = { proc: T; weight: bigint };

    export class MultiSet<T> {
        private _map: Map<T, bigint>;

        constructor(entries: Entry<T>[]);

        public getEntries(): Entry<T>[];

        public getProbabilities(): (Entry<T> & { probability: bigint })[];

        public size(): bigint;

        public add(entry: Entry<T>): void;

        public map(mapper: (entry: Entry<T>, index: number, entries: Entry<T>[]) => Entry<T>): MultiSet<T>;

        public get(key: T): bigint | undefined;

        public support(): T[];

        public clone(): MultiSet<T>;

        public toString(): string;
    }

    export const singleWeightedUnion: <T>(
        setA: MultiSet<T>,
        weightA: bigint,
        setB: MultiSet<T>,
        weightB: bigint
    ) => MultiSet<T>;

    export const weightedUnion: <T>(
        dists: {
            dist: MultiSet<T>;
            weight: bigint;
        }[]
    ) => MultiSet<T>;
    export const crossCombination: <T>(op: (procs: T[]) => T, left: MultiSet<T>, right: MultiSet<T>) => MultiSet<T>;
}

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Fraction, fraction } from 'mathjs';

const arbWeight = (max?: bigint) => fc.bigInt({ min: 1n, max });

const sum = (x: bigint[]) => x.reduce((acc, curr) => acc + curr, 0n);
const prod = (x: bigint[]) => x.reduce((acc, curr) => acc * curr, 1n);

const arbMultiset = (maxLength?: number) =>
    fc
        .uniqueArray(
            fc.record({
                proc: fc.nat(),
                weight: arbWeight()
            }),
            {
                selector: ({ proc }) => proc,
                minLength: 1,
                maxLength
            }
        )
        .map((entries) => new MultiSetUtil.MultiSet(entries));

const arbDisjointWeightedMultisets = (maxCount?: number, maxLength?: number) =>
    fc.uniqueArray(
        fc.record({
            dist: arbMultiset(maxLength),
            weight: arbWeight()
        }),
        {
            selector: (w) => w.dist.support(),
            comparator: (sa, sb) => sa.some((a) => sb.some((b) => a == b)),
            minLength: 2,
            maxLength: maxCount
        }
    );

const arbWeightedMultisets = (maxCount?: number, maxLength?: number) =>
    fc.array(
        fc.record({
            dist: arbMultiset(maxLength),
            weight: arbWeight()
        }),
        {
            minLength: 2,
            maxLength: maxCount
        }
    );

describe('Multiset merge', () => {
    it('should give the correct value', () => {
        fc.assert(
            fc.property(arbWeightedMultisets(), (sets) => {
                const out = MultiSetUtil.weightedUnion(sets);
                const lengthProd = prod(sets.map(({ dist }) => dist.size()));
                const d = sum(sets.map(({ weight }) => weight)) * lengthProd;
                for (const a of out.support()) {
                    const n = sum(
                        sets.map(({ dist: x, weight: wx }) => (x.get(a) ?? 0n) * wx * (lengthProd / x.size()))
                    );
                    const expected = fraction(n, d);
                    const outFrac = fraction(out.get(a)!!, out.size());
                    expect(outFrac).toSatisfy(
                        (f: Fraction) => expected.equals(f),
                        `expected ratio: n: ${expected.n}, d: ${expected.d}.`
                    );
                }
            })
        );
    });

    it('should maintain ratio between probabilities with respect to weight', () => {
        fc.assert(
            fc.property(
                arbWeightedMultisets().chain((sets) =>
                    fc.tuple(fc.constantFrom(sets), fc.nat(sets.length - 1), fc.nat(sets.length - 1))
                ),
                ([sets, ai, bi]) => {
                    const { dist: a } = sets[ai];
                    const { dist: b } = sets[bi];
                    const out = MultiSetUtil.weightedUnion(sets);
                    const lengthProd = prod(sets.map(({ dist }) => dist.size()));
                    const d = sum(sets.map(({ weight }) => weight)) * lengthProd;

                    for (const ea of a.getEntries()) {
                        for (const eb of b.getEntries()) {
                            const outFrac = fraction(out.get(ea.proc)!!, out.get(eb.proc)!!);
                            const na = sum(
                                sets.map(
                                    ({ dist: x, weight }) => weight * (x.get(ea.proc) ?? 0n) * (lengthProd / x.size())
                                )
                            );
                            const nb = sum(
                                sets.map(
                                    ({ dist: x, weight }) => weight * (x.get(eb.proc) ?? 0n) * (lengthProd / x.size())
                                )
                            );
                            const fracA = fraction(na, d);
                            const fracB = fraction(nb, d);
                            const expected = fracA.div(fracB);
                            expect(outFrac).toSatisfy(
                                (f: Fraction) => f.equals(expected),
                                `expected ratio: n: ${expected.n}, d: ${expected.d}.`
                            );
                        }
                    }
                }
            )
        );
    });

    it('should maintain ratio between probabilities with respect to weight in disjoint multisets', () => {
        fc.assert(
            fc.property(
                arbDisjointWeightedMultisets().chain((sets) =>
                    fc.tuple(fc.constantFrom(sets), fc.nat(sets.length - 1), fc.nat(sets.length - 1))
                ),
                ([sets, ai, bi]) => {
                    const out = MultiSetUtil.weightedUnion(sets);
                    const { dist: a, weight: wa } = sets[ai];
                    const { dist: b, weight: wb } = sets[bi];
                    const aSize = a.size();
                    const bSize = b.size();
                    for (const ea of a.getEntries()) {
                        for (const eb of b.getEntries()) {
                            const outFrac = fraction(out.get(ea.proc)!!, out.get(eb.proc)!!);
                            const nx = ea.weight * wa * bSize;
                            const dy = eb.weight * wb * aSize;
                            const expected = fraction(nx, dy);
                            expect(outFrac).toSatisfy(
                                (f: Fraction) => f.equals(expected),
                                `expected ratio: n: ${expected.n}, d: ${expected.d}.`
                            );
                        }
                    }
                }
            )
        );
    });
});

describe('Multiset weighted union', () => {
    it('should maintain ratio between probabilities with respect to weight', () => {
        fc.assert(
            fc.property(arbWeightedMultisets(2), (sets) => {
                const { dist: a, weight: wa } = sets[0];
                const { dist: b, weight: wb } = sets[1];
                const out = MultiSetUtil.singleWeightedUnion(a, wa, b, wb);
                const aSize = a.size();
                const bSize = b.size();
                for (const ea of a.getEntries()) {
                    for (const eb of b.getEntries()) {
                        const outFrac = fraction(out.get(ea.proc)!!, out.get(eb.proc)!!);
                        const nx = ea.weight * wa * bSize + (b.get(ea.proc) ?? 0n) * wb * aSize;
                        const dy = eb.weight * wb * aSize + (a.get(eb.proc) ?? 0n) * wa * bSize;
                        const expected = fraction(nx, dy);
                        expect(outFrac).toSatisfy(
                            (f: Fraction) => f.equals(expected),
                            `expected ratio: n: ${expected.n}, d: ${expected.d}.`
                        );
                    }
                }
            })
        );
    });

    it('should maintain ratio between probabilities with respect to weight in disjoint multisets', () => {
        fc.assert(
            fc.property(arbDisjointWeightedMultisets(2), (sets) => {
                const { dist: a, weight: wa } = sets[0];
                const { dist: b, weight: wb } = sets[1];
                const out = MultiSetUtil.singleWeightedUnion(a, wa, b, wb);
                const aSize = a.size();
                const bSize = b.size();
                for (const ea of a.getEntries()) {
                    for (const eb of b.getEntries()) {
                        const outFrac = fraction(out.get(ea.proc)!!, out.get(eb.proc)!!);
                        const nx = ea.weight * wa * bSize;
                        const dy = eb.weight * wb * aSize;
                        const expected = fraction(nx, dy);
                        expect(outFrac).toSatisfy(
                            (f: Fraction) => f.equals(expected),
                            `expected ratio: n: ${expected.n}, d: ${expected.d}.`
                        );
                    }
                }
            })
        );
    });
});
