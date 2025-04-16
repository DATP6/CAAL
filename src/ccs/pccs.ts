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

        /** 
        * WARN: PLEASE NEVER CALL THIS, PLEASE 
        * @deprecated 
        */
        dispatchProbabilisticProcess(process: ProbabilisticProcess): CCS.TransitionSet {
            throw new Error("Probabilistic processes should never be dispatched");
        }

        dispatchActionPrefixProcess(process: CCS.ActionPrefixProcess): CCS.TransitionSet {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                // generate the next process with probability distribution generator as the process could be probabilistic
                var nextDistribution = this.probabilityDistubutionGenerator.getProbabilityDistribution(process.nextProcess);
                transitionSet = this.cache[process.id] = new CCS.TransitionSet([new CCS.Transition(process.action, nextDistribution)]);
            }
            return transitionSet;
        }

        dispatchCompositionProcess(process: CCS.CompositionProcess) {
            var transitionSet = this.cache[process.id],
                leftSet, rightSet;
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new TransitionSet();
                var subTransitionSets = process.subProcesses.map(subProc => subProc.dispatchOn(this));
                //COM3s
                for (var i = 0; i < subTransitionSets.length - 1; i++) {
                    for (var j = i + 1; j < subTransitionSets.length; j++) {
                        //For each pairs in  P1 | P2 | P3 | P4, find COM3 transitions.
                        var left = subTransitionSets[i];
                        var right = subTransitionSets[j];
                        left.forEach(leftTransition => {
                            right.forEach(rightTransition => {
                                // If they are able to synchronise
                                if (leftTransition.action.getLabel() === rightTransition.action.getLabel() &&
                                    leftTransition.action.isComplement() !== rightTransition.action.isComplement()) {
                                    //Need to construct entire set of new process.
                                    var targetSubprocesses = process.subProcesses.slice(0).map(x => x) // TODO: Map all elements to distributions of those elements
                                    // Transition the 2 synchonising processes, leave the rest be (by adding a tau action)
                                    // TODO: Change targetProcess to distribution
                                    targetSubprocesses[i] = leftTransition.targetProcess;
                                    targetSubprocesses[j] = rightTransition.targetProcess;
                                    // TODO: Now we need to combine these to a single distribution instead of n different distributions
                                    // This is a fold operation, as we claim it can be done in steps. So for D1 | D2 | D3 | D4 do:
                                    // D12 | D3 | D4
                                    // D123 | D4
                                    // D1234
                                    // This works because parallelisation is both associative and commutative

                                    // Finally add the tau transition for this synchonisation
                                    transitionSet.add(new Transition(new Action("tau", false),
                                        this.graph.newCompositionProcess(targetSubprocesses)));
                                }
                            });
                        });
                    }
                }
                //COM1/2s
                subTransitionSets.forEach((subTransitionSet, index) => {
                    subTransitionSet.forEach(subTransition => {
                        var targetSubprocesses = process.subProcesses.slice(0).map(x => x);// TODO: Map like fold
                        //Only the index of the subprocess will have changed.
                        //TODO: Change targetProcess to distribution
                        targetSubprocesses[index] = subTransition.targetProcess;
                        // TODO: Do fold as in sync
                        transitionSet.add(new Transition(subTransition.action.clone(),
                            this.graph.newCompositionProcess(targetSubprocesses)));
                    });
                });
            }
            return transitionSet;
        }

    }


    // TODO: this class should use the cache to avoid recomputing the same process multiple times
    export class probabilityDistubutionGenerator implements PCCS.ProcessDispatchHandler<PCCS.ProbabilisticProcess> {
        private cache: { [id: string]: CCS.Process } = {};

        constructor(public graph: Graph, private getProcessbyName: (s: string) => CCS.Process, cache?) {
            this.cache = cache || {};
        }

        getProbabilityDistribution(process: CCS.Process): PCCS.ProbabilisticProcess {
            return this.cache[process.id] = process.dispatchOn(this);
        }

        dispatchProbabilisticProcess(process: ProbabilisticProcess) {
            // TODO: flatten this
            process.dist.entries.forEach(entry => {
                process.flattenProbability(entry.proc, entry.proc.dispatchOn(this));
            })
            return process;
        }

        public dispatchActionPrefixProcess(process: CCS.ActionPrefixProcess) {
            let dist = new MultiSetUtil.MultiSet([{ proc: process, weight: 1 }]);
            return new ProbabilisticProcess(dist);
        }

        dispatchNullProcess(process: CCS.NullProcess) {
            return new ProbabilisticProcess(new MultiSetUtil.MultiSet([{ proc: process, weight: 1 }]));
        }

        dispatchNamedProcess(process: CCS.NamedProcess) {
            const distribution = new MultiSetUtil.MultiSet([{ proc: this.getProcessbyName(process.name).dispatchOn(this), weight: 1 }]);
            return new ProbabilisticProcess(distribution);
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
