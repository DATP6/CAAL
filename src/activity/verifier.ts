/// <reference path="../../lib/jquery.d.ts" />
/// <reference path="../main.ts" />
/// <reference path="../gui/project.ts" />
/// <reference path="../gui/property.ts" />
/// <reference path="activity.ts" />

module Activity {

    export class Verifier extends Activity {
        private project: Project;
        private changed : boolean
        private editor: any;
        private addPropertyList: JQuery;
        private propertyTableBody: JQuery;
        private verifyAllButton: JQuery;
        private verifyStopButton: JQuery;
        private currentVerifyingProperty = null;
        private clockInterval;
        private propsToVerify = [];
        private startTime;
        private propertyForms = {};
        private formulaEditor : any;

        constructor(container: string, button: string) {
            super(container, button);

            this.project = Project.getInstance();
            this.addPropertyList = $("#add-property");
            this.propertyTableBody = $("#property-table").find("tbody");
            this.verifyAllButton = $("#verify-all");
            this.verifyStopButton = $("#verify-stop");

            this.addPropertyList.find("li.property-item").on("click", (e) => this.addProperty(e));
            this.verifyAllButton.on("click", () => {
                this.verifyAllButton.prop("disabled", true);
                this.verifyAll() 
                });
            this.verifyStopButton.on("click", () => {
                this.propsToVerify = [];
                if (this.currentVerifyingProperty) {
                    try {
                        this.currentVerifyingProperty.abortVerification();
                    } catch (error) {
                        console.log("Error stopping verification of property " + this.currentVerifyingProperty + ": " + error);
                    }
                    this.verifactionEnded(PropertyStatus.unknown);
                }
            });

            $(document).on("ccs-changed", () => this.changed = true); // on CCS change event (reset everything)

            this.editor = ace.edit("hml-editor");
            this.editor.setTheme("ace/theme/crisp");
            this.editor.getSession().setMode("ace/mode/hml");
            this.editor.getSession().setUseWrapMode(true);
            this.editor.setOptions({
                enableBasicAutocompletion: true,
                showPrintMargin: false,
                fontSize: 14,
                fontFamily: "Inconsolata"
            });

            this.formulaEditor = ace.edit("hml-formula");
            this.formulaEditor.setTheme("ace/theme/crisp");
            this.formulaEditor.getSession().setMode("ace/mode/hml");
            this.formulaEditor.getSession().setUseWrapMode(true);
            this.formulaEditor.setOptions({
                enableBasicAutocompletion: true,
                showPrintMargin: false,
                fontSize: 14,
                fontFamily: "Inconsolata",
                showLineNumbers: false,
                minLines: 1,
                maxLines: 1
            });

            this.propertyForms = 
            {
                hml :
                    {
                        container : $("#model-checking"),
                        processList : $("#hml-process"),
                    }, 
                distinguishing :
                    {
                        container : $("#distinguishing-formula"),
                        firstProcessList : $('#distinguishing-first-process'),
                        secondProcessList : $('#distinguishing-second-process'),
                    }, 
                equivalence : 
                    {
                        container : $("#equivalence"),
                        firstProcessList : $("#equivalence-first-process"),
                        secondProcessList : $("#equivalence-second-process"),
                    }
            };
        }

        protected checkPreconditions(): boolean {
            var graph = Main.getGraph();

            if (!graph) {
                this.showExplainDialog("Syntax Error", "Your program contains one or more syntax errors.");
                return false;
            } else if (graph.getNamedProcesses().length === 0) {
                this.showExplainDialog("No Named Processes", "There must be at least one named process in the program.");
                return false;
            }

            return true;
        }

