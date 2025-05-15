/// <reference path="../../lib/util.d.ts" />
/// <reference path="../gui/project.ts" />
/// <reference path="../gui/gui.ts" />
/// <reference path="../gui/arbor/arbor.ts" />
/// <reference path="../gui/arbor/renderer.ts" />
/// <reference path="activity.ts" />
/// <reference path="fullscreen.ts" />
/// <reference path="tooltip.ts" />

module Activity {
    import dg = DependencyGraph;

    export class Game extends Activity {
        private graph: CCS.Graph;
        private succGen: CCS.SuccessorGenerator;
        private dgGame: DgGame;
        private fullscreen: Fullscreen;
        private tooltip: ProcessTooltip;
        private timeout: any;
        private $leftProcessList: JQuery;
        private $rightProcessList: JQuery;
        private $ccsGameTypes: JQuery;
        private $tccsGameTypes: JQuery;
        private $gameRelation: JQuery;
        private $playerType: JQuery;
        private $restart: JQuery;
        private $leftContainer: JQuery;
        private $rightContainer: JQuery;
        private $leftZoom: JQuery;
        private $rightZoom: JQuery;
        private $leftDepth: JQuery;
        private $rightDepth: JQuery;
        private $leftFreeze: JQuery;
        private $rightFreeze: JQuery;
        private leftCanvas: HTMLCanvasElement;
        private rightCanvas: HTMLCanvasElement;
        private leftRenderer: Renderer;
        private rightRenderer: Renderer;
        private leftGraph: GUI.ProcessGraphUI;
        private rightGraph: GUI.ProcessGraphUI;

        constructor(container: string, button: string, activeToggle: string) {
            super(container, button, activeToggle);

            this.project = Project.getInstance();
            this.fullscreen = new Fullscreen($('#game-container')[0], $('#game-fullscreen'), () =>
                this.resize(null, null)
            );
            this.tooltip = new ProcessTooltip($('#game-status'));
            new DataTooltip($('#game-log')); // no need to save instance

            this.$leftProcessList = $('#game-left-process');
            this.$rightProcessList = $('#game-right-process');
            this.$ccsGameTypes = $('#game-ccs-type');
            this.$tccsGameTypes = $('#game-tccs-type');
            this.$gameRelation = $('#game-relation');
            this.$playerType = $('input[name=player-type]');
            this.$restart = $('#game-restart');
            this.$leftContainer = $('#game-left-canvas');
            this.$rightContainer = $('#game-right-canvas');
            this.$leftZoom = $('#zoom-left');
            this.$rightZoom = $('#zoom-right');
            this.$leftDepth = $('#depth-left');
            this.$rightDepth = $('#depth-right');
            this.$leftFreeze = $('#freeze-left');
            this.$rightFreeze = $('#freeze-right');
            this.leftCanvas = <HTMLCanvasElement>this.$leftContainer.find('canvas')[0];
            this.rightCanvas = <HTMLCanvasElement>this.$rightContainer.find('canvas')[0];

            this.leftRenderer = new Renderer(this.leftCanvas);
            this.rightRenderer = new Renderer(this.rightCanvas);
            this.leftGraph = new GUI.ArborGraph(this.leftRenderer);
            this.rightGraph = new GUI.ArborGraph(this.rightRenderer);

            this.$leftProcessList.on('change', () => this.newGame(true, false));
            this.$rightProcessList.on('change', () => this.newGame(false, true));
            this.$ccsGameTypes.on('change', () => this.newGame(true, true));
            this.$tccsGameTypes.on('change', () => this.newGame(true, true));
            this.$gameRelation.on('change', () => this.newGame(false, false));
            this.$playerType.on('change', () => this.newGame(false, false));
            this.$restart.on('click', () => this.newGame(false, false));
            this.$rightDepth.on('change', () =>
                this.setDepth(
                    this.dgGame.getCurrentConfiguration().right,
                    this.rightGraph,
                    this.$rightDepth.val(),
                    Move.Right
                )
            );
            this.$leftFreeze.on('click', (e) =>
                this.toggleFreeze(this.leftGraph, !this.$leftFreeze.data('frozen'), $(e.currentTarget))
            );
            this.$rightFreeze.on('click', (e) =>
                this.toggleFreeze(this.rightGraph, !this.$rightFreeze.data('frozen'), $(e.currentTarget))
            );

            // Manually remove focus from depth input when the canvas is clicked.
            $(this.leftCanvas).on('click', () => {
                if (this.$leftDepth.is(':focus')) this.$leftDepth.blur();
            });
            $(this.rightCanvas).on('click', () => {
                if (this.$rightDepth.is(':focus')) this.$rightDepth.blur();
            });

            this.$leftDepth.on('change', () => {
                this.validateDepth(this.$leftDepth);
                this.setDepth(
                    this.dgGame.getCurrentConfiguration().left,
                    this.leftGraph,
                    this.$leftDepth.val(),
                    Move.Left
                );
            });

            this.$rightDepth.on('change', () => {
                this.validateDepth(this.$rightDepth);
                this.setDepth(
                    this.dgGame.getCurrentConfiguration().right,
                    this.rightGraph,
                    this.$rightDepth.val(),
                    Move.Right
                );
            });

            // Use onchange instead of oninput for IE.
            if (navigator.userAgent.indexOf('MSIE ') > 0 || !!navigator.userAgent.match(/Trident.*rv\:11\./)) {
                this.$leftZoom.on('change', () => this.resize(this.$leftZoom.val(), null));
                this.$rightZoom.on('change', () => this.resize(null, this.$rightZoom.val()));
            } else {
                this.$leftZoom.on('input', () => this.resize(this.$leftZoom.val(), null));
                this.$rightZoom.on('input', () => this.resize(null, this.$rightZoom.val()));
            }
        }

        get inputMode(): InputMode {
            return this.project.getInputMode();
        }

        public getSuccessorGenerator(): CCS.SuccessorGenerator {
            return this.succGen;
        }

        public getGraph(): CCS.Graph {
            return this.graph;
        }

        private setDepth(process: CCS.Process, graph: GUI.ProcessGraphUI, depth: number, move: Move): void {
            this.clear(graph);
            this.draw(process, graph, depth);
            this.centerNode(process, move);

            if (move === Move.Left) this.toggleFreeze(graph, false, this.$leftFreeze);
            else this.toggleFreeze(graph, false, this.$rightFreeze);
        }

        private validateDepth($input: JQuery): void {
            if (!/^[1-9][0-9]*$/.test($input.val())) {
                $input.val($input.data('previous-depth'));
            } else {
                $input.data('previous-depth', $input.val());
            }
        }

        private toggleFreeze(graph: GUI.ProcessGraphUI, freeze: boolean, button: JQuery): void {
            if (freeze) {
                graph.freeze();
                button.find('i').replaceWith("<i class='fa fa-lock fa-lg'></i>");
            } else {
                graph.unfreeze();
                button.find('i').replaceWith("<i class='fa fa-unlock-alt fa-lg'></i>");
            }

            button.data('frozen', freeze);
        }

        public onShow(configuration?: any): void {
            $(window).on('resize', () => this.resize(this.$leftZoom.val(), this.$rightZoom.val()));

            this.fullscreen.onShow();

            if (this.changed || configuration) {
                if (this.project.getInputMode() === InputMode.CCS) {
                    this.$ccsGameTypes.show();
                    this.$tccsGameTypes.hide();
                } else {
                    this.$ccsGameTypes.hide();
                    this.$tccsGameTypes.show();
                }

                this.changed = false;
                this.graph = this.project.getGraph();
                this.displayOptions();
                this.newGame(true, true, configuration);
            }

            this.tooltip.setGraph(this.graph);

            this.leftGraph.setOnSelectListener((processId) => {
                if (this.leftGraph.getProcessDataObject(processId.toString()).status === 'unexpanded')
                    this.draw(this.graph.processById(processId), this.leftGraph, this.$leftDepth.val());
            });

            this.rightGraph.setOnSelectListener((processId) => {
                if (this.rightGraph.getProcessDataObject(processId.toString()).status === 'unexpanded')
                    this.draw(this.graph.processById(processId), this.rightGraph, this.$rightDepth.val());
            });

            this.leftGraph.setHoverOnListener((processId) => {
                this.timeout = setTimeout(() => {
                    var tooltipAnchor = $('#game-canvas-tooltip-left');
                    var position = this.leftGraph.getPosition(processId);

                    tooltipAnchor.css('left', position.x - this.$leftContainer.scrollLeft());
                    tooltipAnchor.css('top', position.y - this.$leftContainer.scrollTop() - 10);

                    tooltipAnchor.tooltip({ title: this.tooltip.ccsNotationForProcessId(processId), html: true });
                    tooltipAnchor.tooltip('show');
                }, 1000);
            });

            this.leftGraph.setHoverOutListener(() => {
                clearTimeout(this.timeout);
                $('#game-canvas-tooltip-left').tooltip('destroy');
            });

            this.rightGraph.setHoverOnListener((processId) => {
                this.timeout = setTimeout(() => {
                    var tooltipAnchor = $('#game-canvas-tooltip-right');
                    var position = this.rightGraph.getPosition(processId);

                    tooltipAnchor.css('left', position.x - this.$rightContainer.scrollLeft());
                    tooltipAnchor.css('top', position.y - this.$rightContainer.scrollTop() - 10);

                    tooltipAnchor.tooltip({ title: this.tooltip.ccsNotationForProcessId(processId), html: true });
                    tooltipAnchor.tooltip('show');
                }, 1000);
            });

            this.rightGraph.setHoverOutListener(() => {
                clearTimeout(this.timeout);
                $('#game-canvas-tooltip-right').tooltip('destroy');
            });

            this.leftGraph.bindCanvasEvents();
            this.rightGraph.bindCanvasEvents();

            this.toggleFreeze(this.leftGraph, this.$leftFreeze.data('frozen'), this.$leftFreeze); // (un)freeze, depending on the lock icon
            this.toggleFreeze(this.rightGraph, this.$rightFreeze.data('frozen'), this.$rightFreeze); // (un)freeze, depending on the lock icon
        }

