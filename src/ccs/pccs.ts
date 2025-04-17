/// <reference path="ccs.ts" />
/// <reference path="reducedparsetree.ts" />
/// <reference path="../../lib/util.d.ts" />

module PCCS {

    export type Distribution = MultiSetUtil.MultiSet<CCS.Process>;
    export const newDistribution = (p: MultiSetUtil.Entry<CCS.Process>[]) => new MultiSetUtil.MultiSet(p);

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
            let dist = newDistribution([entry1, entry2]);
            console.log("From", probability.num, probability.den, "to Distribution for new process:", dist);
            let result = new ProbabilisticProcess(dist);
            return this.processes[result.id] = result;
        }

        /** TODO: Distribution Process should probably be its own class if we keep this hack */
        public newDistributionProcess(dist: Distribution) {
            const process = new ProbabilisticProcess(dist);
            return this.processes[process.id] = process;
        }
    }

    export class ProbabilisticProcess implements CCS.Process {
        private ccs: string;
        // TODO: Remove this this and instead have left, right processes and probability
        public dist: Distribution;

        constructor(dist: Distribution) {
            this.dist = dist;
        }

        dispatchOn<T>(dispatcher: ProcessDispatchHandler<T>): T {
            return dispatcher.dispatchProbabilisticProcess(this);
        }

        toString() {
            // TODO: This is just a placeholder, we need to implement a proper toString method
            if (this.ccs) return this.ccs;
            return this.ccs = this.dist.getEntries().map(p => "(" + p.proc.toString() + ", " + p.weight + ")").join(" + ");
        }

        get id() {
            return this.toString();
        }

        getTargetById(targetId: string): { targetProcess: CCS.Process; probability: string } | null {
            this.dist.getEntries().forEach(({ proc: target, ..._ }) => {
                if (target.id == targetId) {
                    return target;
                }
            });
            return null;
        }

        public getTargetProcesses(): CCS.Process[] {
            return this.dist.getEntries().map(entry => entry.proc);
        }
    }

    export class StrictSuccessorGenerator extends CCS.StrictSuccessorGenerator implements CCS.SuccessorGenerator, PCCS.ProcessDispatchHandler<CCS.TransitionSet> {
        public probabilityDistributionGenerator: probabilityDistributionGenerator;

        constructor(public graph: Graph, cache?) {
            super(graph, cache);
            this.probabilityDistributionGenerator = new PCCS.probabilityDistributionGenerator(graph, this.getProcessByName.bind(this), cache);
        }

        /** 
        * WARN: PLEASE NEVER CALL THIS, PLEASE 
        * @deprecated 
        */
        dispatchProbabilisticProcess(process: ProbabilisticProcess): CCS.TransitionSet {
            throw new Error("Probabilistic processes should never be dispatched by StrictSuccessorGenerator");
        }

        dispatchActionPrefixProcess(process: CCS.ActionPrefixProcess): CCS.TransitionSet {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                // generate the next process with probability distribution generator as the process could be probabilistic
                const nextDistribution = this.probabilityDistributionGenerator.getProbabilityDistribution(process.nextProcess);
                const nextProcess = this.graph.newDistributionProcess(nextDistribution)
                transitionSet = this.cache[process.id] = new CCS.TransitionSet([new CCS.Transition(process.action, nextProcess)]);
            }
            return transitionSet;
        }

        dispatchCompositionProcess(process: CCS.CompositionProcess) {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new CCS.TransitionSet();
                var subTransitionSets = process.subProcesses.map(subProc => subProc.dispatchOn(this));
                // var defaultDistributions: Distribution[] = process.subProcesses.map(
                //     p => this.probabilityDistributionGenerator.getProbabilityDistribution(p)
                // );
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
                                    var targetDistributions: Distribution[] = process.subProcesses.map(
                                        p => this.probabilityDistributionGenerator.getProbabilityDistribution(p)
                                    );
                                    // TODO: Doing this map each iteration is really inefficient. Can easily be moved out and slices to copy.
                                    // Transition the 2 synchonising processes, leave the rest be (by adding a tau action)
                                    targetDistributions[i] = this.probabilityDistributionGenerator.getProbabilityDistribution(leftTransition.targetProcess);
                                    targetDistributions[j] = this.probabilityDistributionGenerator.getProbabilityDistribution(rightTransition.targetProcess);
                                    // Now we combine these to a single distribution instead of n different distributions
                                    // This is a fold operation, as we claim it can be done in steps. So for D1 | D2 | D3 | D4 do:
                                    // D12 | D3 | D4
                                    // D123 | D4
                                    // D1234
                                    // This works because parallelisation is both associative and commutative
                                    const finalDistribution = targetDistributions.reduce(
                                        (acc, curr) => MultiSetUtil.crossCombination((p) => new CCS.CompositionProcess(p), acc, curr),
                                        newDistribution([])
                                    )

                                    // Finally add the tau transition for this synchonisation
                                    transitionSet.add(new CCS.Transition(new CCS.Action("tau", false),
                                        this.graph.newDistributionProcess(finalDistribution)));
                                }
                            });
                        });
                    }
                }
                //COM1/2s
                subTransitionSets.forEach((subTransitionSet, index) => {
                    subTransitionSet.forEach(subTransition => {
                        var targetDistributions: Distribution[] = process.subProcesses.slice(0).map(
                            p => this.probabilityDistributionGenerator.getProbabilityDistribution(p)
                        );
                        //Only the index of the subprocess will have changed.
                        // Change targetProcess to distribution
                        targetDistributions[index] = this.probabilityDistributionGenerator.getProbabilityDistribution(subTransition.targetProcess);
                        // Do fold as in sync
                        const finalDistribution = targetDistributions.reduce(
                            (acc, curr) => MultiSetUtil.crossCombination((p) => new CCS.CompositionProcess(p), acc, curr),
                            new MultiSetUtil.MultiSet<CCS.Process>([])
                        )

                        // Finally add the tau transition for this synchonisation
                        transitionSet.add(new CCS.Transition(new CCS.Action("tau", false),
                            this.graph.newDistributionProcess(finalDistribution)));
                    });
                });
            }
            return transitionSet;
        }
    }


    // TODO: this class should use the cache to avoid recomputing the same process multiple times
    export class probabilityDistributionGenerator implements PCCS.ProcessDispatchHandler<Distribution> {
        private cache: { [id: string]: CCS.Process } = {};

        constructor(public graph: Graph, private getProcessbyName: (s: string) => CCS.Process, cache?) {
            this.cache = cache || {};
        }

        getProbabilityDistribution(process: CCS.Process): Distribution {
            return this.cache[process.id] = process.dispatchOn(this);
        }

        // TODO: Someone sanity check this
        dispatchProbabilisticProcess(process: ProbabilisticProcess) {
            const weightedDists = process.dist.getEntries().map(e => ({ dist: e.proc.dispatchOn(this), weight: e.weight }))

            // Wheighted union is done step-wise by keeping track of a total weight, in the same way you compute step-wise averages
            // Skip the first index when folding
            let { accDist } = weightedDists.slice(1).reduce(
                ({ accWeight, accDist }, { dist, weight }) => ({
                    accWeight: accWeight + weight,
                    accDist: MultiSetUtil.weightedUnion(
                        accDist, accWeight,
                        dist, weight
                    )
                }),
                // Start with first index
                { accDist: weightedDists[0].dist, accWeight: weightedDists[0].weight }
            )

            return accDist;
        }

        public dispatchActionPrefixProcess(process: CCS.ActionPrefixProcess) {
            return newDistribution([{ proc: process, weight: 1 }]);

        }

        dispatchNullProcess(process: CCS.NullProcess) {
            return newDistribution([{ proc: process, weight: 1 }]);
        }

        dispatchNamedProcess(process: CCS.NamedProcess) {
            // TODO: Ensure this works for `K=A 0.5 B`, which it does not at the moment
            // Simply expanding it leads to infinite recursion.
            // May be enough to only expand if it starts as a probability
            return newDistribution([{ proc: process, weight: 1 }]);
        }

        dispatchSummationProcess(process: CCS.SummationProcess) {
            const dist: Distribution = process.subProcesses.map(p => p.dispatchOn(this)).reduce(
                (curr, acc) => MultiSetUtil.crossCombination((p: CCS.Process[]) => this.graph.newSummationProcess(p), curr, acc),
                newDistribution([])
            )

            return dist;
        }

        dispatchCompositionProcess(process: CCS.CompositionProcess) {
            const dist: Distribution = process.subProcesses.map(p => p.dispatchOn(this)).reduce(
                (curr, acc) => MultiSetUtil.crossCombination((p: CCS.Process[]) => this.graph.newCompositionProcess(p), curr, acc),
                newDistribution([])
            )
            return dist;
        }

        dispatchRestrictionProcess(process: CCS.RestrictionProcess) {
            // TODO: Implement in accordance with semantics
            return process.subProcess.dispatchOn(this);
        }

        dispatchRelabellingProcess(process: CCS.RelabellingProcess) {
            // TODO: Implement in accordance with semantics
            return process.subProcess.dispatchOn(this);
        }
    }
}

module Traverse {
    export class PCCSUnguardedRecursionChecker extends Traverse.UnguardedRecursionChecker implements PCCS.ProcessDispatchHandler<boolean> {
        dispatchProbabilisticProcess(process: PCCS.ProbabilisticProcess) {
            var isUnguarded = false;
            process.dist.getEntries().forEach(({ proc: target, ..._ }) => {
                if (target.dispatchOn(this)) {
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
            process.dist.getEntries().forEach(({ proc: target, ..._ }) => {
                target.dispatchOn(this);
            });
            return process
        }
    }
}
