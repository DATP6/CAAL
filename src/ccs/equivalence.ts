/// <reference path="ccs.ts" />
/// <reference path="hml.ts" />
/// <reference path="depgraph.ts" />

module Equivalence {
    import ccs = CCS;
    import hml = HML;
    import dg = DependencyGraph;

    /**
        This class construct a bisimulation dependency graph.

        It is extended with method for selecting AI choice for the DG-Games, and
        other utility methods like finding distinguishing formula or performing
        bisimulation collapse
    */
    export class BisimulationDG implements dg.DependencyGraph, dg.PlayableDependencyGraph {
        /** The dependency graph is constructed such a minimum fixed point
            of 1 indicates the processes diverge. Since bisimulation is
            maximal fixed-point, the result marking should be
            inverted **/

        private nextIdx;
        private nodes = []; //Reference to node ids already constructed.
        private constructData = []; //Data necessary to construct nodes.
        private leftPairs = {}; // leftPairs[P.id][Q.id] is a cache for solved process pairs.
        private isFullyConstructed = false;

        constructor(
            private attackSuccGen: ccs.SuccessorGenerator,
            private defendSuccGen: ccs.SuccessorGenerator,
            leftNode: ccs.ProcessId,
            rightNode: ccs.ProcessId
        ) {
            this.constructData[0] = [0, leftNode, rightNode];
            this.nextIdx = 1;
        }

        getHyperEdges(identifier: dg.DgNodeId): dg.Hyperedge[] {
            var type, result;
            //Have we already built this? Then return copy of the edges.
            if (this.nodes[identifier]) {
                result = this.nodes[identifier];
            } else {
                result = this.constructNode(identifier);
            }
            return dg.copyHyperEdges(result);
        }

        private constructNode(identifier: dg.DgNodeId) {
            var result,
                data = this.constructData[identifier],
                type = data[0];
            if (type === 0) {
                //Is it a pair?
                result = this.nodes[identifier] = this.getProcessPairStates(data[1], data[2]);
            } else if (type === 1) {
                // The left action and destination is fixed?
                result = this.nodes[identifier] = this.getNodeForLeftTransition(data);
            } else if (type === 2) {
                // The right action and destination is fixed?
                result = this.nodes[identifier] = this.getNodeForRightTransition(data);
            }
            return result;
        }

        getAllHyperEdges(): [dg.DgNodeId, dg.Hyperedge][] {
            if (!this.isFullyConstructed) {
                this.isFullyConstructed = true;
                //All nodes have ids in order of creation, thus there are no gaps.
                for (var i = 0; i < this.nextIdx; i++) {
                    this.constructNode(i);
                }
            }
            var result = [];
            result.length = this.nextIdx;
            for (var i = 0; i < this.nextIdx; i++) {
                result[i] = [i, dg.copyHyperEdges(this.nodes[i])];
            }
            return result;
        }

        private getNodeForLeftTransition(data) {
            var action = data[1],
                toLeftId = data[2],
                fromRightId = data[3],
                result = [];
            // for (s, fromRightId), s ----action---> toLeftId.
            // fromRightId must be able to match.
            var rightTransitions = this.defendSuccGen.getSuccessors(fromRightId);
            rightTransitions.forEach((rightTransition) => {
                var existing, toRightId;
                //Same action - possible candidate.
                if (rightTransition.action.equals(action)) {
                    toRightId = rightTransition.targetProcess.id;
                    result.push(this.getOrCreatePairNode(toLeftId, toRightId));
                }
            });
            return [result];
        }

        private getNodeForRightTransition(data) {
            var action = data[1],
                toRightId = data[2],
                fromLeftId = data[3],
                result = [];
            var leftTransitions = this.defendSuccGen.getSuccessors(fromLeftId);
            leftTransitions.forEach((leftTransition) => {
                var existing, toLeftId;
                if (leftTransition.action.equals(action)) {
                    toLeftId = leftTransition.targetProcess.id;
                    result.push(this.getOrCreatePairNode(toLeftId, toRightId));
                }
            });
            return [result];
        }

        private getOrCreatePairNode(leftId: ccs.ProcessId, rightId: ccs.ProcessId): dg.DgNodeId {
            var result: dg.DgNodeId;
            var rightIds = this.leftPairs[leftId];
            if (rightIds) {
                result = rightIds[rightId];
            }
            if (result) {
                return result;
            }
            //Build the node.
            result = this.nextIdx++;
            if (!rightIds) this.leftPairs[leftId] = rightIds = {};
            rightIds[rightId] = result;
            this.constructData[result] = [0, leftId, rightId];
            return result;
        }

        private getProcessPairStates(leftProcessId: ccs.ProcessId, rightProcessId: ccs.ProcessId): dg.Hyperedge[] {
            var hyperedges: dg.Hyperedge[] = [];
            var leftTransitions = this.attackSuccGen.getSuccessors(leftProcessId);
            var rightTransitions = this.attackSuccGen.getSuccessors(rightProcessId);
            leftTransitions.forEach((leftTransition) => {
                var newNodeIdx = this.nextIdx++;
                this.constructData[newNodeIdx] = [
                    1,
                    leftTransition.action,
                    leftTransition.targetProcess.id,
                    rightProcessId
                ];
                hyperedges.push([newNodeIdx]);
            });
            rightTransitions.forEach((rightTransition) => {
                var newNodeIdx = this.nextIdx++;
                this.constructData[newNodeIdx] = [
                    2,
                    rightTransition.action,
                    rightTransition.targetProcess.id,
                    leftProcessId
                ];
                hyperedges.push([newNodeIdx]);
            });
            return hyperedges;
        }