        public onShow(configuration?: any): void {
            if (this.changed) {
                this.changed = false;
                // If project has changed check whether the properties are still valid? Meaning that their processes are still defined,
                // Also check wether the actions exists in used in the ccs program. (low prio)
                var properties = this.project.getProperties();
                var processList = Main.getGraph().getNamedProcesses()
                //$("#equivalence").hide(); // hide the equivalence box(process selector), since it might have the wrong data 
                //$("#model-checking").hide(); // hide the model-checking(HMl process selector) box, since it might have the wrong data
                properties.forEach((property : Property.Property) => {
                    if (property instanceof Property.Equivalence) {
                        if (processList.indexOf(property.getFirstProcess()) === -1 || processList.indexOf(property.getSecondProcess()) === -1 ) {
                            // If process is not in list of named processes, show the red triangle
                            property.setInvalidateStatus("One of the processes selected is not defined in the CCS program.")
                        }
                        else {
                            property.setUnknownStatus(); // Otherwise set the unknown status
                        }
                    }
                    else if (property instanceof Property.DistinguishingFormulaSuper) {
                        var temp : Property.DistinguishingFormulaSuper = <Property.DistinguishingFormulaSuper> property;
                        if (processList.indexOf(temp.getFirstProcess()) === -1 || processList.indexOf(temp.getSecondProcess()) === -1 ) {
                            // If process is not in list of named processes, show the red triangle
                            temp.setInvalidateStatus("One of the processes selected is not defined in the CCS program.")
                        }
                        else {
                            temp.setUnknownStatus(); // Otherwise set the unknown status
                        }
                    }
                    else if (property instanceof Property.HML) {
                        if (processList.indexOf(property.getProcess()) === -1) {
                            // If process is not in list of named processes, show the red triangle
                            property.setInvalidateStatus("The processes selected is not defined in the CCS program.")
                        }
                        else {
                            property.setUnknownStatus(); // Otherwise set the unknown status
                        }
                    }
                });
            }

            this.displayProperties(); // update the properties table
        }

        public onHide() : void {
            for (var propertyForm in this.propertyForms) {
                this.propertyForms[propertyForm].container.hide();
            }
        }

        public displayProcessList(processes: string[], list: JQuery, selected: string): void {
            list.empty();

            for (var i = 0; i < processes.length; i++) {
                if (processes[i] === selected) {
                    list.append($("<option selected></option").append(processes[i]));
                } else {
                    list.append($("<option></option").append(processes[i]));
                }
            }

            if (!selected) {
                // select the first element in the list
                list.prop("selectedIndex", 0);
            }
        }

        public displayProperties(): void {
            var properties = this.project.getProperties();
            this.propertyTableBody.empty();
            

            for (var i = 0; i < properties.length; i++) {
                var toolMenuOptions = {
                    "edit": {
                        id:"property-edit",
                        label: "Edit",
                        click: (e) => this.editProperty(e)
                    }, 
                    "delete": {
                        id: "property-delete",
                        label: "Delete",
                        click: (e) => this.deleteProperty(e)
                    },
                    "play": {
                        id: "property-playgame",
                        label: "Play",
                        click: (e) => this.playGame(e)
                    }
                };

                var rowClickHandlers = {
                    "collapse" : {
                        id:"property-collapse",
                        click : null,
                    },
                    "status" : {
                        id : "property-status",
                        click : (e) => this.playGame(e)
                    },
                    "description": {
                        id : "property-description",
                        click : (e) => this.editProperty(e)
                    },
                    "verify": {
                        id : "property-verify",
                        click : (e) => this.verify(e)
                    }
                }

                var propertyRows = null;
                if (properties[i] instanceof Property.DistinguishingFormulaSuper) {
                    /* distinguishing formula */
                    var onCollapseClick = (e) => {
                        if(e.data.property.isExpanded()){
                            this.onCollapse(e);
                            e.data.property.setExpanded(false);
                        } else {
                            this.onExpand(e);
                            e.data.property.setExpanded(true);
                        }
                        this.displayProperties()
                    };  
                    toolMenuOptions.play.click = null; // you can't play on a distinguishing formula.
                    rowClickHandlers.collapse.click = onCollapseClick;
                    properties[i].setRowClickHandlers(rowClickHandlers)
                    properties[i].setToolMenuOptions(toolMenuOptions);
                    propertyRows = properties[i].toTableRow();
                }
                else if (properties[i] instanceof Property.StrongTraceInclusion || properties[i] instanceof Property.WeakTraceInclusion || properties[i] instanceof Property.WeakTraceEq || properties[i] instanceof Property.StrongTraceEq) {
                    toolMenuOptions.play.click = null;
                    rowClickHandlers.status.click = null;
                    properties[i].setRowClickHandlers(rowClickHandlers)
                    properties[i].setToolMenuOptions(toolMenuOptions)
                    propertyRows = properties[i].toTableRow();
                }
                else {
                    /* Strong/Weak bisim and HML*/
                    properties[i].setRowClickHandlers(rowClickHandlers)
                    properties[i].setToolMenuOptions(toolMenuOptions)
                    propertyRows = properties[i].toTableRow();
                }

                propertyRows.forEach((row) => {
                    this.propertyTableBody.append(row);
                });                
            }
        }

