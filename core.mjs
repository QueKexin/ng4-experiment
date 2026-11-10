// Experiment rules and data transformations, independent of the browser UI.
export const CLEAN_FIELDS = ['session','participant','experiment_version','engine','phase','trial_id',
  'trial_number','stimulus','condition','distance','correct_response','response','correct','rt_seconds',
  'age','gender','native_language','second_language','other_number_languages','major','math_courses','strategy','comments'];
export const DEMOGRAPHIC_MAP = {age:'age',gender:'gender',language:'native_language',
  second_language:'second_language',other_language:'other_number_languages',major:'major',math:'math_courses',
  strategy:'strategy',comments:'comments'};

export function seededRandom(seed) {
  let state=seed>>>0;
  return () => { state+=0x6D2B79F5; let t=state; t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
}
export function shuffle(items,rng=Math.random) {
  const result=items.map(x=>({...x}));
  for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export class Learning {
  constructor(pool,rng=Math.random) {
    if(pool.length!==20||new Set(pool.map(t=>t.trial_id)).size!==20)
      throw new Error('Magnitude learning requires all 20 unique comparison questions.');
    this.pool=pool;this.rng=rng;this.block=0;this.attempts=0;this.failed=0;this.passed=false;
    this.newBlock();
  }
  newBlock(){this.block++;this.position=0;this.order=shuffle(this.pool,this.rng);}
  current(){return this.order[this.position];}
  answer(key){
    if(this.passed)throw new Error('Learning is already complete.');
    const trial=this.current();const correct=key===trial.correct_key;
    const result={...trial,phase:'learning',presentation_order:++this.attempts,
      learning_cycle:this.block,learning_block_trial:this.position+1,response:key,correct:Number(correct)};
    if(!correct){this.failed++;this.newBlock();}
    else if(++this.position===20)this.passed=true;
    return result;
  }
}
export function responseText(key,trial={}){
  const statement=['learning','comparison'].includes(trial.phase)&&/^\w+ > \w+$/.test(trial.stimulus??'');
  return (statement?{s:'Correct',k:'Incorrect'}:{s:'Yes',k:'No'})[key]??key;
}
export function sameSelection(selection,expected){
  return selection.size===expected.length&&expected.every(i=>selection.has(i));
}
export function cleanRows(rows,meta,answers={}){
  return rows.map(row=>{
    const result=Object.fromEntries(CLEAN_FIELDS.map(field=>[field,'']));
    Object.assign(result,{session:meta.session,participant:meta.participant,experiment_version:meta.version,
      engine:'browser',phase:row.phase,trial_id:row.trial_id,trial_number:row.presentation_order,
      stimulus:row.stimulus,condition:row.condition,distance:row.distance??'',
      correct_response:responseText(row.correct_key,row),response:responseText(row.response,row),
      correct:row.correct,rt_seconds:row.rt_seconds});
    for(const [id,field] of Object.entries(DEMOGRAPHIC_MAP)){
      const answer=answers[id];
      result[field]=answer?.status==='answered'?(answer.other||(answer.value??'')):'';
    }
    return result;
  });
}
export function passingRows(rows,learning){
  if(!learning?.passed)return [];
  const result=rows.filter(r=>r.phase==='learning'&&r.learning_cycle===learning.block);
  if(result.length!==20||new Set(result.map(r=>r.trial_id)).size!==20||result.some(r=>r.correct!==1))
    throw new Error('The passing block must contain 20 unique correct responses.');
  return result;
}
export function payload(rows,meta,answers,learning){
  const clean=cleanRows(rows,meta,answers);
  const passed=passingRows(rows,learning);
  // "condition" is reserved by Proliferate's own export; retain the experimental condition separately.
  const trials=clean.map(({condition,...row})=>({...row,trial_condition:condition}));
  const demographics=Object.fromEntries(Object.entries(DEMOGRAPHIC_MAP).map(([id,field])=>{
    const a=answers[id];return [field,a?.status==='answered'?(a.other||(a.value??'')):''];
  }));
  return {trials,subject_information:{...demographics,session:meta.session,experiment_version:meta.version,
    content_sha256:meta.content_sha256,seed:meta.seed,started_at:meta.started_at,completed_at:meta.completed_at,
    duration_seconds:meta.duration_seconds,questionnaire_version:meta.questionnaire_version,
    learning_blocks:learning.block,learning_failures:learning.failed,learning_passed_block:learning.block,
    passed_trial_numbers:JSON.stringify(passed.map(r=>r.presentation_order)),
    timing_details_json:JSON.stringify(rows.map(r=>({phase:r.phase,trial_number:r.presentation_order,
      learning_block:r.learning_cycle??null,block_position:r.learning_block_trial??null,
      focus_losses:r.focus_losses??0,hidden_during_trial:r.hidden_during_trial??false,
      rt_valid:r.rt_valid??true,onset_ms:r.onset_ms??null}))),
    browser:meta.browser,screen:meta.screen,fullscreen_entered:meta.fullscreen_entered??false}};
}
export function csv(rows,fields=CLEAN_FIELDS){
  const escape=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  return '\uFEFF'+[fields.map(escape).join(','),...rows.map(row=>fields.map(f=>escape(row[f])).join(','))].join('\r\n');
}
export function validateContent(content){
  const order=['Pog','Gom','Jop','Zok','Lod'];
  if(JSON.stringify(content.powers)!==JSON.stringify(order))throw new Error('Unexpected Power ordering.');
  if(content.comparisons.length!==20||content.judgments.length!==60)throw new Error('Trial counts are incorrect.');
  if(content.config.learning_consecutive_correct!==20||content.config.learning_pass_rule!=='restart_on_error_perfect_block')
    throw new Error('Incorrect learning criterion.');
  for(const trial of content.comparisons){
    const [,a,b]=trial.stimulus.match(/^(\w+) > (\w+)$/)||[];
    if(!order.includes(a)||!order.includes(b)||a===b||trial.distance!==Math.abs(order.indexOf(a)-order.indexOf(b))||
      trial.correct_key!==(order.indexOf(a)>order.indexOf(b)?'s':'k'))throw new Error('Invalid comparison: '+trial.trial_id);
  }
  return content;
}
