module MultiSetUtil {

    type Entry = { proc: CCS.Process, weight: number };

    export class MultiSet {
        public entries: Entry[];

        constructor(entries: Entry[]) {
            this.entries = entries;

        }

        private flattenDist() {
            let flattened: Entry[] = [];

            this.entries.forEach(entry => {
                if (entry instanceof MultiSet) {

                }
            })
        }
    }
}


let entry1 = { proc: subProcesses[0], weight: probability.num };
let entry2 = { proc: subProcesses[1], weight: probability.den - probability.num };
let dist = new MultiSetUtil.MultiSet([entry1, entry2]);