        public onHide(): void {
            $(window).off('resize');

            this.fullscreen.onHide();

            this.leftGraph.clearOnSelectListener();
            this.rightGraph.clearOnSelectListener();
            this.leftGraph.clearHoverOnListener();
            this.rightGraph.clearHoverOnListener();
            this.leftGraph.clearHoverOutListener();
            this.rightGraph.clearHoverOutListener();

            this.leftGraph.unbindCanvasEvents();
            this.rightGraph.unbindCanvasEvents();

            this.leftGraph.freeze(); // force freeze for graph
            this.rightGraph.freeze(); // force freeze for graph
        }

        private displayOptions(): void {
            var processes = this.graph.getNamedProcesses().reverse();

            this.$leftProcessList.empty();
            this.$rightProcessList.empty();

            for (var i = 0; i < processes.length; i++) {
                this.$leftProcessList.append($('<option></option>').append(processes[i]));
                this.$rightProcessList.append($('<option></option>').append(processes[i]));
            }

            // Set second option as default selection for the right process.
            this.$rightProcessList.find('option:nth-child(2)').prop('selected', true);
        }

        private getOptions(): any {
            var options = {
                leftProcess: this.$leftProcessList.val(),
                rightProcess: this.$rightProcessList.val(),
                type: null,
                time: '',
                relation: this.$gameRelation.val(),
                playerType: this.$playerType.filter(':checked').val()
            };

            if (this.project.getInputMode() === InputMode.CCS) {
                options.type = this.$ccsGameTypes.val();
            } else {
                options.type = this.$tccsGameTypes.find('option:selected').val();
                options.time = this.$tccsGameTypes.find('option:selected').data('time');
            }

            return options;
        }

        private setOptions(options: any): void {
            this.$leftProcessList.val(options.leftProcess);
            this.$rightProcessList.val(options.rightProcess);

            if (this.project.getInputMode() === InputMode.CCS) {
                this.$ccsGameTypes.val(options.type);
            } else {
                this.$tccsGameTypes
                    .find('[value=' + options.type + '][data-time=' + options.time + ']')
                    .prop('selected', true);
            }

            this.$gameRelation.val(options.relation);

            // Bootstrap radio buttons only support changes via click events.
            // Manually handle .active class.
            this.$playerType.each(function () {
                if ($(this).attr('value') === options.playerType) {
                    $(this).parent().addClass('active');
                } else {
                    $(this).parent().removeClass('active');
                }
            });
        }

        private newGame(drawLeft: boolean, drawRight: boolean, configuration?: any): void {
            var options;

            if (configuration) {
                options = configuration;
                this.setOptions(options);
            } else {
                options = this.getOptions();
            }

            // TODO: make sure this is actually the PCCS succgen
            this.succGen = CCS.getSuccGenerator(this.graph, {
                inputMode: InputMode[this.project.getInputMode()],
                time: options.time,
                succGen: options.type,
                reduce: true
            });

            if (drawLeft || !this.leftGraph.getNode(this.succGen.getProcessByName(options.leftProcess).id.toString())) {
                this.clear(this.leftGraph);
                this.draw(this.succGen.getProcessByName(options.leftProcess), this.leftGraph, this.$leftDepth.val());
                this.resize(1, null);
                this.toggleFreeze(this.leftGraph, false, this.$leftFreeze);
            }

            if (
                drawRight ||
                !this.rightGraph.getNode(this.succGen.getProcessByName(options.rightProcess).id.toString())
            ) {
                this.clear(this.rightGraph);
                this.draw(this.succGen.getProcessByName(options.rightProcess), this.rightGraph, this.$rightDepth.val());
                this.resize(null, 1);
                this.toggleFreeze(this.rightGraph, false, this.$rightFreeze);
            }

            var attackerSuccessorGenerator: CCS.SuccessorGenerator = CCS.getSuccGenerator(this.graph, {
                inputMode: InputMode[this.project.getInputMode()],
                time: 'timed',
                succGen: 'strong',
                reduce: true
            });
            var defenderSuccessorGenerator: CCS.SuccessorGenerator = this.succGen;

            if (this.dgGame !== undefined) {
                this.dgGame.stopGame();
            }

            // PCCS currently only supports strong bisimulation
            // It has its own game class as it is fundamentally different (i.e. each player has two actions)
            if (this.project.getInputMode() === InputMode.PCCS) {
                this.dgGame = new ProbabilisticBisimulationGame(
                    this,
                    this.graph as PCCS.Graph,
                    attackerSuccessorGenerator as PCCS.StrictSuccessorGenerator,
                    defenderSuccessorGenerator as PCCS.StrictSuccessorGenerator,
                    options.leftProcess,
                    options.rightProcess,
                    options.time,
                    options.type
                )
            }
            else if (options.relation === 'Simulation') {
                this.dgGame = new SimulationGame(
                    this,
                    this.graph,
                    attackerSuccessorGenerator,
                    defenderSuccessorGenerator,
                    options.leftProcess,
                    options.rightProcess,
                    options.time,
                    options.type
                );
            } else if (options.relation === 'Bisimulation') {
                this.dgGame = new BisimulationGame(
                    this,
                    this.graph,
                    attackerSuccessorGenerator,
                    defenderSuccessorGenerator,
                    options.leftProcess,
                    options.rightProcess,
                    options.time,
                    options.type
                );
            }

            this.dgGame.computeMarking();

            var attacker: Player;
            var defender: Player;

            if (options.playerType === 'defender') {
                attacker = new Computer(PlayType.Attacker);
                defender = new Human(PlayType.Defender, this);
            } else {
                attacker = new Human(PlayType.Attacker, this);
                defender = new Computer(PlayType.Defender);
            }

            this.dgGame.setPlayers(attacker, defender);
            this.dgGame.startGame();
        }

        private draw(process: CCS.Process, graph: GUI.ProcessGraphUI, depth: number): void {
            var allTransitions = CCS.getNSuccessors(
                CCS.getSuccGenerator(this.graph, {
                    inputMode: InputMode[this.project.getInputMode()],
                    time: 'timed',
                    succGen: 'strong',
                    reduce: true
                }),
                process,
                depth
            ); //this.expandBFS(process, depth);

            for (var fromId in allTransitions) {
                var fromProcess = this.graph.processById(fromId);
                this.showProcess(fromProcess, graph);
                this.showProcessAsExplored(fromProcess, graph);
                var groupedByTargetProcessId = ArrayUtil.groupBy(
                    allTransitions[fromId].toArray(),
                    (t) => t.targetProcess.id
                );

                Object.keys(groupedByTargetProcessId).forEach((strProcId) => {
                    var group = groupedByTargetProcessId[strProcId];
                    var data = group.map((t) => {
                        return { label: t.action.toString() };
                    });
                    var targetProcess: PCCS.ProbabilisticProcess = group[0].targetProcess;

                    if (this.project.getInputMode() === InputMode.PCCS) {
                        this.showProbabilityDistrubution(strProcId, graph); // Show dot
                        graph.showTransitions(fromProcess.id, strProcId, data); // transition from fromProcess to dot
                        targetProcess.dist.getProbabilities().forEach(({ proc, probability }) => {
                            // for each target process in the distrubution, create transition from dot to target
                            this.showProcess(proc, graph);

                            if (isNaN(probability)) {
                                console.error('NaN prop for', proc);
                            }
                            graph.showTransitions(strProcId, proc.id, [
                                { dashed: true, label: probability }
                            ]);
                        });
                    } else {
                        this.showProcess(targetProcess, graph);
                        graph.showTransitions(fromProcess.id, strProcId, data);
                    }
                });
            }

            this.highlightNodes();
        }

