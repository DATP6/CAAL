/// <reference path="ccs.ts" />

module Traverse {

    import ccs = CCS;

    export class ProcessTreeReducer implements ccs.ProcessVisitor<ccs.Process>, ccs.ProcessDispatchHandler<ccs.Process> {

        constructor(public graph : ccs.Graph, public cache?) {
            this.cache = cache || {};
        }

        visit(process : ccs.Process) : ccs.Process {
            return process.dispatchOn(this);
        }

        dispatchNullProcess(process : ccs.NullProcess) {
            this.cache[process.id] = true;
            return process;
        }

        dispatchNamedProcess(process : ccs.NamedProcess) {
            if (!this.cache[process.id]) {
                this.cache[process.id] = true;
                process.subProcess = process.subProcess.dispatchOn(this);
            }
            return process;
        }

        dispatchSummationProcess(process : ccs.SummationProcess) {
            if (!this.cache[process.id]) {
                process.leftProcess = process.leftProcess.dispatchOn(this);
                process.rightProcess = process.rightProcess.dispatchOn(this);
                if (process.leftProcess instanceof ccs.NullProcess) return process.rightProcess; // 0 + P => 0
                if (process.rightProcess instanceof ccs.NullProcess) return process.leftProcess; // P + 0 => P
                if (process.leftProcess.id === process.rightProcess.id) return process.leftProcess; // P + P => P
                this.cache[process.id] = true;
            }
            return process;
        }

        dispatchCompositionProcess(process : ccs.CompositionProcess) {
            if (!this.cache[process.id]) {
                process.leftProcess = process.leftProcess.dispatchOn(this);
                process.rightProcess = process.rightProcess.dispatchOn(this);
                if (process.leftProcess instanceof ccs.NullProcess) return process.rightProcess; // 0 | P => P
                if (process.rightProcess instanceof ccs.NullProcess) return process.leftProcess; // P | 0 => P
                this.cache[process.id] = true;
            }
            return process;
        }

        dispatchActionPrefixProcess(process : ccs.ActionPrefixProcess) {
            if (!this.cache[process.id]) {
                process.nextProcess = process.nextProcess.dispatchOn(this);
                this.cache[process.id] = true;
            }
            return process;
        }

        dispatchRestrictionProcess(process : ccs.RestrictionProcess) {
            if (!this.cache[process.id]) {
                process.subProcess = process.subProcess.dispatchOn(this);
                // (P \ L1) \L2 => P \ (L1 Union L2)
                if (process.subProcess instanceof ccs.RestrictionProcess) {
                    var subRestriction = <ccs.RestrictionProcess>process.subProcess;
                    var mergedLabels = subRestriction.restrictedLabels.union(process.restrictedLabels);
                    process = this.graph.newRestrictedProcess(subRestriction.subProcess, mergedLabels);
                }
                // 0 \ L => 0
                if (process.subProcess instanceof ccs.NullProcess) {
                    return process.subProcess;
                }
                // P \ Ø => P
                if (process.restrictedLabels.empty()) {
                    return process.subProcess;
                }
                this.cache[process.id] = true;
            }
            return process;
        }

        dispatchRelabellingProcess(process : ccs.RelabellingProcess) {
            if (!this.cache[process.id]) {
                process.subProcess = process.subProcess.dispatchOn(this);
                if (process.subProcess instanceof ccs.NullProcess) return process.subProcess; // 0 [f] => 0
                this.cache[process.id] = true;
            }
            return process;
        }
    }

    export class WeakSuccessorGenerator implements ccs.SuccessorGenerator {

        constructor(public strictSuccGenerator : ccs.SuccessorGenerator,  public cache?) {
            this.cache = cache || {};
        }

        getSuccessors(processId) {
            if (this.cache[processId]) return this.cache[processId];
            var result = new ccs.TransitionSet(),
                toVisit = [processId],
                visited = {},
                visited2 = Object.create(null),
                toVisit2Processes = [],
                toVisit2Actions = [],
                visitingId, successors, action;

            //Stage 1
            while (toVisit.length > 0) {
                visitingId = toVisit.pop();
                if (!visited[visitingId]) {
                    visited[visitingId] = true;
                    successors = this.strictSuccGenerator.getSuccessors(visitingId);
                    successors.forEach(transition => {
                        if (transition.action.getLabel() === "tau") {
                            toVisit.push(transition.targetProcess.id);
                        } else {
                            toVisit2Processes.push(transition.targetProcess.id);
                            toVisit2Actions.push(transition.action);
                            visited2[transition.action] = {};
                            result.add(transition);
                        }
                    });
                }
            }

            //Stage 2
            while (toVisit2Processes.length > 0) {
                visitingId = toVisit2Processes.pop();
                action = toVisit2Actions.pop();
                if (!visited2[action][visitingId]) {
                    visited2[action][visitingId] = true;
                    successors = this.strictSuccGenerator.getSuccessors(visitingId);
                    successors.forEach(transition => {
                        var targetProcess = transition.targetProcess;
                        if (transition.action.getLabel() === "tau") {
                            toVisit2Processes.push(targetProcess.id);
                            toVisit2Actions.push(action);
                            result.add(new ccs.Transition(action, targetProcess));
                        }
                    });
                }
            }

            this.cache[processId] = result;
            return result;
        }
    }

    export class ReducingSuccessorGenerator implements ccs.SuccessorGenerator {
        
        constructor(public succGenerator : ccs.SuccessorGenerator, public reducer : ProcessTreeReducer) { }

        getSuccessors(processId) : ccs.TransitionSet {
            var transitionSet = this.succGenerator.getSuccessors(processId);
            return this.reduceSuccessors(transitionSet);
        }

        private reduceSuccessors(transitionSet : ccs.TransitionSet) {
            transitionSet.forEach(transition => {
                transition.targetProcess = this.reducer.visit(transition.targetProcess);
            });
            return transitionSet;
        }
    }
}