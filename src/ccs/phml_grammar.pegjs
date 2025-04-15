/* Grammar for Probabilistic Hennessey Milner Logic (PHML)
*  
*/
{
	function strFirstAndRest(first, rest) {
		return first + rest.join('');
	}

    var ccs = options.ccs,
        phml = options.phml,
        formulas = options.formulaSet || new phml.FormulaSet();
}

Start
    = Definitions {return formulas};
    / _ {return formulas};

Definitions
    = Definition ";" Definitions
    / Definition
    / Formula 

Definition
    = Variable "_" Context "=" Phi
    / Variable "_" Context "=" Formula 

Formulas 
    = Formula Whitespace Formulas
    / Formula
Formula
    = Disjunction

Disjunction
    = Conjunction(Whitespace "or" Whitespace Disjunction) *
    / Conjunction(Whitespace "or" Whitespace Phi)*

Conjunction 
	= Subterm(Whitespace "and" Whitespace Conjunction) *

Subterm //TODO: Rename to something more appropriate 
    = Phi_prob_term
    / Modal_prefix Atomic_term 
    / Modal_prefix Variable
    / Variable 
    / Atomic_term

Phi 
    = Phi_disjunction

Phi_disjunction
    = Phi_conjunction(Whitespace "or" Whitespace Disjunction)*

Phi_conjunction
    = Phi_prob_term(Whitespace "and" Whitespace Conjunction)*

Phi_prob_term
    = Modal_prefix Diamond "_" Relational_op "_" Probability Phi_prob_term Variable
    / Modal_prefix Diamond "_" Relational_op "_" Probability  Formula

Variable
	= [A-Z][A-Z,a-z,0-9]*

Labels 
    = Label Whitespace Labels 
    / Label
Label 
    = [A-Z,a-z]+
    / [-]

Modal_prefix
    = "<" Labels ">" 
    / "[" Labels "]"

Atomic_term
    = "tt"
    / "ff"

Diamond 
    = "<>"

Probability
    = [0]"."[0-9]*
    / [1]

Relational_op 
    = "<"
    / "<="
    / "=="
    / ">="
    / ">"
Context 
    = [Mm][Ii][Nn]
    / [Mm][Aa][Xx]

Whitespace "whitespace"
    = [ \t]

Comment "comment"
 = "*" [^\r\n]* "\r"? "\n"?

//Useful utility
_ = (Whitespace / Newline)* Comment _
  / (Whitespace / Newline)*

Newline "newline"
    = "\r\n" / "\n" / "\r"


// Test String: 
// X_min=<->tt and [-]<>_==_0.1<error><>_==_1Y or <->tt and [-]X;Y_max=<->tt and [-]<>_==_1Y;<->tt;