        /*
            Returns information about the attackers options P -- alpha --> Q that the defender than have to match.
            returns: the action, alpha, leading to Q, Q itself, the next DG node, type of move (0,1,2).
        */
        public getAttackerOptions(dgNodeId: dg.DgNodeId): [CCS.Action, CCS.Process, dg.DgNodeId, number][] {
            if (this.constructData[dgNodeId][0] !== 0) throw 'Bad node for attacker options';

            var hyperedges = this.getHyperEdges(dgNodeId);
            var result = [];

            hyperedges.forEach((hyperedge) => {
                //The dg nodes are constructed such that each hyperedge only have one target node.
                //therefore no need to loop over the hyperedge.
                var targetNode = hyperedge[0];
                var data = this.constructData[targetNode];
                var action = data[1];
                var targetProcess = this.attackSuccGen.getProcessById(data[2]);
                var move = data[0];

                result.push({
                    action: action,
                    targetProcess: targetProcess,
                    nextNode: targetNode,
                    move: move
                });
            });

            return result;
        }

        /*
            Similar to getAttackerOptions, but returns instead the process the other side
            matched with and the resulting dependency graph node
        */
        public getDefenderOptions(dgNodeId: dg.DgNodeId): [CCS.Process, dg.DgNodeId][] {
            if (this.constructData[dgNodeId][0] === 0) throw 'Bad node for defender options';

            var hyperedge = this.getHyperEdges(dgNodeId)[0];
            var result = [];
            var tcpi = this.constructData[dgNodeId][0] === 1 ? 2 : 1;

            hyperedge.forEach((targetNode) => {
                var data = this.constructData[targetNode];
                var targetProcess = this.defendSuccGen.getProcessById(data[tcpi]);

                result.push({
                    targetProcess: targetProcess,
                    nextNode: targetNode
                });
            });

            return result;
        }

        /*
            Create a node for all pairs of reachable processes
        */
        addReachablePairs(fromProcess: ccs.ProcessId): void {
            var reachableProcessIds = [];
            var count = 0,
                maxCount = 666;

            var iterator = ccs.reachableProcessIterator(fromProcess, this.attackSuccGen);
            while (iterator.hasNext()) {
                if (count++ > maxCount) {
                    var error = new Error('Too many process pairs');
                    error.name = 'CollapseTooLarge';
                    throw error;
                }
                reachableProcessIds.push(iterator.next());
            }
            for (var leftIndex = 0; leftIndex < reachableProcessIds.length; ++leftIndex) {
                for (var rightIndex = 0; rightIndex < reachableProcessIds.length; ++rightIndex) {
                    if (leftIndex != rightIndex) {
                        var leftProcId = reachableProcessIds[leftIndex];
                        var rightProcId = reachableProcessIds[rightIndex];
                        this.getOrCreatePairNode(leftProcId, rightProcId);
                    }
                }
            }
        }

        getBisimulationCollapse(marking: dg.LevelMarking, graph: ccs.Graph): Traverse.Collapse {
            //Implementation of Union-Find algorithm.
            //Since Bisimulation is an equivalence relation
            //this datastructure/algorithm is a good match.
            var sets = Object.create(null);

            function singleton(id) {
                var o: any = { val: id, rank: 0 };
                o.parent = o;
                sets[id] = o;
            }

            function findRootInternal(set) {
                if (set.parent !== set) {
                    set.parent = findRootInternal(set.parent);
                }
                return set.parent;
            }

            function findRoot(id) {
                return findRootInternal(sets[id]);
            }

            function union(pId, qId) {
                var pRoot = findRoot(pId),
                    qRoot = findRoot(qId);
                if (pRoot === qRoot) return;
                if (pRoot.rank < qRoot.rank) pRoot.parent = qRoot;
                else if (pRoot.rank > qRoot.rank) qRoot.parent = pRoot;
                else {
                    qRoot.parent = pRoot;
                    ++pRoot.rank;
                }
            }

            //Apply union find algorithm
            Object.keys(this.constructData).forEach((id) => {
                var pId, qId, pair;
                pair = this.constructData[id];
                if (pair[0] !== 0) return;
                pId = pair[1];
                qId = pair[2];
                if (!sets[pId]) singleton(pId);
                if (!sets[qId]) singleton(qId);
                //is bisimilar?
                if (marking.getMarking(id) === marking.ZERO) {
                    union(pId, qId);
                }
            });

            //Map each represenative id to the array of equivalent processes
            var collapses = {};
            Object.keys(sets).forEach((procId) => {
                var reprId = findRoot(procId).val,
                    process = graph.processById(procId);
                (collapses[reprId] = collapses[reprId] || []).push(process);
            });

            //For each array create a collapse and map each proc id to its
            //corresponding collapse
            var proc2collapse = {};
            Object.keys(collapses).forEach((reprId) => {
                var collapsedProces = collapses[reprId];
                var collapse = graph.newCollapsedProcess(collapses[reprId]);
                collapsedProces.forEach((proc) => {
                    proc2collapse[proc.id] = collapse;
                });
                //Add self collapse
                proc2collapse[collapse.id] = collapse;
            });

            return {
                getRepresentative: function (id): ccs.CollapsedProcess {
                    return proc2collapse[id];
                }
            };
        }

