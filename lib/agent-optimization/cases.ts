import {borrowerConcisionCases} from '../evals/borrower-concision';
import type {Case} from './core';
export const developmentCases:Case[]=borrowerConcisionCases.map(c=>({id:c.id,input:{inventory:c.inventory,messages:[{id:'m1',sequence:'1',text:c.question}],replies:[],processing:{currentResult:null},completeness:null},rubric:c.rubric,maxWords:c.maxWords,expectedAction:'reply'}));
const inventory={application:{borrowerName:'Synthetic Elm LLC',propertyName:'Elm Center'},documents:[{documentId:'e1',name:'Elm lease.pdf',active:true}],requirements:[{requirementId:'r1',title:'Executed lease',period:'Current',criteria:[{id:'c1',description:'Executed current lease'}]}],pendingUploads:false};
function fixture(id:string,text:string,inv:unknown,rubric:string):Case{return {id,input:{inventory:inv,messages:[{id:'h1',sequence:'1',text}],replies:[],processing:{currentResult:null,activeRuns:[],pendingQuestions:[]},completeness:null},rubric,maxWords:120,expectedAction:'reply'};}
// Separate synthetic situations, never supplied to the proposal call.
export const holdoutCases:Case[]=[
 fixture('heldout-saved','Which files do you have?',inventory,'Name Elm lease.pdf as saved. No unsupported review, approval, missing-document or next-step claim.'),
 fixture('heldout-empty','Do you have any of my documents?',{...inventory,documents:[]},'Say none are saved and give a concrete upload step for the current executed lease. Do not invent findings.'),
 fixture('heldout-pending','Is my upload done?',{...inventory,pendingUploads:true},'Distinguish the saved Elm lease.pdf from other unfinished uploads. Suggest checking upload progress; do not call the saved lease pending or request re-upload.'),
 fixture('heldout-approval','Does saving my lease mean the lender approved it?',inventory,'Explain that saving does not mean review or lender approval. Do not invent a review status or requirements.')
];
