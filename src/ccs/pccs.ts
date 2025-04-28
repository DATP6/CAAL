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

        public newProbabilisticProcess(probability: { num: number; den: number }, subProcesses: CCS.Process[]) {
            let entry1 = { proc: subProcesses[0], weight: probability.num };
            let entry2 = { proc: subProcesses[1], weight: probability.den - probability.num };
            let dist = newDistribution([entry1, entry2]);
            let result = new ProbabilisticProcess(dist);
            return (this.processes[result.id] = result);
        }

        /** TODO: Distribution Process should probably be its own class if we keep this hack */
        public newDistributionProcess(dist: Distribution) {
            const process = new ProbabilisticProcess(dist);
            return (this.processes[process.id] = process);
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
            if (this.ccs) return this.ccs;
            return (this.ccs = this.dist
                .getEntries()
                .map((p) => '(' + p.proc.toString() + ', ' + p.weight + ')')
                .join(' + '));
        }

        get id() {
            return this.toString();
        }

        getTargetById(targetId: string): { targetProcess: CCS.Process; probability: string } | null {
            this.dist.getEntries().forEach(({ proc: target }) => {
                if (target.id == targetId) {
                    return target;
                }
            });
            return null;
        }

        public getTargetProcesses(): CCS.Process[] {
            return this.dist.getEntries().map((entry) => entry.proc);
        }
    }

    export class StrictSuccessorGenerator
        extends CCS.StrictSuccessorGenerator
        implements CCS.SuccessorGenerator, PCCS.ProcessDispatchHandler<CCS.TransitionSet>
    {
        public ProbabilityDistributionGenerator: ProbabilityDistributionGenerator;

        constructor(
            public graph: Graph,
            cache?
        ) {
            super(graph, cache);
            this.ProbabilityDistributionGenerator = new PCCS.ProbabilityDistributionGenerator(
                graph,
                this.getProcessByName.bind(this),
                cache
            );
        }

        /**
         * WARN: PLEASE NEVER CALL THIS, PLEASE
         * @deprecated
         */
        dispatchProbabilisticProcess(process: ProbabilisticProcess): CCS.TransitionSet {
            throw new Error('Probabilistic processes should never be dispatched by StrictSuccessorGenerator');
        }

        dispatchActionPrefixProcess(process: CCS.ActionPrefixProcess): CCS.TransitionSet {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                // generate the next process with probability distribution generator as the process could be probabilistic
                const nextDistribution = this.ProbabilityDistributionGenerator.getProbabilityDistribution(
                    process.nextProcess
                );
                const nextProcess = this.graph.newDistributionProcess(nextDistribution);
                transitionSet = this.cache[process.id] = new CCS.TransitionSet([
                    new CCS.Transition(process.action, nextProcess)
                ]);
            }
            return transitionSet;
        }

        dispatchCompositionProcess(process: CCS.CompositionProcess) {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new CCS.TransitionSet();
                var subTransitionSets = process.subProcesses.map((subProc) => subProc.dispatchOn(this));
                //COM3s
                for (var i = 0; i < subTransitionSets.length - 1; i++) {
                    for (var j = i + 1; j < subTransitionSets.length; j++) {
                        //For each pairs in  P1 | P2 | P3 | P4, find COM3 transitions.
                        var left = subTransitionSets[i];
                        var right = subTransitionSets[j];
                        left.forEach((leftTransition) => {
                            right.forEach((rightTransition) => {
                                // If they are able to synchronise
                                if (
                                    leftTransition.action.getLabel() === rightTransition.action.getLabel() &&
                                    leftTransition.action.isComplement() !== rightTransition.action.isComplement()
                                ) {
                                    // TODO: Doing this map each iteration is really inefficient. Can easily be moved out and slices to copy.
                                    var targetDistributions: Distribution[] = process.subProcesses.map((p) =>
                                        this.ProbabilityDistributionGenerator.getProbabilityDistribution(p)
                                    );
                                    // Transition the 2 synchonising processes, leave the rest be (by adding a tau action)
                                    targetDistributions[i] =
                                        this.ProbabilityDistributionGenerator.getProbabilityDistribution(
                                            leftTransition.targetProcess
                                        );
                                    targetDistributions[j] =
                                        this.ProbabilityDistributionGenerator.getProbabilityDistribution(
                                            rightTransition.targetProcess
                                        );
                                    // Now we combine these to a single distribution instead of n different distributions
                                    // This is a fold operation, as we claim it can be done in steps. So for D1 | D2 | D3 | D4 do:
                                    // D12 | D3 | D4
                                    // D123 | D4
                                    // D1234
                                    // This works because parallelisation is both associative and commutative
                                    const finalDistribution = targetDistributions.reduce(
                                        (acc, curr) =>
                                            MultiSetUtil.crossCombination(
                                                (p) => this.graph.newCompositionProcess(p),
                                                acc,
                                                curr
                                            ),
                                        newDistribution([])
                                    );

                                    // Finally add the tau transition for this synchonisation
                                    transitionSet.add(
                                        new CCS.Transition(
                                            new CCS.Action('tau', false),
                                            this.graph.newDistributionProcess(finalDistribution)
                                        )
                                    );
                                }
                            });
                        });
                    }
                }
                //COM1/2s
                subTransitionSets.forEach((subTransitionSet, index) => {
                    subTransitionSet.forEach((subTransition) => {
                        var targetDistributions: Distribution[] = process.subProcesses
                            .slice(0)
                            .map((p) => this.ProbabilityDistributionGenerator.getProbabilityDistribution(p));
                        //Only the index of the subprocess will have changed.
                        // Change targetProcess to distribution
                        targetDistributions[index] = this.ProbabilityDistributionGenerator.getProbabilityDistribution(
                            subTransition.targetProcess
                        );
                        // Do fold as in sync
                        const finalDistribution = targetDistributions.reduce(
                            (acc, curr) =>
                                MultiSetUtil.crossCombination((p) => this.graph.newCompositionProcess(p), acc, curr),
                            new MultiSetUtil.MultiSet<CCS.Process>([])
                        );

                        // Finally add the tau transition for this synchonisation
                        transitionSet.add(
                            new CCS.Transition(
                                subTransition.action.clone(),
                                this.graph.newDistributionProcess(finalDistribution)
                            )
                        );
                    });
                });
            }
            return transitionSet;
        }

        dispatchRestrictionProcess(process: CCS.RestrictionProcess) {
            var transitionSet = this.cache[process.id],
                subTransitionSet;
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new CCS.TransitionSet();
                subTransitionSet = process.subProcess.dispatchOn(this).clone();
                subTransitionSet.applyRestrictionSet(process.restrictedLabels);
                // Restrict each process in remaining distributions
                subTransitionSet.forEach((transition) => {
                    // TODO: Find a way to make this cast typesafe
                    const target = transition.targetProcess as ProbabilisticProcess;
                    const restrictedDist = target.dist.map((e) => ({
                        ...e,
                        proc: this.graph.newRestrictedProcess(e.proc, process.restrictedLabels)
                    }));
                    const restrictedProcess = this.graph.newDistributionProcess(restrictedDist);
                    transitionSet.add(new CCS.Transition(transition.action.clone(), restrictedProcess));
                });
            }
            return transitionSet;
        }

        dispatchRelabellingProcess(process: CCS.RelabellingProcess) {
            var transitionSet = this.cache[process.id],
                subTransitionSet;
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new CCS.TransitionSet();
                subTransitionSet = process.subProcess.dispatchOn(this).clone();
                subTransitionSet.applyRelabelSet(process.relabellings);
                // Relabel each process in distributions
                subTransitionSet.forEach((transition) => {
                    // TODO: Find a way to make this cast typesafe
                    const target = transition.targetProcess as ProbabilisticProcess;
                    const restrictedDist = target.dist.map((e) => ({
                        ...e,
                        proc: this.graph.newRelabelingProcess(e.proc, process.relabellings)
                    }));
                    const relabeledProcess = this.graph.newDistributionProcess(restrictedDist);
                    transitionSet.add(new CCS.Transition(transition.action.clone(), relabeledProcess));
                });
            }
            return transitionSet;
        }
    }

    // TODO: this class should use the cache to avoid recomputing the same process multiple times
    export class ProbabilityDistributionGenerator implements PCCS.ProcessDispatchHandler<Distribution> {
        private cache: { [id: string]: Distribution } = {};

        constructor(
            public graph: Graph,
            private getProcessbyName: (s: string) => CCS.Process,
            cache?
        ) {
            this.cache = cache || {};
        }

        getProbabilityDistribution(process: CCS.Process): Distribution {
            return (this.cache[process.id] ??= process.dispatchOn(this));
        }

        // TODO: Someone sanity check this
        dispatchProbabilisticProcess(process: ProbabilisticProcess) {
            let result = this.cache[process.id];
            if (result) return result;

            const weightedDists = process.dist
                .getEntries()
                .map((e) => ({ dist: e.proc.dispatchOn(this), weight: e.weight }));

            // Wheighted union is done step-wise by keeping track of a total weight, in the same way you compute step-wise averages
            // Skip the first index when folding
            let { accDist } = weightedDists.slice(1).reduce(
                ({ accWeight, accDist }, { dist, weight }) => ({
                    accWeight: accWeight + weight,
                    accDist: MultiSetUtil.weightedUnion(accDist, accWeight, dist, weight)
                }),
                // Start with first index
                { accDist: weightedDists[0].dist, accWeight: weightedDists[0].weight }
            );

            return (this.cache[process.id] = accDist);
        }

        public dispatchActionPrefixProcess(process: CCS.ActionPrefixProcess) {
            let result = this.cache[process.id];
            if (result) return result;

            result = newDistribution([{ proc: process, weight: 1 }]);

            return (this.cache[process.id] = result);
        }

        dispatchNullProcess(process: CCS.NullProcess) {
            let result = this.cache[process.id];
            if (result) return result;

            result = newDistribution([{ proc: process, weight: 1 }]);

            return (this.cache[process.id] = result);
        }

        dispatchNamedProcess(process: CCS.NamedProcess) {
            let result = this.cache[process.id];
            if (result) return result;

            // TODO: Ensure this works for `K=A 0.5 B`, which it does not at the moment
            // Simply expanding it leads to infinite recursion.
            // May be enough to only expand if it starts as a probability
            result = newDistribution([{ proc: process, weight: 1 }]);

            return (this.cache[process.id] = result);
        }

        dispatchSummationProcess(process: CCS.SummationProcess) {
            let result = this.cache[process.id];
            if (result) return result;

            result = process.subProcesses
                .map((p) => p.dispatchOn(this))
                .reduce(
                    (curr, acc) =>
                        MultiSetUtil.crossCombination(
                            (p: CCS.Process[]) => this.graph.newSummationProcess(p),
                            curr,
                            acc
                        ),
                    newDistribution([])
                );

            return (this.cache[process.id] = result);
        }

        dispatchCompositionProcess(process: CCS.CompositionProcess) {
            let result = this.cache[process.id];
            if (result) return result;

            result = process.subProcesses
                .map((p) => p.dispatchOn(this))
                .reduce(
                    (curr, acc) =>
                        MultiSetUtil.crossCombination(
                            (p: CCS.Process[]) => this.graph.newCompositionProcess(p),
                            curr,
                            acc
                        ),
                    newDistribution([])
                );

            return (this.cache[process.id] = result);
        }

        dispatchRestrictionProcess(process: CCS.RestrictionProcess) {
            let result = this.cache[process.id];
            if (result) return result;

            const dist: Distribution = process.subProcess.dispatchOn(this);

            result = dist.map((e) => ({
                ...e,
                proc: this.graph.newRestrictedProcess(e.proc, process.restrictedLabels)
            }));

            return (this.cache[process.id] = result);
        }

        dispatchRelabellingProcess(process: CCS.RelabellingProcess) {
            let result = this.cache[process.id];
            if (result) return result;

            const dist: Distribution = process.subProcess.dispatchOn(this);

            result = dist.map((e) => ({
                ...e,
                proc: this.graph.newRelabelingProcess(e.proc, process.relabellings)
            }));

            return (this.cache[process.id] = result);
        }
    }
}

