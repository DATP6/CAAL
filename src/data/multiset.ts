// HACK: We include the math.js library from index.html and the main webworker file
declare const math: any;

module MultiSetUtil {
    // INFO: This is mostly generic simply to avoid cyclical references. This way we do not have to know about the CCS module
    export type Entry<T> = { proc: T; weight: number };

    export class MultiSet<T> {
        private _map: Map<T, number> = new Map();
        private _size = 0;
        private _entries: Entry<T>[] = [];
        private entryMap: Map<T, number> = new Map();
        private _support: T[] = [];

        constructor(entries: Entry<T>[]) {
            entries.forEach((e) => this.add(e));
        }

        public get(key: T): number {
            return this._map.get(key);
        }

        public getEntries(): Entry<T>[] {
            return this._entries;
        }

        public getProbabilities(): (Entry<T> & { probability: number })[] {
            const size = this.size();
            return this.getEntries().map((e) => ({ ...e, probability: e.weight / size }));
        }

        public size() {
            return this._size;
        }

        public add(entry: Entry<T>) {
            let weight = this._map.get(entry.proc) ?? 0;
            weight += entry.weight;
            this._map.set(entry.proc, weight);
            this._size += weight;
            if (!this.entryMap.has(entry.proc)) {
                this.entryMap.set(entry.proc, this._entries.push({ ...entry }) - 1);
                this._support.push(entry.proc);
            }
            this._entries[this.entryMap.get(entry.proc)]!.weight = weight;
        }

        public map<U>(mapper: (entry: Entry<T>, index: number, entries: Entry<T>[]) => Entry<U>): MultiSet<U> {
            // Quick and dirty implementation. Can definitly be optimised
            const entries = this.getEntries();
            return new MultiSet(entries.map(mapper));
        }

        public support(): T[] {
            return this._support;
        }

        public clone() {
            return new MultiSet(this.getEntries());
        }

        /**
         * Return a copy of the multiset where all the weights are in their simplest form.
         * This means that `a.normalized()[x] = a[x]/gcd(a.weights)`.
         */
        public normalized(): MultiSet<T> {
            const d = math.gcd(0, ...this.getEntries().map((e) => e.weight));
            return this.map((e) => ({ ...e, weight: e.weight / d }));
        }

        /**
         * Return a string representation of the multiset.
         * The cache key of two multisets (under a total ordering) should be equal iff a.normalized()[x] == b.normalized()[y] for all x and y
         *
         * @param keyConversion Function to get a cache key from elements in the multiset. Like this function, keyConversion(x) == keyConversion(y) iff x and y are equivalent
         */
        public cacheKey(keyConversion: (a: T) => string, separator: string = '::'): string {
            return this.normalized()
                .getEntries()
                .map(({ proc, weight }) => keyConversion(proc) + ': ' + weight)
                .sort()
                .join(separator);
        }
    }

    const singleWeightedUnion = <T>(setA: MultiSet<T>, weightA: number, setB: MultiSet<T>, weightB: number) => {
        if (weightA === 0) return setB.clone();
        if (weightB === 0) return setA.clone();
        const aSize = setA.size();
        const bSize = setB.size();
        const aEntries = setA.getEntries().map((x) => ({ proc: x.proc, weight: x.weight * bSize * weightA }));
        const bEntries = setB.getEntries().map((x) => ({ proc: x.proc, weight: x.weight * aSize * weightB }));

        return new MultiSet([...aEntries, ...bEntries]);
    };

    /**
     * Performs a weighted union on multiple multisets
     *
     * Function signature is due to call site practicalities
     * */
    export const weightedUnion = <T>(dists: { dist: MultiSet<T>; weight: number }[]) => {
        // Wheighted union is done step-wise by keeping track of a total weight, in the same way you compute step-wise averages
        // Skip the first index when folding
        let { accDist } = dists.slice(1).reduce(
            ({ accWeight, accDist }, { dist, weight }) => ({
                accWeight: accWeight + weight,
                accDist: singleWeightedUnion(accDist, accWeight, dist, weight)
            }),
            // Start with first index
            { accDist: dists[0].dist, accWeight: dists[0].weight }
        );
        return accDist;
    };

    export const crossCombination = <T>(op: (procs: T[]) => T, left: MultiSet<T>, right: MultiSet<T>): MultiSet<T> => {
        if (left.size() === 0) return right;
        if (right.size() === 0) return left;

        const crossCombinedMS = new MultiSet<T>([]);
        for (const leftEntry of left.getEntries()) {
            for (const rightEntry of right.getEntries()) {
                const newProc = op([leftEntry.proc, rightEntry.proc]);
                crossCombinedMS.add({ proc: newProc, weight: leftEntry.weight * rightEntry.weight });
            }
        }

        return crossCombinedMS;
    };
}
