// Graph class to represent a flow network
// Used to find a coupling between two distributions
class FlowGraph {
    private size: number;
    private graph: number[][];
    private leftEntries: { proc: CCS.ProcessId; weight: number; }[];
    private rightEntries: { proc: CCS.ProcessId; weight: number; }[];

    constructor(distLeft: MultiSetUtil.MultiSet<CCS.ProcessId>, distRight: MultiSetUtil.MultiSet<CCS.ProcessId>) {
        // Ensure that the left and right distributions have the same size
        let lcm = distLeft.leastCommonMultiple(distRight);
        distLeft.scale(lcm / distLeft.size());
        distRight.scale(lcm / distRight.size());
        
        this.leftEntries = distLeft.getEntries();
        this.rightEntries = distRight.getEntries();
        // Create a graph with size equal to the number of entries in both distributions + 2 (for source and sink)
        this.size = this.leftEntries.length + this.rightEntries.length + 2; // +2 for source and sink
        this.graph = Array.from({ length: this.size }, () => Array(this.size).fill(0));
        this.leftEntries.forEach((entry, index) => {
            this.graph[0][index + 1] = entry.weight; // Source to left distribution
        });
        this.rightEntries.forEach((entry, index) => {
            this.graph[index + this.leftEntries.length + 1][this.size - 1] = entry.weight; // Right distribution to sink
        });
    }

    couplingExists(support: [string, string][]): boolean {
        for (let i = 0; i < support.length; i++) {
            let leftIndex = this.leftEntries.findIndex(entry => entry.proc === support[i][0]);
            let rightIndex = this.rightEntries.findIndex(entry => entry.proc === support[i][1]);
            this.graph[leftIndex + 1][rightIndex + this.leftEntries.length + 1] = Infinity;
        }

        this.fordFulkerson(0, this.size - 1);
        // coupling exists if all residual capacities from source to sink are 0
        return this.graph[0].every((capacity) => capacity === 0)
    }

    // DFS to find an augmenting path
    private dfs(current: number, sink: number, visited: boolean[], parent: number[]): boolean {
        visited[current] = true;

        if (current === sink) return true;

        for (let next = 0; next < this.size; next++) {
            if (!visited[next] && this.graph[current][next] > 0) {
                parent[next] = current;
                if (this.dfs(next, sink, visited, parent)) return true;
            }
        }

        return false;
    }

    fordFulkerson(source: number, sink: number): number {
        let maxFlow = 0;
        const parent: number[] = Array(this.size).fill(-1);

        while (true) {
            const visited: boolean[] = Array(this.size).fill(false);
            if (!this.dfs(source, sink, visited, parent)) break;

            // Find minimum capacity in the path
            let pathFlow = Infinity;
            for (let v = sink; v !== source; v = parent[v]) {
                const u = parent[v];
                pathFlow = Math.min(pathFlow, this.graph[u][v]);
            }

            // Update residual capacities
            for (let v = sink; v !== source; v = parent[v]) {
                const u = parent[v];
                this.graph[u][v] -= pathFlow;
                this.graph[v][u] += pathFlow;
            }

            maxFlow += pathFlow;
        }

        return maxFlow;
    }
}