        private showProbabilityDistrubution(process: string, graph: GUI.ProcessGraphUI): void {
            // if (!process || this.uiGraph.getProcessDataObject(process.id)) return;
            console.log("String: ", process);
            graph.showProcess(process, { label: this.graph.getLabel(this.graph.processById(process)), probabilityDistrubution: true });
        }

        private showProcess(process: CCS.Process, graph: GUI.ProcessGraphUI): void {
            if (graph.getProcessDataObject(process.id)) return;
            graph.showProcess(process.id, { label: this.labelFor(process), status: 'unexpanded' });
        }

        private showProcessAsExplored(process: CCS.Process, graph: GUI.ProcessGraphUI): void {
            graph.getProcessDataObject(process.id).status = 'expanded';
        }

        public onPlay(strictPath: CCS.Transition[], move: Move): void {
            if (!strictPath) return;
            this.highlightNodes();
            // var graph = move === Move.Left ? this.leftGraph : this.rightGraph;
            // for (var i = 0; i < strictPath.length; i++) {
            //     this.draw(strictPath[i].targetProcess, graph, 1);
            // }
            // var expandDepth = move === Move.Left ? this.$leftDepth.val() : this.$rightDepth.val();
            // this.draw(strictPath[strictPath.length - 1].targetProcess, graph, expandDepth);
        }

        public highlightNodes(): void {
            if (!this.dgGame) return;
            console.log('highlightNodes');
            console.log(this.dgGame.getCurrentConfiguration());

            var configuration = this.dgGame.getCurrentConfiguration();
            this.leftGraph.setSelected(configuration.left.id);
            this.rightGraph.setSelected(configuration.right.id);
        }

        public highlightChoices(isLeft: boolean, targetId: string): void {
            if (isLeft) {
                this.leftGraph.highlightToNode(targetId);
            } else {
                this.rightGraph.highlightToNode(targetId);
            }
        }

        public removeHighlightChoices(isLeft: boolean): void {
            if (isLeft) {
                this.leftGraph.clearHighlights();
            } else {
                this.rightGraph.clearHighlights();
            }
        }

        private clear(graph: GUI.ProcessGraphUI): void {
            graph.clearAll();
        }

        public labelFor(process: CCS.Process): string {
            return this.graph.getLabel(process);
        }

        public centerNode(process: CCS.Process, move: Move): void {
            if (move === Move.Left) {
                var position = this.leftGraph.getPosition(process.id.toString());
                this.$leftContainer.scrollLeft(position.x - this.$leftContainer.width() / 2);
                this.$leftContainer.scrollTop(position.y - this.$leftContainer.height() / 2);
            } else {
                var position = this.rightGraph.getPosition(process.id.toString());
                this.$rightContainer.scrollLeft(position.x - this.$rightContainer.width() / 2);
                this.$rightContainer.scrollTop(position.y - this.$rightContainer.height() / 2);
            }
        }

        private resize(leftZoom: number, rightZoom: number): void {
            var offsetTop = $('#game-main').offset().top;
            var offsetBottom = $('#game-status').height();

            var availableHeight = window.innerHeight - offsetTop - offsetBottom - 17; // Margin bot + border = 22px.

            // Minimum height 265px.
            var height = Math.max(265, availableHeight);
            this.$leftContainer.height(height);
            this.$rightContainer.height(height);

            if (leftZoom !== null) {
                this.$leftZoom.val(leftZoom.toString());
                this.leftCanvas.width = this.$leftContainer.width() * leftZoom;
                this.leftCanvas.height = height * leftZoom;
                this.leftRenderer.resize(this.leftCanvas.width, this.leftCanvas.height);

                if (leftZoom > 1) {
                    $('#game-left .input-group').css('right', 30);
                    this.$leftContainer.css('overflow', 'auto');
                    this.centerNode(this.dgGame.getCurrentConfiguration().left, Move.Left);
                } else {
                    $('#game-left .input-group').css('right', 10);
                    this.$leftContainer.css('overflow', 'hidden');
                }
            }

            if (rightZoom !== null) {
                this.$rightZoom.val(rightZoom.toString());
                this.rightCanvas.width = this.$rightContainer.width() * rightZoom;
                this.rightCanvas.height = height * rightZoom;
                this.rightRenderer.resize(this.rightCanvas.width, this.rightCanvas.height);

                if (rightZoom > 1) {
                    $('#game-right .input-group').css('right', 30);
                    this.$rightContainer.css('overflow', 'auto');
                    this.centerNode(this.dgGame.getCurrentConfiguration().right, Move.Right);
                } else {
                    $('#game-right .input-group').css('right', 10);
                    this.$rightContainer.css('overflow', 'hidden');
                }
            }
        }
    }

    export enum PlayType {
        Attacker,
        Defender
    }
    export enum Move {
        Left,
        Right
    }

    abstract class DgGame {
        protected dependencyGraph: dg.PlayableDependencyGraph;
        protected marking: dg.LevelMarking;
        protected graph: CCS.Graph;
        protected gameType: string;
        protected time: string;

        protected gameActivity: Game;
        protected gameLog: GameLog;

        protected currentLeft: any;
        protected currentRight: any;

        protected attacker: Player;
        protected defender: Player;
        protected currentWinner: Player;

        protected round: number = 1;
        protected lastMove: Move;
        protected lastAction: CCS.Action;
        protected currentNodeId: dg.DgNodeId = 0; // the DG node id

        private cycleCache: any;

        constructor(
            gameActivity: Game,
            gameLog: GameLog,
            graph: CCS.Graph,
            currentLeft: any,
            currentRight: any,
            time: string,
            gameType: string
        ) {
            this.gameActivity = gameActivity;
            this.gameLog = gameLog;
            this.graph = graph;
            this.gameType = gameType;
            this.time = time;
            this.currentLeft = currentLeft;
            this.currentRight = currentRight;
        }

        public isPCCS(): boolean {
            return this.graph instanceof PCCS.Graph;
        }

        public getTransitionStr(isAttack: boolean, action: string): string {
            var timedSubScript: string =
                this.time === 'timed' ? '<sub>t</sub>' : this.time === 'untimed' ? '<sub>u</sub>' : '';
            if (!isAttack && this.gameType === 'weak') {
                return '=' + action + '=>' + timedSubScript;
            } else {
                return '-' + action + '->' + (this.time === '' ? '' : isAttack ? '<sub>t</sub>' : timedSubScript);
            }
        }

        public hasAbstractions(): boolean {
            return this.gameType === 'weak' || this.time === 'untimed';
        }

        public getGameLog(): GameLog {
            return this.gameLog;
        }

        get InputMode(): InputMode {
            return this.gameActivity.inputMode;
        }

        public computeMarking(): dg.LevelMarking {
            this.dependencyGraph = this.createDependencyGraph(this.graph, this.currentLeft, this.currentRight);
            this.marking = this.createMarking();
            return this.marking;
        }

        protected createMarking(): dg.LevelMarking {
            return dg.liuSmolkaLocal2(this.currentNodeId, this.dependencyGraph);
        }

        public getRound(): number {
            return this.round;
        }

        public isUniversalWinner(player: Player): boolean {
            // returns true if the player has a universal winning strategy
            return this.getUniversalWinner() === player;
        }

        public isCurrentWinner(player: Player): boolean {
            return this.getCurrentWinner() === player;
        }

        public getLastMove(): Move {
            return this.lastMove;
        }

        public getLastAction(): CCS.Action {
            return this.lastAction;
        }

        public getCurrentConfiguration(): any {
            return { left: this.currentLeft, right: this.currentRight };
        }

        public startGame(): void {
            if (this.attacker == undefined || this.defender == undefined) throw 'No players in game.';
            this.stopGame();
            this.currentNodeId = 0;

            this.cycleCache = {};
            this.cycleCache[this.getConfigurationStr(this.getCurrentConfiguration())] = this.currentNodeId;

            this.gameActivity.highlightNodes();
            this.gameActivity.centerNode(this.currentLeft, Move.Left);
            this.gameActivity.centerNode(this.currentRight, Move.Right);

            this.gameLog.printRound(this.round, this.getCurrentConfiguration());
            this.preparePlayer(this.attacker);
        }

        public stopGame(): void {
            // tell players to abort their prepared play
            this.attacker.abortPlay();
            this.defender.abortPlay();
        }

