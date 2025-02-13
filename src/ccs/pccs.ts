/// <reference path="ccs.ts" />

module PCCS {

    export interface ProcessDispatchHandler<T> extends CCS.ProcessDispatchHandler<T> {
        dispatchProbabilisticProcess(process: ProbabilisticProcess): T;
    }

    export class Graph extends CCS.Graph {
        constructor() {
            super();
            this.unguardedRecursionChecker = new Traverse.TCCSUnguardedRecursionChecker();
        }

        public newProbabilisticProcess(probability: number, subProcesses: CCS.Process[]) {
            let result = new ProbabilisticProcess(probability, subProcesses);
            return this.processes[result.id] = result;
        }
    }

    export class ProbabilisticProcess implements CCS.Process {
        private ccs: string;
        constructor(public probability: number, public subProcesses: CCS.Process[]) {
        }
        dispatchOn<T>(dispatcher: ProcessDispatchHandler<T>): T {
            return dispatcher.dispatchProbabilisticProcess(this);
        }
        toString() {
            if (this.ccs) return this.ccs;
            return this.ccs = this.subProcesses.map(p => "(" + p.toString() + ")").join(" + ");
        }
        get id() {
            return this.toString();
        }
    }

    export class StrictSuccessorGenerator extends CCS.StrictSuccessorGenerator implements ProcessDispatchHandler<CCS.TransitionSet> {

        constructor(protected tccsgraph: Graph, cache?) {
            super(tccsgraph, cache);
        }

        public dispatchProbabilisticProcess(process: ProbabilisticProcess): CCS.TransitionSet {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new CCS.TransitionSet();
                process.subProcesses.forEach(subProcess => {
                    transitionSet.unionWith(subProcess.dispatchOn(this));
                });
            }
            return transitionSet;
        }
    }
}
