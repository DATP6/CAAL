/* Grammar for Probabilistic Hennessey Milner Logic (PHML)
*  
*/

Start
    = Declarations

Declarations
    = Declaration _ Declarations
        / Declaration

Declaration
    = Variable "_max=" Phi
    / Variable"_min=" Phi
    / Variable "_max=" Formula
    / Variable"_min=" Formula

Formula
    = Disjunction

Disjunction
    = Conjunction(Whitespace "OR" Whitespace Disjunction) *
    / Conjunction(Whitespace "OR" Whitespace Phi)*

    Conjunction 
	= Modal(Whitespace "AND" Whitespace Conjunction) *

Modal
    = Phi_prob_term
    / Modal_prefix Atomic_term 
    / Modal_prefix Variable
    / Variable 
    / Atomic_term

Phi 
    = Phi_disjunction

Phi_disjunction
    = Phi_conjunction(Whitespace "OR" Whitespace Disjunction)*

Phi_conjunction
    = Phi_prob_term(Whitespace "AND" Whitespace Conjunction)*

Phi_prob_term
    = Modal_prefix Diamond "_" Probability Phi_prob_term Variable
    / Modal_prefix Diamond "_" Probability Formula

Variable
	= [A-Z]

Labels 
    = Label Whitespace Labels 
    / Label
Label 
    = [A-Z,a-z]+
    / [-]

Modal_prefix
    = "<" Labels ">" 
    / "[" Labels "]"

Logic_op
    = "AND"
    / "OR"

Atomic_term
    = "tt"
    / "ff"

Diamond 
    = "<>"

Probability
    = [0]"."[0-9]*
    / [1]

Whitespace "whitespace"
    = [ \t]

Comment "comment" = "*" [^\r\n]* "\r"? "\n"?

//Useful utility
_ = (Whitespace / Newline)* Comment _
  / (Whitespace / Newline)*

Newline "newline"
    = "\r\n" / "\n" / "\r"