        findDistinguishingFormula(marking: dg.LevelMarking, isWeak: boolean): hml.Formula {
            var that = this,
                formulaSet = new hml.FormulaSet(),
                trace;
            if (marking.getMarking(0) !== marking.ONE) throw 'Error: Processes are bisimilar';

            function selectMinimaxLevel(node: dg.DgNodeId) {
                var hyperEdges = that.getHyperEdges(node),
                    bestHyperEdge: dg.Hyperedge,
                    bestNode: dg.DgNodeId;

                //Why JavaScript... why????
                function wrapMax(a, b) {
                    return Math.max(a, b);
                }

                if (hyperEdges.length === 0) return null;
                var bestHyperEdge = ArrayUtil.selectBest(hyperEdges, (tNodesLeft, tNodesRight) => {
                    var maxLevelLeft = tNodesLeft.map(marking.getLevel).reduce(wrapMax, 1),
                        maxLevelRight = tNodesRight.map(marking.getLevel).reduce(wrapMax, 1);
                    if (maxLevelLeft < maxLevelRight) return true;
                    if (maxLevelLeft > maxLevelRight) return false;
                    return tNodesLeft.length < tNodesRight.length;
                });

                if (bestHyperEdge.length === 0) return null;

                bestNode = ArrayUtil.selectBest(bestHyperEdge, (nodeLeft, nodeRight) => {
                    return marking.getLevel(nodeLeft) < marking.getLevel(nodeRight);
                });

                return bestNode;
            }

            //Remove terms in con/dis-junctions
            var muDG = new dg.MuCalculusDG(this.attackSuccGen, this.defendSuccGen, formulaSet);
            var minfpCalc = new dg.MinFixedPointCalculator((node) => muDG.getHyperEdges(node));

            function simplifyConjOrDisjunctions(processes: ccs.Process[], terms: hml.Formula[], mustSatisfy: boolean) {
                if (terms.length < 2) return terms.slice();
                var desiredMarking = mustSatisfy ? minfpCalc.ONE : minfpCalc.ZERO;
                var table = Object.create(null);

                terms.forEach((t) => {
                    processes.forEach((p) => {
                        var node = new dg.MuCalculusNode(p, t, true);
                        minfpCalc.solve(node);
                        table[node.id] = minfpCalc.getMarking(node) === desiredMarking ? 1 : 0;
                    });
                });

                function fulfilledProcesses(term) {
                    var result = [];
                    processes.forEach((p) => {
                        var node = new dg.MuCalculusNode(p, term, true);
                        if (table[node.id] === 1) {
                            result.push(p);
                        }
                    });
                    return result;
                }

                function clearProcs(procs) {
                    terms.forEach((t) => {
                        procs.forEach((p) => {
                            var node = new dg.MuCalculusNode(p, t, true);
                            table[node.id] = 0;
                        });
                    });
                }

                var resultTerms = [];
                var fulfilledProcs = 0;
                function greedySelect() {
                    var fProcesses = terms.map(fulfilledProcesses);
                    var scores = fProcesses.map((fprocs) => fprocs.length);
                    var bestTermIdx = 0;
                    for (var i = 1; i < terms.length; ++i) {
                        if (scores[i] > scores[bestTermIdx]) bestTermIdx = i;
                    }
                    resultTerms.push(terms[bestTermIdx]);
                    fulfilledProcs += scores[bestTermIdx];
                    clearProcs(fProcesses[bestTermIdx]);
                }
                while (fulfilledProcs < processes.length) {
                    greedySelect();
                }
                return resultTerms;
            }

            //We use the internal implementation details
            //Hyperedges of type 0, have hyperedges of: [ [X], [Y], [Z] ]
            //Hyperedges of type 1/2, have the form: [ [P, Q, R, S, T] ]
            var selectSuccessor = selectMinimaxLevel;
            var existConstructor = (matcher, sub) => formulaSet.newStrongExists(matcher, sub);
            var forallConstructor = (matcher, sub) => formulaSet.newStrongForAll(matcher, sub);
            if (isWeak) {
                existConstructor = (matcher, sub) => formulaSet.newWeakExists(matcher, sub);
                forallConstructor = (matcher, sub) => formulaSet.newWeakForAll(matcher, sub);
            }

            var succGen = that.attackSuccGen;

            function getTargetProcs(pairs, getRight: boolean) {
                var index = getRight ? 2 : 1;
                var procIds = pairs.map((node) => that.constructData[node][index]);
                return procIds.map((pId) => succGen.getProcessById(pId));
            }

            function formulaForBranch(node: dg.DgNodeId): hml.Formula {
                var cData = that.constructData[node];
                if (cData[0] === 0) {
                    var selectedNode = selectSuccessor(node);
                    return formulaForBranch(selectedNode);
                } else if (cData[0] === 1) {
                    var targetPairNodes = that.getHyperEdges(node)[0];
                    var actionMatcher = new hml.SingleActionMatcher(cData[1]);
                    if (targetPairNodes.length > 0) {
                        var subFormulas = targetPairNodes.map(formulaForBranch);
                        var subProcesses = getTargetProcs(targetPairNodes, true);
                        subFormulas = simplifyConjOrDisjunctions(subProcesses, subFormulas, false);
                        return existConstructor(actionMatcher, formulaSet.newConj(subFormulas));
                    } else {
                        return existConstructor(actionMatcher, formulaSet.newTrue());
                    }
                } else {
                    var targetPairNodes = that.getHyperEdges(node)[0];
                    var actionMatcher = new hml.SingleActionMatcher(cData[1]);
                    if (targetPairNodes.length > 0) {
                        var subFormulas = targetPairNodes.map(formulaForBranch);
                        var subProcesses = getTargetProcs(targetPairNodes, false);
                        subFormulas = simplifyConjOrDisjunctions(subProcesses, subFormulas, true);
                        return forallConstructor(actionMatcher, formulaSet.newDisj(subFormulas));
                    } else {
                        return forallConstructor(actionMatcher, formulaSet.newFalse());
                    }
                }
            }

            var formula = formulaForBranch(0);
            return new Traverse.HMLSimplifier().visitVariableFreeFormula(formula);
        }
    }

