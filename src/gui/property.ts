/// <reference path="../main.ts" />
/// <reference path="../../lib/ccs.d.ts" />

enum PropertyStatus { satisfied, unsatisfied, invalid, unknown };

module Property {

    export class Property {
        private static counter: number = 0;
        protected id: number;
        private error: string = "";
        private timer: number;
        private elapsedTime: string;
        private $timeCell: JQuery;
        private $row: JQuery;
        protected project: Project;
        protected worker;
        protected comment: string;
        protected status: PropertyStatus;

        public constructor(status: PropertyStatus = PropertyStatus.unknown) {
            this.project = Project.getInstance();
            this.status = status;
            this.id = Property.counter;
            Property.counter++;
        }

        public getId(): number {
            return this.id;
        }

        public getStatus(): PropertyStatus {
            return this.status;
        }

        public getError(): string {
            return this.error;
        }

        public getComment(): string {
            return this.comment;
        }

        public getRow(): JQuery {
            return this.$row;
        }

        public setRow($row: JQuery): void {
            this.$row = $row;
        }

        public setTimeCell($timeCell: JQuery): void {
            this.$timeCell = $timeCell;
        }

        public getElapsedTime(): string {
            return this.elapsedTime;
        }

        public startTimer() {
            var startTime = new Date().getTime();

            var updateTimer = () => {
                this.elapsedTime = new Date().getTime() - startTime + " ms";
                this.$timeCell.text(this.elapsedTime);
            }

            this.timer = setInterval(updateTimer, 25);
        }

        public stopTimer() {
            clearInterval(this.timer);
        }

        protected setInvalidateStatus(error?: string): void {
            this.error = error;
            this.status = PropertyStatus.invalid;
        }

        public setUnknownStatus(): void {
            this.status = PropertyStatus.unknown;
            this.elapsedTime = "";
        }

        public abortVerification(): void {
            this.worker.terminate();
            this.worker = null;
            this.stopTimer();
            this.setUnknownStatus();
        }

        public verify(callback: Function): void {
            if (!this.isReadyForVerification()) {
                console.log("something is wrong, please check the property");
                callback(this);
                return;
            }

            this.startTimer();

            var program = this.project.getCCS();
            var inputMode = InputMode[this.project.getInputMode()];
            this.worker = new Worker("lib/workers/verifier.js");

            this.worker.postMessage({
                type: "program",
                program: program,
                inputMode: inputMode
            });

            this.worker.postMessage(this.getWorkerMessage());

            this.worker.addEventListener("error", (error) => {
                this.worker.terminate();
                this.worker = null;
                this.setInvalidateStatus(error.message);
                this.stopTimer();
                callback(this);
            }, false);

            this.worker.addEventListener("message", event => {
                this.workerFinished(event, callback);
            });
        }

        protected workerFinished(event: any, callback: Function): void {
            this.worker.terminate();
            this.worker = null;

            this.onWorkerFinished(event);

            this.stopTimer();
            callback(this); /* verification ended */
        }

        protected onWorkerFinished(event: any): void {
            var res = (typeof event.data.result === "boolean") ? event.data.result : PropertyStatus.unknown;
            if (res === true) {
                this.status = PropertyStatus.satisfied;
            }
            else if (res === false) {
                this.status = PropertyStatus.unsatisfied;
            }
            else {
                this.status = res;
            }
        }

        protected getWorkerMessage(): any { throw "Not implemented by subclass"; }
        public getDescription(): string { throw "Not implemented by subclass"; }
        public toJSON(): any { throw "Not implemented by subclass"; }
        public isReadyForVerification(): boolean { throw "Not implemented by subclass"; }
        public getGameConfiguration(): any { throw "Not implemented by subclass"; }
    }

    export class HML extends Property {
        private process: string;
        private definitions: string;
        private topFormula: string;

        public constructor(options: any, status: PropertyStatus = PropertyStatus.unknown) {
            super(status);
            this.process = options.process;
            this.definitions = options.definitions;
            this.topFormula = options.topFormula;
            this.comment = options.comment;
        }

        public getProcess(): string {
            return this.process;
        }

        public getTopFormula(): string {
            return this.topFormula;
        }

        public setTopFormula(formula: string): void {
            this.topFormula = formula;
            this.setUnknownStatus();
        }

        public getDefinitions(): string {
            return this.definitions;
        }