        public onCollapse(e) {
            if (e.data.property instanceof Property.DistinguishingFormulaSuper) {
                var firstProperty = e.data.property.getFirstHML();
                var firstHMLid = firstProperty.getId();
                var firstHMLRow = this.propertyTableBody.find("#" + firstHMLid);
                firstHMLRow.hide();
                
                var secondProperty = e.data.property.getSecondHML();
                var secondHMLid = secondProperty.getId();
                var secondHMLRow = this.propertyTableBody.find("#" + secondHMLid);
                secondHMLRow.hide();
            } else {
                throw "Cannot collapse this property"
            }
        }

        public onExpand(e) {
            if (e.data.property instanceof Property.DistinguishingFormulaSuper) {
                var firstHMLid = e.data.property.getFirstHML().getId();
                var firstHMLRow = this.propertyTableBody.find("#" + firstHMLid);
                firstHMLRow.show();
                
                var secondHMLid = e.data.property.getSecondHML().getId();
                var secondHMLRow = this.propertyTableBody.find("#" + secondHMLid);
                secondHMLRow.show();

            } else {
                throw "Cannot expand this property"
            }
        }


        public addProperty(e): void {
            var type = e.currentTarget.id;
            var property = null;

            switch(type) {
                case "strong":
                    property = new Property.StrongBisimulation({firstProcess: "", secondProcess: ""});
                    break;
                case "weak":
                    property = new Property.WeakBisimulation({firstProcess: "", secondProcess: ""});
                    break;
                case "strongtraceinclusion":
                    property = new Property.StrongTraceInclusion(
                        {
                            firstHMLProperty: {process: "", topFormula: "", definitions: ""},
                            secondHMLProperty: {process: "", topFormula: "", definitions: ""}
                        });
                    break;
                case "weaktraceinclusion":
                    property = new Property.WeakTraceInclusion(
                        {
                            firstHMLProperty: {process: "", topFormula: "", definitions: ""}, 
                            secondHMLProperty: {process: "", topFormula: "", definitions: ""}
                        });
                    break;
                case "strongtraceeq":
                    property = new Property.StrongTraceEq({firstProcess: "", secondProcess: ""});
                    break;
                case "weaktraceeq":
                    property = new Property.WeakTraceEq({firstProcess: "", secondProcess: ""});
                    break;
                case "hml":
                    property = new Property.HML({process: "", topFormula: "", definitions: ""});
                    break;
                case "distinguishing-strong":
                    property = new Property.DistinguishingFormula(
                        {
                            firstHMLProperty: {process: "", topFormula: "", definitions: ""}, 
                            secondHMLProperty: {process: "", topFormula: "", definitions: ""},
                            succGenType: "strong"
                        });
                    break;
                case "distinguishing-weak":
                    property = new Property.DistinguishingFormula(
                        {
                            firstHMLProperty: {process: "", topFormula: "", definitions: ""}, 
                            secondHMLProperty: {process: "", topFormula: "", definitions: ""},
                            succGenType: "weak"
                        });
                    break;
            }

            this.project.addProperty(property);
            this.displayProperties();
            this.editProperty({data: {property: property}});
        }