    export class SimulationDG implements dg.DependencyGraph, dg.PlayableDependencyGraph {
        private nextIdx;
        private nodes = [];
        private constructData = [];
        private leftPairs = {};
        private isFullyConstructed = false;

        constructor(
            private attackSuccGen: ccs.SuccessorGenerator,
            private defendSuccGen: ccs.SuccessorGenerator,
            leftNode,
            rightNode
        ) {
            this.constructData[0] = [0, leftNode, rightNode];
            this.nextIdx = 1;
        }

        getHyperEdges(identifier: dg.DgNodeId): dg.Hyperedge[] {
            var type, result;
            //Have we already built this? Then return copy of the edges.
            if (this.nodes[identifier]) {
                result = this.nodes[identifier];
            } else {
                result = this.constructNode(identifier);
            }
            return dg.copyHyperEdges(result);
        }

        private constructNode(identifier: dg.DgNodeId) {
            var result,
                data = this.constructData[identifier],
                type = data[0];
            if (type === 0) {
                //It it a pair?
                result = this.nodes[identifier] = this.getProcessPairStates(data[1], data[2]);
            } else if (type === 1) {
                // The left action and destination is fixed?
                result = this.nodes[identifier] = this.getNodeForLeftTransition(data);
            }
            return result;
        }

        getAllHyperEdges(): [dg.DgNodeId, dg.Hyperedge][] {
            if (!this.isFullyConstructed) {
                this.isFullyConstructed = true;
                //All nodes have ids in order of creation, thus there are no gaps.
                for (var i = 0; i < this.nextIdx; i++) {
                    this.constructNode(i);
                }
            }
            var result = [];
            result.length = this.nextIdx;
            for (var i = 0; i < this.nextIdx; i++) {
                result[i] = [i, dg.copyHyperEdges(this.nodes[i])];
            }
            return result;
        }

        private getNodeForLeftTransition(data) {
            var action = data[1],
                toLeftId = data[2],
                fromRightId = data[3],
                result = [];
            // for (s, fromRightId), s ----action---> toLeftId.
            // fromRightId must be able to match.
            var rightTransitions = this.defendSuccGen.getSuccessors(fromRightId);
            rightTransitions.forEach((rightTransition) => {
                var existing, toRightId;
                //Same action - possible candidate.
                if (rightTransition.action.equals(action)) {
                    toRightId = rightTransition.targetProcess.id;
                    var rightIds = this.leftPairs[toLeftId];
                    if (rightIds) {
                        existing = rightIds[toRightId];
                    }
                    //Have we already solved the resulting (s1, t1) pair?
                    if (existing) {
                        result.push(existing);
                    } else {
                        //Build the node.
                        var newIndex = this.nextIdx++;
                        if (!rightIds) this.leftPairs[toLeftId] = rightIds = {};
                        rightIds[toRightId] = newIndex;
                        this.constructData[newIndex] = [0, toLeftId, toRightId];
                        result.push(newIndex);
                    }
                }
            });
            return [result];
        }

        private getProcessPairStates(leftProcessId: ccs.ProcessId, rightProcessId: ccs.ProcessId): dg.Hyperedge[] {
            var hyperedges: dg.Hyperedge[] = [];
            var leftTransitions = this.attackSuccGen.getSuccessors(leftProcessId);
            leftTransitions.forEach((leftTransition) => {
                var newNodeIdx = this.nextIdx++;
                this.constructData[newNodeIdx] = [
                    1,
                    leftTransition.action,
                    leftTransition.targetProcess.id,
                    rightProcessId
                ];
                hyperedges.push([newNodeIdx]);
            });
            return hyperedges;
        }

        public getAttackerOptions(dgNodeId: dg.DgNodeId): [CCS.Action, CCS.Process, dg.DgNodeId, number][] {
            if (this.constructData[dgNodeId][0] !== 0) throw 'Bad node for attacker options';

            var hyperedges = this.getHyperEdges(dgNodeId);
            var result = [];

            hyperedges.forEach((hyperedge) => {
                var targetNode = hyperedge[0];
                var data = this.constructData[targetNode];
                var action = data[1];
                var targetProcess = this.attackSuccGen.getProcessById(data[2]);
                var move = data[0];

                result.push({
                    action: action,
                    targetProcess: targetProcess,
                    nextNode: targetNode,
                    move: move
                });
            });

            return result;
        }

        public getDefenderOptions(dgNodeId: dg.DgNodeId): [CCS.Process, dg.DgNodeId][] {
            if (this.constructData[dgNodeId][0] === 0) throw 'Bad node for defender options';

            var hyperedge = this.getHyperEdges(dgNodeId)[0];
            var result = [];
            var tcpi = this.constructData[dgNodeId][0] === 1 ? 2 : 1;

            hyperedge.forEach((targetNode) => {
                var data = this.constructData[targetNode];
                var targetProcess = this.defendSuccGen.getProcessById(data[tcpi]);

                result.push({
                    targetProcess: targetProcess,
                    nextNode: targetNode
                });
            });

            return result;
        }
    }

    export function isBisimilar(
        attackSuccGen: ccs.SuccessorGenerator,
        defendSuccGen: ccs.SuccessorGenerator,
        leftProcessId,
        rightProcessId,
        graph?
    ) {
        var bisimDG = new Equivalence.BisimulationDG(attackSuccGen, defendSuccGen, leftProcessId, rightProcessId),
            marking = dg.liuSmolkaLocal2(0, bisimDG);
        return marking.getMarking(0) === marking.ZERO;
    }