        public setPlayers(attacker: Player, defender: Player): void {
            if (attacker.getPlayType() == defender.getPlayType()) {
                throw 'Cannot make game with two ' + attacker.playTypeStr() + 's';
            } else if (attacker.getPlayType() != PlayType.Attacker || defender.getPlayType() != PlayType.Defender) {
                throw 'setPlayer(...) : First argument must be attacker and second defender';
            }

            this.attacker = attacker;
            this.defender = defender;
            this.currentWinner = this.getUniversalWinner();
        }

        protected saveCurrentProcess(process: any, move: Move): void {
            switch (move) {
                case Move.Left:
                    this.currentLeft = process;
                    break;
                case Move.Right:
                    this.currentRight = process;
                    break;
            }
        }

        public abstract play(
            player: Player,
            choice: any,
        ): void

        public preparePlayer(player: Player) {
            var choices: any = this.getCurrentChoices(player.getPlayType());
            console.log('choices', choices);

            // determine if game is over
            if (choices.length === 0) {
                // the player to be prepared cannot make a move
                // the player to prepare has lost, announce it
                this.gameLog.printWinner(player === this.attacker ? this.defender : this.attacker);

                // stop game
                this.stopGame();
            } else {
                // save the old winner, and then update who wins
                var oldWinner = this.currentWinner;
                this.currentWinner = this.getCurrentWinner();

                // if winner changed, let the user know
                if (oldWinner !== this.currentWinner) this.gameLog.printWinnerChanged(this.currentWinner);

                // tell the player to prepare for his turn
                player.prepareTurn(choices, this);
            }
        }

        protected cycleExists(): boolean {
            var configuration = this.getCurrentConfiguration();
            var cacheStr = this.getConfigurationStr(configuration);

            if (this.cycleCache[cacheStr] != undefined) {
                // cycle detected
                this.gameLog.printCycleWinner(this.defender);
                this.stopGame();

                // clear the cache
                this.cycleCache = {};
                this.cycleCache[cacheStr] = this.currentNodeId;
                return true;
            } else {
                this.cycleCache[cacheStr] = this.currentNodeId;
                return false;
            }
        }

        public getConfigurationStr(configuration: any): string {
            var result = '(';

            result += this.graph.getLabel(configuration.left);
            result += ', ';
            result += this.graph.getLabel(configuration.right);
            result += ')';

            return result;
        }

        public getCurrentChoices(playType: PlayType): any {
            if (playType == PlayType.Attacker) return this.dependencyGraph.getAttackerOptions(this.currentNodeId);
            else return this.dependencyGraph.getDefenderOptions(this.currentNodeId);
        }

        /* Abstract methods */
        public abstract getUniversalWinner(): Player
        public abstract getCurrentWinner(): Player
        public abstract getBestWinningAttack(choices: any): any
        public abstract getTryHardAttack(choices: any): any
        public abstract getWinningDefend(choices: any): any
        public abstract getTryHardDefend(choices: any): any
        protected abstract createDependencyGraph(
            graph: CCS.Graph,
            currentLeft: any,
            currentRight: any
        ): dg.PlayableDependencyGraph
    }

    abstract class DgComputerStrategy extends DgGame {
        constructor(
            gameActivity: Game,
            gameLog: GameLog,
            graph: CCS.Graph,
            currentLeft: any,
            currentRight: any,
            gameType: string,
            time: string
        ) {
            super(gameActivity, gameLog, graph, currentLeft, currentRight, time, gameType);
        }

        public getBestWinningAttack(choices: any): any {
            if (choices.length == 0) throw 'No choices for attacker';

            var bestCandidateIndex = 0;
            var bestCandidateLevel = Infinity;
            var ownLevel = this.marking.getLevel(this.currentNodeId);

            choices.forEach((choice, i) => {
                var targetNodeLevel = this.marking.getLevel(choice.nextNode);

                if (targetNodeLevel < ownLevel && targetNodeLevel < bestCandidateLevel) {
                    bestCandidateLevel = targetNodeLevel;
                    bestCandidateIndex = i;
                }
            });

            return choices[bestCandidateIndex];
        }

        public getTryHardAttack(choices: any): any {
            // strategy: Play the choice which yields the highest ratio of one-markings on the defenders next choice
            var bestCandidateIndices: number[] = [];
            var bestRatio = 0;

            choices.forEach((choice: { nextNode: any; }, i: number) => {
                var oneMarkings = 0;
                var defenderChoices: any = this.dependencyGraph.getDefenderOptions(choice.nextNode);

                if (defenderChoices.length > 0) {
                    defenderChoices.forEach((defendChoice) => {
                        if (this.marking.getMarking(defendChoice.nextNode) === this.marking.ONE) oneMarkings++;
                    });

                    var ratio = oneMarkings / defenderChoices.length;

                    if (ratio > bestRatio) {
                        bestRatio = ratio;
                        bestCandidateIndices = [i];
                    } else if (ratio == bestRatio) {
                        bestCandidateIndices.push(i);
                    }
                } else {
                    bestCandidateIndices = [i];
                }
            });

            if (bestRatio == 0) {
                // no-one markings were found, retun random choice
                return choices[this.random(choices.length - 1)];
            } else {
                // return a random choice between the equally best choices
                return choices[bestCandidateIndices[this.random(bestCandidateIndices.length - 1)]!];
            }
        }

        public getWinningDefend(choices: any): any {
            for (var i = 0; i < choices.length; i++) {
                if (this.marking.getMarking(choices[i].nextNode) === this.marking.ZERO) {
                    return choices[i];
                }
            }

            throw 'No defender moves';
        }

        public getTryHardDefend(choices: any): any {
            // strategy: Play the choice with the highest level
            var bestCandidateIndices: number[] = [];
            var bestLevel = 0;

            for (var i = 0; i < choices.length; i++) {
                var level = this.marking.getLevel(choices[i].nextNode);

                if (level > bestLevel) {
                    bestLevel = level;
                    bestCandidateIndices = [i];
                } else if (level == bestLevel) {
                    bestCandidateIndices.push(i);
                }
            }

            if (bestLevel == 0) {
                // if no good levels were found return a random play
                return choices[this.random(choices.length - 1)];
            } else {
                // return a random choice between the equally best choices
                return choices[bestCandidateIndices[this.random(bestCandidateIndices.length - 1)]!];
            }
        }

        private random(max: number): number {
            // random integer between 0 and max
            return Math.floor(Math.random() * (max + 1));
        }
    }

    class BisimulationGame extends DgComputerStrategy {
        protected leftProcessName: string;
        protected rightProcessName: string;
        protected bisimulationDg: Equivalence.BisimulationDG | Equivalence.ProbabilisticBisimDG;
        protected bisimilar: boolean;
        protected attackerSuccessorGen: CCS.SuccessorGenerator;
        protected defenderSuccessorGen: CCS.SuccessorGenerator;

        constructor(
            gameActivity: Game,
            graph: CCS.Graph,
            attackerSuccessorGen: CCS.SuccessorGenerator,
            defenderSuccessorGen: CCS.SuccessorGenerator,
            leftProcessName: string,
            rightProcessName: string,
            time: string,
            gameType: string
        ) {
            var currentLeft = graph.processByName(leftProcessName);
            var currentRight = graph.processByName(rightProcessName);

            super(
                gameActivity,
                new BisimulationGameLog(time, gameActivity),
                graph,
                currentLeft,
                currentRight,
                gameType,
                time
            ); // creates dependency graph and marking

            this.leftProcessName = leftProcessName;
            this.rightProcessName = rightProcessName;
            this.attackerSuccessorGen = attackerSuccessorGen;
            this.defenderSuccessorGen = defenderSuccessorGen;
        }

        public getGameType(): string {
            return this.gameType;
        }

        public override startGame(): void {
            this.gameLog.printIntro(
                this.gameType,
                this.getCurrentConfiguration(),
                this.getUniversalWinner(),
                this.attacker
            );
            super.startGame();
        }

