/// <reference path="../ccs/ccs.ts" />
module MultiSetUtil {

    type Entry = { proc: CCS.Process, weight: number };

    export class MultiSet {
        private map: Record<string, Entry>

        constructor(entries: Entry[]) {
            this.map = {};
            entries.forEach(e => this.add(e));
        }

        public getEntries() {
            return Object.values(this.map);
        }

        public size() {
            return this.getEntries().map(x => x.weight).reduce((acc, curr) => acc + curr, 0);
        }

        public add(entry: Entry) {
            const current = this.map[entry.proc.id] ?? { proc: entry.proc, weight: 0 };
            current.weight += entry.weight;
            this.map[entry.proc.id] = current;
        }
    }

    export const weightedUnion = (setA: MultiSet, weightA: number, setB: MultiSet, weightB: number) => {
        const aSize = setA.size();
        const bSize = setB.size();
        const aEntries = setA.getEntries().map(x => ({ proc: x.proc, weight: x.weight * bSize * weightA }));
        const bEntries = setB.getEntries().map(x => ({ proc: x.proc, weight: x.weight * aSize * weightB }));

        return new MultiSet([...aEntries, ...bEntries]);
    }
}