    export function isSimilar(
        attackSuccGen: ccs.SuccessorGenerator,
        defendSuccGen: ccs.SuccessorGenerator,
        leftProcessId,
        rightProcessId
    ) {
        var simDG = new Equivalence.SimulationDG(attackSuccGen, defendSuccGen, leftProcessId, rightProcessId);
        var marking = dg.liuSmolkaLocal2(0, simDG);
        return marking.getMarking(0) === marking.ZERO;
    }

    export function getBisimulationCollapse(
        attackSuccGen: ccs.SuccessorGenerator,
        defendSuccGen: ccs.SuccessorGenerator,
        leftProcessId,
        rightProcessId
    ): Traverse.Collapse {
        var bisimDG = new Equivalence.BisimulationDG(attackSuccGen, defendSuccGen, leftProcessId, rightProcessId);
        bisimDG.addReachablePairs(leftProcessId);
        if (leftProcessId != rightProcessId) {
            bisimDG.addReachablePairs(rightProcessId);
        }
        var marking = dg.solveDgGlobalLevel(bisimDG);
        return bisimDG.getBisimulationCollapse(marking, attackSuccGen.getGraph());
    }

    export function isProbabilisticBisimilar(succGen: ccs.SuccessorGenerator, leftProcessId, rightProcessId) {
        var bisimDG = new Equivalence.ProbabilisticBisimDG(succGen, leftProcessId, rightProcessId),
            marking = dg.liuSmolkaLocal2(0, bisimDG);
        return marking.getMarking(0) === marking.ZERO;
    }

    export class TraceDG implements dg.DependencyGraph {
        private nextIdx: number;
        private constructData = [];
        private nodes = [];
        private leftPairs = {};
        private isFullyConstructed = false;

        constructor(
            leftNode: ccs.ProcessId,
            rightNode: ccs.ProcessId,
            private attackSuccGen: ccs.SuccessorGenerator
        ) {
            this.constructData[0] = [0, null, leftNode, [rightNode]];
            this.nextIdx = 1;
        }

        public getHyperEdges(identifier: dg.DgNodeId): dg.Hyperedge[] {
            var type, result;
            //Have we already built this? Then return copy of the edges.
            if (this.nodes[identifier]) {
                result = this.nodes[identifier];
            } else {
                result = this.constructNode(identifier);
            }

            return dg.copyHyperEdges(result);
        }

        getAllHyperEdges(): [dg.DgNodeId, dg.Hyperedge][] {
            if (!this.isFullyConstructed) {
                this.isFullyConstructed = true;
                //All nodes have ids in order of creation, thus there are no gaps.
                for (var i = 0; i < this.nextIdx; i++) {
                    this.constructNode(i);
                }
            }
            var result = [];
            result.length = this.nextIdx;
            for (var i = 0; i < this.nextIdx; i++) {
                result[i] = [i, dg.copyHyperEdges(this.nodes[i])];
            }

            return result;
        }

        private constructNode(identifier: dg.DgNodeId) {
            var data = this.constructData[identifier];
            return (this.nodes[identifier] = this.getProcessPairStates(data[2], data[3]));
        }

        private getProcessPairStates(leftProcessId: ccs.ProcessId, rightProcessIds: ccs.ProcessId[]): dg.Hyperedge[] {
            if (rightProcessIds.length === 0) return [[]];

            var hyperedges = [];

            var leftTransitions = this.attackSuccGen.getSuccessors(leftProcessId);
            var rightTransitions = [];

            rightProcessIds.forEach((rightProcessId) => {
                var succs = this.attackSuccGen.getSuccessors(rightProcessId);
                succs.forEach((succ) => {
                    rightTransitions.push(succ);
                });
            });

            leftTransitions.forEach((leftTransition) => {
                var rightTargets = [];

                rightTransitions.forEach((rightTransition) => {
                    if (rightTransition.action.equals(leftTransition.action)) {
                        rightTargets.push(rightTransition.targetProcess.id);
                    }
                });

                rightTargets.sort();
                rightTargets = ArrayUtil.removeConsecutiveDuplicates(rightTargets);

                if (this.leftPairs[leftTransition.targetProcess.id] === undefined)
                    this.leftPairs[leftTransition.targetProcess.id] = [];

                if (this.leftPairs[leftTransition.targetProcess.id][rightTargets.length] === undefined)
                    this.leftPairs[leftTransition.targetProcess.id][rightTargets.length] = [];

                var rightSets = this.leftPairs[leftTransition.targetProcess.id][rightTargets.length];
                var existing = false;

                for (var n = 0; n < rightSets.length; n++) {
                    if (rightTargets.every((v, i) => v === rightSets[n].set[i])) {
                        hyperedges.push([rightSets[n].index]);
                        existing = true;
                        break;
                    }
                }

                if (!existing) {
                    var newNodeIdx = this.nextIdx++;
                    var rightSet = { set: rightTargets, index: newNodeIdx };

                    this.leftPairs[leftTransition.targetProcess.id][rightTargets.length].push(rightSet);

                    this.constructData[newNodeIdx] = [
                        0,
                        leftTransition.action,
                        leftTransition.targetProcess.id,
                        rightTargets
                    ];

                    hyperedges.push([newNodeIdx]);
                }
            });

            return hyperedges;
        }