        public play(
            player: Player,
            choice: any,
        ): void {
            let destinationProcess = choice.targetProcess;
            let action = choice.action ?? this.lastAction // default value
            console.log("choice.move: ", choice.move)

            var previousConfig = this.getCurrentConfiguration();
            var strictPath = [new CCS.Transition(action, destinationProcess)];

            // change the current node id to the next
            this.currentNodeId = choice.nextNode;

            if (player.getPlayType() == PlayType.Attacker) {
                const side = choice.move === 1 ? Move.Left : Move.Right; // choice.move is 1 for left transition and 2 for right transition in DG
                var sourceProcess = side === Move.Left ? previousConfig.left : previousConfig.right;
                this.gameLog.printPlay(player, action, sourceProcess, destinationProcess, side, this);

                this.lastAction = action;
                this.lastMove = side;

                this.saveCurrentProcess(destinationProcess, this.lastMove);
                this.preparePlayer(this.defender);
            } else {
                // the play is a defense, flip the saved last move
                this.lastMove = this.lastMove === Move.Right ? Move.Left : Move.Right;

                var sourceProcess = this.lastMove === Move.Left ? previousConfig.left : previousConfig.right;
                this.gameLog.printPlay(player, action, sourceProcess, destinationProcess, this.lastMove, this);

                this.saveCurrentProcess(destinationProcess, this.lastMove);

                this.round++;
                this.gameLog.printRound(this.round, this.getCurrentConfiguration());

                if (!this.cycleExists()) this.preparePlayer(this.attacker);

                if (this.defenderSuccessorGen instanceof Traverse.AbstractingSuccessorGenerator) {
                    strictPath = (<Traverse.AbstractingSuccessorGenerator>this.defenderSuccessorGen).getStrictPath(
                        sourceProcess.id,
                        action,
                        destinationProcess.id
                    );
                }
            }

            this.gameActivity.onPlay(strictPath, this.lastMove);
            this.gameActivity.centerNode(destinationProcess, this.lastMove);
        }

        protected createDependencyGraph(
            graph: CCS.Graph,
            currentLeft: any,
            currentRight: any
        ): dg.PlayableDependencyGraph {
            return (this.bisimulationDg = new Equivalence.BisimulationDG(
                this.attackerSuccessorGen,
                this.defenderSuccessorGen,
                this.currentLeft.id,
                this.currentRight.id
            ));
        }

        public getUniversalWinner(): Player {
            return this.bisimilar ? this.defender : this.attacker;
        }

        public getCurrentWinner(): Player {
            return this.marking.getMarking(this.currentNodeId) === this.marking.ONE ? this.attacker : this.defender;
        }

        protected override createMarking(): dg.LevelMarking {
            var marking = dg.solveDgGlobalLevel(this.bisimulationDg);
            this.bisimilar = marking.getMarking(0) === marking.ZERO;
            return marking;
        }
    }

    class SimulationGame extends DgComputerStrategy {
        private leftProcessName: string;
        private rightProcessName: string;
        private simulationDG: Equivalence.SimulationDG;
        private isSimilar: boolean;
        private attackerSuccessorGen: CCS.SuccessorGenerator;
        private defenderSuccessorGen: CCS.SuccessorGenerator;

        constructor(
            gameActivity: Game,
            graph: CCS.Graph,
            attackerSuccessorGen: CCS.SuccessorGenerator,
            defenderSuccessorGen: CCS.SuccessorGenerator,
            leftProcessName: string,
            rightProcessName: string,
            time: string,
            gameType: string
        ) {
            var currentLeft = graph.processByName(leftProcessName);
            var currentRight = graph.processByName(rightProcessName);

            super(
                gameActivity,
                new SimulationGameLog(time, gameActivity),
                graph,
                currentLeft,
                currentRight,
                gameType,
                time
            ); // creates dependency graph and marking

            this.leftProcessName = leftProcessName;
            this.rightProcessName = rightProcessName;
            this.attackerSuccessorGen = attackerSuccessorGen;
            this.defenderSuccessorGen = defenderSuccessorGen;
        }

        public getGameType(): string {
            return this.gameType;
        }

        public override startGame(): void {
            this.gameLog.printIntro(
                this.gameType,
                this.getCurrentConfiguration(),
                this.getUniversalWinner(),
                this.attacker
            );
            super.startGame();
        }

        public play(
            player: Player,
            choice: any,
        ): void {
            let action = choice.action ?? this.lastAction
            let destinationProcess = choice.targetProcess;
            var previousConfig = this.getCurrentConfiguration();
            var strictPath = [new CCS.Transition(action, destinationProcess)];

            // change the current node id to the next
            this.currentNodeId = choice.nextNode;

            if (player.getPlayType() == PlayType.Attacker) {
                const side = choice.move === 1 ? Move.Left : Move.Right; // choice.move is 1 for left transition and 2 for right transition in DG
                var sourceProcess = previousConfig.left;
                this.gameLog.printPlay(player, action, sourceProcess, destinationProcess, side, this);

                this.lastAction = action;
                this.lastMove = side;

                this.saveCurrentProcess(destinationProcess, this.lastMove);
                this.preparePlayer(this.defender);
            } else {
                this.lastMove = Move.Right;
                var sourceProcess = previousConfig.right;

                this.gameLog.printPlay(player, action, sourceProcess, destinationProcess, this.lastMove, this);

                this.saveCurrentProcess(destinationProcess, this.lastMove);

                this.round++;
                this.gameLog.printRound(this.round, this.getCurrentConfiguration());

                if (!this.cycleExists()) this.preparePlayer(this.attacker);

                if (this.defenderSuccessorGen instanceof Traverse.AbstractingSuccessorGenerator) {
                    var strictPath = (<Traverse.AbstractingSuccessorGenerator>this.defenderSuccessorGen).getStrictPath(
                        sourceProcess.id,
                        action,
                        destinationProcess.id
                    );
                }
            }

            this.gameActivity.onPlay(strictPath, this.lastMove);
            this.gameActivity.centerNode(destinationProcess, this.lastMove);
        }

        protected createDependencyGraph(
            graph: CCS.Graph,
            currentLeft: any,
            currentRight: any
        ): dg.PlayableDependencyGraph {
            return (this.simulationDG = new Equivalence.SimulationDG(
                this.attackerSuccessorGen,
                this.defenderSuccessorGen,
                this.currentLeft.id,
                this.currentRight.id
            ));
        }

        public getUniversalWinner(): Player {
            return this.isSimilar ? this.defender : this.attacker;
        }

        public getCurrentWinner(): Player {
            return this.marking.getMarking(this.currentNodeId) === this.marking.ONE ? this.attacker : this.defender;
        }

        protected override createMarking(): dg.LevelMarking {
            var marking = dg.solveDgGlobalLevel(this.simulationDG);
            this.isSimilar = marking.getMarking(0) === marking.ZERO;
            return marking;
        }
    }


    class ProbabilisticBisimulationGame extends BisimulationGame {
        constructor(
            gameActivity: Game,
            graph: PCCS.Graph,
            attackerSuccessorGen: PCCS.StrictSuccessorGenerator,
            defenderSuccessorGen: PCCS.StrictSuccessorGenerator,
            leftProcessName: string,
            rightProcessName: string,
            time: string,
            gameType: string
        ) {
            super(
                gameActivity,
                graph,
                attackerSuccessorGen,
                defenderSuccessorGen,
                leftProcessName,
                rightProcessName,
                time,
                gameType,
            ); // creates dependency graph and marking
        }

        public override startGame(): void {
            super.startGame();

            // TODO: insert extra stuff here
        }


        public override preparePlayer(player: Player) {
            var choices: any = this.getCurrentChoices(player.getPlayType());
            console.log('choices', choices);
            // determine if game is over
            if (choices.length === 0) {
                // the player to be prepared cannot make a move
                // the player to prepare has lost, announce it
                // this.gameLog.printWinner(player === this.attacker ? this.defender : this.attacker);

                // stop game
                this.stopGame();
            } else {
                // save the old winner, and then update who wins
                var oldWinner = this.currentWinner;
                this.currentWinner = this.getCurrentWinner();

                // if winner changed, let the user know
                if (oldWinner !== this.currentWinner) this.gameLog.printWinnerChanged(this.currentWinner);

                // tell the player to prepare for his turn
                player.prepareTurn(choices, this);
            }
        }

        // NOTE: IS THIS EVER USED?!?
        public prepareCoupling() {
            let choices = this.getCurrentChoices(PlayType.Attacker);
        }

        // used to detect cycles
        public override getConfigurationStr(configuration: any): string {
            var result = '(';

            result += this.graph.getLabel(configuration.left);
            result += ', ';
            result += this.graph.getLabel(configuration.right);
            result += ')';

            return result;
        }

        public override getCurrentChoices(playType: PlayType): dg.GameOptions[] {
            let bisimDG = this.dependencyGraph as dg.PlayableProbabilisticDG // safe type narrowing
            const nodeType = bisimDG.getNodeType(this.currentNodeId) as Equivalence.ProbDGNodeKind;

            switch (nodeType) {
                case Equivalence.ProbDGNodeKind.NoSide: // Attacker chooses side (L/R) and transition
                    return bisimDG.getAttackerOptions(this.currentNodeId);
                case Equivalence.ProbDGNodeKind.OneDistribution: // Defender chooses transition with same label as attacker's last action
                    return bisimDG.getDefenderOptions(this.currentNodeId);
                case Equivalence.ProbDGNodeKind.Distribution:
                    return bisimDG.getCouplingOptions(this.currentNodeId);
                case Equivalence.ProbDGNodeKind.Support:
                    return bisimDG.getSuppPairOptions(this.currentNodeId);
            }
            throw 'invalid node for choices'
        }