        private playGame(e){
            var property = e.data.property;
            if (property instanceof Property.Equivalence) {
                if(property.status === PropertyStatus.satisfied || property.status === PropertyStatus.unsatisfied) {       
                    var equivalence = <Property.Equivalence> property,
                        gameType = (equivalence instanceof Property.StrongBisimulation) ? "strong" : "weak",
                        playerType = (equivalence.getStatus() === PropertyStatus.satisfied) ? "attacker" : "defender",
                        configuration = {
                            gameType: gameType,
                            playerType: playerType,
                            leftProcess: equivalence.firstProcess,
                            rightProcess: equivalence.secondProcess
                        };
                    Main.activityHandler.selectActivity("game", configuration);
                }
            }
        }

        private showPropertyForm(processFormName : string) {
            var result = null;
            for (var key in this.propertyForms){
                if (key === processFormName){
                    result = this.propertyForms[key];
                    result.container.show();
                } else {
                    this.propertyForms[key].container.hide();
                }
            }

            return result;
        }

        public editProperty(e): void {
            var property = e.data.property;

            var CCSProcessList = Main.getGraph().getNamedProcesses();
            CCSProcessList.reverse();

            if (property instanceof Property.Equivalence) {
                var equivalenceForm = this.showPropertyForm("equivalence");

                this.displayProcessList(CCSProcessList, equivalenceForm.firstProcessList, property.getFirstProcess());
                this.displayProcessList(CCSProcessList, equivalenceForm.secondProcessList, property.getSecondProcess());

                if (property.getFirstProcess() !== equivalenceForm.firstProcessList.val()){
                    property.setFirstProcess(equivalenceForm.firstProcessList.val()); // Re-set the chosen process, since the process might have been deleted
                }
                if (property.getSecondProcess() !== equivalenceForm.secondProcessList.val()){
                    property.setSecondProcess(equivalenceForm.secondProcessList.val()); // Re-set the chosen process, since the process might have been deleted
                }
                this.displayProperties(); // update the process table

                equivalenceForm.firstProcessList.off("change");
                equivalenceForm.firstProcessList.on("change", () => {
                    // On change, set the process.
                    property.setFirstProcess(equivalenceForm.firstProcessList.val());
                    this.displayProperties();
                });

                equivalenceForm.secondProcessList.off("change");
                equivalenceForm.secondProcessList.on("change", () => {
                    // On change, set the process.
                    property.setSecondProcess(equivalenceForm.secondProcessList.val());
                    this.displayProperties();
                });
            } else if (property instanceof Property.HML) {
                var hmlForm = this.showPropertyForm("hml");

                this.displayProcessList(CCSProcessList, hmlForm.processList, property.getProcess());

                if (property.getProcess() !== hmlForm.processList.val()) {
                    property.setProcess(hmlForm.processList.val()); // Re-set the chosen process, since the process might have been deleted
                    this.displayProperties(); // update the process table
                }

                hmlForm.processList.off("change");
                hmlForm.processList.on("change", () => {
                    property.setProcess(hmlForm.processList.val());
                    this.displayProperties();
                });

                this.editor.removeAllListeners("change");
                this.formulaEditor.removeAllListeners("change");
                this.editor.setValue(property.getDefinitions(), 1);
                this.formulaEditor.setValue(property.getTopFormula(), 1);

                this.updateHeight();
                this.editor.focus();

                this.editor.on("change", () => {
                    property.setDefinitions(this.editor.getValue());
                    this.displayProperties();
                    this.updateHeight();
                });

                this.formulaEditor.on("change", () => {
                    property.setTopFormula(this.formulaEditor.getValue());
                    this.displayProperties();
                    this.updateHeight();
                });
            } else if (property instanceof Property.DistinguishingFormulaSuper){
                var distinguishingForm = this.showPropertyForm("distinguishing");

                this.displayProcessList(CCSProcessList, distinguishingForm.firstProcessList, property.getFirstProcess());
                this.displayProcessList(CCSProcessList, distinguishingForm.secondProcessList, property.getSecondProcess());

                if (property.getFirstProcess() !== distinguishingForm.firstProcessList.val()){
                    property.setFirstProcess(distinguishingForm.firstProcessList.val()); // Re-set the chosen process, since the process might have been deleted
                }
                if (property.getSecondProcess() !== distinguishingForm.secondProcessList.val()){
                    property.setSecondProcess(distinguishingForm.secondProcessList.val()); // Re-set the chosen process, since the process might have been deleted
                }

                this.displayProperties(); // update the process table

                distinguishingForm.firstProcessList.off("change");
                distinguishingForm.firstProcessList.on("change", () => {
                    // On change, set the process.
                    property.setFirstProcess(distinguishingForm.firstProcessList.val());
                    this.displayProperties();
                });

                distinguishingForm.secondProcessList.off("change");
                distinguishingForm.secondProcessList.on("change", () => {
                    // On change, set the process.
                    property.setSecondProcess(distinguishingForm.secondProcessList.val());
                    this.displayProperties();
                });
            }
        }

