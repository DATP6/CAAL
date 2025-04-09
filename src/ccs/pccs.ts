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

        public newProbabilisticProcess(probability: Array<any>, subProcesses: CCS.Process[]) {
            var probabilityString = "";
            probability.forEach(element => {
                if (element instanceof Array) {
                    probabilityString += element.join("");
                } else {
                    probabilityString += element;
                }
            });
            // TODO: make probablities fractions instead of strings
            let distribution: { targetProcess: CCS.Process, probability: string }[] = [];
            distribution.push({ targetProcess: subProcesses[0], probability: probabilityString });
            distribution.push({ targetProcess: subProcesses[1], probability: (10 - parseInt(probabilityString)).toString() });
            let result = new ProbabilisticProcess(distribution);
            return this.processes[result.id] = result;
        }
    }

    export class ProbabilisticProcess implements CCS.Process {
        private ccs: string;
        public dist: { targetProcess: CCS.Process; probability: string }[] = [];
        
        constructor(dist?: { targetProcess: CCS.Process; probability: string }[]) {
            this.dist = dist || [];
        }
            
        dispatchOn<T>(dispatcher: ProcessDispatchHandler<T>): T {
            return dispatcher.dispatchProbabilisticProcess(this);
        }

        toString() {
            if (this.ccs) return this.ccs;
            return this.ccs = this.dist.map(p => "(" + p.targetProcess.toString() + ", " + p.probability + ")").join(" + ");
        }

        get id() {
            return this.toString();
        }

        public addProbabilities(probDist: ProbabilisticProcess, scalar: string) {
            probDist.dist.forEach(outcome => {
                this.dist.push(outcome);
            });
        }

        public splitProbability(oldTarget: { targetProcess: CCS.Process; probability: string }, newTarget: CCS.Process) {
            if (newTarget instanceof ProbabilisticProcess) {
                newTarget.scaleDist(oldTarget.probability);
                newTarget.dist.forEach(outcome => {
                    this.dist.push(outcome);
                });
                this.dist = this.dist.filter(target => target != oldTarget); // remove the old target
            }
        }

        // EACH NEW PROCESS SHOULD BE ADDED TO GRAPH OBJECT SO THAT WE CAN USE GETPROCESS_BY_ID() 
        public convexCombination(process: ProbabilisticProcess) {
            this.dist.forEach(target => {
                let combinedProcesses = new ProbabilisticProcess();
                process.dist.forEach(otherTarget => {
                    if (target.targetProcess instanceof CCS.SummationProcess && otherTarget.targetProcess instanceof CCS.SummationProcess) {
                        let combination = { targetProcess: new CCS.SummationProcess(target.targetProcess.subProcesses.concat(otherTarget.targetProcess.subProcesses)), probability: otherTarget.probability };
                        combinedProcesses.dist.push(combination);
                    } else if (target.targetProcess instanceof CCS.SummationProcess && otherTarget.targetProcess instanceof CCS.ActionPrefixProcess) {
                        let combination = { targetProcess: new CCS.SummationProcess(target.targetProcess.subProcesses.concat(otherTarget.targetProcess)), probability: otherTarget.probability };
                        combinedProcesses.dist.push(combination);
                    }
                });
                this.splitProbability(target, combinedProcesses);
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

        public getTargetProcesses(): CCS.Process[] {
            return this.dist.map(entry => entry.targetProcess);
        }

   }

    export class StrictSuccessorGenerator extends CCS.StrictSuccessorGenerator implements CCS.SuccessorGenerator, PCCS.ProcessDispatchHandler<CCS.TransitionSet> {
        public probabilityDistubutionGenerator;

        constructor(public graph: Graph, cache?) {
            super(graph, cache);
            this.probabilityDistubutionGenerator = new PCCS.probabilityDistubutionGenerator(graph, cache);
        }

        dispatchProbabilisticProcess(process: ProbabilisticProcess): CCS.TransitionSet{
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
            process.dist.forEach(target => {
                process.splitProbability(target, target.targetProcess.dispatchOn(this));
            })
            return process;
        }

        public dispatchActionPrefixProcess(process: CCS.ActionPrefixProcess): CCS.Process {
            // return this.graph.newProbabilisticProcess(["1"], [process]); // adding it to the graph causes error. pls fix :)
            return new ProbabilisticProcess([{targetProcess: process, probability: "1"}]);
        }

        dispatchNullProcess(process: CCS.NullProcess) {
            // return process;
            return new ProbabilisticProcess([{targetProcess: process, probability: "1"}]);
        }

        dispatchNamedProcess(process: CCS.NamedProcess) {
            // return process;
            return new ProbabilisticProcess([{targetProcess: process, probability: "1"}]);
        }

        dispatchSummationProcess(process: CCS.SummationProcess) {
            let probProcess = new PCCS.ProbabilisticProcess([{ targetProcess: new CCS.SummationProcess([]), probability: "1" }]);

            process.subProcesses.forEach(subProcess => {
                probProcess.convexCombination(subProcess.dispatchOn(this));
            });
            this.graph.addProcesses(probProcess.getTargetProcesses());

            return probProcess;
        }

        dispatchCompositionProcess(process: CCS.CompositionProcess) {
            // if any of the subProcesses are probabilistic, we need to handle them
            return process.subProcesses[0].dispatchOn(this).addProbabilities(process.subProcesses[1].dispatchOn(this), '1');
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
        dispatchProbabilisticProcess(process : PCCS.ProbabilisticProcess) {
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
        dispatchProbabilisticProcess(process : PCCS.ProbabilisticProcess) {
            process.dist.forEach(target => {
                target.targetProcess.dispatchOn(this)
            });
            return process
        }
    }
}