        public override play(
            player: Player,
            choice: dg.MoveGameOptions,
        ): void {
            console.log("PLAYING", player.playTypeStr(), choice)
            var previousConfig = this.getCurrentConfiguration();
            let destinationProcess = this.attackerSuccessorGen.getProcessById(choice.target);
            var strictPath = [new CCS.Transition(choice.action, destinationProcess)];

            // change the current node id to the next
            this.currentNodeId = choice.nextNode;


            if (player.getPlayType() == PlayType.Attacker) { // ATTACKER PLAYING
                if (choice.side === Move.Left) console.log("LEFT SIDE")
                else console.log("RIGHT SIDE")
                console.log("move", choice.side)
                var sourceProcess = choice.side === Move.Left ? previousConfig.left : previousConfig.right;
                // TODO: once we have the destination process (with ID), we can call this properly
                // this.gameLog.printPlay(player, action, sourceProcess, destinationProcess, move!, this);

                this.lastAction = choice.action;
                this.lastMove = choice.side;

                console.log("DESTINATION PROCESS", destinationProcess)
                this.saveCurrentProcess(destinationProcess, this.lastMove);
                this.gameActivity.highlightNodes();
                this.preparePlayer(this.defender);
            } else { // DEFENDER PLAYING
                // the play is a defense, flip the saved last move
                this.lastMove = this.lastMove === Move.Right ? Move.Left : Move.Right;

                var sourceProcess = this.lastMove === Move.Left ? previousConfig.left : previousConfig.right;
                // this.gameLog.printPlay(player, action, sourceProcess, destinationProcess, this.lastMove, this)
                console.log("DESTINATION PROCESS", destinationProcess)
                this.saveCurrentProcess(destinationProcess, this.lastMove);

                this.gameActivity.highlightNodes();
                // this.gameLog.printRound(this.round, this.getCurrentConfiguration());

                const choices = this.getCurrentChoices(null!) // playType is unused in PCCS
                this.defender.prepareCoupling(choices, this);

                if (this.defenderSuccessorGen instanceof Traverse.AbstractingSuccessorGenerator) {
                    strictPath = (<Traverse.AbstractingSuccessorGenerator>this.defenderSuccessorGen).getStrictPath(
                        sourceProcess.id,
                        choice.action,
                        destinationProcess.id
                    );
                }
            }

            // TODO: we need process instead of multiset if we have to use these functions
            this.gameActivity.onPlay(strictPath, this.lastMove);
            // this.gameActivity.centerNode(destinationProcess, this.lastMove);
        }

        public playCoupling(choice: dg.GameOptions) {
            this.currentNodeId = choice.nextNode;

            this.gameLog.printPCCSCoupling(choice.target, this.defender instanceof Human)
            const choices = this.getCurrentChoices(null!) as dg.SuppPairGameOptions[] // argument not needed in PCCS
            this.attacker.prepareSuppPair(choices, this)
        }

        public playSupportPair(nextNodePair: dg.SuppPairGameOptions) {
            this.currentLeft = this.attackerSuccessorGen.getProcessById(nextNodePair.left);
            this.currentRight = this.attackerSuccessorGen.getProcessById(nextNodePair.right);
            this.currentNodeId = nextNodePair.nextNode;


            this.gameLog.printPCCSSuppPair([nextNodePair.left, nextNodePair.right], this.attacker instanceof Human)

            this.round++;
            this.gameLog.printRound(this.round, this.getCurrentConfiguration());

            this.gameActivity.highlightNodes();
            this.preparePlayer(this.attacker);
            // detect cycle
        }

        public override computeMarking(): dg.LevelMarking {
            this.dependencyGraph = this.createDependencyGraph(this.graph, this.currentLeft, this.currentRight);
            this.marking = this.createMarking();
            return this.marking;
        }

        protected override createMarking(): dg.LevelMarking {
            return dg.liuSmolkaLocal2(this.currentNodeId, this.dependencyGraph);
        }

        protected override createDependencyGraph(
            graph: CCS.Graph,
            currentLeft: any,
            currentRight: any
        ): dg.PlayableProbabilisticDG {
            return (this.bisimulationDg = new Equivalence.ProbabilisticBisimDG(
                this.attackerSuccessorGen,
                this.currentLeft.id,
                this.currentRight.id,
            ));
        }
    }

    abstract class Player {
        constructor(private playType: PlayType) {
        }

        public prepareTurn(choices: any, game: DgGame): void {
            switch (this.playType) {
                case PlayType.Attacker: {
                    this.prepareAttack(choices, game);
                    break;
                }
                case PlayType.Defender: {
                    this.prepareDefend(choices, game);
                    break;
                }
            }
        }

        public getPlayType(): PlayType {
            return this.playType;
        }

        public abstract abortPlay(): void

        public playTypeStr(allLower: boolean = false): string {
            if (allLower) {
                return this.playType == PlayType.Attacker ? 'attacker' : 'defender';
            } else {
                return this.playType == PlayType.Attacker ? 'Attacker' : 'Defender';
            }
        }

        // only for PCCS
        // must be implemented by both human and computer and call this (super)
        public prepareCoupling(choices: any, game: DgGame): void {
            if (this.playType !== PlayType.Defender) {
                throw 'Attacker cannot create a coupling'
            } else if (game.InputMode !== InputMode.PCCS) {
                throw 'Cannot create a coupling for non PCCS processes'
            }
        }

        public prepareSuppPair(choices: any, game: DgGame): void {
            if (this.playType !== PlayType.Attacker) {
                throw 'Defender cannot select state pairs '
            } else if (game.InputMode !== InputMode.PCCS) {
                throw 'Cannot create select state pairs for non PCCS processes'
            }
        }

        /* Abstract methods */
        protected abstract prepareAttack(choices: any, game: DgGame): void
        protected abstract prepareDefend(choices: any, game: DgGame): void
    }

    class Human extends Player {
        private $table: JQuery;

        constructor(
            playType: PlayType,
            private gameActivity: Game
        ) {
            super(playType);

            this.$table = $('#game-transitions-table').find('tbody');
        }

        protected prepareAttack(choices: any, game: DgGame): void {
            if (game.isPCCS()) {
                this.fillTablePCCS(choices as dg.MoveGameOptions[], game, true);
            } else {
                this.fillTable(choices, game, true);
            }
            game.getGameLog().printPrepareAttack();
        }

        protected prepareDefend(choices: any, game: DgGame): void {
            if (game.isPCCS()) {
                this.fillTablePCCS(choices, game, false);
            } else {
                this.fillTable(choices, game, false);
            }
            game.getGameLog().printPrepareDefend(game.getLastMove());
        }

        public override prepareCoupling(choices: dg.GameOptions[], game: DgGame): void {
            super.prepareCoupling([], game) // only sanity check, does not care for choices
            console.log("PREPARING COUPLING")

            this.fillCouplingTable(choices, game)
            game.getGameLog().printPrepareCoupling()
        }

        public override prepareSuppPair(choices: dg.SuppPairGameOptions[], game: DgGame): void {
            super.prepareSuppPair([], game) // only sanity check, does not care for choices
            this.fillSuppPairTable(choices, game as ProbabilisticBisimulationGame)
            game.getGameLog().printPrepareSuppPair()
        }

        private fillCouplingTable(choices: dg.GameOptions[], game: DgGame): void {
            this.$table.empty();
            choices.forEach((choice) => {
                var row = $('<tr></tr>');
                row.attr('data-target-id', choice.target); // attach multiset that is dist

                let $sourceTd = $("<td id='source'></td>").append("source coupling");
                let $targetTd = $("<td id='target'></td>").append(choice.target);
                let $actionTd = $("<td id='action'></td>").append("choose coupling pls :)");

                // onClick
                $(row).on('click', (event) => {
                    this.clickCouplingChoice(choice, game as ProbabilisticBisimulationGame);
                });

                row.append($sourceTd, $targetTd);
                this.$table.append(row);
            });
        }

        private fillSuppPairTable(choices: dg.SuppPairGameOptions[], game: ProbabilisticBisimulationGame): void {
            this.$table.empty();
            choices.forEach((choice) => {
                var row = $('<tr></tr>');
                row.attr('data-target-id', choice.target); // attach multiset that is dist

                let $sourceTd = $("<td id='source'></td>").append("source pair");
                let $targetTd = $("<td id='target'></td>").append(choice.target);
                let $actionTd = $("<td id='action'></td>").append("choose next pair pls :)");

                // onClick
                $(row).on('click', (event) => {
                    this.clickSupportPairChoice(choice, game);
                });

                row.append($sourceTd, $targetTd);
                this.$table.append(row);
            });
        }