        public deleteProperty(e): void {
            e.stopPropagation();
            this.project.deleteProperty(e.data.property);
            this.displayProperties();
        }

        private verifactionEnded(result? : PropertyStatus) {
            this.verifyAllButton.prop("disabled", false);
            this.verifyStopButton.prop("disabled", true);
            this.currentVerifyingProperty = null;
            this.displayProperties();
            this.doNextVerification();
        }

        private doNextVerification() {
            if (!this.currentVerifyingProperty && this.propsToVerify.length > 0) {
                var property = this.propsToVerify.shift();
                this.verify({data: {property: property}});
            }
        }

        public verify(e): void {
            var property = (e.data.property instanceof Property.Property) ? e.data.property : null;

            /* Start to verify a property row*/
            this.verifyAllButton.prop("disabled", true);
            this.verifyStopButton.prop("disabled", false); // enable the stop button
            this.currentVerifyingProperty = property; // the current verifying property
            property.verify(this.verifactionEnded.bind(this));
        }

        public verifyAll(): void {
            var numProperties = this.project.getProperties();
            this.queuePropertiesToVerification(numProperties);
            this.doNextVerification();
        }

        public queuePropertiesToVerification(properties : Property.Property[]) {
            properties.forEach((property) => this.propsToVerify.push(property));
        }
        
        private updateHeightForEditor(editor, id) : void {
            var newHeight = editor.getSession().getScreenLength() * editor.renderer.lineHeight + editor.renderer.scrollBar.getWidth();
            $("#" + id).height(newHeight.toString() + "px");
            $("#" + id + "-section").height(newHeight.toString() + "px");
            editor.resize();
        }

        // http://stackoverflow.com/questions/11584061/
        private updateHeight(): void {
            this.updateHeightForEditor(this.editor, "hml-editor");
            this.updateHeightForEditor(this.formulaEditor, "hml-formula");

            // var newHeight =
            //           this.editor.getSession().getScreenLength()
            //           * this.editor.renderer.lineHeight
            //           + this.editor.renderer.scrollBar.getWidth();

            // $('#hml-editor').height(newHeight.toString() + "px");
            // $('#hml-editor-section').height(newHeight.toString() + "px");

            // // This call is required for the editor to fix all of
            // // its inner structure for adapting to a change in size
            // this.editor.resize();

        }
    }
}
