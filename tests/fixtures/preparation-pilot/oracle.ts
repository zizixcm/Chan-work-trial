/** Independent expected outcomes. Never supplied to a model/provider or fixture builder. */
export const gold = [
 {pending:[],readiness:'not_ready',unmet:['R1.months','R2.cash','R3.loi','R4.reports','R4.review','R5.execution'],unknown:['R1.population','R2.reconciliation','R2.availability','R3.acceptance','R4.acceptance']},
 {pending:['R3.acceptance'],readiness:'not_ready',unmet:['R4.reports','R4.review','R5.execution'],unknown:['R1.population','R2.reconciliation','R2.availability','R4.acceptance']},
 {pending:['R2.availability','R3.acceptance','R4.acceptance'],readiness:'not_ready',unmet:['R5.execution'],unknown:[]},
 {pending:['R2.availability','R3.acceptance','R4.acceptance'],readiness:'appears_ready',unmet:[],unknown:[]},
 {pending:['R2.availability','R3.acceptance','R4.acceptance'],readiness:'not_ready',unmet:['R1.months'],unknown:[]},
 {pending:['R2.availability','R3.acceptance','R4.acceptance'],readiness:'appears_ready',unmet:[],unknown:[]},
] as const;
export const facts = {
 historicalMarch:{source:'d01',page:1,quote:'B1; March 2026'},
 mayIsNotApril:{source:'d08',page:1,quote:'prior cycle April'},
 retirementIsNotCash:{source:'d03',page:1,quote:'Roth retirement account'},
 wrongTransaction:{source:'d05',page:1,quote:'Pine Court LLC; 90 Pine Road'},
 invoiceNotReport:{source:'d06',page:1,quote:'this is an invoice'},
 blankExecution:{source:'d07',page:3,quote:'signature: __________'},
 changedExecution:{source:'d19',page:3,quote:'signature: Alex Vale'},
 revisedReport:{source:'d17',page:24,quote:'July 14, 2026'},
 reviewOnlyA:{source:'d18',page:2,quote:'Report A only'},
 borrowerAssertion:{source:'d20',page:1,quote:'Borrower Alex Vale states'},
} as const;
