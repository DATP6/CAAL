/// <reference path="ccs.ts" />
/// <reference path="reducedparsetree.ts" />
/// <reference path="../data/multiset.ts" />

module PCCS {

    export interface ProcessDispatchHandler<T> extends CCS.ProcessDispatchHandler<T> {
        dispatchProbabilisticProcess(process: ProbabilisticProcess): T;
    }

    export class Graph extends CCS.Graph {
        constructor() {
            super();
            this.unguardedRecursionChecker = new Traverse.PCCSUnguardedRecursionChecker();
        }

        public newProbabilisticProcess(probability: { num: number, den: number }, subProcesses: CCS.Process[]) {
            let entry1 = { proc: subProcesses[0], weight: probability.num };
            let entry2 = { proc: subProcesses[1], weight: probability.den - probability.num };
            let dist = new MultiSetUtil.MultiSet([entry1, entry2]);
            let result = new ProbabilisticProcess(dist);
            return this.processes[result.id] = result;
        }
    }

    export class ProbabilisticProcess implements CCS.Process {
        private ccs: string;
        public dist: MultiSetUtil.MultiSet;

        constructor(dist: MultiSetUtil.MultiSet) {
            this.dist = dist;
        }

        dispatchOn<T>(dispatcher: ProcessDispatchHandler<T>): T {
            return dispatcher.dispatchProbabilisticProcess(this);
        }

        toString() {
            // TODO: This is just a placeholder, we need to implement a proper toString method
            if (this.ccs) return this.ccs;
            return this.ccs = this.dist.entries.map(p => "(" + p.proc.toString() + ", " + p.weight + ")").join(" + ");
        }

        get id() {
            return this.toString();
        }

        private flattenProbability(oldEntry: CCS.Process, newEntry: CCS.Process) {
            if (newEntry instanceof ProbabilisticProcess && oldEntry instanceof ProbabilisticProcess) {
                newEntry.scaleDist(oldEntry.dist.entries.weight);
                newTarget.dist.forEach(outcome => {
                    this.dist.push(outcome);
                });
                this.dist = this.dist.filter(target => target != oldTarget); // remove the old target
            }
        }

        // TODO: EACH NEW PROCESS SHOULD BE ADDED TO GRAPH OBJECT SO THAT WE CAN USE GETPROCESS_BY_ID()
        private convexCombination(process: ProbabilisticProcess) {
            let combinedProcesses = new ProbabilisticProcess(new MultiSetUtil.MultiSet([]));
            this.dist.entries.forEach(entry => {
                process.dist.entries.forEach(targetEntry => {
                    if (entry.proc instanceof CCS.SummationProcess && targetEntry.proc instanceof CCS.SummationProcess) {
                        let combination = { proc: new CCS.SummationProcess(entry.proc.subProcesses.concat(targetEntry.proc.subProcesses)), weight: targetEntry.weight };
                        combinedProcesses.dist.entries.push(combination);
                    } else if (entry.proc instanceof CCS.SummationProcess && targetEntry.proc instanceof CCS.ActionPrefixProcess) {
                        let combination = { proc: new CCS.SummationProcess(entry.proc.subProcesses.concat(targetEntry.proc)), weight: targetEntry.weight };
                        combinedProcesses.dist.entries.push(combination);
                    }
                });
                this.flattenProbability(entry.proc, combinedProcesses);
            });
        }

        getTargetById(targetId: string): { targetProcess: CCS.Process; probability: string } | null {
            this.dist.forEach(target => {
                if (target.targetProcess.id == targetId) {
                    return target.targetProcess;
                }
            });
            return null;
        }

        private scaleDist(scalar: string) {
            this.dist.forEach(outcome => {
                outcome.probability = (parseFloat('0.' + outcome.probability) * parseFloat('0.' + scalar)).toFixed(3).toString().slice(2);
            });
        }

        private getTargetProcesses(): CCS.Process[] {
            return this.dist.map(entry => entry.targetProcess);
        }

    }

    export class StrictSuccessorGenerator extends CCS.StrictSuccessorGenerator implements CCS.SuccessorGenerator, PCCS.ProcessDispatchHandler<CCS.TransitionSet> {
        public probabilityDistubutionGenerator;

        constructor(public graph: Graph, cache?) {
            super(graph, cache);
            this.probabilityDistubutionGenerator = new PCCS.probabilityDistubutionGenerator(graph, cache);
        }