        public getDescription(): string {
            var formula = this.topFormula.replace(";", "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

            var definitions = this.definitions.split(";").map(function(d) {
                return "<span>" + d.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim() + "</span>";
            });

            return this.process + " &#8872; " + formula + '\n' + definitions.join("\n");
        }

        public getGameConfiguration(): any {
            var formulaSetForProperty = this.project.getFormulaSetForProperty(this);
            var HmlConfiguration = Object.create(null),
                graph: ccs.Graph = this.project.getGraph();

            HmlConfiguration.succGen = CCS.getSuccGenerator(this.project.getGraph(), { inputMode: InputMode[this.project.getInputMode()], succGen: "strong", reduce: false });
            HmlConfiguration.processName = this.process;
            HmlConfiguration.propertyId = this.id;
            HmlConfiguration.formulaId = formulaSetForProperty.getTopFormula().id;

            return HmlConfiguration;
        }

        public toJSON(): any {
            return {
                className: "HML",
                status: this.status,
                options: {
                    process: this.process,
                    definitions: this.definitions,
                    topFormula: this.topFormula,
                    comment: this.comment
                }
            };
        }
        /**
         * Checks whehter the process is defined, and the property is not invalid, and the HML syntactically correct.
         * @return {boolean} if true everything is defined correctly.
         */
        public isReadyForVerification(): boolean {
            var isReady = true;
            var error = "";
            if (!this.getProcess()) {
                isReady = false;
                error = "There is no process selected.";
            } else {
                // if they are defined check whether they are defined in the CCS-program
                var processList = this.project.getGraph().getNamedProcesses()
                if (processList.indexOf(this.getProcess()) === -1) {
                    error = "The processes selected is not defined in the CCS program.";
                    isReady = false;
                }
            }

            /**
             * HML syntax check (simple)
             * complete syntax check are done by the worker, it will post a error if the hml syntax did not parse. 
             */
            if (!this.topFormula || this.topFormula === "") {
                error = "Formula is not defined.";
                isReady = false;
            }


            // Check all process constants defined
            // Same as in worker/verifier
            var inputMode = this.project.getInputMode();
            function readFormulaSet(data): hml.FormulaSet {
                var formulaSet = new hml.FormulaSet();
                switch (inputMode) {
                    case InputMode.CCS:
                        HMLParser.parse(data.definitions, { ccs: CCS, hml: hml, formulaSet: formulaSet });
                        HMLParser.parse(data.formula, { startRule: "TopFormula", ccs: CCS, hml: hml, formulaSet: formulaSet });
                        break;
                    case InputMode.PCCS:
                        HMLParser.parse(data.definitions, { ccs: CCS, pccs: PCCS, hml: hml, formulaSet: formulaSet });
                        HMLParser.parse(data.formula, { startRule: "TopFormula", ccs: CCS, pccs: PCCS, hml: hml, formulaSet: formulaSet });
                        break;
                    case InputMode.TCCS:
                        THMLParser.parse(data.definitions, { ccs: CCS, tccs: TCCS, hml: hml, formulaSet: formulaSet });
                        THMLParser.parse(data.formula, { startRule: "TopFormula", ccs: CCS, tccs: TCCS, hml: hml, formulaSet: formulaSet });
                        break;
                }
                return formulaSet;
            }

            var formulaSet = null;
            if (isReady) {
                try {
                    formulaSet = readFormulaSet(this.getWorkerMessage());
                } catch (err) {
                    //Ignore handle below in case failed without exception
                }
                if (!formulaSet) {
                    isReady = false;
                    error = "Unable to parse formula and/or variable definitions";
                }
                if (isReady) {
                    var formulaEventWalker = new Traverse.FormulaEventWalker();
                    var definitions = Object.create(null);
                    var variables = Object.create(null);
                    formulaEventWalker.on('enterMinFixedPoint', def => definitions[(<any>def).variable] = true);
                    formulaEventWalker.on('enterMaxFixedPoint', def => definitions[(<any>def).variable] = true);
                    formulaEventWalker.on('enterVariable', ref => variables[(<any>ref).variable] = true);
                    formulaEventWalker.visit(formulaSet);

                    // Remove defined variables, leftovers are undefined.
                    Object.keys(definitions).forEach(definedVar => delete variables[definedVar]);
                    var undefinedVars = Object.keys(variables);
                    if (undefinedVars.length > 0) {
                        isReady = false;
                        error = "The following variables are undefined: '" + undefinedVars.join("', '") + "'.";
                    }
                }
            }

            if (!isReady) {
                this.setInvalidateStatus(error);
            }

            return isReady;
        }

        protected getWorkerMessage(): any {
            return {
                type: "checkFormula",
                processName: this.process,
                useStrict: false,
                definitions: this.definitions,
                formula: this.topFormula
            };
        }
    }

