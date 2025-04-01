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
            let result = new ProbabilisticProcess(probabilityString, subProcesses);
            return this.processes[result.id] = result;
        }
    }

    export class ProbabilisticProcess implements CCS.Process {
        private ccs: string;
        constructor(public probability: string, public subProcesses: CCS.Process[]) {
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

    export class StrictSuccessorGenerator extends CCS.StrictSuccessorGenerator implements CCS.SuccessorGenerator, PCCS.ProcessDispatchHandler<CCS.TransitionSet> {
        public probabilityDistubutionGenerator;

        constructor(public graph: Graph, cache?) {
            super(graph, cache);
            this.probabilityDistubutionGenerator = new PCCS.probabilityDistubutionGenerator(graph, cache);
        }

        dispatchProbabilisticProcess(process: ProbabilisticProcess): CCS.TransitionSet{
            console.log("dispatchProbabilisticProcess hope this is the first process and if not, we have a problem");
            return new CCS.TransitionSet();
        }

        // dispatchSummationProcess(process: CCS.SummationProcess) {
        // TODO: maybe we can call the probabilityDistubutionGenerator here? and just make the target process be the probability distribution? 
        //     return 
        // }
    }

    export class probabilityDistubutionGenerator implements PCCS.ProcessDispatchHandler<ProbabilityDistribution> {
        private cache: { [id: string]: ProbabilityDistribution } = {};

        constructor(public graph: Graph, cache?) {
            this.cache = cache || {};
        }

        getProbabilityDistribution(processId: CCS.ProcessId): ProbabilityDistribution {
            var process = this.graph.processById(processId);
            return this.cache[process.id] = process.dispatchOn(this);
        }

        dispatchProbabilisticProcess(process: ProbabilisticProcess): ProbabilityDistribution {
            let probDist = new ProbabilityDistribution(process);
            probDist.addProbabilities(process.subProcesses[0].dispatchOn(this), process.probability);
            probDist.addProbabilities(process.subProcesses[1].dispatchOn(this), this.invertProbability(process.probability));
            return probDist;
        }

        public dispatchActionPrefixProcess(process: CCS.ActionPrefixProcess): ProbabilityDistribution {
            return new ProbabilityDistribution(process, [{ targetProcess: process, probability: '1' }]);
        }

        dispatchNullProcess(process: CCS.NullProcess) {
            return new ProbabilityDistribution(process, [{ targetProcess: process, probability: '1' }]);
        }

        dispatchNamedProcess(process: CCS.NamedProcess) {
            return process.subProcess.dispatchOn(this);
        }

        dispatchSummationProcess(process: CCS.SummationProcess) {
            // if any of the subProcesses are probabilistic, we need to handle them
            return process.subProcesses[0].dispatchOn(this).addProbabilities(process.subProcesses[1].dispatchOn(this), '1');
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

        private invertProbability(prob: string) {

            return (1 - parseFloat('0.' + prob)).toFixed(3).toString().slice(2);
        }
    }



    export class ProbabilityDistribution{
        public id: CCS.Process;
        public action : string;
        public dist: { targetProcess: CCS.Process; probability: string }[] = [];

        constructor(id: CCS.Process, dist?: { targetProcess: CCS.Process; probability: string }[]) {
            this.id = id;        
            if (dist) {
                this.dist = dist;
            }
        }

        public isValid() {
            // Check if the sum of the probabilities is 1
            // TODO: needs to work in int instead of float to avoid floating point errors
            var sum = 0;
            for (var key in this.dist) {
                sum += parseFloat('0.' + this.dist[key]);
            }
            return sum == 1;
        }

        public addProbabilities(probDist: ProbabilityDistribution, scalar: string) {
            probDist.scaleDist(scalar);
            probDist.dist.forEach(outcome => {
                this.dist.push(outcome);
            });
        }

        private scaleDist(scalar: string) {
            this.dist.forEach(outcome => {
                //TODO: change to int to avoid floating point errors :)
                outcome.probability = (parseFloat('0.' + outcome.probability) * parseFloat('0.' + scalar)).toFixed(3).toString().slice(2);
            });
        }

        getTargetProcesses(): CCS.Process[] {
            return this.dist.map(entry => entry.targetProcess);
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

    export class PCCSProcessTreeReducer extends Traverse.ProcessTreeReducer implements CCS.ProcessVisitor<CCS.Process>, PCCS.ProcessDispatchHandler<CCS.Process> {

        constructor(private pccsgraph: PCCS.Graph) {
            super(pccsgraph);
        }

        // NOTE: this implementation may not be complete, it is just yanked from the PCCSUnguardedRecursionChecker
        // Look at dispatchSummationProcess in reducedparsetree.ts for inspiration
        // The implementation depends on how we process multiple probabalistic processes.
        dispatchProbabilisticProcess(process : PCCS.ProbabilisticProcess) {
            process.subProcesses.forEach(subProc => {
                console.log(process, subProc)
                subProc.dispatchOn(this)
            });
            return process
        }
    }
}