        private fillTable(choices: any, game: DgGame, isAttack: boolean): void {
            var currentConfiguration = game.getCurrentConfiguration();
            var actionTransition: string;
            console.log('choices in filtable', choices);

            if (!isAttack) {
                actionTransition = game.getTransitionStr(isAttack, game.getLastAction().toString(true));
                //  return '=' + action + '=>' + timedSubScript;
            }

            this.$table.empty();
            choices.forEach((choice) => {
                var row = $('<tr></tr>');
                row.attr('data-target-id', choice.targetProcess.id); // attach targetid on the row

                if (isAttack) {
                    var sourceProcess = choice.move == 1 ? currentConfiguration.left : currentConfiguration.right;
                    var $source = this.labelWithTooltip(sourceProcess);
                    actionTransition = game.getTransitionStr(isAttack, choice.action.toString(true));
                    var $actionTd = $("<td id='action'></td>").append(actionTransition);
                } else {
                    var sourceProcess =
                        game.getLastMove() == Move.Right ? currentConfiguration.left : currentConfiguration.right;
                    var $source = this.labelWithTooltip(sourceProcess);

                    if (game.hasAbstractions()) {
                        var abstractingSuccGen = <Traverse.AbstractingSuccessorGenerator>(
                            this.gameActivity.getSuccessorGenerator()
                        );
                        var $action = Tooltip.setTooltip(
                            Tooltip.wrap(actionTransition),
                            Tooltip.strongSequence(
                                abstractingSuccGen,
                                sourceProcess,
                                game.getLastAction(),
                                choice.targetProcess,
                                this.gameActivity.getGraph()
                            )
                        );
                        var $actionTd = $("<td id='action'></td>").append($action);
                    } else {
                        var $actionTd = $("<td id='action'></td>").append(actionTransition);
                    }
                }

                var $sourceTd = $("<td id='source'></td>").append($source);
                var $targetTd = $("<td id='target'></td>").append(this.labelWithTooltip(choice.targetProcess));

                // onClick
                $(row).on('click', (event) => {
                    this.clickChoice(choice, game, isAttack);
                });

                row.append($sourceTd, $actionTd, $targetTd);
                this.$table.append(row);
            });
        }

        private fillTablePCCS(choices: dg.MoveGameOptions[], game: DgGame, isAttack: boolean): void {
            const currentConfiguration = game.getCurrentConfiguration();
            this.$table.empty();
            choices.forEach((choice) => {
                var row = $('<tr></tr>');
                console.log('choice', choice);
                row.attr('data-target-id', choice.target); // attach multiset that is dist

                let sourceProcess
                if (isAttack) {
                    sourceProcess = choice.side == Move.Left ? currentConfiguration.left : currentConfiguration.right;
                } else {
                    sourceProcess = game.getLastMove() == Move.Left ? currentConfiguration.right : currentConfiguration.left;
                }

                let $source = this.labelWithTooltip(sourceProcess);
                let $sourceTd = $("<td id='source'></td>").append($source);
                let $targetTd = $("<td id='target'></td>").append(choice.target);

                // Display the action
                let $actionTd
                if (isAttack) {
                    $actionTd = $("<td id='action'></td>").append("-" + choice.action.toString(true) + "->");
                } else {
                    $actionTd = $("<td id='action'></td>").append("-" + game.getLastAction() + "->");
                }
                // onClick
                $(row).on('click', (event) => {
                    this.clickChoicePCCS(choice, game, isAttack);
                });

                row.append($sourceTd, $actionTd, $targetTd);
                this.$table.append(row);
            });
        }

        private clickChoicePCCS(choice: dg.GameOptions, game: DgGame, isAttack: boolean): void {
            this.$table.empty();
            if (isAttack) {
                let c = choice as dg.MoveGameOptions // type narrowing
                let move: Move = c.side == Move.Left ? Move.Left : Move.Right; // 1: left, 2: right
                game.play(this, choice);
            } else {
                game.play(this, choice);
            }
        }

        private clickCouplingChoice(choice: dg.GameOptions, game: ProbabilisticBisimulationGame): void {
            this.$table.empty();
            game.playCoupling(choice);
        }

        private clickSupportPairChoice(choice: dg.SuppPairGameOptions, game: ProbabilisticBisimulationGame): void {
            this.$table.empty();
            game.playSupportPair(choice);
        }

        private labelWithTooltip(process: CCS.Process): JQuery {
            return Tooltip.wrapProcess(this.labelFor(process));
        }

        private labelFor(process: CCS.Process): string {
            return this.gameActivity.labelFor(process);
        }

        private clickChoice(choice: any, game: DgGame, isAttack: boolean): void {
            this.$table.empty();
            if (isAttack) {
                var move: Move = choice.move === 1 ? Move.Left : Move.Right; // 1: left, 2: right
                game.play(this, choice);
            } else {
                game.play(this, choice);
            }
            this.gameActivity.removeHighlightChoices(true); // remove highlight from both graphs
            this.gameActivity.removeHighlightChoices(false); // remove highlight from both graphs
        }

        public abortPlay(): void {
            this.$table.empty();
        }
    }

    // such ai
    class Computer extends Player {
        // TODO: set this back to something more realistic when not debugging

        static Delay: number = 250;

        private delayedPlay: number | undefined;

        constructor(playType: PlayType) {
            super(playType);
        }

        public abortPlay(): void {
            clearTimeout(this.delayedPlay);
        }

        protected prepareAttack(choices: any, game: DgGame): void {
            // select strategy
            console.log("COMPUTER ATTACK", choices);
            if (game.isCurrentWinner(this))
                this.delayedPlay = setTimeout(() => this.winningAttack(choices, game), Computer.Delay);
            else this.delayedPlay = setTimeout(() => this.losingAttack(choices, game), Computer.Delay);
        }

        protected prepareDefend(choices: any, game: DgGame): void {
            // select strategy
            console.log("COMPUTER DEFEND", choices);
            if (game.isCurrentWinner(this))
                this.delayedPlay = setTimeout(() => this.winningDefend(choices, game), Computer.Delay);
            else this.delayedPlay = setTimeout(() => this.losingDefend(choices, game), Computer.Delay);
        }

        public override prepareCoupling(choices: dg.GameOptions[], game: ProbabilisticBisimulationGame): void {
            console.log("COMPUTER COUPLING", choices);
            super.prepareCoupling([], game)
            // select strategy
            if (game.isCurrentWinner(this))
                this.delayedPlay = setTimeout(() => this.winningCoupling(choices, game), Computer.Delay);
            else this.delayedPlay = setTimeout(() => this.losingCoupling(choices, game), Computer.Delay);
        }

        public override prepareSuppPair(choices: dg.SuppPairGameOptions[], game: ProbabilisticBisimulationGame): void {
            console.log("COMPUTER SUPPPAIR", choices);
            super.prepareSuppPair([], game)
            // select strategy
            if (game.isCurrentWinner(this))
                this.delayedPlay = setTimeout(() => this.winningSuppPair(choices, game), Computer.Delay);
            else this.delayedPlay = setTimeout(() => this.losingSuppPair(choices, game), Computer.Delay);
        }

        private winningCoupling(choices: any, game: ProbabilisticBisimulationGame) {
            console.log("winning coupling", choices);
            let choice = game.getWinningDefend(choices);
            game.playCoupling(choice);
        }

        private losingCoupling(choices: any, game: ProbabilisticBisimulationGame) {
            console.log("losing coupling", choices);
            let tryHardChoice = game.getTryHardDefend(choices);
            game.playCoupling(tryHardChoice);
        }

        private winningSuppPair(choices: any, game: ProbabilisticBisimulationGame) {
            console.log("winning supp pair", choices);
            let choice = game.getBestWinningAttack(choices);
            game.playSupportPair(choice);
        }

        private losingSuppPair(choices: any, game: ProbabilisticBisimulationGame) {
            console.log("losing supp pair", choices);
            let tryHardChoice = game.getTryHardAttack(choices);
            game.playSupportPair(tryHardChoice);
        }

        private losingAttack(choices: any, game: DgGame): void {
            var tryHardChoice = game.getTryHardAttack(choices);
            var move: Move = tryHardChoice.move == 1 ? Move.Left : Move.Right; // 1: left, 2: right
            game.play(this, tryHardChoice);
        }

        private winningAttack(choices: any, game: DgGame): void {
            var choice: any = game.getBestWinningAttack(choices);
            var move: Move = choice.move == 1 ? Move.Left : Move.Right; // 1: left, 2: right
            game.play(this, choice);
        }

        private losingDefend(choices: any, game: DgGame): void {
            var tryHardChoice = game.getTryHardDefend(choices);
            game.play(this, tryHardChoice);
        }

        private winningDefend(choices: any, game: DgGame): void {
            var choice = game.getWinningDefend(choices);
            game.play(this, choice);
        }
    }

