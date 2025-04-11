/* Grammar for Probabilistic Hennessey Milner Logic (PHML)
*  
*/

Start
    = Declarations End

Declarations
    = Declaration Whitespace Declarations
        / Declaration

Declaration
    = [A - Z]"_max=" Formula
        / [A - Z]"_min=" Formula

Formula
    = Disjunction
Disjunction
    = Conjunction(Whitespace "OR" Whitespace Disjunction) *
    Conjunction 
	= Atomic_term(Whitespace "AND" Whitespace Conjunction) *
    Variable
	=[A - Z]
Logic_op
    = "AND"
    / "OR"
Atomic_term
    = "tt"
    / "ff"

Whitespace "whitespace"
    = [\t]
End
    = ";"