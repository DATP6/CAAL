/* Grammar for Probabilistic Hennessey Milner Logic (PHML)*/

{
	function strFirstAndRest(first, rest) {
		return first + rest.join('');
	}

    var ccs = options.ccs,
        hml = options.hml,
        formulas = options.formulaSet || new hml.FormulaSet();
}

start
	= Ps:Statements _ { return formulas; }
	/ F:SimpleFormula _ ";" _ { return formulas; } //TODO: Hack until multiple versions of syntax checker.
	/ _ { return formulas; }

Statements = P:FixedPoint _ ";" Qs:Statements { return [P].concat(Qs); }
		   / P:FixedPoint _ (";" _)? { return [P]; }

TopFormula = F:SimpleFormula _ ";"_ { formulas.setTopFormula(F); return F;} 

SimpleFormula = P:Disjunction _ { var f = formulas.unnamedMinFixedPoint(P); return f; }

SimplePhiFormula = P:PhiDisjunction _ {return P;}

FixedPoint = _ V:Variable _ [mM][aA][xX] "=" _ P:Disjunction { return formulas.newMaxFixedPoint(V, P); }
		   / _ V:Variable _ [mM][iI][nN] "=" _ P:Disjunction { return formulas.newMinFixedPoint(V, P); }
           / _ V:Variable _ [mM][aA][xX] "=" _ Pd:PhiDisjunction { return formulas.newMaxFixedPoint(V, Pd); }
           / _ V:Variable _ [mM][iI][nN] "=" _ Pd:PhiDisjunction { return formulas.newMinFixedPoint(V, Pd); }
           

Disjunction = P:Conjunction Whitespace _ "or" Whitespace _ Q:Disjunction { return Q instanceof hml.DisjFormula ? formulas.newDisj([P].concat(Q.subFormulas)) : formulas.newDisj([P, Q]); }
			/ P:Conjunction { return P; }

Conjunction = M:Modal Whitespace _ "and" Whitespace _ P:Conjunction { return P instanceof hml.ConjFormula ? formulas.newConj([M].concat(P.subFormulas)) : formulas.newConj([M, P]); }
			/ M:Modal { return M; }

PhiDisjunction = P:PhiConjunction Whitespace _ "or" Whitespace _ Q:PhiDisjunction { return Q instanceof hml.DisjFormula ? formulas.newDisj([P].concat(Q.subFormulas)) : formulas.newDisj([P, Q]); }
			/ P:PhiConjunction { return P; }

PhiConjunction = M:Modal Whitespace _ "and" Whitespace _ P:Conjunction { return P instanceof hml.ConjFormula ? formulas.newConj([M].concat(P.subFormulas)) : formulas.newConj([M, P]); }
			/ M:Modal { return M; }

PhiConjunction
    = PhiProbTerm Whitespace _ "and" Whitespace Conjunction
    / PhiProbTerm

Modal = _ "[" _ "[" _ AM:ActionList _ "]" _ "]" _ F:Modal { return formulas.newWeakForAll(AM, F); }
	  / _ "<" _ "<" _ AM:ActionList _ ">" _ ">" _ F:Modal { return formulas.newWeakExists(AM, F); }
      / _ "[" _ AM:ActionList _ "]" _ F:Modal { return formulas.newStrongForAll(AM, F); }
	  / _ "<" _ AM:ActionList _ ">" _ F:Modal { return formulas.newStrongExists(AM, F); }
	  / Unary

PhiProbTerm
    = Modal Diamond _ Relational_op _ Probability Phi_prob_term Variable
    / Modal Diamond _ Relational_op _ Probability Formula

//Order important!
Unary "term"
      = ParenFormula
	  / _ "tt" { return formulas.newTrue(); }
	  / _ "ff" { return formulas.newFalse(); }
	  / _ V:Variable { return formulas.referVariable(V); }
	  / _ "T" { return formulas.newTrue(); }
	  / _ "F" { return formulas.newFalse(); }

ParenFormula = _ "(" _ F:Disjunction _ ")" { return F; }

Variable "variable"
	= letter:[A-EG-SU-Z] rest:IdentifierRestSym* { return strFirstAndRest(letter, rest); }
	/ letter:[FT] rest:IdentifierRestSym+ { return strFirstAndRest(letter, rest); }

IdentifierRestSym
	= [A-Za-z0-9?!_'\-#]

ActionList = A:Action _ "," _ AM:ActionList { return AM.add(A); }
		   / A:Action { return new hml.SingleActionMatcher(A); }
		   / "-" { return new hml.AllActionMatcher(); }

Action "action"
    = ['] label:Label { return new ccs.Action(label, true); }
    / label:Label { return new ccs.Action(label, false); }

//Valid name for actions
Label "label"
    = first:[a-z] rest:IdentifierRestSym* { return strFirstAndRest(first, rest); }


/**** Utiliy Section ****/ 
Whitespace "whitespace"
    = [ \t]

Comment "comment" = "*" [^\r\n]* "\r"? "\n"?

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
