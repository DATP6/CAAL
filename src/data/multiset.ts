module MultiSetUtil {

    // INFO: This is mostly generic simply to avoid cyclical references. This way we do not have to know about the CCS module
    export type Entry<T> = { proc: T, weight: number };

    export class MultiSet<T> {
        private _map: Map<T, number>

        constructor(entries: Entry<T>[]) {
            this._map = new Map();
            entries.forEach(e => this.add(e));
        }

        public getEntries(): Entry<T>[] {
            return Array.from(this._map.entries()).map(([key, val]) => ({ proc: key, weight: val }));
        }

        public getProbabilities(): (Entry<T> & { probability: number })[] {
            const size = this.size();
            return this.getEntries().map(e => ({ ...e, probability: e.weight / size }))
        }

        public size() {
            return this.getEntries().map(x => x.weight).reduce((acc, curr) => acc + curr, 0);
        }

        public add(entry: Entry<T>) {
            let weight = this._map.get(entry.proc) ?? 0;
            weight += entry.weight;
            this._map.set(entry.proc, weight);
        }

        public map(mapper: (entry: Entry<T>, index: number, entries: Entry<T>[]) => Entry<T>) {
            // Quick and dirty implementation. Can definitly be optimised
            const entries = this.getEntries();
            return new MultiSet(entries.map(mapper));
        }

        public clone() {
            return new MultiSet(this.getEntries());
        }
    }

    export const weightedUnion = <T>(setA: MultiSet<T>, weightA: number, setB: MultiSet<T>, weightB: number) => {
        if (weightA === 0)
            return setB.clone()
        if (weightB === 0)
            return setA.clone()
        const aSize = setA.size();
        const bSize = setB.size();
        const aEntries = setA.getEntries().map(x => ({ proc: x.proc, weight: x.weight * bSize * weightA }));
        const bEntries = setB.getEntries().map(x => ({ proc: x.proc, weight: x.weight * aSize * weightB }));

        return new MultiSet([...aEntries, ...bEntries]);
    }

    export const crossCombination = <T>(op: (procs: T[]) => T, left: MultiSet<T>, right: MultiSet<T>): MultiSet<T> => {
        if (left.size() === 0)
            return right;
        if (right.size() === 0)
            return left;

        const crossCombinedMS = new MultiSet<T>([]);
        for (const leftEntry of left.getEntries()) {
            for (const rightEntry of right.getEntries()) {
                const newProc = op([leftEntry.proc, rightEntry.proc]);
                crossCombinedMS.add({ proc: newProc, weight: leftEntry.weight * rightEntry.weight });
            }
        }

        return crossCombinedMS;
    }
}