        public getDistinguishingFormula(marking: dg.LevelMarking): string {
            if (marking.getMarking(0) === marking.ZERO) return null;

            var hyperedges = this.getHyperEdges(0);
            var formulaStr = '';
            var emptySetReached = false;
            var isWeak = this.attackSuccGen instanceof Traverse.WeakSuccessorGenerator;

            while (!emptySetReached) {
                var bestTarget: dg.DgNodeId = 0;
                var lowestLevel = Infinity;

                hyperedges.forEach((hyperedge) => {
                    var level;
                    var edge = hyperedge[0];

                    if (marking.getMarking(edge) === marking.ONE) {
                        level = marking.getLevel(edge);
                        if (level <= lowestLevel) {
                            lowestLevel = level;
                            bestTarget = edge;
                        }
                    }
                });

                formulaStr +=
                    (isWeak ? '<<' : '<') + this.constructData[bestTarget][1].toString(false) + (isWeak ? '>>' : '>');

                hyperedges = this.getHyperEdges(bestTarget);

                for (var i = 0; i < hyperedges.length; i++) {
                    if (hyperedges[i].length === 0) {
                        emptySetReached = true;
                        break;
                    }
                }
            }

            formulaStr += 'tt;';
            return formulaStr;
        }
    }

    export function isTraceIncluded(
        attackSuccGen: ccs.SuccessorGenerator,
        defendSuccGen: ccs.SuccessorGenerator,
        leftProcessId,
        rightProcessId,
        graph?
    ): { isSatisfied: boolean; formula: string } {
        var traceDG = new TraceDG(leftProcessId, rightProcessId, attackSuccGen);
        var marking = dg.liuSmolkaLocal2(0, traceDG);

        return {
            isSatisfied: marking.getMarking(0) === marking.ZERO,
            formula: traceDG.getDistinguishingFormula(marking)
        };
    }

    function prettyPrintTrace(graph, trace) {
        var notation = new Traverse.CCSNotationVisitor(),
            stringParts = [];
        for (var i = 0; i < trace.length; i++) {
            if (i % 2 == 1) stringParts.push('---- ' + trace[i].toString() + ' ---->');
            else stringParts.push(notation.visit(graph.processById(trace[i])));
        }
        return stringParts.join('\n\t');
    }

    enum ProbDGNodeKind {
        NoSide,
        SidedState,
        Distribution,
        Support
    }

    enum Side {
        Left,
        Right
    }

    type MaybeConstructedNode = ConstructedProbDGNode | UnconstructedProbDGNode;
    type ProbabilisticDGNode = (ProbDGNoSideNode | ProbDGSidedStateNode | ProbDGDistributionNode | ProbDGSupportNode) &
        MaybeConstructedNode;

    interface ConstructedProbDGNode {
        isConstructed: true;
        hyperedges: dg.Hyperedge[];
    }

    interface UnconstructedProbDGNode {
        isConstructed: false;
    }

    interface ProbDGNoSideNode {
        kind: ProbDGNodeKind.NoSide;
        leftId: CCS.ProcessId;
        rightId: CCS.ProcessId;
    }

    interface ProbDGSidedStateNode {
        kind: ProbDGNodeKind.SidedState;
        side: Side;
        leftId: CCS.ProcessId;
        rightId: CCS.ProcessId;
    }

    interface ProbDGDistributionNode {
        kind: ProbDGNodeKind.Distribution;
        leftDist: MultiSetUtil.MultiSet<CCS.ProcessId>;
        rightDist: MultiSetUtil.MultiSet<CCS.ProcessId>;
    }

    interface ProbDGSupportNode {
        kind: ProbDGNodeKind.Support;
        support: [CCS.ProcessId, CCS.ProcessId][];
        leftDist: MultiSetUtil.MultiSet<CCS.ProcessId>;
        rightDist: MultiSetUtil.MultiSet<CCS.ProcessId>;
    }

    function toConstructed<T>(
        node: T & UnconstructedProbDGNode,
        hyperedges: dg.Hyperedge[]
    ): T & ConstructedProbDGNode {
        // SAFETY: We immediately set isConstructed and hyperedges to valid values
        const newNode = node as unknown as T & ConstructedProbDGNode;
        newNode.isConstructed = true;
        newNode.hyperedges = hyperedges;
        return newNode;
    }

    function isProcessDist(proc: CCS.Process): proc is PCCS.ProbabilisticProcess {
        return 'dist' in proc;
    }

    function isConstructed(node: MaybeConstructedNode): node is ConstructedProbDGNode {
        return node.isConstructed;
    }

    /**
     * Compute the powerset of a set
     */
    function powerset<T>(s: T[]): T[][] {
        return s.reduce<T[][]>((acc, curr) => acc.concat(acc.map((x) => x.concat([curr]))), [[]]);
    }

    /**
     * A string representation of a given node in the dependency graph.
     * The keys of two nodes are equal if they have the same kind and the same kind-specific data.
     * Note that the construction data does not have to be equal.
     */
    function cacheKey(node: ProbabilisticDGNode): string {
        const kindDataKey = (node: ProbabilisticDGNode): string => {
            const sep = ';;';
            switch (node.kind) {
                case ProbDGNodeKind.NoSide:
                    return node.leftId + sep + node.rightId;
                case ProbDGNodeKind.SidedState:
                    return node.leftId + sep + node.rightId + sep + node.side;
                case ProbDGNodeKind.Distribution:
                    return node.leftDist.cacheKey((k) => k) + sep + node.rightDist.cacheKey((k) => k);
                case ProbDGNodeKind.Support:
                    return (
                        node.support.map((p) => '<' + p.sort().join(',') + '>').join('::') +
                        sep +
                        node.leftDist.cacheKey((k) => k) +
                        sep +
                        node.rightDist.cacheKey((k) => k)
                    );
            }
        };
        return node.kind + '//' + kindDataKey(node);
    }