    abstract class GameLog {
        private $log: JQuery;

        constructor(
            protected time: string,
            private gameActivity?: Game
        ) {
            this.$log = $('#game-log');
            this.$log.empty();
        }

        public println(line: string, wrapper?: string): void {
            if (wrapper) {
                this.$log.append($(wrapper).append(line));
            } else {
                this.$log.append(line);
            }

            this.$log.scrollTop(this.$log[0].scrollHeight);
        }

        public render(template: string, context: any): string {
            for (var i in context) {
                var current = context[i].text;

                if (context[i].tag) {
                    current = $(context[i].tag).append(current);

                    for (var j in context[i].attr) {
                        current.attr(context[i].attr[j].name, context[i].attr[j].value);
                    }

                    template = template.replace('{' + i + '}', current[0].outerHTML);
                } else {
                    template = template.replace('{' + i + '}', current);
                }
            }

            return template;
        }

        public removeLastPrompt(): void {
            this.$log.find('.game-prompt').last().remove();
        }

        public printRound(round: number, configuration: any): void {
            this.println('Round ' + round, "<h4 class='game-round'>");
            this.printConfiguration(configuration);
        }

        public printPrepareAttack() {
            this.println('Pick a transition on the left or the right.', "<p class='game-prompt'>");
        }

        public printPrepareDefend(lastMove: Move) {
            this.println(
                'Pick a transition on the ' + (lastMove === Move.Left ? 'right.' : 'left.'),
                "<p class='game-prompt'>"
            );
        }

        public printPrepareCoupling() {
            this.println('Pick a new game configuration.', "<p class='game-prompt'>");
        }

        public printPrepareSuppPair() {
            this.println('Pick a pair in the support of the current configuration.', "<p class='game-prompt'>");
        }

        public printConfiguration(configuration: any): void {
            var template = 'Current configuration: ({1}, {2}).';

            var context = {
                1: {
                    text: this.labelFor(configuration.left),
                    tag: '<span>',
                    attr: [{ name: 'class', value: 'ccs-tooltip-process' }]
                },
                2: {
                    text: this.labelFor(configuration.right),
                    tag: '<span>',
                    attr: [{ name: 'class', value: 'ccs-tooltip-process' }]
                }
            };

            this.println(this.render(template, context), '<p>');
        }

        public printPlay(
            player: Player,
            action: CCS.Action,
            source: CCS.Process,
            destination: CCS.Process,
            move: Move,
            game: DgGame
        ): void {
            var template = '{1} played {2} {3} {4} on the {5}.';

            var actionTransition: string;
            var actionContext: any;

            if (player.getPlayType() === PlayType.Attacker || !game.hasAbstractions()) {
                actionTransition = game.getTransitionStr(true, action.toString(true));
                actionContext = {
                    text: actionTransition,
                    tag: '<span>',
                    attr: [{ name: 'class', value: 'monospace' }]
                };
            } else {
                actionTransition = game.getTransitionStr(false, action.toString(true));
                actionContext = {
                    text: actionTransition,
                    tag: '<span>',
                    attr: [
                        { name: 'class', value: 'ccs-tooltip-data' },
                        {
                            name: 'data-tooltip',
                            value: Tooltip.strongSequence(
                                <Traverse.AbstractingSuccessorGenerator>this.gameActivity!.getSuccessorGenerator(),
                                source,
                                action,
                                destination,
                                this.gameActivity!.getGraph()
                            )
                        }
                    ]
                };
            }

            var context = {
                1: {
                    text: player instanceof Computer ? player.playTypeStr() : 'You (' + player.playTypeStr(true) + ')'
                },
                2: {
                    text: this.labelFor(source),
                    tag: '<span>',
                    attr: [{ name: 'class', value: 'ccs-tooltip-process' }]
                },
                3: actionContext,
                4: {
                    text: this.labelFor(destination),
                    tag: '<span>',
                    attr: [{ name: 'class', value: 'ccs-tooltip-process' }]
                },
                5: { text: move === Move.Left ? 'left' : 'right' }
            };

            if (player instanceof Human) {
                this.removeLastPrompt();
            }

            this.println(this.render(template, context), '<p>');
        }

        public printPCCSCoupling(
            // destination: [string, string][],
            destination: string,
            isHuman: boolean
        ): void {
            let template = '{1} picked a coupling with support {2}'

            let context = {
                1: { text: isHuman ? 'You (defender)' : 'Defender' },
                2: {
                    // text: "{" + destination.map(pair => "(" + pair.join(",") + ")").join(",") + "}"
                    text: destination
                }
            }
            if (isHuman)
                this.removeLastPrompt();

            this.println(this.render(template, context), '<p>');
        }
        public printPCCSSuppPair(
            pair: [string, string],
            isHuman: boolean
        ): void {
            let template = '{1} picked the pair {2} from the support of the current configuration'

            let context = {
                1: { text: isHuman ? 'You (defender)' : 'Defender' },
                2: {
                    text: "(" + pair.join(", ") + ")"
                }
            }
            if (isHuman)
                this.removeLastPrompt();

            this.println(this.render(template, context), '<p>');
        }

        public printWinner(winner: Player): void {
            var template = '{1} no available transitions. You {2}!';

            var context = {
                1: {
                    text:
                        winner instanceof Computer
                            ? 'You ({3}) have'
                            : winner.getPlayType() === PlayType.Attacker
                                ? 'Defender has'
                                : 'Attacker has'
                },
                2: { text: winner instanceof Computer ? 'lose' : 'win' },
                3: { text: winner.getPlayType() === PlayType.Attacker ? 'defender' : 'attacker' }
            };

            this.println(this.render(template, context), "<p class='outro'>");
        }

        public printCycleWinner(winner: Player): void {
            var template = 'A cycle has been detected. {1}!';

            var context = {
                1: { text: winner instanceof Human ? 'You (' + winner.playTypeStr(true) + ') win' : 'You ({2}) lose' },
                2: { text: winner.getPlayType() === PlayType.Attacker ? 'defender' : 'attacker' }
            };

            this.println(this.render(template, context), "<p class='outro'>");
        }

        public printWinnerChanged(winner: Player): void {
            var you = winner.getPlayType() === PlayType.Attacker ? 'defender' : 'attacker';
            this.println(
                'You (' + you + ') made a bad move. ' + winner.playTypeStr() + ' now has a winning strategy.',
                '<p>'
            );
        }

        private capitalize(str: string): string {
            return str.charAt(0).toUpperCase() + str.slice(1);
        }

        // protected labelFor(process: CCS.Process): string {
        protected labelFor(process: CCS.Process | MultiSetUtil.MultiSet<string>): string {
            if ('id' in process) {
                return this.gameActivity!.labelFor(process);
            } else { // is multiset
                return process.prettyPrint()
            }
        }

        public abstract printIntro(gameType: string, configuration: any, winner: Player, attacker: Player): void
    }

    class BisimulationGameLog extends GameLog {
        constructor(time: string, gameActivity?: Game) {
            super(time, gameActivity);
        }

        public printIntro(gameType: string, configuration: any, winner: Player, attacker: Player): void {
            var template = 'You are playing {1} in {2} {3} probabilistic bisimulation game.';

            var context = {
                1: { text: attacker instanceof Computer ? 'defender' : 'attacker' },
                2: { text: gameType },
                3: { text: this.time }
            };

            this.println(this.render(template, context), "<p class='intro'>");

            if (winner instanceof Human) {
                this.println('You have a winning strategy.', "<p class='intro'>");
            } else {
                this.println(
                    winner.playTypeStr() + ' has a winning strategy. You are going to lose.',
                    "<p class='intro'>"
                );
            }
        }
    }

    class SimulationGameLog extends GameLog {
        constructor(time: string, gameActivity?: Game) {
            super(time, gameActivity);
        }

        public printIntro(gameType: string, configuration: any, winner: Player, attacker: Player): void {
            var template = 'You are playing {1} in {2} {3} simulation game.';

            var context = {
                1: { text: attacker instanceof Computer ? 'defender' : 'attacker' },
                2: { text: gameType },
                3: { text: this.time }
            };

            this.println(this.render(template, context), "<p class='intro'>");

            if (winner instanceof Human) {
                this.println('You have a winning strategy.', "<p class='intro'>");
            } else {
                this.println(
                    winner.playTypeStr() + ' has a winning strategy. You are going to lose.',
                    "<p class='intro'>"
                );
            }
        }

        public override printPrepareAttack() {
            this.println('Pick a transition on the left.', "<p class='game-prompt'>");
        }

        public override printPrepareDefend(lastMove: Move) {
            this.println('Pick a transition on the right.', "<p class='game-prompt'>");
        }
    }
}
