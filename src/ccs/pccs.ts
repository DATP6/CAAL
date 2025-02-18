/// <reference path="ccs.ts" />

module PCCS {

    export interface ProcessDispatchHandler<T> extends CCS.ProcessDispatchHandler<T> {
        dispatchProbabilisticProcess(process: ProbabilisticProcess): T;
    }

    export class Graph extends CCS.Graph {
        constructor() {
            super();
            this.unguardedRecursionChecker = new Traverse.PCCSUnguardedRecursionChecker();
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

        constructor(protected pccsgraph: Graph, cache?) {
            super(pccsgraph, cache);
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

module Traverse {
    export class PCCSUnguardedRecursionChecker extends Traverse.UnguardedRecursionChecker implements PCCS.ProcessDispatchHandler<boolean> {
        dispatchProbabilisticProcess(process : PCCS.ProbabilisticProcess) {
            var isUnguarded = false;
            process.subProcesses.forEach(subProc => {
                if (subProc.dispatchOn(this)) {
                    isUnguarded = true;
                }
            });
            return isUnguarded;
        }
    }
}