        dispatchProbabilisticProcess(process: ProbabilisticProcess): CCS.TransitionSet {
            return new CCS.TransitionSet();
        }

        dispatchActionPrefixProcess(process: CCS.ActionPrefixProcess): CCS.TransitionSet {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                // generate the next process with probability distribution generator as the process could be probabilistic
                var nextProcess = this.probabilityDistubutionGenerator.getProbabilityDistribution(process.nextProcess.id);
                transitionSet = this.cache[process.id] = new CCS.TransitionSet([new CCS.Transition(process.action, nextProcess)]);
            }
            return transitionSet;
        }

    }


    // TODO: this class should use the cache to avoid recomputing the same process multiple times
    export class probabilityDistubutionGenerator implements PCCS.ProcessDispatchHandler<CCS.Process> {
        private cache: { [id: string]: CCS.Process } = {};

        constructor(public graph: Graph, cache?) {
            this.cache = cache || {};
        }

        getProbabilityDistribution(processId: CCS.ProcessId): CCS.Process {
            var process = this.graph.processById(processId);
            return this.cache[process.id] = process.dispatchOn(this);
        }

        dispatchProbabilisticProcess(process: ProbabilisticProcess): CCS.Process {
            process.dist.entries.forEach(entry => {
                process.flattenProbability(entry.proc, entry.proc.dispatchOn(this));
            })
            return process;
        }

        public dispatchActionPrefixProcess(process: CCS.ActionPrefixProcess): CCS.Process {
            // TODO: fix graph?
            // return this.graph.newProbabilisticProcess(["1"], [process]); // adding it to the graph causes error. pls fix :)
            let dist = new MultiSetUtil.MultiSet([{ proc: process, weight: 1 }]);
            return new ProbabilisticProcess(dist);
        }

        dispatchNullProcess(process: CCS.NullProcess) {
            // return process;
            return new ProbabilisticProcess([{ targetProcess: process, probability: "1" }]);
        }

        dispatchNamedProcess(process: CCS.NamedProcess) {
            // return process;
            return new ProbabilisticProcess([{ targetProcess: process, probability: "1" }]);
        }

        dispatchSummationProcess(process: CCS.SummationProcess) {
            let proc = new MultiSetUtil.MultiSet([{ proc: new CCS.SummationProcess([]), weight: 1 }]);
            let probProcess = new ProbabilisticProcess(proc);

            process.subProcesses.forEach(subProcess => {
                probProcess.convexCombination(subProcess.dispatchOn(this));
            });
            this.graph.addProcesses(probProcess.getTargetProcesses());

            return probProcess;
        }

        dispatchCompositionProcess(process: CCS.CompositionProcess) {
            // if any of the subProcesses are probabilistic, we need to handle them
            return this.graph.newProbabilisticProcess(["1"], [process]);
        }

        dispatchRestrictionProcess(process: CCS.RestrictionProcess) {
            return process.subProcess.dispatchOn(this);
        }

        dispatchRelabellingProcess(process: CCS.RelabellingProcess) {
            return process.subProcess.dispatchOn(this);
        }
    }
}

module Traverse {
    export class PCCSUnguardedRecursionChecker extends Traverse.UnguardedRecursionChecker implements PCCS.ProcessDispatchHandler<boolean> {
        dispatchProbabilisticProcess(process: PCCS.ProbabilisticProcess) {
            var isUnguarded = false;
            process.dist.forEach(target => {
                if (target.targetProcess.dispatchOn(this)) {
                    isUnguarded = true;
                }
            });
            return true;
        }
    }

    export class PCCSProcessTreeReducer extends Traverse.ProcessTreeReducer implements CCS.ProcessVisitor<CCS.Process>, PCCS.ProcessDispatchHandler<CCS.Process> {

        constructor(private pccsgraph: PCCS.Graph) {
            super(pccsgraph);
        }

        // NOTE: this implementation may not be complete, it is just yanked from the PCCSUnguardedRecursionChecker
        // Look at dispatchSummationProcess in reducedparsetree.ts for inspiration
        // The implementation depends on how we process multiple probabalistic processes.
        dispatchProbabilisticProcess(process: PCCS.ProbabilisticProcess) {
            process.dist.forEach(target => {
                target.targetProcess.dispatchOn(this)
            });
            return process
        }
    }
}
