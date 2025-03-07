/// <reference path="ccs.ts" />
/// <reference path="reducedparsetree.ts" />

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

    export class PCCSNotationVisitor extends Traverse.CCSNotationVisitor implements CCS.ProcessVisitor<string>, PCCS.ProcessDispatchHandler<string> {
        public dispatchProbabilisticProcess(process: PCCS.ProbabilisticProcess) {
            var result = this.cache[process.id],
                subStr;
            if (!result) {
                subStr = process.subProcesses.map(subProc => subProc.dispatchOn(this));
                result = this.cache[process.id] = subStr.join(" ⊕0." + process.probability.toString() + " ");
            }
            return result
        }

        // override default action prefix in order to have parenthesis around probabalistic processes
        dispatchActionPrefixProcess(process : CCS.ActionPrefixProcess) {
            var result = this.cache[process.id],
                subStr;
            if (!result) {
                subStr = process.nextProcess.dispatchOn(this);
                subStr = wrapIfInstanceOf(subStr, process.nextProcess, [CCS.SummationProcess, CCS.CompositionProcess, PCCS.ProbabilisticProcess]);
                result = this.cache[process.id] = process.action.toString(true) + "." + subStr;
            }
            return result;
        }
    }


    export class PCCSProcessTreeReducer extends Traverse.ProcessTreeReducer implements CCS.ProcessVisitor<CCS.Process>, PCCS.ProcessDispatchHandler<CCS.Process> {

        constructor(private pccsgraph: PCCS.Graph) {
            super(pccsgraph);
        }

        // NOTE: this implementation may not be complete, it is just yanked from the PCCSUnguardedRecursionChecker
        // Look at dispatchSummationProcess in reducedparsetree.ts for inspiration
        // The implementation depends on how we process multiple probabalistic processes.
        dispatchProbabilisticProcess(process : PCCS.ProbabilisticProcess) {
            process.subProcesses.forEach(subProc => {
                subProc.dispatchOn(this)
            });
            return process
        }
    }
}