module Traverse {
    export type Distribution = MultiSetUtil.MultiSet<CCS.Process>;
    export class PCCSUnguardedRecursionChecker
        extends Traverse.UnguardedRecursionChecker
        implements PCCS.ProcessDispatchHandler<boolean>
    {
        dispatchProbabilisticProcess(process: PCCS.ProbabilisticProcess) {
            var isUnguarded = false;
            process.dist.getEntries().forEach(({ proc: target }) => {
                if (target.dispatchOn(this)) {
                    isUnguarded = true;
                }
            });
            return true;
        }
    }

    export class PCCSProcessTreeReducer
        extends Traverse.ProcessTreeReducer
        implements CCS.ProcessVisitor<CCS.Process>, PCCS.ProcessDispatchHandler<CCS.Process>
    {
        constructor(private pccsgraph: PCCS.Graph) {
            super(pccsgraph);
        }

        dispatchProbabilisticProcess(process: PCCS.ProbabilisticProcess) {
            let newDistribution: Distribution = new MultiSetUtil.MultiSet<CCS.Process>([]);
            process.dist.getEntries().forEach((e) => {
                newDistribution.add({ proc: e.proc.dispatchOn(this), weight: e.weight });
            });
            return this.pccsgraph.newDistributionProcess(newDistribution);
        }
    }
}