    function hasValidCoupling(
        leftDist: MultiSetUtil.MultiSet<CCS.ProcessId>,
        rightDist: MultiSetUtil.MultiSet<CCS.ProcessId>,
        support: [CCS.ProcessId, CCS.ProcessId][]
    ): boolean {
        const hasSolution = (m: any): boolean => {
            const arr = m.toArray();
            for (let i = m.size()[0]!! - 1; i >= 0; i--) {
                const row = arr[i];

                for (let j = 0; j < row.length; j++) {
                    if (row[j] == 0) {
                        continue;
                    }

                    if (j == row.length - 1) {
                        return false;
                    }
                    return true;
                }
            }
            return true;
        };
        const toEchelon = (m) => {
            let result = m.map((x) => math.fraction(x));
            let h = 0;
            let k = 0;
            const rows = m.size()[0]!!;
            const columns = m.size()[1]!!;
            while (h < rows && k < columns) {
                let iMax = h;
                for (let i = h; i < rows; i++) {
                    if (result.get([i, k]).gt(result.get([iMax, k]))) {
                        iMax = i;
                    }
                }
                if (result.get([iMax, k]).equals(0)) {
                    k++;
                } else {
                    result.swapRows(h, iMax);
                    let tmp = result.get([h, k]);
                    for (let j = k; j < columns; j++) {
                        result.set([h, j], result.get([h, j]).div(tmp));
                    }
                    for (let i = h + 1; i < rows; i++) {
                        let factor = result.get([i, k]).div(result.get([h, k]));
                        result.set([i, k], 0);
                        for (let j = k + 1; j < columns; j++) {
                            result.set([i, j], result.get([i, j]).sub(result.get([h, j]).mul(factor)));
                        }
                    }
                    h++;
                    k++;
                }
            }
            return result;
        };

        const toMatrix = (ms: MultiSetUtil.MultiSet<ccs.ProcessId>) => {
            const size = ms.size();
            return math.matrix(
                ms
                    .getEntries()
                    .sort(({ proc: a }, { proc: b }) => a.localeCompare(b))
                    .map(({ proc, weight }) => ({ proc, weight: math.fraction(weight, size) }))
            );
        };

        const pi = toMatrix(leftDist);
        const rho = toMatrix(rightDist);

        const sCount = pi.size()[0]!;
        const tCount = rho.size()[0]!;

        const varCount = sCount * tCount;

        const A = math.matrix(math.zeros(sCount + tCount, varCount));

        for (let i = 0; i < sCount; i++) {
            for (let j = 0; j < tCount; j++) {
                const [tl, tr] = [pi.get([i]).proc, rho.get([j]).proc];
                if (support.some(([sl, sr]) => sl === tl && sr == tr)) {
                    A.set([i, i * sCount + j], 1);
                }
            }
        }

        for (let i = 0; i < tCount; i++) {
            for (let j = 0; j < sCount; j++) {
                const [tl, tr] = [pi.get([j]).proc, rho.get([i]).proc];
                if (support.some(([sl, sr]) => sl === tl && sr == tr)) {
                    A.set([i + sCount, j * sCount + i], 1);
                }
            }
        }

        const b = math.matrix(
            math.concat(
                pi.map(({ weight }) => weight),
                rho.map(({ weight }) => weight)
            )
        );

        const augmented = math.matrix(math.concat(A, math.reshape(b, [-1, 1])));

        const echelon = toEchelon(augmented);

        return hasSolution(echelon);
    }

    // TODO: We need to have some kind of hashmap to avoid constructing duplicate nodes
    export class ProbabilisticBisimDG implements dg.DependencyGraph {
        private nodes: ProbabilisticDGNode[] = [];
        private cache: Map<string, number> = new Map();
        private badPairs: Set<string> = new Set();

        constructor(
            private succGen: CCS.SuccessorGenerator,
            leftNode: CCS.ProcessId,
            rightNode: CCS.ProcessId
        ) {
            this.getOrAddNode({
                kind: ProbDGNodeKind.NoSide,
                isConstructed: false,
                leftId: leftNode,
                rightId: rightNode
            } as ProbDGNoSideNode & UnconstructedProbDGNode);
        }

        getHyperEdges(id: dg.DgNodeId): dg.Hyperedge[] {
            const node = this.nodes[id]!;
            const constructedNode = isConstructed(node) ? node : this.constructNode(node);
            this.nodes[id] = constructedNode;
            return dg.copyHyperEdges(constructedNode.hyperedges);
        }

        getAllHyperEdges(): [dg.DgNodeId, dg.Hyperedge][] {
            const result: [dg.DgNodeId, dg.Hyperedge][] = [];
            for (let i = 0; i < this.nodes.length; i++) {
                result.push([i, this.getHyperEdges(i)]);
            }
            return result;
        }

        public markNode(nodeId: dg.DgNodeId, isOne: boolean): void {
            if (!isOne) {
                return;
            }
            const node = this.nodes[nodeId]!;

            if (node.kind != ProbDGNodeKind.NoSide) {
                return;
            }

            this.badPairs.add(cacheKey(node));
        }

        /**
         * Add a node to the graph and cache
         *
         * @returns The index of the node in the nodes array
         */
        private getOrAddNode(node: ProbabilisticDGNode): number {
            const key = cacheKey(node);
            if (this.cache.get(key)) {
                return this.cache.get(key);
            }
            const i = this.nodes.push(node) - 1;
            this.cache.set(key, i);
            return i;
        }

