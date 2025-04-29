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

PhiConjunction = Pt:PhiProbTerm Whitespace _ "and" Whitespace _ P:Conjunction { return P instanceof hml.ConjFormula ? formulas.newConj([Pt].concat(P.subFormulas)) : formulas.newConj([Pt, P]); }
			/ Pt:PhiProbTerm { return Pt; }

Modal = _ "[" _ "[" _ AM:ActionList _ "]" _ "]" _ F:SimplePhiFormula { return formulas.newWeakForAll(AM, F); }
	  / _ "<" _ "<" _ AM:ActionList _ ">" _ ">" _ F:SimplePhiFormula { return formulas.newWeakExists(AM, F); }
      / _ "[" _ AM:ActionList _ "]" _ F:SimplePhiFormula { return formulas.newStrongForAll(AM, F); }
	  / _ "<" _ AM:ActionList _ ">" _ F:SimplePhiFormula { return formulas.newStrongExists(AM, F); }
	  / Unary


// Additions
PhiProbTerm
    = Diamond _ R:Relational_op P:Probability _ S:SimpleFormula {return formulas.newDiamondFormula(R,P,S);}
	/ PhiUnary 

PhiUnary 
	= PhiParenFormula
	/ _ "tt" { return formulas.newTrue(); }
	/ _ "ff" { return formulas.newFalse(); }
	/ _ "T" { return formulas.newTrue(); }
	/ _ "F" { return formulas.newFalse(); }

PhiParenFormula
	= _ "(" _ F:PhiDisjunction _ ")" { return F; }
// ----

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

/**** Utiliy Section ****/ 
Action "action"
    = ['] label:Label { return new ccs.Action(label, true); }
    / label:Label { return new ccs.Action(label, false); }

Label "label"
    = first:[a-z] rest:IdentifierRestSym* { return strFirstAndRest(first, rest); }

Whitespace "whitespace"
    = [ \t]

Comment "comment" = "*" [^\r\n]* "\r"? "\n"?

//Useful utility
_ = (Whitespace / Newline)* Comment _
  / (Whitespace / Newline)*

Newline "newline"
    = "\r\n" / "\n" / "\r"

Integer
    = I:[0-9]+ { return formulas.newInteger(I); }

Diamond 
    = "<>"

Probability
    = N:Integer"/"D:Integer { return formulas.newProbability(N, D) }

Relational_op 
    = S:"<=" { return formulas.newRelationalOp(S); }
    / S:"<" { return formulas.newRelationalOp(S); }
    // = S:"<" { return formulas.newRelationalOp(S); }
    // / S:"<=" { return formulas.newRelationalOp(S); }
    / S:"==" { return formulas.newRelationalOp(S); }
    / S:">=" { return formulas.newRelationalOp(S); }
    / S:">" { return formulas.newRelationalOp(S); }