    export class Relation extends Property {
        protected propertyType;
        protected firstProcess: string;
        protected secondProcess: string;
        protected type: string;
        protected time: string;

        public constructor(options: any, status: PropertyStatus = PropertyStatus.unknown) {
            super(status);
            this.firstProcess = options.firstProcess;
            this.secondProcess = options.secondProcess;
            this.type = options.type;
            this.time = options.time;
            this.comment = options.comment;
        }

        public getFirstProcess(): string {
            return this.firstProcess;
        }

        public getSecondProcess(): string {
            return this.secondProcess;
        }

        public getType(): string {
            return this.type;
        }

        public getTime(): string {
            return this.time;
        }

        protected getTimeSubscript(): string {
            if (this.project.getInputMode() === InputMode.TCCS) {
                return "<sub>" + (this.time === "untimed" ? "u" : "t") + "</sub>";
            } else {
                return "";
            }
        }

        public getGameConfiguration(): any {
            return {
                leftProcess: this.firstProcess,
                rightProcess: this.secondProcess,
                type: this.type,
                time: this.time ? this.time : "",
                relation: this.getClassName(),
                playerType: this.status === PropertyStatus.satisfied ? "attacker" : "defender"
            };
        }

        public toJSON(): any {
            return {
                className: this.getClassName(),
                status: this.status,
                options: {
                    type: this.type,
                    time: this.time,
                    firstProcess: this.firstProcess,
                    secondProcess: this.secondProcess,
                    comment: this.comment
                }
            };
        }

        protected getWorkerMessage(): any {
            return {
                type: this.getWorkerHandler(),
                time: this.time,
                leftProcess: this.firstProcess,
                rightProcess: this.secondProcess
            };
        }

        /**
         * Check whether both process(first and second) is defined, and it exists in the CCS program.
         * And property status must not be invalid.
         * @return {boolean} if true, everything is defined.
         */
        public isReadyForVerification(): boolean {
            var isReady = true;
            var error = "";

            if (!this.getFirstProcess() && !this.getSecondProcess()) {
                isReady = false;
                error = "Two processes must be selected"
            } else {
                // if they are defined check whether they are defined in the CCS-program
                var processList = this.project.getGraph().getNamedProcesses()
                if (processList.indexOf(this.getFirstProcess()) === -1 || processList.indexOf(this.getSecondProcess()) === -1) {
                    isReady = false;
                    error = "One of the processes is not defined in the CCS program."
                }
            }

            if (!isReady) {
                this.setInvalidateStatus(error);
            }

            return isReady
        }

        protected getClassName(): string { throw "Not implemented by class"; }
        protected getWorkerHandler(): string { throw "Not implemented by subclass"; }
    }

    export class DistinguishingFormula extends Relation {
        public constructor(options: any, status: PropertyStatus = PropertyStatus.unknown) {
            super(options, status);
        }

        public generateDistinguishingFormula(generationEnded: Function): void { throw "Not implemented by subclass"; }
    }

    export class Bisimulation extends DistinguishingFormula {
        public constructor(options: any, status: PropertyStatus = PropertyStatus.unknown) {
            super(options, status);
        }

        public generateDistinguishingFormula(generationEnded: Function): void {
            // start the worker, and make the worker generationEnded with the result.
            var program = this.project.getCCS();
            this.worker = new Worker("lib/workers/verifier.js");

            this.worker.postMessage({
                type: "program",
                program: program,
                inputMode: InputMode[this.project.getInputMode()]
            });

            this.worker.postMessage({
                type: "findDistinguishingFormula",
                leftProcess: this.getFirstProcess(),
                rightProcess: this.getSecondProcess(),
                succGenType: super.getType()
            });

            this.worker.addEventListener("error", (error) => {
                this.worker.terminate();
                this.worker = null;
                this.setInvalidateStatus(error.message);
                this.stopTimer();
                generationEnded();
            }, false);

            this.worker.addEventListener("message", event => {
                this.worker.terminate();
                this.worker = null;

                if (!event.data.result.isBisimilar) { //this should be false, for there to be distinguishing formula
                    var properties = {
                        firstProperty: new HML({ process: this.firstProcess, topFormula: event.data.result.formula, definitions: "" }),
                        secondProperty: new HML({ process: this.secondProcess, topFormula: event.data.result.formula, definitions: "" })
                    }

                    generationEnded(properties);
                    // this.verifyHml(event.data.result.formula);
                } else {
                    this.setInvalidateStatus("The two selected processes are bisimilar, and no distinguishing formula exists.");
                    this.stopTimer()
                    generationEnded();
                }
            });
        }