        private constructNode(
            node: ProbabilisticDGNode & UnconstructedProbDGNode
        ): ProbabilisticDGNode & ConstructedProbDGNode {
            switch (node.kind) {
                case ProbDGNodeKind.NoSide:
                    return this.constructNoSideNode(node);
                case ProbDGNodeKind.SidedState:
                    return this.constructSidedStateNode(node);
                case ProbDGNodeKind.Distribution:
                    return this.constructDistributionNode(node);
                case ProbDGNodeKind.Support:
                    return this.constructSupportNode(node);
            }
        }

        private constructNoSideNode(
            node: ProbDGNoSideNode & UnconstructedProbDGNode
        ): ProbDGNoSideNode & ConstructedProbDGNode {
            const left: ProbDGSidedStateNode & UnconstructedProbDGNode = {
                kind: ProbDGNodeKind.SidedState,
                side: Side.Left,
                leftId: node.leftId,
                rightId: node.rightId,
                isConstructed: false
            };
            const right: ProbDGSidedStateNode & UnconstructedProbDGNode = {
                kind: ProbDGNodeKind.SidedState,
                side: Side.Right,
                leftId: node.leftId,
                rightId: node.rightId,
                isConstructed: false
            };

            const leftIdx = this.getOrAddNode(left);
            const rightIdx = this.getOrAddNode(right);

            return toConstructed(node, [[leftIdx], [rightIdx]]);
        }

        private constructSidedStateNode(
            node: ProbDGSidedStateNode & UnconstructedProbDGNode
        ): ProbDGSidedStateNode & ConstructedProbDGNode {
            const [attackerProc, defenderProc] = (
                node.side == Side.Left ? [node.leftId, node.rightId] : [node.rightId, node.leftId]
            ) as [CCS.ProcessId, CCS.ProcessId];

            const hyperedges = this.succGen
                .getSuccessors(attackerProc)
                .toArray()
                .map((attack) =>
                    this.succGen
                        .getSuccessors(defenderProc)
                        .toArray()
                        .filter((defense) => attack.action.equals(defense.action))
                        .map((defense) => {
                            if (!isProcessDist(attack.targetProcess)) {
                                throw `Target processes of attack was not a distribution. Attack: ${attack}.`;
                            }
                            if (!isProcessDist(defense.targetProcess)) {
                                throw `Target processes of defense was not a distribution. Defense: ${defense}.`;
                            }

                            const [leftDist, rightDist] =
                                node.side == Side.Left
                                    ? [attack.targetProcess.dist, defense.targetProcess.dist]
                                    : [defense.targetProcess.dist, attack.targetProcess.dist];

                            const target: ProbDGDistributionNode & UnconstructedProbDGNode = {
                                kind: ProbDGNodeKind.Distribution,
                                isConstructed: false,
                                leftDist: leftDist.map(({ proc, weight }) => ({ proc: proc.id, weight })),
                                rightDist: rightDist.map(({ proc, weight }) => ({ proc: proc.id, weight }))
                            };
                            return this.getOrAddNode(target);
                        })
                );

            return toConstructed(node, hyperedges);
        }

        private constructDistributionNode(
            node: ProbDGDistributionNode & UnconstructedProbDGNode
        ): ProbDGDistributionNode & ConstructedProbDGNode {
            const leftSupport = node.leftDist.support();
            const rightSupport = node.rightDist.support();
            // TODO: This could probably just be a Set, but I don't wanna fight the build system
            const prod: [CCS.ProcessId, CCS.ProcessId][] = [];

            for (const a of leftSupport) {
                for (const b of rightSupport) {
                    const aActions = this.succGen.getSuccessors(a).possibleActions().sort();
                    const bActions = this.succGen.getSuccessors(b).possibleActions().sort();
                    if (aActions.length == bActions.length && aActions.every((act, i) => act.equals(bActions[i]!))) {
                        prod.push([a, b]);
                    }
                }
            }

            const powerAll = powerset(prod);
            const power = powerAll.filter(
                (supp) =>
                    leftSupport.every((p) => supp.some(([q, _]) => p === q)) &&
                    rightSupport.every((p) => supp.some(([_, q]) => p === q)) &&
                    supp.every(
                        ([leftId, rightId]) =>
                            !this.badPairs.has(
                                cacheKey({
                                    kind: ProbDGNodeKind.NoSide,
                                    leftId,
                                    rightId,
                                    isConstructed: false
                                })
                            )
                    )
            );

            const targets = power.map((support) => {
                const target: ProbDGSupportNode & UnconstructedProbDGNode = {
                    kind: ProbDGNodeKind.Support,
                    isConstructed: false,
                    leftDist: node.leftDist,
                    rightDist: node.rightDist,
                    support
                };

                return this.getOrAddNode(target);
            });

            return toConstructed(node, [targets]);
        }

        private constructSupportNode(
            node: ProbDGSupportNode & UnconstructedProbDGNode
        ): ProbDGSupportNode & ConstructedProbDGNode {
            for (const [leftId, rightId] of node.support) {
                const toAdd: ProbDGNoSideNode & UnconstructedProbDGNode = {
                    kind: ProbDGNodeKind.NoSide,
                    leftId,
                    rightId,
                    isConstructed: false
                };
                if (this.badPairs.has(cacheKey(toAdd))) {
                    return toConstructed(node, [[]]);
                }
            }

            // If we can't make a valid coupling, we just go to empty set
            if (!hasValidCoupling(node.leftDist, node.rightDist, node.support)) {
                return toConstructed(node, [[]]);
            }

            const hyperedges = node.support.map(([leftId, rightId]) => [
                this.getOrAddNode({
                    kind: ProbDGNodeKind.NoSide,
                    leftId,
                    rightId,
                    isConstructed: false
                } as ProbDGNoSideNode & UnconstructedProbDGNode)
            ]);

            return toConstructed(node, hyperedges);
        }
    }
}