        public getDescription(): string {
            var symbol = super.getType() === "strong" ? "&#8764;" : "&#8776;";
            return this.firstProcess + " " + symbol + super.getTimeSubscript() + " " + this.secondProcess;
        }

        public getClassName(): string {
            return "Bisimulation";
        }

        protected getWorkerHandler(): string {
            return super.getType() === "strong" ? "isStronglyBisimilar" : "isWeaklyBisimilar";
        }
    }

    export class Simulation extends Relation {
        public constructor(options: any, status: PropertyStatus = PropertyStatus.unknown) {
            super(options, status);
        }

        public getDescription(): string {
            var symbol = super.getType() === "strong" ? "&#8594;" : "&#8658;";
            return this.firstProcess + " sim<sub>" + symbol + super.getTimeSubscript() + "</sub> " + this.secondProcess;
        }

        public getClassName(): string {
            return "Simulation";
        }

        protected getWorkerHandler(): string {
            return super.getType() === "strong" ? "isStronglySimilar" : "isWeaklySimilar";
        }
    }

    export class SimulationEquivalence extends Relation {
        public constructor(options: any, status: PropertyStatus = PropertyStatus.unknown) {
            super(options, status);
        }

        public getDescription(): string {
            var symbol = super.getType() === "strong" ? "&#8771;" : "&#8778;";
            return this.firstProcess + " " + symbol + super.getTimeSubscript() + " " + this.secondProcess;
        }

        public getGameConfiguration(): any {
            return null;
        }

        public getClassName(): string {
            return "SimulationEquivalence";
        }

        protected getWorkerHandler(): string {
            return super.getType() === "strong" ? "isStronglySimulationEquivalent" : "isWeaklySimulationEquivalent";
        }
    }

    export class Traces extends DistinguishingFormula {
        private formula: string = null;

        constructor(options: any, status: PropertyStatus) {
            super(options, status);
        }

        public getGameConfiguration(): any {
            return null;
        }

        protected workerFinished(event: any, callback: Function): void {
            this.formula = event.data.result.formula;
            event.data.result = event.data.result.isSatisfied;
            super.workerFinished(event, callback)
        }

        public generateDistinguishingFormula(generationEnded: Function): void {
            // formula should already be generated when the formula was verified
            if (this.formula !== null) {
                var properties = {
                    firstProperty: new HML({ process: this.firstProcess, topFormula: this.formula, definitions: "" }),
                    secondProperty: new HML({ process: this.secondProcess, topFormula: this.formula, definitions: "" })
                }
                generationEnded(properties);
            } else {
                generationEnded();
            }
        }
    }

    export class TraceEquivalence extends Traces {
        constructor(options: any, status: PropertyStatus = PropertyStatus.unknown) {
            super(options, status);
        }

        public getDescription(): string {
            var symbol = super.getType() === "strong" ? "&#8594;" : "&#8658;";
            return "Traces<sub>" + symbol + super.getTimeSubscript() + "</sub>(" + this.firstProcess + ") = Traces<sub>" + symbol + super.getTimeSubscript() + "</sub>(" + this.secondProcess + ")";
        }

        public getClassName(): string {
            return "TraceEquivalence";
        }

        protected getWorkerHandler(): string {
            return super.getType() === "strong" ? "isStronglyTraceEq" : "isWeaklyTraceEq";
        }
    }

    export class TraceInclusion extends Traces {
        constructor(options: any, status: PropertyStatus = PropertyStatus.unknown) {
            super(options, status);
        }

        public getDescription(): string {
            var symbol = super.getType() === "strong" ? "&#8594;" : "&#8658;";
            return "Traces<sub>" + symbol + super.getTimeSubscript() + "</sub>(" + this.getFirstProcess() + ") &sube; Traces<sub>" + symbol + super.getTimeSubscript() + "</sub>(" + this.getSecondProcess() + ")";
        }

        public getClassName(): string {
            return "TraceInclusion";
        }

        protected getWorkerHandler(): string {
            return super.getType() === "strong" ? "isStronglyTraceIncluded" : "isWeaklyTraceIncluded";
        }
    }
}
